---
approved_by: human
approved_at: 2026-07-21T13:00:00.000Z
gate_crossed: implementation → todo
iron_loop: true
title: "The gate-number fence module covers its own reachable branches — the margin it ate today, restored honestly"
type: implementation
parent_plan: none
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
files:
  - "tests/gate-numbers-fence.test.js"
scope_extension:
  authorized_by: human
  authorized_at: 2026-07-21
  reason: >
    REGRESSION REPAIR. The gate-number fence module src/lib/human-facing-scan.js,
    added today (v6.13.6), lands at 97.27% line / 86.92% branch — the lowest in
    the report — and dragged whole-repo coverage from 99.37% to 98.99%, BELOW the
    99 floor. Measured: `npm test` exits 1, `[CTOC test-gate] FAIL coverage
    98.99% < 99%`. The number had been flapping across the floor for several
    commits; executors reported the runs that landed at 99.02, and it has now
    settled below. This is coverage of a NEW module's reachable edge-case
    branches — real behavior, not theatre — that did not exist when the earlier
    "no untested code to add" finding was made. Test-only; no source change.
---

# The fence module covers its own reachable branches

`src/lib/human-facing-scan.js` (the TypeScript-AST gate-number fence, added today)
is at 97.27% line / 86.92% branch. It is the single largest drag on repository
coverage and has pushed the whole-repo number below its own 99 floor — the gate
FAILS (`npm test` exit 1, `coverage 98.99% < 99%`).

The honest fix is to cover the module's REACHABLE branches with real fixtures.
Not the floor (a ratchet only rises). Not a mock. Not the defensive branches that
no real input reaches.

## Reachable branches to cover — real behavior, real fixtures

Each is a genuine edge case the fence must handle, driven by a real input, with an
assertion a caller relies on:

1. **`:333-335` — a registry entry whose resolved path escapes the project root.**
   `resolveUnderRoot` returns `null`; the scan must return
   `available: false, reason: 'registry entry … resolves outside the project root'`.
   Fixture: a registry entry with a `../`-escaping relative path. Asserts the
   confinement guarantee — a registry cannot make the fence read outside root.

2. **`:491-493` — a scanned module with a syntax error.** `parseDiagnostics.length
   > 0` → `available: false, reason: '… syntax error(s)'`. Fixture: a `.js` file
   with a deliberate syntax error. Asserts the fence reports UNAVAILABLE on
   unparseable input rather than silently returning an empty findings list (the
   false-green shape this whole module exists to refuse).

3. **`:466-469` — an unreadable subdirectory in the screen-module walk.**
   `readdirSync` throws → the entry is skipped, not crashed. Induce cross-platform
   by replacing a walked subdirectory with a regular file (`ENOTDIR`), the same
   real-fault technique the sibling stale-scan slice uses — NOT `chmod` (platform
   dependent), NOT a mock. Asserts an unreadable corner of the tree degrades to
   "not a screen module" rather than taking down the sweep.

4. **`:481-484` — an unreadable/undirectory module file.** `readFileSync` throws
   (`EISDIR` when the path is a directory) → `available: false, reason: 'could not
   read …'`. Induce cross-platform with the directory-named-file technique.
   Asserts the fence says it could-not-look rather than returning empty findings.

## Deliberately NOT covered — documented as defensive, not faked

These branches are reached only by input the product cannot produce; faking them is
the theatre this codebase fences. Record them in the plan, do not write a case:

- **`:172-174` — `ExternalModuleReference` (`import x = require('…')`).** A
  TypeScript-only construct; the scanned corpus is `.js` parsed as `ScriptKind.JS`.
  If a real crafted fixture genuinely reaches it under JS parsing, cover it; if not,
  document it as a TypeScript-syntax branch unreachable from the JS corpus.
- **`:265-267` and `:486-490` — the `catch` around `ts.createSourceFile`.** The
  module's own comment states createSourceFile is LENIENT and records syntax errors
  in `parseDiagnostics` rather than throwing. The throw path is defensive. If no
  real input makes it throw, document it; do not fabricate a throw with a mock.

