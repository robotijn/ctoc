/**
 * The setup preview tells the truth, and nothing installs a git hook unasked.
 *
 * TWO DEFECTS, one function (`initProject`, src/lib/init-project.js):
 *
 *  1. The preview LIED IN BOTH DIRECTIONS AT ONCE. Four sites had the shape
 *     `if (!dryRun) { write(); } created.push(label);` — the write was skipped
 *     in a preview, the ANNOUNCEMENT was not. So a preview's report was
 *     byte-identical to a real run's, and nothing in the returned value said
 *     which one produced it.
 *
 *  2. Meanwhile the ONE item that is genuinely a consent decision — a git hook
 *     that fires on EVERY commit the human ever makes — sat entirely inside the
 *     `!dryRun` branch. So it NEVER appeared in a preview and ALWAYS installed
 *     on a real run. Every harmless item was over-reported; the single item that
 *     modifies the user's git repository was under-reported to zero. The owner
 *     found it in his repository himself, after the fact.
 *
 *  3. And `success` was the literal `true` — true when every write succeeded,
 *     true when every write was skipped, true in a preview that wrote nothing.
 *
 * The fixtures deliberately include BROKEN WORLDS, because a fixture that is
 * always well-formed cannot find a defect in what happens when the world is
 * not: a directory that is not a repository, a repository whose hook write
 * fails, and a repository that already carries a foreign post-commit hook that
 * must not be clobbered.
 *
 * No `git` binary is invoked anywhere here (a test that shells out to a binary
 * would be skipped where the binary is absent, and a skip is a gate failure).
 * The `.git` fixtures are a directory named `.git` holding a `hooks/` directory.
 */

'use strict';

const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const safeFs = require('../src/lib/safe-fs');
const { initProject, PLAN_DIRS, CTOC_DIRS } = require('../src/lib/init-project');

const INIT_SOURCE = path.join(__dirname, '..', 'src', 'lib', 'init-project.js');

/** Make a fresh temp project directory. */
function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-init-truth-'));
}

function rm(dir) {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
}

/** A directory that LOOKS like a repository to the installer, without git. */
function fakeGitRepo(dir) {
  fs.mkdirSync(path.join(dir, '.git', 'hooks'), { recursive: true });
  return dir;
}

function hookPathOf(dir) {
  return path.join(dir, '.git', 'hooks', 'post-commit');
}

function exists(...segs) {
  return fs.existsSync(path.join(...segs));
}

/**
 * Replace one safe-fs method for the duration of a callback.
 *
 * `init-project.js` calls `safeFs.writeFileSync(...)` through a property lookup
 * on the shared module exports at CALL time, so patching the exports object is
 * a real seam into the write path — no mock of the code under test.
 */
const patched = [];
function patchSafeFs(method, impl) {
  patched.push([method, safeFs[method]]);
  safeFs[method] = impl;
}
function restoreSafeFs() {
  while (patched.length) {
    const [method, original] = patched.pop();
    safeFs[method] = original;
  }
}

describe('the setup preview tells the truth', () => {
  let dir;
  before(() => { dir = mkTmp(); });
  after(() => rm(dir));
  afterEach(restoreSafeFs);

  it('CASE 1 — a preview writes nothing to disk', () => {
    initProject(dir, { dryRun: true });

    assert.ok(!exists(dir, '.ctoc'), '.ctoc/ must not exist after a preview');
    assert.ok(!exists(dir, 'plans'), 'plans/ must not exist after a preview');
    for (const d of PLAN_DIRS) {
      assert.ok(!exists(dir, ...d.split('/')), `${d} must not exist after a preview`);
    }
    assert.ok(!exists(dir, 'CLAUDE.md'), 'CLAUDE.md must not exist after a preview');
  });

  it('CASE 2 — a preview reports NOTHING as created, and says it is a preview', () => {
    const report = initProject(dir, { dryRun: true });

    assert.deepStrictEqual(report.created, [],
      'a preview created nothing, so `created` must be empty — this is the defect');
    assert.ok(Array.isArray(report.wouldCreate) && report.wouldCreate.length > 0,
      '`wouldCreate` must carry the preview list');
    assert.strictEqual(report.dryRun, true,
      'the report must be structurally distinguishable from a real run');
  });

  it('CASE 10 — `success` is null in a preview, not true', () => {
    const report = initProject(dir, { dryRun: true });
    assert.strictEqual(report.success, null,
      'a preview has no success to report; `true` would repeat the lie in a new field');
  });

  it('CASE 3 — a preview and a real run describe the SAME set of actions', () => {
    const previewDir = mkTmp();
    const realDir = mkTmp();
    try {
      const preview = initProject(previewDir, { dryRun: true });
      const real = initProject(realDir);

      assert.deepStrictEqual(
        [...preview.wouldCreate].sort(),
        [...real.created].sort(),
        'the preview must describe exactly what a real run does — no more, no less'
      );
    } finally {
      rm(previewDir);
      rm(realDir);
    }
  });
});

