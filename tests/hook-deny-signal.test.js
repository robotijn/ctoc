/**
 * Unit tests for src/lib/hook-deny-signal.js — the single point of PreToolUse
 * deny-protocol truth (W01-s1, ADR-1).
 *
 * These are pure unit tests: no subprocess, no stdin. They pin the exact shape
 * of the Claude Code PreToolUse deny decision and prove `emitDeny` writes ONLY
 * that JSON and exits HARNESS_BLOCK_EXIT_CODE (2), using injected stream/exit so
 * the test process is never killed.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  HARNESS_BLOCK_EXIT_CODE,
  denyDecision,
  emitDeny,
} = require('../src/lib/hook-deny-signal');

test('denyDecision(reason) returns exactly the documented PreToolUse deny object', () => {
  const d = denyDecision('r');
  assert.deepEqual(d, {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'r',
    },
  });
  // The three load-bearing semantic fields, asserted individually so a shape
  // drift names the exact field that moved.
  assert.equal(d.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(d.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(d.hookSpecificOutput.permissionDecisionReason, 'r');
});

test('emitDeny writes ONLY the deny JSON to the stream and exits HARNESS_BLOCK_EXIT_CODE (2)', () => {
  const chunks = [];
  const stream = { write: (s) => { chunks.push(String(s)); return true; } };
  let exitArg = 'NOT-CALLED';
  const exit = (code) => { exitArg = code; };

  emitDeny('r', { stream, exit });

  // Exactly one JSON payload written — no human banner leaked to this stream.
  const written = chunks.join('');
  const parsed = JSON.parse(written.trim());
  assert.deepEqual(parsed, denyDecision('r'));
  // The emitter exits HARNESS_BLOCK_EXIT_CODE (2) — the harness's hard-block code;
  // the deny JSON on stdout AND the non-zero exit both signal a real block.
  assert.equal(exitArg, HARNESS_BLOCK_EXIT_CODE);
});

test('HARNESS_BLOCK_EXIT_CODE pins the documented harness hard-block exit code (2)', () => {
  assert.equal(HARNESS_BLOCK_EXIT_CODE, 2);
});

test('denyDecision(undefined) yields a non-empty string reason (no undefined leaks)', () => {
  const d = denyDecision(undefined);
  assert.equal(typeof d.hookSpecificOutput.permissionDecisionReason, 'string');
  assert.ok(d.hookSpecificOutput.permissionDecisionReason.length > 0);
  assert.notEqual(d.hookSpecificOutput.permissionDecisionReason, 'undefined');
});
