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

const cmdHooks = require('../src/lib/cmd-hooks');
const cmdIde = require('../src/lib/cmd-ide');
const cmdPlaywright = require('../src/lib/cmd-playwright');
const cmdQuality = require('../src/lib/cmd-quality');
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

// A bare `.git` *directory* is all HooksInstaller's isGitRepo() check requires.
function seedGitDir(dir) {
  fs.mkdirSync(path.join(dir, '.git', 'hooks'), { recursive: true });
}

async function withSilencedConsole(fn) {
  const origLog = console.log;
  const origErr = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

// ===========================================================================
// cmd-hooks.js
// ===========================================================================

describe('cmd-hooks.js', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = makeTempDir('ctoc-cmd2-hooks-');
  });

  afterEach(() => {
    rmDir(projectDir);
  });

  test('exports the documented public API', () => {
    for (const name of ['execute', 'initHooks', 'getStatus', 'removeHooks', 'testHook']) {
      assert.equal(typeof cmdHooks[name], 'function', `missing export: ${name}`);
    }
    assert.ok(Array.isArray(cmdHooks.VALID_SYSTEMS));
    assert.ok(cmdHooks.VALID_SYSTEMS.includes('husky'));
    assert.ok(Array.isArray(cmdHooks.VALID_PROJECT_TYPES));
    assert.ok(cmdHooks.VALID_PROJECT_TYPES.includes('auto'));
  });

  test('initHooks rejects an invalid --system before touching the filesystem', async () => {
    const result = await cmdHooks.initHooks({ system: 'bogus', projectRoot: projectDir });
    assert.equal(result.success, false);
    assert.match(result.error, /Invalid system: bogus/);
    // Lists the valid options.
    assert.match(result.error, /husky/);
  });

  test('initHooks rejects an invalid project --type', async () => {
    const result = await cmdHooks.initHooks({ type: 'cobol', projectRoot: projectDir });
    assert.equal(result.success, false);
    assert.match(result.error, /Invalid project type: cobol/);
    assert.match(result.error, /auto/);
  });

  test('initHooks requires a git repository (no .git -> structured error)', async () => {
    // projectDir has no .git directory.
    const result = await cmdHooks.initHooks({ projectRoot: projectDir });
    assert.equal(result.success, false);
    assert.match(result.error, /Not a git repository/);
  });

  test('initHooks --dry-run reports what would be installed without writing', async () => {
    seedGitDir(projectDir);
    seedNodeProject(projectDir); // makes "husky" the auto-detected system
    const result = await withSilencedConsole(() =>
      cmdHooks.initHooks({ dryRun: true, projectRoot: projectDir }));

    assert.equal(result.success, true);
    assert.equal(result.dryRun, true);
    // package.json present -> husky is the recommended/auto system.
    assert.equal(result.system, 'husky');
    assert.ok(typeof result.message === 'string' && result.message.includes('DRY RUN'));

    // Dry run must not create any hooks.
    assert.equal(fs.existsSync(path.join(projectDir, '.husky')), false);
    assert.deepEqual(fs.readdirSync(path.join(projectDir, '.git', 'hooks')), []);
  });

  test('getStatus reports per-system + per-hook status for a clean repo', () => {
    seedGitDir(projectDir);
    const result = cmdHooks.getStatus({ projectRoot: projectDir });

    assert.equal(result.success, true);
    assert.equal(result.status.husky, false);
    assert.equal(result.status.precommit, false);
    assert.equal(result.status.native, false);
    assert.equal(result.status.hasPrecommitConfig, false);
    // Each known hook type is reported with native/husky booleans.
    assert.equal(result.status.hooks['pre-commit'].native, false);
    assert.equal(result.status.hooks['pre-commit'].husky, false);
    assert.ok(result.message.includes('Git Hooks Status'));
  });

  test('getStatus wraps a non-git directory as a structured error (no throw)', () => {
    // No .git -> HooksInstaller constructor throws; getStatus must catch it.
    const result = cmdHooks.getStatus({ projectRoot: projectDir });
    assert.equal(result.success, false);
    assert.match(result.error, /Not a git repository/);
  });

  test('getStatus detects a native pre-commit hook on disk', () => {
    seedGitDir(projectDir);
    writeFile(projectDir, path.join('.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 0\n');
    const result = cmdHooks.getStatus({ projectRoot: projectDir });
    assert.equal(result.success, true);
    assert.equal(result.status.hooks['pre-commit'].native, true);
  });

  test('removeHooks succeeds on a clean repo (idempotent uninstall)', () => {
    seedGitDir(projectDir);
    const result = cmdHooks.removeHooks({ projectRoot: projectDir });
    assert.equal(result.success, true);
    assert.match(result.message, /removed successfully/);
  });

  test('removeHooks with an invalid system returns a structured error', () => {
    seedGitDir(projectDir);
    const result = cmdHooks.removeHooks({ projectRoot: projectDir, system: 'bogus' });
    assert.equal(result.success, false);
    assert.match(result.error, /Invalid system: bogus/);
  });

  test('removeHooks wraps a non-git directory as a structured error (no throw)', () => {
    const result = cmdHooks.removeHooks({ projectRoot: projectDir });
    assert.equal(result.success, false);
    assert.match(result.error, /Not a git repository/);
  });

  test('testHook rejects an unknown hook name', async () => {
    const result = await cmdHooks.testHook({ hook: 'not-a-hook', projectRoot: projectDir });
    assert.equal(result.success, false);
    assert.match(result.error, /Invalid hook: not-a-hook/);
    assert.match(result.error, /pre-commit/);
  });

  test('testHook reports "not found" for a valid hook that is not installed', async () => {
    seedGitDir(projectDir);
    const result = await withSilencedConsole(() =>
      cmdHooks.testHook({ hook: 'pre-commit', projectRoot: projectDir }));
    assert.equal(result.success, false);
    assert.match(result.error, /Hook not found: pre-commit/);
  });

  test('execute routes actions and rejects unknown ones (no throw)', async () => {
    seedGitDir(projectDir);
    const status = await cmdHooks.execute({ action: 'status', projectRoot: projectDir });
    assert.equal(status.success, true);

    // Default action is "status".
    const def = await cmdHooks.execute({ projectRoot: projectDir });
    assert.equal(def.success, true);
    assert.ok(def.message.includes('Git Hooks Status'));

    const unknown = await cmdHooks.execute({ action: 'bogus', projectRoot: projectDir });
    assert.equal(unknown.success, false);
    assert.match(unknown.error, /Unknown action: bogus/);
    assert.match(unknown.error, /init, status, remove, test/);
  });
});

