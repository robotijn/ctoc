/**
 * state.js — dedicated line + branch coverage via REAL temp-dir fixtures.
 *
 * Failure-first, edge-case-first unit tests for src/lib/state.js. No mocking of
 * state.js's own logic: every test builds a real plans/<stage>/*.md tree under an
 * os.tmpdir() sandbox and drives the exported functions against it. The ONE place
 * a collaborator is fault-injected (parseMetadata's lazy `require('./stale-detector')`)
 * exercises the documented fail-open catch — a real behavioural path, restored in a
 * finally so no other test is polluted.
 *
 * Cross-platform: os.tmpdir + path.join throughout; the broken-symlink case guards
 * fs.symlinkSync (EPERM on unprivileged Windows) and still asserts the on-disk
 * invariant when symlinks are unavailable.
 */

'use strict';

const { test, describe, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const state = require('../src/lib/state');
const cache = require('../src/lib/cache');

// ---------------------------------------------------------------------------
// Fixture helpers — real filesystem, no doubles.
// ---------------------------------------------------------------------------

const TMP_ROOTS = [];

function mkProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-state-'));
  TMP_ROOTS.push(root);
  return root;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Write a plan file. `raw` (if supplied) is written verbatim; otherwise a
 * frontmatter block is built from `frontmatter` followed by `body`.
 */
function writePlan(root, stage, name, { frontmatter, body = '', raw } = {}) {
  const dir = path.join(root, 'plans', stage);
  ensureDir(dir);
  const file = path.join(dir, `${name}.md`);
  let content;
  if (typeof raw === 'string') {
    content = raw;
  } else {
    const fmLines = Object.entries(frontmatter || {}).map(([k, v]) => `${k}: ${v}`);
    content = `---\n${fmLines.join('\n')}\n---\n\n${body}`;
  }
  fs.writeFileSync(file, content);
  return file;
}

function writeJson(file, obj) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

function setMtime(file, date) {
  fs.utimesSync(file, date, date);
}

after(() => {
  for (const root of TMP_ROOTS) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
  }
});

// memoize() has a 5s TTL keyed by projectPath. Each test uses a UNIQUE temp
// root, so keys never collide, but we still clear before each test to keep the
// no-arg (findProjectRoot) probes honest across runs.
beforeEach(() => cache.invalidate());

// ===========================================================================
// getPlansDir
// ===========================================================================
describe('getPlansDir', () => {
  test('returns <root>/plans when an explicit project path is given', () => {
    const root = mkProject();

    const dir = state.getPlansDir(root);

    assert.strictEqual(dir, path.join(root, 'plans'));
  });

  test('falls back to findProjectRoot when no path is given', () => {
    // Arrange — no arg exercises the `|| findProjectRoot()` falsy branch.
    const dir = state.getPlansDir();

    // Assert — resolves to an absolute path ending in `plans`.
    assert.strictEqual(path.isAbsolute(dir), true);
    assert.strictEqual(path.basename(dir), 'plans');
  });
});

