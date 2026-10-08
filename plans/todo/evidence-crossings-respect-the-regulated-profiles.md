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
  # Added 2026-10-07 by the session after the scratch-project run: profiles are read only from the project's own copy, which no real project has; the loader falls back to the profiles shipped with the plugin
  - src/lib/regulatory-regime.js
  - tests/lib-regulatory-regime.test.js
  # Added 2026-10-08 on the owner's answer "a": the one loaded hook protects the regulatory settings and profile files like the approval records
  - src/hooks/protect-records.js
  - tests/protect-records.test.js
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
      if (regime.unloadableProfiles(root).length > 0) return 'regime-unreadable'; // both crossings (session decision 2026-10-07)
      if (stage === 'functional') {
        const t = require('./iron-loop-compliance-trigger').evaluateComplianceTrigger(root);
        return t.runGdpr || t.runEuAiAct ? 'compliance-review' : null;
      }
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
5. **A declared profile CTOC cannot load holds both crossings (changed by the session on 2026-10-07 after the review: a misspelled or hand-quoted profile name must not let a plan skip the compliance review).** Original wording: A declared profile CTOC cannot load holds review, not functional. At review it might
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
11. **(Executor, Step 8) Case numbers moved by one.** On the tree this was built on (main
    4e15041c, v6.14.120, slice 3 included) the test file already ended at case 48 (a held plan
    is asked keep-or-release first). The plan's cases 48, 49, 50, 51 and 52 are the file's
    cases 49, 50, 51, 52 and 53; the specification is unchanged.
12. **(Executor, Step 8) "Green today" for the guard case was not literally true.** Its
    `regimeHold: null` assertions read `undefined` before the field existed, so the guard case
    (file case 52) and the override-off project (file case 53) were red on that assertion
    alone; the first crossing the guard case asserts (no regime: the functional plan moved)
    passed before it. The assertions were kept as specified, not loosened.
13. **(Executor, Step 8) "Every descriptor read before the crossing".** A pre-build plan that
    crosses yields no descriptor (`pendingGateDecisions` crosses it on the same call), so the
    guard case asserts `regimeHold: null` on every descriptor the call returns (the review
    plans) and takes the pre-build crossing itself as the evidence for the pre-build plans.
14. **(Executor, Step 10) The fail-closed screen check reads the first decision shown.** In
    file case 51(a) the review plan is listed before the functional one, so the
    unreadable-regime sentence is asserted on that screen.
15. **(Executor, Step 10) `NOT ENFORCED` kept on one line** in `docs/ENFORCEMENT.md`: the
    compliance-claims fence matches the marker per line, and a wrapped marker would not count.
16. **(Executor, Step 15) No CHANGELOG edit.** It is not in this plan's `files:`; the release
    step writes it.
