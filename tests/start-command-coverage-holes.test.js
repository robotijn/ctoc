'use strict';

/**
 * The dashboard command's dark ranges — tested where reachable, NAMED where not.
 *
 * Measured on 2026-08-31 and re-derived from the gate's own report on 2026-09-01
 * (`npm test`, node line coverage scoped to `src/**`): `src/commands/start.js` is
 * at 96.39 %, with these uncovered ranges:
 *
 *   249-250 · 470-472 · 477-481 · 596-597 · 601-604 · 690-693 · 957-973
 *
 * Every range is classified below. A range this file does not test is named with
 * the reason it is not tested — a named, reasoned gap is honest; a faked terminal
 * is not.
 *
 * ---------------------------------------------------------------------------
 * (a) REACHABLE without an interactive terminal — tested here
 * ---------------------------------------------------------------------------
 *
 *   249-250  The VERSION-file read's fallback. When the file cannot be read the
 *            header prints `CTOC v?.?.?` instead of crashing the dashboard. Driven
 *            by loading the module afresh with the VERSION read throwing at its
 *            true boundary (`safe-fs`), then rendering and reading the header.
 *
 *   470-472  The streaming view's `back` intent. `streaming-render` emits
 *            `app.streamAction = 'back'`; the host interprets it by leaving the
 *            streaming view for the classic dashboard. Driven through the exported
 *            `handleKey`, asserting the human-visible result: the classic area
 *            paints and the streaming view does not.
 *
 *   477-481  "Streaming owns the screen." A key streaming does not map re-renders
 *            streaming rather than leaking to the numeric area shortcuts below.
 *            Driven with the digit `2` — which IS the Inbox shortcut — so a leak
 *            would visibly jump areas.
 *
 *   596-597  The area-activation fail-open arm. An area whose `activate(app)`
 *            throws must not break tab switching; the menu still paints the area
 *            the human moved to.
 *
 *   690-693  The compliance-anchor reader's fail-closed arm. A settings file that
 *            cannot be read means the regulatory-regime anchor is NOT usable, so
 *            setup verification reports it as missing rather than throwing.
 *
 * ---------------------------------------------------------------------------
 * (b) TERMINAL-ONLY — named, not faked, not counted as a gap
 * ---------------------------------------------------------------------------
 *
 *   957-973  The interactive-terminal branch (`process.stdin.isTTY`): raw-mode
 *            keyboard setup, the resize listener, the auto-sync timers and the
 *            first paint. OUT OF SCOPE by the owner's standing decision. No test
 *            here fakes a terminal, stubs `isTTY`, or spawns a pseudo-terminal —
 *            the coverage floor is a normal-development-machine floor, declared
 *            rather than chased.
 *
 *   601-604  `handleResize`. It is not exported, and its ONLY wiring is
 *            `process.stdout.on('resize', handleResize)` at line 958 — INSIDE the
 *            interactive-terminal branch above. So it is reachable only from a real
 *            terminal, and reaching it any other way would mean adding an export
 *            that no live caller uses: trading a dark line for a dead export, which
 *            the reachability fence names as the worse defect. Named, not tested.
 *
 * ---------------------------------------------------------------------------
 * (c) DEAD — none found. Every range above is live code.
 * ---------------------------------------------------------------------------
 *
 * Discipline: faults are injected only at a true module boundary (`safe-fs`, the
 * streaming-render module object, an area module object) and every mock is
 * restored. Nothing is written outside a temporary fixture project — no case
 * renders against this repository's own plan tree.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const safeFs = require('../src/lib/safe-fs');
const streamingRender = require('../src/lib/streaming-render');
const pipelineArea = require('../src/areas/pipeline');
const inboxArea = require('../src/areas/inbox');

const START = require.resolve('../src/commands/start.js');
const start = require(START);

const STAGE_DIRS = [
  'vision', 'canvas', 'functional', 'implementation',
  'todo', 'in-progress', 'review', 'done',
];

/**
 * A temporary project, complete enough that setup verification has nothing to
 * repair. Every case points `app.projectPath` here so no render can reach this
 * repository's real plan tree.
 *
 * @param {string} prefix distinctive, so a fault sentinel can match on it
 * @returns {string} the fixture root
 */
