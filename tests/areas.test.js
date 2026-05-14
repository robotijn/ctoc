/**
 * Tests for areas.js (A3 — CTOC v7)
 *
 * Areas are the v7 top-level menu abstraction, replacing the 8-tab system.
 *
 *   Pipeline · Inbox · Agent · Library · System
 *
 * tabs.js becomes a backward-compatibility shim — old tab IDs map to areas.
 * Per A3 impl plan ADR-1 and I6 refinement.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  AREAS,
  listAreas,
  getAreaById,
  getAreaByIndex,
  getAreaIndex,
  nextArea,
  prevArea,
} = require('../src/lib/areas');

describe('AREAS list', () => {
  it('has exactly 5 areas', () => {
    assert.equal(AREAS.length, 5);
  });

  it('has Pipeline, Inbox, Agent, Library, System in order', () => {
    assert.equal(AREAS[0].id, 'pipeline');
    assert.equal(AREAS[1].id, 'inbox');
    assert.equal(AREAS[2].id, 'agent');
    assert.equal(AREAS[3].id, 'library');
    assert.equal(AREAS[4].id, 'system');
  });

  it('each area has id, name, shortcut', () => {
    for (const area of AREAS) {
      assert.ok(area.id, 'has id');
      assert.ok(area.name, 'has name');
      assert.ok(area.shortcut, 'has shortcut');
    }
  });

  it('shortcuts are unique', () => {
    const shortcuts = AREAS.map(a => a.shortcut);
    assert.equal(new Set(shortcuts).size, shortcuts.length, 'shortcuts are unique');
  });

  it('is frozen', () => {
    assert.ok(Object.isFrozen(AREAS));
  });
});

describe('listAreas', () => {
  it('returns the AREAS array', () => {
    assert.equal(listAreas().length, 5);
  });
});

describe('getAreaById', () => {
  it('returns the area for a known id', () => {
    assert.equal(getAreaById('pipeline').name, 'Pipeline');
    assert.equal(getAreaById('inbox').name, 'Inbox');
  });

  it('returns undefined for unknown id', () => {
    assert.equal(getAreaById('garbage'), undefined);
  });
});

describe('getAreaByIndex', () => {
  it('returns the area at given index', () => {
    assert.equal(getAreaByIndex(0).id, 'pipeline');
    assert.equal(getAreaByIndex(4).id, 'system');
  });
});

describe('getAreaIndex', () => {
  it('returns the index for a known id', () => {
    assert.equal(getAreaIndex('pipeline'), 0);
    assert.equal(getAreaIndex('system'), 4);
  });

  it('I6: returns area index for old tab IDs (compatibility shim)', () => {
    // Old tab IDs map to areas per the I6 refinement.
    assert.equal(getAreaIndex('overview'), 0, 'overview -> pipeline');
    assert.equal(getAreaIndex('vision'), 0, 'vision -> pipeline');
    assert.equal(getAreaIndex('functional'), 0, 'functional -> pipeline');
    assert.equal(getAreaIndex('implementation'), 0, 'implementation -> pipeline');
    assert.equal(getAreaIndex('review'), 0, 'review -> pipeline');
    assert.equal(getAreaIndex('todo'), 0, 'todo -> pipeline');
    assert.equal(getAreaIndex('progress'), 2, 'progress -> agent');
    assert.equal(getAreaIndex('tools'), 4, 'tools -> system');
  });

  it('returns -1 for genuinely unknown id', () => {
    assert.equal(getAreaIndex('garbage'), -1);
  });
});

describe('nextArea / prevArea (cyclic)', () => {
  it('nextArea wraps from last to first', () => {
    assert.equal(nextArea(4), 0);
    assert.equal(nextArea(0), 1);
  });

  it('prevArea wraps from first to last', () => {
    assert.equal(prevArea(0), 4);
    assert.equal(prevArea(1), 0);
  });
});

describe('tabs.js compatibility shim (I6)', () => {
  const tabs = require('../src/lib/tabs');

  it('still exports TABS array for backward compatibility', () => {
    assert.ok(Array.isArray(tabs.TABS));
  });

  it('still exports getTabNames, getTabById, getTabByIndex, getTabIndex, nextTab, prevTab', () => {
    assert.equal(typeof tabs.getTabNames, 'function');
    assert.equal(typeof tabs.getTabById, 'function');
    assert.equal(typeof tabs.getTabByIndex, 'function');
    assert.equal(typeof tabs.getTabIndex, 'function');
    assert.equal(typeof tabs.nextTab, 'function');
    assert.equal(typeof tabs.prevTab, 'function');
  });

  it('getTabIndex resolves old tab ids to area indexes (no breaking change)', () => {
    // Code paths like TABS.findIndex(t => t.id === 'tools') in src/commands/menu.js
    // need to continue working. The shim ensures lookups return valid indexes.
    assert.notEqual(tabs.getTabIndex('tools'), -1, 'tools lookup still resolves');
    assert.notEqual(tabs.getTabIndex('overview'), -1, 'overview lookup still resolves');
  });
});
