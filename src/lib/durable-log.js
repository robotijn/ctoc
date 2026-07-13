/**
 * Durable Log — shared append-only JSONL primitive (W11-s1).
 *
 * Three CTOC audit logs (`enforcement.json`, `transitions.json`,
 * `gate-violations.json`) each independently implemented the same racy
 * read-modify-write: `JSON.parse(readFileSync(whole))` → push → `writeFileSync(whole)`,
 * with a `catch` that reset the file to `[]`. Two concurrent writers both read
 * `[N]`, both push, both write `[N+1]` → one entry is lost; a corrupt/truncated
 * file was silently reset to `[]` → the whole history was lost.
 *
 * This module implements the durability mechanism ONCE so all three logs
 * (slices s2/s3/s4) consume one tested primitive:
 *
 *   - **Append-only JSONL.** Each record is one line (`JSON.stringify(entry) + '\n'`)
 *     appended via a single `O_APPEND` write (`safeFs.appendFileSync`). O_APPEND
 *     sets the file offset to end-of-file atomically before each write, so
 *     concurrent whole-line appends on a local filesystem do not interleave or
 *     overwrite each other — the lost-update race is removed at its root, not
 *     merely narrowed. Reading the file first (to classify legacy/corrupt) does
 *     NOT reintroduce the race: the WRITE is still a pure atomic append, never a
 *     whole-file overwrite, so a concurrent appender cannot be clobbered.
 *
 *   - **Quarantine, not reset.** A wholly-unparseable existing file is renamed
 *     aside to `<path>.corrupt-<timestamp>` (bytes preserved) before a fresh log
 *     is started — the corrupt history is recoverable, never silently discarded.
 *
 *   - **Legacy migration.** Existing on-disk files are JSON arrays (`[ ... ]`).
 *     `readEntries` returns such an array as-is; the first `appendEntry` migrates
 *     it to JSONL once (atomic temp+rename) so the file never becomes a
 *     mixed array+JSONL hybrid that neither parser can read.
 *
 *   - **Torn-write tolerance.** A half-written trailing line (crash mid-append)
 *     is skipped by `readEntries` without discarding the intact prior lines.
 *
 *   - **Rotation.** Optional `maxEntries` rewrites the file to its last
 *     `maxEntries` lines via atomic temp+rename (a rare boundary op; the common
 *     append path stays a pure `O_APPEND`).
 *
 * Cross-platform: only `path.join`/`path.dirname`; temp names include
 * `process.pid`; the quarantine timestamp replaces `:` with `-` for Windows
 * filename safety. No POSIX-only calls (in particular, no `fsync`-on-directory,
 * which Windows does not support — durability here rests on O_APPEND atomicity
 * for the common path and atomic rename for the boundary ops, both of which are
 * available on all three target platforms).
 */

'use strict';

const path = require('path');
const safeFs = require('./safe-fs');

/**
 * Convert a Date to an ISO 8601 string with `:` replaced by `-` so the result
 * is a legal filename on Windows (which forbids `:` in file names).
 *
 * @param {Date} when - the instant to render
 * @returns {string} an ISO-8601-derived, filename-safe timestamp
 */
function isoSafe(when) {
  return when.toISOString().replace(/:/g, '-');
}

/**
 * Compute the quarantine path for a corrupt log file: a sibling in the SAME
 * directory named `<logPath>.corrupt-<filename-safe-timestamp>`. Staying in the
 * same directory (derived only from the original path + a timestamp) means the
 * rename can never traverse out of the log directory.
 *
 * @param {string} logPath - the original log file path
 * @param {Date} [when] - the timestamp to embed (defaults to now)
 * @returns {string} the quarantine sibling path
 */
function quarantinePath(logPath, when) {
  const stamp = isoSafe(when instanceof Date ? when : new Date());
  return `${logPath}.corrupt-${stamp}`;
}

/**
 * Parse a single non-empty JSONL line, returning `{ ok, value }`. A line that
 * does not parse (e.g. a torn trailing write) yields `{ ok: false }` rather than
 * throwing, so one bad line never discards the whole file.
 *
 * @param {string} line - a candidate JSONL line (already known non-empty)
 * @returns {{ ok: boolean, value?: * }}
 */
function parseLine(line) {
  try {
    return { ok: true, value: JSON.parse(line) };
  } catch {
    return { ok: false };
  }
}

/**
 * Split raw file text into JSONL entries, skipping blank and unparseable lines.
 *
 * @param {string} raw - the whole file contents
 * @returns {Array} the entries that parsed
 */
function parseJsonl(raw) {
  const out = [];
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const parsed = parseLine(line);
    if (parsed.ok) out.push(parsed.value);
  }
  return out;
}

