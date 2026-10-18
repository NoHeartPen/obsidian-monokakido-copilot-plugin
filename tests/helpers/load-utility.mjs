import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const loadBundle = createRequire(import.meta.url);

// Bundle the real utility, replacing only its Obsidian and plugin-state boundaries.
// Each call creates isolated state without loading the plugin UI or making requests.
export async function loadUtility(name) {
	const result = await build({
		stdin: {
			contents: name === 'main'
				? `export { default as PluginUnderTest } from './src/main.ts'; export * from 'test:boundaries';`
				: `export * from './src/utils/${name}.ts'; export * from 'test:boundaries';`,
			resolveDir: process.cwd(),
		},
		bundle: true,
		write: false,
		platform: 'node',
		format: 'cjs',
		plugins: [{
			name: 'test-boundaries',
			setup(builder) {
				if (name !== 'dialog-mode-utils') {
					builder.onResolve({ filter: /^\.\/dialog-mode-utils$/ }, () => ({
						path: fileURLToPath(new URL('./dialog-boundary.mjs', import.meta.url)),
					}));
				}
				builder.onResolve({ filter: /^(obsidian|test:boundaries|src\/main|\.\.\/main)$/ }, () => ({
					path: fileURLToPath(new URL('./boundaries.mjs', import.meta.url)),
				}));
			},
		}],
	});
	const directory = await mkdtemp(join(tmpdir(), 'monokakido-tests-'));
	const bundlePath = join(directory, 'utility.cjs');
	try {
		await writeFile(bundlePath, result.outputFiles[0].contents);
		return loadBundle(bundlePath);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

export function replaceGlobal(t, name, value) {
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
	Object.defineProperty(globalThis, name, { configurable: true, value });
	t.after(() => {
		if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		else Reflect.deleteProperty(globalThis, name);
	});
}
