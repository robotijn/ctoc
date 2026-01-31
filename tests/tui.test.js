/**
 * TUI Engine Tests
 */

const assert = require('assert');
const tui = require('../lib/tui.js');

// Test color codes
function testColors() {
  assert.strictEqual(tui.c.reset, '\x1b[0m', 'Reset code correct');
  assert.strictEqual(tui.c.bold, '\x1b[1m', 'Bold code correct');
  assert.strictEqual(tui.c.green, '\x1b[32m', 'Green code correct');
  assert.strictEqual(tui.c.red, '\x1b[31m', 'Red code correct');
  console.log('  - Color codes');
}

// Test line drawing
function testLineDrawing() {
  const width = 80;
  const lineOutput = tui.line(width);
  // Line includes ANSI codes, extract the visible part
  assert.ok(lineOutput.includes('─'.repeat(width)), 'Line contains correct characters');
  console.log('  - Line drawing');
}

// Test tab rendering
function testTabRendering() {
  const tabs = ['Overview', 'Functional', 'Implementation'];
  const output = tui.renderTabs(tabs, 0);

  assert.ok(output.includes('Overview'), 'Contains Overview tab');
  assert.ok(output.includes('Functional'), 'Contains Functional tab');
  assert.ok(output.includes('Implementation'), 'Contains Implementation tab');
  console.log('  - Tab rendering');
}

// Test pagination helper
function testPaginate() {
  // Test with 15 items, page size 9
  const items = Array.from({ length: 15 }, (_, i) => `item-${i + 1}`);

  // First page
  const page0 = tui.paginate(items, 0, 9);
  assert.strictEqual(page0.items.length, 9, 'First page has 9 items');
  assert.strictEqual(page0.page, 0, 'Page index is 0');
  assert.strictEqual(page0.totalPages, 2, 'Total pages is 2');
  assert.strictEqual(page0.hasNext, true, 'Has next page');
  assert.strictEqual(page0.hasPrev, false, 'No previous page');
  assert.strictEqual(page0.startIndex, 0, 'Start index is 0');
  assert.strictEqual(page0.endIndex, 8, 'End index is 8');
  assert.strictEqual(page0.items[0], 'item-1', 'First item correct');
  assert.strictEqual(page0.items[8], 'item-9', 'Last item on page correct');

  // Second page
  const page1 = tui.paginate(items, 1, 9);
  assert.strictEqual(page1.items.length, 6, 'Second page has 6 items');
  assert.strictEqual(page1.page, 1, 'Page index is 1');
  assert.strictEqual(page1.hasNext, false, 'No next page');
  assert.strictEqual(page1.hasPrev, true, 'Has previous page');
  assert.strictEqual(page1.startIndex, 9, 'Start index is 9');
  assert.strictEqual(page1.endIndex, 14, 'End index is 14');
  assert.strictEqual(page1.items[0], 'item-10', 'First item on page 2 correct');

  // Test edge case: empty array
  const empty = tui.paginate([], 0, 9);
  assert.strictEqual(empty.items.length, 0, 'Empty array returns empty items');
  assert.strictEqual(empty.totalPages, 0, 'Empty array has 0 pages');

  // Test edge case: less than page size
  const small = tui.paginate(['a', 'b', 'c'], 0, 9);
  assert.strictEqual(small.items.length, 3, 'Small array returns all items');
  assert.strictEqual(small.totalPages, 1, 'Small array has 1 page');
  assert.strictEqual(small.hasNext, false, 'Small array has no next');
  assert.strictEqual(small.hasPrev, false, 'Small array has no prev');

  // Test edge case: page out of bounds
  const outOfBounds = tui.paginate(items, 10, 9);
  assert.strictEqual(outOfBounds.page, 1, 'Out of bounds page clamped to last page');

  console.log('  - Pagination helper');
}

// Test pagination controls rendering
function testRenderPaginationControls() {
  // With next only
  const state1 = { hasNext: true, hasPrev: false, page: 0, totalPages: 3 };
  const output1 = tui.renderPaginationControls(state1, { showBack: true });
  assert.ok(output1.includes('[0] back'), 'Shows back option');
  assert.ok(output1.includes('[n] next'), 'Shows next option');
  assert.ok(!output1.includes('[p] prev'), 'Does not show prev');
  assert.ok(output1.includes('page 1/3'), 'Shows page numbers');

  // With prev only
  const state2 = { hasNext: false, hasPrev: true, page: 2, totalPages: 3 };
  const output2 = tui.renderPaginationControls(state2, { showBack: true });
  assert.ok(output2.includes('[p] prev'), 'Shows prev option');
  assert.ok(!output2.includes('[n] next'), 'Does not show next');
  assert.ok(output2.includes('page 3/3'), 'Shows correct page');

  // With both
  const state3 = { hasNext: true, hasPrev: true, page: 1, totalPages: 3 };
  const output3 = tui.renderPaginationControls(state3, { showBack: true });
  assert.ok(output3.includes('[p] prev'), 'Shows prev');
  assert.ok(output3.includes('[n] next'), 'Shows next');

  // Without back button
  const output4 = tui.renderPaginationControls(state3, { showBack: false });
  assert.ok(!output4.includes('[0] back'), 'Does not show back when disabled');

  // Single page (no pagination needed)
  const state5 = { hasNext: false, hasPrev: false, page: 0, totalPages: 1 };
  const output5 = tui.renderPaginationControls(state5, { showBack: false });
  assert.strictEqual(output5, '', 'Empty output for single page without back');

  console.log('  - Pagination controls');
}

