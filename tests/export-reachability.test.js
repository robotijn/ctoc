'use strict';

/**
 * THE DEAD-EXPORT FENCE — a ratcheting reachability gate, one level below files.
 *
 * WHY (2026-07-14). The file fence (tests/reachability.test.js) asks "can a human
 * reach this FILE?". It cannot see a dead EXPORT inside a live file — and that is
 * exactly how the worst defect of the wave shipped: `completeExecution` lived in
 * `src/lib/actions.js` (a very live file), was the ONLY producer of the Gate-3
 * VERIFY evidence, and had ZERO callers. The file fence was green the whole time.
 *
 * Same ratchet as the file fence, one level down:
 *   1. The dead-export set is a NAMED baseline — a swap cannot hide a new dead
 *      export behind a flat count.
 *   2. The count may never rise above the baseline.
 *   3. Unclaimed progress FAILS: wire or delete an export and you must lower the
 *      baseline, or the fence loses its grip.
 *
 * A TEST IS NEVER A CALLER. That is the whole point — a slice ships "module + its
 * own test", so a test-only caller is precisely the false green this fence exists
 * to catch. `analyzeExports` never looks at tests/.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { analyzeExports } = require('../src/lib/reachability');

const ROOT = path.join(__dirname, '..');
const BASELINE_FILE = path.join(ROOT, '.ctoc', 'export-reachability-baseline.json');

describe('dead-export fence — exports reachable from live callers (RATCHET)', () => {
  const result = analyzeExports(ROOT);
  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  const allowed = new Set(baseline.dead);

  it('the analysis is non-vacuous: real modules, real exports, real usage edges', () => {
    assert.ok(result.totalExports > 200, `expected a real export surface, saw ${result.totalExports}`);
    assert.ok(result.totalModules > 50, `expected the live module set, saw ${result.totalModules}`);
    // A substantial live core must exist — if the analyzer saw almost nothing as
    // live, its usage index is broken and every "dead" verdict below is noise. (The
    // live share is under half today: that is the DEBT, not an analyzer fault, and
    // the ratchet exists to shrink it. The real non-vacuity guard is the planted
    // dead export below.)
    assert.ok(
      result.live.length > result.totalExports / 4,
      `expected a substantial live core, saw ${result.live.length}/${result.totalExports}; the analyzer is probably broken`
    );
    // A test is never a caller: no test file may appear as a usage source.
    assert.ok(
      !result.sources.some((s) => s.includes('/tests/') || s.endsWith('.test.js')),
      'a test must NEVER count as a caller — that is the false green this fence exists to catch'
    );
  });

  it('NON-VACUITY (the real guard): a planted dead export in a fixture project is DETECTED', () => {
    // Build a miniature project with the same shape as CTOC: a live root
    // (src/commands/menu.js) requiring a lib module. The lib exports one name the
    // root uses and one nobody uses anywhere. If the analyzer cannot see the
    // difference, every assertion below is worthless — so prove it can.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-exportfence-'));
    try {
      fs.mkdirSync(path.join(tmp, 'src', 'commands'), { recursive: true });
      fs.mkdirSync(path.join(tmp, 'src', 'lib'), { recursive: true });
      fs.writeFileSync(
        path.join(tmp, 'src', 'commands', 'menu.js'),
        "const { usedByTheMenu } = require('../lib/live');\nusedByTheMenu();\n"
      );
      fs.writeFileSync(
        path.join(tmp, 'src', 'lib', 'live.js'),
        'function usedByTheMenu() { return 1; }\n' +
        'function nobodyCallsThis() { return 2; }\n' +
        'module.exports = { usedByTheMenu, nobodyCallsThis };\n'
      );
      // A test file that DOES call the dead export — the exact false-green shape.
      fs.mkdirSync(path.join(tmp, 'tests'), { recursive: true });
      fs.writeFileSync(
        path.join(tmp, 'tests', 'live.test.js'),
        "const { nobodyCallsThis } = require('../src/lib/live');\nnobodyCallsThis();\n"
      );

      const r = analyzeExports(tmp);
      assert.ok(
        r.dead.includes('src/lib/live.js#nobodyCallsThis'),
        `a dead export must be DETECTED even when a test calls it. dead = ${JSON.stringify(r.dead)}`
      );
      assert.ok(
        !r.dead.includes('src/lib/live.js#usedByTheMenu'),
        'an export a live root actually calls must NOT be reported dead'
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('completeExecution is NOT dead — the key is cut (the defect this fence was born from)', () => {
    assert.ok(
      !result.dead.includes('src/lib/actions.js#completeExecution'),
      'completeExecution is the ONLY producer of the Gate-3 VERIFY evidence. ' +
      'If it is dead, Gate 3 is un-passable except by override. Wire it.'
    );
    assert.ok(
      !allowed.has('src/lib/actions.js#completeExecution'),
      'completeExecution must NEVER be fenced into the baseline — it must be WIRED.'
    );
  });

  it('NO NEW DEAD EXPORT: every dead export is already in the baseline', () => {
    const newlyDead = result.dead.filter((e) => !allowed.has(e));
    assert.deepEqual(
      newlyDead,
      [],
      'These exports have no live caller — they are DEAD ON ARRIVAL inside a live file.\n' +
      'A test is NOT a caller. Wire each to a live call site, delete it, or declare it\n' +
      'in .ctoc/reachability-roots.json ("exports": [...]) if it is genuinely an entry point.\n' +
      `Newly dead: ${newlyDead.join(', ')}`
    );
  });

  it('THE RATCHET ONLY TIGHTENS: the dead-export count never exceeds the baseline', () => {
    assert.ok(
      result.dead.length <= baseline.maxDead,
      `dead-export count rose to ${result.dead.length}, baseline is ${baseline.maxDead}. ` +
      'The baseline may only ever be LOWERED. Never raise it to make this pass.'
    );
  });

  it('LOWER THE BASELINE when you pay debt down (fails loudly on unclaimed progress)', () => {
    assert.equal(
      result.dead.length,
      baseline.maxDead,
      `Live dead-export count is ${result.dead.length} but the baseline says ${baseline.maxDead}. ` +
      `You wired or deleted exports — now LOWER maxDead to ${result.dead.length} and remove the ` +
      'fixed entries from the baseline list.'
    );
  });

  it('the baseline list is honest: no phantom entries for files that no longer exist', () => {
    const phantoms = baseline.dead.filter((e) => {
      const file = String(e).split('#')[0];
      return !fs.existsSync(path.join(ROOT, file));
    });
    assert.deepEqual(phantoms, [], `Baseline names files that do not exist: ${phantoms.join(', ')} — remove them.`);
  });
});
