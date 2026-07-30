'use strict';

/**
 * THE SCOPE-GROWTH THIRD DOOR (plan 00123).
 *
 * What this defends: when an executor discovers mid-build that it must touch a file
 * its plan's declared `files:` set does NOT cover, the honest move is to STOP AND ASK
 * — surface the scope growth as a structured question the human already has a door to
 * (the inbox questions stream) — never to silently edit an undeclared file, amend
 * `files:`, or move the plan (both of which arm an auto-revert). These tests drive that
 * behaviour end-to-end against real temp projects and the real inbox / continuation
 * modules — no mocks of core logic, because a test of the mock is not a test of the
 * mechanism.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const scopeGrowth = require('../src/lib/scope-growth');
const inbox = require('../src/lib/inbox');
const continuation = require('../src/lib/continuation');
const menuScreens = require('../src/lib/menu-screens');

// ─── fixtures ────────────────────────────────────────────────────────────────

/** A throwaway project root with the plan stage dirs and one declaring plan. */
function makeRoot(declaredFiles) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-scopegrowth-'));
  for (const stage of ['in-progress', 'todo', 'implementation']) {
    fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  }
  const slug = 'demo-plan';
  const files = (declaredFiles || ['src/lib/foo.js', 'tests/foo.test.js'])
    .map((f) => `  - "${f}"`).join('\n');
  fs.writeFileSync(
    path.join(root, 'plans', 'in-progress', `${slug}.md`),
    `---\ntitle: "a declaring plan"\ntype: implementation\nfiles:\n${files}\n---\n\n# body\n`
  );
  return { root, slug };
}

/** A complete, valid seven-field request against `slug`. */
function fullRequest(slug, over = {}) {
  return {
    plan: slug,
    step: '10',
    file: 'src/lib/newdep.js',
    blocked_write: 'add a require of newdep from foo.js',
    forced_by: 'src/lib/foo.js — the exported signature of foo() moved',
    acceptance_criterion: 'foo() cannot compile without newdep',
    if_refused: 'the build breaks: foo.js references a symbol that no longer exists',
    ...over,
  };
}

const SEVEN = ['plan', 'step', 'file', 'blocked_write', 'forced_by', 'acceptance_criterion', 'if_refused'];

function questionFiles(root) {
  const dir = path.join(root, '.ctoc', 'inbox', 'questions');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
}

// ─── the tests ───────────────────────────────────────────────────────────────

