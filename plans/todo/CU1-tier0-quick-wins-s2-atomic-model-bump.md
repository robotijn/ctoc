---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T21:09:40.499Z
gate_crossed: implementation → todo
---

---
iron_loop: true
title: "CU1 s2 — atomic model_optimized_for bump opus-4-7 → opus-4-8"
type: implementation
parent_plan: CU1-tier0-quick-wins
depends_on: none
priority: HIGH
risk_level: MEDIUM
files:
  - agents/coordinator/cto-chief.md
  - agents/coordinator/synthesizer.md
  - agents/iron-loop/iron-loop-integrator.md
  - agents/iron-loop/iron-loop-critic.md
  - agents/iron-loop/iron-loop-executor.md
  - agents/pipeline/agent-writer.md
  - agents/pipeline/agent-critic.md
  - agents/pipeline/agent-tester.md
  - agents/pipeline/agent-qa.md
  - agents/pipeline/agent-publisher.md
  - agents/planning/vision-advisor.md
  - agents/planning/vision-decomposer.md
  - agents/planning/product-owner.md
  - agents/planning/implementation-planner.md
  - tests/agent-modernization.test.js
  - tests/skill-loading.test.js
---

# CU1 s2 — ATOMIC model_optimized_for bump (opus-4-7 → opus-4-8)

> Slice 2 of the CU1 decomposition. **This slice is deliberately larger than the
> ~1–3 file guideline because the CU1 parent declares it ATOMIC and splitting it
> breaks CI.** The `model_optimized_for` string bump across all in-scope agent
> files MUST land in the SAME slice/commit as BOTH test-assertion updates. Any
> split produces a transient red where some agents carry `opus-4-8` while a test
> still asserts `opus-4-7` (or vice-versa). One slice = one atomic change.

Maps to CU1 acceptance criterion: **"model_optimized_for bump is atomic with test
updates"**.

## Implementation Details

### Architecture Decision

The running model is Opus 4.8; the corpus declares `model_optimized_for: opus-4-7`.
`grep -rl "model_optimized_for: opus-4-7" agents/` returns **21 files** (confirmed
2026-07-08). Of those 21, only **14 are in the CU1 `files:` list** — the remaining
7 (`agents/compliance/eu-ai-act-agent.md`, `.../eu-solution-recommender.md`,
`.../gdpr-agent.md`, `agents/coordinator/ivv-chief.md`,
`agents/planning/kpi-planner.md`, `.../stack-chooser.md`,
`.../unit-economics-modeler.md`) are **NOT in scope** and MUST NOT be edited
(no-churn rule; adding them requires a plan amendment). This is the confirmed
count-mismatch versus the audit's "~18" estimate; it is recorded in the audit
ledger (slice s6), not blocked on.

**Two independent test assertions govern the bump — both must flip in this slice:**

1. `tests/agent-modernization.test.js` line 89:
   `assert.match(content, /model_optimized_for:\s*opus-4-7/, ...)` — loops
   `MODERNIZED_AGENTS_PHASE_1` (lines 26–30): `vision-advisor`, `product-owner`,
   `implementation-planner`. All three are in this slice's `files:`. Flipping the
   3 agents without flipping line 89 → immediate red.