// Test renderList with simple items
function testRenderListSimple() {
  const items = ['Plan A', 'Plan B', 'Plan C'];
  const output = tui.renderList(items, 0, { showNumbers: true });

  // Check structure
  assert.ok(output.includes('[1] Plan A'), 'Contains numbered item 1');
  assert.ok(output.includes('[2] Plan B'), 'Contains numbered item 2');
  assert.ok(output.includes('[3] Plan C'), 'Contains numbered item 3');

  // Check selection arrow
  const lines = output.split('\n');
  assert.ok(lines[0].startsWith('\u2192'), 'First item has selection arrow');

  console.log('  - renderList simple items');
}

// Test renderList with object items
function testRenderListObjects() {
  const items = [
    { name: '2026-01-31-001-plan.md', ago: '2h ago' },
    { name: '2026-01-30-002-feature.md', ago: '1d ago' }
  ];
  const output = tui.renderList(items, 1, { showNumbers: true });

  assert.ok(output.includes('2026-01-31-001-plan.md'), 'Contains first plan name');
  assert.ok(output.includes('2026-01-30-002-feature.md'), 'Contains second plan name');
  assert.ok(output.includes('2h ago'), 'Contains first ago');
  assert.ok(output.includes('1d ago'), 'Contains second ago');

  // Second item should have the arrow
  const lines = output.split('\n').filter(l => l.trim());
  assert.ok(!lines[0].startsWith('\u2192'), 'First item not selected');
  assert.ok(lines[1].startsWith('\u2192'), 'Second item selected');

  console.log('  - renderList object items');
}

// Test renderList empty state
function testRenderListEmpty() {
  const output = tui.renderList([], 0, { emptyMessage: 'No plans found.' });
  assert.ok(output.includes('No plans found.'), 'Shows empty message');
  console.log('  - renderList empty state');
}

// Test renderList without numbers
function testRenderListNoNumbers() {
  const items = ['Item A', 'Item B'];
  const output = tui.renderList(items, 0, { showNumbers: false });
  assert.ok(!output.includes('[1]'), 'No number prefix');
  assert.ok(output.includes('Item A'), 'Contains item text');
  console.log('  - renderList without numbers');
}

// Test renderList with pagination
function testRenderListPagination() {
  const items = Array.from({ length: 15 }, (_, i) => `Plan ${i + 1}`);

  // First page
  const output0 = tui.renderList(items, 0, { page: 0, pageSize: 9, showBack: true });
  assert.ok(output0.includes('[1] Plan 1'), 'First page has Plan 1');
  assert.ok(output0.includes('[9] Plan 9'), 'First page has Plan 9');
  assert.ok(!output0.includes('Plan 10'), 'First page does not have Plan 10');
  assert.ok(output0.includes('[n] next'), 'Shows next control');
  assert.ok(!output0.includes('[p] prev'), 'Does not show prev on first page');
  assert.ok(output0.includes('[0] back'), 'Shows back control');

  // Second page
  const output1 = tui.renderList(items, 9, { page: 1, pageSize: 9, showBack: true });
  assert.ok(output1.includes('[1] Plan 10'), 'Second page starts with Plan 10');
  assert.ok(output1.includes('Plan 15'), 'Second page has Plan 15');
  assert.ok(!output1.includes('[9]'), 'Second page does not have 9 items');
  assert.ok(!output1.includes('[n] next'), 'Does not show next on last page');
  assert.ok(output1.includes('[p] prev'), 'Shows prev control');

  console.log('  - renderList with pagination');
}

// Test renderActionMenu basic
function testRenderActionMenuBasic() {
  const actions = [
    { label: 'View plan contents', key: '1' },
    { label: 'Edit plan', key: '2' },
    { label: 'Approve plan', key: '3' }
  ];

  const output = tui.renderActionMenu('Selected: test-plan.md', actions, 0);

  assert.ok(output.includes('Selected: test-plan.md'), 'Contains title');
  assert.ok(output.includes('1. View plan contents'), 'Contains action 1');
  assert.ok(output.includes('2. Edit plan'), 'Contains action 2');
  assert.ok(output.includes('3. Approve plan'), 'Contains action 3');
  assert.ok(output.includes('select'), 'Contains select hint');
  assert.ok(output.includes('Enter confirm'), 'Contains confirm hint');

  console.log('  - renderActionMenu basic');
}

