---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T16:39:46.303Z
gate_crossed: implementation → todo
---

---
title: "EC2-s4 — wire gdpr-agent: gate on shouldRunGdpr, route findings (Inbox / letter), registry entry"
type: implementation
parent_plan: EC2-gdpr-agent-plan-and-code
depends_on: EC2-s1-gdpr-helpers, EC2-s3-gdpr-agent-definition
iron_loop: true
priority: HIGH
files:
  - src/lib/gdpr-agent-runner.js
  - tests/gdpr-agent-runner.test.js
  - .ctoc/operations-registry.yaml
status: refined
risk_level: HIGH
---

# EC2-s4 — LIVE wiring: gate + finding routing + registry entry

Slice 4 (final) of the EC2 decomposition. This is the **human-facing surface**: it wires the
GDPR agent's emission LIVE end-to-end and its test drives the REAL flow (real
`shouldRunGdpr` gate against a real tmp `.ctoc/settings.yaml`, real Inbox write via the real
`src/lib/inbox.js` export, real routing via s1's `routeFinding`). No mock stands in for the gate
or the Inbox (PI4: human-facing surface wires LIVE, its test drives the real flow).

The runner module `src/lib/gdpr-agent-runner.js` is the executable seam the agent (s3) describes
in prose: given a project root and a list of raw findings, it (1) gates on
`shouldRunGdpr(projectRoot)` — no gate ⇒ no output, no writes; (2) validates + normalizes each
finding via s1 helpers; (3) routes plan-stage findings to the Inbox and returns code-stage
findings for the refinement-loop letter path. It also adds the `gdpr-agent`
operations-registry entry so CTO Chief can discover and dispatch the agent.

Depends on **EC2-s1** (`validateFindingSchema`/`normalizeSeverity`/`routeFinding`) and
**EC2-s3** (the agent definition whose contract this implements). It consumes **EC1-s2**'s
`shouldRunGdpr` transitively via s1's sequencing dependency.

## Implementation Details

### Architecture Decision (ADR)

**Context:** The agent (s3) is prose; something must EXECUTE the gate-then-route contract in a
unit-testable way, and plan-stage findings must reach the human. The parent decided plan-stage
findings surface via the Inbox (the refinement-loop letter REQUIRES `file` + `line_range`, which
a plan-stage finding lacks — verified against `.ctoc/architecture/refinement-loop-schema.json`,
whose `issue` schema lists `file` in `required`). The real Inbox surface
(`src/lib/inbox.js`) is READ-ONLY at its face except for the two documented writers:
`createQuestion({source_plan, source_step, question, context}, root)` and `createDecision(...)`.

**Decision:** A new `src/lib/gdpr-agent-runner.js` that:
1. `runGdprFindings(projectRoot, findings)` — if `shouldRunGdpr(projectRoot)` is `false`, return
   `{ ran: false, inbox: [], letter: [] }` WITHOUT touching the Inbox or reading any plan
   (parent Scenario "Profile absent"). Otherwise, for each finding: `validateFindingSchema` →
   `normalizeSeverity` → `routeFinding`. Plan-stage (`route:'inbox'`) findings are written to the
   Inbox via `inbox.createQuestion` (a GDPR obligation the human must act on at morning review —
   the real, existing plan-stage attachment surface). Code-stage (`route:'letter'`) findings are
   COLLECTED and returned in `letter[]` for the refinement-loop path (this runner does not itself
   author the letter — the loop owns that; the runner hands back schema-valid, critical-severity
   findings that carry `target_file`/`target_line`).
   Returns `{ ran: true, inbox: [<created ids>], letter: [<code-stage findings>] }`.
2. Registry: add a `gdpr-agent` entry under `agents:` in `.ctoc/operations-registry.yaml`,
   `category: compliance`, `path: agents/compliance/gdpr-agent.md`, `model: opus`, `tier: 2`.

The runner imports ONLY `gdpr-helpers`, `compliance-regime`, and `inbox` (all `src/lib/*`) —
dependency flows inward (lib→lib), never hooks/commands.

