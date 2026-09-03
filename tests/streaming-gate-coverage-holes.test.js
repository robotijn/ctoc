'use strict';

/**
 * streaming-gate.js — the dark ranges, closed by behaviour.
 *
 * This module renders the gate decisions a human reads and performs the
 * gate-safe crossing. Every arm covered here must fail toward the PLAIN
 * APPROVE SCREEN — never toward a crash, and never toward a plan crossing a
 * moment by itself on the strength of a check that could not run. A
 * sufficiency predicate that could not run is IGNORANCE, not sufficiency.
 *
 * Measured before this file (npm test, node line coverage scoped to src/**,
 * 2026-08-31): src/lib/streaming-gate.js 98.71 %, uncovered
 *   381-382 · 471-476 · 496-498 · 628-629 · 823 · 1297-1298 · 1610-1611 ·
 *   1632-1633 · 1658-1659.
 *
 * CLASSIFICATION — every range above is REACHABLE and is driven here. None is
 * permission-gated, terminal-only, or dead:
 *
 *   381-382    nextUnansweredQuestion's catch — the question store could not be
 *              consulted. Driven by breaking the streaming-precompute load.
 *              Case: "a broken question store falls back to the plain Approve screen".
 *   471-476    sufficiencyFor's `closed(reason)` builder (enough:false,
 *              computed:null, empty lists). Never invoked by any test before this
 *              file; reached here through its fault path (496-498), because
 *              sufficiencyFor is NOT exported and its only live caller,
 *              pendingGateDecisions, always passes a validated root — so the
 *              guard arm at line 478 cannot be reached from outside without
 *              faking the function under test.
 *   496-498    sufficiencyFor's catch — the predicate module would not load.
 *              Case: "a predicate that could not run never crosses a plan".
 *   628-629    crossBySufficiency's outer catch — fail-soft false.
 *              Case: "a fault while crossing leaves the plan and the ledger untouched".
 *   823        tokenBreakPoint's fallback for a token with no separator to break at.
 *              Case: "an unbreakable token wraps inside its column".
 *   1297-1298  sufficiencyLine's YES branch. Reached at the review moment, whose
 *              destination is NOT a pre-build destination, so a sufficient plan
 *              there is displayed rather than crossed.
 *              Case: "enough information at the last moment is SHOWN, never crossed".
 *   1610-1611  streamAnswer's incomplete-answer guard.
 *              Case: "an all-control-character question id is refused and recorded nowhere".
 *   1632-1633  streamAnswer's revision-stamp failure.
 *              Case: "an unstampable answer is kept, and the human is told why".
 *   1658-1659  streamAnswer's write failure.
 *              Case: "an answer that could not be written says so, and is not silently lost".
 *
 * WHERE FAULTS ARE INJECTED. Only at true boundaries: the module loader
 * (Module._load for one resolved filename, restored in a `finally`) and
 * `safe-fs` (t.mock.method, guarded so no unrelated read or write is touched).
 * No function under test is mocked or stubbed.
 *
 * FIXTURES live under os.tmpdir() and are removed in afterEach. Nothing in this
 * file reads or writes the CTOC repository, and no crossing function is ever
 * pointed at it — a real crossing on real plans is exactly what must not happen.
 *
 * RED PROVENANCE. The arms above were already correct, so no case could be red
 * against the shipped source. Each was instead shown red against ONE in-memory
 * mutation of src/lib/streaming-gate.js (compile-time replacement, the pristine
 * source sha256-verified before each run, nothing written to the repository), and
 * a case counts as killing its mutant only where THAT NAMED case failed:
 *   381-382    the store-fault arm fabricates a question instead of returning null
 *   471-476/496-498  the predicate-fault arm returns enough:true (auto-crossing on a read error)
 *   628-629    the crossing-fault arm returns true
 *   823        the no-separator fallback returns the whole token (the matrix overflows)
 *   1297-1298  the YES branch fires on enough === false
 *   1610-1611  the incomplete-answer guard becomes `!qid && !key`
 *   1632-1633  the stamp-failure reason is dropped
 *   1658-1659  a failed write reports "Recorded your answer"
 * All eight mutants died. One case was genuinely red against the shipped source on
 * its first run — the control-character assertion, which flagged the screen's own
 * newlines; that was a defect in the assertion, corrected to exclude \n, and it is
 * recorded rather than quietly rewritten.
 *
 * WHAT CANNOT BE ASSERTED HERE, and why it is not faked. The plan asks every closed
 * verdict to assert `computed === null` (ignorance) rather than `0` (counted none).
 * That field is not observable through any live surface: `sufficiencyFor` is not
 * exported, its caller publishes only enough/reason/id-lists, and a closed verdict
 * never reaches `composeSufficiencyEvidence` because a crossing requires
 * `enough === true`. Reaching it would mean calling a function nothing calls. The
 * distinction the requirement protects — `unknown` versus the explicit
 * "no questions were computed" phrase — is asserted at the composer itself by
 * tests/sufficiency-evidence.test.js, so it is covered where it is observable.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const streamingGate = require('../src/lib/streaming-gate.js');
const precompute = require('../src/lib/streaming-precompute.js');
const safeFs = require('../src/lib/safe-fs.js');

const PRECOMPUTE_PATH = require.resolve('../src/lib/streaming-precompute.js');

const STAGES = ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
const sandboxes = [];
let counter = 0;

function makeSandbox() {
  const root = path.join(os.tmpdir(), 'ctoc-sgate-holes-' + process.pid + '-' + Date.now() + '-' + counter++);
  for (const stage of STAGES) fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
  sandboxes.push(root);
  return root;
}

function writePlan(root, stage, slug, body) {
  const p = path.join(root, 'plans', stage, slug + '.md');
  fs.writeFileSync(p, body);
  return p;
}

/** A functional plan that PASSES validateFunctionalToImpl. */
function validFunctionalBody(slug) {
  return `---\ntitle: ${slug} title\n---\n\n# ${slug} title\n\n` +
    `## Problem Statement\nThe thing is broken.\n\n## Acceptance Criteria\n- [ ] the thing works\n\n## Scope\nThe module.\n`;
}

