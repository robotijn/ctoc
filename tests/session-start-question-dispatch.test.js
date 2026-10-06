'use strict';

/**
 * Session start does NO UNASKED WORK (plan "CTOC does no unasked work at session start
 * or stop", 2026-10-06 — the owner: "this is a big problem fix it").
 *
 * Session start used to append an order — "Before other work, dispatch UP TO 5 CTOC
 * subagents IN THE BACKGROUND" — followed by every plan whose questions were missing,
 * so every user paid minutes of model time before their own request was served, and
 * the injected text grew with every plan in the project. The order is deleted. What
 * remains is ONE line, from the build-loop status (`loop-b-driver`), giving the count
 * and naming the human's own way to ask: choose "Generate its questions" on a plan's
 * decision in /ctoc:start.
 *
 * These cases run the REAL session-start `main()` in-process with the working folder
 * at a scratch project. The ONE boundary stubbed is `plan-index/bootstrap.isBackfillNeeded`
 * (returns false) so no index backfill is kicked; the function under test is never
 * mocked. The global Iron Loop state file each run writes under `~/.ctoc/state/` is
 * removed afterwards.
 *
 * The remaining cases pin what still holds: the three producer agents name the
 * store-writer `writePlanQuestions`, the `claude -p` machinery stays deleted, and the
 * dead-code fence and the live `writePlanQuestions` export are unchanged.
 */