17. **(Executor, second round) Listing profiles is the union.** `listAvailableProfiles` lists the
    project's own profiles together with the shipped ones, sorted, each once — exactly the set
    `loadProfile` can load. Its two existing tests asserted the replaced contract (an empty list
    without a project folder; only the project's names) and were tightened to the new one, not
    loosened; it has no live caller (it is in the dead-export baseline).
18. **(Executor, second round) The profile-name rule is `compliance-regime`'s own charset**
    (`^[a-z0-9][a-z0-9-]*$`), repeated in `regulatory-regime.js` because `compliance-regime`
    requires that module (importing it back would be circular).
19. **(Executor, second round) `docs/ENFORCEMENT.md` says "at both crossings".** The specified
    paragraph said a profile it cannot load holds "at review"; after the session's change to
    `regimeHold` that sentence was untrue, so it now names both crossings and every misread.
20. **(Executor, third round) What counts as a misread** (`regulatory-regime.misreadRegime`, a new
    export whose live caller is `regimeHold`): a `regulatory_regime` header the block reader
    cannot take; an `active_profiles` value that parses to no profile unless it is literally an
    empty list (`[]`, a trailing comment allowed — what project setup writes); a block with no
    `active_profiles` key unless it is declined or carries overrides; a name outside the profile
    charset; a loaded profile whose `required_controls` is not a parsed list. An `active_profiles:`
    key with nothing under it therefore holds (fail closed). Overrides that misparse are not
    checked here (not in the finding).
21. **(Executor, third round; superseded in the fifth) The `plan <ref>` screen.** It was first
    left as it was, because the session's item named only `gateScreenAt`. On the session's
    instruction (2026-10-08) `planDecisionScreen` now uses the same lines as the default screen
    for an author's unchecked questions: the regime's reason, and no "moves on by itself" for a
    plan the regime keeps waiting (case 57). Only that branch changed: a held plan opened
    with `plan <ref>` and no unchecked questions shows no regime sentence, as before.

## Execution Plan

### Step 8: TEST
- [x] Add `setRegime` and cases 48–52 to `tests/plans-keep-moving-without-the-human.test.js`; run the file; record 48, 49, 50(a), 50(b)'s built plan and 52's held projects red for the named reason (the plan crossed or finished), 51 and 52's override-off project green, cases 1–47 green.

### Step 9: PREPARE
- [x] Confirm slice 3 is built and `.ctoc/approvals/evidence-crossings-respect-the-regulated-profiles.json` is a human approval matching this plan's specification; if not, stop and report.
- [x] Re-read `pendingGateDecisions`, `sufficiencyLine`, `richQuestionScreen`, Rule 14 of `start.md` and the "Review to done on recorded evidence" paragraph as slice 3 left them.
- [x] Record the dead-export, unreachable-file and false-green counts.

### Step 10: IMPLEMENT
- [x] `src/lib/streaming-gate.js`: `REVIEW_SIGN_OFF_CONTROLS`, `regimeHold`, `REGIME_LINES`, `regimeLine`, the two `!regime` conditions, the descriptor field, `sufficiencyLine` and `richQuestionScreen`; cases 48–52 green.
- [x] `src/commands/start.md` Rule 14 and the two `docs/ENFORCEMENT.md` paragraphs, as specified.

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic`: no crossing on evidence remains on a held stage; projects with no regime behave byte for byte as before; the texts say what the code does and claim no enforcement of the three sign-off controls' own checks.

### Step 12: OPTIMIZE
- [x] The regime is read once per stage that has plans, never per plan; the control set once per review read; no new export.

### Step 13: SECURE
- [ ] Dispatch `security-scanner`: every failure to read the regime holds the plan; the screen renders only the four fixed sentences; the profile-name path is used for an existence check and a shallow parse only.

### Step 14: VERIFY
- [x] `npm test`: fail 0, skipped 0, coverage at or above `.ctoc/coverage-baseline.json` `minPct`.
- [x] Lint `src/lib/streaming-gate.js` and the test file: zero warnings; `tsc --checkJs`: zero errors.
- [x] Dead-export, unreachable-file and false-green counts not higher than at Step 9; `tests/compliance-claims-match-code.test.js` green with no marker moved.

### Step 15: DOCUMENT
- [x] JSDoc on `regimeHold`, `regimeLine` and the changed `pendingGateDecisions`, `sufficiencyLine` and `richQuestionScreen`.

### Step 16: FINAL-REVIEW
- [ ] Dispatch `iron-loop-critic` against the acceptance criteria; each box quotes its evidence.
- [ ] The main session drives three scratch projects through the real routes and shows the owner, in full: a GDPR project's functional plan on `/ctoc:start` (stays, with its sentence), then his approve; a do-178c-level-a project's and a sox-itgc project's built plan after `menu task complete <id> --continue` (each stays, with its sentence).


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

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

## Execution Record

Built in worktree `agent-a72785c0a9e7794d3` on main 4e15041c (v6.14.120, slice 3 included).
Specification hash before editing and after: `dcf362a98ad2637438592e1a584cba0df853c34fc85d6e3c64b3ba8cb379f256`,
equal to the approval record's `content_sha256` (`approved_by: human`).

**Step 8 — test first.** Plan case → file case: 48 → 49, 49 → 50, 50 → 51, 51 → 52, 52 → 53.
Red run (before any code), `node --test --test-name-pattern="case (49|5[0-3])"`: 11 tests, 0 pass, 11 fail:

| File case | Red reason (today) | Green after Step 10 |
|---|---|---|
| 49, gdpr | "the plan stays in functional" — it crossed as in case 1 | green |
| 49, eu-ai-act-high-risk | "the plan stays in functional" — it crossed | green |
| 50, do-178c-level-a | "the built plan stays in review" — it finished as in case 6 | green |
| 51(a), unreadable settings | "nothing crossed" — both crossed (done/c51b, implementation/c51) | green |
| 51(b), misspelled profile | "the built plan stays" — it finished | green |
| 52, guards | `regimeHold` read `undefined`, not `null` (field absent); first crossing passed | green |
| 53, four_eyes_gate3 alone | "the built plan stays in review" — it finished | green |
| 53, spec_code_reconciliation alone | "the built plan stays in review" — it finished | green |
| 53, lessons_learned_closure alone | "the built plan stays in review" — it finished | green |
| 53, sox-itgc profile | "the built plan stays in review" — it finished | green |
| 53, pci-dss-v4 with four_eyes_gate3 off | `regimeHold` read `undefined`, not `null` | green |

Cases 1–48 green before and after (file: 60 pass / 11 fail red; 71 pass / 0 fail green).
The red tests were committed before the implementation.

**Step 9 — prepare.** Approval record is human-kind and matches. Re-read on this tree:
`pendingGateDecisions` (sufficiency condition and the review condition), `sufficiencyLine`,
`richQuestionScreen`, `gateScreenAt`, Rule 14 of `start.md` (clause text as specified, found
once) and the "Review to done on recorded evidence" paragraph — all as the plan names them.
Counts before: unreachable files 17, dead exports 65, false-green findings 207 (all equal to
their baselines; ratchet tests pass).

**Step 10 — implement.** `src/lib/streaming-gate.js`: `REVIEW_SIGN_OFF_CONTROLS`, `regimeHold`
(as specified, no literal call of the control-enabled function), the regime read once per
non-empty stage, `&& !regime` on the sufficiency crossing and on the review crossing,
`regimeHold` on every descriptor, `REGIME_LINES`, `regimeLine`, `sufficiencyLine` appends it
on both branches, `richQuestionScreen` adds it after the separator. `src/commands/start.md`
Rule 14 clause replaced with the specified text. `docs/ENFORCEMENT.md`: the two paragraphs
after "Review to done on recorded evidence"; the sign-off paragraph carries the marker and does
not name the independent verification control.

**Step 12 — optimize.** The regime is read only for a stage with plans and only for the two
governed stages; `effectiveControls` once per review read; no new export. (Inside
`regimeHold` the settings file is parsed by `loadActiveProfiles`, then again inside
`unloadableProfiles` and `effectiveControls` — the specified shape; a few small reads once
per stage.)

**Step 14 — verify.** `npm test` (foreground): tests 12710, pass 12710, fail 0, cancelled 0,
skipped 0, todo 0; `[CTOC test-gate] coverage 99.87% (threshold 99%), skipped 0, failed 0`,
`PASS`. `streaming-gate.js` 99.39 % lines; its uncovered lines are all pre-existing, none in
the new code. `eslint --max-warnings 0` on `src/lib/streaming-gate.js` and the test file: clean.
`tests/typecheck.test.js`: pass. Counts after: unreachable files 17, dead exports 65,
false-green findings 207 — none higher. `tests/compliance-claims-match-code.test.js` green, no
marker moved.

**Step 15 — document.** JSDoc on `REVIEW_SIGN_OFF_CONTROLS`, `regimeHold`, `REGIME_LINES`,
`regimeLine`, and the changed `pendingGateDecisions` (header section and `@returns`),
`sufficiencyLine` and `richQuestionScreen`.

Steps 11, 13 and 16 are left to the session (critic, security scanner, final review and the
three scratch projects shown to the owner).

### Later rounds (2026-10-07 and 2026-10-08)

Specification hash checked equal to the approval record at the start of each round:
`6c71ba37…` (profiles shipped with the plugin), `c35c2776…` (the review's two items),
`ddb9ec70…` (the write protection). At the end: `ddb9ec709c425a76652076e441ce08ea1c258e599631b77f1d972f4ab4f15a65`.

**Round 2 — the scratch-project run found every active profile unreadable in a real project**
(profiles were read only from the project's own `.ctoc/regulatory-regimes/`, which no
project has). Red commit `9d731b8d`:

| Case | Red | Green |
|---|---|---|
| loader: loads a shipped profile with no project copy | null | green |
| loader: activates a shipped profile's controls | not loadable | green |
| loader: lists exactly the shipped profiles with no folder | `[]` | green |
| loader: lists the project's and the shipped profiles | project's only | green |
| loader: a climbing name (`../x`, `../regulatory-regimes/gdpr`, `a/b`, …) is refused | `../x` loaded `.ctoc/x.yaml` | green |
| loader: the project's own copy wins | green (guard) | green |
| loader: a name in neither folder stays unreadable | green (guard) | green |
| case 54, GDPR with no profile folder: a built plan finishes on its checks | held as unreadable | green |
| case 54, do-178c-level-a with no folder: the verification reason | "could not read" | green |
| case 54, sox-itgc with no folder: the sign-off reason | "could not read" | green |
| case 54, misspelled profile with no folder: held as unreadable | green (guard) | green |

**Round 3a — the review's two items.** Red commit `5d84bcce`:

| Case | Red | Green |
|---|---|---|
| case 51(b) `do-178c-levl-a`: both crossings hold | the functional plan crossed | green |
| case 51(b) `gpdr`: both crossings hold | the functional plan crossed | green |
| case 51(b) `"gdpr"`: both crossings hold | the functional plan crossed | green |
| case 55, GDPR, an author's questions being checked: the compliance sentence, never "moves on by itself" | no sentence; "it moves on by itself once they are" | green |

**Round 3b — the security check of `bf484a62`, finding 1.** Red commit `88e710ff`:

| Case 56 | Red | Green |
|---|---|---|
| settings: a flow list split over two lines | both crossed | green |
| settings: a scalar `active_profiles` | both crossed | green |
| settings: a header with a comment | both crossed | green |
| settings: a flow mapping | both crossed | green |
| settings: a misspelled key | both crossed | green |
| settings: a quoted name | already green: round 3a's uncommitted change held it (its red is case 51(b) `"gdpr"`) | green |
| profile: an empty file | finished | green |
| profile: `required_controls` as a flow list | finished | green |
| profile: `required_controls` as a scalar | finished | green |
| guards: a fresh project, a declined regime, no block at all | green | green |

Plus direct loader tests of `misreadRegime` (every return value, the throw on an unreadable
file), written with the implementation of that round.

**Round 4 — the write protection (owner's answer "a", 2026-10-08).** Red commit `d1b38ec0`,
`tests/protect-records.test.js`:

| Case | Red | Green |
|---|---|---|
| 91 · Edit, Write, MultiEdit, NotebookEdit of the settings file or a profile (case, `..`, `\`), main session and background agent | allowed | refused with the settings sentence |
| 92 · a symbolic link into the profile folder and to the settings file, by tool and by shell | allowed | refused |
| 93 · `echo x >>`, `sed -i` (both forms), `cp`, `rm`, `cd .ctoc && tee settings.yaml`, `printf >` | allowed | refused, main session and background agent |
| 94 · `cat`, `grep`, `ls`, `head`, `git diff` of them | green (guard) | allowed |
| 95 · the start.md recipes `claude:set-environment`, `claude:env-keep-defaults`, `claude:set-compliance-regime` (literal and with the plugin root filled in) and `start.js` itself | green (guard) | allowed |
| 96 · an approval-record write keeps its own sentence; `src/settings.yaml` and `.ctoc/settings.yaml.example` allowed | green (guard) | green |
| 13 (existing) · `.ctoc/approvals/../settings.yaml` | asserted allowed — the contract the owner replaced | now refused with the settings sentence; `.ctoc/approvals/../notes.md` still allowed |

**Step 14 (this round, foreground).** `npm test`: tests 12743, pass 12743, fail 0, cancelled 0,
skipped 0, todo 0; `[CTOC test-gate] coverage 99.85% (threshold 99%), skipped 0, failed 0`,
`PASS`. New code fully covered (`regulatory-regime.js` 100 % lines; the uncovered lines of
`streaming-gate.js` and `protect-records.js` are pre-existing). eslint `--max-warnings 0` on the
three source files and three test files: clean; `tests/typecheck.test.js`: pass; false-green
findings 207 (unchanged); the reachability and dead-export fences pass inside the suite
(`misreadRegime` is a new export whose live caller is `regimeHold`).

**End-to-end rerun** (`scratchpad/e2e-regimes/driver.js`, the branch's real `start.js`, no
profile file copied into any project): GDPR functional plan waits with the compliance
sentence and the owner's approve moves it (`approved_by: human`); a do-178c-level-a built plan
waits with the verification sentence and the owner's approve finishes it; a GDPR built plan
finishes on its checks (`advanced_by: pipeline`); a project with no regime moves its
functional plan on (`advanced_by: sufficiency`).

**Round 5 — the plan screen (2026-10-08).** Red commit `5908c014`: case 57, a GDPR project's
functional plan with an author's unchecked questions queued for the check, opened with
`plan functional/c57.md` — red (no compliance sentence; "it moves on by itself once they
are"), green after `planDecisionScreen` used `uncheckedLines` with `regimeHold`. Its guard
(no regime keeps the promise, no regime sentence) is green before and after. `npm test`:
tests 12744, pass 12744, fail 0, cancelled 0, skipped 0, todo 0; coverage 99.88 % (threshold
99 %), `PASS`. eslint clean. Specification hash `ddb9ec70…` unchanged.

**Round 6 — the security re-verification at `5908c014` (2026-10-08).** Red commit `4a052ba5`,
the scanner's own inputs (`s13/f1.js`, `s13/f1c.js` in the session scratchpad):

| Case | Red | Green |
|---|---|---|
| loader: a profile with Windows line endings keeps its controls; a trailing `\r` on the last item | do-178c-level-a lost `independent_verification_validation`; `[]` | green |
| loader: a byte-order mark before the settings header and before a profile | settings read as no regime; profile lost its controls | green |
| loader: a comment line inside the `active_profiles` block list | items after it dropped | green |
| loader: a comment line inside the `overrides` map | overrides after it dropped | green |
| loader: an override `True`, `yes`, `"true"`, `on`, `1`, `true # …`, or no value → `overrides` misread; `true` / `false` → none | silently dropped | green |
| loader: a second `regulatory_regime` block → `block` misread | the first block read silently | green |
| loader guard: every shipped profile loads a non-empty list of known controls | green | green |
| case 58: own do-178c-level-a copy with Windows line endings — waits for verification | finished | green |
| case 58: a comment between `- gdpr` and `- do-178c-level-a` — waits for verification | finished | green |
| case 58: `four_eyes_gate3: True` — both crossings wait as unreadable | both crossed | green |
| case 58: a second regime block — both crossings wait as unreadable | both crossed | green |
| case 58: a byte-order mark before the header — GDPR is read: the functional plan waits for the compliance review, a built plan finishes | both crossed | green |

Rerun of the scanner's harnesses on the fixed tree: every item of this round reads OK; the
lines still marked open by `f1.js` are GDPR projects whose `gdpr` is read correctly (functional
plan held for the compliance review, built plan finishes) — the plan's decision 6, not a
misread. `npm test`: tests 12756, pass 12756, fail 0, cancelled 0, skipped 0, todo 0; coverage
99.88 % (threshold 99 %), `PASS`; `regulatory-regime.js` 100 % lines. eslint clean.
Specification hash `ddb9ec70…` unchanged.

Decision (round 6): a comment line inside the `overrides` map is skipped like one inside the
`active_profiles` list (the same silent drop, one line away); a commented override value
(`true # sign-off`) is a misread rather than a value, because the reader does not parse it.
