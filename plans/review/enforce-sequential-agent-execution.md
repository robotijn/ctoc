---
stage: todo
created: 2026-02-10
approved_by: human
approved_at: 2026-02-10T21:00:00.000Z
gate_crossed: implementation → todo
---

# Enforce Sequential Agent Execution

## Problem

When the user triggers "Start agent" from the dashboard, todo plans should be processed **one at a time in FIFO order**. Currently there is no enforcement mechanism — Claude could spawn multiple parallel agents for multiple todo plans, causing:

- File conflicts when plans modify overlapping files
- Unpredictable results from interleaved changes
- Later plans not seeing earlier plan's changes
- Difficult debugging when 3+ agents are writing simultaneously

The same applies to in-progress plans: only ONE agent should be active at a time.

## Requirements

1. **Single agent at a time** — When "Start agent" is selected, spawn exactly ONE agent that processes todo plans sequentially (oldest first)
2. **Lock mechanism** — Prevent a second agent from starting while one is already active
3. **FIFO order** — Always pick the oldest plan from `todo/` first
4. **Lifecycle per plan**: pick from `todo/` → move to `in-progress/` → implement all steps → move to `review/`
5. **Stop flag** — "Stop agent" sets a flag; agent checks after each plan and stops gracefully
6. **Status visibility** — Dashboard shows which plan the agent is working on
7. **No parallel override** — Even with multiple todo plans, never spawn parallel agents

## Discussion Decisions

**D1: PID file lock** — Use `.ctoc/agent.lock` containing PID + plan name. On "Start agent", check if PID is alive. If stale (process dead), remove lock and proceed. Auto-clears on crash.

**D2: Stale in-progress cleanup** — On "Start agent", scan `in-progress/` for orphaned plans (no matching live PID in lock file) and move them to `review/`. Prevents accumulation of stuck plans.

**D3: Lock scope = todo executor only** — The implementation planner agent (triggered by approve → implementation gate) runs independently since it writes to a single plan file. The PID lock only governs the todo executor agent.

**D4: Human gate enforcement hardening** — The pre-tool hook must block ALL Bash `mv` commands that move files between `plans/` stage directories. This forces all plan transitions through `approvePlan()` in `lib/actions.js`, which checks human gate requirements. Raw `mv plans/implementation/X plans/todo/X` via Bash must be intercepted and rejected. This prevents the LLM from bypassing the menu flow.

**D5: Agent ID + PID lock** — Claude Code subagents share the same `process.pid`, so PID alone can't distinguish between agents. The lock file uses `{ pid, agentId: crypto.randomUUID(), plan, startedAt }`. The `agentId` uniquely identifies each agent invocation. PID is used for crash detection (if Claude Code process dies, PID becomes stale). The `agentId` is returned by `acquireLock()` and must be passed to `releaseLock()` and `updateLockPlan()` to verify ownership.

**D6: CLI helper for agent plan moves** — D4 blocks raw `mv` of plan files, but the executor agent needs to move plans through stages. Solution: create `scripts/move-plan.js <stage/file> <destination>` that wraps `movePlan()` from `lib/actions.js`. The Bash hook whitelists `node scripts/move-plan.js` commands (they go through the same validation as `approvePlan()`). The agent calls `node scripts/move-plan.js todo/X.md in-progress` instead of raw `mv`. The script validates that non-gate transitions are allowed and rejects gate transitions without the approval marker.

**D7: Cleanup logs to `.ctoc/logs/cleanup.json`** — Keep plan files clean. Stale cleanup events are logged separately, not appended to plan content.

## Success Criteria

- [ ] Only one todo executor agent can be active at any time
- [ ] PID file lock at `.ctoc/agent.lock` with stale detection
- [ ] Agent processes plans in FIFO order (oldest first)
- [ ] Each plan moves through: todo → in-progress → review
- [ ] "Stop agent" gracefully stops after current plan completes
- [ ] Dashboard shows active plan name and status
- [ ] Attempting to start a second agent shows a clear message
- [ ] Stale in-progress plans cleaned up on agent start
- [ ] CLAUDE.md sequential rule is enforced programmatically, not just by convention
- [ ] Pre-tool hook blocks raw `mv` of plan files between stage directories
- [ ] All plan transitions forced through `approvePlan()` which enforces human gates

## Implementation Plan

### Overview

