---
approved_by: human
approved_at: 2026-07-05T08:35:11.623Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-04T11:16:18.172Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-03T16:52:22.704Z
gate_crossed: functional → implementation
---

---
iron_loop: true
step: 7
step_label: SPEC
files:
  - src/lib/stale-detector.js
  - tests/stale-classifier.test.js
status: implementation
created: 2026-07-01
---

# SD1 — Stage-aware "dead-on-arrival" classification (stop flagging unbuilt backlog as dead)

## 1. ASSESS — Problem Understanding

### Business Context

The stale-plan detector (SP1–SP4) is meant to surface plans that rot after their
work ships or is abandoned. Dogfooding it on CTOC's own backlog (2026-07-01)
revealed a false-positive class: the git-backed verifier classifies **18 of 23**
possibly-stale plans as `dead-on-arrival → revert`, when in fact **0 are stale**.
All 18 are legitimate *unbuilt* functional-stage roadmap items (PI0–6 semantic
plan index, EC1–6 EU compliance, CU1/4/5 coverage, SP5 regression suite).

### Current State

`classifyStaleCandidate` in `src/lib/stale-detector.js`, rule 1:

```js
// 1. DEAD-ON-ARRIVAL — files gone, nothing shipped, never approved.
if (evidence.anyFileMissing && slugMatchCount === 0 && !evidence.approvedBy) {
  return { category: 'dead-on-arrival', proposedAction: 'revert', … };
}
```

The rule is **stage-blind**. Every plan still in the `functional` stage
trivially satisfies all three predicates by definition:
- `anyFileMissing` — true: the work hasn't started, so declared files don't exist.
- `slugMatchCount === 0` — true: no commit references the slug (no work done).
- `!approvedBy` — true: it hasn't crossed a human gate yet.

So "dead-on-arrival" as currently defined **is the normal state of every
not-yet-started functional backlog item.** The proposed `revert` would demote the
entire pending roadmap (functional → vision), corrupting the backlog.

The candidate object already carries `.stage` (candidates are scanned from
`GATE_SOURCE_STAGES = ['functional','implementation','review']`), so the fix has
the signal it needs — it just isn't used in the DOA rule.

### Impact

- The feature's headline output is dominated by false positives (18/23), which
  trains the user to ignore it — defeating the purpose of the detector.
- A human who trusts the proposal and runs cleanup would revert real pending work.
- Sibling to the two other dogfooding-caught defects this cycle (SP4
  DOA-reachability, LH1 CRLF regression): green tests hid a wrong real-world call.

## 2. ALIGN — Approach (resolve at Gate 1 / planning)

- **(A) Stage-gate the DOA rule — RECOMMENDED.** DOA (files-missing ⇒ abandoned)
  only makes sense once files *should* exist — i.e. from `implementation` onward
  (`implementation`/`todo`/`in-progress`/`review`). For `functional` (and
  `vision`/`canvas`), missing files means "not-started," a benign non-stale
  state. Add a `not-started` (or reuse `inconclusive`) classification for
  functional-stage missing-files, so no cleanup action is proposed.
- (B) Exclude `functional` from the stale scan entirely — simpler, but loses the
  ability to ever flag a genuinely abandoned functional plan (e.g. explicitly
  rejected + very old).
- (C) Require stronger abandonment evidence for DOA regardless of stage
  (explicit rejection OR age-past-threshold AND git-inactivity), not just
  files-missing — more robust but larger change.

Decision to make at Gate 1: which of A/B/C (recommendation A, possibly A+C).

## 3. CAPTURE — Acceptance Criteria

### User Story

**As a** CTOC user relying on the stale detector,
**I want** unbuilt functional-stage plans to NOT be classified as dead-on-arrival,
**so that** the detector surfaces only genuinely stale/abandoned plans and I can
trust its proposals without risking my pending roadmap.

### BDD Scenarios

- [x] **Scenario: a not-started functional plan is not dead-on-arrival**
  Given a `functional`-stage candidate with missing declared files, no
  slug-commits, and no approval
  When `classifyStaleCandidate` runs
  Then its category is NOT `dead-on-arrival` and its proposedAction is NOT
  `revert`/`delete` (it is `not-started`/`inconclusive` with no cleanup action)

- [x] **Scenario: an implementation-stage plan with missing files is still DOA**
  Given an `implementation`-stage candidate with the same missing-files evidence
  Then it IS classified `dead-on-arrival` (files should exist by this stage) —
  the fix must not blind the detector to real abandonment past functional

