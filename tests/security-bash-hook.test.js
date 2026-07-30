/**
 * CTOC Security Test — PreToolUse.Bash gate (the REAL hook process)
 *
 * Unlike tests/hooks.test.js (which re-implements the regexes inside the test
 * and therefore can never catch a real bug in the hook), this file SPAWNS the
 * actual src/hooks/PreToolUse.Bash.js process and asserts the REAL deny signal
 * the harness reads (W01-s2, findings C1+C2):
 *
 *   deny  -> stdout carries the JSON decision
 *            hookSpecificOutput.permissionDecision === "deny" (exit 2)
 *   allow -> exit 0 with NO decision JSON on stdout (silent allow)
 *
 * Exit code alone therefore no longer distinguishes allow from deny — only the
 * presence of the deny JSON does — so every assertion parses stdout, never
 * res.status. This mirrors the shared emitter in src/lib/hook-deny-signal.js.
 *
 * Contract discovered from source (do NOT change these — they are the hook's
 * real behavior, asserted so regressions surface):
 *
 *   INPUT: the hook reads the command from STDIN (fd 0) as the PreToolUse JSON
 *          payload ({ tool_name, tool_input: { command } }), the same transport
 *          the harness actually uses and PreToolUse.Edit.js already reads. It
 *          does NOT read process.env.CLAUDE_TOOL_INPUT (finding C2). A
 *          missing/empty command -> allow.
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
const ledger = require(path.join(REPO, 'src', 'lib', 'approval-ledger'));

/**
 * Mint an APPROVED plan covering `globs` so the 00202 plan-coverage stage ALLOWS the
 * write — isolating the guard this file actually tests (the Iron-Loop STEP gate). Since
 * 00202 the shell channel denies a determinate write to an UNCOVERED file; without a
 * covering plan that deny would shadow the step-gate assertions here. Only an APPROVED
 * plan grants coverage, so the fixture mints the real ledger entry over its own bytes.
 */
