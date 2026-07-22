'use strict';

/**
 * Slice 00177 — a best-effort advisory log must NEVER manufacture the `.ctoc/`
 * marker that gates project setup.
 *
 * THE DEFECT (dated 2026-07-20, permanently-uninitialisable projects). A hook's
 * best-effort log did `mkdirSync(path.join(projectPath, '.ctoc', 'logs'),
 * { recursive: true })`. `recursive: true` CREATES `.ctoc/` as a parent — and when
 * the resolved root is bad or absent the destination falls back to
 * `process.cwd()`. That fabricated `.ctoc/` then satisfied setup's old trigger
 * ("initialise only when `.ctoc/` is absent"), so the project was left
 * half-initialised and the pipeline ran silently broken. Slice 00176 stopped setup
 * keying on the marker; THIS slice removes the CAUSE at the two producers on the
 * plan-write hook path, because other code (the private root resolvers of later
 * slices) still reads a bare `.ctoc/` as a project root.
 *
 * TWO SITES under test:
 *   • Site one — `PreToolUse.Write.js` `appendLog`, reached through the exported
 *     `run()` on any plan-markdown Write. Driven here IN-PROCESS via `run(payload,
 *     deps)` with an injected `checkDuplicate` (ZERO network, ZERO embedding) and a
 *     capturing stderr sink, plus a REAL spawned child process for the end-to-end
 *     "measure is the human" assertion.
 *   • Site two — `PostToolUse.plan-index-sync.js`, whose `logDir` expression names
 *     the sync log's destination. Exposed for test as `resolveSyncLogDir(root)`,
 *     called by the live `main()`.
 *
 * ISOLATION NOTE (a plan correction, reported up). The plan's case 11 asks to
 * spawn the FULL Write hook (`main()` → enforcement delegate) in an empty directory
 * and assert `.ctoc/` is absent. That cannot hold within this slice's scope: a
 * plan-markdown target is WHITELISTED by the enforcement delegate, and
 * `PreToolUse.Edit.js`'s `allow('whitelist', …)` calls
 * `enforcement-log.js logEnforcement()`, which itself does
 * `mkdirSync(root/.ctoc/logs, { recursive: true })` — a THIRD `.ctoc/` producer
 * this slice does not fix (out of scope; not a declared file). So the real-process
 * case here drives the advisory `run()` path as a real child process (the code this
 * slice owns), NOT `main()`, so its red/green tracks THIS fix and not the unrelated
 * enforcement creator.
 *
 * Fixtures write ONLY under a per-test `os.tmpdir()` directory and are removed in
 * teardown — never the repo root. Cross-platform: `path.join`, `os.tmpdir`,
 * `fs.rmSync`, `process.execPath`; no shell.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawnSync } = require('child_process');

const writeHook = require('../src/hooks/PreToolUse.Write.js');
const syncHook = require('../src/hooks/PostToolUse.plan-index-sync.js');

const WRITE_HOOK_PATH = path.join(__dirname, '..', 'src', 'hooks', 'PreToolUse.Write.js');

// ── fixtures ────────────────────────────────────────────────────────────────
const created = [];
function mkTmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `s00177-${prefix}-`));
  created.push(d);
  return d;
}
after(() => {
  for (const d of created) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

/** A capturing stderr sink: records every chunk, exposes the joined text. */
function makeStderr() {
  const chunks = [];
  return { write: (s) => { chunks.push(String(s)); return true; }, text: () => chunks.join('') };
}

/** An injected checkDuplicate that always surfaces one near-duplicate warning. */
const warnOnce = async () => [{ plan: 'plans/functional/other.md', similarity: 0.91 }];

/** A realistic plan-markdown Write payload. */
function planPayload() {
  return {
    tool_name: 'Write',
    tool_input: {
      file_path: 'plans/functional/auth-layer-cleanup.md',
      content: '---\ntitle: Auth layer cleanup\n---\n## Goal\nRefactor auth middleware.',
    },
  };
}

