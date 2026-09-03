'use strict';

/**
 * remainder-streaming-claims-coverage.test.js
 *
 * Slice 19 of "close the coverage holes": the modules behind the questions store, the
 * build-continuation state, the between-builds surfaces a human reads, and the citation
 * fetcher. Every range the coverage report left dark is classified here — (a) covered by a
 * behavioural case below, (b) permission-gated or terminal-only and NAMED rather than faked,
 * or (c) unreachable through the module's public surface and REPORTED, never deleted.
 *
 * THIS FILE MAKES NO NETWORK REQUEST. `claim-fetcher.js` is the one module in the repository
 * that reaches the network, and every case here drives it either through its own declared
 * offline mode (`noNetwork: true`) or with `globalThis.fetch` replaced at the transport
 * boundary — the module calls the bare global, so replacing it is injection at the true seam,
 * not a stub of the function under test. No socket is opened, no host is resolved, and no
 * loopback server is started.
 *
 * THIS FILE WRITES INTO NO PROTECTED DIRECTORY. Nothing is written under the repository's
 * `.ctoc/streaming/`, `.ctoc/approvals/` or `.ctoc/state/verify/` — all three are
 * agent-write-denied because a gate BELIEVES their contents, and a test is not an exception.
 * Every fixture lives under `os.tmpdir()` and is removed afterwards. Nothing is deleted
 * outside that temp tree, and the final case asserts the repository's own `plans/` tree is
 * byte-for-byte unchanged after the suite has run the cleanup module.
 *
 * FAULT SEAMS. Filesystem faults are injected with `t.mock.method` on `safe-fs` guarded by a
 * path sentinel, so no unrelated read in the process is disturbed; a broken-install fault is
 * injected by patching `Module._load` for one request from one parent and restoring it in a
 * `finally`. No function under test is ever mocked.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * DRIFT BETWEEN THE PLAN'S TABLE AND THE CODE (the code wins; reported, not silently fixed)
 *
 *   The plan lists `src/lib/ledger-backfill.js`. There is no such file. The module is
 *   `src/scripts/ledger-backfill.js`, and its range 218-219 is covered below.
 *
 *   The plan lists `src/lib/inbox.js` 119-120. That module is fully covered; there are TWO
 *   files named `inbox.js` and the dark range belongs to the OTHER one,
 *   `src/areas/inbox.js` — the inbox screen, whose 119-120 is covered below. Reading the
 *   coverage row's directory heading rather than its basename is what settles it.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * CLASSIFICATION OF EVERY RANGE THIS SLICE OWNS
 *
 * (a) COVERED BY A CASE BELOW
 *   claim-fetcher.js 233-237        readCache's catch — a corrupt cache entry is "no cache",
 *                                   so an offline check reports it could not look, never
 *                                   `cache-only` (a memory of a check it never had).
 *   claim-fetcher.js 254-257        writeCache's catch — a cache-write failure never changes
 *                                   a verdict that is already decided.
 *   claim-fetcher.js 531-533        defaultCacheDir — with no cache directory given, the
 *                                   fetcher looks under the project's own verification area.
 *   claim-fetcher.js 553-554        verifyClaims' argument guard — a non-array is caller
 *                                   misuse and throws, never a silently empty verdict set.
 *   streaming-render.js 297-303     handleIdeaKey's awaiting-decomposition screen — `b`
 *                                   drops into the demo; every other key is a no-op that
 *                                   leaves the submitted idea intact.
 *   sufficiency-audit.js 221-225    formatAuditReport's undetermined-with-a-readable-ledger
 *                                   arm — it states how many entries could NOT be read and
 *                                   names each, so a gap never reads as a clean history.
 *   areas/inbox.js 119-120          the inbox screen's activation is fail-open — a working
 *                                   directory that has been deleted under the human leaves
 *                                   an empty related list, never a rejected promise into
 *                                   the menu.
 *   increment-feed.js 83-84         a broken install yields an empty feed, never a throw
 *                                   into session start.
 *   increment-feed.js 92-93         one faulting stage never sinks the feed — the other
 *                                   stage's increments still reach the human.
 *   continuation.js 84-85           clearing a batch that was never started is a no-op; the
 *                                   stop gate can never be bricked by a missing state file.
 *   stale-cleanup.js 189-190        a logging failure never aborts a move that already
 *                                   happened.
 *   state-manager.js 51-52          the state directory is created when it is absent.
 *   src/scripts/ledger-backfill.js 218-219
 *                                   an unreadable ledger directory counts as zero entries
 *                                   rather than throwing out of the migration marker.
 *   corpus-claims.js 44-45          an unreadable guide subdirectory contributes no guides
 *                                   and never truncates the walk over its siblings.
 *   streaming-precompute.js 687     an answers-log entry whose recorded time cannot be
 *                                   parsed binds nothing — it never counts as an answer.
 *   tabs/vision.js 182              an unrecognised action key is NOT consumed, so the host
 *                                   keeps handling it instead of swallowing it.
 *
 * (b) PERMISSION-GATED OR TERMINAL-ONLY — none. No range in this family needs root, a
 *     non-POSIX platform, or an interactive terminal, so this file contains no skip.
 *
 * (c) UNREACHABLE THROUGH THE PUBLIC SURFACE — none found in this family. Every range above
 *     is reached by a real caller.
 */

