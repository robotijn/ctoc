/**
 * Spoliation-Safe Deletion (v6.9.27)
 *
 * Federal Rules of Civil Procedure Rule 37(e) sanctions the loss of
 * Electronically Stored Information when a party fails to take "reasonable
 * steps to preserve" once litigation is reasonably anticipated. The most
 * severe sanctions (adverse-inference, default judgment) require intent.
 *
 * Activated when the `spoliation_safe_delete` control is enabled. Routes
 * every destructive operation through a content-addressed snapshot step
 * first, so that even an authorized deletion leaves a tamper-evident
 * preservation copy at `.ctoc/preservation/<sha256>/`.
 *
 * Cross-platform Node 18+, no native deps.
 *
 * References:
 *   - Cornell Legal Information Institute — FRCP Rule 37:
 *     https://www.law.cornell.edu/rules/frcp/rule_37
 *   - Duke Judicature on Rule 37(e):
 *     https://judicature.duke.edu/articles/rule-37e-the-new-law-of-electronic-spoliation/
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PRESERVATION_ROOT = '.ctoc/preservation';
const MANIFEST_NAME = 'preservation-manifest.jsonl';

/**
 * Snapshot a path to the preservation store before any destructive op.
 * Returns the preservation record (including the content hash, which
 * doubles as the snapshot directory name).
 *
 * For a file: content-hash the file bytes, store at `.ctoc/preservation/<hash>/<basename>`.
 * For a directory: tar-equivalent (walk + concatenate) and hash; store the
 *   walked listing plus a per-file hash so individual files can be recovered.
 *
 * @param {string} projectRoot
 * @param {string} targetPath - path relative to projectRoot
 * @param {string} reason - human-readable reason for the destructive op
 * @returns {{preservation_id, manifest_path, snapshotted_at}}
 */
function snapshot(projectRoot, targetPath, reason) {
  const fullPath = path.join(projectRoot, targetPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`spoliation-safe.snapshot: source path does not exist: ${targetPath}`);
  }
  ensureDir(path.join(projectRoot, PRESERVATION_ROOT));

  const stat = fs.statSync(fullPath);
  const isDir = stat.isDirectory();
  const fileList = isDir ? collectFiles(fullPath) : [{ rel: path.basename(fullPath), full: fullPath }];

  // Compute a directory-level hash by hashing the sorted list of (relpath, contenthash) pairs.
  const fileHashes = fileList.map(f => ({
    relpath: f.rel,
    sha256: hashFile(f.full),
  })).sort((a, b) => a.relpath.localeCompare(b.relpath));

  const directoryHashInput = fileHashes.map(f => `${f.sha256}  ${f.relpath}`).join('\n');
  const preservationId = crypto.createHash('sha256').update(directoryHashInput).digest('hex');

  const destDir = path.join(projectRoot, PRESERVATION_ROOT, preservationId);
  ensureDir(destDir);

  // Copy every file into the preservation directory, preserving relative structure.
  for (const f of fileList) {
    const dest = path.join(destDir, f.rel);
    ensureDir(path.dirname(dest));
    fs.copyFileSync(f.full, dest);
  }

  // Write a manifest into the preservation directory.
  const manifest = {
    preservation_id: preservationId,
    source_path: targetPath,
    is_directory: isDir,
    snapshotted_at: new Date().toISOString(),
    reason: reason || 'unspecified',
    file_count: fileList.length,
    file_hashes: fileHashes,
  };
  fs.writeFileSync(path.join(destDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Append to the global preservation log (append-only).
  const logPath = path.join(projectRoot, PRESERVATION_ROOT, MANIFEST_NAME);
  fs.appendFileSync(logPath, JSON.stringify({
    preservation_id: preservationId,
    source_path: targetPath,
    snapshotted_at: manifest.snapshotted_at,
    reason: manifest.reason,
    file_count: fileList.length,
  }) + '\n');

  return {
    preservation_id: preservationId,
    manifest_path: path.relative(projectRoot, path.join(destDir, 'manifest.json')),
    snapshotted_at: manifest.snapshotted_at,
  };
}

/**
 * Restore a previously snapshotted artifact. Used during legal-hold release
 * or when an erroneous deletion needs to be reversed.
 */
function restore(projectRoot, preservationId, destPath) {
  const sourceDir = path.join(projectRoot, PRESERVATION_ROOT, preservationId);
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`spoliation-safe.restore: preservation id not found: ${preservationId}`);
  }
  const manifestPath = path.join(sourceDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`spoliation-safe.restore: manifest missing for ${preservationId}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const dest = path.join(projectRoot, destPath || manifest.source_path);

  if (manifest.is_directory) {
    ensureDir(dest);
    for (const fh of manifest.file_hashes) {
      const sourceFile = path.join(sourceDir, fh.relpath);
      const destFile = path.join(dest, fh.relpath);
      ensureDir(path.dirname(destFile));
      fs.copyFileSync(sourceFile, destFile);
    }
  } else {
    ensureDir(path.dirname(dest));
    const sourceFile = path.join(sourceDir, path.basename(manifest.source_path));
    fs.copyFileSync(sourceFile, dest);
  }

  return { restored_to: path.relative(projectRoot, dest), preservation_id: preservationId };
}

/**
 * List all preservation records.
 */
function listPreservations(projectRoot) {
  const logPath = path.join(projectRoot, PRESERVATION_ROOT, MANIFEST_NAME);
  if (!fs.existsSync(logPath)) return [];
  return fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
}

function collectFiles(dir) {
  const out = [];
  function inner(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const rel = path.relative(dir, full);
      if (entry.isDirectory()) inner(full);
      else if (entry.isFile()) out.push({ rel, full });
    }
  }
  inner(dir);
  return out;
}

function hashFile(filepath) {
  const data = fs.readFileSync(filepath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

module.exports = {
  snapshot,
  restore,
  listPreservations,
};