/**
 * Classify the raw contents of an existing log file so `appendEntry` can decide
 * whether to append directly, migrate a legacy array, or quarantine corruption.
 *
 *   - `'empty'`        — absent/blank/whitespace: treat as a fresh JSONL file.
 *   - `'legacy-array'` — the whole file is a JSON array (pre-JSONL format).
 *   - `'jsonl'`        — at least one line parses as JSON (torn tail tolerated).
 *   - `'corrupt'`      — non-empty, not a JSON array, and zero lines parse.
 *
 * @param {string} raw - the whole file contents
 * @returns {'empty'|'legacy-array'|'jsonl'|'corrupt'}
 */
function classify(raw) {
  if (raw.trim().length === 0) return 'empty';
  // A whole-file JSON array is the legacy format. (A single JSONL object line
  // also parses whole, but as a non-array — that falls through to the line
  // check below and is correctly treated as JSONL.)
  try {
    const whole = JSON.parse(raw);
    if (Array.isArray(whole)) return 'legacy-array';
  } catch {
    // Not a single JSON value — may still be valid JSONL; checked next.
  }
  if (parseJsonl(raw).length > 0) return 'jsonl';
  return 'corrupt';
}

/**
 * Serialize entries to JSONL text (one JSON object per line, trailing newline).
 *
 * @param {Array} entries - the records to serialize
 * @returns {string} JSONL text (empty string for an empty array)
 */
function toJsonl(entries) {
  if (entries.length === 0) return '';
  return entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

/**
 * Atomically replace `logPath` with the JSONL serialization of `entries`, via a
 * pid-namespaced temp file + rename (rename-over-existing is atomic on all three
 * target platforms). Used only on the rare migration and rotation boundaries —
 * never on the common append path.
 *
 * @param {string} logPath - the destination log path
 * @param {Array} entries - the records to write
 */
function writeAtomic(logPath, entries) {
  const tmp = `${logPath}.tmp-${process.pid}`;
  safeFs.writeFileSync(tmp, toJsonl(entries), 'utf8');
  safeFs.renameSync(tmp, logPath);
}

/**
 * Read every entry from a durable log, as an in-memory Array (the contract the
 * three existing consumers depend on — the on-disk format changes, this does not).
 *
 *   - Missing file → `[]`.
 *   - Legacy whole-file JSON array → returned as-is (fast path).
 *   - Otherwise → parsed line by line, skipping blank/torn lines (never throws,
 *     never discards the whole file for one bad line).
 *   - Wholly-unparseable non-empty file → `[]` (the next `appendEntry`
 *     quarantines it; a pure read never mutates the file).
 *
 * @param {string} logPath - the log file path
 * @returns {Array} the entries (possibly empty)
 */
function readEntries(logPath) {
  if (!safeFs.existsSync(logPath)) return [];
  const raw = safeFs.readFileSync(logPath, 'utf8');
  if (raw.trim().length === 0) return [];
  try {
    const whole = JSON.parse(raw);
    if (Array.isArray(whole)) return whole;
  } catch {
    // Not a single JSON value — fall through to line-by-line parsing.
  }
  return parseJsonl(raw);
}

/**
 * Append one record to a durable log, losslessly and atomically.
 *
 * The append itself is a single `O_APPEND` write (via `safeFs.appendFileSync`),
 * so concurrent writers never lose each other's records. Before appending, an
 * existing file is classified: a legacy JSON array is migrated to JSONL once,
 * and a wholly-corrupt file is quarantined (renamed aside, bytes preserved)
 * rather than overwritten. With `options.maxEntries`, the file is rotated to its
 * last `maxEntries` lines after the append (atomic temp+rename).
 *
 * @param {string} logPath - the log file path
 * @param {object} entry - the record to append (must be JSON-serializable)
 * @param {{ maxEntries?: number }} [options] - optional rotation cap
 * @returns {object} the appended `entry`
 * @throws on unrecoverable filesystem errors (never silently swallowed)
 */
function appendEntry(logPath, entry, options) {
  const dir = path.dirname(logPath);
  if (!safeFs.existsSync(dir)) {
    safeFs.mkdirSync(dir, { recursive: true });
  }

  if (safeFs.existsSync(logPath)) {
    const raw = safeFs.readFileSync(logPath, 'utf8');
    const kind = classify(raw);
    if (kind === 'legacy-array') {
      // Migrate the legacy array to JSONL once (atomic) before appending, so the
      // file never becomes an array+JSONL hybrid neither parser can read.
      writeAtomic(logPath, JSON.parse(raw));
    } else if (kind === 'corrupt') {
      // Preserve the corrupt bytes under a quarantine name; start a fresh log.
      safeFs.renameSync(logPath, quarantinePath(logPath));
    }
    // 'empty' and 'jsonl' need no preparation — append directly below.
  }

  // The load-bearing durability step: a single atomic O_APPEND write.
  safeFs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');

  // Rotation is a rare boundary op; the common append path above stays pure.
  if (options && typeof options.maxEntries === 'number' && options.maxEntries > 0) {
    const entries = readEntries(logPath);
    if (entries.length > options.maxEntries) {
      writeAtomic(logPath, entries.slice(entries.length - options.maxEntries));
    }
  }

  return entry;
}

module.exports = {
  appendEntry,
  readEntries,
  quarantinePath
};
