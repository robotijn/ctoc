---
iron_loop_verdict: true
iron_loop: true
title: "On a regulated project a plan waits for the owner where the regime's own check has no record"
type: implementation
created: 2026-10-07
priority: high
effort: small
parent_plan: ctoc-keeps-working-and-asks-only-what-matters
depends_on: ctoc-keeps-working-and-asks-only-what-matters-s3-instructions-say-what-the-code-does
files:
  - src/lib/streaming-gate.js
  - tests/plans-keep-moving-without-the-human.test.js
  # Rule 14 says activating a compliance profile changes no crossing; this plan makes that untrue for the functional crossing
  - src/commands/start.md
  # its paragraph on finishing on recorded evidence lists every condition; this plan adds the regime conditions
  - docs/ENFORCEMENT.md
approved_by: human
approved_at: 2026-10-07T17:38:58.663Z
gate_crossed: implementation → todo
---

# On a regulated project a plan waits for the owner where the regime's own check has no record

A regression fix, fail-closed, not a new feature (the session's decisions of 2026-10-07). Based
on the slice-3 tree (worktree `agent-aa7748b330f80c58d`), which edits `src/lib/streaming-gate.js`,
`src/commands/start.md`, `docs/ENFORCEMENT.md` and the test file this plan extends; functions are
named, not line numbers, because that tree is still being built.

## Problem statement

Since v6.14.119 (main 547bd62c) `pendingGateDecisions` in `src/lib/streaming-gate.js` moves a
pre-build plan across its crossing by sufficiency (`crossBySufficiency`, on every render, the
default screen included) and, on the continuation's pass only, finishes a built plan on its
recorded checks (`crossOnEvidence`). Neither looks at the project's regulatory regime. Checked
against the code:

1. **GDPR or EU AI Act on: the compliance review never happens on the functional crossing.**
   The compliance review is not triggered by code on any path. It is an instruction to the CTO
   Chief, "When a plan crosses Gate 1 (functional → implementation)", to run
   `iron-loop-compliance-trigger.evaluateComplianceTrigger` and, when it reports a regime on,
   the seam `compliance-integration.runComplianceForTransition` (`agents/coordinator/cto-chief.md`,
   section "Compliance dispatch at the functional → implementation transition"). Neither
   `src/lib/actions.js` nor `src/lib/streaming-gate.js` calls either function. A crossing on
   sufficiency happens inside the menu's code with no agent present, so that instruction never
   applies. The sufficiency crossing itself predates v6.14.119 (plans 00180–00184), but then a
   plan reached "enough" only after the human generated its questions and answered every
   fork; since v6.14.119 the author writes the questions and the gate critic classifies them, so
   a regulated project's functional plans now cross with nobody touching them.
   **No recorded result exists:** `runComplianceForTransition` writes one Inbox question per
   plan-stage finding through the two runners and nothing else — nothing on a clean run, nothing
   keyed to a plan or a version of it; the dispatch log is an instruction-level protocol
   (`docs/DISPATCH_PROTOCOL.md`).
2. **Independent verification and validation on: a built plan finishes over the verification
   chief's findings.** `agents/coordinator/ivv-chief.md` (activated by
   `isControlEnabled(root, 'independent_verification_validation')`, required by the shipped
   profiles do-178c-level-a, iso-26262-asil-d, iec-62304-class-c and iec-61508-sil-3) says "a
   Gate 3 is not crossed over unresolved critical IV&V findings", and the only thing that held
   that was the human's decision at review → done. `crossOnEvidence` now finishes the plan on its
   passing check record. **CTOC cannot read those findings:** no file under `src/` names
   `.ctoc/audit/ivv-dispatches/` (exact-text check), and the chief's findings are agent-written
   YAML keyed to a dispatch, not to a plan.
3. **The same holds for three more controls that act at review → done**: two distinct approvers
   (`four_eyes_gate3`: sox-itgc, pci-dss-v4, hipaa, finra, nydfs-500), the
   specification-to-code reconciliation (`spec_code_reconciliation`: sox-itgc, mifid-ii) and the
   closing lesson (`lessons_learned_closure`: sox-itgc, iso-9001). None is checked by code
   (`agents/coordinator/cto-chief.md` marks each NOT ENFORCED); before v6.14.119 the human's
   decision at that crossing was the only point where any of them could be honoured.

Projects with no regime — CTOC's own repository included (`active_profiles: []`,
`declined: true`) — are not affected.

## Technical approach

