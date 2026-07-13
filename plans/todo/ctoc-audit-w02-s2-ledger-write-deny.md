---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:42.889Z
gate_crossed: implementation → todo
---

---
title: "W02-s2 — Deny-list .ctoc/approvals/ to every editing tool"
type: feature
parent_plan: "ctoc-audit-w02-gate-integrity"
depends_on: none
files:
  - src/hooks/PreToolUse.Edit.js
  - tests/ctoc-audit-w02-s2-ledger-write-deny.test.js
priority: HIGH
created: "2026-07-13T00:00:00Z"
---

# W02-s2 — Deny-list `.ctoc/approvals/` to every editing tool

**Parent:** `ctoc-audit-w02-gate-integrity` (finding C4, "ledger write-denied"
criterion). **Slice scope:** make the enforcement hook DENY any Edit/Write/MultiEdit/
NotebookEdit whose target is under `.ctoc/approvals/`, so no agent tool call can forge
or tamper with a ledger entry. Independent of the ledger module itself (this is a pure
path guard — it imports nothing from s1), hence `depends_on: none`.

### The bug this closes
`PreToolUse.Edit.js:54` whitelists `/^\.ctoc\//` — EVERYTHING under `.ctoc/` is
currently allowed unconditionally, including `.ctoc/approvals/`. So the moment s1's
ledger exists, an agent could write `.ctoc/approvals/<slug>.json` directly and forge
its own approval — re-opening C4 through the back door. The deny must take precedence
OVER the `.ctoc/` whitelist. Because `PreToolUse.Write.js` delegates to this module's
exported `enforce()` (and, per W01, MultiEdit/NotebookEdit do too), guarding `enforce()`
covers all four editing tools in one place.

## Implementation Details

### File Specification — `src/hooks/PreToolUse.Edit.js` (MODIFY)

- **Add** a pure predicate `isProtectedLedgerPath(filePath)` next to `isWhitelisted`
  (line ~60). It relativizes `filePath` against `process.cwd()` the SAME way
  `isWhitelisted` does (absolute → `path.relative`; `\\`→`/`; reject `..` traversal;
  `path.posix.normalize`), then returns `true` iff the normalized path equals
  `.ctoc/approvals` or starts with `.ctoc/approvals/`. Reuse the existing traversal
  rejection so `.ctoc/approvals/../../x` cannot slip through.
- **Wire it as Step 0 of `enforce()`** (inside `enforce`, at line ~181, BEFORE the
  Step-1 whitelist allow). When `targetFile && isProtectedLedgerPath(targetFile)`,
  call `block('ledger is human-approval provenance; agent writes to .ctoc/approvals/
  are denied', { tool, target_file: targetFile, project_root: root })`. `block()` is
  the existing function (exit code + stderr + enforcement log) — the deny rides W01's
  real block mechanism unchanged; this slice only adds the branch that reaches it.
- **Export** `isProtectedLedgerPath` in `module.exports` (line ~225) alongside the
  existing `enforce`, `isWhitelisted`, `getTargetFile`, `readStdinJson` so the test
  can drive the predicate directly without stdin.

No change to `PreToolUse.Write.js`: it already imports and calls the same `enforce()`.
No change to the `WHITELIST` array — the deny sits ahead of it so precedence is
explicit rather than by editing the `.ctoc/` pattern.

### Test Plan — `tests/ctoc-audit-w02-s2-ledger-write-deny.test.js` (CREATE)

Two layers, both BEHAVIOR-first (assert DENIED vs ALLOWED, not a return value):

- **Predicate layer** (pure, no process): import `isProtectedLedgerPath` and assert it
  is `true` for `.ctoc/approvals/x.json`, `.ctoc/approvals/nested/y.json`, and the
  absolute form under `process.cwd()`; `false` for `.ctoc/logs/z.json`,
  `.ctoc/settings.yaml`, `plans/done/p.md`, and a `.ctoc/approvals/../escape.js`
  traversal.
- **Decision layer** (real hook, subprocess — mirror `e2e-enforcement-and-gates.test.js`):
  `spawnSync(process.execPath, [EDIT_HOOK], { input: JSON.stringify(payload), cwd })`
  where the sandbox `cwd` is a CTOC project. With `tool_input.file_path =
  .ctoc/approvals/foo.json`, assert the process takes the BLOCK path (non-zero exit +
  the deny reason on stderr) and that no file was created at that path. With
  `tool_input.file_path = .ctoc/logs/foo.json`, assert it is ALLOWED (whitelist).
  - **W01 caveat (from the parent's Decisions):** until W01 lands, the block exit code
    is `1`; W01 changes it to `2` so the harness actually stops the call. This test
    asserts the block DECISION (non-zero + deny message + write prevented at the
    `enforce()`/subprocess level), which is the strongest available assertion pre-W01
    and flips green on this fix. Do NOT hard-code `2`; assert `code !== 0`.

## Execution Plan

### Step 8: TEST (TDD Red)
- [ ] Write `tests/ctoc-audit-w02-s2-ledger-write-deny.test.js`. The predicate cases
      and the subprocess `.ctoc/approvals/foo.json` DENY case MUST fail before the fix
      (today that path is whitelisted → ALLOWED). Assert BEHAVIOR: a
      `.ctoc/approvals/` write is prevented; a `.ctoc/logs/` write still passes.

### Step 9: PREPARE
- [ ] Locate the sandbox-project helper pattern in `e2e-enforcement-and-gates.test.js`
      (writes a minimal `.ctoc/` so `isCtocProject` returns true) and reuse it.

### Step 10: IMPLEMENT
- [ ] Add `isProtectedLedgerPath(filePath)` to `src/hooks/PreToolUse.Edit.js` with the
      same relativize + traversal-reject logic as `isWhitelisted`.
- [ ] Insert the Step-0 deny branch at the top of `enforce()` (before the whitelist
      allow), calling the existing `block(...)`.
- [ ] Add `isProtectedLedgerPath` to `module.exports`.

### Step 11: REVIEW
- [ ] Confirm the deny runs BEFORE the whitelist so `.ctoc/approvals/` cannot be
      allowed by the `/^\.ctoc\//` pattern; confirm no other `.ctoc/` path regresses.

### Step 12: OPTIMIZE
- [ ] Predicate is a single normalize + two string checks; no regex backtracking, no
      extra fs calls.

### Step 13: SECURE
- [ ] Traversal (`.ctoc/approvals/../x`) is rejected by the shared normalization.
- [ ] Deny reason on stderr names the policy, leaks no absolute host path beyond the
      existing `block()` output.
- [ ] Fail-open contract preserved: an internal error still exits 0 (unchanged).

### Step 14: VERIFY
- [ ] `node --test tests/ctoc-audit-w02-s2-ledger-write-deny.test.js` → `# fail 0`.
- [ ] `node --test tests/*.test.js` green — existing whitelist/coverage tests (e.g.
      `enforcement-hook.test.js`, `e2e-enforcement-and-gates.test.js`) still pass.

### Step 15: DOCUMENT
- [ ] JSDoc on `isProtectedLedgerPath`; a comment at the `enforce()` Step-0 branch
      explaining the precedence over the `.ctoc/` whitelist and the C4 rationale.

### Step 16: FINAL-REVIEW
- [ ] Verify against C4 "ledger write-denied": every editing tool routed through
      `enforce()` (Edit/Write, and MultiEdit/NotebookEdit via W01) is denied on a
      `.ctoc/approvals/` target.


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
