/**
 * Enforcement Liveness — does CTOC's edit protection actually still RUN? (plan 00170)
 *
 * THE MEASUREMENT THAT MOTIVATED THIS MODULE, taken 2026-07-20 inside this
 * repository: `.ctoc/logs/enforcement.json` held 24 entries under a 1000-entry
 * cap, so the log has demonstrably never rotated and those 24 lines are the
 * COMPLETE LIFETIME RECORD of every enforcement decision ever made here. The
 * newest ORGANIC entry was three days old, across a period of heavy building by
 * many agents, under a hook that logs unconditionally on all five of its
 * outcomes (whitelist, allow, escape, silent-passthrough, block). The hook file
 * itself was read in full and is correct; invoking it by hand produces a real
 * block and a real log entry. What could not be established from inside this
 * repository — and is deliberately NOT asserted anywhere here — is WHY the
 * harness stopped invoking it.
 *
 * The defect this module fixes is therefore a different one: not that the
 * protection can stop running, but that NOTHING NOTICED. A guard that has fallen
 * over and reports nothing is indistinguishable from a guard that is working and
 * has nothing to report. This repository has fixed that exact shape five times
 * (a parser whose no-match default was the success value; a verdict read off
 * truncated output; an exit that discarded pending writes). This is that shape
 * aimed at the layer every other guard is built on top of.
 *
 * ── WHY THERE IS NO DURATION THRESHOLD, and why you must not add one ──────────
 *
 * The tempting design is "warn if no decision in N hours". It is wrong, and the
 * reason is worth stating so the next reader does not re-add it: a duration
 * threshold treats SILENCE as the signal, and silence is exactly what a healthy
 * IDLE project and a DEAD hook have in common. A project touched monthly is
 * silent for a month and is perfectly healthy; the same silence on a project
 * edited every minute is an emergency. No N is right for both. Deriving N from
 * the historical logging rate fails hardest on the case that produced this
 * module — 24 decisions across several months — where almost any derived N reads
 * today's TOTAL ABSENCE as normal.
 *
 * So the signal is not silence. It is a DISAGREEMENT BETWEEN TWO OBSERVABLES,
 * and it carries no time constant at all:
 *
 *   the last recorded decision — the newest timestamp in the enforcement log,
 *                                written only by a hook that actually ran.
 *   the last unrecorded edit   — the newest modification time among the files
 *                                DECLARED by plans in the active stages, read
 *                                from the filesystem, which no hook mediates.
 *
 * A declared file that changed AFTER the newest recorded decision proves an edit
 * happened that no hook saw. An idle project has nothing newer than its last
 * decision and stays silent forever, however long it has been idle. A busy
 * project disagrees within seconds of the hook going quiet. THE PROJECT'S OWN
 * ACTIVITY SUPPLIES THE SCALE, so a daily and a monthly project need no
 * different answer. `GRANULARITY_MS` is the sole time constant and it is
 * PHYSICAL (filesystem modification-time granularity), not a policy knob.
 *
 * The witness is scoped to plan-DECLARED files on purpose. Modification times
 * move for reasons that are not tool calls — CTOC's own writes, `release.js`
 * rewriting VERSION, a version-control checkout, a package install. A whole-tree
 * scan would cry wolf, and a check that cries wolf gets turned off, which is
 * worse than no check at all. Declared files are precisely the paths an executor
 * edits THROUGH TOOL CALLS, each of which must produce an `allow` entry because
 * the covering plan is what grants it. This is EVIDENCE, NOT PROOF; the
 * confidence ladder and the wording both hold that line.
 *
 * ── WHY `unknown` MUST NEVER FOLD INTO `recording` ───────────────────────────
 *
 * "I could not look" is a WORSE position than "I looked and it is dead", because
 * it hides which one is true. Every read here is individually guarded, but a
 * guarded failure yields `'unreadable'` for that source and NO combination of
 * unreadable sources may ever produce `'recording'`. A check that reported health
 * off an instrument that could not see would be this repository's false-green
 * defect class eating its own fix.
 *
 * ── THE INSTRUMENT DELIBERATELY NOT BUILT ────────────────────────────────────
 *
 * This module OBSERVES ONLY. It performs no write, and it MUST NEVER be extended
 * to run a hook to test it, nor to repair what it measures. Running the hook
 * proves the hook FILE works and says nothing about whether the HARNESS invokes
 * it — and the measurement above is exactly the case where those two facts
 * diverge. A self-test would return a confident "enforcement is fine" on the one
 * situation this module exists to detect. A module that both diagnosed and
 * repaired would have no honest failure state.
 */

