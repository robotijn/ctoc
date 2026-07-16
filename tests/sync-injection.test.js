'use strict';

/**
 * sync-injection.test.js — SECURITY regression for src/lib/sync.js autoCommitPlan.
 *
 * DEFECT (HIGH, shell command injection / arbitrary command execution): autoCommitPlan
 * built its commit message from COMMIT_MESSAGES[action](planName, opts) — plan name and
 * stage strings interpolated verbatim — then ran it through a SHELL as an interpolated
 * string (`git commit -m "${message}"`). Any shell metacharacter in the plan name (or
 * opts.from / opts.to) escaped the quoted argument and executed. A plain `"` in a plan
 * name also broke every auto-commit.
 *
 * These tests use a REAL git repo under os.tmpdir() (no mocked child_process, no network):
 * the actual command runs, so a shell would actually execute the injected payload. The
 * fix passes the message as an argv element via execFileSync — no shell — so the payload
 * becomes an inert literal commit message on every platform.
 *
 * Every temp dir is removed in a per-test finally AND swept in `after`.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');

const sync = require('../src/lib/sync.js');

const madeDirs = [];
function mkTmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  madeDirs.push(d);
  return d;
}
function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
}
after(() => { for (const d of madeDirs) rm(d); });

// A real git repo on branch main with one commit (fixture git, not the module's).
function git(cwd, args) {
  return execSync(`git ${args}`, { cwd, stdio: 'pipe', encoding: 'utf8' });
}
function makeRepo() {
  const dir = mkTmp('sync-inj-');
  git(dir, 'init -q');
  git(dir, 'config user.email test@example.com');
  git(dir, 'config user.name Test');
  git(dir, 'config commit.gpgsign false');
  fs.mkdirSync(path.join(dir, 'plans'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'README.md'), 'seed\n');
  git(dir, 'add -A');
  git(dir, 'commit -q -m init');
  git(dir, 'branch -M main');
  return dir;
}
function writePlanChange(dir, name = 'p1.md') {
  fs.writeFileSync(path.join(dir, 'plans', name), `# plan\n\nbody ${Date.now()}\n`);
}

describe('autoCommitPlan shell-injection hardening', () => {
  it('must NOT execute a shell payload embedded in the plan name, and must still commit', () => {
    // Arrange — a real repo with a pending plan change, and a plan name carrying a
    // classic shell-injection payload that would `touch` a sentinel file if the message
    // ever reached a shell.
    const dir = makeRepo();
    const sentinel = path.join(dir, 'PWNED');
    const maliciousName = `a";touch ${sentinel};echo "`;
    writePlanChange(dir, 'legit.md');
    try {
      // Act
      const result = sync.autoCommitPlan('create', maliciousName, dir);

      // Assert — the sentinel was NEVER created: no shell ever saw the message.
      assert.equal(
        fs.existsSync(sentinel),
        false,
        'injected `touch` must NOT have run — the commit message must not pass through a shell'
      );
      // And the commit still succeeded, carrying the payload as an INERT literal subject.
      assert.equal(result.committed, true, 'a metacharacter-laden plan name must still commit');
      assert.equal(result.message, `plan: create ${maliciousName}`);
      const subject = git(dir, 'log -1 --pretty=%s').trim();
      assert.equal(subject, `plan: create ${maliciousName}`, 'the literal payload is the commit subject, inert');
    } finally { rm(dir); }
  });

  it('must not be broken by a plain double-quote in the plan name (regression)', () => {
    // Arrange — a bare `"` used to break the quoted shell argument and fail every commit.
    const dir = makeRepo();
    const quotedName = 'my "quoted" plan.md';
    writePlanChange(dir, 'quoted.md');
    try {
      // Act
      const result = sync.autoCommitPlan('edit', quotedName, dir);
      // Assert — commits cleanly with the literal message.
      assert.equal(result.committed, true);
      assert.equal(result.message, `plan: update ${quotedName}`);
      assert.equal(git(dir, 'log -1 --pretty=%s').trim(), `plan: update ${quotedName}`);
    } finally { rm(dir); }
  });

  it('commits a normal plan name correctly (no-regression)', () => {
    // Arrange
    const dir = makeRepo();
    writePlanChange(dir, 'normal.md');
    try {
      // Act
      const result = sync.autoCommitPlan('create', 'normal-plan.md', dir);
      // Assert
      assert.equal(result.committed, true);
      assert.equal(result.message, 'plan: create normal-plan.md');
      assert.equal(git(dir, 'log -1 --pretty=%s').trim(), 'plan: create normal-plan.md');
    } finally { rm(dir); }
  });

  it('returns the not-committed result when there is nothing to commit (no-regression)', () => {
    // Arrange — clean tree, no plan change staged.
    const dir = makeRepo();
    try {
      // Act
      const result = sync.autoCommitPlan('create', 'nothing.md', dir);
      // Assert — the empty-status guard returns before staging/committing.
      assert.equal(result.committed, false);
      assert.equal(result.reason, 'no changes');
      assert.equal(git(dir, 'log --oneline').trim().split('\n').length, 1, 'no extra commit created');
    } finally { rm(dir); }
  });
});