- [x] **Scenario: CTOC's own 18 false positives clear**
  Given the current backlog (PI0–6, EC1–6, CU*, SP5 — all functional, unbuilt)
  When verification runs
  Then none are proposed for `revert`/`delete` (0 dead-on-arrival among them)

- [x] **Scenario: genuinely abandoned plans still surface**
  Given an implementation+ plan that is explicitly rejected or past-threshold-old
  with no activity
  Then it is still classified for cleanup (the detector keeps its teeth)

- [x] **Scenario: behavior/tests unchanged elsewhere**
  Given the existing stale-classifier + cleanup suites
  Then they pass (adjust only the assertions the corrected semantics require)

### In Scope

- `src/lib/stale-detector.js` — make `classifyStaleCandidate` (and, if needed,
  the evidence gathered by `verifyStaleCandidate`) stage-aware per the Gate-1 approach
- `tests/stale-classifier.test.js` — add stage-aware cases (functional not-started
  vs implementation DOA); update assertions the new semantics require

### Out of Scope

- SP4 cleanup execution mechanics (unchanged; this only changes classification)
- The cheap scan (SP1) — it may still surface functional plans as *candidates*;
  the classifier is where staleness is decided
- The four human gates

## Notes

- Origin: dogfooding the stale detector on CTOC's own backlog, 2026-07-01 —
  `inbox verify` returned 18 `dead-on-arrival` that are all unbuilt roadmap.
- Verified root cause: DOA rule (`stale-detector.js`, rule 1) ignores `candidate.stage`.
- Relates to SP5 (regression suite) — the stage-aware cases belong in that suite too.

---

# Implementation Details

> Authored Steps 5 PLAN / 6 DESIGN / 7 SPEC + the Steps 8–16 execution checklist.
> Feeds Gate 2 (implementation → todo). Ancestry read in full before authoring:
> ASSESS root-cause + ALIGN options + CAPTURE BDD/scope above; the live code in
> `src/lib/stale-detector.js`; the existing suite `tests/stale-classifier.test.js`;
> the downstream consumers `src/lib/menu-screens.js` (`inboxVerifyProposals`,
> `inboxCleanup*`) and `src/lib/stale-cleanup.js` (`executeCleanup`).

## 5. PLAN — Confirmed approach

**Approach A — stage-gate the DOA rule. CONFIRMED (recommendation A, not A+C).**

DOA semantics ("declared files are gone ⇒ the plan was abandoned") only hold once
files *should* exist — i.e. from `implementation` onward. Before that
(`vision` / `canvas` / `functional`), missing files means the work simply has not
started: a benign, non-stale state. The fix gates rule 1 on `candidate.stage`,
which the classifier already receives (candidates are scanned from
`GATE_SOURCE_STAGES = ['functional','implementation','review']` and each carries
`.stage`). No new evidence is gathered; `verifyStaleCandidate` is unchanged.

Approach C (require stronger abandonment evidence regardless of stage) is
explicitly **not** taken: it is a larger change and the ASSESS root cause is purely
stage-blindness, not evidence-thinness. Approach B (drop `functional` from the scan)
is rejected — it would permanently blind the detector to a genuinely abandoned
functional plan.

### Category decision — reuse `inconclusive`, NOT a new `not-started` category

The benign functional-stage missing-files case classifies as **`inconclusive` with
`proposedAction: null`**, carrying a dedicated evidence line
(`not started: <stage>-stage plan; declared files not yet built (benign, not stale)`).

Rationale (decisive): a *new* `not-started` category would be **silently dropped**
by the two frozen ordering arrays in `src/lib/menu-screens.js` —
`ORDER = ['shipped-but-early','approved-but-stranded','dead-on-arrival','inconclusive']`
(line ~500, `inboxVerifyProposals` render) and
`CLEANUP_ORDER = ['shipped-but-early','approved-but-stranded','dead-on-arrival']`
(line ~58) — so an unbuilt plan would appear in the candidate count yet render zero
rows. Making a new category render sanely would force `menu-screens.js` into scope
(a new render group + no cleanup mapping). Reusing `inconclusive`:

- renders in the existing `inconclusive` group (`• <plan> → none  (not started: …)`),
- is already excluded from `ACTIONABLE_CLEANUP` (`menu-screens.js` line ~52), so a
  pure not-started stale set surfaces **NO** `Clean up ▸` entry,
