---
iron_loop: true
title: "The Stop hook blocks a premature idle stop while approved plans wait — bounded, fork-aware, fail-open, escapable, and always eventually able to stop"
type: implementation
parent_plan: none
depends_on: "00225-the-approved-queue-is-derived-continuation-work-and-shown-at-session-start"
priority: HIGH
program: continue-on-the-approved-queue
files:
  - "src/hooks/stop-continuation-gate.js"
  - "tests/stop-continuation-gate-queue.test.js"
---

# The Stop hook blocks an idle stop while approved plans wait (slice 2 of 2)

This is the **riskiest change in the mechanism** — it alters Stop-hook control
flow — so it is isolated in its OWN slice, on top of the already-reviewed pure
decision module from slice 1 (`00225`, its `depends_on`). Reverting this one
file's diff fully disables the derived-queue continuation and returns the hook to
its shipped behavior; the module from slice 1 becomes inert but harmless.

The change: when the shipped explicit-batch gate says "do not continue" **because
there is NO explicit batch at all**, consult the derived approved-queue decision
(`continuation-queue.shouldContinueQueue`). If there is approved, fork-free work
waiting, BLOCK the premature idle stop (exit 2) and re-inject an HONEST message
naming how many approved plans wait. Otherwise ALLOW the stop (exit 0).

## The control flow — precisely where the derived-batch decision is made

Today (`src/hooks/stop-continuation-gate.js`):
1. `CTOC_SKIP_CONTINUATION === '1'` → `exit 0` (escape).
2. resolve root (fail-open) → `exit 0` on failure.
3. `decision = continuation.shouldContinue(root)`; `if (!decision.continue) exit 0`.
4. `recordBlock`; `if (!persisted) exit 0` (WEDGE-1).
5. write "keep going" to stderr; `exit 2`.

New behavior — change ONLY step 3's `!decision.continue` branch. Add a
`continuationQueue = require('../lib/continuation-queue')`. When
`decision.continue` is truthy, the EXISTING explicit-batch path runs UNCHANGED
(steps 4–5). When `!decision.continue`:

```
// The explicit-batch gate declined. DERIVE from the approved queue ONLY when there
// is NO explicit continuation state at all — never override an explicit fork /
// complete / exhausted decision (those are the human's explicit batch talking).
let hasExplicit;
try { hasExplicit = continuation.status(projectRoot) !== null; } catch { process.exit(0); }
if (hasExplicit) process.exit(0);            // an explicit batch decided; honor it

let qDecision;
try { qDecision = continuationQueue.shouldContinueQueue(projectRoot); } catch { process.exit(0); }
if (!qDecision || !qDecision.continue) process.exit(0); // empty queue / fork / exhausted

// Approved, fork-free work waits. Record a block (bounds the loop). WEDGE-1: if it
// cannot be persisted, the bound cannot advance → FAIL OPEN and allow the stop.
let persisted;
try { persisted = continuationQueue.recordQueueBlock(projectRoot, qDecision.depth); } catch { process.exit(0); }
if (!persisted) process.exit(0);

writeStderr(
  `\n[CTOC] continuation-gate BLOCKED stop: ${qDecision.depth} approved plan(s) ` +
  `are waiting to be built. CTOC is autonomous building — do NOT stop while approved, ` +
  `fork-free work waits. Drive the next approved plan to completion, checkpointing at ` +
  `each boundary. Stop ONLY when the approved queue is empty or a genuine fork needs ` +
  `the human (register it with continuationQueue.registerQueueFork). ` +
  `Escape: CTOC_SKIP_CONTINUATION=1.\n`
);
process.exit(2);
```

The `continuation.status(projectRoot) !== null` guard is the SAFETY BOUNDARY: the
derived regime activates only when the explicit regime has no state file, so the
two never stack and an explicit fork/complete/exhausted is always honored as
allow-stop. (A completed explicit batch clears its own state in its normal
lifecycle, after which the derived path is free to run — documented under
Decisions.)

## The five safety properties, each preserved with its acceptance criterion

