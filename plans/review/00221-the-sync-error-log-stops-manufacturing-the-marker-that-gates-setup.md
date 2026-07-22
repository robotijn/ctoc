---
approved_by: human
approved_at: 2026-07-22T12:10:26.339Z
gate_crossed: implementation → todo
---

---
title: "The plan-index sync error log stops manufacturing the marker that gates setup — the fourth of four producers, error path only"
type: implementation
parent_plan: none
depends_on: 00177-a-log-directory-manufactures-the-marker-that-gates-setup
priority: MEDIUM
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/hooks/PostToolUse.plan-index-sync.js"
  - "tests/posttooluse-plan-index-sync-coverage.test.js"
---

# The plan-index sync error log stops manufacturing the marker that gates setup

Plan 00177 closed two of four doors on the same defect: a best-effort log write
must never create `.ctoc/`, because a fabricated `.ctoc/` is read by setup and by
private root resolvers as proof a project exists. 00177 fixed the sync log's
DESTINATION (`resolveSyncLogDir`, which passes `undefined` into `sync-unit.js`'s
existing falsy-`logDir` guard). It did NOT fix the sibling ERROR log in the same
file — its own execution notes named it as "a fourth, error-path-only producer …
which uses `process.cwd()`" and reported it for scheduling (00177 lines 280-282).
This slice closes it.

## The mechanism, verified on disk

`src/hooks/PostToolUse.plan-index-sync.js:145-162`:

```js
function logError(err) {
  try {
    const safeFs = require('../lib/safe-fs');
    const logDir = path.join(process.cwd(), '.ctoc', 'logs');
    if (!safeFs.existsSync(logDir)) safeFs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, 'plan-index-sync.json');
    ...
    safeFs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  } catch {
    /* logging is best-effort */
  }
}
```

Two faults, both flagged by 00177:

1. **It manufactures the marker.** `mkdirSync(process.cwd()/.ctoc/logs, {
   recursive: true })` creates `.ctoc/` as a parent when it is absent.
2. **It anchors on `process.cwd()`**, not the plan's resolved root — the same
   over-rooting class 00177 fixed for the sync-log destination via
   `resolveSyncLogDir(root)`.

### How it is reached

`logError` is invoked ONLY on a sync exception or timeout, from `main()`:

- `:208` — `syncUnit(...).then(() => 'synced', (err) => { logError(err); return 'error'; })`
- `:212` — `logError(new Error('plan-index sync exceeded … budget …'))`
- `:218` — the outer `catch (err) { logError(err); }`

Unlike the third producer (`enforcement-log.js`, which fires on every whitelisted
plan Write), this one fires only when a sync FAILS — a genuinely off-nominal path.
That is why it is separated into its own slice: different reachability, a smaller
blast radius, and a simpler fix (a plain `writeFileSync`, with no `durable-log`
re-creation subtlety).

## The decision this slice settles

Same decision 00177 made three times already: **write only into a `.ctoc/` that
already exists; never create it.** What breaks, stated exactly: in a project with
no `.ctoc/`, a sync-error diagnostic is **not persisted** to
`plan-index-sync.json`. The failure is already best-effort by its own comment
(`/* logging is best-effort */`), and in an un-initialised project there is no
plan-index and no CTOC state for the diagnostic to correlate with anyway.

**Scope note — this slice fixes the marker manufacturing, not the `process.cwd()`
routing.** 00177 set the precedent for the sibling `appendLog` fallback: it left
the `process.cwd()` base in place and made it HARMLESS with an existence guard,
reasoning that "the working directory will not have a `.ctoc/` unless it is
genuinely a project" (00177 lines 120-123). This slice follows that precedent
rather than re-plumbing the resolved root through `logError`'s three call sites —
which would be a correctness improvement (logging to the right project on a
symlinked/multi-root session) beyond the marker-manufacturing defect this finding
targets. The guard closes the door the finding is about; the routing nuance is
noted, not silently expanded into.

## Implementation Details

### File: `src/hooks/PostToolUse.plan-index-sync.js`
**Action:** MODIFY
**Purpose:** The sync error log writes into a project that exists, and never
creates one.
**Change Type:** modify-existing — one function, `logError`; plus adding it to the
module exports so the new guard branch is directly testable.

#### Change 1 — `logError` requires the configuration directory (`:145-162`)

```js
function logError(err) {
  try {
    const safeFs = require('../lib/safe-fs');
    // Never manufacture the marker that gates setup (plan 00177). A best-effort
    // diagnostic must not create `.ctoc/`; a fabricated marker is read as proof
    // the project exists, leaving it permanently half-initialised. Write only
    // into a `.ctoc/` that already exists; create only the `logs/` leaf beneath it.
    const ctocDir = path.join(process.cwd(), '.ctoc');
    if (!safeFs.existsSync(ctocDir)) return;      // nothing to log INTO — never CREATE
    const logDir = path.join(ctocDir, 'logs');
    if (!safeFs.existsSync(logDir)) safeFs.mkdirSync(logDir, { recursive: true }); // LEAF only
    const logPath = path.join(logDir, 'plan-index-sync.json');
    let log = [];
    if (safeFs.existsSync(logPath)) {
      try { log = JSON.parse(safeFs.readFileSync(logPath, 'utf8')); } catch { log = []; }
    }
    if (!Array.isArray(log)) log = [];
    log.push({ timestamp: new Date().toISOString(), source: 'PostToolUse.plan-index-sync', error: err && err.message });
    if (log.length > 500) log = log.slice(-500);
    safeFs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  } catch {
    /* logging is best-effort */
  }
}
```

