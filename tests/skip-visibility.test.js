/**
 * Skip visibility — a skipped test must be COUNTED as a skipped test.
 *
 * CLAUDE.md states that the Step 14 gate enforces "0 skipped", and
 * `src/scripts/test-gate.js` names `skipped > 0` as one of its three trip
 * conditions. That guarantee is only as good as the counter it reads, and the
 * counter has two blind spots. This fence closes both.
 *
 * THE GATE PARSER IS CORRECT AND IS NOT TOUCHED. `parseSkipped` returns `null`
 * (never `0`) when it cannot read its input — the fail-closed shape this
 * repository deliberately maintains. The defect was never the parser. The defect
 * is that skips existed which never reached node's summary counter at all, so the
 * parser truthfully read `0` over a suite that had skipped tests.
 *
 * ── Carrier A — a `node:test` skip/todo OPTION on a suite ─────────────────────
 * Measured on node v24.14.1 (recorded in this slice's Execution Record):
 *
 *     describe('A', { skip: 'reason' }, () => { it('inner', ...); });
 *     → ℹ tests 0   ℹ skipped 0
 *
 * A skipped SUITE contributes NOTHING to `skipped`, and its inner tests vanish
 * from `tests` as well. A skipped TEST is counted, but only on the machine where
 * its condition happens to be true — a conditional `{ skip: probe }` is a gate
 * that is green here and red in a container, which is the same false-green wearing
 * a different hat. So the option is banned outright on both suites and tests.
 *
 * ── Carrier B — a hand-rolled skip that abandons a test body ──────────────────
 * Sixteen files in this corpus use their own `test()`/`assert()` rather than
 * `node:test`. To node the whole file is one test, so a branch that announces a
 * skip and abandons the body reports as a PASS. The signature is precise: a
 * `console.log` mentioning skip, immediately followed by abandonment — a bare
 * `return;`, or the end of an `else` block.
 *
 * The rule is deliberately narrow so it discriminates rather than nags. It spares:
 *   - a PASS LABEL about the subject under test ("# Pipeline skipped when
 *     disabled" in deployment.test.js, printed AFTER real assertions);
 *   - prose about the zero-skipped gate itself (escalation-word-boundary.test.js
 *     was already bitten by a detector that misread this);
 *   - an abandonment that RECORDS A FAILURE rather than a pass
 *     (playwright-scaffolder.test.js returns `{ failed: 1 }`, which exits non-zero
 *     and so is already visible to the gate — it is loud, not silent).
 *
 * ── The sanctioned alternative: gate the REGISTRATION, never the body ─────────
 * `tests/plan-index-embedding.test.js:9-21` already established and documented
 * this pattern. A test that is never registered neither runs nor skips, so it
 * contributes 0 to the counter deterministically on every platform. That file is
 * the exemplar, which is why `t.skip(` is permitted only in a file that declares
 * an opt-in `process.env.<NAME> === '1'` registration gate.
 *
 * NO EXEMPTION SHIPS NON-EMPTY. `ALLOWLIST` and `KNOWN_DEBT` below are live inputs
 * to the scan and are asserted empty, so an exemption cannot be added silently —
 * per CLAUDE.md's warning that conflating a shrinking debt ledger with a permanent
 * whitelist is what kills a fence.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TESTS_DIR = __dirname;
const SELF = path.basename(__filename);

/**
 * Permanent exemptions. Adding an entry requires a written justification inline.
 * Asserted empty by the final case, so growth cannot happen unnoticed.
 * @type {string[]}
 */
const ALLOWLIST = [];

/**
 * Pre-existing debt, may only ever SHRINK. Empty because this slice fixed every
 * site it found rather than carrying any forward.
 * @type {string[]}
 */
const KNOWN_DEBT = [];