function makeFixtureProject(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(dir, '.ctoc', 'state'), { recursive: true });
  for (const s of STAGE_DIRS) fs.mkdirSync(path.join(dir, 'plans', s), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.ctoc', 'settings.yaml'),
    'version: 1\n\nregulatory_regime:\n  active_profiles: []\n',
    'utf8',
  );
  fs.writeFileSync(path.join(dir, '.ctoc', 'state', 'iron-loop.yaml'), 'step: 1\n', 'utf8');
  return dir;
}

/** Collect everything the dashboard paints, and restore stdout unconditionally. */
function captureStdout(fn) {
  const realWrite = process.stdout.write;
  let out = '';
  // @ts-ignore - test-only stdout capture
  process.stdout.write = (chunk) => { out += String(chunk); return true; };
  try {
    fn();
  } finally {
    process.stdout.write = realWrite;
  }
  return out;
}

/**
 * Put the shared `app` into a known, hermetic state before a key is delivered.
 * Only the fields these cases read or write are touched.
 */
function stageApp(app, fixture, overrides) {
  app.projectPath = fixture;
  app.tabIndex = 0;
  app.mode = 'list';
  app.toolMode = null;
  app.searchMode = false;
  app.searchQuery = '';
  app.directInput = '';
  app.inputValue = '';
  app.selectedPlan = null;
  app.viewContent = null;
  app.message = null;
  app.streamView = true;
  app.streamAction = null;
  Object.assign(app, overrides || {});
}