function mtimeOf(p) {
  return fs.statSync(p).mtimeMs;
}

/** One blocking fork — a plan carrying this does NOT have enough information. */
function forkQuestion(id) {
  return {
    id,
    prompt: 'Which database engine?',
    critical: true,
    important: false,
    options: [
      { key: 'pg', label: 'Postgres', recommended: true, pros: 'Row-level security.' },
      { key: 'sqlite', label: 'SQLite', cons: 'No concurrency.' },
    ],
  };
}

/**
 * Run `fn` with the streaming-precompute module made UNLOADABLE at the loader
 * boundary. Restored in `finally`, always.
 */
function withBrokenPrecompute(fn) {
  const origLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    let resolved = null;
    try { resolved = Module._resolveFilename(request, parent, isMain); } catch { /* not resolvable */ }
    if (resolved === PRECOMPUTE_PATH) throw new Error('SIMULATED streaming-precompute load failure');
    return origLoad.apply(this, arguments);
  };
  try {
    return fn();
  } finally {
    Module._load = origLoad;
  }
}

// Control characters that must never reach a terminal, EXCLUDING the structural
// newline the screen text is built from (`\n` is itself \x0a, so a naive
// [\x00-\x1f] check flags every multi-line screen and proves nothing).
const CONTROL_CHARS = /[\x00-\x09\x0b-\x1f\x7f-\x9f]/;

afterEach(() => {
  while (sandboxes.length) fs.rmSync(sandboxes.pop(), { recursive: true, force: true });
});

