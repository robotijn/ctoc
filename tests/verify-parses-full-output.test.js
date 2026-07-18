'use strict';

/**
 * VERIFY PARSES THE WHOLE TEST OUTPUT (V1).
 *
 * `evalCategory` truncated the captured test output to the first 4000 characters
 * and `applyTestQualityContracts` then parsed THAT string for the coverage
 * percentage, the fail count and the skipped count. A real test runner prints its
 * verdict LAST — this repository's own gate ends with
 *
 *   [CTOC test-gate] coverage 99.05% (threshold 99%), skipped 0, failed 0
 *
 * after several hundred kilobytes of test output — so on every real run the verdict
 * was cut off, the coverage parser found nothing, and VERIFY failed closed with
 * "coverage floor 99% declared but no coverage figure was produced". That made
 * Gate 3 un-passable for every plan, leaving "Approve anyway" as the only exit.
 *
 * Failing closed on an unreadable instrument is CORRECT and these tests do not
 * touch it. What they pin is that the instrument is handed its REAL input: the
 * parse happens on the complete output, and only the STORED copy is bounded.
 *
 * ZERO doubles: a real project on disk, a real npm subprocess, real captured output.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const verify = require('../src/lib/step-13-verify');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-verify-full-')); });
afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

function write(name, content) {
  const p = path.join(dir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

/**
 * Build a project whose test script prints `padChars` characters of noise and THEN
 * the summary block — the real shape of a test runner's output, where the verdict
 * comes last. Declares a coverage floor so the coverage contract is live.
 */
function projectWithTrailingVerdict({ padChars, coveragePct, floor, extraSummary = '' }) {
  write('package.json', JSON.stringify({
    name: 'trailing-verdict', version: '1.0.0',
    scripts: { test: 'node runner.js' }
  }, null, 2));
  write('.ctoc/coverage-baseline.json', JSON.stringify({ minPct: floor }, null, 2));
  // The padding is deliberately free of any counter- or coverage-shaped text, so
  // the ONLY readable instrument in the whole output sits after the cut.
  write('runner.js', [
    `const pad = 'test output line without any counters in it\\n'.repeat(${Math.ceil(padChars / 45)});`,
    'process.stdout.write(pad);',
    "process.stdout.write('# tests 12\\n');",
    "process.stdout.write('# pass 12\\n');",
    "process.stdout.write('# fail 0\\n');",
    "process.stdout.write('# skipped 0\\n');",
    `process.stdout.write('# all files | ${coveragePct} | 90 | 90 | 90\\n');`,
    extraSummary ? `process.stdout.write(${JSON.stringify(extraSummary + '\n')});` : ''
    // Deliberately NO process.exit(0). Calling it right after a large write to a
    // PIPE discards everything still buffered past the ~64KB pipe capacity — the
    // fixture would silently emit a truncated run and "prove" the bug for the wrong
    // reason. Letting the script end naturally exits 0 AND flushes in full.
  ].filter(Boolean).join('\n'));
}

describe('Step 14 VERIFY — the coverage figure is read from the COMPLETE output', () => {
  it('V1-1: a coverage verdict printed after 4000+ characters of output IS read', () => {
    projectWithTrailingVerdict({ padChars: 12000, coveragePct: '99.05', floor: 99 });

    const res = verify.runFallbackChecks(dir);
    const tests = res.checks.tests;

    assert.equal(tests.ran, true, 'the test script must actually have run');
    assert.equal(
      tests.coverage, 99.05,
      'the coverage figure sits past the 4000-character mark; truncating before parsing ' +
      `hides it. got coverage=${tests.coverage}`
    );
    assert.ok(
      !res.errors.some((e) => /no coverage figure was produced/i.test(e)),
      'coverage WAS produced — the run must not be refused as unmeasured; errors: ' +
      JSON.stringify(res.errors)
    );
    assert.equal(tests.passed, true, `the run is clean and above the floor; errors: ${JSON.stringify(res.errors)}`);
  });

  it('V1-2: a BELOW-floor coverage figure past the cut still FAILS — the fix must not open the gate', () => {
    projectWithTrailingVerdict({ padChars: 12000, coveragePct: '42.5', floor: 99 });

    const res = verify.runFallbackChecks(dir);

    assert.equal(res.checks.tests.coverage, 42.5, 'the real below-floor figure must be read, not missed');
    assert.ok(
      res.errors.some((e) => /below the project floor/i.test(e)),
      `below-floor coverage must fail; errors: ${JSON.stringify(res.errors)}`
    );
  });

  it('V1-3: failing tests reported past the cut are still caught', () => {
    write('package.json', JSON.stringify({
      name: 'late-failures', version: '1.0.0', scripts: { test: 'node runner.js' }
    }, null, 2));
    write('.ctoc/coverage-baseline.json', JSON.stringify({ minPct: 50 }, null, 2));
    write('runner.js', [
      "const pad = 'noise line carrying no counters at all\\n'.repeat(400);",
      'process.stdout.write(pad);',
      "process.stdout.write('# tests 12\\n# pass 9\\n# fail 3\\n# skipped 0\\n');",
      "process.stdout.write('# all files | 91.2 | 90 | 90 | 90\\n');"
      // Ends naturally, so it exits 0 DESPITE reporting 3 failures — the exit code
      // lies, which is exactly the case parseFailCount exists to catch.
    ].join('\n'));

    const res = verify.runFallbackChecks(dir);

    assert.ok(
      res.errors.some((e) => /3 failing test\(s\) reported despite exit 0/i.test(e)),
      `a fail counter past the cut must still be read; errors: ${JSON.stringify(res.errors)}`
    );
  });

  it('V1-4: skipped tests reported past the cut are still caught', () => {
    write('package.json', JSON.stringify({
      name: 'late-skips', version: '1.0.0', scripts: { test: 'node runner.js' }
    }, null, 2));
    write('.ctoc/coverage-baseline.json', JSON.stringify({ minPct: 50 }, null, 2));
    write('runner.js', [
      "const pad = 'noise line carrying no counters at all\\n'.repeat(400);",
      'process.stdout.write(pad);',
      "process.stdout.write('# tests 12\\n# pass 5\\n# fail 0\\n# skipped 7\\n');",
      "process.stdout.write('# all files | 91.2 | 90 | 90 | 90\\n');"
      // Ends naturally (exit 0) while reporting 7 skipped — the 0-skipped contract
      // must fire on the output, not on the exit code.
    ].join('\n'));

    const res = verify.runFallbackChecks(dir);

    assert.equal(res.checks.tests.skipped, 7, 'the skipped counter past the cut must be read');
    assert.ok(
      res.errors.some((e) => /7 skipped\/todo test\(s\)/i.test(e)),
      `the 0-skipped contract must fire; errors: ${JSON.stringify(res.errors)}`
    );
  });
});