// Test renderActionMenu with danger action
function testRenderActionMenuDanger() {
  const actions = [
    { label: 'View', key: '1' },
    { separator: true },
    { label: 'Delete permanently', key: '5', danger: true }
  ];

  const output = tui.renderActionMenu('Danger Zone', actions, 2);

  assert.ok(output.includes('Danger Zone'), 'Contains title');
  assert.ok(output.includes('View'), 'Contains normal action');
  assert.ok(output.includes('Delete permanently'), 'Contains danger action');
  // The danger action should be styled with red (ANSI code)
  assert.ok(output.includes('\x1b[31m'), 'Contains red color for danger');

  console.log('  - renderActionMenu danger action');
}

// Test renderActionMenu selection indicator
function testRenderActionMenuSelection() {
  const actions = [
    { label: 'First', key: '1' },
    { label: 'Second', key: '2' },
    { label: 'Third', key: '3' }
  ];

  // Selected index 1 (Second)
  const output = tui.renderActionMenu('Test', actions, 1);
  const lines = output.split('\n').filter(l => l.trim() && !l.includes('Test') && !l.includes('─') && !l.includes('select'));

  // Find lines with actions
  const actionLines = lines.filter(l => l.includes('First') || l.includes('Second') || l.includes('Third'));
  assert.ok(actionLines[0].includes('  1.'), 'First not selected (has space prefix)');
  assert.ok(actionLines[1].startsWith('\u2192'), 'Second selected (has arrow)');
  assert.ok(actionLines[2].includes('  3.'), 'Third not selected');

  console.log('  - renderActionMenu selection indicator');
}

// Test renderConfirm
function testRenderConfirm() {
  const options = [
    { label: 'Keep it' },
    { label: 'Delete it', danger: true }
  ];

  const output = tui.renderConfirm('Are you sure?', 'This will delete the plan.', options);

  assert.ok(output.includes('Are you sure?'), 'Contains title');
  assert.ok(output.includes('This will delete the plan.'), 'Contains message');
  assert.ok(output.includes('1. Keep it'), 'Contains option 1');
  assert.ok(output.includes('2. Delete it'), 'Contains option 2');
  assert.ok(output.includes('\x1b[31m'), 'Danger option in red');
  assert.ok(output.includes('Enter 1-2'), 'Shows input hint');

  console.log('  - renderConfirm');
}

// Test renderInput
function testRenderInput() {
  const output = tui.renderInput('Enter plan title:', 'My New Plan');

  assert.ok(output.includes('Enter plan title:'), 'Contains prompt');
  assert.ok(output.includes('> My New Plan'), 'Contains current value');
  assert.ok(output.includes('Enter to submit'), 'Contains submit hint');

  console.log('  - renderInput');
}

// Test renderBreadcrumb
function testRenderBreadcrumb() {
  const path = ['Plans', 'Functional', 'Draft'];
  const output = tui.renderBreadcrumb(path);

  assert.ok(output.includes('Plans'), 'Contains first crumb');
  assert.ok(output.includes('Functional'), 'Contains second crumb');
  assert.ok(output.includes('Draft'), 'Contains third crumb');
  assert.ok(output.includes('\u203a'), 'Contains separator');

  console.log('  - renderBreadcrumb');
}

// Test renderFooter
function testRenderFooter() {
  const hints = ['[1-9] select', '[0] back', '[q] quit'];
  const output = tui.renderFooter(hints);

  assert.ok(output.includes('[1-9] select'), 'Contains first hint');
  assert.ok(output.includes('[0] back'), 'Contains second hint');
  assert.ok(output.includes('[q] quit'), 'Contains third hint');
  assert.ok(output.includes('\xb7'), 'Contains dot separator');

  console.log('  - renderFooter');
}

// Run all tests
console.log('\nTUI Engine Tests\n');

console.log('Basic rendering:');
testColors();
testLineDrawing();
testTabRendering();

console.log('\nPagination:');
testPaginate();
testRenderPaginationControls();

console.log('\nrenderList:');
testRenderListSimple();
testRenderListObjects();
testRenderListEmpty();
testRenderListNoNumbers();
testRenderListPagination();

console.log('\nrenderActionMenu:');
testRenderActionMenuBasic();
testRenderActionMenuDanger();
testRenderActionMenuSelection();

console.log('\nOther render functions:');
testRenderConfirm();
testRenderInput();
testRenderBreadcrumb();
testRenderFooter();

console.log('\nAll TUI tests passed!\n');
