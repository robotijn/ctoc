---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:58.021Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-13T11:01:11.760Z
gate_crossed: functional → implementation
---

---
title: "W11 — State Durability and Dead-Code Removal"
created: "2026-07-11T00:00:00Z"
type: feature
parent_vision: "vision/ctoc-self-audit-remediation.md"
priority: MEDIUM
depends_on: none
---

# W11 — State Durability and Dead-Code Removal

> **This plan is now a SIP1 INDEX.** The approved functional scope below (ASSESS / ALIGN /
> CAPTURE) is decomposed into **9 dependency-ordered implementation slices**, each a cohesive
> ~1–3-file unit (module + its test) with its own Iron Loop Steps 8–16. Implementation stays
> **sequential + dependency-ordered** (a slice is not started until its `depends_on` is built).
> Gates 2 & 3 **batch per parent** via `approveSubplans('ctoc-audit-w11-state-durability-and-deadcode', …)`
> — ONE human decision stamps every sibling. `listSubplans(...)` enumerates the whole set.

## Slices (dependency-ordered)

The parent's **two clusters are kept distinct**. The one exception, **s7**, spans both because
its H10 (queue) fix and its B2 (dead-wrapper) deletion both live in `src/lib/actions.js`, and
the no-two-slices-edit-the-same-source-file rule forces them into one slice. **No two slices
edit the same source file.**

**Cluster A — State durability & concurrency**

| # | Slice file | Scope (one line) | Findings | depends_on |
|---|------------|------------------|----------|------------|
| s1 | `ctoc-audit-w11-s1-durable-log.md` | NEW `durable-log.js`: atomic append-only JSONL + corrupt-file quarantine (shared primitive) | M1 | — |
| s2 | `ctoc-audit-w11-s2-enforcement-log.md` | `enforcement-log.js` → durable-log; add `readLog` | M1/M14/M15 | s1 |
| s3 | `ctoc-audit-w11-s3-transition-log.md` | `transition-log.js` → durable-log; `readLog` API unchanged | M14/M15 | s1 |
| s4 | `ctoc-audit-w11-s4-gate-violations-durability.md` | `human-gate-check.js` + `violation-tracker.js` → durable-log (shared `gate-violations.json`, both writers) | M14/M15 | s1 |
| s5 | `ctoc-audit-w11-s5-agent-lock-wx.md` | `agent-lock.js` `wx` exclusive-create + owner token; stale recovery preserved | M2 | — |
| s6 | `ctoc-audit-w11-s6-settings-raw-roundtrip.md` | `settings.js` `setSetting` raw round-trip preserves `deployment`/`sync` | M16 | — |

**Cluster B — Dead & misleading code removal** (each deletion removes the code AND its own test — paired-deletion rule)

| # | Slice file | Scope (one line) | Findings | depends_on |
|---|------------|------------------|----------|------------|
| s7 | `ctoc-audit-w11-s7-queue-order-and-dead-exports.md` | `actions.js` real queue key (`.ctoc/state/todo-order.json`) + `state.js` `readPlans` ordering; delete 5 dead agent-init wrappers | H10 (A) + B2 (B) | — |
| s8 | `ctoc-audit-w11-s8-legacy-tab-cleanup.md` | delete 3 dead tab modules; remove one-keystroke gate crossings in `functional.js`/`review.js`; update shared `tab-modules.test.js` | B1, B3, L7, L8 | — |
| s9 | `ctoc-audit-w11-s9-hooks-installer-path.md` | `hooks-installer.js` post-commit path → real `src/hooks/post-commit.js` | L9 | — |

**Coverage:** the 9 slices' findings union = all twelve originating findings (M1, M2, M14,
M15, M16, H10, B1, B2, B3, L7, L8, L9). **Dependency graph:** s1 → {s2, s3, s4} (max depth 2,
no cycles); s5, s6, s7, s8, s9 independent. **Source-file partition (verified disjoint):**
s1 `durable-log.js`; s2 `enforcement-log.js`; s3 `transition-log.js`; s4 `human-gate-check.js` +
`violation-tracker.js`; s5 `agent-lock.js`; s6 `settings.js`; s7 `actions.js` + `state.js`;
s8 `tabs/{implementation,progress,todo,functional,review}.js`; s9 `hooks-installer.js`.

## 1. ASSESS

### Business Context