/** Drive site one's advisory guard in-process. Returns { result, stderr }. */
async function driveWrite(projectPath) {
  const stderr = makeStderr();
  const deps = { checkDuplicate: warnOnce, stderr };
  if (projectPath !== undefined) deps.projectPath = projectPath;
  const result = await writeHook.run(planPayload(), deps);
  return { result, stderr };
}

// ── SITE ONE — PreToolUse.Write.js appendLog (via run()) ─────────────────────
describe('site one: the advisory Write log never manufactures .ctoc/', () => {
  it('1) a plan write in an un-initialised directory creates no marker', async () => {
    const dir = mkTmp('uninit');
    const { result } = await driveWrite(dir);
    assert.strictEqual(result.warned, true, 'the guard still ran and warned');
    assert.ok(!fs.existsSync(path.join(dir, '.ctoc')), '.ctoc/ must NOT be manufactured by a log write');
  });

  it('2) the human is still told — the warning reaches stderr regardless', async () => {
    const dir = mkTmp('uninit-stderr');
    const { stderr } = await driveWrite(dir);
    assert.ok(stderr.text().includes('possible duplicate'), 'the advisory warning is still emitted to stderr');
    assert.ok(stderr.text().includes('plans/functional/other.md'), 'the duplicate slug is named');
  });

  it('3) a real project still gets its durable log', async () => {
    const dir = mkTmp('real');
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.ctoc', 'settings.yaml'), 'enforcement:\n  mode: strict\n');
    await driveWrite(dir);
    const logFile = path.join(dir, '.ctoc', 'logs', 'plan-index.log');
    assert.ok(fs.existsSync(logFile), '.ctoc/logs/plan-index.log is written in a real project');
    assert.ok(fs.readFileSync(logFile, 'utf8').includes('possible duplicate'), 'the warning line is persisted');
  });

  it('4) the LEAF logs/ is created under an existing .ctoc/ parent', async () => {
    const dir = mkTmp('leaf');
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true }); // parent exists, no logs/ yet
    await driveWrite(dir);
    assert.ok(fs.existsSync(path.join(dir, '.ctoc', 'logs')), 'the leaf logs/ IS created under an existing parent');
    assert.ok(fs.existsSync(path.join(dir, '.ctoc', 'logs', 'plan-index.log')), 'and the log file is written');
  });

  it('5) a bare, empty .ctoc/ still receives logs (health is not judged here)', async () => {
    const dir = mkTmp('bare');
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    await driveWrite(dir);
    assert.ok(fs.existsSync(path.join(dir, '.ctoc', 'logs', 'plan-index.log')), 'the rule is "do not CREATE the marker", not "judge project health"');
  });

  it('6) still best-effort when .ctoc exists as a FILE — no throw, write not broken', async () => {
    const dir = mkTmp('hostile');
    fs.writeFileSync(path.join(dir, '.ctoc'), 'not a directory'); // .ctoc is a FILE
    const { result } = await driveWrite(dir);
    assert.strictEqual(result.warned, true, 'run() resolves normally; the log failure is swallowed');
    assert.ok(fs.statSync(path.join(dir, '.ctoc')).isFile(), '.ctoc is left as the file it was');
  });

  it('12) a nested repository is not polluted by its parent project', async () => {
    const outer = mkTmp('outer');
    fs.mkdirSync(path.join(outer, '.ctoc'), { recursive: true });
    const inner = path.join(outer, 'inner');
    fs.mkdirSync(path.join(inner, '.git'), { recursive: true });
    await driveWrite(inner); // projectPath is the inner, un-initialised repo
    assert.ok(!fs.existsSync(path.join(inner, '.ctoc')), 'the inner repo gets no fabricated .ctoc/');
  });
});

