# Development checks

- Use Node.js 24 and install the locked toolchain with `npm ci`.
- After each code change, run `npm run lint:fix`, inspect the changes, and fix remaining diagnostics using the code's intended behavior.
- Before delivering code changes, run `npm run check`. This runs ESLint with zero warnings allowed, TypeScript checking, and the production build. Resolve all errors and warnings before delivery; rerun after any subsequent fix.
- Do not silence diagnostics with blanket rule overrides, suppression comments, `any`, or unchecked casts. Use CSS classes for fixed styles, handle Promise rejections, and use the owning document/window for UI work.
- If a check cannot run because of an environment or dependency problem, report the exact blocker and do not claim it passed.
- Run focused behavioral checks when changing async ordering, file operations, or compatibility behavior. Run `npm test` for the permanent utility regression suite.
- Keep `main.js` as ignored build output. Releases must include `main.js`, `manifest.json`, and `styles.css`.
