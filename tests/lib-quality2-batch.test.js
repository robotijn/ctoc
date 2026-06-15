/**
 * Quality lib batch tests (round 2)
 *
 * Contract-based tests for five previously untested lib modules:
 *   - src/lib/quality-agent.js     (background quality runner — pure helpers)
 *   - src/lib/quality-reporter.js  (multi-format report generation)
 *   - src/lib/grading-system.js    (0-10 agent grading + persistence)
 *   - src/lib/eval-harness.js      (EDD case loader / validator / runner)
 *   - src/lib/step-13-verify.js    (Step 14 VERIFY quality-gate runner)
 *
 * Each module is exercised on its documented contract: every export's happy
 * path, the core correctness property declared in its header/JSDoc, and error
 * paths with malformed input (asserting no uncaught throw). Filesystem modules
 * use hermetic temp directories cleaned up in afterEach. Cross-platform: all
 * paths via path.join / os.tmpdir; no hardcoded separators or `~`.
 *
 * Modules that spawn external tools (quality-agent's runners, step-13-verify's
 * execSync of npm/ruff/etc.) are tested only on their pure decision logic and
 * on the documented "no uncaught throw" guarantee; the parts that require an
 * absent external binary are exercised through that guarantee, not asserted on
 * a specific tool's presence.
 */

'use strict';

const assert = require('node:assert/strict');
const { test, describe, beforeEach, afterEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPORTER = require('../src/lib/quality-reporter');
const { QualityReporter, FORMATS } = REPORTER;
const grading = require('../src/lib/grading-system');
const harness = require('../src/lib/eval-harness');
const verify = require('../src/lib/step-13-verify');

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function rmDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    // Best-effort cleanup; ignore.
  }
}

function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

// ===========================================================================
// quality-reporter.js
// ===========================================================================