**Consequences:** The gate + routing are LIVE and unit-tested against real modules; the human
sees plan-stage GDPR obligations as real Inbox questions; code-stage findings flow to the
existing letter path unchanged. No human gate is added (advisory only).

### Dependency Graph

```
src/lib/compliance-regime.js (EC1-s2)  shouldRunGdpr(root) ──┐
src/lib/gdpr-helpers.js (EC2-s1)  validate/normalize/route ──┤
src/lib/inbox.js (EXISTING)  createQuestion(opts, root) ─────┤
                                                             ▼
src/lib/gdpr-agent-runner.js (CREATE)  runGdprFindings(root, findings[])
                                                             │ tested-by
                                                             ▼
tests/gdpr-agent-runner.test.js (CREATE)   — real tmp project, real Inbox, real gate
.ctoc/operations-registry.yaml (MODIFY)    — add gdpr-agent entry (asserted by the same test)
```

No cycle: runner → {compliance-regime → regulatory-regime → safe-fs}, {gdpr-helpers [pure]},
{inbox → safe-fs}. None import back. Chain depth 3 (runner → compliance-regime →
regulatory-regime → safe-fs) — at the max allowed depth; no deeper.

### File Specifications

#### File: `src/lib/gdpr-agent-runner.js`
**Action:** CREATE
**Purpose:** Execute the GDPR agent's gate-then-route contract: gate on `shouldRunGdpr`, validate
+ normalize each finding, write plan-stage findings to the Inbox, return code-stage findings for
the letter path.
**Change Type:** new-module

**Imports:**
- `const { shouldRunGdpr } = require('./compliance-regime');`
- `const { validateFindingSchema, normalizeSeverity, routeFinding } = require('./gdpr-helpers');`
- `const inbox = require('./inbox');`  (namespace import — use `inbox.createQuestion`)

**Exports:**
- `runGdprFindings(projectRoot, findings)` → `{ ran: boolean, inbox: string[], letter: object[] }`
  - Description:
    1. **Gate:** if `shouldRunGdpr(projectRoot) === false` → return
       `{ ran: false, inbox: [], letter: [] }` immediately — NO Inbox write, NO further work
       (parent Scenario "Profile absent — agent produces no output").
    2. Coerce `findings` to `[]` if not an array.
    3. For each finding, in order: `validateFindingSchema(f)` (throws on unknown
       `gdpr_article` — the runner lets it throw so a bad code is caught loudly, never emitted);
       then `const nf = normalizeSeverity(f)` (severity := critical); then
       `const { route } = routeFinding(nf)`.
    4. If `route === 'inbox'`: write via
       `inbox.createQuestion({ source_plan: nf.plan || nf.source_plan || '', source_step: 'compliance-gdpr', question: nf.message, context: <article + confidence + kind> }, projectRoot)`;
       push the returned `{ id }` into `inbox[]`.
    5. If `route === 'letter'`: push `nf` (schema-valid, severity:critical, carries
       `target_file`/`target_line`) into `letter[]` for the refinement-loop path.
    6. Return `{ ran: true, inbox, letter }`.
  - Throws: propagates `validateFindingSchema`'s throw on an unknown `gdpr_article` (a code the
    schema rejects must NOT be silently emitted — parent Scenario "validator rejects unknown
    gdpr_article"). Non-string root ⇒ `shouldRunGdpr` returns false ⇒ `{ ran:false }` (fail-safe).

**Called By:** the GDPR agent dispatch path (CTO Chief), once per compliance-review run, with the
findings the agent derived (plan-stage) or the skill produced (code-stage).

#### File: `.ctoc/operations-registry.yaml`
**Action:** MODIFY
**Change:** Add, under the `agents:` map (a new `compliance` grouping is fine; follow the file's
existing comment-banner + entry style), a `gdpr-agent` entry:
```yaml
  gdpr-agent:
    path: agents/compliance/gdpr-agent.md
    model: opus
    category: compliance
    tier: 2
    description: Plan-ancestry + code-scan GDPR agent; gated on the gdpr regulatory profile.
    parallel_safe: true
```
Touch NOTHING else in the registry (especially not the `enforcement`/`operations`/token-budget
blocks). Additive entry only.

