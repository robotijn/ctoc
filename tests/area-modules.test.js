/**
 * Tests for area modules (A3.2 / CTOC v7)
 *
 * Each area module exports render(app) and handleKey(key, app).
 * render returns a string. handleKey returns true if the key was handled.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const AREA_MODULES = ['pipeline', 'inbox', 'agent', 'library', 'system'];

function tempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-area-mod-'));
  for (const stage of ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done']) {
    fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  }
  fs.mkdirSync(path.join(dir, '.ctoc', 'inbox', 'questions'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ctoc', 'inbox', 'decisions'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src', 'commands'), { recursive: true });
  return dir;
}
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore: best-effort, non-fatal */ } }

describe('area module contracts', () => {
  for (const name of AREA_MODULES) {
    describe(name, () => {
      let mod, root;
      beforeEach(() => {
        // Re-require fresh to avoid module-level state across tests
        delete require.cache[require.resolve(`../src/areas/${name}`)];
        mod = require(`../src/areas/${name}`);
        root = tempProject();
      });
      afterEach(() => { cleanup(root); });

      it('exports render and handleKey functions', () => {
        assert.equal(typeof mod.render, 'function');
        assert.equal(typeof mod.handleKey, 'function');
      });

      it('render returns a non-empty string', () => {
        const out = mod.render({ projectPath: root });
        assert.equal(typeof out, 'string');
        assert.ok(out.length > 0);
      });

      it('handleKey returns a boolean', () => {
        const result = mod.handleKey({ name: 'z', sequence: 'z' }, { projectPath: root });
        assert.equal(typeof result, 'boolean');
      });
    });
  }
});

describe('pipeline area', () => {
  let mod, root;
  beforeEach(() => {
    delete require.cache[require.resolve('../src/areas/pipeline')];
    mod = require('../src/areas/pipeline');
    root = tempProject();
  });
  afterEach(() => { cleanup(root); });

  it('renders 3 sections by name', () => {
    const out = mod.render({ projectPath: root });
    assert.match(out, /Business/);
    assert.match(out, /Implementation/);
    assert.match(out, /Execution/);
  });

  it('handleKey toggles section collapse state', () => {
    const { loadDashboardPrefs } = require('../src/lib/sections');
    const before = loadDashboardPrefs(root).collapsed.business;
    mod.handleKey({ name: 'b', sequence: 'b' }, { projectPath: root });
    const after = loadDashboardPrefs(root).collapsed.business;
    assert.notEqual(before, after, 'b toggles Business section');
  });
});

