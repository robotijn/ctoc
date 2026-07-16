/**
 * Command-module lib batch tests (batch 2)
 *
 * Contract-based tests for five previously untested CTOC libs:
 *   - src/lib/cmd-hooks.js
 *   - src/lib/cmd-ide.js
 *   - src/lib/cmd-playwright.js
 *   - src/lib/cmd-quality.js
 *   - src/lib/project-root.js
 *
 * Each test asserts the DOCUMENTED contract of an export: the happy path, the
 * core decision/argument-handling logic described in the module header/JSDoc,
 * and error/malformed-input paths (asserting no uncaught throw and, where the
 * module documents one, a structured `{ success:false, error }` result).
 *
 * Hermetic boundaries:
 *   - Every filesystem fixture lives in an mkdtempSync temp dir under os.tmpdir,
 *     resolved through realpathSync so symlinked tmp roots (macOS /var -> /private
 *     /var) compare equal to the values the modules return. Cleaned up afterEach.
 *   - HooksInstaller's constructor throws unless a `.git` directory exists; the
 *     hooks tests create a `.git` *directory* (no git binary needed) to exercise
 *     status/remove/test code paths, matching the repo's existing hook tests.
 *     `cmd-hooks initHooks` is tested in dry-run mode so nothing is installed.
 *   - QualityScorer writes its history under <projectRoot>/.ctoc, so every
 *     cmd-quality path that scores stays inside the temp project.
 *   - cmd-quality `status` reads global quality-state via findProjectRoot() with
 *     no override param; it is read-only with a safe default fallback, so we
 *     assert only its stable result shape, never environment-specific values,
 *     and write nothing.
 *   - cmd-ide writes to console and `initCommand` calls process.exit(1) on an
 *     UNKNOWN ide type; tests only ever pass valid ide types and use dry-run so
 *     no files are written and the process is never exited.
 *
 * Cross-platform: paths are built with path.join / os.tmpdir, never string
 * concatenation. Console output from the IDE command is silenced per-call.
 */

'use strict';

const assert = require('node:assert/strict');
const { test, describe, beforeEach, afterEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

const projectRoot = require('../src/lib/project-root');

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// realpathSync so that values the modules compute from the same temp dir (which
// they resolve internally) compare equal to ours on platforms where the tmp
// root is a symlink (e.g. macOS /var -> /private/var).
function makeTempDir(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function rmDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    // Best-effort cleanup; ignore.
  }
}

function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function seedNodeProject(dir) {
  writeFile(dir, 'package.json', JSON.stringify({
    name: 'ctoc-cmd2-fixture',
    version: '1.0.0',
    private: true
  }));
}

// ===========================================================================
// project-root.js
// ===========================================================================

