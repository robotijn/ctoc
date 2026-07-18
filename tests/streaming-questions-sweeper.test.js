'use strict';

/**
 * X9 — the pending-questions SWEEPER.
 *
 * The gate critic holds untrusted input (plan text, lens payloads). It is given ONE
 * write: a quarantine file at `.ctoc/streaming/questions/pending/<sanitized-ref>.json`.
 * It can never author the file a human reads at a gate. This suite proves that
 * boundary holds: a valid pending file is PROMOTED through the real
 * `streaming-precompute.writePlanQuestions`, and every malformed, stale, oversized,
 * or hostile payload is DISCARDED with nothing written.
 *
 * Everything here drives real files in a real temp directory. Nothing core is
 * mocked — the validator, the writer, the reader, and the live gate screen are the
 * shipped modules.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sweeper = require('../src/lib/streaming-questions-sweeper.js');
const precompute = require('../src/lib/streaming-precompute.js');
const streamingGate = require('../src/lib/streaming-gate.js');

const STAGES = ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
const roots = [];

/** A real project tree with a real plan at `review/00099-fixture.md`. */
function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-sweeper-'));
  roots.push(root);
  for (const stage of STAGES) fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  fs.mkdirSync(path.join(root, '.ctoc', 'streaming', 'questions', 'pending'), { recursive: true });
  writePlan(root, '00099-fixture');
  return { root, ref: 'review/00099-fixture.md' };
}

function writePlan(root, slug) {
  const p = path.join(root, 'plans', 'review', `${slug}.md`);
  fs.writeFileSync(p, `---\ntitle: ${slug}\n---\n\n# ${slug}\n\n## Scope\nA fixture plan.\n`);
  return p;
}

function planPathFor(root, ref) {
  return path.join(root, 'plans', ...ref.split('/'));
}

function pendingFileFor(root, ref) {
  const base = ref.replace(/[\\/]/g, '__').replace(/[^A-Za-z0-9._-]/g, '_');
  return path.join(root, '.ctoc', 'streaming', 'questions', 'pending', `${base}.json`);
}

/** A question set that satisfies validatePlanQuestions; both are real FORKS. */
function validQuestions() {
  return [
    {
      id: 'store',
      prompt: 'Which store backs the fixture?',
      critical: true,
      options: [
        { key: 'pg', label: 'Postgres', recommended: true, pros: 'Row level security' },
        { key: 'sqlite', label: 'SQLite', cons: 'Single writer' },
      ],
    },
    {
      id: 'expiry',
      prompt: 'How long does the fixture token live?',
      important: true,
      options: [
        { key: '15m', label: '15 minutes', recommended: true },
        { key: '1h', label: '1 hour' },
      ],
    },
  ];
}

function dropPending(root, ref, payload, fileNameRef) {
  const file = pendingFileFor(root, fileNameRef === undefined ? ref : fileNameRef);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof payload === 'string' ? payload : JSON.stringify(payload));
  return file;
}

function questionsFile(root, ref) {
  return precompute.questionsPath(root, ref);
}

function reasonOf(report, basename) {
  const hit = report.discarded.find((d) => d.file === basename);
  return hit ? hit.reason : null;
}

/**
 * Does this platform+user actually ENFORCE permission bits? Windows ignores POSIX
 * modes and root bypasses them, so a chmod-based test would pass vacuously there.
 * This probes the real behaviour rather than guessing from `process.platform`, and
 * the two permission cases below are only REGISTERED when the probe proves the
 * mechanism works — never registered-and-skipped, which the zero-skipped gate
 * (correctly) refuses.
 */
