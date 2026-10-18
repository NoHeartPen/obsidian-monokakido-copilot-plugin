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
