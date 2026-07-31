'use strict';

/**
 * ATTESTATION on a per-plan questions file — the ADDITIVE half of "an empty question
 * list must prove a critique ran" (plan 00182).
 *
 * SCOPE OF THIS SLICE (additive only, enforcement DEFERRED):
 *   A questions file MAY carry an `attestation` block — a machine-consumable record
 *   that a critique fleet ran, projected from the lenses' own `self_assessment`
 *   vocabulary. `writePlanQuestions` gains an OPTIONAL fifth parameter that carries
 *   and records it; `planQuestionsStatus` EXPOSES whether a file is attested so a
 *   reader (the sufficiency audit / the Doctor screen) can tell "a critique ran" from
 *   "we have no record either way".
 *
 * WHAT THIS SLICE DELIBERATELY DOES NOT DO:
 *   It does NOT change the empty→`ready`/`enough:true`/fresh contract. An unattested
 *   empty question set still reads exactly as today. Making an unattested empty list
 *   read `enough:false` (the refusal/enforcement) is a high-stakes gate-crossing
 *   change deferred to a slice that also ships an attestation-PRODUCING path — see the
 *   plan's "Decisions Taken Under Ambiguity". So the four cases in
 *   tests/streaming-precompute.test.js (:446,:464,:706,:787) MUST stay green.
 *
 * FAIL TOWARD NOT-ATTESTED: an absent, unreadable, or malformed attestation reads as
 * NOT attested — never as attested. The attestation is subagent-authored, therefore
 * untrusted; validity is judged by exact-string match against a CLOSED vocabulary
 * owned by the module, never by the payload's own claim.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const precompute = require('../src/lib/streaming-precompute.js');

const sandboxes = [];
let counter = 0;

function makeSandbox() {
  const root = path.join(os.tmpdir(), 'ctoc-attest-' + process.pid + '-' + Date.now() + '-' + counter++);
  fs.mkdirSync(path.join(root, 'plans', 'functional'), { recursive: true });
  fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
  sandboxes.push(root);
  return root;
}

function seedPlan(root, slug) {
  const p = path.join(root, 'plans', 'functional', slug + '.md');
  fs.writeFileSync(p, `---\ntitle: ${slug}\n---\n\n# ${slug}\n\nbody\n`);
  return { ref: `functional/${slug}.md`, mtime: fs.statSync(p).mtimeMs };
}

function nonEmptyQuestions() {
  return [{
    id: 'q10', prompt: 'Which datastore?', critical: true, important: false,
    options: [
      { key: 'pg', label: 'Postgres', recommended: true },
      { key: 'sqlite', label: 'SQLite' },
    ],
  }];
}

/** A structurally VALID attestation: four expected lenses, closed-vocab values. */
function validAttestation() {
  return {
    generated_by: 'gate-critic',
    generated_at: 1784271999070,
    lenses: {
      premortem: { state: 'clean-pass', coverage: 'full', findings: 0 },
      'devils-advocate': { state: 'clean-pass', coverage: 'full', findings: 0 },
      'red-team': { state: 'clean-pass', coverage: 'full', findings: 0 },
      advocate: { state: 'clean-pass', coverage: 'full', findings: 2 },
    },
  };
}

