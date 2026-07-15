/**
 * ctoc-project-detector-coverage.test.js
 *
 * Dark-branch coverage for `src/lib/ctoc-project-detector.js` — the module that
 * decides whether a directory is a CTOC project and therefore whether the
 * mandatory-pipeline enforcement hook engages. A wrong answer is security-
 * relevant in BOTH directions: a false negative disables enforcement on a real
 * CTOC project; a false positive wrongly blocks edits in a non-CTOC project.
 *
 * This suite deliberately does NOT re-prove the happy nested-walk paths already
 * covered by `ctoc-project-detector-upward-walk.test.js`. It targets the branches
 * that file leaves dark: the two fail-open catch clauses (lines 74-76 and 98-99),
 * the SECOND operand of the marker `||`, the `||` (not `&&`) shape of the
 * both-markers-required guard, the malformed-package.json inner catch, the
 * `^`-anchored marker regexes, "nearest boundary wins" for the isCtocRepo flag,
 * and the no-stale-cache (live-disk) contract.
 *
 * Discipline: NO test doubles. Every fixture is a real directory tree under
 * `os.tmpdir()` with real `.ctoc/`, `CLAUDE.md`, and `package.json` entries,
 * torn down in `after()`. The real module is loaded — the boundary faked is the
 * filesystem only (real tmp files), never the detector's own logic. All paths
 * are composed with `path.join` for cross-platform correctness.
 *
 * AI-assist note: authored with an AI assistant and reviewed assertion-by-
 * assertion; each test was checked to go RED under the corresponding mutation
 * (see the per-test "MUTATION KILLED" note).
 */

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { isCtocProject } = require('../src/lib/ctoc-project-detector');

// The heading marker (first operand of the line-60 `||`).
const MARKED_HEADING = '# CTOC Project Instructions\n\nProject guidance.\n';
// The frontmatter marker (SECOND operand of the line-60 `||`) with NO heading.
const MARKED_PROGRAM_ONLY = '---\nprogram: ctoc-plugin\nversion: 1\n---\n\nBody, no heading marker.\n';
// A file that only MENTIONS the marker phrase mid-line — the `^` anchor must reject it.
const PREFIXED_HEADING = 'See the # CTOC Project Instructions section below.\n';
// Neither marker present.
const UNMARKED = '# Some Other Project\n\nNothing to see here.\n';

const fixtures = [];

function newFixtureRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctocdet-'));
  fixtures.push(dir);
  return dir;
}

function makeDir(...parts) {
  const dir = path.join(...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Materialize a boundary at `dir`. `dotCtoc`/`claudeMd` control which of the two
 * required markers physically exist, so a caller can build a partial-marker
 * directory. `claudeMd` may be a string (file content) or the sentinel
 * 'DIRECTORY' to create CLAUDE.md as a directory (forces an EISDIR on read).
 */
function writeProject(dir, {
  dotCtoc = true,
  claudeMd = MARKED_HEADING,
  packageJson, // string | object | undefined
} = {}) {
  fs.mkdirSync(dir, { recursive: true });
  if (dotCtoc) fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  if (claudeMd === 'DIRECTORY') {
    fs.mkdirSync(path.join(dir, 'CLAUDE.md'), { recursive: true });
  } else if (claudeMd !== null) {
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), claudeMd);
  }
  if (packageJson !== undefined) {
    const contents = typeof packageJson === 'string'
      ? packageJson
      : JSON.stringify(packageJson);
    fs.writeFileSync(path.join(dir, 'package.json'), contents);
  }
  return dir;
}

after(() => {
  for (const dir of fixtures) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort temp cleanup */
    }
  }
});

// ── detectAt outer fail-open catch (lines 74-76) ────────────────────────────
// Both marker paths pass existsSync, but CLAUDE.md is a DIRECTORY, so the
// readFileSync at line 59 throws EISDIR. The outer catch must fail open to a
// non-boundary so the walk continues and the whole call terminates cleanly.
test('detectAt fails open to non-boundary when CLAUDE.md is unreadable (a directory)', () => {
  // Arrange — a boundary whose CLAUDE.md is a directory (existsSync true, read throws).
  const root = newFixtureRoot();
  writeProject(root, { dotCtoc: true, claudeMd: 'DIRECTORY', packageJson: { name: 'ctoc' } });

  // Act
  let result;
  assert.doesNotThrow(() => { result = isCtocProject(root); });

  // Assert — the EISDIR is swallowed; unreadable state is treated as non-CTOC.
  // MUTATION KILLED: remove the outer try/catch -> the EISDIR propagates out of
  // isCtocProject (unguarded loop) and the call throws; doesNotThrow reds it.
  // Also: catch returning present:true/isCtoc:true would flip this to true.
  assert.deepEqual(result, { isCtoc: false, isCtocRepo: false });
});

