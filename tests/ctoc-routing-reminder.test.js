'use strict';
/**
 * Part One — the per-request CTOC-routing reminder.
 *
 * Tests both the pure library (src/lib/ctoc-routing-reminder.js) and the real
 * hook (src/hooks/UserPromptSubmit.js), the latter driven as a child process via
 * spawnSync — the same house style as tests/pretooluse-task-coverage.test.js.
 *
 * The reminder must NEVER throw and the hook must ALWAYS exit 0 (a non-zero exit
 * on UserPromptSubmit would BLOCK the human's prompt).
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('node:child_process');

const mod = require('../src/lib/ctoc-routing-reminder');

const HOOK = path.join(__dirname, '..', 'src', 'hooks', 'UserPromptSubmit.js');

const createdRoots = [];
function mkRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-routing-'));
  createdRoots.push(root);
  return root;
}

/** Make `root` a CTOC project (marker CLAUDE.md + .ctoc/state). */
function markCtoc(root) {
  fs.mkdirSync(path.join(root, '.ctoc', 'state'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'CLAUDE.md'),
    '# CTOC Project Instructions\n\nmarker for the detector.\n',
    'utf8',
  );
}

/** Create `count` plan files in plans/<stage>. */
function plansIn(root, stage, count) {
  const dir = path.join(root, 'plans', stage);
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < count; i++) {
    fs.writeFileSync(path.join(dir, `p${i}.md`), `---\ntitle: p${i}\n---\n`, 'utf8');
  }
}

