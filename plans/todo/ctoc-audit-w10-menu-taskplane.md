---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:57.994Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-13T11:01:11.733Z
gate_crossed: functional → implementation
---

---
title: "W10 — Menu and Task-Plane Robustness"
created: "2026-07-11T00:00:00Z"
type: feature
parent_vision: "vision/ctoc-self-audit-remediation.md"
priority: MEDIUM
depends_on: none
acceptance_criteria_count: 17
risk_level: MEDIUM
---

# W10 — Menu and Task-Plane Robustness

## 1. ASSESS

### Business Context

CTOC has no UI other than this menu — the human CTO's entire experience of "CTOC
working" IS the menu and the background task plane. Per the governing principle
("Working" means a human can use it — a crash, a lost summary, or a dead screen
IS broken, not a cosmetic defect): a raw stack trace where the human expected a
JSON error, a background `implement` agent silently duplicated because the
dashboard thinks it died, a multi-word task summary truncated to one word, or a
Settings screen where every keystroke does nothing are all instances of "grinding
with no feedback" from the only viewpoint that matters — the person looking at the
terminal. This stub traces directly to the parent vision's problem statement
("the enforcement-and-gate layer... is substantially non-functional... the tests
assert structure, not truth") applied to the menu/task-plane layer specifically:
each defect below has a passing test suite around it today and is still broken.

### Current State (re-verified against live code, 2026-07-11 — every citation below
was opened and confirmed at the stated path/line before writing this plan)

1. **No `ctoc push` entry point exists (H3).** `src/commands/push.md:8` instructs
   Claude to run the bare shell command `ctoc push [options]`. There is no `bin`
   field in `package.json` (confirmed by reading `package.json` in full) and no
   `src/commands/push.js` (confirmed: file does not exist). Compare the sibling
   slash commands, which both work: `src/commands/menu.md:9` runs
   `node "${CLAUDE_PLUGIN_ROOT}/src/commands/menu.js"` and
   `src/commands/update.md:9` runs a `node "$(find … update.js …)"` one-liner —
   both invoke a real file that exists. `push.md` is the only one of the three
   that names a command with nothing behind it. `src/lib/quality-gate.js` exists
   and defines the threshold/status vocabulary (`GATE_STATUS`,
   `DEFAULT_THRESHOLDS`) that a real `push.js` would sit on top of, so the
   documented Tier 1/Tier 2 behavior in `push.md` is not invented — it is unwired.

2. **Orphan reconciliation always runs blind (H8).**
   `src/lib/menu-screens.js:195` — `taskReconcile.reconcileState(root, {
   liveAgentIds: null })` — is hardcoded, and `buildDashboardTable(projectPath)`
   (the only caller, `menu-screens.js:136`) takes no `liveAgentIds` parameter at
   all; neither does `dashboardPipeline(projectPath)` above it, nor `route(args,
   projectPath)`. There is no channel today for a live agent-id list to reach
   this call. `src/lib/task-reconcile.js`'s pure core (`reconcile()`, lines
   126–206) is correctly written — when `opts.liveAgentIds` is `null` it falls
   through to the "TaskList unavailable" staleness backstop
   (`task-reconcile.js:170–175`): any `running` task older than
   `DEFAULT_STALE_MS` (30 minutes, `task-reconcile.js:53`) is unconditionally
   orphaned, live or not, because the caller never supplies the list that would
   let it tell the difference. Separately, `src/lib/menu-screens.js:1491–1513`
   (`taskTransition`, the `menu task start` handler) sets `patch = { status:
   "running" }` only — no `agentTaskId` field is ever written, so even if
   `liveAgentIds` were plumbed through, there is nothing on the task record to
   compare it against. Compounding effect, all verified: (a) a background
   `implement` task genuinely still running past 30 minutes is marked
   `orphaned`; (b) `task-reconcile.js`'s own comment (lines 19–24) confirms
   `orphaned` tasks drop out of the `running`-only concurrency count for free,
   so the ≤5 cap under-counts real live agents and a duplicate is offered
   for the same plan via the freed `promote` slot; (c) `taskComplete()`
   (`menu-screens.js:1516–1550`) checks `TASK_TERMINAL.has(task.status)`
   (`orphaned` is in that set, `menu-screens.js:37`) and throws `task-registry:
   invalid transition orphaned → done` when the genuinely-alive agent later
   reports its real completion — the completion is rejected, not just delayed.