describe('nothing installs a git hook without being asked', () => {
  afterEach(restoreSafeFs);

  it('CASE 5 — a real run does NOT install the post-commit hook (the consent defect)', () => {
    const d = fakeGitRepo(mkTmp());
    try {
      initProject(d);

      const installed = fs.existsSync(hookPathOf(d));
      assert.strictEqual(installed, false,
        'setup installed a hook that fires on every commit, without asking. '
        + 'Asserted from the filesystem, not from the report.\n'
        + (installed ? '--- the hook it wrote ---\n' + fs.readFileSync(hookPathOf(d), 'utf8') : ''));
    } finally {
      rm(d);
    }
  });

  it('CASE 6 — and the real run SAYS the hook was not installed, and what it would do', () => {
    const d = fakeGitRepo(mkTmp());
    try {
      const report = initProject(d);
      const text = [...report.created, ...report.skipped].join('\n');

      assert.match(text, /post-commit/, 'the report must name the hook');
      assert.match(text, /NOT installed/, 'the report must say it did not happen');
      assert.match(text, /every commit/, 'the report must say what it would do');
    } finally {
      rm(d);
    }
  });

  it('CASE 4 — the hook notice appears in a PREVIEW too', () => {
    const d = fakeGitRepo(mkTmp());
    try {
      const report = initProject(d, { dryRun: true });
      const text = [...report.wouldCreate, ...report.skipped].join('\n');

      assert.match(text, /post-commit/,
        'the one item that is a consent decision must not be the one item a preview hides');
      assert.match(text, /NOT installed/);
    } finally {
      rm(d);
    }
  });

  it('CASE 7 — an EXPLICIT request does install it, unchanged', () => {
    const d = fakeGitRepo(mkTmp());
    try {
      const report = initProject(d, { installGitHook: true });

      assert.ok(fs.existsSync(hookPathOf(d)), 'the explicit option must still install');
      const body = fs.readFileSync(hookPathOf(d), 'utf8');
      assert.match(body, /CTOC/, 'the installed hook carries CTOC\'s sentinel');
      assert.match(body, /post-commit\.js/, 'the hook launches src/hooks/post-commit.js');
      assert.match(report.created.join('\n'), /post-commit/);
    } finally {
      rm(d);
    }
  });

  // ── BROKEN WORLDS ───────────────────────────────────────────────────────────

  it('BROKEN WORLD A — a directory that is NOT a repository mentions no hook at all', () => {
    const d = mkTmp();   // deliberately no .git
    try {
      const report = initProject(d);
      const text = [...report.created, ...report.skipped, ...report.failed].join('\n');
      assert.ok(!/post-commit/.test(text),
        'there is no repository here, so there is nothing to say about a git hook');
      assert.strictEqual(report.success, true, 'a non-repository is still a successful setup');
    } finally {
      rm(d);
    }
  });

  it('BROKEN WORLD B — an existing FOREIGN post-commit hook is left byte-identical', () => {
    const d = fakeGitRepo(mkTmp());
    const foreign = '#!/bin/sh\necho "this is the user\'s own hook"\n';
    fs.writeFileSync(hookPathOf(d), foreign, 'utf8');
    try {
      initProject(d);
      assert.strictEqual(fs.readFileSync(hookPathOf(d), 'utf8'), foreign,
        'setup must not touch a hook the human wrote');
    } finally {
      rm(d);
    }
  });

  it('BROKEN WORLD C — an unwritable hooks directory is RECORDED, never thrown', () => {
    const d = fakeGitRepo(mkTmp());
    try {
      patchSafeFs('writeFileSync', (p, ...rest) => {
        if (String(p).includes('post-commit')) {
          throw new Error('EACCES: permission denied');
        }
        return patched[0][1](p, ...rest);
      });

      let report;
      assert.doesNotThrow(() => { report = initProject(d, { installGitHook: true }); },
        'a hook-install failure must never break project setup');

      assert.match(report.failed.concat(report.skipped).join('\n'), /post-commit/,
        'the failure must be nameable, not swallowed');
      // Setup continued past it.
      for (const stage of PLAN_DIRS) {
        assert.ok(exists(d, ...stage.split('/')), `${stage} must still exist`);
      }
    } finally {
      restoreSafeFs();
      rm(d);
    }
  });
});

