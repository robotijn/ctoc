'use strict';
/**
 * dispatch-seat-liveness — the dark ranges (plan 00241)
 *
 * Companion to tests/the-dispatch-seat-says-whether-it-is-live.test.js, which is
 * NOT touched by this file and none of whose assertions is weakened. That file
 * pins the module's headline contract (live / not-live / unknown never collapse
 * into two) using real fixtures and the two "a directory sits where the file
 * should be" faults. This file pins what is left: the eight arms that fire only
 * when a filesystem call THROWS, the parse-degradation arm, and the whole of the
 * human-readable description.
 *
 * THE ONE THING EVERY CASE HERE DEFENDS: `unreadable` is not `absent`, and it is
 * not `no-task`. A missing slot store is a successful observation — the check
 * looked and found nothing. A store that cannot be read is a blind instrument —
 * the check could not look. Collapsing the two is this repository's documented
 * false-green defect (a check reporting a verdict on input it never received),
 * and every fault case below fails if a mutation makes that collapse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RANGE MAP. Measured 2026-08-31 by the gated run (`npm test`, node line
 * coverage scoped to src/**): src/lib/dispatch-seat-liveness.js at 89.23 %, the
 * lowest in the library, eleven uncovered ranges. Every one is classified (a)
 * reachable and pinned below; none is (b) permission-gated or terminal-only, and
 * none is (c) dead.
 *
 *   82-83     usableRoot — the catch. A path the filesystem layer refuses (a NUL
 *             byte) is unusable, not a crash.                        case 1
 *   102-103   inspectSlotStore — existsSync throws → unreadable.     case 2
 *   110-111   inspectSlotStore — statSync throws → unreadable.       case 3
 *   118-119   inspectSlotStore — readFileSync throws → unreadable.   case 4
 *   134-137   inspectSlotStore — JSON.parse throws. The verdict stays `present`;
 *             only `detail` degrades. A parse failure must never downgrade the
 *             evidence that the seat ran.                            case 5
 *   175-176   scanLogForTask — existsSync throws → unreadable.       case 6
 *   183-184   scanLogForTask — statSync throws → unreadable.         case 7
 *   192-193   scanLogForTask — readFileSync throws → unreadable.     case 8
 *   275-283   formatAge — the four unit arms and their boundaries.   case 9
 *   303-308   describeLiveness — the `live` branch: it names the instrument and
 *             the age, and says the claim CAN be relied upon; its two internal
 *             fallbacks cover an unrecognised source and a non-finite age.
 *                                                                    case 10
 *   321-322   describeLiveness — an unrecognised result is treated as NOT
 *             established, never as liveness.                         case 11
 *
 * Line numbers move with every commit; the gate's own report is the source of
 * truth. The BEHAVIOUR each case pins does not move.
 *
 * LIVE CALL SITE (confirmed on disk this session): src/lib/iron-loop-enforcer.js
 * registers `dispatch-seat-liveness` as a thorough-mode system check (line 714)
 * and requires both exports at line 753, so `checkAllInvariants` reaches this
 * module. Nothing new is wired by this slice; the file adds tests only.
 *
 * SEAM. Fixtures are real os.tmpdir() directories, removed in afterEach. The
 * eight throw arms are unreachable with a file alone — a fault is injected at
 * the TRUE boundary, the shared `safe-fs` module object the code looks up by
 * property at call time, and every injection is guarded by a path sentinel so
 * only the one instrument under test throws while every other read in the
 * process stays real. `t.mock.method` restores at the end of each test. No
 * function under test is mocked. Case 1 needs no mock at all: a NUL byte in the
 * path is a REAL fault that `safe-fs`'s validatePath rejects by contract, and a
 * real fault is stronger evidence than an injected one.
 *
 * SECURITY. Case 12 converts the module's no-interpolation comment into a
 * checked invariant: a log line carrying a terminal escape sequence and an
 * absolute-looking path must appear in NO byte of the description. No fixture
 * carries a secret; nothing is written outside os.tmpdir(); no shell.
 *
 * AI-authored (Claude) under plan 00241 and read line-by-line. Each case was
 * proven RED by mutating the arm it names in src/lib/dispatch-seat-liveness.js
 * and observing that case — and only that case — fail; the file was restored
 * byte-for-byte (sha256-verified) afterwards.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { seatLiveness, describeLiveness } = require('../src/lib/dispatch-seat-liveness');
const agentSlots = require('../src/lib/agent-slots');
const safeFs = require('../src/lib/safe-fs');

// ── fixture plumbing ────────────────────────────────────────────────────────
const roots = [];
function mkRoot() {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-seat-holes-'));
  roots.push(r);
  return r;
}
function logPath(root) {
  return path.join(root, '.ctoc', 'logs', 'enforcement.json');
}
function writeSlotStore(root, text) {
  const file = agentSlots.slotsPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}
function writeLog(root, lines) {
  const file = logPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return file;
}

/**
 * Make ONE `safe-fs` method throw for ONE path suffix, leaving every other call
 * real. The guard is what makes this safe: an unguarded mock would blind every
 * unrelated read in the process and the case would prove nothing.
 */
