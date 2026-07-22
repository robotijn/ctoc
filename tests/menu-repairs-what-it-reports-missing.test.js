/**
 * The menu REPAIRS what it reports missing, instead of narrating it forever
 * (plan 00176).
 *
 * The dead end this closes, reported by a live user and verified in code: the
 * setup trigger was `!existsSync(path.join(root, '.ctoc'))` — initialization was
 * attempted ONLY when the config directory was entirely absent. But a Write hook
 * (`PreToolUse.Write.js`, `appendLog`) creates `.ctoc/logs/` with
 * `mkdirSync(..., { recursive: true })` before the human ever opens the menu. So
 * `.ctoc/` exists, the trigger never fires, the read-back correctly reports every
 * artifact missing, the message says "Nothing here will work properly until that
 * is fixed" — and no code path anywhere fixes it. The project is permanently
 * uninitialisable, and the message is an honest dead end.
 *
 * The fix: the TRIGGER becomes the read-back. `ensureInitialized` runs
 * `verifySetup` first; when anything is missing it attempts the idempotent
 * `initProject` (which skips every file already present) and re-verifies. A
 * bare/partial `.ctoc/` ends up genuinely set up. A gap that truly cannot be
 * repaired (a permission/ownership failure) still renders the menu — fail-open —
 * AND the message now carries a concrete fix action, not only a description.
 *
 * A lesson these fixtures encode (from the sibling slice): a fixture that is
 * always well-formed cannot find a defect in what happens when the world is not.
 * Every case that matters builds a BROKEN world — a partial `.ctoc/` holding only
 * `.ctoc/logs/`, a bare `.ctoc/`, a deleted stage directory, a `plans` that is a
 * file, a settings write that fails at its real source.
 *
 * Cross-platform: path.join, os.tmpdir(), fs.rmSync teardown, no shell.
 */

'use strict';

const { describe, it, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const menu = require('../src/commands/start');
const safeFs = require('../src/lib/safe-fs');

const MENU_ENTRY = path.join(__dirname, '..', 'src', 'commands', 'start.js');
const INIT_PROJECT_PATH = require.resolve('../src/lib/init-project');

const tmpDirs = [];

function freshDir(prefix = 'menu-repair-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  // Resolve symlinks (macOS /var → /private/var) so a spawned-process cwd and the
  // in-process root agree; otherwise a path comparison would differ per platform.
  return fs.realpathSync(dir);
}

after(() => {
  for (const dir of tmpDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* teardown */ }
  }
});

const STAGE_DIRS = [
  'vision', 'canvas', 'functional', 'implementation',
  'todo', 'in-progress', 'review', 'done'
].map((s) => path.join('plans', s));

/** Build a fully valid, already-set-up project WITHOUT calling initProject. */
function seedValidProject(dir, { settingsBody } = {}) {
  fs.mkdirSync(path.join(dir, '.ctoc', 'state'), { recursive: true });
  for (const d of STAGE_DIRS) fs.mkdirSync(path.join(dir, d), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.ctoc', 'settings.yaml'),
    settingsBody !== undefined
      ? settingsBody
      : 'version: 1\n\nregulatory_regime:\n  active_profiles: []\n',
    'utf8'
  );
  fs.writeFileSync(path.join(dir, '.ctoc', 'state', 'iron-loop.yaml'), 'step: 1\n', 'utf8');
  return dir;
}

/** The exact side effect a Write hook has already had before the menu opens. */
function partialCtocFromWriteHook(dir) {
  fs.mkdirSync(path.join(dir, '.ctoc', 'logs'), { recursive: true });
  return dir;
}

// --- safe-fs seam -----------------------------------------------------------
// A permission fixture would have to be skipped on some platform, and a skipped
// test is a gate failure in this repository. The seam makes a write fail at its
// real source, in-process, on every platform.
const realWriteFileSync = safeFs.writeFileSync;
function throwWritesTo(fragment) {
  safeFs.writeFileSync = function patched(target, ...rest) {
    if (typeof target === 'string' && target.replace(/\\/g, '/').includes(fragment)) {
      throw new Error(`EACCES: permission denied, open '${target}'`);
    }
    return realWriteFileSync.call(this, target, ...rest);
  };
}
function restoreWrites() {
  safeFs.writeFileSync = realWriteFileSync;
}
afterEach(restoreWrites);
beforeEach(restoreWrites);

