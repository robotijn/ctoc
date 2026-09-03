'use strict';

/**
 * THE FAIL-OPEN ARMS, AS A STATED CONTRACT.
 *
 * Three CTOC hooks deliberately FAIL OPEN — they let the human's action proceed
 * when the hook's own machinery breaks. That is the human's design decision and
 * this file does not change it. The defect it closes is different: the documented
 * behaviour was never asserted anywhere, so it could have changed silently. After
 * this file, a change to any of these arms fails a named test instead of passing
 * unnoticed.
 *
 * Fail open means the hook must do BOTH of these, and the pair is the contract:
 *   1. let the action through (exit 0, no deny decision on stdout), and
 *   2. SAY SO on stderr, in the documented words.
 * Doing only the first is a silent fail-open — indistinguishable, from the
 * outside, from a guard that examined the input and approved it. That is the
 * false-green shape this repository fences everywhere else, so the stderr line is
 * a load-bearing assertion here, never decoration.
 *
 * The arms pinned below:
 *   • `src/hooks/guard-files.js` — `main()`'s outer catch: stderr
 *     "[CTOC] guard-files error (failing open): <message>", then exit 0.
 *   • `src/hooks/UserPromptSubmit.js` — `run()`'s catch: stderr
 *     "[CTOC] UserPromptSubmit routing-reminder error (failing silent): <message>",
 *     exit code 0, and NOTHING on stdout (this hook's stdout is injected into the
 *     model's context; a fault leaking into it would be a different defect).
 *   • `src/hooks/PreToolUse.Write.js` — the three ADVISORY plan-number-collision
 *     arms in `main()`: the collision-check fault catch ("failing open, write
 *     ALLOWED"), the `unknown` verdict ("could not read plans/ — write ALLOWED
 *     WITHOUT a collision check"), and the escape-phrase bypass (recorded to the
 *     advisory log).
 *   • `src/hooks/PreToolUse.Write.js` — `detectEscape()`'s catch: an UNREADABLE
 *     transcript is "no escape phrase", never an escape. This one is the opposite
 *     direction on purpose: the advisory checks fail open, but a bypass never
 *     opens on a fault, or an unreadable file would become a way to disable a
 *     refusal.
 *
 * NOT COVERED HERE, and why. Three ranges of `src/hooks/PreToolUse.Write.js` stay
 * uncovered and are DEFENSIVELY UNREACHABLE, not skipped work. The reasoning is
 * `tests/pretooluse-write-coverage.test.js`'s own header, which classified them
 * first; it is cited, not re-derived:
 *   • the `typeof checkDuplicate !== 'function'` return in `run()` — dead through
 *     the public API, since every path yields a function;
 *   • `readStdinRaw()`'s catch — an fd-0 read fault, and every process that
 *     reaches `main()` is spawned with a readable stdin;
 *   • the catch around `await run(parsed)` in `main()` — `run()` is internally
 *     fail-open and always resolves.
 * Nothing here fabricates a path to them and nothing here deletes them.
 *
 * NO CASE IN THIS FILE IS PERMISSION-GATED, so nothing skips. The `unknown`
 * verdict is forced by making `plans/todo` a regular FILE (`readdirSync` then
 * throws ENOTDIR) rather than by removing a permission bit — the same fault at
 * the same boundary, reachable as an ordinary user and on Windows.
 *
 * FAULT INJECTION IS AT THE TRUE BOUNDARY ONLY: the module loader
 * (`require.cache`, seeded in a spawned child so the real hook still runs as the
 * main module), `t.mock.method` on a real collaborator module, and the real
 * filesystem. No function under test is stubbed.
 *
 * Cross-platform: every path via `path.join`, every child spawned as an argument
 * array through `process.execPath`, no shell. Fixtures live under `os.tmpdir()`
 * and are removed. `.env` appears only as a FILE NAME in a payload — no fixture
 * contains a credential, real or realistic.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const GUARD_FILES = path.join(REPO, 'src', 'hooks', 'guard-files.js');
const WRITE_HOOK = path.join(REPO, 'src', 'hooks', 'PreToolUse.Write.js');
const DENY_SIGNAL = require.resolve(path.join(REPO, 'src', 'lib', 'hook-deny-signal.js'));

/** Hermetic scratch dir; realpath so macOS `/var` → `/private/var` never surprises a comparison. */
function makeTmp(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function rimraf(dir) {
  if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

/** Spawn a node script with a JSON payload on stdin, exactly as the harness drives a hook. */
function runHook(scriptPath, args, payload, cwd) {
  const res = spawnSync(process.execPath, [scriptPath, ...args], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_TOOL_INPUT: '' },
  });
  assert.equal(res.signal, null, `child killed by signal ${res.signal}`);
  return {
    status: typeof res.status === 'number' ? res.status : null,
    stdout: String(res.stdout || ''),
    stderr: String(res.stderr || ''),
  };
}

