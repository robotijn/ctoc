---
title: "R2-C — Menu: a read-only door for the inbox + an honest cancel route"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00003-r2a-scheduler-lifecycle-honesty
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/menu-screens.js"
  - "src/lib/inbox.js"
  - "src/lib/actions.js"
  - "tests/menu-task-wiring.test.js"
  - "tests/menu-protocol.test.js"
  - "tests/menu-inbox-routes.test.js"
  - "tests/actions-scheduler.test.js"
---

# R2-C — The menu grows a door for the inbox and an honest cancel route

Fixes exactly the two defects this slice actually shipped:

- **W1 (CRITICAL) — inbox counts with no door.** The dashboard reported inbox
  counts the human could not open. This slice adds the read-only doors
  (`inbox questions|decisions|gates`) so a count is now something you can look at.
- **C1-2 — the menu cancel route wrote `failed`.** Cancelling a task recorded it
  as a failure with a flag. This slice routes the menu cancel through the ONE cancel
  encoding (`actions.cancelTask`): a running task enters `cancelling` and keeps its
  files locked; a queued task cancels immediately; nothing is ever written `failed`.

The other four defect-groups the original slice header advertised (R1 compliance
"None" persistence, W3 review `done-all`, R2 environment durable stop, R6/W2
one-turn approve) were KICKED BACK at build time (they require files outside this
slice — see D1) and are NOT claimed here.

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

The command surface is `/ctoc:start` (`src/commands/start.js` → `src/commands/start.md`).
There is no `src/commands/menu.js`; the router that dispatches these routes is
`start.js`'s non-interactive JSON path (`start.js:939` calls `menu-screens.route`).
Only the two DELIVERED items are wired here; the four blocked items are the
follow-up's work and are noted, not claimed.

| change (delivered) | live call site | root |
|---|---|---|
| inbox doors (`inbox questions\|decisions\|gates`) | `menu-screens.route` case `'inbox'` (`menu-screens.js:2581`) → `inboxQuestionsScreen`/`inboxDecisionsScreen`/`inboxGatesScreen` | /ctoc:start |
| honest cancel route | `menu-screens.route` case `'cancel'` (`menu-screens.js:2488`) → `taskTransition(...,'cancel')` → `actions.cancelTask` (the ONE cancel encoding) | /ctoc:start |

Blocked items (NOT delivered by this slice — see D1): the compliance decline
marker + `needsComplianceRegimePrompt`, and the environment durable-stop predicate,
landed later in `src/commands/start.js` (`start.js:68` `needsComplianceRegimePrompt`,
`start.js:37/50` the environment ride-along) as the follow-up's work, under labels
`R2-C2 item 1/item 2`. Review `done-all` and one-turn approve were also blocked.

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
### Step 14: VERIFY — the REAL gate: `npm test` (full suite + coverage floor 99 +
zero-skipped) on the whole tree, not a per-file run. Green before the record stands.
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
  and the instruction surface `src/commands/start.md` binds `set-compliance-regime
  none`→"no write" (there is no `src/commands/menu.js`/`menu.md`; the command was
  renamed menu→start). A declined marker + `needsComplianceRegimePrompt` honoring it
  cannot land without editing those out-of-scope files. (Subsequently delivered by the
  follow-up in `src/commands/start.js:68` under label `R2-C2 item 1`, not by this slice.)
- Change 3 (environment durable stop). Requires: `tests/menu-environment.test.js`
  (line 57 pins EXACTLY 2 dashboard questions when env is unset; line 79 pins every
  question ≤4 options). "Keep defaults, stop asking" is a 5th env option (breaks ≤4)
  or a 3rd question (breaks ==2). Also `src/lib/settings.js` owns the
  `needsEnvironmentPrompt` predicate that must honor the marker.
- Change 4 (review `done-all`). The menu-side action key is clean, but the batch
  handler for `claude:done-all-*`→`approveSubplans(parent,'review')` lives in the
  instruction surface `src/commands/start.md` (out of scope). A dangling menu action
  with no handler is a stub (no-stub rule), so this is blocked on start.md.
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

