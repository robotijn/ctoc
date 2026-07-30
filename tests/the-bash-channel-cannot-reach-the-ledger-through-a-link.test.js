'use strict';

/**
 * THE BASH CHANNEL CANNOT REACH THE LEDGER THROUGH A LINK (slice 00141).
 *
 * The sibling slice closed the symbolic-link hole on the EDITING channel
 * (Edit/Write/MultiEdit). The Bash channel was explicitly out of that scope, and
 * this is the half that remained open: `isLedgerWrite` in PreToolUse.Bash.js
 * decided whether a command touches `.ctoc/approvals` with two ARITHMETIC tests —
 * an adjacency match on the normalized text and a `path.posix.normalize` of each
 * operand against the accumulated `cd` prefix. Neither touches the filesystem, so a
 * symbolic link that never spells the protected directory walked straight past:
 *
 *     ln -s .ctoc src/link                       # ALLOWED
 *     echo '{"kind":"human"}' > src/link/approvals/forged.json   # forged the ledger
 *
 * The fix wires `realPathConfinement.resolvesUnder(...)` — the ONE encoding of
 * real-path confinement, already live on the editing channel — as a THIRD,
 * independent test on each non-read segment's operands, applied only when the two
 * arithmetic tests both missed. Either firing is a DENY.
 *
 * These tests SPAWN THE REAL HOOK PROCESS (never a re-implemented regex) with a
 * PreToolUse payload on STDIN and assert the real deny signal — the same harness
 * shape ledger-forgery-closed.test.js uses. State is planted at step 10 with a
 * feature, so the write/commit step gates would ALLOW every command here: any deny
 * observed is the ledger guard, and any allow is the guard declining, nothing else.
 *
 * Links are created with real `fs.symlinkSync`. Symbolic-link creation is probed
 * ONCE; where it is unavailable (Windows without the privilege) the suite FAILS
 * LOUDLY with the platform and the error rather than skipping — a security fence
 * that silently does not run is worse than a red one, and zero-skipped is a gate.
 */

