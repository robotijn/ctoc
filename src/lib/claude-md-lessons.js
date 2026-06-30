/**
 * CTOC operating-lessons injector.
 *
 * Idempotent, fail-open, atomic, cross-platform injection of the CTOC-managed
 * operating-lessons block into a project's CLAUDE.md. The single canonical
 * source of the block is `.ctoc/templates/operating-lessons.md`, resolved
 * relative to this module's install location (with an explicit ctocRoot
 * fallback). This module imports ONLY Node built-ins and NEVER touches
 * `~/.claude` or any path outside the supplied target.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const LESSONS_VERSION = 'v1';
const START_MARKER = '<!-- CTOC:LESSONS v1 START -->';
const END_MARKER = '<!-- CTOC:LESSONS v1 END -->';
const MANAGED_NOTICE = '<!-- Content between these markers is CTOC-managed. Do not edit manually. -->';

// Version-agnostic line matchers so a v0 (or any older version) block is detected
// and upgraded to the current version.
const ANY_START_RE = /^\s*<!--\s*CTOC:LESSONS\s+v(\d+)\s+START\s*-->\s*$/;
const ANY_END_RE = /^\s*<!--\s*CTOC:LESSONS\s+v(\d+)\s+END\s*-->\s*$/;
// Opening/closing code-fence line (``` or ~~~, any length >= 3).
const FENCE_RE = /^\s*(`{3,}|~{3,})/;

// Hard cap on a CLAUDE.md we will read into memory. A legitimate CLAUDE.md is
// never larger than this; a bigger file is pathological (or hostile) and is
// skipped (fail-open) rather than slurped on the SessionStart hot path.
const MAX_CLAUDE_MD_BYTES = 2 * 1024 * 1024; // 2 MiB

/**
 * Resolve the canonical operating-lessons source.
 * Primary: __dirname-relative (the installed CTOC version). Fallback: ctocRoot.
 *
 * @param {string} [ctocRoot] - Absolute path to the installed CTOC plugin root.
 * @returns {string|null} The first existing source path, else null.
 */
function resolveLessonsSource(ctocRoot) {
  const primary = path.join(__dirname, '..', '..', '.ctoc', 'templates', 'operating-lessons.md');
  if (fs.existsSync(primary)) return primary;
  const fallback = ctocRoot ? path.join(ctocRoot, '.ctoc', 'templates', 'operating-lessons.md') : null;
  if (fallback && fs.existsSync(fallback)) return fallback;
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
 * Re-apply the original EOL style to LF-normalized text.
 *
 * @param {string} normLF
 * @param {'\n' | '\r\n'} eol
 * @returns {string}
 */
function restoreEol(normLF, eol) {
  return eol === '\r\n' ? normLF.replace(/\n/g, '\r\n') : normLF;
}

/**
 * Re-apply an EOL style to LF-normalized text. Applied ONLY to the managed
 * block region we splice in — bytes OUTSIDE the markers are carried over
 * verbatim from the original file and are never re-encoded.
 *
 * @param {string} lfText
 * @param {'\n' | '\r\n'} eol
 * @returns {string}
 */
function applyEol(lfText, eol) {
  return eol === '\r\n' ? lfText.replace(/\n/g, '\r\n') : lfText;
}

/**
 * A located managed block (or a malformed-marker report).
 *
 * @typedef {Object} ManagedBlock
 * @property {number} startIdx - Index of the START marker line (-1 if malformed).
 * @property {number} endIdx   - Index of the END marker line (-1 if malformed).
 * @property {string|null} version - Detected version (e.g. 'v1'), null if malformed.
 * @property {boolean} malformed - true when markers are unbalanced outside fences.
 */

/**
 * O(n) single-pass line scanner. Finds the FIRST complete managed block.
 *
 * @param {string[]} lines - LF-split lines.
 * @param {boolean} ignoreFences - when true, code fences are treated as plain
 *        prose (used to recover from an unterminated fence above the markers).
 * @returns {{ block: ManagedBlock|null, unterminatedFence: boolean }}
 */
function scanForBlock(lines, ignoreFences) {
  let inFence = false;
  let fenceToken = null;
  let startIdx = -1;
  /** @type {string|null} */
  let version = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!ignoreFences) {
      const fenceMatch = line.match(FENCE_RE);
      if (fenceMatch) {
        const token = fenceMatch[1][0]; // '`' or '~'
        if (!inFence) {
          inFence = true;
          fenceToken = token;
        } else if (token === fenceToken) {
          // Only a fence of the same kind closes the fence (``` not closed by ~~~).
          inFence = false;
          fenceToken = null;
        }
        continue;
      }
      if (inFence) continue;
    }

    if (startIdx === -1) {
      const sm = line.match(ANY_START_RE);
      if (sm) {
        startIdx = i;
        version = 'v' + sm[1];
        continue;
      }
      // An END marker before any START (outside fences) is malformed.
      if (ANY_END_RE.test(line)) {
        return {
          block: { startIdx: -1, endIdx: -1, version: null, malformed: true },
          unterminatedFence: inFence
        };
      }
    } else if (ANY_END_RE.test(line)) {
      return {
        block: { startIdx, endIdx: i, version, malformed: false },
        unterminatedFence: inFence
      };
    }
  }

  if (startIdx !== -1) {
    // START with no matching END outside fences.
    return {
      block: { startIdx: -1, endIdx: -1, version: null, malformed: true },
      unterminatedFence: inFence
    };
  }
  return { block: null, unterminatedFence: inFence };
}

