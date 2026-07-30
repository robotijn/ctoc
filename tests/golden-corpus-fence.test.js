'use strict';

/**
 * THE GOLDEN-CORPUS FENCE — a ratcheting gate against a test that only ever feeds a
 * module hand-written input, while the module's real job is to read a file the pipeline
 * actually wrote.
 *
 * THE DEFECT CLASS, in the human's words: "the matrix fix passed its own tests while
 * your screen was still unreadable. It only broke when rendered against the real
 * question files in your store." A test that exercises only SYNTHETIC input, for a
 * module that consumes a PERSISTED real-world contract. The test passes; the production
 * path fails on the shape the real data actually has.
 *
 * WHY A CORPUS. There is no shape in source that says "this test is synthetic", so this
 * fence cannot scan for one. It has to HOLD the real data and drive the real readers
 * over it. The load-bearing half is the corpus exercise (every real captured sample
 * pushed through its canonical reader) plus the extremes ratchet (a shortened sample
 * fails by name); the static unlinked-consumer scan is a weaker secondary ratchet that
 * fires when a NEW persisted contract gains a consumer with no corpus at all.
 *
 * THE PROOF THIS IS NOT A PLACEBO lives in two places that go RED on a real defect:
 *   - tests/real-question-file-render.test.js reproduces this morning's unreadable
 *     matrix against the real question file and goes red on the pre-fix renderer;
 *   - the extremes ratchet below goes red the moment any captured sample is shortened.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CORPUS_DIR = path.join(ROOT, 'tests', 'fixtures', 'golden-corpus');
const MANIFEST_FILE = path.join(CORPUS_DIR, 'manifest.yaml');
const BASELINE_FILE = path.join(ROOT, '.ctoc', 'golden-corpus-baseline.json');

/** Lazily reach the scanner so a missing/broken module fails EACH test by name. */
function scanner() {
  return require('../src/lib/golden-corpus-scan').scanGoldenCorpus;
}

/** The registered contract ids, in registry order. */
const CONTRACT_IDS = [
  'streaming-questions',
  'verify-evidence',
  'approval-ledger',
  'task-registry',
  'plan-frontmatter',
];

