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

const DA_PATH = require.resolve('../src/lib/dependency-auditor');
const {
  IMPLEMENTED_MANAGERS,
  COVERED_LANGUAGES,
  MANAGER_LANGUAGES,
  auditedLanguagesFor,
  DependencyAuditor
} = require(DA_PATH);

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

// ── COVERED_LANGUAGES — keyed to IMPLEMENTED managers, not the nominal union ───────

test('COVERED_LANGUAGES excludes java — its only managers (maven/gradle) are unimplemented (F1)', () => {
  assert.equal(COVERED_LANGUAGES.has('java'), false,
    'java has NO implemented manager, so DependencyAuditor must NOT claim to cover it');
});

test('COVERED_LANGUAGES still includes every language an IMPLEMENTED manager audits', () => {
  for (const l of ['javascript', 'typescript', 'python', 'go', 'rust', 'ruby', 'php']) {
    assert.ok(COVERED_LANGUAGES.has(l), `${l} has an implemented manager and remains covered`);
  }
});

// ── auditedLanguagesFor — per-project, keyed on DETECTED ∩ IMPLEMENTED ─────────────

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
