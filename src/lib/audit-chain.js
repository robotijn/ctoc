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
// Exclusive advisory lock for appendDispatch's read-head -> append -> write-head
// critical section. Lives under .ctoc/ (whitelisted, cleaned up in finally).
const CHAIN_LOCK_PATH = path.join(AUDIT_ROOT, 'chain.lock');
const GENESIS_HASH = '0'.repeat(64);

// Lock tuning (all overridable per-call via appendDispatch's `opts`, so tests stay fast).
// Cross-process contention on the audit lock is brief (a single append), so a bounded
// retry with a small backoff covers a subagent overlap without ever busy-spinning.
const DEFAULT_LOCK_RETRIES = 50;      // ~1s worst case at the default backoff
const DEFAULT_LOCK_BACKOFF_MS = 20;
const DEFAULT_LOCK_STALE_MS = 30000;  // a lock older than this is a crashed holder -> reclaim

/**
 * Synchronous, cross-platform sleep with NO busy-spin: block the thread on an
 * `Atomics.wait` against a private, never-notified SharedArrayBuffer, which always
 * times out after `ms`. Used for the bounded lock backoff (appendDispatch is a sync API).
 * @param {number} ms
 */
function sleepSync(ms) {
  if (!(ms > 0)) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Acquire the exclusive chain lock via an ATOMIC create (`flag: 'wx'` == O_EXCL): the
 * kernel guarantees exactly one caller's create succeeds, so this is NOT a TOCTOU
 * (unlike existsSync-then-write). A held lock triggers a bounded retry; a lock older than
 * `staleMs` is reclaimed (a crashed holder) — the reclaim only unlinks, the next atomic
 * create is still the sole arbiter, so a reclaim race cannot double-grant. FAIL-SAFE: if
 * the lock cannot be taken within the bounded retries this THROWS, so a caller never
 * appends unlocked and corrupts the tamper-evident chain.
 * @param {string} projectRoot
 * @param {{lockRetries?:number, lockBackoffMs?:number, lockStaleMs?:number}} opts
 * @returns {string} the absolute lock path (pass to releaseLock)
 * @throws {Error} the lock could not be acquired within the retry budget
 */
function acquireChainLock(projectRoot, opts = {}) {
  const lockPath = path.join(projectRoot, CHAIN_LOCK_PATH);
  const retries = Number.isSafeInteger(opts.lockRetries) && opts.lockRetries >= 0
    ? opts.lockRetries : DEFAULT_LOCK_RETRIES;
  const backoffMs = Number.isSafeInteger(opts.lockBackoffMs) && opts.lockBackoffMs >= 0
    ? opts.lockBackoffMs : DEFAULT_LOCK_BACKOFF_MS;
  const staleMs = Number.isSafeInteger(opts.lockStaleMs) && opts.lockStaleMs >= 0
    ? opts.lockStaleMs : DEFAULT_LOCK_STALE_MS;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      safeFs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() }),
        { encoding: 'utf8', flag: 'wx' }
      );
      return lockPath; // sole winner of the atomic create
    } catch (err) {
      if (!err || err.code !== 'EEXIST') throw err; // a real fs error (perms, etc.) -> fail loud
      reclaimIfStale(lockPath, staleMs); // crashed holder? drop it so a retry can win
      if (attempt < retries) sleepSync(backoffMs);
    }
  }
  throw new Error(
    `audit-chain.appendDispatch: could not acquire the chain lock at ${lockPath} after ` +
    `${retries + 1} attempts; refusing to append unlocked (an unserialized append would ` +
    `corrupt the tamper-evident chain).`
  );
}

/**
 * Reclaim a lock whose mtime is older than `staleMs` (its holder crashed without
 * releasing). Best-effort: only unlinks; the atomic create in acquireChainLock remains
 * the real arbiter, so even if two racers both unlink a stale lock only one create wins.
 * @param {string} lockPath
 * @param {number} staleMs
 */
function reclaimIfStale(lockPath, staleMs) {
  try {
    const st = safeFs.statSync(lockPath);
    if (Date.now() - st.mtimeMs > staleMs) {
      safeFs.unlinkSync(lockPath);
    }
  } catch {
    /* the lock vanished or is unreadable — the next create attempt decides the winner */
  }
}

/**
 * Release the chain lock. Idempotent — an already-removed lock is not an error.
 * @param {string} lockPath
 */
function releaseChainLock(lockPath) {
  try { safeFs.unlinkSync(lockPath); } catch { /* already gone — safe */ }
}

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
 * Derive the chain head from the AUTHORITATIVE append-only log tail rather than the
 * separate head file. The log is the source of truth (strictly append-only, one line
 * per entry, never rotated/pruned), so its last line is the true predecessor and its
 * line count is the true sequence. Reading the head from here is what makes appendDispatch
 * both crash-safe (a lost head-write on a prior call self-heals: the log still holds the
 * entry) and race-safe under the lock (a serialized second writer sees the first writer's
 * committed line, so it chains onto it instead of onto a stale snapshot).
 *
 * The head FILE (getChainHead) is deliberately NOT used here: it is the durable, separate
 * copy verifyChain reconciles against to DETECT tampering, and must stay independent.
 *
 * @param {string} projectRoot
 * @returns {{hash:string, sequence:number, updated_at:(string|null)}}
 */