- is a no-op in `stale-cleanup.js executeCleanup` (`effective = action || proposedAction`
  is `null` ⇒ "nothing executes", line ~305–320).

⇒ **Zero downstream change. Scope stays `src/lib/stale-detector.js` + `tests/stale-classifier.test.js`.**
No file enters `files:`.

## 6. DESIGN — The revised `classifyStaleCandidate` ladder

Single leaf change: `src/lib/stale-detector.js`. Add one module constant and one
guarded early-return placed **before** the DOA rule. The function stays a pure,
total, degrade-never-throw classifier (no fs, no git, no mutation, no throw).

### New module constant (near `GATE_SOURCE_STAGES`, line ~67)

```js
/**
 * Stages at which declared files are NOT yet expected to exist — a missing-files
 * signal here means the plan is UNBUILT (not started), never abandoned. DOA is
 * gated OUT of these stages. Any stage NOT in this set is treated as
 * "files should exist" so DOA keeps its teeth for implementation/todo/in-progress/
 * review AND for any unknown/malformed stage (fail-toward-keeping-teeth).
 * @type {ReadonlySet<string>}
 */
const NOT_STARTED_STAGES = Object.freeze(new Set(['vision', 'canvas', 'functional']));
```

Polarity is deliberate: the guard is an **allowlist of benign stages**, so the DOA
rule remains the DEFAULT for every other stage (including `undefined`/unknown). The
inverse (allowlist of files-expected stages) would blind DOA on an unrecognized
stage — forbidden by the "do not blind the detector" constraint.

### Revised ladder (first match wins) — `classifyStaleCandidate(candidate, evidence)`

```js
// 0. Missing / git-unavailable evidence ⇒ inconclusive (UNCHANGED).
if (!evidence || !evidence.gitAvailable) { … 'inconclusive', null … }

const slugMatchCount = (evidence.slugMatchCommits || []).length;

// 1. NOT-STARTED (NEW, stage-gate) — a pre-implementation-stage plan whose ONLY
//    staleness signal is missing files means the work has not begun: benign, not
//    stale. This gates the DOA rule so an UNBUILT functional/vision/canvas plan is
//    never proposed for revert/delete. Reuses the `inconclusive` category with a
//    null action so NO cleanup path (SP4) ever acts on it.
if (
  evidence.anyFileMissing &&
  slugMatchCount === 0 &&
  !evidence.approvedBy &&
  NOT_STARTED_STAGES.has(candidate && candidate.stage)
) {
  return {
    plan,
    category: 'inconclusive',
    proposedAction: null,
    evidence: ['not started: ' + (candidate.stage) +
      '-stage plan; declared files not yet built (benign, not stale)'],
  };
}

// 2. DEAD-ON-ARRIVAL (was rule 1; predicate UNCHANGED) — files gone, nothing
//    shipped, never approved. Now only reachable PAST the not-started stages, i.e.
//    implementation/todo/in-progress/review (and any non-benign/unknown stage).
if (evidence.anyFileMissing && slugMatchCount === 0 && !evidence.approvedBy) {
  return { plan, category: 'dead-on-arrival',
    proposedAction: evidence.explicitlyRejected === true ? 'delete' : 'revert',
    evidence: buildEvidenceLines(evidence) };
}

// 3. APPROVED-BUT-STRANDED (UNCHANGED)
// 4. SHIPPED-BUT-EARLY   (UNCHANGED)
// 5. INCONCLUSIVE default (UNCHANGED)
```

Ordering safety: the NOT-STARTED guard requires `!approvedBy` and
`slugMatchCount === 0` and `anyFileMissing`. It therefore **cannot** shadow
approved-but-stranded (needs `approvedBy`) or shipped-but-early (needs a slug match
and `allFilesExist`) — those are mutually exclusive with the guard's predicate. So
placing it first is correct and changes classification ONLY for the exact set the
DOA rule previously over-claimed.

`candidate && candidate.stage` guard keeps totality: a `null`/undefined candidate or
missing `.stage` yields `Set.has(undefined) === false` ⇒ falls through to DOA (the
pre-fix default), so malformed-input tests are unaffected and nothing throws.

### Category / proposedAction contract (post-fix)