3. **Multi-word task args are truncated (M6).** `src/commands/menu.js:539` —
   `const splitArgs = cliArgs.flatMap(arg => arg.split(/\s+/));` — re-splits
   every already-shell-tokenized argv element on whitespace. For `node menu.js
   task complete t1 --summary "two words"`, the shell delivers `cliArgs =
   ["task", "complete", "t1", "--summary", "two words"]` (5 elements, `"two
   words"` already one token); the `flatMap` explodes `"two words"` into `["two",
   "words"]`, so `route()` receives 6 tokens. `parseTaskArgs`
   (`menu-screens.js:1399–1418`) then does `case '--summary': out.summary =
   String(args[++i] …)` — it consumes only the next single token, `"two"`, and
   `"words"` becomes a stray unconsumed positional. The identical `case
   '--next'` branch (`menu-screens.js:1411`) is hit the same way. This is a
   process-level corruption upstream of `parseTaskArgs`; `parseTaskArgs` itself
   is correct.

4. **Unknown-stage input crashes raw instead of returning the JSON error
   contract (M8).** `route()`'s `case 'plan':` (`menu-screens.js:1662–1684`) does
   no stage validation before calling `planActions(stage, file, projectPath)`.
   Inside `planActions`, `menu-screens.js:1069` — `const folder =
   STAGE_FOLDERS[stage];` — for an unknown stage (e.g. `"bogus"`) is `undefined`,
   and `menu-screens.js:1070` — `path.join(plansDir, folder, file)` — throws
   `TypeError: Path must be a string. Received undefined` because `path.join`
   rejects a non-string argument. Neither `planActions` nor `route()` nor
   `main()` in `src/commands/menu.js` (the `cliArgs.length > 0` branch,
   `menu.js:535–543`) wraps this in a try/catch, so `node menu.js "plan
   bogus/x.md"` prints a raw Node stack trace to stderr and exits non-zero — not
   the JSON `{text, ask, actions}` contract every other screen returns.

5. **`planActions`/`reviewActions` lack the traversal guard `validateScreen`
   already applies (M11).** `isUnsafePlanFile(file)` is defined at
   `menu-screens.js:80–89` and used at `menu-screens.js:1280` inside
   `validateScreen` before any `path.join`. `planActions`
   (`menu-screens.js:1066–1123`) and `reviewActions`
   (`menu-screens.js:1180–1227`) both build `path.join(plansDir, folder, file)`
   (lines 1070 and 1184 respectively) with **no** call to `isUnsafePlanFile`
   first — a `file` value like `"../../etc/passwd"` reaches `path.join`
   unchecked in both functions (`reviewActions` is also directly reachable via
   `route()`'s `case 'plan':` when `args[2] === 'review'`, `menu-screens.js:1677`,
   so this is two independently reachable gaps, not one).

6. **The Settings screen is inert, and the root cause is more specific than "the
   handler is never dispatched" (M12).** `handleKey()` in `src/commands/menu.js`
   (lines 372–461) delegates unhandled keys generically at
   `menu.js:453–460` to `tabModule.handleKey(key, app)` where `tabModule =
   tabModules[currentTab.id]`. `tabModules` (`menu.js:252–258`) maps
   `system: systemArea` — `src/areas/system.js` — **not** the legacy
   `src/tabs/tools.js` module. `src/areas/system.js:47–49` is `function
   handleKey(_key, _app) { return false; }` — a hardcoded no-op. Meanwhile
   `src/tabs/tools.js:212–321` has a fully-implemented `handleKey` (tools-list
   nav, Doctor/Update/Settings sub-mode key handling, toggle-setting on Enter,
   escape/back) that is dead code — genuinely unreachable from the live menu.
   The **render** path is not broken: `menu.js:326–330` special-cases
   `currentTab.id === 'system' && app.toolMode` and calls
   `toolsTab.renderSettings(app)` directly, so the screen paints correctly. Only
   the key-handling side is wired to the wrong module. This means every
   keystroke on the Settings screen — arrow nav, category switch, Enter-to-toggle,
   Escape/`b`-to-exit — is swallowed by `systemArea.handleKey`'s `return false`.

7. **`PostToolUse.plan-index-sync.js` calls `syncUnit` and then exits before the
   microtask can run.** `src/hooks/PostToolUse.plan-index-sync.js:162–174`:
   `Promise.resolve().then(() => syncUnit(...)).catch(...)` is deliberately NOT
   awaited (documented "fire-and-forget" in the file's own header comment,
   lines 9–13), and the very next statement is `process.exit(0)`
   (`plan-index-sync.js:174`). Node drains the microtask queue only when the
   current synchronous unit of work returns control to the event loop;
   `process.exit()` terminates the process immediately, before that hand-off
   happens. The scheduled `.then(() => syncUnit(...))` callback is therefore
   never invoked — not "eventually lost", literally never executed. The stated
   intent (fail-open, never block the tool call) is sound; the effect
   (`syncUnit` never runs at all) defeats the hook's own purpose.

### Impact

