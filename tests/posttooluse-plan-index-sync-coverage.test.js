'use strict';

/**
 * Coverage + mutation hardening for `src/hooks/PostToolUse.plan-index-sync.js`.
 *
 * This is the PostToolUse hook that fires a bounded, awaited semantic-index sync after
 * a Write/Edit touches a `plans/**\/*.md` file. Its behavioural contract is:
 *   (1) DECIDE — sync ONLY for a Markdown file under a `plans/` directory; every other
 *       edit is a silent no-op (`isPlanMd`);
 *   (2) FAIL-OPEN — a post-tool hook must NEVER crash the session: a broken project
 *       root, absent PI0 wiring, a rejecting/hung embedder, a missing sync module, and
 *       even a failure of the error-logger itself must all still `exit 0`;
 *   (3) LOG-NOT-SWALLOW — real sync failures are appended to
 *       `.ctoc/logs/plan-index-sync.json`, preserving prior entries.
 *
 * Two layers of tests:
 *
 *   A. IN-PROCESS — direct `isPlanMd()` branch pins. This is the sync/no-op decision.
 *      Each row goes RED under the obvious mutation (drop the `..` guard, drop the
 *      `plans/` boundary, widen `.+` to `.*`, drop the backslash normalization, drop
 *      the empty-string / non-string guard). These run in-process so they also count
 *      toward line coverage of `isPlanMd`.
 *
 *   B. SUBPROCESS — the real hook is spawned (`require.main === module`, so its genuine
 *      `main()` + `process.exit` path runs) with a `--require` shim that intercepts ONLY
 *      the lazy plan-index seams and, per mode, forces the exact fault that lights the
 *      dark line: the `readStdin` outer catch (stdin throws), the `resolveRootForPlan`
 *      catch (project-root require throws), `logError`'s read-existing / corrupt /
 *      non-array branches, `logError`'s own write failure, and `main`'s outer catch (the
 *      `sync-unit` require throws). Node's `--experimental-test-coverage` aggregates
 *      subprocess V8 coverage, so these count.
 *
 * Hermetic: no live embedder, no network, no real store. Every fixture lives under
 * os.tmpdir() and is removed in a finally block. Cross-platform: path.join / os.tmpdir,
 * absolute shim + hook paths for `--require`.
 *
 * AI-authored, human-reviewed line-by-line (unit-test-writer skill review clause).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const HOOK_PATH = path.join(__dirname, '..', 'src', 'hooks', 'PostToolUse.plan-index-sync.js');

// ─────────────────────────────────────────────────────────────────────────────
// Layer A — in-process isPlanMd(): the sync-vs-no-op DECISION. Directly exported.
// ─────────────────────────────────────────────────────────────────────────────

const { isPlanMd } = require(HOOK_PATH);

// String inputs. Each row's `kills` names the mutation that would flip it green.
const STRING_ROWS = [
  { id: 'plans-nested-md',        input: 'plans/todo/x.md',      expected: true,  kills: 'the happy trigger itself' },
  { id: 'plans-root-md',          input: 'plans/x.md',           expected: true,  kills: '`(^|/)` start-anchor' },
  { id: 'plans-after-boundary',   input: 'a/b/plans/deep/x.md',  expected: true,  kills: '`/`-boundary alternation' },
  { id: 'windows-backslashes',    input: 'plans\\todo\\x.md',    expected: true,  kills: 'the `.replace(/\\\\/g,"/")` backslash normalization' },
  { id: 'unrelated-js-noop',      input: 'src/lib/foo.js',       expected: false, kills: 'nothing — but is THE no-op case (unrelated edit)' },
  { id: 'md-outside-plans',       input: 'README.md',            expected: false, kills: 'dropping the `plans/` requirement (would sync any .md)' },
  { id: 'myplans-not-boundary',   input: 'myplans/x.md',         expected: false, kills: 'dropping `(^|/)` (would match `myplans/`)' },
  { id: 'plansible-substring',    input: 'src/plansible/x.md',   expected: false, kills: 'matching `plans` without the trailing `/`' },
  { id: 'not-md-extension',       input: 'plans/foo.txt',        expected: false, kills: 'dropping `endsWith(".md")`' },
  { id: 'no-extension',           input: 'plans/foo',            expected: false, kills: 'dropping the `.md` requirement' },
  { id: 'traversal-rejected',     input: 'plans/../secret.md',   expected: false, kills: 'dropping the `..` traversal guard (else this matches)' },
  { id: 'empty-string',           input: '',                     expected: false, kills: 'dropping the `fp.length === 0` operand of the `||`' },
  { id: 'plans-dotmd-no-name',    input: 'plans/.md',            expected: false, kills: 'widening `.+` to `.*` (would accept a nameless plan)' },
];

for (const row of STRING_ROWS) {
  test(`isPlanMd_${row.id}_returns_${row.expected} [kills: ${row.kills}]`, () => {
    // Act
    const actual = isPlanMd(row.input);

    // Assert — one subject: the sync/no-op decision for this path shape.
    assert.equal(actual, row.expected,
      `isPlanMd(${JSON.stringify(row.input)}) should be ${row.expected}`);
  });
}

// Non-string inputs must all be a no-op (the `typeof fp !== 'string'` guard). A single
// conceptual assertion — "no non-string is ever treated as a plan" — over each shape.
const NON_STRING_ROWS = [
  { id: 'number',    input: 42 },
  { id: 'null',      input: null },
  { id: 'undefined', input: undefined },
  { id: 'object',    input: {} },
  { id: 'array',     input: ['plans/x.md'] },
  { id: 'boolean',   input: true },
];

for (const row of NON_STRING_ROWS) {
  test(`isPlanMd_${row.id}_returns_false [kills: dropping the typeof-string guard]`, () => {
    // Act
    const actual = isPlanMd(row.input);

    // Assert
    assert.equal(actual, false, `non-string ${row.id} must never trigger a sync`);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer B — subprocess harness: spawn the REAL hook with a module-interception shim.
// ─────────────────────────────────────────────────────────────────────────────

// The hook's hardcoded sync budget — a hung embedder must degrade within it.
const SYNC_BUDGET_MS = 2000;

const SHIM_SOURCE = `'use strict';
const Module = require('module');
const fs = require('fs');
const path = require('path');

const MODE = process.env.FAKE_MODE || 'synced';
const SENTINEL = process.env.FAKE_SENTINEL || '';

function writeSentinel() {
  if (!SENTINEL) return;
  fs.mkdirSync(path.dirname(SENTINEL), { recursive: true });
  fs.writeFileSync(SENTINEL, 'synced');
}

// Force readStdin's OUTER catch: make the first stdin method the hook calls throw
// synchronously. isTTY is read first (false for a pipe), then setEncoding throws.
if (MODE === 'stdin-throw') {
  try { process.stdin.setEncoding = function () { throw new Error('stdin-encode-boom'); }; }
  catch (e) { /* ignore */ }
}

