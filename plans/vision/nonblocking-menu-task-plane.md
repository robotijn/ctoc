---
type: vision
status: vision
created: 2026-07-01
program: ctoc-menu-ux
title: "Non-Blocking Menu — Background Task Plane"
---

# Vision — Non-Blocking Menu / Background Task Plane

> Make the CTOC menu never block on work. Navigation is instant; every autonomous
> operation the menu triggers runs as a background task; the user keeps navigating
> and queuing while work drains; results surface as pull-based inbox items; human
> gates stay foreground and sacred. This is CTOC's async-overnight philosophy made
> literal in the menu.

## 1. Why (Problem)

The menu render (`node menu.js <route>`) is already fast — pure computation over
plan files. What makes the *experience* slow is that after the user picks a "work"
action (implement / plan / review / quality / decompose), **Claude does the work
in the foreground and the user waits** — the conversation and the menu are blocked
for seconds to minutes. The user can't navigate, queue more work, or review other
plans while one operation runs.

Goal: the user can keep doing things in the menu at all times; heavy work happens
off the critical path; the menu stays fast and the session context stays lean.

## 2. The one hard constraint (shapes everything)

**`menu.js` (Node) cannot launch agents — only Claude can (the Task tool).** The
"work" is LLM/agent work, not deterministic Node, so `child_process.fork()` can't
run it. This forces a **registry-mediated split**:

- **`menu.js`** = policy + state brain (computes screens, owns the task registry,
  decides what may run). Never launches anything.
- **Claude's main loop** = executor (launches background agents, but only after
  consulting `menu.js` for permission; returns to rendering immediately).
- **A task registry on disk** = the shared state between them.

## 3. The design (two planes)

| Plane | What | Latency | Rule |
|---|---|---|---|
| **Navigation** (sync) | render screens; human-gate clicks; fast file moves (approve/view/reject/delete) | instant | never backgrounded — this IS the interaction |
| **Work** (async) | autonomous agent runs: implement, plan, review, quality, security, decompose — AND interactive work (discuss) run async-with-documented-choices | seconds–minutes | always background; dispatch → record → return to menu now |

### 3a. Task registry — `src/lib/task-registry.js` + `.ctoc/state/tasks.json`
Single JSON file; **Claude is the sole writer** (main loop is single-threaded →
writes serialize naturally → atomic write via `src/lib/safe-fs.js`, fail-open on
corrupt, à la pi1). Agents never write it — they return results to Claude, who
records them (keeps it single-writer, lock-free). Task shape:
`{ id, kind, label, plan, status: queued|running|done|failed|orphaned, agentTaskId,
touches:[files], gitOp:bool, blockedBy:[ids], result:{ok,summary}, ts:{created,started,done} }`.

### 3b. The scheduler — the algorithmic heart (pure, testable, in `menu.js`)
`canRun(candidate, registry) → {run, reason}` **encodes CTOC's concurrency-safety
rules as code** (today they live only in operator discipline / memory):
- `running ≥ MAX_CONCURRENT (5)` → queue
- candidate is plan-mutating (`implement`) and an `implement` is already running →
  queue (**plan builds serialize, FIFO** — CTOC non-negotiable)
- candidate `touches ∩ union(running.touches) ≠ ∅` → queue (**file-conflict**)
- candidate `gitOp` and any editing task running (or vice-versa) → queue
  (**git-exclusive** — the SP4-clobber lesson, now enforced not remembered)
- else → run
`nextRunnable(registry)` (on each completion) → newly-unblocked queued tasks →
Claude dispatches them. A real dependency-aware scheduler; safety becomes code.

### 3c. The protocol — `menu.md` rewrite (NAV vs WORK)
- **NAV turn:** `menu.js <route>` → render. Minimal reasoning, instant.
- **WORK turn:** `menu task add {kind,label,plan,touches,gitOp}` → `{taskId,decision}`.
  If `run`: dispatch `Agent(run_in_background)` + `menu task start`. If `queue`:
  just record. **Then render the dashboard immediately** with a one-line status.
  No awaiting. The heavy reasoning lives inside the isolated agent → main-loop menu
  turns stay cheap AND context stays lean (no bloat/compaction → menu stays fast
  over long sessions).
- **COMPLETION turn** (fired by the task-notification): `menu task complete` →
  compact non-disruptive notice → promote `nextRunnable`. **Pull, not push** —
  updates the registry + inbox counts; does NOT hijack the current screen.

