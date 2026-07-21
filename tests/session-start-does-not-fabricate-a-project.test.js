/**
 * A session that cannot identify a project must not invent one.
 *
 * The reported defect: opening a session in a directory CTOC could not identify made
 * the session hook scaffold the whole plan tree anyway. `describeProjectRoot` returned
 * `marker: 'fallback'` — an explicit admission it found no project — and the hook
 * discarded that admission and created `plans/vision` … `plans/done`. On the NEXT
 * session those directories resolve as a confident `plans` marker. The guess became a
 * fact and ratified itself: no later code could tell fabrication from discovery,
 * because by construction there was no longer a difference to see.
 *
 * These fixtures deliberately build BROKEN worlds — an empty directory, a bare `.ctoc`
 * holding nothing, a nested repository, a stand-in home carrying `~/.ctoc`. Every
 * existing test builds a well-formed project and therefore could never exercise the
 * discard: in a correct world the discarded value is always the same one.
 *
 * The hook is driven as a REAL process (spawnSync) with a controlled cwd, then the
 * filesystem and the resolver are read back — the honest end-to-end drive a session
 * actually performs. Cross-platform: path.join, os.tmpdir(), realpath, fs.rmSync.
 */

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.resolve(__dirname, '..', 'src', 'hooks', 'SessionStart.js');
const { describeProjectRoot } = require('../src/lib/project-root');

// The resolver's own words for "I found no project" — rendered verbatim by the hook.
const NO_MARKER_REASON = 'no project marker found in the examined ancestry';

const scratchRoots = [];

/** Create a scratch tree; realpath so macOS's /var -> /private/var symlink cannot
 *  make an assertion compare two spellings of the same directory. */
function mkTmp() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-fabricate-')));
  scratchRoots.push(dir);
  return dir;
}

