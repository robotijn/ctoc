/**
 * Requirements Traceability Matrix (v6.9.27)
 *
 * Bidirectional links from high-level requirement → low-level requirement →
 * source code → test case. Required by RTCA DO-178C and IEC 62304 Edition 2
 * (effective mid-late 2026). Activated when `requirements_traceability_matrix`
 * control is enabled.
 *
 * The matrix is materialized as a queryable YAML file at
 * `.ctoc/traceability/matrix.yaml`. CTOC plans declare their requirements,
 * the implementer declares which files satisfy each requirement, the test-
 * maker declares which tests cover each requirement, and this library
 * cross-walks the lot.
 *
 * Cross-platform Node 18+, no native deps.
 *
 * References:
 *   - Parasoft — Requirements Traceability Matrix for DO-178C:
 *     https://www.parasoft.com/learning-center/do-178c/requirements-traceability/
 *   - IntuitionLabs — IEC 62304 Edition 2 changes:
 *     https://intuitionlabs.ai/articles/iec-62304-edition-2-medical-software-changes
 */

const safeFs = require('./safe-fs');
const path = require('path');

const MATRIX_PATH = '.ctoc/traceability/matrix.yaml';

/** Bounded compare-and-swap retries in `upsert` (no sleep, no busy-wait). */
const UPSERT_ATTEMPTS = 5;

/**
 * A stale-write refusal (mirrors task-registry.StaleRegistryError): the on-disk
 * `generation` moved between a value's `load` and its `save`, so persisting would
 * clobber another writer's committed row. Thrown by `save`; caught + retried by `upsert`.
 */
class StaleMatrixError extends Error {
  /** @param {string} message @param {{expected?:number, actual?:number}} [detail] */
  constructor(message, detail = {}) {
    super(message);
    this.name = 'StaleMatrixError';
    this.expected = detail.expected;
    this.actual = detail.actual;
  }
}

/**
 * The matrix `generation` as recorded on disk. Fail-open: an absent, unparseable, or
 * non-integer generation reads as 0, so every pre-CAS matrix.yaml is a valid
 * generation-0 matrix and no migration is required.
 * @param {string} projectRoot
 * @returns {number}
 */
function diskGeneration(projectRoot) {
  const p = path.join(projectRoot, MATRIX_PATH);
  try {
    if (!safeFs.existsSync(p)) return 0;
    const content = safeFs.readFileSync(p, 'utf8');
    const m = content.match(/^generation:\s*(\d+)\s*$/m);
    if (!m) return 0;
    const n = Number(m[1]);
    return Number.isSafeInteger(n) && n >= 0 ? n : 0;
  } catch {
    return 0; // a corrupt/unreadable file has no committed generation to protect
  }
}

/**
 * Schema for one requirement entry:
 *
 * - id: REQ-001
 *   level: HLR | LLR
 *   description: <one-line>
 *   parent: <REQ-id of higher-level req, or null>
 *   source_plan: plans/<stage>/<file>.md
 *   satisfied_by_files: [<path>, <path>]
 *   covered_by_tests: [<test-id>, <test-id>]
 *   verification_status: pending | covered | partial | failed
 *   last_updated: <ISO 8601>
 */

/**
 * Load the matrix from disk. Returns `{requirements: [], generated_at, generation}`.
 * A LOADED value always carries a `generation` (absent on disk ⇒ 0), so a subsequent
 * `save` is a real compare-and-swap.
 */
function load(projectRoot) {
  const p = path.join(projectRoot, MATRIX_PATH);
  if (!safeFs.existsSync(p)) return { requirements: [], generated_at: null, generation: 0 };
  const content = safeFs.readFileSync(p, 'utf8');
  return parseMatrix(content);
}

/**
 * Save the matrix to disk in a canonical YAML form so diffs stay clean.
 *
 * COMPARE-AND-SWAP on `generation` (mirrors task-registry.save): when the value carries
 * a numeric `generation` (i.e. it came from `load`) and the on-disk generation has MOVED
 * since, this REFUSES with `StaleMatrixError` and writes NOTHING — another writer
 * committed in between and a blind write would lose its row. `upsert` is the sanctioned
 * retry. A value with NO numeric `generation` (a hand-built literal) is an UNVERSIONED
 * (seeding) write and skips the compare, preserving the pre-CAS public contract for
 * direct `save` callers. The committed generation is written as `diskGeneration + 1` and
 * stamped back onto the in-memory value.
 */
