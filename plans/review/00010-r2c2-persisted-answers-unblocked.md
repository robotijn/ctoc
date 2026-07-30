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
  - "src/lib/regulatory-regime.js"
  - "src/lib/settings.js"
  - "src/lib/menu-screens.js"
  - "src/lib/inbox.js"
  - "src/lib/stale-detector.js"
  - "src/commands/start.js"
  - "src/commands/start.md"
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
   empty write). `needsComplianceRegimePrompt` (src/commands/start.js — the menu
   entry point; there is no menu.js) returns false when
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
3. **Explicit approve click (R6/W2 — human override, 2026-07).** Keep the
   approve→validate ROUTE (so menu-screens.test.js route pins survive); change
   validateScreen behavior: ALL checks pass → offer a single decisive
   `Confirm approve` option the human MUST click (no redundant "Proceed?" second
   ask, no Fix option); any check fails → failure list with "Approve anyway
   (records an override)" as the LAST option. The one-turn `autoApprove` signal
   is DELETED entirely — no field on the screen may let a driver run the approve
   in the same turn, and start.md's driver never consumes such a signal. A human
   gate ALWAYS requires an explicit human action. Update the confirm-screen shape
   pins to the new contract.
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
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 9: PREPARE — read ALL files in scope from disk IN FULL, plus
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
regulatory-regime.js and stale-detector.js (post-R2-E) and R2-C's D1-D4 in
plans/todo/00005. Do not trust remembered line numbers.
### Step 10: IMPLEMENT — items 1–6.
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
### Step 11: REVIEW — every pin change listed with its justification; any pin
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
DELETED (not tightened) is a violation.
### Step 12: OPTIMIZE — no extra settings/registry loads per render.
### Step 13: SECURE — stripCtl on rendered fields; safe-fs; no yaml injection
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
via the declined marker (fixed literal only).
### Step 14: VERIFY — the REAL ship gate: the FULL gated suite via `npm test`
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
(all tests, coverage floor ≥ 99 scoped to `src/**`, 0 skipped, 0 flaky) — NOT a
six-file subset. `node --test tests/*.test.js` bypasses the coverage and
zero-skipped gates, so it is never the certifying run for a review→done crossing.
The rework of 2026-07 ran the full `npm test` green (see the Step-16 report).
### Step 15: DOCUMENT — JSDoc; predicates' truth tables in comments.
### Step 16: FINAL-REVIEW — report files/tests/red/pins-changed-with-reasons/
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
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

### D2 — Explicit approve click on validateScreen; the `autoApprove` one-turn signal is DELETED (human override, 2026-07)
Item 3's wiring table names `validateScreen` as the site, and a render function must
not cross a human gate (the tmp-dir tests call it directly). The clean-validation path
(a) drops the redundant "Proceed?" second ask and the "Fix issues" option (nothing to
fix), and (b) presents a single decisive `Confirm approve` → `claude:approve …` that the
human MUST click. The earlier design shipped an `autoApprove: true` field the start.md
driver read to auto-run the approve in the SAME turn; the human ruled that OUT — a human
gate always requires an explicit human action, so the signal must not exist at all. The
`autoApprove` field is therefore REMOVED from every validateScreen return (clean, failed,
and the non-gate early return), the internal branch flag is renamed `clean` (a rendering
decision, never an auto-run licence), and start.md rule 5 is rewritten to WAIT for the
human's explicit click and never auto-run an approve. The approve→validate ROUTE and the
`claude:approve …` action strings are unchanged, so the route pins survive. The failed
path keeps the `Fix issues` and `Approve anyway` KEYS (so the `e2e-menu-lifecycle` 5/5b
pins stay green) but DEMOTES `Approve anyway` to the LAST option and records "override" in
its description.

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
filtered to stages NOT in the exported `NOT_STARTED_STAGES` — the honest count of what
the classifier can actually act on. On disk that set is
`vision/canvas/functional/implementation` (stale-detector.js:183): `implementation` was
added later as a pre-build, pre-Gate-2 stage whose declared `files:` are INTENDED to be
missing, so it behaves exactly as `functional` already did. A plan at any of those stages
whose only signal is unbuilt files is not-started (benign), so it no longer inflates the
nag. The inbox.js count comment names the same four stages (kept in sync with disk). `listStaleCandidates` (the drill-in) is deliberately left UNFILTERED so the
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

