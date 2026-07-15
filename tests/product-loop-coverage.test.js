/**
 * Product Loop — dark-branch coverage tests (v8.4)
 *
 * Companion to tests/product-loop.test.js. That suite covers the happy paths
 * (file present, round-trips, conformance). This suite targets the NON-OBVIOUS
 * branches that survive mutation: error/empty/absent-config paths, the second
 * operand of `||`/`&&`/`??`, `parseLaunchKpis` line-state edges, the exact
 * `>` (not `>=`) review-overdue boundary, and `nextReviewDue`'s prior-review
 * `else` branch (lines 225-228, previously dark) plus `isReviewOverdue`
 * (lines 234-239, previously dark).
 *
 * NOTE ON KPI STATUS: this module contains NO KPI status/threshold classifier
 * (loadCanonicalKPIs merely parses the library; there is no "at/above vs below
 * target → status" function here). The only threshold DECISION in the file is
 * isReviewOverdue's strict `today > due` comparison — pinned exactly below so a
 * `>` → `>=` mutant (or the reverse) goes RED.
 *
 * Fakes only at the true boundary (the filesystem, via real os.tmpdir()
 * fixtures). The module binds ROOT/CANONICAL_KPI_PATH/REVIEWS_DIR/
 * EXPERIMENTS_DIR from process.cwd() at require time, so every fs-dependent
 * test chdirs into a tmp dir BEFORE loadModule() re-requires the module.
 * Reviewed line-by-line by a human before commit.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

function loadModule() {
  const p = require.resolve('../src/lib/product-loop');
  delete require.cache[p];
  return require('../src/lib/product-loop');
}

// ─────────────────────────────────────────────────────────────────────
//  parseLaunchKpis — pure, exported: line-state edges (no fs needed)
// ─────────────────────────────────────────────────────────────────────

describe('Product Loop — parseLaunchKpis line-state edges', () => {
  // Table-driven: every row pins one branch of the line walk. Each row has an
  // id so a failure names the exact edge that regressed.
  const rows = [
    {
      id: 'happy-two-items',
      content: 'launch_kpis:\n  - activation_rate\n  - mrr\n',
      expected: ['activation_rate', 'mrr'],
    },
    {
      id: 'no-header-returns-empty', // idx === -1 branch
      content: 'other_block:\n  - activation_rate\n',
      expected: [],
    },
    {
      id: 'blank-line-inside-block-is-tolerated', // `trim() === '' → continue` (NOT break)
      content: 'launch_kpis:\n\n  - activation_rate\n',
      expected: ['activation_rate'],
    },
    {
      id: 'dedent-ends-block', // `else break` — item after the dedent is NOT captured
      content: 'launch_kpis:\n  - activation_rate\nother_block:\n  - mrr\n',
      expected: ['activation_rate'],
    },
    {
      id: 'header-then-no-items-returns-empty', // !blockLines.length branch
      content: 'launch_kpis:\nother_block:\n',
      expected: [],
    },
    {
      id: 'crlf-input-still-parses', // \r?\n split; a bare \n split would leave "launch_kpis:\r" and fail the ^...$ header
      content: 'launch_kpis:\r\n  - activation_rate\r\n  - mrr\r\n',
      expected: ['activation_rate', 'mrr'],
    },
  ];

  for (const row of rows) {
    it(`parseLaunchKpis returns ${JSON.stringify(row.expected)} for row=${row.id}`, () => {
      // Arrange
      const { parseLaunchKpis } = loadModule();

      // Act
      const ids = parseLaunchKpis(row.content);

      // Assert
      assert.deepEqual(ids, row.expected);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────
//  loadCanonicalKPIs / getApplicableKPIs — parse + filter dark branches
//  Uses a controlled canonical fixture written into the tmp ROOT.
// ─────────────────────────────────────────────────────────────────────

describe('Product Loop — canonical KPI parse + applicability filter', () => {
  let originalCwd;
  let tmpDir;

  // IMPORTANT — real parser behavior: the block-body regex in loadCanonicalKPIs
  // uses `(?=^\s*- id:|^\s*#=|$)` under the `m` flag, so `$` terminates each
  // entry's body at its FIRST line. Only the field immediately after `- id:` is
  // ever captured; all later fields are null/[] — for the real product-kpis.yaml
  // too (the shipped file's category/applicable_to/etc. all parse as null/[]).
  // These tests therefore pin ACTUAL behavior and lead each entry with the field
  // under test. (See report: this is a latent defect in loadCanonicalKPIs.)
  //
  // alpha : applicable_to leads → ['saas-b2c','saas-b2b'] (getList found + split)
  // beta  : applicable_to = [saas-b2b] → EXCLUDED for saas-b2c (the !includes → false path)
  // gamma : applicable_to: [] → empty list, always applicable (length>0 second operand)
  // delta : name leads (quoted) → getList('applicable_to') finds nothing → [] branch;
  //         get('category') finds nothing → null branch
  const CANONICAL = [
    'schema_version: 1',
    'kpis:',
    '',
    '  - id: alpha',
    '    applicable_to: [saas-b2c, saas-b2b]',
    '',
    '  - id: beta',
    '    applicable_to: [saas-b2b]',
    '',
    '  - id: gamma',
    '    applicable_to: []',
    '',
    '  - id: delta',
    '    name: "Delta Metric"',
    '',
  ].join('\n');

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-pl-cov-'));
    process.chdir(tmpDir);
    fs.mkdirSync(path.join('.ctoc', 'templates'), { recursive: true });
    fs.writeFileSync(path.join('.ctoc', 'templates', 'product-kpis.yaml'), CANONICAL);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('loadCanonicalKPIs splits a leading applicable_to list on commas', () => {
    // Arrange
    const { loadCanonicalKPIs } = loadModule();

    // Act
    const alpha = loadCanonicalKPIs().find(k => k.id === 'alpha');

    // Assert — getList found-branch: split(',') + trim + filter(Boolean)
    assert.deepEqual(alpha.applicable_to, ['saas-b2c', 'saas-b2b']);
  });

  it('loadCanonicalKPIs strips surrounding quotes from a leading field value', () => {
    // Arrange — delta leads with a double-quoted name
    const { loadCanonicalKPIs } = loadModule();

    // Act
    const delta = loadCanonicalKPIs().find(k => k.id === 'delta');

    // Assert — the .replace(/^["']|["']$/g, '') quote-strip. A mutant that drops
    // the replace would leave the literal quotes.
    assert.equal(delta.name, 'Delta Metric');
  });

  it('loadCanonicalKPIs yields null for absent scalar keys and [] for absent lists', () => {
    // Arrange — delta has neither category nor applicable_to on its (single) body line
    const { loadCanonicalKPIs } = loadModule();

    // Act
    const delta = loadCanonicalKPIs().find(k => k.id === 'delta');

    // Assert — get() `? : null` second operand AND getList() `return []` branch
    assert.equal(delta.category, null);
    assert.deepEqual(delta.applicable_to, []);
  });

  it('loadCanonicalKPIs returns [] for a missing canonical file', () => {
    // Arrange — remove the fixture so readFile returns the '' fallback
    const { loadCanonicalKPIs } = loadModule();
    fs.rmSync(path.join('.ctoc', 'templates', 'product-kpis.yaml'));

    // Act
    const kpis = loadCanonicalKPIs();

    // Assert — `if (!content) return []` dark branch
    assert.deepEqual(kpis, []);
  });

  it('getApplicableKPIs excludes only KPIs whose non-empty list omits the type', () => {
    // Arrange
    const { getApplicableKPIs } = loadModule();

    // Act
    const ids = getApplicableKPIs({ projectType: 'saas-b2c' }).map(k => k.id);

    // Assert — alpha(includes), gamma(empty list), delta(no list) kept; beta dropped.
    // Kills the &&-chain second operands: empty-list and missing-list must NOT be excluded.
    assert.deepEqual(ids.sort(), ['alpha', 'delta', 'gamma']);
  });

  it('getApplicableKPIs returns every KPI when projectType is undefined', () => {
    // Arrange
    const { getApplicableKPIs } = loadModule();

    // Act — no projectType: the `projectType && ...` guard short-circuits false
    const ids = getApplicableKPIs({}).map(k => k.id);

    // Assert — nothing filtered out, including beta
    assert.deepEqual(ids.sort(), ['alpha', 'beta', 'delta', 'gamma']);
  });
});

// ─────────────────────────────────────────────────────────────────────
//  loadTemplateKPIPlan — absent template → null
// ─────────────────────────────────────────────────────────────────────

describe('Product Loop — loadTemplateKPIPlan absent config', () => {
  let originalCwd;
  let tmpDir;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-pl-cov-'));
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('returns null when the template kpi-plan.yaml does not exist', () => {
    // Arrange
    const { loadTemplateKPIPlan } = loadModule();

    // Act
    const plan = loadTemplateKPIPlan('saas/does-not-exist');

    // Assert — `if (!content) return null` dark branch
    assert.equal(plan, null);
  });
});

// ─────────────────────────────────────────────────────────────────────
//  renderKPIPlan (via saveProjectKPIPlan) — fallbacks + optional fields
// ─────────────────────────────────────────────────────────────────────

describe('Product Loop — renderKPIPlan fallbacks and optional fields', () => {
  let originalCwd;
  let tmpDir;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-pl-cov-'));
    process.chdir(tmpDir);
    fs.mkdirSync(path.join('plans', 'canvas'), { recursive: true });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('emits project: unknown and omits optional blocks for a minimal plan', () => {
    // Arrange
    const { saveProjectKPIPlan, loadProjectKPIPlan } = loadModule();

    // Act — no project, no template_id, no activation_event, no launch_kpis, no next_review
    saveProjectKPIPlan('minimal', {});
    const raw = loadProjectKPIPlan('minimal').raw;

    // Assert — the `plan.project || 'unknown'` second operand and the absent-guards
    assert.match(raw, /^project: unknown$/m);
    assert.doesNotMatch(raw, /template_id:/);
    assert.doesNotMatch(raw, /activation_event:/);
    assert.doesNotMatch(raw, /next_review:/);
    // `launch_kpis || []` still renders the header with zero items (no crash)
    assert.match(raw, /^launch_kpis:$/m);
  });

  it('renders string next_review values bare and non-string values as JSON', () => {
    // Arrange
    const { saveProjectKPIPlan, loadProjectKPIPlan } = loadModule();

    // Act — cadence is a string; count is a number → the ternary's two operands
    saveProjectKPIPlan('nr', {
      project: 'nr',
      next_review: { cadence: 'weekly', count: 3 },
    });
    const raw = loadProjectKPIPlan('nr').raw;

    // Assert — string → bare (no quotes); number → JSON.stringify
    assert.match(raw, /^ {2}cadence: weekly$/m);
    assert.match(raw, /^ {2}count: 3$/m);
  });

  it('emits rationale and per-KPI activation_event only when present', () => {
    // Arrange
    const { saveProjectKPIPlan, loadProjectKPIPlan } = loadModule();

    // Act — first KPI has both optionals, second has neither
    saveProjectKPIPlan('opt', {
      project: 'opt',
      launch_kpis: [
        { id: 'activation_rate', target: '> 30%', rationale: 'why', activation_event: 'first_invoice' },
        { id: 'mrr', target: 'growing' },
      ],
    });
    const raw = loadProjectKPIPlan('opt').raw;

    // Assert — the two per-KPI `if` guards fire for the first, stay dark for the second
    assert.match(raw, /rationale: "why"/);
    assert.match(raw, /activation_event: "first_invoice"/);
    // exactly one rationale line — mutant that always-emits would produce two
    assert.equal((raw.match(/rationale:/g) || []).length, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────
//  Reviews + experiments — empty-collection fallbacks & status default
// ─────────────────────────────────────────────────────────────────────

describe('Product Loop — reviews and experiments edge cases', () => {
  let originalCwd;
  let tmpDir;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-pl-cov-'));
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('listReviews returns [] when the reviews dir is absent', () => {
    // Arrange — fresh tmp, no .ctoc/product-loop/reviews
    const { listReviews } = loadModule();

    // Act + Assert — the existsSync guard's fail path
    assert.deepEqual(listReviews(), []);
  });

  it('latestReview returns null when there are no reviews', () => {
    // Arrange
    const { latestReview } = loadModule();

    // Act + Assert — the `all.length > 0 ? ... : null` empty branch
    assert.equal(latestReview(), null);
  });

  it('listReviews ignores non-.md files', () => {
    // Arrange
    const { saveReview, listReviews } = loadModule();
    saveReview('2026-05-14', '# real review');
    fs.writeFileSync(path.join('.ctoc', 'product-loop', 'reviews', 'notes.txt'), 'ignore me');

    // Act
    const all = listReviews();

    // Assert — the .endsWith('.md') filter drops the .txt
    assert.equal(all.length, 1);
    assert.match(all[0], /2026-05-14\.md$/);
  });

  it('listExperiments returns [] when the experiments dir is absent', () => {
    // Arrange
    const { listExperiments } = loadModule();

    // Act + Assert — the existsSync guard's fail path
    assert.deepEqual(listExperiments(), []);
  });

  it('listExperiments reports status "unknown" when no status line is present', () => {
    // Arrange — an experiment file with no `status:` field
    const { saveExperiment, listExperiments } = loadModule();
    saveExperiment('noStatus', 'hypothesis: something\n');

    // Act
    const exp = listExperiments().find(e => e.id === 'noStatus');

    // Assert — the `statusMatch ? statusMatch[1] : 'unknown'` fallback
    assert.equal(exp.status, 'unknown');
  });

  it('listExperiments status filter keeps only exact matches and ignores non-.yaml', () => {
    // Arrange
    const { saveExperiment, listExperiments } = loadModule();
    saveExperiment('run1', 'status: running\n');
    saveExperiment('done1', 'status: complete\n');
    fs.writeFileSync(path.join('.ctoc', 'product-loop', 'experiments', 'stray.txt'), 'status: running\n');

    // Act
    const running = listExperiments({ status: 'running' });

    // Assert — `if (status && expStatus !== status) continue`: complete dropped, .txt never listed
    assert.equal(running.length, 1);
    assert.equal(running[0].id, 'run1');
  });
});

// ─────────────────────────────────────────────────────────────────────
//  nextReviewDue — prior-review else branch (225-228) + missing created_at
// ─────────────────────────────────────────────────────────────────────

describe('Product Loop — nextReviewDue scheduling branches', () => {
  let originalCwd;
  let tmpDir;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-pl-cov-'));
    process.chdir(tmpDir);
    fs.mkdirSync(path.join('plans', 'canvas'), { recursive: true });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  // Write the KPI plan file directly so created_at is a KNOWN fixed value
  // (saveProjectKPIPlan stamps created_at = Date.now(), which we can't pin).
  function writePlan(slug, body) {
    fs.writeFileSync(path.join('plans', 'canvas', `${slug}-kpis.yaml`), body);
  }

  it('computes created_at + cadence days exactly when no prior review exists', () => {
    // Arrange — no reviews on disk; created_at fixed
    const { nextReviewDue } = loadModule();
    writePlan('newproj', 'schema_version: 1\nproject: newproj\ncreated_at: 2026-01-01T00:00:00.000Z\n');

    // Act — 7 days after 2026-01-01
    const due = nextReviewDue('newproj', 7);

    // Assert — pins the created.getTime() + cadenceDays*86400000 arithmetic + slice(0,10)
    assert.equal(due, '2026-01-08');
  });

  it('returns null when the plan has no created_at and no prior review', () => {
    // Arrange
    const { nextReviewDue } = loadModule();
    writePlan('nodate', 'schema_version: 1\nproject: nodate\n');

    // Act
    const due = nextReviewDue('nodate');

    // Assert — the `if (!createdMatch) return null` dark branch
    assert.equal(due, null);
  });

  it('computes last-review date + cadence when a prior review exists (else branch)', () => {
    // Arrange — a plan AND a prior review; the else branch must use the review
    // date, NOT created_at. created_at is deliberately far in the past to prove
    // it is ignored once a review exists.
    const { nextReviewDue, saveReview } = loadModule();
    writePlan('withrev', 'schema_version: 1\nproject: withrev\ncreated_at: 2020-01-01T00:00:00.000Z\n');
    saveReview('2026-05-21', '# review');

    // Act — 7 days after the LAST review (2026-05-21)
    const due = nextReviewDue('withrev', 7);

    // Assert — pins lines 225-228: basename + setUTCDate(+cadence). If it used
    // created_at (2020) this would be 2020-01-08, not 2026-05-28.
    assert.equal(due, '2026-05-28');
  });

  it('honors a non-default cadence against the last review date', () => {
    // Arrange
    const { nextReviewDue, saveReview } = loadModule();
    writePlan('cad', 'schema_version: 1\nproject: cad\ncreated_at: 2026-05-01T00:00:00.000Z\n');
    saveReview('2026-05-21', '# review');

    // Act — cadence 3, not the default 7
    const due = nextReviewDue('cad', 3);

    // Assert — 2026-05-24; kills a mutant that hardcodes 7 or drops cadenceDays
    assert.equal(due, '2026-05-24');
  });

  it('returns null when no plan exists at all', () => {
    // Arrange
    const { nextReviewDue } = loadModule();

    // Act + Assert — the `if (!plan) return null` guard
    assert.equal(nextReviewDue('ghost'), null);
  });
});

// ─────────────────────────────────────────────────────────────────────
//  isReviewOverdue — the exact `today > due` boundary (234-239, was dark)
// ─────────────────────────────────────────────────────────────────────

describe('Product Loop — isReviewOverdue boundary (strict > not >=)', () => {
  let originalCwd;
  let tmpDir;

  const DAY_MS = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-pl-cov-'));
    process.chdir(tmpDir);
    fs.mkdirSync(path.join('plans', 'canvas'), { recursive: true });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  function writePlan(slug, createdAt) {
    fs.writeFileSync(
      path.join('plans', 'canvas', `${slug}-kpis.yaml`),
      `schema_version: 1\nproject: ${slug}\ncreated_at: ${createdAt}\n`,
    );
  }

  // `new Date()` inside the module reads the real system clock (Date.now stubs
  // do NOT affect the no-arg constructor). So instead of freezing "today", we
  // anchor created_at relative to the real current UTC day so the boundary
  // (due vs today) lands exactly where each case needs it. cadence is 7, so
  // due = created + 7 days. offsetDays shifts due relative to today.
  function createdForDueOffset(offsetDays) {
    const todayMidnight = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`).getTime();
    // due = today + offsetDays  ⇒  created = due - 7 days
    return new Date(todayMidnight + offsetDays * DAY_MS - 7 * DAY_MS).toISOString();
  }

  it('returns false when today equals the due date (boundary: > is strict)', () => {
    // Arrange — due lands exactly on today
    const { isReviewOverdue } = loadModule();
    writePlan('bnd', createdForDueOffset(0));

    // Act
    const overdue = isReviewOverdue('bnd', 7);

    // Assert — equal is NOT overdue; a `>=` mutant would return true here
    assert.equal(overdue, false);
  });

  it('returns true when today is one day past the due date', () => {
    // Arrange — due lands one day BEFORE today
    const { isReviewOverdue } = loadModule();
    writePlan('bnd', createdForDueOffset(-1));

    // Act
    const overdue = isReviewOverdue('bnd', 7);

    // Assert — strictly greater → overdue
    assert.equal(overdue, true);
  });

  it('returns false when today is before the due date', () => {
    // Arrange — due lands one day AFTER today
    const { isReviewOverdue } = loadModule();
    writePlan('bnd', createdForDueOffset(1));

    // Act
    const overdue = isReviewOverdue('bnd', 7);

    // Assert
    assert.equal(overdue, false);
  });

  it('returns false when there is no schedule (no plan → no due date)', () => {
    // Arrange
    const { isReviewOverdue } = loadModule();

    // Act + Assert — the `if (!due) return false` guard
    assert.equal(isReviewOverdue('ghost'), false);
  });
});
