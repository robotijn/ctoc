'use strict';

/**
 * Loop-B tick (slice 2) — `loopBDirective(root)` composes three EXISTING functions
 * into ONE human-readable line describing the state of CTOC's build loop:
 *   (a) what just auto-crossed on sufficiency  (pendingGateDecisions' sanctioned side effect)
 *   (b) which plans still need their questions generated  (plansNeedingQuestions)
 *   (c) the next plan to build  (nextBuildable)
 * and '' when all three are empty.
 *
 * Real temp-dir state + real Gate-2 ledger entries (mirrors tests/continuation-queue.test.js).
 * NOTHING mocked except, in the two isolation tests, the ONE composed function whose
 * behaviour we are deliberately provoking (a throw, and its documented cross side effect).
 *
 * LANGUAGE RULE pinned here: no gate number, no raw stage name reaches the returned
 * string (src/lib/gate-words.js phrasing only; plan named by human title).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const driver = require('../src/lib/loop-b-driver');
const ledger = require('../src/lib/approval-ledger');
const streamingGate = require('../src/lib/streaming-gate');
const streamingPrecompute = require('../src/lib/streaming-precompute');
const continuationQueue = require('../src/lib/continuation-queue');

// ── fixtures ──────────────────────────────────────────────────────────────────

const STAGES = ['vision', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];

function mkProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-loopb-'));
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  for (const s of STAGES) fs.mkdirSync(path.join(dir, 'plans', s), { recursive: true });
  return dir;
}

/**
 * Write a plan and (optionally) mint a REAL Gate-2 ledger entry.
 * `heading` controls whether the human title lives in a `# Heading` (default) or only
 * in frontmatter (heading:false) — exercising both title-resolution paths.
 */
function makePlan(root, stage, slug, { title, approve = false, dependsOn = 'none', heading = true } = {}) {
  const human = title || slug;
  const front = [
    '---',
    `title: "${human}"`,
    'type: implementation',
    `depends_on: ${dependsOn}`,
    'files:',
    `  - "src/lib/${slug}.js"`,
    '---',
    '',
  ].join('\n');
  const body = heading ? `# ${human}\n\nThe specification the human ruled on.\n` : 'The specification the human ruled on.\n';
  const content = front + body;
  const p = path.join(root, 'plans', stage, `${slug}.md`);
  fs.writeFileSync(p, content);
  if (approve) {
    ledger.writeEntry(
      ledger.slugFromPlanPath(p),
      { content, stage_from: 'implementation', stage_to: 'todo', approved_by: 'human' },
      root,
    );
  }
  return p;
}

const cleanup = (dir) => fs.rmSync(dir, { recursive: true, force: true });

// Stage vocabulary that must NEVER reach a human-facing string.
const STAGE_WORDS = ['review', 'todo', 'done', 'functional', 'implementation', 'in-progress', 'canvas', 'vision'];
const GATE_NUMBER = /\bgates?[\s_-]*[0-3]\b/i;

function assertPlainLanguage(str) {
  assert.ok(!GATE_NUMBER.test(str), `directive leaked a gate number: ${JSON.stringify(str)}`);
  for (const w of STAGE_WORDS) {
    assert.ok(!new RegExp(`\\b${w}\\b`, 'i').test(str), `directive leaked stage word "${w}": ${JSON.stringify(str)}`);
  }
}

// ── (a) all three sources empty -> '' ───────────────────────────────────────────

test('empty project: nothing crossed, nothing to ask, nothing to build -> returns ""', () => {
  const dir = mkProject();
  try {
    assert.strictEqual(driver.loopBDirective(dir), '');
  } finally { cleanup(dir); }
});

test('a falsy/invalid root never throws and returns ""', () => {
  assert.strictEqual(driver.loopBDirective(''), '');
  assert.strictEqual(driver.loopBDirective(null), '');
  assert.strictEqual(driver.loopBDirective(undefined), '');
});

// ── (b) a buildable plan present -> named by its HUMAN title, not its slug ───────

test('a buildable approved plan is named in the directive by its human title', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'todo', '00042-weekly-summary', { title: 'Send the weekly summary', approve: true });
    const out = driver.loopBDirective(dir);
    assert.ok(out.includes('Send the weekly summary'), `expected human title, got: ${JSON.stringify(out)}`);
    assert.ok(!out.includes('00042'), `must not name the plan by its number: ${JSON.stringify(out)}`);
    assertPlainLanguage(out);
  } finally { cleanup(dir); }
});

test('a buildable plan whose title is ONLY in frontmatter is still named by that title', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'todo', '00043-nightly-digest', { title: 'Nightly digest email', approve: true, heading: false });
    const out = driver.loopBDirective(dir);
    assert.ok(out.includes('Nightly digest email'), `expected frontmatter title, got: ${JSON.stringify(out)}`);
    assertPlainLanguage(out);
  } finally { cleanup(dir); }
});

// ── (c) plans needing questions -> named in the directive ───────────────────────