/** A preload that seeds `require.cache` so `emitDeny` throws when the hook calls it. */
function writeThrowingDenyPreload(dir, name) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, [
    "'use strict';",
    `const denyPath = ${JSON.stringify(DENY_SIGNAL)};`,
    'require.cache[denyPath] = {',
    '  id: denyPath, filename: denyPath, loaded: true,',
    "  exports: { emitDeny() { throw new Error('INJECTED_EMITDENY_FAULT'); },",
    '             denyDecision: () => ({}), HARNESS_BLOCK_EXIT_CODE: 2 },',
    '};',
    '',
  ].join('\n'));
  return file;
}

/**
 * A fixture project holding plan number 00042 under a DIFFERENT slug, so writing
 * `plans/todo/00042-a-different-plan.md` is a genuine number collision.
 */
function makeCollidingProject(prefix, { withCtocDir = false } = {}) {
  const root = makeTmp(prefix);
  fs.mkdirSync(path.join(root, 'plans', 'todo'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'plans', 'todo', '00042-the-plan-that-holds-the-number.md'),
    '---\ntitle: Holds the number\n---\n',
  );
  if (withCtocDir) fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
  return root;
}

const COLLIDING_TARGET = 'plans/todo/00042-a-different-plan.md';

// ---------------------------------------------------------------------------
// guard-files.js — the outer catch of the secret-file guard.
// ---------------------------------------------------------------------------
describe('guard-files: the outer catch fails OPEN and says so', () => {
  let dir;
  before(() => { dir = makeTmp('failopen-guard-'); });
  after(() => { rimraf(dir); });

  it('an emitDeny fault exits 0 AND writes "guard-files error (failing open)" to stderr — a silent fail-open is indistinguishable from a working guard', () => {
    const preload = writeThrowingDenyPreload(dir, 'preload-deny-throws.js');
    // `.env` is a FILE NAME, not a secret value: it matches a protected pattern, so
    // the hook takes the block path and reaches emitDeny, which the preload makes throw.
    const res = spawnSync(process.execPath, ['--require', preload, GUARD_FILES], {
      input: JSON.stringify({ tool_input: { file_path: '.env' } }),
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_TOOL_INPUT: '' },
    });
    assert.equal(res.signal, null, `child killed by signal ${res.signal}`);
    assert.equal(res.status, 0, `must fail OPEN (exit 0); stderr=${res.stderr}`);
    assert.equal(
      String(res.stderr).includes('guard-files error (failing open)'),
      true,
      'the fail-open must be ANNOUNCED on stderr; a silent exit 0 reads exactly like an approved target',
    );
  });
});

// ---------------------------------------------------------------------------
// UserPromptSubmit.js — the routing reminder's error arm.
// ---------------------------------------------------------------------------
describe('UserPromptSubmit: a reminder fault fails SILENT to the model, LOUD to stderr', () => {
  it('a buildReminder throw leaves exit code 0, writes the documented stderr line, and puts NOTHING on stdout', (t) => {
    const hook = require(path.join(REPO, 'src', 'hooks', 'UserPromptSubmit.js'));
    const reminderModule = require(path.join(REPO, 'src', 'lib', 'ctoc-routing-reminder.js'));

    t.mock.method(reminderModule, 'buildReminder', () => {
      throw new Error('INJECTED_REMINDER_FAULT');
    });

    const errChunks = [];
    const outChunks = [];
    const realErr = process.stderr.write;
    const realOut = process.stdout.write;
    const savedExitCode = process.exitCode;
    process.stderr.write = (s) => { errChunks.push(String(s)); return true; };
    process.stdout.write = (s) => { outChunks.push(String(s)); return true; };
    try {
      hook.run({ prompt: 'do the thing', session_id: 'session-under-test' });
    } finally {
      process.stderr.write = realErr;
      process.stdout.write = realOut;
    }
    const exitCode = process.exitCode;
    process.exitCode = savedExitCode; // never leave the runner with this hook's code

    assert.equal(exitCode, 0, 'a non-zero exit on UserPromptSubmit BLOCKS the human prompt');
    assert.equal(
      errChunks.join('').includes('UserPromptSubmit routing-reminder error (failing silent)'),
      true,
      'the absorbed fault must be recorded on stderr, not swallowed',
    );
    assert.equal(
      outChunks.join(''),
      '',
      'stdout is injected into the model context — a fault must never leak into it',
    );
  });
});

