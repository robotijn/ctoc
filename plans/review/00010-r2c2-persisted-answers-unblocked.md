---
title: "R2-C2 — Persisted answers unblocked: the pin-tests move with the contracts"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00005-r2c-menu-doors-and-persisted-answers
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/compliance-regime.js"
  - "src/lib/settings.js"
  - "src/lib/menu-screens.js"
  - "src/lib/inbox.js"
  - "src/lib/stale-detector.js"
  - "src/commands/menu.js"
  - "src/lib/task-view.js"
  - "tests/menu-task-wiring.test.js"
  - "tests/compliance-mode.test.js"
  - "tests/compliance-regime.test.js"
  - "tests/menu-environment.test.js"
  - "tests/menu-screens.test.js"
  - "tests/inbox-stale-stream.test.js"
  - "tests/menu-inbox-routes.test.js"
---

# R2-C2 — R2-C's blocked items, with their pin-tests in scope

R2-C correctly kicked back six items whose contracts are pinned by out-of-scope
tests. Those pins protect deliberately-replaced behavior (the R1/R2/R6/W2/W3
defects the human ordered fixed), so this slice changes contract AND pin
together — every pin update must TIGHTEN toward the new decided behavior,
never merely delete an assertion.

## Implementation Details (design locked; R2-C's D1 lists the exact pins)

1. **Compliance "None" persists (R1).** New export
   `declineComplianceRegime(root)` in compliance-regime.js writing a durable
   declined marker INSIDE the `regulatory_regime:` settings block (read
   regulatory-regime.js, the reader of record, and extend its parse to expose
   `declined`; if regulatory-regime.js is genuinely required to change, it IS
   allowed — add it to your report). `writeActiveProfiles([])` STAYS a no-op
   (test 10's pin survives untouched — decline is a DIFFERENT verb, not an
   empty write). `needsComplianceRegimePrompt` (menu.js) returns false when
   declined or profiles exist. Update compliance-mode.test.js 13b's export
   shape pin to include the new export, with a comment naming this plan.
   The menu confirms ONLY after the write reports ok.
2. **Environment durable stop (R2).** The ride-along's "Decide later" option
   is REPLACED by "Keep defaults, stop asking" (persists
   `general.environment_prompt_dismissed: true` via settings.js; the
   `needsEnvironmentPrompt`/`isEnvironmentUnset` predicate honors it). Option
   count stays 4 (menu-environment.test.js line-79 pin survives); the ==2
   questions pin survives; update option-label assertions. Rationale: the
   one-turn skip WAS the re-ask hell (F7); a user can set the environment any
   time from the Tools screen — verify that path exists and name it in the
   option description.
3. **One-turn approve (R6/W2).** Keep the approve→validate ROUTE (so
   menu-screens.test.js route pins survive); change validateScreen behavior:
   ALL checks pass → perform the approval in the same turn and render the
   approved result (no "Proceed?" second ask); any check fails → failure list
   with "Approve anyway (records an override)" as the LAST option. Update the
   confirm-screen shape pins to the new contract.
4. **Review `done-all` (W3), menu-side.** Register the `done-all` word
   shortcut on the review stageBrowse mapping to action key
   `claude:done-all-<parent>`; the menu.md recipe half lands in slice R2-D
   (same wave commit — same-commit wiring, like F1). Assert the action key is
   emitted; do NOT implement any approveSubplans call in menu-screens (the
   session model executes the recipe).
5. **dismissStale wiring (R2-E seam).** The stale ride-along and the stale
   drill-in gain "Don't ask again for these" calling
   `staleDetector.dismissStale(root, candidates)`. Update
   inbox-stale-stream.test.js's exact-options deepEqual pins to include it
   (assert placement AFTER 'View stale plans'/'Verify', never recommended).
6. **Honest stale COUNT (R2-E seam).** Export `NOT_STARTED_STAGES` from
   stale-detector.js (additive, one line); inbox.js's stale count filters
   cheap candidates to the stages the classifier can act on. Update the
   count-equality pins to the filtered truth; add a test proving a
   functional-stage candidate is counted 0 but a todo-stage one is counted.
7. **`cancelling` visible on the board (R2-C finding).** task-view.js renders
   `cancelling` tasks (board + tasks section + wait reasons) instead of
   dropping them — a cancelling task holds real file locks, so an invisible
   one is a lying dashboard. Extend the renderTasksSection tests in
   tests/menu-task-wiring.test.js.

### Wiring — the live call sites (MANDATORY)

