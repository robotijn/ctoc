/**
 * Contract tests for five previously-untested setup/scaffolding lib modules:
 *   - src/lib/ci-wizard.js
 *   - src/lib/dashboard-renderer.js
 *   - src/lib/hooks-installer.js
 *   - src/lib/ide-config.js
 *   - src/lib/auto-fixer.js
 *
 * These assert the DOCUMENTED contract (JSDoc / module headers): happy path of
 * every export, a core property per module, and error / malformed-input paths
 * (must not throw uncaught). Filesystem modules run in hermetic temp dirs cleaned
 * up in afterEach. Modules that write to git hook locations are pointed at a temp
 * git repo, never the real one. All paths via path.join / os.tmpdir for
 * cross-platform behavior.
 */

'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const hooksInstaller = require('../src/lib/hooks-installer');

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

const tempDirs = [];

function makeTempDir(prefix = 'ctoc-setup-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function cleanupAll() {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch { /* best-effort cleanup */ }
  }
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
}

// ===========================================================================
// ci-wizard.js
// ===========================================================================

describe('hooks-installer', () => {
  afterEach(cleanupAll);

  // Create a real (empty) git repo so getGitHooksDir / installers operate on it.
  function makeGitRepo(prefix = 'ctoc-git-') {
    const dir = makeTempDir(prefix);
    execSync('git init -q', { cwd: dir, stdio: 'pipe' });
    return dir;
  }

  describe('constants', () => {
    it('exposes SYSTEMS and HOOK_TYPES', () => {
      assert.equal(hooksInstaller.SYSTEMS.HUSKY, 'husky');
      assert.equal(hooksInstaller.SYSTEMS.NATIVE, 'native');
      assert.ok(hooksInstaller.HOOK_TYPES.includes('pre-commit'));
      assert.ok(hooksInstaller.HOOK_TYPES.includes('post-commit'));
    });
  });

  describe('HooksInstaller constructor', () => {
    it('throws "Not a git repository" outside a git repo', () => {
      const dir = makeTempDir('ctoc-nogit-');
      assert.throws(
        () => new hooksInstaller.HooksInstaller(dir),
        /Not a git repository/
      );
    });

    it('constructs inside a git repo and exposes sub-installers', () => {
      const dir = makeGitRepo();
      const inst = new hooksInstaller.HooksInstaller(dir);
      assert.ok(inst.husky);
      assert.ok(inst.precommit);
      assert.ok(inst.native);
    });
  });

  describe('detectSystem', () => {
    it('defaults to HUSKY when package.json is present', () => {
      const dir = makeGitRepo();
      writeJson(path.join(dir, 'package.json'), { name: 'x' });
      const inst = new hooksInstaller.HooksInstaller(dir);
      assert.equal(inst.detectSystem(), hooksInstaller.SYSTEMS.HUSKY);
    });

    it('falls back to NATIVE for a bare repo', () => {
      const dir = makeGitRepo();
      const inst = new hooksInstaller.HooksInstaller(dir);
      assert.equal(inst.detectSystem(), hooksInstaller.SYSTEMS.NATIVE);
    });

    it('prefers PRECOMMIT for a Python project (pyproject.toml)', () => {
      const dir = makeGitRepo();
      fs.writeFileSync(path.join(dir, 'pyproject.toml'), '[project]\n');
      const inst = new hooksInstaller.HooksInstaller(dir);
      assert.equal(inst.detectSystem(), hooksInstaller.SYSTEMS.PRECOMMIT);
    });
  });

  describe('status', () => {
    it('reports each system as not-installed for a fresh repo', () => {
      const dir = makeGitRepo();
      const inst = new hooksInstaller.HooksInstaller(dir);
      const status = inst.status();
      assert.equal(status.husky, false);
      assert.equal(status.precommit, false);
      assert.equal(status.native, false);
      assert.ok(status.detected, 'detected system is always reported');
    });
  });

  describe('NativeHooksInstaller', () => {
    it('install() copies the CTOC native templates into .git/hooks and is executable', () => {
      const dir = makeGitRepo();
      const native = new hooksInstaller.NativeHooksInstaller(dir);
      assert.equal(native.isInstalled(), false);

      // install() is async per JSDoc.
      return native.install().then((result) => {
        assert.ok(Array.isArray(result.installed));
        // The repo ships pre-commit/pre-push/commit-msg native templates.
        assert.ok(result.installed.includes('pre-commit'),
          'pre-commit native hook should install from template');
        const hookPath = path.join(dir, '.git', 'hooks', 'pre-commit');
        assert.ok(fs.existsSync(hookPath));
        const content = fs.readFileSync(hookPath, 'utf8');
        assert.ok(content.includes('CTOC'), 'installed native hook carries CTOC marker');
        assert.equal(native.isInstalled(), true);
        if (process.platform !== 'win32') {
          // mode 0o755 => owner-executable bit set.
          assert.ok((fs.statSync(hookPath).mode & 0o100) !== 0, 'hook is owner-executable');
        }
      });
    });

    it('install() does not overwrite a pre-existing non-CTOC hook', () => {
      const dir = makeGitRepo();
      const hooksDir = path.join(dir, '.git', 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });
      const preCommit = path.join(hooksDir, 'pre-commit');
      fs.writeFileSync(preCommit, '#!/bin/sh\necho user hook\n');

      const native = new hooksInstaller.NativeHooksInstaller(dir);
      return native.install().then(() => {
        const content = fs.readFileSync(preCommit, 'utf8');
        assert.ok(content.includes('echo user hook'),
          'pre-existing non-CTOC hook must be preserved');
        assert.ok(!content.includes('CTOC'));
      });
    });

    it('uninstall() removes only CTOC hooks, leaving user hooks intact', () => {
      const dir = makeGitRepo();
      const hooksDir = path.join(dir, '.git', 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });
      const userHook = path.join(hooksDir, 'pre-push');
      fs.writeFileSync(userHook, '#!/bin/sh\necho mine\n');
      const ctocHook = path.join(hooksDir, 'commit-msg');
      fs.writeFileSync(ctocHook, '#!/bin/sh\n# CTOC commit-msg\n');

      const native = new hooksInstaller.NativeHooksInstaller(dir);
      native.uninstall();
      assert.ok(fs.existsSync(userHook), 'non-CTOC hook preserved');
      assert.ok(!fs.existsSync(ctocHook), 'CTOC hook removed');
    });
  });

  describe('installPostCommitHook / uninstallPostCommitHook', () => {
    it('installs a fresh CTOC post-commit hook', () => {
      const dir = makeGitRepo();
      const result = hooksInstaller.installPostCommitHook(dir, { pluginRoot: dir });
      assert.equal(result.installed, true);
      const hookPath = path.join(dir, '.git', 'hooks', 'post-commit');
      assert.ok(fs.existsSync(hookPath));
      const content = fs.readFileSync(hookPath, 'utf8');
      assert.ok(content.includes('CTOC'));
      assert.ok(content.includes('post-commit.js'));
    });

    it('is idempotent — re-install reports skipped', () => {
      const dir = makeGitRepo();
      hooksInstaller.installPostCommitHook(dir, { pluginRoot: dir });
      const second = hooksInstaller.installPostCommitHook(dir, { pluginRoot: dir });
      assert.equal(second.installed, false);
      assert.equal(second.skipped, true);
    });

    it('appends to a pre-existing non-CTOC post-commit hook (preserves it)', () => {
      const dir = makeGitRepo();
      const hooksDir = path.join(dir, '.git', 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });
      const hookPath = path.join(hooksDir, 'post-commit');
      fs.writeFileSync(hookPath, '#!/bin/sh\necho existing\n');

      const result = hooksInstaller.installPostCommitHook(dir, { pluginRoot: dir });
      assert.equal(result.installed, true);
      assert.equal(result.appended, true);
      const content = fs.readFileSync(hookPath, 'utf8');
      assert.ok(content.includes('echo existing'), 'original content preserved');
      assert.ok(content.includes('CTOC'), 'CTOC invocation appended');
    });

    // Extract the path embedded in a generated hook's `node "<path>"` line.
    function embeddedHookPath(script) {
      const m = script.match(/node "([^"]+post-commit\.js)"/);
      assert.ok(m, 'generated hook embeds a node "<...post-commit.js>" invocation');
      return m[1];
    }

    it('embeds a post-commit.js path that resolves on disk (new-hook branch, L9)', () => {
      const dir = makeGitRepo();
      const ctocRoot = path.join(__dirname, '..');
      const result = hooksInstaller.installPostCommitHook(dir, { pluginRoot: ctocRoot });
      assert.equal(result.installed, true);
      const script = fs.readFileSync(path.join(dir, '.git', 'hooks', 'post-commit'), 'utf8');
      const target = embeddedHookPath(script);
      assert.ok(fs.existsSync(target), `embedded hook path must exist: ${target}`);
    });

    it('embeds a post-commit.js path that resolves on disk (append branch, L9)', () => {
      const dir = makeGitRepo();
      const ctocRoot = path.join(__dirname, '..');
      const hooksDir = path.join(dir, '.git', 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });
      const hookPath = path.join(hooksDir, 'post-commit');
      fs.writeFileSync(hookPath, '#!/bin/sh\necho existing\n');

      const result = hooksInstaller.installPostCommitHook(dir, { pluginRoot: ctocRoot });
      assert.equal(result.appended, true);
      const script = fs.readFileSync(hookPath, 'utf8');
      const target = embeddedHookPath(script);
      assert.ok(fs.existsSync(target), `embedded hook path must exist: ${target}`);
    });

    it('uninstall removes a CTOC-only post-commit hook entirely', () => {
      const dir = makeGitRepo();
      hooksInstaller.installPostCommitHook(dir, { pluginRoot: dir });
      const result = hooksInstaller.uninstallPostCommitHook(dir);
      assert.equal(result.removed, true);
      assert.ok(!fs.existsSync(path.join(dir, '.git', 'hooks', 'post-commit')));
    });

    it('uninstall refuses to remove a non-CTOC post-commit hook', () => {
      const dir = makeGitRepo();
      const hooksDir = path.join(dir, '.git', 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });
      fs.writeFileSync(path.join(hooksDir, 'post-commit'), '#!/bin/sh\necho mine\n');
      const result = hooksInstaller.uninstallPostCommitHook(dir);
      assert.equal(result.removed, false);
      assert.match(result.reason, /not a CTOC hook/);
    });

    it('uninstall on a missing hook reports nothing to remove', () => {
      const dir = makeGitRepo();
      const result = hooksInstaller.uninstallPostCommitHook(dir);
      assert.equal(result.removed, false);
      assert.match(result.reason, /No post-commit hook found/);
    });
  });
});

// ===========================================================================
// ide-config.js
// ===========================================================================
