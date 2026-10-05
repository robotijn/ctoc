---
iron_loop_verdict: true
iron_loop: true
title: "Tool grants for the quality, architecture, versioning, frontend and developer-experience agents"
type: implementation
parent_plan: agent-tool-grants
depends_on: agent-tool-grants-s1-the-test
priority: high
effort: medium
files:
  - agents/quality/architecture-checker.md
  - agents/quality/code-reviewer.md
  - agents/quality/code-smell-detector.md
  - agents/quality/complexity-analyzer.md
  - agents/quality/complexity-reducer.md
  - agents/quality/consistency-checker.md
  - agents/quality/dead-code-detector.md
  - agents/quality/duplicate-code-detector.md
  - agents/quality/performance-validator.md
  - agents/quality/quality-gate.md
  - agents/quality/type-checker.md
  - agents/architecture/dependency-analyzer.md
  - agents/architecture/pattern-detector.md
  - agents/versioning/backwards-compatibility-checker.md
  - agents/versioning/feature-flag-auditor.md
  - agents/versioning/technical-debt-tracker.md
  - agents/frontend/bundle-analyzer.md
  - agents/frontend/component-tester.md
  - agents/frontend/visual-regression-checker.md
  - agents/devex/api-deprecation-checker.md
  - agents/devex/onboarding-validator.md
  - tests/agent-tool-grants.test.js
  - tests/agent-tool-grants-maxima.test.js
approved_by: human
approved_at: 2026-10-05T20:27:06.990Z
gate_crossed: implementation → todo
---

# Tool grants for the quality, architecture, versioning, frontend and developer-experience agents

**Scope (one line):** twelve of these 21 agents already hold the right tools and need only the shared search section; seven gain Grep or Glob, `quality-gate` gains Edit, `complexity-reducer` stops ordering a write into the user's project, and `pattern-detector` keeps the Bash it never uses until slice 11 measures it; all twenty-one leave the test's debt.

**The owner's answer of 2026-10-05:** "Approve the additions and the six safety fixes now; hold the removals until each is checked in a real run." `pattern-detector`'s loss of Bash is a least-privilege removal and is held (slice 11); every other change here is an addition or a body correction and goes ahead.

Read first: the index `plans/implementation/agent-tool-grants.md`, slice 1 and slice 11.

## Implementation Details

### The changes, agent by agent

| Agent | Tools today | Tools after | Body evidence (read 2026-10-05) |
|---|---|---|---|
| `quality/architecture-checker` | `Read, Grep, Glob, Bash` | unchanged | `npx depcruise` and per-language tools |
| `quality/code-reviewer` | `Read, Grep, Glob` | unchanged | Reads the diff |
| `quality/code-smell-detector` | `Read, Grep, Glob` | unchanged | Reads code |
| `quality/complexity-analyzer` | `Bash, Read, Grep, Glob` | unchanged | lizard, radon, eslint, gocyclo, clippy |
| `quality/complexity-reducer` | `Read, Grep` | `Read, Grep, Glob` | Plans refactors as diffs and codemod recipes; line 385 orders it to "author it in the project's `codemods/` folder" |
| `quality/consistency-checker` | `Read, Grep, Glob` | unchanged | Reads code |
| `quality/dead-code-detector` | `Bash, Read, Grep, Glob` | unchanged | knip, vulture, staticcheck, cargo udeps |
| `quality/duplicate-code-detector` | `Bash, Read, Grep, Glob` | unchanged | jscpd, pylint, pmd cpd |
| `quality/performance-validator` | `Bash, Read, Grep, Glob` | unchanged | Benchmarks, size-limit |
| `quality/quality-gate` | `Bash, Read, Write, Grep, Glob, Task` | `Bash, Read, Write, Grep, Glob, Task, Edit` | Dispatches the quality agents; "You manage the quality state cache" |
| `quality/type-checker` | `Bash, Read, Grep, Glob` | unchanged | mypy, tsc |
| `architecture/dependency-analyzer` | `Read, Grep, Glob, Bash` | unchanged | Runs its own analysis program with Bash (line 98) |
| `architecture/pattern-detector` | `Read, Grep, Glob, Bash` | unchanged (Bash held, slice 11) | Glob patterns and import reading; its one shell-labelled block is a list of Glob calls; no command |
| `versioning/backwards-compatibility-checker` | `Bash, Read, Grep` | `Bash, Read, Grep, Glob` | api-extractor, openapi-diff, `npm pack` |
| `versioning/feature-flag-auditor` | `Read, Grep` | `Read, Grep, Glob` | Grep for flag usages; its `git checkout` block sits inside the report template |
| `versioning/technical-debt-tracker` | `Read, Grep, Bash` | `Read, Grep, Bash, Glob` | eslint and coverage commands |
| `frontend/bundle-analyzer` | `Bash, Read, Grep, Glob` | unchanged | Production builds |
| `frontend/component-tester` | `Bash, Read` | `Bash, Read, Grep, Glob` | Runs component tests and reports failures |
| `frontend/visual-regression-checker` | `Bash, Read` | `Bash, Read, Grep, Glob` | percy, chromatic, playwright |
| `devex/api-deprecation-checker` | `Bash, Read, Grep` | `Bash, Read, Grep, Glob` | `tsc`, `npm outdated`, `curl -sI` |
| `devex/onboarding-validator` | `Bash, Read, Grep, Glob` | unchanged | `git clone`, install, build, test |

### Body edits, exactly