function faultOn(t, method, suffix) {
  const real = safeFs[method];
  t.mock.method(safeFs, method, function (...args) {
    if (typeof args[0] === 'string' && args[0].endsWith(suffix)) {
      throw new Error(`injected fault in ${method}`);
    }
    return real.apply(this, args);
  });
}

const SLOTS = 'agent-slots.json';
const LOG = 'enforcement.json';

/** A live-shaped result for the pure description cases. */
function liveResult(evidence) {
  return {
    state: 'live',
    evidence,
    sources: { agentSlots: 'present', enforcementLog: 'no-task' },
    reason: 'slot-store-present',
  };
}

afterEach(() => {
  while (roots.length) {
    const r = roots.pop();
    try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* best-effort temp cleanup */ }
  }
});

// ── the instruments: a fault is "could not look", never "found nothing" ──────
describe('dispatch-seat-liveness — the fault arms report unreadable, never absent', () => {
  // Range 82-83.
  it('(1) an unusable root the filesystem layer refuses is unknown, not a crash and not not-live', () => {
    const bad = path.join(os.tmpdir(), 'ctoc-seat-holes-nul\0dir');
    let r;
    assert.doesNotThrow(() => { r = seatLiveness(bad); }, 'a path safe-fs rejects must not escape as a throw');
    assert.equal(r.state, 'unknown');
    assert.notEqual(r.state, 'not-live', 'a root that could not be examined is not a dead seat');
    assert.equal(r.sources.agentSlots, 'unreadable');
    assert.equal(r.sources.enforcementLog, 'unreadable');
    assert.equal(r.reason, 'instruments-unreadable');
    assert.equal(r.evidence, null);
  });

  // Range 102-103.
  it('(2) the slot store is unreadable — not absent — when its existence cannot be tested', (t) => {
    const root = mkRoot();
    writeLog(root, [JSON.stringify({ timestamp: '2026-08-31T10:00:00.000Z', tool: 'Edit', outcome: 'block' })]);
    faultOn(t, 'existsSync', SLOTS);

    const r = seatLiveness(root);
    assert.equal(r.sources.agentSlots, 'unreadable');
    assert.notEqual(r.sources.agentSlots, 'absent', '"could not look" is not "found nothing"');
    assert.equal(r.sources.enforcementLog, 'no-task', 'only the slot store was faulted');
    assert.equal(r.state, 'unknown');
    assert.notEqual(r.state, 'not-live', 'a readable-but-empty log cannot overrule an unread store');
    assert.equal(r.reason, 'instruments-unreadable');
  });

  // Range 110-111.
  it('(3) the slot store is unreadable when it exists but cannot be stat-ed', (t) => {
    const root = mkRoot();
    writeSlotStore(root, JSON.stringify({ slots: [] }));
    writeLog(root, [JSON.stringify({ timestamp: '2026-08-31T10:00:00.000Z', tool: 'Edit', outcome: 'block' })]);
    faultOn(t, 'statSync', SLOTS);

    const r = seatLiveness(root);
    assert.equal(r.sources.agentSlots, 'unreadable');
    assert.notEqual(r.sources.agentSlots, 'present', 'a store whose stat failed supplies no evidence');
    assert.equal(r.state, 'unknown');
    assert.equal(r.evidence, null, 'a blind instrument yields no evidence object');
  });

  // Range 118-119.
  it('(4) the slot store is unreadable when it exists and stats but cannot be read', (t) => {
    const root = mkRoot();
    writeSlotStore(root, JSON.stringify({ slots: [] }));
    writeLog(root, [JSON.stringify({ timestamp: '2026-08-31T10:00:00.000Z', tool: 'Edit', outcome: 'block' })]);
    faultOn(t, 'readFileSync', SLOTS);

    const r = seatLiveness(root);
    assert.equal(r.sources.agentSlots, 'unreadable');
    assert.notEqual(r.sources.agentSlots, 'present', 'presence is claimed only for a file actually read');
    assert.equal(r.state, 'unknown');
    assert.equal(r.reason, 'instruments-unreadable');
  });

  // Range 134-137 — no mock: a real file of invalid JSON.
  it('(5) an unparseable slot store is still present — the parse enriches the detail, never the verdict', () => {
    const root = mkRoot();
    writeSlotStore(root, '{ this is not json');

    const r = seatLiveness(root);
    assert.equal(r.sources.agentSlots, 'present', 'the readable file itself proves the seat wrote here');
    assert.notEqual(r.sources.agentSlots, 'unreadable', 'the bytes were read; only their meaning was lost');
    assert.equal(r.state, 'live');
    assert.equal(r.reason, 'slot-store-present');
    assert.equal(r.evidence.source, 'agent-slots');
    assert.equal(r.evidence.detail, 'slot store present (unparseable contents)');
  });

  // Range 175-176.
  it('(6) the enforcement log is unreadable — not no-task — when its existence cannot be tested', (t) => {
    const root = mkRoot();
    faultOn(t, 'existsSync', LOG);

    const r = seatLiveness(root);
    assert.equal(r.sources.enforcementLog, 'unreadable');
    assert.notEqual(r.sources.enforcementLog, 'no-task', 'an unread log holds no evidence of emptiness');
    assert.equal(r.sources.agentSlots, 'absent', 'the store really is missing — a successful observation');
    assert.equal(r.state, 'unknown');
    assert.notEqual(r.state, 'not-live');
  });

  // Range 183-184.
  it('(7) the enforcement log is unreadable when it exists but cannot be stat-ed', (t) => {
    const root = mkRoot();
    writeLog(root, [JSON.stringify({ timestamp: '2026-08-31T10:00:00.000Z', tool: 'Task', outcome: 'allow' })]);
    faultOn(t, 'statSync', LOG);

    const r = seatLiveness(root);
    assert.equal(r.sources.enforcementLog, 'unreadable');
    assert.notEqual(r.sources.enforcementLog, 'has-task', 'a log whose stat failed was never scanned');
    assert.equal(r.state, 'unknown');
    assert.equal(r.evidence, null);
  });

  // Range 192-193.
  it('(8) the enforcement log is unreadable when it exists and stats but cannot be read', (t) => {
    const root = mkRoot();
    writeLog(root, [JSON.stringify({ timestamp: '2026-08-31T10:00:00.000Z', tool: 'Task', outcome: 'allow' })]);
    faultOn(t, 'readFileSync', LOG);

    const r = seatLiveness(root);
    assert.equal(r.sources.enforcementLog, 'unreadable');
    assert.notEqual(r.sources.enforcementLog, 'no-task');
    assert.equal(r.state, 'unknown');
    assert.equal(r.reason, 'instruments-unreadable');
  });
});

