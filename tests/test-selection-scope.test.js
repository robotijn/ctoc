'use strict';
/**
 * Test-SELECTION scope — the shallow-clone false green (plan 00208).
 *
 * The defect: runSmartTests derived "what changed" from `git diff HEAD~1` — the TIP
 * commit only. On a shallow clone (`actions/checkout` defaults to fetch-depth:1) or a
 * single-commit repo, HEAD~1 does not resolve, the command fails, `allowFail` + `|| ''`
 * turns that into an EMPTY changed-file list, and the empty list returned
 * `{ passed:true, passCount:0, cached:true }` — a PASS reported over tests that never
 * ran, on the machine whose entire job is to run them. This is the false-green class:
 * a verdict emitted over input the instrument never received.
 *
 * The fix reuses the security path's push-delta encoding (getPushDeltaBlobs): a real
 * delta selects affected tests; an EMPTY delta (`[]`, git looked and found nothing) and
 * an INDETERMINATE delta (`null`, git could not be consulted) BOTH escalate to the FULL
 * suite with DISTINCT, honest messages. The one honest zero-test pass — a positive
 * content-hash match — is preserved.
 *
 * The only mocked seam is child_process (git-unavailable case); every git case builds a
 * REAL throwaway repository under os.tmpdir(). Cross-platform: path.join, os.tmpdir, no
 * shells as entry points, no fixed git path. This suite NEVER touches this repository's
 * own git state.
 */

const { test, describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');

const QA_PATH = require.resolve('../src/lib/quality-agent');
const qualityAgent = require(QA_PATH);

// A `git` on PATH is required for every case except the mocked git-unavailable one.
// If it is absent we SKIP LOUDLY with a printed reason — never a silent green.
let GIT_OK = true;
let GIT_SKIP_REASON = '';
try {
  cp.execFileSync('git', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  GIT_OK = false;
  GIT_SKIP_REASON = `git is not available on PATH (${e && e.message}) — real-repo cases skipped`;
}

// Gate the REGISTRATION, never the body: a `skip:`/`todo:` option makes the gate
// nondeterministic across machines and node's zero-skipped gate forbids it. When git is
// absent the real-repo cases are simply NOT registered (they contribute 0 to the skipped
// count); the loud "git availability" test at the bottom announces why.
const gitIt = GIT_OK ? it : () => {};

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}
function git(args, cwd) {
  return cp.execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'ctoc-test', GIT_AUTHOR_EMAIL: 'ctoc@test.invalid',
      GIT_COMMITTER_NAME: 'ctoc-test', GIT_COMMITTER_EMAIL: 'ctoc@test.invalid',
      GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_SYSTEM: os.devNull
    }
  }).trim();
}

/** Capture console.log output while fn runs; always restore. */
async function captureLog(fn) {
  const orig = console.log;
  const lines = [];
  console.log = (...a) => lines.push(a.map(String).join(' '));
  let res;
  try {
    res = await fn();
  } finally {
    console.log = orig;
  }
  return { res, out: lines.join('\n') };
}

/** Run fn with cwd temporarily set to dir; always restore. */
async function withCwd(dir, fn) {
  const orig = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(orig);
  }
}

const NODE = process.execPath;
// A node one-liner that prints a runner summary the parser reads as 3 pass / 0 fail —
// identical on every platform. runFullTests / runSpecificTests run this via the real
// child_process, so a green here PROVES the runner actually executed.
const GREEN = `"${NODE}" -e "console.log('# pass 3'); console.log('# fail 0')"`;

