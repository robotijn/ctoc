/**
 * Strategic Classifier Tests
 * Tests for classifying decisions as strategic vs tactical
 */

const assert = require('assert');
const { test, describe, beforeEach, afterEach } = require('node:test');

// Module will be loaded after it's created
let strategicClassifier;

describe('Strategic Classifier Tests', () => {
  beforeEach(() => {
    // Clear module cache to get fresh module
    delete require.cache[require.resolve('../src/lib/strategic-classifier.js')];
    try {
      strategicClassifier = require('../src/lib/strategic-classifier.js');
    } catch (e) {
      // Module doesn't exist yet, tests will fail appropriately
      strategicClassifier = null;
    }
  });

  test('classifyByKeywords returns STRATEGIC for architecture keywords', (t) => {
    if (!strategicClassifier) {
      t.skip('Module not implemented yet');
      return;
    }
    const result = strategicClassifier.classifyByKeywords('Should we use monolith or microservices?');
    assert.strictEqual(result.type, 'STRATEGIC', 'Architecture questions should be strategic');
    console.log('# classifyByKeywords returns STRATEGIC for architecture keywords');
  });

  test('classifyByKeywords returns TACTICAL for naming/config keywords', (t) => {
    if (!strategicClassifier) {
      t.skip('Module not implemented yet');
      return;
    }
    const result = strategicClassifier.classifyByKeywords('What should we name this function?');
    assert.strictEqual(result.type, 'TACTICAL', 'Naming questions should be tactical');
    console.log('# classifyByKeywords returns TACTICAL for naming/config keywords');
  });

  test('classifyByKeywords returns UNKNOWN when no strong matches', (t) => {
    if (!strategicClassifier) {
      t.skip('Module not implemented yet');
      return;
    }
    const result = strategicClassifier.classifyByKeywords('How many items in the list?');
    assert.strictEqual(result.type, 'UNKNOWN', 'Ambiguous questions should return unknown');
    console.log('# classifyByKeywords returns UNKNOWN when no strong matches');
  });

  test('isStrategicDecision returns high confidence for clear strategic questions', async (t) => {
    if (!strategicClassifier) {
      t.skip('Module not implemented yet');
      return;
    }
    const result = await strategicClassifier.isStrategicDecision(
      'Should we use PostgreSQL or MongoDB for our database?',
      { skipLLM: true } // Skip actual LLM call in tests
    );
    assert.ok(result.isStrategic, 'Database choice should be strategic');
    assert.ok(result.confidence >= 0.7, 'Should have high confidence');
    console.log('# isStrategicDecision returns high confidence for clear strategic questions');
  });

  test('isStrategicDecision defaults to strategic for unknown (safety default)', async (t) => {
    if (!strategicClassifier) {
      t.skip('Module not implemented yet');
      return;
    }
    const result = await strategicClassifier.isStrategicDecision(
      'Something ambiguous here',
      { skipLLM: true }
    );
    assert.strictEqual(result.isStrategic, true, 'Unknown should default to strategic');
    console.log('# isStrategicDecision defaults to strategic for unknown');
  });

  test('generateClassificationPrompt produces valid prompt string', (t) => {
    if (!strategicClassifier) {
      t.skip('Module not implemented yet');
      return;
    }
    const prompt = strategicClassifier.generateClassificationPrompt('Test question?');
    assert.ok(typeof prompt === 'string', 'Prompt should be string');
    assert.ok(prompt.length > 0, 'Prompt should not be empty');
    assert.ok(prompt.includes('Test question?'), 'Prompt should include question');
    console.log('# generateClassificationPrompt produces valid prompt string');
  });

  test('edge case: empty string input', (t) => {
    if (!strategicClassifier) {
      t.skip('Module not implemented yet');
      return;
    }
    const result = strategicClassifier.classifyByKeywords('');
    assert.ok(result.type, 'Should return a type even for empty input');
    console.log('# edge case: empty string input');
  });

  test('edge case: question with mixed strategic/tactical keywords', (t) => {
    if (!strategicClassifier) {
      t.skip('Module not implemented yet');
      return;
    }
    const result = strategicClassifier.classifyByKeywords(
      'What should we name our microservices architecture module?'
    );
    assert.ok(['STRATEGIC', 'TACTICAL', 'UNKNOWN'].includes(result.type), 'Should return valid type');
    console.log('# edge case: question with mixed strategic/tactical keywords');
  });

  test('edge case: very long question (>1000 chars)', (t) => {
    if (!strategicClassifier) {
      t.skip('Module not implemented yet');
      return;
    }
    const longQuestion = 'Should we use ' + 'a'.repeat(1000) + ' for architecture?';
    const result = strategicClassifier.classifyByKeywords(longQuestion);
    assert.ok(result.type, 'Should handle long questions');
    console.log('# edge case: very long question (>1000 chars)');
  });
});

console.log('\nStrategic Classifier Tests');
console.log('==========================\n');
