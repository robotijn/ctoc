---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T16:39:46.388Z
gate_crossed: implementation → todo
---

---
title: "EC3-s3 — register eu-ai-act-agent in operations-registry.yaml (dispatch wiring, gated on shouldRunEuAiAct) + registry test"
type: implementation
parent_plan: EC3-eu-ai-act-agent-plan-and-code
depends_on: EC3-eu-ai-act-agent-plan-and-code-s2-agent
program: ctoc-eu-compliance
priority: HIGH
risk_level: HIGH
iron_loop: true
files:
  - .ctoc/operations-registry.yaml
  - tests/eu-ai-act-agent-registry.test.js
---

# EC3-s3 — register eu-ai-act-agent (dispatch wiring) + registry test

> Slice 3 of EC3 — the **one integration point**: register the `eu-ai-act-agent`
> (built in s2) in `.ctoc/operations-registry.yaml` so CTO Chief can dispatch it, and
> record that its run is gated on `shouldRunEuAiAct(projectRoot)` (EC1). A registry entry
> is a **LIVE, human-facing dispatch surface** — so per the PI4 rule this slice wires it
> live AND a real test asserts the entry resolves (name, path-to-an-existing-file, tier,
> category, gate marker). Depends on **s2** — the entry's `path` must point at the agent
> file s2 creates.

**Read before acting (CF1 / ancestry-read):** the parent index
`plans/implementation/EC3-eu-ai-act-agent-plan-and-code.md`; slice s2 for the exact agent
`name`/path/tier; the real registry `.ctoc/operations-registry.yaml` (its `agents:` block
shape — `name`, `path`, `tier`, `category` per existing entries like
`agents/coordinator/cto-chief.md`); `src/lib/compliance-regime.js` (`shouldRunEuAiAct`,
the gate this entry records). Trust the file on disk over this brief; surface drift.

---

## Implementation Details

### Architecture Decision

The registry (`.ctoc/operations-registry.yaml`) is CTOC's single source of truth for the
agent roster (its header states so). Adding the `eu-ai-act-agent` entry is what makes the
agent **actually dispatchable** — without it, s1+s2 are inert code that nothing invokes
(the "orphaned from birth" anti-pattern). This is a human-facing surface (CTO Chief reads
the registry to dispatch), so the wiring is done live and asserted by a real resolution
test, not asserted in prose.

**Targeted edit, not re-serialization.** Following the `compliance-regime.js`
`writeActiveProfiles` discipline, the edit ADDS one `eu-ai-act-agent` entry to the
`agents:` block and leaves every other block (crucially the hook-critical `enforcement`
and `operations` blocks referenced in the registry header) byte-identical. No YAML
round-trip that could reorder or drop keys.

**The gate is recorded, not weakened.** The entry carries a `gated_by: shouldRunEuAiAct`
marker documenting that CTO Chief must consult `shouldRunEuAiAct(projectRoot)` before
dispatch. This adds NO auto-cross of any human gate — the four gates are untouched; this
is a specialist advisory agent whose activation is scoped by the regime profile.

### Dependency Graph

```
.ctoc/operations-registry.yaml (eu-ai-act-agent entry)
  --path-points-at--> agents/compliance/eu-ai-act-agent.md   (s2 — must exist first)
  --records-gate----> src/lib/compliance-regime.js shouldRunEuAiAct (EC1 — shipped)
  --tested-by-------> tests/eu-ai-act-agent-registry.test.js  (this slice)
depends_on: s2. Depth 3 (s1 → s2 → s3) — at the SIP1 max chain depth, no deeper. No cycle.
```

### File Specifications

#### File: `.ctoc/operations-registry.yaml`
**Action:** MODIFY
**Purpose:** Register `eu-ai-act-agent` so it is dispatchable by CTO Chief; record its EC1 gate.
**Change Type:** modify-existing (additive entry)

##### Changes
- **Add** one entry under the `agents:` block, in the compliance grouping, adjacent to the other compliance agents (`gdpr-compliance-checker`, `audit-log-checker`, `license-scanner`):
  ```yaml
  eu-ai-act-agent:
    path: agents/compliance/eu-ai-act-agent.md
    tier: 2
    category: compliance
    role: specialist
    reports_to: cto-chief
    gated_by: shouldRunEuAiAct        # EC1 — dispatch only when the eu-ai-act-high-risk profile is active
    extends_skill: compliance/ai-governance-checker
    regime_profile: eu-ai-act-high-risk
    description: EU AI Act (Regulation (EU) 2024/1689) plan-inspection + code-scan specialist; wraps ai-governance-checker, filters output to EU AI Act only.
  ```
  (Match the EXACT key shape of the existing entries as they read on disk — the block above is the intent; the implementer aligns keys/indent to the real neighbors, e.g. whether entries are keyed maps or list items with a `name:` field.)
- **Do NOT touch** the `enforcement`, `operations`, or any non-`agents` block.

##### Dependencies
- The `path` value must reference the file s2 creates (`agents/compliance/eu-ai-act-agent.md`).

##### Called By
- `agents/coordinator/cto-chief.md` — CTO Chief reads the registry to dispatch specialists.

##### Error Handling
- N/A (static config). The wiring test guards against a dangling `path` (entry pointing at a nonexistent file).

##### Cross-Platform Notes
- Repo-relative forward-slash path (`agents/compliance/eu-ai-act-agent.md`) as all other entries use.

