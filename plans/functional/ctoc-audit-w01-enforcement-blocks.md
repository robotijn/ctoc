---
title: "W01 — Enforcement Actually Blocks"
created: "2026-07-11T00:00:00Z"
type: stub
parent_vision: "vision/ctoc-self-audit-remediation.md"
priority: HIGH
status: stub
depends_on: none
---

# W01 — Enforcement Actually Blocks

## Problem

The PreToolUse enforcement layer — CTOC's entire reason to exist — signals a block but
never actually stops a tool call. Three verified defects, all load-bearing:

- **C1 — Wrong exit code.** The PreToolUse hooks signal "block" with `process.exit(1)`.
  The Claude Code harness only blocks a tool call on `exit(2)` ("Exit code 2 — show
  stderr to model and block tool call", verified from the CLI binary). So every
  plan-coverage block, secret-file block, and irreversible-command block prints its
  message to the model and then **the edit proceeds anyway**. Every block is cosmetic.
- **C2 — Bash gate reads a nonexistent variable.** The Bash gate reads
  `process.env.CLAUDE_TOOL_INPUT` to get the command. That variable does not exist —
  the tool payload arrives on **stdin**. The gate therefore always sees an empty
  command and allows everything: `rm -rf`, a raw `mv` of a plan into `plans/done/`, a
  commit before Step 15.
- **C3 — MultiEdit/NotebookEdit enforce nothing.** `PreToolUse.MultiEdit.js` and
  `PreToolUse.NotebookEdit.js` `require()` `PreToolUse.Edit.js` to reuse its logic, but
  Edit.js only runs its enforcement under `require.main === module` — which is false
  when the sibling hook is the entry point. So MultiEdit and NotebookEdit run the
  require for its side effects and enforce nothing.

**This workstream is the TECHNICAL PREREQUISITE for observing W02 and W08.** Until a
deny actually blocks the tool call, a gate-bypass fix (W02) or a self-disable fix (W08)
cannot be *seen* to fire — a test that "the hook decided to deny" is not evidence the
tool was stopped. W01 makes deny observable; W02 and W08 then prove their bypasses are
closed against real blocking.

## Scope

**Fixes:** Make a deny actually stop the tool call across every editing tool and the
Bash gate.
- Replace `process.exit(1)` on the deny path with the harness's real block protocol —
  either `process.exit(2)` (stderr shown to model, tool blocked) or the stdout JSON
  `{ "hookSpecificOutput": { "permissionDecision": "deny", ... } }` protocol. Pick ONE
  and apply it identically in every PreToolUse hook so behavior is uniform.
- Make the Bash gate read the tool payload from **stdin**, not
  `process.env.CLAUDE_TOOL_INPUT`, and parse the command out of it.
- Extract the shared enforcement into an exported `enforce()` function in Edit.js (not
  gated behind `require.main === module`), and make MultiEdit/NotebookEdit **call**
  `enforce()` with their own payload shape.

**Does NOT touch:** the gate-integrity / approval-provenance / revert-loop logic (that
is W02) — W01 only makes the block mechanism fire; it does not change *what* is decided.

## Story Map

**Goal:** A PreToolUse deny provably prevents the tool call, uniformly across Edit,
Write, MultiEdit, NotebookEdit, and the Bash gate.
- **Actor:** every CTOC user running with permission prompts disabled
  (`--dangerously-skip-permissions`), for whom the hooks are the only guardrail.
- **Impact:** an uncovered / secret / irreversible operation is actually stopped, not
  merely narrated.
- **Success metric:** a test drives an uncovered edit through the real hook contract and
  asserts the operation was PREVENTED (not that the hook returned a value); passes for
  all five editing/command surfaces.

### Activity 1: Signal a real block (deny mechanism)
- [ ] `[MVP]` As a CTOC user, I want a PreToolUse deny to actually stop the tool call,
  so that an uncovered edit is prevented rather than printed-and-allowed.
  - Chooses the block protocol (exit 2 or `permissionDecision:"deny"` JSON) and applies
    it on the deny path of one hook end-to-end.
- [ ] As a maintainer, I want every PreToolUse hook to use the *same* block protocol, so
  that enforcement is uniform and one hook cannot silently no-op while another blocks.

### Activity 2: Bash gate reads the real payload
- [ ] `[MVP]` As a CTOC user, I want the Bash gate to read the command from stdin, so
  that a dangerous command (`rm -rf`, raw `mv` into `plans/done/`, premature commit) is
  actually inspected and blocked instead of seen as empty and allowed.

### Activity 3: MultiEdit/NotebookEdit enforce identically
- [ ] `[MVP]` As a CTOC user, I want MultiEdit and NotebookEdit to run the same
  enforcement as Edit, so that an uncovered multi-edit or notebook edit is blocked
  exactly like a single Edit.
- [ ] As a maintainer, I want the shared enforcement exposed as an exported `enforce()`
  (not gated on `require.main === module`), so that sibling hooks invoke it directly and
  it cannot silently disappear when a sibling is the entry point.

## Rough acceptance criteria

- Given an Edit to a file covered by no active plan and no escape phrase, When the
  PreToolUse hook runs under the real harness contract, Then the Edit is actually
  PREVENTED (the harness receives exit 2 or `permissionDecision:"deny"`), not allowed.
- Given a Bash command `rm -rf plans` delivered on stdin (the real transport), When the
  Bash gate runs, Then the command is inspected and denied — not treated as empty and
  allowed.
- Given the Bash gate under the old contract (`process.env.CLAUDE_TOOL_INPUT` unset),
  When it runs, Then it MUST NOT allow-by-default from an empty command; the test fails
  if a dangerous command slips through.
- Given a MultiEdit and a NotebookEdit to an uncovered file, When each hook runs, Then
  each is PREVENTED identically to the equivalent single Edit (same decision, same
  block signal).
- Given `enforce()` imported directly (sibling as entry point), When called with an
  uncovered target, Then it returns/emits a deny — proving enforcement does not depend
  on `require.main === module`.
- Given a plan-covered edit (declared in an active plan's `files:`), When any of the
  five surfaces runs, Then the edit is ALLOWED — the block is precise, not blanket.

## Findings addressed

C1, C2, C3.

## INVEST status

- Deny-mechanism story: Independent (no other workstream needed), Valuable (blocks fire),
  Small (one deny path), Testable (assert tool prevented). PASS.
- Uniform-protocol story: depends on the deny-mechanism story landing first; Negotiable
  on exit-2 vs JSON; Testable per-hook. PASS after MVP.
- Bash-stdin story: Independent of the Edit path, Valuable (commands inspected), Testable
  (dangerous command denied). PASS.
- MultiEdit/NotebookEdit MVP story: depends on `enforce()` export; Valuable, Small,
  Testable (parity with Edit). PASS.
- `enforce()` export story: enabling story for the MultiEdit MVP; Testable via direct
  import. PASS.

## Decisions Taken Under Ambiguity

- No Business Model Canvas exists at `plans/canvas/ctoc-self-audit-remediation.md`, and
  none is applicable: this is a TECHNICAL remediation workstream, not a product/market
  concern. Proceeded vision-only rather than kicking back.
- Block protocol (exit 2 vs stdout `permissionDecision:"deny"` JSON) is left as a single
  choice to be made once in implementation and applied uniformly; the vision success
  criterion accepts either. Recorded as a negotiable in the uniform-protocol story rather
  than pre-deciding here — both satisfy "the tool is actually prevented".
- Walking Skeleton chosen as: one real block on Edit + Bash-stdin fix + MultiEdit/
  NotebookEdit parity — the thinnest end-to-end slice that makes a deny observable on
  every surface, which is what W02/W08 depend on.
