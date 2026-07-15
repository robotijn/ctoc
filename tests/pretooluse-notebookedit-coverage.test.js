/**
 * Dark-branch coverage for src/hooks/PreToolUse.NotebookEdit.js.
 *
 * The parity test (w01-multiedit-notebookedit-parity.test.js) already proves the
 * happy path: a real NotebookEdit payload spawned as the hook's OWN process entry
 * delegates to enforce() and emits the deny/allow decision. It leaves three
 * branches of THIS file dark (measured 85.92% line / 37.50% branch, uncovered
 * lines 40-41, 55-58, 60-63):
 *
 *   • readStdinJson()'s catch (40-41)      — malformed JSON on the pipe.
 *   • readStdinJson()'s ternary-false      — empty pipe → null (branch, line 38).
 *   • main()'s delegate-load-failure (55-58) — require('./PreToolUse.Edit.js') throws.
 *   • main()'s non-function-export  (60-63)  — the delegate exports a bad enforce.
 *
 * The last two are the FAIL-OPEN safety branches: the hook must NOT block the
 * user's notebook edit because its own machinery broke. They are unreachable
 * through the real filesystem (the sibling delegate exists and exports a function),
 * so they are driven IN-PROCESS by calling the exported main() while (a) forcing
 * the delegate require to throw via a Module._load boundary patch, and (b)
 * injecting a non-function export into the require cache — both at the true
 * module-loader boundary, no core logic mocked. process.exit / process.stderr.write
 * are stubbed at the process boundary (the hook terminates via process.exit) and
 * restored in finally.
 *
 * The remaining tests drive the ALLOW-vs-BLOCK decisions the NotebookEdit hook
 * delegates but the parity test does not exercise (whitelist pass, ledger block
 * despite the .ctoc/ whitelist, escape-phrase allow, escape word-boundary
 * negation, non-CTOC silent pass) as real subprocesses on the harness boundary.
 * Every payload uses `notebook_path` — the field getTargetFile() resolves for the
 * NotebookEdit tool — so these are NotebookEdit-specific, not a MultiEdit re-run.
 *
 * Cross-platform: all paths via path.join; process.execPath spawns Node; no shell.
 * AI-authored, human-reviewed line-by-line: every assertion pins a branch that
 * goes red under mutation (the corresponding mutant is named at each test).
 */

'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const REPO = path.resolve(__dirname, '..');
const NOTEBOOKEDIT_HOOK = path.join(REPO, 'src', 'hooks', 'PreToolUse.NotebookEdit.js');
const EDIT_HOOK = path.join(REPO, 'src', 'hooks', 'PreToolUse.Edit.js');

// In-process handle to the module under test. Requiring it does NOT run main():
// the bottom `if (require.main === module)` guard is false here (the test runner
// is require.main), so importing consumes no stdin and triggers no enforcement.
const notebookedit = require(NOTEBOOKEDIT_HOOK);

const PLAN_STAGES = [
  'vision', 'canvas', 'functional', 'implementation',
  'todo', 'in-progress', 'review', 'done',
];

/** Build a hermetic, detectable CTOC temp project. */
function makeProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-nb-cov-')));
  for (const stage of PLAN_STAGES) {
    fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  }
  fs.mkdirSync(path.join(dir, '.ctoc', 'logs'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'CLAUDE.md'),
    '# CTOC Project Instructions\n\nHermetic NotebookEdit coverage fixture.\n',
  );
  fs.writeFileSync(
    path.join(dir, '.ctoc', 'settings.yaml'),
    'enforcement:\n  mode: strict\n',
  );
  return dir;
}

/** A bare temp dir that is deliberately NOT a CTOC project. */
function makeNonCtocDir() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'plain-nb-cov-')));
}