function save(projectRoot, matrix) {
  const dir = path.join(projectRoot, '.ctoc', 'traceability');
  if (!safeFs.existsSync(dir)) safeFs.mkdirSync(dir, { recursive: true });

  const onDisk = diskGeneration(projectRoot);
  const loadedAt = Number.isSafeInteger(matrix.generation) && matrix.generation >= 0
    ? matrix.generation
    : null; // unversioned (hand-built) value → no compare
  if (loadedAt !== null && onDisk !== loadedAt) {
    throw new StaleMatrixError(
      `traceability-matrix: stale write refused — the matrix moved from generation ${loadedAt} ` +
      `to ${onDisk} while this value was held (another writer committed). Reload and re-apply.`,
      { expected: loadedAt, actual: onDisk },
    );
  }
  const nextGeneration = onDisk + 1;

  const lines = [
    `# Requirements Traceability Matrix`,
    `# Bidirectional links from high-level requirement to low-level requirement to source code to tests.`,
    `# Maintained by src/lib/traceability-matrix.js`,
    ``,
    `generated_at: ${matrix.generated_at || new Date().toISOString()}`,
    `generation: ${nextGeneration}`,
    `requirement_count: ${(matrix.requirements || []).length}`,
    ``,
    `requirements:`,
  ];
  for (const req of (matrix.requirements || [])) {
    lines.push(`  - id: ${req.id}`);
    lines.push(`    level: ${req.level || 'HLR'}`);
    lines.push(`    description: ${jsonStr(req.description || '')}`);
    lines.push(`    parent: ${req.parent || 'null'}`);
    lines.push(`    source_plan: ${req.source_plan || 'null'}`);
    lines.push(`    satisfied_by_files:`);
    for (const f of req.satisfied_by_files || []) lines.push(`      - ${f}`);
    if ((req.satisfied_by_files || []).length === 0) lines.push(`      []`);
    lines.push(`    covered_by_tests:`);
    for (const t of req.covered_by_tests || []) lines.push(`      - ${t}`);
    if ((req.covered_by_tests || []).length === 0) lines.push(`      []`);
    lines.push(`    verification_status: ${req.verification_status || 'pending'}`);
    lines.push(`    last_updated: ${req.last_updated || new Date().toISOString()}`);
    lines.push('');
  }
  // ATOMIC WRITE: write to a temp sibling, then rename over the target. A bare
  // writeFileSync is non-atomic — a crash mid-write leaves a truncated matrix.yaml,
  // which load()/parseMatrix silently reads as a surviving-prefix (lost rows, no
  // error), so Gate 3 findOrphans/summary run against an incomplete matrix. The
  // temp+rename makes the commit all-or-nothing (mirrors task-registry.save and
  // durable-log). The `generation` compare-and-swap ABOVE additionally closes the
  // LOST-UPDATE race: two simultaneous upsert() writers can no longer clobber each
  // other's row (the atomic rename prevents torn files, the CAS prevents lost updates).
  const target = path.join(projectRoot, MATRIX_PATH);
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    safeFs.writeFileSync(tmp, lines.join('\n'));
    safeFs.renameSync(tmp, target);
  } catch (err) {
    try { safeFs.unlinkSync(tmp); } catch { /* temp may not exist */ }
    throw err;
  }
  // Advance the in-memory value to the committed generation, so a caller may save the
  // SAME value again (sequential mutations) without a false compare-and-swap conflict.
  matrix.generation = nextGeneration;
}

/**
 * Insert or replace a requirement entry by id.
 *
 * LOST-UPDATE SAFE: the load → modify → save cycle runs under the `generation`
 * compare-and-swap (see `save`). When a concurrent writer commits between this cycle's
 * load and save, `save` throws `StaleMatrixError`; this reloads the winner's matrix and
 * re-applies the row (bounded retry, no sleep/busy-wait), so a concurrent upsert RETRIES
 * instead of silently dropping the other writer's row. The re-apply is idempotent — it
 * finds-or-adds this `req.id` against the fresh matrix each attempt.
 */
function upsert(projectRoot, req) {
  if (!req.id) throw new Error('traceability-matrix.upsert: id required');
  let lastErr = null;
  for (let attempt = 0; attempt < UPSERT_ATTEMPTS; attempt++) {
    const matrix = load(projectRoot);
    const idx = matrix.requirements.findIndex(r => r.id === req.id);
    req.last_updated = new Date().toISOString();
    if (idx >= 0) matrix.requirements[idx] = { ...matrix.requirements[idx], ...req };
    else matrix.requirements.push(req);
    matrix.generated_at = new Date().toISOString();
    try {
      save(projectRoot, matrix);
      return req;
    } catch (err) {
      if (err instanceof StaleMatrixError) { lastErr = err; continue; } // reload + re-apply
      throw err;
    }
  }
  throw lastErr || new StaleMatrixError(
    `traceability-matrix.upsert: gave up after ${UPSERT_ATTEMPTS} compare-and-swap attempts`,
  );
}

