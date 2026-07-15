/**
 * SAST runner hardening — SEVERE + correctness defects, TDD-red-first.
 *
 * FN-2  the CRITICAL gate can never fail — CWE_SEVERITY_MAP is dead code, every
 *        severity mapper caps at HIGH, so checkThreshold('CRITICAL') passes even on
 *        OS command injection. FIX: promote a finding's severity to its CWE floor.
 * INJ-1 command injection — runSemgrep/runBandit build `--exclude=<dir>` into an
 *        execSync SHELL string; a shell metacharacter in an exclude value executes.
 *        FIX: execFileSync with an argv array, no shell, each exclude a literal arg.
 * INJ-2 runBandit emitted `--exclude=--exclude=a,b` (double-prefixed) → bandit's
 *        exclusion silently failed. FIX: one well-formed `--exclude=<comma-list>`.
 * FN-1  loose source with no manifest reads clean — detectLanguages returns [] for a
 *        repo of loose .py/.js/… files, so run() reports success:true / "no supported
 *        languages". FIX: detect the five SAST languages by their source files too;
 *        source-present + tool-absent → scanned:false, never a silent clean pass.
 * FN-3  parseESLintResults kept only ruleIds containing 'security', dropping no-eval,
 *        no-implied-eval, no-script-url, no-unsanitized/*. FIX: a known security set.
 * FN-4  deduplicateFindings keyed on message.substring(0,50), collapsing two distinct
 *        findings sharing a 50-char prefix. FIX: key on the full message.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const SAST_PATH = require.resolve('../src/lib/sast-runner');
const REAL_EXEC = cp.execSync;
const REAL_EXECFILE = cp.execFileSync;

/** Reload sast-runner AFTER installing cp.execSync/execFileSync fakes (the module
 *  destructures them at load time). */
function freshSAST() {
  delete require.cache[SAST_PATH];
  return require(SAST_PATH).SASTRunner;
}

function restore() {
  cp.execSync = REAL_EXEC;
  cp.execFileSync = REAL_EXECFILE;
  delete require.cache[SAST_PATH];
}

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sast-harden-'));
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

// ── FN-2: CWE floor promotes a finding to CRITICAL, and the gate fails ────────────

test('FN-2: a semgrep ERROR finding carrying CWE-78 is promoted to CRITICAL', () => {
  const { SASTRunner } = require('../src/lib/sast-runner');
  const r = new SASTRunner('/no/such/dir');
  r.parseSemgrepResults({
    results: [{
      check_id: 'os-command-injection',
      path: 'handler.py',
      start: { line: 3, col: 1 },
      extra: {
        message: 'user input flows into os.system',
        severity: 'ERROR',                 // native map caps at HIGH
        metadata: { cwe: 'CWE-78' },       // but CWE-78 is CRITICAL
        lines: 'os.system(request.args.get("cmd"))'
      }
    }]
  });
  assert.strictEqual(r.findings.length, 1);
  assert.strictEqual(r.findings[0].severity, 'CRITICAL',
    'CWE-78 (OS command injection) must promote the finding to CRITICAL');
});

test('FN-2: checkThreshold("CRITICAL") FAILS on a CWE-78 finding (the gate can now fail)', () => {
  const { SASTRunner } = require('../src/lib/sast-runner');
  const r = new SASTRunner('/no/such/dir');
  r.parseSemgrepResults({
    results: [{
      check_id: 'os-command-injection', path: 'h.py', start: { line: 1, col: 1 },
      extra: { message: 'command injection', severity: 'ERROR', metadata: { cwe: 'CWE-78' }, lines: 'x' }
    }]
  });
  const res = r.checkThreshold('CRITICAL');
  assert.strictEqual(res.pass, false, 'a CRITICAL gate must FAIL on OS command injection');
  assert.ok(res.failing >= 1, 'at least one finding fails the CRITICAL threshold');
});

test('FN-2: a bare-number gosec CWE ("89") is normalized and promoted to CRITICAL', () => {
  const { SASTRunner } = require('../src/lib/sast-runner');
  const r = new SASTRunner('/no/such/dir');
  r.parseGosecResults({
    Issues: [{
      rule_id: 'G201', file: 'q.go', line: '10', column: '2',
      details: 'SQL string formatting', severity: 'HIGH', confidence: 'HIGH',
      cwe: { id: '89' }                    // gosec emits a bare number
    }]
  });
  assert.strictEqual(r.findings[0].severity, 'CRITICAL',
    'CWE-89 (SQL injection) from a bare-number gosec id must promote to CRITICAL');
});

test('FN-2 regression: a finding with NO cwe keeps its tool-mapped severity', () => {
  const { SASTRunner } = require('../src/lib/sast-runner');
  const r = new SASTRunner('/no/such/dir');
  r.parseSemgrepResults({
    results: [{
      check_id: 'x', path: 'a.py', start: { line: 1, col: 1 },
      extra: { message: 'no cwe here', severity: 'ERROR', metadata: {}, lines: 'x' }
    }]
  });
  assert.strictEqual(r.findings[0].severity, 'HIGH', 'no CWE → severity unchanged (ERROR→HIGH)');
});