The body below the guard is byte-for-byte the current logic (append-or-reset,
500-cap, write). Only the two lines that decide the destination change: guard on
`.ctoc/` existing, and create only the `logs/` leaf.

#### Change 2 — export `logError` (`:228`)

```js
module.exports = { isPlanMd, resolveSyncLogDir, logError };
```

`logError` is currently module-internal, so its new guard branch cannot be driven
deterministically in-process. Exporting it lets the coverage suite pin the branch
directly (00177 exported `resolveSyncLogDir` for exactly this reason). It adds no
production caller — `main()` still calls the local binding.

#### Dependencies
Unchanged: `require('path')`, lazy `require('../lib/safe-fs')`.

### Wiring — the live call sites

| new code | live call site | root |
|---|---|---|
| the `.ctoc/`-existence guard in `logError` | `main()` `:208`, `:212`, `:218` | the registered `PostToolUse` plan-index-sync hook, on a sync rejection / timeout / outer fault |
| the `logError` export | `tests/posttooluse-plan-index-sync-coverage.test.js` (the new in-process cases) | driven under `npm test` |

No new module. The guard is inside a function already on the live hook path; the
export exists to make the new branch testable, matching 00177's `resolveSyncLogDir`
export.

## Test Plan

### Tests: `tests/posttooluse-plan-index-sync-coverage.test.js`
**Action:** MODIFY (add cases; existing Layer-B subprocess cases UNCHANGED)
**Framework:** `node:test`

The existing subprocess `logError` cases (B3-B5) build their fixture with
`makeFixture`, which ALWAYS creates `.ctoc/logs` and `.ctoc/state`
(`:188-208`). So the new guard passes for every existing case and their behaviour
(append-preserves, corrupt-resets, non-array-coerces) is byte-for-byte unchanged.
Verified, not assumed — read `makeFixture` at Step 9.

New in-process cases (Layer A style — `logError` is now exported):

| # | Case | Fixture | Assertion |
|---|---|---|---|
| L1 | **an error log in an un-initialised directory creates no marker** | fresh tmp dir with NO `.ctoc/`; `process.chdir` into it (save/restore in `finally`); call `logError(new Error('boom'))` | `.ctoc/` does NOT exist in the tmp dir afterwards; the call did not throw. This is the reproduction and MUST be red before the change |
| L2 | **a real project still gets its diagnostic** | tmp dir WITH `.ctoc/`; chdir in; `logError(new Error('boom'))` | `.ctoc/logs/plan-index-sync.json` exists and its last entry names `boom` and `source: 'PostToolUse.plan-index-sync'` |
| L3 | **the leaf is created under an existing parent** | tmp dir with `.ctoc/` but NO `.ctoc/logs/`; chdir in; `logError(new Error('boom'))` | `.ctoc/logs/plan-index-sync.json` is created — the narrowing is to the PARENT marker only |
| L4 | **still best-effort on a hostile destination** | tmp dir where `.ctoc` exists as a FILE, not a directory; chdir in | `logError` does not throw |

`process.chdir` is used because `logError` anchors on `process.cwd()` by design
(see the scope note); every case saves and restores `process.cwd()` in a `finally`
so it cannot leak into sibling tests. Fixtures live under `os.tmpdir()` and are
removed in `finally`. No permission fixtures (a skip is a gate failure); L4 uses a
file-where-a-directory-is-expected instead.

Coverage: the new `.ctoc/`-absent → return branch is exercised by L1; the
write/leaf branches by L2/L3; the best-effort catch by L4. The existing B3-B5 keep
the append/reset/coerce arms covered. No new dark branch, so the 99 floor holds.

## Security Review

- **Path traversal:** the log path is composed only from `process.cwd()` +
  `.ctoc/logs/plan-index-sync.json`; no `err` content reaches a path segment (only
  `err.message` is stored as a value). Unchanged.
- **No secrets:** only `err.message` and a timestamp are recorded. `err.message`
  from a sync failure could carry a path; that was already the case and is
  unchanged by this slice — the file stays under the project's own `.ctoc/logs/`.
- **Fail-safe:** the function remains wrapped in a best-effort `try/catch`; a
  skipped or failed write never propagates — the hook still exits 0.
- **No new dependency; no new file write location; the only new export is a
  test seam with no production caller.**

## Execution Plan (Steps 8-16)

