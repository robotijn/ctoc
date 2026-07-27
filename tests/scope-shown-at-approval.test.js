'use strict';

/**
 * THE FILE LIST IS THE WRITE PERMISSION — and the gate approval screen stripped it.
 *
 * A plan's `files:` declaration IS what an approval grants an agent permission to
 * overwrite (plan-coverage.findCoveringPlan reads it; the PreToolUse hook allows or
 * refuses every edit on it). The gate decision screen (streaming-gate.planDecisionScreen)
 * rendered the plan BODY via renderPlanBody, whose first act is to strip ALL leading
 * frontmatter — so the ONE thing the approval grants was the ONE thing the screen
 * never showed. This suite pins the defect (case 1) and the counting/rendering that
 * fixes it.
 *
 * Real os.tmpdir() fixtures, path.join throughout, recursive-force cleanup, no shell.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const streamingGate = require('../src/lib/streaming-gate.js');
const planCoverage = require('../src/lib/plan-coverage.js');
const declaredBreadth = require('../src/lib/declared-breadth.js');

const tmpdirs = [];

function makeTmp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'ctoc-scope-'));
  tmpdirs.push(dir);
  return dir;
}

/** A tree of files: { 'src/a.js': '', 'src/sub/b.js': '' } created under a fresh tmp root. */
function makeTree(files) {
  const root = makeTmp('ctoc-scope-tree-');
  for (const rel of Object.keys(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, files[rel]);
  }
  return root;
}

/** N files under src/, named src/f0.js … src/f{N-1}.js. */
function srcFiles(n) {
  const files = {};
  for (let i = 0; i < n; i += 1) files['src/f' + i + '.js'] = '// ' + i;
  return files;
}

/** A plan file body declaring the given globs in `files:`; body carries no paths. */
function planWithFiles(globs) {
  const lines = globs.map((g) => '  - "' + g + '"').join('\n');
  return '---\ntitle: A plan\nfiles:\n' + lines + '\n---\n\n# A plan\n\n## Body\nProse only, nothing to see.\n';
}

/** A sandbox with a plans/<stage>/ structure and one plan written into it. */
function makeSandboxWithPlan(stage, slug, body) {
  const root = makeTmp('ctoc-scope-sb-');
  const stageDir = path.join(root, 'plans', stage);
  fs.mkdirSync(stageDir, { recursive: true });
  fs.writeFileSync(path.join(stageDir, slug + '.md'), body);
  return root;
}