// Compiled once, never inside the per-file loop (Step 12).
const REGISTRATION_CALL =
  /\b(?:describe|it|test)\s*\(\s*(['"`])(?:\\.|(?!\1)[\s\S])*?\1\s*,\s*\{([^{}]*)\}/g;
const SKIP_OR_TODO_KEY = /\b(?:skip|todo)\s*:/;
const CONSOLE_LOG = /console\s*\.\s*log\s*\(/;
const SKIP_WORD = /\bskip(?:ped|ping)?\b/i;
const CONTEXT_SKIP = /\bt\s*\.\s*skip\s*\(/;
const REGISTRATION_GATE = /process\.env\.[A-Z0-9_]+\s*===\s*['"]1['"]/;
const ELSE_OPENER = /\belse\s*\{\s*$/;
const COMMENT_LINE = /^(?:\/\/|\/\*|\*)/;

/**
 * Carrier A — a `node:test` registration call carrying a `skip:` or `todo:` option.
 *
 * Keys on the OPTIONS-OBJECT POSITION (second argument, after the name string),
 * never on the bare token. A stage map like `{ todo: 'implementation' }` or a plan
 * count like `{ todo: 0 }` is not a registration call and is spared; a test whose
 * NAME contains "todo:" is spared because no options object follows its name.
 *
 * @param {string} src source text of a test file
 * @returns {number[]} 1-based line numbers of offending registrations
 */
function findSkipOptions(src) {
  const hits = [];
  REGISTRATION_CALL.lastIndex = 0;
  let m;
  while ((m = REGISTRATION_CALL.exec(src)) !== null) {
    if (!SKIP_OR_TODO_KEY.test(m[2])) continue;
    hits.push(src.slice(0, m.index).split('\n').length);
  }
  return hits;
}

/**
 * True when the `}` at `lines[j]` closes an `else { ... }` block.
 *
 * Walks backwards counting brace depth right-to-left, so the `{` of `} else {` is
 * reached before that line's own `}`.
 *
 * @param {string[]} lines file split on newlines
 * @param {number} j 0-based index of the closing-brace line
 * @returns {boolean} true when the matching opener is an `else {`
 */
function closesElseBlock(lines, j) {
  let depth = 0;
  for (let k = j; k >= 0; k--) {
    const line = lines[k];
    for (let c = line.length - 1; c >= 0; c--) {
      if (line[c] === '}') depth++;
      else if (line[c] === '{') {
        depth--;
        if (depth === 0) return ELSE_OPENER.test(line.slice(0, c + 1));
      }
    }
  }
  return false;
}

/**
 * Carrier B — a hand-rolled skip: a `console.log` mentioning skip whose next
 * meaningful statement abandons the test body without recording a failure.
 *
 * @param {string} src source text of a test file
 * @returns {number[]} 1-based line numbers of offending logs
 */
function findHandRolledSkips(src) {
  const lines = src.split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (!CONSOLE_LOG.test(lines[i]) || !SKIP_WORD.test(lines[i])) continue;
    let j = i + 1;
    while (j < lines.length && (lines[j].trim() === '' || COMMENT_LINE.test(lines[j].trim()))) j++;
    if (j >= lines.length) continue;
    const next = lines[j].trim();
    if (next === 'return;' || (next === '}' && closesElseBlock(lines, j))) hits.push(i + 1);
  }
  return hits;
}

/**
 * Blanks the CONTENT of every string literal, template literal and comment,
 * preserving byte length and newlines so line numbers survive.
 *
 * Required by Carrier C: `skip-guard-integrity.test.js` embeds `t.skip(...)` inside
 * fixture STRINGS for its own non-vacuity block. A detector that matched those would
 * be reading prose as code — the same misread that already bit
 * `tests/escalation-word-boundary.test.js:131`.
 *
 * @param {string} src source text
 * @param {{keepStrings?: boolean}} [opts] when `keepStrings`, only comments are
 *   blanked — needed because the registration-gate probe itself matches on the
 *   string literal `'1'` in `process.env.X === '1'`.
 * @returns {string} source with literal and comment interiors replaced by spaces
 */
function blankLiteralsAndComments(src, opts) {
  const keepStrings = Boolean(opts && opts.keepStrings);
  let out = '';
  let mode = 'code';
  let quote = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && next === '/') { mode = 'line'; out += '  '; i++; continue; }
      if (c === '/' && next === '*') { mode = 'block'; out += '  '; i++; continue; }
      if (c === "'" || c === '"' || c === '`') { mode = 'string'; quote = c; out += c; continue; }
      out += c;
      continue;
    }
    if (mode === 'line') {
      if (c === '\n') { mode = 'code'; out += c; } else out += ' ';
      continue;
    }
    if (mode === 'block') {
      if (c === '*' && next === '/') { mode = 'code'; out += '  '; i++; continue; }
      out += c === '\n' ? c : ' ';
      continue;
    }
    // mode === 'string'
    if (c === '\\') { out += keepStrings ? c + (next === undefined ? '' : next) : '  '; i++; continue; }
    if (c === quote) { mode = 'code'; out += c; continue; }
    out += keepStrings || c === '\n' ? c : ' ';
  }
  return out;
}

/**
 * Carrier C — a runtime `t.skip()` in a file that declares no opt-in registration
 * gate. Inside a gated file the call sites are unreachable in the default run and
 * contribute 0 to the counter; outside one they are a live skip.
 *
 * @param {string} src source text of a test file
 * @returns {boolean} true when the file skips at runtime without a registration gate
 */
function hasUngatedContextSkip(src) {
  const code = blankLiteralsAndComments(src);
  const withStrings = blankLiteralsAndComments(src, { keepStrings: true });
  return CONTEXT_SKIP.test(code) && !REGISTRATION_GATE.test(withStrings);
}

function testFiles() {
  return fs
    .readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith('.test.js') && f !== SELF)
    .filter((f) => !ALLOWLIST.includes(f) && !KNOWN_DEBT.includes(f))
    .sort();
}

/**
 * Reads the corpus ONCE and runs every detector over each file, rather than making
 * one full pass per carrier. Memoized so the three cases below share a single scan.
 * @returns {{skipOptions: string[], handRolled: string[], ungatedSkips: string[]}}
 */
const scanCorpus = (() => {
  let cached = null;
  return () => {
    if (cached) return cached;
    const skipOptions = [];
    const handRolled = [];
    const ungatedSkips = [];
    for (const f of testFiles()) {
      const src = fs.readFileSync(path.join(TESTS_DIR, f), 'utf8');
      for (const line of findSkipOptions(src)) skipOptions.push(`${f}:${line}`);
      for (const line of findHandRolledSkips(src)) handRolled.push(`${f}:${line}`);
      if (hasUngatedContextSkip(src)) ungatedSkips.push(f);
    }
    cached = { skipOptions, handRolled, ungatedSkips };
    return cached;
  };
})();

describe('skip visibility — a skipped test is counted as a skipped test', () => {
  it('no test file declares a node:test skip: or todo: option', () => {
    const offenders = scanCorpus().skipOptions;
    assert.deepEqual(
      offenders,
      [],
      'A `skip:`/`todo:` option on a SUITE contributes nothing to node\'s skipped ' +
        'counter (its inner tests vanish entirely), and on a TEST it makes the gate ' +
        'nondeterministic across machines. Gate the REGISTRATION instead — see ' +
        'tests/plan-index-embedding.test.js:9-21.\n  - ' +
        offenders.join('\n  - ')
    );
  });

  it('no test file announces a hand-rolled skip that abandons the body', () => {
    const offenders = scanCorpus().handRolled;
    assert.deepEqual(
      offenders,
      [],
      'These lines print a skip and then abandon the test without asserting and ' +
        'without recording a failure, so the file reports a PASS and the gate sees ' +
        'nothing. Assert the capability-absent behaviour, or gate the ' +
        'registration.\n  - ' +
        offenders.join('\n  - ')
    );
  });

  it('t.skip() appears only in a file with an opt-in registration gate', () => {
    const offenders = scanCorpus().ungatedSkips;
    assert.deepEqual(
      offenders,
      [],
      'A runtime t.skip() outside an opt-in `process.env.X === "1"` registration ' +
        'gate is a live skip that trips the zero-skipped gate on some machine.\n  - ' +
        offenders.join('\n  - ')
    );
  });

  // Non-vacuity. Without this block, a broken detector regex would make all three
  // corpus scans above vacuously green — which is precisely the false-green defect
  // class this fence exists to prevent.
  it('the detectors flag each carrier and spare each legitimate pattern (non-vacuity)', () => {
    // ── Carrier A: flags ──
    assert.deepEqual(
      findSkipOptions("describe('release', { skip: 'reason' }, () => {});"),
      [1],
      'must flag a suite-level skip option'
    );
    assert.deepEqual(
      findSkipOptions("test('x', { skip: PROBE }, () => {});"),
      [1],
      'must flag a conditional test-level skip option'
    );
    assert.deepEqual(
      findSkipOptions("describe('x', { skip: false }, () => {});"),
      [1],
      'must flag even a vestigial `skip: false`, which reads as a skip'
    );
    assert.deepEqual(
      findSkipOptions("it('x', { todo: true }, () => {});"),
      [1],
      'must flag a todo option'
    );

    // ── Carrier A: spares ──
    assert.deepEqual(
      findSkipOptions("const STAGES = { todo: 'implementation', done: 'review' };"),
      [],
      'must spare a plain object literal with a todo key'
    );
    assert.deepEqual(
      findSkipOptions("const counts = { functional: 3, todo: 5 };"),
      [],
      'must spare a plan-count literal'
    );
    assert.deepEqual(
      findSkipOptions("it('implementation->todo: passes with a title', () => {});"),
      [],
      'must spare a test whose NAME contains todo:'
    );
    assert.deepEqual(
      findSkipOptions("test('x', { concurrency: 2 }, () => {});"),
      [],
      'must spare a registration with a non-skip option'
    );

    // ── Carrier B: flags ──
    assert.deepEqual(
      findHandRolledSkips("if (!ok) {\n  console.log('# T1 - SKIPPED (not found)');\n  return;\n}"),
      [2],
      'must flag a skip log followed by a bare return'
    );
    assert.deepEqual(
      findHandRolledSkips(
        "if (a) {\n  assert(x);\n} else {\n  console.log('#   (not present, skipping)');\n}"
      ),
      [4],
      'must flag a skip log that ends an else block'
    );
    assert.deepEqual(
      findHandRolledSkips(
        "if (!ok) {\n  console.log('# skipped');\n\n  // why\n  return;\n}"
      ),
      [2],
      'must flag across blank lines and comments'
    );

    // ── Carrier B: spares ──
    assert.deepEqual(
      findHandRolledSkips(
        "assert.strictEqual(result.status, 'skipped');\nconsole.log('# Pipeline skipped when disabled');\n});"
      ),
      [],
      'must spare a PASS LABEL printed after a real assertion'
    );
    assert.deepEqual(
      findHandRolledSkips(
        "// prose about the zero-skipped gate must not be read as a declared skip\nreturn;"
      ),
      [],
      'must spare a comment mentioning skipping'
    );
    assert.deepEqual(
      findHandRolledSkips(
        "if (!exists) {\n  console.log('Skipping remaining tests');\n  return { passed: 0, failed: 1 };\n}"
      ),
      [],
      'must spare an abandonment that RECORDS A FAILURE (already visible to the gate)'
    );
    assert.deepEqual(
      findHandRolledSkips("if (a) {\n  console.log('# skipping');\n}"),
      [],
      'must spare a skip log ending a plain if block (no else fallthrough)'
    );

    // ── Carrier C ──
    assert.equal(
      hasUngatedContextSkip("t.skip('Ollama not available');"),
      true,
      'must flag an ungated runtime skip'
    );
    assert.equal(
      hasUngatedContextSkip(
        "if (process.env.CTOC_LIVE_OLLAMA === '1') {\n  test('smoke', (t) => { t.skip('no ollama'); });\n}"
      ),
      false,
      'must spare a t.skip inside a registration-gated file'
    );
    assert.equal(
      hasUngatedContextSkip('const x = 1;'),
      false,
      'must spare a file with no skip at all'
    );
    assert.equal(
      hasUngatedContextSkip('const fixture = "try { x } catch { t.skip(1); }";'),
      false,
      'must spare a t.skip inside a STRING fixture (skip-guard-integrity.test.js does this)'
    );
    assert.equal(
      hasUngatedContextSkip('// a comment describing t.skip( usage\nconst x = 1;'),
      false,
      'must spare a t.skip mentioned only in a comment'
    );
    assert.equal(
      hasUngatedContextSkip("/* block prose about t.skip( */\nt.skip('real');"),
      true,
      'must still flag a real call when a comment also mentions one'
    );
  });

  it('the fence ships with both exemption structures empty', () => {
    assert.equal(ALLOWLIST.length, 0, 'no permanent exemption may ship');
    assert.equal(KNOWN_DEBT.length, 0, 'no skip debt is carried forward');
  });
});
