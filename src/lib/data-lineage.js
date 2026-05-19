/**
 * Data Lineage Tracking (v6.9.27)
 *
 * Basel Committee on Banking Supervision Principle 3 (BCBS 239) — only 2 of
 * 31 banks fully comply with the data-lineage principle. Required by the
 * Digital Operational Resilience Act, MiFID II transaction reporting, and
 * the European Union Artificial Intelligence Act high-risk-system
 * documentation obligations.
 *
 * Activated when `data_lineage` control is enabled. Records, for each
 * dispatch, the Secure Hash Algorithm 256 of inputs the dispatch saw and the
 * outputs it produced, plus the parent dispatch id (forming a directed
 * acyclic graph the user can query via `/ctoc:lineage <plan-id>`).
 *
 * Lineage entries are appended to `.ctoc/audit/lineage.jsonl` alongside the
 * existing dispatch yaml files. Cross-platform Node 18+, no native deps.
 *
 * References:
 *   - Atlan — BCBS 239 data lineage guide 2025:
 *     https://atlan.com/know/data-governance/bcbs-239-data-lineage/
 *   - Basel Committee Implementation Progress:
 *     https://www.bis.org/publ/bcbs_nl36.htm
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LINEAGE_LOG = '.ctoc/audit/lineage.jsonl';

/**
 * Record a lineage event.
 *
 * @param {string} projectRoot
 * @param {Object} event - {dispatch_id, parent_dispatch_id?, inputs: [{kind, ref, sha256}], outputs: [{kind, ref, sha256}], agent}
 */
function record(projectRoot, event) {
  if (!event.dispatch_id) throw new Error('data-lineage.record: dispatch_id required');
  ensureDir(path.dirname(path.join(projectRoot, LINEAGE_LOG)));
  const entry = {
    timestamp: new Date().toISOString(),
    dispatch_id: event.dispatch_id,
    parent_dispatch_id: event.parent_dispatch_id || null,
    agent: event.agent || '(unspecified)',
    inputs_hash: hashList(event.inputs || []),
    outputs_hash: hashList(event.outputs || []),
    inputs: event.inputs || [],
    outputs: event.outputs || [],
  };
  fs.appendFileSync(path.join(projectRoot, LINEAGE_LOG), JSON.stringify(entry) + '\n');
  return entry;
}

/**
 * Walk the lineage graph backward from a dispatch id, returning all ancestors.
 */
function ancestorsOf(projectRoot, dispatchId, maxDepth = 50) {
  const all = readAll(projectRoot);
  const byId = {};
  for (const e of all) byId[e.dispatch_id] = e;

  const out = [];
  let current = byId[dispatchId];
  let depth = 0;
  while (current && depth < maxDepth) {
    out.push(current);
    if (!current.parent_dispatch_id) break;
    current = byId[current.parent_dispatch_id];
    depth++;
  }
  return out;
}

/**
 * Forward walk — all descendants of a dispatch id.
 */
function descendantsOf(projectRoot, dispatchId) {
  const all = readAll(projectRoot);
  const childrenOf = {};
  for (const e of all) {
    if (!e.parent_dispatch_id) continue;
    if (!childrenOf[e.parent_dispatch_id]) childrenOf[e.parent_dispatch_id] = [];
    childrenOf[e.parent_dispatch_id].push(e);
  }
  const out = [];
  const stack = [dispatchId];
  while (stack.length > 0) {
    const id = stack.pop();
    for (const child of childrenOf[id] || []) {
      out.push(child);
      stack.push(child.dispatch_id);
    }
  }
  return out;
}

/**
 * Render the lineage of a plan as a directed-acyclic-graph in
 * human-readable form.
 */
function renderLineage(projectRoot, dispatchId) {
  const ancestors = ancestorsOf(projectRoot, dispatchId).reverse();
  const descendants = descendantsOf(projectRoot, dispatchId);
  return {
    target: dispatchId,
    ancestors: ancestors.map(e => `${e.timestamp}  ${e.agent}  ${e.dispatch_id}`),
    descendants: descendants.map(e => `${e.timestamp}  ${e.agent}  ${e.dispatch_id}`),
    total_in_graph: ancestors.length + descendants.length + 1,
  };
}

function readAll(projectRoot) {
  const p = path.join(projectRoot, LINEAGE_LOG);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function hashList(items) {
  if (!items || items.length === 0) return null;
  const canon = items.map(i => i.sha256 || `${i.kind}:${i.ref}`).sort().join('|');
  return crypto.createHash('sha256').update(canon).digest('hex');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

module.exports = {
  record,
  ancestorsOf,
  descendantsOf,
  renderLineage,
  LINEAGE_LOG,
};