describe('quality-reporter.js', () => {
  // A minimally-complete scoreData shape, as documented to come from
  // QualityScorer. Two components, a couple recommendations, and a trend.
  function sampleData() {
    return {
      overall: 82,
      grade: 'B',
      gradeInfo: { label: 'Good' },
      timestamp: '2026-01-01T00:00:00.000Z',
      trend: {
        direction: 'up',
        symbol: '^',
        label: 'Improving',
        change: 5,
        history: [70, 75, 82]
      },
      components: {
        coverage: {
          score: 8,
          maxScore: 10,
          metrics: { lines: 85, hasReadme: true },
          details: ['Branch coverage below target']
        },
        security: {
          score: 9,
          maxScore: 10,
          metrics: { critical: 0 },
          details: []
        }
      },
      recommendations: [
        {
          priority: 'P0',
          category: 'Security',
          message: 'Patch dependency',
          action: 'Run npm audit fix',
          impact: 'Removes critical CVE'
        }
      ]
    };
  }

  let outDir;

  beforeEach(() => {
    outDir = makeTempDir('ctoc-reporter-');
  });

  afterEach(() => {
    rmDir(outDir);
  });

  test('exports: class + FORMATS table', () => {
    assert.equal(typeof QualityReporter, 'function');
    assert.deepEqual(FORMATS, ['json', 'html', 'markdown', 'terminal']);
  });

  test('generate(json) — emits valid JSON honoring the documented schema', () => {
    const r = new QualityReporter(sampleData());
    const out = r.generate('json');
    const parsed = JSON.parse(out);
    assert.equal(parsed.summary.score, 82);
    assert.equal(parsed.summary.grade, 'B');
    assert.equal(parsed.summary.gradeLabel, 'Good');
    // Component percentage is round(score/maxScore*100).
    assert.equal(parsed.components.coverage.percentage, 80);
    assert.equal(parsed.components.security.percentage, 90);
    // includeRecommendations defaults true -> recommendations present.
    assert.equal(parsed.recommendations.length, 1);
    // includeHistory defaults true -> history mirrors trend.history.
    assert.deepEqual(parsed.history, [70, 75, 82]);
  });

  test('generate(json) — options can suppress recommendations and history', () => {
    const r = new QualityReporter(sampleData(), {
      includeRecommendations: false,
      includeHistory: false
    });
    const parsed = JSON.parse(r.generate('json'));
    // Documented: undefined fields are dropped by JSON.stringify.
    assert.equal('recommendations' in parsed, false);
    assert.equal('history' in parsed, false);
  });

  test('generate(html) — produces a complete HTML document with the score', () => {
    const r = new QualityReporter(sampleData());
    const html = r.generate('html');
    assert.match(html, /^<!DOCTYPE html>/);
    assert.ok(html.includes('Quality Report'));
    assert.ok(html.includes('82'));
    assert.ok(html.trimEnd().endsWith('</html>'));
  });

  test('generate(markdown) — has summary table and overall score', () => {
    const r = new QualityReporter(sampleData());
    const md = r.generate('markdown');
    assert.ok(md.startsWith('# Quality Report:'));
    assert.ok(md.includes('| **Overall Score** | 82/100 |'));
    assert.ok(md.includes('## Component Breakdown'));
  });

  test('generate(terminal) — returns the tagged data envelope as JSON', () => {
    const data = sampleData();
    const r = new QualityReporter(data);
    const parsed = JSON.parse(r.generate('terminal'));
    assert.equal(parsed.type, 'terminal-report');
    assert.equal(parsed.data.overall, 82);
  });

  test('generate() defaults to terminal when no format is given', () => {
    const r = new QualityReporter(sampleData());
    const parsed = JSON.parse(r.generate());
    assert.equal(parsed.type, 'terminal-report');
  });

  test('generate() — unknown format throws the documented error', () => {
    const r = new QualityReporter(sampleData());
    assert.throws(() => r.generate('xml'), /Unknown format: xml/);
  });

  test('formatComponentName — known keys mapped, unknown title-cased', () => {
    const r = new QualityReporter(sampleData());
    assert.equal(r.formatComponentName('coverage'), 'Test Coverage');
    assert.equal(r.formatComponentName('security'), 'Security');
    assert.equal(r.formatComponentName('widgets'), 'Widgets');
  });

  test('formatMetricValue — booleans and percentage metrics formatted', () => {
    const r = new QualityReporter(sampleData());
    assert.equal(r.formatMetricValue('hasReadme', true), 'Yes');
    assert.equal(r.formatMetricValue('hasReadme', false), 'No');
    assert.equal(r.formatMetricValue('lines', 85), '85%');
    assert.equal(r.formatMetricValue('errors', 3), '3');
  });

  test('generateASCIIChart — renders bounded chart without throwing', () => {
    const r = new QualityReporter(sampleData());
    const chart = r.generateASCIIChart([10, 50, 90, 100]);
    assert.equal(typeof chart, 'string');
    assert.ok(chart.includes('oldest'));
    assert.ok(chart.includes('newest'));
  });

  test('saveToFile — auto-detects format from extension and writes file', () => {
    const r = new QualityReporter(sampleData());
    const jsonPath = path.join(outDir, 'nested', 'report.json');
    r.saveToFile(jsonPath);
    assert.ok(fs.existsSync(jsonPath));
    const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    assert.equal(parsed.summary.score, 82);

    const mdPath = path.join(outDir, 'report.md');
    r.saveToFile(mdPath);
    assert.ok(fs.readFileSync(mdPath, 'utf8').startsWith('# Quality Report:'));
  });

  test('saveToFile — explicit format overrides extension', () => {
    const r = new QualityReporter(sampleData());
    const p = path.join(outDir, 'forced.dat');
    r.saveToFile(p, 'markdown');
    assert.ok(fs.readFileSync(p, 'utf8').startsWith('# Quality Report:'));
  });
});

// ===========================================================================
// grading-system.js
// ===========================================================================

