'use strict';

/**
 * Durable watchdog — resume a stalled autonomous run on the NEXT session open
 * (plan 00231, the buildable "resume-on-session-open" subset).
 *
 * The Stop gate (continuation.js + stop-continuation-gate.js) keeps a batch going
 * while the session is ALIVE. It cannot fire when the session is idle, rate-limited,
 * or closed — exactly the "ran out of tokens" gap. This watchdog closes it: when the
 * human OPENS A NEW SESSION, an unfinished, fork-free batch that has not advanced for
 * longer than the stall threshold is auto-resumed from where it stalled.
 *
 * Two pure functions carry the decision (resume-watchdog.js), continuation.js stamps
 * `lastAdvanceMs` so staleness is measurable, and SessionStart.js injects the resume
 * directive on start — the ONE reachable entry path. Nothing mocked; real temp-dir
 * state and a real spawn of the SessionStart hook for the reachability proof.
 *
 *   shouldResume(state, now, opts) → { resume, reason }
 *     resume:true  ONLY for an active, fork-free batch with remaining>0 whose
 *                  lastAdvanceMs is older than the stall threshold (default 90 min).
 *     resume:false for: no/malformed state, inactive, forked, complete, no timestamp,
 *                  a fresh advance — and it NEVER throws (fail-open).
 *   resumeDirective(state) → the "drive the next unit" text, naming the batch LABEL
 *     and remaining COUNT in the human's terms, with NO plan number and NO path.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const w = require('../src/lib/resume-watchdog');
const c = require('../src/lib/continuation');
const sessionStart = require('../src/hooks/SessionStart');

const MIN = 60 * 1000;
const SESSION_START_HOOK = path.join(__dirname, '..', 'src', 'hooks', 'SessionStart.js');

function mkProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-resume-'));
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  return dir;
}

/** Build a batch-state object; overrides win. */
function batch(overrides = {}) {
  return {
    active: true,
    label: 'nightly repair sweep',
    total: 5,
    remaining: 3,
    forkPending: false,
    forkReason: null,
    blocks: 0,
    maxBlocks: 40,
    lastAdvanceMs: 1000,
    ...overrides,
  };
}

// ── shouldResume: the resume verdict ────────────────────────────────────────────

test('a stalled active batch (no advance for > threshold) → resume TRUE', () => {
  const now = 200 * MIN;
  const st = batch({ lastAdvanceMs: now - 100 * MIN }); // 100 min > 90 min default
  const d = w.shouldResume(st, now);
  assert.equal(d.resume, true);
  assert.match(d.reason, /stalled/);
});

test('a fresh-advance batch (within threshold) → resume FALSE', () => {
  const now = 200 * MIN;
  const st = batch({ lastAdvanceMs: now - 10 * MIN }); // 10 min < 90 min
  const d = w.shouldResume(st, now);
  assert.equal(d.resume, false);
  assert.match(d.reason, /recently/);
});

test('exactly AT the threshold is not yet stalled → resume FALSE (boundary is inclusive-fresh)', () => {
  const now = 200 * MIN;
  const st = batch({ lastAdvanceMs: now - 90 * MIN }); // exactly 90 min
  assert.equal(w.shouldResume(st, now).resume, false);
});

test('a registered FORK blocks resume → resume FALSE (the human owns that decision)', () => {
  const now = 200 * MIN;
  const st = batch({ forkPending: true, lastAdvanceMs: now - 100 * MIN });
  const d = w.shouldResume(st, now);
  assert.equal(d.resume, false);
  assert.match(d.reason, /fork/);
});

test('a complete batch (remaining 0) → resume FALSE', () => {
  const now = 200 * MIN;
  const st = batch({ remaining: 0, active: false, lastAdvanceMs: now - 100 * MIN });
  const d = w.shouldResume(st, now);
  assert.equal(d.resume, false);
});

test('an inactive batch (active:false, remaining>0) → resume FALSE', () => {
  const now = 200 * MIN;
  const st = batch({ active: false, lastAdvanceMs: now - 100 * MIN });
  assert.equal(w.shouldResume(st, now).resume, false);
});

test('a non-finite / non-positive remaining → resume FALSE (batch complete)', () => {
  const now = 200 * MIN;
  for (const bad of [0, -2, NaN, 'x', undefined]) {
    const st = batch({ remaining: bad, lastAdvanceMs: now - 100 * MIN });
    assert.equal(w.shouldResume(st, now).resume, false, `remaining=${bad} must not resume`);
  }
});