The implementation adds a PID-based lock file at `.ctoc/agent.lock` that prevents concurrent todo executor agents. It introduces a new `lib/agent-lock.js` module with all lock logic, modifies `lib/state.js` and `lib/menu-screens.js` for dashboard integration, updates `lib/actions.js` with orchestration functions, and adds a test file.

### Files to Create

#### 1. `lib/agent-lock.js` (NEW)

Core lock management module. All PID lock logic lives here.

```js
// Dependencies: fs, path, project-root

// Constants
const LOCK_FILE = 'agent.lock';  // relative to .ctoc/
const STOP_FILE = 'agent.stop';  // relative to .ctoc/

// --- Lock File Format ---
// JSON: { pid: number, agentId: string (UUID), plan: string, startedAt: string }

/**
 * getLockPath(projectPath) -> string
 *   Returns path.join(projectPath, '.ctoc', 'agent.lock')
 *   Ensures .ctoc/ directory exists (mkdirSync recursive)
 */

/**
 * getStopPath(projectPath) -> string
 *   Returns path.join(projectPath, '.ctoc', 'agent.stop')
 */

/**
 * isPidAlive(pid) -> boolean
 *   Uses process.kill(pid, 0) inside try/catch.
 *   Returns true if signal succeeds (process exists), false on error.
 *   On Windows (process.platform === 'win32'), falls back to:
 *     child_process.execSync(`tasklist /FI "PID eq ${pid}"`)
 *     and checks if output includes the PID string.
 */

/**
 * acquireLock(projectPath, planName) -> { acquired: boolean, error?: string, existingLock?: object }
 *
 *   1. Read lock file if exists
 *   2. If lock exists:
 *      a. Parse JSON
 *      b. Call isPidAlive(lock.pid)
 *      c. If alive: return { acquired: false, error: `Agent already active (PID ${lock.pid}, working on "${lock.plan}")`, existingLock: lock }
 *      d. If dead: log stale lock removal, delete lock file, continue
 *   3. Write new lock file: { pid: process.pid, agentId: crypto.randomUUID(), plan: planName, startedAt: new Date().toISOString() }
 *   4. Return { acquired: true, agentId }
 */

/**
 * releaseLock(projectPath) -> void
 *   Delete lock file if it exists. Also delete stop file if present.
 *   No error if files don't exist.
 */

/**
 * updateLockPlan(projectPath, planName) -> void
 *   Read current lock, update the `plan` field, write back.
 *   Used when agent moves to next plan in the queue.
 */

/**
 * readLock(projectPath) -> object | null
 *   Read and parse lock file. Return null if not exists or parse error.
 */

/**
 * isLocked(projectPath) -> { locked: boolean, lock?: object, stale?: boolean }
 *   Read lock file. If exists, check if PID is alive.
 *   Returns { locked: true, lock } if alive.
 *   Returns { locked: false, stale: true, lock } if PID is dead.
 *   Returns { locked: false } if no lock file.
 */

/**
 * requestStop(projectPath) -> void
 *   Write empty file at getStopPath(projectPath).
 *   The running agent checks for this file after each plan completes.
 */

/**
 * isStopRequested(projectPath) -> boolean
 *   Return fs.existsSync(getStopPath(projectPath))
 */

/**
 * clearStop(projectPath) -> void
 *   Delete stop file if exists.
 */

// Exports: acquireLock, releaseLock, updateLockPlan, readLock,
//          isLocked, requestStop, isStopRequested, clearStop,
//          isPidAlive, getLockPath, getStopPath
```

#### 2. `tests/agent-lock.test.js` (NEW)

Unit tests using `node:test` (matching existing test patterns).

```
Tests to include:

1. acquireLock — acquires lock when none exists
   - Verify lock file created with correct PID, plan, startedAt
   - Verify returns { acquired: true }

2. acquireLock — rejects when live lock exists
   - Create lock with current PID (guaranteed alive)
   - Attempt second acquire
   - Verify returns { acquired: false, error: contains "already active" }

3. acquireLock — clears stale lock and acquires
   - Write lock file with PID 999999999 (guaranteed dead)
   - Acquire should succeed
   - Verify old lock removed, new lock written

4. releaseLock — removes lock and stop files
   - Create lock file and stop file
   - Call releaseLock
   - Verify both deleted

5. releaseLock — no error when no lock exists
   - Call on empty directory, should not throw

6. updateLockPlan — updates plan name in lock
   - Acquire lock for "plan-a"
   - Update to "plan-b"
   - Read lock, verify plan is "plan-b", PID unchanged

7. isLocked — returns locked for live PID
   - Acquire lock
   - Verify isLocked returns { locked: true }

8. isLocked — returns stale for dead PID
   - Write lock with dead PID
   - Verify isLocked returns { locked: false, stale: true }

9. isLocked — returns false when no lock
   - Verify isLocked returns { locked: false }

10. requestStop / isStopRequested / clearStop
    - requestStop creates file
    - isStopRequested returns true
    - clearStop removes it
    - isStopRequested returns false

11. isPidAlive — current process is alive
    - isPidAlive(process.pid) should return true

12. isPidAlive — dead PID returns false
    - isPidAlive(999999999) should return false

Each test uses a temp directory (fs.mkdtempSync) and cleans up in afterEach.
```

