---
iron_loop_verdict: true
iron_loop: true
title: "Deepthink is run for real in a disposable project on a decision question, a source and an open topic, and the whole plan's closing checks pass"
type: implementation
parent_plan: deepthink-ships-with-ctoc
depends_on: 00399-deepthink-ships-with-ctoc-s3-three-improvement-rounds
priority: medium
effort: medium
# This slice changes no repository file. Its evidence goes into its own execution
# record (plan files are always writable); the runs write only inside a disposable
# project outside this repository.
files: []
approved_by: human
approved_at: 2026-09-30T11:39:25.426Z
gate_crossed: implementation → todo
---

# Deepthink is run for real in a disposable project on a decision question, a source and an open topic, and the whole plan's closing checks pass

**Scope (one line):** follow the finished skill, as this repository holds it, in a disposable CTOC project outside this repository on one real decision question, one source and one open topic; record everything the parent says must be observed; then run the closing checks of the whole plan and the full gate.

Read the parent plan in full first, then slices 1 to 3 and their execution records: this slice compares against the fingerprints slice 1 recorded and checks the failing runs each slice recorded.

## Implementation Details

### Why the skill is followed from the repository copy

`/ctoc:deepthink` exists in a session only after the human ships and CTOC is installed from the marketplace; installing from a local path is forbidden. So the build's session reads `skills/deepthink/SKILL.md` from this repository and carries out its text step by step, exactly as a session does when the command is typed, with the disposable project as the project. The report says this in plain words and never describes the run as a typed command. The build executor holds no subagent-launch tool, so the dispatching session launches `citation-validator` and the executor does every write and every command, as the skill's "who does what" allows for a build step.

### The disposable project

Under `os.tmpdir()`, outside this repository: a package file and one source file. CTOC's first run there sets up its `.ctoc/` (this repository's entry point, run with the disposable project as the working directory); enforcement stays at its default, strict; no plan covers `.ctoc/papers/` or `plans/vision/deepthink/`. Before the first run and after the last, two listings with fingerprints: every file of the disposable project, and this repository's `plans/` and `.ctoc/` (append-only logs excluded). A change to this repository caused by the runs fails the slice.

```
node <this repository>/src/commands/start.js
```

### Run 1 — a real decision question

The builder writes one decision question it genuinely faces in the decision-question format (heading, explanation, matrix, lettered menu), records it verbatim, and follows the skill with no argument. Recorded:

- **Scenario 4:** the task recorded first (`menu task add discuss`) and the scheduler's decision; the launch, with the tool name the session used and whether it was allowed; the one sentence, only after the launch; the brief file with its `in progress` header; the finished file, larger than two kilobytes and no longer saying `in progress`.
- **Scenario 5:** a listing with sizes of `.ctoc/papers/<topic>/`, each file's first bytes, the run's block in `.ctoc/papers/index.md` with its rows and its "Web sources cited, not papers" list, and every `[paper not fetched]` entry with its line under Failures.
- **Scenario 6:** the file check run before any notice, and the one line exactly as shown; the researched result presented in full when asked for.
- **Scenario 9:** every directive found in fetched content, named under Failures and not followed (or the observation that none was found); the fixed program's refusal of an address that is not `https`, run once on a separate staging list in the disposable project and recorded apart from the real run's list, which is never altered.
- **Scenario 10:** the before-and-after listing of the disposable project. Only the brief, the files under `.ctoc/papers/` and CTOC's own bookkeeping changed — the task registry entry, the dispatch record, the plan-index store and the logs under `.ctoc/logs/`, each change named; no plan moved; no approval marker written; no source file touched.
- **Scenario 11:** the disposable project's `.ctoc/logs/enforcement.json` shows every write allowed, with no escape phrase typed and no blocked write. A refused write, if one happens, is named under Failures and returned upstream as a finding; it is never worked around.
- **Scenario 12:** on a temporary root, driven for real, the dashboard's vision count and the stale-plan scan's possibly-stale count, with and without the brief, are equal; the plan-index hook fires for the brief, and the brief is not among the related, duplicate or conflicting plans returned for any real plan.
- **Scenario 19:** the registry entry of kind `discuss` and its label; the task board's output while the reading agent works; the entry closed as done or failed after the run; and what the reconcile did with a `discuss` entry that has no plan behind it, observed by opening the dashboard after the run.
- **Scenario 22:** the researched question's shape matches its kind — exactly one Recommended cell on a quality decision, none on an owner decision; the long-run line, or `no clear answer:` with its reason.

### Runs 2 and 3 — a source and an open topic

Scenario 8 cannot come from a decision-question run: its two premises are a source and a topic, although the parent's Definition of Done groups it with the one run. So two more runs follow the first, one at a time: one source to mine (a public paper by its arXiv identifier, or a public repository) and one open topic. Each is checked for its sections — "What they do", "What of it improves this project", "What does not transfer and why", a researched question per real choice and "Derived, no question needed" for the source; "What the evidence says", "Principles to act on", "What is contested or unverified" and any real choices as questions for the topic — and for scenarios 5, 9, 10 and 11 once more.

