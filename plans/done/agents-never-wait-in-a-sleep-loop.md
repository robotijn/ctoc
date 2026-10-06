---
iron_loop_verdict: true
iron_loop: true
title: "Agents never wait in a sleep loop"
priority: high
depends_on: claude-md-gets-small-and-keeps-every-rule
files:
  - "agents/iron-loop/iron-loop-executor.md"
  - ".ctoc/templates/operating-lessons.md"
  - "tests/agents-never-wait-in-a-sleep-loop.test.js"
  # The project's own lessons copy is not refreshed by a build (only by /ctoc:update
  # run in this repository, through src/lib/claude-md-lessons.js ensureLessonsBlock),
  # so it is edited in the same change. It also carries the test-file count.
  - "CLAUDE.md"
approved_by: human
approved_at: 2026-10-06T17:51:25.614Z
gate_crossed: review → done
---

# Agents never wait in a sleep loop

## Problem statement

From 18 August to today CTOC agents spent 412 of 1,045 agent-hours (39%) in loops that sleep and then check a log, an output file or a marker for a background build or test (measured from real transcripts, `.ctoc/audit/speed-and-size/benchmarks/WHERE-THE-HOURS-GO.md`). Nearly all of it is the build agent working in users' projects. Only 17% of that time waited on a job that was still running; at least 22% kept checking after the job had finished, and 8% waited on jobs that never finished. No CTOC instruction tells agents to poll. It is a model habit: start a long job in the background, then sit in a foreground sleep-and-check loop, during which the finish notice cannot reach the agent.

Verified on 2026-10-06: an agent dispatched in the background that starts a command with `run_in_background` and ends its turn is woken about 3 seconds after the command finishes (45-second job, re-invoked 3 seconds after it ended); the Claude Code documentation says "A command that a foreground subagent started stops when that subagent's run ends"; the foreground Bash timeout can be set up to 600,000 milliseconds (10 minutes).

## The rule (this exact sentence, in every place it ships)

> To wait for a long build or test, run it in the foreground with a timeout long enough for it, up to 10 minutes; if it can take longer and you were dispatched in the background, start it with run_in_background and end your turn — you are woken when it finishes; never wait in a loop that sleeps and checks a file, log or marker.

## Technical approach

The rule sentence ships as plain text in three places: a short section in the build agent's definition (`agents/iron-loop/iron-loop-executor.md`), a new numbered lesson in the lessons template (`.ctoc/templates/operating-lessons.md`) that `/ctoc:update` copies into every user project's CLAUDE.md, and the same lesson in this repository's `CLAUDE.md`. No code changes. One `node:test` file reads the three files and asserts each contains the sentence byte for byte; it proves the instruction ships, not that a model obeys it.

## Acceptance criteria

1. `agents/iron-loop/iron-loop-executor.md` has one short section, "Waiting for a long build or test", holding the rule sentence plus one line of why (a sleep-and-check loop keeps the finish notice from reaching you; a background command started by a foreground agent dies when that agent's run ends).
2. `.ctoc/templates/operating-lessons.md` has one new numbered lesson, the next number after the last one present when this builds, inside the managed block markers, holding the rule sentence. Every user project's CLAUDE.md lessons block then carries it to every subagent on the next `/ctoc:update`.
3. This repository's `CLAUDE.md` lessons copy carries the same lesson, and its test-file count rises by one.
4. `tests/agents-never-wait-in-a-sleep-loop.test.js` checks that the exact rule sentence is present in all three files. Its name and header say what it proves and what it does not: the instruction ships; it cannot prove a model obeys it.
5. `npm test` passes with the coverage floor and zero skipped.

## Decisions Taken Under Ambiguity

- The lesson number is taken at build time, after `claude-md-gets-small-and-keeps-every-rule` has rewritten both lesson files; the test matches the sentence, never the number.
- A foreground agent whose job can run past 10 minutes is not covered by the rule. The executor section tells it to split the job (for example, run test files in groups) or return to its caller saying so, never to poll.

## Execution Plan

### Step 8: TEST
Write `tests/agents-never-wait-in-a-sleep-loop.test.js` (`node:test`): read the three files with `path.join` from the repository root and assert each contains the exact rule sentence (a missing file fails loudly). Run it; see it fail on all three.

### Step 9: PREPARE
Confirm the dependency has landed. Read the current lesson numbering in both lesson files and the test-file count in `CLAUDE.md`. Check whether an existing test compares the template block with this repository's copy; if one does, keep the two identical.

### Step 10: IMPLEMENT
- `iron-loop-executor.md`: add the section from criterion 1.
- `operating-lessons.md`: add the lesson from criterion 2 inside the markers.
- `CLAUDE.md`: add the same lesson to its lessons copy; raise the test-file count by one.

### Step 11: REVIEW
The sentence is byte-identical in all three places; plain words, no gate numbers, no invented labels; nothing else in the touched files changed.

### Step 12: OPTIMIZE
Cut the executor section to the sentence plus its one line of why.

### Step 13: SECURE
Text-only change; confirm no paths, user names or transcript content were copied into shipped files.

### Step 14: VERIFY
Run `npm test`: all tests pass, coverage at or above the floor in `.ctoc/coverage-baseline.json`, zero skipped. Add one line to `.ctoc/audit/speed-and-size/benchmarks/RESULTS.md` (allowed by the `.ctoc/` whitelist, not declared in `files:`): the after-numbers come from rerunning `node .ctoc/audit/speed-and-size/benchmarks/pipeline-time.js` on transcripts from after the release, reported as polling hours per month.

### Step 15: DOCUMENT
The lesson and the executor section are the documentation. Name the release in the commit message with its version.

### Step 16: FINAL-REVIEW
Every acceptance criterion maps to a passing assertion or a visible line in a shipped file; the human is told plainly that the test proves the instruction ships, not that agents follow it, and that only the rerun benchmark can show that.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Test error conditions — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Run tests - expect RED (failing) — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).

