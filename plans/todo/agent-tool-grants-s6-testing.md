---
iron_loop_verdict: true
iron_loop: true
title: "Tool grants for the fourteen testing agents; the quality-gate runner's Task removal is held for a measured run"
type: implementation
parent_plan: agent-tool-grants
depends_on: agent-tool-grants-s1-the-test
priority: high
effort: medium
files:
  - agents/testing/coverage-enforcer.md
  - agents/testing/coverage-mapper.md
  - agents/testing/playwright-qa.md
  - agents/testing/quality-gate-runner.md
  - agents/testing/smart-test-runner.md
  - agents/testing/runners/e2e-test-runner.md
  - agents/testing/runners/integration-test-runner.md
  - agents/testing/runners/mutation-test-runner.md
  - agents/testing/runners/smoke-test-runner.md
  - agents/testing/runners/unit-test-runner.md
  - agents/testing/writers/e2e-test-writer.md
  - agents/testing/writers/integration-test-writer.md
  - agents/testing/writers/property-test-writer.md
  - agents/testing/writers/unit-test-writer.md
  - tests/agent-tool-grants.test.js
  - tests/agent-tool-grants-maxima.test.js
approved_by: human
approved_at: 2026-10-05T20:27:06.885Z
gate_crossed: implementation → todo
---

# Tool grants for the fourteen testing agents

**Scope (one line):** the runners and writers gain Grep and Glob; the two cache-writing runners gain Edit; `property-test-writer` gains the order to run its tests red; `quality-gate-runner` keeps Task, and the section that launches agents with it, until slice 11 measures it; all fourteen gain the shared search section and leave the test's debt.

**The owner's answer of 2026-10-05:** "Approve the additions and the six safety fixes now; hold the removals until each is checked in a real run." `quality-gate-runner`'s loss of Task is a least-privilege removal (rule 4), not one of the six safety fixes, so it is held, together with the replacement of its "## Using Task Tool for True Parallelism" section, which only makes sense once Task is gone. Both move to slice 11.

Read first: the index `plans/implementation/agent-tool-grants.md`, slice 1 and slice 11.

## Implementation Details

### The changes, agent by agent

| Agent | Tools today | Tools after | Body evidence (read 2026-10-05) |
|---|---|---|---|
| `coverage-enforcer` | `Bash, Read, Grep` | `Bash, Read, Grep, Glob` | Coverage parsers and threshold commands |
| `coverage-mapper` | `Bash, Read, Write, Grep, Glob` | `Bash, Read, Write, Grep, Glob, Edit` | "Write: Update coverage-map.json" (line 438) |
| `playwright-qa` | `Bash, Read, Write, Edit, Grep, Glob` | unchanged | Writes and runs end-to-end tests |
| `quality-gate-runner` | `Bash, Read, Grep, Glob, Task` | unchanged (Task held, slice 11) | Runs every check with `&` / `wait`; "## Using Task Tool for True Parallelism" (lines 607-648) spawns `"subagent_type": "general-purpose"` agents |
| `smart-test-runner` | `Bash, Read, Write, Grep, Glob` | `Bash, Read, Write, Grep, Glob, Edit` | "Update cache": `.ctoc/quality-state/file-hashes.json`, `test-results.json` |
| `runners/e2e-test-runner` | `Bash, Read` | `Bash, Read, Grep, Glob` | playwright, cypress, docker |
| `runners/integration-test-runner` | `Bash, Read` | `Bash, Read, Grep, Glob` | pytest, npm, go test, docker compose |
| `runners/mutation-test-runner` | `Bash, Read` | `Bash, Read, Grep, Glob` | mutmut, stryker, pitest, cargo mutants |
| `runners/smoke-test-runner` | `Bash, Read` | `Bash, Read, Grep, Glob` | The smoke script |
| `runners/unit-test-runner` | `Bash, Read` | `Bash, Read, Grep, Glob` | pytest, npm, go test, cargo |
| `writers/e2e-test-writer` | `Read, Write, Edit, Bash` | `Read, Write, Edit, Bash, Grep, Glob` | Writes tests; "Run Command: npx playwright test" |
| `writers/integration-test-writer` | `Read, Write, Edit, Bash` | `Read, Write, Edit, Bash, Grep, Glob` | Writes tests; "Use `pytest -m integration` to run" |
| `writers/property-test-writer` | `Read, Write, Edit, Bash` | `Read, Write, Edit, Bash, Grep, Glob` | Writes tests; no run order today |
| `writers/unit-test-writer` | `Read, Write, Edit, Bash` | `Read, Write, Edit, Bash, Grep, Glob` | Writes tests; "Run tests and CONFIRM they fail" (line 25) |

### Body edits, exactly

**`quality-gate-runner`:** only the shared search section. Its Task tool and its "## Using Task Tool for True Parallelism" section stay as they are; their removal, and the replacement section text, are in slice 11. Stated plainly, so it is not lost in the hold: that section orders `general-purpose` agents, which the project's rules forbid in place of CTOC's own agents, and it stays in the file until slice 11 lands.

