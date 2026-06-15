/**
 * Governance Modules — Group A
 *
 * Contract-based tests for four governance/compliance lib modules that
 * previously had ZERO test coverage:
 *
 *   - src/lib/four-eyes.js        (segregation-of-duties / dual control)
 *   - src/lib/privilege-posture.js (attorney-client privilege disclosure)
 *   - src/lib/spoliation-safe.js  (FRCP 37(e) evidence preservation)
 *   - src/lib/legal-hold.js       (litigation hold / freeze)
 *
 * Each module is exercised for (a) happy-path of every exported function,
 * (b) the security/governance PROPERTY the module exists to enforce, and
 * (c) error paths / malformed input.
 *
 * Assertions follow the modules' own DOCUMENTED contracts (the JSDoc/header
 * comments). Where behavior would contradict the documented intent, the
 * assertion is left to fail — that is a real bug to report, not a weakness
 * to paper over.
 *
 * Hermetic: every test that touches the filesystem uses a per-test temp dir
 * created with mkdtempSync + realpathSync (macOS /var -> /private/var) and
 * removed in afterEach. Cross-platform path.join throughout.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');

const fourEyes = require(path.join(REPO, 'src/lib/four-eyes.js'));
const privilege = require(path.join(REPO, 'src/lib/privilege-posture.js'));
const spoliation = require(path.join(REPO, 'src/lib/spoliation-safe.js'));
const legalHold = require(path.join(REPO, 'src/lib/legal-hold.js'));

// --- shared temp-dir scaffolding -------------------------------------------

function makeTmp() {
  // realpathSync collapses macOS /var -> /private/var so path.relative works
  // consistently against values the modules compute internally.
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-gova-')));
}

function rmTmp(dir) {
  if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function writeFile(root, rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

// A plan with frontmatter; markers are optional.
function planText({ author, independent, posture } = {}) {
  const lines = ['---', 'title: Test Plan'];
  if (author !== undefined) lines.push(`approved_by_author_review: ${author}`);
  if (independent !== undefined) lines.push(`approved_by_independent: ${independent}`);
  if (posture !== undefined) lines.push(`privilege_posture: ${posture}`);
  lines.push('---', '', '# Body', '');
  return lines.join('\n');
}

// roles.yaml builder. roles: [{name, identity, can_author, can_review, can_approve}]
function rolesYaml(roles) {
  const lines = ['roles:'];
  for (const r of roles) {
    lines.push(`  - name: ${r.name}`);
    if (r.identity !== undefined) lines.push(`    identity: ${r.identity}`);
    if (r.can_author !== undefined) lines.push(`    can_author: ${r.can_author}`);
    if (r.can_review !== undefined) lines.push(`    can_review: ${r.can_review}`);
    if (r.can_approve !== undefined) lines.push(`    can_approve: ${r.can_approve}`);
  }
  lines.push('');
  return lines.join('\n');
}

// ===========================================================================
// four-eyes.js
// ===========================================================================
describe('four-eyes.js — segregation of duties (two distinct principals)', () => {
  let root;
  beforeEach(() => { root = makeTmp(); });
  afterEach(() => { rmTmp(root); });

  // --- _parseRolesYaml (exposed for tests) ---
  it('_parseRolesYaml parses the minimal roles schema with coerced scalars', () => {
    const parsed = fourEyes._parseRolesYaml(rolesYaml([
      { name: 'rev', identity: 'alice', can_review: true, can_approve: false },
    ]));
    assert.ok(Array.isArray(parsed.roles));
    assert.equal(parsed.roles.length, 1);
    assert.equal(parsed.roles[0].name, 'rev');
    assert.equal(parsed.roles[0].identity, 'alice');
    assert.equal(parsed.roles[0].can_review, true, 'true must coerce to boolean');
    assert.equal(parsed.roles[0].can_approve, false, 'false must coerce to boolean');
  });

  it('_parseRolesYaml ignores comments and blank lines', () => {
    const yaml = [
      '# a comment',
      'roles:',
      '  - name: r1   # inline comment',
      '    identity: bob',
      '',
      '  - name: r2',
      '    identity: carol',
    ].join('\n');
    const parsed = fourEyes._parseRolesYaml(yaml);
    assert.equal(parsed.roles.length, 2);
    assert.equal(parsed.roles[0].identity, 'bob');
    assert.equal(parsed.roles[1].name, 'r2');
  });

  // --- loadRoles ---
  it('loadRoles returns parsed roles when .ctoc/roles.yaml exists', () => {
    writeFile(root, path.join('.ctoc', 'roles.yaml'), rolesYaml([
      { name: 'rev', identity: 'alice', can_review: true },
      { name: 'app', identity: 'bob', can_approve: true },
    ]));
    const roles = fourEyes.loadRoles(root);
    assert.equal(roles.length, 2);
    assert.deepEqual(roles.map(r => r.name).sort(), ['app', 'rev']);
  });

  it('loadRoles returns [] when .ctoc/roles.yaml is absent (documented: empty list)', () => {
    const roles = fourEyes.loadRoles(root);
    assert.deepEqual(roles, []);
  });

  // --- extractApprovalMarkers ---
  it('extractApprovalMarkers reads both markers from frontmatter', () => {
    const m = fourEyes.extractApprovalMarkers(planText({ author: 'rev', independent: 'app' }));
    assert.equal(m.author, 'rev');
    assert.equal(m.independent, 'app');
  });

  it('extractApprovalMarkers returns nulls when no frontmatter present', () => {
    const m = fourEyes.extractApprovalMarkers('# just a body, no frontmatter\n');
    assert.equal(m.author, null);
    assert.equal(m.independent, null);
  });

  it('extractApprovalMarkers strips surrounding quotes', () => {
    const m = fourEyes.extractApprovalMarkers(planText({ author: '"rev"', independent: "'app'" }));
    assert.equal(m.author, 'rev');
    assert.equal(m.independent, 'app');
  });

  // --- verifyFourEyes happy path ---
  it('verifyFourEyes passes when two DISTINCT identities sign with proper authority', () => {
    writeFile(root, path.join('.ctoc', 'roles.yaml'), rolesYaml([
      { name: 'rev', identity: 'alice', can_review: true, can_approve: false },
      { name: 'app', identity: 'bob', can_review: false, can_approve: true },
    ]));
    const res = fourEyes.verifyFourEyes(
      { text: planText({ author: 'rev', independent: 'app' }), projectRoot: root }
    );
    assert.equal(res.passed, true, res.reason);
    assert.equal(res.author, 'rev');
    assert.equal(res.independent, 'app');
  });

  it('verifyFourEyes accepts the { path } form and reads the file', () => {
    writeFile(root, path.join('.ctoc', 'roles.yaml'), rolesYaml([
      { name: 'rev', identity: 'alice', can_review: true },
      { name: 'app', identity: 'bob', can_approve: true },
    ]));
    const p = writeFile(root, path.join('plans', 'review', 'p.md'),
      planText({ author: 'rev', independent: 'app' }));
    const res = fourEyes.verifyFourEyes({ path: p }, root);
    assert.equal(res.passed, true, res.reason);
  });

  // --- THE LOAD-BEARING PROPERTY: self-approval is rejected ---
  it('PROPERTY: rejects when both markers resolve to the SAME identity (no self-approval)', () => {
    writeFile(root, path.join('.ctoc', 'roles.yaml'), rolesYaml([
      // two distinct role NAMES, but the SAME underlying identity (alice)
      { name: 'rev', identity: 'alice', can_review: true },
      { name: 'app', identity: 'alice', can_approve: true },
    ]));
    const res = fourEyes.verifyFourEyes(
      { text: planText({ author: 'rev', independent: 'app' }), projectRoot: root }
    );
    assert.equal(res.passed, false);
    assert.match(res.reason, /same identity|distinct principals|Four-eyes violation/i);
  });

  it('PROPERTY: a single principal cannot sign both roles via identical role name', () => {
    writeFile(root, path.join('.ctoc', 'roles.yaml'), rolesYaml([
      { name: 'solo', identity: 'alice', can_review: true, can_approve: true },
    ]));
    const res = fourEyes.verifyFourEyes(
      { text: planText({ author: 'solo', independent: 'solo' }), projectRoot: root }
    );
    assert.equal(res.passed, false, 'one principal signing both sides must fail');
    assert.match(res.reason, /same identity|distinct principals|Four-eyes violation/i);
  });

  // --- failure conditions in documented priority order ---
  it('fails when both markers are missing', () => {
    const res = fourEyes.verifyFourEyes({ text: planText({}), projectRoot: root });
    assert.equal(res.passed, false);
    assert.match(res.reason, /Missing both approval markers/i);
  });

  it('fails when only author marker is missing', () => {
    const res = fourEyes.verifyFourEyes(
      { text: planText({ independent: 'app' }), projectRoot: root });
    assert.equal(res.passed, false);
    assert.match(res.reason, /approved_by_author_review/);
  });

  it('fails when only independent marker is missing', () => {
    const res = fourEyes.verifyFourEyes(
      { text: planText({ author: 'rev' }), projectRoot: root });
    assert.equal(res.passed, false);
    assert.match(res.reason, /approved_by_independent/);
  });

  it('fails when no roles are declared (cannot enforce four-eyes with no principals)', () => {
    // markers present, but roles.yaml absent
    const res = fourEyes.verifyFourEyes(
      { text: planText({ author: 'rev', independent: 'app' }), projectRoot: root });
    assert.equal(res.passed, false);
    assert.match(res.reason, /No roles declared/i);
  });

  it('fails when the author-review role is not declared', () => {
    writeFile(root, path.join('.ctoc', 'roles.yaml'), rolesYaml([
      { name: 'app', identity: 'bob', can_approve: true },
    ]));
    const res = fourEyes.verifyFourEyes(
      { text: planText({ author: 'ghost', independent: 'app' }), projectRoot: root });
    assert.equal(res.passed, false);
    assert.match(res.reason, /Author-review role "ghost" not declared/);
  });

  it('fails when the independent-approval role is not declared', () => {
    writeFile(root, path.join('.ctoc', 'roles.yaml'), rolesYaml([
      { name: 'rev', identity: 'alice', can_review: true },
    ]));
    const res = fourEyes.verifyFourEyes(
      { text: planText({ author: 'rev', independent: 'ghost' }), projectRoot: root });
    assert.equal(res.passed, false);
    assert.match(res.reason, /Independent-approval role "ghost" not declared/);
  });

  it('PROPERTY: author-side signer must have can_review authority', () => {
    writeFile(root, path.join('.ctoc', 'roles.yaml'), rolesYaml([
      { name: 'rev', identity: 'alice', can_review: false },
      { name: 'app', identity: 'bob', can_approve: true },
    ]));
    const res = fourEyes.verifyFourEyes(
      { text: planText({ author: 'rev', independent: 'app' }), projectRoot: root });
    assert.equal(res.passed, false);
    assert.match(res.reason, /lacks can_review authority/);
  });

  it('PROPERTY: independent signer must have can_approve authority', () => {
    writeFile(root, path.join('.ctoc', 'roles.yaml'), rolesYaml([
      { name: 'rev', identity: 'alice', can_review: true },
      { name: 'app', identity: 'bob', can_approve: false },
    ]));
    const res = fourEyes.verifyFourEyes(
      { text: planText({ author: 'rev', independent: 'app' }), projectRoot: root });
    assert.equal(res.passed, false);
    assert.match(res.reason, /lacks can_approve authority/);
  });

  // --- malformed / invalid input: never throws (contract: "Never throws") ---
  it('does not throw and returns a failure for a nonexistent plan path', () => {
    const missing = path.join(root, 'nope.md');
    let res;
    assert.doesNotThrow(() => { res = fourEyes.verifyFourEyes({ path: missing }, root); });
    assert.equal(res.passed, false);
    assert.match(res.reason, /Plan not found/);
  });

  it('does not throw and returns a failure for an invalid plan argument', () => {
    let res;
    assert.doesNotThrow(() => { res = fourEyes.verifyFourEyes(42, root); });
    assert.equal(res.passed, false);
    assert.match(res.reason, /invalid plan argument/i);
  });

  it('does not throw and returns a failure for an object lacking text and path', () => {
    let res;
    assert.doesNotThrow(() => { res = fourEyes.verifyFourEyes({ foo: 'bar' }, root); });
    assert.equal(res.passed, false);
    assert.match(res.reason, /expected \{ path \} or \{ text, projectRoot \}/);
  });
});

// ===========================================================================
// privilege-posture.js
// ===========================================================================
describe('privilege-posture.js — attorney-client privilege disclosure', () => {
  let root;
  beforeEach(() => { root = makeTmp(); });
  afterEach(() => { rmTmp(root); });

  // --- constants ---
  it('exports the documented valid postures, frozen', () => {
    assert.deepEqual(privilege.VALID_POSTURES, ['none', 'counsel-directed', 'client-only']);
    assert.ok(Object.isFrozen(privilege.VALID_POSTURES), 'VALID_POSTURES must be frozen');
    assert.equal(privilege.DEFAULT_POSTURE, 'none',
      'documented safer default is no privilege claim (Heppner)');
  });

  // --- getPosture happy path ---
  it('getPosture reads a declared valid posture from frontmatter', () => {
    const p = writeFile(root, 'plan.md', planText({ posture: 'counsel-directed' }));
    assert.equal(privilege.getPosture(p), 'counsel-directed');
  });

  it('getPosture strips quotes around the declared value', () => {
    const p = writeFile(root, 'plan.md', planText({ posture: '"client-only"' }));
    assert.equal(privilege.getPosture(p), 'client-only');
  });

  it('getPosture defaults to none when frontmatter omits the field', () => {
    const p = writeFile(root, 'plan.md', planText({}));
    assert.equal(privilege.getPosture(p), 'none');
  });

  it('getPosture defaults to none when the file has no frontmatter at all', () => {
    const p = writeFile(root, 'plan.md', '# no frontmatter here\n');
    assert.equal(privilege.getPosture(p), 'none');
  });

  // --- getPosture error paths (documented to THROW, not silently coerce) ---
  it('PROPERTY: getPosture THROWS on an invalid declared posture (no silent coercion)', () => {
    const p = writeFile(root, 'plan.md', planText({ posture: 'super-secret' }));
    assert.throws(() => privilege.getPosture(p), /Invalid privilege_posture "super-secret"/);
  });

  it('getPosture throws on empty / non-string path', () => {
    assert.throws(() => privilege.getPosture(''), /non-empty string/);
    assert.throws(() => privilege.getPosture(null), /non-empty string/);
  });

  it('getPosture throws when the plan file does not exist', () => {
    assert.throws(() => privilege.getPosture(path.join(root, 'missing.md')), /plan not found/);
  });

  // --- validatePosture (filesystem-free) ---
  it('validatePosture accepts each valid posture', () => {
    for (const v of privilege.VALID_POSTURES) {
      const r = privilege.validatePosture(v);
      assert.equal(r.valid, true, `${v} should be valid`);
      assert.equal(r.value, v);
      assert.equal(r.reason, null);
    }
  });

  it('validatePosture treats null/undefined as valid default', () => {
    const r = privilege.validatePosture(null);
    assert.equal(r.valid, true);
    assert.equal(r.value, 'none');
    assert.match(r.reason, /defaulting to "none"/);
  });

  it('validatePosture trims and strips quotes', () => {
    const r = privilege.validatePosture('  "counsel-directed"  ');
    assert.equal(r.valid, true);
    assert.equal(r.value, 'counsel-directed');
  });

  it('validatePosture returns structured failure (does not throw) for an invalid value', () => {
    let r;
    assert.doesNotThrow(() => { r = privilege.validatePosture('bogus'); });
    assert.equal(r.valid, false);
    assert.equal(r.value, null);
    assert.match(r.reason, /Invalid posture "bogus"/);
  });

  it('validatePosture rejects a non-string value without throwing', () => {
    let r;
    assert.doesNotThrow(() => { r = privilege.validatePosture(123); });
    assert.equal(r.valid, false);
    assert.match(r.reason, /must be a string/);
  });

  // --- warningBanner: the disclosure property ---
  it('PROPERTY: counsel-directed banner asserts privilege protection', () => {
    const b = privilege.warningBanner('counsel-directed');
    assert.match(b, /PRIVILEGED AND CONFIDENTIAL/);
    assert.match(b, /DIRECTION OF COUNSEL/);
    assert.match(b, /attorney-client privilege/);
    assert.ok(b.endsWith('\n'), 'banner must include trailing newline');
  });

  it('PROPERTY: client-only banner explicitly DISCLAIMS privilege (avoids over-claiming)', () => {
    const b = privilege.warningBanner('client-only');
    assert.match(b, /NOT PRIVILEGED/);
    assert.match(b, /does NOT fall within the attorney-client privilege/);
    assert.match(b, /Heppner/);
    assert.ok(b.endsWith('\n'));
  });

  it('PROPERTY: none banner claims no privilege', () => {
    const b = privilege.warningBanner('none');
    assert.match(b, /NO PRIVILEGE CLAIMED/);
    assert.ok(b.endsWith('\n'));
  });

  it('warningBanner defaults a null posture to the none banner', () => {
    const b = privilege.warningBanner(null);
    assert.match(b, /NO PRIVILEGE CLAIMED/);
  });

  it('warningBanner throws on an invalid posture (cannot emit a banner for it)', () => {
    assert.throws(() => privilege.warningBanner('mystery'), /Invalid posture "mystery"/);
  });

  it('PROPERTY: the three banners are mutually distinct', () => {
    const set = new Set(privilege.VALID_POSTURES.map(p => privilege.warningBanner(p)));
    assert.equal(set.size, 3, 'each posture must produce a distinct disclosure');
  });
});

// ===========================================================================
// spoliation-safe.js
// ===========================================================================
describe('spoliation-safe.js — FRCP 37(e) evidence preservation', () => {
  let root;
  beforeEach(() => { root = makeTmp(); });
  afterEach(() => { rmTmp(root); });

  const PRES = path.join('.ctoc', 'preservation');

  // --- snapshot a single file ---
  it('snapshot of a file returns a content-addressed preservation record', () => {
    writeFile(root, path.join('data', 'evidence.txt'), 'sensitive bytes');
    const rec = spoliation.snapshot(root, path.join('data', 'evidence.txt'), 'pre-delete');
    assert.ok(/^[0-9a-f]{64}$/.test(rec.preservation_id), 'id is a sha256 hex digest');
    assert.ok(rec.snapshotted_at, 'records a timestamp');
    assert.ok(fs.existsSync(path.join(root, rec.manifest_path)), 'manifest exists at returned path');
  });

  it('PROPERTY: snapshot copies the file bytes into preservation BEFORE any deletion', () => {
    const src = writeFile(root, 'evidence.txt', 'the original content');
    const rec = spoliation.snapshot(root, 'evidence.txt', 'reason');
    // Simulate the authorized destructive op the snapshot is meant to precede.
    fs.rmSync(src);
    assert.equal(fs.existsSync(src), false, 'original deleted');
    // The preservation copy must still hold the bytes (tamper-evident copy).
    const preserved = path.join(root, PRES, rec.preservation_id, 'evidence.txt');
    assert.equal(fs.existsSync(preserved), true, 'preserved copy survives deletion');
    assert.equal(fs.readFileSync(preserved, 'utf8'), 'the original content');
  });

  it('PROPERTY: preservation_id is content-addressed (identical content -> identical id)', () => {
    writeFile(root, 'a.txt', 'same bytes');
    writeFile(root, 'b.txt', 'same bytes');
    // Same basename + same content => same per-file hash listing => same dir hash.
    writeFile(root, path.join('x', 'same.txt'), 'same bytes');
    writeFile(root, path.join('y', 'same.txt'), 'same bytes');
    const r1 = spoliation.snapshot(root, path.join('x', 'same.txt'), 'r');
    const r2 = spoliation.snapshot(root, path.join('y', 'same.txt'), 'r');
    assert.equal(r1.preservation_id, r2.preservation_id,
      'identical basename+content must produce identical content address');
  });

  it('snapshot writes a manifest with the documented fields', () => {
    writeFile(root, 'f.txt', 'abc');
    const rec = spoliation.snapshot(root, 'f.txt', 'because');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, rec.manifest_path), 'utf8'));
    assert.equal(manifest.preservation_id, rec.preservation_id);
    assert.equal(manifest.source_path, 'f.txt');
    assert.equal(manifest.is_directory, false);
    assert.equal(manifest.reason, 'because');
    assert.equal(manifest.file_count, 1);
    assert.ok(Array.isArray(manifest.file_hashes));
    assert.ok(/^[0-9a-f]{64}$/.test(manifest.file_hashes[0].sha256));
  });

  it('snapshot defaults the reason to "unspecified" when omitted', () => {
    writeFile(root, 'f.txt', 'abc');
    const rec = spoliation.snapshot(root, 'f.txt');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, rec.manifest_path), 'utf8'));
    assert.equal(manifest.reason, 'unspecified');
  });

  // --- snapshot a directory ---
  it('snapshot of a directory preserves every file with relative structure', () => {
    writeFile(root, path.join('logs', 'a.txt'), 'aaa');
    writeFile(root, path.join('logs', 'sub', 'b.txt'), 'bbb');
    const rec = spoliation.snapshot(root, 'logs', 'preserve dir');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, rec.manifest_path), 'utf8'));
    assert.equal(manifest.is_directory, true);
    assert.equal(manifest.file_count, 2);
    const destDir = path.join(root, PRES, rec.preservation_id);
    assert.equal(fs.readFileSync(path.join(destDir, 'a.txt'), 'utf8'), 'aaa');
    assert.equal(fs.readFileSync(path.join(destDir, 'sub', 'b.txt'), 'utf8'), 'bbb');
  });

  // --- restore ---
  it('PROPERTY: restore reverses an erroneous deletion (round-trips a file)', () => {
    const src = writeFile(root, 'doc.txt', 'recoverable');
    const rec = spoliation.snapshot(root, 'doc.txt', 'r');
    fs.rmSync(src);
    const out = spoliation.restore(root, rec.preservation_id);
    assert.equal(out.preservation_id, rec.preservation_id);
    assert.equal(fs.existsSync(src), true, 'file restored to its original path');
    assert.equal(fs.readFileSync(src, 'utf8'), 'recoverable');
  });

  it('restore round-trips a directory snapshot', () => {
    writeFile(root, path.join('d', 'a.txt'), 'A');
    writeFile(root, path.join('d', 'sub', 'b.txt'), 'B');
    const rec = spoliation.snapshot(root, 'd', 'r');
    fs.rmSync(path.join(root, 'd'), { recursive: true });
    spoliation.restore(root, rec.preservation_id);
    assert.equal(fs.readFileSync(path.join(root, 'd', 'a.txt'), 'utf8'), 'A');
    assert.equal(fs.readFileSync(path.join(root, 'd', 'sub', 'b.txt'), 'utf8'), 'B');
  });

  it('restore can target an explicit destination path', () => {
    writeFile(root, 'orig.txt', 'payload');
    const rec = spoliation.snapshot(root, 'orig.txt', 'r');
    const out = spoliation.restore(root, rec.preservation_id, 'restored-copy.txt');
    assert.equal(fs.readFileSync(path.join(root, 'restored-copy.txt'), 'utf8'), 'payload');
    assert.equal(out.restored_to, 'restored-copy.txt');
  });

  // --- listPreservations ---
  it('listPreservations returns [] before any snapshot', () => {
    assert.deepEqual(spoliation.listPreservations(root), []);
  });

  it('PROPERTY: the preservation log is append-only and records each snapshot', () => {
    writeFile(root, 'one.txt', '1');
    writeFile(root, 'two.txt', '2');
    spoliation.snapshot(root, 'one.txt', 'first');
    spoliation.snapshot(root, 'two.txt', 'second');
    const list = spoliation.listPreservations(root);
    assert.equal(list.length, 2, 'both snapshots recorded');
    assert.deepEqual(list.map(e => e.source_path).sort(), ['one.txt', 'two.txt']);
    assert.deepEqual(list.map(e => e.reason).sort(), ['first', 'second']);
  });

  // --- error paths ---
  it('snapshot throws when the source path does not exist', () => {
    assert.throws(() => spoliation.snapshot(root, 'ghost.txt', 'r'),
      /source path does not exist/);
  });

  it('restore throws on an unknown preservation id', () => {
    assert.throws(() => spoliation.restore(root, 'deadbeef'.repeat(8)),
      /preservation id not found/);
  });

  it('restore throws when the manifest is missing for an existing id dir', () => {
    const id = 'a'.repeat(64);
    fs.mkdirSync(path.join(root, PRES, id), { recursive: true });
    assert.throws(() => spoliation.restore(root, id), /manifest missing/);
  });
});

// ===========================================================================
// legal-hold.js
// ===========================================================================
describe('legal-hold.js — litigation hold freeze', () => {
  let root;
  beforeEach(() => { root = makeTmp(); });
  afterEach(() => { rmTmp(root); });

  // --- institute happy path ---
  it('institute creates an active hold file and returns its metadata', () => {
    const res = legalHold.institute(root, {
      id: 'matter-001', matter: 'Acme v. Roe', instituted_by: 'counsel',
      custodians: ['alice', 'bob'], scope: 'all plans',
    });
    assert.equal(res.id, 'matter-001');
    assert.ok(res.instituted_at);
    const holdFile = path.join(root, '.ctoc', 'legal-hold', 'matter-001.yaml');
    assert.ok(fs.existsSync(holdFile));
    const content = fs.readFileSync(holdFile, 'utf8');
    assert.match(content, /^status: active$/m);
    assert.match(content, /custodians:/);
    assert.match(content, /- alice/);
  });

  // --- activeHolds / isHeld ---
  it('isHeld is false and activeHolds is [] before any hold', () => {
    assert.equal(legalHold.isHeld(root), false);
    assert.deepEqual(legalHold.activeHolds(root), []);
  });

  it('PROPERTY: instituting a hold puts the project into the held state', () => {
    legalHold.institute(root, { id: 'h1', matter: 'Doe', custodians: ['x'] });
    assert.equal(legalHold.isHeld(root), true);
    const holds = legalHold.activeHolds(root);
    assert.equal(holds.length, 1);
    assert.equal(holds[0].id, 'h1');
    assert.equal(holds[0].matter, 'Doe');
    assert.deepEqual(holds[0].custodians, ['x']);
  });

  it('activeHolds skips template/_README files prefixed with underscore', () => {
    legalHold.institute(root, { id: 'real', matter: 'M', custodians: [] });
    writeFile(root, path.join('.ctoc', 'legal-hold', '_README.yaml'), 'status: active\n');
    const holds = legalHold.activeHolds(root);
    assert.equal(holds.length, 1, 'underscore-prefixed files must be ignored');
    assert.equal(holds[0].id, 'real');
  });

  // --- THE FREEZE PROPERTY: assertNotHeld ---
  it('PROPERTY: assertNotHeld is a no-op when nothing is held', () => {
    assert.doesNotThrow(() => legalHold.assertNotHeld(root, 'rm plan', ['plans/x.md']));
  });

  it('PROPERTY: assertNotHeld BLOCKS destructive ops while a hold is active', () => {
    legalHold.institute(root, { id: 'h1', matter: 'Acme', custodians: ['c'] });
    assert.throws(
      () => legalHold.assertNotHeld(root, 'rm -rf plans', ['plans/a.md', 'plans/b.md']),
      (err) => {
        assert.match(err.message, /LEGAL HOLD ACTIVE/);
        assert.match(err.message, /destructive operation blocked/);
        assert.match(err.message, /rm -rf plans/, 'names the attempted operation');
        assert.match(err.message, /plans\/a\.md/, 'names affected paths');
        assert.match(err.message, /FRCP Rule 37\(e\)/, 'cites the governing rule');
        return true;
      }
    );
  });

  // --- release ---
  it('release flips status to released and records reason, NEVER deleting the file', () => {
    legalHold.institute(root, { id: 'h1', matter: 'M', custodians: [] });
    const res = legalHold.release(root, 'h1', 'counsel confirmed preservation complete');
    assert.equal(res.id, 'h1');
    assert.ok(res.released_at);
    const holdFile = path.join(root, '.ctoc', 'legal-hold', 'h1.yaml');
    assert.ok(fs.existsSync(holdFile), 'hold file is retained, never deleted');
    const content = fs.readFileSync(holdFile, 'utf8');
    assert.match(content, /^status: released$/m);
    assert.doesNotMatch(content, /^status: active$/m);
    assert.match(content, /release_reason:/);
  });

  it('PROPERTY: releasing the only active hold lifts the freeze', () => {
    legalHold.institute(root, { id: 'h1', matter: 'M', custodians: [] });
    assert.equal(legalHold.isHeld(root), true);
    legalHold.release(root, 'h1', 'done');
    assert.equal(legalHold.isHeld(root), false, 'freeze must lift once released');
    assert.doesNotThrow(() => legalHold.assertNotHeld(root, 'rm plan', []));
  });

  it('PROPERTY: with two holds, releasing one keeps the freeze while the other is active', () => {
    legalHold.institute(root, { id: 'h1', matter: 'M1', custodians: [] });
    legalHold.institute(root, { id: 'h2', matter: 'M2', custodians: [] });
    assert.equal(legalHold.activeHolds(root).length, 2);
    legalHold.release(root, 'h1', 'partial');
    assert.equal(legalHold.isHeld(root), true, 'still held while h2 is active');
    assert.equal(legalHold.activeHolds(root).length, 1);
    assert.throws(() => legalHold.assertNotHeld(root, 'rm', []), /LEGAL HOLD ACTIVE/);
  });

  // --- error paths ---
  it('institute throws when id is missing', () => {
    assert.throws(() => legalHold.institute(root, { matter: 'M' }), /id required/);
  });

  it('institute throws when a hold with the same id already exists', () => {
    legalHold.institute(root, { id: 'dup', matter: 'M', custodians: [] });
    assert.throws(() => legalHold.institute(root, { id: 'dup', matter: 'M2' }),
      /already exists/);
  });

  it('release throws on an unknown hold id', () => {
    assert.throws(() => legalHold.release(root, 'nope', 'r'), /no such hold/);
  });

  it('institute YAML-escapes a matter that contains a colon (keeps file parseable)', () => {
    legalHold.institute(root, { id: 'h1', matter: 'Acme: Inc v. Roe', custodians: [] });
    const holds = legalHold.activeHolds(root);
    assert.equal(holds.length, 1, 'a colon in matter must not corrupt status detection');
    assert.equal(holds[0].id, 'h1');
  });
});
