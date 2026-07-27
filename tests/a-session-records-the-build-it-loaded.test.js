/**
 * A session records which build of CTOC it is actually running (plan 00171).
 *
 * The second half of the finding in plan 00170. `00170` reports honestly when
 * edits are happening that no hook recorded; it cannot say WHETHER the hook
 * system is running at all. This slice adds the one missing observable — a
 * beacon the `PostToolUse` `*` hook writes on every tool call — and lets the
 * liveness reader separate "the hooks are not running" (restart) from "the hooks
 * ARE running but enforcement specifically is not recording" (a fault to report).
 *
 * TWO SUBJECTS UNDER TEST, cut along verification lines:
 *   - the WRITER:  `writeBeacon` in src/hooks/PostToolUse.status-check.js
 *                  (cases 1-5). Cases 4-5 drive the hook as a real child process,
 *                  the true boundary (process control + filesystem), matching the
 *                  sibling suites tests/hooks-remaining.test.js and
 *                  tests/posttooluse-status-check-coverage.test.js.
 *   - the READER:  the `beacon` source in src/lib/enforcement-liveness.js
 *                  (cases 6-13). Fixtures are minted by CALLING `writeBeacon`
 *                  against a fixture root — never by hand-writing the record — and
 *                  the beacon's time is moved with fs.utimesSync, so no test sleeps.
 *
 * THE LOAD-BEARING CASES, named so a later reader cannot quietly remove them:
 *   - case 8  an ABSENT beacon is `'absent'`, never `'stale'`. For an unbounded
 *             period after this lands, every running session has no beacon.
 *   - case 9  an absent beacon NEVER downgrades 00170's verdict. Expected GREEN
 *             from the first run — it is the 00170 dependency check.
 *   - case 11 a beacon from a DIFFERENT build is still fresh: this slice draws no
 *             conclusion from a version mismatch.
 *   - case 13 the vacuity guard: case 8's assertion applied to a fresh-beacon
 *             fixture must FAIL.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const version = require('../src/lib/version');
const liveness = require('../src/lib/enforcement-liveness');
const enforcementLog = require('../src/lib/enforcement-log');
const hook = require('../src/hooks/PostToolUse.status-check');

const HOOK_PATH = path.join(__dirname, '..', 'src', 'hooks', 'PostToolUse.status-check.js');

/**
 * The beacon's on-disk location under a project root.
 * @param {string} root - project root
 * @returns {string} absolute beacon path
 */
function beaconPath(root) {
  return path.join(root, '.ctoc', 'state', 'hook-beacon.json');
}

/**
 * Create a throwaway project root that already carries the `.ctoc` marker a real
 * initialised project has (mirrors tests/the-edit-protection-says-whether-it-is-running).
 * @returns {string} absolute path to a fresh temp directory
 */
function makeRoot() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-beacon-')));
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  return dir;
}

/**
 * Remove a fixture root, tolerating a partially-built tree.
 * @param {string} root - fixture root
 */
function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* already gone */ }
}

/**
 * Write a plan into a stage directory declaring `files:`, and create each declared
 * file so it can be stat'd. Returns the absolute declared paths.
 * @param {string} root - fixture root
 * @param {string} stage - plan stage directory name
 * @param {string} name - plan file base name
 * @param {string[]} files - repository-relative declared paths
 * @returns {string[]} absolute paths of the created declared files
 */
function writePlan(root, stage, name, files) {
  const stageDir = path.join(root, 'plans', stage);
  fs.mkdirSync(stageDir, { recursive: true });
  const body = ['---', 'title: "fixture"', 'files:']
    .concat(files.map((f) => `  - "${f}"`))
    .concat(['---', '', '# fixture', ''])
    .join('\n');
  fs.writeFileSync(path.join(stageDir, `${name}.md`), body, 'utf8');
  const made = [];
  for (const f of files) {
    const abs = path.join(root, f);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, 'x', 'utf8');
    made.push(abs);
  }
  return made;
}

/**
 * Write one pending "working" agent status file so the hook has something to
 * report — used to prove the beacon is strictly ADDITIVE (case 4) and that a bare
 * import runs nothing (case 5).
 * @param {string} root - fixture root
 * @param {string} stage - agent stage directory
 * @param {string} planName - plan base name (without .status)
 */
