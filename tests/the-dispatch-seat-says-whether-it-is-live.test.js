'use strict';
/**
 * Plan 00165 — "Nothing proves the dispatch hook ever runs."
 *
 * The dispatch-seat liveness module answers ONE question honestly: has CTOC's
 * dispatch seat produced evidence of running in this project? The three answers —
 * `live`, `not-live`, `unknown` — must NEVER collapse into two. `unknown` (the
 * instruments could not be read) is the whole point: a check that reported
 * "not live" when it simply could not open the file would be this repository's own
 * false-green defect. `unknown` is a loud state, never a quiet pass.
 *
 * Fixtures are real `os.tmpdir()` directories, `path.join` throughout, recursive-force
 * cleanup, no shell. The slot-store fixture is minted by the REAL `agent-slots.acquire`,
 * never hand-written JSON — a hand-built fixture drifts from the schema the moment the
 * schema moves.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  seatLiveness,
  describeLiveness,
} = require('../src/lib/dispatch-seat-liveness');
const agentSlots = require('../src/lib/agent-slots');
const { checkAllInvariants } = require('../src/lib/iron-loop-enforcer');

// ── fixture plumbing ────────────────────────────────────────────────────────
const roots = [];
function mkRoot() {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-seat-'));
  roots.push(r);
  return r;
}
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}
function statePath(root) {
  return path.join(root, '.ctoc', 'state');
}
function logPath(root) {
  return path.join(root, '.ctoc', 'logs', 'enforcement.json');
}
function writeLog(root, lines) {
  const dir = path.join(root, '.ctoc', 'logs');
  ensureDir(dir);
  fs.writeFileSync(logPath(root), lines.join('\n') + '\n');
}
/** A compact enforcement-log line, matching the on-disk NDJSON (no spaces after colons). */
function line(obj) {
  return JSON.stringify(obj);
}

afterEach(() => {
  while (roots.length) {
    const r = roots.pop();
    try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* best-effort temp cleanup */ }
  }
});

