'use strict';

/**
 * SCA RUNNER — software-composition analysis (dependency-CVE audit).
 *
 * Mirrors sast-runner-failclosed.test.js: real temp-dir fixtures, and the ONLY
 * external thing mocked is tool-availability (cp.execSync / cp.execFileSync), never
 * the core parsing logic. The honesty rule under test is the SCA analog of
 * sast-runner's securityRouteFor: osv-scanner is the UNIVERSAL engine; a language
 * routes to a NATIVE parser only when this runner actually has one (npm audit,
 * pip-audit, cargo audit). Every other language routes to osv-scanner (parsed) —
 * NEVER to a tool we cannot parse. A language with no available scanner yields
 * scanned:false with a reason, never a silent clean pass.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const SCA_PATH = require.resolve('../src/lib/sca-runner');

const REAL_EXEC = cp.execSync;
const REAL_EXECFILE = cp.execFileSync;

/** Reload sca-runner AFTER installing the current cp fakes (the module destructures
 *  execSync/execFileSync at load time, exactly like sast-runner). */
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

// ── ROUTING (pure predicate — no tool needed) ────────────────────────────────────

test('scaRouteFor: JS/TS route to the npm-audit NATIVE parser', () => {
  const { SCARunner, PARSEABLE_NATIVE_TOOLS } = require(SCA_PATH);
  const r = new SCARunner('/x');
  for (const lang of ['javascript', 'typescript']) {
    const route = r.scaRouteFor(lang);
    assert.equal(route.osvUniversal, false, `${lang} has a native parser`);
    assert.equal(route.native, 'npm-audit');
    assert.ok(PARSEABLE_NATIVE_TOOLS.has(route.native), 'native must be a parseable tool');
  }
});

test('scaRouteFor: Python routes to the pip-audit NATIVE parser', () => {
  const { SCARunner } = require(SCA_PATH);
  const route = new SCARunner('/x').scaRouteFor('python');
  assert.equal(route.native, 'pip-audit');
  assert.equal(route.osvUniversal, false);
});

test('scaRouteFor: Rust routes to the cargo-audit NATIVE parser', () => {
  const { SCARunner } = require(SCA_PATH);
  const route = new SCARunner('/x').scaRouteFor('rust');
  assert.equal(route.native, 'cargo-audit');
  assert.equal(route.osvUniversal, false);
});

test('scaRouteFor: Go/PHP/Ruby (no native parser here) route to osv-scanner UNIVERSAL', () => {
  const { SCARunner } = require(SCA_PATH);
  const r = new SCARunner('/x');
  for (const lang of ['go', 'php', 'ruby', 'java', 'elixir', 'dart']) {
    const route = r.scaRouteFor(lang);
    assert.equal(route.native, null, `${lang} has NO native parser and must not claim one`);
    assert.equal(route.osvUniversal, true, `${lang} must route to osv universal`);
  }
});

test('HONESTY: no language ever routes to a parser-less tool', () => {
  const { SCARunner, PARSEABLE_NATIVE_TOOLS, SCA_TOOL_CONFIGS } = require(SCA_PATH);
  const r = new SCARunner('/x');
  // Every configured language, plus a broad sample of registry languages that route
  // to the universal engine, must satisfy: native is either null or a tool we parse.
  const langs = new Set([
    ...Object.keys(SCA_TOOL_CONFIGS),
    'go', 'php', 'ruby', 'java', 'csharp', 'kotlin', 'scala', 'swift', 'c', 'cpp',
    'elixir', 'dart', 'r', 'lua', 'sql', 'shell', 'terraform', 'dockerfile', 'solidity'
  ]);
  for (const lang of langs) {
    const route = r.scaRouteFor(lang);
    assert.ok(
      route.native === null || PARSEABLE_NATIVE_TOOLS.has(route.native),
      `${lang} must NEVER route to a tool without a parser (got native=${route.native})`
    );
  }
});

// ── PARSERS (core logic — never mocked) ──────────────────────────────────────────