Every defect above degrades the SAME signal: the human's trust that the menu did
what it says. (1) breaks a documented command outright. (2) is the most severe —
it can silently duplicate a running background agent AND reject that agent's real
completion, corrupting the task plane's picture of its own state (H8, highest
severity finding in the parent vision's Scope section for this workstream).
(3) silently corrupts human-authored data (task notes). (4) turns a typo into an
unreadable crash instead of an actionable error. (5) is a path-traversal gap in
two of three plan-reference call sites. (6) makes an entire dashboard area
(Settings) permanently non-interactive. (7) makes the plan-index sync a complete
no-op disguised as a working fire-and-forget hook — every downstream feature that
reads the semantic plan index (search, related-plans, dup-guard) silently
operates on a stale index forever, with no error anywhere.

## 2. ALIGN

**Job to be done:** When a background `implement` agent is genuinely still
working on a plan and the maintainer opens the CTOC dashboard, they want
reconciliation to trust the live agent state instead of a blind 30-minute clock,
so they are never shown a false orphan, never offered a duplicate agent on the
same plan, and never have the agent's real completion rejected.

**Impact Map (technical — no business/canvas content; out of scope per role
boundary):**

- **Goal:** The menu and task-plane operate as advertised, so every documented
  CTOC command has a real, crash-safe, non-corrupting entry point — directly
  serving the parent vision's success criterion "the test suite goes red on
  every defect class... and enforcement stays on and honest."
