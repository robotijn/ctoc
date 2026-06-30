'use strict';

/**
 * src/lib/stale-detector.js — SP1 cheap, filesystem-only stale-plan candidate scan.
 *
 * Leaf module: depends ONLY on the Node built-ins `fs` and `path`. It does not
 * require any project module and never invokes git or any subprocess. The cheap
 * pass is the foundation SP2 consumes, SP3 appends to, and SP5 imports for
 * fixture validation.
 *
 * The pass emits exactly two signals:
 *   - `missing-files` (actionable, all three gate-source stages) — a declared
 *     `files:` path no longer exists on disk.
 *   - `advisory:age`  (advisory-only, all three stages) — the plan file mtime is
 *     older than the 14-day threshold. mtime is ADVISORY and BEST-EFFORT ONLY:
 *     `git checkout` rewrites working-tree mtimes to the checkout time, so mtime
 *     reflects the last checkout/write, not when the plan was authored. Age never
 *     makes a candidate actionable on its own (the HYBRID "age never acts alone"
 *     rule).
 *
 * No marker-based signal exists: the human approval marker carries zero
 * discriminating power at the gate-source stages (every review plan has it from
 * crossing Gate 2; functional plans never have it), so it is not read at all (F1).
 *
 * @typedef {('functional'|'implementation'|'review')} GateSourceStage
 *
 * @typedef {('missing-files'|'advisory:age')} StaleSignal
 *
 * @typedef {Object} StaleCandidate
 * @property {string}          plan       Plan slug = filename without `.md`
 *                                          (matches inbox.js listPlansAtGates).
 * @property {GateSourceStage} stage      The gate SOURCE stage it was found in.
 * @property {StaleSignal[]}   signals    Non-empty, canonical order: actionable
 *                                          (missing-files) first, advisory
 *                                          (advisory:age) last.
 * @property {boolean}         actionable true iff signals contains missing-files;
 *                                          advisory:age alone ⇒ false.
 *
 * @typedef {Object} CheapScanResult
 * @property {StaleCandidate[]} candidates Plans (in gate-source stages) that
 *                                          emitted ≥ 1 signal. Zero-signal plans
 *                                          are omitted entirely.
 * @property {number}          count       === candidates.length.
 */

const fs = require('fs');
const path = require('path');

/** 14-day advisory age threshold, in milliseconds. */
const AGE_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * The three gate-SOURCE stages scanned by the cheap pass, in fixed gate order.
 * SP1's own frozen copy — inbox.js does not export its equivalent, and editing
 * inbox.js is out of scope (SP2 owns it).
 * @type {ReadonlyArray<GateSourceStage>}
 */
const GATE_SOURCE_STAGES = Object.freeze(['functional', 'implementation', 'review']);

/**
 * Concatenate the bodies of EVERY consecutive leading `---…---` frontmatter
 * block into one combined region string.
 *
 * Load-bearing: `files:` is a metadata-block key, but on an approved plan the
 * first `---…---` block is the prepended approval marker (no `files:` there) and
 * the metadata block is the SECOND block. Reading only the first block (as
 * inbox.js's scalar parseFrontmatter does) would miss `files:` entirely, so
 * `missing-files` would never fire on approved plans. Combining all leading
 * blocks makes `parseFilesField` find `files:` regardless of which leading block
 * it lives in.
 *
 * Returns `''` on missing or unterminated frontmatter — never throws on a
 * structural irregularity.
 *
 * @param {string} content Full file contents.
 * @returns {string} Combined frontmatter body (block contents joined by `\n`).
 */
function extractFrontmatterRegion(content) {
  if (typeof content !== 'string' || content.length === 0) return '';
  const lines = content.split('\n');
  const bodies = [];
  let i = 0;
  // Skip leading blank lines before the first block.
  while (i < lines.length && lines[i].trim() === '') i++;
  while (i < lines.length && lines[i].trim() === '---') {
    // Found a block opener at line i; collect until the closing '---'.
    let j = i + 1;
    const body = [];
    let closed = false;
    while (j < lines.length) {
      if (lines[j].trim() === '---') {
        closed = true;
        break;
      }
      body.push(lines[j]);
      j++;
    }
    if (!closed) {
      // Unterminated block — ignore it and stop (no throw).
      break;
    }
    bodies.push(body.join('\n'));
    i = j + 1;
    // Skip blank lines between consecutive leading blocks.
    while (i < lines.length && lines[i].trim() === '') i++;
  }
  return bodies.join('\n');
}

/**
 * Strip a trailing YAML line comment (a `#` preceded by whitespace, through end
 * of line). A `#` NOT preceded by whitespace is preserved as part of the value
 * (so a hypothetical `a#b.js` survives intact). F5.
 * @param {string} s
 * @returns {string}
 */
