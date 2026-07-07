/**
 * CTOC OM2 — opus-pack hooks ported to cross-platform Node hooks
 *
 * Drives the THREE real hook processes as subprocesses and asserts real exit
 * codes (never re-implements the logic in-test — a green run must mean the real
 * hook behaves). Contracts, per event type (verified against the on-disk
 * siblings, NOT copied blindly from the pack's uniform exit-2):
 *
 *   PreToolUse.Bash.js (blocklist fold)  — input via env CLAUDE_TOOL_INPUT,
 *       exit 0 = ALLOW, exit 1 = BLOCK  (matches the existing Bash gate).
 *   guard-files.js (PreToolUse)          — input via env CLAUDE_TOOL_INPUT AND
 *       stdin JSON, exit 0 = ALLOW, exit 1 = BLOCK, fail-OPEN (0) on error
 *       (matches PreToolUse.Edit.js).
 *   stop-test-gate.js (Stop)             — exit 0 = ALLOW/fail-open,
 *       exit 2 = BLOCK the stop (matches andon-halt.js).
 *
 * Run with: node --test tests/opuspack-hooks.test.js
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const BASH_HOOK = path.join(REPO, 'src', 'hooks', 'PreToolUse.Bash.js');
const GUARD_FILES_HOOK = path.join(REPO, 'src', 'hooks', 'guard-files.js');
const STOP_GATE_HOOK = path.join(REPO, 'src', 'hooks', 'stop-test-gate.js');
const stateManager = require(path.join(REPO, 'src', 'lib', 'state-manager'));

// ─────────────────────────────────────────────────────────────────────
//  Hermetic project + signed-state harness (mirrors security-bash-hook.test)
// ─────────────────────────────────────────────────────────────────────

let project;

function makeProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-opuspack-')));
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# CTOC Project Instructions\n');
  for (const stage of ['vision', 'functional', 'implementation', 'todo', 'review', 'done']) {
    fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  }
  return dir;
}

function cleanupProject(dir) {
  if (!dir) return;
  try { fs.rmSync(stateManager.getStatePath(dir), { force: true }); } catch { /* none */ }
  fs.rmSync(dir, { recursive: true, force: true });
}

function setState(step, feature = 'opuspack-test-feature') {
  const state = stateManager.createState(project, feature, 'javascript', null);
  state.currentStep = step;
  stateManager.saveState(project, state);
}

// ── Bash blocklist harness ─────────────────────────────────────────────

function runBash(command) {
  return spawnSync(process.execPath, [BASH_HOOK], {
    cwd: project,
    env: { ...process.env, CLAUDE_TOOL_INPUT: JSON.stringify({ command }) },
    encoding: 'utf8',
  });
}

function assertBashBlocked(command) {
  const res = runBash(command);
  assert.equal(res.signal, null, `hook crashed on ${JSON.stringify(command)}`);
  assert.equal(res.status, 1,
    `expected BLOCK (1) for ${JSON.stringify(command)}, got ${res.status}\n${res.stdout || ''}`);
}

function assertBashAllowed(command) {
  const res = runBash(command);
  assert.equal(res.signal, null, `hook crashed on ${JSON.stringify(command)}`);
  assert.equal(res.status, 0,
    `expected ALLOW (0) for ${JSON.stringify(command)}, got ${res.status}\n${res.stdout || ''}`);
}

// ── guard-files harness ────────────────────────────────────────────────

/** Deliver payload via BOTH env CLAUDE_TOOL_INPUT and stdin JSON. */
function runGuardFiles({ file_path, command, rawStdin } = {}) {
  const toolInput = {};
  if (file_path !== undefined) toolInput.file_path = file_path;
  if (command !== undefined) toolInput.command = command;
  const stdin = rawStdin !== undefined
    ? rawStdin
    : JSON.stringify({ tool_name: command !== undefined ? 'Bash' : 'Read', tool_input: toolInput });
  return spawnSync(process.execPath, [GUARD_FILES_HOOK], {
    cwd: project,
    env: { ...process.env, CLAUDE_TOOL_INPUT: JSON.stringify(toolInput) },
    input: stdin,
    encoding: 'utf8',
  });
}

// ── stop-test-gate harness ─────────────────────────────────────────────

/**
 * Build a hermetic project whose npm-style `scripts.test` points at a tiny
 * node script that exits `exitCode`. `stopTestGate` toggles the opt-in setting.
 * Returns { dir }.
 */
