/**
 * Behavioral coverage for src/lib/hooks-installer.js.
 *
 * Strategy:
 *  - Filesystem is REAL: every test runs against an os.tmpdir()/fs.mkdtemp
 *    fixture that looks like a git repo (a `.git` directory). Hook files,
 *    package.json, config files, templates-on-disk are all real bytes.
 *  - The ONLY controlled boundary is child_process.execSync — the module
 *    shells out to git/npm/npx/pip/pre-commit, none of which we want to run
 *    for real. We reload the module with a routed execSync stub so each test
 *    dictates exactly how the shell responds (success / failure / custom
 *    output) without touching the module's own logic.
 *  - The module reads its hook templates from the REAL repo
 *    .ctoc/templates/hooks directory (a module-level const off __dirname); we
 *    let it, so the native installer writes genuine template bytes into the
 *    temp hooks dir.
 *
 * Every test restores execSync + process.platform and purges the module from
 * require.cache in a finally block, so tests are order-independent (FIRST).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const cp = require('node:child_process');

const HOOKS_PATH = require.resolve('../src/lib/hooks-installer');
const REAL_EXEC = cp.execSync;
const REAL_PLATFORM = process.platform;

// ── boundary control ────────────────────────────────────────────────────────

/**
 * Build a routed execSync stub. `rules` is an ordered list of
 * { match: RegExp|fn, throwErr?, message?, stdout?, out? }. First match wins.
 * Unmatched commands return '' — which, for `command -v`/`where` probes, means
 * "resolves" (hasCommand → true) and for git config means "no custom path".
 */
function router(rules = []) {
  return (command) => {
    for (const r of rules) {
      const hit = typeof r.match === 'function' ? r.match(command) : r.match.test(command);
      if (hit) {
        if (r.throwErr) {
          const e = new Error(r.message || 'command failed');
          if (r.stdout !== undefined) e.stdout = r.stdout;
          throw e;
        }
        return r.out !== undefined ? r.out : '';
      }
    }
    return '';
  };
}

/** Reload the module with a chosen execSync + platform. */
function load({ exec, platform } = {}) {
  if (platform) Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  cp.execSync = exec || (() => '');
  delete require.cache[HOOKS_PATH];
  return require(HOOKS_PATH);
}

function restore() {
  cp.execSync = REAL_EXEC;
  Object.defineProperty(process, 'platform', { value: REAL_PLATFORM, configurable: true });
  delete require.cache[HOOKS_PATH];
}

// ── fixtures ────────────────────────────────────────────────────────────────

function mkTemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-hooks-'));
}
function mkRepo() {
  const dir = mkTemp();
  fs.mkdirSync(path.join(dir, '.git'));
  return dir;
}
function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort cleanup */ }
}
function write(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
const isPosixNonRoot = process.platform !== 'win32' && typeof process.getuid === 'function' && process.getuid() !== 0;

// ============================================================================
// hasCommand — token validation (no shell)
// ============================================================================

test('hasCommand returns false for a token containing shell metacharacters', () => {
  const { hasCommand } = load();
  try {
    // Arrange / Act / Assert — the injection guard rejects before any exec.
    assert.equal(hasCommand('rm;rm'), false);
    assert.equal(hasCommand('a b'), false);
    assert.equal(hasCommand('$(evil)'), false);
  } finally {
    restore();
  }
});

test('hasCommand returns false for non-string input', () => {
  const { hasCommand } = load();
  try {
    assert.equal(hasCommand(null), false);
    assert.equal(hasCommand(undefined), false);
    assert.equal(hasCommand(42), false);
  } finally {
    restore();
  }
});

test('hasCommand returns true when the probe resolves', () => {
  const { hasCommand } = load({ exec: router([]) }); // unmatched → '' → no throw
  try {
    assert.equal(hasCommand('git'), true);
  } finally {
    restore();
  }
});

// ============================================================================
// isGitRepo (via HooksInstaller constructor) & getGitHooksDir
// ============================================================================

test('HooksInstaller constructor throws when the directory is not a git repo', () => {
  const dir = mkTemp(); // no .git
  const { HooksInstaller } = load();
  try {
    assert.throws(() => new HooksInstaller(dir), /Not a git repository/);
  } finally {
    restore();
    rm(dir);
  }
});

test('HooksInstaller constructor succeeds on a git repo', () => {
  const dir = mkRepo();
  const { HooksInstaller } = load();
  try {
    const inst = new HooksInstaller(dir);
    assert.equal(inst.projectRoot, dir);
  } finally {
    restore();
    rm(dir);
  }
});

test('NativeHooksInstaller constructor throws when project is not a git repo', () => {
  const dir = mkTemp();
  const { NativeHooksInstaller } = load();
  try {
    assert.throws(() => new NativeHooksInstaller(dir), /Not a git repository/);
  } finally {
    restore();
    rm(dir);
  }
});

test('getGitHooksDir honours a custom core.hooksPath from git config', () => {
  const dir = mkRepo();
  // git config --get core.hooksPath returns a relative custom dir.
  const exec = router([{ match: /git config --get core\.hooksPath/, out: 'my-hooks\n' }]);
  const { installPostCommitHook } = load({ exec });
  try {
    const res = installPostCommitHook(dir, { pluginRoot: dir });
    assert.equal(res.installed, true);
    // The hook must land under the custom hooks path, not .git/hooks.
    assert.ok(fs.existsSync(path.join(dir, 'my-hooks', 'post-commit')));
    assert.ok(!fs.existsSync(path.join(dir, '.git', 'hooks', 'post-commit')));
  } finally {
    restore();
    rm(dir);
  }
});

test('getGitHooksDir falls back to .git/hooks when `git config` errors', () => {
  const dir = mkRepo();
  // Make the core.hooksPath probe fail → the catch selects the default dir.
  const exec = router([{ match: /git config --get core\.hooksPath/, throwErr: true, message: 'no config' }]);
  const { installPostCommitHook } = load({ exec });
  try {
    const res = installPostCommitHook(dir, { pluginRoot: dir });
    assert.equal(res.installed, true);
    assert.ok(fs.existsSync(path.join(dir, '.git', 'hooks', 'post-commit')), 'defaulted to .git/hooks');
  } finally {
    restore();
    rm(dir);
  }
});

// ============================================================================
// HuskyInstaller
// ============================================================================

test('HuskyInstaller.isInstalled is true only when both .husky and node_modules/husky exist', () => {
  const dir = mkRepo();
  const { HuskyInstaller } = load();
  try {
    const h = new HuskyInstaller(dir);
    assert.equal(h.isInstalled(), false, 'nothing installed yet');

    fs.mkdirSync(path.join(dir, '.husky'));
    assert.equal(h.isInstalled(), false, '.husky alone is not enough');

    fs.mkdirSync(path.join(dir, 'node_modules', 'husky'), { recursive: true });
    assert.equal(h.isInstalled(), true, 'both present → installed');
  } finally {
    restore();
    rm(dir);
  }
});

test('HuskyInstaller.install throws when package.json is missing', async () => {
  const dir = mkRepo();
  const { HuskyInstaller } = load();
  try {
    await assert.rejects(() => new HuskyInstaller(dir).install(), /package\.json not found/);
  } finally {
    restore();
    rm(dir);
  }
});

test('HuskyInstaller.install throws when npm install of husky fails', async () => {
  const dir = mkRepo();
  write(path.join(dir, 'package.json'), JSON.stringify({ name: 'x' }));
  const exec = router([{ match: /npm install -D husky/, throwErr: true, message: 'npm boom' }]);
  const { HuskyInstaller } = load({ exec });
  try {
    await assert.rejects(() => new HuskyInstaller(dir).install(), /Failed to install husky: npm boom/);
  } finally {
    restore();
    rm(dir);
  }
});

test('HuskyInstaller.install installs hook templates and wires package.json + lint-staged', async () => {
  const dir = mkRepo();
  write(path.join(dir, 'package.json'), JSON.stringify({ name: 'x' }));
  // Simulate `husky init` having created .husky so template writes succeed.
  fs.mkdirSync(path.join(dir, '.husky'));
  const { HuskyInstaller } = load({ exec: router([]) });
  try {
    const results = await new HuskyInstaller(dir).install();

    // Three husky templates exist on disk (pre-commit, pre-push, commit-msg).
    assert.deepEqual(results.installed.sort(), ['commit-msg', 'pre-commit', 'pre-push']);
    assert.equal(results.errors.length, 0);
    assert.ok(fs.existsSync(path.join(dir, '.husky', 'pre-commit')));

    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts.prepare, 'husky');
    assert.ok(fs.existsSync(path.join(dir, '.lintstagedrc.json')));
  } finally {
    restore();
    rm(dir);
  }
});

test('HuskyInstaller.install skips a hook that already exists', async () => {
  const dir = mkRepo();
  write(path.join(dir, 'package.json'), JSON.stringify({ name: 'x' }));
  fs.mkdirSync(path.join(dir, '.husky'));
  write(path.join(dir, '.husky', 'pre-commit'), '#!/bin/sh\n# pre-existing\n');
  const { HuskyInstaller } = load({ exec: router([]) });
  try {
    const results = await new HuskyInstaller(dir).install();
    assert.ok(!results.installed.includes('pre-commit'), 'existing pre-commit must be skipped');
    assert.ok(results.installed.includes('pre-push'));
    // Existing content is preserved untouched.
    assert.match(fs.readFileSync(path.join(dir, '.husky', 'pre-commit'), 'utf8'), /pre-existing/);
  } finally {
    restore();
    rm(dir);
  }
});

test('HuskyInstaller.install records errors when the .husky dir is absent so writes fail', async () => {
  const dir = mkRepo();
  write(path.join(dir, 'package.json'), JSON.stringify({ name: 'x' }));
  // Intentionally do NOT create .husky (execSync is stubbed so init cannot make it).
  const { HuskyInstaller } = load({ exec: router([]) });
  try {
    const results = await new HuskyInstaller(dir).install();
    assert.equal(results.installed.length, 0, 'no writes could succeed');
    assert.ok(results.errors.length >= 1, 'each failed write is recorded');
    assert.ok(results.errors[0].hook && results.errors[0].error, 'error entry is structured');
  } finally {
    restore();
    rm(dir);
  }
});