### Files to Modify

#### 3. `lib/state.js` — Enhance `getAgentStatus()`

**Current behavior**: Reads `.ctoc/state/agent.json` which is set/cleared manually by `setAgentStatus()` / `clearAgentStatus()`.

**Change**: Make `getAgentStatus()` also check the PID lock file for ground-truth liveness. The lock file is authoritative; `agent.json` is supplementary detail.

```
getAgentStatus(projectPath):
  1. Read lock file via agent-lock.readLock(root)
  2. If lock exists:
     a. Check isPidAlive(lock.pid)
     b. If alive:
        - Read agent.json for supplementary info (step, phase, task)
        - Return { active: true, plan: lock.plan, pid: lock.pid,
                   startedAt: lock.startedAt, elapsed: timeAgo(lock.startedAt),
                   step, phase, task from agent.json }
     c. If dead (stale):
        - Return { active: false, stale: true, stalePlan: lock.plan }
  3. If no lock:
     - Return { active: false }
```

**Note**: Keep `setAgentStatus()` and `clearAgentStatus()` as-is for now. They update `agent.json` with step/phase/task detail. The lock file governs liveness; `agent.json` governs progress display.

#### 4. `lib/menu-screens.js` — Dashboard agent status display

**File: `buildDashboardTable()`** (lines 78-116)

**Current behavior** (line 104): `const isAgentActive = counts.inProgress > 0;`

**Change**: Use the lock-aware `getAgentStatus()` instead of just counting in-progress plans.

```
Replace:
  const isAgentActive = counts.inProgress > 0;

With:
  const isAgentActive = agent.active;
```

The `agent` variable is already computed on line 82 via `getAgentStatus(root)`. Once `getAgentStatus()` is updated (step 3 above), this automatically reflects PID-based liveness.

**Also update the active display** (lines 106-113):

```
Current:
  if (isAgentActive) {
    const plansDir = getPlansDir(root);
    const inProgressPlans = readPlans(path.join(plansDir, 'in-progress'));
    const currentPlan = inProgressPlans.length > 0 ? ... : 'unknown';
    out += `  ● Active: ${currentPlan}\n`;

Replace with:
  if (isAgentActive) {
    out += `  ● Active: ${agent.plan || 'unknown'}`;
    if (agent.pid) out += ` (PID ${agent.pid})`;
    out += '\n';
  } else if (agent.stale) {
    out += `  ⚠ Stale lock: ${agent.stalePlan || 'unknown'} (process died)\n`;
  } else {
    out += `  ○ Idle\n`;
  }
```

**File: `dashboardCommands()`** (lines 157-189)

**Current behavior** (line 161): `const isAgentActive = counts.inProgress > 0;`

**Change**: Same as above — use `agent.active` from the lock-aware status.

```
Replace:
  const isAgentActive = counts.inProgress > 0;

With:
  const agent = getAgentStatus(root);
  const isAgentActive = agent.active;
```

The `agent` variable isn't currently computed in `dashboardCommands()`, so add it.

#### 5. `lib/actions.js` — Add agent orchestration functions

Add three new exported functions at the bottom of the module.

**5a. `startAgent(projectPath)`**

This is what `claude:start-agent` calls. It handles lock acquisition, stale cleanup, and returns instructions.

