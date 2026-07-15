/**
 * Secrets Scanner — dark-branch coverage tests
 *
 * Targets branches that tests/security.test.js never reaches, chosen so each
 * assertion goes RED under a mutation of the production line it pins:
 *   - shouldScan stat-catch (a scannable path that vanishes / cannot be stat'd)
 *   - getFilesToScan directory recursion, excluded-directory pruning, fail-open
 *     on an unreadable root
 *   - detectHighEntropyStrings instance-level dedup (already-found suppression)
 *   - deduplicateFindings prefer-verified REPLACE (unverified first, verified 2nd)
 *   - run() orchestration + severity sort
 *   - generateSummary counting (direct)
 *   - generateReport populated CRITICAL/HIGH/recommendation blocks + truncation
 *   - external-tool methods (isToolAvailable / runTruffleHog / runDetectSecrets /
 *     runWithExternalTools) with child_process.execSync FAKED at the module boundary
 *     (deterministic + cross-platform; real PATH-shimmed subprocesses were flaky
 *     under coverage load — they hit the scanner's 10s/300s execSync timeouts).
 *
 * FIXTURE CONSTRAINT: every secret-shaped value is a GENERIC high-entropy string
 * or the canonical AWS example (AKIAIOSFODNN7EXAMPLE / wJalrXUtnFEMI/...EXAMPLEKEY).
 * No value here is a real provider token FORMAT that push protection scans for.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── child_process.execSync stub — installed BEFORE the scanner is required ─────
// The three external-tool methods (isToolAvailable / runTruffleHog /
// runDetectSecrets) shell out via the scanner's module-level
// `const { execSync } = require('child_process')`. Driving them through REAL
// PATH-shimmed binaries made these three tests FLAKY under the full coverage run:
// when fork/exec was starved (the gate running while other work finished), execSync
// hit the scanner's own 10s (--version) / 300s (scan) timeouts and the assertions
// failed. We fake execSync — the sanctioned process boundary — so the PARSING logic
// runs deterministically, fast, and cross-platform with NO subprocess. Installed at
// module-load time here so the scanner's destructured import captures the stub.
const childProcess = require('child_process');
const _realExecSync = childProcess.execSync;
const TRUFFLEHOG_NDJSON =
  '{"DetectorName":"AWS","Raw":"AKIAIOSFODNN7EXAMPLE","SourceMetadata":' +
  '{"Data":{"Filesystem":{"file":"/scan/leak.js","line":3}}}}\n' +
  'this-is-not-json\n'; // second line is malformed → exercises the skip-non-JSON catch
const DETECT_SECRETS_JSON =
  '{"results":{"config.py":[{"type":"Base64 High Entropy String","line_number":5}]}}';
// Per-test knobs: which tools answer `--version`, and whether a scan command throws.
const execState = {
  availableTools: new Set(['trufflehog', 'detect-secrets']),
  scanThrows: false,
};
childProcess.execSync = (command) => {
  const cmd = String(command);
  const version = cmd.match(/^(\S+)\s+--version/);
  if (version) {
    if (execState.availableTools.has(version[1])) return `${version[1]} (stub)\n`;
    throw new Error(`command not found: ${version[1]}`); // → isToolAvailable false
  }
  if (execState.scanThrows) throw new Error('external tool exited non-zero');
  if (cmd.startsWith('trufflehog ')) return TRUFFLEHOG_NDJSON;
  if (cmd.startsWith('detect-secrets ')) return DETECT_SECRETS_JSON;
  throw new Error(`unexpected execSync command in test: ${cmd}`);
};

const { SecretsScanner } = require('../src/lib/secrets-scanner');

// Root for all filesystem fixtures; removed in the final after().
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-secrets-cov-'));

// A synthetic PEM (only the header is matched; the body is invented filler).
const SYNTH_RSA_KEY =
  '-----BEGIN RSA PRIVATE KEY-----\n' +
  'MIIBOGUSfakeKEYdoNOTuseTHISisSYNTHETICfillerAAAAAAAAAAAAAAAAAAAAAA\n' +
  '-----END RSA PRIVATE KEY-----\n';

// The PUBLIC jwt.io demo token — a JWT_TOKEN (severity LOW), used to prove the
// CRITICAL-before-LOW sort in run().
const JWT_DEMO =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ' +
  '.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

// Generic high-entropy value (~5.0 Shannon entropy, 32 chars) on a secret-named
// key — trips detectHighEntropyStrings but is NOT a provider format.
const HIGH_ENTROPY = 'Zx8Qw3Vt7Lp2Rn6Kd9Bf4Hs1Mj5Yc0Ae';

// Make a fresh unique dir under ROOT.
let dirSeq = 0;
function freshDir(tag) {
  const d = path.join(ROOT, `${tag}-${dirSeq++}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

after(() => {
  childProcess.execSync = _realExecSync; // restore the real boundary (hygiene)
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (e) { /* ignore */ }
});