const { describe, it, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sessionStart = require('../src/hooks/SessionStart.js');
const reachability = require('../src/lib/reachability.js');
const bootstrap = require('../src/lib/plan-index/bootstrap');
const crypto = require('../src/lib/crypto');

const ROOT = path.join(__dirname, '..');
const STAGES = ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
const sandboxes = [];
const stateFiles = [];
let counter = 0;

function makeSandbox() {
  const raw = path.join(os.tmpdir(), 'ctoc-sstart-' + process.pid + '-' + Date.now() + '-' + counter++);
  for (const stage of STAGES) fs.mkdirSync(path.join(raw, 'plans', stage), { recursive: true });
  fs.mkdirSync(path.join(raw, '.ctoc'), { recursive: true });
  // realpath so the fixture matches the hash the global state file is keyed by
  // (macOS resolves /var to /private/var).
  const root = fs.realpathSync(raw);
  sandboxes.push(root);
  stateFiles.push(path.join(os.homedir(), '.ctoc', 'state', `${crypto.hashPath(root)}.json`));
  return root;
}

// A functional plan that reads as a valid pending decision — enough for
// pendingGateDecisions to list it, and (with no questions file) to report it as
// needing questions.
function validFunctionalBody(slug) {
  return `---\ntitle: ${slug} title\n---\n\n# ${slug} title\n\n` +
    `## Problem Statement\nUsers hit a wall.\n\n## Acceptance Criteria\n- [ ] the wall is gone\n\n## Scope\nThe module.\n`;
}

/** Run the real session-start main() at `dir`; return the injected context. */
async function sessionContext(dir) {
  const cwd0 = process.cwd();
  const backfill0 = bootstrap.isBackfillNeeded;
  const log0 = console.log;
  const chunks = [];
  bootstrap.isBackfillNeeded = () => false;
  console.log = (...args) => { chunks.push(args.join(' ')); };
  process.chdir(dir);
  try {
    await sessionStart.main();
  } finally {
    process.chdir(cwd0);
    console.log = log0;
    bootstrap.isBackfillNeeded = backfill0;
  }
  return chunks.join('\n');
}

/** `n` functional plans needing questions, slugs about 40 characters long. */
function writeWaitingPlans(root, n) {
  const refs = [];
  for (let i = 0; i < n; i++) {
    const slug = `plan-${String(i).padStart(4, '0')}-a-reasonably-long-slug-here`;
    fs.writeFileSync(path.join(root, 'plans', 'functional', `${slug}.md`), validFunctionalBody(slug));
    refs.push(`functional/${slug}.md`);
  }
  return refs;
}

afterEach(() => {
  while (sandboxes.length) fs.rmSync(sandboxes.pop(), { recursive: true, force: true });
});

after(() => {
  for (const f of stateFiles) fs.rmSync(f, { force: true });
});

const ORDER_PATTERNS = [/Before other work/, /dispatch\s+up\s+to/i, /\bsubagents?\b/i, /writePlanQuestions/];
const AGENT_NAMES = ['product-owner', 'vision-advisor', 'implementation-planner',
  'premortem-critic', 'devils-advocate-critic', 'red-team-critic'];

describe('session start injects no order to act', () => {
  it('case 1 — three plans need questions: no dispatch order, no agent, no plan reference; one count line naming "Generate its questions"', async () => {
    const root = makeSandbox();
    const refs = ['alpha', 'beta', 'gamma'].map((slug) => {
      fs.writeFileSync(path.join(root, 'plans', 'functional', `${slug}.md`), validFunctionalBody(slug));
      return `functional/${slug}.md`;
    });

    const context = await sessionContext(root);

    for (const re of ORDER_PATTERNS) assert.doesNotMatch(context, re, `the context carries an order: ${re}`);
    for (const agent of AGENT_NAMES) assert.ok(!context.includes(agent), `the context names the agent ${agent}`);
    for (const ref of refs) assert.ok(!context.includes(ref), `the context lists the plan reference ${ref}`);
    assert.match(context, /3 plan\(s\) wait for their questions/, 'the one count line is present');
    assert.equal((context.match(/Generate its questions/g) || []).length, 1,
      'the human\'s way to ask is named exactly once');
    assert.equal(sessionStart.questionDispatchDirective, undefined, 'the dispatch directive is deleted, not unwired');
  });

  it('case 2 — size: with 500 plans waiting the context stays under 8,000 characters and grows under 1,000 from 5 plans', async () => {
    const small = makeSandbox();
    writeWaitingPlans(small, 5);
    const big = makeSandbox();
    const refs = writeWaitingPlans(big, 500);

    const smallContext = await sessionContext(small);
    const bigContext = await sessionContext(big);

    assert.ok(bigContext.length < 8000,
      `the 500-plan context is ${bigContext.length} characters; the cap is 8,000`);
    assert.ok(bigContext.length - smallContext.length < 1000,
      `the context grew by ${bigContext.length - smallContext.length} characters from 5 to 500 plans; the cap is 1,000`);
    assert.ok(!refs.some((r) => bigContext.includes(r)), 'no plan reference reaches the context');
    assert.match(bigContext, /500 plan\(s\) wait for their questions/);
  });
});

describe('X7 — the producer agents name the store-writer (instruction-surface anchor)', () => {
  for (const agent of ['product-owner', 'vision-advisor', 'implementation-planner']) {
    it(`case 3 — agents/planning/${agent}.md names writePlanQuestions + streaming-precompute`, () => {
      const text = fs.readFileSync(path.join(ROOT, 'agents', 'planning', agent + '.md'), 'utf8');
      assert.match(text, /writePlanQuestions/, 'the store-writer is named');
      assert.match(text, /streaming-precompute/, 'the store module is named');
    });
  }
});

describe('no instruction surface says session start or the Stop hook orders question generation', () => {
  // Pins the sentences that ORDER or FORBID dispatching (plan "CTOC does no unasked
  // work at session start or stop", acceptance criteria 6 and 7). Exact presence and
  // absence checks on the shipped instruction text.
  for (const agent of ['product-owner', 'vision-advisor', 'implementation-planner']) {
    it(`agents/planning/${agent}.md is dispatched by a brief, never by a session-start directive`, () => {
      const text = fs.readFileSync(path.join(ROOT, 'agents', 'planning', agent + '.md'), 'utf8');
      assert.ok(!text.includes('SessionStart injects'), 'the session-start directive is no longer cited as the dispatcher');
      assert.match(text, /When a dispatch brief asks you to generate the decision questions of an? [a-z]+ plan,/);
    });
  }

  it('agents/iron-loop/premortem-critic.md no longer cites a session-start directive', () => {
    const text = fs.readFileSync(path.join(ROOT, 'agents', 'iron-loop', 'premortem-critic.md'), 'utf8');
    assert.ok(!text.includes('src/hooks/SessionStart.js'), 'no citation of the session-start hook as a dispatcher');
  });

  it('agents/coordinator/cto-chief.md carries no derived approved-queue regime, and says the queue alone never blocks', () => {
    const text = fs.readFileSync(path.join(ROOT, 'agents', 'coordinator', 'cto-chief.md'), 'utf8');
    for (const gone of ['registerQueueFork', 'resolveQueueFork', 'Derived approved-queue regime']) {
      assert.ok(!text.includes(gone), `cto-chief still carries ${gone}`);
    }
    assert.ok(text.includes('An approved build queue alone never blocks a stop'));
  });

  it('src/commands/start.md fires nothing on open and generates for one plan only on request', () => {
    const text = fs.readFileSync(path.join(ROOT, 'src', 'commands', 'start.md'), 'utf8');
    assert.ok(!text.includes('Fire on open'), 'the fire-on-open instruction is gone');
    assert.ok(text.includes('Opening the menu generates no questions.'));
    assert.ok(text.includes('and never for any other plan.'));
  });

  it('CLAUDE.md says session start gives no order and the queue alone never blocks a stop', () => {
    const text = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
    assert.ok(text.includes('An approved build queue alone never blocks a stop.'));
    assert.ok(!text.includes('appends a directive to the injected context telling the SESSION MODEL to dispatch'),
      'the old session-start dispatch description is gone');
  });
});

describe('X7 — the claude -p producer machinery is deleted', () => {
  it('case 4 — streaming-producer.js and produce-questions.js no longer exist', () => {
    assert.ok(!fs.existsSync(path.join(ROOT, 'src', 'lib', 'streaming-producer.js')), 'streaming-producer.js is deleted');
    assert.ok(!fs.existsSync(path.join(ROOT, 'src', 'scripts', 'produce-questions.js')), 'produce-questions.js is deleted');
  });

  it('case 4b — no claude -p / model subprocess remains anywhere in the streaming path', () => {
    for (const rel of ['src/lib/streaming-gate.js', 'src/lib/streaming-precompute.js', 'src/hooks/SessionStart.js']) {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      assert.doesNotMatch(text, /claude -p/, `${rel} must not reference a claude -p spawn`);
      assert.doesNotMatch(text, /child_process/, `${rel} must not spawn a subprocess in the streaming path`);
    }
  });

  it('case 4c — produce-questions.js is no longer a declared reachability root', () => {
    const roots = JSON.parse(fs.readFileSync(path.join(ROOT, '.ctoc', 'reachability-roots.json'), 'utf8'));
    const list = Array.isArray(roots) ? roots : (roots && roots.roots) || [];
    assert.ok(!list.some((r) => String(r).includes('produce-questions')), 'the produce-questions root entry is removed');
  });
});

describe('X7 — the dead-code fence stays green and writePlanQuestions stays live', () => {
  it('case 5 — the deletion stranded nothing: the streaming files are reachable and the fence matches its baseline', () => {
    // This case used to assert `unreachable === []`. That literal zero was never
    // true: it was an artifact of the file fence crediting a BARE PROSE MENTION in
    // markdown as an execution root. The fence now credits only invocations, so
    // the honest global number lives in ONE place — the committed baseline that
    // tests/reachability.test.js ratchets — and this case asserts what it is
    // actually about: the files THIS slice touched are still reachable.
    const { unreachable, reachable } = reachability.analyze(ROOT);
    const baseline = JSON.parse(
      fs.readFileSync(path.join(ROOT, '.ctoc', 'reachability-baseline.json'), 'utf8')
    );
    for (const rel of ['src/lib/streaming-gate.js', 'src/lib/streaming-precompute.js', 'src/hooks/SessionStart.js']) {
      assert.ok(reachable.includes(rel), `${rel} must stay reachable from a live root`);
    }
    assert.deepEqual(
      unreachable.filter((f) => !baseline.unreachable.includes(f)), [],
      'the deletion must not strand any file outside the committed dead-code baseline'
    );
  });

  it('case 5b — writePlanQuestions is a LIVE export (kept live by the instruction surface, no new JS caller)', () => {
    const { dead } = reachability.analyzeExports(ROOT);
    const deadWrite = dead.filter((k) => k.endsWith('#writePlanQuestions'));
    assert.deepEqual(deadWrite, [], 'writePlanQuestions must not become a dead export when its JS caller is deleted');
  });
});