```js
/**
 * Start the todo executor agent.
 *
 * @param {string} projectPath - Project root
 * @returns {{ started: boolean, error?: string, plan?: object, cleanedUp?: string[] }}
 */
function startAgent(projectPath) {
  const root = projectPath || findProjectRoot();
  const { acquireLock, clearStop } = require('./agent-lock');
  const { readPlans, getPlansDir } = require('./state');

  // 1. Try to acquire lock
  const lockResult = acquireLock(root, 'initializing');
  if (!lockResult.acquired) {
    return {
      started: false,
      error: lockResult.error
    };
  }

  // 2. Clear any leftover stop flag
  clearStop(root);

  // 3. Clean up stale in-progress plans (D2)
  const cleanedUp = cleanupStaleInProgress(root);

  // 4. Get next plan from todo queue
  const plansDir = getPlansDir(root);
  const todoPlans = readPlans(path.join(plansDir, 'todo'));

  if (todoPlans.length === 0) {
    // Nothing to do — release lock
    const { releaseLock } = require('./agent-lock');
    releaseLock(root);
    return {
      started: false,
      error: 'No plans in todo queue'
    };
  }

  // 5. Pick oldest plan (FIFO — already sorted by readPlans)
  const nextPlan = todoPlans[0];

  // 6. Update lock with actual plan name
  const { updateLockPlan } = require('./agent-lock');
  updateLockPlan(root, nextPlan.name);

  // 7. Move plan to in-progress
  const newPath = startExecution(nextPlan.path, root);

  // 8. Update agent status for dashboard display
  setAgentStatus(root, {
    active: true,
    plan: nextPlan.name,
    step: 7,
    phase: 'TEST',
    task: 'Starting implementation'
  });

  return {
    started: true,
    plan: { name: nextPlan.name, path: newPath },
    cleanedUp,
    remainingTodo: todoPlans.length - 1
  };
}
```

**5b. `stopAgent(projectPath)`**

This is what `claude:stop-agent` calls. Sets the stop flag.

```js
/**
 * Request agent stop (graceful — after current plan completes).
 *
 * @param {string} projectPath - Project root
 * @returns {{ stopped: boolean, message: string }}
 */
function stopAgent(projectPath) {
  const root = projectPath || findProjectRoot();
  const { isLocked, requestStop } = require('./agent-lock');

  const lockStatus = isLocked(root);
  if (!lockStatus.locked) {
    return {
      stopped: false,
      message: 'No agent is currently running'
    };
  }

  requestStop(root);

  return {
    stopped: true,
    message: `Stop requested. Agent will finish "${lockStatus.lock.plan}" then stop.`
  };
}
```

**5c. `advanceAgent(projectPath)`**

Called after the current plan is implemented and moved to review. Checks for stop flag, picks next plan.

```js
/**
 * Advance the agent to the next todo plan.
 * Called after current plan completes (moved to review).
 *
 * @param {string} projectPath - Project root
 * @returns {{ next: boolean, plan?: object, stopped?: boolean, done?: boolean }}
 */
function advanceAgent(projectPath) {
  const root = projectPath || findProjectRoot();
  const { isStopRequested, releaseLock, updateLockPlan, clearStop } = require('./agent-lock');
  const { readPlans, getPlansDir } = require('./state');

  // 1. Check stop flag
  if (isStopRequested(root)) {
    releaseLock(root);
    clearAgentStatus(root);
    return { next: false, stopped: true };
  }

  // 2. Get next from todo
  const plansDir = getPlansDir(root);
  const todoPlans = readPlans(path.join(plansDir, 'todo'));

  if (todoPlans.length === 0) {
    releaseLock(root);
    clearAgentStatus(root);
    return { next: false, done: true };
  }

  // 3. Pick oldest and move to in-progress
  const nextPlan = todoPlans[0];
  updateLockPlan(root, nextPlan.name);
  const newPath = startExecution(nextPlan.path, root);

  setAgentStatus(root, {
    active: true,
    plan: nextPlan.name,
    step: 7,
    phase: 'TEST',
    task: 'Starting implementation'
  });

  return {
    next: true,
    plan: { name: nextPlan.name, path: newPath },
    remainingTodo: todoPlans.length - 1
  };
}
```

**5d. `cleanupStaleInProgress(projectPath)`** (internal helper)

```js
/**
 * Clean up orphaned in-progress plans (D2).
 * If no lock is active for an in-progress plan, move it to review.
 *
 * @param {string} projectPath - Project root
 * @returns {string[]} Names of cleaned-up plans
 */
function cleanupStaleInProgress(projectPath) {
  const root = projectPath || findProjectRoot();
  const plansDir = getPlansDir(root);
  const inProgressDir = path.join(plansDir, 'in-progress');
  const plans = readPlans(inProgressDir);
  const cleanedUp = [];

  for (const plan of plans) {
    // Log cleanup event to .ctoc/logs/cleanup.json (keep plan files clean)
    const logDir = path.join(root, '.ctoc', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, 'cleanup.json');
    const log = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, 'utf8')) : [];
    log.push({ plan: plan.name, from: 'in-progress', to: 'review', reason: 'orphaned', at: new Date().toISOString() });
    fs.writeFileSync(logFile, JSON.stringify(log, null, 2));

    movePlan(plan.path, 'review', root);
    cleanedUp.push(plan.name);
  }

  return cleanedUp;
}
```

