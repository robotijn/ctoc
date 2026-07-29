---
title: "R2-E — Init writes the regulatory block; stale detector tells the truth and stays dismissed"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/init-project.js"
  - "src/lib/stale-detector.js"
  - "tests/init-project.test.js"
  - "tests/stale-detector.test.js"
---

# R2-E — Fresh projects answerable; stale nag honest and dismissible

Fixes R4 (HIGH init never writes the regulatory block → compliance question
unanswerable + rides forever) and R3 (HIGH stale "Not now" lasts one turn +
stage-polarity defect flags healthy pre-gate plans).

## Implementation Details

1. **Init writes the regulatory block (R4).** `generateSettings` (or the
   settings.yaml writer init uses) includes a `regulatory:` block with
   `active_profiles: []` by default, so `compliance-regime.js`'s line-anchored
   writer has its anchor from day one and a fresh project can persist ANY
   compliance answer (including "none" — R2-C makes that write a declined
   marker; this slice guarantees the anchor exists). Read compliance-regime.js
   FIRST to match the exact key/format it parses — the two must agree on disk
   format, and compliance-regime.js is the reader of record.
2. **Stale-detector polarity (R3 root).** Read the module and its consumers;
   locate the stage-polarity defect the vision's fifth critic recorded (the
   detector classifies plans on the WRONG side of a gate as stale — healthy
   pre-gate plans feed the nag). Fix the classification so only genuinely
   stalled plans (past a gate they should have moved beyond, older than
   threshold) are candidates; document the corrected rule in the module
   header. If, after reading, the polarity is genuinely NOT defective, STOP
   on that item and report the evidence instead of changing behavior.
3. **Durable dismissal (R3).** Stale candidates carry a content signature
   (plan path + mtime). A new persisted dismissal store (settings or
   `.ctoc/state/stale-dismissals.json`, safe-fs, fail-open read) records
   dismissed signatures with a "Don't ask again for these" option surfaced by
   the ride-along; the detector filters dismissed signatures whose mtime is
   unchanged (a plan that CHANGED since dismissal may re-surface). "Not now"
   stays a one-turn skip.

### Wiring — the live call sites (MANDATORY)

| change | live call site | root |
|---|---|---|
| regulatory block | initProject → menu first-open (exists) | /ctoc:menu |
| polarity fix | stale ride-along predicate (exists) | /ctoc:menu |
| dismissal store | stale-detector filter + ride-along option label (this slice; menu option handling is R2-C's file — coordinate via the option VALUE the ride-along already routes, or expose a `dismissStale(root, candidates)` export R2-C's route calls; if menu-screens.js wiring is unavoidable, STOP and report instead of touching it) | /ctoc:menu |

### Test Plan (TDD-Red first)
init: fresh temp project → settings.yaml contains the regulatory block in the
exact format compliance-regime.js parses (round-trip: writeActiveProfiles/
declined write succeeds on a freshly-inited project — call the real module).
stale-detector: pre-gate healthy plan NOT a candidate; genuinely stalled plan
IS; dismissal round-trip (dismiss → filtered; touch the plan file → surfaces
again); corrupt dismissal store fails open to no-filter.

## Execution Plan (Steps 8-16)
### Step 8: TEST — write tests, run ONLY these two test files, record red.
- [x] TEST — TDD tests present; Step-11 workflow re-review (2026-07-29) confirmed real/adversarial, not vacuous.
### Step 9: PREPARE — read init-project.js, stale-detector.js,
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
compliance-regime.js (reader of record), and the existing tests IN FULL.
### Step 10: IMPLEMENT — changes 1–3.
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
### Step 11: REVIEW — diff vs plan; init must not scaffold anything else new.
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3; findings minor/info only, documented.
### Step 12: OPTIMIZE — detector stays O(plans).
### Step 13: SECURE — safe-fs; no user-controlled paths in the store.
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
### Step 14: VERIFY — node --test on the two files + eslint; no git.
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
### Step 15: DOCUMENT — module headers updated to the corrected rules.
### Step 16: FINAL-REVIEW — report files/tests/red-evidence/decisions.
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.

## Decisions Taken Under Ambiguity

1. **Block key is `regulatory_regime:`, not `regulatory:` (item 1).** The plan text
   says "a `regulatory:` block", but the reader of record is
   `src/lib/compliance-regime.js`, which derives every answer from
   `src/lib/regulatory-regime.js` `loadActiveProfiles`. That reader parses the
   `regulatory_regime:` block (regex `^regulatory_regime:\s*\n…`) and its indented
   `active_profiles:` list. Matching the reader byte-for-byte is the explicit
   requirement ("compliance-regime.js is the reader of record"), so init writes
   `regulatory_regime:` with `active_profiles: []`. Placed between the
   `enforcement:` and `detected:` blocks so a top-level key always follows it (the
   reader's block-terminator lookahead needs a following top-level key).

2. **Item 2 (stale-detector polarity) — STOPPED per the plan's explicit STOP
   condition; NO behavior changed.** After reading the module AND its consumers,
   the stage polarity is correctly implemented and is NOT defective in the
   detector. The cheap pass (`scanCheapCandidates`) is deliberately broad; the
   not-started polarity lives in `classifyStaleCandidate` via `NOT_STARTED_STAGES`,
   which downgrades a functional-stage missing-file to `inconclusive`/null so no
   cleanup path acts on it. This is a designed two-layer split, regression-locked
   by `tests/stale-detection-regression.test.js` **T3b** (asserts
   `cand.actionable === true` for a functional missing-file "at any gate-source
   stage" with the comment *"cheap-actionable but classifier-benign"*). Re-locating
   the polarity into the cheap pass would break T3b — a deliberate invariant, not a
   bug — which lesson 14 forbids. The only residual is that the hot-path nag COUNT
   (`inbox.js` getInboxCounts → raw `scanCheapCandidates().count`) includes
   functional candidates; narrowing the COUNT is a consumer concern in `inbox.js`
   (SP2-owned, out of scope) / `menu-screens.js` (R2-C's file, told to STOP rather
   than touch), not a detector-classification defect. Evidence recorded; behavior
   left unchanged.

3. **Dismissal signature is derived internally, never added to the candidate
   (item 3).** `tests/stale-detector-cheap.test.js` FIX-6 locks the candidate to
   exactly 4 keys (`actionable, plan, signals, stage`) with "no path/mtime leak".
   The signature (path + mtime) is therefore computed inside `scanCheapCandidates`
   from the SAME lstat already taken (no extra syscall, no shape change) and inside
   `dismissStale` from the plan file on disk (authoritative, never trusted from the
   caller). Store lives at `.ctoc/state/stale-dismissals.json`
   (`{ dismissed: { "<stage>/<slug>.md": mtimeMs } }`), git-ignored by init,
   fail-open read, atomic (temp+rename) write.

4. **`dismissStale` exported; menu wiring left to R2-C by the plan's own seam.**
   The read/filter half is already LIVE on the hot path (inbox.js →
   scanCheapCandidates drives both the nag count and the drill-in list). The
   dismiss-WRITE trigger (the "Don't ask again for these" menu option) is R2-C's
   `menu-screens.js` route per the plan's Wiring table; the plan explicitly says to
   expose `dismissStale(root, candidates)` for that route and STOP rather than touch
   `menu-screens.js`. Done — export ready, no menu-screens.js edit.
