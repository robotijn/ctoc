---
title: "W01 — Enforcement Actually Blocks"
created: "2026-07-11T00:00:00Z"
type: feature
parent_vision: "vision/ctoc-self-audit-remediation.md"
priority: HIGH
depends_on: none
---

# W01 — Enforcement Actually Blocks

## 1. ASSESS — Problem Understanding

### Business Context

CTOC's PreToolUse enforcement layer is its entire reason to exist: the four human
gates (vision→functional, functional→implementation, implementation→todo,
review→done) and the plan-coverage/secret-file/irreversible-command blocks all rest
on the assumption that a "deny" decision actually stops the tool call. That
assumption is false for the population the layer exists to protect: **every CTOC
user running with permission prompts disabled
(`--dangerously-skip-permissions`)**, for whom Claude Code's own native
confirmation dialog is gone and CTOC's PreToolUse hooks are the *only* remaining
guardrail. A cosmetic block is strictly worse than no enforcement at all — the
terminal prints "BLOCKED", the human trusts it, and the edit, the secret-file
write, or the `rm -rf` proceeds anyway. This is precisely the failure mode the
parent vision names: a 5485-green test suite that "certifies the broken state"
because it asserts structure (a function returned, a string was printed), never
truth (the tool call was actually prevented).

### Current State

Three verified defects, confirmed by direct inspection of the current code on
2026-07-11 (all citations are file:line against the code as it stands today, not
the audit's original snapshot — the code has moved since the audit, and one
defect (C3) is now compounded rather than fixed, see below):

- **C1 — Wrong block signal, used everywhere a hook denies.**
  `PreToolUse.Edit.js`'s `block()` function calls `process.exit(1)` at
  **`src/hooks/PreToolUse.Edit.js:141`**. Claude Code's harness blocks a tool call
  only on exit code 2 ("show stderr to model and block tool call" — verified from
  the CLI binary by the parent audit); exit 1 shows the message and lets the tool
  proceed. `PreToolUse.Write.js` delegates to this same `block()` via the exported
  `enforce()` (see C3 below for why that delegation matters), so the same wrong
  signal covers Write too. **The identical wrong-signal pattern is independently
  present in `PreToolUse.Bash.js`, at all five of its own block sites**:
  `src/hooks/PreToolUse.Bash.js:336` (irreversible-command block),
  `:363` (raw plan-file `mv`/`cp` block), `:376` (premature-commit block),
  `:388` and `:395` (write-before-Step-8 blocks). None of these six call sites
  emits a signal the harness recognizes as "block".

- **C2 — Bash gate reads a variable the harness never sets.**
  `getCommand()` in `src/hooks/PreToolUse.Bash.js:268-269` reads
  `process.env.CLAUDE_TOOL_INPUT` (`const toolInput = process.env.CLAUDE_TOOL_INPUT
  || '';` at line 269). That environment variable is never populated by the
  harness — the tool payload arrives on **stdin** as JSON (the same contract
  `PreToolUse.Edit.js` already reads correctly via `readStdinJson()` at
  `src/hooks/PreToolUse.Edit.js:84-89`). `getCommand()` therefore always returns
  `''`, and `main()`'s very first check — `if (!command) { process.exit(0); }` at
  `src/hooks/PreToolUse.Bash.js:320-322` — allows every Bash command
  unconditionally before any pattern match runs.

  **C1 and C2 must land together for the Bash gate to work at all.** Fixing C2
  alone (read stdin) without C1 (real block signal) still allows every dangerous
  command — the gate would correctly *detect* `rm -rf` but its `process.exit(1)`
  would still be cosmetic. Fixing C1 alone without C2 still allows every dangerous
  command — the gate never sees a real command to evaluate in the first place.
  This is a single combined defect in one file, not two independently shippable
  fixes.

