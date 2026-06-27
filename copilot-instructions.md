---
description: "Strict workspace instruction for the Obsidian Monokakido Copilot plugin. Use when editing or generating repository files."
applyTo: "**/*"
---

Use the existing repository conventions and keep changes limited to the requested scope.

- Preserve the current TypeScript plugin structure in `src/`, including `obsidian` imports, plugin lifecycle methods, settings handling, and command registration.
- Keep formatting and comments consistent with the repository style. Existing source files use TypeScript with descriptive JSDoc-style comments and mixed Chinese/Japanese annotations.
- Prefer minimal, targeted changes rather than broad refactors. Do not modify unrelated files or workflows.
- Maintain valid Obsidian plugin schema in `manifest.json` and keep build-related files such as `package.json`, `tsconfig.json`, and `esbuild.config.mjs` compatible with the current build process.
- When editing Markdown documentation in `README.md` or `docs/`, use concise explanations and preserve the existing bilingual approach where appropriate.
- Avoid introducing new dependencies or major architectural changes unless explicitly requested.