### D2 — Cancel route CONVERGED onto `actions.cancelTask` (the ONE cancel encoding)
The original D2 justified a second cancel implementation inside `taskTransition` on
the ground that `actions.cancelTask` did `running → cancelled` unconditionally and
threw for a running task. On current disk that rationale is FALSE:
`actions.cancelTask` already does `running → cancelling`, `queued → cancelled`, and
refuses an already-`cancelling` task. Two encodings of one registry mutation is a
divergence — and they DID diverge (the menu path silently re-stamped
`ts.cancelRequested` on a repeat cancel, resetting reconcile's cancel-deadline clock
and holding a stuck task's files longer). This rework deletes the second copy: the
menu cancel route now delegates to `actions.cancelTask`, the single source. The
`--force` one-call path the menu needs (running → cancelling → cancelled in one call,
warn-logged) was ADDED to `actions.cancelTask` (an `opts.force` parameter), not
duplicated in the menu. A repeat cancel on an already-`cancelling` task now fails
soft (refused) instead of re-stamping the deadline.

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

## Step 16 — FINAL-REVIEW report (rework, 2026-07-26)

This slice was REWORKED on the human's send-back. The record above was brought back
to what the code actually ships, and two code defects the review found were fixed via
TDD on a GREEN full `npm test` gate.

### Files changed (this rework)
- `src/lib/menu-screens.js` — (1) the `task cancel` route now DELEGATES to
  `actions.cancelTask` (the ONE cancel encoding); the second in-menu cancel
  implementation and its now-dead terminal-set mirror (`TASK_TERMINAL`) / `nowIso`
  helper are deleted. (2) `taskComplete` DERIVES the settled task result's `ok` from
  the real verify outcome — a FAILED verify settles `ok:false` and is never
  re-stamped `ok:true` by the caller's `{ok:!p.fail}` flag (mirrors the actions.js
  coupling). The caller's `--summary` still round-trips intact; only `ok` is
  verify-derived.
- `src/lib/actions.js` — `cancelTask(projectPath, taskId, opts)` gains an
  `opts.force` one-call path (running → cancelling → cancelled, warn-logged) so the
  menu never mirrors the transition, and an explicit refusal for an already-`cancelled`
  task (`cancelled → cancelled` is an idempotent no-op to `updateTask`, so it needed an
  explicit throw to stay an honest refusal).
- `tests/menu-task-wiring.test.js` — new describe blocks: honest task result on a
  failed-verify complete; cancel delegates to `actions.cancelTask`; `--force` one-call
  cancel; repeat non-force cancel refused.
- `tests/actions-scheduler.test.js` — `cancelTask` force tests (running/cancelling →
  cancelled in one call; repeat non-force refused).
- `plans/todo/00005-…md` — header narrowed to the two shipped fixes; `files:`
  corrected to the real change surface (phantom `src/commands/menu.js` removed,
  `actions.js` + `tests/actions-scheduler.test.js` added, blocked-change files
  dropped); wiring table + D1 pointed at the real `start.js`/`menu-screens.js` layout;
  D2 rewritten as the convergence decision.

### Red evidence (captured this rework, seen failing before the fix)
- `actions.cancelTask` force: `force: a RUNNING task → cancelled in one call` failed
  RED with `actual: 'cancelling', expected: 'cancelled'` (no force param yet); the
  already-cancelling force case threw `already cancelling`.
- Menu honest result: `a FAILED verify settles the registry task ok:false` failed RED
  with `actual: true, expected: false` — the exact overwrite the finding names.
- Menu cancel converge: `the menu cancel route delegates to actions.cancelTask` failed
  RED (source did not call `cancelTask(`); `a repeat non-force cancel … is refused`
  failed RED with `actual: true` (the old path silently re-stamped the deadline).

### Verify
Full `npm test` gate GREEN on the whole tree: 10492 tests, `# pass 10492`,
`# fail 0`, `# skipped 0`, coverage 99.01% (floor 99). Not a per-file run.

### Still NOT delivered by this slice (unchanged from D1)
The four blocked defect-groups (compliance "None" persistence, review `done-all`,
environment durable stop, one-turn approve) remain out of this slice's scope and are
NOT claimed by this record. The compliance/environment wiring was subsequently landed
by the follow-up in `src/commands/start.js` (labels `R2-C2 item 1/2`), not here.
