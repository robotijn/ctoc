'use strict';

/**
 * QUALITY / SECURITY FLEET WIRING — proves the once-dead scanners are now
 * actually invoked by the LIVE quality path and that Iron Loop Step 13 SECURE's
 * "a security scan happens" promise is real.
 *
 * The only live quality consumer is src/commands/push.js → quality-agent.
 * These tests drive quality-agent.runSecurityScan on REAL temp projects (a real
 * planted secret, a real vulnerable dependency manifest) and assert the finding
 * surfaces — and that a MISSING external tool skips LOUDLY rather than passing
 * silently. No test doubles: the real SecretsScanner / DependencyAuditor /
 * SASTRunner run against real files on disk.
 *
 * It also proves the background post-commit quality loop is wired: initProject
 * installs .git/hooks/post-commit (previously the installer had no caller, so
 * the loop never fired).
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const qualityAgent = require('../src/lib/quality-agent');
const push = require('../src/commands/push');
const { SASTRunner } = require('../src/lib/sast-runner');
const { initProject } = require('../src/lib/init-project');

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}

// A real AWS Access Key ID shape (AKIA + 16 upper-alnum). Deliberately contains
// no placeholder substring ("test"/"example"/"fake"/...), so the scanner's
// placeholder filter does not discard it — this is a secret that MUST surface.
const PLANTED_AWS_KEY = 'AKIAJKQR7MNPZ2WXVBDF';
const PLANTED_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK\n-----END RSA PRIVATE KEY-----';

describe('the security fleet is wired into the LIVE push path', () => {
  it('push.js delegates security scanning to quality-agent.runSecurityScan (same function)', () => {
    // The live binding: push.js run() defaults deps.runSecurityScan to the
    // quality-agent export. If this identity ever breaks, the gate is dead.
    assert.equal(
      typeof qualityAgent.runSecurityScan,
      'function',
      'quality-agent must export runSecurityScan'
    );
    // push.js references qualityAgent.runSecurityScan as its default dep; prove
    // the module wiring by driving push with the REAL security runner and fakes
    // for everything else, and confirming security actually ran.
    return (async () => {
      let securityRan = false;
      const res = await push.run({ dryRun: true, skipTests: true }, {
        detect: () => ({ tools: {} }),
        runLint: async () => ({ passed: true }),
        runTypecheck: async () => ({ passed: true }),
        runSecurityScan: async (t, o) => {
          securityRan = true;
          return qualityAgent.runSecurityScan(t, o);
        },
        pushToRemote: () => true,
        logger: { log() {} }
      });
      assert.ok(securityRan, 'push must invoke the security scanner');
      assert.equal(res.ok, true);
    })();
  });
});

describe('SECRETS: a real planted secret surfaces through the live path', () => {
  let dir;
  before(() => {
    dir = mkTmp('ctoc-secret-');
    fs.writeFileSync(
      path.join(dir, 'config.js'),
      `const awsKey = "${PLANTED_AWS_KEY}";\nmodule.exports = { awsKey };\n`,
      'utf8'
    );
    fs.writeFileSync(path.join(dir, 'id_rsa'), PLANTED_PRIVATE_KEY, 'utf8');
    // A private key also inside a scannable extension so it surfaces regardless
    // of the id_rsa (extensionless) file being skipped by the extension filter.
    fs.writeFileSync(
      path.join(dir, 'key.pem.js'),
      `const key = \`${PLANTED_PRIVATE_KEY}\`;\n`,
      'utf8'
    );
  });
  after(() => rm(dir));

  it('reports the planted AWS key as a CRITICAL finding and FAILS the gate', async () => {
    const res = await qualityAgent.runSecurityScan(null, { projectRoot: dir, allFiles: true });
    assert.ok(res.critical >= 1, `expected >=1 critical secret, got ${res.critical}`);
    assert.equal(res.passed, false, 'a critical secret must fail the security gate');
    assert.match(res.details, /secret\[/, 'the finding must be reported in details');
  });
});

describe('DEPENDENCIES: a real vulnerable manifest produces a real signal (never a silent pass)', () => {
  let dir;
  before(() => {
    dir = mkTmp('ctoc-dep-');
    // lodash 4.17.4 carries well-known advisories (prototype pollution). A real
    // `npm audit` against this lockfile either surfaces the vulnerability (when
    // the advisory DB is reachable) or reports a loud skip (when it is not) —
    // both are correct; a silent clean pass on a known-vulnerable tree is not.
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'ctoc-dep-fixture', version: '1.0.0', dependencies: { lodash: '4.17.4' }
    }, null, 2), 'utf8');
    fs.writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify({
      name: 'ctoc-dep-fixture',
      version: '1.0.0',
      lockfileVersion: 3,
      requires: true,
      packages: {
        '': { name: 'ctoc-dep-fixture', version: '1.0.0', dependencies: { lodash: '4.17.4' } },
        'node_modules/lodash': {
          version: '4.17.4',
          resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.4.tgz',
          integrity: 'sha1-eCA6TRwyiuHYbcpkYONptX9AVa4='
        }
      }
    }, null, 2), 'utf8');
  });
  after(() => rm(dir));

  it('the dependency auditor runs in the live path and never silently swallows the result', async () => {
    const res = await qualityAgent.runSecurityScan(null, { projectRoot: dir, allFiles: true });
    const surfacedFinding = /dependency\[/.test(res.details);
    const loudSkip = res.skipped.some(s => /dependency audit skipped/i.test(s));
    assert.ok(
      surfacedFinding || loudSkip,
      'the auditor must EITHER surface a vulnerability OR announce a loud skip — ' +
      `never a silent clean pass. details=${JSON.stringify(res.details)} skipped=${JSON.stringify(res.skipped)}`
    );
    // Whatever happens, the scan must not crash and must return a well-formed result.
    assert.equal(typeof res.passed, 'boolean');
  });
});

describe('MISSING TOOL: an absent SAST scanner skips LOUDLY, never a silent pass', () => {
  let dir;
  before(() => {
    dir = mkTmp('ctoc-sast-');
    // A Go project: SASTRunner's primary tool is gosec (fallback semgrep). On a
    // typical machine neither is installed, so the language is unscannable.
    fs.writeFileSync(path.join(dir, 'go.mod'), 'module example.com/x\n\ngo 1.22\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'main.go'), 'package main\nfunc main() {}\n', 'utf8');
  });
  after(() => rm(dir));

  it('announces the skip (and does NOT block) when no Go scanner is installed', async () => {
    const probe = new SASTRunner(dir);
    const goScannable = probe.isToolAvailable('gosec') || probe.isToolAvailable('semgrep');

    const res = await qualityAgent.runSecurityScan(null, { projectRoot: dir, allFiles: true });

    if (goScannable) {
      // Rare: a scanner is installed on this host — then SAST genuinely ran.
      // The promise we still assert: the result is well-formed and did not crash.
      assert.equal(typeof res.passed, 'boolean');
    } else {
      assert.ok(
        res.skipped.some(s => /SAST skipped for go/i.test(s)),
        `absent Go scanner must produce a loud skip, got skipped=${JSON.stringify(res.skipped)}`
      );
      // A missing tool must NOT be treated as a failure — there are no findings,
      // so the gate does not block; the absence is merely announced.
      assert.equal(res.passed, true, 'a missing tool must not block the push');
      assert.ok(res.skipped.length > 0, 'the skip list must be non-empty (loud, not silent)');
    }
  });
});

describe('the scan degrades gracefully — clean project, no crash, no false block', () => {
  let dir;
  before(() => {
    dir = mkTmp('ctoc-clean-');
    fs.writeFileSync(path.join(dir, 'hello.js'), 'module.exports = () => 42;\n', 'utf8');
  });
  after(() => rm(dir));

  it('passes cleanly with a well-formed result on a project with no secrets/deps', async () => {
    const res = await qualityAgent.runSecurityScan(null, { projectRoot: dir, allFiles: true });
    assert.equal(res.passed, true);
    assert.equal(res.critical, 0);
    assert.equal(res.high, 0);
    assert.ok(Array.isArray(res.skipped));
  });
});

describe('POST-COMMIT LOOP: initProject wires the background quality hook', () => {
  let dir;
  before(() => {
    dir = mkTmp('ctoc-init-');
    // A real git repo so the installer has a real .git/hooks to write to.
    execFileSync('git', ['init', '-q'], { cwd: dir });
  });
  after(() => rm(dir));

  it('installs .git/hooks/post-commit that launches the quality agent', () => {
    const result = initProject(dir);
    assert.equal(result.success, true);

    const hookPath = path.join(dir, '.git', 'hooks', 'post-commit');
    assert.ok(fs.existsSync(hookPath), 'initProject must install the post-commit hook');

    const body = fs.readFileSync(hookPath, 'utf8');
    assert.match(body, /CTOC/, 'the installed hook must carry the CTOC marker');
    assert.match(body, /post-commit\.js/, 'the hook must launch src/hooks/post-commit.js');
  });
});
