/**
 * Menu auto-init tests (v6.9.32).
 *
 * The `/ctoc:init` slash command was removed. Initialization is now automatic:
 * when `/ctoc:menu` runs in a project with no `.ctoc/` directory, menu.js calls
 * initProject() before rendering. `ensureInitialized` is that hook.
 *
 * See: CLAUDE.md "Project Init Procedure" and src/commands/menu.md rule 7.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { ensureInitialized } = require('../src/commands/menu.js');

describe('Menu auto-init — replaces the removed init command (v6.9.32)', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-autoinit-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('initializes a project that has no .ctoc/ directory', () => {
    assert.ok(!fs.existsSync(path.join(dir, '.ctoc')), 'precondition: not yet initialized');

    const didInit = ensureInitialized(dir);

    assert.equal(didInit, true, 'ensureInitialized reports it initialized the project');
    assert.ok(fs.existsSync(path.join(dir, '.ctoc')), '.ctoc/ directory was created');
    assert.ok(fs.existsSync(path.join(dir, 'plans')), 'plans/ directory was created');
  });

  it('is a no-op when .ctoc/ already exists', () => {
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });

    const didInit = ensureInitialized(dir);

    assert.equal(didInit, false, 'an already-initialized project is left untouched');
  });

  it('requiring menu.js does not run the menu (importable without side effects)', () => {
    // The require above already happened; if main() had run, the test process
    // would have rendered a dashboard or exited. Reaching here proves the
    // require.main === module guard works.
    assert.equal(typeof ensureInitialized, 'function', 'ensureInitialized is exported');
  });
});
