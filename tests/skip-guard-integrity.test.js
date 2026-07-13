/**
 * Skip-guard integrity — audit finding A2 (paired stories S1, S2 of the W06
 * "the test suite tells the truth" workstream: ctoc-audit-w06-truthful-tests).
 *
 * Invariant: an absent module must FAIL its test loudly — it must never turn a
 * `require()` failure into a silent skip or a nulled binding. The classic carrier is
 *
 *     try { mod = require('../src/lib/x.js'); } catch (e) { mod = null; }
 *     ... if (!mod) { t.skip('Module not implemented yet'); return; }
 *
 * which yields `pass 0 / fail 0 / skip 1` — green under the `# fail 0` gate — the day
 * `x.js` is deleted, renamed, or never built. A second carrier swallows the failure
 * straight into a skip:
 *
 *     try { ({ openStore } = require('../src/lib/plan-index')); } catch { t.skip(...); return; }
 *
 * This guard scans the whole test corpus and fails when any file exhibits either
 * carrier. It keys on the swallow MECHANISM — a `require()` inside a `try` whose
 * matching `catch` nullifies the binding or calls `.skip()` — NOT on `.skip(` in
 * general. Legitimate runtime-probe skips (a missing `git` binary, an unreachable
 * Ollama) gate on a runtime probe, never on a `require()` throwing, so they are never
 * inside a require-catch and remain fully possible.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TESTS_DIR = __dirname;
const SELF = path.basename(__filename);

/**
 * Returns true when `src` swallows a `require()` failure inside a `catch` block —
 * the anti-pattern this guard forbids.
 *
 * The `}\s*catch` anchor pins the correct `try` body even when that body contains
 * destructuring braces, e.g. `({ openStore } = require(...))`, because only the
 * try-block's own closing brace is immediately followed by `catch`.
 *
 * @param {string} src source text of a test file
 * @returns {boolean} true if a require-failure is swallowed into a null/undefined
 *   binding or a `.skip()` call
 */
function swallowsRequireFailure(src) {
  const re = /try\s*\{([\s\S]*?)\}\s*catch\s*(?:\([^)]*\))?\s*\{([\s\S]*?)\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const tryBody = m[1];
    const catchBody = m[2];
    if (!/\brequire\s*\(/.test(tryBody)) continue;
    const nullsBinding = /=\s*(?:null|undefined)\b/.test(catchBody);
    const swallowsToSkip = /\.skip\s*\(/.test(catchBody);
    if (nullsBinding || swallowsToSkip) return true;
  }
  return false;
}

function testFiles() {
  return fs
    .readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith('.test.js') && f !== SELF)
    .sort();
}

describe('skip-guard integrity', () => {
  it('no test swallows a require() failure into a nulled binding or a skip', () => {
    const offenders = [];
    for (const f of testFiles()) {
      const src = fs.readFileSync(path.join(TESTS_DIR, f), 'utf8');
      if (swallowsRequireFailure(src)) offenders.push(f);
    }
    assert.deepEqual(
      offenders,
      [],
      'These test files convert a require() failure into a silent skip/null instead ' +
        'of a loud failure (audit finding A2). Hoist the require to a hard top-level ' +
        'call and delete the null/skip guard:\n  - ' +
        offenders.join('\n  - ')
    );
  });

  // Non-vacuity: the detector must actually detect the mechanism it forbids AND must
  // spare a hard require, a legitimate runtime-probe skip, and a non-require cleanup
  // catch. Without this, a broken detector regex could make the scan above vacuously
  // green after the carriers are fixed.
  it('detector flags the swallow mechanism and spares legitimate patterns (non-vacuity)', () => {
    const nulled = "try { mod = require('../src/lib/x.js'); } catch (e) { mod = null; }";
    const skipped =
      "try { ({ openStore } = require('../src/lib/x')); } catch { t.skip('gated'); return; }";
    const hardRequire = "const mod = require('../src/lib/x.js');";
    const probeSkip = "if (!gitAvailable()) { t.skip('git binary not available'); return; }";
    const cleanupCatch = 'try { fs.rmSync(dir, { recursive: true }); } catch { /* best effort */ }';

    assert.equal(
      swallowsRequireFailure(nulled),
      true,
      'must flag a catch that nulls a required binding'
    );
    assert.equal(
      swallowsRequireFailure(skipped),
      true,
      'must flag a catch that skips a required binding'
    );
    assert.equal(
      swallowsRequireFailure(hardRequire),
      false,
      'must spare a hard top-level require'
    );
    assert.equal(
      swallowsRequireFailure(probeSkip),
      false,
      'must spare a runtime-probe skip (no require inside the catch)'
    );
    assert.equal(
      swallowsRequireFailure(cleanupCatch),
      false,
      'must spare a non-require cleanup catch'
    );
  });
});
