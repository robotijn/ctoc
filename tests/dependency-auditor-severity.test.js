/**
 * DependencyAuditor severity mapping — the under-report fence.
 *
 * `mapPipSeverity` is annotated as taking a numeric CVSS score and bands it
 * numerically (>= 9.0 / 7.0 / 4.0). pip-audit's `vulns[].severity` field is NOT
 * guaranteed numeric — advisory sources also emit string labels ("HIGH",
 * "critical"). Against a string every band comparison is NaN-false, so a CRITICAL
 * advisory silently returned LOW: a severity UNDER-REPORT in a security path,
 * which is exactly how a blocking finding becomes a non-blocking one.
 *
 * The rule these tests fence: NEVER under-report. A severity that cannot be
 * understood maps to MODERATE (the documented unknown default) — never LOW, and
 * never a value below the one the source actually stated.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { DependencyAuditor, SEVERITY } = require(
  path.join(__dirname, '..', 'src', 'lib', 'dependency-auditor.js')
);

const auditor = () => new DependencyAuditor(__dirname);

test('mapPipSeverity: numeric CVSS scores band correctly', () => {
  const a = auditor();
  assert.strictEqual(a.mapPipSeverity(10), SEVERITY.CRITICAL);
  assert.strictEqual(a.mapPipSeverity(9.0), SEVERITY.CRITICAL);
  assert.strictEqual(a.mapPipSeverity(8.9), SEVERITY.HIGH);
  assert.strictEqual(a.mapPipSeverity(7.0), SEVERITY.HIGH);
  assert.strictEqual(a.mapPipSeverity(6.9), SEVERITY.MODERATE);
  assert.strictEqual(a.mapPipSeverity(4.0), SEVERITY.MODERATE);
  assert.strictEqual(a.mapPipSeverity(3.9), SEVERITY.LOW);
  assert.strictEqual(a.mapPipSeverity(0.1), SEVERITY.LOW);
});

test('mapPipSeverity: STRING labels are honored, never silently downgraded', () => {
  const a = auditor();
  assert.strictEqual(a.mapPipSeverity('CRITICAL'), SEVERITY.CRITICAL);
  assert.strictEqual(a.mapPipSeverity('critical'), SEVERITY.CRITICAL);
  assert.strictEqual(a.mapPipSeverity('HIGH'), SEVERITY.HIGH);
  assert.strictEqual(a.mapPipSeverity('high'), SEVERITY.HIGH);
  assert.strictEqual(a.mapPipSeverity('MODERATE'), SEVERITY.MODERATE);
  assert.strictEqual(a.mapPipSeverity('medium'), SEVERITY.MODERATE);
  assert.strictEqual(a.mapPipSeverity('LOW'), SEVERITY.LOW);
  assert.strictEqual(a.mapPipSeverity('INFO'), SEVERITY.INFO);
});

test('mapPipSeverity: numeric STRINGS ("9.8") band as scores, not as unknowns', () => {
  const a = auditor();
  assert.strictEqual(a.mapPipSeverity('9.8'), SEVERITY.CRITICAL);
  assert.strictEqual(a.mapPipSeverity('7.5'), SEVERITY.HIGH);
  assert.strictEqual(a.mapPipSeverity('5.0'), SEVERITY.MODERATE);
  assert.strictEqual(a.mapPipSeverity('2.0'), SEVERITY.LOW);
});

test('mapPipSeverity: unknown / absent severity defaults to MODERATE, never LOW', () => {
  const a = auditor();
  for (const v of [undefined, null, '', 'whatever', {}, NaN]) {
    assert.strictEqual(
      a.mapPipSeverity(/** @type {any} */ (v)), SEVERITY.MODERATE,
      `unknown severity ${JSON.stringify(v)} must default to MODERATE (no under-report)`
    );
  }
});

test('parsePipAuditResults: a string-labelled CRITICAL advisory stays CRITICAL', () => {
  const a = auditor();
  a.parsePipAuditResults([
    {
      name: 'evil-pkg',
      version: '1.0.0',
      vulns: [{
        id: 'PYSEC-2026-1',
        severity: 'CRITICAL',
        description: 'remote code execution',
        aliases: ['CVE-2026-0001'],
        link: 'https://example.invalid/advisory',
        fix_versions: ['1.0.1']
      }]
    }
  ]);

  assert.strictEqual(a.vulnerabilities.length, 1);
  const v = a.vulnerabilities[0];
  assert.strictEqual(
    v.severity, SEVERITY.CRITICAL,
    'a CRITICAL pip advisory must NEVER be reported as LOW — that is a silent security under-report'
  );
  assert.strictEqual(v.cve, 'CVE-2026-0001');
  assert.strictEqual(v.package, 'evil-pkg');
});

test('mapGoSeverity: string labels are honored too (same class of bug)', () => {
  const a = auditor();
  assert.strictEqual(a.mapGoSeverity(9.5), SEVERITY.CRITICAL);
  assert.strictEqual(a.mapGoSeverity('HIGH'), SEVERITY.HIGH);
  assert.strictEqual(a.mapGoSeverity('critical'), SEVERITY.CRITICAL);
  assert.strictEqual(a.mapGoSeverity(undefined), SEVERITY.MODERATE);
});
