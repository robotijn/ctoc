/**
 * MCP Server Tests
 * Step 7: TEST - Write failing tests first (TDD Red)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..');
const STATE_DIR = path.join(REPO_ROOT, '.ctoc', 'state');
const STATE_FILE = path.join(STATE_DIR, 'iron-loop.json');

// Test helpers
function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function cleanState() {
  try { fs.unlinkSync(STATE_FILE); } catch {}
}

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

// Mock callTool helper
async function callTool(name, args = {}) {
  const { handleToolCall } = await import('../tools.js');
  const result = await handleToolCall({
    params: { name, arguments: args }
  });
  return result.content[0].text;
}

describe('MCP Server', () => {
  beforeEach(() => {
    ensureStateDir();
    cleanState();
  });

  afterEach(() => {
    cleanState();
  });

  describe('Read-only tools', () => {
    it('ctoc_status returns ASCII output', async () => {
      const result = await callTool('ctoc_status', {});
      assert.ok(result.includes('CTOC'), 'Should contain CTOC');
      assert.ok(result.includes('Project:'), 'Should contain Project');
    });

    it('ctoc_admin returns dashboard', async () => {
      const result = await callTool('ctoc_admin', {});
      assert.ok(result.includes('ADMIN') || result.includes('KANBAN') || result.includes('CTOC'));
    });

    it('ctoc_kanban returns kanban board', async () => {
      const result = await callTool('ctoc_kanban', {});
      assert.ok(result.includes('BACKLOG') || result.includes('KANBAN') || result.includes('Legend'));
    });

    it('ctoc_progress returns Iron Loop progress', async () => {
      const result = await callTool('ctoc_progress', {});
      assert.ok(result.includes('Iron Loop') || result.includes('Progress') || result.includes('No feature'));
    });

    it('ctoc_plan_status returns plan dashboard', async () => {
      const result = await callTool('ctoc_plan_status', {});
      assert.ok(result.includes('Plan') || result.includes('Dashboard'));
    });

    it('ctoc_doctor returns health check', async () => {
      const result = await callTool('ctoc_doctor', {});
      assert.ok(result.includes('Doctor') || result.includes('Health') || result.includes('CTOC'));
    });
  });

  describe('State management tools', () => {
    it('ctoc_start creates Iron Loop state', async () => {
      await callTool('ctoc_start', { feature: 'test-feature' });
      const state = readState();
      assert.strictEqual(state.feature, 'test-feature');
      assert.strictEqual(state.step, 1);
    });

    it('ctoc_step updates step number', async () => {
      await callTool('ctoc_start', { feature: 'test' });
      await callTool('ctoc_step', { step: 7 });
      const state = readState();
      assert.strictEqual(state.step, 7);
    });

    it('ctoc_step marks previous steps as completed', async () => {
      await callTool('ctoc_start', { feature: 'test' });
      await callTool('ctoc_step', { step: 5 });
      const state = readState();
      assert.ok(state.steps_completed.includes(1));
      assert.ok(state.steps_completed.includes(4));
      assert.ok(!state.steps_completed.includes(5));
    });

    it('ctoc_step rejects invalid step (too low)', async () => {
      await assert.rejects(
        () => callTool('ctoc_step', { step: 0 }),
        /Step must be 1-15/
      );
    });

    it('ctoc_step rejects invalid step (too high)', async () => {
      await assert.rejects(
        () => callTool('ctoc_step', { step: 99 }),
        /Step must be 1-15/
      );
    });

    it('ctoc_step requires feature to be tracking', async () => {
      await assert.rejects(
        () => callTool('ctoc_step', { step: 5 }),
        /No feature being tracked/
      );
    });
  });

  describe('Input sanitization', () => {
    it('ctoc_start sanitizes path traversal', async () => {
      await callTool('ctoc_start', { feature: '../../../etc/passwd' });
      const state = readState();
      assert.ok(!state.feature.includes('..'));
      assert.ok(!state.feature.includes('/'));
    });

    it('ctoc_start sanitizes shell characters', async () => {
      await callTool('ctoc_start', { feature: 'test; rm -rf /' });
      const state = readState();
      assert.ok(!state.feature.includes(';'));
    });

    it('ctoc_start sanitizes backticks', async () => {
      await callTool('ctoc_start', { feature: 'test`whoami`' });
      const state = readState();
      assert.ok(!state.feature.includes('`'));
    });

    it('ctoc_start truncates long names', async () => {
      const longName = 'a'.repeat(200);
      await callTool('ctoc_start', { feature: longName });
      const state = readState();
      assert.ok(state.feature.length <= 100);
    });

    it('ctoc_start requires feature name', async () => {
      await assert.rejects(
        () => callTool('ctoc_start', { feature: '' }),
        /Feature name required/
      );
    });

    it('ctoc_start requires feature name (whitespace only)', async () => {
      await assert.rejects(
        () => callTool('ctoc_start', { feature: '   ' }),
        /Feature name required/
      );
    });
  });

  describe('Unknown tool handling', () => {
    it('rejects unknown tool names', async () => {
      await assert.rejects(
        () => callTool('ctoc_nonexistent', {}),
        /Unknown tool/
      );
    });
  });
});
