'use strict';

/**
 * Sufficiency-crossing auditor (plan 00180).
 *
 * Answers ONE question about a CTOC project's history: has a human gate ever been
 * crossed WITHOUT a human — by the sufficiency gate advancing a plan on its own —
 * and if so, on what evidence? Or it says, honestly, that the answer cannot be
 * determined.
 *
 * THE DEFECT THIS AUDITOR MUST NOT COMMIT. "I found no sufficiency crossing" and
 * "I could not read the ledger" are the SAME empty result from a naive
 * implementation, and telling them apart is the entire subject of the repair set
 * this slice opens. So there are THREE verdicts, never two:
 *
 *   never-crossed — the ledger directory EXISTS and was read, and no entry is a
 *                   sufficiency crossing.
 *   crossed       — one or more sufficiency entries were found, each reported with
 *                   its slug, stages, timestamp, evidence, parsed ref, and the
 *                   state of the questions file that authorised it.
 *   undetermined  — the ledger directory is absent/unreadable, OR any entry file
 *                   could not be parsed, OR any entry carried unrecognised
 *                   provenance. A partial answer that NAMES its gaps, never a
 *                   confident "clean".
 *
 * Every unknown count is `null`, never `0` — `0` is a measurement, and this
 * auditor exists precisely because a blind zero was reported as a real one.
 *
 * REUSE, NOT RE-IMPLEMENTATION. The corrupt-vs-absent-vs-ok distinction
 * (`readEntryResult`) and the provenance classifier (`entryKind`) already exist in
 * `approval-ledger.js` and are the exact fingerprints of this repair set; a private
 * second copy of either is how the two drift. The ref that names the authorising
 * questions file is parsed from the entry's `evidence` string, because a sufficiency
 * entry stores no `ref` field (see `streaming-gate.crossBySufficiency`).
 *
 * Pure-ish and FAIL-SOFT: every filesystem failure becomes a REPORTED state. The
 * only throw is a non-string `projectRoot` (a programmer error, not a data state).
 * All I/O routes through `safe-fs` and every path is composed with `path.join`, so
 * the module is cross-platform and never shells out.
 */

const safeFs = require('./safe-fs');
const { ledgerDir, readEntryResult, entryKind } = require('./approval-ledger');
const { questionsPath } = require('./streaming-precompute');

/**
 * Strip C0/C1 control characters from subagent-influenced ledger text before it is
 * carried into a report a human reads. Matches the one-line strip replicated across
 * the codebase (streaming-gate.js, tui.js, tools.js) — there is no shared export.
 * @param {*} s
 * @returns {string}
 */
function stripCtl(s) {
  return String(s).replace(/[\x00-\x1f\x7f-\x9f]/g, '');
}

/**
 * The plan ref a sufficiency entry authorised, parsed from the leading
 * `sufficiency: <ref> — ` segment of its `evidence` string (the exact shape
 * `crossBySufficiency` writes). Returns `null` when the evidence does not match
 * that shape — a gap the auditor NAMES rather than a fabricated ref.
 * @param {*} evidence
 * @returns {string|null}
 */
function parseRef(evidence) {
  if (typeof evidence !== 'string') return null;
  const m = evidence.match(/^sufficiency:\s*(\S+)\s+—/);
  return m ? m[1] : null;
}

/** The questions sub-object when nothing about the questions file can be known. */
const QUESTIONS_UNKNOWN = { present: null, total: null, blocking: null, empty: null, unattested: true };

/**
 * Inspect the questions file that authorised a crossing. Every count is `null` when
 * it cannot be established; `unattested` is `true` unless a present, readable,
 * NON-EMPTY question set positively backs the crossing.
 *
 * @param {string} root project root
 * @param {string|null} ref the parsed ref, or null when unresolvable
 * @returns {{present: (boolean|null), total: (number|null), blocking: (number|null),
 *   empty: (boolean|null), unattested: boolean}}
 */
function auditQuestions(root, ref) {
  const qp = ref === null ? null : questionsPath(root, ref);
  // Unresolvable ref: we could not even look for a questions file.
  if (qp === null) return { ...QUESTIONS_UNKNOWN };
  // The file may legitimately have been regenerated or removed since the crossing —
  // report absent as absent, never inferred to have been empty.
  if (!safeFs.existsSync(qp)) {
    return { present: false, total: null, blocking: null, empty: null, unattested: true };
  }
  let parsed;
  try {
    parsed = JSON.parse(safeFs.readFileSync(qp, 'utf8'));
  } catch {
    // Present but unreadable/unparseable: known to exist, counts unknown.
    return { present: true, total: null, blocking: null, empty: null, unattested: true };
  }
  const qs = parsed && Array.isArray(parsed.questions) ? parsed.questions : null;
  if (qs === null) {
    return { present: true, total: null, blocking: null, empty: null, unattested: true };
  }
  const total = qs.length;
  const blocking = qs.filter((question) => question && (question.critical === true || question.important === true)).length;
  const empty = total === 0;
  // A crossing authorised by an EMPTY question set is unattested — the defect's
  // fingerprint in history.
  return { present: true, total, blocking, empty, unattested: empty };
}

