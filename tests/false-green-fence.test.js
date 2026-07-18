'use strict';

/**
 * THE FALSE-GREEN FENCE — a ratcheting gate against checks that report a verdict
 * on input they never actually received.
 *
 * In the human's words: "a check that reports failure or success based on input it
 * never actually received." That single defect class has shipped FIVE times in this
 * repository, each time through a green suite and a passed review:
 *
 *   1. `test-gate.js` `parseFail` returned the SUCCESS value 0 when it matched
 *      nothing; ANSI under FORCE_COLOR broke the anchor → `fail 0` over 8 real
 *      failures.
 *   2. `step-13-verify.js` sliced output to 4000 chars and parsed the TRUNCATED copy
 *      for a verdict the runner prints LAST → every plan recorded as failed.
 *   3. `test-gate.js` called `process.exit` after ~1.4MB of piped writes; piped
 *      writes are asynchronous and unflushed output is discarded → the consumer got
 *      output cut mid-line. INVISIBLE interactively, because terminal writes are
 *      synchronous — only a pipe reveals it.
 *   4. `execSync`'s default 1MB maxBuffer overflowed and threw → a PASSING suite
 *      recorded as "Tests failed".
 *   5. Historic siblings returning 0 on a parse failure → pass over real failures.
 *
 * THE RATCHET. Detection of this class cannot be precise — the empty-catch signature
 * alone matches over a hundred existing sites. So precision sits in the ratchet, not
 * the detector: every pre-existing site is DEBT in `.ctoc/false-green-baseline.json`
 * and a NEW one fails this test, forcing a human to look at it.
 *
 * TWO STRUCTURES, DELIBERATELY SEPARATE:
 *   - `findings` — DEBT. No per-entry justification (demanding 135 justifications
 *     would mean the fence never lands). May only ever SHRINK.
 *   - `whitelist` — a PERMANENT exemption for a construct that is genuinely correct.
 *     Starts EMPTY; every entry needs a written justification. Conflating the two is
 *     what kills fences.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASELINE_FILE = path.join(ROOT, '.ctoc', 'false-green-baseline.json');

/**
 * Lazily reach the scanner, so a missing or broken module fails EACH test by name
 * rather than exploding at file load with one opaque error.
 * @returns {function(string, object=): {findings: object[], filesScanned: number, bySignature: Record<string, number>}}
 */
function scanner() {
  const mod = require('../src/lib/false-green-scan');
  return mod.scanFalseGreen;
}

/** Scan a single in-memory source through the real entry point. */
function scanSource(source, file = 'src/lib/planted.js') {
  return scanner()(ROOT, { sources: [{ path: file, source }] });
}

/** The signatures present in a scan of one planted source. */
function signaturesIn(source) {
  return scanSource(source).findings.map((f) => f.signature);
}

// ── The five planted pairs. Each `bad` MUST be flagged; each `good` MUST NOT be. ──
const PAIRS = [
  {
    signature: 'parse-default',
    bad: [
      'function parseCount(text) {',
      '  const m = text.match(/count (\\d+)/);',
      '  if (!m) return 0;',
      '  return Number(m[1]);',
      '}',
    ].join('\n'),
    good: [
      'function parseCount(text) {',
      '  const m = text.match(/count (\\d+)/);',
      '  if (!m) return null;',
      '  return Number(m[1]);',
      '}',
    ].join('\n'),
  },
  {
    signature: 'truncate-then-parse',
    bad: [
      'function verify(output) {',
      '  const head = output.slice(0, 4000);',
      '  const m = head.match(/PASS/);',
      '  return Boolean(m);',
      '}',
    ].join('\n'),
    good: [
      'function verify(output) {',
      '  const m = output.match(/PASS/);',
      '  const stored = output.slice(0, 4000);',
      '  return { ok: Boolean(m), stored };',
      '}',
    ].join('\n'),
  },
  {
    signature: 'exit-with-pending-writes',
    bad: [
      'function main() {',
      "  process.stdout.write('the whole report');",
      '  process.exit(1);',
      '}',
    ].join('\n'),
    good: [
      'function main() {',
      "  process.stdout.write('the whole report');",
      '  return requestExit(1);',
      '}',
    ].join('\n'),
  },
  {
    signature: 'unbounded-capture',
    bad: [
      'function run() {',
      "  return execSync('npm test', { encoding: 'utf8' });",
      '}',
    ].join('\n'),
    good: [
      'function run() {',
      "  return execSync('npm test', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });",
      '}',
    ].join('\n'),
  },
  {
    signature: 'silent-catch',
    bad: [
      'function load() {',
      '  try {',
      '    return read();',
      '  } catch { }',
      '}',
    ].join('\n'),
    good: [
      'function load() {',
      '  try {',
      '    return read();',
      '  } catch (err) {',
      '    report(err);',
      '  }',
      '}',
    ].join('\n'),
  },
];

