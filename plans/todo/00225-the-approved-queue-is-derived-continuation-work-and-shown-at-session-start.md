---
approved_by: human
approved_at: 2026-07-22T12:10:26.396Z
gate_crossed: implementation → todo
---

---
iron_loop: true
title: "The approved build queue counts as continuation work without an explicit startBatch — and the human sees how much waits at session start"
type: implementation
parent_plan: none
depends_on: none
priority: HIGH
program: continue-on-the-approved-queue
files:
  - "src/lib/continuation-queue.js"
  - "tests/continuation-queue.test.js"
  - "src/hooks/SessionStart.js"
---

# The approved queue is derived continuation work (slice 1 of 2)

The mechanism the owner asked for: **when CTOC starts it must not stop while
there is approved, fork-free work in the queue.** The shipped continuation gate
(`src/lib/continuation.js` + `src/hooks/stop-continuation-gate.js`) already makes
a session CONTINUE — but ONLY when a human explicitly called
`continuation.startBatch`. The owner's chosen design is that **the approved queue
itself IS the batch**: a live session with approved, fork-free plans in
`plans/todo/` (and recoverable `plans/in-progress/`) must not go idle, with no
explicit `startBatch` call.

This slice builds the DECISION LOGIC for that — a new pure module,
`src/lib/continuation-queue.js`, that answers "is the approved queue undrained
continuation work?" — and makes it **live and reachable** by surfacing the queue
depth in the session-start banner (the HONEST property's session-start face). It
touches **no Stop-hook control flow**; the actual block-on-idle-stop is the
riskier change and is isolated into slice 2 (`00226`, which `depends_on` this
slice) so it can be reviewed and rolled back alone.

## Why a SEPARATE module and a SEPARATE state file (reuse, do not replace)

`continuation.js` is safety-adjacent Stop-hook code with hard-won invariants
(WEDGE-1/2/3, the `HARD_CEILING` clamp, fail-open reads). This slice does **not
edit it**. The derived-queue logic lives in its own module with its own state
file (`.ctoc/state/continuation-queue.json`), so the shipped explicit-batch state
semantics are byte-for-byte untouched. The two regimes never share a file and
never stack (slice 2 activates the derived path ONLY when there is no explicit
continuation state at all — that boundary lives in the hook, slice 2).

The new module MIRRORS the shipped mechanism's shape deliberately: a pure
`shouldContinueQueue` read (the analog of `shouldContinue`), a sole-writer
`recordQueueBlock` that returns its persist-success boolean (the WEDGE-1 analog),
a `registerQueueFork` / `resolveQueueFork` pair (the analog of
`registerFork`/`resolveFork`), a bounded block budget (the analog of
`maxBlocks`/`HARD_CEILING`), and fail-open reads throughout.

## The decision — how the derived batch is computed, and where

### `src/lib/continuation-queue.js` (CREATE) — the derived-queue decision

Constants:
- `QUEUE_STATE_REL = path.join('.ctoc', 'state', 'continuation-queue.json')`.
- `MAX_QUEUE_BLOCKS = 100` — the ceiling on CONSECUTIVE no-progress blocks. It is
  a bound on *no-progress* stops, not raw stops: any observed drain resets it (see
  `effectiveBlocks`), so it need not be large. It is the hard guarantee that an
  undrainable queue cannot trap the session forever (the failure mode this whole
  slice is designed against — see "The risk" below).

State shape (`.ctoc/state/continuation-queue.json`):
```
{ blocks: number, lastQueueDepth: number, forkPending: boolean, forkReason: (string|null) }
```

Functions:

- `queueStatePath(root)` → absolute path; `readQueueState(root)` → object|null
  (fail-open: absent/unreadable/corrupt → `null`, exactly like `continuation.read`);
  `writeQueueState(root, state)` → boolean (best-effort, mkdir -p, mirrors
  `continuation.write`); `clearQueue(root)` → void (best-effort unlink).

- `approvedFreeQueue(root)` → `{ refs: string[], depth: number }`. THE ENUMERATOR.
  For `stage` in `['todo', 'in-progress']`: read `<plansDir>/<stage>` for `*.md`
  files; for each, build `planPath = path.join(plansDir, stage, file)` and
  `ref = `${stage}/${file}``; call
  `require('./approval-residency').isApprovedForCoverage(planPath, stage, root)`
  and INCLUDE the ref only when `.approved === true`. FAIL-OPEN and fault-isolated:
  a missing/unreadable stage dir contributes zero (never throws); a per-plan
  classify fault skips that plan. `depth = refs.length`. This is the ONE place the
  "approved" and "fork-free-by-construction" predicates are applied:
    - **Approved** = a Gate-2 ledger entry vouches for it. `isApprovedForCoverage`
      is CTOC's single encoding of "is this resident plan approved" — for `todo`
      the edge is `todo`, for `in-progress` the edge is also `todo` (a building
      plan carries the Gate-2 entry it crossed with; see
      `approval-residency.COVERAGE_STAGE_EDGE`). A plan with NO ledger entry
      (`no-ledger-entry`) or a tampered spec (`hash-mismatch`) is EXCLUDED — an
      unapproved plan is never authorized continuation work. This is the guardrail
      "Do NOT block on a plan that is NOT approved."
    - **Fork-free by construction** — a plan resident in `todo`/`in-progress` is
      POST-gate; its decision forks were answered before it crossed Gate 2. A plan
      that hits a real fork mid-build is kicked back to a pre-gate stage and thereby
      LEAVES this queue automatically (the queue shrinks). The remaining explicit
      fork signal is `forkPending` below.

- `effectiveBlocks(state, depth)` → number. THE SINGLE progress rule, used by BOTH
  the decision and the recorder so they cannot drift:
  `const progressed = Number.isFinite(state.lastQueueDepth) && depth < state.lastQueueDepth;`
  `return progressed ? 0 : (Number.isFinite(state.blocks) ? state.blocks : 0);`
  Observed drain (depth strictly below the last recorded depth) resets the budget
  to 0; otherwise the persisted count carries. This is what makes the bound track
  REAL lack of progress and self-heal the instant the queue starts draining again.

- `shouldContinueQueue(root)` → `{ continue, reason, depth?, refs?, fork?, exhausted? }`.
  PURE READ, writes nothing (mirrors `shouldContinue`). Coerces numerics toward
  ALLOW (a safety gate fails open):
  1. `state = readQueueState(root) || {}`.
  2. `if (state.forkPending === true)` → `{ continue:false, reason:`queue fork pending — ${state.forkReason || 'human decision required'}`, fork:true }`.
  3. `const { refs, depth } = approvedFreeQueue(root);`
  4. `if (!(depth > 0))` → `{ continue:false, reason:'approved queue empty', depth:0 }`.
  5. `const eff = effectiveBlocks(state, depth);`
     `if (eff >= MAX_QUEUE_BLOCKS)` → `{ continue:false, reason:'queue continuation block-budget exhausted — standing down', exhausted:true, depth }`.
  6. else → `{ continue:true, reason:`${depth} approved plan(s) waiting to be built`, depth, refs }`.

- `recordQueueBlock(root, depth)` → boolean. THE SOLE WRITER (mirrors `recordBlock`).
  Reads current state, computes `const next = effectiveBlocks(state, depth) + 1;`
  writes `{ blocks: next, lastQueueDepth: depth, forkPending: state.forkPending === true, forkReason: state.forkPending === true ? (state.forkReason || null) : null }`,
  and RETURNS the `writeQueueState` boolean. WEDGE-1 analog: if the counter cannot
  be persisted, the bound cannot advance, so the caller (slice 2's hook) MUST fail
  open — hence the boolean is returned, never swallowed.

- `registerQueueFork(root, reason)` → object. Reads-or-creates state, sets
  `forkPending:true`, `forkReason: reason ? String(reason) : 'human decision required'`,
  writes, returns state. Mirrors `continuation.registerFork`, but works with NO
  pre-existing state (the derived regime has no `startBatch`). Its live caller is
  the executor agent (prose-driven), exactly as `continuation.registerFork`'s is
  today (referenced in `agents/coordinator/cto-chief.md`). The module is already
  reachable without it — the Stop hook (slice 2) consumes `shouldContinueQueue`,
  and `approvedQueueBannerLine` is consumed by SessionStart in THIS slice.

- `resolveQueueFork(root)` → object|null. Clears `forkPending`/`forkReason`.

- `approvedQueueBannerLine(root)` → string. THE LIVE CONSUMER for THIS slice.
  Fail-open wrapper: `try { const { depth } = approvedFreeQueue(root); return depth > 0 ? `\nApproved queue: ${depth} plan(s) ready to build` : ''; } catch { return ''; }`.
  Returns `''` for a falsy/invalid root or depth 0, so the banner is unchanged for
  a project with no approved work — purely ADDITIVE, crash-safe (SessionStart runs
  every session and must never throw), mirroring `formatDatabasesLine`.

### `src/hooks/SessionStart.js` (MODIFY) — make the module live and honest

Wire `approvedQueueBannerLine` into the banner so the module is reachable from a
LIVE root (the SessionStart hook is registered in `.claude-plugin/hooks.json`) and
the human sees the queue depth the continuation gate will act on. In
`generateContext`, add:
```
const approvedQueueLine = require('../lib/continuation-queue')
  .approvedQueueBannerLine(rootInfo && typeof rootInfo.root === 'string' ? rootInfo.root : null);
```
and splice `${approvedQueueLine}` into the banner body immediately AFTER the
existing `${frameworksLine}` (same additive slot the databases/frameworks lines
use). The lazy `require` matches the file's existing lazy-require style and keeps
the module reachable from a hook root. Legacy 5-arg `generateContext` callers pass
no `rootInfo` → root is `null` → the helper returns `''` → their banners are
unchanged (this is why the existing `generateContext` coverage tests, which call
it with no `rootInfo`, stay green).

## The risk this slice is built against

The failure mode I am most worried about: **a session that CANNOT STOP because the
queue looks non-empty but is undrainable** — a plan that fails its gate every time
and never leaves `todo/`, so `depth` never reaches 0. Pure re-derivation of `depth`
would then block forever. The defense is `MAX_QUEUE_BLOCKS` + `effectiveBlocks`:
consecutive no-progress blocks are counted and, at the ceiling, `shouldContinueQueue`
returns `exhausted` → the stop is allowed. Real progress (a strictly smaller depth)
resets the count to 0, so a genuinely-draining queue is never cut off, and a
previously-exhausted queue SELF-HEALS the moment it drains again. This is proven by
the kill-test in Step 8.

## Decisions Taken Under Ambiguity

(Executor continues here, `###` subheadings only.)

### Separate state file, never a shared one
The derived queue uses `.ctoc/state/continuation-queue.json`, never
`continuation.json`. Rationale: the shipped explicit-batch state carries hard
safety invariants; a second regime writing the same file is how a divergence gets
in. Two files, one regime each.

### `MAX_QUEUE_BLOCKS = 100`, a bound on NO-PROGRESS blocks
Because `effectiveBlocks` resets on any observed drain, the bound only bites when
there is ZERO progress across that many consecutive stops — which is exactly the
undrainable-queue signature. 100 is generous enough never to cut off a slow-but-
draining build, finite enough to guarantee eventual stop. It is deliberately much
smaller than `continuation.HARD_CEILING` (500) because, unlike an explicit batch
that only ever advances, this budget self-resets on progress.

### `in-progress` counts as recoverable work via the `todo` edge
`isApprovedForCoverage(planPath, 'in-progress', root)` classifies against the
`todo` gate (a building plan carries its Gate-2 entry). So an approved,
mid-build in-progress plan is recoverable continuation work — matching the owner's
"(or a recoverable in-progress plan)". A squatted in-progress plan with no ledger
entry is still excluded.

### Fork-awareness is the `forkPending` flag PLUS natural queue-shrink
Post-gate plans have no open gate questions by construction, so per-plan
question-store checks are not applied here. The explicit fork signal is
`registerQueueFork`; a plan that forks mid-build also leaves the queue when it is
kicked back. Both routes make `shouldContinueQueue` allow the stop.

## Step 8 — TEST (TDD, write first, run, see red)
Write `tests/continuation-queue.test.js` FIRST and see red. Real temp-dir state,
real ledger entries, NOTHING mocked (mirror `tests/continuation.test.js`'s style).
Helper: create `plans/todo/<f>.md`, then approve it for real via
`approval-ledger.writeEntry(slugFromPlanPath(p), { content, stage_from:'implementation', stage_to:'todo', approved_by:'human' }, root)`
(supplying `content` records `hash_scope:'specification'`, so `isApprovedForCoverage`
matches). Cases:
- **approvedFreeQueue counts only approved plans**: an approved todo plan is IN;
  a todo plan with NO ledger entry is OUT; a todo plan whose content changed after
  approval (hash-mismatch) is OUT; an approved in-progress plan is IN.
- **fail-open enumeration**: a bad/empty root and an absent stage dir yield
  `depth:0` (never throws).
- **shouldContinueQueue**: empty queue → `continue:false, reason:'approved queue empty'`;
  one approved plan → `continue:true, depth:1`; message names the count.
- **FORK-AWARE (AC)**: after `registerQueueFork(root,'X')`, `shouldContinueQueue`
  → `continue:false, fork:true` EVEN with a non-empty approved queue; after
  `resolveQueueFork`, → `continue:true` again.
- **BOUNDED + CAN-ALWAYS-EVENTUALLY-STOP (AC, the kill-test)**: with a CONSTANT
  undrainable approved queue (depth fixed) and no fork, loop
  `shouldContinueQueue`→`recordQueueBlock(root, depth)`; assert it flips to
  `continue:false, exhausted:true` within `MAX_QUEUE_BLOCKS` iterations and STAYS
  allow-stop while depth is constant.
- **SELF-HEAL (AC)**: after exhaustion, drop the depth (remove an approved plan)
  and assert `shouldContinueQueue` returns `continue:true` again (progress resets
  the budget).
- **FAIL-OPEN persist (AC)**: `recordQueueBlock` returns `false` when the state
  cannot be written (make `.ctoc/state` unwritable / a file where the dir should be);
  it must not throw.
- **approvedQueueBannerLine**: `''` for depth 0 / bad root; `\nApproved queue: N plan(s) ready to build` for depth N; never throws.
Account for every green individually; no fixture writes outside `os.tmpdir()`.

## Step 9 — PREPARE
Re-read `continuation.js` (the shape to mirror: WEDGE-1 return-the-persist-boolean,
fail-open reads), `approval-residency.isApprovedForCoverage` (the approved
predicate + the `todo`/`in-progress` edges), and `state.getPlansDir`. Confirm
`writeEntry` with `content:` records `hash_scope:'specification'` so the test's
approved plans actually classify as approved.

## Step 10 — IMPLEMENT
Create `src/lib/continuation-queue.js` per the spec above (constants, state
helpers, `approvedFreeQueue`, `effectiveBlocks`, `shouldContinueQueue`,
`recordQueueBlock`, `registerQueueFork`, `resolveQueueFork`, `clearQueue`,
`approvedQueueBannerLine`; `module.exports` all). Wire `approvedQueueBannerLine`
into `SessionStart.generateContext` after `${frameworksLine}`. Sub-items:
- `src/lib/continuation-queue.js`
- `src/hooks/SessionStart.js` (one lazy require + one splice)

## Step 11 — REVIEW
No edit to `continuation.js`. Separate state file. `effectiveBlocks` is the ONE
progress rule, used by both the decision and the recorder (no drift).
`approvedFreeQueue` is fault-isolated and fail-open. SessionStart change is purely
additive and guarded on `rootInfo.root`. The module is reachable from the live
SessionStart hook (`approvedQueueBannerLine`) — not dead code.

## Step 12 — OPTIMIZE
Enumeration is bounded (few plans) and reads each plan once via
`isApprovedForCoverage`. No redundant re-stat. `shouldContinueQueue` stays a pure
read; the sole write is `recordQueueBlock`.

## Step 13 — SECURE
Only reads within `<root>/plans/**` and writes only
`<root>/.ctoc/state/continuation-queue.json`, all via `safe-fs` (NUL/empty-path
guarded). Refs are `stage/file.md` built from `readdirSync` names under a fixed
stage — no traversal reaches outside `plans/`. No absolute path or filesystem
error string is placed in the banner or any message (the banner shows only a
count). Cross-platform: `path.join`, `safe-fs`, no shell.

## Step 14 — VERIFY
`npx eslint src/lib/continuation-queue.js src/hooks/SessionStart.js tests/continuation-queue.test.js --max-warnings 0`;
`node --test tests/*.test.js` fail 0; `npm test` (redirect to a file, read `$?`,
never pipe) PASS; false-green + BOTH reachability + gate-words fences pass —
in particular the reachability baseline count does NOT grow (the new module is
reached from the SessionStart banner). Coverage floor 99 (normal-dev-machine, thin
margin) — cover the reachable branches you add.

## Step 15 — DOCUMENT
Module-level JSDoc stating the derived-queue contract, the separate state file,
and the self-healing bound. No CLAUDE.md count edit (growing counts are generated
by `release.js`).

## Step 16 — FINAL-REVIEW
The module decides "is the approved queue undrained continuation work?" honestly
and fails open everywhere; the session-start banner shows the human how much
approved work waits; `continuation.js` is untouched; slice 2 can now wire the
Stop-hook block on top of this without any further module change.
