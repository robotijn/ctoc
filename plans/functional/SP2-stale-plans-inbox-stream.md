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
  - src/areas/inbox.js
  - tests/inbox-stale-stream.test.js
status: refined
acceptance_criteria_count: 5
risk_level: LOW
---

# SP2 — Possibly-stale plans Inbox stream

## 1. ASSESS — Problem Understanding

### Business Context

SP1 produces a candidate list, but producing it is silent — no user-visible surface exists yet. The locked design routes this through the existing Inbox surface (a new stream alongside questions/decisions/gatesWaiting) rather than a new slash command, honoring the 3-slash-command rule. The Inbox in `src/areas/inbox.js` currently renders three counts from `getInboxCounts()` in `src/lib/inbox.js`: `questions`, `decisions`, `gatesWaiting`. SP2 adds a fourth count: `staleCandidates`.

### Current State

`getInboxCounts(root)` in `src/lib/inbox.js` (line 194) returns `{ questions, decisions, gatesWaiting }`. The memoized wrapper uses the `cache.js` `memoize()` utility with a 5-second TTL. `src/areas/inbox.js` renders the three counts in a fixed layout (lines 28-31) and lists details below. There is no stale-candidates stream; the Inbox has no concept of candidates requiring deeper verification.

### Impact

Without a visible count the user never knows stale candidates exist. The dashboard remains inaccurate — the gatesWaiting count may overcount because stranded plans sit in gate-source stages. Surfacing a `staleCandidates` count gives the user the first signal to act, and the drill-in list provides enough detail to decide whether to trigger the SP3 scout.

## 2. ALIGN — Business Alignment

### Business Goals

1. Extend `getInboxCounts()` to include `staleCandidates: N` derived from SP1's `scanCheapCandidates()`, using the same memoization pattern so the hot-path cost is at most one extra scan per 5-second cache window.
2. Render the count and a drill-in affordance in the Inbox area without introducing a new slash command or a new tab.
3. Keep the Inbox surface READ-ONLY at this layer — no writes, no moves, no gate crossings.

### Success Metrics

- **M1:** `getInboxCounts(root)` returns an object containing `staleCandidates: N` for some integer N >= 0; existing keys (`questions`, `decisions`, `gatesWaiting`) are unchanged in value and type.
- **M2:** When `staleCandidates > 0`, the Inbox area renders a line "N possibly-stale plans" with a drill-in affordance using a menu number consistent with the existing numbered-menu pattern.
- **M3:** When `staleCandidates === 0`, no stale-candidates line appears in the Inbox render (zero-count streams are hidden, consistent with current behavior for empty questions/decisions).
- **M4:** The drill-in view lists each candidate's plan name, stage, signals array, and advisory/actionable label; it does not perform any file operation.
- **M5:** No new slash command is introduced; the stale stream lives entirely within the Inbox area reachable through the existing menu navigation.

### Stakeholders

- CTOC user on the dashboard (sees and can act on the stale count)
- SP3 (receives the verify trigger from the drill-in affordance)
- SP5 (regression suite asserts the count is present and correct)

### Constraints

- `getInboxCounts()` must remain memoized with the existing `memoize()` wrapper from `src/lib/cache.js` — do not re-wrap or bypass it.
- Inbox surface is READ-ONLY. No `createQuestion()`, `createDecision()`, or plan-move calls at this layer.
- No new slash command (3-slash-command rule). Navigation through existing numbered menus only.
- The "verify" entry point inside drill-in is a menu affordance that hands off to SP3; SP2 does not implement verification itself.

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** CTOC user opening the dashboard,
**I want** to see a "possibly-stale plans" count in the Inbox alongside questions and decisions,
**so that** I know at a glance whether phantom backlog may have accumulated without having to manually audit plan files.

**As a** CTOC user drilling into the stale stream,
**I want** to see each candidate's name, stage, and signal list with advisory/actionable labels,
**so that** I can decide whether to trigger the scout verification step before committing to any cleanup.

### BDD Scenarios

- [ ] **Scenario: Stale count appears in getInboxCounts when candidates exist**
  Given `scanCheapCandidates(root)` returns `{ candidates: [{plan: 'foo', stage: 'review', signals: ['marker-in-source-stage'], actionable: true}], count: 1 }`
  When `getInboxCounts(root)` is called
  Then the returned object contains `staleCandidates: 1`
  And the existing keys `questions`, `decisions`, `gatesWaiting` retain their correct values

- [ ] **Scenario: Zero stale candidates hides the stream from the Inbox render**
  Given `scanCheapCandidates(root)` returns `{ candidates: [], count: 0 }`
  When the Inbox area renders
  Then the output does NOT contain the text "possibly-stale"
  And the numbered menu does NOT include a stale-candidates entry

