/**
 * Audit Chain — cryptographically chained append-only audit log (v6.9.27)
 *
 * Implements the evidence-grade audit log demanded across all four industries
 * (finance, safety, legal, manufacturing) in the cross-industry critique. Each
 * dispatch entry is a YAML file at `.ctoc/audit/dispatches/<date>/<id>.yaml`;
 * this library maintains a parallel hash chain that makes the directory
 * tamper-evident.
 *
 * Design:
 *   - Every dispatch entry is content-hashed with Secure Hash Algorithm 256.
 *   - The chain links each new entry to the previous entry's hash (Merkle-log
 *     of depth 1, simplest tamper-evidence shape).
 *   - The current chain head is stored at `.ctoc/audit/chain-head.yaml`.
 *   - The full chain log is at `.ctoc/audit/chain.jsonl` (append-only).
 *   - Verification walks the chain from head backward and recomputes hashes.
 *
 * References:
 *   - Securities and Exchange Commission 17a-4 / Financial Industry Regulatory
 *     Authority Rule 4511 audit-trail alternative (May 2023 modernization):
 *     https://www.smarsh.com/regulations/finra-rule-4511/
 *   - Sigstore transparency log model:
 *     https://docs.sigstore.dev/logging/overview/
 *
 * Cross-platform: pure Node 18+ with built-in crypto, no native deps.
 * Activated when the `audit_hash_chain` control is enabled by the active
 * regulatory regime (see src/lib/regulatory-regime.js).
 */

const safeFs = require('./safe-fs');
const path = require('path');
const crypto = require('crypto');

const AUDIT_ROOT = '.ctoc/audit';
const CHAIN_HEAD_PATH = path.join(AUDIT_ROOT, 'chain-head.yaml');
const CHAIN_LOG_PATH = path.join(AUDIT_ROOT, 'chain.jsonl');
const GENESIS_HASH = '0'.repeat(64);

/**
 * Compute the canonical Secure Hash Algorithm 256 over a JavaScript object
 * by serializing keys in deterministic order. Returns a 64-character
 * lowercase hexadecimal string.
 */
