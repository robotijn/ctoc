'use strict';

// Fence for plan 00160 — "agents stop inventing status they cannot verify".
//
// This proves what is MECHANISABLE and nothing more: agent DEFINITIONS carry the
// shared honest-status instruction, the shared instruction is substantive, and the
// scanner FAILS LOUD on input it cannot read (never returns the success value for a
// file it never understood). It proves NOTHING about what any agent actually SAID —
// that surface has no hook and no interception point, by the plan's own statement.

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const scan = require('../src/lib/agent-honesty-scan');
const enforcer = require('../src/lib/iron-loop-enforcer');

const REPO = path.resolve(__dirname, '..');
const FRAGMENT_REL = path.join('skills', 'agent-fragments', 'honest-status.md');
const REAL_FRAGMENT = path.join(REPO, FRAGMENT_REL);

// ── fixture helpers ───────────────────────────────────────────────────────
// A fixture corpus: a root with agents/ (N compliant defs + extras) and an
// optional skills/agent-fragments/honest-status.md. Everything the enforcer's
// check reads lives beneath the fixture root, so the real repo is never touched.

function mkRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-honesty-'));
}

const REF_LINE =
  '- [`skills/agent-fragments/honest-status.md`](../../skills/agent-fragments/honest-status.md) — assert only what you verified.';

function compliantDef(name) {
  return `---\nname: ${name}\ndescription: fixture\n---\n\n# ${name}\n\n${REF_LINE}\n`;
}