## Decisions Taken Under Ambiguity

### The uncovered lines were re-measured against the live file, not trusted from the brief

Empirical coverage of `src/lib/human-facing-scan.js` (run: `node --experimental-test-coverage
--test-coverage-include=src/lib/human-facing-scan.js --test tests/gate-numbers-fence.test.js`)
reports uncovered lines `173-174 266-267 334-335 468-469 483-484 489-490 492-493`.
The brief's cited numbers had drifted by one to three lines; the four reachable
targets map to `334-335`, `468-469`, `483-484`, `492-493`, and the ESM-specifier
exclusion `173-174` turned out to be reachable too (see next entry).

### Branch `173-174` is NOT the TypeScript `ExternalModuleReference` — it is the ESM import specifier, and it is reachable

The brief classified `172-174` as `ExternalModuleReference` (`import x = require()`),
a TypeScript-only construct, and told me to document it as unreachable. Read against
the live file, lines `173-174` are the `return true` for the
`ImportDeclaration`/`ExportDeclaration` module-specifier exclusion — plain
ECMAScript-module syntax (`import a from './gate 3'`), which parses clean under
`ScriptKind.JS` and IS reachable with a real fixture. The genuine
`ExternalModuleReference` check is line `176`, whose `return true` is a branch (not a
standalone line) and is correctly TypeScript-only. So I COVER `173-174` with a real
ESM fixture and document `176` as the defensive TypeScript-only branch.

### Branch `483-484` has NO cross-platform inducer — the brief's directory-named-file technique does not reach it

The brief said to induce the `readFileSync` failure at `483-484` with "the
directory-named-file technique (`EISDIR`), cross-platform." Proven false by probe: in
`findUnregisteredScreens`, `walkDir` adds a path to `jsFiles` only when the directory
entry reports `isFile() && endsWith('.js')`. A directory named `a.js` has
`isDirectory()` true, so the walk RECURSES into it and never passes it to
`readFileSync`; `EISDIR` is never reached (probe: `findUnregisteredScreens` on a tree
with `src/a.js` as a directory returns `{ available: true, modules: [] }`). This is
the exact conclusion the sibling stale-scan slice reached for its `read-failed`
branch: an `isFile()`-gated walk excludes a non-regular file BEFORE the read. The only
real inducers are permission removal (`chmod 000` → `EACCES`), a delete race (flaky),
or a mock (forbidden). I follow the sibling's established pattern: drive it with
`chmod 000` and announce a LOUD skip where revocation is unavailable (win32, or uid 0
where mode bits are bypassed), guarded by `CAN_REVOKE_READ`. On this machine (darwin,
uid 501) the branch IS covered, which is where the failing gate is measured. This is
test-only — no source change is needed to reach the branch, so the STOP-AND-ASK scope
rule does not apply.

### Branch `334-335` (registry escapes root) is driven by the filesystem root, since the frozen registry cannot carry a `../` entry

