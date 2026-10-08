'use strict';

/**
 * Plans cross on their evidence and the work keeps moving (slice 2 of
 * `ctoc-keeps-working-and-asks-only-what-matters`).
 *
 * Every case drives the REAL functions in a temporary project: real plan files, the real
 * approval ledger, the real task registry, the real answers log and the real menu router.
 * Nothing in CTOC is mocked; the one loader patch (case 18) makes the question module
 * unloadable, which is a failure the writer must survive honestly.
 *
 * Case numbers are the plan's test plan.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');

const menuScreens = require('../src/lib/menu-screens.js');
const streamingGate = require('../src/lib/streaming-gate.js');
const precompute = require('../src/lib/streaming-precompute.js');
const taskRegistry = require('../src/lib/task-registry.js');
const ledger = require('../src/lib/approval-ledger.js');
const residency = require('../src/lib/approval-residency.js');
const actions = require('../src/lib/actions.js');
const { loopBDirective } = require('../src/lib/loop-b-driver.js');
const { verifyEvidencePath } = require('../src/lib/step-13-verify.js');

const { route } = menuScreens;
const PRECOMPUTE_PATH = require.resolve('../src/lib/streaming-precompute.js');

const STAGES = ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
const sandboxes = [];
let counter = 0;

afterEach(() => {
  while (sandboxes.length) fs.rmSync(sandboxes.pop(), { recursive: true, force: true });
});

function makeSandbox() {
  const root = path.join(os.tmpdir(), `ctoc-keep-moving-${process.pid}-${Date.now()}-${counter++}`);
  for (const stage of STAGES) fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
  sandboxes.push(root);
  return root;
}

const planPathOf = (root, ref) => path.join(root, 'plans', ...ref.split('/'));
const exists = (root, ref) => fs.existsSync(planPathOf(root, ref));

function writePlan(root, ref, body) {
  const p = planPathOf(root, ref);
  fs.writeFileSync(p, body);
  return p;
}

/** A functional plan that passes validateFunctionalToImpl. */
function functionalBody(title, extra = '') {
  return `---\ntitle: ${title}\n---\n\n# ${title}\n\n## Problem Statement\nThe thing is broken.${extra}\n\n`
    + '## Acceptance Criteria\n- [ ] the thing works\n\n## Scope\nThe module.\n';
}

/** An implementation slice valid for the build queue; `files` empty means no `files:` key. */
function implBody(title, files = ['src/app.js'], extra = '') {
  const fl = files.length ? `files:\n${files.map((f) => `  - ${f}`).join('\n')}\n` : '';
  return `---\niron_loop: true\ntitle: ${title}\n${fl}---\n\n# ${title}\n\n## Implementation\nBody.${extra}\n`;
}

const STEPS = [[8, 'TEST'], [9, 'PREPARE'], [10, 'IMPLEMENT'], [11, 'REVIEW'], [12, 'OPTIMIZE'],
  [13, 'SECURE'], [14, 'VERIFY'], [15, 'DOCUMENT'], [16, 'FINAL-REVIEW']];

/** A built plan in review: every required step checked. */
function reviewBody(title) {
  let out = `---\ntitle: ${title}\n---\n\n# ${title}\n\nSome descriptive prose.\n\n## Execution Plan\n\n`;
  for (const [n, name] of STEPS) out += `### Step ${n}: ${name}\n- [x] ${name.toLowerCase()} work performed\n\n`;
  return out;
}

const NOW = Date.now();

/**
 * A review plan that can finish on its evidence: steps checked, plan time pinned a minute
 * ago, a passing check record recorded now, and a ledger entry into `todo`.
 */
function seedBuilt(root, slug, { record = 'pass', admitted = true } = {}) {
  const ref = `review/${slug}.md`;
  const p = writePlan(root, ref, reviewBody(`${slug} built feature`));
  fs.utimesSync(p, new Date(NOW - 60000), new Date(NOW - 60000));
  if (record) {
    const ev = verifyEvidencePath(root, slug);
    fs.mkdirSync(path.dirname(ev), { recursive: true });
    fs.writeFileSync(ev, JSON.stringify({
      planSlug: slug,
      timestamp: new Date(record === 'stale' ? NOW - 120000 : NOW).toISOString(),
      passed: record !== 'fail',
      method: 'fallback-direct',
      checks: { tests: { ran: true, passed: record !== 'fail', coverage: 99.5, coverageFloor: 99, skipped: 0 } },
      errors: record === 'fail' ? ['1 failing test(s)'] : [],
      summary: 'all checks passed',
    }));
  }
  if (admitted) {
    ledger.writeEntry(slug, {
      content: fs.readFileSync(p, 'utf8'), stage_from: 'implementation', stage_to: 'todo',
    }, root);
  }
  return { ref, path: p };
}

const CLASSIFIED = Object.freeze({ by: 'gate-critic', at: 1786000000000 });
const ATTESTATION = Object.freeze({
  generated_by: 'gate-critic',
  generated_at: 1786000000000,
  lenses: Object.fromEntries(['premortem', 'devils-advocate', 'red-team', 'advocate']
    .map((l) => [l, { state: 'clean-pass', coverage: 'full', findings: 0 }])),
});

/**
 * The answer digest, derived here independently of the module: sha256 of
 * JSON [prompt, [[key, label], …] by key, [recommended keys] sorted], every text NFKC-folded,
 * accents removed, control characters stripped, trimmed, lower-cased.
 */
function digestOf(q) {
  const ident = (t) => t.normalize('NFKC').normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim().toLowerCase();
  const pairs = q.options.map((o) => [o.key, ident(o.label)]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const recommended = q.options.filter((o) => o.recommended === true).map((o) => o.key).sort();
  return crypto.createHash('sha256').update(JSON.stringify([ident(q.prompt), pairs, recommended])).digest('hex');
}

function fork(id, prompt = 'Which database engine?', labels = ['Postgres', 'SQLite'], topic = 'technology-stack') {
  return {
    id, prompt, critical: false, important: false, topic,
    options: labels.map((label, i) => ({ key: String(i + 1), label, ...(i === 0 ? { recommended: true } : {}) })),
  };
}

function detail(id, prompt, labels) {
  return fork(id, prompt, labels, 'detail');
}

function ruling(id, verdict) {
  const options = {
    hold: [['Hold until the red-team critique runs', true], ['Approve x across the gate', false]],
    approve: [['Approve x across the gate', true], ['Hold — I want another look first', false]],
    reject: [['Send x back for rework', true], ['Approve x across the gate', false]],
  }[verdict];
  return {
    id,
    prompt: `Lens verdict: ${verdict.toUpperCase()}. Rule now.`,
    critical: verdict === 'reject',
    important: verdict === 'hold',
    options: options.map(([label, rec], i) => ({ key: String(i + 1), label, ...(rec ? { recommended: true } : {}) })),
  };
}

/** Write the live questions file stamped with the plan's own modification time. */
function writeQuestions(root, ref, questions, { classified = true, attested = false, stamp } = {}) {
  const at = stamp !== undefined ? stamp : fs.statSync(planPathOf(root, ref)).mtimeMs;
  const res = precompute.writePlanQuestions(root, ref, questions, at,
    attested ? ATTESTATION : undefined, classified ? CLASSIFIED : undefined);
  assert.equal(res.ok, true, `fixture: questions for ${ref} were written (${(res.errors || []).join('; ')})`);
  return at;
}

/** Drop a file in the waiting folder, as the gate critic does. */
function dropPending(root, ref, questions, classification = CLASSIFIED, extra = {}) {
  const p = precompute.pendingQuestionsPath(root, ref);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ ref, questions, ...(classification ? { classification } : {}), ...extra }));
}

const ANSWERS = (root) => path.join(root, '.ctoc', 'streaming', 'answers.jsonl');
const answersRaw = (root) => (fs.existsSync(ANSWERS(root)) ? fs.readFileSync(ANSWERS(root), 'utf8') : '');
const answers = (root) => answersRaw(root).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));

/** Append a hand-written answers-log line (the reader's input, not the writer under test). */
function appendLine(root, entry) {
  fs.mkdirSync(path.dirname(ANSWERS(root)), { recursive: true });
  fs.appendFileSync(ANSWERS(root), `${JSON.stringify(entry)}\n`);
}

/** Run a screen action the way the session's shell does: single quotes delimit a word. */
function runAction(root, action) {
  const tokens = [];
  let cur = '';
  let inTok = false;
  let quoted = false;
  for (const ch of String(action)) {
    if (quoted) {
      if (ch === "'") quoted = false; else cur += ch;
    } else if (ch === "'") {
      quoted = true; inTok = true;
    } else if (ch === ' ') {
      if (inTok) tokens.push(cur);
      cur = ''; inTok = false;
    } else {
      cur += ch; inTok = true;
    }
  }
  if (inTok) tokens.push(cur);
  return route(tokens, root);
}

const labelsOf = (screen) => screen.ask.questions[0].options.map((o) => o.label);
const promptOf = (screen) => screen.ask.questions[0].question;
const tasks = (root) => taskRegistry.load(root).tasks;
const registryFile = (root) => path.join(root, '.ctoc', 'state', 'tasks.json');

function withBrokenPrecompute(fn) {
  const origLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    let resolved = null;
    try { resolved = Module._resolveFilename(request, parent, isMain); } catch { /* not resolvable */ }
    if (resolved === PRECOMPUTE_PATH) throw new Error('SIMULATED streaming-precompute load failure');
    return origLoad.apply(this, arguments);
  };
  try { return fn(); } finally { Module._load = origLoad; }
}

/** Start and finish a task through the real router (a registry-only completion). */
function finishTask(root, id) {
  route(['menu', 'task', 'start', id], root);
  return route(['menu', 'task', 'complete', id], root);
}

