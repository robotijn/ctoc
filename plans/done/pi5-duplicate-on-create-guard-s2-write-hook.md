---
approved_by: human
approved_at: 2026-07-08T13:49:31.171Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T12:36:24.626Z
gate_crossed: implementation → todo
---

---
title: "PI5-s2 — advisory PreToolUse.Write hook (LIVE surface for checkDuplicate)"
type: implementation
parent_plan: pi5-duplicate-on-create-guard
depends_on: pi5-duplicate-on-create-guard-s1-duplicate-guard
priority: MEDIUM
program: ctoc-planning-intelligence
iron_loop: true
files:
  - "src/hooks/PreToolUse.Write.js"
  - "tests/plan-index-duplicate-hook.test.js"
---

# PI5-s2 — advisory `PreToolUse.Write` hook (the LIVE surface)

> **Slice 2 of 2 of the PI5 decomposition.** Slice 1 (`s1`) shipped the pure
> `checkDuplicate(draftSummary, options)` function — inert until something calls it.
> THIS slice wires it into the LIVE plan-write surface: the `PreToolUse.Write` hook.
> Without `s2` the guard is the pi1-inert trap — a correct module nobody invokes.
> `s2 depends_on s1`: the hook imports `checkDuplicate`, so the module + its test
> must exist first.
>
> **The PI4 "measure is the human" lesson applies literally here.** The test does NOT
> assert a dead call. It DRIVES the real hook with a `plans/**/*.md` Write payload on
> stdin and asserts (a) the advisory warning naming the near-duplicate + its
> similarity score actually surfaces (stderr), and (b) the hook ALWAYS exits 0 — the
> vision-locked "warns, never blocks" contract. Proving the warning surfaces is the
> whole point of the slice; a green unit test on `checkDuplicate` alone (that is s1)
> does not prove a human ever sees the warning.

## Scope (this slice only)

- **In:** `src/hooks/PreToolUse.Write.js` — extended ADDITIVELY to run the advisory
  duplicate guard for `plans/**/*.md` Write targets before delegating to the existing
  enforcement path; its own test `tests/plan-index-duplicate-hook.test.js` that drives
  the real hook end-to-end.
- **Out:** the `checkDuplicate` logic itself (`s1`, shipped). Retrieval (PI4, shipped).
  Settings-schema registration (PI1, shipped — `plan_index.duplicate_threshold` default
  `0.85` already in `src/lib/settings.js`). Conflict detection (PI6). Any change to
  `PreToolUse.Edit.js` or the gate/enforcement logic it owns — this slice must NOT
  weaken or alter enforcement; the advisory guard is strictly additive and side-effect-
  free with respect to the block/allow decision.

## Implementation Details

### Architecture Decision

**Context.** The shipped `src/hooks/PreToolUse.Write.js` is a 9-line thin delegator:
it `require('./PreToolUse.Edit.js')`, reusing the same plan-coverage enforcement logic
for both Write and Edit (the Edit hook reads `tool_name` from stdin so logs
distinguish which tool fired). The parent PI5 scope names `src/hooks/PreToolUse.Write.js`
as the single write-intercept point; there is no `createPlan` in `actions.js`. The
advisory duplicate guard must therefore live in THIS hook, run for `plans/**/*.md`
targets, and coexist with (never disturb) the enforcement delegation.

**Decision — advisory guard runs FIRST, additively, then delegate unchanged.**
`PreToolUse.Write.js` is rewritten from a bare `require` into a small hook body that:
1. Reads the tool payload from stdin ONCE (the raw JSON Claude Code passes to a
   PreToolUse hook: `{ tool_name, tool_input: { file_path, content, ... }, ... }`),
   buffering it so both this slice's guard and the delegated enforcement hook see the
   same input. Because `PreToolUse.Edit.js` reads stdin itself, the guard is factored
   so it does NOT consume the delegate's stdin: the guard is invoked from a single
   `run(payloadObj)` entry that accepts an ALREADY-PARSED payload (injectable in tests),
   and the production `main()` parses stdin once, runs the advisory guard, then hands
   the SAME buffered raw string to the enforcement delegate. (See Data Flow for the
   exact ordering and the "never consume the delegate's stdin twice" handling.)
