import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadUtility, replaceGlobal } from './helpers/load-utility.mjs';

const { buildDictUrl, openDictUrl, write2ClipBoard, PLUGIN_SETTINGS } = await loadUtility('open-dict-utils');

for (const [template, expected] of [
	['mkdictionaries:///?text=<text_to_search>&category=ja', 'mkdictionaries:///?text=言葉&category=ja'],
	['mkdictionaries:///?text=<文字列>', 'mkdictionaries:///?text=言葉'],
	['https://dictionary.invalid/{w}', 'https://dictionary.invalid/言葉'],
	['mkdictionaries:///', 'mkdictionaries:///言葉'],
	['', '言葉'],
]) {
	test(`dictionary URL template: ${JSON.stringify(template)}`, () => {
		assert.equal(buildDictUrl('言葉', template), expected);
	});
}

test('an omitted template uses the current plugin setting', t => {
	const original = PLUGIN_SETTINGS.dictURL;
	t.after(() => { PLUGIN_SETTINGS.dictURL = original; });
	PLUGIN_SETTINGS.dictURL = 'custom:///{w}';
	assert.equal(buildDictUrl('hello'), 'custom:///hello');
});

test('opening a dictionary dispatches the built URL', t => {
	const open = t.mock.fn();
	replaceGlobal(t, 'window', { open });
	openDictUrl('hello');
	assert.deepEqual(open.mock.calls[0].arguments, ['mkdictionaries:///?text=hello', '_blank']);
});

test('clipboard write waits for completion', async t => {
	let complete;
	const pending = new Promise(resolve => { complete = resolve; });
	const writeText = t.mock.fn(() => pending);
	replaceGlobal(t, 'navigator', { clipboard: { writeText } });
	let finished = false;
	const operation = write2ClipBoard('言葉').then(() => { finished = true; });
	await Promise.resolve();
	assert.equal(finished, false);
	assert.deepEqual(writeText.mock.calls[0].arguments, ['言葉']);
	complete();
	await operation;
	assert.equal(finished, true);
});

test('clipboard rejection is reported without rejecting the search', async t => {
	const error = new Error('clipboard permission denied');
	replaceGlobal(t, 'navigator', { clipboard: { writeText: async () => { throw error; } } });
	const errors = t.mock.method(console, 'error', () => {});
	await assert.doesNotReject(write2ClipBoard('hello'));
	assert.equal(errors.mock.calls[0].arguments[1], error);
});
