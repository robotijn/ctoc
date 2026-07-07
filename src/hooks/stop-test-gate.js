#!/usr/bin/env node
/**
 * CTOC stop-test-gate — Stop hook
 *
 * Ported from the opus-pack stop-test-gate.sh. Enforces: no "done" without a
 * green suite. Loop-guarded (after 3 consecutive red gates it stands down and
 * forces an honest failure report instead of blocking forever). Opt-in and
 * escapable.
 *
 * I/O convention (matches src/hooks/andon-halt.js):
 *   - Exit 0 = ALLOW the stop / fail-open.
 *   - Exit 2 = BLOCK the stop (keep Claude working; stderr says why).
 *   - (exit 1 blocks NOTHING for a Stop hook — never used here.)
 *
 * GATED — default OFF (D-OM2-10):
 *   Reads `general.stopTestGate` from .ctoc/settings.yaml (flat parse, no YAML
 *   library — the safety-critical-hook convention). If not exactly `true`, the
 *   hook exits 0 immediately (near-zero cost). Running the FULL suite on every
 *   agent Stop would add minutes of latency for every public-marketplace user,
 *   which is the "grinding with no feedback = broken" failure this project's own
 *   CLAUDE.md warns against. Step-14 VERIFY already enforces "done = green"
 *   inside the Iron Loop; this Stop gate is an opt-in backstop for ad-hoc work.
 *
 * Escape: `CTOC_SKIP_TEST_GATE=1` short-circuits to exit 0 even when enabled.
 *
 * Cross-platform: all paths via path.join; npm binary resolved per-platform
 * (`npm.cmd` on win32); CTOC's own `node --test tests/*.test.js` glob is
 * expanded with fs.readdirSync + process.execPath argv (no shell); the
 * loop-guard counter lives under .ctoc/state/ via safe-fs.
 */

const path = require('path');
const { spawnSync } = require('child_process');

const safeFs = require('../lib/safe-fs');
const { findProjectRoot } = require('../lib/project-root');

const SETTINGS_PATH = path.join('.ctoc', 'settings.yaml');
const COUNTER_REL = path.join('.ctoc', 'state', '.test-gate-fails');
const MAX_ATTEMPTS = 3;

/**
 * Flat YAML extractor — reads only the `general.stopTestGate` boolean we need,
 * tracking the current top-level section. No YAML library (dependency-free, and
 * fast for a safety-critical hook), mirroring andon-halt.js's readYamlFlat.
 * @param {string} content
 * @returns {boolean} true iff `general.stopTestGate` is exactly true.
 */
