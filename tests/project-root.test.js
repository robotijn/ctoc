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

// ── REVERSED DECISION (owner's ruling, 2026-07-20): a repository boundary WINS ──
//
// This test and its sibling below previously asserted the OPPOSITE: that an ancestor
// `.ctoc` outranks a nested `.git`, with a comment calling the current behaviour "the
// confirmed defect". That was a deliberate decision, and it has been deliberately
// reversed by the owner on evidence — not corrected as an oversight. A future reader
// must not "restore" it.
//
// WHY IT CHANGED. The old rule made a fresh git repository created anywhere beneath a
// CTOC project unable to EVER become a CTOC project: the climb walked past the new
// repository to the ancestor's `.ctoc`, setup then saw a configuration directory
// "already present" and returned without doing anything while the menu announced it had
// initialised, and the human was shown the ANCESTOR's pipeline — including its plans.
//
// THE EVIDENCE THAT DECIDED IT. The owner hit this in a real fresh repository and was
// offered an approval decision about a plan he had never written. It is now reproduced
// from a fixture as case 14 of tests/fresh-repository-is-its-own-project.test.js: a real
// `node src/commands/start.js` process, started in an empty nested repository, printed
// `"Approve": "stream approve review/discuss-suggestion-with-editor.md"` — an approval
// decision about the PARENT project's plan.
//
// THE COST THE OWNER ACCEPTED, so nobody assumes it was overlooked: a nested service
// repository or a git submodule inside a CTOC project no longer inherits the parent's
// setup, and must be initialised itself. That was weighed and accepted; a repository
// boundary is the strongest statement that a directory is a distinct project, and being
// shown another project's plans is the worse failure.
test('findProjectRoot: a nested .git ENDS the climb — the nested repository is its own root', () => {
  const repo = mkTmp('pr-nested-git-');
  try {
    mkdirp(path.join(repo, '.ctoc'));
    touch(path.join(repo, '.ctoc', 'settings.yaml'), 'enforcement:\n  mode: strict\n');
    const sub = path.join(repo, 'services', 'api');
    mkdirp(path.join(sub, '.git'));
    touch(path.join(sub, 'CLAUDE.md'), '# nested');
    touch(path.join(sub, 'package.json'), '{}');

    assert.equal(findProjectRoot(sub), sub,
      'a repository boundary ends the climb — the ancestor .ctoc no longer captures it');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// The half of the ORIGINAL test that is still true, preserved as its own case rather
// than lost with the inversion above. The reversal is scoped to `.git` ALONE: the weak
// markers the two-pass design was actually written about (`CLAUDE.md`, `package.json` in
// a monorepo package) still never outrank an ancestor `.ctoc` across levels. Without a
// `.git` in the fixture, the boundary rule never fires and the original contract holds
// exactly as before.
test('findProjectRoot: an ancestor .ctoc still outranks a nested CLAUDE.md AND package.json', () => {
  const repo = mkTmp('pr-nested-weak-');
  try {
    mkdirp(path.join(repo, '.ctoc'));
    touch(path.join(repo, '.ctoc', 'settings.yaml'), 'enforcement:\n  mode: strict\n');
    const sub = path.join(repo, 'services', 'api');
    mkdirp(sub);
    touch(path.join(sub, 'CLAUDE.md'), '# nested');
    touch(path.join(sub, 'package.json'), '{}');

    assert.equal(findProjectRoot(sub), repo,
      '.ctoc is authoritative across levels over WEAK markers — that half is unchanged');
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

// REVERSED DECISION (owner's ruling, 2026-07-20) — see the full rationale on the
// boundary test above. This case previously asserted that a genuine CTOC root
// (`.ctoc/settings.yaml`, what init writes) stays authoritative ACROSS levels over a
// nested `.git`. It now asserts the reverse, because that behaviour is precisely what
// made the owner's fresh repository bind to its parent and show him another project's
// plans — reproduced from a fixture as case 14 of
// tests/fresh-repository-is-its-own-project.test.js.
//
// The reversal is deliberate and the cost was accepted: a nested service repository or
// submodule must now be initialised on its own rather than inheriting the parent's
// setup. Do not "restore" the old assertion.
//
// A REAL `.ctoc` still wins everywhere the boundary does not fire — over weak markers
// across levels (the test above), and at the boundary directory ITSELF, which is
// examined before the climb stops (the monorepo case, unchanged).
test('findProjectRoot: a nested .git outranks even a REAL ancestor .ctoc across levels', () => {
  const repo = mkTmp('pr-real-ctoc-');
  try {
    mkdirp(path.join(repo, '.ctoc'));
    touch(path.join(repo, '.ctoc', 'settings.yaml'), 'enforcement:\n  mode: strict\n');
    const sub = path.join(repo, 'services', 'api');
    mkdirp(path.join(sub, '.git'));

    assert.equal(findProjectRoot(sub), sub,
      'the nested repository is its own project — a fresh repo can never be captured again');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// The complement, and the guard that keeps the monorepo case working: the boundary
// directory is EXAMINED before the climb stops, so a repository root that CARRIES `.ctoc`
// is still the root. This is what makes the reversal safe for an ordinary single-repo
// CTOC project, where the repository root and the CTOC root are the same directory.
test('findProjectRoot: a repository root that carries .ctoc is still the root', () => {
  const repo = mkTmp('pr-boundary-carries-ctoc-');
  try {
    mkdirp(path.join(repo, '.git'));
    mkdirp(path.join(repo, '.ctoc'));
    touch(path.join(repo, '.ctoc', 'settings.yaml'), 'enforcement:\n  mode: strict\n');
    const sub = path.join(repo, 'packages', 'foo');
    mkdirp(sub);
    touch(path.join(sub, 'package.json'), '{}');

    assert.equal(findProjectRoot(sub), repo,
      'the boundary is examined before the stop — a monorepo package still finds its root');
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