// ── SITE ONE — real spawned process (the "measure is the human" assertion) ───
describe('site one, end to end: the real advisory path, driven as a process', () => {
  // A tiny driver requires the REAL hook module and calls its exported run() with
  // an injected warning and NO projectPath, so appendLog takes the
  // `deps.projectPath || process.cwd()` fallback against the child's cwd. It drives
  // the code this slice owns (the advisory guard) WITHOUT the enforcement delegate,
  // whose own enforcement-log write is an out-of-scope third `.ctoc/` producer.
  const DRIVER = [
    'const hook = require(process.argv[2]);', // argv[2] = the hook path (argv[1] is this driver)
    'hook.run({ tool_name: "Write", tool_input: {',
    '  file_path: "plans/functional/x.md",',
    '  content: "---\\ntitle: X\\n---\\nbody" } }, {',
    '  checkDuplicate: async () => [{ plan: "plans/functional/dup.md", similarity: 0.9 }],',
    '  stderr: process.stderr',
    '}).then(() => process.exit(0), () => process.exit(0));',
  ].join('\n');

  function spawnDriver(cwd) {
    const driverPath = path.join(cwd, 'driver.js');
    fs.writeFileSync(driverPath, DRIVER);
    const res = spawnSync(process.execPath, [driverPath, WRITE_HOOK_PATH], {
      cwd,
      encoding: 'utf8',
    });
    fs.rmSync(driverPath, { force: true });
    return res;
  }

  it('7) the working-directory fallback cannot manufacture a marker', () => {
    const dir = mkTmp('cwd-fallback');
    const res = spawnDriver(dir);
    assert.strictEqual(res.status, 0, `driver exited cleanly; stderr:\n${res.stderr}`);
    assert.ok(res.stderr.includes('possible duplicate'), 'the warning still surfaced to the human');
    assert.ok(!fs.existsSync(path.join(dir, '.ctoc')), 'no .ctoc/ is created in the working directory');
  });

  it('11) driven as a real process, the reported route leaves no marker', () => {
    const dir = mkTmp('e2e');
    const before = fs.readdirSync(dir).sort();
    spawnDriver(dir);
    const afterList = fs.readdirSync(dir).sort();
    assert.ok(!fs.existsSync(path.join(dir, '.ctoc')), 'the marker is absent — the exact condition that made a project permanently uninitialisable');
    assert.deepStrictEqual(afterList, before, 'the directory is byte-identical afterwards (driver cleaned itself up)');
  });
});

// ── SITE TWO — PostToolUse.plan-index-sync.js resolveSyncLogDir ──────────────
describe('site two: the sync log names a destination only when .ctoc/ exists', () => {
  it('8) an un-initialised project yields undefined and creates no marker', () => {
    const dir = mkTmp('sync-uninit');
    const logDir = syncHook.resolveSyncLogDir(dir);
    assert.strictEqual(logDir, undefined, 'no destination is named when .ctoc/ is absent');
    assert.ok(!fs.existsSync(path.join(dir, '.ctoc')), 'resolving a destination must not CREATE one');
  });

  it('9) a real project yields the real .ctoc/logs path', () => {
    const dir = mkTmp('sync-real');
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    const logDir = syncHook.resolveSyncLogDir(dir);
    assert.strictEqual(logDir, path.join(dir, '.ctoc', 'logs'), 'the real destination is named under an existing .ctoc/');
  });

  it('9b) a falsy root yields undefined without throwing', () => {
    assert.strictEqual(syncHook.resolveSyncLogDir(''), undefined);
    assert.strictEqual(syncHook.resolveSyncLogDir(undefined), undefined);
  });
});

// ── BOTH SITES — they agree ──────────────────────────────────────────────────
describe('both sites agree in an un-initialised project', () => {
  it('10) neither the write log nor the sync log creates .ctoc/', async () => {
    const dir = mkTmp('agree');
    fs.mkdirSync(path.join(dir, 'plans', 'functional'), { recursive: true });
    const beforeList = fs.readdirSync(dir).sort();

    await driveWrite(dir);                 // site one
    const logDir = syncHook.resolveSyncLogDir(dir); // site two

    assert.strictEqual(logDir, undefined, 'site two names no destination');
    assert.ok(!fs.existsSync(path.join(dir, '.ctoc')), 'neither site manufactured .ctoc/');
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), beforeList, 'the directory is unchanged apart from nothing');
  });
});