| Stage class | Evidence | category | proposedAction |
|---|---|---|---|
| `vision`/`canvas`/`functional` | anyFileMissing, 0 slug, !approved | `inconclusive` (not-started) | `null` |
| `implementation`/`todo`/`in-progress`/`review`/other | anyFileMissing, 0 slug, !approved, !rejected | `dead-on-arrival` | `revert` |
| …same + `explicitlyRejected` | anyFileMissing, 0 slug, !approved, rejected | `dead-on-arrival` | `delete` |
| any | `approvedBy` && `filesModifiedAfterEntry` | `approved-but-stranded` | `advance-via-reconciliation` |
| any | `slugMatchAfterEntry` && `filesModifiedAfterEntry` && `allFilesExist` | `shipped-but-early` | `archive-to-done` |
| any | age-only / thin / partial | `inconclusive` | `null` |
| any | `!gitAvailable` / missing evidence | `inconclusive` | `null` |

The 4-key proposal shape `{ plan, category, proposedAction, evidence }` is unchanged
(test 7 lock preserved). `category` domain is unchanged (`not-started` is NOT a new
value — the typedef union in the file header stays as-is).

## 7. SPEC — Test plan (BDD AC → named test)

All tests live in `tests/stale-classifier.test.js` (TDD: written/adjusted at Step 8
before the src edit). `node:test` + `node:assert/strict`, existing sandbox harness.

### AC → test mapping

| BDD Scenario (CAPTURE) | Test |
|---|---|
| (a) not-started functional plan is NOT dead-on-arrival, proposes no action | NEW `describe('classifier — functional not-started is not DOA')` — `baseCandidate('p-fresh','functional')` + missing-files evidence ⇒ `category==='inconclusive'`, `proposedAction===null`, assert `category !== 'dead-on-arrival'` and `!['revert','delete'].includes(proposedAction)`, and evidence line matches `/not started/i` |
| (b) implementation-stage plan, SAME missing-files evidence, IS still DOA | UPDATE test 3 fixture `baseCandidate('p-dead','implementation')` (was `'functional'`) ⇒ still `dead-on-arrival`/`revert`; PLUS a NEW paired assertion in the not-started describe: same evidence, `stage:'implementation'` ⇒ `dead-on-arrival` (proves the gate discriminates purely on stage) |
| (b′) explicitly-rejected implementation ⇒ delete | UPDATE test 4 fixture `baseCandidate('p-rejected','implementation')` (was `'functional'`) ⇒ `dead-on-arrival`/`delete` |
| (c) CTOC backlog ~18 functional plans clear (0 actionable-revert) | NEW `describe('classifier — CTOC functional backlog clears DOA')` — data-driven over `['PI0','PI2','PI3','PI4','PI5','PI6','EC1','EC2','EC3','EC4','EC5','EC6','CU1','CU4','CU5','SP5','NB4']`, each `baseCandidate(slug,'functional')` + missing-files evidence ⇒ assert EVERY result has `proposedAction === null` and `category !== 'dead-on-arrival'`; assert count of `revert`/`delete` across the set === 0 |
| (d) shipped-but-early / approved-but-stranded still classify correctly | UNCHANGED tests 1 (shipped-but-early ⇒ archive-to-done) + 2 (approved-but-stranded, stage `review` ⇒ advance-via-reconciliation) stay green; the guard's `!approvedBy`/`0 slug` predicate cannot capture them |
| (e) behavior unchanged elsewhere | tests 5 (age-only ⇒ inconclusive), 6 (!gitAvailable ⇒ inconclusive), 7 (proposal shape), 8 (purity), 19 (malformed evidence degrades) stay green — none involve a functional missing-files DOA |
| (menu regression) DOA still surfaces `Clean up ▸` | UPDATE test 13 fixture `writeStalePlan(sb,'implementation','p-render')` (was `'functional'`) so it remains DOA ⇒ preserves the `Clean up ▸` + Back assertions under the corrected semantics |

### Required existing-test edits (corrected semantics ⇒ MUST update)

Because `baseCandidate` defaults `stage='functional'`, three existing fixtures relied
on functional-stage DOA and must move to `implementation` to keep testing DOA:

- **test 3** (`classifier — dead-on-arrival default revert`): `baseCandidate('p-dead')` → `baseCandidate('p-dead','implementation')`.
- **test 4** (`classifier — dead-on-arrival delete iff explicitlyRejected`): `baseCandidate('p-rejected')` → `baseCandidate('p-rejected','implementation')`.
- **test 13** (`menu — inboxVerifyProposals render`): `writeStalePlan(sb,'functional','p-render')` → `writeStalePlan(sb,'implementation','p-render')`.

