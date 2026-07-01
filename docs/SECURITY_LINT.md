# Security Lint Policy (LH1)

CTOC treats linter warnings as bugs ("time is a vector; today's warning is
tomorrow's crash"). As of v6.9.9x (plan LH1) the five `eslint-plugin-security`
rules below are **errors**, and the lint gate runs with **`--max-warnings 0`**
(`package.json` → `npm run lint` = `eslint . --max-warnings 0`). A raw
filesystem or `RegExp` call on a computed value now **fails the build**.

## The rules (production code, `src/**`)

| Rule | Severity | How it's satisfied |
|---|---|---|
| `security/detect-non-literal-fs-filename` | **error** | All computed-path fs calls route through `src/lib/safe-fs.js` |
| `security/detect-non-literal-regexp` | **error** | All non-literal `RegExp` construction routes through `src/lib/regex-utils.js` |
| `security/detect-unsafe-regex` | **error** | No catastrophic-backtracking regexes (LH1 rewrote all 14; multi-line matchers are now line-based parsers) |
| `security/detect-possible-timing-attacks` | **error** | No non-constant-time secret compares (the one hit was a markdown fence-char false positive; the variable was renamed) |
| `security/detect-non-literal-require` | **error** | No dynamic `require()`; callers use literal module paths |

`security/detect-child-process` stays `warn` (out of LH1 scope; highest-signal
rule, surfaced for human review — and under `--max-warnings 0` it is effectively
blocking anyway). `security/detect-object-injection` stays `off` (noisy, low
signal on trusted internal data).

## The two choke points

### `src/lib/safe-fs.js` — filesystem
The **single** file in `src/` allowed to call `fs.<method>()` on a
**computed / variable** path — the choke point governs non-static paths
specifically. Static fs calls elsewhere are fine and stay on raw `fs`: a string
literal, or `path.join()` over literals / `__dirname` (e.g.
`src/hooks/post-commit.js`'s `fs.existsSync(path.join(gitDir, 'MERGE_HEAD'))`),
is not flagged by `detect-non-literal-fs-filename`. This file carries the sole
`/* eslint-disable security/detect-non-literal-fs-filename */`.
Every wrapper validates its path argument (non-empty string, no NUL byte) and
**fails closed** before delegating to Node's `fs` — converting a heuristic
warning into a real, tested invariant. Behavior is validation-only: a successful
call is byte-for-byte identical to calling `fs` directly (no path normalization).
Exports carry `fs`'s own types (`@type` cast) so call sites type-check under
`tsc --checkJs` exactly as before.

**To read/write/move/delete a file in `src/`:** `const safeFs = require('./safe-fs')`
(or `'../lib/safe-fs'`) and call `safeFs.readFileSync(...)` etc. Never call raw
`fs` on a computed path outside `safe-fs.js`. File-descriptor calls that take a
number (e.g. `fs.readFileSync(0)` for stdin) stay on raw `fs` — they are not
paths and the rule does not flag them.

### `src/lib/regex-utils.js` — regular expressions
The **single** file allowed to call `new RegExp(<non-literal>)`. It carries the
sole `/* eslint-disable security/detect-non-literal-regexp */`. Exports:
- `escapeRegExp(str)` — escape regex metacharacters for safe literal interpolation.
- `safeRegExp(pattern, flags)` — the audited `new RegExp` constructor.

**To build a dynamic regex in `src/`:** route through `safeRegExp(...)`, and wrap
any *data*-derived fragment in `escapeRegExp(...)` first. Never call raw
`new RegExp(variable)` outside `regex-utils.js`.

## Tests (`tests/**`)
The five rules are **off** for test files. Tests legitimately exercise
`child_process`, dynamic paths, and dynamic regexes against fixtures and trusted
data — not a production security surface. Production code (`src/`) still enforces
every rule at `error`. This mirrors the pre-existing tests/ override for
`detect-child-process` / `detect-non-literal-fs-filename` / `detect-non-literal-require`.

## Why this over inline suppressions
990 fs + 45 other warnings could have been silenced with ~1000 inline
`eslint-disable` comments (silence, no invariant). Instead the codebase routes
through two audited choke points: a raw fs/RegExp call on a computed value is now
visible in exactly one place per concern and blocked everywhere else at build
time. The heuristic became an enforced architectural boundary.