describe('streaming-gate — a check that could not run never crosses a plan', () => {
  it('381-382: a broken question store falls back to the plain Approve screen, never a crash', () => {
    const root = makeSandbox();
    const p = writePlan(root, 'functional', 'broken-store', validFunctionalBody('broken-store'));
    // A REAL unanswered fork is on disk: with a working store this screen asks it.
    precompute.writePlanQuestions(root, 'functional/broken-store.md', [forkQuestion('db')], mtimeOf(p));

    // Sanity, unpatched: the rich question screen is what the human would get.
    const healthy = streamingGate.streamingGateScreen(root);
    assert.match(healthy.ask.questions[0].question, /Which database engine\?/);

    // The store cannot be consulted at all.
    const screen = withBrokenPrecompute(() => streamingGate.streamingGateScreen(root));

    // The human still gets a usable screen — the plain Approve one.
    assert.equal(screen.actions['stream approve functional/broken-store.md'] === undefined, true,
      'actions are keyed by label, not by command');
    assert.equal(Object.values(screen.actions).includes('stream approve functional/broken-store.md'), true,
      'the plain Approve action must still be offered when the question store is unreadable');
    // And it does NOT pretend the question was answered or that none exists.
    assert.match(screen.text, /Enough information: NO — the check could not run\./);
    assert.doesNotMatch(screen.text, /Which database engine\?/);
    // The plan-decision screen reaches nextUnansweredQuestion with NO wrapping
    // try/catch, so it is where a fault that escaped this arm would surface as a
    // crash. It must render the plain gate question instead.
    const planScreen = withBrokenPrecompute(
      () => streamingGate.planDecisionScreen('functional/broken-store.md', root),
    );
    assert.equal(Object.values(planScreen.actions).includes('stream approve functional/broken-store.md'), true);
    assert.doesNotMatch(planScreen.text, /Which database engine\?/);

    // The plan did not move and nothing was recorded.
    assert.equal(fs.existsSync(p), true);
    assert.equal(fs.existsSync(path.join(root, '.ctoc', 'approvals')), false);
  });

  it('471-476 + 496-498: a sufficiency predicate that could not run reports enough:false/unavailable and crosses NOTHING', () => {
    const root = makeSandbox();
    const p = writePlan(root, 'functional', 'would-cross', validFunctionalBody('would-cross'));
    // An EMPTY question set is the honest "nothing to ask" — this plan HAS enough
    // information and, with a working predicate, crosses by itself.
    precompute.writePlanQuestions(root, 'functional/would-cross.md', [], mtimeOf(p));

    const faulted = withBrokenPrecompute(() => streamingGate.pendingGateDecisions(root));

    const d = faulted.find((x) => x.slug === 'would-cross');
    assert.ok(d, 'a plan whose predicate faulted must still be listed for the human');
    assert.equal(d.enough, false);
    assert.equal(d.sufficiencyReason, 'unavailable');
    assert.deepEqual(d.unansweredQuestionIds, []);
    assert.deepEqual(d.blockingQuestionIds, []);
    // The load-bearing half: NOTHING crossed. No ledger entry, no move.
    assert.equal(fs.existsSync(p), true, 'the plan must still be at its own stage');
    assert.equal(fs.existsSync(path.join(root, 'plans', 'implementation', 'would-cross.md')), false);
    assert.equal(fs.existsSync(path.join(root, '.ctoc', 'approvals')), false);

    // Proof the FAULT — not the fixture — is what withheld the crossing: with the
    // predicate restored, this very plan crosses by sufficiency.
    const healthy = streamingGate.pendingGateDecisions(root);
    assert.equal(healthy.some((x) => x.slug === 'would-cross'), false,
      'with a working predicate the same plan crosses and leaves the pending list');
    assert.equal(fs.existsSync(path.join(root, 'plans', 'implementation', 'would-cross.md')), true);
  });

  it('628-629: a fault while crossing returns false and leaves the plan and the ledger untouched', (t) => {
    const root = makeSandbox();
    // The sentinel lives in the PLAN FILENAME, so exactly one read is faulted and
    // every other read in the process is untouched. The ledger path derived from it
    // is lower-cased, so the ledger read is not caught by this guard.
    const slug = 'CTOC-FAULT-SENTINEL-cross';
    const p = writePlan(root, 'functional', slug, validFunctionalBody(slug));

    const realRead = safeFs.readFileSync;
    t.mock.method(safeFs, 'readFileSync', (target, opts) => {
      if (String(target).includes('CTOC-FAULT-SENTINEL')) throw new Error('injected read failure');
      return realRead(target, opts);
    });

    const verdict = {
      enough: true, reason: 'enough',
      unansweredQuestionIds: [], blockingQuestionIds: [],
      computed: 0, answeredQuestionIds: [], unboundAnswers: 0,
    };
    const crossed = streamingGate.crossBySufficiency(
      root, p, `functional/${slug}.md`, 'functional', 'implementation', verdict,
    );

    assert.equal(crossed, false, 'a crossing that could not read the plan must report failure');
    assert.equal(fs.existsSync(p), true, 'the plan must not move when the crossing failed');
    assert.equal(fs.existsSync(path.join(root, 'plans', 'implementation', `${slug}.md`)), false);
    assert.equal(fs.existsSync(path.join(root, '.ctoc', 'approvals')), false,
      'no ledger entry may survive a failed crossing');
  });

  it('1297-1298: enough information at the LAST moment is shown to the human, never crossed automatically', () => {
    const root = makeSandbox();
    const p = writePlan(root, 'review', 'done-ready', `---\ntitle: done-ready title\n---\n\n# done-ready title\n\nBody.\n`);
    // Ready and empty: the critique ran and found nothing to ask.
    precompute.writePlanQuestions(root, 'review/done-ready.md', [], mtimeOf(p));

    const decisions = streamingGate.pendingGateDecisions(root);
    const d = decisions.find((x) => x.slug === 'done-ready');
    assert.ok(d, 'the last moment is never crossed by sufficiency, so the plan stays pending');
    assert.equal(d.enough, true);

    const screen = streamingGate.streamingGateScreen(root);
    assert.match(screen.text, /Enough information: YES — every decision this plan needs has been answered\./);
    // Shown, not acted on: the plan is still where it was, with no ledger entry.
    assert.equal(fs.existsSync(p), true);
    assert.equal(fs.existsSync(path.join(root, 'plans', 'done', 'done-ready.md')), false);
    assert.equal(fs.existsSync(path.join(root, '.ctoc', 'approvals')), false);
  });
});

