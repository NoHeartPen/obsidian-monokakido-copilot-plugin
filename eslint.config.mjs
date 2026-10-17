import { defineConfig } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig([
	{ ignores: ['main.js', '.agents/**', 'node_modules/**'] },
	...obsidianmd.configs.recommended,
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				// Resolve the project from this config, including when ESLint runs in an editor.
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			'obsidianmd/prefer-active-doc': 'error',
			// Pinned Obsidian 1.8.7 types do not expose the 1.13 declarative API.
			'obsidianmd/settings-tab/prefer-setting-definitions': 'off',
			'obsidianmd/ui/sentence-case': ['warn', {
				brands: ['Monokakido Copilot'],
				enforceCamelCaseLower: true,
			}],
		},
	},
	{
		// These scripts run only in Node.js; mobile API restrictions apply to src/.
		files: ['esbuild.config.mjs', 'version-bump.mjs', 'eslint.config.mjs'],
		rules: {
			'obsidianmd/no-nodejs-modules': 'off',
		},
	},
]);