| change | live call site | root |
|---|---|---|
| declineComplianceRegime | ride-along answer handling (menu.js/menu-screens.js, this slice) | /ctoc:menu |
| env dismissed marker | needsEnvironmentPrompt predicate (this slice) | /ctoc:menu |
| one-turn approve | validateScreen (this slice) | /ctoc:menu |
| done-all key | review stageBrowse (this slice) + menu.md recipe (R2-D, same wave) | /ctoc:menu |
| dismissStale | ride-along + drill-in options (this slice) | /ctoc:menu |
| count filter | inbox.getInboxCounts (this slice) | /ctoc:menu |

### Test Plan (TDD-Red first)
Every item above names its pins. Additional: declined marker round-trip on a
FRESH inited project (R2-E's init block) AND a legacy project without the
block (write must create it, not fail-open); declined then later real
activation still works; environment dismissed → dashboard shows ONE ride-along
fewer (adjust the ==2 pin to the unset-and-not-dismissed case, add the
dismissed case); one-turn approve crosses on disk in a single route call;
done-all emits per-parent action keys; dismiss option round-trip filters on
next scan; count filtering per item 6.

## Execution Plan (Steps 8-16)
### Step 8: TEST — write/adjust tests, run ONLY the six named test files, red.
### Step 9: PREPARE — read ALL files in scope from disk IN FULL, plus
regulatory-regime.js and stale-detector.js (post-R2-E) and R2-C's D1-D4 in
plans/todo/00005. Do not trust remembered line numbers.
### Step 10: IMPLEMENT — items 1–6.
### Step 11: REVIEW — every pin change listed with its justification; any pin
DELETED (not tightened) is a violation.
### Step 12: OPTIMIZE — no extra settings/registry loads per render.
### Step 13: SECURE — stripCtl on rendered fields; safe-fs; no yaml injection
via the declined marker (fixed literal only).
### Step 14: VERIFY — node --test on the six files + eslint on changed files;
no git; no full suite.
### Step 15: DOCUMENT — JSDoc; predicates' truth tables in comments.
### Step 16: FINAL-REVIEW — report files/tests/red/pins-changed-with-reasons/
decisions.

## Decisions Taken Under Ambiguity

### D1 — Two-plane split: this slice ships library + predicates + menu-side keys; the write recipes land in menu.md (R2-D, same wave)
CTOC's menu is two planes: `menu.js`/`menu-screens.js` RENDER JSON (side-effect-free,
used in tmp-dir tests), and the session executes the emitted `claude:*` actions via
menu.md recipes. A render function therefore cannot itself perform a write or cross a
gate. So for items 1, 2, 4 and 5 this slice ships the LIVE-WIRED half it owns — the
library verbs (`declineComplianceRegime`, `dismissStale`+`invalidate`, the
`environment_prompt_dismissed`/`declined` predicates) and the menu-side option
labels/action keys — while the `node -e "…"` write recipes for
`claude:env-keep-defaults` and the `claude:set-compliance-regime none`→decline binding
live in menu.md (R2-D, `00006`), committed in the SAME wave (identical to how item 4's
`claude:done-all-<parent>` recipe already sits in menu.md and how R2-C handed off
work). menu.md is NOT in this slice's `files:` set, so it is untouched. The live
PREDICATES (`needsComplianceRegimePrompt` honoring `declined`, `needsEnvironmentPrompt`
honoring the dismissed marker) ARE in scope and ARE wired, so the re-ask stops the
moment the marker exists. No stubs: every emitted action key resolves to a recipe that
exists (item 4) or lands in the same commit wave (items 1, 2, 5).

### D2 — One-turn approve delivered as an `autoApprove` signal on validateScreen (not an in-render gate cross)
Item 3's wiring table names `validateScreen` as the site, but a render function must
not cross a human gate (and the tmp-dir tests call it directly). So the clean-validation
path now (a) drops the redundant "Proceed?" second ask and the "Fix issues" option
(nothing to fix), (b) presents a single decisive `Confirm approve` → `claude:approve …`,
and (c) sets `autoApprove: true` on the returned screen — the SIGNAL the R2-D menu.md
driver reads to auto-run the approve in the same turn. The approve→validate ROUTE and
the `claude:approve …` action strings are unchanged, so the route pins survive. The
failed path keeps the `Fix issues` and `Approve anyway` KEYS (so the out-of-scope
`e2e-menu-lifecycle` 5/5b pins stay green) but DEMOTES `Approve anyway` to the LAST
option and records "override" in its description.

