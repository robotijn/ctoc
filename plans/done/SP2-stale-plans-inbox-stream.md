---
approved_by: human
approved_at: 2026-06-30T13:58:36.647Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-06-30T12:18:02.766Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-06-30T11:41:19.938Z
gate_crossed: functional → implementation
---

---
title: "SP2 — Possibly-stale plans Inbox stream"
created: "2026-06-15T00:00:00Z"
priority: MEDIUM
type: feature
parent_vision: automated-stale-plan-detection
program: ctoc-pipeline-hygiene
order: 2
depends_on: [SP1-cheap-stale-flag-on-menu-open]
files:
  - src/lib/inbox.js
  - src/lib/menu-screens.js
  - src/commands/menu.md
  - tests/inbox-stale-stream.test.js
status: refined
acceptance_criteria_count: 6
risk_level: LOW
---

# SP2 — Possibly-stale plans Inbox stream

## 1. ASSESS — Problem Understanding

### Business Context

SP1 produces a candidate list, but producing it is silent — no user-visible surface exists yet. The locked design routes this through the existing Inbox surface (a new stream alongside questions/decisions/gatesWaiting) rather than a new slash command, honoring the 3-slash-command rule.

The surface the user actually interacts with is the slash-command JSON path: `/ctoc:menu` → `src/commands/menu.js` → `src/lib/menu-screens.js`. `buildDashboardTable()` in `menu-screens.js` already renders the INBOX block (lines 144–155) from `getInboxCounts(root)`, showing three counts (`questions`, `decisions`, `gatesWaiting`) plus a "Inbox clear" fallback. `dashboardPipeline()` drives the AskUserQuestion options (Business / Implementation / Execution / More ▶) the user selects from. SP2 adds a fourth count (`staleCandidates`) to the INBOX block and a conditional drill-in screen reachable via a ride-along second question on the dashboard.

### Current State

`getInboxCounts(root)` in `src/lib/inbox.js` (line 194) returns `{ questions, decisions, gatesWaiting }`, memoized via the `memoize()` utility from `src/lib/cache.js` with a 5-second TTL. `buildDashboardTable()` in `src/lib/menu-screens.js` consumes this return value and renders the INBOX block; the block currently never mentions stale plans. `dashboardPipeline()` returns four fixed navigation options; no stale-specific question exists.

`src/lib/menu-screens.js` is confirmed present and exports `buildDashboardTable`, `dashboardPipeline`, `stageBrowse`, `route`, and others. The `route()` function dispatches command strings (e.g. `browse functional`, `plan functional/foo.md`, `section business`) to their screen functions. SP2 adds a new route `inbox stale` → `inboxStalePlansDrillIn()`.

SP1 is shipped (`plans/done/SP1-cheap-stale-flag-on-menu-open.md`). `src/lib/stale-detector.js` is a live module exporting `scanCheapCandidates(root, { nowMs } = {})` → `{ candidates: Array<{plan, stage, signals, actionable}>, count }`. Signals are exactly `('missing-files'|'advisory:age')`. `actionable ⇔ signals.includes('missing-files')`. No `marker-in-source-stage` signal exists or will ever exist in the cheap pass.

There is no stale-candidates stream; the INBOX block has no concept of candidates requiring deeper verification.

The TTY app-loop (`src/areas/inbox.js`) is a separate code path reached only via the raw Enter-key TUI mode. Its `handleKey` is currently a no-op (`return false`). This path is NOT what the user reaches via `/ctoc:menu` and is OUT OF SCOPE for SP2 under the Option-A human decision.

### Impact

Without a visible count the user never knows stale candidates exist. The dashboard INBOX block remains incomplete — the gatesWaiting count may overcount because stranded plans sit in gate-source stages. Surfacing a `staleCandidates` count in the INBOX block gives the user the first signal to act, and the drill-in screen provides enough detail to decide whether to trigger the SP3 in-process verification.

## 2. ALIGN — Business Alignment

### Business Goals

1. Extend `getInboxCounts()` to include `staleCandidates: N` derived from SP1's `scanCheapCandidates()`, using the same memoization pattern so the hot-path cost is at most one extra scan per 5-second cache window.
2. Render the `staleCandidates` count in the INBOX block of `buildDashboardTable()` in `src/lib/menu-screens.js`, conditionally showing a line "N possibly-stale plans" when the count is non-zero, hidden when zero. NOTE: the hiding-at-zero is an INTENTIONAL design choice SPECIFIC to the possibly-stale line — it is NOT mirroring the sibling streams. In `buildDashboardTable`, the `questions`/`decisions`/`gatesWaiting` lines always print (including their `0` values) whenever `inboxTotal > 0`; only the possibly-stale line hides at `0`, because the cheap, unverified stale signal should not occupy a permanent zero-row that implies a standing chore before SP3 verification has run.
3. Provide a drill-in screen produced by a new `inboxStalePlansDrillIn()` function in `src/lib/menu-screens.js`, reachable via a ride-along second question attached to `dashboardPipeline()`'s `ask.questions` ONLY when `staleCandidates > 0`. That second question (header `'Stale plans'`, prompt `'N possibly-stale plans detected — view them?'`) presents exactly two options: `'View stale plans'` and `'Not now'`. In `actions`, `'View stale plans'` maps to route `inbox stale`; `'Not now'` maps to `''` (no-op). The first (pipeline-section) question keeps its four options (Business / Implementation / Execution / More ▶) unchanged. Navigation to the drill-in is always by label text, never by number (menu discipline Rule 1 and Rule 9).
4. Keep the Inbox surface READ-ONLY at this layer — no writes, no moves, no gate crossings.

### Success Metrics

- **M1:** `getInboxCounts(root)` returns an object containing `staleCandidates: N` for some integer N >= 0; existing keys (`questions`, `decisions`, `gatesWaiting`) are unchanged in value and type.
- **M2:** When `staleCandidates > 0`, `buildDashboardTable()` renders a line "N possibly-stale plans" in the INBOX block; `dashboardPipeline()` attaches a ride-along second question to `ask.questions` with header `'Stale plans'`, prompt `'N possibly-stale plans detected — view them?'`, and options `['View stale plans', 'Not now']`; `'View stale plans'` maps via `actions` to route `inbox stale`; `'Not now'` maps to `''`. No numeric key in `actions` on any screen maps to a stale-plans route (menu discipline: numbers open plans, never navigation targets). **The drill-in is genuinely reachable end-to-end:** the menu driver doc (`src/commands/menu.md`) carries an explicit stale-first precedence rule (new Rule 10, §6.3) so that when the user picks `'View stale plans'` the driver navigates to `inbox stale` instead of silently following the always-present pipeline-section answer. Without that rule the count would render but the human could never reach the drill-in — the F1 reachability bug ("green but does nothing the human sees").
- **M3:** When `staleCandidates === 0`, no "possibly-stale" line appears in the INBOX block and no ride-along stale question is attached to `dashboardPipeline()`'s `ask.questions`. (The line's absence at `0` is an intentional design choice specific to the possibly-stale line — it does NOT mirror the sibling `questions`/`decisions`/`gatesWaiting` lines, which DO print their zero values whenever `inboxTotal > 0`.)
- **M4:** The `inboxStalePlansDrillIn()` screen lists each candidate's plan slug, stage, signals array, and advisory/actionable label; it performs no file operation. A `◀ Back` option returns the user to the dashboard pipeline view. The screen is genuinely reachable: `route('inbox stale')` dispatches to it AND the `menu.md` Rule 10 precedence guarantees the `'View stale plans'` answer actually triggers that route (end-to-end reachability, not a wired-but-dead screen).
- **M5:** No new slash command is introduced; the stale stream lives entirely within the `menu-screens.js` JSON path, reachable through the existing menu navigation.
- **M6:** SP1 is a hard dependency that is already shipped. SP2 does NOT stub `stale-detector.js`. Unit tests for SP2 mock `scanCheapCandidates` at the module boundary (injected or mocked) but do not ship a placeholder stub that returns empty results.