describe('inbox area', () => {
  let mod, root;
  beforeEach(() => {
    delete require.cache[require.resolve('../src/areas/inbox')];
    mod = require('../src/areas/inbox');
    root = tempProject();
  });
  afterEach(() => { cleanup(root); });

  it('renders empty state when no items', () => {
    const out = mod.render({ projectPath: root });
    assert.match(out, /Inbox clear|no async items/);
  });

  it('renders queues when items exist', () => {
    const { createQuestion } = require('../src/lib/inbox');
    createQuestion({ source_plan: 'A1', source_step: '8', question: 'q', context: 'c' }, root);
    const out = mod.render({ projectPath: root });
    assert.match(out, /Questions/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Agent area — `g` start / `x` stop wiring (menu dead-end fix).
// The lowercase owner-approved bindings: g = start, x = stop (x because `s` is
// globally Settings), b = back. `state.getAgentStatus` and `actions.startAgent`/
// `stopAgent` are stubbed via the shared module object (getAgentStatus liveness is
// registry-derived, not settable from a plain status file — so it must be stubbed).
// ─────────────────────────────────────────────────────────────────────────────
describe('agent area — g start / x stop bindings', () => {
  const state = require('../src/lib/state');
  const actions = require('../src/lib/actions');
  let mod, root, origStatus, origStart, origStop;

  beforeEach(() => {
    delete require.cache[require.resolve('../src/areas/agent')];
    mod = require('../src/areas/agent');
    root = tempProject();
    origStatus = state.getAgentStatus;
    origStart = actions.startAgent;
    origStop = actions.stopAgent;
  });
  afterEach(() => {
    state.getAgentStatus = origStatus;
    actions.startAgent = origStart;
    actions.stopAgent = origStop;
    cleanup(root);
  });

  it("'g' starts the agent on the next todo plan when idle", () => {
    state.getAgentStatus = () => ({ active: false });
    let calledWith;
    actions.startAgent = (p) => { calledWith = p; return { started: true, plan: { name: 'p1' } }; };
    const app = { projectPath: root };
    const handled = mod.handleKey({ sequence: 'g', name: 'g' }, app);
    assert.equal(handled, true, 'g is consumed');
    assert.equal(calledWith, root, 'startAgent called with the project root');
  });

  it("'x' requests a graceful stop when the agent is active", () => {
    state.getAgentStatus = () => ({ active: true, plan: 'p1' });
    let calledWith;
    actions.stopAgent = (p) => { calledWith = p; return { stopped: true, message: 'Stop requested.' }; };
    const app = { projectPath: root };
    const handled = mod.handleKey({ sequence: 'x', name: 'x' }, app);
    assert.equal(handled, true, 'x is consumed');
    assert.equal(calledWith, root, 'stopAgent called with the project root');
  });

  it("'g' is a non-silent no-op when the agent is already running", () => {
    state.getAgentStatus = () => ({ active: true, plan: 'p1' });
    let started = false;
    actions.startAgent = () => { started = true; return {}; };
    const app = { projectPath: root };
    const handled = mod.handleKey({ sequence: 'g', name: 'g' }, app);
    assert.equal(handled, true, 'g is consumed (not a dead key)');
    assert.equal(started, false, 'does not start a second agent');
    assert.match(app.message || '', /already running/i, 'gives one-line feedback');
  });

  it("'x' is a non-silent no-op when idle", () => {
    state.getAgentStatus = () => ({ active: false });
    let stopped = false;
    actions.stopAgent = () => { stopped = true; return {}; };
    const app = { projectPath: root };
    const handled = mod.handleKey({ sequence: 'x', name: 'x' }, app);
    assert.equal(handled, true, 'x is consumed (not a dead key)');
    assert.equal(stopped, false, 'does not call stopAgent when nothing runs');
    assert.match(app.message || '', /no agent|not running|idle/i, 'gives one-line feedback');
  });

  it('render advertises the working keys g start and x stop (no dead s-stop)', () => {
    const out = mod.render({ projectPath: root });
    assert.match(out, /g start/, 'footer advertises g start');
    assert.match(out, /x stop/, 'footer advertises x stop (lowercase x)');
    assert.doesNotMatch(out, /s stop/, 'no stale "s stop" (s is Settings globally)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// System area — d/u/s letter routing (menu dead-end fix). Lowercase mnemonics:
// d = Doctor, u = Update, s = Settings, b = Back. Previously the render advertised
// bare 1/2/3, which the global router ate as area switches — the sub-modes were
// unreachable. system.handleKey now consumes d/u/s on the landing and delegates b.
// ─────────────────────────────────────────────────────────────────────────────
describe('system area — d/u/s/b letter routing', () => {
  let mod, root;
  beforeEach(() => {
    delete require.cache[require.resolve('../src/areas/system')];
    mod = require('../src/areas/system');
    root = tempProject();
  });
  afterEach(() => { cleanup(root); });

  it("'d' opens the Doctor sub-mode", () => {
    const app = { projectPath: root };
    assert.equal(mod.handleKey({ sequence: 'd', name: 'd' }, app), true);
    assert.equal(app.toolMode, '1', 'Doctor sub-mode');
  });

  it("'u' opens the Update sub-mode", () => {
    const app = { projectPath: root };
    assert.equal(mod.handleKey({ sequence: 'u', name: 'u' }, app), true);
    assert.equal(app.toolMode, '2', 'Update sub-mode');
  });

  it("'s' opens the Settings sub-mode", () => {
    const app = { projectPath: root };
    assert.equal(mod.handleKey({ sequence: 's', name: 's' }, app), true);
    assert.equal(app.toolMode, '3', 'Settings sub-mode');
  });

  it("'b' backs out of an active sub-mode (delegated to tools)", () => {
    const app = { projectPath: root, toolMode: '3', settingsTabIndex: 0, settingIndex: 0 };
    assert.equal(mod.handleKey({ name: 'b', sequence: 'b' }, app), true);
    assert.equal(app.toolMode, null, 'sub-mode cleared');
  });

  it('render shows the d/u/s letter labels, not the colliding 1/2/3', () => {
    // Strip ANSI colour codes first — SGR sequences like \x1b[36m contain digits
    // ('3','6') that would false-match a "3…Settings" collide-label assertion.
    const out = mod.render({ projectPath: root }).replace(/\x1b\[[0-9;]*m/g, '');
    assert.match(out, /d[^\n]*Doctor/, 'letter d labels Doctor');
    assert.match(out, /u[^\n]*Update/, 'letter u labels Update');
    assert.match(out, /s[^\n]*Settings/, 'letter s labels Settings');
    assert.doesNotMatch(out, /1[^\n]*Doctor/, 'no bare "1 Doctor" collide-label');
    assert.doesNotMatch(out, /3[^\n]*Settings/, 'no bare "3 Settings" collide-label');
  });
});
