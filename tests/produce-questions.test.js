'use strict';

/**
 * PQ2 — the background producer entry point + the wiring proofs.
 *
 * `src/scripts/produce-questions.js` is the GENUINE background root that makes
 * `src/lib/streaming-producer.js` reachable from a live root (Operating Lesson 16,
 * "wired is done"). This suite proves three things with the REAL shipped code:
 *
 *   1. the script drains the plans-needing-questions queue through an INJECTED
 *      dispatch seam (no real model, no spawn) — `main(root, dispatch)`;
 *   2. the script is a DECLARED reachability root AND the real analyzer now reports
 *      `streaming-producer.js` reachable (0 unreachable) — the honest fix for the
 *      dead-code fence, never a baseline lowering;
 *   3. the documented counts (CLAUDE.md) reconcile to the live disk after the two
 *      new src files land.
 *
 * Hermetic os.tmpdir() sandboxes; the only injected seam is the producer dispatch
 * (so no `claude -p` is ever spawned). Everything downstream is the real code.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const produceQuestions = require('../src/scripts/produce-questions.js');
const precompute = require('../src/lib/streaming-precompute.js');
const { analyze } = require('../src/lib/reachability.js');

const STAGES = ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
const sandboxes = [];
let counter = 0;

function makeSandbox() {
  const root = path.join(os.tmpdir(), 'ctoc-pq2-' + process.pid + '-' + Date.now() + '-' + counter++);
  for (const stage of STAGES) fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
  sandboxes.push(root);
  return root;
}

// A functional plan that PASSES validateFunctionalToImpl and so is a live Gate-1
// decision that plansNeedingQuestions surfaces.
function validFunctionalBody(slug) {
  return `---\ntitle: ${slug} title\n---\n\n# ${slug} title\n\n` +
    `## Problem Statement\nThe thing is broken.\n\n## Acceptance Criteria\n- [ ] the thing works\n\n## Scope\nThe module.\n`;
}

afterEach(() => {
  while (sandboxes.length) fs.rmSync(sandboxes.pop(), { recursive: true, force: true });
});

describe('produce-questions.js — the background producer entry point', () => {
  it('case 1 — main(root, dispatch) drains the needing-questions queue through the injected seam, never throwing', async () => {
    const root = makeSandbox();
    fs.writeFileSync(path.join(root, 'plans', 'functional', 'foo.md'), validFunctionalBody('foo'));

    // An injected, deterministic dispatch — NO model, NO spawn. Returns a
    // product-owner-shaped set the real validator accepts.
    let dispatched = 0;
    const fakeDispatch = async (ref, planText, stage) => {
      dispatched += 1;
      assert.equal(stage, 'functional');
      return [{
        id: 'db',
        prompt: 'Which database engine?',
        critical: true,
        options: [
          { key: 'pg', label: 'Postgres', recommended: true, pros: 'RLS', cons: 'Ops' },
          { key: 'sqlite', label: 'SQLite', pros: 'Zero-config', cons: 'Single writer' },
        ],
      }];
    };

    const res = await produceQuestions.main(root, fakeDispatch);

    assert.ok(res && typeof res === 'object', 'main returns a drain summary');
    assert.equal(res.attempted, 1, 'the one needing plan was attempted');
    assert.equal(res.written, 1, 'its questions were written');
    assert.equal(dispatched, 1, 'the injected dispatch was called exactly once');

    // The REAL store now holds the produced questions, fresh.
    const stored = precompute.loadPlanQuestions(root, 'functional/foo.md');
    assert.ok(Array.isArray(stored) && stored.length === 1, 'the questions were persisted through the real store');
    assert.equal(stored[0].id, 'db');
  });

  it('case 1b — main never throws even when the dispatch itself throws (fail-soft)', async () => {
    const root = makeSandbox();
    fs.writeFileSync(path.join(root, 'plans', 'functional', 'bar.md'), validFunctionalBody('bar'));
    const throwingDispatch = async () => { throw new Error('model exploded'); };

    const res = await produceQuestions.main(root, throwingDispatch);
    assert.equal(res.attempted, 1);
    assert.equal(res.written, 0, 'a throwing dispatch writes nothing');
    assert.equal(res.skipped.length, 1, 'the plan is recorded as skipped, not crashed');
  });

  it('case 1c — main catches an UNEXPECTED throw from produceAllNeeded (belt-and-suspenders)', async () => {
    // produceAllNeeded is itself fail-soft, so the only honest way to drive main's
    // defensive catch is to replace that dependency with a throwing one (a real
    // dependency seam) and prove main STILL resolves to the clean skipped-summary
    // rather than rejecting — the detached child must only ever exit cleanly.
    const spPath = require.resolve('../src/lib/streaming-producer.js');
    const pqPath = require.resolve('../src/scripts/produce-questions.js');
    const realSp = require('../src/lib/streaming-producer.js');
    const savedSp = require.cache[spPath];
    const savedPq = require.cache[pqPath];

    delete require.cache[pqPath];
    require.cache[spPath] = {
      id: spPath, filename: spPath, loaded: true,
      exports: Object.assign({}, realSp, {
        produceAllNeeded: async () => { throw new Error('drain detonated'); },
      }),
    };

    try {
      const freshPq = require('../src/scripts/produce-questions.js');
      let res;
      await assert.doesNotReject(async () => { res = await freshPq.main('/any/root', async () => []); });
      assert.equal(res.attempted, 0);
      assert.equal(res.written, 0);
      assert.equal(res.skipped.length, 1);
      assert.equal(res.skipped[0].ref, null, 'the belt-and-suspenders skip has no specific ref');
      assert.match(res.skipped[0].reason, /unexpected: drain detonated/, 'and names the unexpected failure');
    } finally {
      delete require.cache[pqPath];
      if (savedSp) require.cache[spPath] = savedSp; else delete require.cache[spPath];
      if (savedPq) require.cache[pqPath] = savedPq; else delete require.cache[pqPath];
    }
  });

  it('case 1d — the CHILD-ENTRY block runs end-to-end as a spawned subprocess (empty sandbox, no model)', () => {
    // Spawn the script as its own process against an EMPTY sandbox (all stage dirs
    // exist, NO plan needs questions). produceAllNeeded returns immediately, the
    // injected/default dispatch is never called (no `claude -p`), and the child hits
    // the `require.main === module` block: prints its summary and exits 0.
    const root = makeSandbox();
    const scriptPath = path.join(ROOT, 'src', 'scripts', 'produce-questions.js');
    const { spawnSync } = require('node:child_process');

    const res = spawnSync(process.execPath, [scriptPath, root], { encoding: 'utf8' });
    assert.equal(res.status, 0, 'the detached child always exits 0');
    assert.match(
      res.stdout,
      /\[produce-questions\] attempted 0, wrote 0, skipped 0/,
      'the child printed its drain summary from the child-entry block'
    );
  });
});

describe('reachability — produce-questions.js wires streaming-producer.js to a live root', () => {
  it('case 2 — produce-questions.js is a DECLARED root AND the analyzer reports streaming-producer reachable (0 unreachable)', () => {
    const rootsRaw = JSON.parse(fs.readFileSync(path.join(ROOT, '.ctoc', 'reachability-roots.json'), 'utf8'));
    const declared = Array.isArray(rootsRaw) ? rootsRaw : (rootsRaw && rootsRaw.roots) || [];
    assert.ok(
      declared.includes('src/scripts/produce-questions.js'),
      'produce-questions.js must be a declared reachability root (a genuine background entry point)'
    );

    const result = analyze(ROOT);
    assert.ok(
      result.reachable.includes('src/lib/streaming-producer.js'),
      'streaming-producer.js must now be reachable from a live root'
    );
    assert.equal(
      result.unreachable.length, 0,
      `the dead-code fence must be at zero; unreachable: ${JSON.stringify(result.unreachable)}`
    );
    assert.ok(
      result.reachable.includes('src/scripts/produce-questions.js'),
      'the declared root itself is reachable'
    );
  });
});

describe('counts — the documented figures reconcile to live disk', () => {
  const CLAUDE_MD = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
  const docCount = (re) => {
    const m = CLAUDE_MD.match(re);
    assert.ok(m, `CLAUDE.md must still state a count matching ${re}`);
    return Number(m[1]);
  };
  const liveTop = (dir, suffix) => fs.readdirSync(path.join(ROOT, ...dir)).filter((f) => f.endsWith(suffix)).length;

  it('case 8 — CLAUDE.md JS-module count equals live src/lib/*.js', () => {
    assert.equal(docCount(/(\d+) JS modules/), liveTop(['src', 'lib'], '.js'));
  });

  it('case 8 — CLAUDE.md test-file counts (both rows) equal live tests/*.test.js', () => {
    const live = liveTop(['tests'], '.test.js');
    assert.equal(docCount(/Run all (\d+) test files/), live);
    assert.equal(docCount(/tests\/\s+(\d+) test files/), live);
  });
});
