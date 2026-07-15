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

// ── DEFECT 2: python routing is poetry/uv AWARE — pip-audit cannot read those lockfiles
// (it audits the ambient environment); only osv-scanner reads them. A poetry/uv project
// must route to the osv universal pass so scannability keys on osv, not pip-audit. ──────

test('scaRouteFor: python WITH a poetry.lock routes to osv (native null), NOT pip-audit', () => {
  const { SCARunner } = require(SCA_PATH);
  const tmp = mkTmp('sca-route-poetry-');
  try {
    fs.writeFileSync(path.join(tmp, 'poetry.lock'), '');
    const route = new SCARunner(tmp).scaRouteFor('python');
    assert.equal(route.native, null,
      'poetry.lock python has NO usable native parser (pip-audit cannot read poetry.lock)');
    assert.equal(route.osvUniversal, true, 'poetry python must route to the osv universal pass');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('scaRouteFor: python WITH a uv.lock routes to osv (native null), NOT pip-audit', () => {
  const { SCARunner } = require(SCA_PATH);
  const tmp = mkTmp('sca-route-uv-');
  try {
    fs.writeFileSync(path.join(tmp, 'uv.lock'), '');
    const route = new SCARunner(tmp).scaRouteFor('python');
    assert.equal(route.native, null,
      'uv.lock python has NO usable native parser (pip-audit cannot read uv.lock)');
    assert.equal(route.osvUniversal, true, 'uv python must route to the osv universal pass');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('scaRouteFor: python WITHOUT poetry.lock/uv.lock stays pip-audit (no over-correction)', () => {
  const { SCARunner } = require(SCA_PATH);
  const tmp = mkTmp('sca-route-pip-');
  try {
    fs.writeFileSync(path.join(tmp, 'requirements.txt'), 'flask\n');
    const route = new SCARunner(tmp).scaRouteFor('python');
    assert.equal(route.native, 'pip-audit',
      'a pip-managed python project (requirements.txt) still routes to the pip-audit native parser');
    assert.equal(route.osvUniversal, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
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
    // SCA1: osv-scanner now also runs as the whole-repo net; here it finds nothing new.
    if (cmd === 'osv-scanner') return JSON.stringify({ results: [] });
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

test('F1/SCA1: a plain npm project — SCA runs the osv whole-repo net but DROPS the ROOT npm duplicate (counted once)', async () => {
  // npm is an IMPLEMENTED DependencyAuditor manager, so DependencyAuditor audits the
  // ROOT lockfile. osv-scanner (SCA's whole-repo net) also discovers that root lockfile;
  // SCA must DROP osv's root npm finding so the CVE is counted ONCE, never twice. SCA
  // must still run NO NATIVE scanner (npm/pip/cargo) for a deferred js/ts ecosystem.
  const tmp = mkTmp('sca-npm-defer-');
  const osv = {
    results: [{
      source: { path: path.join(tmp, 'package-lock.json'), type: 'lockfile' },
      packages: [{
        package: { name: 'lodash', ecosystem: 'npm', version: '4.17.4' },
        vulnerabilities: [{ id: 'GHSA-root-npm', database_specific: { severity: 'CRITICAL' } }]
      }]
    }]
  };
  cp.execFileSync = (cmd, args) => {
    if (Array.isArray(args) && args.includes('--version')) return '';
    if (cmd === 'osv-scanner') return JSON.stringify(osv);
    throw new Error(`SCA must run NO native scanner for a deferred npm project (got ${cmd})`);
  };
  const { SCARunner } = freshSCA();
  try {
    fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"x","version":"1.0.0"}');
    fs.writeFileSync(path.join(tmp, 'package-lock.json'), '{}');
    const r = new SCARunner(tmp);
    const res = await r.run();
    assert.equal(res.scanned, true, 'osv-scanner runs as the whole-repo net');
    assert.deepEqual(res.findings, [],
      'the ROOT npm CVE is DependencyAuditor’s — SCA drops osv’s duplicate so it is counted once, never twice');
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

test('F3-uv: a uv.lock-only project is scanned by osv-scanner, python NOT falsely deferred', async () => {
  // uv.lock (Astral uv) is the same class as poetry.lock: only osv-scanner reads it
  // natively; pip-audit audits the environment. A uv.lock alone must surface python
  // (registry marker) AND route to osv, never to the useless native pip-audit.
  const osv = {
    results: [{
      source: { path: 'uv.lock', type: 'lockfile' },
      packages: [{
        package: { name: 'requests', ecosystem: 'PyPI', version: '2.19.0' },
        vulnerabilities: [{ id: 'PYSEC-2018-28', summary: 'CRLF in requests', database_specific: { severity: 'HIGH' } }]
      }]
    }]
  };
  cp.execFileSync = (cmd, args) => {
    if (Array.isArray(args) && args.includes('--version')) return '';
    if (cmd === 'osv-scanner') return JSON.stringify(osv);
    throw new Error(`unexpected exec ${cmd} ${JSON.stringify(args)}`);
  };
  const { SCARunner } = freshSCA();
  const tmp = mkTmp('sca-uvlock-');
  try {
    fs.writeFileSync(path.join(tmp, 'uv.lock'), '');
    const r = new SCARunner(tmp);
    const res = await r.run();
    assert.equal(res.scanned, true, 'a uv.lock project must be genuinely scanned, not falsely deferred');
    assert.equal(res.findings.length, 1, 'the uv.lock CVE osv reads must surface');
    assert.equal(res.findings[0].package, 'requests');
    assert.equal(res.findings[0].tool, 'osv-scanner', 'uv python coverage comes from osv, not pip-audit');
    assert.ok(!(res.errors || []).some((e) => e.tool === 'pip-audit'),
      'native pip-audit must NOT be invoked for a uv project (it cannot read uv.lock)');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── SCA1 (silent coverage hole): osv-scanner is a WHOLE-REPO net. When every ROOT ──────
// ecosystem is deferred (pure npm/go/cargo/…), osv must STILL run so a NESTED,
// independently-installed lockfile (packages/api/package-lock.json) — audited by NEITHER
// native runner (both are root-only) — is scanned, not swallowed by an early return.

test('SCA1: a monorepo (root npm + nested independent lockfile) runs osv — the nested CVE is NOT swallowed', async () => {
  const tmp = mkTmp('sca-monorepo-');
  let osvInvoked = false;
  const osv = {
    results: [{
      source: { path: path.join(tmp, 'packages', 'api', 'package-lock.json'), type: 'lockfile' },
      packages: [{
        package: { name: 'nested-vuln', ecosystem: 'npm', version: '1.0.0' },
        vulnerabilities: [{ id: 'GHSA-nested-hole', database_specific: { severity: 'CRITICAL' } }]
      }]
    }]
  };
  cp.execFileSync = (cmd, args) => {
    if (Array.isArray(args) && args.includes('--version')) return '';
    if (cmd === 'osv-scanner') { osvInvoked = true; return JSON.stringify(osv); }
    throw new Error(`only osv should scan a pure-npm monorepo here (got ${cmd})`);
  };
  const { SCARunner } = freshSCA();
  try {
    fs.mkdirSync(path.join(tmp, 'packages', 'api'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"root","version":"1.0.0"}');
    fs.writeFileSync(path.join(tmp, 'package-lock.json'), '{}');
    fs.writeFileSync(path.join(tmp, 'packages', 'api', 'package-lock.json'), '{}');
    const r = new SCARunner(tmp);
    const res = await r.run();
    assert.ok(osvInvoked,
      'run() must attempt an osv pass — never early-return at line 229 while a nested lockfile is unscanned');
    assert.equal(res.scanned, true, 'the repo WAS scanned by osv, not falsely reported as fully covered');
    const pkgs = res.findings.map((f) => f.package);
    assert.ok(pkgs.includes('nested-vuln'),
      'the nested lockfile CVE is audited by NEITHER native runner — osv must surface it, not swallow it');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── SCA2: Pipfile.lock is the same class as poetry.lock/uv.lock — pip-audit cannot read ──
// it (it audits the ambient env), only osv can. python must route to osv, not pip-audit.

test('SCA2: a Pipfile.lock project routes python to osv (native null), NOT ambient-env pip-audit', () => {
  const { SCARunner } = require(SCA_PATH);
  const tmp = mkTmp('sca-route-pipfilelock-');
  try {
    fs.writeFileSync(path.join(tmp, 'Pipfile'), '[packages]\n');
    fs.writeFileSync(path.join(tmp, 'Pipfile.lock'), '{}');
    const route = new SCARunner(tmp).scaRouteFor('python');
    assert.equal(route.native, null,
      'Pipfile.lock python has NO usable native parser (pip-audit cannot read Pipfile.lock)');
    assert.equal(route.osvUniversal, true, 'Pipfile.lock python must route to the osv universal pass');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('SCA2: a Pipfile.lock project is scanned by osv-scanner (run()), never the useless native pip-audit', async () => {
  const osv = {
    results: [{
      source: { path: 'Pipfile.lock', type: 'lockfile' },
      packages: [{
        package: { name: 'django', ecosystem: 'PyPI', version: '2.0' },
        vulnerabilities: [{ id: 'PYSEC-2019-django', summary: 'SQLi in Django', database_specific: { severity: 'HIGH' } }]
      }]
    }]
  };
  cp.execFileSync = (cmd, args) => {
    if (Array.isArray(args) && args.includes('--version')) return '';
    if (cmd === 'osv-scanner') return JSON.stringify(osv);
    throw new Error(`unexpected exec ${cmd} ${JSON.stringify(args)}`);
  };
  const { SCARunner } = freshSCA();
  const tmp = mkTmp('sca-pipfilelock-run-');
  try {
    fs.writeFileSync(path.join(tmp, 'Pipfile'), '[packages]\n');
    fs.writeFileSync(path.join(tmp, 'Pipfile.lock'), '{}');
    const r = new SCARunner(tmp);
    const res = await r.run();
    assert.equal(res.scanned, true, 'a Pipfile.lock project must be genuinely scanned');
    assert.equal(res.findings.length, 1, 'the Pipfile.lock CVE osv reads must surface');
    assert.equal(res.findings[0].package, 'django');
    assert.equal(res.findings[0].tool, 'osv-scanner');
    assert.ok(!(res.errors || []).some((e) => e.tool === 'pip-audit'),
      'native pip-audit must NOT be invoked for a Pipfile.lock project (it cannot read Pipfile.lock)');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── SCA3: pip-audit must audit the project's PINNED requirements (-r), not the ambient env ──

test('SCA3: SCARunner.runPipAudit invokes pip-audit with -r <requirements> when one exists (not the ambient env)', async () => {
  let pipArgs = null;
  cp.execFileSync = (cmd, args) => {
    if (cmd === 'pip-audit') { pipArgs = args; return JSON.stringify({ dependencies: [] }); }
    throw new Error(`unexpected exec ${cmd} ${JSON.stringify(args)}`);
  };
  const { SCARunner } = freshSCA();
  const tmp = mkTmp('sca-pip-r-');
  try {
    fs.writeFileSync(path.join(tmp, 'requirements.txt'), 'flask==0.5\n');
    const r = new SCARunner(tmp);
    await r.runPipAudit();
    assert.ok(pipArgs, 'pip-audit was invoked');
    const i = pipArgs.indexOf('-r');
    assert.ok(i >= 0, `pip-audit args must include -r; got ${JSON.stringify(pipArgs)}`);
    assert.ok(/requirements\.txt$/.test(pipArgs[i + 1]),
      `-r must be followed by the requirements path; got ${JSON.stringify(pipArgs)}`);
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('SCA3: SCARunner.runPipAudit WITHOUT a requirements file falls back to the plain (ambient) invocation', async () => {
  let pipArgs = null;
  cp.execFileSync = (cmd, args) => {
    if (cmd === 'pip-audit') { pipArgs = args; return JSON.stringify({ dependencies: [] }); }
    throw new Error(`unexpected exec ${cmd} ${JSON.stringify(args)}`);
  };
  const { SCARunner } = freshSCA();
  const tmp = mkTmp('sca-pip-nor-');
  try {
    const r = new SCARunner(tmp);
    await r.runPipAudit();
    assert.ok(pipArgs, 'pip-audit was invoked');
    assert.equal(pipArgs.indexOf('-r'), -1,
      `with no requirements file present there is nothing to point -r at; got ${JSON.stringify(pipArgs)}`);
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── SCA5: a RELATIVE projectRoot must still classify its root manifest as root, so the ──
// osv/DependencyAuditor double-count drop fires (path.resolve both sides before compare).

test('SCA5: a RELATIVE projectRoot still classifies its root manifest as root (no double-count)', () => {
  const { SCARunner } = require(SCA_PATH);
  const r = new SCARunner('.'); // relative root
  r._deferredLanguages = new Set(['javascript', 'typescript']);
  const absRootLock = path.resolve('package-lock.json'); // what osv may emit as an absolute source
  r.parseOSVResults({
    results: [{
      source: { path: absRootLock, type: 'lockfile' },
      packages: [{
        package: { name: 'lodash', ecosystem: 'npm', version: '4.17.4' },
        vulnerabilities: [{ id: 'GHSA-relroot', database_specific: { severity: 'CRITICAL' } }]
      }]
    }]
  });
  assert.equal(r.findings.length, 0,
    'with a relative root, the root manifest must still be recognized as root and its osv duplicate dropped');
});

test('SCA5: a relative root still KEEPS a nested lockfile finding (nested classification survives resolve)', () => {
  const { SCARunner } = require(SCA_PATH);
  const r = new SCARunner('.');
  r._deferredLanguages = new Set(['javascript', 'typescript']);
  const absNested = path.resolve('packages', 'api', 'package-lock.json');
  r.parseOSVResults({
    results: [{
      source: { path: absNested, type: 'lockfile' },
      packages: [{
        package: { name: 'nested-dep', ecosystem: 'npm', version: '1.0.0' },
        vulnerabilities: [{ id: 'GHSA-rel-nested', database_specific: { severity: 'CRITICAL' } }]
      }]
    }]
  });
  assert.equal(r.findings.length, 1,
    'a nested lockfile is audited by neither runner — a relative root must not misclassify it as root and drop it');
});

// ── SCA6: a falsy/non-string projectRoot must never leak the process cwd into a scanner ──
// exec (an empty/nullish cwd resolves to the process cwd). Mirror DependencyAuditor's guard.

test('SCA6: a falsy/non-string projectRoot is normalized to null and never leaks the process cwd into a scanner exec', async () => {
  let execCwd = 'UNSET';
  cp.execFileSync = (cmd, args, opts) => {
    if (Array.isArray(args) && args.includes('--version')) return '';
    execCwd = opts && opts.cwd; // a leaked exec would carry cwd = undefined/'' → process cwd
    throw new Error(`scanner ran with cwd=${JSON.stringify(execCwd)}`);
  };
  const { SCARunner } = freshSCA();
  try {
    for (const bad of ['', null, undefined, 42]) {
      const r = new SCARunner(bad);
      assert.equal(r.projectRoot, null,
        `a falsy/non-string root must normalize to null (got ${JSON.stringify(r.projectRoot)})`);
      // Even a DIRECT native/osv scanner call must refuse to exec against a leaked cwd.
      await r.runNpmAudit();
      await r.runOsvScanner();
      const res = await r.run();
      assert.deepEqual(res.findings, [], `falsy root (${JSON.stringify(bad)}) must scan nothing`);
      assert.notEqual(res.scanned, true, 'a falsy root must not report a real scan of the process cwd');
    }
    assert.equal(execCwd, 'UNSET', 'no scanner may exec when the root is falsy — no process-cwd leak');
  } finally {
    restore();
  }
});

// ── SCA4 (subsumed by SCA1): once osv always runs, a NESTED poetry.lock CVE is covered ──
// by the whole-repo osv net even though DependencyAuditor's root-only detection misses it.

test('SCA4: a nested poetry.lock CVE is surfaced by the osv whole-repo net (root-only detection would miss it)', async () => {
  const tmp = mkTmp('sca-nested-poetry-');
  let osvInvoked = false;
  const osv = {
    results: [{
      source: { path: path.join(tmp, 'services', 'billing', 'poetry.lock'), type: 'lockfile' },
      packages: [{
        package: { name: 'cryptography', ecosystem: 'PyPI', version: '2.3' },
        vulnerabilities: [{ id: 'PYSEC-nested-poetry', summary: 'weak cipher', database_specific: { severity: 'HIGH' } }]
      }]
    }]
  };
  cp.execFileSync = (cmd, args) => {
    if (Array.isArray(args) && args.includes('--version')) return '';
    if (cmd === 'osv-scanner') { osvInvoked = true; return JSON.stringify(osv); }
    throw new Error(`only osv should scan here (got ${cmd})`);
  };
  const { SCARunner } = freshSCA();
  try {
    // Root is a plain npm project (js/ts deferred); the poetry.lock lives NESTED, where
    // DependencyAuditor's root-only detectPackageManagers never looks — osv is its only net.
    fs.mkdirSync(path.join(tmp, 'services', 'billing'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"root","version":"1.0.0"}');
    fs.writeFileSync(path.join(tmp, 'package-lock.json'), '{}');
    fs.writeFileSync(path.join(tmp, 'services', 'billing', 'poetry.lock'), '');
    const r = new SCARunner(tmp);
    const res = await r.run();
    assert.ok(osvInvoked, 'osv must run as the whole-repo net');
    const pkgs = res.findings.map((f) => f.package);
    assert.ok(pkgs.includes('cryptography'),
      'a nested poetry.lock CVE is covered only by the osv whole-repo net — it must surface');
  } finally {
    restore();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
