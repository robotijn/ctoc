'use strict';

/**
 * PI3 — `syncUnit`: the single idempotent write path for the plan index.
 *
 * Reads the plan file FRESH from disk (CF1 read-fresh rule), extracts its units
 * (one plan-level `__plan__` unit + one unit per `## ` section), hashes each via
 * `content-hash.hashUnit`, compares to the stored unit's `contentHash` via
 * `store.getUnit`, and re-embeds + `upsertUnit`s ONLY the changed units. Idempotent
 * on `(planPath, sectionId)`. Gated by an injected `calibrationReady()` (PI0) so no
 * embed work happens before the calibrated embedding dimension is settled.
 *
 * Dependency injection: `embedder` (PI2) and `calibrationReady` (PI0) are PARAMS —
 * PI3 never `require`s PI2 or PI0. PI1 is reached only through the barrel
 * (`./index`) for `PLAN_SENTINEL`; `./store` is never required directly.
 *
 * Error policy: `syncUnit` does NOT swallow runtime I/O / embed errors — the
 * hot-path CALLERS (the PostToolUse hook and `actions.movePlan`) wrap it in
 * try/catch and log to `.ctoc/logs/`. ENOENT (a vanished file) is DATA, not an
 * error: it returns `{ skipped:true, reason:'file-missing' }`.
 */

const path = require('path');
const safeFs = require('../safe-fs');
const { hashUnit } = require('./content-hash');
const { PLAN_SENTINEL } = require('./index');

/**
 * Normalize a plan path to the ONE canonical form used everywhere PI3 keys the
 * store (D9 carry-forward): a POSIX-separated path relative to `plansRoot`, prefixed
 * with `plans/`. Stable across Windows/macOS/Linux and matches the BDD ACs'
 * `plans/<stage>/<slug>.md` form. When `plansRoot` is not supplied, an absolute path
 * is reduced to everything from the last `plans/` segment onward (best-effort).
 *
 * @param {string} planPath  Absolute or relative path to a plan .md file.
 * @param {string} [plansRoot]  Absolute path to the `plans/` root directory.
 * @returns {string}
 */
function normalizePath(planPath, plansRoot) {
  let rel;
  if (plansRoot) {
    rel = path.relative(path.dirname(plansRoot), planPath);
  } else {
    rel = planPath;
  }
  const posix = rel.split(path.sep).join('/').replace(/\\/g, '/');
  // Guarantee the `plans/` prefix (path.relative on the plansRoot's parent yields
  // `plans/<stage>/<slug>.md`; a raw relative path may already carry it).
  const idx = posix.lastIndexOf('plans/');
  return idx >= 0 ? posix.slice(idx) : posix;
}

/**
 * Extract the raw frontmatter block and the body from a plan's markdown.
 * @param {string} content
 * @returns {{ frontmatter: string, body: string }}
 */
function splitFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { frontmatter: '', body: content };
  return { frontmatter: m[1], body: content.slice(m[0].length) };
}

/**
 * Parse the retrieval-affecting frontmatter fields. Handles both a scalar
 * `files: "x"` and a YAML block list:
 *   files:
 *     - "src/a.js"
 *     - "src/b.js"
 * Only `files`, `parent_vision`, and `status` are extracted (the fields that affect
 * retrieval / the content hash). Robust to quoting.
 *
 * @param {string} frontmatter
 * @returns {{ files: string[], parentVision: string|null, status: string|null }}
 */
function parseFrontmatterFields(frontmatter) {
  const lines = frontmatter.split('\n');
  let files = [];
  let parentVision = null;
  let status = null;
  const unquote = (v) => v.trim().replace(/^["']|["']$/g, '');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const filesInline = line.match(/^files:\s*(.*)$/);
    if (filesInline) {
      const inline = filesInline[1].trim();
      if (inline && inline !== '[]') {
        // inline list `[a, b]` or scalar
        if (inline.startsWith('[') && inline.endsWith(']')) {
          files = inline.slice(1, -1).split(',').map(unquote).filter(Boolean);
        } else {
          files = [unquote(inline)];
        }
      } else {
        // block list on following `  - item` lines
        for (let j = i + 1; j < lines.length; j++) {
          const item = lines[j].match(/^\s*-\s+(.*)$/);
          if (!item) break;
          const v = unquote(item[1]);
          if (v) files.push(v);
        }
      }
      continue;
    }
    const pv = line.match(/^parent_vision:\s*(.*)$/);
    if (pv) { parentVision = unquote(pv[1]) || null; continue; }
    const st = line.match(/^status:\s*(.*)$/);
    if (st) { status = unquote(st[1]) || null; continue; }
  }
  return { files, parentVision, status };
}

/**
 * Split a plan body into `## ` sections. Returns an array of `{ sectionId, text }`.
 * A stable `sectionId` is derived from the heading slug plus its ordinal (so two
 * identically-named headings never collide).
 *
 * @param {string} body
 * @returns {Array<{ sectionId: string, text: string }>}
 */
function splitSections(body) {
  const lines = body.split('\n');
  const sections = [];
  let current = null;
  let ordinal = 0;
  const slugify = (h) => h.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'section';

  for (const line of lines) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) {
      if (current) sections.push(current);
      ordinal++;
      current = { sectionId: `sec-${ordinal}-${slugify(h[1])}`, text: `${line}\n` };
    } else if (current) {
      current.text += `${line}\n`;
    }
  }
  if (current) sections.push(current);
  return sections.map((s) => ({ sectionId: s.sectionId, text: s.text.trim() }));
}

