import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadUtility } from './helpers/load-utility.mjs';

const { serializeDictionaryLinks, copyDictionaryLinks, exportDictionaryLinks } = await loadUtility('dictionary-backup-utils');
const settings = {
	dictURL: 'mkdictionaries:///?text=<text_to_search>',
	dialogDictCategories: [
		{ label: '国語 "辞書"', url: 'custom:///<文字列>&category=ja' },
		{ label: '', url: 'https://example.org/{w}' },
		{ label: '', url: '' },
	],
	morphemeAnalysisAPI: 'https://private.example/',
};

test('backup preserves URLs, labels, blank entries and order without unrelated settings', () => {
	assert.deepEqual(JSON.parse(serializeDictionaryLinks(settings)), {
		format: 'monokakido-copilot-dictionaries', version: 1,
		dictURL: settings.dictURL, dialogDictCategories: settings.dialogDictCategories,
	});
	assert.deepEqual(JSON.parse(serializeDictionaryLinks({ dictURL: '', dialogDictCategories: [] })).dialogDictCategories, []);
});

test('clipboard uses the settings owning window and waits for completion', async t => {
	let finish;
	const pending = new Promise(resolve => { finish = resolve; });
	const writeText = t.mock.fn(() => pending);
	const ownerDocument = { defaultView: { navigator: { clipboard: { writeText } } } };
	let completed = false;
	const operation = copyDictionaryLinks(settings, ownerDocument).then(() => { completed = true; });
	await Promise.resolve();
	assert.equal(completed, false);
	assert.deepEqual(writeText.mock.calls[0].arguments, [serializeDictionaryLinks(settings)]);
	finish();
	await operation;
	assert.equal(completed, true);
});

test('clipboard unavailability and rejection reach the caller for a failure notice', async () => {
	await assert.rejects(copyDictionaryLinks(settings, { defaultView: null }), /Clipboard is unavailable/);
	const error = new Error('permission denied');
	await assert.rejects(copyDictionaryLinks(settings, {
		defaultView: { navigator: { clipboard: { writeText: async () => { throw error; } } } },
	}), error);
});

test('export skips existing files and folders and waits for the new backup write', async t => {
	let finish;
	const pending = new Promise(resolve => { finish = resolve; });
	const vault = {
		getAbstractFileByPath: path => ['monokakido-dictionaries.json', 'monokakido-dictionaries-1.json'].includes(path) ? {} : null,
		create: t.mock.fn(() => pending),
	};
	let completed = false;
	const operation = exportDictionaryLinks(settings, vault).then(path => { completed = true; return path; });
	await Promise.resolve();
	assert.equal(completed, false);
	assert.deepEqual(vault.create.mock.calls[0].arguments, ['monokakido-dictionaries-2.json', serializeDictionaryLinks(settings)]);
	finish();
	assert.equal(await operation, 'monokakido-dictionaries-2.json');
});

test('export reports write failures, including another writer creating the same path', async t => {
	const error = new Error('file exists');
	const vault = { getAbstractFileByPath: () => null, create: t.mock.fn(async () => { throw error; }) };
	await assert.rejects(exportDictionaryLinks(settings, vault), error);
	assert.equal(vault.create.mock.callCount(), 1);
});

const { parseDictionaryLinks, readDictionaryBackupFile } = await loadUtility('dictionary-backup-utils');

test('import round-trips URLs, empty entries, duplicate dictionaries and order', () => {
	const source = { ...settings, dialogDictCategories: [...settings.dialogDictCategories, settings.dialogDictCategories[0]] };
	assert.deepEqual(parseDictionaryLinks(serializeDictionaryLinks(source)), {
		dictURL: source.dictURL, dialogDictCategories: source.dialogDictCategories,
	});
	assert.deepEqual(parseDictionaryLinks(serializeDictionaryLinks({ dictURL: '', dialogDictCategories: [] })), {
		dictURL: '', dialogDictCategories: [],
	});
});

test('import ignores unknown fields and accepts UTF-8 BOM from text editors', () => {
	const backup = JSON.parse(serializeDictionaryLinks(settings));
	backup.historyFilePath = 'do-not-import.md';
	backup.dialogDictCategories[0].extra = true;
	const imported = parseDictionaryLinks('\uFEFF' + JSON.stringify(backup));
	assert.deepEqual(imported, { dictURL: settings.dictURL, dialogDictCategories: settings.dialogDictCategories });
});

for (const invalid of [
	'', '{', 'null', '[]', '42', '{}',
	JSON.stringify({ ...JSON.parse(serializeDictionaryLinks(settings)), format: 'other-format' }),
	JSON.stringify({ ...JSON.parse(serializeDictionaryLinks(settings)), version: 2 }),
	JSON.stringify({ ...JSON.parse(serializeDictionaryLinks(settings)), version: '1' }),
	JSON.stringify({ ...JSON.parse(serializeDictionaryLinks(settings)), dictURL: null }),
	JSON.stringify({ ...JSON.parse(serializeDictionaryLinks(settings)), dialogDictCategories: {} }),
	...[null, [], {}, { label: 1, url: 'url' }, { label: 'label', url: false }].map(entry => JSON.stringify({
		...JSON.parse(serializeDictionaryLinks(settings)), dialogDictCategories: [settings.dialogDictCategories[0], entry],
	})),
]) {
	test(`import rejects invalid backups without accepting a partial dictionary list: ${invalid}`, () => {
		assert.throws(() => parseDictionaryLinks(invalid));
	});
}

