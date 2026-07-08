---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T10:44:31.419Z
gate_crossed: implementation → todo
---

---
title: "PI4-s4 — UI wiring (menu search shortcut, overview related panel, inbox surfacing)"
type: implementation
parent_plan: pi4-semantic-search-and-related-plans
depends_on: pi4-semantic-search-and-related-plans-s3-related-and-barrel
priority: HIGH
files:
  - "src/commands/menu.js"
  - "src/tabs/overview.js"
  - "src/areas/inbox.js"
  - "src/lib/inbox.js"
  - "tests/plan-index-search-ui.test.js"
---

# PI4-s4 — UI wiring (menu search shortcut, overview related panel, inbox surfacing)

> Slice 4 (final) of the PI4 decomposition. Wires the s3 public API
> (`require('src/lib/plan-index').search | related`) into the TUI: a "Search plans"
> keyboard shortcut in `menu.js`, a fail-open "Related Plans" panel in
> `overview.js`, and related-plans surfacing in the inbox area
> (`src/areas/inbox.js` + a helper in `src/lib/inbox.js`). This is ONE cohesive
> integration slice — every touch is an additive, fail-open render of the same
> retrieval API, and they share the parent's single Rollback story. Depends on s3
> (the barrel must expose `search`/`related` first).

## Scope (this slice only)

- **In:** additive edits to `menu.js` (one routing branch → search flow),
  `overview.js` (one "Related Plans" panel, fail-open like the existing
  `readIndexStatus`), `src/areas/inbox.js` (one related-plans block in `render`),
  `src/lib/inbox.js` (one helper that fetches related-plans for the inbox view), and
  a new UI-integration test `tests/plan-index-search-ui.test.js`.
- **Out:** the retrieval logic itself (s1/s2/s3 — done). This slice ONLY consumes
  the barrel API and renders; it adds NO new retrieval code.

## Real integration points (READ FRESH)

- **`src/commands/menu.js`** — `handleKey(str, key)` at line ~186; existing pattern:
  a single-char shortcut guarded by `app.mode` / active tab, e.g. the Settings
  shortcut `if (key.sequence === 's' && app.mode === 'list' && TABS[app.tabIndex].id
  === 'pipeline') { … }` (line ~208), and numeric area shortcuts (line ~217). The
  search shortcut follows this exact shape. `setupKeyboard(handleKey)` at ~312.
- **`src/tabs/overview.js`** — `render(app)` at line ~37; `app.projectPath ||
  process.cwd()`. Existing fail-open precedent `readIndexStatus(projectPath)`
  (lines ~21–33): a missing/corrupt file yields `null` → the status line is simply
  omitted, "must NEVER break the dashboard render". The Related Plans panel mirrors
  this precedent EXACTLY. Exports `{ render, handleKey, reset }` (line ~187).
- **`src/areas/inbox.js`** — `render(app)` at line ~13, `handleKey(_key,_app)` at
  ~60, exports `{ render, handleKey }`. Uses `renderFooter([...])`.
- **`src/lib/inbox.js`** — helper module; exports include `listQuestions`,
  `listDecisions`, `listPlansAtGates`, `listStaleCandidates` (line ~232). The new
  related-plans helper is added alongside these and exported additively.
- **The API:** `const planIndex = require('../lib/plan-index');` (from `menu.js`) /
  `require('../../lib/plan-index')` (from `src/areas/`) then `planIndex.search(...)` /
  `planIndex.related(...)`. `search`/`related` are **async** (Promise-returning).

## Implementation Details

### Architecture Decision

**ADR — fail-open, synchronous-render, async-fetch bridge.** The TUI `render(app)`
functions are synchronous string builders; `search`/`related` are async. Two options
were considered:

| Option | Pros | Cons | Decision |
|---|---|---|---|
| (A) `await` inside render | simplest call site | render is sync; cannot await; would require reworking the whole TUI loop | rejected |
| (B) fetch related-plans BEFORE render (in the key handler / a pre-render hook) and stash on `app`, render reads the cached array synchronously | render stays sync; matches `readIndexStatus`'s "read a value, omit if null" precedent; no TUI-loop rework | **chosen** |