describe('scope-growth — requestScopeGrowth writes a structured, refusable question', () => {
  it('1 · a complete request lands with all seven fields in the body', () => {
    const { root, slug } = makeRoot();
    const res = scopeGrowth.requestScopeGrowth(fullRequest(slug), root);
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.ok(res.path && fs.existsSync(res.path), 'the question file must exist on disk');
    assert.ok(res.path.includes(path.join('.ctoc', 'inbox', 'questions')), 'must live in the inbox questions stream');
    const body = fs.readFileSync(res.path, 'utf8');
    const req = fullRequest(slug);
    for (const key of SEVEN) {
      assert.ok(body.includes(String(req[key])), `body must carry field "${key}"`);
    }
  });

  it('2 · the dashboard question COUNT moves by one', () => {
    const { root, slug } = makeRoot();
    const before = inbox.getInboxCounts(root).questions;
    scopeGrowth.requestScopeGrowth(fullRequest(slug), root);
    const after = inbox.getInboxCounts(root).questions;
    assert.equal(after, before + 1, 'getInboxCounts().questions — the reader the dashboard prints');
  });

  it('3 · the inbox door names the plan and the step', () => {
    const { root, slug } = makeRoot();
    scopeGrowth.requestScopeGrowth(fullRequest(slug, { step: '13' }), root);
    const screen = menuScreens.inboxQuestionsScreen(root);
    assert.ok(screen.text.includes(slug), 'the door must name the source plan');
    assert.ok(screen.text.includes('step 13'), 'the door must name the source step');
  });

  it('4 · each of the seven missing fields refuses, names the field, and writes NO file', () => {
    for (const missing of SEVEN) {
      const { root, slug } = makeRoot();
      const req = fullRequest(slug);
      delete req[missing];
      const res = scopeGrowth.requestScopeGrowth(req, root);
      assert.equal(res.ok, false, `omitting "${missing}" must refuse`);
      assert.ok(res.errors.some((e) => e.includes(missing)), `error must name "${missing}": ${res.errors}`);
      assert.equal(questionFiles(root).length, 0, `no file may be written when "${missing}" is missing`);
    }
  });

  it('5 · a blank / whitespace-only field is not a stated cause — refused', () => {
    const { root, slug } = makeRoot();
    const res = scopeGrowth.requestScopeGrowth(fullRequest(slug, { if_refused: '   ' }), root);
    assert.equal(res.ok, false);
    assert.ok(res.errors.some((e) => e.includes('if_refused')));
    assert.equal(questionFiles(root).length, 0);
  });

  it('6 · a file THIS PLAN ALREADY DECLARES refuses — there is no growth to request', () => {
    const { root, slug } = makeRoot();
    const res = scopeGrowth.requestScopeGrowth(fullRequest(slug, { file: 'src/lib/foo.js' }), root);
    assert.equal(res.ok, false);
    assert.ok(res.errors.join(' ').toLowerCase().includes('declare'), `error must explain already-declared: ${res.errors}`);
    assert.equal(questionFiles(root).length, 0);
  });

  it('7 · forced_by naming a declared file → forced_by_declared === true', () => {
    const { root, slug } = makeRoot();
    const res = scopeGrowth.requestScopeGrowth(fullRequest(slug), root);
    assert.equal(res.ok, true);
    assert.equal(res.forced_by_declared, true);
  });

  it('8 · forced_by naming nothing declared → forced_by_declared === false, request STILL written', () => {
    const { root, slug } = makeRoot();
    const res = scopeGrowth.requestScopeGrowth(
      fullRequest(slug, { forced_by: 'a brand-new capability nobody declared' }), root);
    assert.equal(res.ok, true, 'a weak request is FLAGGED, not refused');
    assert.equal(res.forced_by_declared, false);
    assert.equal(questionFiles(root).length, 1);
  });

  it('9 · an unreadable / unlocatable plan declaration → forced_by_declared === null (never false)', () => {
    const { root } = makeRoot();
    const res = scopeGrowth.requestScopeGrowth(fullRequest('a-plan-that-does-not-exist'), root);
    assert.equal(res.ok, true);
    assert.equal(res.forced_by_declared, null, '"could not look" is not "found nothing"');
  });

  it('9b · a plan file that EXISTS but cannot be read → forced_by_declared null (read-fault path)', () => {
    const { root } = makeRoot();
    // A directory where the plan file belongs: existsSync is true, readFileSync throws —
    // the "could not look" branch distinct from "not found".
    fs.mkdirSync(path.join(root, 'plans', 'in-progress', 'dir-plan.md'), { recursive: true });
    const res = scopeGrowth.requestScopeGrowth(fullRequest('dir-plan'), root);
    assert.equal(res.ok, true);
    assert.equal(res.forced_by_declared, null, 'an unreadable declaration is null, never false');
  });

  it('11b · a WRITE failure refuses and registers NO fork', () => {
    const { root, slug } = makeRoot();
    continuation.startBatch(root, { label: 'demo', total: 2 });
    // Put a FILE where the questions directory belongs, so createQuestion's write throws.
    fs.mkdirSync(path.join(root, '.ctoc', 'inbox'), { recursive: true });
    fs.writeFileSync(path.join(root, '.ctoc', 'inbox', 'questions'), 'not a directory');
    const res = scopeGrowth.requestScopeGrowth(fullRequest(slug), root);
    assert.equal(res.ok, false, 'a write that cannot land is a refusal');
    assert.ok(res.errors.join(' ').toLowerCase().includes('write'), `error must name the write failure: ${res.errors}`);
    assert.equal(continuation.status(root).forkPending, false, 'a request that did not land registers no fork');
  });

  it('10 · a successful write registers the continuation FORK', () => {
    const { root, slug } = makeRoot();
    continuation.startBatch(root, { label: 'demo', total: 2 });
    assert.equal(continuation.status(root).forkPending, false, 'precondition: no fork yet');
    const res = scopeGrowth.requestScopeGrowth(fullRequest(slug), root);
    assert.equal(res.ok, true);
    assert.equal(continuation.status(root).forkPending, true, 'the fork must be registered so the Stop hook permits the halt');
  });

  it('11 · a refused write registers NO fork — the continuation state is untouched', () => {
    const { root, slug } = makeRoot();
    continuation.startBatch(root, { label: 'demo', total: 2 });
    const req = fullRequest(slug);
    delete req.blocked_write;
    const res = scopeGrowth.requestScopeGrowth(req, root);
    assert.equal(res.ok, false);
    assert.equal(continuation.status(root).forkPending, false, 'a request that did not land must not license a quiet stop');
  });
});

