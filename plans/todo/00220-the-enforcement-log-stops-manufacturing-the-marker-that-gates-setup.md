---
approved_by: human
approved_at: 2026-07-22T12:10:26.309Z
gate_crossed: implementation → todo
---

---
title: "The enforcement log stops manufacturing the marker that gates setup — the third of four producers, on the live whitelist path"
type: implementation
parent_plan: none
depends_on: 00177-a-log-directory-manufactures-the-marker-that-gates-setup
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/enforcement-log.js"
  - "tests/enforcement-log.test.js"
---

# The enforcement log stops manufacturing the marker that gates setup

Plan 00177 (v6.13.12) closed two of four doors: a best-effort log write must
never create `.ctoc/`, because a fabricated `.ctoc/` is read by setup and by three
private root resolvers as proof that a project exists, leaving projects
permanently half-initialised. 00177 fixed `PreToolUse.Write.js` `appendLog` and the
`PostToolUse.plan-index-sync.js` sync-log destination. Its own execution notes
named the two remaining producers and reported them for scheduling rather than
fixing them (00177 lines 266-282). This slice closes the **third**:
`src/lib/enforcement-log.js` `logEnforcement`, which sits on the LIVE enforcement
path — it fires on every whitelisted plan-markdown Write.

## The mechanism, verified on disk

`src/lib/enforcement-log.js:41-50`:

```js
function logEnforcement(entry, root) {
  const logDir = path.join(root, '.ctoc', 'logs');
  if (!safeFs.existsSync(logDir)) safeFs.mkdirSync(logDir, { recursive: true });

  return durableLog.appendEntry(
    logPathFor(root),
    { timestamp: new Date().toISOString(), ...entry },
    { maxEntries: MAX_ENTRIES }
  );
}
```

`mkdirSync(root/.ctoc/logs, { recursive: true })` creates `.ctoc/` as a parent.

**The load-bearing subtlety this slice must respect: guarding that local `mkdirSync`
alone is INSUFFICIENT.** `durableLog.appendEntry` creates the same parent again
(`src/lib/durable-log.js:207-211`):

```js
function appendEntry(logPath, entry, options) {
  const dir = path.dirname(logPath);            // = root/.ctoc/logs
  if (!safeFs.existsSync(dir)) {
    safeFs.mkdirSync(dir, { recursive: true });
  }
  ...
```

So even with the local `mkdirSync` removed, the very next line manufactures the
marker. **The fix must RETURN before `appendEntry` is ever called** when `.ctoc/`
is absent — not merely guard the local directory creation.

### How it is reached — the live whitelist path

`src/hooks/PreToolUse.Edit.js` requires the module (`:54`) and calls it from BOTH
enforcement outcomes with the resolved `project_root`:

- `allow(outcome, info)` — `:388-401` — `enforcementLog.logEnforcement({...}, info.project_root)`
- `block(reason, info)` — `:366-379` — `enforcementLog.logEnforcement({...}, info.project_root)`

A `plans/**/*.md` Write is WHITELISTED, so the enforcement delegate runs
`allow('whitelist', { project_root: root })` on every plan write — and that path
does `mkdirSync(root/.ctoc/logs, { recursive: true })`. In a directory that is not
yet a CTOC project (`root` resolving to a fresh checkout, or `process.cwd()` on a
bad resolution), that write manufactures `.ctoc/` and the project reads as
"already set up" forever after. This is the exact defect 00177 fixed at its two
sites; this is the third site, and it is the one on the hot path.

**Both call sites IGNORE the return value** (`:369-378` and `:390-399` wrap the
call in a bare `try { ... } catch { /* fail open on log error */ }` and use nothing
it returns). Verified by reading both. So an early `return null` cannot break
enforcement.

## The decision this slice settles

00177 already decided this class: **write only into a `.ctoc/` that already exists;
never create it.** This slice applies that same decision at the third site. What
breaks, stated exactly: in a project with no `.ctoc/`, an enforcement decision is
**not persisted to `enforcement.json`**. Nothing else changes — the enforcement
decision itself (allow/block) is UNAFFECTED; only its durable audit copy is skipped,
in a directory that has no CTOC state to correlate it with. Both call sites already
declare the write best-effort (`/* fail open on log error */`), and an operation
that is best-effort by design must not have a permanent side effect on project
identity.

## Implementation Details

### File: `src/lib/enforcement-log.js`
**Action:** MODIFY
**Purpose:** The enforcement log writes into a project that exists, and never
creates one.
**Change Type:** modify-existing — one function, `logEnforcement`

#### Change — `logEnforcement` requires the configuration directory (`:41-50`)