test('FN-2 regression: a LOW-CWE finding is NOT demoted below its tool-mapped severity', () => {
  const { SASTRunner } = require('../src/lib/sast-runner');
  const r = new SASTRunner('/no/such/dir');
  r.parseSemgrepResults({
    results: [{
      check_id: 'x', path: 'a.py', start: { line: 1, col: 1 },
      extra: { message: 'info disclosure', severity: 'ERROR', metadata: { cwe: 'CWE-200' }, lines: 'x' }
    }]
  });
  // CWE-200 maps to LOW; the tool said HIGH. Promotion only ever RAISES severity.
  assert.strictEqual(r.findings[0].severity, 'HIGH', 'a lower CWE floor must not demote a HIGH finding');
});

// ── INJ-1 + INJ-2: no shell; excludes are literal argv elements ───────────────────

test('INJ-1: runSemgrep uses execFileSync (no shell) with each exclude a literal argv element', async () => {
  let fileCall = null;
  cp.execSync = () => { throw new Error('execSync must NOT be used to run semgrep (shell injection)'); };
  cp.execFileSync = (file, args, opts) => { fileCall = { file, args, opts }; return '{"results":[]}'; };
  const SASTRunner = freshSAST();
  try {
    const evil = '$(touch /tmp/PWNED_SEMGREP)';
    const r = new SASTRunner('/no/such/dir', { excludeDirs: ['node_modules', evil] });
    await r.runSemgrep();
    assert.ok(fileCall, 'runSemgrep must call execFileSync, not execSync');
    assert.strictEqual(fileCall.file, 'semgrep');
    assert.ok(!fileCall.opts || fileCall.opts.shell !== true, 'must not spawn with a shell');
    // The metacharacter-bearing exclude is a SINGLE literal argv element, passed verbatim.
    assert.ok(fileCall.args.includes(`--exclude=${evil}`),
      `exclude must be one literal arg "--exclude=${evil}", got ${JSON.stringify(fileCall.args)}`);
    assert.ok(fileCall.args.includes('--exclude=node_modules'), 'each exclude is its own arg');
    assert.ok(fileCall.args.includes('--json') && fileCall.args.includes('.'), 'core semgrep args preserved');
  } finally {
    restore();
  }
});

test('INJ-1 + INJ-2: runBandit uses execFileSync with exactly ONE well-formed --exclude', async () => {
  let fileCall = null;
  cp.execSync = () => { throw new Error('execSync must NOT be used to run bandit (shell injection)'); };
  cp.execFileSync = (file, args, opts) => { fileCall = { file, args, opts }; return '{"results":[]}'; };
  const SASTRunner = freshSAST();
  try {
    const evil = '; touch /tmp/PWNED_BANDIT';
    const r = new SASTRunner('/no/such/dir', { excludeDirs: ['node_modules', 'venv', evil] });
    await r.runBandit();
    assert.ok(fileCall, 'runBandit must call execFileSync, not execSync');
    assert.strictEqual(fileCall.file, 'bandit');
    assert.ok(!fileCall.opts || fileCall.opts.shell !== true, 'must not spawn with a shell');
    const excludeArgs = fileCall.args.filter(a => typeof a === 'string' && a.startsWith('--exclude='));
    assert.strictEqual(excludeArgs.length, 1, `bandit takes exactly one --exclude arg, got ${JSON.stringify(excludeArgs)}`);
    assert.ok(!excludeArgs[0].includes('--exclude=--exclude='), 'no double-prefixed exclude (INJ-2)');
    // Comma-joined list, containing the raw metacharacter value verbatim (never shell-executed).
    assert.strictEqual(excludeArgs[0], `--exclude=node_modules,venv,${evil}`,
      `expected one comma-joined exclude, got ${excludeArgs[0]}`);
  } finally {
    restore();
  }
});

test('INJ-1: no MARKER file is created when an exclude carries a shell metacharacter', async () => {
  const marker = path.join(os.tmpdir(), `sast-inj-marker-${process.pid}-${Date.now()}`);
  cp.execSync = () => { throw new Error('no execSync'); };
  cp.execFileSync = (file, args) => {
    // Faithful to execFileSync semantics: args are literal, never shell-interpreted.
    // Prove it by refusing to run anything if a metachar leaked into the tool name.
    assert.strictEqual(file, 'semgrep');
    return '{"results":[]}';
  };
  const SASTRunner = freshSAST();
  try {
    const r = new SASTRunner('/no/such/dir', { excludeDirs: [`$(touch ${marker})`, `; touch ${marker}`] });
    await r.runSemgrep();
    assert.ok(!fs.existsSync(marker), 'a shell metacharacter in an exclude must NOT execute a command');
  } finally {
    restore();
    if (fs.existsSync(marker)) fs.rmSync(marker, { force: true });
  }
});

// ── FN-1: loose source with no manifest is never a silent clean pass ──────────────