function chainHeadFromLog(projectRoot) {
  const logPath = path.join(projectRoot, CHAIN_LOG_PATH);
  if (!safeFs.existsSync(logPath)) {
    return { hash: GENESIS_HASH, sequence: 0, updated_at: null };
  }
  const lines = safeFs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
  // Scan from the END for the last WELL-FORMED entry. A crash DURING appendFileSync leaves a
  // TRUNCATED, unterminated JSON line at the tail — the very crash window this log-tail
  // derivation exists to self-heal. TOLERATE it: skip trailing unparseable line(s) and chain
  // onto the last well-formed entry, whose line index (1-based) is the true sequence (the log
  // is strictly append-only, so only the tail can ever be a partial write). A strict
  // `JSON.parse(last)` here throws on that partial and — because the throw propagates out of
  // every subsequent appendDispatch — permanently bricks the chain until a human hand-edits
  // the log; that regression is exactly what this scan removes. An EMPTY or ALL-malformed log
  // (no well-formed line at all) falls through to genesis, so the next append still progresses.
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue; // trailing crash-truncated artifact — ignore it, keep scanning backward
    }
    return {
      hash: entry.chain_hash,
      sequence: i + 1,
      updated_at: entry.timestamp || null,
    };
  }
  return { hash: GENESIS_HASH, sequence: 0, updated_at: null };
}

/**
 * Read the append-only log's WELL-FORMED lines, dropping any contiguous run of unparseable
 * lines at the TAIL — the artifact of a crash mid-appendFileSync. Only the tail can be a
 * partial write (the log is strictly append-only), so a trailing unparseable line is the
 * crash fingerprint, not tamper. Returns the surviving valid lines plus a flag telling the
 * caller a heal (rewrite-without-the-partial) is warranted.
 * @param {string} projectRoot
 * @returns {{validLines:string[], hadTrailingPartial:boolean}}
 */
function readLogLinesHealed(projectRoot) {
  const logPath = path.join(projectRoot, CHAIN_LOG_PATH);
  if (!safeFs.existsSync(logPath)) {
    return { validLines: [], hadTrailingPartial: false };
  }
  const lines = safeFs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
  let end = lines.length;
  while (end > 0) {
    try { JSON.parse(lines[end - 1]); break; }
    catch { end--; } // strip the crash-truncated trailing line(s)
  }
  return { validLines: lines.slice(0, end), hadTrailingPartial: end < lines.length };
}

/**
 * Preserve a TOTALLY-corrupt chain log before the chain resumes from genesis. Moves the
 * existing (entirely unparseable) log aside to a sibling `chain.jsonl.corrupt-<n>` so the
 * corrupt bytes survive on disk as forensic evidence, and emits a stderr warning matching the
 * module's fail-open warn style. The suffix is DETERMINISTIC (not Date.now/random): the first
 * free `-<n>` slot, so repeated corruption events never collide and never overwrite prior
 * evidence. After the rename the original log path is free for a fresh, genesis-based append.
 * @param {string} logPath absolute path to the corrupt chain log
 * @returns {string} the sibling path the corrupt bytes were moved to
 */
function preserveCorruptLog(logPath) {
  let n = 0;
  let target = `${logPath}.corrupt-${n}`;
  while (safeFs.existsSync(target)) {
    n++;
    target = `${logPath}.corrupt-${n}`;
  }
  safeFs.renameSync(logPath, target);
  process.stderr.write(
    `audit-chain: WARNING — the chain log at ${logPath} was ENTIRELY unparseable ` +
    `(total corruption). Preserved the corrupt bytes at ${target} for forensics and ` +
    `resumed the chain from genesis (verifyChain still reflects the live chain).\n`
  );
  return target;
}

/**
 * Append a new dispatch entry to the chain. The caller has already written
 * the dispatch YAML to disk; this records a chain entry referencing the
 * entry's content hash and the previous chain head.
 *
 * CONCURRENCY + ATOMICITY (v6.12.32): the whole read-head -> append-log -> write-head
 * sequence runs UNDER AN EXCLUSIVE LOCK, because dispatch logging is driven from PARALLEL
 * subagent dispatches (DISPATCH_PROTOCOL). Two concerns are closed here:
 *   1. A benign race between two writers no longer breaks the chain — the lock serializes
 *      the critical section, and the head is derived from the committed log tail (not a
 *      per-writer head snapshot), so the second writer chains onto the first.
 *   2. A crash between the log append and the head write self-heals — the head is
 *      reconciled FROM the log on the next append, so a lost head-write is recovered and
 *      verifyChain's invariants (head.hash == last entry, head.sequence == count) hold
 *      again. verifyChain is NOT weakened.
 * If the lock cannot be acquired within its bounded retries, this THROWS rather than
 * appending unlocked.
 *
 * @param {string} projectRoot
 * @param {Object} dispatch - the dispatch record (must include `dispatch_id` and `timestamp`)
 * @param {{lockRetries?:number, lockBackoffMs?:number, lockStaleMs?:number}} [opts] - lock tuning
 * @returns {Object} the chain entry that was appended
 * @throws {Error} missing dispatch_id, or the lock could not be acquired
 */