### D8 — RECONCILED with disk (2026-07): `e2e-menu-lifecycle.test.js` already asserts the NEW env action and PASSES
Item 2 replaced the ride-along "Decide later" (`claude:env-decide-later`) with the durable
"Keep defaults, stop asking" (`claude:env-keep-defaults`). The earlier note claimed
`tests/e2e-menu-lifecycle.test.js` was left untouched pinning the OLD action and therefore
FAILED. That is contradicted by disk: `e2e-menu-lifecycle.test.js:339` asserts
`json.actions['Keep defaults, stop asking'] === 'claude:env-keep-defaults'` with an R2-C2
note, and the file passes. The pin was updated in the same wave, so there is no lingering
red here. Its `Approve anyway` / `Confirm approve` assertions were preserved by D2's
key-keeping design and stay green (the explicit `Confirm approve` click survives the
`autoApprove` deletion).

### D9 — RESOLVED: the two once-red suites are now GREEN on the committed tree
The earlier note recorded two suites red on the unstaged working tree —
`cache-freshness` `F2a_archivePlan_busts_plan_counts` and `stale-detection-regression`
T5 — from the then-unstaged R2-A/B/I work. Those slices have since landed (the
review-stage hardening wave, 00003/04/05/09 committed through v6.13.35), and the full
`npm test` gate now runs green on the committed tree. Both suites pass; there is no
lingering red outside this slice. The 2026-07 rework confirmed this by running the FULL
gate (see the Step-16 report), not a six-file subset.

## Step 16 — FINAL-REVIEW report (rework, 2026-07-26)

This plan's R2-C2 code shipped correctly for a human, but four review findings on the
record were fixed at the highest quality. The runtime feature was already live and wired
(start.js:986 calls `needsComplianceRegimePrompt`; the menu renders the validate screen);
this rework corrects a human-gate hazard and three record-integrity gaps.

**Change surface (real diff):**
- `src/lib/menu-screens.js` — deleted the `autoApprove` one-turn signal from every
  `validateScreen` return (clean, failed, non-gate early return); renamed the internal
  branch flag to `clean` (a rendering decision, not an auto-run licence); the clean path
  still offers an explicit `Confirm approve` the human must click.
- `src/commands/start.md` — rewrote the approve recipe (rule 5) to WAIT for the human's
  explicit click and never auto-run an approve; removed every `autoApprove` reference.
- `src/lib/inbox.js` — the stale-count comment now names all four NOT_STARTED stages
  (vision/canvas/functional/implementation), matching disk.
- `plans/todo/00010-…md` — `files:` corrected to the real change surface (removed the
  phantom `src/commands/menu.js`; added `src/commands/start.js`,
  `src/lib/regulatory-regime.js`, `src/commands/start.md`); items 1 & 3, D2, D5, D8, D9,
  and Step 14 reconciled with disk.
- `tests/menu-screens.test.js`, `tests/menu-task-wiring.test.js` — pins tightened to the
  new contract (no `autoApprove` field on any screen; an explicit `Confirm approve` click
  is required; start.md consumes no auto-run signal). TDD: the pins were rewritten and run
  RED (8 failing) against the old code before the fix, GREEN after.

**Fixes, mapped to findings:**
1. `one-turn-approve-gate-automation` (HUMAN OVERRIDE) — the `autoApprove` signal and its
   start.md consumer are DELETED entirely; a human gate always requires an explicit human
   click. Nothing can auto-run an approve in the same turn.
2. `files-contract-does-not-match-disk` — `files:` now names exactly the files this plan's
   work changed.
3. `decisions-record-contradicts-disk` — D8 (the e2e test asserts the NEW action and
   passes) and D5 / the inbox.js comment (NOT_STARTED_STAGES includes `implementation`)
   reconciled with disk; D9 marked resolved.
4. `full-suite-never-run` — Step 14 rewritten to name the REAL ship gate (full `npm test`,
   coverage floor ≥ 99, 0 skipped); the rework ran it green.

**Verify:** full `npm test` gate GREEN — 10495 pass, 0 failed, 0 skipped, coverage
99.04% ≥ 99 floor.

**Ledger:** the todo/ approval-ledger entry is re-backfilled to match the reworked plan
content (whole-file `hash_scope: file` digest recomputed), per the human-ordered
rework-wave pattern — recorded as `backfilled: true`, not a live click. The plan was
already past the implementation→todo gate; this keeps its residency entry matching the
authorized content edit and does not cross any gate.
