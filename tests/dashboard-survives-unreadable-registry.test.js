/**
 * A REGISTRY READ ERROR CANNOT BLANK THE DASHBOARD.
 *
 * `state.getAgentStatus` called `taskRegistry.load` UNGUARDED. `task-registry.load`
 * fails OPEN on a DATA problem (unparseable / wrong shape / malformed entry) but NOT
 * on an OPERATING-SYSTEM problem: `safeFs.existsSync(p)` at task-registry.js:392 is
 * outside the loader's try, so an `EACCES`/`EIO`/`EISDIR`/`ELOOP` throw propagates.
 * The nearest caller is `buildDashboardTable`, which read the agent status BEFORE the
 * reconcile pass could render its own "could not be read" health line — so an OS-level
 * registry read error threw out of the dashboard builder and the human saw NOTHING.
 * Not a degraded screen: no screen.
 *
 * THE SEAM. The read failure is induced at the REAL source — `safeFs.existsSync` and
 * `safeFs.readFileSync` made to throw `EACCES` for the registry path ONLY, through the
 * shared `safe-fs` module object (safe-fs.js exports plain function properties, and
 * task-registry.js calls them as property accesses). This is precisely the seam
 * tests/dashboard-reconcile-failure.test.js recorded as UNUSABLE because of this very
 * defect: making `existsSync` throw for `tasks.json` also broke `getAgentStatus` and
 * bricked the whole dashboard. That the fixture now passes is the proof the repair is
 * real. Every other path reads real files; only the two `fs` calls for `tasks.json`
 * are replaced, so a permission `chmod` fixture (which would be SKIPPED on some
 * platform — a gate failure under the zero-skipped rule) is not needed.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const safeFs = require('../src/lib/safe-fs');
const state = require('../src/lib/state');
const menuScreens = require('../src/lib/menu-screens');
const agentArea = require('../src/areas/agent');
const pipelineArea = require('../src/areas/pipeline');
const overviewTab = require('../src/tabs/overview');
const actions = require('../src/lib/actions');

const realExistsSync = safeFs.existsSync;
const realReadFileSync = safeFs.readFileSync;
const realStartAgent = actions.startAgent;
const realStopAgent = actions.stopAgent;

const MIN = 60_000;

function ago(ageMs) {
  return new Date(Date.now() - ageMs).toISOString();
}

function task(over = {}) {
  return {
    id: 't1',
    kind: 'implement',
    label: 'a task',
    plan: null,
    status: 'queued',
    agentTaskId: null,
    touches: [],
    gitOp: false,
    blockedBy: [],
    result: null,
    ts: { created: ago(5 * MIN), started: null, cancelRequested: null, done: null },
    ...over
  };
}

function cleanRegistry(tasks) {
  return { version: 1, generation: 0, seq: tasks.length, tasks };
}

let root;
let registryPath;

async function seed(registry) {
  await fs.promises.mkdir(path.join(root, '.ctoc', 'state'), { recursive: true });
  await fs.promises.writeFile(
    registryPath,
    typeof registry === 'string' ? registry : JSON.stringify(registry)
  );
}

/**
 * Make the registry file's `existsSync`/`readFileSync` throw an OS error for that ONE
 * path, delegating every other path to real fs. `message` lets a case inject a long or
 * control-character-laden message to prove the render bounds and strips it.
 */
function breakRegistryReads(message = 'EACCES: permission denied, open tasks.json') {
  const boom = () => {
    const e = new Error(message);
    e.code = 'EACCES';
    return e;
  };
  safeFs.existsSync = (p) => {
    if (p === registryPath) throw boom();
    return realExistsSync(p);
  };
  safeFs.readFileSync = (p, ...rest) => {
    if (p === registryPath) throw boom();
    return realReadFileSync(p, ...rest);
  };
}

/** The one rendered line containing `needle`, or '' when there is none. */
function lineWith(text, needle) {
  return text.split('\n').find((l) => l.includes(needle)) || '';
}

