/**
 * Dark-branch coverage tests for src/lib/claude-md-lessons.js.
 *
 * These target the branches the primary suite (tests/claude-md-lessons.test.js)
 * leaves uncovered in the REAL (measured) module:
 *
 *   - line 46      resolveLessonsSource fallback return (primary miss + ctocRoot hit)
 *   - lines 67-69  restoreEol (exported, unused by the main flow — both ternary arms)
 *   - lines 141-145 scanForBlock END-marker-before-START malformed branch
 *   - lines 250-255 ensureLessonsBlock src===null missing-source fail-open
 *   - lines 261-266 ensureLessonsBlock source-lacks-markers fail-open
 *
 * The 250-266 pair is exercised by the primary suite only through a COPIED
 * module (loadModuleWithoutSource), so those statements stay dark in the file
 * under measurement. Here we drive them in the real module by faking fs at the
 * genuine boundary (safe-fs delegates straight to node fs, so mocking fs.*
 * intercepts the read/exists calls). No core logic is mocked — only fs.
 *
 * Every test pins a branch that goes RED under mutation. Fixtures live under
 * os.tmpdir() and are cleaned in t.after(). The real repo CLAUDE.md and the real
 * .ctoc/templates/operating-lessons.md are never written.
 *
 * AI-generated (Claude) + human-reviewed line-by-line before commit.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO_ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(REPO_ROOT, '.ctoc', 'templates', 'operating-lessons.md');

const lessons = require('../src/lib/claude-md-lessons');
const { END_MARKER } = lessons;

function mkTmpProject(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-lessons-cov-'));
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ } });
  return dir;
}

function captureStderr(fn) {
  const orig = process.stderr.write;
  let out = '';
  process.stderr.write = (chunk) => { out += String(chunk); return true; };
  let result;
  try { result = fn(); } finally { process.stderr.write = orig; }
  return { stderr: out, result };
}

function countOccurrences(haystack, needle) {
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) { count++; idx += needle.length; }
  return count;
}

// ──────────────────────────────────────────────────────────────────────────
// resolveLessonsSource — the fallback (second-operand) branch, line 46
// ──────────────────────────────────────────────────────────────────────────

describe('resolveLessonsSource — ctocRoot fallback resolution (line 46)', () => {
  it('should_return_fallback_path_when_primary_missing_and_fallback_exists', (t) => {
    // Arrange — primary (__dirname-relative === SOURCE_PATH) reports MISSING,
    // the ctocRoot fallback reports PRESENT. Fake only fs.existsSync (boundary).
    const fallbackRoot = mkTmpProject(t);
    const fallbackPath = path.join(fallbackRoot, '.ctoc', 'templates', 'operating-lessons.md');
    const realExists = fs.existsSync.bind(fs);
    t.mock.method(fs, 'existsSync', (p) => {
      const s = String(p);
      if (s === SOURCE_PATH) return false;     // primary miss
      if (s === fallbackPath) return true;      // fallback hit
      return realExists(p);
    });

    // Act
    const resolved = lessons.resolveLessonsSource(fallbackRoot);

    // Assert — the SECOND operand of `fallback && existsSync(fallback)` returned.
    // Mutant that drops the fallback return (or short-circuits it) yields null.
    assert.equal(resolved, fallbackPath);
  });

  it('should_return_null_when_primary_missing_and_no_ctocRoot_supplied', (t) => {
    // Arrange — primary missing, ctocRoot undefined → `fallback` is null, so the
    // `fallback &&` first operand short-circuits and the function returns null.
    const realExists = fs.existsSync.bind(fs);
    t.mock.method(fs, 'existsSync', (p) => {
      const s = String(p);
      if (s.includes('operating-lessons')) return false;
      return realExists(p);
    });

    // Act
    const resolved = lessons.resolveLessonsSource(undefined);

    // Assert — a mutant that flips `if (src === null)` handling upstream, or that
    // returns fallback despite a null fallback, would not produce null here.
    assert.equal(resolved, null);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// restoreEol — exported EOL restorer, both ternary arms (lines 67-69)
// ──────────────────────────────────────────────────────────────────────────

describe('restoreEol — EOL restoration (lines 67-69)', () => {
  it('should_convert_every_LF_to_CRLF_when_eol_is_crlf', () => {
    // Arrange
    const lf = 'alpha\nbeta\ngamma';

    // Act
    const restored = lessons.restoreEol(lf, '\r\n');

    // Assert — global replace: every boundary becomes CRLF, none left as lone LF.
    // Mutant swapping the ternary arms (return normLF) fails: no CRLF present.
    assert.equal(restored, 'alpha\r\nbeta\r\ngamma');
    assert.equal(countOccurrences(restored, '\r\n'), 2);
  });

  it('should_return_text_unchanged_when_eol_is_lf', () => {
    // Arrange
    const lf = 'alpha\nbeta\ngamma';

    // Act
    const restored = lessons.restoreEol(lf, '\n');

    // Assert — the else arm returns the input verbatim; a mutant that always
    // CRLF-encodes would introduce '\r' here.
    assert.equal(restored, lf);
    assert.ok(!restored.includes('\r'), 'no CR introduced on the LF branch');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// findManagedBlock / scanForBlock — END marker before any START (lines 141-145)
// ──────────────────────────────────────────────────────────────────────────

describe('findManagedBlock — END-before-START is malformed (lines 141-145)', () => {
  it('should_report_malformed_when_end_marker_precedes_any_start_outside_fences', () => {
    // Arrange — a bare END marker with no preceding START, not inside any fence.
    const lines = ['# prose above', END_MARKER, 'prose below'];

    // Act
    const blk = lessons.findManagedBlock(lines);

    // Assert — the dedicated END-before-START branch returns a malformed report.
    // Mutant deleting that branch lets the scan fall through to `block: null`,
    // and `blk.malformed` would throw on null — this pins the exact shape.
    assert.equal(blk.malformed, true);
    assert.equal(blk.startIdx, -1);
    assert.equal(blk.endIdx, -1);
    assert.equal(blk.version, null);
  });

  it('should_NOT_be_malformed_when_the_stray_END_is_inside_a_code_fence', () => {
    // Arrange — same stray END, but fenced: the fence scanner must skip it, so
    // the result is "no block" (null), NOT malformed. This pins that the
    // malformed verdict is fence-aware and does not fire on documented markers.
    const lines = ['# docs', '```text', END_MARKER, '```', 'after'];

    // Act
    const blk = lessons.findManagedBlock(lines);

    // Assert
    assert.equal(blk, null);
  });
});

describe('ensureLessonsBlock — END-before-START on disk fails open (lines 141-145 + 293)', () => {
  it('should_leave_file_unchanged_when_target_has_end_marker_before_start', (t) => {
    // Arrange — a real CLAUDE.md whose only marker is a stray END (malformed).
    const dir = mkTmpProject(t);
    const target = path.join(dir, 'CLAUDE.md');
    const seed = '# Project\n\nnotes\n\n' + END_MARKER + '\n\ntrailing\n';
    fs.writeFileSync(target, seed);

    // Act
    const { stderr, result } = captureStderr(() => lessons.ensureLessonsBlock(target, REPO_ROOT));

    // Assert — malformed managed block is refused; file is byte-for-byte intact.
    assert.equal(result, false);
    assert.ok(stderr.length > 0, 'no silent failure — stderr is written');
    assert.equal(fs.readFileSync(target, 'utf8'), seed, 'malformed file left untouched');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// ensureLessonsBlock — missing-source fail-open in the REAL module (250-255)
// ──────────────────────────────────────────────────────────────────────────

describe('ensureLessonsBlock — missing canonical source (lines 250-255)', () => {
  it('should_fail_open_and_name_the_primary_path_when_no_source_exists', (t) => {
    // Arrange — seed a target that must be left untouched. Fake fs so BOTH the
    // primary and (absent) fallback source paths report missing; the target read
    // is never reached because we return at the src===null guard.
    const dir = mkTmpProject(t);
    const target = path.join(dir, 'CLAUDE.md');
    const seed = '# Untouched\n\nkeep me exactly\n';
    fs.writeFileSync(target, seed);

    const realExists = fs.existsSync.bind(fs);
    t.mock.method(fs, 'existsSync', (p) => {
      const s = String(p);
      if (s.includes('operating-lessons')) return false; // canonical source missing
      return realExists(p);
    });

    // Act — no ctocRoot → fallback is null too → resolveLessonsSource returns null.
    const { stderr, result } = captureStderr(() => lessons.ensureLessonsBlock(target, undefined));

    // Assert — fail-open false, diagnostic names the missing file + primary path,
    // and the target is never written. A mutant returning true here, or one that
    // proceeds to write, is caught by the unchanged-file assertion.
    assert.equal(result, false);
    assert.ok(stderr.includes('operating-lessons.md'), 'stderr names the missing file');
    assert.ok(stderr.includes(SOURCE_PATH), 'stderr names the resolved primary path');
    assert.equal(fs.readFileSync(target, 'utf8'), seed, 'target left byte-for-byte unchanged');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// ensureLessonsBlock — source present but lacks markers, REAL module (261-266)
// ──────────────────────────────────────────────────────────────────────────

describe('ensureLessonsBlock — canonical source lacks markers (lines 261-266)', () => {
  it('should_fail_open_when_source_resolves_but_has_no_wellformed_markers', (t) => {
    // Arrange — primary source RESOLVES (existsSync real → true), but its content
    // is faked to have no CTOC markers, so findManagedBlock(srcLines) is null.
    const dir = mkTmpProject(t);
    const target = path.join(dir, 'CLAUDE.md');
    const seed = '# Project\n\nuser prose\n';
    fs.writeFileSync(target, seed);

    const realRead = fs.readFileSync.bind(fs);
    t.mock.method(fs, 'readFileSync', (p, ...rest) => {
      const s = String(p);
      if (s.includes('operating-lessons')) return '# operating lessons\n\nno markers at all\n';
      return realRead(p, ...rest);
    });

    // Act
    const { stderr, result } = captureStderr(() => lessons.ensureLessonsBlock(target, REPO_ROOT));

    // Assert — the "missing well-formed v1 markers" guard returns false and
    // explains itself; the target is untouched. A mutant that drops the
    // `!srcBlock ||` guard would try to slice an undefined block and throw
    // (caught → still false) OR splice garbage — the unchanged-target + the
    // marker-worded stderr pin the intended branch.
    assert.equal(result, false);
    assert.ok(stderr.includes('marker'), 'stderr explains the missing markers');
    assert.ok(stderr.includes(SOURCE_PATH), 'stderr names the offending source path');
    assert.equal(fs.readFileSync(target, 'utf8'), seed, 'target left unchanged');
  });

  it('should_fail_open_when_source_markers_are_malformed_end_before_start', (t) => {
    // Arrange — source resolves, but its faked content has a stray END before any
    // START → findManagedBlock returns { malformed: true }, hitting the
    // `srcBlock.malformed` second operand of the guard (distinct from !srcBlock).
    const dir = mkTmpProject(t);
    const target = path.join(dir, 'CLAUDE.md');
    const seed = '# Project\n\nprose\n';
    fs.writeFileSync(target, seed);

    const realRead = fs.readFileSync.bind(fs);
    t.mock.method(fs, 'readFileSync', (p, ...rest) => {
      const s = String(p);
      if (s.includes('operating-lessons')) return 'intro\n' + END_MARKER + '\nafter\n';
      return realRead(p, ...rest);
    });

    // Act
    const { stderr, result } = captureStderr(() => lessons.ensureLessonsBlock(target, REPO_ROOT));

    // Assert — malformed source is refused via the `|| srcBlock.malformed` arm.
    assert.equal(result, false);
    assert.ok(stderr.includes('marker'), 'stderr explains the malformed markers');
    assert.equal(fs.readFileSync(target, 'utf8'), seed, 'target left unchanged');
  });
});