- **Actor:** The CTOC maintainer driving the menu and task plane, interactively
  and via the non-interactive JSON CLI mode used by Claude Code's WORK dispatch
  recipe (`menu.md`'s Two-Plane Protocol).
- **Impact:** The maintainer can run `/ctoc:push`, trust that a long-running
  background `implement` agent is never duplicated or rejected, store multi-word
  task notes intact, get a JSON error instead of a crash on a bad reference, use
  the Settings screen, and trust that the plan index reflects what was just
  written.
- **Deliverable:** A real `push.js` entry point + repointed `push.md`; live-agent
  plumbing from the harness through to `reconcile()` plus `agentTaskId` recorded
  at task start; a single-tokenized-args fix in the CLI arg pipeline; an
  unknown-stage guard in `route()` plus the `isUnsafePlanFile` guard applied to
  `planActions`/`reviewActions`; Settings-screen keys wired to a real handler;
  the PostToolUse hook awaiting `syncUnit` before exit.

**Success metrics:**
- All 6 named findings (H3, H8, M6, M8, M11, M12) plus the 7th verified defect
  (PostToolUse exit-before-sync) each have a test that fails on current `main`
  and passes after the fix — this workstream's version of the parent vision's
  "the test suite goes red on every defect class" criterion.
- Zero raw Node stack traces on stderr from any `node menu.js <args>` invocation
  covered by this plan's scope.
- Zero regressions in the *existing correct* staleness-orphan path (a task with
  no live id past the 30-minute threshold must still be orphaned — the fix adds
  a true-positive check, it must not remove the true-negative one).
- `menu task complete`/`start`/`fail`/`cancel` round-trip any multi-word
  `--summary`/`--next` value byte-for-byte.

## 3. CAPTURE

### Acceptance Criteria

- [ ] **Scenario: Push entry point resolves and runs (H3, happy path)**
  Given a checkout with a clean working tree
  When `/ctoc:push`'s instructions are followed (`node
  "${CLAUDE_PLUGIN_ROOT}/src/commands/push.js"`, mirroring the `menu.js`/
  `update.js` invocation pattern)
  Then the process exits with a structured success result (not "command not
  found", not a raw crash) and the result indicates quality checks ran.

- [ ] **Scenario: Push reports Tier 1 failure, does not push (H3, error path)**
  Given a checkout with a Tier-1-blocking issue (e.g. a failing test)
  When the push entry point runs
  Then it returns a non-zero/failure result naming the blocking check, and no
  `git push` is attempted.

- [ ] **Scenario: `push.md`'s documented flags are real (H3, edge case)**
  Given `push.md`'s documented `--force`, `--skip-tests`, `--dry-run` options
  When the entry point is invoked with each flag individually
  Then each flag produces the documented, distinct behavior (no flag is
  silently ignored or unrecognized).

- [ ] **Scenario: Live long-running agent is NOT orphaned (H8, happy path)**
  Given a background `implement` task whose `agentTaskId` was recorded at
  `menu task start` and whose id is present in the harness's live-agent-id
  list, and the task is older than the 30-minute staleness threshold
  When the dashboard reconciles on menu open
  Then that task's status stays `running` (not `orphaned`), and NO duplicate
  agent is offered for its plan.

- [ ] **Scenario: Genuinely dead task past the threshold IS still orphaned (H8,
  regression guard — must not just disable staleness detection)**
  Given a `running` task whose id has no match in the live-agent-id list and
  which is older than the 30-minute staleness threshold
  When the dashboard reconciles
  Then that task IS transitioned to `orphaned` — a live-id task and a dead-id
  task in the same reconcile pass get opposite outcomes.

- [ ] **Scenario: Concurrency cap counts the live task (H8)**
  Given the live long-running task from the first H8 scenario, correctly left
  `running`
  When the ≤5 concurrency check runs
  Then that task counts as one of the ≤5 (not excluded), so a 6th concurrent
  dispatch on a different plan is queued, not run.

- [ ] **Scenario: Genuine completion is accepted (H8)**
  Given the live long-running task from the first H8 scenario
  When it later calls `menu task complete <id> --summary "done"`
  Then the transition `running → done` succeeds — it is NOT rejected as an
  invalid `orphaned → done` transition.

- [ ] **Scenario: True session restart still falls back to staleness (H8, edge
  case)**
  Given the harness genuinely reports no live agents (e.g. a true session
  restart, live-agent-id list unavailable)
  When reconcile runs
  Then a `running` task older than the staleness threshold is still orphaned
  (the existing correct fallback behavior is preserved unchanged).

- [ ] **Scenario: Multi-word `--summary` persists in full (M6, happy path)**
  Given `menu task complete t1 --summary "two words here"`
  When the task record is read back
  Then the stored summary is exactly `"two words here"` (3 words, not
  truncated to `"two"`).

- [ ] **Scenario: Multi-word `--next` persists in full (M6)**
  Given `menu task complete t1 --next "do the next thing"`
  When the task record is read back
  Then the stored `nextAction` is exactly `"do the next thing"` (4 words, not
  truncated to `"do"`).

- [ ] **Scenario: Unknown stage returns the JSON error contract (M8)**
  Given `node menu.js "plan bogus/x.md"`
  When the router runs
  Then it returns `{text, ask, actions}` JSON on stdout with a non-zero exit
  code where appropriate, and stderr contains NO raw stack trace.

- [ ] **Scenario: Traversal rejected in `planActions` (M11)**
  Given `node menu.js "plan functional/../../../etc/passwd"`
  When `planActions` is invoked
  Then `isUnsafePlanFile` rejects the reference with the same refusal message
  `validateScreen` produces — no file read is attempted.

- [ ] **Scenario: Traversal rejected in `reviewActions` (M11)**
  Given `node menu.js "plan review/../../../etc/passwd" review`
  When `reviewActions` is invoked
  Then the traversal reference is rejected the same way — no file read is
  attempted.

- [ ] **Scenario: Settings navigation key dispatches (M12, happy path)**
  Given the Settings screen is open (`app.toolMode === '3'`)
  When the down-arrow key is pressed
  Then `app.settingIndex` advances and the re-rendered screen shows the new
  selection — the keystroke is NOT swallowed.

- [ ] **Scenario: Settings toggle actually persists (M12)**
  Given the Settings screen is open with a toggle-type setting selected
  When Enter is pressed
  Then the setting's value flips and is persisted to `.ctoc/settings.yaml`
  (verified by re-reading the file), matching the existing
  `toolsTab.handleKey` toggle behavior.

- [ ] **Scenario: PostToolUse hook awaits the sync before exit (happy path)**
  Given a `Write`/`Edit` on a `plans/**/*.md` file with PI0 wiring available
  When the PostToolUse hook process returns
  Then the plan index already reflects the change — a read of the index
  immediately after the hook's exit shows the update (no race).

- [ ] **Scenario: Sync failure is logged, hook still exits 0 (edge case)**
  Given `syncUnit` rejects (e.g. embedder throws)
  When the hook runs to completion
  Then the rejection is recorded in `.ctoc/logs/plan-index-sync.json` and the
  process still exits 0 (fail-open is preserved — a sync failure must never
  block the tool call).

### Scope

**In Scope**
- Create `src/commands/push.js` as a real, invokable entry point; repoint
  `src/commands/push.md`'s instructions at it (mirrors #1–3 above).
- Plumb a live-agent-id list from the calling context through
  `route()`/`dashboardPipeline()`/`buildDashboardTable()` into
  `taskReconcile.reconcileState()`, replacing the `menu-screens.js:195`
  hardcoded `null`; record `agentTaskId` in `taskTransition`'s `start` patch
  (`menu-screens.js:1502`) (#4–8 above).
- Stop re-splitting already-tokenized argv in `main()` (`menu.js:539`) so
  `--summary`/`--next` values survive intact (#9–10).
- Add an unknown-stage guard to `route()`'s `case 'plan':`/`case 'validate':`
  paths (or to `planActions` itself) so an unrecognized stage returns the JSON
  error contract instead of throwing (#11); apply `isUnsafePlanFile` to
  `planActions` and `reviewActions` (#12–13).
- Route Settings-screen (and Doctor/Update sub-mode) key handling to
  `toolsTab.handleKey` when `currentTab.id === 'system' && app.toolMode` is set,
  instead of the hardcoded `systemArea.handleKey` no-op (#14–15).
- Make `PostToolUse.plan-index-sync.js` await `syncUnit` (with its existing
  fail-open catch) before `process.exit(0)` (#16–17).

**Out of Scope**
- The enforcement/PreToolUse gate hooks themselves — lives in W1/W2/W8 of the
  parent vision (`plans/done/ctoc-self-audit-remediation.md`, Scope items 1
  and 8).
- Audit-log durability and agent-lock atomicity — W11 (Scope item 11).
- The agent registry / agent-name resolution layer — W3/W4 (Scope items 3–4).
- Any Iron Loop step semantics or step-label validation — unchanged by this
  workstream (parent vision's explicit "Out of scope: no re-architecture of the
  Iron Loop step model").
- Defining what `push.js` does beyond the behavior `push.md` already documents
  (Tier 1/2 checks then `git push`) — no new release/version-metadata logic;
  that is W9 (Scope item 9, release and metadata truth).
- Any change to `task-registry.js`'s core registry schema or its
  `runningTasks`/`evaluateConcurrency` counting rule itself (only the callers
  that feed it correct data change).

### Story Breakdown (INVEST)

Kept as the largest, most cohesive workstream in this vision (10 stories across
4 activities). Each story is Small (≤3 days) and Testable; Independence notes
below explain the one legitimate exception (the H8 foundation + its two ribs).

**Activity 1 — Invoke a documented operation (push)**

1. `[MVP]` **As a** maintainer, **I want** `/ctoc:push` to resolve to a real
   `push.js` entry point, **so that** the documented push flow runs instead of
   hitting a missing command. — I/N/V/E/S/T: all Y. Standalone. Validated by
   scenarios 1–2.
2. **As a** maintainer, **I want** `push.md` to point at the shipped entry
   point, **so that** the slash command and the code agree. — all Y.
   Independently testable (doc-vs-code match), pairs naturally with story 1.
   Validated by scenario 3.

**Activity 2 — Run a background agent and reconcile orphans**

3. `[MVP]` **As a** maintainer, **I want** `menu task start` to record
   `agentTaskId` and reconcile to receive the live agent-id list, **so that** a
   live background agent is never falsely orphaned. — I: partial (foundation
   for stories 4–5), N/V/E/S/T: Y. Foundation story; independently valuable on
   its own (fixes the blind `liveAgentIds: null`). Validated by scenarios 4, 5,
   8.
4. **As a** maintainer, **I want** the ≤5 concurrency cap to count the real
   live set, **so that** I am not offered a duplicate agent on a plan that is
   already running. — I: depends on story 3; N/V/E/S/T: Y. Small once ids
   exist. Validated by scenario 6.
5. **As a** maintainer, **I want** a genuinely live agent's completion to be
   accepted, **so that** the real `implement → done` transition is not
   rejected as an invalid orphaned move. — I: depends on story 3; N/V/E/S/T:
   Y. Vertical, transition-level test. Validated by scenario 7.

**Activity 3 — Complete and route tasks safely**

6. `[MVP]` **As a** maintainer, **I want** `menu task complete --summary "two
   words"` to persist the full multi-word summary (and the same for
   `--next`), **so that** my notes are not truncated to the first word. — all
   Y. Fully independent; fixes the `menu.js:539` re-split. Validated by
   scenarios 9–10.