### Stakeholders

- CTOC user on the dashboard (sees and can act on the stale count)
- SP3 (receives the verify trigger from the drill-in affordance)
- SP5 (regression suite asserts the count is present and correct)

### Constraints

- `getInboxCounts()` must remain memoized with the existing `memoize()` wrapper from `src/lib/cache.js` — do not re-wrap or bypass it.
- Inbox surface is READ-ONLY. No `createQuestion()`, `createDecision()`, or plan-move calls at this layer.
- No new slash command (3-slash-command rule). Navigation through the existing `menu-screens.js` JSON path only.
- The "verify" entry point inside the drill-in is affordance text only, handing off to SP3; SP2 does not implement verification itself.
- Numbers are reserved EXCLUSIVELY for opening a plan (menu discipline Rule 1 and Rule 9). The ride-along stale question uses only label-string options (`'View stale plans'` / `'Not now'`). No numeric key in `actions` on any screen maps to `inbox stale`.
- SP1 is a hard dependency that is already shipped. Do NOT provide a stub `stale-detector.js`. Tests mock `scanCheapCandidates` at the boundary.
- The TTY app-loop `src/areas/inbox.js` handleKey is OUT OF SCOPE under Option A. SP2 makes no changes to `src/areas/inbox.js` and it is not in `files:`.

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** CTOC user opening the dashboard,
**I want** to see a "possibly-stale plans" count in the INBOX block alongside questions and decisions,
**so that** I know at a glance whether phantom backlog may have accumulated without having to manually audit plan files.

**As a** CTOC user drilling into the stale stream,
**I want** to see each candidate's name, stage, and signal list with advisory/actionable labels in a drill-in screen reached by answering the ride-along stale question on the dashboard,
**so that** I can decide whether to trigger the in-process verification step before committing to any cleanup.

### BDD Scenarios

- [ ] **Scenario: Stale count appears in getInboxCounts when candidates exist**
  Given `scanCheapCandidates(root)` returns `{ candidates: [{plan: 'foo', stage: 'functional', signals: ['missing-files'], actionable: true}], count: 1 }`
  When `getInboxCounts(root)` is called
  Then the returned object contains `staleCandidates: 1`
  And the existing keys `questions`, `decisions`, `gatesWaiting` retain their correct values

- [ ] **Scenario: Zero stale candidates hides the stream and omits the ride-along question**
  Given `scanCheapCandidates(root)` returns `{ candidates: [], count: 0 }`
  When `buildDashboardTable()` renders the INBOX block
  Then the output does NOT contain the text "possibly-stale"
  And `dashboardPipeline()` does NOT attach a ride-along stale question to `ask.questions`

- [ ] **Scenario: Non-zero stale count renders in INBOX block and attaches ride-along stale question**
  Given `getInboxCounts(root).staleCandidates` is 3
  When `buildDashboardTable()` renders the INBOX block
  Then the output contains "3 possibly-stale plans"
  And `dashboardPipeline()` returns `ask.questions` containing a second question with header `'Stale plans'` and options `['View stale plans', 'Not now']`
  And `'View stale plans'` maps via `actions` to the route command `inbox stale`
  And `'Not now'` maps via `actions` to `''`
  And no numeric key (e.g. `'1'`, `'2'`, `'3'`) in `dashboardPipeline()` `actions` maps to `inbox stale` or any stale-candidates route (menu discipline: numbers open plans only)

- [ ] **Scenario: Drill-in screen lists candidates with signal labels**
  Given 2 stale candidates: one with `{ plan: 'alpha', stage: 'functional', signals: ['missing-files'], actionable: true }` and one with `{ plan: 'beta', stage: 'review', signals: ['advisory:age'], actionable: false }`
  When the user answers `'View stale plans'` on the ride-along stale question (driver routes `inbox stale` → `inboxStalePlansDrillIn()`)
  Then the screen text lists both candidates with their plan slug, stage, and signals
  And the candidate with `actionable: true` is labeled "actionable"
  And the candidate with `actionable: false` is labeled "advisory"
  And a `◀ Back` option is present in `ask` and maps to `''` in `actions`
  And no file write or plan move is performed during this render

- [ ] **Scenario: Inbox surface performs no write operations**
  Given any stale candidates exist
  When the user navigates through the dashboard INBOX block and the stale drill-in screen
  Then no call is made to `createQuestion()`, `createDecision()`, `movePlan()`, or `fs.writeFileSync()`
  And the plan files in `plans/` are unchanged after navigation

- [ ] **Scenario: Number replies never trigger the stale drill-in (menu discipline)**
  Given `staleCandidates > 0` and `dashboardPipeline()` has been called
  When the `actions` object of `dashboardPipeline()` is inspected
  Then no key in `actions` that is a digit-only string (e.g. `'1'`, `'2'`, `'5'`) maps to `'inbox stale'` or any stale-candidates route
  And the only key in `actions` that routes to `'inbox stale'` is the label string `'View stale plans'`
  And an equivalent assertion holds for `inboxStalePlansDrillIn()` `actions`: no numeric key is present

### In Scope

- Extend `getInboxCounts()` in `src/lib/inbox.js` to include `staleCandidates` derived from `scanCheapCandidates(root)` (imported from `stale-detector.js`)
- Update `buildDashboardTable()` in `src/lib/menu-screens.js` to render the `staleCandidates` count conditionally in the INBOX block ("N possibly-stale plans" when N > 0, absent when N === 0)
- Update `dashboardPipeline()` in `src/lib/menu-screens.js` to conditionally attach a ride-along second question to `ask.questions` (when `staleCandidates > 0`) with header `'Stale plans'`, prompt `'N possibly-stale plans detected — view them?'`, options `['View stale plans', 'Not now']`; `'View stale plans'` mapped to route `inbox stale` in `actions`, `'Not now'` mapped to `''`
- New `inboxStalePlansDrillIn(projectPath)` screen function in `src/lib/menu-screens.js`, modeled on `stageBrowse`, returning `{text, ask, actions}`: candidates listed as text lines with slug/stage/signals/label; `◀ Back` as the only selectable option; "Verify (SP3)" as affordance text only
- New route `inbox stale` → `inboxStalePlansDrillIn()` added to `route()` in `src/lib/menu-screens.js`
- Edit `src/commands/menu.md` to add a new numbered driver Rule (Rule 10, sibling to Rule 8 / Rule 9): the stale-first navigation precedence rule that makes `'View stale plans'` → `inbox stale` take precedence over the always-present pipeline-section answer for the turn (`'Not now'` → `''` falls through). This is the F1 fix — without it the count renders but the drill-in is unreachable. Exact wording in §6.3.
- Zero-count hiding: no stale line in INBOX block and no ride-along stale question in `dashboardPipeline` when `staleCandidates === 0`
- Unit test `tests/inbox-stale-stream.test.js` with mocked `scanCheapCandidates`; SP1 module must exist (no stub). Includes a doc-contract test asserting `src/commands/menu.md` contains the stale-first precedence rule — the only guard against the dead-navigation silently regressing, since the rule is driver prose, not executable code.

### Out of Scope

- Actual in-process verification (SP3)
- Classification into categories (SP3)
- Any cleanup or plan movement (SP4)
- Modifying `src/tabs/overview.js` — the stale stream lives in the JSON menu path; the overview picks up the count change via `getInboxCounts()` which already renders inbox totals without a direct overview edit
- New slash command or new tab
- Stub `stale-detector.js` — SP1 is shipped; SP2 does not ship a placeholder
- The TTY app-loop `src/areas/inbox.js` handleKey — Option A places the stale surface exclusively in the `menu-screens.js` JSON path; `src/areas/inbox.js` is not modified and is not in `files:`

## Risks

### Technical Risks

