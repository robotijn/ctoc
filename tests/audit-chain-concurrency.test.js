/**
 * Audit Chain — concurrency & crash-atomicity tests
 * =================================================
 *
 * Target: src/lib/audit-chain.js — `appendDispatch`.
 *
 * The sibling suites (security-audit-chain.test.js, audit-chain-coverage.test.js)
 * pin tamper-evidence and branch coverage of a QUIESCENT chain. This suite pins the
 * property those suites cannot see: appendDispatch is called from PARALLEL subagent
 * dispatches (per DISPATCH_PROTOCOL), so its read-head -> append -> write-head
 * critical section must be:
 *
 *   (a) SERIALIZED under an exclusive lock, so two appends cannot both observe the
 *       same head and each claim the same sequence / previous_chain_hash (which would
 *       leave verifyChain permanently broken from a benign race), and
 *   (b) CRASH-SAFE, so a death between the log append and the head write self-heals on
 *       the next append (the head is derived from the authoritative append-only log
 *       tail, not from a possibly-stale head file), and
 *   (c) FAIL-SAFE, so if the lock cannot be acquired it THROWS rather than appending
 *       unlocked and corrupting the chain.
 *
 * The interleave is reproduced DETERMINISTICALLY (no real threads, no flake): the exact
 * on-disk state a second, concurrent-or-post-crash writer would observe is injected
 * between two real appendDispatch calls. Against the pre-fix code (which trusts the
 * separate head file and holds no lock) these go RED; against the fix they go GREEN.
 *
 * Hermetic: each test uses its own realpath-resolved mkdtemp root, removed in finally.
 * Cross-platform: node:path / node:os / node:fs only.
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { test, describe } = require('node:test');

const REPO = path.resolve(__dirname, '..');
const auditChain = require(path.join(REPO, 'src', 'lib', 'audit-chain.js'));

const { getChainHead, appendDispatch, verifyChain } = auditChain;

const LOG_REL = path.join('.ctoc', 'audit', 'chain.jsonl');
const HEAD_REL = path.join('.ctoc', 'audit', 'chain-head.yaml');
const LOCK_REL = path.join('.ctoc', 'audit', 'chain.lock');

/** Hermetic, symlink-collapsed temp project root (macOS /var -> /private/var). */
function makeRoot() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-audit-conc-')));
}

/** Count non-empty log lines (== entry count). */
function logCount(root) {
  const p = path.join(root, LOG_REL);
  if (!fs.existsSync(p)) return 0;
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).length;
}