test('a pre-build plan with no precomputed questions is named as still needing questions', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'implementation', '00050-search-across-plans', { title: 'Search across the plans' });
    const out = driver.loopBDirective(dir);
    assert.ok(out.includes('Search across the plans'), `expected the plan needing questions, got: ${JSON.stringify(out)}`);
    assertPlainLanguage(out);
  } finally { cleanup(dir); }
});

// ── (d) language rule holds for a populated multi-source directive ───────────────

test('a directive covering all sources contains no gate number and no raw stage word', () => {
  const dir = mkProject();
  try {
    makePlan(dir, 'todo', '00060-export-report', { title: 'Export the monthly report', approve: true });
    makePlan(dir, 'implementation', '00061-inline-help', { title: 'Inline help panel' });
    const out = driver.loopBDirective(dir);
    assert.ok(out.length > 0, 'expected a non-empty directive');
    assert.ok(out.includes('Export the monthly report'));
    assert.ok(out.includes('Inline help panel'));
    assertPlainLanguage(out);
  } finally { cleanup(dir); }
});

// ── (e) fault isolation: a source throwing degrades to a PARTIAL directive ───────

test('when pendingGateDecisions throws, the directive still names the next buildable plan', () => {
  const dir = mkProject();
  const orig = streamingGate.pendingGateDecisions;
  try {
    makePlan(dir, 'todo', '00070-audit-trail', { title: 'Audit trail view', approve: true });
    streamingGate.pendingGateDecisions = () => { throw new Error('boom'); };
    let out;
    assert.doesNotThrow(() => { out = driver.loopBDirective(dir); });
    assert.ok(out.includes('Audit trail view'), `expected partial directive naming the build, got: ${JSON.stringify(out)}`);
    assertPlainLanguage(out);
  } finally {
    streamingGate.pendingGateDecisions = orig;
    cleanup(dir);
  }
});

test('when plansNeedingQuestions throws, the directive still names the next buildable plan', () => {
  const dir = mkProject();
  const orig = streamingPrecompute.plansNeedingQuestions;
  try {
    makePlan(dir, 'todo', '00071-usage-graph', { title: 'Usage graph', approve: true });
    streamingPrecompute.plansNeedingQuestions = () => { throw new Error('boom'); };
    let out;
    assert.doesNotThrow(() => { out = driver.loopBDirective(dir); });
    assert.ok(out.includes('Usage graph'), `expected partial directive, got: ${JSON.stringify(out)}`);
    assertPlainLanguage(out);
  } finally {
    streamingPrecompute.plansNeedingQuestions = orig;
    cleanup(dir);
  }
});

test('when nextBuildable throws, the directive still names the plans that need questions', () => {
  const dir = mkProject();
  const orig = continuationQueue.nextBuildable;
  try {
    makePlan(dir, 'implementation', '00072-keyboard-shortcuts', { title: 'Keyboard shortcuts' });
    continuationQueue.nextBuildable = () => { throw new Error('boom'); };
    let out;
    assert.doesNotThrow(() => { out = driver.loopBDirective(dir); });
    assert.ok(out.includes('Keyboard shortcuts'), `expected partial directive, got: ${JSON.stringify(out)}`);
    assertPlainLanguage(out);
  } finally {
    continuationQueue.nextBuildable = orig;
    cleanup(dir);
  }
});

test('a buildable ref whose plan file is missing is named by its slug (read fault -> slug)', () => {
  const dir = mkProject();
  const orig = continuationQueue.nextBuildable;
  try {
    continuationQueue.nextBuildable = () => ({ buildable: ['todo/ghost-plan.md'], blocked: [], inversions: [], missingDeps: [] });
    const out = driver.loopBDirective(dir);
    assert.ok(out.includes('ghost-plan'), `expected slug fallback for a missing file, got: ${JSON.stringify(out)}`);
    assertPlainLanguage(out);
  } finally {
    continuationQueue.nextBuildable = orig;
    cleanup(dir);
  }
});

// ── (a) real cross detection: a plan that LEAVES its pre-build stage is named ────

test('a sufficiency auto-cross (plan leaves its pre-build stage) is named in plain moment language', () => {
  const dir = mkProject();
  const orig = streamingGate.pendingGateDecisions;
  try {
    const crossing = makePlan(dir, 'implementation', '00080-quick-filters', { title: 'Quick filters' });
    makePlan(dir, 'implementation', '00081-saved-views', { title: 'Saved views' }); // stays
    // Emulate pendingGateDecisions' DOCUMENTED side effect: the sufficiency cross moves
    // the plan out of its pre-build stage. loopBDirective adds no crossing logic of its
    // own; it only reports the before/after difference the side effect produced.
    streamingGate.pendingGateDecisions = () => {
      if (fs.existsSync(crossing)) fs.rmSync(crossing);
      return [];
    };
    const out = driver.loopBDirective(dir);
    assert.ok(out.includes('Quick filters'), `expected the crossed plan named, got: ${JSON.stringify(out)}`);
    assert.ok(!out.includes('Saved views'), `the plan that stayed must not be reported as crossed: ${JSON.stringify(out)}`);
    assertPlainLanguage(out);
  } finally {
    streamingGate.pendingGateDecisions = orig;
    cleanup(dir);
  }
});
