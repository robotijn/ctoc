---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T19:25:50.795Z
gate_crossed: implementation → todo
---

---
title: "EC5-s1 — EU AI Act agent runner (gate-then-route seam)"
type: implementation
parent_plan: EC5-iron-loop-integration
depends_on: none
files:
  - src/lib/eu-ai-act-agent-runner.js
  - tests/eu-ai-act-agent-runner.test.js
priority: MEDIUM
iron_loop: true
---

# EC5-s1 — EU AI Act agent runner (gate-then-route seam)

## Context (why this slice exists)

EC2 shipped `src/lib/gdpr-agent-runner.js` — the LIVE, unit-testable executable
that enforces the GDPR agent's contract: gate FIRST on `shouldRunGdpr`, then
per-finding validate → normalize-severity → route to Inbox (plan-stage) or
collect for the letter path (code-stage). EC3 shipped only the pure rule core
`src/lib/eu-ai-act-helpers.js` (`filterToEuAiAct`, `normalizeSeverity`,
`routeFinding`) — it did **not** ship a matching runner. EC5's orchestration
(s3) must run BOTH agents through an identical gate-then-route seam. This slice
builds the missing EU-AI-Act half at exact parity with the GDPR runner so s3 can
call `runEuAiActFindings(projectRoot, findings)` the same way it calls
`runGdprFindings(projectRoot, findings)`.

This is a lib→lib module. It imports the gate (`shouldRunEuAiAct` from
`compliance-regime.js`), the pure rule core (`eu-ai-act-helpers.js`), and the
real Inbox writer (`inbox.js`) — nothing from hooks or commands. It adds NO
human gate and mutates NO enforcement / review-gate key. It writes only Inbox
questions (advisory).

## Implementation Details

### Architecture Decision

**Mirror `gdpr-agent-runner.js` exactly, adapted to the EU-AI-Act rule core.**
The GDPR runner validates each finding with `validateFindingSchema` (which throws
on an unknown `gdpr_article`). The EU-AI-Act rule core has **no** equivalent
throwing validator — its authority mechanism is `filterToEuAiAct(findings)`,
which fail-strictly DROPS any finding whose `regulation !== 'eu-ai-act'`. So the
EU-AI-Act runner's gate-then-route sequence is:

1. GATE FIRST on `shouldRunEuAiAct(projectRoot)`. Gate off ⇒ do nothing (no
   Inbox write, no reads) ⇒ return `{ ran: false, inbox: [], letter: [] }`.
2. `filterToEuAiAct(list)` — drop non-`eu-ai-act` findings (fail-strict scope
   isolation). This replaces the GDPR runner's per-finding throw: a foreign or
   fieldless finding is silently dropped, never emitted.
3. For each surviving finding: `normalizeSeverity` (force `severity:'critical'`)
   → `routeFinding`. `route:'inbox'` ⇒ real `inbox.createQuestion`;
   `route:'letter'` ⇒ collect into `letter[]` for the refinement-loop letter
   path (this runner does not author the letter).

This keeps the two runners structurally identical (s3 treats them uniformly)
while respecting each rule core's own authority contract. No new abstraction is
introduced.

### Dependency Graph

```
src/lib/eu-ai-act-agent-runner.js
  --imports--> src/lib/compliance-regime.js   (shouldRunEuAiAct)          [exists]
  --imports--> src/lib/eu-ai-act-helpers.js   (filterToEuAiAct,
                                                normalizeSeverity,
                                                routeFinding)              [exists]
  --imports--> src/lib/inbox.js               (createQuestion)            [exists]
  --tested-by--> tests/eu-ai-act-agent-runner.test.js
```

No sibling-slice dependency. No cycle. Depth 1.

### File Specifications

#### File: `src/lib/eu-ai-act-agent-runner.js`
**Action:** CREATE
**Purpose:** LIVE gate-then-route executable for the EU AI Act agent — parity
with `gdpr-agent-runner.js`, adapted to the EU-AI-Act rule core.
**Change Type:** new-module

##### Exports
- `runEuAiActFindings(projectRoot: string, findings?: object[])` → returns
  `{ ran: boolean, inbox: string[], letter: object[] }`
  - Description: gates on `shouldRunEuAiAct(projectRoot)`; when on, runs each
    finding through `filterToEuAiAct` → `normalizeSeverity` → `routeFinding`,
    writing plan-stage findings to the real Inbox and collecting code-stage
    findings into `letter[]`.
  - `ran`: `false` when the gate is off (no side effects at all); `true` otherwise.
  - `inbox`: ids of the Inbox questions created for plan-stage findings.
  - `letter`: the severity:critical code-stage findings handed back for the
    refinement-loop letter path.
  - Throws: never throws for the documented fail-open cases (non-string root ⇒
    gate false ⇒ `{ ran:false }`; non-array `findings` ⇒ treated as `[]`).

