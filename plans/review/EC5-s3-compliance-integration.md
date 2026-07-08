---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T19:25:50.869Z
gate_crossed: implementation → todo
---

---
title: "EC5-s3 — Compliance integration seam (runners → dedup → Inbox)"
type: implementation
parent_plan: EC5-iron-loop-integration
depends_on: EC5-s1-eu-ai-act-agent-runner, EC5-s2-compliance-dedup
files:
  - src/lib/compliance-integration.js
  - tests/compliance-integration.test.js
priority: MEDIUM
iron_loop: true
---

# EC5-s3 — Compliance integration seam (runners → dedup → Inbox)

## Context (why this slice exists)

This is the orchestration seam CTO Chief invokes at the functional→implementation
transition. It ties together the two agent runners and the dedup module into ONE
advisory, gate-respecting call:

1. Gate each regime independently via the runners (`runGdprFindings` from
   EC2's `gdpr-agent-runner.js`, `runEuAiActFindings` from EC5-s1). Each runner
   returns `{ ran, inbox, letter }`; each gates internally on its own
   `shouldRun*`, so a profile that is off contributes nothing.
2. When BOTH ran, the plan-stage findings the two agents would raise are first
   de-duplicated by EC5-s2's `deduplicateFindings` on `(kind,
   regulation_ref_normalized)` BEFORE Inbox attachment, so the same cross-regime
   gap is not raised twice.
3. Return a summary the caller (CTO Chief dispatch logic, EC5-s5) and the trigger
   emitter (EC5-s4) can act on and log.

The seam adds NO human gate and mutates NO enforcement / review-gate key. It does
not move a plan across any stage and does not call `human-gate-check.js`. It is
advisory: it only causes Inbox questions to be written (via the runners) and
returns a summary. `active_profiles: []` ⇒ both runners return `{ran:false}` ⇒
this seam is a provable no-op (no Inbox write, no plan mutation).

## Implementation Details

### Architecture Decision

**Dedup happens on the plan-stage findings, before they reach the Inbox — but the
runners own the actual Inbox write.** There is a design tension: the EC2/EC5-s1
runners already route plan-stage findings straight to `inbox.createQuestion`
internally. To dedup BEFORE Inbox attachment (parent Success Metric 6), the seam
must dedup the *raw findings* and then hand only the de-duplicated plan-stage set
to the runners for writing.

Resolution (the seam's contract): `runComplianceForTransition(projectRoot,
{ gdprFindings, euAiActFindings })` accepts the raw findings each agent derived.
It:
- Splits each regime's findings into plan-stage vs code-stage using the SAME
  routing predicate the runners use (a finding with a non-empty `target_file` is
  code-stage). Code-stage findings are passed through untouched to their runner
  (letters are per-regime; they are never cross-deduped).
- Runs `deduplicateFindings(gdprPlanStage, euAiActPlanStage)` to merge overlapping
  cross-regime plan-stage findings into one list.
- Dispatches the de-duplicated plan-stage list to the GDPR runner when GDPR is on
  and the EU-AI-Act runner when EU-AI-Act is on — but a merged finding must be
  written EXACTLY ONCE. To guarantee single-write, the seam attaches the merged
  plan-stage findings via ONE runner call using a small internal dispatch: each
  merged finding carries a `regime` tag (`'gdpr'` | `'eu-ai-act'`) set to whichever
  survivor's regime it belongs to (dedup preserves this from the survivor);
  GDPR-tagged and untagged-GDPR findings go to `runGdprFindings`, EU-AI-Act-tagged
  go to `runEuAiActFindings`. Because dedup already collapsed cross-regime
  duplicates to a single survivor, each merged finding is dispatched to exactly one
  runner ⇒ written once.

This keeps the runners as the sole Inbox writers (single responsibility), while
the seam owns cross-regime dedup and single-write orchestration. No new Inbox
writer is introduced.

**Gating is delegated, never re-implemented.** The seam does NOT call
`shouldRunGdpr` / `shouldRunEuAiAct` itself for the write decision — it relies on
each runner's internal gate. It MAY read them only to shape the returned summary
(`gdprRan` / `euAiActRan`), but the authoritative gate is the runner's. This
keeps one source of truth for "did this regime run".

### Dependency Graph

```
src/lib/compliance-integration.js
  --imports--> src/lib/gdpr-agent-runner.js        (runGdprFindings)      [exists, EC2]
  --imports--> src/lib/eu-ai-act-agent-runner.js   (runEuAiActFindings)   [EC5-s1]
  --imports--> src/lib/compliance-dedup.js         (deduplicateFindings)  [EC5-s2]
  --tested-by--> tests/compliance-integration.test.js