- **C3 — MultiEdit/NotebookEdit still enforce nothing, and the code has moved in a
  way that makes this harder to see, not easier.** `src/hooks/PreToolUse.MultiEdit.js:8`
  and `src/hooks/PreToolUse.NotebookEdit.js:7` each contain exactly one line:
  `require('./PreToolUse.Edit.js')`. `PreToolUse.Edit.js` now exports a
  stdin-decoupled `enforce(stdinJson)` function (added for an unrelated fix, the
  PI5-s2 single-consumer-pipe correction — see `src/hooks/PreToolUse.Edit.js:19-30,
  225`), and its own direct-invocation IIFE is guarded at
  `src/hooks/PreToolUse.Edit.js:231-233`: `if (require.main === module) {
  enforce(readStdinJson()); }`. When `PreToolUse.Edit.js` is loaded via `require()`
  from `PreToolUse.MultiEdit.js`, `require.main` is `PreToolUse.MultiEdit.js`
  itself — the guard is false, the IIFE never runs, and **neither file calls
  `enforce()` anywhere**. The two hooks load the module for its side effects (none)
  and enforce nothing, exactly as the original finding describes — but the fix is
  now more precisely scoped than the original finding implied: `enforce()` already
  exists and is stdin-decoupled (built for `PreToolUse.Write.js`'s fix, see
  `src/hooks/PreToolUse.Write.js:280-317` for the exact working pattern: read
  stdin once in a `main()`, parse it, then call `enforce(parsed)`). MultiEdit and
  NotebookEdit need that same `main()` added — not a new `enforce()` export.

### Impact

- Every plan-coverage block, secret-file block, and irreversible-command block
  (`rm -rf`, force-push, `DROP TABLE`) prints a red "BLOCKED" banner and then the
  operation executes anyway (C1).
- The Bash gate is fully inert regardless of the command's danger — `rm -rf`, a
  raw `mv` of a plan into `plans/done/` (bypassing the human gate), and a commit
  before Step 15 all pass silently because the command is always read as empty
  (C2, compounded by C1).
- A `MultiEdit` or `NotebookEdit` to a file covered by no active plan is never
  evaluated at all — not "evaluated and allowed", but never reaches any decision
  logic (C3). An attacker or a runaway agent loop can bypass Edit-only enforcement
  trivially by using MultiEdit for the same change.
- Because W02 (human-gate integrity) and W08 (enforcement stays on and honest)
  both depend on a deny provably stopping the tool call, neither of those
  workstreams' fixes can be verified as working until W01 lands — a test that "the
  hook decided to deny" is not evidence the tool was stopped.

## 2. ALIGN — Goals + Success Metrics

**Job to Be Done:** When I am running CTOC with permission prompts disabled and
attempt an uncovered edit, a secret-file write, or a dangerous Bash command, I
want the PreToolUse hook's deny decision to actually stop the operation, so I can
trust that "BLOCKED" in my terminal means the operation did not happen.

**Impact Map:**
- **Goal:** A PreToolUse deny provably prevents the tool call — the vision's
  success criterion #1.
- **Actor:** Every CTOC user running with `--dangerously-skip-permissions`, for
  whom these hooks are the only guardrail.
- **Impact:** An uncovered, secret, or irreversible operation is actually stopped,
  not narrated.
- **Deliverable:** One uniform block protocol applied identically across Edit,
  Write, MultiEdit, NotebookEdit, and the Bash gate, plus the stdin fix that lets
  the Bash gate see the real command.

**Success metrics** (each is a behavior a subprocess-level test can drive and
observe on the real exit-code/stdout channel — not an internal function's return
value):

- [ ] A spawned `PreToolUse.Edit.js` subprocess, given an uncovered target and no
  escape phrase, emits the harness's real deny signal, and the target file is
  unmodified after the run.
- [ ] The identical spawned-subprocess deny signal fires for `PreToolUse.Write.js`
  using the same protocol constant/helper as Edit (no per-hook divergence).
