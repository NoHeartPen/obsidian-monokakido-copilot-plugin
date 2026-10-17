import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { loadUtility, replaceGlobal } from './helpers/load-utility.mjs';

const { getContextAndIndex, getCursorWord, searchWordAtCursor, searchWordAtCursorInDialog,
	doSearch, boundary, TFile, MarkdownView, Platform, PLUGIN_SETTINGS } = await loadUtility('cursor-word-utils');

beforeEach(() => {
	boundary.notices.length = 0;
	boundary.dialog = undefined;
	Platform.isMobileApp = false;
	PLUGIN_SETTINGS.searchByOpenUrl = false;
});

function createApp(t, selection = '') {
	const editor = {
		getSelection: () => selection,
		getCursor: () => ({ line: 2, ch: 8 }),
		getLine: t.mock.fn(() => 'hello world'),
	};
	const file = new TFile('source.md');
	return {
		workspace: {
			getActiveViewOfType: t.mock.fn(() => ({ editor })),
			getActiveFile: () => file,
		},
		fileManager: { generateMarkdownLink: () => '[[source]]' },
		vault: {
			getAbstractFileByPath: () => new TFile('history.md'),
			append: t.mock.fn(async () => {}),
		},
	};
}

test('editor context comes from the supplied app and cursor line', t => {
	const app = createApp(t);
	assert.deepEqual(getContextAndIndex(app), { context: 'hello world', cursorIndex: 8 });
	assert.deepEqual(app.workspace.getActiveViewOfType.mock.calls[0].arguments, [MarkdownView]);
	assert.deepEqual(app.workspace.getActiveViewOfType().editor.getLine.mock.calls[0].arguments, [2]);
});

test('selected text is analyzed from index zero', t => {
	assert.deepEqual(getContextAndIndex(createApp(t, 'selected words')), { context: 'selected words', cursorIndex: 0 });
});

test('a missing Markdown view returns null', t => {
	const app = createApp(t);
	app.workspace.getActiveViewOfType = () => null;
	t.mock.method(console, 'error', () => {});
	assert.equal(getContextAndIndex(app), null);
});

test('empty context does not write history', async t => {
	const app = createApp(t);
	app.workspace.getActiveViewOfType().editor.getLine = () => '';
	assert.equal(await getCursorWord(app), undefined);
	assert.equal(app.vault.append.mock.callCount(), 0);
});

test('quick search waits for history before dispatching the dictionary action', async t => {
	const app = createApp(t);
	let finishWrite;
	const pending = new Promise(resolve => { finishWrite = resolve; });
	app.vault.append = t.mock.fn(() => pending);
	const writeText = t.mock.fn(async () => {});
	replaceGlobal(t, 'navigator', { clipboard: { writeText } });
	const search = searchWordAtCursor(app);
	await Promise.resolve();
	assert.equal(app.vault.append.mock.callCount(), 1);
	assert.equal(writeText.mock.callCount(), 0);
	finishWrite();
	await search;
	assert.deepEqual(writeText.mock.calls[0].arguments, ['world']);
});

test('failed history write is handled and prevents dictionary dispatch', async t => {
	const app = createApp(t);
	const error = new Error('disk full');
	app.vault.append = async () => { throw error; };
	const errors = t.mock.method(console, 'error', () => {});
	const writeText = t.mock.fn(async () => {});
	replaceGlobal(t, 'navigator', { clipboard: { writeText } });
	await searchWordAtCursor(app);
	assert.equal(errors.mock.calls[0].arguments[1], error);
	assert.equal(writeText.mock.callCount(), 0);
});

test('dialog search passes context and raw word without writing history', async t => {
	const app = createApp(t);
	await searchWordAtCursorInDialog(app);
	assert.deepEqual(boundary.dialog, {
		app, data: { context: 'hello world', cursorIndex: 8, searchWord: 'world', rawWord: 'world' },
	});
	assert.equal(app.vault.append.mock.callCount(), 0);
});

test('mobile search opens the dictionary even when clipboard mode was selected', async t => {
	Platform.isMobileApp = true;
	const open = t.mock.fn();
	replaceGlobal(t, 'window', { open });
	await doSearch('word');
	assert.deepEqual(open.mock.calls[0].arguments, ['mkdictionaries:///?text=word', '_blank']);
});