function makeStopProject({ testExit, stopTestGate, noSuite } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-stopgate-')));
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ctoc', 'state'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# CTOC Project Instructions\n');
  fs.writeFileSync(path.join(dir, '.git-marker'), 'x'); // help project-root find it
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });

  if (!noSuite) {
    // A test runner script that exits with the desired code.
    fs.writeFileSync(path.join(dir, 'run-suite.js'), `process.exit(${testExit});\n`);
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'stopgate-fixture',
      scripts: { test: `node run-suite.js` },
    }, null, 2));
  } else {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'stopgate-fixture-nosuite',
    }, null, 2));
  }

  const settings = stopTestGate === undefined
    ? 'general:\n  other: true\n'
    : `general:\n  stopTestGate: ${stopTestGate}\n`;
  fs.writeFileSync(path.join(dir, '.ctoc', 'settings.yaml'), settings);
  return dir;
}

function runStopGate(dir, extraEnv = {}) {
  return spawnSync(process.execPath, [STOP_GATE_HOOK], {
    cwd: dir,
    env: { ...process.env, ...extraEnv },
    input: JSON.stringify({ hook_event_name: 'Stop' }),
    encoding: 'utf8',
  });
}

function readFailCounter(dir) {
  const p = path.join(dir, '.ctoc', 'state', '.test-gate-fails');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')).fails; } catch { return null; }
}

beforeEach(() => { project = makeProject(); });
afterEach(() => { cleanupProject(project); project = null; });

// ═══════════════════════════════════════════════════════════════════════
//  BLOCKLIST (Bash fold) — exit 1 on hit, 0 on miss
// ═══════════════════════════════════════════════════════════════════════

describe('OM2 blocklist fold — irreversible commands blocked (exit 1)', () => {
  beforeEach(() => setState(10)); // step >= 8 so write gate never interferes

  it('force push (all forms)', () => {
    assertBashBlocked('git push --force');
    assertBashBlocked('git push -f');
    assertBashBlocked('git push --force-with-lease');
    assertBashBlocked('git push origin main --force');
  });

  it('reset --hard', () => {
    assertBashBlocked('git reset --hard');
    assertBashBlocked('git reset --hard HEAD~1');
  });

  it('clean -f family', () => {
    assertBashBlocked('git clean -fd');
    assertBashBlocked('git clean -f');
    assertBashBlocked('git clean -xdf');
  });

  it('checkout .', () => {
    assertBashBlocked('git checkout .');
  });

  it('branch/push delete', () => {
    assertBashBlocked('git branch -D feature');
    assertBashBlocked('git push origin --delete feature');
  });

  it('rm -rf variants', () => {
    assertBashBlocked('rm -rf /tmp/x');
    assertBashBlocked('rm -fr x');
    assertBashBlocked('rm -rf .');
  });

  it('SQL destructive', () => {
    assertBashBlocked('DROP TABLE users;');
    assertBashBlocked('DROP DATABASE app');
    assertBashBlocked('TRUNCATE TABLE t');
    assertBashBlocked('DELETE FROM t;');
  });

  it('terraform destroy', () => {
    assertBashBlocked('terraform destroy');
  });

  it('kubectl delete ns/deploy/pvc', () => {
    assertBashBlocked('kubectl delete namespace ns');
    assertBashBlocked('kubectl delete deployment d');
    assertBashBlocked('kubectl delete pvc p');
  });

  it('disk / permission destroyers', () => {
    assertBashBlocked('mkfs.ext4 /dev/sdb');
    assertBashBlocked('dd if=/dev/zero of=x');
    assertBashBlocked('echo x > /dev/sda');
    assertBashBlocked('chmod -R 777 .');
  });
});

