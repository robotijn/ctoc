'use strict';

/**
 * FRAMEWORK-SECURITY CHECKER — client-exposed-secret detection (FW-w2).
 *
 * Proves the frameworks "concerns → checks" pattern: FW-w1 records each
 * framework's `security.concerns`; this turns the `env-exposure` concern into a
 * real gate check. A frontend framework's public env-var prefix ships the value to
 * the BROWSER, so a public-prefixed var whose NAME signals a secret is a deliberate
 * secret leak — a HIGH-severity class the value-entropy secrets scanner does NOT
 * flag.
 *
 * Zero mocks. Real temp-dir fixtures on disk drive the real FrameworkSecurityChecker
 * and the real quality-agent.runSecurityScan. Every assertion is behavioural: plant
 * a var name, assert the finding (or its ABSENCE for the false-positive guards).
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  FrameworkSecurityChecker,
  SEVERITY
} = require('../src/lib/framework-security-checker');
const qualityAgent = require('../src/lib/quality-agent');

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}
/** Write a package.json with the given dependencies. */
function writePkg(dir, deps) {
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'fixture', version: '1.0.0', dependencies: deps }, null, 2),
    'utf8'
  );
}

describe('FrameworkSecurityChecker: exported surface', () => {
  it('exports FrameworkSecurityChecker and SEVERITY', () => {
    assert.equal(typeof FrameworkSecurityChecker, 'function');
    assert.equal(SEVERITY.HIGH, 'HIGH');
  });
});

describe('FrameworkSecurityChecker: a public-prefixed secret is a HIGH finding', () => {
  let dir;
  before(() => {
    dir = mkTmp('ctoc-fwsec-next-');
    // A Next.js project → `next` dep carries the env-exposure concern.
    writePkg(dir, { next: '15.0.0' });
    fs.writeFileSync(path.join(dir, '.env'), 'NEXT_PUBLIC_API_SECRET=xxxxx\nDATABASE_URL=postgres://u:p@h/db\n', 'utf8');
  });
  after(() => rm(dir));

  it('flags NEXT_PUBLIC_API_SECRET as exactly one HIGH finding with the var NAME', async () => {
    const res = await new FrameworkSecurityChecker(dir).run();
    assert.equal(res.scanned, true, 'a Next.js project carries env-exposure → scanned:true');
    const highs = res.findings.filter(f => f.severity === SEVERITY.HIGH);
    assert.equal(highs.length, 1, `expected exactly 1 HIGH, got ${JSON.stringify(res.findings)}`);
    assert.equal(highs[0].varName, 'NEXT_PUBLIC_API_SECRET');
    assert.ok(highs[0].file.endsWith('.env'), 'finding names the file');
    assert.equal(typeof highs[0].line, 'number');
    assert.ok(highs[0].line >= 1, 'finding names a 1-based line');
  });

  it('never puts a secret VALUE into the finding', async () => {
    const res = await new FrameworkSecurityChecker(dir).run();
    const blob = JSON.stringify(res.findings);
    assert.ok(!blob.includes('xxxxx'), 'the value must never be captured or logged');
  });
});

describe('FrameworkSecurityChecker: a Vite project flags VITE_*_SECRET_KEY', () => {
  let dir;
  before(() => {
    dir = mkTmp('ctoc-fwsec-vite-');
    // Vite + Vue → `vue` dep carries the env-exposure concern; VITE_ is its public prefix.
    writePkg(dir, { vue: '3.4.0' });
    fs.writeFileSync(path.join(dir, '.env'), 'VITE_STRIPE_SECRET_KEY=sk_live_zzz\n', 'utf8');
  });
  after(() => rm(dir));

  it('flags VITE_STRIPE_SECRET_KEY as HIGH', async () => {
    const res = await new FrameworkSecurityChecker(dir).run();
    assert.equal(res.scanned, true);
    const highs = res.findings.filter(f => f.severity === SEVERITY.HIGH);
    assert.equal(highs.length, 1, JSON.stringify(res.findings));
    assert.equal(highs[0].varName, 'VITE_STRIPE_SECRET_KEY');
  });
});

