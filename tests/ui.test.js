/**
 * Unit tests for CTOC UI Library
 *
 * The module under test is `src/lib/ui.js`, which after 2026-07-20 is terminal
 * colours and a terminal writer — nothing else. Five screen builders (`dashboard`,
 * `progress`, `adminDashboard`, `blocked`, `getPhase`) were DELETED as unreachable:
 * their only callers were the cases in this file, and a test is a caller, so this
 * suite is precisely what had been certifying them as healthy.
 *
 * Every case that exercised one of the five is DELETED, not weakened. That is the
 * narrow legitimate reason to remove a test under this project's "fix the failures,
 * not the tests" rule: the contract those cases asserted has been explicitly
 * removed, so there is no behaviour left for them to protect. Loosening them to
 * "still returns a string" would have been the green-washing the rule forbids.
 *
 * Three of the deleted cases asserted the DEFECT that motivated the deletion —
 * `assert.ok(plain.includes('Get user approval at Gate 1'))`. A gate NUMBER is
 * CTOC's own internal code and must never reach a screen. Those assertions are not
 * merely dropped; they are INVERTED, into a fence below that fails if any printable
 * gate number returns to this module.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ui = require('../src/lib/ui');

// ============================================================================
// Test: colors object
// ============================================================================

describe('colors object', () => {
  it('exports all expected color codes', () => {
    const expectedColors = ['red', 'green', 'yellow', 'blue', 'cyan', 'magenta', 'bold', 'dim', 'reset'];
    for (const color of expectedColors) {
      assert.ok(ui.colors[color], `Missing color: ${color}`);
      assert.ok(ui.colors[color].startsWith('\x1b['), `Invalid ANSI code for: ${color}`);
    }
  });

  it('has correct ANSI codes', () => {
    assert.strictEqual(ui.colors.reset, '\x1b[0m');
    assert.strictEqual(ui.colors.bold, '\x1b[1m');
    assert.strictEqual(ui.colors.dim, '\x1b[2m');
  });
});

// ============================================================================
// Test: doctor formatter REMOVED (R6-C)
// ============================================================================
// ui.js#doctor was a dead export (a section-shaped formatter nothing rendered).
// The live doctor screen is src/tabs/tools.js#renderDoctor, which uses a
// different flat {label,pass} model and carries strictly more (sync, menu,
// input, footer). doctor() carried no logic renderDoctor lacked, so it was
// deleted. It must no longer exist on the ui module.

describe('doctor formatter removed', () => {
  it('ui.doctor is undefined — the dead export was deleted, not baselined', () => {
    assert.strictEqual(ui.doctor, undefined);
    assert.ok(!('doctor' in ui), 'doctor must not be exported by ui.js');
  });
});

// ============================================================================
// Test: writeToTerminal function
// ============================================================================

describe('writeToTerminal', () => {
  it('is a function', () => {
    assert.strictEqual(typeof ui.writeToTerminal, 'function');
  });

  it('writes its text to STDERR, not stdout', () => {
    // stderr is load-bearing, not incidental: both live callers
    // (src/hooks/PreToolUse.Bash.js, src/hooks/SessionStart.js) emit a decision
    // JSON on stdout, and a human banner written there would corrupt it.
    const originalErr = process.stderr.write;
    const originalOut = process.stdout.write;
    const err = [];
    const out = [];
    process.stderr.write = (chunk) => { err.push(String(chunk)); return true; };
    process.stdout.write = (chunk) => { out.push(String(chunk)); return true; };
    try {
      ui.writeToTerminal('a human banner');
    } finally {
      process.stderr.write = originalErr;
      process.stdout.write = originalOut;
    }

    assert.deepStrictEqual(err, ['a human banner']);
    assert.deepStrictEqual(out, [], 'stdout must stay clean for the hook decision JSON');
  });
});

// ============================================================================
// Test: the five screen builders are DELETED, and no gate number can come back
// ============================================================================
// dashboard, progress, adminDashboard, blocked and getPhase were screen builders
// that printed a two-gate model the pipeline outgrew, and printed it using the
// pipeline's internal gate NUMBERS ("Gate 1", "Gate 2") — a code the person
// reading the screen has no way to decode. Nothing outside tests/ ever called
// them: the only live requires of this module are src/hooks/PreToolUse.Bash.js
// (writeToTerminal, colors) and src/hooks/SessionStart.js (writeToTerminal),
// both static destructurings. A test is a caller, so their green tests proved
// they ran and proved nothing about a human reaching them.
//
// They were DELETED rather than re-worded: re-wording produces correctly-phrased
// code no human can reach, and leaves the impression the wording problem was
// solved. What remains is what the two hooks actually use.

/** The module's own source, with comments removed. */
function uiSourceWithoutComments() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'ui.js'), 'utf8');
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

describe('the dead screen builders are gone', () => {
  const deleted = ['dashboard', 'progress', 'adminDashboard', 'blocked', 'getPhase'];

  it('exports exactly the two names the hooks use', () => {
    assert.deepStrictEqual(
      Object.keys(ui).sort(),
      ['colors', 'writeToTerminal'],
      'ui.js is terminal colours and a terminal writer; anything else is a screen ' +
      'builder no live entry point reaches.'
    );
  });

  for (const name of deleted) {
    it(`ui.${name} is undefined — re-introducing it is caught here, not by the fence weeks later`, () => {
      assert.strictEqual(ui[name], undefined);
      assert.ok(!(name in ui), `${name} must not be exported by ui.js`);
    });
  }

  it('no gate NUMBER survives anywhere in the module a person could read', () => {
    // Comments are stripped first, and the match is case-SENSITIVE on a capital
    // "Gate": a gate number is legitimate in a comment and in a code identifier
    // (`state.gate1_approval` is a field name, not something a person reads) —
    // the rule is that it must never reach a SCREEN. This asserts over the
    // printable code, in the capitalised form every real print site used.
    const code = uiSourceWithoutComments();
    const hits = code.match(/Gate\s*[0-9]/g) || [];
    assert.deepStrictEqual(
      hits,
      [],
      'src/lib/ui.js prints a gate number. "Gate 1" is CTOC\'s own internal code — ' +
      'the person reading the screen does not carry a numbered map of the pipeline. ' +
      `Say what the moment IS. Found: ${hits.join(', ')}`
    );
  });

  it('the module no longer pulls in the step tables only a screen builder needed', () => {
    // dashboard/progress were the only readers of STEP_NAMES / STEP_DESCRIPTIONS.
    // A require kept alive purely to keep a token visible to the export fence
    // would be gaming that fence, so the require goes with its readers.
    const code = uiSourceWithoutComments();
    assert.doesNotMatch(code, /require\(\s*['"]\.\/state-manager['"]\s*\)/);
    assert.ok(!code.includes('STEP_NAMES'), 'STEP_NAMES has no reader here any more');
    assert.ok(!code.includes('STEP_DESCRIPTIONS'), 'STEP_DESCRIPTIONS has no reader here any more');
  });
});