const REJECT_MODES = new Set(['reject', 'reject-seeded', 'reject-corrupt', 'reject-nonarray', 'logwrite-throw']);

const fakeWiring = {
  getWiring() {
    return { store: {}, embedder: () => new Float32Array(1), calibrationReady: () => true };
  }
};

async function fakeSyncUnit(fp, deps) {
  // A genuine async step precedes any resolution/rejection, so an un-awaited caller
  // that then process.exit()s could not observe it (the await defect this hook fixes).
  await new Promise((r) => setTimeout(r, 15));
  if (REJECT_MODES.has(MODE)) throw new Error('fake embedder failure XYZZY');
  writeSentinel();
  return { changed: ['__plan__'], skipped: false };
}

function norm(s) { return typeof s === 'string' ? s.replace(/\\\\/g, '/') : ''; }

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  const req = norm(request);
  if (req.endsWith('plan-index/wiring')) {
    return fakeWiring;
  }
  if (req.endsWith('plan-index/sync-unit')) {
    if (MODE === 'syncunit-throw') {
      const e = new Error('syncunit boom ZZZ');
      e.code = 'MODULE_NOT_FOUND';
      throw e;
    }
    return { syncUnit: fakeSyncUnit };
  }
  if (req.endsWith('lib/project-root') && MODE === 'projroot-throw') {
    const e = new Error('projroot boom');
    e.code = 'MODULE_NOT_FOUND';
    throw e;
  }
  if (req.endsWith('lib/safe-fs') && MODE === 'logwrite-throw') {
    const real = origLoad.apply(this, arguments);
    return new Proxy(real, {
      get(t, p) {
        if (p === 'writeFileSync') return function () { throw new Error('logwrite-boom'); };
        return t[p];
      }
    });
  }
  return origLoad.apply(this, arguments);
};
`;

/**
 * Build a hermetic temp CTOC project: `.ctoc/` marker (so findProjectRoot resolves the
 * temp dir, not the real repo), a real plan under plans/, and the shim on disk. Optional
 * `seedLog` pre-writes `.ctoc/logs/plan-index-sync.json` verbatim.
 */
function makeFixture({ seedLog } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-pis-'));
  fs.mkdirSync(path.join(dir, '.ctoc', 'logs'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ctoc', 'state'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'plans', 'functional'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src', 'lib'), { recursive: true });
  const planPath = path.join(dir, 'plans', 'functional', 'x.md');
  fs.writeFileSync(planPath, '---\nstatus: functional\n---\n\n# X\n\nbody\n');
  const shimPath = path.join(dir, 'shim.js');
  fs.writeFileSync(shimPath, SHIM_SOURCE);
  const logPath = path.join(dir, '.ctoc', 'logs', 'plan-index-sync.json');
  if (typeof seedLog === 'string') fs.writeFileSync(logPath, seedLog);
  return {
    dir,
    planPath,
    shimPath,
    logPath,
    sentinelPath: path.join(dir, '.ctoc', 'state', '_synced_marker'),
    nonPlanPath: path.join(dir, 'src', 'lib', 'foo.js')
  };
}
function rmFixture(fx) {
  try { fs.rmSync(fx.dir, { recursive: true, force: true }); } catch { /* best-effort */ }
}

function runHook(fx, { mode, filePath, timeout = 20000 }) {
  const input = JSON.stringify({ tool_input: { file_path: filePath } });
  const started = Date.now();
  const res = spawnSync(process.execPath, ['--require', fx.shimPath, HOOK_PATH], {
    input,
    encoding: 'utf8',
    timeout,
    cwd: fx.dir,
    env: { ...process.env, FAKE_MODE: mode, FAKE_SENTINEL: fx.sentinelPath }
  });
  return {
    status: res.status,
    signal: res.signal,
    elapsedMs: Date.now() - started,
    stdout: res.stdout,
    stderr: res.stderr
  };
}

function readLog(fx) {
  if (!fs.existsSync(fx.logPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(fx.logPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : { __nonArray: parsed };
  } catch {
    return { __corrupt: fs.readFileSync(fx.logPath, 'utf8') };
  }
}

// ── B1: readStdin OUTER catch (lines 65-66) ───────────────────────────────────
// If reading stdin state throws synchronously, readStdin fails open to `{}` and the
// hook treats the payload as a no-op — it does NOT let the throw bubble to main's
// catch (which would log an error). Assertion distinguishes catch-present (no log)
// from catch-removed (throw → main catch → error logged).
test('B1_readStdin_failsOpen_to_noop_when_stdin_throws [covers 65-66]', () => {
  const fx = makeFixture();
  try {
    const r = runHook(fx, { mode: 'stdin-throw', filePath: fx.planPath });

    assert.equal(r.status, 0, `stdin failure must still exit 0 (stderr: ${r.stderr})`);
    assert.equal(fs.existsSync(fx.sentinelPath), false, 'empty payload → isPlanMd(undefined) → no sync');
    assert.equal(fs.existsSync(fx.logPath), false,
      'readStdin swallowed the stdin fault to {}; nothing propagated to main to log');
  } finally { rmFixture(fx); }
});

// ── B2: resolveRootForPlan catch (lines 88-89) ────────────────────────────────
// When the project-root module cannot load, resolveRootForPlan falls back to
// process.cwd() rather than throwing. The sync therefore STILL proceeds (sentinel
// written). If the catch were mutated to rethrow, main's outer catch would swallow it
// and NO sentinel would be written — so the sentinel assertion kills that mutant.
test('B2_resolveRootForPlan_fallsBackToCwd_when_projectRoot_module_throws [covers 88-89]', () => {
  const fx = makeFixture();
  try {
    const r = runHook(fx, { mode: 'projroot-throw', filePath: fx.planPath });

    assert.equal(r.status, 0, `broken project-root must still exit 0 (stderr: ${r.stderr})`);
    assert.equal(fs.existsSync(fx.sentinelPath), true,
      'root resolution failed open to cwd, so the sync still ran to completion');
  } finally { rmFixture(fx); }
});

// ── B3: logError appends to a PRE-EXISTING log (lines 134-135) ─────────────────
// A prior entry must survive: logError reads the existing array and pushes onto it.
// Mutating away the read would overwrite the file (losing the seed) — the seed-marker
// assertion kills that.
test('B3_logError_appends_and_preserves_existing_entries [covers 134-135]', () => {
  const seed = JSON.stringify([{ timestamp: 't0', source: 'seed', error: 'SEED-KEEP-ME' }]);
  const fx = makeFixture({ seedLog: seed });
  try {
    const r = runHook(fx, { mode: 'reject', filePath: fx.planPath });

    assert.equal(r.status, 0, 'a rejecting sync must not fail the tool call');
    const log = readLog(fx);
    assert.ok(Array.isArray(log), 'log is a JSON array');
    assert.equal(log.length, 2, 'the seed entry is preserved AND the new error appended');
    assert.ok(log.some((e) => e.error === 'SEED-KEEP-ME'), 'existing entry survived the append');
    assert.ok(log.some((e) => typeof e.error === 'string' && e.error.includes('fake embedder failure XYZZY')),
      'the new sync rejection was recorded');
  } finally { rmFixture(fx); }
});

// ── B4: logError tolerates a CORRUPT existing log (inline catch on line 134) ───
// A non-JSON log file must not crash logError: it resets to [] then appends. The seed
// content is (correctly) lost; only the fresh error remains.
test('B4_logError_resets_on_corrupt_existing_log_and_still_records [covers 134 inline catch]', () => {
  const fx = makeFixture({ seedLog: 'this is not json {{{' });
  try {
    const r = runHook(fx, { mode: 'reject', filePath: fx.planPath });

    assert.equal(r.status, 0, 'corrupt prior log must not crash the hook');
    const log = readLog(fx);
    assert.ok(Array.isArray(log), 'log was reset to a valid array');
    assert.equal(log.length, 1, 'unparseable prior content dropped; only the new error remains');
    assert.ok(log[0].error.includes('fake embedder failure XYZZY'), 'the new error was still recorded');
  } finally { rmFixture(fx); }
});

// ── B5: logError coerces a NON-ARRAY existing log to [] (line 136 true branch) ──
// A valid-JSON-but-non-array log file (`{...}`) parses without throwing but must be
// coerced to [] before push, or `.push` would throw.
test('B5_logError_coerces_nonArray_existing_log_to_empty [covers 136 non-array branch]', () => {
  const fx = makeFixture({ seedLog: '{"not":"an-array"}' });
  try {
    const r = runHook(fx, { mode: 'reject', filePath: fx.planPath });

    assert.equal(r.status, 0, 'a non-array prior log must not crash the hook');
    const log = readLog(fx);
    assert.ok(Array.isArray(log), 'non-array prior content coerced to a fresh array');
    assert.equal(log.length, 1, 'exactly the new error');
    assert.ok(log[0].error.includes('fake embedder failure XYZZY'));
  } finally { rmFixture(fx); }
});

// ── B6: logError OUTER catch — the logger's own write fails (lines 141-142) ─────
// Fail-open-of-fail-open: even if writing the error log throws, the hook still exits 0
// and never surfaces the failure. No log file is produced (the write is what failed).
test('B6_hook_exits0_even_when_the_errorLogger_write_itself_fails [covers 141-142]', () => {
  const fx = makeFixture();
  try {
    const r = runHook(fx, { mode: 'logwrite-throw', filePath: fx.planPath });

    assert.equal(r.status, 0, `a failing error-logger must not crash the session (stderr: ${r.stderr})`);
    assert.equal(fs.existsSync(fx.logPath), false, 'the log write threw, so no log file was produced');
    assert.equal(fs.existsSync(fx.sentinelPath), false, 'reject mode never reaches the sentinel');
  } finally { rmFixture(fx); }
});

// ── B7: main OUTER catch — a throw before the inner try (lines 197-198) ────────
// The `require('../lib/plan-index/sync-unit')` sits between loadWiring and the bounded
// inner try. If it throws (module vanished), main's OUTER catch logs it and exits 0 —
// it must not crash, and must record the failure.
test('B7_main_outer_catch_logs_and_exits0_when_syncUnit_module_is_missing [covers 197-198]', () => {
  const fx = makeFixture();
  try {
    const r = runHook(fx, { mode: 'syncunit-throw', filePath: fx.planPath });

    assert.equal(r.status, 0, `a missing sync module must still exit 0 (stderr: ${r.stderr})`);
    assert.equal(fs.existsSync(fx.sentinelPath), false, 'no sync ran — the module require threw first');
    const log = readLog(fx);
    assert.ok(Array.isArray(log), 'the failure was logged');
    assert.ok(log.some((e) => typeof e.error === 'string' && e.error.includes('syncunit boom ZZZ')),
      'main outer catch recorded the require failure');
  } finally { rmFixture(fx); }
});

// ── B8: non-plan edit is a genuine no-op through the REAL entry (trigger guard) ─
// Complements the in-process isPlanMd rows by proving the DECISION at the process
// boundary: an unrelated edit reaches process.exit(0) BEFORE any wiring/sync work.
test('B8_nonPlan_edit_is_a_noop_at_the_real_entry [pins the no-op trigger]', () => {
  const fx = makeFixture();
  try {
    const r = runHook(fx, { mode: 'synced', filePath: fx.nonPlanPath });

    assert.equal(r.status, 0, 'non-plan edit exits 0');
    assert.equal(fs.existsSync(fx.sentinelPath), false, 'no sync fired for an unrelated edit');
  } finally { rmFixture(fx); }
});

// ── B9: a plan edit DOES trigger the awaited sync through the REAL entry ────────
// The positive half of the decision: a real plans/**.md write drives syncUnit to
// completion and its async result lands BEFORE the process exits (await, not fire-and-
// forget). Distinct subject from B8 — the trigger fires.
test('B9_plan_edit_triggers_awaited_sync_that_lands_before_exit [pins the sync trigger]', () => {
  const fx = makeFixture();
  try {
    const r = runHook(fx, { mode: 'synced', filePath: fx.planPath });

    assert.equal(r.status, 0, `plan edit exits 0 (stderr: ${r.stderr})`);
    assert.equal(fs.existsSync(fx.sentinelPath), true,
      'the async sync was awaited and its write is observable after exit');
  } finally { rmFixture(fx); }
});

// ── B10: a hung embedder degrades within the sync budget, still exits 0 ────────
// The bounded-await guard: a sync that never resolves must be abandoned within
// ~SYNC_BUDGET_MS and logged, never hang the tool flow. (mode 'hang' is provided by
// letting the reject path never fire — instead we hold the loop open.)
test('B10_hung_sync_degrades_within_budget_and_exits0 [pins the timeout race]', () => {
  // Build a bespoke fixture whose shim hangs syncUnit forever.
  const fx = makeFixture();
  const hangShim = SHIM_SOURCE.replace(
    'if (REJECT_MODES.has(MODE)) throw new Error(\'fake embedder failure XYZZY\');\n  writeSentinel();',
    "if (MODE === 'hang') { await new Promise(() => { setInterval(() => {}, 1000); }); }\n  if (REJECT_MODES.has(MODE)) throw new Error('fake embedder failure XYZZY');\n  writeSentinel();"
  );
  fs.writeFileSync(fx.shimPath, hangShim);
  try {
    const r = runHook(fx, { mode: 'hang', filePath: fx.planPath, timeout: 20000 });

    assert.equal(r.status, 0, `a hung embedder must still exit 0 (signal: ${r.signal})`);
    assert.ok(r.elapsedMs < SYNC_BUDGET_MS + 10000,
      `hook returned in ${r.elapsedMs}ms — bounded by the ~${SYNC_BUDGET_MS}ms budget, not hung`);
    const log = readLog(fx);
    assert.ok(Array.isArray(log) &&
      log.some((e) => typeof e.error === 'string' && /budget|timeout|timed out/i.test(e.error)),
      'a budget/timeout entry is logged when the sync exceeds its budget');
  } finally { rmFixture(fx); }
});