The audit trail that is supposed to prove CTOC's four human gates actually fired is the
least durable thing in the system: it is written with an unguarded read-modify-write and a
`catch { log = [] }` that discards the entire history the instant a write is interrupted or
races another write. The agent lock that is supposed to guarantee "only one plan executes at
a time" is check-then-act, so it can silently double-acquire. A settings save can silently
erase an entire configuration category. A "reorder the queue" button can silently do nothing.
And three tab modules, five wrapper functions, and a broken hook-install path sit in the tree
looking like live logic when they are not — so a contributor reading the code, or an agent
deciding what to touch, is misled about what actually runs. None of this is visible from a
green test suite; it only shows up under concurrency, under a corrupt file, or under a `grep`
for a symbol nobody calls. This is the same class of blind spot the parent vision names
directly: "the tests assert structure, not truth."

### Current State (verified against the live codebase, 2026-07-11)

**M1/M14/M15 — Audit logs are racy read-modify-write with silent history loss.**
Three independent logs share the same unsafe pattern: read the whole file, `JSON.parse` it,
push one entry, write the whole file back — with no lock, no atomic rename, and a `catch`
that silently resets to an empty array on any parse failure.
- `src/lib/enforcement-log.js` — `logEnforcement()` (function starts line 21) reads
  `enforcement.json` and on line 28 does `try { log = JSON.parse(...); } catch { log = []; }`,
  then writes the whole array back on line 38. A corrupt file or a second concurrent
  `logEnforcement()` call loses every prior entry.
- `src/hooks/human-gate-check.js` — `loadViolations()` (function starts line 33) has the
  identical shape: line 34-38 `try { ... JSON.parse ... } catch { /* ignore */ } return [];`,
  and `logViolation()` (line 47) does load→push→`saveViolations()` (whole-file overwrite,
  line 42-45) with no locking. A truncated `gate-violations.json` silently resets to empty on
  the next violation.
- `src/lib/transition-log.js` — `readLog()` (function at line 40, `catch` at lines 48-50)
  returns `[]` on any parse error, and `logTransition()` (line 66) does the same
  read-whole→push→write-whole round trip on line 83-84 with no lock. (Note: the file:line the
  originating vision cited, `transition-log.js:38`, lands inside `readLog`'s JSDoc block, not
  executable code; the real function is at line 40 and its silent-reset `catch` is at line 48 —
  corrected here.)

**M2 — The agent lock is check-then-act (TOCTOU), not exclusive-create.**
`src/lib/agent-lock.js`, `acquireLock()` (function starts line 78): it calls `readLock()`
to check for an existing live lock (lines 80-92), and only *after* that check does it
`safeFs.writeFileSync(lockPath, ...)` on line 102 — a plain write, no `wx` (exclusive-create)
flag, no owner-token compare-and-swap. Two `startAgent` calls issued close together can both
pass the "no live lock" check before either writes, and both then "acquire" — violating the
sequential-plan-execution rule the lock exists to enforce.