describe('the report is computed, not decorated', () => {
  afterEach(restoreSafeFs);

  it('CASE 11 — `success` is true only when everything required is present', () => {
    const d = mkTmp();
    try {
      const report = initProject(d);

      assert.strictEqual(report.success, true);
      assert.deepStrictEqual(report.failed, []);
      assert.deepStrictEqual(report.missing, []);
      for (const stage of PLAN_DIRS) {
        assert.ok(exists(d, ...stage.split('/')), `${stage} exists on disk`);
      }
      for (const c of CTOC_DIRS) {
        assert.ok(exists(d, ...c.split('/')), `${c} exists on disk`);
      }
      assert.ok(exists(d, '.ctoc', 'settings.yaml'));
      assert.ok(exists(d, '.ctoc', 'state', 'iron-loop.yaml'));
    } finally {
      rm(d);
    }
  });

  it('CASE 8 — `success` is FALSE when a required write fails, and the artifact is named', () => {
    const d = mkTmp();
    try {
      const realWrite = safeFs.writeFileSync;
      patchSafeFs('writeFileSync', (p, ...rest) => {
        if (String(p).includes('settings.yaml')) throw new Error('EACCES: permission denied');
        return realWrite(p, ...rest);
      });

      let report;
      assert.doesNotThrow(() => { report = initProject(d); },
        'a failed artifact write must be recorded, not propagated into a bare catch');

      assert.strictEqual(report.success, false, '`success` must reflect the failure');
      assert.match(report.failed.join('\n'), /settings\.yaml/, '`failed` names the artifact');
      assert.match(report.missing.join('\n'), /settings\.yaml/, '`missing` names it too');
    } finally {
      restoreSafeFs();
      rm(d);
    }
  });

  it('CASE 9 — one failed write does not cost the run its plan directories', () => {
    const d = mkTmp();
    try {
      const realWrite = safeFs.writeFileSync;
      patchSafeFs('writeFileSync', (p, ...rest) => {
        if (String(p).includes('settings.yaml')) throw new Error('EACCES: permission denied');
        return realWrite(p, ...rest);
      });

      initProject(d);

      for (const stage of PLAN_DIRS) {
        assert.ok(exists(d, ...stage.split('/')),
          `${stage} must survive an unrelated artifact failure`);
      }
    } finally {
      restoreSafeFs();
      rm(d);
    }
  });

  it('CASE 12 — an already-set-up project reports skipped, not created', () => {
    const d = mkTmp();
    try {
      initProject(d);
      const second = initProject(d);

      assert.deepStrictEqual(second.created, [],
        'a second run creates nothing, so `created` must be empty');
      assert.match(second.skipped.join('\n'), /settings\.yaml/,
        '`skipped` names the pre-existing artifacts');
      assert.strictEqual(second.success, true,
        'an already-complete project is a success — the artifacts are present');
    } finally {
      rm(d);
    }
  });

  it('CASE 13 — the menu\'s read-back agrees with the report', () => {
    const d = mkTmp();
    try {
      const realWrite = safeFs.writeFileSync;
      patchSafeFs('writeFileSync', (p, ...rest) => {
        if (String(p).includes('settings.yaml')) throw new Error('EACCES: permission denied');
        return realWrite(p, ...rest);
      });

      const { ensureInitialized } = require('../src/commands/menu');
      const verdict = ensureInitialized(d);

      assert.strictEqual(verdict.ok, false,
        'the two independent layers must not contradict each other');
      assert.match(verdict.missing.join('\n'), /settings\.yaml/);
    } finally {
      restoreSafeFs();
      rm(d);
    }
  });

  it('CASE 14 — `success` is not a hardcoded literal in the source', () => {
    const src = fs.readFileSync(INIT_SOURCE, 'utf8');
    assert.ok(!/return\s*\{\s*success:\s*true\s*,/.test(src),
      'the defect being fixed is literally a hardcoded `true`; a behavioural test alone '
      + 'would pass on a re-introduction that happens to be correct on these fixtures');
    assert.match(src, /REQUIRED_ARTIFACTS/,
      '`success` must be computed from a required-artifact read-back');
  });
});