// ===========================================================================
// Cluster A — shouldScan stat-catch (lines 466-467): a scannable path that
// cannot be stat'd (race deletion / phantom path) must be treated as
// UN-scannable, never scannable. Mutant `return true` in the catch → RED.
// ===========================================================================
describe('SecretsScanner.shouldScan — stat failure', () => {
  it('should_return_false_when_a_scannable_path_cannot_be_stat_ed', () => {
    // Arrange — a .js path (passes the extension gate) that does not exist, so
    // safeFs.statSync throws ENOENT inside shouldScan.
    const dir = freshDir('stat-catch');
    const ghost = path.join(dir, 'ghost.js');

    // Act
    const result = new SecretsScanner(dir).shouldScan(ghost);

    // Assert — a phantom scannable file is not scannable; the catch fails closed.
    assert.equal(result, false);
  });
});

// ===========================================================================
// Cluster B — getFilesToScan (lines 488-501): directory recursion, excluded-
// directory pruning, and fail-open error recording on an unreadable root.
// ===========================================================================
describe('SecretsScanner.getFilesToScan — walk, prune, fail-open', () => {
  it('should_return_nested_scannable_file_and_prune_excluded_directory', () => {
    // Arrange — a scannable file one level deep, plus an excluded node_modules
    // subtree that must never be walked or returned.
    const root = freshDir('walk');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    const nested = path.join(root, 'src', 'app.js');
    fs.writeFileSync(nested, 'const x = 1;\n');
    fs.writeFileSync(path.join(root, 'node_modules', 'leak.js'), 'const k = "x";\n');

    // Act
    const files = new SecretsScanner(root).getFilesToScan();

    // Assert — recursion found the nested file; the excluded dir was pruned.
    assert.ok(files.includes(nested), 'nested scannable file must be walked and returned');
    assert.ok(
      !files.some((f) => f.includes('node_modules')),
      'an excluded directory must be pruned, not descended into'
    );
  });

  it('should_record_a_walk_error_when_the_root_is_unreadable_and_not_throw', () => {
    // Arrange — a root that does not exist; readdirSync throws inside walk().
    const missing = path.join(ROOT, 'does-not-exist-' + Date.now());
    const scanner = new SecretsScanner(missing);

    // Act — must fail OPEN (record + continue), never throw.
    const files = scanner.getFilesToScan();

    // Assert
    assert.deepEqual(files, [], 'an unwalkable root yields no files');
    assert.ok(
      scanner.errors.some((e) => e.kind === 'error' && e.path === missing),
      'the walk failure must be recorded in the error ledger'
    );
  });
});

// ===========================================================================
// Cluster C — detectHighEntropyStrings instance dedup (line 766): a value on a
// line ALREADY carrying a finding must be suppressed. Control proves the same
// content fires when no prior finding exists — so the empty result is due to
// the dedup, not to non-detection. Mutant removing the dedup → RED.
// ===========================================================================
describe('SecretsScanner.detectHighEntropyStrings — instance dedup', () => {
  it('should_suppress_a_high_entropy_hit_on_a_line_already_found_but_fire_otherwise', () => {
    // Arrange — a quoted high-entropy secret-named assignment on line 1.
    const relativePath = 'x.js';
    const content = `const apiToken = "${HIGH_ENTROPY}";\n`;
    const lines = content.split('\n');
    const scanner = new SecretsScanner(freshDir('he-dedup'));

    // Act — control: no prior findings → the entropy pass reports it.
    const control = scanner.detectHighEntropyStrings(content, lines, relativePath);
    // treatment: a specific-pattern finding already occupies file:line 1.
    scanner.findings = [{ file: relativePath, line: 1 }];
    const suppressed = scanner.detectHighEntropyStrings(content, lines, relativePath);

    // Assert — same input, opposite outcome, driven solely by the dedup branch.
    assert.equal(control.length, 1, 'control: entropy hit reported when line is unclaimed');
    assert.equal(suppressed.length, 0, 'treatment: entropy hit suppressed when the line is already found');
  });
});