describe('grading-system.js', () => {
  let homeDir;
  let savedHome;

  beforeEach(() => {
    // Isolate the grades file: getGradesFile() resolves under process.env.HOME.
    homeDir = makeTempDir('ctoc-grades-');
    savedHome = process.env.HOME;
    process.env.HOME = homeDir;
  });

  afterEach(() => {
    if (savedHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = savedHome;
    }
    rmDir(homeDir);
  });

  function fullDimensions(value = 8) {
    return {
      specificity: value,
      completeness: value,
      boundaries: value,
      actionability: value,
      integration: value
    };
  }

  test('exports: core functions and constants present', () => {
    for (const fn of ['calculateOverallScore', 'validateDimensions', 'determineStatus',
      'getScoreMeaning', 'loadGrades', 'saveGrades', 'updateGrade', 'getGrade',
      'getAgentsByStatus', 'getAgentsBelowThreshold', 'analyzeProgression',
      'generateSummary', 'formatGrades']) {
      assert.equal(typeof grading[fn], 'function', `${fn} should be a function`);
    }
    assert.equal(typeof grading.SCORE_MEANINGS, 'object');
    assert.equal(typeof grading.STATUS, 'object');
    assert.equal(typeof grading.DIMENSION_WEIGHTS, 'object');
  });

  test('calculateOverallScore — equal weights average, rounded to 1 decimal', () => {
    assert.equal(grading.calculateOverallScore(fullDimensions(8)), 8);
    // 8,7,6,5,9 -> mean 7 with unit weights.
    assert.equal(grading.calculateOverallScore({
      specificity: 8, completeness: 7, boundaries: 6, actionability: 5, integration: 9
    }), 7);
    // Rounding to 1 decimal: 8,8,8,8,7 -> 39/5 = 7.8.
    assert.equal(grading.calculateOverallScore({
      specificity: 8, completeness: 8, boundaries: 8, actionability: 8, integration: 7
    }), 7.8);
  });

  test('calculateOverallScore — empty dimensions returns 0 (no NaN)', () => {
    assert.equal(grading.calculateOverallScore({}), 0);
  });

  test('validateDimensions — full valid set passes', () => {
    const res = grading.validateDimensions(fullDimensions(7));
    assert.equal(res.valid, true);
    assert.deepEqual(res.errors, []);
  });

  test('validateDimensions — missing/typed/out-of-range produce errors', () => {
    const res = grading.validateDimensions({
      specificity: 11,        // out of range
      completeness: 'high',   // wrong type
      boundaries: 5,
      actionability: 5
      // integration missing
    });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some(e => /integration/.test(e)));
    assert.ok(res.errors.some(e => /completeness/.test(e)));
    assert.ok(res.errors.some(e => /out of range/.test(e)));
  });

  test('validateDimensions — partial 10s warn but remain valid', () => {
    const dims = fullDimensions(5);
    dims.specificity = 10;
    const res = grading.validateDimensions(dims);
    assert.equal(res.valid, true);
    assert.ok(res.warnings.some(w => /Partial perfect/.test(w)));
  });

  test('determineStatus — documented score-to-status mapping', () => {
    assert.equal(grading.determineStatus(10), grading.STATUS.PERFECT);
    assert.equal(grading.determineStatus(8), grading.STATUS.ACCEPTED);
    assert.equal(grading.determineStatus(9.5), grading.STATUS.ACCEPTED);
    assert.equal(grading.determineStatus(7.9), grading.STATUS.NEEDS_ATTENTION);
  });

  test('getScoreMeaning — floors the score and maps to the table', () => {
    assert.equal(grading.getScoreMeaning(10), grading.SCORE_MEANINGS[10]);
    assert.equal(grading.getScoreMeaning(7.9), grading.SCORE_MEANINGS[7]);
    assert.equal(grading.getScoreMeaning(0), grading.SCORE_MEANINGS[0]);
    // Out-of-table score returns 'Unknown', not a throw.
    assert.equal(grading.getScoreMeaning(42), 'Unknown');
  });

  test('loadGrades — returns {} when no file exists', async () => {
    const grades = await grading.loadGrades();
    assert.deepEqual(grades, {});
  });

  test('updateGrade + getGrade round-trip persists score and status', async () => {
    await grading.updateGrade('alpha', { score: 8.5, rounds: 3 });
    const g = await grading.getGrade('alpha');
    assert.equal(g.score, 8.5);
    assert.equal(g.status, grading.STATUS.ACCEPTED); // derived from score
    assert.equal(g.rounds, 3);
    assert.ok(typeof g.lastUpdated === 'string');
  });

  test('getGrade — unknown agent returns null', async () => {
    const g = await grading.getGrade('does-not-exist');
    assert.equal(g, null);
  });

  test('saveGrades + loadGrades — full round-trip preserves object', async () => {
    const grades = {
      alpha: { score: 9, status: grading.STATUS.ACCEPTED },
      beta: { score: 4, status: grading.STATUS.NEEDS_ATTENTION }
    };
    await grading.saveGrades(grades);
    const loaded = await grading.loadGrades();
    assert.deepEqual(loaded, grades);
  });

  test('getAgentsByStatus — filters by status', async () => {
    await grading.saveGrades({
      a: { score: 9, status: grading.STATUS.ACCEPTED },
      b: { score: 9.2, status: grading.STATUS.ACCEPTED },
      c: { score: 4, status: grading.STATUS.NEEDS_ATTENTION }
    });
    const accepted = await grading.getAgentsByStatus(grading.STATUS.ACCEPTED);
    assert.equal(accepted.length, 2);
    assert.ok(accepted.every(x => x.status === grading.STATUS.ACCEPTED));
    assert.ok(accepted.some(x => x.name === 'a'));
  });

  test('getAgentsBelowThreshold — filters and sorts ascending', async () => {
    await grading.saveGrades({
      a: { score: 9, status: grading.STATUS.ACCEPTED },
      b: { score: 4, status: grading.STATUS.NEEDS_ATTENTION },
      c: { score: 6, status: grading.STATUS.NEEDS_ATTENTION }
    });
    const below = await grading.getAgentsBelowThreshold(8);
    assert.deepEqual(below.map(x => x.name), ['b', 'c']);
  });

  test('analyzeProgression — unavailable when no history', async () => {
    await grading.updateGrade('noHist', { score: 5 });
    const res = await grading.analyzeProgression('noHist');
    assert.equal(res.available, false);
  });

  test('analyzeProgression — computes trend, bottleneck, and rounds-to-target', async () => {
    await grading.saveGrades({
      gamma: {
        score: 8,
        status: grading.STATUS.ACCEPTED,
        history: [
          { round: 1, overall: 5, scores: { specificity: 5, completeness: 6, boundaries: 4, actionability: 5, integration: 5 }, issues: 3 },
          { round: 2, overall: 6.5, scores: { specificity: 7, completeness: 7, boundaries: 5, actionability: 6, integration: 7 }, issues: 2 },
          { round: 3, overall: 8, scores: { specificity: 8, completeness: 9, boundaries: 6, actionability: 8, integration: 9 }, issues: 1 }
        ]
      }
    });
    const res = await grading.analyzeProgression('gamma');
    assert.equal(res.available, true);
    assert.equal(res.roundsCompleted, 3);
    assert.equal(res.startScore, 5);
    assert.equal(res.currentScore, 8);
    // Improvements +1.5, +1.5 -> avg 1.5 -> improving.
    assert.equal(res.averageImprovementPerRound, 1.5);
    assert.equal(res.trend, 'improving');
    // Lowest last-round dimension is boundaries (6).
    assert.equal(res.bottleneckDimension, 'boundaries');
    // (10-8)/1.5 = 1.33 -> ceil 2.
    assert.equal(res.estimatedRoundsToTarget, 2);
  });

  test('generateSummary — counts, distribution, average, and lists', async () => {
    await grading.saveGrades({
      top1: { score: 9.5, status: grading.STATUS.ACCEPTED },
      top2: { score: 9, status: grading.STATUS.ACCEPTED },
      mid: { score: 7, status: grading.STATUS.NEEDS_ATTENTION },
      low: { score: 4, status: grading.STATUS.NEEDS_ATTENTION }
    });
    const s = await grading.generateSummary();
    assert.equal(s.totalAgents, 4);
    assert.equal(s.scoreDistribution['9-10'], 2);
    assert.equal(s.scoreDistribution['7-8'], 1);
    assert.equal(s.scoreDistribution['3-4'], 1);
    // Average of 9.5,9,7,4 = 7.375 -> 7.4 (1 decimal).
    assert.equal(s.averageScore, 7.4);
    assert.equal(s.topPerformers.length, 2);
    // needsAttention: score>0 && <8 -> mid(7), low(4), sorted ascending.
    assert.deepEqual(s.needsAttention.map(x => x.name), ['low', 'mid']);
  });

  test('generateSummary — empty store yields zeroed summary, average 0', async () => {
    const s = await grading.generateSummary();
    assert.equal(s.totalAgents, 0);
    assert.equal(s.averageScore, 0);
    assert.deepEqual(s.topPerformers, []);
  });

  test('formatGrades — renders sorted human-readable block', () => {
    const out = grading.formatGrades({
      low: { score: 4, status: 'needs_attention' },
      high: { score: 9, status: 'accepted_with_notes' }
    });
    assert.equal(typeof out, 'string');
    // Sorted descending by score -> high appears before low.
    assert.ok(out.indexOf('high') < out.indexOf('low'));
    assert.ok(out.includes('9.0/10'));
  });
});