- [ ] A spawned `PreToolUse.Bash.js` subprocess, given `rm -rf plans` on stdin and
  `CLAUDE_TOOL_INPUT` unset, reads the command from stdin and emits the deny
  signal.
- [ ] A spawned `PreToolUse.Bash.js` subprocess never falls through to
  allow-by-default for a dangerous command when `CLAUDE_TOOL_INPUT` is unset — the
  test fails if the command slips through.
- [ ] `PreToolUse.MultiEdit.js` and `PreToolUse.NotebookEdit.js`, spawned as their
  own process entry (not imported and called in-process), emit the same deny
  signal as Edit for an uncovered target.
- [ ] A plan-covered target is ALLOWED (no deny signal) under the new protocol,
  across all five surfaces — precision, not blanket denial.
- [ ] Zero remaining reads of `process.env.CLAUDE_TOOL_INPUT` in
  `PreToolUse.Bash.js`'s command-acquisition path.

## 3. CAPTURE

### Acceptance Criteria (BDD)

- [ ] **Scenario: Uncovered Edit is actually prevented**
  Given a target file covered by no active plan's `files:` declaration and no
  escape phrase present in the recent transcript
  When `PreToolUse.Edit.js` is invoked as a real subprocess with that payload on
  stdin
  Then the subprocess emits the harness's deny signal
  And the target file's content is byte-identical before and after the run.

- [ ] **Scenario: Uncovered Write is prevented via the delegate path**
  Given a Write target covered by no active plan and no escape phrase
  When `PreToolUse.Write.js` is invoked as a real subprocess (advisory duplicate
  guard runs first, then delegates to `enforce()`)
  Then the subprocess emits the identical deny signal used for Edit
  And no bytes are written to the target file.

- [ ] **Scenario: MultiEdit is blocked exactly like a single Edit**
  Given a MultiEdit target covered by no active plan and no escape phrase
  When `PreToolUse.MultiEdit.js` is invoked as a real subprocess (its own process
  entry, not an in-process call to `enforce()`)
  Then the subprocess emits the same deny signal as the Edit scenario
  And none of the target's edits are applied.

- [ ] **Scenario: NotebookEdit is blocked exactly like a single Edit**
  Given a NotebookEdit target covered by no active plan and no escape phrase
  When `PreToolUse.NotebookEdit.js` is invoked as a real subprocess
  Then the subprocess emits the same deny signal as the Edit scenario
  And the notebook file is unchanged.

- [ ] **Scenario: Bash gate reads the real transport for a destructive command**
  Given the command `rm -rf plans` delivered as the `command` field of the
  PreToolUse JSON payload on stdin, and `CLAUDE_TOOL_INPUT` NOT set
  When `PreToolUse.Bash.js` is invoked as a real subprocess
  Then the subprocess emits the deny signal
  And the reported blocked command matches the actual command from stdin,
  proving it was read rather than defaulted to empty.

- [ ] **Scenario: Bash gate does not fall through to allow-by-default**
  Given `CLAUDE_TOOL_INPUT` unset and a dangerous command (`git push --force`) on
  stdin
  When `PreToolUse.Bash.js` runs
  Then the command is not treated as empty
  And the deny signal fires — the test explicitly fails if the subprocess exits
  allow for this input.

- [ ] **Scenario: enforce() fires from a sibling entry point**
  Given `PreToolUse.MultiEdit.js` is the actual process entry point (not
  `PreToolUse.Edit.js`)
  When an uncovered target is delivered on stdin to the `PreToolUse.MultiEdit.js`
  subprocess
  Then a deny is still emitted — proving enforcement does not depend on
  `PreToolUse.Edit.js` being `require.main === module`.

- [ ] **Scenario: Uniform protocol across all five surfaces**
  Given the same uncovered target delivered separately to Edit, Write, MultiEdit,
  NotebookEdit, and the Bash gate
  When each is invoked as a real subprocess
  Then all five emit the identical deny signal shape (same exit code, or
  identical `permissionDecision` JSON key/value) — no surface uses a different
  protocol than the others.