function permissionsAreEnforced() {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-perm-probe-'));
    const probe = path.join(dir, 'p.txt');
    fs.writeFileSync(probe, 'x');
    fs.chmodSync(probe, 0o000);
    try {
      fs.readFileSync(probe, 'utf8');
      return false; // read succeeded despite mode 000 → not enforced (root/Windows)
    } catch {
      return true;
    }
  } catch {
    return false;
  } finally {
    if (dir) {
      try { fs.chmodSync(path.join(dir, 'p.txt'), 0o600); } catch { /* best effort */ }
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
}

const PERMS_ENFORCED = permissionsAreEnforced();

after(() => {
  for (const root of roots) {
    // Restore any mode this suite tightened, so teardown can always remove the tree.
    try { fs.chmodSync(path.join(root, '.ctoc', 'streaming', 'questions', 'pending'), 0o700); } catch { /* not tightened */ }
  }
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

describe('streaming-questions-sweeper — promotion', () => {
  it('1. happy path: a valid pending file is promoted and consumed', () => {
    const { root, ref } = makeProject();
    const mtime = fs.statSync(planPathFor(root, ref)).mtimeMs;
    const file = dropPending(root, ref, { ref, planMtimeMs: mtime, questions: validQuestions() });

    const report = sweeper.sweepPendingQuestions(root);

    assert.deepEqual(report.promoted, [ref], 'the ref was promoted');
    assert.deepEqual(report.discarded, [], 'nothing was discarded');
    assert.equal(report.errors.length, 0, 'no errors');
    assert.equal(fs.existsSync(file), false, 'the quarantine file was consumed');
    const loaded = precompute.loadPlanQuestions(root, ref);
    assert.deepEqual(loaded.map((q) => q.id), ['store', 'expiry'], 'both questions are readable');
  });

  it('2. the freshness stamp is the plan CURRENT mtime, and the status reads ready', () => {
    const { root, ref } = makeProject();
    const planPath = planPathFor(root, ref);
    dropPending(root, ref, { ref, planMtimeMs: fs.statSync(planPath).mtimeMs, questions: validQuestions() });

    sweeper.sweepPendingQuestions(root);

    const written = JSON.parse(fs.readFileSync(questionsFile(root, ref), 'utf8'));
    assert.equal(written.planMtimeMs, fs.statSync(planPath).mtimeMs,
      'the promoted file carries the plan CURRENT mtime — otherwise it reads permanently stale');
    assert.equal(precompute.planQuestionsStatus(root, ref).status, 'ready');
  });

  it('3. an absent pending directory is the normal empty case — no error, nothing thrown', () => {
    const { root } = makeProject();
    fs.rmSync(path.join(root, '.ctoc', 'streaming', 'questions', 'pending'), { recursive: true, force: true });

    const report = sweeper.sweepPendingQuestions(root);

    assert.deepEqual(report, { promoted: [], discarded: [], deferred: 0, errors: [] });
  });

  it('4. an empty pending directory yields the empty report', () => {
    const { root } = makeProject();
    const report = sweeper.sweepPendingQuestions(root);
    assert.deepEqual(report, { promoted: [], discarded: [], deferred: 0, errors: [] });
  });

  it('13. a payload with no planMtimeMs is still promoted, stamped with the plan current mtime', () => {
    const { root, ref } = makeProject();
    dropPending(root, ref, { ref, questions: validQuestions() });

    const report = sweeper.sweepPendingQuestions(root);

    assert.deepEqual(report.promoted, [ref]);
    const written = JSON.parse(fs.readFileSync(questionsFile(root, ref), 'utf8'));
    assert.equal(written.planMtimeMs, fs.statSync(planPathFor(root, ref)).mtimeMs);
  });
});

describe('streaming-questions-sweeper — the validation ladder', () => {
  it('5. unparseable JSON is discarded, the file is deleted, nothing is written', () => {
    const { root, ref } = makeProject();
    const file = dropPending(root, ref, '{ this is not json');

    const report = sweeper.sweepPendingQuestions(root);

    assert.equal(reasonOf(report, path.basename(file)), 'unparseable');
    assert.equal(fs.existsSync(file), false, 'a rejected quarantine file is consumed');
    assert.equal(fs.existsSync(questionsFile(root, ref)), false, 'no questions file was written');
  });

  it('6. the wrong shape (an array, and null) is discarded', () => {
    const a = makeProject();
    const fileA = dropPending(a.root, a.ref, [{ ref: a.ref }]);
    assert.equal(reasonOf(sweeper.sweepPendingQuestions(a.root), path.basename(fileA)), 'wrong-shape');

    const b = makeProject();
    const fileB = dropPending(b.root, b.ref, null);
    assert.equal(reasonOf(sweeper.sweepPendingQuestions(b.root), path.basename(fileB)), 'wrong-shape');
  });

  it('7. a payload with no ref is discarded', () => {
    const { root, ref } = makeProject();
    const file = dropPending(root, ref, { planMtimeMs: 1, questions: validQuestions() });
    assert.equal(reasonOf(sweeper.sweepPendingQuestions(root), path.basename(file)), 'missing-ref');
  });

  it('8. a traversal ref is refused by the filename binding — nothing escapes the questions directory', () => {
    const { root, ref } = makeProject();
    const file = dropPending(root, ref, {
      ref: '../../../../etc/passwd',
      planMtimeMs: 1,
      questions: validQuestions(),
    });

    const report = sweeper.sweepPendingQuestions(root);

    assert.equal(reasonOf(report, path.basename(file)), 'ref-filename-mismatch');
    assert.equal(fs.existsSync(file), false);
    // Nothing was created anywhere under .ctoc/streaming/questions except the
    // (still empty) pending directory.
    const qdir = path.join(root, '.ctoc', 'streaming', 'questions');
    assert.deepEqual(fs.readdirSync(qdir), ['pending'], 'no questions file was created');
    assert.deepEqual(fs.readdirSync(path.join(qdir, 'pending')), []);
  });

  it('9. a benign cross-plan ref/filename mismatch is refused', () => {
    const { root, ref } = makeProject();
    writePlan(root, '00100-other');
    const otherRef = 'review/00100-other.md';
    // The FILENAME says 00099-fixture; the PAYLOAD claims 00100-other.
    const file = dropPending(root, ref, {
      ref: otherRef,
      planMtimeMs: fs.statSync(planPathFor(root, otherRef)).mtimeMs,
      questions: validQuestions(),
    }, ref);

    const report = sweeper.sweepPendingQuestions(root);

    assert.equal(reasonOf(report, path.basename(file)), 'ref-filename-mismatch');
    assert.equal(fs.existsSync(questionsFile(root, otherRef)), false,
      "the other plan's questions file must NOT be created");
    assert.equal(fs.existsSync(questionsFile(root, ref)), false);
  });

  it('10. questions that break the contract are refused by writePlanQuestions', () => {
    const { root, ref } = makeProject();
    const dup = validQuestions();
    dup[1].id = dup[0].id; // duplicate question id
    const file = dropPending(root, ref, {
      ref,
      planMtimeMs: fs.statSync(planPathFor(root, ref)).mtimeMs,
      questions: dup,
    });

    const report = sweeper.sweepPendingQuestions(root);

    assert.equal(reasonOf(report, path.basename(file)), 'invalid-questions');
    assert.equal(fs.existsSync(questionsFile(root, ref)), false);
    assert.equal(fs.existsSync(file), false);
  });

  it('10b. promotePendingFile surfaces the validator errors for an invalid set', () => {
    const { root, ref } = makeProject();
    const dup = validQuestions();
    dup[1].id = dup[0].id;
    const file = dropPending(root, ref, { ref, questions: dup });

    const res = sweeper.promotePendingFile(root, file);

    assert.equal(res.ok, false);
    assert.equal(res.reason, 'invalid-questions');
    assert.ok(Array.isArray(res.errors) && res.errors.length > 0, 'the validator errors travel with the result');
    assert.equal(fs.existsSync(file), true, 'promotePendingFile never deletes — the caller owns deletion');
  });

  it('11. a ref whose plan file is gone is discarded', () => {
    const { root } = makeProject();
    const ghostRef = 'review/00777-ghost.md';
    const file = dropPending(root, ghostRef, { ref: ghostRef, questions: validQuestions() });

    const report = sweeper.sweepPendingQuestions(root);

    assert.equal(reasonOf(report, path.basename(file)), 'plan-gone');
    assert.equal(fs.existsSync(questionsFile(root, ghostRef)), false);
  });

  it('12. a superseded payload (stamped older than the plan) is refused, never laundered as fresh', () => {
    const { root, ref } = makeProject();
    const planPath = planPathFor(root, ref);
    const oldMtime = fs.statSync(planPath).mtimeMs;
    const file = dropPending(root, ref, { ref, planMtimeMs: oldMtime, questions: validQuestions() });

    // The plan moves on AFTER the critique was synthesized.
    const bumped = new Date(Date.now() + 60_000);
    fs.utimesSync(planPath, bumped, bumped);
    assert.ok(fs.statSync(planPath).mtimeMs > oldMtime, 'the plan mtime is strictly greater');

    const report = sweeper.sweepPendingQuestions(root);

    assert.equal(reasonOf(report, path.basename(file)), 'superseded');
    assert.equal(fs.existsSync(questionsFile(root, ref)), false);
  });

  it('14. an oversize pending file is discarded unread', () => {
    const { root, ref } = makeProject();
    const fat = validQuestions();
    fat[0].options[0].description = 'x'.repeat(sweeper.MAX_PENDING_BYTES + 1024);
    const file = dropPending(root, ref, { ref, questions: fat });
    assert.ok(fs.statSync(file).size > sweeper.MAX_PENDING_BYTES);

    const report = sweeper.sweepPendingQuestions(root);

    assert.equal(reasonOf(report, path.basename(file)), 'oversize');
    assert.equal(fs.existsSync(questionsFile(root, ref)), false);
  });

  it('promotePendingFile refuses a path that is not a regular file', () => {
    const { root } = makeProject();
    const dir = path.join(root, '.ctoc', 'streaming', 'questions', 'pending', 'sub');
    fs.mkdirSync(dir, { recursive: true });

    const res = sweeper.promotePendingFile(root, dir);

    assert.equal(res.ok, false);
    assert.equal(res.reason, 'not-a-regular-file');
  });

  it('promotePendingFile reports a path that does not exist rather than throwing', () => {
    const { root } = makeProject();
    const missing = path.join(root, '.ctoc', 'streaming', 'questions', 'pending', 'nope.json');
    const res = sweeper.promotePendingFile(root, missing);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'not-a-regular-file');
  });

  if (PERMS_ENFORCED) {
    it('a real regular file that cannot be READ is discarded as unreadable', () => {
      const { root, ref } = makeProject();
      const file = dropPending(root, ref, {
        ref,
        planMtimeMs: fs.statSync(planPathFor(root, ref)).mtimeMs,
        questions: validQuestions(),
      });
      fs.chmodSync(file, 0o000); // lstat still succeeds; the read does not

      const res = sweeper.promotePendingFile(root, file);

      assert.equal(res.ok, false);
      assert.equal(res.reason, 'unreadable');
      assert.equal(fs.existsSync(questionsFile(root, ref)), false, 'nothing was written');
      fs.chmodSync(file, 0o600); // let teardown remove it
    });
  }
});

describe('streaming-questions-sweeper — enumeration, caps and logging', () => {
  it('15. non-json files and directories neither promote nor crash, and are not deleted', () => {
    const { root } = makeProject();
    const pending = path.join(root, '.ctoc', 'streaming', 'questions', 'pending');
    fs.writeFileSync(path.join(pending, 'README.txt'), 'notes');
    fs.mkdirSync(path.join(pending, 'subdir'), { recursive: true });

    const report = sweeper.sweepPendingQuestions(root);

    assert.deepEqual(report.promoted, []);
    assert.equal(fs.existsSync(path.join(pending, 'README.txt')), true, 'a non-json file is left alone');
    assert.equal(fs.existsSync(path.join(pending, 'subdir')), true, 'a directory is never deleted');
    assert.equal(reasonOf(report, 'subdir'), 'not-a-regular-file');
  });

  it('16. the per-sweep cap defers the remainder, and a second sweep finishes the job', () => {
    const { root } = makeProject();
    const total = sweeper.MAX_FILES_PER_SWEEP + 5;
    for (let i = 0; i < total; i++) {
      const slug = `01${String(i).padStart(3, '0')}-bulk`;
      const p = writePlan(root, slug);
      const ref = `review/${slug}.md`;
      dropPending(root, ref, { ref, planMtimeMs: fs.statSync(p).mtimeMs, questions: validQuestions() });
    }

    const first = sweeper.sweepPendingQuestions(root);
    assert.equal(first.promoted.length, sweeper.MAX_FILES_PER_SWEEP, 'the cap bounds one sweep');
    assert.equal(first.deferred, 5, 'the remainder is reported, never silently dropped');

    const second = sweeper.sweepPendingQuestions(root);
    assert.equal(second.promoted.length, 5);
    assert.equal(second.deferred, 0);
    assert.deepEqual(fs.readdirSync(path.join(root, '.ctoc', 'streaming', 'questions', 'pending')), []);
  });

  it('17. the discard log records a basename and a closed-set reason — never payload text', () => {
    const { root, ref } = makeProject();
    const SECRET = 'CANARY-PAYLOAD-STRING-DO-NOT-PROPAGATE';
    const file = dropPending(root, ref, `{ "ref": "${ref}", "note": "${SECRET}"`);

    const report = sweeper.sweepPendingQuestions(root);

    const logPath = path.join(root, '.ctoc', 'logs', 'streaming-sweeper.jsonl');
    assert.equal(fs.existsSync(logPath), true, 'the discard log exists');
    const raw = fs.readFileSync(logPath, 'utf8');
    assert.equal(raw.includes(SECRET), false, 'no payload text reaches the log');
    const lines = raw.split('\n').filter((l) => l.trim());
    assert.equal(lines.length, 1);
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.file, path.basename(file), 'the log carries a basename only');
    assert.equal(entry.reason, 'unparseable');
    assert.ok(typeof entry.ts === 'string' && entry.ts.length > 0);

    assert.equal(JSON.stringify(report).includes(SECRET), false, 'no payload text reaches the report');
  });

  it('18. an unreadable pending directory reports an error and never throws', () => {
    const { root } = makeProject();
    const pending = path.join(root, '.ctoc', 'streaming', 'questions', 'pending');
    fs.rmSync(pending, { recursive: true, force: true });
    fs.writeFileSync(pending, 'not a directory'); // readdirSync now throws ENOTDIR

    const report = sweeper.sweepPendingQuestions(root);

    assert.deepEqual(report.promoted, []);
    assert.ok(report.errors.length > 0, 'the failure is reported honestly');
  });

  it('a root whose path is unusable fails soft at the existsSync probe', () => {
    // safeFs fails CLOSED on a NUL byte, so the existsSync probe inside the sweep
    // throws. The sweep must swallow it and report the normal empty result.
    const report = sweeper.sweepPendingQuestions(`${os.tmpdir()}/ctoc-nul root`);
    assert.deepEqual(report, { promoted: [], discarded: [], deferred: 0, errors: [] });
  });

  it('a discard log that cannot be written never fails the sweep', () => {
    const { root, ref } = makeProject();
    // `.ctoc/logs` occupied by a REGULAR FILE: mkdir is skipped (it "exists"), and
    // the append underneath it throws ENOTDIR. The sweep must still complete.
    fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
    fs.writeFileSync(path.join(root, '.ctoc', 'logs'), 'occupied');
    const file = dropPending(root, ref, 'not json at all');

    const report = sweeper.sweepPendingQuestions(root);

    assert.equal(reasonOf(report, path.basename(file)), 'unparseable', 'the discard is still reported');
    assert.equal(fs.existsSync(file), false, 'the file is still consumed');
    assert.equal(fs.readFileSync(path.join(root, '.ctoc', 'logs'), 'utf8'), 'occupied',
      'the occupying file is untouched');
  });

  it('an oversized discard log is truncated rather than grown without bound', () => {
    const { root, ref } = makeProject();
    const logPath = path.join(root, '.ctoc', 'logs', 'streaming-sweeper.jsonl');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, 'x'.repeat(sweeper.MAX_LOG_BYTES + 10));

    dropPending(root, ref, 'not json at all');
    sweeper.sweepPendingQuestions(root);

    const raw = fs.readFileSync(logPath, 'utf8');
    assert.equal(raw.includes('xxxx'), false, 'the old oversized content was truncated away');
    const lines = raw.split('\n').filter((l) => l.trim());
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).reason, 'unparseable');
  });

  it('pendingDir returns null for an unusable root, and the sweep fails soft on it', () => {
    assert.equal(sweeper.pendingDir(''), null);
    assert.equal(sweeper.pendingDir(null), null);
    assert.deepEqual(
      sweeper.sweepPendingQuestions(''),
      { promoted: [], discarded: [], deferred: 0, errors: [] }
    );
  });

  if (PERMS_ENFORCED) {
    it('a quarantine file that cannot be DELETED reports the error and never aborts the sweep', () => {
      const { root, ref } = makeProject();
      dropPending(root, ref, {
        ref,
        planMtimeMs: fs.statSync(planPathFor(root, ref)).mtimeMs,
        questions: validQuestions(),
      });
      const pending = path.join(root, '.ctoc', 'streaming', 'questions', 'pending');
      fs.chmodSync(pending, 0o500); // readable + traversable, NOT writable → unlink fails

      const report = sweeper.sweepPendingQuestions(root);

      assert.deepEqual(report.promoted, [ref], 'the promotion still succeeded');
      assert.ok(report.errors.length > 0, 'the failed delete is reported honestly, never swallowed');
      assert.equal(precompute.loadPlanQuestions(root, ref).length, 2, 'the questions are live');
      fs.chmodSync(pending, 0o700);
    });
  }

  it('pendingDir points inside the streaming questions directory', () => {
    const { root } = makeProject();
    assert.equal(
      sweeper.pendingDir(root),
      path.join(root, '.ctoc', 'streaming', 'questions', 'pending')
    );
  });
});

