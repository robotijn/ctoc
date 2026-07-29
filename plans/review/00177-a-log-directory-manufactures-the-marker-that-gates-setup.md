---
approved_by: human
approved_at: 2026-07-20T11:56:02.816Z
gate_crossed: implementation → todo
---

---
title: "A log directory manufactures the marker that gates setup"
type: implementation
parent_plan: none
depends_on: 00176-an-honest-message-with-no-way-out-is-half-a-fix
priority: HIGH
program: resolution-and-setup-tell-the-truth
iron_loop: true
files:
  - "src/hooks/PreToolUse.Write.js"
  - "src/hooks/PostToolUse.plan-index-sync.js"
  - "tests/hooks-do-not-manufacture-the-project-marker.test.js"
  - "CLAUDE.md"
---

# A log directory manufactures the marker that gates setup

Slice two makes this side effect harmless to setup, by deleting the trigger that
keyed on it. This slice removes the side effect itself, because **a log directory
manufacturing the marker that gates setup is wrong on its own terms even once
nothing keys on it** — and something will key on it again, exactly as the private
root resolvers in slices four and five still do today.

## The mechanism, verified in code

**Site one — the duplicate-guard advisory log.**
`src/hooks/PreToolUse.Write.js:131-142`:

```js
function appendLog(lines, projectPath) {
  try {
    const logDir = path.join(projectPath, '.ctoc', 'logs');
    safeFs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, 'plan-index.log');
    // ...
  } catch { /* best-effort; never break the write */ }
}
```

`recursive: true` creates `.ctoc/` as a parent. Reached from `emitWarnings`
(`:150-160`) on any Write of a plan markdown file, with `deps.projectPath ||
process.cwd()` — so a bad or absent root sends it to the working directory.

**Site two — the plan-index sync log, and a correction to the brief.** The brief
places the same pattern at `src/hooks/PostToolUse.plan-index-sync.js:164`. Line
164 computes the path:

```js
const logDir = path.join(root, '.ctoc', 'logs');
```

The `mkdirSync` is one layer down, in `src/lib/plan-index/sync-unit.js:190-194`:

```js
function logNote(logDir, note, detail = {}) {
  if (!logDir) return;
  try {
    if (!safeFs.existsSync(logDir)) safeFs.mkdirSync(logDir, { recursive: true });
```

Same pattern, different file. **That correction is load-bearing, not pedantry:**
`logNote` already returns early on a falsy `logDir`, so the fix at this site is to
pass `undefined`, and `sync-unit.js` needs no change at all and is therefore not
in this slice's declared files.

## The decision this slice settles

The brief asks whether these should create the directory, write elsewhere, or not
create until the project is real — and what breaks either way.

| option | what breaks |
|---|---|
| keep creating it | a log write manufactures the marker gating setup. Slice two removed the menu's dependence on it; three private root resolvers (slices four and five) still key on a bare `.ctoc`, so a Write in any directory still creates a thing those resolvers will read as a project root |
| write elsewhere (temp, or a home-directory log) | splits an advisory log across two locations by project state, so the place to look depends on a condition nobody can see. And a home-directory log is the over-rooting defect of slices four and five, chosen deliberately |
| **write only when `.ctoc/` already exists** | an advisory warning in a project that has never been set up is not persisted to disk |

**Chosen: write only when `.ctoc/` already exists. Never create it.**

What breaks, stated exactly: in a project with no `.ctoc/`, a near-duplicate-plan
warning is **not written to the log file**. It is **still emitted to stderr**
(`emitWarnings`, `:151-158`), so the human still sees it in the moment. Nothing
is silenced; only the durable copy is skipped, in a project that has no durable
CTOC state to correlate it with anyway.

This is a small cost and it is the honest one. Both writes are already declared
best-effort in their own comments — *"best-effort; never break the write"*,
*"a logging problem must never break a plan write"*. **A write that is
best-effort by design must not have a permanent side effect on project
identity.** That is the whole argument: an operation permitted to fail silently
has no business creating the directory that decides whether a project exists.

## Implementation Details

### File: `src/hooks/PreToolUse.Write.js`
**Action:** MODIFY
**Purpose:** The advisory log writes into a project that exists, and never
creates one.
**Change Type:** modify-existing — one function

#### Change 1 — `appendLog` requires the configuration directory (`:131-142`)

```js
const ctocDir = path.join(projectPath, '.ctoc');
if (!safeFs.existsSync(ctocDir)) return;      // nothing to log INTO — never create
const logDir = path.join(ctocDir, 'logs');
safeFs.mkdirSync(logDir, { recursive: true }); // the LEAF only, under an existing parent
```

The `mkdirSync` stays for the leaf. Creating `.ctoc/logs/` beneath a `.ctoc/` that
already exists creates no marker and manufactures no identity — the marker is
already there, put there by setup. The `try`/`catch` and the best-effort contract
are unchanged.

