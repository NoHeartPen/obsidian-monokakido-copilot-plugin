import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile,MarkdownFileInfo } from 'obsidian';
import { DictionaryImportModal } from './ui/dictionary-import-modal';
import type { DictionaryLinks } from './utils/dictionary-backup-utils';
import { copyDictionaryLinks, exportDictionaryLinks } from './utils/dictionary-backup-utils';
import { searchWordAtCursor, searchWordAtCursorInDialog, getContextAndIndex } from './utils/cursor-word-utils';

/**
 * 调试模式开关
 */
const isDebug = false;

/**
 * 调试日志
 */
export function debugLog(...args: string[]) {
	if (isDebug) {
		console.debug(...args);
	}
}


/**
 * Dialog モードの辞書カテゴリ
 */
export interface DictCategory {
	/** ボタンに表示するラベル */
	label: string;
	/** URL テンプレート（<text_to_search> / <文字列> / {w} 形式、または直接拼接） */
	url: string;
}

interface PluginSettingsInterface {
	/**
	 * 调用辞書的 URL
	 */
	dictURL: string;
	/**
	 * 是否调用 URL Scheme 查询
	 */
	searchByOpenUrl: boolean;
	/**
	 * 形态素分析 API
	 */
	morphemeAnalysisAPI: string;
	/**
	 * 双击指定的按键触发搜索
	 */
	doubleClickedKey: string;
	/**
	 * 查词历史记录文件路径
	 */
	historyFilePath: string;
	/**
	 * 是否启用双击指定按键触发搜索
	 */
	enableDoubleClickSearch: boolean;
	/**
	 * 搜索模式: 'quick' (快速模式，默认) 或 'dialog' (窗口模式)
	 */
	searchMode: 'quick' | 'dialog';
	/**
	 * コンパクトなダイアログ UI（説明ラベルを非表示にする）
	 * デフォルトは false（説明ラベルを表示）
	 */
	compactDialogUI: boolean;
	/**
	 * 用户反馈表单 URL（留空时不显示反馈按钮）
	 */
	feedbackFormURL: string;
	/**
	 * Dialog モードの辞書カテゴリ一覧
	 * デフォルトの辞書（dictURL）の後に表示される追加カテゴリ
	 */
	dialogDictCategories: DictCategory[];
}

export const PLUGIN_SETTINGS: PluginSettingsInterface = {
	// 默认使用 物書堂
	dictURL: 'mkdictionaries:///?text=<text_to_search>',
	// 默认不使用剪贴板查询模式
	searchByOpenUrl: false,
	// 如果你使用源码自己在本地部署请修改成 <http://127.0.0.1:8000/>
	// 形态素分析的源码 <https://github.com/NoHeartPen/fast-mikann-api>
	morphemeAnalysisAPI: 'https://www.nonjishokei.org/',
	// 默认按键为 Option 键（在 Windows 上是 Alt 键）
	doubleClickedKey: 'Alt',
	// 查词历史记录文件路径
	historyFilePath: 'MonoKakido Copilot History.md',
	// 默认使用双击指定按键触发搜索
	enableDoubleClickSearch: true,
	// 默认搜索模式为快速模式
	searchMode: 'quick',
	// 默认不隐藏ダイアログの説明ラベル
	compactDialogUI: false,
	// 用户反馈表单 URL（留空时不显示反馈按钮）
	feedbackFormURL: '',
	// Dialog モードのデフォルト辞書カテゴリ
	dialogDictCategories: [
		{ label: '国語', url: 'mkdictionaries:///?text=<text_to_search>&category=ja' },
		{ label: '英英', url: 'mkdictionaries:///?text=<text_to_search>&category=en' },
		{ label: '英和', url: 'mkdictionaries:///?text=<text_to_search>&category=en-ja' },
	],
}

export default class MonokakidoCopilotPlugin extends Plugin {
	settings!: PluginSettingsInterface;

	private lastKeyupTime = 0;
	private lastKeyWasDouble = false;

	/** 状态栏模式指示器元素（public: SettingTab 需要访问以更新文本） */
	statusBarItemEl: HTMLElement | null = null;
	/** 上一次搜索的上下文（用于检测"双击两次 → Dialog 模式"） */
	private lastSearchContext: string | null = null;
	/** 上一次搜索的光标位置 */
	private lastSearchCursorIndex: number | null = null;


	/**
	 * 监听键盘按键弹起事件，启用时调用 searchOnDoublePress 处理双击搜索逻辑
	 * @param event 键盘事件
	 */
	private readonly onKeyUpHandler = (event: KeyboardEvent) => {
		if (!this.settings.enableDoubleClickSearch) return;
		void this.searchOnDoublePress(event).catch(error => console.error('Search failed:', error));
	};


