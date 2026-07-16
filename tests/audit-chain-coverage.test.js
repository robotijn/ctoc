/**
 * Audit Chain — dark-branch coverage tests (companion to security-audit-chain.test.js)
 * ====================================================================================
 *
 * Target: src/lib/audit-chain.js
 *
 * The sibling suite `tests/security-audit-chain.test.js` already pins the
 * multi-entry tamper-detection paths of `verifyChain` (modify / delete / insert /
 * reorder / head-corruption / malformed-JSON) plus the happy path and the
 * genesis/empty boundary. This suite deliberately does NOT re-test any of those.
 *
 * It targets the branches that suite leaves dark — each one load-bearing to the
 * integrity guarantee, each written to go RED under mutation of the production line:
 *
 *   - verifyDispatch(...)                    single-file tamper evidence (lines 187-201)
 *   - stableStringify array branch           order-significant array hashing (lines 51-52)
 *   - canonicalHash null-value handling      the `obj === null` primitive branch (line 50)
 *   - appendDispatch missing-dispatch_id     the guard throw (lines 88-90)
 *   - appendDispatch timestamp fallback      the `|| new Date().toISOString()` (line 98)
 *   - getChainHead ternary fallbacks         present-but-unparseable head (lines 72-74)
 *   - verifyChain head/log reconciliation   wiped/truncated log vs non-genesis head (line 171)
 *
 * Hermetic: each test creates its own mkdtemp root, realpath-resolved for the
 * macOS /var -> /private/var symlink, and removes it in `finally`. Cross-platform:
 * path.join / os.tmpdir / node:fs only. Loads the REAL module — no mocking of core
 * logic; the only boundary faked is the filesystem, and that with real temp files.
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { test, describe } = require('node:test');

const REPO = path.resolve(__dirname, '..');
const auditChain = require(path.join(REPO, 'src', 'lib', 'audit-chain.js'));

const {
  GENESIS_HASH,
  canonicalHash,
  getChainHead,
  appendDispatch,
  verifyChain,
  verifyDispatch,
} = auditChain;

const LOG_REL = path.join('.ctoc', 'audit', 'chain.jsonl');
const HEAD_REL = path.join('.ctoc', 'audit', 'chain-head.yaml');
const AUDIT_DIR_REL = path.join('.ctoc', 'audit');

/** Make a hermetic, symlink-collapsed temp project root. */
function makeRoot() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-audit-cov-')));
}

