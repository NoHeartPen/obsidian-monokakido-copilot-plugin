import { App, ButtonComponent, Modal, Notice, Setting } from 'obsidian';
import { DictionaryBackupError, parseDictionaryLinks, readDictionaryBackupFile } from '../utils/dictionary-backup-utils';
import type { DictionaryLinks } from '../utils/dictionary-backup-utils';

export class DictionaryImportModal extends Modal {
	private isClosed = false;
	constructor(
		app: App,
		private readonly mode: 'paste' | 'file',
		private readonly apply: (links: DictionaryLinks, backupCurrent: boolean) => Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		this.isClosed = false;
		this.setTitle(this.mode === 'paste' ? 'JSON を貼り付けてインポート' : 'JSON ファイルをインポート');
		const { contentEl } = this;
		contentEl.addClass('monokakido-dictionary-import');
		contentEl.createEl('p', { text: 'デフォルトの辞書と追加辞書を、バックアップの内容に置き換えます。その他の設定は変更しません。' });
		const textInput = this.mode === 'paste'
			? contentEl.createEl('textarea', {
				cls: 'monokakido-dictionary-import-text',
				attr: { 'aria-label': '辞書リンクの JSON', rows: '10', placeholder: 'JSON をここに貼り付けてください。' },
			}) : null;
		const fileInput = this.mode === 'file'
			? contentEl.createEl('input', {
				type: 'file',
				attr: { accept: '.json,application/json', 'aria-label': '辞書リンクの JSON ファイル' },
			}) : null;

		new Setting(contentEl)
			.addButton(button => button.setButtonText('キャンセル').onClick(() => this.close()))
			.addButton(button => button
				.setButtonText('インポート')
				.setCta()
				.onClick(async () => {
					button.setDisabled(true);
					if (textInput) textInput.disabled = true;
					if (fileInput) fileInput.disabled = true;
					try {
						const file = fileInput?.files?.[0];
						if (fileInput && !file) {
							new Notice('JSON ファイルを選択してください。');
							return;
						}
						const links = file
							? await readDictionaryBackupFile(file)
							: parseDictionaryLinks(textInput?.value ?? '');
						if (this.isClosed) return;
						this.showBackupConfirmation(links);
					} catch (error: unknown) {
						if (error instanceof DictionaryBackupError) {
							new Notice(error.message);
						} else {
							console.error('Failed to import dictionary links:', error);
							new Notice('インポートできませんでした。ファイルの読み取り権限や保管庫への書き込み権限を確認してください。');
						}
					} finally {
						button.setDisabled(false);
						if (textInput) textInput.disabled = false;
						if (fileInput) fileInput.disabled = false;
					}
				}));
		(textInput ?? fileInput)?.focus();
	}

	private showBackupConfirmation(links: DictionaryLinks): void {
		this.setTitle('現在の辞書設定を保存しますか？');
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('p', {
			text: 'インポートすると、現在の辞書設定が置き換えられます。バックアップは保管庫のルートに、日時付きの JSON ファイルとして保存されます。',
		});
		const buttons: ButtonComponent[] = [];
		const actions = new Setting(contentEl);
		actions.addButton(button => {
			buttons.push(button);
			button.setButtonText('キャンセル').onClick(() => this.close());
		});
		for (const choice of [
			{ text: '保存せずにインポート', backup: false },
			{ text: 'バックアップしてインポート', backup: true },
		]) {
			actions.addButton(button => {
				buttons.push(button);
				button.setButtonText(choice.text).onClick(async () => {
					for (const control of buttons) control.setDisabled(true);
					try {
						await this.apply(links, choice.backup);
						new Notice('辞書リンクをインポートしました。');
						this.close();
					} catch (error: unknown) {
						console.error('Failed to back up or import dictionary links:', error);
						new Notice('辞書設定を保存できませんでした。保管庫への書き込み権限を確認して、もう一度お試しください。');
					} finally {
						for (const control of buttons) control.setDisabled(false);
					}
				});
				if (choice.backup) {
					button.setCta();
					button.buttonEl.focus();
				}
			});
		}
	}

	onClose(): void {
		this.isClosed = true;
		this.contentEl.empty();
	}
}