test('FN-1: a loose app.py (no requirements.txt) is detected as python', () => {
  const dir = fixture({ 'app.py': 'import os\nos.system(input())\n' });
  try {
    const langs = new SASTRunner_real(dir).detectLanguages();
    assert.ok(langs.includes('python'),
      `a repo of loose .py files must detect python, got ${JSON.stringify(langs)}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('FN-1: loose .go/.ts/.js source under subdirs is detected (recursive, excludeDirs honored)', () => {
  const dir = fixture({
    'src/handler.go': 'package main\n',
    'web/app.ts': 'const x: number = 1\n',
    'node_modules/dep/index.js': 'module.exports = 1\n'   // excluded dir must NOT count as javascript
  });
  try {
    const langs = new SASTRunner_real(dir).detectLanguages();
    assert.ok(langs.includes('go'), `expected go, got ${JSON.stringify(langs)}`);
    assert.ok(langs.includes('typescript'), `expected typescript, got ${JSON.stringify(langs)}`);
    assert.ok(!langs.includes('javascript'),
      'a .js only inside an excluded dir (node_modules) must NOT be detected');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('FN-1: run() on loose app.py with NO scanner available reports scanned:false, never a clean pass', async () => {
  cp.execSync = () => { throw new Error('command not found'); };   // every tool probe fails
  const SASTRunner = freshSAST();
  const dir = fixture({ 'app.py': 'import os\nos.system(input())\n' });
  try {
    const res = await new SASTRunner(dir).run();
    assert.notStrictEqual(res.message, 'No supported languages detected in project',
      'loose analyzable source must not read as "no supported languages"');
    assert.strictEqual(res.scanned, false, 'no scanner ran → scanned:false');
    assert.strictEqual(res.success, false, 'no scanner ran → success:false');
    assert.ok(/no security scanner/i.test(res.reason || ''), 'reason names the missing scanner');
  } finally {
    restore();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('FN-1 regression: a truly empty project still detects nothing', () => {
  const dir = fixture({});
  try {
    assert.deepStrictEqual(new SASTRunner_real(dir).detectLanguages(), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── FN-3: core dangerous ESLint rules are kept ────────────────────────────────────

test('FN-3: a no-eval ESLint message is KEPT as a finding', () => {
  const r = new SASTRunner_real('/no/such/dir');
  r.parseESLintResults([{
    filePath: 'a.js',
    messages: [
      { ruleId: 'no-eval', line: 5, column: 1, message: 'eval can be harmful', severity: 2, source: 'eval(x)' }
    ]
  }]);
  assert.strictEqual(r.findings.length, 1, 'no-eval is a security-relevant rule and must be kept');
  assert.strictEqual(r.findings[0].rule, 'no-eval');
});

test('FN-3: no-unsanitized/property and security/* are kept; a plain style rule is dropped', () => {
  const r = new SASTRunner_real('/no/such/dir');
  r.parseESLintResults([{
    filePath: 'a.js',
    messages: [
      { ruleId: 'no-unsanitized/property', line: 1, column: 1, message: 'unsafe assignment', severity: 2 },
      { ruleId: 'security/detect-child-process', line: 2, column: 1, message: 'child process', severity: 2 },
      { ruleId: 'semi', line: 3, column: 1, message: 'missing semicolon', severity: 1 }
    ]
  }]);
  const rules = r.findings.map(f => f.rule);
  assert.ok(rules.includes('no-unsanitized/property'));
  assert.ok(rules.includes('security/detect-child-process'));
  assert.ok(!rules.includes('semi'), 'a non-security style rule must be dropped');
});

// ── FN-4: dedup keys on the FULL message ─────────────────────────────────────────

test('FN-4: two findings at the same file:line sharing a >50-char prefix both survive dedup', () => {
  const r = new SASTRunner_real('/no/such/dir');
  const prefix = 'Potential injection sink detected in request handler code path ';
  assert.ok(prefix.length > 50);
  r.findings = [
    { file: 'a.js', line: 10, message: prefix + 'via os.system', severity: 'HIGH' },
    { file: 'a.js', line: 10, message: prefix + 'via subprocess', severity: 'HIGH' }
  ];
  const unique = r.deduplicateFindings();
  assert.strictEqual(unique.length, 2,
    'distinct findings sharing a 50-char prefix must NOT collapse — dedup keys on full message');
});

test('FN-4 regression: two identical-message findings at the same file:line still collapse', () => {
  const r = new SASTRunner_real('/no/such/dir');
  r.findings = [
    { file: 'a.js', line: 10, message: 'SQL Injection', severity: 'MEDIUM' },
    { file: 'a.js', line: 10, message: 'SQL Injection', severity: 'HIGH' }
  ];
  const unique = r.deduplicateFindings();
  assert.strictEqual(unique.length, 1, 'genuine duplicates still collapse');
  assert.strictEqual(unique[0].severity, 'HIGH', 'and the higher severity is kept');
});

// A non-reloaded handle for the pure (no-exec) tests above.
const { SASTRunner: SASTRunner_real } = require('../src/lib/sast-runner');
