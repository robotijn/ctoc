'use strict';

/**
 * Dark-branch coverage for src/hooks/post-commit.js — the non-blocking
 * post-commit quality-agent launcher.
 *
 * A post-commit hook has ONE non-negotiable contract: it must NEVER break the
 * commit. The commit has already happened by the time this runs, so every path
 * must be fail-open (exit 0, no throw) and the hook must launch the background
 * quality agent ONLY when it is genuinely supposed to.
 *
 * These tests aim at the WHEN-to-act / when-to-no-op decision, the || / ternary
 * fallbacks, and the fail-open agent-not-found path — every assertion is chosen
 * so a mutant that acts on the wrong condition, skips a needed action, or crashes
 * the commit goes RED. They complement (do not duplicate) the subprocess-level
 * happy/skip checks in tests/hooks-remaining.test.js and the ship-gate argv
 * checks in tests/ship-gate-real.test.js by driving the module in-process and
 * pinning the branches those suites leave dark (lines 72-74, the rebase-apply
 * second operand, the exact-'1' skip compare, and the main() no-op guard).
 *
 * Every AI-drafted assertion here was read line-by-line before commit.
 */

const { test, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK_PATH = path.join(__dirname, '..', 'src', 'hooks', 'post-commit.js');
const hook = require(HOOK_PATH);

// ── fixtures ────────────────────────────────────────────────────────────────

const madeDirs = [];

/**
 * A throwaway project dir with a `.git` subdir. Pass flags to plant the marker
 * files shouldRun() looks for. Returns the absolute path.
 */
function makeRepo({ mergeHead = false, rebaseMerge = false, rebaseApply = false,
                    autoPush = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-postcommit-'));
  madeDirs.push(dir);
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  if (mergeHead) fs.writeFileSync(path.join(dir, '.git', 'MERGE_HEAD'), 'deadbeef\n');
  if (rebaseMerge) fs.mkdirSync(path.join(dir, '.git', 'rebase-merge'), { recursive: true });
  if (rebaseApply) fs.mkdirSync(path.join(dir, '.git', 'rebase-apply'), { recursive: true });
  if (autoPush !== null) {
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.ctoc', 'settings.json'),
      JSON.stringify({ git: { autoPushEnabled: autoPush } }, null, 2)
    );
  }
  return dir;
}

after(() => {
  for (const d of madeDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* fixture cleanup best-effort */ }
  }
});

// ── environment / cwd / console isolation (restored per test) ────────────────

const ORIGINAL_CWD = process.cwd();
const ORIGINAL_SKIP = Object.prototype.hasOwnProperty.call(process.env, 'CTOC_SKIP_QUALITY')
  ? process.env.CTOC_SKIP_QUALITY
  : undefined;
const REAL_EXISTS_SYNC = fs.existsSync;
const REAL_LOG = console.log;

function setSkip(value) {
  if (value === undefined) delete process.env.CTOC_SKIP_QUALITY;
  else process.env.CTOC_SKIP_QUALITY = value;
}

/** Run `fn` with console.log captured; returns the joined log output. */
function withCapturedLog(fn) {
  const lines = [];
  console.log = (...args) => { lines.push(args.join(' ')); };
  try {
    fn();
  } finally {
    console.log = REAL_LOG;
  }
  return lines.join('\n');
}

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  setSkip(ORIGINAL_SKIP);
  fs.existsSync = REAL_EXISTS_SYNC;
  console.log = REAL_LOG;
});

// ═══════════════════════════════════════════════════════════════════════════
// Cluster A — shouldRun(): the WHEN-to-act vs no-op decision.
//   Kills mutants that invert the skip conditions or drop an OR operand.
// ═══════════════════════════════════════════════════════════════════════════

test('shouldRun_returns_true_when_no_skip_and_plain_commit', () => {
  // Arrange — clean repo, no skip env, no merge/rebase markers.
  const dir = makeRepo();
  setSkip(undefined);
  process.chdir(dir);

  // Act
  const result = hook.shouldRun();

  // Assert — the agent MUST launch on an ordinary commit; a mutant that makes
  // shouldRun always-skip (return false) dies here.
  assert.equal(result, true);
});