**BOUNDED** — the derived batch stands down after a bounded number of no-progress
blocks (`MAX_QUEUE_BLOCKS`, from slice 1), and observed progress resets the count.
*AC*: spawn the real hook repeatedly against a temp project holding a CONSTANT
undrainable approved queue and no explicit state; the hook exits 2 for a bounded
run and then flips to exit 0 (`exhausted`) within `MAX_QUEUE_BLOCKS` blocks, and
stays exit 0 while the queue is unchanged.

**FORK-AWARE** — a registered queue fork (or a plan kicked back out of the queue)
allows the stop. *AC*: with a non-empty approved queue, after
`continuationQueue.registerQueueFork(root,'X')` the hook exits 0 (never blocks on
work that needs the human); after `resolveQueueFork` it blocks again (exit 2).
Also: an ACTIVE explicit batch with a pending fork makes the hook exit 0 via the
existing path — the derived path never runs (the `status !== null` guard).

**FAIL-OPEN** — any error reading the queue/ledger, or a counter-persist failure,
→ allow the stop (exit 0). *AC*: (a) an unreadable/oversized queue enumerates to
depth 0 → exit 0; (b) with `.ctoc/state` unwritable so `recordQueueBlock` returns
false, the hook exits 0 (never blocks on a frozen counter); (c) any throw in the
derived path is caught → exit 0. The hook NEVER exits non-zero on an internal
error.