	/**
	 * 监听键盘按键按下事件，启用时调用 clearTimerOnDoublePress 清理双击定时器
	 * @param event 键盘事件
	 */
	private readonly onKeyDownHandler = (event: KeyboardEvent) => {
		if (!this.settings.enableDoubleClickSearch) return;
		this.clearTimerOnDoublePress(event);
	};

	/**
	 * 双击监听指定按键时触发搜索
	 * - Quick 模式: 直接搜索光标附近单词
	 * - Dialog 模式: 弹起窗口模式对话框
	 * - Quick 模式 + 同一上下文双击两次: 自动切换到 Dialog 模式
	 * @param event 键盘事件
	 */
	private async searchOnDoublePress(event: KeyboardEvent) {
		const key = event.key;
		if (key !== PLUGIN_SETTINGS.doubleClickedKey) {
			this.lastKeyupTime = 0;
			return;
		}

		if (this.lastKeyWasDouble) {
			this.lastKeyWasDouble = false;
			return;
		}

		if (Date.now() - this.lastKeyupTime >= 500) {
			this.lastKeyupTime = Date.now();
			return;
		}

		// 检测到双击
		this.lastKeyupTime = 0;

		if (this.settings.searchMode === 'dialog') {
			// Dialog 模式: 直接弹起窗口模式对话框
			await searchWordAtCursorInDialog(this.app);
			return;
		}

		// Quick 模式: 检测是否为同一上下文的第二次双击
		const current = getContextAndIndex(this.app);

		if (current && current.context !== ''
			&& this.lastSearchContext === current.context
			&& this.lastSearchCursorIndex === current.cursorIndex) {
			// 同一上下文双击两次 → 自动切换到 Dialog 模式
			this.lastSearchContext = null;
			this.lastSearchCursorIndex = null;
			await searchWordAtCursorInDialog(this.app);
			return;
		}

		// 正常 Quick 模式搜索
		if (current) {
			this.lastSearchContext = current.context;
			this.lastSearchCursorIndex = current.cursorIndex;
		}
		await searchWordAtCursor(this.app);
	}

	/**
	 * 双击指定按键后清空计时器
	 * @param event 键盘事件
	 */
	private clearTimerOnDoublePress(event: KeyboardEvent) {
		if (event.key !== PLUGIN_SETTINGS.doubleClickedKey) {
			this.lastKeyWasDouble = true;
		}
	}

	async onload() {
		await this.loadSettings();
		if (this.settings.enableDoubleClickSearch) {
			this.registerDomEvent(this.app.workspace.containerEl.ownerDocument, 'keyup', this.onKeyUpHandler);
			this.registerDomEvent(this.app.workspace.containerEl.ownerDocument, 'keydown', this.onKeyDownHandler);
		}

		this.addRibbonIcon('file-clock', 'Monokakido Copilot history', () => {
			void this.openHistoryFile().catch(error => console.error('Opening history failed:', error));
		});

		this.registerCommands();

		// 添加状态栏模式指示器（桌面端右下角，移动端同样可用）
		this.statusBarItemEl = this.addStatusBarItem();
		this.statusBarItemEl.setText(this.settings.searchMode === 'quick' ? 'クイック検索' : 'ダイアログ検索');
		this.statusBarItemEl.addClass('mod-clickable');
		this.statusBarItemEl.setAttr('aria-label', '検索モードを切り替え');
		this.statusBarItemEl.onClickEvent(() => {
			this.settings.searchMode = this.settings.searchMode === 'quick' ? 'dialog' : 'quick';
			PLUGIN_SETTINGS.searchMode = this.settings.searchMode;
			if (this.statusBarItemEl) {
				this.statusBarItemEl.setText(this.settings.searchMode === 'quick' ? 'クイック検索' : 'ダイアログ検索');
			}
			void this.saveSettings().catch((err) => console.error('Failed to save settings:', err));
		});

		this.addSettingTab(new SettingTab(this.app, this));
	}


	private registerCommands() {
		this.addCommand({
			id: 'open-history',
			name: '単語メモ帳を開く',
			callback: () => {
				void this.openHistoryFile().catch(error => console.error('Opening history failed:', error));
			},
		});

		this.addCommand({
			id: 'search-cursor-word',
			name: 'カーソルの単語を検索',
			editorCallback: async (editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
				await searchWordAtCursor(this.app);
			},
		});

		this.addCommand({
			id: 'search-cursor-word-dialog',
			name: 'Dialog モードでカーソルの単語を検索',
			editorCallback: async (editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
				await searchWordAtCursorInDialog(this.app);
			},
		});
	}