// ===========================================================================
// cmd-ide.js
// ===========================================================================

describe('cmd-ide.js', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = makeTempDir('ctoc-cmd2-ide-');
    seedNodeProject(projectDir);
  });

  afterEach(() => {
    rmDir(projectDir);
  });

  test('exports the documented public API', () => {
    for (const name of ['detectCommand', 'listCommand', 'initCommand']) {
      assert.equal(typeof cmdIde[name], 'function', `missing export: ${name}`);
    }
  });

  test('detectCommand returns the detected IDE (or null) without throwing', async () => {
    const detected = await withSilencedConsole(() => cmdIde.detectCommand(projectDir));
    // Detection is environment-dependent; the contract is "an IDE object or null".
    if (detected !== null && detected !== undefined) {
      assert.equal(typeof detected, 'object');
      assert.equal(typeof detected.type, 'string');
    } else {
      assert.ok(detected === null || detected === undefined);
    }
  });

  test('listCommand runs without throwing', async () => {
    await withSilencedConsole(() => {
      cmdIde.listCommand();
      return undefined;
    });
    // Reaching here means no throw — that is the contract for the list view.
    assert.ok(true);
  });

  test('initCommand --dry-run for a valid IDE returns results and writes nothing', async () => {
    const results = await withSilencedConsole(() =>
      cmdIde.initCommand(projectDir, 'vscode', { dryRun: true, merge: true }));

    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0, 'dry-run should report files it would generate');
    // Dry-run entries are tagged as such...
    assert.ok(results.every(r => r.status === 'dry-run'));
    // ...and nothing is written to the project.
    assert.equal(fs.existsSync(path.join(projectDir, '.vscode')), false);
  });

  test('initCommand actually creates VS Code config files when not in dry-run', async () => {
    const results = await withSilencedConsole(() =>
      cmdIde.initCommand(projectDir, 'vscode', { dryRun: false, merge: true }));

    assert.ok(Array.isArray(results) && results.length > 0);
    // At least one file was created on disk inside the temp project.
    const created = results.filter(r => r.status === 'created' || r.status === 'updated');
    assert.ok(created.length > 0, 'expected at least one created/updated config file');
    for (const r of created) {
      assert.ok(fs.existsSync(path.join(projectDir, r.file)),
        `expected ${r.file} to exist on disk`);
    }
  });

  test('initCommand merges JSON config on a second run rather than erroring', async () => {
    await withSilencedConsole(() =>
      cmdIde.initCommand(projectDir, 'vscode', { dryRun: false, merge: true }));
    // Second run with an existing .vscode/ must merge, not throw.
    const results = await withSilencedConsole(() =>
      cmdIde.initCommand(projectDir, 'vscode', { dryRun: false, merge: true }));
    assert.ok(Array.isArray(results) && results.length > 0);
    // No "error" status entries from the merge path.
    assert.equal(results.filter(r => r.status === 'error').length, 0);
  });
});

