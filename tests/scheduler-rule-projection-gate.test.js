/**
 * The scheduler rule-projection GATE — a mutation-based ratchet so a scheduler rule
 * added without a defender fails immediately (Iron Loop Step 8, plan
 * 00125-the-sync-barrier-is-undefended-where-work-actually-starts).
 *
 * WHAT THIS MECHANISES, AND WHAT IT DOES NOT — read this before "fixing" a failure.
 *
 *  • ENUMERATION (mechanised, cheap, unconditional). The gate extracts from
 *    src/lib/task-registry.js every DECISION-shaped reason literal — matching only
 *    `{ run: true|false, reason: '<literal>' }` — and asserts that set equals the declared
 *    reason set, and that every reason except `ok` has a defender in the mutation table.
 *    A future rule that returns a NEW reason fails the gate immediately (G1), demanding a
 *    declaration; a declared reason with no table entry fails (G2), demanding a defender.
 *    The concurrent-edit belt's `staleness-orphan-quarantine` (human ruling 2026-07-26,
 *    added AFTER this plan was authored) is the first live proof the enumeration works:
 *    the extractor picked it up and it had to be answered with a named defender.
 *
 *  • EXECUTION (mechanised, costly). For each table entry the declared source mutation is
 *    applied to a COPY of the module outside the working tree and the scheduler test files
 *    are run against it IN PLACE (real test files; only the module is redirected). The entry
 *    passes only when its NAMED case goes red — not merely "something went red". Requiring a
 *    named case is what excludes the confound that produced this whole family of defects: a
 *    rule looking defended because a DIFFERENT rule's test caught the candidate.
 *
 *  • CONVENTION, NOT MECHANISM (stated plainly, because the human ruled a rule that cannot
 *    be checked is a wish):
 *      - A new rule that REUSES an existing reason string is invisible to the enumeration.
 *      - Whether a declared mutation faithfully disables its rule is a human judgement.
 *      - Per-clause completeness is not enforced; one mutation per reason is the floor.
 *      - `staleness-orphan-quarantine` is defended on the ORACLE path (`canRun`), NOT the
 *        projection: the belt lives only in canRun by design (`nextRunnable` deliberately
 *        does not enforce it — BELT-5 — and its projection-side reporter is
 *        task-reconcile.applyQuarantine). So its named red cases are `canRun` cases
 *        (BELT-1 / BELT-1b in tests/task-registry.test.js), not `nextRunnable` cases. Do
 *        NOT "fix" that entry by chasing a non-existent promotion-path case. The gate's real
 *        mechanism — mutate the source, require a named suite case to go red — proves the
 *        rule defended regardless of WHICH entry point exercises it.
 *
 *  • WHY NOT REASON COVERAGE (the cheap option, rejected on evidence). Instrumenting
 *    evaluateConcurrency to record which reason it returned on a nextRunnable call, then
 *    asserting every reason was observed, FAILS on this exact defect: ST-SYNC-4 in
 *    tests/task-registry.test.js calls nextRunnable on a registry where a queued sync is
 *    refused with 'sync-barrier', so reason coverage would report Rule 2 as covered on the
 *    promotion path — while Rule 2 was undefended, because deleting it lets Rule 3 refuse
 *    the same candidate and the asserted set never changes. Coverage of any kind is blind to
 *    masking; masking is the failure mode here.
 *
 * Runs inside `npm test` UNCONDITIONALLY (not behind an environment flag — a gate behind a
 * flag silently stops being true). It spawns child `node --test` runs; the recursion fence
 * is double: this gate file is never in the child file list, AND the child receives
 * CTOC_SCHEDULER_MUTATION_CHILD=1 and this file exits before defining any test when it sees it.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// ── recursion fence (suspenders — the belt is the file list below) ───────────────
if (process.env.CTOC_SCHEDULER_MUTATION_CHILD === '1') {
  // A mutated child must never re-enter the gate. Exit before registering any test.
  module.exports = {};
  return;
}

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'src', 'lib', 'task-registry.js');
const TARGET_DIR = path.dirname(TARGET);
const RECONCILE = path.join(ROOT, 'src', 'lib', 'task-reconcile.js');
const DECLARED_FILE_1 = path.join(ROOT, 'tests', 'scheduler-guarantees-under-mutation.test.js');
const DECLARED_FILE_2 = __filename;

/** The scheduler-touching test files run against the mutated module. Explicit — never a
 *  glob — and NEVER includes this gate file (recursion fence). Every named red case in the
 *  mutation table lives in one of these. */