- **Risk:** `getInboxCounts()` is wrapped with `memoize()` which captures the function reference at module load time. Adding `staleCandidates` requires importing `scanCheapCandidates` from `stale-detector.js` at the top of `inbox.js`.
  - Likelihood: LOW (SP1 is shipped in `plans/done/`; `src/lib/stale-detector.js` is a live module; no MODULE_NOT_FOUND risk)
  - Impact: LOW (real import resolves immediately; the only risk is a logic error in the inbox.js extension)
  - Mitigation: Import `scanCheapCandidates` at the top of `inbox.js` with a JSDoc `@param` comment pinning the expected return shape. Unit tests for SP2 mock `scanCheapCandidates` at the module boundary.

### Business Risks

- **Risk:** The stale count inflates the visible Inbox signal, making the dashboard look busier than it is when advisory (age-only) candidates are included.
  - Likelihood: MEDIUM (any plan older than 14 days with all files present will appear as advisory)
  - Impact: LOW (advisory candidates are labeled distinctly in the drill-in; the count is prefixed "possibly-stale" to set correct expectations)
  - Mitigation: Ensure `buildDashboardTable` renders "N possibly-stale" (not "N stale") and that `inboxStalePlansDrillIn` distinguishes advisory from actionable with visible labels on every candidate row.

### Dependency Risks