The brief's fixture was "a registry entry with a `../`-escaping relative path."
`SCREEN_MODULES` is `Object.freeze`d and internal, so no test can inject such an
entry, and injectability would need a source change. The identical confinement guard
(`resolveUnderRoot` returning `null`) fires WITHOUT a source change when the project
root is the filesystem root: a clean `src/commands/start.js` then resolves to
`/src/commands/start.js`, which the guard rejects because `root + separator` is `//`
and the absolute path does not start with it (verified cross-platform by reasoning:
on Windows the root is `C:\` and `root + sep` is `C:\\`, which the entry likewise
does not start with). This exercises the same caller-visible guarantee the brief
asked for — a registry can never make the fence read outside root — via the public
API. `scanRegistry(fsRoot)` returns at the first entry without touching the
filesystem.

### Branch `468-469` (readdir throws) is driven by `src` being a regular file, not a nested subdirectory

The brief said "replacing a walked SUBdirectory with a regular file." `walkDir` only
recurses into entries the parent `readdirSync` already classified as directories, so a
nested file is never handed to `readdirSync` — the only reachable `readdirSync`-throw
point is the initial `walkDir(srcDir)` call. Making `src` itself a regular file makes
`existsSync(srcDir)` true (a file exists, so the not-a-CTOC-tree clean branch does not
apply) and `readdirSync(src)` throw `ENOTDIR`, which the `catch` swallows. Genuine
cross-platform I/O fault, no permission bits, no mock — the same ENOTDIR technique the
sibling slice uses.

### Defensive branches documented, not faked

- `176` — `ExternalModuleReference` (`import x = require('…')`): TypeScript-only. Under
  `ScriptKind.JS` this is a syntax error, which sets `parseDiagnostics` and makes
  `scanFile` return `available: false` BEFORE the walk ever calls
  `isIdentifierInDisguise`, so the `return true` cannot execute. Unreachable from the
  JS corpus. Not covered; not faked.
- `266-267` and `489-490` — the `catch` around `ts.createSourceFile` in `scanFile` and
  `findUnregisteredScreens`. The module's own comment states `createSourceFile` is
  LENIENT: it records syntax errors in `parseDiagnostics` rather than throwing (proven
  by the syntax-error fixtures, which reach the `parseDiagnostics` branch at `271`/`492`,
  never the `catch`). No real input makes it throw. Defensive; not covered; not faked.

(Executor continues numbering here, `###` subheadings only, numbers as inline code
spans never fenced `#` lines.)

## Execution Plan (Steps 8-16)

### Step 8 — TEST (TDD)
- [x] Complete — evidence in this step's section and this plan's verification log; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
Write the new cases and run. They exercise EXISTING branches in a shipped module,
so each may be green on first run — PROVE each bites by mutating the branch it
covers (e.g. make the path-escape guard return the entry instead of `available:
false`) and showing the case goes RED, then revert. Report each mutation. A case
that does not bite is the coverage theatre this repository forbids.

### Step 9 — PREPARE
- [x] Complete — evidence in this step's section and this plan's verification log; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
Re-read `src/lib/human-facing-scan.js` and confirm the cited line numbers and
branch shapes against the current file before writing fixtures.

### Step 10 — IMPLEMENT
- [x] Complete — evidence in this step's section and this plan's verification log; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
Add the four reachable-branch cases to `tests/gate-numbers-fence.test.js`. Fixtures
in a per-test tmpdir, cleaned up. No source change; if a branch turns out to need a
source change to be reachable, STOP AND ASK.

### Step 11 — REVIEW
- [x] Complete — evidence in this step's section and this plan's verification log; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
Each new case asserts a caller-visible guarantee (confinement, unavailable-on-
unparseable, degrade-not-crash), not merely that a line executed.

### Step 12 — OPTIMIZE
None.

### Step 13 — SECURE
- [x] Complete — evidence in this step's section and this plan's verification log; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
The fixtures write only under a tmpdir; no path escapes it.

### Step 14 — VERIFY
- [x] Complete — evidence in this step's section and this plan's verification log; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
`npx eslint tests/gate-numbers-fence.test.js --max-warnings 0`; `node --test
tests/*.test.js` fail 0; `npm test` real gate must now PASS (exit 0) with
whole-repo coverage back ABOVE 99 — report the measured figure and the
human-facing-scan.js per-file line/branch numbers before and after. Run `npm test`
TWICE and report both, because the number flaps run-to-run near the floor and one
passing run is not proof it reliably clears it. If it does NOT reliably clear 99,
say so plainly — the residual is measurement nondeterminism, a separate deeper
issue, not something to paper over by lowering the floor (forbidden) or faking a
defensive branch. Floor 99 untouched; false-green + both reachability + gate-words
fences pass; no baseline entry added.

### Step 15 — DOCUMENT
The defensive-branch documentation above IS the record; confirm it names each
uncovered line and why.

### Step 16 — FINAL-REVIEW
- [x] Complete — evidence in this step's section and this plan's verification log; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
`npm test` passes reliably (both runs), coverage is back above the floor with
margin, and every new case was proven to bite.
