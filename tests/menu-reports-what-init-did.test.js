/**
 * The menu never claims it set up a project it did not (plan 00156).
 *
 * The owner, from a genuinely fresh repository:
 *
 *   "initProject never actually ran here despite the menu announcing it had."
 *
 * `ensureInitialized` returned `true` for exactly one reason — nothing threw —
 * and discarded `initProject`'s full report of what it created and skipped.
 * `initProject` in turn returns a HARDCODED `success: true`. So the sentence the
 * human read was derived from the absence of an exception, never from an
 * artifact existing.
 *
 * These tests pin the replacement contract: the claim is a READ-BACK. Every
 * required artifact is proved through its reader of record, and the compliance
 * anchor in particular is proved to be TARGETABLE by the writer that needs it —
 * a settings file that exists but whose `active_profiles:` anchor the writer can
 * never target counts as missing NOW, not in six weeks when a compliance write
 * fails silently.
 *
 * A lesson these fixtures encode: a fixture that is always well-formed cannot
 * find a defect in what happens when the world is not. Every case below that
 * matters builds a BROKEN world — no settings file, an unusable one, an empty
 * `.ctoc/` directory, a deleted stage directory, a throwing initializer.
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
const { loadActiveProfiles } = require('../src/lib/regulatory-regime');

const MENU_ENTRY = path.join(__dirname, '..', 'src', 'commands', 'start.js');
const INIT_PROJECT_PATH = require.resolve('../src/lib/init-project');

const tmpDirs = [];

function freshDir(prefix = 'menu-init-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  // Resolve symlinks (macOS /var → /private/var) so spawned-process cwd and the
  // in-process root agree; otherwise a path comparison would differ per platform.
  return fs.realpathSync(dir);
}

after(() => {
  for (const dir of tmpDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* teardown */ }
  }
});

// The eight stage directories a working project needs.
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

// --- safe-fs seam -----------------------------------------------------------
// Case 3 uses the safe-fs seam rather than a read-only directory: a permission
// fixture would have to be skipped on some platform, and a skipped test is a
// gate failure in this repository.
const realWriteFileSync = safeFs.writeFileSync;
function swallowWritesTo(fragment) {
  safeFs.writeFileSync = function patched(target, ...rest) {
    if (typeof target === 'string' && target.replace(/\\/g, '/').includes(fragment)) {
      return undefined;              // silently does nothing — no throw, no bytes
    }
    return realWriteFileSync.call(this, target, ...rest);
  };
}
function restoreWrites() {
  safeFs.writeFileSync = realWriteFileSync;
}
afterEach(restoreWrites);
beforeEach(restoreWrites);

