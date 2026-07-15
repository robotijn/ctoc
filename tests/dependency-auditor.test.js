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