So: the key handler (or the tab-activation path) calls `related()`/`search()`,
`await`s it, stores the result array on `app` (e.g. `app.relatedPlans`,
`app.searchResults`), and triggers a re-render; `render()` reads that array
synchronously and, if absent/empty, renders an "index building" / no-results state
(parent Scenario 7 UI indicator, driven by a zero-`store.size` check via the wiring).
Every consumer wraps the call in `try/catch` returning `[]` — a semantic-feature
failure NEVER breaks the menu (the load-bearing fail-open invariant; the
`readIndexStatus` precedent).

**ADR — zero-unit "index building" indicator.** The parent Scenario 7 requires the UI
show an "index building" state when the index has zero units, "rendered synchronously
from a zero-unit `store.size` check". The panel obtains `store.size` via
`require('../lib/plan-index').getWiring({projectPath}).store` (fail-open: null store →
treat as size 0 → show "index building"). No async needed for this indicator.

**ADR — DESIGN placement (Iron Loop Step 6 decision, per parent).** Exact panel
placement (overview: below the pipeline counts; inbox: below the gates list) is the
DESIGN call the parent defers to implementation. Chosen: overview panel renders
directly under the existing "Semantic index build status" line; inbox related block
renders under the existing content before `renderFooter`. Both are additive and
removable per the parent Rollback section.

### Dependency Graph

```
src/commands/menu.js  (MODIFY) ── require ──> src/lib/plan-index (barrel: search)
src/tabs/overview.js  (MODIFY) ── require ──> src/lib/plan-index (barrel: related, getWiring)
src/areas/inbox.js    (MODIFY) ── require ──> src/lib/inbox (new helper)
src/lib/inbox.js      (MODIFY) ── require ──> src/lib/plan-index (barrel: related)
tests/plan-index-search-ui.test.js (CREATE) ── tests all four wirings (mocked API)
```
Dependency direction respected: `commands`/`tabs`/`areas` → `lib` (inward). No `lib`
→ `hooks`/`commands`. Chain depth from s1: s1→s2→s3→s4 = 3 (== max 3 ✓, no deeper).

### File Specifications

#### File: `src/commands/menu.js`
**Action:** MODIFY (additive)
**Change Type:** modify-existing — one routing branch + one search-flow handler.
##### Changes
- **Add** a "Search plans" shortcut in `handleKey(str, key)` mirroring the Settings
  shortcut shape (guarded by `app.mode`/active tab so it never shadows text input),
  e.g. `if (key.sequence === '/' && app.mode === 'list') { enterSearchMode(app);
  return true; }`. (Sequence choice is a Step-6 DESIGN call; `/` is the conventional
  "search" key and does not collide with the existing `s` Settings shortcut.)
- **Add** a small `enterSearchMode(app)` / search-prompt handler that reads a query
  string, calls `await require('../lib/plan-index').search(query, { projectPath:
  app.projectPath })` inside `try/catch` (→ `[]` on error), stashes results on
  `app.searchResults`, and re-renders. No blocking; fail-open.
- **Do NOT** modify existing shortcuts, `setupKeyboard`, or tab routing.
##### Error Handling
- Barrel `search` could be `undefined` (fail-open getter) → guard `typeof
  planIndex.search === 'function'` before calling; if not, show "search unavailable"
  and return. Any thrown error → caught → empty results, never crashes the menu.

#### File: `src/tabs/overview.js`
**Action:** MODIFY (additive)
##### Changes
- **Add** a `renderRelatedPanel(app)` that reads `app.relatedPlans` (pre-fetched
  array; see the bridge ADR) and appends a "Related Plans" section; when the wiring's
  `store.size === 0` (or store null) render an "index building" indicator instead
  (Scenario 7). Mirror `readIndexStatus`'s fail-open exactly (missing/empty → omit or
  show building state; never throw).
- **Add** the pre-fetch: on overview activation / selected-plan change, `await
  require('../lib/plan-index').related(selectedPlanSlug, { projectPath })` in
  `try/catch` → stash `app.relatedPlans`. (If the tab has no "selected plan" concept
  yet, seed from the first implementation/todo plan; a Step-6 DESIGN detail.)
- **Update** `render(app)` to call `renderRelatedPanel(app)` after the index-status
  line. Keep `module.exports = { render, handleKey, reset }` unchanged in shape.