// ===========================================================================
// readPlans — the load-bearing reader
// ===========================================================================
describe('readPlans', () => {
  test('returns [] for a nonexistent directory', () => {
    const root = mkProject();

    const plans = state.readPlans(path.join(root, 'plans', 'does-not-exist'));

    assert.deepStrictEqual(plans, []);
  });

  test('returns [] for an existing but empty directory', () => {
    const root = mkProject();
    const dir = path.join(root, 'plans', 'review');
    ensureDir(dir);

    const plans = state.readPlans(dir);

    assert.deepStrictEqual(plans, []);
  });

  test('ignores non-markdown files and reads only *.md', () => {
    const root = mkProject();
    const dir = path.join(root, 'plans', 'review');
    ensureDir(dir);
    writePlan(root, 'review', 'real-plan', { frontmatter: { status: 'review' } });
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignore me');
    fs.writeFileSync(path.join(dir, '.gitkeep'), '');

    const plans = state.readPlans(dir);

    assert.strictEqual(plans.length, 1);
    assert.strictEqual(plans[0].name, 'real-plan');
  });

  test('populates the full plan shape (metadata, bgStatus fields, timestamps)', () => {
    const root = mkProject();
    writePlan(root, 'implementation', 'shape-plan', {
      frontmatter: { title: 'Shape', status: 'implementation', priority: 3 },
      body: '## Goal\nDrive shape.',
    });

    const [plan] = state.readPlans(path.join(root, 'plans', 'implementation'));

    assert.strictEqual(plan.name, 'shape-plan');
    assert.strictEqual(plan.metadata.title, 'Shape');
    assert.strictEqual(plan.metadata.priority, 3);
    assert.ok(plan.created instanceof Date);
    assert.ok(plan.modified instanceof Date);
    assert.strictEqual(typeof plan.ago, 'string');
    // No background *.status file exists → readStatus yields 'none'.
    assert.strictEqual(plan.bgStatus, 'none');
    assert.strictEqual(plan.bgAgent, null);
    assert.strictEqual(plan.bgMessage, null);
    assert.strictEqual(typeof plan.bgIcon, 'string');
  });

  test('surfaces a background *.status file into bgAgent/bgMessage', () => {
    const root = mkProject();
    const file = writePlan(root, 'implementation', 'bg-plan', {
      frontmatter: { status: 'implementation' },
    });
    writeJson(`${file}.status`, { status: 'working', agent: 'iron-loop-executor', message: 'building' });

    const [plan] = state.readPlans(path.join(root, 'plans', 'implementation'));

    assert.strictEqual(plan.bgStatus, 'working');
    assert.strictEqual(plan.bgAgent, 'iron-loop-executor');
    assert.strictEqual(plan.bgMessage, 'building');
  });

  test('non-todo stage is FIFO sorted (returns every plan exactly once)', () => {
    const root = mkProject();
    writePlan(root, 'implementation', 'alpha', { frontmatter: { status: 'implementation' } });
    writePlan(root, 'implementation', 'beta', { frontmatter: { status: 'implementation' } });
    writePlan(root, 'implementation', 'gamma', { frontmatter: { status: 'implementation' } });

    const names = state.readPlans(path.join(root, 'plans', 'implementation'))
      .map(p => p.name).sort();

    assert.deepStrictEqual(names, ['alpha', 'beta', 'gamma']);
  });

  test('todo stage honours an explicit todo-order.json (applyTodoOrder ranks listed first)', () => {
    const root = mkProject();
    writePlan(root, 'todo', 'first-created', { frontmatter: { status: 'todo' } });
    writePlan(root, 'todo', 'second-created', { frontmatter: { status: 'todo' } });
    // Order file inverts on-disk/FIFO order.
    writeJson(path.join(root, '.ctoc', 'state', 'todo-order.json'),
      ['second-created.md', 'first-created.md']);

    const order = state.readPlans(path.join(root, 'plans', 'todo')).map(p => p.name);

    assert.deepStrictEqual(order, ['second-created', 'first-created']);
  });

  test('todo stage with a PARTIAL order file ranks the listed plan ahead of unlisted ones', () => {
    const root = mkProject();
    writePlan(root, 'todo', 'unlisted-a', { frontmatter: { status: 'todo' } });
    writePlan(root, 'todo', 'listed-b', { frontmatter: { status: 'todo' } });
    writePlan(root, 'todo', 'unlisted-c', { frontmatter: { status: 'todo' } });
    writeJson(path.join(root, '.ctoc', 'state', 'todo-order.json'), ['listed-b.md']);

    const order = state.readPlans(path.join(root, 'plans', 'todo')).map(p => p.name);

    // Listed plan is rank 0; the two unlisted (rank Infinity) follow, both present.
    assert.strictEqual(order[0], 'listed-b');
    assert.deepStrictEqual(order.slice(1).sort(), ['unlisted-a', 'unlisted-c']);
  });

  test('todo stage with NO order file falls back to FIFO (equal-rank created tiebreaker)', () => {
    const root = mkProject();
    writePlan(root, 'todo', 'p1', { frontmatter: { status: 'todo' } });
    writePlan(root, 'todo', 'p2', { frontmatter: { status: 'todo' } });

    const names = state.readPlans(path.join(root, 'plans', 'todo')).map(p => p.name).sort();

    assert.deepStrictEqual(names, ['p1', 'p2']);
  });

  // -------------------------------------------------------------------------
  // Fail-soft per file: one bad entry must NOT crash the whole reader.
  // A subdirectory literally named `*.md` passes the `.endsWith('.md')` filter
  // and readFileSync(dir) throws EISDIR — the real-world trigger for the whole
  // dashboard crashing. readPlans must skip it and still return valid plans.
  // -------------------------------------------------------------------------
  test('skips an entry whose read throws (a *.md subdirectory → EISDIR) and returns the valid plans', () => {
    const root = mkProject();
    const dir = path.join(root, 'plans', 'review');
    ensureDir(dir);
    writePlan(root, 'review', 'good-plan', { frontmatter: { status: 'review' } });
    // A directory named like a plan file. readdirSync lists it, `.endsWith('.md')`
    // passes, and readFileSync(<dir>) rejects with EISDIR — exactly today's crash.
    fs.mkdirSync(path.join(dir, 'bad.md'));

    let plans;
    assert.doesNotThrow(() => { plans = state.readPlans(dir); });
    assert.strictEqual(plans.length, 1);
    assert.strictEqual(plans[0].name, 'good-plan');
  });

  test('skips a *.md that disappears between the listing and the read (readdir→read race)', () => {
    const root = mkProject();
    const dir = path.join(root, 'plans', 'review');
    ensureDir(dir);
    writePlan(root, 'review', 'survivor', { frontmatter: { status: 'review' } });
    writePlan(root, 'review', 'ghost', { frontmatter: { status: 'review' } });

    // Simulate the race: safeFs.readFileSync throws ENOENT for the ghost path
    // (an agent moved/deleted it after the directory listing). Only that one
    // path faults; every other read delegates to the real fs.
    const safeFs = require('../src/lib/safe-fs');
    const realRead = safeFs.readFileSync;
    const ghostPath = path.join(dir, 'ghost.md');
    safeFs.readFileSync = (p, ...rest) => {
      if (p === ghostPath) {
        const err = new Error(`ENOENT: no such file or directory, open '${p}'`);
        /** @type {any} */ (err).code = 'ENOENT';
        throw err;
      }
      return realRead(p, ...rest);
    };
    try {
      let plans;
      assert.doesNotThrow(() => { plans = state.readPlans(dir); });
      assert.deepStrictEqual(plans.map(p => p.name), ['survivor']);
    } finally {
      safeFs.readFileSync = realRead;
    }
  });
});

