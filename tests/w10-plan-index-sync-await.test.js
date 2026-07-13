'use strict';

/**
 * W10-s6 — PostToolUse.plan-index-sync.js must AWAIT the single-unit sync before
 * `process.exit(0)`.
 *
 * The defect under test: the hook schedules the sync as a deliberately-not-awaited
 * microtask (`Promise.resolve().then(() => syncUnit(...))`) and then runs
 * `process.exit(0)` on the very next line. Node drains the microtask queue only when
 * the current synchronous unit of work returns control to the event loop;
 * `process.exit()` terminates the process first, so the scheduled callback is NEVER
 * invoked and the semantic plan index is silently stale forever.
 *
 * These tests prove the fix with REAL async behavior — no test double for the hook
 * itself. The genuine hook file is spawned as a subprocess (so its real `main()` +
 * `process.exit` path runs), with a `--require` shim that intercepts ONLY the two
 * plan-index seams the hook loads lazily (`../lib/plan-index/wiring` and
 * `../lib/plan-index/sync-unit`). The fake `syncUnit` performs a genuine asynchronous
 * step (a timer that must fire) BEFORE it writes its sentinel: an un-awaited caller
 * that then calls `process.exit` cannot observe that write; an awaiting caller can.
 *
 * Hermetic: no live Ollama, no network, no real embedder, no real store. The shim and
 * the temp project live under os.tmpdir() and are removed in a finally block.
 * Cross-platform: path.join / os.tmpdir, absolute shim + hook paths for `--require`.
 */

const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const HOOK_PATH = path.join(__dirname, '..', 'src', 'hooks', 'PostToolUse.plan-index-sync.js');

// The hook's hardcoded sync budget (see the ADR in the slice plan). Case 4 asserts a
// hung embedder degrades within this budget rather than hanging the tool flow.
const SYNC_BUDGET_MS = 2000;

/**
 * A `--require` preload shim. Patches Module._load so the hook's lazy
 * `require('../lib/plan-index/wiring')` and `require('../lib/plan-index/sync-unit')`
 * resolve to fakes driven by env vars (FAKE_MODE, FAKE_SENTINEL). Every other require
 * (path, project-root, safe-fs) passes through to the real module, so the hook's real
 * logError / isPlanMd / root-resolution paths all run unchanged.
 *
 * The fake syncUnit does REAL async work (a timer) before writing the sentinel, so the
 * fire-and-forget-vs-await defect is observable: with the un-awaited microtask +
 * immediate process.exit, the timer never fires and the sentinel never lands.
 */
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

const fakeWiring = {
  getWiring() {
    return { store: {}, embedder: () => new Float32Array(1), calibrationReady: () => true };
  }
};