	private async openHistoryFile() {
		const vault = this.app.vault;
		const filePath = PLUGIN_SETTINGS.historyFilePath;
		const file = vault.getFileByPath(filePath);
		if (file instanceof TFile) {
			await this.app.workspace.openLinkText(filePath, '', true);
		} else {
			// FIXME 封装，因为有可能在写入笔记时文件又被删除了
			await vault.create(
				filePath,
				'# MonoKakido Copilot history\n\nThis document is used for history.'
			);
			new Notice(`単語メモ帳は: ${filePath}`);
			await this.app.workspace.openLinkText(filePath, '', true);
		}
	}

	async loadSettings() {
		const data: unknown = await this.loadData();
		this.settings = { ...PLUGIN_SETTINGS, ...(typeof data === 'object' && data !== null ? data : {}) };
		Object.assign(PLUGIN_SETTINGS, this.settings);
	}

	async importDictionaryLinks(links: DictionaryLinks, backupCurrent = false): Promise<void> {
		if (backupCurrent) {
			const path = await exportDictionaryLinks(this.settings, this.app.vault, new Date());
			new Notice(`現在の辞書設定を保存しました: ${path}`);
		}
		await this.saveData({ ...this.settings, ...links });
		Object.assign(this.settings, links);
		Object.assign(PLUGIN_SETTINGS, links);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		Object.assign(PLUGIN_SETTINGS, this.settings);
	}
}


class SettingTab extends PluginSettingTab {
	plugin: MonokakidoCopilotPlugin;

