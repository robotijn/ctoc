---
approved_by: human
approved_at: 2026-07-13T20:53:24.324Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:43.036Z
gate_crossed: implementation → todo
---

---
title: "W03-s1 — Move frontmatter to byte 0 in 19 heading-first agent files"
type: feature
parent_plan: "ctoc-audit-w03-agent-contracts-load"
depends_on: none
priority: HIGH
files:
  - agents/coordinator/cto-chief.md
  - agents/coordinator/ivv-chief.md
  - agents/coordinator/synthesizer.md
  - agents/infrastructure/deployment-setup.md
  - agents/pipeline/agent-critic.md
  - agents/pipeline/agent-publisher.md
  - agents/pipeline/agent-qa.md
  - agents/pipeline/agent-tester.md
  - agents/pipeline/agent-writer.md
  - agents/planning/implementation-planner.md
  - agents/planning/kpi-planner.md
  - agents/planning/stack-chooser.md
  - agents/planning/unit-economics-modeler.md
  - agents/planning/vision-advisor.md
  - agents/scouts/dep-scout.md
  - agents/scouts/lint-scout.md
  - agents/scouts/secret-scout.md
  - agents/scouts/syntax-scout.md
  - agents/scouts/test-scout.md
  - tests/agent-contract-load.test.js
---

# W03-s1 — Move frontmatter to byte 0 in 19 heading-first agent files

**SIP1 slice of** `ctoc-audit-w03-agent-contracts-load` (Story A / Finding C6).
**Scope:** the mechanical, uniform edit that moves the `---` frontmatter block to
byte 0 (line 1) in the 19 agent files that currently place an `# H1` heading before
their frontmatter, plus the two tests that assert the fix (byte-0 structural + live
contract-load proxy). This is the "large but uniform edit" slice: 19 identical
transforms + one new test file, kept together because the transform is one unit of
work and the test is its specification.

**Verified against the live tree at PLAN time** (repo-wide scan for a `#` heading
preceding the first `---`): exactly these 19 non-`_shared` files are heading-first;
all 105 other non-`_shared` `agents/**/*.md` files and all 99 `SKILL.md` files
already begin with `---\n`. The 5 Tier-3 scouts (`dep/lint/secret/syntax/test`) and
`cto-chief` are among the 19.

## Decisions Taken Under Ambiguity

- **Heading relocated, not deleted.** Each file's leading `# H1` moves to immediately
  after the closing `---` of the frontmatter (parent-plan decision). The `title:`
  frontmatter key is not touched; if the maintainer later prefers dropping the now-
  redundant `# H1`, that is a trivial follow-up — out of scope here.
