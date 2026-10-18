import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadUtility } from './helpers/load-utility.mjs';

const { writeToHistory, TFile } = await loadUtility('history-utils');

function createApp(t, existingFile = null) {
	const activeFile = new TFile('Notes/source.md');
	return {
		workspace: { getActiveFile: () => activeFile },
		fileManager: { generateMarkdownLink: t.mock.fn(() => '[[Notes/source]]') },
		vault: {
			getAbstractFileByPath: t.mock.fn(() => existingFile),
			append: t.mock.fn(async () => {}),
			create: t.mock.fn(async () => {}),
		},
	};
}

test('existing history receives the context, backlink, word and memo', async t => {
	const file = new TFile('history.md');
	const app = createApp(t, file);
	await writeToHistory(app, 'history.md', '**食べた**', '食べる', '動詞');
	assert.deepEqual(app.vault.append.mock.calls[0].arguments, [file, '\n> 食べた [[Notes/source]]\n> 食べる\n> メモ：動詞\n']);
	assert.equal(app.vault.create.mock.callCount(), 0);
	const activeFile = app.workspace.getActiveFile();
	assert.deepEqual(app.fileManager.generateMarkdownLink.mock.calls[0].arguments, [activeFile, activeFile.path]);
});

test('missing history is created with a blank memo line', async t => {
	const app = createApp(t);
	await writeToHistory(app, 'history.md', 'hello world', 'world');
	assert.deepEqual(app.vault.create.mock.calls[0].arguments, ['history.md', '\n> hello world [[Notes/source]]\n> world\n> メモ：\n']);
	assert.equal(app.vault.append.mock.callCount(), 0);
});

for (const [context, expected] of [
	['**bold** and *italic* and _emphasis_', 'bold and italic and emphasis'],
	['`code` and ==highlight==', 'code and highlight'],
	['> quote', 'quote'],
	['# heading', 'heading'],
	['- item', 'item'],
]) {
	test(`history removes formatting: ${context}`, async t => {
		const app = createApp(t);
		await writeToHistory(app, 'history.md', context, 'word');
		assert.equal(app.vault.create.mock.calls[0].arguments[1], `\n> ${expected} [[Notes/source]]\n> word\n> メモ：\n`);
	});
}

test('history lookup normalizes repeated path separators', async t => {
	const app = createApp(t, new TFile('Notes/history.md'));
	await writeToHistory(app, 'Notes//history.md', 'context', 'word');
	assert.deepEqual(app.vault.getAbstractFileByPath.mock.calls[0].arguments, ['Notes/history.md']);
});

test('missing active note rejects before writing any history', async t => {
	const app = createApp(t);
	app.workspace.getActiveFile = () => null;
	await assert.rejects(writeToHistory(app, 'history.md', 'context', 'word'), /No active file/);
	assert.equal(app.vault.append.mock.callCount(), 0);
	assert.equal(app.vault.create.mock.callCount(), 0);
});

for (const operation of ['append', 'create']) {
	test(`history awaits ${operation} and propagates storage failures`, async t => {
		const app = createApp(t, operation === 'append' ? new TFile('history.md') : null);
		let rejectWrite;
		const pending = new Promise((resolve, reject) => { rejectWrite = reject; });
		app.vault[operation] = t.mock.fn(() => pending);
		const result = writeToHistory(app, 'history.md', 'context', 'word');
		const error = new Error('disk full');
		const rejected = assert.rejects(result, error);
		assert.equal(app.vault[operation].mock.callCount(), 1);
		rejectWrite(error);
		await rejected;
	});
}
