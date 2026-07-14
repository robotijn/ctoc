'use strict';

/**
 * Human-gate contract tests (SP5 rewrite — folded defect fix).
 *
 * WHY THIS FILE WAS REPLACED WHOLESALE: the previous 364-line version constructed
 * literal option arrays inside each `testXxx()` function and asserted properties of
 * those literals — it imported NOTHING from src/ and every assertion targeted a
 * self-built value (parseInt arithmetic, `.length`, template-string `.includes()`).
 * That is an always-green tautology (false confidence) a pre-ship review flagged:
 * mutating the real gate logic could never break it. This rewrite drives the REAL
 * exported gate logic — `approvePlan` + `HUMAN_GATES` from src/lib/actions.js — in
 * an os.tmpdir() sandbox, so every assertion is mutation-sensitive.
 *
 * R5-B VALIDATED CONTRACT (tightening — the old cases pinned approvePlan's
 * validation-FREE crossing, a defect the human ordered fixed). approvePlan now runs
 * `plan-validator.validateTransition` and REFUSES an invalid transition unless the
 * human passes `{ override:{ reason } }`. So each gate case here crosses via a plan
 * that is genuinely VALID for its transition (functional→implementation carries a
 * problem statement + acceptance criteria; implementation→todo carries a title +
 * iron_loop) or, for review→done — whose clean validation requires on-disk VERIFY
 * evidence that tests/approveplan-validates.test.js sets up in full — via an explicit,
 * audited `override`. Either way the MAP + marker + move mechanics are what these
 * assertions pin. The refuse / override PROVENANCE contract lives in
 * tests/approveplan-validates.test.js.
 *
 * MUTATION-SENSITIVITY (the anti-tautology bar):
 *   - Mutating the literal `human` in the approval marker (`approved_by: human`)
 *     breaks G2/G3/G4 (their marker value no longer trims to exactly 'human').
 *   - Mutating gate-order's GATE_EDGES (the ONE gate-edge encoding approvePlan now
 *     derives from) breaks G1 (a mutated edge flips humanGate / the destination) and
 *     G5 (a stage that stopped being a source no longer throws, or one that became a
 *     source no longer throws — either way an assertion breaks).
 *   - Mutating approvePlan's move target (movePlan(planPath, to, ...)) breaks the
 *     destination-existence assertions in G2–G4.
 * No assertion targets a self-constructed literal in isolation.
 *
 * SCOPE (read fresh — see the plan's Implementation Details, Discrepancy #4):
 * human-gate-check.js is NOT unit-testable (no module.exports; top-level main() +
 * process.exit; hardcoded process.cwd()-based PLANS_DIR). Enforcement/violation
 * detection stays covered by the existing process-spawn suites
 * (e2e-enforcement-and-gates, security-gate-bypass). This file pins the WRITE-side
 * contract that approvePlan owns.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { approvePlan } = require('../src/lib/actions.js');

// READ-FRESH DISCREPANCY (CF1 — code wins): the plan's Implementation Details
// (line 358) assumed `HUMAN_GATES` is exported from src/lib/actions.js. It is NOT
// — the fresh module.exports (actions.js:740-768) exports `approvePlan` but not
// the `HUMAN_GATES` constant (it is module-private, driving `isHumanGate` at
// actions.js:100). Per SP5's no-silent-src-edit rule, we do NOT add an export from
// this test plan. Instead G1/G5 pin the SAME gate-map contract through
// approvePlan's OBSERVABLE behavior, which is fully mutation-sensitive: because
// `isHumanGate = HUMAN_GATES[from] === to` gates whether the marker is written and
// the humanGate flag, mutating the private HUMAN_GATES map still breaks G1–G4
// (marker/flag change) and G5 (throw behavior). Documented in the plan's
// Decisions Taken Under Ambiguity as D-SP5-8.

// ---------------------------------------------------------------------------
// Hermetic sandbox harness
// ---------------------------------------------------------------------------

const STAGES = ['functional', 'implementation', 'todo', 'review', 'done'];
const sandboxes = [];
let sandboxCounter = 0;

function makeSandbox() {
  const root = path.join(
    os.tmpdir(),
    'ctoc-gates-' + process.pid + '-' + Date.now() + '-' + sandboxCounter++
  );
  for (const stage of STAGES) {
    fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  }
  sandboxes.push(root);
  return root;
}

afterEach(() => {
  while (sandboxes.length) {
    fs.rmSync(sandboxes.pop(), { recursive: true, force: true });
  }
});

/**
 * Write a plan (no pre-existing approval marker unless `frontmatter` supplies one).
 * `frontmatter` lets G4 carry `iron_loop: true` so applyIronLoop short-circuits
 * (IL-hazard mitigation). `body` overrides the default body — used to make a
 * functional plan VALID for the functional→implementation gate (R5-B).
 */