function writePendingAgent(root, stage, planName) {
  const stageDir = path.join(root, 'plans', stage);
  fs.mkdirSync(stageDir, { recursive: true });
  fs.writeFileSync(
    path.join(stageDir, `${planName}.status`),
    JSON.stringify({ agent: 'critic', status: 'working', started: new Date().toISOString(), message: 'do X' }),
    'utf8'
  );
}

/**
 * Append one real enforcement decision; return its timestamp in milliseconds.
 * @param {string} root - fixture root
 * @returns {number} the entry timestamp, in milliseconds
 */
function mintDecision(root) {
  const entry = enforcementLog.logEnforcement(
    { decision: 'allow', target_file: path.join(root, 'src', 'fixture.js'), tool: 'Edit' },
    root
  );
  return Date.parse(entry.timestamp);
}

/**
 * Set a file's modification time to an absolute instant.
 * @param {string} abs - absolute file path
 * @param {number} whenMs - the modification time, in milliseconds
 */
function setMtime(abs, whenMs) {
  const secs = whenMs / 1000;
  fs.utimesSync(abs, secs, secs);
}

/**
 * Flatten a description's lines into one searchable string.
 * @param {object} described - a describeProtection result
 * @returns {string} the joined text
 */
function textOf(described) {
  return described.lines.join(' ');
}

/**
 * A case-1-of-00170 fixture: a log whose newest entry predates several declared
 * files, so the verdict is `not-recording` at high confidence. The beacon is
 * layered on top per-case.
 * @param {string} root - fixture root
 * @returns {number} the decision timestamp, in milliseconds
 */
function unrecordedEditsFixture(root) {
  const files = writePlan(root, 'todo', '00001-busy', ['src/a.js', 'src/b.js', 'src/c.js']);
  const t = mintDecision(root);
  for (const f of files) setMtime(f, t + 10_000);
  return t;
}

// ── cases 1-5: the WRITER ────────────────────────────────────────────────────

test('case 1 — the beacon records the executing build', () => {
  const root = makeRoot();
  try {
    hook.writeBeacon(root);
    const rec = JSON.parse(fs.readFileSync(beaconPath(root), 'utf8'));
    assert.equal(rec.version, version.getVersion(), 'the beacon records the build actually executing');
    assert.ok(!Number.isNaN(Date.parse(rec.at)), `\`at\` must be a parseable ISO time, got ${rec.at}`);
    assert.equal(typeof rec.pid, 'number');
    assert.ok(Number.isFinite(rec.pid));
  } finally {
    cleanup(root);
  }
});

test('case 2 — it overwrites, never grows', () => {
  const root = makeRoot();
  try {
    hook.writeBeacon(root);
    hook.writeBeacon(root);
    hook.writeBeacon(root);
    const raw = fs.readFileSync(beaconPath(root), 'utf8');
    const rec = JSON.parse(raw); // parses as ONE object, not an array or a concatenation
    assert.ok(rec && typeof rec === 'object' && !Array.isArray(rec), 'the beacon holds exactly one record');
    assert.equal((raw.match(/"pid"/g) || []).length, 1, 'three writes leave exactly one record — it overwrites');
    assert.ok(!Number.isNaN(Date.parse(rec.at)));
  } finally {
    cleanup(root);
  }
});

test('case 3 — it is written synchronously', () => {
  const root = makeRoot();
  try {
    const ret = hook.writeBeacon(root);
    assert.ok(!ret || typeof ret.then !== 'function', 'writeBeacon must be synchronous, not return a promise');
    // Readable IMMEDIATELY on return, with no await and no timer.
    assert.ok(fs.existsSync(beaconPath(root)), 'the beacon is on disk the instant writeBeacon returns');
    const rec = JSON.parse(fs.readFileSync(beaconPath(root), 'utf8'));
    assert.equal(rec.version, version.getVersion());
  } finally {
    cleanup(root);
  }
});

