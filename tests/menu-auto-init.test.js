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

  it('is a no-op when the project is already fully set up', () => {
    // CONTRACT INVERSION (plan 00176, 2026-07-21).
    //  (a) Contract from OUTSIDE the test: the human-approved 00176 repair — the
    //      setup trigger is the READ-BACK, and any missing artifact is REPAIRED,
    //      not narrated. A bare `.ctoc/` (marker without artifacts) is a broken
    //      world, so it now repairs to a set-up project.
    //  (b) Why the prior assertion was wrong, not the code: it pinned an
    //      INTERMEDIATE un-repaired state (`bare .ctoc/ → ok:false`) that 00176
    //      deliberately eliminates. The PRINCIPLE it protected — a marker must
    //      not stand in for proof — is PRESERVED and strengthened: real proof
    //      (settings.yaml, state, stage dirs) is now created rather than merely
    //      demanded. The no-op contract it also encoded ("an existing project is
    //      left untouched") survives, re-pointed at a genuinely COMPLETE project,
    //      which is the only state where "already initialized" is true.
    //  (c) What newly failed: against the repair, a bare `.ctoc/` yields
    //      attempted:true / created:non-empty / ok:true, inverting all three of
    //      the old assertions. A healthy project keeps attempted:false /
    //      created:[] / ok:true, so the mutant this guarded (re-init on every
    //      open) stays dead.
    fs.mkdirSync(path.join(dir, '.ctoc', 'state'), { recursive: true });
    for (const s of ['vision', 'canvas', 'functional', 'implementation',
      'todo', 'in-progress', 'review', 'done']) {
      fs.mkdirSync(path.join(dir, 'plans', s), { recursive: true });
    }
    fs.writeFileSync(path.join(dir, '.ctoc', 'settings.yaml'),
      'version: 1\n\nregulatory_regime:\n  active_profiles: []\n', 'utf8');
    fs.writeFileSync(path.join(dir, '.ctoc', 'state', 'iron-loop.yaml'), 'step: 1\n', 'utf8');

    const setup = ensureInitialized(dir);

    assert.equal(setup.attempted, false, 'a fully set-up project is left untouched');
    assert.deepEqual(setup.created, [], 'nothing was written');
    assert.equal(setup.ok, true, 'and it reads back as set up');
  });

  it('repairs a bare .ctoc/ instead of treating the marker as proof', () => {
    // The inverse half of the contract above: the bare `.ctoc/` that used to be
    // reported as "not set up, forever" is now repaired on open (plan 00176).
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });

    const setup = ensureInitialized(dir);

    assert.equal(setup.attempted, true, 'a bare .ctoc/ is a repairable gap, not a set-up project');
    assert.equal(setup.ok, true, `and the repair completes, missing: ${JSON.stringify(setup.missing)}`);
    assert.ok(fs.existsSync(path.join(dir, '.ctoc', 'settings.yaml')), 'real proof is created on disk');
  });

  it('requiring start.js does not run the menu (importable without side effects)', () => {
    // The require above already happened; if main() had run, the test process
    // would have rendered a dashboard or exited. Reaching here proves the
    // require.main === module guard works.
    assert.equal(typeof ensureInitialized, 'function', 'ensureInitialized is exported');
  });
});