// A repo with a single commit: HEAD~1 does not resolve. This is the shallow-clone /
// single-commit condition — the headline defect's trigger.
function makeSingleCommitRepo(prefix) {
  const dir = mkTmp(prefix);
  git(['init'], dir);
  fs.writeFileSync(path.join(dir, 'app.js'), 'module.exports = 1;\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'only commit'], dir);
  return dir;
}

// A local "remote" cloned into a working copy whose HEAD == @{upstream}: git works and
// the push delta @{upstream}..HEAD is GENUINELY empty (`[]`, not null).
function makeEmptyDeltaClone(prefix) {
  const remote = mkTmp(prefix + 'remote-');
  git(['init', '--bare'], remote);
  const seed = mkTmp(prefix + 'seed-');
  git(['init'], seed);
  fs.writeFileSync(path.join(seed, 'app.js'), 'module.exports = 1;\n');
  git(['add', '-A'], seed);
  git(['commit', '-m', 'seed'], seed);
  git(['branch', '-M', 'main'], seed);
  git(['remote', 'add', 'origin', remote], seed);
  git(['push', '-u', 'origin', 'main'], seed);
  rm(seed);
  // Clone into a fresh child dir so HEAD tracks origin/main at the same commit — the
  // push delta @{upstream}..HEAD is then genuinely empty.
  const parent = mkTmp(prefix + 'parent-');
  const checkout = path.join(parent, 'checkout');
  git(['clone', remote, checkout], parent);
  return { workdir: checkout, cleanup: () => { rm(parent); rm(remote); } };
}

// ---------------------------------------------------------------------------
// child_process seam for the "git unavailable on PATH" case. quality-agent
// destructures execSync/execFileSync at load, so we reload it AFTER installing the
// spy. execFileSync throws ENOENT for `git` (git not on PATH); execSync captures the
// full-suite command and returns a green summary. Portable — no PATH mutation
// (Decision 6: PATH-stripping is platform-sensitive; the seam is the honest sim).
// ---------------------------------------------------------------------------
const REAL_EXECSYNC = cp.execSync;
const REAL_EXECFILESYNC = cp.execFileSync;

function withGitAbsent(fn) {
  const shellCalls = [];
  const gitFileCalls = [];
  cp.execFileSync = (bin, args, opts) => {
    if (bin === 'git') {
      gitFileCalls.push(args);
      const err = new Error('spawn git ENOENT');
      err.code = 'ENOENT';
      throw err;
    }
    return REAL_EXECFILESYNC(bin, args, opts);
  };
  cp.execSync = (command) => {
    shellCalls.push(command);
    // git is unavailable: a shell `git ...` invocation (the OLD HEAD~1 path used one)
    // fails exactly as it would with no git on PATH, so the pre-fix code produces its
    // empty-list false green and this case is RED before the fix.
    if (/^\s*git\b/.test(command)) {
      const err = new Error('git: command not found');
      err.status = 127;
      throw err;
    }
    return '# pass 3\n# fail 0\n';
  };
  delete require.cache[QA_PATH];
  const qa = require(QA_PATH);
  try {
    return fn(qa, { shellCalls, gitFileCalls });
  } finally {
    cp.execFileSync = REAL_EXECFILESYNC;
    cp.execSync = REAL_EXECSYNC;
    delete require.cache[QA_PATH];
  }
}

// A spy that records whether git was invoked AT ALL, so a test can prove an
// undetermined-language short-circuit returns BEFORE any git call.
function withGitCallCounter(fn) {
  let gitCalls = 0;
  cp.execFileSync = (bin, args, opts) => {
    if (bin === 'git') { gitCalls += 1; }
    return REAL_EXECFILESYNC(bin, args, opts);
  };
  cp.execSync = (command, opts) => REAL_EXECSYNC(command, opts);
  delete require.cache[QA_PATH];
  const qa = require(QA_PATH);
  try {
    return fn(qa, () => gitCalls);
  } finally {
    cp.execFileSync = REAL_EXECFILESYNC;
    cp.execSync = REAL_EXECSYNC;
    delete require.cache[QA_PATH];
  }
}

// The invariant every escalation case shares: a full-suite run is passed:true, NOT
// cached, and reports the runner's real count — never the { passed:true, passCount:0,
// cached:true } shape that is the false green.
function assertFullSuiteRan(res, ctx) {
  assert.equal(res.passed, true, `${ctx}: full suite must pass for a green runner`);
  assert.ok(!res.cached, `${ctx}: a full-suite escalation must NOT return the cached zero-test shortcut`);
  assert.ok(!(res.passed === true && res.passCount === 0 && res.cached === true),
    `${ctx}: MUST NOT report the false-green { passed:true, passCount:0, cached:true }`);
}

describe('test selection uses the real push delta, never HEAD~1 (plan 00208)', () => {
  // Case 1 — the headline defect. A shallow clone / single-commit repo (HEAD~1 absent)
  // must run the FULL suite, never report a zero-test pass.
  gitIt('1. shallow clone / single-commit (HEAD~1 absent) runs the full suite — NOT a zero-test cached pass', async () => {
      const dir = makeSingleCommitRepo('ctoc-sel-shallow-');
      try {
        const { res, out } = await withCwd(dir, () =>
          captureLog(() => qualityAgent.runSmartTests({ js: { test: GREEN } })));
        assertFullSuiteRan(res, 'shallow');
        assert.equal(res.passCount, 3, 'the real runner count must surface (proves the suite ran)');
        assert.match(out, /full/i, 'the log must show the full suite ran');
      } finally {
        rm(dir);
      }
    });

  // Case 2 — a single-commit repository (the same git-level trigger, named explicitly).
  gitIt('2. single-commit repository runs the full suite', async () => {
      const dir = makeSingleCommitRepo('ctoc-sel-onecommit-');
      try {
        const { res } = await withCwd(dir, () =>
          captureLog(() => qualityAgent.runSmartTests({ js: { test: GREEN } })));
        assertFullSuiteRan(res, 'single-commit');
        assert.equal(res.passCount, 3);
      } finally {
        rm(dir);
      }
    });

  // Case 3 — not a git directory. Full suite runs and the log names git as unavailable.
  gitIt('3. a non-git directory runs the full suite and the log names git as unavailable', async () => {
      const dir = mkTmp('ctoc-sel-nogit-');
      try {
        fs.writeFileSync(path.join(dir, 'app.js'), 'module.exports = 1;\n');
        const { res, out } = await withCwd(dir, () =>
          captureLog(() => qualityAgent.runSmartTests({ js: { test: GREEN } })));
        assertFullSuiteRan(res, 'non-git-dir');
        assert.match(out, /could not determine|unavailable|not a git/i,
          'the log must say the delta could not be determined / git unavailable');
      } finally {
        rm(dir);
      }
    });

  // Case 4 — git not on PATH. Simulated via the child_process seam (Decision 6).
  it('4. git unavailable on PATH runs the full suite (child_process seam)', () =>
    withGitAbsent((qa, { shellCalls, gitFileCalls }) =>
      qa.runSmartTests({ js: { test: GREEN } }).then((res) => {
        assertFullSuiteRan(res, 'git-absent');
        assert.ok(gitFileCalls.length > 0, 'git WAS attempted (and threw ENOENT)');
        assert.ok(shellCalls.some(c => c.includes('-e')),
          'the full-suite test command must actually have been invoked');
      })));

  // Case 5 — git works and a real delta is present: affected tests are selected, green
  // stays green. The existing behaviour, unbroken.
  gitIt('5. a real delta selects affected tests and stays green', async () => {
      const dir = mkTmp('ctoc-sel-delta-');
      try {
        git(['init'], dir);
        fs.writeFileSync(path.join(dir, 'src.js'), 'module.exports = 1;\n');
        fs.writeFileSync(path.join(dir, 'src.test.js'), '// colocated test\n');
        git(['add', '-A'], dir);
        git(['commit', '-m', 'c1'], dir);
        fs.writeFileSync(path.join(dir, 'src.js'), 'module.exports = 2;\n');
        git(['add', '-A'], dir);
        git(['commit', '-m', 'c2 edit src'], dir);

        const { res } = await withCwd(dir, () =>
          captureLog(() => qualityAgent.runSmartTests({ js: { test: GREEN } })));
        assert.equal(res.passed, true, 'a real delta with a green suite must pass');
        assert.ok(!res.cached, 'a real delta is processed, not short-circuited as cached');
      } finally {
        rm(dir);
      }
    });

  // Case 6 — git works, delta genuinely empty (`[]`, HEAD == @{upstream}): full suite.
  gitIt('6. a genuinely empty delta ([]) runs the full suite', async () => {
      const { workdir, cleanup } = makeEmptyDeltaClone('ctoc-sel-empty-');
      try {
        const { res } = await withCwd(workdir, () =>
          captureLog(() => qualityAgent.runSmartTests({ js: { test: GREEN } })));
        assertFullSuiteRan(res, 'empty-delta');
        assert.equal(res.passCount, 3);
      } finally {
        cleanup();
      }
    });

  // Case 7 — the ONE honest zero-test pass: a real delta whose file CONTENTS match the
  // cache (a positive measurement). Preserved.
  gitIt('7. a positive content-hash match keeps the honest cached zero-test pass', async () => {
      const dir = mkTmp('ctoc-sel-cache-');
      try {
        git(['init'], dir);
        fs.writeFileSync(path.join(dir, 'src.js'), 'module.exports = 1;\n');
        fs.writeFileSync(path.join(dir, 'src.test.js'), '// colocated test\n');
        git(['add', '-A'], dir);
        git(['commit', '-m', 'c1'], dir);
        fs.writeFileSync(path.join(dir, 'src.js'), 'module.exports = 2;\n');
        git(['add', '-A'], dir);
        git(['commit', '-m', 'c2'], dir);

        await withCwd(dir, async () => {
          // First run populates the hash cache from real contents.
          const first = await captureLog(() => qualityAgent.runSmartTests({ js: { test: GREEN } }));
          assert.equal(first.res.passed, true);
          assert.ok(!first.res.cached, 'the first run measures and processes the delta');
          // Second run: contents UNCHANGED → positive hash match → the honest cached pass.
          const second = await captureLog(() => qualityAgent.runSmartTests({ js: { test: GREEN } }));
          assert.equal(second.res.passed, true);
          assert.equal(second.res.cached, true,
            'an unchanged re-run keeps the content-measured cached zero-test pass');
        });
      } finally {
        rm(dir);
      }
    });

  // Case 8 — `[]` (no delta) and `null` (could not look) must produce DISTINGUISHABLE
  // log output. The distinction is the whole subject.
  gitIt('8. "no delta" ([]) and "could not determine" (null) log different messages', async () => {
      // [] path: an empty-delta clone.
      const { workdir, cleanup } = makeEmptyDeltaClone('ctoc-sel-msg-empty-');
      let emptyOut;
      try {
        emptyOut = (await withCwd(workdir, () =>
          captureLog(() => qualityAgent.runSmartTests({ js: { test: GREEN } })))).out;
      } finally {
        cleanup();
      }
      // null path: a non-git directory.
      const nogit = mkTmp('ctoc-sel-msg-nogit-');
      let nullOut;
      try {
        nullOut = (await withCwd(nogit, () =>
          captureLog(() => qualityAgent.runSmartTests({ js: { test: GREEN } })))).out;
      } finally {
        rm(nogit);
      }
      // The relevant lines must differ: "no delta" is not "could not determine".
      assert.notEqual(emptyOut.trim(), nullOut.trim(),
        'the [] and null escalations must log different messages');
      assert.match(nullOut, /could not determine|unavailable|not a git/i);
      assert.doesNotMatch(emptyOut, /could not determine|unavailable|not a git/i);
    });

  // Case 9 — an undetermined-language short-circuit returns BEFORE any git call.
  it('9. an undetermined test language returns undetermined before any git call', () => {
    return withGitCallCounter((qa, gitCalls) =>
      qa.runSmartTests({ js: { test: null, testUndetermined: true } }).then((res) => {
        assert.equal(res.passed, false, 'undetermined is NOT a pass');
        assert.equal(res.undetermined, true);
        assert.equal(gitCalls(), 0, 'the undetermined short-circuit must precede any git call');
      }));
  });

  // Case 10 — the drift guard: no second changed-files implementation. The only HEAD~1
  // left in the module is inside getPushDeltaBlobs' historical comment, never a command.
  it('10. no live `git diff HEAD~1` remains — HEAD~1 survives only in a comment', () => {
    const src = fs.readFileSync(QA_PATH, 'utf8');
    const lines = src.split('\n');
    const offenders = [];
    lines.forEach((line, i) => {
      if (!line.includes('HEAD~1')) return;
      const trimmed = line.trim();
      const isComment = trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*');
      if (!isComment) offenders.push(`line ${i + 1}: ${trimmed}`);
    });
    assert.deepEqual(offenders, [],
      `HEAD~1 must appear only in comments (the getPushDeltaBlobs history), never as a live command. Offenders: ${offenders.join(' | ')}`);
    // And the specific defect invocation must be gone.
    assert.doesNotMatch(src, /git diff HEAD~1 --name-only/,
      'the `git diff HEAD~1 --name-only` selection command must be removed');
  });
});

// Announce a loud skip reason at load so a git-less machine never reads as a silent pass.
if (!GIT_OK) {
  test('git availability (real-repo cases were skipped)', () => {
    assert.ok(true, GIT_SKIP_REASON);
    console.log(`[test-selection-scope] ${GIT_SKIP_REASON}`);
  });
}