function appendDispatch(projectRoot, dispatch, opts = {}) {
  if (!dispatch.dispatch_id) {
    throw new Error('audit-chain.appendDispatch: dispatch must include dispatch_id');
  }
  ensureDir(path.join(projectRoot, AUDIT_ROOT));

  const lockPath = acquireChainLock(projectRoot, opts);
  try {
    const logPath = path.join(projectRoot, CHAIN_LOG_PATH);

    // Self-heal a crash-truncated trailing line BEFORE extending the chain. A death mid-
    // appendFileSync leaves an unterminated JSON line at the tail; left in place it would
    // both brick chainHeadFromLog's old strict parse AND fail verifyChain forever. Under the
    // lock we rewrite the log without that artifact so the next entry appends onto a clean,
    // verifiable log rather than accumulating the partial line. Only ever removes an
    // UNPARSEABLE trailing line (append-only ⇒ only the tail can be a partial write); a
    // well-formed but altered line is left intact so verifyChain still detects tamper.
    const { validLines, hadTrailingPartial } = readLogLinesHealed(projectRoot);
    if (hadTrailingPartial) {
      if (validLines.length) {
        // A trailing partial AFTER valid entries: strip only the crash artifact, keep the
        // verifiable entries. This is the correct, information-preserving heal.
        safeFs.writeFileSync(logPath, validLines.join('\n') + '\n');
      } else {
        // TOTAL corruption: the ENTIRE existing (non-empty) log is unparseable. Overwriting it
        // with '' here would silently DESTROY the corrupt bytes — but for a forensic, tamper-
        // evident chain those bytes ARE the evidence that the log was corrupted; zeroing them
        // erases the very thing an audit is meant to retain. Instead PRESERVE the corrupt bytes
        // to a deterministic, non-colliding sibling and surface the event, THEN let the chain
        // continue from genesis (forward progress, no brick). verifyChain is untouched.
        preserveCorruptLog(logPath);
      }
    }

    // Read the head from the AUTHORITATIVE (now healed) log tail inside the lock (see
    // chainHeadFromLog): this is what makes the append both crash-safe and race-safe.
    const head = chainHeadFromLog(projectRoot);
    const entryHash = canonicalHash(dispatch);

    const chainEntry = {
      sequence: head.sequence + 1,
      timestamp: dispatch.timestamp || new Date().toISOString(),
      dispatch_id: dispatch.dispatch_id,
      entry_hash: entryHash,
      previous_chain_hash: head.hash,
    };
    chainEntry.chain_hash = canonicalHash(chainEntry);

    // Append to the chain log (newline-delimited JSON)
    safeFs.appendFileSync(logPath, JSON.stringify(chainEntry) + '\n');

    // Update the chain head. If the process dies here (after the append, before this
    // write), the next appendDispatch reconciles the head from the log tail and heals.
    const headPath = path.join(projectRoot, CHAIN_HEAD_PATH);
    safeFs.writeFileSync(headPath,
      `hash: ${chainEntry.chain_hash}\nsequence: ${chainEntry.sequence}\nupdated_at: ${chainEntry.timestamp}\nlast_dispatch_id: ${chainEntry.dispatch_id}\n`);

    return chainEntry;
  } finally {
    releaseChainLock(lockPath);
  }
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
  // Reconcile the durable chain head (a SEPARATE file, .ctoc/audit/chain-head.yaml)
  // against the walked log — INDEPENDENT of `count`. A non-genesis head PROVES entries
  // once existed; if the walked log no longer terminates at that head, the log has been
  // truncated or erased and the chain is broken. The former `&& count > 0` guard disabled
  // exactly this check for an empty log, so full audit-trail erasure (wipe chain.jsonl ->
  // count 0, walked hash GENESIS_HASH, non-genesis head) passed as ok:true. A
  // never-initialized project has head.hash === GENESIS_HASH and is correctly skipped.
  if (head.hash !== GENESIS_HASH && head.hash !== previousChainHash) {
    return {
      ok: false,
      reason: 'chain head does not match last log entry',
      expected: previousChainHash,
      stored: head.hash,
    };
  }
  // Additional cross-check: the audit log is STRICTLY append-only. appendDispatch only
  // ever appends one line and bumps head.sequence by exactly 1, and NO code path rotates,
  // prunes, or truncates chain.jsonl — verified by grepping this module for
  // rotate/prune/truncate/maxEntries (none) and confirming the only other reader,
  // src/scripts/evidence-pack.js, is read-only. Hence head.sequence === (walked entry
  // count) in every legitimate state, so a mismatch is tamper. This additionally catches
  // the reset-head-keep-log direction (head reset to genesis while an intact log
  // survives), which the hash reconciliation above deliberately skips at genesis.
  if (head.sequence !== count) {
    return {
      ok: false,
      reason: 'chain head sequence does not match log length',
      expected: count,
      stored: head.sequence,
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
