/**
 * CTOC Coverage Test — PreToolUse.Bash gate DARK branches (the REAL hook process)
 *
 * Companion to tests/security-bash-hook.test.js. That file pins the write/commit
 * step gates, the input channel (stdin, not env), and a slice of the bypass
 * surface. This file drives the branches that file leaves DARK — every one a
 * BLOCK-vs-ALLOW decision on the parsed Bash command that a mutant would flip:
 *
 *   - LEDGER FORGERY gate (isLedgerForgery + isReadOnlyLedgerCommand + normalize):
 *       a write that TOUCHES .ctoc/approvals/ is denied; a pure READ of it is
 *       allowed; an inline-eval that names the ledger module / a gate verb, or
 *       carries a command substitution / non-literal require(), is denied; a
 *       plain inline-eval (literal require, no ledger) is ALLOWED. (src lines
 *       197-201, 215-254, 548-554.)
 *   - OPAQUE decode piped into an interpreter is denied via the opaque path,
 *       exercising the `forgery.deny ? : opaque` false branch. (546, 550.)
 *   - IRREVERSIBLE git subcommands via the token-walk: reset --hard, clean -f,
 *       branch -D, checkout .  — plus the negations that keep --soft / -n /
 *       branch-create / checkout-a-file ALLOWED. (405-412.)
 *   - isDestructiveRm LONG-FORM flags (`--recursive --force`) and the
 *       case-sensitive force flag (`-Rf` denies, `-RF` allows — F is not f).
 *       (326-330, 333-334.)
 *   - SQL-driver DELETE denied but the same text in an `echo` allowed. (350.)
 *   - isWriteCommand ` > ` / ` >> ` includes() fallback — the trailing-redirect
 *       shapes the WRITE_PATTERNS regexes miss. (440-442.)
 *   - Raw mv/cp of a plan file across stage dirs denied; the sanctioned
 *       node scripts/move-plan.js and a non-plan mv allowed. (571-596.)
 *
 * Every test SPAWNS the real src/hooks/PreToolUse.Bash.js — no re-implemented
 * regexes, no mocked core logic. The only fakes are at the true boundaries:
 * the signed state file (planted with the real state-manager) and the stdin
 * JSON payload. Temp projects live under os.tmpdir() and are removed in
 * afterEach. A deny is `permissionDecision:"deny"` on stdout (shared emitter,
 * exit 2); an allow is exit 0 with no decision JSON.
 *
 * NOTE — human-reviewed (Tijn's unit-test-writer bar): every assertion below was
 * traced against the source by hand; each pins a branch that goes RED under
 * mutation, not a happy-path line-coverage hit.
 *
 * Run with: node --test tests/pretooluse-bash-coverage.test.js
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

// --- hermetic project + signed-state harness (mirrors security-bash-hook) ----

let project;

/** Create a hermetic CTOC project in a temp dir (realpath'd for macOS /tmp). */
function makeProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-bash-cov-')));
  fs.mkdirSync(path.join(dir, '.ctoc', 'approvals'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# CTOC Project Instructions\n');
  for (const stage of ['functional', 'implementation', 'todo', 'review', 'done']) {
    fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  }
  return dir;
}

/** Remove the temp project AND its out-of-tree signed state file. */
function cleanupProject(dir) {
  if (!dir) return;
  try { fs.rmSync(stateManager.getStatePath(dir), { force: true }); } catch { /* may not exist */ }
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Plant a valid, signed Iron-Loop state for `project`. */
function setState(step, feature = 'coverage-test-feature') {
  const state = stateManager.createState(project, feature, 'javascript', null);
  state.currentStep = step;
  stateManager.saveState(project, state);
}

/** Run the REAL hook against `command`, delivered as the PreToolUse JSON payload on stdin. */
function runHook(command) {
  return spawnSync(process.execPath, [HOOK], {
    cwd: project,
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    env: { ...process.env, CLAUDE_TOOL_INPUT: '' },
    encoding: 'utf8'
  });
}

/** The deny decision emitted on stdout, or null when the run ALLOWED. */
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

/** Assert BLOCK; optionally assert a substring of the deny reason to pin the branch. */
function assertBlocked(command, msg, reasonRe) {
  const res = runHook(command);
  assert.equal(res.signal, null, `hook crashed (signal) on ${JSON.stringify(command)}`);
  assert.equal(isDenied(res), true,
    `${msg || 'expected BLOCK'} for ${JSON.stringify(command)} (got exit ${res.status})\nstdout=${res.stdout || ''}\nstderr=${res.stderr || ''}`);
  if (reasonRe) {
    const reason = (denyDecision(res).permissionDecisionReason) || '';
    assert.match(reason, reasonRe,
      `deny reason for ${JSON.stringify(command)} should identify the right gate`);
  }
}

/** Assert ALLOW (no deny JSON). */
function assertAllowed(command, msg) {
  const res = runHook(command);
  assert.equal(res.signal, null, `hook crashed (signal) on ${JSON.stringify(command)}`);
  assert.equal(isDenied(res), false,
    `${msg || 'expected ALLOW'} for ${JSON.stringify(command)} (got exit ${res.status})\nstdout=${res.stdout || ''}\nstderr=${res.stderr || ''}`);
}

beforeEach(() => { project = makeProject(); });
afterEach(() => { cleanupProject(project); project = null; });

// ---------------------------------------------------------------------------
// CLUSTER A — ledger-write deny vs ledger-READ allow (isReadOnlyLedgerCommand,
// the LEDGER_PATH deny at src 215-220, normalizeForMatch quote/sep stripping).
// Kills: a mutant that drops the read-only exception (would deny a legit read),
// or drops the write deny (would forge a gate through the Bash channel).
// ---------------------------------------------------------------------------

describe('Bash gate — approval-ledger write is denied, read is allowed', () => {
  // No setState on purpose: forgery is the FIRST layer, BEFORE state load, and
  // formatBlocked must survive a null state (currentStep?.||1 fallback).

  const ledgerWrites = [
    { id: 'redirect', cmd: 'cat foo > .ctoc/approvals/gate2.json' },
    { id: 'append', cmd: 'echo x >> .ctoc/approvals/gate3.json' },
    { id: 'tee', cmd: 'echo x | tee .ctoc/approvals/g.json' },
    { id: 'cp', cmd: 'cp evil.json .ctoc/approvals/g.json' },
    { id: 'mv', cmd: 'mv evil.json .ctoc/approvals/g.json' },
    { id: 'rm', cmd: 'rm .ctoc/approvals/g.json' },
    { id: 'sed-in-place', cmd: 'sed -i s/a/b/ .ctoc/approvals/g.json' },
    { id: 'touch', cmd: 'touch .ctoc/approvals/g.json' },
    { id: 'quoted-path', cmd: 'cat foo > .ctoc"/"approvals/g.json' },   // normalize strips quotes
  ];
  for (const { id, cmd } of ledgerWrites) {
    it(`denies a write that touches the ledger [${id}]`, () => {
      assertBlocked(cmd, 'ledger write must be denied', /approval ledger/i);
    });
  }

  const ledgerReads = [
    { id: 'cat', cmd: 'cat .ctoc/approvals/gate2.json' },
    { id: 'ls', cmd: 'ls .ctoc/approvals/' },
    { id: 'grep', cmd: 'grep human .ctoc/approvals/gate2.json' },
    { id: 'jq', cmd: 'jq . .ctoc/approvals/gate2.json' },
  ];
  for (const { id, cmd } of ledgerReads) {
    it(`allows a pure read of the ledger [${id}]`, () => {
      setState(5); // a read is not a write; even at planning step it is allowed
      assertAllowed(cmd, 'pure ledger read must not be denied');
    });
  }
});

// ---------------------------------------------------------------------------
// CLUSTER B — inline-eval that reaches the ledger module / a gate-crossing verb
// (LEDGER_EVAL_TOKENS loop, src 224-232) across every isInlineEval OR operand
// (node -e, deno eval, bun eval, pipe-into-node). node is in ALWAYS_ALLOWED, so
// this proves forgery runs AHEAD of the allowlist. Kills the reorder mutant and
// each operand of the isInlineEval `||`.
// ---------------------------------------------------------------------------

describe('Bash gate — inline-eval touching the ledger is denied (ahead of ALWAYS_ALLOWED)', () => {
  beforeEach(() => setState(16)); // even fully past the pipeline, forgery still denies

  const evals = [
    { id: 'node -e require(approval-ledger)', cmd: `node -e "require('./src/lib/approval-ledger').writeEntry({})"` },
    { id: 'node --eval approvePlan', cmd: `node --eval "require('x').approvePlan('p')"` },
    { id: 'node -e stampAndLedger verb', cmd: `node -e "require('x').stampAndLedger('p')"` },
    { id: 'deno eval writeEntry', cmd: `deno eval "writeEntry()"` },       // 2nd || operand
    { id: 'bun eval approveSubplans', cmd: `bun eval "approveSubplans('p')"` }, // 3rd || operand
    { id: 'pipe-into-node', cmd: `echo "require('approval-ledger')" | node` }, // 4th || operand
  ];
  for (const { id, cmd } of evals) {
    it(`denies inline-eval reaching the ledger [${id}]`, () => {
      assertBlocked(cmd, 'inline-eval ledger forgery must be denied', /inline evaluation/);
    });
  }

  // NEGATION — a plain inline-eval with a LITERAL require and no ledger token is
  // ALLOWED. This is the single most important mutant-killer of the cluster:
  // it proves the gate denies on the LEDGER reference, not on "inline eval" itself.
  it('allows a plain inline-eval (literal require, no ledger reference)', () => {
    assertAllowed(`node -e "require('fs').readdirSync('.')"`, 'benign inline-eval must not be denied');
  });
  it('allows an inline-eval with no require at all', () => {
    assertAllowed(`node -e "console.log(1 + 2)"`, 'benign inline-eval must not be denied');
  });
});

// ---------------------------------------------------------------------------
// CLUSTER C — inline-eval that cannot be statically cleared: a command
// substitution in the payload (src 237-242), or a non-literal require argument
// (src 243-252). Boundary partner: the literal-require allow above already pins
// the negation for the require check.
// ---------------------------------------------------------------------------

describe('Bash gate — un-clearable inline-eval is denied', () => {
  beforeEach(() => setState(16));

  it('denies inline-eval whose payload is a command substitution', () => {
    assertBlocked(`node -e "$(cat some-code.js)"`,
      'command-substitution payload cannot be statically cleared', /command substitution/);
  });

  it('denies inline-eval with a non-literal (concatenated) require argument', () => {
    assertBlocked(`node -e "require('./mod' + name)"`,
      'concatenated require hides the real module', /non-literal require/);
  });

  it('denies inline-eval with a template-literal require argument', () => {
    assertBlocked('node -e "require(`./${m}`)"',
      'template-literal require hides the real module', /command substitution|non-literal require/);
  });
});

// ---------------------------------------------------------------------------
// CLUSTER D — opaque decoder piped into an interpreter (isOpaqueDecodedExecution,
// src 546 + the `forgery.deny ? : opaque` FALSE branch at 550). The command is
// NOT ledger-forgery (isInlineEval true via the pipe, but no ledger token), so it
// is denied by the DISTINCT opaque path — killing the mutant that collapses the
// two reasons.
// ---------------------------------------------------------------------------

describe('Bash gate — opaque decode piped into an interpreter is denied', () => {
  beforeEach(() => setState(16));

  const opaque = [
    { id: 'base64|node', cmd: 'base64 -d payload.b64 | node' },
    { id: 'xxd|bash', cmd: 'xxd -r -p hex.txt | bash' },
    { id: 'openssl|sh', cmd: 'openssl enc -d -aes-256-cbc -in c.bin | sh' },
    { id: 'base64|python', cmd: 'base64 -d p.b64 | python3' },
  ];
  for (const { id, cmd } of opaque) {
    it(`denies opaque decode into interpreter [${id}]`, () => {
      assertBlocked(cmd, 'opaque decoded execution must be denied', /base64|decoded/);
    });
  }

  // NEGATION — a decoder piped to a NON-interpreter (wc) is not opaque-execution.
  it('allows a decoder piped to a non-interpreter (wc)', () => {
    assertAllowed('base64 -d p.b64 | wc -c', 'decode-to-wc is not code execution');
  });
});

// ---------------------------------------------------------------------------
// CLUSTER E — isDestructiveRm long-form flags and case-sensitive force flag
// (src 326-330 long form; 333-334 short cluster / case). Kills: the mutant that
// only handles `-rf`, the `&& force` requirement, and the case-sensitive `f`.
// ---------------------------------------------------------------------------

describe('Bash gate — destructive rm requires BOTH recursive AND force', () => {
  beforeEach(() => setState(16)); // past the write gate, so only the irreversible net can deny

  const denied = [
    { id: 'long --recursive --force', cmd: 'rm --recursive --force build' },
    { id: 'mixed -R --force', cmd: 'rm -R --force build' },
    { id: 'mixed --recursive -f', cmd: 'rm --recursive -f build' },
    { id: 'split -r -f', cmd: 'rm -r -f build' },
    { id: 'cluster -Rf (lowercase f)', cmd: 'rm -Rf build' },
  ];
  for (const { id, cmd } of denied) {
    it(`denies destructive rm [${id}]`, () => {
      assertBlocked(cmd, 'recursive+force rm must be denied', /irreversible|destructive/i);
    });
  }

  const allowed = [
    { id: 'recursive only (long)', cmd: 'rm --recursive build' },
    { id: 'force only (long)', cmd: 'rm --force build' },
    { id: 'recursive only (short)', cmd: 'rm -r build' },
    { id: 'force only (short)', cmd: 'rm -f build' },
    { id: 'no flags', cmd: 'rm build.log' },
    { id: 'cluster -RF (uppercase F is NOT force)', cmd: 'rm -RF build' },
  ];
  for (const { id, cmd } of allowed) {
    it(`allows non-destructive rm [${id}]`, () => {
      assertAllowed(cmd, 'rm missing one of recursive/force must be allowed');
    });
  }
});

// ---------------------------------------------------------------------------
// CLUSTER F — destructive git via the subcommand token-walk (src 405-412), and
// the negations that must stay allowed. Global flags are interposed to prove the
// walk skips them rather than matching the first token.
// ---------------------------------------------------------------------------

describe('Bash gate — destructive git subcommands are denied', () => {
  beforeEach(() => setState(16));

  const denied = [
    { id: 'reset --hard', cmd: 'git reset --hard' },
    { id: 'reset --hard HEAD~2', cmd: 'git reset --hard HEAD~2' },
    { id: 'reset --hard behind -C', cmd: 'git -C /tmp/x reset --hard' },
    { id: 'clean -f', cmd: 'git clean -f' },
    { id: 'clean --force', cmd: 'git clean --force' },
    { id: 'clean -fd', cmd: 'git clean -fd' },
    { id: 'clean -f behind -c', cmd: 'git -c core.pager=cat clean -f' },
    { id: 'branch -D', cmd: 'git branch -D feature' },
    { id: 'branch --delete', cmd: 'git branch --delete feature' },
    { id: 'checkout .', cmd: 'git checkout .' },
    { id: 'checkout . behind -C', cmd: 'git -C dir checkout .' },
  ];
  for (const { id, cmd } of denied) {
    it(`denies destructive git [${id}]`, () => {
      assertBlocked(cmd, 'destructive git subcommand must be denied', /irreversible|destructive/i);
    });
  }

  const allowed = [
    { id: 'reset --soft', cmd: 'git reset --soft HEAD~1' },
    { id: 'reset (mixed, no --hard)', cmd: 'git reset HEAD' },
    { id: 'clean -n (dry run)', cmd: 'git clean -n' },
    { id: 'clean --dry-run', cmd: 'git clean --dry-run' },
    { id: 'branch create', cmd: 'git branch feature' },
    { id: 'branch -a (list)', cmd: 'git branch -a' },
    { id: 'checkout a branch', cmd: 'git checkout main' },
    { id: 'checkout a file (not .)', cmd: 'git checkout src/file.js' },
  ];
  for (const { id, cmd } of allowed) {
    it(`allows non-destructive git [${id}]`, () => {
      assertAllowed(cmd, 'non-destructive git must be allowed');
    });
  }
});

// ---------------------------------------------------------------------------
// CLUSTER G — SQL driver DELETE is denied, but the same text under `echo` is
// allowed (src 350: SQL_DRIVER && SQL_DELETE). This is the exact false-positive
// the driver-token design eliminates — prose mentioning DELETE FROM is not a DB
// write. Kills the mutant that drops either conjunct.
// ---------------------------------------------------------------------------

describe('Bash gate — SQL DELETE via a driver is denied, prose is allowed', () => {
  beforeEach(() => setState(16));

  it('denies a psql-issued DELETE FROM', () => {
    assertBlocked(`psql -c "DELETE FROM users WHERE id = 1"`,
      'driver-issued delete must be denied', /irreversible|destructive/i);
  });
  it('denies a mysql-issued DELETE FROM (no WHERE)', () => {
    assertBlocked(`mysql -e "DELETE FROM sessions"`,
      'driver-issued delete must be denied', /irreversible|destructive/i);
  });
  it('allows prose mentioning DELETE FROM with no driver (echo)', () => {
    assertAllowed(`echo "remember to DELETE FROM users someday"`,
      'a benign echo of DELETE FROM is not a DB write');
  });
});

// ---------------------------------------------------------------------------
// CLUSTER H — isWriteCommand ` > ` / ` >> ` includes() fallback (src 440-442).
// These trailing-redirect shapes are NOT caught by the WRITE_PATTERNS regexes
// (the regex requires a non-space target after `>`), so classification falls
// through to the literal-substring check — the SECOND operand ` >> ` of the `||`
// is isolated by a command that lacks ` > `. Denied at the planning step (5<8).
// ---------------------------------------------------------------------------

describe('Bash gate — trailing-redirect write classification (includes fallback)', () => {
  beforeEach(() => setState(5)); // step < 8 => a write must be blocked

  it('classifies a trailing " > " (empty target) as a WRITE', () => {
    // "zz > " has no non-space target, so WRITE_PATTERNS miss it; only the
    // command.includes(' > ') fallback catches it. FIRST operand of the ||.
    assertBlocked('zz > ', 'trailing " > " must classify as a write', /WRITE|planning/i);
  });

  it('classifies a trailing " >> " as a WRITE via the second || operand', () => {
    // "zz >> " does NOT contain " > " (the chars are space-> -> space), so the
    // first operand is false and the ` >> ` operand is the one that must fire.
    assert.equal('zz >> '.includes(' > '), false, 'guard: first operand must be false here');
    assertBlocked('zz >> ', 'trailing " >> " must classify as a write', /WRITE|planning/i);
  });

  it('does NOT classify a plain word with no redirect as a write (allowed at step 8)', () => {
    setState(8);
    assertAllowed('somebinary --flag value', 'a non-redirecting command is not a write');
  });
});

// ---------------------------------------------------------------------------
// CLUSTER I — raw plan-file move across stage dirs is denied (src 571-596); the
// sanctioned node scripts/move-plan.js and a non-plan mv are allowed. This block
// runs BEFORE state load, so it fires regardless of step.
// ---------------------------------------------------------------------------

describe('Bash gate — raw plan-file move is denied', () => {
  const planMoves = [
    { id: 'mv todo->done', cmd: 'mv plans/todo/x.md plans/done/' },
    { id: 'cp implementation->review', cmd: 'cp plans/implementation/a.md plans/review/a.md' },
    { id: 'mv functional->implementation', cmd: 'mv plans/functional/f.md plans/implementation/' },
  ];
  for (const { id, cmd } of planMoves) {
    it(`denies raw plan move [${id}]`, () => {
      assertBlocked(cmd, 'raw mv/cp of a plan file must be denied', /plan/i);
    });
  }

  it('allows the sanctioned node scripts/move-plan.js mover', () => {
    setState(16);
    assertAllowed('node scripts/move-plan.js my-slug todo done',
      'the controlled move-plan.js API must be allowed');
  });

  it('allows a non-plan mv (path does not match plans/<stage>/)', () => {
    setState(16);
    assertAllowed('mv notes.txt archive/notes.txt',
      'a move outside plans/<stage>/ is not a plan transition');
  });
});

// ---------------------------------------------------------------------------
// CLUSTER J — assorted irreversible-net patterns that security-bash-hook never
// takes (its .some() short-circuits on force-push). These pin individual
// IRREVERSIBLE_PATTERNS entries plus the command-boundary anchors the module
// comments promise ("add if=" must NOT match "dd if=").
// ---------------------------------------------------------------------------

describe('Bash gate — irreversible-pattern entries and their boundary negations', () => {
  beforeEach(() => setState(16)); // past every step gate; only the irreversible net can deny

  const denied = [
    { id: 'DROP TABLE', cmd: 'DROP TABLE users' },
    { id: 'TRUNCATE TABLE', cmd: 'TRUNCATE TABLE audit' },
    { id: 'terraform destroy', cmd: 'terraform destroy -auto-approve' },
    { id: 'kubectl delete namespace', cmd: 'kubectl delete namespace prod' },
    { id: 'mkfs', cmd: 'mkfs.ext4 /dev/sdb1' },
    { id: 'chmod -R 777', cmd: 'chmod -R 777 /srv' },
    { id: 'redirect to /dev/sd', cmd: 'echo x > /dev/sda' },
    { id: 'dd if= (irreversible, not write-gate)', cmd: 'dd if=/dev/zero of=disk.img bs=1M' },
  ];
  for (const { id, cmd } of denied) {
    it(`denies irreversible command [${id}]`, () => {
      assertBlocked(cmd, 'irreversible command must be denied', /irreversible|destructive/i);
    });
  }

  const allowed = [
    { id: 'terraform plan (not destroy)', cmd: 'terraform plan' },
    { id: 'kubectl get (not delete)', cmd: 'kubectl get pods' },
    { id: 'chmod -R 755 (not 777)', cmd: 'chmod -R 755 /srv' },
    { id: '"add if=" does not match "dd if="', cmd: 'add if=/dev/zero of=x' },
  ];
  for (const { id, cmd } of allowed) {
    it(`allows the boundary negation [${id}]`, () => {
      assertAllowed(cmd, 'boundary/negation must not be denied as irreversible');
    });
  }
});

// ---------------------------------------------------------------------------
// DOCUMENTED UNREACHABLE — src/hooks/PreToolUse.Bash.js lines 641-644
//   main().catch(err => { console.error(...); process.exit(1); });
//
// main() cannot reject through the public stdin payload API, so this catch is
// unreachable by any command a caller can send:
//   - getCommand() fails OPEN (its try/catch returns '' on read/parse error);
//   - loadState() catches internally and always returns { state, ... } — it
//     never throws (verified in src/lib/state-manager.js loadState, lines
//     96-125: the JSON.parse / verify body is wrapped in try/catch);
//   - every gate decision (isLedgerForgery, isIrreversibleCommand,
//     isCommitCommand, isWriteCommand) is a pure linear-time regex over a
//     string and cannot throw;
//   - every terminal path calls process.exit inside emitDeny (code 2) or
//     process.exit(0), so main() resolves/terminates rather than rejecting.
// Reaching the catch requires a module-load or stream fault (e.g. a broken
// stdout pipe) that is NOT expressible as a stdin payload; fabricating a hit
// would require corrupting internal state the public API never emits, so per
// the unit-test-writer honesty clause it is documented here, not faked.
// ---------------------------------------------------------------------------
