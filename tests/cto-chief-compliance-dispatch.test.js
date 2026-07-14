/**
 * EC5-s5 — CTO Chief compliance dispatch (LIVE end-to-end wiring).
 *
 * This is the human-facing wiring slice: CTO Chief (Tier 0, the SOLE dispatcher)
 * runs the compliance seam at the functional→implementation transition. Per the
 * PI4 lesson (any human-facing surface wires LIVE and the test drives the real
 * flow) this test does NOT merely grep the agent markdown for the instruction —
 * it EXERCISES the real seam the instruction points at, end-to-end, against a
 * REAL tmp project with NO mocks:
 *
 *   - the agent-content contract (cases 1–2): the compliance dispatch case is
 *     present in agents/coordinator/cto-chief.md, names the REAL functions
 *     (`evaluateComplianceTrigger` / `runComplianceForTransition`) and the string
 *     `dispatcher: "cto-chief"`, states advisory / no-new-gate, and weakens no
 *     human gate (still exactly the 4 gates);
 *   - the LIVE flow (cases 3–6): activate a profile in a real .ctoc/settings.yaml
 *     (+ a copy of the shipped regulatory-regimes/ so the REAL gates resolve),
 *     WRITE the trigger via EC5-s4's `writeComplianceTrigger`, read it back from
 *     the plan frontmatter, then drive the REAL flow
 *     trigger → `runComplianceForTransition` → real Inbox on disk, and assert a
 *     finding lands in the REAL Inbox at .ctoc/inbox/questions/;
 *   - the DISPATCHER-IDENTITY proof: the recorded dispatcher for the compliance
 *     flow is `'cto-chief'`, NEVER `'iron-loop'` — read from the trigger's
 *     `dispatcher` field AND from the persisted plan frontmatter;
 *   - the GATE INVARIANT (case 7): HUMAN_GATES topology unchanged (exactly 3
 *     destination keys), the flow moves no plan, and the agent markdown adds no
 *     5th "compliance gate".
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const trigger = require('../src/lib/iron-loop-compliance-trigger');
const seam = require('../src/lib/compliance-integration');

const REPO_ROOT = path.join(__dirname, '..');
const REGIMES_SRC = path.join(REPO_ROOT, '.ctoc', 'regulatory-regimes');
const CTO_CHIEF_PATH = path.join(REPO_ROOT, 'agents', 'coordinator', 'cto-chief.md');
const GATE_HOOK_PATH = path.join(REPO_ROOT, 'src', 'hooks', 'human-gate-check.js');

const ctoChiefSrc = fs.readFileSync(CTO_CHIEF_PATH, 'utf8');

function settingsYaml(activeProfilesLine) {
  return [
    'timezone: "UTC"',
    '',
    'regulatory_regime:',
    `  active_profiles: ${activeProfilesLine}`,
    '  overrides: {}',
    '',
    'enforcement:',
    '  mode: strict',
    '',
  ].join('\n');
}

const tmpDirs = [];

// Build a tmp project with a real .ctoc/settings.yaml AND a copy of the shipped
// regulatory-regimes/ dir so the REAL gates resolve gdpr.yaml + eu-ai-act.yaml.
function projectWith(activeProfilesLine) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cto-chief-compl-'));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, '.ctoc', 'regulatory-regimes'), { recursive: true });
  for (const f of fs.readdirSync(REGIMES_SRC)) {
    if (f.endsWith('.yaml')) {
      fs.copyFileSync(path.join(REGIMES_SRC, f), path.join(dir, '.ctoc', 'regulatory-regimes', f));
    }
  }
  fs.writeFileSync(path.join(dir, '.ctoc', 'settings.yaml'), settingsYaml(activeProfilesLine));
  return dir;
}

// Seed a real plan file (with a frontmatter block) at plans/<stage>/<name>.md.
function seedPlan(root, stage, name, body) {
  const dir = path.join(root, 'plans', stage);
  fs.mkdirSync(dir, { recursive: true });
  const planPath = path.join(dir, name);
  fs.writeFileSync(planPath, body);
  return planPath;
}

function questionsDir(root) {
  return path.join(root, '.ctoc', 'inbox', 'questions');
}

function listQuestionFiles(root) {
  const dir = questionsDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md'));
}

function readAllQuestionBodies(root) {
  return listQuestionFiles(root).map(f => fs.readFileSync(path.join(questionsDir(root), f), 'utf8'));
}

after(() => tmpDirs.forEach(d => fs.rmSync(d, { recursive: true, force: true })));

// A GDPR plan-stage finding (no target_file ⇒ routes to the Inbox).
function gdprPlanFinding(overrides = {}) {
  return {
    gdpr_article: 'GDPR-17',
    kind: 'data-retention',
    regulation_ref: 'gdpr art. 5(1)(e)',
    confidence: 'medium',
    message: 'personal data kept longer than necessary',
    plan: 'user-data-flow',
    ...overrides,
  };
}

// An EU-AI-Act plan-stage finding (no target_file ⇒ routes to the Inbox).
function euAiActPlanFinding(overrides = {}) {
  return {
    regulation: 'eu-ai-act',
    risk_class: 'high-risk',
    kind: 'data-governance',
    regulation_ref: 'eu-ai-act art. 10',
    confidence: 'medium',
    message: 'high-risk training data lacks Art.10 governance',
    plan: 'model-training',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────
// 1 & 2. Agent-content contract (necessary but insufficient — see 3–7)
// ─────────────────────────────────────────────────────────────────────

describe('cto-chief.md — compliance dispatch case present + names the real seam', () => {
  it('1. contains a compliance dispatch subsection naming the REAL functions and dispatcher: "cto-chief"', () => {
    assert.match(
      ctoChiefSrc,
      /##[^\n]*[Cc]ompliance dispatch[^\n]*/,
      'a compliance-dispatch subsection heading must be present',
    );
    assert.match(ctoChiefSrc, /evaluateComplianceTrigger/, 'must name the trigger evaluator by its real export name');
    assert.match(ctoChiefSrc, /writeComplianceTrigger/, 'must name the trigger writer by its real export name');
    assert.match(ctoChiefSrc, /runComplianceForTransition/, 'must name the integration seam by its real export name');
    assert.match(ctoChiefSrc, /iron-loop-compliance-trigger/, 'must reference the EC5-s4 trigger module by path');
    assert.match(ctoChiefSrc, /compliance-integration/, 'must reference the EC5-s3 integration module by path');
    assert.match(ctoChiefSrc, /dispatcher:\s*"cto-chief"/, 'must record dispatcher: "cto-chief" per DISPATCH_PROTOCOL');
    assert.match(ctoChiefSrc, /functional\s*(?:→|->|to)\s*implementation/i, 'must locate the case at the functional→implementation transition');
  });

  it('2. states advisory / no-new-gate / library-does-not-dispatch AND weakens no human gate (still exactly 4 gates)', () => {
    // Advisory + no new gate.
    assert.match(ctoChiefSrc, /advisory/i, 'must state findings are advisory');
    assert.match(ctoChiefSrc, /no( new)? human gate|add(s)? NO human gate|adds no human gate/i, 'must state it adds no human gate');
    // Library code does not dispatch — CTO Chief does.
    assert.match(ctoChiefSrc, /never dispatch|does not dispatch|only emits/i, 'must state library code never dispatches');
    // The compliance case must NEVER name the iron loop as the dispatcher.
    const complianceSection = ctoChiefSrc.slice(ctoChiefSrc.search(/##[^\n]*[Cc]ompliance dispatch[^\n]*/));
    assert.doesNotMatch(complianceSection, /dispatcher:\s*["']?iron-loop["']?/i, 'the compliance case must NEVER record dispatcher: iron-loop');
    // No accidental gate weakening introduced by this slice.
    assert.doesNotMatch(complianceSection, /review_gate:\s*true/, 'the compliance case introduces no review_gate: true');
    assert.doesNotMatch(complianceSection, /requireReviewGate:\s*false/, 'the compliance case never disables the review gate');
    // The 4-gate topology is still described in full (Gate 0–3), untouched.
    for (const g of ['Gate 0', 'Gate 1', 'Gate 2', 'Gate 3']) {
      assert.ok(ctoChiefSrc.includes(g), `the 4-gate description must still name ${g}`);
    }
    assert.doesNotMatch(ctoChiefSrc, /Gate 4/, 'no 5th "compliance gate" (Gate 4) was added');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. LIVE flow — GDPR on: trigger written, dispatcher is cto-chief, finding attaches
// ─────────────────────────────────────────────────────────────────────

describe('LIVE flow — GDPR on: write trigger → run seam → real Inbox, dispatcher cto-chief', () => {
  it('3. writeComplianceTrigger persists dispatcher cto-chief; seam attaches exactly one real Inbox file', () => {
    const root = projectWith('[gdpr]');
    // A real plan crossing Gate 1 (functional → implementation). We write the
    // trigger into its frontmatter exactly as EC5-s4 does.
    const planPath = seedPlan(
      root,
      'implementation',
      'user-data-flow.md',
      '---\ntitle: user data flow\napproved_by: human\n---\n# User data flow\nbody\n',
    );

    // 1. WRITE the trigger — the emit-only step the Iron Loop performs.
    const writeRes = trigger.writeComplianceTrigger(planPath, root);
    assert.equal(writeRes.ok, true, 'trigger written into the plan frontmatter');
    assert.equal(writeRes.trigger.runGdpr, true, 'gdpr gate is on');
    assert.equal(writeRes.trigger.runEuAiAct, false, 'eu-ai-act gate is off');
    // THE dispatcher proof (in-memory): cto-chief, never iron-loop.
    assert.equal(writeRes.trigger.dispatcher, 'cto-chief', 'dispatcher recorded as cto-chief');
    assert.notEqual(writeRes.trigger.dispatcher, 'iron-loop', 'dispatcher is NEVER iron-loop');

    // 2. READ the trigger back from disk — CTO Chief reads this block to decide.
    const persisted = fs.readFileSync(planPath, 'utf8');
    assert.match(persisted, /compliance_trigger:/, 'trigger block persisted in the plan');
    assert.match(persisted, /dispatcher:\s*cto-chief/, 'persisted dispatcher is cto-chief (readback proof)');
    assert.doesNotMatch(persisted, /dispatcher:\s*iron-loop/, 'persisted dispatcher is NEVER iron-loop');

    // 3. Re-evaluate the trigger the way CTO Chief does before dispatching.
    const evaluated = trigger.evaluateComplianceTrigger(root);
    assert.equal(evaluated.runGdpr, true);
    assert.equal(evaluated.dispatcher, 'cto-chief', 'CTO Chief is the sole dispatcher');

    // 4. CTO Chief dispatches the seam ONLY because runGdpr is true.
    assert.ok(evaluated.runGdpr || evaluated.runEuAiAct, 'gate says a regime is on ⇒ CTO Chief dispatches');
    const res = seam.runComplianceForTransition(root, {
      gdprFindings: [gdprPlanFinding()],
      euAiActFindings: [euAiActPlanFinding()], // profile OFF ⇒ contributes nothing
    });
    assert.equal(res.gdprRan, true, 'the GDPR runner ran');
    assert.equal(res.euAiActRan, false, 'the EU-AI-Act runner did not run (profile off)');
    assert.equal(res.inboxIds.length, 1, 'exactly one Inbox id created');

    // 5. Read the REAL Inbox file back from disk — the human-facing surface.
    const files = listQuestionFiles(root);
    assert.equal(files.length, 1, 'exactly one real Inbox question file landed on disk');
    const body = readAllQuestionBodies(root)[0];
    assert.match(body, /personal data kept longer than necessary/, 'the GDPR finding message is in the real Inbox file');
    assert.match(body, /source_step:\s*compliance-gdpr/, 'the finding routed through the GDPR runner');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. LIVE flow — both on, overlap deduped once (single-write)
// ─────────────────────────────────────────────────────────────────────

describe('LIVE flow — both regimes on: overlapping finding deduped to ONE real Inbox file', () => {
  it('4. deduped === 1 and exactly ONE question file on disk (single-write, not the sum)', () => {
    const root = projectWith('[gdpr, eu-ai-act-high-risk]');
    const planPath = seedPlan(
      root,
      'implementation',
      'model-training.md',
      '---\ntitle: model training\napproved_by: human\n---\n# Model training\n',
    );
    const writeRes = trigger.writeComplianceTrigger(planPath, root);
    assert.equal(writeRes.trigger.runGdpr, true);
    assert.equal(writeRes.trigger.runEuAiAct, true, 'both gates on');
    assert.equal(writeRes.trigger.dispatcher, 'cto-chief', 'dispatcher is cto-chief with both regimes on');

    const res = seam.runComplianceForTransition(root, {
      gdprFindings: [gdprPlanFinding({ kind: 'data-governance', regulation_ref: 'gdpr art. 5(1)(e)' })],
      euAiActFindings: [euAiActPlanFinding({ kind: 'data-governance', regulation_ref: 'eu-ai-act art. 10' })],
    });
    assert.equal(res.gdprRan, true);
    assert.equal(res.euAiActRan, true);
    assert.equal(res.deduped, 1, 'exactly one cross-regime duplicate collapsed');
    assert.equal(res.inboxIds.length, 1, 'exactly ONE Inbox id — no double-write');
    assert.equal(listQuestionFiles(root).length, 1, 'exactly ONE real question file on disk (deduped, not the sum)');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. LIVE flow — empty profiles ⇒ gate-off no-op (no Inbox, no plan mutation)
// ─────────────────────────────────────────────────────────────────────

describe('LIVE flow — gate off: empty profiles is a provable no-op', () => {
  it('5. trigger both false, dispatcher still cto-chief, no Inbox file, plan body byte-unchanged', () => {
    const root = projectWith('[]');
    // A plan whose BODY (outside frontmatter) must not change; the trigger writer
    // only upserts inside the frontmatter, so we compare the body bytes.
    const planBody = '# Sample plan\nsome body content that must not change\n';
    const planPath = seedPlan(
      root,
      'implementation',
      'sample-plan.md',
      `---\ntitle: sample\napproved_by: human\n---\n${planBody}`,
    );

    const evaluated = trigger.evaluateComplianceTrigger(root);
    assert.equal(evaluated.runGdpr, false, 'gdpr gate off');
    assert.equal(evaluated.runEuAiAct, false, 'eu-ai-act gate off');
    assert.equal(evaluated.dispatcher, 'cto-chief', 'dispatcher is cto-chief even when both gates are off');

    // Gate off ⇒ CTO Chief does NOT dispatch the seam. Prove the seam is a no-op
    // even if called: no Inbox write.
    const res = seam.runComplianceForTransition(root, {
      gdprFindings: [gdprPlanFinding()],
      euAiActFindings: [euAiActPlanFinding()],
    });
    assert.deepEqual(res, {
      gdprRan: false, euAiActRan: false, inboxIds: [], letters: [], deduped: 0, droppedFindings: [],
    });
    assert.deepEqual(listQuestionFiles(root), [], 'no real Inbox file written when both gates are off');

    // The plan BODY is byte-for-byte unchanged (the writer touches only the fm,
    // and with the trigger appended the body after the closing --- is identical).
    const after = fs.readFileSync(planPath, 'utf8');
    const bodyAfter = after.slice(after.lastIndexOf('\n---\n') + '\n---\n'.length);
    assert.equal(bodyAfter, planBody, 'the plan body is byte-for-byte unchanged (no-op)');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 6. ADVISORY — plan not moved by the flow
// ─────────────────────────────────────────────────────────────────────

describe('LIVE flow — advisory: a critical finding does NOT move the plan', () => {
  it('6. plan stays in plans/implementation/ (not reverted to functional/, not advanced to todo/); marker unchanged', () => {
    const root = projectWith('[gdpr]');
    const funcDir = path.join(root, 'plans', 'functional');
    const todoDir = path.join(root, 'plans', 'todo');
    fs.mkdirSync(funcDir, { recursive: true });
    fs.mkdirSync(todoDir, { recursive: true });
    const planPath = seedPlan(
      root,
      'implementation',
      'critical-plan.md',
      '---\nstage: implementation\napproved_by: human\n---\n# Critical plan\n',
    );

    // Write the trigger + run the seam with a critical finding.
    trigger.writeComplianceTrigger(planPath, root);
    seam.runComplianceForTransition(root, {
      gdprFindings: [gdprPlanFinding({ severity: 'critical', message: 'critical retention gap' })],
    });

    // Advisory proof: still exactly one plan in implementation/, none elsewhere.
    assert.ok(fs.existsSync(planPath), 'plan still in plans/implementation/');
    assert.deepEqual(fs.readdirSync(funcDir), [], 'nothing moved to plans/functional/ (no auto-revert)');
    assert.deepEqual(fs.readdirSync(todoDir), [], 'nothing moved to plans/todo/ (no auto-advance)');
    // The approval marker is unchanged (still approved_by: human).
    const after = fs.readFileSync(planPath, 'utf8');
    assert.match(after, /approved_by:\s*human/, 'the approval marker is unchanged');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 7. GATE INVARIANT (load-bearing) — the flow adds/weakens no human gate
// ─────────────────────────────────────────────────────────────────────

describe('gate invariant — 4-gate topology intact; the compliance flow moves no plan', () => {
  it('7a. HUMAN_GATES still has exactly the 3 destination keys (4-gate topology intact)', () => {
    // Assert the REAL runtime map (stronger than grepping source text): the
    // hook re-exports GATE_SOURCE from gate-order as HUMAN_GATES (R6-B).
    const { HUMAN_GATES } = require(GATE_HOOK_PATH);
    assert.deepEqual(Object.keys(HUMAN_GATES).sort(), ['done', 'implementation', 'todo'], 'exactly the three gate destinations');
    assert.equal(HUMAN_GATES.implementation, 'functional');
    assert.equal(HUMAN_GATES.todo, 'implementation');
    assert.equal(HUMAN_GATES.done, 'review');
  });

  it('7b. neither the trigger emitter nor the integration seam names a gate key or requires the gate-crossing path', () => {
    const triggerSrc = fs.readFileSync(path.join(REPO_ROOT, 'src', 'lib', 'iron-loop-compliance-trigger.js'), 'utf8');
    const seamSrc = fs.readFileSync(path.join(REPO_ROOT, 'src', 'lib', 'compliance-integration.js'), 'utf8');
    for (const [label, src] of [['trigger', triggerSrc], ['seam', seamSrc]]) {
      assert.doesNotMatch(src, /HUMAN_GATES/, `${label} names no HUMAN_GATES`);
      assert.doesNotMatch(src, /requireReviewGate/, `${label} names no requireReviewGate`);
      assert.doesNotMatch(src, /review_gate/, `${label} names no review_gate`);
      assert.doesNotMatch(src, /require\(['"]\.\.\/hooks\//, `${label} requires no hook`);
      assert.doesNotMatch(src, /require\(['"]\.\/actions['"]\)/, `${label} requires no plan-moving actions module`);
    }
  });
});
