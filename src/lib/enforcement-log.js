/**
 * Enforcement Log (C1 / CTOC v7; durability hardened in W11-s2)
 *
 * Append-only JSONL log at .ctoc/logs/enforcement.json. Captures every decision
 * the PreToolUse enforcement hook makes: allow, block, escape,
 * silent-passthrough, hook-broken.
 *
 * Durability: writes go through the shared `durable-log` primitive, so each
 * record is a single atomic O_APPEND line (no unguarded read-modify-write —
 * concurrent writers never lose each other's entries), a corrupt/truncated file
 * is quarantined aside (bytes preserved) rather than silently reset to `[]`, and
 * a pre-existing legacy JSON-array log is migrated to JSONL on first append. The
 * `MAX_ENTRIES` cap is enforced via the primitive's `maxEntries` rotation.
 */

const durableLog = require('./durable-log');
const safeFs = require('./safe-fs');
const path = require('path');

const MAX_ENTRIES = 1000;

/**
 * Resolve the enforcement-log path for a project root.
 *
 * @param {string} root - Project root
 * @returns {string} absolute path to .ctoc/logs/enforcement.json
 */
function logPathFor(root) {
  return path.join(root, '.ctoc', 'logs', 'enforcement.json');
}

/**
 * Append an entry to the enforcement log, losslessly and atomically — INTO a
 * project that already exists, and NEVER creating one. Rotates to the last
 * MAX_ENTRIES entries; a corrupt existing file is quarantined, not reset.
 *
 * This audit write is best-effort: both enforcement callers wrap it in a
 * try/catch that fails open and ignore its return value, so it is permitted to
 * fail silently. An operation permitted to fail silently must NEVER
 * create the directory that decides whether a project exists. A fabricated
 * `.ctoc/` is read by setup and by the private root resolvers as proof the
 * project is initialised, leaving it permanently half-set-up — a live user hit
 * exactly this. This is the THIRD of the four `.ctoc/logs` marker producers slice
 * 00177 identified (the first two — `PreToolUse.Write.js` `appendLog` and the
 * plan-index sync-log — were fixed in v6.13.12), and it is the one on the live
 * enforcement hot path (every whitelisted plan-markdown Write reaches it).
 *
 * Guarding only the local `mkdirSync` is INSUFFICIENT: `durableLog.appendEntry`
 * itself re-creates `path.dirname(logPath)` = `root/.ctoc/logs` recursively
 * (durable-log.js:208-211), so the marker would be manufactured on the very next
 * line. The guard must therefore RETURN before `appendEntry` is reached when
 * `.ctoc/` is absent or the root is unusable. The leaf `logs/` is still created
 * beneath an EXISTING `.ctoc/` — a subdirectory under a marker setup already put
 * there manufactures nothing.
 *
 * @param {Object} entry - Decision details
 * @param {string} root - Project root
 * @returns {Object|null} the appended entry (with its timestamp), or `null` when
 *   the write is skipped because there is no `.ctoc/` to log into or the root is bad
 */
function logEnforcement(entry, root) {
  // Never fall back to a bad root (which would resolve the destination against
  // process.cwd()); a non-string/empty root is a total no-op.
  if (!root || typeof root !== 'string') return null;
  const ctocDir = path.join(root, '.ctoc');
  if (!safeFs.existsSync(ctocDir)) return null; // nothing to log INTO — never CREATE the marker

  const logDir = path.join(ctocDir, 'logs');
  if (!safeFs.existsSync(logDir)) safeFs.mkdirSync(logDir, { recursive: true }); // the LEAF only

  return durableLog.appendEntry(
    logPathFor(root),
    { timestamp: new Date().toISOString(), ...entry },
    { maxEntries: MAX_ENTRIES }
  );
}

/**
 * Read every enforcement-log entry as an in-memory Array. Delegates to the
 * durable-log reader so callers never depend on the on-disk format.
 *
 * @param {string} root - Project root
 * @returns {Array} the log entries (empty array if the log does not exist)
 */
function readLog(root) {
  return durableLog.readEntries(logPathFor(root));
}

module.exports = { logEnforcement, readLog };