**M16 — `setSetting` erases non-schema config blocks.**
`src/lib/settings.js`, `setSetting()` (function starts line 232): it calls `loadSettings()`
(line 233), which — per `SETTINGS_SCHEMA` (lines 32-111) — only ever populates the six/seven
schema categories (`general`, `agents`, `workflow`, `learning`, `git`, `privacy`,
`plan_index`). It then writes that schema-only merged object straight back via
`saveSettings()` (line 236). Any top-level key in the raw `settings.json` that is *not* in
`SETTINGS_SCHEMA` — concretely `deployment` (read by `src/lib/deployment.js`, per this same
file's own header comment, lines 5-18) and any future `sync` block — is silently dropped on
the very next `setSetting()` call. The module already exports `readRawSettings()` (line 161),
which reads the file without merging defaults — the raw round-trip primitive needed to fix
this already exists, it is just not used by `setSetting`.

**H10 — Queue reorder is a no-op.** `src/lib/actions.js`, `moveUpInQueue()` (function starts
line 422) and `moveDownInQueue()` (function starts line 452): both sort the `todo/` directory
listing by `stat.birthtime` (lines 432, 462) and then attempt to "swap" two entries' order by
calling `safeFs.utimesSync(path, atime, mtime)` (lines 443/445, 472/474). `utimesSync` only
ever accepts an access-time and a modify-time argument — there is no birthtime/creation-time
parameter in the Node.js `fs` API, and on the filesystems CTOC runs on (ext4, APFS) birthtime
is immutable via any standard write syscall. So the sort key the function just tried to change
never actually changes, and a second read of the queue returns the identical order. The
function returns `true` (success) and busts the cache (`invalidate()`, lines 447/476) as if
the reorder happened — a silent no-op reported as success.

**B1/B2/B3 — Dead and misleading code.**
- **Three unmounted tab modules.** `src/tabs/implementation.js`, `src/tabs/progress.js`,
  `src/tabs/todo.js` are fully-formed modules (render/handleKey) but are not imported by any
  live code path. `src/commands/menu.js` (lines 235-258) explicitly documents this: "CTOC v7
  (A3.2): import 5 area modules. Legacy tab modules remain on disk but are no longer directly
  mounted by the TUI" — and imports only `overviewTab`, `functionalTab`, `reviewTab`,
  `toolsTab` as "legacy tab modules retained" for specific drill-in helper functions
  (`renderAssignConfirm`, `renderRejectInput`, doctor/update/settings render). `implementation`,
  `progress`, `todo` are absent from that retained set and absent from `tabModules` (the
  dispatch table keyed only by the 5 area ids: `pipeline`, `inbox`, `agent`, `library`,
  `system` — `src/lib/areas.js` lines 16-22). `src/areas/pipeline.js` and `src/areas/agent.js`
  independently reimplement the counts/status views these three modules used to provide,
  without requiring them. **Verified: zero live `require()` of these three files anywhere in
  the mounted TUI or the non-interactive `menu-screens.js` JSON driver.**
- **Agent-init wrapper exports with zero call sites — verified count is 5, not 7.**
  `src/lib/actions.js` exports six functions matching the "init an agent" naming pattern:
  the generic `initBackgroundAgent()` plus five named wrappers —
  `initResearchAgent`, `initCriticAgent`, `initDecomposerAgent`, `initProductOwnerAgent`,
  `initReviewAgent` (defined lines 497-541, each a one-line call into
  `initBackgroundAgent()` with a fixed `AGENT_TYPES` constant). The two functions that
  actually spawn background agents on a real state transition — `approvePlan()` (line 204)
  and `completeExecution()` (line 564) — both bypass every one of these five wrappers and call
  the generic `initBackgroundAgent()` directly with an inline `AGENT_TYPES` constant instead
  (line 240-242 for `IMPLEMENTATION_PLANNER`, line 593-594 for `REVIEW_PREPARER`). Reading the
  complete file (all 1100 lines) plus `menu.js`, the full `src/tabs/*.js` set, and
  `src/areas/pipeline.js` / `src/areas/agent.js` found no call site for
  `initResearchAgent`, `initCriticAgent`, `initDecomposerAgent`, `initProductOwnerAgent`, or
  `initReviewAgent` anywhere in `src/`. **This confirms the dead-code claim in substance, but
  the verified count is 5 exported wrapper functions with zero call sites, not the 7 the
  originating vision/stub stated — see Decisions Taken Under Ambiguity.**
- **Legacy tabs carry a one-keystroke, un-validated human-gate crossing — confirmed in two
  places.** `src/tabs/functional.js`, `executeAction()` case `'3'` (lines 160-169): a single
  keystroke `'3'` calls `approvePlan(app.selectedPlan.path, app.projectPath)` directly — no
  `validateForQueue` call, no confirmation step (contrast with the *same file's* `'6'`
  "Assign directly" action, which routes through a `confirm-assign` screen first). This
  crosses the functional→implementation human gate on one keystroke. `src/tabs/review.js`,
  `executeAction()` case `'5'` (lines 184-188): identically, one keystroke calls
  `approvePlan()` with no `validateReviewToDone` call — crossing **Gate 3** (review→done, the
  gate that exists specifically to prevent shipping unreviewed code) with zero validation.
- **`hooks-installer.js` writes a git hook pointing at a non-existent path — confirmed, path
  corrected.** The file lives at `src/lib/hooks-installer.js` (not `src/hooks/`, as the
  originating note assumed). `installPostCommitHook()` (line 475), `agentHookPath` (line 479)
  is built as `path.join(pluginRoot, 'hooks', 'post-commit.js')` where `pluginRoot` defaults to
  `path.join(__dirname, '..', '..')` — the plugin/repo root. That resolves to
  `<root>/hooks/post-commit.js`, which **does not exist**. The real file lives at
  `src/hooks/post-commit.js` (verified present). Every hook this function writes
  (`node "<agentHookPath>" ...`, lines 496 and 511) invokes a path that does not exist.

### Impact

Every one of these bugs is invisible to the 5485-green suite because each one is a logic/wiring
defect, not a syntax or type defect: the code runs, returns a value, and "succeeds" — it just
does the wrong thing. Concretely: a maintainer who trusts `enforcement.json` /
`gate-violations.json` / `transitions.json` as proof the gates fired can be shown a history
that silently lost entries; two agents can run against the same plan queue at once; a routine
settings save can permanently drop the deployment configuration; clicking "move up" in the
todo queue can do nothing while reporting success; and a contributor (or an agent) reading
`src/tabs/`, `actions.js`'s exports, or the hooks installer can reasonably believe code runs
that does not, or believe a gate is enforced in a place it silently is not.

## 2. ALIGN

**Job to Be Done:** When I am relying on CTOC's audit logs, its single-agent lock, its saved
settings, and its queue ordering to hold under real concurrent/crash conditions — and when I
am reading the codebase to understand what actually executes — I want every one of those
guarantees to be genuinely true and every reachable code path to be real, so I can trust the
system's own record of itself instead of re-verifying it by hand.

**Impact Map:**
- **Goal:** CTOC's persistent state survives concurrency and crashes without losing history,
  and the codebase contains no dead or misleading paths (parent vision, Success Criteria #9,
  and workstream 11 in Scope).
- **Actor:** The CTOC maintainer (the human CTO) who relies on the audit trail, the
  sequential-plan lock, and saved settings to be correct; and any contributor or agent reading
  the code to decide what is safe to touch or trust.
- **Impact:** The maintainer stops needing to mentally discount the audit log as "probably
  fine, probably not," stops risking two plans executing at once, stops risking a settings
  save silently deleting deployment config, and can `grep` the tree and trust that what it
  finds is what runs.
- **Deliverable:** Atomic/lossless audit-log writes for all three logs; an exclusive-create
  agent lock; a raw-settings-preserving `setSetting`; a queue reorder that actually reorders;
  deletion of the 3 dead tab modules, the verified-5 dead agent-init wrapper exports, and the
  2 legacy one-keystroke gate crossings (each deletion paired with removal of its own tests);
  and a corrected hooks-installer path — each with a test that fails on current `main` and
  passes after the fix.

**Success metrics:**
1. All twelve originating findings (M1, M2, M14, M15, M16, H10, B1, B2, B3, L7, L8, L9) have a
   test that fails on current `main` and passes after the fix.
2. `grep -r` for the deleted tab-module paths, the deleted wrapper function names, and the
   deleted one-keystroke case branches returns zero hits in `src/` **and** zero hits in
   `tests/` (paired deletion — no orphaned test exercising removed code).
3. A concurrency test driving two overlapping writes to each of the three audit logs asserts
   `entries_after == entries_before + 2` (no lost update) for all three logs, not just
   `enforcement.json`.
4. `installPostCommitHook`'s referenced hook path resolves via `fs.existsSync` to `true`.

## 3. CAPTURE

### Acceptance Criteria (Given/When/Then — each a behavior a test can DRIVE)

**Cluster A — State durability & concurrency**

- [ ] **Scenario: Atomic audit append under concurrency (M1/M14/M15 — enforcement-log.js)**
  Given `enforcement.json` has N existing entries,
  When two `logEnforcement()` calls race (interleaved or truly concurrent),
  Then the file afterward contains N+2 entries — neither write is lost.

- [ ] **Scenario: The same durability holds for the sibling logs (M1/M14/M15 — transition-log.js
  and human-gate-check.js's gate-violations.json)**
  Given `transitions.json` and `gate-violations.json` each have existing entries,
  When two writes race against the same file (one log at a time),
  Then no entry is lost in either log — the fix is not scoped to `enforcement.json` alone.

- [ ] **Scenario: Corrupt log file is quarantined, not reset (M1)**
  Given a truncated or non-JSON-parseable log file,
  When a new record is written,
  Then the corrupt file is renamed aside (quarantined) rather than silently replaced with
  `[]`, the corrupt bytes are still present on disk under the quarantine name, and a fresh
  log continues with only the new record.

- [ ] **Scenario: Exclusive agent lock under a race (M2)**
  Given no active agent lock,
  When two `startAgent` calls are issued within the same tick,
  Then exactly one call acquires the lock (with a distinct owner token) and the other
  receives an "already active" rejection — never both.

- [ ] **Scenario: Stale lock from a dead process is still reclaimable (M2 edge case)**
  Given a lock file whose PID is not alive,
  When `startAgent` is called,
  Then the stale lock is detected and the new caller successfully acquires — the
  exclusive-create fix must not regress the existing stale-lock recovery behavior.

- [ ] **Scenario: setSetting preserves non-schema config blocks (M16)**
  Given `.ctoc/settings.json` contains a `deployment` block and a `sync` block alongside
  the normal schema categories,
  When `setSetting('workflow', 'enforcementMode', 'soft')` is called,
  Then re-reading the raw settings file still contains the unmodified `deployment` and
  `sync` blocks.

- [ ] **Scenario: setSetting on a fresh project creates no phantom keys (M16 edge case)**
  Given `.ctoc/settings.json` does not yet exist,
  When `setSetting` is called for the first time,
  Then the file is created containing only the written key — no crash, no fabricated
  `deployment`/`sync` entries.

- [ ] **Scenario: Queue reorder actually changes order (H10)**
  Given three plans in `plans/todo/` in FIFO order A, B, C,
  When `moveUpInQueue` is called on C,
  Then re-reading the queue returns the order A, C, B — the ordering key genuinely
  changed, not merely reported as changed.

- [ ] **Scenario: Reorder at a queue boundary is a real no-op, not a false success (H10 edge
  case)**
  Given a single-item queue,
  When `moveUpInQueue` or `moveDownInQueue` is called on that item,
  Then the call returns `false`, the queue order is unchanged, and no cache invalidation
  fires for a no-op.

**Cluster B — Dead & misleading code removal**

- [ ] **Scenario: Dead tab modules are deleted, and so are their tests (B1)**
  Given the checkout after the fix,
  When the suite greps `src/` for any `require(...)` of `tabs/implementation`,
  `tabs/progress`, or `tabs/todo`,
  Then there are zero matches, the three files no longer exist on disk, AND their
  corresponding test files no longer exist — a test that only exercised the deleted
  module is itself deleted, not left behind as a false green.

- [ ] **Scenario: Dead agent-init wrapper exports are deleted, and so are their tests (B2 —
  verified count is 5: initResearchAgent, initCriticAgent, initDecomposerAgent,
  initProductOwnerAgent, initReviewAgent)**
  Given the checkout after the fix,
  When the suite greps `src/` and `tests/` for each of the five wrapper names,
  Then there are zero references outside their own now-deleted definitions, and any test
  that exercised only these wrappers (rather than the still-live `initBackgroundAgent` or
  `approvePlan`/`completeExecution` call sites) is deleted alongside them.

- [ ] **Scenario: No one-keystroke gate crossing survives in the functional-plan legacy tab
  (L7)**
  Given `src/tabs/functional.js`'s action menu after the fix,
  When a test drives the `'3'` (Approve) key path,
  Then no code path calls `approvePlan()` without first calling `validateForQueue()` (or the
  action/module is removed entirely) — a single keystroke can never cross the
  functional→implementation gate unvalidated.

- [ ] **Scenario: No one-keystroke gate crossing survives in the review legacy tab (L8 — Gate
  3)**
  Given `src/tabs/review.js`'s action menu after the fix,
  When a test drives the `'5'` (Approve → done) key path,
  Then no code path calls `approvePlan()` without first calling `validateReviewToDone()`
  (or the action/module is removed entirely) — Gate 3 can never be crossed by one
  unvalidated keystroke.

- [ ] **Scenario: The installed post-commit hook points at a real file (L9)**
  Given `installPostCommitHook` runs during install,
  When it writes the git post-commit hook,
  Then the path it embeds in the hook script (the argument to `node "<path>"`) resolves via
  `fs.existsSync` to `true` on the resulting checkout.

**Total: 14 acceptance criteria across 9 stories** (5 durability stories, 4 dead-code stories).

### Scope

#### In Scope
- Atomic, lossless writes for all three audit logs (`enforcement.json`, `gate-violations.json`,
  `transitions.json`) — traces to the Cluster A atomic-append and corrupt-quarantine criteria.
- `wx`/exclusive-create agent lock with an owner token, preserving existing stale-lock recovery
  — traces to the exclusive-lock and stale-lock criteria.
- `setSetting` reading/writing the raw sparse settings object (reusing the already-exported
  `readRawSettings()`) so non-schema categories (`deployment`, `sync`) survive — traces to the
  setSetting criteria.
- A real queue-ordering key (explicit `queue_pos` or an equivalent mutable field/state file) so
  `moveUpInQueue`/`moveDownInQueue` actually reorder — traces to the queue-reorder criteria.
- Deletion of `src/tabs/implementation.js`, `src/tabs/progress.js`, `src/tabs/todo.js` and
  their tests — traces to the B1 criterion.
- Deletion of the five verified-dead agent-init wrapper exports in `src/lib/actions.js`
  (`initResearchAgent`, `initCriticAgent`, `initDecomposerAgent`, `initProductOwnerAgent`,
  `initReviewAgent`) and their tests — traces to the B2 criterion.
- Removal of the one-keystroke, un-validated `approvePlan()` calls in
  `src/tabs/functional.js` (case `'3'`) and `src/tabs/review.js` (case `'5'`) — traces to the
  L7/L8 criteria.
- Fixing (or removing) the `hooks-installer.js` post-commit hook path so it never references a
  non-existent file — traces to the L9 criterion.

#### Out of Scope
- **Enforcement exit-code / block semantics** (whether a PreToolUse deny actually stops the
  tool call) — that is workstream 1 in the parent vision, a separate functional plan.
- **Human-gate provenance ledger and the revert-loop's per-violation isolation** (moving
  approval-proof outside the agent-writable plan file, ensuring one failed revert doesn't
  abandon the others) — that is workstream 2 (W2) in the parent vision; this stub only removes
  the *legacy-tab* one-keystroke bypass, it does not touch the real four-gate approval
  machinery, which W2 strengthens.
- **Release/version-metadata sync** (VERSION vs package.json vs plugin.json vs LICENSE) —
  workstream 9 (W9).
- **The menu router and task-plane commands** more broadly (background-task registry,
  `/ctoc:push` entry point, orphan reconciliation) — workstream 10 (W10). This stub only
  removes 3 specific dead tab modules and 5 specific dead export functions that intersect the
  menu/agent-orchestration code; it does not re-architect the menu or the task plane.
- **Any change that broadens what the 5-area TUI renders or how it dispatches keys** — this
  stub deletes dead/misleading code, it does not add UI surface. If a future workstream wants
  to re-expose per-plan action menus in the live 5-area TUI, that is a new, separately-scoped
  feature.

### Story Breakdown (INVEST) — two distinct clusters, kept separate

| Story | Cluster | I | N | V | E | S | T | Notes |
|-------|---------|---|---|---|---|---|---|-------|
| Atomic append across all 3 logs | A: Durability | Y | Y | Y | Y | Y | Y | Foundation for log durability; the concurrency test drives it directly. |
| Corrupt-file quarantine | A: Durability | ~ | Y | Y | Y | Y | Y | Builds on the atomic-append story (depth 2); small, well-scoped addition. |
| `wx` exclusive agent lock + owner token | A: Durability | Y | Y | Y | Y | Y | Y | Independent; must preserve existing stale-lock recovery (regression risk called out explicitly). |
| Raw-settings-preserving `setSetting` | A: Durability | Y | Y | Y | Y | Y | Y | Independent; `readRawSettings()` already exists, lowering estimation risk. |
| Real queue-ordering key | A: Durability | Y | Y | Y | Y | Y | Y | Independent; both `moveUpInQueue` and `moveDownInQueue` share the bug, one story fixes both. |
| Delete dead tab modules + tests | B: Dead code | Y | Y | Y | Y | Y | Y | Independent; verified by grep + confirmed file existence check. Paired-deletion rule applies. |
| Delete dead agent-init wrappers + tests | B: Dead code | Y | Y | Y | Y | Y | Y | Independent; verified count is 5 (not 7 — see Decisions). Paired-deletion rule applies. |
| Remove legacy one-keystroke gate crossings | B: Dead code | Y | Y | Y | Y | Y | Y | Independent; strengthens, never weakens, the real gates (W2 owns the real gate machinery). |
| Fix hooks-installer broken path | B: Dead code | Y | Y | Y | Y | Y | Y | Independent; smallest story, single-file fix, single new assertion. |

All 9 stories are Small (≤3 days) and Testable. Only the corrupt-file-quarantine story depends
on the atomic-append foundation (dependency depth 2, within the ≤3 chain-depth limit the
originating stub already established). No circular dependencies. The two clusters (A:
durability, B: dead-code removal) are independently shippable — an implementer could complete
Cluster A without touching Cluster B and vice versa, though both live under this one
functional plan per the parent vision's workstream-11 grouping.

**Paired-deletion rule (binding on every dead-code story in Cluster B):** every dead-code
DELETION story MUST remove that code's own test(s) in the SAME story/commit. Deleting
`src/tabs/todo.js` while leaving `tests/tabs-todo.test.js` (or equivalent) in place creates
either a false green (a test exercising an import that silently no-longer-exists gets
skipped/no-ops) or a broken build (a test that still `require()`s a deleted file crashes the
suite). This is distinct from W6's cross-file invariant tests (which assert that OTHER parts
of the system stay consistent with each other) — the paired-deletion rule here is narrower and
purely mechanical: a deleted module's OWN dedicated test goes with it, in the same change.

