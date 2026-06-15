/**
 * CTOC Security Test — PreToolUse.Bash gate (the REAL hook process)
 *
 * Unlike tests/hooks.test.js (which re-implements the regexes inside the test
 * and therefore can never catch a real bug in the hook), this file SPAWNS the
 * actual src/hooks/PreToolUse.Bash.js process and asserts its real exit code:
 *
 *   exit 0  -> command ALLOWED
 *   exit 1  -> command BLOCKED
 *
 * Contract discovered from source + empirical probe (do NOT change these — they
 * are the hook's real behavior, asserted so regressions surface):
 *
 *   INPUT: the hook reads the command from the environment variable
 *          CLAUDE_TOOL_INPUT (a JSON string with a `command` field) via
 *          getCommand(). It does NOT read stdin. A missing/empty command -> 0.
 *
 *   STATE: loadState(process.cwd()) reads a *signed* state file at
 *          ~/.ctoc/state/<hash16(cwd)>.json (HMAC with the local install
 *          secret). We plant valid signed state with the real state-manager so
 *          the child verifies it. cwd is realpath'd because macOS /tmp is a
 *          symlink and the child's process.cwd() resolves the real path, which
 *          is what hashPath() keys on.
 *
 *   WRITE GATE (isWriteCommand): blocked when there is no state / no feature,
 *          OR when currentStep < 8. Allowed when feature is set and step >= 8.
 *
 *   COMMIT GATE (isCommitCommand, GIT_COMMIT_PATTERN = /^\s*git\s+(commit|push)/):
 *          checked BEFORE the write/feature check. Blocked when currentStep < 15,
 *          allowed when step >= 15 (regardless of feature).
 *
 * The hook does NOT export isWriteCommand/isCommitCommand (no module.exports),
 * so those helpers are exercised through the spawned process, not by require.
 *
 * Some BYPASS-SURFACE assertions are EXPECTED TO FAIL — they document real
 * security gaps in the anchored GIT_COMMIT_PATTERN. Failing here is the point:
 * a green run would mean the gap was silently accepted. See the report.
 *
 * Run with: node --test tests/security-bash-hook.test.js
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const HOOK = path.join(REPO, 'src', 'hooks', 'PreToolUse.Bash.js');
const stateManager = require(path.join(REPO, 'src', 'lib', 'state-manager'));

// Step thresholds (mirrors the hook constants; asserted via behavior below).
const MINIMUM_STEP_FOR_WRITE = 8;
const MINIMUM_STEP_FOR_COMMIT = 15;

// --- hermetic project + signed-state harness -------------------------------

let project;

/** Create a hermetic CTOC project in a temp dir (realpath'd for macOS /tmp). */
function makeProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-bash-hook-')));
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# CTOC Project Instructions\n');
  for (const stage of ['vision', 'functional', 'implementation', 'todo', 'review', 'done']) {
    fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  }
  return dir;
}

/** Remove the temp project AND its out-of-tree signed state file. */
function cleanupProject(dir) {
  if (!dir) return;
  try {
    const statePath = stateManager.getStatePath(dir);
    fs.rmSync(statePath, { force: true });
  } catch { /* state may not exist */ }
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Plant a valid, signed Iron-Loop state for `project`.
 * @param {number} step  currentStep value.
 * @param {string|null} feature  feature name (null => "no feature context").
 */
function setState(step, feature = 'security-test-feature') {
  const state = stateManager.createState(project, feature, 'javascript', null);
  state.currentStep = step;
  stateManager.saveState(project, state);
}

/**
 * Run the REAL hook against `command`, returning the process exit status.
 * Command is delivered via CLAUDE_TOOL_INPUT (the hook's real input channel).
 */
function runHook(command) {
  return runHookRaw(JSON.stringify({ command }));
}

/** Run the hook with an arbitrary raw CLAUDE_TOOL_INPUT payload. */
function runHookRaw(rawToolInput) {
  const res = spawnSync(process.execPath, [HOOK], {
    cwd: project,
    env: { ...process.env, CLAUDE_TOOL_INPUT: rawToolInput },
    encoding: 'utf8'
  });
  return res;
}

/** Assert the hook BLOCKED the command (exit 1). */
function assertBlocked(command, msg) {
  const res = runHook(command);
  assert.equal(res.signal, null, `hook crashed (signal) on ${JSON.stringify(command)}`);
  assert.equal(
    res.status,
    1,
    `${msg || 'expected BLOCK'} for ${JSON.stringify(command)} (got exit ${res.status})\n${res.stdout || ''}`
  );
}

/** Assert the hook ALLOWED the command (exit 0). */
function assertAllowed(command, msg) {
  const res = runHook(command);
  assert.equal(res.signal, null, `hook crashed (signal) on ${JSON.stringify(command)}`);
  assert.equal(
    res.status,
    0,
    `${msg || 'expected ALLOW'} for ${JSON.stringify(command)} (got exit ${res.status})\n${res.stdout || ''}`
  );
}

beforeEach(() => { project = makeProject(); });
afterEach(() => { cleanupProject(project); project = null; });

// ---------------------------------------------------------------------------
// CONTRACT 0 — input channel is CLAUDE_TOOL_INPUT, not stdin
// ---------------------------------------------------------------------------

describe('Bash gate — input channel contract', () => {
  it('reads the command from CLAUDE_TOOL_INPUT env (not stdin)', () => {
    setState(5); // write phase => touch must be blocked IF the command is seen
    // Delivered correctly via env -> blocked.
    assertBlocked('touch evidence.txt', 'env-delivered write should be blocked at step 5');

    // Same command delivered ONLY via stdin (env cleared) -> the hook never
    // sees it and allows (exit 0). This documents that stdin is NOT a channel.
    const res = spawnSync(process.execPath, [HOOK], {
      cwd: project,
      env: { ...process.env, CLAUDE_TOOL_INPUT: '' },
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'touch evidence.txt' } }),
      encoding: 'utf8'
    });
    assert.equal(res.status, 0, 'stdin is not an input channel; command is invisible -> allowed');
  });
});