One guard where every live crossing on evidence runs: `pendingGateDecisions`. CTOC records none
of these regimes' own evidence, so the crossing on evidence simply does not happen in them and
the plan waits for the owner's own approve — the path before v6.14.119. One plain sentence on the
screen says why.

### `src/lib/streaming-gate.js` (MODIFY)

- **`REVIEW_SIGN_OFF_CONTROLS`** (internal, frozen): `['four_eyes_gate3',
  'spec_code_reconciliation', 'lessons_learned_closure']`.
- **`regimeHold(root, stage) → null | 'compliance-review' | 'independent-verification' | 'review-sign-off' | 'regime-unreadable'`** (internal, JSDoc):
  ```js
  function regimeHold(root, stage) {
    if (stage !== 'functional' && stage !== 'review') return null;
    try {
      const regime = require('./regulatory-regime');
      regime.loadActiveProfiles(root); // throws when .ctoc/settings.yaml cannot be read: hold
      if (stage === 'functional') {
        const t = require('./iron-loop-compliance-trigger').evaluateComplianceTrigger(root);
        return t.runGdpr || t.runEuAiAct ? 'compliance-review' : null;
      }
      if (regime.unloadableProfiles(root).length > 0) return 'regime-unreadable';
      const controls = regime.effectiveControls(root);
      if (controls.has('independent_verification_validation')) return 'independent-verification';
      return REVIEW_SIGN_OFF_CONTROLS.some((c) => controls.has(c)) ? 'review-sign-off' : null;
    } catch {
      return 'regime-unreadable'; // a regime CTOC cannot read holds the plan
    }
  }
  ```
  The controls are read through `effectiveControls` (one read of the set), never through a
  literal `isControlEnabled(` call: the compliance-claims fence counts a control as enforced from
  such a call, and the three sign-off controls' own checks still do not run, so their NOT
  ENFORCED labels must stay true.
- **`pendingGateDecisions`**: right after `readPlans` for a stage, `const regime = plans.length > 0
  ? regimeHold(projectRoot, stage) : null;` (once per stage, no read for an empty stage). The
  sufficiency crossing condition gains `&& !regime`; the review condition (`crossed && stage ===
  'review' && …`) gains `&& !regime`. Every pushed descriptor gains `regimeHold: regime`.
  `enough`, `sufficiencyReason` and every other field are unchanged. JSDoc (header and
  `@returns`) says so.
- **`REGIME_LINES`** (internal, frozen) — one plain sentence per reason:
  - `compliance-review`: "It waits for your approval: this project has an EU compliance profile on (GDPR or the EU AI Act), and nothing records that the compliance review ran for this version of the plan, so it does not move on by itself."
  - `independent-verification`: "It waits for your approval: this project requires independent verification and validation, and CTOC cannot read the verification chief's findings, so it does not finish on its checks by itself."
  - `review-sign-off`: "It waits for your approval: this project's regulatory regime requires a sign-off here that CTOC does not check — two distinct approvers, a reconciliation of the specification against the code, or a closing lesson — so it does not finish on its checks by itself."
  - `regime-unreadable`: "It waits for your approval: CTOC could not read this project's regulatory settings, so it does not move on by itself."
- **`regimeLine(d)`** (internal) → `''`, or `  <sentence>\n` for `d.regimeHold`.
- **`sufficiencyLine(d)`** returns its line as today followed by `regimeLine(d)`, so an open fork
  and the regime reason both show. **`richQuestionScreen`** adds `regimeLine(d)` after the
  separator line, so the sentence also shows while a question is being asked.

### `src/commands/start.md` (MODIFY)

Rule 14, the clause "activating a compliance profile only writes `active_profiles` and changes no
crossing: the vision still needs the human's own approve, and the other three still move on
recorded evidence unless a question needs him" (follow the text as slice 3 leaves it) becomes:
"activating a compliance profile only writes `active_profiles`; while GDPR or the EU AI Act is on,
a functional plan never moves into technical planning by itself — nothing records that the
compliance review ran — so it waits for the human's own approve; the vision still needs his
approve, and the other crossings still move on recorded evidence unless a question needs him."

### `docs/ENFORCEMENT.md` (MODIFY)

`docs/*.md` is claim surface for the compliance-claims fence, so the wording below follows its
two rules: a block naming a control that is not enforced carries the literal marker, and a block
naming an enforced control carries none. After the paragraph "Review to done on recorded
evidence", two paragraphs:

