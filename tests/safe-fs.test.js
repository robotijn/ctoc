'use strict';

/**
 * Tests for src/lib/safe-fs.js — the audited fs choke point (LH1).
 *
 * safe-fs is a behavior-preserving wrapper around the Node fs operations CTOC
 * uses at computed paths. It adds ONE real invariant on top of fs: every path
 * argument is validated (non-empty string, no NUL byte) and the call fails
 * CLOSED on bad input. It performs NO path normalization — delegated calls are
 * byte-identical to the underlying fs call. The sole project-wide
 * `eslint-disable security/detect-non-literal-fs-filename` lives inside the
 * wrapper; every other module imports safeFs.* so the rule can be promoted to
 * `error` with zero warnings.
 *
 * Cross-platform: fixtures use os.tmpdir() + fs.mkdtempSync; no OS-specific
 * assumptions (chmod mode and realpath canonicalization are not asserted
 * exactly, only that the calls succeed / return the expected shape).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const url = require('node:url');

const safeFs = require('../src/lib/safe-fs');

// The wrapped surface. Must stay in sync with src/lib/safe-fs.js exports.
const SYNC_METHODS = [
  'existsSync', 'readFileSync', 'writeFileSync', 'appendFileSync',
  'mkdirSync', 'readdirSync', 'statSync', 'lstatSync',
  'unlinkSync', 'rmSync', 'renameSync', 'copyFileSync', 'cpSync',
  'realpathSync', 'readlinkSync', 'chmodSync', 'utimesSync', 'openSync'
];
const PROMISES_METHODS = [
  'readFile', 'writeFile', 'appendFile', 'mkdir', 'readdir',
  'stat', 'lstat', 'unlink', 'rm', 'rename', 'copyFile',
  'realpath', 'readlink', 'chmod'
];
// Methods whose FIRST TWO positional args are both paths.
const TWO_PATH_SYNC = ['renameSync', 'copyFileSync', 'cpSync'];

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-safe-fs-'));
}

// ── Surface ───────────────────────────────────────────────────────────────

test('exports every wrapped sync method as a function', () => {
  for (const m of SYNC_METHODS) {
    assert.strictEqual(typeof safeFs[m], 'function', `safeFs.${m} should be a function`);
  }
});

test('exports a promises namespace with every wrapped async method', () => {
  assert.strictEqual(typeof safeFs.promises, 'object');
  assert.notStrictEqual(safeFs.promises, null);
  for (const m of PROMISES_METHODS) {
    assert.strictEqual(typeof safeFs.promises[m], 'function', `safeFs.promises.${m} should be a function`);
  }
});

// ── Pass-through round-trip (behavior identical to fs) ───────────────────────

test('sync round-trip is behavior-identical to fs', () => {
  const dir = mkTmp();
  try {
    const sub = path.join(dir, 'a', 'b');
    safeFs.mkdirSync(sub, { recursive: true });
    assert.ok(safeFs.existsSync(sub), 'mkdirSync + existsSync');

    const file = path.join(sub, 'data.txt');
    safeFs.writeFileSync(file, 'hello', 'utf8');
    // Read back through RAW fs to prove safeFs.writeFileSync wrote real bytes.
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'hello');
    // And safeFs.readFileSync matches raw fs.readFileSync exactly.
    assert.strictEqual(safeFs.readFileSync(file, 'utf8'), fs.readFileSync(file, 'utf8'));

    assert.ok(safeFs.existsSync(file));
    assert.ok(safeFs.readdirSync(sub).includes('data.txt'));
    assert.ok(safeFs.statSync(file).isFile());
    assert.ok(safeFs.lstatSync(file).isFile());

    safeFs.appendFileSync(file, ' world', 'utf8');
    assert.strictEqual(safeFs.readFileSync(file, 'utf8'), 'hello world');

    const copy = path.join(sub, 'copy.txt');
    safeFs.copyFileSync(file, copy);
    assert.strictEqual(safeFs.readFileSync(copy, 'utf8'), 'hello world');

    const renamed = path.join(sub, 'renamed.txt');
    safeFs.renameSync(copy, renamed);
    assert.ok(safeFs.existsSync(renamed));
    assert.ok(!safeFs.existsSync(copy));

    const real = safeFs.realpathSync(file);
    assert.strictEqual(typeof real, 'string');
    assert.ok(real.length > 0);

    // chmod must not throw (resulting mode not asserted — Windows differs).
    safeFs.chmodSync(file, 0o644);
    // utimes must not throw.
    const now = new Date();
    safeFs.utimesSync(file, now, now);

    safeFs.unlinkSync(renamed);
    assert.ok(!safeFs.existsSync(renamed));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('safeFs.rmSync recursively removes a tree', () => {
  const dir = mkTmp();
  const nested = path.join(dir, 'x', 'y');
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(nested, 'f.txt'), 'z');
  safeFs.rmSync(dir, { recursive: true, force: true });
  assert.ok(!fs.existsSync(dir));
});

test('promises round-trip is behavior-identical to fs.promises', async () => {
  const dir = mkTmp();
  try {
    const sub = path.join(dir, 'p');
    await safeFs.promises.mkdir(sub, { recursive: true });
    const file = path.join(sub, 'async.txt');
    await safeFs.promises.writeFile(file, 'one', 'utf8');
    assert.strictEqual(await safeFs.promises.readFile(file, 'utf8'), 'one');
    await safeFs.promises.appendFile(file, 'two', 'utf8');
    assert.strictEqual(await safeFs.promises.readFile(file, 'utf8'), 'onetwo');
    assert.ok((await safeFs.promises.readdir(sub)).includes('async.txt'));
    assert.ok((await safeFs.promises.stat(file)).isFile());
    await safeFs.promises.unlink(file);
    assert.ok(!fs.existsSync(file));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── Buffer / URL passthrough (fs accepts these; wrapper must not reject) ─────

test('accepts a file: URL path (passthrough)', () => {
  const dir = mkTmp();
  try {
    const file = path.join(dir, 'urlpath.txt');
    fs.writeFileSync(file, 'via-url');
    const fileUrl = url.pathToFileURL(file);
    assert.strictEqual(safeFs.readFileSync(fileUrl, 'utf8'), 'via-url');
    assert.ok(safeFs.existsSync(fileUrl));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('accepts a Buffer path (passthrough)', () => {
  const dir = mkTmp();
  try {
    const file = path.join(dir, 'bufpath.txt');
    fs.writeFileSync(file, 'via-buffer');
    assert.strictEqual(safeFs.readFileSync(Buffer.from(file), 'utf8'), 'via-buffer');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── Validation: fail closed on bad path input ───────────────────────────────

test('throws on empty-string path (every sync method)', () => {
  for (const m of SYNC_METHODS) {
    assert.throws(() => safeFs[m](''), /empty|invalid path/i, `${m}('') should throw`);
  }
});

test('throws on non-string path (number, object, null, undefined)', () => {
  for (const bad of [123, {}, [], null, undefined, true]) {
    assert.throws(() => safeFs.readFileSync(bad), /invalid path|must be/i,
      `readFileSync(${String(bad)}) should throw`);
  }
});

test('throws clearly on a NUL-byte path', () => {
  assert.throws(() => safeFs.readFileSync('a\0b'), /null byte|NUL/i);
  assert.throws(() => safeFs.writeFileSync('x\0y', 'z'), /null byte|NUL/i);
  assert.throws(() => safeFs.existsSync('p\0q'), /null byte|NUL/i);
  assert.throws(() => safeFs.mkdirSync('m\0n'), /null byte|NUL/i);
});

test('two-path methods validate BOTH path arguments', () => {
  const dir = mkTmp();
  try {
    const good = path.join(dir, 'g.txt');
    fs.writeFileSync(good, 'g');
    for (const m of TWO_PATH_SYNC) {
      assert.throws(() => safeFs[m]('', good), /empty|invalid path/i, `${m}('', good)`);
      assert.throws(() => safeFs[m](good, ''), /empty|invalid path/i, `${m}(good, '')`);
      assert.throws(() => safeFs[m](good, 'b\0c'), /null byte|NUL/i, `${m}(good, NUL)`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('promises methods reject (not throw sync) on bad path', async () => {
  await assert.rejects(() => safeFs.promises.readFile(''), /empty|invalid path/i);
  await assert.rejects(() => safeFs.promises.readFile('a\0b'), /null byte|NUL/i);
  await assert.rejects(() => safeFs.promises.writeFile(42, 'x'), /invalid path|must be/i);
  await assert.rejects(() => safeFs.promises.rename('', 'x'), /empty|invalid path/i);
});
