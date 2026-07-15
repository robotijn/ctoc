'use strict';

/**
 * Full-flow coverage for src/commands/update.js.
 *
 * The existing update*.test.js files exercise updateInstalledPlugins and the
 * refresh helpers. This file drives the parts that were uncovered (48% → high):
 *   - run()                 (git wrapper: success + thrown failure)
 *   - getCurrentVersion()   (CLAUDE_PLUGIN_ROOT branch, scriptDir branch,
 *                            cache-dir fallback, and the "unknown" last resort)
 *   - getLatestVersion()    (present + missing VERSION)
 *   - update()              (clone path, fetch/reset path, already-up-to-date,
 *                            fetch failure exit(1), missing-version exit(1),
 *                            corrupt-registry exit(1), old-version cleanup,
 *                            after-update CLAUDE.md refresh)
 *   - the `require.main === module` entrypoint (file run directly as main)
 *
 * METHOD — no doubles of the module's own logic. update()'s ONLY external
 * boundary is `git` (via execSync) and the home directory (via os.homedir()).
 * os.homedir() honours $HOME on POSIX / %USERPROFILE% on Windows, so a child
 * process launched with a relocated HOME moves EVERY module-level path constant
 * (PLUGINS_DIR / MARKETPLACE_DIR / CACHE_DIR / INSTALLED_FILE) into a real temp
 * tree. `git` is replaced by a real fake executable on PATH (a genuine external
 * boundary) so no network is touched. Everything else is the real update.js code
 * running against real temp-dir fixtures. update() calls process.exit on its
 * error paths, so those paths MUST be driven in a subprocess — an in-process
 * call would kill the test runner.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const UPDATE_JS = path.join(REPO_ROOT, 'src', 'commands', 'update.js');
const SAFE_FS_JS = path.join(REPO_ROOT, 'src', 'lib', 'safe-fs.js');
const { START_MARKER } = require('../src/lib/claude-md-lessons');
const { BEGIN_MARKER } = require('../src/lib/operating-manual');

const NEW_VERSION = '9.9.9';
const OLD_VERSION = '1.0.0';

// ── temp-dir bookkeeping ─────────────────────────────────────────────────────
const tmpDirs = [];
function mkTmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}
function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}
function cleanup() {
  while (tmpDirs.length) rmrf(tmpDirs.pop());
}

// ── fake git on PATH (the only external boundary) ────────────────────────────
// A real executable named `git` (git.cmd on Windows) that shells to a small
// Node script. Behaviour is steered by FAKE_GIT_* env vars so a single binary
// serves every scenario. Returns the bin directory to prepend to PATH.
function installFakeGit() {
  const binDir = mkTmp('ctoc-fakebin-');
  const fakeJs = path.join(binDir, 'fake-git.js');
  fs.writeFileSync(fakeJs, `
    'use strict';
    const fs = require('fs');
    const path = require('path');
    const argv = process.argv.slice(2);
    // strip "-C <dir>" — the fake does not need the working dir
    const a = argv.slice();
    const ci = a.indexOf('-C');
    if (ci !== -1) a.splice(ci, 2);
    const sub = a[0];
    if (sub === 'clone') {
      const dir = a[a.length - 1];
      fs.mkdirSync(dir, { recursive: true });
      fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
      if (process.env.FAKE_GIT_CLONE_VERSION) {
        fs.writeFileSync(path.join(dir, 'VERSION'), process.env.FAKE_GIT_CLONE_VERSION);
      }
      fs.writeFileSync(path.join(dir, 'README.md'), 'fake clone\\n');
      process.exit(0);
    }
    if (sub === 'fetch') { process.exit(process.env.FAKE_GIT_FETCH_FAIL ? 1 : 0); }
    if (sub === 'reset') { process.exit(0); }
    if (sub === 'rev-parse') { process.stdout.write('abc1234\\n'); process.exit(0); }
    process.exit(0);
  `);
  if (process.platform === 'win32') {
    fs.writeFileSync(
      path.join(binDir, 'git.cmd'),
      `@echo off\r\n"${process.execPath}" "${fakeJs}" %*\r\n`
    );
  } else {
    const launcher = path.join(binDir, 'git');
    fs.writeFileSync(launcher, `#!/bin/sh\nexec "${process.execPath}" "${fakeJs}" "$@"\n`);
    fs.chmodSync(launcher, 0o755);
  }
  return binDir;
}

// A real MARKETPLACE dir. withGit → a `.git` marker so update() takes the
// fetch/reset path; withVersion → a VERSION file; withLib → the three lib
// modules + two templates the refreshers need (mirrors the self-delete test).
function seedMarketplace(home, { withGit, withVersion, withLib }) {
  const market = path.join(home, '.claude', 'plugins', 'marketplaces', 'robotijn');
  fs.mkdirSync(market, { recursive: true });
  if (withGit) fs.mkdirSync(path.join(market, '.git'), { recursive: true });
  if (withVersion) fs.writeFileSync(path.join(market, 'VERSION'), NEW_VERSION);
  if (withLib) {
    const libDst = path.join(market, 'src', 'lib');
    const tplDst = path.join(market, '.ctoc', 'templates');
    fs.mkdirSync(libDst, { recursive: true });
    fs.mkdirSync(tplDst, { recursive: true });
    for (const f of ['operating-manual.js', 'claude-md-lessons.js', 'safe-fs.js']) {
      fs.copyFileSync(path.join(REPO_ROOT, 'src', 'lib', f), path.join(libDst, f));
    }
    for (const t of ['operating-manual.md', 'operating-lessons.md']) {
      fs.copyFileSync(path.join(REPO_ROOT, '.ctoc', 'templates', t), path.join(tplDst, t));
    }
  }
  return market;
}

function cacheDir(home) {
  return path.join(home, '.claude', 'plugins', 'cache', 'robotijn', 'ctoc');
}
function installedFile(home) {
  return path.join(home, '.claude', 'plugins', 'installed_plugins.json');
}

// A real project cwd so refreshLocalManual's looksLikeProject gate passes.
function makeProject() {
  const proj = mkTmp('ctoc-proj-');
  fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({ name: 'fixture' }));
  fs.writeFileSync(path.join(proj, 'CLAUDE.md'), '# Fixture\n\nExisting prose.\n');
  return proj;
}

// A dir holding a VERSION file, used as CLAUDE_PLUGIN_ROOT to pin currentVersion.
function pluginRootWithVersion(v) {
  const d = mkTmp('ctoc-pluginroot-');
  fs.writeFileSync(path.join(d, 'VERSION'), v);
  return d;
}

// Run the REAL update.js as the main module (covers require.main === module).
function runUpdateAsMain({ home, cwd, pluginRoot, extraEnv = {} }) {
  const binDir = installFakeGit();
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  env.PATH = binDir + path.delimiter + process.env.PATH;
  if (pluginRoot) env.CLAUDE_PLUGIN_ROOT = pluginRoot;
  else delete env.CLAUDE_PLUGIN_ROOT;
  Object.assign(env, extraEnv);
  return spawnSync(process.execPath, [UPDATE_JS], { cwd, env, encoding: 'utf8' });
}

// ── update() : happy clone path ──────────────────────────────────────────────
test('update clones fresh, installs to cache, and registers ctoc when no .git exists', () => {
  try {
    const home = mkTmp('ctoc-home-');
    const proj = makeProject();
    // MARKETPLACE exists but has NO .git → exercises the rmSync+clone branch.
    fs.mkdirSync(path.join(home, '.claude', 'plugins', 'marketplaces', 'robotijn'), { recursive: true });
    const pluginRoot = pluginRootWithVersion(OLD_VERSION);

    const r = runUpdateAsMain({
      home, cwd: proj, pluginRoot,
      extraEnv: { FAKE_GIT_CLONE_VERSION: NEW_VERSION }
    });

    assert.strictEqual(r.status, 0, `expected clean exit, got ${r.status}\n${r.stderr}`);
    assert.match(r.stdout, /Cloned fresh from GitHub/, 'clone branch must run when no .git present');
    assert.match(r.stdout, new RegExp(`Updated to CTOC v${NEW_VERSION}`));
    assert.ok(fs.existsSync(path.join(cacheDir(home), NEW_VERSION)),
      'the new version must be installed into the cache');
    const reg = JSON.parse(fs.readFileSync(installedFile(home), 'utf8'));
    assert.strictEqual(reg.plugins['ctoc@robotijn'][0].version, NEW_VERSION,
      'the registry must record the freshly-installed ctoc version');
  } finally {
    cleanup();
  }
});

// ── update() : fetch/reset path + old-version cleanup + CLAUDE.md refresh ─────
test('update fetches existing checkout, removes stale cache versions, and refreshes CLAUDE.md', () => {
  try {
    const home = mkTmp('ctoc-home-');
    const proj = makeProject();
    seedMarketplace(home, { withGit: true, withVersion: true, withLib: true });
    // A stale cache version that must be cleaned out.
    fs.mkdirSync(path.join(cacheDir(home), '0.0.1'), { recursive: true });
    // A pre-existing cache dir for the NEW version → exercises the rmSync branch
    // that clears a stale install of the same version before reinstalling.
    const preexisting = path.join(cacheDir(home), NEW_VERSION);
    fs.mkdirSync(preexisting, { recursive: true });
    fs.writeFileSync(path.join(preexisting, 'STALE.txt'), 'stale install\n');
    const pluginRoot = pluginRootWithVersion(OLD_VERSION);

    const r = runUpdateAsMain({ home, cwd: proj, pluginRoot });

    assert.strictEqual(r.status, 0, `expected clean exit, got ${r.status}\n${r.stderr}`);
    assert.match(r.stdout, /Removed: 0\.0\.1/, 'the stale cache version must be removed');
    assert.ok(!fs.existsSync(path.join(cacheDir(home), '0.0.1')),
      'the stale version dir must be gone from disk');
    assert.ok(!fs.existsSync(path.join(preexisting, 'STALE.txt')),
      'a pre-existing install of the same version must be wiped before reinstall');

    const claudeMd = fs.readFileSync(path.join(proj, 'CLAUDE.md'), 'utf8');
    assert.ok(claudeMd.includes(START_MARKER),
      'the lessons block must be refreshed into CLAUDE.md after a successful update');
    assert.ok(claudeMd.includes(BEGIN_MARKER),
      'the operating-manual block must be refreshed into CLAUDE.md after a successful update');
    assert.ok(claudeMd.includes('Existing prose.'),
      'existing user prose must be preserved through the refresh');
  } finally {
    cleanup();
  }
});

// ── update() : already up to date (short-circuit + default-ctocRoot refresh) ──
test('update reports already-up-to-date and still refreshes CLAUDE.md when versions match', () => {
  try {
    const home = mkTmp('ctoc-home-');
    const proj = makeProject();
    seedMarketplace(home, { withGit: true, withVersion: true, withLib: false });
    // currentVersion == newVersion → the up-to-date branch. No CLAUDE_PLUGIN_ROOT
    // lib seeding needed: the up-to-date refresh uses the DEFAULT ctocRoot (the
    // real repo), so it reads the real templates/modules and writes to proj.
    const pluginRoot = pluginRootWithVersion(NEW_VERSION);

    const r = runUpdateAsMain({ home, cwd: proj, pluginRoot });

    assert.strictEqual(r.status, 0, `expected clean exit, got ${r.status}\n${r.stderr}`);
    assert.match(r.stdout, new RegExp(`Already up to date \\(v${NEW_VERSION}\\)`));
    // The up-to-date path must NOT install a new cache version.
    assert.ok(!fs.existsSync(path.join(cacheDir(home), NEW_VERSION)),
      'no cache install should happen when already up to date');
    const claudeMd = fs.readFileSync(path.join(proj, 'CLAUDE.md'), 'utf8');
    assert.ok(claudeMd.includes(START_MARKER) && claudeMd.includes(BEGIN_MARKER),
      'the up-to-date branch must still refresh both managed CLAUDE.md blocks');
  } finally {
    cleanup();
  }
});

// ── update() : git fetch failure → non-zero exit ─────────────────────────────
test('update exits non-zero with a network hint when git fetch fails', () => {
  try {
    const home = mkTmp('ctoc-home-');
    const proj = makeProject();
    seedMarketplace(home, { withGit: true, withVersion: true, withLib: false });
    const pluginRoot = pluginRootWithVersion(OLD_VERSION);

    const r = runUpdateAsMain({
      home, cwd: proj, pluginRoot,
      extraEnv: { FAKE_GIT_FETCH_FAIL: '1' }
    });

    assert.notStrictEqual(r.status, 0, 'a git fetch failure must abort with a non-zero exit');
    assert.match(r.stderr + r.stdout, /Failed to fetch from GitHub/,
      'the failure must surface a network hint to the user');
  } finally {
    cleanup();
  }
});

// ── update() : marketplace has no VERSION → cannot determine latest → exit ────
test('update exits non-zero when the latest version cannot be determined', () => {
  try {
    const home = mkTmp('ctoc-home-');
    const proj = makeProject();
    // .git present so fetch/reset succeed, but NO VERSION file → getLatestVersion null.
    seedMarketplace(home, { withGit: true, withVersion: false, withLib: false });
    // No CLAUDE_PLUGIN_ROOT → getCurrentVersion falls through to the real repo
    // scriptDir VERSION (covers that branch); the value is irrelevant here.

    const r = runUpdateAsMain({ home, cwd: proj, pluginRoot: null });

    assert.notStrictEqual(r.status, 0, 'a missing latest version must abort with a non-zero exit');
    assert.match(r.stderr + r.stdout, /Could not determine latest version/);
  } finally {
    cleanup();
  }
});

// ── update() : corrupt registry → abort-not-clobber → exit ───────────────────
test('update exits non-zero and preserves a corrupt registry instead of clobbering it', () => {
  try {
    const home = mkTmp('ctoc-home-');
    const proj = makeProject();
    seedMarketplace(home, { withGit: true, withVersion: true, withLib: false });
    // Pre-seed a corrupt installed_plugins.json — update() must abort at the
    // registry step and leave the bytes exactly as found.
    const reg = installedFile(home);
    fs.mkdirSync(path.dirname(reg), { recursive: true });
    const corrupt = '{ not: valid json ';
    fs.writeFileSync(reg, corrupt);
    const pluginRoot = pluginRootWithVersion(OLD_VERSION);

    const r = runUpdateAsMain({ home, cwd: proj, pluginRoot });

    assert.notStrictEqual(r.status, 0, 'a corrupt registry must abort the update');
    assert.match(r.stderr + r.stdout, /corrupt/i, 'the abort reason must mention corruption');
    assert.strictEqual(fs.readFileSync(reg, 'utf8'), corrupt,
      'the corrupt registry bytes must be left untouched (abort-not-clobber)');
  } finally {
    cleanup();
  }
});

// ── update() : plugin-root set but VERSION missing → inner-false branch ───────
test('update falls back past an empty CLAUDE_PLUGIN_ROOT to determine the current version', () => {
  try {
    const home = mkTmp('ctoc-home-');
    const proj = makeProject();
    seedMarketplace(home, { withGit: true, withVersion: true, withLib: false });
    // CLAUDE_PLUGIN_ROOT points at a dir with NO VERSION → getCurrentVersion must
    // skip it and derive from the real repo scriptDir VERSION. The real repo
    // version differs from 9.9.9, so this still takes the full update path.
    const emptyRoot = mkTmp('ctoc-emptyroot-');

    const r = runUpdateAsMain({ home, cwd: proj, pluginRoot: emptyRoot });

    assert.strictEqual(r.status, 0, `expected clean exit, got ${r.status}\n${r.stderr}`);
    assert.match(r.stdout, new RegExp(`Updated to CTOC v${NEW_VERSION}`),
      'update must proceed using the scriptDir-derived current version');
  } finally {
    cleanup();
  }
});

// ── getCurrentVersion() : cache-dir fallback + "unknown" last resort ──────────
// These branches only fire when the module runs from an install tree that has NO
// VERSION two dirs up (the shipped module always has one). Stand up a real copy
// of update.js + safe-fs.js under a VERSION-less root, relocate HOME, and drive
// getCurrentVersion directly — no doubles, real filesystem.
function buildVersionlessModule() {
  const root = mkTmp('ctoc-noversion-');
  fs.mkdirSync(path.join(root, 'src', 'commands'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'lib'), { recursive: true });
  fs.copyFileSync(UPDATE_JS, path.join(root, 'src', 'commands', 'update.js'));
  fs.copyFileSync(SAFE_FS_JS, path.join(root, 'src', 'lib', 'safe-fs.js'));
  // deliberately NO VERSION file at root
  return path.join(root, 'src', 'commands', 'update.js');
}

function callGetCurrentVersion(home, copiedModule) {
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  delete env.CLAUDE_PLUGIN_ROOT;
  const script = `process.stdout.write(String(require(${JSON.stringify(copiedModule)}).getCurrentVersion()))`;
  return spawnSync(process.execPath, ['-e', script], { env, encoding: 'utf8' });
}

test('getCurrentVersion derives the version from a lone cache directory when no VERSION file exists', () => {
  try {
    const home = mkTmp('ctoc-home-');
    const copied = buildVersionlessModule();
    // exactly one version dir in the cache → that name is the current version
    fs.mkdirSync(path.join(cacheDir(home), '7.7.7'), { recursive: true });

    const r = callGetCurrentVersion(home, copied);

    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(r.stdout.trim(), '7.7.7',
      'a single cache version dir must be reported as the current version');
  } finally {
    cleanup();
  }
});

test('getCurrentVersion returns "unknown" when no VERSION file and the cache is ambiguous', () => {
  try {
    const home = mkTmp('ctoc-home-');
    const copied = buildVersionlessModule();
    // two version dirs → ambiguous, cannot pick one → "unknown"
    fs.mkdirSync(path.join(cacheDir(home), '7.7.7'), { recursive: true });
    fs.mkdirSync(path.join(cacheDir(home), '8.8.8'), { recursive: true });

    const r = callGetCurrentVersion(home, copied);

    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(r.stdout.trim(), 'unknown',
      'an ambiguous cache with no VERSION file must yield "unknown"');
  } finally {
    cleanup();
  }
});

test('getCurrentVersion returns "unknown" when neither a VERSION file nor any cache exists', () => {
  try {
    const home = mkTmp('ctoc-home-');
    const copied = buildVersionlessModule();
    // no cache dir at all → existsSync(CACHE_DIR) is false → "unknown"

    const r = callGetCurrentVersion(home, copied);

    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(r.stdout.trim(), 'unknown',
      'with no VERSION file and no cache, the version is unknown');
  } finally {
    cleanup();
  }
});
