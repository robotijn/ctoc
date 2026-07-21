/**
 * Menu auto-init tests (v6.9.32).
 *
 * The `/ctoc:init` slash command was removed. Initialization is now automatic:
 * when `/ctoc:start` runs in a project with no `.ctoc/` directory, start.js calls
 * initProject() before rendering. `ensureInitialized` is that hook.
 *
 * See: CLAUDE.md "Project Init Procedure" and src/commands/start.md rule 7.
 *
 * CONTRACT CHANGE (plan 00156, 2026-07-20). `ensureInitialized` no longer returns
 * a boolean. It returns a VERDICT read back from the filesystem —
 * `{ attempted, ok, created, skipped, missing, reason }` — because the boolean was
 * derived from the absence of an exception and nothing else, and the menu rendered
 * it as "CTOC initialized for this project" on projects that were not initialized.
 * The assertions below are re-pointed at the verdict; the SUBJECT of each is
 * unchanged, and each is TIGHTER than the boolean it replaces: the old `true`
 * could not distinguish "it ran" from "it worked", and the new `attempted && ok`
 * does.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { ensureInitialized } = require('../src/commands/start.js');

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

    const setup = ensureInitialized(dir);

    assert.equal(setup.attempted, true, 'ensureInitialized ran initialization');
    assert.equal(setup.ok, true,
      `and it worked — missing: ${JSON.stringify(setup.missing)}`);
    assert.ok(fs.existsSync(path.join(dir, '.ctoc')), '.ctoc/ directory was created');
    assert.ok(fs.existsSync(path.join(dir, 'plans')), 'plans/ directory was created');
  });

  it('is a no-op when .ctoc/ already exists', () => {
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });

    const setup = ensureInitialized(dir);

    assert.equal(setup.attempted, false, 'an already-initialized project is left untouched');
    assert.deepEqual(setup.created, [], 'nothing was written');
    // The fixture is a BARE `.ctoc/` — the marker without the artifacts. The old
    // boolean called that "initialized"; the verdict reads the world back and
    // does not. Asserted here so the marker can never again stand in for proof.
    assert.equal(setup.ok, false, 'an empty .ctoc/ is a marker, not a set-up project');
  });

  it('requiring start.js does not run the menu (importable without side effects)', () => {
    // The require above already happened; if main() had run, the test process
    // would have rendered a dashboard or exited. Reaching here proves the
    // require.main === module guard works.
    assert.equal(typeof ensureInitialized, 'function', 'ensureInitialized is exported');
  });
});
