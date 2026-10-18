import type { Vault } from 'obsidian';

interface DictionaryLinks {
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
): Promise<string> {
	const content = serializeDictionaryLinks(settings);
	const baseName = 'monokakido-dictionaries';
	let path = `${baseName}.json`;
	let suffix = 1;
	while (vault.getAbstractFileByPath(path)) {
		path = `${baseName}-${suffix++}.json`;
	}
	await vault.create(path, content);
	return path;
}
