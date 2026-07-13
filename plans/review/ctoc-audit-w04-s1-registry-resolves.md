---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:43.132Z
gate_crossed: implementation → todo
---

---
title: "W04 · s1 — operations-registry regenerated from disk (0 dangling paths, iron_loop names → trio)"
type: feature
parent_plan: "ctoc-audit-w04-agents-resolve"
depends_on: none
priority: HIGH
files:
  - .ctoc/operations-registry.yaml
  - tests/agent-dispatch-resolution.test.js
---

# W04 · s1 — Registry resolves

Strategy: **Option B** (chosen by the maintainer at Gate 1). This slice ships the
parent's strategy-independent MVP story *"regenerate `operations-registry.yaml` from
disk so every `path:` resolves"* AND the registry portion of the Option-B story
*"registry repointed to the real `iron-loop-executor` / `iron-loop-critic` /
`iron-loop-integrator` trio."* Both edit the same file, so per SIP1 they are one
cohesive slice.

This slice also **creates** the shared resolution test
`tests/agent-dispatch-resolution.test.js` and populates its **registry surface**
(paths + `iron_loop:` name references). Sibling slice `s2` extends the same test file
with the step-table and coordinator surfaces.

## Implementation Details

### Verified current state (do not re-derive — read the files to confirm before editing)

`.ctoc/operations-registry.yaml` has **20 dangling `path:` entries** and is missing
two trio agents. Grouped by required action:

**Group A — phantom step-agent entries to REMOVE** (their role folds into a trio
member under Option B; no file exists on disk):

| Registry key (agents:) | Dangling path | Role folds into |
|---|---|---|
| `functional-reviewer` | `agents/planning/functional-reviewer.md` | `iron-loop-critic` |
| `implementation-plan-reviewer` | `agents/planning/implementation-plan-reviewer.md` | `iron-loop-critic` |
| `test-maker` | `agents/implementation/test-maker.md` | `iron-loop-executor` |
| `quality-checker` | `agents/implementation/quality-checker.md` | `iron-loop-executor` |
| `implementer` | `agents/implementation/implementer.md` | `iron-loop-executor` |
| `self-reviewer` | `agents/implementation/self-reviewer.md` | `iron-loop-critic` |
| `optimizer` | `agents/implementation/optimizer.md` | `iron-loop-executor` |
| `verifier` | `agents/implementation/verifier.md` | `iron-loop-executor` |
| `documenter` | `agents/implementation/documenter.md` | `iron-loop-executor` |
| `implementation-reviewer` | `agents/implementation/implementation-reviewer.md` | `iron-loop-critic` |

**Group B — real entries with a WRONG path/model to CORRECT** (file exists elsewhere):

| Registry key | Wrong value | Correct value (from disk) |
|---|---|---|
| `iron-loop-integrator` | `path: agents/planning/iron-loop-integrator.md`, `model: sonnet` | `path: agents/iron-loop/iron-loop-integrator.md`, `model: opus` |
| `security-scanner` | `path: agents/implementation/security-scanner.md` | `path: agents/security/security-scanner.md` (keep `model: opus`) |

**Group C — trio members MISSING from the registry to ADD** (exist on disk, needed as
Option-B dispatch targets):

```yaml
  iron-loop-executor:
    path: agents/iron-loop/iron-loop-executor.md
    model: opus
    category: iron-loop
    role: sub-orchestrator
    reports_to: cto-chief
    description: Executes Iron Loop steps 7-15 — the doing steps (TEST, PREPARE, IMPLEMENT, OPTIMIZE, VERIFY, DOCUMENT).
    steps: [8, 9, 10, 12, 14, 15]

  iron-loop-critic:
    path: agents/iron-loop/iron-loop-critic.md
    model: opus
    category: iron-loop
    role: sub-orchestrator
    reports_to: cto-chief
    description: Scores/reviews execution plans — the review steps (CAPTURE gate, SPEC, REVIEW, FINAL-REVIEW).
    steps: [4, 7, 11, 16]
```
(Model values are taken from the actual agent files, which all declare `model: opus` —
this is regeneration-from-disk: registry fields mirror the file, not stale guesses.)

**Group D — truly dead entries to REMOVE** (no file exists anywhere under `agents/`;
`agents/writing/` and `agents/admin/` directories do not exist):
`document-planner`, `pdf-writer`, `docx-writer`, `pptx-writer`, `document-reader`,
`dashboard`, `learning-applier`, `learning-suggester`.

**Group E — `iron_loop:` NAME references to REPOINT** (the `iron_loop:` block lists
agent *names*, not paths; repoint each phantom name to its trio member; keep the
existing step numbering untouched — re-numbering the step model is out of scope):