function readStopTestGate(content) {
  if (!content) return false;
  let section = null;
  for (const raw of content.split('\n')) {
    const line = raw.replace(/#.*$/, '');
    if (line.trim() === '') continue;
    const indent = raw.match(/^[ \t]*/)[0].length;
    const m = line.match(/^[ \t]*([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim();
    if (indent === 0) {
      section = key;
      continue;
    }
    if (section === 'general' && key === 'stopTestGate') {
      return val === 'true';
    }
  }
  return false;
}

/** True iff the opt-in `general.stopTestGate` setting is enabled. */
function isGateEnabled(projectRoot) {
  const p = path.join(projectRoot, SETTINGS_PATH);
  if (!safeFs.existsSync(p)) return false;
  let content;
  try { content = safeFs.readFileSync(p, 'utf8'); } catch { return false; }
  return readStopTestGate(content);
}

/**
 * Resolve the test command as an argv array to run via spawnSync (shell:false).
 * Resolution order (F6): CTOC self-suite (node --test) -> package.json
 * scripts.test (npm test) -> null (no suite -> gate does not apply).
 * @param {string} projectRoot
 * @returns {{cmd: string, args: string[]}|null}
 */
function resolveTestCommand(projectRoot) {
  const pkgPath = path.join(projectRoot, 'package.json');
  let pkg = null;
  if (safeFs.existsSync(pkgPath)) {
    try { pkg = JSON.parse(safeFs.readFileSync(pkgPath, 'utf8')); } catch { pkg = null; }
  }

  const testScript = pkg && pkg.scripts && pkg.scripts.test;
  if (!testScript) return null;

  // CTOC's own suite: `node --test tests/*.test.js`. A glob needs a shell, so
  // expand it here with fs.readdirSync and run node directly (no shell).
  const globMatch = /node\s+--test\s+tests\/\*\.test\.js/.test(testScript);
  if (globMatch) {
    const testsDir = path.join(projectRoot, 'tests');
    let files = [];
    try {
      files = safeFs.readdirSync(testsDir)
        .filter(f => f.endsWith('.test.js'))
        .map(f => path.join(testsDir, f));
    } catch { files = []; }
    if (files.length === 0) return null;
    return { cmd: process.execPath, args: ['--test', ...files] };
  }

  // Fallback: run `npm test --silent` via the platform npm binary, argv-only.
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return { cmd: npm, args: ['test', '--silent'] };
}

/** Read the loop-guard fail counter (0 when absent/unreadable). */
function readFailCount(projectRoot) {
  const p = path.join(projectRoot, COUNTER_REL);
  if (!safeFs.existsSync(p)) return 0;
  try {
    const parsed = JSON.parse(safeFs.readFileSync(p, 'utf8'));
    return Number.isInteger(parsed.fails) ? parsed.fails : 0;
  } catch { return 0; }
}

/** Persist the loop-guard fail counter. */
function writeFailCount(projectRoot, fails) {
  const p = path.join(projectRoot, COUNTER_REL);
  try {
    safeFs.mkdirSync(path.dirname(p), { recursive: true });
    safeFs.writeFileSync(p, JSON.stringify({ fails }));
  } catch { /* counter is best-effort */ }
}

/** Delete the loop-guard fail counter. */
function clearFailCount(projectRoot) {
  const p = path.join(projectRoot, COUNTER_REL);
  try { safeFs.unlinkSync(p); } catch { /* already gone */ }
}

function writeStderr(msg) {
  try { process.stderr.write(msg); } catch { /* swallow */ }
}

function main() {
  // 1. Per-session escape.
  if (process.env.CTOC_SKIP_TEST_GATE === '1') process.exit(0);

  // 2. Resolve project root (fail-open on error).
  let projectRoot;
  try { projectRoot = findProjectRoot(process.cwd()); } catch { process.exit(0); }

  // 3. Opt-in check — default OFF.
  if (!isGateEnabled(projectRoot)) process.exit(0);

  // 4. Resolve the test command; no suite -> gate does not apply.
  const resolved = resolveTestCommand(projectRoot);
  if (!resolved) process.exit(0);

  // 5. Run it (no shell, argv array — injection-safe + cross-platform).
  let result;
  try {
    result = spawnSync(resolved.cmd, resolved.args, {
      cwd: projectRoot,
      shell: false,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    process.exit(0); // could not even spawn — fail open, gate does not apply
  }

  // spawnSync error (e.g. binary not found) -> fail open.
  if (result.error) process.exit(0);

  const status = result.status;

  // 6. GREEN — clear the counter and allow the stop.
  if (status === 0) {
    clearFailCount(projectRoot);
    process.exit(0);
  }

  // 7. RED — increment the loop-guard counter.
  const tail = ((result.stdout || '') + (result.stderr || ''))
    .split('\n').slice(-15).join('\n');
  const fails = readFailCount(projectRoot) + 1;

  if (fails >= MAX_ATTEMPTS) {
    clearFailCount(projectRoot);
    writeStderr(
      `\n[CTOC] stop-test-gate: the suite is still red after ${MAX_ATTEMPTS} attempts — ` +
      `standing down. Report the failure honestly to the human with the output below ` +
      `(fix the cause, never weaken the test).\n${tail}\n`
    );
    process.exit(0); // stand down — forces an honest failure report
  }

  writeFailCount(projectRoot, fails);
  writeStderr(
    `\n[CTOC] stop-test-gate BLOCKED stop: the suite is red. "Done" means green. ` +
    `Fix the cause (never weaken the test). Attempt ${fails}/${MAX_ATTEMPTS}.\n${tail}\n`
  );
  process.exit(2);
}

// Export pure helpers for testing; run main() only as a script.
module.exports = { resolveTestCommand, readFailCount, writeFailCount, readStopTestGate };

if (require.main === module) {
  main();
}
