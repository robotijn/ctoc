---
iron_loop_verdict: true
iron_loop: true
title: "Agents that hold the shell can search on every platform, slice 2: the three agents whose files the improvement run holds"
type: implementation
created: 2026-10-06
priority: high
effort: small
parent_plan: agents-that-hold-the-shell-search-with-it
depends_on:
  - agents-that-hold-the-shell-search-with-it
  - agents-get-smaller-rollout-s7-llm-security-tester
  - agents-get-smaller-rollout-s11-hallucination-detector
  - 00264-every-agent-and-specialist-skill-improved-three-times-s4-hallucination-detector
  - 00265-every-agent-and-specialist-skill-improved-three-times-s5-llm-security-tester
  - 00266-every-agent-and-specialist-skill-improved-three-times-s6-dependency-analyzer
files:
  - agents/ai-quality/llm-security-tester.md
  - agents/ai-quality/hallucination-detector.md
  - agents/architecture/dependency-analyzer.md
  - tests/agent-tool-grants.test.js
  - tests/agent-tool-grants-maxima.test.js
approved_by: human
approved_at: 2026-10-06T20:25:48.802Z
gate_crossed: implementation → todo
---

# Agents that hold the shell can search on every platform, slice 2

## Problem statement

The parent plan (read it first) found seven agents that hold Bash but are ordered to search with a Grep or Glob tool that Claude Code's native builds for macOS, Linux and WSL do not give them. The parent fixes four of them. These three were held back because improvement-run plans own their files (CTO Chief, 2026-10-06):

- `llm-security-tester`: its hidden-character scan is ordered "with the Grep tool", and its Bash is limited to the lookup. The scan ran in none of 8 test runs.
- `hallucination-detector`: "You read and search with Read, Grep and Glob. You use Bash only for the read-only registry queries".
- `dependency-analyzer`: nine `Glob("**/*.ts")`-style calls, and "not with the Grep tool… use Grep only to spot-check".

All three need Bash, so all three get option (b), the fallback sentence.

## Technical approach

Each agent gets the parent's `SEARCH_WITHOUT_THE_TOOLS` sentence verbatim, as an addition only, so the compaction rule inventories of rollout slices 7 and 11 keep their anchors. Placement:
- llm-security-tester: after the paragraph ending "with Read, Grep and Glob.".
- hallucination-detector: after the Role sentence ending "to fill `completed_at`.".
- dependency-analyzer: under the Step 1 heading.

Each agent is then removed from `SEARCH_FALLBACK_DEBT`. The list goes from 3 to 0, and `MAX_SEARCH_FALLBACK_DEBT` goes to 0 in both test files, so check 15 now covers all seven.

llm-security-tester's patterns use `\x{…}` escapes, so its fallback depends on the embedded `grep` accepting `-P`. The sentence already allows that flag. It searches `.` and keeps only the matches in the files under review, so no file name from the material under review becomes part of a Bash command.

**Wiring.** The agents are live on their next dispatch. Check 15 runs in `npm test`.

## Acceptance criteria

- [ ] Removing the three debt entries first turns check 15 red, naming exactly these three.
- [ ] Each of the three carries the sentence verbatim; no other sentence is removed or reworded.
- [ ] `SEARCH_FALLBACK_DEBT` is empty, and both files state its maximum as 0.
- [ ] `npm test` is green, with the compaction tests of slices 7 and 11 and the improvement-record test included; 0 failed, 0 skipped.
- [ ] Measured on a native build: the llm-security-tester smoke run against the planted hidden-character fixture reports the character by file and line. The hallucination-detector smoke run lists the imports it found. If the build has the Grep tool, the report says the fallback was not exercised, never that it passed.

## Execution Plan

### Step 8: TEST
- [ ] Empty `SEARCH_FALLBACK_DEBT` and set its maximum to 0 in both test files. Run `node --test tests/agent-tool-grants.test.js tests/agent-tool-grants-maxima.test.js`: check 15 must be red, naming exactly the three.

### Step 9: PREPARE
- [ ] Record `claude --version`, the install kind, and `grep --version` from the executor's Bash.
- [ ] In a folder made with `mktemp -d`, write a line holding U+200B, and confirm `grep -rnP -e '[\x{200B}]' -- '<folder>'` finds it.
- [ ] If `grep` is not the embedded `ugrep`, or it rejects `-P` or `\x{…}`: stop and ask through the scope-growth question.

### Step 10: IMPLEMENT
- [ ] Insert the sentence in the three agent files at the named places.

### Step 11: REVIEW
- [ ] The critic checks that the sentence widens neither llm-security-tester's rule that no string from the material under review becomes part of a Bash command, nor hallucination-detector's network scope.

### Step 12: OPTIMIZE
- [ ] Nothing beyond the sentence: confirm no duplicate insertion.

### Step 13: SECURE
- [ ] The security scanner checks that the `-P` patterns and the `.` path take nothing from the material under review.

### Step 14: VERIFY
- [ ] `npm test` passes: lint, all tests, coverage at or above the floor in `.ctoc/coverage-baseline.json`, 0 skipped.
- [ ] The executor names the headless smoke runs of rollout slices 7 and 11 for the owner to run on the native build. Their output must show that the search ran.

### Step 15: DOCUMENT
- [ ] Update the comment on `SEARCH_FALLBACK_DEBT`: it is empty since this slice.

### Step 16: FINAL-REVIEW
- [ ] Every acceptance box is checked against its evidence. The smoke-run results are quoted, not summarised.

## Decisions Taken Under Ambiguity

1. **This slice depends on compaction slices 7 and 11 as well as improvement-run plans 00264, 00265 and 00266**, because it edits the agents all five touch. The parent slice edits none of them, so it carries no such dependency.
2. **This slice empties the parent's debt list rather than redefining check 15**, following the file's only-shrinks convention.


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
