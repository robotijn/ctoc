/**
 * PI6-s2 — Conflict surface on the LIVE pipeline area (drive-the-real-render).
 *
 * "The measure is the human." (PI4 lesson.) These tests DRIVE the REAL mounted
 * pipeline flow — `pipeline.activate(app)` (async pre-fetch) then
 * `pipeline.render(app)` (sync render) — and assert the rendered dashboard STRING
 * the human actually sees contains the conflict panel naming the conflicting plan
 * and the overlapping files. They do NOT assert against an isolated helper return
 * value only (that is exactly how the s4 wiring first shipped dead).
 *
 * Load-bearing invariant under test: FAIL-OPEN. A conflict-detection fault
 * (throw / reject / undefined barrel export) must NEVER break the dashboard —
 * `pipeline.render(app)` still returns the whole dashboard, with no panel and no
 * crash. This mirrors the PI4-s4 Related-Plans fail-open precedent.
 *
 * The barrel `detectConflicts` is stubbed via require-cache injection (exactly the
 * PI4-s4 UI-test pattern) so the wiring is exercised WITHOUT a live semantic index.
 */

'use strict';

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const BARREL = path.join(__dirname, '..', 'src', 'lib', 'plan-index', 'index.js');
const AREA_PIPELINE = path.join(__dirname, '..', 'src', 'areas', 'pipeline.js');
const OVERVIEW = path.join(__dirname, '..', 'src', 'tabs', 'overview.js');

const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

/**
 * Load pipeline.js bound to a stubbed plan-index barrel. Fresh-requires pipeline
 * (and overview, which it imports) so they re-bind to the stub. Returns a restore.
 */
function loadPipelineWithBarrel(stub) {
  const barrelResolved = require.resolve(BARREL);
  const prevBarrel = require.cache[barrelResolved];
  require.cache[barrelResolved] = {
    id: barrelResolved, filename: barrelResolved, loaded: true, exports: stub,
  };
  const pipelineResolved = require.resolve(AREA_PIPELINE);
  const overviewResolved = require.resolve(OVERVIEW);
  delete require.cache[pipelineResolved];
  delete require.cache[overviewResolved];
  const pipeline = require(AREA_PIPELINE);
  return {
    pipeline,
    restore() {
      if (prevBarrel) require.cache[barrelResolved] = prevBarrel;
      else delete require.cache[barrelResolved];
      delete require.cache[pipelineResolved];
      delete require.cache[overviewResolved];
    },
  };
}