describe('the menu reports what initialization actually did', () => {
  it('1 — a real fresh directory reports success, and the file is on disk', () => {
    const dir = freshDir();
    const setup = menu.ensureInitialized(dir);

    assert.equal(setup.attempted, true, 'a directory with no .ctoc must be attempted');
    assert.equal(setup.ok, true, `expected ok, missing: ${JSON.stringify(setup.missing)}`);
    assert.deepEqual(setup.missing, []);
    assert.ok(
      fs.existsSync(path.join(dir, '.ctoc', 'settings.yaml')),
      'the claim must agree with the filesystem'
    );
  });

  it('2 — the claim survives a read-back through the real reader', () => {
    const dir = freshDir();
    menu.ensureInitialized(dir);
    const read = loadActiveProfiles(dir);
    assert.ok(Array.isArray(read.profiles), 'the reader of record must return a profiles array');
  });

  it('3 — a settings write that silently fails is NOT reported as set up', () => {
    const dir = freshDir();
    swallowWritesTo('.ctoc/settings.yaml');
    const setup = menu.ensureInitialized(dir);
    restoreWrites();

    assert.equal(setup.attempted, true);
    assert.equal(setup.ok, false, 'a file that was never written must not be reported as set up');
    assert.ok(
      setup.missing.some((m) => m.includes('.ctoc/settings.yaml')),
      `missing must name the settings file, got ${JSON.stringify(setup.missing)}`
    );
    // The report said it created the file. The world says otherwise.
    assert.ok(setup.created.includes('.ctoc/settings.yaml'), 'the report still claims creation');
    assert.equal(fs.existsSync(path.join(dir, '.ctoc', 'settings.yaml')), false);

    const message = menu.setupMessage(setup);
    assert.ok(message, 'a failed setup must produce a message');
    assert.ok(!/\bis set up\b/.test(message), `must not claim set up: ${message}`);
  });

  it('4 — the message names what is missing', () => {
    const dir = freshDir();
    swallowWritesTo('.ctoc/settings.yaml');
    const setup = menu.ensureInitialized(dir);
    restoreWrites();
    const message = menu.setupMessage(setup);
    assert.ok(message.includes('.ctoc/settings.yaml'), `message must name the artifact: ${message}`);
  });

  it('5 — an anchorless settings file counts as missing', () => {
    // The exact state that makes the compliance write fail silently: the file
    // exists and the reader of record reads it happily (profiles: []), but the
    // writer's single-line anchor is not there, so it can never write.
    const dir = seedValidProject(freshDir(), { settingsBody: 'version: 1\nenforcement:\n  mode: strict\n' });

    assert.ok(Array.isArray(loadActiveProfiles(dir).profiles),
      'precondition: the naive reader check passes on this broken file');

    const setup = menu.ensureInitialized(dir);
    assert.equal(setup.ok, false, 'an unusable anchor must count as missing NOW');
    assert.ok(
      setup.missing.some((m) => m.includes('active_profiles')),
      `missing must name the anchor, got ${JSON.stringify(setup.missing)}`
    );
  });

  it('5b — a block-style anchor the writer refuses also counts as missing', () => {
    const dir = seedValidProject(freshDir(), {
      settingsBody: 'version: 1\n\nregulatory_regime:\n  active_profiles:\n    - gdpr\n'
    });
    const setup = menu.ensureInitialized(dir);
    assert.equal(setup.ok, false, 'the writer refuses a block-style list — that is unusable');
    assert.ok(setup.missing.some((m) => m.includes('active_profiles')));
  });

  it('6 — a throwing initialization is attempted-and-failed, not not-attempted', () => {
    const dir = freshDir();
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
    assert.ok(setup.reason && setup.reason.includes('disk on fire'),
      `reason must carry the message, got ${JSON.stringify(setup.reason)}`);
  });

  it('7 — an empty .ctoc/ is repaired on open, and the screen renders', () => {
    // CONTRACT INVERSION (plan 00176, 2026-07-21).
    //  (a) Contract from OUTSIDE the test: the human-approved 00176 repair — a
    //      missing artifact is REPAIRED on open, not narrated. An empty `.ctoc/`
    //      is a repairable gap.
    //  (b) Why the prior assertion was wrong, not the code: it pinned the
    //      INTERMEDIATE state "empty `.ctoc/` stays broken, message names
    //      settings.yaml as missing" that 00176 deliberately eliminates by
    //      repairing. The fail-open PRINCIPLE it protected — the screen must
    //      still render — is PRESERVED here; the render-on-genuine-FAILURE case
    //      moves to tests/menu-repairs-what-it-reports-missing.test.js case 7,
    //      which uses an unrepairable fixture.
    //  (c) What newly failed: after the repair, `parsed.text` announces "CTOC is
    //      set up for this project." and no longer names settings.yaml as
    //      missing, because settings.yaml now exists on disk.
    const dir = freshDir();
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    const out = execFileSync(process.execPath, [MENU_ENTRY], { cwd: dir, encoding: 'utf8' });
    assert.ok(out.trim().length > 0, 'the screen must still render');
    const parsed = JSON.parse(out.slice(out.indexOf('{')));
    assert.ok(typeof parsed.text === 'string' && parsed.text.length > 0);
    assert.ok(parsed.text.includes('CTOC is set up for this project'),
      'the empty .ctoc/ was repaired, and the screen says so');
    assert.ok(fs.existsSync(path.join(dir, '.ctoc', 'settings.yaml')),
      'and the artifact it once reported missing now exists');
  });

  it('8 — an already-set-up, healthy project says nothing', () => {
    const dir = seedValidProject(freshDir());
    const setup = menu.ensureInitialized(dir);
    assert.equal(setup.attempted, false, 'an existing .ctoc must not be re-initialized');
    assert.equal(setup.ok, true, `expected healthy, missing: ${JSON.stringify(setup.missing)}`);
    assert.equal(menu.setupMessage(setup), null, 'silence is correct for a healthy project');
  });

  it('9 — skipped is no longer discarded', () => {
    const dir = freshDir();
    fs.writeFileSync(path.join(dir, 'IRON_LOOP.md'), '# pre-existing\n', 'utf8');
    const setup = menu.ensureInitialized(dir);
    assert.ok(Array.isArray(setup.skipped));
    assert.ok(setup.skipped.length > 0, 'the skipped report must survive');
    assert.ok(setup.skipped.some((s) => s.includes('IRON_LOOP.md')),
      `skipped must name the pre-existing artifact, got ${JSON.stringify(setup.skipped)}`);
  });

  it('10 — a missing stage directory is repaired, not merely reported', () => {
    // CONTRACT INVERSION (plan 00176, 2026-07-21).
    //  (a) Contract from OUTSIDE the test: the human-approved 00176 repair — a
    //      missing artifact is recreated on open.
    //  (b) Why the prior assertion was wrong, not the code: it pinned the
    //      INTERMEDIATE "missing stage dir stays missing, ok:false" state that
    //      00176 eliminates. verifySetup STILL catches the gap (its check is
    //      unchanged); the difference is that setup now acts on what it caught.
    //  (c) What newly failed: `plans/review` is recreated by the idempotent
    //      initProject pass, so `ok` is now true and `missing` no longer names
    //      the directory.
    const dir = seedValidProject(freshDir());
    fs.rmSync(path.join(dir, 'plans', 'review'), { recursive: true, force: true });
    const setup = menu.ensureInitialized(dir);
    assert.equal(setup.ok, true, `the gap must be repaired, missing: ${JSON.stringify(setup.missing)}`);
    assert.ok(fs.existsSync(path.join(dir, 'plans', 'review')),
      'the missing stage directory is recreated on disk');
    assert.ok(setup.missingBefore.some((m) => m.includes('plans/review')),
      `the pre-check still caught it, missingBefore: ${JSON.stringify(setup.missingBefore)}`);
  });

  it('11 — the success message makes no claim beyond what was verified', () => {
    const dir = freshDir();
    const setup = menu.ensureInitialized(dir);
    const message = menu.setupMessage(setup);
    assert.ok(message, 'a successful attempt is still reported');
    assert.ok(!message.includes('no init command needed'),
      'the design explanation is not a report of what happened');
    assert.ok(!/CLAUDE\.md|IRON_LOOP\.md|\.gitignore/.test(message),
      `the message must not enumerate files it did not check: ${message}`);
  });

  it('12 — end to end: the announcement and the filesystem agree', () => {
    // The assertion that would have caught the reported defect. Cases 1-11 test
    // the function; this drives the real entry point in a real fresh directory
    // and then reads the real directory back.
    const dir = freshDir();
    const out = execFileSync(process.execPath, [MENU_ENTRY], { cwd: dir, encoding: 'utf8' });
    const parsed = JSON.parse(out.slice(out.indexOf('{')));
    const claimsSetUp = /CTOC is set up for this project/.test(parsed.text);
    const settingsOnDisk = fs.existsSync(path.join(dir, '.ctoc', 'settings.yaml'));

    assert.equal(
      claimsSetUp, settingsOnDisk,
      `announcement and filesystem disagree.\n` +
      `announced set up: ${claimsSetUp}\n` +
      `.ctoc/settings.yaml on disk: ${settingsOnDisk}\n` +
      `directory listing: ${JSON.stringify(fs.readdirSync(dir))}\n` +
      `text: ${parsed.text.slice(0, 300)}`
    );
    assert.equal(settingsOnDisk, true, 'a genuinely fresh directory must end up set up');
    assert.ok(claimsSetUp, 'and must say so');
  });

  it('13 — an empty .ctoc directory is repaired, and the marker never stands in for proof', () => {
    // CONTRACT INVERSION (plan 00176, 2026-07-21).
    //  (a) Contract from OUTSIDE the test: the human-approved 00176 repair — an
    //      empty `.ctoc/` is a repairable gap, not a permanent verdict.
    //  (b) Why the prior assertion was wrong, not the code: it pinned the
    //      INTERMEDIATE "empty `.ctoc/` → ok:false" state. Its PRINCIPLE — the
    //      bare marker must never stand in for proof — is PRESERVED and made
    //      stronger: instead of only refusing to trust the marker, setup now
    //      creates the real proof (settings.yaml, state, stage dirs). The
    //      pre-check (`missingBefore`) records that the marker alone was not
    //      enough, exactly as the old assertion did.
    //  (c) What newly failed: the empty `.ctoc/` repairs to ok:true, `missing`
    //      is empty, and the message is the success sentence.
    const dir = freshDir();
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    const setup = menu.ensureInitialized(dir);
    assert.equal(setup.ok, true, 'the empty .ctoc is repaired into a set-up project');
    assert.ok(setup.missingBefore.length >= 2,
      `the marker alone was not proof — several artifacts were missing before: ${JSON.stringify(setup.missingBefore)}`);
    assert.deepEqual(setup.missing, [], 'and none remain missing after the repair');
    assert.equal(menu.setupMessage(setup), 'CTOC is set up for this project.',
      'the message reports the genuine, read-back success');
  });

  it('14 — the failure message leaks no absolute path and no stack', () => {
    // VACUITY REPAIR (plan 00176, 2026-07-21).
    //  (a) Contract from OUTSIDE this test: Step 13 SECURE — the failure message
    //      names paths, and those paths must be project-RELATIVE with no error
    //      stack. The only leak vector that reaches a failure message is `reason`
    //      (a raw fs error), which `src/commands/start.js` `sanitizeReason`
    //      scrubs at the render seam. The `missing` list is relative by
    //      construction and cannot leak.
    //  (b) Why the OLD assertion was vacuous, not merely weak: its fixture was an
    //      empty `.ctoc/`, which the 00176 repair-on-open now REPAIRS to ok:true.
    //      `setupMessage` then returns the CONSTANT success sentence, which by
    //      construction contains neither a path nor a stack — so both leak
    //      assertions passed trivially and the scrubber was never exercised.
    //      Proven: bypassing `sanitizeReason` (raw reason straight into the
    //      message) left the old case 14 GREEN.
    //  (c) What newly fails: setup must GENUINELY fail (ok:false) with a `reason`
    //      that carries the two things that must never reach a screen — an
    //      absolute path and a `file:line:col` stack frame. The render seam must
    //      scrub both. Injecting either back into the message (removing
    //      `sanitizeReason`) now makes this case RED.
    const dir = freshDir();
    // A reason a caught fs error really produces: an absolute path, and a
    // no-function-name V8 stack frame `at <abs>:line:col` (the form the stack
    // regex actually detects).
    const leakyReason =
      `EACCES: permission denied, open '${path.join(dir, '.ctoc', 'settings.yaml')}'\n` +
      `    at ${path.join(dir, 'src', 'init-project.js')}:412:19`;
    const original = require.cache[INIT_PROJECT_PATH];
    require.cache[INIT_PROJECT_PATH] = {
      id: INIT_PROJECT_PATH,
      filename: INIT_PROJECT_PATH,
      loaded: true,
      exports: { initProject() { throw new Error(leakyReason); } }
    };
    let setup;
    try {
      setup = menu.ensureInitialized(dir);
    } finally {
      if (original) require.cache[INIT_PROJECT_PATH] = original;
      else delete require.cache[INIT_PROJECT_PATH];
    }

    // The fixture must reach the FAILURE branch of setupMessage, never the
    // success sentence — otherwise the leak assertions are tautologies again.
    assert.equal(setup.ok, false, 'the fixture must genuinely fail setup, not repair to success');
    assert.equal(setup.attempted, true, '"we tried and failed" carries the leaky reason');
    const message = menu.setupMessage(setup);
    assert.ok(message && !/\bis set up\b/.test(message), `must be a failure message: ${message}`);
    // The reason carried an absolute path and a stack frame; both must be gone.
    assert.ok(!message.includes(dir), `paths must be project-relative, never absolute: ${message}`);
    assert.ok(!/\bat\s+\S+:\d+:\d+/.test(message), `no stack frames on the screen: ${message}`);
  });
});