// ===========================================================================
// Cluster D — deduplicateFindings prefer-verified REPLACE (lines 1066-1067).
// The existing suite inserts the verified finding FIRST (no replace). Here the
// UNVERIFIED one is first, so the verified one must REPLACE it. Mutant deleting
// the replace → unique[0].verified stays false → RED.
// ===========================================================================
describe('SecretsScanner.deduplicateFindings — prefer-verified replace', () => {
  it('should_replace_an_unverified_finding_with_a_later_verified_duplicate', () => {
    // Arrange — same file:line:type; unverified appears BEFORE verified.
    const scanner = new SecretsScanner(ROOT);
    scanner.findings = [
      { file: 'a.js', line: 7, type: 'AWS_ACCESS_KEY', verified: false, match: 'u' },
      { file: 'a.js', line: 7, type: 'AWS_ACCESS_KEY', verified: true, match: 'v' }
    ];

    // Act
    const unique = scanner.deduplicateFindings();

    // Assert — the verified duplicate won the slot.
    assert.equal(unique.length, 1);
    assert.equal(unique[0].verified, true, 'a later verified finding must replace the earlier unverified one');
  });
});

// ===========================================================================
// Cluster E — run() (lines 886-914) + generateSummary (lines 1081-1098).
// ===========================================================================
describe('SecretsScanner.run — end-to-end scan', () => {
  it('should_scan_a_directory_and_return_findings_summary_and_report', async () => {
    // Arrange — a single file carrying a synthetic private key.
    const root = freshDir('run');
    fs.writeFileSync(path.join(root, 'keys.js'), 'const key = `\n' + SYNTH_RSA_KEY + '`;\n');

    // Act
    const result = await new SecretsScanner(root).run();

    // Assert — the run wired scan → dedup → summary → report together.
    assert.equal(result.success, true);
    assert.equal(result.summary.filesScanned, 1, 'exactly one file was scanned');
    assert.equal(result.summary.total, result.findings.length, 'summary total tracks findings length');
    assert.ok(result.findings.some((f) => f.type === 'PRIVATE_KEY'), 'the private key must be detected');
    assert.ok(result.message.includes('Secrets Scan Report'), 'a human-readable report is produced');
  });

  it('should_sort_findings_critical_before_low', async () => {
    // Arrange — one CRITICAL (private key) and one LOW (public JWT) in one file.
    const root = freshDir('run-sort');
    fs.writeFileSync(
      path.join(root, 'mixed.js'),
      'const key = `\n' + SYNTH_RSA_KEY + '`;\nconst t = "' + JWT_DEMO + '";\n'
    );

    // Act
    const { findings } = await new SecretsScanner(root).run();

    // Assert — severity order places CRITICAL ahead of LOW.
    const idxCritical = findings.findIndex((f) => f.severity === 'CRITICAL');
    const idxLow = findings.findIndex((f) => f.severity === 'LOW');
    assert.ok(idxCritical !== -1 && idxLow !== -1, 'both a CRITICAL and a LOW finding are present');
    assert.ok(idxCritical < idxLow, 'CRITICAL must sort before LOW');
  });

  it('should_compute_summary_counts_verified_and_duration_seconds', () => {
    // Arrange — a crafted findings set + a known ms duration.
    const scanner = new SecretsScanner(ROOT);
    scanner.scannedFiles = 3;
    const findings = [
      { severity: 'CRITICAL', type: 'AWS_ACCESS_KEY', verified: true },
      { severity: 'HIGH', type: 'GENERIC_SECRET', verified: false },
      { severity: 'HIGH', type: 'GENERIC_SECRET', verified: false }
    ];

    // Act
    const summary = scanner.generateSummary(findings, 5000);

    // Assert — every counter and the ms→s conversion.
    assert.equal(summary.total, 3);
    assert.equal(summary.bySeverity.CRITICAL, 1);
    assert.equal(summary.bySeverity.HIGH, 2);
    assert.equal(summary.byType.GENERIC_SECRET, 2);
    assert.equal(summary.verified, 1, 'only the verified finding is counted');
    assert.equal(summary.filesScanned, 3);
    assert.equal(summary.duration, 5, '5000ms must round to 5 seconds');
  });
});

