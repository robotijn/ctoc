#!/usr/bin/env node
/**
 * CTOC Release Script
 * Updates version numbers across all version files
 *
 * VERSION file is the single source of truth.
 * This script syncs it to:
 *   - .claude-plugin/marketplace.json (marketplace version)
 *   - .claude-plugin/plugin.json (plugin version)
 *   - package.json (version only — license is a static value, not derived here)
 *   - Documentation files with version references
 *
 * Contract (W09-s1 / finding M7):
 *   - FAIL LOUD: any target that EXISTS but cannot be parsed, is missing an
 *     expected update path, or fails to write is collected as a named failure;
 *     main() returns 1 (non-zero exit) and prints the failing file names to
 *     stderr. A target that is simply not present is skipped, never a failure.
 *   - ATOMIC WRITE: every JSON target is written via atomicWriteFileSync
 *     (temp-file + rename), so a crash mid-write can never truncate the target
 *     and leaves no *.tmp-* residue.
 *
 * The production functions accept an optional `root` (defaulting to ROOT, which
 * honors CTOC_RELEASE_ROOT) so the real script is drivable against a fixture
 * both in-process and as a subprocess. Requiring this module does NOT run
 * main(); the CLI path is guarded by `require.main === module`.
 */

const safeFs = require('../lib/safe-fs');
const path = require('path');
const { computeDocCounts } = require('../lib/doc-counts');

const ROOT = process.env.CTOC_RELEASE_ROOT
  ? path.resolve(process.env.CTOC_RELEASE_ROOT)
  : path.resolve(__dirname, '..', '..');

// JSON files that need version updates
const JSON_VERSION_FILES = [
  {
    file: '.claude-plugin/marketplace.json',
    updates: [
      { path: ['metadata', 'version'] },
      { path: ['plugins', 0, 'version'] }
    ]
  },
  {
    file: '.claude-plugin/plugin.json',
    updates: [
      { path: ['version'] }
    ]
  },
  {
    file: 'package.json',
    updates: [
      { path: ['version'] }
    ]
  }
];

// Files with CTOC product version references to update
// Note: Schema versions (e.g., operations-registry.yaml) are separate
const VERSION_UPDATES = [
  {
    file: 'README.md',
    pattern: /^\*\*\d+\.\d+\.\d+\*\*/m,
    replacement: (v) => `**${v}**`
  },
  {
    file: 'README.md',
    pattern: /version-\d+\.\d+\.\d+-blue/g,
    replacement: (v) => `version-${v}-blue`
  },
  {
    file: 'README.md',
    pattern: /getVersion\(\)\s+\/\/\s*→\s*'\d+\.\d+\.\d+'/,
    replacement: (v) => `getVersion()       // → '${v}'`
  }
];

// The GROWING doc counts release.js keeps true in CLAUDE.md (plan 00215). Each
// entry names a computeDocCounts field and a LINE-TARGETED pattern that captures
// the prose around the integer, so only the number is rewritten — never a
// structural change, exactly like the version replacements above. FIXED contracts
// (slash commands, hooks, tabs) are deliberately NOT here: a change to those is a
// real event that stays policed by exact-equality tests, never auto-rewritten.
const COUNT_UPDATES = [
  { field: 'testFiles', label: 'testFiles', pattern: /(Run all )\d+( test files)/ },
  { field: 'testFiles', label: 'testFiles', pattern: /(tests\/\s+)\d+( test files)/ },
  { field: 'libModules', label: 'libModules', pattern: /(lib\/\s+)\d+( JS modules)/ },
  { field: 'agents', label: 'agents', pattern: /(agents\/\s+)\d+( agent definitions)/ },
  { field: 'skills', label: 'skills', pattern: /(skills\/\s+)\d+( skill files)/ },
];