// ── the fifteen cases ───────────────────────────────────────────────────────
describe('dispatch-seat-liveness — seatLiveness', () => {
  // Case 1 — the measured reality: state dir with tasks.json only, log with no Task line.
  it('(1) reports not-live when both instruments are readable and empty of Task evidence', () => {
    const root = mkRoot();
    ensureDir(statePath(root));
    fs.writeFileSync(path.join(statePath(root), 'tasks.json'), '{"tasks":[]}');
    writeLog(root, [line({ timestamp: '2026-07-20T10:00:00.000Z', tool: 'Edit', outcome: 'block' })]);

    const r = seatLiveness(root);
    assert.equal(r.state, 'not-live');
    assert.equal(r.sources.agentSlots, 'absent');
    assert.equal(r.sources.enforcementLog, 'no-task');
  });

  // Case 2 — the seat ran: a real acquire() against the fixture root.
  it('(2) reports live from a real agent-slots acquire', () => {
    const root = mkRoot();
    const res = agentSlots.acquire(root, { label: 'iron-loop-executor' });
    assert.equal(res.ok, true, 'the fixture acquire must succeed');

    const r = seatLiveness(root);
    assert.equal(r.state, 'live');
    assert.equal(r.evidence.source, 'agent-slots');
  });

  // Case 3 — a released slot still proves the seat ran: acquire then release.
  it('(3) reports live from a slot store that survives a release with an empty array', () => {
    const root = mkRoot();
    agentSlots.acquire(root, { label: 'x' });
    agentSlots.release(root);           // leaves the file behind with an empty slots array
    assert.equal(fs.existsSync(agentSlots.slotsPath(root)), true, 'the store must survive the release');

    const r = seatLiveness(root);
    assert.equal(r.state, 'live', 'the file surviving with an empty array is itself evidence');
    assert.equal(r.evidence.source, 'agent-slots');
  });

  // Case 4 — the log alone can carry it: no slot store, one line with a Task tool.
  it('(4) reports live from a Task-tool enforcement-log entry alone', () => {
    const root = mkRoot();
    writeLog(root, [line({ timestamp: '2026-07-20T10:00:00.000Z', tool: 'Task', subagent: 'iron-loop-executor', outcome: 'allow' })]);

    const r = seatLiveness(root);
    assert.equal(r.state, 'live');
    assert.equal(r.evidence.source, 'enforcement-log');
  });

  // Case 5 — the subagent key alone carries it: a subagent field with a non-Task tool.
  it('(5) reports live from a line carrying a subagent field even with a non-Task tool', () => {
    const root = mkRoot();
    writeLog(root, [line({ timestamp: '2026-07-20T10:00:00.000Z', tool: 'Edit', subagent: 'some-agent', outcome: 'allow' })]);

    const r = seatLiveness(root);
    assert.equal(r.state, 'live');
    assert.equal(r.evidence.source, 'enforcement-log');
  });

  // Case 6 — THE FENCE: slot store and log both unreadable (a directory in each place).
  it('(6) reports unknown (never not-live) when BOTH instruments are unreadable', () => {
    const root = mkRoot();
    ensureDir(agentSlots.slotsPath(root));  // a directory where the store file should be
    ensureDir(logPath(root));               // a directory where the log file should be

    const r = seatLiveness(root);
    assert.equal(r.state, 'unknown');
    assert.notEqual(r.state, 'not-live');
    assert.equal(r.sources.agentSlots, 'unreadable');
    assert.equal(r.sources.enforcementLog, 'unreadable');
  });

  // Case 7 — half-blind is still unknown-free: slot store unreadable, log has a Task line.
  it('(7) reports live when the slot store is blind but the log carries positive Task evidence', () => {
    const root = mkRoot();
    ensureDir(agentSlots.slotsPath(root));  // slot store unreadable
    writeLog(root, [line({ timestamp: '2026-07-20T10:00:00.000Z', tool: 'Task', outcome: 'allow' })]);

    const r = seatLiveness(root);
    assert.equal(r.state, 'live', 'one blind instrument must not erase another positive');
    assert.equal(r.sources.agentSlots, 'unreadable');
  });

  // Case 8 — half-blind with no positive evidence: slot unreadable, log readable-and-empty.
  it('(8) reports unknown when the slot store is blind and the log is readable but empty', () => {
    const root = mkRoot();
    ensureDir(agentSlots.slotsPath(root));  // slot store unreadable
    writeLog(root, [line({ timestamp: '2026-07-20T10:00:00.000Z', tool: 'Edit', outcome: 'block' })]);

    const r = seatLiveness(root);
    assert.equal(r.state, 'unknown', 'a readable-but-empty instrument cannot overrule an unread one');
  });

  // Case 9 — a corrupt log line does not blind the scan: one malformed line + one valid Task line.
  it('(9) reports live when a malformed log line precedes a valid Task line', () => {
    const root = mkRoot();
    writeLog(root, [
      '{ this is not json',
      line({ timestamp: '2026-07-20T10:00:00.000Z', tool: 'Task', outcome: 'allow' }),
    ]);

    const r = seatLiveness(root);
    assert.equal(r.state, 'live', 'a single malformed line is counted, not fatal');
    assert.equal(r.evidence.source, 'enforcement-log');
  });

  // Case 10 — every line malformed: the source is unreadable, never no-task.
  it('(10) reports the enforcement log unreadable (not no-task) when every line is malformed', () => {
    const root = mkRoot();
    writeLog(root, ['{ nope', 'also } not json']);

    const r = seatLiveness(root);
    assert.equal(r.sources.enforcementLog, 'unreadable');
  });

  // Case 11 — age is reported and injectable: opts.now set past the fixture's stamp.
  it('(11) reports evidence.ageMs against the injected clock without sleeping', () => {
    const root = mkRoot();
    const stamp = '2026-07-01T00:00:00.000Z';
    writeLog(root, [line({ timestamp: stamp, tool: 'Task', outcome: 'allow' })]);
    const now = Date.parse(stamp) + 123456;

    const r = seatLiveness(root, { now });
    assert.equal(r.state, 'live');
    assert.equal(r.evidence.ageMs, 123456);
  });

  // Case 12 — never throws: a root that is a file, an empty string, and null.
  it('(12) never throws and reports unknown for an unusable root (file, empty string, null)', () => {
    const fileRoot = path.join(mkRoot(), 'a-file.txt');
    fs.writeFileSync(fileRoot, 'not a directory');
    for (const bad of [fileRoot, '', null]) {
      let r;
      assert.doesNotThrow(() => { r = seatLiveness(/** @type {any} */ (bad)); }, `seatLiveness(${JSON.stringify(bad)}) must not throw`);
      assert.equal(r.state, 'unknown', `seatLiveness(${JSON.stringify(bad)}) must report unknown`);
    }
  });
});

