/**
 * Security: Audit Chain Tamper-Evidence Tests
 * ===========================================
 *
 * Target: src/lib/audit-chain.js — a SHA-256 hash-chained, append-only,
 * tamper-evident audit log. Chain head at `.ctoc/audit/chain-head.yaml`,
 * append-only log at `.ctoc/audit/chain.jsonl`. Verification (`verifyChain`)
 * walks the log from genesis, recomputing each entry's `chain_hash` and
 * checking that each entry's `previous_chain_hash` links to the prior entry's
 * `chain_hash`, then confirms the chain head matches the last log entry.
 *
 * This is a SECURITY property test. The whole point of a hash chain is that
 * ANY post-hoc edit to the on-disk log or head is detected. Therefore each
 * tamper test below asserts that `verifyChain(...).ok === false`. If any of
 * those assertions FAILS, the chain is NOT tamper-evident and that is a real,
 * shippable integrity bug — leave it failing, do not soften the assertion.
 *
 * Exact exported API used (from src/lib/audit-chain.js):
 *   - GENESIS_HASH        : string ('0' * 64)
 *   - canonicalHash(obj)  : deterministic SHA-256 hex of an object
 *   - getChainHead(root)  : { hash, sequence, updated_at }
 *   - appendDispatch(root, dispatch) : appends a chain entry, returns it
 *   - verifyChain(root)   : { ok, count, ... } / { ok:false, broken_at, reason }
 *   - verifyDispatch(...) : (not exercised here; out of scope for chain tests)
 *
 * Root location: audit-chain.js takes `projectRoot` as the FIRST argument of
 * every function and builds paths via `path.join(projectRoot, '.ctoc/audit/...')`.
 * There is NO process.cwd() fallback, so we pass a hermetic temp root explicitly.
 *
 * Hermetic: every test gets its own mkdtempSync root, realpath-resolved
 * (macOS /var -> /private/var symlink safety), removed in afterEach.
 * Cross-platform: path.join everywhere, os.tmpdir(), fs only.
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { test, describe, beforeEach, afterEach } = require('node:test');

const REPO = path.resolve(__dirname, '..');
const auditChain = require(path.join(REPO, 'src', 'lib', 'audit-chain.js'));

const {
  GENESIS_HASH,
  canonicalHash,
  getChainHead,
  appendDispatch,
  verifyChain,
} = auditChain;

// Relative locations the library writes to, under the project root.
const LOG_REL = path.join('.ctoc', 'audit', 'chain.jsonl');
const HEAD_REL = path.join('.ctoc', 'audit', 'chain-head.yaml');

describe('Security: audit-chain tamper-evidence', () => {
  let root;
  let logPath;
  let headPath;

  beforeEach(() => {
    // realpathSync collapses the macOS /var -> /private/var symlink so any
    // path comparisons the library does internally stay consistent.
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-audit-chain-')));
    logPath = path.join(root, LOG_REL);
    headPath = path.join(root, HEAD_REL);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  // --- helpers --------------------------------------------------------------

  /** Append N synthetic dispatches with stable, deterministic timestamps. */
  function appendN(n) {
    const entries = [];
    for (let i = 1; i <= n; i++) {
      const dispatch = {
        dispatch_id: `dispatch-${i}`,
        timestamp: `2026-06-15T00:00:0${i}.000Z`,
        agent: `agent-${i}`,
        action: 'dispatch',
        payload: { i },
      };
      entries.push(appendDispatch(root, dispatch));
    }
    return entries;
  }

  /** Read the raw jsonl log lines (no trailing empty). */
  function readLogLines() {
    return fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
  }

  /** Overwrite the jsonl log with the given array of raw string lines. */
  function writeLogLines(lines) {
    fs.writeFileSync(logPath, lines.join('\n') + (lines.length ? '\n' : ''));
  }

  // --- Contract 1: happy path ----------------------------------------------

  test('1. append + verify happy path: chain valid, head advances, one line per entry', () => {
    const before = getChainHead(root);
    assert.equal(before.hash, GENESIS_HASH, 'fresh chain head must be genesis');
    assert.equal(before.sequence, 0, 'fresh chain sequence must be 0');

    const entries = appendN(3);

    // One jsonl line per appended entry.
    const lines = readLogLines();
    assert.equal(lines.length, 3, 'expected exactly one jsonl line per entry');

    // Chain verifies clean. (Green proof: this is the positive integrity case.)
    const result = verifyChain(root);
    assert.equal(result.ok, true, `valid chain must verify ok; got: ${JSON.stringify(result)}`);
    assert.equal(result.count, 3, 'verify must count every entry');

    // Head advanced to the last entry's chain_hash and sequence 3.
    const head = getChainHead(root);
    assert.equal(head.sequence, 3, 'head sequence must advance to N');
    assert.notEqual(head.hash, GENESIS_HASH, 'head must move off genesis after appends');
    assert.equal(head.hash, entries[2].chain_hash, 'head hash must equal last entry chain_hash');

    // Sequences are strictly increasing 1..N.
    entries.forEach((e, idx) => assert.equal(e.sequence, idx + 1, 'sequences must be 1..N'));
  });

  // --- Contract 2: modify a middle entry on disk ---------------------------

  test('2. tamper-MODIFY a middle entry -> verify MUST fail', () => {
    appendN(3);
    const lines = readLogLines();

    // Mutate a meaningful field of the middle (index 1) entry's hashed body.
    const mid = JSON.parse(lines[1]);
    mid.dispatch_id = 'dispatch-FORGED'; // part of `recomputable` -> changes chain_hash
    lines[1] = JSON.stringify(mid);
    writeLogLines(lines);

    const result = verifyChain(root);
    assert.equal(result.ok, false, 'modifying a hashed field of a middle entry MUST be detected');
    assert.equal(result.broken_at, 1, 'breakage must be reported at the tampered index');
  });

  // --- Contract 3: delete a middle line ------------------------------------

  test('3. tamper-DELETE a middle line -> verify MUST fail', () => {
    appendN(3);
    const lines = readLogLines();

    // Remove the middle entry; entry-3 now follows entry-1 but still carries
    // entry-2's chain_hash as its previous_chain_hash -> linkage break.
    lines.splice(1, 1);
    writeLogLines(lines);

    const result = verifyChain(root);
    assert.equal(result.ok, false, 'deleting a middle log line MUST be detected');
    assert.equal(result.broken_at, 1, 'breakage must surface at the now-orphaned successor index');
  });

  // --- Contract 4: insert a forged entry without correct linkage -----------

  test('4. tamper-INSERT a forged entry -> verify MUST fail', () => {
    appendN(2);
    const lines = readLogLines();

    // Craft a forged entry and even self-consistently hash it so its OWN
    // chain_hash recomputes correctly. The defense it cannot beat without the
    // real prior hash is the previous_chain_hash linkage check.
    const forged = {
      sequence: 99,
      timestamp: '2026-06-15T00:00:99.000Z',
      dispatch_id: 'dispatch-INJECTED',
      entry_hash: canonicalHash({ injected: true }),
      previous_chain_hash: 'f'.repeat(64), // NOT the real preceding chain_hash
    };
    forged.chain_hash = canonicalHash(forged);

    // Splice it between the two genuine entries.
    lines.splice(1, 0, JSON.stringify(forged));
    writeLogLines(lines);

    const result = verifyChain(root);
    assert.equal(result.ok, false, 'an inserted entry with bad linkage MUST be detected');
    assert.equal(result.broken_at, 1, 'breakage must be reported at the injected index');
    assert.equal(result.reason, 'previous_chain_hash mismatch', 'must fail on the linkage check');
  });

  // --- Contract 5: reorder two lines ---------------------------------------

  test('5. tamper-REORDER two lines -> verify MUST fail', () => {
    appendN(3);
    const lines = readLogLines();

    // Swap entry-1 and entry-2. Now the first line's previous_chain_hash is
    // entry-1's chain_hash, but the walker expects GENESIS at position 0.
    const tmp = lines[0];
    lines[0] = lines[1];
    lines[1] = tmp;
    writeLogLines(lines);

    const result = verifyChain(root);
    assert.equal(result.ok, false, 'reordering log lines MUST be detected');
    assert.equal(result.broken_at, 0, 'first out-of-order line breaks at index 0 (genesis link)');
    assert.equal(result.reason, 'previous_chain_hash mismatch', 'reorder must fail the linkage check');
  });

  // --- Contract 6: tamper the chain-head.yaml ------------------------------

  test('6. tamper chain-head.yaml -> verify MUST fail', () => {
    appendN(3);

    // Corrupt the recorded head hash while leaving the log intact.
    const headContent = fs.readFileSync(headPath, 'utf8');
    const corrupted = headContent.replace(/^hash:\s+\S+$/m, `hash: ${'a'.repeat(64)}`);
    assert.notEqual(corrupted, headContent, 'precondition: head hash line must have been rewritten');
    fs.writeFileSync(headPath, corrupted);

    const result = verifyChain(root);
    assert.equal(result.ok, false, 'a head that disagrees with the last log entry MUST be detected');
    assert.equal(result.reason, 'chain head does not match last log entry',
      'must fail specifically on the head/log mismatch check');
  });

  // --- Contract 7: empty / never-written chain -----------------------------

  test('7. empty / never-written chain -> defined safe result, no crash', () => {
    // No appends at all; .ctoc/audit does not even exist yet.
    assert.equal(fs.existsSync(logPath), false, 'precondition: no log file written');

    const result = verifyChain(root);
    assert.equal(result.ok, true, 'an empty chain is vacuously valid, not an error');
    assert.equal(result.count, 0, 'empty chain has zero entries');

    const head = getChainHead(root);
    assert.equal(head.hash, GENESIS_HASH, 'absent head reads as genesis');
    assert.equal(head.sequence, 0, 'absent head reads as sequence 0');
  });

  // --- Contract 8: linkage incorporates the previous hash ------------------

  test('8. linkage: entry hash incorporates the previous chain hash', () => {
    const entries = appendN(2);

    // Direct linkage: entry-1 links to genesis; entry-2 links to entry-1.
    assert.equal(entries[0].previous_chain_hash, GENESIS_HASH,
      'first entry must link to genesis');
    assert.equal(entries[1].previous_chain_hash, entries[0].chain_hash,
      'second entry must link to first entry chain_hash');

    // Sensitivity proof: changing ONLY the previous_chain_hash changes the
    // recomputed chain_hash. This shows the prev-link is actually folded into
    // the hash (not an unchecked sidecar field).
    const body = {
      sequence: entries[1].sequence,
      timestamp: entries[1].timestamp,
      dispatch_id: entries[1].dispatch_id,
      entry_hash: entries[1].entry_hash,
      previous_chain_hash: entries[1].previous_chain_hash,
    };
    const asStored = canonicalHash(body);
    assert.equal(asStored, entries[1].chain_hash,
      'recompute of the stored body must reproduce the stored chain_hash');

    const tweaked = { ...body, previous_chain_hash: GENESIS_HASH };
    const asTweaked = canonicalHash(tweaked);
    assert.notEqual(asTweaked, entries[1].chain_hash,
      'changing the prev-link MUST change the chain_hash (link is folded into the digest)');
  });

  // --- Contract 9: malformed jsonl line ------------------------------------

  test('9. malformed jsonl line -> verify fails safe (no throw, no hang)', () => {
    appendN(2);
    const lines = readLogLines();

    // Replace a valid line with non-JSON garbage.
    lines[1] = '{ this is not valid json @@@';
    writeLogLines(lines);

    let result;
    assert.doesNotThrow(() => { result = verifyChain(root); },
      'malformed input must be handled, never thrown to the caller');
    assert.equal(result.ok, false, 'a malformed line MUST be reported as a verification failure');
    assert.equal(result.broken_at, 1, 'breakage must be reported at the malformed index');
    assert.match(String(result.reason), /malformed JSON/i, 'reason must identify the parse failure');
  });
});