### Files likely touched

- `src/lib/enforcement-log.js` (+ its test file)
- `src/hooks/human-gate-check.js` (+ its test file)
- `src/lib/transition-log.js` (+ its test file)
- `src/lib/agent-lock.js` (+ its test file)
- `src/lib/settings.js` (+ its test file) — `setSetting()`, reusing existing `readRawSettings()`
- `src/lib/actions.js` — `moveUpInQueue()`/`moveDownInQueue()`, and deletion of
  `initResearchAgent`, `initCriticAgent`, `initDecomposerAgent`, `initProductOwnerAgent`,
  `initReviewAgent` (+ its test file)
- `src/tabs/implementation.js`, `src/tabs/progress.js`, `src/tabs/todo.js` — DELETED, along
  with their dedicated test files
- `src/tabs/functional.js`, `src/tabs/review.js` — one-keystroke `approvePlan()` case removed
  (files are NOT deleted wholesale — `renderAssignConfirm`/`renderRejectInput` and other
  exports remain live-referenced by `src/commands/menu.js`)
- `src/lib/hooks-installer.js` (verified path — NOT `src/hooks/hooks-installer.js`) —
  `installPostCommitHook()`, `agentHookPath` resolution

### Test strategy

- **Concurrency tests** for all three audit logs: spawn two near-simultaneous writes (e.g. via
  `Promise.all` or two child processes) and assert the post-condition entry count, not just
  that neither write threw.