2. `tests/skill-loading.test.js` line 255:
   `assert.equal(fm.model_optimized_for, 'opus-4-7', ...)` — loops
   `listConvertedSkills()` (the redirect-stub targets resolved via
   `src/lib/agent-resolver.listConvertedAgents`, 85 stubs). **The 14 agents in
   this slice are NOT redirect stubs / converted-skill targets** (verified: none
   of the 14 has a `target_skill:` redirect; the converted set is the Tier-2
   specialist skills). So line 255 governs the *converted skills*, not these 14
   agents. However, the CU1 parent lists BOTH test files in scope and mandates
   flipping the skill-loading assertion in the same atomic commit — because the
   downstream Tier-2 SKILL.md files those stubs point to also carry
   `model_optimized_for: opus-4-7` and are flipped elsewhere in the CU-series.
   **For CU1's atomic guarantee, this slice flips line 255's literal from
   `'opus-4-7'` to `'opus-4-8'` and the converted SKILL.md frontmatter is bumped
   in lockstep only if it is in the CU1 `files:` list.** None of CU1's 5 skill
   files are converted-skill targets (verified: `dependency-checker`,
   `unit-test-runner`, `posthog-analytics`, `sentry-errors`,
   `react-native-bridge-checker` all have redirect stubs pointing AT them, but
   the assertion reads `fm.model_optimized_for` of the SKILL.md, and those 5
   ARE the targets). **Decision under ambiguity (record in ledger):** flipping
   line 255 to `'opus-4-8'` WITHOUT flipping the converted SKILL.md frontmatter
   would red the skill-loading test for every converted skill still on
   `opus-4-7`. Therefore this slice's line-255 change is GATED: it flips only if
   every converted-skill target it governs is `opus-4-8` in the same commit. Since
   CU1's scope does NOT include all 85 converted SKILL.md files, **the safe atomic
   action for CU1 is: leave `skill-loading.test.js` line 255 asserting the value
   that matches the on-disk converted skills.** If the converted skills are still
   `opus-4-7`, line 255 stays `opus-4-7` and is NOT edited by this slice; the
   parent's "update both test files" is satisfied for `agent-modernization.test.js`
   (which governs the 3 in-scope orchestrators) and the `skill-loading.test.js`
   edit is deferred to the technical dependency being present. **The executor MUST
   verify on-disk converted-skill values at Step 8 and pick the branch that keeps
   the suite green — no guessing.**

> This is the load-bearing subtlety of the whole CU1 decomposition. The atomic
> unit is: **the 14 in-scope agents + the `agent-modernization.test.js` line-89
> assertion**, flipped together. The `skill-loading.test.js` line-255 assertion is
> only flipped if-and-only-if the converted SKILL.md files it reads are `opus-4-8`
> in the same commit. The executor reads the real files at Step 8 and proves which
> branch keeps `# fail 0`.

### Dependency Graph

```
14 agent files (MODIFY: opus-4-7 → opus-4-8, one line each)
    --asserted-by--> tests/agent-modernization.test.js line 89 (MODIFY: opus-4-7 → opus-4-8)
                        [governs vision-advisor, product-owner, implementation-planner]
tests/skill-loading.test.js line 255
    --reads--> converted SKILL.md frontmatter (NOT the 14 agents)
    [flip only if on-disk converted skills are opus-4-8 in this commit — Step 8 decides]
```

No cycle. This slice depends on nothing (`depends_on: none`); it can run first or
in parallel-order with s1 (different files).

### File Specifications

#### The 14 agent files (all MODIFY, identical change)
For each of the 14 files in `files:` (excluding the two test files), the change is
a single-line frontmatter substitution:

- **Find:** `model_optimized_for: opus-4-7`
- **Replace:** `model_optimized_for: opus-4-8`
- Exactly one occurrence per file (confirmed by grep). No other line changes.

Confirmed line numbers (2026-07-08, for reference — re-read before editing per
read-fresh): all 14 carry the literal in their frontmatter block. Do NOT edit any
of the 7 out-of-scope opus-4-7 agents listed in the Architecture Decision.

#### File: `tests/agent-modernization.test.js`
**Action:** MODIFY
**Change:** line 89, `assert.match(content, /model_optimized_for:\s*opus-4-7/, ...)`
→ `/model_optimized_for:\s*opus-4-8/`. This loops the 3 Phase-1 orchestrators
(vision-advisor, product-owner, implementation-planner), all of which are flipped
in this same slice.

#### File: `tests/skill-loading.test.js`
**Action:** MODIFY (conditional — Step 8 decides)
**Change:** line 255, `assert.equal(fm.model_optimized_for, 'opus-4-7', ...)`
→ `'opus-4-8'` **only if** the converted SKILL.md files it reads are `opus-4-8`
on disk in this same commit. Otherwise leave unchanged and record the reason in
the ledger. The executor proves the branch by running the test.

### Test Plan

Content-contract, zero doubles: `agent-modernization.test.js` reads each real
agent file via `fs.readFileSync` and matches the frontmatter regex.
`skill-loading.test.js` parses the real converted SKILL.md frontmatter. No mock,
no stub, no fake — the on-disk value is the thing asserted.

