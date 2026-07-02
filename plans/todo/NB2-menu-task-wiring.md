---
iron_loop: true
approved_by: human
approved_at: 2026-07-02T11:40:23.760Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-02T11:00:25.970Z
gate_crossed: functional → implementation
---

---
title: "NB2 — Menu Task Wiring"
type: functional
status: functional
created: 2026-07-01
program: ctoc-menu-ux
parent_vision: "vision/nonblocking-menu-task-plane.md"
priority: HIGH
depends_on: [NB1]
files:
  - "src/lib/menu-screens.js"
  - "src/lib/task-view.js"
  - "src/commands/menu.js"
  - "src/tabs/overview.js"
  - "tests/menu-task-wiring.test.js"
  - "README.md"
  - "tests/readme-numbers.test.js"
---

# NB2 — Menu Task Wiring

> Surfaces the NB1 registry through `menu.js`: task subcommands, a TASKS dashboard
> section, task-board + task-detail screens, and an INBOX "background tasks" line.
> Pure policy/state rendering — this stub does NOT launch agents (that is NB3).

## Problem Statement

NB1 gives CTOC a durable, safe registry, but it is invisible: there is no way for a
human to add a task, see what is running or queued, inspect a finished task's
result, or navigate to the next action a completed task points to. The menu must
expose the registry through the two-plane model (vision §3, §3c, §3d): a fast
Navigation plane that reads and renders task state. Without this wiring, the
protocol rewrite (NB3) would have no commands to call and no screens to return to,
and the user could never see or steer the queue (vision Success Criterion 2 — "the
queue is visible").

`menu.js` remains the policy + state brain: it computes screens and owns the
registry via NB1, but it never launches anything. Every subcommand here is a pure
read or a pure registry mutation delegated to NB1.

## Business Alignment

- Realizes vision Success Criterion 2 (queue visible, user can see run/queue state)
  and the presentation half of Criterion 4 (completions surface as pull-based inbox
  items).
- Implements vision §3c task subcommands and §3d "completions become inbox items,"
  honoring **D3** (pull-based inbox integration plus a subtle one-line notice, never
  a disruptive push/modal).
- Keeps the Navigation plane instant (vision §3) — task screens are pure computation
  over the registry, consistent with "menu render is already fast."
- Preserves menu discipline: task screens are numbered menus with `[0]` back, and a
  done task routes the human to its next action rather than acting for them.

## User Stories

- As the user, I want `menu task` subcommands (add / start / complete / fail /
  cancel / list / board), so that task lifecycle state can be recorded and read
  through one interface wrapping NB1.
- As the user, I want a TASKS section on the dashboard, so that I can see at a glance
  how many tasks are running, queued, and done without leaving my current flow.
- As the user, I want a task-board screen, so that I can browse all background tasks
  grouped by status and drill into any one.
- As the user, I want a task-detail screen for a finished task, so that I can read
  its result summary and follow a next-action route (e.g. to the plan it advanced or
  the gate it reached).
- As the user, I want an INBOX "background tasks" line, so that completed work slots
  into the existing inbox as a pull notice, never hijacking my current screen.

## Acceptance Criteria (BDD)

### Task subcommands

```gherkin
Scenario: Adding a task returns an id and a decision
  Given the registry (NB1) is available
  When `menu task add` is invoked with kind, label, plan, touches, gitOp
  Then a task id is returned
  And a scheduler decision (run or queue, with reason) is returned
  And the task is persisted with status "queued"

Scenario: Lifecycle transitions are recorded
  Given a queued task exists
  When `menu task start` is invoked for it
  Then its status becomes "running"
  And when `menu task complete` is invoked with a result, its status becomes "done"
  And `menu task fail` sets status "failed" with the failure recorded
  And `menu task cancel` removes it from the runnable set

Scenario: List renders the current registry
  When `menu task list` is invoked
  Then it returns every task with its status, label, and plan
  And the output is derived purely from the registry (no agent launch)
```

### TASKS dashboard section

```gherkin
Scenario: Dashboard summarizes task counts
  Given 2 running, 1 queued, and 3 done tasks in the registry
  When the dashboard overview is rendered
  Then a TASKS section shows "2 running", "1 queued", and "3 done"
  And the queued line names what it waits on (e.g. "waits: pi1")

Scenario: Empty registry hides noise
  Given no background tasks exist
  When the dashboard is rendered
  Then the TASKS section is absent or shows an empty state
  And rendering does not error
```

### Task-board and task-detail screens

```gherkin
Scenario: Task board groups by status
  Given tasks in running, queued, done, and failed states
  When the task-board screen is rendered
  Then tasks are grouped under their status headings
  And each entry is selectable to open its detail screen
  And the screen offers a numbered menu with [0] back

Scenario: Done task detail shows result and next action
  Given a task with status "done" and a result summary
  When its task-detail screen is rendered
  Then the result summary is shown
  And a next-action route is offered (to the plan it advanced or the gate reached)
  And selecting it navigates there without performing the action automatically
```

### INBOX integration

```gherkin
Scenario: Completions appear as an inbox line
  Given 3 tasks completed and produced decisions awaiting review
  When the dashboard INBOX is rendered
  Then a "background tasks" line reflects the completed work
  And it is a pull notice — it does not change the user's current screen

Scenario: A task that reached a human gate is an inbox item, not auto-crossed
  Given a done task whose plan reached a human gate
  When the inbox is rendered
  Then it appears as a "Gate N ready" item
  And no gate transition has been performed
```

## Scope

**In:**
- `menu task` subcommands: add, start, complete, fail, cancel, list, board —
  each wrapping NB1's registry (read or mutate), returning data for rendering.
- TASKS dashboard section (running / queued / done counts, queued wait reasons).
- Task-board screen (grouped by status, drill-in, numbered menu with `[0]` back).
- Task-detail screen (done → result summary + next-action route).
- INBOX "background tasks" line as a pull notice; gate-reached tasks as inbox items.
- Behavioral tests (pure JS, no native deps), coverage ≥ 80%.

**Out:**
- Launching or dispatching agents; the WORK/NAV turn protocol (→ NB3).
- Deciding run/queue rules (owned by NB1's scheduler; NB2 only calls it).
- Session-restart reconciliation, failure surfacing, sweeps (→ NB4).
- Any human-gate transition (gates stay foreground and are never auto-crossed).

---

# Implementation Details (Steps 5 PLAN · 6 DESIGN · 7 SPEC)

> Produced by the implementation-planner after reading the full ancestry
> (vision `nonblocking-menu-task-plane.md` §3/§3c/§3d/D1–D5 → this functional plan)
> and the actual code: `src/lib/task-registry.js` (NB1, shipped), `src/commands/menu.js`,
> `src/lib/menu-screens.js`, `src/tabs/overview.js`, `src/areas/*`, `src/lib/inbox.js`,
> `src/lib/plan-validator.js`, and the menu driver protocol `src/commands/menu.md`.

## Architecture Decision Record (ADR)

**Context.** The functional plan named `src/commands/menu.js` as the file that owns
"the JSON state machine: routes, `{text,ask,actions}` screens, `buildDashboardTable`,
the INBOX render, section drill-ins." **Ground truth differs.** `src/commands/menu.js`
is a thin CLI shim: its `main()` reads argv and delegates to
`require('../lib/menu-screens').route(splitArgs, projectPath)`, then `console.log`s the
JSON. Every route, `buildDashboardTable`, and the INBOX block actually live in
**`src/lib/menu-screens.js`**. The interactive TUI mounts `src/areas/pipeline.js`
(and `src/areas/inbox.js`); `src/tabs/overview.js.render()` is imported by `menu.js`
**only for `.reset()`** and is not mounted — editing its `render()` is dead code.

**Decision.** NB2's real integration surface is **`src/lib/menu-screens.js`** (routes +
`buildDashboardTable` + INBOX line) plus the **new pure module `src/lib/task-view.js`**.
`src/commands/menu.js` needs **no change** (it already forwards all argv to `route()`).
`src/tabs/overview.js` gets **no change** (unmounted; the canonical dashboard the human
sees is the JSON one Claude renders from `buildDashboardTable`, which is exactly what
the BDD ACs exercise). Both are retained in `files:` for coverage transparency and marked
`NO CHANGE`. Adding a `src/lib/*` module bumps the module count **111 → 112**, so
`README.md` and `tests/readme-numbers.test.js` join `files:`.

**Consequences.** All dashboard changes are **text-only inside `buildDashboardTable`** —
`dashboardPipeline`'s `ask`/`actions` are untouched, so its option count stays 4 and its
question count stays 1/2 (protects `inbox-stale-stream.test.js:148/140/161` and
`e2e-menu-lifecycle.test.js:314/332`). New navigation is two **new routes** (`tasks`,
`task <id>`) and a `menu task <sub>` dispatch branch — additive, no existing screen
altered.

## Decisions Taken Under Ambiguity (no-stub / async-overnight)

1. **Integration file correction (menu.js → menu-screens.js).** See ADR. `menu.js` and
   `overview.js` are `NO CHANGE`; the wiring lands in `menu-screens.js`.
2. **`cancel` maps to the terminal `failed` status, not a new `cancelled` status.**
   NB1's `STATUSES` set is frozen (`queued|running|done|failed|orphaned`) and
   `updateTask` rejects any status outside it. Introducing `cancelled` would modify NB1
   (out of scope, shipped). NB2 models cancel as `updateTask(reg, id, {status:'failed',
   result:{ok:false, summary:'cancelled', cancelled:true}})` — this "removes it from the
   runnable set" per the AC (failed is terminal; excluded from `nextRunnable`/`canRun`),
   and `task-view` renders `result.cancelled===true` as **"cancelled"** to the human. A
   first-class `cancelled` status is deferred to NB1/NB4 if ever wanted.
3. **Dashboard entry point to the board is deferred to NB3.** NB2 makes the queue
   **visible** (TASKS section text + INBOX line) and **navigable** (routes `tasks`,
   `task <id>`). It does **not** add a "Tasks" option or ride-along question to
   `dashboardPipeline`, because that would break the 4-option / question-count invariants
   above and would require editing `menu.md` precedence rules (NB3 owns the protocol +
   `menu.md`). The board is reachable via `node menu.js tasks`; NB3 wires the interactive
   entry.
4. **Board selection uses `inputMode:'task-select'` (free-text task ids), mirroring
   `plan-select`.** AskUserQuestion caps at 4 options; a board with running+queued+done+
   failed tasks exceeds it (the AC's own scenario has ≥4 tasks). Reusing the established
   free-text pattern (`stageBrowse`'s `inputMode:'plan-select'`) keeps every entry
   selectable at any count. **Rule 1 stays sacred:** task ids are `t<n>` (never bare
   numbers), so a bare digit still opens a *plan* and never a task. NB2 does **not** edit
   `menu.md`; formal documentation of `task-select` in the driver protocol is an NB3
   note. The board's `text`+`prompt` are self-describing ("reply `t3` to open, `b` back").
5. **Completion `result` shape carries optional next-action metadata, but NB2 never
   computes gate membership nor crosses a gate.** `result = {ok, summary, nextAction?,
   gate?}`. `nextAction` is a **navigation route string** (e.g. `plan review/<file>.md`),
   `gate` an optional integer. The *caller* (NB3 / Claude) supplies them on
   `menu task complete`; NB2 only **stores** and **renders** them. The task-detail
   next-action navigates (renders the plan/gate screen); it never runs a `claude:approve`
   or crosses a gate.
6. **CLI transport is single whitespace-free tokens, with a `--b64` escape for arbitrary
   content.** `menu.js` tokenizes argv on whitespace (`arg.split(/\s+/)`), so a spacey
   label cannot survive positionally. The dashboard/board render from `kind`+`plan`
   (both single tokens — e.g. `review LH1` is `kind=review plan=LH1`, joined for
   display), so the common path needs **no spaces**. `label`/`summary` that need spaces
   are passed as `--b64 <base64-of-compact-JSON>` (base64 has no whitespace → survives).
   Not over-engineered: the primary contract is plain positional tokens; `--b64` is an
   optional structured-payload path for NB3.
7. **Mutation subcommands fail SOFT at the CLI boundary (return `{ok:false,error}`), while
   the registry's own writes stay fail-LOUD.** An illegal transition (`updateTask` throws)
   is a caller error, not data corruption; the menu plane must never crash. The handler
   catches model errors and returns a machine-usable `{ok:false,error,text}` (process
   still exits 0 with JSON). `task-registry.save` remains fail-loud on a real write failure
   (that error is surfaced in `{ok:false,error}`, never swallowed).

## Dependency Graph

```
src/lib/task-registry.js  (NB1, shipped — UNCHANGED)
        ▲  load/save/emptyRegistry/addTask/updateTask/canRun  (fs choke point)
        │  canRun (pure)                                       │ pure
        │                                                      ▼
src/commands/menu.js ── route() ──►  src/lib/menu-screens.js ──►  src/lib/task-view.js  (NEW, pure, no fs)
 (NO CHANGE, forwards argv)          (routes + buildDashboardTable + INBOX)   renderTasksSection / renderTaskBoard /
                                              │                                renderTaskDetail / tasksInboxLine / renderTaskList
                                              ▼
                                     tests/menu-task-wiring.test.js  (NEW)
                                              │  (module-count 111→112)
                                              ▼
                                     README.md · tests/readme-numbers.test.js  (bump)

src/tabs/overview.js  — NO CHANGE (unmounted; documented)
```
No cycles. `task-view` depends only on the **pure** `canRun` from `task-registry`
(no fs). `menu-screens` is the sole writer path (load→mutate→save via `task-registry`);
it never does raw fs for the registry.

## Implementation Order (dependency order)

1. `tests/menu-task-wiring.test.js` (CREATE) — TDD-red, drives the API below.
2. `src/lib/task-view.js` (CREATE) — pure renderers; no dependency on menu-screens.
3. `src/lib/menu-screens.js` (MODIFY) — import task-registry + task-view; add
   `taskCommand`/board/detail screens + routes; wire TASKS section + INBOX line.
4. `README.md` (MODIFY) + `tests/readme-numbers.test.js` (MODIFY) — module count 111→112.
5. `src/commands/menu.js`, `src/tabs/overview.js` — NO CHANGE (verify, do not edit).

---

## File Specifications

### File: `src/lib/task-view.js` — CREATE (pure render, no fs)

**Purpose.** Format a registry VALUE into strings / screen fragments so `menu-screens.js`
stays thin and rendering is unit-testable with in-memory literals. Deterministic, no fs,
no mutation, no clock. Imports **only** `{ canRun }` from `./task-registry` (pure) to
annotate queued-wait reasons; wraps it in try/catch → generic label on any throw.

Module-local helpers (not exported):
- `const stripCtl = (s) => String(s == null ? '' : s).replace(/[\x00-\x1f\x7f-\x9f]/g, '');`
  — literal regex (allowed; the security-lint ban is on `new RegExp` over non-literals).
  Mirrors `menu-screens.js`'s S1 sanitizer; every attacker-influenceable field
  (`label`,`plan`,`kind`,`summary`) passes through it before rendering.
- `planName(task)` → `stripCtl(basename(plan without .md))` or `''`.
- `taskLabel(task)` → human one-liner: `` `${task.kind} ${planName(task) || task.label || task.id}` `` (sanitized).
- `byStatus(registry)` → `{running:[], queued:[], done:[], failed:[]}` where `failed`
  includes `result.cancelled` entries (rendered as "cancelled").
- `waitReason(task, registry)` → for a queued task, `try { const r = canRun(task,
  registry); if (r.reason==='blocked-dep') return dep labels; return r.reason; } catch
  { return 'queued'; }`. Resolves `blockedBy` ids → the dep task's `planName`/label so
  the AC's "waits: pi1" reads by name, not id.

**Exports:**

- `renderTasksSection(registry) -> string`
  Returns `''` when there are no running/queued/done/failed tasks (empty/absent registry
  → `emptyRegistry().tasks === []`). Non-empty form (vision §3d mock):
  ```
  TASKS
    ▶ 2 running   implement pi1 · review LH1
    ⏸ 1 queued    implement pi2 (waits: pi1)
    ✓ 3 done → 3 awaiting review
  ```
  - running line: count + ` · `-joined `taskLabel`s (cap to first ~6, "… +N" overflow).
  - queued line: count + first task's `taskLabel` + `(waits: <waitReason>)`.
  - done line: count + `→ N awaiting review` (N = done, non-reviewed).
  - failed/cancelled line only when >0: `  ✗ 1 failed   review LH1 (cancelled)`.
  Each line's dynamic fields sanitized. Trailing `\n` on each line; block has no leading
  blank line (caller adds spacing).

- `renderTaskBoard(registry) -> { text, inputMode:'task-select', prompt, actions }`
  Grouped-by-status board (Running / Queued / Done / Failed headings; `•`-bullet rows,
  each row `  • t3  review LH1  [done]`). **No `ask` key** (mirrors `plan-select`; the
  driver shows `text` and takes free text). `actions` maps **each task id** →
  `` `task ${id}` `` plus `{ b:'', back:'' }`. **No digit keys.** `prompt`:
  `"Reply with a task id (e.g. t3) to open it, or 'b' for back."` Empty registry → text
  "No background tasks." + `actions {b:'',back:''}`.

- `renderTaskDetail(registry, id) -> { text, ask, actions }`
  Looks up `id`. **Unknown id** (or `id == null`) → safe screen: text "Task not found",
  one option `◀ Back` → `tasks`. Otherwise text shows `id`, `kind`, `plan`, `status`, and
  for a terminal task the `result.summary`. `ask` is an AskUserQuestion with label options
  (≤4): for a **done** task carrying `result.nextAction`, an option labelled
  `` `Open ${nextActionLabel} ▸` `` (or, when `result.gate` set, `` `Gate ${gate} ready ▸` ``)
  → the `nextAction` **navigation route** (never a `claude:` mutation, never a gate cross);
  always a final `◀ Back` → `tasks`. A non-terminal task shows only `◀ Back`. Selection is
  by **label**, never a digit.

- `tasksInboxLine(registry) -> string`
  Returns `''` when no done tasks. Else a newline-terminated pull-notice fragment for the
  INBOX block, e.g. `  ⊙ 3 background tasks done — awaiting review\n`, plus, per gate-ready
  done task (`result.gate` set, cap ~5), `  ⊙ Gate ${gate} ready — ${planName}\n`. Pure
  count/format from registry state; adds nothing when there are no done tasks (protects
  `Inbox clear`).

- `renderTaskList(registry) -> string` (helper for `menu task list`'s human `text`):
  one line per task `  t3  review  LH1  [done]` (sanitized), `''` when empty.

**Errors:** never throws on a well-formed registry (NB1 `load`/`addTask` normalize task
shape). Defensive try/catch around `canRun` only.

### File: `src/lib/menu-screens.js` — MODIFY

**Imports (top of file).**
```js
const taskRegistry = require('./task-registry');
const taskView = require('./task-view');
```

**`buildDashboardTable(projectPath)` — insert (all text-only; `dashboardPipeline`'s
ask/actions untouched).**
- After `const root = getProjectPath(projectPath);` … load the registry once, fail-open:
  ```js
  let taskReg;
  try { taskReg = taskRegistry.load(root); } catch { taskReg = taskRegistry.emptyRegistry(); }
  ```
- **TASKS block** — immediately BEFORE the `INBOX` block (order: sections → TASKS → INBOX
  → AGENT, matching the vision mock):
  ```js
  let tasksBlock = '';
  try { tasksBlock = taskView.renderTasksSection(taskReg); } catch { tasksBlock = ''; }
  if (tasksBlock) out += tasksBlock + '\n';
  ```
- **INBOX block** — restructure the clear/non-clear branch so the background line is
  accounted for (else an empty inbox + done tasks would print both "Inbox clear" and the
  bg line):
  ```js
  let bgLine = '';
  try { bgLine = taskView.tasksInboxLine(taskReg); } catch { bgLine = ''; }
  out += `INBOX\n`;
  if (inboxTotal === 0 && !bgLine) {
    out += `  ○ Inbox clear — no async items waiting\n`;
  } else {
    if (inboxTotal > 0) {
      // …existing ⊙ questions / decisions / gates / (stale>0) lines, UNCHANGED…
    }
    if (bgLine) out += bgLine;
  }
  ```
  Empty/absent registry → `tasksBlock===''` and `bgLine===''` → dashboard output byte-for-
  byte unchanged → `e2e:124 /Inbox clear/` and all count-scrapes still pass.

**`route(args, projectPath)` — add cases (additive; existing cases untouched).**
- In `case 'menu':` after the `commands` check:
  `if (args[1] === 'task') return taskCommand(args.slice(2), projectPath);`
- New top-level cases:
  ```js
  case 'tasks': return taskBoardScreen(projectPath);          // → board
  case 'task':  return taskDetailScreen(args[1], projectPath); // → detail (args[1] = id)
  ```
  (No collision: `menu task …` is under `menu`; `tasks`/`task` are distinct top-level cmds.
  `default` still → `dashboardPipeline`, so `e2e:7` garbage-fallback is unaffected.)

**New functions (exported for tests):**
- `taskBoardScreen(projectPath)` → `const root = getProjectPath(projectPath); return
  taskView.renderTaskBoard(loadReg(root));`
- `taskDetailScreen(id, projectPath)` → `taskView.renderTaskDetail(loadReg(root), id);`
- `loadReg(root)` — local fail-open wrapper: `try { return taskRegistry.load(root); }
  catch { return taskRegistry.emptyRegistry(); }`.
- `taskCommand(subArgs, projectPath)` — the plumbing (below). Reads/mutates via
  `task-registry` only; **no raw fs**.

**`taskCommand` subcommand contracts** (invoked `node menu.js menu task <sub> …`; result is
`console.log(JSON.stringify(...))`'d by `menu.js` unchanged):

| Subcommand | Args | Registry ops | Returns |
|---|---|---|---|
| `add` | `<kind> [plan] [--touches a,b] [--gitop] [--blocked t1,t2] [--label tok] [--b64 payload]` | `reg=load; t=addTask(reg,spec); d=canRun(t,reg); save(root,reg)` | `{ok:true, taskId:t.id, decision:d.run?'run':'queue', reason:d.reason, status:'queued', text}` |
| `start` | `<id>` | `updateTask(reg,id,{status:'running'}); save` | `{ok:true, taskId:id, status:'running', text}` |
| `complete` | `<id> [--summary tok] [--next route] [--gate n] [--fail] [--b64 payload]` | `updateTask(reg,id,{status:'done', result:{ok:!fail, summary, nextAction, gate}}); save` | `{ok:true, taskId:id, status:'done', text}` |
| `fail` | `<id> [--summary tok]` | `updateTask(reg,id,{status:'failed', result:{ok:false, summary}}); save` | `{ok:true, taskId:id, status:'failed', text}` |
| `cancel` | `<id>` | `updateTask(reg,id,{status:'failed', result:{ok:false, summary:'cancelled', cancelled:true}}); save` | `{ok:true, taskId:id, status:'failed', cancelled:true, text}` |
| `list` | — | `reg=load` (read only) | `{ok:true, tasks:reg.tasks.map(t=>({id,kind,status,label,plan})), text:renderTaskList(reg)}` |
| `board` | — | `reg=load` (read only) | `renderTaskBoard(reg)` (the screen) |

- **Arg parsing** — a small pure `parseTaskArgs(subArgs)`: positional `kind`/`plan`/`id`
  + flag scan for `--touches`/`--blocked` (`.split(',')` — literal, no dynamic RegExp),
  `--gitop` (boolean), `--label`/`--summary`/`--next`/`--gate`, and `--b64` (→
  `JSON.parse(Buffer.from(v,'base64').toString('utf8'))`, merged as the base spec). No
  `new RegExp` anywhere.
- **`add` note:** the task is persisted **queued** regardless; `decision` only *reports*
  whether it may start now (`canRun` self-excludes the candidate by id). NB2 records
  intent; **NB3** does the dispatch (`Agent(run_in_background)` + `menu task start`).
- **Error handling:** wrap each mutating branch in try/catch; on `addTask`/`updateTask`
  throw (invalid kind / unknown id / illegal transition / non-array touches) return
  `{ok:false, error:err.message, text}`. A `save` write failure propagates its message
  into the same `{ok:false,error}`. Unknown `<sub>` → `{ok:false, error:'unknown task
  subcommand'}`. Process always exits 0 with JSON (NAV plane never crashes).

**`module.exports`** — add: `taskCommand`, `taskBoardScreen`, `taskDetailScreen`
(alongside the existing `route`, `buildDashboardTable`, …).

### File: `README.md` — MODIFY
Line ~814 (`src/lib/` structure line): `111 JS modules (… , task-registry)` →
`112 JS modules (… , task-registry, task-view)`.

### File: `tests/readme-numbers.test.js` — MODIFY
- Ground-truth assertion (line ~132): `assert.equal(countTopLevelJs('src/lib'), 111)` →
  `112` (comment: `task-view added for NB2`).
- README-claim assertion (line ~257): `assert.match(README, /111 JS modules/)` →
  `/112 JS modules/`.
(`countTestFiles() >= 65` at line ~150 uses `>=`; adding the new test is fine — no change.)

### File: `src/commands/menu.js` — **NO CHANGE** (verify only)
`main()` already forwards all argv to `route()`; `menu task …`, `tasks`, `task <id>`
route through the new `menu-screens.js` cases. Retained in `files:` for coverage.

### File: `src/tabs/overview.js` — **NO CHANGE** (documented)
Unmounted (`menu.js` mounts `src/areas/pipeline.js`, not `tabs/overview`); its `render()`
is used only via `.reset()`. Wiring TASKS here would be unreachable dead code. The
canonical dashboard render is `buildDashboardTable` (the JSON path Claude renders, which
the ACs exercise). Retained in `files:` for coverage transparency.

---

## Step 6 DESIGN — screen JSON shapes & selection rules

- **Board** (`route(['tasks'])` / `menu task board`): `{ text, inputMode:'task-select',
  prompt, actions }` — grouped headings + `•` rows with `t<n>` ids; `actions` keyed by
  `t<n>` → `task t<n>`, plus `b`/`back` → `''`. **Numbers-open-plans stays sacred:** ids
  are `t`-prefixed, never bare digits (Decision 4). Done tasks with a gate-ready result
  are listed under Done with a `→ Gate N ready` suffix; opening one routes to detail.
- **Detail** (`route(['task','t3'])`): `{ text, ask, actions }` — result summary +
  a next-action option that **navigates** (`plan review/<file>.md` or `browse review`)
  without performing it; `◀ Back` → `tasks`. ≤4 options → fits AskUserQuestion. Selection
  by label.
- **INBOX line:** a `⊙ background tasks` pull notice inside the existing INBOX block,
  shaped like `⊙ plans at gates` / `⊙ possibly-stale`; done-awaiting-review feeds the
  count; a gate-ready done task shows as `⊙ Gate N ready` — an inbox ITEM, never an
  auto-crossed gate. Pull, not push: it never changes the current screen.
- **Registry path:** `task-registry` computes `.ctoc/state/tasks.json` from `root`;
  `menu-screens` passes `root = getProjectPath(projectPath)` (its existing resolution).

---

## Step 7 SPEC — Test Plan (AC → one named test each)

New file `tests/menu-task-wiring.test.js` — `node:test` + `node:assert/strict`; inline
`mkdtempSync('ctoc-nb2-')` temp root (mirrors `tests/task-registry.test.js`);
`afterEach` best-effort `fs.rmSync(root,{recursive,force})`. Screens exercised via
`route([...], root)`; subcommands via `route(['menu','task',...], root)`; registry seeded
via `reg.addTask`/`reg.updateTask`/`reg.save(root,·)` (NB1 API). task-view unit-tested
with in-memory registry literals (no disk).

| # | BDD scenario / edge | Test name | Key assertions |
|---|---|---|---|
| S1 | Add returns id + decision | `add persists queued + returns {taskId,decision,reason}` | result `taskId` truthy, `status:'queued'`, `decision∈{run,queue}`; reload shows 1 queued task |
| S2 | Lifecycle transitions recorded | `start/complete/fail/cancel record status` | start→`running`; complete→`done` w/ `result.summary`; fail→`failed`; cancel→`failed`+`result.cancelled` |
| S3 | List renders registry purely | `list returns every task with status/label/plan` | `tasks.length` == seeded; each has `{id,kind,status,label,plan}`; no fs mutation |
| S4 | Dashboard summarizes counts | `TASKS section shows running/queued/done + waits` | `route([],root).text` matches `/2 running/`,`/1 queued/`,`/3 done/`,`/waits: pi1/` |
| S5 | Empty registry hides noise | `empty registry adds no dashboard output + Inbox clear` | no `/TASKS/` block; `/Inbox clear/` present; no throw |
| S6 | Board groups by status | `board groups by status, ids selectable, [0] back` | text has Running/Queued/Done/Failed headings; `actions['t1']==='task t1'`; `inputMode==='task-select'`; `back` present; **no digit keys** |
| S7 | Done detail → result + next action | `done detail shows summary + navigating next-action` | detail text has summary; an option maps to a NAV route (`/^(plan|browse) /`), NOT a `claude:` action; Back→`tasks` |
| S8 | Completions → inbox line | `done tasks surface a background-tasks INBOX line` | dashboard text `/background tasks/`; line is additive (screen unchanged otherwise) |
| S9 | Gate-reached = inbox item, not crossed | `gate-ready done task shows Gate N ready, no transition` | detail/inbox shows `/Gate 3 ready/`; next-action is nav only; plan stage unchanged on disk |
| E1 | Task in each status renders | `byStatus renders queued/running/done/failed/cancelled` | task-view groups each; cancelled labelled "cancelled" |
| E2 | Done WITHOUT next-action | `done detail without nextAction offers only Back` | single `◀ Back` option; no nav option |
| E3 | Unknown task id | `task detail for unknown id → safe Back screen` | `route(['task','tX'])` returns valid screen, Back→`tasks`, no throw |
| E4 | Numbers-vs-labels rule | `board exposes no bare-digit key; detail selects by label` | `Object.keys(actions)` has no `/^\d+$/`; ids are `t`-prefixed |
| E5 | Illegal transition fails soft | `complete on a done task returns {ok:false,error}` | `{ok:false}`, `error` names the transition; process/JSON intact |
| E6 | Malformed/corrupt registry | `corrupt tasks.json fails open (dashboard renders)` | write garbage to `.ctoc/state/tasks.json`; dashboard still renders, TASKS omitted |
| E7 | Cross-platform paths | `registry path via task-registry (no raw fs / separators)` | assert menu-screens does registry I/O only through `task-registry`; `registryPath` uses `path.join` |

Coverage target ≥ 80% lines/branches on `task-view.js` and the new `menu-screens.js`
functions; every error path (E3/E5/E6) and the empty-state path (S5) exercised.

**Regression tests that MUST stay green (do not perturb):**
`tests/e2e-menu-lifecycle.test.js` (esp. `:124 /Inbox clear/`, `:314`/`:332` question
counts, the stage-count scrapes), `tests/inbox-stale-stream.test.js`
(`:148 options.length===4`, `:140/:161` question counts, `:316-321` no digit keys / single
`inbox stale` route), `tests/menu-environment.test.js` (`:48/:61/:68/:70`),
`tests/menu-screens.test.js`, `tests/inbox.test.js`, `tests/area-modules.test.js`,
`tests/tab-modules.test.js`. All are substring/count assertions; the design keeps every
dashboard change text-only and additive, and empty/absent registry adds zero output.

---

## Execution Plan (Iron Loop Steps 8–16 — canonical labels)

### Step 8: TEST
- [ ] Write `tests/menu-task-wiring.test.js` (TDD-red): create the temp-root harness and
  the 16 tests S1–S9 + E1–E7 above; assert against `route()`/`renderTask*`. Tests fail
  first (task-view + routes not yet present).

### Step 9: PREPARE
- [ ] Confirm NB1 API surface (`load/save/emptyRegistry/addTask/updateTask/canRun`,
  consts) is available; confirm no new deps; confirm `src/lib/` sanitizer pattern to
  reuse. No directories to create (`task-registry.save` makes `.ctoc/state`).

### Step 10: IMPLEMENT (single step; sub-items per file)
- [ ] Create `src/lib/task-view.js` — `renderTasksSection`, `renderTaskBoard`,
  `renderTaskDetail`, `tasksInboxLine`, `renderTaskList` + local helpers (`stripCtl`,
  `byStatus`, `waitReason`); pure, no fs; imports only pure `canRun`.
- [ ] Modify `src/lib/menu-screens.js` — imports; `buildDashboardTable` TASKS block +
  INBOX bgLine restructure; `route` cases `menu task`, `tasks`, `task <id>`;
  `taskCommand`/`taskBoardScreen`/`taskDetailScreen`/`loadReg`/`parseTaskArgs`; exports.
- [ ] Modify `README.md` (111→112, add `task-view`) and `tests/readme-numbers.test.js`
  (both assertions 111→112).

### Step 11: REVIEW
- [ ] Self-review vs ADR + Decisions: menu.js/overview.js untouched; dashboard changes
  text-only; no bare-digit keys; no gate crossing; all registry fs via task-registry.

### Step 12: OPTIMIZE
- [ ] Single `taskRegistry.load` per dashboard render; task-view O(n) over tasks; no
  duplicate scans. Remove any dead branch.

### Step 13: SECURE
- [ ] Every attacker-influenceable field (`label`/`plan`/`kind`/`summary`) passes
  `stripCtl` before render (C0/C1 control-char strip). No `new RegExp` on non-literals.
  `--b64` decode wrapped in try/catch (malformed base64 → `{ok:false,error}`). No path
  built from task fields (registry path is computed by task-registry from root).

### Step 14: VERIFY
- [ ] `node --test tests/*.test.js` → `# fail 0`, incl. the full regression set above and
  `tests/readme-numbers.test.js`. Coverage ≥ 80% on new code; 0 skipped, 0 flaky.

### Step 15: DOCUMENT
- [ ] JSDoc on every task-view export and the new menu-screens functions; note the
  `menu task <sub>` contracts. (menu.md driver documentation of `inputMode:'task-select'`
  is an NB3 cross-reference, not an NB2 edit.)

### Step 16: FINAL-REVIEW
- [ ] `implementation-reviewer` verifies the 14 quality dimensions; Gate 3 (human).

---

## Security Review
- [x] **Path traversal** — N/A: registry path is computed inside `task-registry` from
  `root`; NB2 never builds a path from a task field.
- [x] **Input validation** — `parseTaskArgs` validates kind via `addTask` (throws on
  invalid); ids validated by `updateTask` (unknown → throw → `{ok:false}`); `--gate`
  coerced to integer.
- [x] **Injection / control chars** — `stripCtl` on all rendered dynamic fields; no
  dynamic `RegExp`; `--touches`/`--blocked` split on literal `','`.
- [x] **No secrets**; **safe fs** — all registry I/O via `task-registry` (safe-fs choke
  point); menu-screens does no raw registry fs.
- [x] **Error messages** — `{ok:false,error}` carries only the model's message; no stack
  leak; menu plane never crashes (fail-soft CLI, fail-open dashboard).
- [x] **Prototype pollution** — `addTask` builds from named fields (NB1 already avoids
  spreading `spec`); `--b64` payload is used only to populate the named spec fields.

## Risk Mitigations
| Risk | Mitigation | Where |
|---|---|---|
| Dashboard regression from new lines | All changes text-only + additive; empty/absent registry adds zero output; verified against substring/count tests | `buildDashboardTable` |
| Bare-digit collision with Rule 1 | Board uses `t<n>` free-text ids; no digit action keys; detail selects by label | `renderTaskBoard`/detail |
| Corrupt/absent registry bricks NAV | `load` fail-opens to empty; try/catch around task-view calls → omit TASKS block | `buildDashboardTable`,`loadReg` |
| Accidental gate crossing | Detail next-action is a NAV route only; `complete` stores `gate`/`nextAction` but never transitions a plan | `renderTaskDetail`, `taskCommand` |
| Spacey label lost by argv split | Render from `kind`+`plan` (single tokens); `--b64` escape for arbitrary content | `parseTaskArgs`, `task-view` |
| Illegal transition crashes menu | Fail-soft `{ok:false,error}`; registry `save` stays fail-loud | `taskCommand` |


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

---

## Decisions Taken Under Ambiguity (NB2 IMPLEMENTATION — Steps 8–16)

8. **Terminal-guard at the CLI boundary (makes E5 fail-soft correctly).** NB1's
   `updateTask` treats a *same-status* patch as a silent no-op (it short-circuits
   before the transition check), so `complete` on an already-`done` task would NOT
   throw and would wrongly return `{ok:true}`. The Test-Plan E5 requires
   `{ok:false, error}` naming the transition. Resolution: `taskTransition`/
   `taskComplete` explicitly reject a mutation whose SOURCE task is terminal
   (`done|failed|orphaned`) BEFORE calling `updateTask`, throwing
   `invalid transition <status> → <target>` → caught → `{ok:false,error}`. This is
   also semantically correct (terminal = terminal; no re-mutation). NB1 is
   untouched; `TASK_TERMINAL` is a local mirror of NB1's frozen set (NB1 does not
   export it). Legitimate transitions (queued→running, running→done, queued/running→
   failed) still flow through `updateTask`, which enforces the rest.
9. **`done` line "awaiting review" count = done tasks not carrying
   `result.reviewed===true`.** The model has no first-class "reviewed" flag, so
   every `done` task is treated as awaiting review unless a caller stamps
   `result.reviewed`. Matches the AC ("3 done → 3 awaiting review") and leaves a
   forward hook for NB4 without inventing NB1 state.
10. **`waitReason` returns the raw scheduler reason for non-dep waits.** For a
    blocked-dep it resolves dep ids → dep `planName`/label ("waits: pi1"); for
    `max-concurrent`/`plan-serial`/`git-exclusive`/`file-conflict` it surfaces the
    reason token verbatim; any `canRun` throw (malformed candidate) degrades to
    `'queued'`. Keeps the section honest without duplicating NB1's ladder.
11. **TypeScript `--checkJs` cast at the `canRun` call in `waitReason`.** task-view's
    exported registry params are typed `{tasks?:Array<object>}` (optional — reflects
    the fail-open reality), but NB1 `canRun` requires `{tasks:Array<object>}`. A
    single JSDoc `@type` cast on the runtime-narrowed value keeps the typecheck
    baseline at 89 (no regression) without loosening `canRun`'s contract.

12. **Pre-Gate-3 review KICKBACK — next-action is NAV-ONLY, enforced at BOTH the
    store and the render layer (HIGH, gate-crossing hole).** Two reviewers converged
    on a load-bearing hole: `renderTaskDetail` emitted `result.nextAction` VERBATIM
    as an option's action value, and `taskComplete` stored a `--next`/b64 `nextAction`
    with no validation. A crafted or `--next`-supplied `claude:approve review/x.md`
    rendered as "Gate N ready ▸ (does not perform it)" but, on selection, executed
    `approvePlan()` → crossed a human gate. Fix (defense in depth):
    (a) **Store** (`taskComplete`): a supplied `nextAction` is validated against the
    NAV-ROUTE allowlist (`taskView.isNavRoute`); a non-nav value (any `claude:*` or a
    verb outside `plan|browse|section|inbox|tasks|task|validate`) REJECTS the whole
    complete with `{ok:false, error:'nextAction must be a navigation route'}` — it is
    never persisted. The happy path (a real `plan review/x.md`) is unaffected.
    (b) **Render** (`renderTaskDetail`): the next-action option is emitted ONLY when
    `isNavRoute(stripCtl(nextAction))` holds; otherwise the option is DROPPED (degrade
    to Back only). The stripCtl'd value is the action. The renderer enforces its own
    JSDoc invariant and does NOT trust the caller/registry (a tampered `tasks.json`
    with a `claude:*` nextAction still cannot surface a gate-crosser). `isNavRoute` is
    a single exported predicate in `task-view.js` so both layers use the SAME literal
    allowlist regex (no `new RegExp`). The gate is still echoed as INFORMATIONAL text
    in the detail screen even when the action is dropped/absent (parity with board/inbox).
13. **Board bare-digit / reserved-key hardening (MED, Rule 1 regression).** A crafted
    registry id like `"3"` previously became a bare-digit board action key (re-breaking
    "numbers open plans ONLY") and `"b"`/`"back"` clobbered the Back affordance. Fix:
    only a `t<n>` id (`/^t\d+$/`) is selectable — a non-conforming id renders as a
    non-selectable row (`(unavailable)`) and is never added to the action map. The
    reserved `b`/`back` keys are therefore never overwritten.
14. **Bounded inputs / pagination (LOW).** `decodeB64` rejects a raw `--b64` value
    longer than 65536 chars BEFORE `Buffer.from` (memory/DoS guard). `renderTaskBoard`
    caps each status group at 50 rows and `renderTaskList` caps at 100 total rows, each
    with a `… +N more` overflow line — independent of NB1's MAX_TASKS (these bound the
    RENDER, not the store). Terminal-guard coverage extended: start/fail/cancel on an
    already-terminal task all fail soft `{ok:false}` (was only complete-on-done).

## Verification (as built)

- `node --test tests/menu-task-wiring.test.js` → 23 pass, 0 fail, 0 skipped (16
  S1–S9/E1–E7 + 7 added branch-coverage units).
- `node --test tests/*.test.js` → 2694 pass, **0 fail**, 0 skipped, 0 todo
  (regression set green: e2e-menu-lifecycle, menu-environment, inbox-stale-stream,
  menu-screens, readme-numbers, typecheck).
- `npx eslint . --max-warnings 0` → exit 0.
- `tests/typecheck.test.js` → green (baseline 89 held).
- `task-view.js` coverage: 100% line / 82.61% branch / 100% funcs (≥80% lines+branches).

### Pre-Gate-3 review KICKBACK (nav-only gate-safety + supporting fixes)

- TDD: the negative gate-safety tests FAILED before the fix (9 red: GS1 store
  accepted `claude:approve`; GS2/GS3/GS3b renderer emitted the `claude:`/opaque
  action; GS6 gate-text; MED1 bare-digit key; B1/B2/B3 bounds/pagination), then
  PASSED after (0 fail).
- `node --test tests/menu-task-wiring.test.js` → **35 pass, 0 fail, 0 skipped**
  (23 prior + 12 new: GS1–GS6, GS3b, MED1, TG1, B1–B3).
- `node --test tests/*.test.js` → **2706 pass, 0 fail, 0 skipped, 0 todo**
  (regression set still green: e2e-menu-lifecycle, menu-environment,
  inbox-stale-stream, menu-screens, readme-numbers, typecheck).
- `npx eslint . --max-warnings 0` → exit 0.
- `tests/typecheck.test.js` → green (baseline held).
- `task-view.js` coverage: **100% line / 83.59% branch / 100% funcs** (≥80%).
- Files touched (kickback): `src/lib/task-view.js`, `src/lib/menu-screens.js`,
  `tests/menu-task-wiring.test.js` ONLY. Plan left in `plans/todo/`.

## Files touched (as built)

- `src/lib/task-view.js` (NEW, pure) — `renderTasksSection`, `renderTaskBoard`,
  `renderTaskDetail`, `tasksInboxLine`, `renderTaskList` + locals (`stripCtl`,
  `planName`, `taskLabel`, `byStatus`, `waitReason`). Imports only `path` +
  pure `canRun`. No fs.
- `src/lib/menu-screens.js` (EDIT) — imports `task-registry`+`task-view`;
  `buildDashboardTable` TASKS block (before INBOX) + INBOX `bgLine` restructure;
  `route` cases `menu task`, `tasks`, `task <id>`; `taskCommand` + `taskAdd`/
  `taskTransition`/`taskComplete`/`taskList` + `parseTaskArgs`/`buildAddSpec`/
  `decodeB64`/`loadReg` + `taskBoardScreen`/`taskDetailScreen`; exports added.
  `dashboardPipeline` ask/actions UNTOUCHED (4 options preserved). Registry I/O
  only via `taskRegistry.load/save` (no raw fs; menu-screens never names `tasks.json`).
- `tests/menu-task-wiring.test.js` (NEW) — 23 tests.
- `README.md` + `tests/readme-numbers.test.js` — module count 111→112 (both the
  ground-truth `countTopLevelJs` assertion and the README claim).
- `src/commands/menu.js`, `src/tabs/overview.js` — **NO CHANGE** (verified: menu.js
  forwards argv to route(); overview.js unmounted dead code).
