/**
 * Review Reporter Tests
 * Tests for generating review reports
 */

const assert = require('assert');
const { test, describe, beforeEach } = require('node:test');

let reviewReporter;

describe('Review Reporter Tests', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../src/lib/review-reporter.js')];
    try {
      reviewReporter = require('../src/lib/review-reporter.js');
    } catch (e) {
      reviewReporter = null;
    }
  });

  test('generateCombinedReport produces valid markdown', (t) => {
    if (!reviewReporter) {
      t.skip('Module not implemented yet');
      return;
    }
    const report = reviewReporter.generateCombinedReport({
      planName: 'test-plan',
      reviewerAssessment: {
        qualityScore: 8,
        criteria: { requirementsMet: 8, testCoverage: 9 },
        issues: [],
        verdict: 'APPROVE'
      },
      ctoAssessment: {
        strategicScore: 9,
        criteria: { businessAlignment: 9, security: 10 },
        concerns: [],
        verdict: 'APPROVE'
      }
    });
    assert.ok(typeof report === 'string', 'Should return string');
    assert.ok(report.includes('test-plan'), 'Should include plan name');
    assert.ok(report.includes('#'), 'Should have markdown headers');
    console.log('# generateCombinedReport produces valid markdown');
  });

  test('generateCombinedReport includes both reviewer sections', (t) => {
    if (!reviewReporter) {
      t.skip('Module not implemented yet');
      return;
    }
    const report = reviewReporter.generateCombinedReport({
      planName: 'test',
      reviewerAssessment: {
        qualityScore: 8,
        criteria: {},
        issues: [],
        verdict: 'APPROVE'
      },
      ctoAssessment: {
        strategicScore: 9,
        criteria: {},
        concerns: [],
        verdict: 'APPROVE'
      }
    });
    assert.ok(report.includes('Code Reviewer') || report.includes('Reviewer'), 'Should include reviewer section');
    assert.ok(report.includes('CTO'), 'Should include CTO section');
    console.log('# generateCombinedReport includes both reviewer sections');
  });

  test('determineCombinedVerdict returns REJECT if either reviewer REJECT', (t) => {
    if (!reviewReporter) {
      t.skip('Module not implemented yet');
      return;
    }
    const result1 = reviewReporter.determineCombinedVerdict('REJECT', 'APPROVE');
    assert.strictEqual(result1, 'REJECT', 'Reviewer REJECT should result in REJECT');

    const result2 = reviewReporter.determineCombinedVerdict('APPROVE', 'REJECT');
    assert.strictEqual(result2, 'REJECT', 'CTO REJECT should result in REJECT');
    console.log('# determineCombinedVerdict returns REJECT if either reviewer REJECT');
  });

  test('determineCombinedVerdict returns APPROVE only if both APPROVE', (t) => {
    if (!reviewReporter) {
      t.skip('Module not implemented yet');
      return;
    }
    const result = reviewReporter.determineCombinedVerdict('APPROVE', 'APPROVE');
    assert.strictEqual(result, 'APPROVE', 'Both APPROVE should result in APPROVE');
    console.log('# determineCombinedVerdict returns APPROVE only if both APPROVE');
  });

  test('determineCombinedVerdict returns NEEDS_WORK for mixed verdicts', (t) => {
    if (!reviewReporter) {
      t.skip('Module not implemented yet');
      return;
    }
    const result1 = reviewReporter.determineCombinedVerdict('APPROVE', 'NEEDS_WORK');
    assert.strictEqual(result1, 'NEEDS_WORK', 'Mixed should be NEEDS_WORK');

    const result2 = reviewReporter.determineCombinedVerdict('NEEDS_WORK', 'APPROVE');
    assert.strictEqual(result2, 'NEEDS_WORK', 'Mixed should be NEEDS_WORK');
    console.log('# determineCombinedVerdict returns NEEDS_WORK for mixed verdicts');
  });

  test('appendReportToPlan removes existing report before adding new', (t) => {
    if (!reviewReporter) {
      t.skip('Module not implemented yet');
      return;
    }
    const originalContent = '# Plan\n\nContent here.\n\n## Review Report\n\nOld report\n';
    const newReport = '## Review Report\n\nNew report\n';
    const result = reviewReporter.appendReportToPlan(originalContent, newReport);
    assert.ok(!result.includes('Old report'), 'Should remove old report');
    assert.ok(result.includes('New report'), 'Should include new report');
    console.log('# appendReportToPlan removes existing report before adding new');
  });

  test('appendReportToPlan preserves plan content above report', (t) => {
    if (!reviewReporter) {
      t.skip('Module not implemented yet');
      return;
    }
    const originalContent = '# Plan\n\nContent here.\n';
    const newReport = '## Review Report\n\nReport content\n';
    const result = reviewReporter.appendReportToPlan(originalContent, newReport);
    assert.ok(result.includes('# Plan'), 'Should preserve plan header');
    assert.ok(result.includes('Content here'), 'Should preserve plan content');
    console.log('# appendReportToPlan preserves plan content above report');
  });

  test('VERDICT constants have correct values', (t) => {
    if (!reviewReporter) {
      t.skip('Module not implemented yet');
      return;
    }
    assert.ok(reviewReporter.VERDICT, 'Should export VERDICT constants');
    assert.strictEqual(reviewReporter.VERDICT.APPROVE, 'APPROVE');
    assert.strictEqual(reviewReporter.VERDICT.REJECT, 'REJECT');
    assert.strictEqual(reviewReporter.VERDICT.NEEDS_WORK, 'NEEDS_WORK');
    console.log('# VERDICT constants have correct values');
  });

  test('edge case: missing criteria fields (should not crash)', (t) => {
    if (!reviewReporter) {
      t.skip('Module not implemented yet');
      return;
    }
    const report = reviewReporter.generateCombinedReport({
      planName: 'test',
      reviewerAssessment: {
        qualityScore: 8,
        // criteria missing
        verdict: 'APPROVE'
      },
      ctoAssessment: {
        strategicScore: 9,
        // criteria missing
        verdict: 'APPROVE'
      }
    });
    assert.ok(typeof report === 'string', 'Should handle missing criteria');
    console.log('# edge case: missing criteria fields');
  });

  test('edge case: empty issues/concerns arrays', (t) => {
    if (!reviewReporter) {
      t.skip('Module not implemented yet');
      return;
    }
    const report = reviewReporter.generateCombinedReport({
      planName: 'test',
      reviewerAssessment: {
        qualityScore: 10,
        criteria: {},
        issues: [],
        verdict: 'APPROVE'
      },
      ctoAssessment: {
        strategicScore: 10,
        criteria: {},
        concerns: [],
        verdict: 'APPROVE'
      }
    });
    assert.ok(typeof report === 'string', 'Should handle empty arrays');
    console.log('# edge case: empty issues/concerns arrays');
  });
});

console.log('\nReview Reporter Tests');
console.log('=====================\n');