Verification (from the AC):
- Before: baseline green (`# fail 0`), `grep -rl "model_optimized_for: opus-4-7"
  agents/` returns 21.
- After the atomic edit: `grep -rl "model_optimized_for: opus-4-7" agents/`
  returns the 7 out-of-scope files (NOT empty — CU1 scope is 14 of 21; the AC's
  "returns empty" is a full-corpus goal met across the CU-series, not by CU1
  alone). **Record this delta in the ledger.**
- `node --test tests/*.test.js` → `# fail 0` at the single atomic commit.
- No intermediate state where an agent is `opus-4-8` but `agent-modernization`
  still asserts `opus-4-7`.

### Security Review

- No runtime path handling; declarative frontmatter + a test regex literal.
- No secrets; the changed token is a model identifier string.
- Only the 16 enumerated files touched; the 7 out-of-scope agents are explicitly
  excluded.
- No `execSync`/`exec` introduced.

## Execution Plan

### Step 8: TEST
Baseline green confirmed (`node --test tests/*.test.js` → 229 pass, fail 0 on
2026-07-08). Re-confirm. Then READ the on-disk `model_optimized_for` value of the
converted SKILL.md files that `skill-loading.test.js` line 255 loops (via
`listConvertedSkills`) to decide the line-255 branch — this is a real-file read,
not a guess. Record the converted-skills value. Confirm the 14 in-scope agents
each carry exactly one `opus-4-7` occurrence and the 7 out-of-scope agents are
NOT edited.

### Step 9: PREPARE
Stage nothing yet. Enumerate the exact 14 agent paths + 2 test paths. Confirm the
7 out-of-scope opus-4-7 agents are on the exclude list. Re-read each of the 14
files' frontmatter (read-fresh) to confirm the literal is present before editing.

### Step 10: IMPLEMENT
Flip `opus-4-7` → `opus-4-8` in all 14 agent files AND line 89 of
`agent-modernization.test.js` **as one change set**. Apply the line-255 branch
chosen at Step 8. Do NOT commit any subset. This is ONE step; the sub-items are
the 16 files, staged together.

### Step 11: REVIEW
Self-review: exactly 14 agents changed (diff shows one line each); the 7
out-of-scope agents untouched; `agent-modernization` line 89 flipped;
`skill-loading` line 255 handled per the proven branch; no body/other-field
changes.

### Step 12: OPTIMIZE
No optimization; mechanical substitution. Confirm no file gained a second
`model_optimized_for` line.

### Step 13: SECURE
Run the Security Review checklist. No new surface.

### Step 14: VERIFY
`node --test tests/*.test.js` → `# fail 0`, 0 skipped, on the staged set BEFORE
committing (the atomic guarantee: verify-then-commit). Confirm the grep delta
(21 → 7 remaining out-of-scope) is as expected and recorded.

### Step 15: DOCUMENT
Record in the CU1 audit ledger (s6): the actual grep count (21), the in-scope
count (14), the 7 out-of-scope files with note "carries opus-4-7, outside CU1
files: list — not edited (no-churn)", and the line-255 branch taken with reason.

### Step 16: FINAL-REVIEW
Confirm atomicity: no intermediate red possible because agents + governing test
land together. Confirm suite green. Confirm no out-of-scope edit.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Agent files committed before test update → CI red | Stage ALL 16 files together; run full suite on the staged set before commit | Step 10 + Step 14 |
| Editing an out-of-scope opus-4-7 agent (churn) | Explicit 7-file exclude list; grep-verify only the 14 in-scope changed | Step 9, Step 11 |
| Flipping line 255 while converted skills still opus-4-7 → skill-loading red | Read on-disk converted-skill value at Step 8; branch chosen by proof, not assumption | Step 8, Step 10 |
| Fabricated count ("~18") assumed | Real grep run: 21 total, 14 in scope; delta recorded in ledger | Step 8, Step 15 |


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation (assertion flip is the test — line 89 opus-4-7 → opus-4-8)
- [x] Test error conditions (RED proven: 3 orchestrators fail before agent bump)
- [x] Run tests - expect RED (failing) — confirmed 3 failures on vision-advisor/product-owner/implementation-planner