test('shouldRun_returns_true_when_skip_env_is_not_exactly_one', () => {
  // Arrange — CTOC_SKIP_QUALITY set to a truthy-but-not-'1' value.
  // Pins the EXACT string compare (=== '1'): only the literal '1' skips.
  const dir = makeRepo();
  setSkip('0');
  process.chdir(dir);

  // Act
  const result = hook.shouldRun();

  // Assert — '0' (and any non-'1') must NOT skip. A mutant weakening the
  // compare to truthiness would skip here and go RED.
  assert.equal(result, true);
});

test('shouldRun_returns_false_when_skip_env_is_exactly_one', () => {
  // Arrange
  const dir = makeRepo();
  setSkip('1');
  process.chdir(dir);

  // Act + Assert
  const output = withCapturedLog(() => {
    assert.equal(hook.shouldRun(), false);
  });
  assert.match(output, /CTOC_SKIP_QUALITY=1/);
});

test('shouldRun_returns_false_when_merge_head_present', () => {
  // Arrange — MERGE_HEAD in .git marks a merge commit; the agent must stand down.
  const dir = makeRepo({ mergeHead: true });
  setSkip(undefined);
  process.chdir(dir);

  // Act + Assert
  const output = withCapturedLog(() => {
    assert.equal(hook.shouldRun(), false);
  });
  assert.match(output, /merge commit/);
});

test('shouldRun_returns_false_when_rebase_merge_present', () => {
  // Arrange — first operand of the rebase OR.
  const dir = makeRepo({ rebaseMerge: true });
  setSkip(undefined);
  process.chdir(dir);

  // Act + Assert
  assert.equal(hook.shouldRun(), false);
});

test('shouldRun_returns_false_when_only_rebase_apply_present', () => {
  // Arrange — rebase-apply WITHOUT rebase-merge. This is the SECOND operand of
  // the `rebase-merge || rebase-apply` OR, dark in existing suites. A mutant
  // that drops `|| existsSync(rebase-apply)` would return true and go RED.
  const dir = makeRepo({ rebaseApply: true });
  setSkip(undefined);
  process.chdir(dir);

  // Act + Assert
  const output = withCapturedLog(() => {
    assert.equal(hook.shouldRun(), false);
  });
  assert.match(output, /rebase in progress/);
});

// ═══════════════════════════════════════════════════════════════════════════
// Cluster B — buildAgentArgs(): the on-success ternary + the constant argv.
//   Kills mutants that flip the ship-gate default or corrupt the trigger tag.
// ═══════════════════════════════════════════════════════════════════════════

test('buildAgentArgs_closes_ship_gate_by_default_with_explicit_none', () => {
  // Arrange — a project with NO autoPush setting (gate closed / default).
  const dir = makeRepo();

  // Act
  const args = hook.buildAgentArgs(dir);

  // Assert — the closed gate is explicit; the trigger tag is intact. A mutant
  // flipping the ternary to 'push', or mangling the trigger literal, dies here.
  assert.deepEqual(args, ['--triggered-by=post-commit', '--on-success=none']);
});

test('buildAgentArgs_emits_push_only_when_autopush_opted_in', () => {
  // Arrange — human explicitly opened the gate.
  const dir = makeRepo({ autoPush: true });

  // Act
  const args = hook.buildAgentArgs(dir);

  // Assert — push appears ONLY on the true branch of the ternary.
  assert.deepEqual(args, ['--triggered-by=post-commit', '--on-success=push']);
});

test('buildAgentArgs_keeps_gate_closed_when_autopush_explicitly_false', () => {
  // Arrange — setting present but false; must resolve to 'none', not 'push'.
  const dir = makeRepo({ autoPush: false });

  // Act + Assert
  assert.equal(hook.buildAgentArgs(dir).includes('--on-success=none'), true);
  assert.equal(hook.buildAgentArgs(dir).includes('--on-success=push'), false);
});

// ═══════════════════════════════════════════════════════════════════════════
// Cluster C — startAgent(): fail-open when the quality agent is missing.
//   This is the dark 72-74 branch. Kills the mutant that removes the early
//   return (which would then spawn against a non-existent path).
// ═══════════════════════════════════════════════════════════════════════════

