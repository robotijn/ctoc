/**
 * Crypto Library — dark-branch coverage tests
 *
 * Companion to tests/crypto.test.js. That suite pins the happy paths and the
 * common edge cases; this suite targets the branches it leaves dark (measured
 * uncovered lines 22-23, 32-38, 129-130, 147-148 in src/lib/crypto.js) plus a
 * known-answer HMAC vector that kills any constant-return / wrong-algorithm
 * mutant of signState.
 *
 * Every test here pins a SEMANTIC crypto contract and goes RED under mutation —
 * not "returns a hex string of length N". See the header comment on each block
 * for the exact production line it covers and the mutant it kills.
 *
 * Boundary discipline: the ONLY thing faked is the filesystem, and only at the
 * true boundary — src/lib/safe-fs.js, the audited fs choke point that crypto.js
 * calls through. The real ~/.ctoc/.secret is NEVER read, written, or deleted by
 * these tests (that is the user's live installation secret). Faking safe-fs is
 * what makes the getInstallationSecret regeneration paths reachable WITHOUT
 * touching it. hashFile's error path uses a real throwaway temp directory.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ctocCrypto = require('../src/lib/crypto.js');
const safeFs = require('../src/lib/safe-fs.js');

const SECRET_LENGTH = 64; // must mirror the module constant

/**
 * Run `fn` with the four fs methods crypto.js uses swapped for an in-memory
 * fake, restoring the real implementations afterwards even if `fn` throws.
 * This is a fake at the system boundary (fs), never a mock of crypto logic.
 */