describe('scope-growth — listScopeGrowthRequests reads them back honestly', () => {
  it('12 · written requests round-trip and are grouped by plan', () => {
    const { root, slug } = makeRoot();
    scopeGrowth.requestScopeGrowth(fullRequest(slug), root);
    // a second plan
    fs.writeFileSync(path.join(root, 'plans', 'in-progress', 'other-plan.md'),
      '---\nfiles:\n  - "src/lib/bar.js"\n---\n\nbody\n');
    scopeGrowth.requestScopeGrowth(fullRequest('other-plan', { file: 'src/lib/z.js' }), root);
    const out = scopeGrowth.listScopeGrowthRequests(root);
    assert.equal(out.ok, true);
    assert.equal(out.requests.length, 2);
    assert.equal(out.byPlan[slug], 1);
    assert.equal(out.byPlan['other-plan'], 1);
  });

  it('13 · a plain (non scope-growth) question is not counted as a scope-growth request', () => {
    const { root, slug } = makeRoot();
    inbox.createQuestion({ source_plan: slug, source_step: '4', question: 'ordinary', context: 'nothing' }, root);
    scopeGrowth.requestScopeGrowth(fullRequest(slug), root);
    const out = scopeGrowth.listScopeGrowthRequests(root);
    assert.equal(out.requests.length, 1, 'only the scope-growth item counts');
  });

  it('13b · an UNREADABLE inbox item is counted in `unreadable`, never silently dropped', () => {
    const { root, slug } = makeRoot();
    scopeGrowth.requestScopeGrowth(fullRequest(slug), root);
    const dir = path.join(root, '.ctoc', 'inbox', 'questions');
    const dangling = path.join(dir, 'zz-unreadable.md');
    try {
      fs.symlinkSync(path.join(dir, '__no_such_target__'), dangling);
      fs.readFileSync(dangling, 'utf8');
      // readable → symlink target unexpectedly exists; cannot exercise the branch here.
      assert.fail('could not construct an unreadable inbox item on this platform');
    } catch (err) {
      if (err instanceof assert.AssertionError) throw err;
      // genuinely unreadable
      const out = scopeGrowth.listScopeGrowthRequests(root);
      assert.equal(out.ok, true);
      assert.equal(out.requests.length, 1, 'the readable request still lists');
      assert.ok(out.unreadable >= 1, 'the unreadable item must be COUNTED, never dropped');
    }
  });

  it('14 · an unreadable inbox questions directory → ok:false (loud, not an empty list)', () => {
    const { root } = makeRoot();
    const dir = path.join(root, '.ctoc', 'inbox', 'questions');
    // A FILE where the directory belongs makes readdir throw ENOTDIR — portable, no chmod.
    fs.mkdirSync(path.join(root, '.ctoc', 'inbox'), { recursive: true });
    fs.writeFileSync(dir, 'not a directory');
    const out = scopeGrowth.listScopeGrowthRequests(root);
    assert.equal(out.ok, false, 'a directory that cannot be listed is a loud failure, not "no requests"');
  });

  it('15 · a SECOND request against one plan shows byPlan === 2 (mis-sizing is visible)', () => {
    const { root, slug } = makeRoot();
    scopeGrowth.requestScopeGrowth(fullRequest(slug), root);
    scopeGrowth.requestScopeGrowth(fullRequest(slug, { file: 'src/lib/second.js' }), root);
    const out = scopeGrowth.listScopeGrowthRequests(root);
    assert.equal(out.byPlan[slug], 2, 'a second request on one plan is itself a finding');
  });
});

describe('scope-growth — isScopeGrowthRequest', () => {
  it('16 · true for a scope-growth item, false for a plain one, false (not throw) for a bad path', () => {
    const { root, slug } = makeRoot();
    const res = scopeGrowth.requestScopeGrowth(fullRequest(slug), root);
    assert.equal(scopeGrowth.isScopeGrowthRequest({ path: res.path }), true);
    const plain = inbox.createQuestion({ source_plan: slug, source_step: '4', question: 'q', context: 'c' }, root);
    assert.equal(scopeGrowth.isScopeGrowthRequest({ path: plain.path }), false);
    assert.equal(scopeGrowth.isScopeGrowthRequest({ path: path.join(root, 'nope.md') }), false);
  });
});