**5e. Update `module.exports`**

Add to the existing exports:

```js
  startAgent,
  stopAgent,
  advanceAgent,
  cleanupStaleInProgress
```

#### 6. `commands/menu.md` — Update `claude:start-agent` / `claude:stop-agent` documentation

Update the Claude Actions table entries:

```
Current:
| `claude:start-agent` | Spawn background executor agent |
| `claude:stop-agent` | Set stop flag for agent |

Replace with:
| `claude:start-agent` | Call startAgent(). If started: implement the plan sequentially (Steps 7-15). After each plan completes (moved to review), call advanceAgent() to get next plan or stop. |
| `claude:stop-agent` | Call stopAgent(). Shows confirmation message. Agent will finish current plan then stop. |
```

#### 7. `lib/menu-screens.js` — Import `getAgentStatus` (already imported)

The import on line 19 already includes `getAgentStatus`. No new import needed, but verify after `getAgentStatus` is updated in `state.js` that it uses the lock-aware version.

### Detailed Change Sequence

The implementation should be done in this order:

1. **Create `lib/agent-lock.js`** — standalone module, no dependencies on changed files
2. **Create `tests/agent-lock.test.js`** — test the lock module in isolation
3. **Run tests** — `node --test tests/agent-lock.test.js`
4. **Modify `lib/state.js`** — update `getAgentStatus()` to use lock file
5. **Modify `lib/menu-screens.js`** — update dashboard display and `dashboardCommands()`
6. **Modify `lib/actions.js`** — add `startAgent`, `stopAgent`, `advanceAgent`, `cleanupStaleInProgress`
7. **Update `commands/menu.md`** — document the new agent protocol
8. **Create `scripts/move-plan.js`** — CLI helper for agent plan moves (D6)
9. **Modify `hooks/PreToolUse.Bash.js`** — add plan-move blocking + whitelist (D4)
10. **Run full test suite** — `node --test tests/*.test.js`

#### 8. `scripts/move-plan.js` (NEW) — CLI helper for agent plan moves (D6)

```js
#!/usr/bin/env node
/**
 * Move a plan between stages via CLI.
 * Used by executor agents (who can't call lib/actions.js directly).
 *
 * Usage: node scripts/move-plan.js <stage/file.md> <destination>
 * Example: node scripts/move-plan.js todo/my-plan.md in-progress
 *
 * Validates:
 * - Source file exists
 * - Destination is a valid stage
 * - Human gates cannot be crossed (no approval marker check — gates are:
 *   functional→implementation, implementation→todo, review→done)
 * - Non-gate transitions are allowed freely
 */

const { movePlan } = require('../lib/actions');
const { findProjectRoot } = require('../lib/project-root');

const HUMAN_GATES = {
  functional: 'implementation',
  implementation: 'todo',
  review: 'done'
};

const [ref, destination] = process.argv.slice(2);
if (!ref || !destination) {
  console.error('Usage: node scripts/move-plan.js <stage/file.md> <destination>');
  process.exit(1);
}

const [sourceStage] = ref.split('/');

// Block human gate transitions
if (HUMAN_GATES[sourceStage] === destination) {
  console.error(`⛔ Human gate: ${sourceStage} → ${destination} requires human approval via menu.`);
  process.exit(1);
}

const root = findProjectRoot();
const planPath = path.join(root, 'plans', ref);
movePlan(planPath, destination, root);
console.log(`Moved ${ref} → ${destination}/`);
```

#### 9. `hooks/PreToolUse.Bash.js` — Block raw plan file moves (D4)

**Current behavior**: Only blocks write commands before Step 7 and git commit before Step 14. Does NOT check for `mv`/`cp` of plan files.

**Change**: Add a plan-move detection block that runs BEFORE the existing checks. This fires on ANY Bash command that moves plan files between stage directories, regardless of Iron Loop step.