- **Live-registration test uses a byte-0-anchored parse as the runtime proxy.** In a
  Claude Code plugin the tool/model resolution is performed by the **harness**, which
  is not invokable from `node --test`; there is no CTOC-side agent loader (verified:
  `src/lib/agent-resolver.js` is documented "NOT invoked by Claude's normal agent
  loading path"). The faithful, in-reach proxy is to parse each file with the **exact
  anchoring rule the runtime uses** — frontmatter must start at byte 0
  (`/^---\n([\s\S]*?)\n---/`, no `m` flag, no match-anywhere fallback). A byte-0 parse
  predicts the harness registration; a *lenient* parse (the C7 defect) does not. This
  honours the parent plan's binding rule ("assert what the runtime does, never trust a
  lenient read of the file text") within what a unit test can reach. This session's own
  agent registry is the live evidence motivating the fix: `cto-chief` currently
  registers as "Tools: All tools" and the `_shared` fragments register as dispatchable —
  both because the harness parses none of the misplaced frontmatter.
- **cto-chief's asserted tool set is its ACTUAL declaration, not an idealized one.**
  The parent plan's acceptance criterion assumed cto-chief's read-only set "does NOT
  include Bash". The live file declares `tools: Read, Grep, Glob, Task, Bash` — it
  **does** include `Bash` (and `Task`). W03 is scoped to make the *existing*
  declaration LOAD, never to re-scope it (re-scoping is explicitly out of W03 scope and
  is the agent-owner's decision). Therefore the test asserts cto-chief loads with its
  declared five tools and that `Write`/`Edit`/`MultiEdit`/`NotebookEdit` are absent — it
  does **not** assert `Bash` is absent, because that would be a false test of a contract
  W03 is not allowed to change. **Surfaced finding (not fixed here):** a declared
  `Bash` grant means cto-chief *can* mutate files via a shell, which materially weakens
  the "cannot edit" safety property the parent plan claims to restore. This is recorded
  in the parent index for the maintainer to schedule — it is neither hidden nor silently
  absorbed into W03.

## Implementation Details

### Dependency graph (this slice)
```
tests/agent-contract-load.test.js  --asserts-->  19 corrected agent .md files
(no dependency on any other slice; s2 depends on THIS slice, not the reverse)
```

### The uniform transform (applied identically to all 19 files)
Current shape (verified on `cto-chief.md`, `dep-scout.md`, representative of all 19):
```
# <Heading Text>            ← bytes 0..n
<blank line>
---                         ← misplaced frontmatter opener
name: ...
---
<body>
```
Target shape:
```
---                         ← byte 0
name: ...
---
<blank line>
# <Heading Text>
<body>
```
Transform rule: the file is `PRE + FM + POST` where `PRE` = everything before the
first `---\n` (the heading line + trailing blank line), `FM` = the first
`---\n … \n---` block, `POST` = everything after the closing `---`. Rewrite as
`FM + "\n\n" + <PRE with trailing blank lines trimmed> + POST`. Anchor on the FIRST
`---\n` (the misplaced opener); `PRE` contains no `---`, so there is no ambiguity with
any in-body Markdown horizontal rule.

### File specification — `tests/agent-contract-load.test.js` (CREATE)
Node built-in `node:test`; no doubles; reads the real tree off disk.
- Local helper `parseByte0FM(content)` → `content.match(/^---\n([\s\S]*?)\n---/)` (byte-0
  anchored, mirrors the runtime; NO `m` flag, NO fallback).
- Local walker over `agents/**/*.md` that **skips `_`-prefixed dirs** (matches every
  other CTOC walker: `iron-loop-enforcer.js:listAgents`, `agent-resolver.js`).

## Execution Plan

### Step 8: TEST
TDD-first — write the failing tests before any file move. Create
`tests/agent-contract-load.test.js` with three behavioural assertions, each RED
against the current tree:
- [x] **Byte-0 structural**: for every non-`_shared` `agents/**/*.md`, assert the first
  four bytes equal the literal `---\n` (byte-for-byte, `Buffer.slice(0,4)`), not a regex
  substring. RED now: 19 files fail (they start with `# `).
- [x] **cto-chief loads its declared read-only-ish contract (runtime proxy)**: `parseByte0FM`
  of `agents/coordinator/cto-chief.md` returns non-empty frontmatter; its `tools:` line
  parses to exactly `{Read, Grep, Glob, Task, Bash}`; and none of `Write`, `Edit`,
  `MultiEdit`, `NotebookEdit` appear. RED now: byte-0 parse of a heading-first file
  returns empty → no `tools:` found.
- [x] **Each of the 5 scouts loads `model: haiku` (runtime proxy)**: for
  `dep/lint/secret/syntax/test`-scout, `parseByte0FM` returns frontmatter matching
  `/^model:\s*haiku$/m`. RED now for the same reason.
- [x] Confirm the suite is RED for exactly these assertions: `node --test tests/agent-contract-load.test.js`.

### Step 9: PREPARE
- [x] Confirm no other in-flight edit is touching any of the 19 files (parent
  Dependency-Risk: serialize, never concurrent-edit).
- [x] Re-run the heading-first scan to confirm the set is still exactly these 19 (guards
  against drift between PLAN and build).

### Step 10: IMPLEMENT
One step; one sub-item per file — the identical transform above. No frontmatter *content*
changes; only the `---` block position and the heading position change.
- [x] `agents/coordinator/cto-chief.md`
- [x] `agents/coordinator/ivv-chief.md`
- [x] `agents/coordinator/synthesizer.md`
- [x] `agents/infrastructure/deployment-setup.md`
- [x] `agents/pipeline/agent-critic.md`
- [x] `agents/pipeline/agent-publisher.md`
- [x] `agents/pipeline/agent-qa.md`
- [x] `agents/pipeline/agent-tester.md`
- [x] `agents/pipeline/agent-writer.md`
- [x] `agents/planning/implementation-planner.md`
- [x] `agents/planning/kpi-planner.md`
- [x] `agents/planning/stack-chooser.md`
- [x] `agents/planning/unit-economics-modeler.md`
- [x] `agents/planning/vision-advisor.md`
- [x] `agents/scouts/dep-scout.md`
- [x] `agents/scouts/lint-scout.md`
- [x] `agents/scouts/secret-scout.md`
- [x] `agents/scouts/syntax-scout.md`
- [x] `agents/scouts/test-scout.md`
- [x] Per-file guard: the heading text is preserved verbatim after the closing `---`;
  a heading containing a colon/quote is never swallowed into the YAML (it moves as body,
  not frontmatter).

### Step 11: REVIEW
- [x] Self-review each moved file: `---` at byte 0, frontmatter content byte-identical to
  before (diff shows only relocation), heading intact directly after the closing `---`,
  body unchanged.

### Step 12: OPTIMIZE
- [x] No abstraction added; the transform is a pure relocation. Confirm no incidental
  reflow/whitespace churn beyond the single moved block.

### Step 13: SECURE
- [x] No new inputs, no path handling, no shell-out introduced. Confirm the edit touches
  only the 19 declared files and the one test file (PreToolUse coverage stays green).

### Step 14: VERIFY
- [x] Run the new test green: `node --test tests/agent-contract-load.test.js`.
- [x] Run the full suite: `node --test tests/*.test.js` — expect `# fail 0`. In
  particular `tests/architecture-invariants.test.js` (still using its lenient parser in
  this slice) must remain green — the move keeps its assertions true.

### Step 15: DOCUMENT
- [x] Note in the plan's completion record that all 19 contracts now load at byte 0 and
  that the cto-chief `Bash`/`Task` grant was surfaced (see parent index), not modified.

### Step 16: FINAL-REVIEW
- [x] Confirm the four Story-A acceptance scenarios pass, the 3 tests are green, the full
  suite is `# fail 0`, and no file outside this slice's `files:` list was touched.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Malformed move (heading with `:`/`"` swallowed into YAML; in-body `---` mistaken for boundary) | Anchor on the FIRST `---\n`; `PRE` has no `---`; byte-0 parse test validates every moved file parses | Step 8, Step 10 |
| Set drifted since PLAN (a 20th file, or one already fixed) | Re-scan at Step 9 before editing | Step 9 |
| A latent flow relied on cto-chief's accidental all-tools access | Full suite at Step 14 catches it; treat any new failure as a separate real defect, not a reason to revert | Step 14 |


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal)
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review