- **Corruption tests**: pre-write a truncated/invalid JSON file, call the log-write function,
  assert (a) the quarantined file exists and contains the original corrupt bytes, and (b) a
  fresh log exists with only the new entry.
- **Lock race test**: issue two `startAgent`-equivalent acquisitions in the same tick (no
  `await` between them) and assert exactly one `acquired: true`.
- **Settings round-trip test**: seed a raw `settings.json` with a `deployment` block, call
  `setSetting`, re-read the RAW file (not the merged view) and assert the block is untouched.
- **Queue reorder test**: seed 3 plans, call `moveUpInQueue`/`moveDownInQueue`, re-read the
  directory listing via the same ordering function the live code uses, and assert the actual
  emitted order changed — not just that the function returned `true`.
- **Dead-code removal tests**: a `grep`-equivalent test (regex over `src/` and `tests/`) that
  asserts zero matches for the removed module paths and the removed export names; this test
  itself is a NEW test (it did not exist before, since nothing previously asserted these paths
  were unreachable) and stays in the suite permanently as a regression guard against the dead
  code reappearing.
- **Gate-crossing-removal tests**: drive the `'3'`/`'5'` key paths (or confirm the action no
  longer exists) and assert `approvePlan()` is never reached without the corresponding
  `validateForQueue`/`validateReviewToDone` call first.
