#!/usr/bin/env node
'use strict';

/**
 * W08-s3 — SessionStart guards on package identity and describes enforcement honestly.
 *
 * Covers Defect 3 (finding H6) — SessionStart must never rewrite CTOC's own
 * hand-maintained CLAUDE.md, and must recognise the ctoc repo by PACKAGE IDENTITY
 * (`package.json` name === 'ctoc', via the detector's `isCtocRepo`) rather than by
 * comparing the running hook file's own `__dirname` install location — and Defect 4
 * (finding L3) — the injected session banner must not claim enforcement is
 * "cryptographically enforced" with "no escape phrases".
 *
 * Discipline followed here:
 *   - No test doubles. The self-repo guard is proven end-to-end by SPAWNING THE REAL
 *     hook (`src/hooks/SessionStart.js`) as a child process against real temp-dir
 *     project trees and asserting the real on-disk CLAUDE.md and the real stdout
 *     banner. The exported decision helpers are also called directly (a real
 *     function against a real temp tree is not a double).
 *   - The temp fixtures live under os.tmpdir(), entirely OUTSIDE the hook file's own
 *     directory tree. That is exactly the installed-plugin scenario in which the old
 *     `__dirname` guard failed: `path.resolve(__dirname,'..','..')` resolves to the
 *     real ctoc repo, never to the temp fixture, so the old guard would inject even
 *     into a fixture whose own package.json says `name: "ctoc"`. The package-identity
 *     guard holds regardless of where the hook file physically lives.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'src', 'hooks', 'SessionStart.js');
const hook = require('../src/hooks/SessionStart.js');

// The idempotent operating-lessons block the injector splices in. Its presence in a
// CLAUDE.md is the observable signal that injection ran.
const LESSONS_MARKER = '<!-- CTOC:LESSONS';

// A minimal but genuinely CTOC-marked CLAUDE.md. The heading matches the detector's
// CTOC_MARKER_RE so the fixture classifies as a CTOC project.
const CTOC_CLAUDE_MD =
  '# CTOC Project Instructions\n\nHand-maintained content the maintainer controls.\n';

// generateContext's stack argument — the shape SessionStart's detectStack produces.
const STACK_STUB = { languages: [], primary: { language: null, framework: null } };

const createdDirs = [];

/**
 * Build a temp project fixture: `.ctoc/` dir, a CTOC-marked CLAUDE.md, and a
 * package.json declaring the given name. Returns the fixture root.
 */
function makeFixture(pkgName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w08s3-'));
  createdDirs.push(dir);
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), CTOC_CLAUDE_MD, 'utf8');
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: pkgName, version: '0.0.0' }),
    'utf8'
  );
  return dir;
}

/**
 * Build a temp project fixture with NO package.json — package identity is
 * undeterminable from disk, so the detector reports isCtocRepo === false.
 */
function makeFixtureNoPkg() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w08s3-'));
  createdDirs.push(dir);
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), CTOC_CLAUDE_MD, 'utf8');
  return dir;
}

/** Spawn the real hook with the given cwd; return its status, stdout, stderr. */
function runHook(cwd) {
  const res = spawnSync(process.execPath, [HOOK_PATH], {
    cwd,
    encoding: 'utf8',
    timeout: 20000
  });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

after(() => {
  for (const d of createdDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort temp cleanup */
    }
  }
});

