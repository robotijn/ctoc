'use strict';

/**
 * THE DEAD-CODE FENCE — a ratcheting reachability gate.
 *
 * Root cause this closes (2026-07-14): a slice ships "module + its own test", a
 * test IS a caller, so every module always had a caller and nothing ever checked
 * reachability from a LIVE root. The suite certified dead code as healthy —
 * roughly half of src/ was unreachable while 5,889 tests passed. Modules were
 * built, tested, reviewed, and gate-approved without ever being wired; the
 * verify-evidence writer that Gate 3 depends on shipped exactly that way.
 *
 * THE RATCHET, and why a plain "zero unreachable" assertion is not enough:
 * the debt is real and is being paid down file by file. So this gate asserts
 * two things that together make regression impossible:
 *
 *   1. The unreachable COUNT may never rise above the committed baseline.
 *   2. No file may EVER join the unreachable set — the baseline is a named
 *      list, not just a number, so a newly-dead file fails the gate even if a
 *      previously-dead file was fixed in the same change (a swap that keeps the
 *      count flat).
 *
 * The baseline may only ever SHRINK. Lowering it is the reward for wiring or
 * deleting a file; raising it is forbidden and this test says so out loud.
 *
 * A TEST IS NEVER A ROOT. Live roots are: registered hooks, the three shipped
 * slash commands, pipeline-sanctioned scripts, and anything explicitly declared
 * in .ctoc/reachability-roots.json (a deliberate, reviewable act).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { analyze } = require('../src/lib/reachability');

const ROOT = path.join(__dirname, '..');
const BASELINE_FILE = path.join(ROOT, '.ctoc', 'reachability-baseline.json');

describe('dead-code fence — reachability from live roots (RATCHET)', () => {
  const result = analyze(ROOT);
  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  const allowed = new Set(baseline.unreachable);

  it('the analysis itself is non-vacuous: real files, real roots, real edges', () => {
    // Guards against a silent green from a broken analyzer (e.g. a path change
    // making it see zero files, which would make every assertion below trivial).
    assert.ok(result.total > 100, `expected a real src tree, saw ${result.total} files`);
    assert.ok(result.roots.length >= 10, `expected the live roots, saw ${result.roots.length}`);
    assert.ok(
      result.reachable.length > result.total / 4,
      'expected a substantial reachable core; the analyzer is probably broken'
    );
    // The three shipped slash commands must always be roots.
    for (const cmd of ['src/commands/menu.js', 'src/commands/push.js', 'src/commands/update.js']) {
      assert.ok(result.roots.includes(cmd), `${cmd} must be a live root`);
    }
    // A test file can never be a root, and never appear in the graph at all.
    assert.ok(
      !result.roots.some((r) => r.includes('/tests/') || r.endsWith('.test.js')),
      'a test must never be a live root — that is the bug this gate exists to prevent'
    );
  });

  it('NO NEW DEAD FILE: every unreachable file is already in the baseline', () => {
    const newlyDead = result.unreachable.filter((f) => !allowed.has(f));
    assert.deepEqual(
      newlyDead,
      [],
      'These files are unreachable from every live root — they are DEAD ON ARRIVAL.\n' +
      'A module is not done when its test passes; it is done when a human can reach it.\n' +
      'Wire each to a live root (hook, slash command, or sanctioned script), delete it,\n' +
      'or — if it is genuinely a new entry point — declare it in .ctoc/reachability-roots.json.\n' +
      `Newly dead: ${newlyDead.join(', ')}`
    );
  });

  it('THE RATCHET ONLY TIGHTENS: unreachable count never exceeds the baseline', () => {
    assert.ok(
      result.unreachable.length <= baseline.maxUnreachable,
      `unreachable count rose to ${result.unreachable.length}, baseline is ${baseline.maxUnreachable}. ` +
      'The baseline may only ever be LOWERED. Never raise it to make this pass.'
    );
  });

  it('LOWER THE BASELINE when you pay debt down (fails loudly on unclaimed progress)', () => {
    // The reward mechanism, mirroring the typecheck ratchet: if the live count
    // drops below the baseline, the baseline is stale and must be tightened, or
    // the fence slowly loses its grip.
    assert.equal(
      result.unreachable.length,
      baseline.maxUnreachable,
      `Live unreachable count is ${result.unreachable.length} but the baseline says ` +
      `${baseline.maxUnreachable}. You wired or deleted files — now LOWER maxUnreachable to ` +
      `${result.unreachable.length} and remove the fixed files from the baseline list.`
    );
  });

  it('the baseline list is honest: no phantom entries for files that no longer exist', () => {
    const phantoms = baseline.unreachable.filter(
      (f) => !fs.existsSync(path.join(ROOT, f))
    );
    assert.deepEqual(
      phantoms,
      [],
      `Baseline names files that do not exist (deleted?): ${phantoms.join(', ')} — remove them.`
    );
  });
});