function writePlan(root, stage, slug, { frontmatter = {}, body = `# ${slug}\n\nBody.\n` } = {}) {
  const planPath = path.join(root, 'plans', stage, slug + '.md');
  const keys = Object.keys(frontmatter);
  let content = '';
  if (keys.length) {
    content += '---\n';
    for (const k of keys) content += `${k}: ${frontmatter[k]}\n`;
    content += '---\n\n';
  }
  content += body;
  fs.writeFileSync(planPath, content);
  return planPath;
}

// A functional-plan body that PASSES validateFunctionalToImpl (problem statement +
// acceptance criteria present), so functional→implementation crosses on the DEFAULT
// validating path — no override needed.
function validFunctionalBody(slug) {
  return `# ${slug}\n\n## Problem Statement\nThe thing is broken.\n\n## Acceptance Criteria\n- [ ] it works\n`;
}

/** Read the FIRST frontmatter block's `approved_by` value (the marker approvePlan writes). */
function firstBlockApprovedBy(fileContent) {
  // The marker approvePlan prepends is the FIRST `---…---` block.
  const m = fileContent.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return undefined;
  const line = m[1].split('\n').find((l) => /^approved_by:/.test(l));
  if (!line) return undefined;
  return line.replace(/^approved_by:\s*/, '').replace(/^["']|["']$/g, '').trim();
}

// ---------------------------------------------------------------------------
// Gate contract cases
// ---------------------------------------------------------------------------

describe('Human gates — real approvePlan gate-map contract', () => {
  // G1 — the exact gate map, pinned via approvePlan's behavior (HUMAN_GATES is not
  // exported; see the discrepancy note). Each of the three source→dest transitions
  // is a human gate (marker written, humanGate===true, moved to the right dest),
  // and NO OTHER source stage is. This is mutation-sensitive: changing the private
  // HUMAN_GATES map flips humanGate / the destination for the mutated entry.
  it('G1 the gate map is exactly {functional→implementation, implementation→todo, review→done} (pinned via approvePlan behavior)', () => {
    // Each case crosses via a plan VALID for its transition, or (review→done) an
    // explicit override — the R5-B validated contract.
    const cases = [
      { from: 'functional', to: 'implementation', opts: {}, plan: { body: validFunctionalBody('g1-functional') } },
      { from: 'implementation', to: 'todo', opts: {}, plan: { frontmatter: { iron_loop: true } } },
      { from: 'review', to: 'done', opts: { override: { reason: 'gate-map mechanics test' } }, plan: {} },
    ];
    for (const { from, to, opts, plan } of cases) {
      const root = makeSandbox();
      const planPath = writePlan(root, from, 'g1-' + from, plan);
      const { newPath, humanGate } = approvePlan(planPath, root, opts);
      assert.equal(humanGate, true, `${from}→${to} must be a human gate`);
      assert.equal(newPath, path.join(root, 'plans', to, 'g1-' + from + '.md'), `${from}→${to} destination`);
      assert.equal(
        firstBlockApprovedBy(fs.readFileSync(newPath, 'utf8')),
        'human',
        `${from}→${to} writes approved_by:human`
      );
    }
    // And a stage that is NOT a gate source (todo) is rejected — pins that the map
    // has no `todo`/`done` source key.
    const root = makeSandbox();
    const nonSource = writePlan(root, 'todo', 'g1-todo');
    assert.throws(() => approvePlan(nonSource, root), /Unknown plan location/, 'todo is not a gate source');
  });

  // G2 — functional → implementation
  it('G2 approvePlan functional→implementation writes approved_by:human (trims to exactly "human") and moves to implementation', () => {
    const root = makeSandbox();
    // Valid for the transition (problem statement + acceptance criteria) → crosses on
    // the default validating path.
    const planPath = writePlan(root, 'functional', 'g-func', { body: validFunctionalBody('g-func') });

    const { newPath, humanGate } = approvePlan(planPath, root);

    assert.equal(humanGate, true, 'functional→implementation is a human gate');
    assert.ok(!fs.existsSync(planPath), 'plan left functional/');
    const dest = path.join(root, 'plans', 'implementation', 'g-func.md');
    assert.ok(fs.existsSync(dest), 'plan landed in implementation/');
    assert.equal(newPath, dest, 'newPath is the implementation/ destination');

    const value = firstBlockApprovedBy(fs.readFileSync(dest, 'utf8'));
    assert.equal(value, 'human', 'approved_by marker value trims to exactly "human"');
  });

  // G3 — review → done
  it('G3 approvePlan review→done writes marker and moves to done', () => {
    const root = makeSandbox();
    const planPath = writePlan(root, 'review', 'g-rev');

    // review→done fires the deployment trigger ONLY if getDeploymentConfig(root)
    // .enabled — the sandbox has no .ctoc deployment config, so it is falsy and
    // runDeploymentPipeline never runs (actions.js:126-139). A clean review→done
    // validation requires on-disk VERIFY evidence (owned by
    // approveplan-validates.test.js); here we cross via an explicit, audited override
    // to pin the marker/move mechanics.
    const { newPath, humanGate } = approvePlan(planPath, root, { override: { reason: 'gate mechanics test' } });

    assert.equal(humanGate, true);
    assert.ok(!fs.existsSync(planPath), 'plan left review/');
    const dest = path.join(root, 'plans', 'done', 'g-rev.md');
    assert.ok(fs.existsSync(dest), 'plan landed in done/');
    assert.equal(newPath, dest);

    const value = firstBlockApprovedBy(fs.readFileSync(dest, 'utf8'));
    assert.equal(value, 'human', 'approved_by marker value trims to exactly "human"');
  });

  // G4 — implementation → todo  (IL-hazard: to==='todo' triggers applyIronLoop)
  it('G4 approvePlan implementation→todo writes marker and moves to todo (iron_loop:true short-circuits refinement)', () => {
    const root = makeSandbox();
    // IL-hazard mitigation (D-SP5-5): iron_loop:true in the (single) frontmatter
    // block makes applyIronLoop early-return at actions.js:170-172 — no refinement
    // engine is driven by this unit test.
    const planPath = writePlan(root, 'implementation', 'g-impl', { frontmatter: { iron_loop: true } });

    const { newPath, humanGate } = approvePlan(planPath, root);

    assert.equal(humanGate, true);
    assert.ok(!fs.existsSync(planPath), 'plan left implementation/');
    const dest = path.join(root, 'plans', 'todo', 'g-impl.md');
    assert.ok(fs.existsSync(dest), 'plan landed in todo/');
    assert.equal(newPath, dest);

    const value = firstBlockApprovedBy(fs.readFileSync(dest, 'utf8'));
    assert.equal(value, 'human', 'approved_by marker value trims to exactly "human"');
  });

  // G5 — a non-gate transition receives no gate marker (todo/done are not sources)
  it('G5 a non-gate transition receives no gate marker (todo/done are not gate SOURCES)', () => {
    // approvePlan on a plan NOT under any gate-order source stage throws
    // "Unknown plan location" and never touches the file. This is the behavioral
    // proof that todo/done are not sources in gate-order.GATE_EDGES.
    for (const stage of ['todo', 'done']) {
      const root = makeSandbox();
      const planPath = writePlan(root, stage, 'g-x-' + stage);
      const before = fs.readFileSync(planPath, 'utf8');
      assert.throws(() => approvePlan(planPath, root), /Unknown plan location/, `${stage} is not a gate source`);
      assert.equal(fs.readFileSync(planPath, 'utf8'), before, `no marker added to a ${stage} plan`);
      assert.ok(fs.existsSync(planPath), `${stage} plan not moved`);
    }
  });
});
