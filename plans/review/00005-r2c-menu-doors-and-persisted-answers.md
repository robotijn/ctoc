---
title: "R2-C — Menu: a door for the inbox, persisted answers, one-turn approve, honest cancel route, review done-all"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00003-r2a-scheduler-lifecycle-honesty
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/menu-screens.js"
  - "src/commands/menu.js"
  - "src/lib/inbox.js"
  - "src/lib/compliance-regime.js"
  - "tests/menu-task-wiring.test.js"
  - "tests/menu-protocol.test.js"
  - "tests/menu-inbox-routes.test.js"
  - "tests/compliance-regime.test.js"
---

# R2-C — The menu stops hiding and stops re-asking

Fixes W1 (CRITICAL inbox counts with no door), R1 (CRITICAL compliance "None"
discarded + unsaved choice confirmed), W3 (HIGH no Gate 3 batch on the shipped
surface), R2 (HIGH no durable stop for environment "Decide later"), R6/W2
(double-asked approvals; "Approve anyway" recommended on failure), C1-2 route
side (menu cancel writes 'failed').

## Implementation Details

1. **Inbox doors (W1).** New routes `inbox questions`, `inbox decisions`,
   `inbox gates` in the router's `case 'inbox'`: each renders the items the
   existing `src/lib/inbox.js` listers return (title, age, body path; numbered;
   [0] back). If inbox.js lacks a lister for gates, add it reading the same
   source the dashboard count uses. The dashboard inbox lines gain the hint
   text naming the route. A count with no door is the defect.
2. **Compliance "None" persists (R1).** compliance-regime.js: answering none
   writes an explicit durable marker (`compliance: { declined: true, at: ISO }`
   via the settings write path this module already uses — if the yaml
   `active_profiles:` line is absent, WRITE the block instead of fail-opening
   {ok:false}). `needsComplianceRegimePrompt` (menu.js) returns false when the
   marker exists. The menu may confirm the choice ONLY after the write
   succeeded; a failed write is reported as failed, never confirmed.
3. **Environment durable stop (R2).** The environment ride-along gains a
   "Keep defaults, stop asking" option persisting
   `general.environment_prompt_dismissed: true` (settings write); the prompt
   predicate honors it. "Decide later" stays a one-turn skip.
4. **Review `done-all` (W3).** stageBrowse on the review stage accepts the
   word shortcut `done-all` per parent (symmetric to the implementation
   stage's `todo-all`), calling the existing
   `approveSubplans(parentSlug, 'review')`. The human typing done-all IS the
   Gate 3 approval — batch is gate-safe (each sibling validated + stamped by
   approveSubplans). Never a numbered option; word only.
5. **One-turn approve + demoted override (R6/W2, F3 partial).** The approve
   flow runs validation FIRST: validation clean → approve immediately in the
   same turn (no second "Proceed?" screen); validation failed → the validate
   screen lists failures with "Approve anyway (records an override)" as the
   LAST option, never the first/recommended. Keep the gate human-initiated;
   remove only the redundant second ask.
6. **Honest cancel route (C1-2).** The `task cancel` transition uses the
   R2-A semantics: running → `cancelling` (report says files stay locked
   until the agent is confirmed gone), queued → `cancelled`. It no longer
   writes `failed` with a cancelled flag. `computePromote` after cancel must
   reflect that a cancelling task still occupies its files (it will, via the
   scheduler — assert it).

### Wiring — the live call sites (MANDATORY)

| change | live call site | root |
|---|---|---|
| inbox routes | menu router (this slice) | /ctoc:menu |
| declined marker | needsComplianceRegimePrompt (menu.js, this slice) | /ctoc:menu |
| env dismiss | menu.js ride-along predicate (this slice) | /ctoc:menu |
| done-all | review stageBrowse → approveSubplans (exists) | /ctoc:menu |
| one-turn approve | planActions approve path (this slice) | /ctoc:menu |
| cancel route | taskTransition (this slice) | /ctoc:menu |

### Test Plan (TDD-Red first)
New tests/menu-inbox-routes.test.js: each route lists seeded inbox files;
empty inbox renders safely; dashboard hint names the routes. compliance tests:
none → marker written to disk, second prompt-predicate call false, absent
yaml block written not fail-opened; failed write NOT confirmed. env dismiss
marker round-trip. review browse: done-all crosses every sibling of a parent
(approveSubplans effect on disk), absent on non-review stages. approve: clean
validation → single-turn crossing; failed validation → Approve-anyway LAST.
cancel route: running → cancelling on disk + promote excludes same-file tasks;
queued → cancelled. Update existing menu-protocol/menu-task-wiring assertions
that pin the old cancel-writes-failed or double-ask behavior (they pin
deliberately replaced contracts — tighten to the new one).

## Execution Plan (Steps 8-16)
### Step 8: TEST — write/adjust tests, run ONLY the four test files, record red.
### Step 9: PREPARE — re-read all four source files IN FULL from disk (do not
trust this plan's line numbers); read post-R2A task-registry.js for cancelling.
If R2-A's cancelling status is absent on disk, STOP and report.
### Step 10: IMPLEMENT — changes 1–6.
### Step 11: REVIEW — diff vs plan; no route regression (existing routes intact).
### Step 12: OPTIMIZE — no extra registry/settings loads per render.
### Step 13: SECURE — stripCtl on everything rendered from inbox files (ANSI/
newline injection — mirror the existing render guards); safe-fs.
### Step 14: VERIFY — node --test on the four test files + eslint on changed
files; no git; no full suite.
### Step 15: DOCUMENT — JSDoc on new/changed exports.
### Step 16: FINAL-REVIEW — report files/tests/red-evidence/decisions.