// ── isCtocProject resolve fail-closed catch (lines 98-99) ───────────────────
// path.resolve throws a TypeError on any non-string argument. The guard must
// swallow it and return a non-CTOC result rather than let the hook crash.
for (const bad of [null, undefined, 42, {}, []]) {
  test(`isCtocProject returns non-CTOC (no throw) when root is not a string: ${JSON.stringify(bad)}`, () => {
    // Act
    let result;
    // MUTATION KILLED: remove the try/catch around path.resolve -> TypeError
    // escapes and the enforcement hook crashes; doesNotThrow reds it.
    assert.doesNotThrow(() => { result = isCtocProject(bad); });

    // Assert
    assert.deepEqual(result, { isCtoc: false, isCtocRepo: false });
  });
}

// ── line 60 second operand: `program: ctoc-` frontmatter with NO heading ────
// The heading marker (first operand) is absent; isCtoc must still be true via
// the CTOC_PROGRAM_RE second operand alone.
test('frontmatter program:ctoc- marker alone marks the project (second operand of the marker ||)', () => {
  // Arrange
  const root = newFixtureRoot();
  writeProject(root, { claudeMd: MARKED_PROGRAM_ONLY, packageJson: { name: 'consumer' } });

  // Act
  const result = isCtocProject(root);

  // Assert — MUTATION KILLED: delete the `|| CTOC_PROGRAM_RE.test(...)` second
  // operand and isCtoc collapses to false; this asserts it true.
  assert.deepEqual(result, { isCtoc: true, isCtocRepo: false });
});

// ── `^` anchor on the marker regexes: a mid-line mention is NOT a marker ─────
// A CLAUDE.md that only mentions "# CTOC Project Instructions" inside a prose
// line must classify present-but-unmarked (isCtoc:false) — enforcement must not
// engage on an incidental mention.
test('a mid-line mention of the marker phrase does not mark the project (anchor is load-bearing)', () => {
  // Arrange — a real boundary (both markers present) but CLAUDE.md only mentions
  // the phrase mid-sentence, so neither anchored regex matches.
  const root = newFixtureRoot();
  writeProject(root, { claudeMd: PREFIXED_HEADING });

  // Act
  const result = isCtocProject(root);

  // Assert — present boundary, but NOT marked.
  // MUTATION KILLED: drop the `^` (or the `m` flag semantics) so the phrase
  // matches anywhere -> isCtoc flips to true; this asserts it false.
  assert.deepEqual(result, { isCtoc: false, isCtocRepo: false });
});

// ── present-but-unmarked boundary at the resolved dir returns isCtoc:false ──
// Pins that `present:true` and `isCtoc:false` are independent: a real boundary
// with a non-marker CLAUDE.md stops the walk AND reports not-CTOC.
test('a present boundary with an unmarked CLAUDE.md reports isCtoc false, not a climb-past', () => {
  // Arrange — outer is a marked ctoc-repo; inner is a present-but-unmarked
  // boundary. The walk must STOP at inner (both markers exist) and report false,
  // never climb to the marked outer.
  const outer = newFixtureRoot();
  writeProject(outer, { claudeMd: MARKED_HEADING, packageJson: { name: 'ctoc' } });
  const inner = writeProject(path.join(outer, 'inner'), { claudeMd: UNMARKED });
  const start = makeDir(inner, 'sub');

  // Act
  const result = isCtocProject(start);

  // Assert — MUTATION KILLED: continue-walking-after-first-boundary would find
  // the marked outer and return isCtoc:true/isCtocRepo:true; this asserts false.
  assert.deepEqual(result, { isCtoc: false, isCtocRepo: false });
});

// ── both markers required at the SAME dir: guard is `||`, not `&&` ───────────
// An intermediate directory with CLAUDE.md (marked) but NO `.ctoc/` must NOT be
// treated as a boundary. The walk climbs PAST it to the real root. If the guard
// were `&&` instead of `||`, the intermediate would be misclassified a boundary.
test('a lone CLAUDE.md (no .ctoc) is not a boundary; the walk climbs past it to the real root', () => {
  // Arrange — root: full boundary + package name 'ctoc' (isCtocRepo true).
  //           intermediate: marked CLAUDE.md but NO .ctoc/ and no package.json.
  const root = newFixtureRoot();
  writeProject(root, { claudeMd: MARKED_HEADING, packageJson: { name: 'ctoc' } });
  const intermediate = path.join(root, 'child');
  writeProject(intermediate, { dotCtoc: false, claudeMd: MARKED_HEADING });
  const start = makeDir(intermediate, 'deep');

  // Act
  const result = isCtocProject(start);

  // Assert — resolves at the real root (isCtocRepo true).
  // MUTATION KILLED: change `||` to `&&` on the both-markers guard -> the
  // intermediate is misread as a boundary and returns isCtocRepo:false; the
  // observable isCtocRepo flip (true here) reds that mutation.
  assert.deepEqual(result, { isCtoc: true, isCtocRepo: true });
});

