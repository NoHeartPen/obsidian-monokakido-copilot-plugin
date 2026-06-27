# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development

```bash
npm run dev          # Watch mode — rebuilds main.js on every save
npm run build        # Production build — runs tsc type-check first, then esbuild minified bundle
npm run version      # Bump version: reads $npm_package_version, writes manifest.json + versions.json, stages both
```

There is no test suite. The build output `main.js` is committed to the repo (standard Obsidian plugin convention).

## Architecture

This is a small Obsidian plugin (~220 lines of TS) that lets users double-press the Option/Alt key to look up the word at the cursor in the Monokakido dictionary app.

### Entry point & plugin lifecycle

[src/main.ts](src/main.ts) exports a default `MonokakidoCopilotPlugin` class extending `Plugin`. In `onload()`:
1. Loads settings via `loadData()` merged onto defaults
2. Registers `keyup`/`keydown` DOM event handlers on `window` for double-press detection
3. Adds a ribbon icon (file-clock) and two commands (`open-history`, `search-cursor-word`)
4. Registers a settings tab

### Module-level settings — critical pattern

`PLUGIN_SETTINGS` is a mutable `const` object declared at module scope in [src/main.ts](src/main.ts). Both the plugin instance **and** all utility modules import this directly to read config. `loadSettings()` and `saveSettings()` sync `this.settings` ↔ `PLUGIN_SETTINGS`. This means utility functions can read settings without being passed the plugin instance — but also means the object is shared mutable state. When adding settings, update `PluginSettingsInterface`, the `PLUGIN_SETTINGS` defaults, the settings tab in `SettingTab`, and the load/save sync in `MonokakidoCopilotPlugin`.

### Utility modules (flat structure under `src/utils/`)

| Module | Purpose |
|---|---|
| [cursor-word-utils.ts](src/utils/cursor-word-utils.ts) | Orchestrator: `searchWordAtCursor()` → get context → analyze → write history → dispatch search |
| [analyze-word-utils.ts](src/utils/analyze-word-utils.ts) | Word extraction: POSTs to morpheme analysis API for Japanese text (kana), whitespace scanning for English |
| [open-dict-utils.ts](src/utils/open-dict-utils.ts) | Opens dictionary: substitutes word into URL scheme template (`<text_to_search>`, `<文字列>`, or `{w}`), or copies to clipboard |
| [history-utils.ts](src/utils/history-utils.ts) | Appends query to a vault markdown file with context, word, backlink, and blank memo line |

### Search flow

Double-press Alt/Option (within 500ms) → `getContextAndIndex()` gets editor line or selection → `analyzeCursorWord()` either POSTs to the `morphemeAnalysisAPI` (Japanese) or extracts whitespace-bounded word (English) → `writeToHistory()` appends to vault markdown → `doSearch()` opens URL scheme or copies to clipboard. On mobile, `searchByOpenUrl` is always forced to `true`.

### Double-press detection

Two handlers: `onKeyUpHandler` tracks inter-keyup interval (<500ms = double press), `onKeyDownHandler` sets `lastKeyWasDouble` flag to suppress spurious triggers when a different key is pressed between the two Alt presses.

## Conventions

- **Preserve the existing plugin structure** — keep `src/main.ts` as the single entry point, utility modules in `src/utils/`. Avoid introducing new dependencies or broad refactors unless explicitly requested.
- **Comments** use Japanese/Chinese mixed with English. Settings interface fields and exported functions have `/** JSDoc */` blocks — match this style.
- **Documentation is trilingual** (English `*.md`, Japanese `*.ja.md`, Chinese `*.zh.md`). When editing docs, mirror changes across languages or note what needs translation.
- **esbuild** bundles to `main.js` (CJS, es2018). `obsidian`, `electron`, `@codemirror/*`, `@lezer/*`, and Node builtins are externalized — they come from the Obsidian runtime.
- **manifest.json** follows Obsidian community plugin schema. `isDesktopOnly: false` — the plugin works on mobile and adapts behavior accordingly.
- **No new dependencies** without explicit request. The plugin intentionally has zero runtime dependencies beyond the Obsidian API.