describe('OM2 blocklist fold — benign commands allowed (exit 0)', () => {
  beforeEach(() => setState(10)); // step >= 8

  it('read-only / safe commands pass', () => {
    assertBashAllowed('git status');
    assertBashAllowed('ls -la');
    assertBashAllowed('node --test');
    assertBashAllowed('rm file.txt');       // no -rf
    assertBashAllowed('git checkout main');  // not `checkout .`
  });

  // CRITICAL: the fold must NOT block a NORMAL commit/push. At step >= 15 the
  // existing commit gate allows commit/push; the blocklist must not intercept
  // ordinary git add / commit / push.
  it('NORMAL git commit / push / add are NOT blocked by the blocklist', () => {
    setState(15); // commit gate allows at step >= 15
    assertBashAllowed('git add -A');
    assertBashAllowed('git add .');            // add . is fine (only checkout . is destructive)
    assertBashAllowed('git commit -m "msg"');
    assertBashAllowed('git push origin main');
    assertBashAllowed('git push');
  });

  it('commit before step 15 is blocked by the EXISTING commit gate, not the blocklist', () => {
    // At step 10 the existing commit gate blocks (exit 1). This proves the
    // blocklist did not accidentally allow-through; the block comes from the
    // step-15 gate. (Behavioral: still exit 1, but for the right reason.)
    setState(10);
    assertBashBlocked('git commit -m x');
  });
});

// ═══════════════════════════════════════════════════════════════════════
//  SECRET GUARD (guard-files.js) — exit 1 on hit, 0 on miss, fail-open
// ═══════════════════════════════════════════════════════════════════════

describe('OM2 guard-files — secret file_path blocked (exit 1)', () => {
  const cases = [
    '/proj/.env',
    '/proj/.env.local',
    '/home/u/.ssh/id_rsa',
    '/home/u/.ssh/id_ed25519',
    '/proj/server.pem',
    '/proj/private.key',
    '/proj/config/secrets.yaml',
    '/proj/config/secrets.json',
    '/home/u/.aws/credentials',
    '/home/u/.kube/config',
    '/proj/api_token.txt',
  ];
  for (const fp of cases) {
    it(`blocks file_path ${fp}`, () => {
      const res = runGuardFiles({ file_path: fp });
      assert.equal(res.status, 1, `expected BLOCK for ${fp}, got ${res.status}\n${res.stderr}`);
    });
  }
});

describe('OM2 guard-files — secret Bash command blocked (exit 1)', () => {
  it('blocks cat .env', () => {
    const res = runGuardFiles({ command: 'cat .env' });
    assert.equal(res.status, 1, res.stderr);
  });
  it('blocks grep of secrets.json', () => {
    const res = runGuardFiles({ command: 'grep KEY config/secrets.json' });
    assert.equal(res.status, 1, res.stderr);
  });
});

describe('OM2 guard-files — non-secret allowed (exit 0)', () => {
  it('allows a normal source file', () => {
    const res = runGuardFiles({ file_path: '/proj/src/app.js' });
    assert.equal(res.status, 0, res.stderr);
  });
  it('allows a benign command', () => {
    const res = runGuardFiles({ command: 'ls -la' });
    assert.equal(res.status, 0, res.stderr);
  });
});

