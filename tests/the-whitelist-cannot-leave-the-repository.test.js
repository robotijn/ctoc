/**
 * THE INFRASTRUCTURE WHITELIST REACHES OUTSIDE THE REPOSITORY THROUGH A LINK.
 *
 * `isWhitelisted` in `PreToolUse.Edit.js` is PURE PATH ARITHMETIC — `path.relative`,
 * `path.posix.normalize`, `startsWith`, a regular expression. None of those touch the
 * filesystem, so none of them can see a symbolic link. With `plans/out → /outside` in
 * the tree, the target `plans/out/evil.md` produces the clean, traversal-free name
 * `plans/out/evil.md`, matches `/^plans\/.*\.md$/`, and the whitelist grants a write
 * OUTSIDE the repository — with no covering plan at all. `plans/*.md` is the directory
 * every agent writes to routinely, so it is the most reachable prefix in the list.
 *
 * The fix asks the filesystem — `real-path-confinement.escapesRoot` — AFTER a pattern
 * has matched, so an ordinary source edit (which matches nothing) costs zero syscalls.
 * A whitelist miss FALLS THROUGH to coverage/escape/block; it is not a new denial.
 *
 * Every fixture is a real `os.tmpdir()` directory with real symbolic links. Nothing
 * here writes inside this repository. Link creation NEVER skips: a platform that
 * refuses to make a link fails the test loudly with the platform and the error,
 * because a skipped case is a check that reports a verdict on input it never received.
 */

'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const REPO = path.resolve(__dirname, '..');
const MODULE_PATH = path.join(REPO, 'src', 'hooks', 'PreToolUse.Edit.js');
const { enforce, isWhitelisted } = require(MODULE_PATH);
const safeFs = require('../src/lib/safe-fs');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const createdDirs = [];

/** A temp directory with the CTOC shape enforce() and the guards expect. */
function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-wl-'));
  createdDirs.push(dir);
  for (const s of ['in-progress', 'todo']) {
    fs.mkdirSync(path.join(dir, 'plans', s), { recursive: true });
  }
  fs.mkdirSync(path.join(dir, '.ctoc', 'approvals'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ctoc', 'state', 'verify'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src', 'lib'), { recursive: true });
  return dir;
}

/** Mark `root` as a CTOC project so the detector's step-2 does not silent-pass. */
function markCtoc(root) {
  fs.writeFileSync(
    path.join(root, 'CLAUDE.md'),
    '# CTOC Project Instructions\n\nmarker for the detector.\n',
    'utf8',
  );
}

function makeOutside() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-outside-'));
  createdDirs.push(dir);
  return dir;
}

/**
 * Create a symbolic link, LOUDLY. `junction` is used so Windows permits directory
 * links without elevation. A failure fails the test with the platform and the
 * underlying error — it never degrades into a skip.
 */
function mklink(target, linkPath, type = 'junction') {
  try {
    fs.symlinkSync(target, linkPath, type);
  } catch (err) {
    assert.fail(
      `could not create a symbolic link on ${process.platform} `
      + `(${linkPath} -> ${target}): ${err.code || ''} ${err.message}`,
    );
  }
}

/** Run `fn` with the process cwd set to `dir`, restoring it unconditionally. */
function withCwd(dir, fn) {
  const before = process.cwd();
  process.chdir(dir);
  try { return fn(process.cwd()); } finally { process.chdir(before); }
}