##### Error Handling
- Guard `typeof planIndex.related === 'function'`; `try/catch` around the fetch;
  null/empty `app.relatedPlans` → panel omitted or "no related plans"; store null →
  "index building". Never break `render`.

#### File: `src/lib/inbox.js`
**Action:** MODIFY (additive)
##### Changes
- **Add** `listRelatedForInbox(planSlug, root)` → `Promise<Array<...>>` that calls
  the barrel `related(planSlug, { projectPath: root })` inside `try/catch` → `[]` on
  error/undefined. Additive; existing exports (`listQuestions`, `listDecisions`,
  `listPlansAtGates`, `listStaleCandidates`, `createQuestion`, `createDecision`, …)
  unchanged. **Update** `module.exports` to include `listRelatedForInbox`.
##### Error Handling
- Fail-open (`[]`); guards `typeof related === 'function'`.

#### File: `src/areas/inbox.js`
**Action:** MODIFY (additive)
##### Changes
- **Add** a related-plans block in `render(app)` that reads a pre-fetched
  `app.inboxRelated` array (populated via `src/lib/inbox`'s `listRelatedForInbox`
  through the same async-fetch/sync-render bridge) and renders it before
  `renderFooter([...])`; empty/absent → omit. Exports `{ render, handleKey }`
  unchanged in shape.
##### Error Handling
- Absent/empty array → render nothing extra; never throw.

##### Cross-Platform Notes (all four files)
- Only `require('../lib/plan-index')` / `require('../lib/inbox')` and string building;
  `projectPath` already resolved by the app. No new `fs`/`path` beyond what these
  files already use (all via `path.join`/`safe-fs`). Platform-agnostic.

### Test Plan

#### Tests: `tests/plan-index-search-ui.test.js`
**Action:** CREATE
**Framework:** `node:test`
**Approach:** hermetic — inject/mock the barrel API (`search`/`related`/`getWiring`)
so the UI wiring is tested without a live index. Where a module hard-requires the
barrel, use a fixture project (temp dir with a real `openStore`) OR stub the barrel
via a thin injectable seam; the render functions are pure string builders given the
stashed `app.*` arrays, so most assertions run against `render(app)` output with
`app.relatedPlans` / `app.searchResults` / `app.inboxRelated` pre-populated.

##### Test Cases
1. **Overview renders Related Plans panel from stashed results:** `render({
   projectPath, relatedPlans: [{planPath:'a',score:0.9},{planPath:'b',score:0.8}] })`
   output contains a "Related Plans" heading and both plan ids in score order.
2. **Overview shows "index building" on zero-unit store:** with a wiring whose
   `store.size === 0` (or null store), `render` output contains the index-building
   indicator and NOT a stale related list (Scenario 7 UI).
3. **Overview fail-open — barrel `related` undefined:** `render` with no
   `app.relatedPlans` and `related` unavailable → panel omitted, no throw, rest of
   dashboard intact (the `readIndexStatus` precedent).
4. **menu search shortcut routes:** `handleKey` with the search key in list mode
   enters search flow (sets a search mode/flag on `app`) and returns truthy; a
   non-search key is unaffected; the existing `s` Settings shortcut still works
   (regression guard).
5. **menu search fail-open:** with barrel `search` throwing / undefined, entering
   search mode yields empty results + an "unavailable"/no-results state, no crash.
6. **inbox area renders related block from stash:** `src/areas/inbox` `render({
   inboxRelated: [...] })` includes the related entries before the footer; empty
   array → block omitted.
7. **`listRelatedForInbox` fail-open:** with a mocked `related` returning `[]` /
   throwing, `listRelatedForInbox` resolves to `[]`, never rejects.
8. **Regression — existing exports intact:** `overview` still exports `{render,
   handleKey,reset}`; `src/areas/inbox` still `{render,handleKey}`; `src/lib/inbox`
   still exports its pre-existing functions plus `listRelatedForInbox`.

##### Coverage Targets
- Line ≥ 80% on the NEW code paths (the panel/handler/helper additions). Fail-open
  branches (2,3,5,7) and the happy render (1,6) exercised. Existing-export
  regression (8) guards the additive contract.

### Security Review (this slice)
- **Input validation:** query string from the search prompt is passed only to
  `search()` (which type-checks it); it is never used as a path or shell arg. ✓