const { test, describe, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const HOOK = path.join(REPO, 'src', 'hooks', 'PreToolUse.Bash.js');
const stateManager = require(path.join(REPO, 'src', 'lib', 'state-manager'));

// --- symbolic-link capability probe (once) ----------------------------------

let SYMLINK_ERR = null;
before(() => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-141-probe-'));
  try {
    fs.symlinkSync('target', path.join(d, 'l'));
  } catch (e) {
    SYMLINK_ERR = e;
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

/** Assert symbolic links are usable; FAIL LOUDLY (never skip) when they are not. */
function requireSymlinks() {
  if (SYMLINK_ERR) {
    assert.fail(
      `symbolic-link creation is unavailable on ${process.platform} ` +
      `(${SYMLINK_ERR.code}: ${SYMLINK_ERR.message}) — this security fence cannot run ` +
      `without real links, and it FAILS rather than skipping so the gap is never silent.`,
    );
  }
}

// --- hermetic project + signed state ----------------------------------------

let project;

function makeProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-141-')));
  fs.mkdirSync(path.join(dir, '.ctoc', 'approvals'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ctoc', 'state'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# CTOC Project Instructions\n');
  for (const stage of ['vision', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done']) {
    fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  }
  return dir;
}

function cleanupProject(dir) {
  if (!dir) return;
  try { fs.rmSync(stateManager.getStatePath(dir), { force: true }); } catch { /* none */ }
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Plant valid signed state: step 10, feature set ⇒ write + commit gates allow. */
function setState(step = 10, feature = 'link-ledger-test') {
  const state = stateManager.createState(project, feature, 'javascript', null);
  state.currentStep = step;
  stateManager.saveState(project, state);
}

const ledger = require(path.join(REPO, 'src', 'lib', 'approval-ledger'));

/**
 * Mint an APPROVED plan covering `globs` so the 00202 plan-coverage stage ALLOWS the
 * write — isolating the guard this file tests (the link-into-`.ctoc/approvals` deny, and
 * its degradation). Since 00202 a determinate write to an UNCOVERED file is denied on the
 * shell channel; without a covering plan that deny would SHADOW the ledger-link
 * assertion, replacing "denied because the link reaches the ledger" with "denied because
 * uncovered". The ledger guard runs BEFORE coverage, so covering the target NEVER
 * un-denies a real link-into-ledger write when the confinement module is present — it
 * only removes the coverage shadow so the degradation case shows the ledger truth.
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

/** Run the REAL hook with `command` on STDIN, cwd = the fixture (so process.cwd() is root). */
function runHook(command, cwd = project) {
  return spawnSync(process.execPath, [HOOK], {
    cwd,
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    env: { ...process.env, CLAUDE_TOOL_INPUT: '' },
    encoding: 'utf8',
    timeout: 20000,
  });
}

/** The deny decision on stdout, or null when the hook ALLOWED the command. */
function denyOf(res) {
  const out = String(res.stdout || '');
  const start = out.indexOf('{');
  if (start === -1) return null;
  try {
    const parsed = JSON.parse(out.slice(start));
    const d = parsed && parsed.hookSpecificOutput;
    return d && d.permissionDecision === 'deny' ? d : null;
  } catch { return null; }
}

const assertDenied = (command, why) => {
  const res = runHook(command);
  assert.equal(res.error, undefined, `hook errored (${why}): ${res.error && res.error.message}`);
  const d = denyOf(res);
  assert.ok(d, `LINK-LEDGER WRITE NOT BLOCKED (${why}): ${command}`);
  return d;
};

const assertAllowed = (command, why, cwd = project) => {
  const res = runHook(command, cwd);
  assert.equal(res.error, undefined, `hook errored (${why}): ${res.error && res.error.message}`);
  const d = denyOf(res);
  assert.equal(d, null,
    `FALSE POSITIVE — legitimate command denied (${why}): ${command}\n  reason: ${d && d.permissionDecisionReason}`);
};

/** A directory symlink (junction on Windows) inside the fixture, target relative to it. */
function link(linkRel, targetRel) {
  const type = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(targetRel, path.join(project, linkRel), type);
}
/** A file-target symlink (no type hint) — used for the dangling-into-ledger case. */
function fileLink(linkRel, targetRel) {
  fs.symlinkSync(targetRel, path.join(project, linkRel));
}

beforeEach(() => { project = makeProject(); setState(10); });
afterEach(() => { cleanupProject(project); project = null; });

// =============================================================================
// The proved chain and its shapes — every one must be DENIED
// =============================================================================

describe('a write reaching the ledger through a link is DENIED', () => {
  test('case 1: the proved chain — link → .ctoc, then redirect through it', () => {
    requireSymlinks();
    link('src/link', '../.ctoc');
    assertDenied(`echo '{"kind":"human"}' > src/link/approvals/forged.json`, 'link → .ctoc then redirect');
  });

  test('case 2: the parent-link variant is DENIED (adjacency already catches it — pins it stays)', () => {
    requireSymlinks();
    const repoName = path.basename(project);
    link('up', '..');
    assertDenied(`echo x > up/${repoName}/.ctoc/approvals/f.json`, 'parent link, path still spells the ledger');
  });

  test('case 3: the link IS the ledger directory itself — tee through it', () => {
    requireSymlinks();
    link('src/led', '../.ctoc/approvals');
    assertDenied(`echo x | tee src/led/f.json`, 'link points straight at .ctoc/approvals');
  });

  test('case 4: through a cd — prefix applied BEFORE resolution', () => {
    requireSymlinks();
    link('src/link', '../.ctoc');
    assertDenied(`cd src && echo x > link/approvals/f.json`, 'cd prefix must be applied before resolving');
  });

  test('case 5: a DANGLING link into the ledger (inherits 00140)', () => {
    requireSymlinks();
    fileLink('src/link', '../.ctoc/approvals/notyet.json'); // target does not exist yet
    assertDenied(`echo x > src/link`, 'a forged entry is by definition not-yet-existing → dangling');
  });

  test('case 6: cp through a link', () => {
    requireSymlinks();
    link('src/link', '../.ctoc');
    fs.writeFileSync(path.join(project, 'forged.json'), '{}');
    assertDenied(`cp forged.json src/link/approvals/f.json`, 'cp destination resolves into the ledger');
  });

  test('case 7: an interpreter writing through a link', () => {
    requireSymlinks();
    link('src/link', '../.ctoc');
    assertDenied(
      `node -e "require('fs').writeFileSync('src/link/approvals/f.json','x')"`,
      'the fs write operand resolves into the ledger',
    );
  });

  test('case 13: a link LOOP in an operand is DENIED and the process RETURNS (no hang)', () => {
    requireSymlinks();
    // a → b, b → a: realpath answers ELOOP, resolvesUnder returns true (fault = deny).
    fileLink('a', 'b');
    fileLink('b', 'a');
    const res = runHook(`echo x > a/f.json`);
    assert.equal(res.error, undefined, `the hook must not hang or crash on a link loop: ${res.error && res.error.message}`);
    const d = denyOf(res);
    assert.ok(d, 'a link loop in a write operand must DENY (fail closed), not allow');
  });
});

// =============================================================================
// A READ through a link stays ALLOWED — reading provenance is legitimate
// =============================================================================

describe('a read through a link stays ALLOWED', () => {
  test('case 8: cat through a link into the ledger is allowed', () => {
    requireSymlinks();
    link('src/link', '../.ctoc');
    fs.writeFileSync(path.join(project, '.ctoc', 'approvals', 'x.json'), '{}');
    assertAllowed('cat src/link/approvals/x.json', 'reading a ledger entry through a link is not forgery');
  });
});

// =============================================================================
// The third test ADDS — the arithmetic guards still fire (unchanged verdicts)
// =============================================================================

describe('case 9: the arithmetic guards still fire (the third test adds, never replaces)', () => {
  test('every direct spelling stays DENIED', () => {
    const denies = [
      `echo '{}' > .ctoc/approvals/x.json`,          // plain
      `echo '{}' > .ctoc"/"approvals/x.json`,        // quote-split
      `cd .ctoc && cp /tmp/f.json approvals/x.json`, // cd-split
      `cd "--" .ctoc/approvals && tee evil.json`,    // quoted `--`
      `cd ~/x/.ctoc/approvals && tee evil.json`,     // ~-prefixed
      `cd .ctoc/approvals && cd "" && tee evil.json`,// cd "" no-op
    ];
    for (const c of denies) assertDenied(c, 'arithmetic guard (unchanged)');
  });
  test('read via cd and a sibling dir stay ALLOWED', () => {
    fs.writeFileSync(path.join(project, '.ctoc', 'approvals', 'x.json'), '{}');
    assertAllowed('cd .ctoc/approvals && cat x.json', 'cd + cat is a read');
    assertAllowed('cp /tmp/f.json .ctoc/approvals-summary/x.json', 'approvals-summary is not the ledger');
  });
});

// =============================================================================
// The false-positive fence — nothing legitimate is newly denied
// =============================================================================

describe('cases 10–12: no false positives (legitimate commands stay ALLOWED)', () => {
  test('case 10: every node -e recipe in start.md is ALLOWED, verbatim', () => {
    const md = fs.readFileSync(path.join(REPO, 'src', 'commands', 'start.md'), 'utf8');
    const recipes = [];
    const re = /`(node\s+-e\s+"[^`]*")`/g;
    let m;
    while ((m = re.exec(md)) !== null) recipes.push(m[1]);
    assert.ok(recipes.length >= 5, 'expected start.md node -e recipes to be parsed (a zero count is vacuous)');
    for (const r of recipes) assertAllowed(r, 'start.md menu recipe');
  });

  test('case 11: ordinary development commands are ALLOWED', () => {
    // Step 15 so the orthogonal COMMIT gate permits `git commit` — this case
    // isolates the LEDGER guard, which must leave every one of these alone.
    setState(15);
    coverPlan(['src/ordinary.js']); // 00202: the one determinate write below is covered
    for (const c of [
      `git commit -m "x"`,
      `npm test`,
      `git add src/lib/x.js`,
      `node src/commands/menu.js`,
      `grep -rn foo src/`,
      `echo hello > src/ordinary.js`,
    ]) assertAllowed(c, 'ordinary dev command');
  });

  test('case 12: an operand that is not a path is ALLOWED', () => {
    assertAllowed('git log --oneline origin/main', 'origin/main is a ref, not a ledger path');
  });
});

// =============================================================================
// The fence is not vacuous — the SAME fixture with NO link allows the write
// =============================================================================

describe('case 15: the fence is not vacuous', () => {
  test('the identical redirect with NO link is ALLOWED', () => {
    // No link created. `src/approvals/...` does not resolve into `.ctoc/approvals`,
    // proving cases 1–7 deny for the LINK reason, not because the harness denies all.
    coverPlan(['src/ordinary.json']); // 00202: cover the target so the LINK reason is isolated
    assertAllowed(`echo x > src/ordinary.json`, 'an ordinary in-tree write is not a ledger write');
  });

  test('a pathologically long token is ALLOWED (ENAMETOOLONG must not fail-close to a false deny)', () => {
    // A 20k-char token cannot name a real filesystem entry; resolving it answers
    // ENAMETOOLONG, and the confinement fault-to-deny would falsely block a harmless
    // echo. Such a path is too long to WRITE, so no ledger entry is reachable.
    assertAllowed(`echo ${'a'.repeat(20000)}`, 'a too-long token is not a resolvable ledger path');
  });
});

// =============================================================================
// case 16 (cost): a corpus of ordinary commands returns — timing is recorded at
// Step 9, never asserted as a threshold here (a timing assertion is a flaky test)
// =============================================================================

describe('case 16: the guard RETURNS on a corpus of ordinary commands', () => {
  test('a corpus of ordinary commands all return a verdict (no hang, no crash)', () => {
    const corpus = [
      `git status`, `git add -A`, `git add src/a.js src/b.js src/c.js`,
      `npm test`, `npm run build`, `node src/commands/start.js`,
      `grep -rn foo src/`, `find src -name '*.js'`, `ls -la`,
      `echo hello`, `cat package.json`, `head -n 5 README.md`,
    ];
    for (const c of corpus) {
      const res = runHook(c);
      assert.equal(res.error, undefined, `must return (no hang/crash): ${c}`);
    }
  });
});

// =============================================================================
// case 14: the module missing DEGRADES rather than crashes
//
// With real-path-confinement unloadable, the fail-soft require leaves the guard
// with the arithmetic tests only: direct spellings stay DENIED (the hook still
// runs, does not exit 1 / allow-all), and the LINK case is ALLOWED — exactly the
// degradation the code comment predicts. Driven by a test-only Module._load shim
// (no product backdoor): the shim throws for that one require, then loads the hook.
// =============================================================================

describe('case 14: unloadable confinement module degrades, does not crash', () => {
  /** Run the hook with real-path-confinement forced to fail loading. */
  function runDegraded(command) {
    const shim = path.join(project, '_break-confinement.js');
    fs.writeFileSync(shim, `
const Module = require('module');
const orig = Module._load;
Module._load = function (request, parent, isMain) {
  if (String(request).includes('real-path-confinement')) {
    throw new Error('simulated unloadable confinement module');
  }
  return orig.call(this, request, parent, isMain);
};
require(${JSON.stringify(HOOK)});
`);
    return spawnSync(process.execPath, [shim], {
      cwd: project,
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
      env: { ...process.env, CLAUDE_TOOL_INPUT: '' },
      encoding: 'utf8',
      timeout: 20000,
    });
  }

  test('the hook still runs and a DIRECT spelling stays DENIED under degradation', () => {
    requireSymlinks();
    const res = runDegraded(`echo '{}' > .ctoc/approvals/x.json`);
    assert.equal(res.error, undefined, `degraded hook must still run: ${res.error && res.error.message}`);
    assert.ok(denyOf(res), 'the arithmetic guard alone must still deny a direct ledger write when degraded');
  });

  test('the LINK case: the LEDGER guard is blind under degradation, but 00202 coverage fails CLOSED and DENIES the determinate forgery', () => {
    requireSymlinks();
    link('src/link', '../.ctoc');
    const res = runDegraded(`echo x > src/link/approvals/forged.json`);
    assert.equal(res.error, undefined, `degraded hook must still run: ${res.error && res.error.message}`);
    // TIGHTENED by 00202 (was: assert ALLOWED). The `real-path-confinement` module the
    // shim removes is required by BOTH the ledger guard AND `plan-coverage`. So under
    // this degradation the ledger guard IS still blind to the link (its documented
    // degradation is unchanged) — but the Bash hook's `coverage` module now fails to
    // load too, and the 00202 coverage stage fails CLOSED on a DETERMINATE write it
    // cannot verify. This exact `echo > …` redirect is a determinate write, so the
    // forgery is DENIED anyway — defense-in-depth: a second absolute guard catches what
    // the blinded first one cannot. (The residual link path stays open only for
    // INDETERMINATE write forms, which 00202 deliberately does not act on — deferred.)
    const d = denyOf(res);
    assert.ok(d, 'a determinate link-forgery write must be denied by coverage-fail-closed under degradation');
    assert.match(d.permissionDecisionReason || '', /no approved plan covers/i,
      'the deny is the coverage stage failing closed (coverage module absent), not the ledger guard');
  });
});
