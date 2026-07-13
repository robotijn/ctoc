/**
 * CTOC — CRLF fix for the remaining runtime pipeline parsers (W07-s4)
 *
 * Behavioral tests proving that the three runtime frontmatter parsers —
 * inbox's local `parseFrontmatter`, the iron-loop enforcer's `readFM`, and
 * the vision-decomposer's `parseCanvas` + `completeVision` — parse a plan
 * checked out on Windows (CRLF line endings) byte-identically to the same
 * plan on macOS/Linux (LF). Each test builds a byte-level CRLF twin from an
 * LF fixture (`lf.replace(/\n/g, '\r\n')`) and asserts equivalence. It also
 * proves the vision-decomposer double-frontmatter bug is gone: on CRLF the
 * old `/^---\n/` detect failed, so the marker-prepend else-branch injected a
 * SECOND `---` block. No test doubles — real files on disk, real functions.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const inbox = require('../src/lib/inbox');
const { readFM } = require('../src/lib/iron-loop-enforcer');
const visionDecomposer = require('../src/lib/vision-decomposer');
const { parseFrontmatter } = require('../src/lib/frontmatter');

// Track temp dirs/files created per test for cleanup.
const tmpPaths = [];
function mkTmpDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'w07-s4-'));
  tmpPaths.push(d);
  return d;
}
function toCRLF(lf) {
  return lf.replace(/\n/g, '\r\n');
}

afterEach(() => {
  while (tmpPaths.length) {
    const p = tmpPaths.pop();
    try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

// ─────────────────────────────────────────────────────────────────────
//  inbox.parseFrontmatter — local colon-split parser
// ─────────────────────────────────────────────────────────────────────

describe('inbox.parseFrontmatter — CRLF/LF twins', () => {
  const LF = [
    '---',
    'id: 1720000000000-abc123',
    'status: open',
    'source_plan: some-plan',
    'source_step: 10',
    '---',
    '',
    '## Question',
    '',
    'Body text.',
    '',
  ].join('\n');

  it('CRLF content parses deep-equal to its LF twin', () => {
    const lfParsed = inbox.parseFrontmatter(LF);
    const crlfParsed = inbox.parseFrontmatter(toCRLF(LF));
    assert.deepEqual(crlfParsed, lfParsed);
  });

  it('no parsed value carries a stray carriage return', () => {
    const crlfParsed = inbox.parseFrontmatter(toCRLF(LF));
    for (const v of Object.values(crlfParsed)) {
      assert.ok(!/\r/.test(v), `value "${v}" contains a carriage return`);
    }
    assert.equal(crlfParsed.status, 'open');
    assert.equal(crlfParsed.id, '1720000000000-abc123');
  });

  it('content without frontmatter returns {} on both line endings', () => {
    assert.deepEqual(inbox.parseFrontmatter('no frontmatter here'), {});
    assert.deepEqual(inbox.parseFrontmatter('no frontmatter here\r\nmore'), {});
  });
});

// ─────────────────────────────────────────────────────────────────────
//  iron-loop-enforcer.readFM — line-1 + heading-first fallback
// ─────────────────────────────────────────────────────────────────────

describe('iron-loop-enforcer.readFM — CRLF/LF twins', () => {
  const LINE1 = [
    '---',
    'title: "A plan"',
    'type: feature',
    'files:',
    '  - src/lib/x.js',
    '---',
    '',
    '# Body',
    '',
    'Text.',
    '',
  ].join('\n');

  // Frontmatter NOT at line 1 — exercises the non-line-1 fallback branch.
  const HEADING_FIRST = [
    '# A heading before any frontmatter',
    '',
    '---',
    'title: "Buried"',
    'status: open',
    '---',
    '',
    'More body.',
    '',
  ].join('\n');

  function write(dir, name, content) {
    const p = path.join(dir, name);
    fs.writeFileSync(p, content);
    return p;
  }

  it('line-1 frontmatter: CRLF file .fm equals LF twin, no carriage return', () => {
    const dir = mkTmpDir();
    const lfPath = write(dir, 'lf.md', LINE1);
    const crlfPath = write(dir, 'crlf.md', toCRLF(LINE1));
    const lf = readFM(lfPath);
    const crlf = readFM(crlfPath);
    assert.equal(crlf.fm, lf.fm);
    assert.ok(!/\r/.test(crlf.fm), 'fm must not contain a carriage return');
    assert.match(crlf.fm, /title: "A plan"/);
  });

  it('heading-first (non-line-1) frontmatter: CRLF .fm equals LF twin via fallback, no carriage return', () => {
    const dir = mkTmpDir();
    const lfPath = write(dir, 'lf.md', HEADING_FIRST);
    const crlfPath = write(dir, 'crlf.md', toCRLF(HEADING_FIRST));
    const lf = readFM(lfPath);
    const crlf = readFM(crlfPath);
    assert.equal(crlf.fm, lf.fm);
    assert.ok(!/\r/.test(crlf.fm), 'fallback fm must not contain a carriage return');
    assert.match(crlf.fm, /status: open/);
  });

  it('missing file reports missing on both call styles', () => {
    const dir = mkTmpDir();
    const res = readFM(path.join(dir, 'nope.md'));
    assert.equal(res.missing, true);
  });
});

// ─────────────────────────────────────────────────────────────────────
//  vision-decomposer.parseCanvas — :47 strip-frontmatter site
// ─────────────────────────────────────────────────────────────────────

describe('vision-decomposer.parseCanvas — CRLF/LF twins', () => {
  const LF_CANVAS = [
    '---',
    'canvas_type: lean',
    'type: canvas',
    '---',
    '',
    '## Problem',
    '',
    'The problem statement.',
    '',
    '## Solution',
    '',
    'The solution outline.',
    '',
  ].join('\n');

  it('CRLF canvas parses to the same blocks as its LF twin (strip is CRLF-safe)', () => {
    const dir = mkTmpDir();
    const lfPath = path.join(dir, 'lf-canvas.md');
    const crlfPath = path.join(dir, 'crlf-canvas.md');
    fs.writeFileSync(lfPath, LF_CANVAS);
    fs.writeFileSync(crlfPath, toCRLF(LF_CANVAS));

    const lf = visionDecomposer.parseCanvas(lfPath);
    const crlf = visionDecomposer.parseCanvas(crlfPath);
    assert.deepEqual(crlf, lf);
    assert.equal(crlf.blocks.Problem, 'The problem statement.');
    assert.equal(crlf.blocks.Solution, 'The solution outline.');
  });
});

// ─────────────────────────────────────────────────────────────────────
//  vision-decomposer.completeVision — :240 detect / :247 prepend site
//  Proves the double-frontmatter bug is gone on CRLF.
// ─────────────────────────────────────────────────────────────────────

describe('vision-decomposer.completeVision — CRLF marker insertion', () => {
  const LF_VISION = [
    '---',
    'title: "My Vision"',
    'created: "2026-07-13T00:00:00.000Z"',
    '---',
    '',
    '# My Vision',
    '',
    '## Problem',
    '',
    'Something to solve.',
    '',
  ].join('\n');

  function setupProject(visionContent) {
    const root = mkTmpDir();
    fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true }); // marks project root
    fs.mkdirSync(path.join(root, 'plans', 'vision'), { recursive: true });
    fs.mkdirSync(path.join(root, 'plans', 'done'), { recursive: true });
    const visionPath = path.join(root, 'plans', 'vision', 'my-vision.md');
    fs.writeFileSync(visionPath, visionContent);
    return { root, visionPath };
  }

  it('inserts markers ONCE on a CRLF vision — no duplicated frontmatter block', () => {
    const { root, visionPath } = setupProject(toCRLF(LF_VISION));
    const { newPath } = visionDecomposer.completeVision(visionPath, root);
    const out = fs.readFileSync(newPath, 'utf8');

    const parsed = parseFrontmatter(out);
    assert.equal(parsed.hasFrontmatter, true, 'output must have leading frontmatter');
    // The bug: the else-branch prepended a SECOND --- block. After stripping the
    // first frontmatter block the remaining body must NOT begin with another fence.
    assert.ok(!/^---\r?\n/.test(parsed.body), 'body must not begin with a second --- block');
    // Markers were actually inserted into the single existing block.
    assert.match(parsed.raw, /status: decomposed/);
    assert.match(parsed.raw, /type: vision/);
    assert.match(parsed.raw, /title: "My Vision"/);
  });

  it('CRLF vision produces the same frontmatter-stripped body as its LF twin', () => {
    const lf = setupProject(LF_VISION);
    const lfOut = fs.readFileSync(visionDecomposer.completeVision(lf.visionPath, lf.root).newPath, 'utf8');

    const crlf = setupProject(toCRLF(LF_VISION));
    const crlfOut = fs.readFileSync(visionDecomposer.completeVision(crlf.visionPath, crlf.root).newPath, 'utf8');

    // parseFrontmatter normalizes \r, so the bodies compare byte-identically.
    assert.equal(parseFrontmatter(crlfOut).body, parseFrontmatter(lfOut).body);
  });
});
