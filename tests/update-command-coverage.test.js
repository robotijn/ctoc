'use strict';

/**
 * Non-obvious mutation-killing coverage for src/commands/update.js.
 *
 * The four existing update*.test.js files already drive the happy orchestration,
 * the registry abort-not-clobber contract, the self-delete refresh, and the
 * os.homedir() load guard. This file aims at DARK BRANCHES those files leave
 * unpinned — each test here goes RED under a specific one-line mutation:
 *
 *   Cluster A — refreshLocalManual's `looksLikeProject` gate (lines 65-68).
 *     The gate is `existsSync(package.json) || existsSync('.ctoc')` followed by
 *     `if (!looksLikeProject) return;`. Every existing refresh test uses a project
 *     with package.json, so BOTH the `.ctoc` second operand and the skip-return
 *     branch are never exercised. These two tests pin them.
 *
 *   Cluster B — updateInstalledPlugins' installedAt fallback (lines 181-182):
 *     `existingEntry?.installedAt || ctocEntry.installedAt`, where
 *     `existingEntry = installed.plugins['ctoc@robotijn']?.[0]`. Existing tests
 *     cover a prior entry WITH installedAt and a fresh install; they never cover
 *     a prior entry that is an empty array, nor a prior entry object missing
 *     installedAt — the exact inputs that exercise the optional-chaining guard
 *     and the SECOND operand of the `||`.
 *
 * ZERO doubles of the module's own logic. updateInstalledPlugins is the real
 * exported function (its only boundary is fs, driven against real os.tmpdir()
 * fixtures). refreshLocalManual is the real exported function; it reads the real
 * operating-manual template from the real repo (passed as ctocRoot) and writes
 * into a real temp cwd. process.cwd() is relocated with chdir and always
 * restored in `finally`.
 *
 * DOCUMENTED UNREACHABLE (honestly, not fabricated) — two regions the scoped
 * coverage report lists as uncovered on the REAL file cannot be reached by the
 * real module in-process/subprocess-attributed, so they are documented here
 * rather than faked:
 *
 *   - getCurrentVersion cache-dir fallback + "unknown" last resort (lines
 *     103-110). getCurrentVersion returns at the scriptDir-VERSION branch
 *     (`path.join(path.resolve(__dirname,'..','..'),'VERSION')`) whenever that
 *     file exists — and for the SHIPPED module that grandparent IS the repo
 *     root, which always ships a VERSION file. The only way to fall through to
 *     103-110 is to run a COPY of update.js from a tree with no VERSION two
 *     levels up (which update-full-flow.test.js does, in a subprocess). That
 *     copy lives at a different path, so its coverage is never attributed to
 *     `src/commands/update.js`. The logic is behaviourally tested; the real
 *     file's lines 103-110 are unreachable.
 *
 *   - clean-old-versions catch (lines 298-300). This fail-open catch wraps
 *     `readdirSync(CACHE_DIR)` + the rmSync loop. Step 5 of update()
 *     (`mkdirSync(cacheVersionDir, { recursive: true })`) always creates
 *     CACHE_DIR as a readable directory before step 7 reads it, so readdir
 *     cannot throw; the rmSync loop only throws on a permission revocation or
 *     filesystem race that the deterministic single-process flow never produces
 *     (and any permission-based trigger is bypassed by a root test runner, so it
 *     is not a repeatable test). It is defensive code, not reachable
 *     deterministically.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const { updateInstalledPlugins, refreshLocalManual } = require('../src/commands/update');
const { BEGIN_MARKER } = require('../src/lib/operating-manual');

// A defined, distinctive installedAt sentinel — never "now", so a fallback to
// ctocEntry.installedAt is observable and a mutant that yields undefined fails.
const NEW_INSTALLED_AT = '2099-12-31T00:00:00.000Z';

// ── temp-dir bookkeeping ─────────────────────────────────────────────────────
const tmpDirs = [];
function mkTmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}
function cleanup() {
  while (tmpDirs.length) {
    fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
  }
}

function registryFile(obj) {
  const dir = mkTmp('ctoc-reg-');
  const file = path.join(dir, 'installed_plugins.json');
  fs.writeFileSync(file, JSON.stringify(obj));
  return file;
}

function ctocEntry(overrides = {}) {
  return {
    scope: 'user',
    installPath: '/new/install/path',
    version: '9.9.9',
    installedAt: NEW_INSTALLED_AT,
    lastUpdated: NEW_INSTALLED_AT,
    gitCommitSha: 'deadbeef',
    ...overrides
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cluster A — refreshLocalManual's looksLikeProject gate
// ─────────────────────────────────────────────────────────────────────────────

test('refreshLocalManual_writes_block_when_only_dotctoc_marks_the_project', () => {
  // Arrange — a project marked ONLY by a .ctoc directory, NO package.json.
  // This is the SECOND operand of `existsSync(package.json) || existsSync('.ctoc')`;
  // a mutant that drops `|| existsSync('.ctoc')` would skip the refresh here.
  const proj = mkTmp('ctoc-dotctoc-');
  fs.mkdirSync(path.join(proj, '.ctoc'), { recursive: true });
  assert.equal(fs.existsSync(path.join(proj, 'package.json')), false,
    'precondition: the .ctoc-only project has no package.json');
  fs.writeFileSync(path.join(proj, 'CLAUDE.md'), '# Fixture\n\nUser prose kept.\n');
  const origCwd = process.cwd();
  let claudeMd;

  // Act
  try {
    process.chdir(proj);
    refreshLocalManual(REPO_ROOT);
    // Capture the result BEFORE cleanup removes the fixture from disk.
    claudeMd = fs.readFileSync(path.join(proj, 'CLAUDE.md'), 'utf8');
  } finally {
    process.chdir(origCwd);
    cleanup();
  }

  // Assert — the .ctoc marker alone must let the operating-manual block in,
  // and user prose outside the managed block must survive.
  assert.ok(claudeMd.includes(BEGIN_MARKER),
    'a .ctoc-only project must still receive the operating-manual block (|| second operand)');
  assert.ok(claudeMd.includes('User prose kept.'),
    'existing user prose must be preserved through the refresh');
});

test('refreshLocalManual_skips_and_creates_no_file_in_a_non_project_directory', () => {
  // Arrange — a bare directory with NEITHER package.json NOR .ctoc and NO CLAUDE.md.
  // The gate's `if (!looksLikeProject) return;` must fire; a mutant removing that
  // guard would call mergeOperatingManual and CREATE a stray CLAUDE.md here.
  const bare = mkTmp('ctoc-nonproject-');
  const origCwd = process.cwd();
  let createdClaudeMd;

  // Act
  try {
    process.chdir(bare);
    refreshLocalManual(REPO_ROOT);
    createdClaudeMd = fs.existsSync(path.join(bare, 'CLAUDE.md'));
  } finally {
    process.chdir(origCwd);
    cleanup();
  }

  // Assert — the gate must prevent any write into a non-project directory.
  assert.equal(createdClaudeMd, false,
    'refreshLocalManual must not create a stray CLAUDE.md when no project marker exists');
});

// ─────────────────────────────────────────────────────────────────────────────
// Cluster B — updateInstalledPlugins installedAt fallback (?.[0] and || operand)
// ─────────────────────────────────────────────────────────────────────────────

test('updateInstalledPlugins_falls_back_to_new_installedAt_when_prior_ctoc_array_is_empty', () => {
  // Arrange — prior ctoc registration is present but an EMPTY array, so
  // `installed.plugins['ctoc@robotijn']?.[0]` is undefined. A mutant that drops
  // the `?.` from `existingEntry?.installedAt` would dereference undefined and throw.
  const file = registryFile({ version: 2, plugins: { 'ctoc@robotijn': [] } });

  // Act
  updateInstalledPlugins(file, ctocEntry({ version: '9.9.9' }));

  // Assert — the empty array is replaced by a single entry whose installedAt is
  // the new entry's (there was no prior installedAt to preserve).
  const written = JSON.parse(fs.readFileSync(file, 'utf8')).plugins['ctoc@robotijn'];
  cleanup();
  assert.equal(written.length, 1, 'the empty prior array must be replaced by exactly one entry');
  assert.equal(written[0].installedAt, NEW_INSTALLED_AT,
    'with no prior entry, installedAt must fall back to the new entry value');
  assert.equal(written[0].version, '9.9.9', 'the new version must be recorded');
});

test('updateInstalledPlugins_falls_back_to_new_installedAt_when_prior_entry_has_none', () => {
  // Arrange — prior ctoc entry EXISTS but carries no installedAt field, so
  // `existingEntry?.installedAt` is undefined and the SECOND operand of the `||`
  // must supply the value. A mutant dropping `|| ctocEntry.installedAt` would
  // write installedAt: undefined (JSON-omitted).
  const file = registryFile({
    version: 2,
    plugins: { 'ctoc@robotijn': [{ scope: 'user', version: '1.0.0', installPath: '/old' }] }
  });

  // Act
  updateInstalledPlugins(file, ctocEntry({ version: '9.9.9', installedAt: NEW_INSTALLED_AT }));

  // Assert — installedAt is the new value, NOT undefined.
  const written = JSON.parse(fs.readFileSync(file, 'utf8')).plugins['ctoc@robotijn'][0];
  cleanup();
  assert.equal(written.installedAt, NEW_INSTALLED_AT,
    'a prior entry with no installedAt must fall back to the new entry installedAt (|| second operand)');
  assert.equal(written.version, '9.9.9', 'the version must be updated to the new one');
});