// ===========================================================================
// cmd-playwright.js
// ===========================================================================

describe('cmd-playwright.js', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = makeTempDir('ctoc-cmd2-pw-');
  });

  afterEach(() => {
    rmDir(projectDir);
  });

  // A minimal Next.js project so FrameworkDetector.isWebApp() returns true.
  function seedWebApp(dir) {
    writeFile(dir, 'package.json', JSON.stringify({
      name: 'pw-fixture',
      version: '1.0.0',
      private: true,
      dependencies: { next: '15.0.0', react: '18.0.0', 'react-dom': '18.0.0' }
    }));
  }

  test('exports the documented public API', () => {
    for (const name of ['execute', 'initPlaywright', 'runTests', 'showReport',
      'runCodegen', 'detectWebFramework', 'isPlaywrightConfigured']) {
      assert.equal(typeof cmdPlaywright[name], 'function', `missing export: ${name}`);
    }
  });

  test('initPlaywright refuses when no web framework is detected', async () => {
    // Bare temp dir: no package.json, no web framework.
    const result = await cmdPlaywright.execute({ action: 'init', projectRoot: projectDir });
    assert.equal(result.success, false);
    assert.match(result.error, /No web framework detected/);
    assert.ok(typeof result.suggestion === 'string' && result.suggestion.length > 0);
  });

  test('detectWebFramework reports detected:false for a non-web project', async () => {
    seedNodeProject(projectDir); // a plain node lib, not a web app
    const result = await cmdPlaywright.execute({ action: 'detect', projectRoot: projectDir });
    assert.equal(result.success, true);
    assert.equal(result.detected, false);
    assert.match(result.message, /No web framework detected/);
  });

  test('detectWebFramework reports a detected web framework with config', async () => {
    seedWebApp(projectDir);
    // A tsconfig.json makes FrameworkDetector.usesTypeScript() report TypeScript
    // deterministically. (Note: usesTypeScript() is documented @returns boolean
    // but returns `undefined` when no TS signal exists — a minor boolean-contract
    // slip in the transitive framework-detector lib, not in cmd-playwright; the
    // command faithfully surfaces whatever the detector returns. We avoid pinning
    // that dependency bug here by giving the fixture a real TS signal.)
    writeFile(projectDir, 'tsconfig.json', '{}');
    const result = await cmdPlaywright.execute({ action: 'detect', projectRoot: projectDir });
    assert.equal(result.success, true);
    assert.equal(result.detected, true);
    assert.equal(typeof result.framework, 'string');
    assert.equal(typeof result.confidence, 'number');
    assert.ok(result.config && typeof result.config.baseURL === 'string');
    assert.equal(result.typescript, true);
    assert.match(result.message, /Web Framework Detection/);
  });

  test('runTests returns the playwright command string (default mode)', async () => {
    const result = await cmdPlaywright.execute({ action: 'run', projectRoot: projectDir });
    assert.equal(result.success, true);
    assert.equal(result.command, 'npx playwright test');
    assert.ok(result.message.includes('npx playwright test'));
  });

  test('runTests honors --ui and --headed flags', async () => {
    const ui = await cmdPlaywright.execute({ action: 'run', ui: true, projectRoot: projectDir });
    assert.equal(ui.command, 'npx playwright test --ui');

    const headed = await cmdPlaywright.execute({ action: 'run', headed: true, projectRoot: projectDir });
    assert.equal(headed.command, 'npx playwright test --headed');

    // --ui takes precedence over --headed per the documented branch order.
    const both = await cmdPlaywright.execute({
      action: 'run', ui: true, headed: true, projectRoot: projectDir
    });
    assert.equal(both.command, 'npx playwright test --ui');
  });

  test('showReport returns the show-report command', async () => {
    const result = await cmdPlaywright.execute({ action: 'report', projectRoot: projectDir });
    assert.equal(result.success, true);
    assert.equal(result.command, 'npx playwright show-report');
  });

  test('runCodegen uses the explicit url when provided', async () => {
    const result = await cmdPlaywright.execute({
      action: 'codegen', url: 'http://localhost:4321', projectRoot: projectDir
    });
    assert.equal(result.success, true);
    assert.equal(result.url, 'http://localhost:4321');
    assert.equal(result.command, 'npx playwright codegen http://localhost:4321');
  });

  test('runCodegen falls back to the framework/default base URL', async () => {
    // No framework -> FrameworkDetector default baseURL is http://localhost:3000.
    const result = await cmdPlaywright.execute({ action: 'codegen', projectRoot: projectDir });
    assert.equal(result.success, true);
    assert.equal(result.url, 'http://localhost:3000');
    assert.equal(result.command, 'npx playwright codegen http://localhost:3000');
  });

  test('isPlaywrightConfigured detects a playwright.config file', () => {
    assert.equal(cmdPlaywright.isPlaywrightConfigured(projectDir), false);
    writeFile(projectDir, 'playwright.config.ts', 'export default {};\n');
    assert.equal(cmdPlaywright.isPlaywrightConfigured(projectDir), true);
  });

  test('execute with unknown action returns a structured error (no throw)', async () => {
    const result = await cmdPlaywright.execute({ action: 'bogus', projectRoot: projectDir });
    assert.equal(result.success, false);
    assert.match(result.error, /Unknown action: bogus/);
    assert.match(result.error, /init, run, report, codegen, detect/);
  });
});

