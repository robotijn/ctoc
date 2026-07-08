---
iron_loop: true
title: "CU1 s1 — deployment-setup Tier-1 enforcement"
type: implementation
parent_plan: CU1-tier0-quick-wins
depends_on: none
priority: HIGH
risk_level: LOW
files:
  - agents/infrastructure/deployment-setup.md
  - tests/architecture-invariants.test.js
---

# CU1 s1 — deployment-setup Tier-1 enforcement

> Slice 1 of the CU1 decomposition. Adds v8 Tier-1 frontmatter to
> `agents/infrastructure/deployment-setup.md` and wires it into the
> `TIER_1_AGENTS` array of `tests/architecture-invariants.test.js` so the
> architecture invariant actually enforces it. Frontmatter-before-test ordering
> is a hard constraint (see Risk Mitigations).

Maps to CU1 acceptance criteria: **"deployment-setup gains v8 Tier-1 frontmatter"**
and **"architecture-invariants test enforces deployment-setup"**.

## Implementation Details

### Architecture Decision

`deployment-setup` is a Tier-1 sub-orchestrator by role (it drives the
post-Gate-3 deployment pipeline) but its frontmatter predates the v8 4-tier
model, so it carries only `name`/`description`/`tools`/`model` (confirmed by
reading lines 1–8 of the file: `model: sonnet`, `tools: Bash, Read, Write,
WebFetch`, no `tier:`/`reports_to:`/`dispatch_protocol:`). The invariants test's
`TIER_1_AGENTS` array (lines 104–118 of `tests/architecture-invariants.test.js`)
does not list it, so the `tier: 1` / `reports_to: cto-chief` /
`dispatch_protocol: v1` assertions (the `it(...)` blocks at lines 133, 142) never
run against it — the contract is silently unenforced.

Decision: mirror the exact field set of an audited-SOLID Tier-1 agent
(`agents/planning/implementation-planner.md`, whose frontmatter carries
`reports_to: cto-chief`, `dispatch_protocol: v1`, `tier: 1` at lines 12–14).
Copy that canonical field set rather than inventing one, so the invariants test
passes by construction. Keep `model: sonnet` and the existing `tools:` value —
this slice adds fields, it does not change model or tools.

### Dependency Graph

```
agents/infrastructure/deployment-setup.md (MODIFY: add 3 frontmatter fields)
    --enforced-by--> tests/architecture-invariants.test.js (MODIFY: add 1 array entry)
```

No code dependency; the test reads the agent file from disk via
`readFM(path.join(projectRoot, rel))`. No cycle. Single cohesive unit
(the agent contract + the test that enforces it).

### File Specifications

#### File: `agents/infrastructure/deployment-setup.md`
**Action:** MODIFY
**Purpose:** Declare v8 Tier-1 membership so the architecture invariant enforces
its dispatch contract.
**Change Type:** modify-existing (frontmatter only)

**Changes:**
- In the YAML frontmatter block (lines 3–8, between the two `---` fences,
  currently `name`/`description`/`tools`/`model`), **add** three fields:
  - `reports_to: cto-chief`
  - `dispatch_protocol: v1`
  - `tier: 1`
- Do NOT modify `name`, `description`, `tools`, or `model: sonnet`.
- Do NOT touch the body (lines 10+).

**Surgical constraint:** only the three new lines are added. No section rewrite
(no-churn rule).

#### File: `tests/architecture-invariants.test.js`
**Action:** MODIFY
**Purpose:** Add `deployment-setup` to the enforced Tier-1 set.
**Change Type:** modify-existing (one array entry)

**Changes:**
- In the `TIER_1_AGENTS` array (opens at line 104, currently 13 entries ending
  `'agents/planning/implementation-planner.md',` at line 117), **add** the entry
  `'agents/infrastructure/deployment-setup.md',`.
- Add it **only after** the deployment-setup frontmatter edit above is in place
  (frontmatter-before-test ordering).
- Do NOT modify the `it(...)` assertion blocks (lines 125–156); they already
  loop `TIER_1_AGENTS` and will pick up the new entry automatically.

### Test Plan