/**
 * Find orphan requirements (no satisfying file or no covering test).
 * Used at Gate 3 to refuse approval when traceability is incomplete.
 */
function findOrphans(projectRoot) {
  const matrix = load(projectRoot);
  return matrix.requirements.filter(r =>
    (r.satisfied_by_files || []).length === 0 ||
    (r.covered_by_tests || []).length === 0
  );
}

/**
 * Find dangling references (a requirement points at a file or test id that does not exist).
 */
function findDanglingReferences(projectRoot) {
  const matrix = load(projectRoot);
  const dangling = [];
  for (const req of matrix.requirements) {
    for (const f of req.satisfied_by_files || []) {
      const absPath = path.join(projectRoot, f);
      if (!safeFs.existsSync(absPath)) {
        dangling.push({ requirement_id: req.id, kind: 'missing_file', value: f });
      }
    }
    // For tests, we accept any test id string — the test-runner is responsible
    // for confirming actual coverage at Step 14.
  }
  return dangling;
}

/**
 * Coverage summary for use at Gate 3 / final review.
 */
function summary(projectRoot) {
  const matrix = load(projectRoot);
  const total = matrix.requirements.length;
  const verified = matrix.requirements.filter(r => r.verification_status === 'covered').length;
  const pending = matrix.requirements.filter(r => r.verification_status === 'pending').length;
  const failed = matrix.requirements.filter(r => r.verification_status === 'failed').length;
  const partial = matrix.requirements.filter(r => r.verification_status === 'partial').length;
  const orphans = findOrphans(projectRoot).length;
  return {
    total_requirements: total,
    verified, pending, partial, failed,
    orphans,
    coverage_pct: total === 0 ? null : Math.round((verified / total) * 100),
  };
}

function jsonStr(v) {
  if (v === null || v === undefined) return 'null';
  return JSON.stringify(v);
}

function parseMatrix(content) {
  // Minimal parser for the canonical shape written by save().
  const out = { requirements: [], generated_at: null, generation: 0 };
  const tsMatch = content.match(/^generated_at:\s+(\S+)$/m);
  if (tsMatch) out.generated_at = tsMatch[1];
  const genMatch = content.match(/^generation:\s*(\d+)\s*$/m);
  if (genMatch) {
    const n = Number(genMatch[1]);
    if (Number.isSafeInteger(n) && n >= 0) out.generation = n;
  }
  const blocks = content.split(/^\s+- id:\s+/m).slice(1);
  for (const blk of blocks) {
    const idLine = blk.split('\n')[0];
    const req = { id: idLine.trim(), satisfied_by_files: [], covered_by_tests: [] };
    const lines = blk.split('\n').slice(1);
    let currentList = null;
    for (const line of lines) {
      if (/^\s+level:\s+(\S+)/.test(line)) req.level = RegExp.$1;
      else if (/^\s+description:\s+(.*)$/.test(line)) req.description = JSON.parse(RegExp.$1.trim() || '""');
      else if (/^\s+parent:\s+(.+)$/.test(line)) req.parent = RegExp.$1.trim() === 'null' ? null : RegExp.$1.trim();
      else if (/^\s+source_plan:\s+(.+)$/.test(line)) req.source_plan = RegExp.$1.trim() === 'null' ? null : RegExp.$1.trim();
      else if (/^\s+verification_status:\s+(\S+)/.test(line)) req.verification_status = RegExp.$1;
      else if (/^\s+last_updated:\s+(\S+)/.test(line)) req.last_updated = RegExp.$1;
      else if (/^\s+satisfied_by_files:/.test(line)) currentList = 'satisfied_by_files';
      else if (/^\s+covered_by_tests:/.test(line)) currentList = 'covered_by_tests';
      else if (currentList && /^\s+-\s+(\S.*)/.test(line)) req[currentList].push(RegExp.$1.trim());
      else if (!line.trim()) { /* end of block */ }
    }
    if (req.id) out.requirements.push(req);
  }
  return out;
}

module.exports = {
  load,
  save,
  upsert,
  findOrphans,
  findDanglingReferences,
  summary,
  MATRIX_PATH,
  StaleMatrixError,
};
