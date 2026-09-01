'use strict';

/**
 * The build queue's fault arms — `src/lib/continuation-queue.js`.
 *
 * This module decides whether building CONTINUES and WHICH approved plan is built
 * next. Its catch arms are deliberately asymmetric, and the asymmetry is the whole
 * safety property:
 *
 *   - A QUEUE fault WITHHOLDS AUTHORISATION. If the enumerator cannot load its
 *     dependencies, cannot locate the plans directory, or cannot classify one plan,
 *     the answer is an empty queue or a skipped plan — never a plan waved through.
 *     A mutant that let a fault fall through would authorise unapproved work.
 *   - A QUESTIONS fault does NOT INVENT A FORK. If the questions store cannot be
 *     read, that is not evidence of an unanswered human decision, so the queue keeps
 *     building. A mutant that fabricated a fork from a read error would strand the
 *     human with a stopped engine and no question to answer.
 *   - A NAMING fault is NOT A VERDICT. If the plan cannot be read or parsed, it is
 *     named from its slug and the decision is unchanged. A mutant that let a naming
 *     fault escape would take the whole decision down with it.
 *
 * Those three directions must stay opposite. Each is pinned below by name.
 *
 * RANGES COVERED (the nine dark ranges of the 2026-08-31 measurement):
 *   137-138  enumerator: dependency load fault      -> empty queue
 *   143-144  enumerator: getPlansDir fault          -> empty queue
 *   161-168  enumerator: per-plan classify fault    -> skip that plan
 *   213-214  naming: plan file unreadable           -> name from the slug
 *   218-219  naming: metadata parse fault           -> empty title, naming continues
 *   222-223  naming: outer fault                    -> the raw slug
 *   248-249  fork check: questions-store fault      -> null, keep building
 *   484-485  build order: getPlansDir fault         -> nothing buildable
 *   496-499  build order: plan unreadable mid-run   -> skip it, build the rest
 *   553-554  banner: enumerator fault               -> show nothing, never throw
 *
 * RANGES LEFT UNCOVERED: none. One classification is worth stating: 553-554 is the
 * banner's outer catch, and the enumerator below it is itself fault-isolated, so the
 * only way it can throw is a CONTRACT VIOLATION by `state.getPlansDir` (returning a
 * non-string, which makes `path.join` throw outside the enumerator's own try). That
 * is what the case injects — defence in depth for a session-start path that must
 * never crash a session, not a contrived line-toucher.
 *
 * FAULT INJECTION IS AT TRUE BOUNDARIES ONLY — the module loader (`Module._load`,
 * restored in a `finally`), the `state` / `approval-residency` / `streaming-gate` /
 * `streaming-precompute` module objects via `t.mock.method`, and the real filesystem
 * (a plan file genuinely deleted mid-flow, which is the documented race). No function
 * under test is stubbed. Fixtures live under `os.tmpdir()`; nothing in the repository
 * is read or written, and no approval is minted outside the fixture's own ledger.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const q = require('../src/lib/continuation-queue');
const ledger = require('../src/lib/approval-ledger');
const stateLib = require('../src/lib/state');
const residency = require('../src/lib/approval-residency');
const streamingGate = require('../src/lib/streaming-gate');
const precompute = require('../src/lib/streaming-precompute');

const STATE_PATH = require.resolve('../src/lib/state');
const GATE_PATH = require.resolve('../src/lib/streaming-gate');
const PRECOMPUTE_PATH = require.resolve('../src/lib/streaming-precompute');

// A control character, built from its code point so this file contains none literally.
const BELL = String.fromCharCode(7);
const ANY_CONTROL_CHAR = /\p{Cc}/u;

// ── fixtures ────────────────────────────────────────────────────────────────

function mkProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-cqh-'));
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  for (const s of ['todo', 'in-progress', 'review', 'done']) {
    fs.mkdirSync(path.join(dir, 'plans', s), { recursive: true });
  }
  return dir;
}

const cleanup = (dir) => fs.rmSync(dir, { recursive: true, force: true });

/**
 * Write a plan and mint a REAL Gate-2 ledger entry for it, so the enumerator's
 * approval predicate says yes for the real reason.
 * @param {string} root
 * @param {string} slug
 * @param {{heading?: string|null, title?: string, stage?: string}} [opts]
 * @returns {string} the plan path
 */
function makeApprovedPlan(root, slug, opts = {}) {
  const { heading = `Heading for ${slug}`, title = `Title for ${slug}`, stage = 'todo' } = opts;
  const body = heading === null ? '' : `\n# ${heading}\n`;
  const content = `---
title: "${title}"
type: implementation
files:
  - "src/lib/${slug}.js"
---
${body}
The specification the human ruled on for ${slug}.
`;
  const p = path.join(root, 'plans', stage, `${slug}.md`);
  fs.writeFileSync(p, content);
  ledger.writeEntry(
    ledger.slugFromPlanPath(p),
    { content, stage_from: 'implementation', stage_to: 'todo', approved_by: 'human' },
    root,
  );
  return p;
}

