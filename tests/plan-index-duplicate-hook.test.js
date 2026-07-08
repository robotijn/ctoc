'use strict';

/**
 * PI5-s2 — advisory `PreToolUse.Write` duplicate-guard hook.
 *
 * These tests DRIVE THE REAL HOOK (the PI4 "measure is the human" lesson): they
 * import the actual `src/hooks/PreToolUse.Write.js` module and call its exported
 * `run(payload, deps)` with realistic PreToolUse Write payloads. `checkDuplicate`
 * is injected via `deps.checkDuplicate` (a stub — ZERO network, ZERO embedding),
 * and `deps.stderr` is a capturing sink so the test asserts the EXACT advisory
 * text a human would see. This proves the warning SURFACES through the real hook,
 * not merely that a function returns a value in isolation.
 *
 * Contract under test (vision-locked):
 *   • near-duplicate plan write → advisory warning (slug + similarity) on stderr
 *   • ALWAYS allows the write — the advisory guard NEVER blocks / NEVER exits non-zero
 *   • non-plan target / empty content → guard skipped, checkDuplicate never called
 *   • checkDuplicate rejecting → run resolves no-warn (fail-open)
 *   • selfPlanPath forwarded (a re-save cannot flag itself)
 *   • the enforcement delegation to PreToolUse.Edit.js is preserved (additive)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

const hook = require('../src/hooks/PreToolUse.Write.js');

// Route the advisory log sink to a throwaway dir so the tests never touch the real
// project `.ctoc/logs/plan-index.log`. Injected as `deps.projectPath` on every run().
let TMP_PROJECT = '';
before(() => {
  TMP_PROJECT = fs.mkdtempSync(path.join(os.tmpdir(), 'pi5-hook-'));
});
after(() => {
  try { fs.rmSync(TMP_PROJECT, { recursive: true, force: true }); } catch { /* best-effort */ }
});

/** A capturing stderr sink: records every chunk written, exposes the joined text. */
function makeStderr() {
  const chunks = [];
  const write = (s) => {
    chunks.push(String(s));
    return true;
  };
  return { write, text: () => chunks.join('') };
}

const PLAN_PAYLOAD = () => ({
  tool_name: 'Write',
  tool_input: {
    file_path: 'plans/functional/auth-layer-cleanup.md',
    content: '---\ntitle: Auth layer cleanup\n---\n## Goal\nRefactor auth middleware.',
  },
});