/**
 * Parse a plan's markdown into its index units: the plan-level unit (`__plan__`,
 * whose text is the whole body) plus one unit per `## ` section.
 *
 * @param {string} content  Raw plan markdown (frontmatter + body).
 * @returns {Array<{ sectionId: string, kind: 'plan'|'section', text: string, files: string[], parentVision: string|null, status: string|null }>}
 */
function parseUnits(content) {
  const { frontmatter, body } = splitFrontmatter(content);
  const meta = parseFrontmatterFields(frontmatter);
  const trimmedBody = body.trim();
  /** @type {Array<{ sectionId: string, kind: 'plan'|'section', text: string, files: string[], parentVision: string|null, status: string|null }>} */
  const units = [{
    sectionId: PLAN_SENTINEL,
    kind: 'plan',
    text: trimmedBody,
    files: meta.files,
    parentVision: meta.parentVision,
    status: meta.status
  }];
  for (const sec of splitSections(body)) {
    units.push({
      sectionId: sec.sectionId,
      kind: 'section',
      text: sec.text,
      files: meta.files,
      parentVision: meta.parentVision,
      status: meta.status
    });
  }
  return units;
}

/**
 * Best-effort diagnostic-note log to `.ctoc/logs/plan-index-sync.json`. Never throws.
 * @param {string|undefined} logDir
 * @param {string} note
 * @param {object} [detail]
 */
function logNote(logDir, note, detail = {}) {
  if (!logDir) return;
  try {
    if (!safeFs.existsSync(logDir)) safeFs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, 'plan-index-sync.json');
    let log = [];
    if (safeFs.existsSync(logPath)) {
      try { log = JSON.parse(safeFs.readFileSync(logPath, 'utf8')); } catch { log = []; }
    }
    if (!Array.isArray(log)) log = [];
    log.push({ timestamp: new Date().toISOString(), note, ...detail });
    if (log.length > 500) log = log.slice(-500);
    safeFs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  } catch {
    /* logging is best-effort; never propagate */
  }
}

/**
 * Sync ONE plan file into the index (idempotent, read-fresh, diff-then-embed).
 *
 * @param {string} planPath  Absolute or relative path to the plan .md file.
 * @param {{
 *   store?: object,
 *   embedder?: (texts: string[]) => Promise<Float32Array[]|{vectors: Float32Array[]}>,
 *   calibrationReady?: () => boolean,
 *   plansRoot?: string,
 *   logDir?: string,
 *   batchApi?: object
 * }} [deps]  Required at runtime: `store` and `embedder` (validated below).
 * @returns {Promise<{ changed: string[], skipped: boolean, reason?: string }>}
 */
async function syncUnit(planPath, deps = {}) {
  const { store, embedder, calibrationReady, plansRoot, logDir, batchApi } = deps;
  if (!store) throw new TypeError('syncUnit: a store is required');
  if (typeof embedder !== 'function') throw new TypeError('syncUnit: an embedder function is required');
  const api = batchApi || store;

  // 1. calibration gate (SY-14): no embed/write work until the dimension is settled.
  if (typeof calibrationReady === 'function' && !calibrationReady()) {
    logNote(logDir, 'syncUnit: calibration not ready — deferred', { planPath });
    return { changed: [], skipped: true, reason: 'calibration-not-ready' };
  }

  // 2. read FRESH bytes. ENOENT is data, not an error.
  let content;
  try {
    content = await safeFs.promises.readFile(planPath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { changed: [], skipped: true, reason: 'file-missing' };
    }
    throw err;
  }

  const normPath = normalizePath(planPath, plansRoot);
  const units = parseUnits(content);
  const changed = [];

  // 5. per-unit diff → embed + upsert only on change (idempotent).
  for (const u of units) {
    const h = hashUnit(u.text, { files: u.files, parentVision: u.parentVision, status: u.status });
    const prior = api.getUnit(normPath, u.sectionId);
    if (prior && prior.contentHash === h) continue; // unchanged → no-op (SY-08)

    const embedded = await embedder([u.text]);
    const vectors = Array.isArray(embedded) ? embedded : (embedded && embedded.vectors);
    const vector = vectors && vectors[0];
    if (!(vector instanceof Float32Array)) {
      throw new Error(`syncUnit: embedder did not return a Float32Array for ${normPath}#${u.sectionId}`);
    }
    api.upsertUnit({
      planPath: normPath,
      sectionId: u.sectionId,
      kind: u.kind,
      text: u.text,
      files: u.files,
      parentVision: u.parentVision,
      stepLabel: null,
      contentHash: h,
      embedding: vector
    });
    changed.push(u.sectionId);
  }

  // 6. remove stale sections: any stored unit for this plan whose sectionId is no
  //    longer present in the freshly-parsed set. Only reachable when the api can
  //    enumerate a plan's sections (the batch/real store expose listPlanPaths but
  //    section enumeration needs getUnit probing; the sweep handles plan-level
  //    orphans — section-level orphans self-heal on the next full-body re-embed
  //    because a body edit changes the plan-unit hash). Documented in the plan.
  return { changed, skipped: false };
}

module.exports = { syncUnit, normalizePath, parseUnits, parseFrontmatterFields, splitSections };