| Location in `iron_loop:` | Current `agents:` / `review_gate:` | Repoint to |
|---|---|---|
| `functional_planning` step 3 (CAPTURE) | `[product-owner, functional-reviewer]`, `review_gate: functional-reviewer` | `[product-owner, iron-loop-critic]`, `review_gate: iron-loop-critic` |
| `implementation_planning` step 6 (SPEC) | `[implementation-planner, implementation-plan-reviewer, iron-loop-integrator]`, `review_gate: implementation-plan-reviewer` | `[implementation-planner, iron-loop-critic, iron-loop-integrator]`, `review_gate: iron-loop-critic` |
| `implementation_phase` step 7 (TEST) | `[test-maker]` | `[iron-loop-executor]` |
| step 8 (QUALITY) | `[quality-checker]` | `[iron-loop-executor]` |
| step 9 (IMPLEMENT) | `[implementer]` | `[iron-loop-executor]` |
| step 10 (REVIEW) | `[self-reviewer, quality-checker]` | `[iron-loop-critic, iron-loop-executor]` |
| step 11 (OPTIMIZE) | `[optimizer]` | `[iron-loop-executor]` |
| step 12 (SECURE) | `[security-scanner]` | **unchanged** (resolves) |
| step 13 (VERIFY) | `[verifier]` | `[iron-loop-executor]` |
| step 14 (DOCUMENT) | `[documenter]` | `[iron-loop-executor]` |
| step 15 (FINAL-REVIEW) | `[implementation-reviewer]`, `review_gate: implementation-reviewer` | `[iron-loop-critic]`, `review_gate: iron-loop-critic` |

Preserve everything else in the file byte-for-byte: the `schema_version`, Core
Principles banner, `token_budget`, `models`, the `kanban`, `quality_matrix`,
`learning`, `codebase_index`, `error_handling`, and `skill_commands` blocks, and the
already-resolving entries (`cto-chief`, `product-owner`, `implementation-planner`,
`deployment-setup`, `gdpr-agent`, `eu-ai-act-agent`, `eu-solution-recommender`). Bump
`updated:` to the ship date.

### Recommended trio mapping (documented — confirm against the trio bodies at Step 10)

Grounded in each trio member's own `description:` frontmatter:
`iron-loop-executor` (tools Read/Write/Edit/Bash) *executes* → the doing steps;
`iron-loop-critic` (tools Read/Grep) *scores/reviews* → the review steps;
`iron-loop-integrator` (tools Read/Write/Edit) *generates the step plan* → SPEC.
If a specific step's work is demonstrably performed by a different trio member, adjust
and record it in `## Decisions Taken Under Ambiguity`.

### Test: `tests/agent-dispatch-resolution.test.js` (CREATE — registry surface)

