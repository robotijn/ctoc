/**
 * CTOC — the Bash (shell) channel asks the SAME plan-coverage question the Edit
 * channel asks about DETERMINATE write targets, and records its answer (plan 00202,
 * Option A scope).
 *
 * THE DEFECT (RED today): past the Step-8 write gate, a shell command that WRITES a
 * source file the plan queue does not declare is ALLOWED — the shell channel enforces
 * ZERO plan coverage, while the Edit channel denies the identical uncovered write.
 * `echo x > src/uncovered.js` at step 10 is allowed today; it must be denied.
 *
 * SCOPE (Option A — confirmed by the coordinator). The new stage acts on the
 * classifier's `writes` verdict ONLY (determinate targets): uncovered → deny (strict),
 * covered/whitelisted → allow, user-typed escape → allow, and every such decision is
 * logged to `.ctoc/logs/enforcement.json` (the SAME store the Edit channel uses), and
 * the deny respects `enforcement.mode` exactly as the Edit channel does (strict deny /
 * soft warn+allow / off allow). `indeterminate` commands (npm test, node --test,
 * node -e, npm run lint, node scripts, make, python) and `none` commands pass this new
 * stage UNCHANGED — the "refuse indeterminate writes" policy is DEFERRED (it would deny
 * CTOC's own Step-14 `npm test`; see the plan's Decisions Taken Under Ambiguity). The
 * V-cases below are the load-bearing proof that Option A did NOT break the pipeline's
 * own verification commands.
 *
 * Every test SPAWNS the real src/hooks/PreToolUse.Bash.js — no re-implemented regexes,
 * no mocked core logic. The only fakes are at the true boundaries: the signed state
 * file (planted with the real state-manager), an APPROVED covering plan (minted with the
 * real approval-ledger — a plan FILE alone grants nothing), the stdin JSON payload, and
 * a JSONL transcript. Temp projects live under os.tmpdir() and are removed in afterEach.
 * A deny is `permissionDecision:"deny"` on stdout (shared emitter, exit 2); an allow is
 * exit 0 with no decision JSON.
 *
 * Run with: node --test tests/bash-gate-plan-coverage.test.js
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
const enforcementLog = require(path.join(REPO, 'src', 'lib', 'enforcement-log'));
const ledger = require(path.join(REPO, 'src', 'lib', 'approval-ledger'));

let project;

/** Create a hermetic CTOC project in a temp dir (realpath'd for macOS /tmp). */
function makeProject({ ctoc = true } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-bash-cov202-')));
  if (ctoc) {
    fs.mkdirSync(path.join(dir, '.ctoc', 'approvals'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.ctoc', 'logs'), { recursive: true });
  }
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# CTOC Project Instructions\n');
  for (const stage of ['functional', 'implementation', 'todo', 'review', 'done']) {
    fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  }
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  return dir;
}

function cleanupProject(dir) {
  if (!dir) return;
  try { fs.rmSync(stateManager.getStatePath(dir), { force: true }); } catch { /* may not exist */ }
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Plant a valid, signed Iron-Loop state for `project`. */
function setState(step, feature = 'coverage202-feature') {
  const state = stateManager.createState(project, feature, 'javascript', null);
  state.currentStep = step;
  stateManager.saveState(project, state);
}

/** Set enforcement.mode in .ctoc/settings.yaml (tier-1 override the resolver reads). */
function setMode(mode) {
  fs.writeFileSync(path.join(project, '.ctoc', 'settings.yaml'), `enforcement:\n  mode: ${mode}\n`, 'utf8');
}

/**
 * Write a covering plan in plans/todo declaring src/covered.js. By default mint the
 * REAL ledger approval — only an APPROVED plan grants coverage; a plan file alone
 * grants nothing (findCoveringPlan consults approval-residency).
 */
function writeCoveringPlan({ approved = true } = {}) {
  const dir = path.join(project, 'plans', 'todo');
  fs.mkdirSync(dir, { recursive: true });
  const body = '---\nfiles:\n  - "src/covered.js"\n---\n\n# covering plan\n';
  const planPath = path.join(dir, '00202-covering.md');
  fs.writeFileSync(planPath, body, 'utf8');
  if (approved) {
    ledger.writeEntry(ledger.slugFromPlanPath(planPath), {
      content: body, stage_from: 'implementation', stage_to: 'todo', approved_by: 'human',
    }, project);
  }
  return planPath;
}

/** Write a JSONL transcript file; return its absolute path. */
function writeTranscript(...lines) {
  const p = path.join(project, 'transcript.jsonl');
  fs.writeFileSync(p, lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n', 'utf8');
  return p;
}

/** Run the REAL hook against `command`, delivered as the PreToolUse JSON payload on stdin. */
function runHook(command, transcriptPath) {
  const payload = { tool_name: 'Bash', tool_input: { command } };
  if (transcriptPath) payload.transcript_path = transcriptPath;
  return spawnSync(process.execPath, [HOOK], {
    cwd: project,
    input: JSON.stringify(payload),
    env: { ...process.env, CLAUDE_TOOL_INPUT: '' },
    encoding: 'utf8',
  });
}

function denyDecision(res) {
  const s = (res.stdout ? String(res.stdout) : '').trim();
  if (!s) return null;
  let decision = null;
  try { decision = JSON.parse(s); } catch { /* fall through */ }
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

function isDenied(res) { return denyDecision(res) !== null; }

function denyReason(res) {
  const d = denyDecision(res);
  return d ? (d.permissionDecisionReason || '') : '';
}

function assertBlocked(command, msg, reasonRe, transcriptPath) {
  const res = runHook(command, transcriptPath);
  assert.equal(res.signal, null, `hook crashed (signal) on ${JSON.stringify(command)}`);
  assert.equal(isDenied(res), true,
    `${msg || 'expected BLOCK'} for ${JSON.stringify(command)} (got exit ${res.status})\nstdout=${res.stdout || ''}\nstderr=${res.stderr || ''}`);
  if (reasonRe) {
    assert.match(denyReason(res), reasonRe,
      `deny reason for ${JSON.stringify(command)} should identify the right gate (got: ${denyReason(res)})`);
  }
  return res;
}

function assertAllowed(command, msg, transcriptPath) {
  const res = runHook(command, transcriptPath);
  assert.equal(res.signal, null, `hook crashed (signal) on ${JSON.stringify(command)}`);
  assert.equal(isDenied(res), false,
    `${msg || 'expected ALLOW'} for ${JSON.stringify(command)} (got exit ${res.status})\nstdout=${res.stdout || ''}\nstderr=${res.stderr || ''}`);
  return res;
}

/** The enforcement-log entries written during a run (empty array if none). */
function logEntries() {
  return enforcementLog.readLog(project);
}

beforeEach(() => { project = makeProject(); });
afterEach(() => { cleanupProject(project); project = null; });

// ---------------------------------------------------------------------------
// THE DEFECT — a determinate shell write to an UNCOVERED source file is denied.
// ---------------------------------------------------------------------------

describe('Bash gate — determinate write coverage (the defect)', () => {
  beforeEach(() => { writeCoveringPlan(); setState(10); setMode('strict'); });

  it('[2] denies a write to an uncovered source file (RED today)', () => {
    assertBlocked('echo x > src/uncovered.js', 'uncovered shell write must be denied',
      /no approved plan covers/i);
    const res = runHook('echo x > src/uncovered.js');
    assert.match(denyReason(res), /src\/uncovered\.js/, 'deny must name the uncovered target');
  });

  it('[3] denies an uncovered write split across `cd .` (the 00201 cd bypass)', () => {
    assertBlocked('cd . && echo x > src/uncovered.js', 'cd-prefixed uncovered write must be denied',
      /no approved plan covers/i);
  });

  it('[4] denies naming the cd-RESOLVED target, not the bare operand', () => {
    const res = assertBlocked('cd src && echo x > uncovered.js', 'cd-resolution must feed coverage',
      /no approved plan covers/i);
    assert.match(denyReason(res), /src\/uncovered\.js/, 'must name src/uncovered.js, not uncovered.js');
  });

  it('[5] denies when one covered target does not clear an uncovered sibling', () => {
    assertBlocked('echo x > src/covered.js && echo y > src/uncovered.js',
      'a covered target must not launder the uncovered one', /no approved plan covers/i);
  });

  it('[1] allows a write to a COVERED source file, logging the plan', () => {
    assertAllowed('echo x > src/covered.js', 'covered shell write must be allowed');
    const entries = logEntries();
    const allow = entries.find((e) => e.outcome === 'allow');
    assert.ok(allow, 'a covered write must log an allow entry');
    assert.ok(allow.plan_matched && /00202-covering/.test(allow.plan_matched),
      'the allow entry must name the matched plan');
    assert.equal(allow.tool, 'Bash', 'the entry is tagged as the Bash channel');
  });

  it('[17] fail-closed — an UNAPPROVED covering plan grants nothing (deny)', () => {
    project = makeProject(); writeCoveringPlan({ approved: false }); setState(10); setMode('strict');
    assertBlocked('echo x > src/covered.js', 'a plan file alone must not grant coverage',
      /no approved plan covers/i);
  });
});

// ---------------------------------------------------------------------------
// WHITELIST — infrastructure paths pass, exactly as the Edit channel allows them.
// ---------------------------------------------------------------------------

describe('Bash gate — whitelisted write targets are allowed', () => {
  beforeEach(() => { writeCoveringPlan(); setState(10); setMode('strict'); });

  it('[6] allows a write to VERSION (whitelist)', () => {
    assertAllowed('echo x > VERSION', 'VERSION is whitelisted');
    assert.ok(logEntries().some((e) => e.outcome === 'whitelist'), 'logs a whitelist decision');
  });

  it('[7] allows a write to plans/todo/a.md (whitelist)', () => {
    assertAllowed('echo x > plans/todo/a.md', 'plan markdown is whitelisted');
    assert.ok(logEntries().some((e) => e.outcome === 'whitelist'), 'logs a whitelist decision');
  });
});

// ---------------------------------------------------------------------------
// ESCAPE — the user-typed escape phrase allows the write, reusing the Edit
// channel's ROLE-SCOPED findEscapeInTranscript (a phrase in a tool_result does not).
// ---------------------------------------------------------------------------

describe('Bash gate — user-typed escape phrase allows an uncovered write', () => {
  beforeEach(() => { writeCoveringPlan(); setState(10); setMode('strict'); });

  it('[12] allows an uncovered write when the user typed an escape phrase', () => {
    const tp = writeTranscript({ type: 'user', message: { role: 'user', content: 'please hotfix this now' } });
    assertAllowed('echo x > src/uncovered.js', 'a user-typed hotfix must allow the write', tp);
    const esc = logEntries().find((e) => e.outcome === 'escape');
    assert.ok(esc && esc.escape_phrase, 'logs an escape decision with the phrase');
  });

  it('[13] denies when the phrase appears ONLY in a tool_result (role-scoping survives reuse)', () => {
    const tp = writeTranscript({
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', content: 'hotfix appears here' }] },
    });
    assertBlocked('echo x > src/uncovered.js', 'a tool_result phrase must not unlock the write',
      /no approved plan covers/i, tp);
  });
});

// ---------------------------------------------------------------------------
// ORDERING — the pre-step-8 step gate runs BEFORE coverage; and reads/`none`
// commands are neither judged nor logged.
// ---------------------------------------------------------------------------

describe('Bash gate — ordering and non-writes', () => {
  it('[16] a pre-step-8 write is blocked for the STEP reason, not coverage', () => {
    writeCoveringPlan(); setState(5); setMode('strict'); // step < 8
    const res = assertBlocked('echo x > src/covered.js', 'pre-step-8 write is a step block',
      /planning not complete|step/i);
    assert.doesNotMatch(denyReason(res), /no approved plan covers/i,
      'a pre-step-8 write must not be told it lacks coverage');
  });

  it('[14] allows `ls -la` and logs NOTHING (a read is not a write decision)', () => {
    writeCoveringPlan(); setState(10); setMode('strict');
    assertAllowed('ls -la', 'a plain read is allowed');
    assert.equal(logEntries().length, 0, 'a read logs no coverage decision');
  });

  it('[15] allows `git status` and logs NOTHING', () => {
    writeCoveringPlan(); setState(10); setMode('strict');
    assertAllowed('git status', 'git status is allowed');
    assert.equal(logEntries().length, 0, 'git status logs no coverage decision');
  });

  it('[19] non-CTOC / no-state project: unchanged (the feature gate fires, not coverage)', () => {
    project = makeProject({ ctoc: false }); // no .ctoc, no state
    const res = runHook('echo x > src/uncovered.js');
    // A write with no feature context is blocked by the EXISTING gate — the new
    // coverage stage never runs (it is reached only past the step gate).
    if (isDenied(res)) {
      assert.doesNotMatch(denyReason(res), /no approved plan covers/i,
        'a no-state write must not be denied by the coverage stage');
    }
  });
});

// ---------------------------------------------------------------------------
// MODE-BLIND BY CONSTRUCTION — the Bash channel's write gates are ABSOLUTE denies
// that enforcement.mode must never weaken (00069; tests/enforcement-mode.test.js #27).
// So `enforcement.mode: soft` and `: off` — which relax the EDIT channel — do NOT
// relax this coverage deny. This is the intentional asymmetry: the more dangerous,
// harder-to-audit shell channel stays strict regardless of the convenience knob.
// ---------------------------------------------------------------------------

describe('Bash gate — the coverage deny is mode-blind (soft/off do not relax it)', () => {
  beforeEach(() => { writeCoveringPlan(); setState(10); });

  it('[M-soft] soft mode still DENIES an uncovered shell write', () => {
    setMode('soft');
    assertBlocked('echo x > src/uncovered.js', 'soft mode must not relax the Bash coverage deny',
      /no approved plan covers/i);
  });

  it('[M-off] off mode still DENIES an uncovered shell write', () => {
    setMode('off');
    assertBlocked('echo x > src/uncovered.js', 'off mode must not relax the Bash coverage deny',
      /no approved plan covers/i);
  });
});

// ---------------------------------------------------------------------------
// OPTION A GUARD — indeterminate "commands that merely run" are NOT denied by the
// new stage. These are CTOC's OWN verification commands; denying them would break
// the executor's own Step-14. This is the load-bearing proof of the Option A scope.
// ---------------------------------------------------------------------------

describe('Bash gate — verification/run commands pass the coverage stage unchanged', () => {
  beforeEach(() => { writeCoveringPlan(); setState(14); setMode('strict'); }); // Step 14 VERIFY, strict default

  const runners = [
    { id: 'npm test', cmd: 'npm test' },
    { id: 'node --test', cmd: 'node --test tests/x.test.js' },
    { id: 'npm run lint', cmd: 'npm run lint' },
    { id: 'node script', cmd: 'node src/scripts/release.js' },
    { id: 'node -e benign', cmd: `node -e "console.log(1 + 2)"` },
    { id: 'make', cmd: 'make' },
    { id: 'python', cmd: 'python script.py' },
  ];
  for (const { id, cmd } of runners) {
    it(`allows the run command [${id}] at Step 14 strict`, () => {
      assertAllowed(cmd, `${id} must not be denied by the coverage stage`);
    });
  }

  it('logs NOTHING for an indeterminate run command (only write decisions are logged)', () => {
    assertAllowed('npm test', 'npm test allowed');
    assert.equal(logEntries().length, 0, 'an indeterminate command logs no coverage decision');
  });
});

// ---------------------------------------------------------------------------
// SECRET HYGIENE + LOG DURABILITY.
// ---------------------------------------------------------------------------

describe('Bash gate — log hygiene and durability', () => {
  it('[20] the coverage log entry carries no raw command text', () => {
    writeCoveringPlan(); setState(10); setMode('strict');
    runHook('echo SECRETVALUE > src/uncovered.js');
    const entries = logEntries();
    assert.ok(entries.length > 0, 'a deny must be logged');
    for (const e of entries) {
      assert.equal(e.command, undefined, 'no entry carries a command field');
      assert.ok(!JSON.stringify(e).includes('SECRETVALUE'), 'no entry carries the raw command text');
    }
    const block = entries.find((e) => e.outcome === 'block');
    assert.ok(block && block.target_file, 'the block entry carries the target_file');
  });

  it('[18] a failing log write does not change the deny outcome or crash the hook', () => {
    writeCoveringPlan(); setState(10); setMode('strict');
    // Make the log path a DIRECTORY so logEnforcement throws internally.
    const logFile = path.join(project, '.ctoc', 'logs', 'enforcement.json');
    fs.mkdirSync(logFile, { recursive: true });
    assertBlocked('echo x > src/uncovered.js', 'the deny survives a broken log',
      /no approved plan covers/i);
  });
});