- **Regulated projects.** (names no control identifier): while the GDPR or EU AI Act high-risk
  profile is on (the CTO Chief's compliance trigger), a functional plan never crosses into
  implementation on sufficiency, because nothing records that the compliance review ran for that
  version of the plan; while the regime requires independent verification and validation, a
  built plan never finishes on its checks, because CTOC cannot read the verification chief's
  findings; a regime CTOC cannot read (an unreadable `.ctoc/settings.yaml`, or, at review, a
  declared profile it cannot load) holds the plan the same way. Each waits for the owner's
  approve and the screen says why in one sentence (`streaming-gate.regimeHold`). A project with
  no regime is unchanged. Held by `tests/plans-keep-moving-without-the-human.test.js`.
- One paragraph that names `four_eyes_gate3`, `spec_code_reconciliation` and
  `lessons_learned_closure` and carries the marker: while any of them is active, a built plan
  also never finishes on its checks and waits for the owner's approve. **NOT ENFORCED**: their own
  checks (two distinct approvers, the reconciliation, the closing lesson) do not run; only the
  crossing on evidence waits, so the owner's approve still crosses with one approver. This
  paragraph does not name `independent_verification_validation`.

## Wiring — the live call sites

- `regimeHold` is called by `pendingGateDecisions`, which runs on the default `/ctoc:start`
  screen (`streamingGateScreen`), on `stream answer`, `stream approve` and `stream skip`, and on
  `menu task complete <id> --continue` (`menu-screens.continueAfterCrossing`). Root: the shipped
  slash command `src/commands/start.js` → `menu-screens.route`.
- `regimeLine` is called by `sufficiencyLine` (in `gateScreenAt`) and by `richQuestionScreen`,
  both reached from `streamingGateScreen`.
- `evaluateComplianceTrigger`, `loadActiveProfiles`, `unloadableProfiles` and `effectiveControls`
  already have live callers; this adds one each and no export.

## Test plan (Step 8, written first)

In `tests/plans-keep-moving-without-the-human.test.js`, numbered after the last case the file
holds when this slice starts (48–52 on the slice-3 tree as read), real functions in a temporary
project, nothing mocked. One helper, `setRegime(root, { profiles = [], overrides = {}, declined =
false })`: writes `.ctoc/settings.yaml` as a `regulatory_regime:` block (`active_profiles: [..]`,
`declined: true` when asked, and an `overrides:` map of `<control>: true|false` lines) and copies
each named profile CTOC ships from the repository's `.ctoc/regulatory-regimes/` into the sandbox
(a name with no shipped file is not copied). Every "stays" assertion is paired with the
descriptor from `streamingGate.pendingGateDecisions(root)` showing `regimeHold` set,
`passesValidation: true` and (pre-build) `enough: true`, so a plan held for another reason cannot
pass.

- **Case 48 — GDPR or EU AI Act on: a functional plan with enough information waits for the
  owner.** For `gdpr` and for `eu-ai-act-high-risk`: case 1's plan and two classified detail
  questions. After `continueAfterCrossing(root)` and `streamingGateScreen(root)`: still in
  `functional/`, `ledger.readEntry(slug)` is null, no `plan` task; the descriptor
  `regimeHold: 'compliance-review'`; the screen text (the rich screen, asking the first detail)
  contains the compliance sentence verbatim. Then `route(['stream', 'approve', ref])` moves it to
  `implementation/` with `approved_by` `human`. Red today: the plan crosses as in case 1.
- **Case 49 — independent verification and validation on: a built plan with passing checks does
  not finish on them.** `setRegime(root, { profiles: ['do-178c-level-a'] })`; `seedBuilt(root,
  'c49')`; ledger file bytes kept. After `continueAfterCrossing(root)`: still in `review/`, the
  ledger file byte-identical, no `done` entry in `crossed`; the descriptor
  `regimeHold: 'independent-verification'`; the default screen contains the verification sentence
  verbatim and offers the approve option. Then `route(['stream', 'approve', 'review/c49.md'])`
  finishes it with `approved_by` `human`. Red today: it finishes as in case 6.
- **Case 50 — fail closed.** (a) `.ctoc/settings.yaml` is a directory; a functional plan with a
  classified empty question file and `seedBuilt(root, 'c50')`;
  `pendingGateDecisions(root, { crossed: [] })` crosses nothing, both plans stay, both descriptors
  carry `regimeHold: 'regime-unreadable'`, and the screen shows that sentence. (b)
  `profiles: ['do-178c-levl-a']` (no such profile): the built plan stays with
  `'regime-unreadable'`, while the functional plan crosses (the compliance trigger reads profile
  names only). Red today on (a) and on (b)'s built plan.
- **Case 51 — guards (green today, stay green): each regime holds only the crossing it governs,
  and no regime changes nothing.** `profiles: []` with `declined: true`: a functional plan with a
  classified empty file moves to `implementation/`, a built plan finishes on its checks. `gdpr`
  on: an implementation slice with a classified empty file moves to `todo/`, a built plan
  finishes on its checks. `do-178c-level-a` on: a functional plan with a classified empty file
  moves to `implementation/`. Every descriptor read before the crossing has `regimeHold: null`.
- **Case 52 — a sign-off control on: a built plan with passing checks does not finish on
  them.** For each of `four_eyes_gate3`, `spec_code_reconciliation` and
  `lessons_learned_closure`, alone through `overrides: { <control>: true }` with no profile, and
  once through the shipped `sox-itgc` profile (all three): `seedBuilt`, then
  `continueAfterCrossing(root)`; the plan stays in `review/`, the ledger file is byte-identical,
  the descriptor carries `regimeHold: 'review-sign-off'`, and the default screen contains the
  sign-off sentence verbatim. With `overrides: { four_eyes_gate3: false }` beside `pci-dss-v4`
  (whose only sign-off control it is), the plan finishes on its checks. Red today on every held
  project: they finish as in case 6.

Cases 1–47 run without a `.ctoc/settings.yaml` and stay green unchanged.

## Acceptance criteria

- [ ] With GDPR or the EU AI Act on, a functional plan with enough information does not cross into implementation on sufficiency, on any path (the default screen, an answer, an approve, the continuation); the owner's approve crosses it as before v6.14.119 — case 48.
- [ ] With independent verification and validation required, a built plan with passing checks does not finish on them; the owner's approve finishes it — case 49.
- [ ] With two distinct approvers, the specification-to-code reconciliation or the closing lesson required, a built plan with passing checks does not finish on them; an override that turns the control off restores the crossing — case 52.
- [ ] A regime CTOC cannot read holds the crossing it would govern — case 50.
- [ ] A project with no regime crosses exactly as today, and each regime holds only its own crossing — case 51 and cases 1–47.
- [ ] The screen says in one plain sentence why the plan waits, on the approve screen and on the question screen — cases 48–50 and 52.
- [ ] `src/commands/start.md` Rule 14 and `docs/ENFORCEMENT.md` say what the code now does, and `tests/compliance-claims-match-code.test.js` stays green — Steps 11 and 14.

## Risks

| Risk | Mitigation |
|---|---|
| This plan changes gate logic, which moves only on the owner's explicit approval (`CLAUDE.md`) | Step 9 confirms its approval record is the human's; if it crossed on evidence, stop and report. It carries no question file, so it reads `not-computed` and cannot cross on sufficiency |
| Slice 3 is still being built in the same four files | `depends_on`; Step 9 re-reads every named function and sentence and follows the text |
| The compliance-claims fence (`tests/compliance-claims-match-code.test.js`) counts a control as enforced from a literal `isControlEnabled(` call, and scans `docs/*.md` for control names | No literal call is added, so no control's enforced status changes; in `docs/ENFORCEMENT.md` the three sign-off controls are named only in a paragraph that carries the marker, and that paragraph does not name the enforced verification control |
| A held functional plan whose questions were checked is not named in the session-start status (`loop-b-driver` names only plans needing questions or waiting at the final sign-off); a held built plan is named there under "Waiting for your OK" | It is shown, with its sentence, on `/ctoc:start`; the status line is left unchanged here |
| A profile name in `.ctoc/settings.yaml` reaches `loadProfile`'s `path.join` (existing behaviour of `regulatory-regime.js`) | Only an existence check and a shallow parse; nothing read is displayed or written; Step 13 checks it |

## Decisions Taken Under Ambiguity

1. **One guard, in `pendingGateDecisions`.** It is the only live caller of both crossings
   (`crossBySufficiency`'s export is a test seam, `crossOnEvidence` is internal), and the
   descriptor needs the reason for the screen anyway.
2. **The functional hold reads the CTO Chief's own trigger** (`evaluateComplianceTrigger`), so the
   crossing waits exactly when the compliance review would be dispatched. The trigger fails open,
   so `loadActiveProfiles` is read first, which throws on an unreadable settings file.
3. **No compliance-review record is built here.** None exists (see the problem statement), so
   under the session's decision the crossing does not happen while GDPR or the EU AI Act is on.
4. **No reader of the verification chief's findings is built here.** None exists, so under the
   session's decision review → done on evidence does not happen while the control is on.
5. **A declared profile CTOC cannot load holds review, not functional.** At review it might
   require one of the four controls; at functional the compliance trigger reads profile names
   only, so a missing file changes nothing it reports.
6. **Each regime holds only the crossing it governs.** Implementation → todo is unchanged; a
   GDPR-only project still finishes on its checks (its profile requires none of the four review
   controls); a project requiring independent verification still moves its functional plans on
   (its shipped profiles name neither EU profile).
7. **A separate descriptor field, not a new sufficiency reason.** `continueAfterCrossing` queues
   classifications on `sufficiencyReason`, and the session status reads it; both keep their
   meaning.
8. **Four files instead of one to three.** Two are one sentence and two paragraphs that this fix
   would otherwise leave untrue.
9. **The three other regime controls that act at review → done join the hold (session decision,
   2026-10-07: the same regression, under the same fail-closed rule already decided).** Two
   distinct approvers (`four_eyes_gate3`), the specification-to-code reconciliation
   (`spec_code_reconciliation`) and the closing lesson (`lessons_learned_closure`) are checked by
   no code; before v6.14.119 the human's decision at that crossing was the only point where they
   could be honoured, exactly as for independent verification. They are read through
   `effectiveControls`, never a literal `isControlEnabled(` call, because their own checks still
   do not run — only the crossing on evidence waits, and the owner's approve still crosses with
   one approver — so their NOT ENFORCED labels stay true. Independent verification is read from
   the same set, so the regime is read once; its enforced status in the fence comes from
   `agents/coordinator/ivv-chief.md` and does not change.
10. **Recorded fact, not changed here:** after this fix the owner's approve on a GDPR or EU AI Act
    project moves the plan exactly as before v6.14.119, and the compliance review still runs only
    if the CTO Chief is dispatched at that crossing — no code triggers it on that path either.

## Execution Plan

### Step 8: TEST
- [ ] Add `setRegime` and cases 48–52 to `tests/plans-keep-moving-without-the-human.test.js`; run the file; record 48, 49, 50(a), 50(b)'s built plan and 52's held projects red for the named reason (the plan crossed or finished), 51 and 52's override-off project green, cases 1–47 green.

### Step 9: PREPARE
- [ ] Confirm slice 3 is built and `.ctoc/approvals/evidence-crossings-respect-the-regulated-profiles.json` is a human approval matching this plan's specification; if not, stop and report.
- [ ] Re-read `pendingGateDecisions`, `sufficiencyLine`, `richQuestionScreen`, Rule 14 of `start.md` and the "Review to done on recorded evidence" paragraph as slice 3 left them.
- [ ] Record the dead-export, unreachable-file and false-green counts.

### Step 10: IMPLEMENT
- [ ] `src/lib/streaming-gate.js`: `REVIEW_SIGN_OFF_CONTROLS`, `regimeHold`, `REGIME_LINES`, `regimeLine`, the two `!regime` conditions, the descriptor field, `sufficiencyLine` and `richQuestionScreen`; cases 48–52 green.
- [ ] `src/commands/start.md` Rule 14 and the two `docs/ENFORCEMENT.md` paragraphs, as specified.

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic`: no crossing on evidence remains on a held stage; projects with no regime behave byte for byte as before; the texts say what the code does and claim no enforcement of the three sign-off controls' own checks.

### Step 12: OPTIMIZE
- [ ] The regime is read once per stage that has plans, never per plan; the control set once per review read; no new export.

### Step 13: SECURE
- [ ] Dispatch `security-scanner`: every failure to read the regime holds the plan; the screen renders only the four fixed sentences; the profile-name path is used for an existence check and a shallow parse only.

### Step 14: VERIFY
- [ ] `npm test`: fail 0, skipped 0, coverage at or above `.ctoc/coverage-baseline.json` `minPct`.
- [ ] Lint `src/lib/streaming-gate.js` and the test file: zero warnings; `tsc --checkJs`: zero errors.
- [ ] Dead-export, unreachable-file and false-green counts not higher than at Step 9; `tests/compliance-claims-match-code.test.js` green with no marker moved.

### Step 15: DOCUMENT
- [ ] JSDoc on `regimeHold`, `regimeLine` and the changed `pendingGateDecisions`, `sufficiencyLine` and `richQuestionScreen`.

### Step 16: FINAL-REVIEW
- [ ] Dispatch `iron-loop-critic` against the acceptance criteria; each box quotes its evidence.
- [ ] The main session drives three scratch projects through the real routes and shows the owner, in full: a GDPR project's functional plan on `/ctoc:start` (stays, with its sentence), then his approve; a do-178c-level-a project's and a sox-itgc project's built plan after `menu task complete <id> --continue` (each stays, with its sentence).


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