test('case 4 — a beacon fault cannot break the hook', () => {
  const root = makeRoot();
  try {
    // A pending agent so the hook has real output to produce.
    writePendingAgent(root, 'in-progress', '00001-x.md');
    // Force the beacon write to fault cross-platform: make `.ctoc/state` a FILE, so
    // writing `.ctoc/state/hook-beacon.json` throws ENOTDIR (no chmod, so this holds
    // on every OS and as root).
    fs.writeFileSync(path.join(root, '.ctoc', 'state'), 'not a directory', 'utf8');

    const r = spawnSync(process.execPath, [HOOK_PATH], { cwd: root, input: '', encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 0, 'a beacon fault must fail open — the hook still exits 0');
    assert.match(r.stdout, /\[BACKGROUND AGENT PENDING\]/, 'the existing pending-agent output is still produced');
  } finally {
    cleanup(root);
  }
});

test('case 5 — importing the module runs nothing', () => {
  const root = makeRoot();
  try {
    // A pending agent that WOULD print if main() ran on import.
    writePendingAgent(root, 'in-progress', '00001-y.md');
    const probe = `require(${JSON.stringify(HOOK_PATH)}); console.log('IMPORTED_OK');`;
    const r = spawnSync(process.execPath, ['-e', probe], { cwd: root, input: '', encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /IMPORTED_OK/, 'the require.main guard lets execution continue past the import');
    assert.doesNotMatch(r.stdout, /\[BACKGROUND AGENT PENDING\]/, 'merely importing must not run main()');
    assert.ok(!fs.existsSync(beaconPath(root)), 'merely importing must not write a beacon');
  } finally {
    cleanup(root);
  }
});

// ── cases 6-13: the READER ───────────────────────────────────────────────────

test('case 6 — fresh beacon + unrecorded edits → hooks alive, enforcement not recording', () => {
  const root = makeRoot();
  try {
    const t = unrecordedEditsFixture(root);
    hook.writeBeacon(root);
    setMtime(beaconPath(root), t + 20_000); // beacon NEWER than the newest edit (t+10s) → fresh
    const result = liveness.protectionLiveness(root, { now: t + 30_000 });
    assert.equal(result.state, 'not-recording');
    assert.equal(result.sources.beacon, 'fresh');
    const text = textOf(liveness.describeProtection(result));
    assert.match(text, /hooks are running/i, 'the wording says the hooks ARE running');
    assert.doesNotMatch(text, /Restart this session to load it again/, 'it does NOT give the plain restart advice');
  } finally {
    cleanup(root);
  }
});

test('case 7 — stale beacon + unrecorded edits → hooks not running', () => {
  const root = makeRoot();
  try {
    const t = unrecordedEditsFixture(root);
    hook.writeBeacon(root);
    setMtime(beaconPath(root), t + 5_000); // beacon OLDER than the newest edit (t+10s) → stale
    const result = liveness.protectionLiveness(root, { now: t + 30_000 });
    assert.equal(result.state, 'not-recording');
    assert.equal(result.sources.beacon, 'stale');
    const text = textOf(liveness.describeProtection(result));
    assert.match(text, /Restart this session to load it again/, 'a stale beacon keeps 00170 restart advice');
    assert.doesNotMatch(text, /hooks are running/i, 'a stale beacon is never reported as the hooks running');
  } finally {
    cleanup(root);
  }
});

test('case 8 — THE FENCE: an absent beacon is `absent`, never `stale`', () => {
  const root = makeRoot();
  try {
    const t = unrecordedEditsFixture(root); // unrecorded edits, but NO beacon written
    const result = liveness.protectionLiveness(root, { now: t + 30_000 });
    assert.equal(result.sources.beacon, 'absent', 'no beacon file → absent');
    assert.notEqual(result.sources.beacon, 'stale', 'absence must not masquerade as staleness');
    const text = textOf(liveness.describeProtection(result));
    assert.match(text, /predate/i, 'the text acknowledges the session may predate this feature');
    assert.doesNotMatch(text, /hooks are running/i, 'an absent beacon is never treated as fresh');
  } finally {
    cleanup(root);
  }
});

test('case 9 — an absent beacon NEVER downgrades 00170’s verdict (the dependency check, expected GREEN from the start)', () => {
  const root = makeRoot();
  try {
    const t = unrecordedEditsFixture(root); // 00170 case-1 shape, no beacon
    const result = liveness.protectionLiveness(root, { now: t + 30_000 });
    // These three are 00170's untouched verdict — they must hold with or without this slice.
    assert.equal(result.state, 'not-recording');
    assert.equal(result.confidence, 'high');
    assert.ok(result.unrecordedCount >= 2, `expected >= 2 unrecorded, got ${result.unrecordedCount}`);
    const text = textOf(liveness.describeProtection(result));
    assert.match(text, /Restart this session to load it again/, 'the working restart advice must survive a missing new instrument');
  } finally {
    cleanup(root);
  }
});

test('case 10 — an unreadable beacon is `unreadable`, never `fresh`', () => {
  // sub-case (a): the beacon path is a directory
  const rootA = makeRoot();
  try {
    const t = unrecordedEditsFixture(rootA);
    fs.mkdirSync(beaconPath(rootA), { recursive: true });
    const result = liveness.protectionLiveness(rootA, { now: t + 30_000 });
    assert.equal(result.sources.beacon, 'unreadable');
    assert.notEqual(result.sources.beacon, 'fresh');
    assert.notEqual(result.state, 'recording', 'a blind secondary instrument never makes the verdict healthier');
  } finally {
    cleanup(rootA);
  }
  // sub-case (b): the beacon holds bytes that are not JSON
  const rootB = makeRoot();
  try {
    const t = unrecordedEditsFixture(rootB);
    fs.mkdirSync(path.dirname(beaconPath(rootB)), { recursive: true });
    fs.writeFileSync(beaconPath(rootB), '{not json', 'utf8');
    const result = liveness.protectionLiveness(rootB, { now: t + 30_000 });
    assert.equal(result.sources.beacon, 'unreadable');
    assert.notEqual(result.sources.beacon, 'fresh');
  } finally {
    cleanup(rootB);
  }
});

test('case 11 — a beacon from a DIFFERENT build is still fresh', () => {
  const root = makeRoot();
  try {
    const t = unrecordedEditsFixture(root);
    hook.writeBeacon(root);
    // Rewrite ONLY the version field to a build that is not this one, keeping the
    // record otherwise valid. The function cannot mint a foreign version, and the
    // whole point of this case is that a version MISMATCH changes nothing — this
    // slice draws no conclusion from the recorded version.
    const rec = JSON.parse(fs.readFileSync(beaconPath(root), 'utf8'));
    rec.version = '0.0.0-a-different-build';
    fs.writeFileSync(beaconPath(root), JSON.stringify(rec), 'utf8');
    setMtime(beaconPath(root), t + 20_000); // fresh by time
    const result = liveness.protectionLiveness(root, { now: t + 30_000 });
    assert.equal(result.sources.beacon, 'fresh', 'freshness is a time question, never a version question');
    assert.equal(result.beaconVersion, '0.0.0-a-different-build', 'the version is recorded and reported');
  } finally {
    cleanup(root);
  }
});

test('case 12 — never throws on a hostile root', () => {
  const fileRoot = makeRoot();
  const asFile = path.join(fileRoot, 'not-a-directory');
  fs.writeFileSync(asFile, 'x', 'utf8');
  try {
    for (const bad of [asFile, '', null, undefined, 42, {}]) {
      const result = liveness.protectionLiveness(bad, { now: Date.now() });
      assert.equal(result.sources.beacon, 'unreadable', `root ${JSON.stringify(String(bad))} → unreadable, no throw`);
      assert.equal(result.state, 'unknown');
    }
  } finally {
    cleanup(fileRoot);
  }
});

test('case 13 — the fence is not vacuous: case 8’s assertion FAILS against a fresh-beacon fixture', () => {
  const root = makeRoot();
  try {
    const t = unrecordedEditsFixture(root);
    hook.writeBeacon(root);
    setMtime(beaconPath(root), t + 20_000); // fresh
    const result = liveness.protectionLiveness(root, { now: t + 30_000 });
    assert.throws(
      () => assert.equal(result.sources.beacon, 'absent'),
      assert.AssertionError,
      'case 8 must discriminate on real evidence — a present fresh beacon is not absent'
    );
  } finally {
    cleanup(root);
  }
});
