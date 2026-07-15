'use strict';

/**
 * Continuation gate — the mechanism that makes autonomous building CONTINUE
 * (Operating Lesson 15). Tests the decision logic AND the Stop hook's exit codes
 * against real temp-dir state; nothing mocked.
 *
 * Decision contract (shouldContinue):
 *   active batch, remaining>0, no fork, not exhausted -> continue:true  (hook BLOCKS)
 *   no batch / fork pending / complete / exhausted     -> continue:false (hook ALLOWS)
 *
 * Hook exit codes: 2 = BLOCK the stop, 0 = ALLOW the stop / fail-open.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const c = require('../src/lib/continuation');
const HOOK = path.join(__dirname, '..', 'src', 'hooks', 'stop-continuation-gate.js');

function mkProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-cont-'));
  // A .ctoc marker so findProjectRoot resolves this dir as the root.
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  return dir;
}

function runHook(cwd, env = {}) {
  return spawnSync(process.execPath, [HOOK], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

// ── decision logic ────────────────────────────────────────────────────────────

test('no active batch -> continue:false (gate is inert / opt-in)', () => {
  const dir = mkProject();
  try {
    assert.equal(c.shouldContinue(dir).continue, false);
    assert.equal(c.status(dir), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('startBatch then shouldContinue -> continue:true with remaining/total', () => {
  const dir = mkProject();
  try {
    c.startBatch(dir, { label: '50-round repair', total: 50 });
    const d = c.shouldContinue(dir);
    assert.equal(d.continue, true);
    assert.equal(d.remaining, 50);
    assert.equal(d.total, 50);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('advance decrements remaining; the last unit deactivates the batch -> stop allowed', () => {
  const dir = mkProject();
  try {
    c.startBatch(dir, { label: 'x', total: 3 });
    assert.equal(c.advance(dir).remaining, 2);
    assert.equal(c.shouldContinue(dir).continue, true);
    c.advance(dir); // 1
    const last = c.advance(dir); // 0
    assert.equal(last.remaining, 0);
    assert.equal(last.active, false);
    assert.equal(c.shouldContinue(dir).continue, false, 'a finished batch must ALLOW the stop');
    assert.equal(c.shouldContinue(dir).reason, 'batch complete');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a registered FORK pauses the batch -> stop allowed for the human; resolveFork resumes', () => {
  const dir = mkProject();
  try {
    c.startBatch(dir, { label: 'x', total: 10 });
    c.registerFork(dir, 'Python run-target: honesty-downgrade vs framework-aware');
    const d = c.shouldContinue(dir);
    assert.equal(d.continue, false, 'a pending fork must ALLOW the stop so the human can decide');
    assert.equal(d.fork, true);
    assert.match(d.reason, /fork pending/);
    c.resolveFork(dir);
    assert.equal(c.shouldContinue(dir).continue, true, 'resolving the fork resumes the batch');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('block-budget is bounded: past maxBlocks the gate stands down (no infinite wedge)', () => {
  const dir = mkProject();
  try {
    c.startBatch(dir, { label: 'x', total: 5, maxBlocks: 2 });
    assert.equal(c.shouldContinue(dir).continue, true);
    c.recordBlock(dir);
    assert.equal(c.shouldContinue(dir).continue, true);
    c.recordBlock(dir); // now blocks === maxBlocks
    const d = c.shouldContinue(dir);
    assert.equal(d.continue, false, 'exhausted block-budget must ALLOW the stop');
    assert.equal(d.exhausted, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('complete() clears the state entirely', () => {
  const dir = mkProject();
  try {
    c.startBatch(dir, { label: 'x', total: 2 });
    c.complete(dir);
    assert.equal(c.status(dir), null);
    assert.equal(c.shouldContinue(dir).continue, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fail-open: a corrupt state file resolves to continue:false, never throws', () => {
  const dir = mkProject();
  try {
    fs.mkdirSync(path.join(dir, '.ctoc', 'state'), { recursive: true });
    fs.writeFileSync(c.statePath(dir), '{ not valid json');
    assert.doesNotThrow(() => c.shouldContinue(dir));
    assert.equal(c.shouldContinue(dir).continue, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── Stop hook exit codes (the real enforcement surface) ─────────────────────────

test('hook: no batch -> exit 0 (allows the stop; inert by default)', () => {
  const dir = mkProject();
  try {
    assert.equal(runHook(dir).status, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('hook: active batch with remaining work -> exit 2 (BLOCKS the stop) + records a block', () => {
  const dir = mkProject();
  try {
    c.startBatch(dir, { label: '50-round repair', total: 50 });
    const r = runHook(dir);
    assert.equal(r.status, 2, 'an unfinished authorized batch must BLOCK the stop');
    assert.match(r.stderr, /BLOCKED stop/);
    assert.match(r.stderr, /remaining/);
    assert.equal(c.status(dir).blocks, 1, 'the hook records the block to bound the loop');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('hook: CTOC_SKIP_CONTINUATION=1 escapes -> exit 0 even with an active batch', () => {
  const dir = mkProject();
  try {
    c.startBatch(dir, { label: 'x', total: 9 });
    assert.equal(runHook(dir, { CTOC_SKIP_CONTINUATION: '1' }).status, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('hook: a pending fork -> exit 0 (allows the stop so the human decides)', () => {
  const dir = mkProject();
  try {
    c.startBatch(dir, { label: 'x', total: 9 });
    c.registerFork(dir, 'a real decision');
    assert.equal(runHook(dir).status, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── HARD edge cases — the WEDGE vectors a safety gate MUST fail open on ──────────

test('WEDGE-1: recordBlock returns FALSE when the persist fails (unwritable state file)', () => {
  const dir = mkProject();
  try {
    c.startBatch(dir, { label: 'x', total: 1, maxBlocks: 3 });
    fs.chmodSync(c.statePath(dir), 0o444); // readable but not writable
    // The write cannot land, so the block is NOT persisted — recordBlock must say so.
    const persisted = c.recordBlock(dir);
    assert.equal(persisted, false, 'recordBlock must report a failed persist, not a truthy in-memory lie');
    fs.chmodSync(c.statePath(dir), 0o644);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('WEDGE-1: the hook FAILS OPEN (exit 0) when the block cannot be persisted — no forever-wedge', function () {
  const dir = mkProject();
  try {
    c.startBatch(dir, { label: 'x', total: 1, maxBlocks: 3 });
    fs.chmodSync(c.statePath(dir), 0o444);
    // Root/privileged CI may ignore 0444 (write still succeeds); guard so the assertion
    // only fires where the OS actually denies the write (the real wedge condition).
    let denied = true;
    try { fs.writeFileSync(c.statePath(dir), fs.readFileSync(c.statePath(dir))); denied = false; } catch { /* denied, good */ }
    if (denied) {
      assert.equal(runHook(dir).status, 0, 'an un-persistable block cannot bound the loop → the hook MUST allow the stop');
    }
    fs.chmodSync(c.statePath(dir), 0o644);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('WEDGE-2: a non-positive / non-integer maxBlocks stands down (never an infinite budget)', () => {
  const dir = mkProject();
  try {
    fs.mkdirSync(path.join(dir, '.ctoc', 'state'), { recursive: true });
    for (const bad of [0, -5, undefined, null, 'x', 1.5, NaN]) {
      fs.writeFileSync(c.statePath(dir), JSON.stringify({ active: true, remaining: 5, total: 5, blocks: 999, maxBlocks: bad, label: 'x' }));
      const d = c.shouldContinue(dir);
      assert.equal(d.continue, false, `maxBlocks=${bad} must NOT resolve to an infinite budget`);
      assert.ok(d.exhausted, `maxBlocks=${bad} must stand down as an untrustworthy bound`);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('WEDGE-3: startBatch caps maxBlocks at the hard ceiling regardless of a huge total', () => {
  const dir = mkProject();
  try {
    const st = c.startBatch(dir, { label: 'x', total: 1e15 });
    assert.ok(st.maxBlocks <= 500, `maxBlocks must be capped (<=500), got ${st.maxBlocks}`);
    assert.ok(st.maxBlocks > 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('EDGE: string/NaN numeric fields never block — remaining="0"/NaN/-3 all allow the stop', () => {
  const dir = mkProject();
  try {
    fs.mkdirSync(path.join(dir, '.ctoc', 'state'), { recursive: true });
    for (const bad of ['0', 0, -3, NaN, 'notanumber']) {
      fs.writeFileSync(c.statePath(dir), JSON.stringify({ active: true, remaining: bad, total: 5, blocks: 0, maxBlocks: 20 }));
      assert.equal(c.shouldContinue(dir).continue, false, `remaining=${bad} must allow the stop (never block on an untrustworthy count)`);
    }
    // a valid string remaining still drives the batch (coerced), never crashes
    fs.writeFileSync(c.statePath(dir), JSON.stringify({ active: true, remaining: '5', total: 5, blocks: 0, maxBlocks: 20, label: 'x' }));
    assert.equal(c.shouldContinue(dir).continue, true);
    assert.equal(c.shouldContinue(dir).remaining, 5);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('EDGE: the designed bound terminates in exactly maxBlocks blocks (writable file)', () => {
  const dir = mkProject();
  try {
    c.startBatch(dir, { label: 'x', total: 1, maxBlocks: 4 });
    let i = 0;
    for (; i < 100; i++) {
      if (!c.shouldContinue(dir).continue) break;
      assert.equal(c.recordBlock(dir), true, 'each block persists on a writable file');
    }
    assert.equal(i, 4, `must stand down in exactly maxBlocks=4 iterations, took ${i}`);
    assert.ok(c.shouldContinue(dir).exhausted);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