// ===========================================================================
// readTodoQueueOrder — the single source of truth for todo ordering
// ===========================================================================
describe('readTodoQueueOrder', () => {
  function todoDirWith(root, files) {
    const dir = path.join(root, 'plans', 'todo');
    ensureDir(dir);
    for (const f of files) fs.writeFileSync(path.join(dir, f), '# x');
    return dir;
  }

  test('with no order file, returns every on-disk *.md in birthtime/name order', () => {
    const root = mkProject();
    const dir = todoDirWith(root, ['b.md', 'a.md', 'c.md']);

    const order = state.readTodoQueueOrder(dir);

    assert.deepStrictEqual(order.slice().sort(), ['a.md', 'b.md', 'c.md']);
    assert.strictEqual(order.length, 3);
  });

  test('honours a valid order file, appends unlisted on-disk plans after', () => {
    const root = mkProject();
    const dir = todoDirWith(root, ['a.md', 'b.md', 'c.md']);
    writeJson(path.join(root, '.ctoc', 'state', 'todo-order.json'), ['c.md', 'a.md']);

    const order = state.readTodoQueueOrder(dir);

    assert.deepStrictEqual(order.slice(0, 2), ['c.md', 'a.md']);
    assert.deepStrictEqual(order.slice(2), ['b.md']);
  });

  test('skips listed names that are not on disk, and de-duplicates repeats', () => {
    const root = mkProject();
    const dir = todoDirWith(root, ['a.md', 'b.md']);
    writeJson(path.join(root, '.ctoc', 'state', 'todo-order.json'),
      ['ghost.md', 'a.md', 'a.md', 'b.md']);

    const order = state.readTodoQueueOrder(dir);

    // ghost.md dropped (not on disk); a.md appears once despite the repeat.
    assert.deepStrictEqual(order, ['a.md', 'b.md']);
  });

  test('ignores non-string entries inside the order array', () => {
    const root = mkProject();
    const dir = todoDirWith(root, ['a.md', 'b.md']);
    writeJson(path.join(root, '.ctoc', 'state', 'todo-order.json'),
      [42, null, { x: 1 }, 'b.md']);

    const order = state.readTodoQueueOrder(dir);

    assert.strictEqual(order[0], 'b.md');
    assert.deepStrictEqual(order.slice().sort(), ['a.md', 'b.md']);
  });

  test('treats a non-array order file (JSON object) as no ordering', () => {
    const root = mkProject();
    const dir = todoDirWith(root, ['a.md', 'b.md']);
    // Array.isArray(parsed) === false → listed stays [].
    writeJson(path.join(root, '.ctoc', 'state', 'todo-order.json'), { not: 'an array' });

    const order = state.readTodoQueueOrder(dir);

    assert.deepStrictEqual(order.slice().sort(), ['a.md', 'b.md']);
  });

  test('falls back to pure birthtime order when the order file is corrupt JSON', () => {
    const root = mkProject();
    const dir = todoDirWith(root, ['a.md', 'b.md']);
    const orderFile = path.join(root, '.ctoc', 'state', 'todo-order.json');
    ensureDir(path.dirname(orderFile));
    fs.writeFileSync(orderFile, '{ this is not valid json ');

    const order = state.readTodoQueueOrder(dir);

    assert.deepStrictEqual(order.slice().sort(), ['a.md', 'b.md']);
  });

  test('statSync failure on a listed entry falls back to birthtime 0 (broken symlink)', () => {
    const root = mkProject();
    const dir = todoDirWith(root, ['real.md']);
    let symlinksMade = 0;
    for (const nm of ['z-broken.md', 'a-broken.md', 'm-broken.md']) {
      try {
        fs.symlinkSync(path.join(root, 'no-such-target'), path.join(dir, nm));
        symlinksMade++;
      } catch { /* EPERM on unprivileged Windows — invariant still asserted below */ }
    }

    const order = state.readTodoQueueOrder(dir);

    // Invariant holds regardless of platform: every readdir entry appears once.
    const onDisk = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
    assert.deepStrictEqual(order.slice().sort(), onDisk);
    // On POSIX the broken links drove the statSync catch (birthtime → 0).
    if (symlinksMade > 0) {
      assert.ok(order.includes('real.md'));
      assert.strictEqual(order.length, 1 + symlinksMade);
    }
  });
});

