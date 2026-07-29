'use strict';

/**
 * tests/test-gate-ledger-wiring.test.js — plan 00137, the WIRING proof.
 *
 * The plan's title is "the verification verdict is enforced offline on every build".
 * That was FALSE while the committed ledger was read only by the human-run
 * src/scripts/verify-claims.js and NEVER by `npm test`. This file proves the title true:
 * the gated entry point src/scripts/test-gate.js now reads the committed ledger OFF DISK,
 * with NO network, and FAILS the build when a corpus claim is REFUTED, STALE, or drifted.
 *
 * OFFLINE BY CONSTRUCTION. Every case runs against a corpus + ledger built in a temp
 * directory, or the real repository; nothing here reaches the network. The last two cases
 * prove the network boundary directly — the gate loads no network module, and the gate
 * runs with the network primitives patched to throw.
 *
 * Time is INJECTED (`nowMs`); fixtures live under os.tmpdir() and are removed in `finally`.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const { evaluateLedgerGate } = require('../src/scripts/test-gate.js');
const { collectCorpusClaims } = require('../src/lib/corpus-claims');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-07-30T00:00:00.000Z');
const LEDGER_REL = path.join('.ctoc', 'verification', 'claims-ledger.json');
const REPO_ROOT = path.join(__dirname, '..');

/** A guide that declares one registry-version claim the extractor will read. */
const GUIDE_REL = path.join('skills', 'frameworks', 'data', 'thing.md');
const GUIDE_CLAIM = {
  id: 'thing-version',
  kind: 'registry-version',
  source: 'https://pypi.org/pypi/thing/json',
  select: 'info.version',
  expect: '1.2.3',
  file: 'skills/frameworks/data/thing.md',
};

function guideBody(expect) {
  return [
    '# Thing',
    '',
    '<!-- ctoc:claims',
    '- id: thing-version',
    '  kind: registry-version',
    '  source: https://pypi.org/pypi/thing/json',
    '  select: info.version',
    `  expect: ${expect}`,
    '  retrieved: 2026-07-30',
    '-->',
    '',
    'Body.',
    '',
  ].join('\n');
}

function hashOf(c) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify([c.source, c.select || null, c.expect || null]))
    .digest('hex');
}

function entry(c, over = {}) {
  const iso = new Date(NOW).toISOString();
  return {
    kind: c.kind,
    state: 'VERIFIED',
    reason: null,
    expectedHash: hashOf(c),
    lastVerifiedAt: iso,
    lastAttemptAt: iso,
    lastAttemptState: 'VERIFIED',
    ...over,
  };
}

function keyOf(c) {
  return `${c.file}#${c.id}`;
}