- **Risk:** SP1's `scanCheapCandidates` return shape could change if SP1 is patched after SP2 integration.
  - Likelihood: LOW (shape is locked in SP1's shipped plan: `{ candidates: Array<{plan, stage, signals, actionable}>, count }`)
  - Impact: LOW (SP2 unit tests mock the call; real integration breaks are caught at PR time)
  - Mitigation: Pin the expected shape in a JSDoc `@param` comment in `inbox.js` and assert the shape in `tests/inbox-stale-stream.test.js`.

## Priority

**Priority: MEDIUM** (Score: 5/9)
- Dependency: MEDIUM (2) — depends on SP1 (shipped); SP3 depends on this; no sibling parallelism possible
- Business Impact: MEDIUM (2) — makes the feature visible to the user; without it SP1 has no surface
- Technical Risk: LOW (1) — extending an existing memoized function and two screen functions in `menu-screens.js` is low-risk; SP1 is already shipped and the import is live

---

## 5. PLAN — Technical Approach (Iron Loop Step 5)

### 5.1 Verified ground truth (read against live code, not prose)

| Fact | Source (file:line) | Consequence for SP2 |
|---|---|---|
| `scanCheapCandidates(root, { nowMs } = {})` → `{ candidates: Array<{plan,stage,signals,actionable}>, count }` | `src/lib/stale-detector.js:273`, `:355` | inbox.js consumes `.count` (hot path) and `.candidates` (drill-in). Both via one boundary symbol. |
| Signals are exactly `'missing-files'` \| `'advisory:age'`; `actionable === signals.includes('missing-files')` | `src/lib/stale-detector.js:336–348` | Drill-in label = `actionable ? 'actionable' : 'advisory'`. No `marker-in-source-stage` anywhere. |
| `getInboxCounts = memoize(getInboxCountsImpl, 'getInboxCounts')`, 5 s TTL, keyed `getInboxCounts::<root>` | `src/lib/inbox.js:194–200`, `src/lib/cache.js:34–51` | Add `staleCandidates` INSIDE the memoized impl ⇒ ≤1 extra scan per cache window (Business Goal 1). Tests bust with `invalidate('getInboxCounts')` + distinct roots. |
| `cache.invalidate('getInboxCounts')` clears by key prefix | `src/lib/cache.js:57–67` | Test seam for memoize. |
| `buildDashboardTable()` already calls `getInboxCounts(root)` and renders the INBOX block (3 lines or "Inbox clear") | `src/lib/menu-screens.js:144–155` | Add a conditional 4th line; fold `staleCandidates` into `inboxTotal` so "Inbox clear" stays truthful. |
| `dashboardPipeline()` does NOT currently call `getInboxCounts`; returns a single Pipeline question with 4 options | `src/lib/menu-screens.js:182–225` | Must call `getInboxCounts(root)` (memoized → cache hit after buildDashboardTable) and conditionally push the ride-along. |
| `route()` is a `switch (cmd)`; splitArgs turns `"inbox stale"` → `['inbox','stale']` | `src/lib/menu-screens.js:819–883`, `src/commands/menu.js:296–298` | Add `case 'inbox':` dispatching `args[1] === 'stale'`. |
| Env ride-along is attached by the DRIVER in `menu.js main()` via `attachEnvironmentQuestion(result)` (pushes question, `Object.assign`s actions) AFTER `route()` | `src/commands/menu.js:20–44`, `:321–325` | Stale ride-along is attached EARLIER, inside `dashboardPipeline()`. Final `ask.questions` order = `[Pipeline, Stale?, Environment?]`. |
| AskUserQuestion cap: ≤4 questions, ≤4 options each | `tests/menu-environment.test.js:66–72` (pinned contract) | Pipeline(4 opts) + Stale(2 opts) + Env(4 opts) = 3 questions ≤ 4. Holds. |
| `src/areas/inbox.js` reads only `questions/decisions/gatesWaiting` | `src/areas/inbox.js:16,28–30` | Additive `staleCandidates` key is non-breaking; this file stays untouched (out of scope). |

### 5.2 Dependency graph (files SP2 touches)

```
stale-detector.js  (SHIPPED, frozen — NOT in files:)
        ▲  scanCheapCandidates(root) → {candidates,count}
        │  (late-bound namespace call — mock seam)
   inbox.js  (MODIFY) ── exports getInboxCounts(+staleCandidates), listStaleCandidates
        ▲
        │  require('./inbox')  (already wired at menu-screens.js:21)
   menu-screens.js  (MODIFY) ── buildDashboardTable, dashboardPipeline,
        ▲                        inboxStalePlansDrillIn (NEW), route('inbox stale')
        │  require('../src/lib/menu-screens') + require('../src/lib/inbox')
        │  + rewire require('../src/lib/stale-detector')   ← boundary mock
   tests/inbox-stale-stream.test.js  (CREATE)
```

No cycles. Dependency direction stays inward (`menu-screens → inbox → stale-detector`). `menu-screens.js` gains NO new dependency on `stale-detector.js` — the stale dependency is localized in `inbox.js` (the inbox surface module), and `menu-screens.js` reaches candidates only through `inbox.listStaleCandidates`. `src/commands/menu.md` is a fourth touched file but it is driver DOCUMENTATION (the stale-first precedence Rule 10), not a code module — it sits outside the require graph and introduces no cycle.

### 5.3 Implementation order (dependency order; TDD test-first is Step 8, not here)

1. `src/lib/inbox.js` — namespace-import `stale-detector`, add `staleCandidates` to memoized counts, add `listStaleCandidates()`, export it. (No dependency on the other changes.)
2. `src/lib/menu-screens.js` — import `listStaleCandidates`; extend `buildDashboardTable` + `dashboardPipeline`; add `inboxStalePlansDrillIn`; add `route` case; export the new screen. (Depends on step 1.)
3. `src/commands/menu.md` — add the stale-first precedence driver Rule (Rule 10, sibling to Rule 8/Rule 9). Independent of the code, but it is what makes the `actions` contract from step 2 actually reachable (F1 fix).
4. `tests/inbox-stale-stream.test.js` — exercises the code via the rewired boundary AND asserts the menu.md doc-contract rule. (Depends on steps 1–3.)

### 5.4 Per-file change list (summary; signatures in §6)

| File | Action | Change |
|---|---|---|
| `src/lib/inbox.js` | MODIFY | (a) `const staleDetector = require('./stale-detector');` (namespace, late-bound). (b) `getInboxCountsImpl` returns extra key `staleCandidates: staleDetector.scanCheapCandidates(root).count`. (c) new `listStaleCandidates(root)` → `staleDetector.scanCheapCandidates(root).candidates`. (d) export `listStaleCandidates`. |
| `src/lib/menu-screens.js` | MODIFY | (a) import `listStaleCandidates` from `./inbox`. (b) `buildDashboardTable`: conditional "N possibly-stale plans" line + fold into `inboxTotal`. (c) `dashboardPipeline`: read `getInboxCounts(root).staleCandidates`; when `>0` push ride-along Stale question + actions. (d) new `inboxStalePlansDrillIn(projectPath)`. (e) `route`: `case 'inbox'` → `inboxStalePlansDrillIn`. (f) export `inboxStalePlansDrillIn`. |
| `src/commands/menu.md` | MODIFY | Add driver Rule 10 (stale-first navigation precedence), sibling to Rule 8/Rule 9. Makes `'View stale plans'` → `inbox stale` win over the pipeline-section answer for the turn; `'Not now'` falls through. F1 fix — exact wording in §6.3. |
| `tests/inbox-stale-stream.test.js` | CREATE | Boundary-mock `scanCheapCandidates`; assert behavior of (b)–(e) above; assert the menu.md doc-contract (stale-first precedence rule present). |

Out of scope and untouched: `src/areas/inbox.js`, `src/commands/menu.js`, `src/tabs/overview.js`, `src/lib/stale-detector.js`. `src/commands/menu.md` IS now in scope (Option-A reachability fix — it owns the stale-first precedence Rule 10; this adds a driver rule, NOT a new slash command). No new files beyond the one test file.

---

## 6. DESIGN — Detailed Blueprint (Iron Loop Step 6)

### 6.1 `src/lib/inbox.js`

**Imports (top, after line 19 `const { memoize } = require('./cache');`)**
```js
// SP1 cheap stale-plan scan. Imported as a NAMESPACE (not destructured) so the
// call site is late-bound: SP2 tests rewire staleDetector.scanCheapCandidates on
// the live module object at the require boundary. A destructured import would
// capture the function reference at load time and defeat that seam.
// Contract (frozen in SP1): scanCheapCandidates(root, { nowMs }?) =>
//   { candidates: Array<{plan:string, stage:'functional'|'implementation'|'review',
//     signals:Array<'missing-files'|'advisory:age'>, actionable:boolean}>, count:number }
const staleDetector = require('./stale-detector');
```

**`listStaleCandidates(root)` (new; place after `listPlansAtGates`, before `getInboxCounts`)**
```js
/**
 * SP2: the full possibly-stale candidate list for the drill-in screen (cold path).
 * NOT memoized — the drill-in is reached only by explicit navigation, so a single
 * fresh scan there is acceptable; the hot dashboard path uses getInboxCounts.count.
 * @param {string} root
 * @returns {Array<{plan:string, stage:string, signals:string[], actionable:boolean}>}
 */
function listStaleCandidates(root) {
  return staleDetector.scanCheapCandidates(root).candidates;
}
```

**`getInboxCountsImpl` (modify lines 194–200) — additive key only**
```js
const getInboxCounts = memoize(function getInboxCountsImpl(root) {
  return {
    questions: listQuestions(root).length,
    decisions: listDecisions(root).length,
    gatesWaiting: listPlansAtGates(root).length,
    // SP2: cheap stale count. One scan per memoize window (5 s TTL) ⇒ Goal 1.
    staleCandidates: staleDetector.scanCheapCandidates(root).count,
  };
}, 'getInboxCounts');
```
Existing keys keep their exact values/types (M1). `staleCandidates` is appended last.

**Exports (modify lines 202–209)** — add `listStaleCandidates` to `module.exports`.

### 6.2 `src/lib/menu-screens.js`

**Import (modify line 21)**
```js
const { getInboxCounts, listStaleCandidates } = require('./inbox');
```

**`buildDashboardTable` INBOX block (modify lines 144–155)**
```js
// Inbox (A3 — async-overnight surface; SP2 adds the possibly-stale stream)
const inbox = getInboxCounts(root);
const stale = inbox.staleCandidates || 0;
const inboxTotal = inbox.questions + inbox.decisions + inbox.gatesWaiting + stale;
out += `INBOX\n`;
if (inboxTotal === 0) {
  out += `  ○ Inbox clear — no async items waiting\n`;
} else {
  out += `  ⊙ ${inbox.questions} morning question${inbox.questions === 1 ? '' : 's'}\n`;
  out += `  ⊙ ${inbox.decisions} decision${inbox.decisions === 1 ? '' : 's'} awaiting review\n`;
  out += `  ⊙ ${inbox.gatesWaiting} plan${inbox.gatesWaiting === 1 ? '' : 's'} at gates\n`;
  // SP2: conditional — present iff > 0 (M2), absent when 0 (M3). "possibly-stale"
  // (not "stale") sets correct expectations: cheap detection is unverified (SP3).
  if (stale > 0) {
    out += `  ⊙ ${stale} possibly-stale plan${stale === 1 ? '' : 's'}\n`;
  }
}
out += '\n';
```
The string `possibly-stale` appears in output ONLY when `stale > 0` — that exact substring is the M2/M3 test probe.

**`dashboardPipeline` ride-along (modify lines 182–225)** — keep the 4 pipeline options and base actions unchanged; build `questions`/`actions` mutably, then conditionally append:
```js
const stale = (getInboxCounts(root).staleCandidates) || 0; // memoized → cache hit after buildDashboardTable

const questions = [{
  question: 'Select a section to drill into:',
  header: 'Pipeline',
  options,                       // Business / Implementation / Execution / More ▶ (unchanged, 4 opts)
}];
const actions = {
  'Business': 'section business',
  'Implementation': 'section implementation',
  'Execution': 'section execution',
  'More ▶': 'menu commands',
};

// SP2 ride-along: a SECOND question, only when there is something to show (M3).
if (stale > 0) {
  questions.push({
    question: `${stale} possibly-stale plan${stale === 1 ? '' : 's'} detected — view them?`,
    header: 'Stale plans',
    options: [
      { label: 'View stale plans', description: `Inspect the ${stale} possibly-stale plan${stale === 1 ? '' : 's'} (read-only)` },
      { label: 'Not now', description: 'Dismiss for this menu turn' },
    ],
  });
  actions['View stale plans'] = 'inbox stale'; // label key only — NEVER a digit
  actions['Not now'] = '';                      // no-op (driver falls through to pipeline answer)
}

return { text, ask: { questions }, actions };
```
Invariants this enforces: `ask.questions.length === 1` when `stale === 0`, `=== 2` when `stale > 0`; the ONLY key routing to `inbox stale` is the label `'View stale plans'`; no digit-only key exists in `actions` (M2, M3, Scenario 6).

**`inboxStalePlansDrillIn(projectPath)` (new; model on `stageBrowse`, place after `sectionBrowse`)**
```js
/**
 * SP2 drill-in: read-only list of possibly-stale candidates. No file op, no plan
 * move, no inputMode. The only selectable option is ◀ Back. "Verify (SP3)" is
 * affordance TEXT only — SP3 wires the verification.
 * @param {string} [projectPath]
 * @returns {{text:string, ask:Object, actions:Object}}
 */
function inboxStalePlansDrillIn(projectPath) {
  const root = getProjectPath(projectPath);
  const candidates = listStaleCandidates(root); // cold path; one fresh scan

  let text = `Inbox ▸ Possibly-stale plans (${candidates.length})\n`;
  text += `${'─'.repeat(40)}\n\n`;
  if (candidates.length === 0) {
    text += '  No possibly-stale plans.\n';
  } else {
    // Bullet rows, NOT "1." — numbers are reserved for opening a plan (Rule 1/9).
    // This screen opens nothing, so it shows no numbers and exposes no numeric key.
    for (const cand of candidates) {
      const label = cand.actionable ? 'actionable' : 'advisory';
      text += `  • ${cand.plan}  [${cand.stage}]  signals: ${cand.signals.join(', ')}  — ${label}\n`;
    }
    text += '\n  Verify with SP3 verification (coming soon) before any cleanup.\n';
  }
  text += '\n\n\n';

  return {
    text,
    ask: {
      questions: [{
        question: 'Possibly-stale plans (read-only).',
        header: 'Stale plans',
        options: [{ label: '◀ Back', description: 'Return to dashboard' }],
      }],
    },
    actions: { '◀ Back': '' },
  };
}
```
Per-candidate row carries slug, stage, `signals.join(', ')`, and the `actionable`/`advisory` word (M4, Scenario 4). `actions` has exactly one key, the non-numeric label `'◀ Back' → ''` (Scenario 6 drill-in clause).

**`route` dispatch (add a case in the `switch` at lines 826–882)**
```js
case 'inbox':
  if (args[1] === 'stale') return inboxStalePlansDrillIn(projectPath);
  return dashboardPipeline(projectPath); // unknown inbox subcommand → safe default
```
Two-word command `inbox stale` (per the existing Decision) leaves room for future `inbox {sub}` routes without collision (M5: reachable through existing menu navigation, no new slash command).

**Exports (modify lines 885–905)** — add `inboxStalePlansDrillIn` to the renderer block.

### 6.3 `src/commands/menu.md` — stale-first precedence Rule (OWNED; F1 fix)

The menu has NO answer-consuming driver code: answer→navigation is the model executing `/ctoc:menu` while following `src/commands/menu.md`. Rule 8 already handles the environment ride-along (resolve the env side-effect, then follow the pipeline answer). SP2's ride-along Stale question returns a COMPETING navigation (`'View stale plans'` → `inbox stale`); with no precedence rule the driver routes to the always-present pipeline-section answer and silently drops the stale navigation — the count renders but the human can NEVER reach `inboxStalePlansDrillIn` (F1, CRITICAL — "green but does nothing the human sees"). Option A makes SP2 own the fix end-to-end by adding a new numbered driver Rule. This is why `src/commands/menu.md` is in this plan's `files:`.

**Exact edit — add Rule 10 to `src/commands/menu.md`**, immediately after Rule 9 (the reasoning-depth rule) and before the trailing "CTOC ships exactly three slash commands" line. Do NOT renumber Rules 1–9. Match the existing Rule voice (cf. Rule 8). Insert verbatim:

> 10. **Stale-plans question rides along, navigates with precedence:** when `dashboardPipeline()` attaches a second **'Stale plans'** question (only when `staleCandidates > 0`), present it in the same AskUserQuestion call as the Pipeline question (and the Environment question if Rule 8 is also active). Resolve the answers in this order: first apply any environment side-effect (Rule 8 — `claude:set-environment {env}`); then, if the **Stale plans** answer maps via `actions` to `inbox stale` (the `'View stale plans'` option), navigate there — **it takes precedence over the pipeline-section answer for this turn** (the pipeline section is one keystroke away on return). If the answer is `'Not now'` (→ `''`) or the Stale plans question was absent, fall through to the pipeline-section answer (`section {x}` / `menu commands`). Precedence is explicit because the Pipeline question is always first and always non-empty, so a naive "first non-empty action wins" would never reach the stale drill-in. Numbers still open plans only (Rule 1) — the stale route is reached only by the label `'View stale plans'`, never a digit.

**Driver protocol this rule encodes** (sequence for the no-args dashboard):
1. `menu.js main()` → `route([], root)` → `dashboardPipeline(root)` returns `ask.questions = [Pipeline]` or `[Pipeline, Stale plans]` (when `staleCandidates > 0`), with merged `actions`.
2. `menu.js main()` then, iff `needsEnvironmentPrompt(root)`, calls `attachEnvironmentQuestion(result)` → pushes `Environment` (3rd question) + merges its actions (`src/commands/menu.js:323–325`).
3. Final `ask.questions` order: `[Pipeline, Stale plans?, Environment?]`. All presented in ONE AskUserQuestion call. One answer comes back per question.
4. The driver resolves the answers per Rule 10 (a direct generalization of Rule 8):
   - **Side-effects first.** If an Environment answer is present and maps to `claude:set-environment {env}`, run it (persist). `claude:env-decide-later` ⇒ no-op. (Existing Rule 8 behavior, unchanged.)
   - **Navigation, stale-first precedence.** Look up the Stale answer's action: if it is non-empty (`'inbox stale'`, from `'View stale plans'`) → navigate there (`route(['inbox','stale'])` → `inboxStalePlansDrillIn`). If it is `''` (`'Not now'`) or the Stale question was absent → fall through to the Pipeline answer's action (`section {x}` / `menu commands`).

**Why precedence is an explicit rule, not inferable from order:** the Pipeline question is always first and always non-empty, so a naive "first non-empty action wins" would never reach the stale drill-in. The user picking `'View stale plans'` is an explicit request that must win for this turn (the pipeline section is one keystroke away on return). The `''` value of `'Not now'` is the existing "no-op / fall through" sentinel used everywhere in the codebase (`◀ Back`, `◀ Pipeline`, etc.), so the fall-through half needs no new semantics.

**Second `menu.md` edit — close the pre-existing env action-table seam (Gate-2 LOW finding):** the `claude:set-environment {env}` action entry in `src/commands/menu.md` (currently ~line 53) ends "…then continue with the user's pipeline-section choice (or re-open the dashboard if none)." That sentence predates Rule 10 and names only the pipeline branch. Append a clause so a careful model does not mis-resolve when a Stale answer is also present: after "pipeline-section choice", add "— **or, when a 'Stale plans' answer maps to `inbox stale`, navigate there first per Rule 10 (stale-first precedence)**". This keeps the env action entry and Rule 10 in agreement; the side-effect (env persist) still runs first, only the post-persist navigation target defers to Rule 10. No behavior change beyond making the existing entry consistent with the new rule.

**Composition with env (≤4 questions):** Pipeline(4 opts) + Stale plans(2 opts) + Environment(4 opts) = 3 questions, each ≤4 options — within the AskUserQuestion ceiling pinned by `tests/menu-environment.test.js:66–72`. Side-effect (env persist) and navigation (stale vs pipeline) are orthogonal, so all three compose without conflict.

**Guarding the rule (it is prose, not code):** Rule 10 is driver prose the model follows; no executable code path enforces it. The ONLY automated guard against the dead-navigation silently regressing is the doc-contract test (§6.4) asserting the rule's presence in `menu.md`. That test is what lets F1 be caught by the suite.

### 6.4 Test strategy — `tests/inbox-stale-stream.test.js`

**Boundary mock (chosen seam — documented).** Rewire `scanCheapCandidates` on the LIVE `stale-detector` module object (a require-cache-level stub of the real module's export), NOT a placeholder stub file (M6). This works because `inbox.js` calls `staleDetector.scanCheapCandidates(...)` late-bound (§6.1). Restore the original in `afterEach` so the rewire never leaks (and Node runs each `tests/*.test.js` in its own process, giving file-level isolation as a second guard).

```js
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const staleDetector = require('../src/lib/stale-detector');   // real module — rewired, not stubbed
const { invalidate } = require('../src/lib/cache');
const { getInboxCounts, listStaleCandidates } = require('../src/lib/inbox');
const { buildDashboardTable, dashboardPipeline, inboxStalePlansDrillIn, route } = require('../src/lib/menu-screens');

const realScan = staleDetector.scanCheapCandidates;       // capture once
let root, calls, wroteCount, realWrite;

function tempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-sp2-')); // cross-platform sandbox
  for (const s of ['functional', 'implementation', 'review', 'todo', 'in-progress', 'done']) {
    fs.mkdirSync(path.join(dir, 'plans', s), { recursive: true });
  }
  fs.mkdirSync(path.join(dir, '.ctoc', 'inbox', 'questions'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ctoc', 'inbox', 'decisions'), { recursive: true });
  return dir;
}
function mockScan(result) {                                 // records args → asserts the seam contract
  staleDetector.scanCheapCandidates = (r, opts) => { calls.push({ r, opts }); return result; };
}

beforeEach(() => {
  root = tempProject();
  calls = [];
  invalidate('getInboxCounts');                            // bust memoize before each test
  // read-only spy: count real writes during render paths
  wroteCount = 0; realWrite = fs.writeFileSync;
  fs.writeFileSync = (...a) => { wroteCount++; return realWrite(...a); };
});
afterEach(() => {
  staleDetector.scanCheapCandidates = realScan;            // restore boundary
  fs.writeFileSync = realWrite;                            // restore spy
  invalidate('getInboxCounts');
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});
```

Each test calls `mockScan({...})` with a distinct root (unique `mkdtempSync`) so the memoize never returns a foreign value; `invalidate` is belt-and-suspenders.

**Behavioral assertions (fail-loud, no always-green, no order dependence):**

- M1 / Scenario 1 — `mockScan({candidates:[{plan:'foo',stage:'functional',signals:['missing-files'],actionable:true}],count:1})`; `getInboxCounts(root)` ⇒ `staleCandidates === 1` (typeof number); `questions/decisions/gatesWaiting` still `0` and unchanged in type. Also assert `calls[0].r === root` (boundary receives the project root).
- M1 boundary contract — assert `typeof realScan === 'function'` and `staleDetector.scanCheapCandidates !== realScan` while mocked (proves we rewired the REAL module, not a stub) and `=== realScan` after `afterEach` semantics (restore covered by the harness; assert within a follow-up render test). (M6.)
- M2 / Scenario 3 — `mockScan(count:3)`; `buildDashboardTable(root)` text `.includes('3 possibly-stale plans')`; `dashboardPipeline(root).ask.questions.length === 2`; `questions[1].header === 'Stale plans'`; option labels deep-equal `['View stale plans','Not now']`; `actions['View stale plans'] === 'inbox stale'`; `actions['Not now'] === ''`.
- M3 / Scenario 2 — `mockScan({candidates:[],count:0})`; `buildDashboardTable(root)` text does NOT include `'possibly-stale'`; `dashboardPipeline(root).ask.questions.length === 1`; `!('View stale plans' in actions)`.
- M4 / Scenario 4 — `mockScan` two candidates: `{plan:'alpha',stage:'functional',signals:['missing-files'],actionable:true}` and `{plan:'beta',stage:'review',signals:['advisory:age'],actionable:false}`; `inboxStalePlansDrillIn(root).text` includes `alpha`, `functional`, `missing-files`, `actionable` AND `beta`, `review`, `advisory:age`, `advisory`; `actions` deep-equals `{ '◀ Back': '' }`; assert `wroteCount === 0` across the render (read-only).
- M5 — `route(['inbox','stale'], root)` returns the same shape as `inboxStalePlansDrillIn(root)` (header `'Stale plans'`, `◀ Back` only) ⇒ reachable through the menu router, no slash command added. Also `route(['inbox','bogus'], root)` falls back to the dashboard (header `'Pipeline'`).
- Scenario 5 (read-only across the candidate-render path) — **F5 scoping:** the write-spy is scoped to the candidate-render functions, NOT the whole dashboard render. `buildDashboardTable()` and `dashboardPipeline()` also call `getPlanCounts()`/`getAgentStatus()`, which can legitimately write during stale-LOCK cleanup (an unrelated subsystem); asserting `0` writes across them would be a false guard that could fail for reasons unrelated to SP2. Instead, with candidates present, snapshot `wroteCount`, then call `inboxStalePlansDrillIn(root)` and `route(['inbox','stale'], root)` (the pure candidate-render path — `getProjectPath` + `listStaleCandidates` → mocked scan, no plan-counts/agent-status), and assert the DELTA is `0`. The SP2 contributions inside `buildDashboardTable`/`dashboardPipeline` are read-only by construction (a mocked-count read + string concatenation) and ship no `createQuestion`/`createDecision`/`movePlan`/`writeFileSync` call. `movePlan`/`createQuestion`/`createDecision` all funnel through `fs.writeFileSync`, so the scoped spy still covers them on the candidate-render path it guards.
- Scenario 6 (menu discipline, both screens) — for `dashboardPipeline(root)` (stale>0) and `inboxStalePlansDrillIn(root)`: `Object.keys(actions).filter(k => /^\d+$/.test(k))` is empty; the only key whose value === `'inbox stale'` is `'View stale plans'` (dashboard) and the drill-in has no `'inbox stale'`-valued key.
- Pluralization edge — `mockScan(count:1)` ⇒ buildDashboardTable includes `'1 possibly-stale plan'` (singular, no trailing `s`) and the ride-along prompt reads `1 possibly-stale plan detected — view them?`.
- **Doc-contract (F1 reachability guard)** — read the REAL `src/commands/menu.md` (no mock) and assert the stale-first precedence Rule is present AND co-located in one rule. This is the only automated guard against the dead-navigation (F1) silently regressing, because the rule is driver prose, not executable code:
  ```js
  it('menu.md documents the stale-first precedence rule (F1 reachability guard)', () => {
    const mdPath = path.join(__dirname, '..', 'src', 'commands', 'menu.md');
    const md = fs.readFileSync(mdPath, 'utf8');
    assert.match(md, /Stale plans/, 'menu.md must name the Stale plans ride-along question');
    assert.match(md, /inbox stale/, 'menu.md must name the inbox stale route');
    assert.match(md, /precedence|takes precedence|wins/i, 'menu.md must state precedence semantics');
    // Co-location: a ±700-char window around the precedence keyword must ALSO contain
    // both "Stale plans" and "inbox stale" — proving these belong to ONE rule, not
    // three scattered mentions that could each survive a regression independently.
    const m = /precedence|takes precedence|wins/i.exec(md);
    const window = md.slice(Math.max(0, m.index - 700), m.index + 700);
    assert.ok(/Stale plans/.test(window) && /inbox stale/.test(window),
      'the stale-first precedence rule must mention "Stale plans" and "inbox stale" together');
  });
  ```
  Fails loud if Rule 10 is deleted, reworded away from the precedence semantics, or decoupled from the route name. (No `scanCheapCandidates` mock involved — this assertion is independent of the boundary seam.)

All assertions read concrete return values (count integer, exact substrings, exact action mappings, `wroteCount`), never structure-only truthiness — they fail loud if behavior drifts. No test depends on another's state (unique root + restore + invalidate). `os.tmpdir()` + `path.join` keep sandboxes cross-platform.

### 6.5 Acceptance-criteria → implementation → test matrix

| Criterion / Scenario | Implementation element | Test(s) |
|---|---|---|
| M1 | `getInboxCountsImpl` adds `staleCandidates: scanCheapCandidates(root).count`; existing keys intact | M1 test + boundary-arg assertion |
| M2 | `buildDashboardTable` stale line; `dashboardPipeline` ride-along question + `actions['View stale plans']='inbox stale'`, `['Not now']=''` | M2/Scenario 3 test |
| M3 | `if (stale > 0)` guards both the line and the ride-along | M3/Scenario 2 test |
| M4 | `inboxStalePlansDrillIn` candidate rows + `actionable/advisory` label + `◀ Back → ''`, no write | M4/Scenario 4 test (+ `wroteCount===0`) |
| M5 | `route` `case 'inbox'` → `inboxStalePlansDrillIn`; no slash command | M5 test (route dispatch + fallback) |
| M6 | namespace import + late-bound call enabling boundary rewire; no stub file | M6 test (real module rewired) + the test file itself |
| Scenario 1 | `staleCandidates` value from mock count | M1 test |
| Scenario 2 | zero-hiding (line + question) | M3 test |
| Scenario 3 | non-zero line + ride-along + mappings | M2 test |
| Scenario 4 | drill-in content + labels + `◀ Back` + no write | M4 test |
| Scenario 5 | read-only render path | Scenario 5 test (`wroteCount===0`) |
| Scenario 6 | no digit-only `actions` key on either screen; only `'View stale plans'` routes to `inbox stale` | Scenario 6 test |
| F1 / reachability (drill-in reachable end-to-end) | `menu.md` Rule 10 stale-first precedence (§6.3) so `'View stale plans'` beats the always-present pipeline answer; backed by `route('inbox stale')` dispatch | Doc-contract test (menu.md contains the precedence rule) + M5 route test |

### 6.6 Cross-platform & contract conformance

- Sandboxes via `os.tmpdir()` + `fs.mkdtempSync`; all paths via `path.join`. No hardcoded separators in new code (the screens add none — they only read candidate objects).
- New screens honor the menu return contract `{ text, ask, actions }`; `text` ends with `\n\n\n` (matches `tests/menu-screens.test.js:58`). No `inputMode` on the drill-in (it opens no plan).
- Additive `staleCandidates` key preserves all existing `getInboxCounts` consumers (`menu-screens.buildDashboardTable`, `src/areas/inbox.js`) and existing tests (`tests/inbox.test.js`, `tests/menu-environment.test.js`, `tests/menu-screens.test.js`) — their temp projects have no stale candidates (fresh mtime, no plans), so the real `scanCheapCandidates` returns `count:0`: no stale line, no ride-along, question counts unchanged. No regression.

## Required downstream changes (SP3)

SP2 deliberately leaves two items for SP3 to fix WHEN SP3 IS PLANNED (they are SP3's scope, not SP2's — flagged here only as a breadcrumb so they are not lost). The adversarial Gate-2 review raised them as F2/F3 against SP3:

- **SP3 must add `src/lib/menu-screens.js` to its own `files:`** to wire the drill-in "Verify" action onto SP2's `inboxStalePlansDrillIn()` screen. SP2 ships "Verify with SP3 verification" as affordance TEXT only; SP3 turns it into a wired action and therefore must hold write access to `menu-screens.js`.
- **SP3 must purge `marker-in-source-stage`** — that signal does not exist in the cheap pass (SP1 emits only `missing-files` | `advisory:age`); SP3 still references the dead `marker-in-source-stage` and must drop every reference to it.

SP2 does NOT touch either item here — it edits only the four files in its own `files:`.

## Decisions Taken Under Ambiguity

- **Stream key name:** `staleCandidates` (count key) / "possibly-stale plans" (UI label). "Possibly" communicates that cheap detection is unverified, setting correct expectations before SP3 verification runs.

- **Empty-state hiding (intentional, line-specific — NOT sibling-consistency):** when count is 0 the possibly-stale line is omitted from the `buildDashboardTable` INBOX block and no ride-along stale question is attached to `dashboardPipeline`. This hiding is an INTENTIONAL design choice SPECIFIC to the possibly-stale line, NOT a mirror of the sibling streams. In `buildDashboardTable` the `questions`/`decisions`/`gatesWaiting` lines all print (including their `0` values) whenever `inboxTotal > 0` — they do NOT hide at zero. The possibly-stale line hides at `0` on purpose: the cheap, unverified stale signal should not occupy a permanent zero-row implying a standing chore before SP3 verification has even run. (The earlier rationale citing `src/areas/inbox.js`'s zero-omission was a different code path and is withdrawn — the relevant surface here is `buildDashboardTable`, where the siblings do not hide.)

- **Option-A rework (human decision, 2026-06-30):** the stale-plans count and drill-in live in the slash-command JSON path (`menu-screens.js`) and NOT in the TTY Enter-key model. The original SP2 design placed the view-mode state machine and key handler in `src/areas/inbox.js` activating on Enter. That design addressed the TTY path (`src/commands/menu.js` → `setupKeyboard` → `src/areas/*`), which is not what the user reaches via `/ctoc:menu`. Under Option A: (1) the count renders in `buildDashboardTable` INBOX block; (2) `dashboardPipeline` conditionally attaches a ride-along second question to `ask.questions` when `staleCandidates > 0`, following the env-prompt precedent (Rule 8); (3) a new `inboxStalePlansDrillIn()` screen in `menu-screens.js` handles the drill-in. `src/areas/inbox.js` is OUT OF SCOPE and is not in `files:`.

- **Dropped TTY model:** the previous "Drill-in key: Enter on a highlighted stale-candidates row (non-colliding with 1-5)" decision is replaced entirely by the ride-along question in the JSON path. The previous Scenario 6 asserting "area-switch keys 1-5 not consumed by stale drill-in handler" is obsolete in the JSON path (there is no key handler). Scenario 6 now asserts the menu discipline positive: no numeric key in `actions` maps to the stale route on any screen.

- **Drill-in navigation label:** the ride-along stale question uses `'View stale plans'` as the affirmative option (maps to route `inbox stale`) and `'Not now'` as the dismissal (maps to `''`). The question header `'Stale plans'` follows the breadcrumb style of existing screens (`'◀ Pipeline'`, `'◀ Back'`). The phrase `'Inbox ▸ Stale plans'` is retired as a navigation label; it does not appear in `actions`. The menu driver routes the affirmative answer case-insensitively per the existing protocol.

- **New route command:** `inbox stale` → `inboxStalePlansDrillIn(projectPath)`. Added to `route()` in `menu-screens.js`: `case 'inbox': if (args[1] === 'stale') return inboxStalePlansDrillIn(projectPath); ...`. Choosing a two-word command (not a new single keyword) avoids collisions with any future `inbox {sub}` routes SP3 may need.

- **Drill-in screen pattern:** `inboxStalePlansDrillIn()` modeled on `stageBrowse` — returns `{text, ask, actions}`. Candidates are listed as text lines (plan slug, stage, signals, actionable/advisory label). The only selectable option is `◀ Back` (mapped to `''`, returning to dashboard). "Verify with SP3 verification" appears as affordance text in the body, not as a wired action (SP3 implements the logic). No `inputMode: 'plan-select'` is used since this is a read-only information screen, not a plan-open surface.

- **Ride-along second question:** when `staleCandidates > 0`, `dashboardPipeline()` appends a second question object to `ask.questions` — header `'Stale plans'`, prompt `'N possibly-stale plans detected — view them?'`, options `['View stale plans', 'Not now']` — and maps `'View stale plans'` → `'inbox stale'` and `'Not now'` → `''` in `actions`. When `staleCandidates === 0`, no stale question is appended; `ask.questions` has only the pipeline-section question. The driver handles both answers: if the stale answer is `'View stale plans'`, route to `inbox stale` → `inboxStalePlansDrillIn()`; otherwise follow the pipeline-section answer. This keeps the dashboard uncluttered and prevents a dead-end navigation path when there is nothing to show.

- **AskUserQuestion 4-option-per-question cap and env-ride-along precedent:** `src/lib/menu-screens.js` lines 193–207 confirm AskUserQuestion caps at 4 options PER QUESTION (not 4 questions total). `dashboardPipeline()` already occupies all four option slots (Business / Implementation / Execution / More ▶), so adding a fifth option on the first question would breach the cap. The fix follows the env-prompt precedent: `src/commands/menu.md` Rule 8 shows that when the environment is unset, `menu.js` attaches the environment question as a second question in `ask.questions`; the driver presents all questions in one AskUserQuestion call. SP2 applies the same pattern for the stale question. AskUserQuestion allows up to 4 questions total; with both the env ride-along and stale ride-along active, `ask.questions` holds at most 3 questions (pipeline + env + stale), which is within the 4-question ceiling.

- **Memoization:** `staleCandidates` participates in the same `getInboxCounts` memoized call (5-second TTL), not a separate cache entry, so menu navigation does not re-scan within a cache window.

- **No stub for SP1:** SP1 is shipped. No placeholder stub is provided. Tests mock `scanCheapCandidates` at the boundary via dependency injection. A stub that silently returns empty would be a no-stub rule violation and would mask integration failures.

- **Signals contract:** every example and scenario uses only `missing-files` and `advisory:age`. The signal `marker-in-source-stage` does not exist and must never appear in any SP2 code, test, or scenario. `actionable: true` ⇔ `signals.includes('missing-files')`; `advisory:age` alone ⇔ `actionable: false`.

- **`menu-screens.js` in `files:`:** confirmed necessary. SP2 modifies `buildDashboardTable` (INBOX block count line), `dashboardPipeline` (conditional ride-along stale question), and `route()` (new `inbox stale` dispatch), and adds `inboxStalePlansDrillIn()`. All four changes are in this one file; the enforcement hook must cover it.

- **`src/areas/inbox.js` NOT in `files:`:** the TTY path is out of scope under Option A. SP2 must not touch this file. Removing it from `files:` ensures the enforcement hook does not grant write access to it for this plan.

### Added during Step 5/6 (PLAN/DESIGN)

- **Namespace import as the mock seam (test-strategy choice):** `inbox.js` imports `const staleDetector = require('./stale-detector')` (namespace, late-bound) rather than destructuring `const { scanCheapCandidates }`. A destructured import captures the function reference at module-load time, which would make a require-cache rewire ineffective and force the heavier "delete inbox from cache + re-require" dance. The namespace + late-bound call (`staleDetector.scanCheapCandidates(...)`) lets the test rewire the export on the live module object — the documented seam satisfying the task's "dependency injection OR require-cache stub — pick one and document." This does NOT change `getInboxCounts`'s public signature.

- **`getInboxCounts` uses `.count`, the drill-in uses `.candidates` (no second hot-path scan):** the memoized counts impl reads only `scanCheapCandidates(root).count` (one scan per 5 s window — Business Goal 1). The drill-in calls a separate, unmemoized `listStaleCandidates(root)` for `.candidates`. The drill-in is a cold path (reached only by explicit navigation), so one fresh scan there is acceptable and keeps `getInboxCounts` returning a count-only object (M1 contract). `listStaleCandidates` lives in `inbox.js` so `menu-screens.js` gains no new dependency on `stale-detector.js`.

- **Bullet rows, not numbered rows, in the drill-in:** candidate rows render with `•`, never `1.`/`2.`. Numbers are reserved EXCLUSIVELY for opening a plan (menu Rule 1/9); the drill-in opens nothing, so showing numbers would falsely imply numeric selection and the drill-in exposes no numeric `actions` key. Bullets keep the screen honest and make Scenario 6 trivially true.

- **`inboxTotal` includes `staleCandidates` so "Inbox clear" stays truthful:** `buildDashboardTable` folds `stale` into `inboxTotal`. If the only async signal is stale candidates, the block must NOT print "Inbox clear". The stale line itself remains guarded by `if (stale > 0)` so M3's zero-hiding holds independently of the other three streams.

- **Stale-first navigation precedence is an explicit driver rule — OWNED by SP2 (Option A, human decision 2026-06-30):** when the user answers both the Pipeline question and the ride-along Stale question, `'View stale plans'` (→ `inbox stale`) takes precedence over the pipeline-section navigation for that turn; `'Not now'` (→ `''`) falls through to the pipeline answer. This precedence cannot be derived from question order (Pipeline is first and always non-empty), so it is a genuine new driver semantic — and because the menu has no answer-consuming driver code (the model follows `menu.md`), the only place it can live is `menu.md` itself. The adversarial Gate-2 review found (F1, CRITICAL) that without this rule the count renders but the human can NEVER reach `inboxStalePlansDrillIn` — "green but does nothing the human sees." The human chose Option A: **SP2 owns the fix end-to-end.** `src/commands/menu.md` is therefore IN this plan's `files:`, and SP2 adds the precedence rule as a new numbered driver Rule (Rule 10, sibling to Rule 8 / Rule 9 — exact wording in §6.3). Because the rule is driver prose, not executable code, SP2 also ships a doc-contract test (§6.4) asserting the rule's presence in `menu.md` — the only automated guard against the dead-navigation silently regressing. This SUPERSEDES the previous recommendation to defer the menu.md edit to SP3; the reachability fix is no longer an out-of-scope follow-up but an owned SP2 deliverable.

- **Driver protocol is not unit-tested (correctly):** the driver is the model reading the JSON, not code SP2 ships. Tests assert the JSON contract only — `ask.questions` shape, option labels, `actions` mappings, absence of numeric keys, `wroteCount === 0`. The stale-first precedence is design prose, deliberately outside the unit-test surface.

- **Read-only verification via an `fs.writeFileSync` spy (F5 — scoped to the candidate-render path):** Scenario 5 asserts the candidate-render path performs no writes by counting `fs.writeFileSync` calls (rewired in `beforeEach`, restored in `afterEach`). The spy is scoped to the candidate-render functions — `inboxStalePlansDrillIn(root)` and `route(['inbox','stale'], root)` — measured as a `wroteCount` DELTA, rather than asserting `0` across the whole dashboard render. Rationale (F5, adversarial review): `buildDashboardTable()` and `dashboardPipeline()` also call `getPlanCounts()`/`getAgentStatus()`, which can legitimately write during stale-LOCK cleanup (an unrelated subsystem), so a whole-render `0` assertion would be a false guard that could fail for reasons unrelated to SP2. The SP2 contributions inside `buildDashboardTable`/`dashboardPipeline` are read-only by construction (a mocked-count read + string concatenation) and ship no write call. `movePlan`/`createQuestion`/`createDecision` all funnel through `fs.writeFileSync`, so the scoped spy still covers them on the candidate-render path it guards.

- **Memoize busting in tests:** because `getInboxCounts` is memoized (5 s TTL, keyed by root), tests use a UNIQUE `mkdtempSync` root per test AND call `cache.invalidate('getInboxCounts')` in `beforeEach`/`afterEach`. Unique roots make cross-test bleed impossible; `invalidate` is the explicit belt-and-suspenders. Node's per-file process isolation (`node --test tests/*.test.js`) prevents the `scanCheapCandidates` rewire from leaking to other test files; the `afterEach` restore prevents leaks within this file.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing) — 14 tests, 4 pass / 10 fail (RED confirmed)

### Step 9: PREPARE
- [x] Install dependencies if needed — none (Node built-in test runner)
- [x] Check prerequisites — SP1 stale-detector.js shipped & live; cache.invalidate seam present
- [x] Verify dev environment ready
- [x] Create directories/config if needed — temp sandboxes via os.tmpdir/mkdtempSync

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling — unknown `inbox` subcommand falls back to dashboard
- [x] Wire up integration points — route case, ride-along question, menu.md Rule 10

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together — full suite green
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations — count via memoized getInboxCounts (cache hit), drill-in single cold scan
- [x] Optimize critical paths — no second hot-path scan
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — only passes root to hardened scanCheapCandidates
- [x] Sanitize outputs — read-only string concatenation
- [x] No secrets in code
- [x] Safe file operations — render/drill-in path is read-only (write-spy delta === 0)

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green) — 2468 pass / 0 fail
- [x] Check coverage >= 80% — all SP2-changed lines exercised, both branches each
- [x] 0 skipped, 0 flaky tests — 0 skipped

### Step 15: DOCUMENT
- [x] Update relevant documentation — menu.md Rule 10 + env action-entry clause
- [x] Add JSDoc comments to new functions — listStaleCandidates, inboxStalePlansDrillIn; scanCheapCandidates shape pinned in inbox.js import comment
- [x] Update CHANGELOG if needed — n/a (no CHANGELOG entry required for this slice)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review