// ─────────────────────────────────────────────────────────────────────────────
describe('crossings on evidence and the continuation (cases 1–13)', () => {
  it('case 1 — a classified file of details crosses on its own, records the defaults, and queues the planner', () => {
    const root = makeSandbox();
    const ref = 'functional/c1.md';
    writePlan(root, ref, functionalBody('Search by title'));
    writeQuestions(root, ref, [
      { ...detail('q10-name', 'What is the button called?', ['Short name', 'Long name']), important: true },
      detail('q11-color', 'Which colour?', ['Blue', 'Red']),
    ]);

    const cont = menuScreens.continueAfterCrossing(root);

    assert.equal(exists(root, ref), false);
    assert.equal(exists(root, 'implementation/c1.md'), true, 'the plan moved into implementation');
    const entry = ledger.readEntry('c1', root);
    assert.equal(entry.advanced_by, 'sufficiency');
    assert.equal(Object.prototype.hasOwnProperty.call(entry, 'approved_by'), false, 'never recorded as his approval');
    const text = fs.readFileSync(planPathOf(root, 'implementation/c1.md'), 'utf8');
    assert.match(text, /## Decisions Taken Under Ambiguity\n\nDecided by the recommended option when this plan moved on; none of these needed the human\.\n/);
    assert.match(text, /- What is the button called\? — Short name \(question q10-name\)/);
    assert.match(text, /- Which colour\? — Blue \(question q11-color\)/);
    assert.equal(residency.classifyResidency(planPathOf(root, 'implementation/c1.md'), 'implementation', root).accepted, true,
      'the appended decisions leave the crossing record valid');
    const planTask = tasks(root).find((t) => t.kind === 'plan' && t.plan === 'c1');
    assert.ok(planTask, 'a planner task was queued');
    assert.ok(cont.promote.some((t) => t.id === planTask.id), 'and it is returned for the session to launch');
    assert.ok(cont.crossed.some((c) => c.ref === 'implementation/c1.md' && c.toStage === 'implementation'));
  });

  it('case 2 — a weighty question stops the plan and is asked before the detail before it', () => {
    const root = makeSandbox();
    const ref = 'functional/c2.md';
    writePlan(root, ref, functionalBody('Billing export'));
    writeQuestions(root, ref, [detail('q10-color', 'Which colour?', ['Blue', 'Red']), fork('q11-db')]);

    menuScreens.continueAfterCrossing(root);

    assert.equal(exists(root, ref), true, 'the weighty question holds the plan');
    assert.equal(promptOf(streamingGate.streamingGateScreen(root)), 'Which database engine?');
  });

  it('case 3 — a hold holds; released and answered, the plan moves and its planner is returned', () => {
    const root = makeSandbox();
    const ref = 'functional/c3.md';
    writePlan(root, ref, functionalBody('Audit trail'));
    writeQuestions(root, ref, [fork('q10-db')]);

    const held = route(['stream', 'answer', ref, 'q10-db', 'hold'], root);
    assert.match(held.text, /You are holding c3\.md/);
    assert.equal(exists(root, ref), true);

    route(['stream', 'answer', ref, 'ctoc-hold', 'release', precompute.HOLD.digest], root);
    const screen = route(['plan', ref], root);
    const answered = runAction(root, screen.actions['Postgres']);

    assert.equal(exists(root, 'implementation/c3.md'), true, 'the answer moved the plan');
    const planTask = tasks(root).find((t) => t.kind === 'plan' && t.plan === 'c3');
    assert.ok(planTask);
    assert.ok(Array.isArray(answered.promote) && answered.promote.some((t) => t.id === planTask.id));
  });

  it('case 4 — a finished planner task with --continue moves a classified slice to todo and starts it', () => {
    const root = makeSandbox();
    const ref = 'implementation/c4.md';
    writePlan(root, ref, implBody('Session store', ['src/c4.js']));
    dropPending(root, ref, []);
    const add = route(['menu', 'task', 'add', 'plan', 'c4'], root);
    route(['menu', 'task', 'start', add.taskId], root);

    const res = route(['menu', 'task', 'complete', add.taskId, '--continue'], root);

    assert.equal(res.ok, true);
    assert.equal(exists(root, 'in-progress/c4.md'), true, 'the slice moved to todo and on into building');
    const impl = res.promote.find((t) => t.kind === 'implement' && t.plan === 'c4');
    assert.ok(impl, 'the claimed build task is returned for the session to launch');
    assert.deepEqual(impl.touches, ['src/c4.js', 'plans/todo/c4.md'], 'its files, plus the plan itself as every build task carries');
    assert.equal(tasks(root).some((t) => t.kind === 'classify'), false, 'a classified file needs no classification');
    assert.match(res.text, /· moved on: Session store/);
    assert.match(res.text, /· started building: Session store/);

    // The session launches the claimed build and stamps it with the harness agent id.
    const stamped = route(['menu', 'task', 'start', impl.id, '--agent-id', 'agent-c4'], root);
    assert.equal(stamped.ok, true, JSON.stringify(stamped));
    const claimed = () => tasks(root).find((t) => t.id === impl.id);
    assert.equal(claimed().status, 'running');
    assert.equal(claimed().agentTaskId, 'agent-c4');
    // A second stamp is refused: one build, one agent.
    const again = route(['menu', 'task', 'start', impl.id, '--agent-id', 'agent-other'], root);
    assert.equal(again.ok, false);
    assert.equal(claimed().agentTaskId, 'agent-c4');
    // A running task cannot be "started" without an agent id to stamp.
    const add2 = route(['menu', 'task', 'add', 'plan', 'other'], root);
    route(['menu', 'task', 'start', add2.taskId], root);
    assert.equal(route(['menu', 'task', 'start', add2.taskId], root).ok, false);
  });

  it('case 5 — a requested stop is honoured: nothing starts', () => {
    const root = makeSandbox();
    const ref = 'implementation/c5.md';
    writePlan(root, ref, implBody('Rate limits', ['src/c5.js']));
    dropPending(root, ref, []);
    actions.stopAgent(root);
    const add = route(['menu', 'task', 'add', 'plan', 'c5'], root);
    route(['menu', 'task', 'start', add.taskId], root);

    const res = route(['menu', 'task', 'complete', add.taskId, '--continue'], root);

    assert.equal(exists(root, 'todo/c5.md'), true);
    assert.equal(exists(root, 'in-progress/c5.md'), false);
    assert.equal(res.promote.some((t) => t.kind === 'implement'), false);
  });

  it('case 6 — a built plan with a passing record and a recorded admission finishes on its evidence', () => {
    const root = makeSandbox();
    seedBuilt(root, 'c6');

    const cont = menuScreens.continueAfterCrossing(root);

    const done = planPathOf(root, 'done/c6.md');
    assert.equal(fs.existsSync(done), true);
    const entry = ledger.readEntry('c6', root);
    assert.equal(entry.advanced_by, 'pipeline');
    assert.equal(Object.prototype.hasOwnProperty.call(entry, 'approved_by'), false);
    assert.match(entry.evidence, /^evidence: review→done — checks passed, recorded \S+ in \.ctoc\/state\/verify\/c6\.json \(all checks passed\); /);
    assert.match(entry.evidence, /coverage 99\.5% against a floor of 99%, 0 skipped/);
    assert.match(entry.evidence, /including REVIEW, SECURE and FINAL-REVIEW \(checked by the build itself\)/);
    assert.match(entry.evidence, /questions: none were stored; crossed on evidence, not approved by the human$/);
    const verdict = residency.classifyResidency(done, 'done', root);
    assert.equal(verdict.accepted, true);
    assert.equal(verdict.kind, 'pipeline');
    assert.ok(cont.crossed.some((c) => c.ref === 'done/c6.md' && c.toStage === 'done'));
  });

  it('case 7 — built plans that must stay in review', () => {
    const root = makeSandbox();
    seedBuilt(root, 'fail', { record: 'fail' });
    seedBuilt(root, 'stale', { record: 'stale' });
    seedBuilt(root, 'none', { record: null });
    seedBuilt(root, 'unadmitted', { admitted: false });
    const sec = seedBuilt(root, 'secq');
    writeQuestions(root, sec.ref, [fork('q10-sess', 'How long may a session stay idle?', ['15 minutes', '8 hours'], 'security-posture')]);
    const emptyAuthor = seedBuilt(root, 'emptyauthor');
    writeQuestions(root, emptyAuthor.ref, [], { classified: false });
    const answeredAuthor = seedBuilt(root, 'answeredauthor');
    const q = detail('q10-label', 'Label text?', ['Save', 'Store']);
    const stamp = writeQuestions(root, answeredAuthor.ref, [q], { classified: false });
    appendLine(root, { ts: new Date().toISOString(), ref: answeredAuthor.ref, questionId: 'q10-label', optionKey: '1', planMtimeMs: stamp, questionDigest: digestOf(q) });

    const cont = menuScreens.continueAfterCrossing(root);

    for (const slug of ['fail', 'stale', 'none', 'unadmitted', 'secq', 'emptyauthor', 'answeredauthor']) {
      assert.equal(exists(root, `review/${slug}.md`), true, `${slug} stays in review`);
      assert.equal(exists(root, `done/${slug}.md`), false, `${slug} is not done`);
      const e = ledger.readEntry(slug, root);
      assert.notEqual(e && e.stage_to, 'done', `${slug} has no entry into done`);
    }
    assert.equal(cont.crossed.length, 0);
  });

  it('case 8 — a same-named plan already in done: the move fails, the admission record is restored, the plan stays', () => {
    const root = makeSandbox();
    seedBuilt(root, 'c8');
    const before = fs.readFileSync(ledger.ledgerPath('c8', root), 'utf8');
    writePlan(root, 'done/c8.md', '# another plan with the same name\n\nBody.\n');

    menuScreens.continueAfterCrossing(root);

    assert.equal(exists(root, 'review/c8.md'), true);
    assert.equal(fs.readFileSync(planPathOf(root, 'done/c8.md'), 'utf8'), '# another plan with the same name\n\nBody.\n');
    assert.equal(fs.readFileSync(ledger.ledgerPath('c8', root), 'utf8'), before, 'no entry into done is left behind');
  });

  it('case 8b — when the admission record cannot be restored it is removed, so no record names done for a plan in review', (t) => {
    const root = makeSandbox();
    seedBuilt(root, 'c8b');
    writePlan(root, 'done/c8b.md', '# another plan with the same name\n\nBody.\n');
    const safeFs = require('../src/lib/safe-fs.js');
    const real = safeFs.writeFileSync;
    const ledgerFile = ledger.ledgerPath('c8b', root);
    t.mock.method(safeFs, 'writeFileSync', (target, ...rest) => {
      if (path.resolve(String(target)) === path.resolve(ledgerFile)) throw new Error('injected restore failure');
      return real(target, ...rest);
    });

    menuScreens.continueAfterCrossing(root);

    assert.equal(exists(root, 'review/c8b.md'), true);
    assert.equal(ledger.readEntry('c8b', root), null, 'neither restored nor left naming done: removed');
  });

  it('case 9 — with deployment enabled a finished plan is recorded deploy-ready; nothing deploys', () => {
    const root = makeSandbox();
    fs.writeFileSync(path.join(root, '.ctoc', 'settings.json'), JSON.stringify({ deployment: { enabled: true } }));
    seedBuilt(root, 'c9');

    menuScreens.continueAfterCrossing(root);

    assert.equal(exists(root, 'done/c9.md'), true);
    const notices = JSON.parse(fs.readFileSync(path.join(root, '.ctoc', 'logs', 'deploy-ready.json'), 'utf8'));
    assert.deepEqual(notices.map((n) => [n.plan, n.status]), [['c9.md', 'deploy-ready']]);
    assert.equal(fs.existsSync(path.join(root, '.ctoc', 'deployments')), false, 'no deployment ran');
  });

  it('case 10 — guard: completing a task WITHOUT --continue returns today\'s shape and crosses nothing', () => {
    const root = makeSandbox();
    const ref = 'functional/c10.md';
    writePlan(root, ref, functionalBody('Exports'));
    writeQuestions(root, ref, [detail('q10-color', 'Which colour?', ['Blue', 'Red'])]);
    seedBuilt(root, 'c10b');
    const add = route(['menu', 'task', 'add', 'plan', 'c10'], root);
    route(['menu', 'task', 'start', add.taskId], root);

    const res = route(['menu', 'task', 'complete', add.taskId], root);

    assert.deepEqual(Object.keys(res), ['ok', 'taskId', 'status', 'text', 'completion', 'promote']);
    assert.equal(res.text, `Task ${add.taskId} → done`);
    assert.equal(exists(root, ref), true);
    assert.equal(exists(root, 'review/c10b.md'), true);
  });

  it('case 11 — idempotent: a second continuation crosses nothing, writes no second line, queues no second planner', () => {
    const root = makeSandbox();
    const ref = 'functional/c11.md';
    writePlan(root, ref, functionalBody('Imports'));
    writeQuestions(root, ref, [detail('q10-color', 'Which colour?', ['Blue', 'Red'])]);

    menuScreens.continueAfterCrossing(root);
    const second = menuScreens.continueAfterCrossing(root);

    assert.equal(second.crossed.length, 0);
    const text = fs.readFileSync(planPathOf(root, 'implementation/c11.md'), 'utf8');
    assert.equal(text.split('(question q10-color)').length - 1, 1);
    assert.equal(tasks(root).filter((t) => t.kind === 'plan' && t.plan === 'c11').length, 1);
  });

  it('case 12 — the build agent appending its decisions leaves the admission record valid', () => {
    const root = makeSandbox();
    const ref = 'implementation/c12.md';
    writePlan(root, ref, implBody('Webhooks', ['src/c12.js']));
    dropPending(root, ref, []);
    menuScreens.continueAfterCrossing(root);
    const building = planPathOf(root, 'in-progress/c12.md');
    assert.equal(fs.existsSync(building), true);

    fs.appendFileSync(building, '\n## Decisions Taken Under Ambiguity\n\n- the executor chose a retry count of three\n');

    assert.equal(residency.classifyResidency(building, 'todo', root).accepted, true);
  });

  it('case 13 — guard: opening the menu or reading the session status never finishes a built plan', () => {
    const root = makeSandbox();
    seedBuilt(root, 'c13');
    const before = fs.readFileSync(ledger.ledgerPath('c13', root), 'utf8');

    streamingGate.streamingGateScreen(root);
    loopBDirective(root);

    assert.equal(exists(root, 'review/c13.md'), true);
    assert.equal(fs.readFileSync(ledger.ledgerPath('c13', root), 'utf8'), before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("the owner's Hold, written and released by CTOC (cases 14–23)", () => {
  function heldFixture() {
    const root = makeSandbox();
    const ref = 'functional/x.md';
    writePlan(root, ref, functionalBody('Customer import'));
    const q = fork('q10-db');
    writeQuestions(root, ref, [q]);
    return { root, ref, q };
  }

  it('case 14 — every agent question carries CTOC\'s Hold option; every answer action is quoted and carries the digest', () => {
    const { root, ref, q } = heldFixture();
    const screen = streamingGate.streamingGateScreen(root);
    assert.deepEqual(labelsOf(screen), ['Postgres', 'SQLite', 'Hold this plan', 'Skip for now']);
    assert.equal(screen.actions['Postgres'], `stream answer ${ref} 'q10-db' '1' '${digestOf(q)}'`);
    assert.equal(screen.actions['Hold this plan'], `stream answer ${ref} 'q10-db' 'hold'`);
    const hold = screen.ask.questions[0].options.find((o) => o.label === 'Hold this plan');
    assert.equal(hold.description, precompute.HOLD.hold.description);

    const planScreen = route(['plan', ref], root);
    assert.ok(planScreen.ask.questions[0].options.some((o) => o.label === 'Hold this plan'));
    assert.equal(planScreen.actions['Hold this plan'], `stream answer ${ref} 'q10-db' 'hold'`);

    const root3 = makeSandbox();
    writePlan(root3, ref, functionalBody('Customer import'));
    writeQuestions(root3, ref, [fork('q10-db', 'Which database engine?', ['Postgres', 'SQLite', 'MySQL'])]);
    const three = streamingGate.streamingGateScreen(root3);
    assert.deepEqual(labelsOf(three), ['Postgres', 'SQLite', 'MySQL', 'Hold this plan']);
    assert.equal(three.actions['Skip for now'], `stream skip ${ref}`);
    assert.equal(three.actions['Open the plan'], `plan ${ref}`);
  });

  it("case 15 — a question file may not use CTOC's own hold labels, on write or on read", () => {
    const root = makeSandbox();
    const ref = 'functional/x.md';
    const planPath = writePlan(root, ref, functionalBody('Customer import'));
    const stamp = fs.statSync(planPath).mtimeMs;
    for (const label of ['hold this plan', '  Hold This Plan  ', 'Hold this plan\u0007', 'Release the hold', 'Keep holding this plan']) {
      const res = precompute.writePlanQuestions(root, ref, [fork('q10-db', 'Which database engine?', ['Postgres', label])], stamp);
      assert.equal(res.ok, false, `refused: ${JSON.stringify(label)}`);
      assert.ok(res.errors.some((e) => /one of CTOC's own hold options/.test(e)), res.errors.join('; '));
    }
    const live = precompute.questionsPath(root, ref);
    fs.mkdirSync(path.dirname(live), { recursive: true });
    fs.writeFileSync(live, JSON.stringify({ ref, planMtimeMs: stamp, questions: [fork('q10-db', 'Which database engine?', ['Postgres', 'Release the hold'])] }));
    assert.equal(precompute.planQuestionsStatus(root, ref).status, 'invalid');
  });

  it('case 16 — a hold is recorded under CTOC\'s own id, never as an answer, and the screen moves past the plan', () => {
    const { root, ref } = heldFixture();
    writePlan(root, 'functional/y.md', '# Second plan waiting\n\nJust a body, no required sections.\n');

    const screen = route(['stream', 'answer', ref, 'q10-db', 'hold'], root);

    const lines = answers(root);
    assert.equal(lines.length, 1);
    assert.deepEqual(
      { questionId: lines[0].questionId, optionKey: lines[0].optionKey, holds: lines[0].holds, heldOn: lines[0].heldOn, questionDigest: lines[0].questionDigest },
      { questionId: 'ctoc-hold', optionKey: 'hold', holds: true, heldOn: 'q10-db', questionDigest: precompute.HOLD.digest },
    );
    assert.equal(exists(root, ref), true);
    const v = precompute.hasEnoughInformation(root, ref);
    assert.equal(v.reason, 'held');
    assert.deepEqual(v.blocking.map((b) => b.id), ['ctoc-hold']);
    assert.match(screen.text, /You are holding x\.md\. Nothing moves it until you release the hold\./);
    assert.match(screen.text, /Second plan waiting/, 'the next pending plan is shown');
    assert.doesNotMatch(screen.text, /Which database engine\?/);
  });

  it('case 17 — keep and release; once released his answer moves the plan', () => {
    const { root, ref, q } = heldFixture();
    route(['stream', 'answer', ref, 'q10-db', 'hold'], root);

    route(['stream', 'answer', ref, 'ctoc-hold', 'hold'], root);
    let last = answers(root).at(-1);
    assert.equal(last.holds, true);
    assert.equal(last.questionDigest, precompute.HOLD.digest);
    assert.equal(precompute.hasEnoughInformation(root, ref).reason, 'held');

    const heldScreen = route(['plan', ref], root);
    assert.equal(heldScreen.actions['Release the hold'], `stream answer ${ref} 'ctoc-hold' 'release' '${precompute.HOLD.digest}'`);
    runAction(root, heldScreen.actions['Release the hold']);
    last = answers(root).at(-1);
    assert.equal(last.holds, false);
    assert.equal(last.questionDigest, precompute.HOLD.digest);

    const asked = route(['plan', ref], root);
    assert.equal(promptOf(asked), 'Which database engine?');
    const moved = runAction(root, asked.actions['Postgres']);
    last = answers(root).at(-1);
    assert.equal(last.holds, false);
    assert.equal(last.questionDigest, digestOf(q));
    assert.equal(exists(root, 'implementation/x.md'), true);
    assert.ok(moved.promote.some((t) => t.kind === 'plan' && t.plan === 'x'));
  });

  it('case 18 — every answer that cannot be checked is refused, nothing is written, and a hold stays', () => {
    const { root, ref, q } = heldFixture();
    const D = digestOf(q);
    writePlan(root, 'functional/z.md', functionalBody('No questions yet'));
    const staleRef = 'functional/s.md';
    const sp = writePlan(root, staleRef, functionalBody('Stale questions'));
    writeQuestions(root, staleRef, [fork('q10-db')]);
    fs.utimesSync(sp, new Date(NOW + 60000), new Date(NOW + 60000));
    route(['stream', 'answer', ref, 'q10-db', 'hold'], root);
    const before = answersRaw(root);

    const refused = [
      ['stream', 'answer', ref, 'q10-db', '4', D],
      ['stream', 'answer', ref, 'q10-db', 'x', D],
      ['stream', 'answer', ref, 'q10-db', 'release', D],
      ['stream', 'answer', ref, 'ctoc-hold', '1', precompute.HOLD.digest],
      ['stream', 'answer', ref, "'q10-db'", "'1'", D],
      ['stream', 'answer', ref, 'q11-gone', '1', D],
      ['stream', 'answer', 'functional/z.md', 'q10-db', '1', D],
      ['stream', 'answer', staleRef, 'q10-db', '1', D],
    ];
    for (const args of refused) {
      const screen = route(args, root);
      assert.match(screen.text, /^Nothing was recorded for [a-z]\.md: /m, args.join(' '));
      assert.equal(answersRaw(root), before, `nothing written: ${args.join(' ')}`);
    }
    const broken = withBrokenPrecompute(() => streamingGate.streamAnswer(ref, 'q10-db', '1', root, D));
    assert.match(broken.text, /^Nothing was recorded for x\.md: its questions could not be read \(SIMULATED streaming-precompute load failure\), so your answer cannot be checked\. The question will be asked again\./m);
    assert.equal(answersRaw(root), before);
    assert.equal(precompute.hasEnoughInformation(root, ref).reason, 'held');
  });

  it("case 19 — the gate ruling's own Hold and Send-back options hold; its Approve answers", () => {
    const root = makeSandbox();
    const ref = 'functional/x.md';
    writePlan(root, ref, functionalBody('Payments'));
    const r = ruling('q99-gate-ruling', 'hold');
    writeQuestions(root, ref, [r], { attested: true });

    route(['stream', 'answer', ref, 'q99-gate-ruling', '1', digestOf(r)], root);
    let last = answers(root).at(-1);
    assert.equal(last.questionId, 'ctoc-hold');
    assert.equal(last.heldOn, 'q99-gate-ruling');
    assert.equal(answers(root).some((e) => e.questionId === 'q99-gate-ruling'), false);
    assert.equal(exists(root, ref), true);

    route(['stream', 'answer', ref, 'ctoc-hold', 'release', precompute.HOLD.digest], root);
    assert.equal(promptOf(route(['plan', ref], root)), r.prompt, 'after a release the ruling is asked again');
    route(['stream', 'answer', ref, 'q99-gate-ruling', '2', digestOf(r)], root);
    last = answers(root).at(-1);
    assert.equal(last.questionId, 'q99-gate-ruling');
    assert.equal(last.holds, false);
    assert.equal(exists(root, 'implementation/x.md'), true);

    for (const [verdict, key] of [['approve', '2'], ['reject', '1']]) {
      const root2 = makeSandbox();
      writePlan(root2, ref, functionalBody('Payments'));
      const r2 = ruling('q99-gate-ruling', verdict);
      writeQuestions(root2, ref, [r2], { attested: true });
      route(['stream', 'answer', ref, 'q99-gate-ruling', key, digestOf(r2)], root2);
      const e = answers(root2).at(-1);
      assert.equal(e.questionId, 'ctoc-hold', `${verdict} ruling, key ${key}, holds`);
      assert.equal(e.holds, true);
      assert.equal(exists(root2, ref), true);
    }
  });

  it("case 20 — a held plan asks CTOC's own question, also after its question is gone", () => {
    const root = makeSandbox();
    const ref = 'functional/x.md';
    const planPath = writePlan(root, ref, functionalBody('Payments'));
    fs.utimesSync(planPath, new Date(NOW - 60000), new Date(NOW - 60000)); // revisions stay in the past
    const r = ruling('q99-gate-ruling', 'hold');
    writeQuestions(root, ref, [r], { attested: true });
    route(['stream', 'answer', ref, 'q99-gate-ruling', '1', digestOf(r)], root);

    for (const screen of [streamingGate.streamingGateScreen(root), route(['plan', ref], root)]) {
      assert.equal(promptOf(screen), precompute.HOLD.prompt);
      const opts = screen.ask.questions[0].options;
      assert.deepEqual(opts.slice(0, 2).map((o) => o.label), ['Keep holding this plan', 'Release the hold']);
      assert.equal(opts.some((o) => /^Recommended/.test(o.description)), false, 'neither is recommended');
      assert.equal(opts.some((o) => o.label === 'Hold this plan'), false);
    }

    fs.writeFileSync(planPath, functionalBody('Payments', ' It changed.'));
    fs.utimesSync(planPath, new Date(NOW - 30000), new Date(NOW - 30000));
    const r3 = { ...ruling('q99-gate-ruling-r3', 'hold'), prompt: 'Lens verdict: HOLD for the new text. Rule now.' };
    writeQuestions(root, ref, [r3], { attested: true });
    const still = route(['plan', ref], root);
    assert.equal(promptOf(still), precompute.HOLD.prompt, 'still held under CTOC\'s own id');
    runAction(root, still.actions['Release the hold']);
    assert.equal(promptOf(route(['plan', ref], root)), r3.prompt, "the new revision's question is asked");
  });

  it('case 21 — guard: no automatic crossing moves a held plan', () => {
    const root = makeSandbox();
    const fref = 'functional/hf.md';
    writePlan(root, fref, functionalBody('Held idea'));
    writeQuestions(root, fref, [detail('q10-color', 'Which colour?', ['Blue', 'Red'])]);
    route(['stream', 'answer', fref, 'q10-color', 'hold'], root);
    const built = seedBuilt(root, 'hr');
    writeQuestions(root, built.ref, [detail('q10-label', 'Label text?', ['Save', 'Store'])]);
    route(['stream', 'answer', built.ref, 'q10-label', 'hold'], root);

    menuScreens.continueAfterCrossing(root);

    assert.equal(exists(root, fref), true);
    assert.equal(ledger.readEntry('hf', root), null);
    assert.equal(exists(root, built.ref), true);
    assert.equal(ledger.readEntry('hr', root).stage_to, 'todo');
  });

  it('case 22 — the session status names a held plan in its own line and nowhere else', () => {
    const root = makeSandbox();
    const ref = 'functional/x.md';
    writePlan(root, ref, functionalBody('Held customer import'));
    writeQuestions(root, ref, [fork('q10-db')]);
    route(['stream', 'answer', ref, 'q10-db', 'hold'], root);
    writePlan(root, 'functional/w.md', functionalBody('Waiting for questions'));

    const status = loopBDirective(root);
    const lines = status.split('\n').filter(Boolean);
    const heldLine = 'You are holding: Held customer import. Each stays where it is until you choose Release the hold on it in /ctoc:start.';
    assert.ok(lines.includes(heldLine), status);
    assert.equal(lines.filter((l) => l.includes('Held customer import')).length, 1);

    const cont = menuScreens.continueAfterCrossing(root);
    const again = loopBDirective(root, { crossed: [], pending: cont.pending });
    assert.ok(again.split('\n').includes(heldLine), again);
  });

  it('case 23 — hold entries are never answers to the reader', () => {
    const { root, ref } = heldFixture();
    route(['stream', 'answer', ref, 'q10-db', 'hold'], root);
    route(['stream', 'answer', ref, 'ctoc-hold', 'release', precompute.HOLD.digest], root);

    const v = precompute.hasEnoughInformation(root, ref);
    assert.equal(v.unboundAnswers, 0);
    assert.equal(v.answered.includes('ctoc-hold'), false);
    const st = precompute.planQuestionsStatus(root, ref);
    const idOnly = precompute.readAnsweredQuestionIds(root, ref, { questionsRevisionMs: st.questionsRevisionMs, planMtimeMs: st.planMtimeMs });
    assert.equal(idOnly.ids.has('ctoc-hold'), false);
    assert.equal(idOnly.unbound, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('classification starts itself (cases 24–27)', () => {
  function authorSlice(root, slug = 'c24') {
    const ref = `implementation/${slug}.md`;
    const p = writePlan(root, ref, implBody('Cache layer', []));
    fs.utimesSync(p, 1784271999, 1784271999);
    writeQuestions(root, ref, [
      detail('q10-ttl', 'How long do entries live?', ['Five minutes', 'One hour']),
      detail('q11-key', 'What is the key?', ['The path', 'The hash']),
    ], { classified: false, stamp: 1784271999196.2705 });
    return ref;
  }

  it('case 24 — one classification task per question revision, labelled with a whole millisecond', () => {
    const root = makeSandbox();
    const ref = authorSlice(root);

    const first = menuScreens.continueAfterCrossing(root);

    assert.equal(exists(root, ref), true);
    const classify = tasks(root).filter((t) => t.kind === 'classify');
    assert.equal(classify.length, 1);
    assert.deepEqual(
      { kind: classify[0].kind, plan: classify[0].plan, touches: classify[0].touches, label: classify[0].label },
      { kind: 'classify', plan: ref, touches: [`.ctoc/streaming/questions/${ref}`], label: 'revision-1784271999196' },
    );
    assert.ok(first.promote.some((t) => t.id === classify[0].id));
    menuScreens.continueAfterCrossing(root);
    assert.equal(tasks(root).filter((t) => t.kind === 'classify').length, 1);
    finishTask(root, classify[0].id);
    menuScreens.continueAfterCrossing(root);
    assert.equal(tasks(root).filter((t) => t.kind === 'classify').length, 1, 'never retried in a loop');
  });

  it('case 25 — guard: opening the menu, the session status and a plan screen queue nothing', () => {
    const root = makeSandbox();
    const ref = authorSlice(root);
    const before = fs.existsSync(registryFile(root)) ? fs.readFileSync(registryFile(root), 'utf8') : null;

    streamingGate.streamingGateScreen(root);
    loopBDirective(root);
    route(['plan', ref], root);

    const after = fs.existsSync(registryFile(root)) ? fs.readFileSync(registryFile(root), 'utf8') : null;
    assert.equal(after, before);
  });

  it("case 26 — the gate critic's classified file replaces the author's and the plan moves on", () => {
    const root = makeSandbox();
    const ref = 'functional/c26.md';
    writePlan(root, ref, functionalBody('Reports'));
    const qs = [detail('q10-format', 'Which format?', ['CSV', 'JSON']), detail('q11-name', 'File name?', ['report', 'export'])];
    writeQuestions(root, ref, qs, { classified: false });

    menuScreens.continueAfterCrossing(root);
    assert.equal(tasks(root).filter((t) => t.kind === 'classify').length, 1);
    dropPending(root, ref, qs);
    menuScreens.continueAfterCrossing(root);

    assert.equal(exists(root, 'implementation/c26.md'), true);
    const text = fs.readFileSync(planPathOf(root, 'implementation/c26.md'), 'utf8');
    assert.match(text, /Which format\? — CSV \(question q10-format\)/);
    assert.match(text, /File name\? — report \(question q11-name\)/);
    assert.equal(tasks(root).filter((t) => t.kind === 'classify').length, 1);
  });

  it('case 27 — fail closed: no task can be recorded, or the classification block is not the critic\'s', () => {
    const root = makeSandbox();
    const ref = 'functional/c27.md';
    writePlan(root, ref, functionalBody('Exports'));
    const qs = [detail('q10-format', 'Which format?', ['CSV', 'JSON']), detail('q11-name', 'File name?', ['report', 'export'])];
    writeQuestions(root, ref, qs, { classified: false });
    fs.mkdirSync(registryFile(root), { recursive: true });

    const cont = menuScreens.continueAfterCrossing(root);

    assert.ok(cont.reasons.includes('classify-not-queued'), JSON.stringify(cont.reasons));
    assert.equal(exists(root, ref), true);
    const d = cont.pending.find((x) => x.ref === ref);
    assert.deepEqual(d.blockingQuestionIds, ['q10-format', 'q11-name']);

    fs.rmSync(registryFile(root), { recursive: true, force: true });
    dropPending(root, ref, qs, { by: 'product-owner', at: 1786000000000 });
    const next = menuScreens.continueAfterCrossing(root);
    assert.equal(exists(root, ref), true);
    assert.equal(precompute.planQuestionsStatus(root, ref).classified, false);
    assert.deepEqual(next.pending.find((x) => x.ref === ref).blockingQuestionIds, ['q10-format', 'q11-name']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('an answer is bound to the question as shown (cases 28–33)', () => {
  it("case 28 — the screen's action carries the digest, the writer records it, and the gate counts it", () => {
    const root = makeSandbox();
    const ref = 'functional/x.md';
    writePlan(root, ref, functionalBody('Customer import'));
    const q = fork('q10-db');
    const stamp = writeQuestions(root, ref, [q]);
    const D = digestOf(q);

    const action = streamingGate.streamingGateScreen(root).actions['Postgres'];
    assert.ok(action.endsWith(`'${D}'`));
    runAction(root, action);

    const lines = answers(root);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].questionDigest, D);
    assert.equal(lines[0].holds, false);
    assert.equal(lines[0].planMtimeMs, stamp);
    assert.equal(exists(root, 'implementation/x.md'), true, 'the answer moved the plan');
    assert.match(ledger.readEntry('x', root).evidence, /1 answered \(q10-db\)/, 'the gate counted the answer');
  });

  it('case 29 — an answer whose question changed after it was shown records nothing', () => {
    const root = makeSandbox();
    const ref = 'functional/x.md';
    const planPath = writePlan(root, ref, functionalBody('Customer import'));
    fs.utimesSync(planPath, new Date(NOW - 60000), new Date(NOW - 60000)); // revisions stay in the past
    const q = fork('q10-db');
    writeQuestions(root, ref, [q]);
    const kept = streamingGate.streamingGateScreen(root).actions['Postgres'];
    // The plan changed and its questions were regenerated with the labels swapped between the
    // keys (a revision; within one revision a file may only grow).
    const swapped = { ...q, options: [{ key: '1', label: 'SQLite', recommended: true }, { key: '2', label: 'Postgres' }] };
    fs.utimesSync(planPathOf(root, ref), new Date(NOW - 30000), new Date(NOW - 30000));
    writeQuestions(root, ref, [swapped]);

    const refusedText = 'Nothing was recorded for x.md: this answer does not match the question as it stands now, so it cannot be checked. The question will be asked again.';
    const screen = runAction(root, kept);
    assert.ok(screen.text.includes(refusedText), screen.text);
    assert.equal(answersRaw(root), '');
    const next = streamingGate.streamingGateScreen(root);
    assert.equal(next.actions['Postgres'], `stream answer ${ref} 'q10-db' '2' '${digestOf(swapped)}'`);

    const D = digestOf(swapped);
    for (const shown of [undefined, D.slice(0, 63), D.toUpperCase()]) {
      const s = route(['stream', 'answer', ref, 'q10-db', '1', ...(shown === undefined ? [] : [shown])], root);
      assert.ok(s.text.includes(refusedText), String(shown));
      assert.equal(answersRaw(root), '');
    }
    route(['stream', 'answer', ref, 'q10-db', 'hold'], root);
    assert.equal(answers(root).at(-1).questionId, 'ctoc-hold', 'a hold needs no digest');
  });

  it("case 30 — hold, keep and release carry CTOC's digest, and a release needs it", () => {
    const root = makeSandbox();
    const ref = 'functional/x.md';
    writePlan(root, ref, functionalBody('Customer import'));
    writeQuestions(root, ref, [fork('q10-db')]);

    runAction(root, streamingGate.streamingGateScreen(root).actions['Hold this plan']);
    const held = route(['plan', ref], root);
    runAction(root, held.actions['Keep holding this plan']);
    runAction(root, route(['plan', ref], root).actions['Release the hold']);
    assert.deepEqual(answers(root).map((e) => e.questionDigest), Array(3).fill(precompute.HOLD.digest));
    const keyOf = (action) => /'([^']+)'(?: '[0-9a-f]{64}')?$/.exec(action)[1];
    const shown = {
      prompt: promptOf(held),
      options: ['Keep holding this plan', 'Release the hold'].map((label) => ({ key: keyOf(held.actions[label]), label })),
    };
    assert.equal(precompute.HOLD.digest, digestOf(shown), 'the digest of the question exactly as the screen showed it');

    route(['stream', 'answer', ref, 'q10-db', 'hold'], root);
    const otherDigest = digestOf(fork('q10-db'));
    const base = { ts: new Date(NOW + 1000).toISOString(), ref, questionId: 'ctoc-hold' };
    for (const line of [
      { ...base, optionKey: 'release' },
      { ...base, optionKey: 'release', questionDigest: otherDigest },
      { ...base, optionKey: 'release', holds: 'false', questionDigest: precompute.HOLD.digest },
      { ...base, optionKey: 'hold', holds: false, questionDigest: precompute.HOLD.digest },
    ]) {
      appendLine(root, line);
      assert.equal(precompute.hasEnoughInformation(root, ref).reason, 'held', JSON.stringify(line));
      assert.equal(promptOf(route(['plan', ref], root)), precompute.HOLD.prompt, 'the screen agrees');
    }
    const before = answersRaw(root);
    route(['stream', 'answer', ref, 'ctoc-hold', 'release'], root);
    assert.equal(answersRaw(root), before);
  });

  it('case 31 — every append starts on a new line, so a torn last line never swallows an answer', () => {
    const root = makeSandbox();
    const ref = 'functional/x.md';
    writePlan(root, ref, functionalBody('Customer import'));
    writeQuestions(root, ref, [fork('q10-db'), fork('q11-auth', 'Which sign-in provider?', ['Clerk', 'Auth0'])]);
    fs.mkdirSync(path.dirname(ANSWERS(root)), { recursive: true });
    const torn = '{"ts":"2026-10-07T00:00:00.000Z","ref":"functional/other.md","questionId":"q10-x"';
    fs.writeFileSync(ANSWERS(root), torn);

    const next = runAction(root, streamingGate.streamingGateScreen(root).actions['Postgres']);

    const raw = answersRaw(root).split('\n');
    assert.ok(raw.includes(torn), 'the torn line stays alone on its own line');
    const entry = raw.filter((l) => l.trim() && l !== torn).map((l) => JSON.parse(l));
    assert.equal(entry.length, 1);
    assert.equal(entry[0].questionId, 'q10-db');
    assert.ok(precompute.hasEnoughInformation(root, ref).answered.includes('q10-db'));
    assert.equal(promptOf(next), 'Which sign-in provider?');

    const root2 = makeSandbox();
    writePlan(root2, ref, functionalBody('Customer import'));
    writeQuestions(root2, ref, [fork('q10-db'), fork('q11-auth', 'Which sign-in provider?', ['Clerk', 'Auth0'])]);
    fs.mkdirSync(path.dirname(ANSWERS(root2)), { recursive: true });
    fs.writeFileSync(ANSWERS(root2), JSON.stringify({ ts: new Date().toISOString(), ref: 'functional/other.md', questionId: 'q10-x', optionKey: '1' }));
    runAction(root2, streamingGate.streamingGateScreen(root2).actions['Postgres']);
    assert.equal(answers(root2).length, 2, 'both entries parse');
  });

  it('case 32 — the screen and the gate agree on what is answered', () => {
    const states = [
      ['no entry', () => null, true],
      ['right key, no digest', (q, stamp) => ({ optionKey: '1', planMtimeMs: stamp }), true],
      ["another question's digest", (q, stamp) => ({ optionKey: '1', planMtimeMs: stamp, questionDigest: digestOf(fork('q11-auth', 'Which sign-in provider?', ['Clerk', 'Auth0'])) }), true],
      ['a key that is no option', (q, stamp) => ({ optionKey: '3', planMtimeMs: stamp, questionDigest: digestOf(q) }), true],
      ["another revision's stamp", (q, stamp) => ({ optionKey: '1', planMtimeMs: stamp - 5000, questionDigest: digestOf(q) }), true],
      ['the right key and digest', (q, stamp) => ({ optionKey: '1', planMtimeMs: stamp, questionDigest: digestOf(q) }), false],
    ];
    for (const [name, entryOf, asksAgain] of states) {
      const root = makeSandbox();
      const ref = 'functional/x.md';
      writePlan(root, ref, functionalBody('Customer import'));
      const q = fork('q10-db');
      const stamp = writeQuestions(root, ref, [q, fork('q11-auth', 'Which sign-in provider?', ['Clerk', 'Auth0'])]);
      const e = entryOf(q, stamp);
      if (e) appendLine(root, { ts: new Date(NOW + 1000).toISOString(), ref, questionId: 'q10-db', ...e });

      const gateOpen = !precompute.hasEnoughInformation(root, ref).answered.includes('q10-db');
      const screenAsks = promptOf(route(['plan', ref], root)) === 'Which database engine?';
      assert.equal(gateOpen, asksAgain, `${name}: the gate`);
      assert.equal(screenAsks, gateOpen, `${name}: the screen agrees with the gate`);
    }
  });

  it("case 33 — an author's question file never moves a plan by itself; each is sent for classification once", () => {
    const root = makeSandbox();
    const aRef = 'implementation/a33.md';
    writePlan(root, aRef, implBody('Empty-question slice', []));
    writeQuestions(root, aRef, [], { classified: false });
    const bRef = 'functional/b33.md';
    writePlan(root, bRef, functionalBody('Answered-question idea'));
    const bqs = [detail('q10-format', 'Which format?', ['CSV', 'JSON']), detail('q11-name', 'File name?', ['report', 'export'])];
    writeQuestions(root, bRef, bqs, { classified: false });

    const cont = menuScreens.continueAfterCrossing(root);
    assert.equal(exists(root, aRef), true);
    assert.equal(cont.pending.find((d) => d.ref === aRef).sufficiencyReason, 'unclassified');
    const aTask = tasks(root).filter((t) => t.kind === 'classify' && t.plan === aRef);
    assert.equal(aTask.length, 1);
    assert.match(aTask[0].label, /^revision-[0-9]+$/);
    assert.ok(cont.promote.some((t) => t.id === aTask[0].id));
    const screen = streamingGate.streamingGateScreen(root);
    assert.match(screen.text, /Its questions are being checked by the gate critic; it moves on by itself once they are, or when you approve it\./);
    assert.doesNotMatch(screen.text, /unclassified/);

    // The screen never offers an unchecked author's questions; the human answers them through
    // the answer route with the digest of each question, as the menu records an answer.
    for (const q of bqs) route(['stream', 'answer', bRef, q.id, '1', digestOf(q)], root);
    assert.equal(exists(root, bRef), true);
    assert.equal(precompute.hasEnoughInformation(root, bRef).reason, 'unclassified');
    assert.equal(tasks(root).filter((t) => t.kind === 'classify' && t.plan === bRef).length, 1);

    const failRoot = makeSandbox();
    fs.cpSync(root, failRoot, { recursive: true });
    sandboxes.push(failRoot);

    dropPending(root, aRef, []);
    dropPending(root, bRef, bqs);
    menuScreens.continueAfterCrossing(root);
    assert.equal(exists(root, 'todo/a33.md'), true);
    assert.equal(exists(root, 'implementation/b33.md'), true);
    assert.match(ledger.readEntry('b33', root).evidence, /2 answered \(q10-format, q11-name\)/, 'his answers still bound');
    assert.equal(tasks(root).filter((t) => t.kind === 'classify').length, 2);

    for (const t of tasks(failRoot).filter((x) => x.kind === 'classify')) {
      route(['menu', 'task', 'fail', t.id, '--summary', 'nothing written'], failRoot);
    }
    menuScreens.continueAfterCrossing(failRoot);
    menuScreens.continueAfterCrossing(failRoot);
    assert.equal(exists(failRoot, aRef), true);
    assert.equal(exists(failRoot, bRef), true);
    assert.equal(tasks(failRoot).filter((t) => t.kind === 'classify').length, 2);
    for (const ref of [aRef, bRef]) {
      const s = route(['plan', ref], failRoot);
      const stage = ref.split('/')[0];
      assert.ok(labelsOf(s).includes(require('../src/lib/gate-words.js').approveLabel(stage)), `${ref} still offers his Approve`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('what the author left unasked (case 34) and what a classification keeps (case 35)', () => {
  function omissionSlice(root, authorQuestions) {
    const ref = 'implementation/c34.md';
    const p = writePlan(root, ref, implBody('Session handling', ['src/c34.js'], '\n\nSessions are stored in PostgreSQL 16.'));
    writeQuestions(root, ref, authorQuestions, { classified: false });
    return { ref, stamp: Math.floor(fs.statSync(p).mtimeMs) };
  }
  const added = (id, topic) => ({
    id, prompt: 'Where are sessions stored?', critical: false, important: true, topic,
    options: [
      { key: '1', label: 'PostgreSQL 16', recommended: true, description: 'The plan chooses it: plans/implementation/c34.md line 9.' },
      { key: '2', label: 'Redis' },
    ],
  });

  for (const topic of ['data-model', 'technology-stack']) {
    it(`case 34 — a weighty choice the author left unasked (${topic}) stops the plan and is asked first`, () => {
      const root = makeSandbox();
      const { ref, stamp } = omissionSlice(root, []);
      menuScreens.continueAfterCrossing(root);
      assert.equal(tasks(root).filter((t) => t.kind === 'classify' && t.plan === ref).length, 1);

      const id = `q10-session-store-r${stamp}`;
      dropPending(root, ref, [added(id, topic)]);
      const cont = menuScreens.continueAfterCrossing(root);

      assert.equal(exists(root, ref), true);
      const d = cont.pending.find((x) => x.ref === ref);
      assert.equal(d.sufficiencyReason, 'open-forks');
      assert.deepEqual(d.blockingQuestionIds, [id]);
      assert.doesNotMatch(fs.readFileSync(planPathOf(root, ref), 'utf8'), /Decisions Taken Under Ambiguity/);
      const screen = streamingGate.streamingGateScreen(root);
      assert.equal(promptOf(screen), 'Where are sessions stored?');
      assert.ok(labelsOf(screen).includes('Hold this plan'));
      runAction(root, screen.actions['PostgreSQL 16']);
      assert.ok(exists(root, 'todo/c34.md') || exists(root, 'in-progress/c34.md'), 'answered, the plan moves on');
    });
  }

  it("case 34 — beside an author's detail, the added question blocks and the detail is decided by default", () => {
    const root = makeSandbox();
    const authorQ = detail('q10-ttl', 'How long does a session live?', ['Thirty minutes', 'One day']);
    const { ref, stamp } = omissionSlice(root, [authorQ]);
    const id = `q11-session-store-r${stamp}`;
    dropPending(root, ref, [authorQ, added(id, 'data-model')]);

    const cont = menuScreens.continueAfterCrossing(root);
    const st = precompute.planQuestionsStatus(root, ref);
    assert.equal(st.classified, true);
    assert.equal(digestOf(st.questions.find((q) => q.id === 'q10-ttl')), digestOf(authorQ), "the author's question is unchanged");
    assert.deepEqual(cont.pending.find((x) => x.ref === ref).blockingQuestionIds, [id]);

    runAction(root, streamingGate.streamingGateScreen(root).actions['PostgreSQL 16']);
    const moved = exists(root, 'todo/c34.md') ? 'todo/c34.md' : 'in-progress/c34.md';
    assert.ok(exists(root, moved));
    assert.match(fs.readFileSync(planPathOf(root, moved), 'utf8'), /How long does a session live\? — Thirty minutes \(question q10-ttl\)/);
  });

  it("case 35 — a classification may add questions, never drop or reword an author's", () => {
    const root = makeSandbox();
    const ref = 'functional/c35.md';
    writePlan(root, ref, functionalBody('Sign-in'));
    const store = detail('q10-store', 'Where are drafts kept?', ['Local storage', 'The server']);
    const auth = fork('q11-auth', 'How long may a session stay idle?', ['15 minutes', '8 hours'], 'security-posture');
    const stamp = writeQuestions(root, ref, [store, auth], { classified: false });

    const dropped = precompute.writePlanQuestions(root, ref, [store], stamp, undefined, CLASSIFIED);
    assert.equal(dropped.ok, false);
    assert.equal(dropped.reason, 'classification-dropped-author-question');
    const reworded = precompute.writePlanQuestions(root, ref, [store, { ...auth, prompt: 'How long may a session stay idle, roughly?' }], stamp, undefined, CLASSIFIED);
    assert.equal(reworded.reason, 'classification-dropped-author-question');
    assert.equal(precompute.planQuestionsStatus(root, ref).classified, false, "the author's file stays");

    const kept = precompute.writePlanQuestions(root, ref, [store, auth, fork('q12-db')], stamp, undefined, CLASSIFIED);
    assert.equal(kept.ok, true);
    assert.deepEqual(precompute.planQuestionsStatus(root, ref).questions.map((q) => q.id), ['q10-store', 'q11-auth', 'q12-db']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('every route a background agent may run moves nothing (case 36)', () => {
  it('case 36 — the allowed routes leave a crossable plan and a finishable plan where they are, the ledger byte-identical', () => {
    const root = makeSandbox();
    const fref = 'functional/f36.md';
    writePlan(root, fref, functionalBody('Crossable idea'));
    writeQuestions(root, fref, [detail('q10-color', 'Which colour?', ['Blue', 'Red'])]);
    seedBuilt(root, 'r36');
    const approvals = path.join(root, '.ctoc', 'approvals');
    const snapshot = () => fs.readdirSync(approvals).sort().map((f) => [f, fs.readFileSync(path.join(approvals, f), 'utf8')]);
    const before = snapshot();

    const t1 = route(['menu', 'task', 'add', 'review', 'p', '--touches', 'a.js', '--label', 'l'], root).taskId;
    const t2 = route(['menu', 'task', 'add', 'plan', 'q'], root).taskId;
    const t3 = route(['menu', 'task', 'add', 'plan', 'r'], root).taskId;
    const routes = [
      ['menu', 'task', 'start', t1, '--agent-id', 'abc'], ['menu', 'task', 'fail', t1, '--summary', 'x'],
      ['menu', 'task', 'cancel', t2], ['menu', 'task', 'start', t3],
      ['menu', 'task', 'complete', t3, '--summary', 'built', '--gate', '3', '--next', 'tasks'],
      ['menu', 'task', 'list'], ['menu', 'task', 'board'], ['menu'], ['menu', 'commands'], ['dashboard'],
      ['tasks'], ['task', t1], ['browse', 'review'], ['section', 'execution'], ['stubs', 's'],
      ['validate', 'review/r36.md'], ['inbox', 'questions'], ['inbox', 'decisions'], ['inbox', 'gates'],
      ['inbox', 'escalations'], ['inbox', 'migration'], ['inbox', 'verify'], ['inbox', 'stale'],
      ['inbox', 'cleanup'], ['inbox', 'cleanup', 'category'], ['inbox', 'cleanup', 'plan', 'r36'],
      ['plan', fref], ['plan', 'review/r36.md'],
    ];
    const MENU = 'node "${CLAUDE_PLUGIN_ROOT}/src/commands/start.js"';
    const hook = path.join(__dirname, '..', 'src', 'hooks', 'protect-records.js');
    for (const r of routes) {
      const command = `${MENU} ${r.map((w) => `'${w}'`).join(' ')}`;
      const verdict = require('node:child_process').spawnSync(process.execPath, [hook], {
        cwd: root, encoding: 'utf8',
        input: JSON.stringify({ cwd: root, tool_name: 'Bash', tool_input: { command }, agent_id: 'a1', agent_type: 'x' }),
      });
      assert.equal(verdict.status, 0, `the protection allows a background agent: ${r.join(' ')} (${verdict.stderr})`);
      route(r, root);
    }

    assert.equal(exists(root, fref), true, 'the crossable plan is still waiting');
    assert.equal(exists(root, 'review/r36.md'), true, 'the finishable plan is still in review');
    assert.deepEqual(snapshot(), before, 'the approval ledger is byte-identical');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('the verification round (cases 37–39)', () => {
  it('case 37 — within one revision every write keeps every question of the file it replaces; the set may only grow', () => {
    const root = makeSandbox();
    const ref = 'functional/c37.md';
    writePlan(root, ref, functionalBody('Exports'));
    const q10 = fork('q10-db');
    const q11 = fork('q11-auth', 'Which sign-in provider?', ['Clerk', 'Auth0']);
    const stamp = writeQuestions(root, ref, [q10, q11]);

    const dropped = precompute.writePlanQuestions(root, ref, [detail('q12-color', 'Which colour?', ['Blue', 'Red'])], stamp, undefined, CLASSIFIED);
    assert.equal(dropped.ok, false);
    assert.equal(dropped.reason, 'classification-dropped-question');
    const v = precompute.hasEnoughInformation(root, ref);
    assert.equal(v.enough, false, 'the weighty questions are still open');
    assert.deepEqual(v.blocking.map((b) => b.id), ['q10-db', 'q11-auth']);

    const grown = precompute.writePlanQuestions(root, ref, [q10, q11, detail('q12-color', 'Which colour?', ['Blue', 'Red'])], stamp, undefined, CLASSIFIED);
    assert.equal(grown.ok, true, 'the set may grow');
  });

  it('case 38 — the digest names the recommended option: a classification may not move the default', () => {
    const root = makeSandbox();
    const ref = 'functional/c38.md';
    writePlan(root, ref, functionalBody('Reports'));
    const authored = detail('q10-format', 'Which format?', ['CSV', 'JSON']);
    const stamp = writeQuestions(root, ref, [authored], { classified: false });
    const moved = { ...authored, options: [{ key: '1', label: 'CSV' }, { key: '2', label: 'JSON', recommended: true }] };
    assert.notEqual(precompute.questionDigest(moved), precompute.questionDigest(authored));
    assert.equal(precompute.questionDigest(authored), digestOf(authored));

    const res = precompute.writePlanQuestions(root, ref, [moved], stamp, undefined, CLASSIFIED);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'classification-dropped-author-question');
    menuScreens.continueAfterCrossing(root);
    assert.equal(exists(root, ref), true, 'the plan does not cross on the opposite default');
  });

  it("case 39 — a hold is CTOC's own hold only: an old-style line on a question id holds nothing", () => {
    const root = makeSandbox();
    const ref = 'functional/c39.md';
    writePlan(root, ref, functionalBody('Imports'));
    const q = detail('q10-color', 'Which colour?', ['Blue', 'Red']);
    const stamp = writeQuestions(root, ref, [q]);
    appendLine(root, { ts: new Date(NOW + 1000).toISOString(), ref, questionId: 'q10-color', optionKey: '1', holds: true, planMtimeMs: stamp, questionDigest: digestOf(q) });
    assert.notEqual(precompute.hasEnoughInformation(root, ref).reason, 'held');

    const built = seedBuilt(root, 'c39b');
    appendLine(root, { ts: new Date(NOW + 2000).toISOString(), ref: built.ref, questionId: 'ctoc-hold', optionKey: 'hold', holds: true, questionDigest: precompute.HOLD.digest });
    menuScreens.continueAfterCrossing(root);
    assert.equal(exists(root, built.ref), true, "CTOC's hold keeps a built plan with no questions in review");
  });
});

describe('the question writer refuses a revision stamp later than now (case 40)', () => {
  it('case 40 — a future stamp is refused; the plan\'s own time is accepted (guard)', () => {
    const root = makeSandbox();
    const ref = 'functional/c40.md';
    const planPath = writePlan(root, ref, functionalBody('Exports'));
    const future = precompute.writePlanQuestions(root, ref, [fork('q10-db')], Date.now() + 60000, undefined, CLASSIFIED);
    assert.equal(future.ok, false);
    assert.equal(future.reason, 'future-stamp');
    assert.equal(fs.existsSync(precompute.questionsPath(root, ref)), false, 'nothing is written');
    assert.deepEqual(precompute.writePlanQuestions(root, ref, [fork('q10-db')], fs.statSync(planPath).mtimeMs, undefined, CLASSIFIED), { ok: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('what the end-to-end run showed (cases 41–45)', () => {
  it("case 41 — an author's unchecked questions are never shown as his decision; the screen says they are being checked, or offers Check its questions", () => {
    const root = makeSandbox();
    const ref = 'functional/c41.md';
    writePlan(root, ref, functionalBody('Remember signed-in users'));
    const stamp = writeQuestions(root, ref, [detail('q10-cookie', 'What is the session cookie called?', ['sid', 'session_id'])], { classified: false });

    for (const screen of [streamingGate.streamingGateScreen(root), route(['plan', ref], root)]) {
      const labels = screen.ask.questions.flatMap((q) => q.options.map((o) => o.label));
      assert.equal(labels.includes('sid') || labels.includes('session_id'), false, "the author's options are not offered");
      assert.equal(screen.ask.questions.some((q) => q.question === 'What is the session cookie called?'), false);
      assert.ok(labels.includes('Check its questions'), 'one action launches the check');
      assert.equal(screen.actions['Check its questions'], `stream check ${ref}`);
    }
    assert.match(streamingGate.streamingGateScreen(root).text, /^ {2}The gate critic has not yet checked the questions its author wrote; choose Check its questions, or approve it yourself\.$/m);
    assert.equal(fs.existsSync(registryFile(root)), false, 'nothing is queued at menu open');

    const checked = route(['stream', 'check', ref], root);
    const queued = tasks(root).filter((t) => t.kind === 'classify');
    assert.deepEqual(queued.map((t) => [t.plan, t.label]), [[ref, `revision-${Math.floor(stamp)}`]]);
    assert.ok(checked.promote.some((t) => t.id === queued[0].id), 'returned for the session to launch');
    route(['stream', 'check', ref], root);
    assert.equal(tasks(root).filter((t) => t.kind === 'classify').length, 1, 'once per revision');

    const screen = streamingGate.streamingGateScreen(root);
    assert.match(screen.text, /^ {2}Its questions are being checked by the gate critic; it moves on by itself once they are, or when you approve it\.$/m);
    assert.equal(Object.prototype.hasOwnProperty.call(screen.actions, 'Check its questions'), false);
    assert.equal(exists(root, ref), true, 'nothing moved');
  });

  it('case 42 — the deploy-ready notice says how the plan finished, in plain words, with no gate number', () => {
    const root = makeSandbox();
    fs.writeFileSync(path.join(root, '.ctoc', 'settings.json'), JSON.stringify({ deployment: { enabled: true } }));
    seedBuilt(root, 'c42a');
    menuScreens.continueAfterCrossing(root);
    seedBuilt(root, 'c42b');
    route(['stream', 'approve', 'review/c42b.md'], root);
    const notices = JSON.parse(fs.readFileSync(path.join(root, '.ctoc', 'logs', 'deploy-ready.json'), 'utf8'));
    const byPlan = Object.fromEntries(notices.map((n) => [n.plan, n.message]));
    assert.match(byPlan['c42a.md'], /finished on its checks/);
    assert.match(byPlan['c42b.md'], /you approved it/);
    for (const m of Object.values(byPlan)) {
      assert.doesNotMatch(m, /gate\s*[0-9]/i);
      assert.match(m, /Deploying it is a separate decision/);
    }
  });

  it("case 43 — finishing on its evidence clears the plan's status file in the stage it leaves", () => {
    const root = makeSandbox();
    seedBuilt(root, 'c43');
    fs.writeFileSync(planPathOf(root, 'review/c43.md') + '.status', JSON.stringify({ status: 'idle' }));
    menuScreens.continueAfterCrossing(root);
    assert.equal(exists(root, 'done/c43.md'), true);
    assert.equal(fs.existsSync(planPathOf(root, 'review/c43.md') + '.status'), false);
  });

  it('case 44 — coverage that was not measured is said plainly in the evidence', () => {
    const root = makeSandbox();
    seedBuilt(root, 'c44');
    const ev = verifyEvidencePath(root, 'c44');
    const record = JSON.parse(fs.readFileSync(ev, 'utf8'));
    record.checks.tests.coverage = null;
    record.checks.tests.coverageFloor = null;
    fs.writeFileSync(ev, JSON.stringify(record));
    menuScreens.continueAfterCrossing(root);
    const evidence = ledger.readEntry('c44', root).evidence;
    assert.match(evidence, /coverage not measured, 0 skipped/);
    assert.doesNotMatch(evidence, /unknown%/);
  });

  it("case 45 — the header's count of plans waiting for their questions is taken after the sweep", () => {
    const root = makeSandbox();
    const ref = 'functional/c45.md';
    writePlan(root, ref, functionalBody('Remember signed-in users'));
    dropPending(root, ref, [detail('q10-cookie', 'What is the session cookie called?', ['sid', 'session_id'])], null);
    const screen = streamingGate.streamingGateScreen(root);
    assert.doesNotMatch(screen.text, /plan\(s\) wait for their questions/);
    assert.equal(precompute.planQuestionsStatus(root, ref).status, 'ready');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('the session continues after a build agent completed its own task (cases 46–47)', () => {
  /**
   * A built plan in review, the build task its agent already completed (what the agent's own
   * `menu task complete <id>` leaves), and one more slice that crosses into the build queue on
   * its classified questions, as case 4 builds it.
   */
  function builtAndDone(slug) {
    const root = makeSandbox();
    const built = seedBuilt(root, slug);
    let id;
    taskRegistry.withRegistry(root, (reg) => {
      const t = taskRegistry.addTask(reg, { kind: 'implement', label: `build ${slug}`, plan: slug, touches: [`src/${slug}.js`] });
      taskRegistry.updateTask(reg, t.id, { status: 'running' });
      taskRegistry.updateTask(reg, t.id, { status: 'done', result: { ok: true, summary: 'built' } });
      id = t.id;
      return reg;
    });
    const nextRef = `implementation/${slug}-next.md`;
    writePlan(root, nextRef, implBody('Next slice', [`src/${slug}-next.js`]));
    dropPending(root, nextRef, []);
    return { root, built, id };
  }
  const taskOf = (root, id) => tasks(root).find((t) => t.id === id);

  it("case 46 — the session's --continue on a task its agent completed runs only the continuation", () => {
    const { root, id } = builtAndDone('c46');
    const before = structuredClone(taskOf(root, id));

    const res = route(['menu', 'task', 'complete', id, '--continue', '--summary', 'ignored'], root);

    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.alreadyCompleted, true);
    assert.equal(res.completion, null);
    assert.equal(res.status, 'done');
    assert.equal(exists(root, 'done/c46.md'), true, 'the built plan finished on its checks');
    assert.equal(exists(root, 'review/c46.md'), false);
    assert.equal(ledger.readEntry('c46', root).advanced_by, 'pipeline');
    assert.match(res.text, /finished on their checks/);
    assert.ok(res.promote.some((t) => t.kind === 'implement' && t.plan === 'c46-next'),
      'the next approved slice is claimed for building and returned to launch');
    assert.deepEqual(taskOf(root, id), before, 'nothing was written to the completed task');
  });

  it('case 46b — a held built plan stays where it is', () => {
    const { root, built, id } = builtAndDone('c46b');
    writeQuestions(root, built.ref, [detail('q10-label', 'Label text?', ['Save', 'Store'])]);
    route(['stream', 'answer', built.ref, 'q10-label', 'hold'], root);
    const hold = answers(root).find((l) => l.questionId === 'ctoc-hold');
    assert.ok(hold && hold.holds === true && hold.questionDigest === precompute.HOLD.digest, "CTOC's hold is recorded");
    const ledgerFile = ledger.ledgerPath('c46b', root);
    const ledgerBefore = fs.readFileSync(ledgerFile);

    const res = route(['menu', 'task', 'complete', id, '--continue'], root);

    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.alreadyCompleted, true);
    assert.equal(exists(root, built.ref), true, 'the held plan stays in review');
    assert.equal(exists(root, 'done/c46b.md'), false);
    assert.deepEqual(fs.readFileSync(ledgerFile), ledgerBefore, 'the crossing record is byte-identical');
  });

  it('case 47 — guards: a done task without --continue, and a failed task with it, are refused as today', () => {
    const { root, id } = builtAndDone('c47');
    const before = structuredClone(taskOf(root, id));
    // The router turns taskComplete's throw into its refusal shape.
    const refused = (res, re) => {
      assert.equal(res.ok, false, JSON.stringify(res));
      assert.match(res.error, re);
      assert.equal(res.alreadyCompleted, undefined);
    };
    refused(route(['menu', 'task', 'complete', id], root), /invalid transition done → done/);
    assert.deepEqual(taskOf(root, id), before);
    let failedId;
    taskRegistry.withRegistry(root, (reg) => {
      const t = taskRegistry.addTask(reg, { kind: 'plan', label: 'a planner', plan: 'c47-other' });
      taskRegistry.updateTask(reg, t.id, { status: 'failed', result: { ok: false, summary: 'failed' } });
      failedId = t.id;
      return reg;
    });
    refused(route(['menu', 'task', 'complete', failedId, '--continue'], root), /invalid transition failed → done/);
    assert.equal(exists(root, 'review/c47.md'), true, 'a refused call continues nothing');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("a held plan is always asked CTOC's keep-or-release question first (case 48)", () => {
  /** Assert that `screen` asks only keep-or-release and offers no way to finish or approve. */
  function asksKeepOrRelease(screen, ref, label) {
    assert.equal(promptOf(screen), precompute.HOLD.prompt, `${label}: CTOC's own question`);
    assert.equal(screen.ask.questions[0].header, 'Held', `${label}: the header says held, not finished or build`);
    const opts = screen.ask.questions[0].options;
    assert.deepEqual(opts.slice(0, 2).map((o) => o.label), [precompute.HOLD.keep.label, precompute.HOLD.release.label], label);
    assert.equal(opts.some((o) => /Recommended/.test(o.description)), false, `${label}: nothing is recommended`);
    assert.equal(opts.some((o) => /finished|build it|approve/i.test(o.label)), false, `${label}: no finish or approve option`);
    assert.equal(Object.values(screen.actions).some((a) => /^stream approve /.test(a) || /^claude:approve /.test(a)), false,
      `${label}: no action approves it`);
    assert.equal(screen.actions[precompute.HOLD.release.label],
      `stream answer ${ref} 'ctoc-hold' 'release' '${precompute.HOLD.digest}'`, `${label}: release carries CTOC's digest`);
  }

  const variants = [
    { stage: 'functional', make: (root, ref) => writePlan(root, ref, functionalBody('Held idea')), name: 'Held idea' },
    { stage: 'implementation', make: (root, ref) => writePlan(root, ref, implBody('Held slice', ['src/held.js'])), name: 'Held slice' },
    { stage: 'review', make: (root, ref) => seedBuilt(root, ref.slice('review/'.length, -3)), name: null },
  ];
  const files = {
    'no question file': () => {},
    "an author's unclassified file": (root, ref) => writeQuestions(root, ref, [detail('q10-label', 'Label text?', ['Save', 'Store'])], { classified: false }),
    'a classified file of details': (root, ref) => writeQuestions(root, ref, [detail('q10-label', 'Label text?', ['Save', 'Store'])]),
  };

  for (const v of variants) {
    for (const [fileLabel, writeFile] of Object.entries(files)) {
      it(`case 48 — held at ${v.stage}, ${fileLabel}: keep or release first, never finish or approve; the status names it as held`, () => {
        const root = makeSandbox();
        const slug = `h48${v.stage[0]}`;
        const ref = `${v.stage}/${slug}.md`;
        v.make(root, ref);
        writeFile(root, ref);
        const held = route(['stream', 'answer', ref, 'ctoc-hold', 'hold'], root);
        assert.match(held.text, new RegExp(`You are holding ${slug}\\.md`));
        assert.equal(exists(root, ref), true, 'the held plan stays');

        const label = `${v.stage}, ${fileLabel}`;
        asksKeepOrRelease(streamingGate.streamingGateScreen(root), ref, `${label} (default screen)`);
        asksKeepOrRelease(route(['plan', ref], root), ref, `${label} (plan screen)`);

        const name = v.name || `${slug} built feature`;
        const lines = loopBDirective(root).split('\n').filter(Boolean);
        assert.ok(lines.some((l) => l.startsWith('You are holding: ') && l.includes(name)), lines.join('\n'));
        assert.equal(lines.some((l) => l.startsWith('Waiting for your OK') && l.includes(name)), false,
          `${label}: never listed as waiting for his OK`);
      });
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// On a regulated project a plan waits for the owner where the regime's own check has no
// record (plan `evidence-crossings-respect-the-regulated-profiles`; its cases 48–52 are this
// file's cases 49–53, numbered after the last case the file already held).

const REPO_REGIMES = path.join(__dirname, '..', '.ctoc', 'regulatory-regimes');

/**
 * Write `.ctoc/settings.yaml` as a `regulatory_regime:` block and copy each named profile
 * CTOC ships into the sandbox (a name with no shipped file is not copied). `copy: false`
 * leaves the sandbox with no profile folder at all, as a real project has.
 */
function setRegime(root, { profiles = [], overrides = {}, declined = false, copy = true } = {}) {
  let yaml = `regulatory_regime:\n  active_profiles: [${profiles.join(', ')}]\n`;
  if (declined) yaml += '  declined: true\n';
  const entries = Object.entries(overrides);
  if (entries.length > 0) yaml += `  overrides:\n${entries.map(([k, v]) => `    ${k}: ${v}\n`).join('')}`;
  fs.writeFileSync(path.join(root, '.ctoc', 'settings.yaml'), yaml);
  if (!copy) return;
  const dir = path.join(root, '.ctoc', 'regulatory-regimes');
  fs.mkdirSync(dir, { recursive: true });
  for (const name of profiles) {
    const src = path.join(REPO_REGIMES, `${name}.yaml`);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, `${name}.yaml`));
  }
}

const REGIME_SENTENCES = Object.freeze({
  'compliance-review': 'It waits for your approval: this project has an EU compliance profile on (GDPR or the EU AI Act), and nothing records that the compliance review ran for this version of the plan, so it does not move on by itself.',
  'independent-verification': "It waits for your approval: this project requires independent verification and validation, and CTOC cannot read the verification chief's findings, so it does not finish on its checks by itself.",
  'review-sign-off': "It waits for your approval: this project's regulatory regime requires a sign-off here that CTOC does not check — two distinct approvers, a reconciliation of the specification against the code, or a closing lesson — so it does not finish on its checks by itself.",
  'regime-unreadable': "It waits for your approval: CTOC could not read this project's regulatory settings, so it does not move on by itself.",
});

const descriptorOf = (root, ref, opts) => streamingGate.pendingGateDecisions(root, opts).find((d) => d.ref === ref);

/** A built plan held by `reason`: it stays through the continuation, its record untouched. */
function assertBuiltHeld(root, slug, reason) {
  const ref = `review/${slug}.md`;
  const ledgerFile = ledger.ledgerPath(slug, root);
  const before = fs.readFileSync(ledgerFile);
  const cont = menuScreens.continueAfterCrossing(root);
  assert.equal(exists(root, ref), true, `${slug}: the built plan stays in review`);
  assert.equal(exists(root, `done/${slug}.md`), false);
  assert.deepEqual(fs.readFileSync(ledgerFile), before, `${slug}: the crossing record is byte-identical`);
  assert.equal((cont.crossed || []).some((c) => c.toStage === 'done'), false, `${slug}: nothing finished`);
  const d = descriptorOf(root, ref);
  assert.ok(d, `${slug}: still a pending decision`);
  assert.equal(d.regimeHold, reason);
  assert.equal(d.passesValidation, true, `${slug}: held by the regime, not by its validation`);
  const screen = streamingGate.streamingGateScreen(root);
  assert.ok(screen.text.includes(REGIME_SENTENCES[reason]), `${slug}: the screen says why:\n${screen.text}`);
  return { ref, d, screen };
}

describe('a regulated project: the plan waits where the regime has no record (cases 49–53)', () => {
  for (const profile of ['gdpr', 'eu-ai-act-high-risk']) {
    it(`case 49 — ${profile} on: a functional plan with enough information waits for the owner, and his approve crosses it`, () => {
      const root = makeSandbox();
      setRegime(root, { profiles: [profile] });
      const ref = 'functional/c49.md';
      writePlan(root, ref, functionalBody('Search by title'));
      writeQuestions(root, ref, [
        { ...detail('q10-name', 'What is the button called?', ['Short name', 'Long name']), important: true },
        detail('q11-color', 'Which colour?', ['Blue', 'Red']),
      ]);

      menuScreens.continueAfterCrossing(root);
      const screen = streamingGate.streamingGateScreen(root);

      assert.equal(exists(root, ref), true, 'the plan stays in functional');
      assert.equal(ledger.readEntry('c49', root), null, 'no crossing was recorded');
      assert.equal(tasks(root).some((t) => t.kind === 'plan' && t.plan === 'c49'), false, 'no planner was queued');
      const d = descriptorOf(root, ref);
      assert.ok(d);
      assert.equal(d.regimeHold, 'compliance-review');
      assert.equal(d.passesValidation, true);
      assert.equal(d.enough, true, 'held by the regime, not by an open question');
      assert.equal(promptOf(screen), 'What is the button called?', 'the rich screen asks the first detail');
      assert.ok(screen.text.includes(REGIME_SENTENCES['compliance-review']), screen.text);

      route(['stream', 'approve', ref], root);
      assert.equal(exists(root, 'implementation/c49.md'), true, "the owner's approve crosses it");
      assert.equal(ledger.readEntry('c49', root).approved_by, 'human');
    });
  }

  it('case 50 — independent verification and validation on: a built plan with passing checks does not finish on them', () => {
    const root = makeSandbox();
    setRegime(root, { profiles: ['do-178c-level-a'] });
    seedBuilt(root, 'c50');

    const { ref, d, screen } = assertBuiltHeld(root, 'c50', 'independent-verification');

    assert.ok(screen.ask.questions[0].options.some((o) => o.label === d.approveLabel), 'the approve option is offered');
    assert.equal(screen.actions[d.approveLabel], `stream approve ${ref}`);
    route(['stream', 'approve', ref], root);
    assert.equal(exists(root, 'done/c50.md'), true, "the owner's approve finishes it");
    assert.equal(ledger.readEntry('c50', root).approved_by, 'human');
  });

  it('case 51(a) — fail closed: an unreadable settings file holds both crossings', () => {
    const root = makeSandbox();
    fs.mkdirSync(path.join(root, '.ctoc', 'settings.yaml'));
    const fref = 'functional/c51.md';
    writePlan(root, fref, functionalBody('Unreadable regime'));
    writeQuestions(root, fref, []);
    seedBuilt(root, 'c51b');

    const crossed = [];
    const ds = streamingGate.pendingGateDecisions(root, { crossed });

    assert.deepEqual(crossed, [], 'nothing crossed');
    assert.equal(exists(root, fref), true);
    assert.equal(exists(root, 'review/c51b.md'), true);
    const f = ds.find((d) => d.ref === fref);
    const b = ds.find((d) => d.ref === 'review/c51b.md');
    assert.equal(f.regimeHold, 'regime-unreadable');
    assert.equal(f.passesValidation, true);
    assert.equal(f.enough, true);
    assert.equal(b.regimeHold, 'regime-unreadable');
    assert.equal(b.passesValidation, true);
    const text = streamingGate.streamingGateScreen(root).text;
    assert.ok(text.includes(REGIME_SENTENCES['regime-unreadable']), text);
  });

  // Session decision 2026-10-07 after the review: a profile CTOC cannot load holds both
  // crossings, so a misspelled or hand-quoted name never lets a plan skip the compliance review.
  for (const name of ['do-178c-levl-a', 'gpdr', '"gdpr"']) {
    it(`case 51(b) — fail closed: a declared profile CTOC cannot load (${name}) holds both crossings`, () => {
      const root = makeSandbox();
      setRegime(root, { profiles: [name], copy: false });
      const fref = 'functional/c51f.md';
      writePlan(root, fref, functionalBody('Misspelled regime'));
      writeQuestions(root, fref, []);
      seedBuilt(root, 'c51r');

      const crossed = [];
      const ds = streamingGate.pendingGateDecisions(root, { crossed });

      assert.deepEqual(crossed, [], 'nothing crossed');
      assert.equal(exists(root, fref), true, 'the functional plan stays');
      assert.equal(exists(root, 'review/c51r.md'), true, 'the built plan stays');
      const f = ds.find((d) => d.ref === fref);
      assert.equal(f.regimeHold, 'regime-unreadable');
      assert.equal(f.passesValidation, true);
      assert.equal(f.enough, true);
      const b = ds.find((d) => d.ref === 'review/c51r.md');
      assert.equal(b.regimeHold, 'regime-unreadable');
      assert.equal(b.passesValidation, true);
    });
  }

  it('case 52 — guards: no regime changes nothing, and each regime holds only the crossing it governs', () => {
    // No regime, declined: both crossings happen.
    let root = makeSandbox();
    setRegime(root, { profiles: [], declined: true });
    writePlan(root, 'functional/c52a.md', functionalBody('No regime idea'));
    writeQuestions(root, 'functional/c52a.md', []);
    seedBuilt(root, 'c52b');
    let ds = streamingGate.pendingGateDecisions(root);
    assert.equal(exists(root, 'implementation/c52a.md'), true, 'no regime: the functional plan moves on');
    assert.equal(descriptorOf(root, 'review/c52b.md').regimeHold, null);
    assert.ok(ds.every((d) => d.regimeHold === null));
    menuScreens.continueAfterCrossing(root);
    assert.equal(exists(root, 'done/c52b.md'), true, 'no regime: the built plan finishes on its checks');

    // GDPR: implementation → todo and review → done are not its crossings.
    root = makeSandbox();
    setRegime(root, { profiles: ['gdpr'] });
    writePlan(root, 'implementation/c52c.md', implBody('GDPR slice', ['src/c52c.js']));
    writeQuestions(root, 'implementation/c52c.md', []);
    seedBuilt(root, 'c52d');
    ds = streamingGate.pendingGateDecisions(root);
    assert.equal(exists(root, 'todo/c52c.md'), true, 'gdpr: the slice moves into the build queue');
    assert.ok(ds.every((d) => d.regimeHold === null));
    menuScreens.continueAfterCrossing(root);
    assert.equal(exists(root, 'done/c52d.md'), true, 'gdpr: the built plan finishes on its checks');

    // Independent verification: functional → implementation is not its crossing.
    root = makeSandbox();
    setRegime(root, { profiles: ['do-178c-level-a'] });
    writePlan(root, 'functional/c52e.md', functionalBody('Verified idea'));
    writeQuestions(root, 'functional/c52e.md', []);
    streamingGate.pendingGateDecisions(root);
    assert.equal(exists(root, 'implementation/c52e.md'), true, 'do-178c-level-a: the functional plan moves on');
  });

  const signOffProjects = [
    ['four_eyes_gate3 alone', { overrides: { four_eyes_gate3: true } }],
    ['spec_code_reconciliation alone', { overrides: { spec_code_reconciliation: true } }],
    ['lessons_learned_closure alone', { overrides: { lessons_learned_closure: true } }],
    ['the sox-itgc profile', { profiles: ['sox-itgc'] }],
  ];
  for (const [label, regime] of signOffProjects) {
    it(`case 53 — ${label}: a built plan with passing checks does not finish on them`, () => {
      const root = makeSandbox();
      setRegime(root, regime);
      seedBuilt(root, 'c53');
      assertBuiltHeld(root, 'c53', 'review-sign-off');
    });
  }

  it('case 53 — an override that turns the only sign-off control off restores the crossing', () => {
    const root = makeSandbox();
    setRegime(root, { profiles: ['pci-dss-v4'], overrides: { four_eyes_gate3: false } });
    seedBuilt(root, 'c53p');
    assert.equal(descriptorOf(root, 'review/c53p.md').regimeHold, null);
    menuScreens.continueAfterCrossing(root);
    assert.equal(exists(root, 'done/c53p.md'), true, 'it finishes on its checks');
  });
});

describe('a real project has no profile folder: the shipped profiles are read (case 54)', () => {
  it('case 54 — GDPR on, no profile folder: a built plan still finishes on its checks', () => {
    const root = makeSandbox();
    setRegime(root, { profiles: ['gdpr'], copy: false });
    assert.equal(fs.existsSync(path.join(root, '.ctoc', 'regulatory-regimes')), false, 'fixture: no profile folder');
    seedBuilt(root, 'c54g');
    assert.equal(descriptorOf(root, 'review/c54g.md').regimeHold, null);
    menuScreens.continueAfterCrossing(root);
    assert.equal(exists(root, 'done/c54g.md'), true, 'it finishes on its checks');
  });

  for (const [profile, reason] of [['do-178c-level-a', 'independent-verification'], ['sox-itgc', 'review-sign-off']]) {
    it(`case 54 — ${profile} on, no profile folder: the built plan waits with the ${reason} reason, not "could not read"`, () => {
      const root = makeSandbox();
      setRegime(root, { profiles: [profile], copy: false });
      seedBuilt(root, 'c54');
      const { screen } = assertBuiltHeld(root, 'c54', reason);
      assert.equal(screen.text.includes(REGIME_SENTENCES['regime-unreadable']), false, screen.text);
    });
  }

  it('case 55 — GDPR on, an author\'s questions being checked: the screen gives the compliance reason and never says it moves on by itself', () => {
    const root = makeSandbox();
    setRegime(root, { profiles: ['gdpr'], copy: false });
    const ref = 'functional/c55.md';
    writePlan(root, ref, functionalBody('Unchecked idea'));
    writeQuestions(root, ref, [detail('q10-label', 'Label text?', ['Save', 'Store'])], { classified: false });
    const queued = route(['stream', 'check', ref], root);
    assert.ok(tasks(root).some((t) => t.kind === 'classify' && t.plan === ref && t.status === 'queued'),
      `fixture: the check is queued (${JSON.stringify(queued.text || queued)})`);

    const d = descriptorOf(root, ref);
    assert.equal(d.regimeHold, 'compliance-review');
    assert.equal(d.questionsClassified, false);
    const text = streamingGate.streamingGateScreen(root).text;
    assert.match(text, /Its questions are being checked by the gate critic/);
    assert.ok(text.includes(REGIME_SENTENCES['compliance-review']), text);
    assert.doesNotMatch(text, /moves on by itself/);
    assert.equal(exists(root, ref), true);
  });

  // Security check of bf484a62 (finding 1): a settings or profile file that opens but is misread
  // must never read as "no regime" or "fewer controls".
  const INIT_LINE = '  active_profiles: []  # opt-in industry profiles (e.g. gdpr); none by default\n';
  /** A functional plan with a classified empty question file and a built plan, both ready to cross. */
  function readyPair(root) {
    const fref = 'functional/c56f.md';
    writePlan(root, fref, functionalBody('Misread regime'));
    writeQuestions(root, fref, []);
    seedBuilt(root, 'c56r');
    return fref;
  }
  const writeSettingsText = (root, text) => fs.writeFileSync(path.join(root, '.ctoc', 'settings.yaml'), text);

  const misreadSettings = {
    'a flow list split over two lines': 'regulatory_regime:\n  active_profiles: [do-178c-level-a,\n    sox-itgc]\n',
    'a scalar active_profiles': 'regulatory_regime:\n  active_profiles: gdpr\n',
    'a header with a comment': 'regulatory_regime: # EU\n  active_profiles: [gdpr]\n',
    'a flow mapping': 'regulatory_regime: {active_profiles: [gdpr]}\n',
    'a quoted name': 'regulatory_regime:\n  active_profiles: ["gdpr"]\n',
    'a misspelled key': 'regulatory_regime:\n  active_profile: [gdpr]\n',
  };
  for (const [label, text] of Object.entries(misreadSettings)) {
    it(`case 56 — settings with ${label}: both crossings wait as unreadable`, () => {
      const root = makeSandbox();
      writeSettingsText(root, text);
      const fref = readyPair(root);
      const crossed = [];
      const ds = streamingGate.pendingGateDecisions(root, { crossed });
      assert.deepEqual(crossed, [], 'nothing crossed');
      assert.equal(exists(root, fref), true);
      assert.equal(exists(root, 'review/c56r.md'), true);
      for (const ref of [fref, 'review/c56r.md']) {
        const d = ds.find((x) => x.ref === ref);
        assert.equal(d.regimeHold, 'regime-unreadable', ref);
        assert.equal(d.passesValidation, true, ref);
      }
    });
  }

  const misreadProfiles = {
    'an empty profile file': '',
    'required_controls as a flow list': 'name: acme\nrequired_controls: [four_eyes_gate3]\n',
    'required_controls as a scalar': 'name: acme\nrequired_controls: four_eyes_gate3\n',
  };
  for (const [label, body] of Object.entries(misreadProfiles)) {
    it(`case 56 — ${label}: the built plan waits as unreadable`, () => {
      const root = makeSandbox();
      writeSettingsText(root, 'regulatory_regime:\n  active_profiles: [acme]\n');
      fs.mkdirSync(path.join(root, '.ctoc', 'regulatory-regimes'), { recursive: true });
      fs.writeFileSync(path.join(root, '.ctoc', 'regulatory-regimes', 'acme.yaml'), body);
      seedBuilt(root, 'c56p');
      assertBuiltHeld(root, 'c56p', 'regime-unreadable');
    });
  }

  const noRegime = {
    'a fresh project (an empty list with its comment)': `regulatory_regime:\n${INIT_LINE}`,
    'a declined regime': `regulatory_regime:\n  declined: true\n${INIT_LINE}`,
    'no regulatory_regime block at all': 'timezone: "UTC"\n',
  };
  for (const [label, text] of Object.entries(noRegime)) {
    it(`case 56 — guard, ${label}: both plans cross as today`, () => {
      const root = makeSandbox();
      writeSettingsText(root, text);
      const fref = readyPair(root);
      assert.equal(descriptorOf(root, 'review/c56r.md').regimeHold, null);
      assert.equal(exists(root, 'implementation/c56f.md'), true, 'the functional plan moved on');
      menuScreens.continueAfterCrossing(root);
      assert.equal(exists(root, 'done/c56r.md'), true, 'the built plan finished on its checks');
      assert.equal(exists(root, fref), false);
    });
  }

  it("case 57 — GDPR on, an author's questions being checked, opened with `plan <ref>`: the compliance reason, never \"moves on by itself\"", () => {
    const root = makeSandbox();
    setRegime(root, { profiles: ['gdpr'], copy: false });
    const ref = 'functional/c57.md';
    writePlan(root, ref, functionalBody('Unchecked idea'));
    writeQuestions(root, ref, [detail('q10-label', 'Label text?', ['Save', 'Store'])], { classified: false });
    route(['stream', 'check', ref], root);
    assert.ok(tasks(root).some((t) => t.kind === 'classify' && t.plan === ref && t.status === 'queued'), 'fixture: the check is queued');

    const text = route(['plan', ref], root).text;
    assert.match(text, /Its questions are being checked by the gate critic/);
    assert.ok(text.includes(REGIME_SENTENCES['compliance-review']), text);
    assert.doesNotMatch(text, /moves on by itself/);

    // Guard: with no regime the plan screen keeps its promise, which is then true.
    const plain = makeSandbox();
    writePlan(plain, ref, functionalBody('Unchecked idea'));
    writeQuestions(plain, ref, [detail('q10-label', 'Label text?', ['Save', 'Store'])], { classified: false });
    route(['stream', 'check', ref], plain);
    const plainText = route(['plan', ref], plain).text;
    assert.match(plainText, /it moves on by itself once they are/);
    assert.equal(plainText.includes('It waits for your approval'), false);
  });

  // Security re-verification at 5908c014: the scanner's exact inputs, through the crossings.
  it("case 58 — a project's own do-178c-level-a copy with Windows line endings: the built plan waits for verification", () => {
    const root = makeSandbox();
    writeSettingsText(root, 'regulatory_regime:\n  active_profiles: [do-178c-level-a]\n');
    const dir = path.join(root, '.ctoc', 'regulatory-regimes');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'do-178c-level-a.yaml'),
      fs.readFileSync(path.join(REPO_REGIMES, 'do-178c-level-a.yaml'), 'utf8').replace(/\n/g, '\r\n'));
    seedBuilt(root, 'c58');
    assertBuiltHeld(root, 'c58', 'independent-verification');
  });

  it('case 58 — a comment line between gdpr and do-178c-level-a in the block list: the built plan waits for verification', () => {
    const root = makeSandbox();
    writeSettingsText(root, 'regulatory_regime:\n  active_profiles:\n    - gdpr\n    # aviation\n    - do-178c-level-a\n');
    seedBuilt(root, 'c58c');
    assertBuiltHeld(root, 'c58c', 'independent-verification');
  });

  it('case 58 — an override `four_eyes_gate3: True`: both crossings wait as unreadable', () => {
    const root = makeSandbox();
    writeSettingsText(root, 'regulatory_regime:\n  active_profiles: []\n  overrides:\n    four_eyes_gate3: True\n');
    const fref = readyPair(root);
    const crossed = [];
    const ds = streamingGate.pendingGateDecisions(root, { crossed });
    assert.deepEqual(crossed, []);
    assert.equal(exists(root, fref), true);
    for (const ref of [fref, 'review/c56r.md']) assert.equal(ds.find((d) => d.ref === ref).regimeHold, 'regime-unreadable', ref);
  });

  it('case 58 — a second regulatory_regime block: both crossings wait as unreadable', () => {
    const root = makeSandbox();
    writeSettingsText(root, 'regulatory_regime:\n  active_profiles: []\nregulatory_regime:\n  active_profiles: [gdpr]\n');
    const fref = readyPair(root);
    const crossed = [];
    const ds = streamingGate.pendingGateDecisions(root, { crossed });
    assert.deepEqual(crossed, []);
    for (const ref of [fref, 'review/c56r.md']) assert.equal(ds.find((d) => d.ref === ref).regimeHold, 'regime-unreadable', ref);
  });

  it('case 58 — a byte-order mark before the header: GDPR is read, so the functional plan waits for the compliance review', () => {
    const root = makeSandbox();
    writeSettingsText(root, '﻿regulatory_regime:\n  active_profiles: [gdpr]\n');
    const fref = readyPair(root);
    const d = descriptorOf(root, fref);
    assert.equal(d.regimeHold, 'compliance-review');
    assert.equal(exists(root, fref), true);
    menuScreens.continueAfterCrossing(root);
    assert.equal(exists(root, 'done/c56r.md'), true, 'a GDPR project still finishes a built plan on its checks');
  });

  it('case 54 — a misspelled profile, no profile folder: the built plan still waits as unreadable', () => {
    const root = makeSandbox();
    setRegime(root, { profiles: ['do-178c-levl-a'], copy: false });
    seedBuilt(root, 'c54m');
    assertBuiltHeld(root, 'c54m', 'regime-unreadable');
  });
});