/** Read the raw stored questions file for `ref` as a parsed object. */
function readStored(root, ref) {
  const file = precompute.questionsPath(root, ref);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

afterEach(() => {
  while (sandboxes.length) {
    const root = sandboxes.pop();
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe('writePlanQuestions — the optional fifth attestation parameter CARRIES + RECORDS', () => {
  it('records a valid attestation in the store, byte-faithfully', () => {
    const root = makeSandbox();
    const { ref, mtime } = seedPlan(root, 'A1');
    const att = validAttestation();

    const res = precompute.writePlanQuestions(root, ref, nonEmptyQuestions(), mtime, att);
    assert.equal(res.ok, true);

    const stored = readStored(root, ref);
    assert.deepEqual(stored.attestation, att, 'the attestation round-trips through the store unchanged');
  });

  it('accepts an EMPTY question set WITH a valid attestation — an empty list can prove a critique ran', () => {
    const root = makeSandbox();
    const { ref, mtime } = seedPlan(root, 'A2');

    const res = precompute.writePlanQuestions(root, ref, [], mtime, validAttestation());
    assert.equal(res.ok, true, 'an attested empty list writes');

    const st = precompute.planQuestionsStatus(root, ref);
    assert.equal(st.status, 'ready', 'the empty→ready contract is UNCHANGED');
    assert.deepEqual(st.questions, [], 'and still carries zero questions');
    assert.equal(st.attested, true, 'but now it is ATTESTED');
  });
});

describe('planQuestionsStatus — EXPOSES attested/unattested so a reader can tell them apart', () => {
  it('a file written WITH a valid attestation reads attested, exposing the raw block', () => {
    const root = makeSandbox();
    const { ref, mtime } = seedPlan(root, 'B1');
    const att = validAttestation();
    precompute.writePlanQuestions(root, ref, nonEmptyQuestions(), mtime, att);

    const st = precompute.planQuestionsStatus(root, ref);
    assert.equal(st.status, 'ready');
    assert.equal(st.attested, true);
    assert.deepEqual(st.attestation, att, 'the raw block is exposed for a reader to render (after its own sanitisation)');
  });

  it('an ABSENT attestation reads NOT attested — a four-arg call is unchanged, no attestation key on disk', () => {
    const root = makeSandbox();
    const { ref, mtime } = seedPlan(root, 'B2');

    const res = precompute.writePlanQuestions(root, ref, nonEmptyQuestions(), mtime);
    assert.equal(res.ok, true);

    const stored = readStored(root, ref);
    assert.equal('attestation' in stored, false, 'a four-arg write records NO attestation key — byte-shape unchanged');

    const st = precompute.planQuestionsStatus(root, ref);
    assert.equal(st.status, 'ready');
    assert.equal(st.attested, false, 'absence of a record is NOT attested');
    assert.equal(st.attestation, null, 'and the exposed block is null, never an inferred one');
  });
});

describe('fail toward NOT-ATTESTED — a malformed/incomplete attestation never reads as attested', () => {
  // Each case persists a present-but-broken attestation and asserts NOT attested,
  // never a crash. The writer carries any object; the reader is the validation
  // authority (one encoding, matched by exact string against a closed vocabulary).
  const broken = {
    'lenses is a string': { generated_by: 'gate-critic', generated_at: 1, lenses: 'oops' },
    'lenses is an array': { generated_by: 'gate-critic', generated_at: 1, lenses: [] },
    'a lens key is missing (advocate absent)': {
      generated_by: 'gate-critic', generated_at: 1,
      lenses: {
        premortem: { state: 'clean-pass', coverage: 'full', findings: 0 },
        'devils-advocate': { state: 'clean-pass', coverage: 'full', findings: 0 },
        'red-team': { state: 'clean-pass', coverage: 'full', findings: 0 },
      },
    },
    'a state outside the closed vocabulary': (() => {
      const a = validAttestation(); a.lenses.premortem.state = 'CLEAN-PASS'; return a;
    })(),
    'a coverage outside the closed vocabulary': (() => {
      const a = validAttestation(); a.lenses['red-team'].coverage = 'complete'; return a;
    })(),
    'findings is negative': (() => {
      const a = validAttestation(); a.lenses.advocate.findings = -1; return a;
    })(),
    'findings is non-integer': (() => {
      const a = validAttestation(); a.lenses.advocate.findings = 1.5; return a;
    })(),
    'generated_at is not finite': (() => {
      const a = validAttestation(); a.generated_at = 'yesterday'; return a;
    })(),
    'generated_by is empty': (() => {
      const a = validAttestation(); a.generated_by = ''; return a;
    })(),
  };

  for (const [name, att] of Object.entries(broken)) {
    it(`${name} → not attested`, () => {
      const root = makeSandbox();
      const { ref, mtime } = seedPlan(root, 'C' + counter);
      precompute.writePlanQuestions(root, ref, [], mtime, att);

      const st = precompute.planQuestionsStatus(root, ref);
      assert.equal(st.status, 'ready', 'the empty→ready contract still holds');
      assert.equal(st.attested, false, `${name} must fail toward NOT attested`);
    });
  }

  it('an UNKNOWN extra lens key is ignored — the verdict rests on the four expected literals only', () => {
    const root = makeSandbox();
    const { ref, mtime } = seedPlan(root, 'C-extra');
    const att = validAttestation();
    att.lenses['some-new-lens'] = { state: 'failed', coverage: 'none', findings: 9 };

    precompute.writePlanQuestions(root, ref, [], mtime, att);
    const st = precompute.planQuestionsStatus(root, ref);
    assert.equal(st.attested, true, 'an added lens the module does not expect cannot break a valid attestation');
  });
});

describe('COMPATIBILITY — the additive change does not disturb existing callers', () => {
  it('a non-empty four-arg call still writes and reads ready with the questions preserved', () => {
    const root = makeSandbox();
    const { ref, mtime } = seedPlan(root, 'D1');
    const qs = nonEmptyQuestions();

    const res = precompute.writePlanQuestions(root, ref, qs, mtime);
    assert.equal(res.ok, true);

    const st = precompute.planQuestionsStatus(root, ref);
    assert.equal(st.status, 'ready');
    assert.deepEqual(st.questions, qs);
    assert.equal(st.attested, false, 'a non-empty list carries its own evidence; it is simply not attested');
  });

  it('the live repository questions files still read cleanly and unattested — no stored data broke', () => {
    // Run against the REAL store. The shipped files are non-empty and carry no
    // attestation. This slice is additive, so reading them must not regress: each
    // still resolves to a PRESENT, parseable, plan-resolvable file (status 'ready' or
    // 'stale' — several are stale because their plans were edited after generation,
    // which predates and is unrelated to this change), never 'invalid'/'not-computed'/
    // 'unknown-plan'. On the ready path, a file with no attestation reads attested:false.
    const repoRoot = path.resolve(__dirname, '..');
    const dir = path.join(repoRoot, '.ctoc', 'streaming', 'questions');
    let files;
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    } catch {
      return; // no live store on this machine — nothing to prove
    }
    for (const f of files) {
      const ref = f.replace(/\.json$/, '').replace(/__/g, '/');
      const st = precompute.planQuestionsStatus(repoRoot, ref);
      assert.ok(['ready', 'stale'].includes(st.status), `${ref} must still read as a present, usable file (got ${st.status})`);
      if (st.status === 'ready') {
        assert.equal(st.attested, false, `${ref} carries no attestation, so it reads unattested`);
      }
    }
  });
});
