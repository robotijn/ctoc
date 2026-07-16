'use strict';

/**
 * approvePlan VALIDATES every transition, and records override PROVENANCE (R5-B).
 *
 * The defect this pins closed: `approvePlan` used to match a stage by path prefix
 * and cross the gate with ZERO validator call — a gate that validates nothing is a
 * rubber stamp. Only the batch `approveSubplans` and the menu `validate` route ever
 * validated. Now:
 *   - every transition runs `plan-validator.validateTransition(from → to)`;
 *   - a FAILING validation REFUSES by default: `{ ok:false, refused:true, ... }`,
 *     the plan is NOT moved, NO marker is stamped, NO ledger entry is written;
 *   - an explicit `approvePlan(p, root, { override:{ reason } })` crosses AND records
 *     the override in BOTH the ledger entry (`override:true`, `override_reason`) and
 *     the plan marker — a forced crossing is NEVER indistinguishable from a clean one.
 *
 * Hermetic os.tmpdir() sandboxes; every assertion drives the REAL exported
 * approvePlan against real files and the real approval ledger.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { approvePlan } = require('../src/lib/actions.js');
const gateOrder = require('../src/lib/gate-order.js');

const STAGES = ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
const sandboxes = [];
let counter = 0;

function makeSandbox() {
  const root = path.join(os.tmpdir(), 'ctoc-apv-' + process.pid + '-' + Date.now() + '-' + counter++);
  for (const stage of STAGES) fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
  sandboxes.push(root);
  return root;
}

function writePlan(root, stage, slug, body) {
  const p = path.join(root, 'plans', stage, slug + '.md');
  fs.writeFileSync(p, body);
  return p;
}

function ledgerFile(root, slug) {
  return path.join(root, '.ctoc', 'approvals', slug.toLowerCase() + '.json');
}

// A functional plan that PASSES validateFunctionalToImpl (problem statement +
// acceptance criteria present).
function validFunctionalBody(slug) {
  return `# ${slug}\n\n## Problem Statement\nThe thing is broken.\n\n## Acceptance Criteria\n- [ ] the thing works\n`;
}

afterEach(() => {
  while (sandboxes.length) fs.rmSync(sandboxes.pop(), { recursive: true, force: true });
});

describe('approvePlan — validates every transition (R5-B)', () => {
  it('REFUSES review→done with no verify evidence: plan unmoved, no ledger entry, no marker', () => {
    const root = makeSandbox();
    // A bare review plan fails validateReviewToDone (no marker, no steps, no evidence).
    const planPath = writePlan(root, 'review', 'r5b-refuse', `# r5b-refuse\n\nBody.\n`);
    const before = fs.readFileSync(planPath, 'utf8');

    const res = approvePlan(planPath, root);

    assert.equal(res.ok, false, 'validation failure returns ok:false');
    assert.equal(res.refused, true, 'the crossing is refused');
    assert.ok(Array.isArray(res.failures) && res.failures.length > 0, 'failures[] names why');
    assert.ok(/review/i.test(res.reason), 'reason mentions the refused transition');

    // Plan is UNMOVED and UNCHANGED.
    assert.ok(fs.existsSync(planPath), 'plan still resident in review/');
    assert.ok(!fs.existsSync(path.join(root, 'plans', 'done', 'r5b-refuse.md')), 'nothing landed in done/');
    assert.equal(fs.readFileSync(planPath, 'utf8'), before, 'no marker was prepended to the refused plan');

    // No ledger entry was minted for a refused crossing.
    assert.ok(!fs.existsSync(ledgerFile(root, 'r5b-refuse')), 'no ledger entry for a refused crossing');
  });

  it('override:{reason} crosses review→done AND records override provenance in the ledger AND the marker', () => {
    const root = makeSandbox();
    const planPath = writePlan(root, 'review', 'r5b-override', `# r5b-override\n\nBody.\n`);

    const res = approvePlan(planPath, root, { override: { reason: 'human ordered ship despite red verify' } });

    // Crossed.
    assert.ok(!res.refused, 'an override is not refused');
    const dest = path.join(root, 'plans', 'done', 'r5b-override.md');
    assert.equal(res.newPath, dest, 'crossed to done/');
    assert.ok(fs.existsSync(dest), 'plan landed in done/');
    assert.ok(!fs.existsSync(planPath), 'plan left review/');
    assert.equal(res.overridden, true, 'the return flags the override');

    // Ledger provenance — a forced crossing is auditable.
    const lf = ledgerFile(root, 'r5b-override');
    assert.ok(fs.existsSync(lf), 'a ledger entry was written for the override crossing');
    const entry = JSON.parse(fs.readFileSync(lf, 'utf8'));
    assert.equal(entry.override, true, 'ledger entry carries override:true');
    assert.equal(entry.override_reason, 'human ordered ship despite red verify', 'ledger entry carries the reason');
    assert.equal(entry.stage_from, 'review');
    assert.equal(entry.stage_to, 'done');
    assert.equal(entry.approved_by, 'human');

    // Marker provenance too.
    const destContent = fs.readFileSync(dest, 'utf8');
    assert.match(destContent, /override:\s*true/, 'the plan marker records the override');
    assert.match(destContent, /override_reason:/, 'the plan marker records the override reason');
  });

  it('a CLEAN transition crosses with NO override field (functional→implementation)', () => {
    const root = makeSandbox();
    const planPath = writePlan(root, 'functional', 'r5b-clean', validFunctionalBody('r5b-clean'));

    const res = approvePlan(planPath, root);

    assert.ok(!res.refused, 'a valid plan is not refused');
    const dest = path.join(root, 'plans', 'implementation', 'r5b-clean.md');
    assert.equal(res.newPath, dest, 'crossed to implementation/');
    assert.equal(res.humanGate, true, 'functional→implementation is a human gate');
    assert.notEqual(res.overridden, true, 'a clean crossing is not flagged as overridden');

    const entry = JSON.parse(fs.readFileSync(ledgerFile(root, 'r5b-clean'), 'utf8'));
    assert.equal(entry.override, undefined, 'a clean ledger entry carries no override field');
    assert.equal(entry.override_reason, undefined, 'a clean ledger entry carries no override_reason');
  });

  it('approvePlan derives its edges from gate-order: each edge crosses to destinationOf(source)', () => {
    // functional→implementation on a VALID plan.
    {
      const root = makeSandbox();
      const p = writePlan(root, 'functional', 'edge-func', validFunctionalBody('edge-func'));
      const res = approvePlan(p, root);
      assert.equal(path.dirname(res.newPath), path.join(root, 'plans', gateOrder.destinationOf('functional')));
    }
    // implementation→todo on a plan valid for the queue (title + iron_loop short-circuits refinement).
    {
      const root = makeSandbox();
      const p = writePlan(root, 'implementation', 'edge-impl', `---\niron_loop: true\n---\n\n# edge-impl\n\nImplementation body.\n`);
      const res = approvePlan(p, root);
      assert.equal(path.dirname(res.newPath), path.join(root, 'plans', gateOrder.destinationOf('implementation')));
    }
    // review→done via an explicit override (validation semantics owned above).
    {
      const root = makeSandbox();
      const p = writePlan(root, 'review', 'edge-rev', `# edge-rev\n\nBody.\n`);
      const res = approvePlan(p, root, { override: { reason: 'edge test' } });
      assert.equal(path.dirname(res.newPath), path.join(root, 'plans', gateOrder.destinationOf('review')));
    }
  });

  it('a non-gate-source stage still throws Unknown plan location (map has no todo/done source)', () => {
    const root = makeSandbox();
    const p = writePlan(root, 'todo', 'edge-todo', `# edge-todo\n\nBody.\n`);
    assert.throws(() => approvePlan(p, root), /Unknown plan location/);
  });
});

describe('approvePlan — an un-keyable (non [a-z0-9-]) slug is REFUSED, never crossed marker-only', () => {
  // The defect: the approval ledger keys a plan by a slug restricted to
  // /^[a-z0-9][a-z0-9-]*$/, so a basename with an underscore (or dot/space) is
  // un-keyable and ledgerPath THROWS. stampAndLedger used to cross such a plan
  // MARKER-ONLY — moved into the gate destination + stamped `approved_by: human`
  // in the body, but with NO ledger entry. Residency is ledger-driven (R3-C), so
  // human-gate-check.js / iron-loop-enforcer.checkGateDestinationsApproved then
  // treat that no-ledger resident as a HUMAN GATE VIOLATION and revert it — a plan
  // the human genuinely approved is silently reverted and branded a forgery. The
  // ledger is the source of approval truth: a crossing that cannot be ledgered is
  // NOT a real crossing, so approvePlan must REFUSE up front and leave the plan in
  // its source stage.
  const { checkGateDestinationsApproved } = require('../src/lib/iron-loop-enforcer.js');

  it('REFUSES an underscore-named review plan crossing review→done: unmoved, no ledger, no offender', () => {
    const root = makeSandbox();
    // Override bypasses the review→done content validator so the ONLY thing under
    // test is the un-keyable-slug refusal — an un-keyable slug can never be ledgered,
    // so even a human "approve anyway" cannot record it and must still be refused.
    const planPath = writePlan(root, 'review', 'my_plan', `# my_plan\n\nBody.\n`);
    const before = fs.readFileSync(planPath, 'utf8');

    const res = approvePlan(planPath, root, { override: { reason: 'human ordered ship' } });

    assert.equal(res.ok, false, 'an un-keyable crossing returns ok:false');
    assert.equal(res.refused, true, 'the crossing is refused, not crossed marker-only');
    assert.ok(/keyable/i.test(res.reason), 'reason explains the slug is not ledger-keyable');

    // Plan is UNMOVED and byte-identical in review/ — nothing squats done/.
    assert.ok(fs.existsSync(planPath), 'plan still resident in review/');
    assert.equal(fs.readFileSync(planPath, 'utf8'), before, 'refused plan is byte-identical (no marker stamped)');
    assert.ok(!fs.existsSync(path.join(root, 'plans', 'done', 'my_plan.md')), 'nothing landed in done/');

    // No ledger entry was minted, AND the enforcer reports NO offender — the exact
    // "genuinely-approved plan reverted as a violation" failure is closed.
    assert.ok(!fs.existsSync(ledgerFile(root, 'my_plan')), 'no ledger entry for an un-keyable crossing');
    assert.equal(checkGateDestinationsApproved(root), null, 'no gate-destination offender — nothing squatting done/');
  });

  it('the keyable control STILL crosses review→done and writes its ledger entry (no regression)', () => {
    const root = makeSandbox();
    const planPath = writePlan(root, 'review', 'keyable-plan', `# keyable-plan\n\nBody.\n`);

    const res = approvePlan(planPath, root, { override: { reason: 'human ordered ship' } });

    assert.ok(!res.refused, 'a keyable slug is not refused');
    const dest = path.join(root, 'plans', 'done', 'keyable-plan.md');
    assert.equal(res.newPath, dest, 'crossed to done/');
    assert.ok(fs.existsSync(dest), 'plan landed in done/');
    assert.ok(fs.existsSync(ledgerFile(root, 'keyable-plan')), 'the ledger entry was written');
    const entry = JSON.parse(fs.readFileSync(ledgerFile(root, 'keyable-plan'), 'utf8'));
    assert.equal(entry.approved_by, 'human');
    assert.equal(entry.stage_to, 'done');
    assert.equal(checkGateDestinationsApproved(root), null, 'a properly-ledgered done/ resident is clean');
  });
});
