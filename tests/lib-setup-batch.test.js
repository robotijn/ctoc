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

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const ciWizard = require('../src/lib/ci-wizard');
const { DashboardRenderer } = require('../src/lib/dashboard-renderer');
const hooksInstaller = require('../src/lib/hooks-installer');
const ideConfig = require('../src/lib/ide-config');
const autoFixer = require('../src/lib/auto-fixer');

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

describe('ci-wizard', () => {
  let dir;
  beforeEach(() => { dir = makeTempDir('ctoc-ci-'); });
  afterEach(cleanupAll);

  describe('constants', () => {
    it('exposes PROJECT_TYPES, STRICTNESS, COVERAGE_LEVELS, DEFAULT_CONFIG', () => {
      assert.equal(ciWizard.PROJECT_TYPES.NODE, 'node');
      assert.equal(ciWizard.PROJECT_TYPES.UNKNOWN, 'unknown');
      assert.equal(ciWizard.STRICTNESS.STRICT, 'strict');
      assert.equal(ciWizard.COVERAGE_LEVELS.STANDARD, 80);
      // DEFAULT_CONFIG documents the wizard's defaults.
      assert.equal(ciWizard.DEFAULT_CONFIG.coverage, 80);
      assert.equal(ciWizard.DEFAULT_CONFIG.linting, 'strict');
    });
  });

  describe('detectProjectType', () => {
    it('returns UNKNOWN for an empty project dir', () => {
      const info = ciWizard.detectProjectType(dir);
      assert.equal(info.type, ciWizard.PROJECT_TYPES.UNKNOWN);
      assert.deepEqual(info.frameworks, []);
      assert.equal(info.packageManager, null);
    });

    it('detects a plain Node.js project from package.json (npm default)', () => {
      writeJson(path.join(dir, 'package.json'), { name: 'demo', dependencies: {} });
      const info = ciWizard.detectProjectType(dir);
      assert.equal(info.type, ciWizard.PROJECT_TYPES.NODE);
      assert.equal(info.name, 'demo');
      assert.equal(info.packageManager, 'npm');
      assert.equal(info.hasTypeScript, false);
    });

    it('detects TypeScript via tsconfig.json and frameworks via deps', () => {
      writeJson(path.join(dir, 'package.json'), {
        name: 't', dependencies: { react: '18', next: '15' }
      });
      fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{}');
      const info = ciWizard.detectProjectType(dir);
      assert.equal(info.type, ciWizard.PROJECT_TYPES.TYPESCRIPT);
      assert.equal(info.hasTypeScript, true);
      assert.ok(info.frameworks.includes('React'));
      assert.ok(info.frameworks.includes('Next.js'));
    });

    it('detects package manager from lockfiles (pnpm > yarn > npm)', () => {
      writeJson(path.join(dir, 'package.json'), { name: 'p' });
      fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');
      assert.equal(ciWizard.detectProjectType(dir).packageManager, 'pnpm');
    });

    it('detects Python via requirements.txt', () => {
      fs.writeFileSync(path.join(dir, 'requirements.txt'), 'flask\n');
      const info = ciWizard.detectProjectType(dir);
      assert.equal(info.type, ciWizard.PROJECT_TYPES.PYTHON);
      assert.equal(info.packageManager, 'pip');
    });

    it('detects Go via go.mod and Rust via Cargo.toml', () => {
      const goDir = makeTempDir('ctoc-go-');
      fs.writeFileSync(path.join(goDir, 'go.mod'), 'module x\n');
      assert.equal(ciWizard.detectProjectType(goDir).type, ciWizard.PROJECT_TYPES.GO);

      const rustDir = makeTempDir('ctoc-rust-');
      fs.writeFileSync(path.join(rustDir, 'Cargo.toml'), '[package]\n');
      assert.equal(ciWizard.detectProjectType(rustDir).type, ciWizard.PROJECT_TYPES.RUST);
    });

    it('malformed package.json falls through without throwing', () => {
      fs.writeFileSync(path.join(dir, 'package.json'), '{ this is not json');
      // Documented: catch swallows the parse error and continues to other detectors.
      const info = ciWizard.detectProjectType(dir);
      assert.equal(info.type, ciWizard.PROJECT_TYPES.UNKNOWN);
    });
  });

  describe('generateGitHubActions', () => {
    it('produces a YAML workflow string with the CTOC banner and CI name', () => {
      const info = ciWizard.detectProjectType(dir); // UNKNOWN, still valid input
      const yaml = ciWizard.generateGitHubActions(info, ciWizard.DEFAULT_CONFIG);
      assert.equal(typeof yaml, 'string');
      assert.ok(yaml.startsWith('# Generated by CTOC CI Wizard'));
      assert.ok(yaml.includes('name: CI'));
      assert.ok(yaml.includes('actions/checkout@v4'));
    });

    it('emits strict lint flag --max-warnings 0 for a strict Node config', () => {
      const info = { type: ciWizard.PROJECT_TYPES.NODE, hasTypeScript: false, frameworks: [] };
      const cfg = { ...ciWizard.DEFAULT_CONFIG, linting: ciWizard.STRICTNESS.STRICT, ciSystem: 'github' };
      const yaml = ciWizard.generateGitHubActions(info, cfg);
      assert.ok(yaml.includes('--max-warnings 0'), 'strict linting must add --max-warnings 0');
      assert.ok(yaml.includes('npm ci'));
    });

    it('emits coverage threshold check when coverage > 0', () => {
      const info = { type: ciWizard.PROJECT_TYPES.NODE, hasTypeScript: false, frameworks: [] };
      const cfg = { ...ciWizard.DEFAULT_CONFIG, coverage: 80, ciSystem: 'github' };
      const yaml = ciWizard.generateGitHubActions(info, cfg);
      assert.ok(yaml.includes('Check coverage (80%)'));
    });
  });

  describe('generateGitLabCI', () => {
    it('produces a YAML string keyed by project image', () => {
      const info = { type: ciWizard.PROJECT_TYPES.PYTHON, hasTypeScript: false, frameworks: [] };
      const yaml = ciWizard.generateGitLabCI(info, ciWizard.DEFAULT_CONFIG);
      assert.ok(yaml.startsWith('# Generated by CTOC CI Wizard'));
      assert.ok(yaml.includes('image: python:3.11'));
      assert.ok(yaml.includes('stages:'));
    });
  });

  describe('generateCIConfig', () => {
    it('routes github config under .github/workflows/ci.yml', () => {
      const info = { type: ciWizard.PROJECT_TYPES.NODE, hasTypeScript: false, frameworks: [] };
      const cfg = { ...ciWizard.DEFAULT_CONFIG, ciSystem: 'github' };
      const result = ciWizard.generateCIConfig(dir, info, cfg);
      assert.equal(result.filePath, path.join(dir, '.github', 'workflows', 'ci.yml'));
      assert.ok(result.content.includes('name: CI'));
    });

    it('routes non-github (gitlab) config to .gitlab-ci.yml', () => {
      const info = { type: ciWizard.PROJECT_TYPES.NODE, hasTypeScript: false, frameworks: [] };
      const cfg = { ...ciWizard.DEFAULT_CONFIG, ciSystem: 'gitlab' };
      const result = ciWizard.generateCIConfig(dir, info, cfg);
      assert.equal(result.filePath, path.join(dir, '.gitlab-ci.yml'));
    });
  });

  describe('writeCIConfig', () => {
    it('creates intermediate directories and writes the file', () => {
      const target = path.join(dir, '.github', 'workflows', 'ci.yml');
      ciWizard.writeCIConfig(target, 'name: CI\n');
      assert.ok(fs.existsSync(target));
      assert.equal(fs.readFileSync(target, 'utf8'), 'name: CI\n');
    });
  });
});

