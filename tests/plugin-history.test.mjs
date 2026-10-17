import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadUtility } from './helpers/load-utility.mjs';

const { PluginUnderTest, TFile } = await loadUtility('main');

for (const exists of [false, true]) {
	test(`opening history ${exists ? 'uses the existing file' : 'waits for file creation'}`, async t => {
		let finishCreate;
		const pending = new Promise(resolve => { finishCreate = resolve; });
		const app = {
			vault: {
				getFileByPath: t.mock.fn(() => exists ? new TFile('history.md') : null),
				create: t.mock.fn(() => pending),
			},
			workspace: { openLinkText: t.mock.fn(async () => {}) },
		};
		const plugin = new PluginUnderTest(app);
		// TypeScript private methods remain ordinary methods in the emitted JavaScript.
		const operation = plugin.openHistoryFile();
		assert.equal(app.vault.create.mock.callCount(), exists ? 0 : 1);
		assert.equal(app.workspace.openLinkText.mock.callCount(), exists ? 1 : 0);
		finishCreate();
		await operation;
		assert.deepEqual(app.workspace.openLinkText.mock.calls[0].arguments, [
			app.vault.getFileByPath.mock.calls[0].arguments[0], '', true,
		]);
	});
}

test('failed history creation rejects without opening a missing file', async t => {
	const error = new Error('storage unavailable');
	const app = {
		vault: { getFileByPath: () => null, create: async () => { throw error; } },
		workspace: { openLinkText: t.mock.fn() },
	};
	await assert.rejects(new PluginUnderTest(app).openHistoryFile(), error);
	assert.equal(app.workspace.openLinkText.mock.callCount(), 0);
});
