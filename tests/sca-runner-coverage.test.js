'use strict';

/**
 * SCA RUNNER — dark-branch coverage (non-obvious paths).
 *
 * Companion to sca-runner.test.js. That suite pins the honesty contract, routing,
 * CVSS-vector banding, F1/F2/F3 dedup and fail-closed run(). This file targets the
 * branches it leaves DARK (measured 90.95% line / 61.06% branch, scoped) — every one
 * chosen to die under mutation of the production line it exercises:
 *
 *   - native scanner EXECUTION + its error/parse-failure paths (npm audit exits
 *     non-zero-with-stdout, empty-stdout, garbage-stdout; likewise cargo audit and
 *     pip-audit) — a scanner that "ran and produced garbage" must be a loud error,
 *     never silence;
 *   - osv-scanner success-path parse FAILURE returns false (not a clean pass);
 *   - mapOSVSeverity's MEDIUM fallback when no severity signal exists;
 *   - deduplicateFindings keeping the HIGHER severity on a collision (the `<` compare);
 *   - the npm v7 all-string-`via` package-level fallback finding;
 *   - run()'s honest deferred-clean no-op message (every ecosystem deferred, osv absent);
 *   - run()'s multi-severity SORT ordering;
 *   - _relToRoot returning an escaping path unchanged;
 *   - _pythonUsesOsvOnlyLock / _jsUsesOsvOnlyLock fail-soft catch (NUL-byte root);
 *   - generateReport's Scan-Errors section.
 *
 * The ONLY thing faked is the tool boundary (cp.execFileSync / cp.execSync), exactly
 * like the sibling suite — never the parsing/severity/dedup core. Real os.tmpdir()
 * fixtures, cleaned in finally.
 *
 * Human-reviewed (Tijn): every assertion was checked to go RED against a trivially
 * wrong implementation of the line it covers.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const SCA_PATH = require.resolve('../src/lib/sca-runner');

const REAL_EXEC = cp.execSync;
const REAL_EXECFILE = cp.execFileSync;

/** Reload sca-runner AFTER installing the current cp fakes — the module destructures
 *  execFileSync at load time, so the fake must be in place before require. */
function freshSCA() {
  delete require.cache[SCA_PATH];
  return require(SCA_PATH);
}

function restore() {
  cp.execSync = REAL_EXEC;
  cp.execFileSync = REAL_EXECFILE;
  delete require.cache[SCA_PATH];
}

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ─────────────────────────────────────────────────────────────────────────────────
// NATIVE npm-audit EXECUTION + error/parse paths (runNativeScanner switch, runNpmAudit).
// run() defers js/ts to DependencyAuditor, so the npm-audit native arm never fires there;
// these drive it directly. A scanner that ran-but-garbled must be a LOUD error, never
// a silent clean pass.
// ─────────────────────────────────────────────────────────────────────────────────

