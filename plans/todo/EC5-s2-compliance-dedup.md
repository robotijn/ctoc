---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T19:25:50.819Z
gate_crossed: implementation → todo
---

---
title: "EC5-s2 — Compliance finding dedup (regulation-topic key)"
type: implementation
parent_plan: EC5-iron-loop-integration
depends_on: none
files:
  - src/lib/compliance-dedup.js
  - tests/compliance-dedup.test.js
priority: MEDIUM
iron_loop: true
---

# EC5-s2 — Compliance finding dedup (regulation-topic key)

## Context (why this slice exists)

When `active_profiles` contains both `gdpr` and `eu-ai-act-high-risk`, the two
agents can emit findings for the same regulatory gap described differently (e.g.
GDPR Art. 5(1)(e) data minimization ↔ EU AI Act Art. 10 data governance). The
existing CTOC synthesizer (Tier-1) is oriented around `(file, line)` coordinates
and runs with `max_subagents: 0` — it cannot dedup coordinate-less legal
findings. EC5 owns a **minimal, purpose-built** dedup keyed on
`(kind, regulation_ref_normalized)` — NOT `(file, line)`. This slice builds that
pure module and its test. It is a leaf: no sibling dependency, no fs, no imports.

## Implementation Details

### Architecture Decision

**Conservative normalization via a static data table, not runtime regex over
free text.** The parent plan's risk register calls out that stripping article
numbers from `regulation_ref` strings can wrongly merge unrelated topics. The
mitigation (documented in the parent): merge ONLY when `kind` is identical AND
the topic extracted from `regulation_ref` is identical; when in doubt, keep BOTH
(a false-negative on dedup is safe advisory noise; a false-positive merge of
unrelated findings is the real harm). Normalization uses a frozen
`REGULATION_TOPIC_TABLE` data structure mapping known regulation-reference stems
to a canonical topic slug — documented as data, not regex-at-runtime. Any
`regulation_ref` not in the table falls back to its own trimmed/lowercased value
as its topic (so unknown refs never collide with a known topic).

**Dedup key = `(kind, regulation_ref_normalized)`.** When two findings share the
key, keep the higher-confidence one (confidence order:
`high > medium > low > undefined`); on a tie keep the EC2 (GDPR) finding (stable,
first-argument precedence). The surviving finding's `message` is augmented to
reference BOTH regulation sources so the user sees the cross-regime overlap.
Surviving finding retains `severity: 'critical'`.

### Dependency Graph

```
src/lib/compliance-dedup.js   (pure — imports nothing)
  --tested-by--> tests/compliance-dedup.test.js
```

No sibling-slice dependency. No cycle. Depth 0 (leaf).

### File Specifications

#### File: `src/lib/compliance-dedup.js`
**Action:** CREATE
**Purpose:** Deduplicate plan-stage compliance findings across regimes on a
`(kind, regulation_ref_normalized)` key. Pure computation, no I/O.
**Change Type:** new-module

##### Exports
- `deduplicateFindings(ec2Findings: object[], ec3Findings: object[])` → returns
  `object[]` (merged, de-duplicated list)
  - Description: concatenates the two lists (EC2 first for stable precedence),
    groups by `dedupKey(finding)`, and for each group keeps one finding (highest
    confidence; EC2 on tie) whose `message` names both regulation sources when a
    merge occurred. Findings with no discernible `kind` are never merged (each
    kept as-is). Never mutates inputs.
  - Non-array arguments are treated as `[]`.
- `normalizeRegulationRef(regulationRef: string)` → returns `string` (canonical
  topic slug)
  - Description: look up `regulationRef`'s stem in `REGULATION_TOPIC_TABLE`;
    fall back to the trimmed, lowercased ref when unknown. Non-string ⇒ `''`.
- `dedupKey(finding: object)` → returns `string`
  - Description: `` `${finding.kind || ''}::${normalizeRegulationRef(finding.regulation_ref)}` ``.
    Exported for the s3 orchestration and for direct assertion in tests.

##### Constants (module-private, frozen)
- `REGULATION_TOPIC_TABLE` — `Object.freeze({ ... })` mapping known
  regulation-reference stems to canonical topic slugs. Seed entries grounded in
  the parent's worked example:
  - `'gdpr art. 5'` → `'data-governance'`, `'gdpr art. 5(1)(e)'` → `'data-governance'`
  - `'eu-ai-act art. 10'` → `'data-governance'`
  Documented in a comment as the conservative merge table; extend by data, never
  by loosening the match.
- `CONFIDENCE_ORDER` — `Object.freeze({ high: 3, medium: 2, low: 1 })`
  (undefined ⇒ 0).

##### Dependencies
- None. Pure module (`'use strict';` only).

##### Called By
- `src/lib/compliance-integration.js` (EC5-s3) — merges EC2/EC3 plan-stage
  findings before Inbox attachment.
- `tests/compliance-dedup.test.js`.

##### Data Flow
```
deduplicateFindings(ec2, ec3)
  --> all = [...(ec2||[]), ...(ec3||[])]
  --> groups = Map<dedupKey, finding[]>
  --> for each group:
        if 1 member  → keep as-is
        if >1        → pick highest CONFIDENCE_ORDER (EC2/first on tie),
                       set survivor.message = mergedMessage naming both regulation_refs,
                       survivor.severity = 'critical'
  --> return [...survivors]  (input order stable by first-seen key)
```