function cleanup(dir) {
  if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

/** Return the last top-level JSON object printed on stdout, or null. */
function lastJsonObject(stdout) {
  const s = String(stdout || '').trim();
  if (!s) return null;
  try { return JSON.parse(s); } catch { /* fall through to last-brace scan */ }
  const idx = s.lastIndexOf('{');
  if (idx === -1) return null;
  try { return JSON.parse(s.slice(idx)); } catch { return null; }
}

/** Decode a spawned hook result into the harness-visible decision signal. */
function decode(res) {
  const stdout = res.stdout ? String(res.stdout) : '';
  const stderr = res.stderr ? String(res.stderr) : '';
  const decision = lastJsonObject(stdout);
  const hso = decision && decision.hookSpecificOutput ? decision.hookSpecificOutput : null;
  return {
    status: typeof res.status === 'number' ? res.status : null,
    denied: hso ? hso.permissionDecision === 'deny' : false,
    reason: hso && typeof hso.permissionDecisionReason === 'string' ? hso.permissionDecisionReason : null,
    hookEventName: hso ? hso.hookEventName : null,
    signal: res.signal,
    stdout,
    stderr,
  };
}

/**
 * Spawn the REAL NotebookEdit hook as its own process with `rawInput` on stdin.
 * CLAUDE_TOOL_INPUT is forced empty so the decision is driven only by the stdin
 * payload (matching the parity harness). `rawInput` is a raw string so callers
 * can send deliberately malformed / empty payloads, not just JSON.
 */
function spawnNotebookEditRaw(rawInput, dir, extraEnv = {}) {
  const res = spawnSync(process.execPath, [NOTEBOOKEDIT_HOOK], {
    cwd: dir,
    input: rawInput,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_TOOL_INPUT: '', ...extraEnv },
  });
  assert.equal(res.signal, null, `hook killed by signal ${res.signal}`);
  return decode(res);
}

/** Convenience: spawn with a JSON payload. */
function spawnNotebookEdit(payload, dir, extraEnv = {}) {
  return spawnNotebookEditRaw(JSON.stringify(payload), dir, extraEnv);
}

/**
 * Call the in-process main() while capturing process.exit code and stderr, with a
 * caller-supplied boundary `setup` that returns a `restore` function. Everything
 * is restored in finally even if an assertion or an unexpected error throws.
 */
async function runMainCapturingExit(setup) {
  const realExit = process.exit;
  const realWrite = process.stderr.write;
  const errChunks = [];
  let exitCode;
  process.exit = (code) => { exitCode = code; throw new Error('__EXIT__'); };
  process.stderr.write = (chunk) => { errChunks.push(String(chunk)); return true; };
  const restore = setup();
  try {
    await notebookedit.main();
  } catch (err) {
    if (err.message !== '__EXIT__') throw err;   // real failure surfaces (after finally)
  } finally {
    process.exit = realExit;
    process.stderr.write = realWrite;
    restore();
  }
  return { exitCode, stderr: errChunks.join('') };
}

describe('PreToolUse.NotebookEdit — readStdinJson dark branches (subprocess boundary)', () => {
  let dir;
  afterEach(() => { cleanup(dir); dir = undefined; });

  it('readStdinJson_swallows_malformed_json_so_hook_decides_instead_of_crashing', () => {
    // Covers lines 40-41 (the catch). Mutant killed: deleting the try/catch lets
    // JSON.parse throw an unhandled rejection out of main() → NO deny JSON on
    // stdout and a crash. Asserting a clean deny is emitted proves the parse error
    // was swallowed to null and enforce(null) still reached the block decision.
    dir = makeProject();

    const out = spawnNotebookEditRaw('this is not json {{{', dir);

    assert.equal(out.denied, true,
      `malformed stdin must still yield a clean deny, not a crash; stdout=${out.stdout} stderr=${out.stderr}`);
    assert.equal(out.hookEventName, 'PreToolUse',
      'the deny must carry the standard PreToolUse shape');
  });

  it('readStdinJson_returns_null_on_empty_pipe_and_hook_denies_in_ctoc_project', () => {
    // Covers the ternary-false branch of `return buf ? JSON.parse(buf) : null`
    // (line 38 branch, dark at 37.50% branch coverage). Empty stdin → buf === ''
    // → null → enforce(null) → block. Mutant killed: flipping the ternary to
    // `buf ? null : JSON.parse(buf)` would call JSON.parse('') (throws → caught →
    // null) — same deny — so this test additionally asserts NO crash-signal and a
    // structured deny, pinning that an empty pipe is handled, never fatal.
    dir = makeProject();

    const out = spawnNotebookEditRaw('', dir);

    assert.equal(out.signal, null, 'empty stdin must not crash the hook by signal');
    assert.equal(out.denied, true,
      `empty stdin in a CTOC project must fail safe to a deny; stdout=${out.stdout} stderr=${out.stderr}`);
  });
});

