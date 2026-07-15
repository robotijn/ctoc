/**
 * sast-runner-coverage.test.js — DARK-BRANCH coverage for src/lib/sast-runner.js.
 *
 * Companion to sast-runner-{failclosed,hardening,registry}.test.js. Those three pin
 * the CWE floor, the shell-injection seams, honest routing, and the crash-with-stdout
 * fail-closed paths. This file targets what remained dark, every test aimed at a branch
 * that goes RED under mutation — never a happy-path line-coverage filler:
 *
 *   - run() SUCCESS path end-to-end (scanner ran → dedup → sort → summary → report).
 *   - runSemgrep's catch: non-zero exit WITH valid findings JSON (the common case:
 *     semgrep exits 1 when it FINDS things) must parse; garbage/no-stdout → loud error.
 *   - the "no stdout at all" ELSE of runBandit / runGosec / runESLintSecurity (the
 *     failclosed suite only drives the stdout-present nested-catch).
 *   - runESLintSecurity's empty-success ("produced no output") branch.
 *   - runLanguageScanner dispatch to gosec/eslint + the tool-absent false-return.
 *   - generateSummary byTool / byCWE aggregation (incl. the `|| 0` and cwe-absent skip).
 *   - generateReport: severity grouping, the >10 truncation boundary, CWE line, errors.
 *   - checkThreshold's `<=` boundary — the CRITICAL gate that must be ABLE to fail.
 *   - the tool-severity mappers' `|| MEDIUM` default (second operand of ||).
 *   - parse-guard early returns on malformed tool output (a crashed/empty payload must
 *     never throw, and never fabricate a finding).
 *   - extractCWE's cwe_id fallback + null shapes; deduplicate's keep-existing branch.
 *
 * Fakes only at the true boundary: child_process.{execSync,execFileSync} (the SAST
 * subprocess seam) and real os.tmpdir() fixtures cleaned in finally. No core logic is
 * mocked — parsing, routing, aggregation and gating all run for real.
 *
 * Reviewed line-by-line by a human (Tijn) per the AI-generated-tests rule.
 */

'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const SAST_PATH = require.resolve('../src/lib/sast-runner');
const REAL_EXEC = cp.execSync;
const REAL_EXECFILE = cp.execFileSync;

/** Reload sast-runner AFTER installing cp.execSync/execFileSync fakes — the module
 *  destructures both at load time, so the fakes must be in place before require. */
function freshSAST() {
  delete require.cache[SAST_PATH];
  return require(SAST_PATH).SASTRunner;
}

function restore() {
  cp.execSync = REAL_EXEC;
  cp.execFileSync = REAL_EXECFILE;
  delete require.cache[SAST_PATH];
}

/** A non-reloaded handle for the pure (no-subprocess) tests. */
const { SASTRunner } = require('../src/lib/sast-runner');

/** Make an isolated temp project, seed the given files (nested paths ok), return path. */
function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sast-cov-'));
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

/** An error shaped like a non-zero child_process exit that carries stdout. */
function exitWithStdout(stdout) {
  const e = new Error('Command failed with exit code 1');
  e.status = 1;
  e.stdout = stdout;
  return e;
}

/** An error shaped like a spawn failure that carries NO stdout at all. */
function exitNoStdout(message) {
  const e = new Error(message);
  e.status = 1;
  return e; // deliberately no .stdout
}

// ── Cluster A: detectSastSourceLanguages unreadable-dir catch (lines 213-215) ──────
// The recursive walk's readdirSync is wrapped in a fail-soft catch: an unreadable /
// nonexistent directory yields "no evidence from here", never a thrown scan. Mutating
// the catch to rethrow (or dropping the guard) reds this.

test('detectSastSourceLanguages_on_nonexistent_root_returns_empty_set_not_throw', () => {
  // Arrange
  const runner = new SASTRunner('/no/such/dir/definitely-not-here');

  // Act
  const langs = runner.detectSastSourceLanguages();

  // Assert — the readdir throw was caught; detection degrades to nothing.
  assert.equal(langs.size, 0);
});

