import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { loadUtility, replaceGlobal } from './helpers/load-utility.mjs';

const { getRawCursorWord, analyzeCursorWord, boundary, PLUGIN_SETTINGS } = await loadUtility('analyze-word-utils');
beforeEach(() => { boundary.notices.length = 0; });

for (const [description, context, index, expected] of [
	['empty input', '', 0, ''],
	['negative index', 'hello', -1, ''],
	['index beyond the text', 'hello', 6, ''],
	['start of English text', 'hello world', 0, 'hello'],
	['inside an English word', 'hello world', 8, 'world'],
	['end of English text', 'hello world', 11, 'world'],
	['tab boundaries', 'one\ttwo', 5, 'two'],
	['newline boundaries', 'one\ntwo', 5, 'two'],
	['between consecutive spaces', 'one  two', 4, ''],
	['Japanese punctuation boundaries', 'これは、テストです。次へ', 7, 'テストです'],
	['Japanese spaces', 'これは テストです 次へ', 7, 'テストです'],
	['Japanese scan window', 'あ'.repeat(30), 15, 'あ'.repeat(20)],
]) {
	test(`raw word: ${description}`, () => {
		assert.equal(getRawCursorWord(context, index), expected);
	});
}

test('English analysis works offline without requesting the API', async t => {
	replaceGlobal(t, 'navigator', { onLine: false });
	boundary.request = t.mock.fn();
	assert.equal(await analyzeCursorWord('hello world', 8), 'world');
	assert.equal(boundary.request.mock.callCount(), 0);
	assert.deepEqual(boundary.notices, []);
});

test('Japanese analysis sends context and cursor index and returns the dictionary form', async t => {
	replaceGlobal(t, 'navigator', { onLine: true });
	boundary.request = t.mock.fn(async () => ({ status: 200, json: { jishokei: '食べる' } }));
	assert.equal(await analyzeCursorWord('パンを食べた', 4), '食べる');
	assert.equal(boundary.request.mock.callCount(), 1);
	const [request] = boundary.request.mock.calls[0].arguments;
	assert.equal(request.url, PLUGIN_SETTINGS.morphemeAnalysisAPI);
	assert.equal(request.method, 'POST');
	assert.deepEqual(request.headers, { 'Content-Type': 'application/json' });
	assert.deepEqual(JSON.parse(request.body), { sentence: 'パンを食べた', cursor_index: 4 });
});

test('offline Japanese analysis shows a notice without making a request', async t => {
	replaceGlobal(t, 'navigator', { onLine: false });
	boundary.request = t.mock.fn();
	assert.equal(await analyzeCursorWord('食べた', 1), undefined);
	assert.equal(boundary.request.mock.callCount(), 0);
	assert.deepEqual(boundary.notices, ['あれ？ネットがないみたいだね']);
});

for (const [description, response] of [
	['HTTP failure', async () => ({ status: 503 })],
	['request rejection', async () => { throw new Error('offline'); }],
]) {
	test(`Japanese analysis handles ${description}`, async t => {
		replaceGlobal(t, 'navigator', { onLine: true });
		const errors = t.mock.method(console, 'error', () => {});
		boundary.request = response;
		assert.equal(await analyzeCursorWord('食べた', 1), undefined);
		assert.equal(errors.mock.callCount(), 1);
	});
}

for (const data of [null, {}, { jishokei: 123 }, { jishokei: ['食べる'] }]) {
	test(`Japanese analysis ignores malformed response: ${JSON.stringify(data)}`, async t => {
		replaceGlobal(t, 'navigator', { onLine: true });
		boundary.request = async () => ({ status: 200, json: data });
		assert.equal(await analyzeCursorWord('食べた', 1), undefined);
	});
}
