import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import { loadUtility } from './helpers/load-utility.mjs';

const { openDialogMode, boundary, Platform } = await loadUtility('dialog-mode-utils');

function createDialog(t) {
	Platform.isMobileApp = false;
	const callbacks = [];
	const ownerWindow = {
		setTimeout: t.mock.fn((callback, delay) => { callbacks.push({ callback, delay }); return callbacks.length; }),
		clearTimeout: t.mock.fn(),
	};
	const ownerDocument = {
		defaultView: ownerWindow,
		createEl: t.mock.fn(() => {
			throw new Error('HierarchyRequestError: only one element on document allowed');
		}),
		createElement: t.mock.fn(() => ({ ownerDocument, parentNode: null })),
	};
	const app = { workspace: { containerEl: { ownerDocument }, getMostRecentLeaf: () => undefined } };
	openDialogMode(app, { context: 'hello world', cursorIndex: 1, searchWord: 'hello', rawWord: 'hello' });
	const dialog = boundary.lastDialog;
	t.mock.method(dialog, 'renderCandidates', () => {});
	return { dialog, callbacks, ownerWindow, ownerDocument };
}

test('cursor debounce and cancellation use the modal owning window', async t => {
	const { dialog, callbacks, ownerWindow, ownerDocument } = createDialog(t);
	assert.deepEqual(ownerDocument.createElement.mock.calls[0].arguments, ['canvas']);
	dialog.onCursorMove('hello world', 2);
	dialog.onCursorMove('hello world', 8);
	assert.equal(callbacks[1].delay, 300);
	assert.deepEqual(ownerWindow.clearTimeout.mock.calls[0].arguments, [1]);
	callbacks[1].callback();
	await setImmediate();
	assert.deepEqual(dialog.candidates, ['world', null, null, null, null]);
	assert.equal(dialog.renderCandidates.mock.callCount(), 1);
	assert.equal(dialog.searchWord, 'hello');
});

test('closing the dialog clears analysis on its owning window', t => {
	const { dialog, ownerWindow } = createDialog(t);
	dialog.onCursorMove('hello world', 8);
	dialog.onClose();
	assert.deepEqual(ownerWindow.clearTimeout.mock.calls[0].arguments, [1]);
	assert.equal(dialog.cursorAnalysisTimer, null);
});

test('cursor analysis rejection is handled by the debounce callback', async t => {
	const { dialog, callbacks } = createDialog(t);
	const error = new Error('candidate rendering failed');
	t.mock.method(dialog, 'renderCandidates', () => { throw error; });
	const errors = t.mock.method(console, 'error', () => {});
	dialog.onCursorMove('hello world', 8);
	callbacks[0].callback();
	await setImmediate();
	assert.equal(errors.mock.calls[0].arguments[1], error);
	assert.equal(dialog.renderCandidates.mock.callCount(), 1);
});

test('opening the dialog creates a detached measurement canvas in its owning document', t => {
	const { dialog, ownerDocument } = createDialog(t);
	assert.equal(ownerDocument.createEl.mock.callCount(), 0);
	assert.equal(ownerDocument.createElement.mock.callCount(), 1);
	assert.equal(dialog.buttonMeasureCanvas.ownerDocument, ownerDocument);
	assert.equal(dialog.buttonMeasureCanvas.parentNode, null);
});
