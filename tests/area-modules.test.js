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
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }

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