describe('the dashboard command: the ranges reachable without a terminal', () => {
  it('an unreadable VERSION file leaves the header honest (CTOC v?.?.?) instead of crashing', () => {
    const fixture = makeFixtureProject('ctoc-version-fault-');
    const realRead = safeFs.readFileSync;
    const cached = require.cache[START];

    let fresh;
    try {
      // The true boundary: the module reads VERSION through safe-fs at load time.
      // Sentinel-guarded so every other read in this process is untouched.
      safeFs.readFileSync = (p, o) => {
        if (path.basename(String(p)) === 'VERSION') throw new Error('injected: VERSION unreadable');
        return realRead(p, o);
      };
      delete require.cache[START];
      fresh = require(START);
    } finally {
      safeFs.readFileSync = realRead;
      delete require.cache[START];
      if (cached) require.cache[START] = cached;
    }

    // Render a pure screen (the plan-content view) so nothing touches the filesystem.
    stageApp(fresh.app, fixture, { mode: 'view', viewContent: 'fixture content', streamView: false });
    const out = captureStdout(() => fresh.render());

    assert.match(out, /CTOC v\?\.\?\.\?/, 'the header must fall back to the unknown-version marker');
  });

  it('GUARD (green before this slice): a readable VERSION file prints the real version', () => {
    // Accounted for at Step 11: this case was GREEN before any change. It is not
    // banked as new coverage — it exists so the fallback case above cannot pass by
    // the header being permanently unknown.
    const fixture = makeFixtureProject('ctoc-version-real-');
    const real = fs.readFileSync(path.join(__dirname, '..', 'VERSION'), 'utf8').trim();

    stageApp(start.app, fixture, { mode: 'view', viewContent: 'fixture content', streamView: false });
    const out = captureStdout(() => start.render());

    assert.ok(out.includes(`CTOC v${real}`), `the header must print the real version ${real}`);
    assert.doesNotMatch(out, /CTOC v\?\.\?\.\?/);
  });

  it('the streaming view\'s back action leaves streaming and paints the classic dashboard', (t) => {
    const fixture = makeFixtureProject('ctoc-stream-back-');

    t.mock.method(streamingRender, 'handleKey', (key, app) => {
      app.streamAction = 'back';
      return true;
    });
    t.mock.method(streamingRender, 'render', () => '<<STREAMING-VIEW>>');
    t.mock.method(pipelineArea, 'render', () => '<<CLASSIC-PIPELINE>>');

    stageApp(start.app, fixture);
    const out = captureStdout(() => start.handleKey('b', { name: 'b', sequence: 'b' }));

    assert.equal(start.app.streamView, false, 'back must leave the streaming view');
    assert.equal(start.app.streamAction, null, 'the intent must be consumed, not left standing');
    assert.match(out, /<<CLASSIC-PIPELINE>>/, 'the classic dashboard must paint');
    assert.doesNotMatch(out, /<<STREAMING-VIEW>>/, 'streaming must not paint after back');
  });

  it('a key streaming does not map re-renders streaming and does NOT jump to another area', (t) => {
    const fixture = makeFixtureProject('ctoc-stream-unmapped-');

    t.mock.method(streamingRender, 'handleKey', () => false);
    t.mock.method(streamingRender, 'render', () => '<<STREAMING-VIEW>>');
    t.mock.method(pipelineArea, 'render', () => '<<CLASSIC-PIPELINE>>');
    t.mock.method(inboxArea, 'render', () => '<<INBOX-AREA>>');

    stageApp(start.app, fixture);
    // `2` is the Inbox shortcut further down handleKey. If streaming stopped owning
    // the screen, this keystroke would silently move the human to another area.
    const out = captureStdout(() => start.handleKey('2', { name: '2', sequence: '2' }));

    assert.equal(start.app.streamView, true, 'an unmapped key must stay in streaming');
    assert.equal(start.app.tabIndex, 0, 'an unmapped key must not jump areas');
    assert.match(out, /<<STREAMING-VIEW>>/, 'streaming must repaint');
    assert.doesNotMatch(out, /<<INBOX-AREA>>/, 'the Inbox shortcut must not have fired');
    assert.doesNotMatch(out, /<<CLASSIC-PIPELINE>>/, 'the classic dashboard must not have taken over');
  });

  it('an area whose activation throws does not break moving to it', (t) => {
    const fixture = makeFixtureProject('ctoc-activate-fault-');

    t.mock.method(inboxArea, 'activate', () => { throw new Error('injected activation fault'); });
    t.mock.method(inboxArea, 'render', () => '<<INBOX-AREA>>');
    t.mock.method(pipelineArea, 'render', () => '<<CLASSIC-PIPELINE>>');

    // The classic dashboard, so the arrow key reaches the tab-switching handler.
    stageApp(start.app, fixture, { streamView: false });
    const out = captureStdout(() => start.handleKey('', { name: 'right' }));

    assert.equal(start.app.tabIndex, 1, 'the human still moves to the next area');
    assert.match(out, /<<INBOX-AREA>>/, 'the area still paints despite the activation fault');
  });

  it('a settings file that cannot be read is reported as an unusable regime anchor, not a crash', (t) => {
    const fixture = makeFixtureProject('ctoc-anchor-fault-');
    const realRead = safeFs.readFileSync;

    t.mock.method(safeFs, 'readFileSync', (p, o) => {
      const s = String(p);
      if (s.includes('ctoc-anchor-fault-') && s.endsWith('settings.yaml')) {
        throw new Error('injected: settings unreadable');
      }
      return realRead(p, o);
    });

    const result = start.verifySetup(fixture);

    assert.equal(result.ok, false, 'an unreadable anchor is not a healthy setup');
    assert.ok(
      result.missing.some(m => m.includes('no usable regulatory_regime anchor')),
      `the unusable anchor must be reported; got ${JSON.stringify(result.missing)}`,
    );
    for (const m of result.missing) {
      assert.ok(!path.isAbsolute(m), `missing entries stay project-relative, got ${m}`);
    }
  });

  it('GUARD (green before this slice): a readable, inline anchor is accepted', () => {
    // Also accounted for at Step 11 as green-before-change. It pins the other side
    // of the fail-closed arm so the case above cannot pass by the anchor check
    // always reporting unusable.
    const fixture = makeFixtureProject('ctoc-anchor-ok-');
    const result = start.verifySetup(fixture);
    assert.equal(result.ok, true, `a complete fixture must verify clean; got ${JSON.stringify(result.missing)}`);
  });
});