afterEach(() => {
  while (tmpdirs.length) {
    try { fs.rmSync(tmpdirs.pop(), { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

// ── Case 1 — THE DEFECT, PINNED ────────────────────────────────────────────────
describe('the gate decision screen shows the files an approval grants', () => {
  it('CASE 1 — planDecisionScreen text contains every declared file path (RED before the fix)', () => {
    const granted = [
      'src/lib/declared-breadth.js',
      'src/lib/streaming-gate.js',
      'tests/scope-shown-at-approval.test.js',
    ];
    const root = makeSandboxWithPlan('implementation', 'pinned', planWithFiles(granted));
    const screen = streamingGate.planDecisionScreen('implementation/pinned.md', root);
    for (const p of granted) {
      assert.ok(
        screen.text.includes(p),
        'the approval screen must show the granted file ' + p + ' — it is the write permission being granted'
      );
    }
  });

  it('CASE 7 — a plan that declares no files says so, plainly', () => {
    const body = '---\ntitle: Empty\n---\n\n# Empty\n\n## Body\nNothing declared.\n';
    const root = makeSandboxWithPlan('implementation', 'empty', body);
    const screen = streamingGate.planDecisionScreen('implementation/empty.md', root);
    assert.match(screen.text, /this plan declares no files/i);
  });

  it('CASE 10 — a broken scope render never takes the gate screen down', () => {
    const root = makeSandboxWithPlan('implementation', 'boom', planWithFiles(['src/**']));
    const orig = planCoverage.readPlanFiles;
    planCoverage.readPlanFiles = () => { throw new Error('injected parse fault'); };
    try {
      const screen = streamingGate.planDecisionScreen('implementation/boom.md', root);
      assert.ok(screen && typeof screen.text === 'string', 'screen still returns text');
      assert.ok(screen.ask && typeof screen.ask === 'object', 'screen still returns ask');
      assert.ok(screen.actions && typeof screen.actions === 'object', 'screen still returns actions');
      assert.match(screen.text, /could not be read/i, 'the fault renders a line, never an empty string');
    } finally {
      planCoverage.readPlanFiles = orig;
    }
  });
});

// ── renderDeclaredScope — the rendered block ───────────────────────────────────
describe('renderDeclaredScope — the block the human reads at approval', () => {
  it('CASE 4 — an anchored declaration carries no unanchored marker, and counts singular right', () => {
    const root = makeTree({ 'src/only.js': '// one' });
    const text = streamingGate.renderDeclaredScope(planWithFiles(['src/**']), root);
    assert.doesNotMatch(text, /rooted at the repository/, 'src/** is anchored — no marker');
    assert.match(text, /1 file\b/, 'a single matched file reads "1 file", not "1 files"');
  });

  it('CASE 5 — a capped walk reports NO number (never a reassuring 0)', () => {
    const root = makeTree(srcFiles(10));
    const text = streamingGate.renderDeclaredScope(planWithFiles(['**']), root, { maxEntries: 3 });
    assert.match(text, /not counted/i, 'a capped walk says so');
    assert.ok(!text.includes('0 files total'), 'a capped walk must never render a number — 0 least of all');
  });

  it('CASE 6 — a walk fault reports no number and renders a could-not line without throwing', () => {
    const missing = path.join(os.tmpdir(), 'ctoc-scope-does-not-exist-' + process.pid + '-' + Date.now());
    let text;
    assert.doesNotThrow(() => {
      text = streamingGate.renderDeclaredScope(planWithFiles(['**']), missing);
    });
    assert.match(text, /could not be counted/i);
  });

  it('CASE 8 — a hostile files: entry cannot emit control characters or forge rows', () => {
    const glob = 'src/[31mx\ry.js';
    const root = makeTree({ 'src/a.js': '' });
    const text = streamingGate.renderDeclaredScope(planWithFiles([glob]), root);
    assert.ok(!text.includes(''), 'the ESC control char is stripped');
    assert.ok(!text.includes('\r'), 'the carriage return is stripped');
  });

  it('CASE 12 — many declared entries: first 40 shown, remainder disclosed', () => {
    const globs = [];
    for (let i = 0; i < 50; i += 1) globs.push('p' + i + '/**');
    const root = makeTree({ 'src/a.js': '' });
    const text = streamingGate.renderDeclaredScope(planWithFiles(globs), root);
    assert.ok(text.includes('p0/'), 'the first entry is shown');
    assert.ok(!text.includes('p45/'), 'the 46th entry is NOT shown (past the 40 cap)');
    assert.match(text, /10 more entries/, 'the hidden remainder is disclosed, not swallowed');
  });
});

// ── declared-breadth.countMatching — the counting half ─────────────────────────
describe('declaredBreadth.countMatching — the number that will be granted', () => {
  it('CASE 2 — src/** over a tree of 7 files reports 7', () => {
    const root = makeTree(srcFiles(7));
    const r = declaredBreadth.countMatching(['src/**'], root);
    assert.equal(r.perGlob[0].count, 7);
    assert.equal(r.total, 7);
    assert.equal(r.capped, false);
    assert.equal(r.perGlob[0].anchored, true);
  });

  it('CASE 3 — ** reports the whole tree and is unanchored; node_modules/.git/.ctoc-state are skipped', () => {
    const root = makeTree({
      'a.js': '',
      'src/b.js': '',
      'src/sub/c.js': '',
      'node_modules/pkg/index.js': '',
      '.git/HEAD': '',
      '.ctoc/state/thing.json': '',
    });
    const r = declaredBreadth.countMatching(['**'], root);
    // Three real leaves (a.js, src/b.js, src/sub/c.js); the churn dirs are skipped.
    assert.equal(r.total, 3);
    assert.equal(r.perGlob[0].count, 3);
    assert.equal(r.perGlob[0].anchored, false);
  });

  it('CASE 5b — a capped walk yields total null, capped true, and null per-glob counts', () => {
    const root = makeTree(srcFiles(10));
    const r = declaredBreadth.countMatching(['**'], root, { maxEntries: 3 });
    assert.equal(r.total, null);
    assert.equal(r.capped, true);
    assert.equal(r.perGlob[0].count, null);
  });

  it('CASE 6b — a non-existent root yields total null with walked 0 and never throws', () => {
    const missing = path.join(os.tmpdir(), 'ctoc-scope-missing-' + process.pid + '-' + Date.now());
    let r;
    assert.doesNotThrow(() => { r = declaredBreadth.countMatching(['**'], missing); });
    assert.equal(r.total, null);
    assert.equal(r.capped, false);
    assert.equal(r.walked, 0);
  });

  it('CASE 9 — a symbolic link is NOT followed (its out-of-tree files are not counted)', () => {
    const outDir = makeTmp('ctoc-scope-out-');
    for (let i = 0; i < 50; i += 1) fs.writeFileSync(path.join(outDir, 'x' + i + '.js'), '');
    const root = makeTree({ 'real1.js': '', 'real2.js': '' });
    const linkPath = path.join(root, 'link');
    try {
      fs.symlinkSync(outDir, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (e) {
      assert.fail('could not create a directory symlink for the test (do not skip): ' + e.message);
    }
    let r;
    assert.doesNotThrow(() => { r = declaredBreadth.countMatching(['**'], root); });
    // Two real files + the link counted as ONE leaf = 3; NEVER the 50 behind the link.
    assert.ok(r.total < 50, 'the 50 files behind the link must not be counted; total=' + r.total);
    assert.equal(r.total, 3);
  });

  it('CASE 11 — the fence is not vacuous: a non-matching glob reports 0 while another reports non-zero', () => {
    const root = makeTree(srcFiles(7));
    const r = declaredBreadth.countMatching(['src/**', 'nope/**'], root);
    const bySrc = r.perGlob.find((g) => g.glob === 'src/**');
    const byNope = r.perGlob.find((g) => g.glob === 'nope/**');
    assert.equal(bySrc.count, 7);
    assert.equal(byNope.count, 0);
    assert.equal(r.total, 7);
  });
});

// ── declared-breadth.isAnchored — pure, total, born on the enforcement contract ──
describe('declaredBreadth.isAnchored — pure and total (00126 puts it on the hook path)', () => {
  it('CASE 13 — anchored/unanchored classification, cross-platform, never throwing', () => {
    for (const g of ['src/**', 'tests/*.test.js', 'a/b/c.js', 'src\\**', './src/**']) {
      assert.equal(declaredBreadth.isAnchored(g), true, g + ' is anchored');
    }
    for (const g of ['**', '*', '*.md', '**/*.js', '?rc', '/x', '']) {
      assert.equal(declaredBreadth.isAnchored(g), false, JSON.stringify(g) + ' is not anchored');
    }
    for (const g of [null, undefined, 42, {}, []]) {
      let out;
      assert.doesNotThrow(() => { out = declaredBreadth.isAnchored(g); });
      assert.equal(out, false, JSON.stringify(g) + ' is not a string → not anchored, no throw');
    }
  });
});