### Scenario 7 — a refused launch

The launch fence, `src/hooks/PreToolUse.Task.js`, is wired in `.claude-plugin/hooks.json` with the matcher `Task`, while the dashboard's recipes write the launch as `Agent(run_in_background)`; whether the fence sees the launch the session actually makes was not read. Where the build can arrange five background subagents in flight, a deepthink launch is attempted and its outcome recorded. Refused: the waiting-for-a-slot line, the task failed or left queued, and no brief file. Not refused: a finding, returned upstream with the tool name the session used, never worked around. Where five cannot be arranged, the report says so plainly, and the scenario rests on the skill's stated handling, which slice 2's test checks.

### The closing checks of the whole plan

1. **Scenario 16:** the fingerprints of the human's two personal files equal those slice 1 recorded before its first edit, and none of the build's commands named a path under `/Users/account/.claude/` or `/Users/account/.claude-skills/` as a write target.
2. **Scenario 21:** git's record of this plan's commits, read only, touches none of `.ctoc/audit/agent-and-skill-improvement/inventory.json`, `plans/implementation/every-agent-and-specialist-skill-improved-three-times.md` and `tests/agent-and-skill-improvement-record.test.js`. Their fingerprints are compared with slice 1's; a difference is attributed to the commit that made it — the improvement run's own closing slice changes its record check, and builds of other plans may run between this plan's slices. `tests/agent-and-skill-improvement-record.test.js` passes with deepthink's record present in its sibling directory.
3. **Scenario 3:** whether `/ctoc:deepthink` was seen, next to `/ctoc:ask-me-questions`, in a fresh session after a marketplace install. Unless the human has shipped and it was seen, the report says in plain words that the listing has not been observed.
4. **The Definition of Done:** slices 1 to 3 each recorded their own checks failing before their first other edit; scenarios 1, 2, 13 to 18 and 21 pass as tests or as recorded output; scenarios 4 to 12, 19 and 22 are recorded above; deepthink's three rounds are recorded; the improvement run's inventory, plan and check are unchanged by this plan.
5. **Scenario 17, the whole gate:** `npm test` — zero failures, zero skipped, coverage at or above the floor read from `.ctoc/coverage-baseline.json`. One commit carrying a patch version by the release rule; nothing pushed.

### A defect found here goes upstream

If a run shows the skill wrong — a write refused, a notice before its check, a shape missing, the fence not seeing a launch — the finding is returned upstream to the slice that owns the text (slice 2, or slice 3 for wording its rounds changed) and this slice stops. The skill is never patched here: an unrecorded edit would fail slice 3's check that the last round's fingerprint equals the file on disk, and it would bypass the rounds. This is the parent's rule that a choice that cannot hold is returned upstream, never routed around.

### Wiring — the live call sites

No module is added. The runs exercise the live entry points the skill names: the skill text itself, `node <…>/src/commands/start.js menu task …`, the launch fence and the edit hook.

### Security review

- The disposable project lives under the temporary directory and is removed after the evidence is recorded; nothing is downloaded into this repository.
- No secret enters the evidence; absolute paths in recorded output are shortened to placeholders.
- Every fetched page and downloaded paper is data; nothing downloaded is opened, run or followed.

### Acceptance criteria

**Closes scenarios 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 17, 19, 21 and 22** of the parent.

**Closes six Definition of Done items:** the test written first and seen failing (checked across slices 1 to 3); scenarios 1, 2, 13 to 18 and 21 pass as tests or recorded output; scenarios 4 to 12, 19 and 22 recorded from real runs, with scenario 7 as described above; deepthink's three rounds recorded and the improvement run's inventory, plan and check unchanged; scenario 3 observed after shipping or said plainly not to be; `npm test` passes.

## Decisions Taken Under Ambiguity

1. **The skill is followed from the repository copy**, because the command cannot be typed before the human ships and a local install is forbidden.
2. **Three runs, not one.** The Definition of Done asks for one run on a decision question, and also counts scenario 8, whose premises are a source and a topic; one run per kind is the smallest set that observes all of it. The runs go one at a time, each taking one of the five subagent slots.
3. **Scenario 10's "only the brief, the papers and the task record changed" counts CTOC's own bookkeeping as the task record**: the registry entry, the dispatch record the skill writes by the dispatch protocol, the plan-index store and the logs. Each is named in the evidence; anything else that changed fails the scenario.
4. **Scenario 21 is measured by this plan's own commits**, and the fingerprints are compared with each difference attributed. Between this plan's first slice and its last, other plans' builds run on the same tree, so equal fingerprints alone could fail for a reason that is not this plan's.
5. **A defect goes upstream**, for the reason above.
6. **No files are declared**, because this slice writes nothing in the repository but its own plan.


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


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