describe('streaming-questions-sweeper — REACHABILITY from the live gate screen', () => {
  it('19. a critic-authored pending file reaches the human through streamingGateScreen', () => {
    const { root, ref } = makeProject();
    // Sanity: the plan really is a pending gate decision the human would be shown.
    assert.ok(
      streamingGate.pendingGateDecisions(root).some((d) => d.ref === ref),
      'the fixture plan is a pending gate decision'
    );

    dropPending(root, ref, {
      ref,
      planMtimeMs: fs.statSync(planPathFor(root, ref)).mtimeMs,
      questions: validQuestions(),
    });

    // NO sweeper call here — the live entry point must do the sweeping.
    const screen = streamingGate.streamingGateScreen(root);

    const rendered = JSON.stringify(screen);
    assert.ok(
      rendered.includes('Which store backs the fixture?'),
      `the critic's question must reach the human through the live screen; got: ${screen.text}`
    );
    assert.equal(
      fs.existsSync(pendingFileFor(root, ref)), false,
      'the quarantine file was consumed by the render-time sweep'
    );
  });

  it('20. a second render is idempotent — no re-promotion, no throw, no change', () => {
    const { root, ref } = makeProject();
    dropPending(root, ref, {
      ref,
      planMtimeMs: fs.statSync(planPathFor(root, ref)).mtimeMs,
      questions: validQuestions(),
    });

    streamingGate.streamingGateScreen(root);
    const afterFirst = fs.readFileSync(questionsFile(root, ref), 'utf8');

    const screen = streamingGate.streamingGateScreen(root);
    assert.ok(JSON.stringify(screen).includes('Which store backs the fixture?'));
    assert.equal(fs.readFileSync(questionsFile(root, ref), 'utf8'), afterFirst,
      'the promoted file is unchanged by a second render');
  });
});

