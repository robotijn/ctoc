---
approved_by: human
approved_at: 2026-07-13T20:53:25.052Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:43.717Z
gate_crossed: implementation → todo
---

---
title: "W10-s5 — Settings-screen keys dispatch through the real handler (M12)"
type: feature
parent_plan: "ctoc-audit-w10-menu-taskplane"
depends_on: none
files:
  - src/areas/system.js
  - tests/w10-settings-key-dispatch.test.js
priority: MEDIUM
---

# W10-s5 — Settings-screen keys dispatch through the real handler (M12)

**Parent:** `ctoc-audit-w10-menu-taskplane`. This is slice **(e)** — make the Settings
screen interactive by routing its keys to the handler that already implements them.
Independent (no `depends_on`).

Fixes finding **M12**: `handleKey()` in `src/commands/menu.js` (`:453-460`) delegates
unhandled keys to `tabModules[currentTab.id].handleKey(key, app)`. For the System area,
`tabModules.system = systemArea` (`menu.js:257`) — `src/areas/system.js` — whose
`handleKey` is `function handleKey(_key, _app) { return false; }` (`system.js:47-49`), a
hardcoded no-op. Meanwhile `src/tabs/tools.js:212-321` has a fully-implemented `handleKey`
(settings-tab nav, up/down through settings, Enter-to-toggle via `toggleSetting`,
escape/back) that is **dead code** — unreachable from the live menu. The render path is
NOT broken: `menu.js:326-330` special-cases `currentTab.id === 'system' && app.toolMode`
and calls `toolsTab.renderSettings(app)` directly, so the screen paints. Only key handling
is wired to the wrong module — every keystroke on the Settings screen (arrow nav, tab
switch, Enter-to-toggle, escape/back) is swallowed by `systemArea.handleKey`'s
`return false`.

## Implementation Details

### Architecture Decision (ADR)

**Context.** The correct-and-complete Settings/Doctor/Update key handler already exists in
`src/tabs/tools.js` (`handleKey`, `:212-321`), keyed on `app.toolMode` (`'1'` Doctor,
`'2'` Update, `'3'` Settings) and `app.settingsTabIndex`/`app.settingIndex`. The live menu
reaches these sub-modes by setting `app.toolMode` (e.g. the `s` shortcut at
`menu.js:416-423` sets `app.toolMode = '3'`). The render already delegates to `toolsTab`
for these modes; only the key side delegates to the inert `systemArea.handleKey`.

**Decision.** In `src/areas/system.js`, delegate to `toolsTab.handleKey(key, app)` when a
legacy tools sub-mode is active (`app.toolMode` truthy), and only then; otherwise keep the
current `return false` (the static System landing has no interactive keys of its own).
This is the minimal, surgical fix the parent identified: "route Settings-screen (and
Doctor/Update sub-mode) key handling to `toolsTab.handleKey` when `currentTab.id ===
'system' && app.toolMode` is set." `menu.js:457` already calls `systemArea.handleKey(key,
app)` for the system tab, so making `systemArea.handleKey` delegate is sufficient — no
`menu.js` change is needed.

**Why in `system.js`, not `menu.js`.** `menu.js`'s generic delegation
(`tabModule.handleKey(key, app)`) is correct as written; the bug is that the system tab's
module returns a hardcoded `false`. Fixing it at the module keeps the generic dispatcher
untouched and localizes the change to the one wrong function. `tools.js` needs NO change
(its handler is already correct) — it merely becomes reachable.

### Dependency Graph (this slice)
```
src/areas/system.js  (MODIFY handleKey → delegate to toolsTab when app.toolMode set)
  └─ requires → src/tabs/tools.js  (UNCHANGED handler, now reachable)
  └─ called-by → src/commands/menu.js:457  (UNCHANGED generic dispatch)
  └─ behavior-tested-by → tests/w10-settings-key-dispatch.test.js (NEW)