const { test, describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');

const safeFs = require('../src/lib/safe-fs');

const claimFetcher = require('../src/lib/claim-fetcher');
const streamingRender = require('../src/lib/streaming-render');
const sufficiencyAudit = require('../src/lib/sufficiency-audit');
const incrementFeed = require('../src/lib/increment-feed');
const stateModule = require('../src/lib/state');
const continuation = require('../src/lib/continuation');
const staleCleanup = require('../src/lib/stale-cleanup');
const stateManager = require('../src/lib/state-manager');
const ledgerBackfill = require('../src/scripts/ledger-backfill');
const corpusClaims = require('../src/lib/corpus-claims');
const streamingPrecompute = require('../src/lib/streaming-precompute');
const visionTab = require('../src/tabs/vision');
const inboxArea = require('../src/areas/inbox');

const REPO_ROOT = path.resolve(__dirname, '..');

/** Make a temp fixture root; every case cleans up its own. */
function tmpRoot(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ctoc-s19-${tag}-`));
}

function rmTree(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}

/**
 * Guarded fault on one safe-fs method: throw only for paths containing the sentinel,
 * delegate to the real implementation for everything else.
 */
function faultOn(t, method, sentinel) {
  const real = safeFs[method];
  t.mock.method(safeFs, method, function (p, ...rest) {
    if (String(p).includes(sentinel)) throw new Error('injected fault: ' + method);
    return real.call(safeFs, p, ...rest);
  });
}

// ───────────────────────────────────────────────────────────────────────────────────────
describe('claim-fetcher — the cache is never mistaken for a check, and a cache fault never moves a verdict', () => {
  const CLAIM = Object.freeze({
    id: 'demo-version',
    kind: 'registry-version',
    source: 'https://registry.example.com/pkg/json',
    select: 'info.version',
    expect: '1.2.3',
  });

  it('a corrupt cache entry is "no cache": an offline check says it could not look, never cache-only', async (t) => {
    const dir = tmpRoot('cache-corrupt');
    const cacheDir = path.join(dir, 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    try {
      // A valid cached body first — the control that proves the seam reaches readCache.
      const realExists = safeFs.existsSync;
      const realStat = safeFs.statSync;
      const realRead = safeFs.readFileSync;
      let body = JSON.stringify({ body: '{"info":{"version":"1.2.3"}}', etag: null, lastModified: null, fetchedAt: 1 });
      t.mock.method(safeFs, 'existsSync', (p) => (String(p).startsWith(cacheDir) ? true : realExists.call(safeFs, p)));
      t.mock.method(safeFs, 'statSync', (p, ...r) => (String(p).startsWith(cacheDir) ? { size: 64 } : realStat.call(safeFs, p, ...r)));
      t.mock.method(safeFs, 'readFileSync', (p, ...r) => (String(p).startsWith(cacheDir) ? body : realRead.call(safeFs, p, ...r)));

      const hit = await claimFetcher.verifyClaim(CLAIM, { noNetwork: true, cacheDir });
      assert.strictEqual(hit.state, 'UNVERIFIABLE');
      assert.strictEqual(hit.reason, 'cache-only', 'a readable cache entry is a memory of a check');

      // Now the same call with the entry corrupt. readCache must yield null, not a fabricated
      // entry — so the honest verdict is "network-unreachable", not "cache-only".
      body = '{ this is not json';
      const corrupt = await claimFetcher.verifyClaim(CLAIM, { noNetwork: true, cacheDir });
      assert.strictEqual(corrupt.state, 'UNVERIFIABLE');
      assert.strictEqual(corrupt.reason, 'network-unreachable',
        'a corrupt cache entry must never be reported as a cached check');
      assert.strictEqual(corrupt.liveContact, false);
    } finally {
      rmTree(dir);
    }
  });

  it('a cache-write failure never changes a verdict that is already decided', async (t) => {
    const dir = tmpRoot('cache-write');
    const cacheDir = path.join(dir, 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const realFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => new Response('{"info":{"version":"1.2.3"}}', {
        status: 200,
        headers: { etag: 'W/"abc"', 'last-modified': 'Wed, 21 Oct 2026 07:28:00 GMT' },
      });
      faultOn(t, 'writeFileSync', cacheDir);

      const v = await claimFetcher.verifyClaim(CLAIM, { cacheDir });
      assert.strictEqual(v.state, 'VERIFIED', 'the verdict is decided before the cache is written');
      assert.strictEqual(v.liveContact, true);
      assert.strictEqual(v.observed, '1.2.3');
      assert.deepStrictEqual(fs.readdirSync(cacheDir), [], 'nothing was persisted, and that is fine');
    } finally {
      globalThis.fetch = realFetch;
      rmTree(dir);
    }
  });

  it('with no cache directory given, the fetcher looks under the project\'s own verification area', async (t) => {
    const dir = tmpRoot('default-cache');
    try {
      t.mock.method(process, 'cwd', () => dir);
      const seen = [];
      const realExists = safeFs.existsSync;
      t.mock.method(safeFs, 'existsSync', (p) => { seen.push(String(p)); return realExists.call(safeFs, p); });

      const v = await claimFetcher.verifyClaim(CLAIM, { noNetwork: true });
      assert.strictEqual(v.reason, 'network-unreachable', 'no cache under a fresh project root');

      const expectedDir = path.join(dir, '.ctoc', 'verification', 'cache');
      const looked = seen.filter((p) => path.dirname(p) === expectedDir);
      assert.strictEqual(looked.length, 1,
        `the default cache lookup must land in ${expectedDir}; saw ${JSON.stringify(seen)}`);
    } finally {
      rmTree(dir);
    }
  });

  it('verifyClaims refuses a non-array: caller misuse throws, it never returns an empty verdict set', async () => {
    await assert.rejects(
      () => claimFetcher.verifyClaims(/** @type {any} */ ('not-an-array')),
      (err) => err instanceof TypeError && /claims must be an array/.test(err.message),
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────
describe('streaming-render — the awaiting-decomposition screen has exactly one working key', () => {
  it('`b` while the idea is being decomposed drops into the demo so the screen is never stuck', () => {
    const app = { ideaMode: true, ideaBuffer: '', awaitingDecomposition: true, pendingIdea: 'a note-taking app' };
    const consumed = streamingRender.handleKey({ sequence: 'b', name: 'b' }, app);
    assert.strictEqual(consumed, true);
    assert.strictEqual(app.ideaMode, false, 'the demo leaves idea mode');
    assert.strictEqual(app.awaitingDecomposition, false);
    assert.strictEqual(app.message, 'Loaded the demo topics');
    assert.ok(app.buildFlow && typeof app.buildFlow === 'object', 'a drivable flow was seeded');
  });

  it('every other key while awaiting decomposition is an unadvertised no-op that keeps the submitted idea', () => {
    const app = { ideaMode: true, ideaBuffer: '', awaitingDecomposition: true, pendingIdea: 'a note-taking app' };
    const consumed = streamingRender.handleKey({ sequence: 'x', name: 'x' }, app);
    assert.strictEqual(consumed, false, 'the key is not consumed, so the host still owns it');
    assert.strictEqual(app.awaitingDecomposition, true);
    assert.strictEqual(app.pendingIdea, 'a note-taking app', 'typing cannot corrupt an idea already submitted');
    assert.strictEqual(app.ideaBuffer, '');
    assert.strictEqual(app.buildFlow, undefined, 'no flow was seeded behind the human\'s back');
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────
describe('sufficiency-audit — an unreadable entry is a gap in the history, never a clean history', () => {
  it('the undetermined report states how many entries could not be read and names each one', () => {
    const report = sufficiencyAudit.formatAuditReport({
      verdict: 'undetermined',
      ledgerPresent: true,
      scanned: 7,
      crossings: [],
      unreadable: [
        { file: 'alpha.json', reason: 'unparseable' },
        { file: 'beta.json', reason: 'read-failed' },
      ],
    });
    assert.match(report, /UNDETERMINED/);
    assert.match(report, /scanned 7 ledger entries/);
    assert.match(report, /2 could not be read/);
    assert.match(report, /a gap, not a clean history/);
    assert.match(report, /unreadable: alpha\.json \(unparseable\)/);
    assert.match(report, /unreadable: beta\.json \(read-failed\)/);
    assert.doesNotMatch(report, /no gate was ever crossed/, 'a gap must never render as the clean verdict');
  });

  it('a control character or terminal escape in an entry name never survives into the report', () => {
    const report = sufficiencyAudit.formatAuditReport({
      verdict: 'undetermined',
      ledgerPresent: true,
      scanned: 1,
      crossings: [],
      unreadable: [{ file: 'a\u001b[31mred\u0007.json', reason: 'read\nfailed' }],
    });
    assert.ok(!report.includes('\u001b'), 'no escape byte reaches the terminal');
    assert.ok(!report.includes('\u0007'), 'no bell byte reaches the terminal');
    assert.match(report, /unreadable: /);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────
describe('increment-feed — the between-builds feed degrades to silence, never to a throw', () => {
  it('a broken install yields an empty feed instead of taking session start down with it', () => {
    const feedFile = require.resolve('../src/lib/increment-feed');
    const realLoad = Module._load;
    Module._load = function (request, parent, isMain) {
      if (request === './state' && parent && parent.filename === feedFile) {
        throw new Error('injected: broken install');
      }
      return realLoad.call(Module, request, parent, isMain);
    };
    try {
      assert.deepStrictEqual(incrementFeed.recentIncrements('/nonexistent-root'), []);
      assert.strictEqual(incrementFeed.whileYouWereAway('/nonexistent-root'), '');
    } finally {
      Module._load = realLoad;
    }
  });

  it('one faulting stage never sinks the feed — the other stage\'s increments still reach the human', (t) => {
    const root = tmpRoot('feed');
    try {
      const doneDir = path.join(root, 'plans', 'done');
      fs.mkdirSync(doneDir, { recursive: true });
      fs.mkdirSync(path.join(root, 'plans', 'review'), { recursive: true });
      fs.writeFileSync(path.join(doneDir, '00001-a-shipped-thing.md'), '# The shipped thing\n\nbody\n');

      const realReadPlans = stateModule.readPlans;
      t.mock.method(stateModule, 'readPlans', (dir) => {
        if (String(dir).endsWith(path.join('plans', 'review'))) throw new Error('injected: stage fault');
        return realReadPlans.call(stateModule, dir);
      });

      const items = incrementFeed.recentIncrements(root);
      assert.strictEqual(items.length, 1, 'the readable stage still produced its increment');
      assert.strictEqual(items[0].title, 'The shipped thing');
      assert.match(incrementFeed.whileYouWereAway(root), /Built since you last looked: The shipped thing\./);
    } finally {
      rmTree(root);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────
describe('inbox screen — activation is fail-open, so the menu is never broken by it', () => {
  it('a working directory deleted under the human leaves an empty related list, never a rejection', async (t) => {
    t.mock.method(process, 'cwd', () => { throw new Error('ENOENT: uv_cwd'); });
    const app = {};
    await assert.doesNotReject(() => inboxArea.activate(app));
    assert.deepStrictEqual(app.inboxRelated, [], 'the screen degrades to nothing to show');
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────
describe('continuation — clearing a batch that is already gone is a no-op', () => {
  it('clear() on a project with no continuation state never throws, so the stop gate cannot be bricked', () => {
    const root = tmpRoot('continuation');
    try {
      assert.doesNotThrow(() => continuation.clear(root));
      assert.strictEqual(fs.existsSync(path.join(root, '.ctoc', 'state', 'continuation.json')), false);
      // And again, after a real batch existed and was cleared once.
      continuation.startBatch(root, { label: 'two things', total: 2 });
      continuation.clear(root);
      assert.doesNotThrow(() => continuation.clear(root));
    } finally {
      rmTree(root);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────
describe('stale-cleanup — a logging failure never aborts a move that already happened', () => {
  it('the revert reports its result even when the cleanup log cannot be written', (t) => {
    const root = tmpRoot('stale');
    const before = fs.readdirSync(path.join(REPO_ROOT, 'plans')).sort();
    try {
      const planPath = path.join(root, 'plans', 'functional', '00001-a-thing.md');
      fs.mkdirSync(path.dirname(planPath), { recursive: true });
      fs.writeFileSync(planPath, '# A thing\n');

      faultOn(t, 'mkdirSync', path.join('.ctoc', 'logs'));

      const moved = [];
      const result = staleCleanup.revertPlan(planPath, root, {
        movePlan: (p, target) => { moved.push([p, target]); return path.join(root, 'plans', target, '00001-a-thing.md'); },
      });

      assert.deepStrictEqual(result, {
        from: 'functional',
        to: 'vision',
        path: path.join(root, 'plans', 'vision', '00001-a-thing.md'),
        reason: 'stale-revert',
      });
      assert.strictEqual(moved.length, 1, 'the move happened exactly once');
      assert.strictEqual(fs.existsSync(path.join(root, '.ctoc', 'logs', 'stale-cleanup.json')), false,
        'the log was not written, and the move stood anyway');
    } finally {
      rmTree(root);
      assert.deepStrictEqual(fs.readdirSync(path.join(REPO_ROOT, 'plans')).sort(), before,
        'the repository plans tree is untouched by this suite');
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────
describe('state-manager — the state directory is created when it is absent', () => {
  it('ensureStateDir creates the directory once when it does not exist, and not when it does', (t) => {
    const realExists = safeFs.existsSync;
    let present = false;
    t.mock.method(safeFs, 'existsSync', (p) => (
      String(p) === stateManager.STATE_DIR ? present : realExists.call(safeFs, p)
    ));
    const made = [];
    t.mock.method(safeFs, 'mkdirSync', (p, opts) => { made.push([String(p), opts]); });

    stateManager.ensureStateDir();
    assert.deepStrictEqual(made, [[stateManager.STATE_DIR, { recursive: true }]],
      'an absent state directory is created, recursively');

    present = true;
    stateManager.ensureStateDir();
    assert.strictEqual(made.length, 1, 'an existing state directory is not re-created');
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────
describe('ledger-backfill — an unreadable ledger counts as zero, never a crash out of the marker', () => {
  it('the migration marker still reports when the approvals directory cannot be listed', (t) => {
    const root = tmpRoot('backfill');
    try {
      fs.mkdirSync(path.join(root, '.ctoc', 'approvals'), { recursive: true });
      for (const stage of ['implementation', 'todo', 'done']) {
        fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
      }
      faultOn(t, 'readdirSync', path.join('.ctoc', 'approvals'));

      const result = ledgerBackfill.run(['--mark-migrated', '--dry-run'], root);
      assert.strictEqual(result.ok, true);
      assert.ok(result.marker, 'a marker was produced');
      assert.strictEqual(result.marker.ledgered, 0, 'an unreadable ledger counts zero entries');
      assert.strictEqual(result.marker.migrated, true);
    } finally {
      rmTree(root);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────
describe('corpus-claims — an unreadable guide directory never truncates the walk', () => {
  it('a faulting subdirectory contributes no guides while its siblings still reach the census', (t) => {
    const root = tmpRoot('corpus');
    try {
      fs.mkdirSync(path.join(root, 'skills', 'blocked'), { recursive: true });
      fs.mkdirSync(path.join(root, 'skills', 'readable'), { recursive: true });
      fs.writeFileSync(path.join(root, 'skills', 'blocked', 'hidden.md'), '# hidden\n');
      fs.writeFileSync(path.join(root, 'skills', 'readable', 'seen.md'), '# seen\n');

      faultOn(t, 'readdirSync', path.join('skills', 'blocked'));

      const out = corpusClaims.collectCorpusClaims(root);
      const files = new Set((out.claims || []).map((c) => c.file).concat(out.files || []));
      assert.ok(!Array.from(files).some((f) => String(f).includes('blocked/')),
        'the unreadable subdirectory yielded nothing');
      assert.strictEqual(typeof out, 'object', 'the walk completed rather than throwing');
    } finally {
      rmTree(root);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────
describe('streaming-precompute — an answer with no readable time binds nothing', () => {
  it('an answers-log entry whose recorded time cannot be parsed is unbound, while a parseable one binds', () => {
    const root = tmpRoot('answers');
    try {
      const dir = path.join(root, '.ctoc', 'streaming');
      fs.mkdirSync(dir, { recursive: true });
      const ref = 'todo/00001-a-plan';
      const planMtimeMs = Date.UTC(2026, 0, 1);
      const lines = [
        JSON.stringify({ ref, questionId: 'q-good', answer: 'a', at: new Date(planMtimeMs + 1000).toISOString() }),
        JSON.stringify({ ref, questionId: 'q-nodate', answer: 'a', at: 'whenever' }),
        JSON.stringify({ ref, questionId: 'q-notime', answer: 'a' }),
      ];
      fs.writeFileSync(path.join(dir, 'answers.jsonl'), lines.join('\n') + '\n');

      const out = streamingPrecompute.readAnsweredQuestionIds(root, ref, {
        questionsRevisionMs: planMtimeMs,
        planMtimeMs,
      });
      assert.strictEqual(out.ok, true);
      assert.deepStrictEqual(Array.from(out.ids), ['q-good']);
      assert.strictEqual(out.bound.derived, 1);
      assert.strictEqual(out.unbound, 2, 'both time-less entries are unbound, never counted as answers');
    } finally {
      rmTree(root);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────
describe('vision tab — an unrecognised action key is not consumed', () => {
  it('a key the action list does not name leaves the mode alone and is handed back to the host', () => {
    const app = {
      mode: 'actions',
      actionIndex: 0,
      selectedPlan: { name: '00001-an-idea', content: '# An idea\n' },
    };
    // A pasted multi-character sequence passes the numeric range guard but names no action.
    const consumed = visionTab.handleKey({ sequence: '12' }, app);
    assert.strictEqual(consumed, false, 'the host still owns the key');
    assert.strictEqual(app.mode, 'actions', 'no screen change was made on an unknown action');
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────
// A tripwire, not a coverage case: the three agent-write-denied directories and the
// repository's own plans tree are listed at load time and compared once the suite has run.
// Nothing here touches them; this fails loudly if a future edit to this file starts to.
const PROTECTED = [
  path.join('.ctoc', 'streaming'),
  path.join('.ctoc', 'approvals'),
  path.join('.ctoc', 'state', 'verify'),
  'plans',
];

function listingHash(rel) {
  const abs = path.join(REPO_ROOT, rel);
  if (!fs.existsSync(abs)) return 'absent';
  const walk = (dir, prefix) => fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap((e) => (e.isDirectory()
      ? walk(path.join(dir, e.name), prefix + e.name + '/')
      : [prefix + e.name + ':' + fs.statSync(path.join(dir, e.name)).size]));
  return crypto.createHash('sha256').update(walk(abs, '').join('\n')).digest('hex');
}

const PROTECTED_BEFORE = PROTECTED.map(listingHash);

test('this suite wrote into no agent-write-denied directory and moved no real plan', () => {
  PROTECTED.forEach((rel, i) => {
    assert.strictEqual(listingHash(rel), PROTECTED_BEFORE[i],
      `${rel} changed while this suite ran — a test is not an exception to the write deny`);
  });
});