7. **As a** maintainer, **I want** `node menu.js "plan bogus/x.md"` to return
   the JSON error contract, **so that** an unknown stage fails safely instead
   of crashing. — all Y. Independent router guard. Validated by scenario 11.
8. **As a** maintainer, **I want** a path-traversal plan reference to be
   rejected the same way in `planActions` and `reviewActions` as it already is
   in `validateScreen`, **so that** a malformed reference can never escape
   `plans/`. — all Y. Reuses the existing guard; independent of story 7
   (different functions, same file). Validated by scenarios 12–13.
9. **As a** maintainer, **I want** the `s` Settings screen keys to dispatch
   through `toolsTab.handleKey`, **so that** the Settings screen is not
   inert. — all Y. Independent; a routing fix, the handler logic already
   exists and is correct. Validated by scenarios 14–15.
10. **As a** maintainer, **I want** the PostToolUse index sync to complete
    before process exit, **so that** the plan index is not silently stale
    after a tool call. — all Y. Independent hook-ordering fix. Validated by
    scenarios 16–17.

All ten stories are Small and Testable. Stories 3–5 share the `agentTaskId`/
`liveAgentIds` foundation (max dependency depth 2, within the ≤3 circuit-breaker
limit) and are not fully Independent by design — story 3 is the walking
skeleton, stories 4–5 are its two ribs; splitting the foundation further would
produce an untestable horizontal slice (a `liveAgentIds` plumb with no consumer,
or an `agentTaskId` write with nothing reading it).