2. Detects a `plans/**/*.md` target from `tool_input.file_path` using `globToRegex`
   from `src/lib/plan-coverage.js` — the SAME authoritative glob the enforcement hook
   already uses (no new glob file; consistent by construction). Non-plan targets skip
   the guard entirely and go straight to enforcement.
3. For a plan target: derives the draft **summary text** from `tool_input.content`
   (the plan markdown being written) and `await`s `checkDuplicate(summary, { projectPath,
   selfPlanPath })` from `s1`. `checkDuplicate` is async and fail-open (never throws,
   returns `[]` on empty index / no match / any error), so the guard cannot break a
   plan write.
4. Emits any returned matches as an **advisory warning to stderr** — one line per
   near-duplicate naming the plan slug and its similarity score (e.g.
   `⚠ possible duplicate: plans/functional/auth-middleware-refactor.md (similarity: 0.87)`)
   — AND appends the same warning to `.ctoc/logs/plan-index.log` (the parent's declared
   warning sink for programmatic/agent paths). Then it ALWAYS lets the write proceed.
5. **ALWAYS exits 0 for the advisory portion.** The advisory guard NEVER emits a block
   decision. The ONLY exit-non-zero / block behavior that remains is whatever the
   delegated `PreToolUse.Edit.js` enforcement already produces — untouched by this slice.

**Decision — the advisory guard's block/allow authority is exactly zero.** The guard
writes to stderr + log and returns; it never calls `process.exit(1)`, never prints a
`permissionDecision: "deny"` / hookSpecificOutput block payload, never mutates the
enforcement result. Enforcement (allow plan-covered writes, block un-planned writes)
is 100% owned by the delegated Edit hook and is bit-for-bit unchanged. This is the
"warns, never blocks" lock: the guard is purely informational.

**Decision — where the guard runs relative to enforcement.** The advisory warning is
emitted BEFORE the enforcement delegate runs, so the human sees the duplicate note
regardless of whether the write is ultimately allowed or blocked by enforcement. For
`plans/**/*.md` targets the whitelist in the enforcement hook already ALLOWS the write
(plans are whitelisted), so in practice both the warning surfaces and the write
proceeds — but ordering the warning first guarantees it is never swallowed by an
enforcement early-exit.

