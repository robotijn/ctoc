'use strict';

/**
 * DependencyAuditor — the SCA/DependencyAuditor PARTITION (F1 coverage hole).
 *
 * The old partition declared a language "covered" by DependencyAuditor whenever ANY
 * package manager nominally mapped to it (MANAGER_LANGUAGES union), even when the
 * manager DependencyAuditor actually detects for a project is one it does NOT audit
 * (maven/gradle → java, poetry/pipenv → python fall to runAudit's `default` arm:
 * "Audit not implemented"). SCARunner then EXCLUDED those ecosystems, so a Java or a
 * pipenv/poetry-only project was scanned by NEITHER runner while the human was told it
 * was "deferred/covered". These tests fence the honest partition: an ecosystem is
 * "covered" only when the manager detected for THIS project is one DependencyAuditor
 * IMPLEMENTS. Real temp-dir fixtures; nothing mocked (detection is pure filesystem).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const DA_PATH = require.resolve('../src/lib/dependency-auditor');
const {
  IMPLEMENTED_MANAGERS,
  MANAGER_LANGUAGES,
  auditedLanguagesFor,
  DependencyAuditor
} = require(DA_PATH);

const REAL_EXEC = cp.execSync;
const REAL_EXECFILE = cp.execFileSync;

/** Reload dependency-auditor AFTER installing the current cp fakes — the module
 *  destructures execSync/execFileSync at load time. */
function freshDA() {
  delete require.cache[DA_PATH];
  return require(DA_PATH);
}
function restoreDA() {
  cp.execSync = REAL_EXEC;
  cp.execFileSync = REAL_EXECFILE;
  delete require.cache[DA_PATH];
}

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function write(dir, name, content = '') {
  fs.writeFileSync(path.join(dir, name), content);
}

// ── IMPLEMENTED_MANAGERS — the switch arms runAudit actually implements ───────────

test('IMPLEMENTED_MANAGERS lists exactly the runAudit switch arms that are not `default`', () => {
  const expected = ['npm', 'yarn', 'pnpm', 'pip', 'go', 'cargo', 'bundler', 'composer'].sort();
  assert.deepEqual([...IMPLEMENTED_MANAGERS].sort(), expected);
});

test('every IMPLEMENTED manager has a MANAGER_LANGUAGES mapping', () => {
  for (const m of IMPLEMENTED_MANAGERS) {
    assert.ok(Array.isArray(MANAGER_LANGUAGES[m]) && MANAGER_LANGUAGES[m].length > 0,
      `${m} must map to at least one language`);
  }
});

test('maven/gradle/poetry/pipenv are NOT implemented (they hit runAudit `default`)', () => {
  for (const m of ['maven', 'gradle', 'poetry', 'pipenv']) {
    assert.equal(IMPLEMENTED_MANAGERS.has(m), false,
      `${m} audit is not implemented and must not claim to be`);
  }
});

// ── auditedLanguagesFor — per-project, keyed on DETECTED ∩ IMPLEMENTED ─────────────
// (The former static COVERED_LANGUAGES export was deleted once quality-agent switched
// to per-project deferral; java-exclusion is now asserted via auditedLanguagesFor below.)