/** Patch the module loader so requiring ONE resolved file throws. Returns a restore fn. */
function failLoadOf(resolvedPath, when = () => true) {
  const orig = Module._load;
  Module._load = function patched(request, parent, isMain) {
    let resolved = null;
    try { resolved = Module._resolveFilename(request, parent, isMain); } catch { /* not ours */ }
    if (resolved === resolvedPath && when()) throw new Error('SIMULATED module load failure');
    return orig.apply(this, arguments);
  };
  return () => { Module._load = orig; };
}

/**
 * Run `after` at the moment the fork check completes INSIDE one `shouldContinueQueue`
 * call. The build order is computed before the fork check and the plan is named after
 * it, so this is what isolates a NAMING fault from an ENUMERATION fault.
 */
function afterForkCheck(t, after) {
  const real = precompute.hasEnoughInformation;
  t.mock.method(precompute, 'hasEnoughInformation', (...args) => {
    const out = real.apply(precompute, args);
    after();
    return out;
  });
}

/**
 * Replace the human-naming call with an observable marker, so "the naming step ran
 * with an empty title" is distinguishable from "the fault escaped to the outer catch".
 * Both otherwise return the slug, and a dropped inner catch would hide in that.
 */
function markNaming(t) {
  t.mock.method(streamingGate, 'humanPlanName', (title, slug) => `named(${title}|${slug})`);
}

// ── the enumerator withholds authorisation ──────────────────────────────────

test('approvedFreeQueue: a dependency LOAD fault yields an EMPTY queue — nothing is authorised', () => {
  const dir = mkProject();
  makeApprovedPlan(dir, 'alpha');
  const restore = failLoadOf(STATE_PATH);
  try {
    const out = q.approvedFreeQueue(dir);
    assert.deepEqual(out, { refs: [], depth: 0 }, 'a load fault must authorise nothing');
  } finally {
    restore();
    cleanup(dir);
  }
});

test('approvedFreeQueue: a getPlansDir fault yields an EMPTY queue — nothing is authorised', (t) => {
  const dir = mkProject();
  try {
    makeApprovedPlan(dir, 'alpha');
    assert.equal(q.approvedFreeQueue(dir).depth, 1, 'control: the plan is enumerable');
    t.mock.method(stateLib, 'getPlansDir', () => { throw new Error('SIMULATED plans-dir fault'); });
    const out = q.approvedFreeQueue(dir);
    assert.deepEqual(out, { refs: [], depth: 0 }, 'a plans-dir fault must authorise nothing');
  } finally {
    cleanup(dir);
  }
});

test('approvedFreeQueue: a per-plan classify fault SKIPS that plan and keeps the rest', (t) => {
  const dir = mkProject();
  try {
    makeApprovedPlan(dir, 'alpha');
    const bravoPath = makeApprovedPlan(dir, 'bravo');
    const real = residency.isApprovedForCoverage;
    t.mock.method(residency, 'isApprovedForCoverage', (planPath, stage, root, content) => {
      if (planPath === bravoPath) throw new Error('SIMULATED classify fault');
      return real.call(residency, planPath, stage, root, content);
    });
    const { refs, depth } = q.approvedFreeQueue(dir);
    assert.deepEqual(refs, ['todo/alpha.md'], 'the unclassifiable plan is never authorised work');
    assert.equal(depth, 1);
  } finally {
    cleanup(dir);
  }
});

// ── naming is never a verdict ───────────────────────────────────────────────

test('shouldContinueQueue: a plan that VANISHES after the fork check is named from its slug', (t) => {
  const dir = mkProject();
  try {
    const planPath = makeApprovedPlan(dir, 'alpha');
    markNaming(t);
    afterForkCheck(t, () => fs.rmSync(planPath)); // the documented race: enumerated, then gone
    const out = q.shouldContinueQueue(dir);
    assert.equal(out.continue, true, 'a missing plan file is not a reason to stop building');
    assert.equal(out.nextName, 'named(|alpha)',
      'the read fault must yield an EMPTY title and still reach the naming step');
  } finally {
    cleanup(dir);
  }
});

test('shouldContinueQueue: a metadata PARSE fault leaves an empty title and naming still runs', (t) => {
  const dir = mkProject();
  try {
    makeApprovedPlan(dir, 'alpha', { heading: null, title: 'Alpha the plan' });
    markNaming(t);
    let armed = false;
    afterForkCheck(t, () => { armed = true; });
    const realParse = stateLib.parseMetadata;
    t.mock.method(stateLib, 'parseMetadata', (content) => {
      if (armed) throw new Error('SIMULATED metadata parse fault');
      return realParse.call(stateLib, content);
    });
    const out = q.shouldContinueQueue(dir);
    assert.equal(out.continue, true);
    assert.equal(out.nextName, 'named(|alpha)',
      'the parse fault must be absorbed INSIDE naming, not escape to the outer catch');
  } finally {
    cleanup(dir);
  }
});