#### Data Flow
```
runGdprFindings(root, [planFinding, codeFinding])
  → shouldRunGdpr(root) ? continue : return {ran:false,...}
  → planFinding:  validate → normalize(severity=critical) → route='inbox'
                  → inbox.createQuestion(...) → id
  → codeFinding:  validate → normalize → route='letter' → letter.push(codeFinding)
  → { ran:true, inbox:[id], letter:[codeFinding] }
```

#### Error Handling
- Gate false ⇒ `{ ran:false, inbox:[], letter:[] }`, no side effects.
- Unknown `gdpr_article` ⇒ `validateFindingSchema` throws (loud) BEFORE any Inbox write for that
  finding — the bad finding is never emitted.
- Non-array `findings` ⇒ treated as `[]` (ran:true, empty results) when the gate is on.
- Inbox write failure: `inbox.createQuestion` uses `safeFs` writes; if it throws, the runner lets
  it propagate (a failed human-surface write must be visible, not swallowed).

#### Cross-Platform Notes
- No path building in the runner — `projectRoot` is passed straight to `shouldRunGdpr` /
  `inbox.createQuestion`, both of which use `path.join` internally. Cross-platform by delegation.

### Test Plan

#### Tests: `tests/gdpr-agent-runner.test.js`
**Action:** CREATE
**Framework:** `node:test`. Uses the tmp-project pattern (`mkdtempSync`, write a real
`.ctoc/settings.yaml` with a `regulatory_regime.active_profiles:` line, copy
`regulatory-regimes/gdpr.yaml`; cleanup in `after()`) — the SAME pattern EC1-s2 used, so the
gate is exercised through the REAL `shouldRunGdpr`, not a stub. The Inbox is the REAL
`src/lib/inbox.js`; assertions read back the real question file(s) under
`.ctoc/inbox/questions/`.

**Test Cases (drive the REAL flow — map parent Scenarios directly):**
1. **Gate OFF ⇒ no output, no writes (parent Scenario "Profile absent"):** tmp project with
   `active_profiles: []`; call `runGdprFindings(root, [<a plan finding>])` → `{ ran:false }`,
   `inbox` empty, `letter` empty; assert `.ctoc/inbox/questions/` has NO new file (real
   filesystem check — proves no side effect).