test('file import waits for reading and uses the same validation as pasted JSON', async () => {
	let finishRead;
	const pending = new Promise(resolve => { finishRead = resolve; });
	let finished = false;
	const operation = readDictionaryBackupFile({ text: () => pending }).then(links => { finished = true; return links; });
	await Promise.resolve();
	assert.equal(finished, false);
	finishRead(serializeDictionaryLinks(settings));
	assert.deepEqual(await operation, parseDictionaryLinks(serializeDictionaryLinks(settings)));
	await assert.rejects(readDictionaryBackupFile({ text: async () => '{}' }));
});

test('file read failures propagate without producing settings', async () => {
	const error = new Error('unreadable file');
	await assert.rejects(readDictionaryBackupFile({ text: async () => { throw error; } }), error);
});

const { PluginUnderTest } = await loadUtility('main');

test('import publishes dictionary settings only after saving and preserves unrelated settings', async t => {
	const plugin = new PluginUnderTest({});
	plugin.settings = { dictURL: 'old:///', dialogDictCategories: [], historyFilePath: 'keep.md', searchMode: 'quick' };
	const original = structuredClone(plugin.settings);
	const links = parseDictionaryLinks(serializeDictionaryLinks(settings));
	let finishSave;
	const pending = new Promise(resolve => { finishSave = resolve; });
	plugin.saveData = t.mock.fn(() => pending);
	const operation = plugin.importDictionaryLinks(links);
	assert.deepEqual(plugin.settings, original);
	assert.deepEqual(plugin.saveData.mock.calls[0].arguments, [{ ...original, ...links }]);
	finishSave();
	await operation;
	assert.deepEqual(plugin.settings, { ...original, ...links });
});

test('failed import persistence leaves current dictionary settings unchanged', async () => {
	const plugin = new PluginUnderTest({});
	plugin.settings = { dictURL: 'old:///', dialogDictCategories: [{ label: 'keep', url: 'keep:///' }] };
	const original = structuredClone(plugin.settings);
	const error = new Error('disk full');
	plugin.saveData = async () => { throw error; };
	await assert.rejects(plugin.importDictionaryLinks(parseDictionaryLinks(serializeDictionaryLinks(settings))), error);
	assert.deepEqual(plugin.settings, original);
});

test('automatic backup names use local time to the minute and avoid existing paths', async t => {
	const base = 'monokakido-dictionaries-auto-backup-2026-10-26-10-12';
	const vault = {
		getAbstractFileByPath: path => [`${base}.json`, `${base}-1.json`].includes(path) ? {} : null,
		create: t.mock.fn(async () => {}),
	};
	assert.equal(await exportDictionaryLinks(settings, vault, new Date(2026, 9, 26, 10, 12)), `${base}-2.json`);
	assert.deepEqual(vault.create.mock.calls[0].arguments, [`${base}-2.json`, serializeDictionaryLinks(settings)]);
	assert.equal(await exportDictionaryLinks(settings, { ...vault, getAbstractFileByPath: () => null }, new Date(2026, 0, 2, 0, 1)),
		'monokakido-dictionaries-auto-backup-2026-01-02-00-01.json');
});

test('backup before import saves the old dictionaries and completes before settings persistence', async t => {
	let finishBackup;
	const pending = new Promise(resolve => { finishBackup = resolve; });
	const vault = { getAbstractFileByPath: () => null, create: t.mock.fn(() => pending) };
	const plugin = new PluginUnderTest({ vault });
	plugin.settings = { dictURL: 'old:///', dialogDictCategories: [{ label: 'old', url: 'old:///{w}' }], historyFilePath: 'keep.md' };
	const original = structuredClone(plugin.settings);
	plugin.saveData = t.mock.fn(async () => {});
	const links = parseDictionaryLinks(serializeDictionaryLinks(settings));
	const operation = plugin.importDictionaryLinks(links, true);
	assert.equal(plugin.saveData.mock.callCount(), 0);
	assert.deepEqual(plugin.settings, original);
	assert.match(vault.create.mock.calls[0].arguments[0], /^monokakido-dictionaries-auto-backup-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/);
	assert.equal(vault.create.mock.calls[0].arguments[1], serializeDictionaryLinks(original));
	finishBackup();
	await operation;
	assert.equal(plugin.saveData.mock.callCount(), 1);
	assert.deepEqual(plugin.settings, { ...original, ...links });
});

test('failed automatic backup prevents import and leaves current settings untouched', async t => {
	const error = new Error('backup write failed');
	const plugin = new PluginUnderTest({ vault: { getAbstractFileByPath: () => null, create: async () => { throw error; } } });
	plugin.settings = { dictURL: 'old:///', dialogDictCategories: [] };
	const original = structuredClone(plugin.settings);
	plugin.saveData = t.mock.fn(async () => {});
	await assert.rejects(plugin.importDictionaryLinks(parseDictionaryLinks(serializeDictionaryLinks(settings)), true), error);
	assert.equal(plugin.saveData.mock.callCount(), 0);
	assert.deepEqual(plugin.settings, original);
});

test('automatic backup remains available when saving imported settings fails', async t => {
	const create = t.mock.fn(async () => {});
	const plugin = new PluginUnderTest({ vault: { getAbstractFileByPath: () => null, create } });
	plugin.settings = { dictURL: 'old:///', dialogDictCategories: [] };
	const original = structuredClone(plugin.settings);
	const error = new Error('settings write failed');
	plugin.saveData = async () => { throw error; };
	await assert.rejects(plugin.importDictionaryLinks(parseDictionaryLinks(serializeDictionaryLinks(settings)), true), error);
	assert.equal(create.mock.callCount(), 1);
	assert.equal(create.mock.calls[0].arguments[1], serializeDictionaryLinks(original));
	assert.deepEqual(plugin.settings, original);
});