### Step 9: PREPARE
- [x] Install dependencies if needed (none)
- [x] Check prerequisites (grep confirms 21 opus-4-7; 14 in-scope each with exactly 1 occurrence)
- [x] Verify dev environment ready (baseline suite 3399 pass, 0 fail)
- [x] Create directories/config if needed (none)

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements (14 agents bumped + test line 89 flipped, one atomic working-tree state)
- [x] Add error handling (N/A — declarative frontmatter)
- [x] Wire up integration points (skill-loading.test.js line 255 branch applied — see decision)

### Step 11: REVIEW
- [x] Self-review all new code (diff: 14 agents one line each; 7 out-of-scope untouched; line 89 flipped; line 255 unchanged per proof)
- [x] Verify integration points work together (both governing tests green: 186 pass)
- [x] Check error handling completeness (N/A)

### Step 12: OPTIMIZE
- [x] Remove redundant operations (mechanical substitution; no second model_optimized_for line introduced — grep verified)
- [x] Optimize critical paths (N/A)
- [x] Simplify complex code (N/A)

### Step 13: SECURE
- [x] Validate inputs (no path traversal) (no runtime path handling)
- [x] Sanitize outputs (N/A — model identifier string only)
- [x] No secrets in code (verified)
- [x] Safe file operations (only 16 enumerated files touched; 7 out-of-scope excluded)

### Step 14: VERIFY
- [x] Run lint + type check (eslint exit 0; tsc baseline-neutral — pre-existing .js diagnostics only, zero new)
- [x] Run ALL tests (TDD Green) — node --test tests/*.test.js → 3399 pass, 0 fail
- [x] Check coverage >= 80% (content-contract tests read real files; no new source code)
- [x] 0 skipped, 0 flaky tests (0 skipped confirmed)

### Step 15: DOCUMENT
- [x] Update relevant documentation (decision recorded below)
- [x] Add JSDoc comments to new functions (N/A — no new functions)
- [x] Update CHANGELOG if needed (deferred to caller's commit per CU1 versioning)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed (suite green, lint clean, atomic)
- [x] Manual verification if needed (grep 21 → 7 confirmed)
- [x] Ready for human review

## Decisions Taken Under Ambiguity

### D1 — skill-loading.test.js line 255 NOT edited (branch chosen by proof at Step 8)
The plan gated the line-255 flip on the on-disk value of the converted SKILL.md files
that `listConvertedSkills()` (via `agent-resolver.listConvertedAgents`) loops. **Step 8
read the real files: all 85 converted SKILL.md files carry `model_optimized_for: opus-4-7`
on disk (value distribution `{ 'opus-4-7': 85 }`, 0 missing).** None of the 85 converted
skills is in CU1's `files:` list, so this slice does not bump any of them. Per the plan's
explicit instruction ("If the converted skills are still `opus-4-7`, line 255 stays
`opus-4-7` and is NOT edited by this slice"), flipping line 255 to `'opus-4-8'` would RED
the skill-loading test for all 85 converted skills. **Decision: leave
`tests/skill-loading.test.js` line 255 asserting `'opus-4-7'` — unedited.** The parent's
"update both test files" is satisfied for `agent-modernization.test.js` (governs the 3
in-scope orchestrators); the `skill-loading.test.js` edit is correctly deferred to the
CU-series slice that bumps the 85 converted SKILL.md files. Proven: full suite green
(3399 pass, 0 fail) with line 255 unchanged.

### D2 — CU1 grep delta (recorded for s6 ledger)
`grep -rl "model_optimized_for: opus-4-7" agents/`: **21 before → 7 after** (dropped by
exactly 14 in-scope). The 7 remaining are out-of-scope and NOT edited (no-churn rule):
`agents/compliance/eu-ai-act-agent.md`, `agents/compliance/eu-solution-recommender.md`,
`agents/compliance/gdpr-agent.md`, `agents/coordinator/ivv-chief.md`,
`agents/planning/kpi-planner.md`, `agents/planning/stack-chooser.md`,
`agents/planning/unit-economics-modeler.md`. The AC's "returns empty" is a full-corpus
goal met across the CU-series, not by CU1 alone.