test('parseOSVResults: an OSV JSON fixture parses into a finding with package + severity', () => {
  const { SCARunner } = require(SCA_PATH);
  const r = new SCARunner('/x');
  const osv = {
    results: [{
      source: { path: '/proj/go.mod', type: 'lockfile' },
      packages: [{
        package: { name: 'golang.org/x/text', ecosystem: 'Go', version: '0.3.0' },
        vulnerabilities: [{
          id: 'GHSA-ppp9-7jff-5vj2',
          summary: 'Out-of-range panic in golang.org/x/text',
          aliases: ['CVE-2020-14040'],
          database_specific: { severity: 'HIGH' }
        }]
      }]
    }]
  };
  r.parseOSVResults(osv);
  assert.equal(r.findings.length, 1, 'exactly one vulnerability parsed');
  const f = r.findings[0];
  assert.equal(f.tool, 'osv-scanner');
  assert.equal(f.package, 'golang.org/x/text');
  assert.equal(f.version, '0.3.0');
  assert.equal(f.advisory, 'GHSA-ppp9-7jff-5vj2');
  assert.equal(f.severity, 'HIGH');
});

test('parseNpmAuditResults: an npm audit --json fixture parses correctly', () => {
  const { SCARunner } = require(SCA_PATH);
  const r = new SCARunner('/x');
  const npm = {
    auditReportVersion: 2,
    vulnerabilities: {
      lodash: {
        name: 'lodash',
        severity: 'high',
        via: [{
          source: 1065,
          name: 'lodash',
          dependency: 'lodash',
          title: 'Prototype Pollution in lodash',
          url: 'https://github.com/advisories/GHSA-jf85-cpcp-j695',
          severity: 'high',
          cwe: ['CWE-1321'],
          range: '<4.17.12'
        }],
        range: '<4.17.12',
        fixAvailable: true
      }
    }
  };
  r.parseNpmAuditResults(npm);
  assert.equal(r.findings.length, 1);
  const f = r.findings[0];
  assert.equal(f.tool, 'npm-audit');
  assert.equal(f.package, 'lodash');
  assert.equal(f.severity, 'HIGH');
  assert.equal(f.title, 'Prototype Pollution in lodash');
  assert.equal(f.cwe, 'CWE-1321');
});

test('parsePipAuditResults: a pip-audit --format json fixture parses correctly', () => {
  const { SCARunner } = require(SCA_PATH);
  const r = new SCARunner('/x');
  const pip = {
    dependencies: [{
      name: 'flask',
      version: '0.5',
      vulns: [{
        id: 'PYSEC-2019-179',
        fix_versions: ['0.12.3'],
        description: 'Flask before 0.12.3 has a denial of service.',
        aliases: ['CVE-2019-1010083']
      }]
    }]
  };
  r.parsePipAuditResults(pip);
  assert.equal(r.findings.length, 1);
  const f = r.findings[0];
  assert.equal(f.tool, 'pip-audit');
  assert.equal(f.package, 'flask');
  assert.equal(f.version, '0.5');
  assert.equal(f.advisory, 'PYSEC-2019-179');
  assert.ok(f.severity, 'a severity is always assigned (default when the tool omits one)');
});

test('parseCargoAuditResults: a cargo audit --json fixture parses correctly', () => {
  const { SCARunner } = require(SCA_PATH);
  const r = new SCARunner('/x');
  const cargo = {
    vulnerabilities: {
      found: true,
      count: 1,
      list: [{
        advisory: { id: 'RUSTSEC-2020-0159', title: 'Potential segfault in localtime_r', url: 'https://rustsec.org/advisories/RUSTSEC-2020-0159' },
        package: { name: 'chrono', version: '0.4.10' }
      }]
    }
  };
  r.parseCargoAuditResults(cargo);
  assert.equal(r.findings.length, 1);
  const f = r.findings[0];
  assert.equal(f.tool, 'cargo-audit');
  assert.equal(f.package, 'chrono');
  assert.equal(f.version, '0.4.10');
  assert.equal(f.advisory, 'RUSTSEC-2020-0159');
});

