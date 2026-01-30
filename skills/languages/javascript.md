# JavaScript CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude suggests callback patterns — use async/await consistently
- Claude uses `var` in examples — always `const`/`let`
- Claude forgets `Object.groupBy()` exists (ES2025)
- Claude suggests lodash for things now native (groupBy, structuredClone)

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `node 24+` LTS | Runtime with native test runner | Older Node |
| `eslint 9` flat config | Linting | Legacy .eslintrc |
| `vitest` or `node --test` | Testing | Jest (heavier) |
| `vite` | Dev server, bundling | Webpack (slower) |
| `biome` | Format + lint combo | Multiple tools |

## Patterns Claude Should Use
```javascript
// ES2025+ patterns
const grouped = Object.groupBy(users, (u) => u.role);

// Promise.withResolvers (ES2025)
const { promise, resolve, reject } = Promise.withResolvers();

// Temporal API (when available)
const now = Temporal.Now.plainDateTimeISO();

// Structured clone for deep copy
const copy = structuredClone(original);
```

## Anti-Patterns Claude Generates
- `==` loose equality — always `===`
- `for...in` on arrays — use `for...of` or `.forEach()`
- `new Array(n)` — use `Array.from({ length: n })`
- Floating promises without handling — always await or catch
- `innerHTML = userInput` — XSS vulnerability

## Version Gotchas
- **ES2026**: `Error.isError()` for cross-realm checks
- **ES2025**: `Object.groupBy`, `Promise.withResolvers`, Set methods
- **Node 24 LTS "Krypton"**: Active LTS (Jan 2026), native test runner, `--experimental-strip-types`
- **Node 22 LTS**: Maintenance until April 2027
- **Node 20 LTS**: Maintenance until April 2026
- **Node 20.x**: Maintenance LTS until April 2026
- **With modules**: Use `.js` extension in imports for ESM
- **With fetch**: Native in Node 18+, no need for `node-fetch`