test('detectLanguages_on_nonexistent_root_detects_nothing_without_throwing', () => {
  // Arrange
  const runner = new SASTRunner('/no/such/dir/definitely-not-here');

  // Act
  const langs = runner.detectLanguages();

  // Assert — registry (fail-soft) + source walk (caught) both yield nothing.
  assert.deepEqual(langs, []);
});

// ── Cluster B: run() SUCCESS path end-to-end (lines 437-480, summary + report) ─────
// The whole "a scanner actually ran" success path was dark: every prior run() test
// exercised only the scanned:false honesty paths. Drive semgrep + bandit to completion
// with faked subprocesses and a real python fixture. Kills mutants that skip the
// scanner increment, the dedup/sort, or dress a real scan as scanned:false.

test('run_reports_success_and_sorts_findings_critical_first_when_scanners_run', async () => {
  // Arrange — every version probe "succeeds" so tools read as available.
  cp.execSync = () => '';
  cp.execFileSync = (file) => {
    if (file === 'semgrep') {
      return JSON.stringify({ results: [{
        check_id: 'sql-inj', path: 'app.py', start: { line: 2, col: 1 },
        extra: { message: 'SQL injection sink', severity: 'ERROR',
          metadata: { cwe: 'CWE-89' }, lines: 'cursor.execute(q)' } }] });
    }
    if (file === 'bandit') {
      return JSON.stringify({ results: [{
        test_id: 'B303', filename: 'app.py', line_number: 5,
        issue_text: 'Use of insecure MD5', issue_severity: 'MEDIUM', issue_confidence: 'LOW',
        code: 'hashlib.md5()' }] });
    }
    throw new Error(`unexpected tool ${file}`);
  };
  const Fresh = freshSAST();
  const dir = fixture({ 'app.py': 'import hashlib\nhashlib.md5()\n' });
  try {
    // Act
    const res = await new Fresh(dir).run();

    // Assert — a real scan, findings sorted by severity (CRITICAL floor first).
    assert.equal(res.success, true);
    assert.equal(res.scanned, true);
    assert.equal(res.findings.length, 2);
    assert.equal(res.findings[0].severity, 'CRITICAL'); // CWE-89 promoted, sorted first
    assert.equal(res.findings[1].severity, 'MEDIUM');
  } finally {
    restore();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('run_summary_and_report_aggregate_every_tool_and_cwe_on_success', async () => {
  // Arrange
  cp.execSync = () => '';
  cp.execFileSync = (file) => {
    if (file === 'semgrep') {
      return JSON.stringify({ results: [{
        check_id: 'sql-inj', path: 'app.py', start: { line: 2, col: 1 },
        extra: { message: 'SQL injection sink', severity: 'ERROR',
          metadata: { cwe: 'CWE-89' }, lines: 'x' } }] });
    }
    if (file === 'bandit') {
      return JSON.stringify({ results: [{
        test_id: 'B303', filename: 'app.py', line_number: 5,
        issue_text: 'MD5', issue_severity: 'MEDIUM', issue_confidence: 'LOW', code: 'y' }] });
    }
    throw new Error(`unexpected tool ${file}`);
  };
  const Fresh = freshSAST();
  const dir = fixture({ 'app.py': 'x = 1\n' });
  try {
    // Act
    const res = await new Fresh(dir).run();

    // Assert — byTool + byCWE aggregation and the rendered report all populated.
    assert.equal(res.summary.byTool.semgrep, 1);
    assert.equal(res.summary.byTool.bandit, 1);
    assert.equal(res.summary.byCWE['CWE-89'], 1);      // semgrep CWE-89
    assert.equal(res.summary.byCWE['CWE-327'], 1);     // bandit B303 → CWE-327
    assert.match(res.message, /SAST Security Scan Report/);
  } finally {
    restore();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── Cluster C: runSemgrep catch (lines 507-518) ───────────────────────────────────
// Semgrep exits NON-ZERO when it finds issues; that path was never tested (prior tests
// only drove the exit-0 success). The three sub-branches: valid JSON on stdout → parse;
// garbage on stdout → loud error; no stdout → loud error.

test('runSemgrep_parses_findings_when_nonzero_exit_carries_valid_json_on_stdout', async () => {
  // Arrange — semgrep exit 1 WITH a findings payload (the it-found-something case).
  cp.execFileSync = () => { throw exitWithStdout(JSON.stringify({ results: [{
    check_id: 'r', path: 'a.py', start: { line: 1, col: 1 },
    extra: { message: 'm', severity: 'ERROR', metadata: { cwe: 'CWE-89' }, lines: 'x' } }] })); };
  const Fresh = freshSAST();
  try {
    const r = new Fresh('/no/such/dir');

    // Act
    await r.runSemgrep();

    // Assert — the finding is recovered from stdout, not discarded as an error.
    assert.equal(r.errors.length, 0);
    assert.equal(r.findings.length, 1);
    assert.equal(r.findings[0].severity, 'CRITICAL');
  } finally {
    restore();
  }
});

test('runSemgrep_records_error_when_nonzero_exit_stdout_is_not_json', async () => {
  // Arrange
  cp.execFileSync = () => { throw exitWithStdout('semgrep: fatal: config not found'); };
  const Fresh = freshSAST();
  try {
    const r = new Fresh('/no/such/dir');

    // Act
    await r.runSemgrep();

    // Assert — a scanner that emitted garbage is a loud skip, never silent green.
    assert.equal(r.findings.length, 0);
    assert.ok(r.errors.some(e => e.tool === 'semgrep' && e.error));
  } finally {
    restore();
  }
});

test('runSemgrep_records_error_when_crash_has_no_stdout', async () => {
  // Arrange
  cp.execFileSync = () => { throw exitNoStdout('spawn semgrep ENOENT'); };
  const Fresh = freshSAST();
  try {
    const r = new Fresh('/no/such/dir');

    // Act
    await r.runSemgrep();

    // Assert
    assert.ok(r.errors.some(e => e.tool === 'semgrep' && /ENOENT/.test(e.error)));
  } finally {
    restore();
  }
});

// ── Cluster D: the "no stdout" ELSE of each native scanner (597-598, 629-630, 663-665)
// failclosed drives the stdout-PRESENT nested-catch; the stdout-ABSENT else was dark.
// A scanner that dies before printing anything must still surface as a loud error.

test('runBandit_records_error_when_crash_has_no_stdout', async () => {
  // Arrange
  cp.execFileSync = () => { throw exitNoStdout('spawn bandit ENOENT'); };
  const Fresh = freshSAST();
  try {
    const r = new Fresh('/no/such/dir');

    // Act
    await r.runBandit();

    // Assert — the else-branch (no stdout) push, not silence.
    assert.equal(r.findings.length, 0);
    assert.ok(r.errors.some(e => e.tool === 'bandit' && /ENOENT/.test(e.error)));
  } finally {
    restore();
  }
});

test('runGosec_records_error_when_crash_has_no_stdout', async () => {
  // Arrange — gosec runs via execSync, so that is the seam here.
  cp.execSync = () => { throw exitNoStdout('spawn gosec ENOENT'); };
  const Fresh = freshSAST();
  try {
    const r = new Fresh('/no/such/dir');

    // Act
    await r.runGosec();

    // Assert
    assert.equal(r.findings.length, 0);
    assert.ok(r.errors.some(e => e.tool === 'gosec' && /ENOENT/.test(e.error)));
  } finally {
    restore();
  }
});

test('runESLintSecurity_records_error_when_crash_has_no_stdout', async () => {
  // Arrange
  cp.execFileSync = () => { throw exitNoStdout('spawn npx ENOENT'); };
  const Fresh = freshSAST();
  try {
    const r = new Fresh('/no/such/dir');

    // Act
    await r.runESLintSecurity();

    // Assert — the no-stdout early-return error branch (lines 663-665).
    assert.equal(r.findings.length, 0);
    assert.ok(r.errors.some(e => e.tool === 'eslint-security' && /ENOENT/.test(e.error)));
  } finally {
    restore();
  }
});

// ── Cluster E: runESLintSecurity empty-SUCCESS "produced no output" (lines 676-678) ─
// execFileSync returns cleanly but empty (exit 0, no report). That is NOT a clean scan —
// it produced nothing usable and must be recorded, never read as green.

test('runESLintSecurity_records_error_when_successful_run_produces_empty_output', async () => {
  // Arrange — no throw, empty stdout.
  cp.execFileSync = () => '';
  const Fresh = freshSAST();
  try {
    const r = new Fresh('/no/such/dir');

    // Act
    await r.runESLintSecurity();

    // Assert
    assert.equal(r.findings.length, 0);
    assert.ok(r.errors.some(e => e.tool === 'eslint-security' && /produced no output/.test(e.error)));
  } finally {
    restore();
  }
});

// ── Cluster F: runLanguageScanner dispatch (lines 533-556) ────────────────────────
// The bandit case is exercised by the run()-success test; here the gosec + eslint cases
// and the tool-ABSENT false-return. Kills mutants that misroute a language's scanner.

test('runLanguageScanner_dispatches_go_to_gosec_and_returns_true', async () => {
  // Arrange — gosec available (execSync version probe ok) and returns one finding.
  cp.execSync = (command) => {
    if (/--version/.test(command)) return '';               // isToolAvailable('gosec')
    return JSON.stringify({ Issues: [{
      rule_id: 'G204', file: 'main.go', line: '7', column: '3',
      details: 'command injection', severity: 'HIGH', confidence: 'HIGH', cwe: { id: '78' } }] });
  };
  const Fresh = freshSAST();
  try {
    const r = new Fresh('/no/such/dir');

    // Act
    const ran = await r.runLanguageScanner('go');

    // Assert — gosec ran and its finding surfaced (CWE-78 → CRITICAL floor).
    assert.equal(ran, true);
    assert.equal(r.findings.length, 1);
    assert.equal(r.findings[0].tool, 'gosec');
    assert.equal(r.findings[0].severity, 'CRITICAL');
  } finally {
    restore();
  }
});

test('runLanguageScanner_dispatches_javascript_to_eslint_and_returns_true', async () => {
  // Arrange — eslint available (execSync version probe) + report on execFileSync.
  cp.execSync = () => '';
  cp.execFileSync = (file) => {
    if (file === 'npx' || file === 'npx.cmd') {
      return JSON.stringify([{ filePath: 'a.js', messages: [
        { ruleId: 'no-eval', line: 1, column: 1, message: 'eval', severity: 2, source: 'eval(x)' }] }]);
    }
    throw new Error(`unexpected file ${file}`);
  };
  const Fresh = freshSAST();
  try {
    const r = new Fresh('/no/such/dir');

    // Act
    const ran = await r.runLanguageScanner('javascript');

    // Assert
    assert.equal(ran, true);
    assert.equal(r.findings.length, 1);
    assert.equal(r.findings[0].tool, 'eslint-security');
  } finally {
    restore();
  }
});

test('runLanguageScanner_returns_false_and_adds_no_finding_when_native_tool_absent', async () => {
  // Arrange — python routes to bandit, but every version probe fails → bandit absent.
  cp.execSync = () => { throw new Error('command not found'); };
  const Fresh = freshSAST();
  try {
    const r = new Fresh('/no/such/dir');

    // Act — bandit is a parseable native tool but is not installed.
    const ran = await r.runLanguageScanner('python');

    // Assert — no scan ran, no fabricated finding (line 533-534 false-return).
    assert.equal(ran, false);
    assert.equal(r.findings.length, 0);
  } finally {
    restore();
  }
});

// ── Cluster G: generateSummary aggregation (lines 977-1002) ───────────────────────
// byTool / byCWE loops and the cwe-absent skip were dark (summary was only ever built
// from []). The `|| 0` first-seen fallback and the `if (finding.cwe)` skip both matter.

test('generateSummary_counts_bySeverity_byTool_and_skips_findings_without_cwe', () => {
  // Arrange
  const r = new SASTRunner('/no/such/dir');
  const findings = [
    { severity: 'CRITICAL', tool: 'semgrep', cwe: 'CWE-89' },
    { severity: 'CRITICAL', tool: 'semgrep', cwe: 'CWE-89' },  // same tool+cwe → count 2
    { severity: 'LOW', tool: 'bandit' }                         // no cwe → skipped in byCWE
  ];

  // Act
  const summary = r.generateSummary(findings, ['python'], 3200);

  // Assert — one subject: the aggregate shape.
  assert.equal(summary.total, 3);
  assert.equal(summary.bySeverity.CRITICAL, 2);
  assert.equal(summary.byTool.semgrep, 2);
  assert.equal(summary.byTool.bandit, 1);
  assert.equal(summary.byCWE['CWE-89'], 2);
  assert.equal('CWE-89' in summary.byCWE, true);
  assert.equal(Object.keys(summary.byCWE).length, 1); // the no-cwe finding contributed none
  assert.equal(summary.duration, 3);                  // 3200ms rounded to seconds
});

// ── Cluster H: generateReport branches (lines 1011-1063) ──────────────────────────
// The report body was dark. Pin the severity grouping, the >10 truncation boundary,
// the CWE line, and the errors section. Kills `> 10` → `>= 10` and slice(0,10) mutants.

test('generateReport_truncates_after_ten_findings_of_a_severity', () => {
  // Arrange — 12 HIGH findings so the "... and N more" line must appear with N=2.
  const r = new SASTRunner('/no/such/dir');
  const findings = [];
  for (let i = 0; i < 12; i++) {
    findings.push({ severity: 'HIGH', rule: `R${i}`, file: 'a.js', line: i, message: `issue ${i}` });
  }
  const summary = r.generateSummary(findings, ['javascript'], 0);

  // Act
  const report = r.generateReport(findings, summary);

  // Assert — exactly the 12-10=2 overflow is reported.
  assert.match(report, /HIGH Findings \(12\)/);
  assert.match(report, /\.\.\. and 2 more HIGH findings/);
});

test('generateReport_omits_a_severity_with_zero_findings_and_prints_cwe_and_errors', () => {
  // Arrange
  const r = new SASTRunner('/no/such/dir');
  r.errors = [{ tool: 'semgrep', error: 'config missing' }];
  const findings = [{ severity: 'CRITICAL', rule: 'sql-inj', file: 'a.py', line: 4,
    message: 'SQL injection', cwe: 'CWE-89' }];
  const summary = r.generateSummary(findings, ['python'], 0);

  // Act
  const report = r.generateReport(findings, summary);

  // Assert — CRITICAL section + CWE line + errors present; no empty MEDIUM/LOW section.
  assert.match(report, /CRITICAL Findings \(1\)/);
  assert.match(report, /CWE: CWE-89/);
  assert.match(report, /Scan Errors/);
  assert.match(report, /\[semgrep\] config missing/);
  assert.doesNotMatch(report, /MEDIUM Findings/);
});

// ── Cluster I: checkThreshold `<=` boundary — the gate that must be ABLE to fail ───
// The CRITICAL/HIGH gate uses `findingIndex <= thresholdIndex`. A finding AT the
// threshold must FAIL; strictly-below must PASS. Kills `<=` → `<` (which would let a
// HIGH finding sail through a HIGH gate — the exact false-green this module fights).

test('checkThreshold_fails_on_a_finding_exactly_at_the_threshold_severity', () => {
  // Arrange
  const r = new SASTRunner('/no/such/dir');
  r.findings = [{ severity: 'HIGH' }];

  // Act
  const res = r.checkThreshold('HIGH');

  // Assert — equal severity is a FAIL (boundary is inclusive).
  assert.equal(res.pass, false);
  assert.equal(res.failing, 1);
});

test('checkThreshold_passes_when_only_finding_is_below_the_threshold', () => {
  // Arrange
  const r = new SASTRunner('/no/such/dir');
  r.findings = [{ severity: 'HIGH' }];

  // Act — a CRITICAL gate: HIGH is strictly below → pass.
  const res = r.checkThreshold('CRITICAL');

  // Assert
  assert.equal(res.pass, true);
  assert.equal(res.failing, 0);
});

test('checkThreshold_defaults_to_HIGH_and_passes_on_medium_only_findings', () => {
  // Arrange
  const r = new SASTRunner('/no/such/dir');
  r.findings = [{ severity: 'MEDIUM' }];

  // Act — no arg → default threshold HIGH; MEDIUM is below it.
  const res = r.checkThreshold();

  // Assert
  assert.equal(res.pass, true);
  assert.equal(res.threshold, 'HIGH');
});

// ── Cluster J: tool-severity mappers' `|| MEDIUM` default (second operand of ||) ────
// An unknown/absent tool severity must default to MEDIUM, never vanish. Kills the
// mutant that drops the default (which would yield undefined severity, silently
// unsortable and un-gateable).

test('mapSemgrepSeverity_defaults_unknown_severity_to_MEDIUM', () => {
  const r = new SASTRunner('/no/such/dir');
  assert.equal(r.mapSemgrepSeverity('ERROR'), 'HIGH');       // known
  assert.equal(r.mapSemgrepSeverity('NONSENSE'), 'MEDIUM');  // default (|| MEDIUM)
});

test('mapBanditSeverity_defaults_unknown_severity_to_MEDIUM', () => {
  const r = new SASTRunner('/no/such/dir');
  assert.equal(r.mapBanditSeverity('LOW'), 'LOW');
  assert.equal(r.mapBanditSeverity(undefined), 'MEDIUM');
});

test('mapGosecSeverity_defaults_unknown_severity_to_MEDIUM', () => {
  const r = new SASTRunner('/no/such/dir');
  assert.equal(r.mapGosecSeverity('HIGH'), 'HIGH');
  assert.equal(r.mapGosecSeverity('weird'), 'MEDIUM');
});

// ── Cluster K: parse-guard early returns on malformed tool output ──────────────────
// A crashed scanner that emits `{}` (or a non-array) must produce ZERO findings and NOT
// throw. Kills mutants that drop the `if (!data.results) return;` guard.

test('parseSemgrepResults_ignores_payload_without_results_array', () => {
  const r = new SASTRunner('/no/such/dir');
  r.parseSemgrepResults({});
  assert.equal(r.findings.length, 0);
});

test('parseBanditResults_ignores_payload_without_results_array', () => {
  const r = new SASTRunner('/no/such/dir');
  r.parseBanditResults({ not_results: [] });
  assert.equal(r.findings.length, 0);
});

test('parseGosecResults_ignores_payload_without_Issues_array', () => {
  const r = new SASTRunner('/no/such/dir');
  r.parseGosecResults({});
  assert.equal(r.findings.length, 0);
});

test('parseESLintResults_ignores_non_array_payload', () => {
  const r = new SASTRunner('/no/such/dir');
  r.parseESLintResults({ not: 'an array' });
  assert.equal(r.findings.length, 0);
});

test('parseESLintResults_handles_file_entry_with_no_messages_array', () => {
  // `file.messages || []` — a file object lacking messages must not throw.
  const r = new SASTRunner('/no/such/dir');
  r.parseESLintResults([{ filePath: 'a.js' }]);
  assert.equal(r.findings.length, 0);
});

// ── Cluster L: parse fallbacks (col_offset || 0, confidence || MEDIUM, cwe?.id) ─────

test('parseBanditResults_defaults_missing_col_offset_to_zero_and_unknown_rule_cwe_to_null', () => {
  // Arrange — no col_offset, and B999 is not in the bandit→CWE table.
  const r = new SASTRunner('/no/such/dir');

  // Act
  r.parseBanditResults({ results: [{
    test_id: 'B999', filename: 'a.py', line_number: 3,
    issue_text: 'unknown', issue_severity: 'LOW', issue_confidence: 'LOW' }] });

  // Assert
  assert.equal(r.findings[0].column, 0);      // col_offset || 0
  assert.equal(r.findings[0].cwe, null);      // unmapped rule → null CWE
  assert.equal(r.findings[0].severity, 'LOW');
});

test('parseSemgrepResults_defaults_confidence_to_MEDIUM_when_metadata_absent', () => {
  // Arrange — metadata present but no confidence field.
  const r = new SASTRunner('/no/such/dir');

  // Act
  r.parseSemgrepResults({ results: [{
    check_id: 'r', path: 'a.py', start: { line: 1, col: 1 },
    extra: { message: 'm', severity: 'WARNING', metadata: {}, lines: 'x' } }] });

  // Assert — confidence falls back to MEDIUM (line 701 `|| 'MEDIUM'`).
  assert.equal(r.findings[0].confidence, 'MEDIUM');
  assert.equal(r.findings[0].severity, 'MEDIUM'); // WARNING → MEDIUM
});

test('parseGosecResults_leaves_cwe_undefined_when_issue_has_no_cwe', () => {
  // `issue.cwe?.id` — a gosec issue without a cwe object must not throw.
  const r = new SASTRunner('/no/such/dir');
  r.parseGosecResults({ Issues: [{
    rule_id: 'G101', file: 'a.go', line: '2', column: '1',
    details: 'hardcoded', severity: 'MEDIUM', confidence: 'LOW' }] });
  assert.equal(r.findings[0].cwe, undefined);
  assert.equal(r.findings[0].severity, 'MEDIUM');
});

test('parseESLintResults_maps_severity_1_to_MEDIUM_and_2_to_HIGH', () => {
  // The `message.severity === 2 ? HIGH : MEDIUM` ternary — pin both arms.
  const r = new SASTRunner('/no/such/dir');
  r.parseESLintResults([{ filePath: 'a.js', messages: [
    { ruleId: 'security/detect-eval-with-expression', line: 1, column: 1, message: 'warn', severity: 1 },
    { ruleId: 'no-eval', line: 2, column: 1, message: 'err', severity: 2 }
  ] }]);
  const bySev = Object.fromEntries(r.findings.map(f => [f.rule, f.severity]));
  assert.equal(bySev['security/detect-eval-with-expression'], 'MEDIUM'); // severity 1
  assert.equal(bySev['no-eval'], 'HIGH');                                // severity 2
});

// ── Cluster M: extractCWE cwe_id fallback + null shapes (lines 854-871) ────────────

test('extractCWE_falls_back_to_cwe_id_when_cwe_field_absent', () => {
  const r = new SASTRunner('/no/such/dir');
  // metadata.cwe undefined → use metadata.cwe_id (the second operand).
  assert.equal(r.extractCWE({ cwe_id: 'CWE-89' }), 'CWE-89');
});

test('extractCWE_returns_null_for_null_metadata_and_for_empty_metadata', () => {
  const r = new SASTRunner('/no/such/dir');
  assert.equal(r.extractCWE(null), null);   // guard: !metadata
  assert.equal(r.extractCWE({}), null);     // neither cwe nor cwe_id → no tokens
});

// ── Cluster N: deduplicateFindings keep-existing (the `<` false branch, line 960) ──
// FN-4 regression pins the replace-with-higher case; the mirror — a LATER, LOWER
// finding at the same key must NOT replace the existing higher one — was the dark arm.

test('deduplicateFindings_keeps_existing_higher_severity_when_later_duplicate_is_lower', () => {
  // Arrange — HIGH seen first, then a MEDIUM duplicate at the same key.
  const r = new SASTRunner('/no/such/dir');
  r.findings = [
    { file: 'a.js', line: 10, message: 'XSS sink', severity: 'HIGH' },
    { file: 'a.js', line: 10, message: 'XSS sink', severity: 'MEDIUM' }
  ];

  // Act
  const unique = r.deduplicateFindings();

  // Assert — the HIGH one is retained (the `<` comparison is false → no replace).
  assert.equal(unique.length, 1);
  assert.equal(unique[0].severity, 'HIGH');
});

// ── Cluster O: isToolAvailable unknown tool → false (line 394-395) ─────────────────

test('isToolAvailable_returns_false_for_an_unknown_tool_without_spawning', () => {
  // No command mapped → early false; no subprocess is attempted.
  const r = new SASTRunner('/no/such/dir');
  assert.equal(r.isToolAvailable('this-tool-does-not-exist'), false);
});

after(() => {
  // Belt-and-suspenders: ensure the real child_process functions are restored even if a
  // test threw before its finally (none should, but FIRST.Independent must hold).
  cp.execSync = REAL_EXEC;
  cp.execFileSync = REAL_EXECFILE;
});