// ── F1: CVSS VECTOR severities must NOT silently downgrade to non-blocking MEDIUM ──

test('F1: an OSV vuln with ONLY a CVSS_V3 VECTOR (no label) bands CRITICAL, never MEDIUM', () => {
  const { SCARunner } = require(SCA_PATH);
  const r = new SCARunner('/x');
  // OSV emits the score as a CVSS VECTOR string — parseFloat() of it is NaN. Before
  // F1 this silently returned MEDIUM (non-blocking); the CVE shipped green.
  const osv = {
    results: [{
      source: { path: '/proj/go.mod', type: 'lockfile' },
      packages: [{
        package: { name: 'github.com/evil/pkg', ecosystem: 'Go', version: '1.0.0' },
        vulnerabilities: [{
          id: 'GHSA-crit-vector',
          summary: 'Remote code execution',
          severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' }]
          // NB: no database_specific.severity — the ONLY signal is the vector.
        }]
      }]
    }]
  };
  r.parseOSVResults(osv);
  assert.equal(r.findings.length, 1);
  assert.equal(
    r.findings[0].severity, 'CRITICAL',
    'a CVSS-vector 9.8 must map to CRITICAL and BLOCK — never a downgraded MEDIUM'
  );
});

test('F1: a cargo advisory whose cvss is a VECTOR string bands CRITICAL, never MEDIUM', () => {
  const { SCARunner } = require(SCA_PATH);
  const r = new SCARunner('/x');
  const cargo = {
    vulnerabilities: {
      found: true,
      count: 1,
      list: [{
        advisory: {
          id: 'RUSTSEC-2026-0001',
          title: 'RCE in some-crate',
          cvss: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'
        },
        package: { name: 'some-crate', version: '0.1.0' }
      }]
    }
  };
  r.parseCargoAuditResults(cargo);
  assert.equal(r.findings.length, 1);
  assert.equal(
    r.findings[0].severity, 'CRITICAL',
    'a RustSec CVSS-vector 9.8 must map to CRITICAL, never MEDIUM'
  );
});

// ── F3: an npm audit ERROR envelope must never read as a clean scan ───────────────

test('F3: parseNpmAuditResults treats {error:EAUDITNOLOCK} as a loud skip, never clean', () => {
  const { SCARunner } = require(SCA_PATH);
  const r = new SCARunner('/x');
  // A JS project with no lockfile: npm audit exits 1 and prints this envelope.
  r.parseNpmAuditResults({ error: { code: 'EAUDITNOLOCK', summary: 'This command requires an existing lockfile.' } });
  assert.equal(r.findings.length, 0, 'nothing was audited → no findings');
  assert.ok(r.errors.length >= 1, 'the error envelope must be recorded as a loud error, never silence');
  assert.ok(
    /EAUDITNOLOCK/.test(r.errors[0].error),
    `the recorded error must name the npm failure; got ${JSON.stringify(r.errors)}`
  );
});

// ── F4: an unrated pip-audit finding fails SECURE (HIGH), never a non-blocking MEDIUM ──

test('F4: a pip-audit finding with no severity defaults to HIGH (fail-secure), never MEDIUM', () => {
  const { SCARunner } = require(SCA_PATH);
  const r = new SCARunner('/x');
  const pip = {
    dependencies: [{
      name: 'flask',
      version: '0.5',
      vulns: [{ id: 'PYSEC-2019-179', description: 'DoS', aliases: ['CVE-2019-1010083'] }]
    }]
  };
  r.parsePipAuditResults(pip);
  assert.equal(r.findings.length, 1);
  assert.equal(
    r.findings[0].severity, 'HIGH',
    'a real pip advisory with no stated severity must default HIGH — a Python dep RCE must not ship green'
  );
});

// ── F5: npm v6 `advisories`-shape reports are parsed, not silently empty ──────────