test('HuskyInstaller.install falls back to legacy `husky install` when `husky init` fails', async () => {
  const dir = mkRepo();
  write(path.join(dir, 'package.json'), JSON.stringify({ name: 'x' }));
  fs.mkdirSync(path.join(dir, '.husky'));
  const calls = [];
  const exec = (command) => {
    calls.push(command);
    if (/npx husky init/.test(command)) throw new Error('init unsupported');
    return '';
  };
  const { HuskyInstaller } = load({ exec });
  try {
    await new HuskyInstaller(dir).install();
    assert.ok(calls.some((c) => /npx husky install/.test(c)), 'legacy install path must be attempted');
  } finally {
    restore();
    rm(dir);
  }
});

test('HuskyInstaller.install adds a TypeScript lint-staged rule when tsconfig.json is present', async () => {
  const dir = mkRepo();
  write(path.join(dir, 'package.json'), JSON.stringify({ name: 'x' }));
  write(path.join(dir, 'tsconfig.json'), '{}');
  fs.mkdirSync(path.join(dir, '.husky'));
  const { HuskyInstaller } = load({ exec: router([]) });
  try {
    await new HuskyInstaller(dir).install();
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.lintstagedrc.json'), 'utf8'));
    assert.ok(cfg['*.{ts,tsx}'], 'a TS-specific rule must be added when tsconfig exists');
  } finally {
    restore();
    rm(dir);
  }
});

test('HuskyInstaller.install does not overwrite an existing prepare script and warns on bad package.json', async () => {
  const dir = mkRepo();
  // Already has a prepare script → must be left as-is.
  write(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', scripts: { prepare: 'echo keep' } }));
  fs.mkdirSync(path.join(dir, '.husky'));
  const { HuskyInstaller } = load({ exec: router([]) });
  try {
    await new HuskyInstaller(dir).install();
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts.prepare, 'echo keep', 'existing prepare script preserved');
  } finally {
    restore();
    rm(dir);
  }
});

test('HuskyInstaller._addPrepareScript warns (does not throw) when package.json is malformed', async () => {
  const dir = mkRepo();
  write(path.join(dir, 'package.json'), '{ this is not valid json');
  fs.mkdirSync(path.join(dir, '.husky'));
  const { HuskyInstaller } = load({ exec: router([]) });
  try {
    // Install must complete despite the unparseable package.json (catch → warn).
    const results = await new HuskyInstaller(dir).install();
    assert.ok(Array.isArray(results.installed), 'install completes without throwing');
  } finally {
    restore();
    rm(dir);
  }
});

test('HuskyInstaller._createLintStagedConfig leaves an existing config untouched', async () => {
  const dir = mkRepo();
  write(path.join(dir, 'package.json'), JSON.stringify({ name: 'x' }));
  fs.mkdirSync(path.join(dir, '.husky'));
  write(path.join(dir, '.lintstagedrc.json'), '{"custom":true}');
  const { HuskyInstaller } = load({ exec: router([]) });
  try {
    await new HuskyInstaller(dir).install();
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.lintstagedrc.json'), 'utf8'));
    assert.deepEqual(cfg, { custom: true }, 'existing lint-staged config must be preserved');
  } finally {
    restore();
    rm(dir);
  }
});