### Step 8: TEST — add cases L1-L4 in full, run ONLY this file, record the red output verbatim. L1 (and the no-marker portion) MUST be red against current `main` — current `logError` manufactures `.ctoc/` unconditionally. Any new case green before the change must be shown already-correct rather than vacuous, and the finding recorded.
### Step 9: PREPARE — re-read from disk: `src/hooks/PostToolUse.plan-index-sync.js:141-228` in full (the `logError` body, the three call sites at 208/212/218, and the current `module.exports`); `tests/posttooluse-plan-index-sync-coverage.test.js:183-320` to confirm `makeFixture` always creates `.ctoc/logs`+`.ctoc/state` (so B3-B5 stay green) and to match the file's Layer-A conventions. Confirm no OTHER caller of `logError` exists outside `main()`.
### Step 10: IMPLEMENT — one step, files as sub-items.
  - `src/hooks/PostToolUse.plan-index-sync.js` — Change 1 (the guard) and Change 2 (the export).
### Step 11: REVIEW — confirm `logError` cannot create `.ctoc/` on any path, including the outer catch and the best-effort inner catch. Confirm the append/reset/500-cap logic below the guard is byte-for-byte unchanged. Confirm `main()` still calls the local binding and its exit-0 contract is untouched. Confirm the export adds no production coupling.
### Step 12: OPTIMIZE — the guard adds one `existsSync`; in the un-initialised case it REMOVES a recursive `mkdirSync`, a read, a parse and a write, so the not-a-project error path gets cheaper.
### Step 13: SECURE — confirm nothing outside `process.cwd()/.ctoc/logs` is written, that the marker can no longer be manufactured under any working directory, and that `err.message` reaches only a value, never a path segment.
### Step 14: VERIFY — `node --test tests/posttooluse-plan-index-sync-coverage.test.js tests/w10-plan-index-sync-await.test.js tests/hooks-do-not-manufacture-the-project-marker.test.js` green, then the full gated run `npm test` (`# fail 0`, coverage at or above the floor, 0 skipped). Lint the changed file. No git operations.
### Step 15: DOCUMENT — a JavaScript doc on `logError` stating the rule and naming this as the fourth of the four producers 00177 identified; note that the `process.cwd()` base is deliberately kept and made harmless by the guard (00177 precedent), and that re-routing to the resolved root is a separate, unshipped improvement.
### Step 16: FINAL-REVIEW — report a directory listing BEFORE and AFTER a forced `logError` in an empty directory, verbatim, showing `.ctoc/` absent both times. Report every decision taken under ambiguity, including the choice not to thread the resolved root.

## Decisions Taken Under Ambiguity

1. **The `process.cwd()` base is kept and made harmless by the existence guard,
   NOT re-plumbed to the resolved root.** 00177 made exactly this call for the
   sibling `appendLog` fallback; threading `root` through `logError`'s three call
   sites is a cross-root routing improvement beyond the marker-manufacturing defect
   this finding targets. Recorded so the next reader does not re-derive it.
2. **`logError` is exported to make the new guard branch testable in-process.**
   00177 exported `resolveSyncLogDir` for the same reason. The export has no
   production caller; `main()` uses the local binding.
3. **Fixed as its OWN slice, separate from the third producer
   (`enforcement-log.js`).** Different module, different existing test file,
   different reachability (this one is error-path-only; that one is on every
   whitelisted plan Write) and a simpler fix (a plain `writeFileSync` with no
   `durable-log` re-creation subtlety). Two focused slices beat one 4-file slice
   spanning two unrelated modules.
4. **`process.chdir` is used in the new in-process cases, with save/restore in a
   `finally`.** `logError` anchors on `process.cwd()` by design; driving it
   deterministically requires controlling the working directory, and the
   save/restore prevents any leak into sibling tests.
5. **A bare, empty `.ctoc/` still receives the diagnostic (L3 variant).** The rule
   is "do not CREATE the marker", not "judge project health" — one owner for that
   judgement (setup). Same call 00177 made three times.

## Decisions Taken During Execution

### The seam was a plain recursive `mkdirSync`, no durable-log layer
The recursive-recreate seam the previous two marker-door fixes hit is ABSENT here.
`safeFs.mkdirSync`/`writeFileSync` are thin validation wrappers that delegate
straight to `fs` (no `path.dirname` re-creation), so the marker fabrication was the
single line `safeFs.mkdirSync(logDir, { recursive: true })` at `:149`, where
`logDir` is `process.cwd()/.ctoc/logs`. The guard is therefore a plain early
`return` before that line — no deeper layer needed. Verified against the current
`src/lib/safe-fs.js` on disk.

### The false-negative guard was proven by exporting first, then guarding
The export (Change 2) was applied BEFORE the guard (Change 1) so L1 could be
observed genuinely RED against the still-fabricating body: `1` red, with `.ctoc/`
actually created (`actual: true`). After the guard, all `51` targeted tests pass.
L2/L3/L4 were green before the guard too — each is an already-correct behaviour of
the old code (real project persists, leaf still created, hostile-file swallowed),
not vacuous; they now lock behaviour preservation.

### No plan corrections
Every cited line matched the current code (`logError` at `:145-162`, call sites at
`:208`/`:212`/`:218`, exports at `:228`). `logError` has no caller outside `main()`.
`makeFixture` always creates `.ctoc/logs`+`.ctoc/state`, so B3-B5 stayed byte-for-byte
green. No fixture outside the grant depended on the fabrication.