**ESCAPABLE** — `CTOC_SKIP_CONTINUATION=1` allows the stop. This is unchanged (the
hook's first line, before any derived logic). *AC*: spawn the hook with that env
and a non-empty approved queue → exit 0.

**HONEST** — the re-injected message names what remains. *AC*: when the hook
blocks (exit 2) on the derived queue, stderr contains the count N and the phrase
"approved plan(s) are waiting to be built".

## The "can always eventually stop" proof (its own acceptance criterion)

Claim: for any sequence of Stop events with no explicit continuation state, the
session ALWAYS eventually stops. Proof:
- `recordQueueBlock` increments `effectiveBlocks(state, depth) + 1` each block.
  When depth does NOT strictly decrease between recorded blocks, `effectiveBlocks`
  equals the persisted count, so it rises by exactly 1 per block. After
  `MAX_QUEUE_BLOCKS` no-progress blocks, `shouldContinueQueue` returns `exhausted`
  → exit 0.
- The only way to avoid the bound is genuine progress (depth strictly decreasing),
  and depth is a non-negative integer, so a strictly-decreasing run is finite and
  reaches 0 → `approved queue empty` → exit 0.
- Independently: `CTOC_SKIP_CONTINUATION=1` → exit 0; a registered fork → exit 0;
  a `recordQueueBlock` persist failure → exit 0.
Therefore no infinite no-stop is sustainable. *AC (kill-test)*: drive the real hook
in a loop against an undrainable approved queue and assert an exit-0 is reached
within `MAX_QUEUE_BLOCKS` blocks; and assert the escape hatch and a registered fork
each force exit 0 immediately.

## Decisions Taken Under Ambiguity

(Executor continues here, `###` subheadings only.)

### Derived path activates only when `continuation.status(root) === null`
The derived regime must never override an explicit batch's decision. Gating on
"no explicit state file" is the fail-safe boundary: during an explicit batch
(active, forked, complete-but-uncleared, or exhausted) the explicit decision
rules, and the derived path is silent. A completed explicit batch clears its state
via its normal lifecycle (`continuation.complete`/`clear`), after which the
approved queue drives continuation. Erring toward NOT stacking two regimes is the
safe direction (it can only ever allow MORE stops).

### The block message points at `registerQueueFork`, not the explicit `registerFork`
A session continuing on the DERIVED queue registers a fork with
`continuationQueue.registerQueueFork` (which works with no explicit batch). The
re-injected message names that function so the agent pauses the correct regime.

### No new state, no new export in this slice
This slice only edits the hook and adds its spawn test. All decision/bound/fork
state lives in slice 1's module. Reverting this file is a complete rollback.

## Step 8 — TEST (TDD, write first, run, see red)
Write `tests/stop-continuation-gate-queue.test.js` FIRST and see red. Spawn the
REAL hook via `spawnSync(process.execPath, [HOOK], { cwd, env })` (mirror
`tests/continuation.test.js`); assert on `.status` (exit code) and `.stderr`.
Build fixtures with a real `.ctoc/` marker, real `plans/todo/` plans, and real
ledger approvals (via `approval-ledger.writeEntry` with `content`, as in slice 1).
Cases (each an AC above):
- No explicit state + empty approved queue → exit 0.
- No explicit state + one approved fork-free todo plan → exit 2, stderr names "1
  approved plan(s) are waiting to be built".
- ESCAPABLE: same, but `CTOC_SKIP_CONTINUATION=1` → exit 0.
- FORK-AWARE: after `registerQueueFork` → exit 0; after `resolveQueueFork` → exit 2.
- BOUNDED + CAN-ALWAYS-STOP kill-test: undrainable constant queue; loop the hook;
  exit 0 reached within `MAX_QUEUE_BLOCKS` blocks and stays exit 0.
- FAIL-OPEN: `.ctoc/state` made unwritable → exit 0 (counter can't persist); a bad
  root / unreadable queue → exit 0.
- BOUNDARY: an ACTIVE explicit batch (`continuation.startBatch`) still exits 2 via
  the EXISTING path (not the queue path); an explicit PENDING FORK exits 0 and the
  derived path does NOT fire even with a non-empty approved queue.
Account for every green; fixtures only under `os.tmpdir()`.

## Step 9 — PREPARE
Re-read the current `stop-continuation-gate.js` (the exact exit-code protocol and
`writeStderr`) and slice 1's `continuation-queue` exports. Confirm
`continuation.status` returns `null` for a project with no explicit batch state.

## Step 10 — IMPLEMENT
Edit `src/hooks/stop-continuation-gate.js`: add
`const continuationQueue = require('../lib/continuation-queue');`, and replace the
single `if (!decision || !decision.continue) process.exit(0);` line with the
derived-queue branch shown above (explicit-state guard → shouldContinueQueue →
recordQueueBlock/WEDGE-1 → honest stderr → exit 2). The explicit-batch `continue`
path (recordBlock + its stderr + exit 2) is UNCHANGED. Sub-items:
- `src/hooks/stop-continuation-gate.js` (the derived branch)

## Step 11 — REVIEW
The explicit-batch path is byte-for-byte unchanged. The derived path fires only on
`status === null`. Every error and every persist failure exits 0 (fail-open). The
escape hatch precedes all derived logic. The message is honest (names N). Reverting
this file is a complete, safe rollback.

## Step 12 — OPTIMIZE
The hook does near-zero work when no batch and an empty approved queue (two cheap
reads + a bounded plans enumeration), and runs no subprocess — safe to ship enabled
for every marketplace user, exactly as the shipped gate is.

## Step 13 — SECURE
No new file writes beyond slice 1's state file (via the module). The stderr message
contains only a count and fixed guidance — no absolute path, no filesystem error
string, no plan content. Cross-platform: no shell, `process.execPath` in tests only.

## Step 14 — VERIFY
`npx eslint src/hooks/stop-continuation-gate.js tests/stop-continuation-gate-queue.test.js --max-warnings 0`;
`node --test tests/*.test.js` fail 0; `npm test` (redirect, read `$?`, no pipe)
PASS; false-green + both reachability + gate-words fences pass. The hook stays
registered in `.claude-plugin/hooks.json` (unchanged). Coverage floor 99
(normal-dev-machine, thin margin) — cover the reachable branches added.

## Step 15 — DOCUMENT
Update the hook's header comment to state the derived-approved-queue behavior and
its `status === null` boundary alongside the existing OPT-IN/FORK-AWARE/BOUNDED/
FAIL-OPEN/ESCAPABLE contract. The plan record is the rest.

## Step 16 — FINAL-REVIEW
A live session with approved, fork-free plans in `todo/` (or a recoverable
in-progress plan) no longer goes idle — the Stop hook re-injects "drive the next
approved plan," bounded so an undrainable queue always eventually stops, fork-aware
and escapable so it never traps the human, and fail-open so any error allows the
stop. An explicit batch's behavior is unchanged.