### D3 — Compliance decline marker: `declined: true` inside regulatory_regime; legacy block is PREPENDED
`declineComplianceRegime` writes a fixed-literal `declined: true` line inside the
`regulatory_regime:` block (no interpolation → no yaml injection). On a legacy file with
NO such block, the block is CREATED by PREPENDING it (not appending): the reader of
record's block regex `^regulatory_regime:\s*\n([\s\S]*?)(?=^[a-zA-Z_]+:|Z)` needs a
following top-level key to anchor its non-greedy body, so a block appended at EOF would
not parse. Prepending guarantees a trailing key exists. `writeActiveProfiles([])` stays a
byte-identical no-op (test 10 survives) — decline is a separate verb. Missing settings.yaml
still returns `{ok:false}` (never fabricate a hook-critical file).

### D4 — `declined` exposed via regulatory-regime.js (the reader of record) — an EDIT to a read-only input, as the brief permits
Item 1 genuinely requires it: `parseRegimeBlock` now also parses `declined` (line-based,
boolean-coerced, absent ⇒ false) and both `loadActiveProfiles` early returns carry
`declined: false`. The addition is purely ADDITIVE — every existing test destructures
`{ profiles }`/`{ overrides }` and deep-equals the field, never the whole object, so no
pin breaks (`lib-regulatory-regime`, `compliance-integration`, `compliance-ride-along`
all stay green). compliance-regime.js's export set grows by exactly one
(`declineComplianceRegime`), matching the tightened 13b pin.

### D5 — Stale COUNT filters by NOT_STARTED_STAGES; the drill-in LIST stays unfiltered
Item 6: `getInboxCounts.staleCandidates` now counts `scanCheapCandidates().candidates`
filtered to stages NOT in the newly-exported `NOT_STARTED_STAGES` (vision/canvas/
functional) — the honest count of what the classifier can actually act on. A functional
plan whose only signal is unbuilt files is not-started (benign), so it no longer inflates
the nag. `listStaleCandidates` (the drill-in) is deliberately left UNFILTERED so the
read-only inspection screen still shows everything the scan found.

### D6 — `cancelling` gets its own visible bucket; terminal `cancelled` folds into the terminal group
Item 7: `byStatus` was silently dropping any `cancelling` (and any terminal `cancelled`)
task, making a dashboard that lies — a cancelling task holds real file locks and blocks
the queue. `cancelling` now renders as its own active group (board `Cancelling`, section
`⊗ N cancelling … (holds files until the agent is gone)`, counted in the board total and
the empty-check) since it OCCUPIES a slot; terminal `cancelled` folds into the
`failed`/terminal group (rendered `[cancelled]`) so it is never dropped either.

### D7 — dismissStale now busts the read cache (in-scope correctness fix, CF1 invariant)
Making "Don't ask again for these" LIVE (item 5) means a dismiss must drop the
possibly-stale count immediately, not on the next 5 s TTL. `dismissStale` (in scope) now
`require('./cache')` and calls `invalidate()` after the successful atomic write. This also
clears the pre-existing `cache-freshness` CF1 flag on stale-detector.js — fixed at the
source (wire invalidate), never whitelisted.

### D8 — OUT-OF-SCOPE finding (report, do not touch): `e2e-menu-lifecycle.test.js` test 6 pins the replaced env option
Item 2 replaces the ride-along "Decide later" (`claude:env-decide-later`) with the durable
"Keep defaults, stop asking" (`claude:env-keep-defaults`). `tests/e2e-menu-lifecycle.test.js`
line 326-327 pins the OLD `actions['Decide later'] === 'claude:env-decide-later'`. That file
is NOT in this slice's `files:` set (the scope-expansion enumerated `menu-environment.test.js`
but missed `e2e-menu-lifecycle.test.js`), so it is left untouched and now FAILS on that one
assertion. It must be updated to the new label/action in the same wave (identical tightening
to the one already applied to `menu-environment.test.js`). Its tests 5/5b (`Approve anyway`,
`Confirm approve`) were preserved by D2's key-keeping design and stay green.

### D9 — PRE-EXISTING failures on the unstaged tree, unrelated to this slice
Two suites in the working tree were already red from the unstaged R2-A/B/I work, in files
this slice never touches: `cache-freshness` `F2a_archivePlan_busts_plan_counts` (a gate-marker
ordering assertion on `actions.archivePlan`) and `stale-detection-regression` T5 (an approval-
marker ordering assertion on `stale-cleanup.js`'s advance-via-reconciliation). Both are
marker-ORDERING regressions in files outside this slice's 8-source diff — reported, not fixed
here (out of scope).