- [ ] **Scenario: Plan-covered edit is still allowed**
  Given a target file declared in an active plan's `files:` glob
  When any of Edit, Write, MultiEdit, or NotebookEdit is invoked as a real
  subprocess with that target
  Then the subprocess emits allow (no deny signal)
  And the edit's content is applied.

- [ ] **Scenario: Escape phrase still allows after the protocol change**
  Given an uncovered target and a recent transcript containing an escape phrase
  ("hotfix")
  When `PreToolUse.Edit.js` runs
  Then the subprocess emits allow — the block-path protocol change must not
  regress the existing escape-phrase allow path.

### Scope

#### In Scope

- One uniform block-signal protocol (chosen once in implementation, applied
  identically) replacing `process.exit(1)` on the deny path of
  `PreToolUse.Edit.js`'s `block()` (`:122-142`) and on all five block-exit sites
  in `PreToolUse.Bash.js` (`:336`, `:363`, `:376`, `:388`, `:395`).
- `PreToolUse.Bash.js`'s `getCommand()` (`:268-278`) reading the tool payload from
  stdin (fd 0), not `process.env.CLAUDE_TOOL_INPUT` — the C1+C2 combined fix for
  this one file.
- `PreToolUse.MultiEdit.js` and `PreToolUse.NotebookEdit.js` each gaining their
  own `main()` (mirroring the proven pattern at `PreToolUse.Write.js:280-317`):
  read stdin once, parse it, and call the exported `enforce(parsed)` from
  `PreToolUse.Edit.js` — replacing the current bare `require('./PreToolUse.Edit.js')`
  that never invokes enforcement.
- Subprocess-level integration tests, for all five surfaces, that assert the
  actual deny/allow signal on the real exit-code/stdout channel the harness
  reads — not an in-process function's return value.

#### Out of Scope

- The approval-provenance ledger, binding `approved_by: human` to a real human
  act, and multi-hop gate-bypass prevention in `move-plan.js` — that is W02
  (human-gate integrity), which depends on this plan landing first so its own
  fix is observable.
