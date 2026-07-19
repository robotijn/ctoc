'use strict';

/**
 * X7 — SESSION-DRIVEN startup dispatch. On `ctoc` start, the SESSION MODEL (not a
 * spawned second Claude) dispatches up to 5 subagents to find open issues and
 * generate their questions. The mechanism is a plain INJECTED DIRECTIVE: SessionStart
 * appends an instruction to the context it prints, and the model acts on it.
 *
 * These cases pin the four load-bearing facts of that correction:
 *   1. the directive is present, and names the right things, ONLY when a plan needs
 *      questions;
 *   2. it is ABSENT (no session-start noise) when nothing is pending;
 *   3. the three producer agents name the store-writer `writePlanQuestions` — the
 *      real write path AND the instruction-surface anchor that keeps that export live
 *      after the `claude -p` producer is deleted;
 *   4. the `claude -p` machinery (streaming-producer.js, produce-questions.js) is
 *      gone, no model subprocess remains in the streaming path, the dead-code fence
 *      stays at zero, and `writePlanQuestions` stays a LIVE export.
 *
 * Hermetic os.tmpdir() sandboxes; the directive is driven over the REAL
 * `plansNeedingQuestions` → `pendingGateDecisions` read. No model, no spawn.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sessionStart = require('../src/hooks/SessionStart.js');
const reachability = require('../src/lib/reachability.js');

const ROOT = path.join(__dirname, '..');
const STAGES = ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
const sandboxes = [];
let counter = 0;

function makeSandbox() {
  const root = path.join(os.tmpdir(), 'ctoc-sstart-' + process.pid + '-' + Date.now() + '-' + counter++);
  for (const stage of STAGES) fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
  sandboxes.push(root);
  return root;
}

// A functional plan that reads as a valid pending decision at Gate 1 — enough for
// pendingGateDecisions to list it, and (with no questions file) to report it as
// needing questions.
function validFunctionalBody(slug) {
  return `---\ntitle: ${slug} title\n---\n\n# ${slug} title\n\n` +
    `## Problem Statement\nUsers hit a wall.\n\n## Acceptance Criteria\n- [ ] the wall is gone\n\n## Scope\nThe module.\n`;
}

afterEach(() => {
  while (sandboxes.length) fs.rmSync(sandboxes.pop(), { recursive: true, force: true });
});

describe('X7 — SessionStart injects the session-driven question-dispatch directive', () => {
  it('case 1 — a plan needs questions → the directive names "up to 5", the producer agents, writePlanQuestions, and the plan ref', () => {
    const root = makeSandbox();
    fs.writeFileSync(path.join(root, 'plans', 'functional', 'magic.md'), validFunctionalBody('magic'));

    const directive = sessionStart.questionDispatchDirective(root);

    assert.ok(typeof directive === 'string' && directive.length > 0, 'a directive is produced');
    assert.match(directive, /up to 5/i, 'the concurrency cap is stated');
    assert.match(directive, /product-owner/, 'the functional producer is named');
    assert.match(directive, /vision-advisor/, 'the vision producer is named');
    assert.match(directive, /implementation-planner/, 'the implementation producer is named');
    assert.match(directive, /premortem-critic/, 'the adversarial critics are named');
    assert.match(directive, /devils-advocate-critic/);
    assert.match(directive, /red-team-critic/);
    assert.match(directive, /writePlanQuestions/, 'the store-writer is named');
    assert.match(directive, /streaming-precompute/, 'the store module is named');
    assert.match(directive, /functional\/magic\.md/, 'the plan needing questions is listed by ref');
    assert.doesNotMatch(directive, /claude -p/, 'no second-Claude spawn is instructed');
  });

  it('case 2 — nothing pending → the directive is EMPTY (no session-start noise)', () => {
    const root = makeSandbox(); // empty plan dirs, nothing at any gate
    const directive = sessionStart.questionDispatchDirective(root);
    assert.equal(directive, '', 'no directive is injected when no plan needs questions');
  });

  it('case 2b — a fail-soft root degrades to an empty directive, never a throw', () => {
    assert.equal(sessionStart.questionDispatchDirective(''), '');
    assert.equal(sessionStart.questionDispatchDirective(null), '');
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