### 3d. Completions become inbox items (the elegant part)
The dashboard already has an INBOX (morning questions, decisions awaiting review,
plans at gates, stale plans). Backgrounded work slots straight in:
```
TASKS
  ▶ 2 running   implement pi1 · review LH1
  ⏸ 1 queued    implement pi2 (waits: pi1)
  ✓ 3 done → INBOX: 3 decisions awaiting review
```
A finished task that hit a **human gate stops there** and becomes a "Gate N ready"
inbox item — **never auto-crossed**. The human navigates to the task board / inbox
when they choose and acts. This is async-overnight made literal.

### 3e. Interactive work → async-with-documented-choices (decided 2026-07-01)
`discuss` / `decompose` run in the background too: they make documented reasonable
choices (per Pipeline Philosophy #2/#3, no-stub + async-overnight) and surface the
choices/questions as inbox "decisions awaiting review." Nothing blocks the menu.
Human **gates** are the only thing that stays foreground.

## 4. Success Criteria
1. Navigating the menu is never blocked by a running operation (measurable: a
   long "work" action returns the user to a menu screen in < 1s).
2. The user can queue multiple operations; the scheduler runs/queues them per the
   safety rules; the queue is visible.
3. Concurrency-safety rules (≤5, plan-serial-FIFO, file-conflict, git-exclusive)
   are ENFORCED by the scheduler and unit-tested — not left to operator judgment.
4. Completed work surfaces as pull-based inbox items; human gates are never
   auto-crossed by a background task.
5. Resilient: session restart reconciles orphaned tasks; agent failure surfaces
   (never silently lost); corrupt registry fails open.
6. Main-loop menu turns stay minimal-reasoning and fast; heavy reasoning is
   isolated in background agents (context stays lean).

## 5. Scope
**In:** the registry + scheduler lib; menu.js task subcommands + TASKS section +
task-board/detail screens + inbox line; the menu.md protocol rewrite; orphan/failure
reconciliation; tests.
**Out (non-goals):** replacing the harness's background-agent execution (we mirror
it, not reinvent it); child_process/worker-based execution of agent work
(impossible — only Claude launches agents); weakening any human gate; parallelizing
plan implementation (still strictly FIFO).

## 6. Key Decisions (locked)
- **D1 — registry:** single `.ctoc/state/tasks.json`, Claude sole writer, atomic via
  safe-fs, fail-open. (Not one-file-per-task; not the harness system as SoT.)
- **D2 — executor:** harness background agents (`Agent run_in_background`) are the
  executor; the CTOC registry is the semantic + policy + persistence layer that
  mirrors them (reconciled via `TaskList` on demand).
- **D3 — completions:** pull-based inbox integration (+ a subtle one-line notice),
  never a push/modal that disrupts the current screen.
- **D4 — interactive work:** async-with-documented-choices; questions → inbox
  decisions; gates stay foreground.
- **D5 — safety in code:** the scheduler encodes ≤5 / plan-serial-FIFO /
  file-conflict / git-exclusive; unit-tested. Operator memory becomes enforced policy.

## 7. Decomposition sketch (for the vision-decomposer)
- **NB1 — task-registry + scheduler** (`src/lib/task-registry.js`, pure model +
  canRun/nextRunnable + safe-fs persistence + fail-open) + tests. Foundation, no UX.
- **NB2 — menu.js wiring** (task subcommands, TASKS dashboard section,
  task-board + task-detail screens, inbox "background tasks" line).
- **NB3 — menu.md protocol rewrite** (NAV-vs-WORK classification, dispatch-and-return,
  completion→inbox, gate-bounded, async-with-documented-choices).
- **NB4 — reconciliation & resilience** (session-restart orphan detection via
  TaskList/staleness, failure surfacing, corrupt-registry fail-open, orphaned-temp
  and stale-task sweep).

## 8. Risks
- Registry/harness drift (Claude records ≠ actual agent state) → reconcile via
  TaskList + staleness; failure notifications always recorded.
- Runaway cost from easy queuing → bounded by ≤5 + FIFO + a visible queue.
- Split-brain discipline: Claude must never launch a background agent without
  recording it + checking `canRun` first (never route around the scheduler).
- Session-boundary orphans → detected + offered for re-run on menu open.

## 9. Origin
Requested 2026-07-01 (CTO directive): "launch tasks (except moving in the menu) to
background so the user can keep doing things and the menu is fast." Design produced
via deep-reasoning ("ultrathink"); async-interactive fork resolved to
async-with-documented-choices.
