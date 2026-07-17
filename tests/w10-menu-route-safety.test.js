/**
 * W10-s3 — Menu route is crash-safe and traversal-guarded (M8 + M11).
 * Iron Loop Step 8 (TDD Red).
 *
 * Behavioral suite over src/lib/menu-screens.js. Every case drives the real
 * `route()` (and `validateScreen`) against adversarial plan references and
 * asserts the JSON menu contract `{text, ask, actions}` is returned — never a
 * raw crash, never a filesystem read past the traversal guard. No doubles.
 *
 *   M8  — an unknown stage (no STAGE_FOLDERS entry) made `folder` undefined and
 *         `path.join(plansDir, undefined, file)` threw a raw TypeError.
 *   M11 — a `../../etc/passwd` file reached `path.join` unguarded in planActions,
 *         planActionsMore and reviewActions (validateScreen already guarded it).
 *
 * Raw fs/os are permitted in tests/** (eslint exempts the fs rule there).
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ms = require('../src/lib/menu-screens');

// ── Isolated tmp project root ────────────────────────────────────────────────
let root;

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'w10-route-safety-'));
  fs.mkdirSync(path.join(root, 'plans', 'functional'), { recursive: true });
  // A legitimate plan for the happy-path regression guard (case 7).
  fs.writeFileSync(
    path.join(root, 'plans', 'functional', 'some-real-plan.md'),
    '# Some Real Plan\n\nA perfectly valid functional plan.\n',
    'utf8',
  );
});

after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

// Assert the JSON menu contract is intact.
function assertScreenShape(screen) {
  assert.equal(typeof screen, 'object');
  assert.ok(screen, 'screen is present');
  assert.equal(typeof screen.text, 'string', 'text is a string');
  assert.ok(screen.ask && Array.isArray(screen.ask.questions), 'ask.questions is an array');
  assert.equal(typeof screen.actions, 'object', 'actions is an object');
  assert.ok(screen.actions, 'actions is present');
}

// Drive route() and fail loudly if it throws past the router.
function routeNoThrow(args) {
  try {
    return ms.route(args, root);
  } catch (err) {
    assert.fail(`route(${JSON.stringify(args)}) threw instead of returning a screen: ${err && err.message}`);
  }
  return undefined;
}

describe('W10-s3 — menu route crash-safety and traversal guard', () => {
  // Case 1 — scenario 11
  it('unknown stage returns the JSON contract and does not throw', () => {
    const screen = routeNoThrow(['plan', 'bogus/x.md']);
    assertScreenShape(screen);
    assert.match(screen.text, /Invalid plan reference/);
  });

  // Case 2 — scenario 12
  it('rejects traversal in planActions with no file read', () => {
    const screen = routeNoThrow(['plan', 'functional/../../../etc/passwd']);
    assertScreenShape(screen);
    assert.match(screen.text, /Refusing a reference that escapes the plans\/ directory\./);
    // No file content leaked into the refusal text.
    assert.doesNotMatch(screen.text, /root:.*:0:0:/);
  });

  // Case 3 — scenario 13
  it('rejects traversal in reviewActions with no file read', () => {
    const screen = routeNoThrow(['plan', 'review/../../../etc/passwd', 'review']);
    assertScreenShape(screen);
    assert.match(screen.text, /Refusing a reference that escapes the plans\/ directory\./);
    assert.doesNotMatch(screen.text, /root:.*:0:0:/);
  });

  // Case 4 — planActionsMore latent gap
  it('rejects traversal in planActionsMore with no file read', () => {
    const screen = routeNoThrow(['plan', 'functional/../../../etc/passwd', 'more']);
    assertScreenShape(screen);
    assert.match(screen.text, /Refusing a reference that escapes the plans\/ directory\./);
    assert.doesNotMatch(screen.text, /root:.*:0:0:/);
  });

  // Case 5 — message parity with validateScreen
  it('produces the same refusal message as validateScreen (shared helper)', () => {
    const viaPlan = routeNoThrow(['plan', 'functional/../../../etc/passwd']);
    const viaValidate = routeNoThrow(['validate', 'functional/../../../etc/passwd']);
    assertScreenShape(viaPlan);
    assertScreenShape(viaValidate);
    assert.equal(viaPlan.text, viaValidate.text, 'plan and validate share the refusal text');
  });

  // Case 6 — no-raw-crash adversarial sweep
  it('never throws past route() for any adversarial reference', () => {
    const refs = [
      'bogus/x.md',                    // unknown stage → folder undefined (M8)
      'functional/../../etc/passwd',   // POSIX traversal (M11)
      'functional/..\\..\\etc\\passwd', // backslash / Windows-style traversal
      'functional/',                   // empty file part
      'functional/x\0.md',             // NUL byte
    ];
    for (const ref of refs) {
      for (const variant of [['plan', ref], ['plan', ref, 'more'], ['plan', ref, 'review']]) {
        const screen = routeNoThrow(variant);
        assertScreenShape(screen);
      }
    }
  });

  // Case 7 — happy path unchanged
  it('leaves a legitimate plan reference unaffected', () => {
    const screen = routeNoThrow(['plan', 'functional/some-real-plan.md']);
    assertScreenShape(screen);
    assert.match(screen.text, /Some Real Plan/);
    assert.doesNotMatch(screen.text, /Invalid plan reference/);
    // The plan screen renders the plan's BODY, not just its heading.
    assert.match(screen.text, /A perfectly valid functional plan\./);
    // It used to be a four-verb actions menu, so this counted four action keys.
    // Opening a plan is a question now and the key count is no longer the
    // contract — the invariant that matters is that every option the human can
    // pick actually resolves to an action. That is asserted directly, which is
    // stronger than a magic number that any relabelling would break.
    for (const q of screen.ask.questions) {
      for (const opt of q.options) {
        assert.ok(
          opt.label in screen.actions,
          `option "${opt.label}" has no action — it would be a dead button`,
        );
      }
    }
  });
});