describe('FrameworkSecurityChecker: LOW-FALSE-POSITIVE guards', () => {
  it('does NOT flag NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (a bare KEY is legitimate)', async () => {
    const dir = mkTmp('ctoc-fwsec-pub-');
    try {
      writePkg(dir, { next: '15.0.0' });
      fs.writeFileSync(path.join(dir, '.env'), 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_ok\n', 'utf8');
      const res = await new FrameworkSecurityChecker(dir).run();
      assert.equal(res.scanned, true, 'still a relevant framework, so the scan ran');
      assert.equal(res.findings.length, 0, `publishable keys are public — must not flag; got ${JSON.stringify(res.findings)}`);
    } finally { rm(dir); }
  });

  it('does NOT flag DATABASE_URL (no public prefix — server-only, generic scanner’s job)', async () => {
    const dir = mkTmp('ctoc-fwsec-db-');
    try {
      writePkg(dir, { next: '15.0.0' });
      fs.writeFileSync(path.join(dir, '.env'), 'DATABASE_URL=postgres://u:p@h/db\nSECRET_TOKEN=abc\n', 'utf8');
      const res = await new FrameworkSecurityChecker(dir).run();
      assert.equal(res.findings.length, 0, `no public prefix → not this check’s job; got ${JSON.stringify(res.findings)}`);
    } finally { rm(dir); }
  });

  it('does NOT flag a name that merely CONTAINS a secret substring mid-word (SECRETARY)', async () => {
    const dir = mkTmp('ctoc-fwsec-word-');
    try {
      writePkg(dir, { next: '15.0.0' });
      fs.writeFileSync(path.join(dir, '.env'), 'NEXT_PUBLIC_SECRETARY_EMAIL=a@b.co\n', 'utf8');
      const res = await new FrameworkSecurityChecker(dir).run();
      assert.equal(res.findings.length, 0, `SECRETARY is not SECRET; got ${JSON.stringify(res.findings)}`);
    } finally { rm(dir); }
  });

  it('a backend-only project (no env-exposure framework) reports scanned:false with an honest reason', async () => {
    const dir = mkTmp('ctoc-fwsec-backend-');
    try {
      // express carries no env-exposure concern → the check is not relevant here.
      writePkg(dir, { express: '4.19.0' });
      fs.writeFileSync(path.join(dir, '.env'), 'NEXT_PUBLIC_API_SECRET=xxx\n', 'utf8');
      const res = await new FrameworkSecurityChecker(dir).run();
      assert.equal(res.scanned, false, 'no env-exposure framework → not a clean pass, an honest skip');
      assert.equal(res.findings.length, 0);
      assert.ok(typeof res.reason === 'string' && res.reason.length > 0, 'the skip carries an honest reason');
    } finally { rm(dir); }
  });
});

describe('FrameworkSecurityChecker: source files are scanned too, fail-soft', () => {
  let dir;
  before(() => {
    dir = mkTmp('ctoc-fwsec-src-');
    writePkg(dir, { next: '15.0.0' });
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(
      path.join(dir, 'src', 'client.js'),
      'export const t = process.env.NEXT_PUBLIC_AUTH_TOKEN;\n',
      'utf8'
    );
  });
  after(() => rm(dir));

  it('flags a public-prefixed secret referenced in a source file', async () => {
    const res = await new FrameworkSecurityChecker(dir).run();
    const highs = res.findings.filter(f => f.varName === 'NEXT_PUBLIC_AUTH_TOKEN');
    assert.equal(highs.length, 1, JSON.stringify(res.findings));
    assert.ok(highs[0].file.endsWith('client.js'));
  });
});

describe('quality-agent integration: a NEXT_PUBLIC_*_SECRET bumps the HIGH tally', () => {
  let dir;
  before(() => {
    dir = mkTmp('ctoc-fwsec-qa-');
    writePkg(dir, { next: '15.0.0' });
    fs.writeFileSync(path.join(dir, '.env'), 'NEXT_PUBLIC_API_SECRET=leakme\n', 'utf8');
  });
  after(() => rm(dir));

  it('runSecurityScan surfaces the client-exposed secret as HIGH and FAILS the gate', async () => {
    const res = await qualityAgent.runSecurityScan(null, { projectRoot: dir, allFiles: true });
    assert.ok(res.high >= 1, `client-exposed secret must bump the HIGH tally; got high=${res.high}`);
    assert.equal(res.passed, false, 'a HIGH finding must fail the security gate');
    assert.match(res.details, /framework-security\[HIGH\]/, 'the finding must be reported in details');
  });
});
