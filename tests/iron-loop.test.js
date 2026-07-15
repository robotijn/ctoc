/**
 * Iron Loop — real-behavior tests for the plan-marker/validation surface.
 *
 * HISTORY: this file previously carried seven "Existing integration tests"
 * (testIntegrateReturnsValidMarkdown, testCritiqueReturnsScoresObject,
 * testRefineLoop*, testGetNextFromTodoFifo, testSetAgentStatusWritesToState,
 * testClearAgentStatusResetsState) that asserted on hand-written literals
 * labelled "Simulated … result" — they never called the module and were pure
 * false green. They were deleted; the REAL behaviour they claimed to cover now
 * lives in tests/iron-loop-coverage.test.js (integrate/critique/refineLoop/
 * scoreCompleteness driven against the actual exports) and tests/state-coverage.test.js
 * (getNextFromTodo/agent-status driven against the actual state module).
 *
 * What remains here are the tests that always drove real functions —
 * hasIronLoopSteps, validateForTodo, generateIronLoopTemplate, IRON_LOOP_MARKER —
 * converted from the old console.log harness to node:test so they are counted and
 * isolated. Together with iron-loop-coverage.test.js this pins src/lib/iron-loop.js.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  hasIronLoopSteps,
  validateForTodo,
  generateIronLoopTemplate,
  IRON_LOOP_MARKER,
} = require('../src/lib/iron-loop');

function createTempPlan(content) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iron-loop-test-'));
  const tempFile = path.join(tempDir, 'test-plan.md');
  fs.writeFileSync(tempFile, content);
  return tempFile;
}

function cleanupTempFile(filePath) {
  try {
    fs.unlinkSync(filePath);
    fs.rmdirSync(path.dirname(filePath));
  } catch {
    /* best-effort */
  }
}

test('hasIronLoopSteps returns false when the marker is absent', () => {
  const tempFile = createTempPlan('# Test Plan\n\n## Problem Statement\nNeed feature X.\n');
  try {
    assert.equal(hasIronLoopSteps(tempFile), false);
  } finally {
    cleanupTempFile(tempFile);
  }
});

test('hasIronLoopSteps returns true when the marker is present', () => {
  const tempFile = createTempPlan(`# Test Plan\n\n${IRON_LOOP_MARKER}\n\n### Step 8: TEST\n- [ ] Write tests\n`);
  try {
    assert.equal(hasIronLoopSteps(tempFile), true);
  } finally {
    cleanupTempFile(tempFile);
  }
});

test('validateForTodo rejects a plan missing the Iron Loop steps', () => {
  const tempFile = createTempPlan('# Test Plan\n\n## Problem Statement\nNeed feature X.\n');
  try {
    const result = validateForTodo(tempFile);
    assert.equal(result.valid, false);
    assert.ok(result.error, 'an invalid plan must carry an error message');
    assert.match(result.error, /missing/, 'error names the missing steps');
  } finally {
    cleanupTempFile(tempFile);
  }
});

test('validateForTodo accepts a plan that carries the marker and steps', () => {
  const tempFile = createTempPlan(`# Test Plan\n\n${IRON_LOOP_MARKER}\n\n### Step 8: TEST\n- [ ] Write tests\n`);
  try {
    const result = validateForTodo(tempFile);
    assert.equal(result.valid, true);
    assert.equal(result.error, undefined, 'a valid plan carries no error');
  } finally {
    cleanupTempFile(tempFile);
  }
});

test('generateIronLoopTemplate emits the marker and every Step 8..16 label', () => {
  const template = generateIronLoopTemplate('# Test Plan');
  assert.ok(template.includes(IRON_LOOP_MARKER), 'template embeds the marker');
  // A mutant that drops any single step label goes RED here — the whole 8..16
  // sequence is the contract, not just "some step".
  for (let step = 8; step <= 16; step++) {
    assert.ok(template.includes(`Step ${step}:`), `template includes Step ${step}`);
  }
  assert.ok(template.includes('- [ ]'), 'template includes actionable checkboxes');
});

test('IRON_LOOP_MARKER is a non-empty string that names the Iron Loop', () => {
  assert.equal(typeof IRON_LOOP_MARKER, 'string');
  assert.ok(IRON_LOOP_MARKER.length > 0, 'marker is non-empty');
  assert.match(IRON_LOOP_MARKER, /Iron Loop/, 'marker text identifies the Iron Loop');
});