// ── the description a human actually reads ──────────────────────────────────
describe('dispatch-seat-liveness — describeLiveness', () => {
  // Range 275-283 — every unit arm and both sides of every boundary.
  it('(9) the age is rendered in seconds, minutes, hours then days, at every unit boundary', () => {
    const cases = [
      [-5000, '0s'],           // a clock skew clamps to zero, never a negative age
      [0, '0s'],
      [30 * 1000, '30s'],
      [59 * 1000 + 999, '59s'],
      [60 * 1000, '1m'],
      [90 * 1000, '1m'],
      [59 * 60 * 1000 + 59999, '59m'],
      [60 * 60 * 1000, '1h'],
      [5400 * 1000, '1h'],
      [23 * 3600 * 1000 + 3599999, '23h'],
      [24 * 3600 * 1000, '1d'],
      [200000000, '2d'],
    ];
    for (const [ageMs, expected] of cases) {
      const text = describeLiveness(liveResult({ source: 'agent-slots', at: '2026-08-31T10:00:00.000Z', ageMs, detail: 'x' }));
      assert.ok(
        text.includes(`${expected} old`),
        `ageMs ${ageMs} must render as "${expected} old"; got: ${text}`
      );
    }
  });

  // Range 303-308.
  it('(10) the live description names the instrument and the age and says the claim CAN be relied upon', () => {
    const text = describeLiveness(liveResult({
      source: 'enforcement-log', at: '2026-08-31T10:00:00.000Z', ageMs: 45 * 1000, detail: 'Task-tool enforcement entry',
    }));
    assert.match(text, /LIVE/);
    assert.ok(text.includes('enforcement-log'), 'the description must name which instrument saw the seat');
    assert.ok(text.includes('45s old'), 'the description must state how old the evidence is');
    assert.ok(text.includes('can be relied upon'), 'the live consequence must be stated');
    assert.ok(!text.includes('CANNOT be relied upon'), 'a live seat must never carry the negative consequence');
    assert.ok(text.includes('agent-slots=present, enforcement-log=no-task'), 'the instrument statuses are always reported');
  });

  it('(10b) an unrecognised evidence source and a non-finite age degrade to fixed words, never to invented ones', () => {
    const unknownSource = describeLiveness(liveResult({ source: 'somewhere-else', at: 'x', ageMs: 1000, detail: 'x' }));
    assert.ok(unknownSource.includes('an instrument'), 'an unrecognised source is named generically');
    assert.ok(!unknownSource.includes('somewhere-else'), 'an unrecognised source value is never echoed');

    const noAge = describeLiveness(liveResult({ source: 'agent-slots', at: 'x', ageMs: NaN, detail: 'x' }));
    assert.ok(noAge.includes('age unknown'), 'a non-finite age is reported unknown, not rendered as a number');
    assert.ok(!/NaN|Infinity/.test(noAge), 'no non-finite value ever reaches the human');

    const noEvidence = describeLiveness({
      state: 'live', evidence: null,
      sources: { agentSlots: 'present', enforcementLog: 'no-task' }, reason: 'slot-store-present',
    });
    assert.ok(noEvidence.includes('an instrument'), 'a live result with no evidence still describes generically');
    assert.ok(noEvidence.includes('age unknown'));
  });

  // Range 321-322.
  it('(11) an unrecognised result is treated as NOT established — it never claims liveness', () => {
    const text = describeLiveness({
      state: 'wedged', evidence: null,
      sources: { agentSlots: 'absent', enforcementLog: 'no-task' }, reason: 'whatever',
    });
    assert.ok(text.includes('could not be described'), 'the fallback says plainly that it could not describe the result');
    assert.ok(text.includes('treated as not established'));
    assert.ok(text.includes('CANNOT be relied upon'), 'an undescribable result must never license a dispatch-seated claim');
    assert.ok(!text.includes('is LIVE'), 'the fallback must never read as liveness');
  });

  // SECURITY — the module's no-interpolation comment, made checkable.
  it('(12) no log content, path or escape sequence reaches the description', () => {
    const root = mkRoot();
    const hostile = '\u001b[31mHOSTILE\u001b[0m /Users/someone/secret/path';
    writeLog(root, [JSON.stringify({
      timestamp: hostile, tool: 'Task', outcome: 'allow', target: hostile, subagent: hostile,
    })]);

    const r = seatLiveness(root);
    assert.equal(r.state, 'live');
    const text = describeLiveness(r);
    assert.ok(!text.includes('HOSTILE'), 'log content must never be interpolated into the description');
    assert.ok(!text.includes('\u001b'), 'no terminal escape sequence may reach the terminal');
    assert.ok(!text.includes('/Users/'), 'no absolute path may reach the description');
    assert.ok(!text.includes(root), 'the project root itself is never echoed');
  });
});