// Each contract's canonical reader, driven over every captured sample in the
// LOAD-BEARING corpus exercise. The driver stages a sample into a throwaway root at
// the reader's real on-disk location and calls the SHIPPED reader — a corrupt sample
// flips the result, which is the whole point.
function withTempRoot(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-fence-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const READERS = {
  'streaming-questions': (sampleAbs, sampleName) =>
    withTempRoot((root) => {
      const { loadPlanQuestions } = require('../src/lib/streaming-precompute');
      const qDir = path.join(root, '.ctoc', 'streaming', 'questions');
      fs.mkdirSync(qDir, { recursive: true });
      fs.copyFileSync(sampleAbs, path.join(qDir, sampleName));
      // ref is derived from the file name: `<stage>__<file>.json` → `<stage>/<file>`.
      const base = sampleName.replace(/\.json$/, '');
      const [stage, ...rest] = base.split('__');
      const file = rest.join('__');
      const ref = `${stage}/${file}`;
      // Stage a plan file whose mtime is <= the stored freshness stamp, so the reader
      // treats the questions as FRESH rather than stale.
      const stored = JSON.parse(fs.readFileSync(sampleAbs, 'utf8'));
      const planDir = path.join(root, 'plans', stage);
      fs.mkdirSync(planDir, { recursive: true });
      const planPath = path.join(planDir, file);
      fs.writeFileSync(planPath, '# staged plan\n');
      const t = Math.floor(Number(stored.planMtimeMs) / 1000) - 5;
      fs.utimesSync(planPath, t, t);
      const out = loadPlanQuestions(root, ref);
      assert.ok(Array.isArray(out), `loadPlanQuestions returned ${out} for real sample ${sampleName}`);
      assert.ok(out.length > 0, `real question sample ${sampleName} parsed to zero questions`);
      return out;
    }),
  'verify-evidence': (sampleAbs, sampleName) =>
    withTempRoot((root) => {
      const { readVerifyEvidence } = require('../src/lib/step-13-verify');
      const dir = path.join(root, '.ctoc', 'state', 'verify');
      fs.mkdirSync(dir, { recursive: true });
      const slug = sampleName.replace(/\.json$/, '');
      fs.copyFileSync(sampleAbs, path.join(dir, `${slug}.json`));
      const out = readVerifyEvidence(root, slug);
      assert.ok(out && typeof out === 'object', `readVerifyEvidence returned ${out} for ${sampleName}`);
      assert.ok('passed' in out, `verify evidence ${sampleName} is missing the 'passed' field`);
      return out;
    }),
  'approval-ledger': (sampleAbs, sampleName) =>
    withTempRoot((root) => {
      const { readEntry } = require('../src/lib/approval-ledger');
      const dir = path.join(root, '.ctoc', 'approvals');
      fs.mkdirSync(dir, { recursive: true });
      const slug = sampleName.replace(/\.json$/, '');
      fs.copyFileSync(sampleAbs, path.join(dir, `${slug}.json`));
      const out = readEntry(slug, root);
      assert.ok(out && typeof out === 'object', `readEntry returned ${out} for ${sampleName}`);
      assert.ok('stage_to' in out, `approval entry ${sampleName} is missing 'stage_to'`);
      return out;
    }),
  'task-registry': (sampleAbs) =>
    withTempRoot((root) => {
      const { load } = require('../src/lib/task-registry');
      const dir = path.join(root, '.ctoc', 'state');
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(sampleAbs, path.join(dir, 'tasks.json'));
      const out = load(root);
      assert.ok(out && Array.isArray(out.tasks), 'task-registry.load did not return a tasks array');
      return out;
    }),
  'plan-frontmatter': (sampleAbs, sampleName) => {
    const { parseMetadata } = require('../src/lib/state');
    const content = fs.readFileSync(sampleAbs, 'utf8');
    const md = parseMetadata(content);
    assert.ok(md && typeof md === 'object', `parseMetadata returned ${md} for ${sampleName}`);
    assert.ok(Object.keys(md).length > 0, `plan-frontmatter sample ${sampleName} parsed to zero keys`);
    return md;
  },
};

// ── Self-test planting: a src consumer and the tests that do / do not link it. ──
const READER_IMPORT_CONSUMER = [
  "const { loadPlanQuestions } = require('./streaming-precompute');",
  'function useIt(root, ref) {',
  '  return loadPlanQuestions(root, ref);',
  '}',
  'module.exports = { useIt };',
].join('\n');

const INLINE_READ_CONSUMER = [
  "const path = require('node:path');",
  "const fs = require('node:fs');",
  'function readInline(root) {',
  "  const p = path.join(root, '.ctoc', 'streaming', 'questions', 'x.json');",
  "  return JSON.parse(fs.readFileSync(p, 'utf8'));",
  '}',
  'module.exports = { readInline };',
].join('\n');

const PATH_ONLY_NO_PARSE = [
  "const path = require('node:path');",
  'function pathOnly(root) {',
  "  return path.join(root, '.ctoc', 'streaming', 'questions');",
  '}',
  'module.exports = { pathOnly };',
].join('\n');

const LINKING_TEST = "require('./fixtures/golden-corpus/streaming-questions/x.json');";
const NON_LINKING_TEST = "assert.ok(true); // no corpus reference here";

function scanPlanted(srcSource, testSources) {
  return scanner()(ROOT, {
    sources: [{ path: 'src/lib/planted.js', source: srcSource }],
    testSources: (testSources || []).map((s, i) => ({ path: `tests/planted-${i}.test.js`, source: s })),
  });
}

describe('golden-corpus fence — a synthetic-only test for a module that reads a persisted contract', () => {
  // ── 1 · NON-VACUOUS ────────────────────────────────────────────────────────
  it('the scan is non-vacuous: it really read the src tree AND exercised real samples', () => {
    const result = scanner()(ROOT);
    assert.ok(
      result.filesScanned > 100,
      `expected a real src tree, saw ${result.filesScanned} files — a scan that reads nothing ` +
      'reports "no findings", which IS the defect this fence exists to catch'
    );
    assert.ok(
      result.samplesExercised > 0,
      'samplesExercised is 0 — the corpus was never loaded, so any "reader survives" claim is vacuous'
    );
    for (const id of CONTRACT_IDS) {
      assert.ok(
        result.contracts.some((c) => c.id === id),
        `registered contract ${id} is missing from the scan result`
      );
    }
  });

  // ── 2 · SELF-TEST: detects an unlinked consumer, per signal ─────────────────
  it('flags a reader-import consumer that no test links to the corpus (signal a)', () => {
    const r = scanPlanted(READER_IMPORT_CONSUMER, [NON_LINKING_TEST]);
    const f = r.findings.find((x) => x.module === 'src/lib/planted.js');
    assert.ok(f, 'a module importing the canonical reader with no corpus-linked test was NOT flagged');
    assert.equal(f.signal, 'reader-import');
    assert.equal(f.contract, 'streaming-questions');
  });

  it('flags an inline-read consumer that no test links to the corpus (signal b)', () => {
    const r = scanPlanted(INLINE_READ_CONSUMER, [NON_LINKING_TEST]);
    const f = r.findings.find((x) => x.module === 'src/lib/planted.js');
    assert.ok(f, 'a module that builds the contract path and parses it inline was NOT flagged');
    assert.equal(f.signal, 'inline-read');
  });

  // ── 3 · SELF-TEST: does NOT flag the linked form (a false positive disables a fence) ──
  it('does NOT flag a consumer once a test names the corpus directory', () => {
    const r = scanPlanted(READER_IMPORT_CONSUMER, [LINKING_TEST]);
    assert.deepEqual(
      r.findings.filter((x) => x.module === 'src/lib/planted.js'), [],
      'a consumer WITH a corpus-linked test was flagged — a false positive is how a fence gets switched off'
    );
  });

  // ── 4 · SIGNAL (b) NARROWING: path-without-parse is NOT a consumer ──────────
  it('does NOT flag a module that builds the path but never parses it', () => {
    const r = scanPlanted(PATH_ONLY_NO_PARSE, [NON_LINKING_TEST]);
    assert.deepEqual(
      r.findings.filter((x) => x.module === 'src/lib/planted.js'), [],
      'a module that only constructs the path (never parses) was flagged — this is the narrowing that ' +
      'keeps the ~60 innocent .ctoc path sites out; without it the fence is unusably noisy'
    );
  });

  // ── 5 · THE LOAD-BEARING HALF: every real sample survives its canonical reader ──
  it('drives every captured sample through its canonical reader and gets the declared shape', () => {
    let exercised = 0;
    for (const id of CONTRACT_IDS) {
      const dir = path.join(CORPUS_DIR, corpusDirFor(id));
      const samples = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f !== '.gitkeep') : [];
      assert.ok(samples.length > 0, `contract ${id} has no captured samples — the corpus exercise is vacuous for it`);
      for (const name of samples) {
        READERS[id](path.join(dir, name), name);
        exercised += 1;
      }
    }
    assert.ok(exercised >= 9, `expected at least 9 real samples exercised, got ${exercised}`);
  });

  // ── 6 · EXTREMES RATCHET (the mutate-a-fixture catch) ──────────────────────
  it('extremes recomputed from the committed fixtures meet or exceed the frozen baseline', () => {
    const baseline = readBaseline();
    const result = scanner()(ROOT);
    for (const id of CONTRACT_IDS) {
      const live = result.contracts.find((c) => c.id === id).extremes;
      const frozen = baseline.extremes[id];
      assert.ok(frozen, `baseline is missing frozen extremes for ${id}`);
      for (const key of ['totalBytes', 'maxFieldLen', 'maxDepth', 'maxArrayLen']) {
        assert.ok(
          live[key] >= frozen[key],
          `extreme ${id}.${key} DROPPED from ${frozen[key]} to ${live[key]} — a shortened or removed ` +
          'sample rebuilds the very defect the corpus exists to prevent. Extremes may only ever GROW.'
        );
      }
    }
  });

  // ── 7 · PRODUCTION FLOOR ───────────────────────────────────────────────────
  it('corpus extremes meet the frozen production floor, or the gap is recorded honestly', () => {
    const baseline = readBaseline();
    const gaps = new Set((baseline.coverageGaps || []).map((g) => g.contract));
    for (const id of CONTRACT_IDS) {
      const floor = (baseline.floors || {})[id];
      const extremes = baseline.extremes[id];
      if (!floor || floor.status === 'unmeasurable') continue;
      const meets = extremes.maxFieldLen >= floor.maxFieldLen && extremes.totalBytes >= floor.totalBytes;
      assert.ok(
        meets || gaps.has(id),
        `contract ${id} does not meet its production floor (maxFieldLen ${extremes.maxFieldLen} < ` +
        `${floor.maxFieldLen}) and is NOT recorded in coverageGaps — pretending coverage is the defect. ` +
        'Either capture the extreme instance or record the gap.'
      );
    }
  });

  // ── 7b · THE MANIFEST IS HONEST HUMAN DOCUMENTATION ────────────────────────
  it('manifest.yaml names every contract, its reader, and carries a coverage_gaps block', () => {
    const text = fs.readFileSync(MANIFEST_FILE, 'utf8');
    for (const id of CONTRACT_IDS) {
      assert.ok(text.includes(id), `manifest.yaml does not mention contract ${id}`);
    }
    assert.ok(/coverage_gaps\s*:/.test(text), 'manifest.yaml must carry a coverage_gaps block (honest about what is NOT captured)');
    assert.ok(/canonical_reader\s*:/.test(text), 'manifest.yaml must name each contract\'s canonical_reader');
  });

  // ── 8 · NO SECRET IN THE CORPUS ────────────────────────────────────────────
  it('no captured sample contains a secret', () => {
    const { SecretsScanner } = require('../src/lib/secrets-scanner');
    const s = new SecretsScanner(ROOT);
    for (const rel of allCorpusFiles()) {
      const content = fs.readFileSync(rel, 'utf8');
      const findings = s.scanContent(content, rel);
      assert.deepEqual(
        findings, [],
        `secret detected in corpus file ${path.relative(ROOT, rel)}: ${JSON.stringify(findings)}`
      );
    }
  });

  // ── 9 · NO NEW UNLINKED CONSUMER ───────────────────────────────────────────
  it('every finding is baselined or exempted, with a prescriptive message', () => {
    const result = scanner()(ROOT);
    const baseline = readBaseline();
    const known = new Set(baseline.findings);
    const exempt = new Set(Object.keys(baseline.exemptions || {}));
    const fresh = result.findings.filter((f) => !known.has(f.key) && !exempt.has(f.key));
    assert.deepEqual(
      fresh.map((f) => f.key), [],
      'NEW consumer(s) of a persisted contract with no corpus test:\n' +
      fresh.map((f) => `  ${f.module} → ${f.contract}  [${f.signal}]\n    FIX: ${f.fix}`).join('\n') +
      '\n\nAdd a test that drives a real captured sample from tests/fixtures/golden-corpus/, or add the ' +
      'key to `exemptions` with a written justification. Never add it to `findings` (debt, may only SHRINK).'
    );
    for (const f of result.findings) {
      assert.ok(f.fix && f.fix.length > 20, `finding ${f.key} has no prescriptive fix`);
      assert.ok(f.fix.includes(f.contract) && f.fix.includes(corpusDirFor(f.contract)),
        `finding ${f.key} fix must name the contract and its corpus path`);
    }
  });

  // ── 10 · THE RATCHET ONLY TIGHTENS ─────────────────────────────────────────
  it('the finding count never exceeds the baseline maxFindings', () => {
    const result = scanner()(ROOT);
    const baseline = readBaseline();
    assert.ok(
      result.findings.length <= baseline.maxFindings,
      `findings rose to ${result.findings.length}, baseline is ${baseline.maxFindings}. Lower it, never raise it.`
    );
  });

  // ── 11 · LOWER THE BASELINE ────────────────────────────────────────────────
  it('the baseline is exact: live count equals maxFindings (fails on unclaimed progress)', () => {
    const result = scanner()(ROOT);
    const baseline = readBaseline();
    assert.equal(
      result.findings.length, baseline.maxFindings,
      `live count ${result.findings.length} != baseline ${baseline.maxFindings} — lower maxFindings and ` +
      'drop the fixed keys from findings.'
    );
  });

  // ── 12 · BASELINE HONESTY ──────────────────────────────────────────────────
  it('no baseline entry names a module that no longer exists', () => {
    const baseline = readBaseline();
    const phantoms = baseline.findings.filter((key) => {
      const module = String(key).split('::')[1];
      return module && !fs.existsSync(path.join(ROOT, module));
    });
    assert.deepEqual(phantoms, [], `baseline names modules that no longer exist: ${phantoms.join(', ')}`);
  });

  // ── 13 · EXEMPTION HONESTY ─────────────────────────────────────────────────
  it('every exemption is currently flagged and carries a written justification', () => {
    const result = scanner()(ROOT);
    const baseline = readBaseline();
    const live = new Set(result.findings.map((f) => f.key));
    for (const [key, reason] of Object.entries(baseline.exemptions || {})) {
      assert.ok(live.has(key), `exemption ${key} is not currently flagged — dead weight, remove it`);
      assert.ok(typeof reason === 'string' && reason.length > 20, `exemption ${key} needs a real justification`);
    }
  });

  // ── 14 · KEY STABILITY ─────────────────────────────────────────────────────
  it('keys carry no line number and are stable under an unrelated edit above the site', () => {
    const before = scanPlanted(READER_IMPORT_CONSUMER, [NON_LINKING_TEST]).findings.map((f) => f.key);
    const after = scanPlanted(`// unrelated line\n\n${READER_IMPORT_CONSUMER}`, [NON_LINKING_TEST]).findings.map((f) => f.key);
    assert.deepEqual(after, before, 'keys churned on an unrelated edit — they must anchor on contract+module, not a line');
    for (const key of before) assert.ok(!/:\d+$/.test(key), `key ${key} ends in a line number`);
  });

  // ── 15 · ERROR PATH ────────────────────────────────────────────────────────
  it('a bad root throws rather than returning an empty (success-looking) result', () => {
    assert.throws(
      () => scanner()(''),
      TypeError,
      'scanGoldenCorpus("") must throw — an empty result would report "all clear" for input never read'
    );
  });

  // ── 15b · MALFORMED `sources` ENTRY THROWS ─────────────────────────────────
  it('a malformed sources entry throws rather than being silently scanned as nothing', () => {
    assert.throws(
      () => scanner()(ROOT, { sources: [{ path: 'x.js' }] }),
      TypeError,
      'a sources entry without a string `source` must throw, not report no findings for it'
    );
  });

  // ── 15c · PRODUCTION FLOOR IS MEASURED WHEN REQUESTED ──────────────────────
  it('measureProduction walks the live stores and reports a floor per contract', () => {
    const result = scanner()(ROOT, { measureProduction: true });
    for (const id of CONTRACT_IDS) {
      const c = result.contracts.find((x) => x.id === id);
      assert.ok(c.productionFloor, `no production floor computed for ${id}`);
      assert.ok(
        ['met', 'unmeasurable'].includes(c.productionFloor.status),
        `production floor status for ${id} must be met|unmeasurable, got ${c.productionFloor.status}`
      );
    }
    // Without the flag the floor is deliberately null (off the gated path — no store walk).
    const off = scanner()(ROOT);
    assert.equal(off.contracts.find((c) => c.id === 'task-registry').productionFloor, null);
  });

  // ── 16 · CORRUPT SAMPLE IS A HARD ERROR (the scanner does not commit its own defect) ──
  it('a corrupt JSON sample throws with its path rather than being silently skipped', () => {
    withTempRoot((tmp) => {
      // Mirror the corpus layout but plant one unparseable JSON sample.
      const dir = path.join(tmp, 'streaming-questions');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'broken.json'), '{ this is not json');
      assert.throws(
        () => scanner()(ROOT, { corpusRoot: tmp }),
        (err) => err instanceof Error && /broken\.json/.test(err.message),
        'a corrupt sample must throw naming its path, never be skipped into a false "all clear"'
      );
    });
  });
});

// ── helpers ────────────────────────────────────────────────────────────────
function corpusDirFor(id) {
  return id === 'approval-ledger' ? 'approvals'
    : id === 'plan-frontmatter' ? 'plan-frontmatter'
    : id;
}

function readBaseline() {
  return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
}

function allCorpusFiles(dir = CORPUS_DIR, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) allCorpusFiles(full, acc);
    else if (entry.name !== '.gitkeep') acc.push(full);
  }
  return acc;
}
