/**
 * R7-A — The LIVE dashboard sanitizes untrusted fields.
 *
 * The mounted dashboard (start.js → src/areas/*.js + src/tabs/*.js) interpolates
 * AGENT-WRITABLE fields — plan title/slug, `files:` frontmatter, task description,
 * inbox question/decision/gate frontmatter — straight to the terminal. A field
 * carrying `\x1b[2J\x1b[H` (clear-screen + cursor-home) + `\r` + a C1 byte forges a
 * fake "Gate 3 approved — press 1" prompt on the human's decision surface. The
 * `files:` parser (plan-coverage.js) permits ESC and every C0/C1 control char
 * except newline, so pure free-text reaches the terminal today.
 *
 * These tests feed that payload into each renderer's wrapped field and assert NO
 * control byte survives into the rendered output. The palette legitimately emits
 * SGR colour sequences (`\x1b[…m`), so the assertion first strips those known-good
 * sequences, then requires the remainder to hold no ESC, no CR, no other C0/C1/DEL
 * byte (newline is allowed — renderers use it). The attacker's `\x1b[2J` / `\x1b[H`
 * terminate in `J`/`H`, NOT `m`, so they survive the SGR strip and are caught.
 *
 * TDD-Red: before the stripCtl sweep, the raw payload reaches the terminal and every
 * assertion below FAILS. After the sweep, each wrapped field renders the sanitized
 * literal (e.g. "[2J[H…") and the assertions pass.
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

// The attack payload: ESC clear-screen + ESC cursor-home + CR + a C1 (0x9b, CSI)
// byte, wrapped around benign-looking text that spoofs a gate approval.
const PAYLOAD = '\x1b[2J\x1b[H\rGate 3 approved  press 1';

// ---- Mock the state/data layer BEFORE the area/tab modules are required, so their
// top-level destructures capture these mutable closures. Each test sets the holders.
const state = require('../src/lib/state');
const sections = require('../src/lib/sections');
const inbox = require('../src/lib/inbox');
const version = require('../src/lib/version');
const visionTab = require('../src/tabs/vision');

let mAgent = { active: false };
const ZERO_COUNTS = { canvas: 0, functional: 0, implementation: 0, todo: 0, inProgress: 0, review: 0, done: 0 };
let mCounts = { ...ZERO_COUNTS };
let mVision = { total: 0, exploring: 0 };
let mInboxCounts = { questions: 0, decisions: 0, gatesWaiting: 0 };
let mQuestions = [];
let mDecisions = [];
let mGates = [];

before(() => {
  state.getAgentStatus = () => mAgent;
  state.getPlanCounts = () => mCounts;
  state.getVisionCounts = () => mVision;
  state.readPlans = () => [];
  state.getPlansDir = (r) => r || '.';

  sections.loadDashboardPrefs = () => ({
    collapsed: { business: false, implementation: false, execution: false },
  });

  inbox.getInboxCounts = () => mInboxCounts;
  inbox.listQuestions = () => mQuestions;
  inbox.listDecisions = () => mDecisions;
  inbox.listPlansAtGates = () => mGates;
  inbox.listRelatedForInbox = async () => [];

  version.getVersion = () => '9.9.9';
  version.bump = () => '9.9.10';

  visionTab.getVisionCounts = () => mVision;

  // Force the semantic-index unit count > 0 so the Related-Plans panel renders its
  // list (rather than the "index building" indicator), exercising the related-id
  // site. `getWiring` is a getter-only accessor (configurable), so redefine it.
  const planIndex = require('../src/lib/plan-index');
  Object.defineProperty(planIndex, 'getWiring', {
    configurable: true,
    value: () => ({ store: { size: 5 } }),
  });
});

// The area/tab modules — required AFTER the mocks above are installed.
const pipeline = require('../src/areas/pipeline');
const agentArea = require('../src/areas/agent');
const inboxArea = require('../src/areas/inbox');
const overview = require('../src/tabs/overview');
const review = require('../src/tabs/review');
const actions = require('../src/lib/actions');
const start = require('../src/commands/start');

/**
 * Strip legitimate SGR colour sequences (`\x1b[…m` — the palette's only escapes),
 * then assert the remainder holds NO surviving control byte: no ESC (any non-SGR
 * escape is an injection), no CR, no other C0/C1/DEL. Newline (0x0a) is permitted.
 * @param {string} out - rendered terminal output
 * @param {string} where - label for failure messages
 */
