/**
 * CTOC — PreToolUse.Bash payload reader (plan 00206)
 *
 * The Bash gate reads its command from the PreToolUse JSON payload on STDIN. The
 * OLD reader failed OPEN on every route it could not read: a JSON parse failure
 * fell back to a regex whose capture stopped at the FIRST quote, so a payload
 * hiding `echo "x" > src/uncovered.js` was evaluated as `echo \` — a PREFIX of what
 * the shell runs — and ALLOWED. A gate that reports a verdict on input it never
 * received is the truncate-then-parse family this repo fences, sitting inside a
 * permission hook.
 *
 * THE FIX (readPayload), scoped by the two decisions recorded in the plan:
 *   DECISION 1 (fail closed on UNDECODABLE input): a NON-EMPTY payload that will
 *     not cleanly JSON.parse is DENIED — the regex-truncation fallback is deleted.
 *     If it cannot be parsed, the command cannot be cleared.
 *   DECISION 2 (an empty read is a SUCCESS, not a failure): raw === '' (empty pipe /
 *     absent pipe — indistinguishable zero-byte reads), and cleanly-parsed JSON with
 *     genuinely no command (missing key, null, non-string, or "") are ALLOWED. There
 *     is nothing to gate, and denying an empty read risks denying every Bash command
 *     in every install if the harness ever delivers no pipe.
 *
 * Drives the REAL spawned hook (the harness's transport), never a require — the hook
 * exports nothing. A deny is `permissionDecision:"deny"` on stdout (shared emitter,
 * exit 2); an allow is exit 0 with no decision JSON.
 *
 * Run with: node --test tests/bash-gate-payload-reader.test.js
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

let project;

/** Hermetic CTOC project in a temp dir (realpath'd for macOS /tmp symlink). */
function makeProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-bash-reader-')));
  fs.mkdirSync(path.join(dir, '.ctoc', 'approvals'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ctoc', 'logs'), { recursive: true });
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

/** Plant valid, signed Iron-Loop state at `step`, feature set. */
function setState(step, feature = 'reader-feature') {
  const state = stateManager.createState(project, feature, 'javascript', null);
  state.currentStep = step;
  stateManager.saveState(project, state);
}

/** Spawn the hook with an arbitrary RAW stdin payload string. */
function runRaw(rawPayload, spawnOpts = {}) {
  return spawnSync(process.execPath, [HOOK], Object.assign({
    cwd: project,
    input: rawPayload,
    env: { ...process.env, CLAUDE_TOOL_INPUT: '' },
    encoding: 'utf8',
  }, spawnOpts));
}

/** Spawn the hook with a well-formed PreToolUse payload wrapping `command`. */
function runHook(command) {
  return runRaw(JSON.stringify({ tool_name: 'Bash', tool_input: { command } }));
}

/** The deny decision on stdout, or null when the run ALLOWED. */
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

function isDenied(res) { return denyDecision(res) !== null; }
function denyReason(res) { const d = denyDecision(res); return d ? (d.permissionDecisionReason || '') : ''; }

function assertDenied(res, msg) {
  assert.equal(res.signal, null, `hook crashed (signal): ${msg}`);
  assert.equal(isDenied(res), true,
    `${msg} — expected DENY (got exit ${res.status})\nstdout=${res.stdout || ''}\nstderr=${res.stderr || ''}`);
}
function assertAllowed(res, msg) {
  assert.equal(res.signal, null, `hook crashed (signal): ${msg}`);
  assert.equal(isDenied(res), false,
    `${msg} — expected ALLOW (got exit ${res.status})\nstdout=${res.stdout || ''}\nstderr=${res.stderr || ''}`);
}

// A malformed payload that HIDES a real redirect behind a quote — the exact defect:
// the old regex fallback captured `echo \` and cleared the `> src/uncovered.js`.
const MALFORMED_HIDING_REDIRECT = '{bad json "command":"echo \\"x\\" > src/uncovered.js"';

beforeEach(() => { project = makeProject(); });
afterEach(() => { cleanupProject(project); project = null; });

// ---------------------------------------------------------------------------
// DECISION 1 — a NON-EMPTY, undecodable payload fails CLOSED (deny)
// ---------------------------------------------------------------------------
describe('Bash reader — undecodable payload is denied (no regex-truncation allow)', () => {
  beforeEach(() => setState(10));

  it('[1] malformed JSON hiding a redirect is DENIED (was allowed via the truncating regex)', () => {
    const res = runRaw(MALFORMED_HIDING_REDIRECT);
    assertDenied(res, 'a malformed payload hiding a redirect must not be cleared on a truncated prefix');
    assert.match(denyReason(res), /could not be inspected|not valid JSON/i,
      `the deny names the unreadable reason (got: ${denyReason(res)})`);
  });

  it('[2] plain non-JSON stdin is DENIED', () => {
    assertDenied(runRaw('not-json-at-all'), 'a non-JSON payload cannot be cleared');
  });

  it('[3] a truncated JSON object is DENIED', () => {
    assertDenied(runRaw('{"tool_input":{"command":"echo hi'), 'truncated JSON cannot be cleared');
  });
});

// ---------------------------------------------------------------------------
// GUARD — a VALID payload is read in FULL (the redirect after the quote is seen)
// ---------------------------------------------------------------------------
describe('Bash reader — a valid payload is read whole, never a prefix', () => {
  beforeEach(() => setState(10));

  it('[4] valid JSON with a quoted redirect to an UNCOVERED file is denied by coverage (full command seen)', () => {
    // Proves the reader delivers the WHOLE command including the redirect that lives
    // after the quote — the coverage stage (00202) then denies the uncovered write.
    const res = runHook('echo "x" > src/uncovered.js');
    assertDenied(res, 'the redirect after the quote must be read and reach the coverage gate');
    assert.match(denyReason(res), /no approved plan covers|uncovered/i,
      `denied by the coverage gate, not the reader (got: ${denyReason(res)})`);
  });
});

// ---------------------------------------------------------------------------
// DECISION 2 — an empty read is a SUCCESS, and no-command JSON is readable → ALLOW
// ---------------------------------------------------------------------------
describe('Bash reader — empty / no-command payloads are allowed (not a read failure)', () => {
  beforeEach(() => setState(10));

  it('[5] empty stdin (empty pipe) is ALLOWED', () => {
    assertAllowed(runRaw(''), 'an empty pipe is a successful zero-byte read, not a failure');
  });

  it('[6] no stdin redirection (absent pipe) is ALLOWED and does not hang', () => {
    // stdio.stdin = "ignore" ⇒ the child reads /dev/null ⇒ '' — the absent-pipe shape,
    // indistinguishable from an empty pipe. A 5s timeout proves readFileSync(0) never blocks.
    const res = runRaw(undefined, { stdio: ['ignore', 'pipe', 'pipe'], input: undefined, timeout: 5000 });
    assertAllowed(res, 'an absent pipe must allow, never hang');
  });

  it('[7] valid JSON with no command field ({}) is ALLOWED', () => {
    assertAllowed(runRaw('{}'), 'readable JSON with no command has nothing to gate');
  });

  it('[8] valid JSON with command:null is ALLOWED', () => {
    assertAllowed(runRaw(JSON.stringify({ command: null })), 'null command is readable, nothing to gate');
  });

  it('[9] valid JSON with a non-string command (42) is ALLOWED', () => {
    assertAllowed(runRaw(JSON.stringify({ tool_input: { command: 42 } })), 'a non-string command is readable, nothing to gate');
  });

  it('[10] valid JSON with command:"" is ALLOWED', () => {
    assertAllowed(runHook(''), 'an empty command string is nothing to gate');
  });
});

// ---------------------------------------------------------------------------
// BLAST RADIUS — ordinary work and real denies are unaffected by the reader change
// ---------------------------------------------------------------------------
describe('Bash reader — existing allow/deny outcomes are preserved', () => {
  beforeEach(() => setState(10));

  it('[11] a benign valid command is ALLOWED', () => {
    assertAllowed(runHook('echo hi'), 'a benign command is unaffected');
  });

  it('[12] a read-only command is ALLOWED', () => {
    assertAllowed(runHook('git status'), 'git status is a read, allowed');
  });

  it('[13] a dangerous command (rm -rf) is still DENIED', () => {
    assertDenied(runHook('rm -rf plans'), 'the fix must not weaken a real deny');
  });

  it('[14] a very large valid payload (1 MiB command) is handled without truncation', () => {
    // A benign 1 MiB echo: no read cap, so it is read whole and allowed. If a cap were
    // (re)introduced, the classifier would see a truncated command — the defect this fixes.
    assertAllowed(runHook('echo ' + 'a'.repeat(1024 * 1024)), 'no read cap — the full payload is read');
  });
});

// ---------------------------------------------------------------------------
// SOURCE — the truncating regex fallback is GONE, and no payload bytes leak
// ---------------------------------------------------------------------------
describe('Bash reader — the regex fallback is deleted and no payload text leaks', () => {
  it('[15] the hook source contains no `raw.match` regex-extraction fallback', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.ok(!/raw\.match\s*\(/.test(src),
      'the quote-truncating regex fallback must be deleted — a behavioural test cannot prove the '
      + 'absence of a fallback that only fires on inputs it would have to guess');
  });

  it('[16] the deny for an undecodable payload carries NO payload bytes', () => {
    setState(10);
    const res = runRaw(MALFORMED_HIDING_REDIRECT);
    assertDenied(res, 'undecodable payload denied');
    const emitted = String(res.stdout || '') + String(res.stderr || '');
    assert.ok(!emitted.includes('uncovered.js') && !emitted.includes('echo'),
      `an unreadable payload is untrusted bytes and may carry a secret — it must never reach a `
      + `message or banner (leaked: ${emitted.slice(0, 200)})`);
  });
});

// ---------------------------------------------------------------------------
// WINDOWS — CRLF line endings in the payload
// ---------------------------------------------------------------------------
describe('Bash reader — CRLF payloads', () => {
  beforeEach(() => setState(10));

  it('[17] a valid CRLF payload is ALLOWED', () => {
    assertAllowed(runRaw(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'echo hi' } }) + '\r\n'),
      'trailing CRLF on a valid payload is fine');
  });

  it('[18] a malformed CRLF payload is DENIED', () => {
    assertDenied(runRaw(MALFORMED_HIDING_REDIRECT + '\r\n'), 'CRLF does not rescue an undecodable payload');
  });
});