// ===========================================================================
// parseMetadata + parseFrontmatterLines coercion
// ===========================================================================
describe('parseMetadata', () => {
  test('parses a leading frontmatter block via extractFrontmatterRegion', () => {
    const content = '---\ntitle: Alpha\nstatus: todo\n---\n\n## Goal\nx';

    const md = state.parseMetadata(content);

    assert.strictEqual(md.title, 'Alpha');
    assert.strictEqual(md.status, 'todo');
  });

  test('coerces booleans and non-negative integers, strips quotes, skips colon-less lines', () => {
    const content = [
      '---',
      'flag_on: true',
      'flag_off: false',
      'count: 42',
      'quoted: "hello world"',
      'single: \'sq\'',
      'plain: some text',
      'colonless line with no key',
      '---',
      '',
      'body',
    ].join('\n');

    const md = state.parseMetadata(content);

    assert.strictEqual(md.flag_on, true);
    assert.strictEqual(md.flag_off, false);
    assert.strictEqual(md.count, 42);
    assert.strictEqual(md.quoted, 'hello world');
    assert.strictEqual(md.single, 'sq');
    assert.strictEqual(md.plain, 'some text');
    // Colon-less line contributes no key.
    assert.strictEqual(Object.prototype.hasOwnProperty.call(md, 'colonless line with no key'), false);
  });

  test('merges a prepended approval-marker block with the plan\'s own block', () => {
    // Two leading --- blocks; both fields survive the union parse.
    const content = [
      '---',
      'approved_by: human',
      'gate_crossed: 2',
      '---',
      '---',
      'title: Real Plan',
      'status: todo',
      '---',
      '',
      'body',
    ].join('\n');

    const md = state.parseMetadata(content);

    assert.strictEqual(md.approved_by, 'human');
    assert.strictEqual(md.gate_crossed, 2);
    assert.strictEqual(md.title, 'Real Plan');
    assert.strictEqual(md.status, 'todo');
  });

  test('returns {} when there is no leading frontmatter at all (fail-open fallback)', () => {
    // First non-blank line is a heading → extractFrontmatterRegion returns '',
    // and the anchored fallback regex also finds nothing → {}.
    const content = '# Heading first\n\n---\nnot: parsed\n---\n';

    const md = state.parseMetadata(content);

    assert.deepStrictEqual(md, {});
  });

  test('fails OPEN to the single-block reader when extractFrontmatterRegion throws', () => {
    // Fault-inject the lazily-required collaborator to throw, exercising the
    // documented catch (region = null) + fallback path. Restored in finally.
    const stalePath = require.resolve('../src/lib/stale-detector');
    const mod = require('../src/lib/stale-detector');
    const original = mod.extractFrontmatterRegion;
    mod.extractFrontmatterRegion = () => { throw new Error('injected fault'); };
    try {
      const content = '---\ntitle: FellThrough\nstatus: todo\n---\n\nbody';

      const md = state.parseMetadata(content);

      // Fallback parseFrontmatter still recovers the leading block.
      assert.strictEqual(md.title, 'FellThrough');
      assert.strictEqual(md.status, 'todo');
    } finally {
      mod.extractFrontmatterRegion = original;
      // Sanity: the module export is restored for every later test.
      assert.strictEqual(require(stalePath).extractFrontmatterRegion, original);
    }
  });
});

// ===========================================================================
// timeAgo — every bucket boundary
// ===========================================================================
describe('timeAgo', () => {
  test('returns "just now" under a minute', () => {
    assert.strictEqual(state.timeAgo(new Date(Date.now() - 5 * 1000)), 'just now');
  });

  test('returns minutes for < 1 hour', () => {
    assert.strictEqual(state.timeAgo(new Date(Date.now() - 2 * 60 * 1000)), '2m ago');
  });

  test('returns hours for < 1 day', () => {
    assert.strictEqual(state.timeAgo(new Date(Date.now() - 3 * 3600 * 1000)), '3h ago');
  });

  test('returns days for >= 1 day', () => {
    assert.strictEqual(state.timeAgo(new Date(Date.now() - 2 * 86400 * 1000)), '2d ago');
  });

  // Boundary pins — each kills the corresponding `< N` → `<= N` off-by-one.
  // Elapsed is always a few ms MORE than the offset (Date.now() advances during
  // the call), so floor() lands on the intended integer deterministically.
  test('the 60-second boundary flips "just now" → minutes', () => {
    assert.strictEqual(state.timeAgo(new Date(Date.now() - 59 * 1000)), 'just now');
    assert.strictEqual(state.timeAgo(new Date(Date.now() - 60 * 1000)), '1m ago');
  });

  test('the 3600-second boundary flips minutes → hours', () => {
    assert.strictEqual(state.timeAgo(new Date(Date.now() - 3599 * 1000)), '59m ago');
    assert.strictEqual(state.timeAgo(new Date(Date.now() - 3600 * 1000)), '1h ago');
  });

  test('the 86400-second boundary flips hours → days', () => {
    assert.strictEqual(state.timeAgo(new Date(Date.now() - 86399 * 1000)), '23h ago');
    assert.strictEqual(state.timeAgo(new Date(Date.now() - 86400 * 1000)), '1d ago');
  });
});

