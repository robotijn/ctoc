/**
 * The secret scanner must KEEP the secrets it finds.
 *
 * `execFileSync` THROWS on a non-zero exit — that is its documented contract.
 * TruffleHog exits NON-ZERO precisely BECAUSE it found verified secrets. So the
 * single run that matters most is the run whose output arrives attached to an
 * exception instead of a return value, and `runTruffleHog`'s catch discarded it
 * with the comment "TruffleHog may exit with non-zero if findings exist" — naming
 * the exact condition it was throwing away. A repository with a live, verified,
 * leaked credential and a clean repository produced byte-identical results.
 *
 * These tests pin BOTH halves of the distinction that makes the repair honest:
 *   • a non-zero exit CARRYING output is a REPORT — parse it, yield the findings;
 *   • a process that never completed (ENOENT, a signal, an unparseable report) is
 *     a FAILURE — record it on `scanner.errors`, never return it as a clean scan.
 * Getting either direction wrong is the original defect repeated: treating a real
 * failure as clean is the bug itself, and treating every failure as a finding
 * would cry wolf until someone disabled the scanner.
 *
 * WIRING. Cases 11-13 drive `qualityAgent.runSecurityScan` — the live security
 * scan reached from `src/commands/push.js` — because before this slice NOTHING in
 * `src/` called `runTruffleHog`, `runDetectSecrets` or `runWithExternalTools`. A
 * repaired path no human can reach is not a repair.
 *
 * SEAM. `secrets-scanner.js` DESTRUCTURES `execFileSync`/`execSync` from
 * `child_process` at module load, so the binding cannot be replaced on the live
 * module object. The seam is therefore: patch the `child_process` exports, drop
 * `secrets-scanner` (and `quality-agent`, which holds it) from `require.cache`,
 * and re-require. Every line of the recovery, parsing, redaction and
 * classification logic under test is the REAL code; only the process boundary is
 * replaced. No test invokes a real external binary — requiring TruffleHog to be
 * installed would force a platform-conditional skip, and a skip is a gate failure
 * under the zero-skipped rule.
 *
 * FIXTURES. Per this repository's rule, every secret-shaped fixture value is a
 * generic high-entropy literal — never a real provider format (no `sk_live_`, no
 * `ghp_`, no `AKIA`). GitHub push protection rejects the push otherwise, and the
 * bypass must never be used.
 */

'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const SCANNER_PATH = require.resolve('../src/lib/secrets-scanner');
const QUALITY_AGENT_PATH = require.resolve('../src/lib/quality-agent');

const ORIGINAL_EXEC_FILE_SYNC = cp.execFileSync;
const ORIGINAL_EXEC_SYNC = cp.execSync;

/** A generic high-entropy literal. Deliberately matches no provider's format. */
const HIGH_ENTROPY_LITERAL = 'Zq7bV2mK9pR1sT6uX3yA8cE5gJ0hLw4N';

/** Drop the modules that captured `child_process` so a re-require re-captures it. */
function dropSeamedModules() {
  delete require.cache[SCANNER_PATH];
  delete require.cache[QUALITY_AGENT_PATH];
}

/**
 * Install a fake process boundary and return a FRESH `secrets-scanner` module.
 * @param {{execFileSync?: Function, execSync?: Function}} fakes
 */
function loadScannerWith(fakes) {
  if (fakes.execFileSync) cp.execFileSync = fakes.execFileSync;
  if (fakes.execSync) cp.execSync = fakes.execSync;
  dropSeamedModules();
  return require(SCANNER_PATH);
}

/** Install a fake process boundary and return a FRESH `quality-agent` module. */
function loadQualityAgentWith(fakes) {
  if (fakes.execFileSync) cp.execFileSync = fakes.execFileSync;
  if (fakes.execSync) cp.execSync = fakes.execSync;
  dropSeamedModules();
  return require(QUALITY_AGENT_PATH);
}

function restore() {
  cp.execFileSync = ORIGINAL_EXEC_FILE_SYNC;
  cp.execSync = ORIGINAL_EXEC_SYNC;
  dropSeamedModules();
}

/** An error shaped exactly as `execFileSync` throws it on a non-zero exit. */
function exitError({ status = 1, stdout = '', stderr = '', code, signal } = {}) {
  const err = new Error(`Command failed with exit code ${status}`);
  err.status = status;
  err.stdout = stdout;
  err.stderr = stderr;
  if (code !== undefined) err.code = code;
  if (signal !== undefined) {
    err.signal = signal;
    err.status = null;
  }
  return err;
}

function truffleRecord(detector, file, line, raw) {
  return JSON.stringify({
    DetectorName: detector,
    Raw: raw,
    SourceMetadata: { Data: { Filesystem: { file, line } } }
  });
}

/** `execSync` fake that answers only the `--version` availability probe. */
function versionProbe(available) {
  return (command) => {
    if (typeof command === 'string' && command.includes('--version')) {
      if (available) return '';
      throw new Error('command not found');
    }
    throw new Error(`unexpected execSync in test: ${command}`);
  };
}