describe('audit-chain: verifyDispatch single-file tamper evidence', () => {
  // Cluster A — verifyDispatch is entirely dark in the sibling suite (lines 187-201).
  // verifyDispatch hashes the RAW FILE TEXT with sha256 (NOT canonicalHash) and
  // compares against a caller-supplied expected hash. It is the per-file integrity
  // check: a genuine file verifies, a single altered byte is caught, a missing file
  // reports its own reason. Each assertion below reds a mutant on that comparison.

  test('should_return_ok_true_when_dispatch_file_matches_its_recorded_hash', () => {
    // Arrange
    const root = makeRoot();
    try {
      const dispatchPath = path.join(root, 'dispatch-original.yaml');
      const content = 'dispatch_id: d-1\ntimestamp: 2026-06-15T00:00:01.000Z\naction: dispatch\n';
      fs.writeFileSync(dispatchPath, content);
      const expected = crypto.createHash('sha256').update(content).digest('hex');

      // Act
      const result = verifyDispatch(root, dispatchPath, expected);

      // Assert — genuine file verifies, and the returned digest IS the file digest.
      assert.equal(result.ok, true, 'an untouched dispatch file must verify ok');
      assert.equal(result.actual, expected, 'actual digest must equal the on-disk file digest');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('should_return_ok_false_when_a_single_byte_of_the_dispatch_file_is_altered', () => {
    // Arrange — the load-bearing tamper case: hash was recorded, then the file changed.
    const root = makeRoot();
    try {
      const dispatchPath = path.join(root, 'dispatch-tampered.yaml');
      const original = 'dispatch_id: d-1\naction: dispatch\namount: 100\n';
      const expected = crypto.createHash('sha256').update(original).digest('hex');
      // Attacker edits one meaningful value on disk AFTER the hash was recorded.
      fs.writeFileSync(dispatchPath, original.replace('amount: 100', 'amount: 999'));

      // Act
      const result = verifyDispatch(root, dispatchPath, expected);

      // Assert — a post-hoc edit MUST be detected; the digest must not match.
      assert.equal(result.ok, false, 'a tampered dispatch file MUST fail verification');
      assert.notEqual(result.actual, expected, 'tampered content must produce a different digest');
      assert.equal(result.expected, expected, 'the expected hash must be echoed back unchanged');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('should_return_ok_false_with_missing_reason_when_dispatch_file_is_absent', () => {
    // Arrange — the guard on line 188-189: no file at the path at all.
    const root = makeRoot();
    try {
      const missingPath = path.join(root, 'does-not-exist.yaml');
      const anyHash = 'a'.repeat(64);

      // Act
      const result = verifyDispatch(root, missingPath, anyHash);

      // Assert — a deleted/absent evidence file is a failure with a distinct reason,
      // never a silent ok and never a throw.
      assert.equal(result.ok, false, 'an absent dispatch file must not verify');
      assert.equal(result.reason, 'dispatch file missing', 'must report the missing-file reason');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('audit-chain: canonicalHash / stableStringify structural branches', () => {
  // Cluster B — the array branch (lines 51-52) and the null primitive branch (line 50)
  // are never reached by the sibling suite (its dispatches carry only scalar/object
  // fields). These pin the canonical-serialization contract the whole chain rests on:
  // object keys are ORDER-INSENSITIVE (sorted), array elements are ORDER-SENSITIVE.

  test('should_produce_identical_hash_when_object_keys_are_reordered', () => {
    // Arrange — same object, different key insertion order.
    const a = { alpha: 1, beta: 2, gamma: 3 };
    const b = { gamma: 3, alpha: 1, beta: 2 };

    // Act
    const ha = canonicalHash(a);
    const hb = canonicalHash(b);

    // Assert — key sorting makes these canonically identical. A mutant dropping the
    // `.sort()` on Object.keys would let insertion order leak into the digest -> red.
    assert.equal(ha, hb, 'reordering object keys must not change the canonical hash');
  });

  test('should_produce_different_hash_when_array_element_order_changes', () => {
    // Arrange — the array branch: order is data, not incidental.
    const forward = { events: ['login', 'edit', 'logout'] };
    const reversed = { events: ['logout', 'edit', 'login'] };

    // Act
    const hForward = canonicalHash(forward);
    const hReversed = canonicalHash(reversed);

    // Assert — arrays must NOT be sorted; reordering elements is a real content change.
    // A mutant that sorts array members, or that falls through to the object branch,
    // would collapse these to one hash -> red. Guarantees an attacker cannot permute
    // a list of audited actions without changing the digest.
    assert.notEqual(hForward, hReversed,
      'array element order MUST be significant in the canonical hash');
  });

  test('should_hash_array_elementwise_matching_a_hand_computed_canonical_form', () => {
    // Arrange — pin the EXACT array serialization shape, not just "different".
    // canonical form of {tags:["a","b"]} is {"tags":["a","b"]} with JSON-quoted scalars.
    const obj = { tags: ['a', 'b'] };
    const expected = crypto
      .createHash('sha256')
      .update('{"tags":["a","b"]}')
      .digest('hex');

    // Act
    const actual = canonicalHash(obj);

    // Assert — reproduces the array-branch output byte-for-byte. A mutant changing the
    // array join separator or the bracket delimiters would diverge -> red.
    assert.equal(actual, expected, 'array must serialize as [elem,elem] with quoted scalars');
  });

  test('should_distinguish_a_null_field_from_the_string_null', () => {
    // Arrange — the `obj === null` arm of the primitive branch (line 50).
    const withNull = { v: null };
    const withStringNull = { v: 'null' };

    // Act
    const hNull = canonicalHash(withNull);
    const hStr = canonicalHash(withStringNull);

    // Assert — null serializes as bare `null`, the string as `"null"`; they must differ.
    // Reproduce the null arm exactly to prove it is taken, not coerced to "{}" or "".
    const expectedNull = crypto.createHash('sha256').update('{"v":null}').digest('hex');
    assert.equal(hNull, expectedNull, 'a null field must serialize as bare null');
    assert.notEqual(hNull, hStr, 'null and the string "null" must not collide');
  });
});

describe('audit-chain: appendDispatch guard and timestamp fallback', () => {
  // Cluster C — the missing-dispatch_id throw (lines 88-90) and the timestamp
  // `|| new Date().toISOString()` fallback (line 98) are both dark in the sibling
  // suite, which always supplies both fields.

  test('should_throw_when_dispatch_has_no_dispatch_id', () => {
    // Arrange — a dispatch record missing the mandatory identity field.
    const root = makeRoot();
    try {
      const bad = { timestamp: '2026-06-15T00:00:01.000Z', action: 'dispatch' };

      // Act + Assert — the guard must reject it loudly BEFORE any file is written,
      // and it must name dispatch_id. A mutant deleting the guard would instead write
      // an identity-less entry to the chain -> this red catches it.
      assert.throws(
        () => appendDispatch(root, bad),
        /dispatch must include dispatch_id/,
        'appendDispatch must throw a dispatch_id error for an id-less record',
      );
      // And nothing must have been persisted by the rejected call.
      assert.equal(fs.existsSync(path.join(root, LOG_REL)), false,
        'a rejected dispatch must not append a chain-log line');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('should_synthesize_an_iso_timestamp_when_the_dispatch_omits_one', () => {
    // Arrange — dispatch_id present, timestamp absent -> the `||` second operand fires.
    const root = makeRoot();
    try {
      const before = Date.now();

      // Act
      const entry = appendDispatch(root, { dispatch_id: 'no-ts-1', action: 'dispatch' });
      const after = Date.now();

      // Assert — the entry carries a real generated ISO-8601 timestamp (not undefined,
      // not empty). A mutant dropping the `|| new Date().toISOString()` fallback yields
      // `undefined` here -> both assertions red.
      assert.match(entry.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
        'omitted timestamp must be replaced by a generated ISO-8601 string');
      const parsed = Date.parse(entry.timestamp);
      assert.ok(parsed >= before && parsed <= after,
        'the synthesized timestamp must fall within the append window');

      // The synthesized value must also be the value the head records and the chain
      // verifies against — i.e. the fallback participates in the persisted hash.
      const head = getChainHead(root);
      assert.equal(head.updated_at, entry.timestamp, 'head updated_at must be the synthesized timestamp');
      assert.equal(verifyChain(root).ok, true, 'a fallback-timestamped entry must still verify');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('audit-chain: getChainHead fallbacks on a present-but-unparseable head', () => {
  // Cluster D — the sibling suite only exercises a well-formed head (all three regexes
  // match) and the absent-head branch. The FALSE arms of the three ternaries
  // (lines 72-74) — head file present but a line missing — are dark. A mutant that
  // removed a fallback would index `null[1]` and throw; these tests assert the safe
  // genesis-ish defaults instead.

  test('should_default_to_genesis_when_head_file_has_no_recognizable_lines', () => {
    // Arrange — a head file that exists but matches none of hash/sequence/updated_at.
    const root = makeRoot();
    try {
      fs.mkdirSync(path.join(root, AUDIT_DIR_REL), { recursive: true });
      fs.writeFileSync(path.join(root, HEAD_REL), 'garbage: not-a-chain-head\nnonsense\n');

      // Act
      const head = getChainHead(root);

      // Assert — all three ternary FALSE arms taken at once, no throw.
      assert.equal(head.hash, GENESIS_HASH, 'absent hash line must fall back to genesis');
      assert.equal(head.sequence, 0, 'absent sequence line must fall back to 0');
      assert.equal(head.updated_at, null, 'absent updated_at line must fall back to null');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('should_parse_present_hash_but_default_sequence_and_timestamp_when_those_lines_are_absent', () => {
    // Arrange — a partial head: hash line present, sequence and updated_at absent.
    // This pins the hashMatch TRUE arm together with the seqMatch/tsMatch FALSE arms,
    // proving each ternary is evaluated independently.
    const root = makeRoot();
    try {
      const realHash = 'b'.repeat(64);
      fs.mkdirSync(path.join(root, AUDIT_DIR_REL), { recursive: true });
      fs.writeFileSync(path.join(root, HEAD_REL), `hash: ${realHash}\n`);

      // Act
      const head = getChainHead(root);

      // Assert
      assert.equal(head.hash, realHash, 'a present hash line must be parsed, not defaulted');
      assert.equal(head.sequence, 0, 'a missing sequence line must default to 0');
      assert.equal(head.updated_at, null, 'a missing updated_at line must default to null');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('audit-chain: verifyChain reconciles the durable head against the walked log', () => {
  // Cluster E — line 171 head/log reconciliation. The chain head lives in a SEPARATE
  // durable file (.ctoc/audit/chain-head.yaml) from the walked log (.ctoc/audit/chain.jsonl).
  // A non-genesis head PROVES entries once existed. The pre-fix guard read
  // `head.hash !== previousChainHash && count > 0`, which DISABLED the reconciliation
  // exactly when the walked log was empty — so an attacker who truncates/erases
  // chain.jsonl (count -> 0, walked hash -> GENESIS) left a non-genesis head behind and
  // verifyChain still returned ok:true: full audit-trail erasure passed undetected.
  // These tests pin the fixed contract: reconcile INDEPENDENT of count, and additionally
  // cross-check head.sequence against the walked length (safe because the log is strictly
  // append-only — no rotation/prune/truncate exists in this module or in the only other
  // reader, src/scripts/evidence-pack.js).

  test('should_flag_a_present_but_empty_log_when_the_head_records_a_non_genesis_hash', () => {
    // Arrange — an existing (whitespace-only) log with no parseable entries, plus a
    // head that records a non-genesis hash and sequence. count walks to 0;
    // previousChainHash stays at GENESIS; the durable head still proves entries existed.
    const root = makeRoot();
    try {
      fs.mkdirSync(path.join(root, AUDIT_DIR_REL), { recursive: true });
      fs.writeFileSync(path.join(root, LOG_REL), '\n\n');
      fs.writeFileSync(path.join(root, HEAD_REL), `hash: ${'c'.repeat(64)}\nsequence: 5\nupdated_at: 2026-06-15T00:00:05.000Z\n`);

      // Act
      const result = verifyChain(root);

      // Assert — a non-genesis head over an empty walked log is a WIPE, not a fresh
      // project: it MUST fail the head/log reconciliation. (Pre-fix code returned
      // ok:true here — the exact forgery this module exists to catch.)
      assert.equal(result.ok, false, 'a non-genesis head over an empty log MUST be flagged as tamper');
      assert.equal(result.reason, 'chain head does not match last log entry',
        'must fail specifically on the head/log mismatch');
      assert.equal(result.stored, 'c'.repeat(64), 'must echo the stored (head) hash');
      assert.equal(result.expected, GENESIS_HASH, 'walked-empty log terminates at genesis');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('should_verify_ok_for_a_genuinely_fresh_project_empty_log_and_genesis_head', () => {
    // Arrange — the legitimate empty state that MUST still pass: a present but empty log
    // and NO head file (getChainHead reads genesis). This is a never-initialized chain,
    // not an erased one, so reconciliation is correctly skipped at genesis.
    const root = makeRoot();
    try {
      fs.mkdirSync(path.join(root, AUDIT_DIR_REL), { recursive: true });
      fs.writeFileSync(path.join(root, LOG_REL), '\n\n');
      // deliberately no HEAD_REL file

      // Act
      const result = verifyChain(root);

      // Assert — genesis head + empty log is vacuously valid.
      assert.equal(result.ok, true, 'a genuinely fresh chain (genesis head, empty log) must verify ok');
      assert.equal(result.count, 0, 'no parseable entries means a count of zero');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('should_flag_a_truncated_log_that_erases_every_entry_but_leaves_a_non_genesis_head', () => {
    // Arrange — the executed security repro: append 3 real dispatches (head advances to a
    // non-genesis hash, sequence 3), then wipe chain.jsonl to "" as an attacker erasing
    // the audit trail. The durable head still records sequence:3 and the real hash.
    const root = makeRoot();
    try {
      appendDispatch(root, { dispatch_id: 'e-1', timestamp: '2026-06-15T00:00:01.000Z' });
      appendDispatch(root, { dispatch_id: 'e-2', timestamp: '2026-06-15T00:00:02.000Z' });
      appendDispatch(root, { dispatch_id: 'e-3', timestamp: '2026-06-15T00:00:03.000Z' });
      assert.equal(verifyChain(root).ok, true, 'precondition: the intact 3-entry chain verifies');
      assert.notEqual(getChainHead(root).hash, GENESIS_HASH, 'precondition: head moved off genesis');

      // Attacker truncates the append-only log to nothing.
      fs.writeFileSync(path.join(root, LOG_REL), '');

      // Act
      const result = verifyChain(root);

      // Assert — full erasure MUST be detected (pre-fix returned ok:true, count:0).
      assert.equal(result.ok, false, 'erasing every log entry MUST be detected via the durable head');
      assert.equal(result.reason, 'chain head does not match last log entry',
        'must fail on the head/log reconciliation');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('should_flag_a_reset_head_that_tries_to_hide_an_intact_log', () => {
    // Arrange — the OTHER erasure direction the sequence cross-check exists to catch:
    // keep an intact 3-entry log but RESET the head to genesis/sequence 0 (an attacker
    // pretending the chain was never started). The hash reconciliation skips at genesis;
    // the sequence cross-check (head.sequence 0 != walked length 3) catches it. This is
    // only sound because the log is strictly append-only — verified: no rotation/prune.
    const root = makeRoot();
    try {
      appendDispatch(root, { dispatch_id: 'e-1', timestamp: '2026-06-15T00:00:01.000Z' });
      appendDispatch(root, { dispatch_id: 'e-2', timestamp: '2026-06-15T00:00:02.000Z' });
      appendDispatch(root, { dispatch_id: 'e-3', timestamp: '2026-06-15T00:00:03.000Z' });

      // Attacker resets the head to a never-started state while the log survives intact.
      fs.writeFileSync(path.join(root, HEAD_REL),
        `hash: ${GENESIS_HASH}\nsequence: 0\nupdated_at: 2026-06-15T00:00:00.000Z\n`);

      // Act
      const result = verifyChain(root);

      // Assert — a genesis head over a non-empty walked log is inconsistent and MUST fail.
      assert.equal(result.ok, false, 'a reset head over an intact log MUST be detected');
      assert.equal(result.reason, 'chain head sequence does not match log length',
        'must fail on the head-sequence cross-check');
      assert.equal(result.expected, 3, 'expected must be the walked log length');
      assert.equal(result.stored, 0, 'stored must be the reset head sequence');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('should_flag_a_stale_head_hash_over_a_non_empty_chain', () => {
    // Arrange — the original non-empty head-mismatch case, retained: with ONE genuine
    // entry, corrupting the head hash to a non-matching value MUST be caught by the
    // hash reconciliation (independent of the now-removed count guard).
    const root = makeRoot();
    try {
      appendDispatch(root, { dispatch_id: 'e-1', timestamp: '2026-06-15T00:00:01.000Z' });
      const headPath = path.join(root, HEAD_REL);
      const corrupted = fs.readFileSync(headPath, 'utf8').replace(/^hash:\s+\S+$/m, `hash: ${'d'.repeat(64)}`);
      fs.writeFileSync(headPath, corrupted);

      // Act
      const result = verifyChain(root);

      // Assert — the non-genesis stale head disagrees with the walked terminal hash.
      assert.equal(result.ok, false, 'a stale head over a non-empty chain MUST be detected');
      assert.equal(result.reason, 'chain head does not match last log entry',
        'must fail specifically on the head/log mismatch');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
