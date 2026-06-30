'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MODULE_PATH = path.join(__dirname, '..', 'src', 'lib', 'stale-detector.js');
const {
  scanCheapCandidates,
  extractFrontmatterRegion,
  parseFilesField,
  GATE_SOURCE_STAGES,
  AGE_THRESHOLD_MS,
} = require('../src/lib/stale-detector.js');

// ---------------------------------------------------------------------------
// Sandbox harness (fail-loud, hermetic, cross-platform) — §6.2
// ---------------------------------------------------------------------------

const sandboxes = [];

function makeSandbox() {
  const dir = path.join(
    os.tmpdir(),
    'ctoc-sp1-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2)
  );
  fs.mkdirSync(dir, { recursive: true });
  sandboxes.push(dir);
  return dir;
}

function buildFilesBlock(filesSyntax, files, comment) {
  if (filesSyntax === 'none') return '';
  if (filesSyntax === 'inline') return `files: [${files.join(', ')}]\n`;
  // block-list
  let out = 'files:\n';
  files.forEach((f, i) => {
    if (comment && i === 0) out += `  - ${f}  # note\n`;
    else out += `  - ${f}\n`;
  });
  return out;
}

/**
 * Write plans/<stage>/<slug>.md reproducing the real frontmatter shapes verified
 * against plans/done/A1-canvas-layer-impl.md.
 * @param {object} opts markerStyle 'none'|'prepended'|'merged';
 *   filesSyntax 'block'|'inline'|'none'; files string[]; comment boolean.
 */
function writePlan(sandbox, stage, slug, opts = {}) {
  const { markerStyle = 'none', filesSyntax = 'block', files = [], comment = false } = opts;
  const stageDir = path.join(sandbox, 'plans', stage);
  fs.mkdirSync(stageDir, { recursive: true });
  const filesBlock = buildFilesBlock(filesSyntax, files, comment);
  let content;
  if (markerStyle === 'prepended') {
    content =
      '---\n' +
      'approved_by: human\n' +
      'approved_at: 2026-06-15T09:45:22.718Z\n' +
      'gate_crossed: implementation → todo\n' +
      '---\n\n' +
      '---\n' +
      `title: "${slug}"\n` +
      filesBlock +
      'status: refined\n' +
      '---\n\n' +
      `# ${slug}\n`;
  } else if (markerStyle === 'merged') {
    content =
      '---\n' +
      `title: "${slug}"\n` +
      filesBlock +
      'approved_by: human\n' +
      'approved_at: 2026-06-15T09:45:22.718Z\n' +
      'gate_crossed: implementation → todo\n' +
      'status: refined\n' +
      '---\n\n' +
      `# ${slug}\n`;
  } else {
    content =
      '---\n' +
      `title: "${slug}"\n` +
      filesBlock +
      'status: refined\n' +
      '---\n\n' +
      `# ${slug}\n`;
  }
  const filePath = path.join(stageDir, slug + '.md');
  fs.writeFileSync(filePath, content);
  return filePath;
}

function touchTarget(sandbox, relPath) {
  const parts = relPath.split('/');
  const full = path.join(sandbox, ...parts);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, '');
}

// For the F2 IO-fault test: replace the plan file with a directory at the same
// path so readFileSync throws EISDIR — portable across OSes (no chmod reliance).
function breakPlanFile(sandbox, stage, slug) {
  const filePath = path.join(sandbox, 'plans', stage, slug + '.md');
  fs.rmSync(filePath, { force: true });
  fs.mkdirSync(filePath, { recursive: true });
}

function mtimeOf(filePath) {
  return fs.statSync(filePath).mtimeMs;
}

function findCandidate(result, slug) {
  return result.candidates.find((c) => c.plan === slug);
}