test('auditedLanguagesFor: a pom.xml-only project defers NOTHING (maven unimplemented) — F1', () => {
  const dir = mkTmp('da-maven-');
  try {
    write(dir, 'pom.xml', '<project></project>\n');
    const managers = new DependencyAuditor(dir).detectPackageManagers();
    assert.ok(managers.includes('maven'), `expected maven detected; got ${managers}`);
    const covered = auditedLanguagesFor(dir);
    assert.equal(covered.has('java'), false,
      'java must NOT read as audited — maven has no implemented audit, so SCA/osv must cover it');
    assert.equal(covered.size, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('auditedLanguagesFor: a poetry.lock-only project defers NOTHING (poetry unimplemented) — F1', () => {
  const dir = mkTmp('da-poetry-');
  try {
    write(dir, 'poetry.lock', '');
    const managers = new DependencyAuditor(dir).detectPackageManagers();
    assert.ok(managers.includes('poetry') && !managers.includes('pip'),
      `expected poetry-only detection; got ${managers}`);
    const covered = auditedLanguagesFor(dir);
    assert.equal(covered.has('python'), false,
      'python via poetry (unimplemented) must NOT read as covered');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('auditedLanguagesFor: a Pipfile-only project defers NOTHING (pipenv unimplemented) — F1', () => {
  const dir = mkTmp('da-pipenv-');
  try {
    write(dir, 'Pipfile', '[packages]\n');
    const managers = new DependencyAuditor(dir).detectPackageManagers();
    assert.ok(managers.includes('pipenv') && !managers.includes('pip'),
      `expected pipenv-only detection; got ${managers}`);
    const covered = auditedLanguagesFor(dir);
    assert.equal(covered.has('python'), false,
      'python via pipenv (unimplemented) must NOT read as covered');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('auditedLanguagesFor: an npm project defers javascript/typescript (npm IS implemented)', () => {
  const dir = mkTmp('da-npm-');
  try {
    write(dir, 'package.json', '{"name":"x","version":"1.0.0"}');
    write(dir, 'package-lock.json', '{}');
    const covered = auditedLanguagesFor(dir);
    assert.ok(covered.has('javascript') && covered.has('typescript'),
      'an npm project is genuinely audited by DependencyAuditor — js/ts are deferred exactly once');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('auditedLanguagesFor: a pip project (requirements.txt) defers python (pip IS implemented)', () => {
  const dir = mkTmp('da-pip-');
  try {
    write(dir, 'requirements.txt', 'flask==0.5\n');
    const covered = auditedLanguagesFor(dir);
    assert.ok(covered.has('python'), 'python via pip is genuinely audited — correctly deferred');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('auditedLanguagesFor: a nonexistent root fails soft to an empty set (defer nothing)', () => {
  const covered = auditedLanguagesFor(path.join(os.tmpdir(), 'ctoc-nope-' + Date.now()));
  assert.equal(covered.size, 0);
});

// ── F3: a poetry.lock project must NOT claim python — pip-audit cannot read poetry.lock ──
//
// A pyproject.toml + poetry.lock project co-detected `pip` (via the pyproject.toml
// config branch), so auditedLanguagesFor returned {python} and python was DEFERRED to
// DependencyAuditor — but DependencyAuditor's `pip-audit --format=json` (no -r) audits
// the environment, NEVER poetry.lock. So poetry.lock's pinned deps were audited by
// NEITHER runner while the human was told python was "covered". Deferral must recognise
// that a poetry.lock present means python is poetry-managed (unimplemented) → route to
// SCA/osv, which reads poetry.lock natively.

test('detectPackageManagers: pyproject.toml + poetry.lock detects poetry, NOT pip (F3)', () => {
  const dir = mkTmp('da-poetry-combo-');
  try {
    write(dir, 'pyproject.toml', '[tool.poetry]\n');
    write(dir, 'poetry.lock', '');
    const managers = new DependencyAuditor(dir).detectPackageManagers();
    assert.ok(managers.includes('poetry'), `expected poetry detected; got ${managers}`);
    assert.ok(!managers.includes('pip'),
      `pip must NOT be co-detected — pip-audit cannot read poetry.lock; got ${managers}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('auditedLanguagesFor: pyproject.toml + poetry.lock does NOT claim python (F3)', () => {
  const dir = mkTmp('da-poetry-combo2-');
  try {
    write(dir, 'pyproject.toml', '[tool.poetry]\n');
    write(dir, 'poetry.lock', '');
    const covered = auditedLanguagesFor(dir);
    assert.equal(covered.has('python'), false,
      'python via poetry.lock (pip-audit cannot read it) must NOT read as covered — SCA/osv must cover it');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('auditedLanguagesFor: pyproject.toml WITHOUT poetry.lock still defers python via pip — no over-correction (F3)', () => {
  const dir = mkTmp('da-pyproject-only-');
  try {
    write(dir, 'pyproject.toml', '[build-system]\n');
    const covered = auditedLanguagesFor(dir);
    assert.ok(covered.has('python'),
      'a pip-managed pyproject.toml (no poetry.lock) is genuinely audited by pip-audit — still deferred');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── F4: an empty/falsy root matches nothing — parity with registry.detectLanguages ──
//
// path.join('', 'package.json') → 'package.json' resolves against cwd, so an empty root
// falsely detected the CTOC repo's own managers. detectLanguages guards length===0; the
// auditor must agree.

test('auditedLanguagesFor: an empty-string root defers NOTHING — no cwd leakage (F4)', () => {
  assert.equal(auditedLanguagesFor('').size, 0);
});

test('auditedLanguagesFor: a null/undefined/non-string root fails soft to empty (F4)', () => {
  assert.equal(auditedLanguagesFor(null).size, 0);
  assert.equal(auditedLanguagesFor(undefined).size, 0);
  assert.equal(auditedLanguagesFor(42).size, 0);
});

test('detectPackageManagers: an empty-string root detects NOTHING — no cwd leakage (F4)', () => {
  assert.deepEqual(new DependencyAuditor('').detectPackageManagers(), []);
});

// ── FALSE-CLEAN: a yarn.lock/pnpm-lock.yaml-only repo (no package-lock.json) ──────────
//
// npm audit can read ONLY package-lock.json/npm-shrinkwrap.json — NEVER yarn.lock or
// pnpm-lock.yaml (it ENOLOCKs). yarn/pnpm are "implemented" in DependencyAuditor solely
// via the npm-audit fallback, so absent an npm lockfile that fallback audits NOTHING. So
// a yarn.lock-/pnpm-lock.yaml-only project must NOT be claimed as audited-by-
// DependencyAuditor — javascript is OMITTED from auditedLanguagesFor and routed to
// SCA/osv (which reads yarn.lock/pnpm-lock.yaml natively). Mirror of the F3 poetry.lock
// routing. When a package-lock.json IS present, npm audit genuinely works → keep the
// deferral.

test('auditedLanguagesFor: a yarn.lock-only repo (no package-lock.json) does NOT claim javascript — route to osv', () => {
  const dir = mkTmp('da-yarn-only-');
  try {
    write(dir, 'package.json', '{"name":"x","version":"1.0.0"}');
    write(dir, 'yarn.lock', '# yarn lockfile v1\n');
    const covered = auditedLanguagesFor(dir);
    assert.equal(covered.has('javascript'), false,
      'yarn.lock with no package-lock.json is NOT auditable by npm audit (ENOLOCK) — must route to osv, not be claimed covered');
    assert.equal(covered.has('typescript'), false,
      'typescript likewise must not be claimed for a yarn.lock-only repo');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('auditedLanguagesFor: a pnpm-lock.yaml-only repo (no package-lock.json) does NOT claim javascript — route to osv', () => {
  const dir = mkTmp('da-pnpm-only-');
  try {
    write(dir, 'package.json', '{"name":"x","version":"1.0.0"}');
    write(dir, 'pnpm-lock.yaml', 'lockfileVersion: 5.4\n');
    const covered = auditedLanguagesFor(dir);
    assert.equal(covered.has('javascript'), false,
      'pnpm-lock.yaml with no package-lock.json is NOT auditable by npm audit (ENOLOCK) — must route to osv');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('auditedLanguagesFor: yarn.lock WITH a package-lock.json still defers javascript (npm audit genuinely works)', () => {
  const dir = mkTmp('da-yarn-npmlock-');
  try {
    write(dir, 'package.json', '{"name":"x","version":"1.0.0"}');
    write(dir, 'yarn.lock', '# yarn lockfile v1\n');
    write(dir, 'package-lock.json', '{}');
    const covered = auditedLanguagesFor(dir);
    assert.ok(covered.has('javascript') && covered.has('typescript'),
      'a package-lock.json present means npm audit can read the tree — javascript is genuinely deferred (no over-correction)');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── ENOLOCK error envelope: `npm audit --json` on a tree with NO package-lock.json ─────
// returns {"error":{"code":"ENOLOCK",...}} and exits non-zero — NOTHING was audited.
// parseNpmAuditResults must detect the error envelope and push a LOUD error, never parse
// it to a silent 0-vuln/0-error clean pass (defense-in-depth, mirroring sca-runner's
// parseNpmAuditResults).

test('parseNpmAuditResults: an ENOLOCK error envelope pushes a LOUD error, NOT a silent 0/0 clean', () => {
  const a = new DependencyAuditor(mkTmp('da-enolock-'));
  a.parseNpmAuditResults({ error: { code: 'ENOLOCK', summary: 'This command requires an existing lockfile.' } });
  assert.equal(a.vulnerabilities.length, 0, 'an error envelope carries no vulnerabilities');
  assert.equal(a.errors.length, 1, 'the error envelope must be recorded as a LOUD error, never a silent clean');
  assert.match(a.errors[0].error, /ENOLOCK/,
    `the recorded error must name the failure code; got ${JSON.stringify(a.errors[0])}`);
});

test('parseNpmAuditResults: any error-envelope code (not just ENOLOCK) is a loud error', () => {
  const a = new DependencyAuditor(mkTmp('da-enolock2-'));
  a.parseNpmAuditResults({ error: { code: 'ECONNREFUSED', summary: 'registry unreachable' } });
  assert.equal(a.errors.length, 1, 'a registry error is a loud skip, never a clean pass');
  assert.equal(a.vulnerabilities.length, 0);
});

// ── SCA3: pip-audit must audit the project's PINNED requirements, not the ambient env ──
//
// `pip-audit --format=json` with NO -r audits the current interpreter's INSTALLED
// packages, NOT requirements.txt. In CI (deps not installed) a requirements.txt-only
// project then reads as clean though nothing was audited. When a requirements file
// exists, pip-audit must be pointed at it with -r <file> (iterating each detected file),
// invoked argv-safe via execFileSync (no shell string interpolation).

test('SCA3: DependencyAuditor.runPipAudit invokes pip-audit with -r <requirements> (audits pins, not ambient env)', async () => {
  let pipArgs = null;
  cp.execFileSync = (cmd, args) => {
    if (cmd === 'pip-audit') { pipArgs = args; return JSON.stringify([]); }
    throw new Error(`unexpected exec ${cmd} ${JSON.stringify(args)}`);
  };
  const { DependencyAuditor: DA } = freshDA();
  const dir = mkTmp('da-pip-r-');
  try {
    write(dir, 'requirements.txt', 'flask==0.5\n');
    const a = new DA(dir);
    await a.runPipAudit();
    assert.ok(pipArgs, 'pip-audit must be invoked (argv-safe via execFileSync)');
    const i = pipArgs.indexOf('-r');
    assert.ok(i >= 0, `pip-audit args must include -r; got ${JSON.stringify(pipArgs)}`);
    assert.ok(/requirements\.txt$/.test(pipArgs[i + 1]),
      `-r must be followed by the requirements path; got ${JSON.stringify(pipArgs)}`);
  } finally {
    restoreDA();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('SCA3: DependencyAuditor.runPipAudit iterates -r for EACH detected requirements file', async () => {
  let pipArgs = null;
  cp.execFileSync = (cmd, args) => {
    if (cmd === 'pip-audit') { pipArgs = args; return JSON.stringify([]); }
    throw new Error(`unexpected exec ${cmd} ${JSON.stringify(args)}`);
  };
  const { DependencyAuditor: DA } = freshDA();
  const dir = mkTmp('da-pip-r-multi-');
  try {
    write(dir, 'requirements.txt', 'flask==0.5\n');
    write(dir, 'requirements-dev.txt', 'pytest\n');
    const a = new DA(dir);
    await a.runPipAudit();
    const rCount = pipArgs.filter((x) => x === '-r').length;
    assert.equal(rCount, 2, `each detected requirements file must get its own -r; got ${JSON.stringify(pipArgs)}`);
  } finally {
    restoreDA();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// COVERAGE EXTENSION — the audit-run / parse / map / report surface.
//
// Seam control: ONLY the child_process invocation (execSync/execFileSync) is faked,
// exactly as the existing SCA3 tests do — parse/route/dedup/map logic is never mocked.
// Parser, mapper, dedup, summary, report and threshold methods are pure over their
// input and are exercised by direct calls on a real DependencyAuditor instance with
// realistic tool-output payloads.
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY = require(DA_PATH).SEVERITY;

/** A throwaway auditor for pure method calls — projectRoot is never touched by the
 *  parse/map/dedup/summary/report/threshold methods under test. */
function pureAuditor(opts) {
  return new DependencyAuditor('x', opts);
}

// ── isToolAvailable — the execSync availability probe ────────────────────────

test('isToolAvailable: returns true when the version probe succeeds, false when it throws', () => {
  cp.execSync = (cmd) => {
    if (cmd === 'npm --version') return '10.0.0';
    throw new Error('command not found');
  };
  const { DependencyAuditor: DA } = freshDA();
  try {
    const a = new DA('x');
    assert.equal(a.isToolAvailable('npm'), true, 'npm probe succeeded → available');
    assert.equal(a.isToolAvailable('cargo'), false, 'cargo probe threw → unavailable');
  } finally {
    restoreDA();
  }
});

test('isToolAvailable: an unknown manager has no probe command and is reported unavailable', () => {
  // No execSync fake needed — the guard returns before any child process runs.
  const a = pureAuditor();
  assert.equal(a.isToolAvailable('this-manager-does-not-exist'), false);
});

// ── run() — orchestration end to end ─────────────────────────────────────────

test('run: with no supported package managers returns a clean, explicit no-op result', async () => {
  const dir = mkTmp('da-run-empty-');
  try {
    const a = new DependencyAuditor(dir);
    const result = await a.run();
    assert.equal(result.success, true);
    assert.deepEqual(result.vulnerabilities, []);
    assert.equal(result.summary.total, 0);
    assert.match(result.message, /No supported package managers detected/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('run: an npm project audits, dedups, summarizes and reports one HIGH vulnerability', async () => {
  cp.execSync = (cmd) => {
    if (cmd.includes('--version')) return '10.0.0';            // isToolAvailable('npm')
    if (cmd === 'npm audit --json') {
      return JSON.stringify({
        vulnerabilities: {
          lodash: {
            name: 'lodash',
            range: '<4.17.21',
            severity: 'high',
            isDirect: true,
            via: [{
              title: 'Prototype Pollution',
              severity: 'high',
              url: 'https://example.test/advisory',
              cve: 'CVE-2020-8203',
              cwe: ['CWE-1321'],
              overview: 'Prototype pollution in lodash',
              fixAvailable: { version: '4.17.21' }
            }]
          }
        }
      });
    }
    throw new Error(`unexpected exec ${cmd}`);
  };
  const { DependencyAuditor: DA } = freshDA();
  const dir = mkTmp('da-run-npm-');
  try {
    write(dir, 'package.json', '{"name":"x","version":"1.0.0"}');
    write(dir, 'package-lock.json', '{}');
    const result = await new DA(dir).run();
    assert.equal(result.success, true);
    assert.equal(result.vulnerabilities.length, 1, 'exactly one vulnerability after dedup');
    assert.equal(result.vulnerabilities[0].severity, SEVERITY.HIGH);
    assert.equal(result.summary.total, 1);
    assert.equal(result.summary.bySeverity.HIGH, 1);
    assert.match(result.message, /Dependency Audit Report/);
    assert.match(result.message, /lodash/);
  } finally {
    restoreDA();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── runAudit — routing, fallback, unimplemented default, error capture ───────

test('runAudit: an unavailable non-JS tool records a loud "tool not available" error', async () => {
  cp.execSync = () => { throw new Error('not installed'); };
  const { DependencyAuditor: DA } = freshDA();
  try {
    const a = new DA('x');
    await a.runAudit('cargo');
    assert.equal(a.errors.length, 1);
    assert.match(a.errors[0].error, /cargo audit tool not available/);
  } finally {
    restoreDA();
  }
});

test('runAudit: an unavailable yarn falls back to npm audit when npm is available', async () => {
  cp.execSync = (cmd) => {
    if (cmd === 'yarn --version') throw new Error('no yarn');
    if (cmd === 'npm --version') return '10.0.0';
    if (cmd === 'npm audit --json') {
      return JSON.stringify({
        vulnerabilities: {
          minimist: {
            range: '<1.2.6', severity: 'moderate',
            via: [{ title: 'Prototype Pollution', severity: 'moderate', url: 'https://example.test/m' }]
          }
        }
      });
    }
    throw new Error(`unexpected exec ${cmd}`);
  };
  const { DependencyAuditor: DA } = freshDA();
  try {
    const a = new DA('x');
    await a.runAudit('yarn');
    assert.equal(a.vulnerabilities.length, 1, 'the npm-audit fallback ran and produced a vulnerability');
    assert.equal(a.vulnerabilities[0].manager, 'npm', 'the fallback records under the npm manager');
  } finally {
    restoreDA();
  }
});

test('runAudit: an available-but-unimplemented manager (maven) hits the default "not implemented" arm', async () => {
  cp.execSync = (cmd) => {
    if (cmd === 'mvn --version') return 'Apache Maven 3.9';  // isToolAvailable('maven') → true
    throw new Error(`unexpected exec ${cmd}`);
  };
  const { DependencyAuditor: DA } = freshDA();
  try {
    const a = new DA('x');
    await a.runAudit('maven');
    assert.equal(a.errors.length, 1);
    assert.match(a.errors[0].error, /Audit not implemented for maven/);
  } finally {
    restoreDA();
  }
});

test('runAudit: a sub-audit that throws is caught at the route and recorded, never propagated', async () => {
  // Defensive branch (runAudit try/catch): every runXxxAudit swallows its own errors, so
  // this route-level catch only fires if a sub-audit throws. A real subclass whose
  // runNpmAudit throws proves the route records the failure instead of crashing the run.
  class ThrowingAuditor extends DependencyAuditor {
    isToolAvailable() { return true; }
    async runNpmAudit() { throw new Error('boom in sub-audit'); }
  }
  const a = new ThrowingAuditor('x');
  await a.runAudit('npm');
  assert.equal(a.errors.length, 1);
  assert.match(a.errors[0].error, /boom in sub-audit/);
});

// ── runNpmAudit — command selection + non-zero-exit + malformed-JSON paths ────

test('runNpmAudit: omits dev dependencies in the command when includeDevDependencies is false', async () => {
  let seenCommand = null;
  cp.execSync = (cmd) => { seenCommand = cmd; return JSON.stringify({ vulnerabilities: {} }); };
  const { DependencyAuditor: DA } = freshDA();
  try {
    const a = new DA('x', { includeDevDependencies: false });
    await a.runNpmAudit();
    assert.equal(seenCommand, 'npm audit --json --omit=dev');
  } finally {
    restoreDA();
  }
});

test('runNpmAudit: parses results from error.stdout when npm audit exits non-zero (vulns found)', async () => {
  cp.execSync = () => {
    const err = new Error('npm audit found issues');
    err.stdout = JSON.stringify({
      vulnerabilities: {
        axios: { range: '<0.21.1', severity: 'critical', via: [{ title: 'SSRF', severity: 'critical', url: 'https://example.test/a' }] }
      }
    });
    throw err;
  };
  const { DependencyAuditor: DA } = freshDA();
  try {
    const a = new DA('x');
    await a.runNpmAudit();
    assert.equal(a.vulnerabilities.length, 1);
    assert.equal(a.vulnerabilities[0].severity, SEVERITY.CRITICAL);
  } finally {
    restoreDA();
  }
});

test('runNpmAudit: records a loud parse error when error.stdout is not valid JSON', async () => {
  cp.execSync = () => { const err = new Error('crashed'); err.stdout = 'not-json <<<'; throw err; };
  const { DependencyAuditor: DA } = freshDA();
  try {
    const a = new DA('x');
    await a.runNpmAudit();
    assert.equal(a.errors.length, 1);
    assert.match(a.errors[0].error, /Failed to parse audit results/);
  } finally {
    restoreDA();
  }
});

// ── runYarnAudit — NDJSON success + non-zero-exit paths ──────────────────────

test('runYarnAudit: parses auditAdvisory NDJSON lines and skips non-advisory / non-JSON lines', async () => {
  const advisory = {
    type: 'auditAdvisory',
    data: {
      advisory: {
        module_name: 'handlebars', vulnerable_versions: '<4.7.7', severity: 'high',
        title: 'RCE', overview: 'template RCE', cves: ['CVE-2021-23369'],
        url: 'https://example.test/h', patched_versions: '>=4.7.7'
      },
      resolution: { isDirect: true }
    }
  };
  cp.execSync = () => [
    JSON.stringify({ type: 'auditSummary', data: {} }),  // non-advisory → skipped
    'this is not json',                                   // non-JSON → skipped
    JSON.stringify(advisory)
  ].join('\n');
  const { DependencyAuditor: DA } = freshDA();
  try {
    const a = new DA('x');
    await a.runYarnAudit();
    assert.equal(a.vulnerabilities.length, 1);
    assert.equal(a.vulnerabilities[0].manager, 'yarn');
    assert.equal(a.vulnerabilities[0].isDirect, true);
  } finally {
    restoreDA();
  }
});

test('runYarnAudit: parses advisories from error.stdout when yarn audit exits non-zero', async () => {
  cp.execSync = () => {
    const err = new Error('vulns found');
    err.stdout = [
      'not-json-in-the-error-stream',   // exercises the non-JSON skip inside the error branch
      JSON.stringify({
        type: 'auditAdvisory',
        data: { advisory: { module_name: 'lodash', vulnerable_versions: '<4.17.21', severity: 'moderate', title: 'Proto', url: 'https://example.test/l' } }
      })
    ].join('\n');
    throw err;
  };
  const { DependencyAuditor: DA } = freshDA();
  try {
    const a = new DA('x');
    await a.runYarnAudit();
    assert.equal(a.vulnerabilities.length, 1);
    assert.equal(a.vulnerabilities[0].manager, 'yarn');
  } finally {
    restoreDA();
  }
});

// ── runPnpmAudit — success + malformed-stdout paths ──────────────────────────

test('runPnpmAudit: parses npm-shaped JSON on success', async () => {
  cp.execSync = () => JSON.stringify({
    vulnerabilities: { glob: { range: '<7.2.0', severity: 'low', via: [{ title: 'ReDoS', severity: 'low', url: 'https://example.test/g' }] } }
  });
  const { DependencyAuditor: DA } = freshDA();
  try {
    const a = new DA('x');
    await a.runPnpmAudit();
    assert.equal(a.vulnerabilities.length, 1);
    assert.equal(a.vulnerabilities[0].severity, SEVERITY.LOW);
  } finally {
    restoreDA();
  }
});

test('runPnpmAudit: records a loud parse error when error.stdout is malformed JSON', async () => {
  cp.execSync = () => { const err = new Error('crashed'); err.stdout = '{bad'; throw err; };
  const { DependencyAuditor: DA } = freshDA();
  try {
    const a = new DA('x');
    await a.runPnpmAudit();
    assert.equal(a.errors.length, 1);
    assert.equal(a.errors[0].manager, 'pnpm');
    assert.match(a.errors[0].error, /Failed to parse audit results/);
  } finally {
    restoreDA();
  }
});

// ── runPipAudit — non-zero-exit parse + malformed paths (execFileSync seam) ───

test('runPipAudit: parses results from error.stdout when pip-audit exits non-zero', async () => {
  cp.execFileSync = () => {
    const err = new Error('vulns found');
    err.stdout = JSON.stringify([
      { name: 'flask', version: '0.5', vulns: [{ id: 'PYSEC-2019-1', severity: 'high', description: 'XSS', aliases: ['CVE-2019-1010083'], link: 'https://example.test/f', fix_versions: ['1.0'] }] }
    ]);
    throw err;
  };
  const { DependencyAuditor: DA } = freshDA();
  const dir = mkTmp('da-pip-nonzero-');
  try {
    write(dir, 'requirements.txt', 'flask==0.5\n');
    const a = new DA(dir);
    await a.runPipAudit();
    assert.equal(a.vulnerabilities.length, 1);
    assert.equal(a.vulnerabilities[0].cve, 'CVE-2019-1010083');
  } finally {
    restoreDA();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runPipAudit: records a loud parse error when error.stdout is malformed JSON', async () => {
  cp.execFileSync = () => { const err = new Error('crashed'); err.stdout = 'not json'; throw err; };
  const { DependencyAuditor: DA } = freshDA();
  const dir = mkTmp('da-pip-bad-');
  try {
    write(dir, 'requirements.txt', 'flask==0.5\n');
    const a = new DA(dir);
    await a.runPipAudit();
    assert.equal(a.errors.length, 1);
    assert.match(a.errors[0].error, /Failed to parse audit results/);
  } finally {
    restoreDA();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── runGoVulncheck / runCargoAudit / runBundlerAudit / runComposerAudit ──────

test('runGoVulncheck: parses NDJSON on success and again from error.stdout on non-zero exit', async () => {
  const osvLine = JSON.stringify({
    osv: {
      id: 'GO-2022-0001',
      summary: 'stdlib bug',
      details: 'details here',
      aliases: ['CVE-2022-1111'],
      affected: [{ package: { name: 'net/http' }, ranges: [{ events: [{ introduced: '0' }, { fixed: '1.18.1' }] }] }],
      severity: [{ score: 7.5 }]
    }
  });
  cp.execSync = () => osvLine + '\nnot-json-line';
  let { DependencyAuditor: DA } = freshDA();
  try {
    const a = new DA('x');
    await a.runGoVulncheck();
    assert.equal(a.vulnerabilities.length, 1);
    assert.equal(a.vulnerabilities[0].manager, 'go');
    assert.equal(a.vulnerabilities[0].fixedIn, '1.18.1');
  } finally {
    restoreDA();
  }

  cp.execSync = () => { const err = new Error('go crashed'); err.stdout = osvLine; throw err; };
  ({ DependencyAuditor: DA } = freshDA());
  try {
    const a = new DA('x');
    await a.runGoVulncheck();
    assert.equal(a.vulnerabilities.length, 1, 'error.stdout NDJSON is still parsed');
  } finally {
    restoreDA();
  }
});

test('runCargoAudit: parses JSON on success and records a parse error on malformed error.stdout', async () => {
  cp.execSync = () => JSON.stringify({
    vulnerabilities: { list: [{
      package: { name: 'time', version: '0.1.0' },
      advisory: { title: 'Segfault', description: 'unsound', aliases: ['CVE-2020-26235'], url: 'https://example.test/t', severity: 'high' },
      versions: { patched: ['>=0.2.23'] }
    }] }
  });
  let { DependencyAuditor: DA } = freshDA();
  try {
    const a = new DA('x');
    await a.runCargoAudit();
    assert.equal(a.vulnerabilities.length, 1);
    assert.equal(a.vulnerabilities[0].fixedIn, '>=0.2.23');
  } finally {
    restoreDA();
  }

  cp.execSync = () => { const err = new Error('cargo crashed'); err.stdout = '{nope'; throw err; };
  ({ DependencyAuditor: DA } = freshDA());
  try {
    const a = new DA('x');
    await a.runCargoAudit();
    assert.equal(a.errors.length, 1);
    assert.equal(a.errors[0].manager, 'cargo');
    assert.match(a.errors[0].error, /Failed to parse audit results/);
  } finally {
    restoreDA();
  }
});

test('runBundlerAudit: parses results on success and again from error.stdout on non-zero exit', async () => {
  const payload = JSON.stringify({
    results: [{
      gem: { name: 'rails', version: '5.0.0' },
      advisory: { title: 'CSRF', description: 'csrf', criticality: 'high', cve: 'CVE-2020-8166', url: 'https://example.test/r', patched_versions: ['>=5.2.4.3'] }
    }]
  });
  cp.execSync = () => payload;
  let { DependencyAuditor: DA } = freshDA();
  try {
    const a = new DA('x');
    await a.runBundlerAudit();
    assert.equal(a.vulnerabilities.length, 1);
    assert.equal(a.vulnerabilities[0].severity, SEVERITY.HIGH);
  } finally {
    restoreDA();
  }

  cp.execSync = () => { const err = new Error('bundle crashed'); err.stdout = payload; throw err; };
  ({ DependencyAuditor: DA } = freshDA());
  try {
    const a = new DA('x');
    await a.runBundlerAudit();
    assert.equal(a.vulnerabilities.length, 1, 'error.stdout results are parsed');
  } finally {
    restoreDA();
  }
});

test('runComposerAudit: parses advisories on success and records a parse error on malformed error.stdout', async () => {
  cp.execSync = () => JSON.stringify({
    advisories: {
      'symfony/http-kernel': [{ title: 'Header injection', description: 'inj', severity: 'medium', cve: 'CVE-2019-18888', link: 'https://example.test/s', affectedVersions: '<4.3.8' }]
    }
  });
  let { DependencyAuditor: DA } = freshDA();
  try {
    const a = new DA('x');
    await a.runComposerAudit();
    assert.equal(a.vulnerabilities.length, 1);
    assert.equal(a.vulnerabilities[0].package, 'symfony/http-kernel');
    assert.equal(a.vulnerabilities[0].severity, SEVERITY.MODERATE);
  } finally {
    restoreDA();
  }

  cp.execSync = () => { const err = new Error('composer crashed'); err.stdout = 'oops'; throw err; };
  ({ DependencyAuditor: DA } = freshDA());
  try {
    const a = new DA('x');
    await a.runComposerAudit();
    assert.equal(a.errors.length, 1);
    assert.equal(a.errors[0].manager, 'composer');
    assert.match(a.errors[0].error, /Failed to parse audit results/);
  } finally {
    restoreDA();
  }
});

// ── parseNpmAuditResults — v1/v2 shapes and guard branches ───────────────────

test('parseNpmAuditResults: a null or non-object payload is ignored, recording nothing', () => {
  const a = pureAuditor();
  a.parseNpmAuditResults(null);
  a.parseNpmAuditResults('a string');
  assert.equal(a.vulnerabilities.length, 0);
  assert.equal(a.errors.length, 0);
});

test('parseNpmAuditResults: v2 records an object advisory AND a string-via advisory (CRITICAL never dropped)', () => {
  const a = pureAuditor();
  a.parseNpmAuditResults({
    vulnerabilities: {
      good: { range: '<1.0.0', severity: 'high', isDirect: true, via: [{ title: 'Bug', severity: 'high', url: 'https://example.test/g', cve: 'CVE-2021-0001', cwe: ['CWE-79'], overview: 'ov', fixAvailable: { version: '1.0.0' } }] },
      // npm v2 transitive advisory: via[0] is a package-name STRING, no object advisory.
      // It carries its OWN severity/range — must still be recorded, never silently dropped.
      indirect: { range: '<2.0.0', severity: 'critical', via: ['just-a-string-ref'] }
    }
  });
  assert.equal(a.vulnerabilities.length, 2, 'BOTH the object-advisory and the string-via entry are recorded');
  const good = a.vulnerabilities.find(v => v.package === 'good');
  const indirect = a.vulnerabilities.find(v => v.package === 'indirect');
  assert.ok(good, 'object-advisory entry recorded');
  assert.equal(good.fixedIn, '1.0.0');
  assert.ok(indirect, 'string-via entry recorded (not dropped)');
  assert.equal(indirect.severity, SEVERITY.CRITICAL, 'string-via CRITICAL is preserved from the entry severity');
  assert.equal(indirect.version, '<2.0.0', 'string-via version comes from the entry range');
});

// DEFECT 1(b): a v2 entry with a STRING-only via must not be silently dropped — its own
// severity/range/name record a vuln. Prior code did `typeof 'lodash' === 'object'` → false
// → skipped, dropping a real (possibly CRITICAL) advisory.
test('parseNpmAuditResults: a string-only via records a vuln from the entry severity/range/name', () => {
  const a = pureAuditor();
  a.parseNpmAuditResults({
    vulnerabilities: {
      minimist: { name: 'minimist', range: '<0.2.1', severity: 'critical', via: ['lodash'], isDirect: false }
    }
  });
  assert.equal(a.vulnerabilities.length, 1, 'the string-via CRITICAL is recorded, never dropped');
  assert.equal(a.vulnerabilities[0].package, 'minimist');
  assert.equal(a.vulnerabilities[0].severity, SEVERITY.CRITICAL);
  assert.equal(a.errors.length, 0, 'a well-formed string-via entry is a vuln, not an error');
});

// DEFECT 1(a): a v2 entry with a MISSING via must NOT throw (which, on runNpmAudit's success
// path, has no .stdout and is swallowed → fail-open 0-vuln/0-error clean). It records the vuln
// from the entry's own severity, and one bad entry never nukes the rest of the report.
test('parseNpmAuditResults: a MISSING via does not throw and still records the vuln', () => {
  const a = pureAuditor();
  assert.doesNotThrow(() => {
    a.parseNpmAuditResults({
      vulnerabilities: {
        lodash: { severity: 'high', range: '<4.17.21' }  // no `via` at all
      }
    });
  }, 'a missing via must never throw a TypeError');
  assert.equal(a.vulnerabilities.length, 1, 'the entry is recorded from its own severity/range');
  assert.equal(a.vulnerabilities[0].package, 'lodash');
  assert.equal(a.vulnerabilities[0].severity, SEVERITY.HIGH);
});

test('parseNpmAuditResults: one uninterpretable entry records a per-entry error, never nuking the whole report', () => {
  const a = pureAuditor();
  a.parseNpmAuditResults({
    vulnerabilities: {
      broken: null,  // vuln is null → cannot index; must be a per-entry error, not a throw
      real: { severity: 'critical', range: '<1.0.0', via: [{ title: 'RCE', severity: 'critical' }] }
    }
  });
  assert.equal(a.vulnerabilities.length, 1, 'the good entry after a bad one is still recorded');
  assert.equal(a.vulnerabilities[0].package, 'real');
  assert.equal(a.errors.length, 1, 'the bad entry records a loud per-entry error');
  assert.match(a.errors[0].error, /broken/, 'the per-entry error names the offending package');
});

test('parseNpmAuditResults: v1 advisories shape is recorded with first CVE and patched range', () => {
  const a = pureAuditor();
  a.parseNpmAuditResults({
    advisories: {
      1234: { module_name: 'legacy', vulnerable_versions: '<3.0.0', severity: 'critical', title: 'Old bug', overview: 'ov', cves: ['CVE-2018-0001', 'CVE-2018-0002'], cwe: 'CWE-89', url: 'https://example.test/legacy', patched_versions: '>=3.0.0' }
    }
  });
  assert.equal(a.vulnerabilities.length, 1);
  assert.equal(a.vulnerabilities[0].cve, 'CVE-2018-0001');
  assert.equal(a.vulnerabilities[0].severity, SEVERITY.CRITICAL);
});

// ── parseYarnAdvisory / parsePipAuditResults ─────────────────────────────────

test('parseYarnAdvisory: falls back to isDirect=false when resolution is absent', () => {
  const a = pureAuditor();
  a.parseYarnAdvisory({ advisory: { module_name: 'y', vulnerable_versions: '<1', severity: 'moderate', title: 'T', url: 'https://example.test/y' } });
  assert.equal(a.vulnerabilities.length, 1);
  assert.equal(a.vulnerabilities[0].isDirect, false);
});

test('parsePipAuditResults: ignores a non-array payload and records nothing', () => {
  const a = pureAuditor();
  a.parsePipAuditResults({ not: 'an array' });
  assert.equal(a.vulnerabilities.length, 0);
});

test('parsePipAuditResults: a vuln with no vulns detail falls back to placeholder fields', () => {
  const a = pureAuditor();
  a.parsePipAuditResults([{ name: 'lonely', version: '0.0.1' }]);
  assert.equal(a.vulnerabilities.length, 1);
  assert.equal(a.vulnerabilities[0].title, 'Unknown vulnerability');
  assert.equal(a.vulnerabilities[0].cve, null);
  assert.equal(a.vulnerabilities[0].severity, SEVERITY.MODERATE, 'unknown severity over-reports to the mid band');
});

// ── parseGovulncheckResults — dedup by osv id, skip non-osv/non-json ─────────

test('parseGovulncheckResults: dedupes repeated osv ids and skips non-osv and non-JSON lines', () => {
  const a = pureAuditor();
  const line = JSON.stringify({ osv: { id: 'GO-1', summary: 's', affected: [{ package: { name: 'p' }, ranges: [{ events: [{ introduced: '0' }] }] }] } });
  const data = [line, line, JSON.stringify({ progress: 'scanning' }), 'garbage'].join('\n');
  a.parseGovulncheckResults(data);
  assert.equal(a.vulnerabilities.length, 1, 'the same osv id is recorded exactly once');
  assert.equal(a.vulnerabilities[0].package, 'p');
});

// ── parseCargoAudit / parseBundler / parseComposer guard branches ────────────

test('parseCargoAuditResults: a payload without vulnerabilities.list records nothing', () => {
  const a = pureAuditor();
  a.parseCargoAuditResults({ vulnerabilities: {} });
  assert.equal(a.vulnerabilities.length, 0);
});

test('parseCargoAuditResults: missing package/advisory fields fall back to "unknown"/placeholder', () => {
  const a = pureAuditor();
  a.parseCargoAuditResults({ vulnerabilities: { list: [{}] } });
  assert.equal(a.vulnerabilities.length, 1);
  assert.equal(a.vulnerabilities[0].package, 'unknown');
  assert.equal(a.vulnerabilities[0].title, 'Unknown vulnerability');
});

test('parseBundlerAuditResults: a payload without results records nothing', () => {
  const a = pureAuditor();
  a.parseBundlerAuditResults({});
  assert.equal(a.vulnerabilities.length, 0);
});

test('parseBundlerAuditResults: missing gem/advisory fields fall back to "unknown"/placeholder', () => {
  const a = pureAuditor();
  a.parseBundlerAuditResults({ results: [{}] });
  assert.equal(a.vulnerabilities.length, 1);
  assert.equal(a.vulnerabilities[0].package, 'unknown');
  assert.equal(a.vulnerabilities[0].severity, SEVERITY.MODERATE, 'absent criticality over-reports to the mid band');
});

test('parseComposerAuditResults: a payload without advisories records nothing', () => {
  const a = pureAuditor();
  a.parseComposerAuditResults({});
  assert.equal(a.vulnerabilities.length, 0);
});

// ── severity mappers ─────────────────────────────────────────────────────────

test('mapNpmSeverity: maps known labels and defaults unknown/absent to the mid band', () => {
  const a = pureAuditor();
  assert.equal(a.mapNpmSeverity('critical'), SEVERITY.CRITICAL);
  assert.equal(a.mapNpmSeverity('HIGH'), SEVERITY.HIGH);
  assert.equal(a.mapNpmSeverity('moderate'), SEVERITY.MODERATE);
  assert.equal(a.mapNpmSeverity('low'), SEVERITY.LOW);
  assert.equal(a.mapNpmSeverity('info'), SEVERITY.INFO);
  assert.equal(a.mapNpmSeverity('nonsense'), SEVERITY.MODERATE);
  assert.equal(a.mapNpmSeverity(undefined), SEVERITY.MODERATE);
});

test('mapRustAdvisorySeverity: maps known labels and defaults unknown to the mid band', () => {
  const a = pureAuditor();
  assert.equal(a.mapRustAdvisorySeverity('critical'), SEVERITY.CRITICAL);
  assert.equal(a.mapRustAdvisorySeverity('medium'), SEVERITY.MODERATE);
  assert.equal(a.mapRustAdvisorySeverity('informational'), SEVERITY.INFO);
  assert.equal(a.mapRustAdvisorySeverity(undefined), SEVERITY.MODERATE);
});

test('mapBundlerSeverity: maps criticality labels and defaults unknown to the mid band', () => {
  const a = pureAuditor();
  assert.equal(a.mapBundlerSeverity('critical'), SEVERITY.CRITICAL);
  assert.equal(a.mapBundlerSeverity('medium'), SEVERITY.MODERATE);
  assert.equal(a.mapBundlerSeverity('unknown'), SEVERITY.MODERATE);
  assert.equal(a.mapBundlerSeverity('not-a-level'), SEVERITY.MODERATE);
});

test('mapComposerSeverity: maps known labels and defaults unknown to the mid band', () => {
  const a = pureAuditor();
  assert.equal(a.mapComposerSeverity('critical'), SEVERITY.CRITICAL);
  assert.equal(a.mapComposerSeverity('low'), SEVERITY.LOW);
  assert.equal(a.mapComposerSeverity(undefined), SEVERITY.MODERATE);
});

test('mapPipSeverity / mapGoSeverity: band a numeric CVSS score, a label, and a CVSS vector; unknown → mid band', () => {
  const a = pureAuditor();
  assert.equal(a.mapPipSeverity(9.8), SEVERITY.CRITICAL);
  assert.equal(a.mapPipSeverity(7.5), SEVERITY.HIGH);
  assert.equal(a.mapPipSeverity(5.0), SEVERITY.MODERATE);
  assert.equal(a.mapPipSeverity(2.0), SEVERITY.LOW);
  assert.equal(a.mapGoSeverity('critical'), SEVERITY.CRITICAL);
  assert.equal(a.mapGoSeverity('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'), SEVERITY.CRITICAL,
    'a CVSS vector is base-scored (9.8) and banded CRITICAL — never under-reported');
  assert.equal(a.mapPipSeverity(undefined), SEVERITY.MODERATE, 'unknown severity over-reports to the mid band');
});

test('_cvssVectorBaseScore: computes 9.8 for a fully-critical vector and null for a garbage vector', () => {
  const a = pureAuditor();
  assert.equal(a._cvssVectorBaseScore('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'), 9.8);
  assert.equal(a._cvssVectorBaseScore('not-a-vector'), null);
});

// ── deduplicateVulnerabilities ───────────────────────────────────────────────

test('deduplicateVulnerabilities: collapses same package+cve, keeps distinct keys', () => {
  const a = pureAuditor();
  a.vulnerabilities = [
    { package: 'x', cve: 'CVE-1', severity: SEVERITY.HIGH, title: 'a' },
    { package: 'x', cve: 'CVE-1', severity: SEVERITY.HIGH, title: 'dup' },   // duplicate key → dropped
    { package: 'y', cve: null, title: 'by-title', severity: SEVERITY.LOW }   // keyed by title when no cve
  ];
  const unique = a.deduplicateVulnerabilities();
  assert.equal(unique.length, 2);
  assert.equal(unique[0].title, 'a', 'the first occurrence of a duplicate key wins');
});

// ── generateSummary / generateReport ─────────────────────────────────────────

test('generateSummary: totals and per-severity / per-manager tallies are correct', () => {
  const a = pureAuditor();
  const vulns = [
    { severity: SEVERITY.CRITICAL, manager: 'npm' },
    { severity: SEVERITY.HIGH, manager: 'npm' },
    { severity: SEVERITY.HIGH, manager: 'cargo' }
  ];
  const summary = a.generateSummary(vulns, ['npm', 'cargo'], 3000);
  assert.equal(summary.total, 3);
  assert.equal(summary.bySeverity.HIGH, 2);
  assert.equal(summary.bySeverity.CRITICAL, 1);
  assert.equal(summary.byPackageManager.npm, 2);
  assert.equal(summary.duration, 3, 'duration is reported in whole seconds');
});

test('generateReport: renders severity groups, the "and N more" overflow, CVE/fix lines, and audit errors', () => {
  const a = pureAuditor();
  const vulns = [];
  for (let i = 0; i < 12; i++) {
    vulns.push({ package: `pkg${i}`, version: '1.0.0', severity: SEVERITY.HIGH, title: `High issue ${i}`, cve: `CVE-2021-00${i}`, fixedIn: '2.0.0' });
  }
  vulns.push({ package: 'critpkg', version: '0.1.0', severity: SEVERITY.CRITICAL, title: 'Critical issue', cve: null, fixedIn: null });
  a.errors = [{ manager: 'npm', error: 'registry timeout' }];
  const summary = a.generateSummary(vulns, ['npm'], 1000);
  const report = a.generateReport(vulns, summary);

  assert.match(report, /Total Vulnerabilities: 13/);
  assert.match(report, /CRITICAL Vulnerabilities \(1\)/);
  assert.match(report, /HIGH Vulnerabilities \(12\)/);
  assert.match(report, /and 2 more HIGH vulnerabilities/, 'only the first 10 of a group are listed, the rest summarised');
  assert.match(report, /CVE: CVE-2021-000/);
  assert.match(report, /Fix: Upgrade to 2\.0\.0/);
  assert.match(report, /\[npm\] registry timeout/, 'audit errors are surfaced in the report');
});

// ── checkThreshold ───────────────────────────────────────────────────────────

test('checkThreshold: fails when a vulnerability meets/exceeds the threshold, passes otherwise', () => {
  const a = pureAuditor();
  a.vulnerabilities = [{ severity: SEVERITY.HIGH }, { severity: SEVERITY.LOW }];
  const failing = a.checkThreshold(SEVERITY.HIGH);
  assert.equal(failing.pass, false);
  assert.equal(failing.failing, 1, 'only the HIGH vuln is at or above the HIGH threshold');
  assert.match(failing.message, /FAIL/);
});

test('checkThreshold: passes with no vulnerabilities and defaults the threshold to HIGH', () => {
  const a = pureAuditor();
  a.vulnerabilities = [{ severity: SEVERITY.LOW }];
  const result = a.checkThreshold();  // default threshold HIGH
  assert.equal(result.pass, true);
  assert.equal(result.threshold, SEVERITY.HIGH);
  assert.match(result.message, /PASS/);
});

// ── auditedLanguagesFor — fail-soft catch when detection itself throws ────────

test('auditedLanguagesFor: fails soft to an empty set when the filesystem probe throws', () => {
  // Controlling the filesystem boundary (safe-fs.existsSync) — not the auditor's logic.
  // detectPackageManagers calls existsSync outside a try; a throw must be caught by
  // auditedLanguagesFor's fail-soft guard so nothing is (wrongly) deferred.
  const safeFs = require('../src/lib/safe-fs');
  const orig = safeFs.existsSync;
  safeFs.existsSync = () => { throw new Error('fs probe exploded'); };
  try {
    const covered = auditedLanguagesFor(os.tmpdir());
    assert.equal(covered.size, 0, 'a detection error defers NOTHING (SCA scans everything)');
  } finally {
    safeFs.existsSync = orig;
  }
});

// ── Remaining switch-arm routing, sort comparator, and one more error path ────

test('runAudit: every implemented manager routes to its own audit arm (no default, no error)', async () => {
  cp.execSync = (cmd) => {
    if (/version/.test(cmd)) return 'ok';                     // isToolAvailable probes
    if (cmd.startsWith('yarn audit')) return '';              // empty NDJSON
    if (cmd.startsWith('pnpm audit')) return JSON.stringify({});
    if (cmd.startsWith('govulncheck')) return '';
    if (cmd.startsWith('cargo audit')) return JSON.stringify({});
    if (cmd.startsWith('bundle audit')) return JSON.stringify({});
    if (cmd.startsWith('composer audit')) return JSON.stringify({});
    if (cmd.startsWith('npm audit')) return JSON.stringify({ vulnerabilities: {} });
    return 'ok';
  };
  cp.execFileSync = () => JSON.stringify([]);                 // pip-audit
  const { DependencyAuditor: DA } = freshDA();
  try {
    for (const m of ['yarn', 'pnpm', 'pip', 'go', 'cargo', 'bundler', 'composer']) {
      const a = new DA('x');
      await a.runAudit(m);
      assert.equal(a.errors.length, 0,
        `${m} must route to its implemented switch arm with no error; got ${JSON.stringify(a.errors)}`);
    }
  } finally {
    restoreDA();
  }
});

test('run: sorts multiple vulnerabilities by descending severity (CRITICAL before HIGH)', async () => {
  cp.execSync = (cmd) => {
    if (cmd.includes('--version')) return '10.0.0';
    if (cmd === 'npm audit --json') {
      return JSON.stringify({
        vulnerabilities: {
          lowpkg: { range: '<1', severity: 'high', via: [{ title: 'H', severity: 'high', url: 'https://example.test/h', cve: 'CVE-2021-1' }] },
          toppkg: { range: '<1', severity: 'critical', via: [{ title: 'C', severity: 'critical', url: 'https://example.test/c', cve: 'CVE-2021-2' }] }
        }
      });
    }
    throw new Error(`unexpected exec ${cmd}`);
  };
  const { DependencyAuditor: DA } = freshDA();
  const dir = mkTmp('da-run-sort-');
  try {
    write(dir, 'package.json', '{"name":"x","version":"1.0.0"}');
    write(dir, 'package-lock.json', '{}');
    const result = await new DA(dir).run();
    assert.equal(result.vulnerabilities.length, 2);
    assert.equal(result.vulnerabilities[0].severity, SEVERITY.CRITICAL,
      'the sort comparator orders CRITICAL ahead of HIGH');
    assert.equal(result.vulnerabilities[1].severity, SEVERITY.HIGH);
  } finally {
    restoreDA();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runBundlerAudit: records a loud parse error when error.stdout is malformed JSON', async () => {
  cp.execSync = () => { const err = new Error('bundle crashed'); err.stdout = '{not-valid'; throw err; };
  const { DependencyAuditor: DA } = freshDA();
  try {
    const a = new DA('x');
    await a.runBundlerAudit();
    assert.equal(a.errors.length, 1);
    assert.equal(a.errors[0].manager, 'bundler');
    assert.match(a.errors[0].error, /Failed to parse audit results/);
  } finally {
    restoreDA();
  }
});
