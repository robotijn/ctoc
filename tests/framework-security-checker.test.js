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
  SEVERITY,
  FRAMEWORK_PUBLIC_PREFIXES
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

describe('FrameworkSecurityChecker: FW-w2-fix matcher-precision guards', () => {
  /** Run the checker against a one-file fixture and return its findings. */
  async function findingsFor({ nodeDeps, pyReq, envName, envBody, srcName, srcBody }) {
    const dir = mkTmp('ctoc-fwsec-fix-');
    try {
      if (nodeDeps) writePkg(dir, nodeDeps);
      if (pyReq) fs.writeFileSync(path.join(dir, 'requirements.txt'), pyReq, 'utf8');
      if (envName) fs.writeFileSync(path.join(dir, envName), envBody, 'utf8');
      if (srcName) {
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', srcName), srcBody, 'utf8');
      }
      const res = await new FrameworkSecurityChecker(dir).run();
      return res;
    } finally { rm(dir); }
  }

  // F1 — bare TOKEN dropped; a public web3/search address token must NOT flag.
  it('F1: NEXT_PUBLIC_TOKEN_ADDRESS does NOT flag (bare TOKEN dropped)', async () => {
    const res = await findingsFor({ nodeDeps: { next: '15.0.0' }, envName: '.env', envBody: 'NEXT_PUBLIC_TOKEN_ADDRESS=0xabc\n' });
    assert.equal(res.findings.length, 0, `bare TOKEN must not flag; got ${JSON.stringify(res.findings)}`);
  });

  // F1 — the AUTH-token compound still flags.
  it('F1: NEXT_PUBLIC_ACCESS_TOKEN flags HIGH (auth-token compound kept)', async () => {
    const res = await findingsFor({ nodeDeps: { next: '15.0.0' }, envName: '.env', envBody: 'NEXT_PUBLIC_ACCESS_TOKEN=abc\n' });
    const highs = res.findings.filter(f => f.severity === SEVERITY.HIGH);
    assert.equal(highs.length, 1, `ACCESS_TOKEN is a secret; got ${JSON.stringify(res.findings)}`);
    assert.equal(highs[0].varName, 'NEXT_PUBLIC_ACCESS_TOKEN');
  });

  // F2 — a var NAMED inside a .env comment line must NOT flag.
  it('F2: a #-comment line in .env.example naming NEXT_PUBLIC_API_SECRET does NOT flag', async () => {
    const res = await findingsFor({ nodeDeps: { next: '15.0.0' }, envName: '.env.example', envBody: '# never expose NEXT_PUBLIC_API_SECRET here\nNEXT_PUBLIC_SAFE=ok\n' });
    assert.equal(res.findings.length, 0, `commented var name must not flag; got ${JSON.stringify(res.findings)}`);
  });

  // F2 — a //-comment line in source must NOT flag.
  it('F2: a //-comment source line naming NEXT_PUBLIC_API_SECRET does NOT flag', async () => {
    const res = await findingsFor({ nodeDeps: { next: '15.0.0' }, srcName: 'a.js', srcBody: '// do not ship process.env.NEXT_PUBLIC_API_SECRET\nexport const x = 1;\n' });
    assert.equal(res.findings.length, 0, `commented source line must not flag; got ${JSON.stringify(res.findings)}`);
  });

  // F2 — a /* block */ comment in source must NOT flag.
  it('F2: a /* block */ comment naming NEXT_PUBLIC_API_SECRET does NOT flag', async () => {
    const res = await findingsFor({ nodeDeps: { next: '15.0.0' }, srcName: 'b.js', srcBody: '/* legacy: NEXT_PUBLIC_API_SECRET was here */\nexport const y = 2;\n' });
    assert.equal(res.findings.length, 0, `block-commented var name must not flag; got ${JSON.stringify(res.findings)}`);
  });

  // F3.1 — PUBLIC_ is not Next's prefix; a Next-only repo must NOT flag PUBLIC_AUTH_TOKEN.
  it('F3.1: PUBLIC_AUTH_TOKEN in a Next-only repo does NOT flag (prefix scoped to detected frameworks)', async () => {
    const res = await findingsFor({ nodeDeps: { next: '15.0.0' }, envName: '.env', envBody: 'PUBLIC_AUTH_TOKEN=abc\n' });
    assert.equal(res.findings.length, 0, `PUBLIC_ is not Next's prefix; got ${JSON.stringify(res.findings)}`);
  });

  // F3.1 — in a SvelteKit repo PUBLIC_ IS the prefix, so it MUST flag.
  it('F3.1: PUBLIC_AUTH_TOKEN in a SvelteKit repo flags HIGH (PUBLIC_ is Svelte/Astro prefix)', async () => {
    const res = await findingsFor({ nodeDeps: { svelte: '4.2.0' }, envName: '.env', envBody: 'PUBLIC_AUTH_TOKEN=abc\n' });
    const highs = res.findings.filter(f => f.severity === SEVERITY.HIGH);
    assert.equal(highs.length, 1, `PUBLIC_ is a real Svelte prefix; got ${JSON.stringify(res.findings)}`);
    assert.equal(highs[0].varName, 'PUBLIC_AUTH_TOKEN');
  });

  // F3.2 — SECRET mid-name (a feature flag) must NOT flag.
  it('F3.2: NEXT_PUBLIC_SECRET_SANTA_ENABLED does NOT flag (SECRET is mid-name, not terminal)', async () => {
    const res = await findingsFor({ nodeDeps: { next: '15.0.0' }, envName: '.env', envBody: 'NEXT_PUBLIC_SECRET_SANTA_ENABLED=true\n' });
    assert.equal(res.findings.length, 0, `SECRET_SANTA is a feature flag; got ${JSON.stringify(res.findings)}`);
  });

  // Control — the true positive still fires.
  it('control: NEXT_PUBLIC_API_SECRET still flags HIGH', async () => {
    const res = await findingsFor({ nodeDeps: { next: '15.0.0' }, envName: '.env', envBody: 'NEXT_PUBLIC_API_SECRET=leak\n' });
    const highs = res.findings.filter(f => f.severity === SEVERITY.HIGH);
    assert.equal(highs.length, 1, `terminal SECRET is a real leak; got ${JSON.stringify(res.findings)}`);
    assert.equal(highs[0].varName, 'NEXT_PUBLIC_API_SECRET');
  });

  // F5 — case-insensitive indicator after a correctly-uppercased prefix (underscore-delimited tail).
  it('F5: VITE_api_secret (uppercase prefix, lowercase underscore-delimited tail) flags HIGH', async () => {
    const res = await findingsFor({ nodeDeps: { vue: '3.4.0' }, envName: '.env', envBody: 'VITE_api_secret=zzz\n' });
    const highs = res.findings.filter(f => f.severity === SEVERITY.HIGH);
    assert.equal(highs.length, 1, `case-insensitive tail after an uppercase prefix must flag; got ${JSON.stringify(res.findings)}`);
    assert.equal(highs[0].varName, 'VITE_api_secret');
  });

  // F6 — a pure backend (FastAPI) has no client bundle → the check is not relevant.
  it('F6: a FastAPI-only repo reports scanned:false (env-exposure removed from backend yaml)', async () => {
    const res = await findingsFor({ pyReq: 'fastapi==0.115.0\n', envName: '.env', envBody: 'NEXT_PUBLIC_API_SECRET=leak\n' });
    assert.equal(res.scanned, false, 'a pure backend has no client bundle → honest skip, not a scan');
    assert.equal(res.findings.length, 0);
  });
});