// ---------------------------------------------------------------------------
// CONTRACT 1 — write-command classification
// ---------------------------------------------------------------------------

describe('Bash gate — write-command classification (step 5: planning, must block writes)', () => {
  beforeEach(() => setState(5)); // feature set, step < 8 => isWriteCommand triggers step block

  const writeCommands = [
    'tee file.txt',
    'tee -a logfile.txt',
    'dd if=/dev/zero of=out.bin bs=1M count=1',
    'truncate -s 0 file.txt',
    'echo x > f',
    'cat a >> b',
    'touch newfile.txt',
    'install -m 755 s.sh /usr/bin/',
    'patch -p1 < changes.patch',
    'sed -i s/a/b/ f',
    'perl -i -pe s/a/b/ f'
  ];
  for (const cmd of writeCommands) {
    it(`classifies as WRITE and blocks: ${cmd}`, () => {
      assertBlocked(cmd, 'write command must be blocked before step 8');
    });
  }
});

describe('Bash gate — read-only commands are NOT writes (step 5, allowed)', () => {
  beforeEach(() => setState(5));

  const readOnly = [
    'ls -la',
    'cat file.txt',
    'grep -r pattern .',
    'git status',
    'git log --oneline',
    'git diff',
    'head -n 5 f',
    'tail -f log',
    'pwd',
    'find . -name *.js'
  ];
  for (const cmd of readOnly) {
    it(`allows read-only command: ${cmd}`, () => {
      assertAllowed(cmd, 'read-only command must not be classified as a write');
    });
  }
});

// ---------------------------------------------------------------------------
// CONTRACT 2 — write gate per step / feature context
// ---------------------------------------------------------------------------

describe('Bash gate — write step gate', () => {
  it('blocks a write at step 7 (< 8)', () => {
    setState(7);
    assertBlocked('touch foo', 'writes blocked at step 7');
  });

  it('allows a write at step 8 (>= 8) with feature set', () => {
    setState(8);
    assertAllowed('touch foo', 'writes allowed at step 8');
  });

  it('allows a write at step 16 with feature set', () => {
    setState(16);
    assertAllowed('echo x > f', 'writes allowed at step 16');
  });

  it('blocks a write when no feature context (state exists, feature=null) at step 8', () => {
    setState(8, null);
    assertBlocked('touch foo', 'no feature context => write blocked even at step 8');
  });

  it('blocks a write when there is no state at all', () => {
    // No setState() call: no state file planted for this project.
    assertBlocked('touch foo', 'no state => write blocked');
  });
});

// ---------------------------------------------------------------------------
// CONTRACT 3 — commit/push gate per step
// ---------------------------------------------------------------------------

describe('Bash gate — commit/push step gate', () => {
  it('blocks git commit at step 10 (< 15)', () => {
    setState(10);
    assertBlocked('git commit -m "x"', 'commit blocked before step 15');
  });

  it('blocks git push at step 14 (< 15)', () => {
    setState(14);
    assertBlocked('git push origin main', 'push blocked before step 15');
  });

  it('allows git commit at step 15 (>= 15)', () => {
    setState(15);
    assertAllowed('git commit -m "x"', 'commit allowed at step 15');
  });

  it('allows git push at step 16', () => {
    setState(16);
    assertAllowed('git push origin main', 'push allowed at step 16');
  });

  it('commit gate fires even with no feature context (commit checked before feature check)', () => {
    setState(10, null);
    assertBlocked('git commit -m "x"', 'commit blocked before feature check too');
  });

  it('does not treat git status / log / diff as a commit (allowed at step 10)', () => {
    setState(10);
    assertAllowed('git status', 'git status is not a commit');
    assertAllowed('git log', 'git log is not a commit');
    assertAllowed('git diff', 'git diff is not a commit');
  });
});