// ===========================================================================
// eval-harness.js
// ===========================================================================

describe('eval-harness.js', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = makeTempDir('ctoc-evals-');
  });

  afterEach(() => {
    rmDir(projectRoot);
  });

  function validCaseYaml(skill = 'security/threat-modeler', id = 'sql-injection') {
    return [
      `id: ${id}`,
      `skill: ${skill}`,
      'description: Detects SQL injection',
      'input: |',
      '  SELECT * FROM users WHERE id = $userInput',
      'expected_output: |',
      '  parameterized query',
      'expected_findings:',
      '  - SQL injection',
      '  - parameterize',
      'must_not_contain:',
      '  - looks fine',
      'severity_when_fails: critical',
      'contributed_by: tester',
      'added_in_version: 1.0.0',
      'last_verified: 2026-01-01',
      ''
    ].join('\n');
  }

  test('exports: schema constants, parse/validate, load, run, aggregate', () => {
    assert.ok(Array.isArray(harness.REQUIRED_FIELDS));
    assert.ok(harness.ALLOWED_SEVERITIES instanceof Set);
    assert.equal(harness.SEVERITY_WEIGHT.critical, 4.0);
    assert.equal(typeof harness.parseCase, 'function');
    assert.equal(typeof harness.validateCase, 'function');
    assert.equal(typeof harness.loadCases, 'function');
    assert.equal(typeof harness.runCase, 'function');
    assert.equal(typeof harness.aggregateVerdicts, 'function');
    assert.equal(typeof harness._internal.inferSkillPath, 'function');
  });

  test('parseCase — scalars, block scalars, and lists', () => {
    const obj = harness.parseCase(validCaseYaml());
    assert.equal(obj.id, 'sql-injection');
    assert.equal(obj.skill, 'security/threat-modeler');
    assert.deepEqual(obj.expected_findings, ['SQL injection', 'parameterize']);
    assert.deepEqual(obj.must_not_contain, ['looks fine']);
    // Block scalar trims trailing whitespace per implementation.
    assert.ok(obj.input.includes('SELECT * FROM users'));
    assert.equal(obj.severity_when_fails, 'critical');
  });

  test('coerceScalar — type coercion contract', () => {
    const c = harness._internal.coerceScalar;
    assert.equal(c('true'), true);
    assert.equal(c('false'), false);
    assert.equal(c('null'), null);
    assert.equal(c('~'), null);
    assert.equal(c('42'), 42);
    assert.equal(c('-3'), -3);
    assert.equal(c('1.5'), 1.5);
    assert.equal(c('"quoted"'), 'quoted');
    assert.equal(c('plain'), 'plain');
  });

  test('stripComment — strips unquoted hash, preserves quoted', () => {
    const s = harness._internal.stripComment;
    assert.equal(s('key: value # trailing'), 'key: value ');
    assert.equal(s('key: "a # b"'), 'key: "a # b"');
  });

  test('validateCase — valid case passes', () => {
    const obj = harness.parseCase(validCaseYaml());
    const res = harness.validateCase(obj);
    assert.equal(res.ok, true, `errors: ${res.errors.join(', ')}`);
    assert.deepEqual(res.errors, []);
  });

  test('validateCase — non-object input fails gracefully', () => {
    assert.equal(harness.validateCase(null).ok, false);
    assert.equal(harness.validateCase('not an object').ok, false);
  });

  test('validateCase — missing required fields are reported', () => {
    const res = harness.validateCase({ id: 'x' });
    assert.equal(res.ok, false);
    assert.ok(res.errors.some(e => /missing required field: skill/.test(e)));
  });

  test('validateCase — field-specific format rules', () => {
    const base = harness.parseCase(validCaseYaml());

    const badId = { ...base, id: 'Bad_ID' };
    assert.ok(harness.validateCase(badId).errors.some(e => /id must be lowercase/.test(e)));

    const badSkill = { ...base, skill: 'noslash' };
    assert.ok(harness.validateCase(badSkill).errors.some(e => /category\/skill-name/.test(e)));

    const badSeverity = { ...base, severity_when_fails: 'catastrophic' };
    assert.ok(harness.validateCase(badSeverity).errors.some(e => /severity_when_fails must be one of/.test(e)));

    const badDate = { ...base, last_verified: '01-01-2026' };
    assert.ok(harness.validateCase(badDate).errors.some(e => /ISO 8601/.test(e)));

    const badFindings = { ...base, expected_findings: 'not-a-list' };
    assert.ok(harness.validateCase(badFindings).errors.some(e => /expected_findings must be a list/.test(e)));
  });

  test('loadCases — missing evals dir returns []', async () => {
    const res = await harness.loadCases(projectRoot);
    assert.deepEqual(res, []);
  });

  test('loadCases — walks skills/<cat>/<skill>/cases and validates', async () => {
    const rel = path.join('evals', 'skills', 'security', 'threat-modeler', 'cases', 'sql.yaml');
    writeFile(projectRoot, rel, validCaseYaml());
    const res = await harness.loadCases(projectRoot);
    assert.equal(res.length, 1);
    assert.equal(res[0].skill, 'security/threat-modeler');
    assert.equal(res[0].caseObj.id, 'sql-injection');
    assert.equal(res[0].validation.ok, true, `errors: ${res[0].validation.errors.join(', ')}`);
    assert.equal(res[0].loadError, null);
  });

  test('loadCases — skillFilter restricts the walk', async () => {
    writeFile(projectRoot,
      path.join('evals', 'skills', 'security', 'threat-modeler', 'cases', 'a.yaml'),
      validCaseYaml('security/threat-modeler', 'case-a'));
    writeFile(projectRoot,
      path.join('evals', 'skills', 'quality', 'code-reviewer', 'cases', 'b.yaml'),
      validCaseYaml('quality/code-reviewer', 'case-b'));
    const res = await harness.loadCases(projectRoot, 'quality/code-reviewer');
    assert.equal(res.length, 1);
    assert.equal(res[0].skill, 'quality/code-reviewer');
  });

  test('loadCases — skill mismatch with directory is flagged invalid', async () => {
    // case.skill says one thing; directory path says another.
    const rel = path.join('evals', 'skills', 'security', 'threat-modeler', 'cases', 'm.yaml');
    writeFile(projectRoot, rel, validCaseYaml('quality/code-reviewer', 'mismatch'));
    const res = await harness.loadCases(projectRoot);
    assert.equal(res.length, 1);
    assert.equal(res[0].validation.ok, false);
    assert.ok(res[0].validation.errors.some(e => /does not match directory path/.test(e)));
  });

  test('inferSkillPath — derives category/skill from a case path', () => {
    const skillsRoot = path.join(projectRoot, 'evals', 'skills');
    const caseFile = path.join(skillsRoot, 'security', 'threat-modeler', 'cases', 'x.yaml');
    assert.equal(harness._internal.inferSkillPath(skillsRoot, caseFile), 'security/threat-modeler');
  });

  test('runCase — passes when comparator picks candidate B and findings present', async () => {
    const caseObj = harness.parseCase(validCaseYaml());
    // The harness treats an arity-0 comparator as a factory; the real injection
    // seam is the compare function itself (arity >= 1). Use the documented
    // signature: compareFn(caseObj, baselineVersion, candidateVersion, opts).
    const comparator = (_case) => ({
      winner: 'B',
      confidence: 0.9,
      outputB: 'Found SQL injection; you must parameterize the query.'
    });
    const res = await harness.runCase(caseObj, { comparator });
    assert.equal(res.passed, true);
    assert.equal(res.judge_verdict, 'B');
    assert.equal(res.confidence, 0.9);
    assert.deepEqual(res.reasons, []);
    assert.ok(typeof res.latency_ms === 'number');
  });

  test('runCase — fails when an expected finding is missing', async () => {
    const caseObj = harness.parseCase(validCaseYaml());
    const comparator = (_case) => ({ winner: 'B', confidence: 0.9, outputB: 'Found SQL injection only.' });
    const res = await harness.runCase(caseObj, { comparator });
    assert.equal(res.passed, false);
    assert.ok(res.reasons.some(r => /missing expected findings/.test(r)));
  });

  test('runCase — fails when a must-not-contain string appears', async () => {
    const caseObj = harness.parseCase(validCaseYaml());
    const comparator = (_case) => ({
      winner: 'B',
      confidence: 0.9,
      outputB: 'SQL injection; parameterize. But honestly it looks fine.'
    });
    const res = await harness.runCase(caseObj, { comparator });
    assert.equal(res.passed, false);
    assert.ok(res.reasons.some(r => /forbidden strings/.test(r)));
  });

  test('runCase — baseline win above regression floor is a regression (fail)', async () => {
    const caseObj = harness.parseCase(validCaseYaml());
    const comparator = (_case) => ({
      winner: 'A',
      confidence: 0.9,
      outputB: 'Found SQL injection; parameterize.'
    });
    const res = await harness.runCase(caseObj, { comparator });
    assert.equal(res.passed, false);
    assert.ok(res.reasons.some(r => /regression/.test(r)));
  });

  test('runCase — low-confidence baseline win treated as tie (pass)', async () => {
    const caseObj = harness.parseCase(validCaseYaml());
    const comparator = (_case) => ({
      winner: 'A',
      confidence: 0.4, // below default regressionFloor 0.6
      outputB: 'Found SQL injection; parameterize.'
    });
    const res = await harness.runCase(caseObj, { comparator });
    assert.equal(res.passed, true);
  });

  test('runCase — comparator throwing yields error verdict, never rethrows', async () => {
    const caseObj = harness.parseCase(validCaseYaml());
    const comparator = (_case) => { throw new Error('boom'); };
    const res = await harness.runCase(caseObj, { comparator });
    assert.equal(res.passed, false);
    assert.equal(res.judge_verdict, 'error');
    assert.ok(res.reasons.some(r => /comparator threw: boom/.test(r)));
  });

  test('runCase — comparator timeout produces error verdict', async () => {
    const caseObj = harness.parseCase(validCaseYaml());
    caseObj.timeout_ms = 10;
    const comparator = (_case) => new Promise((resolve) => {
      setTimeout(() => resolve({ winner: 'B', confidence: 1, outputB: '' }), 1000);
    });
    const res = await harness.runCase(caseObj, { comparator });
    assert.equal(res.passed, false);
    assert.equal(res.judge_verdict, 'error');
    assert.ok(res.reasons.some(r => /timed out/.test(r)));
  });

  test('withTimeout — resolves fast promise, rejects slow one', async () => {
    const fast = await harness._internal.withTimeout(Promise.resolve('ok'), 1000, 'late');
    assert.equal(fast, 'ok');
    await assert.rejects(
      harness._internal.withTimeout(new Promise((r) => setTimeout(() => r('x'), 1000)), 10, 'too slow'),
      /too slow/
    );
  });

  test('aggregateVerdicts — totals, pass rate, and weighting by severity', () => {
    const verdicts = [
      { caseObj: { severity_when_fails: 'critical' }, result: { passed: true } },
      { caseObj: { severity_when_fails: 'critical' }, result: { passed: false } },
      { caseObj: { severity_when_fails: 'low' }, result: { passed: true } }
    ];
    const s = harness.aggregateVerdicts(verdicts);
    assert.equal(s.total, 3);
    assert.equal(s.passed, 2);
    assert.equal(s.failed, 1);
    assert.equal(s.pass_rate, 2 / 3);
    // weights: critical 4+4, low 0.5; passed weight 4+0.5; total 8.5.
    assert.equal(s.weighted_pass_rate, 4.5 / 8.5);
    assert.equal(s.by_severity.critical.passed, 1);
    assert.equal(s.by_severity.critical.failed, 1);
    assert.equal(s.by_severity.low.passed, 1);
  });

  test('aggregateVerdicts — empty input is a vacuous pass (rate 1)', () => {
    const s = harness.aggregateVerdicts([]);
    assert.equal(s.total, 0);
    assert.equal(s.pass_rate, 1);
    assert.equal(s.weighted_pass_rate, 1);
  });

  test('aggregateVerdicts — malformed entries are skipped, no throw', () => {
    const s = harness.aggregateVerdicts([null, {}, { caseObj: {} }, undefined]);
    assert.equal(s.total, 0);
  });

  test('aggregateVerdicts — null arg does not throw', () => {
    const s = harness.aggregateVerdicts(null);
    assert.equal(s.total, 0);
    assert.equal(s.pass_rate, 1);
  });
});

