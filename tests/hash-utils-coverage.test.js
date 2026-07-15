#!/usr/bin/env node
'use strict';

/**
 * Dark-branch coverage for src/lib/hash-utils.js.
 *
 * Complements tests/governance-modules-b.test.js (happy-path + determinism)
 * by pinning ONLY the branches that test leaves red at 90.88% line coverage:
 *   - lines 37-39  : hashFile() catch path (existsSync true, readFileSync throws)
 *   - lines 245-251: hashDirectory() glob exclude branch + metacharacter escaping
 *   - line  233    : hashDirectory() depth > maxDepth guard (true side)
 *   - lines 300-318: the require.main === module CLI block
 *
 * Every test here is written to die under mutation of the line it targets, not
 * merely to raise the percentage. No mocking of core logic — the only boundary
 * faked is the real filesystem (real temp dirs, cleaned in `after`) and a real
 * child process for the CLI.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const MODULE_PATH = path.join(REPO, 'src', 'lib', 'hash-utils.js');
const hashUtils = require(MODULE_PATH);

let root;

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-hashutils-cov-'));
});

after(() => {
  if (root) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('hash-utils dark branches', () => {
  // -------------------------------------------------------------------------
  // Cluster 1 — hashString against published NIST known-answer vectors.
  //
  // Kills: a constant-return mutant AND a wrong-algorithm mutant (e.g. sha1/md5
  // or a different digest encoding). The oracle is an EXTERNAL published
  // constant, not a recompute with the same crypto call the module uses, so a
  // mutation of createHash('sha256') cannot masquerade as correct.
  // -------------------------------------------------------------------------
  test('hashString_returns_published_sha256_vector_for_empty_and_abc', () => {
    // Arrange — canonical NIST FIPS 180-4 SHA-256 test vectors.
    const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

    // Act + Assert
    assert.equal(hashUtils.hashString(''), EMPTY);
    assert.equal(hashUtils.hashString('abc'), ABC);
  });

  test('hashString_flips_digest_on_single_bit_change', () => {
    // Arrange — 'abc' vs 'abd' differ by one bit in the last byte.
    // Act
    const a = hashUtils.hashString('abc');
    const b = hashUtils.hashString('abd');

    // Assert — avalanche: one-char change must not leave the digest unchanged.
    assert.notEqual(a, b);
  });

  // -------------------------------------------------------------------------
  // Cluster 2 — hashFile() catch path (lines 37-39).
  //
  // existsSync() returns true for a directory, then readFileSync() throws
  // EISDIR. The function must swallow the error, warn, and return null — NOT
  // propagate. Kills a mutant that drops the try/catch or returns something
  // other than null on read failure. Also pins the console.warn line.
  // -------------------------------------------------------------------------
  test('hashFile_returns_null_and_warns_when_read_throws', () => {
    // Arrange — a directory exists but cannot be read as a file.
    const dirAsFile = path.join(root, 'is-a-directory');
    fs.mkdirSync(dirAsFile);

    const originalWarn = console.warn;
    const warnings = [];
    console.warn = (msg) => warnings.push(String(msg));

    let result;
    try {
      // Act — existsSync(dir) === true, readFileSync(dir) throws EISDIR.
      result = hashUtils.hashFile(dirAsFile);
    } finally {
      console.warn = originalWarn;
    }

    // Assert — null return AND a warning was emitted for this path.
    assert.equal(result, null);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Could not hash file/);
    assert.ok(warnings[0].includes(dirAsFile));
  });

  // -------------------------------------------------------------------------
  // Cluster 3 — hashDirectory() glob exclude branch (lines 245-251) with the
  // metacharacter-escaping SENSITIVITY that the code comment calls out.
  //
  // Pattern '*.log' compiles to /.*\.log/ (the '.' is escaped to a LITERAL
  // dot). If the escaping regressed to a bare '.log' (dot = any char), then
  // 'applog.txt' — which contains "plog" — would be wrongly excluded. This
  // test asserts the escaped behaviour: 'debug.log' is excluded, 'applog.txt'
  // is KEPT. That asymmetry is exactly what dies if the escape is mutated away.
  // -------------------------------------------------------------------------
  test('hashDirectory_glob_exclude_escapes_dot_as_literal_not_wildcard', () => {
    // Arrange
    const dir = path.join(root, 'glob-escape');
    fs.mkdirSync(dir);
    const excluded = path.join(dir, 'debug.log');
    const keptTrap = path.join(dir, 'applog.txt'); // contains "plog" — the trap
    const keptPlain = path.join(dir, 'src.js');
    fs.writeFileSync(excluded, 'x');
    fs.writeFileSync(keptTrap, 'y');
    fs.writeFileSync(keptPlain, 'z');

    // Act — custom exclude uses the glob branch (pattern.includes('*') === true).
    const result = hashUtils.hashDirectory(dir, { exclude: ['*.log'] });

    // Assert — literal-dot escaping keeps the trap file, drops only the .log.
    assert.ok(!(excluded in result.files), 'debug.log must be excluded by *.log');
    assert.ok(keptTrap in result.files, 'applog.txt must NOT be excluded (literal-dot escape)');
    assert.ok(keptPlain in result.files, 'src.js must be present');
    assert.equal(result.fileCount, 2);
  });

  // -------------------------------------------------------------------------
  // Cluster 4 — hashDirectory() maxDepth guard (line 233 true side).
  //
  // With maxDepth: 0 the walker must NOT descend into subdirectories. Kills a
  // mutant that flips `depth > maxDepth` to `>=`/`<` or removes the guard: a
  // removed guard would recurse and include the nested file.
  // -------------------------------------------------------------------------
  test('hashDirectory_maxDepth_zero_excludes_nested_files', () => {
    // Arrange — one top-level file, one file one level deeper.
    const dir = path.join(root, 'depth');
    fs.mkdirSync(dir);
    const topFile = path.join(dir, 'top.txt');
    const subDir = path.join(dir, 'nested');
    fs.mkdirSync(subDir);
    const deepFile = path.join(subDir, 'deep.txt');
    fs.writeFileSync(topFile, 'top');
    fs.writeFileSync(deepFile, 'deep');

    // Act
    const shallow = hashUtils.hashDirectory(dir, { maxDepth: 0 });

    // Assert — only the top-level file is hashed; the nested one is beyond depth.
    assert.ok(topFile in shallow.files, 'top-level file must be hashed at depth 0');
    assert.ok(!(deepFile in shallow.files), 'nested file must be skipped at maxDepth 0');
    assert.equal(shallow.fileCount, 1);
  });

  test('hashDirectory_default_depth_includes_nested_files', () => {
    // Arrange — same tree, default maxDepth (10) must reach the nested file.
    const dir = path.join(root, 'depth-default');
    fs.mkdirSync(dir);
    const subDir = path.join(dir, 'nested');
    fs.mkdirSync(subDir);
    const deepFile = path.join(subDir, 'deep.txt');
    fs.writeFileSync(path.join(dir, 'top.txt'), 'top');
    fs.writeFileSync(deepFile, 'deep');

    // Act
    const full = hashUtils.hashDirectory(dir);

    // Assert — proves the depth-0 exclusion above was the guard, not the walk.
    assert.ok(deepFile in full.files, 'nested file must be reachable at default depth');
    assert.equal(full.fileCount, 2);
  });

  // -------------------------------------------------------------------------
  // Cluster 5 — the CLI block (lines 300-318), exercised via a real child
  // process so require.main === module is true. Three arms:
  //   (a) no args      -> Usage message + exit code 1
  //   (b) file arg     -> "<hash>  <path>" where <hash> matches hashString
  //   (c) directory arg-> Directory/Files/Composite-hash summary
  // -------------------------------------------------------------------------
  test('cli_with_no_args_prints_usage_and_exits_nonzero', () => {
    // Act
    const proc = spawnSync(process.execPath, [MODULE_PATH], { encoding: 'utf8' });

    // Assert — the args.length === 0 branch: usage + process.exit(1).
    assert.equal(proc.status, 1);
    assert.match(proc.stdout, /Usage: hash-utils\.js/);
  });

  test('cli_with_file_arg_prints_matching_sha256_and_path', () => {
    // Arrange
    const f = path.join(root, 'cli-file.txt');
    const body = 'cli-body-contents';
    fs.writeFileSync(f, body);
    const expected = hashUtils.hashString(body);

    // Act
    const out = execFileSync(process.execPath, [MODULE_PATH, f], { encoding: 'utf8' });

    // Assert — the non-directory arm emits "<hash>  <resolvedPath>".
    assert.ok(out.startsWith(expected), 'stdout must lead with the file digest');
    assert.ok(out.includes(f), 'stdout must include the resolved file path');
  });

  test('cli_with_directory_arg_prints_composite_summary', () => {
    // Arrange
    const dir = path.join(root, 'cli-dir');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
    fs.writeFileSync(path.join(dir, 'b.txt'), 'b');
    const expectedComposite = hashUtils.hashDirectory(dir).compositeHash;

    // Act
    const out = execFileSync(process.execPath, [MODULE_PATH, dir], { encoding: 'utf8' });

    // Assert — the isDirectory() arm reports directory, file count, composite.
    assert.match(out, /Directory:/);
    assert.match(out, /Files: 2/);
    assert.ok(out.includes(expectedComposite), 'CLI composite must equal library composite');
  });
});