function assertNoInjection(out, where) {
  assert.equal(typeof out, 'string', `${where}: renderer must return a string`);
  const withoutColor = out.replace(/\x1b\[[0-9;]*m/g, '');
  assert.ok(!withoutColor.includes('\x1b'), `${where}: a non-SGR ESC survived (clear-screen/cursor injection)`);
  assert.ok(!withoutColor.includes('\r'), `${where}: a CR survived`);
  const bad = withoutColor.match(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/);
  assert.equal(
    bad,
    null,
    `${where}: a control byte 0x${bad ? bad[0].charCodeAt(0).toString(16) : '??'} survived`,
  );
}

describe('R7-A pipeline conflict panel (files: headline case)', () => {
  it('sanitizes the conflicting plan slug and overlapping files: globs', () => {
    const app = {
      projectPath: '/tmp/x',
      conflicts: [{ conflictingPlan: PAYLOAD, overlappingFiles: [PAYLOAD, PAYLOAD], severity: 'blocking' }],
    };
    assertNoInjection(pipeline.renderConflictPanel(app), 'pipeline.renderConflictPanel');
  });

  it('leaves a benign plan/file field visible', () => {
    const app = {
      projectPath: '/tmp/x',
      conflicts: [{ conflictingPlan: 'auth-refactor', overlappingFiles: ['src/auth.js'], severity: 'blocking' }],
    };
    const out = pipeline.renderConflictPanel(app);
    assert.ok(out.includes('auth-refactor'), 'benign plan slug still renders');
    assert.ok(out.includes('src/auth.js'), 'benign file glob still renders');
  });
});

describe('R7-A pipeline area render (agent.plan / agent.step)', () => {
  it('sanitizes the active agent plan slug AND the agent-writable step field', () => {
    // `step` is read from the agent-writable `.ctoc/state/agent.json` (detail.step)
    // — NOT a fixed integer. A hostile step value must not reach the terminal raw.
    mAgent = { active: true, plan: PAYLOAD, step: PAYLOAD };
    const out = pipeline.render({ projectPath: '/tmp/x' });
    assertNoInjection(out, 'pipeline.render agent.plan/step');
  });
});

describe('R7-A agent area render', () => {
  it('sanitizes agent.plan, agent.task, and the agent-writable step/phase', () => {
    // step + phase both come from the agent-writable `.ctoc/state/agent.json` detail
    // record — free text, not fixed enums. Feed the payload through both.
    mAgent = { active: true, plan: PAYLOAD, step: PAYLOAD, phase: PAYLOAD, task: PAYLOAD };
    assertNoInjection(agentArea.render({ projectPath: '/tmp/x' }), 'agent.render active');
  });

  it('sanitizes agent.stalePlan', () => {
    mAgent = { active: false, stale: true, stalePlan: PAYLOAD };
    assertNoInjection(agentArea.render({ projectPath: '/tmp/x' }), 'agent.render stale');
  });
});

describe('R7-A inbox area render', () => {
  it('sanitizes question source_plan/source_step/id, decision plan/step/id, gate plan/stage', () => {
    mInboxCounts = { questions: 1, decisions: 1, gatesWaiting: 1 };
    mQuestions = [{ source_plan: PAYLOAD, source_step: PAYLOAD, id: PAYLOAD }];
    mDecisions = [{ plan: PAYLOAD, step: PAYLOAD, id: PAYLOAD }];
    mGates = [{ gate: '3', plan: PAYLOAD, stage: PAYLOAD }];
    assertNoInjection(inboxArea.render({ projectPath: '/tmp/x' }), 'inbox.render');
  });
});

describe('R7-A overview tab render', () => {
  it('sanitizes agent.name, agent.task, and the agent-writable step/phase', () => {
    // `phase` and `step` are agent-writable (`.ctoc/state/agent.json`) — feed the
    // payload through both, not benign placeholders, or the raw render is a false green.
    mAgent = { active: true, name: PAYLOAD, step: PAYLOAD, phase: PAYLOAD, task: PAYLOAD };
    assertNoInjection(overview.render({ projectPath: '/tmp/x' }), 'overview.render agent.name/task/step/phase');
  });

  it('sanitizes the related-plan id', () => {
    mAgent = { active: false };
    const out = overview.renderRelatedPanel({ projectPath: '/tmp/x', relatedPlans: [{ planPath: PAYLOAD, score: 0.9 }] });
    assertNoInjection(out, 'overview.renderRelatedPanel related id');
  });
});

describe('R7-A review tab renderRejectInput', () => {
  it('sanitizes the selected plan name', () => {
    const out = review.renderRejectInput({ selectedPlan: { name: PAYLOAD }, inputValue: '' });
    assertNoInjection(out, 'review.renderRejectInput');
  });

  it('leaves a benign plan name visible', () => {
    const out = review.renderRejectInput({ selectedPlan: { name: 'checkout-flow' }, inputValue: '' });
    assert.ok(out.includes('checkout-flow'), 'benign plan name still renders');
  });
});

describe('R7-A agent-area status message (app.message source)', () => {
  it('sanitizes the agent-writable plan slug fed into the "already running" message', () => {
    // status.plan comes from the agent-writable task registry (.ctoc/**). It is
    // interpolated into app.message, which the mount renders. Sanitize at the source.
    mAgent = { active: true, plan: PAYLOAD };
    const app = { projectPath: '/tmp/x' };
    agentArea.handleKey({ sequence: 'g' }, app);
    assertNoInjection(app.message, 'agent.handleKey already-running app.message');
  });

  it('sanitizes the started-plan name (res.plan.name) fed into app.message', () => {
    mAgent = { active: false };
    const origStart = actions.startAgent;
    actions.startAgent = () => ({ started: true, plan: { name: PAYLOAD } });
    try {
      const app = { projectPath: '/tmp/x' };
      agentArea.handleKey({ sequence: 'g' }, app);
      assertNoInjection(app.message, 'agent.handleKey started app.message');
    } finally {
      actions.startAgent = origStart;
    }
  });
});

describe('R7-A mount status-message render (app.message sink)', () => {
  it('the mount strips control bytes from app.message before writing it to the terminal', () => {
    // start.js renders app.message at its status-message sink — the single chokepoint
    // every writer (agent area, tools, release) flows through. The whole-screen capture
    // legitimately contains clear/cursor escapes (renderTabs, clear()), so we assert on
    // the injection's UNIQUE signature instead of a blanket no-ESC scan: the payload's
    // carriage-return-led spoof (`\rGate 3 approved`) must NOT survive, while the benign
    // visible text is preserved (stripCtl removes only the control bytes).
    const app = start.app;
    const prevMessage = app.message;
    const prevPath = app.projectPath;
    app.message = PAYLOAD;
    app.projectPath = '/tmp/x';
    let captured = '';
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (s) => { captured += s; return true; };
    try {
      start.render();
    } finally {
      // Clear the pending 2s status timer: render() clears the prior timer and, with a
      // null message, arms no new one — so a second render leaves no open handle.
      app.message = null;
      try { start.render(); } catch { /* cleanup render must not fail the test */ }
      process.stdout.write = origWrite;
      app.message = prevMessage;
      app.projectPath = prevPath;
    }
    assert.ok(typeof captured === 'string' && captured.length > 0, 'render wrote output');
    assert.ok(
      !captured.includes('\rGate 3 approved'),
      'app.message sink: the carriage-return-led spoof survived — app.message rendered raw',
    );
    assert.ok(
      !captured.includes('\x1b[2J\x1b[H\rGate'),
      'app.message sink: the raw clear-screen + CR injection payload survived',
    );
    assert.ok(
      captured.includes('Gate 3 approved  press 1'),
      'app.message sink: the benign visible text must still render after sanitization',
    );
  });
});