/**
 * Finds the FIRST complete managed block whose markers are OUTSIDE any code
 * fence. If the fence-aware scan finds nothing but a code fence was left
 * UNTERMINATED at EOF, the fence is malformed user prose (not a real code block
 * hiding our markers) — so we re-scan fence-free to recover a genuine managed
 * block sitting beneath that unterminated fence. This prevents a phantom open
 * fence in user prose from masking the real block and triggering a duplicate
 * append on every call.
 *
 * @param {string[]} lines - LF-split lines.
 * @returns {ManagedBlock|null} the block, a malformed report, or null if none found.
 */
function findManagedBlock(lines) {
  const primary = scanForBlock(lines, false);
  if (primary.block === null && primary.unterminatedFence) {
    return scanForBlock(lines, true).block;
  }
  return primary.block;
}

/**
 * SHA-256 hex of the LF-normalized block body (text strictly between markers).
 *
 * @param {string} bodyLF
 * @returns {string}
 */
function computeHash(bodyLF) {
  return crypto.createHash('sha256').update(bodyLF, 'utf8').digest('hex');
}

/**
 * Atomic write: temp file in os.tmpdir() then fs.renameSync. On a cross-device
 * rename (EXDEV) retry once with a temp file in the target's own directory so
 * the rename stays atomic on the same filesystem. No direct writeFileSync to
 * the target path.
 *
 * @param {string} targetPath
 * @param {string} contentWithEol
 */