### Test Plan

#### Tests: `tests/eu-ai-act-agent-registry.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe` / `it` / `assert/strict`) — real registry-resolution test.

##### Test Cases
1. **Entry exists.** Parse `.ctoc/operations-registry.yaml`; assert an agent entry named `eu-ai-act-agent` is present. (Maps parent scope "operations-registry.yaml entry for eu-ai-act-agent".)
2. **Path resolves to a real file.** Assert the entry's `path` (`agents/compliance/eu-ai-act-agent.md`) exists on disk (guards against a dangling registry pointer — the live-surface check). (LIVE-wire assertion per PI4.)
3. **Tier + category correct.** Assert `tier: 2`, `category: compliance`.
4. **Gate recorded.** Assert the entry carries `gated_by: shouldRunEuAiAct` (or references `shouldRunEuAiAct`) — the EC1 gate is documented on the dispatch surface. (Maps AC "runs only when shouldRunEuAiAct true".)
5. **No human gate weakened.** Assert the registry's `enforcement` block still contains its gate keys unchanged (parse before/after in the test's own fixture, or assert the presence of the review-gate/enforcement keys) — proving the additive edit did not touch a gate. (Maps the parent's "NEVER weaken a human gate" invariant.)
6. **Wrapped skill + profile recorded.** Assert `extends_skill: compliance/ai-governance-checker` and `regime_profile: eu-ai-act-high-risk` on the entry.

##### Coverage Targets
- The registry is config, not executable — coverage is of the resolution assertions. Every load-bearing entry field asserted; the dangling-path guard is the key real-flow test.

### Security Review

- [x] **Path traversal:** the entry path and the test read a fixed repo-relative path; no untrusted path construction.
- [x] **Input validation:** the test validates the parsed YAML shape before asserting fields.
- [x] **No secrets:** none in the registry entry.
- [x] **Safe file operations:** the implement step edits only `.ctoc/operations-registry.yaml` (whitelisted); the test reads only.
- [x] **Error messages:** N/A (config).
- [x] **Prototype pollution / command injection:** N/A — additive YAML entry; test parses with the existing registry loader / a YAML parse, no `exec`.
- [x] **Gate integrity:** additive-only edit; `enforcement`/`operations` blocks untouched; asserted by test case 5.

---

## Execution Plan (Steps 8–16)

### Step 8: TEST
- [ ] Write `tests/eu-ai-act-agent-registry.test.js` — the 6 resolution assertions above (RED first: entry-present + path-resolves fail until s3 edit + s2 file both land). Parse the registry via the existing loader if one exists, else a YAML read; resolve paths against the project root.

### Step 9: PREPARE
- [ ] Confirm s2 shipped `agents/compliance/eu-ai-act-agent.md` (the `path` target). Read the CURRENT `agents:` block shape in `.ctoc/operations-registry.yaml` fresh (keyed-map vs list-with-`name:`) so the new entry matches exactly. No new deps.

### Step 10: IMPLEMENT
- [ ] Add the `eu-ai-act-agent` entry to the `agents:` block adjacent to the other compliance agents, matching the on-disk key shape; include `path`, `tier: 2`, `category: compliance`, `gated_by: shouldRunEuAiAct`, `extends_skill`, `regime_profile`, `description`. Touch NO other block. No stubs.

### Step 11: REVIEW
- [ ] Self-review: `path` points at the real s2 file; entry shape matches neighbors; `enforcement`/`operations` blocks byte-identical (diff the file — only the additive entry changed).

### Step 12: OPTIMIZE
- [ ] Single additive entry; no reordering of the existing roster.

### Step 13: SECURE
- [ ] Verify no human gate weakened (test case 5 green); no `enforcement`/`operations` mutation; lint config if a config-lint step exists.

### Step 14: VERIFY
- [ ] `node --test tests/eu-ai-act-agent-registry.test.js` → all 6 GREEN, 0 skipped. Then `node --test tests/*.test.js` → `# fail 0` (registry-shape / architecture-invariants tests still pass). If a registry-schema test exists, it must stay green with the new entry.

### Step 15: DOCUMENT
- [ ] Inline YAML comment on the entry noting the EC1 gate (`gated_by: shouldRunEuAiAct`) and that it wraps `ai-governance-checker` scoped to EU AI Act.

### Step 16: FINAL-REVIEW
- [ ] implementation-reviewer verifies the entry resolves, the gate is recorded, and no human gate was weakened. Gate 3 approval batched at the EC3 parent level.

## Decisions Taken Under Ambiguity

- **Registry wiring is its own slice, separate from the agent file (s2).** It is a distinct integration point touching a distinct file (`.ctoc/operations-registry.yaml`) and carries its own gate-integrity + dangling-path guard test — a clean single-pass unit, and it must run after s2 so the `path` resolves.
- **The entry's exact key shape is aligned to the on-disk neighbors at implement time.** The registry header calls itself the single source of truth; the implementer reads the current `agents:` block fresh (Step 9) and matches its convention rather than assuming, per read-fresh.
- **`gated_by` is a documentation/discovery marker, not an enforcement mechanism.** The actual gate is `shouldRunEuAiAct` in code (EC1); CTO Chief consults it. This entry records the dependency so the roster is self-describing; it introduces no new auto-cross and weakens no human gate.


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