**`complexity-reducer`, line 385.** Replace "author it in the project's `codemods/` folder and name it in the plan" with "write the full recipe in your report, naming the path under the project's `codemods/` folder where the build step will save it, and name that path in the plan". This agent plans; the build step writes, inside a plan that declares the file. (A write into the user's project from a planner would also be refused by the edit protection unless a plan declared the path.)

**The shared search section**, in all twenty-one, immediately before `## Honest status (shared rule)`:

```markdown
## Searching the repository (shared rule)

Build every list of call sites, readers, writers or occurrences with Grep over the whole repository, never only from the files you happened to open, and read each match before you count it. Under any claim that nothing else in the repository does something, cite the search that shows it: the pattern, the path searched and how many files matched. A match shows where a name is written, not that the code runs.
```

### The test edits — `tests/agent-tool-grants.test.js`

Remove the twenty-one keys from `DEBT`; lower `MAX_DEBT` by 21. Remove `quality/quality-gate` from `WRITE_EDIT_DEBT` (it now holds Write and Edit together); lower `MAX_WRITE_EDIT_DEBT` by 1. `HELD_REMOVALS` is unchanged: `'architecture/pattern-detector': ['Bash']` stays until slice 11. Lower `MAX_DEBT` by 21 and `MAX_WRITE_EDIT_DEBT` by 1 in `tests/agent-tool-grants-maxima.test.js` (`CEILINGS`) as well, in the same change, because each maximum there must equal its ceiling.

### Wiring — the live call sites

No module is added. CTO Chief dispatches these agents at Steps 11, 12 and 14 (`agents/coordinator/cto-chief.md`); `quality-gate` coordinates the quality agents. This slice changes what they may do, not whether they are reached.

### Security review

- `pattern-detector` keeps its unused shell until slice 11 measures it; it holds no web tool, so the safety floor holds. `tests/unexecutable-instruction-fence.test.js` begins scanning it only when its Bash is removed (slice 11).
- `quality-gate`'s Edit adds no reach beyond its Write.

### Neighbouring plans (technical facts; the order the owner chose)

The owner answered question 6 on 2026-10-05: these slices build before the "improved three times" run's rounds reach the affected files. `architecture/dependency-analyzer` is the subject of the "improved three times" run's slice now in progress (`plans/in-progress/00266-…-s6-dependency-analyzer.md`), and it already has recorded rounds. This slice's only change to it is the search section; it is built after that slice completes, and Step 9 reads how that run's final check treats an edit after recorded rounds (index, question 6).

### Acceptance criteria

1. The eight changed tools lines read as in the table; thirteen are unchanged (`pattern-detector`'s among them, its Bash held).
2. `complexity-reducer` line 385 reads as above.
3. All twenty-one carry the shared search section and are out of `DEBT`; `quality-gate` is out of `WRITE_EDIT_DEBT`; `MAX_DEBT` and `MAX_WRITE_EDIT_DEBT` are lowered by 21 and 1 in both test files.
4. `npm run lint`, `npm run typecheck` and `npm test` pass, zero skipped.

## Decisions Taken Under Ambiguity

1. **`complexity-reducer` stays read-only** and puts its recipe in the report (index, decision 6).
2. **`feature-flag-auditor`'s shell block is report text**, not an order: it sits inside the fenced report template.
3. **The owner's answer (1), 2026-10-05, option (a):** "Approve the additions and the six safety fixes now; hold the removals until each is checked in a real run." `pattern-detector`'s loss of Bash is held (slice 11); `complexity-reducer`'s rewritten order is a body correction that removes no tool, so it goes ahead.

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation: the test edits above
- [ ] Test error conditions: the failure messages name each agent and each wrong tool
- [ ] Run tests - expect RED (failing): `node --test tests/agent-tool-grants.test.js`, recorded

### Step 9: PREPARE
- [ ] Install dependencies if needed: none
- [ ] Check prerequisites: fingerprint the twenty-one files; confirm each `old_string` occurs exactly once; confirm the in-progress improvement slice for `dependency-analyzer` has completed
- [ ] Verify dev environment ready: record the Node version
- [ ] Create directories/config if needed: none

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements: the tools lines, the `complexity-reducer` line, the twenty-one search sections — every change by `Edit` after a `Read`
- [ ] Add error handling: none
- [ ] Wire up integration points: none new

### Step 11: REVIEW
- [ ] Self-review all new code: through CTOC's review agent
- [ ] Verify integration points work together: `tests/unexecutable-instruction-fence.test.js` passes
- [ ] Check error handling completeness: n/a

### Step 12: OPTIMIZE
- [ ] Remove redundant operations: none
- [ ] Optimize critical paths: none
- [ ] Simplify complex code: none

### Step 13: SECURE
- [ ] Validate inputs (no path traversal): through CTOC's security scan agent
- [ ] Sanitize outputs: n/a
- [ ] No secrets in code: none
- [ ] Safe file operations: n/a

### Step 14: VERIFY
- [ ] Run lint + type check: `npm run lint`, `npm run typecheck`
- [ ] Run ALL tests (TDD Green): `npm test`
- [ ] Check coverage >= 80%: at or above the floor in `.ctoc/coverage-baseline.json`
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation: the bodies themselves
- [ ] Add JSDoc comments to new functions: none
- [ ] Update CHANGELOG if needed: no changelog file exists

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly: through CTOC's final review agent
- [ ] All quality checks passed: `npm test`
- [ ] Manual verification if needed: none
- [ ] Ready for human review: through the menu's task completion


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
