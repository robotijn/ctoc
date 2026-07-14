/**
 * R6-D — hasCommand() must be cross-platform.
 *
 * The old probe was POSIX-only `command -v <cmd>`, which always fails on Windows
 * (no `command` builtin in cmd.exe) → CTOC concludes pre-commit/pip/pipx are
 * absent even when installed. The fix branches on process.platform: `where` on
 * win32, `command -v` elsewhere.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');

const HOOKS_PATH = require.resolve('../src/lib/hooks-installer');
const REAL_EXEC = cp.execSync;
const REAL_PLATFORM = process.platform;

function loadWithPlatform(platform) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  let captured;
  cp.execSync = (command) => { captured = command; return ''; };
  delete require.cache[HOOKS_PATH];
  const { hasCommand } = require(HOOKS_PATH);
  const result = hasCommand('pre-commit');
  return { captured, result };
}

function restore() {
  cp.execSync = REAL_EXEC;
  Object.defineProperty(process, 'platform', { value: REAL_PLATFORM, configurable: true });
  delete require.cache[HOOKS_PATH];
}

test('hasCommand is exported', () => {
  delete require.cache[HOOKS_PATH];
  const mod = require(HOOKS_PATH);
  try {
    assert.equal(typeof mod.hasCommand, 'function', 'hasCommand must be exported for cross-platform verification');
  } finally {
    delete require.cache[HOOKS_PATH];
  }
});

test('hasCommand on win32 probes with `where`', () => {
  try {
    const { captured, result } = loadWithPlatform('win32');
    assert.match(captured, /^where\s+pre-commit\b/, 'win32 must use `where`, not the POSIX `command -v`');
    assert.equal(result, true, 'a resolving probe returns true');
  } finally {
    restore();
  }
});

test('hasCommand on POSIX probes with `command -v`', () => {
  try {
    const { captured } = loadWithPlatform('linux');
    assert.match(captured, /^command -v\s+pre-commit\b/, 'POSIX must use `command -v`');
  } finally {
    restore();
  }
});

test('hasCommand returns false (never throws) when the probe fails', () => {
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  cp.execSync = () => { throw new Error('not found'); };
  delete require.cache[HOOKS_PATH];
  const { hasCommand } = require(HOOKS_PATH);
  try {
    assert.equal(hasCommand('definitely-not-installed'), false);
  } finally {
    restore();
  }
});