after(() => {
  for (const root of createdRoots) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

// ── looksLikeWorkRequest ────────────────────────────────────────────────
describe('looksLikeWorkRequest', () => {
  it('is true for work verbs, word-bounded and case-insensitive', () => {
    for (const p of ['please Fix the bug', 'implement the parser', 'refactor this',
      'add a field', 'REMOVE the dead code', 'wire it up', 'migrate the schema']) {
      assert.equal(mod.looksLikeWorkRequest(p), true, p);
    }
  });
  it('is false for questions and non-work prose', () => {
    for (const p of ['what does this do?', 'explain the flow', 'why is it slow',
      'the prefix in affixed is not a verb']) {
      assert.equal(mod.looksLikeWorkRequest(p), false, p);
    }
  });
  it('is false for a non-string', () => {
    assert.equal(mod.looksLikeWorkRequest(null), false);
    assert.equal(mod.looksLikeWorkRequest(42), false);
  });
});

// ── fingerprint / buildStateBlock ───────────────────────────────────────
describe('fingerprint', () => {
  it('is empty when every counted stage is zero', () => {
    assert.equal(mod.fingerprint({ inProgress: 0, todo: 0, implementation: 0, review: 0, functional: 0, canvas: 0 }), '');
  });
  it('is non-empty and stable when something is live', () => {
    const a = mod.fingerprint({ inProgress: 1, todo: 4, implementation: 0, review: 2, functional: 0, canvas: 0 });
    const b = mod.fingerprint({ review: 2, todo: 4, inProgress: 1, implementation: 0, functional: 0, canvas: 0 });
    assert.notEqual(a, '');
    assert.equal(a, b); // order-independent
  });
});

describe('buildStateBlock', () => {
  it('returns "" when every count is zero', () => {
    assert.equal(mod.buildStateBlock({ inProgress: 0, todo: 0, implementation: 0, review: 0, functional: 0, canvas: 0 }), '');
  });
  it('emits only lines that are true', () => {
    const txt = mod.buildStateBlock({ inProgress: 1, todo: 4, implementation: 6, review: 12, functional: 0, canvas: 0 });
    assert.match(txt, /In progress: 1/);
    assert.match(txt, /Todo queue: 4/);
    assert.match(txt, /6 in implementation, 12 in review/);
    assert.match(txt, /\/ctoc:start/);
  });
  it('omits the todo line when todo is zero', () => {
    const txt = mod.buildStateBlock({ inProgress: 2, todo: 0, implementation: 0, review: 0, functional: 0, canvas: 0 });
    assert.match(txt, /In progress: 2/);
    assert.doesNotMatch(txt, /Todo queue/);
  });
});

// ── collectState fail-soft ──────────────────────────────────────────────
describe('collectState', () => {
  it('returns all-zero counts for a root with no plans', () => {
    const root = mkRoot();
    markCtoc(root);
    const st = mod.collectState(root);
    assert.equal(st.inProgress, 0);
    assert.equal(st.todo, 0);
  });
  it('reflects real plan counts', () => {
    const root = mkRoot();
    markCtoc(root);
    plansIn(root, 'in-progress', 1);
    plansIn(root, 'todo', 3);
    const st = mod.collectState(root);
    assert.equal(st.inProgress, 1);
    assert.equal(st.todo, 3);
  });
});

// ── memo store ──────────────────────────────────────────────────────────
describe('readMemo / writeMemo', () => {
  it('missing store yields null', () => {
    const root = mkRoot();
    markCtoc(root);
    assert.equal(mod.readMemo(root, 'sess-1'), null);
  });
  it('round-trips a memo for a session', () => {
    const root = mkRoot();
    markCtoc(root);
    assert.equal(mod.writeMemo(root, 'sess-1', { fingerprint: 'fp-a', directiveInProgress: 2 }), true);
    const m = mod.readMemo(root, 'sess-1');
    assert.equal(m.fingerprint, 'fp-a');
    assert.equal(m.directiveInProgress, 2);
  });
  it('prunes to the 20 most-recent sessions', () => {
    const root = mkRoot();
    markCtoc(root);
    for (let i = 0; i < 25; i++) {
      mod.writeMemo(root, `sess-${i}`, { fingerprint: `fp-${i}`, directiveInProgress: null });
    }
    const store = JSON.parse(fs.readFileSync(path.join(root, '.ctoc', 'state', 'routing-reminder.json'), 'utf8'));
    assert.equal(Object.keys(store).length, 20);
    assert.equal(store['sess-0'], undefined);   // oldest pruned
    assert.ok(store['sess-24']);                // newest kept
  });
  it('ignores a prototype-polluting session key on read', () => {
    const root = mkRoot();
    markCtoc(root);
    fs.writeFileSync(
      path.join(root, '.ctoc', 'state', 'routing-reminder.json'),
      JSON.stringify({ __proto__: { fingerprint: 'evil' } }),
      'utf8',
    );
    assert.equal(mod.readMemo(root, '__proto__'), null);
    assert.deepEqual({}.fingerprint, undefined); // Object.prototype not polluted
  });
  it('malformed store yields null, never throws', () => {
    const root = mkRoot();
    markCtoc(root);
    fs.writeFileSync(path.join(root, '.ctoc', 'state', 'routing-reminder.json'), '{ not json', 'utf8');
    assert.equal(mod.readMemo(root, 'sess-1'), null);
  });
});

// ── buildReminder — the whole decision ──────────────────────────────────
describe('buildReminder', () => {
  it('says nothing in a non-CTOC project', () => {
    const root = mkRoot(); // no .ctoc marker
    const r = mod.buildReminder({ root, prompt: 'fix the bug', sessionId: 's' });
    assert.equal(r.text, '');
    assert.equal(r.reason, 'not-ctoc');
  });
  it('says nothing when the human typed an escape phrase', () => {
    const root = mkRoot();
    markCtoc(root);
    const r = mod.buildReminder({ root, prompt: 'quick fix: change this', sessionId: 's' });
    assert.equal(r.text, '');
    assert.equal(r.reason, 'escape-phrase');
  });
  it('emits directive + state on the first work prompt with plans in flight', () => {
    const root = mkRoot();
    markCtoc(root);
    plansIn(root, 'in-progress', 1);
    plansIn(root, 'todo', 4);
    const r = mod.buildReminder({ root, prompt: 'implement the feature', sessionId: 's' });
    assert.equal(r.directive, true);
    assert.equal(r.state, true);
    assert.equal(r.reason, 'directive+state');
    assert.match(r.text, /CTOC routing/);
    assert.match(r.text, /CTOC pipeline state/);
  });
  it('emits the directive only in an empty CTOC repo (no live state)', () => {
    const root = mkRoot();
    markCtoc(root);
    const r = mod.buildReminder({ root, prompt: 'add a new module', sessionId: 's' });
    assert.equal(r.directive, true);
    assert.equal(r.state, false);
    assert.equal(r.reason, 'directive');
  });
  it('is silent (already-driving) on a repeat work prompt for an unchanged in-progress set', () => {
    const root = mkRoot();
    markCtoc(root);
    plansIn(root, 'in-progress', 1);
    const st = mod.collectState(root);
    mod.writeMemo(root, 's', { fingerprint: mod.fingerprint(st), directiveInProgress: st.inProgress });
    const r = mod.buildReminder({ root, prompt: 'refactor the parser', sessionId: 's' });
    assert.equal(r.text, '');
    assert.equal(r.reason, 'already-driving');
  });
  it('is silent (not-work) on a non-work prompt with unchanged state', () => {
    const root = mkRoot();
    markCtoc(root);
    plansIn(root, 'todo', 2);
    const st = mod.collectState(root);
    mod.writeMemo(root, 's', { fingerprint: mod.fingerprint(st), directiveInProgress: null });
    const r = mod.buildReminder({ root, prompt: 'what does the parser do?', sessionId: 's' });
    assert.equal(r.text, '');
    assert.equal(r.reason, 'not-work');
  });
  it('emits the state block alone when the pipeline moved since last emit', () => {
    const root = mkRoot();
    markCtoc(root);
    plansIn(root, 'review', 3);
    mod.writeMemo(root, 's', { fingerprint: 'stale-different', directiveInProgress: null });
    const r = mod.buildReminder({ root, prompt: 'how does review work?', sessionId: 's' });
    assert.equal(r.directive, false);
    assert.equal(r.state, true);
    assert.equal(r.reason, 'state');
  });
  it('never throws on garbage input and degrades to empty text', () => {
    // A non-string root is caught by isCtocProject's own fail-soft path, so the
    // graceful reason is 'not-ctoc'. The contract under test is "never throws".
    const r = mod.buildReminder({ root: 12345, prompt: null, sessionId: null });
    assert.equal(r.text, '');
    assert.ok(['not-ctoc', 'error'].includes(r.reason));
  });
  it('never throws when called with no argument at all', () => {
    assert.doesNotThrow(() => mod.buildReminder());
    assert.equal(mod.buildReminder().text, '');
  });
});

// ── the real hook, driven as a child process ────────────────────────────
describe('UserPromptSubmit hook (child process)', () => {
  function run(root, payload, input) {
    return spawnSync(process.execPath, [HOOK], {
      cwd: root,
      input: input !== undefined ? input : JSON.stringify(payload),
      encoding: 'utf8',
    });
  }

  it('writes the routing reminder to stdout and exits 0', () => {
    const root = mkRoot();
    markCtoc(root);
    plansIn(root, 'in-progress', 1);
    const res = run(root, { prompt: 'fix the crash', session_id: 'abc' });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /CTOC routing/);
  });
  it('exits 0 with empty stdout on a non-work prompt', () => {
    const root = mkRoot();
    markCtoc(root);
    const res = run(root, { prompt: 'what is this?', session_id: 'abc' });
    assert.equal(res.status, 0);
    assert.equal(res.stdout.trim(), '');
  });
  it('exits 0 on empty stdin', () => {
    const root = mkRoot();
    markCtoc(root);
    const res = run(root, undefined, '');
    assert.equal(res.status, 0);
  });
  it('exits 0 on malformed stdin', () => {
    const root = mkRoot();
    markCtoc(root);
    const res = run(root, undefined, '{ not json');
    assert.equal(res.status, 0);
  });
  it('exits 0 and stays silent in a non-CTOC project', () => {
    const root = mkRoot(); // no marker
    const res = run(root, { prompt: 'fix the bug', session_id: 'abc' });
    assert.equal(res.status, 0);
    assert.equal(res.stdout.trim(), '');
  });
  it('exports run and readStdinJson', () => {
    const hook = require('../src/hooks/UserPromptSubmit');
    assert.equal(typeof hook.run, 'function');
    assert.equal(typeof hook.readStdinJson, 'function');
  });
});