if (isPosixNonRoot) {
  test('HuskyInstaller._createLintStagedConfig warns (does not throw) when the config write fails', async () => {
    const dir = mkRepo();
    // prepare already set → _addPrepareScript performs no write to the (soon) read-only root.
    write(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', scripts: { prepare: 'husky' } }));
    fs.mkdirSync(path.join(dir, '.husky')); // template writes target this writable subdir
    const { HuskyInstaller } = load({ exec: router([]) });
    try {
      fs.chmodSync(dir, 0o500); // root read-only: creating .lintstagedrc.json will EACCES
      const results = await new HuskyInstaller(dir).install();
      // Install still completes; the lint-staged write failure is swallowed with a warning.
      assert.ok(Array.isArray(results.installed), 'install completes despite config write failure');
      assert.equal(fs.existsSync(path.join(dir, '.lintstagedrc.json')), false, 'config could not be written');
    } finally {
      fs.chmodSync(dir, 0o755); // restore so cleanup can delete
      restore();
      rm(dir);
    }
  });
}

test('HuskyInstaller.uninstall removes the .husky directory when present', () => {
  const dir = mkRepo();
  fs.mkdirSync(path.join(dir, '.husky'));
  write(path.join(dir, '.husky', 'pre-commit'), '# hook');
  const { HuskyInstaller } = load({ exec: router([]) });
  try {
    new HuskyInstaller(dir).uninstall();
    assert.equal(fs.existsSync(path.join(dir, '.husky')), false, '.husky removed');
  } finally {
    restore();
    rm(dir);
  }
});

test('HuskyInstaller.uninstall is a no-op on the directory when .husky is absent', () => {
  const dir = mkRepo();
  const { HuskyInstaller } = load({ exec: router([]) });
  try {
    assert.doesNotThrow(() => new HuskyInstaller(dir).uninstall());
  } finally {
    restore();
    rm(dir);
  }
});

// ============================================================================
// PreCommitInstaller
// ============================================================================

test('PreCommitInstaller._detectProjectType classifies each stack from its marker file', () => {
  const { PreCommitInstaller } = load();
  try {
    const cases = [
      { file: 'tsconfig.json', expected: 'typescript' },
      { file: 'pyproject.toml', expected: 'python' },
      { file: 'setup.py', expected: 'python' },
      { file: 'requirements.txt', expected: 'python' },
      { file: 'go.mod', expected: 'go' },
      { file: null, expected: 'multi-lang' },
    ];
    for (const c of cases) {
      const dir = mkRepo();
      try {
        if (c.file) write(path.join(dir, c.file), '');
        const detected = new PreCommitInstaller(dir)._detectProjectType();
        assert.equal(detected, c.expected, `marker=${c.file}`);
      } finally {
        rm(dir);
      }
    }
  } finally {
    restore();
  }
});

test('PreCommitInstaller.isInstalled requires both the config file and the CLI', () => {
  const dir = mkRepo();
  const { PreCommitInstaller } = load({ exec: router([]) }); // CLI probe resolves
  try {
    const pc = new PreCommitInstaller(dir);
    assert.equal(pc.isInstalled(), false, 'no config yet');
    write(path.join(dir, '.pre-commit-config.yaml'), 'repos: []');
    assert.equal(pc.isInstalled(), true, 'config + resolving CLI → installed');
  } finally {
    restore();
    rm(dir);
  }
});

test('PreCommitInstaller.install creates config and installs the three hook types (happy path)', async () => {
  const dir = mkRepo();
  const { PreCommitInstaller } = load({ exec: router([]) });
  try {
    const results = await new PreCommitInstaller(dir).install('python');
    assert.ok(fs.existsSync(path.join(dir, '.pre-commit-config.yaml')), 'config written');
    assert.ok(results.installed.includes('.pre-commit-config.yaml'));
    assert.ok(results.installed.includes('pre-commit'));
    assert.ok(results.installed.includes('commit-msg'));
    assert.ok(results.installed.includes('pre-push'));
  } finally {
    restore();
    rm(dir);
  }
});

test('PreCommitInstaller.install throws on an unknown project type (no template)', async () => {
  const dir = mkRepo();
  const { PreCommitInstaller } = load({ exec: router([]) });
  try {
    await assert.rejects(() => new PreCommitInstaller(dir).install('haskell'), /Unknown project type: haskell/);
  } finally {
    restore();
    rm(dir);
  }
});

test('PreCommitInstaller.install skips creating config when one already exists', async () => {
  const dir = mkRepo();
  write(path.join(dir, '.pre-commit-config.yaml'), 'repos: [custom]');
  const { PreCommitInstaller } = load({ exec: router([]) });
  try {
    const results = await new PreCommitInstaller(dir).install('python');
    assert.ok(!results.installed.includes('.pre-commit-config.yaml'), 'existing config not re-created');
    assert.match(fs.readFileSync(path.join(dir, '.pre-commit-config.yaml'), 'utf8'), /custom/);
  } finally {
    restore();
    rm(dir);
  }
});

test('PreCommitInstaller.install auto-detects the project type when asked', async () => {
  const dir = mkRepo();
  write(path.join(dir, 'go.mod'), 'module x');
  const { PreCommitInstaller } = load({ exec: router([]) });
  try {
    const results = await new PreCommitInstaller(dir).install('auto');
    // go.yaml.template exists → config created without throwing.
    assert.ok(results.installed.includes('.pre-commit-config.yaml'));
  } finally {
    restore();
    rm(dir);
  }
});

test('PreCommitInstaller.install records an error when `pre-commit install` fails', async () => {
  const dir = mkRepo();
  // CLI probe resolves (so no framework install), but the install command fails.
  const exec = router([
    { match: /pre-commit install$/, throwErr: true, message: 'install failed' },
  ]);
  const { PreCommitInstaller } = load({ exec });
  try {
    const results = await new PreCommitInstaller(dir).install('python');
    assert.ok(results.errors.some((e) => e.hook === 'pre-commit'), 'failed install recorded as error');
  } finally {
    restore();
    rm(dir);
  }
});

test('PreCommitInstaller.install uses pip to bootstrap the framework when the CLI is absent', async () => {
  const dir = mkRepo();
  const calls = [];
  const exec = (command) => {
    calls.push(command);
    // pre-commit CLI probe fails; pip probe resolves.
    if (/command -v pre-commit|where pre-commit/.test(command)) throw new Error('no pre-commit');
    return '';
  };
  const { PreCommitInstaller } = load({ exec });
  try {
    await new PreCommitInstaller(dir).install('python');
    assert.ok(calls.some((c) => /pip install pre-commit/.test(c)), 'pip bootstrap path taken');
  } finally {
    restore();
    rm(dir);
  }
});

test('PreCommitInstaller.install falls through pip → pip3 → pipx bootstrap chain', async () => {
  const dir = mkRepo();
  const calls = [];
  const exec = (command) => {
    calls.push(command);
    // pre-commit, pip, pip3 all absent; only pipx resolves.
    if (/command -v (pre-commit|pip|pip3)\b|where (pre-commit|pip|pip3)\b/.test(command)) {
      throw new Error('absent');
    }
    return '';
  };
  const { PreCommitInstaller } = load({ exec });
  try {
    await new PreCommitInstaller(dir).install('python');
    assert.ok(calls.some((c) => /pipx install pre-commit/.test(c)), 'pipx bootstrap path taken');
  } finally {
    restore();
    rm(dir);
  }
});

test('PreCommitInstaller.install uses pip3 when pip is absent but pip3 resolves', async () => {
  const dir = mkRepo();
  const calls = [];
  const exec = (command) => {
    calls.push(command);
    // pre-commit CLI and plain `pip` absent; pip3 (and pipx) resolve.
    if (/command -v pre-commit\b|where pre-commit\b|command -v pip\b|where pip\b/.test(command)) {
      throw new Error('absent');
    }
    return '';
  };
  const { PreCommitInstaller } = load({ exec });
  try {
    await new PreCommitInstaller(dir).install('python');
    assert.ok(calls.some((c) => /pip3 install pre-commit/.test(c)), 'pip3 bootstrap path taken');
  } finally {
    restore();
    rm(dir);
  }
});

test('PreCommitInstaller.install throws when no python installer is available', async () => {
  const dir = mkRepo();
  // Everything the module probes for is absent → cannot bootstrap.
  const exec = (command) => {
    if (/command -v|where /.test(command)) throw new Error('absent');
    return '';
  };
  const { PreCommitInstaller } = load({ exec });
  try {
    await assert.rejects(
      () => new PreCommitInstaller(dir).install('python'),
      /Cannot install pre-commit. Please install pip or pipx first\./
    );
  } finally {
    restore();
    rm(dir);
  }
});

test('PreCommitInstaller.uninstall removes the config file when present', () => {
  const dir = mkRepo();
  write(path.join(dir, '.pre-commit-config.yaml'), 'repos: []');
  const { PreCommitInstaller } = load({ exec: router([]) });
  try {
    new PreCommitInstaller(dir).uninstall();
    assert.equal(fs.existsSync(path.join(dir, '.pre-commit-config.yaml')), false);
  } finally {
    restore();
    rm(dir);
  }
});

test('PreCommitInstaller.uninstall is a no-op when the config file is absent', () => {
  const dir = mkRepo();
  const { PreCommitInstaller } = load({ exec: router([]) });
  try {
    assert.doesNotThrow(() => new PreCommitInstaller(dir).uninstall());
  } finally {
    restore();
    rm(dir);
  }
});

// ============================================================================
// NativeHooksInstaller
// ============================================================================

test('NativeHooksInstaller.install writes the CTOC hook templates into .git/hooks', async () => {
  const dir = mkRepo();
  const { NativeHooksInstaller } = load({ exec: router([]) });
  try {
    const results = await new NativeHooksInstaller(dir).install();
    assert.deepEqual(results.installed.sort(), ['commit-msg', 'pre-commit', 'pre-push']);
    const hook = fs.readFileSync(path.join(dir, '.git', 'hooks', 'pre-commit'), 'utf8');
    assert.match(hook, /CTOC/, 'installed hook carries the CTOC marker');
  } finally {
    restore();
    rm(dir);
  }
});

test('NativeHooksInstaller.install skips an existing non-CTOC hook', async () => {
  const dir = mkRepo();
  write(path.join(dir, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho "user hook"\n');
  const { NativeHooksInstaller } = load({ exec: router([]) });
  try {
    const results = await new NativeHooksInstaller(dir).install();
    assert.ok(!results.installed.includes('pre-commit'), 'foreign hook must be preserved');
    assert.match(fs.readFileSync(path.join(dir, '.git', 'hooks', 'pre-commit'), 'utf8'), /user hook/);
  } finally {
    restore();
    rm(dir);
  }
});

test('NativeHooksInstaller.install overwrites an existing CTOC-marked hook', async () => {
  const dir = mkRepo();
  write(path.join(dir, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\n# CTOC old version\n');
  const { NativeHooksInstaller } = load({ exec: router([]) });
  try {
    const results = await new NativeHooksInstaller(dir).install();
    assert.ok(results.installed.includes('pre-commit'), 'CTOC hook is replaced');
    assert.ok(!fs.readFileSync(path.join(dir, '.git', 'hooks', 'pre-commit'), 'utf8').includes('old version'));
  } finally {
    restore();
    rm(dir);
  }
});

test('NativeHooksInstaller.install creates the hooks directory when it does not exist', async () => {
  const dir = mkRepo();
  // Fresh .git with no hooks subdir.
  assert.equal(fs.existsSync(path.join(dir, '.git', 'hooks')), false);
  const { NativeHooksInstaller } = load({ exec: router([]) });
  try {
    await new NativeHooksInstaller(dir).install();
    assert.ok(fs.existsSync(path.join(dir, '.git', 'hooks')), 'hooks dir created');
  } finally {
    restore();
    rm(dir);
  }
});

if (isPosixNonRoot) {
  test('NativeHooksInstaller.install records errors when the hooks dir is read-only', async () => {
    const dir = mkRepo();
    const hooksDir = path.join(dir, '.git', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.chmodSync(hooksDir, 0o500); // r-x: writes will EACCES
    const { NativeHooksInstaller } = load({ exec: router([]) });
    try {
      const results = await new NativeHooksInstaller(dir).install();
      assert.equal(results.installed.length, 0, 'no hook could be written');
      assert.ok(results.errors.length >= 1, 'write failures are captured, not thrown');
    } finally {
      fs.chmodSync(hooksDir, 0o755); // restore so cleanup can delete
      restore();
      rm(dir);
    }
  });
}

test('NativeHooksInstaller.isInstalled reflects presence of the pre-commit hook', () => {
  const dir = mkRepo();
  const { NativeHooksInstaller } = load({ exec: router([]) });
  try {
    const n = new NativeHooksInstaller(dir);
    assert.equal(n.isInstalled(), false);
    write(path.join(dir, '.git', 'hooks', 'pre-commit'), '# CTOC');
    assert.equal(n.isInstalled(), true);
  } finally {
    restore();
    rm(dir);
  }
});

test('NativeHooksInstaller.uninstall removes CTOC hooks but keeps foreign ones', () => {
  const dir = mkRepo();
  write(path.join(dir, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\n# CTOC hook\n');
  write(path.join(dir, '.git', 'hooks', 'pre-push'), '#!/bin/sh\necho foreign\n');
  const { NativeHooksInstaller } = load({ exec: router([]) });
  try {
    new NativeHooksInstaller(dir).uninstall();
    assert.equal(fs.existsSync(path.join(dir, '.git', 'hooks', 'pre-commit')), false, 'CTOC hook removed');
    assert.equal(fs.existsSync(path.join(dir, '.git', 'hooks', 'pre-push')), true, 'foreign hook kept');
  } finally {
    restore();
    rm(dir);
  }
});

// ============================================================================
// installPostCommitHook / uninstallPostCommitHook
// ============================================================================

test('installPostCommitHook writes a new CTOC post-commit hook', () => {
  const dir = mkRepo();
  const { installPostCommitHook } = load({ exec: router([]) });
  try {
    const res = installPostCommitHook(dir, { pluginRoot: '/plugins/ctoc' });
    assert.deepEqual(res, { installed: true });
    const content = fs.readFileSync(path.join(dir, '.git', 'hooks', 'post-commit'), 'utf8');
    assert.match(content, /CTOC post-commit hook/);
    assert.match(content, /post-commit\.js/);
  } finally {
    restore();
    rm(dir);
  }
});

test('installPostCommitHook skips when a CTOC hook is already present', () => {
  const dir = mkRepo();
  write(path.join(dir, '.git', 'hooks', 'post-commit'), '#!/bin/sh\n# CTOC post-commit hook\n');
  const { installPostCommitHook } = load({ exec: router([]) });
  try {
    const res = installPostCommitHook(dir, { pluginRoot: dir });
    assert.deepEqual(res, { installed: false, skipped: true, reason: 'CTOC post-commit hook already installed' });
  } finally {
    restore();
    rm(dir);
  }
});

test('installPostCommitHook appends its invocation to an existing foreign hook', () => {
  const dir = mkRepo();
  write(path.join(dir, '.git', 'hooks', 'post-commit'), '#!/bin/sh\necho "existing user hook"\n');
  const { installPostCommitHook } = load({ exec: router([]) });
  try {
    const res = installPostCommitHook(dir, { pluginRoot: dir });
    assert.deepEqual(res, { installed: true, appended: true });
    const content = fs.readFileSync(path.join(dir, '.git', 'hooks', 'post-commit'), 'utf8');
    assert.match(content, /existing user hook/, 'original content retained');
    assert.match(content, /CTOC post-commit hook/, 'CTOC invocation appended');
  } finally {
    restore();
    rm(dir);
  }
});

test('installPostCommitHook resolves the plugin root from CLAUDE_PLUGIN_ROOT when no option is given', () => {
  const dir = mkRepo();
  const saved = process.env.CLAUDE_PLUGIN_ROOT;
  process.env.CLAUDE_PLUGIN_ROOT = '/env/plugin/root';
  const { installPostCommitHook } = load({ exec: router([]) });
  try {
    installPostCommitHook(dir); // no options → env-derived plugin root
    const content = fs.readFileSync(path.join(dir, '.git', 'hooks', 'post-commit'), 'utf8');
    assert.match(content, /\/env\/plugin\/root/, 'env-provided plugin root used in hook body');
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
    else process.env.CLAUDE_PLUGIN_ROOT = saved;
    restore();
    rm(dir);
  }
});

test('installPostCommitHook defaults the plugin root to the CTOC install when neither option nor env is set', () => {
  const dir = mkRepo();
  const saved = process.env.CLAUDE_PLUGIN_ROOT;
  delete process.env.CLAUDE_PLUGIN_ROOT;
  const { installPostCommitHook } = load({ exec: router([]) });
  try {
    const res = installPostCommitHook(dir); // no options, no env → path.join(__dirname, '..', '..')
    assert.equal(res.installed, true);
    const content = fs.readFileSync(path.join(dir, '.git', 'hooks', 'post-commit'), 'utf8');
    // Body points at the plugin's real post-commit.js under the derived root.
    assert.match(content, /src[\\/]hooks[\\/]post-commit\.js/);
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
    else process.env.CLAUDE_PLUGIN_ROOT = saved;
    restore();
    rm(dir);
  }
});

test('uninstallPostCommitHook reports when there is no hook to remove', () => {
  const dir = mkRepo();
  const { uninstallPostCommitHook } = load({ exec: router([]) });
  try {
    const res = uninstallPostCommitHook(dir);
    assert.deepEqual(res, { removed: false, reason: 'No post-commit hook found' });
  } finally {
    restore();
    rm(dir);
  }
});

test('uninstallPostCommitHook refuses to touch a non-CTOC hook', () => {
  const dir = mkRepo();
  write(path.join(dir, '.git', 'hooks', 'post-commit'), '#!/bin/sh\necho "user"\n');
  const { uninstallPostCommitHook } = load({ exec: router([]) });
  try {
    const res = uninstallPostCommitHook(dir);
    assert.deepEqual(res, { removed: false, reason: 'Post-commit hook is not a CTOC hook' });
    assert.ok(fs.existsSync(path.join(dir, '.git', 'hooks', 'post-commit')), 'foreign hook left intact');
  } finally {
    restore();
    rm(dir);
  }
});

test('uninstallPostCommitHook deletes a hook that contains only CTOC content', () => {
  const dir = mkRepo();
  const { installPostCommitHook, uninstallPostCommitHook } = load({ exec: router([]) });
  try {
    installPostCommitHook(dir, { pluginRoot: dir }); // pure-CTOC hook
    const res = uninstallPostCommitHook(dir);
    assert.deepEqual(res, { removed: true });
    assert.equal(fs.existsSync(path.join(dir, '.git', 'hooks', 'post-commit')), false);
  } finally {
    restore();
    rm(dir);
  }
});

test('uninstallPostCommitHook strips only CTOC lines from a mixed hook (partial removal)', () => {
  const dir = mkRepo();
  const mixed = [
    '#!/bin/sh',
    'echo "keep me"',
    '# CTOC post-commit hook - triggers background quality agent',
    'node "/plugins/ctoc/src/hooks/post-commit.js" 2>/dev/null &',
  ].join('\n') + '\n';
  write(path.join(dir, '.git', 'hooks', 'post-commit'), mixed);
  const { uninstallPostCommitHook } = load({ exec: router([]) });
  try {
    const res = uninstallPostCommitHook(dir);
    assert.deepEqual(res, { removed: true, partial: true });
    const content = fs.readFileSync(path.join(dir, '.git', 'hooks', 'post-commit'), 'utf8');
    assert.match(content, /keep me/, 'foreign line retained');
    assert.ok(!content.includes('CTOC'), 'CTOC lines stripped');
    assert.ok(!content.includes('post-commit.js'), 'CTOC invocation stripped');
  } finally {
    restore();
    rm(dir);
  }
});

// ============================================================================
// HooksInstaller — detection, status, dispatch
// ============================================================================

test('HooksInstaller.detectSystem returns husky when husky is already installed', () => {
  const dir = mkRepo();
  fs.mkdirSync(path.join(dir, '.husky'));
  fs.mkdirSync(path.join(dir, 'node_modules', 'husky'), { recursive: true });
  const { HooksInstaller, SYSTEMS } = load({ exec: router([]) });
  try {
    assert.equal(new HooksInstaller(dir).detectSystem(), SYSTEMS.HUSKY);
  } finally {
    restore();
    rm(dir);
  }
});

test('HooksInstaller.detectSystem returns pre-commit when a pre-commit config + CLI are present', () => {
  const dir = mkRepo();
  write(path.join(dir, '.pre-commit-config.yaml'), 'repos: []');
  const { HooksInstaller, SYSTEMS } = load({ exec: router([]) }); // CLI probe resolves
  try {
    assert.equal(new HooksInstaller(dir).detectSystem(), SYSTEMS.PRECOMMIT);
  } finally {
    restore();
    rm(dir);
  }
});

test('HooksInstaller.detectSystem chooses husky for a package.json project', () => {
  const dir = mkRepo();
  write(path.join(dir, 'package.json'), '{}');
  // pre-commit CLI absent so precommit.isInstalled is false.
  const exec = (command) => { if (/command -v|where /.test(command)) throw new Error('absent'); return ''; };
  const { HooksInstaller, SYSTEMS } = load({ exec });
  try {
    assert.equal(new HooksInstaller(dir).detectSystem(), SYSTEMS.HUSKY);
  } finally {
    restore();
    rm(dir);
  }
});

test('HooksInstaller.detectSystem chooses pre-commit for a Python project', () => {
  const dir = mkRepo();
  write(path.join(dir, 'pyproject.toml'), '');
  const exec = (command) => { if (/command -v|where /.test(command)) throw new Error('absent'); return ''; };
  const { HooksInstaller, SYSTEMS } = load({ exec });
  try {
    assert.equal(new HooksInstaller(dir).detectSystem(), SYSTEMS.PRECOMMIT);
  } finally {
    restore();
    rm(dir);
  }
});

test('HooksInstaller.detectSystem falls back to native for an unrecognised project', () => {
  const dir = mkRepo();
  const exec = (command) => { if (/command -v|where /.test(command)) throw new Error('absent'); return ''; };
  const { HooksInstaller, SYSTEMS } = load({ exec });
  try {
    assert.equal(new HooksInstaller(dir).detectSystem(), SYSTEMS.NATIVE);
  } finally {
    restore();
    rm(dir);
  }
});

test('HooksInstaller.status reports each subsystem and the detected default', () => {
  const dir = mkRepo();
  const exec = (command) => { if (/command -v|where /.test(command)) throw new Error('absent'); return ''; };
  const { HooksInstaller, SYSTEMS } = load({ exec });
  try {
    const status = new HooksInstaller(dir).status();
    assert.deepEqual(status, {
      husky: false,
      precommit: false,
      native: false,
      detected: SYSTEMS.NATIVE,
    });
  } finally {
    restore();
    rm(dir);
  }
});

test('HooksInstaller.install with an explicit native system installs native hooks', async () => {
  const dir = mkRepo();
  const { HooksInstaller } = load({ exec: router([]) });
  try {
    const results = await new HooksInstaller(dir).install('native');
    assert.ok(results.installed.includes('pre-commit'));
    assert.ok(fs.existsSync(path.join(dir, '.git', 'hooks', 'pre-commit')));
  } finally {
    restore();
    rm(dir);
  }
});

test('HooksInstaller.install with auto resolves to native on a bare repo', async () => {
  const dir = mkRepo();
  const exec = (command) => { if (/command -v|where /.test(command)) throw new Error('absent'); return ''; };
  const { HooksInstaller } = load({ exec });
  try {
    const results = await new HooksInstaller(dir).install('auto');
    assert.ok(results.installed.includes('pre-commit'), 'native install ran');
  } finally {
    restore();
    rm(dir);
  }
});

test('HooksInstaller.install throws on an unknown hook system', async () => {
  const dir = mkRepo();
  const { HooksInstaller } = load({ exec: router([]) });
  try {
    await assert.rejects(() => new HooksInstaller(dir).install('subversion'), /Unknown hook system: subversion/);
  } finally {
    restore();
    rm(dir);
  }
});

test('HooksInstaller.install dispatches to husky when system is husky', async () => {
  const dir = mkRepo();
  write(path.join(dir, 'package.json'), JSON.stringify({ name: 'x' }));
  fs.mkdirSync(path.join(dir, '.husky'));
  const { HooksInstaller } = load({ exec: router([]) });
  try {
    const results = await new HooksInstaller(dir).install('husky');
    assert.ok(results.installed.includes('pre-commit'), 'husky templates installed via dispatch');
  } finally {
    restore();
    rm(dir);
  }
});

test('HooksInstaller.install dispatches to pre-commit when system is pre-commit', async () => {
  const dir = mkRepo();
  write(path.join(dir, 'pyproject.toml'), '');
  const { HooksInstaller } = load({ exec: router([]) });
  try {
    const results = await new HooksInstaller(dir).install('pre-commit', 'python');
    assert.ok(results.installed.includes('.pre-commit-config.yaml'), 'pre-commit config created via dispatch');
  } finally {
    restore();
    rm(dir);
  }
});

test('HooksInstaller.uninstall tears down native CTOC hooks across all subsystems', async () => {
  const dir = mkRepo();
  const { HooksInstaller } = load({ exec: router([]) });
  try {
    const inst = new HooksInstaller(dir);
    await inst.install('native');
    assert.ok(fs.existsSync(path.join(dir, '.git', 'hooks', 'pre-commit')));
    inst.uninstall();
    assert.equal(fs.existsSync(path.join(dir, '.git', 'hooks', 'pre-commit')), false, 'native CTOC hook removed');
  } finally {
    restore();
    rm(dir);
  }
});

// ============================================================================
// exported constants
// ============================================================================

test('module exports the expected hook types and system identifiers', () => {
  const { HOOK_TYPES, SYSTEMS } = load();
  try {
    assert.deepEqual(HOOK_TYPES, ['pre-commit', 'pre-push', 'commit-msg', 'prepare-commit-msg', 'post-commit']);
    assert.deepEqual(SYSTEMS, { HUSKY: 'husky', PRECOMMIT: 'pre-commit', NATIVE: 'native' });
  } finally {
    restore();
  }
});