describe('OM2 guard-files — cross-platform + fail-open', () => {
  it('blocks a Windows backslash secret path (separator normalization)', () => {
    const res = runGuardFiles({ file_path: 'C:\\Users\\x\\.ssh\\id_rsa' });
    assert.equal(res.status, 1, res.stderr);
  });
  it('fails OPEN (exit 0) on malformed stdin with no env', () => {
    const res = spawnSync(process.execPath, [GUARD_FILES_HOOK], {
      cwd: project,
      env: { ...process.env, CLAUDE_TOOL_INPUT: '' },
      input: 'not json at all',
      encoding: 'utf8',
    });
    assert.equal(res.status, 0, `fail-open expected, got ${res.status}\n${res.stderr}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════
//  STOP TEST-GATE (stop-test-gate.js) — exit 2 = block, 0 = allow
// ═══════════════════════════════════════════════════════════════════════

describe('OM2 stop-test-gate — opt-in default OFF', () => {
  it('exits 0 when stopTestGate is not set (default OFF, no suite run)', () => {
    const dir = makeStopProject({ testExit: 1, stopTestGate: undefined });
    const res = runStopGate(dir);
    assert.equal(res.status, 0, `default-off must exit 0, got ${res.status}\n${res.stderr}`);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('exits 0 when stopTestGate: false explicitly', () => {
    const dir = makeStopProject({ testExit: 1, stopTestGate: false });
    const res = runStopGate(dir);
    assert.equal(res.status, 0, res.stderr);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('OM2 stop-test-gate — enabled behavior', () => {
  it('GREEN suite -> exit 0, counter cleared', () => {
    const dir = makeStopProject({ testExit: 0, stopTestGate: true });
    fs.writeFileSync(path.join(dir, '.ctoc', 'state', '.test-gate-fails'),
      JSON.stringify({ fails: 2 }));
    const res = runStopGate(dir);
    assert.equal(res.status, 0, `green must allow, got ${res.status}\n${res.stderr}`);
    assert.equal(readFailCounter(dir), null, 'counter must be cleared on green');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('RED suite attempt 1 -> exit 2, counter = 1', () => {
    const dir = makeStopProject({ testExit: 1, stopTestGate: true });
    const res = runStopGate(dir);
    assert.equal(res.status, 2, `red must block, got ${res.status}\n${res.stderr}`);
    assert.equal(readFailCounter(dir), 1);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('RED suite attempt 2 -> exit 2, counter = 2', () => {
    const dir = makeStopProject({ testExit: 1, stopTestGate: true });
    fs.writeFileSync(path.join(dir, '.ctoc', 'state', '.test-gate-fails'),
      JSON.stringify({ fails: 1 }));
    const res = runStopGate(dir);
    assert.equal(res.status, 2, res.stderr);
    assert.equal(readFailCounter(dir), 2);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('RED suite 3rd attempt -> stand down (exit 0), counter cleared, honest-report message', () => {
    const dir = makeStopProject({ testExit: 1, stopTestGate: true });
    fs.writeFileSync(path.join(dir, '.ctoc', 'state', '.test-gate-fails'),
      JSON.stringify({ fails: 2 }));
    const res = runStopGate(dir);
    assert.equal(res.status, 0, `3rd red must stand down (0), got ${res.status}\n${res.stderr}`);
    assert.equal(readFailCounter(dir), null, 'counter cleared after stand-down');
    assert.match(res.stderr, /3 attempts|honest/i, 'must name 3 attempts / honest report');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('CTOC_SKIP_TEST_GATE=1 -> exit 0 even with a red suite', () => {
    const dir = makeStopProject({ testExit: 1, stopTestGate: true });
    const res = runStopGate(dir, { CTOC_SKIP_TEST_GATE: '1' });
    assert.equal(res.status, 0, res.stderr);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('no suite found -> exit 0', () => {
    const dir = makeStopProject({ noSuite: true, stopTestGate: true });
    const res = runStopGate(dir);
    assert.equal(res.status, 0, `no-suite must allow, got ${res.status}\n${res.stderr}`);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════
//  STRUCTURAL / REGRESSION GUARDS
// ═══════════════════════════════════════════════════════════════════════

describe('OM2 structural guards', () => {
  it('PreToolUse.Bash.js contains NO allow-commit sentinel (sentinel NOT ported)', () => {
    const src = fs.readFileSync(BASH_HOOK, 'utf8');
    assert.ok(!src.includes('allow-commit'),
      'the .claude/allow-commit sentinel must NOT be ported (CTOC gates commits already)');
  });

  it('no .sh file added to src/hooks/', () => {
    const files = fs.readdirSync(path.join(REPO, 'src', 'hooks'));
    const shFiles = files.filter(f => f.endsWith('.sh'));
    assert.equal(shFiles.length, 0, `no .sh files allowed, found: ${shFiles.join(', ')}`);
  });

  it('the two new hooks are .js and exist', () => {
    assert.ok(fs.existsSync(GUARD_FILES_HOOK), 'guard-files.js must exist');
    assert.ok(fs.existsSync(STOP_GATE_HOOK), 'stop-test-gate.js must exist');
    assert.ok(GUARD_FILES_HOOK.endsWith('.js'));
    assert.ok(STOP_GATE_HOOK.endsWith('.js'));
  });

  it('stop-test-gate counter path uses path.join (no hardcoded posix separator literal)', () => {
    const src = fs.readFileSync(STOP_GATE_HOOK, 'utf8');
    assert.ok(src.includes('path.join'), 'must build paths with path.join');
    assert.ok(!/['"]\.ctoc\/state\/\.test-gate-fails['"]/.test(src),
      'must not hardcode a posix-joined counter path string');
  });

  it('guard-files.js exports its pure matcher for testing', () => {
    const mod = require(GUARD_FILES_HOOK);
    assert.equal(typeof mod.isSecretTarget, 'function');
    assert.ok(Array.isArray(mod.PROTECTED_PATTERNS));
    assert.equal(mod.isSecretTarget('/x/.env'), true);
    assert.equal(mod.isSecretTarget('/x/app.js'), false);
  });
});