// ---------------------------------------------------------------------------
// CONTRACT 4 — BYPASS SURFACE (security core)
// Each evasion that slips through is a REAL bug. We assert intended behavior
// (BLOCK) so the gap surfaces as a failing test rather than silent acceptance.
// ---------------------------------------------------------------------------

describe('Bash gate — commit BYPASS surface (step 10: all must stay blocked)', () => {
  beforeEach(() => setState(10));

  // These the anchored pattern already handles — should pass.
  it('blocks: multiple spaces  "git   commit"', () => {
    assertBlocked('git   commit -m x');
  });
  it('blocks: tab separator  "git\\tcommit"', () => {
    assertBlocked('git\tcommit -m x');
  });

  // These exercise known evasions of /^\s*git\s+(commit|push)/. They are
  // EXPECTED to FAIL against the current hook == real, reportable gaps.
  it('blocks: global flag before subcommand  "git -c k=v commit"', () => {
    assertBlocked('git -c user.name=x commit -m x', 'global -c flag must not evade the commit gate');
  });
  it('blocks: global flag before subcommand  "git -C . commit"', () => {
    assertBlocked('git -C . commit -m x', 'global -C flag must not evade the commit gate');
  });
  it('blocks: command chaining with semicolon  "true; git commit"', () => {
    assertBlocked('true; git commit -m x', 'semicolon-chained commit must not evade the gate');
  });
  it('blocks: command chaining with &&  "x && git push"', () => {
    assertBlocked('echo x && git push origin main', '&&-chained push must not evade the gate');
  });
  it('blocks: command substitution  "$(git commit)"', () => {
    assertBlocked('$(git commit -m x)', 'command-substitution commit must not evade the gate');
  });
});

describe('Bash gate — write BYPASS surface (step 5: all must stay blocked)', () => {
  beforeEach(() => setState(5));

  it('blocks: redirect with no spaces  "echo x>f"', () => {
    assertBlocked('echo x>f', 'no-space redirect must be caught');
  });
  it('blocks: absolute-path tee  "/usr/bin/tee f"', () => {
    assertBlocked('/usr/bin/tee f', 'absolute-path tee must be caught');
  });
  it('blocks: "command tee f" wrapper', () => {
    assertBlocked('command tee f', 'command-builtin tee wrapper must be caught');
  });
  it('blocks: append redirect no spaces  "echo x>>f"', () => {
    assertBlocked('echo x>>f', 'no-space append redirect must be caught');
  });
});

// ---------------------------------------------------------------------------
// CONTRACT 5 — edge cases: empty / null / very long / newline -> no crash
// ---------------------------------------------------------------------------

describe('Bash gate — edge cases do not crash', () => {
  beforeEach(() => setState(5));

  it('empty command -> allowed, no crash', () => {
    const res = runHook('');
    assert.equal(res.signal, null, 'no crash on empty command');
    assert.equal(res.status, 0, 'empty command allowed');
  });

  it('null command -> allowed, no crash', () => {
    const res = runHookRaw(JSON.stringify({ command: null }));
    assert.equal(res.signal, null, 'no crash on null command');
    assert.equal(res.status, 0, 'null command allowed');
  });

  it('missing command field ({}) -> allowed, no crash', () => {
    const res = runHookRaw('{}');
    assert.equal(res.signal, null, 'no crash on missing command');
    assert.equal(res.status, 0, 'missing command allowed');
  });

  it('malformed JSON payload -> no crash (defined exit code)', () => {
    const res = runHookRaw('not-json-at-all');
    assert.equal(res.signal, null, 'no crash on malformed JSON');
    assert.ok(res.status === 0 || res.status === 1, `defined exit code, got ${res.status}`);
  });

  it('newline-containing command -> no crash, defined exit code', () => {
    const res = runHook('echo a\nrm -rf b');
    assert.equal(res.signal, null, 'no crash on newline command');
    assert.ok(res.status === 0 || res.status === 1, `defined exit code, got ${res.status}`);
  });

  it('very long command (20k chars) -> no crash, defined exit code', () => {
    const res = runHook('echo ' + 'a'.repeat(20000));
    assert.equal(res.signal, null, 'no crash on very long command');
    assert.ok(res.status === 0 || res.status === 1, `defined exit code, got ${res.status}`);
  });
});
