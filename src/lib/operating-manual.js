/**
 * CTOC operating-manual injector (OM1).
 *
 * Idempotent, fail-open, atomic, cross-platform upsert of the CTOC-managed
 * generic operating-manual craft block into a project's CLAUDE.md. The single
 * canonical source is `.ctoc/templates/operating-manual.md` (pure prose, NO
 * markers — the markers live here, in exactly one place, per D-OM1-9), resolved
 * relative to this module's install location with an explicit `ctocRoot`
 * fallback. Imports ONLY Node built-ins + the audited safe-fs choke point; never
 * touches `~/.claude` or any path outside the supplied projectRoot.
 *
 * This module MIRRORS the proven mechanics of `claude-md-lessons.js`
 * (normalizeEol/applyEol, byte-preserving splice, temp-file-then-rename atomic
 * write with wx/O_EXCL + EXDEV same-dir fallback, 2 MiB read cap, fail-open) but
 * does NOT import it: the lessons module's public surface is coupled to its own
 * versioned markers + hash gate (D-OM1-5). The two managed blocks — the lessons
 * block and this operating-manual block — coexist independently, neither
 * touching the other's bytes.
 */

'use strict';

const safeFs = require('./safe-fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const BEGIN_MARKER =
  '<!-- BEGIN ctoc:operating-manual (managed by CTOC — edits here are overwritten on update) -->';
const END_MARKER = '<!-- END ctoc:operating-manual -->';

// Hard cap on a CLAUDE.md we will read into memory. A legitimate CLAUDE.md is
// never larger than this; a bigger file is pathological (or hostile) and is
// skipped (fail-open) rather than slurped. Mirrors claude-md-lessons.
const MAX_CLAUDE_MD_BYTES = 2 * 1024 * 1024; // 2 MiB

/**
 * Resolve the canonical operating-manual source.
 * Primary: __dirname-relative (the installed CTOC version). Fallback: ctocRoot.
 *
 * @param {string} [ctocRoot] - Absolute path to the installed CTOC plugin root.
 * @returns {string|null} The first existing source path, else null.
 */
function resolveTemplate(ctocRoot) {
  const primary = path.join(__dirname, '..', '..', '.ctoc', 'templates', 'operating-manual.md');
  if (safeFs.existsSync(primary)) return primary;
  const fallback = ctocRoot
    ? path.join(ctocRoot, '.ctoc', 'templates', 'operating-manual.md')
    : null;
  if (fallback && safeFs.existsSync(fallback)) return fallback;
  return null;
}

/**
 * Split CRLF/LF and report the EOL style to restore on write.
 *
 * @param {string} text
 * @returns {{ normalized: string, eol: '\n' | '\r\n' }}
 */
function normalizeEol(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return { normalized: text.replace(/\r\n/g, '\n'), eol };
}

/**
 * Re-apply an EOL style to LF-normalized text. Applied ONLY to the managed block
 * region we splice in — bytes OUTSIDE the markers are carried over verbatim from
 * the original file and are never re-encoded.
 *
 * @param {string} lfText
 * @param {'\n' | '\r\n'} eol
 * @returns {string}
 */
function applyEol(lfText, eol) {
  return eol === '\r\n' ? lfText.replace(/\n/g, '\r\n') : lfText;
}

/**
 * Atomic write: temp file in os.tmpdir() then safeFs.renameSync. On a
 * cross-device rename (EXDEV) retry once with a temp file in the target's own
 * directory so the rename stays atomic on the same filesystem. No direct
 * writeFileSync to the target path. Mirrors claude-md-lessons.atomicWrite.
 *
 * @param {string} targetPath
 * @param {string} contentWithEol
 */
function atomicWrite(targetPath, contentWithEol) {
  const base = path.basename(targetPath);
  const tmp = path.join(
    os.tmpdir(),
    'ctoc-manual-' + process.pid + '-' + Date.now() + '-' +
      crypto.randomBytes(6).toString('hex') + '.claude.md'
  );
  // 'wx' = O_EXCL: fail closed if the (CSPRNG-random) temp path already exists,
  // so a pre-planted file or symlink at that path is never followed/overwritten.
  safeFs.writeFileSync(tmp, contentWithEol, { encoding: 'utf8', flag: 'wx' });
  try {
    safeFs.renameSync(tmp, targetPath);
  } catch (e) {
    if (e.code !== 'EXDEV') {
      try { safeFs.unlinkSync(tmp); } catch (_) { /* best-effort temp cleanup */ }
      throw e;
    }
    // Fresh random name for the same-filesystem retry, also opened exclusively.
    const sameDirTmp = path.join(
      path.dirname(targetPath),
      '.' + base + '.ctoc-tmp-' + crypto.randomBytes(6).toString('hex')
    );
    safeFs.writeFileSync(sameDirTmp, contentWithEol, { encoding: 'utf8', flag: 'wx' });
    safeFs.renameSync(sameDirTmp, targetPath);
    try { safeFs.unlinkSync(tmp); } catch (_) { /* best-effort temp cleanup */ }
  }
}

/**
 * Upsert the CTOC-managed generic operating-manual block into a project's
 * CLAUDE.md. Idempotent, fail-open, atomic, cross-platform. NEVER throws.
 *
 * @param {string} projectRoot - Absolute path to the project whose CLAUDE.md is
 *                               the merge target.
 * @param {{ ctocRoot?: string }} [opts] - `ctocRoot` is a fallback base used only
 *                               to locate the template if the __dirname-relative
 *                               primary is unavailable.
 * @returns {{ action: 'created' | 'inserted' | 'updated' | 'unchanged', path: string | null }}
 *   (`path` is null only when `projectRoot` is not a non-empty string — fail-open)
 *   - `created`   — CLAUDE.md did not exist; wrote a new file containing the block.
 *   - `inserted`  — CLAUDE.md existed without the block; appended it at EOF.
 *   - `updated`   — block existed; body replaced in place (outside bytes preserved).
 *   - `unchanged` — block already byte-equals the template (no-op), OR any error
 *                   was caught (fail-open: never throws).
 */
function mergeOperatingManual(projectRoot, opts = {}) {
  // Fail-open on invalid input: a null/non-string projectRoot must NOT throw
  // (the "NEVER throws" contract must hold at the module boundary, not only at
  // the shipped call-sites which happen to wrap this).
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) {
    return { action: 'unchanged', path: null };
  }
  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
  try {
    // 1. Resolve the canonical template.
    const templatePath = resolveTemplate(opts.ctocRoot);
    if (templatePath === null) {
      process.stderr.write(
        '[CTOC] mergeOperatingManual: operating-manual.md template not found ' +
        '(primary + ctocRoot fallback both missing); ' + claudeMdPath + ' left unchanged\n'
      );
      return { action: 'unchanged', path: claudeMdPath };
    }

    // 2. Read + LF-normalize the template body, then wrap it in markers.
    const body = normalizeEol(safeFs.readFileSync(templatePath, 'utf8')).normalized.replace(/\n+$/, '');
    const block = BEGIN_MARKER + '\n' + body + '\n' + END_MARKER;

    // 3. Create the target if it does not exist.
    if (!safeFs.existsSync(claudeMdPath)) {
      atomicWrite(claudeMdPath, block + '\n');
      return { action: 'created', path: claudeMdPath };
    }

    // 4. Read the target (guarding against a pathologically large file).
    let stat = null;
    try { stat = safeFs.statSync(claudeMdPath); } catch (_) { stat = null; }
    if (stat && stat.size > MAX_CLAUDE_MD_BYTES) {
      process.stderr.write(
        '[CTOC] mergeOperatingManual: ' + claudeMdPath + ' is ' + stat.size +
        ' bytes (> ' + MAX_CLAUDE_MD_BYTES + '-byte cap); leaving file unchanged\n'
      );
      return { action: 'unchanged', path: claudeMdPath };
    }
    const raw = safeFs.readFileSync(claudeMdPath, 'utf8');
    const { normalized: norm, eol } = normalizeEol(raw);
    const lines = norm.split('\n');
    // Indices align 1:1 with `lines` (each raw line may carry a trailing '\r');
    // joining rawLines with '\n' reproduces `raw` byte-for-byte. We splice ONLY
    // the managed-block region and leave every byte outside the markers exactly
    // as it was — never re-encoding user prose EOLs (mixed-EOL files preserved).
    const rawLines = raw.split('\n');

    // 5. Locate the block by LITERAL marker line-scan (no whole-doc regex).
    let beginIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === BEGIN_MARKER) { beginIdx = i; break; }
    }
    let endIdx = -1;
    if (beginIdx !== -1) {
      for (let j = beginIdx + 1; j < lines.length; j++) {
        if (lines[j] === END_MARKER) { endIdx = j; break; }
      }
      // Malformed: BEGIN found but no END after it → never splice (fail-open).
      if (endIdx === -1) {
        process.stderr.write(
          '[CTOC] mergeOperatingManual: malformed managed block in ' + claudeMdPath +
          ' (BEGIN with no END); leaving file unchanged\n'
        );
        return { action: 'unchanged', path: claudeMdPath };
      }
    }

    // 6. No block → append exactly one at EOF (project nouns lead, D-OM1-6).
    if (beginIdx === -1) {
      const trimmedRaw = raw.replace(/[\r\n]+$/, '');
      const newContent = trimmedRaw + eol + eol + applyEol(block, eol) + eol;
      atomicWrite(claudeMdPath, newContent);
      return { action: 'inserted', path: claudeMdPath };
    }

    // 7. Block exists — no-op iff body already equals the template; else replace.
    const existingBody = lines.slice(beginIdx + 1, endIdx).join('\n');
    if (existingBody === body) {
      return { action: 'unchanged', path: claudeMdPath };
    }
    // Byte-preserving splice: prose lines keep their own EOL; only the block
    // lines are emitted with the file's dominant EOL for the new region.
    const blockLinesEol = block.split('\n').map((l) => (eol === '\r\n' ? l + '\r' : l));
    const newContent = [
      ...rawLines.slice(0, beginIdx),
      ...blockLinesEol,
      ...rawLines.slice(endIdx + 1)
    ].join('\n');
    atomicWrite(claudeMdPath, newContent);
    return { action: 'updated', path: claudeMdPath };
  } catch (err) {
    // Stringify defensively: a thrown non-Error (null, string, number) must not
    // cause a secondary TypeError out of the catch — fail-open is absolute.
    process.stderr.write(
      '[CTOC] mergeOperatingManual failed (' + String((err && err.message) || err) +
      '); CLAUDE.md ' + claudeMdPath + ' left unchanged\n'
    );
    return { action: 'unchanged', path: claudeMdPath };
  }
}

module.exports = {
  mergeOperatingManual,
  // Exported for tests:
  resolveTemplate,
  normalizeEol,
  applyEol,
  BEGIN_MARKER,
  END_MARKER,
  MAX_CLAUDE_MD_BYTES
};