These are semantics-required edits, not behavior weakening: they preserve the DOA
assertions by relocating them to a stage where DOA legitimately fires.

### Tests that DO NOT need edits (verified)

- **test 13c** (21 functional stale plans, 20 rows + "… and 1 more"): under the fix
  each becomes `inconclusive`, which still renders as a `•` row in the `ORDER`
  group ⇒ 20 rows preserved.
- **test 16 / 17** (per-row degrade / fan-out cap): stub or return
  `inconclusiveEvidence()` ⇒ stage-independent ⇒ unaffected.
- **test 11** (verify never on hot path), **9/10** (verify git probe): exercise
  `verifyStaleCandidate`, which is untouched.
- **`tests/stale-cleanup-human-gate.test.js`**: **STUBS** `classifyStaleCandidate`
  wholesale (replaces `staleDetector.classifyStaleCandidate` at ~line 160) ⇒ never
  runs the real ladder ⇒ unaffected.
- **`tests/stale-detector-cheap.test.js`**: tests `scanCheapCandidates` signals /
  `actionable`, not `category` ⇒ unaffected.
- **`src/lib/menu-screens.js`** + `stale-cleanup.js`: unchanged (see §5 category
  decision) ⇒ their tests unaffected.

Coverage: the new lines (one constant, one guarded branch) are covered by the
not-started test (branch taken) and the implementation-DOA test (branch not taken),
plus the vision/canvas defensive assertion; keeps `stale-detector.js` ≥ 80%.

## Steps 8–16 execution checklist (canonical labels)

### Step 8: TEST (TDD — write failing tests FIRST)
Write/adjust `tests/stale-classifier.test.js`: create the three NEW `describe`
blocks (functional not-started incl. the implementation-DOA paired case; the
CTOC-backlog data-driven case; a `vision`/`canvas` defensive case), and apply the
three fixture edits to tests 3, 4, 13. Run `node --test tests/stale-classifier.test.js`
and confirm the NEW tests FAIL (red) against the current stage-blind classifier
while the edited tests pin the intended post-fix behavior.

### Step 9: PREPARE
Confirm no new deps, no new files, `files:` unchanged. Re-read the classifier ladder
and the two menu-screens ordering arrays to reconfirm zero downstream change.

### Step 10: IMPLEMENT
In `src/lib/stale-detector.js`: add the `NOT_STARTED_STAGES` frozen Set near
`GATE_SOURCE_STAGES`; insert the guarded not-started early-return as new rule 1 in
`classifyStaleCandidate`, immediately before the existing DOA return. No other edit.
Keep the function pure and total (`candidate && candidate.stage`). No stub, no TODO.

### Step 11: REVIEW
Self-review: guard predicate matches DOA predicate + stage allowlist; first-match
ordering cannot shadow rules 3/4; evidence line is control-char-free (static string);
no I/O, no mutation, no throw path introduced.

### Step 12: OPTIMIZE
Confirm the Set lookup is O(1) and the added branch is the minimal change; no
redundant recomputation of `slugMatchCount`.

### Step 13: SECURE
No new input surface, no fs/subprocess, no regex on external data added. The evidence
string interpolates only `candidate.stage` (an internal enum-ish value from
GATE_SOURCE_STAGES); no attacker-influenced field enters the new line.

### Step 14: VERIFY
Run `node --test tests/stale-classifier.test.js` (all green), then the full suite
`node --test tests/*.test.js` and confirm `# fail 0`, 0 skipped. Confirm coverage of
the new branch both taken and not-taken. Lint clean.

### Step 15: DOCUMENT
Add a short JSDoc note on `NOT_STARTED_STAGES` (done in DESIGN) and a one-line
comment on the new rule 1 explaining the stage gate and the `inconclusive` reuse.

### Step 16: FINAL-REVIEW
Verify against CAPTURE ACs (a)–(e): functional not-started clears; implementation DOA
retained; 0 actionable-revert across the 18-plan backlog set; shipped/approved
categories intact; existing suites green. Confirm no gate crossed automatically.

## Decisions Taken Under Ambiguity

1. **`inconclusive` reuse over a new `not-started` category** — chosen to keep the
   change leaf-local (avoids editing the two frozen ordering arrays in
   `menu-screens.js`, which would silently drop an unlisted category from the verify
   render). The not-started meaning is preserved via a dedicated evidence line.