/** Write a JSONL transcript file, return its absolute path. */
function writeTranscript(root, ...lines) {
  const p = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(p, lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n', 'utf8');
  return p;
}

after(() => {
  for (const dir of createdDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

/**
 * Drive enforce() in-process and capture its decision. The ONLY doubles are at the
 * genuine process boundary (exit code, stdout, stderr, cwd) — the detector,
 * plan-coverage, escape-phrase, real-path-confinement, deny-signal and enforcement-log
 * modules all run for real. process.exit is recorded (not thrown) so a BLOCK's emitDeny
 * does not unwind into enforce()'s own catch and masquerade as fail-open. Pass
 * `enforceFn` to drive a freshly-loaded module (case 13, confinement unloadable).
 */
async function runEnforce(payload, { cwd, enforceFn = enforce } = {}) {
  const orig = {
    exit: process.exit,
    cwd: process.cwd,
    stdoutWrite: process.stdout.write,
    stderrWrite: process.stderr.write,
    toolInput: process.env.CLAUDE_TOOL_INPUT,
  };
  let exitCode;
  let stdout = '';
  let stderr = '';
  process.exit = (code) => { exitCode = code; };
  process.stdout.write = (s) => { stdout += s; return true; };
  process.stderr.write = (s) => { stderr += s; return true; };
  if (cwd) process.cwd = () => cwd;
  delete process.env.CLAUDE_TOOL_INPUT;
  try {
    await enforceFn(payload);
  } finally {
    process.exit = orig.exit;
    process.cwd = orig.cwd;
    process.stdout.write = orig.stdoutWrite;
    process.stderr.write = orig.stderrWrite;
    if (orig.toolInput === undefined) delete process.env.CLAUDE_TOOL_INPUT;
    else process.env.CLAUDE_TOOL_INPUT = orig.toolInput;
  }
  return { exitCode, stdout, stderr };
}

function editPayload(filePath, extra = {}) {
  return { tool_name: 'Edit', tool_input: { file_path: filePath }, ...extra };
}

/** True iff stdout carried the harness deny-decision JSON. */
function isDeny(stdout) {
  if (!stdout) return false;
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { return false; }
  return !!(parsed && parsed.hookSpecificOutput
    && parsed.hookSpecificOutput.permissionDecision === 'deny');
}

/**
 * Re-load PreToolUse.Edit.js with the confinement module forced to fail its
 * fail-soft require, exactly reproducing the degraded state (`realPathConfinement`
 * bound to null). Restores the loader and the module cache unconditionally.
 */
function loadEditHookWithoutConfinement() {
  const Module = require('module');
  const editPath = require.resolve('../src/hooks/PreToolUse.Edit.js');
  const origLoad = Module._load;
  delete require.cache[editPath];
  Module._load = function patched(request, ...rest) {
    if (request === '../lib/real-path-confinement') {
      throw new Error('simulated: real-path-confinement failed to load');
    }
    return origLoad.call(this, request, ...rest);
  };
  try {
    return require(editPath);
  } finally {
    Module._load = origLoad;
    delete require.cache[editPath]; // next require re-loads cleanly with the real module
  }
}

// ===========================================================================
// Cases 1-4 — THE PROVED DEFECT and its variants. RED before the fix: pre-fix
// isWhitelisted returns TRUE for a link-out target and enforce ALLOWS (exit 0).
// ===========================================================================

describe('the whitelist cannot leave the repository — the defect', () => {

  it('case 1: plans/out -> outside, target plans/out/evil.md is DENIED', async () => {
    const root = makeProject();
    markCtoc(root);
    const outside = makeOutside();
    mklink(outside, path.join(root, 'plans', 'out'));

    // Unit: the predicate itself must no longer grant.
    withCwd(root, () => {
      assert.equal(isWhitelisted('plans/out/evil.md'), false,
        'a whitelisted NAME whose real path leaves the tree must not be granted');
    });
    // Integration: the human-visible decision is a block (fall-through, not a new shape).
    const res = await runEnforce(editPayload('plans/out/evil.md'), { cwd: root });
    assert.equal(res.exitCode, 2, 'an out-of-tree whitelisted target must fall through to block');
    assert.ok(isDeny(res.stdout), 'the block emits the deny decision');
  });

  it('case 2: .ctoc/out -> outside, target .ctoc/out/anything.json is DENIED', async () => {
    const root = makeProject();
    markCtoc(root);
    const outside = makeOutside();
    mklink(outside, path.join(root, '.ctoc', 'out'));

    withCwd(root, () => {
      assert.equal(isWhitelisted('.ctoc/out/anything.json'), false);
    });
    const res = await runEnforce(editPayload('.ctoc/out/anything.json'), { cwd: root });
    assert.equal(res.exitCode, 2);
    assert.ok(isDeny(res.stdout));
  });

  it('case 3: .local/out -> outside is DENIED', async () => {
    const root = makeProject();
    markCtoc(root);
    fs.mkdirSync(path.join(root, '.local'), { recursive: true });
    const outside = makeOutside();
    mklink(outside, path.join(root, '.local', 'out'));

    withCwd(root, () => {
      assert.equal(isWhitelisted('.local/out/x'), false);
    });
    const res = await runEnforce(editPayload('.local/out/x'), { cwd: root });
    assert.equal(res.exitCode, 2);
    assert.ok(isDeny(res.stdout));
  });

  it('case 4: a DANGLING link under a whitelisted prefix is DENIED (inherits 00140)', async () => {
    const root = makeProject();
    markCtoc(root);
    const outside = makeOutside();
    // The link exists; its target does not — the ordinary shape of a forged file.
    mklink(path.join(outside, 'notyet'), path.join(root, 'plans', 'out'));

    withCwd(root, () => {
      assert.equal(isWhitelisted('plans/out/evil.md'), false,
        'a dangling link is not a path inside the tree');
    });
    const res = await runEnforce(editPayload('plans/out/evil.md'), { cwd: root });
    assert.equal(res.exitCode, 2);
    assert.ok(isDeny(res.stdout));
  });

  it('case 5: a link LOOP under a whitelisted prefix DENIES, returns, never hangs or throws', async () => {
    const root = makeProject();
    markCtoc(root);
    mklink(path.join(root, 'plans', 'loopB'), path.join(root, 'plans', 'loopA'));
    mklink(path.join(root, 'plans', 'loopA'), path.join(root, 'plans', 'loopB'));

    // The predicate itself must RETURN (not throw, not hang) on ELOOP — a throw
    // reaches enforce()'s fail-OPEN catch and becomes an ALLOW.
    withCwd(root, () => {
      let v;
      assert.doesNotThrow(() => { v = isWhitelisted('plans/loopA/x.md'); },
        'ELOOP must return a refusing value, never throw');
      assert.equal(v, false, 'a loop cannot be resolved, so the whitelist must not grant');
    });
    // End-to-end: the whole decision returns and denies (the fail-closed resolver may
    // land the deny at the ledger guard for a fault target — still a deny, still bounded).
    const res = await runEnforce(editPayload('plans/loopA/x.md'), { cwd: root });
    assert.equal(res.exitCode, 2, 'a loop target must be denied, and enforce must return');
    assert.ok(isDeny(res.stdout));
  });
});

// ===========================================================================
// Cases 6-9 — THE FENCE IS NOT VACUOUS. Real infrastructure writes still work,
// or the fix silently breaks every plan/settings write in the product.
// ===========================================================================

describe('the whitelist still grants real infrastructure writes', () => {

  it('case 6: plans/todo/x.md, .ctoc/settings.json, VERSION, .gitignore are ALLOWED', async () => {
    const root = makeProject();
    markCtoc(root);
    withCwd(root, () => {
      assert.equal(isWhitelisted('plans/todo/x.md'), true);
      assert.equal(isWhitelisted('.ctoc/settings.json'), true);
      assert.equal(isWhitelisted('VERSION'), true);
      assert.equal(isWhitelisted('.gitignore'), true);
    });
    for (const t of ['plans/todo/x.md', '.ctoc/settings.json', 'VERSION', '.gitignore']) {
      const res = await runEnforce(editPayload(t), { cwd: root });
      assert.equal(res.exitCode, 0, `real infrastructure write ${t} must be allowed`);
      assert.equal(isDeny(res.stdout), false);
    }
  });

  it('case 7: a whitelisted file that does not exist yet is ALLOWED (the ancestor walk)', async () => {
    const root = makeProject();
    markCtoc(root);
    withCwd(root, () => {
      assert.equal(isWhitelisted('plans/todo/brand-new.md'), true,
        'denying ENOENT would block every Write that creates a plan');
    });
    const res = await runEnforce(editPayload('plans/todo/brand-new.md'), { cwd: root });
    assert.equal(res.exitCode, 0);
  });

  it('case 8: an in-tree link under a whitelisted prefix is ALLOWED', async () => {
    const root = makeProject();
    markCtoc(root);
    fs.mkdirSync(path.join(root, '.ctoc', 'statedir'), { recursive: true });
    mklink(path.join(root, '.ctoc', 'statedir'), path.join(root, '.ctoc', 'x'));
    withCwd(root, () => {
      assert.equal(isWhitelisted('.ctoc/x/thing.json'), true,
        'an in-tree link is not an escape');
    });
    const res = await runEnforce(editPayload('.ctoc/x/thing.json'), { cwd: root });
    assert.equal(res.exitCode, 0);
  });

  it('case 9: the root itself reached THROUGH a link still grants (the /tmp -> /private/tmp shape)', async () => {
    const real = makeProject();
    markCtoc(real);
    const holder = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-holder-'));
    createdDirs.push(holder);
    const linkedRoot = path.join(holder, 'rootlink');
    mklink(real, linkedRoot);

    // cwd is the UNRESOLVED linked root; resolving the target but not the root would
    // deny every fixture in this suite.
    const res = await runEnforce(editPayload('plans/todo/x.md'), { cwd: linkedRoot });
    assert.equal(res.exitCode, 0, 'a whitelisted target under a linked root must still be allowed');
    assert.equal(isDeny(res.stdout), false);
  });
});

// ===========================================================================
// Case 10 — the ARITHMETIC rejections still fire unchanged: the new check ADDS,
// after the pattern match; it does not replace the traversal guards.
// ===========================================================================

describe('the arithmetic rejections are unchanged', () => {
  it('case 10: traversal spellings and empty input still return false', () => {
    const root = makeProject();
    withCwd(root, () => {
      assert.equal(isWhitelisted('plans/../../outside.md'), false);
      assert.equal(isWhitelisted('.ctoc/../src/lib/x.js'), false);
      assert.equal(isWhitelisted('..'), false);
      assert.equal(isWhitelisted(''), false);
      assert.equal(isWhitelisted(null), false);
    });
  });
});

// ===========================================================================
// Cases 11-12, 15 — ordering and the human's own instruments are preserved.
// ===========================================================================

describe('ordering and the human escape are preserved', () => {

  it('case 11: the ledger guard still wins the race — a link to .ctoc/approvals denies with the LEDGER reason', async () => {
    const root = makeProject();
    markCtoc(root);
    mklink(path.join(root, '.ctoc', 'approvals'), path.join(root, 'src', 'anywhere'));

    const res = await runEnforce(editPayload('src/anywhere/forged.json'), { cwd: root });
    assert.equal(res.exitCode, 2, 'a write whose real destination is the ledger is denied');
    assert.match(res.stderr, /ledger/i,
      'the deny must carry the LEDGER reason (step 0), proving it runs BEFORE the whitelist');
  });

  it('case 12: a human-typed escape phrase still allows an out-of-tree whitelisted target', async () => {
    const root = makeProject();
    markCtoc(root);
    const outside = makeOutside();
    mklink(outside, path.join(root, 'plans', 'out'));
    const transcript = writeTranscript(
      root,
      { type: 'user', message: { role: 'user', content: 'please hotfix this, it is breaking prod' } },
    );

    const res = await runEnforce(
      editPayload('plans/out/evil.md', { transcript_path: transcript }),
      { cwd: root },
    );
    assert.equal(res.exitCode, 0, 'the escape belongs to the human; this fix does not override it');
    assert.equal(isDeny(res.stdout), false);
  });

  it('case 15: a non-CTOC project still passes an infrastructure write silently', async () => {
    const root = makeProject(); // NO markCtoc
    const res = await runEnforce(editPayload('VERSION'), { cwd: root });
    assert.equal(res.exitCode, 0, 'the whitelist runs before detection; a non-CTOC infra write is unaffected');
    assert.equal(isDeny(res.stdout), false);
  });
});

// ===========================================================================
// Cases 13-14 — degradation and fault. The check fails in the SAFE direction and
// NEVER throws into enforce()'s fail-open catch.
// ===========================================================================

describe('degradation and fault fail safe, never throwing into the fail-open catch', () => {

  it('case 13: the confinement module missing DEGRADES to arithmetic — it does not crash', async () => {
    const degraded = loadEditHookWithoutConfinement();
    const root = makeProject();
    markCtoc(root);
    const outside = makeOutside();
    mklink(outside, path.join(root, 'plans', 'out'));

    withCwd(root, () => {
      // Arithmetic verdicts are unchanged.
      assert.equal(degraded.isWhitelisted('plans/../../outside.md'), false,
        'the traversal guard still fires with no confinement module');
      // The link case is ALLOWED again — the hole is open, documented, not silent.
      assert.equal(degraded.isWhitelisted('plans/out/evil.md'), true,
        'without the confinement module the arithmetic alone matches — matching the code comment');
    });
    // And the hook still RUNS end-to-end rather than crashing.
    const res = await runEnforce(editPayload('plans/out/evil.md'), { cwd: root, enforceFn: degraded.enforce });
    assert.equal(res.exitCode, 0, 'degraded, the whitelist grants at step 1 — the hook does not crash');
  });

  it('case 14: a realpathSync EACCES fault is NOT granted, and NEVER throws', () => {
    const root = makeProject();
    const realOriginal = safeFs.realpathSync;
    try {
      safeFs.realpathSync = () => {
        const err = new Error('permission denied');
        err.code = 'EACCES';
        throw err;
      };
      withCwd(root, () => {
        let v;
        assert.doesNotThrow(() => { v = isWhitelisted('VERSION'); },
          'a throw out of the whitelist reaches enforce()\'s fail-OPEN catch and becomes an ALLOW');
        assert.equal(v, false, 'a check that cannot resolve the real path must NOT grant');
      });
    } finally {
      safeFs.realpathSync = realOriginal;
    }
  });
});