/**
 * Build the reported record for one sufficiency crossing.
 * @param {string} root
 * @param {string} slug
 * @param {object} entry the parsed `ok` ledger entry
 * @returns {{slug: string, stageFrom: (string|null), stageTo: (string|null),
 *   at: (string|null), evidence: string, ref: (string|null), questions: object}}
 */
function buildCrossing(root, slug, entry) {
  const ref = parseRef(entry.evidence);
  return {
    slug,
    stageFrom: entry.stage_from == null ? null : String(entry.stage_from),
    stageTo: entry.stage_to == null ? null : String(entry.stage_to),
    at: entry.approved_at == null ? null : String(entry.approved_at),
    evidence: stripCtl(entry.evidence == null ? '' : entry.evidence),
    ref,
    questions: auditQuestions(root, ref),
  };
}

/**
 * Audit a project's approval ledger for sufficiency crossings.
 *
 * @param {string} projectRoot the project root
 * @returns {{verdict: ('never-crossed'|'crossed'|'undetermined'),
 *   crossings: Array<object>, unreadable: Array<{file: string, reason: string}>,
 *   ledgerPresent: boolean, scanned: number}}
 * @throws {TypeError} when `projectRoot` is not a string (a programmer error; every
 *   filesystem failure is a reported state, never a throw).
 */
function auditSufficiencyCrossings(projectRoot) {
  if (typeof projectRoot !== 'string') {
    throw new TypeError('auditSufficiencyCrossings: projectRoot must be a string');
  }

  const dir = ledgerDir(projectRoot);
  let files;
  try {
    files = safeFs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    // The directory is absent or unlistable: "I could not look." This is the empty
    // result that must NEVER read as never-crossed.
    return { verdict: 'undetermined', crossings: [], unreadable: [], ledgerPresent: false, scanned: 0 };
  }

  const crossings = [];
  const unreadable = [];
  let scanned = 0;

  for (const file of files) {
    const slug = file.replace(/\.json$/i, '');
    const res = readEntryResult(slug, projectRoot);
    scanned += 1;
    if (res.status === 'ok') {
      const kind = entryKind(res.entry);
      if (kind === 'unknown') {
        // Unrecognised provenance — never silently skipped, never counted as a crossing.
        unreadable.push({ file, reason: 'unknown-provenance' });
      } else if (kind === 'sufficiency') {
        crossings.push(buildCrossing(projectRoot, slug, res.entry));
      }
      // human / backfilled / pipeline entries are legitimately ignored.
      continue;
    }
    if (res.status === 'corrupt' || res.status === 'unkeyable') {
      unreadable.push({ file, reason: res.status });
    }
    // 'absent' (a file listed by readdir then gone by the time it was read — a race)
    // is nothing to audit and nothing to flag.
  }

  const verdict = unreadable.length > 0
    ? 'undetermined'
    : crossings.length > 0 ? 'crossed' : 'never-crossed';

  return { verdict, crossings, unreadable, ledgerPresent: true, scanned };
}

/**
 * Render an audit result as human-readable text. The two empty results
 * (never-crossed vs undetermined) render as DISTINCT strings, neither readable as
 * the other. Every unknown count shows as `?`, never as `0`.
 *
 * @param {object} result the value from {@link auditSufficiencyCrossings}
 * @returns {string}
 */
function formatAuditReport(result) {
  const r = result || {};
  const scanned = Number.isFinite(r.scanned) ? r.scanned : 0;
  const entries = (n) => `${n} ledger entr${n === 1 ? 'y' : 'ies'}`;
  const crossings = Array.isArray(r.crossings) ? r.crossings : [];
  const unreadable = Array.isArray(r.unreadable) ? r.unreadable : [];
  const lines = [];

  if (r.verdict === 'crossed') {
    lines.push(`gate crossings: ${crossings.length} sufficiency crossing(s) among ${entries(scanned)} — a gate advanced with no human`);
    for (const cr of crossings) {
      const qn = cr.questions || {};
      const attest = qn.unattested
        ? 'UNATTESTED (no non-empty question set backs this crossing)'
        : `attested by ${qn.total} question(s)`;
      const ref = cr.ref == null ? '(ref unresolvable)' : stripCtl(cr.ref);
      lines.push(`  ${stripCtl(cr.slug)}: ${cr.stageFrom} → ${cr.stageTo} at ${cr.at} [${ref}] — ${attest}`);
    }
  } else if (r.verdict === 'undetermined') {
    if (!r.ledgerPresent) {
      lines.push('gate crossings: UNDETERMINED — the approval ledger is absent or unreadable, so history cannot be established');
    } else {
      lines.push(`gate crossings: UNDETERMINED — scanned ${entries(scanned)}, but ${unreadable.length} could not be read (a gap, not a clean history)`);
      for (const u of unreadable) {
        lines.push(`  unreadable: ${stripCtl(u.file)} (${stripCtl(u.reason)})`);
      }
    }
  } else {
    lines.push(`gate crossings: none — scanned ${entries(scanned)}, no gate was ever crossed without a human`);
  }

  return lines.join('\n');
}

module.exports = { auditSufficiencyCrossings, formatAuditReport };
