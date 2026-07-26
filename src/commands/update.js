#!/usr/bin/env node
/**
 * CTOC Self-Updater
 * Works around Claude Code plugin cache bug
 *
 * Issues: #21995, #16866, #14061
 */

const safeFs = require('../lib/safe-fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { requestExit } = require('../lib/request-exit');

// os.homedir() always resolves the home directory (from the OS, not just env
// vars), so `path.join(HOME, ...)` below can never receive undefined and throw at
// module load when HOME/USERPROFILE happen to be unset.
const HOME = os.homedir();
const PLUGINS_DIR = path.join(HOME, '.claude', 'plugins');
const MARKETPLACE_DIR = path.join(PLUGINS_DIR, 'marketplaces', 'robotijn');
const CACHE_DIR = path.join(PLUGINS_DIR, 'cache', 'robotijn', 'ctoc');
const INSTALLED_FILE = path.join(PLUGINS_DIR, 'installed_plugins.json');

/**
 * Refresh the local project's CTOC-managed operating-lessons block. Fail-open:
 * a lessons-injection failure is logged to stderr and NEVER aborts the version update.
 *
 * `ctocRoot` is the installed CTOC plugin root to resolve BOTH the lib module and
 * its template FROM. The after-update call site MUST pass the freshly-installed,
 * never-deleted cache version dir: the "Clean old versions" step deletes the OLD
 * dir this script runs from, so a `__dirname`-relative require/template read would
 * hit ENOENT and (fail-open) silently skip the refresh. Defaults to the current
 * install (`__dirname`/../..) — correct only on the up-to-date path, where the
 * running dir is not deleted.
 *
 * @param {string} [ctocRoot] - Absolute path to the surviving CTOC install root.
 */
function refreshLocalLessons(ctocRoot = path.resolve(__dirname, '..', '..')) {
  try {
    // ctocRoot is a CTOC-controlled install path (a default from __dirname or the
    // freshly-installed cache version dir), never user input — the require must be
    // resolved FROM the surviving install so a self-deleted old dir cannot ENOENT it.
    // eslint-disable-next-line security/detect-non-literal-require
    const { ensureLessonsBlock } = require(path.join(ctocRoot, 'src', 'lib', 'claude-md-lessons'));
    const claudeMdPath = path.join(process.cwd(), 'CLAUDE.md');
    ensureLessonsBlock(claudeMdPath, ctocRoot);
  } catch (err) {
    console.error('[CTOC] Lessons block refresh skipped:', err.message);
  }
}

/**
 * Refresh the local project's CTOC-managed operating-manual block (generic craft
 * layer). Only runs when cwd looks like a project (has package.json OR .ctoc/) so
 * `/ctoc:update` never writes a stray CLAUDE.md into a non-project directory.
 * Fail-open: a merge failure is logged to stderr and NEVER aborts the update.
 *
 * See {@link refreshLocalLessons} for why `ctocRoot` must be the surviving,
 * freshly-installed cache dir on the after-update path (self-delete safety).
 *
 * @param {string} [ctocRoot] - Absolute path to the surviving CTOC install root.
 */
function refreshLocalManual(ctocRoot = path.resolve(__dirname, '..', '..')) {
  try {
    const cwd = process.cwd();
    const looksLikeProject =
      safeFs.existsSync(path.join(cwd, 'package.json')) ||
      safeFs.existsSync(path.join(cwd, '.ctoc'));
    if (!looksLikeProject) return;
    // ctocRoot is a CTOC-controlled install path (see refreshLocalLessons), never
    // user input; resolved FROM the surviving install for self-delete safety.
    // eslint-disable-next-line security/detect-non-literal-require
    const { mergeOperatingManual } = require(path.join(ctocRoot, 'src', 'lib', 'operating-manual'));
    mergeOperatingManual(cwd, { ctocRoot });
  } catch (err) {
    console.error('[CTOC] Operating-manual block refresh skipped:', err.message);
  }
}

/**
 * Mirror `srcDir` into `dstDir` (a sync-WITH-DELETE, like `rsync --delete`), so the
 * destination becomes an EXACT copy of the source:
 *   - every source file/dir is copied/overwritten into the destination, AND
 *   - every destination file/dir that does NOT exist in the source is PRUNED.
 *
 * This is the fix for orphaned command files: when a slash command is renamed away
 * upstream (e.g. `menu.md` → `start.md`), a plain add/overwrite copy (`cpSync`) leaves
 * the stale `menu.md` behind in the installed cache forever. Mirroring deletes it.
 *
 * SURGICAL by design — it never `rmSync`s the whole destination tree, only the specific
 * entries absent from the source. That is what makes it safe to run against the cache
 * version dir this very process may be EXECUTING from (the up-to-date path): the running
 * module's file survives (it exists in the source), and even an overwrite is harmless
 * because Node has already loaded it into memory.
 *
 * Errors SURFACE — there is deliberately no try/catch swallowing a failed copy or prune,
 * so a broken mirror is a loud failure, never a silent default-to-success (false-green).
 *
 * @param {string} srcDir - source directory (the freshly-fetched marketplace tree).
 * @param {string} dstDir - destination directory (the installed cache version dir).
 * @param {{ exclude?: string[] }} [options] - top-level entry names to leave untouched
 *   in BOTH copy and prune (e.g. `.git`, which the cache must never carry). Applies only
 *   at the top level; nested trees are mirrored in full.
 */
function mirrorDir(srcDir, dstDir, options = {}) {
  const exclude = new Set(options.exclude || []);
  // A missing source must NEVER be treated as "an empty source" — mirroring from it
  // would prune the destination to nothing. Fail loudly instead of silently wiping.
  if (!safeFs.existsSync(srcDir)) {
    throw new Error(`mirrorDir: source directory does not exist: ${srcDir}`);
  }
  if (!safeFs.existsSync(dstDir)) {
    safeFs.mkdirSync(dstDir, { recursive: true });
  }

  const srcEntries = safeFs.readdirSync(srcDir).filter(name => !exclude.has(name));
  const keep = new Set(srcEntries);

  // PRUNE: delete anything in the destination that is not in the source (excluded
  // names are left exactly as found — never copied, never pruned).
  for (const name of safeFs.readdirSync(dstDir)) {
    if (exclude.has(name)) continue;
    if (!keep.has(name)) {
      safeFs.rmSync(path.join(dstDir, name), { recursive: true, force: true });
    }
  }

  // COPY/OVERWRITE: mirror each source entry into the destination.
  for (const name of srcEntries) {
    const s = path.join(srcDir, name);
    const d = path.join(dstDir, name);
    // lstat (not stat) so a symlink is treated as a leaf, never followed as a dir.
    const st = safeFs.lstatSync(s);
    if (st.isDirectory()) {
      mirrorDir(s, d);   // recurse; exclude applies to the top level only
    } else {
      // If the destination has a directory where the source has a file, clear it first
      // so copyFileSync cannot fail writing a file over a directory.
      if (safeFs.existsSync(d) && safeFs.lstatSync(d).isDirectory()) {
        safeFs.rmSync(d, { recursive: true, force: true });
      }
      safeFs.copyFileSync(s, d);
    }
  }
}

/**
 * The load-bearing entry points a COMPLETE CTOC plugin checkout must contain. If any
 * is missing, the checkout is thin/partial (a failed clone, an interrupted reset) and
 * mirroring-with-prune from it would DELETE live files — including the slash commands —
 * out of the installed cache, leaving the user with no `/ctoc:start`. Relative paths,
 * joined against the candidate source dir.
 */
const REQUIRED_SOURCE_PATHS = [
  path.join('.claude-plugin', 'plugin.json'),
  'VERSION',
  path.join('src', 'commands', 'start.js'),
  path.join('src', 'commands', 'start.md'),
  path.join('src', 'commands', 'push.md'),
  path.join('src', 'commands', 'update.md'),
];

/**
 * Verify a candidate marketplace source is a COMPLETE plugin tree before it is used
 * as the source of a mirror-with-prune. Returns `{ ok, missing }`; `ok` is true only
 * when every REQUIRED_SOURCE_PATHS entry exists. This is the guard that makes a broken
 * fetch a NO-OP that leaves the installed cache untouched, instead of a prune that
 * wipes the user's working commands. Pure and side-effect-free — safe to unit-test.
 *
 * @param {string} dir - Absolute path to the candidate source (MARKETPLACE_DIR).
 * @returns {{ ok: boolean, missing: string[] }}
 */
function verifyCompleteSource(dir) {
  const missing = REQUIRED_SOURCE_PATHS.filter(
    rel => !safeFs.existsSync(path.join(dir, rel))
  );
  return { ok: missing.length === 0, missing };
}

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();
  } catch (e) {
    if (opts.silent) return null;
    throw e;
  }
}