```
No cycles. No dependency on other W10 slices. `tools.js` is intentionally NOT in this
slice's `files:` — it has no logic change; it is exercised through `system.js`'s
delegation.

### File Specifications

#### `src/areas/system.js` — MODIFY
- Add the require at the top (near the existing `safeFs`/`path`/`tui` requires,
  `system.js:7-9`):
  `const toolsTab = require('../tabs/tools');`
- Replace the no-op `handleKey` (`system.js:47-49`):
  ```
  function handleKey(_key, _app) {
    return false;
  }
  ```
  with a delegating handler:
  ```
  /**
   * When a legacy tools sub-mode is active (Doctor '1' / Update '2' / Settings '3'),
   * the fully-implemented key handler lives in tabs/tools.js. Delegate so those keys
   * (arrow nav, tab switch, Enter-to-toggle, escape/back) actually dispatch (M12).
   * The static System landing (no sub-mode) has no interactive keys of its own.
   * @param {object} key   readline key object ({name, sequence, ctrl, …})
   * @param {object} app   menu app state
   * @returns {boolean}    true iff the key was consumed (menu.js re-renders)
   */
  function handleKey(key, app) {
    if (app && app.toolMode) {
      return toolsTab.handleKey(key, app);
    }
    return false;
  }
  ```
- The signature becomes `(key, app)` to match how `menu.js:457` calls it and how
  `toolsTab.handleKey(key, app)` expects its args. No other change to `system.js`
  (the `render` function is untouched — the screen already paints correctly).
- Do NOT modify `src/tabs/tools.js` (its `handleKey` is already correct) and do NOT modify
  `src/commands/menu.js` (its generic delegation is already correct).

### Test Plan

#### `tests/w10-settings-key-dispatch.test.js` — CREATE (`node:test`)
Imports `systemArea` from `../src/areas/system`. Every case is RED before this slice
(`systemArea.handleKey` returns `false` unconditionally) and GREEN after. Assertions check
BEHAVIOR — the app state actually changes and the toggle persists — not "handleKey
returned true".

1. **Settings navigation key dispatches (scenario 14, happy path).** Build an `app` with
   `toolMode: '3'`, `settingsTabIndex: 0`, `settingIndex: 0`, and a valid
   `projectPath`. Call `systemArea.handleKey({ name: 'down' }, app)` → returns `true` and
   `app.settingIndex` advanced from 0 to 1 (the keystroke is NOT swallowed). *(Seed enough
   settings in the selected category schema that `settingIndex` can advance; use the real
   `getCategorySchema` the tools handler reads.)*
2. **Static System landing still swallows nothing of its own (regression guard).** With
   `toolMode: null`, `systemArea.handleKey({ name: 'down' }, app)` → returns `false`
   (delegation only fires when a sub-mode is active — the landing has no keys).
3. **Settings toggle actually persists (scenario 15).** Seed a temp project with a
   `.ctoc/settings.yaml`; open an `app` with `toolMode: '3'` on a settings category whose
   selected setting is a `toggle` type. Read its current value. Call
   `systemArea.handleKey({ name: 'return' }, app)` → returns `true`; re-READ
   `.ctoc/settings.yaml` from disk and assert the toggle's value flipped and persisted
   (matches `toolsTab.handleKey`'s `toggleSetting(currentTab.id, setting.key,
   app.projectPath)` at `tools.js:311-314`). *(Read the file fresh from disk — do not
   trust an in-memory value — per the always-read-fresh principle.)*
4. **Escape/back exits the sub-mode.** With `toolMode: '3'`,
   `systemArea.handleKey({ name: 'escape' }, app)` → returns `true` and `app.toolMode`
   becomes `null` (delegated to the tools handler's escape branch, `tools.js:287-289`).
5. **Doctor/Update sub-modes also delegate (parent scope: "Doctor/Update sub-mode key
   handling").** With `toolMode: '2'`, a mapped Update key (e.g. `{ sequence: '1' }`,
   `tools.js:271`) → returns `true` (proves the delegation is not Settings-only).

### Security Review
- [x] **No new input surface:** delegation forwards the same readline `key` object
      `menu.js` already produces; `system.js` adds no parsing of untrusted data.
- [x] **Settings write path unchanged:** persistence goes through the existing
      `toggleSetting(...)` in `tools.js` (which writes only schema-known keys to
      `.ctoc/settings.yaml`); this slice does not touch that write, only reaches it.
- [x] **No gate impact:** Settings toggles tune CTOC behavior; per the settings schema no
      toggle may weaken a human gate (enforced elsewhere by `tests/environment-mode.test.js`)
      — this slice changes only key ROUTING, never which settings exist or their effects.
- [x] **Null-safety:** `handleKey` guards `app && app.toolMode` before delegating, so a
      malformed call returns `false` rather than throwing.

## Execution Plan

### Step 8: TEST
Write `tests/w10-settings-key-dispatch.test.js` FIRST (TDD red), asserting BEHAVIOR — "a
down-arrow on the open Settings screen advances `app.settingIndex`" and "Enter on a toggle
setting flips the persisted value in `.ctoc/settings.yaml`", NOT "handleKey returned
true". Cases 1–5 above. Run `node --test tests/w10-settings-key-dispatch.test.js` and
confirm RED against current `main` (`systemArea.handleKey` returns `false`, so
`settingIndex` never moves and nothing persists).

### Step 9: PREPARE
Re-read `src/tabs/tools.js:212-321` (the handler being delegated to — confirm it reads
`app.toolMode`, `app.settingsTabIndex`, `app.settingIndex`, `getCategorySchema`,
`toggleSetting`, and returns `true`/`false`), `src/areas/system.js:1-51` (the file being
changed), and `src/commands/menu.js:453-460` (the generic dispatch that calls
`systemArea.handleKey(key, app)`). Confirm `toggleSetting`'s persistence target
(`.ctoc/settings.yaml`) for the case-3 re-read. No new deps.

### Step 10: IMPLEMENT
ONE step, ordered sub-items:
(a) Add `const toolsTab = require('../tabs/tools');` to `src/areas/system.js`.
(b) Replace `handleKey(_key, _app) { return false; }` with the delegating handler
(delegate to `toolsTab.handleKey(key, app)` when `app.toolMode` is truthy, else `false`).
(c) Run `node --test tests/w10-settings-key-dispatch.test.js` → green.

### Step 11: REVIEW
Self-review: delegation fires only when `app.toolMode` is set; the static landing still
returns `false`; `tools.js` and `menu.js` are unmodified; the `render` function in
`system.js` is untouched; no circular require (`system.js` → `tools.js` only; `tools.js`
does not require `system.js`).

### Step 12: OPTIMIZE
Confirm no duplicated handler logic — `system.js` delegates rather than re-implementing;
`tools.js` remains the single source of the settings-key behavior.

### Step 13: SECURE
Run the Security Review checklist. Confirm the settings write still routes through the
existing `toggleSetting` (no new write path), and `handleKey` null-guards `app`.

### Step 14: VERIFY
`node --test tests/w10-settings-key-dispatch.test.js` → `# fail 0`; then the FULL suite
`node --test tests/*.test.js` → `# fail 0`, 0 skipped. Check any existing `system`-area or
`tools`-tab test — the delegation is additive (returns `false` when no sub-mode), so those
stay green; confirm no test asserted `systemArea.handleKey` always returns `false`.