'use strict';

const path = require('path');
const safeFs = require('./safe-fs');
const enforcementLog = require('./enforcement-log');
const planCoverage = require('./plan-coverage');

/**
 * Filesystem modification-time granularity allowance. PHYSICAL, not policy: one
 * second on several filesystems, two on FAT derivatives. A declared file must be
 * newer than the last decision by MORE than this to count as unrecorded. This is
 * the only time constant in this module and adding a second one is the design
 * error the header argues against.
 */
const GRANULARITY_MS = 2000;

/**
 * How many DISTINCT declared files must have changed after the newest recorded
 * decision before the verdict is stated with high confidence (and therefore
 * earns advice). One file can move for one innocent reason — a single formatter
 * run, one file restored from version control. Two distinct declared files of
 * active plans is a pattern, not an accident. Chosen for the false-positive
 * direction: the cost of a wrongly-advised restart is a line the human learns to
 * ignore. On the case that produced this module the real count was dozens, so
 * this floor is nowhere near the decision boundary.
 */
const CORROBORATION_FLOOR = 2;

/**
 * The plan stages whose declared files form the edit witness.
 *
 * NOTE — this list intentionally differs from `plan-coverage`'s STAGE_PRIORITY,
 * which omits `implementation` because a pre-approval plan must never CONFER
 * PERMISSION. Here nothing is granted: the declaration is used only as a WITNESS
 * that a file is one an agent edits through tool calls. A wider witness can only
 * make this check more sensitive, never more permissive.
 */
const WITNESS_STAGES = ['in-progress', 'todo', 'implementation'];

/**
 * Whether a value is usable as a project root: a non-empty string with no NUL
 * byte that resolves to an existing directory. Anything else yields `unknown`
 * rather than a verdict computed against some other directory.
 *
 * @param {*} root - candidate project root
 * @returns {boolean} true iff `root` can be scanned
 */