// ===========================================================================
// dashboard-renderer.js
// ===========================================================================

describe('dashboard-renderer', () => {
  // A minimal but complete scoreData shape that render() and helpers consume.
  function makeScoreData(overrides = {}) {
    const component = (score, maxScore, metrics = {}) => ({ score, maxScore, metrics });
    return {
      overall: 87,
      grade: 'B',
      gradeInfo: { label: 'Good' },
      trend: { symbol: '+', change: 3 },
      recommendations: [{ action: 'Increase branch coverage' }],
      components: {
        coverage: component(80, 100, { branches: 90 }),
        lint: component(95, 100, { errors: 0 }),
        security: component(100, 100, { critical: 0, high: 0 }),
        complexity: { score: 70, maxScore: 100, metrics: {}, hotspotFiles: [] },
        architecture: component(85, 100, { violations: 0, cycles: 0 }),
        documentation: component(60, 100, {})
      },
      ...overrides
    };
  }

  describe('render', () => {
    it('renders a multi-section dashboard string containing the title', () => {
      const r = new DashboardRenderer(makeScoreData(), { colorMode: 'none', width: 80 });
      const out = r.render();
      assert.equal(typeof out, 'string');
      assert.ok(out.includes('CTOC QUALITY DASHBOARD'));
      assert.ok(out.includes('Overall Score: 87'));
      assert.ok(out.split('\n').length > 5, 'dashboard spans several lines');
    });

    it('surfaces issues when components report problems', () => {
      const data = makeScoreData();
      data.components.security.metrics.critical = 2;
      data.components.lint.metrics.errors = 4;
      const r = new DashboardRenderer(data, { colorMode: 'none' });
      const out = r.render();
      assert.ok(out.includes('2 critical vulnerabilities'));
    });

    it('shows the all-clear message when there are no issues', () => {
      const r = new DashboardRenderer(makeScoreData(), { colorMode: 'none' });
      const out = r.render();
      assert.ok(out.includes('No critical issues found!'));
    });
  });

  describe('color / colorMode', () => {
    it("colorMode 'none' emits no ANSI escape codes", () => {
      const r = new DashboardRenderer(makeScoreData(), { colorMode: 'none' });
      const colored = r.color('red', 'hello');
      assert.equal(colored, 'hello');
      // The whole rendered dashboard must be ANSI-free in 'none' mode.
      assert.ok(!/\x1b\[/.test(r.render()), 'no escape sequences in none mode');
    });

    it("colorMode 'full' wraps text in ANSI codes and reset", () => {
      const r = new DashboardRenderer(makeScoreData(), { colorMode: 'full' });
      const colored = r.color('red', 'hi');
      assert.ok(colored.startsWith('\x1b[31m'));
      assert.ok(colored.endsWith('\x1b[0m'));
    });

    it('unknown color name returns text unchanged (graceful degradation)', () => {
      const r = new DashboardRenderer(makeScoreData(), { colorMode: 'full' });
      assert.equal(r.color('chartreuse', 'x'), 'x');
    });
  });

  describe('stripAnsi', () => {
    it('removes ANSI color codes, leaving plain text', () => {
      const r = new DashboardRenderer(makeScoreData());
      assert.equal(r.stripAnsi('\x1b[31mred\x1b[0m'), 'red');
      assert.equal(r.stripAnsi('plain'), 'plain');
    });
  });

  describe('getGradeColor', () => {
    it('maps known grades and defaults unknown to white', () => {
      const r = new DashboardRenderer(makeScoreData());
      assert.equal(r.getGradeColor('A'), 'green');
      assert.equal(r.getGradeColor('F'), 'red');
      assert.equal(r.getGradeColor('Z'), 'white');
    });
  });

  describe('renderSparkline', () => {
    it('returns a dashed placeholder for empty input', () => {
      const r = new DashboardRenderer(makeScoreData(), { colorMode: 'none' });
      const spark = r.renderSparkline([], 10);
      assert.equal(spark, '-'.repeat(10));
    });

    it('renders one spark char per value (clamped to width)', () => {
      const r = new DashboardRenderer(makeScoreData(), { colorMode: 'none' });
      const spark = r.renderSparkline([1, 5, 9, 3], 20);
      // 4 values, all within width => 4 rendered chars.
      assert.equal([...spark].length, 4);
    });
  });

  describe('renderCompact / renderMini', () => {
    it('renderCompact yields a single-line summary with the score', () => {
      const r = new DashboardRenderer(makeScoreData(), { colorMode: 'none' });
      const compact = r.renderCompact();
      assert.ok(compact.includes('Quality:'));
      assert.ok(compact.includes('87'));
      assert.ok(!compact.includes('\n'), 'compact is single-line');
    });

    it('renderMini reports Cov/Lint/Sec percentages', () => {
      const r = new DashboardRenderer(makeScoreData(), { colorMode: 'none' });
      const mini = r.renderMini();
      assert.ok(mini.includes('Cov:'));
      assert.ok(mini.includes('Lint:'));
      assert.ok(mini.includes('Sec:'));
    });
  });
});

// ===========================================================================
// hooks-installer.js
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

describe('ide-config', () => {
  let dir;
  beforeEach(() => { dir = makeTempDir('ctoc-ide-'); });
  afterEach(cleanupAll);

  describe('IDE_TYPES', () => {
    it('describes vscode, jetbrains, vim, cursor with config dirs', () => {
      assert.equal(ideConfig.IDE_TYPES.vscode.configDir, '.vscode');
      assert.equal(ideConfig.IDE_TYPES.cursor.configDir, '.cursor');
      assert.equal(ideConfig.IDE_TYPES.jetbrains.configDir, '.idea');
      assert.equal(ideConfig.IDE_TYPES.vim.configDir, '.');
    });
  });

  describe('detectIDE', () => {
    const saved = {};
    const ENV_KEYS = [
      'TERM_PROGRAM', 'VSCODE_IPC_HOOK', 'VSCODE_GIT_IPC_HANDLE', 'CURSOR_CHANNEL',
      'TERMINAL_EMULATOR', 'JETBRAINS_REMOTE_RUN', 'VIM', 'NVIM', 'NVIM_LISTEN_ADDRESS'
    ];
    beforeEach(() => {
      for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
    });
    afterEach(() => {
      for (const k of ENV_KEYS) {
        if (saved[k] === undefined) { delete process.env[k]; } else { process.env[k] = saved[k]; }
      }
    });

    it('detects VS Code from TERM_PROGRAM', () => {
      process.env.TERM_PROGRAM = 'vscode';
      assert.equal(ideConfig.detectIDE(dir).type, 'vscode');
    });

    it('detects Cursor from CURSOR_CHANNEL', () => {
      process.env.CURSOR_CHANNEL = 'stable';
      assert.equal(ideConfig.detectIDE(dir).type, 'cursor');
    });

    it('returns null when no IDE env or config present', () => {
      assert.equal(ideConfig.detectIDE(dir), null);
    });

    it('falls back to project-config detection (.vscode dir)', () => {
      fs.mkdirSync(path.join(dir, '.vscode'));
      const result = ideConfig.detectIDE(dir);
      assert.equal(result.type, 'vscode');
    });
  });

  describe('readTemplate', () => {
    it('substitutes {{YEAR}} and {{DATE}} placeholders', () => {
      const tpl = path.join(dir, 'sample.template');
      fs.writeFileSync(tpl, 'year={{YEAR}} date={{DATE}}');
      const out = ideConfig.readTemplate(tpl);
      assert.ok(out.includes(`year=${new Date().getFullYear()}`));
      assert.ok(/date=\d{4}-\d{2}-\d{2}/.test(out));
      assert.ok(!out.includes('{{YEAR}}'));
    });

    it('throws when the template file is missing', () => {
      assert.throws(
        () => ideConfig.readTemplate(path.join(dir, 'nope.template')),
        /Template not found/
      );
    });
  });

  describe('parseJsonc', () => {
    it('parses JSON with line + block comments and trailing commas', () => {
      const jsonc = `{
        // a line comment
        "a": 1, /* block */
        "b": [1, 2,],
      }`;
      const parsed = ideConfig.parseJsonc(jsonc);
      assert.deepEqual(parsed, { a: 1, b: [1, 2] });
    });

    it('throws a descriptive error on unrecoverable JSON', () => {
      assert.throws(
        () => ideConfig.parseJsonc('{ "a": }'),
        /Failed to parse JSON/
      );
    });
  });

  describe('deepMerge', () => {
    it('merges nested objects and unions arrays uniquely', () => {
      const merged = ideConfig.deepMerge(
        { a: { x: 1 }, list: [1, 2] },
        { a: { y: 2 }, list: [2, 3] }
      );
      assert.deepEqual(merged.a, { x: 1, y: 2 });
      assert.deepEqual(merged.list, [1, 2, 3]);
    });
  });

  describe('mergeConfigs', () => {
    it('preserves existing user values while adding template keys', () => {
      const existing = '{ "editor.tabSize": 4 }';
      const template = '{ "editor.tabSize": 2, "editor.formatOnSave": true }';
      const out = ideConfig.mergeConfigs(existing, template);
      const obj = JSON.parse(out);
      // Existing user value takes precedence (deepMerge(template, existing)).
      assert.equal(obj['editor.tabSize'], 4);
      assert.equal(obj['editor.formatOnSave'], true);
    });

    it('throws on unparseable input', () => {
      assert.throws(
        () => ideConfig.mergeConfigs('{ broken', '{}'),
        /Merge failed/
      );
    });
  });

  describe('generateConfig', () => {
    it('throws on an unknown IDE type', () => {
      assert.throws(
        () => ideConfig.generateConfig(dir, 'emacs', {}),
        /Unknown IDE type/
      );
    });

    it('returns generated entries with name/path/content for a known IDE', () => {
      // Uses the real shipped vscode templates; assert the contract shape only.
      const generated = ideConfig.generateConfig(dir, 'vscode', {});
      assert.ok(Array.isArray(generated));
      assert.ok(generated.length > 0, 'vscode ships templates');
      for (const entry of generated) {
        assert.equal(typeof entry.name, 'string');
        assert.equal(typeof entry.content, 'string');
        // VS Code config files land under the .vscode config dir.
        assert.ok(entry.path.startsWith(path.join('.vscode')));
      }
    });
  });
});

// ===========================================================================
// auto-fixer.js
// ===========================================================================

describe('auto-fixer', () => {
  let dir;
  beforeEach(() => { dir = makeTempDir('ctoc-fix-'); });
  afterEach(cleanupAll);

  const { AutoFixer, AVAILABLE_FIXES, RISK_LEVELS, FIX_CATEGORIES } = autoFixer;

  describe('constants', () => {
    it('exposes RISK_LEVELS, FIX_CATEGORIES, and a populated fix registry', () => {
      assert.equal(RISK_LEVELS.safe, 'safe');
      assert.equal(RISK_LEVELS.high, 'high');
      assert.equal(FIX_CATEGORIES.linting, 'linting');
      assert.ok(Object.keys(AVAILABLE_FIXES).length > 0);
      // Every registered fix declares the documented contract fields.
      for (const fix of Object.values(AVAILABLE_FIXES)) {
        assert.equal(typeof fix.id, 'string');
        assert.equal(typeof fix.detector, 'function');
        assert.equal(typeof fix.fixer, 'function');
        assert.ok(Object.values(RISK_LEVELS).includes(fix.risk));
      }
    });
  });

  describe('detectAvailableFixes', () => {
    it('detects no fixes in a truly empty project except universal ones', () => {
      const fixer = new AutoFixer(dir);
      const available = fixer.detectAvailableFixes();
      assert.ok(Array.isArray(available));
      // .gitignore + .editorconfig fixes target '*' and apply to any dir lacking them.
      const ids = available.map(f => f.id);
      assert.ok(ids.includes('add-editorconfig'),
        'editorconfig fix is offered when .editorconfig is absent');
      assert.ok(ids.includes('update-gitignore'),
        'gitignore fix is offered when .gitignore is absent/incomplete');
    });

    it('detects add-test-script for a package.json without a real test script', () => {
      writeJson(path.join(dir, 'package.json'), {
        name: 'x', scripts: { test: 'echo "Error: no test specified" && exit 1' }
      });
      const fixer = new AutoFixer(dir);
      const ids = fixer.detectAvailableFixes().map(f => f.id);
      assert.ok(ids.includes('add-test-script'));
    });

    it('does not crash when a detector encounters malformed files', () => {
      // Malformed tsconfig.json — the strict-mode detector catches and returns false.
      fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{ not json');
      const fixer = new AutoFixer(dir);
      assert.doesNotThrow(() => fixer.detectAvailableFixes());
    });
  });

  describe('runFixes (dry-run)', () => {
    it('reports planned changes without touching the filesystem', async () => {
      const fixer = new AutoFixer(dir);
      const results = await fixer.runFixes(['add-editorconfig'], { dryRun: true, createCheckpoint: false });
      assert.equal(results.dryRun, true);
      assert.equal(results.summary.total, 1);
      assert.equal(results.summary.success, 1);
      // Dry-run must not create the file.
      assert.ok(!fs.existsSync(path.join(dir, '.editorconfig')));
    });

    it('marks an unknown fix id as skipped', async () => {
      const fixer = new AutoFixer(dir);
      const results = await fixer.runFixes(['no-such-fix'], { dryRun: true, createCheckpoint: false });
      assert.equal(results.summary.skipped, 1);
      assert.equal(results.fixes[0].status, 'skipped');
    });
  });

  describe('runFixes (applied)', () => {
    it('creates .editorconfig when applied', async () => {
      const fixer = new AutoFixer(dir);
      const results = await fixer.runFixes(['add-editorconfig'], { dryRun: false, createCheckpoint: false });
      assert.equal(results.summary.success, 1);
      const cfgPath = path.join(dir, '.editorconfig');
      assert.ok(fs.existsSync(cfgPath));
      assert.ok(fs.readFileSync(cfgPath, 'utf8').includes('root = true'));
    });

    it('refuses to overwrite an existing config file (reports failure, not throw)', async () => {
      fs.writeFileSync(path.join(dir, '.editorconfig'), 'root = true\n# mine\n');
      const fixer = new AutoFixer(dir);
      const results = await fixer.runFixes(['add-editorconfig'], { dryRun: false, createCheckpoint: false });
      // writeConfigFile returns success:false when the file already exists.
      assert.equal(results.summary.failed, 1);
      assert.ok(fs.readFileSync(path.join(dir, '.editorconfig'), 'utf8').includes('# mine'),
        'user file untouched');
    });
  });

  describe('runSafeFixes', () => {
    it('runs only safe-risk fixes', async () => {
      const fixer = new AutoFixer(dir);
      const results = await fixer.runSafeFixes({ dryRun: true, createCheckpoint: false });
      assert.ok(results.summary.total >= 1);
      // All executed fixes were drawn from the safe set: confirm via registry risk.
      for (const f of results.fixes) {
        const def = Object.values(AVAILABLE_FIXES).find(d => d.id === f.id);
        if (def) { assert.equal(def.risk, RISK_LEVELS.safe); }
      }
    });
  });

  describe('createGitCheckpoint', () => {
    it('returns false when not inside a git repo (graceful, no throw)', () => {
      const fixer = new AutoFixer(dir);
      assert.equal(fixer.createGitCheckpoint(), false);
    });
  });

  describe('generateReport', () => {
    it('formats a human-readable report from results', async () => {
      const fixer = new AutoFixer(dir);
      const results = await fixer.runFixes(['add-editorconfig'], { dryRun: true, createCheckpoint: false });
      const report = fixer.generateReport(results);
      assert.equal(typeof report, 'string');
      assert.ok(report.includes('Auto-Fix Report'));
      assert.ok(report.includes('DRY RUN'));
      assert.ok(report.includes('Total: 1'));
    });
  });
});