##### Internal helper (module-private, not exported)
- `buildContext(finding)` → `string` — mirrors the GDPR runner's context blob but
  names the EU-AI-Act facts: `risk_class`, `severity`, and (when present)
  `annex_iii_category`, `confidence`, `kind`, `regulation_ref`. Joined by `\n`.

##### Dependencies (imports)
- `const { shouldRunEuAiAct } = require('./compliance-regime');`
- `const { filterToEuAiAct, normalizeSeverity, routeFinding } = require('./eu-ai-act-helpers');`
- `const inbox = require('./inbox');`

##### Called By
- `src/lib/compliance-integration.js` (EC5-s3) — the orchestration seam.
- `tests/eu-ai-act-agent-runner.test.js` — direct unit tests.

##### Data Flow
```
runEuAiActFindings(projectRoot, findings)
  --> shouldRunEuAiAct(projectRoot)  → false ⇒ return { ran:false, inbox:[], letter:[] }
  --> list = Array.isArray(findings) ? findings : []
  --> kept = filterToEuAiAct(list)            // drop non-'eu-ai-act'
  --> for each kept finding:
        nf = normalizeSeverity(finding)        // severity:'critical'
        { route } = routeFinding(nf)
        route==='inbox'  → inbox.createQuestion({ source_plan, source_step:'compliance-eu-ai-act',
                                                  question: nf.message||'', context: buildContext(nf) }, projectRoot)
                         → push id to inbox[]
        route==='letter' → push nf to letter[]
  --> return { ran:true, inbox, letter }
```

##### Error Handling
- Non-string / wrong `projectRoot`: `shouldRunEuAiAct` returns `false` (its
  documented fail-open) ⇒ `{ ran:false }`, no throw.
- Non-array `findings`: coerced to `[]` (ran stays `true`, empty results).
- `filterToEuAiAct` never throws (non-array ⇒ `[]`). `normalizeSeverity` /
  `routeFinding` never throw (they tolerate non-object; but filtered findings are
  always objects with `regulation:'eu-ai-act'`).

##### Cross-Platform Notes
- Builds NO paths itself — `projectRoot` is passed straight to `shouldRunEuAiAct`
  and `inbox.createQuestion`, both of which `path.join` internally.
- `'use strict';` at top, matching the GDPR runner.

### Test Plan

#### Tests: `tests/eu-ai-act-agent-runner.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`assert`). Use the REAL gate and REAL
Inbox against a tmp project dir (mirror `tests/gdpr-agent-runner.test.js`): write
a real `.ctoc/settings.yaml` with `regulatory_regime.active_profiles` and a real
`.ctoc/regulatory-regimes/eu-ai-act-high-risk.yaml` so `shouldRunEuAiAct` resolves
the profile with no mocks.

##### Test Cases
1. **Gate OFF is a no-op.** `active_profiles: []` ⇒ `runEuAiActFindings(root, [finding])`
   returns `{ ran:false, inbox:[], letter:[] }` AND no question file is written to
   `.ctoc/inbox/questions/` on disk.
2. **Gate ON routes a plan-stage finding to the REAL Inbox.** With
   `eu-ai-act-high-risk` active and a finding `{ regulation:'eu-ai-act',
   risk_class:'high-risk', message:'...', kind:'missing-risk-management' }` (no
   `target_file`) ⇒ `ran:true`, `inbox.length === 1`, and exactly one `.md`
   question file exists on disk whose body contains the finding message and
   `risk_class: high-risk`.
3. **Gate ON routes a code-stage finding to letter, not Inbox.** A finding with a
   non-empty `target_file` ⇒ appears in `letter[]`, `inbox` stays empty, no
   question file on disk.
4. **Severity forced to critical.** An input finding with `severity:'low'` that
   routes to letter ⇒ the returned `letter[0].severity === 'critical'`.
5. **Fail-strict scope isolation.** A batch `[{regulation:'nist-ai-rmf',...},
   {regulation:'eu-ai-act', ...}]` with the gate ON ⇒ only the `eu-ai-act`
   finding is processed (one Inbox id / letter entry); the foreign finding is
   dropped and never emitted.
6. **Non-array findings ⇒ `{ ran:true }` empty results** (gate on).
7. **Missing findings argument ⇒ `{ ran:true }` empty results** (gate on).
8. **Non-string root ⇒ gate resolves false ⇒ `{ ran:false }`, no throw.**
9. **GATE-INVARIANT (load-bearing).** Read `src/hooks/human-gate-check.js` source:
   assert its `HUMAN_GATES` object literal still has exactly 3 destination keys
   (`implementation`, `todo`, `done`) — i.e. the 4-gate topology (Gate 0–3) is
   unchanged — AND that this runner's source names NO gate key (`grep` the runner
   source for `HUMAN_GATES`, `requireReviewGate`, `enforcementMode`, `review_gate`
   ⇒ zero matches). This proves the advisory runner adds/weakens/blocks no human
   gate.

