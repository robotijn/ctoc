'use strict';

/**
 * Slice 6 — the "while you were away" increment feed. `whileYouWereAway(root)` is a
 * PURE READ that names, in plain words, the increments CTOC's build loop has produced
 * since you last looked: the plans that reached the built-and-waiting-for-your-OK state
 * (plans/review/) and the shipped ones (plans/done/), most-recent-first, capped.
 *
 * "since you last looked" = a bounded recent window (the last N by modified time). No
 * new persisted marker (documented under Decisions Taken Under Ambiguity).
 *
 * LANGUAGE RULE pinned here (test c): the returned string names each increment by its
 * human TITLE only — never a plan number, never a gate number, never a raw stage word.
 *
 * Real temp-dir state; mtimes set explicitly so most-recent-first is deterministic.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const feed = require('../src/lib/increment-feed');

const STAGES = ['vision', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
const STAGE_WORDS = /\b(vision|canvas|functional|implementation|todo|in-progress|review|done)\b/i;
const GATE_NUM = /\bgates?[\s_-]*[0-3]\b/i;

function mkProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-incfeed-'));
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  for (const s of STAGES) fs.mkdirSync(path.join(dir, 'plans', s), { recursive: true });
  return dir;
}

/** Write a plan whose human title lives in a `# Heading`, then stamp its mtime. */
function makePlan(root, stage, slug, { title, whenMs, heading = true } = {}) {
  const human = title || slug;
  const front = ['---', `title: "${human}"`, 'type: implementation', '---', ''].join('\n');
  const body = heading ? `# ${human}\n\nBody.\n` : 'Body.\n';
  const p = path.join(root, 'plans', stage, `${slug}.md`);
  fs.writeFileSync(p, front + body);
  if (whenMs) {
    const t = whenMs / 1000;
    fs.utimesSync(p, t, t);
  }
  return p;
}

// (a) two recently-built increments → both listed by human title, most-recent-first.
test('lists recently-built increments by human title, most-recent-first', () => {
  const root = mkProject();
  const now = Date.now();
  makePlan(root, 'done', '00001-older', { title: 'The older increment', whenMs: now - 60000 });
  makePlan(root, 'review', '00002-newer', { title: 'The newer increment', whenMs: now - 1000 });

  const items = feed.recentIncrements(root);
  assert.strictEqual(items.length, 2);
  assert.deepStrictEqual(items.map((i) => i.title), ['The newer increment', 'The older increment']);

  const str = feed.whileYouWereAway(root);
  assert.match(str, /The newer increment/);
  assert.match(str, /The older increment/);
  // most-recent-first ordering is preserved in the rendered string too
  assert.ok(str.indexOf('The newer increment') < str.indexOf('The older increment'));
});

// (b) nothing recent → '' and no throw.
test('empty when there are no built increments', () => {
  const root = mkProject();
  assert.strictEqual(feed.whileYouWereAway(root), '');
  assert.deepStrictEqual(feed.recentIncrements(root), []);
});

// (c) the rendered output carries NO gate number and NO raw stage word.
test('rendered feed carries no gate number and no raw stage word', () => {
  const root = mkProject();
  const now = Date.now();
  makePlan(root, 'review', '00003-a', { title: 'A shiny thing', whenMs: now - 2000 });
  makePlan(root, 'done', '00004-b', { title: 'Another shiny thing', whenMs: now - 3000 });

  const str = feed.whileYouWereAway(root);
  assert.ok(str.length > 0, 'expected a non-empty feed');
  assert.doesNotMatch(str, GATE_NUM);
  assert.doesNotMatch(str, STAGE_WORDS);
});

// (d) an unreadable/malformed plan is skipped, never throws (fail-open).
test('skips an unreadable plan and never throws', () => {
  const root = mkProject();
  const now = Date.now();
  makePlan(root, 'done', '00005-good', { title: 'The good one', whenMs: now - 1000 });
  // A `.md` name that is actually a DIRECTORY faults readFileSync (EISDIR) → skipped.
  fs.mkdirSync(path.join(root, 'plans', 'review', '00006-broken.md'));

  let items;
  assert.doesNotThrow(() => { items = feed.recentIncrements(root); });
  assert.deepStrictEqual(items.map((i) => i.title), ['The good one']);
  assert.doesNotThrow(() => feed.whileYouWereAway(root));
});

// (e) the cap is respected — more than N built → only N shown.
test('respects the recent-window cap', () => {
  const root = mkProject();
  const now = Date.now();
  for (let i = 0; i < 14; i++) {
    makePlan(root, 'done', `00100-p${i}`, { title: `Increment ${i}`, whenMs: now - i * 1000 });
  }
  const items = feed.recentIncrements(root, 10);
  assert.strictEqual(items.length, 10);
  // most-recent-first: Increment 0 (newest) first, Increment 9 last of the ten.
  assert.strictEqual(items[0].title, 'Increment 0');
  assert.strictEqual(items[9].title, 'Increment 9');
});

// fault isolation: a bad root never throws.
test('a non-string root is empty, never a throw', () => {
  assert.strictEqual(feed.whileYouWereAway(null), '');
  assert.deepStrictEqual(feed.recentIncrements(undefined), []);
});
