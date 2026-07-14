/**
 * R2-C2 item 1 — declineComplianceRegime: "None" persists (R1).
 *
 * The R2-C defect: answering "None" to the compliance ride-along confirmed the
 * choice but wrote NOTHING durable, so the question re-asked every menu open.
 * writeActiveProfiles([]) is a deliberate no-op (a compliance-mode.test.js pin) —
 * "None" is a DIFFERENT verb: declineComplianceRegime writes a durable `declined:`
 * marker INSIDE the regulatory_regime block. regulatory-regime.js is extended to
 * expose that marker via loadActiveProfiles().declined (read of record).
 *
 * These tests exercise the REAL writer against a REAL settings.yaml in a tmp
 * project — no mocks of core logic. The declined marker is a fixed literal
 * (`declined: true`) — no attacker-influenceable value is interpolated (no yaml
 * injection).
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const compliance = require('../src/lib/compliance-regime');
const { loadActiveProfiles } = require('../src/lib/regulatory-regime');

const tmpDirs = [];
after(() => tmpDirs.forEach(d => fs.rmSync(d, { recursive: true, force: true })));

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r2c2-decline-'));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  return dir;
}

function writeSettings(dir, yaml) {
  fs.writeFileSync(path.join(dir, '.ctoc', 'settings.yaml'), yaml);
}
function readSettings(dir) {
  return fs.readFileSync(path.join(dir, '.ctoc', 'settings.yaml'), 'utf8');
}

// A FRESH inited project: a real regulatory_regime block with an empty
// active_profiles list plus a neighboring enforcement block that must survive.
const FRESH = [
  'regulatory_regime:',
  '  active_profiles: []',
  '  overrides: {}',
  '',
  'enforcement:',
  '  mode: strict',
  '',
].join('\n');

describe('declineComplianceRegime — durable "None" persist (R1)', () => {
  it('1. fresh inited project: writes declined marker, round-trips via the reader', () => {
    const root = tmpProject();
    writeSettings(root, FRESH);
    assert.equal(loadActiveProfiles(root).declined, false, 'not declined before');
    const res = compliance.declineComplianceRegime(root);
    assert.equal(res.ok, true, 'decline reports ok');
    assert.equal(loadActiveProfiles(root).declined, true, 'declined marker readable via reader of record');
    // The neighboring enforcement block is untouched (the hook-critical invariant).
    assert.match(readSettings(root), /enforcement:\n {2}mode: strict/);
  });

  it('2. legacy project WITHOUT a regulatory_regime block: creates it, not fail-open', () => {
    const root = tmpProject();
    writeSettings(root, 'timezone: "UTC"\n\nenforcement:\n  mode: strict\n');
    const res = compliance.declineComplianceRegime(root);
    assert.equal(res.ok, true, 'decline persists even when the block was absent');
    assert.equal(loadActiveProfiles(root).declined, true, 'block created with the declined marker');
    // Pre-existing content survives.
    assert.match(readSettings(root), /timezone: "UTC"/);
    assert.match(readSettings(root), /enforcement:\n {2}mode: strict/);
  });

  it('3. idempotent: declining an already-declined project stays declined, ok', () => {
    const root = tmpProject();
    writeSettings(root, FRESH);
    compliance.declineComplianceRegime(root);
    const res = compliance.declineComplianceRegime(root);
    assert.equal(res.ok, true);
    assert.equal(loadActiveProfiles(root).declined, true);
    // No duplicate declined line accumulated.
    const count = (readSettings(root).match(/^\s*declined:/gm) || []).length;
    assert.equal(count, 1, 'exactly one declined line');
  });

  it('4. declined THEN a real activation still works (profiles win, marker harmless)', () => {
    const root = tmpProject();
    writeSettings(root, FRESH);
    compliance.declineComplianceRegime(root);
    const res = compliance.writeActiveProfiles(root, ['gdpr']);
    assert.equal(res.ok, true, 'activation after decline succeeds');
    assert.equal(compliance.shouldRunGdpr(root), true, 'gdpr active after a prior decline');
    // The active_profiles line changed; the declined marker is still parseable.
    assert.equal(loadActiveProfiles(root).declined, true, 'declined marker survives an active_profiles write');
  });

  it('5. missing settings.yaml → {ok:false}, no fabricated file', () => {
    const root = tmpProject(); // .ctoc exists, but no settings.yaml
    const res = compliance.declineComplianceRegime(root);
    assert.equal(res.ok, false);
    assert.ok(!fs.existsSync(path.join(root, '.ctoc', 'settings.yaml')), 'no fabricated settings.yaml');
  });

  it('6. non-string / bogus root → {ok:false}, no throw', () => {
    assert.doesNotThrow(() => compliance.declineComplianceRegime(undefined));
    assert.equal(compliance.declineComplianceRegime(undefined).ok, false);
    const bogus = path.join(os.tmpdir(), 'r2c2-decline-no-such-root-xyz');
    assert.equal(compliance.declineComplianceRegime(bogus).ok, false);
  });

  it('7. the declined marker is a FIXED literal (no yaml injection)', () => {
    const root = tmpProject();
    writeSettings(root, FRESH);
    compliance.declineComplianceRegime(root);
    // The only declined line written is exactly `declined: true` (indented) —
    // no interpolated/attacker-influenceable value.
    assert.match(readSettings(root), /^\s+declined: true\s*$/m);
  });
});
