/**
 * The edit protection says out loud when it has stopped running (plan 00170).
 *
 * These tests drive `src/lib/enforcement-liveness.js`, whose whole job is to
 * answer ONE question honestly: is CTOC's edit protection actually recording
 * decisions in this project?
 *
 * The load-bearing cases, named so a later reader cannot quietly remove them:
 *
 *   - case 3  an IDLE project stays silent however long it has been idle.
 *   - case 4  a BUSY project speaks within seconds. Same code path as case 3,
 *             opposite verdict, driven only by the project's own activity —
 *             together they fence out any duration threshold.
 *   - case 8  an unreadable log is NEVER `recording`.
 *   - case 9  an unreadable plan degrades the witness to `unknown` rather than
 *             silently shrinking it.
 *   - case 17 the System screen never falls back to silence.
 *   - case 18 the vacuity guard: case 1's assertion applied to case 2's fixture
 *             must FAIL, proving case 1 discriminates on real evidence.
 *
 * Fixtures are real directories under `os.tmpdir()`. Log entries are minted by
 * calling the REAL `enforcementLog.logEnforcement` — never by hand-writing JSON
 * lines, which would drift from the schema the moment the schema moves.
 * Modification times are set explicitly with `fs.utimesSync`, so no test sleeps.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const enforcementLog = require('../src/lib/enforcement-log');

const liveness = require('../src/lib/enforcement-liveness');
const systemArea = require('../src/areas/system');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Create a throwaway project root.
 * @returns {string} absolute path to a fresh temp directory
 */
function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-liveness-'));
}

/**
 * Remove a fixture root, tolerating a partially-built tree.
 * @param {string} root - fixture root
 */
function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* fixture already gone */ }
}

/**
 * Write a plan into a stage directory declaring `files:`, and create each
 * declared file so it can be stat'd.
 *
 * @param {string} root - fixture root
 * @param {string} stage - plan stage directory name
 * @param {string} name - plan file base name
 * @param {string[]} files - repository-relative declared paths
 * @returns {string[]} the absolute paths of the created declared files
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
 * Append one real enforcement decision and return its timestamp in milliseconds.
 *
 * @param {string} root - fixture root
 * @param {string} decision - the decision token to record
 * @returns {number} the entry's timestamp, in milliseconds
 */