// ===========================================================================
// Cluster F — generateReport populated blocks (lines 1122-1167).
// ===========================================================================
describe('SecretsScanner.generateReport — populated findings', () => {
  const baseSummary = (over) => ({
    timestamp: '2026-07-15T00:00:00.000Z',
    filesScanned: 4,
    duration: 1,
    total: 0,
    verified: 0,
    bySeverity: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
    ...over
  });

  it('should_render_the_critical_block_and_mark_only_verified_findings', () => {
    // Arrange — two CRITICALs: one verified, one not.
    const scanner = new SecretsScanner(ROOT);
    const findings = [
      { type: 'AWS_ACCESS_KEY', file: 'a.js', line: 1, match: 'AKIA***MPLE', severity: 'CRITICAL', verified: true },
      { type: 'PRIVATE_KEY', file: 'b.js', line: 2, match: '---***---', severity: 'CRITICAL', verified: false }
    ];
    const summary = baseSummary({ total: 2, verified: 1, bySeverity: { CRITICAL: 2, HIGH: 0, MEDIUM: 0, LOW: 0 } });

    // Act
    const report = scanner.generateReport(findings, summary);

    // Assert — section present, both locations listed, VERIFIED shown exactly once.
    assert.ok(report.includes('CRITICAL Secrets (Immediate Action Required)'), 'critical section header present');
    assert.ok(report.includes('a.js:1') && report.includes('b.js:2'), 'both critical locations listed');
    assert.equal(
      (report.match(/Status: VERIFIED/g) || []).length,
      1,
      'the VERIFIED status must appear only for the verified finding'
    );
  });

  it('should_render_high_block_and_truncate_after_ten_with_a_more_notice', () => {
    // Arrange — 12 HIGH findings; the report caps detail at 10 and notes the rest.
    const scanner = new SecretsScanner(ROOT);
    const findings = Array.from({ length: 12 }, (_, i) => ({
      type: 'GENERIC_SECRET', file: `h${i}.js`, line: i + 1, match: 'x***y', severity: 'HIGH', verified: false
    }));
    const summary = baseSummary({ total: 12, bySeverity: { CRITICAL: 0, HIGH: 12, MEDIUM: 0, LOW: 0 } });

    // Act
    const report = scanner.generateReport(findings, summary);

    // Assert — only 10 detail rows rendered; the overflow (12-10=2) is summarised.
    assert.equal(
      (report.match(/\[GENERIC_SECRET\]/g) || []).length,
      10,
      'exactly ten HIGH findings are detailed'
    );
    assert.ok(report.includes('... and 2 more HIGH severity findings'), 'the overflow count is reported');
  });

  it('should_list_only_nonzero_severities_and_the_recommendations', () => {
    // Arrange — CRITICAL:1, HIGH:2, MEDIUM:0, LOW:0.
    const scanner = new SecretsScanner(ROOT);
    const findings = [
      { type: 'AWS_ACCESS_KEY', file: 'a.js', line: 1, match: 'AKIA***MPLE', severity: 'CRITICAL', verified: false },
      { type: 'GENERIC_SECRET', file: 'h1.js', line: 1, match: 'x***y', severity: 'HIGH', verified: false },
      { type: 'GENERIC_SECRET', file: 'h2.js', line: 2, match: 'x***y', severity: 'HIGH', verified: false }
    ];
    const summary = baseSummary({ total: 3, bySeverity: { CRITICAL: 1, HIGH: 2, MEDIUM: 0, LOW: 0 } });

    // Act
    const report = scanner.generateReport(findings, summary);

    // Assert — nonzero severities shown, zero severities omitted, recommendations present.
    assert.ok(report.includes('CRITICAL: 1') && report.includes('HIGH: 2'), 'nonzero counts listed');
    assert.ok(!report.includes('MEDIUM: 0') && !report.includes('LOW: 0'), 'zero-count severities are omitted');
    assert.ok(report.includes('Rotate all exposed credentials immediately'), 'remediation guidance present when total > 0');
  });
});