describe('project-root.js', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = makeTempDir('ctoc-cmd2-root-');
  });

  afterEach(() => {
    rmDir(tmpRoot);
  });

  test('exports the documented public API', () => {
    for (const name of ['findProjectRoot', 'getPlansPath', 'getCtocPath', 'fromProjectRoot']) {
      assert.equal(typeof projectRoot[name], 'function', `missing export: ${name}`);
    }
  });

  test('findProjectRoot walks up to a .ctoc marker', () => {
    fs.mkdirSync(path.join(tmpRoot, '.ctoc'), { recursive: true });
    // A genuine project .ctoc carries settings (init writes it); a bare .ctoc is the
    // global crypto home shape and must NOT be treated as a project root.
    fs.writeFileSync(path.join(tmpRoot, '.ctoc', 'settings.yaml'), 'enforcement:\n  mode: strict\n');
    const nested = path.join(tmpRoot, 'a', 'b', 'c');
    fs.mkdirSync(nested, { recursive: true });

    assert.equal(projectRoot.findProjectRoot(nested), tmpRoot);
  });

  test('findProjectRoot walks up to a CTOC plans directory marker', () => {
    // A plans/ dir is only a marker when it has CTOC plan subdirs.
    fs.mkdirSync(path.join(tmpRoot, 'plans', 'vision'), { recursive: true });
    const nested = path.join(tmpRoot, 'deep', 'nested', 'dir');
    fs.mkdirSync(nested, { recursive: true });

    assert.equal(projectRoot.findProjectRoot(nested), tmpRoot);
  });

  test('a plans/ directory WITHOUT CTOC subdirs is not treated as a marker', () => {
    // An unrelated "plans" folder must not be mistaken for a CTOC project root.
    // With no other marker anywhere up the tree, the documented fallback is cwd.
    const plain = makeTempDir('ctoc-cmd2-root-plain-');
    try {
      fs.mkdirSync(path.join(plain, 'plans'), { recursive: true });
      const nested = path.join(plain, 'x', 'y');
      fs.mkdirSync(nested, { recursive: true });
      const found = projectRoot.findProjectRoot(nested);
      // It must NOT short-circuit on the bare plans/ dir.
      assert.notEqual(found, plain);
    } finally {
      rmDir(plain);
    }
  });

  test('findProjectRoot recognizes a .git directory as a marker', () => {
    fs.mkdirSync(path.join(tmpRoot, '.git'), { recursive: true });
    const nested = path.join(tmpRoot, 'src', 'lib');
    fs.mkdirSync(nested, { recursive: true });
    assert.equal(projectRoot.findProjectRoot(nested), tmpRoot);
  });

  test('findProjectRoot recognizes common project-root files (package.json)', () => {
    seedNodeProject(tmpRoot);
    const nested = path.join(tmpRoot, 'src');
    fs.mkdirSync(nested, { recursive: true });
    assert.equal(projectRoot.findProjectRoot(nested), tmpRoot);
  });

  test('.ctoc takes priority over a deeper .git when both are present', () => {
    // .ctoc at the parent, a WEAKER marker (.git) in a child. `.ctoc` is the
    // authoritative CTOC-root marker (documented priority 1) and must win ACROSS
    // levels — a nested .git/package.json (a common monorepo subpackage) must NOT
    // shadow the ancestor .ctoc root (that mis-rooting was the confirmed defect).
    fs.mkdirSync(path.join(tmpRoot, '.ctoc'), { recursive: true });
    // Make the ancestor .ctoc a genuine project root (settings present), not the bare
    // crypto-home shape — otherwise it correctly no longer qualifies as a CTOC root.
    fs.writeFileSync(path.join(tmpRoot, '.ctoc', 'settings.yaml'), 'enforcement:\n  mode: strict\n');
    const child = path.join(tmpRoot, 'child');
    fs.mkdirSync(path.join(child, '.git'), { recursive: true });
    // From the child, the ancestor .ctoc wins over the child's own .git.
    assert.equal(projectRoot.findProjectRoot(child), tmpRoot);
    // One level deeper: still the .ctoc ancestor.
    const deeper = path.join(child, 'inner');
    fs.mkdirSync(deeper, { recursive: true });
    assert.equal(projectRoot.findProjectRoot(deeper), tmpRoot);
  });

  test('findProjectRoot falls back to cwd when no markers exist up the tree', () => {
    // os.tmpdir() ancestry has no CTOC/.git/project markers on a CI box; the
    // documented fallback is process.cwd().
    const result = projectRoot.findProjectRoot(tmpRoot);
    assert.equal(result, process.cwd());
  });

  test('findProjectRoot defaults startDir to cwd and returns an absolute path', () => {
    const result = projectRoot.findProjectRoot();
    assert.equal(typeof result, 'string');
    assert.ok(path.isAbsolute(result));
  });

  test('getPlansPath / getCtocPath / fromProjectRoot derive from the resolved root', () => {
    fs.mkdirSync(path.join(tmpRoot, '.ctoc'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, '.ctoc', 'settings.yaml'), 'enforcement:\n  mode: strict\n');
    const nested = path.join(tmpRoot, 'a', 'b');
    fs.mkdirSync(nested, { recursive: true });

    assert.equal(projectRoot.getPlansPath(nested), path.join(tmpRoot, 'plans'));
    assert.equal(projectRoot.getCtocPath(nested), path.join(tmpRoot, '.ctoc'));
    assert.equal(
      projectRoot.fromProjectRoot(path.join('docs', 'x.md'), nested),
      path.join(tmpRoot, 'docs', 'x.md')
    );
  });
});