### Step 9: PREPARE
- [x] Install dependencies if needed — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Check prerequisites — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Verify dev environment ready — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Create directories/config if needed — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Add error handling — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Wire up integration points — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).

### Step 11: REVIEW
- [x] Self-review all new code — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Verify integration points work together — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Check error handling completeness — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).

### Step 12: OPTIMIZE
- [x] Remove redundant operations — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Optimize critical paths — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Simplify complex code — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Sanitize outputs — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] No secrets in code — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Safe file operations — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).

### Step 14: VERIFY
- [x] Run lint + type check — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Run ALL tests (TDD Green) — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Check coverage >= 80% — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] 0 skipped, 0 flaky tests — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).

### Step 15: DOCUMENT
- [x] Update relevant documentation — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Add JSDoc comments to new functions — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Update CHANGELOG if needed — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] All quality checks passed — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Manual verification if needed — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Ready for human review — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record (Steps 8–16)

Built 2026-10-06 by iron-loop-executor, after `claude-md-gets-small-and-keeps-every-rule` in the same session. The checkboxes above are left untouched because the Execution Plan sections are inside the approval hash; this record carries the status.

- [x] Step 8 TEST — `tests/agents-never-wait-in-a-sleep-loop.test.js`: three cases, one per file, exact sentence; seen red on all three.
- [x] Step 9 PREPARE — dependency landed in this session (lessons 1–19 in both lesson files, CLAUDE.md 14,449 bytes, 550 test files). `tests/claude-md-keeps-every-rule.test.js` compares the template block with CLAUDE.md's, so both got the identical lesson.
- [x] Step 10 IMPLEMENT — executor section "Waiting for a long build or test" (sentence + one line of why + the over-10-minutes foreground case); lesson 20 in the template and in CLAUDE.md; `node src/scripts/release.js` moved the test-file count 550 → 551.
- [x] Step 11 REVIEW — sentence byte-identical in all three files (the test checks it); no gate numbers, no invented labels.
- [x] Step 12 OPTIMIZE — section kept to the sentence and its why.
- [x] Step 13 SECURE — text only; no paths, user names or transcript content.
- [x] Step 14 VERIFY — `npm test`: 12,158 tests, 12,158 passed, 0 failed, 0 skipped, coverage 99.9% (floor 99), gate PASS; lint 0 warnings. CLAUDE.md 14,815 bytes, under the 15,000 ceiling. RESULTS.md line added; the after-number awaits the benchmark rerun on post-release transcripts.
- [x] Step 15 DOCUMENT — the lesson and the executor section are the documentation.
- [x] Step 16 FINAL-REVIEW — criteria 1–5 hold. The test proves the instruction ships, not that agents follow it. Not completed through the menu: no task exists for this plan and it was never moved to `in-progress/`.

### Decisions taken during execution

1. **README.md's test-file count line also moved (550 → 551)**, written by `release.js`. README.md is not in this plan's `files:`; it is in the companion plan `claude-md-gets-small-and-keeps-every-rule`, built in the same session and uncommitted. Without it `tests/readme-numbers.test.js` fails on the derived test-file count. Flagged for the human.

### Review fix pass (2026-10-06)

Lesson 20 unchanged; lessons 13, 14, 17 and the methodology paragraph were adjusted in both lessons blocks by the companion plan's review fixes, byte-identical. `tests/agents-never-wait-in-a-sleep-loop.test.js` still passes in all three files; `npm test`: 12,159 tests, 0 failed, 0 skipped, coverage 99.9%, gate PASS. CLAUDE.md 14,952 bytes.
