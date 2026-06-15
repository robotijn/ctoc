/**
 * Provenance / Lineage / Proportionality batch — contract tests
 *
 * Contract-based tests for five compliance/provenance lib modules that
 * previously had ZERO test coverage:
 *
 *   - src/lib/ai-provenance.js      (EU AI Act Art. 50 provenance stamp)
 *   - src/lib/data-lineage.js       (BCBS 239 lineage DAG)
 *   - src/lib/proportionality.js    (FRCP Rule 26(b)(1) burden-vs-benefit log)
 *   - src/lib/traceability-matrix.js(DO-178C / IEC 62304 traceability)
 *   - src/lib/irac-schema.js        (IRAC legal-memo output schema)
 *
 * Each module is exercised for (a) the happy path of every exported function,
 * (b) the core PROPERTY the module exists to enforce (derived from its own
 * JSDoc/header), and (c) error paths / malformed input (no uncaught throw
 * unless the contract documents one).
 *
 * Assertions follow each module's DOCUMENTED contract. Where behavior would
 * contradict documented intent, the assertion is left to fail — that is a real
 * bug to report, never a weakness to paper over.
 *
 * Hermetic: every filesystem test uses a per-test temp dir created with
 * mkdtempSync + realpathSync (macOS /var -> /private/var) and removed in
 * afterEach. Cross-platform path.join throughout.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');

const provenance = require(path.join(REPO, 'src/lib/ai-provenance.js'));
const lineage = require(path.join(REPO, 'src/lib/data-lineage.js'));
const proportionality = require(path.join(REPO, 'src/lib/proportionality.js'));
const traceability = require(path.join(REPO, 'src/lib/traceability-matrix.js'));
const irac = require(path.join(REPO, 'src/lib/irac-schema.js'));

// --- shared temp-dir scaffolding -------------------------------------------

function makeTmp() {
  // realpathSync collapses macOS /var -> /private/var so paths the modules
  // compute internally compare consistently against what the test wrote.
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-prov-')));
}

function rmTmp(dir) {
  if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function writeFile(root, rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

// Build a valid six-factor proportionality factors object. Pass overrides to
// mutate individual factors (e.g. to set a higher weight on one).
function makeFactors(overrides = {}) {
  const base = {};
  for (const key of proportionality.FACTOR_KEYS) {
    base[key] = { weight: 3, rationale: `rationale for ${key}` };
  }
  for (const [key, val] of Object.entries(overrides)) {
    base[key] = { ...base[key], ...val };
  }
  return base;
}

// Build a valid IRAC finding; pass overrides to mutate fields.
function makeFinding(overrides = {}) {
  return {
    id: 'gdpr-art17',
    issue: 'Does the delete-user endpoint cascade across the data graph?',
    rule: 'GDPR Article 17 requires erasure to extend to all controllers.',
    application: 'The endpoint deletes the users row but leaves orders.user_id.',
    conclusion: 'Non-compliant. Add a cascade and document the propagation window.',
    severity: 'critical',
    ...overrides,
  };
}

// ===========================================================================
// ai-provenance.js
// ===========================================================================
describe('ai-provenance.js — EU AI Act Article 50 provenance', () => {
  let root;
  beforeEach(() => { root = makeTmp(); });
  afterEach(() => { rmTmp(root); });

  // --- exported constants ---
  it('exports the documented log path and a commentable-extensions map', () => {
    assert.equal(provenance.PROVENANCE_LOG, '.ctoc/ai-provenance.jsonl');
    assert.equal(typeof provenance.COMMENTABLE_EXTENSIONS, 'object');
    assert.deepEqual(provenance.COMMENTABLE_EXTENSIONS['.js'], { open: '// ', close: '' });
    assert.deepEqual(provenance.COMMENTABLE_EXTENSIONS['.py'], { open: '# ', close: '' });
    assert.deepEqual(provenance.COMMENTABLE_EXTENSIONS['.md'], { open: '<!-- ', close: ' -->' });
  });

  // --- logEvent happy path ---
  it('logEvent returns the recorded event with a timestamp and defaults', () => {
    const rec = provenance.logEvent(root, { target_path: 'src/x.js' });
    assert.equal(rec.target_path, 'src/x.js');
    assert.equal(rec.model_id, '(unspecified)');
    assert.equal(rec.model_version, '(unspecified)');
    assert.equal(rec.dispatch_id, null);
    assert.equal(rec.intent, 'generation');
    assert.equal(rec.content_sha256, null);
    assert.ok(!Number.isNaN(Date.parse(rec.timestamp)), 'timestamp is ISO-parseable');
  });

  it('logEvent preserves caller-supplied attribution fields', () => {
    const rec = provenance.logEvent(root, {
      target_path: 'a.ts',
      model_id: 'claude-opus',
      model_version: '4.8',
      dispatch_id: 'D-1',
      intent: 'refactor',
      content_sha256: 'abc',
    });
    assert.equal(rec.model_id, 'claude-opus');
    assert.equal(rec.model_version, '4.8');
    assert.equal(rec.dispatch_id, 'D-1');
    assert.equal(rec.intent, 'refactor');
    assert.equal(rec.content_sha256, 'abc');
  });

  it('PROPERTY: the provenance log is append-only (each event adds one JSONL line)', () => {
    provenance.logEvent(root, { target_path: 'one.js' });
    provenance.logEvent(root, { target_path: 'two.js' });
    const logPath = path.join(root, provenance.PROVENANCE_LOG);
    const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    assert.equal(lines.length, 2, 'two events => two lines');
    const parsed = lines.map((l) => JSON.parse(l));
    assert.deepEqual(parsed.map((e) => e.target_path), ['one.js', 'two.js']);
  });

  // --- getEventsSince ---
  it('getEventsSince returns [] when the log does not exist', () => {
    assert.deepEqual(provenance.getEventsSince(root, '2000-01-01T00:00:00.000Z'), []);
  });

  it('PROPERTY: getEventsSince filters out events strictly before the cutoff', () => {
    const logPath = path.join(root, provenance.PROVENANCE_LOG);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const old = { timestamp: '2020-01-01T00:00:00.000Z', target_path: 'old.js' };
    const recent = { timestamp: '2030-01-01T00:00:00.000Z', target_path: 'new.js' };
    fs.writeFileSync(logPath, JSON.stringify(old) + '\n' + JSON.stringify(recent) + '\n');
    const got = provenance.getEventsSince(root, '2025-01-01T00:00:00.000Z');
    assert.equal(got.length, 1);
    assert.equal(got[0].target_path, 'new.js');
  });

  it('getEventsSince includes events exactly at the cutoff (>= semantics)', () => {
    const logPath = path.join(root, provenance.PROVENANCE_LOG);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const cutoff = '2025-06-15T12:00:00.000Z';
    fs.writeFileSync(logPath, JSON.stringify({ timestamp: cutoff, target_path: 'edge.js' }) + '\n');
    const got = provenance.getEventsSince(root, cutoff);
    assert.equal(got.length, 1, 'event at the exact cutoff is included (>=)');
  });

  it('logEvent then getEventsSince round-trips a recorded event', () => {
    provenance.logEvent(root, { target_path: 'rt.js', model_id: 'm' });
    const got = provenance.getEventsSince(root, '2000-01-01T00:00:00.000Z');
    assert.equal(got.length, 1);
    assert.equal(got[0].target_path, 'rt.js');
    assert.equal(got[0].model_id, 'm');
  });

  // --- stampContent: the disclosure property ---
  it('PROPERTY: stampContent prepends an EU-AI-Act Article 50 disclosure banner for code files', () => {
    const out = provenance.stampContent('const x = 1;\n', 'gen.js', {
      model_id: 'claude', model_version: '4.8',
    });
    assert.match(out, /AI-GENERATED-PROVENANCE-START/);
    assert.match(out, /AI-GENERATED-PROVENANCE-END/);
    assert.match(out, /artificial-intelligence assistant/);
    assert.match(out, /European Union Artificial Intelligence Act Article 50/);
    assert.match(out, /Model: claude 4\.8/);
    assert.ok(out.endsWith('const x = 1;\n'), 'original content is preserved after the banner');
  });

  it('stampContent uses the correct comment syntax per extension', () => {
    const js = provenance.stampContent('x', 'a.js', { model_id: 'm' });
    assert.match(js, /^\/\/ AI-GENERATED-PROVENANCE-START/);
    const py = provenance.stampContent('x', 'a.py', { model_id: 'm' });
    assert.match(py, /^# AI-GENERATED-PROVENANCE-START/);
    const md = provenance.stampContent('x', 'a.md', { model_id: 'm' });
    assert.match(md, /^<!-- AI-GENERATED-PROVENANCE-START -->/);
  });

  it('stampContent includes the dispatch line only when a dispatch_id is supplied', () => {
    const withId = provenance.stampContent('x', 'a.js', { model_id: 'm', dispatch_id: 'D-9' });
    assert.match(withId, /Dispatch: D-9/);
    const withoutId = provenance.stampContent('x', 'a.js', { model_id: 'm' });
    assert.doesNotMatch(withoutId, /Dispatch:/);
  });

  it('PROPERTY: stampContent leaves unknown extensions untouched (no stamp)', () => {
    const src = 'binary or unknown content';
    assert.equal(provenance.stampContent(src, 'image.bin', { model_id: 'm' }), src);
    assert.equal(provenance.stampContent(src, 'noext', { model_id: 'm' }), src);
  });

  it('PROPERTY: stampContent inserts the banner AFTER a shebang line (keeps it executable)', () => {
    const src = '#!/usr/bin/env node\nconsole.log(1);\n';
    const out = provenance.stampContent(src, 'cli.js', { model_id: 'm' });
    assert.ok(out.startsWith('#!/usr/bin/env node\n'), 'shebang must remain line 1');
    const afterShebang = out.slice('#!/usr/bin/env node\n'.length);
    assert.match(afterShebang, /^\/\/ AI-GENERATED-PROVENANCE-START/);
  });

  it('stampContent honours a caller-supplied generated_at timestamp', () => {
    const out = provenance.stampContent('x', 'a.js', { model_id: 'm', generated_at: '1999-12-31T00:00:00.000Z' });
    assert.match(out, /Generated: 1999-12-31T00:00:00\.000Z/);
  });

  // --- isStamped ---
  it('isStamped detects a stamped file and rejects an unstamped one', () => {
    const stamped = provenance.stampContent('x', 'a.js', { model_id: 'm' });
    assert.equal(provenance.isStamped(stamped), true);
    assert.equal(provenance.isStamped('plain content with no marker'), false);
  });

  it('PROPERTY: stamp then detect round-trips (stampContent output is isStamped)', () => {
    for (const ext of ['a.js', 'a.py', 'a.md']) {
      const out = provenance.stampContent('body', ext, { model_id: 'm' });
      assert.equal(provenance.isStamped(out), true, `${ext} stamp must be detectable`);
    }
  });
});

// ===========================================================================
// data-lineage.js
// ===========================================================================
describe('data-lineage.js — BCBS 239 lineage DAG', () => {
  let root;
  beforeEach(() => { root = makeTmp(); });
  afterEach(() => { rmTmp(root); });

  it('exports the documented lineage log path', () => {
    assert.equal(lineage.LINEAGE_LOG, '.ctoc/audit/lineage.jsonl');
  });

  // --- record happy path ---
  it('record returns an entry with hashed inputs/outputs and defaults', () => {
    const entry = lineage.record(root, {
      dispatch_id: 'D-1',
      inputs: [{ kind: 'plan', ref: 'p.md', sha256: 'aaa' }],
      outputs: [{ kind: 'file', ref: 'x.js', sha256: 'bbb' }],
    });
    assert.equal(entry.dispatch_id, 'D-1');
    assert.equal(entry.parent_dispatch_id, null);
    assert.equal(entry.agent, '(unspecified)');
    assert.ok(/^[0-9a-f]{64}$/.test(entry.inputs_hash), 'inputs_hash is a sha256 hex digest');
    assert.ok(/^[0-9a-f]{64}$/.test(entry.outputs_hash), 'outputs_hash is a sha256 hex digest');
    assert.ok(!Number.isNaN(Date.parse(entry.timestamp)));
    assert.ok(fs.existsSync(path.join(root, lineage.LINEAGE_LOG)));
  });

  it('record leaves the hash null when a side has no items', () => {
    const entry = lineage.record(root, { dispatch_id: 'D-empty' });
    assert.equal(entry.inputs_hash, null);
    assert.equal(entry.outputs_hash, null);
    assert.deepEqual(entry.inputs, []);
    assert.deepEqual(entry.outputs, []);
  });

  it('PROPERTY: identical input sets hash identically regardless of order (canonical sort)', () => {
    const a = lineage.record(root, {
      dispatch_id: 'A',
      inputs: [{ sha256: 'x1' }, { sha256: 'x2' }],
    });
    const b = lineage.record(root, {
      dispatch_id: 'B',
      inputs: [{ sha256: 'x2' }, { sha256: 'x1' }],
    });
    assert.equal(a.inputs_hash, b.inputs_hash, 'order must not change the canonical hash');
  });

  it('PROPERTY: differing inputs produce differing hashes (tamper-evident)', () => {
    const a = lineage.record(root, { dispatch_id: 'A', inputs: [{ sha256: 'x1' }] });
    const b = lineage.record(root, { dispatch_id: 'B', inputs: [{ sha256: 'x9' }] });
    assert.notEqual(a.inputs_hash, b.inputs_hash);
  });

  // --- record error path (documented to throw) ---
  it('record THROWS when dispatch_id is missing (documented requirement)', () => {
    assert.throws(() => lineage.record(root, { inputs: [] }), /dispatch_id required/);
  });

  // --- ancestorsOf / descendantsOf: the DAG-walk property ---
  it('PROPERTY: ancestorsOf walks the parent chain backward, target first', () => {
    lineage.record(root, { dispatch_id: 'root', agent: 'a0' });
    lineage.record(root, { dispatch_id: 'mid', parent_dispatch_id: 'root', agent: 'a1' });
    lineage.record(root, { dispatch_id: 'leaf', parent_dispatch_id: 'mid', agent: 'a2' });
    const anc = lineage.ancestorsOf(root, 'leaf');
    assert.deepEqual(anc.map((e) => e.dispatch_id), ['leaf', 'mid', 'root']);
  });

  it('ancestorsOf respects maxDepth to bound the walk', () => {
    lineage.record(root, { dispatch_id: 'g0' });
    lineage.record(root, { dispatch_id: 'g1', parent_dispatch_id: 'g0' });
    lineage.record(root, { dispatch_id: 'g2', parent_dispatch_id: 'g1' });
    const anc = lineage.ancestorsOf(root, 'g2', 2);
    assert.equal(anc.length, 2, 'maxDepth=2 stops after two hops');
    assert.deepEqual(anc.map((e) => e.dispatch_id), ['g2', 'g1']);
  });

  it('ancestorsOf returns [] for an unknown dispatch id', () => {
    lineage.record(root, { dispatch_id: 'known' });
    assert.deepEqual(lineage.ancestorsOf(root, 'unknown'), []);
  });

  it('PROPERTY: descendantsOf collects every transitive child', () => {
    lineage.record(root, { dispatch_id: 'root' });
    lineage.record(root, { dispatch_id: 'c1', parent_dispatch_id: 'root' });
    lineage.record(root, { dispatch_id: 'c2', parent_dispatch_id: 'root' });
    lineage.record(root, { dispatch_id: 'gc', parent_dispatch_id: 'c1' });
    const desc = lineage.descendantsOf(root, 'root');
    assert.deepEqual(desc.map((e) => e.dispatch_id).sort(), ['c1', 'c2', 'gc']);
  });

  it('descendantsOf returns [] for a leaf with no children', () => {
    lineage.record(root, { dispatch_id: 'lonely' });
    assert.deepEqual(lineage.descendantsOf(root, 'lonely'), []);
  });

  // --- renderLineage ---
  it('renderLineage reports ancestors (chronological), descendants, and total', () => {
    lineage.record(root, { dispatch_id: 'root', agent: 'a0' });
    lineage.record(root, { dispatch_id: 'mid', parent_dispatch_id: 'root', agent: 'a1' });
    lineage.record(root, { dispatch_id: 'leaf', parent_dispatch_id: 'mid', agent: 'a2' });
    const r = lineage.renderLineage(root, 'mid');
    assert.equal(r.target, 'mid');
    // ancestorsOf('mid') = [mid, root]; reversed => root..mid
    assert.equal(r.ancestors.length, 2);
    assert.match(r.ancestors[0], /root/, 'oldest ancestor rendered first after reverse');
    assert.match(r.ancestors[r.ancestors.length - 1], /mid/);
    assert.equal(r.descendants.length, 1);
    assert.match(r.descendants[0], /leaf/);
    // total_in_graph = ancestors(2) + descendants(1) + 1
    assert.equal(r.total_in_graph, 4);
  });

  // --- resilience: corrupt lines must not throw (readAll swallows JSON errors) ---
  it('PROPERTY: a corrupt JSONL line is skipped, not fatal (fails open on read)', () => {
    lineage.record(root, { dispatch_id: 'ok' });
    const logPath = path.join(root, lineage.LINEAGE_LOG);
    fs.appendFileSync(logPath, 'this is not json\n');
    lineage.record(root, { dispatch_id: 'ok2', parent_dispatch_id: 'ok' });
    let anc;
    assert.doesNotThrow(() => { anc = lineage.ancestorsOf(root, 'ok2'); });
    assert.deepEqual(anc.map((e) => e.dispatch_id), ['ok2', 'ok']);
  });

  it('ancestorsOf returns [] when the lineage log does not exist', () => {
    assert.deepEqual(lineage.ancestorsOf(root, 'anything'), []);
  });
});

// ===========================================================================
// proportionality.js
// ===========================================================================
describe('proportionality.js — FRCP Rule 26(b)(1) burden-vs-benefit', () => {
  let root;
  beforeEach(() => { root = makeTmp(); });
  afterEach(() => { rmTmp(root); });

  // --- exported constants ---
  it('exports the six FRCP factor keys in rule order, frozen', () => {
    assert.deepEqual(proportionality.FACTOR_KEYS, [
      'importance_of_issues',
      'severity_of_finding',
      'relative_access_to_information',
      'parties_resources',
      'importance_in_resolution',
      'burden_versus_benefit',
    ]);
    assert.ok(Object.isFrozen(proportionality.FACTOR_KEYS), 'FACTOR_KEYS must be frozen');
  });

  it('exports the four valid decisions', () => {
    assert.ok(proportionality.VALID_DECISIONS instanceof Set);
    assert.deepEqual(
      [...proportionality.VALID_DECISIONS].sort(),
      ['defer', 'narrow', 'proceed', 'reject'],
    );
  });

  // --- validateFactors ---
  it('validateFactors returns [] for a complete, well-formed factors object', () => {
    assert.deepEqual(proportionality.validateFactors(makeFactors()), []);
  });

  it('validateFactors rejects a non-object', () => {
    assert.deepEqual(proportionality.validateFactors(null), ['factors must be an object']);
    assert.deepEqual(proportionality.validateFactors('x'), ['factors must be an object']);
  });

  it('validateFactors flags a missing factor', () => {
    const f = makeFactors();
    delete f.parties_resources;
    const errs = proportionality.validateFactors(f);
    assert.ok(errs.some((e) => /parties_resources.*missing/.test(e)));
  });

  it('PROPERTY: weight must be an integer 1..5', () => {
    for (const bad of [0, 6, 2.5, '3', null]) {
      const f = makeFactors({ severity_of_finding: { weight: bad } });
      const errs = proportionality.validateFactors(f);
      assert.ok(
        errs.some((e) => /severity_of_finding".weight must be an integer 1\.\.5/.test(e)),
        `weight ${bad} must be rejected`,
      );
    }
  });

  it('validateFactors requires a non-empty rationale string', () => {
    const f = makeFactors({ burden_versus_benefit: { rationale: '   ' } });
    const errs = proportionality.validateFactors(f);
    assert.ok(errs.some((e) => /burden_versus_benefit".rationale must be a non-empty string/.test(e)));
  });

  it('PROPERTY: extra/unknown factors are rejected (cannot smuggle ad-hoc weights past audit)', () => {
    const f = makeFactors();
    f.extra_factor = { weight: 5, rationale: 'sneaky' };
    const errs = proportionality.validateFactors(f);
    assert.ok(errs.some((e) => /unknown factor "extra_factor"/.test(e)));
  });

  // --- logPathFor ---
  it('logPathFor builds a per-day YAML path under the proportionality log dir', () => {
    const d = new Date('2025-06-15T08:30:00.000Z');
    const p = proportionality.logPathFor(root, d);
    assert.equal(p, path.join(root, '.ctoc', 'proportionality-log', '2025-06-15.yaml'));
  });

  // --- logProportionalityDecision happy path ---
  it('logProportionalityDecision writes an entry and returns {path, entry}', async () => {
    const now = new Date('2025-06-15T10:00:00.000Z');
    const { path: logPath, entry } = await proportionality.logProportionalityDecision(
      'kb-1', makeFactors(), 'proceed', { projectRoot: root, now },
    );
    assert.equal(entry.kickback_id, 'kb-1');
    assert.equal(entry.decision, 'proceed');
    assert.equal(entry.decided_at, now.toISOString());
    assert.equal(entry.cited_authority, 'Federal Rules of Civil Procedure Rule 26(b)(1)');
    assert.ok(fs.existsSync(logPath));
    const content = fs.readFileSync(logPath, 'utf8');
    assert.match(content, /entries:/);
    assert.match(content, /kickback_id: kb-1/);
    assert.match(content, /decision: proceed/);
    assert.match(content, /importance_of_issues:/);
  });

  it('PROPERTY: the log is append-only — a header is written once, then entries accrue', async () => {
    const now = new Date('2025-06-15T10:00:00.000Z');
    const r1 = await proportionality.logProportionalityDecision('kb-1', makeFactors(), 'proceed', { projectRoot: root, now });
    await proportionality.logProportionalityDecision('kb-2', makeFactors(), 'narrow', { projectRoot: root, now });
    const content = fs.readFileSync(r1.path, 'utf8');
    const headerCount = content.split('Proportionality Log').length - 1;
    assert.equal(headerCount, 1, 'the file header must appear exactly once');
    assert.match(content, /kickback_id: kb-1/);
    assert.match(content, /kickback_id: kb-2/);
  });

  it('logProportionalityDecision routes entries from different days to different files', async () => {
    const day1 = new Date('2025-06-15T10:00:00.000Z');
    const day2 = new Date('2025-06-16T10:00:00.000Z');
    const r1 = await proportionality.logProportionalityDecision('a', makeFactors(), 'proceed', { projectRoot: root, now: day1 });
    const r2 = await proportionality.logProportionalityDecision('b', makeFactors(), 'reject', { projectRoot: root, now: day2 });
    assert.notEqual(r1.path, r2.path, 'distinct days => distinct daily logs');
  });

  it('logProportionalityDecision honours a custom cited_authority', async () => {
    const { entry } = await proportionality.logProportionalityDecision(
      'kb', makeFactors(), 'defer',
      { projectRoot: root, now: new Date('2025-06-15T10:00:00.000Z'), cited_authority: 'Custom Rule' },
    );
    assert.equal(entry.cited_authority, 'Custom Rule');
  });

  // --- error paths (documented to throw) ---
  it('logProportionalityDecision rejects a blank kickbackId', async () => {
    await assert.rejects(
      () => proportionality.logProportionalityDecision('', makeFactors(), 'proceed', { projectRoot: root }),
      /kickbackId must be a non-empty string/,
    );
  });

  it('logProportionalityDecision rejects an invalid decision', async () => {
    await assert.rejects(
      () => proportionality.logProportionalityDecision('kb', makeFactors(), 'maybe', { projectRoot: root }),
      /decision must be one of/,
    );
  });

  it('PROPERTY: logProportionalityDecision rejects invalid factors (audit cannot be bypassed)', async () => {
    const bad = makeFactors({ severity_of_finding: { weight: 9 } });
    await assert.rejects(
      () => proportionality.logProportionalityDecision('kb', bad, 'proceed', { projectRoot: root }),
      /invalid factors/,
    );
  });

  // --- summarizeEntry ---
  it('PROPERTY: summarizeEntry surfaces the highest-weight (driving) factor', () => {
    const factors = makeFactors({ burden_versus_benefit: { weight: 5, rationale: 'the deciding factor' } });
    const entry = {
      kickback_id: 'kb-1', decision: 'reject', factors,
      cited_authority: 'FRCP 26(b)(1)',
    };
    const md = proportionality.summarizeEntry(entry);
    assert.match(md, /Kickback kb-1 — decision: reject/);
    assert.match(md, /Driving factor: burden_versus_benefit \(weight 5\/5\)/);
    assert.match(md, /Rationale: the deciding factor/);
    assert.match(md, /Authority: FRCP 26\(b\)\(1\)/);
  });
});

// ===========================================================================
// traceability-matrix.js
// ===========================================================================
describe('traceability-matrix.js — DO-178C / IEC 62304 traceability', () => {
  let root;
  beforeEach(() => { root = makeTmp(); });
  afterEach(() => { rmTmp(root); });

  it('exports the documented matrix path', () => {
    assert.equal(traceability.MATRIX_PATH, '.ctoc/traceability/matrix.yaml');
  });

  it('load returns an empty matrix when no file exists', () => {
    const m = traceability.load(root);
    assert.deepEqual(m.requirements, []);
    assert.equal(m.generated_at, null);
  });

  // --- save / load round-trip: the canonical-form property ---
  it('PROPERTY: save then load round-trips a requirement faithfully', () => {
    const matrix = {
      generated_at: '2025-06-15T00:00:00.000Z',
      requirements: [{
        id: 'REQ-001',
        level: 'HLR',
        description: 'The system shall do the thing',
        parent: null,
        source_plan: 'plans/done/p.md',
        satisfied_by_files: ['src/a.js', 'src/b.js'],
        covered_by_tests: ['tests/a.test.js'],
        verification_status: 'covered',
        last_updated: '2025-06-15T00:00:00.000Z',
      }],
    };
    traceability.save(root, matrix);
    const loaded = traceability.load(root);
    assert.equal(loaded.generated_at, '2025-06-15T00:00:00.000Z');
    assert.equal(loaded.requirements.length, 1);
    const r = loaded.requirements[0];
    assert.equal(r.id, 'REQ-001');
    assert.equal(r.level, 'HLR');
    assert.equal(r.description, 'The system shall do the thing');
    assert.equal(r.parent, null);
    assert.equal(r.source_plan, 'plans/done/p.md');
    assert.deepEqual(r.satisfied_by_files, ['src/a.js', 'src/b.js']);
    assert.deepEqual(r.covered_by_tests, ['tests/a.test.js']);
    assert.equal(r.verification_status, 'covered');
  });

  it('save round-trips a requirement with empty file/test lists', () => {
    traceability.save(root, {
      requirements: [{ id: 'REQ-EMPTY', level: 'LLR' }],
    });
    const r = traceability.load(root).requirements[0];
    assert.equal(r.id, 'REQ-EMPTY');
    assert.deepEqual(r.satisfied_by_files, []);
    assert.deepEqual(r.covered_by_tests, []);
  });

  // --- upsert ---
  it('upsert inserts a new requirement and stamps last_updated', () => {
    const req = traceability.upsert(root, { id: 'REQ-1', description: 'd' });
    assert.equal(req.id, 'REQ-1');
    assert.ok(req.last_updated, 'last_updated is stamped');
    assert.equal(traceability.load(root).requirements.length, 1);
  });

  it('PROPERTY: upsert replaces an existing requirement by id (merge, no duplicate)', () => {
    traceability.upsert(root, { id: 'REQ-1', description: 'first', verification_status: 'pending' });
    traceability.upsert(root, { id: 'REQ-1', verification_status: 'covered' });
    const reqs = traceability.load(root).requirements;
    assert.equal(reqs.length, 1, 'same id must not duplicate');
    assert.equal(reqs[0].verification_status, 'covered', 'fields are updated');
    assert.equal(reqs[0].description, 'first', 'unspecified fields are preserved by merge');
  });

  it('upsert throws when id is missing (documented requirement)', () => {
    assert.throws(() => traceability.upsert(root, { description: 'no id' }), /id required/);
  });

  // --- findOrphans: the Gate-3 refusal property ---
  it('PROPERTY: findOrphans flags a requirement with no satisfying file OR no covering test', () => {
    traceability.upsert(root, { id: 'OK', satisfied_by_files: ['src/a.js'], covered_by_tests: ['t.js'] });
    traceability.upsert(root, { id: 'NO-FILE', satisfied_by_files: [], covered_by_tests: ['t.js'] });
    traceability.upsert(root, { id: 'NO-TEST', satisfied_by_files: ['src/a.js'], covered_by_tests: [] });
    const orphans = traceability.findOrphans(root);
    assert.deepEqual(orphans.map((r) => r.id).sort(), ['NO-FILE', 'NO-TEST']);
  });

  it('findOrphans returns [] when every requirement is fully traced', () => {
    traceability.upsert(root, { id: 'A', satisfied_by_files: ['src/a.js'], covered_by_tests: ['t.js'] });
    assert.deepEqual(traceability.findOrphans(root), []);
  });

  // --- findDanglingReferences ---
  it('PROPERTY: findDanglingReferences flags a satisfied_by_files path that does not exist', () => {
    writeFile(root, path.join('src', 'real.js'), 'x');
    traceability.upsert(root, {
      id: 'REQ-1',
      satisfied_by_files: [path.join('src', 'real.js'), path.join('src', 'ghost.js')],
      covered_by_tests: ['t.js'],
    });
    const dangling = traceability.findDanglingReferences(root);
    assert.equal(dangling.length, 1, 'only the missing file dangles');
    assert.equal(dangling[0].requirement_id, 'REQ-1');
    assert.equal(dangling[0].kind, 'missing_file');
    assert.equal(dangling[0].value, path.join('src', 'ghost.js'));
  });

  it('findDanglingReferences returns [] when all referenced files exist', () => {
    writeFile(root, path.join('src', 'a.js'), 'x');
    traceability.upsert(root, { id: 'R', satisfied_by_files: [path.join('src', 'a.js')], covered_by_tests: ['t'] });
    assert.deepEqual(traceability.findDanglingReferences(root), []);
  });

  // --- summary ---
  it('PROPERTY: summary computes status counts, orphans, and coverage percent', () => {
    traceability.upsert(root, { id: 'A', verification_status: 'covered', satisfied_by_files: ['x'], covered_by_tests: ['t'] });
    traceability.upsert(root, { id: 'B', verification_status: 'pending', satisfied_by_files: ['x'], covered_by_tests: ['t'] });
    traceability.upsert(root, { id: 'C', verification_status: 'failed', satisfied_by_files: ['x'], covered_by_tests: ['t'] });
    traceability.upsert(root, { id: 'D', verification_status: 'partial', satisfied_by_files: ['x'], covered_by_tests: ['t'] });
    const s = traceability.summary(root);
    assert.equal(s.total_requirements, 4);
    assert.equal(s.verified, 1);
    assert.equal(s.pending, 1);
    assert.equal(s.failed, 1);
    assert.equal(s.partial, 1);
    assert.equal(s.orphans, 0);
    assert.equal(s.coverage_pct, 25, '1 of 4 verified => 25%');
  });

  it('summary reports null coverage_pct for an empty matrix (no divide-by-zero)', () => {
    const s = traceability.summary(root);
    assert.equal(s.total_requirements, 0);
    assert.equal(s.coverage_pct, null);
  });

  it('save preserves a description containing special characters (JSON-quoted)', () => {
    traceability.upsert(root, { id: 'REQ-Q', description: 'value: with "quotes" and: colons' });
    const r = traceability.load(root).requirements[0];
    assert.equal(r.description, 'value: with "quotes" and: colons',
      'special-character descriptions must round-trip through the canonical YAML');
  });
});

// ===========================================================================
// irac-schema.js
// ===========================================================================
describe('irac-schema.js — IRAC legal-memo output schema', () => {
  it('exports the documented required fields and severity set', () => {
    assert.deepEqual(irac.REQUIRED_FIELDS, ['id', 'issue', 'rule', 'application', 'conclusion', 'severity']);
    assert.ok(irac.ALLOWED_SEVERITIES instanceof Set);
    assert.deepEqual([...irac.ALLOWED_SEVERITIES], ['critical', 'high', 'medium', 'low', 'info']);
  });

  // --- validate happy path ---
  it('validate accepts a complete, well-formed finding', () => {
    const r = irac.validate(makeFinding());
    assert.deepEqual(r, { ok: true });
  });

  it('validate accepts every allowed severity', () => {
    for (const sev of irac.ALLOWED_SEVERITIES) {
      assert.deepEqual(irac.validate(makeFinding({ severity: sev })), { ok: true }, `${sev} is allowed`);
    }
  });

  it('validate accepts well-formed citations (each with a url)', () => {
    const r = irac.validate(makeFinding({ citations: [{ title: 'GDPR', url: 'https://example.test' }] }));
    assert.deepEqual(r, { ok: true });
  });

  // --- validate error paths (returns {ok:false, errors}, never throws) ---
  it('validate rejects a non-object without throwing', () => {
    let r;
    assert.doesNotThrow(() => { r = irac.validate(null); });
    assert.equal(r.ok, false);
    assert.deepEqual(r.errors, ['finding must be an object']);
  });

  it('PROPERTY: validate flags each missing required field', () => {
    const r = irac.validate({ severity: 'low', issue: 'why?' });
    assert.equal(r.ok, false);
    for (const field of ['id', 'rule', 'application', 'conclusion']) {
      assert.ok(r.errors.includes(`missing required field: ${field}`), `must flag missing ${field}`);
    }
  });

  it('PROPERTY: validate rejects a severity outside the allowed set', () => {
    const r = irac.validate(makeFinding({ severity: 'catastrophic' }));
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /invalid severity catastrophic/.test(e)));
  });

  it('PROPERTY: the Issue must be phrased as a question ending in "?"', () => {
    const r = irac.validate(makeFinding({ issue: 'This is a statement, not a question' }));
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /issue must be phrased as a question/.test(e)));
  });

  it('validate rejects citations that are not an array', () => {
    const r = irac.validate(makeFinding({ citations: 'not-an-array' }));
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /citations must be an array/.test(e)));
  });

  it('PROPERTY: every citation must carry a url', () => {
    const r = irac.validate(makeFinding({ citations: [{ title: 'no url here' }] }));
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /citation missing url/.test(e)));
  });

  // --- validateAll ---
  it('validateAll accepts an array of valid findings', () => {
    assert.deepEqual(irac.validateAll([makeFinding(), makeFinding({ id: 'b' })]), { ok: true });
  });

  it('validateAll accepts an empty array (vacuously ok)', () => {
    assert.deepEqual(irac.validateAll([]), { ok: true });
  });

  it('validateAll rejects a non-array input without throwing', () => {
    let r;
    assert.doesNotThrow(() => { r = irac.validateAll({ not: 'an array' }); });
    assert.equal(r.ok, false);
    assert.deepEqual(r.errors, ['findings must be an array']);
  });

  it('PROPERTY: validateAll reports per-index errors for the offending findings only', () => {
    const r = irac.validateAll([makeFinding(), makeFinding({ severity: 'nope' })]);
    assert.equal(r.ok, false);
    assert.equal(r.errors.length, 1, 'only the bad finding is reported');
    assert.equal(r.errors[0].index, 1);
    assert.ok(r.errors[0].errors.some((e) => /invalid severity/.test(e)));
  });

  // --- toMarkdown ---
  it('PROPERTY: toMarkdown renders the four IRAC sections in order', () => {
    const md = irac.toMarkdown(makeFinding());
    assert.match(md, /## gdpr-art17\s+\(severity: critical\)/);
    const issueIdx = md.indexOf('### Issue');
    const ruleIdx = md.indexOf('### Rule');
    const appIdx = md.indexOf('### Application');
    const concIdx = md.indexOf('### Conclusion');
    assert.ok(issueIdx >= 0 && ruleIdx > issueIdx && appIdx > ruleIdx && concIdx > appIdx,
      'Issue -> Rule -> Application -> Conclusion order must hold');
  });

  it('toMarkdown includes Citations and Evidence sections only when present', () => {
    const withExtras = irac.toMarkdown(makeFinding({
      citations: [{ title: 'GDPR Art 17', url: 'https://example.test' }],
      evidence: [{ file: 'src/x.js', line: 42, snippet: 'delete user' }],
    }));
    assert.match(withExtras, /### Citations/);
    assert.match(withExtras, /\[GDPR Art 17\]\(https:\/\/example\.test\)/);
    assert.match(withExtras, /### Evidence/);
    assert.match(withExtras, /src\/x\.js:42/);

    const without = irac.toMarkdown(makeFinding());
    assert.doesNotMatch(without, /### Citations/);
    assert.doesNotMatch(without, /### Evidence/);
  });
});
