import type { Vault } from 'obsidian';

export interface DictionaryLinks {
	dictURL: string;
	dialogDictCategories: { label: string; url: string }[];
}

/** Shared, versioned format for clipboard backups and future client importers. */
export function serializeDictionaryLinks(settings: DictionaryLinks): string {
	return JSON.stringify({
		format: 'monokakido-copilot-dictionaries',
		version: 1,
		dictURL: settings.dictURL,
		dialogDictCategories: settings.dialogDictCategories.map(({ label, url }) => ({ label, url })),
	}, null, 2) + '\n';
}

export async function copyDictionaryLinks(settings: DictionaryLinks, ownerDocument: Document): Promise<void> {
	const clipboard = ownerDocument.defaultView?.navigator.clipboard;
	if (!clipboard) throw new Error('Clipboard is unavailable');
	await clipboard.writeText(serializeDictionaryLinks(settings));
}

/** Create a new backup in the vault root without replacing previous backups. */
export async function exportDictionaryLinks(
	settings: DictionaryLinks,
	vault: Pick<Vault, 'getAbstractFileByPath' | 'create'>,
	autoBackupDate?: Date,
): Promise<string> {
	const content = serializeDictionaryLinks(settings);
	let baseName = 'monokakido-dictionaries';
	if (autoBackupDate) {
		const year = autoBackupDate.getFullYear();
		const month = String(autoBackupDate.getMonth() + 1).padStart(2, '0');
		const day = String(autoBackupDate.getDate()).padStart(2, '0');
		const hour = String(autoBackupDate.getHours()).padStart(2, '0');
		const minute = String(autoBackupDate.getMinutes()).padStart(2, '0');
		baseName += `-auto-backup-${year}-${month}-${day}-${hour}-${minute}`;
	}
	let path = `${baseName}.json`;
	let suffix = 1;
	while (vault.getAbstractFileByPath(path)) {
		path = `${baseName}-${suffix++}.json`;
	}
	await vault.create(path, content);
	return path;
}

export class DictionaryBackupError extends Error {}

/** Validate the entire backup before returning only the dictionary settings. */
export function parseDictionaryLinks(text: string): DictionaryLinks {
	let data: unknown;
	try {
		data = JSON.parse(text.replace(/^\uFEFF/, ''));
	} catch {
		throw new DictionaryBackupError('JSON の形式が正しくありません。');
	}
	if (typeof data !== 'object' || data === null
		|| !('format' in data) || data.format !== 'monokakido-copilot-dictionaries') {
		throw new DictionaryBackupError('辞書リンクのバックアップファイルではありません。');
	}
	if (!('version' in data) || data.version !== 1) {
		throw new DictionaryBackupError('このバックアップのバージョンには対応していません。');
	}
	if (!('dictURL' in data) || typeof data.dictURL !== 'string'
		|| !('dialogDictCategories' in data) || !Array.isArray(data.dialogDictCategories)) {
		throw new DictionaryBackupError('辞書の設定が正しくありません。');
	}
	const categories: unknown[] = data.dialogDictCategories;
	const dialogDictCategories = categories.map(category => {
		if (typeof category !== 'object' || category === null
			|| !('label' in category) || typeof category.label !== 'string'
			|| !('url' in category) || typeof category.url !== 'string') {
			throw new DictionaryBackupError('追加辞書の名前または URL が正しくありません。');
		}
		return { label: category.label, url: category.url };
	});
	return { dictURL: data.dictURL, dialogDictCategories };
}

export async function readDictionaryBackupFile(file: Pick<File, 'text'>): Promise<DictionaryLinks> {
	return parseDictionaryLinks(await file.text());
}