after(() => {
  for (const dir of scratchRoots) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

/** Drive the hook exactly as a session does: a real node process with a set cwd. */
function runHook(cwd) {
  const r = spawnSync(process.execPath, [HOOK_PATH], {
    cwd,
    env: process.env,
    encoding: 'utf8',
    timeout: 30000
  });
  return {
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    exitCode: r.status == null ? (r.error ? 1 : 0) : r.status,
    error: r.error
  };
}

const exists = (p) => fs.existsSync(p);

// ---------------------------------------------------------------------------
// RED cases — behavior that does not exist yet (the fabrication must stop).
// ---------------------------------------------------------------------------

// Case 1 — an empty directory is not scaffolded.
test('an empty directory is not scaffolded', () => {
  const dir = mkTmp();
  const { exitCode } = runHook(dir);
  assert.strictEqual(exitCode, 0, 'the hook must still exit 0 for an unidentified project');
  assert.ok(!exists(path.join(dir, 'plans')), 'plans/ must NOT be created in an unidentified directory');
  assert.ok(!exists(path.join(dir, '.ctoc')), '.ctoc/ must NOT be created in an unidentified directory');
  assert.ok(!exists(path.join(dir, 'learnings')), 'learnings/ must NOT be created either');
  assert.ok(!exists(path.join(dir, 'CLAUDE.md')), 'CLAUDE.md must NOT be created in an unidentified directory');
});

// Case 2 — the self-ratifying loop cannot close.
test('the self-ratifying loop cannot close (second run still reports fallback)', () => {
  const dir = mkTmp();
  runHook(dir);
  runHook(dir);
  const after2 = describeProjectRoot(dir);
  assert.strictEqual(after2.marker, 'fallback',
    `after two sessions the directory must still be unidentified; got marker='${after2.marker}' (a fabricated marker is the whole defect)`);
});

// Case 3 — the session says WHY and WHAT to do.
test('the session says why it created nothing and what to do', () => {
  const dir = mkTmp();
  const { stdout } = runHook(dir);
  assert.ok(stdout.includes(NO_MARKER_REASON),
    'the context must render the resolver\'s verbatim reason');
  assert.ok(stdout.includes('/ctoc:start'),
    'the context must name the one command that sets the directory up (the dashboard command is /ctoc:start)');
});

// Case 9 — the banner names the resolved root, not the working directory.
test('the banner names the resolved root, not the working directory', () => {
  const inner = path.join(mkTmp(), 'innerrepo');
  fs.mkdirSync(path.join(inner, '.git'), { recursive: true });
  const workdir = path.join(inner, 'workhere');
  fs.mkdirSync(workdir, { recursive: true });
  const { stdout } = runHook(workdir);
  assert.match(stdout, /Project:\s+innerrepo/,
    'the Project label must resolve to the repository, not the sub-directory');
  assert.ok(!stdout.includes('Project: workhere'),
    'the Project label must NOT be the sub-directory the terminal happened to open in');
});

// Case 10 — the banner discloses the mismatch.
test('the banner discloses the working-directory mismatch', () => {
  const inner = path.join(mkTmp(), 'innerrepo');
  fs.mkdirSync(path.join(inner, '.git'), { recursive: true });
  const workdir = path.join(inner, 'workhere');
  fs.mkdirSync(workdir, { recursive: true });
  const { stdout } = runHook(workdir);
  assert.ok(stdout.includes('working directory'),
    'a human in a sub-directory must be told CTOC is operating elsewhere');
  assert.ok(stdout.includes('workhere'),
    'the disclosure must name the actual working directory');
});

// Case 13 — end to end: stdout and the filesystem AGREE.
test('end to end, stdout and the filesystem agree that nothing was created', () => {
  const dir = mkTmp();
  const { stdout, exitCode } = runHook(dir);
  assert.strictEqual(exitCode, 0);
  assert.ok(stdout.includes(NO_MARKER_REASON), 'stdout claims nothing was created');
  const entries = fs.readdirSync(dir);
  assert.deepStrictEqual(entries, [],
    `the directory must be exactly as empty as it started; found: ${JSON.stringify(entries)}`);
});

// ---------------------------------------------------------------------------
// REGRESSION-FENCE cases — evidenced markers still scaffold, unchanged.
// ---------------------------------------------------------------------------

function assertScaffolded(dir) {
  for (const sub of ['vision', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done']) {
    assert.ok(exists(path.join(dir, 'plans', sub)),
      `an evidenced project must still scaffold plans/${sub}`);
  }
}

// Case 4 — a git repository IS scaffolded.
test('a git repository is scaffolded (evidenced marker, unchanged)', () => {
  const dir = mkTmp();
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  runHook(dir);
  assertScaffolded(dir);
});

// Case 5 — a project-file root IS scaffolded.
test('a package.json root is scaffolded (evidenced marker, unchanged)', () => {
  const dir = mkTmp();
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x"}\n');
  runHook(dir);
  assertScaffolded(dir);
});

// Case 6 — a real CTOC project IS scaffolded.
test('a real CTOC project is scaffolded (evidenced marker, unchanged)', () => {
  const dir = mkTmp();
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.ctoc', 'settings.yaml'), 'general:\n  name: x\n');
  runHook(dir);
  assertScaffolded(dir);
});

// Case 7 — a bare `.ctoc` holding nothing is not a project.
test('a bare .ctoc holding nothing is not a project and is not scaffolded', () => {
  const dir = mkTmp();
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true }); // no settings, no plans sibling
  assert.notStrictEqual(describeProjectRoot(dir).marker, 'ctoc',
    'a bare .ctoc (the crypto home shape) must not resolve as a CTOC project');
  runHook(dir);
  assert.ok(!exists(path.join(dir, 'plans')),
    'an unidentified bare-.ctoc directory must not be scaffolded');
});

// Case 8 — a nested repository is not scaffolded from the outer one.
test('a nested repository resolves to itself and does not scaffold the outer project', () => {
  const outer = mkTmp();
  fs.mkdirSync(path.join(outer, '.ctoc'), { recursive: true });
  fs.writeFileSync(path.join(outer, '.ctoc', 'settings.yaml'), 'general:\n  name: outer\n');
  fs.mkdirSync(path.join(outer, 'plans'), { recursive: true });
  const inner = path.join(outer, 'inner');
  fs.mkdirSync(path.join(inner, '.git'), { recursive: true });

  assert.strictEqual(describeProjectRoot(inner).root, inner,
    'the boundary rule must resolve the INNER repository as the root');
  runHook(inner);
  assert.ok(!exists(path.join(outer, 'plans', 'vision')),
    'the outer project\'s plans/ must gain nothing from a session in the inner repository');
});

// Case 11 — a home directory carrying `~/.ctoc` does not capture a project.
test('a stand-in home carrying ~/.ctoc does not capture a project beneath it', () => {
  const home = mkTmp();
  fs.mkdirSync(path.join(home, '.ctoc'), { recursive: true });
  fs.writeFileSync(path.join(home, '.ctoc', '.secret'), 'k'); // what crypto.js creates
  const project = path.join(home, 'project');
  fs.mkdirSync(project, { recursive: true });

  assert.notStrictEqual(describeProjectRoot(project).root, home,
    'resolution must not over-root to a home directory whose only .ctoc is the crypto home');
  runHook(project);
  assert.ok(!exists(path.join(home, 'plans')),
    'the stand-in home must never be scaffolded');
});

// Case 12 — the hook fails open on an unwritable scaffold target.
test('the hook fails open when a scaffold target cannot be created', () => {
  const dir = mkTmp();
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true }); // evidenced -> scaffolding attempted
  fs.writeFileSync(path.join(dir, 'plans'), 'not a directory'); // plans is a FILE (file-as-directory)
  const { stdout, exitCode } = runHook(dir);
  assert.strictEqual(exitCode, 0, 'a broken filesystem must never crash session start');
  assert.ok(stdout.includes('CTOC v'), 'the hook must still emit its context');
});