test('F5: parseNpmAuditResults parses the npm v6 `advisories` shape', () => {
  const { SCARunner } = require(SCA_PATH);
  const r = new SCARunner('/x');
  const npmV6 = {
    advisories: {
      1065: {
        id: 1065,
        module_name: 'lodash',
        severity: 'high',
        title: 'Prototype Pollution',
        url: 'https://npmjs.com/advisories/1065',
        cwe: 'CWE-1321'
      }
    }
  };
  r.parseNpmAuditResults(npmV6);
  assert.equal(r.findings.length, 1, 'an npm v6 report must not be silently empty');
  assert.equal(r.findings[0].package, 'lodash');
  assert.equal(r.findings[0].severity, 'HIGH');
});

test('dedupe: the same (package, advisory-id) reported twice collapses to one finding', () => {
  const { SCARunner } = require(SCA_PATH);
  const r = new SCARunner('/x');
  const osv = {
    results: [{
      source: { path: 'a', type: 'lockfile' },
      packages: [{
        package: { name: 'left-pad', ecosystem: 'npm', version: '1.0.0' },
        vulnerabilities: [{ id: 'GHSA-xxxx', database_specific: { severity: 'LOW' } }]
      }]
    }, {
      source: { path: 'b', type: 'lockfile' },
      packages: [{
        package: { name: 'left-pad', ecosystem: 'npm', version: '1.0.0' },
        vulnerabilities: [{ id: 'GHSA-xxxx', database_specific: { severity: 'LOW' } }]
      }]
    }]
  };
  r.parseOSVResults(osv);
  const unique = r.deduplicateFindings();
  assert.equal(unique.length, 1, 'duplicate (package, advisory) must collapse');
});

// ── FAIL-CLOSED run() (tool-availability mocked, exactly like sast fail-closed) ───

