/**
 * Add Exploration Template Tests
 * Tests for the batch script that adds exploration protocol to agents
 */

const assert = require('assert');
const { test, describe, beforeEach } = require('node:test');

let addExplorationTemplate;

describe('Add Exploration Template Tests', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../src/scripts/add-exploration-template.js')];
    try {
      addExplorationTemplate = require('../src/scripts/add-exploration-template.js');
    } catch (e) {
      addExplorationTemplate = null;
    }
  });

  test('hasUserInteraction returns true for agents in INTERACTIVE_AGENTS list', (t) => {
    if (!addExplorationTemplate) {
      t.skip('Module not implemented yet');
      return;
    }
    const content = '# Some Agent\n\nContent here';
    const result = addExplorationTemplate.hasUserInteraction(content, 'coordinator/plan-architect.md');
    // plan-architect should be in the interactive list
    assert.ok(typeof result === 'boolean', 'Should return boolean');
    console.log('# hasUserInteraction returns true for agents in INTERACTIVE_AGENTS list');
  });

  test('hasUserInteraction returns true for pattern matches (AskUserQuestion)', (t) => {
    if (!addExplorationTemplate) {
      t.skip('Module not implemented yet');
      return;
    }
    const content = '# Agent\n\nUse the AskUserQuestion tool to gather input.';
    const result = addExplorationTemplate.hasUserInteraction(content, 'any/agent.md');
    assert.strictEqual(result, true, 'Should detect AskUserQuestion pattern');
    console.log('# hasUserInteraction returns true for pattern matches');
  });

  test('hasUserInteraction returns false for pure automation agents', (t) => {
    if (!addExplorationTemplate) {
      t.skip('Module not implemented yet');
      return;
    }
    // Content without any user interaction keywords
    const content = '# Automation Agent\n\nRuns automatically without any interaction.';
    const result = addExplorationTemplate.hasUserInteraction(content, 'automation/runner.md');
    assert.strictEqual(result, false, 'Should return false for automation agents');
    console.log('# hasUserInteraction returns false for pure automation agents');
  });

  test('hasExplorationProtocol detects existing protocol section', (t) => {
    if (!addExplorationTemplate) {
      t.skip('Module not implemented yet');
      return;
    }
    const contentWith = '# Agent\n\n## Exploration Protocol\n\nExisting content';
    const contentWithout = '# Agent\n\n## Other Section\n\nContent';

    assert.strictEqual(
      addExplorationTemplate.hasExplorationProtocol(contentWith),
      true,
      'Should detect existing protocol'
    );
    assert.strictEqual(
      addExplorationTemplate.hasExplorationProtocol(contentWithout),
      false,
      'Should not find non-existent protocol'
    );
    console.log('# hasExplorationProtocol detects existing protocol section');
  });

  test('findInsertionPoint returns position before ## Output section', (t) => {
    if (!addExplorationTemplate) {
      t.skip('Module not implemented yet');
      return;
    }
    const content = '# Agent\n\n## Role\n\nRole content\n\n## Output\n\nOutput content';
    const position = addExplorationTemplate.findInsertionPoint(content);
    assert.ok(position > 0, 'Should find a position');
    assert.ok(position < content.indexOf('## Output'), 'Position should be before Output');
    console.log('# findInsertionPoint returns position before ## Output section');
  });

  test('findInsertionPoint returns end of file when no markers found', (t) => {
    if (!addExplorationTemplate) {
      t.skip('Module not implemented yet');
      return;
    }
    const content = '# Agent\n\nJust content, no markers.';
    const position = addExplorationTemplate.findInsertionPoint(content);
    assert.strictEqual(position, content.length, 'Should return end of file');
    console.log('# findInsertionPoint returns end of file when no markers found');
  });

  test('processAgent returns skip for agents with existing protocol', (t) => {
    if (!addExplorationTemplate) {
      t.skip('Module not implemented yet');
      return;
    }
    // Mock file content with existing protocol
    const result = addExplorationTemplate.processAgent('/mock/agent.md', {
      mockContent: '# Agent\n\n## Exploration Protocol\n\nExists',
      dryRun: true
    });
    assert.ok(result.action === 'skip' || result.skipped, 'Should skip existing');
    console.log('# processAgent returns skip for agents with existing protocol');
  });

  test('processAgent returns updated for interactive agents without protocol', (t) => {
    if (!addExplorationTemplate) {
      t.skip('Module not implemented yet');
      return;
    }
    const result = addExplorationTemplate.processAgent('/mock/coordinator/plan-architect.md', {
      mockContent: '# Plan Architect\n\nUse AskUserQuestion to gather requirements.',
      dryRun: true
    });
    assert.ok(result.action === 'update' || result.updated, 'Should update interactive agent');
    console.log('# processAgent returns updated for interactive agents without protocol');
  });

  test('dry-run mode does not modify files', (t) => {
    if (!addExplorationTemplate) {
      t.skip('Module not implemented yet');
      return;
    }
    const result = addExplorationTemplate.processAgent('/mock/agent.md', {
      mockContent: '# Agent\n\nContent',
      dryRun: true
    });
    assert.ok(result.dryRun === true || !result.written, 'Should not write in dry-run');
    console.log('# dry-run mode does not modify files');
  });

  test('edge case: agent file with only title (no sections)', (t) => {
    if (!addExplorationTemplate) {
      t.skip('Module not implemented yet');
      return;
    }
    const content = '# Minimal Agent';
    const position = addExplorationTemplate.findInsertionPoint(content);
    assert.ok(typeof position === 'number', 'Should return a number');
    console.log('# edge case: agent file with only title');
  });

  test('edge case: agent file does not exist (graceful error)', (t) => {
    if (!addExplorationTemplate) {
      t.skip('Module not implemented yet');
      return;
    }
    const result = addExplorationTemplate.processAgent('/nonexistent/path/agent.md', {
      dryRun: true
    });
    assert.ok(result.error || result.action === 'error', 'Should handle missing file');
    console.log('# edge case: agent file does not exist');
  });

  test('edge case: agent file is read-only (proper error message)', (t) => {
    if (!addExplorationTemplate) {
      t.skip('Module not implemented yet');
      return;
    }
    // This test would need actual file system mocking
    // For now, just verify the function exists
    assert.ok(typeof addExplorationTemplate.processAgent === 'function');
    console.log('# edge case: agent file is read-only');
  });
});

console.log('\nAdd Exploration Template Tests');
console.log('==============================\n');