/**
 * Atomically write `data` to `filePath`: write to a sibling temp file in the
 * SAME directory, then rename it over the target. A same-directory rename is
 * atomic on POSIX and uses MoveFileEx on Windows, so a crash can never leave a
 * half-written target. On any error the temp file is removed (best effort) and
 * the original error is rethrown, so the pre-existing target is left intact and
 * no `*.tmp-*` residue is left behind.
 *
 * @param {string} filePath - destination path
 * @param {string|Buffer} data - bytes to write
 * @param {{ rename?: (oldPath: string, newPath: string) => void }} [opts]
 *   `rename` is an injectable seam (default `safeFs.renameSync`) so a test can
 *   deterministically simulate a crash during the rename window.
 */
function atomicWriteFileSync(filePath, data, { rename = safeFs.renameSync } = {}) {
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    safeFs.writeFileSync(tmp, data);
    rename(tmp, filePath);
  } catch (err) {
    try {
      if (safeFs.existsSync(tmp)) safeFs.unlinkSync(tmp);
    } catch {
      /* best-effort cleanup; surface the original error below */
    }
    throw err;
  }
}

function getVersion(root = ROOT) {
  const versionFile = path.join(root, 'VERSION');
  const version = safeFs.readFileSync(versionFile, 'utf8').trim();
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Invalid version format in ${versionFile}: "${version}" (expected X.Y.Z)`);
  }
  return version;
}

/**
 * Sync `version` into every JSON target. A target that EXISTS but fails to
 * parse, is missing an expected update path, or fails to write is recorded as a
 * named failure. A target that is not present is skipped (not a failure).
 *
 * @param {string} version
 * @param {string} [root]
 * @returns {{ updated: string[], failures: string[] }}
 */
function updateJsonVersionFiles(version, root = ROOT) {
  const updated = [];
  const failures = [];

  for (const config of JSON_VERSION_FILES) {
    const filePath = path.join(root, config.file);

    if (!safeFs.existsSync(filePath)) {
      console.log(`  Skip: ${config.file} (not found)`);
      continue;
    }

    const content = safeFs.readFileSync(filePath, 'utf8');
    let json;
    try {
      json = JSON.parse(content);
    } catch (err) {
      console.error(`  ERROR: ${config.file} contains invalid JSON: ${err.message}`);
      failures.push(config.file);
      continue;
    }

    let changed = false;
    let pathMissing = false;

    for (const update of config.updates) {
      let obj = json;
      const pathCopy = [...update.path];
      const lastKey = pathCopy.pop();

      for (const key of pathCopy) {
        if (obj == null || typeof obj !== 'object') {
          console.error(`  ERROR: ${config.file} missing expected path: ${update.path.join('.')}`);
          obj = null;
          break;
        }
        obj = obj[key];
      }
      if (obj == null || typeof obj !== 'object') {
        pathMissing = true;
        continue;
      }

      if (obj[lastKey] !== version) {
        obj[lastKey] = version;
        changed = true;
      }
    }

    if (pathMissing) {
      failures.push(config.file);
      continue;
    }

    if (changed) {
      try {
        atomicWriteFileSync(filePath, JSON.stringify(json, null, 2) + '\n');
      } catch (err) {
        console.error(`  ERROR: ${config.file} write failed: ${err.message}`);
        failures.push(config.file);
        continue;
      }
      updated.push(config.file);
      console.log(`  Updated: ${config.file}`);
    }
  }

  return { updated, failures };
}

/**
 * Sync `version` into documentation files. A file that fails to write is
 * recorded as a named failure; a missing file is skipped.
 *
 * @param {string} version
 * @param {string} [root]
 * @returns {{ updated: string[], failures: string[] }}
 */
function updateVersionInFiles(version, root = ROOT) {
  const updated = [];
  const failures = [];

  for (const update of VERSION_UPDATES) {
    const filePath = path.join(root, update.file);

    if (!safeFs.existsSync(filePath)) {
      console.log(`  Skip: ${update.file} (not found)`);
      continue;
    }

    let content = safeFs.readFileSync(filePath, 'utf8');
    const original = content;

    content = content.replace(update.pattern, update.replacement(version));

    if (content !== original) {
      try {
        atomicWriteFileSync(filePath, content);
      } catch (err) {
        console.error(`  ERROR: ${update.file} write failed: ${err.message}`);
        failures.push(update.file);
        continue;
      }
      updated.push(update.file);
      console.log(`  Updated: ${update.file}`);
    }
  }

  return { updated, failures };
}

/**
 * Rewrite the GROWING doc-count lines in CLAUDE.md to the live values, so no
 * human or executor ever hand-edits them (plan 00215). Only the integer on each
 * matched line changes. A count line that is EXPECTED but ABSENT is recorded as a
 * NAMED failure — never a silent no-op — because a generator whose whole job is to
 * keep a number true must fail loud when it cannot find the line to keep true.
 *
 * @param {string} [root] - project root (used to compute the live counts)
 * @param {{ counts?: object, claudeMdPath?: string }} [opts]
 *   `counts` overrides the computed counts; `claudeMdPath` overrides the target
 *   (a test drives a COPY in os.tmpdir(), never the real CLAUDE.md).
 * @returns {{ updated: string[], failures: string[] }}
 */
function updateDocCountsInClaudeMd(root = ROOT, { counts, claudeMdPath } = {}) {
  const resolved = counts || computeDocCounts(root);
  const filePath = claudeMdPath || path.join(root, 'CLAUDE.md');
  const updated = [];
  const failures = [];

  if (!safeFs.existsSync(filePath)) {
    console.log('  Skip: CLAUDE.md (not found)');
    return { updated, failures };
  }

  let content = safeFs.readFileSync(filePath, 'utf8');
  const original = content;

  for (const update of COUNT_UPDATES) {
    const n = resolved[update.field];
    let matched = false;
    content = content.replace(update.pattern, (_m, before, after) => {
      matched = true;
      return `${before}${n}${after}`;
    });
    if (!matched) {
      console.error(`  ERROR: CLAUDE.md count line for ${update.label} not found`);
      failures.push(`CLAUDE.md (${update.label} line not found)`);
    }
  }

  if (content !== original) {
    try {
      atomicWriteFileSync(filePath, content);
    } catch (err) {
      console.error(`  ERROR: CLAUDE.md count sync write failed: ${err.message}`);
      failures.push('CLAUDE.md');
      return { updated, failures };
    }
    updated.push('CLAUDE.md');
    console.log('  Updated doc counts: CLAUDE.md');
  }

  return { updated, failures };
}

/**
 * Run the release sync. Returns a process exit code: 0 on full success, 1 if
 * the version could not be read or any target failed to sync (failing file
 * names are printed to stderr).
 *
 * @param {string} [root]
 * @returns {number}
 */
function main(root = ROOT) {
  let version;
  try {
    // Read version from VERSION file (source of truth)
    version = getVersion(root);
  } catch (err) {
    console.error(`Release failed: ${err.message}`);
    return 1;
  }

  console.log(`CTOC Release v${version}`);
  console.log('─'.repeat(40));

  const failures = [];

  console.log('\nSyncing version to JSON files...');
  failures.push(...updateJsonVersionFiles(version, root).failures);

  console.log('\nUpdating version references in docs...');
  failures.push(...updateVersionInFiles(version, root).failures);

  console.log('\nSyncing documented growing counts in CLAUDE.md...');
  failures.push(...updateDocCountsInClaudeMd(root).failures);

  if (failures.length > 0) {
    console.error(
      `Release failed: could not sync ${failures.length} file(s): ${failures.join(', ')}`
    );
    return 1;
  }

  console.log('\nDone.');
  return 0;
}

module.exports = {
  getVersion,
  updateJsonVersionFiles,
  updateVersionInFiles,
  updateDocCountsInClaudeMd,
  atomicWriteFileSync,
  main,
  JSON_VERSION_FILES,
  VERSION_UPDATES,
  COUNT_UPDATES
};

if (require.main === module) {
  process.exit(main());
}