// ===========================================================================
// getPlanCounts (memoized)
// ===========================================================================
describe('getPlanCounts', () => {
  test('counts every stage directory, missing dirs count as 0', () => {
    const root = mkProject();
    writePlan(root, 'todo', 't1', { frontmatter: { status: 'todo' } });
    writePlan(root, 'todo', 't2', { frontmatter: { status: 'todo' } });
    writePlan(root, 'done', 'd1', { frontmatter: { status: 'done' } });

    const counts = state.getPlanCounts(root);

    assert.strictEqual(counts.todo, 2);
    assert.strictEqual(counts.done, 1);
    assert.strictEqual(counts.review, 0);
    assert.strictEqual(counts.implementation, 0);
    assert.strictEqual(counts.canvas, 0);
    assert.strictEqual(counts.functional, 0);
    assert.strictEqual(counts.inProgress, 0);
  });

  test('no-arg invocation resolves via findProjectRoot and returns a numeric shape', () => {
    const counts = state.getPlanCounts();

    for (const k of ['canvas', 'functional', 'implementation', 'review', 'todo', 'inProgress', 'done']) {
      assert.strictEqual(typeof counts[k], 'number', `${k} is numeric`);
    }
  });

  // The dashboard calls getPlanCounts un-wrapped; a single bad plan file in ANY
  // stage must NOT throw a stack trace over the human's counts. It counts only
  // the readable plans in that stage and every other stage is unaffected.
  test('a bad plan entry in one stage does not crash the counts (skipped, other stages intact)', () => {
    const root = mkProject();
    writePlan(root, 'todo', 't1', { frontmatter: { status: 'todo' } });
    writePlan(root, 'review', 'good', { frontmatter: { status: 'review' } });
    // A *.md subdirectory in review — EISDIR on read, today crashes the whole dashboard.
    fs.mkdirSync(path.join(root, 'plans', 'review', 'corrupt.md'));

    let counts;
    assert.doesNotThrow(() => { counts = state.getPlanCounts(root); });
    assert.strictEqual(counts.todo, 1);
    assert.strictEqual(counts.review, 1); // only the readable plan is counted
  });
});

// ===========================================================================
// getAgentStatus — task-registry driven liveness
// ===========================================================================
describe('getAgentStatus', () => {
  function writeRegistry(root, tasks) {
    writeJson(path.join(root, '.ctoc', 'state', 'tasks.json'),
      { version: 1, generation: 0, seq: tasks.length, tasks });
  }

  test('reports inactive when there is no running implement task (and no registry file)', () => {
    const root = mkProject();

    const status = state.getAgentStatus(root);

    assert.deepStrictEqual(status, { active: false });
  });

  test('reports inactive when the only running task is a non-implement kind', () => {
    const root = mkProject();
    writeRegistry(root, [{ id: 't1', kind: 'review', status: 'running', plan: 'p' }]);

    const status = state.getAgentStatus(root);

    assert.strictEqual(status.active, false);
  });

  test('reports active with detail from agent.json when a running implement exists', () => {
    const root = mkProject();
    const started = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    writeRegistry(root, [{ id: 't1', kind: 'implement', status: 'running', plan: 'auth-flow', ts: { started } }]);
    writeJson(path.join(root, '.ctoc', 'state', 'agent.json'),
      { step: 10, phase: 'IMPLEMENT', task: 'login endpoint', startedAt: 'ignored-when-ts-present' });

    const status = state.getAgentStatus(root);

    assert.strictEqual(status.active, true);
    assert.strictEqual(status.plan, 'auth-flow');
    assert.deepStrictEqual(status.plans, ['auth-flow']);
    assert.strictEqual(status.running, 1);
    assert.strictEqual(status.step, 10);
    assert.strictEqual(status.phase, 'IMPLEMENT');
    assert.strictEqual(status.task, 'login endpoint');
    // ts.started wins over the detail file's startedAt.
    assert.strictEqual(status.startedAt, started);
    assert.strictEqual(status.elapsed, '5m');
  });

  test('uses agent.json startedAt when the task carries no ts.started', () => {
    const root = mkProject();
    const detailStarted = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    writeRegistry(root, [{ id: 't1', kind: 'implement', status: 'running', plan: 'p' }]);
    writeJson(path.join(root, '.ctoc', 'state', 'agent.json'), { startedAt: detailStarted });

    const status = state.getAgentStatus(root);

    assert.strictEqual(status.startedAt, detailStarted);
    assert.strictEqual(status.elapsed, '2h');
  });

  test('tolerates a missing agent.json (detail catch) and reports ts-derived timing', () => {
    const root = mkProject();
    const started = new Date(Date.now() - 30 * 1000).toISOString();
    writeRegistry(root, [{ id: 't1', kind: 'implement', status: 'running', plan: 'solo', ts: { started } }]);

    const status = state.getAgentStatus(root);

    assert.strictEqual(status.active, true);
    assert.strictEqual(status.step, null);
    assert.strictEqual(status.phase, null);
    assert.strictEqual(status.task, null);
    assert.strictEqual(status.startedAt, started);
    assert.strictEqual(status.elapsed, 'just now');
  });

  test('yields null plan/startedAt/elapsed when no plan and no timestamps exist', () => {
    const root = mkProject();
    // plan explicitly null → plans[] empty → plans[0] || primary.plan || null === null.
    writeRegistry(root, [{ id: 't1', kind: 'implement', status: 'running', plan: null }]);

    const status = state.getAgentStatus(root);

    assert.strictEqual(status.active, true);
    assert.strictEqual(status.plan, null);
    assert.deepStrictEqual(status.plans, []);
    assert.strictEqual(status.startedAt, null);
    assert.strictEqual(status.elapsed, null);
  });

  test('counts multiple concurrent running implement tasks', () => {
    const root = mkProject();
    writeRegistry(root, [
      { id: 't1', kind: 'implement', status: 'running', plan: 'p1' },
      { id: 't2', kind: 'implement', status: 'running', plan: 'p2' },
      { id: 't3', kind: 'implement', status: 'done', plan: 'p3' },
    ]);

    const status = state.getAgentStatus(root);

    assert.strictEqual(status.running, 2);
    assert.deepStrictEqual(status.plans.sort(), ['p1', 'p2']);
  });

  test('no-arg invocation resolves via findProjectRoot without throwing', () => {
    const status = state.getAgentStatus();

    assert.strictEqual(typeof status.active, 'boolean');
  });
});