test('startAgent_warns_and_returns_without_spawning_when_agent_missing', () => {
  // Arrange — fake the fs boundary so the agent path reports missing.
  const dir = makeRepo();
  process.chdir(dir);
  fs.existsSync = () => false;

  // Act — must not throw (fail-open: a missing agent never breaks the commit).
  const output = withCapturedLog(() => {
    assert.doesNotThrow(() => hook.startAgent());
  });

  // Assert — the warning fired AND the "started" line did NOT (spawn skipped).
  assert.match(output, /Quality agent not found, skipping/);
  assert.equal(/started in background/.test(output), false);
});

test('startAgent_launches_background_agent_on_ordinary_commit', () => {
  // Arrange — real quality-agent.js exists; drive the happy spawn path so the
  // detached-launch lines are exercised (agent is detached+unref'd, no wait).
  const dir = makeRepo();
  process.chdir(dir);

  // Act
  const output = withCapturedLog(() => {
    assert.doesNotThrow(() => hook.startAgent());
  });

  // Assert — the launch confirmation printed; a mutant that skips the spawn
  // block (or the "not found" guard inverting) would not print this.
  assert.match(output, /Quality agent started in background/);
});

// ═══════════════════════════════════════════════════════════════════════════
// Cluster D — main(): the top-level guard wiring shouldRun → startAgent.
//   Kills the mutant that inverts `if (!shouldRun()) return`.
// ═══════════════════════════════════════════════════════════════════════════

test('main_is_a_noop_that_never_starts_agent_when_skip_set', () => {
  // Arrange — skip env forces shouldRun() false; main() must return early and
  // NEVER reach startAgent (no launch / no not-found line).
  const dir = makeRepo();
  setSkip('1');
  process.chdir(dir);

  // Act + Assert
  const output = withCapturedLog(() => {
    assert.doesNotThrow(() => hook.main());
  });
  assert.match(output, /CTOC_SKIP_QUALITY=1/);
  assert.equal(/started in background|not found/.test(output), false);
});

test('main_proceeds_to_start_agent_when_should_run_is_true', () => {
  // Arrange — plain commit → shouldRun() true → main() must call startAgent.
  // Fake fs so startAgent takes the observable not-found branch (proving main
  // reached it) instead of spawning a real background process.
  const dir = makeRepo();
  setSkip(undefined);
  process.chdir(dir);
  fs.existsSync = (p) => {
    // .git presence check in shouldRun must still see reality; only the agent
    // path (…/lib/quality-agent.js) is forced missing.
    if (String(p).endsWith(path.join('lib', 'quality-agent.js'))) return false;
    return REAL_EXISTS_SYNC(p);
  };

  // Act + Assert — main reached startAgent (proven by the not-found line) and
  // never surfaced the skip line. Inverting the guard would flip both.
  const output = withCapturedLog(() => {
    assert.doesNotThrow(() => hook.main());
  });
  assert.match(output, /Quality agent not found, skipping/);
  assert.equal(/CTOC_SKIP_QUALITY=1/.test(output), false);
});

// ═══════════════════════════════════════════════════════════════════════════
// Cluster E — require.main entry: the hook run directly must exit 0 (fail-open).
//   A post-commit hook that exits non-zero would surface as a scary commit
//   error even though the commit already succeeded. Driven as a subprocess so
//   the `if (require.main === module) main()` entry is exercised for real.
// ═══════════════════════════════════════════════════════════════════════════

test('direct_invocation_exits_zero_and_never_breaks_the_commit', () => {
  // Arrange — a clean repo; run the hook file itself as `node post-commit.js`
  // with skip set so no real background agent is launched by the assertion path.
  const dir = makeRepo();

  // Act
  const r = spawnSync(process.execPath, [HOOK_PATH], {
    cwd: dir,
    env: { ...process.env, CTOC_SKIP_QUALITY: '1' },
    encoding: 'utf8',
  });

  // Assert — exit 0 is the load-bearing contract; the skip line proves the
  // require.main entry actually ran main().
  assert.equal(r.status, 0);
  assert.match(r.stdout, /CTOC_SKIP_QUALITY=1/);
});