const SCHEDULER_TEST_FILES = [
  'tests/task-registry.test.js',
  'tests/task-registry-coverage.test.js',
  'tests/scheduler-guarantees-under-mutation.test.js',
  'tests/scheduler-enforced.test.js',
  'tests/actions-scheduler.test.js',
  'tests/task-reconcile.test.js',
  'tests/task-reconcile-coverage.test.js',
  'tests/task-reconcile-quarantine-fault.test.js',
  'tests/promote-quarantine-parity.test.js',
  'tests/r3b-consolidation-rework.test.js',
  'tests/w10-live-agent-reconcile.test.js'
].map(f => path.join(ROOT, f));

/** The reasons the scheduler is allowed to return, decision-shaped `{ run, reason }` only.
 *  `ok` is the non-rule terminal (declared, so its absence from the table is a decision). */
const DECLARED_REASONS = Object.freeze([
  'max-concurrent', 'sync-barrier', 'git-exclusive', 'file-conflict',
  'blocked-dep', 'staleness-orphan-quarantine', 'ok'
]);

/**
 * The mutation table — one entry per non-`ok` reason (several permitted per reason). Each
 * `find`/`replace` is an EXACT source substring that must occur exactly once (G3). Each entry
 * passes only when EVERY id in `expectRedCases` appears among the mutated run's failures (G5).
 * `staleness-orphan-quarantine` is the one ORACLE-side entry — its named cases are canRun
 * cases (see the header). Do not "fix" it toward a nextRunnable case.
 */
const MUTATION_TABLE = Object.freeze([
  {
    reason: 'sync-barrier',
    name: 'delete Rule 2 (sync-barrier) body at task-registry.js:930-932',
    find: "  if (running.length > 0 && (candidate.kind === 'sync' || running.some(t => t.kind === 'sync'))) {\n    return { run: false, reason: 'sync-barrier' };\n  }",
    replace: '',
    expectRedCases: ['D1:', 'D2:', 'D3 (headline):']
  },
  {
    reason: 'git-exclusive',
    name: 'delete Rule 3 (git-exclusive) body at task-registry.js:936-939',
    find: "  if ((candidate.gitOp && running.some(t => isEditing(t) || t.gitOp)) ||\n      (isEditing(candidate) && running.some(t => t.gitOp))) {\n    return { run: false, reason: 'git-exclusive' };\n  }",
    replace: '',
    expectRedCases: ['C1:', 'C2:', 'C3:', 'C5:']
  },
  {
    reason: 'max-concurrent',
    name: 'disable Rule 1 (max-concurrent): running.length >= MAX_CONCURRENT → false at :925',
    find: 'running.length >= MAX_CONCURRENT',
    replace: 'false',
    expectRedCases: ['ST-06:']
  },
  {
    reason: 'file-conflict',
    name: 'disable Rule 4 (file-conflict): touchesOverlap(candTouches, occupied) → false at :949',
    find: 'touchesOverlap(candTouches, occupied)',
    replace: 'false',
    expectRedCases: ['ST-07b:', 'ST-08:']
  },
  {
    reason: 'blocked-dep',
    name: "delete nextRunnable's dependency gate at :1005",
    find: '    if (!depsSatisfied(cand, registry)) continue; // deps vs REAL statuses (done-only)',
    replace: '',
    expectRedCases: ['B7 (control):', 'B8 (control):']
  },
  {
    reason: 'staleness-orphan-quarantine',
    name: 'delete the concurrent-edit belt in canRun at :982-984 (ORACLE-side by design)',
    find: "  if (overlapsStaleOrphanReservation(candidate, registry)) {\n    return { run: false, reason: 'staleness-orphan-quarantine' };\n  }",
    replace: '',
    expectRedCases: ['BELT-1:', 'BELT-1b:']
  }
]);