// ===========================================================================
// setAgentStatus
// ===========================================================================
describe('setAgentStatus', () => {
  test('creates the state directory when absent and persists the given status', () => {
    const root = mkProject();

    const written = state.setAgentStatus(root, {
      active: true, plan: 'p', step: 9, phase: 'IMPLEMENT', task: 'do it', startedAt: '2026-01-01T00:00:00.000Z',
    });

    assert.strictEqual(written.active, true);
    assert.strictEqual(written.plan, 'p');
    assert.strictEqual(written.step, 9);
    assert.strictEqual(written.startedAt, '2026-01-01T00:00:00.000Z');
    const onDisk = JSON.parse(fs.readFileSync(path.join(root, '.ctoc', 'state', 'agent.json'), 'utf8'));
    assert.strictEqual(onDisk.plan, 'p');
  });

  test('defaults missing fields to null/now and treats active:false explicitly', () => {
    const root = mkProject();
    // Pre-create the state dir → exercises the "already exists, skip mkdir" branch.
    ensureDir(path.join(root, '.ctoc', 'state'));

    const written = state.setAgentStatus(root, { active: false });

    assert.strictEqual(written.active, false);
    assert.strictEqual(written.plan, null);
    assert.strictEqual(written.step, null);
    assert.strictEqual(written.phase, null);
    assert.strictEqual(written.task, null);
    assert.strictEqual(typeof written.startedAt, 'string');
    assert.strictEqual(typeof written.updatedAt, 'string');
  });

  test('active defaults to true when omitted (active !== false)', () => {
    const root = mkProject();

    const written = state.setAgentStatus(root, { plan: 'x' });

    assert.strictEqual(written.active, true);
  });
});

// ===========================================================================
// getNextFromTodo
// ===========================================================================
describe('getNextFromTodo', () => {
  test('returns null when the todo directory does not exist', () => {
    const root = mkProject();

    assert.strictEqual(state.getNextFromTodo(root), null);
  });

  test('returns null when the todo directory is empty', () => {
    const root = mkProject();
    ensureDir(path.join(root, 'plans', 'todo'));

    assert.strictEqual(state.getNextFromTodo(root), null);
  });

  test('returns the first (order-file honoured) plan when the queue is non-empty', () => {
    const root = mkProject();
    writePlan(root, 'todo', 'older', { frontmatter: { status: 'todo' } });
    writePlan(root, 'todo', 'newer', { frontmatter: { status: 'todo' } });
    writeJson(path.join(root, '.ctoc', 'state', 'todo-order.json'), ['newer.md', 'older.md']);

    const next = state.getNextFromTodo(root);

    assert.strictEqual(next.name, 'newer');
  });

  test('no-arg invocation resolves via findProjectRoot without throwing', () => {
    const next = state.getNextFromTodo();

    assert.ok(next === null || typeof next.name === 'string');
  });
});