describe('secrets scanner — a non-zero exit carrying findings is parsed, not discarded', () => {
  afterEach(() => restore());

  it('case 1: a non-zero exit carrying findings YIELDS those findings', async () => {
    const stdout = [
      truffleRecord('GenericApiKey', '/repo/config.env', 12, HIGH_ENTROPY_LITERAL),
      truffleRecord('PrivateKeyMaterial', '/repo/deploy/key.pem', 3, HIGH_ENTROPY_LITERAL)
    ].join('\n');

    const { SecretsScanner } = loadScannerWith({
      execFileSync: () => { throw exitError({ status: 183, stdout }); }
    });
    const scanner = new SecretsScanner('/repo');
    const findings = await scanner.runTruffleHog();

    assert.equal(findings.length, 2, 'the findings carried by the exception must survive');
    for (const f of findings) {
      assert.equal(f.severity, 'CRITICAL');
      assert.equal(f.verified, true);
      assert.equal(f.tool, 'trufflehog');
    }
    assert.equal(findings[0].type, 'GenericApiKey');
    assert.equal(findings[0].file, '/repo/config.env');
    assert.equal(findings[0].line, 12);
    assert.equal(findings[1].type, 'PrivateKeyMaterial');
    assert.deepEqual(scanner.errors, [], 'a report is not a failure');
  });

  it('case 2: the secret value is still redacted on the throw path', async () => {
    const stdout = truffleRecord('GenericApiKey', '/repo/config.env', 12, HIGH_ENTROPY_LITERAL);
    const { SecretsScanner } = loadScannerWith({
      execFileSync: () => { throw exitError({ status: 183, stdout }); }
    });
    const scanner = new SecretsScanner('/repo');
    const findings = await scanner.runTruffleHog();

    assert.equal(findings.length, 1);
    assert.ok(!findings[0].match.includes(HIGH_ENTROPY_LITERAL),
      'the raw secret must never reach a finding');
    assert.ok(findings[0].match.includes('***'), 'redactSecret shape must be preserved');
  });

  it('case 3: a genuine tool failure is an ERROR, not a clean scan', async () => {
    const { SecretsScanner } = loadScannerWith({
      execFileSync: () => { throw exitError({ status: null, code: 'ENOENT' }); }
    });
    const scanner = new SecretsScanner('/repo');
    const findings = await scanner.runTruffleHog();

    assert.deepEqual(findings, []);
    assert.equal(scanner.errors.length, 1, 'a failed scan must be recorded, never silent');
    assert.equal(scanner.errors[0].tool, 'trufflehog');
    assert.equal(scanner.errors[0].kind, 'error');
    assert.match(scanner.errors[0].error, /DID NOT RUN/);
  });

  it('case 4: a timeout is a failure, never a clean scan', async () => {
    const partial = truffleRecord('GenericApiKey', '/repo/a.env', 1, HIGH_ENTROPY_LITERAL);
    const { SecretsScanner } = loadScannerWith({
      execFileSync: () => { throw exitError({ signal: 'SIGTERM', stdout: partial }); }
    });
    const scanner = new SecretsScanner('/repo');
    const findings = await scanner.runTruffleHog();

    assert.deepEqual(findings, [], 'a truncated scan must not be reported as a complete one');
    assert.equal(scanner.errors.length, 1);
    assert.match(scanner.errors[0].error, /DID NOT RUN/);
  });

  it('case 5: a clean zero-finding scan stays clean', async () => {
    const { SecretsScanner } = loadScannerWith({ execFileSync: () => '' });
    const scanner = new SecretsScanner('/repo');
    const findings = await scanner.runTruffleHog();

    assert.deepEqual(findings, []);
    assert.deepEqual(scanner.errors, [], 'a clean scan must raise no false alarm');
  });

  it('case 6: all-noise output is reported as not-performed', async () => {
    const noise = ['scanning...', '2 chunks scanned', 'done'].join('\n');
    const { SecretsScanner } = loadScannerWith({ execFileSync: () => noise });
    const scanner = new SecretsScanner('/repo');
    const findings = await scanner.runTruffleHog();

    assert.deepEqual(findings, []);
    assert.equal(scanner.errors.length, 1,
      'all noise and zero findings is a changed output format, not a clean repository');
    assert.match(scanner.errors[0].error, /unparseable output line/);
    assert.ok(!scanner.errors[0].error.includes('chunks scanned'),
      'no raw output content may reach an error message');
  });

  it('case 7: noise alongside a real finding stays quiet', async () => {
    const out = [
      'scanning...',
      truffleRecord('GenericApiKey', '/repo/config.env', 12, HIGH_ENTROPY_LITERAL)
    ].join('\n');
    const { SecretsScanner } = loadScannerWith({ execFileSync: () => out });
    const scanner = new SecretsScanner('/repo');
    const findings = await scanner.runTruffleHog();

    assert.equal(findings.length, 1);
    assert.deepEqual(scanner.errors, [],
      'progress lines beside real findings are normal and must not flood the signal');
  });

  it('case 8: detect-secrets — a non-zero exit with a parseable report yields findings', async () => {
    const report = JSON.stringify({
      results: { 'config.env': [{ type: 'Base64 High Entropy String', line_number: 7 }] }
    });
    const { SecretsScanner } = loadScannerWith({
      execFileSync: () => { throw exitError({ status: 1, stdout: report }); }
    });
    const scanner = new SecretsScanner('/repo');
    const findings = await scanner.runDetectSecrets();

    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'MEDIUM');
    assert.equal(findings[0].file, 'config.env');
    assert.equal(findings[0].line, 7);
    assert.deepEqual(scanner.errors, [], 'a parseable report is not a failure');
  });

  it('case 9: detect-secrets — a non-zero exit with unparseable output is an error', async () => {
    const { SecretsScanner } = loadScannerWith({
      execFileSync: () => {
        throw exitError({ status: 2, stdout: 'usage: detect-secrets [-h] ...' });
      }
    });
    const scanner = new SecretsScanner('/repo');
    const findings = await scanner.runDetectSecrets();

    assert.deepEqual(findings, []);
    assert.equal(scanner.errors.length, 1);
    assert.equal(scanner.errors[0].tool, 'detect-secrets');
    assert.match(scanner.errors[0].error, /DID NOT RUN/);
  });

  it('case 10: no raw output reaches an error message', async () => {
    const { SecretsScanner } = loadScannerWith({
      execFileSync: () => {
        throw exitError({
          status: 2,
          stdout: `usage error near ${HIGH_ENTROPY_LITERAL}`,
          stderr: `traceback referencing ${HIGH_ENTROPY_LITERAL}`
        });
      }
    });
    const scanner = new SecretsScanner('/repo');
    await scanner.runDetectSecrets();

    assert.equal(scanner.errors.length, 1);
    assert.ok(!scanner.errors[0].error.includes(HIGH_ENTROPY_LITERAL),
      'the recovered stream is secret material and must never be echoed');
  });
});