describe('streaming-precompute — the quarantine path helper', () => {
  it('pendingQuestionsPath sanitizes exactly like questionsPath, one directory deeper', () => {
    const root = path.join(os.tmpdir(), 'ctoc-sweeper-pathcheck');
    assert.equal(
      precompute.pendingQuestionsPath(root, 'review/00099-fixture.md'),
      path.join(root, '.ctoc', 'streaming', 'questions', 'pending', 'review__00099-fixture.md.json')
    );
    // A traversal ref collapses to ONE inert filename segment inside pending/.
    const hostile = precompute.pendingQuestionsPath(root, 'functional/../../etc/passwd');
    assert.equal(path.dirname(hostile), path.join(root, '.ctoc', 'streaming', 'questions', 'pending'));
    assert.equal(path.basename(hostile), 'functional__..__..__etc__passwd.json');
    // The load-bearing property: the basename carries NO path separator, so it can
    // never climb out of pending/ however the ref was crafted.
    assert.equal(/[\\/]/.test(path.basename(hostile)), false, 'no separator survives sanitisation');
    assert.equal(
      path.resolve(hostile).startsWith(path.resolve(root, '.ctoc', 'streaming', 'questions', 'pending') + path.sep),
      true,
      'the resolved path stays inside the quarantine directory'
    );
  });

  it('pendingQuestionsPath returns null on a fundamentally invalid ref or root', () => {
    assert.equal(precompute.pendingQuestionsPath('', 'review/a.md'), null);
    assert.equal(precompute.pendingQuestionsPath('/tmp/x', ''), null);
    assert.equal(precompute.pendingQuestionsPath('/tmp/x', 'a\0b'), null);
    assert.equal(precompute.pendingQuestionsPath('/tmp/x', '..'), null);
  });

  it('refToPlanPath is exported so the sweeper cannot drift from the writer', () => {
    assert.equal(typeof precompute.refToPlanPath, 'function');
    assert.equal(
      precompute.refToPlanPath('/tmp/x', 'review/a.md'),
      path.join('/tmp/x', 'plans', 'review', 'a.md')
    );
    assert.equal(precompute.refToPlanPath('/tmp/x', 'review/../../a.md'), null);
  });
});
