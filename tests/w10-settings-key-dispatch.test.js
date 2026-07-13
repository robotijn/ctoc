'use strict';

/**
 * W10-s5 — Settings-screen keys dispatch through the real handler (M12).
 *
 * Behavior tests for `src/areas/system.js`'s `handleKey`. On current `main`
 * `systemArea.handleKey` is a hardcoded `return false;` no-op, so every keystroke
 * on the open Settings / Doctor / Update screens is swallowed. After this slice it
 * delegates to `src/tabs/tools.js`'s real handler whenever a legacy tools sub-mode
 * (`app.toolMode`) is active. Assertions check that app state actually changes and
 * that a toggle persists to disk — never merely that "handleKey returned true".
 *
 * Drives the REAL modules (no test doubles) against REAL temporary project
 * directories. Persistence is verified against `.ctoc/settings.json` — the actual
 * file `src/lib/settings.js` (getSettingsPath) writes — not the `.ctoc/settings.yaml`
 * named in the plan's prose (the code, not the brief, is the source of truth).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const systemArea = require('../src/areas/system');
const { readRawSettings } = require('../src/lib/settings');

// Create an isolated temp project, optionally seeding .ctoc/settings.json.
function makeTempProject(seedSettings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-w10-s5-'));
  const ctocDir = path.join(dir, '.ctoc');
  fs.mkdirSync(ctocDir, { recursive: true });
  if (seedSettings !== undefined) {
    fs.writeFileSync(
      path.join(ctocDir, 'settings.json'),
      JSON.stringify(seedSettings, null, 2)
    );
  }
  return dir;
}

function withTempProject(seedSettings, fn) {
  const dir = makeTempProject(seedSettings);
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Case 1 — Settings navigation key dispatches (scenario 14, happy path).
// A down-arrow on the open Settings screen must advance the selection, proving
// the keystroke is routed to the real handler and NOT swallowed.
test('down-arrow on the open Settings screen advances app.settingIndex', () => {
  withTempProject(undefined, (dir) => {
    const app = { toolMode: '3', settingsTabIndex: 0, settingIndex: 0, projectPath: dir };
    const consumed = systemArea.handleKey({ name: 'down' }, app);
    assert.equal(consumed, true, 'down-arrow must be consumed on the open Settings screen');
    assert.equal(app.settingIndex, 1, 'settingIndex must advance from 0 to 1');
  });
});

// Case 2 — Static System landing consumes nothing of its own (regression guard).
// Delegation must fire ONLY when a sub-mode is active; the static landing has no
// interactive keys, so it must keep returning false and never mutate state.
test('static System landing (no sub-mode) consumes no keys', () => {
  withTempProject(undefined, (dir) => {
    const app = { toolMode: null, settingIndex: 0, projectPath: dir };
    const consumed = systemArea.handleKey({ name: 'down' }, app);
    assert.equal(consumed, false, 'with no sub-mode active the landing must not consume keys');
    assert.equal(app.settingIndex, 0, 'settingIndex must not move on the static landing');
  });
});

// Case 3 — Settings toggle actually persists (scenario 15).
// Enter on a toggle-type setting must flip the value AND persist it to disk. The
// assertion re-reads .ctoc/settings.json fresh from disk (never an in-memory value).
test('Enter on a toggle setting flips and persists the value to disk', () => {
  // syncEnabled is index 3 in the `general` category schema and defaults to true.
  // Seed it true so the flip lands on false — distinct from the schema default,
  // proving the write, not a default, is what disk shows.
  withTempProject({ general: { syncEnabled: true } }, (dir) => {
    const app = { toolMode: '3', settingsTabIndex: 0, settingIndex: 3, projectPath: dir };

    const before = readRawSettings(dir).general.syncEnabled;
    assert.equal(before, true, 'precondition: seeded general.syncEnabled is true');

    const consumed = systemArea.handleKey({ name: 'return' }, app);
    assert.equal(consumed, true, 'Enter on a toggle setting must be consumed');

    // Read the file fresh from disk — do not trust an in-memory value.
    const onDisk = JSON.parse(
      fs.readFileSync(path.join(dir, '.ctoc', 'settings.json'), 'utf8')
    );
    assert.equal(
      onDisk.general.syncEnabled,
      false,
      'the toggle must flip true → false and persist to .ctoc/settings.json'
    );
  });
});

// Case 4 — Escape/back exits the Settings sub-mode.
test('escape exits the Settings sub-mode', () => {
  withTempProject(undefined, (dir) => {
    const app = { toolMode: '3', settingsTabIndex: 0, settingIndex: 0, projectPath: dir };
    const consumed = systemArea.handleKey({ name: 'escape' }, app);
    assert.equal(consumed, true, 'escape must be consumed in the Settings sub-mode');
    assert.equal(app.toolMode, null, 'escape must clear app.toolMode (exit the sub-mode)');
  });
});

// Case 5a — Doctor sub-mode keys also dispatch (delegation is not Settings-only).
// Typing a character in the Doctor sub-mode must land in the Doctor input buffer.
test('Doctor sub-mode keystroke reaches the Doctor input buffer', () => {
  withTempProject(undefined, (dir) => {
    const app = { toolMode: '1', projectPath: dir };
    const consumed = systemArea.handleKey({ name: 'x', sequence: 'x' }, app);
    assert.equal(consumed, true, 'a Doctor question keystroke must be consumed');
    assert.equal(app.doctorInput, 'x', 'the keystroke must reach app.doctorInput');
  });
});

// Case 5b — Update sub-mode keys also dispatch (delegation is not Settings-only).
// A non-destructive escape proves Update-mode keys route to the real handler
// without triggering forceUpdate()'s real filesystem side effects.
test('Update sub-mode escape exits the sub-mode', () => {
  withTempProject(undefined, (dir) => {
    const app = { toolMode: '2', projectPath: dir };
    const consumed = systemArea.handleKey({ name: 'escape' }, app);
    assert.equal(consumed, true, 'escape must be consumed in the Update sub-mode');
    assert.equal(app.toolMode, null, 'escape must clear app.toolMode (exit the sub-mode)');
  });
});