function isUsableRoot(root) {
  if (typeof root !== 'string' || root.length === 0) return false;
  if (root.indexOf('\0') !== -1) return false;
  try {
    return safeFs.statSync(root).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Read the newest recorded decision, reporting WHICH way the instrument failed.
 *
 * The on-disk line format is never parsed here — `enforcementLog.readLog` owns
 * it. The only direct look at the raw bytes is a whitespace-emptiness check,
 * which distinguishes "the file exists and holds nothing" (`empty`) from "the
 * file holds bytes none of which are entries" (`unreadable`). Collapsing those
 * two would report a corrupt log as a merely-fresh one.
 *
 * @param {string} root - project root
 * @returns {{ source: 'has-entries'|'empty'|'absent'|'unreadable', lastMs: number|null, lastIso: string|null }}
 */
function readLastDecision(root) {
  /** @type {{ source: 'has-entries'|'empty'|'absent'|'unreadable', lastMs: number|null, lastIso: string|null }} */
  const blind = { source: 'unreadable', lastMs: null, lastIso: null };
  const logPath = path.join(root, '.ctoc', 'logs', 'enforcement.json');

  // No guard around `existsSync`: `root` is already known to be an existing
  // directory and the rest of the path is a fixed join, so it cannot throw here.
  // A guard whose branch no input can reach is untestable code pretending to be
  // safety — the outer catch in `protectionLiveness` is the real backstop.
  if (!safeFs.existsSync(logPath)) return { source: 'absent', lastMs: null, lastIso: null };

  let entries;
  try {
    entries = enforcementLog.readLog(root);
  } catch {
    // The log path exists but cannot be read at all (it is a directory, the
    // permissions deny it, …). Blind, never healthy.
    return blind;
  }
  if (!Array.isArray(entries)) return blind;

  if (entries.length === 0) {
    // Zero entries is ambiguous: a genuinely empty file, or a file whose every
    // line was malformed. Only the raw byte length separates them.
    let raw;
    try {
      raw = safeFs.readFileSync(logPath, 'utf8');
    } catch {
      return blind;
    }
    return raw.trim().length === 0
      ? { source: 'empty', lastMs: null, lastIso: null }
      : blind;
  }

  let newest = null;
  for (const entry of entries) {
    if (!entry || typeof entry.timestamp !== 'string') continue;
    const ms = Date.parse(entry.timestamp);
    if (Number.isNaN(ms)) continue;
    if (newest === null || ms > newest) newest = ms;
  }
  // Entries exist but NONE carries a usable timestamp: the instrument cannot
  // produce a cutoff, so it is unreadable — never `empty`, never a verdict.
  if (newest === null) return blind;

  return { source: 'has-entries', lastMs: newest, lastIso: new Date(newest).toISOString() };
}

/**
 * Collect the distinct, in-tree, non-glob paths declared by every plan in the
 * witness stages.
 *
 * A declaration that is a glob is skipped: it names a SET, not a file to stat,
 * and expanding it would mean walking the tree — the noisy witness this module
 * rejects. A declaration that escapes the project root is dropped entirely, so
 * a plan (plan files are edit-whitelisted, so an agent can author one) can never
 * make this module stat outside the tree.
 *
 * If ANY plan file cannot be read, `unreadable` is set. A witness that got
 * smaller because it could not look is precisely the defect this module exists
 * to remove, so blindness is reported rather than absorbed.
 *
 * @param {string} root - project root
 * @returns {{ paths: Set<string>, unreadable: boolean }}
 */
function collectDeclaredPaths(root) {
  const paths = new Set();
  let unreadable = false;

  for (const stage of WITNESS_STAGES) {
    const stageDir = path.join(root, 'plans', stage);
    let names;
    try {
      if (!safeFs.existsSync(stageDir)) continue; // a project need not have every stage
      names = safeFs.readdirSync(stageDir).filter((f) => f.endsWith('.md') && f !== '.gitkeep');
    } catch {
      unreadable = true;
      continue;
    }

    for (const name of names) {
      const planPath = path.join(stageDir, name);
      let declared;
      try {
        const content = safeFs.readFileSync(planPath, 'utf8');
        declared = planCoverage.readPlanFiles(planPath, content);
      } catch {
        unreadable = true;
        continue;
      }
      if (!Array.isArray(declared)) { unreadable = true; continue; }

      for (const decl of declared) {
        if (typeof decl !== 'string' || decl.length === 0) continue;
        if (decl.indexOf('\0') !== -1) continue;
        if (/[*?]/.test(decl)) continue;            // a set, not a file to stat
        if (path.isAbsolute(decl)) continue;        // declarations are repository-relative
        const abs = path.resolve(root, decl);
        const rel = path.relative(root, abs);
        if (rel === '' || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
          continue;                                  // escapes the tree: never stat'd
        }
        paths.add(abs);
      }
    }
  }

  return { paths, unreadable };
}

/**
 * Count the distinct declared files whose modification time is newer than the
 * last recorded decision by more than the granularity allowance.
 *
 * `lstatSync` is used rather than `statSync` so a symbolic link is measured as
 * itself and a dangling link is simply absent rather than a fault — a declared
 * path that does not exist is normal (a plan may declare a file it will create),
 * not evidence of anything.
 *
 * THE SCAN DELIBERATELY DOES NOT SHORT-CIRCUIT at the corroboration floor, and
 * the reason overrides the plan's own Step 12 instruction to do so. Stopping at
 * the floor caps `unrecordedCount` at 2, and that count is not bookkeeping — it
 * is the EVIDENCE the human judges the claim by. "2 files have changed" on a
 * project where thirty-five did understates the case to the one reader who
 * matters and makes a true alarm look marginal. The cost of counting in full is
 * bounded by construction: the witness is the set of plan-DECLARED LITERAL
 * paths (149 on this repository), never a tree walk, so this is a fixed handful
 * of `lstat` calls rather than a scan whose size grows with the repository.
 *
 * `newestMs` is the NEWEST such edit, used only by the beacon-freshness check in
 * `protectionLiveness`: a beacon written before the newest unrecorded edit cannot
 * have been produced by the tool call that made that edit, so the hook that writes
 * it had already gone quiet — that is what "stale" means here. It reuses this same
 * witness and the same `GRANULARITY_MS`; it introduces no new time constant.
 *
 * @param {Set<string>} paths - distinct absolute declared paths
 * @param {number} cutoffMs - the last recorded decision, in milliseconds
 * @returns {{ count: number, oldestMs: number|null, newestMs: number|null }}
 */
function countUnrecorded(paths, cutoffMs) {
  let count = 0;
  let oldestMs = null;
  let newestMs = null;
  for (const abs of paths) {
    let stat;
    try {
      stat = safeFs.lstatSync(abs);
    } catch {
      continue; // not yet created, or a dangling link: not evidence
    }
    if (!stat.isFile()) continue;
    if (stat.mtimeMs > cutoffMs + GRANULARITY_MS) {
      count += 1;
      if (oldestMs === null || stat.mtimeMs < oldestMs) oldestMs = stat.mtimeMs;
      if (newestMs === null || stat.mtimeMs > newestMs) newestMs = stat.mtimeMs;
    }
  }
  return { count, oldestMs, newestMs };
}

/**
 * Classify the hook-liveness beacon (plan 00171) — the SECOND, independent witness
 * to the enforcement log. It answers "did the hook system run in this session at
 * all?", which the enforcement log alone cannot separate from "the hooks ran but
 * enforcement specifically did not record".
 *
 * WHY `'absent'` AND `'stale'` MUST STAY DISTINCT. For an unbounded period after
 * this feature ships, EVERY already-running session has no beacon — the beacon did
 * not exist when those sessions started. Folding absence into staleness would tell
 * a large population of perfectly healthy sessions "your hooks are dead". More
 * sharply: if absence were treated as `'fresh'` instead, it would soften the
 * `not-recording` wording and DROP the restart advice 00170 earns — a missing new
 * instrument silencing a working old one, this defect class reproducing inside its
 * own fix. So `'absent'` is neither `'stale'` nor `'fresh'`; it is its own state.
 *
 * FRESHNESS IS A TIME QUESTION, NEVER A VERSION QUESTION. The recorded `version`
 * is read and reported so a future check can use it, but it does not touch the
 * verdict here — this slice draws no conclusion from a version mismatch. Freshness
 * is decided against the SAME edit witness 00170 computes: a beacon older than the
 * newest unrecorded edit (beyond `GRANULARITY_MS`) is stale, because the tool call
 * that changed that file should itself have produced a newer beacon.
 *
 * The beacon's own MODIFICATION TIME is the liveness signal, not the `at` field:
 * the file's mtime is filesystem truth about when the hook last wrote, it needs no
 * trust in the record's contents, and it is the same measure `countUnrecorded`
 * uses for edits — an apples-to-apples comparison.
 *
 * @param {string} root - project root
 * @param {number|null} newestUnrecordedMs - newest unrecorded edit time, or null
 * @returns {{ source: 'fresh'|'stale'|'absent'|'unreadable', version: string|null }}
 */
function classifyBeacon(root, newestUnrecordedMs) {
  const beaconPath = path.join(root, '.ctoc', 'state', 'hook-beacon.json');

  let stat;
  try {
    stat = safeFs.lstatSync(beaconPath);
  } catch {
    return { source: 'absent', version: null }; // no beacon file: not stale, not fresh
  }
  if (!stat.isFile()) return { source: 'unreadable', version: null }; // a directory, a link, …

  let record;
  try {
    record = JSON.parse(safeFs.readFileSync(beaconPath, 'utf8'));
  } catch {
    return { source: 'unreadable', version: null }; // bytes that are not JSON
  }
  if (!record || typeof record !== 'object') return { source: 'unreadable', version: null };

  const beaconVersion = typeof record.version === 'string' ? record.version : null;
  const stale = newestUnrecordedMs !== null && stat.mtimeMs + GRANULARITY_MS < newestUnrecordedMs;
  return { source: stale ? 'stale' : 'fresh', version: beaconVersion };
}

/**
 * Answer, for one project, whether CTOC's edit protection is still recording
 * decisions. NEVER THROWS: every fault yields `unknown` with the failing
 * instrument named in `sources`.
 *
 * @param {string} root - project root
 * @param {{ now?: number }} [opts] - injectable clock (milliseconds) so age
 *   assertions are deterministic without sleeping
 * @returns {{
 *   state: 'recording'|'not-recording'|'unknown',
 *   confidence: 'high'|'low'|null,
 *   lastDecisionAt: string|null,
 *   unrecordedCount: number,
 *   unrecordedSince: string|null,
 *   sources: {
 *     log: 'has-entries'|'empty'|'absent'|'unreadable',
 *     edits: 'observed'|'none'|'unreadable',
 *     beacon: 'fresh'|'stale'|'absent'|'unreadable'
 *   },
 *   reason: string,
 *   beaconVersion: string|null,
 *   asOf: number
 * }}
 */
function protectionLiveness(root, opts) {
  // The real clock first, so every fault path below — including one raised by
  // reading `opts` itself — still carries a usable `asOf`.
  let now = Date.now();

  /**
   * Shape one verdict. Declared inline so every return path is identical and no
   * field can be forgotten on a fault path.
   *
   * @param {object} fields - the verdict's distinguishing fields
   * @returns {object} a complete result
   */
  const verdict = (fields) => Object.assign({
    state: 'unknown',
    confidence: null,
    lastDecisionAt: null,
    unrecordedCount: 0,
    unrecordedSince: null,
    sources: { log: 'unreadable', edits: 'unreadable', beacon: 'unreadable' },
    reason: 'unknown',
    beaconVersion: null,
    asOf: now
  }, fields);

  try {
    // Reading `opts` is inside the guard on purpose: a caller can hand over an
    // object whose property access throws, and that must degrade to `unknown`
    // rather than take the screen down.
    if (opts && typeof opts.now === 'number' && Number.isFinite(opts.now)) now = opts.now;

    if (!isUsableRoot(root)) {
      return verdict({ reason: 'unusable-root' });
    }

    const decision = readLastDecision(root);

    // Without a cutoff there is no edit comparison to make. The beacon can still be
    // read on its own — with no unrecorded edit to be older than, a present beacon
    // is `fresh` and an absent one is `absent`. Report which way the log failed and
    // stop — `unknown`, never `recording`.
    if (decision.source !== 'has-entries') {
      const beacon = classifyBeacon(root, null);
      return verdict({
        sources: { log: decision.source, edits: 'none', beacon: beacon.source },
        beaconVersion: beacon.version,
        reason: decision.source === 'unreadable' ? 'instrument-unreadable' : 'never-recorded'
      });
    }

    const declared = collectDeclaredPaths(root);
    const { count, oldestMs, newestMs } = countUnrecorded(declared.paths, decision.lastMs);
    const beacon = classifyBeacon(root, newestMs);

    const editsSource = declared.unreadable
      ? 'unreadable'
      : (count > 0 ? 'observed' : 'none');
    const sources = { log: 'has-entries', edits: editsSource, beacon: beacon.source };
    const base = {
      sources,
      beaconVersion: beacon.version,
      lastDecisionAt: decision.lastIso,
      unrecordedCount: count,
      unrecordedSince: oldestMs === null ? null : new Date(oldestMs).toISOString()
    };

    if (count >= CORROBORATION_FLOOR) {
      // Positive evidence stands even if part of the witness was blind: not
      // being able to look can only HIDE unrecorded edits, never invent them.
      return verdict(Object.assign({}, base, {
        state: 'not-recording', confidence: 'high', reason: 'unrecorded-edits'
      }));
    }

    if (declared.unreadable) {
      // Below the floor with a witness that could not see the whole picture: the
      // small count may be an artifact of the blindness, so report blindness.
      return verdict(Object.assign({}, base, { reason: 'witness-unreadable' }));
    }

    if (count > 0) {
      return verdict(Object.assign({}, base, {
        state: 'not-recording', confidence: 'low', reason: 'unrecorded-edits-uncorroborated'
      }));
    }

    return verdict(Object.assign({}, base, { state: 'recording', reason: 'in-agreement' }));
  } catch {
    // Belt and braces over the individually-guarded reads above. An unexpected
    // fault is `unknown` — the one thing it may never be is `recording`.
    return verdict({ reason: 'instrument-unreadable' });
  }
}

/**
 * Render a human-legible age like `4 minutes ago`. Whole units only; the human
 * is judging a claim, not timing a race.
 *
 * @param {number} ms - an elapsed duration in milliseconds
 * @returns {string} the age phrase
 */
function agePhrase(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'} ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Render an instant as `09:12 on 17 Jul`, in the reader's local time — the
 * clock they were looking at when the edits happened.
 *
 * @param {string|null} iso - an ISO-8601 instant, or null
 * @returns {string} the formatted moment, or `an unknown time` if unusable
 */
function momentPhrase(iso) {
  if (typeof iso !== 'string') return 'an unknown time';
  const when = new Date(iso);
  const ms = when.getTime();
  if (Number.isNaN(ms)) return 'an unknown time';
  const hh = String(when.getHours()).padStart(2, '0');
  const mm = String(when.getMinutes()).padStart(2, '0');
  return `${hh}:${mm} on ${when.getDate()} ${MONTHS[when.getMonth()]}`;
}

/**
 * Turn a liveness result into the words a human reads. PURE, so the text is
 * asserted in-process with no rendering.
 *
 * Every line is built from a FIXED VOCABULARY plus a count and a formatted time.
 * NO VALUE READ OUT OF THE LOG EVER REACHES THIS TEXT — an enforcement entry
 * carries target file paths and could carry a newline, a terminal escape, a
 * format specifier or ten thousand characters, none of which may reach a
 * terminal. The one path shown, on the `unknown` line, is hardcoded.
 *
 * The vocabulary is the OWNER'S, never CTOC's internals: no hook names, no gate
 * numbers, no stage names. "Edit protection", "checked an edit", "your plans".
 *
 * @param {object} result - a `protectionLiveness` result
 * @returns {{ heading: string, lines: string[], severity: 'ok'|'warn'|'alarm' }}
 */
function describeProtection(result) {
  const heading = 'Edit protection';
  const r = result && typeof result === 'object' ? result : {};

  if (r.state === 'recording') {
    const age = typeof r.lastDecisionAt === 'string' && typeof r.asOf === 'number'
      ? agePhrase(r.asOf - Date.parse(r.lastDecisionAt))
      : null;
    return {
      heading,
      lines: [age ? `Active — CTOC checked an edit ${age}.` : 'Active — CTOC is checking edits.'],
      severity: 'ok'
    };
  }

  if (r.state === 'not-recording') {
    const count = Number.isFinite(r.unrecordedCount) ? r.unrecordedCount : 0;
    const noun = count === 1 ? 'file has' : 'files have';
    const beacon = r.sources && r.sources.beacon;

    // The beacon REFINES the words in this case; it adds no new state and never
    // changes the verdict. A FRESH beacon proves the hook system IS running, so the
    // silence must be enforcement SPECIFICALLY not recording — a fault to report,
    // for which a restart may not help. `'stale'`, `'absent'`, and an unreadable
    // beacon all keep 00170's original wording, so a MISSING new instrument can
    // never silence the working old one (the regression plan 00171 must not
    // introduce). `'absent'` alone additionally notes that the session may predate
    // this feature, so absence is never over-read as proof the hooks are dead.
    if (beacon === 'fresh') {
      return {
        heading,
        lines: [
          `${count} ${noun} changed since CTOC last checked one, at ${momentPhrase(r.lastDecisionAt)}.`,
          "CTOC's hooks are running, but your edits are not being checked against your plans.",
          'A restart may not fix this on its own — this looks like a fault to report.'
        ],
        severity: 'alarm'
      };
    }

    const lines = [
      `NOT RUNNING — ${count} ${noun} changed since CTOC last checked one, at ${momentPhrase(r.lastDecisionAt)}.`,
      'Edits are not being checked against your plans right now.'
    ];
    // Advice ONLY at high confidence, which requires both the corroboration
    // floor AND a record proving the protection worked in this project before.
    // Advising a restart on a project that never had it would be a guess
    // presented as a diagnosis.
    if (r.confidence === 'high') lines.push('Restart this session to load it again.');
    if (beacon === 'absent') {
      lines.push('This CTOC build records when its hooks run, but this session recorded none — it may predate that check.');
    }
    return { heading, lines, severity: r.confidence === 'high' ? 'alarm' : 'warn' };
  }

  if (r.reason === 'never-recorded') {
    return {
      heading,
      lines: [
        'Cannot tell — CTOC has no record of ever checking an edit in this project.',
        'That is normal for a new project, and it is not proof that anything is wrong.'
      ],
      severity: 'warn'
    };
  }

  return {
    heading,
    lines: [
      'Cannot tell — CTOC could not read its own record (.ctoc/logs/enforcement.json).',
      'Treat protection as OFF until this reads clean.'
    ],
    severity: 'alarm'
  };
}

module.exports = {
  protectionLiveness,
  describeProtection,
  GRANULARITY_MS,
  CORROBORATION_FLOOR
};
