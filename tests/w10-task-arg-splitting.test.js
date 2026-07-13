/**
 * W10-s2 (M6) — Behavioral tests: multi-word task args survive intact.
 *
 * Fixes finding M6: src/commands/menu.js re-split every already-shell-tokenized
 * argv element on whitespace, exploding a quoted value like
 * `--summary "two words here"` into `["two","words","here"]`, so parseTaskArgs
 * stored only the first word and the rest leaked as stray positionals.
 *
 * Two layers, all BEHAVIORAL:
 *   1-2. Direct unit tests of the `splitCliArgs` tokenizer (from src/commands/menu).
 *   3-5. End-to-end round-trip: feed `splitCliArgs(...)` output into
 *        menu-screens.route() EXACTLY as main() does, then re-read the on-disk
 *        task registry and assert the stored value is byte-for-byte intact.
 *
 * No test doubles: the registry is seeded with the real NB1 task-registry API
 * (addTask/updateTask/save) into an isolated tmp root, and the completion runs
 * through the real production router. Raw fs/os are permitted in tests/**.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { splitCliArgs } = require('../src/commands/menu');
const ms = require('../src/lib/menu-screens');
const taskRegistry = require('../src/lib/task-registry');

// ── isolated tmp-root harness ───────────────────────────────────────────────
let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-w10-s2-'));
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

/**
 * Seed a `running` task `t1` on disk via the real registry API
 * (queued → running). seq starts at 0, so the first addTask yields id `t1`.
 * @returns {string} the task id ("t1")
 */
function seedRunningT1() {
  const reg = taskRegistry.emptyRegistry();
  const t = taskRegistry.addTask(reg, { kind: 'implement', plan: 'w10-s2-demo' });
  taskRegistry.updateTask(reg, t.id, { status: 'running' });
  taskRegistry.save(root, reg);
  return t.id;
}

/** Re-read the on-disk registry and return task `t1`. */
function readT1() {
  const reg = taskRegistry.load(root);
  return reg.tasks.find((t) => t.id === 't1');
}

describe('W10-s2 (M6) — splitCliArgs tokenizer', () => {
  it('1. preserves a multi-word quoted token in a shell-tokenized argv', () => {
    // The shell already delivered these as 5 distinct elements; the quoted
    // value is one token and MUST stay one token.
    const input = ['task', 'complete', 't1', '--summary', 'two words here'];
    assert.deepEqual(splitCliArgs(input), input);
  });

  it('2. still splits the single-combined-string convenience form', () => {
    // One element containing spaces IS the legacy convenience form → split it.
    assert.deepEqual(splitCliArgs(['browse functional']), ['browse', 'functional']);
  });

  it('2b. non-array input fails safe to []', () => {
    assert.deepEqual(splitCliArgs(null), []);
    assert.deepEqual(splitCliArgs(undefined), []);
    assert.deepEqual(splitCliArgs('task complete'), []);
  });
});

describe('W10-s2 (M6) — round-trip through route() + registry', () => {
  it('3. multi-word --summary persists in full (scenario 9)', () => {
    seedRunningT1();
    // Exactly how main() feeds the router: splitCliArgs(cliArgs) → route().
    const cliArgs = ['menu', 'task', 'complete', 't1', '--summary', 'two words here'];
    const res = ms.route(splitCliArgs(cliArgs), root);
    assert.equal(res.ok, true, 'completion should succeed');

    const t1 = readT1();
    assert.equal(t1.status, 'done');
    assert.equal(t1.result.summary, 'two words here'); // 3 words, not "two"
  });

  it('4. multi-word --next persists in full (scenario 10)', () => {
    seedRunningT1();
    // NOTE: nextAction is gated by taskComplete's isNavRoute allowlist
    // (/^(plan|browse|section|inbox|tasks|task|validate)\b/) — a non-navigation
    // value is rejected by design, unrelated to this slice. A multi-word value
    // that IS a valid nav route still proves the split fix: the old flatMap
    // truncated it to the first word ("browse").
    const cliArgs = ['menu', 'task', 'complete', 't1', '--next', 'browse functional review'];
    const res = ms.route(splitCliArgs(cliArgs), root);
    assert.equal(res.ok, true, 'completion should succeed');

    const t1 = readT1();
    assert.equal(t1.status, 'done');
    assert.equal(t1.result.nextAction, 'browse functional review'); // 3 words, not "browse"
  });

  it('5. no multi-word value is truncated and no phantom task leaks (regression)', () => {
    seedRunningT1();
    const cliArgs = ['menu', 'task', 'complete', 't1', '--summary', 'two words here'];
    ms.route(splitCliArgs(cliArgs), root);

    const reg = taskRegistry.load(root);
    // The old bug truncated to "two" and dropped "words"/"here" as stray
    // unconsumed positionals — a silent data loss. Assert the full value round-
    // trips and that no spurious extra task record was created.
    const t1 = reg.tasks.find((t) => t.id === 't1');
    assert.notEqual(t1.result.summary, 'two');
    assert.equal(t1.result.summary.split(/\s+/).length, 3);
    assert.equal(reg.tasks.length, 1);
  });
});
