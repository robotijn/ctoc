'use strict';

/**
 * Streaming GATE-DECISION screen — the new `/ctoc:menu` default.
 *
 * The core fix: `/ctoc:menu` must ASK the human the pending gate decisions ONE AT
 * A TIME, instead of rendering the navigation dashboard. The plans sitting at the
 * three approvePlan gates (functional→implementation, implementation→todo,
 * review→done) ARE the real questions. This suite drives the REAL functions over a
 * temp project with fixture plans at gates — no mocks of core logic.
 *
 * Hermetic os.tmpdir() sandboxes; every assertion exercises the real exported
 * streaming-gate functions, the real menu-screens `route`, and the real
 * approvePlan + approval ledger.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const streamingGate = require('../src/lib/streaming-gate.js');
const precompute = require('../src/lib/streaming-precompute.js');
const { route } = require('../src/lib/menu-screens.js');

const STAGES = ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
const sandboxes = [];
let counter = 0;

function makeSandbox() {
  const root = path.join(os.tmpdir(), 'ctoc-sgate-' + process.pid + '-' + Date.now() + '-' + counter++);
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

// A functional plan that PASSES validateFunctionalToImpl (problem statement +
// acceptance criteria + scope present).
function validFunctionalBody(slug, extraFrontmatter = '') {
  return `---\ntitle: ${slug} title\n${extraFrontmatter}---\n\n# ${slug} title\n\n` +
    `## Problem Statement\nThe thing is broken.\n\n## Acceptance Criteria\n- [ ] the thing works\n\n## Scope\nThe module.\n`;
}

// A functional plan that FAILS validateFunctionalToImpl (no problem statement, no
// acceptance criteria).
function invalidFunctionalBody(slug) {
  return `# ${slug} title\n\nJust a body, no required sections.\n`;
}

// An implementation plan valid for the queue gate (title + iron_loop short-circuits
// refinement so applyIronLoop is a no-op).
function validImplBody(slug) {
  return `---\niron_loop: true\ntitle: ${slug}\n---\n\n# ${slug} title\n\n## Implementation\nBody.\n`;
}

function ledgerFile(root, slug) {
  return path.join(root, '.ctoc', 'approvals', slug.toLowerCase() + '.json');
}

afterEach(() => {
  while (sandboxes.length) fs.rmSync(sandboxes.pop(), { recursive: true, force: true });
});

describe('pendingGateDecisions — ordered, honest passesValidation, pure read', () => {
  it('lists plans at all three gates with correct fromStage/toStage/gateName', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'func-pass', validFunctionalBody('func-pass'));
    writePlan(root, 'implementation', 'impl-pass', validImplBody('impl-pass'));
    writePlan(root, 'review', 'rev-fail', `# rev-fail\n\nBody.\n`);

    const decisions = streamingGate.pendingGateDecisions(root);
    const bySlug = Object.fromEntries(decisions.map(d => [d.slug, d]));

    assert.equal(decisions.length, 3, 'one decision per gate-source plan');

    assert.deepEqual(
      { from: bySlug['func-pass'].fromStage, to: bySlug['func-pass'].toStage, gate: bySlug['func-pass'].gateName },
      { from: 'functional', to: 'implementation', gate: 'Gate 1' });
    assert.deepEqual(
      { from: bySlug['impl-pass'].fromStage, to: bySlug['impl-pass'].toStage, gate: bySlug['impl-pass'].gateName },
      { from: 'implementation', to: 'todo', gate: 'Gate 2' });
    assert.deepEqual(
      { from: bySlug['rev-fail'].fromStage, to: bySlug['rev-fail'].toStage, gate: bySlug['rev-fail'].gateName },
      { from: 'review', to: 'done', gate: 'Gate 3' });

    // Each carries a plan-view ref of the shape `stage/file.md` (the `plan <ref>`
    // route contract) and a title from the plan.
    assert.equal(bySlug['func-pass'].ref, 'functional/func-pass.md');
    assert.match(bySlug['func-pass'].title, /func-pass title/);
  });

  it('passesValidation is HONEST — true for a valid plan, false for one that fails its gate validator', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'good', validFunctionalBody('good'));
    writePlan(root, 'functional', 'bad', invalidFunctionalBody('bad'));
    writePlan(root, 'review', 'rev-bare', `# rev-bare\n\nBody.\n`); // no verify evidence → fails

    const decisions = streamingGate.pendingGateDecisions(root);
    const bySlug = Object.fromEntries(decisions.map(d => [d.slug, d]));

    assert.equal(bySlug['good'].passesValidation, true, 'a valid functional plan passes');
    assert.equal(bySlug['bad'].passesValidation, false, 'a functional plan missing required sections fails');
    assert.equal(bySlug['rev-bare'].passesValidation, false, 'a bare review plan has no verify evidence → fails');
  });

  it('orders critical-first, then by gate review→implementation→functional (documented order)', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'func-plain', validFunctionalBody('func-plain'));
    writePlan(root, 'functional', 'func-crit', validFunctionalBody('func-crit', 'priority: critical\n'));
    writePlan(root, 'implementation', 'impl-plain', validImplBody('impl-plain'));
    writePlan(root, 'review', 'rev-plain', `# rev-plain\n\nBody.\n`);

    const order = streamingGate.pendingGateDecisions(root).map(d => d.slug);

    // Critical partitions to the very front; the rest follow furthest-along-first.
    assert.deepEqual(order, ['func-crit', 'rev-plain', 'impl-plain', 'func-plain']);
  });

  it('is fail-soft: a bad plan file is skipped, never a crash', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'ok', validFunctionalBody('ok'));
    // A DIRECTORY named like a plan makes readFileSync throw EISDIR; readPlans
    // must skip it and the reader must keep going.
    fs.mkdirSync(path.join(root, 'plans', 'functional', 'broken.md'), { recursive: true });

    const decisions = streamingGate.pendingGateDecisions(root);
    assert.deepEqual(decisions.map(d => d.slug), ['ok'], 'the unreadable entry is skipped, the good one survives');
  });

  it('is fail-soft when an entire stage directory read fails (a stage path replaced by a file)', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'survivor', validFunctionalBody('survivor'));
    // Replace the review/ directory with a FILE — readdirSync throws ENOTDIR; the
    // reader must skip that whole stage and keep the others.
    fs.rmSync(path.join(root, 'plans', 'review'), { recursive: true, force: true });
    fs.writeFileSync(path.join(root, 'plans', 'review'), 'not a directory');

    const decisions = streamingGate.pendingGateDecisions(root);
    assert.deepEqual(decisions.map(d => d.slug), ['survivor'], 'the failed stage is skipped, others survive');
  });

  it('falls back to the slug for a plan with no # heading and no title frontmatter', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'titleless', 'plain body with no markdown heading and no frontmatter\n');
    const [d] = streamingGate.pendingGateDecisions(root);
    assert.equal(d.title, 'titleless', 'title falls back to the slug');
  });
});

describe('streamingGateScreen — a focused single-decision question', () => {
  it('returns a well-formed { text, ask, actions } for the FIRST pending decision', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'first-plan', validFunctionalBody('first-plan'));

    const screen = streamingGate.streamingGateScreen(root);

    // Contract shape.
    assert.equal(typeof screen.text, 'string');
    assert.ok(screen.ask && Array.isArray(screen.ask.questions) && screen.ask.questions.length >= 1);
    assert.ok(screen.actions && typeof screen.actions === 'object');

    // Topic-labeled header + counter.
    assert.match(screen.text, /Topic: first-plan/);
    assert.match(screen.text, /Gate 1 \(functional → implementation\)/);
    assert.match(screen.text, /decision 1 of 1/);

    const q = screen.ask.questions[0];
    assert.match(q.question, /Approve first-plan across Gate 1\?/);
    assert.equal(q.header, 'Gate 1');
  });

  it('recommends Approve (first option) ONLY when the plan passes validation', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'clean', validFunctionalBody('clean'));

    const screen = streamingGate.streamingGateScreen(root);
    const opts = screen.ask.questions[0].options;

    assert.equal(opts[0].label, 'Approve', 'Approve is the recommended (first) option on a clean plan');
    assert.match(opts[0].description, /Recommended/i);
    // Open is present but NOT recommended.
    const open = opts.find(o => o.label === 'Open the plan');
    assert.ok(open, 'Open the plan is offered');
    assert.doesNotMatch(open.description, /Recommended/i);
  });

  it('recommends Open the plan (first option) when the plan FAILS validation — never recommends approving it', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'dirty', invalidFunctionalBody('dirty'));

    const screen = streamingGate.streamingGateScreen(root);
    const opts = screen.ask.questions[0].options;

    assert.equal(opts[0].label, 'Open the plan', 'Open is the recommended (first) option when validation fails');
    assert.match(opts[0].description, /Recommended/i);
    const approve = opts.find(o => o.label === 'Approve');
    assert.ok(approve, 'Approve is still offered (buried)');
    assert.doesNotMatch(approve.description, /Recommended/i, 'a failing plan is never recommended for approval');
  });

  it('maps replies: Approve→stream approve, Open→plan, Skip→stream skip, Other→stream comment', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'mapme', validFunctionalBody('mapme'));

    const screen = streamingGate.streamingGateScreen(root);
    assert.equal(screen.actions['Approve'], 'stream approve functional/mapme.md');
    assert.equal(screen.actions['Open the plan'], 'plan functional/mapme.md');
    assert.equal(screen.actions['Skip for now'], 'stream skip functional/mapme.md');
    assert.equal(screen.actions['Other'], 'stream comment functional/mapme.md');
  });

  it('no pending decisions → a "nothing pending" screen, NOT the dashboard', () => {
    const root = makeSandbox(); // empty plan dirs

    const screen = streamingGate.streamingGateScreen(root);
    assert.match(screen.text, /No gate decisions pending/i);
    // It offers to start new / open the dashboard, and is NOT the pipeline dashboard.
    assert.equal(screen.actions['Open the dashboard'], 'dashboard');
    assert.ok('Start something new' in screen.actions);
    assert.doesNotMatch(screen.text, /▼ Business/, 'the classic pipeline dashboard is not the nothing-pending screen');
    assert.notEqual(screen.ask.questions[0].header, 'Pipeline');
  });
});

describe('route wiring — stream approve / skip / comment / dashboard', () => {
  it('`stream approve` on a VALID plan crosses the gate (approved_by: human), moves it, and returns the next decision', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'cross-me', validFunctionalBody('cross-me'));
    writePlan(root, 'functional', 'next-up', validFunctionalBody('next-up'));

    const screen = route(['stream', 'approve', 'functional/cross-me.md'], root);

    // The plan crossed: moved out of functional/, into implementation/, ledgered.
    assert.ok(!fs.existsSync(path.join(root, 'plans', 'functional', 'cross-me.md')), 'left functional/');
    assert.ok(fs.existsSync(path.join(root, 'plans', 'implementation', 'cross-me.md')), 'landed in implementation/');
    const entry = JSON.parse(fs.readFileSync(ledgerFile(root, 'cross-me'), 'utf8'));
    assert.equal(entry.approved_by, 'human', 'the reply IS the human gate approval');

    // The screen reports what happened and shows the NEXT pending decision.
    assert.match(screen.text, /cross-me/, 'status names the just-approved plan');
    assert.match(screen.text, /Topic: next-up/, 'advances to the next pending decision');
  });

  it('`stream approve` on an INVALID plan surfaces the refusal and does NOT move it', () => {
    const root = makeSandbox();
    // A bare review plan fails validateReviewToDone; approvePlan REFUSES by default.
    const planPath = writePlan(root, 'review', 'refuse-me', `# refuse-me\n\nBody.\n`);
    const before = fs.readFileSync(planPath, 'utf8');

    const screen = route(['stream', 'approve', 'review/refuse-me.md'], root);

    // Unmoved, unchanged, unledgered.
    assert.ok(fs.existsSync(planPath), 'plan stays in review/');
    assert.equal(fs.readFileSync(planPath, 'utf8'), before, 'refused plan is byte-identical');
    assert.ok(!fs.existsSync(path.join(root, 'plans', 'done', 'refuse-me.md')), 'nothing landed in done/');
    assert.ok(!fs.existsSync(ledgerFile(root, 'refuse-me')), 'no ledger entry for a refused crossing');

    // The refusal is surfaced honestly in the returned screen.
    assert.match(screen.text, /refus/i, 'the screen reports the refusal');
  });

  it('`stream skip` advances to the next pending decision without changing the plan', () => {
    const root = makeSandbox();
    // Two review plans (same gate, FIFO by birthtime): skip the first → see the second.
    const first = writePlan(root, 'review', 'skip-a', `# skip-a\n\nBody.\n`);
    // ensure deterministic ordering: write b after a
    const second = writePlan(root, 'review', 'skip-b', `# skip-b\n\nBody.\n`);
    const beforeA = fs.readFileSync(first, 'utf8');

    const screen = route(['stream', 'skip', 'review/skip-a.md'], root);

    // skip-a untouched.
    assert.equal(fs.readFileSync(first, 'utf8'), beforeA, 'skip does not change the plan');
    assert.ok(fs.existsSync(first) && fs.existsSync(second), 'both plans still resident');
    // The next decision is shown (skip-b), not skip-a again.
    assert.match(screen.text, /Topic: skip-b/, 'skip advances past skip-a to the next decision');
  });

  it('`stream comment` records the free-text comment WITHOUT editing the plan or crossing a gate, then advances', () => {
    const root = makeSandbox();
    const planPath = writePlan(root, 'review', 'comment-me', `# comment-me\n\nBody.\n`);
    writePlan(root, 'review', 'comment-next', `# comment-next\n\nBody.\n`);
    const before = fs.readFileSync(planPath, 'utf8');

    const screen = route(['stream', 'comment', 'review/comment-me.md', 'this', 'needs', 'more', 'tests'], root);

    // Plan body untouched, no gate crossing.
    assert.equal(fs.readFileSync(planPath, 'utf8'), before, 'comment does not edit the plan body');
    assert.ok(fs.existsSync(planPath), 'plan stays in review/');

    // Comment recorded to the append-only log.
    const log = path.join(root, '.ctoc', 'streaming', 'comments.jsonl');
    assert.ok(fs.existsSync(log), 'the comment log was written');
    const lines = fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].ref, 'review/comment-me.md');
    assert.match(lines[0].comment, /this needs more tests/);

    // Screen confirms and advances.
    assert.match(screen.text, /comment/i, 'the screen notes the comment was recorded');
    assert.match(screen.text, /Topic: comment-next/, 'advances to the next decision');
  });

  it('the `dashboard` route still returns the classic pipeline overview (dashboard stays reachable)', () => {
    const root = makeSandbox();
    const screen = route(['dashboard'], root);
    assert.equal(screen.ask.questions[0].header, 'Pipeline', 'the dashboard is reachable via the explicit dashboard route');
    assert.match(screen.text, /▼ Business/);
  });

  it('bare `stream` (no sub-command) returns the streaming gate screen', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'bare-stream', validFunctionalBody('bare-stream'));
    const screen = route(['stream'], root);
    assert.match(screen.text, /Topic: bare-stream/);
  });

  it('an unsafe/malformed ref is refused safely (no crash, no traversal)', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'safe-plan', validFunctionalBody('safe-plan'));
    // A traversal ref must never be joined + approved; it degrades to a screen.
    const screen = route(['stream', 'approve', 'functional/../../etc/passwd'], root);
    assert.ok(screen && screen.ask && Array.isArray(screen.ask.questions), 'still a valid screen, no throw');
    // The good plan is untouched.
    assert.ok(fs.existsSync(path.join(root, 'plans', 'functional', 'safe-plan.md')));
  });

  it('`stream approve` on a missing plan file surfaces the error without crashing', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'present', validFunctionalBody('present'));
    // A well-formed ref whose file does not exist → approvePlan throws inside its
    // validator (no such file); streamApprove catches and reports it.
    const screen = route(['stream', 'approve', 'functional/ghost.md'], root);
    assert.match(screen.text, /Could not approve ghost\.md/i, 'the read error is surfaced');
    // The present plan is untouched and still pending.
    assert.ok(fs.existsSync(path.join(root, 'plans', 'functional', 'present.md')));
  });

  it('`stream comment` with a malformed ref is ignored safely (no log write, no crash)', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'safe', validFunctionalBody('safe'));
    const screen = route(['stream', 'comment', 'no-slash-ref', 'some', 'text'], root);
    assert.match(screen.text, /Ignored a comment for an invalid reference/i);
    assert.ok(!fs.existsSync(path.join(root, '.ctoc', 'streaming', 'comments.jsonl')), 'no log written for a bad ref');
  });

  it('`stream comment` surfaces a write failure without crashing (log path blocked by a file)', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'blocked', `# blocked\n\nBody.\n`);
    // Make `.ctoc/streaming` a FILE so the append target directory cannot exist.
    fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
    fs.writeFileSync(path.join(root, '.ctoc', 'streaming'), 'i am a file, not a dir');
    const screen = route(['stream', 'comment', 'review/blocked.md', 'note'], root);
    assert.match(screen.text, /Could not record the comment for blocked\.md/i, 'the write failure is surfaced');
  });

  it('`stream skip` on a malformed ref still advances safely (no crash)', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'only', validFunctionalBody('only'));
    const screen = route(['stream', 'skip', 'garbage-ref'], root);
    // Ref not found → index 0 → shows the first pending decision.
    assert.ok(screen && screen.ask && Array.isArray(screen.ask.questions));
    assert.match(screen.text, /Skipped garbage-ref/i);
  });
});

// ── PRE-COMPUTE integration: the screen reads ALREADY-WRITTEN questions ─────────

function planMtimeMs(root, stage, slug) {
  return fs.statSync(path.join(root, 'plans', stage, slug + '.md')).mtimeMs;
}

// A precomputed two-question set with pros/cons + a recommended option each.
function precomputedQuestions() {
  return [
    {
      id: 'db',
      prompt: 'Which database engine?',
      critical: true,
      options: [
        { key: 'pg', label: 'Postgres', recommended: true, pros: 'RLS, mature', cons: 'More ops' },
        { key: 'sqlite', label: 'SQLite', pros: 'Zero-config', cons: 'No concurrency' },
      ],
    },
    {
      id: 'auth',
      prompt: 'Which auth provider?',
      options: [
        { key: 'clerk', label: 'Clerk', recommended: true, description: 'Managed auth' },
        { key: 'roll', label: 'Roll your own', description: 'Full control' },
      ],
    },
  ];
}

describe('streamingGateScreen — precomputed questions vs simple-Approve fallback', () => {
  it('asks the FIRST precomputed question (not the simple Approve) and routes options to `stream answer`', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'rich', validFunctionalBody('rich'));
    precompute.writePlanQuestions(root, 'functional/rich.md', precomputedQuestions(), planMtimeMs(root, 'functional', 'rich'));

    const screen = streamingGate.streamingGateScreen(root);
    const q = screen.ask.questions[0];

    // The prompt is the precomputed question, NOT the simple "Approve … across Gate 1?".
    assert.match(q.question, /Which database engine\?/);
    assert.doesNotMatch(q.question, /Approve rich across/);
    // Progress reflects the precomputed question index.
    assert.match(screen.text, /question 1 of 2/i);

    // The recommended option is marked; each option routes to `stream answer`.
    const pg = q.options.find(o => o.label === 'Postgres');
    assert.ok(pg, 'the Postgres option is present');
    assert.match(pg.description, /Recommended/i);
    assert.match(pg.description, /RLS/, 'pros are surfaced in the description');
    assert.equal(screen.actions['Postgres'], 'stream answer functional/rich.md db pg');
    assert.equal(screen.actions['SQLite'], 'stream answer functional/rich.md db sqlite');

    // Skip / Open / comment are preserved.
    assert.equal(screen.actions['Skip for now'], 'stream skip functional/rich.md');
    assert.equal(screen.actions['Open the plan'], 'plan functional/rich.md');
    assert.equal(screen.actions['Other'], 'stream comment functional/rich.md');
  });

  it('falls back to the simple Approve question when NO precomputed file exists', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'plain', validFunctionalBody('plain'));

    const screen = streamingGate.streamingGateScreen(root);
    assert.match(screen.ask.questions[0].question, /Approve plain across Gate 1\?/);
    assert.equal(screen.actions['Approve'], 'stream approve functional/plain.md');
  });

  it('answering the LAST fork CROSSES the plan by sufficiency — the human approves nothing (X6)', () => {
    const root = makeSandbox();
    const p = writePlan(root, 'functional', 'seq', validFunctionalBody('seq'));
    // ONE FORK, so answering it makes the plan sufficient (enough information to build).
    const oneFork = [{
      id: 'db',
      prompt: 'Which database engine?',
      critical: true,
      options: [
        { key: 'pg', label: 'Postgres', recommended: true, pros: 'RLS' },
        { key: 'sqlite', label: 'SQLite', cons: 'No concurrency' },
      ],
    }];
    precompute.writePlanQuestions(root, 'functional/seq.md', oneFork, planMtimeMs(root, 'functional', 'seq'));

    // Answer the only fork → the plan has ENOUGH INFORMATION → it CROSSES automatically.
    const after = route(['stream', 'answer', 'functional/seq.md', 'db', 'pg'], root);

    // Pre-X6 this screen offered "Approve seq across Gate 1?". X6 replaces that: the
    // plan crossed as a SUFFICIENCY entry and the human never saw an Approve button.
    assert.ok(!fs.existsSync(p), 'seq left functional/ by itself');
    assert.ok(fs.existsSync(path.join(root, 'plans', 'implementation', 'seq.md')), 'landed in implementation/');
    const entry = JSON.parse(fs.readFileSync(ledgerFile(root, 'seq'), 'utf8'));
    assert.equal(entry.advanced_by, 'sufficiency', 'crossed by sufficiency, not a human approval');
    assert.equal(entry.approved_by, undefined, 'the human approved NOTHING');
    assert.notEqual(after.actions && after.actions['Approve'], 'stream approve functional/seq.md',
      'no Gate-1 Approve is offered for a plan that already crossed');
  });

  it('advances through MULTIPLE fork questions, then the LAST answer CROSSES the plan (X6)', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'multi', validFunctionalBody('multi'));
    // TWO FORKS: answering the first leaves a fork open, so the human steps to the second.
    const twoForks = [
      { id: 'db', prompt: 'Which database engine?', critical: true,
        options: [{ key: 'pg', label: 'Postgres', recommended: true }, { key: 'sqlite', label: 'SQLite' }] },
      { id: 'auth', prompt: 'Which auth provider?', critical: true,
        options: [{ key: 'clerk', label: 'Clerk', recommended: true }, { key: 'roll', label: 'Roll your own' }] },
    ];
    precompute.writePlanQuestions(root, 'functional/multi.md', twoForks, planMtimeMs(root, 'functional', 'multi'));

    // Answer fork 1 (db) → fork 2 (auth) still open → NOT sufficient → screen asks auth.
    const afterFirst = route(['stream', 'answer', 'functional/multi.md', 'db', 'pg'], root);
    assert.match(afterFirst.ask.questions[0].question, /Which auth provider\?/);
    assert.match(afterFirst.text, /question 2 of 2/i);
    assert.equal(afterFirst.actions['Clerk'], 'stream answer functional/multi.md auth clerk');
    assert.ok(fs.existsSync(path.join(root, 'plans', 'functional', 'multi.md')), 'a fork is still open → stays put');

    // Answer fork 2 (auth) → every fork answered → the plan CROSSES automatically.
    route(['stream', 'answer', 'functional/multi.md', 'auth', 'clerk'], root);
    assert.ok(!fs.existsSync(path.join(root, 'plans', 'functional', 'multi.md')), 'crossed out of functional/');
    assert.ok(fs.existsSync(path.join(root, 'plans', 'implementation', 'multi.md')), 'landed in implementation/');
    assert.equal(JSON.parse(fs.readFileSync(ledgerFile(root, 'multi'), 'utf8')).advanced_by, 'sufficiency');
  });
});

describe('route wiring — `stream answer` records the answer, never crosses a gate or edits the plan', () => {
  it('records the answer and leaves the plan byte-identical + in place while a fork is still open', () => {
    const root = makeSandbox();
    const planPath = writePlan(root, 'functional', 'ans', validFunctionalBody('ans'));
    const before = fs.readFileSync(planPath, 'utf8');
    // TWO FORKS; answer only one, so the plan is NOT yet sufficient and must not cross.
    const twoForks = [
      { id: 'db', prompt: 'db?', critical: true,
        options: [{ key: 'pg', label: 'Postgres', recommended: true }, { key: 'sqlite', label: 'SQLite' }] },
      { id: 'auth', prompt: 'auth?', critical: true,
        options: [{ key: 'clerk', label: 'Clerk', recommended: true }, { key: 'roll', label: 'Roll' }] },
    ];
    precompute.writePlanQuestions(root, 'functional/ans.md', twoForks, planMtimeMs(root, 'functional', 'ans'));

    route(['stream', 'answer', 'functional/ans.md', 'db', 'pg'], root);

    // Plan untouched, unmoved — a fork (auth) is still open, so it is not sufficient.
    assert.equal(fs.readFileSync(planPath, 'utf8'), before, 'the plan body is never edited');
    assert.ok(fs.existsSync(planPath), 'plan stays in functional/ while a fork is open');
    assert.ok(!fs.existsSync(path.join(root, 'plans', 'implementation', 'ans.md')), 'nothing crossed the gate');
    assert.ok(!fs.existsSync(ledgerFile(root, 'ans')), 'no ledger entry while not yet sufficient');

    // Answer recorded to the append-only log.
    const log = path.join(root, '.ctoc', 'streaming', 'answers.jsonl');
    assert.ok(fs.existsSync(log), 'the answers log was written');
    const lines = fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].ref, 'functional/ans.md');
    assert.equal(lines[0].questionId, 'db');
    assert.equal(lines[0].optionKey, 'pg');
  });

  it('a malformed ref on `stream answer` is ignored safely (no log, no crash)', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'safe', validFunctionalBody('safe'));
    const screen = route(['stream', 'answer', 'no-slash-ref', 'q', 'k'], root);
    assert.ok(screen && screen.ask && Array.isArray(screen.ask.questions), 'still a valid screen');
    assert.ok(!fs.existsSync(path.join(root, '.ctoc', 'streaming', 'answers.jsonl')), 'no log for a bad ref');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// X6 — THE GATE CROSSES ITSELF. Enough information advances the plan; the human
// approves nothing.
//
// `streaming-precompute.hasEnoughInformation` is the predicate for the owner's
// load-bearing principle: "the gate is enough information, not human approval".
// W1 wired the verdict to the screen for DISPLAY only, because auto-crossing was
// unsafe while `approval-ledger.entryKind` classified an unrecognised
// `advanced_by` as `'human'` (that default would forge the human's approval). X5
// closed that hole — an unrecognised provenance now fails closed to `'unknown'` —
// so X6 makes the verdict ACT: when `enough === true` at a PRE-BUILD gate, the
// plan crosses itself through a SUFFICIENCY ledger entry (advanced_by:
// 'sufficiency', evidence, and NO approved_by) and leaves the pending list.
//
// FAIL CLOSED EVERYWHERE ELSE. An unanswered fork, never-computed questions, a
// failing validation, or the done/ gate all keep the plan exactly where it is —
// X6 adds an automatic YES, never an automatic NO, and never silences a question.
// ─────────────────────────────────────────────────────────────────────────────

/** A question in the real Question contract. `critical: true` makes it a FORK. */
function forkQuestion(id) {
  return {
    id,
    prompt: `Which store backs ${id}?`,
    critical: true,
    options: [
      { key: 'pg', label: 'Postgres', recommended: true, pros: 'Relational.', cons: 'Ops cost.' },
      { key: 'sqlite', label: 'SQLite', pros: 'Zero ops.', cons: 'Single writer.' },
    ],
  };
}

