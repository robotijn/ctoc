/**
 * W08-s2 — Project detector upward walk (Defect 2 / audit finding H5).
 *
 * Proves `isCtocProject(root)` recognizes a CTOC project from ANY nested
 * subdirectory by walking up to the first ancestor that physically has both
 * `.ctoc/` and `CLAUDE.md`, while leaving root-level behavior byte-identical and
 * never over-walking past an unmarked-but-real project boundary.
 *
 * Discipline: no test doubles. Every fixture is a real nested directory tree
 * built under `os.tmpdir()` with real `.ctoc/`, `CLAUDE.md`, and `package.json`
 * files, and torn down in `after()`. All paths are composed with `path.join`
 * for cross-platform correctness.
 */

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { isCtocProject } = require('../src/lib/ctoc-project-detector');

const MARKED_CLAUDE_MD = '# CTOC Project Instructions\n\nProject guidance.\n';
const UNMARKED_CLAUDE_MD = '# Some Other Project\n\nNothing to see here.\n';

// Track every fixture root so we can remove them all after the suite runs.
const fixtures = [];

function newFixtureRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w08s2-'));
  fixtures.push(dir);
  return dir;
}

/**
 * Materialize a CTOC project boundary at `dir`: a real `.ctoc/` directory, a
 * `CLAUDE.md` (marked or unmarked), and — when a package name is given — a real
 * `package.json`. Returns `dir` for chaining.
 */
function writeProject(dir, { marked = true, packageName } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'CLAUDE.md'),
    marked ? MARKED_CLAUDE_MD : UNMARKED_CLAUDE_MD
  );
  if (packageName !== undefined) {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: packageName, version: '0.0.0' })
    );
  }
  return dir;
}

function makeDir(...parts) {
  const dir = path.join(...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

after(() => {
  for (const dir of fixtures) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort temp cleanup */
    }
  }
});

// 1. Nested cwd, consumer project (Defect 2 core).
test('nested cwd in a consumer project resolves identically to the root', () => {
  const root = newFixtureRoot();
  writeProject(root, { marked: true, packageName: 'some-app' });
  const nested = makeDir(root, 'src', 'lib');

  const fromNested = isCtocProject(nested);
  const fromRoot = isCtocProject(root);

  assert.deepStrictEqual(fromNested, fromRoot);
  assert.deepStrictEqual(fromNested, { isCtoc: true, isCtocRepo: false });
});

// 2. Deeply nested cwd (>= 3 levels below root).
test('deeply nested cwd (>= 3 levels) still resolves the CTOC root', () => {
  const root = newFixtureRoot();
  writeProject(root, { marked: true, packageName: 'some-app' });
  const deep = makeDir(root, 'a', 'b', 'c');

  assert.deepStrictEqual(isCtocProject(deep), { isCtoc: true, isCtocRepo: false });
});

// 3. Nested cwd inside the ctoc repo itself (package.json name === 'ctoc').
test('nested cwd inside the ctoc repo reports isCtocRepo true', () => {
  const root = newFixtureRoot();
  writeProject(root, { marked: true, packageName: 'ctoc' });
  const nested = makeDir(root, 'src', 'lib');

  assert.deepStrictEqual(isCtocProject(nested), { isCtoc: true, isCtocRepo: true });
  // Identical to running directly at the root.
  assert.deepStrictEqual(isCtocProject(nested), isCtocProject(root));
});

// 4. Root-level detection unchanged (regression guard, both flavors).
test('root-level detection is unchanged for consumer and ctoc-repo fixtures', () => {
  const consumer = newFixtureRoot();
  writeProject(consumer, { marked: true, packageName: 'some-app' });
  assert.deepStrictEqual(isCtocProject(consumer), { isCtoc: true, isCtocRepo: false });

  const repo = newFixtureRoot();
  writeProject(repo, { marked: true, packageName: 'ctoc' });
  assert.deepStrictEqual(isCtocProject(repo), { isCtoc: true, isCtocRepo: true });
});

// 5. No over-walk past an unmarked-but-real boundary.
test('walk stops at the first .ctoc/+CLAUDE.md boundary and does not climb past an unmarked one', () => {
  const outer = newFixtureRoot();
  writeProject(outer, { marked: true, packageName: 'some-app' });
  // Nested project boundary: has both markers, but CLAUDE.md is unmarked and
  // there is no ctoc package.json.
  const inner = writeProject(path.join(outer, 'inner'), { marked: false });
  const sub = makeDir(inner, 'sub');

  assert.deepStrictEqual(isCtocProject(sub), { isCtoc: false, isCtocRepo: false });
});

// 6. No CTOC ancestor anywhere — terminates cleanly at the filesystem root.
test('a bare directory with no CTOC ancestor returns false and terminates', () => {
  const bare = newFixtureRoot(); // mkdtemp dir with nothing written into it
  let result;
  assert.doesNotThrow(() => {
    result = isCtocProject(bare);
  });
  assert.deepStrictEqual(result, { isCtoc: false, isCtocRepo: false });
});

// 7. Fail-open on partial markers — CLAUDE.md present but .ctoc/ absent.
test('CLAUDE.md present but .ctoc/ absent is not a CTOC project (both required)', () => {
  const root = newFixtureRoot();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), MARKED_CLAUDE_MD);
  // Deliberately no .ctoc/ directory anywhere up the tree.

  assert.deepStrictEqual(isCtocProject(root), { isCtoc: false, isCtocRepo: false });
});

// 8. Marked boundary with a non-ctoc package still detects isCtoc from nested.
test('nested cwd separates isCtoc (marker) from isCtocRepo (package identity)', () => {
  const root = newFixtureRoot();
  writeProject(root, { marked: true, packageName: 'not-ctoc' });
  const nested = makeDir(root, 'deep', 'path');

  assert.deepStrictEqual(isCtocProject(nested), { isCtoc: true, isCtocRepo: false });
});