test('runNativeScanner_javascript_runs_npm_audit_and_surfaces_the_finding', async () => {
  // Arrange — npm --version succeeds (tool present); `npm audit --json` returns a report.
  const audit = {
    auditReportVersion: 2,
    vulnerabilities: {
      minimist: {
        name: 'minimist', severity: 'critical',
        via: [{ source: 1179, name: 'minimist', title: 'Prototype Pollution', url: 'u', severity: 'critical', cwe: ['CWE-1321'] }],
        range: '<1.2.6', fixAvailable: true
      }
    }
  };
  cp.execFileSync = (cmd, args) => {
    if (Array.isArray(args) && args.includes('--version')) return '';
    if ((cmd === 'npm' || cmd === 'npm.cmd') && args[0] === 'audit') return JSON.stringify(audit);
    throw new Error(`unexpected exec ${cmd} ${JSON.stringify(args)}`);
  };
  const { SCARunner } = freshSCA();
  const tmp = mkTmp('sca-native-npm-');
  try {
    fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"x","version":"1.0.0"}');
    fs.writeFileSync(path.join(tmp, 'package-lock.json'), '{}'); // keeps the npm-audit native route

    // Act
    const r = new SCARunner(tmp);
    const ok = await r.runNativeScanner('javascript');

    // Assert — the native npm-audit arm executed and produced the finding
    assert.equal(ok, true, 'runNativeScanner returns true when the native tool ran');
    assert.equal(r.findings.length, 1);
    assert.equal(r.findings[0].package, 'minimist');
    assert.equal(r.findings[0].severity, 'CRITICAL');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('runNpmAudit_when_npm_exits_nonzero_with_stdout_json_still_parses_the_report', async () => {
  // Arrange — npm audit exits non-zero (vulns exist) but prints its JSON to stdout on
  // the thrown error object. The report must still be parsed, not discarded.
  const report = JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: { lodash: { name: 'lodash', severity: 'high', via: [{ source: 1065, name: 'lodash', title: 'Prototype Pollution', url: 'u', severity: 'high' }], range: '<4.17.12', fixAvailable: true } }
  });
  cp.execFileSync = () => { const e = new Error('npm audit found vulnerabilities'); e.status = 1; e.stdout = report; throw e; };
  const { SCARunner } = freshSCA();
  const tmp = mkTmp('sca-npm-nonzero-');
  try {
    // Act
    const r = new SCARunner(tmp);
    await r.runNpmAudit();

    // Assert — non-zero-with-stdout is a real report, not a failure
    assert.equal(r.findings.length, 1, 'the JSON carried on the error object must be parsed');
    assert.equal(r.findings[0].package, 'lodash');
    assert.equal(r.errors.length, 0, 'a parsed report is not an error');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('runNpmAudit_when_npm_throws_with_empty_stdout_records_a_loud_error_and_no_finding', async () => {
  // Arrange — the scanner crashed and printed nothing: nothing was audited.
  cp.execFileSync = () => { const e = new Error('spawn npm ENOENT'); e.stdout = ''; throw e; };
  const { SCARunner } = freshSCA();
  const tmp = mkTmp('sca-npm-empty-');
  try {
    // Act
    const r = new SCARunner(tmp);
    await r.runNpmAudit();

    // Assert — a crashed scanner is a recorded error, NEVER a silent clean pass
    assert.equal(r.findings.length, 0);
    assert.equal(r.errors.length, 1, 'empty stdout on crash must be a loud error, not silence');
    assert.equal(r.errors[0].tool, 'npm-audit');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('runNpmAudit_when_npm_returns_unparseable_stdout_records_a_parse_error', async () => {
  // Arrange — the tool ran and returned garbage (not JSON).
  cp.execFileSync = () => 'not json at all {{{';
  const { SCARunner } = freshSCA();
  const tmp = mkTmp('sca-npm-garbage-');
  try {
    // Act
    const r = new SCARunner(tmp);
    await r.runNpmAudit();

    // Assert — garbage output is a loud error, not a clean scan
    assert.equal(r.findings.length, 0);
    assert.equal(r.errors.length, 1, 'unparseable output must surface as an error');
    assert.equal(r.errors[0].tool, 'npm-audit');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────────────────────────────────────────
// NATIVE pip-audit error/parse paths. SCA3 covers the -r success invocation; these
// cover the crash and the parse-failure branches.
// ─────────────────────────────────────────────────────────────────────────────────

test('runPipAudit_when_pip_throws_with_empty_stdout_records_a_loud_error', async () => {
  // Arrange
  cp.execFileSync = () => { const e = new Error('pip-audit crashed'); e.stdout = ''; throw e; };
  const { SCARunner } = freshSCA();
  const tmp = mkTmp('sca-pip-empty-');
  try {
    // Act
    const r = new SCARunner(tmp);
    await r.runPipAudit();

    // Assert
    assert.equal(r.findings.length, 0);
    assert.equal(r.errors.length, 1, 'a pip-audit crash with empty stdout must be recorded');
    assert.equal(r.errors[0].tool, 'pip-audit');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('runPipAudit_when_pip_returns_unparseable_stdout_records_a_parse_error', async () => {
  // Arrange
  cp.execFileSync = () => '<<< not json >>>';
  const { SCARunner } = freshSCA();
  const tmp = mkTmp('sca-pip-garbage-');
  try {
    // Act
    const r = new SCARunner(tmp);
    await r.runPipAudit();

    // Assert
    assert.equal(r.findings.length, 0);
    assert.equal(r.errors.length, 1, 'unparseable pip-audit output must surface as an error');
    assert.equal(r.errors[0].tool, 'pip-audit');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────────────────────────────────────────
// NATIVE cargo-audit — its whole body is dark in the sibling suite (rust never runs
// through run() there). Drive the switch arm + success + both error paths.
// ─────────────────────────────────────────────────────────────────────────────────

test('runNativeScanner_rust_runs_cargo_audit_and_surfaces_the_finding', async () => {
  // Arrange
  const cargo = { vulnerabilities: { found: true, count: 1, list: [{ advisory: { id: 'RUSTSEC-2020-0159', title: 'segfault', url: 'u' }, package: { name: 'chrono', version: '0.4.10' } }] } };
  cp.execFileSync = (cmd, args) => {
    if (Array.isArray(args) && args.includes('--version')) return '';
    if (cmd === 'cargo' && args[0] === 'audit') return JSON.stringify(cargo);
    throw new Error(`unexpected exec ${cmd} ${JSON.stringify(args)}`);
  };
  const { SCARunner } = freshSCA();
  const tmp = mkTmp('sca-native-cargo-');
  try {
    // Act
    const r = new SCARunner(tmp);
    const ok = await r.runNativeScanner('rust');

    // Assert — the cargo-audit switch arm executed and produced the finding
    assert.equal(ok, true);
    assert.equal(r.findings.length, 1);
    assert.equal(r.findings[0].package, 'chrono');
    assert.equal(r.findings[0].tool, 'cargo-audit');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('runCargoAudit_when_cargo_throws_with_empty_stdout_records_a_loud_error', async () => {
  // Arrange
  cp.execFileSync = () => { const e = new Error('cargo audit crashed'); e.stdout = ''; throw e; };
  const { SCARunner } = freshSCA();
  const tmp = mkTmp('sca-cargo-empty-');
  try {
    // Act
    const r = new SCARunner(tmp);
    await r.runCargoAudit();

    // Assert
    assert.equal(r.findings.length, 0);
    assert.equal(r.errors.length, 1, 'a cargo-audit crash must be recorded, never silent');
    assert.equal(r.errors[0].tool, 'cargo-audit');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('runCargoAudit_when_cargo_returns_unparseable_stdout_records_a_parse_error', async () => {
  // Arrange
  cp.execFileSync = () => 'panic: not json';
  const { SCARunner } = freshSCA();
  const tmp = mkTmp('sca-cargo-garbage-');
  try {
    // Act
    const r = new SCARunner(tmp);
    await r.runCargoAudit();

    // Assert
    assert.equal(r.findings.length, 0);
    assert.equal(r.errors.length, 1, 'unparseable cargo-audit output must surface as an error');
    assert.equal(r.errors[0].tool, 'cargo-audit');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────────────────────────────────────────
// osv-scanner SUCCESS-path parse FAILURE. SCA7 covers the crash-with-empty-stdout
// path; this covers osv exiting 0 with non-JSON stdout → JSON.parse throws → the scan
// must return false (NOT count as a clean pass) and record the error.
// ─────────────────────────────────────────────────────────────────────────────────

test('runOsvScanner_when_osv_returns_unparseable_json_returns_false_and_records_an_error', async () => {
  // Arrange — osv exits 0 but emits garbage (truncated/interleaved output).
  cp.execFileSync = () => 'OSV scan complete (not json)';
  const { SCARunner } = freshSCA();
  const tmp = mkTmp('sca-osv-parsefail-');
  try {
    // Act
    const r = new SCARunner(tmp);
    const ran = await r.runOsvScanner();

    // Assert — a scan that produced unparseable output is NOT a successful scan
    assert.equal(ran, false, 'unparseable osv output must return false, never a clean pass');
    assert.equal(r.errors.length, 1);
    assert.equal(r.errors[0].tool, 'osv-scanner');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────────────────────────────────────────
// mapOSVSeverity — the MEDIUM fallback when a vuln carries NO severity signal at all
// (no database_specific.severity, no severity array). Never fabricate a level.
// ─────────────────────────────────────────────────────────────────────────────────

test('mapOSVSeverity_defaults_to_MEDIUM_when_a_vuln_carries_no_severity_signal', () => {
  // Arrange — a bare vuln: only an id, nothing to derive severity from.
  const r = new (require(SCA_PATH).SCARunner)('/x');

  // Act
  r.parseOSVResults({
    results: [{
      source: { path: '/proj/go.mod', type: 'lockfile' },
      packages: [{ package: { name: 'p', ecosystem: 'Go', version: '1.0.0' }, vulnerabilities: [{ id: 'GHSA-bare' }] }]
    }]
  });

  // Assert
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].severity, 'MEDIUM', 'no signal ⇒ the documented MEDIUM default, not a fabricated level');
});

test('mapOSVSeverity_defaults_to_MEDIUM_when_the_severity_array_is_present_but_empty', () => {
  // Arrange — an explicit empty severity array yields no scores → the same fallback.
  const r = new (require(SCA_PATH).SCARunner)('/x');

  // Act
  r.parseOSVResults({
    results: [{
      source: { path: '/proj/go.mod', type: 'lockfile' },
      packages: [{ package: { name: 'q', ecosystem: 'Go', version: '1.0.0' }, vulnerabilities: [{ id: 'GHSA-empty', severity: [] }] }]
    }]
  });

  // Assert
  assert.equal(r.findings[0].severity, 'MEDIUM', 'an empty severity array must fall through to MEDIUM');
});

// ─────────────────────────────────────────────────────────────────────────────────
// deduplicateFindings — on a (package, advisory) collision it must KEEP THE HIGHER
// severity. The sibling dedupe test uses two equal-severity duplicates, so the
// `order.indexOf(new) < order.indexOf(existing)` replace branch stays dark. Here the
// SECOND finding is more severe and must win.
// ─────────────────────────────────────────────────────────────────────────────────

test('deduplicateFindings_keeps_the_higher_severity_when_a_duplicate_advisory_is_more_severe', () => {
  // Arrange — same package+advisory reported LOW first, then CRITICAL.
  const r = new (require(SCA_PATH).SCARunner)('/x');
  r.findings = [
    { tool: 'osv-scanner', package: 'p', advisory: 'GHSA-x', title: 't', severity: 'LOW' },
    { tool: 'npm-audit', package: 'p', advisory: 'GHSA-x', title: 't', severity: 'CRITICAL' }
  ];

  // Act
  const unique = r.deduplicateFindings();

  // Assert — collapsed to one, keeping the worse severity (kills a "keep-first" mutant)
  assert.equal(unique.length, 1);
  assert.equal(unique[0].severity, 'CRITICAL', 'the collision must retain the HIGHER severity, not the first-seen LOW');
});

test('deduplicateFindings_keeps_the_existing_higher_severity_when_the_duplicate_is_lower', () => {
  // Arrange — the reverse order: CRITICAL first, then LOW. The `<` compare is false, so
  // the existing CRITICAL must be retained (guards the boundary from an inverted compare).
  const r = new (require(SCA_PATH).SCARunner)('/x');
  r.findings = [
    { tool: 'npm-audit', package: 'p', advisory: 'GHSA-x', title: 't', severity: 'CRITICAL' },
    { tool: 'osv-scanner', package: 'p', advisory: 'GHSA-x', title: 't', severity: 'LOW' }
  ];

  // Act
  const unique = r.deduplicateFindings();

  // Assert
  assert.equal(unique.length, 1);
  assert.equal(unique[0].severity, 'CRITICAL', 'a lower-severity duplicate must NOT overwrite the higher-severity original');
});

// ─────────────────────────────────────────────────────────────────────────────────
// parseNpmAuditResults — the npm v7 branch where a vulnerability's `via` entries are
// ALL string references (a transitive advisory). The object-`via` path is covered by
// the sibling suite; the all-string path records a PACKAGE-LEVEL finding so the
// transitive vulnerability is not lost.
// ─────────────────────────────────────────────────────────────────────────────────

test('parseNpmAuditResults_records_a_package_level_finding_when_via_entries_are_all_strings', () => {
  // Arrange — `via` holds only string references (names of other vulnerable packages).
  const r = new (require(SCA_PATH).SCARunner)('/x');

  // Act
  r.parseNpmAuditResults({
    auditReportVersion: 2,
    vulnerabilities: {
      'transitive-pkg': { name: 'transitive-pkg', severity: 'high', via: ['minimist', 'lodash'], range: '*', fixAvailable: false }
    }
  });

  // Assert — a transitive advisory with no object `via` still yields one finding,
  // carrying the package-level severity (kills a mutant that skips string-only entries)
  assert.equal(r.findings.length, 1, 'an all-string via must still record a package-level finding');
  assert.equal(r.findings[0].package, 'transitive-pkg');
  assert.equal(r.findings[0].severity, 'HIGH');
  assert.equal(r.findings[0].advisory, null, 'a string-only via carries no advisory id');
});

// ─────────────────────────────────────────────────────────────────────────────────
// run() — the HONEST deferred-clean no-op. Every detected ecosystem is audited by
// DependencyAuditor (pure go), osv-scanner is ABSENT, nothing crashed → the truthful
// "already covered by DependencyAuditor" message, NOT a scanner-missing failure and
// NOT a fabricated clean scan.
// ─────────────────────────────────────────────────────────────────────────────────

test('run_reports_the_deferred_clean_message_when_every_ecosystem_is_audited_elsewhere_and_osv_is_absent', async () => {
  // Arrange — no tool is available at all (every probe throws).
  cp.execFileSync = () => { throw new Error('command not found'); };
  cp.execSync = () => { throw new Error('command not found'); };
  const { SCARunner } = freshSCA();
  const tmp = mkTmp('sca-deferred-clean-');
  try {
    fs.writeFileSync(path.join(tmp, 'go.mod'), 'module x\ngo 1.21\n'); // go → detected AND deferred
    fs.writeFileSync(path.join(tmp, 'go.sum'), '');

    // Act
    const res = await new SCARunner(tmp).run();

    // Assert — a truthful no-op: success, no findings, and a message that names the
    // DependencyAuditor coverage (NOT a scanner-missing failure, NOT scanned:false)
    assert.equal(res.success, true, 'all ecosystems audited elsewhere is not a failure');
    assert.deepEqual(res.findings, []);
    assert.notEqual(res.scanned, false, 'this branch must NOT report scanned:false — nothing failed');
    assert.match(String(res.message || ''), /DependencyAuditor/, 'the message must name the DependencyAuditor coverage');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────────────────────────────────────────
// run() — the severity SORT. With ≥2 findings of DIFFERENT severity the comparator
// must order CRITICAL before LOW. Single-finding sibling tests never exercise it.
// ─────────────────────────────────────────────────────────────────────────────────

test('run_sorts_findings_most_severe_first_when_multiple_severities_are_present', async () => {
  // Arrange — osv returns one LOW and one CRITICAL (unmapped ecosystem → nothing dropped).
  const osv = {
    results: [{
      source: { path: '/proj/mix.exs', type: 'lockfile' },
      packages: [
        { package: { name: 'low-pkg', ecosystem: 'Hex', version: '1.0.0' }, vulnerabilities: [{ id: 'GHSA-low', database_specific: { severity: 'LOW' } }] },
        { package: { name: 'crit-pkg', ecosystem: 'Hex', version: '1.0.0' }, vulnerabilities: [{ id: 'GHSA-crit', database_specific: { severity: 'CRITICAL' } }] }
      ]
    }]
  };
  cp.execFileSync = (cmd, args) => {
    if (Array.isArray(args) && args.includes('--version')) { if (cmd === 'osv-scanner') return ''; throw new Error('not installed'); }
    if (cmd === 'osv-scanner') return JSON.stringify(osv);
    throw new Error(`unexpected exec ${cmd} ${JSON.stringify(args)}`);
  };
  const { SCARunner } = freshSCA();
  const tmp = mkTmp('sca-sort-');
  try {
    fs.writeFileSync(path.join(tmp, 'mix.exs'), 'defmodule X do\nend\n'); // elixir → osv route, not deferred

    // Act
    const res = await new SCARunner(tmp).run();

    // Assert — most-severe-first ordering (kills a reversed/removed comparator)
    assert.equal(res.findings.length, 2);
    assert.equal(res.findings[0].severity, 'CRITICAL', 'CRITICAL must sort before LOW');
    assert.equal(res.findings[1].severity, 'LOW');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────────────────────────────────────────
// _relToRoot — a source path NOT under the project root (escapes via `..`) is returned
// UNCHANGED, and _isRootManifest therefore classifies it as non-root. Guards the drop
// logic from misclassifying a foreign path as a root manifest.
// ─────────────────────────────────────────────────────────────────────────────────

test('_relToRoot_returns_an_escaping_path_unchanged_and_isRootManifest_rejects_it', () => {
  // Arrange
  const r = new (require(SCA_PATH).SCARunner)(path.join(path.sep, 'proj', 'sub'));
  const foreign = path.join(path.sep, 'totally', 'other', 'package-lock.json');

  // Act
  const rel = r._relToRoot(foreign);

  // Assert — a path outside the root is not made relative, and is not a root manifest
  assert.equal(rel, foreign, 'a path that escapes the root must be returned unchanged');
  assert.equal(r._isRootManifest(foreign), false, 'a foreign path is never a root manifest');
});

// ─────────────────────────────────────────────────────────────────────────────────
// _pythonUsesOsvOnlyLock / _jsUsesOsvOnlyLock — fail-soft catch. A projectRoot with a
// NUL byte is a non-empty string (passes the constructor guard) but makes safeFs's
// path validation throw; the method must swallow it and report "no osv-only lock",
// never propagate the throw.
// ─────────────────────────────────────────────────────────────────────────────────

test('_pythonUsesOsvOnlyLock_returns_false_when_the_filesystem_probe_throws', () => {
  // Arrange — a NUL-byte root: safeFs.existsSync(path.join(root,'poetry.lock')) throws.
  const r = new (require(SCA_PATH).SCARunner)('/tmp/has nul');
  assert.equal(r.projectRoot, '/tmp/has nul', 'a NUL-containing string is still a string root');

  // Act + Assert — the throw is caught, reported as absent (fail-soft)
  assert.equal(r._pythonUsesOsvOnlyLock(), false, 'a throwing fs probe must fail soft to false, not propagate');
});

test('_jsUsesOsvOnlyLock_returns_false_when_the_filesystem_probe_throws', () => {
  // Arrange
  const r = new (require(SCA_PATH).SCARunner)('/tmp/has nul');

  // Act + Assert
  assert.equal(r._jsUsesOsvOnlyLock(), false, 'a throwing fs probe must fail soft to false, not propagate');
});

// ─────────────────────────────────────────────────────────────────────────────────
// generateReport — the Scan-Errors section. When errors were recorded the report must
// list them (tool + message); a mutant that drops the section must go red.
// ─────────────────────────────────────────────────────────────────────────────────

test('generateReport_includes_a_scan_errors_section_listing_each_recorded_error', () => {
  // Arrange
  const r = new (require(SCA_PATH).SCARunner)('/x');
  r.errors.push({ tool: 'npm-audit', error: 'npm audit did not run (EAUDITNOLOCK)' });
  const findings = [{ tool: 'osv-scanner', package: 'p', advisory: 'GHSA-z', title: 'boom', version: '1.0.0', severity: 'HIGH' }];
  const summary = r.generateSummary(findings, ['go'], 1000);

  // Act
  const report = r.generateReport(findings, summary);

  // Assert — the errors are surfaced in the human report, not swallowed
  assert.match(report, /Scan Errors/, 'the report must contain a Scan Errors heading when errors exist');
  assert.match(report, /npm-audit/, 'the failing tool must be named');
  assert.match(report, /EAUDITNOLOCK/, 'the error message must be shown');
});