async function fakeSyncUnit(fp, deps) {
  if (MODE === 'reject') {
    // Real async step, THEN reject — mimics an embedder that fails after I/O.
    await new Promise((r) => setTimeout(r, 20));
    throw new Error('fake embedder failure XYZZY');
  }
  if (MODE === 'hang') {
    // A genuinely hung embedder still holds the event loop alive (real network I/O
    // would). A ref'd interval keeps the loop referenced and never resolves, so the
    // ONLY thing that can end the wait is the hook's own bounded timeout.
    await new Promise(() => { setInterval(() => {}, 1000); });
    return;
  }
  // 'synced': a real async step must complete before the sentinel is written.
  await new Promise((r) => setTimeout(r, 30));
  writeSentinel();
  return { changed: ['__plan__'], skipped: false };
}

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (typeof request === 'string' && request.replace(/\\\\/g, '/').endsWith('plan-index/wiring')) {
    if (MODE === 'absent-wiring') {
      const e = new Error('Cannot find module (simulated PI0 absent)');
      e.code = 'MODULE_NOT_FOUND';
      throw e;
    }
    return fakeWiring;
  }
  if (typeof request === 'string' && request.replace(/\\\\/g, '/').endsWith('plan-index/sync-unit')) {
    return { syncUnit: fakeSyncUnit };
  }
  return origLoad.apply(this, arguments);
};
`;

// ── temp-project + shim harness ───────────────────────────────────────────────
function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w10s6-'));
  fs.mkdirSync(path.join(dir, '.ctoc', 'logs'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ctoc', 'state'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'plans', 'functional'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src', 'lib'), { recursive: true });
  const planPath = path.join(dir, 'plans', 'functional', 'x.md');
  fs.writeFileSync(planPath, '---\nstatus: functional\n---\n\n# X\n\nbody\n');
  const shimPath = path.join(dir, 'shim.js');
  fs.writeFileSync(shimPath, SHIM_SOURCE);
  return {
    dir,
    planPath,
    shimPath,
    sentinelPath: path.join(dir, '.ctoc', 'state', '_synced_marker'),
    logPath: path.join(dir, '.ctoc', 'logs', 'plan-index-sync.json'),
    nonPlanPath: path.join(dir, 'src', 'lib', 'foo.js')
  };
}
function rmFixture(fx) {
  try { fs.rmSync(fx.dir, { recursive: true, force: true }); } catch { /* best-effort */ }
}

/**
 * Spawn the REAL hook as a subprocess with the interception shim. Returns
 * { status, elapsedMs, stdout, stderr }.
 */
function runHook(fx, { mode, filePath, timeout = 15000 }) {
  const input = JSON.stringify({ tool_input: { file_path: filePath } });
  const started = Date.now();
  const res = spawnSync(process.execPath, ['--require', fx.shimPath, HOOK_PATH], {
    input,
    encoding: 'utf8',
    timeout,
    cwd: fx.dir,
    env: { ...process.env, FAKE_MODE: mode, FAKE_SENTINEL: fx.sentinelPath }
  });
  return { status: res.status, signal: res.signal, elapsedMs: Date.now() - started, stdout: res.stdout, stderr: res.stderr };
}

function readLog(fx) {
  if (!fs.existsSync(fx.logPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(fx.logPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── Case 1: the sync RUNS before exit (the core fix) ──────────────────────────
test('W10-s6/1 sync runs and lands before process exits (happy path)', () => {
  const fx = makeFixture();
  try {
    const r = runHook(fx, { mode: 'synced', filePath: fx.planPath });
    assert.equal(r.status, 0, `hook exits 0 (stderr: ${r.stderr})`);
    assert.ok(
      fs.existsSync(fx.sentinelPath),
      'the fake syncUnit sentinel EXISTS after exit — the async sync was awaited, ' +
      'not killed by an immediate process.exit'
    );
  } finally { rmFixture(fx); }
});

// ── Case 2: non-plan path is a no-op (regression guard) ───────────────────────
test('W10-s6/2 non-plan path is a no-op — syncUnit never fires', () => {
  const fx = makeFixture();
  try {
    const r = runHook(fx, { mode: 'synced', filePath: fx.nonPlanPath });
    assert.equal(r.status, 0, 'non-plan path exits 0');
    assert.ok(!fs.existsSync(fx.sentinelPath), 'no sentinel — isPlanMd early-return preserved');
  } finally { rmFixture(fx); }
});

// ── Case 3: sync rejection is logged, hook still exits 0 (fail-open) ───────────
test('W10-s6/3 sync rejection is logged and the hook still exits 0', () => {
  const fx = makeFixture();
  try {
    const r = runHook(fx, { mode: 'reject', filePath: fx.planPath });
    assert.equal(r.status, 0, 'a rejecting sync must not fail the tool call (fail-open)');
    const log = readLog(fx);
    assert.ok(
      log.some((e) => typeof e.error === 'string' && e.error.includes('fake embedder failure XYZZY')),
      'the rejection is recorded in .ctoc/logs/plan-index-sync.json'
    );
  } finally { rmFixture(fx); }
});

// ── Case 4: a hung embedder times out within budget but still exits 0 ──────────
test('W10-s6/4 a hung sync degrades within budget and still exits 0 (no hang)', () => {
  const fx = makeFixture();
  try {
    const r = runHook(fx, { mode: 'hang', filePath: fx.planPath, timeout: 15000 });
    assert.equal(r.status, 0, `a hung embedder must still exit 0 (signal: ${r.signal})`);
    assert.ok(
      r.elapsedMs < SYNC_BUDGET_MS + 8000,
      `hook returned in ${r.elapsedMs}ms — bounded by the ~${SYNC_BUDGET_MS}ms budget, not hung`
    );
    const log = readLog(fx);
    assert.ok(
      log.some((e) => typeof e.error === 'string' && /budget|timed out|timeout/i.test(e.error)),
      'a budget/timeout entry is logged when the sync exceeds its budget'
    );
  } finally { rmFixture(fx); }
});

// ── Case 5: PI0 wiring absent → fail-open no-op (unchanged posture) ────────────
test('W10-s6/5 absent PI0 wiring is a fail-open no-op', () => {
  const fx = makeFixture();
  try {
    const r = runHook(fx, { mode: 'absent-wiring', filePath: fx.planPath });
    assert.equal(r.status, 0, 'absent wiring exits 0 (fail-open)');
    assert.ok(!fs.existsSync(fx.sentinelPath), 'no sync attempted when wiring is absent');
  } finally { rmFixture(fx); }
});