describe('audit-chain: appendDispatch serializes the read-head -> append -> write-head window', () => {
  test('should_produce_a_verifiable_chain_when_a_second_append_observed_the_pre_first_head', () => {
    // Arrange — reproduce two CONCURRENT appends where the second read the head BEFORE
    // the first committed. In a real race both dispatches snapshot head={genesis}; the
    // first commits (log=[A], head=A); the second, trusting its stale genesis snapshot,
    // chains B onto genesis instead of A. We inject exactly that: append A normally, then
    // restore the pre-A head observation (delete the head file -> getChainHead == genesis),
    // then append B. A correct appendDispatch must chain B onto the LOG TAIL (A), not onto
    // whatever the head file claims.
    const root = makeRoot();
    try {
      appendDispatch(root, { dispatch_id: 'A', timestamp: '2026-06-15T00:00:01.000Z' });
      // The second concurrent writer's observation: head as it was BEFORE A committed.
      fs.rmSync(path.join(root, HEAD_REL), { force: true });

      // Act — the "second concurrent" append.
      appendDispatch(root, { dispatch_id: 'B', timestamp: '2026-06-15T00:00:02.000Z' });

      // Assert — the chain must be intact. Against the pre-fix code B chains onto genesis
      // (previous_chain_hash mismatch) and this is ok:false. The fix reads the log tail.
      const result = verifyChain(root);
      assert.equal(result.ok, true,
        `a serialized/log-tail-derived append must chain onto its predecessor; got ${JSON.stringify(result)}`);
      assert.equal(result.count, 2, 'both entries must be present and linked');
      assert.equal(getChainHead(root).sequence, 2, 'head must reflect both entries');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('should_throw_and_append_nothing_when_the_exclusive_lock_cannot_be_acquired', () => {
    // Arrange — a live lock held by "another process". A correct appendDispatch must
    // FAIL SAFE: throw after its bounded retries rather than append unlocked (which would
    // corrupt the tamper-evident chain). Pre-fix code has no lock -> it appends anyway.
    const root = makeRoot();
    try {
      appendDispatch(root, { dispatch_id: 'A', timestamp: '2026-06-15T00:00:01.000Z' });
      const before = logCount(root);
      // Hold a FRESH (non-stale) lock.
      fs.mkdirSync(path.join(root, '.ctoc', 'audit'), { recursive: true });
      fs.writeFileSync(path.join(root, LOCK_REL),
        JSON.stringify({ pid: 999999, acquired_at: Date.now() }));

      // Act + Assert — bounded, fast retries then a loud throw; nothing appended.
      assert.throws(
        () => appendDispatch(root, { dispatch_id: 'B', timestamp: '2026-06-15T00:00:02.000Z' },
          { lockRetries: 2, lockBackoffMs: 1, lockStaleMs: 3600000 }),
        /lock/i,
        'a held lock must make appendDispatch throw, never append unlocked');
      assert.equal(logCount(root), before,
        'a lock-blocked append must not have written a chain-log line');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('should_reclaim_a_stale_lock_then_append_and_leave_no_lock_behind', () => {
    // Arrange — a leftover lock from a crashed writer (old mtime). appendDispatch must
    // reclaim it, append, and clean up. Pre-fix code appends but NEVER removes the lock
    // file -> the leftover-lock assertion reds it.
    const root = makeRoot();
    try {
      fs.mkdirSync(path.join(root, '.ctoc', 'audit'), { recursive: true });
      const lockPath = path.join(root, LOCK_REL);
      fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999, acquired_at: 0 }));
      const anHourAgo = Date.now() / 1000 - 3600;
      fs.utimesSync(lockPath, anHourAgo, anHourAgo); // make it stale

      // Act
      appendDispatch(root, { dispatch_id: 'A', timestamp: '2026-06-15T00:00:01.000Z' },
        { lockBackoffMs: 1 });

      // Assert
      assert.equal(verifyChain(root).ok, true, 'the appended entry must verify');
      assert.equal(logCount(root), 1, 'exactly one entry must have been appended');
      assert.equal(fs.existsSync(lockPath), false,
        'the (reclaimed) lock file must be released, not left behind');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('should_leave_no_lock_file_after_a_normal_append', () => {
    // Arrange
    const root = makeRoot();
    try {
      // Act
      appendDispatch(root, { dispatch_id: 'A', timestamp: '2026-06-15T00:00:01.000Z' });

      // Assert — the lock is always released (finally), so no lock file survives.
      assert.equal(fs.existsSync(path.join(root, LOCK_REL)), false,
        'appendDispatch must release its lock on the normal path');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('audit-chain: appendDispatch is crash-safe across the append/head-write pair', () => {
  test('should_self_heal_when_a_prior_head_write_was_lost_after_the_log_append', () => {
    // Arrange — simulate a crash BETWEEN appendFileSync (log) and writeFileSync (head):
    // the log carries the new entry, but the head file still shows the PRIOR state. We
    // reproduce it by appending A, B, C normally, then rewinding the head file to B's
    // recorded content (as if C's head-write never landed). The chain is now internally
    // inconsistent (head.sequence 2 != log length 3), which verifyChain must flag.
    const root = makeRoot();
    try {
      appendDispatch(root, { dispatch_id: 'A', timestamp: '2026-06-15T00:00:01.000Z' });
      appendDispatch(root, { dispatch_id: 'B', timestamp: '2026-06-15T00:00:02.000Z' });
      const headAfterB = fs.readFileSync(path.join(root, HEAD_REL), 'utf8');
      appendDispatch(root, { dispatch_id: 'C', timestamp: '2026-06-15T00:00:03.000Z' });
      // Crash: C's head-write is lost; the head reverts to the B snapshot.
      fs.writeFileSync(path.join(root, HEAD_REL), headAfterB);
      assert.equal(verifyChain(root).ok, false,
        'precondition: a lost head-write must leave the chain unverifiable');

      // Act — the next append must reconcile the head from the authoritative log tail.
      appendDispatch(root, { dispatch_id: 'D', timestamp: '2026-06-15T00:00:04.000Z' });

      // Assert — self-healed: D chains onto C, and the head now matches a 4-entry log.
      const result = verifyChain(root);
      assert.equal(result.ok, true,
        `a re-append after a lost head-write must restore a verifiable chain; got ${JSON.stringify(result)}`);
      assert.equal(result.count, 4, 'all four entries must be present and linked');
      const head = getChainHead(root);
      assert.equal(head.sequence, 4, 'the reconciled head must count every log entry');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('should_self_heal_from_a_single_entry_when_the_head_was_rewound_to_genesis', () => {
    // Arrange — the minimal crash: one entry in the log, head rewound to genesis.
    const root = makeRoot();
    try {
      appendDispatch(root, { dispatch_id: 'A', timestamp: '2026-06-15T00:00:01.000Z' });
      fs.rmSync(path.join(root, HEAD_REL), { force: true }); // head-write lost -> genesis
      assert.equal(verifyChain(root).ok, false,
        'precondition: log of 1 with a genesis head is inconsistent');

      // Act
      appendDispatch(root, { dispatch_id: 'B', timestamp: '2026-06-15T00:00:02.000Z' });

      // Assert
      assert.equal(verifyChain(root).ok, true, 'the re-append must reconcile against the log tail');
      assert.equal(getChainHead(root).sequence, 2, 'head must reflect both entries after reconcile');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('audit-chain: appendDispatch tolerates and self-heals a crash-truncated trailing log line', () => {
  // A crash DURING appendFileSync leaves a truncated, unterminated JSON line at the tail of
  // chain.jsonl — the exact crash window the log-tail head derivation was supposed to make
  // self-healing. The prior fix's `JSON.parse(lines[last])` throws on that partial line, and
  // the throw propagates out of EVERY subsequent appendDispatch: the chain is bricked until a
  // human hand-edits the log. These tests pin the self-heal: skip the trailing partial, chain
  // onto the last WELL-FORMED entry, and remove the artifact so it does not accumulate.
  const PARTIAL = '{"sequence":2,"dispatch_id":"d2","chain_ha';

  test('should_not_throw_and_should_verify_when_a_partial_line_follows_a_valid_entry', () => {
    // Arrange — one valid entry, then a crash-truncated trailing line (no newline).
    const root = makeRoot();
    try {
      appendDispatch(root, { dispatch_id: 'd1', timestamp: '2026-06-15T00:00:01.000Z' });
      const logPath = path.join(root, LOG_REL);
      fs.appendFileSync(logPath, PARTIAL); // crash mid-appendFileSync: unterminated JSON tail
      assert.equal(verifyChain(root).ok, false,
        'precondition: an unterminated trailing line is malformed JSON');

      // Act — the next append must NOT throw on the truncated tail. Against today's code it
      // throws "Unterminated string in JSON" here, and would keep throwing forever.
      assert.doesNotThrow(
        () => appendDispatch(root, { dispatch_id: 'd3', timestamp: '2026-06-15T00:00:03.000Z' }),
        'a crash-truncated trailing line must not brick appendDispatch');

      // Assert — the chain is verifiable again after the re-append.
      const result = verifyChain(root);
      assert.equal(result.ok, true,
        `a re-append after a partial-line crash must restore a verifiable chain; got ${JSON.stringify(result)}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('should_remove_the_partial_line_from_the_log_after_a_successful_reappend', () => {
    // Arrange
    const root = makeRoot();
    try {
      appendDispatch(root, { dispatch_id: 'd1', timestamp: '2026-06-15T00:00:01.000Z' });
      const logPath = path.join(root, LOG_REL);
      fs.appendFileSync(logPath, PARTIAL);

      // Act
      appendDispatch(root, { dispatch_id: 'd3', timestamp: '2026-06-15T00:00:03.000Z' });

      // Assert — the crash artifact is healed out; only the two well-formed entries remain.
      const raw = fs.readFileSync(logPath, 'utf8');
      assert.ok(!raw.includes(PARTIAL),
        'the crash-truncated partial line must be healed out of the log, not accumulated');
      assert.equal(logCount(root), 2, 'log must contain exactly the two valid entries d1, d3');
      assert.equal(getChainHead(root).sequence, 2,
        'head sequence must reflect the two valid entries after self-heal');
      assert.equal(verifyChain(root).ok, true, 'the healed chain must verify');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('should_treat_an_all_malformed_log_as_genesis_for_the_next_append', () => {
    // Not a trailing-partial-after-valid case: the WHOLE log is unparseable. The next append
    // must still make forward progress (genesis-based) rather than throw forever.
    const root = makeRoot();
    try {
      fs.mkdirSync(path.join(root, '.ctoc', 'audit'), { recursive: true });
      fs.writeFileSync(path.join(root, LOG_REL), '{"garbage": ');

      assert.doesNotThrow(
        () => appendDispatch(root, { dispatch_id: 'g1', timestamp: '2026-06-15T00:00:01.000Z' }),
        'an all-malformed log must not brick appendDispatch');
      const result = verifyChain(root);
      assert.equal(result.ok, true,
        `after healing an all-malformed log the fresh entry must verify; got ${JSON.stringify(result)}`);
      assert.equal(result.count, 1, 'the single new entry must be the only entry');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('audit-chain: regression — sequential integrity and tamper-evidence intact', () => {
  test('should_verify_a_purely_sequential_chain_with_strictly_increasing_sequences', () => {
    const root = makeRoot();
    try {
      const entries = [];
      for (let i = 1; i <= 5; i++) {
        entries.push(appendDispatch(root, { dispatch_id: `s-${i}`, timestamp: `2026-06-15T00:00:0${i}.000Z` }));
      }
      const result = verifyChain(root);
      assert.equal(result.ok, true, 'a sequential chain must verify ok');
      assert.equal(result.count, 5, 'every entry must be counted');
      entries.forEach((e, idx) => assert.equal(e.sequence, idx + 1, 'sequences must be 1..N'));
      assert.equal(getChainHead(root).sequence, 5, 'head sequence must equal N');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('should_still_detect_a_genuinely_tampered_middle_entry_after_the_atomicity_fix', () => {
    // The fix must NOT weaken verifyChain: a post-hoc edit to a hashed field is still caught.
    const root = makeRoot();
    try {
      appendDispatch(root, { dispatch_id: 't-1', timestamp: '2026-06-15T00:00:01.000Z' });
      appendDispatch(root, { dispatch_id: 't-2', timestamp: '2026-06-15T00:00:02.000Z' });
      appendDispatch(root, { dispatch_id: 't-3', timestamp: '2026-06-15T00:00:03.000Z' });

      const logPath = path.join(root, LOG_REL);
      const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
      const mid = JSON.parse(lines[1]);
      mid.dispatch_id = 'FORGED'; // part of the hashed body
      lines[1] = JSON.stringify(mid);
      fs.writeFileSync(logPath, lines.join('\n') + '\n');

      const result = verifyChain(root);
      assert.equal(result.ok, false, 'a tampered hashed field MUST still be detected');
      assert.equal(result.broken_at, 1, 'breakage must surface at the tampered index');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