```

Depends on siblings EC5-s1 and EC5-s2. No cycle. Chain depth 2 (s1/s2 → s3).

### File Specifications

#### File: `src/lib/compliance-integration.js`
**Action:** CREATE
**Purpose:** The advisory functional→implementation compliance seam — runs both
regime runners, cross-dedups plan-stage findings, guarantees single-write, and
returns a summary. Adds/weakens/blocks no human gate.
**Change Type:** new-module

##### Exports
- `runComplianceForTransition(projectRoot: string, opts?: { gdprFindings?: object[], euAiActFindings?: object[] })`
  → returns `{ gdprRan: boolean, euAiActRan: boolean, inboxIds: string[], letters: object[], deduped: number }`
  - Description: orchestrates both runners with cross-regime plan-stage dedup and
    single-write. `inboxIds` = all created Inbox question ids; `letters` = all
    code-stage findings collected across both regimes; `deduped` = count of
    cross-regime duplicates collapsed (0 when only one regime ran).
  - Throws: never for the documented fail-open cases (non-string root ⇒ both
    runners return `{ran:false}` ⇒ empty summary; non-array findings ⇒ `[]`).

##### Internal helpers (module-private)
- `splitByRoute(findings)` → `{ planStage: object[], codeStage: object[] }` —
  code-stage = non-empty `target_file`; plan-stage = the rest.

##### Dependencies (imports)
- `const { runGdprFindings } = require('./gdpr-agent-runner');`
- `const { runEuAiActFindings } = require('./eu-ai-act-agent-runner');`
- `const { deduplicateFindings } = require('./compliance-dedup');`

##### Called By
- `agents/coordinator/cto-chief.md` dispatch logic (EC5-s5) — CTO Chief invokes
  this seam after Gate 1 approval.
- `src/lib/iron-loop-compliance-trigger.js` (EC5-s4) references the summary shape
  only for its trigger metadata; it does not itself dispatch (see s4).
- `tests/compliance-integration.test.js`.

##### Data Flow
```
runComplianceForTransition(projectRoot, { gdprFindings, euAiActFindings })
  --> g = splitByRoute(gdprFindings||[])
  --> a = splitByRoute(euAiActFindings||[])
  --> mergedPlanStage = deduplicateFindings(g.planStage, a.planStage)
  --> deduped = (g.planStage.length + a.planStage.length) - mergedPlanStage.length
  --> partition mergedPlanStage by survivor regime tag → gdprPlan[], aiActPlan[]
  --> gdprRes  = runGdprFindings(projectRoot, [...gdprPlan, ...g.codeStage])
  --> aiActRes = runEuAiActFindings(projectRoot, [...aiActPlan, ...a.codeStage])
  --> return {
        gdprRan: gdprRes.ran, euAiActRan: aiActRes.ran,
        inboxIds: [...gdprRes.inbox, ...aiActRes.inbox],
        letters:  [...gdprRes.letter, ...aiActRes.letter],
        deduped,
      }