function stripTrailingComment(s) {
  const m = s.match(/\s#.*$/);
  return m ? s.slice(0, m.index) : s;
}

/**
 * Strip a single pair of surrounding quotes (single or double) from a value.
 * @param {string} s
 * @returns {string}
 */
function stripQuotes(s) {
  return s.replace(/^["']|["']$/g, '');
}

/**
 * Sequence-aware parser for the `files:` frontmatter key. Handles both YAML
 * syntaxes plus defensible edge cases. Returns the declared file paths.
 *
 * - Inline-array (`files: [a.js, b.js]`) — split on `,`, trim, strip quotes,
 *   drop empties. `files: []` ⇒ `[]`.
 * - Scalar single value (`files: src/lib/x.js`) — tolerated as a one-element
 *   list; quotes stripped.
 * - Block-list (`files:` then `  - path` lines) — each dash-item line is an
 *   entry; trailing line comments stripped (F5); collection stops at the first
 *   non-dash line (frontmatter sequences are contiguous).
 *
 * @param {string} region Combined frontmatter region from extractFrontmatterRegion.
 * @returns {string[]} Declared file paths (possibly empty).
 */
function parseFilesField(region) {
  if (typeof region !== 'string' || region.length === 0) return [];
  const lines = region.split('\n');
  let idx = -1;
  let rest = '';
  for (let k = 0; k < lines.length; k++) {
    const m = lines[k].match(/^files:[ \t]*(.*)$/);
    if (m) {
      idx = k;
      rest = m[1].trim();
      break;
    }
  }
  if (idx === -1) return [];

  // Inline-array syntax.
  if (rest.startsWith('[')) {
    const close = rest.lastIndexOf(']');
    const inner = close > 0 ? rest.slice(1, close) : rest.slice(1);
    return inner
      .split(',')
      .map((p) => stripQuotes(p.trim()))
      .filter((p) => p.length > 0);
  }

  // Scalar single value on the same line.
  if (rest.length > 0) {
    const v = stripQuotes(stripTrailingComment(rest).trim());
    return v.length > 0 ? [v] : [];
  }

  // Block-list syntax: walk subsequent dash-item lines.
  const out = [];
  for (let k = idx + 1; k < lines.length; k++) {
    const dash = lines[k].match(/^[ \t]*-[ \t]*(.+?)[ \t]*$/);
    if (!dash) break; // stop at first non-dash line (new key or blank)
    const v = stripQuotes(stripTrailingComment(dash[1]).trim());
    if (v.length > 0) out.push(v);
  }
  return out;
}

/**
 * Resolve a declared (repo-root-relative, possibly POSIX-authored) path under
 * `root` cross-platform: split on any separator run, drop empty/leading-separator
 * segments, rejoin with path.join. Read-only existence check only.
 * @param {string} root
 * @param {string} declared
 * @returns {boolean} true if the path exists under root.
 */
function declaredFileExists(root, declared) {
  const parts = declared.split(/[\\/]+/).filter((p) => p.length > 0);
  if (parts.length === 0) return true; // nothing meaningful to check
  return fs.existsSync(path.join(root, ...parts));
}

/**
 * Detect the `missing-files` signal: fires when ≥ 1 declared path is absent.
 * @param {string} root
 * @param {string[]} declared
 * @returns {boolean}
 */
function hasMissingFiles(root, declared) {
  if (!declared || declared.length === 0) return false;
  return declared.some((rel) => !declaredFileExists(root, rel));
}

/**
 * Cheap, filesystem-only scan of plans/functional, plans/implementation,
 * plans/review for stale-plan candidates. NEVER invokes git or any subprocess.
 *
 * Per-file IO faults (a plan file that vanishes or becomes unreadable mid-scan)
 * are skipped — the offending plan is omitted and the scan continues; the
 * function never throws on a structural or IO irregularity. Only misuse throws.
 *
 * @param {string} root Project root (directory containing `plans/`).
 * @param {{ nowMs?: number }} [options] nowMs defaults to Date.now(); inject a
 *        timestamp to drive age scenarios deterministically (SP5 seam — no utimes).
 * @returns {CheapScanResult}
 * @throws {TypeError} if root is not a non-empty string, or nowMs is supplied and
 *         is not a finite number.
 */
function scanCheapCandidates(root, { nowMs = Date.now() } = {}) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new TypeError('scanCheapCandidates: root must be a non-empty string');
  }
  if (!Number.isFinite(nowMs)) {
    throw new TypeError('scanCheapCandidates: nowMs must be a finite number');
  }

  /** @type {StaleCandidate[]} */
  const candidates = [];
  const plansDir = path.join(root, 'plans');
  if (!fs.existsSync(plansDir)) {
    return { candidates, count: 0 };
  }

  for (const stage of GATE_SOURCE_STAGES) {
    const stageDir = path.join(plansDir, stage);
    if (!fs.existsSync(stageDir)) continue;

    let entries;
    try {
      entries = fs.readdirSync(stageDir);
    } catch {
      continue; // stage dir unreadable — skip the whole stage, keep going
    }
    entries = entries
      .filter((f) => f.endsWith('.md') && f !== '.gitkeep')
      .sort(); // ascending; readdir order is platform-dependent

    for (const file of entries) {
      const filePath = path.join(stageDir, file);
      const slug = file.slice(0, -3); // strip '.md'

      // Per-file IO containment (F2): the two per-file syscalls are each wrapped
      // in a narrow try/catch scoped to this single file. A vanished/unreadable
      // plan is skipped and the scan continues. This never masks misuse (which
      // already threw above) and wraps no control-flow that could hide a bug.
      let content;
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch {
        continue; // file vanished or unreadable (e.g. EISDIR) — skip
      }

      let mtimeMs;
      try {
        mtimeMs = fs.statSync(filePath).mtimeMs;
      } catch {
        continue; // stat fault — skip this file
      }

      const declared = parseFilesField(extractFrontmatterRegion(content));

      /** @type {StaleSignal[]} */
      const signals = [];
      if (hasMissingFiles(root, declared)) signals.push('missing-files');
      if (nowMs - mtimeMs > AGE_THRESHOLD_MS) signals.push('advisory:age');

      if (signals.length === 0) continue;

      candidates.push({
        plan: slug,
        stage,
        signals,
        actionable: signals.includes('missing-files'),
      });
    }
  }

  return { candidates, count: candidates.length };
}

module.exports = {
  scanCheapCandidates,
  extractFrontmatterRegion,
  parseFilesField,
  GATE_SOURCE_STAGES,
  AGE_THRESHOLD_MS,
};
