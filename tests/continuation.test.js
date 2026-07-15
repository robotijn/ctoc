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
