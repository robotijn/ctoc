/**
 * Tests for sections.js (A2 — CTOC v7)
 *
 * Sections group existing plan stages into 3 task-aligned buckets.
 * Stages remain canonical; sections are a thin grouping layer.
 *
 *   Business       = vision · canvas · functional   (context-building: WHY + WHO)
 *   Implementation = implementation · todo          (technical context + queue)
 *   Execution      = in-progress · review · done    (doing · verifying · shipped)
 *
 * Per A2 functional plan FR-1..FR-9 and impl plan ADRs 1-3 plus I4/I5 refinements.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  SECTIONS,
  getSectionForStage,
  getStagesInSection,
  getSectionLabel,
  loadDashboardPrefs,
  saveDashboardPrefs,
} = require('../src/lib/sections');

function tempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-sections-'));
}
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }

describe('SECTIONS map', () => {
  it('has exactly 3 sections', () => {
    assert.equal(Object.keys(SECTIONS).length, 3);
  });
  it('has business, implementation, execution', () => {
    assert.ok('business' in SECTIONS);
    assert.ok('implementation' in SECTIONS);
    assert.ok('execution' in SECTIONS);
  });
  it('is frozen (cannot be mutated)', () => {
    assert.ok(Object.isFrozen(SECTIONS));
  });
});

describe('getSectionForStage', () => {
  it('maps Business stages: vision, canvas, functional', () => {
    assert.equal(getSectionForStage('vision'), 'business');
    assert.equal(getSectionForStage('canvas'), 'business');
    assert.equal(getSectionForStage('functional'), 'business');
  });
  it('maps Implementation stages: implementation, todo', () => {
    assert.equal(getSectionForStage('implementation'), 'implementation');
    assert.equal(getSectionForStage('todo'), 'implementation');
  });
  it('maps Execution stages: in-progress, review, done', () => {
    assert.equal(getSectionForStage('in-progress'), 'execution');
    assert.equal(getSectionForStage('review'), 'execution');
    assert.equal(getSectionForStage('done'), 'execution');
  });
  it('returns null for unknown stage', () => {
    assert.equal(getSectionForStage('garbage'), null);
  });
});

describe('getStagesInSection', () => {
  it('returns business stages in canonical order', () => {
    assert.deepEqual(getStagesInSection('business'), ['vision', 'canvas', 'functional']);
  });
  it('returns implementation stages', () => {
    assert.deepEqual(getStagesInSection('implementation'), ['implementation', 'todo']);
  });
  it('returns execution stages', () => {
    assert.deepEqual(getStagesInSection('execution'), ['in-progress', 'review', 'done']);
  });
  it('returns empty array for unknown section', () => {
    assert.deepEqual(getStagesInSection('nope'), []);
  });
});

describe('getSectionLabel', () => {
  it('returns title-cased labels', () => {
    assert.equal(getSectionLabel('business'), 'Business');
    assert.equal(getSectionLabel('implementation'), 'Implementation');
    assert.equal(getSectionLabel('execution'), 'Execution');
  });
});

describe('dashboard prefs load/save', () => {
  let root;
  beforeEach(() => { root = tempProject(); });
  afterEach(() => { cleanup(root); });

  it('returns defaults when no prefs file exists', () => {
    const prefs = loadDashboardPrefs(root);
    assert.equal(prefs.collapsed.business, false);
    assert.equal(prefs.collapsed.implementation, false);
    assert.equal(prefs.collapsed.execution, false);
  });

  it('persists and reloads collapse state', () => {
    saveDashboardPrefs({ collapsed: { business: true, implementation: false, execution: true } }, root);
    const prefs = loadDashboardPrefs(root);
    assert.equal(prefs.collapsed.business, true);
    assert.equal(prefs.collapsed.execution, true);
  });

  it('I5: gracefully handles corrupt JSON file', () => {
    const prefsFile = path.join(root, '.ctoc', 'state', 'dashboard-prefs.json');
    fs.mkdirSync(path.dirname(prefsFile), { recursive: true });
    fs.writeFileSync(prefsFile, '{ this is not valid JSON ');
    const prefs = loadDashboardPrefs(root);
    assert.equal(prefs.collapsed.business, false, 'falls back to defaults');
    assert.ok(fs.existsSync(prefsFile), 'does NOT delete the corrupt file (user can inspect)');
  });

  it('saves create .ctoc/state/ directory if missing', () => {
    saveDashboardPrefs({ collapsed: { business: false, implementation: false, execution: false } }, root);
    assert.ok(fs.existsSync(path.join(root, '.ctoc', 'state', 'dashboard-prefs.json')));
  });
});