describe('PI6-s2 — conflict panel on the LIVE pipeline dashboard', () => {
  afterEach(() => {
    delete require.cache[require.resolve(AREA_PIPELINE)];
    delete require.cache[require.resolve(OVERVIEW)];
  });

  test('1. E2E — prefetchConflicts populates app.conflicts and render() shows the flag on the LIVE dashboard', async () => {
    const { pipeline, restore } = loadPipelineWithBarrel({
      detectConflicts: async () => [{
        conflictingPlan: 'auth-rate-limiting',
        overlappingFiles: ['src/lib/auth.js'],
        score: 0.87,
        severity: 'potential conflict or dependency',
      }],
    });
    try {
      assert.equal(typeof pipeline.prefetchConflicts, 'function', 'pipeline exposes prefetchConflicts');
      const app = { projectPath: process.cwd(), selectedPlan: 'auth-middleware-refactor' };

      // BEFORE the pre-fetch the render must NOT contain a stale conflict flag.
      const before = strip(pipeline.render(app));
      assert.doesNotMatch(before, /auth-rate-limiting/, 'no conflict flag before pre-fetch');

      // Async pre-fetch half (off the render path) stashes app.conflicts.
      await pipeline.prefetchConflicts(app);
      assert.ok(Array.isArray(app.conflicts) && app.conflicts.length === 1,
        'prefetchConflicts stashed the conflict on the app');

      // Sync render half — the REAL mounted dashboard the human sees.
      const after = strip(pipeline.render(app));
      assert.match(after, /Potential conflicts/, 'conflict panel heading rendered on the live dashboard');
      assert.match(after, /auth-rate-limiting/, 'conflicting plan named to the human');
      assert.match(after, /src\/lib\/auth\.js/, 'overlapping file shown to the human');
      assert.match(after, /potential conflict or dependency/, 'severity label rendered');
      // dashboard is still whole (the panel is additive, fail-open)
      assert.match(after, /Business/, 'pipeline sections still rendered alongside the panel');
      assert.match(after, /Pipeline/, 'pipeline header still present');
    } finally {
      restore();
    }
  });

  test('2. no conflicts → panel omitted from the pipeline render', async () => {
    const { pipeline, restore } = loadPipelineWithBarrel({ detectConflicts: async () => [] });
    try {
      const app = { projectPath: process.cwd(), selectedPlan: 'seed-plan' };
      await pipeline.prefetchConflicts(app);
      assert.deepEqual(app.conflicts, [], 'empty conflicts stashed');
      const out = strip(pipeline.render(app));
      assert.doesNotMatch(out, /Potential conflicts/, 'panel omitted when there are no conflicts');
      assert.match(out, /Pipeline/, 'dashboard still rendered');
    } finally {
      restore();
    }
  });

  test('3. FAIL-OPEN — detectConflicts throws → prefetch never rejects; render still whole, no panel', async () => {
    const { pipeline, restore } = loadPipelineWithBarrel({
      detectConflicts: async () => { throw new Error('semantic index down'); },
    });
    try {
      const app = { projectPath: process.cwd(), selectedPlan: 'seed-plan' };
      await assert.doesNotReject(() => pipeline.prefetchConflicts(app), 'prefetch never rejects');
      assert.deepEqual(app.conflicts, [], 'app.conflicts reset to [] on fetch error');
      let out;
      assert.doesNotThrow(() => { out = strip(pipeline.render(app)); }, 'render never throws');
      assert.match(out, /Pipeline/, 'pipeline header still rendered (fail-open)');
      assert.match(out, /Business/, 'sections still rendered');
      assert.doesNotMatch(out, /Potential conflicts/, 'no conflict block on failure');
    } finally {
      restore();
    }
  });

  test('4. FAIL-OPEN — barrel detectConflicts undefined → app.conflicts = [], render unaffected', async () => {
    const { pipeline, restore } = loadPipelineWithBarrel({ detectConflicts: undefined });
    try {
      const app = { projectPath: process.cwd(), selectedPlan: 'seed-plan' };
      await assert.doesNotReject(() => pipeline.prefetchConflicts(app));
      assert.deepEqual(app.conflicts, [], 'empties when the barrel export is missing');
      const out = strip(pipeline.render(app));
      assert.match(out, /Pipeline/);
      assert.doesNotMatch(out, /Potential conflicts/);
    } finally {
      restore();
    }
  });

  test('5. no selected plan → no fetch call, no panel', async () => {
    let called = false;
    const { pipeline, restore } = loadPipelineWithBarrel({
      detectConflicts: async () => { called = true; return [{ conflictingPlan: 'x', overlappingFiles: [], score: 1, severity: 'broad overlap' }]; },
    });
    try {
      const app = { projectPath: process.cwd() }; // no selectedPlan
      await pipeline.prefetchConflicts(app);
      assert.equal(called, false, 'detectConflicts NOT called without a seed plan');
      assert.deepEqual(app.conflicts, [], 'conflicts empty without a seed');
      const out = strip(pipeline.render(app));
      assert.doesNotMatch(out, /Potential conflicts/);
    } finally {
      restore();
    }
  });

  test('6. severity label passthrough — "broad overlap" rendered, never "error"/"block"', async () => {
    const { pipeline, restore } = loadPipelineWithBarrel({
      detectConflicts: async () => [{
        conflictingPlan: 'billing-webhook',
        overlappingFiles: ['src/lib/stripe.js', 'src/lib/webhook.js'],
        score: 0.93,
        severity: 'broad overlap',
      }],
    });
    try {
      const app = { projectPath: process.cwd(), selectedPlan: 'seed-plan' };
      await pipeline.prefetchConflicts(app);
      const out = strip(pipeline.render(app));
      assert.match(out, /broad overlap/, 'severity label passed through');
      assert.match(out, /billing-webhook/);
      assert.match(out, /src\/lib\/stripe\.js/);
      assert.doesNotMatch(out, /\berror\b/i, 'no alarming "error" label');
      assert.doesNotMatch(out, /\bblock\b/i, 'no alarming "block" label');
    } finally {
      restore();
    }
  });

  test('7. display cap — 8 conflicts fetched, app.conflicts <= 5 and at most 5 rendered', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      conflictingPlan: `plan-${i}`,
      overlappingFiles: [`src/lib/f${i}.js`],
      score: 1 - i * 0.05,
      severity: 'potential conflict or dependency',
    }));
    const { pipeline, restore } = loadPipelineWithBarrel({ detectConflicts: async () => rows });
    try {
      const app = { projectPath: process.cwd(), selectedPlan: 'seed-plan' };
      await pipeline.prefetchConflicts(app);
      assert.ok(app.conflicts.length <= 5, 'app.conflicts capped at 5');
      const out = strip(pipeline.render(app));
      const shown = ['plan-0', 'plan-1', 'plan-2', 'plan-3', 'plan-4', 'plan-5', 'plan-6', 'plan-7']
        .filter((p) => out.includes(p)).length;
      assert.ok(shown <= 5, `at most 5 conflict rows rendered (got ${shown})`);
      assert.ok(out.includes('plan-0'), 'the top-scored conflict is shown');
    } finally {
      restore();
    }
  });

  test('8. renderConflictPanel outer catch — poisoned conflict element never breaks render', async () => {
    const { pipeline, restore } = loadPipelineWithBarrel({ detectConflicts: async () => [] });
    try {
      const poison = { conflictingPlan: 'p', overlappingFiles: [] };
      Object.defineProperty(poison, 'severity', { get() { throw new Error('poison'); }, enumerable: true });
      const app = { projectPath: process.cwd(), selectedPlan: 'seed', conflicts: [poison] };
      let out;
      assert.doesNotThrow(() => { out = strip(pipeline.render(app)); }, 'render swallows a poisoned conflict row');
      assert.match(out, /Pipeline/, 'dashboard still rendered despite poisoned conflict element');
    } finally {
      restore();
    }
  });

  test('9. activation is fail-open — activate() never rejects and resets app.conflicts on fault', async () => {
    const { pipeline, restore } = loadPipelineWithBarrel({
      detectConflicts: async () => { throw new Error('boom'); },
    });
    try {
      const app = { projectPath: process.cwd(), selectedPlan: 'seed-plan' };
      await assert.doesNotReject(() => pipeline.activate(app), 'activate never rejects (menu never breaks)');
      assert.deepEqual(app.conflicts, [], 'app.conflicts reset to [] by the fail-open activation guard');
      assert.deepEqual(app.relatedPlans, [], 'related also reset — same guard');
    } finally {
      restore();
    }
  });

  test('10. regression — pipeline still exports render, handleKey, activate, pickSeedPlan', () => {
    delete require.cache[require.resolve(AREA_PIPELINE)];
    const pipeline = require(AREA_PIPELINE);
    for (const fn of ['render', 'handleKey', 'activate', 'pickSeedPlan']) {
      assert.equal(typeof pipeline[fn], 'function', `still exports ${fn}`);
    }
    assert.equal(typeof pipeline.prefetchConflicts, 'function', 'adds prefetchConflicts');
    assert.equal(typeof pipeline.renderConflictPanel, 'function', 'adds renderConflictPanel');
  });
});