function coverPlan(globs) {
  const dir = path.join(project, 'plans', 'todo');
  fs.mkdirSync(dir, { recursive: true });
  const body = '---\nfiles:\n' + globs.map((g) => `  - "${g}"`).join('\n') + '\n---\n\n# 00202 coverage fixture\n';
  const p = path.join(dir, '00202-cover.md');
  fs.writeFileSync(p, body, 'utf8');
  ledger.writeEntry(ledger.slugFromPlanPath(p), {
    content: body, stage_from: 'implementation', stage_to: 'todo', approved_by: 'human',
  }, project);
}

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
 * Run the REAL hook against `command`, delivered as the PreToolUse JSON payload
 * on STDIN (the harness's real transport). CLAUDE_TOOL_INPUT is explicitly
 * cleared so a passing test cannot be leaning on the removed env channel (C2).
 */
function runHook(command) {
  return runHookRaw(JSON.stringify({ tool_name: 'Bash', tool_input: { command } }));
}

/** Run the hook with an arbitrary raw payload delivered on STDIN. */
function runHookRaw(rawPayload) {
  const res = spawnSync(process.execPath, [HOOK], {
    cwd: project,
    input: rawPayload,
    env: { ...process.env, CLAUDE_TOOL_INPUT: '' },
    encoding: 'utf8'
  });
  return res;
}

/**
 * Parse the deny decision emitted on stdout, or null when the run ALLOWED.
 * A deny is `hookSpecificOutput.permissionDecision === "deny"` (shared emitter,
 * src/lib/hook-deny-signal.js). Parses the LAST JSON object on stdout to
 * tolerate any preceding output.
 */
function denyDecision(res) {
  const s = (res.stdout ? String(res.stdout) : '').trim();
  if (!s) return null;
  let decision = null;
  try { decision = JSON.parse(s); } catch { /* fall through to last-brace scan */ }
  if (!decision) {
    const idx = s.lastIndexOf('{');
    if (idx === -1) return null;
    try { decision = JSON.parse(s.slice(idx)); } catch { return null; }
  }
  if (decision && decision.hookSpecificOutput
    && decision.hookSpecificOutput.permissionDecision === 'deny') {
    return decision.hookSpecificOutput;
  }
  return null;
}

/** True when the run emitted the harness's real deny signal. */
function isDenied(res) { return denyDecision(res) !== null; }

/** Assert the hook BLOCKED the command (deny JSON on stdout). */
function assertBlocked(command, msg) {
  const res = runHook(command);
  assert.equal(res.signal, null, `hook crashed (signal) on ${JSON.stringify(command)}`);
  assert.equal(
    isDenied(res),
    true,
    `${msg || 'expected BLOCK'} for ${JSON.stringify(command)} — expected permissionDecision:"deny" on stdout (got exit ${res.status})\nstdout=${res.stdout || ''}\nstderr=${res.stderr || ''}`
  );
}

/** Assert the hook ALLOWED the command (no deny JSON). */
function assertAllowed(command, msg) {
  const res = runHook(command);
  assert.equal(res.signal, null, `hook crashed (signal) on ${JSON.stringify(command)}`);
  assert.equal(
    isDenied(res),
    false,
    `${msg || 'expected ALLOW'} for ${JSON.stringify(command)} — expected no deny JSON (got exit ${res.status})\nstdout=${res.stdout || ''}\nstderr=${res.stderr || ''}`
  );
}

beforeEach(() => { project = makeProject(); });
afterEach(() => { cleanupProject(project); project = null; });

// ---------------------------------------------------------------------------
// CONTRACT 0 — input channel is STDIN, not CLAUDE_TOOL_INPUT (finding C2)
// ---------------------------------------------------------------------------

describe('Bash gate — input channel contract', () => {
  // BDD: "Bash gate reads the real transport" — the C2 regression guard. A
  // dangerous command delivered ONLY on stdin, with CLAUDE_TOOL_INPUT unset,
  // must be read and denied. Before the fix the hook read the (empty) env var,
  // saw an empty command, and allowed everything.
  it('reads the command from stdin (not CLAUDE_TOOL_INPUT env)', () => {
    setState(5);
    const res = spawnSync(process.execPath, [HOOK], {
      cwd: project,
      env: { ...process.env, CLAUDE_TOOL_INPUT: '' },
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'rm -rf plans' } }),
      encoding: 'utf8'
    });
    assert.equal(res.signal, null, 'hook crashed (signal) reading stdin');
    assert.equal(isDenied(res), true,
      `stdin IS the input channel; the dangerous command must be read and denied\nstdout=${res.stdout}\nstderr=${res.stderr}`);
  });

  // BDD: the removed channel must genuinely be dead. The same dangerous command
  // supplied ONLY via CLAUDE_TOOL_INPUT, with stdin empty, must NOT be seen —
  // proving getCommand no longer reads the env var (zero-fallback to env).
  it('does NOT read CLAUDE_TOOL_INPUT env (command there is invisible)', () => {
    setState(5);
    const res = spawnSync(process.execPath, [HOOK], {
      cwd: project,
      env: { ...process.env, CLAUDE_TOOL_INPUT: JSON.stringify({ command: 'rm -rf plans' }) },
      input: '',
      encoding: 'utf8'
    });
    assert.equal(res.signal, null, 'hook crashed (signal) on empty stdin');
    assert.equal(isDenied(res), false,
      'CLAUDE_TOOL_INPUT is no longer an input channel; a command placed only there must be invisible -> allowed');
  });

  // BDD: "Bash gate does not fall through to allow-by-default". A dangerous
  // command on stdin with CLAUDE_TOOL_INPUT unset must deny — the test fails
  // explicitly if the command slips through to allow.
  it('does not fall through to allow-by-default for a dangerous command', () => {
    setState(5);
    const res = spawnSync(process.execPath, [HOOK], {
      cwd: project,
      env: { ...process.env, CLAUDE_TOOL_INPUT: '' },
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push --force origin main' } }),
      encoding: 'utf8'
    });
    assert.equal(res.signal, null, 'hook crashed (signal) on force-push payload');
    assert.equal(isDenied(res), true,
      `a force-push must be denied, never allowed-by-default\nstdout=${res.stdout}\nstderr=${res.stderr}`);
  });

  // BDD: "reported blocked command matches the actual command from stdin" —
  // proves getCommand read the real stdin command rather than defaulting empty.
  it('reports the blocked command read from stdin in the deny reason', () => {
    setState(5);
    const res = spawnSync(process.execPath, [HOOK], {
      cwd: project,
      env: { ...process.env, CLAUDE_TOOL_INPUT: '' },
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'rm -rf plans' } }),
      encoding: 'utf8'
    });
    const decision = denyDecision(res);
    assert.ok(decision, 'expected a deny decision on stdout');
    const reasonHasCommand = /rm -rf plans/.test(decision.permissionDecisionReason || '');
    const bannerHasCommand = /rm -rf plans/.test(res.stderr || '');
    assert.ok(reasonHasCommand || bannerHasCommand,
      `the actual stdin command must appear in the deny reason or the stderr banner\nreason=${decision.permissionDecisionReason}\nstderr=${res.stderr}`);
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
    coverPlan(['foo']); // 00202: a covered write isolates the STEP gate under test
    assertAllowed('touch foo', 'writes allowed at step 8');
  });

  it('allows a write at step 16 with feature set', () => {
    setState(16);
    coverPlan(['f']); // 00202: cover the target so coverage does not shadow the step gate
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

  it('malformed JSON payload -> DENIED (fail closed on an undecodable payload)', () => {
    // 00206: a NON-EMPTY payload that will not parse cannot be cleared — the old
    // regex fallback truncated at the first quote and allowed a hidden redirect. A gate
    // that cannot read its input must deny (HARNESS_BLOCK_EXIT_CODE = 2), never allow.
    const res = runHookRaw('not-json-at-all');
    assert.equal(res.signal, null, 'no crash on malformed JSON');
    assert.equal(isDenied(res), true, `undecodable payload must be denied, got exit ${res.status}`);
  });

  it('newline-containing command -> no crash, defined exit code', () => {
    const res = runHook('echo a\nrm -rf b');
    assert.equal(res.signal, null, 'no crash on newline command');
    // The embedded `rm -rf` is a deny -> exit 2 (HARNESS_BLOCK_EXIT_CODE); allow -> 0.
    assert.ok(res.status === 0 || res.status === 2, `defined exit code, got ${res.status}`);
  });

  it('very long command (20k chars) -> no crash, defined exit code', () => {
    const res = runHook('echo ' + 'a'.repeat(20000));
    assert.equal(res.signal, null, 'no crash on very long command');
    assert.ok(res.status === 0 || res.status === 1, `defined exit code, got ${res.status}`);
  });
});