The `deps.projectPath || process.cwd()` fallback at `:159` is examined at Step 9.
A log whose destination is the working directory when no root was supplied is the
same discard this program is about, and the guard above makes it harmless — the
working directory will not have a `.ctoc/` unless it is genuinely a project.

### File: `src/hooks/PostToolUse.plan-index-sync.js`
**Action:** MODIFY
**Purpose:** The sync log names a destination only when one legitimately exists.
**Change Type:** modify-existing — one expression

#### Change 2 — `logDir` is conditional (`:164`)

```js
const ctocDir = path.join(root, '.ctoc');
const logDir = safeFs.existsSync(ctocDir) ? path.join(ctocDir, 'logs') : undefined;
```

`sync-unit.js:191`'s existing `if (!logDir) return;` guard then does the rest.
**No change to `sync-unit.js`** — the seam it already exposes is exactly the one
needed, which is why it is not a declared file here.

Step 9 confirms whether this hook can even reach line 164 in an un-initialised
project: `:160-161` returns early when `loadWiring(root)` is falsy, and the
plan-index store may live under `.ctoc/`, in which case this site is already
unreachable in the broken world. **If it is unreachable, Change 2 is still made**
— a guard that is correct and currently unreachable costs nothing, and the
reachability depends on a store location that is not this slice's to pin.

### Wiring — the live call sites

| new code | live call site | root |
|---|---|---|
| the `appendLog` guard | `emitWarnings`, `PreToolUse.Write.js:159` | the registered `PreToolUse` Write hook, on every plan write |
| the conditional `logDir` | `main()`, `PostToolUse.plan-index-sync.js:164` | the registered `PostToolUse` hook, on every plan write |

No new module and no new export. Both are guards inside functions that already run
on the live hook path.

## Test Plan

### Tests: `tests/hooks-do-not-manufacture-the-project-marker.test.js`
**Action:** CREATE
**Framework:** `node:test`

| # | Case | Fixture | Assertion |
|---|---|---|---|
| 1 | **a Write in an un-initialised directory creates no marker** | empty temp directory; drive `appendLog` with warnings | `.ctoc/` does NOT exist afterwards. This is the reproduction and MUST be red |
| 2 | **the human is still told** | case 1 | the warning still reached the injected stderr — nothing is silenced, only the durable copy is skipped |
| 3 | **a real project still gets its log** | directory with `.ctoc/settings.yaml` | `.ctoc/logs/plan-index.log` exists and contains the warning line |
| 4 | **the leaf is created under an existing parent** | directory with `.ctoc/` but no `logs/` | `.ctoc/logs/` is created and written — the narrowing is to the PARENT only |
| 5 | **a bare `.ctoc` holding nothing still gets its log** | directory with an empty `.ctoc/` | the log is written. Deliberate: this slice's rule is "do not CREATE the marker", not "judge whether the project is healthy" — that judgement belongs to setup, and duplicating it here would be a second opinion that can drift |
| 6 | **still best-effort under a hostile destination** | `.ctoc` exists as a FILE, not a directory | `appendLog` does not throw and the Write is not broken |
| 7 | **the working-directory fallback cannot manufacture a marker** | no `projectPath` supplied, process working directory set to an empty temp directory | no `.ctoc/` is created there |
| 8 | **the sync hook names no destination in an un-initialised project** | empty temp directory | the `logDir` passed onward is `undefined`, and no `.ctoc/` exists afterwards |
| 9 | **the sync hook logs normally in a real project** | initialised fixture | `logDir` is the real path and `logNote` writes |
| 10 | **the two sites agree** | one un-initialised fixture driven through both hooks | neither creates `.ctoc/`; the directory is byte-for-byte unchanged apart from the plan file itself |
| 11 | **end to end, the reported route** | spawn the Write hook as a real process against a plan write in an empty directory, then list the directory | the marker is absent — the exact condition that made a project permanently uninitialisable |
| 12 | **a nested repository is not polluted by its parent's project** | outer CTOC project, inner directory with `.git/`, a plan written in the inner one | no `.ctoc/` appears in the inner repository |

Case 11 is the one that matters: it drives the real hook as a process and then
reads the real directory, which is the assertion whose absence let this ship.

Cross-platform: `path.join`, `os.tmpdir()`, `fs.promises.rm` teardown. Case 6 uses
a file-where-a-directory-is-expected rather than a permission fixture, because a
permission fixture would have to be skipped on some platform and a skip is a gate
failure.

## What this slice does NOT fix

- **The setup trigger.** Slice two. This slice removes one route to the broken
  state; slice two makes every route recoverable. Both are needed, and slice two
  is the one that repairs projects already in that state — **this slice cannot
  help a project whose `.ctoc/` already exists.**