function getCurrentVersion() {
  // Try CLAUDE_PLUGIN_ROOT env var
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (pluginRoot) {
    const versionFile = path.join(pluginRoot, 'VERSION');
    if (safeFs.existsSync(versionFile)) {
      return safeFs.readFileSync(versionFile, 'utf8').trim();
    }
  }
  // Derive from script location (e.g., .../ctoc/6.1.22/commands/update.js)
  const scriptDir = path.resolve(__dirname, '..', '..');
  const versionFile = path.join(scriptDir, 'VERSION');
  if (safeFs.existsSync(versionFile)) {
    return safeFs.readFileSync(versionFile, 'utf8').trim();
  }
  // Last resort: read from cache directory names
  if (safeFs.existsSync(CACHE_DIR)) {
    const versions = safeFs.readdirSync(CACHE_DIR).filter(d =>
      safeFs.statSync(path.join(CACHE_DIR, d)).isDirectory()
    );
    if (versions.length === 1) return versions[0];
  }
  return 'unknown';
}

function getLatestVersion() {
  const versionFile = path.join(MARKETPLACE_DIR, 'VERSION');
  if (safeFs.existsSync(versionFile)) {
    return safeFs.readFileSync(versionFile, 'utf8').trim();
  }
  return null;
}

/**
 * Merge the `ctoc@robotijn` entry into the Claude Code plugin registry, preserving every
 * other plugin's registration — with an ABORT-NOT-CLOBBER guarantee (finding M9).
 *
 * Behavior by state of `installedFile`:
 *   - MISSING (fresh install): starts from the `{ version: 2, plugins: {} }` default and
 *     writes it plus the ctoc entry. This is NOT corruption.
 *   - CORRUPT — either unparseable JSON, OR a parseable-but-wrong-shape value (null, an
 *     array, or an object whose `plugins` is not a non-null object): THROWS immediately
 *     and writes NOTHING, leaving the corrupt bytes exactly as found for manual repair.
 *     This prevents overwriting the registry with an empty default, which would
 *     deregister every other installed plugin.
 *   - VALID: preserves all other plugin entries byte-for-byte, preserves the prior ctoc
 *     `installedAt` if present, and writes the merged registry.
 *
 * @param {string} installedFile - Absolute path to installed_plugins.json (CTOC-computed
 *   or a test fixture — never raw user input).
 * @param {object} ctocEntry - The new ctoc@robotijn registration to merge in. Its
 *   `installedAt` is used only when no prior ctoc entry exists.
 * @returns {object} The `installed` registry object that was written.
 * @throws {Error} If the existing file is corrupt (unparseable or wrong-shape) — no write.
 */