describe('Step 14 VERIFY — a large run is captured, not lost to the capture buffer', () => {
  it('V1-8: a suite emitting more than 1MB is captured in full and its coverage read', () => {
    // execSync defaults to a 1MB maxBuffer and THROWS ENOBUFS beyond it. This
    // repository's own suite emits well over 1MB, so with the default the run was
    // reported as "Tests failed: spawnSync /bin/sh ENOBUFS" — a passing suite recorded
    // as a test failure, for a reason that has nothing to do with the tests.
    projectWithTrailingVerdict({ padChars: 1500000, coveragePct: '99.05', floor: 99 });

    const res = verify.runFallbackChecks(dir);

    assert.ok(
      !res.errors.some((e) => /ENOBUFS/i.test(e)),
      `a large but healthy suite must not be refused for exceeding the capture buffer; ` +
      `errors: ${JSON.stringify(res.errors)}`
    );
    assert.equal(res.checks.tests.coverage, 99.05, 'the verdict after 1.5MB of output must still be read');
    assert.equal(res.checks.tests.passed, true, `errors: ${JSON.stringify(res.errors)}`);
  });

  it('V1-9: when output DOES exceed the buffer, the failure names THAT — it does not claim the tests failed', () => {
    projectWithTrailingVerdict({ padChars: 200000, coveragePct: '99.05', floor: 99 });

    // Drive the real overflow path with a deliberately tiny capture budget.
    const r = verify.tryCommand('npm test', dir, { maxBuffer: 1024 });

    assert.equal(r.success, false, 'an unreadable capture is not a pass');
    assert.match(
      String(r.error), /output exceeded the capture buffer/i,
      'the operator must be told the OUTPUT was too large to capture, not that their ' +
      `tests failed. got: ${r.error}`
    );
    assert.equal(r.spawnFailed, false, 'a buffer overflow is not a launch failure — the command ran');
  });
});

describe('Step 14 VERIFY — the STORED output stays bounded', () => {
  it('V1-5: the stored output is bounded even though the parse saw everything', () => {
    projectWithTrailingVerdict({ padChars: 200000, coveragePct: '99.05', floor: 99 });

    const res = verify.runFallbackChecks(dir);
    const stored = res.checks.tests.output;

    assert.equal(res.checks.tests.coverage, 99.05, 'the parse must still have seen the whole output');
    assert.ok(
      stored.length <= 4200,
      `the persisted evidence must stay bounded; stored ${stored.length} characters`
    );
  });

  it('V1-6: the bounded output KEEPS the verdict a human needs to read', () => {
    projectWithTrailingVerdict({ padChars: 200000, coveragePct: '99.05', floor: 99 });

    const stored = verify.runFallbackChecks(dir).checks.tests.output;

    assert.ok(
      /all files \| 99\.05/.test(stored),
      'a human reading the evidence artifact must be able to see the verdict that decided ' +
      'the gate, not only the first 4000 characters of noise'
    );
    assert.ok(
      /elided/i.test(stored),
      'the artifact must state that output was dropped rather than silently misrepresent the run'
    );
  });

  it('V1-7: an output already under the budget is stored verbatim, with no elision marker', () => {
    projectWithTrailingVerdict({ padChars: 200, coveragePct: '99.05', floor: 99 });

    const stored = verify.runFallbackChecks(dir).checks.tests.output;

    assert.ok(!/elided/i.test(stored), 'a short output must not be marked as elided');
    assert.ok(/all files \| 99\.05/.test(stored), 'a short output keeps its verdict');
  });
});