// ===========================================================================
// getFinishedItems
// ===========================================================================
describe('getFinishedItems', () => {
  test('returns [] when there are no done plans', () => {
    const root = mkProject();

    assert.deepStrictEqual(state.getFinishedItems(root), []);
  });

  test('sorts done plans newest-first by modified time', () => {
    const root = mkProject();
    const oldFile = writePlan(root, 'done', 'old-done', { frontmatter: { status: 'done' } });
    const newFile = writePlan(root, 'done', 'new-done', { frontmatter: { status: 'done' } });
    setMtime(oldFile, new Date(Date.now() - 10 * 86400 * 1000));
    setMtime(newFile, new Date(Date.now() - 1 * 3600 * 1000));

    const finished = state.getFinishedItems(root);

    assert.strictEqual(finished[0].name, 'new-done');
    assert.strictEqual(finished[1].name, 'old-done');
  });

  test('respects the limit argument', () => {
    const root = mkProject();
    for (let i = 0; i < 5; i++) writePlan(root, 'done', `d${i}`, { frontmatter: { status: 'done' } });

    const finished = state.getFinishedItems(root, 2);

    assert.strictEqual(finished.length, 2);
  });

  test('defaults the limit to 10', () => {
    const root = mkProject();
    for (let i = 0; i < 12; i++) writePlan(root, 'done', `d${i}`, { frontmatter: { status: 'done' } });

    const finished = state.getFinishedItems(root);

    assert.strictEqual(finished.length, 10);
  });
});

// ===========================================================================
// NavStack
// ===========================================================================
describe('NavStack', () => {
  test('push then current returns the top frame', () => {
    const nav = new state.NavStack();
    nav.push('dashboard');
    nav.push('review', { plan: 'p' });

    assert.deepStrictEqual(nav.current(), { screen: 'review', context: { plan: 'p' } });
  });

  test('current returns null on an empty stack', () => {
    const nav = new state.NavStack();

    assert.strictEqual(nav.current(), null);
  });

  test('push defaults context to an empty object', () => {
    const nav = new state.NavStack();
    nav.push('only');

    assert.deepStrictEqual(nav.current().context, {});
  });

  test('pop removes the top frame only while more than one remains', () => {
    const nav = new state.NavStack();
    nav.push('a');
    nav.push('b');

    const popped = nav.pop();

    assert.strictEqual(popped.screen, 'b');
    assert.strictEqual(nav.current().screen, 'a');
  });

  test('pop returns null and preserves the last frame (guard: length > 1)', () => {
    const nav = new state.NavStack();
    nav.push('root');

    assert.strictEqual(nav.pop(), null);
    assert.strictEqual(nav.current().screen, 'root');
  });

  test('path returns the ordered list of screen names', () => {
    const nav = new state.NavStack();
    nav.push('a');
    nav.push('b');
    nav.push('c');

    assert.deepStrictEqual(nav.path(), ['a', 'b', 'c']);
  });

  test('clear empties the stack', () => {
    const nav = new state.NavStack();
    nav.push('a');
    nav.push('b');

    nav.clear();

    assert.deepStrictEqual(nav.path(), []);
    assert.strictEqual(nav.current(), null);
  });
});

// ===========================================================================
// pickNextFromQueue
// ===========================================================================
describe('pickNextFromQueue', () => {
  test('returns null for an empty queue', () => {
    const root = mkProject();
    ensureDir(path.join(root, 'plans', 'todo'));

    assert.strictEqual(state.pickNextFromQueue(root), null);
  });

  test('returns the first plan for a non-empty queue', () => {
    const root = mkProject();
    writePlan(root, 'todo', 'a', { frontmatter: { status: 'todo' } });
    writePlan(root, 'todo', 'b', { frontmatter: { status: 'todo' } });
    writeJson(path.join(root, '.ctoc', 'state', 'todo-order.json'), ['b.md', 'a.md']);

    const next = state.pickNextFromQueue(root);

    assert.strictEqual(next.name, 'b');
  });

  test('no-arg invocation resolves via findProjectRoot without throwing', () => {
    const next = state.pickNextFromQueue();

    assert.ok(next === null || typeof next.name === 'string');
  });
});

// ===========================================================================
// getSettings / saveSettings
// ===========================================================================
describe('getSettings', () => {
  test('returns defaults when no settings file exists', () => {
    const root = mkProject();

    const settings = state.getSettings(root);

    assert.deepStrictEqual(settings, {
      autoPick: true, maxParallelAgents: 1, showElapsed: true, finishedItemsToShow: 10,
    });
  });

  test('merges on-disk overrides over the defaults', () => {
    const root = mkProject();
    writeJson(path.join(root, '.ctoc', 'settings.json'), { maxParallelAgents: 4, custom: 'x' });

    const settings = state.getSettings(root);

    assert.strictEqual(settings.maxParallelAgents, 4);
    assert.strictEqual(settings.autoPick, true); // default preserved
    assert.strictEqual(settings.custom, 'x');     // extra key merged
  });

  test('returns defaults when the settings file is corrupt JSON (catch)', () => {
    const root = mkProject();
    const file = path.join(root, '.ctoc', 'settings.json');
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, '{ broken json ');

    const settings = state.getSettings(root);

    assert.strictEqual(settings.maxParallelAgents, 1);
    assert.strictEqual(settings.autoPick, true);
  });

  test('no-arg invocation resolves via findProjectRoot and returns an object', () => {
    const settings = state.getSettings();

    assert.strictEqual(typeof settings, 'object');
    assert.ok(settings !== null);
  });
});