function updateInstalledPlugins(installedFile, ctocEntry) {
  // Preserve existing plugins, only update ctoc. Default is used only for a fresh install.
  let installed = { version: 2, plugins: {} };

  if (safeFs.existsSync(installedFile)) {
    const raw = safeFs.readFileSync(installedFile, 'utf8');
    try {
      installed = JSON.parse(raw);
    } catch (err) {
      // Corrupt/unparseable JSON: abort WITHOUT writing so we never clobber the
      // registry and deregister every other plugin. The bytes are left untouched.
      throw new Error(
        'installed_plugins.json is corrupt (unparseable JSON); aborting to avoid ' +
        `clobbering the plugin registry. Inspect/repair: ${installedFile}`
      );
    }

    // A file can PARSE and still be the wrong shape (null, an array, or missing a
    // `plugins` object). Treat that as corruption too — abort without writing rather
    // than coerce it into a default that would drop other plugins' registrations.
    const validShape =
      installed !== null &&
      typeof installed === 'object' &&
      !Array.isArray(installed) &&
      installed.plugins !== null &&
      typeof installed.plugins === 'object' &&
      !Array.isArray(installed.plugins);

    if (!validShape) {
      throw new Error(
        'installed_plugins.json is corrupt (unexpected shape — expected an object with ' +
        `a "plugins" object); aborting to avoid clobbering the plugin registry. ` +
        `Inspect/repair: ${installedFile}`
      );
    }
  }

  // Preserve original installedAt if a prior ctoc entry exists.
  const existingEntry = installed.plugins['ctoc@robotijn']?.[0];
  const installedAt = existingEntry?.installedAt || ctocEntry.installedAt;

  installed.plugins['ctoc@robotijn'] = [{ ...ctocEntry, installedAt }];

  safeFs.writeFileSync(installedFile, JSON.stringify(installed, null, 2));
  return installed;
}