describe('PI5-s2 PreToolUse.Write advisory duplicate guard — run(payload, deps)', () => {
  it('exports run, main, isPlanTarget, deriveSummary, normalizeRel', () => {
    assert.strictEqual(typeof hook.run, 'function');
    assert.strictEqual(typeof hook.main, 'function');
    assert.strictEqual(typeof hook.isPlanTarget, 'function');
    assert.strictEqual(typeof hook.deriveSummary, 'function');
    assert.strictEqual(typeof hook.normalizeRel, 'function');
  });

  // Case 1 — near-duplicate → advisory warning surfaces on stderr, write allowed.
  it('surfaces a named advisory warning (slug + similarity) on stderr for a near-duplicate', async () => {
    const stderr = makeStderr();
    const checkDuplicate = async () => [
      { plan: 'plans/functional/auth-middleware-refactor.md', similarity: 0.87 },
    ];
    const result = await hook.run(PLAN_PAYLOAD(), { checkDuplicate, stderr, projectPath: TMP_PROJECT });

    assert.strictEqual(result.warned, true);
    assert.strictEqual(result.warnings.length, 1);

    const out = stderr.text();
    // The exact surface a human sees: the near-duplicate slug AND the score.
    assert.ok(out.includes('auth-middleware-refactor'), `stderr should name the duplicate slug; got: ${out}`);
    assert.ok(out.includes('0.87'), `stderr should show the similarity score; got: ${out}`);
  });

  // Case 2 — advisory NEVER blocks: no deny/exit signal, process.exit never invoked.
  it('never blocks: result carries no deny/exit signal and process.exit is not called', async () => {
    const stderr = makeStderr();
    let exited = false;
    const exit = () => { exited = true; };
    const checkDuplicate = async () => [
      { plan: 'plans/functional/auth-middleware-refactor.md', similarity: 0.87 },
    ];
    const result = await hook.run(PLAN_PAYLOAD(), { checkDuplicate, stderr, exit, projectPath: TMP_PROJECT });

    assert.strictEqual(result.warned, true);
    assert.strictEqual(exited, false, 'run() must never call exit()');
    assert.ok(!('deny' in result), 'result must carry no deny signal');
    assert.ok(!('block' in result), 'result must carry no block signal');
  });

  // Case 3 — novel plan → no warning, no stderr noise.
  it('novel plan (empty matches) → no warning, stderr silent of the advisory prefix', async () => {
    const stderr = makeStderr();
    const checkDuplicate = async () => [];
    const result = await hook.run(PLAN_PAYLOAD(), { checkDuplicate, stderr, projectPath: TMP_PROJECT });

    assert.strictEqual(result.warned, false);
    assert.deepStrictEqual(result.warnings, []);
    assert.ok(!stderr.text().includes('possible duplicate'), 'no advisory line for a novel plan');
  });

  // Case 4 — non-plan target → guard skipped, checkDuplicate never called.
  it('non-plan target → guard skipped, checkDuplicate never called', async () => {
    const stderr = makeStderr();
    let called = false;
    const checkDuplicate = async () => { called = true; return []; };
    const payload = {
      tool_name: 'Write',
      tool_input: { file_path: 'src/lib/foo.js', content: 'const x = 1;' },
    };
    const result = await hook.run(payload, { checkDuplicate, stderr, projectPath: TMP_PROJECT });

    assert.strictEqual(result.warned, false);
    assert.strictEqual(called, false, 'checkDuplicate must not fire for non-plan targets');
  });

  // Case 5 — empty content → guard skipped (no summary), checkDuplicate never called.
  it('empty content → guard skipped, checkDuplicate never called', async () => {
    const stderr = makeStderr();
    let called = false;
    const checkDuplicate = async () => { called = true; return []; };
    const payload = {
      tool_name: 'Write',
      tool_input: { file_path: 'plans/functional/x.md', content: '' },
    };
    const result = await hook.run(payload, { checkDuplicate, stderr, projectPath: TMP_PROJECT });

    assert.strictEqual(result.warned, false);
    assert.strictEqual(called, false, 'checkDuplicate must not fire when there is no summary');
  });

  // Case 6 — fail-open: checkDuplicate rejects → run resolves no-warn (never rejects).
  it('fail-open: checkDuplicate rejecting → run resolves { warned:false }, never rejects', async () => {
    const stderr = makeStderr();
    const checkDuplicate = async () => { throw new Error('index blew up'); };
    const result = await hook.run(PLAN_PAYLOAD(), { checkDuplicate, stderr, projectPath: TMP_PROJECT });

    assert.strictEqual(result.warned, false);
    assert.deepStrictEqual(result.warnings, []);
    assert.ok(!stderr.text().includes('possible duplicate'), 'no advisory line on fail-open');
  });

  // Case 7 — selfPlanPath forwarded (a re-save cannot flag itself).
  it('forwards a normalized selfPlanPath so a re-save cannot flag itself', async () => {
    const stderr = makeStderr();
    let capturedOptions = null;
    const checkDuplicate = async (_summary, options) => {
      capturedOptions = options;
      return [];
    };
    await hook.run(PLAN_PAYLOAD(), { checkDuplicate, stderr, projectPath: TMP_PROJECT });

    assert.ok(capturedOptions, 'checkDuplicate should receive options');
    assert.strictEqual(
      capturedOptions.selfPlanPath,
      'plans/functional/auth-layer-cleanup.md',
      'selfPlanPath must be the repo-relative, forward-slash plan path'
    );
  });

  // Case 8 — multiple near-duplicates → each surfaces on its own stderr line.
  it('multiple near-duplicates → every slug + score surfaces on stderr', async () => {
    const stderr = makeStderr();
    const checkDuplicate = async () => [
      { plan: 'plans/functional/auth-a.md', similarity: 0.91 },
      { plan: 'plans/functional/auth-b.md', similarity: 0.86 },
    ];
    const result = await hook.run(PLAN_PAYLOAD(), { checkDuplicate, stderr, projectPath: TMP_PROJECT });

    assert.strictEqual(result.warnings.length, 2);
    const out = stderr.text();
    assert.ok(out.includes('auth-a'), 'first slug surfaces');
    assert.ok(out.includes('auth-b'), 'second slug surfaces');
    assert.ok(out.includes('0.91'), 'first score surfaces');
    assert.ok(out.includes('0.86'), 'second score surfaces');
  });

  // Case 9 — enforcement delegation preserved (additive-wiring smoke).
  it('preserves the enforcement delegation: the Write hook can still load PreToolUse.Edit.js', () => {
    // The additive advisory guard must not remove the enforcement path. We assert
    // the delegate module resolves and loads without the guard having consumed it,
    // and that requiring the Write hook module (this test's top-level require) did
    // not throw. A full enforcement-decision test is owned by the Edit hook tests.
    const editPath = path.join(__dirname, '..', 'src', 'hooks', 'PreToolUse.Edit.js');
    assert.doesNotThrow(() => require.resolve(editPath), 'the enforcement delegate must resolve');
    assert.strictEqual(typeof hook.main, 'function', 'main (which delegates enforcement) is exported');
  });

  // deriveSummary unit — bounded, title-aware, empty for non-string.
  it('deriveSummary: title-aware, bounded, empty for non-string content', () => {
    const s = hook.deriveSummary('---\ntitle: Hello World\n---\nbody text', 'plans/x.md');
    assert.ok(s.includes('Hello World'), 'summary should include the title');
    assert.ok(s.includes('body text'), 'summary should include content prefix');
    assert.strictEqual(hook.deriveSummary('', 'plans/x.md'), '', 'empty content → empty summary');
    assert.strictEqual(hook.deriveSummary(null, 'plans/x.md'), '', 'null content → empty summary');
    const big = 'x'.repeat(5000);
    assert.ok(hook.deriveSummary(big, 'plans/x.md').length <= 2100, 'summary is bounded (cap + title)');
  });

  // isPlanTarget unit — plans/**/*.md only.
  it('isPlanTarget: true for plans/**/*.md, false otherwise', () => {
    assert.strictEqual(hook.isPlanTarget('plans/functional/a.md'), true);
    assert.strictEqual(hook.isPlanTarget('plans/a.md'), true);
    assert.strictEqual(hook.isPlanTarget('src/lib/a.js'), false);
    assert.strictEqual(hook.isPlanTarget('plans/a.txt'), false);
    assert.strictEqual(hook.isPlanTarget(''), false);
    assert.strictEqual(hook.isPlanTarget(null), false);
  });
});
