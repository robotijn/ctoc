---
title: "W10-s4 — Live-agent ids plumbed into reconcile; no false orphan (H8)"
type: feature
parent_plan: "ctoc-audit-w10-menu-taskplane"
depends_on: ctoc-audit-w10-s2-multiword-task-args, ctoc-audit-w10-s3-menu-route-safety
files:
  - src/commands/menu.js
  - src/lib/menu-screens.js
  - tests/w10-live-agent-reconcile.test.js
priority: HIGH
---

# W10-s4 — Live-agent ids plumbed into reconcile; no false orphan (H8)

**Parent:** `ctoc-audit-w10-menu-taskplane`. This is slice **(b)** — the highest-severity
finding. It plumbs a live-agent-id list from the calling context through
`route()` → `dashboardPipeline()` → `buildDashboardTable()` into
`taskReconcile.reconcileState()`, and records `agentTaskId` at `menu task start`, so a
genuinely-live long-running background agent is never falsely orphaned, duplicated, or
rejected on completion.

**Depends on s2** (both edit `menu.js`'s `main()` arg handling — s4 builds on
`splitCliArgs`) **and s3** (both edit `menu-screens.js` — s4 adds a third `route`
parameter; s3 added the route-safety guards). Sequential build; never concurrent.

Fixes finding **H8** (the parent's five verified sub-effects):
- `src/lib/menu-screens.js:195` — `taskReconcile.reconcileState(root, { liveAgentIds:
  null })` — is hardcoded `null`, and `buildDashboardTable(projectPath)` (`:136`),
  `dashboardPipeline(projectPath)` (`:262`), and `route(args, projectPath)` (`:1619`)
  take no `liveAgentIds` parameter. There is no channel today for a live id list to reach
  the reconcile.
- `src/lib/menu-screens.js:1502` — `taskTransition`'s `start` patch is `{ status:
  "running" }` only; no `agentTaskId` is ever written, so even a plumbed `liveAgentIds`
  would have nothing on the task record to match against.
- Consequences, all verified in the parent: (a) a live `implement` task past 30 min is
  marked `orphaned`; (b) `orphaned` drops out of the `running`-only ≤5 concurrency count,
  so a duplicate is offered; (c) `taskComplete` throws `invalid transition orphaned →
  done` when the live agent later reports real completion.

The pure reconcile core is ALREADY correct: `task-reconcile.js:126-206` (`reconcile`)
normalizes `opts.liveAgentIds` to a Set (`:148-150`) and, at `:160`, leaves a `running`
task alone when `t.agentTaskId` is in the live set — falling through to the staleness
backstop only when `liveAgentIds == null` (`:172-174`). And `task-registry.js:80`
(`MUTABLE_FIELDS`) ALREADY allowlists `agentTaskId`, so `updateTask` will accept it. This
slice therefore adds NO change to `task-reconcile.js` or `task-registry.js` — it only
supplies the two inputs they already know how to consume.

## Implementation Details

### Architecture Decision (ADR) — the flag shape the parent deferred to Step 5/6

**Context.** The parent's "Decisions Taken Under Ambiguity" fixes a HARD constraint but
explicitly leaves the exact channel to the Implementation Planner: `menu.js` runs as a
Node **child process** per invocation with no in-memory handle to the Claude Code
harness's live `TaskList` (that object lives only in the parent session). The id list
can therefore cross the process boundary only via CLI input (or an equivalent
file/stdin channel), never as a JS parameter alone. The two candidate shapes named were
(1) a new `--live-agent-ids <csv>` argv argument, or (2) a JSON side-channel file the
session writes before invoking `menu.js`.

**Decision.** Use argv: **`--live-agent-ids <csv>`**. The session, on each dashboard NAV
render, collects the live agent ids from its `TaskList` and appends
`--live-agent-ids t3,t7,…` to the `node menu.js` invocation (per `menu.md`'s ON-OPEN
RECONCILE section, which already states the requirement). `menu.js` parses the csv,
passes `{ liveAgentIds }` into `route`, and degrades to today's `null`/staleness backstop
when the flag is absent (true session restart, or the TUI child process with no
Task-tool access).

**Why argv over a side-channel file.** A stale `live-agents.json` from a prior session
would be read as "live" and would keep a genuinely-dead task `running` — reintroducing
the exact false-state bug in the opposite direction, and demanding TTL/freshness/cleanup
logic. argv is stateless: absent ⇒ backstop (correct in the restart case, locked in by
acceptance scenario 8); present ⇒ authoritative for that one render. Minimal surface,
cross-platform, no cleanup. Higher quality.

**agentTaskId ↔ liveAgentIds correspondence.** The id recorded on the task at
`menu task start` (`agentTaskId`) must be the SAME identifier the session later reports in
its live set. Per `menu.md`'s WORK dispatch recipe, the session launches
`Agent(run_in_background)` and then `menu task start <taskId>`; the harness agent id it
will later see in `TaskList` is what must be recorded. This slice records the value the
caller passes via `--agent-id <id>` on the `menu task start` call (a new optional arg),
falling back to the task's own id when the caller supplies none — so the wiring works even
before the session is taught to pass the harness id, and tightens when it is.

### Dependency Graph (this slice)
```
menu.js main()  ── parse & strip `--live-agent-ids <csv>`; pass { liveAgentIds } to route
  └─ route(args, projectPath, opts)               [+3rd param, default {}]
       └─ dashboardPipeline(projectPath, opts)    [+2nd param, default {}]
            └─ buildDashboardTable(projectPath, opts)  [+2nd param, default {}]
                 └─ taskReconcile.reconcileState(root, { liveAgentIds: opts.liveAgentIds })  [replaces the :195 hardcoded null]