**`property-test-writer`, after the "## Role" paragraph (line 18).** Insert:

```markdown
Run the property tests you write and confirm they fail before the code they test exists, and report the falsifying example the framework prints.
```

**The shared search section**, in all fourteen, immediately before `## Honest status (shared rule)`:

```markdown
## Searching the repository (shared rule)

Build every list of call sites, readers, writers or occurrences with Grep over the whole repository, never only from the files you happened to open, and read each match before you count it. Under any claim that nothing else in the repository does something, cite the search that shows it: the pattern, the path searched and how many files matched. A match shows where a name is written, not that the code runs.
```

### The test edits — `tests/agent-tool-grants.test.js`

Remove the fourteen `testing/*` keys from `DEBT`; lower `MAX_DEBT` by 14. Remove `testing/coverage-mapper` and `testing/smart-test-runner` from `WRITE_EDIT_DEBT` (each now holds Write and Edit together); lower `MAX_WRITE_EDIT_DEBT` by 2. `HELD_REMOVALS` is unchanged: `'testing/quality-gate-runner': ['Task']` stays until slice 11. Lower `MAX_DEBT` by 14 and `MAX_WRITE_EDIT_DEBT` by 2 in `tests/agent-tool-grants-maxima.test.js` (`CEILINGS`) as well, in the same change, because each maximum there must equal its ceiling.

### Wiring — the live call sites

No module is added. CTO Chief dispatches these agents at Steps 8 and 14 (`agents/coordinator/cto-chief.md`). This slice changes what they may do, not whether they are reached.

### Security review

- `quality-gate-runner` keeps Task until slice 11, by the owner's answer; it holds no web tool, so the safety floor holds. Whether a dispatched agent can launch another agent at all is read at slice 11's Step 9.
- Edit for the two cache writers adds no reach beyond their Write.

### Acceptance criteria

1. The twelve changed tools lines read as in the table; `playwright-qa`'s and `quality-gate-runner`'s are unchanged.
2. `property-test-writer` carries its run order; `quality-gate-runner`'s Task section is untouched.
3. All fourteen carry the shared search section and are out of `DEBT`; `coverage-mapper` and `smart-test-runner` are out of `WRITE_EDIT_DEBT`; `MAX_DEBT` and `MAX_WRITE_EDIT_DEBT` are lowered by 14 and 2 in both test files.
4. `npm run lint`, `npm run typecheck` and `npm test` pass, zero skipped.

## Decisions Taken Under Ambiguity

1. **`quality-gate-runner` is not "the quality gate" of rule 4**: that is `agents/quality/quality-gate.md` (name `quality-gate`), which keeps Task.
2. **`property-test-writer` keeps Bash by gaining a run order** rather than losing Bash: a test writer that never sees red is not test-first, and its sibling `unit-test-writer` already carries the same order.
3. **The cache writers' whole-file writes stay**: a regenerated cache is a deliberate whole replacement, which rule 1 allows; Edit is added for partial changes.
4. **The owner's answer (1), 2026-10-05, option (a):** "Approve the additions and the six safety fixes now; hold the removals until each is checked in a real run." `quality-gate-runner`'s loss of Task is held (slice 11); every other change here is an addition and goes ahead.
5. **The Task section's replacement is held with the Task tool**, not made now: the replacement says "This agent holds no Task tool", which would be false while Task is held, and a measured run must see the agent's orders as they are to show whether it uses Task.

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation: the test edits above
- [ ] Test error conditions: the failure messages name each agent and each wrong tool; none names `quality-gate-runner`'s held Task
- [ ] Run tests - expect RED (failing): `node --test tests/agent-tool-grants.test.js`, recorded

### Step 9: PREPARE
- [ ] Install dependencies if needed: none
- [ ] Check prerequisites: fingerprint the fourteen files; confirm each `old_string` occurs exactly once
- [ ] Verify dev environment ready: record the Node version
- [ ] Create directories/config if needed: none

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements: the twelve changed tools lines, `property-test-writer`'s run order, the fourteen search sections — every change by `Edit` after a `Read`
- [ ] Add error handling: none
- [ ] Wire up integration points: none new

### Step 11: REVIEW
- [ ] Self-review all new code: through CTOC's review agent
- [ ] Verify integration points work together: `tests/unexecutable-instruction-fence.test.js` passes
- [ ] Check error handling completeness: n/a

### Step 12: OPTIMIZE
- [ ] Remove redundant operations: none (the Task section is held, slice 11)
- [ ] Optimize critical paths: none
- [ ] Simplify complex code: none

### Step 13: SECURE
- [ ] Validate inputs (no path traversal): through CTOC's security scan agent, confirm no testing agent other than `quality-gate-runner` (held) holds Task, and none holds a web tool
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