describe('dispatch-seat-liveness — describeLiveness', () => {
  // Case 13 — the description names the consequence for not-live and unknown, and the
  // two messages DIFFER from each other.
  it('(13) names the consequence for not-live and unknown, with distinct messages', () => {
    const notLive = mkRoot();
    ensureDir(statePath(notLive));
    writeLog(notLive, [line({ timestamp: '2026-07-20T10:00:00.000Z', tool: 'Edit', outcome: 'block' })]);
    const unknown = mkRoot();
    ensureDir(agentSlots.slotsPath(unknown));
    ensureDir(logPath(unknown));

    const notLiveText = describeLiveness(seatLiveness(notLive));
    const unknownText = describeLiveness(seatLiveness(unknown));

    for (const text of [notLiveText, unknownText]) {
      assert.match(text, /cannot be relied upon/i, 'each must name the consequence');
      assert.match(text, /00166/, 'each must name the gated plan that cannot be trusted to have fired');
    }
    assert.notEqual(notLiveText, unknownText, 'the not-live and unknown messages must differ');
  });
});

describe('dispatch-seat-liveness — enforcer wiring', () => {
  function findingFor(root) {
    const result = checkAllInvariants({ root, mode: 'thorough', scopes: ['system'] });
    return result.findings.find((f) => f.id === 'dispatch-seat-liveness');
  }

  // Case 14 — the registered check fails for not-live AND unknown, with different
  // messages (and, pinning the mapping, different severities).
  it('(14) the registered enforcer check fails on both bad states with different messages', () => {
    const notLive = mkRoot();
    ensureDir(statePath(notLive));
    writeLog(notLive, [line({ timestamp: '2026-07-20T10:00:00.000Z', tool: 'Edit', outcome: 'block' })]);
    const unknown = mkRoot();
    ensureDir(agentSlots.slotsPath(unknown));
    ensureDir(logPath(unknown));

    const nf = findingFor(notLive);
    const uf = findingFor(unknown);

    assert.ok(nf, 'not-live must produce a finding');
    assert.ok(uf, 'unknown must produce a finding');
    assert.equal(nf.severity, 'warn', 'not-live is drift a human must see');
    assert.equal(uf.severity, 'block', 'unknown — could-not-read — must fail hard, never a quiet pass');
    assert.notEqual(nf.message, uf.message, 'the two failure messages must differ');
  });

  // Case 15 — the fence is not vacuous: case 1's assertion applied to case 2's fixture
  // FAILS, proving case 1 discriminates on real evidence rather than matching anything.
  it('(15) the not-live verdict is not vacuous — a live fixture is never reported not-live', () => {
    const root = mkRoot();
    agentSlots.acquire(root, { label: 'x' });

    const r = seatLiveness(root);
    assert.notEqual(r.state, 'not-live', 'a fixture with real slot evidence must not read not-live');
    assert.equal(r.state, 'live');
  });
});