### Files likely touched

- `src/commands/push.js` — new. Real entry point behind `/ctoc:push`.
- `src/commands/push.md` — repoint the bash block at `push.js` (mirror
  `menu.md`/`update.md`'s `node "${CLAUDE_PLUGIN_ROOT}/src/commands/…"`
  pattern).
- `src/commands/menu.js` — fix the `cliArgs.flatMap(arg => arg.split(/\s+/))`
  re-split at line 539; the `main()` non-interactive JSON path needs the
  interface change noted in Decisions Taken Under Ambiguity to carry
  `liveAgentIds`.
- `src/lib/menu-screens.js` — replace the `liveAgentIds: null` hardcode
  (line 195) and thread the parameter through `buildDashboardTable` /
  `dashboardPipeline` / `route`; set `agentTaskId` in `taskTransition`'s
  `start` patch (line 1502); add the unknown-stage guard to `route()`'s
  `plan`/`validate` cases; apply `isUnsafePlanFile` inside `planActions`
  (line ~1069) and `reviewActions` (line ~1184).
- `src/areas/system.js` — replace the hardcoded `handleKey(_key, _app) {
  return false; }` (lines 47–49) with delegation to `toolsTab.handleKey` when
  `app.toolMode` is set.
- `src/tabs/tools.js` — no logic change expected (its `handleKey` is already
  correct); becomes reachable once `system.js` delegates to it.
- `src/hooks/PostToolUse.plan-index-sync.js` — `await` the `syncUnit` promise
  chain (with its existing `.catch(logError)`) before `process.exit(0)`
  (lines 162–174).
- `src/lib/task-reconcile.js` — likely untouched (`reconcile()`'s pure core
  already handles `liveAgentIds` correctly); reference only, to be confirmed at
  Step 5/6.
- `src/lib/task-registry.js` — likely touched only if `updateTask`'s patch
  shape needs an explicit `agentTaskId` field allowlisted; to be confirmed at
  Step 5/6 (not a functional-plan-level decision).

### Test strategy

- **Unit, per defect.** One test file per defect class (mirrors the vision's
  "test suite goes red on every defect class" criterion): a push-entry-point
  resolution test, a `reconcile()` liveAgentIds-supplied test (both true-positive
  "live, not orphaned" and true-negative "dead, still orphaned" cases in the same
  test file so a broken fix cannot pass by disabling staleness detection
  entirely), a CLI-arg-splitting round-trip test for `--summary`/`--next`, a
  `route()` unknown-stage test asserting the JSON contract and asserting nothing
  is written to stderr, an `isUnsafePlanFile` traversal test against both
  `planActions` and `reviewActions`, a Settings-key-dispatch test asserting
  `toolsTab.handleKey` (not `systemArea.handleKey`) receives the keystroke, and
  a PostToolUse-hook test that awaits the hook's promise and then reads the
  index synchronously to prove the write landed before exit.
- **Every test fails on current `main` and passes after its fix** — required by
  the parent vision; do not write a test that would already pass today.
- **No raw-crash regression sweep.** A small parametrized test drives `route()`
  with a set of malformed/adversarial refs (unknown stage, traversal, empty
  file, null byte) and asserts every one returns `{text, ask, actions}` JSON,
  never throws past `route()`.
- **Concurrency-cap integration test.** Seed a registry with one genuinely-live
  long-running task (via a fake `liveAgentIds` set) and 4 other running tasks;
  assert a 6th `menu task add` is queued, not run — proves the cap counts the
  live task rather than silently freeing its slot.