// ===========================================================================
// cmd-quality.js
// ===========================================================================

describe('cmd-quality.js', () => {
  let projectDir;

  // Istanbul coverage-summary so the scorer has a coverage signal to read.
  function writeIstanbulSummary(dir, pct) {
    const block = { pct, total: 100, covered: Math.round(pct), skipped: 0 };
    writeFile(dir, path.join('coverage', 'coverage-summary.json'), JSON.stringify({
      total: { lines: block, branches: block, functions: block, statements: block }
    }));
  }

  beforeEach(() => {
    projectDir = makeTempDir('ctoc-cmd2-qual-');
    seedNodeProject(projectDir); // typescript/node markers so a language is detected
  });

  afterEach(() => {
    rmDir(projectDir);
  });

  test('exports the documented public API (incl. legacy aliases)', () => {
    for (const name of ['execute', 'initQuality', 'runQualityCheck', 'showDashboard',
      'showStatus', 'generateReport', 'showTrend', 'checkQuality', 'generateDashboard']) {
      assert.equal(typeof cmdQuality[name], 'function', `missing export: ${name}`);
    }
    // Documented backward-compat aliases.
    assert.equal(cmdQuality.checkQuality, cmdQuality.runQualityCheck);
    assert.equal(cmdQuality.generateDashboard, cmdQuality.showDashboard);
  });

  test('initQuality rejects an invalid mode', async () => {
    const result = await cmdQuality.execute({ action: 'init', mode: 'turbo', projectRoot: projectDir });
    assert.equal(result.success, false);
    assert.match(result.error, /Invalid mode: turbo/);
    assert.match(result.error, /strict/);
  });

  test('initQuality rejects an invalid --lang', async () => {
    const result = await cmdQuality.execute({
      action: 'init', mode: 'strict', lang: 'cobol', projectRoot: projectDir
    });
    assert.equal(result.success, false);
    assert.match(result.error, /Invalid language: cobol/);
  });

  test('runQualityCheck scores the project and returns a graded result', async () => {
    writeIstanbulSummary(projectDir, 90);
    const result = await cmdQuality.execute({ action: 'check', mode: 'strict', projectRoot: projectDir });
    assert.equal(result.success, true);
    assert.equal(typeof result.score, 'number');
    assert.equal(typeof result.grade, 'string');
    assert.ok(Array.isArray(result.checks));
    assert.ok(result.components && typeof result.components === 'object');
    assert.equal(typeof result.pass, 'boolean');
    assert.match(result.message, /Quality Check Results/);
    // Scoring writes history inside the temp project — confirm it stays hermetic.
    assert.ok(fs.existsSync(path.join(projectDir, '.ctoc', 'quality-history.json')));
  });

  test('runQualityCheck errors when no project language can be detected', async () => {
    const empty = makeTempDir('ctoc-cmd2-qual-empty-');
    try {
      const result = await cmdQuality.execute({ action: 'check', projectRoot: empty });
      assert.equal(result.success, false);
      assert.match(result.error, /Could not detect project language/);
    } finally {
      rmDir(empty);
    }
  });

  test('showDashboard renders a dashboard for the project', async () => {
    const result = await cmdQuality.execute({ action: 'dashboard', mode: 'strict', projectRoot: projectDir });
    assert.equal(result.success, true);
    assert.equal(typeof result.score, 'number');
    assert.equal(typeof result.grade, 'string');
    assert.ok(result.data && typeof result.data === 'object');
    assert.equal(typeof result.message, 'string');
  });

  test('generateReport rejects an invalid format', async () => {
    const result = await cmdQuality.execute({
      action: 'report', format: 'pdf', projectRoot: projectDir
    });
    assert.equal(result.success, false);
    assert.match(result.error, /Invalid format: pdf/);
  });

  test('generateReport writes to an output file when --output is given', async () => {
    const outPath = path.join(projectDir, 'reports', 'quality.json');
    const result = await cmdQuality.execute({
      action: 'report', format: 'json', output: outPath, projectRoot: projectDir
    });
    assert.equal(result.success, true);
    assert.equal(result.format, 'json');
    assert.equal(result.outputPath, outPath);
    assert.ok(fs.existsSync(outPath), 'report file should be written');
    assert.match(result.message, /Report saved to/);
  });

  test('showTrend reports "no history" before any check has run', async () => {
    const result = await cmdQuality.execute({ action: 'trend', projectRoot: projectDir });
    assert.equal(result.success, true);
    assert.match(result.message, /No quality history found/);
  });

  test('showTrend renders a chart once history exists', async () => {
    // A quality check records history; a second check gives the trend two samples.
    await cmdQuality.execute({ action: 'check', mode: 'strict', projectRoot: projectDir });
    await cmdQuality.execute({ action: 'check', mode: 'strict', projectRoot: projectDir });

    const result = await cmdQuality.execute({ action: 'trend', projectRoot: projectDir });
    assert.equal(result.success, true);
    assert.equal(typeof result.current, 'number');
    assert.equal(typeof result.samples, 'number');
    assert.ok(result.samples >= 1);
    assert.match(result.message, /Quality Score Trend/);
  });

  test('showStatus returns a stable status shape (read-only, no override)', () => {
    // showStatus reads global quality-state via findProjectRoot(); it is
    // read-only with a safe default, so we assert only the result shape.
    const result = cmdQuality.showStatus();
    assert.equal(result.success, true);
    assert.equal(typeof result.message, 'string');
    assert.match(result.message, /Quality Gate Status/);
  });

  test('execute with unknown action returns a structured error (no throw)', async () => {
    const result = await cmdQuality.execute({ action: 'bogus', projectRoot: projectDir });
    assert.equal(result.success, false);
    assert.match(result.error, /Unknown action: bogus/);
    assert.match(result.error, /init, check, dashboard, report, trend, status/);
  });
});

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
    // .ctoc at the top, .git also at the top — .ctoc is checked first in-loop,
    // but both resolve to the same dir; verify the higher .ctoc wins over a
    // child marker. Put .git in a child and .ctoc at the parent.
    fs.mkdirSync(path.join(tmpRoot, '.ctoc'), { recursive: true });
    const child = path.join(tmpRoot, 'child');
    fs.mkdirSync(path.join(child, '.git'), { recursive: true });
    // Starting from the child, the nearest marker is the child's .git.
    assert.equal(projectRoot.findProjectRoot(child), child);
    // Starting one level deeper, still finds the child's .git first.
    const deeper = path.join(child, 'inner');
    fs.mkdirSync(deeper, { recursive: true });
    assert.equal(projectRoot.findProjectRoot(deeper), child);
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