test('run(): a language with NO available scanner yields scanned:false, never a silent pass', async () => {
  // Every tool probe fails → neither a native tool nor osv-scanner is available.
  cp.execSync = () => { throw new Error('command not found'); };
  cp.execFileSync = () => { throw new Error('command not found'); };
  const { SCARunner } = freshSCA();
  const tmp = mkTmp('sca-noscanner-');
  try {
    // C# is an ecosystem SCA genuinely OWNS: it has no DependencyAuditor manager, so
    // it is not deferred, and it routes to the osv-scanner universal pass. (go was the
    // old fixture, but go IS audited by DependencyAuditor (govulncheck) and is now
    // correctly deferred — it would never reach SCA's scanner-availability path.)
    fs.writeFileSync(path.join(tmp, 'app.csproj'), '<Project></Project>\n'); // detectable, routes to osv
    const r = new SCARunner(tmp);
    const res = await r.run();
    assert.equal(res.scanned, false, 'run() must report that nothing was scanned');
    assert.equal(res.success, false, 'no scanner ran → not a success');
    assert.ok(/no.*scanner/i.test(res.reason || ''), `reason must name the missing-scanner cause; got ${res.reason}`);
    assert.deepEqual(res.findings, [], 'no findings when nothing scanned');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('run(): no detected language is a clean no-op (nothing to scan, not a failure)', async () => {
  const { SCARunner } = require(SCA_PATH);
  const tmp = mkTmp('sca-empty-');
  try {
    const r = new SCARunner(tmp);
    const res = await r.run();
    assert.equal(res.success, true, 'no dependencies to audit is not a failure');
    assert.deepEqual(res.findings, []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('checkThreshold: a HIGH finding fails a HIGH threshold', () => {
  const { SCARunner } = require(SCA_PATH);
  const r = new SCARunner('/x');
  r.parseOSVResults({
    results: [{
      source: { path: 'a', type: 'lockfile' },
      packages: [{
        package: { name: 'p', ecosystem: 'npm', version: '1.0.0' },
        vulnerabilities: [{ id: 'GHSA-y', database_specific: { severity: 'HIGH' } }]
      }]
    }]
  });
  const res = r.checkThreshold('HIGH');
  assert.equal(res.pass, false);
  assert.equal(res.failing, 1);
});

// ── INFO: checkThreshold must count the DEDUPED set, matching run()'s report ──────

test('checkThreshold: the SAME (package, advisory) reported twice counts ONCE, not twice', () => {
  const { SCARunner } = require(SCA_PATH);
  const r = new SCARunner('/x');
  // Two OSV lockfiles carrying the identical advisory for the identical package —
  // run() returns deduplicateFindings(), so checkThreshold must agree (one failing).
  const dup = (src) => ({
    source: { path: src, type: 'lockfile' },
    packages: [{
      package: { name: 'p', ecosystem: 'npm', version: '1.0.0' },
      vulnerabilities: [{ id: 'GHSA-dup', database_specific: { severity: 'HIGH' } }]
    }]
  });
  r.parseOSVResults({ results: [dup('a'), dup('b')] });
  assert.equal(r.findings.length, 2, 'pre-dedup there are two raw findings');
  const res = r.checkThreshold('HIGH');
  assert.equal(res.failing, 1, 'checkThreshold must count the deduped set (one), consistent with run()');
  assert.equal(res.pass, false);
});

// ── F1 PARTITION: an ecosystem DependencyAuditor cannot audit is NOT early-excluded ──
//
// The old partition deferred java (maven/gradle unimplemented) and python-via-
// poetry/pipenv to DependencyAuditor, which then reported "not implemented" — so the
// ecosystem was scanned by NEITHER runner. The redesign defers only DETECTED-AND-
// IMPLEMENTED managers, so these projects flow to a real SCA scanner.

test('F1: a pom.xml-only Java project is SCANNED by osv-scanner, never early-excluded', async () => {
  const osv = {
    results: [{
      source: { path: '/proj/pom.xml', type: 'lockfile' },
      packages: [{
        package: { name: 'org.apache.commons:commons-text', ecosystem: 'Maven', version: '1.9' },
        vulnerabilities: [{ id: 'GHSA-maven-rce', summary: 'RCE in commons-text', database_specific: { severity: 'CRITICAL' } }]
      }]
    }]
  };
  // osv-scanner is available and returns the Java CVE; nothing else is invoked.
  cp.execFileSync = (cmd, args) => {
    if (Array.isArray(args) && args.includes('--version')) return '';
    if (cmd === 'osv-scanner') return JSON.stringify(osv);
    throw new Error(`unexpected exec ${cmd} ${JSON.stringify(args)}`);
  };
  const { SCARunner } = freshSCA();
  const tmp = mkTmp('sca-java-');
  try {
    fs.writeFileSync(path.join(tmp, 'pom.xml'), '<project></project>\n');
    const r = new SCARunner(tmp);
    const res = await r.run();
    assert.equal(res.scanned, true, 'the Java ecosystem must actually be scanned, never deferred to nothing');
    assert.equal(res.findings.length, 1, 'the Maven CVE must surface');
    assert.equal(res.findings[0].package, 'org.apache.commons:commons-text');
    assert.equal(res.findings[0].severity, 'CRITICAL');
    assert.doesNotMatch(String(res.message || ''), /defer|covered/i,
      'the report must NOT claim java was deferred/covered — it was actually scanned');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('F1: a Pipfile python project (pipenv unimplemented) is SCANNED, not silently deferred', async () => {
  // pipenv is NOT an implemented DependencyAuditor manager, so python must NOT be
  // deferred; SCA covers it via its pip-audit native parser. (A pure poetry.lock
  // project is the same class — poetry is likewise unimplemented — but the registry
  // detects python from Pipfile, so Pipfile is the reproducible python fixture.)
  const pip = {
    dependencies: [{
      name: 'flask',
      version: '0.5',
      vulns: [{ id: 'PYSEC-2019-179', severity: 'HIGH', description: 'DoS', aliases: ['CVE-2019-1010083'] }]
    }]
  };
  cp.execFileSync = (cmd, args) => {
    if (Array.isArray(args) && args.includes('--version')) return '';
    if (cmd === 'pip-audit') return JSON.stringify(pip);
    throw new Error(`unexpected exec ${cmd} ${JSON.stringify(args)}`);
  };
  const { SCARunner } = freshSCA();
  const tmp = mkTmp('sca-pipenv-');
  try {
    fs.writeFileSync(path.join(tmp, 'Pipfile'), '[packages]\n');
    const r = new SCARunner(tmp);
    const res = await r.run();
    assert.equal(res.scanned, true, 'python must actually be scanned, not deferred to an unimplemented pipenv audit');
    assert.equal(res.findings.length, 1);
    assert.equal(res.findings[0].package, 'flask');
    assert.doesNotMatch(String(res.message || ''), /defer|covered/i,
      'the report must NOT claim python was deferred/covered');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('F1: a plain npm project is DEFERRED to DependencyAuditor exactly once (no SCA double-run)', async () => {
  // Every tool probe would succeed, but SCA must still not scan js/ts — npm is an
  // IMPLEMENTED DependencyAuditor manager, so SCA defers it and runs NO scanner.
  cp.execFileSync = (cmd, args) => {
    if (Array.isArray(args) && args.includes('--version')) return '';
    throw new Error(`SCA must not invoke a scanner for a deferred npm project (got ${cmd})`);
  };
  const { SCARunner } = freshSCA();
  const tmp = mkTmp('sca-npm-defer-');
  try {
    fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"x","version":"1.0.0"}');
    fs.writeFileSync(path.join(tmp, 'package-lock.json'), '{}');
    const r = new SCARunner(tmp);
    const res = await r.run();
    assert.equal(res.success, true);
    assert.deepEqual(res.findings, [], 'SCA must not double-scan an ecosystem DependencyAuditor audits');
    assert.notEqual(res.scanned, true, 'no SCA scanner ran — js/ts is DependencyAuditor’s to audit');
    assert.match(String(res.message || ''), /audited by DependencyAuditor/i,
      'the "covered" message is truthful here — DependencyAuditor genuinely audits npm');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── F2 DOUBLE-COUNT: osv walks the whole repo; drop findings for ecosystems that ──
// DependencyAuditor already audits, so an npm CVE is counted ONCE, not twice.

test('F2: in a mixed C#+npm repo, the npm CVE osv also discovers is counted ONCE (dropped from SCA)', async () => {
  // osv-scanner auto-discovers EVERY lockfile, so it reports BOTH the C# (NuGet) CVE
  // and the npm (package-lock.json) CVE. DependencyAuditor already reports the ROOT npm
  // one; SCA must drop the ROOT npm finding to avoid the cross-runner double-count, while
  // keeping the C# finding it is uniquely responsible for. The osv source paths are the
  // ROOT lockfiles under the scanned project root — exactly what osv-scanner emits and
  // exactly what DependencyAuditor's root-cwd audit covers (F1 gates the drop on ROOT).
  const tmp = mkTmp('sca-mixed-');
  const osv = {
    results: [
      {
        source: { path: path.join(tmp, 'packages.lock.json'), type: 'lockfile' },
        packages: [{
          package: { name: 'Newtonsoft.Json', ecosystem: 'NuGet', version: '12.0.1' },
          vulnerabilities: [{ id: 'GHSA-csharp-dos', summary: 'DoS', database_specific: { severity: 'HIGH' } }]
        }]
      },
      {
        source: { path: path.join(tmp, 'package-lock.json'), type: 'lockfile' },
        packages: [{
          package: { name: 'lodash', ecosystem: 'npm', version: '4.17.4' },
          vulnerabilities: [{ id: 'GHSA-npm-dup', summary: 'Prototype pollution', database_specific: { severity: 'CRITICAL' } }]
        }]
      }
    ]
  };
  cp.execFileSync = (cmd, args) => {
    if (Array.isArray(args) && args.includes('--version')) return '';
    if (cmd === 'osv-scanner') return JSON.stringify(osv);
    throw new Error(`unexpected exec ${cmd} ${JSON.stringify(args)}`);
  };
  const { SCARunner } = freshSCA();
  try {
    fs.writeFileSync(path.join(tmp, 'app.csproj'), '<Project></Project>\n'); // → csharp (osv route)
    fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"x","version":"1.0.0"}'); // → npm, deferred
    fs.writeFileSync(path.join(tmp, 'package-lock.json'), '{}');
    const r = new SCARunner(tmp);
    const res = await r.run();
    assert.equal(res.scanned, true);
    const packages = res.findings.map((f) => f.package);
    assert.ok(packages.includes('Newtonsoft.Json'), 'the C# CVE (SCA’s responsibility) must surface');
    assert.ok(!packages.includes('lodash'),
      'the ROOT npm CVE is DependencyAuditor’s — SCA must DROP it so it is not counted twice');
    assert.equal(res.findings.length, 1, 'exactly one finding: the C# CVE, counted once');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── F1 REGRESSION (HIGH): the double-count drop must gate on ROOT lockfiles ONLY ──────
//
// DependencyAuditor audits ONLY root manifests: detectPackageManagers checks
// path.join(projectRoot, lockFile), and `npm audit`/etc. run at cwd=projectRoot (root
// project + declared workspaces). A NESTED independent lockfile (packages/api/
// package-lock.json) is audited by NEITHER runner. Dropping an osv finding on ecosystem
// ALONE over-suppresses: a real CVE from a nested lockfile would be scanned by nobody.
// The drop must require the finding's source.path to be a ROOT manifest.

test('F1: a ROOT npm finding IS dropped when js/ts is deferred (no double-count with DependencyAuditor)', () => {
  const { SCARunner } = require(SCA_PATH);
  const r = new SCARunner('/proj');
  r._deferredLanguages = new Set(['javascript', 'typescript']);
  r.parseOSVResults({
    results: [{
      source: { path: '/proj/package-lock.json', type: 'lockfile' },
      packages: [{
        package: { name: 'lodash', ecosystem: 'npm', version: '4.17.4' },
        vulnerabilities: [{ id: 'GHSA-root', database_specific: { severity: 'CRITICAL' } }]
      }]
    }]
  });
  assert.equal(r.findings.length, 0,
    'a ROOT npm lockfile IS audited by DependencyAuditor — dropping avoids the cross-runner double-count');
});

test('F1 REGRESSION: a NESTED npm finding is KEPT even when js/ts is deferred (DependencyAuditor never audited it)', () => {
  const { SCARunner } = require(SCA_PATH);
  const r = new SCARunner('/proj');
  r._deferredLanguages = new Set(['javascript', 'typescript']);
  r.parseOSVResults({
    results: [{
      source: { path: '/proj/packages/api/package-lock.json', type: 'lockfile' },
      packages: [{
        package: { name: 'lodash', ecosystem: 'npm', version: '4.17.4' },
        vulnerabilities: [{ id: 'GHSA-nested', database_specific: { severity: 'CRITICAL' } }]
      }]
    }]
  });
  assert.equal(r.findings.length, 1,
    'a nested independent lockfile is audited by NEITHER runner — SCA must NOT drop its CVE');
  assert.equal(r.findings[0].package, 'lodash');
});

test('F1 REGRESSION: a NESTED requirements.txt finding is KEPT when python is deferred', () => {
  const { SCARunner } = require(SCA_PATH);
  const r = new SCARunner('/proj');
  r._deferredLanguages = new Set(['python']);
  r.parseOSVResults({
    results: [{
      source: { path: '/proj/services/worker/requirements.txt', type: 'lockfile' },
      packages: [{
        package: { name: 'flask', ecosystem: 'PyPI', version: '0.5' },
        vulnerabilities: [{ id: 'PYSEC-x', database_specific: { severity: 'HIGH' } }]
      }]
    }]
  });
  assert.equal(r.findings.length, 1,
    'a nested python lockfile is unaudited by DependencyAuditor (pip-audit runs at root) — keep it');
});

test('F1 REGRESSION: a NESTED Cargo.lock finding is KEPT when rust is deferred', () => {
  const { SCARunner } = require(SCA_PATH);
  const r = new SCARunner('/proj');
  r._deferredLanguages = new Set(['rust']);
  r.parseOSVResults({
    results: [{
      source: { path: '/proj/crates/inner/Cargo.lock', type: 'lockfile' },
      packages: [{
        package: { name: 'some-crate', ecosystem: 'crates.io', version: '0.1.0' },
        vulnerabilities: [{ id: 'RUSTSEC-x', database_specific: { severity: 'HIGH' } }]
      }]
    }]
  });
  assert.equal(r.findings.length, 1,
    'a nested rust lockfile is unaudited by DependencyAuditor (cargo audit runs at root) — keep it');
});

test('F1: an UNMAPPED ecosystem is never dropped even at the root (never suppress the unattributable)', () => {
  const { SCARunner } = require(SCA_PATH);
  const r = new SCARunner('/proj');
  r._deferredLanguages = new Set(['javascript', 'typescript']);
  r.parseOSVResults({
    results: [{
      source: { path: '/proj/mix.exs', type: 'lockfile' },
      packages: [{
        package: { name: 'phoenix', ecosystem: 'Hex', version: '1.0.0' },
        vulnerabilities: [{ id: 'GHSA-hex', database_specific: { severity: 'HIGH' } }]
      }]
    }]
  });
  assert.equal(r.findings.length, 1,
    'an ecosystem no DependencyAuditor manager maps is never suppressed, root or not');
});

// ── F3: a poetry project gets REAL osv coverage — pip-audit cannot read poetry.lock ──

test('F3: a pyproject.toml + poetry.lock project is scanned by osv-scanner, python NOT falsely deferred', async () => {
  // osv-scanner reads poetry.lock natively; pip-audit (DependencyAuditor's AND SCA's
  // native python tool) audits the environment, never poetry.lock. So python must NOT be
  // deferred, native pip-audit must be SKIPPED, and osv must run and surface the CVE.
  const osv = {
    results: [{
      source: { path: 'poetry.lock', type: 'lockfile' },
      packages: [{
        package: { name: 'jinja2', ecosystem: 'PyPI', version: '2.10' },
        vulnerabilities: [{ id: 'PYSEC-2019-217', summary: 'SSTI in Jinja2', database_specific: { severity: 'HIGH' } }]
      }]
    }]
  };
  cp.execFileSync = (cmd, args) => {
    if (Array.isArray(args) && args.includes('--version')) return '';
    if (cmd === 'osv-scanner') return JSON.stringify(osv);
    throw new Error(`unexpected exec ${cmd} ${JSON.stringify(args)}`);
  };
  const { SCARunner } = freshSCA();
  const tmp = mkTmp('sca-poetry-');
  try {
    fs.writeFileSync(path.join(tmp, 'pyproject.toml'), '[tool.poetry]\n');
    fs.writeFileSync(path.join(tmp, 'poetry.lock'), '');
    const r = new SCARunner(tmp);
    const res = await r.run();
    assert.equal(res.scanned, true, 'a poetry project must be genuinely scanned, not falsely deferred');
    assert.equal(res.findings.length, 1, 'the poetry.lock CVE osv reads must surface');
    assert.equal(res.findings[0].package, 'jinja2');
    assert.equal(res.findings[0].tool, 'osv-scanner', 'poetry python coverage comes from osv, not pip-audit');
    assert.ok(!(res.errors || []).some((e) => e.tool === 'pip-audit'),
      'native pip-audit must NOT be invoked for a poetry project (it cannot read poetry.lock)');
    assert.doesNotMatch(String(res.message || ''), /defer|covered/i,
      'python must not read as deferred/covered — it was actually scanned');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