// ===========================================================================
// Cluster G — external-tool methods (lines 921-1048). child_process.execSync is
// FAKED at the module boundary (see the stub near the top): a `--version` probe
// resolves availability, scan commands return canned NDJSON/JSON, and per-test
// knobs drive the throw path. This runs deterministically on every platform with
// no subprocess — real PATH-shimmed binaries were flaky under coverage load,
// hitting the scanner's own 10s/300s execSync timeouts.
//
// DOCUMENTED UNREACHABLE (cannot be covered without malformed internal state the
// public API never emits):
//   - runWithExternalTools trufflehog catch (lines 929-930)
//   - runWithExternalTools detect-secrets catch (lines 939-940)
// Each wraps `await this.runTruffleHog()` / `await this.runDetectSecrets()`. Those
// methods are themselves fully try/caught and ALWAYS resolve with an array (they
// return [] on any error) — they can never reject — so the catch in
// runWithExternalTools is dead code. The reachable internal catches (1006-1007,
// 1044-1045) ARE covered here via the failing-shim / absent-binary path.
// ===========================================================================
describe('SecretsScanner — external tool integration', () => {
  it('should_report_tool_unavailable_for_unknown_and_available_when_version_succeeds', () => {
    // Arrange — execState.availableTools has trufflehog/detect-secrets; the stub
    // throws for any other `--version`, exercising isToolAvailable's catch.
    const scanner = new SecretsScanner(freshDir('tool-avail'));

    // Act + Assert
    assert.equal(
      scanner.isToolAvailable('definitely-not-a-real-tool'),
      false,
      'an unknown tool must resolve to unavailable via the catch'
    );
    assert.equal(
      scanner.isToolAvailable('trufflehog'),
      true,
      'a tool that answers --version is available'
    );
  });

  it('should_parse_trufflehog_ndjson_and_redact_or_fail_safe_on_absence', async () => {
    const scanner = new SecretsScanner(freshDir('truffle'));

    // Act — execSync stub returns the canned NDJSON (one valid line + one malformed).
    const findings = await scanner.runTruffleHog();

    // Assert — the one valid NDJSON line parsed (malformed line skipped), fields
    // mapped, raw value redacted.
    assert.equal(findings.length, 1, 'valid NDJSON parsed, malformed line skipped');
    const f = findings[0];
    assert.equal(f.type, 'AWS');
    assert.equal(f.severity, 'CRITICAL', 'trufflehog findings are verified → CRITICAL');
    assert.equal(f.file, '/scan/leak.js');
    assert.equal(f.line, 3);
    assert.equal(f.verified, true);
    assert.equal(f.tool, 'trufflehog');
    assert.ok(f.match.includes('***') && !f.match.includes('IOSFODNN7'), 'the raw secret is redacted');
  });

  it('should_parse_detect_secrets_json_or_fail_safe_on_absence', async () => {
    const scanner = new SecretsScanner(freshDir('detect'));

    // Act
    const findings = await scanner.runDetectSecrets();

    // Assert — the results map is flattened into one MEDIUM finding.
    assert.equal(findings.length, 1);
    const f = findings[0];
    assert.equal(f.type, 'Base64 High Entropy String');
    assert.equal(f.severity, 'MEDIUM', 'detect-secrets findings default to MEDIUM');
    assert.equal(f.file, 'config.py');
    assert.equal(f.line, 5);
    assert.equal(f.match, '***DETECTED***');
    assert.equal(f.tool, 'detect-secrets');
  });

  it('should_fail_safe_to_empty_when_an_available_external_tool_errors', async () => {
    // Arrange — the tool exists (answers --version) but the SCAN command throws,
    // exercising the internal catch in runTruffleHog / runDetectSecrets.
    const scanner = new SecretsScanner(freshDir('ext-error'));
    execState.scanThrows = true;
    try {
      // Act
      const truffle = await scanner.runTruffleHog();
      const detect = await scanner.runDetectSecrets();

      // Assert — an erroring external tool degrades to no findings, not a crash.
      assert.deepEqual(truffle, [], 'a trufflehog error yields [], never a throw');
      assert.deepEqual(detect, [], 'a detect-secrets error yields [], never a throw');
    } finally {
      execState.scanThrows = false;
    }
  });

  it('should_run_internal_scan_then_external_tools_and_return_a_wellformed_result', async () => {
    // Arrange — a real secret in the scanned root so the internal scan produces
    // at least one finding regardless of external tools.
    const root = freshDir('ext-orchestration');
    fs.writeFileSync(path.join(root, 'keys.js'), 'const key = `\n' + SYNTH_RSA_KEY + '`;\n');
    const scanner = new SecretsScanner(root);

    // Act — both external tools are "available" and return canned findings.
    const result = await scanner.runWithExternalTools();

    // Assert — orchestration completed: internal scan is present, report rebuilt.
    assert.equal(result.success, true);
    assert.ok(result.findings.some((f) => f.type === 'PRIVATE_KEY'), 'internal scan findings survive the external pass');
    assert.ok(result.message.includes('Secrets Scan Report'), 'the report is regenerated after the external pass');
    assert.equal(result.summary.total, result.findings.length, 'summary is recomputed over the final findings');
    // External-tool findings (tagged with a `tool` field; internal findings have
    // none) MUST reach the final result — the whole point of runWithExternalTools.
    assert.ok(
      result.findings.some((f) => f.tool === 'trufflehog'),
      'external TruffleHog findings must be included in the final result, not dropped'
    );
    assert.ok(
      result.findings.some((f) => f.tool === 'detect-secrets'),
      'external detect-secrets findings must be included in the final result, not dropped'
    );
  });
});