test('a missing / non-finite lastAdvanceMs → resume FALSE (no timestamp to measure staleness)', () => {
  const now = 200 * MIN;
  for (const bad of [undefined, null, 'nope', NaN]) {
    const st = batch({ lastAdvanceMs: bad });
    const d = w.shouldResume(st, now);
    assert.equal(d.resume, false, `lastAdvanceMs=${bad} must not resume`);
    assert.match(d.reason, /timestamp|staleness/i);
  }
});

test('a non-finite nowMs → resume FALSE (invalid clock, fail-open)', () => {
  const st = batch({ lastAdvanceMs: 1000 });
  for (const bad of [undefined, null, NaN, 'now']) {
    assert.equal(w.shouldResume(st, bad).resume, false, `nowMs=${bad} must not resume`);
  }
});

test('malformed / missing state → resume FALSE, NEVER throws (fail-open)', () => {
  for (const bad of [null, undefined, 0, '', 'str', 42, true, []]) {
    assert.doesNotThrow(() => w.shouldResume(bad, Date.now()));
    assert.equal(w.shouldResume(bad, Date.now()).resume, false, `state=${JSON.stringify(bad)} must not resume`);
  }
});

test('a state object that throws on property access → resume FALSE, never propagates (fail-open catch)', () => {
  const evil = {};
  Object.defineProperty(evil, 'active', { get() { throw new Error('boom'); } });
  assert.doesNotThrow(() => w.shouldResume(evil, Date.now()));
  assert.equal(w.shouldResume(evil, Date.now()).resume, false);
});

test('opts.stallMinutes overrides the default (1-min threshold makes a 5-min-idle batch stalled)', () => {
  const now = 200 * MIN;
  const st = batch({ lastAdvanceMs: now - 5 * MIN }); // 5 min idle
  assert.equal(w.shouldResume(st, now).resume, false, 'default 90 min → not stalled at 5 min');
  assert.equal(w.shouldResume(st, now, { stallMinutes: 1 }).resume, true, '1-min threshold → stalled at 5 min');
});

test('an invalid opts.stallMinutes falls back to the 90-min default', () => {
  const now = 200 * MIN;
  const st = batch({ lastAdvanceMs: now - 100 * MIN });
  for (const bad of [0, -5, NaN, 'x', null, undefined]) {
    assert.equal(w.shouldResume(st, now, { stallMinutes: bad }).resume, true,
      `stallMinutes=${bad} must fall back to 90 → 100-min idle is stalled`);
  }
});

// ── resumeDirective: the injected text ──────────────────────────────────────────

test('resumeDirective names the batch LABEL and the remaining COUNT in human terms', () => {
  const text = w.resumeDirective(batch({ label: 'nightly repair sweep', remaining: 4 }));
  assert.match(text, /nightly repair sweep/, 'the batch label is named');
  assert.match(text, /\b4\b/, 'the remaining count is named');
  assert.match(text, /resume|drive|continue|pick up/i, 'it instructs to keep going');
});

test('resumeDirective carries NO plan number, NO gate number, and NO filesystem path', () => {
  const text = w.resumeDirective(batch({ label: 'nightly repair sweep', remaining: 3 }));
  assert.doesNotMatch(text, /\d{4,}/, 'no plan number (00231-style) appears');
  assert.doesNotMatch(text, /[/\\]/, 'no filesystem path separator appears');
  assert.doesNotMatch(text, /\bGate\s*\d\b/i, 'no gate number appears');
});

test('resumeDirective is fail-open on malformed state (falls back, never throws)', () => {
  for (const bad of [null, undefined, 42, 'x', {}]) {
    assert.doesNotThrow(() => w.resumeDirective(bad));
  }
  const text = w.resumeDirective({}); // no label / no remaining → generic fallbacks
  assert.match(text, /batch/i);
});

test('resumeDirective survives a state that throws on property access (fail-open → empty)', () => {
  const evil = {};
  Object.defineProperty(evil, 'label', { get() { throw new Error('boom'); } });
  assert.doesNotThrow(() => w.resumeDirective(evil));
  assert.equal(w.resumeDirective(evil), '');
});

// ── continuation.js stamps lastAdvanceMs (the staleness clock) ───────────────────

