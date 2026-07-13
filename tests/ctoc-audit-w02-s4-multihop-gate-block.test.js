'use strict';

/**
 * W02-s4 — Block multi-hop moves that skip a human gate (finding H2).
 *
 * Two layers, both asserting BEHAVIOR not structure:
 *
 *  1. Matrix layer (pure): the `crossesHumanGate(from, to)` helper is asserted
 *     over the FULL 6x6 ordered stage-pair set. The expected BLOCK/ALLOW verdict
 *     is an INDEPENDENT hand-enumerated oracle (BLOCKED_PAIRS below), derived from
 *     the ADR's worked cases — not a mirror of the implementation.
 *
 *  2. Behavior layer (real CLI, subprocess): the actual `move-plan.js` executable
 *     is spawned against a real temporary plan tree. A multi-hop gate-skipping move
 *     (in-progress -> done) must exit non-zero AND leave the plan file in its source
 *     folder (the move was PREVENTED). A legitimate non-gate move (todo ->
 *     in-progress) must exit zero AND relocate the file (no regression).
 *
 * Cross-platform: all paths via path.join; the CLI is spawned with process.execPath.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const MOVE_PLAN = path.join(REPO_ROOT, 'src', 'scripts', 'move-plan.js');

// The canonical stage order (index = order), matching the ADR.
const STAGES = ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];

// INDEPENDENT ORACLE — every forward stage pair that crosses at least one of the
// three gate edges (functional->implementation, implementation->todo, review->done),
// hand-enumerated from the ADR. Any pair NOT listed here must be ALLOWED.
const BLOCKED_PAIRS = new Set([
  // functional (0) forward — every forward move from functional crosses gate A.
  'functional->implementation',
  'functional->todo',
  'functional->in-progress',
  'functional->review',
  'functional->done',
  // implementation (1) forward — every forward move from implementation crosses gate B.
  'implementation->todo',
  'implementation->in-progress',
  'implementation->review',
  'implementation->done',
  // todo (2) forward — only reaching done crosses gate C.
  'todo->done',
  // in-progress (3) forward — only reaching done crosses gate C.
  'in-progress->done',
  // review (4) forward — the adjacent review->done gate.
  'review->done',
]);

const gateOrder = require('../src/lib/gate-order');

test('exports STAGE_ORDER, GATE_EDGES and crossesHumanGate', () => {
  assert.deepStrictEqual(gateOrder.STAGE_ORDER, STAGES);
  assert.deepStrictEqual(gateOrder.GATE_EDGES, [
    ['functional', 'implementation'],
    ['implementation', 'todo'],
    ['review', 'done'],
  ]);
  assert.strictEqual(typeof gateOrder.crossesHumanGate, 'function');
});

test('crossesHumanGate matches the hand-enumerated oracle over the full 6x6 matrix', () => {
  for (const from of STAGES) {
    for (const to of STAGES) {
      const expected = BLOCKED_PAIRS.has(`${from}->${to}`);
      const actual = gateOrder.crossesHumanGate(from, to);
      assert.strictEqual(
        actual,
        expected,
        `${from} -> ${to}: expected ${expected ? 'BLOCK' : 'ALLOW'}, got ${actual ? 'BLOCK' : 'ALLOW'}`
      );
    }
  }
});

test('the three multi-hop gate skips are BLOCKED', () => {
  assert.strictEqual(gateOrder.crossesHumanGate('in-progress', 'done'), true);
  assert.strictEqual(gateOrder.crossesHumanGate('functional', 'todo'), true);
  assert.strictEqual(gateOrder.crossesHumanGate('functional', 'done'), true);
});

test('the three adjacent gate edges are BLOCKED', () => {
  assert.strictEqual(gateOrder.crossesHumanGate('functional', 'implementation'), true);
  assert.strictEqual(gateOrder.crossesHumanGate('implementation', 'todo'), true);
  assert.strictEqual(gateOrder.crossesHumanGate('review', 'done'), true);
});

test('every backward (revert) move is ALLOWED', () => {
  for (let i = 0; i < STAGES.length; i++) {
    for (let j = 0; j < i; j++) {
      const from = STAGES[i];
      const to = STAGES[j];
      assert.strictEqual(
        gateOrder.crossesHumanGate(from, to),
        false,
        `backward ${from} -> ${to} must be ALLOWED`
      );
    }
  }
});

test('same-stage moves are ALLOWED', () => {
  for (const stage of STAGES) {
    assert.strictEqual(gateOrder.crossesHumanGate(stage, stage), false);
  }
});

test('non-gate forward moves are ALLOWED', () => {
  assert.strictEqual(gateOrder.crossesHumanGate('todo', 'in-progress'), false);
  assert.strictEqual(gateOrder.crossesHumanGate('todo', 'review'), false);
  assert.strictEqual(gateOrder.crossesHumanGate('in-progress', 'review'), false);
});

test('an unknown stage fails open to ALLOW (move-plan.js validates stages first)', () => {
  assert.strictEqual(gateOrder.crossesHumanGate('nonsense', 'done'), false);
  assert.strictEqual(gateOrder.crossesHumanGate('functional', 'nonsense'), false);
});

// ---------------------------------------------------------------------------
// Behavior layer — real move-plan.js CLI against a real temp plan tree.
// ---------------------------------------------------------------------------

function makeSandbox() {
  // realpathSync so the path matches the CLI's own process.cwd() resolution
  // (macOS /tmp is a symlink to /private/tmp).
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-w02-s4-')));
  for (const stage of STAGES) {
    fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  }
  fs.mkdirSync(path.join(dir, '.ctoc', 'logs'), { recursive: true });
  return dir;
}

function writePlan(dir, stage, name) {
  const p = path.join(dir, 'plans', stage, name);
  fs.writeFileSync(p, `---\ntitle: "sandbox ${name}"\n---\n\n# ${name}\n`);
  return p;
}

function runMove(dir, ref, destination) {
  return spawnSync(process.execPath, [MOVE_PLAN, ref, destination], {
    cwd: dir,
    encoding: 'utf8',
  });
}

test('BEHAVIOR: multi-hop in-progress -> done is PREVENTED (file stays in source)', () => {
  const dir = makeSandbox();
  try {
    writePlan(dir, 'in-progress', 'x.md');

    const res = runMove(dir, path.join('in-progress', 'x.md'), 'done');

    assert.notStrictEqual(res.status, 0, `expected non-zero exit, stderr: ${res.stderr}`);
    assert.ok(
      fs.existsSync(path.join(dir, 'plans', 'in-progress', 'x.md')),
      'plan must remain in in-progress/ — the gate-skipping move was PREVENTED'
    );
    assert.ok(
      !fs.existsSync(path.join(dir, 'plans', 'done', 'x.md')),
      'plan must NOT have arrived in done/'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('BEHAVIOR: multi-hop functional -> todo is PREVENTED (file stays in source)', () => {
  const dir = makeSandbox();
  try {
    writePlan(dir, 'functional', 'y.md');

    const res = runMove(dir, path.join('functional', 'y.md'), 'todo');

    assert.notStrictEqual(res.status, 0, `expected non-zero exit, stderr: ${res.stderr}`);
    assert.ok(
      fs.existsSync(path.join(dir, 'plans', 'functional', 'y.md')),
      'plan must remain in functional/ — the gate-skipping move was PREVENTED'
    );
    assert.ok(
      !fs.existsSync(path.join(dir, 'plans', 'todo', 'y.md')),
      'plan must NOT have arrived in todo/'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('BEHAVIOR: legitimate non-gate move todo -> in-progress SUCCEEDS (file relocated)', () => {
  const dir = makeSandbox();
  try {
    writePlan(dir, 'todo', 'z.md');

    const res = runMove(dir, path.join('todo', 'z.md'), 'in-progress');

    assert.strictEqual(res.status, 0, `expected zero exit, stderr: ${res.stderr}`);
    assert.ok(
      fs.existsSync(path.join(dir, 'plans', 'in-progress', 'z.md')),
      'plan must have relocated to in-progress/'
    );
    assert.ok(
      !fs.existsSync(path.join(dir, 'plans', 'todo', 'z.md')),
      'plan must no longer be in todo/'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