2. **Allowlist benign stages (`vision`/`canvas`/`functional`) rather than allowlist
   files-expected stages** — so DOA stays the default for every other/unknown stage,
   honoring "do not blind the detector." An unrecognized stage keeps DOA teeth.
3. **`todo`/`in-progress` treated as files-should-exist (DOA-eligible)** even though
   the cheap scan does not currently surface them — makes the classifier correct for
   any stage a future caller might pass, at zero cost.
4. **Frontmatter advanced to `step: 7 / SPEC`, `status: implementation`** to reflect
   the authored blueprint and the plan's actual directory; `iron_loop: true` retained.

### Execution decisions (Steps 8–16, 2026-07-04)

5. **Blueprint verified against live code before editing** — the Step 5/6/7 quotes
   (DOA rule ladder, `candidate.stage`, `slugMatchCount`, evidence shape,
   `menu-screens.js` `ORDER`/`CLEANUP_ORDER`) matched the real source exactly. No
   discrepancy found; implemented as specified.
6. **CTOC backlog test set expanded to the literal 19-plan brief** —
   `[PI0, PI2, PI3, PI4, PI5, PI6, EC1–EC6, CU1, CU4a, CU4b, CU4c, CU5, SP5, NB4]`
   (CU4 split into CU4a/b/c per the execution brief). Slugs are opaque to the
   classifier, so the set validates the stage-gate over a realistic count; all 19
   produce `proposedAction: null`, `category !== 'dead-on-arrival'`.
7. **Added a `missingFilesEvidence()` shared fixture in the test file** — the exact
   DOA-trigger evidence shape, so the not-started vs implementation-DOA paired
   assertions differ ONLY by `candidate.stage`, proving the gate discriminates on
   stage alone (detector not blinded). Not a behavior change; a test-clarity choice.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing) — 3 new assertions failed against the stage-blind classifier (28 tests, 3 fail)

### Step 9: PREPARE
- [x] Install dependencies if needed — none; no new deps
- [x] Check prerequisites — `files:` unchanged; scope stays stale-detector.js + tests
- [x] Verify dev environment ready
- [x] Create directories/config if needed — none

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — added `NOT_STARTED_STAGES` frozen Set + guarded not-started early-return before the DOA rule
- [x] Add error handling — `candidate && candidate.stage` keeps the classifier total; `Set.has(undefined)===false`
- [x] Wire up integration points — reuses `inconclusive`; zero downstream change

### Step 11: REVIEW
- [x] Self-review all new code — guard predicate matches DOA predicate + benign-stage allowlist; first-match ordering cannot shadow rules 3/4 (they need approvedBy / slug match)
- [x] Verify integration points work together — inconclusive renders in menu-screens ORDER, absent from CLEANUP_ORDER ⇒ no cleanup entry
- [x] Check error handling completeness — pure, total, degrade-never-throw preserved

### Step 12: OPTIMIZE
- [x] Remove redundant operations — Set lookup O(1); slugMatchCount reused, not recomputed
- [x] Optimize critical paths
- [x] Simplify complex code — minimal single-branch change

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — no new input surface, no fs/subprocess
- [x] Sanitize outputs — evidence line interpolates only `candidate.stage` (internal enum-ish); static string, control-char-free
- [x] No secrets in code
- [x] Safe file operations — none added

### Step 14: VERIFY
- [x] Run lint + type check — `npx eslint . --max-warnings 0` exit 0; `tests/typecheck.test.js` 1/1 pass
- [x] Run ALL tests (TDD Green) — `tests/stale-classifier.test.js` 28/28; full suite `tests/*.test.js` 2742/2742, fail 0
- [x] Check coverage >= 80% — stale-detector.js 92.54% lines / 90.91% functions; new branch covered taken + not-taken
- [x] 0 skipped, 0 flaky tests — 0 skipped across the suite

### Step 15: DOCUMENT
- [x] Update relevant documentation — JSDoc on `NOT_STARTED_STAGES` + inline comment on the new rule
- [x] Add JSDoc comments to new functions — no new function; constant documented
- [x] Update CHANGELOG if needed — n/a (leaf classifier fix; version bump handled at release)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed — CAPTURE ACs (a)–(e) satisfied: functional not-started clears; implementation DOA retained; 0 actionable across the 19-plan backlog set; shipped/approved intact; existing suites green
- [x] Manual verification if needed
- [x] Ready for human review — plan NOT moved between stages (remains in todo/)