const ALL_SIGNATURES = PAIRS.map((p) => p.signature);

describe('false-green fence — checks that report a verdict on input they never received', () => {
  // ── 1 · NON-VACUOUS ────────────────────────────────────────────────────────
  // The fence refusing to commit its own defect class: if the walk sees zero files,
  // every assertion below is trivially green and the gate is blind.
  it('the scan itself is non-vacuous: it really read the source tree', () => {
    const result = scanner()(ROOT);
    assert.ok(
      result.filesScanned > 100,
      `expected a real src tree, saw ${result.filesScanned} files scanned — ` +
      'a scan that reads nothing reports "no findings", which IS the defect this fence exists to catch'
    );
    for (const sig of ALL_SIGNATURES) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(result.bySignature, sig),
        `bySignature must always report every signature, missing: ${sig}`
      );
    }
  });

  // ── 2 · SELF-TEST PER SIGNATURE ────────────────────────────────────────────
  for (const pair of PAIRS) {
    it(`detects ${pair.signature}, and does NOT flag its fixed form`, () => {
      assert.ok(
        signaturesIn(pair.bad).includes(pair.signature),
        `the planted ${pair.signature} violation was NOT flagged — the detector is blind:\n${pair.bad}`
      );
      assert.ok(
        !signaturesIn(pair.good).includes(pair.signature),
        `the FIXED form was flagged as ${pair.signature} — a false positive, which is how a fence gets disabled:\n${pair.good}`
      );
    });
  }

  it('every finding prescribes a fix, names its file and line, and bounds its evidence', () => {
    for (const pair of PAIRS) {
      const finding = scanSource(pair.bad).findings.find((f) => f.signature === pair.signature);
      assert.ok(finding, `no ${pair.signature} finding to inspect`);
      assert.equal(finding.file, 'src/lib/planted.js');
      assert.ok(finding.line >= 1, 'a finding must name a 1-based line for the human');
      assert.ok(finding.fix && finding.fix.length > 20, 'a fence that only says "violation" teaches nothing');
      assert.ok(finding.evidence.length <= 160, 'evidence must be bounded to 160 chars');
      assert.ok(finding.key.includes(pair.signature), 'the key must carry its signature');
    }
  });

  // ── 3 · REGRESSION PINS ON THE FIXED EXEMPLARS ─────────────────────────────
  // A refactor that reintroduces any of the five shipped defects fails HERE, by name.
  it('regression pin: test-gate.js has no parse-default and no exit-with-pending-writes', () => {
    const result = scanner()(ROOT);
    const offenders = result.findings.filter(
      (f) => f.file === 'src/scripts/test-gate.js' &&
        (f.signature === 'parse-default' || f.signature === 'exit-with-pending-writes')
    );
    assert.deepEqual(
      offenders.map((f) => `${f.signature} at line ${f.line}`), [],
      'test-gate.js regressed. Its parsers must return null (never 0) on no-match, and it must ' +
      'use requestExit(code) rather than process.exit — that is defects 1 and 3 coming back.'
    );
  });

  it('regression pin: step-13-verify.js has no truncate-then-parse', () => {
    const result = scanner()(ROOT);
    const offenders = result.findings.filter(
      (f) => f.file === 'src/lib/step-13-verify.js' && f.signature === 'truncate-then-parse'
    );
    assert.deepEqual(
      offenders.map((f) => `line ${f.line}`), [],
      'step-13-verify.js regressed: it is parsing a TRUNCATED copy of the run output again. ' +
      'Parse the FULL output first; bound only what is STORED (boundOutput) — that is defect 2.'
    );
  });

  // ── 4 · NO NEW FINDING ─────────────────────────────────────────────────────
  it('NO NEW FALSE-GREEN SITE: every finding is already baselined or whitelisted', () => {
    const result = scanner()(ROOT);
    const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
    const known = new Set(baseline.findings);
    const whitelisted = new Set(Object.keys(baseline.whitelist || {}));

    const fresh = result.findings.filter((f) => !known.has(f.key) && !whitelisted.has(f.key));
    assert.deepEqual(
      fresh.map((f) => f.key), [],
      'NEW false-green site(s) — a check reporting a verdict on input it never received:\n' +
      fresh.map((f) => `  ${f.file}:${f.line}  in ${f.key.split(':').slice(2).join(':')}  [${f.signature}]\n` +
                       `    ${f.evidence}\n    FIX: ${f.fix}`).join('\n') +
      '\n\nFix it, or — only if the construct is genuinely correct — add its key to the ' +
      'whitelist in .ctoc/false-green-baseline.json with a written justification. ' +
      'Never add it to `findings`: that list is pre-existing debt and may only SHRINK.'
    );
  });

  // ── 5 · THE RATCHET ONLY TIGHTENS ──────────────────────────────────────────
  it('THE RATCHET ONLY TIGHTENS: the finding count never exceeds the baseline', () => {
    const result = scanner()(ROOT);
    const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
    assert.ok(
      result.findings.length <= baseline.maxFindings,
      `false-green findings rose to ${result.findings.length}, baseline is ${baseline.maxFindings}. ` +
      'The baseline may only ever be LOWERED. Never raise it to make this pass.'
    );
  });

  // ── 6 · LOWER THE BASELINE ─────────────────────────────────────────────────
  it('LOWER THE BASELINE when you pay debt down (fails loudly on unclaimed progress)', () => {
    const result = scanner()(ROOT);
    const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
    assert.equal(
      result.findings.length, baseline.maxFindings,
      `Live false-green count is ${result.findings.length} but the baseline says ${baseline.maxFindings}. ` +
      `You fixed sites — now LOWER maxFindings to ${result.findings.length} and remove the fixed keys ` +
      'from the findings list.'
    );
  });

  // ── 7 · BASELINE HONESTY ───────────────────────────────────────────────────
  it('the baseline is honest: no phantom entry for a file that no longer exists', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
    const phantoms = baseline.findings.filter((key) => {
      const file = String(key).split(':')[0];
      return !fs.existsSync(path.join(ROOT, file));
    });
    assert.deepEqual(
      phantoms, [],
      `Baseline names files that no longer exist: ${phantoms.join(', ')} — remove them.`
    );
  });

  // ── 8 · WHITELIST HONESTY ──────────────────────────────────────────────────
  it('the whitelist is minimal: every entry is currently flagged and carries a justification', () => {
    const result = scanner()(ROOT);
    const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
    const live = new Set(result.findings.map((f) => f.key));
    for (const [key, reason] of Object.entries(baseline.whitelist || {})) {
      assert.ok(
        live.has(key),
        `whitelist entry ${key} is not currently flagged — it is dead weight that could mask a ` +
        'real finding under the same key. Remove it.'
      );
      assert.ok(
        typeof reason === 'string' && reason.length > 20,
        `whitelist entry ${key} must carry a written justification — a permanent exemption is a ` +
        'reviewable act, unlike the debt list.'
      );
    }
  });

  // ── 9 · KEY STABILITY ──────────────────────────────────────────────────────
  // The assertion that stops the baseline churning into false failures on any
  // unrelated edit above a site. A line-numbered key gets the fence disabled in a week.
  it('keys are stable under unrelated edits above the site (no line numbers in keys)', () => {
    for (const pair of PAIRS) {
      const before = scanSource(pair.bad).findings.map((f) => f.key);
      const after = scanSource(`// an unrelated comment added above\n\n${pair.bad}`).findings.map((f) => f.key);
      assert.deepEqual(
        after, before,
        `${pair.signature} keys churned when a line was inserted above the site. ` +
        'Keys must anchor on the enclosing function name, never on a line number.'
      );
      for (const key of before) {
        assert.ok(!/:\d+$/.test(key), `key ${key} ends in a line number — it will churn`);
      }
    }
  });

  // ── 10 · ERROR PATH ────────────────────────────────────────────────────────
  // The scanner must not commit its own defect class: a bad input must never
  // produce an empty finding list, because empty IS the success value.
  it('a bad root throws rather than returning an empty (success-looking) result', () => {
    assert.throws(
      () => scanner()(''),
      TypeError,
      'scanFalseGreen("") must throw — returning {findings: []} would report "all clear" ' +
      'for input it never received, which is precisely the defect class this module exists to catch'
    );
  });

  // ── Security pin: line-scoped patterns, no catastrophic backtracking ───────
  it('scans a 10,000-line synthetic file without catastrophic backtracking', () => {
    const hostile = Array.from(
      { length: 10000 },
      (_, i) => `  const v${i} = ${'a'.repeat(60)}${i} + ' ' + "${'b'.repeat(40)}";`
    ).join('\n');
    const started = Date.now();
    const result = scanSource(`function big() {\n${hostile}\n}\n`);
    const elapsed = Date.now() - started;
    assert.ok(Array.isArray(result.findings));
    assert.ok(elapsed < 10000, `scanning 10,000 lines took ${elapsed}ms — a pattern is backtracking`);
  });
});
