'use strict';

/**
 * ATTESTATION ROUND-TRIP — the critique fleet RECORDS that it ran (AUDIT-ONLY).
 *
 * Plan 00183, built as its owner-chosen AUDIT-ONLY direction (Option B): the
 * critique fleet writes a machine-consumable attestation — which expected lenses
 * ran and in what state — that RIDES THROUGH the sweeper's promotion of a pending
 * questions file into the live store, via the optional fifth `attestation`
 * parameter that sibling 00182 added to `streaming-precompute.writePlanQuestions`.
 * The record then EXISTS for the audit reader (`planQuestionsStatus.attested` /
 * `.attestation`, which the sufficiency auditor and the Doctor screen consume).
 *
 * This slice does NOT change any crossing behaviour and does NOT restore
 * auto-crossing of an empty question list: an attestation is a RECORD, never a
 * crossing-enabler, and the empty→ready/enough contract 00182 kept is untouched.
 *
 * The load-bearing honesty property, tested from both sides: an attestation that
 * a critique WROTE round-trips and reads `attested:true`; an UN-RUN critique
 * (no attestation) round-trips its questions and reads `attested:false`; and the
 * carrier NEVER fabricates a clean attestation for a file that arrived without one.
 *
 * Driven over REAL temp dirs through the REAL sweeper and the REAL precompute
 * reader — no mocks of core logic.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const precompute = require('../src/lib/streaming-precompute.js');
const sweeper = require('../src/lib/streaming-questions-sweeper.js');

const STAGES = ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
const roots = [];

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-attest-'));
  roots.push(root);
  for (const stage of STAGES) fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  fs.mkdirSync(path.join(root, '.ctoc', 'streaming', 'questions', 'pending'), { recursive: true });
  const ref = 'review/00099-fixture.md';
  const planPath = path.join(root, 'plans', 'review', '00099-fixture.md');
  fs.writeFileSync(planPath, `---\ntitle: fixture\n---\n\n# fixture\n\n## Scope\nA fixture plan.\n`);
  // The fleet stamps the plan's own mtime (the brief's planMtimeMs). A payload
  // stamped OLDER than the plan is (correctly) refused as superseded, so fixtures
  // must copy the real mtime — otherwise the supersession guard masks this contract.
  const mtime = fs.statSync(planPath).mtimeMs;
  return { root, ref, mtime };
}

function pendingFileFor(root, ref) {
  const base = ref.replace(/[\\/]/g, '__').replace(/[^A-Za-z0-9._-]/g, '_');
  return path.join(root, '.ctoc', 'streaming', 'questions', 'pending', `${base}.json`);
}

/** A question set that satisfies validatePlanQuestions. */
function validQuestions() {
  return [
    {
      id: 'store',
      prompt: 'Which store backs the fixture?',
      critical: true,
      important: false,
      options: [
        { key: '1', label: 'Postgres', recommended: true, pros: 'Row level security', cons: 'More ops' },
        { key: '2', label: 'SQLite', pros: 'Zero-config', cons: 'Single writer' },
      ],
    },
  ];
}

/** A well-formed attestation per streaming-precompute.validateAttestation. */
function validAttestation() {
  return {
    generated_by: 'gate-critic',
    generated_at: 1784500000000,
    lenses: {
      premortem: { state: 'clean-pass', coverage: 'full', findings: 0 },
      'devils-advocate': { state: 'clean-pass', coverage: 'full', findings: 1 },
      'red-team': { state: 'clean-pass', coverage: 'full', findings: 0 },
      advocate: { state: 'clean-pass', coverage: 'full', findings: 2 },
    },
  };
}

function dropPending(root, ref, payload) {
  const file = pendingFileFor(root, ref);
  fs.writeFileSync(file, JSON.stringify(payload));
  return file;
}