/** A `normal` question — a detail, resolvable while building. Never a fork. */
function detailQuestion(id) {
  return {
    id,
    prompt: `What should ${id} be called?`,
    options: [{ key: 'a', label: 'Option A', recommended: true }],
  };
}

describe('X6 — pendingGateDecisions CROSSES a sufficient plan and leaves the pending list', () => {
  // Case 8 — the whole point: enough information crosses the pre-build gate itself.
  it('case 8 — a plan with enough information CROSSES the pre-build gate and leaves the list', () => {
    const root = makeSandbox();
    const p = writePlan(root, 'functional', 'suff-ok', validFunctionalBody('suff-ok'));
    const ref = 'functional/suff-ok.md';
    precompute.writePlanQuestions(root, ref, [forkQuestion('db')], fs.statSync(p).mtimeMs);
    // The REAL answer writer — the predicate reads the log this produces.
    streamingGate.streamAnswer(ref, 'db', 'pg', root);

    const decisions = streamingGate.pendingGateDecisions(root);

    // It crossed itself: gone from the functional pending list, moved to implementation/,
    // recorded as a SUFFICIENCY entry (never a human approval).
    assert.ok(!decisions.some((x) => x.ref === ref), 'the sufficient plan left the functional pending list');
    assert.ok(!fs.existsSync(p), 'left functional/ by itself');
    assert.ok(fs.existsSync(path.join(root, 'plans', 'implementation', 'suff-ok.md')), 'landed in implementation/');
    const entry = JSON.parse(fs.readFileSync(ledgerFile(root, 'suff-ok'), 'utf8'));
    assert.equal(entry.advanced_by, 'sufficiency', 'crossed by sufficiency');
    assert.equal(entry.approved_by, undefined, 'the human approved NOTHING');
    assert.equal(entry.stage_to, 'implementation');
    assert.match(entry.evidence, /suff-ok/, 'evidence names the plan …');
    assert.match(entry.evidence, /db/, '… and reconstructs the answered fork');
  });

  // Case 9 — the no-automatic-NO guard. GREEN before AND after X6.
  it('case 9 — a plan with an UNANSWERED fork does NOT cross and stays pending (no automatic NO)', () => {
    const root = makeSandbox();
    const p = writePlan(root, 'functional', 'suff-fork', validFunctionalBody('suff-fork'));
    const ref = 'functional/suff-fork.md';
    precompute.writePlanQuestions(root, ref, [forkQuestion('db'), detailQuestion('name')], fs.statSync(p).mtimeMs);
    // Deliberately answer NOTHING.

    const d = streamingGate.pendingGateDecisions(root).find((x) => x.ref === ref);
    assert.ok(d, 'an unanswered FORK keeps the plan pending — the implementer would guess');
    assert.equal(d.enough, false);
    assert.equal(d.sufficiencyReason, 'open-forks');
    assert.deepEqual(d.unansweredQuestionIds, ['db', 'name'], 'every open question reported honestly');
    assert.deepEqual(d.blockingQuestionIds, ['db'], 'only the critical one is a fork');
    // Nothing moved, nothing ledgered.
    assert.ok(fs.existsSync(p), 'still in functional/');
    assert.ok(!fs.existsSync(ledgerFile(root, 'suff-fork')), 'no ledger entry — nothing crossed');
  });

  // Case 10 — fail closed on never-computed. GREEN before AND after X6.
  it('case 10 — a plan whose questions were NEVER COMPUTED does NOT cross (fail closed)', () => {
    const root = makeSandbox();
    const p = writePlan(root, 'functional', 'suff-none', validFunctionalBody('suff-none'));

    const d = streamingGate.pendingGateDecisions(root).find((x) => x.ref === 'functional/suff-none.md');
    // ABSENCE OF EVIDENCE IS NOT EVIDENCE OF SUFFICIENCY. Not `true`, not a crash, not a cross.
    assert.equal(d.enough, false, 'never-computed must never read as "enough" — we simply do not KNOW');
    assert.equal(d.sufficiencyReason, 'not-computed');
    assert.ok(fs.existsSync(p), 'not moved');
    assert.ok(!fs.existsSync(ledgerFile(root, 'suff-none')), 'no ledger entry');
  });

  // Case 11 — idempotent: running the read twice writes ONE entry, never re-crosses.
  it('case 11 — the auto-cross is IDEMPOTENT: two passes write ONE entry, never a second cross', () => {
    const root = makeSandbox();
    const p = writePlan(root, 'functional', 'suff-idem', validFunctionalBody('suff-idem'));
    const ref = 'functional/suff-idem.md';
    precompute.writePlanQuestions(root, ref, [forkQuestion('db')], fs.statSync(p).mtimeMs);
    streamingGate.streamAnswer(ref, 'db', 'pg', root);

    streamingGate.pendingGateDecisions(root); // first pass: crosses
    const entryPath = ledgerFile(root, 'suff-idem');
    assert.ok(fs.existsSync(entryPath), 'crossed on the first pass');
    const first = fs.readFileSync(entryPath, 'utf8');

    streamingGate.pendingGateDecisions(root); // second pass: must NOT re-cross or rewrite
    const second = fs.readFileSync(entryPath, 'utf8');
    assert.equal(first, second, 'the entry is byte-identical — no second write, no re-cross');
    assert.ok(fs.existsSync(path.join(root, 'plans', 'implementation', 'suff-idem.md')), 'still resident once');
  });

  // Case 12 — walk the ledger: no sufficiency entry anywhere carries approved_by.
  it('case 12 — no sufficiency entry carries approved_by; each carries evidence', () => {
    const root = makeSandbox();
    const p = writePlan(root, 'functional', 'suff-walk', validFunctionalBody('suff-walk'));
    const ref = 'functional/suff-walk.md';
    precompute.writePlanQuestions(root, ref, [forkQuestion('db')], fs.statSync(p).mtimeMs);
    streamingGate.streamAnswer(ref, 'db', 'pg', root);
    streamingGate.pendingGateDecisions(root); // cross

    const dir = path.join(root, '.ctoc', 'approvals');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    assert.ok(files.length >= 1, 'at least one entry was written by the cross');
    let sufficiencyEntries = 0;
    for (const f of files) {
      const e = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (e.advanced_by === 'sufficiency') {
        sufficiencyEntries++;
        assert.equal(e.approved_by, undefined, `sufficiency entry ${f} must carry NO approved_by`);
        assert.ok(typeof e.evidence === 'string' && e.evidence.length > 0,
          `sufficiency entry ${f} must carry reconstructable evidence`);
      }
    }
    assert.ok(sufficiencyEntries >= 1, 'the cross wrote a sufficiency entry');
  });
});