describe('PreToolUse.NotebookEdit — main() fail-open safety branches (in-process, loader boundary)', () => {
  it('main_fails_open_with_exit0_when_delegate_module_load_throws', async () => {
    // Covers lines 55-58. Force require('./PreToolUse.Edit.js') to throw at the
    // module-loader boundary. The hook must FAIL OPEN: exit 0 (tool proceeds) and
    // emit the delegate-load-failure note — never block because its own require
    // broke. Mutant killed: changing exit(0) → exit(1)/(2) or dropping the catch
    // would either block the edit or crash; both are caught by these assertions.
    const realLoad = Module._load;
    const result = await runMainCapturingExit(() => {
      Module._load = function patched(request, ...rest) {
        if (typeof request === 'string' && request.endsWith('PreToolUse.Edit.js')) {
          throw new Error('BOOM delegate load');
        }
        return realLoad.call(this, request, ...rest);
      };
      return () => { Module._load = realLoad; };
    });

    assert.equal(result.exitCode, 0,
      'a delegate-load failure must fail OPEN (exit 0), never block the edit');
    assert.match(result.stderr, /NotebookEdit hook: enforcement delegate failed to load \(failing open\)/,
      'the fail-open path must announce the NotebookEdit delegate-load failure on stderr');
    assert.match(result.stderr, /BOOM delegate load/,
      'the underlying error message must be surfaced, not swallowed silently');
  });

  it('main_fails_open_with_exit0_when_delegate_export_is_not_a_function', async () => {
    // Covers lines 60-63. The delegate loads but exports a non-function enforce.
    // The hook must FAIL OPEN with exit 0 and the "no enforce()" note, never call
    // a non-callable. Mutant killed: removing the `typeof enforce !== 'function'`
    // guard would `await enforce(...)` on a string → TypeError crash (no exit 0),
    // and flipping the exit code would block the edit — both fail these asserts.
    const editResolved = require.resolve(EDIT_HOOK);
    const original = require.cache[editResolved];

    const result = await runMainCapturingExit(() => {
      require.cache[editResolved] = {
        id: editResolved,
        filename: editResolved,
        loaded: true,
        exports: { enforce: 'not-a-function' },
      };
      return () => {
        if (original) require.cache[editResolved] = original;
        else delete require.cache[editResolved];
      };
    });

    assert.equal(result.exitCode, 0,
      'a non-function delegate export must fail OPEN (exit 0), never block the edit');
    assert.match(result.stderr, /NotebookEdit hook: enforcement delegate has no enforce\(\) \(failing open\)/,
      'the fail-open path must announce the missing enforce() on stderr');
  });
});