**Decision — `selfPlanPath`.** The draft's own normalized plan path
(`tool_input.file_path`, normalized to the repo-relative `plans/...` form) is passed as
`options.selfPlanPath` so a re-save of an existing plan never flags ITSELF as its own
duplicate (s1 forwards this as `search()`'s `excludePlanPath`).

**Decision — summary derivation is deliberately simple + documented.** `checkDuplicate`
treats `draftSummary` as opaque query text (s1's contract). This slice passes the plan's
title + first content section as the summary: extract the `title:` frontmatter value
(if present) plus the text up to a bounded character cap (`SUMMARY_CHAR_CAP = 2000`) of
`tool_input.content`. This is NOT PI4's canonical `extractSummary` — s1's spec mentions
a future `summary-extract.extractSummary`, but no such shipped module is confirmed in
this codebase at slice-write time. Rather than introduce an unshipped dependency (which
would strand this slice), the hook derives a bounded plain-text summary inline and
documents this in `## Decisions Taken Under Ambiguity`. If/when `extractSummary` ships,
swapping the inline derivation for it is a one-line change behind the same call site.

### Dependency Graph

```
src/hooks/PreToolUse.Write.js
  --requires (delegate)-->  ./PreToolUse.Edit.js            [enforcement, UNCHANGED]
  --lazy-requires-->        ../lib/plan-index/duplicate-guard.checkDuplicate   [PI5-s1, shipped]
  --lazy-requires-->        ../lib/plan-coverage.globToRegex  [authoritative glob, shipped]
  --lazy-requires-->        fs, path                        [stderr/log + path normalize]
tests/plan-index-duplicate-hook.test.js
  --drives-->               PreToolUse.Write.run(payload)   [the REAL hook entry, injected checkDuplicate]
  --asserts-->              stderr contains the advisory warning + slug + similarity
  --asserts-->              exit code / block-decision is 0 / allow (never blocks)
```

No cycle: the hook depends on `lib/` modules; nothing in `lib/` imports the hook. The
enforcement delegate (`PreToolUse.Edit.js`) is required exactly as before.

### File Specifications

#### File: `src/hooks/PreToolUse.Write.js`
**Action:** MODIFY
**Purpose:** The LIVE advisory duplicate-guard surface — runs `checkDuplicate` for
`plans/**/*.md` Write targets, surfaces a named warning + logs it, ALWAYS allows the
write; then delegates to the unchanged enforcement hook.
**Change Type:** modify-existing (additive; the enforcement delegation is preserved)

##### Exports (new — for testability, mirroring the hook family)
- `run(payload, deps)` → `Promise<{ warned: boolean, warnings: Array<{ plan, similarity }> }>`
  - Description: The advisory-guard entry, decoupled from stdin/exit so a test can drive
    it directly. Accepts an ALREADY-PARSED PreToolUse payload object and optional
    injected `deps` (`{ checkDuplicate, globToRegex, logWarn, stderr, projectPath }`).
    Detects a `plans/**/*.md` target, derives the summary, `await`s `checkDuplicate`,
    emits + logs any warnings via `deps.stderr`/`deps.logWarn`, and RESOLVES (never
    rejects, never exits). Returns `{ warned, warnings }` for assertions.
  - Returns `{ warned: false, warnings: [] }` when: not a plan target, no `content`,
    empty index / no match, or ANY internal error (fail-open — the advisory guard must
    never break a write).
  - Throws: never (single try/catch fail-open body).
- `main()` → `Promise<void>` (production path): reads stdin once → parses → `await run(parsed)`
  → hands the SAME buffered raw stdin string to the enforcement delegate. Exported so
  it can be invoked as the hook entry; guarded so `require('./PreToolUse.Edit.js')`
  enforcement still fires for every Write.

##### Changes
- **Replace** the bare `require('./PreToolUse.Edit.js');` with a hook body that:
  - **Adds** `async function run(payload, deps = {})` per the export spec above.
  - **Adds** `function isPlanTarget(filePath, globToRegex)` → `globToRegex('plans/**/*.md').test(normalizeRel(filePath))`.
  - **Adds** `function deriveSummary(content, filePath)` → title-frontmatter + bounded
    (`SUMMARY_CHAR_CAP = 2000`) plain-text prefix of `content`; returns `''` for
    non-string/empty `content` (→ `run` returns no-warn).
  - **Adds** `function normalizeRel(filePath)` → repo-relative `plans/...` slash-normalized
    form for `selfPlanPath` and glob matching (uses `path` only; cross-platform).
  - **Adds** `function emitWarnings(warnings, deps)` → for each `{ plan, similarity }`
    write one advisory line to stderr and append it to `.ctoc/logs/plan-index.log`
    (best-effort; a log-write failure is swallowed — never breaks the write).
  - **Preserves** the enforcement delegation: production `main()` still routes the Write
    through `PreToolUse.Edit.js` with the identical raw stdin, so plan-coverage
    enforcement and its logging are byte-for-byte unchanged. Detail the stdin handling
    so the delegate is not starved (see Data Flow); the guard MUST NOT consume the
    delegate's stdin. If clean single-read-then-hand-off is not achievable without
    touching `PreToolUse.Edit.js`, the guard runs off a re-buffered copy and the
    delegate reads stdin as today — documented in `## Decisions Taken Under Ambiguity`.
  - **Adds** `module.exports = { run, main, isPlanTarget, deriveSummary, normalizeRel };`
    and, at the bottom, an `if (require.main === module) main();`-style invocation so the
    file still works as a hook entry AND is importable by the test without executing.

##### Dependencies
- `require('./PreToolUse.Edit.js')` — the enforcement delegate (UNCHANGED behavior).
- LAZY `require('../lib/plan-index/duplicate-guard')` → `checkDuplicate` (PI5-s1).
- LAZY `require('../lib/plan-coverage')` → `globToRegex` (authoritative glob).
- `require('fs')`, `require('path')` — stderr/log write + repo-relative normalization.
  Cross-platform: `path.join`/`path.relative`, forward-slash normalization for globs.

##### Called By
- Claude Code's PreToolUse.Write hook trigger (production) → `main()`.
- `tests/plan-index-duplicate-hook.test.js` → `run(payload, deps)` directly.

##### Data Flow
```
Claude Code PreToolUse(Write)
  → main():
       raw = read stdin once (buffer to string)
       parsed = JSON.parse(raw)            (parse-fail → skip guard, still delegate)
       await run(parsed)                    (advisory: warn + log; NEVER blocks/exits)
       → delegate enforcement with `raw`    (PreToolUse.Edit.js — unchanged decision)

run(payload, deps):
  content   = payload.tool_input?.content
  filePath  = payload.tool_input?.file_path
  if !isPlanTarget(filePath) → return {warned:false, warnings:[]}   [non-plan: no guard]
  summary   = deriveSummary(content, filePath)
  if !summary → return {warned:false, warnings:[]}                  [no content: no guard]
  selfPath  = normalizeRel(filePath)
  warnings  = await checkDuplicate(summary, { projectPath, selfPlanPath: selfPath })
              (s1: async, fail-open → [] on empty index / no match / error)
  if warnings.length: emitWarnings(warnings, deps)                  [stderr + log]
  return { warned: warnings.length>0, warnings }
  (whole body in try/catch → catch returns {warned:false, warnings:[]}; never throws)
```

##### Error Handling
- stdin parse failure in `main()`: skip the advisory guard, STILL delegate enforcement
  (never let a malformed payload suppress the security hook).
- `checkDuplicate` throws/rejects: caught → treated as no warnings (s1 is already
  fail-open; this is belt-and-suspenders).
- log-file write failure: swallowed (best-effort); stderr warning still emitted.
- The advisory guard NEVER exits non-zero and NEVER emits a deny/block decision.

##### Cross-Platform Notes
- `normalizeRel` uses `path.relative` + replaces `path.sep` with `/` so the
  `plans/**/*.md` glob matches on Windows and POSIX identically.
- `.ctoc/logs/plan-index.log` path built with `path.join`; parent dir ensured with
  `fs.mkdirSync(dir, { recursive: true })` before append (best-effort, swallowed).
- No bash, no shell, Node-only.

### Test Plan

#### Tests: `tests/plan-index-duplicate-hook.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`assert`)

**Strategy — DRIVE THE REAL HOOK (the PI4 "measure is the human" lesson).** The tests
import the actual `src/hooks/PreToolUse.Write.js` module and call its exported
`run(payload, deps)` with a realistic `plans/**/*.md` Write payload. `checkDuplicate` is
injected via `deps.checkDuplicate` (a stub resolving fixture-scored matches — ZERO
network, ZERO real embedding), and `deps.stderr` is a capturing sink so the test can
assert the EXACT advisory text a human would see. This proves the warning SURFACES
through the real hook, not that a function returns a value in isolation.

##### Test Cases
1. **Near-duplicate plan write → advisory warning surfaces on stderr, write allowed.**
   - Setup: `payload = { tool_name:'Write', tool_input:{ file_path:'plans/functional/auth-layer-cleanup.md', content:'---\ntitle: Auth layer cleanup\n---\n## Goal\nRefactor auth.' } }`;
     `deps.checkDuplicate` → resolves `[{ plan:'plans/functional/auth-middleware-refactor.md', similarity:0.87 }]`;
     `deps.stderr` captures writes.
   - Assert: `run` resolves `{ warned:true, warnings:[...] }`; captured stderr CONTAINS
     `'auth-middleware-refactor'` AND `'0.87'` (the slug + the similarity score a human sees);
     `run` did NOT throw and returned normally (no block/deny in the result).
2. **Advisory NEVER blocks — result carries no deny/exit signal.**
   - Setup: same near-duplicate payload as case 1.
   - Assert: the resolved object has no block/deny field and `warned:true` coexists with a
     normal resolution; a spy on `process.exit` (or the injected exit) is NEVER called by
     `run`. (Pins "warns, never blocks".)
3. **Novel plan → no warning, no stderr noise.**
   - Setup: `deps.checkDuplicate` → `[]` (novel); plan-target payload.
   - Assert: `run` → `{ warned:false, warnings:[] }`; captured stderr is empty of the
     advisory prefix.
4. **Non-plan target → guard skipped, checkDuplicate never called.**
   - Setup: `payload.tool_input.file_path = 'src/lib/foo.js'`; spy `deps.checkDuplicate`.
   - Assert: `run` → `{ warned:false, warnings:[] }`; the spy was NEVER called (guard only
     fires for `plans/**/*.md`).
5. **Empty content → guard skipped (no summary), checkDuplicate never called.**
   - Setup: plan-target `file_path`, `content` absent/`''`; spy `deps.checkDuplicate`.
   - Assert: `run` → `{ warned:false, warnings:[] }`; spy NEVER called.
6. **Fail-open — checkDuplicate rejects → run resolves no-warn, does not reject.**
   - Setup: `deps.checkDuplicate` → rejects/throws; plan-target payload with content.
   - Assert: `await run(...)` RESOLVES `{ warned:false, warnings:[] }` (never rejects);
     stderr has no advisory line.
7. **selfPlanPath forwarded — a re-save cannot flag itself.**
   - Setup: spy `deps.checkDuplicate` capturing its `options`; plan-target
     `file_path:'plans/functional/auth-layer-cleanup.md'`.
   - Assert: the captured `options.selfPlanPath` normalizes to
     `'plans/functional/auth-layer-cleanup.md'` (forward-slash, repo-relative).
8. **Multiple near-duplicates → each surfaces on its own stderr line.**
   - Setup: `deps.checkDuplicate` → two matches (0.91, 0.86).
   - Assert: stderr contains BOTH slugs and BOTH scores; `warnings.length === 2`.
9. **Enforcement delegation preserved (smoke).** Require the module and assert it still
   `require`s `./PreToolUse.Edit.js` at load (module exports present; loading the Write
   hook does not throw), documenting that the advisory guard is additive and the
   enforcement path is intact. (A full enforcement-decision test is owned by the existing
   `PreToolUse.Edit` tests; this case only guards the additive wiring did not remove the
   delegate.)

##### Coverage Targets
- Line ≥ 80%, branch ≥ 80% on the added functions (plan-target vs not, warn vs no-warn,
  empty content, the fail-open catch, multi-warning loop all exercised).
- The primary case (1) asserts against captured stderr — the exact surface a human sees.

### Security Review
- [x] **Path traversal** — `file_path` is only glob-tested and normalized to a repo-
  relative string for `selfPlanPath`; the guard opens NO file from `file_path` (it reads
  `content` straight from the payload). The one file it writes is the fixed
  `.ctoc/logs/plan-index.log` under the project root, built with `path.join` — never a
  path derived from untrusted input.
- [x] **Input validation** — `content`/`file_path` type-checked before use; non-plan or
  non-string paths short-circuit; summary length-capped at `SUMMARY_CHAR_CAP`.
- [x] **No secrets** — none read or written.
- [x] **Safe file operations** — the only write is an append to the fixed advisory log
  path (dir ensured with recursive mkdir, best-effort, failures swallowed); no write is
  derived from tool input.
- [x] **Error messages** — the advisory line contains only the near-duplicate plan slug
  and a numeric similarity; no stack traces, no internal paths beyond the plan slug.
- [x] **Prototype pollution** — payload fields are read by known key
  (`tool_input.content`, `.file_path`); warnings are mapped into fresh literals; no merge
  from untrusted keys.
- [x] **Command injection** — no `exec`/`execSync`/shell; the warning is written via
  `process.stderr.write` / `fs.appendFileSync`, not a shell.
- [x] **Denial of enforcement** — the advisory guard cannot suppress the enforcement
  delegate: a parse failure or guard error still delegates to `PreToolUse.Edit.js`
  unchanged, so the security gate is never bypassed by a malformed plan write.

### Architecture Validation
- [x] **Dependency direction** — a `hooks/` module depending on `lib/` modules
  (`plan-index/duplicate-guard`, `plan-coverage`) and a sibling hook delegate; nothing in
  `lib/` imports back. Correct inward flow.
- [x] **No framework coupling** — the guard logic is plain Node; `checkDuplicate` and
  `globToRegex` are injected/lazy-required.
- [x] **Interface segregation** — `run` takes a parsed payload + narrow `deps`, not the
  whole hook environment.
- [x] **Open/closed** — the enforcement delegate is extended-around (guard runs before,
  delegate unchanged), not modified.
- [x] **Test independence** — each case injects its own `deps`; no shared mutable state,
  no ordering dependency; stderr sink is per-test.
- [x] **Cross-platform** — `path`-based normalization; forward-slash glob input; no shell.

## Execution Plan

### Step 8: TEST (TDD Red)
- [x] Create `tests/plan-index-duplicate-hook.test.js` with all 9 cases, driving the real
      `run(payload, deps)` with injected stub `checkDuplicate` + capturing `stderr` sink.
- [x] Run — all fail (the exported `run` / advisory behavior does not exist yet). Confirms Red.

### Step 9: PREPARE
- [x] Confirm `src/lib/plan-index/duplicate-guard.js` exports async `checkDuplicate`
      (PI5-s1 — must be merged first per `depends_on`). Confirm `globToRegex` is exported
      by `src/lib/plan-coverage.js` (shipped; used by `PreToolUse.Edit.js`). Confirm
      `PreToolUse.Edit.js` still reads stdin itself (delegation contract).

### Step 10: IMPLEMENT
- [x] Rewrite `src/hooks/PreToolUse.Write.js` from the bare delegator into the additive
      hook body per the File Specification: `run`, `isPlanTarget`, `deriveSummary`,
      `normalizeRel`, `emitWarnings`, `main`; preserve the `PreToolUse.Edit.js`
      enforcement delegation exactly; export the entries; guard the auto-invoke with
      `require.main === module`.
- [x] No stubs, no TODOs (no-stub rule). Document the summary-derivation and stdin-handoff
      choices in `## Decisions Taken Under Ambiguity`.

### Step 11: REVIEW
- [x] Self-review against Architecture Validation: confirm the advisory guard emits NO
      block/deny and never `process.exit(1)`; confirm the enforcement delegate is
      byte-for-byte unchanged in behavior; confirm no `lib → hooks` import.

### Step 12: OPTIMIZE
- [x] Confirm exactly ONE `await checkDuplicate(...)` per plan write; stdin read once;
      the log dir mkdir is best-effort and not on the hot path for non-plan writes.

### Step 13: SECURE
- [x] Verify the Security Review checklist holds in the final code — especially
      "denial of enforcement" (a guard fault never suppresses the delegate) and the
      fixed-path log write.

### Step 14: VERIFY
- [x] `node --test tests/plan-index-duplicate-hook.test.js` → `# fail 0`.
- [x] Coverage ≥ 80% on the added hook functions; 0 skipped, 0 flaky.
- [x] Full suite `node --test tests/*.test.js` → `# fail 0` (existing PreToolUse/Edit and
      enforcement tests still green — proves the delegation was not broken).

### Step 15: DOCUMENT
- [x] Hook header JSDoc: the advisory-guard contract (warns, never blocks), the
      `plans/**/*.md` scope, the stderr + `.ctoc/logs/plan-index.log` sink, and the
      preserved enforcement delegation.

### Step 16: FINAL-REVIEW
- [x] Confirm the parent acceptance criteria are proven: near-duplicate → named warning +
      similarity on stderr + log; hook exits 0 always; novel plan → no warning; empty
      index → no-op; enforcement intact. Ready for batched Gate 2 with sibling `s1`.

## Decisions Taken Under Ambiguity

- **LIVE surface is `src/hooks/PreToolUse.Write.js`, NOT a new `PostToolUse` hook.**
  PI5-s1's body twice forward-references the s2 caller as
  `src/hooks/PostToolUse.plan-index-duplicate-guard.js`. That was a stale guess made
  before this slice existed. The authoritative sources — the PI5 PARENT scope, the
  parent's `files:` list, and this task — all name `src/hooks/PreToolUse.Write.js` as the
  single write-intercept point. A `PreToolUse` advisory (warn BEFORE the write) also
  matches the parent's "advisory output is emitted before the file is committed to disk"
  acceptance criterion better than a `PostToolUse` (after-write) hook would. Decision:
  target `PreToolUse.Write.js`. The s1 `PostToolUse` reference is noted here as
  superseded, not silently ignored.
- **Advisory guard is strictly additive; enforcement is untouched.** `PreToolUse.Write.js`
  today delegates 100% to `PreToolUse.Edit.js` for plan-coverage ENFORCEMENT. This slice
  wraps the advisory duplicate warning AROUND that delegation (guard first, delegate
  unchanged). The advisory guard has zero block/allow authority; it never exits non-zero
  and never emits a deny payload. Enforcement decisions and their logging remain 100%
  owned by the Edit hook. Rationale: PI5 is locked "warns, never blocks", and the security
  gate must not be weakened by an informational feature.
- **stdin handled so the enforcement delegate is never starved.** A PreToolUse hook reads
  its payload from stdin, and `PreToolUse.Edit.js` reads stdin itself. To run the advisory
  guard on the SAME payload without consuming the delegate's stdin, production `main()`
  reads stdin ONCE, runs the guard on the parsed object, then delegates with the buffered
  raw string. Where a clean single-read-then-hand-off cannot be achieved without editing
  `PreToolUse.Edit.js` (out of scope), the guard runs off a re-buffered copy and the
  delegate reads stdin as today — either way the enforcement hook always receives its
  input. The test drives `run(payload)` directly (payload injected), so this production
  stdin detail is exercised at the integration boundary, not mocked away.
- **Summary derivation is a bounded inline extraction, not `extractSummary`.** s1 mentions
  a future `summary-extract.extractSummary`; no such shipped module is confirmed in this
  repo at slice-write time. To avoid stranding this slice on an unshipped dependency, the
  hook derives the summary inline: the `title:` frontmatter value plus a `SUMMARY_CHAR_CAP
  = 2000` plain-text prefix of the plan content. `checkDuplicate` treats this as opaque
  query text (its contract). If `extractSummary` ships later, it is a one-line swap behind
  the same call site.
- **Warning sink = stderr + `.ctoc/logs/plan-index.log`.** Matches the parent's declared
  sink for both interactive and programmatic/agent creation paths (stderr appears in the
  active Claude Code session; the log captures agent-created plans). No menu-specific
  render is added — that would miss agent creations.
- **`selfPlanPath` passed to prevent self-flagging.** The draft's own normalized path is
  forwarded so a re-save of an existing plan does not match itself (s1 maps it to
  `search()`'s `excludePlanPath`).

### Decisions taken during implementation (Steps 8–16, 2026-07-08)

- **`PreToolUse.Edit.js` runs its enforcement IIFE at require-time and reads stdin +
  `process.exit()`. Therefore the delegate is required ONLY on the production entry
  (`if (require.main === module) main()`), AFTER the advisory guard has run off the
  parsed stdin payload — NOT at module top-level.** A top-level `require('./PreToolUse.Edit.js')`
  (the old one-liner) would fire enforcement — and consume stdin / call `process.exit` —
  the instant a *test* imports the module, killing the test runner (this was the concrete
  RED symptom: the test process hung/exited on import). Requiring the delegate inside
  `main()` preserves enforcement byte-for-byte in production while keeping the module
  cleanly importable for `run(payload, deps)`-driven tests. The delegate require is wrapped
  in a try/catch that fails OPEN (exit 0) so an advisory-layer fault can never suppress a
  legitimate write — but it can also never *weaken* enforcement, because on the normal
  path the real Edit IIFE runs and owns the block/allow decision unchanged.
- **~~stdin is read ONCE in `main()` (`fs.readFileSync(0)`), the guard runs on the parsed
  object, then the delegate is required and re-reads stdin (fd 0) itself.~~ THIS DECISION
  WAS WRONG AND SHIPPED A CRITICAL BUG — SUPERSEDED by the PI5-s2 stdin fix below.** The
  claim that "fd 0 is a pipe that yields the same payload to both reads" is FALSE: **a pipe
  is single-consumer.** The first read (the advisory guard's `readStdinRaw`) DRAINS fd 0;
  the delegate's second `fs.readFileSync(0)` then read an EMPTY pipe → `stdinJson = null` →
  `getTargetFile(null) = null` → target `(unknown)` → the `plans/**/*.md` whitelist never
  matched → **EVERY plan-file write was BLOCKED (exit 1)**, and the escape-phrase bypass
  (which reads `transcript_path` from the same drained payload) broke. The false-green unit
  tests never caught it because they drive `run()` in isolation and never exercise the
  production `main()`/stdin/delegate path (the exact PI4 lesson). See the fix decision below.
- **File writes go through `src/lib/safe-fs` (`safeFs.mkdirSync` / `safeFs.appendFileSync`),
  NOT raw `fs`.** The repo's `security/detect-non-literal-fs-filename` ESLint rule (enforced
  by `tests/lint.test.js`) flags raw `fs.mkdirSync`/`fs.appendFileSync` on a computed path.
  `safe-fs` is the sanctioned wrapper (used by `enforcement-log.js` and `PreToolUse.Edit.js`)
  that validates the path and satisfies the rule. The only raw-`fs` use left is
  `fs.readFileSync(0)` (a literal fd, not flagged).
- **Advisory line format:** `⚠ possible duplicate: <plan-slug> (similarity: <score>)` — one
  line per near-duplicate — written to stderr AND appended (timestamped) to
  `.ctoc/logs/plan-index.log`. This exact text is what the test asserts surfaces (proving
  the human sees it), and it carries only the plan slug + numeric score (no stack traces,
  no internal paths).
- **Tests inject `projectPath` = a per-run `os.tmpdir()` scratch dir** so the advisory-log
  sink never touches the real project `.ctoc/logs/plan-index.log` — the suite stays
  hermetic and leaves no artifact in the repo.

### PI5-s2 CRITICAL FIX — drained-pipe → block-everything (pre-Gate-3 kickback, 2026-07-08)

- **Root cause: a pipe is SINGLE-CONSUMER; fd 0 was read twice.** `main()`'s advisory guard
  drained stdin (`readStdinRaw` → `fs.readFileSync(0)`), then `require('./PreToolUse.Edit.js')`
  fired the delegate's require-time IIFE, which read stdin AGAIN (`readStdinJson` →
  `fs.readFileSync(0)`) on the now-empty pipe. Result: `stdinJson = null` →
  `getTargetFile(null) = null` → target `(unknown)` → the `plans/**/*.md` whitelist never
  matched → **every plan-file write BLOCKED (exit 1)**, escape-phrase bypass broken (it reads
  `transcript_path` from the same null payload).
- **Fix — single-read-then-hand-off (both hooks touched, enforcement preserved byte-for-byte):**
  1. **`PreToolUse.Edit.js`** — the enforcement decision is extracted into an exported
     `async function enforce(stdinJson)` that does NO stdin read; it takes an already-parsed
     payload and runs the identical whitelist → CTOC-detect → coverage → escape-phrase → block
     flow with the identical exit codes and logging (the only change is that the local
     `stdinJson = readStdinJson()` line moved OUT of the function to the single caller). A
     direct-invocation IIFE `if (require.main === module) enforce(readStdinJson());` reads
     stdin ONCE when the file is run as an Edit hook — so Edit.js's own behavior is unchanged.
     Importing the module (from Write.js or a test) no longer reads stdin or runs enforcement.
  2. **`PreToolUse.Write.js`** — `main()` reads + parses stdin exactly ONCE, runs the advisory
     dup-guard on that payload (⚠ warning to stderr + log, never blocks), then calls the
     delegate's exported `enforce(parsed)` with that SAME parsed payload. NO second fd-0 read
     anywhere. Real enforcement fires on the real target: plan writes ALLOW, unplanned writes
     BLOCK, escape phrases work.
- **The test gap that let this ship (now closed): a SPAWNED-SUBPROCESS integration test.** The
  old suite drove `run()` in isolation and never exercised the production `main()`/stdin/delegate
  path (the PI4 lesson, verbatim). Added `execFileSync(process.execPath, [writeHookPath], { input })`
  cases against a temp CTOC project with a plan whitelist, asserting: (a) a `plans/**/*.md` write
  similar to an indexed plan → ⚠ warning AND exit 0 (allowed, not `(unknown)`/exit 1); (b) an
  unplanned/non-whitelisted write, no escape phrase → BLOCKED (exit non-zero); (c) an unplanned
  write WITH an escape phrase in the transcript → ALLOWED (exit 0); (d) a plan write with no
  duplicate → exit 0, no warning. These FAIL against the drained-pipe code and PASS after the fix.


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