```

##### Error Handling
- Non-string `projectRoot`: both runners return `{ran:false}` ⇒ empty summary,
  `deduped:0`, no throw.
- Missing/`undefined` `opts` or fields: coerced to `[]`.
- A merged finding lacking a `regime` tag defaults to GDPR dispatch (documented
  choice: GDPR-first precedence, consistent with dedup tie-break).

##### Cross-Platform Notes
- Builds no paths; `projectRoot` flows to the runners, which delegate to
  `inbox`/`compliance-regime`. `'use strict';`.

### Test Plan

#### Tests: `tests/compliance-integration.test.js`
**Action:** CREATE
**Framework:** `node:test`. Use REAL runners + REAL Inbox against a tmp project
dir with a real `.ctoc/settings.yaml` and both regime YAMLs, so gating is real
(no mocks of the runners or the Inbox).

##### Test Cases
1. **GDPR only.** `active_profiles:[gdpr]`, GDPR plan-stage finding, EU-AI-Act
   finding supplied but profile off ⇒ `gdprRan:true`, `euAiActRan:false`,
   `inboxIds.length === 1`, `deduped === 0`, and exactly one question file on disk.
2. **EU AI Act only.** `active_profiles:[eu-ai-act-high-risk]` ⇒ `euAiActRan:true`,
   `gdprRan:false`, one Inbox id, the EU-AI-Act finding attached.
3. **Both — cross-regime overlap deduped, written ONCE.** Both profiles active;
   provide a GDPR finding and an EU-AI-Act finding with the SAME `(kind,
   regulation_ref_normalized)` ⇒ `deduped === 1`, exactly ONE question file on
   disk (not two), survivor `severity:'critical'`, its context/message names both
   regulations.
4. **Both — non-overlapping findings both attach.** Distinct keys ⇒ `deduped:0`,
   two question files on disk.
5. **Code-stage findings never cross-deduped.** Two code-stage findings (both
   with `target_file`) across regimes with the same key ⇒ both appear in
   `letters[]` (not merged), no Inbox write for them.
6. **Empty active_profiles ⇒ provable no-op.** `active_profiles:[]` with findings
   supplied for both ⇒ `{gdprRan:false, euAiActRan:false, inboxIds:[], letters:[],
   deduped:0}` AND no question file written to disk AND no plan file in the tmp
   project is modified (assert the tmp plan file bytes are unchanged before/after).
7. **Advisory — no auto-revert / auto-advance.** Set up a tmp plan sitting in
   `plans/implementation/`; run the seam with a critical GDPR finding ⇒ assert the
   plan file is STILL in `plans/implementation/` afterward (not moved to
   `functional/` or `todo/`) and its frontmatter stage/approval marker is
   unchanged. Proves findings do not mutate a gate transition.
8. **Non-string root ⇒ empty summary, no throw.**
9. **GATE-INVARIANT (load-bearing).** Read `src/hooks/human-gate-check.js` source:
   assert `HUMAN_GATES` still has exactly 3 destination keys (`implementation`,
   `todo`, `done`) — the 4-gate topology unchanged. Assert this module's source
   names NO gate key (`HUMAN_GATES`, `requireReviewGate`, `enforcementMode`,
   `review_gate` ⇒ zero matches) and does NOT `require('../hooks/...')` or
   `require('./actions')` (it must not touch the gate-crossing path).

##### Coverage Targets
- Line ≥ 80%, branch ≥ 80% (one-regime, both-regime, dedup-merge, code-stage
  passthrough, no-op, non-string root).
- The no-op diff assertion (case 6) and the no-move assertion (case 7) are the
  load-bearing advisory proofs — both must be present.

### Security Review

- [x] Path traversal: builds no paths; delegates to gated runners.
- [x] Input validation: findings coerced to `[]`; non-string root fails open.
- [x] No secrets.
- [x] Safe file operations: writes only via the runners' `inbox.createQuestion`.
- [x] Error messages: no leaks; no throw on fail-open.
- [x] Prototype pollution: spreads only; no untrusted key assignment.
- [x] Command injection: none.

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write `tests/compliance-integration.test.js` covering cases 1–9 above
- [x] Include the no-op diff (case 6), the no-move advisory proof (case 7), and the GATE-INVARIANT (case 9)
- [x] Test error conditions (non-string root, missing opts)
- [x] Run tests — expect RED (module does not exist yet) — confirmed MODULE_NOT_FOUND

### Step 9: PREPARE
- [x] Confirm EC5-s1 (`eu-ai-act-agent-runner`) and EC5-s2 (`compliance-dedup`) are built (depends_on)
- [x] Confirm `gdpr-agent-runner.js` export `runGdprFindings`
- [x] Confirm the survivor `regime` tag is available from dedup (coordinate with s2 finding shape) — see Decision 2

### Step 10: IMPLEMENT
- [x] Create `src/lib/compliance-integration.js`
- [x] `splitByRoute` helper (code-stage = non-empty target_file)
- [x] Cross-regime plan-stage dedup + single-write partition by survivor regime
- [x] Aggregate summary `{ gdprRan, euAiActRan, inboxIds, letters, deduped }`
- [x] Export `{ runComplianceForTransition }`

### Step 11: REVIEW
- [x] Self-review: merged findings are written EXACTLY once (single-write invariant) — proven by test 3 (2 in, 1 file on disk)
- [x] Verify the seam never moves a plan / never calls a gate-crossing function
- [x] Verify no gate key referenced

### Step 12: OPTIMIZE
- [x] Single split + single dedup pass; no duplicate scans
- [x] Avoid re-running a runner when its regime is off (runner short-circuits anyway)

### Step 13: SECURE
- [x] Validate inputs; non-string root fail-open
- [x] No secrets; Inbox-only writes via runners

### Step 14: VERIFY
- [x] Run lint + type check — `npx eslint . --max-warnings 0` exit 0; tsc baseline-neutral (0 new errors)
- [x] Run ALL tests: `node --test tests/compliance-integration.test.js` — 12/12 pass
- [x] Coverage ≥ 80%; 0 skipped, 0 flaky — 100% line/branch/func on the new module
- [x] Confirm no-op, no-move, and gate-invariant tests pass
- [x] Full suite `node --test tests/*.test.js` — 3366 pass, 0 fail, 0 skipped

### Step 15: DOCUMENT
- [x] JSDoc on `runComplianceForTransition` and the single-write / dedup contract
- [x] Module header documenting advisory / gate-untouched guarantees
- [x] README + readme-numbers count bumped 122 → 123

### Step 16: FINAL-REVIEW
- [x] Verify Steps 8–15 completed
- [x] Single-write + dedup + advisory-no-move + gate-invariant all green
- [x] Ready for human review

## Decisions Taken Under Ambiguity

1. **Double-write avoidance (the load-bearing composition choice).** The EC2/EC5-s1
   runners write-and-return: each plan-stage finding they receive is written to the
   Inbox exactly once by the runner itself. The plan requires cross-regime dedup
   BEFORE Inbox attachment (parent Success Metric 6) but the runners own the write.
   Resolution: the seam dedups the RAW plan-stage findings first via
   `deduplicateFindings`, then partitions each merged survivor to EXACTLY ONE runner
   by the survivor's regime shape. Because dedup already collapsed cross-regime
   duplicates to a single survivor, and each survivor is dispatched to a single
   runner, every merged finding is written once and only once. The runners remain
   the sole Inbox writers (single responsibility); no new Inbox writer is introduced.
   Proven by test 3: two overlapping findings in ⇒ `deduped:1`, exactly ONE Inbox id
   and ONE question file on disk (not two — not the sum).

2. **Survivor regime derived from finding SHAPE, not a stored `regime` tag.** The
   plan's Step 9 anticipated a `regime` tag on the dedup survivor, but EC5-s2's
   `deduplicateFindings` does not add one — the survivor is a shallow copy of the
   higher-confidence winner (EC2/GDPR-first on a tie). So `regimeOf(finding)` derives
   the dispatch regime from the survivor's shape: `regulation === 'eu-ai-act'` ⇒
   EU-AI-Act runner; everything else (incl. a GDPR finding carrying `gdpr_article`,
   or a tagless survivor) ⇒ GDPR runner. This is the documented GDPR-first default
   and is CORRECT for single-write: the EU-AI-Act runner fail-strictly DROPS any
   finding whose `regulation !== 'eu-ai-act'`, so a GDPR-shaped survivor MUST go to
   the GDPR runner to be written at all. On a tie, dedup keeps the GDPR (first-seen)
   survivor, whose shape routes it back to the GDPR runner — self-consistent.

3. **`gdpr_article` in test fixtures uses VALID_GDPR_ARTICLES codes** (e.g.
   `GDPR-17` for retention, `GDPR-6` for lawful basis), because the GDPR runner's
   `validateFindingSchema` throws on an unknown code before any emission. The
   `regulation_ref` (the dedup topic key, e.g. `gdpr art. 5(1)(e)`) is independent
   of `gdpr_article` and is what drives the cross-regime merge with EU-AI-Act's
   `eu-ai-act art. 10` (both map to topic `data-governance` via the s2 table).