	constructor(app: App, plugin: MonokakidoCopilotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private openDictionaryImport(mode: 'paste' | 'file'): void {
		new DictionaryImportModal(this.app, mode, async (links, backupCurrent) => {
			await this.plugin.importDictionaryLinks(links, backupCurrent);
			this.display();
		}).open();
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.addClass('monokakido-settings');

		new Setting(containerEl).setName('辞書の検索').setHeading();

		new Setting(containerEl)
			.setClass('monokakido-default-dictionary')
			.setName('デフォルトの辞書の URL')
			.setDesc('検索に使う URL スキームです。<text_to_search> は検索語に置き換えられます。')
			.addText(text => text
				.setPlaceholder('mkdictionaries:///?text=<text_to_search>')
				.setValue(this.plugin.settings.dictURL)
				.onChange(async (value) => {
					this.plugin.settings.dictURL = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('検索モード')
			.setDesc('クイック検索は辞書を直接開きます。ダイアログ検索は検索語や辞書を選んでから検索します。')
			.addDropdown(dropdown =>
				dropdown
					.addOption('quick', 'クイック検索')
					.addOption('dialog', 'ダイアログ検索')
					.setValue(this.plugin.settings.searchMode)
					.onChange(async (value) => {
						if (value !== 'quick' && value !== 'dialog') return;
						const mode = value;
						this.plugin.settings.searchMode = mode;
						PLUGIN_SETTINGS.searchMode = mode;
						if (this.plugin.statusBarItemEl) {
							this.plugin.statusBarItemEl.setText(mode === 'quick' ? 'クイック検索' : 'ダイアログ検索');
						}
						await this.plugin.saveSettings();
					}));

		new Setting(containerEl).setName('表示と操作').setHeading();

		new Setting(containerEl)
			.setName('ダイアログをコンパクトに表示')
			.setDesc('ダイアログの説明ラベルを非表示にして、表示をすっきりさせます。モバイルや、画面の小さい端末におすすめです。')
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.compactDialogUI)
					.onChange(async (value) => {
						this.plugin.settings.compactDialogUI = value;
						await this.plugin.saveSettings();
					}));

		new Setting(containerEl)
			.setName('キーの連続押しで検索')
			.setDesc('オプションキー（ウィンドウズではオルトキー）をすばやく２回押すと検索します。外付けキーボードでも利用できます。')
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.enableDoubleClickSearch)
					.onChange(async (value) => {
						this.plugin.settings.enableDoubleClickSearch = value;
						await this.plugin.saveSettings();
					}));

		new Setting(containerEl)
			.setName('ダイアログの追加辞書')
			.setDesc('デフォルトの辞書の後に表示するボタンを設定します。URL の <text_to_search>・<文字列>・{w} は検索語に置き換えられます。')
			.setHeading();

		const categoriesContainer = containerEl.createDiv({ cls: 'monokakido-dictionaries' });

		const renderCategories = (focusIndex?: number) => {
			categoriesContainer.empty();
			const categories = this.plugin.settings.dialogDictCategories;
			const labelInputs: HTMLInputElement[] = [];

			if (categories.length === 0) {
				categoriesContainer.createEl('p', {
					cls: 'monokakido-dictionaries-empty',
					text: '追加辞書はありません。「辞書を追加」から登録できます。',
				});
			}

			categories.forEach((cat, index) => {
				const dictionaryContainer = categoriesContainer.createDiv();
				new Setting(dictionaryContainer)
					.setName(`追加辞書 ${index + 1}`)
					.setHeading()
					.addExtraButton(button => button
						.setIcon('trash-2')
						.setTooltip(`追加辞書 ${index + 1} を削除`)
						.onClick(async () => {
							categories.splice(index, 1);
							await this.plugin.saveSettings();
							renderCategories(Math.min(index, categories.length - 1));
						}));

				new Setting(dictionaryContainer)
					.setName('ボタン名')
					.addText(text => {
						labelInputs.push(text.inputEl);
						text.inputEl.setAttribute('aria-label', `追加辞書 ${index + 1} のボタン名`);
						text.setValue(cat.label)
							.setPlaceholder('例：国語')
							.onChange(async (value) => {
								cat.label = value;
								await this.plugin.saveSettings();
							});
					});

				new Setting(dictionaryContainer)
					.setName('辞書の URL')
					.setClass('monokakido-dictionary-url-setting')
					.addText(text => {
						text.inputEl.setAttribute('aria-label', `追加辞書 ${index + 1} の URL`);
						text.setValue(cat.url)
							.setPlaceholder('mkdictionaries:///?text=<text_to_search>')
							.onChange(async (value) => {
								cat.url = value;
								await this.plugin.saveSettings();
							});
						text.inputEl.spellcheck = false;
						text.inputEl.setAttribute('autocapitalize', 'off');
					});
			});

			const actions = new Setting(categoriesContainer)
				.setName('追加辞書を登録')
				.setDesc('ダイアログに表示する辞書ボタンを追加します。');
			actions.addButton(btn => {
				btn.setButtonText('辞書を追加')
					.setCta()
					.onClick(async () => {
						categories.push({ label: '', url: '' });
						await this.plugin.saveSettings();
						renderCategories(categories.length - 1);
					});
				if (focusIndex !== undefined && !labelInputs[focusIndex]) btn.buttonEl.focus();
			});
			if (focusIndex !== undefined) labelInputs[focusIndex]?.focus();
		};

		renderCategories();

		new Setting(containerEl)
			.setClass('monokakido-dictionary-backup')
			.setName('辞書リンクのバックアップ')
			.setDesc('辞書の設定を JSON 形式でコピー、またはファイルに保存できます。保存先は保管庫のルートです。')
			.addButton(button => button
				.setButtonText('コピー')
				.onClick(async () => {
					try {
						await copyDictionaryLinks(this.plugin.settings, containerEl.ownerDocument);
						new Notice('辞書リンクをコピーしました。');
					} catch (error: unknown) {
						console.error('Failed to copy dictionary links:', error);
						new Notice('コピーできませんでした。JSON のエクスポートをお試しください。');
					}
				}))
			.addButton(button => button
				.setButtonText('JSON をエクスポート')
				.onClick(async () => {
					button.setDisabled(true);
					try {
						const path = await exportDictionaryLinks(this.plugin.settings, this.app.vault);
						new Notice(`辞書リンクを保存しました: ${path}`);
					} catch (error: unknown) {
						console.error('Failed to export dictionary links:', error);
						new Notice('辞書リンクを保存できませんでした。保管庫への書き込み権限を確認してください。');
					} finally {
						button.setDisabled(false);
					}
				}));

		new Setting(containerEl)
			.setClass('monokakido-dictionary-backup')
			.setName('辞書リンクのインポート')
			.setDesc('JSON を貼り付けるか、バックアップファイルを選択して辞書の設定を復元します。現在の辞書設定は置き換えられます。')
			.addButton(button => button
				.setButtonText('貼り付けてインポート')
				.onClick(() => this.openDictionaryImport('paste')))
			.addButton(button => button
				.setButtonText('ファイルからインポート')
				.onClick(() => this.openDictionaryImport('file')));

		new Setting(containerEl)
			.setName('ヘルプとフィードバック')
			.setHeading();

		const faq = new Setting(containerEl)
			.setName('よくある質問');
		faq.descEl.createEl('a', {
			text: 'FAQ を開く',
			href: 'https://github.com/NoHeartPen/obsidian-monokakido-copilot-plugin/blob/master/docs/faq.ja.md',
			attr: { target: '_blank', rel: 'noopener noreferrer' },
		});

		const feedback = new Setting(containerEl)
			.setName('ご意見・ご要望');
		feedback.descEl.createEl('a', {
			text: 'Google Form',
			href: 'https://forms.gle/cgTbndS7LUxBhney9',
			attr: { target: '_blank', rel: 'noopener noreferrer' },
		});
		feedback.descEl.appendText(' からお送りください。X で');
		feedback.descEl.createEl('a', {
			text: 'ハッシュタグ「#DictCopilot」',
			href: 'https://twitter.com/intent/tweet?hashtags=DictCopilot',
			attr: { target: '_blank', rel: 'noopener noreferrer' },
		});
		feedback.descEl.appendText('を付け、ご意見やご要望を投稿していただくのも大歓迎です！');
	}
}