- **Installer-path test**: run `installPostCommitHook` against a temp git repo, read the
  resulting hook script, extract the embedded path, and assert `fs.existsSync(path) === true`.

## Decisions Taken Under Ambiguity

- **No canvas / no Business Model Canvas (N/A).** No canvas exists at
  `plans/canvas/ctoc-self-audit-remediation.md`. This is a technical remediation vision; a
  Business Model Canvas is not applicable. Proceeded with vision-only extraction rather than
  kicking back (unchanged from the originating stub).

- **Log durability mechanism: recommend append-only JSONL.** The vision offered both
  "atomic append-only JSONL logs (or temp+rename with corrupt-file quarantine)." Recommending
  **append-only JSONL** (one JSON object per line, opened with `O_APPEND`) over temp+rename:
  JSONL append is a single `write(2)` syscall per entry with no read-modify-write step at all
  (removing the race at its root, not just narrowing the window), it degrades gracefully under
  a torn write (a half-written trailing line is detectable and skippable without touching prior
  lines, which is a more natural fit for "quarantine the bad part, keep the good part" than a
  whole-file temp+rename), and it avoids the extra rename+fsync choreography temp+rename needs
  to be genuinely atomic cross-platform (Windows rename-over-existing-file semantics differ from
  POSIX). This is a recommendation to the implementation planner, not a mandate — the
  acceptance criteria are written at the behavior level (no record loss, corrupt bytes
  preserved) so either mechanism satisfies them.