describe('the live security scan reaches the repaired path', () => {
  let root = null;

  afterEach(async () => {
    restore();
    if (root) {
      await fs.promises.rm(root, { recursive: true, force: true });
      root = null;
    }
  });

  async function makeProject() {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ctoc-secrets-wiring-'));
    await fs.promises.writeFile(path.join(dir, 'readme.md'), '# nothing to see\n', 'utf8');
    return dir;
  }

  it('case 11: a verified TruffleHog finding reaches runSecurityScan and counts as CRITICAL', async () => {
    root = await makeProject();
    const stdout = truffleRecord('GenericApiKey', path.join(root, 'readme.md'), 1, HIGH_ENTROPY_LITERAL);

    const qualityAgent = loadQualityAgentWith({
      execSync: versionProbe(true),
      execFileSync: (file) => {
        if (file === 'trufflehog') throw exitError({ status: 183, stdout });
        if (file === 'detect-secrets') return JSON.stringify({ results: {} });
        throw exitError({ status: 127, code: 'ENOENT' });
      }
    });

    const result = await qualityAgent.runSecurityScan({}, { projectRoot: root, allFiles: true });

    assert.ok(result.critical >= 1,
      'the verified external finding must reach the gate as CRITICAL');
    assert.match(result.details, /GenericApiKey/,
      'the finding must be named in the reported detail');
  });

  it('case 12: an uninstalled tool is a VISIBLE skip', async () => {
    root = await makeProject();

    const qualityAgent = loadQualityAgentWith({
      execSync: versionProbe(false),
      execFileSync: () => { throw exitError({ status: 127, code: 'ENOENT' }); }
    });

    const result = await qualityAgent.runSecurityScan({}, { projectRoot: root, allFiles: true });

    const truffleSkip = result.skipped.find(s => s.includes('trufflehog'));
    assert.ok(truffleSkip, 'a missing external scanner must be visible, not invisible');
    assert.match(truffleSkip, /NOT performed/);
    assert.equal(result.critical, 0, 'a missing tool is not a finding and must not block');
  });

  it('case 13: a tool failure does not crash the push path', async () => {
    root = await makeProject();

    const qualityAgent = loadQualityAgentWith({
      execSync: versionProbe(true),
      execFileSync: (file) => {
        if (file === 'trufflehog' || file === 'detect-secrets') {
          throw exitError({ status: null, code: 'ENOENT' });
        }
        throw exitError({ status: 127, code: 'ENOENT' });
      }
    });

    const result = await qualityAgent.runSecurityScan({}, { projectRoot: root, allFiles: true });

    assert.ok(Array.isArray(result.skipped));
    const reported = result.skipped.find(s => /trufflehog/.test(s) && /DID NOT RUN/.test(s));
    assert.ok(reported,
      'a failed external scan must surface through the scanner.errors fold, not vanish');
  });
});