/** Drive the real entry point and parse the JSON screen it prints. */
function driveMenu(cwd) {
  const out = execFileSync(process.execPath, [MENU_ENTRY], { cwd, encoding: 'utf8' });
  return { out, parsed: JSON.parse(out.slice(out.indexOf('{'))) };
}

const settingsPath = (dir) => path.join(dir, '.ctoc', 'settings.yaml');

describe('the menu repairs what it reports missing', () => {
  it('1 — the reported dead end is reachable, and the first open repairs it', () => {
    // Partial `.ctoc/` holding only `.ctoc/logs/`, exactly as the Write hook
    // leaves it. The OLD trigger (`.ctoc` exists → never attempt) leaves this
    // permanently `ok:false`. The read-back trigger repairs it on the first open.
    const dir = partialCtocFromWriteHook(freshDir());

    const first = menu.ensureInitialized(dir);
    assert.equal(first.attempted, true, 'a partial .ctoc/ must trigger a repair, not be skipped');
    assert.equal(first.ok, true, `expected repaired, missing: ${JSON.stringify(first.missing)}`);
    assert.ok(fs.existsSync(settingsPath(dir)), '.ctoc/settings.yaml must exist after the repair');

    const second = menu.ensureInitialized(dir);
    assert.equal(second.ok, true, 'and it stays set up on the second open');
    assert.equal(second.attempted, false, 'a now-healthy project attempts nothing on reopen');
  });

  it('2 — a bare .ctoc directory is repaired, not narrated', () => {
    const dir = freshDir();
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });

    const setup = menu.ensureInitialized(dir);
    assert.equal(setup.attempted, true, 'a bare .ctoc/ is a broken world, not a set-up project');
    assert.equal(setup.ok, true, `expected repaired, missing: ${JSON.stringify(setup.missing)}`);
    assert.ok(fs.existsSync(settingsPath(dir)), 'settings.yaml exists on disk afterwards');
  });

  it('3 — the repair is provable from disk, not inferred from what init claims', () => {
    const dir = freshDir();
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });

    const setup = menu.ensureInitialized(dir);
    assert.ok(Array.isArray(setup.missingBefore), 'missingBefore is part of the verdict');
    assert.ok(setup.missingBefore.length > 0, 'the pre-check found real gaps');
    assert.deepEqual(setup.missing, [], 'the post-check finds none — a repair demonstrably happened');
    assert.equal(setup.ok, true);
  });

  it('4 — a genuinely empty directory still initialises', () => {
    const dir = freshDir();
    const setup = menu.ensureInitialized(dir);
    assert.equal(setup.attempted, true);
    assert.equal(setup.ok, true, `missing: ${JSON.stringify(setup.missing)}`);
    assert.ok(fs.existsSync(settingsPath(dir)), 'artifacts on disk');
  });

  it('5 — re-running is idempotent; settings bytes are stable and .gitignore cannot grow', () => {
    const dir = freshDir();
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    // Seed a .gitignore holding ONLY `.ctoc/logs/` — the disjunctive-guard state
    // named as a wart in the plan. It may gain the CTOC block at most ONCE more.
    fs.writeFileSync(path.join(dir, '.gitignore'), '.ctoc/logs/\n', 'utf8');

    menu.ensureInitialized(dir);                       // run 1 — repairs
    const settingsAfter1 = fs.readFileSync(settingsPath(dir), 'utf8');
    const gitignoreAfter1 = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');

    menu.ensureInitialized(dir);                       // run 2
    const settingsAfter2 = fs.readFileSync(settingsPath(dir), 'utf8');
    const gitignoreAfter2 = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');

    menu.ensureInitialized(dir);                       // run 3
    const settingsAfter3 = fs.readFileSync(settingsPath(dir), 'utf8');
    const gitignoreAfter3 = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');

    assert.equal(settingsAfter2, settingsAfter1, 'settings.yaml is not rewritten on run 2');
    assert.equal(settingsAfter3, settingsAfter1, 'nor on run 3');
    assert.equal(gitignoreAfter2, gitignoreAfter1, '.gitignore has converged by run 2 — it cannot grow');
    assert.equal(gitignoreAfter3, gitignoreAfter1, 'nor on run 3');
    // The block landed at most once beyond the seeded line.
    const stateLines = gitignoreAfter1.split('\n').filter((l) => l.trim() === '.ctoc/state/');
    assert.ok(stateLines.length <= 1, `.ctoc/state/ appears at most once, got ${stateLines.length}`);
  });

  it('6 — a healthy project attempts nothing and says nothing', () => {
    const dir = seedValidProject(freshDir());
    const setup = menu.ensureInitialized(dir);
    assert.equal(setup.attempted, false, 'no repair on a complete project');
    assert.deepEqual(setup.created, [], 'nothing written');
    assert.equal(menu.setupMessage(setup), null, 'silence is correct for a healthy project');
  });

  it('7 — an unrepairable failure renders AND names both what remains and an action', () => {
    // The settings write fails at its real source. Setup tries, cannot finish,
    // and the human must get more than a description of the problem.
    const dir = freshDir();
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    throwWritesTo('.ctoc/settings.yaml');
    const setup = menu.ensureInitialized(dir);
    restoreWrites();

    assert.equal(setup.attempted, true);
    assert.equal(setup.ok, false, 'a settings file that could not be written is not set up');
    const message = menu.setupMessage(setup);
    assert.ok(message && message.length > 0, 'the screen still renders a message — fail-open');
    assert.ok(message.includes('.ctoc/settings.yaml'), `must name what remains: ${message}`);
    // The half this slice adds: a concrete action, not only a description.
    assert.match(
      message, /reopen CTOC|make sure CTOC can write/,
      `the message must carry a fix action, got: ${message}`
    );
  });

  it('8 — a partial world is repaired partially; an intact settings file is NOT rewritten', () => {
    const dir = seedValidProject(freshDir());
    const settingsBefore = fs.readFileSync(settingsPath(dir), 'utf8');
    fs.rmSync(path.join(dir, 'plans', 'review'), { recursive: true, force: true });

    const setup = menu.ensureInitialized(dir);
    assert.equal(setup.ok, true, `the missing directory must be recreated, missing: ${JSON.stringify(setup.missing)}`);
    assert.ok(fs.existsSync(path.join(dir, 'plans', 'review')), 'plans/review is back');
    assert.equal(fs.readFileSync(settingsPath(dir), 'utf8'), settingsBefore,
      'the intact settings.yaml is left byte-for-byte alone');
  });

  it('9 — an anchorless settings file is still caught, not falsely repaired', () => {
    // initProject will not overwrite an existing settings.yaml, so an unusable
    // anchor stays unusable — the sibling slice\'s two-part check still governs.
    const dir = seedValidProject(freshDir(), { settingsBody: 'version: 1\nenforcement:\n  mode: strict\n' });
    const setup = menu.ensureInitialized(dir);
    assert.equal(setup.ok, false, 'an unusable anchor is still missing after a repair pass');
    assert.ok(setup.missing.some((m) => m.includes('active_profiles')),
      `missing must name the anchor, got ${JSON.stringify(setup.missing)}`);
  });

  it('10 — a throwing initialisation is attempted-and-failed, and still renders', () => {
    const dir = freshDir();
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    const original = require.cache[INIT_PROJECT_PATH];
    require.cache[INIT_PROJECT_PATH] = {
      id: INIT_PROJECT_PATH,
      filename: INIT_PROJECT_PATH,
      loaded: true,
      exports: { initProject() { throw new Error('disk on fire'); } }
    };
    let setup;
    try {
      setup = menu.ensureInitialized(dir);
    } finally {
      if (original) require.cache[INIT_PROJECT_PATH] = original;
      else delete require.cache[INIT_PROJECT_PATH];
    }

    assert.equal(setup.attempted, true, '"we tried and failed" is not "we did not try"');
    assert.equal(setup.ok, false);
    assert.ok(setup.reason && setup.reason.includes('disk on fire'), `reason survives: ${setup.reason}`);
    const message = menu.setupMessage(setup);
    assert.ok(message && message.length > 0, 'the screen still renders');
    assert.match(message, /reopen CTOC|make sure CTOC can write/, 'and carries an action');
  });

  it('11 — the dashboard renders in every broken fixture; nothing is bricked', () => {
    // Repairable, across the process boundary: a partial `.ctoc/logs/`.
    const repairable = partialCtocFromWriteHook(freshDir());
    const a = driveMenu(repairable);
    assert.ok(typeof a.parsed.text === 'string' && a.parsed.text.length > 0, 'repairable fixture renders');

    // Unrepairable, across the boundary (no in-process seam survives a child):
    // `plans` is a FILE, so the stage directories can never be created.
    const unrepairable = freshDir();
    fs.mkdirSync(path.join(unrepairable, '.ctoc'), { recursive: true });
    fs.writeFileSync(path.join(unrepairable, 'plans'), 'not a directory\n', 'utf8');
    const b = driveMenu(unrepairable);
    assert.ok(typeof b.parsed.text === 'string' && b.parsed.text.length > 0, 'unrepairable fixture still renders');
    assert.ok(b.parsed.text.includes('plans/'), 'and carries the truth about what is missing');
  });

  it('12 — no absolute path and no stack frame reaches the screen', () => {
    // Case 7 style (in-process seam) and case 10 style (throwing init) both feed
    // `reason` into the message; neither may leak the filesystem layout.
    const dir = freshDir();
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    throwWritesTo('.ctoc/settings.yaml');
    const setup = menu.ensureInitialized(dir);
    restoreWrites();
    const message = menu.setupMessage(setup);
    assert.ok(!message.includes(dir), `no absolute project path may appear: ${message}`);
    assert.ok(!message.includes(os.homedir()), 'no home-directory path may appear');
    assert.ok(!/\bat\s+\S+:\d+:\d+/.test(message), 'no stack frame may appear');
  });

  it('13 — a nested repository is set up as itself, leaving the outer project untouched', () => {
    const outer = seedValidProject(freshDir());
    const outerReviewBefore = fs.readdirSync(path.join(outer, 'plans', 'review'));
    const inner = path.join(outer, 'inner-repo');
    fs.mkdirSync(path.join(inner, '.git'), { recursive: true });

    const setup = menu.ensureInitialized(inner);
    assert.equal(setup.ok, true, `the inner repository must set itself up, missing: ${JSON.stringify(setup.missing)}`);
    assert.ok(fs.existsSync(path.join(inner, '.ctoc', 'settings.yaml')), 'inner project gets its own settings');
    // The outer project is untouched — the repair reads the root it is given.
    assert.deepEqual(fs.readdirSync(path.join(outer, 'plans', 'review')), outerReviewBefore,
      'the outer project gains nothing');
  });

  it('14 — end to end, as a human runs it: stdout and the filesystem agree', () => {
    const dir = partialCtocFromWriteHook(freshDir());
    const { parsed } = driveMenu(dir);
    const announcedSetUp = /CTOC is set up for this project/.test(parsed.text);
    const settingsOnDisk = fs.existsSync(settingsPath(dir));

    assert.equal(announcedSetUp, settingsOnDisk,
      `announcement and filesystem must agree.\n` +
      `announced set up: ${announcedSetUp}\n` +
      `settings on disk: ${settingsOnDisk}\n` +
      `text: ${parsed.text.slice(0, 300)}`);
    assert.equal(settingsOnDisk, true, 'the partial .ctoc/ must end up genuinely set up');
    assert.ok(announcedSetUp, 'and the screen must say so');
  });
});