describe('the dashboard survives an unreadable task registry', () => {
  beforeEach(async () => {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ctoc-unreadable-registry-'));
    registryPath = path.join(root, '.ctoc', 'state', 'tasks.json');
  });

  afterEach(async () => {
    safeFs.existsSync = realExistsSync;
    safeFs.readFileSync = realReadFileSync;
    actions.startAgent = realStartAgent;
    actions.stopAgent = realStopAgent;
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  // 1 — THE REASON THE SLICE EXISTS. The human still gets a screen. Today the call
  // throws out of buildDashboardTable and the human sees nothing at all.
  it('the human still gets a screen when the registry cannot be read', async () => {
    await seed(cleanRegistry([task()]));
    breakRegistryReads();

    let text;
    assert.doesNotThrow(() => { text = menuScreens.buildDashboardTable(root); });
    assert.ok(text && text.length > 0);
    assert.match(text, /CTOC v/);
    assert.match(text, /INBOX/);
    assert.match(text, /AGENT/);
  });

  // 2 — the screen says UNKNOWN, not idle.
  it('the AGENT block says UNKNOWN, never idle', async () => {
    await seed(cleanRegistry([task()]));
    breakRegistryReads();

    const text = menuScreens.buildDashboardTable(root);

    assert.match(text, /the agent status is UNKNOWN/);
    assert.doesNotMatch(text, /○ Idle/);
  });

  // 3 — the reason reaches the screen.
  it('the read error reaches the agent line', async () => {
    await seed(cleanRegistry([task()]));
    breakRegistryReads('EACCES: permission denied, open tasks.json');

    const text = menuScreens.buildDashboardTable(root);
    const line = lineWith(text, 'the agent status is UNKNOWN');

    assert.match(line, /EACCES: permission denied, open tasks\.json/);
  });

  // 4 — an unreadable registry is NEVER a checked zero: the reconcile "could not be
  // read" line renders too, so a TASKS view never shows a count with neither the
  // reconcile health line nor the agent line present.
  it('carries the reconcile health line as well as the agent line', async () => {
    await seed(cleanRegistry([task()]));
    breakRegistryReads();

    const text = menuScreens.buildDashboardTable(root);

    assert.match(text, /could not be read \(load-failed\)/);
    assert.match(text, /the agent status is UNKNOWN/);
  });

  // 5 — the two adjacent failures speak in one voice, and the reconcile line (in the
  // TASKS section) leads the agent line (in the AGENT block).
  it('reconcile and agent lines share the register and order correctly', async () => {
    await seed(cleanRegistry([task()]));
    breakRegistryReads();

    const text = menuScreens.buildDashboardTable(root);
    const reconcileLine = lineWith(text, 'could not be read (load-failed)');
    const agentLine = lineWith(text, 'the agent status is UNKNOWN');

    assert.ok(reconcileLine.trimStart().startsWith('⛔'), reconcileLine);
    assert.ok(agentLine.trimStart().startsWith('⛔'), agentLine);
    assert.ok(reconcileLine.trimEnd().endsWith('· view: tasks'), reconcileLine);
    assert.ok(agentLine.trimEnd().endsWith('· view: tasks'), agentLine);

    const reconcileIdx = text.indexOf('could not be read (load-failed)');
    const agentIdx = text.indexOf('the agent status is UNKNOWN');
    assert.ok(reconcileIdx >= 0 && agentIdx >= 0, text);
    assert.ok(reconcileIdx < agentIdx, 'the reconcile line must lead the agent line');
  });

  // 6 — a healthy project renders idle, byte-identically to before.
  it('a healthy readable registry renders idle with no agent fault line', async () => {
    await seed(cleanRegistry([task({ id: 't1', status: 'done', ts: { created: ago(MIN), started: ago(MIN), cancelRequested: null, done: ago(MIN) } })]));

    const text = menuScreens.buildDashboardTable(root);

    assert.match(text, /○ Idle/);
    assert.doesNotMatch(text, /UNKNOWN/);
    assert.doesNotMatch(text, /the agent status is UNKNOWN/);
  });

  // 7 — an active agent still reads active.
  it('an active agent still reads active, with no unreadable field', async () => {
    await seed(cleanRegistry([task({
      id: 't1', kind: 'implement', status: 'running', plan: 'a-live-plan',
      ts: { created: ago(MIN), started: ago(MIN), cancelRequested: null, done: null }
    })]));

    const status = state.getAgentStatus(root);
    assert.equal(status.active, true);
    assert.ok(!('unreadable' in status));

    const text = menuScreens.buildDashboardTable(root);
    assert.match(text, /● Active:/);
  });

  // 8 — the function itself does not throw.
  it('getAgentStatus returns a third state instead of throwing', async () => {
    await seed(cleanRegistry([task()]));
    breakRegistryReads();

    let status;
    assert.doesNotThrow(() => { status = state.getAgentStatus(root); });
    assert.equal(status.active, false);
    assert.equal(typeof status.unreadable, 'string');
    assert.ok(status.unreadable.length > 0);
  });

  // 9 — a long message is bounded.
  it('bounds a very long read-error message on the agent line', async () => {
    await seed(cleanRegistry([task()]));
    const huge = 'x'.repeat(500);
    breakRegistryReads(huge);

    const text = menuScreens.buildDashboardTable(root);
    const line = lineWith(text, 'the agent status is UNKNOWN');

    assert.ok(line.length > 0, text);
    assert.ok(line.length < 300, `agent line was ${line.length} chars`);
    assert.match(line, /…/);
    assert.ok(!line.includes('x'.repeat(200)));
  });

  // 10 — a control character cannot forge a dashboard row.
  it('a control character in the message cannot forge a row', async () => {
    await seed(cleanRegistry([task()]));
    breakRegistryReads('evil\x1b[2Jmessage\nFORGED ROW');

    const text = menuScreens.buildDashboardTable(root);
    const line = lineWith(text, 'the agent status is UNKNOWN');

    assert.ok(line.length > 0, text);
    assert.ok(!text.includes('\x1b'), 'no escape byte may reach the screen');
    assert.match(line, /evil\[2JmessageFORGED ROW/);
  });

  // 11 — the dedicated agent area says Unknown.
  it('the agent area renders Unknown, never idle', async () => {
    await seed(cleanRegistry([task()]));
    breakRegistryReads();

    let out;
    assert.doesNotThrow(() => { out = agentArea.render({ projectPath: root }); });
    assert.match(out, /Unknown/);
    assert.doesNotMatch(out, /○ Idle/);
    assert.doesNotMatch(out, /No active plan/);
  });

  // 12 — `g` refuses to start on an unknown status; startAgent is NOT called.
  it('the g key refuses to start when the status is unknown', async () => {
    await seed(cleanRegistry([task()]));
    breakRegistryReads();

    let startCalls = 0;
    actions.startAgent = () => { startCalls += 1; return { started: true }; };

    const app = { projectPath: root };
    const handled = agentArea.handleKey({ sequence: 'g' }, app);

    assert.equal(handled, true);
    assert.equal(startCalls, 0, 'startAgent must not be called under an unknown status');
    assert.match(app.message, /could not be read/);
    assert.match(app.message, /refus/i);
  });

  // 13 — `x` still requests a stop; if stopAgent throws, the message names the failure
  // and never says the unconditional "Stop requested".
  it('the x key still requests a stop and reports a failure honestly', async () => {
    await seed(cleanRegistry([task()]));
    breakRegistryReads();

    let stopCalls = 0;
    actions.stopAgent = () => {
      stopCalls += 1;
      throw new Error('EACCES: permission denied, open tasks.json');
    };

    const app = { projectPath: root };
    const handled = agentArea.handleKey({ sequence: 'x' }, app);

    assert.equal(handled, true);
    assert.equal(stopCalls, 1, 'stopAgent must be attempted under an unknown status');
    assert.doesNotMatch(app.message, /^Stop requested$/);
    assert.match(app.message, /EACCES/);
  });

  // 14 — the pipeline area says UNKNOWN.
  it('the pipeline area renders UNKNOWN, never idle', async () => {
    await seed(cleanRegistry([task()]));
    breakRegistryReads();

    let out;
    assert.doesNotThrow(() => { out = pipelineArea.render({ projectPath: root }); });
    assert.match(out, /UNKNOWN/);
    assert.doesNotMatch(out, /Agent idle/);
  });

  // 15 — the overview tab says Unknown.
  it('the overview tab renders Unknown, never idle', async () => {
    await seed(cleanRegistry([task()]));
    breakRegistryReads();

    let out;
    assert.doesNotThrow(() => { out = overviewTab.render({ projectPath: root }); });
    assert.match(out, /Unknown/);
    assert.doesNotMatch(out, /○ Idle/);
  });

  // 16 — the Commands screen survives and warns; the option LABEL is unchanged so its
  // actions-map key still resolves, but its DESCRIPTION names the unknown status.
  it('the Commands screen survives and its description names the unknown status', async () => {
    await seed(cleanRegistry([task()]));
    breakRegistryReads();

    let screen;
    assert.doesNotThrow(() => { screen = menuScreens.dashboardCommands(root); });

    const options = screen.ask.questions[0].options;
    const startOpt = options.find((o) => o.label === 'Start agent');
    assert.ok(startOpt, 'the Start agent option (label unchanged) must still be present');
    assert.match(startOpt.description, /could not be read/);
    assert.ok(
      Object.prototype.hasOwnProperty.call(screen.actions, 'Start agent'),
      'the actions map must still key on the unchanged label'
    );
  });

  // 17 — a normal absent detail file stays silent (Change 2 must not false-alarm).
  it('a normal absent agent.json detail file does not set detailUnreadable', async () => {
    await seed(cleanRegistry([task({
      id: 't1', kind: 'implement', status: 'running', plan: 'a-live-plan',
      ts: { created: ago(MIN), started: ago(MIN), cancelRequested: null, done: null }
    })]));
    // No .ctoc/state/agent.json written — its absence is normal on this path.

    const status = state.getAgentStatus(root);

    assert.equal(status.active, true);
    assert.ok(!('detailUnreadable' in status), 'an absent detail file is normal — no alarm');
  });
});