function withFakeFs(fake, fn) {
  const patched = ['existsSync', 'readFileSync', 'writeFileSync', 'mkdirSync'];
  const saved = {};
  for (const key of patched) saved[key] = safeFs[key];
  Object.assign(safeFs, fake);
  try {
    return fn();
  } finally {
    Object.assign(safeFs, saved);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getInstallationSecret — home-directory creation (covers lines 21-23)
//
// Kills the mutant that deletes the `mkdirSync(CTOC_HOME, {recursive:true})`
// call: without it, a fresh install would have nowhere to write the secret.
// ─────────────────────────────────────────────────────────────────────────────

test('getInstallationSecret_creates_home_directory_recursively_when_absent', () => {
  // Arrange — nothing exists yet; record what mkdirSync is asked to create.
  const existing = new Set();
  let mkdirPath = null;
  let mkdirOptions = null;

  // Act
  const secret = withFakeFs(
    {
      existsSync: (p) => existing.has(p),
      mkdirSync: (p, opts) => {
        mkdirPath = p;
        mkdirOptions = opts;
        existing.add(p);
      },
      readFileSync: () => Buffer.alloc(SECRET_LENGTH), // unreached (secret file absent)
      writeFileSync: () => {},
    },
    () => ctocCrypto.getInstallationSecret()
  );

  // Assert — the home dir was created recursively before the secret was produced.
  assert.equal(mkdirPath, ctocCrypto.CTOC_HOME, 'CTOC_HOME should be the created path');
  assert.equal(mkdirOptions && mkdirOptions.recursive, true, 'mkdir must be recursive');
  assert.equal(secret.length, SECRET_LENGTH, 'a full-length secret should be produced');
});

// ─────────────────────────────────────────────────────────────────────────────
// getInstallationSecret — accept an existing, sufficiently-long secret
// (covers the `secret.length >= SECRET_LENGTH` TRUE branch + early return,
//  line 28-29). Kills a mutant that always regenerates (ignores disk), because
//  the returned bytes must equal the specific stored key and nothing is written.
// ─────────────────────────────────────────────────────────────────────────────

test('getInstallationSecret_returns_stored_secret_without_rewriting_when_at_least_64_bytes', () => {
  // Arrange — a distinctive 64-byte secret already on disk.
  const stored = Buffer.alloc(SECRET_LENGTH, 0x5a);
  let writeCalls = 0;

  // Act
  const secret = withFakeFs(
    {
      existsSync: () => true,
      readFileSync: () => stored,
      writeFileSync: () => { writeCalls += 1; },
      mkdirSync: () => {},
    },
    () => ctocCrypto.getInstallationSecret()
  );

  // Assert — returned the stored key verbatim and did NOT regenerate/rewrite it.
  assert.ok(secret.equals(stored), 'existing valid secret should be returned unchanged');
  assert.equal(writeCalls, 0, 'a valid existing secret must not be overwritten');
});

// ─────────────────────────────────────────────────────────────────────────────
// getInstallationSecret — regeneration paths (covers line 28 FALSE, the
// catch at 31-33, and the regenerate block 35-38).
//
// A too-short secret and an unreadable secret file must BOTH lead to a full,
// freshly-generated secret rather than returning the short one or throwing.
// Kills: `>=` → `<` (would return the short secret) and "remove try/catch"
// (would let the read error propagate).
// ─────────────────────────────────────────────────────────────────────────────

const REGEN_ROWS = [
  {
    id: 'short-secret-below-64-bytes',
    readFileSync: () => Buffer.alloc(SECRET_LENGTH - 1, 0x11), // 63 bytes < 64
  },
  {
    id: 'unreadable-secret-file-throws',
    readFileSync: () => { throw new Error('EACCES: simulated read failure'); },
  },
];

for (const row of REGEN_ROWS) {
  test(`getInstallationSecret_regenerates_full_length_secret_when_${row.id}`, () => {
    // Arrange — home + secret file "exist", but the stored secret is unusable.
    // Act
    const secret = withFakeFs(
      {
        existsSync: () => true,
        readFileSync: row.readFileSync,
        writeFileSync: () => {},
        mkdirSync: () => {},
      },
      () => ctocCrypto.getInstallationSecret()
    );

    // Assert — a full 64-byte secret is produced (not the short one, no throw).
    assert.equal(secret.length, SECRET_LENGTH, `row=${row.id} should regenerate to full length`);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// getInstallationSecret — regenerated secret is written owner-only (line 37).
//
// Security contract: the installation secret file is created with mode 0o600.
// Kills a mutant that drops the `{ mode: 0o600 }` option (world-readable secret).
// ─────────────────────────────────────────────────────────────────────────────

test('getInstallationSecret_writes_regenerated_secret_with_owner_only_permissions', () => {
  // Arrange — no secret on disk, capture the write options.
  let writtenOptions = null;
  let writtenData = null;

  // Act
  withFakeFs(
    {
      existsSync: (p) => p === ctocCrypto.CTOC_HOME, // home exists, secret file does not
      readFileSync: () => Buffer.alloc(SECRET_LENGTH),
      writeFileSync: (_p, data, opts) => { writtenData = data; writtenOptions = opts; },
      mkdirSync: () => {},
    },
    () => ctocCrypto.getInstallationSecret()
  );

  // Assert — persisted with restrictive permissions and full length.
  assert.equal(writtenOptions && writtenOptions.mode, 0o600, 'secret must be written mode 0o600');
  assert.equal(writtenData.length, SECRET_LENGTH, 'persisted secret should be 64 bytes');
});

// ─────────────────────────────────────────────────────────────────────────────
// signState — known-answer HMAC-SHA256 vector.
//
// With a FIXED key, HMAC-SHA256 over the canonical form of {a:1} is a fixed,
// externally-precomputed constant. Pinning it kills the strongest mutants:
//  - constant _signature return (avalanche: this exact 64-hex value proves the
//    signature actually depends on key+data),
//  - wrong digest algorithm ('sha256' → anything else),
//  - dropped/changed 'hmac-sha256:' prefix,
//  - broken canonicalization of the signed payload.
//
// The expected value is a literal computed offline via Node's crypto against
// the SAME key/data — an external constant, not a re-run of the module's own
// canonicalStringify+hmac at assert time.
// ─────────────────────────────────────────────────────────────────────────────

test('signState_produces_known_answer_hmac_sha256_for_fixed_key_and_payload', () => {
  // Arrange — force getInstallationSecret to yield a fixed 64-byte key (0x2a*64).
  const fixedKey = Buffer.alloc(SECRET_LENGTH, 0x2a);
  // HMAC-SHA256(key=0x2a*64, data='{"a":1}') — precomputed, external constant.
  const EXPECTED_SIGNATURE =
    'hmac-sha256:81ed02c6ce0d5be5aeb56b6ac46393d2fe67c2ed759c69c9b9b452a2ac73e59c';

  // Act
  const signed = withFakeFs(
    {
      existsSync: () => true,
      readFileSync: () => fixedKey,
      writeFileSync: () => {},
      mkdirSync: () => {},
    },
    () => ctocCrypto.signState({ a: 1 })
  );

  // Assert — exact known-answer match.
  assert.equal(signed._signature, EXPECTED_SIGNATURE);
});

// Guard: prove the known-answer literal is genuinely independent of the module
// (a hand-rolled HMAC via Node crypto — no call into crypto.js primitives),
// so a mutation to crypto.js cannot silently keep this vector "correct".
test('signState_known_answer_literal_is_derivable_from_raw_node_crypto', () => {
  // Arrange
  const fixedKey = Buffer.alloc(SECRET_LENGTH, 0x2a);
  const canonicalPayload = '{"a":1}'; // canonical form of {a:1}, written by hand

  // Act — independent HMAC, not routed through crypto.js.
  const independent =
    'hmac-sha256:' + crypto.createHmac('sha256', fixedKey).update(canonicalPayload).digest('hex');

  // Assert — matches the literal baked into the KAT test above.
  assert.equal(
    independent,
    'hmac-sha256:81ed02c6ce0d5be5aeb56b6ac46393d2fe67c2ed759c69c9b9b452a2ac73e59c'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// verifyState — signature with the correct prefix but the WRONG byte length
// (covers the timingSafeEqual catch at 128-130).
//
// crypto.timingSafeEqual throws RangeError when the two buffers differ in
// length. A signature like 'hmac-sha256:short' passes the prefix gate (line
// 105) yet is far shorter than the 76-char expected value, so the comparison
// throws. verifyState must catch it and fail CLOSED with the distinct
// 'Signature verification failed' message — never crash, never validate.
//
// Kills "remove try/catch" (would propagate the RangeError) and any mutant that
// returns valid:true on the error path. The distinct message separates this
// branch (129-130) from the plain mismatch branch (126).
// ─────────────────────────────────────────────────────────────────────────────

test('verifyState_fails_closed_when_signature_has_prefix_but_wrong_length', () => {
  // Arrange — well-formed prefix, but the signature is not 76 chars long.
  const state = { foo: 'bar', _signature: 'hmac-sha256:short' };

  // Act
  const result = ctocCrypto.verifyState(state);

  // Assert — rejected via the verification-failed path, not a thrown error.
  assert.equal(result.valid, false);
  assert.equal(result.error, 'Signature verification failed');
});

// ─────────────────────────────────────────────────────────────────────────────
// hashFile — path exists but cannot be read (covers the catch at 146-148).
//
// A directory passes existsSync but makes readFileSync throw EISDIR. hashFile
// must swallow it and return null, not propagate. Kills "remove try/catch" and
// any mutant that returns a hash / non-null on the error path. Uses a real,
// throwaway temp directory (cleaned in finally) — no faking needed.
// ─────────────────────────────────────────────────────────────────────────────

test('hashFile_returns_null_when_path_exists_but_is_an_unreadable_directory', () => {
  // Arrange — a real directory: existsSync true, readFileSync will throw EISDIR.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-crypto-cov-'));

  try {
    // Act
    const result = ctocCrypto.hashFile(dir);

    // Assert
    assert.equal(result, null, 'unreadable existing path must yield null, not throw');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