function canonicalHash(obj) {
  const serialized = stableStringify(obj);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

/**
 * Read the current chain head. Returns the genesis hash when no chain
 * exists yet.
 */
function getChainHead(projectRoot) {
  const headPath = path.join(projectRoot, CHAIN_HEAD_PATH);
  if (!safeFs.existsSync(headPath)) {
    return { hash: GENESIS_HASH, sequence: 0, updated_at: null };
  }
  const content = safeFs.readFileSync(headPath, 'utf8');
  const hashMatch = content.match(/^hash:\s+(\S+)$/m);
  const seqMatch = content.match(/^sequence:\s+(\d+)$/m);
  const tsMatch = content.match(/^updated_at:\s+(\S+)$/m);
  return {
    hash: hashMatch ? hashMatch[1] : GENESIS_HASH,
    sequence: seqMatch ? parseInt(seqMatch[1], 10) : 0,
    updated_at: tsMatch ? tsMatch[1] : null,
  };
}

/**
 * Append a new dispatch entry to the chain. The caller has already written
 * the dispatch YAML to disk; this records a chain entry referencing the
 * entry's content hash and the previous chain head.
 *
 * @param {string} projectRoot
 * @param {Object} dispatch - the dispatch record (must include `dispatch_id` and `timestamp`)
 * @returns {Object} the chain entry that was appended
 */
function appendDispatch(projectRoot, dispatch) {
  if (!dispatch.dispatch_id) {
    throw new Error('audit-chain.appendDispatch: dispatch must include dispatch_id');
  }
  ensureDir(path.join(projectRoot, AUDIT_ROOT));

  const head = getChainHead(projectRoot);
  const entryHash = canonicalHash(dispatch);

  const chainEntry = {
    sequence: head.sequence + 1,
    timestamp: dispatch.timestamp || new Date().toISOString(),
    dispatch_id: dispatch.dispatch_id,
    entry_hash: entryHash,
    previous_chain_hash: head.hash,
  };
  chainEntry.chain_hash = canonicalHash(chainEntry);

  // Append to the chain log (newline-delimited JSON, never rewritten)
  const logPath = path.join(projectRoot, CHAIN_LOG_PATH);
  safeFs.appendFileSync(logPath, JSON.stringify(chainEntry) + '\n');

  // Update the chain head
  const headPath = path.join(projectRoot, CHAIN_HEAD_PATH);
  safeFs.writeFileSync(headPath,
    `hash: ${chainEntry.chain_hash}\nsequence: ${chainEntry.sequence}\nupdated_at: ${chainEntry.timestamp}\nlast_dispatch_id: ${chainEntry.dispatch_id}\n`);

  return chainEntry;
}

/**
 * Verify the integrity of the audit chain from genesis to head.
 * Returns `{ ok: true, count }` if the chain is intact, or
 * `{ ok: false, broken_at, expected_hash, computed_hash, reason }` if
 * any entry has been tampered with.
 */
function verifyChain(projectRoot) {
  const logPath = path.join(projectRoot, CHAIN_LOG_PATH);
  if (!safeFs.existsSync(logPath)) {
    return { ok: true, count: 0, note: 'no chain entries yet' };
  }
  const lines = safeFs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
  let previousChainHash = GENESIS_HASH;
  let count = 0;

  for (let i = 0; i < lines.length; i++) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch (e) {
      return { ok: false, broken_at: i, reason: `malformed JSON: ${e.message}` };
    }
    if (entry.previous_chain_hash !== previousChainHash) {
      return {
        ok: false,
        broken_at: i,
        reason: 'previous_chain_hash mismatch',
        expected_previous: previousChainHash,
        found_previous: entry.previous_chain_hash,
      };
    }
    // Recompute the chain hash and verify
    const recomputable = {
      sequence: entry.sequence,
      timestamp: entry.timestamp,
      dispatch_id: entry.dispatch_id,
      entry_hash: entry.entry_hash,
      previous_chain_hash: entry.previous_chain_hash,
    };
    const recomputed = canonicalHash(recomputable);
    if (recomputed !== entry.chain_hash) {
      return {
        ok: false,
        broken_at: i,
        reason: 'chain_hash recomputation failed',
        expected_hash: recomputed,
        stored_hash: entry.chain_hash,
      };
    }
    previousChainHash = entry.chain_hash;
    count++;
  }

  const head = getChainHead(projectRoot);
  if (head.hash !== previousChainHash && count > 0) {
    return {
      ok: false,
      reason: 'chain head does not match last log entry',
      expected: previousChainHash,
      stored: head.hash,
    };
  }
  return { ok: true, count };
}

/**
 * Verify a single dispatch file matches its recorded entry_hash.
 * Useful when the caller wants to confirm a specific dispatch yaml has
 * not been altered.
 */
function verifyDispatch(projectRoot, dispatchPath, expectedHash) {
  if (!safeFs.existsSync(dispatchPath)) {
    return { ok: false, reason: 'dispatch file missing' };
  }
  const content = safeFs.readFileSync(dispatchPath, 'utf8');
  // Parse the dispatch as a JS object via the minimal YAML parser used elsewhere.
  // For now we hash the canonical text content; recommended caller stores the
  // exact hash that was hashed at append time.
  const actual = crypto.createHash('sha256').update(content).digest('hex');
  return {
    ok: actual === expectedHash,
    actual,
    expected: expectedHash,
  };
}

function ensureDir(dir) {
  if (!safeFs.existsSync(dir)) safeFs.mkdirSync(dir, { recursive: true });
}

module.exports = {
  GENESIS_HASH,
  canonicalHash,
  getChainHead,
  appendDispatch,
  verifyChain,
  verifyDispatch,
};