2. **Gate ON + plan-stage finding ⇒ real Inbox question (parent Scenario "Plan mentions
   email"):** tmp project with `active_profiles: [gdpr]`; finding
   `{ gdpr_article:'GDPR-13', message:'email collected — Art.13 notice required',
   confidence:'medium' }` (no `target_file`) → `ran:true`, `inbox` has one id; read the created
   question file back and assert its body/frontmatter contains the message and
   `source_step: compliance-gdpr` and `GDPR-13` in context.
3. **Gate ON + all emitted findings normalized to severity:critical (parent Scenario "severity
   normalizer"):** pass a plan finding with `severity:'medium'`; after `runGdprFindings`, read the
   letter[]/inbox side and assert severity was upgraded to `critical` (for a code-stage finding,
   assert `letter[0].severity === 'critical'`).
4. **Gate ON + code-stage finding ⇒ letter route (parent Scenario "Code scan detects soft-delete"
   + "route via refinement-loop letter"):** finding `{ gdpr_article:'GDPR-17',
   kind:'soft-delete-no-purge-schedule', target_file:'src/x.ts', target_line:10 }` →
   `letter[0]` present with `route`-equivalent placement, `severity:'critical'`; and NO Inbox
   question created for it.
5. **Gate ON + unknown gdpr_article ⇒ throws, nothing emitted (parent Scenario "validator rejects
   unknown"):** finding `{ gdpr_article:'GDPR-99', message:'x' }` → `runGdprFindings` THROWS;
   assert the thrown message names `GDPR-99`; assert `.ctoc/inbox/questions/` gained NO file.
6. **Gate ON + GDPR-9 special-category flows end-to-end (parent Scenario "Article 9"):** finding
   `{ gdpr_article:'GDPR-9', message:'health data collected', confidence:'medium' }` (plan-stage)
   → real Inbox question created, `severity:'critical'` in context; proves the s2 enum extension
   lets `GDPR-9` pass `validateFindingSchema`.
7. **Registry entry present (LIVE wiring assertion):** read `.ctoc/operations-registry.yaml`;
   assert it contains a `gdpr-agent:` key with `path: agents/compliance/gdpr-agent.md` and
   `category: compliance` — proves CTO Chief can discover the agent.
8. **Registry untouched elsewhere:** assert the `enforcement`/`operations`/`token_budget` region
   (or a byte-region snapshot) is unchanged by the additive entry — the registry is a
   hook-adjacent config; the addition must not disturb existing blocks.

**Coverage Targets:** ≥ 80% line + branch on `gdpr-agent-runner.js`. Every branch exercised:
gate-off, gate-on plan route, gate-on letter route, unknown-code throw, non-array findings.

### Security Review
- [x] Path traversal: `projectRoot` is delegated to `shouldRunGdpr`/`inbox.createQuestion` which
      `path.join` it; the runner never concatenates paths. Tests confine all writes to tmp dirs.
- [x] Input validation: findings validated by `validateFindingSchema` before any emission;
      non-array `findings` coerced to `[]`; unknown code throws (never emitted).
- [x] No secrets.
- [x] Safe file operations: the only writes are via `inbox.createQuestion` (safeFs, fixed
      `.ctoc/inbox/questions/` under root) and the registry edit (additive entry only, no
      re-serialization of other blocks). No arbitrary write target.
- [x] Error messages: `validateFindingSchema` names the offending code (developer-facing); no
      sensitive path leaked.
- [x] Prototype pollution: findings are handled as plain objects; `normalizeSeverity` returns a
      shallow copy; no merge of untrusted keys into shared state.
- [x] Command injection: no `exec`/`execSync`.
- [x] Gate safety: the runner adds NO human gate and mutates NO enforcement/review-gate key — it
      writes only Inbox questions (advisory). Asserted by test 8 (registry region untouched).

## Execution Plan

### Step 8: TEST
Write `tests/gdpr-agent-runner.test.js` with all 8 cases (red — runner absent + registry entry
absent). Use the EC1-s2 tmp-project + real-Inbox pattern (no gate stub, no Inbox mock).

### Step 9: PREPARE
Confirm EC2-s1 helpers, EC2-s3 agent file, EC1-s2 `shouldRunGdpr`, and the real `inbox.js`
`createQuestion` signature `({source_plan, source_step, question, context}, root)`. Confirm the
refinement-loop letter schema requires `file` (grounds the Inbox routing). No new deps.

### Step 10: IMPLEMENT
Create `src/lib/gdpr-agent-runner.js` per the File Specification. Add the `gdpr-agent` entry to
`.ctoc/operations-registry.yaml` (additive; touch nothing else). Standard lib module pattern.

### Step 11: REVIEW
Verify dependency direction (lib→lib only); verify gate-first (no Inbox write when gate off);
verify unknown-code throws BEFORE emission; verify the registry edit is additive (diff shows one
new entry).

### Step 12: OPTIMIZE
Keep the runner thin — one exported function, straight-line gate→loop→route. No caching (findings
are per-run, must be fresh — read-fresh).

### Step 13: SECURE
Run the checklist; confirm the only writes are Inbox questions + the additive registry entry;
confirm no enforcement/gate key is touched (test 8).

### Step 14: VERIFY
`node --test tests/gdpr-agent-runner.test.js` → `# fail 0`; coverage ≥ 80%. Then full suite
`node --test tests/*.test.js` → `# fail 0` (no regression — especially inbox + regime + gate
tests, and any registry-shape test).

### Step 15: DOCUMENT
JSDoc on `runGdprFindings`; module header stating the gate-then-route contract and that
plan-stage findings surface as Inbox questions (letter path requires code coordinates). Update
README lib module count (+1) if a count claim exists; adjust the readme-numbers guard if present.

### Step 16: FINAL-REVIEW
Confirm the gate-off no-op, real Inbox write, severity normalization, letter routing, unknown-code
throw, and registry discovery all pass against REAL modules. Plan stays in `implementation/`.
Ready for batched Gate 2 with siblings s1–s3.


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