describe('W1 — wiring the predicate did not create a REQUIRE CYCLE', () => {
  // WHY A FRESH PROCESS: a cycle is a LOAD-ORDER defect. In this suite both modules
  // are already required at the top, so the cache hides it. Only a cold process in a
  // controlled order can observe a partially-initialised module.
  //
  // WHAT A REAL CYCLE LOOKS LIKE (measured, not assumed): it needs BOTH edges at
  // load time. Node then hands the second module a partially-initialised export
  // object — the missing name reads `undefined` and Node prints
  // "Warning: Accessing non-existent property … inside circular dependency".
  // Both assertions below detect exactly that, so this case CAN fail: restore a
  // top-level `require('./streaming-precompute')` to streaming-precompute's own
  // importer and it breaks. (Verified by mutation — see the plan's Step 8 report.)
  function loadInOrder(first, second) {
    const script = `
      const a = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'lib', first))});
      const b = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'lib', second))});
      const pick = (m) => Object.keys(m).sort();
      process.stdout.write(JSON.stringify({ first: pick(a), second: pick(b) }));
    `;
    const r = require('node:child_process').spawnSync(process.execPath, ['-e', script], {
      encoding: 'utf8',
      cwd: path.join(__dirname, '..'),
    });
    return { ...r, parsed: r.stdout ? JSON.parse(r.stdout) : null };
  }

  it('streaming-gate FIRST, then streaming-precompute → both fully export, no cycle warning', () => {
    const r = loadInOrder('streaming-gate.js', 'streaming-precompute.js');
    assert.equal(r.status, 0, `a cold load must not fail. stderr: ${r.stderr}`);
    assert.ok(
      r.parsed.first.includes('pendingGateDecisions'),
      `streaming-gate must export pendingGateDecisions; a cycle would drop it. got ${JSON.stringify(r.parsed.first)}`
    );
    assert.ok(
      r.parsed.second.includes('hasEnoughInformation'),
      `streaming-precompute must export hasEnoughInformation. got ${JSON.stringify(r.parsed.second)}`
    );
    assert.ok(
      !/circular dependency/i.test(r.stderr),
      `Node reported a circular dependency — the wiring introduced a load-time cycle:\n${r.stderr}`
    );
  });

  it('streaming-precompute FIRST, then streaming-gate → both fully export, no cycle warning', () => {
    const r = loadInOrder('streaming-precompute.js', 'streaming-gate.js');
    assert.equal(r.status, 0, `a cold load must not fail. stderr: ${r.stderr}`);
    assert.ok(r.parsed.first.includes('hasEnoughInformation'), 'precompute exports its predicate');
    assert.ok(
      r.parsed.second.includes('pendingGateDecisions'),
      `streaming-gate must export pendingGateDecisions in this order too. got ${JSON.stringify(r.parsed.second)}`
    );
    assert.ok(
      !/circular dependency/i.test(r.stderr),
      `Node reported a circular dependency in the reverse load order:\n${r.stderr}`
    );
  });

  it('the sufficiency verdict SURVIVES a cold gate-first load (the real menu path)', () => {
    // The end-to-end guard: the lazy require must actually resolve at CALL time in a
    // process that never loaded precompute first. If the wiring is absent or the
    // lazy require is broken, `enough` is undefined here and this fails.
    const root = makeSandbox();
    writePlan(root, 'functional', 'cold', validFunctionalBody('cold'));
    const script = `
      const gate = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'lib', 'streaming-gate.js'))});
      const d = gate.pendingGateDecisions(${JSON.stringify(root)});
      process.stdout.write(JSON.stringify(d.map((x) => ({ ref: x.ref, enough: x.enough, reason: x.sufficiencyReason }))));
    `;
    const r = require('node:child_process').spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
    assert.equal(r.status, 0, `cold gate-first call must not throw. stderr: ${r.stderr}`);
    const decisions = JSON.parse(r.stdout);
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].enough, false, 'the predicate ran cold and failed closed');
    assert.equal(decisions[0].reason, 'not-computed', 'the real predicate answered, not a default');
  });
});