describe('W08-s3 SessionStart self-repo guard (package identity, not __dirname)', () => {
  it('exports the decision helpers', () => {
    assert.strictEqual(
      typeof hook.shouldInjectLessons,
      'function',
      'shouldInjectLessons must be exported'
    );
    assert.strictEqual(
      typeof hook.maybeInjectLessons,
      'function',
      'maybeInjectLessons must be exported'
    );
  });

  // Case 1 — decision: the ctoc repo is never a target for injection.
  it('shouldInjectLessons() === false for a project whose package.json name is "ctoc"', () => {
    const fixture = makeFixture('ctoc');
    assert.strictEqual(hook.shouldInjectLessons(fixture), false);
  });

  // Case 2 — decision / regression: a real consumer project is a target.
  it('shouldInjectLessons() === true for a consumer project (name !== "ctoc")', () => {
    const fixture = makeFixture('some-app');
    assert.strictEqual(hook.shouldInjectLessons(fixture), true);
  });

  // Case 5 — undeterminable package identity: absence of package.json => not the ctoc
  // repo => injection proceeds (the detector reports isCtocRepo false). Documents the
  // consumer-shaped default; the ctoc-protecting no-inject direction is proven by
  // cases 1 and 3. (The shouldInjectLessons try/catch => false branch is defensive
  // belt-and-braces: isCtocProject is internally non-throwing, so that branch is
  // unreachable without a test double, which the no-doubles discipline forbids.)
  it('shouldInjectLessons() === true when package.json is absent (identity undeterminable)', () => {
    const fixture = makeFixtureNoPkg();
    assert.strictEqual(hook.shouldInjectLessons(fixture), true);
  });

  // Case 3 (integration, real spawned hook) — the headline: a session in the
  // plugin-installed ctoc repo leaves CLAUDE.md byte-identical. The hook file lives
  // in the real repo, entirely outside this temp fixture, so this is exactly the
  // install-location-independent scenario the old __dirname guard failed.
  it('spawned hook leaves a name:"ctoc" project CLAUDE.md byte-identical', () => {
    const fixture = makeFixture('ctoc');
    const claudeMdPath = path.join(fixture, 'CLAUDE.md');
    const before = fs.readFileSync(claudeMdPath);

    const { status } = runHook(fixture);
    assert.strictEqual(status, 0, 'hook must exit 0 (fails open)');

    const afterBytes = fs.readFileSync(claudeMdPath);
    assert.ok(
      before.equals(afterBytes),
      'ctoc-repo CLAUDE.md must be unchanged; the self-repo guard must not inject'
    );
    assert.ok(
      !afterBytes.toString('utf8').includes(LESSONS_MARKER),
      'no operating-lessons block may be injected into the ctoc repo CLAUDE.md'
    );
  });

  // Case 3b (unit, in-process) — same guard proven directly on the exported helper.
  it('maybeInjectLessons() does not modify a name:"ctoc" project CLAUDE.md', () => {
    const fixture = makeFixture('ctoc');
    const claudeMdPath = path.join(fixture, 'CLAUDE.md');
    const before = fs.readFileSync(claudeMdPath);

    hook.maybeInjectLessons(fixture);

    const afterBytes = fs.readFileSync(claudeMdPath);
    assert.ok(before.equals(afterBytes), 'maybeInjectLessons must skip the ctoc repo');
  });

  // Case 4 (integration, real spawned hook) — regression: a real consumer project is
  // still injected, and the real stdout banner is well-formed.
  it('spawned hook injects the operating-lessons block into a consumer project', () => {
    const fixture = makeFixture('some-app');
    const claudeMdPath = path.join(fixture, 'CLAUDE.md');

    const { status, stdout } = runHook(fixture);
    assert.strictEqual(status, 0, 'hook must exit 0');

    const after = fs.readFileSync(claudeMdPath, 'utf8');
    assert.ok(
      after.includes(LESSONS_MARKER),
      'consumer CLAUDE.md must receive the operating-lessons block'
    );
    assert.ok(stdout.includes('CTOC v'), 'banner must still render on stdout');
  });

  // Case 4b (unit, in-process) — same injection proven directly on the helper.
  it('maybeInjectLessons() injects into a consumer project CLAUDE.md', () => {
    const fixture = makeFixture('some-app');
    const claudeMdPath = path.join(fixture, 'CLAUDE.md');
    const before = fs.readFileSync(claudeMdPath, 'utf8');

    hook.maybeInjectLessons(fixture);

    const after = fs.readFileSync(claudeMdPath, 'utf8');
    assert.notStrictEqual(after, before, 'consumer CLAUDE.md must change');
    assert.ok(after.includes(LESSONS_MARKER), 'consumer CLAUDE.md must gain the block');
  });
});

describe('W08-s3 honest enforcement banner (generateContext)', () => {
  const banner = hook.generateContext(STACK_STUB, null, 'X', null, null);

  // Case 6 — no false claims.
  it('contains neither "cryptographically enforced" nor "no escape phrases"', () => {
    assert.ok(
      !banner.includes('cryptographically enforced'),
      'false "cryptographically enforced" claim must be gone'
    );
    assert.ok(
      !banner.includes('no escape phrases'),
      'false "no escape phrases" claim must be gone'
    );
  });

  // Case 7 — states the true mechanism and the user-only escape rule.
  it('states the real block mechanism and the user-only escape rule', () => {
    assert.match(banner, /PreToolUse hook/, 'must name the real enforcement mechanism');
    assert.match(banner, /blocks the edit/, 'must state that the hook blocks the edit');
    assert.match(banner, /type them yourself/i, 'must state escape phrases count only when user-typed');
  });

  // Case 8 — regression: banner still well-formed (session-start-hook.test.js contract).
  it('remains well-formed (CTOC v… / Iron Loop)', () => {
    assert.ok(banner.includes('CTOC v'), 'banner must keep the CTOC version line');
    assert.ok(banner.includes('Iron Loop'), 'banner must keep the Iron Loop section');
  });

  // Case 7s — the honest banner is proven on the REAL spawned hook's stdout, against a
  // consumer temp fixture (no real-repo side effects).
  it('real spawned hook emits the honest banner on stdout', () => {
    const fixture = makeFixture('some-app');
    const { status, stdout } = runHook(fixture);
    assert.strictEqual(status, 0, 'hook must exit 0');
    assert.ok(
      !stdout.includes('cryptographically enforced'),
      'live stdout banner must not claim cryptographic enforcement'
    );
    assert.ok(!stdout.includes('no escape phrases'), 'live stdout banner must not deny escape phrases');
    assert.ok(stdout.includes('PreToolUse hook'), 'live stdout banner must state the real mechanism');
  });
});