// ---------------------------------------------------------------------------
// PreToolUse.Write.js — the advisory plan-number-collision arms in main().
// ---------------------------------------------------------------------------
describe('PreToolUse.Write: the advisory collision check fails OPEN and says which way it failed', () => {
  let wrapDir;
  let faultWrapper;

  before(() => {
    wrapDir = makeTmp('failopen-write-wrap-');
    const preload = writeThrowingDenyPreload(wrapDir, 'preload-deny-throws.js');
    faultWrapper = path.join(wrapDir, 'w-deny-throws.js');
    fs.writeFileSync(faultWrapper, [
      "'use strict';",
      `require(${JSON.stringify(preload)});`,
      `require(${JSON.stringify(WRITE_HOOK)}).main();`,
      '',
    ].join('\n'));
  });

  after(() => { rimraf(wrapDir); });

  it('a fault inside the collision check exits 0, still ALLOWS the write, and reports "failing open, write ALLOWED"', () => {
    const root = makeCollidingProject('failopen-write-fault-');
    try {
      const out = runHook(
        faultWrapper,
        [],
        { tool_name: 'Write', tool_input: { file_path: COLLIDING_TARGET, content: '# x\n' }, cwd: root },
        root,
      );
      assert.equal(out.status, 0, `a numbering-check fault must never stop a write; stderr=${out.stderr}`);
      assert.equal(
        out.stderr.includes('plan-number collision check faulted (failing open, write ALLOWED)'),
        true,
        'the degradation must be surfaced, never swallowed',
      );
      assert.equal(
        out.stdout.includes('"permissionDecision":"deny"'),
        false,
        'a fault in the advisory check must not produce a deny decision',
      );
    } finally {
      rimraf(root);
    }
  });

  it('an unreadable plans/ ALLOWS the write and says it could not check — never "no collision found"', () => {
    const root = makeTmp('failopen-write-unknown-');
    try {
      fs.mkdirSync(path.join(root, 'plans', 'todo'), { recursive: true });
      // A regular FILE where a stage directory belongs: existsSync passes, readdirSync
      // throws ENOTDIR. The same fault as an unreadable directory, with no permission bit.
      // It is `plans/review`, NOT the target's own `plans/todo`: an unresolvable TARGET
      // path is refused by a different guard entirely (the delegate's fail-CLOSED
      // real-path confinement check, which cannot see through ENOTDIR), and this case
      // must isolate the collision scan's fault from that one.
      fs.writeFileSync(path.join(root, 'plans', 'review'), 'not a directory\n');
      const out = runHook(
        WRITE_HOOK,
        [],
        { tool_name: 'Write', tool_input: { file_path: COLLIDING_TARGET, content: '# x\n' }, cwd: root },
        root,
      );
      assert.equal(out.status, 0, `an unreadable plans/ must not block; stderr=${out.stderr}`);
      assert.equal(
        out.stderr.includes('could not read plans/'),
        true,
        'the hook must name what it could not read',
      );
      assert.equal(
        out.stderr.includes('this is not "no collision found"'),
        true,
        'reporting ignorance as a clean result is the false-green shape this repository fences',
      );
      assert.equal(out.stdout.includes('"permissionDecision":"deny"'), false, 'unseen input must never be refused');
    } finally {
      rimraf(root);
    }
  });

  it('an escape phrase the user typed bypasses a REAL collision and the bypass is recorded to the advisory log', () => {
    const root = makeCollidingProject('failopen-write-escape-', { withCtocDir: true });
    try {
      const transcript = path.join(root, 'transcript.jsonl');
      fs.writeFileSync(
        transcript,
        JSON.stringify({ type: 'user', message: { role: 'user', content: 'hotfix — renumber it later' } }) + '\n',
      );
      const out = runHook(
        WRITE_HOOK,
        [],
        {
          tool_name: 'Write',
          tool_input: { file_path: COLLIDING_TARGET, content: '# x\n' },
          transcript_path: transcript,
          cwd: root,
        },
        root,
      );
      assert.equal(out.status, 0, `the escape phrase must allow the write; stderr=${out.stderr}`);
      assert.equal(out.stdout.includes('"permissionDecision":"deny"'), false, 'the bypass must not deny');
      const log = fs.readFileSync(path.join(root, '.ctoc', 'logs', 'plan-index.log'), 'utf8');
      assert.equal(
        log.includes('plan-number collision bypassed by escape phrase'),
        true,
        'an unrecorded bypass is a refusal that silently did not happen',
      );
    } finally {
      rimraf(root);
    }
  });
});

// ---------------------------------------------------------------------------
// PreToolUse.Write.js — detectEscape's catch. The one arm that does NOT open.
// ---------------------------------------------------------------------------
describe('PreToolUse.Write: an UNREADABLE transcript is "no escape phrase", never an escape', () => {
  it('a transcript_path pointing at a directory still DENIES a real collision', () => {
    const hook = require(WRITE_HOOK);
    const root = makeCollidingProject('failopen-write-badtranscript-');
    try {
      // A DIRECTORY where the transcript belongs: safeFs.readFileSync throws, and
      // detectEscape's catch returns null. If that catch ever returned a phrase, an
      // unreadable file would become a way to switch the refusal off.
      const notAFile = path.join(root, 'transcript-dir');
      fs.mkdirSync(notAFile, { recursive: true });
      const verdict = hook.evaluateCollision(
        { tool_input: { file_path: COLLIDING_TARGET }, transcript_path: notAFile },
        { projectPath: root },
      );
      assert.equal(verdict.decision, 'deny', 'an unreadable transcript must not bypass the refusal');
      assert.equal(verdict.escape, undefined, 'no escape phrase may be reported from a file that could not be read');
    } finally {
      rimraf(root);
    }
  });
});