### Step 15: DOCUMENT
Update `src/areas/system.js`'s header comment (the area folds the legacy tools tab and now
DELEGATES sub-mode keys to `tabs/tools.js`) and the `handleKey` JSDoc (already in the
spec) citing M12, so the "why does system delegate to tools" question is answered in-file.

### Step 16: FINAL-REVIEW
Confirm: this slice edits only its two declared files; on the open Settings screen a
down-arrow advances the selection and Enter flips-and-persists a toggle in
`.ctoc/settings.yaml`; escape exits the sub-mode; Doctor/Update sub-mode keys also
dispatch; the static System landing is unchanged; `tools.js`/`menu.js` untouched; suite
green, 0 skipped.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Delegating unconditionally breaks the static System landing | Guard `app && app.toolMode` — delegate only in a sub-mode; case 2 asserts the landing returns `false` | Step 10(b) |
| Circular require system.js ↔ tools.js | `tools.js` does not require `system.js`; one-directional; Step 11 verifies | Step 11 |
| A test asserted the old inert `return false` | Delegation returns `false` when no sub-mode; full-suite VERIFY surfaces a stale assertion | Step 14 |
| Toggle "persists" only in memory (false green) | Case 3 re-reads `.ctoc/settings.yaml` from disk, never an in-memory value | Step 8 |


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal)
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review
