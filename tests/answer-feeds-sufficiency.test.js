'use strict';

/**
 * Slice 3 — AN ANSWER FEEDS SUFFICIENCY (the Loop-A -> Loop-B coupling).
 *
 * `streamAnswer(ref, questionId, optionKey, root)` records the human's answer (its
 * existing behaviour, unchanged) and now ALSO carries the Loop-B tick from
 * `loopBDirective(root)` in the SAME return: the moment the human answers the last
 * open fork on a plan, the same screen surfaces what just auto-crossed on sufficiency
 * and what is next to build, so the session model re-runs the tick with no further
 * human action.
 *
 * The additive shape: `streamAnswer` returns the rendered gate SCREEN OBJECT (from
 * `streamingGateScreen`) — `{ text, ask, actions }`, whose human-facing render is the
 * `.text` field. Its one production caller (menu-screens `stream answer`) returns that
 * object straight to the router. So the directive is APPENDED to `.text` (the field the
 * session model reads); `.ask` and `.actions` are untouched, and when `loopBDirective`
 * is empty the object is deep-equal to the pure screen, so every existing consumer is
 * unchanged.
 *
 * Real temp fixtures for the questions store + plan dirs + a real Gate-2 ledger entry
 * (mirrors tests/streaming-gate.test.js and tests/loop-b-directive.test.js). No mock
 * of core logic; the only monkeypatch is the ONE function whose throw we provoke to
 * prove fail-open.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const streamingGate = require('../src/lib/streaming-gate.js');
const precompute = require('../src/lib/streaming-precompute.js');
const ledger = require('../src/lib/approval-ledger.js');
const loopBDriver = require('../src/lib/loop-b-driver.js');

const STAGES = ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
const sandboxes = [];
let counter = 0;

function makeSandbox() {
  const root = path.join(os.tmpdir(), 'ctoc-afs-' + process.pid + '-' + Date.now() + '-' + counter++);
  for (const stage of STAGES) fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
  sandboxes.push(root);
  return root;
}

// A functional plan that PASSES validateFunctionalToImpl.
function validFunctionalBody(slug) {
  return `---\ntitle: ${slug} title\n---\n\n# ${slug} title\n\n` +
    `## Problem Statement\nThe thing is broken.\n\n## Acceptance Criteria\n- [ ] the thing works\n\n## Scope\nThe module.\n`;
}

function writePlan(root, stage, slug, body) {
  const p = path.join(root, 'plans', stage, slug + '.md');
  fs.writeFileSync(p, body);
  return p;
}

/** A `critical` question — an open one is a real FORK that blocks a sufficiency cross. */
function forkQuestion(id) {
  return {
    id,
    prompt: `Which ${id}?`,
    critical: true,
    important: false,
    options: [
      { key: 'pg', label: 'Postgres', recommended: true, pros: 'Relational.', cons: 'Ops cost.' },
      { key: 'sqlite', label: 'SQLite', pros: 'Zero ops.', cons: 'Single writer.' },
    ],
  };
}

/** Mint a REAL Gate-2 ledger entry so a todo plan reads as buildable. */
function approveTodo(root, slug, title) {
  const body = `---\ntitle: "${title}"\niron_loop: true\ndepends_on: none\nfiles:\n  - "src/lib/${slug}.js"\n---\n\n# ${title}\n\n## Implementation\nBody.\n`;
  const p = writePlan(root, 'todo', slug, body);
  ledger.writeEntry(
    ledger.slugFromPlanPath(p),
    { content: body, stage_from: 'implementation', stage_to: 'todo', approved_by: 'human' },
    root,
  );
  return p;
}

function answersLog(root) {
  const f = path.join(root, '.ctoc', 'streaming', 'answers.jsonl');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
}

afterEach(() => {
  while (sandboxes.length) fs.rmSync(sandboxes.pop(), { recursive: true, force: true });
});