- [ ] **Scenario: Non-zero stale count renders with numbered menu entry**
  Given `getInboxCounts(root).staleCandidates` is 3
  When the Inbox area renders
  Then the output contains "3 possibly-stale plans"
  And a numbered menu item (e.g. [1]) is present to drill in
  And a [0] back option is present per menu rules

- [ ] **Scenario: Drill-in lists candidates with signal labels**
  Given 2 stale candidates: one actionable (marker-in-source-stage), one advisory (age only)
  When the user selects the drill-in menu item
  Then each candidate is listed with its plan name, stage, and signals
  And the actionable candidate is labeled "actionable"
  And the advisory-only candidate is labeled "advisory"
  And no file write or plan move is performed during this render

- [ ] **Scenario: Inbox surface performs no write operations**
  Given any stale candidates exist
  When the user navigates through the Inbox area including the stale drill-in
  Then no call is made to `createQuestion()`, `createDecision()`, `movePlan()`, or `fs.writeFileSync()`
  And the plan files in `plans/` are unchanged after navigation

### In Scope

- Extend `getInboxCounts()` in `src/lib/inbox.js` to include `staleCandidates` derived from `scanCheapCandidates(root)` (imported from `stale-detector.js`)
- Update `src/areas/inbox.js` to render the `staleCandidates` count and drill-in view
- Zero-count hiding consistent with existing Inbox stream behavior
- Drill-in view: candidate list with plan, stage, signals, advisory/actionable label
- "Verify" menu affordance stub that hands off to SP3 (affordance text only at this stage)
- Unit test `tests/inbox-stale-stream.test.js` with mocked `scanCheapCandidates`

### Out of Scope

- Actual scout verification (SP3)
- Classification into categories (SP3)
- Any cleanup or plan movement (SP4)
- Modifying `src/tabs/overview.js` — the stale stream lives in the Inbox area, not the overview tab
- New slash command or new tab

## Risks

### Technical Risks

- **Risk:** `getInboxCounts()` is wrapped with `memoize()` which captures the function reference at module load time. Adding `staleCandidates` requires importing `stale-detector.js` inside the same module; if `stale-detector.js` is not yet available (SP1 not yet merged), tests will throw `MODULE_NOT_FOUND`.
  - Likelihood: LOW (SP1 is a hard dependency; integration only runs after SP1 lands)
  - Impact: MEDIUM (test suite failure until SP1 file exists)
  - Mitigation: Provide a stub `src/lib/stale-detector.js` exporting `scanCheapCandidates` that returns `{ candidates: [], count: 0 }` as a temporary placeholder during SP2 development; replace with real implementation when SP1 merges.

### Business Risks

- **Risk:** The stale count inflates the Inbox total, making the dashboard look busier than it is when advisory (age-only) candidates are included.
  - Likelihood: MEDIUM (any plan older than 14 days that happens to be valid-but-slow will appear)
  - Impact: LOW (advisory candidates are labeled distinctly in the drill-in; the count is prefixed "possibly-stale" to set expectations)
  - Mitigation: Ensure the Inbox summary line reads "N possibly-stale" (not "N stale") and that the drill-in distinguishes advisory from actionable with visible labels.

### Dependency Risks

- **Risk:** SP1's `scanCheapCandidates` return shape could change before SP2 integration.
  - Likelihood: LOW (shape is locked in SP1's plan)
  - Impact: LOW (SP2 tests mock the call; real integration breaks are caught at PR time)
  - Mitigation: Pin the expected shape in a JSDoc `@param` comment in `inbox.js` and assert the shape in the SP2 test.

## Priority

**Priority: MEDIUM** (Score: 5/9)
- Dependency: MEDIUM (2) — depends on SP1; SP3 depends on this; no sibling parallelism possible
- Business Impact: MEDIUM (2) — makes the feature visible to the user; without it SP1 has no surface
- Technical Risk: LOW (1) — extending an existing memoized function and a render module is low-risk

## Decisions Taken Under Ambiguity

- **Stream key name:** `staleCandidates` (count key) / "possibly-stale plans" (UI label). "Possibly" communicates that cheap detection is unverified, setting correct expectations before the scout runs.
- **Empty-state hiding:** when count is 0 the stream line is omitted from the Inbox render, consistent with how zero-count streams already behave in `src/areas/inbox.js`.
- **Drill-in placement:** reuse the Inbox drill-in pattern in `src/areas/inbox.js`; no new tab. The verify affordance appears only inside the drill-in, not on the main Inbox surface.
- **Memoization:** `staleCandidates` participates in the same `getInboxCounts` memoized call (5-second TTL), not a separate cache entry, so menu navigation does not re-scan.