// ── extractor ────────────────────────────────────────────────────────────────────

/** Every decision-shaped reason literal in the scheduler source. Matches ONLY
 *  `{ run: true|false, reason: '<literal>' }`, excluding the `dep-missing`/`dep-failed`/
 *  `dep-cycle` and `already-queued` sites (no `run:` field). FAILS LOUD on zero matches —
 *  a scanner whose no-match result equals success is the false-green signature this repo fences. */
function extractDecisionReasons(sourceText) {
  const re = /\{\s*run:\s*(?:true|false)\s*,\s*reason:\s*'([a-z-]+)'\s*\}/g;
  const found = new Set();
  let m;
  while ((m = re.exec(sourceText)) !== null) found.add(m[1]);
  return found;
}

// ── harness ────────────────────────────────────────────────────────────────────

/** mtimeMs of the tracked files that must never change, as an object keyed by path. */
function trackedMtimes() {
  const out = {};
  for (const p of [TARGET, RECONCILE, DECLARED_FILE_1, DECLARED_FILE_2]) {
    out[p] = fs.statSync(p).mtimeMs;
  }
  return out;
}

/** Rewrite every relative require in the module copy to an absolute path against the real
 *  module dir, embedded with JSON.stringify so a Windows backslash cannot break the literal. */
function rewriteRequires(src) {
  return src.replace(/require\((['"])(\.\.?\/[^'"]+)\1\)/g, (_m, _q, rel) =>
    `require(${JSON.stringify(path.resolve(TARGET_DIR, rel))})`);
}

/** Parse a TAP counter; returns null (NEVER 0) when unreadable, exactly as test-gate.js. */
function tapCount(out, label) {
  const m = new RegExp('^# ' + label + ' (\\d+)', 'm').exec(out);
  return m ? Number(m[1]) : null;
}

/**
 * Run the scheduler suite against a mutated copy of task-registry.js (or unmutated when
 * `mutation` is null — the no-op control). Returns parsed counters and the failing case
 * names. Asserts the tracked source is byte-for-byte untouched around the run.
 * @param {{find:string, replace:string}|null} mutation
 */
function runScheduler(mutation) {
  const before = trackedMtimes();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-sched-mut-'));
  try {
    let src = fs.readFileSync(TARGET, 'utf8');
    if (mutation) {
      const occurrences = src.split(mutation.find).length - 1;
      assert.equal(occurrences, 1,
        `mutation "${mutation.name}": find must occur exactly once, found ${occurrences}`);
      src = src.replace(mutation.find, mutation.replace);
    }
    const copy = path.join(dir, 'task-registry.js');
    fs.writeFileSync(copy, rewriteRequires(src));
    const loader = path.join(dir, 'loader.js');
    fs.writeFileSync(loader, [
      "const M = require('module');",
      `const REAL = ${JSON.stringify(TARGET)};`,
      `const COPY = ${JSON.stringify(copy)};`,
      'const orig = M._resolveFilename;',
      // Exact-path allow-list of ONE entry — never a prefix or pattern.
      'M._resolveFilename = function (rq, p, m, op) {',
      '  const r = orig.call(this, rq, p, m, op);',
      '  return r === REAL ? COPY : r;',
      '};'
    ].join('\n'));

    // Strip NODE_TEST_CONTEXT: when this gate runs under `node --test`, that variable is set
    // to "child-v8" and, inherited by the child, makes the child's OWN test runner report to a
    // non-existent parent instead of running normally — the child would exit ~25ms doing nothing.
    const childEnv = { ...process.env, CTOC_SCHEDULER_MUTATION_CHILD: '1' };
    delete childEnv.NODE_TEST_CONTEXT;
    const res = spawnSync(process.execPath,
      ['--require', loader, '--test', '--test-reporter=tap', ...SCHEDULER_TEST_FILES],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, env: childEnv });
    if (res.error) throw res.error;
    const out = (res.stdout || '') + (res.stderr || '');
    // Counters parsed from the COMPLETE output, never a truncation; null (never 0) on unreadable.
    const pass = tapCount(out, 'pass');
    const fail = tapCount(out, 'fail');
    const skipped = tapCount(out, 'skipped');
    const failedNames = [...out.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map(x => x[1].trim());
    return { status: res.status, pass, fail, skipped, failedNames };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    // Tracked source must be untouched by every run — evidence by mtime, not attestation.
    const after = trackedMtimes();
    for (const p of Object.keys(before)) {
      assert.equal(after[p], before[p], `tracked file modified during a mutated run: ${p}`);
    }
  }
}

// ── the gate ────────────────────────────────────────────────────────────────────

describe('scheduler rule-projection gate', () => {
  const sourceText = fs.readFileSync(TARGET, 'utf8');

  it('G1: the extractor finds exactly the declared decision reasons (seven)', () => {
    const found = extractDecisionReasons(sourceText);
    assert.ok(found.size > 0,
      'extractor found ZERO decision reasons — a no-match that reads as success is false-green');
    assert.deepEqual([...found].sort(), [...DECLARED_REASONS].sort(),
      'the scheduler returns a reason not declared here (or omits a declared one). A NEW rule ' +
      'must be added to DECLARED_REASONS and given a mutation-table defender before it ships.');
  });

  it('G2: every declared reason except `ok` has at least one mutation-table defender', () => {
    for (const reason of DECLARED_REASONS) {
      if (reason === 'ok') continue;
      const entries = MUTATION_TABLE.filter(e => e.reason === reason);
      assert.ok(entries.length >= 1,
        `reason '${reason}' has NO defender in the mutation table — a rule that cannot be ` +
        'mutated-and-caught is undefended. Add an entry whose named case goes red when the rule ' +
        'is deleted.');
    }
    const declared = new Set(DECLARED_REASONS);
    for (const e of MUTATION_TABLE) {
      assert.ok(declared.has(e.reason),
        `mutation-table entry targets undeclared reason '${e.reason}'`);
    }
  });

  it('G3: every mutation applies at exactly one source site', () => {
    for (const e of MUTATION_TABLE) {
      const occurrences = sourceText.split(e.find).length - 1;
      assert.equal(occurrences, 1,
        `mutation "${e.name}": find must occur exactly once in the source, found ${occurrences}. ` +
        'A mutation that applies nowhere would report "no red" and be misread as an undefended rule.');
    }
  });

  it('G4: the no-op control is perfectly green — otherwise the harness is invalid', () => {
    const control = runScheduler(null);
    assert.equal(control.status, 0,
      'the harness is invalid: the no-op control (zero mutations) did not exit 0, so no mutated ' +
      'result from it may be interpreted. Rebuild the harness; do not read its output.');
    assert.equal(control.fail, 0,
      `the harness is invalid: the no-op control reported ${control.fail} failures with zero ` +
      'mutations applied. Every red it produces is uninterpretable.');
    assert.equal(control.skipped, 0, 'the harness is invalid: the no-op control skipped tests');
  });

  it('G5: every declared mutation is caught by its named case', () => {
    for (const e of MUTATION_TABLE) {
      const run = runScheduler({ find: e.find, replace: e.replace });
      assert.notEqual(run.status, 0,
        `mutation "${e.name}" produced NO failure — the rule '${e.reason}' is UNDEFENDED on the ` +
        'path the suite exercises. Add a named case that goes red when this rule is deleted.');
      for (const id of e.expectRedCases) {
        assert.ok(run.failedNames.some(n => n.includes(id)),
          `mutation "${e.name}": expected case "${id}" to go red, but it did not. The defender ` +
          `named for reason '${e.reason}' does not actually catch this mutation.`);
      }
    }
  });

  it('G6: the tracked scheduler source is never modified by the gate', () => {
    const before = trackedMtimes();
    runScheduler(null);
    runScheduler({ find: MUTATION_TABLE[0].find, replace: MUTATION_TABLE[0].replace });
    const after = trackedMtimes();
    assert.deepEqual(after, before,
      'a gate run modified a tracked file — mutations must go to a copy outside the working tree');
  });
});