##### Error Handling
- Non-array `ec2Findings` / `ec3Findings`: coerced to `[]`.
- A finding missing `kind` or `regulation_ref`: its key uses `''` for the missing
  part; two findings both missing `kind` are NOT merged unless their full key
  matches — the conservative-merge rule means a `''` kind never merges across
  different regulation topics.
- Never throws for object/array inputs; a non-object element is passed through
  unchanged (its `dedupKey` computes over `undefined` fields safely).

##### Cross-Platform Notes
- No paths, no fs, no OS-specific behaviour — cross-platform by construction.

### Test Plan

#### Tests: `tests/compliance-dedup.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`assert`).

##### Test Cases
1. **Cross-regime merge (parent worked example).** EC2 finding
   `{ kind:'missing-data-governance', regulation_ref:'GDPR Art. 5(1)(e)',
   confidence:'medium', severity:'critical' }` + EC3 finding
   `{ kind:'missing-data-governance', regulation_ref:'EU-AI-Act Art. 10',
   confidence:'medium', severity:'critical' }` ⇒ output length 1; survivor
   `severity === 'critical'`; survivor `message` references BOTH
   `GDPR Art. 5(1)(e)` and `EU-AI-Act Art. 10`.
2. **Tie keeps EC2 (first-argument precedence).** Equal confidence, same key ⇒
   survivor is the EC2 finding (assert by an EC2-only marker field).
3. **Higher confidence wins.** EC3 `confidence:'high'` vs EC2 `confidence:'low'`
   on the same key ⇒ survivor is the EC3 finding.
4. **Different `kind` never merges.** Same `regulation_ref`, different `kind` ⇒
   output length 2 (conservative: no false-positive merge).
5. **Unknown regulation_ref does not collide with a known topic.** A finding with
   `regulation_ref:'GDPR Art. 30'` (not in the table) keeps its own topic slug
   and is not merged with an `Art. 10` data-governance finding.
6. **Non-array inputs ⇒ `[]` / graceful.** `deduplicateFindings(null, undefined)`
   ⇒ `[]`; `deduplicateFindings([f], null)` ⇒ `[f]`.
7. **Inputs are not mutated.** Deep-freeze the input findings; call
   `deduplicateFindings`; assert no throw and inputs unchanged.
8. **`normalizeRegulationRef` unit.** `'GDPR Art. 5(1)(e)'` and
   `'EU-AI-Act Art. 10'` both normalize to `'data-governance'`; a non-string ⇒ `''`.
9. **`dedupKey` unit.** Two findings with same kind + topic produce an identical
   `dedupKey`; differing kind produces different keys.
10. **GATE-INVARIANT (load-bearing).** Read `src/hooks/human-gate-check.js`
    source: assert `HUMAN_GATES` still has exactly 3 destination keys
    (`implementation`, `todo`, `done`). Assert this module's source names NO gate
    key (`HUMAN_GATES`, `requireReviewGate`, `enforcementMode`, `review_gate` ⇒
    zero matches) — dedup is pure advisory data-shaping and touches no gate.

##### Coverage Targets
- Line ≥ 80%, branch ≥ 80% (merge/no-merge, tie, confidence order, unknown ref,
  non-array coercion).
- Every throw/return branch exercised.

### Security Review

- [x] Path traversal: no paths.
- [x] Input validation: non-array coercion; non-object elements passed through.
- [x] No secrets.
- [x] Safe file operations: none (pure module).
- [x] Error messages: none leaked; module does not throw for object/array inputs.
- [x] Prototype pollution: survivor built by shallow spread; `REGULATION_TOPIC_TABLE`
      is frozen and keys are looked up, never assigned from untrusted input.
- [x] Command injection: none.

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write `tests/compliance-dedup.test.js` covering cases 1–10 above
- [ ] Include the GATE-INVARIANT test (case 10)
- [ ] Test error conditions (non-array inputs, frozen inputs, unknown refs)
- [ ] Run tests — expect RED (module does not exist yet)

### Step 9: PREPARE
- [ ] Confirm the parent's worked-example finding shapes (kind, regulation_ref, confidence)
- [ ] No dependencies to install

### Step 10: IMPLEMENT
- [ ] Create `src/lib/compliance-dedup.js`
- [ ] Add frozen `REGULATION_TOPIC_TABLE` and `CONFIDENCE_ORDER`
- [ ] Implement `normalizeRegulationRef`, `dedupKey`, `deduplicateFindings`
- [ ] Merge-message augmentation naming both regulation sources
- [ ] Export `{ deduplicateFindings, normalizeRegulationRef, dedupKey }`

### Step 11: REVIEW
- [ ] Self-review: conservative-merge rule holds (different kind never merges)
- [ ] Verify inputs are never mutated
- [ ] Verify no gate key is referenced

### Step 12: OPTIMIZE
- [ ] Single grouping pass (Map); no repeated scans
- [ ] Avoid building the merge message when a group has one member

### Step 13: SECURE
- [ ] Frozen table; no untrusted key assignment
- [ ] No secrets; no I/O

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests: `node --test tests/compliance-dedup.test.js`
- [ ] Coverage ≥ 80%; 0 skipped, 0 flaky
- [ ] Confirm gate-invariant test passes

### Step 15: DOCUMENT
- [ ] JSDoc on all three exports
- [ ] Comment documenting the conservative-merge table as data, not runtime regex

### Step 16: FINAL-REVIEW
- [ ] Verify Steps 8–15 completed
- [ ] Merge / no-merge / gate-invariant tests green
- [ ] Ready for human review