afterEach(() => {
  while (sandboxes.length) {
    const dir = sandboxes.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Scenario 1 / M3 — missing declared files ⇒ actionable
// ---------------------------------------------------------------------------

describe('Scenario 1 / M3 — missing declared files ⇒ actionable', () => {
  it('flags a plan whose declared file is absent on disk, actionable=true', () => {
    const sb = makeSandbox();
    writePlan(sb, 'functional', 'p-missing', {
      filesSyntax: 'inline',
      files: ['src/lib/nonexistent.js'],
    });
    const res = scanCheapCandidates(sb);
    const cand = findCandidate(res, 'p-missing');
    assert.ok(cand, 'plan with a missing file must be a candidate');
    assert.ok(cand.signals.includes('missing-files'), 'missing-files signal must fire');
    assert.equal(cand.actionable, true);
    assert.equal(cand.stage, 'functional');
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 / M2 — never flagged on approved_by/marker grounds (F1 guard)
// ---------------------------------------------------------------------------

describe('Scenario 2 / M2 — F1 marker regression guard', () => {
  for (const stage of ['functional', 'implementation', 'review']) {
    it(`a fresh approved plan with all files present is NOT a candidate in ${stage}`, () => {
      const sb = makeSandbox();
      writePlan(sb, stage, 'p-approved', {
        markerStyle: 'merged',
        filesSyntax: 'block',
        files: ['src/lib/present.js'],
      });
      touchTarget(sb, 'src/lib/present.js');
      const res = scanCheapCandidates(sb);
      assert.equal(findCandidate(res, 'p-approved'), undefined, 'approved fresh plan must not be flagged');
    });
  }

  it('no candidate anywhere carries a marker-based signal', () => {
    const sb = makeSandbox();
    writePlan(sb, 'review', 'p-marker', {
      markerStyle: 'prepended',
      filesSyntax: 'block',
      files: ['src/lib/gone.js'],
    });
    // gone.js intentionally not created → it WILL be a candidate via missing-files
    const res = scanCheapCandidates(sb);
    for (const c of res.candidates) {
      for (const s of c.signals) {
        assert.notEqual(s, 'marker-in-source-stage');
        assert.ok(s === 'missing-files' || s === 'advisory:age', `unexpected signal ${s}`);
      }
    }
  });

  it('static: source contains no marker token and no approved_by token', () => {
    const src = fs.readFileSync(MODULE_PATH, 'utf8');
    assert.ok(!src.includes('marker-in-source-stage'), 'dropped signal must not reappear');
    assert.ok(!src.includes('approved_by'), 'cheap pass must read no approved_by marker');
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 / M4 — age-only advisory, never actionable
// ---------------------------------------------------------------------------

describe('Scenario 3 / M4 — age-only is advisory, never actionable', () => {
  it('old plan with all files present ⇒ signals === ["advisory:age"], actionable=false', () => {
    const sb = makeSandbox();
    const fp = writePlan(sb, 'implementation', 'p-old', {
      filesSyntax: 'block',
      files: ['src/lib/here.js'],
    });
    touchTarget(sb, 'src/lib/here.js');
    const nowMs = mtimeOf(fp) + 15 * 24 * 3600 * 1000 + 1;
    const res = scanCheapCandidates(sb, { nowMs });
    const cand = findCandidate(res, 'p-old');
    assert.ok(cand, 'old plan must be a candidate');
    assert.deepEqual(cand.signals, ['advisory:age']);
    assert.equal(cand.actionable, false);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 / M5 — fresh healthy ⇒ no candidate
// ---------------------------------------------------------------------------

describe('Scenario 4 / M5 — fresh healthy plan yields no candidate', () => {
  it('fresh plan with all files present is omitted', () => {
    const sb = makeSandbox();
    writePlan(sb, 'functional', 'p-fresh', {
      filesSyntax: 'block',
      files: ['src/lib/ok.js'],
    });
    touchTarget(sb, 'src/lib/ok.js');
    const res = scanCheapCandidates(sb);
    assert.equal(findCandidate(res, 'p-fresh'), undefined);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 / M1 — no git/subprocess invoked
// ---------------------------------------------------------------------------

describe('Scenario 5 / M1 — no subprocess invoked', () => {
  it('behavioral spy: no child_process method fires during scan', () => {
    const sb = makeSandbox();
    writePlan(sb, 'functional', 'a', { filesSyntax: 'inline', files: ['src/x.js'] });
    writePlan(sb, 'review', 'b', { filesSyntax: 'inline', files: ['src/y.js'] });
    const cp = require('child_process');
    const methods = ['exec', 'execSync', 'spawn', 'spawnSync', 'execFile', 'execFileSync'];
    const orig = {};
    const fired = [];
    for (const m of methods) {
      orig[m] = cp[m];
      cp[m] = (...args) => {
        fired.push(m);
        throw new Error('subprocess must not be called: ' + m);
      };
    }
    let res;
    try {
      delete require.cache[require.resolve('../src/lib/stale-detector.js')];
      const fresh = require('../src/lib/stale-detector.js');
      res = fresh.scanCheapCandidates(sb);
    } finally {
      for (const m of methods) cp[m] = orig[m];
      delete require.cache[require.resolve('../src/lib/stale-detector.js')];
    }
    assert.deepEqual(fired, [], 'no subprocess method may fire');
    assert.ok(Array.isArray(res.candidates));
    assert.equal(typeof res.count, 'number');
  });

  it('static: source imports no child_process and uses no subprocess token', () => {
    const src = fs.readFileSync(MODULE_PATH, 'utf8');
    assert.ok(!src.includes("require('child_process')"), 'must not require child_process');
    assert.ok(!src.includes('require("child_process")'), 'must not require child_process');
    assert.ok(!src.includes('execSync'), 'no execSync');
    assert.ok(!src.includes('spawnSync'), 'no spawnSync');
    assert.ok(!src.includes('execFile'), 'no execFile');
    assert.ok(!/\bexec\s*\(/.test(src), 'no exec( call');
    assert.ok(!/\bspawn\s*\(/.test(src), 'no spawn( call');
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 / M6 — block-list YAML parsed
// ---------------------------------------------------------------------------

describe('Scenario 6 / M6 — block-list files: parsed', () => {
  it('block-list with one missing entry fires missing-files', () => {
    const sb = makeSandbox();
    writePlan(sb, 'functional', 'p-block', {
      filesSyntax: 'block',
      files: ['src/lib/present.js', 'src/lib/gone.js'],
    });
    touchTarget(sb, 'src/lib/present.js');
    const res = scanCheapCandidates(sb);
    const cand = findCandidate(res, 'p-block');
    assert.ok(cand, 'block-list plan must be flagged');
    assert.ok(cand.signals.includes('missing-files'));
    assert.equal(cand.actionable, true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 7 / M6 — inline-array YAML parsed
// ---------------------------------------------------------------------------

describe('Scenario 7 / M6 — inline-array files: parsed', () => {
  it('inline array with one missing entry fires missing-files', () => {
    const sb = makeSandbox();
    writePlan(sb, 'implementation', 'p-inline', {
      filesSyntax: 'inline',
      files: ['src/lib/a.js', 'src/lib/b.js'],
    });
    touchTarget(sb, 'src/lib/a.js');
    const res = scanCheapCandidates(sb);
    const cand = findCandidate(res, 'p-inline');
    assert.ok(cand, 'inline-array plan must be flagged');
    assert.ok(cand.signals.includes('missing-files'));
  });
});

// ---------------------------------------------------------------------------
// Scenario 8 — files: in the 2nd block found (multi-block extraction)
// ---------------------------------------------------------------------------

describe('Scenario 8 — files: in second frontmatter block is found', () => {
  it('prepended-marker plan with missing file in metadata block fires missing-files', () => {
    const sb = makeSandbox();
    writePlan(sb, 'review', 'p-prepended', {
      markerStyle: 'prepended',
      filesSyntax: 'block',
      files: ['src/lib/shipped-away.js'],
    });
    const res = scanCheapCandidates(sb);
    const cand = findCandidate(res, 'p-prepended');
    assert.ok(cand, 'prepended-marker plan must be flagged on missing file');
    assert.ok(cand.signals.includes('missing-files'));
  });
});

// ---------------------------------------------------------------------------
// Scenario 9 / F3 — merged approved_by does not hide files:
// ---------------------------------------------------------------------------

describe('Scenario 9 / F3 — merged-block approved_by does not hide files:', () => {
  it('merged block with missing file fires missing-files and no marker signal', () => {
    const sb = makeSandbox();
    writePlan(sb, 'review', 'p-merged', {
      markerStyle: 'merged',
      filesSyntax: 'block',
      files: ['src/lib/missing-merged.js'],
    });
    const res = scanCheapCandidates(sb);
    const cand = findCandidate(res, 'p-merged');
    assert.ok(cand, 'merged-block plan must be flagged');
    assert.ok(cand.signals.includes('missing-files'));
    for (const s of cand.signals) {
      assert.notEqual(s, 'marker-in-source-stage');
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 10 / F2 — per-file IO fault skipped, not thrown
// ---------------------------------------------------------------------------

describe('Scenario 10 / F2 — per-file IO fault is skipped, scan continues', () => {
  it('broken plan file is skipped; sibling missing-files plan still flagged', () => {
    const sb = makeSandbox();
    writePlan(sb, 'functional', 'broken', { filesSyntax: 'inline', files: ['src/lib/z.js'] });
    writePlan(sb, 'functional', 'sibling', {
      filesSyntax: 'inline',
      files: ['src/lib/gone-sibling.js'],
    });
    breakPlanFile(sb, 'functional', 'broken');
    let res;
    assert.doesNotThrow(() => {
      res = scanCheapCandidates(sb);
    });
    assert.ok(Array.isArray(res.candidates));
    assert.equal(typeof res.count, 'number');
    assert.equal(findCandidate(res, 'broken'), undefined, 'broken plan must be skipped');
    const sib = findCandidate(res, 'sibling');
    assert.ok(sib, 'sibling must still be flagged after the skip');
    assert.ok(sib.signals.includes('missing-files'));
  });

  it('misuse still throws TypeError even when a per-file fault also exists', () => {
    const sb = makeSandbox();
    writePlan(sb, 'functional', 'broken', { filesSyntax: 'inline', files: ['src/lib/z.js'] });
    breakPlanFile(sb, 'functional', 'broken');
    assert.throws(() => scanCheapCandidates(sb, { nowMs: 'x' }), TypeError);
  });
});

// ---------------------------------------------------------------------------
// Additional regression / edge tests (beyond the numbered ACs)
// ---------------------------------------------------------------------------

describe('combined signals & canonical ordering', () => {
  it('missing-files AND old mtime ⇒ ["missing-files","advisory:age"], actionable=true', () => {
    const sb = makeSandbox();
    const fp = writePlan(sb, 'review', 'p-both', {
      filesSyntax: 'block',
      files: ['src/lib/absent.js'],
    });
    const nowMs = mtimeOf(fp) + 15 * 24 * 3600 * 1000 + 1;
    const res = scanCheapCandidates(sb, { nowMs });
    const cand = findCandidate(res, 'p-both');
    assert.ok(cand);
    assert.deepEqual(cand.signals, ['missing-files', 'advisory:age']);
    assert.equal(cand.actionable, true);
  });
});

describe('count invariant on a mixed fixture', () => {
  it('count === candidates.length', () => {
    const sb = makeSandbox();
    writePlan(sb, 'functional', 'flag1', { filesSyntax: 'inline', files: ['src/m1.js'] });
    writePlan(sb, 'review', 'flag2', { filesSyntax: 'inline', files: ['src/m2.js'] });
    writePlan(sb, 'implementation', 'healthy', { filesSyntax: 'inline', files: ['src/h.js'] });
    touchTarget(sb, 'src/h.js');
    const res = scanCheapCandidates(sb);
    assert.equal(res.count, res.candidates.length);
    assert.equal(res.count, 2);
  });
});

describe('structural graceful degradation', () => {
  it('plans/ absent ⇒ { candidates: [], count: 0 }', () => {
    const sb = makeSandbox();
    const res = scanCheapCandidates(sb);
    assert.deepEqual(res, { candidates: [], count: 0 });
  });

  it('one stage dir absent ⇒ no throw, other stages scanned', () => {
    const sb = makeSandbox();
    // only create functional; implementation & review absent
    writePlan(sb, 'functional', 'only', { filesSyntax: 'inline', files: ['src/gone.js'] });
    let res;
    assert.doesNotThrow(() => {
      res = scanCheapCandidates(sb);
    });
    assert.ok(findCandidate(res, 'only'));
  });

  it('.gitkeep is ignored', () => {
    const sb = makeSandbox();
    const dir = path.join(sb, 'plans', 'functional');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.gitkeep'), '');
    const res = scanCheapCandidates(sb);
    assert.deepEqual(res, { candidates: [], count: 0 });
  });

  it('files: [] and absent files: ⇒ no missing-files signal', () => {
    const sb = makeSandbox();
    writePlan(sb, 'functional', 'empty-arr', { filesSyntax: 'inline', files: [] });
    writePlan(sb, 'review', 'no-files', { filesSyntax: 'none' });
    const res = scanCheapCandidates(sb);
    assert.equal(findCandidate(res, 'empty-arr'), undefined);
    assert.equal(findCandidate(res, 'no-files'), undefined);
  });

  it('malformed/empty frontmatter plan ⇒ graceful, never throws', () => {
    const sb = makeSandbox();
    const dir = path.join(sb, 'plans', 'functional');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'garbage.md'), 'no frontmatter here at all\njust text\n');
    let res;
    assert.doesNotThrow(() => {
      res = scanCheapCandidates(sb);
    });
    // no files declared ⇒ no missing-files; fresh ⇒ no age ⇒ not a candidate
    assert.equal(findCandidate(res, 'garbage'), undefined);
  });
});

describe('deterministic ordering', () => {
  it('stages in gate order; slugs sorted ascending within a stage', () => {
    const sb = makeSandbox();
    writePlan(sb, 'review', 'zeta', { filesSyntax: 'inline', files: ['src/z.js'] });
    writePlan(sb, 'review', 'alpha', { filesSyntax: 'inline', files: ['src/a.js'] });
    writePlan(sb, 'functional', 'mid', { filesSyntax: 'inline', files: ['src/m.js'] });
    const res = scanCheapCandidates(sb);
    const order = res.candidates.map((c) => c.stage + '/' + c.plan);
    assert.deepEqual(order, ['functional/mid', 'review/alpha', 'review/zeta']);
  });
});

describe('input validation (fail loud on misuse)', () => {
  it('null root throws TypeError', () => {
    assert.throws(() => scanCheapCandidates(null), TypeError);
  });
  it('empty-string root throws TypeError', () => {
    assert.throws(() => scanCheapCandidates(''), TypeError);
  });
  it('non-string root throws TypeError', () => {
    assert.throws(() => scanCheapCandidates(42), TypeError);
  });
  it('non-finite nowMs throws TypeError', () => {
    const sb = makeSandbox();
    assert.throws(() => scanCheapCandidates(sb, { nowMs: 'x' }), TypeError);
    assert.throws(() => scanCheapCandidates(sb, { nowMs: NaN }), TypeError);
    assert.throws(() => scanCheapCandidates(sb, { nowMs: Infinity }), TypeError);
  });
});

// ---------------------------------------------------------------------------
// parseFilesField direct unit tests
// ---------------------------------------------------------------------------

describe('parseFilesField — direct units', () => {
  it('block-list', () => {
    const region = 'title: x\nfiles:\n  - src/a.js\n  - src/b.js\nstatus: y\n';
    assert.deepEqual(parseFilesField(region), ['src/a.js', 'src/b.js']);
  });
  it('inline array', () => {
    assert.deepEqual(parseFilesField('files: [src/a.js, src/b.js]\n'), ['src/a.js', 'src/b.js']);
  });
  it('empty inline array ⇒ []', () => {
    assert.deepEqual(parseFilesField('files: []\n'), []);
  });
  it('quoted block entries', () => {
    const region = 'files:\n  - "src/a.js"\n  - \'src/b.js\'\n';
    assert.deepEqual(parseFilesField(region), ['src/a.js', 'src/b.js']);
  });
  it('quoted inline entries', () => {
    assert.deepEqual(parseFilesField("files: ['src/a.js', \"src/b.js\"]\n"), ['src/a.js', 'src/b.js']);
  });
  it('scalar single value tolerated as one-element list', () => {
    assert.deepEqual(parseFilesField('files: src/lib/x.js\n'), ['src/lib/x.js']);
  });
  it('trailing block-list comment is stripped', () => {
    const region = 'files:\n  - src/lib/x.js  # note\n  - src/lib/y.js\n';
    assert.deepEqual(parseFilesField(region), ['src/lib/x.js', 'src/lib/y.js']);
  });
  it('# not preceded by whitespace is preserved in the path', () => {
    const region = 'files:\n  - src/lib/a#b.js\n';
    assert.deepEqual(parseFilesField(region), ['src/lib/a#b.js']);
  });
  it('absent files: key ⇒ []', () => {
    assert.deepEqual(parseFilesField('title: x\nstatus: y\n'), []);
  });
  it('block-list stops at first non-dash line', () => {
    const region = 'files:\n  - src/a.js\nstatus: refined\n  - not-a-file.js\n';
    assert.deepEqual(parseFilesField(region), ['src/a.js']);
  });
});

// ---------------------------------------------------------------------------
// extractFrontmatterRegion direct unit tests
// ---------------------------------------------------------------------------

describe('extractFrontmatterRegion — direct units', () => {
  it('single block returns its body', () => {
    const content = '---\ntitle: x\nfiles: [a.js]\n---\n\n# body\n';
    const region = extractFrontmatterRegion(content);
    assert.ok(region.includes('title: x'));
    assert.ok(region.includes('files: [a.js]'));
  });
  it('two leading blocks are concatenated', () => {
    const content =
      '---\napproved_by: human\n---\n\n---\ntitle: x\nfiles: [a.js]\n---\n\n# body\n';
    const region = extractFrontmatterRegion(content);
    assert.ok(region.includes('files: [a.js]'), 'files from second block must be present');
    assert.deepEqual(parseFilesField(region), ['a.js']);
  });
  it('no frontmatter ⇒ empty string', () => {
    assert.equal(extractFrontmatterRegion('just text\n'), '');
  });
  it('unterminated block ⇒ empty string (no throw)', () => {
    assert.equal(extractFrontmatterRegion('---\ntitle: x\nno close\n'), '');
  });
});

// ---------------------------------------------------------------------------
// Exported contract surface
// ---------------------------------------------------------------------------

describe('exported contract surface', () => {
  it('GATE_SOURCE_STAGES is the frozen gate order', () => {
    assert.deepEqual(GATE_SOURCE_STAGES, ['functional', 'implementation', 'review']);
    assert.ok(Object.isFrozen(GATE_SOURCE_STAGES));
  });
  it('AGE_THRESHOLD_MS is 14 days in ms', () => {
    assert.equal(AGE_THRESHOLD_MS, 14 * 24 * 60 * 60 * 1000);
  });
});