function readLiveRaw(root, ref) {
  const file = precompute.questionsPath(root, ref);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

describe('attestation round-trip — the critique fleet records that it ran (audit-only)', () => {
  it('a valid attestation rides through promotion and reads attested:true via the audit path', () => {
    const { root, ref, mtime } = makeProject();
    const attestation = validAttestation();
    dropPending(root, ref, { ref, planMtimeMs: mtime, questions: validQuestions(), attestation });

    const abs = pendingFileFor(root, ref);
    const promoted = sweeper.promotePendingFile(root, abs);
    assert.equal(promoted.ok, true, 'the pending file is promoted');

    const st = precompute.planQuestionsStatus(root, ref);
    assert.equal(st.status, 'ready');
    assert.equal(st.attested, true, 'the audit reader sees a well-formed critique record');
    assert.deepEqual(st.attestation, attestation, 'the attestation is exposed to the auditor unchanged');
  });

  it('the attestation survives promotion byte-faithfully — no field dropped, reordered into loss, or coerced', () => {
    const { root, ref, mtime } = makeProject();
    const attestation = validAttestation();
    dropPending(root, ref, { ref, planMtimeMs: mtime, questions: validQuestions(), attestation });

    assert.equal(sweeper.promotePendingFile(root, pendingFileFor(root, ref)).ok, true);
    const live = readLiveRaw(root, ref);
    assert.deepEqual(live.attestation, attestation, 'the promoted block deep-equals the quarantined one');
  });

  it('an UN-RUN critique (no attestation) promotes its questions but reads attested:false', () => {
    const { root, ref, mtime } = makeProject();
    dropPending(root, ref, { ref, planMtimeMs: mtime, questions: validQuestions() });

    assert.equal(sweeper.promotePendingFile(root, pendingFileFor(root, ref)).ok, true, 'compatibility path is untouched');
    const st = precompute.planQuestionsStatus(root, ref);
    assert.equal(st.status, 'ready');
    assert.equal(st.attested, false, 'absent record reads not-attested — never fabricated as clean');
    assert.equal(st.attestation, null, 'no attestation is exposed when none was written');
  });

  it('the sweeper NEVER fabricates an attestation — an absent block stays absent on disk', () => {
    const { root, ref, mtime } = makeProject();
    dropPending(root, ref, { ref, planMtimeMs: mtime, questions: validQuestions() });

    assert.equal(sweeper.promotePendingFile(root, pendingFileFor(root, ref)).ok, true);
    const live = readLiveRaw(root, ref);
    assert.equal(
      Object.prototype.hasOwnProperty.call(live, 'attestation'),
      false,
      'the live file has no attestation key — the guard against a well-meaning fix-up',
    );
  });

  it('a MALFORMED (object) attestation is carried for audit yet reads attested:false — never laundered clean', () => {
    const { root, ref, mtime } = makeProject();
    // Object-shaped but invalid: missing the lenses block. A broken producer must
    // stay VISIBLE to an audit, and must NOT read as a clean pass.
    const malformed = { generated_by: 'gate-critic', generated_at: 1784500000000 };
    dropPending(root, ref, { ref, planMtimeMs: mtime, questions: validQuestions(), attestation: malformed });

    assert.equal(sweeper.promotePendingFile(root, pendingFileFor(root, ref)).ok, true);
    const live = readLiveRaw(root, ref);
    assert.deepEqual(live.attestation, malformed, 'the malformed-but-present record is carried through for audit');
    assert.equal(precompute.planQuestionsStatus(root, ref).attested, false, 'malformed reads not-attested');
  });

  it('a NON-object attestation is dropped, not stored — garbage never reaches the live file', () => {
    const { root, ref, mtime } = makeProject();
    dropPending(root, ref, { ref, planMtimeMs: mtime, questions: validQuestions(), attestation: 'clean' });

    assert.equal(sweeper.promotePendingFile(root, pendingFileFor(root, ref)).ok, true);
    const live = readLiveRaw(root, ref);
    assert.equal(
      Object.prototype.hasOwnProperty.call(live, 'attestation'),
      false,
      'a stray string fifth value is ignored by the writer',
    );
    assert.equal(precompute.planQuestionsStatus(root, ref).attested, false);
  });
});

describe('attestation contract — the agent definition documents what the code records (drift guard)', () => {
  const agentPath = path.join(__dirname, '..', 'agents', 'iron-loop', 'gate-critic.md');
  const precomputePath = path.join(__dirname, '..', 'src', 'lib', 'streaming-precompute.js');

  it('gate-critic.md documents the mandatory attestation block, its lens literals, and its states', () => {
    const doc = fs.readFileSync(agentPath, 'utf8');
    assert.match(doc, /attestation/, 'the agent file names the attestation record');
    for (const lens of ['premortem', 'devils-advocate', 'red-team', 'advocate']) {
      assert.ok(doc.includes(lens), `the agent file names the ${lens} lens`);
    }
    for (const state of ['clean-pass', 'partial', 'failed']) {
      assert.ok(doc.includes(state), `the agent file names the ${state} state`);
    }
  });

  it('the four lens literals agree across the wire — agent file matches the module constant', () => {
    const src = fs.readFileSync(precomputePath, 'utf8');
    // Extract EXPECTED_LENSES' literals from the module source, then confirm each
    // appears in the agent file. A lens renamed on one side of the wire is discarded
    // UNREAD by the sweeper's validator; this fails loudly instead.
    const prosecution = /const PROSECUTION_LENSES = \[([^\]]+)\]/.exec(src);
    assert.ok(prosecution, 'PROSECUTION_LENSES is defined in the module');
    const literals = prosecution[1].match(/'([^']+)'/g).map((s) => s.replace(/'/g, ''));
    literals.push('advocate');
    const doc = fs.readFileSync(agentPath, 'utf8');
    for (const lens of literals) {
      assert.ok(doc.includes(lens), `agent file and module agree on lens literal ${lens}`);
    }
  });
});