describe('slice 3 — streamAnswer records the answer AND carries the Loop-B directive', () => {
  // (a) REGRESSION GUARD — the existing contract is intact: the answer is recorded and
  // the screen is returned. With no cross, no buildable plan and fresh questions,
  // loopBDirective is empty, so the return is exactly the pure screen (nothing appended).
  it('case a — still records the answer and returns the unchanged screen when nothing is pending', () => {
    const root = makeSandbox();
    const p = writePlan(root, 'functional', 'reg', validFunctionalBody('reg'));
    const ref = 'functional/reg.md';
    // TWO forks; answer ONE — a fork stays open, so nothing crosses and nothing is buildable.
    precompute.writePlanQuestions(root, ref, [forkQuestion('db'), forkQuestion('cache')], fs.statSync(p).mtimeMs);

    const out = streamingGate.streamAnswer(ref, 'db', 'pg', root);

    // Existing behaviour: the answer landed in the append-only log.
    assert.match(answersLog(root), /"questionId":"db"/, 'the answer is recorded, as before');
    // Existing behaviour: the screen OBJECT is returned, its fields intact.
    assert.equal(typeof out, 'object', 'still returns the screen object');
    assert.ok(out.ask && out.actions, 'the existing screen fields (ask, actions) are unchanged');
    assert.match(out.text, /Recorded your answer/, 'still carries the recorded-answer status in .text');
    // Nothing crossed / nothing buildable / questions present -> the directive is empty,
    // so the return is deep-equal to the pure screen.
    assert.deepEqual(out, streamingGate.streamingGateScreen(root, 'Recorded your answer for reg.md.'),
      'with an empty directive the return is exactly the pure screen — existing consumers unchanged');
  });

  // (b)+(c) THE COUPLING — a buildable plan exists, so the answer's return ALSO surfaces
  // the Loop-B tick naming what is next to build.
  it('case b — the return ALSO carries the Loop-B directive naming the next plan to build', () => {
    const root = makeSandbox();
    const p = writePlan(root, 'functional', 'ask', validFunctionalBody('ask'));
    const ref = 'functional/ask.md';
    // Keep a second fork open so THIS plan does not cross — isolates the build line.
    precompute.writePlanQuestions(root, ref, [forkQuestion('db'), forkQuestion('cache')], fs.statSync(p).mtimeMs);
    approveTodo(root, '00042-weekly-summary', 'Send the weekly summary');

    const out = streamingGate.streamAnswer(ref, 'db', 'pg', root);

    assert.match(answersLog(root), /"questionId":"db"/, 'the answer is still recorded');
    assert.ok(out.text.includes('Send the weekly summary'),
      `.text surfaces the Loop-B build directive: ${JSON.stringify(out.text)}`);
    // The Loop-B directive is APPENDED after the screen — the screen still leads.
    assert.ok(out.text.indexOf('Recorded your answer') < out.text.indexOf('Send the weekly summary'),
      'the screen comes first, the directive is appended after it');
  });

  // (c') the sufficiency cross this answer CAUSES is surfaced in the same return.
  it('case c — answering the last open fork surfaces what just crossed on its own', () => {
    const root = makeSandbox();
    const p = writePlan(root, 'functional', 'suff', validFunctionalBody('suff'));
    const ref = 'functional/suff.md';
    // A single fork: answering it makes the plan sufficient, so it auto-crosses.
    precompute.writePlanQuestions(root, ref, [forkQuestion('db')], fs.statSync(p).mtimeMs);

    const out = streamingGate.streamAnswer(ref, 'db', 'pg', root);

    // The plan crossed on its own (existing sufficiency side effect) ...
    assert.ok(!fs.existsSync(p), 'the answered plan left functional/ on its own');
    // ... and the SAME return names it as moved-forward-without-your-OK.
    assert.ok(out.text.includes('Moved forward on their own'),
      `.text surfaces the auto-cross: ${JSON.stringify(out.text)}`);
    assert.ok(out.text.includes('suff'), `the crossed plan is named: ${JSON.stringify(out.text)}`);
  });

  // (d) FAIL-OPEN — loopBDirective throwing never loses the answer nor breaks the return.
  it('case d — a throwing loopBDirective still records the answer and returns the screen', () => {
    const root = makeSandbox();
    const p = writePlan(root, 'functional', 'foe', validFunctionalBody('foe'));
    const ref = 'functional/foe.md';
    precompute.writePlanQuestions(root, ref, [forkQuestion('db'), forkQuestion('cache')], fs.statSync(p).mtimeMs);

    const orig = loopBDriver.loopBDirective;
    loopBDriver.loopBDirective = () => { throw new Error('boom'); };
    try {
      let out;
      assert.doesNotThrow(() => { out = streamingGate.streamAnswer(ref, 'db', 'pg', root); });
      assert.match(answersLog(root), /"questionId":"db"/, 'the answer is recorded despite the throw');
      assert.equal(typeof out, 'object', 'a screen object is still returned');
      assert.match(out.text, /Recorded your answer/, 'the screen is intact; the directive is simply omitted');
    } finally {
      loopBDriver.loopBDirective = orig;
    }
  });
});