function mintDecision(root, decision = 'allow') {
  const entry = enforcementLog.logEnforcement(
    { decision, target_file: path.join(root, 'src', 'fixture.js'), tool: 'Edit' },
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
 * The fixture behind case 1 and reused by the vacuity guard (case 18): a log
 * whose newest entry predates several declared files.
 *
 * @param {string} root - fixture root
 * @returns {object} the liveness result for that fixture
 */
function measuredRealityFixture(root) {
  const files = writePlan(root, 'todo', '00001-busy', ['src/a.js', 'src/b.js', 'src/c.js']);
  const t = mintDecision(root);
  for (const f of files) setMtime(f, t + 10_000);
  return liveness.protectionLiveness(root, { now: t + 20_000 });
}

/**
 * The healthy fixture behind case 2 and reused by the vacuity guard: every
 * declared file is older than the newest recorded decision.
 *
 * @param {string} root - fixture root
 * @returns {object} the liveness result for that fixture
 */
function healthyFixture(root) {
  const files = writePlan(root, 'todo', '00001-quiet', ['src/a.js', 'src/b.js', 'src/c.js']);
  const t = mintDecision(root);
  for (const f of files) setMtime(f, t - 60_000);
  return liveness.protectionLiveness(root, { now: t + 4 * 60_000 });
}

/**
 * The assertion that defines case 1. Extracted so case 18 can apply the very
 * same assertion to the healthy fixture and prove it fails there.
 *
 * @param {object} result - a liveness result
 */
function assertMeasuredReality(result) {
  assert.equal(result.state, 'not-recording');
  assert.equal(result.confidence, 'high');
  assert.ok(result.unrecordedCount >= 2, `expected >= 2 unrecorded, got ${result.unrecordedCount}`);
}

/**
 * Flatten a description's lines into one searchable string.
 * @param {object} described - a describeProtection result
 * @returns {string} the joined text
 */
function textOf(described) {
  return described.lines.join(' ');
}

test('case 1 — the measured reality: a log whose newest entry predates several declared files', () => {
  const root = makeRoot();
  try {
    assertMeasuredReality(measuredRealityFixture(root));
  } finally {
    cleanup(root);
  }
});

test('case 2 — a healthy project reports recording and gives no advice', () => {
  const root = makeRoot();
  try {
    const result = healthyFixture(root);
    assert.equal(result.state, 'recording');
    const text = textOf(liveness.describeProtection(result));
    assert.ok(!/[Rr]estart/.test(text), `healthy description must carry no advice: ${text}`);
  } finally {
    cleanup(root);
  }
});

test('case 3 — an IDLE project is silent, however old: no duration threshold exists', () => {
  const root = makeRoot();
  try {
    const files = writePlan(root, 'todo', '00001-idle', ['src/a.js']);
    const t = mintDecision(root);
    setMtime(files[0], t - 1000);
    // The last decision is 400 days behind `now`, and nothing has changed since.
    // A duration threshold would scream here. The honest answer is silence.
    const result = liveness.protectionLiveness(root, { now: t + 400 * DAY_MS });
    assert.equal(result.state, 'recording');
    assert.equal(result.unrecordedCount, 0);
  } finally {
    cleanup(root);
  }

  // The fence itself: no duration constant may live in the module besides the
  // filesystem-granularity allowance.
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'enforcement-liveness.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const constants = code.match(/const\s+[A-Z][A-Z0-9_]*\s*=\s*[\d_]+/g) || [];
  const durations = constants.filter((d) => !/GRANULARITY_MS/.test(d) && !/CORROBORATION_FLOOR/.test(d));
  assert.deepEqual(durations, [], `unexpected numeric constant(s) in the module: ${durations.join(', ')}`);
});

test('case 4 — a BUSY project speaks within seconds: the same code path, opposite verdict', () => {
  const root = makeRoot();
  try {
    const files = writePlan(root, 'todo', '00001-busy', ['src/a.js', 'src/b.js']);
    const t = mintDecision(root);
    for (const f of files) setMtime(f, t + 3000);
    const result = liveness.protectionLiveness(root, { now: t + 3000 });
    assert.equal(result.state, 'not-recording');
    assert.ok(result.unrecordedCount >= 2);
  } finally {
    cleanup(root);
  }
});

test('case 5 — one changed file is not enough for advice', () => {
  const root = makeRoot();
  try {
    const files = writePlan(root, 'todo', '00001-one', ['src/a.js', 'src/b.js']);
    const t = mintDecision(root);
    setMtime(files[0], t + 10_000);
    setMtime(files[1], t - 10_000);
    const result = liveness.protectionLiveness(root, { now: t + 20_000 });
    assert.equal(result.state, 'not-recording');
    assert.equal(result.confidence, 'low');
    assert.equal(result.unrecordedCount, 1);
    const text = textOf(liveness.describeProtection(result));
    assert.ok(!/[Rr]estart/.test(text), `low confidence must carry no restart advice: ${text}`);
  } finally {
    cleanup(root);
  }
});

test('case 6 — the corroboration floor is driven at its exact boundary', () => {
  assert.equal(liveness.CORROBORATION_FLOOR, 2);

  for (const [changed, expected] of [[1, 'low'], [2, 'high'], [3, 'high']]) {
    const root = makeRoot();
    try {
      const declared = ['src/a.js', 'src/b.js', 'src/c.js'];
      const files = writePlan(root, 'todo', '00001-floor', declared);
      const t = mintDecision(root);
      files.forEach((f, i) => setMtime(f, i < changed ? t + 10_000 : t - 10_000));
      const result = liveness.protectionLiveness(root, { now: t + 20_000 });
      assert.equal(result.unrecordedCount, changed, `count for ${changed} changed`);
      assert.equal(result.confidence, expected, `confidence for ${changed} changed`);
    } finally {
      cleanup(root);
    }
  }
});

test('case 7 — the granularity allowance is driven at its exact boundary', () => {
  assert.equal(liveness.GRANULARITY_MS, 2000);

  for (const [offsetMs, expectedCount] of [[1000, 0], [3000, 1]]) {
    const root = makeRoot();
    try {
      const files = writePlan(root, 'todo', '00001-gran', ['src/a.js']);
      const t = mintDecision(root);
      setMtime(files[0], t + offsetMs);
      const result = liveness.protectionLiveness(root, { now: t + 10_000 });
      assert.equal(result.unrecordedCount, expectedCount, `offset ${offsetMs}ms`);
    } finally {
      cleanup(root);
    }
  }
});

test('case 8 — THE FENCE: an unreadable log is never `recording`', () => {
  const root = makeRoot();
  try {
    writePlan(root, 'todo', '00001-x', ['src/a.js']);
    mintDecision(root);
    const logPath = path.join(root, '.ctoc', 'logs', 'enforcement.json');
    fs.rmSync(logPath);
    fs.mkdirSync(logPath); // the log path is now a directory: unreadable
    const result = liveness.protectionLiveness(root, { now: Date.now() });
    assert.equal(result.sources.log, 'unreadable');
    assert.equal(result.state, 'unknown');
    assert.notEqual(result.state, 'recording');
  } finally {
    cleanup(root);
  }
});

test('case 9 — an unreadable plan is never a smaller witness', () => {
  const root = makeRoot();
  try {
    const files = writePlan(root, 'todo', '00001-readable', ['src/a.js']);
    const t = mintDecision(root);
    setMtime(files[0], t - 10_000); // the readable plan sees nothing

    // A second plan that cannot be read at all.
    fs.mkdirSync(path.join(root, 'plans', 'todo', '00002-unreadable.md'));

    const result = liveness.protectionLiveness(root, { now: t + 10_000 });
    assert.equal(result.sources.edits, 'unreadable');
    assert.equal(result.state, 'unknown');
    assert.notEqual(result.state, 'recording');
  } finally {
    cleanup(root);
  }
});

test('case 10 — an absent log is `unknown`, not broken, and advises nothing', () => {
  const root = makeRoot();
  try {
    writePlan(root, 'todo', '00001-fresh', ['src/a.js']);
    const result = liveness.protectionLiveness(root, { now: Date.now() });
    assert.equal(result.sources.log, 'absent');
    assert.equal(result.state, 'unknown');
    const text = textOf(liveness.describeProtection(result));
    assert.ok(!/[Rr]estart/.test(text), `a fresh project must not be advised to restart: ${text}`);
  } finally {
    cleanup(root);
  }
});

test('case 11 — an empty log is `unknown` and advises nothing', () => {
  const root = makeRoot();
  try {
    writePlan(root, 'todo', '00001-empty', ['src/a.js']);
    const logDir = path.join(root, '.ctoc', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(path.join(logDir, 'enforcement.json'), '', 'utf8');
    const result = liveness.protectionLiveness(root, { now: Date.now() });
    assert.equal(result.sources.log, 'empty');
    assert.equal(result.state, 'unknown');
    const text = textOf(liveness.describeProtection(result));
    assert.ok(!/[Rr]estart/.test(text));
  } finally {
    cleanup(root);
  }
});

test('case 12 — a corrupt LINE does not blind the scan', () => {
  const root = makeRoot();
  try {
    const files = writePlan(root, 'todo', '00001-corruptline', ['src/a.js', 'src/b.js']);
    const t = mintDecision(root);
    fs.appendFileSync(path.join(root, '.ctoc', 'logs', 'enforcement.json'), '{not json at all\n', 'utf8');
    for (const f of files) setMtime(f, t + 10_000);
    const result = liveness.protectionLiveness(root, { now: t + 20_000 });
    assert.equal(result.sources.log, 'has-entries');
    assert.equal(result.state, 'not-recording');
    assert.equal(Date.parse(result.lastDecisionAt), t);
  } finally {
    cleanup(root);
  }
});

test('case 13 — every line malformed reads as `unreadable`, never `empty`', () => {
  const root = makeRoot();
  try {
    writePlan(root, 'todo', '00001-allbad', ['src/a.js']);
    const logDir = path.join(root, '.ctoc', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(path.join(logDir, 'enforcement.json'), 'garbage\nmore garbage\n', 'utf8');
    const result = liveness.protectionLiveness(root, { now: Date.now() });
    assert.equal(result.sources.log, 'unreadable');
    assert.equal(result.state, 'unknown');
  } finally {
    cleanup(root);
  }
});

test('case 14 — never throws on a hostile root', () => {
  const fileRoot = makeRoot();
  const asFile = path.join(fileRoot, 'not-a-directory');
  fs.writeFileSync(asFile, 'x', 'utf8');
  try {
    for (const bad of [asFile, '', null, undefined, 42, {}, 'has\0nul']) {
      const result = liveness.protectionLiveness(bad, { now: Date.now() });
      assert.equal(result.state, 'unknown', `root ${JSON.stringify(String(bad))}`);
      assert.equal(typeof liveness.describeProtection(result).severity, 'string');
    }
  } finally {
    cleanup(fileRoot);
  }
});

test('case 15 — the two bad states read DIFFERENTLY to a human', () => {
  const notRecording = liveness.describeProtection({
    state: 'not-recording', confidence: 'high', lastDecisionAt: new Date().toISOString(),
    unrecordedCount: 23, unrecordedSince: new Date().toISOString(),
    sources: { log: 'has-entries', edits: 'observed' }, reason: 'unrecorded-edits', asOf: Date.now()
  });
  const unknown = liveness.describeProtection({
    state: 'unknown', confidence: null, lastDecisionAt: null,
    unrecordedCount: 0, unrecordedSince: null,
    sources: { log: 'unreadable', edits: 'none' }, reason: 'instrument-unreadable', asOf: Date.now()
  });

  assert.notDeepEqual(notRecording.lines, unknown.lines);
  assert.ok(/[Rr]estart/.test(textOf(notRecording)), 'high-confidence not-recording must advise a restart');
  assert.ok(!/[Rr]estart/.test(textOf(unknown)), 'unknown must not advise a restart');
  assert.equal(notRecording.severity, 'alarm');
  assert.equal(unknown.severity, 'alarm');

  // No internal vocabulary reaches the human on any line.
  const forbidden = /hook|PreToolUse|Gate\s*\d|gate|in-progress|todo stage|matcher|frontmatter/i;
  for (const d of [notRecording, unknown]) {
    assert.ok(!forbidden.test(textOf(d)), `internal vocabulary leaked: ${textOf(d)}`);
    assert.ok(!forbidden.test(d.heading), `internal vocabulary leaked in heading: ${d.heading}`);
  }
});

test('case 16 — the System screen renders the verdict, not a byte count', () => {
  for (const build of [measuredRealityFixture, healthyFixture]) {
    const root = makeRoot();
    try {
      build(root);
      const out = systemArea.render({ projectPath: root });
      assert.ok(/Edit protection/.test(out), 'the protection heading must render');
      const enforcementLine = out.split('\n').find((l) => /enforcement\.json/.test(l) && /bytes/.test(l));
      assert.equal(enforcementLine, undefined, `the enforcement byte count must be gone: ${enforcementLine}`);
      // The neighbouring byte lines are deliberately untouched.
      assert.ok(/gate-violations\.json/.test(out) && /bytes/.test(out), 'sibling byte lines stay');
    } finally {
      cleanup(root);
    }
  }

  // The third state: an absent log.
  const fresh = makeRoot();
  try {
    writePlan(fresh, 'todo', '00001-fresh', ['src/a.js']);
    const out = systemArea.render({ projectPath: fresh });
    assert.ok(/Edit protection/.test(out));
    assert.ok(/Cannot tell/.test(out), 'a project with no record says it cannot tell');
  } finally {
    cleanup(fresh);
  }
});

test('case 17 — the screen never falls back to silence when the check itself is broken', () => {
  const livenessPath = require.resolve('../src/lib/enforcement-liveness');
  const saved = require.cache[livenessPath];
  const root = makeRoot();
  try {
    const poisoned = { id: livenessPath, filename: livenessPath, loaded: true, children: [], paths: [] };
    Object.defineProperty(poisoned, 'exports', {
      get() { throw new Error('enforcement-liveness is unavailable'); }
    });
    require.cache[livenessPath] = poisoned;

    const out = systemArea.render({ projectPath: root });
    assert.ok(/Edit protection/.test(out), 'the block must still render');
    assert.ok(/Cannot tell/.test(out), 'a broken check renders the unknown text');
    const enforcementLine = out.split('\n').find((l) => /enforcement\.json/.test(l) && /bytes/.test(l));
    assert.equal(enforcementLine, undefined, 'it must never fall back to the byte count');
  } finally {
    if (saved) require.cache[livenessPath] = saved; else delete require.cache[livenessPath];
    cleanup(root);
  }
});

test('case 18 — the vacuity guard: case 1 fails against case 2 fixture', () => {
  const root = makeRoot();
  try {
    const healthy = healthyFixture(root);
    assert.throws(
      () => assertMeasuredReality(healthy),
      assert.AssertionError,
      'case 1 must discriminate on real evidence, not match anything'
    );
  } finally {
    cleanup(root);
  }
});

test('a hostile log entry cannot inject into the rendered line', () => {
  const root = makeRoot();
  try {
    const files = writePlan(root, 'todo', '00001-hostile', ['src/a.js', 'src/b.js']);
    enforcementLog.logEnforcement({
      decision: 'block',
      target_file: `evil\n\u001b[31mINJECTED\u001b[0m %s ${'A'.repeat(10_000)}`,
      tool: 'Edit'
    }, root);
    const entries = enforcementLog.readLog(root);
    const t = Date.parse(entries[entries.length - 1].timestamp);
    for (const f of files) setMtime(f, t + 10_000);

    const described = liveness.describeProtection(liveness.protectionLiveness(root, { now: t + 20_000 }));
    const text = textOf(described);
    assert.ok(!/INJECTED/.test(text), 'no log content reaches the human');
    assert.ok(!/evil/.test(text), 'no target path reaches the human');
    assert.ok(!/\u001b/.test(text), 'no terminal escape reaches the human');
    assert.ok(text.length < 400, `the line stays bounded, got ${text.length}`);
    for (const l of described.lines) assert.ok(!/\n/.test(l), 'no line contains a newline');
  } finally {
    cleanup(root);
  }
});

test('a root outside the tree cannot make the module read outside the project', () => {
  const root = makeRoot();
  try {
    // A plan declaring an escaping path must contribute nothing to the witness.
    writePlan(root, 'todo', '00001-escape', ['src/a.js']);
    const stageDir = path.join(root, 'plans', 'todo');
    fs.writeFileSync(
      path.join(stageDir, '00002-evil.md'),
      ['---', 'files:', '  - "../../../../etc/passwd"', '  - "/etc/hosts"', '---', ''].join('\n'),
      'utf8'
    );
    const t = mintDecision(root);
    setMtime(path.join(root, 'src', 'a.js'), t - 10_000);
    const result = liveness.protectionLiveness(root, { now: t + 10_000 });
    assert.equal(result.unrecordedCount, 0, 'out-of-tree declarations are ignored entirely');
    assert.notEqual(result.state, 'not-recording');
  } finally {
    cleanup(root);
  }
});

test('the declared-file witness spans in-progress, todo and implementation', () => {
  for (const stage of ['in-progress', 'todo', 'implementation']) {
    const root = makeRoot();
    try {
      const files = writePlan(root, stage, '00001-stage', ['src/a.js', 'src/b.js']);
      const t = mintDecision(root);
      for (const f of files) setMtime(f, t + 10_000);
      const result = liveness.protectionLiveness(root, { now: t + 20_000 });
      assert.equal(result.unrecordedCount, 2, `stage ${stage} must be part of the witness`);
    } finally {
      cleanup(root);
    }
  }
});

test('a root that does not exist at all is `unknown`, not a verdict', () => {
  const result = liveness.protectionLiveness(
    path.join(os.tmpdir(), 'ctoc-liveness-no-such-root-' + process.pid),
    { now: Date.now() }
  );
  assert.equal(result.state, 'unknown');
  assert.equal(result.reason, 'unusable-root');
});

test('an unlistable stage directory degrades the witness rather than shrinking it', () => {
  const root = makeRoot();
  try {
    const files = writePlan(root, 'todo', '00001-ok', ['src/a.js']);
    // `plans/implementation` exists but is a FILE: listing it throws ENOTDIR.
    fs.writeFileSync(path.join(root, 'plans', 'implementation'), 'not a directory', 'utf8');
    const t = mintDecision(root);
    setMtime(files[0], t - 10_000);
    const result = liveness.protectionLiveness(root, { now: t + 10_000 });
    assert.equal(result.sources.edits, 'unreadable');
    assert.equal(result.state, 'unknown');
    assert.notEqual(result.state, 'recording');
  } finally {
    cleanup(root);
  }
});

test('an absurd modification time is rendered, never as NaN', () => {
  const root = makeRoot();
  try {
    const files = writePlan(root, 'todo', '00001-absurd', ['src/a.js', 'src/b.js']);
    mintDecision(root);
    // Far outside any sane range. The filesystem clamps it to the largest value
    // it can store, so this does NOT throw — it produces a preposterous instant,
    // which must still reach the human as words rather than as `NaN`.
    for (const f of files) fs.utimesSync(f, 1e15, 1e15);
    const result = liveness.protectionLiveness(root, { now: Date.now() });
    assert.equal(result.state, 'not-recording');
    const text = textOf(liveness.describeProtection(result));
    assert.ok(!/NaN|Invalid/.test(text), `an absurd time must not leak: ${text}`);
  } finally {
    cleanup(root);
  }
});

test('THE BACKSTOP — a hostile options object cannot crash the screen', () => {
  const root = makeRoot();
  try {
    writePlan(root, 'todo', '00001-hostile-opts', ['src/a.js']);
    mintDecision(root);
    const hostile = { get now() { throw new Error('hostile options'); } };
    const result = liveness.protectionLiveness(root, hostile);
    assert.equal(result.state, 'unknown');
    assert.equal(result.reason, 'instrument-unreadable');
    assert.equal(typeof result.asOf, 'number', 'a fault path still carries a usable clock');
    assert.equal(liveness.describeProtection(result).severity, 'alarm');
  } finally {
    cleanup(root);
  }
});

test('the age phrase reads in whole units across seconds, minutes, hours and days', () => {
  const asOf = Date.parse('2026-07-20T12:00:00.000Z');
  const cases = [
    [5_000, /5 seconds ago/],
    [60_000, /1 minute ago/],
    [3 * 60 * 60_000, /3 hours ago/],
    [9 * 24 * 60 * 60_000, /9 days ago/]
  ];
  for (const [elapsed, pattern] of cases) {
    const described = liveness.describeProtection({
      state: 'recording', confidence: null,
      lastDecisionAt: new Date(asOf - elapsed).toISOString(),
      unrecordedCount: 0, unrecordedSince: null,
      sources: { log: 'has-entries', edits: 'none' }, reason: 'in-agreement', asOf
    });
    assert.match(described.lines[0], pattern);
    assert.equal(described.severity, 'ok');
  }

  // A result carrying no usable moment still renders a sentence, never a blank.
  const vague = liveness.describeProtection({
    state: 'recording', confidence: null, lastDecisionAt: null,
    unrecordedCount: 0, unrecordedSince: null,
    sources: { log: 'has-entries', edits: 'none' }, reason: 'in-agreement', asOf
  });
  assert.match(vague.lines[0], /Active/);

  // An unparseable moment on the loud line degrades to words, never to `NaN`.
  const broken = liveness.describeProtection({
    state: 'not-recording', confidence: 'high', lastDecisionAt: 'not a date',
    unrecordedCount: 2, unrecordedSince: null,
    sources: { log: 'has-entries', edits: 'observed' }, reason: 'unrecorded-edits', asOf
  });
  assert.match(textOf(broken), /an unknown time/);
  assert.ok(!/NaN/.test(textOf(broken)));

  // A non-object argument is still described rather than throwing.
  assert.equal(typeof liveness.describeProtection(null).severity, 'string');
});

test('a path declared by two plans is counted once', () => {
  const root = makeRoot();
  try {
    writePlan(root, 'todo', '00001-a', ['src/shared.js']);
    writePlan(root, 'implementation', '00002-b', ['src/shared.js']);
    const t = mintDecision(root);
    setMtime(path.join(root, 'src', 'shared.js'), t + 10_000);
    const result = liveness.protectionLiveness(root, { now: t + 20_000 });
    assert.equal(result.unrecordedCount, 1, 'the same path declared twice is one witness');
    assert.equal(result.confidence, 'low');
  } finally {
    cleanup(root);
  }
});