describe('streaming-gate — the decision matrix never overflows and never drops a character', () => {
  it('823: a token with no separator to break at wraps at the column width, losing nothing', () => {
    const root = makeSandbox();
    const p = writePlan(root, 'functional', 'wide-token', validFunctionalBody('wide-token'));
    // 210 characters, no `/ \ - _ . : , ;` anywhere: tokenBreakPoint finds no
    // separator in the column window and must fall back to the column width.
    const TOKEN = 'XQ7'.repeat(70);
    precompute.writePlanQuestions(root, 'functional/wide-token.md', [{
      id: 'wide',
      prompt: 'Which engine?',
      critical: true,
      important: false,
      options: [
        { key: 'a', label: 'Alpha', recommended: true, pros: 'A short readable reason.' },
        { key: 'b', label: 'Beta', pros: TOKEN },
      ],
    }], mtimeOf(p));

    const screen = streamingGate.streamingGateScreen(root);
    const matrixLines = screen.text.split('\n').filter((l) => l.startsWith('│'));
    assert.ok(matrixLines.length > 0, 'the matrix must render');

    // Nothing overflows the ceiling — a matrix that wraps in the terminal is worse
    // than no matrix, so this is the hard constraint the fallback exists to keep.
    for (const line of matrixLines) {
      assert.ok([...line].length <= 108, `matrix line exceeds the width ceiling: ${[...line].length}`);
    }

    // Nothing is dropped: the Pros column (cell index 2 between the │ separators),
    // concatenated down the rows, reproduces the token exactly.
    const pros = matrixLines
      .map((l) => l.split('│')[2])
      .filter((c) => c !== undefined)
      .map((c) => c.trim())
      .join('');
    assert.ok(pros.includes(TOKEN), 'the unbreakable token must survive wrapping intact');
  });
});