Framework `node:test`. Assert **resolution**, never mere string presence — use the
project's own runtime resolver so the test tracks reality:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const path = require('path');
const yaml = require('js-yaml');
const { resolveAgent } = require('../src/lib/agent-resolver');
const ROOT = path.join(__dirname, '..');
```

Shared helpers (place at top of file — `s2` reuses them):
- `buildNameIndex()` — walk `agents/**/*.md`, read each file's frontmatter with a
  match-anywhere parser (`content.match(/^---\n([\s\S]*?)\n---/m) || content.match(/\n---\n([\s\S]*?)\n---/)`,
  the same tolerant parser `tests/architecture-invariants.test.js` uses so W03's
  heading-first defect does not couple in), extract `^name:\s*(.+)$`, return
  `Map<name, relPath>`.
- `resolvesName(idx, name)` → `idx.has(name)` AND
  `['original','redirected'].includes(resolveAgent(idx.get(name), ROOT).kind)`.
- `const RETIRED_PHANTOMS = ['test-maker','quality-checker','implementer','self-reviewer','optimizer','verifier','documenter','implementation-reviewer','functional-reviewer','implementation-plan-reviewer']`.
- `const TRIO = ['iron-loop-executor','iron-loop-critic','iron-loop-integrator']`.

Registry-surface test cases:
1. **Every `agents.<k>.path` resolves.** `yaml.load` the registry; for each agent
   entry assert `resolveAgent(entry.path, ROOT).kind === 'original'` (fail message
   names the dangling key+path). Red now (20 dangling); green after regeneration.
2. **Every `iron_loop.*` agent name resolves.** Collect every name in each phase
   step's `agents: [...]` and every `review_gate:` value; assert `resolvesName` for
   each (cto-chief/product-owner/implementation-planner included — all real).
3. **No retired phantom remains in the registry.** Assert none of `RETIRED_PHANTOMS`
   appears as an `agents:` key, a `path:` basename, an `iron_loop` `agents[]` element,
   or a `review_gate:` value.
4. **Trio present & correct.** Assert each `TRIO` name is an `agents:` key whose
   `path` resolves and whose `model` equals the `model:` its on-disk file declares
   (regeneration-from-disk invariant — catches the `iron-loop-integrator` sonnet/opus
   drift).
5. **Drift guard (post-regeneration).** Assert `resolveAgent('agents/iron-loop/__does_not_exist__.md', ROOT).kind === 'not-found'` — proves the walk catches a later rename/delete, so drift after regeneration is still caught on the next run (parent AC "Registry drift after regeneration is still caught").
6. **Red-before-fix proof (self-contained).** `const PRE_FIX_DANGLING = ['agents/implementation/implementer.md','agents/planning/functional-reviewer.md','agents/implementation/verifier.md']` — paths that were live in the registry before this slice. Assert every one resolves to `not-found`, proving the resolver actually detects the pre-fix defect class rather than passing vacuously. (Optional strengthening: wrap a `try` that `execSync`s `git show HEAD:.ctoc/operations-registry.yaml`, parses its `path:` entries, and asserts ≥1 is `not-found`; skip cleanly if git history is unavailable so the inline proof always runs.)

## Execution Plan

### Step 8 — TEST
Create `tests/agent-dispatch-resolution.test.js` with the shared helpers and the six
registry-surface cases above. Run it against the **current unfixed tree** and confirm
it is **RED** (cases 1–4 fail on the dangling/missing entries; cases 5–6 already pass
— they prove the detector works). Capture the red output.

### Step 9 — PREPARE
Confirm `js-yaml` loads (`node -e "require('js-yaml')"` — verified available) and
`src/lib/agent-resolver.js` exports `resolveAgent`. Confirm on disk:
`agents/iron-loop/{iron-loop-executor,iron-loop-critic,iron-loop-integrator}.md`
exist; `agents/security/security-scanner.md` exists; `agents/writing/` and
`agents/admin/` do **not** exist. Grep the codebase for live dispatchers of the eight
Group-D dead names (`grep -rn "document-planner\|pdf-writer\|docx-writer\|pptx-writer\|document-reader\|learning-applier\|learning-suggester" src/ agents/`); if any live dispatch references them, record it in Decisions and surface it rather than silently removing.

### Step 10 — IMPLEMENT
Edit `.ctoc/operations-registry.yaml` (ONE step, sub-items):
- (a) Remove the 10 Group-A phantom agent entries.
- (b) Correct the Group-B `iron-loop-integrator` path+model and `security-scanner` path.
- (c) Add the two Group-C trio entries (`iron-loop-executor`, `iron-loop-critic`).
- (d) Remove the 8 Group-D dead entries.
- (e) Repoint every Group-E `iron_loop:` name reference + `review_gate:` per the table.
- (f) Bump `updated:` to today.
Make no other change. No stubs; every removed name is either repointed (E) or has no
on-disk target (A folds to trio via E; D is dead). Record the "remove dead Group-D
rows vs. repoint" choice in `## Decisions Taken Under Ambiguity` (removed: no target
file exists to point at).

### Step 11 — REVIEW
Re-read the diff: confirm every remaining `agents.<k>.path` is a real file, the trio
appear once each with `model: opus`, no retired phantom name survives anywhere in the
file, and the preserved blocks (quality_matrix, kanban, banners) are byte-identical.

### Step 12 — OPTIMIZE
None warranted (mechanical config edit). Confirm no duplicate agent keys were
introduced and YAML still parses (`node -e "require('js-yaml').load(require('fs').readFileSync('.ctoc/operations-registry.yaml','utf8'))"`).

### Step 13 — SECURE
No new attack surface (static config + a read-only test). Confirm the test does not
write files and any optional `execSync('git show …')` is wrapped so a failure cannot
throw uncaught or leak paths; no user input flows into the shell string.

### Step 14 — VERIFY
`node --test tests/agent-dispatch-resolution.test.js` → green. Then
`node --test tests/*.test.js` → `# fail 0`, 0 skipped. Re-run
`tests/architecture-invariants.test.js`, `tests/cto-chief-toplevel.test.js`,
`tests/eu-ai-act-agent-registry.test.js`, `tests/gdpr-agent-runner.test.js` (registry
consumers) and confirm the regeneration did not regress them.

### Step 15 — DOCUMENT
No user-facing doc change (registry is internal config). Note in the slice's Decisions
section the eight dead names removed and the trio mapping applied.

### Step 16 — FINAL-REVIEW
Verify parent ACs met by this slice: 0 dangling registry `path:` entries; 0 retired
phantom names in the registry; drift-after-regeneration still caught; red-before-fix
proven. Hand to CTO Chief. **Do not cross Gate 2.**


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