function update() {
  const currentVersion = getCurrentVersion();

  console.log('CTOC Update');
  console.log('─'.repeat(40));
  console.log(`Current version: ${currentVersion}`);

  // 1. Clone or fetch latest from GitHub
  console.log('\n1. Fetching latest from GitHub...');
  try {
    const hasGit = safeFs.existsSync(path.join(MARKETPLACE_DIR, '.git'));
    if (!hasGit) {
      // No .git dir — clone fresh (handles missing dir, broken state, cleared cache)
      if (safeFs.existsSync(MARKETPLACE_DIR)) {
        safeFs.rmSync(MARKETPLACE_DIR, { recursive: true });
      }
      safeFs.mkdirSync(MARKETPLACE_DIR, { recursive: true });
      run(`git clone https://github.com/robotijn/ctoc.git "${MARKETPLACE_DIR}"`);
      console.log('   Cloned fresh from GitHub');
    } else {
      run(`git -C "${MARKETPLACE_DIR}" fetch origin`);
      run(`git -C "${MARKETPLACE_DIR}" reset --hard origin/main`);
    }
  } catch (e) {
    console.error('   Failed to fetch from GitHub. Check network connection.');
    process.exit(1);
  }

  // 2. Get new version
  const newVersion = getLatestVersion();
  if (!newVersion) {
    console.error('   Could not determine latest version');
    process.exit(1);
  }
  console.log(`   Latest version: ${newVersion}`);

  // 2b. GUARD: never mirror-with-prune from a thin/partial checkout. Both sync paths
  // below (up-to-date self-heal and version-change install) prune the cache to match
  // this source; if a failed clone/reset left it missing the commands, that prune
  // would wipe `/ctoc:start` out of the install. A broken fetch must be a NO-OP that
  // leaves the working install exactly as it was, not a silent teardown.
  const srcCheck = verifyCompleteSource(MARKETPLACE_DIR);
  if (!srcCheck.ok) {
    console.error(
      `   Aborting: the fetched copy is incomplete (missing: ${srcCheck.missing.join(', ')}).`
    );
    console.error(
      '   Your installed CTOC was left untouched. Re-run /ctoc:update; if it repeats, ' +
      'reinstall from the marketplace.'
    );
    requestExit(1);
    return;
  }

  // 3. Check if already up to date
  if (currentVersion === newVersion) {
    console.log('\n' + '─'.repeat(40));
    console.log(`✓ Already up to date (v${newVersion})`);

    // Even when the version NUMBER is unchanged, the installed cache dir can still
    // hold ORPHANED files from a prior release whose command was renamed/removed
    // upstream (e.g. menu.md → start.md) — so a user keeps seeing a dead old command.
    // Mirror the marketplace into the cache dir, SURGICALLY pruning files-not-in-source.
    // CAUTION: this process is EXECUTING from cacheVersionDir on this path, so we must
    // NOT rmSync the whole dir; mirrorDir deletes only the orphans and overwrites
    // changed files, leaving the running module (and the lazy requires below) intact.
    const cacheVersionDir = path.join(CACHE_DIR, newVersion);
    if (safeFs.existsSync(cacheVersionDir)) {
      mirrorDir(MARKETPLACE_DIR, cacheVersionDir, { exclude: ['.git'] });
      console.log('   Synced cache with marketplace (pruned any orphaned files)');
      // Pass the surviving, freshly-mirrored dir so the require/template reads resolve
      // from it (mirrors the after-update self-delete-safety contract).
      refreshLocalLessons(cacheVersionDir);
      refreshLocalManual(cacheVersionDir);
    } else {
      // No installed cache dir for this version (unusual on the up-to-date path) —
      // refresh from the default running install instead of a nonexistent dir.
      refreshLocalLessons();
      refreshLocalManual();
    }
    return;
  }

  console.log(`\n   Updating: ${currentVersion} → ${newVersion}`);

  // 4. Get commit SHA
  const commitSha = run(`git -C "${MARKETPLACE_DIR}" rev-parse --short HEAD`);

  // 5. Copy to cache
  const cacheVersionDir = path.join(CACHE_DIR, newVersion);
  console.log('\n2. Installing to cache...');

  // Mirror the marketplace into the cache version dir: an EXACT copy, pruning any
  // stale orphan left by a previous install of the same version (a plain cpSync only
  // adds/overwrites and would carry a renamed-away file forward). `.git` is excluded —
  // the cache must never carry the source's git history.
  mirrorDir(MARKETPLACE_DIR, cacheVersionDir, { exclude: ['.git'] });
  console.log(`   Installed to: ${cacheVersionDir}`);

  // 6. Update installed_plugins.json
  //
  // ABORT-NOT-CLOBBER contract (finding M9): if the existing registry is corrupt
  // (unparseable JSON, or a parseable-but-wrong-shape value), updateInstalledPlugins
  // THROWS without writing — so a transient corruption can never deregister every
  // other installed plugin by overwriting the file with an empty default. A missing
  // file (fresh install) is not corruption and writes the default normally.
  console.log('\n3. Updating plugin registry...');

  const ctocEntry = {
    scope: 'user',
    installPath: cacheVersionDir,
    version: newVersion,
    installedAt: new Date().toISOString(),   // used only if no prior entry exists
    lastUpdated: new Date().toISOString(),
    gitCommitSha: commitSha
  };

  try {
    updateInstalledPlugins(INSTALLED_FILE, ctocEntry);
  } catch (err) {
    console.error(`   ${err.message}`);
    process.exit(1);
  }
  console.log('   Registry updated');

  // 7. Clean old versions.
  //
  // CACHE_DIR provably exists here (we just installed newVersion into it), so the
  // enumeration cannot fail — and it is NOT wrapped in a catch that would mask a real
  // problem. Each removal is attempted individually: a failure is surfaced LOUDLY to
  // stderr, naming the specific dir + error, and the loop continues (a stale old dir is
  // best-effort housekeeping, never a reason to abort the completed install). The old
  // code wrapped the whole loop in one try/catch that printed "No old versions to
  // remove" on ANY failure — masking a real removal error as an empty list. That line
  // now prints ONLY when the list is genuinely empty.
  console.log('\n4. Cleaning old versions...');
  const oldVersions = safeFs.readdirSync(CACHE_DIR).filter(v => v !== newVersion);
  if (oldVersions.length === 0) {
    console.log('   No old versions to remove');
  } else {
    for (const v of oldVersions) {
      const dir = path.join(CACHE_DIR, v);
      try {
        safeFs.rmSync(dir, { recursive: true, force: true });
        console.log(`   Removed: ${v}`);
      } catch (err) {
        console.error(`   Failed to remove old version ${v} (${dir}): ${err.message}`);
      }
    }
  }

  // 7b. Refresh local CLAUDE.md managed blocks after a successful upgrade.
  // Pass the freshly-installed, NEVER-deleted cacheVersionDir: the "Clean old
  // versions" step above deleted the OLD dir this script runs from, so resolving
  // the require/template from __dirname would ENOENT and silently skip (fail-open).
  refreshLocalLessons(cacheVersionDir);   // (b) refresh after version change
  refreshLocalManual(cacheVersionDir);    // (b) refresh the operating-manual block too

  console.log('\n' + '─'.repeat(40));
  console.log(`✓ Updated to CTOC v${newVersion}`);
  console.log('\nRestart Claude Code for changes to take effect.');
}

if (require.main === module) {
  update();
}

module.exports = { update, updateInstalledPlugins, refreshLocalLessons, refreshLocalManual, getCurrentVersion, getLatestVersion, mirrorDir, verifyCompleteSource };