function atomicWrite(targetPath, contentWithEol) {
  const base = path.basename(targetPath);
  const tmp = path.join(
    os.tmpdir(),
    'ctoc-lessons-' + process.pid + '-' + Date.now() + '-' + crypto.randomBytes(6).toString('hex') + '.claude.md'
  );
  // 'wx' = O_EXCL: fail closed if the (CSPRNG-random) temp path already exists,
  // so a pre-planted file or symlink at that path is never followed/overwritten.
  fs.writeFileSync(tmp, contentWithEol, { encoding: 'utf8', flag: 'wx' });
  try {
    fs.renameSync(tmp, targetPath);
  } catch (e) {
    if (e.code !== 'EXDEV') {
      try { fs.unlinkSync(tmp); } catch (_) { /* best-effort temp cleanup */ }
      throw e;
    }
    // Fresh random name for the same-filesystem retry, also opened exclusively.
    const sameDirTmp = path.join(
      path.dirname(targetPath),
      '.' + base + '.ctoc-tmp-' + crypto.randomBytes(6).toString('hex')
    );
    fs.writeFileSync(sameDirTmp, contentWithEol, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(sameDirTmp, targetPath);
    try { fs.unlinkSync(tmp); } catch (_) { /* best-effort temp cleanup */ }
  }
}

/**
 * Ensure the CTOC-managed operating-lessons block is present and current in a
 * CLAUDE.md. Idempotent, fail-open, atomic, cross-platform. NEVER throws.
 *
 * @param {string} claudeMdPath - Absolute path to the target project's CLAUDE.md.
 * @param {string} [ctocRoot]   - Absolute path to the installed CTOC plugin root,
 *                                used ONLY as a fallback to locate the source.
 * @returns {boolean} true if the file was modified (inserted / upgraded /
 *                    refreshed / created); false if no change was needed OR any
 *                    error was caught (fail-open).
 */
function ensureLessonsBlock(claudeMdPath, ctocRoot) {
  try {
    // 1. Resolve the canonical source.
    const primaryPath = path.join(__dirname, '..', '..', '.ctoc', 'templates', 'operating-lessons.md');
    const fallbackPath = ctocRoot
      ? path.join(ctocRoot, '.ctoc', 'templates', 'operating-lessons.md')
      : null;
    const src = resolveLessonsSource(ctocRoot);
    if (src === null) {
      process.stderr.write(
        '[CTOC] ensureLessonsBlock: operating-lessons.md not found at ' + primaryPath +
        ' (fallback: ' + (fallbackPath || 'none') + '); CLAUDE.md left unchanged\n'
      );
      return false;
    }

    // 2. Read + parse the canonical block.
    const srcLines = normalizeEol(fs.readFileSync(src, 'utf8')).normalized.split('\n');
    const srcBlock = findManagedBlock(srcLines);
    if (!srcBlock || srcBlock.malformed) {
      process.stderr.write(
        '[CTOC] ensureLessonsBlock: canonical source ' + src +
        ' is missing well-formed v1 markers; CLAUDE.md left unchanged\n'
      );
      return false;
    }
    const canonicalBlock = srcLines.slice(srcBlock.startIdx, srcBlock.endIdx + 1).join('\n');
    const canonicalBody = srcLines.slice(srcBlock.startIdx + 1, srcBlock.endIdx).join('\n');
    const canonicalHash = computeHash(canonicalBody);

    // 3. Create the target if it does not exist.
    if (!fs.existsSync(claudeMdPath)) {
      atomicWrite(claudeMdPath, canonicalBlock + '\n');
      return true;
    }

    // 4. Read the target (guarding against a pathologically large file).
    let stat = null;
    try { stat = fs.statSync(claudeMdPath); } catch (_) { stat = null; }
    if (stat && stat.size > MAX_CLAUDE_MD_BYTES) {
      process.stderr.write(
        '[CTOC] ensureLessonsBlock: ' + claudeMdPath + ' is ' + stat.size +
        ' bytes (> ' + MAX_CLAUDE_MD_BYTES + '-byte cap); leaving file unchanged\n'
      );
      return false;
    }
    const raw = fs.readFileSync(claudeMdPath, 'utf8');
    const { normalized: tgtNorm, eol } = normalizeEol(raw);
    const tgtLines = tgtNorm.split('\n');
    const blk = findManagedBlock(tgtLines);

    // 5. Refuse to splice a malformed block.
    if (blk && blk.malformed) {
      process.stderr.write(
        '[CTOC] ensureLessonsBlock: malformed managed block in ' + claudeMdPath +
        ' (start/end mismatch); leaving file unchanged\n'
      );
      return false;
    }

    // The original file split on '\n'. Indices align 1:1 with tgtLines (each
    // raw line may carry a trailing '\r'); joining rawLines with '\n' reproduces
    // `raw` byte-for-byte. We splice ONLY the managed-block region and leave
    // every byte outside the markers exactly as it was — never re-encoding EOLs
    // of user prose (mixed-EOL files are preserved verbatim).
    const rawLines = raw.split('\n');

    // 6. No real block -> append exactly one at EOF.
    if (!blk) {
      const newNorm = tgtNorm.replace(/\n*$/, '') + '\n\n' + canonicalBlock + '\n';
      if (newNorm === tgtNorm) return false;
      // Strip trailing EOLs from the original (preserving inner bytes), then
      // append the block using the file's dominant EOL for the new region only.
      const trimmedRaw = raw.replace(/(\r?\n)*$/, '');
      const newContent = trimmedRaw + eol + eol + applyEol(canonicalBlock, eol) + eol;
      atomicWrite(claudeMdPath, newContent);
      return true;
    }

    // 7. Block exists — no-op iff version AND body hash match; else replace in place.
    const existingBody = tgtLines.slice(blk.startIdx + 1, blk.endIdx).join('\n');
    if (blk.version === LESSONS_VERSION && computeHash(existingBody) === canonicalHash) {
      return false;
    }
    const newNorm = [
      ...tgtLines.slice(0, blk.startIdx),
      ...canonicalBlock.split('\n'),
      ...tgtLines.slice(blk.endIdx + 1)
    ].join('\n');
    if (newNorm === tgtNorm) return false;
    // Byte-preserving splice: prose lines keep their own EOL; only the canonical
    // block lines are emitted with the dominant EOL.
    const canonicalLines = canonicalBlock
      .split('\n')
      .map((l) => (eol === '\r\n' ? l + '\r' : l));
    const newContent = [
      ...rawLines.slice(0, blk.startIdx),
      ...canonicalLines,
      ...rawLines.slice(blk.endIdx + 1)
    ].join('\n');
    atomicWrite(claudeMdPath, newContent);
    return true;
  } catch (err) {
    // Stringify defensively: a thrown non-Error (null, string, number) must not
    // cause a secondary TypeError out of the catch — fail-open is absolute.
    process.stderr.write(
      '[CTOC] ensureLessonsBlock failed (' + String((err && err.message) || err) + '); CLAUDE.md ' +
      claudeMdPath + ' left unchanged\n'
    );
    return false;
  }
}

module.exports = {
  ensureLessonsBlock,
  // Exported for tests + the sync-guard:
  LESSONS_VERSION,
  START_MARKER,
  END_MARKER,
  MANAGED_NOTICE,
  resolveLessonsSource,
  findManagedBlock,
  normalizeEol,
  restoreEol,
  computeHash
};