// ── inner package.json malformed: inner catch swallows, isCtoc survives ──────
// A boundary with a marked CLAUDE.md and an UNPARSEABLE package.json must still
// report isCtoc:true; only isCtocRepo degrades to false. The inner try/catch
// (line 69) must not let the JSON error escape to the outer fail-open catch
// (which would drop isCtoc:true and keep walking).
test('malformed package.json is swallowed by the inner catch; isCtoc from the marker survives', () => {
  // Arrange
  const root = newFixtureRoot();
  writeProject(root, { claudeMd: MARKED_HEADING, packageJson: '{ this is not: valid json' });

  // Act
  const result = isCtocProject(root);

  // Assert — MUTATION KILLED: remove the inner try/catch -> JSON.parse throws to
  // the OUTER catch -> present:false -> walk continues -> {false,false}; this
  // asserts isCtoc stays true (inner catch localized the failure).
  assert.deepEqual(result, { isCtoc: true, isCtocRepo: false });
});

// ── package.json present but name !== 'ctoc' vs. absent: isCtocRepo stays false
// Two rows pinning the isCtocRepo negative: strict `=== 'ctoc'` (a near-name is
// not a match) and the absent-package.json branch.
for (const row of [
  { id: 'near-name-not-ctoc', packageJson: { name: 'ctoc-plugin' } },
  { id: 'no-package-json', packageJson: undefined },
  { id: 'name-missing-field', packageJson: { version: '1.0.0' } },
]) {
  test(`marked boundary with ${row.id} reports isCtoc true, isCtocRepo false`, () => {
    // Arrange
    const root = newFixtureRoot();
    writeProject(root, { claudeMd: MARKED_HEADING, packageJson: row.packageJson });

    // Act
    const result = isCtocProject(root);

    // Assert — MUTATION KILLED: weaken `pkg.name === 'ctoc'` to a prefix/`includes`
    // check -> 'ctoc-plugin' flips isCtocRepo true; and dropping the
    // `if (existsSync(pkgPath))` guard would not flip these to true either.
    assert.deepEqual(result, { isCtoc: true, isCtocRepo: false });
  });
}

// ── nearest boundary wins for the isCtocRepo flag (stop at FIRST ancestor) ───
// A marked consumer boundary nested inside a marked ctoc-repo. From deep inside,
// the answer must be the INNER classification (isCtocRepo:false), proving the
// walk stops at the first boundary rather than climbing to the ctoc-repo root.
test('nearest boundary wins: inner consumer shadows an outer ctoc-repo for isCtocRepo', () => {
  // Arrange
  const outer = newFixtureRoot();
  writeProject(outer, { claudeMd: MARKED_HEADING, packageJson: { name: 'ctoc' } });
  const inner = writeProject(path.join(outer, 'app'), {
    claudeMd: MARKED_HEADING, packageJson: { name: 'consumer-app' },
  });
  const start = makeDir(inner, 'src', 'lib');

  // Act
  const result = isCtocProject(start);

  // Assert — MUTATION KILLED: continue walking after the first boundary would
  // resolve the outer ctoc-repo and return isCtocRepo:true; this asserts the
  // inner's isCtocRepo:false.
  assert.deepEqual(result, { isCtoc: true, isCtocRepo: false });
});

// ── no stale cache: each call reflects CURRENT disk state ────────────────────
// The detector must read live disk every call. Flip the disk between calls in
// BOTH directions and assert the answer flips — a memoized/stale answer fails.
test('detection reflects live disk: false becomes true after markers are created', () => {
  // Arrange — a bare directory: not a CTOC project yet.
  const root = newFixtureRoot();
  assert.deepEqual(isCtocProject(root), { isCtoc: false, isCtocRepo: false });

  // Act — materialize the markers, then ask again.
  writeProject(root, { claudeMd: MARKED_HEADING, packageJson: { name: 'ctoc' } });
  const after = isCtocProject(root);

  // Assert — MUTATION KILLED: memoizing the first (false) answer would return
  // stale {false,false}; this asserts the fresh {true,true}.
  assert.deepEqual(after, { isCtoc: true, isCtocRepo: true });
});

test('detection reflects live disk: true becomes false after the .ctoc marker is removed', () => {
  // Arrange — a real CTOC project.
  const root = newFixtureRoot();
  writeProject(root, { claudeMd: MARKED_HEADING, packageJson: { name: 'consumer' } });
  assert.deepEqual(isCtocProject(root), { isCtoc: true, isCtocRepo: false });

  // Act — remove the .ctoc/ marker, then ask again.
  fs.rmSync(path.join(root, '.ctoc'), { recursive: true, force: true });
  const after = isCtocProject(root);

  // Assert — enforcement must stand down the moment the project stops being CTOC.
  // MUTATION KILLED: a stale cache would keep returning {isCtoc:true}.
  assert.deepEqual(after, { isCtoc: false, isCtocRepo: false });
});