menu.js `menu task start` → taskTransition(root, rest, 'start')
  └─ start patch gains agentTaskId (from --agent-id or the task id)   [:1502]
reconcile() (task-reconcile.js)      — UNCHANGED (already liveAgentIds-aware)
task-registry.js MUTABLE_FIELDS      — UNCHANGED (already allowlists agentTaskId)
  └─ behavior-tested-by → tests/w10-live-agent-reconcile.test.js (NEW)
```
Max new dependency depth within W10: this slice is depth 1 (on s2, s3). No cycles.

### File Specifications

#### `src/commands/menu.js` — MODIFY (`main()` only)
- Add a small exported helper to extract the flag WITHOUT disturbing s2's `splitCliArgs`:
  ```
  /**
   * Pull `--live-agent-ids <csv>` out of argv, returning the parsed id array (or
   * undefined when absent) and the residual args with the flag+value removed. The id
   * list originates in the parent Claude session's TaskList and crosses the process
   * boundary via argv only (H8); absent ⇒ undefined ⇒ reconcile's staleness backstop.
   * @param {string[]} argv
   * @returns {{ liveAgentIds: (string[]|undefined), rest: string[] }}
   */
  function extractLiveAgentIds(argv) {
    const rest = [];
    let liveAgentIds;
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--live-agent-ids') {
        const csv = argv[i + 1] == null ? '' : String(argv[i + 1]);
        liveAgentIds = csv.split(',').map(s => s.trim()).filter(Boolean);
        i++; // consume the value
        continue;
      }
      rest.push(argv[i]);
    }
    return { liveAgentIds, rest };
  }
  ```
  Export it alongside `splitCliArgs`.
- Restructure `main()` (`:527-582`) so the flag is extracted FIRST, then the branch
  decision uses the RESIDUAL args, and both JSON render paths thread `{ liveAgentIds }`:
  ```
  const cliArgs = process.argv.slice(2);
  const { liveAgentIds, rest } = extractLiveAgentIds(cliArgs);

  if (rest.length > 0) {
    const { route } = require('../lib/menu-screens');
    const result = route(splitCliArgs(rest), app.projectPath, { liveAgentIds });   // s2's splitCliArgs
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (process.stdin.isTTY) {
    …unchanged TUI setup…      // TUI child process has no Task access → no liveAgentIds
  } else {
    const { route } = require('../lib/menu-screens');
    const result = route([], app.projectPath, { liveAgentIds });   // dashboard render, opts-aware
    if (needsEnvironmentPrompt(app.projectPath)) attachEnvironmentQuestion(result);
    if (needsComplianceRegimePrompt(app.projectPath)) attachComplianceQuestion(result, app.projectPath);
    if (justInitialized) { result.text = '…' + result.text; }
    console.log(JSON.stringify(result, null, 2));
  }
  ```
  **Load-bearing:** the `else` (no-args dashboard, with the environment/compliance
  ride-alongs at `:568-577`) is now ALSO reached when the session passed ONLY
  `--live-agent-ids` (`rest` empty, non-TTY) — so the ride-alongs are preserved on the
  live on-open render, not bypassed. Do not duplicate the ride-along block into the
  `rest.length > 0` branch (that branch is for real sub-commands like `browse`/`plan`,
  which never carry ride-alongs).

#### `src/lib/menu-screens.js` — MODIFY (thread the parameter + record agentTaskId)
1. **`buildDashboardTable(projectPath, opts = {})`** (`:136`) — accept `opts`; replace the
   hardcoded reconcile at `:195`:
   `const { report } = taskReconcile.reconcileState(root, { liveAgentIds: opts.liveAgentIds });`
   (`reconcile` treats `undefined == null` → staleness backstop, exactly as before when
   absent — scenario 8 preserved). Update the `:190` comment: liveAgentIds now flows from
   the caller; `null`/absent ⇒ backstop.
2. **`dashboardPipeline(projectPath, opts = {})`** (`:262`) — accept `opts`; pass it
   through: `const text = buildDashboardTable(root, opts) + '\n\n\n';` (`:271`).
3. **`route(args, projectPath, opts = {})`** (`:1619`) — accept `opts`; forward it to
   BOTH dashboard entry points it calls: `return dashboardPipeline(projectPath, opts);` at
   `:1621` and `:1635` (and the other `dashboardPipeline(projectPath)` fall-throughs at
   `:1660/1665/1669/1692/1696/1704` → `dashboardPipeline(projectPath, opts)`). The
   sub-command screens (`stageBrowse`, `planActions`, …) do NOT need `opts` (they don't
   reconcile), so leave their calls unchanged.
4. **`taskTransition(root, rest, kind)`** (`:1491`) — in the `start` branch (`:1502`),
   record `agentTaskId`:
   ```
   if (kind === 'start') patch = { status: 'running', agentTaskId: p.agentId || id };
   ```
   and add `--agent-id` to `parseTaskArgs` (`:1399-1418`) as
   `case '--agent-id': out.agentId = String(args[++i] == null ? '' : args[i]); break;`
   so `menu task start <id> --agent-id <harnessId>` records the harness id, defaulting to
   the task id when omitted. (`task-registry.updateTask` already allowlists `agentTaskId`
   — `MUTABLE_FIELDS`, `task-registry.js:80` — so no registry change.)
5. Default parameters (`opts = {}`) keep every existing caller (tests, `:850`, internal
   `dashboardPipeline` calls) working unchanged — `opts.liveAgentIds` is `undefined` ⇒
   backstop.

### Test Plan

#### `tests/w10-live-agent-reconcile.test.js` — CREATE (`node:test`)
Seed a temp project with a real `.ctoc/state/tasks.json` via `task-registry`. Every case
is RED before this slice (the reconcile is hardcoded `null`; no `agentTaskId` is written)
and GREEN after. The true-positive AND true-negative cases live in the SAME file so a
broken "fix" that just disables staleness detection cannot pass.

1. **Live long-running agent is NOT orphaned (scenario 4, happy path).** Seed a `running`
   task `t1` with `agentTaskId: 'a1'` and `ts.started` 40 min ago (past
   `DEFAULT_STALE_MS` = 30 min, `task-reconcile.js:53`). Call
   `route(["menu"], root, { liveAgentIds: ['a1'] })` (dashboard render) and re-read the
   registry: `t1.status` is still `running` (NOT `orphaned`), and the dashboard `text`
   shows no "orphaned — offer re-run" line for it.
2. **Genuinely dead task past threshold IS still orphaned (scenario 5, regression
   guard).** Same seed but `agentTaskId: 'a2'` NOT in the live set; render with
   `{ liveAgentIds: ['a1'] }`. `t2.status` → `orphaned`. Combined with case 1 in ONE
   reconcile pass (seed both t1 and t2), assert opposite outcomes — proves the fix adds a
   true-positive check without removing the true-negative one.
3. **Concurrency cap counts the live task (scenario 6).** With the live `t1` from case 1
   left `running`, seed 4 more `running` tasks and assert `taskRegistry.canRun(<a 6th
   queued task on a different plan>, reg)` returns `run:false` (queued) — i.e. `t1` counts
   toward the ≤5, its slot is NOT silently freed. (Uses the real `task-registry.canRun`;
   no registry change.)
4. **Genuine completion is accepted (scenario 7).** With the live `t1` left `running`,
   call `route(["menu","task","complete","t1","--summary","done"], root)` and assert the
   transition `running → done` succeeds (result `ok:true`, `t1.status === 'done'`) — NOT
   rejected as `invalid transition orphaned → done`.
5. **True session restart still falls back to staleness (scenario 8, edge case).** Seed
   the 40-min-old `running` `t1`; render with NO `liveAgentIds`
   (`route(["menu"], root)` — opts defaults `{}`, `liveAgentIds` undefined). `t1` → still
   `orphaned` (the existing correct backstop is preserved unchanged).
6. **`menu task start` records `agentTaskId` (plumbing unit).**
   `route(["menu","task","start","t9","--agent-id","h9"], root)` on a queued `t9` → the
   stored task has `status:'running'` and `agentTaskId:'h9'`. Without `--agent-id`,
   `agentTaskId` defaults to the task id `t9`.
7. **`extractLiveAgentIds` parse unit.** `extractLiveAgentIds(["menu","--live-agent-ids",
   "a1,a2 , a3"])` → `{ liveAgentIds: ['a1','a2','a3'], rest: ['menu'] }`; absent flag →
   `{ liveAgentIds: undefined, rest: [...] }`.
8. **Ride-along preserved when only `--live-agent-ids` is passed (integration guard).**
   In a temp project with `general.environment: ask`, invoke `main()`'s no-args dashboard
   path with only `--live-agent-ids a1` (rest empty, non-TTY) and assert the environment
   question still rides along — i.e. the flag did not bypass the ride-along block. *(May be
   asserted at the `route([], root, {liveAgentIds})` + attach level rather than spawning
   the process, to keep it fast.)*

### Security Review
- [ ] **No trust escalation:** `liveAgentIds` only ever makes reconcile MORE conservative
      (leaves a matching task running); it can never cross a human gate, promote, or
      launch an agent. A forged id at most keeps a task `running` (then the staleness
      backstop or a real completion still resolves it) — it cannot fabricate a `done`.
- [ ] **Injection:** ids are split from a csv into an array of trimmed strings and only
      ever compared via `Set.has(String(id))` in `reconcile` — never interpolated into a
      shell, path, or eval.
- [ ] **agentTaskId provenance:** recorded from the caller's `--agent-id` (or the task
      id); it is data compared for equality only. `updateTask` writes it through the
      existing `MUTABLE_FIELDS` allowlist — no arbitrary field injection.
- [ ] **Fail-open rendering:** `buildDashboardTable` keeps its existing `try/catch` around
      `reconcileState` (`:194-197`) — a reconcile failure still renders the dashboard;
      threading `opts` does not change that posture.
- [ ] **Backward-safe defaults:** every new parameter defaults so absent input reproduces
      today's exact backstop behavior (scenario 8) — no silent behavior change for callers
      that pass nothing.

## Execution Plan

### Step 8: TEST
Write `tests/w10-live-agent-reconcile.test.js` FIRST (TDD red), asserting BEHAVIOR — "a
live `implement` task past the 30-minute staleness threshold is NOT orphaned when its
`agentTaskId` is in the passed live set, while a task with no live match in the SAME pass
IS orphaned", and "the live task's genuine completion is accepted", NOT "reconcile
returned a report". Cases 1–8 above. Run `node --test tests/w10-live-agent-reconcile.test.js`
and confirm RED against current `main` (reconcile is hardcoded `null` → the live task is
orphaned → completion is rejected).

### Step 9: PREPARE
Re-read `src/lib/task-reconcile.js:126-206` (confirm `reconcile` already honors
`liveAgentIds` and `agentTaskId`) and `:257-296` (`reconcileState` passes `opts`
through), `src/lib/task-registry.js:80` (confirm `agentTaskId` in `MUTABLE_FIELDS`) and
its `canRun`/`nextRunnable`/`updateTask` signatures, and `src/lib/menu-screens.js:190-197`
(the reconcile call), `:1491-1513` (`taskTransition`), `:1399-1418` (`parseTaskArgs`). Confirm
s2 (`splitCliArgs`) and s3 (route guards) have landed. No new deps.

### Step 10: IMPLEMENT
ONE step, ordered sub-items:
(a) `menu.js`: add `extractLiveAgentIds`, export it; restructure `main()` to extract the
flag first, branch on `rest`, and thread `{ liveAgentIds }` into both JSON `route` calls
(preserving the environment/compliance ride-alongs on the dashboard path).
(b) `menu-screens.js`: add `opts` params to `buildDashboardTable`, `dashboardPipeline`,
`route`; forward through; replace the `:195` hardcoded `null` with `opts.liveAgentIds`.
(c) `menu-screens.js`: add `--agent-id` to `parseTaskArgs`; set
`agentTaskId: p.agentId || id` in `taskTransition`'s `start` patch.
(d) Run `node --test tests/w10-live-agent-reconcile.test.js` → green.

### Step 11: REVIEW
Self-review: `liveAgentIds` flows argv → `route` → `dashboardPipeline` →
`buildDashboardTable` → `reconcileState`; absent ⇒ backstop (scenario 8 intact); `start`
records `agentTaskId`; `task-reconcile.js`/`task-registry.js` are UNCHANGED; the
environment/compliance ride-alongs still fire on the dashboard render; the TUI path
carries no `liveAgentIds` (correct — no Task access).

### Step 12: OPTIMIZE
Confirm the id csv is parsed once in `menu.js` (not re-parsed downstream); `reconcile`
builds its Set once (`task-reconcile.js:148`). No redundant reconcile — still exactly one
`reconcileState` per dashboard render.

### Step 13: SECURE
Run the Security Review checklist. Confirm `liveAgentIds` never reaches a gate/promote/
launch path (grep the flow), and `agentTaskId` is written only via the allowlisted
`updateTask`.

### Step 14: VERIFY
`node --test tests/w10-live-agent-reconcile.test.js` → `# fail 0`; then the FULL suite
`node --test tests/*.test.js` → `# fail 0`, 0 skipped. Pay special attention to existing
`menu-screens`/`task-reconcile`/`task-registry`/`menu` tests — the new `opts` params are
defaulted, so they must stay green; reconcile any test that asserted the old hardcoded
`liveAgentIds: null` call signature.

### Step 15: DOCUMENT
Update the `:187-192` comment block in `buildDashboardTable` (liveAgentIds now flows from
the caller via argv; `null`/absent ⇒ staleness backstop) and add a short note on
`extractLiveAgentIds` and the `--live-agent-ids`/`--agent-id` flags. Confirm `menu.md`'s
ON-OPEN RECONCILE section (`menu.md:109-127`) already documents the requirement — no
doc-vs-code drift.

### Step 16: FINAL-REVIEW
Confirm: this slice edits only its three declared files; a live long-running task with a
matching `agentTaskId` in the passed set stays `running`, counts toward the ≤5 cap, and
its completion is accepted; a task with no live match in the same pass is orphaned; a
render with no `--live-agent-ids` still orphans a stale task (backstop); `menu task start`
records `agentTaskId`; ride-alongs preserved; `task-reconcile.js`/`task-registry.js`
untouched; suite green, 0 skipped.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Fix disables staleness detection to pass the "not orphaned" case | Cases 1+2+5 in ONE file assert live→running AND dead→orphaned AND restart→orphaned; a blanket disable fails 2 and 5 | Step 8 |
| Threading `opts` breaks a caller asserting the old `route(args, projectPath)` arity | All new params default to `{}`; full-suite VERIFY surfaces any signature assertion | Step 14 |
| `--live-agent-ids` bypasses the environment/compliance ride-along on the live render | `main()` routes an empty-`rest` invocation to the ride-along dashboard branch; case 8 guards it | Step 10(a) |
| `agentTaskId` recorded ≠ the id the session later reports | `--agent-id` records the harness id (defaults to task id); `menu.md` WORK recipe supplies it; correspondence documented in the ADR | Step 15 |
| Concurrent edit of `menu.js`/`menu-screens.js` with s2/s3 | `depends_on: s2, s3`; sequential FIFO build; s4 builds on their landed changes | frontmatter |
