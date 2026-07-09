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

## Event-Loop / Async Footguns
The event loop drains the **microtask** queue (resolved Promises, `queueMicrotask`,
`await` continuations) completely between each **macrotask** (`setTimeout`,
`setInterval`, I/O). A tight microtask loop can therefore starve timers and I/O.

```javascript
// Ordering surprise: microtasks (Promise) run BEFORE macrotasks (setTimeout).
setTimeout(() => console.log("macro"), 0);   // logs SECOND
Promise.resolve().then(() => console.log("micro"));  // logs FIRST

// FOOTGUN: forEach does not await — the callback promises float, the loop
// finishes before any of them resolve.
items.forEach(async (i) => { await save(i); });   // WRONG: fire-and-forget
for (const i of items) { await save(i); }          // RIGHT: sequential
await Promise.all(items.map((i) => save(i)));      // RIGHT: concurrent

// queueMicrotask to defer without a macrotask hop:
queueMicrotask(() => reconcile());
```
- **Floating promises**: an un-awaited promise that rejects becomes an
  `unhandledRejection`. In Node 15+ an unhandled rejection **terminates the
  process by default**. Always `await`, `.catch()`, or `void promise` deliberately.
- **`Promise.all` is fail-fast**: the first rejection rejects the whole thing and
  the other results are lost. Use `Promise.allSettled` when you need every outcome.
- Source: nodejs.org docs (event loop) / MDN microtasks. See References.

## Error Handling Idioms
```javascript
// async errors need try/catch AROUND the await, not a .catch on a synchronous call:
try {
  const r = await fetchUser(id);
} catch (err) {
  logger.error({ err }, "fetchUser failed");   // handle, don't swallow
}

// A rejected promise you don't await must be handled or it crashes the process:
someAsync().catch((e) => reportError(e));

// Preserve the cause (ES2022): new Error(msg, { cause })
throw new Error("import failed", { cause: originalError });

// Node: catch unhandled rejections globally as a safety net, not primary handling:
process.on("unhandledRejection", (reason) => { /* log + exit */ });
```

## Security and Supply-Chain Gotchas
- **Prototype pollution (CWE-1321)**: merging attacker-controlled keys such as
  `__proto__`, `constructor`, or `prototype` into an object can mutate
  `Object.prototype` and affect every object in the process — a classic path to
  privilege escalation and denial of service. (CWE-1321 "Improperly Controlled
  Modification of Object Prototype Attributes ('Prototype Pollution')" —
  cwe.mitre.org.)
```javascript
// FOOTGUN: naive deep-merge of untrusted JSON pollutes the prototype.
function merge(t, s) { for (const k in s) { /* ... */ t[k] = s[k]; } }  // vulnerable
merge({}, JSON.parse('{"__proto__":{"isAdmin":true}}'));  // ({}).isAdmin === true

// SAFE: reject dangerous keys; prefer Map, Object.create(null), or structuredClone.
const DANGEROUS = new Set(["__proto__", "constructor", "prototype"]);
for (const k of Object.keys(src)) if (!DANGEROUS.has(k)) target[k] = src[k];
```
- **XSS (CWE-79)**: never assign untrusted strings to `innerHTML` / `outerHTML` /
  `insertAdjacentHTML`. Use `textContent`, or sanitize (DOMPurify), or set the
  Trusted Types CSP.
- **ReDoS (CWE-1333)**: a regex with nested/overlapping quantifiers (`(a+)+$`) on
  attacker input can hang the single thread. Avoid catastrophic backtracking; bound
  input length; prefer linear-time matchers.
- **npm supply chain**: typosquatting (`crossenv` vs `cross-env`) and malicious
  `postinstall` scripts are live. Install with `npm ci --ignore-scripts` in CI,
  run `npm audit` (and fix), and pin via the committed `package-lock.json`.
- Source: cwe.mitre.org (CWE-1321, CWE-79, CWE-1333), docs.npmjs.com. See References.

## Testing Conventions
```javascript
import { test } from "node:test";
import assert from "node:assert/strict";

test("groups by role", () => {
  const g = groupByRole([{ role: "admin" }]);
  assert.equal(g.admin.length, 1);            // meaningful assertion, not just "ran"
});

test("rejects bad input", async () => {
  await assert.rejects(() => parse(""), /empty/);   // test the error path
});
```
- Node's built-in runner: `node --test`. `vitest` for watch mode + coverage
  (`vitest --coverage`, target >= 80%). No test should pass without an assertion.

## Performance Traps
- **`await` in a loop** serializes independent I/O — batch with `Promise.all`
  when the calls don't depend on each other.
- **Array `.includes()` in a loop** is O(n) each time — build a `Set` for repeated
  membership checks.
- **`JSON.parse(JSON.stringify(x))`** for deep clone is slow and drops
  `Date`/`Map`/`undefined` — use `structuredClone(x)` (Node 17+).
- **Blocking the single thread** with heavy sync CPU work freezes all requests —
  offload to a `worker_threads` Worker.

## Version-Specific Gotchas (dated, sourced)
- **Node.js 24 "Krypton"** is the current active LTS (entered LTS 2025-10-28),
  latest 24.18.0 (2026-06-23), EOL 2028-04-30; ships the stable `node --test`
  runner and `--experimental-strip-types` for running `.ts` directly.
  [endoflife.date/nodejs + nodejs.org/en/about/previous-releases, retrieved 2026-07-09]
- **Node.js 22 "Jod"** is in maintenance LTS (EOL 2027-04-30); **Node.js 20 "Iron"**
  reaches end-of-life **2026-04-30** — migrate off it.
  [endoflife.date/nodejs, retrieved 2026-07-09]
- **Unhandled promise rejections terminate the process** by default since Node 15
  (`--unhandled-rejections=throw`) — a floating rejecting promise crashes you.
  [nodejs.org docs, retrieved 2026-07-09]
- **`fetch`** is a stable global since Node 21 (available/experimental from 18) —
  no `node-fetch` needed. [nodejs.org docs, retrieved 2026-07-09]

## References (retrieved 2026-07-09)
- Node release schedule: https://endoflife.date/nodejs
- Node previous releases (LTS codenames): https://nodejs.org/en/about/previous-releases
- Event loop / timers: https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick
- MDN microtasks: https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide
- CWE-1321 (Prototype Pollution): https://cwe.mitre.org/data/definitions/1321.html
- CWE-79 (Cross-site Scripting): https://cwe.mitre.org/data/definitions/79.html
- CWE-1333 (Inefficient Regular Expression Complexity / ReDoS): https://cwe.mitre.org/data/definitions/1333.html
- npm audit: https://docs.npmjs.com/cli/commands/npm-audit