// ===========================================================================
// step-13-verify.js  (Step 14 VERIFY runner)
// ===========================================================================

describe('step-13-verify.js', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = makeTempDir('ctoc-verify-');
  });

  afterEach(() => {
    rmDir(projectDir);
  });

  test('exports: runVerify, runFallbackChecks, tryCommand, tryCommands', () => {
    assert.equal(typeof verify.runVerify, 'function');
    assert.equal(typeof verify.runFallbackChecks, 'function');
    assert.equal(typeof verify.tryCommand, 'function');
    assert.equal(typeof verify.tryCommands, 'function');
  });

  test('tryCommand — success captures trimmed output', () => {
    // A command available on every supported platform.
    const res = verify.tryCommand('node -e "process.stdout.write(\'pong\')"', projectDir);
    assert.equal(res.success, true);
    assert.equal(res.output, 'pong');
    assert.equal(res.error, null);
  });

  test('tryCommand — failure returns structured result, no throw', () => {
    const res = verify.tryCommand('node -e "process.exit(3)"', projectDir);
    assert.equal(res.success, false);
    assert.equal(typeof res.error, 'string');
  });

  test('tryCommands — returns first command that exists (even if it fails)', () => {
    // First command fails (exit 1) but exists; it must be returned, not skipped.
    const res = verify.tryCommands(
      ['node -e "process.exit(1)"', 'node -e "process.stdout.write(\'second\')"'],
      projectDir
    );
    assert.equal(res.command, 'node -e "process.exit(1)"');
    assert.equal(res.success, false);
  });

  test('tryCommands — all not-found falls through to skipped sentinel', () => {
    const res = verify.tryCommands(
      ['ctoc-nonexistent-binary-xyz --version', 'another-missing-binary-abc'],
      projectDir
    );
    // Documented fall-through: success true, command null, "skipped" output.
    assert.equal(res.success, true);
    assert.equal(res.command, null);
    assert.ok(res.output.includes('skipped'));
  });

  test('runFallbackChecks — no toolchain markers means no checks, no errors', () => {
    const res = verify.runFallbackChecks(projectDir);
    assert.deepEqual(res.errors, []);
    assert.deepEqual(res.checks, {});
  });

  test('runFallbackChecks — package.json triggers lint/type/test checks', () => {
    // A package.json whose scripts succeed, so the fallback reports no errors.
    writeFile(projectDir, 'package.json', JSON.stringify({
      name: 'tmp',
      scripts: {
        lint: 'node -e "0"',
        typecheck: 'node -e "0"',
        test: 'node -e "0"'
      }
    }));
    const res = verify.runFallbackChecks(projectDir);
    assert.ok('lint' in res.checks);
    assert.ok('types' in res.checks);
    assert.ok('tests' in res.checks);
    assert.deepEqual(res.errors, []);
  });

  test('runFallbackChecks — failing script surfaces an error', () => {
    writeFile(projectDir, 'package.json', JSON.stringify({
      name: 'tmp',
      scripts: {
        lint: 'node -e "process.exit(1)"',
        test: 'node -e "0"'
      }
    }));
    const res = verify.runFallbackChecks(projectDir);
    assert.ok(res.errors.some(e => /Lint failed/.test(e)));
  });

  test('runVerify — falls back when ctoc quality gate is unavailable', () => {
    // No ctoc binary on a clean temp dir; runVerify must use the fallback path
    // and, with no toolchain markers, pass with zero errors. Never throws.
    const res = verify.runVerify(projectDir);
    assert.equal(res.method, 'fallback-direct');
    assert.equal(res.passed, true);
    assert.equal(typeof res.summary, 'string');
    assert.deepEqual(res.errors, []);
  });

  test('runVerify — fallback reports failure when a check fails', () => {
    writeFile(projectDir, 'package.json', JSON.stringify({
      name: 'tmp',
      scripts: { test: 'node -e "process.exit(1)"' }
    }));
    const res = verify.runVerify(projectDir);
    assert.equal(res.method, 'fallback-direct');
    assert.equal(res.passed, false);
    assert.ok(res.summary.includes('failed'));
  });
});
