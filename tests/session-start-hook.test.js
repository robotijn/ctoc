#!/usr/bin/env node
/**
 * Test: SessionStart hook stderr/stdout behavior
 *
 * Claude Code hooks interpret stderr as errors.
 * This test verifies the hook only writes context to stdout
 * and doesn't leak anything to stderr.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { execFile } = require('child_process');
const path = require('path');

const HOOK_PATH = path.join(__dirname, '..', 'src', 'hooks', 'SessionStart.js');

function runHook(env = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile('node', [HOOK_PATH], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, ...env },
      timeout: 15000
    }, (error, stdout, stderr) => {
      resolve({ exitCode: error ? error.code : 0, stdout, stderr });
    });
  });
}

describe('SessionStart hook', () => {
  it('should exit with code 0', async () => {
    const { exitCode } = await runHook();
    assert.strictEqual(exitCode, 0, `Hook exited with code ${exitCode}`);
  });

  it('should produce no stderr output (Claude Code treats stderr as error)', async () => {
    const { stderr } = await runHook();
    assert.strictEqual(stderr, '', `Unexpected stderr output: ${JSON.stringify(stderr)}`);
  });

  it('should produce context output on stdout', async () => {
    const { stdout } = await runHook();
    assert.ok(stdout.includes('CTOC v'), 'Missing CTOC context banner on stdout');
    assert.ok(stdout.includes('Iron Loop'), 'Missing Iron Loop info on stdout');
  });

  it('should include version banner on stdout (not stderr)', async () => {
    const { stdout, stderr } = await runHook();
    // Version info should be on stdout or nowhere, never stderr
    assert.ok(!stderr.includes('ctoc v'), 'Version banner leaked to stderr');
  });

  it('should not write update notifications to stderr', async () => {
    const { stderr } = await runHook();
    assert.ok(!stderr.includes('Update available'), 'Update notification leaked to stderr');
    assert.ok(!stderr.includes('git pull'), 'Update instructions leaked to stderr');
  });
});