test('startBatch stamps an initial lastAdvanceMs', () => {
  const dir = mkProject();
  try {
    const before = Date.now();
    const st = c.startBatch(dir, { label: 'x', total: 3 });
    assert.ok(Number.isFinite(st.lastAdvanceMs), 'startBatch stamps a numeric lastAdvanceMs');
    assert.ok(st.lastAdvanceMs >= before, 'the stamp is a real clock read');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('advance re-stamps lastAdvanceMs to the moment of progress', async () => {
  const dir = mkProject();
  try {
    const st0 = c.startBatch(dir, { label: 'x', total: 3 });
    await new Promise((r) => setTimeout(r, 5));
    const st1 = c.advance(dir);
    assert.ok(Number.isFinite(st1.lastAdvanceMs));
    assert.ok(st1.lastAdvanceMs >= st0.lastAdvanceMs, 'advance moves the staleness clock forward');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── SessionStart wiring: the ONE reachable entry path (end-to-end) ───────────────

test('SessionStart.resumeInjection emits the directive for a STALLED batch on disk', () => {
  const dir = mkProject();
  try {
    c.startBatch(dir, { label: 'overnight test-repair run', total: 6 });
    // Backdate the staleness clock past the 90-min default.
    const st = c.status(dir);
    st.lastAdvanceMs = Date.now() - 120 * MIN;
    c.write(dir, st);
    const out = sessionStart.resumeInjection(dir);
    assert.ok(out && out.length > 0, 'a stalled batch produces a resume directive');
    assert.match(out, /overnight test-repair run/, 'the human-named batch label is injected');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('SessionStart.resumeInjection emits NOTHING when there is no batch (quiet start)', () => {
  const dir = mkProject();
  try {
    assert.equal(sessionStart.resumeInjection(dir), '');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('SessionStart.resumeInjection emits NOTHING for a fresh-advance batch (quiet start)', () => {
  const dir = mkProject();
  try {
    c.startBatch(dir, { label: 'x', total: 4 }); // just advanced → fresh
    assert.equal(sessionStart.resumeInjection(dir), '');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('SessionStart.resumeInjection honours .ctoc/settings.json continuation.stallMinutes', () => {
  const dir = mkProject();
  try {
    fs.writeFileSync(
      path.join(dir, '.ctoc', 'settings.json'),
      JSON.stringify({ continuation: { stallMinutes: 1 } })
    );
    c.startBatch(dir, { label: 'quick sweep', total: 3 });
    const st = c.status(dir);
    st.lastAdvanceMs = Date.now() - 5 * MIN; // 5 min idle: fresh at 90, stalled at 1
    c.write(dir, st);
    assert.ok(sessionStart.resumeInjection(dir).length > 0,
      'a 1-min configured threshold resumes a 5-min-idle batch');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('SessionStart.resumeInjection ignores an unreadable / invalid settings.json (default 90 holds)', () => {
  const dir = mkProject();
  try {
    fs.writeFileSync(path.join(dir, '.ctoc', 'settings.json'), '{ not json');
    c.startBatch(dir, { label: 'x', total: 3 });
    const st = c.status(dir);
    st.lastAdvanceMs = Date.now() - 5 * MIN; // 5 min idle, default 90 → not stalled
    c.write(dir, st);
    assert.equal(sessionStart.resumeInjection(dir), '', 'a broken settings file falls back to the 90-min default');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('SessionStart.resumeInjection is suppressed by CTOC_SKIP_CONTINUATION=1 (the kill-switch)', () => {
  const dir = mkProject();
  try {
    c.startBatch(dir, { label: 'x', total: 6 });
    const st = c.status(dir);
    st.lastAdvanceMs = Date.now() - 120 * MIN; // stalled
    c.write(dir, st);
    const prev = process.env.CTOC_SKIP_CONTINUATION;
    process.env.CTOC_SKIP_CONTINUATION = '1';
    try {
      assert.equal(sessionStart.resumeInjection(dir), '', 'the kill-switch disarms the resume injection');
    } finally {
      if (prev === undefined) delete process.env.CTOC_SKIP_CONTINUATION;
      else process.env.CTOC_SKIP_CONTINUATION = prev;
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('SessionStart.resumeInjection fail-open on a bad projectPath → empty string', () => {
  assert.equal(sessionStart.resumeInjection(''), '');
  assert.equal(sessionStart.resumeInjection(null), '');
});

test('reachability proof: spawning the SessionStart hook prints the resume directive to stdout for a stalled batch', () => {
  const dir = mkProject();
  try {
    c.startBatch(dir, { label: 'overnight test-repair run', total: 6 });
    const st = c.status(dir);
    st.lastAdvanceMs = Date.now() - 120 * MIN;
    c.write(dir, st);
    const r = spawnSync(process.execPath, [SESSION_START_HOOK], {
      cwd: dir, encoding: 'utf8', env: { ...process.env },
    });
    assert.equal(r.status, 0, 'the hook runs cleanly');
    assert.match(r.stdout, /overnight test-repair run/, 'the resume directive reaches real stdout — the injection is wired');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