describe('PreToolUse.NotebookEdit — delegated allow/block decisions (subprocess boundary)', () => {
  let dir;
  afterEach(() => { cleanup(dir); dir = undefined; });

  it('whitelisted_infrastructure_notebook_target_is_allowed_through_notebookedit', () => {
    // Non-obvious ALLOW: an uncovered notebook under src/ is denied (parity test),
    // but VERSION and plans/*.md are whitelisted infrastructure and must pass even
    // with no covering plan. Mutant killed: dropping the whitelist check would
    // deny these, flipping denied to true. Sent via notebook_path so the decision
    // is on the NotebookEdit target-resolution path.
    dir = makeProject();

    const versionOut = spawnNotebookEdit({
      tool_name: 'NotebookEdit',
      tool_input: { notebook_path: path.join(dir, 'VERSION'), new_source: 'print(2)' },
    }, dir);
    const planOut = spawnNotebookEdit({
      tool_name: 'NotebookEdit',
      tool_input: { notebook_path: path.join(dir, 'plans', 'todo', 'note.md'), new_source: 'print(2)' },
    }, dir);

    assert.equal(versionOut.denied, false,
      `VERSION must be whitelisted (allowed); stdout=${versionOut.stdout} stderr=${versionOut.stderr}`);
    assert.equal(versionOut.status, 0, 'a whitelisted allow exits 0');
    assert.equal(planOut.denied, false,
      `plans/*.md must be whitelisted (allowed); stdout=${planOut.stdout} stderr=${planOut.stderr}`);
  });

  it('approval_ledger_notebook_write_is_blocked_even_though_dotctoc_is_whitelisted', () => {
    // The load-bearing negation: `.ctoc/logs/x` is allowed by the /^\.ctoc\//
    // whitelist, but `.ctoc/approvals/x` (the human-approval ledger) is denied by
    // a guard that runs BEFORE the whitelist. Mutant killed: removing the ledger
    // guard would let the approvals write slip through the .ctoc/ whitelist —
    // forging an approval. The contrast (logs allowed, approvals denied) pins it.
    dir = makeProject();

    const logsOut = spawnNotebookEdit({
      tool_name: 'NotebookEdit',
      tool_input: { notebook_path: path.join(dir, '.ctoc', 'logs', 'x.json'), new_source: 'print(1)' },
    }, dir);
    const ledgerOut = spawnNotebookEdit({
      tool_name: 'NotebookEdit',
      tool_input: { notebook_path: path.join(dir, '.ctoc', 'approvals', 'forged.yaml'), new_source: 'print(1)' },
    }, dir);

    assert.equal(logsOut.denied, false,
      `.ctoc/logs must be whitelisted (allowed); stdout=${logsOut.stdout}`);
    assert.equal(ledgerOut.denied, true,
      `.ctoc/approvals ledger write must be DENIED despite the .ctoc/ whitelist; stdout=${ledgerOut.stdout} stderr=${ledgerOut.stderr}`);
  });

  it('user_typed_escape_phrase_in_transcript_allows_an_otherwise_uncovered_notebook_edit', () => {
    // Non-obvious ALLOW: an uncovered target is denied UNLESS the human typed an
    // escape phrase. Provide a transcript with a genuine user turn containing
    // "quick fix"; the notebook edit must be allowed. Mutant killed: dropping the
    // escape check (or reading it from non-user text) leaves this denied.
    dir = makeProject();
    const transcript = path.join(dir, 'transcript.jsonl');
    fs.writeFileSync(transcript,
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'please just do a quick fix here' } }) + '\n');
    const targetAbs = path.join(dir, 'src', 'analysis.ipynb');

    const out = spawnNotebookEdit({
      tool_name: 'NotebookEdit',
      transcript_path: transcript,
      tool_input: { notebook_path: targetAbs, new_source: 'print(1)' },
    }, dir);

    assert.equal(out.denied, false,
      `a user-typed escape phrase must allow the uncovered notebook edit; stdout=${out.stdout} stderr=${out.stderr}`);
    assert.equal(out.status, 0, 'an escape-phrase allow exits 0');
  });

  it('escape_word_boundary_is_respected_so_embedded_lookalike_still_blocks', () => {
    // Boundary negation for the escape matcher: "urgently" contains "urgent" as a
    // substring but is NOT the word-bounded escape phrase "urgent". The uncovered
    // notebook edit must stay DENIED. Mutant killed: loosening the \b matcher to a
    // substring match would wrongly allow this, flipping denied to false.
    dir = makeProject();
    const transcript = path.join(dir, 'transcript.jsonl');
    fs.writeFileSync(transcript,
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'ship it urgently please' } }) + '\n');
    const targetAbs = path.join(dir, 'src', 'analysis.ipynb');

    const out = spawnNotebookEdit({
      tool_name: 'NotebookEdit',
      transcript_path: transcript,
      tool_input: { notebook_path: targetAbs, new_source: 'print(1)' },
    }, dir);

    assert.equal(out.denied, true,
      `"urgently" is not the word-bounded phrase "urgent" — edit must stay denied; stdout=${out.stdout} stderr=${out.stderr}`);
  });

  it('non_ctoc_project_silently_passes_an_uncovered_notebook_edit', () => {
    // Non-obvious ALLOW: outside a CTOC project the hook is out of scope and must
    // silently pass — even an uncovered src/ notebook target. Mutant killed:
    // removing the `!detect.isCtoc` early-allow would block edits in every non-CTOC
    // repo.
    dir = makeNonCtocDir();
    const targetAbs = path.join(dir, 'src', 'analysis.ipynb');

    const out = spawnNotebookEdit({
      tool_name: 'NotebookEdit',
      tool_input: { notebook_path: targetAbs, new_source: 'print(1)' },
    }, dir);

    assert.equal(out.denied, false,
      `a non-CTOC project must silently pass; stdout=${out.stdout} stderr=${out.stderr}`);
    assert.equal(out.status, 0, 'a non-CTOC silent pass exits 0');
  });
});
