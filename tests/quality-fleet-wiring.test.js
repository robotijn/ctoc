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

/**
 * Run a git command in a repo, returning trimmed stdout. Deterministic identity
 * so commits do not depend on the host's git config.
 */
function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'ctoc-test', GIT_AUTHOR_EMAIL: 'ctoc@test.invalid',
      GIT_COMMITTER_NAME: 'ctoc-test', GIT_COMMITTER_EMAIL: 'ctoc@test.invalid'
    }
  }).trim();
}

describe('the security fleet is wired into the LIVE push path (DEFAULT binding, real delta)', () => {
  it('push.run with NO injected security dep BLOCKS on a secret committed two commits back', async () => {
    // R4-A item 4+5: the OLD scope was `git diff HEAD~1` — the last commit only —
    // so a secret two commits back and not yet pushed was NEVER scanned, and the
    // wiring test injected its own wrapper (the gate could be replaced by
    // `async () => ({passed:true})` and the test would still pass). This drives
    // the DEFAULT binding (real quality-agent.runSecurityScan) against a real git
    // repo whose push delta (@{upstream}..HEAD) contains a planted secret two
    // commits back — and asserts push is BLOCKED.
    assert.equal(typeof qualityAgent.runSecurityScan, 'function', 'quality-agent must export runSecurityScan');

    const work = mkTmp('ctoc-pushdelta-');
    const upstream = mkTmp('ctoc-upstream-');
    try {
      git(['init', '--bare'], upstream);
      git(['init'], work);
      git(['remote', 'add', 'origin', upstream], work);

      // c1: benign, pushed → establishes the upstream baseline.
      fs.writeFileSync(path.join(work, 'readme.md'), '# ok\n');
      git(['add', '-A'], work);
      git(['commit', '-m', 'c1 baseline'], work);
      git(['push', '-u', 'origin', 'HEAD'], work);

      // c2: the SECRET, two commits back from HEAD, NOT yet pushed.
      fs.writeFileSync(path.join(work, 'config.js'), `const awsKey = "${PLANTED_AWS_KEY}";\nmodule.exports = { awsKey };\n`);
      git(['add', '-A'], work);
      git(['commit', '-m', 'c2 add config'], work);

      // c3: benign HEAD. `git diff HEAD~1` would see ONLY this — missing the secret.
      fs.writeFileSync(path.join(work, 'notes.md'), 'notes\n');
      git(['add', '-A'], work);
      git(['commit', '-m', 'c3 notes'], work);

      // The REAL default security scanner runs (NOT injected). Only the
      // toolchain detection and skipTests isolate it so security is the variable.
      const res = await push.run({ dryRun: true, skipTests: true, projectRoot: work }, {
        detect: () => ({ tools: {} }),
        runLint: async () => ({ passed: true }),
        runTypecheck: async () => ({ passed: true }),
        pushToRemote: () => true,
        logger: { log() {} }
      });
      assert.equal(res.ok, false, 'a secret in the push delta must BLOCK the push');
      assert.ok(res.blockedBy.includes('security'), `security must be the blocker; got: ${JSON.stringify(res.blockedBy)}`);
    } finally {
      rm(work);
      rm(upstream);
    }
  });

  it('the DEFAULT security scanner catches the two-commits-back secret via the real delta scope', async () => {
    // Directly drive runSecurityScan with its LIVE default (allFiles NOT set), the
    // exact mode production uses, against the same real-git two-commits-back layout.
    const work = mkTmp('ctoc-delta-');
    const upstream = mkTmp('ctoc-delta-up-');
    try {
      git(['init', '--bare'], upstream);
      git(['init'], work);
      git(['remote', 'add', 'origin', upstream], work);
      fs.writeFileSync(path.join(work, 'readme.md'), '# ok\n');
      git(['add', '-A'], work); git(['commit', '-m', 'c1'], work); git(['push', '-u', 'origin', 'HEAD'], work);
      fs.writeFileSync(path.join(work, 'config.js'), `const awsKey = "${PLANTED_AWS_KEY}";\n`);
      git(['add', '-A'], work); git(['commit', '-m', 'c2 secret'], work);
      fs.writeFileSync(path.join(work, 'notes.md'), 'x\n');
      git(['add', '-A'], work); git(['commit', '-m', 'c3'], work);

      // LIVE default path: no allFiles, no explicit file list — scopes to the delta.
      const res = await qualityAgent.runSecurityScan(null, { projectRoot: work });
      assert.ok(res.critical >= 1, `the delta scan must catch the secret two commits back; got critical=${res.critical}`);
      assert.equal(res.passed, false, 'a critical secret in the push delta must fail the gate');
    } finally {
      rm(work);
      rm(upstream);
    }
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

describe('SECRETS SKIP HONESTY: a file too large to scan is surfaced in skipped[], never a silent clean pass', () => {
  it('an oversized file (> maxFileSize) appears by name in the security result skipped[]', async () => {
    // The SecretsScanner records an oversized file in scanner.errors (shouldScan
    // pushes {file, error} when stats.size > maxFileSize) but runSecurityScan used
    // to read ONLY deduplicateFindings() and DISCARD scanner.errors — so a file too
    // large to scan counted as a silent clean pass. Plant a > 1MB (default
    // maxFileSize) scannable file with NO secret in it: it must show up in skipped[]
    // (it was NOT scanned), and it must NOT block the gate (a skip is not a finding).
    const dir = mkTmp('ctoc-oversized-');
    try {
      // 1.5MB of benign, secret-free content in a scannable (.js) file.
      const big = 'const x = 1;\n'.repeat(Math.ceil((1.5 * 1024 * 1024) / 13));
      fs.writeFileSync(path.join(dir, 'huge.js'), big, 'utf8');

      const res = await qualityAgent.runSecurityScan(null, { projectRoot: dir, allFiles: true });

      assert.ok(Array.isArray(res.skipped), 'skipped must be an array');
      assert.ok(
        res.skipped.some((s) => /huge\.js/.test(s) && /(size|large|maxFileSize|unscanned|not scanned)/i.test(s)),
        `the oversized file must be surfaced in skipped[]; got skipped=${JSON.stringify(res.skipped)}`
      );
      // A skipped file is not a finding — it must not block the gate.
      assert.equal(res.passed, true, 'a skipped oversized file must NOT block the gate');
      assert.equal(res.critical, 0, 'no critical finding from a skipped file');
    } finally {
      rm(dir);
    }
  });

  it('a normal small clean project produces NO spurious secrets-skip entry', async () => {
    // The mirror: a clean project with only small, readable files must not emit any
    // secrets file-skip line — the skip surfacing is precise, not noisy.
    const dir = mkTmp('ctoc-small-clean-');
    try {
      fs.writeFileSync(path.join(dir, 'ok.js'), 'module.exports = () => 7;\n', 'utf8');

      const res = await qualityAgent.runSecurityScan(null, { projectRoot: dir, allFiles: true });

      assert.ok(
        !res.skipped.some((s) => /secrets scan skipped file/i.test(s)),
        `a clean small project must emit no secrets file-skip; got skipped=${JSON.stringify(res.skipped)}`
      );
      assert.equal(res.passed, true);
    } finally {
      rm(dir);
    }
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

describe('SAST HONESTY: a parser-less-tool language skips when semgrep is absent (CR5-FIX F3)', () => {
  let dir;
  before(() => {
    dir = mkTmp('ctoc-java-sast-');
    // A Java project. Java's SAST "primary" is spotbugs — which this runner has NO
    // parser for — so a Java scan is only real via the multi-language semgrep pass.
    fs.writeFileSync(path.join(dir, 'pom.xml'), '<project></project>\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'Main.java'), 'class Main {}\n', 'utf8');
  });
  after(() => rm(dir));

  it('java + mvn-present + semgrep-absent yields an honest per-language skip, never a silent scanned:true', async () => {
    // Reproduce the EXACT defective environment: the old scannable filter used
    // isToolAvailable(TOOL_CONFIGS.java.primary) === isToolAvailable('spotbugs')
    // (which shells `mvn --version`). With Maven installed but semgrep absent, java
    // was marked scannable, yet runLanguageScanner('java') returns false (spotbugs
    // has no parser) and semgrep is gone — so java was scanned by NOTHING with no
    // per-language skip printed. Mock isToolAvailable (an EXTERNAL host probe) to
    // force that environment deterministically on any host.
    const orig = SASTRunner.prototype.isToolAvailable;
    SASTRunner.prototype.isToolAvailable = function (tool) {
      if (tool === 'semgrep') return false;   // the only tool that can PARSE a java scan — absent
      if (tool === 'spotbugs') return true;   // `mvn --version` succeeds (Maven installed)
      return false;
    };
    try {
      const res = await qualityAgent.runSecurityScan(null, { projectRoot: dir, allFiles: true });
      assert.ok(
        res.skipped.some(s => /SAST skipped for java/i.test(s)),
        `java with no semgrep must skip LOUDLY per-language, got skipped=${JSON.stringify(res.skipped)}`
      );
      // An honest skip is not a finding — the gate must not falsely block.
      assert.equal(res.passed, true, 'a missing scanner must not block the push');
    } finally {
      SASTRunner.prototype.isToolAvailable = orig;
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

/**
 * Capture everything a function logs to console.log while it runs, restoring the
 * real console afterward. runSecurityScan / printSummary write the human-facing
 * story through console.log, so the story IS the thing under test here.
 */
async function captureLog(fn) {
  const orig = console.log;
  const lines = [];
  console.log = (...a) => lines.push(a.map(String).join(' '));
  let res;
  try {
    res = await fn();
  } finally {
    console.log = orig;
  }
  return { res, out: lines.join('\n') };
}

const { SCARunner } = require('../src/lib/sca-runner');

describe('F1 — SCA coverage hole: a manager DependencyAuditor does NOT implement must route to SCA, never be silently deferred', () => {
  it('a pipenv-only python repo (Pipfile.lock, unimplemented by DependencyAuditor) is NOT falsely reported "covered" — SCA is reached', async () => {
    // Pipfile is a python detection marker for SCARunner AND a config marker for
    // DependencyAuditor, so DependencyAuditor DETECTS `pipenv` — but its runAudit
    // switch has NO pipenv arm (IMPLEMENTED_MANAGERS excludes pipenv), so it audits
    // NOTHING here. The old orchestrator computed deferral from the STATIC
    // COVERED_LANGUAGES (which contains python unconditionally because `pip` is
    // implemented), so it deferred python to DependencyAuditor and short-circuited
    // with "all detected ecosystems covered by DependencyAuditor — nothing further
    // to audit" — sca.run() was NEVER called and the Pipfile.lock dependency set was
    // audited by NEITHER runner while the gate returned passed:true. Deferral must
    // key on the PER-PROJECT audited set (auditedLanguagesFor), which is empty here.
    const dir = mkTmp('ctoc-pipenv-');
    try {
      fs.writeFileSync(path.join(dir, 'Pipfile'), '[[source]]\nname = "pypi"\n', 'utf8');
      fs.writeFileSync(path.join(dir, 'Pipfile.lock'), '{"_meta": {}, "default": {}}', 'utf8');
      fs.writeFileSync(path.join(dir, 'app.py'), 'print("hi")\n', 'utf8');

      const { res, out } = await captureLog(() =>
        qualityAgent.runSecurityScan(null, { projectRoot: dir, allFiles: true })
      );

      // The exact false claim the hole produced must NOT appear: python is NOT
      // covered by DependencyAuditor for a pipenv-only project. (host-independent.)
      assert.doesNotMatch(
        out,
        /all detected ecosystems covered by DependencyAuditor/,
        `python must NOT be falsely deferred to DependencyAuditor for a pipenv-only repo; SCA log was:\n${out}`
      );
      assert.doesNotMatch(
        out,
        /SCA: python deferred to DependencyAuditor/,
        `python must NOT be listed as deferred to DependencyAuditor for a pipenv-only repo; SCA log was:\n${out}`
      );

      // And the honest positive: python must be ROUTED TO SCA — either it scans, or
      // (no pip-audit / no osv-scanner on this host) it emits a LOUD per-language skip
      // that lands in skipped[]. Never a silent "covered".
      const probe = new SCARunner(dir);
      const pyScannable = probe.isToolAvailable('pip-audit') || probe.isToolAvailable('osv-scanner');
      if (pyScannable) {
        // A real SCA scanner is installed: sca.run() executed against python. The
        // result is well-formed and the outcome is visible (a finding count, or a
        // belt-and-suspenders scanned:false skip) — not the "covered" short-circuit.
        assert.equal(typeof res.passed, 'boolean');
        assert.match(
          out,
          /SCA: \d+ dependency finding\(s\)|SCA skipped/,
          `python must be scanned by SCA (or skip loudly), not silently covered; log:\n${out}`
        );
      } else {
        assert.ok(
          res.skipped.some((s) => /SCA skipped for python/i.test(s)),
          `with no python SCA scanner installed, python must skip LOUDLY, got skipped=${JSON.stringify(res.skipped)}`
        );
        // A missing scanner is not a finding — it must not falsely block the gate.
        assert.equal(res.passed, true, 'a missing scanner must not block the push');
      }
    } finally {
      rm(dir);
    }
  });

  it('a normal npm repo still defers javascript to DependencyAuditor exactly once (no regression, no double-run)', async () => {
    // npm IS implemented by DependencyAuditor, so javascript stays deferred: SCA must
    // announce the deferral and must NOT ALSO skip-or-scan javascript itself (that
    // would double-count a CVE into the human tally). Behavior identical before and
    // after the fix — javascript is in BOTH COVERED_LANGUAGES and auditedLanguagesFor.
    const dir = mkTmp('ctoc-npm-defer-');
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
        name: 'ctoc-npm-defer', version: '1.0.0', dependencies: {}
      }, null, 2), 'utf8');
      fs.writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify({
        name: 'ctoc-npm-defer', version: '1.0.0', lockfileVersion: 3, requires: true,
        packages: { '': { name: 'ctoc-npm-defer', version: '1.0.0' } }
      }, null, 2), 'utf8');
      fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = 1;\n', 'utf8');

      const { res, out } = await captureLog(() =>
        qualityAgent.runSecurityScan(null, { projectRoot: dir, allFiles: true })
      );

      assert.equal(typeof res.passed, 'boolean');
      // SCA must NOT skip javascript — it is deferred to DependencyAuditor, not
      // SCA-scanned. A javascript SCA skip would mean SCA tried to own it (regression).
      assert.ok(
        !res.skipped.some((s) => /SCA skipped for javascript/i.test(s)),
        `javascript must be DEFERRED to DependencyAuditor, not SCA-skipped; skipped=${JSON.stringify(res.skipped)}`
      );
      assert.match(
        out,
        /SCA: javascript deferred to DependencyAuditor/,
        `javascript must be announced as deferred to DependencyAuditor; log:\n${out}`
      );
    } finally {
      rm(dir);
    }
  });

  it('a requirements.txt (pip) python repo still defers python to DependencyAuditor (pip IS implemented)', async () => {
    // requirements.txt maps python via `pip`, which DependencyAuditor DOES implement,
    // so python stays deferred and must NOT be SCA-skipped. This guards against the
    // fix over-correcting and routing a genuinely-audited ecosystem to SCA.
    const dir = mkTmp('ctoc-pip-defer-');
    try {
      fs.writeFileSync(path.join(dir, 'requirements.txt'), 'flask==2.0.0\n', 'utf8');
      fs.writeFileSync(path.join(dir, 'app.py'), 'print("hi")\n', 'utf8');

      const { res, out } = await captureLog(() =>
        qualityAgent.runSecurityScan(null, { projectRoot: dir, allFiles: true })
      );

      assert.equal(typeof res.passed, 'boolean');
      assert.ok(
        !res.skipped.some((s) => /SCA skipped for python/i.test(s)),
        `python (pip) must be DEFERRED to DependencyAuditor, not SCA-skipped; skipped=${JSON.stringify(res.skipped)}`
      );
      assert.match(
        out,
        /SCA: python deferred to DependencyAuditor|all detected ecosystems covered by DependencyAuditor/,
        `python (pip) must be announced as covered by DependencyAuditor; log:\n${out}`
      );
    } finally {
      rm(dir);
    }
  });
});

describe('F2 — the QUALITY SUMMARY must surface skipped security scanners (partial coverage is not a clean pass)', () => {
  function baseResults(security) {
    return {
      allPassed: true,
      tier1: {
        lint: { passed: true },
        typecheck: { passed: true },
        tests: { passed: true },
        security
      },
      tier2: {}
    };
  }

  it('renders the skipped scanner count on the Security line when scanners were skipped', async () => {
    const results = baseResults({
      passed: true,
      skipped: [
        'SCA skipped for python: no dependency scanner installed (need pip-audit or osv-scanner)',
        'SAST skipped for go: no scanner installed (need semgrep or gosec)'
      ]
    });
    const { out } = await captureLog(async () => qualityAgent.printSummary(results, 1000));

    // The human's takeaway box must not claim an unqualified PASS while 2 scanners
    // never ran — the count of skips must appear on (or beside) the Security line.
    const securityLine = out.split('\n').find((l) => /Security:/.test(l)) || '';
    assert.match(
      securityLine,
      /2 scanner\(s\) skipped/,
      `the Security summary line must surface the 2 skipped scanners; got: ${JSON.stringify(securityLine)}\nfull:\n${out}`
    );
  });

  it('leaves the Security line an unqualified PASS when nothing was skipped', async () => {
    const results = baseResults({ passed: true, skipped: [] });
    const { out } = await captureLog(async () => qualityAgent.printSummary(results, 1000));

    const securityLine = out.split('\n').find((l) => /Security:/.test(l)) || '';
    assert.match(securityLine, /Security:\s+PASS/, `expected a clean PASS, got: ${JSON.stringify(securityLine)}`);
    assert.doesNotMatch(
      securityLine,
      /skipped/i,
      `a fully-scanned clean result must carry NO skip note; got: ${JSON.stringify(securityLine)}`
    );
  });
});

/**
 * DEFECT 1+2 — a poetry.lock/uv.lock python repo must reach osv-scanner through the
 * PRODUCTION caller runSecurityScan (NOT sca.run() directly — a sca.run() unit test is
 * the exact false-green that hid this; the dead path is the quality-agent orchestrator).
 *
 * These drive the LIVE runSecurityScan against real temp repos. Tool availability +
 * osv output are controlled by mocking child_process (execFileSync/execSync) and
 * RELOADING the fleet modules that capture those functions at load time, so the whole
 * quality-agent → sca-runner chain is exercised with a deterministic, host-independent
 * osv result. Only the external process boundary is mocked; the real parseOSVResults /
 * routing / orchestration logic runs.
 */
const cp = require('node:child_process');
const REAL_EXECSYNC = cp.execSync;
const REAL_EXECFILE = cp.execFileSync;
// Fleet modules that destructure a child_process function at load time and sit on the
// runSecurityScan path. Reloaded so a cp mock installed here reaches them.
const RELOAD_PATHS = [
  '../src/lib/dependency-auditor',
  '../src/lib/sast-runner',
  '../src/lib/sca-runner',
  '../src/lib/quality-agent'
].map((p) => require.resolve(p));

/** Reload the quality-agent (and its cp-capturing deps) AFTER installing cp mocks. */
function freshQualityAgent() {
  for (const p of RELOAD_PATHS) delete require.cache[p];
  return require(require.resolve('../src/lib/quality-agent'));
}
/** Restore the real child_process and drop the freshly-loaded fleet from the cache. */
function restoreCp() {
  cp.execSync = REAL_EXECSYNC;
  cp.execFileSync = REAL_EXECFILE;
  for (const p of RELOAD_PATHS) delete require.cache[p];
}

describe('DEFECT 1+2 — poetry.lock/uv.lock python reaches osv through runSecurityScan (PRODUCTION path)', () => {
  it('a poetry.lock-only repo with osv-scanner AVAILABLE is SCANNED via osv — the CVE surfaces, no "no language"/"covered" branch', async () => {
    const osv = {
      results: [{
        source: { path: 'poetry.lock', type: 'lockfile' },
        packages: [{
          package: { name: 'jinja2', ecosystem: 'PyPI', version: '2.10' },
          vulnerabilities: [{ id: 'PYSEC-2019-217', summary: 'SSTI in Jinja2', database_specific: { severity: 'HIGH' } }]
        }]
      }]
    };
    // osv-scanner installed + returns the poetry.lock CVE; every other tool absent.
    cp.execFileSync = (cmd, args) => {
      if (Array.isArray(args) && args.includes('--version')) {
        if (cmd === 'osv-scanner') return '';
        throw new Error('not installed');
      }
      if (cmd === 'osv-scanner') return JSON.stringify(osv);
      throw new Error(`unexpected execFileSync ${cmd} ${JSON.stringify(args)}`);
    };
    cp.execSync = () => { throw new Error('not installed'); };

    const dir = mkTmp('ctoc-poetry-osv-');
    try {
      fs.writeFileSync(path.join(dir, 'poetry.lock'), '');
      const qa = freshQualityAgent();
      const { res, out } = await captureLog(() =>
        qa.runSecurityScan(null, { projectRoot: dir, allFiles: true })
      );

      // DEFECT 1: python was REACHED — not the no-language / covered short-circuits.
      assert.doesNotMatch(out, /no supported language detected/,
        `poetry.lock-only must NOT read as "no supported language"; log:\n${out}`);
      assert.doesNotMatch(out, /all detected ecosystems covered by DependencyAuditor/,
        `poetry python is NOT covered by DependencyAuditor (poetry unimplemented); log:\n${out}`);
      // DEFECT 2: python was osv-routed and actually scanned — the CVE surfaces.
      assert.ok(res.high >= 1, `the poetry.lock CVE must surface via osv; got high=${res.high}`);
      assert.match(res.details, /sca\[HIGH\] jinja2/,
        `the osv finding must be in the human-facing details; got: ${JSON.stringify(res.details)}`);
      assert.match(out, /SCA: 1 dependency finding\(s\)/, `osv must have scanned python; log:\n${out}`);
      assert.ok(!res.skipped.some((s) => /SCA skipped for python/i.test(s)),
        `python must be scanned, not skipped for a missing scanner; skipped=${JSON.stringify(res.skipped)}`);
    } finally {
      restoreCp();
      rm(dir);
    }
  });

  it('a poetry.lock-only repo with osv-scanner UNAVAILABLE (pip-audit present) skips HONESTLY, naming osv-scanner — never "covered", never pip-audit', async () => {
    // The exact DEFECT-2 environment: osv-only is where SCA works, yet the old routing
    // (pip-audit) skipped it. Here osv is ABSENT and pip-audit PRESENT — python must
    // skip loudly naming osv-scanner (the tool that reads poetry.lock), never claim
    // pip-audit would help, and never read as "covered".
    cp.execFileSync = (cmd, args) => {
      if (Array.isArray(args) && args.includes('--version')) {
        if (cmd === 'pip-audit') return '';   // pip-audit installed
        throw new Error('not installed');      // osv-scanner NOT installed
      }
      throw new Error(`unexpected execFileSync ${cmd} ${JSON.stringify(args)}`);
    };
    cp.execSync = () => { throw new Error('not installed'); };

    const dir = mkTmp('ctoc-poetry-noosv-');
    try {
      fs.writeFileSync(path.join(dir, 'poetry.lock'), '');
      const qa = freshQualityAgent();
      const { res, out } = await captureLog(() =>
        qa.runSecurityScan(null, { projectRoot: dir, allFiles: true })
      );

      const pySkip = res.skipped.find((s) => /SCA skipped for python/i.test(s)) || '';
      assert.ok(pySkip, `python must skip LOUDLY; skipped=${JSON.stringify(res.skipped)}`);
      assert.match(pySkip, /osv-scanner/,
        `the honest skip must name osv-scanner (reads poetry.lock); got: ${JSON.stringify(pySkip)}`);
      assert.doesNotMatch(pySkip, /pip-audit/,
        `the skip must NOT claim pip-audit would help — it cannot read poetry.lock; got: ${JSON.stringify(pySkip)}`);
      // A missing scanner is not a finding — it must not block, and it must never read
      // as a silent "covered".
      assert.equal(res.passed, true, 'a missing scanner must not block the push');
      assert.doesNotMatch(out, /all detected ecosystems covered by DependencyAuditor/, `not covered; log:\n${out}`);
      assert.doesNotMatch(out, /no supported language detected/, `python WAS reached (DEFECT 1); log:\n${out}`);
    } finally {
      restoreCp();
      rm(dir);
    }
  });

  it('a uv.lock-only repo with osv-scanner AVAILABLE is SCANNED via osv (same routing as poetry)', async () => {
    const osv = {
      results: [{
        source: { path: 'uv.lock', type: 'lockfile' },
        packages: [{
          package: { name: 'requests', ecosystem: 'PyPI', version: '2.19.0' },
          vulnerabilities: [{ id: 'PYSEC-2018-28', summary: 'CRLF injection in requests', database_specific: { severity: 'HIGH' } }]
        }]
      }]
    };
    cp.execFileSync = (cmd, args) => {
      if (Array.isArray(args) && args.includes('--version')) {
        if (cmd === 'osv-scanner') return '';
        throw new Error('not installed');
      }
      if (cmd === 'osv-scanner') return JSON.stringify(osv);
      throw new Error(`unexpected execFileSync ${cmd} ${JSON.stringify(args)}`);
    };
    cp.execSync = () => { throw new Error('not installed'); };

    const dir = mkTmp('ctoc-uv-osv-');
    try {
      fs.writeFileSync(path.join(dir, 'uv.lock'), '');
      const qa = freshQualityAgent();
      const { res, out } = await captureLog(() =>
        qa.runSecurityScan(null, { projectRoot: dir, allFiles: true })
      );

      assert.doesNotMatch(out, /no supported language detected/, `uv.lock-only must reach python; log:\n${out}`);
      assert.ok(res.high >= 1, `the uv.lock CVE must surface via osv; got high=${res.high}`);
      assert.match(res.details, /sca\[HIGH\] requests/,
        `the osv finding must be in details; got: ${JSON.stringify(res.details)}`);
      assert.ok(!res.skipped.some((s) => /SCA skipped for python/i.test(s)),
        `python must be osv-scanned, not skipped; skipped=${JSON.stringify(res.skipped)}`);
    } finally {
      restoreCp();
      rm(dir);
    }
  });

  it('a pyproject.toml + poetry.lock repo routes to osv — pip-audit is NEVER invoked for the poetry set (both installed)', async () => {
    const osv = {
      results: [{
        source: { path: 'poetry.lock', type: 'lockfile' },
        packages: [{
          package: { name: 'jinja2', ecosystem: 'PyPI', version: '2.10' },
          vulnerabilities: [{ id: 'PYSEC-2019-217', summary: 'SSTI in Jinja2', database_specific: { severity: 'HIGH' } }]
        }]
      }]
    };
    // BOTH osv-scanner and pip-audit are installed. Poetry-aware routing must pick osv;
    // if pip-audit were invoked (old behaviour) the mock throws on its scan invocation,
    // producing a loud pip-audit skip that this test asserts NEVER appears.
    cp.execFileSync = (cmd, args) => {
      if (Array.isArray(args) && args.includes('--version')) {
        if (cmd === 'osv-scanner' || cmd === 'pip-audit') return '';
        throw new Error('not installed');
      }
      if (cmd === 'osv-scanner') return JSON.stringify(osv);
      throw new Error(`pip-audit (or other) must NOT be invoked for a poetry set: ${cmd}`);
    };
    cp.execSync = () => { throw new Error('not installed'); };

    const dir = mkTmp('ctoc-pyproject-poetry-');
    try {
      fs.writeFileSync(path.join(dir, 'pyproject.toml'), '[tool.poetry]\n');
      fs.writeFileSync(path.join(dir, 'poetry.lock'), '');
      const qa = freshQualityAgent();
      const { res } = await captureLog(() =>
        qa.runSecurityScan(null, { projectRoot: dir, allFiles: true })
      );

      assert.ok(res.high >= 1, `the poetry CVE must surface via osv; got high=${res.high}`);
      assert.match(res.details, /sca\[HIGH\] jinja2/, `finding must come from osv; got: ${JSON.stringify(res.details)}`);
      assert.ok(!res.skipped.some((s) => /pip-audit/i.test(s)),
        `pip-audit must NEVER be invoked for a poetry set (it cannot read poetry.lock); skipped=${JSON.stringify(res.skipped)}`);
      assert.ok(!res.skipped.some((s) => /SCA skipped for python/i.test(s)),
        `python must be osv-scanned, not skipped; skipped=${JSON.stringify(res.skipped)}`);
    } finally {
      restoreCp();
      rm(dir);
    }
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
