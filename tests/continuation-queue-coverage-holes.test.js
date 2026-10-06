'use strict';

/**
 * The build queue's fault arms — `src/lib/continuation-queue.js`.
 *
 * This module reports WHICH approved plans wait and in what order. It never decides
 * whether a session may stop: the derived approved-queue regime that did — and with
 * it the fork check and the plan naming that sat on its decision — is removed (plan
 * "CTOC does no unasked work at session start or stop"), and its cases went with it.
 *
 * Every remaining catch arm WITHHOLDS AUTHORISATION. If the enumerator cannot load
 * its dependencies, cannot locate the plans directory, or cannot classify one plan,
 * the answer is an empty queue or a skipped plan — never a plan waved through. A
 * mutant that let a fault fall through would count unapproved work.
 *
 * ARMS COVERED:
 *   enumerator: dependency load fault      -> empty queue
 *   enumerator: getPlansDir fault          -> empty queue
 *   enumerator: per-plan classify fault    -> skip that plan
 *   build order: getPlansDir fault         -> nothing buildable
 *   build order: plan unreadable mid-run   -> skip it, build the rest
 *   banner: enumerator fault               -> show nothing, never throw
 *
 * The banner's outer catch can only be reached by a CONTRACT VIOLATION of
 * `state.getPlansDir` (returning a non-string, which makes `path.join` throw outside
 * the enumerator's own try). That is what the case injects — defence in depth for a
 * session-start path that must never crash a session, not a contrived line-toucher.
 *
 * FAULT INJECTION IS AT TRUE BOUNDARIES ONLY — the module loader (`Module._load`,
 * restored in a `finally`), the `state` / `approval-residency` module objects via
 * `t.mock.method`, and the real filesystem (a plan file genuinely deleted mid-flow,
 * which is the documented race). No function under test is stubbed. Fixtures live
 * under `os.tmpdir()`; nothing in the repository is read or written, and no approval
 * is minted outside the fixture's own ledger.
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

const STATE_PATH = require.resolve('../src/lib/state');

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