```js
function logEnforcement(entry, root) {
  // Never manufacture the marker that gates setup (plan 00177). A best-effort
  // audit write into a directory that is not yet a CTOC project would create
  // `.ctoc/` as a parent — via THIS mkdir AND via durable-log's own recursive
  // mkdir of path.dirname(logPath) — and a fabricated `.ctoc/` is read as proof
  // the project exists, leaving it permanently half-initialised. Guarding only
  // the local mkdir is insufficient; we must return BEFORE appendEntry.
  if (!root || typeof root !== 'string') return null;
  const ctocDir = path.join(root, '.ctoc');
  if (!safeFs.existsSync(ctocDir)) return null;   // nothing to log INTO — never CREATE

  const logDir = path.join(ctocDir, 'logs');
  if (!safeFs.existsSync(logDir)) safeFs.mkdirSync(logDir, { recursive: true }); // LEAF only

  return durableLog.appendEntry(
    logPathFor(root),
    { timestamp: new Date().toISOString(), ...entry },
    { maxEntries: MAX_ENTRIES }
  );
}
```

- The `.ctoc/` existence check returns `null` (a best-effort no-op) rather than
  throwing; both callers ignore the return.
- The falsy / non-string `root` guard replaces the previous behaviour of throwing
  inside `path.join(undefined, ...)` on a bad root (the "never fall back to a bad
  root" half of the pattern). The callers only pass a truthy `info.project_root`
  today, so this is defensive; it makes the function total.
- The leaf `.ctoc/logs/` is still created beneath an existing `.ctoc/` — creating a
  subdirectory under a marker that setup already put there manufactures nothing.
- `durable-log.js` is NOT modified. Its recursive `mkdirSync` is correct for a
  caller that legitimately supplies a path under an existing `.ctoc/`; the guard
  belongs at the site that decides whether to write at all.

#### Dependencies
Unchanged: `require('./durable-log')`, `require('./safe-fs')`, `require('path')`.

### Wiring — the live call sites

| new code | live call site | root |
|---|---|---|
| the `.ctoc/`-existence guard in `logEnforcement` | `src/hooks/PreToolUse.Edit.js` `allow()` `:391` and `block()` `:370` | the registered `PreToolUse` Edit/Write enforcement hook, on every plan-markdown Write (whitelist → `allow('whitelist', …)`) and every block decision |

No new module and no new export. The guard is inside a function that already runs
on the live enforcement hook path; both callers already wrap it best-effort.

## Test Plan

### Tests: `tests/enforcement-log.test.js`
**Action:** MODIFY (add cases; existing cases 1-4 UNCHANGED)
**Framework:** `node:test`

The existing suite pre-creates `.ctoc/` in `beforeEach` (`:32-37`), so cases 1-4
run against a root that already has the marker: the new guard passes and their
behaviour (concurrency, quarantine, rotation, round-trip) is byte-for-byte
unchanged. This is verified, not assumed — read the `beforeEach` at Step 9.

New cases:

| # | Case | Fixture | Assertion |
|---|---|---|---|
| 5 | **a log write in an un-initialised directory creates no marker** | fresh tmp dir with NO `.ctoc/` (do NOT run the shared `beforeEach` marker-create — use a dedicated `describe` with its own tmp root) | after `logEnforcement({...}, root)`: `.ctoc/` does NOT exist; `readLog(root)` is `[]`; the call returned `null`. This is the reproduction and MUST be red before the change |
| 6 | **the human's decision is unaffected** | case 5 | `logEnforcement` did not throw — an audit-log skip never interferes with the enforcement outcome the caller then acts on |
| 7 | **a real project still gets its log** | tmp dir WITH `.ctoc/` (existing `beforeEach`) | unchanged from case 4 — an entry is appended and read back with its timestamp (guards against over-narrowing the fix) |
| 8 | **the leaf is created under an existing parent** | tmp dir with `.ctoc/` but NO `.ctoc/logs/` | `.ctoc/logs/enforcement.json` is created and the entry is present — the narrowing is to the PARENT marker only |
| 9 | **a bad root never throws and never manufactures anything** | `logEnforcement(entry, '')` and `logEnforcement(entry, undefined)` | returns `null`, does not throw, and creates no directory anywhere (in particular no `.ctoc/` under the process working directory) |

Case 5 is the one that matters: it drives the real function against an
un-initialised directory and reads the real directory afterward.

Cross-platform: `path.join`, `os.tmpdir()`, `fs.rmSync` teardown. No permission
fixtures (a skip is a gate failure in this repository); the un-initialised world is
built by simply NOT creating `.ctoc/`, which needs no privileged operation.

Coverage: the two new branches (`.ctoc/` absent → return; bad root → return) are
each exercised by cases 5/9; the write path stays covered by cases 1-4/7/8. No new
dark branch, so the 99 floor is held.

## Security Review

- **Path traversal:** `root` is the already-resolved project root supplied by the
  enforcement hook; the log path is composed only via `path.join(root, '.ctoc',
  'logs', 'enforcement.json')` and `path.dirname` of that — no user-content
  component reaches a path segment. Unchanged by this slice.
- **Input validation:** the new falsy / non-string `root` guard makes the function
  total; previously a bad root threw inside `path.join`.
- **No secrets:** the entry records tool name, target file, outcome — no
  credentials. Unchanged.
- **Fail-safe:** the function remains best-effort; a skipped write never affects the
  allow/block decision the caller has already made.
- **No new dependency, no new export, no new file write location.**

## Execution Plan (Steps 8-16)

### Step 8: TEST — add cases 5-9 to `tests/enforcement-log.test.js` in full, run ONLY that file, record the red output verbatim. Case 5 (and the no-marker half of case 9) MUST be red against current `main` — current `logEnforcement` manufactures `.ctoc/` unconditionally. Any new case green before the change must be shown to be already-correct behaviour rather than vacuous, and the finding written down.
### Step 9: PREPARE — re-read from disk: `src/lib/enforcement-log.js:22-63` in full; `src/lib/durable-log.js:207-239` to confirm `appendEntry`'s recursive `mkdirSync` of `path.dirname(logPath)` is the reason a local-mkdir-only guard fails; `src/hooks/PreToolUse.Edit.js:54,366-402` to confirm BOTH `allow`/`block` ignore the return value and pass `info.project_root`; `tests/enforcement-log.test.js:32-37` to confirm the existing `beforeEach` pre-creates `.ctoc/` (so cases 1-4 stay green). Record the confirmation.
### Step 10: IMPLEMENT — one step.
  - `src/lib/enforcement-log.js` — the `logEnforcement` guard (return before `appendEntry` when `.ctoc/` is absent or `root` is bad; create only the leaf under an existing `.ctoc/`).
### Step 11: REVIEW — confirm no path can create `.ctoc/`: the local mkdir AND `appendEntry` are both unreachable when `.ctoc/` is absent, because the function returns first. Confirm the write path in a real project is unchanged. Confirm `durable-log.js` is untouched. Confirm both enforcement callers still compile against the `null`-returning signature and still fail open.
### Step 12: OPTIMIZE — the guard adds one `existsSync` on a path that already did filesystem work; in the un-initialised case it REMOVES a recursive `mkdirSync` plus the entire append, so the not-a-project case gets cheaper.
### Step 13: SECURE — confirm nothing outside the resolved root is written, that a bad root can no longer steer a write into the process working directory, and that no entry field reaches a path component.
### Step 14: VERIFY — `node --test tests/enforcement-log.test.js tests/durable-log.test.js tests/pretooluse-edit-coverage.test.js tests/hooks-do-not-manufacture-the-project-marker.test.js` green, then the full gated run `npm test` (`# fail 0`, coverage at or above the floor, 0 skipped). Lint the changed file. No git operations.
### Step 15: DOCUMENT — a JavaScript doc on `logEnforcement` stating the rule: an operation permitted to fail silently must never create the directory that decides whether a project exists; name this as the third of the four producers 00177 identified, and note that guarding the local mkdir alone is insufficient because `durable-log.appendEntry` re-creates the parent.
### Step 16: FINAL-REVIEW — report a directory listing BEFORE and AFTER a `logEnforcement` call in an empty directory, verbatim, showing `.ctoc/` absent both times. Report every decision taken under ambiguity.

## Decisions Taken Under Ambiguity

1. **The fix RETURNS before `appendEntry`, it does not merely guard the local
   `mkdirSync`.** `durable-log.appendEntry` recursively creates
   `path.dirname(logPath)` = `root/.ctoc/logs`, so a local-mkdir-only guard would
   still manufacture the marker on the very next line. Verified against
   `durable-log.js:207-211`.
2. **`durable-log.js` is NOT modified and is NOT a declared file.** Its recursive
   mkdir is correct for a caller that legitimately supplies a path under an existing
   `.ctoc/`. The decision to write at all belongs at the caller; putting the guard
   in the writer would move one decision into two places, the divergence 00177 warns
   against.
3. **`logEnforcement` returns `null` when it skips; both callers ignore the return.**
   Verified at `PreToolUse.Edit.js:366-402`. A `null` return preserves the
   best-effort contract those callers already declare.
4. **A falsy / non-string `root` returns `null` rather than throwing.** This is the
   "never fall back to a bad root" half of the pattern; it makes the function total
   without changing today's behaviour (callers only pass a truthy `project_root`).
5. **A bare, empty `.ctoc/` still receives logs (case 8 variant).** The rule is "do
   not CREATE the marker", not "judge whether the project is healthy" — that
   judgement has one owner (setup), and duplicating it here would be a second
   opinion that can drift. Same call 00177 made.
6. **Fixed as its OWN slice, separate from the fourth producer
   (`plan-index-sync.js` `logError`).** They are different modules with different
   existing test files and different reachability — the third is on the live
   enforcement hot path with the `appendEntry` re-creation subtlety; the fourth is
   error-path-only. Isolating them keeps each slice's blast radius and review focus
   tight and means a build crash loses only one.