describe('streaming-gate — recording an answer is honest about what it could and could not do', () => {
  it('1610-1611: an id made only of control characters is refused, and no answer is recorded', () => {
    const root = makeSandbox();
    const p = writePlan(root, 'functional', 'ctl', validFunctionalBody('ctl'));
    precompute.writePlanQuestions(root, 'functional/ctl.md', [forkQuestion('db')], mtimeOf(p));

    // Producer-authored, therefore untrusted: an id that is nothing but control
    // characters and a terminal escape introducer.
    const screen = streamingGate.streamAnswer('functional/ctl.md', '\x1b\x07\x00\x9b', 'pg', root);

    assert.match(screen.text, /Ignored an incomplete answer for ctl\.md\./);
    assert.equal(CONTROL_CHARS.test(screen.text), false,
      'no control character from an untrusted id may reach the human-facing text');
    assert.equal(fs.existsSync(path.join(root, '.ctoc', 'streaming', 'answers.jsonl')), false,
      'an answer with no usable question id must be recorded nowhere');
    // The fork is still open, so the plan has not crossed.
    assert.equal(fs.existsSync(p), true);
    assert.equal(fs.existsSync(path.join(root, 'plans', 'implementation', 'ctl.md')), false);
  });

  it('1632-1633: an answer that cannot be tied to a revision is KEPT unstamped and the human is told why', () => {
    const root = makeSandbox();
    const p = writePlan(root, 'functional', 'nostamp', validFunctionalBody('nostamp'));
    precompute.writePlanQuestions(root, 'functional/nostamp.md', [forkQuestion('db')], mtimeOf(p));

    const screen = withBrokenPrecompute(
      () => streamingGate.streamAnswer('functional/nostamp.md', 'db', 'pg', root),
    );

    // The answer is NOT lost.
    const logPath = path.join(root, '.ctoc', 'streaming', 'answers.jsonl');
    assert.equal(fs.existsSync(logPath), true);
    const record = JSON.parse(fs.readFileSync(logPath, 'utf8').trim());
    assert.equal(record.questionId, 'db');
    assert.equal(record.optionKey, 'pg');
    assert.equal('planMtimeMs' in record, false,
      'a revision that could not be established must never be fabricated into the record');

    // And the human is told, with the reason, that it may be asked again.
    assert.match(screen.text, /could not be tied to a plan revision/);
    assert.match(screen.text, /SIMULATED streaming-precompute load failure/);
    assert.match(screen.text, /may be asked again/);
  });

  it('1658-1659: an answer that could not be written says so, and is not reported as recorded', (t) => {
    const root = makeSandbox();
    const p = writePlan(root, 'functional', 'nowrite', validFunctionalBody('nowrite'));
    precompute.writePlanQuestions(root, 'functional/nowrite.md', [forkQuestion('db')], mtimeOf(p));

    const realAppend = safeFs.appendFileSync;
    t.mock.method(safeFs, 'appendFileSync', (target, data, opts) => {
      // Guarded to the one write under test; every other append is untouched.
      if (String(target).endsWith('answers.jsonl')) throw new Error('injected append failure');
      return realAppend(target, data, opts);
    });

    const screen = streamingGate.streamAnswer('functional/nowrite.md', 'db', 'pg', root);

    assert.match(screen.text, /Could not record the answer for nowrite\.md: injected append failure/);
    assert.doesNotMatch(screen.text, /Recorded your answer/);
    assert.equal(fs.existsSync(path.join(root, '.ctoc', 'streaming', 'answers.jsonl')), false);
    // The unanswered fork therefore still blocks: the plan has not crossed.
    assert.equal(fs.existsSync(p), true);
    assert.equal(fs.existsSync(path.join(root, 'plans', 'implementation', 'nowrite.md')), false);
  });
});