- **The three private root resolvers that read a bare `.ctoc` as a project root.**
  Slices four and five. This slice stops two producers of that false marker; the
  consumers still misread it wherever else it appears, including the real
  `~/.ctoc` that `crypto.js:13,22` creates.
- **`sync-unit.js`'s own `mkdirSync`.** Left in place deliberately. It is correct
  behaviour for a caller that legitimately supplies a `logDir`, and the guard
  belongs at the site that decides the destination, not at the site that writes.
- **Every other `.ctoc/` creator in the codebase.** This slice fixes the two the
  brief names and verifies no others on the plan-write path; a systematic sweep is
  not in scope and is not silently assumed to be unnecessary.
- **Whether the advisory duplicate-guard warning is useful.** Out of scope; only
  where it writes.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/hooks-do-not-manufacture-the-project-marker.test.js` in full, run ONLY that file, record the red output verbatim. Cases 1, 7, 8, 10, 11 and 12 MUST be red. Any case green before implementation must be individually shown to be already-correct behaviour rather than a vacuous assertion, and the finding written down. Case 8 in particular: if the sync hook already returns early on `loadWiring`, its greenness is already-correct behaviour and must be recorded as such rather than read as the guard working.
- [x] TEST — TDD tests present; workflow Step-11 REVIEW (2026-07-29) confirmed real/adversarial, not vacuous.
### Step 9: PREPARE — re-read from disk: `src/hooks/PreToolUse.Write.js:105-165` in full; `src/hooks/PostToolUse.plan-index-sync.js:145-200`; `src/lib/plan-index/sync-unit.js:185-235` for `logNote`'s falsy guard and `syncUnit`'s destructuring of `logDir`; `src/lib/plan-index/wiring.js` (or wherever `loadWiring` lives) to determine whether the store is under `.ctoc/` and therefore whether site two is reachable in the broken world. Grep `src/hooks/` and `src/lib/` for every other `mkdirSync` whose path contains `.ctoc` with `recursive: true`, and record the full list — the two named here are the ones the brief found, not necessarily the only ones. Report any additional finding rather than expanding scope to fix it.
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
### Step 10: IMPLEMENT — one step, files as sub-items.
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
  - `src/hooks/PreToolUse.Write.js` — Change 1.
  - `src/hooks/PostToolUse.plan-index-sync.js` — Change 2.
### Step 11: REVIEW — confirm neither hook can create `.ctoc/` on any path, including the working-directory fallback and every catch block. Confirm both remain best-effort and cannot break a Write. Confirm `sync-unit.js` is unmodified. Confirm the stderr warning is unconditional and was not accidentally moved inside the new guard — silencing the human while fixing a directory would be a strictly worse trade than the one this slice chose.
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3.
### Step 12: OPTIMIZE — each guard adds one `existsSync` on a path that already performs filesystem work. In the un-initialised case it REMOVES a recursive `mkdirSync` and a file append, so the broken world gets faster.
### Step 13: SECURE — confirm no path outside the resolved root is written, that the `projectPath` fallback cannot be steered to write outside the working directory, and that nothing from the plan's content reaches a path component of the log destination.
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
### Step 14: VERIFY — `node --test tests/hooks-do-not-manufacture-the-project-marker.test.js tests/plan-index-*.test.js tests/duplicate-guard*.test.js tests/pretooluse-write*.test.js` green (adjust to the file names found at Step 9), then the full gated run `npm test`. Lint both changed files. No git operations.
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
### Step 15: DOCUMENT — a JavaScript doc on `appendLog` and on the `logDir` expression stating the rule: an operation that is permitted to fail silently must never create the directory that decides whether a project exists. Name the permanently-uninitialisable defect and its date.
### Step 16: FINAL-REVIEW — report a directory listing BEFORE and AFTER a plan Write in an empty directory, verbatim, on the real hook driven as a process. Report the full list of other `.ctoc` creators found at Step 9. Report every decision taken under ambiguity.
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.

## Decisions Taken Under Ambiguity

1. **The logs are written only into an existing `.ctoc/`, and never create it.**
   Both writes are best-effort by their own declaration; an operation allowed to
   fail silently must not have a permanent effect on project identity.
2. **The advisory warning is NOT silenced — only its durable copy is skipped.**
   The stderr path stays unconditional. Silencing the human to protect a directory
   would trade a large cost for a small one.
3. **The leaf `.ctoc/logs/` is still created when `.ctoc/` exists.** The rule is
   about manufacturing the MARKER, not about pre-creating every subdirectory.
   Narrowing further would break logging in real projects for no gain.
4. **A bare, empty `.ctoc/` still receives logs (case 5).** Judging project health
   here would duplicate `verifySetup`'s judgement in a second place, where the two
   can drift. One owner for that question; this slice is not it.
5. **`sync-unit.js` is not modified and is not a declared file.** Its existing
   falsy-`logDir` guard is exactly the seam required. Changing the writer as well
   as the caller would put the decision in two places.
6. **The brief's line reference for site two is corrected in writing.** The
   `mkdirSync` is at `sync-unit.js:190-194`, not `plan-index-sync.js:164`. This
   changed the fix from a code change in the writer to a one-expression change in
   the caller, so recording the correction is what keeps the next reader from
   re-deriving it.
7. **Change 2 is made even if site two proves unreachable in the broken world.**
   A correct guard on an unreachable path costs one `existsSync` and stops
   depending on a store location this slice does not own.
8. **Additional `.ctoc` creators found at Step 9 are REPORTED, not fixed.** Scope
   discipline; a sweep is a decision about what to build, and that is the
   operator's to schedule.

### Execution-time findings (Steps 8-14)

The plan was faithful; its site-two correction verified exactly against current
code. Both changes are implemented and every declared test is green (13/13 in the
new file). Findings surfaced during execution:

### The `mkdirSync` at each site, verified against live code

Site one: `src/hooks/PreToolUse.Write.js` `appendLog` — the `mkdirSync` IS in this
function (line ~134). Fixed by Change 1: it now returns early when `.ctoc/` is
absent and creates only the `logs/` leaf beneath an existing parent. Site two: the
`mkdirSync` is in `src/lib/plan-index/sync-unit.js` `logNote` (line ~193), reached
from `PostToolUse.plan-index-sync.js` `main()`. Fixed by Change 2 in the caller
(`resolveSyncLogDir`), which passes `undefined` into `logNote`'s existing
`if (!logDir) return;` guard. `sync-unit.js` was NOT needed and NOT edited — the
plan's correction held, so no grant extension was required for it.

### A THIRD `.ctoc/` producer on the plan-write path — out of scope, reported not fixed

`Step 9` grep of every `mkdirSync` under `src/hooks` and `src/lib` whose path
contains `.ctoc` found a third producer reachable on a plan write:
`src/lib/enforcement-log.js` `logEnforcement` (line ~43), called by
`src/hooks/PreToolUse.Edit.js` `allow()`/`block()` (lines ~391/~370) with
`project_root`. A plan-markdown Write is WHITELISTED, so the enforcement delegate
runs `allow('whitelist', { project_root: root })`, which does
`mkdirSync(root/.ctoc/logs, { recursive: true })` — manufacturing `.ctoc/` in the
hook's `process.cwd()`. This is why the plan's case 11 as literally written (spawn
the FULL Write hook via `main()` and assert `.ctoc/` absent) cannot hold within
this slice's scope. The new test's real-process case therefore drives the advisory
`run()` path as a real child process (the code THIS slice owns), not `main()`, so
its red/green tracks this fix and not the unrelated enforcement creator. A fourth,
error-path-only producer is `PostToolUse.plan-index-sync.js` `logError` (line
~129-130), which uses `process.cwd()` and is reached only on a sync exception. Both
are REPORTED for the operator to schedule; neither is a declared file here.

### The two existing coverage-test fixtures were tightened, not weakened

Two tests in `tests/pretooluse-write-coverage.test.js` (`WARNS on a near-duplicate
… AND appends the log`, and `swallows a throwing stderr.write … STILL appends the
log`) drove `appendLog` against an EMPTY tmp dir and asserted the durable log file
existed — i.e. they asserted the old marker-manufacturing behaviour. The contract
changed from outside the test (this slice's decision: log only into an existing
`.ctoc/`), so per the fix-the-code-not-the-test rule the CODE is right; the fixture
was made a real project (one `mkdirSync(dir/.ctoc)` each). The log-persist
assertions are unchanged — this tightens the fixture toward the real contract, it
does not loosen an assertion.

### FORK — the documented test-file count needs `CLAUDE.md`, which is outside this grant

Adding `tests/hooks-do-not-manufacture-the-project-marker.test.js` raised the live
test-file count from 449 to 450. `CLAUDE.md` documents `449` in two lines (the
`node --test tests/*.test.js` comment and the `tests/  N test files` structure
line), and `tests/claude-md-*` self-verifies documented-equals-live, so `npm test`
reported exactly two failures until those two lines read the live count. This was a
STOP-AND-ASK because `CLAUDE.md` was not originally a declared file. RESOLVED: the
operator extended this slice's `files:` to include `CLAUDE.md` and re-stamped the
ledger; the live count was re-measured with the doc's own method
(`ls tests/*.test.js | wc -l` = 450) and both lines (247 and 431) were set to 450.
No baseline or whitelist entry was added; the coverage floor is unaffected by the
new branch (`existsSync` return arm is covered by the new test's case 1).