test('shouldContinueQueue: a naming-module LOAD fault returns the raw slug and never throws', (t) => {
  const dir = mkProject();
  let armed = false;
  const restore = failLoadOf(GATE_PATH, () => armed);
  try {
    makeApprovedPlan(dir, 'alpha');
    afterForkCheck(t, () => { armed = true; });
    let out;
    assert.doesNotThrow(() => { out = q.shouldContinueQueue(dir); });
    assert.equal(out.continue, true, 'a naming fault must not change the decision');
    assert.equal(out.nextName, 'alpha', 'the outer naming catch returns the slug');
  } finally {
    restore();
    cleanup(dir);
  }
});

test('a control character in a plan heading never reaches the name a human reads', () => {
  const dir = mkProject();
  try {
    makeApprovedPlan(dir, 'alpha', { heading: `Alpha${BELL}Beta` });
    const out = q.shouldContinueQueue(dir);
    assert.equal(out.continue, true);
    assert.ok(!ANY_CONTROL_CHAR.test(String(out.nextName)),
      `a control character survived into the human name: ${JSON.stringify(out.nextName)}`);
    assert.ok(String(out.nextName).includes('Alpha'));
  } finally {
    cleanup(dir);
  }
});

// ── a questions fault is not a fork ─────────────────────────────────────────

test('shouldContinueQueue: a questions-store fault does NOT invent a fork — the queue keeps building', (t) => {
  const dir = mkProject();
  let armed = false;
  const restore = failLoadOf(PRECOMPUTE_PATH, () => armed);
  try {
    makeApprovedPlan(dir, 'alpha');
    // Arm once the plan has been classified, so the load fault lands on the fork check
    // and not on the enumeration that precedes it.
    const real = residency.isApprovedForCoverage;
    t.mock.method(residency, 'isApprovedForCoverage', (planPath, stage, root, content) => {
      const verdict = real.call(residency, planPath, stage, root, content);
      armed = true;
      return verdict;
    });
    const out = q.shouldContinueQueue(dir);
    assert.equal(out.continue, true, 'a read error is not a fork — building continues');
    assert.notEqual(out.fork, true, 'no fork may be fabricated from a questions-store fault');
    assert.equal(q.readQueueState(dir), null, 'no fork may be persisted from a read error');
  } finally {
    restore();
    cleanup(dir);
  }
});

// ── the build order authorises nothing on a fault ───────────────────────────

test('nextBuildable: a getPlansDir fault after enumeration authorises NOTHING', (t) => {
  const dir = mkProject();
  try {
    makeApprovedPlan(dir, 'alpha');
    assert.deepEqual(q.nextBuildable(dir).buildable, ['todo/alpha.md'], 'control: it builds');
    let armed = false;
    const realClassify = residency.isApprovedForCoverage;
    t.mock.method(residency, 'isApprovedForCoverage', (planPath, stage, root, content) => {
      const verdict = realClassify.call(residency, planPath, stage, root, content);
      armed = true;
      return verdict;
    });
    const realDir = stateLib.getPlansDir;
    t.mock.method(stateLib, 'getPlansDir', (root) => {
      if (armed) throw new Error('SIMULATED plans-dir fault');
      return realDir.call(stateLib, root);
    });
    const out = q.nextBuildable(dir);
    assert.deepEqual(out, { buildable: [], blocked: [], inversions: [], missingDeps: [] },
      'a fault in the build order must authorise nothing');
  } finally {
    cleanup(dir);
  }
});

test('nextBuildable: a plan unreadable AFTER enumeration is SKIPPED, and the rest still build', (t) => {
  const dir = mkProject();
  try {
    makeApprovedPlan(dir, 'alpha');
    const bravoPath = makeApprovedPlan(dir, 'bravo');
    const real = residency.isApprovedForCoverage;
    t.mock.method(residency, 'isApprovedForCoverage', (planPath, stage, root, content) => {
      const verdict = real.call(residency, planPath, stage, root, content);
      if (planPath === bravoPath) fs.rmSync(bravoPath); // enumerated, then gone
      return verdict;
    });
    const out = q.nextBuildable(dir);
    assert.deepEqual(out.buildable, ['todo/alpha.md'],
      'the vanished plan is skipped; the healthy one still builds');
    assert.deepEqual(out.blocked, []);
  } finally {
    cleanup(dir);
  }
});

// ── the banner never crashes a session ──────────────────────────────────────

test('approvedQueueBannerLine: an enumerator fault shows NOTHING rather than throwing', (t) => {
  const dir = mkProject();
  try {
    makeApprovedPlan(dir, 'alpha');
    assert.match(q.approvedQueueBannerLine(dir), /1 plan\(s\) ready to build/, 'control: it shows');
    // A getPlansDir contract violation (a non-string) makes path.join throw OUTSIDE the
    // enumerator's own try — the one way the banner's outer catch is reached.
    t.mock.method(stateLib, 'getPlansDir', () => 42);
    let line;
    assert.doesNotThrow(() => { line = q.approvedQueueBannerLine(dir); },
      'the session-start banner must never throw');
    assert.equal(line, '', 'a fault shows nothing, never a fabricated count');
  } finally {
    cleanup(dir);
  }
});