##### Coverage Targets
- Line ≥ 80%, branch ≥ 80% (both routes, gate on/off, filter-drop, coerce paths).
- Error/edge paths (non-array, missing arg, non-string root) all exercised.

### Security Review

- [x] Path traversal: builds no paths; delegates to `inbox` / `compliance-regime`
      which validate/`path.join` internally.
- [x] Input validation: `findings` coerced to `[]` when non-array; `filterToEuAiAct`
      drops non-object / foreign findings.
- [x] No secrets in code.
- [x] Safe file operations: only `inbox.createQuestion` writes (to `.ctoc/inbox/`).
- [x] Error messages: no sensitive paths leaked; runner does not throw on fail-open.
- [x] Prototype pollution: uses `normalizeSeverity`'s shallow spread copy; no
      untrusted key assignment.
- [x] Command injection: no `exec`/`execSync`.

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write `tests/eu-ai-act-agent-runner.test.js` covering cases 1–9 above
- [x] Include the GATE-INVARIANT test (case 9) asserting HUMAN_GATES has 3 keys and the runner names no gate key
- [x] Test error conditions (non-array, missing arg, non-string root)
- [x] Run tests — expect RED (module does not exist yet) → CONFIRMED MODULE_NOT_FOUND

### Step 9: PREPARE
- [x] Confirm `compliance-regime.js`, `eu-ai-act-helpers.js`, `inbox.js` exports match the imports (shouldRunEuAiAct; filterToEuAiAct/normalizeSeverity/routeFinding; createQuestion — all present)
- [x] Confirm the tmp-project fixture writes a real `.ctoc/settings.yaml` + copies shipped regulatory-regimes/ (incl. eu-ai-act-high-risk.yaml)
- [x] No new dependencies required

### Step 10: IMPLEMENT
- [x] Create `src/lib/eu-ai-act-agent-runner.js` mirroring `gdpr-agent-runner.js`
- [x] Add `buildContext(finding)` naming EU-AI-Act facts (risk_class, severity, annex_iii_category, confidence, kind, regulation_ref)
- [x] Wire gate-first → filterToEuAiAct → normalizeSeverity → routeFinding → inbox/letter
- [x] Export `{ runEuAiActFindings }`

### Step 11: REVIEW
- [x] Self-review: structural parity with the GDPR runner (same return shape, same seam)
- [x] Verify the gate is checked BEFORE any read/write
- [x] Verify no gate key is referenced anywhere in the module (asserted by test 9b)

### Step 12: OPTIMIZE
- [x] Single pass over kept findings; no redundant per-finding work
- [x] buildContext builds a small array, pushes only present optional facts

### Step 13: SECURE
- [x] Validate inputs (findings coercion to []; non-string root fail-open via gate)
- [x] No secrets; only Inbox writes; no path construction in this module

### Step 14: VERIFY
- [x] Lint: `npx eslint . --max-warnings 0` → exit 0; tsc baseline-neutral (89 errors before/after, 0 from this module)
- [x] Run ALL tests (TDD Green): `node --test tests/eu-ai-act-agent-runner.test.js` → 12 pass / 0 fail; full suite 3321 pass / 0 fail / 0 skipped
- [x] Coverage: line 100%, branch 88.89%, funcs 100% (≥80%); 0 skipped, 0 flaky
- [x] Gate-invariant test passes (9a HUMAN_GATES 3 keys; 9b runner names no gate key)

### Step 15: DOCUMENT
- [x] JSDoc on `runEuAiActFindings` and `buildContext`
- [x] Module header documenting the gate-first / fail-strict-filter contract
- [x] README + readme-numbers count bumped 119 → 120 (new src/lib module)

### Step 16: FINAL-REVIEW
- [x] Steps 8–15 completed
- [x] Gate-invariant + no-op + routing tests all green
- [x] Ready for human review

## Decisions Taken Under Ambiguity

1. **`buildContext` optional-fact set.** The plan named `risk_class`, `severity`,
   and "(when present) `annex_iii_category`, `confidence`, `kind`,
   `regulation_ref`". Implemented exactly that: `risk_class` + `severity` always,
   the other four pushed only when truthy. Mirrors the GDPR runner's blob shape.
2. **README module-list entry placement.** Added `eu-ai-act-agent-runner`
   immediately after `eu-ai-act-helpers` in the src/lib enumeration (keeping the
   EU-AI-Act modules adjacent, mirroring gdpr-helpers → gdpr-agent-runner) and
   bumped the count 119 → 120 in both README and readme-numbers.test.js.
3. **Extra fail-strict test (5b).** Added a sub-case proving a MISSING `regulation`
   field is dropped (the rule core's fail-strict edge beyond a foreign regulation
   value). Not required by the plan's case list but tightens the drop-branch proof.