describe('saveSettings', () => {
  test('creates the .ctoc directory when absent and persists settings', () => {
    const root = mkProject();

    state.saveSettings({ autoPick: false, maxParallelAgents: 3 }, root);

    const onDisk = JSON.parse(fs.readFileSync(path.join(root, '.ctoc', 'settings.json'), 'utf8'));
    assert.strictEqual(onDisk.autoPick, false);
    assert.strictEqual(onDisk.maxParallelAgents, 3);
  });

  test('round-trips through getSettings and works when .ctoc already exists', () => {
    const root = mkProject();
    ensureDir(path.join(root, '.ctoc')); // exercise the "dir exists" branch

    state.saveSettings({ finishedItemsToShow: 25 }, root);

    assert.strictEqual(state.getSettings(root).finishedItemsToShow, 25);
  });
});

// ===========================================================================
// getVisionCounts (memoized)
// ===========================================================================
describe('getVisionCounts', () => {
  function writeVision(root, name, statusLine) {
    const dir = path.join(root, 'plans', 'vision');
    ensureDir(dir);
    const body = statusLine === null ? '# Vision\n\nNo status line here.\n'
      : `# Vision\n\n- Status: ${statusLine}\n`;
    fs.writeFileSync(path.join(dir, `${name}.md`), body);
  }

  test('returns all-zero counts when the vision directory is absent', () => {
    const root = mkProject();

    assert.deepStrictEqual(state.getVisionCounts(root),
      { total: 0, exploring: 0, ready: 0, converted: 0 });
  });

  test('tallies each status, defaults missing status to exploring, ignores .gitkeep', () => {
    const root = mkProject();
    writeVision(root, 'v-explore', 'exploring');
    writeVision(root, 'v-ready', 'ready');
    writeVision(root, 'v-converted', 'converted');
    writeVision(root, 'v-decomposing', 'decomposing');
    writeVision(root, 'v-nostatus', null); // defaults to exploring
    fs.writeFileSync(path.join(root, 'plans', 'vision', '.gitkeep'), '');

    const counts = state.getVisionCounts(root);

    assert.strictEqual(counts.total, 5); // .gitkeep excluded
    assert.strictEqual(counts.exploring, 2); // explicit + defaulted
    assert.strictEqual(counts.ready, 1);
    assert.strictEqual(counts.converted, 1);
    assert.strictEqual(counts.decomposing, 1);
  });

  test('no-arg invocation resolves via findProjectRoot and returns a numeric shape', () => {
    const counts = state.getVisionCounts();

    assert.strictEqual(typeof counts.total, 'number');
    assert.strictEqual(typeof counts.exploring, 'number');
  });
});

// ===========================================================================
// getVisionStubs
// ===========================================================================
describe('getVisionStubs', () => {
  test('returns [] when no functional plan matches the vision slug', () => {
    const root = mkProject();
    writePlan(root, 'functional', 'unrelated', {
      frontmatter: { parent_vision: 'other-vision' },
      body: '## Problem Statement\nSomething else',
    });

    assert.deepStrictEqual(state.getVisionStubs('my-vision', root), []);
  });

  test('extracts scope, dependsOn and bgStatus for matching stubs', () => {
    const root = mkProject();
    writePlan(root, 'functional', 'stub-a', {
      frontmatter: { parent_vision: 'my-vision-slug', depends_on: 'stub-z' },
      body: '## Problem Statement\nDeliver the login flow\n\nmore text',
    });

    const stubs = state.getVisionStubs('my-vision-slug', root);

    assert.strictEqual(stubs.length, 1);
    assert.strictEqual(stubs[0].name, 'stub-a');
    assert.strictEqual(stubs[0].scope, 'Deliver the login flow');
    assert.strictEqual(stubs[0].dependsOn, 'stub-z');
    assert.strictEqual(stubs[0].bgStatus, 'none');
  });

  test('defaults scope to empty, dependsOn to "none" when those fields are absent', () => {
    const root = mkProject();
    writePlan(root, 'functional', 'stub-b', {
      frontmatter: { parent_vision: 'shared-vision' },
      body: 'No problem-statement heading at all.',
    });

    const [stub] = state.getVisionStubs('shared-vision', root);

    assert.strictEqual(stub.scope, '');
    assert.strictEqual(stub.dependsOn, 'none');
  });

  test('treats a plan with no parent_vision as a non-match (falsy default)', () => {
    const root = mkProject();
    writePlan(root, 'functional', 'no-parent', {
      frontmatter: { status: 'functional' },
      body: '## Problem Statement\nOrphan plan',
    });

    assert.deepStrictEqual(state.getVisionStubs('any-slug', root), []);
  });
});