function writeAgent(root, rel, content) {
  const full = path.join(root, 'agents', rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

// Seed `count` compliant defs so the census clears its non-vacuity floor.
function seedCompliantCorpus(root, count) {
  for (let i = 0; i < count; i++) {
    writeAgent(root, path.join('cat', `fixture-${i}.md`), compliantDef(`fixture-${i}`));
  }
}

function copyRealFragment(root) {
  const dest = path.join(root, FRAGMENT_REL);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(REAL_FRAGMENT, dest);
}

function runFence(root) {
  const { findings } = enforcer.checkAllInvariants({
    root, mode: 'thorough', scopes: ['architecture'],
  });
  return findings.find((f) => f.id === 'agent-honesty-fence');
}

const roots = [];
function trackedRoot() { const r = mkRoot(); roots.push(r); return r; }
after(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

// ── the fragment ───────────────────────────────────────────────────────────
describe('the honest-status fragment', () => {
  it('1. exists and is substantive', () => {
    const res = scan.fragmentIsSubstantive(REPO);
    assert.equal(res.available, true, res.reason);
    assert.equal(res.ok, true);
    assert.deepEqual(res.missingSections, []);
  });

  it('2. carries the HONEST STATUS marker', () => {
    const body = fs.readFileSync(REAL_FRAGMENT, 'utf8');
    assert.match(body, /HONEST STATUS/);
  });

  it('3. states the absence rule and the no-invented-time rule', () => {
    const body = fs.readFileSync(REAL_FRAGMENT, 'utf8');
    assert.match(body, /no data/i);
    assert.match(body, /say you have none|say you have no data|say so/i);
    assert.match(body, /wall clock|time of day|no status line contains a time/i);
  });

  it('4. an emptied fragment (heading only) FAILS, naming the absent sections', () => {
    const root = trackedRoot();
    const dest = path.join(root, FRAGMENT_REL);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, '# HONEST STATUS\n');
    const res = scan.fragmentIsSubstantive(root);
    assert.equal(res.available, true);
    assert.equal(res.ok, false);
    assert.ok(res.missingSections.length > 0, 'a hollow fragment must name what it lacks');
  });
});

// ── isDispatchable ───────────────────────────────────────────────────────────
describe('dispatchability by frontmatter name:', () => {
  it('5. a definition with name: is dispatchable', () => {
    assert.equal(scan.isDispatchable('---\nname: foo\n---\nbody'), true);
  });

  it('6. a shared fragment without name: is not dispatchable', () => {
    const body = fs.readFileSync(path.join(REPO, 'skills', 'agent-fragments', 'no-stub-rule.md'), 'utf8');
    assert.equal(scan.isDispatchable(body), false);
  });
});

// ── scanAgentFile / censusAgents ─────────────────────────────────────────────
describe('scanning agent definitions', () => {
  it('7. a definition missing the reference appears in missing', () => {
    const root = trackedRoot();
    writeAgent(root, path.join('cat', 'nope.md'), '---\nname: nope\n---\n# nope\nno ref here');
    const res = scan.censusAgents(root, { minDispatchable: 1 });
    assert.equal(res.available, true, res.reason);
    assert.ok(res.missing.some((p) => p.endsWith('nope.md')));
  });

  it('8. a definition carrying the reference is absent from missing', () => {
    const root = trackedRoot();
    writeAgent(root, path.join('cat', 'good.md'), compliantDef('good'));
    const res = scan.censusAgents(root, { minDispatchable: 1 });
    assert.equal(res.available, true, res.reason);
    assert.equal(res.missing.length, 0);
  });

  it('9. an unreadable path is UNAVAILABLE, not clean — reason names it', () => {
    const missing = path.join(trackedRoot(), 'agents', 'ghost.md');
    const res = scan.scanAgentFile(missing);
    assert.equal(res.available, false);
    assert.ok(typeof res.reason === 'string' && res.reason.length > 0);
    assert.equal('missing' in res, false, 'an unavailable scan must not carry a passing empty list');
  });

  it('10. a file with no frontmatter is UNAVAILABLE, not clean', () => {
    const root = trackedRoot();
    const f = writeAgent(root, path.join('cat', 'bare.md'), 'just prose, no frontmatter at all\n');
    const res = scan.scanAgentFile(f);
    assert.equal(res.available, false);
  });

  it('11. one unavailable file poisons the whole census', () => {
    const root = trackedRoot();
    writeAgent(root, path.join('cat', 'good.md'), compliantDef('good'));
    writeAgent(root, path.join('cat', 'bare.md'), 'prose only, no frontmatter\n');
    const res = scan.censusAgents(root, { minDispatchable: 1 });
    assert.equal(res.available, false);
    assert.match(res.reason, /bare\.md/);
  });

  it('12. a census that finds too few FAILS on the non-vacuity floor', () => {
    const root = trackedRoot();
    seedCompliantCorpus(root, 3);
    const res = scan.censusAgents(root); // default floor of 100
    assert.equal(res.available, false);
    assert.match(res.reason, /floor|vacui|too few|expected/i);
  });

  it('13. the real repository is compliant', () => {
    const res = scan.censusAgents(REPO);
    assert.equal(res.available, true, res.reason);
    assert.deepEqual(res.missing, []);
    assert.ok(res.dispatchable >= 100, `expected >= 100 dispatchable, got ${res.dispatchable}`);
  });
});

// ── the enforcer check (the live wiring) ─────────────────────────────────────
describe('the agent-honesty-fence enforcer check', () => {
  it('14. FAILS on a missing reference and names the file', () => {
    const root = trackedRoot();
    seedCompliantCorpus(root, 100);
    writeAgent(root, path.join('cat', 'offender.md'), '---\nname: offender\n---\n# offender\nno ref');
    copyRealFragment(root);
    const f = runFence(root);
    assert.ok(f, 'the check must run');
    assert.equal(f.clean, undefined); // recorded findings drop `clean`; a finding means not-clean
    assert.equal(f.severity, 'block');
    assert.match(f.message, /offender\.md/);
  });

  it('15. FAILS when the census is unavailable — no "passed"/"skipped"', () => {
    const root = trackedRoot();
    seedCompliantCorpus(root, 100);
    writeAgent(root, path.join('cat', 'bare.md'), 'prose only, no frontmatter\n');
    copyRealFragment(root);
    const f = runFence(root);
    assert.ok(f, 'the check must run');
    assert.equal(f.severity, 'block');
    assert.doesNotMatch(f.message, /passed|skipped/i);
  });

  it('15b. FAILS when the fragment is absent', () => {
    const root = trackedRoot();
    seedCompliantCorpus(root, 100);
    const f = runFence(root); // no fragment copied
    assert.ok(f);
    assert.equal(f.severity, 'block');
    assert.match(f.message, /fragment/i);
  });

  it('15c. FAILS when the fragment is hollow, naming the sections', () => {
    const root = trackedRoot();
    seedCompliantCorpus(root, 100);
    const dest = path.join(root, FRAGMENT_REL);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, '# HONEST STATUS\n');
    const f = runFence(root);
    assert.ok(f);
    assert.equal(f.severity, 'block');
    assert.match(f.message, /hollow|missing/i);
  });

  it('15d. is CLEAN (no finding) against a root with no agents dir', () => {
    const root = trackedRoot();
    const f = runFence(root);
    assert.equal(f, undefined);
  });

  it('15e. is CLEAN (no finding) against the real repository', () => {
    const f = runFence(REPO);
    assert.equal(f, undefined, f && f.message);
  });
});

// ── the separations the plan demanded ────────────────────────────────────────
describe('separations and preserved discipline', () => {
  it('16. the four critics keep their stronger discipline', () => {
    for (const rel of [
      'agents/iron-loop/gate-critic.md',
      'agents/iron-loop/premortem-critic.md',
      'agents/iron-loop/red-team-critic.md',
      'agents/iron-loop/devils-advocate-critic.md',
    ]) {
      const body = fs.readFileSync(path.join(REPO, rel), 'utf8');
      assert.match(body, /never guess|never fabricate|unverified/i, `${rel} lost its discipline`);
    }
  });

  it('17. CLAUDE.md carries the session-model no-data-say-so lesson', () => {
    const body = fs.readFileSync(path.join(REPO, 'CLAUDE.md'), 'utf8');
    assert.match(body, /when you have no data, say you have none/i);
    assert.match(body, /scheduled against a wall clock/i);
  });

  it('18. no compliance claim was retracted by this plan', () => {
    const indep = fs.readFileSync(path.join(REPO, 'docs', 'INDEPENDENCE.md'), 'utf8');
    assert.match(indep, /four_eyes_gate3/);
    assert.match(indep, /NOT ENFORCED/);
    const chief = fs.readFileSync(path.join(REPO, 'agents', 'coordinator', 'cto-chief.md'), 'utf8');
    assert.match(chief, /NOT ENFORCED/);
  });
});
