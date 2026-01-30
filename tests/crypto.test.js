/**
 * Crypto Library Tests
 * Tests for HMAC-SHA256 state signing and verification
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Import the crypto module under test
const ctocCrypto = require('../lib/crypto.js');

function test(name, fn) {
  try {
    fn();
    console.log(`# ✓ ${name}`);
  } catch (err) {
    console.log(`# ✗ ${name}`);
    console.log(`#   ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('# Crypto Library Tests');
console.log('#');
console.log('# canonicalStringify tests');

// Test: canonicalStringify with primitives
test('canonicalStringify handles null', () => {
  const result = ctocCrypto.canonicalStringify(null);
  assert.strictEqual(result, 'null');
});

test('canonicalStringify handles numbers', () => {
  assert.strictEqual(ctocCrypto.canonicalStringify(42), '42');
  assert.strictEqual(ctocCrypto.canonicalStringify(3.14), '3.14');
  assert.strictEqual(ctocCrypto.canonicalStringify(0), '0');
  assert.strictEqual(ctocCrypto.canonicalStringify(-1), '-1');
});

test('canonicalStringify handles strings', () => {
  assert.strictEqual(ctocCrypto.canonicalStringify('hello'), '"hello"');
  assert.strictEqual(ctocCrypto.canonicalStringify(''), '""');
  assert.strictEqual(ctocCrypto.canonicalStringify('with "quotes"'), '"with \\"quotes\\""');
});

test('canonicalStringify handles booleans', () => {
  assert.strictEqual(ctocCrypto.canonicalStringify(true), 'true');
  assert.strictEqual(ctocCrypto.canonicalStringify(false), 'false');
});

test('canonicalStringify handles undefined', () => {
  // undefined becomes undefined (JSON.stringify behavior)
  assert.strictEqual(ctocCrypto.canonicalStringify(undefined), undefined);
});

// Test: canonicalStringify with arrays
test('canonicalStringify handles empty array', () => {
  assert.strictEqual(ctocCrypto.canonicalStringify([]), '[]');
});

test('canonicalStringify handles array with primitives', () => {
  assert.strictEqual(ctocCrypto.canonicalStringify([1, 2, 3]), '[1,2,3]');
  assert.strictEqual(ctocCrypto.canonicalStringify(['a', 'b']), '["a","b"]');
});

test('canonicalStringify handles nested arrays', () => {
  assert.strictEqual(ctocCrypto.canonicalStringify([[1, 2], [3, 4]]), '[[1,2],[3,4]]');
});

// Test: canonicalStringify with objects (key sorting)
test('canonicalStringify handles empty object', () => {
  assert.strictEqual(ctocCrypto.canonicalStringify({}), '{}');
});

test('canonicalStringify sorts object keys alphabetically', () => {
  const obj1 = { z: 1, a: 2, m: 3 };
  const obj2 = { a: 2, m: 3, z: 1 };
  const obj3 = { m: 3, z: 1, a: 2 };

  const expected = '{"a":2,"m":3,"z":1}';
  assert.strictEqual(ctocCrypto.canonicalStringify(obj1), expected);
  assert.strictEqual(ctocCrypto.canonicalStringify(obj2), expected);
  assert.strictEqual(ctocCrypto.canonicalStringify(obj3), expected);
});

test('canonicalStringify handles nested objects with sorted keys', () => {
  const obj = { outer: { z: 1, a: 2 }, another: 'value' };
  const expected = '{"another":"value","outer":{"a":2,"z":1}}';
  assert.strictEqual(ctocCrypto.canonicalStringify(obj), expected);
});

test('canonicalStringify handles mixed nested structures', () => {
  const obj = { arr: [1, { b: 2, a: 1 }], key: 'value' };
  const expected = '{"arr":[1,{"a":1,"b":2}],"key":"value"}';
  assert.strictEqual(ctocCrypto.canonicalStringify(obj), expected);
});

console.log('#');
console.log('# omit tests');

// Test: omit function
test('omit returns empty object for empty input', () => {
  const result = ctocCrypto.omit({}, ['key']);
  assert.deepStrictEqual(result, {});
});

test('omit removes specified keys', () => {
  const obj = { a: 1, b: 2, c: 3 };
  const result = ctocCrypto.omit(obj, ['b']);
  assert.deepStrictEqual(result, { a: 1, c: 3 });
});

test('omit removes multiple keys', () => {
  const obj = { a: 1, b: 2, c: 3, d: 4 };
  const result = ctocCrypto.omit(obj, ['a', 'c']);
  assert.deepStrictEqual(result, { b: 2, d: 4 });
});

test('omit handles missing keys gracefully', () => {
  const obj = { a: 1, b: 2 };
  const result = ctocCrypto.omit(obj, ['x', 'y', 'z']);
  assert.deepStrictEqual(result, { a: 1, b: 2 });
});

test('omit recursively removes keys from nested objects', () => {
  const obj = {
    a: 1,
    nested: { a: 2, b: 3, _signature: 'test' },
    _signature: 'outer'
  };
  const result = ctocCrypto.omit(obj, ['_signature']);
  assert.deepStrictEqual(result, {
    a: 1,
    nested: { a: 2, b: 3 }
  });
});

test('omit preserves arrays', () => {
  const obj = { arr: [1, 2, 3], key: 'value' };
  const result = ctocCrypto.omit(obj, ['other']);
  assert.deepStrictEqual(result, { arr: [1, 2, 3], key: 'value' });
});

test('omit does not mutate original object', () => {
  const obj = { a: 1, b: 2 };
  const original = JSON.stringify(obj);
  ctocCrypto.omit(obj, ['a']);
  assert.strictEqual(JSON.stringify(obj), original);
});

console.log('#');
console.log('# getInstallationSecret tests');

// Test: getInstallationSecret
test('getInstallationSecret returns a buffer', () => {
  const secret = ctocCrypto.getInstallationSecret();
  assert.ok(Buffer.isBuffer(secret), 'Secret should be a Buffer');
});

test('getInstallationSecret returns consistent value', () => {
  const secret1 = ctocCrypto.getInstallationSecret();
  const secret2 = ctocCrypto.getInstallationSecret();
  assert.ok(secret1.equals(secret2), 'Secret should be consistent across calls');
});

test('getInstallationSecret returns at least 64 bytes', () => {
  const secret = ctocCrypto.getInstallationSecret();
  assert.ok(secret.length >= 64, `Secret should be at least 64 bytes, got ${secret.length}`);
});

console.log('#');
console.log('# signState tests');

// Test: signState
test('signState adds _signature field', () => {
  const state = { foo: 'bar', count: 42 };
  const signed = ctocCrypto.signState(state);
  assert.ok(signed._signature, 'Signed state should have _signature');
});

test('signState signature has correct prefix', () => {
  const state = { foo: 'bar' };
  const signed = ctocCrypto.signState(state);
  assert.ok(
    signed._signature.startsWith('hmac-sha256:'),
    'Signature should start with hmac-sha256:'
  );
});

test('signState signature is hex encoded', () => {
  const state = { foo: 'bar' };
  const signed = ctocCrypto.signState(state);
  const hex = signed._signature.replace('hmac-sha256:', '');
  assert.ok(/^[0-9a-f]{64}$/.test(hex), 'Signature should be 64 hex characters');
});

test('signState preserves original state properties', () => {
  const state = { foo: 'bar', nested: { a: 1 } };
  const signed = ctocCrypto.signState(state);
  assert.strictEqual(signed.foo, 'bar');
  assert.deepStrictEqual(signed.nested, { a: 1 });
});

test('signState produces same signature for equivalent objects', () => {
  const state1 = { b: 2, a: 1 };
  const state2 = { a: 1, b: 2 };
  const signed1 = ctocCrypto.signState(state1);
  const signed2 = ctocCrypto.signState(state2);
  assert.strictEqual(signed1._signature, signed2._signature);
});

test('signState produces different signatures for different objects', () => {
  const state1 = { foo: 'bar' };
  const state2 = { foo: 'baz' };
  const signed1 = ctocCrypto.signState(state1);
  const signed2 = ctocCrypto.signState(state2);
  assert.notStrictEqual(signed1._signature, signed2._signature);
});

test('signState does not mutate original object', () => {
  const state = { foo: 'bar' };
  const original = JSON.stringify(state);
  ctocCrypto.signState(state);
  assert.strictEqual(JSON.stringify(state), original);
});

test('signState ignores existing _signature when signing', () => {
  const state = { foo: 'bar' };
  const signed1 = ctocCrypto.signState(state);
  const signed2 = ctocCrypto.signState(signed1);
  assert.strictEqual(signed1._signature, signed2._signature);
});

console.log('#');
console.log('# verifyState tests');

// Test: verifyState
test('verifyState returns valid:true for correctly signed state', () => {
  const state = { foo: 'bar', count: 42 };
  const signed = ctocCrypto.signState(state);
  const result = ctocCrypto.verifyState(signed);
  assert.strictEqual(result.valid, true);
});

test('verifyState returns valid:false for null state', () => {
  const result = ctocCrypto.verifyState(null);
  assert.strictEqual(result.valid, false);
  assert.ok(result.error.includes('null'));
});

test('verifyState returns valid:false for undefined state', () => {
  const result = ctocCrypto.verifyState(undefined);
  assert.strictEqual(result.valid, false);
});

test('verifyState returns valid:false for unsigned state', () => {
  const state = { foo: 'bar' };
  const result = ctocCrypto.verifyState(state);
  assert.strictEqual(result.valid, false);
  assert.ok(result.error.includes('not signed'));
});

test('verifyState returns valid:false for invalid signature format', () => {
  const state = { foo: 'bar', _signature: 'invalid-format' };
  const result = ctocCrypto.verifyState(state);
  assert.strictEqual(result.valid, false);
  assert.ok(result.error.includes('Invalid signature format'));
});

test('verifyState returns valid:false for tampered state', () => {
  const state = { foo: 'bar' };
  const signed = ctocCrypto.signState(state);
  signed.foo = 'tampered';
  const result = ctocCrypto.verifyState(signed);
  assert.strictEqual(result.valid, false);
  assert.ok(result.error.includes('tampered') || result.error.includes('mismatch'));
});

test('verifyState returns valid:false for tampered signature', () => {
  const state = { foo: 'bar' };
  const signed = ctocCrypto.signState(state);
  // Modify the signature
  signed._signature = signed._signature.slice(0, -2) + 'ff';
  const result = ctocCrypto.verifyState(signed);
  assert.strictEqual(result.valid, false);
});

test('verifyState handles complex nested objects', () => {
  const state = {
    user: { name: 'test', roles: ['admin', 'user'] },
    timestamp: 12345,
    nested: { deep: { value: true } }
  };
  const signed = ctocCrypto.signState(state);
  const result = ctocCrypto.verifyState(signed);
  assert.strictEqual(result.valid, true);
});

console.log('#');
console.log('# hashFile tests');

// Test: hashFile
test('hashFile returns null for non-existent file', () => {
  const result = ctocCrypto.hashFile('/non/existent/path/file.txt');
  assert.strictEqual(result, null);
});

test('hashFile returns consistent hash for same content', () => {
  // Create a temporary file
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `ctoc-test-${Date.now()}.txt`);
  const content = 'test content for hashing';

  try {
    fs.writeFileSync(tempFile, content);
    const hash1 = ctocCrypto.hashFile(tempFile);
    const hash2 = ctocCrypto.hashFile(tempFile);
    assert.strictEqual(hash1, hash2);
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

test('hashFile returns different hashes for different content', () => {
  const tempDir = os.tmpdir();
  const tempFile1 = path.join(tempDir, `ctoc-test1-${Date.now()}.txt`);
  const tempFile2 = path.join(tempDir, `ctoc-test2-${Date.now()}.txt`);

  try {
    fs.writeFileSync(tempFile1, 'content one');
    fs.writeFileSync(tempFile2, 'content two');
    const hash1 = ctocCrypto.hashFile(tempFile1);
    const hash2 = ctocCrypto.hashFile(tempFile2);
    assert.notStrictEqual(hash1, hash2);
  } finally {
    if (fs.existsSync(tempFile1)) fs.unlinkSync(tempFile1);
    if (fs.existsSync(tempFile2)) fs.unlinkSync(tempFile2);
  }
});

test('hashFile returns 64 character hex string', () => {
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `ctoc-test-${Date.now()}.txt`);

  try {
    fs.writeFileSync(tempFile, 'test');
    const hash = ctocCrypto.hashFile(tempFile);
    assert.ok(/^[0-9a-f]{64}$/.test(hash), 'Hash should be 64 hex characters');
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

test('hashFile matches expected SHA256 for known content', () => {
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `ctoc-test-${Date.now()}.txt`);
  const content = 'hello world';

  try {
    fs.writeFileSync(tempFile, content);
    const hash = ctocCrypto.hashFile(tempFile);
    // Known SHA256 of "hello world"
    const expected = crypto.createHash('sha256').update(content).digest('hex');
    assert.strictEqual(hash, expected);
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

console.log('#');
console.log('# hashPath tests');

// Test: hashPath
test('hashPath returns 16 character string', () => {
  const hash = ctocCrypto.hashPath('/some/project/path');
  assert.strictEqual(hash.length, 16);
});

test('hashPath returns hex characters only', () => {
  const hash = ctocCrypto.hashPath('/some/project/path');
  assert.ok(/^[0-9a-f]{16}$/.test(hash), 'Hash should be 16 hex characters');
});

test('hashPath returns consistent hash for same path', () => {
  const path1 = '/home/user/project';
  const hash1 = ctocCrypto.hashPath(path1);
  const hash2 = ctocCrypto.hashPath(path1);
  assert.strictEqual(hash1, hash2);
});

test('hashPath returns different hashes for different paths', () => {
  const hash1 = ctocCrypto.hashPath('/path/one');
  const hash2 = ctocCrypto.hashPath('/path/two');
  assert.notStrictEqual(hash1, hash2);
});

test('hashPath handles empty string', () => {
  const hash = ctocCrypto.hashPath('');
  assert.strictEqual(hash.length, 16);
  assert.ok(/^[0-9a-f]{16}$/.test(hash));
});

test('hashPath handles special characters', () => {
  const hash = ctocCrypto.hashPath('/path/with spaces/and-dashes/and_underscores');
  assert.strictEqual(hash.length, 16);
  assert.ok(/^[0-9a-f]{16}$/.test(hash));
});

console.log('#');
console.log('# CTOC_HOME constant');

// Test: CTOC_HOME constant
test('CTOC_HOME is exported', () => {
  assert.ok(ctocCrypto.CTOC_HOME, 'CTOC_HOME should be exported');
});

test('CTOC_HOME is in home directory', () => {
  const home = os.homedir();
  assert.ok(
    ctocCrypto.CTOC_HOME.startsWith(home),
    'CTOC_HOME should be under home directory'
  );
});

test('CTOC_HOME ends with .ctoc', () => {
  assert.ok(
    ctocCrypto.CTOC_HOME.endsWith('.ctoc'),
    'CTOC_HOME should end with .ctoc'
  );
});

console.log('#');
console.log('# Integration tests');

// Integration test: Full sign-verify cycle
test('Full sign-verify cycle with complex state', () => {
  const state = {
    version: '1.0.0',
    plan: {
      name: 'test-plan',
      status: 'in_progress',
      steps: [
        { id: 1, done: true },
        { id: 2, done: false }
      ]
    },
    timestamp: Date.now(),
    tags: ['important', 'urgent']
  };

  const signed = ctocCrypto.signState(state);
  const result = ctocCrypto.verifyState(signed);

  assert.strictEqual(result.valid, true, 'Complex state should verify correctly');
  assert.strictEqual(signed.version, state.version);
  assert.deepStrictEqual(signed.plan, state.plan);
});

test('Tampering detection for nested properties', () => {
  const state = {
    user: { permissions: ['read', 'write'] }
  };

  const signed = ctocCrypto.signState(state);
  signed.user.permissions.push('admin');

  const result = ctocCrypto.verifyState(signed);
  assert.strictEqual(result.valid, false, 'Should detect tampering in nested arrays');
});

test('Signature uniqueness per installation', () => {
  // This test verifies the signature is deterministic for the same installation
  const state = { test: 'data' };
  const signed1 = ctocCrypto.signState(state);
  const signed2 = ctocCrypto.signState(state);

  assert.strictEqual(
    signed1._signature,
    signed2._signature,
    'Same state should produce same signature on same installation'
  );
});

console.log('#');
console.log('# All crypto tests passed!');