This slice is verified by the **existing** invariants test — no new test file.
The two `it` blocks that gain coverage of the new entry:

- `every Tier 1 agent declares tier: 1` (line 133) — reads the real
  `deployment-setup.md` via `readFM`, asserts `/^tier:\s*1$/m`.
- `every Tier 1 agent declares reports_to: cto-chief` (line 142) — asserts
  `/reports_to:\s*cto-chief/`.
- `no Tier 1 agent claims role: top-level-coordinator` (line 150) — asserts
  the file does NOT declare `role: top-level-coordinator` (deployment-setup does
  not, so this passes).

**Content-contract, zero doubles:** these assertions read the real agent file
off disk; no mock, no stub, no fake. The added frontmatter is the thing under
test.

Ordering verification (from the AC):
1. After the frontmatter edit alone, `node --test tests/architecture-invariants.test.js`
   must pass `# fail 0` (edit is valid on its own — the field format matches the
   regex `/^tier:\s*1$/m`).
2. After adding the array entry, run again — must still pass `# fail 0`, now with
   the new entry covered by both loops.

### Security Review

- Path traversal: N/A — no runtime path handling changed; the test uses
  `path.join(projectRoot, rel)` with a hardcoded relative literal.
- Input validation: N/A — declarative frontmatter only.
- No secrets: confirmed — the added fields are `cto-chief` / `v1` / `1`.
- Safe file operations: only two enumerated files edited.
- No `execSync`/`exec` introduced.

## Execution Plan

### Step 8: TEST
Confirm the baseline is green: `node --test tests/architecture-invariants.test.js`
passes `# fail 0` (verified 2026-07-08: 229 tests pass across the suite). The
enforcing `it` blocks (`every Tier 1 agent declares tier: 1`, `... reports_to:
cto-chief`) already exist and READ the real agent file — no new test is written;
the specification is the assertion that will run against the edited file. Confirm
the assertions currently do NOT cover `deployment-setup` (it is absent from
`TIER_1_AGENTS`).

### Step 9: PREPARE
Read `agents/planning/implementation-planner.md` frontmatter (lines 3–15) to copy
the canonical Tier-1 field set. Read `agents/infrastructure/deployment-setup.md`
lines 1–8 to confirm the current frontmatter shape before editing.

### Step 10: IMPLEMENT
(a) Add `reports_to: cto-chief`, `dispatch_protocol: v1`, `tier: 1` to
`deployment-setup.md` frontmatter. (b) Run `node --test
tests/architecture-invariants.test.js` — confirm `# fail 0` (frontmatter valid on
its own). (c) Add `'agents/infrastructure/deployment-setup.md',` to
`TIER_1_AGENTS`. This is ONE step with two sub-items in strict order.

### Step 11: REVIEW
Self-review: frontmatter fields match the canonical set exactly; no other field
changed; `model: sonnet` preserved; array entry added after the frontmatter;
body untouched.

### Step 12: OPTIMIZE
Nothing to optimize — three declarative lines and one array entry. Confirm no
duplication (deployment-setup appears exactly once in `TIER_1_AGENTS`).

### Step 13: SECURE
Run the Security Review checklist above. No new attack surface.

### Step 14: VERIFY
`node --test tests/architecture-invariants.test.js` → `# fail 0`, and the full
suite `node --test tests/*.test.js` → `# fail 0`, 0 skipped.

### Step 15: DOCUMENT
No doc change required; the frontmatter IS the documentation of the agent's tier.
Record the edit in the CU1 audit ledger (slice s6) with verdict for
deployment-setup.

### Step 16: FINAL-REVIEW
Confirm: file only edits `agents/infrastructure/deployment-setup.md` and
`tests/architecture-invariants.test.js`; both invariant loops now cover
deployment-setup; suite green.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Array entry added before frontmatter → `tier: 1` / `reports_to` assertions red | Edit frontmatter FIRST, run test, THEN add array entry, run again | Step 10 sub-items (a)→(b)→(c) |
| Field format mismatch (e.g. `tier:1` no space) fails `/^tier:\s*1$/m` | Copy the exact literal from implementation-planner.md | Step 9 |