- **Queue ordering key: recommend explicit `queue_pos` over mtime.** The vision named both
  options. Recommending an explicit **`queue_pos` frontmatter field (or an equivalent small
  state file mapping plan → position)** over a "consistently mutable timestamp (mtime)"
  because `queue_pos` is filesystem-independent (no dependence on `utimes` semantics, which is
  the exact category of bug being fixed here) and trivially auditable by reading the field
  directly, whereas an mtime-based scheme still depends on the OS honoring `utimes` calls
  precisely and is one step removed from the same class of bug this story fixes. This is a
  recommendation, not a mandate; the acceptance criteria are written at the behavior level
  ("reorder actually reorders") so either key satisfies them.

- **Dead-code test removal is in scope here, not a W6 overlap.** The parent vision notes W6
  owns the truthful-tests principle broadly, but deleting a module while leaving its test
  behind creates a false green or a broken build immediately. Each deletion story in Cluster B
  explicitly removes its own dedicated tests in the same change (the paired-deletion rule,
  above). This does not overlap W6, which owns cross-file invariant tests (registry paths
  resolve, step agents resolve, etc.) — a different, broader category from "this file's own
  test file."

- **Agent-init dead-export count: verified 5, not 7 — flagged for the maintainer.** The
  originating vision/stub states "seven exported agent-init functions have zero call sites."
  Reading the complete `src/lib/actions.js` (all ~1100 lines, including the full
  `module.exports` list) plus `src/commands/menu.js`, all six files under `src/tabs/`, and
  `src/areas/pipeline.js` / `src/areas/agent.js` found exactly **five** wrapper functions
  matching this description with zero call sites (`initResearchAgent`, `initCriticAgent`,
  `initDecomposerAgent`, `initProductOwnerAgent`, `initReviewAgent`) — the sixth
  similarly-named function, `initBackgroundAgent`, is genuinely live (called directly by both
  `approvePlan()` and `completeExecution()`). The acceptance criteria and scope in this plan
  are written against the verified count (5). Recommend the implementer run one more
  repo-wide sweep (including `agents/*.md` prose references and any files outside the ones
  read here) before deleting, in case the original "7" count included exports elsewhere that
  this refinement's read budget did not cover — do not delete a symbol solely because it is
  named similarly without confirming zero call sites at implementation time.

