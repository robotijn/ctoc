/**
 * Tab System Tests
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
} = require('../lib/tabs');

// Test TABS constant structure
function testTabsConstant() {
  assert.ok(Array.isArray(TABS), 'TABS is an array');
  assert.strictEqual(TABS.length, 7, 'TABS has 7 entries');

  // Verify each tab has required properties
  TABS.forEach((tab, i) => {
    assert.ok(tab.id, `Tab ${i} has an id`);
    assert.ok(tab.name, `Tab ${i} has a name`);
    assert.strictEqual(typeof tab.id, 'string', `Tab ${i} id is a string`);
    assert.strictEqual(typeof tab.name, 'string', `Tab ${i} name is a string`);
  });

  // Verify expected tabs exist
  const expectedIds = ['overview', 'functional', 'implementation', 'review', 'todo', 'progress', 'tools'];
  const actualIds = TABS.map(t => t.id);
  assert.deepStrictEqual(actualIds, expectedIds, 'Tab IDs match expected order');

  console.log('✓ TABS constant structure');
}

// Test getTabNames function
function testGetTabNames() {
  const names = getTabNames();

  assert.ok(Array.isArray(names), 'Returns an array');
  assert.strictEqual(names.length, 7, 'Returns 7 names');

  const expectedNames = ['Overview', 'Functional', 'Implementation', 'Review', 'Todo', 'Progress', 'Tools'];
  assert.deepStrictEqual(names, expectedNames, 'Tab names match expected order');

  // Verify all are strings
  names.forEach((name, i) => {
    assert.strictEqual(typeof name, 'string', `Name ${i} is a string`);
  });

  console.log('✓ getTabNames()');
}

// Test getTabById function
function testGetTabById() {
  // Test existing tabs
  const overview = getTabById('overview');
  assert.ok(overview, 'Found overview tab');
  assert.strictEqual(overview.id, 'overview', 'Correct id');
  assert.strictEqual(overview.name, 'Overview', 'Correct name');

  const tools = getTabById('tools');
  assert.ok(tools, 'Found tools tab');
  assert.strictEqual(tools.id, 'tools', 'Correct id');
  assert.strictEqual(tools.name, 'Tools', 'Correct name');

  const implementation = getTabById('implementation');
  assert.ok(implementation, 'Found implementation tab');
  assert.strictEqual(implementation.name, 'Implementation', 'Correct name');

  // Test non-existent tab
  const notFound = getTabById('nonexistent');
  assert.strictEqual(notFound, undefined, 'Returns undefined for unknown id');

  // Test empty string
  const empty = getTabById('');
  assert.strictEqual(empty, undefined, 'Returns undefined for empty string');

  console.log('✓ getTabById()');
}

// Test getTabByIndex function
function testGetTabByIndex() {
  // Test valid indices
  const first = getTabByIndex(0);
  assert.ok(first, 'Found first tab');
  assert.strictEqual(first.id, 'overview', 'First tab is overview');

  const last = getTabByIndex(6);
  assert.ok(last, 'Found last tab');
  assert.strictEqual(last.id, 'tools', 'Last tab is tools');

  const middle = getTabByIndex(3);
  assert.ok(middle, 'Found middle tab');
  assert.strictEqual(middle.id, 'review', 'Index 3 is review');

  // Test out of bounds
  const outOfBounds = getTabByIndex(100);
  assert.strictEqual(outOfBounds, undefined, 'Returns undefined for out of bounds index');

  const negative = getTabByIndex(-1);
  assert.strictEqual(negative, undefined, 'Returns undefined for negative index');

  console.log('✓ getTabByIndex()');
}

// Test getTabIndex function
function testGetTabIndex() {
  // Test existing tabs
  assert.strictEqual(getTabIndex('overview'), 0, 'overview is at index 0');
  assert.strictEqual(getTabIndex('functional'), 1, 'functional is at index 1');
  assert.strictEqual(getTabIndex('implementation'), 2, 'implementation is at index 2');
  assert.strictEqual(getTabIndex('review'), 3, 'review is at index 3');
  assert.strictEqual(getTabIndex('todo'), 4, 'todo is at index 4');
  assert.strictEqual(getTabIndex('progress'), 5, 'progress is at index 5');
  assert.strictEqual(getTabIndex('tools'), 6, 'tools is at index 6');

  // Test non-existent tab
  assert.strictEqual(getTabIndex('nonexistent'), -1, 'Returns -1 for unknown id');
  assert.strictEqual(getTabIndex(''), -1, 'Returns -1 for empty string');

  console.log('✓ getTabIndex()');
}

// Test nextTab function
function testNextTab() {
  // Test normal progression
  assert.strictEqual(nextTab(0), 1, '0 -> 1');
  assert.strictEqual(nextTab(1), 2, '1 -> 2');
  assert.strictEqual(nextTab(2), 3, '2 -> 3');
  assert.strictEqual(nextTab(3), 4, '3 -> 4');
  assert.strictEqual(nextTab(4), 5, '4 -> 5');
  assert.strictEqual(nextTab(5), 6, '5 -> 6');

  // Test wrap-around
  assert.strictEqual(nextTab(6), 0, '6 wraps to 0');

  // Test full cycle
  let current = 0;
  for (let i = 0; i < 7; i++) {
    current = nextTab(current);
  }
  assert.strictEqual(current, 0, 'Full cycle returns to start');

  console.log('✓ nextTab()');
}

// Test prevTab function
function testPrevTab() {
  // Test normal regression
  assert.strictEqual(prevTab(6), 5, '6 -> 5');
  assert.strictEqual(prevTab(5), 4, '5 -> 4');
  assert.strictEqual(prevTab(4), 3, '4 -> 3');
  assert.strictEqual(prevTab(3), 2, '3 -> 2');
  assert.strictEqual(prevTab(2), 1, '2 -> 1');
  assert.strictEqual(prevTab(1), 0, '1 -> 0');

  // Test wrap-around
  assert.strictEqual(prevTab(0), 6, '0 wraps to 6');

  // Test full cycle backwards
  let current = 0;
  for (let i = 0; i < 7; i++) {
    current = prevTab(current);
  }
  assert.strictEqual(current, 0, 'Full backwards cycle returns to start');

  console.log('✓ prevTab()');
}

// Test nextTab and prevTab are inverse operations
function testNextPrevInverse() {
  // nextTab followed by prevTab should return to original
  for (let i = 0; i < 7; i++) {
    const afterNext = nextTab(i);
    const backToOriginal = prevTab(afterNext);
    assert.strictEqual(backToOriginal, i, `nextTab then prevTab from ${i} returns to ${i}`);
  }

  // prevTab followed by nextTab should return to original
  for (let i = 0; i < 7; i++) {
    const afterPrev = prevTab(i);
    const backToOriginal = nextTab(afterPrev);
    assert.strictEqual(backToOriginal, i, `prevTab then nextTab from ${i} returns to ${i}`);
  }

  console.log('✓ nextTab/prevTab inverse operations');
}

// Test edge cases and boundary conditions
function testEdgeCases() {
  // Test that TABS is not modified by getTabNames
  const originalLength = TABS.length;
  const names = getTabNames();
  names.push('ShouldNotAffectTABS');
  assert.strictEqual(TABS.length, originalLength, 'TABS not affected by modifying getTabNames result');

  // Test getTabById with various falsy values
  assert.strictEqual(getTabById(null), undefined, 'null returns undefined');
  assert.strictEqual(getTabById(undefined), undefined, 'undefined returns undefined');

  // Test getTabIndex with case sensitivity
  assert.strictEqual(getTabIndex('Overview'), -1, 'Case sensitive - uppercase not found');
  assert.strictEqual(getTabIndex('OVERVIEW'), -1, 'Case sensitive - all caps not found');

  console.log('✓ Edge cases and boundary conditions');
}

// Run all tests
console.log('\nTab System Tests\n');
testTabsConstant();
testGetTabNames();
testGetTabById();
testGetTabByIndex();
testGetTabIndex();
testNextTab();
testPrevTab();
testNextPrevInverse();
testEdgeCases();
console.log('\nAll tab tests passed!\n');
