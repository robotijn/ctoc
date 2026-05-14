/**
 * Tab System (compatibility shim) Tests
 *
 * As of CTOC v7 (A3), tabs.js is a compatibility shim over areas.js. The
 * 8-tab system has been replaced by 5 top-level areas. This test file
 * exercises the shim's backward-compatibility guarantees:
 *
 *   - TABS exports an array of 5 areas (not 8 tabs)
 *   - getTabIndex resolves old tab IDs (overview, vision, ..., tools) to
 *     the correct area index, so legacy lookups continue working.
 *   - nextTab / prevTab cycle through the 5 areas.
 *
 * For the canonical area API, see src/lib/areas.js and tests/areas.test.js.
 */

const assert = require('assert');
const {
  TABS,
  getTabNames,
  getTabById,
  getTabByIndex,
  getTabIndex,
  nextTab,
  prevTab
} = require('../src/lib/tabs');

const AREA_COUNT = 5;
const AREA_IDS_IN_ORDER = ['pipeline', 'inbox', 'agent', 'library', 'system'];
const AREA_NAMES_IN_ORDER = ['Pipeline', 'Inbox', 'Agent', 'Library', 'System'];

// Old tab IDs that must continue resolving via the shim.
const LEGACY_TAB_LOOKUPS = {
  overview: 'pipeline',
  vision: 'pipeline',
  functional: 'pipeline',
  implementation: 'pipeline',
  review: 'pipeline',
  todo: 'pipeline',
  progress: 'agent',
  tools: 'system',
};

function testTabsConstant() {
  assert.ok(Array.isArray(TABS), 'TABS is an array');
  assert.strictEqual(TABS.length, AREA_COUNT, 'TABS has 5 areas');
  TABS.forEach((tab, i) => {
    assert.ok(tab.id, `Tab ${i} has id`);
    assert.ok(tab.name, `Tab ${i} has name`);
  });
  const actualIds = TABS.map(t => t.id);
  assert.deepStrictEqual(actualIds, AREA_IDS_IN_ORDER, 'Tab IDs are the 5 areas in order');
  console.log('✓ TABS constant structure (v7 areas)');
}

function testGetTabNames() {
  const names = getTabNames();
  assert.deepStrictEqual(names, AREA_NAMES_IN_ORDER, '5 area names in order');
  console.log('✓ getTabNames()');
}

function testGetTabById() {
  const pipeline = getTabById('pipeline');
  assert.ok(pipeline && pipeline.id === 'pipeline');
  const system = getTabById('system');
  assert.ok(system && system.name === 'System');
  assert.strictEqual(getTabById('nonexistent'), undefined);
  assert.strictEqual(getTabById(''), undefined);
  console.log('✓ getTabById()');
}

function testGetTabByIndex() {
  assert.strictEqual(getTabByIndex(0).id, 'pipeline');
  assert.strictEqual(getTabByIndex(AREA_COUNT - 1).id, 'system');
  assert.strictEqual(getTabByIndex(100), undefined);
  assert.strictEqual(getTabByIndex(-1), undefined);
  console.log('✓ getTabByIndex()');
}

function testGetTabIndex() {
  // New area IDs resolve to their canonical index
  assert.strictEqual(getTabIndex('pipeline'), 0);
  assert.strictEqual(getTabIndex('system'), 4);

  // Legacy tab IDs resolve via the shim (per I6)
  for (const [oldId, areaId] of Object.entries(LEGACY_TAB_LOOKUPS)) {
    const expected = AREA_IDS_IN_ORDER.indexOf(areaId);
    assert.strictEqual(
      getTabIndex(oldId),
      expected,
      `Legacy ${oldId} resolves to area ${areaId} at index ${expected}`
    );
  }

  assert.strictEqual(getTabIndex('truly-unknown'), -1);
  console.log('✓ getTabIndex() with legacy shim');
}

function testNextPrev() {
  // Forward cycle
  let current = 0;
  for (let i = 0; i < AREA_COUNT; i++) {
    current = nextTab(current);
  }
  assert.strictEqual(current, 0, 'full forward cycle returns to start');

  // Backward cycle
  current = 0;
  for (let i = 0; i < AREA_COUNT; i++) {
    current = prevTab(current);
  }
  assert.strictEqual(current, 0, 'full backward cycle returns to start');

  // Wrap-around
  assert.strictEqual(nextTab(AREA_COUNT - 1), 0);
  assert.strictEqual(prevTab(0), AREA_COUNT - 1);
  console.log('✓ nextTab / prevTab cycle through 5 areas');
}

function testEdgeCases() {
  assert.strictEqual(getTabById(null), undefined);
  assert.strictEqual(getTabById(undefined), undefined);
  // Case sensitivity
  assert.strictEqual(getTabIndex('Pipeline'), -1, 'case-sensitive: capital P not found');
  console.log('✓ Edge cases');
}

console.log('\nTab System (v7 shim) Tests\n');
testTabsConstant();
testGetTabNames();
testGetTabById();
testGetTabByIndex();
testGetTabIndex();
testNextPrev();
testEdgeCases();
console.log('\nAll tab shim tests passed!\n');