/** A temp project root with a declared guide and (optionally) a committed ledger. */
function withProject({ guide = guideBody('1.2.3'), ledger }, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-gate-wiring-'));
  try {
    if (guide !== null) {
      const g = path.join(root, GUIDE_REL);
      fs.mkdirSync(path.dirname(g), { recursive: true });
      fs.writeFileSync(g, guide);
    }
    if (ledger !== undefined) {
      const l = path.join(root, LEDGER_REL);
      fs.mkdirSync(path.dirname(l), { recursive: true });
      fs.writeFileSync(l, typeof ledger === 'string' ? ledger : JSON.stringify(ledger, null, 2));
    }
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function ledgerOf(claims) {
  return {
    schemaVersion: 1,
    generatedAt: new Date(NOW).toISOString(),
    generator: 'src/scripts/verify-claims.js',
    horizonDays: 7,
    claims,
  };
}

describe('test-gate ledger wiring — the verdict enforced offline on npm test (plan 00137)', () => {
  it('collectCorpusClaims reads declared claims off disk with no network', () => {
    withProject({}, (root) => {
      const { claims } = collectCorpusClaims(root);
      assert.equal(claims.length, 1);
      assert.equal(claims[0].id, 'thing-version');
      assert.equal(claims[0].file, 'skills/frameworks/data/thing.md');
    });
  });

  it('collectCorpusClaims on a project with no skills/ returns zero claims', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-gate-empty-'));
    try {
      const { claims } = collectCorpusClaims(root);
      assert.equal(claims.length, 0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('collectCorpusClaims reports an oversized guide as unreadable, never crashing', () => {
    withProject({ guide: '#' + 'x'.repeat((1 << 20) + 64) }, (root) => {
      const { claims, unreadable } = collectCorpusClaims(root);
      assert.equal(claims.length, 0);
      assert.ok(unreadable.some((u) => u.reason === 'oversized'));
    });
  });

  it('RED-proof: a REFUTED committed ledger FAILS the gate', () => {
    const led = ledgerOf({ [keyOf(GUIDE_CLAIM)]: entry(GUIDE_CLAIM, { state: 'REFUTED', lastAttemptState: 'REFUTED' }) });
    withProject({ ledger: led }, (root) => {
      const r = evaluateLedgerGate(root, { nowMs: NOW });
      assert.equal(r.ok, false);
      assert.ok(r.reasons.some((s) => /refuted/.test(s)), `reasons name the refutation: ${JSON.stringify(r.reasons)}`);
    });
  });

  it('a STALE committed ledger FAILS the gate (the dead-scheduler case)', () => {
    const old = new Date(NOW - 8 * DAY).toISOString();
    const led = ledgerOf({ [keyOf(GUIDE_CLAIM)]: entry(GUIDE_CLAIM, { lastVerifiedAt: old, lastAttemptAt: old }) });
    withProject({ ledger: led }, (root) => {
      const r = evaluateLedgerGate(root, { nowMs: NOW });
      assert.equal(r.ok, false);
      assert.ok(r.reasons.some((s) => /stale/.test(s)));
    });
  });

  it('an ABSENT ledger with declared claims FAILS the gate', () => {
    withProject({ ledger: undefined }, (root) => {
      const r = evaluateLedgerGate(root, { nowMs: NOW });
      assert.equal(r.ok, false);
      assert.ok(r.reasons.some((s) => /ledger-absent/.test(s)));
    });
  });

  it('a corpus claim with no ledger entry FAILS the gate (drift-unverified)', () => {
    withProject({ ledger: ledgerOf({}) }, (root) => {
      const r = evaluateLedgerGate(root, { nowMs: NOW });
      assert.equal(r.ok, false);
      assert.ok(r.reasons.some((s) => /drift-unverified/.test(s)));
    });
  });

  it('a clean, fresh, complete committed ledger PASSES the gate', () => {
    const led = ledgerOf({ [keyOf(GUIDE_CLAIM)]: entry(GUIDE_CLAIM) });
    withProject({ ledger: led }, (root) => {
      const r = evaluateLedgerGate(root, { nowMs: NOW });
      assert.equal(r.ok, true, `expected pass, got: ${JSON.stringify(r.reasons)}`);
      assert.equal(r.reasons.length, 0);
    });
  });

  it('a project with NO declared claims: the gate is not applicable and PASSES', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-gate-na-'));
    try {
      const r = evaluateLedgerGate(root, { nowMs: NOW });
      assert.equal(r.ok, true);
      assert.equal(r.applicable, false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('THE LIVE REPO: the committed ledger is clean against the real corpus', () => {
    const r = evaluateLedgerGate(REPO_ROOT);
    assert.equal(r.ok, true, `the real committed ledger must be clean: ${JSON.stringify(r.reasons)}`);
    assert.ok(r.applicable, 'the real repo declares corpus claims');
  });

  it('network boundary: requiring test-gate.js does NOT pull claim-fetcher into the module graph', () => {
    const script =
      "require('./src/scripts/test-gate.js');" +
      "const loaded = Object.keys(require.cache).some(k => k.includes('claim-fetcher'));" +
      "if (loaded) { console.error('LOADED'); process.exit(3); }" +
      'process.exit(0);';
    const out = execFileSync(process.execPath, ['-e', script], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
    });
    assert.equal(out, '', 'the gate loads no network module');
  });

  // ── End-to-end: the REAL gate, really spawned, folds the ledger verdict into its EXIT
  //    CODE. A unit test on the pure function is not enough — this is the human-facing
  //    proof that `npm test` itself fails on a refuted committed ledger and passes on a
  //    clean one, with a passing suite so the ledger is the ONLY differentiator.
  function buildGateFixture(ledgerState) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-gate-e2e-ledger-'));
    fs.mkdirSync(path.join(dir, 'src', 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src', 'lib'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    fs.mkdirSync(path.join(dir, GUIDE_REL.replace(/thing\.md$/, '').replace(/\/$/, '')), { recursive: true });

    fs.copyFileSync(
      path.join(REPO_ROOT, 'src', 'scripts', 'test-gate.js'),
      path.join(dir, 'src', 'scripts', 'test-gate.js'),
    );
    for (const mod of ['safe-fs', 'request-exit', 'claim-ledger', 'corpus-claims', 'claim-extractor']) {
      const real = path.join(REPO_ROOT, 'src', 'lib', `${mod}.js`);
      fs.writeFileSync(path.join(dir, 'src', 'lib', `${mod}.js`), `module.exports = require(${JSON.stringify(real)});\n`);
    }
    fs.writeFileSync(path.join(dir, 'src', 'thing.js'), 'module.exports = () => 42;\n');
    fs.writeFileSync(path.join(dir, 'tests', 'fixture.test.js'), [
      "'use strict';",
      "const test = require('node:test');",
      "const assert = require('node:assert');",
      "const thing = require('../src/thing.js');",
      "test('passes', () => { assert.strictEqual(thing(), 42); });",
    ].join('\n') + '\n');
    fs.writeFileSync(path.join(dir, '.ctoc', 'coverage-baseline.json'), JSON.stringify({ minPct: 1 }));
    // A guide that declares one claim, and a ledger entry matching it in `ledgerState`.
    fs.writeFileSync(path.join(dir, GUIDE_REL), guideBody('1.2.3'));
    const led = ledgerOf({ [keyOf(GUIDE_CLAIM)]: entry(GUIDE_CLAIM, ledgerState) });
    fs.mkdirSync(path.join(dir, path.dirname(LEDGER_REL)), { recursive: true });
    fs.writeFileSync(path.join(dir, LEDGER_REL), JSON.stringify(led, null, 2));
    return dir;
  }

  function spawnGate(dir) {
    const childEnv = { ...process.env };
    delete childEnv.NODE_TEST_CONTEXT;
    const res = spawnSync(process.execPath, [path.join(dir, 'src', 'scripts', 'test-gate.js')], {
      cwd: dir, encoding: 'utf8', shell: false, maxBuffer: 64 * 1024 * 1024, env: childEnv,
    });
    return { status: res.status, out: (res.stdout || '') + (res.stderr || '') };
  }

  it('E2E: the real spawned gate EXITS NON-ZERO on a refuted committed ledger (passing suite)', () => {
    // lastVerifiedAt fresh (now) so staleness is not the cause — REFUTED is.
    const iso = new Date().toISOString();
    const dir = buildGateFixture({ state: 'REFUTED', lastAttemptState: 'REFUTED', lastVerifiedAt: iso, lastAttemptAt: iso });
    try {
      const { status, out } = spawnGate(dir);
      assert.ok(!/being called recursively/.test(out), `the fixture suite did not run:\n${out.slice(-400)}`);
      assert.notStrictEqual(status, 0, `a refuted ledger must fail npm test. Output:\n${out.slice(-600)}`);
      assert.match(out, /refuted/, `the failure reason must name the refutation. Output:\n${out.slice(-600)}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('E2E: the real spawned gate EXITS ZERO on a clean, fresh committed ledger (passing suite)', () => {
    const iso = new Date().toISOString();
    const dir = buildGateFixture({ lastVerifiedAt: iso, lastAttemptAt: iso });
    try {
      const { status, out } = spawnGate(dir);
      assert.ok(!/being called recursively/.test(out), `the fixture suite did not run:\n${out.slice(-400)}`);
      assert.strictEqual(status, 0, `a clean ledger + passing suite must pass npm test. Output:\n${out.slice(-600)}`);
      assert.match(out, /offline ledger gate: PASS/, `the gate reports the offline ledger verdict. Output:\n${out.slice(-600)}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('network boundary: the ledger gate runs with the network primitives patched to throw', () => {
    const http = require('http');
    const https = require('https');
    const origFetch = global.fetch;
    const origHttp = http.request;
    const origHttps = https.request;
    const boom = () => { throw new Error('network access is forbidden in the gated ledger check'); };
    global.fetch = boom;
    http.request = boom;
    https.request = boom;
    try {
      const led = ledgerOf({ [keyOf(GUIDE_CLAIM)]: entry(GUIDE_CLAIM) });
      withProject({ ledger: led }, (root) => {
        const r = evaluateLedgerGate(root, { nowMs: NOW });
        assert.equal(r.ok, true, 'the gate completes with the network disabled');
      });
    } finally {
      global.fetch = origFetch;
      http.request = origHttp;
      https.request = origHttps;
    }
  });
});