- **Cross-platform.** All new/changed code goes through `safe-fs`, uses
  `path.join`, and the traversal test set includes both `/`- and `\`-style
  attempts (per the CRLF/cross-platform lesson already documented elsewhere in
  the parent vision — H1/M13/M22 — this workstream does not repeat that defect).

## Decisions Taken Under Ambiguity

- **No canvas / no Business Model Canvas (N/A).** No canvas exists at
  `plans/canvas/ctoc-self-audit-remediation.md`. This is a technical remediation
  vision; a Business Model Canvas is not applicable. Proceeded with vision-only
  extraction rather than kicking back.

- **Push semantics.** The vision names "a real entry point for `/ctoc:push`" but
  does not specify new behavior beyond what `push.md` already documents. Scoped
  `push.js` as the entry point implementing exactly the Tier 1/2 check-then-push
  contract `push.md` already describes, mirroring how `menu.js`/`update.js`
  are invoked (`node "${CLAUDE_PLUGIN_ROOT}/src/commands/push.js"`) rather than
  assuming a global `ctoc` binary that does not exist anywhere in this repo (no
  `bin` field in `package.json`). This avoids scope creep into release/version
  metadata (W9).

- **`agentTaskId` vs `liveAgentIds` ownership — kept as one foundation story**
  (unchanged from the original stub's reasoning): the fix needs both a produced
  id (at task start) and a consumed live-id list (at reconcile); splitting them
  would create an untestable horizontal slice.

- **How `liveAgentIds` is plumbed — the interface constraint the Implementation
  Planner needs, verified against the actual call chain.** `menu.js` runs as a
  Node **child process** per invocation (`node menu.js <args>` or, with no args,
  the non-interactive JSON dashboard path at `menu.js:561–580`) — it has no
  in-memory handle to the Claude Code harness's live `TaskList`; that object
  lives only in the parent Claude Code session. `menu.md`'s own "ON-OPEN
  RECONCILE (NB4)" section already states the requirement precisely: "the main
  loop **MUST** pass the live harness agent-id list into the render as
  `liveAgentIds`." Tracing the actual call chain confirms there is currently NO
  parameter for this anywhere: `route(args, projectPath)` →
  `dashboardPipeline(projectPath)` → `buildDashboardTable(projectPath)` →
  `taskReconcile.reconcileState(root, { liveAgentIds: null })` — every layer
  takes only `projectPath` today. Because the boundary between "the process
  that knows the live agent ids" (the Claude Code session, which drives NAV
  turns per `menu.md`'s Two-Plane Protocol) and "the process that renders the
  dashboard" (the `node menu.js` child process) is a process boundary, not an
  in-memory call, the id list can only cross it via argv (or an equivalent
  file/stdin channel) — never as a JS parameter alone. This plan does NOT pick
  the exact flag shape (e.g. a new `--live-agent-ids <csv>` argument threaded
  through `route()`, versus a small JSON side-channel file the session writes
  before invoking `menu.js`) — that is an Implementation Planner (Step 5/6)
  decision. What this plan fixes as a hard constraint, so Steps 5–6 do not have
  to rediscover it: the fix must add a NEW parameter to `route()` →
  `dashboardPipeline()` → `buildDashboardTable()` → `reconcileState()`'s
  `opts.liveAgentIds`, sourced from CLI input (not a shared in-process object),
  and it must degrade to today's `null`/staleness-backstop behavior when the
  calling context has no live-agent-id data to supply (true session restart) —
  scenario 8 above locks in that fallback as a requirement, not an oversight to
  remove.

## 5. PLAN / DESIGN — Decomposition into SIP1 slices

This functional-derived plan is an **INDEX**. Per SIP1, Steps 5–7 decompose it into
**6 dependency-ordered implementation slices**, each its own complete plan in
`plans/implementation/` with a focused `files:` list (~1–3 files, a module + its test
kept together) and its own Steps 8–16. Each of the six confirmed defects (H3, H8, M6,
M8, M11, M12, and the 7th — the PostToolUse index-sync no-op) maps to exactly one slice;
M8 and M11 are one cohesive slice because both are "an untrusted plan reference reaching
`path.join` unguarded in the same file." The `implementation-planner` emits more plans
than the single functional plan by design — a whole-feature build would exceed one clean
executor pass; a crash mid-build would lose all in-flight work.

### Why six slices (SIP1 cohesion)

- **s1 (H3)** and **s4 (H8)** are the two HIGH-severity findings — separate concerns,
  separate slices. s4 is the single largest slice (the H8 walking skeleton + its two
  ribs — stories 3–5 of the functional plan's INVEST breakdown — which the functional
  plan explicitly keeps as one foundation: splitting a `liveAgentIds` plumb from its
  `agentTaskId` producer would create an untestable horizontal slice). Stories 4 and 5
  (concurrency-cap counts the live task; completion accepted) add **zero** production
  code beyond s4's plumbing — they are acceptance tests that pass once the live task is
  no longer falsely orphaned — so they ship as test cases inside s4, not as pure-test
  slices.
- **s2 (M6)**, **s3 (M8+M11)**, **s5 (M12)** are the independent MEDIUM fixes.
- **s6** is the independent 7th defect (hook await-before-exit ordering).

### Shared-file partitioning (ordered by `depends_on`, never parallel)

Two source files are touched by more than one slice; per the parent's constraint they
are serialized with `depends_on`, never edited concurrently:

- `src/commands/menu.js` — **s2** (fix the `:539` arg re-split) then **s4** (extract
  `--live-agent-ids`, thread `opts` through `main()`). s4 `depends_on` s2.
- `src/lib/menu-screens.js` — **s3** (route/plan-ref crash + traversal guards) then
  **s4** (add the `opts`/`liveAgentIds` 3rd parameter to `route`/`dashboardPipeline`/
  `buildDashboardTable`; record `agentTaskId` at `menu task start`). s4 `depends_on` s3.

Max new dependency depth is **1** (s4 on s2, s3) — well within the ≤3 circuit-breaker
limit; no cycles. Every other slice is depth 0 (independent).

### Load-bearing Step-5/6 decision the functional plan deferred

- **`liveAgentIds` channel = argv `--live-agent-ids <csv>` (not a side-channel file).**
  The functional plan fixed the hard constraint (the id list must cross the `menu.js`
  child-process boundary via CLI input, degrading to the staleness backstop when absent)
  but left the exact shape to the Implementation Planner. Decision: a new argv argument
  `--live-agent-ids <csv>`, parsed in `menu.js:main()` and threaded as `opts` through
  `route`. Rejected the JSON side-channel file: a stale file would be read as "live" and
  keep a genuinely-dead task `running` — reintroducing the false-state bug in the
  opposite direction and demanding TTL/cleanup logic. argv is stateless: absent ⇒
  backstop (scenario 8), present ⇒ authoritative for that one render. Full rationale in
  `ctoc-audit-w10-s4-live-agent-reconcile.md`'s ADR.
- **No change to `task-reconcile.js` or `task-registry.js`.** Verified against live code:
  `reconcile()` (`task-reconcile.js:126-206`) already honors `opts.liveAgentIds` and
  `t.agentTaskId`, and `MUTABLE_FIELDS` (`task-registry.js:80`) already allowlists
  `agentTaskId`. The H8 fix supplies the two inputs they already consume; it does not
  modify their core (matching the functional plan's "only the callers that feed it
  correct data change").

## 6. SPEC — Slice Index (dependency-ordered)

Each row is a complete implementation plan in `plans/implementation/`; open it for its
File Specifications, Test Plan, Security Review, and Steps 8–16.

| # | Slice file | Files touched | `depends_on` |
|---|------------|---------------|--------------|
| 1 | `ctoc-audit-w10-s1-push-entry-point.md` | `src/commands/push.js` (new) · `src/commands/push.md` · `src/lib/quality-agent.js` (guard+exports) · `tests/w10-push-entry-point.test.js` (new) | none |
| 2 | `ctoc-audit-w10-s2-multiword-task-args.md` | `src/commands/menu.js` (`:539` split) · `tests/w10-task-arg-splitting.test.js` (new) | none |
| 3 | `ctoc-audit-w10-s3-menu-route-safety.md` | `src/lib/menu-screens.js` (route/plan-ref guards) · `tests/w10-menu-route-safety.test.js` (new) | none |
| 4 | `ctoc-audit-w10-s4-live-agent-reconcile.md` | `src/commands/menu.js` (`--live-agent-ids` + `main()` opts) · `src/lib/menu-screens.js` (`opts`/`liveAgentIds` thread + `agentTaskId`) · `tests/w10-live-agent-reconcile.test.js` (new) | s2, s3 |
| 5 | `ctoc-audit-w10-s5-settings-keys.md` | `src/areas/system.js` (delegate to `toolsTab.handleKey`) · `tests/w10-settings-key-dispatch.test.js` (new) | none |
| 6 | `ctoc-audit-w10-s6-plan-index-sync-await.md` | `src/hooks/PostToolUse.plan-index-sync.js` (await before exit) · `tests/w10-plan-index-sync-await.test.js` (new) | none |

A valid build order is s1, s2, s3, s4, s5, s6 (s4 after its dependencies s2 and s3).

**Acceptance-criteria coverage** (the parent's 17 BDD scenarios → slices):
Push resolves/runs → s1. Push reports Tier-1 failure, no push → s1. Push documented flags
are real → s1. Live long-running agent NOT orphaned → s4. Dead task past threshold still
orphaned → s4. Concurrency cap counts the live task → s4. Genuine completion accepted →
s4. True session restart falls back to staleness → s4. Multi-word `--summary` persists →
s2. Multi-word `--next` persists → s2. Unknown stage returns the JSON contract → s3.
Traversal rejected in `planActions` → s3. Traversal rejected in `reviewActions` → s3.
Settings navigation key dispatches → s5. Settings toggle actually persists → s5.
PostToolUse hook awaits the sync before exit → s6. Sync failure logged, hook still exits
0 → s6.

**Gate note (HARD STOP — Gate 2 belongs to the human):** these six slices and this parent
INDEX all remain in `plans/implementation/`. This decomposition writes **no**
`approved_by` marker on any slice, moves nothing to `todo`, and does not cross Gate 2.
Gates 2 and 3 batch per parent via `approveSubplans('ctoc-audit-w10-menu-taskplane',
fromStage)` — one human decision stamps every sibling — but that is the maintainer's
deliberate foreground action, not this agent's.


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
