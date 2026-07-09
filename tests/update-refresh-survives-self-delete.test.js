'use strict';

/**
 * REAL-fixture regression test for the update.js self-delete bug.
 *
 * THE BUG: `/ctoc:update` runs from the OLD cache version dir. Its "Clean old
 * versions" loop rmSync's every cache dir except the new one — including the OLD
 * dir the running script executes from. It THEN calls refreshLocalLessons() /
 * refreshLocalManual(), which lazily `require('../lib/...')` resolved against
 * __dirname = the just-DELETED old dir → ENOENT → swallowed by the fail-open
 * try/catch → the CLAUDE.md lessons + operating-manual blocks are silently NOT
 * regenerated.
 *
 * THE FIX: both refreshers take a `ctocRoot` param; the after-update call site
 * passes the freshly-installed, never-deleted cacheVersionDir so the require +
 * template reads resolve from a surviving directory.
 *
 * ZERO DOUBLES: real temp dirs, the real update.js module, the real
 * operating-manual.js + claude-md-lessons.js modules + the real template files,
 * copied into a real "NEW install dir", with the real OLD dir deleted from disk
 * before the refreshers run. No mocks, no stubs, no fakes.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO_ROOT = path.resolve(__dirname, '..');

// The real files a NEW install dir must contain for the refreshers to actually
// merge: the two lib modules + safe-fs (their fs choke point) + the two
// templates the modules read.
function buildNewInstallDir() {
  const newDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-newinstall-'));
  const libDst = path.join(newDir, 'src', 'lib');
  const tplDst = path.join(newDir, '.ctoc', 'templates');
  fs.mkdirSync(libDst, { recursive: true });
  fs.mkdirSync(tplDst, { recursive: true });

  for (const f of ['operating-manual.js', 'claude-md-lessons.js', 'safe-fs.js']) {
    fs.copyFileSync(path.join(REPO_ROOT, 'src', 'lib', f), path.join(libDst, f));
  }
  for (const t of ['operating-manual.md', 'operating-lessons.md']) {
    fs.copyFileSync(
      path.join(REPO_ROOT, '.ctoc', 'templates', t),
      path.join(tplDst, t)
    );
  }
  return newDir;
}

// A real temp "OLD dir" that mimics the running cache version dir (has its own
// copy of the lib modules). It gets deleted to simulate the self-delete.
function buildOldDir() {
  const oldDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-olddir-'));
  const libDst = path.join(oldDir, 'src', 'lib');
  fs.mkdirSync(libDst, { recursive: true });
  for (const f of ['operating-manual.js', 'claude-md-lessons.js', 'safe-fs.js']) {
    fs.copyFileSync(path.join(REPO_ROOT, 'src', 'lib', f), path.join(libDst, f));
  }
  return oldDir;
}

// A real project cwd with package.json (so looksLikeProject passes) + a CLAUDE.md.
function buildProject() {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-project-'));
  fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({ name: 'fixture' }));
  fs.writeFileSync(
    path.join(proj, 'CLAUDE.md'),
    '# Fixture project\n\nSome existing prose.\n'
  );
  return proj;
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

test('refreshLocalManual/Lessons are exported (testable surface)', () => {
  const update = require('../src/commands/update');
  assert.strictEqual(
    typeof update.refreshLocalManual,
    'function',
    'refreshLocalManual must be exported'
  );
  assert.strictEqual(
    typeof update.refreshLocalLessons,
    'function',
    'refreshLocalLessons must be exported'
  );
});

test('operating-manual block regenerates from the NEW install dir AFTER the OLD dir is deleted', () => {
  const { refreshLocalManual } = require('../src/commands/update');
  const { BEGIN_MARKER } = require('../src/lib/operating-manual');

  const oldDir = buildOldDir();
  const newDir = buildNewInstallDir();
  const proj = buildProject();
  const origCwd = process.cwd();

  try {
    // Simulate the "Clean old versions" self-delete: the running script's dir is gone.
    rmrf(oldDir);
    assert.ok(!fs.existsSync(oldDir), 'precondition: OLD dir deleted');

    // The refreshers use process.cwd() as the project root — point it at the fixture.
    process.chdir(proj);
    // The fixed after-update call passes the surviving cacheVersionDir (= newDir).
    refreshLocalManual(newDir);
  } finally {
    process.chdir(origCwd);
  }

  const claudeMd = fs.readFileSync(path.join(proj, 'CLAUDE.md'), 'utf8');
  assert.ok(
    claudeMd.includes(BEGIN_MARKER),
    'operating-manual block must be regenerated in CLAUDE.md from the surviving NEW dir'
  );
  assert.ok(
    claudeMd.includes('Some existing prose.'),
    'existing user prose must be preserved'
  );

  rmrf(newDir);
  rmrf(proj);
});

test('lessons block regenerates from the NEW install dir AFTER the OLD dir is deleted', () => {
  const { refreshLocalLessons } = require('../src/commands/update');
  const { START_MARKER } = require('../src/lib/claude-md-lessons');

  const oldDir = buildOldDir();
  const newDir = buildNewInstallDir();
  const proj = buildProject();
  const origCwd = process.cwd();

  try {
    rmrf(oldDir);
    assert.ok(!fs.existsSync(oldDir), 'precondition: OLD dir deleted');
    process.chdir(proj);
    refreshLocalLessons(newDir);
  } finally {
    process.chdir(origCwd);
  }

  const claudeMd = fs.readFileSync(path.join(proj, 'CLAUDE.md'), 'utf8');
  assert.ok(
    claudeMd.includes(START_MARKER),
    'lessons block must be regenerated in CLAUDE.md from the surviving NEW dir'
  );
  assert.ok(
    claudeMd.includes('Some existing prose.'),
    'existing user prose must be preserved'
  );

  rmrf(newDir);
  rmrf(proj);
});

// Guard: the ctocRoot param is LOAD-BEARING. With the OLD (buggy) behavior —
// ctocRoot pointing at a nonexistent/deleted dir — the require + template reads
// fail and the refresh is skipped (fail-open: no throw, no block written).
test('ctocRoot is load-bearing: a nonexistent ctocRoot yields no throw and no block (fail-open)', () => {
  const { refreshLocalManual, refreshLocalLessons } = require('../src/commands/update');

  const deletedDir = path.join(
    os.tmpdir(),
    'ctoc-does-not-exist-' + process.pid + '-' + Date.now()
  );
  assert.ok(!fs.existsSync(deletedDir), 'precondition: ctocRoot does not exist');

  const proj = buildProject();
  const origCwd = process.cwd();
  const before = fs.readFileSync(path.join(proj, 'CLAUDE.md'), 'utf8');

  try {
    process.chdir(proj);
    // Must NOT throw (fail-open) even though ctocRoot is gone.
    assert.doesNotThrow(() => refreshLocalManual(deletedDir));
    assert.doesNotThrow(() => refreshLocalLessons(deletedDir));
  } finally {
    process.chdir(origCwd);
  }

  const after = fs.readFileSync(path.join(proj, 'CLAUDE.md'), 'utf8');
  assert.strictEqual(
    after,
    before,
    'with a deleted ctocRoot, CLAUDE.md must be left unchanged (proving the param is load-bearing)'
  );

  rmrf(proj);
});
