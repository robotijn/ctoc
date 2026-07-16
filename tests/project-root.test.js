'use strict';

/**
 * project-root — findProjectRoot marker priority ACROSS ancestry levels (Defect 2).
 *
 * findProjectRoot walks up and returns the FIRST directory holding ANY marker. The
 * documented priority (.ctoc = priority 1, package.json = priority 4) must hold ACROSS
 * levels, not just within one directory: an ANCESTOR `.ctoc` must outrank a NESTED
 * package.json/.git/CLAUDE.md, otherwise CTOC binds to the wrong root and
 * getCtocPath/getPlansPath point at a non-existent `.ctoc`/`plans`.
 *
 * Real temp-dir fixtures; nothing mocked (root detection is pure filesystem).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { findProjectRoot, getCtocPath, getPlansPath } = require('../src/lib/project-root');

function mkTmp(prefix) {
  // realpathSync normalizes macOS /var → /private/var so returned roots compare equal.
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}
function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
function touch(file, content = '') {
  fs.writeFileSync(file, content);
}

// ── Defect 2: an ANCESTOR .ctoc outranks a NESTED package.json across levels ──

test('findProjectRoot: an ancestor .ctoc outranks a nested package.json (monorepo package)', () => {
  const repo = mkTmp('pr-monorepo-');
  try {
    mkdirp(path.join(repo, '.ctoc'));
    touch(path.join(repo, '.ctoc', 'settings.yaml'), 'enforcement:\n  mode: strict\n');
    const pkg = path.join(repo, 'packages', 'foo');
    mkdirp(pkg);
    touch(path.join(pkg, 'package.json'), '{}');

    assert.equal(findProjectRoot(pkg), repo,
      'the nearest ancestor holding .ctoc is the root, not the nested package.json dir');
    assert.equal(getCtocPath(pkg), path.join(repo, '.ctoc'),
      'getCtocPath must point at the real repo/.ctoc, never a non-existent nested one');
    assert.equal(getPlansPath(pkg), path.join(repo, 'plans'),
      'getPlansPath must resolve against the .ctoc-bearing root');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('findProjectRoot: an ancestor .ctoc outranks a nested .git AND a nested CLAUDE.md', () => {
  const repo = mkTmp('pr-nested-git-');
  try {
    mkdirp(path.join(repo, '.ctoc'));
    touch(path.join(repo, '.ctoc', 'settings.yaml'), 'enforcement:\n  mode: strict\n');
    const sub = path.join(repo, 'services', 'api');
    mkdirp(path.join(sub, '.git'));
    touch(path.join(sub, 'CLAUDE.md'), '# nested');
    touch(path.join(sub, 'package.json'), '{}');

    assert.equal(findProjectRoot(sub), repo,
      '.ctoc is authoritative across all levels — a nested .git/CLAUDE.md never wins');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// ── Defect (HIGH): the global crypto home (~/.ctoc, holds only .secret) must NOT hijack ──

test('findProjectRoot: a bare crypto-home .ctoc (only .secret) does NOT hijack a child with .git', () => {
  // src/lib/crypto.js creates ~/.ctoc containing only `.secret` for anyone who has used
  // CTOC's crypto path — it exists on real machines. A child project under it that has
  // its own .git but NO local .ctoc must root at the CHILD, not climb to the bare .ctoc
  // (that over-rooting to $HOME was the confirmed HIGH regression from the two-pass change).
  const home = mkTmp('pr-cryptohome-');
  try {
    mkdirp(path.join(home, '.ctoc'));
    touch(path.join(home, '.ctoc', '.secret'), 'deadbeef');   // crypto-home shape: only .secret
    const child = path.join(home, 'realproject');
    mkdirp(path.join(child, '.git'));
    touch(path.join(child, 'package.json'), '{}');

    assert.equal(findProjectRoot(child), child,
      'a bare .ctoc carrying no project marker is not a CTOC root — the child .git wins');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('findProjectRoot: a REAL .ctoc (with settings.yaml) still outranks a nested .git across levels', () => {
  // The positive half of the same discriminator: a genuine CTOC project root (init writes
  // .ctoc/settings.yaml) must remain authoritative ACROSS levels over a nested weak marker.
  const repo = mkTmp('pr-real-ctoc-');
  try {
    mkdirp(path.join(repo, '.ctoc'));
    touch(path.join(repo, '.ctoc', 'settings.yaml'), 'enforcement:\n  mode: strict\n');
    const sub = path.join(repo, 'services', 'api');
    mkdirp(path.join(sub, '.git'));

    assert.equal(findProjectRoot(sub), repo,
      'a real .ctoc/settings.yaml root still wins over a nested .git across levels');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// ── No regression: .ctoc in the SAME dir still roots there ──

test('findProjectRoot: .ctoc in the start dir roots there directly', () => {
  const repo = mkTmp('pr-samedir-');
  try {
    mkdirp(path.join(repo, '.ctoc'));
    touch(path.join(repo, '.ctoc', 'settings.yaml'), 'enforcement:\n  mode: strict\n');
    assert.equal(findProjectRoot(repo), repo);
    assert.equal(getCtocPath(repo), path.join(repo, '.ctoc'));
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// ── No regression: a verified CTOC plans/ dir is still an authoritative marker ──

test('findProjectRoot: an ancestor CTOC plans/ dir outranks a nested package.json', () => {
  const repo = mkTmp('pr-plans-');
  try {
    mkdirp(path.join(repo, 'plans', 'todo'));  // a verified CTOC plans layout
    const pkg = path.join(repo, 'app');
    mkdirp(pkg);
    touch(path.join(pkg, 'package.json'), '{}');

    assert.equal(findProjectRoot(pkg), repo,
      'a CTOC plans/ dir is a CTOC marker and is authoritative across levels');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// ── No regression: non-CTOC project (only package.json) still roots at package.json ──

test('findProjectRoot: a non-CTOC project with only package.json roots at the package.json dir', () => {
  const repo = mkTmp('pr-noncoc-');
  try {
    touch(path.join(repo, 'package.json'), '{}');
    const sub = path.join(repo, 'src', 'deep');
    mkdirp(sub);

    assert.equal(findProjectRoot(sub), repo,
      'with no .ctoc anywhere, the fallback walk finds the nearest package.json ancestor');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('findProjectRoot: a nested package.json wins when NO .ctoc exists anywhere (nearest weak marker)', () => {
  const repo = mkTmp('pr-nested-pkg-');
  try {
    touch(path.join(repo, 'package.json'), '{}');            // ancestor package.json
    const pkg = path.join(repo, 'packages', 'bar');
    mkdirp(pkg);
    touch(path.join(pkg, 'package.json'), '{}');             // nested package.json

    assert.equal(findProjectRoot(pkg), pkg,
      'no CTOC marker → nearest weak marker (the nested package.json) wins, as before');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// ── No regression: no marker anywhere → fail-safe fallback to cwd ──

test('findProjectRoot: no marker anywhere falls back to process.cwd()', () => {
  const bare = mkTmp('pr-bare-');
  try {
    const sub = path.join(bare, 'a', 'b', 'c');
    mkdirp(sub);
    // The temp subtree carries no marker, and the OS temp ancestry (/private/var/folders/…)
    // carries none either, so the walk exhausts and the fail-safe returns process.cwd().
    assert.equal(findProjectRoot(sub), process.cwd(),
      'no marker anywhere → fail-safe fallback to process.cwd()');
  } finally {
    fs.rmSync(bare, { recursive: true, force: true });
  }
});