```js
// Add at the top of main(), before the state-dependent checks:

// D4: Block raw mv/cp of plan files between stage directories
// All plan transitions MUST go through approvePlan() in lib/actions.js
const PLAN_STAGES = 'functional|implementation|todo|in-progress|review|done';
const PLAN_MOVE_PATTERN = new RegExp(
  `\\b(mv|cp)\\b.*plans\\/(${PLAN_STAGES})\\/`
);

// Whitelist: node scripts/move-plan.js (controlled API for agents)
const isMoveScript = /\bnode\b.*scripts\/move-plan\.js\b/.test(command);

if (PLAN_MOVE_PATTERN.test(command) && !isMoveScript) {
  const c = colors;
  let output = '\n';
  output += '='.repeat(70) + '\n';
  output += `${c.red}⛔ HUMAN GATE ENFORCEMENT — PLAN MOVE BLOCKED${c.reset}\n`;
  output += '='.repeat(70) + '\n\n';
  output += 'BLOCKED COMMAND:\n';
  output += `  ${command.length > 60 ? command.substring(0, 57) + '...' : command}\n\n`;
  output += `${c.yellow}REASON:${c.reset} Plan files cannot be moved with raw mv/cp.\n`;
  output += 'All plan transitions must go through the menu:\n';
  output += '  Approve → validates → checks human gate → moves file\n\n';
  output += `${c.cyan}Use the dashboard menu to approve plan transitions.${c.reset}\n`;
  output += '\n' + '='.repeat(70) + '\n';
  writeToTerminal(output);
  process.exit(1);  // BLOCK — exit code 1 prevents the command
}
```

**Why this works:**
- `process.exit(1)` in PreToolUse hooks BLOCKS the tool call (unlike `human-gate-check.js` which exits 0 and only reverts after)
- Catches both `mv plans/implementation/X plans/todo/X` and variations
- The LLM cannot bypass this — the hook runs before every Bash command
- Internal code (`movePlan()` in `lib/actions.js`) uses `fs.renameSync()`, not Bash `mv`, so it's not affected

**Test**: Try `mv plans/todo/some-plan.md plans/in-progress/` in Bash — should be blocked with the gate enforcement message.

### Edge Cases to Handle

1. **Lock file with invalid JSON** — `readLock()` returns null, treated as no lock
2. **PID 0 or negative** — `isPidAlive()` returns false for invalid PIDs
3. **Lock file permissions** — if `.ctoc/` is read-only, `acquireLock()` throws; caller should catch and report
4. **Race condition on lock acquire** — two Claude sessions could read "no lock" simultaneously. Mitigated by: (a) single user typically, (b) the lock is checked again when `startExecution` moves the file -- if file is gone, second agent fails gracefully
5. **Agent crash mid-plan** — plan stays in `in-progress/`. Next `startAgent()` call runs `cleanupStaleInProgress()` which moves it to review
6. **Stop flag already set when start is called** — `startAgent()` explicitly calls `clearStop()` before beginning
7. **No todo plans** — `startAgent()` releases lock immediately and returns error message
8. **`in-progress/` dir doesn't exist** — `readPlans()` already handles missing dirs (returns [])

### Test Plan

#### Unit Tests (`tests/agent-lock.test.js`)

See test list in section 2 above. All 12 tests exercise the lock module independently using temp directories.

#### Integration Tests (manual or in `tests/state.test.js`)

Add tests for the updated `getAgentStatus()`:
- With active lock file: returns `{ active: true, plan, pid }`
- With stale lock file: returns `{ active: false, stale: true }`
- With no lock file: returns `{ active: false }`

#### End-to-End Verification (manual)

1. Start agent via dashboard "Start agent" -- verify lock file created at `.ctoc/agent.lock`
2. Try "Start agent" again -- verify error message "Agent already active"
3. Check dashboard -- verify plan name shown under AGENT section
4. Press "Stop agent" -- verify `.ctoc/agent.stop` created
5. After current plan completes -- verify agent stops, lock removed
6. Create orphan in `in-progress/` manually, then "Start agent" -- verify it's moved to `review/`
7. Kill Claude process while agent is running -- verify next "Start agent" detects stale PID and proceeds

#### Existing Test Regression

Run `node --test tests/*.test.js` to verify:
- `tests/menu-screens.test.js` -- dashboardCommands and dashboardPipeline still produce valid JSON
- `tests/state.test.js` -- agent status structure tests still pass
- `tests/actions.test.js` -- existing approval/rejection flows unaffected