- **`hooks-installer.js` path corrected.** The originating note assumed
  `src/hooks/hooks-installer.js`; the file actually lives at `src/lib/hooks-installer.js`
  (`src/hooks/` contains only the runtime hook scripts like `human-gate-check.js` and
  `post-commit.js`, not the installer). The broken-path bug itself is confirmed exactly as
  described — `installPostCommitHook()` builds `agentHookPath` pointing at
  `<root>/hooks/post-commit.js`, which does not exist; the real file is at
  `src/hooks/post-commit.js`.

- **Legacy one-keystroke gate crossings may already be unreachable via the live 5-area TUI —
  removal recommended regardless.** `src/tabs/functional.js` and `src/tabs/review.js` are
  still `require()`d by `menu.js` (for `renderAssignConfirm`/`renderRejectInput`), but their
  `handleKey`/`executeAction` functions are dispatched only via
  `tabModules[currentTab.id].handleKey(...)`, and `tabModules` is keyed solely by the 5 area
  ids (`pipeline`, `inbox`, `agent`, `library`, `system` — never `functional` or `review`).
  This suggests the one-keystroke `approvePlan()` bypass may already be unreachable from the
  live interactive TUI. Recommending deletion proceed regardless of reachability: if it is
  truly unreachable, deleting it is pure dead-code cleanup (still in scope per B1-style
  reasoning); if some other path does reach it (e.g. a future re-wiring, or a code path this
  refinement's read budget did not find), it is a live, un-gated Gate-3 bypass and must be
  removed on security grounds. The acceptance criteria (L7/L8, above) are written to hold in
  either case — "no code path calls `approvePlan()` without validation first" — rather than
  asserting a specific reachability claim.


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