- Re-deriving the Claude Code harness's exit-code-vs-JSON contract from the CLI
  binary — already verified by the parent audit (vision, "Enforcement never
  blocks" finding). This plan consumes that verified fact; it does not
  re-verify it. Confirming the exact current JSON field names against the live
  Claude Code hooks documentation is deferred to Step 5 (PLAN), immediately
  before implementation — see Decisions Taken Under Ambiguity below.
- `PreToolUse.Bash.js`'s own top-level error handler (`main().catch(err => {
  ...; process.exit(1); })` at `:403-406`) — its fail-open/fail-closed posture on
  a genuine hook crash (as opposed to a deliberate deny) is a separate concern
  from C1–C3 and is not one of the audit's cited findings.
- Any change to WHAT is decided — whitelist rules, plan-coverage matching,
  escape-phrase matching, irreversible-command pattern matching. W01 only
  changes HOW a decision already made is communicated to the harness; the
  decision logic itself is untouched.
- The `enforcementLog` / `.ctoc/logs/enforcement.json` audit-trail format —
  unaffected; only the process-level signal to the harness changes.

### Story Breakdown (INVEST-validated)

**As a** CTOC user running with permission prompts disabled, **I want** a
PreToolUse deny to actually stop the tool call, **so that** an uncovered edit is
prevented rather than printed-and-allowed.
*(Independent — no other workstream required. Valuable — closes the core
vulnerability. Small — one deny path, one file's `block()`. Testable — assert
the tool was prevented via a spawned subprocess. `[MVP]`.)*

**As a** maintainer, **I want** every PreToolUse hook (Edit, Write, MultiEdit,
NotebookEdit, Bash) to use the identical block protocol, **so that** enforcement
is uniform and no single hook can silently no-op while another blocks.
*(Depends on the deny-mechanism story landing first. Negotiable — exit-2 vs
JSON is a single implementation choice, see Decisions below. Testable per-hook
via the uniform-protocol scenario.)*

**As a** CTOC user, **I want** the Bash gate to read the command from stdin (the
real transport), **so that** a dangerous command (`rm -rf`, raw `mv` into
`plans/done/`, a premature commit) is actually inspected and blocked instead of
seen as empty and allowed.
*(Independent of the Edit path. Valuable — commands are genuinely inspected.
Small — one function, `getCommand()`. Testable — dangerous command denied.
`[MVP]`, and combined with the protocol story above since C1+C2 must ship
together in this file — see Current State.)*

**As a** CTOC user, **I want** MultiEdit and NotebookEdit to run the same
enforcement as Edit, **so that** an uncovered multi-file or notebook edit is
blocked with the same certainty as a single Edit.
*(Depends on the deny-mechanism story's protocol landing in `enforce()`. Valuable
— closes a total enforcement bypass. Small — one `main()` added per file,
copying the proven `PreToolUse.Write.js` pattern. Testable — parity scenario via
spawned subprocess. `[MVP]`.)*

**As a** maintainer, **I want** MultiEdit and NotebookEdit to call the exported
`enforce()` from their own process entry rather than relying on
`require.main === module`, **so that** enforcement cannot silently vanish again
when a sibling file is the entry point.
*(Enabling story for the MultiEdit/NotebookEdit MVP story above — `enforce()`
already exists as an export; this story is "wire the two remaining delegates to
call it explicitly", not "create the export". Testable via the sibling
entry-point scenario.)*

### Files Likely Touched

- `src/hooks/PreToolUse.Edit.js` — the `block()` function's signal (`:122-142`,
  specifically the `process.exit(1)` at `:141`).
- `src/hooks/PreToolUse.Write.js` — no logic change expected (it already
  delegates to `enforce()` correctly per `:280-317`); included because it must be
  covered by the uniform-protocol subprocess test.
- `src/hooks/PreToolUse.MultiEdit.js` — add a `main()` that reads stdin once,
  parses it, and calls the exported `enforce(parsed)`, replacing the bare
  `require()` at `:8`.
- `src/hooks/PreToolUse.NotebookEdit.js` — same change as MultiEdit, replacing
  the bare `require()` at `:7`.
- `src/hooks/PreToolUse.Bash.js` — `getCommand()` (`:268-278`) to read stdin
  instead of `process.env.CLAUDE_TOOL_INPUT`; all five block-exit sites
  (`:336`, `:363`, `:376`, `:388`, `:395`) to use the new uniform signal.
- New or extended test files under `tests/` for subprocess-level integration
  coverage of all five hooks (exact filenames decided at Step 8 TEST) — the
  pattern already exists for `PreToolUse.Write.js`'s advisory guard (referenced
  in its own docstring at `:39-42`) and should be extended, not reinvented.

### Test Strategy

Every acceptance criterion above must be proven by a test that spawns the actual
hook file as a **real subprocess** (`child_process.spawn`/`execFileSync`) with a
crafted PreToolUse JSON payload on stdin, and asserts on:

1. **The exact signal the harness reads** — the process's exit code and/or the
   parsed stdout JSON's `permissionDecision` field — never an internal helper
   function's return value. A test that imports `enforce()` and checks its
   return value proves the decision logic works; it does NOT prove the harness
   will ever see that decision, which is exactly the gap that let C1 and C3 ship
   undetected behind a green suite. Both levels of test are useful, but only the
   subprocess-level test satisfies this plan's acceptance criteria.
2. **The deny signal's semantics, not its numeral.** Where the chosen protocol
   is the JSON form, assert `hookSpecificOutput.permissionDecision === "deny"` —
   a self-describing field — rather than an opaque exit code. Where exit-code
   fallback is used, the test must assert the code against a named constant
   (e.g. `HARNESS_BLOCK_EXIT_CODE = 2`) documented as matching the harness
   contract, never a bare literal `2` scattered across assertions.
3. **Side-effect absence for every deny scenario** — the target file's bytes
   (or, for the Bash scenarios, evidence the destructive command did not run:
   e.g. a canary file the command would have deleted still exists) are
   unchanged after the subprocess exits.
4. **Side-effect presence for every allow scenario** (plan-covered target,
   escape phrase) — proving the fix is precise, not a blanket new block.
5. **The MultiEdit/NotebookEdit parity and sibling-entry-point scenarios must
   spawn `PreToolUse.MultiEdit.js` / `PreToolUse.NotebookEdit.js` directly**, not
   `PreToolUse.Edit.js` with a substituted `tool_name` — an in-process or
   wrong-entry-point test would not have caught C3 as it exists today (the bare
   `require()` with no `main()`).
6. Every one of the 10 acceptance-criteria scenarios above must exist as a
   failing test BEFORE the fix lands (Step 8 TEST, out of scope for this
   functional plan) and pass after — this is the plan's own dogfooding
   requirement per the parent vision's closing line.

## Decisions Taken Under Ambiguity

- No Business Model Canvas exists at `plans/canvas/ctoc-self-audit-remediation.md`,
  and none is applicable: this is a TECHNICAL remediation workstream, not a
  product/market concern. Proceeded vision-only rather than kicking back.
- **Block protocol: recommend the stdout JSON `permissionDecision: "deny"`
  channel over bare `process.exit(2)`, as the primary choice for implementation
  (Step 5/6) to confirm and apply uniformly.** Reasoning:
  - It is self-describing: the decision travels as structured data
    (`hookSpecificOutput.permissionDecision`, plus a `permissionDecisionReason`
    string) rather than an out-of-band OS exit code that requires an external,
    unversioned comment to explain ("2 means deny, 1 means printed-but-allowed,
    0 means allow" — exactly the kind of tribal knowledge that let C1 ship and
    go unnoticed).
  - It avoids exit-code collision with CTOC's own existing conventions: several
    hooks already use `process.exit(1)` for "blocked" (the very bug this plan
    fixes) and `process.exit(0)` for fail-open error handling. A JSON decision
    channel is orthogonal to the process's own crash/exit semantics — a hook can
    exit 0 (no OS-level error) while still explicitly telling the harness
    `permissionDecision: "deny"`, which removes an entire class of "which digit
    means what" bugs.
  - It is the superset protocol: `permissionDecision` also expresses `"ask"`,
    which a bare exit code cannot express at all. Choosing the JSON form now
    costs nothing and avoids a second protocol migration if a later workstream
    (e.g. the Bash gate's irreversible-command block, which already asks for
    "explicit confirmation" in its message text) wants a genuine ask-the-human
    decision instead of a hard deny.
  - It most directly satisfies this plan's own testability requirement (Test
    Strategy, point 2): the test parses JSON and asserts a semantically-named
    field, rather than asserting an opaque integer whose meaning is defined only
    by an external harness contract.
  - **Caveat left open for Step 5 (PLAN), not resolved here:** the exact current
    field names/shape of the JSON protocol must be confirmed against the live
    Claude Code hooks documentation at implementation time (Steps 5-7 are out of
    scope for this functional plan); `process.exit(2)` remains an acceptable
    fallback if the installed harness version does not support the JSON channel.
    Either choice satisfies every acceptance criterion above, since all
    criteria are phrased as "the subprocess emits the harness's deny signal",
    not tied to one specific protocol shape.
- Walking Skeleton chosen as: one real block on Edit (uniform protocol) +
  Bash C1+C2 combined fix (stdin read + real signal, since neither alone makes
  the Bash gate functional) + MultiEdit/NotebookEdit parity via the proven
  `PreToolUse.Write.js` `main()` pattern — the thinnest end-to-end slice that
  makes a deny observable on every surface, which is what W02 and W08 depend on.
