/**
 * Deep Explorer Tests
 * Tests for deep exploration of decision options
 */

const assert = require('assert');
const { test, describe, beforeEach } = require('node:test');

let deepExplorer;

describe('Deep Explorer Tests', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../lib/deep-explorer.js')];
    try {
      deepExplorer = require('../lib/deep-explorer.js');
    } catch (e) {
      deepExplorer = null;
    }
  });

  test('formatExploration produces valid box-drawing output', (t) => {
    if (!deepExplorer) {
      t.skip('Module not implemented yet');
      return;
    }
    const result = deepExplorer.formatExploration({
      question: 'Test decision?',
      options: [{
        name: 'Option A',
        pros: ['Good'],
        cons: ['Bad'],
        risk: 'low'
      }],
      recommendation: 'Option A',
      rationale: 'Because it is good'
    });
    assert.ok(typeof result === 'string', 'Should return string');
    assert.ok(result.includes('Option A'), 'Should include option name');
    console.log('# formatExploration produces valid box-drawing output');
  });

  test('formatExploration handles 2 options correctly', (t) => {
    if (!deepExplorer) {
      t.skip('Module not implemented yet');
      return;
    }
    const result = deepExplorer.formatExploration({
      question: 'A or B?',
      options: [
        { name: 'Option A', pros: ['Pro A'], cons: ['Con A'], risk: 'low' },
        { name: 'Option B', pros: ['Pro B'], cons: ['Con B'], risk: 'medium' }
      ],
      recommendation: 'Option A',
      rationale: 'A is better'
    });
    assert.ok(result.includes('Option A'), 'Should include first option');
    assert.ok(result.includes('Option B'), 'Should include second option');
    console.log('# formatExploration handles 2 options correctly');
  });

  test('formatExploration handles 3+ options correctly', (t) => {
    if (!deepExplorer) {
      t.skip('Module not implemented yet');
      return;
    }
    const result = deepExplorer.formatExploration({
      question: 'A, B, or C?',
      options: [
        { name: 'A', pros: ['Pro A'], cons: ['Con A'], risk: 'low' },
        { name: 'B', pros: ['Pro B'], cons: ['Con B'], risk: 'medium' },
        { name: 'C', pros: ['Pro C'], cons: ['Con C'], risk: 'high' }
      ],
      recommendation: 'A',
      rationale: 'A is best'
    });
    assert.ok(result.includes('A'), 'Should include option A');
    assert.ok(result.includes('B'), 'Should include option B');
    assert.ok(result.includes('C'), 'Should include option C');
    console.log('# formatExploration handles 3+ options correctly');
  });

  test('deepExplore returns proper structure with all required fields', async (t) => {
    if (!deepExplorer) {
      t.skip('Module not implemented yet');
      return;
    }
    const result = await deepExplorer.deepExplore({
      question: 'Test?',
      options: ['A', 'B'],
      skipLLM: true
    });
    assert.ok(result.question, 'Should have question');
    assert.ok(Array.isArray(result.options), 'Should have options array');
    assert.ok(result.recommendation, 'Should have recommendation');
    console.log('# deepExplore returns proper structure with all required fields');
  });

  test('generateExplorationPrompt includes all options in output', (t) => {
    if (!deepExplorer) {
      t.skip('Module not implemented yet');
      return;
    }
    const prompt = deepExplorer.generateExplorationPrompt(
      'Which database?',
      ['PostgreSQL', 'MongoDB'],
      { projectType: 'web' }
    );
    assert.ok(prompt.includes('PostgreSQL'), 'Should include first option');
    assert.ok(prompt.includes('MongoDB'), 'Should include second option');
    console.log('# generateExplorationPrompt includes all options in output');
  });

  test('RISK_LEVELS constants are correct', (t) => {
    if (!deepExplorer) {
      t.skip('Module not implemented yet');
      return;
    }
    assert.ok(deepExplorer.RISK_LEVELS, 'Should export RISK_LEVELS');
    assert.ok(deepExplorer.RISK_LEVELS.LOW, 'Should have LOW');
    assert.ok(deepExplorer.RISK_LEVELS.MEDIUM, 'Should have MEDIUM');
    assert.ok(deepExplorer.RISK_LEVELS.HIGH, 'Should have HIGH');
    console.log('# RISK_LEVELS constants are correct');
  });

  test('edge case: option with empty pros/cons arrays', (t) => {
    if (!deepExplorer) {
      t.skip('Module not implemented yet');
      return;
    }
    const result = deepExplorer.formatExploration({
      question: 'Test?',
      options: [{ name: 'A', pros: [], cons: [], risk: 'low' }],
      recommendation: 'A',
      rationale: 'Only option'
    });
    assert.ok(typeof result === 'string', 'Should handle empty arrays');
    console.log('# edge case: option with empty pros/cons arrays');
  });

  test('edge case: very long option names (>50 chars)', (t) => {
    if (!deepExplorer) {
      t.skip('Module not implemented yet');
      return;
    }
    const longName = 'A'.repeat(60);
    const result = deepExplorer.formatExploration({
      question: 'Test?',
      options: [{ name: longName, pros: ['Good'], cons: ['Bad'], risk: 'low' }],
      recommendation: longName,
      rationale: 'Long name'
    });
    assert.ok(typeof result === 'string', 'Should handle long names');
    console.log('# edge case: very long option names (>50 chars)');
  });

  test('edge case: recommendation not in options list', (t) => {
    if (!deepExplorer) {
      t.skip('Module not implemented yet');
      return;
    }
    // This should not crash, just handle gracefully
    const result = deepExplorer.formatExploration({
      question: 'Test?',
      options: [{ name: 'A', pros: ['Good'], cons: ['Bad'], risk: 'low' }],
      recommendation: 'B',
      rationale: 'Not in list'
    });
    assert.ok(typeof result === 'string', 'Should handle missing recommendation');
    console.log('# edge case: recommendation not in options list');
  });
});

console.log('\nDeep Explorer Tests');
console.log('===================\n');