## Decisions Taken Under Ambiguity

### D1 — SCOPE KICKBACK: 6 of 8 items require files outside the plan's `files:` set

The executor read every source + test on disk. Four of the six numbered changes,
plus BOTH handed-off additions, cannot be implemented without editing or breaking
test/prose files that are NOT in this plan's declared `files:` set. Per the hard
rule "touch only the plan's files; if wiring genuinely requires another file, STOP
and report," those items are kicked back for a scope expansion + re-approval. The
two clean, additive, fully-in-scope items were implemented via TDD.

DELIVERED (in scope, TDD, green):
- Change 1 — Inbox doors: routes `inbox questions|decisions|gates` + read-only
  screens + dashboard hint text. (`src/lib/menu-screens.js`, new
  `tests/menu-inbox-routes.test.js`.)
- Change 6 — Honest cancel route: `taskTransition` cancel now uses R2-A semantics
  (running/cancelling → `cancelling`, keeps its files locked; queued → `cancelled`;
  never writes `failed`). computePromote after a running-cancel excludes same-file
  tasks (the cancelling task still occupies). Updated the two IN-SCOPE tests that
  pinned the replaced `failed`-cancel contract (`menu-task-wiring.test.js` S2,
  `menu-protocol.test.js` B-PROMOTE cancel).

BLOCKED — needs a file outside `files:` (STOP-and-report):
- Change 2 (compliance "None" persists). Requires: `tests/compliance-mode.test.js`
  (test 13b pins `Object.keys(compliance).sort() === ['shouldRunEuAiAct',
  'shouldRunGdpr','writeActiveProfiles']` — no new export allowed; test 10 pins
  `writeActiveProfiles([])` as a byte-identical NO-OP — cannot make "None" write);
  and `src/commands/menu.md` line 58 binds `set-compliance-regime none`→"no write".
  A declined marker + `needsComplianceRegimePrompt` honoring it cannot land without
  editing those two out-of-scope files.
- Change 3 (environment durable stop). Requires: `tests/menu-environment.test.js`
  (line 57 pins EXACTLY 2 dashboard questions when env is unset; line 79 pins every
  question ≤4 options). "Keep defaults, stop asking" is a 5th env option (breaks ≤4)
  or a 3rd question (breaks ==2). Also `src/lib/settings.js` owns the
  `needsEnvironmentPrompt` predicate that must honor the marker.
- Change 4 (review `done-all`). The menu-side action key is clean, but the Gate-3
  batch handler for `claude:done-all-*`→`approveSubplans(parent,'review')` lives in
  `src/commands/menu.md` (out of scope). A dangling menu action with no handler is a
  stub (no-stub rule), so this is blocked on menu.md.
- Change 5 (one-turn approve). Requires: `tests/menu-screens.test.js` (line 260 pins
  `planActions` approve → `startsWith('validate')`; line 296 pins reviewActions
  `Approve → Done` → `startsWith('validate')`). Making the clean path go straight to
  `claude:approve` in one turn breaks both pins.
- Addition (a) (dismissStale wiring on the stale ride-along / drill-in). Requires:
  `tests/inbox-stale-stream.test.js` (line 143 pins the pipeline stale ride-along
  options to EXACTLY `['View stale plans','Not now']`; lines 202 & 281 pin the
  drill-in actions to EXACTLY `{Verify:'inbox verify','◀ Back':''}`). Any new
  "Don't ask again for these" option on either surface breaks a deepEqual. The
  underlying `staleDetector.dismissStale(root, candidates)` export IS present on
  disk (read-verified) and ready; only the menu affordance is blocked.
- Addition (b) (narrow the inbox stale COUNT to actionable). Requires:
  `tests/inbox-stale-stream.test.js` (lines 90-96, 122-148 mock `scanCheapCandidates`
  to return functional-stage candidates and assert `staleCandidates ===
  scanCheapCandidates(root).count`). Filtering functional (NOT_STARTED) candidates
  out of the count changes those asserted totals. Also `NOT_STARTED_STAGES` is a
  PRIVATE const in the read-only `stale-detector.js` (not exported), so inbox.js
  would have to mirror it — acceptable, but the count change itself is blocked by the
  out-of-scope test.

### D2 — Cancel route implemented directly on the registry, not via actions.cancelTask
Per the task brief's instruction and PREPARE-time check: `actions.cancelTask` on disk
calls `updateTask(reg, id, {status:'cancelled'})` UNCONDITIONALLY. Under the R2-A
transition table, `running → cancelled` is FORBIDDEN (running must go via
`cancelling`), so `actions.cancelTask` THROWS for a running task. The menu cancel
route therefore implements the honest semantics directly on the registry inside
`taskTransition` (running→cancelling, queued→cancelled) WITHOUT touching actions.js.

### D3 — Inbox door screens render bullet rows + `◀ Back` (not numbered-selectable)
The plan text says "numbered; [0] back", but menu-discipline reserves NUMBERS for
opening a plan, and these inbox doors open nothing (no per-item screen is in scope).
Chose the established sibling convention (`inboxStalePlansDrillIn`): stripCtl'd
bullet rows, capped at 20 with a "… and N more" line, and a single `◀ Back` option.
Every attacker-influenceable field (slug/plan/stage/path) passes through `stripCtl`.

### D4 — Dashboard hint text is gated on count > 0
Hints (`· view: inbox questions|decisions|gates`) are appended AFTER the existing
line substrings and only when that specific count is > 0, so no existing substring
assertion (`includes('morning question')`, `includes('at gates')`) regresses.