describe('FrameworkSecurityChecker: adversarial-review fixes (F1 honesty, F2 FP, F3 dead-config)', () => {
  /** Run the checker against a one-file fixture and return its result. */
  async function resultFor({ nodeDeps, envName, envBody }) {
    const dir = mkTmp('ctoc-fwsec-adv-');
    try {
      if (nodeDeps) writePkg(dir, nodeDeps);
      if (envName) fs.writeFileSync(path.join(dir, envName), envBody, 'utf8');
      return await new FrameworkSecurityChecker(dir).run();
    } finally { rm(dir); }
  }

  // ── F1 — an env-exposure framework with NO prefix mapping must NOT report a clean pass ──
  it('F1: an angular-only repo with a planted NEXT_PUBLIC secret reports scanned:false, not a clean pass', async () => {
    const res = await resultFor({
      nodeDeps: { '@angular/core': '18.0.0' },
      envName: '.env',
      envBody: 'NEXT_PUBLIC_API_SECRET=leak\n'
    });
    assert.equal(res.scanned, false, 'angular exposes env via non-prefix-named paths → NAME-scan cannot run → honest skip, NOT a clean pass');
    assert.equal(res.findings.length, 0);
    assert.ok(typeof res.reason === 'string' && res.reason.length > 0, 'the skip carries an honest reason');
    assert.match(res.reason, /angular/i, 'the reason names the offending framework(s)');
  });

  it('F1: a nextjs repo still scans normally (regression guard for the F1 gate)', async () => {
    const res = await resultFor({
      nodeDeps: { next: '15.0.0' },
      envName: '.env',
      envBody: 'NEXT_PUBLIC_API_SECRET=leak\n'
    });
    assert.equal(res.scanned, true, 'a prefix-mapped framework must still take the scan path');
    const highs = res.findings.filter(f => f.severity === SEVERITY.HIGH);
    assert.equal(highs.length, 1, JSON.stringify(res.findings));
    assert.equal(highs[0].varName, 'NEXT_PUBLIC_API_SECRET');
  });

  // ── F2 — password/private POLICY-style config flags are public config, not secrets ──
  it('F2: NEXT_PUBLIC_PASSWORD_MIN_LENGTH does NOT flag (password-policy UI config)', async () => {
    const res = await resultFor({ nodeDeps: { next: '15.0.0' }, envName: '.env', envBody: 'NEXT_PUBLIC_PASSWORD_MIN_LENGTH=8\n' });
    assert.equal(res.findings.length, 0, `password-policy config is client-shipped; got ${JSON.stringify(res.findings)}`);
  });

  it('F2: NEXT_PUBLIC_PASSWORD_POLICY_URL does NOT flag (password-policy UI config)', async () => {
    const res = await resultFor({ nodeDeps: { next: '15.0.0' }, envName: '.env', envBody: 'NEXT_PUBLIC_PASSWORD_POLICY_URL=/policy\n' });
    assert.equal(res.findings.length, 0, `got ${JSON.stringify(res.findings)}`);
  });

  it('F2: PUBLIC_PRIVATE_BETA does NOT flag (private-beta feature flag)', async () => {
    const res = await resultFor({ nodeDeps: { svelte: '4.2.0' }, envName: '.env', envBody: 'PUBLIC_PRIVATE_BETA=true\n' });
    assert.equal(res.findings.length, 0, `private-beta flag is a legitimate client flag; got ${JSON.stringify(res.findings)}`);
  });

  it('F2: PUBLIC_PRIVATE_LABEL_MODE does NOT flag (white-label feature flag)', async () => {
    const res = await resultFor({ nodeDeps: { svelte: '4.2.0' }, envName: '.env', envBody: 'PUBLIC_PRIVATE_LABEL_MODE=on\n' });
    assert.equal(res.findings.length, 0, `got ${JSON.stringify(res.findings)}`);
  });

  it('F2: NEXT_PUBLIC_DB_PASSWORD STILL flags HIGH (terminal PASSWORD is a real leak)', async () => {
    const res = await resultFor({ nodeDeps: { next: '15.0.0' }, envName: '.env', envBody: 'NEXT_PUBLIC_DB_PASSWORD=hunter2\n' });
    const highs = res.findings.filter(f => f.severity === SEVERITY.HIGH);
    assert.equal(highs.length, 1, `a raw shipped DB password is a real leak; got ${JSON.stringify(res.findings)}`);
    assert.equal(highs[0].varName, 'NEXT_PUBLIC_DB_PASSWORD');
  });

  it('F2: a raw NEXT_PUBLIC_PASSWORD STILL flags HIGH', async () => {
    const res = await resultFor({ nodeDeps: { next: '15.0.0' }, envName: '.env', envBody: 'NEXT_PUBLIC_PASSWORD=hunter2\n' });
    const highs = res.findings.filter(f => f.severity === SEVERITY.HIGH);
    assert.equal(highs.length, 1, `got ${JSON.stringify(res.findings)}`);
    assert.equal(highs[0].varName, 'NEXT_PUBLIC_PASSWORD');
  });

  it('F2: NEXT_PUBLIC_PRIVATE_KEY STILL flags HIGH (explicit compound kept)', async () => {
    const res = await resultFor({ nodeDeps: { next: '15.0.0' }, envName: '.env', envBody: 'NEXT_PUBLIC_PRIVATE_KEY=abc\n' });
    const highs = res.findings.filter(f => f.severity === SEVERITY.HIGH);
    assert.equal(highs.length, 1, `PRIVATE_KEY is an explicit secret compound; got ${JSON.stringify(res.findings)}`);
    assert.equal(highs[0].varName, 'NEXT_PUBLIC_PRIVATE_KEY');
  });

  // ── F3 — gatsby/expo prefix sets are unreachable dead config (no yaml keys them) ──
  it('F3: FRAMEWORK_PUBLIC_PREFIXES no longer contains the unreachable gatsby/expo entries', () => {
    assert.ok(!Object.prototype.hasOwnProperty.call(FRAMEWORK_PUBLIC_PREFIXES, 'gatsby'), 'gatsby is dead config (no gatsby.yaml) — must be removed');
    assert.ok(!Object.prototype.hasOwnProperty.call(FRAMEWORK_PUBLIC_PREFIXES, 'expo'), 'expo is dead config (no expo.yaml) — must be removed');
    // The reachable, yaml-backed prefixes stay.
    assert.deepEqual(FRAMEWORK_PUBLIC_PREFIXES.nextjs, ['NEXT_PUBLIC_']);
    assert.deepEqual(FRAMEWORK_PUBLIC_PREFIXES.react, ['VITE_', 'REACT_APP_']);
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