- **No path traversal / injection:** no new `fs` with user input; `projectPath` is
  the already-resolved app root; no `execSync`/shell. ✓
- **Fail-open everywhere:** every barrel call is `typeof`-guarded + `try/catch` → the
  TUI never crashes on a semantic-feature fault (the human-measure invariant). ✓
- **No secrets; error messages are fixed UI strings** (no path/stack leakage into the
  rendered dashboard). ✓
- **Prototype pollution:** results are rendered as strings; no untrusted-key object
  writes. ✓

### Acceptance Criteria Mapping
| Parent criterion | Implemented in | Test case |
|---|---|---|
| "Search plans" menu entry routes to search | `menu.js` shortcut + `enterSearchMode` | test 4/5 |
| Related-plans panel rendered (overview) | `overview.js renderRelatedPanel` | test 1 |
| Scenario 7 — UI shows "index building" on zero units | `overview.js` `store.size===0` check | test 2 |
| Related surfaced in inbox area | `areas/inbox.js` + `lib/inbox.js listRelatedForInbox` | test 6/7 |
| Fail-open — semantic fault never breaks the menu | `typeof`-guard + `try/catch` all four files | test 3/5/7 |

### Risk Mitigations (parent risks realized here)
| Parent risk | Mitigation | Where |
|---|---|---|
| "Related panel perceived layout shift / cold-index slowness" | pre-fetch + bounded `limit` (5); render reads a cached array synchronously | overview pre-fetch + `related` top-5 |
| "Vector source absent → degrade, not crash" | `try/catch`+`typeof` guards; degrade to omitted panel / BM25-only results surfaced by s2 | all four files |

## Execution Plan

### Step 8: TEST
Write `tests/plan-index-search-ui.test.js` covering all 8 groups, driving the render
functions with pre-stashed `app.*` arrays and mocked/undefined barrel API (RED — the
panels/handlers/helper do not exist yet).

### Step 9: PREPARE
Confirm slice s3 is built and `require('src/lib/plan-index').search`/`.related` are
functions (hard dependency). READ `menu.js` `handleKey`, `overview.js` `render` +
`readIndexStatus`, `src/areas/inbox.js` `render`, `src/lib/inbox.js` exports FRESH and
record exact insertion points + the current export objects to preserve.

### Step 10: IMPLEMENT
Additively edit the four files per the File Specifications: menu search shortcut +
handler; overview `renderRelatedPanel` + pre-fetch + `render` call; `src/lib/inbox`
`listRelatedForInbox` (+ export); `src/areas/inbox` related block. Every barrel call
`typeof`-guarded and `try/catch`-wrapped. No stubs; no changes to unrelated code.
Document the DESIGN calls (search key `/`, panel placement) in this plan's `##
Decisions Taken Under Ambiguity`.

### Step 11: REVIEW
Self-review: dependency direction (commands/tabs/areas → lib only); every edit
additive + fail-open; existing exports/shortcuts unchanged; matches each file's house
style; async isolated to the pre-fetch (render stays sync).

### Step 12: OPTIMIZE
Bounded `limit` (top-5 related) into the fetch; results cached on `app` so `render`
does no repeated work; no per-keystroke re-query beyond the search submit.

### Step 13: SECURE
Run the slice security checklist: guarded barrel calls, no user-string-as-path, fixed
UI error strings, no shell.

### Step 14: VERIFY
`node --test tests/plan-index-search-ui.test.js` → `# fail 0`. Then `node --test
tests/*.test.js` → 0 failures (proves the four additive UI edits broke NO existing
menu/overview/inbox test). Manual perceived-latency spot-check on a sample menu
session before Gate 3 (parent Business-Risk mitigation).

### Step 15: DOCUMENT
Brief comments at each insertion point (fail-open rationale, the async-fetch/sync-
render bridge) + JSDoc on `renderRelatedPanel`, `enterSearchMode`,
`listRelatedForInbox`.

### Step 16: FINAL-REVIEW
Confirm: 4 files edited additively + 1 test; all mapped parent criteria have a test;
fail-open guards on every barrel call; Scenario-7 "index building" indicator present;
existing exports/shortcuts intact; the parent Rollback section removes exactly these
four blocks.


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
