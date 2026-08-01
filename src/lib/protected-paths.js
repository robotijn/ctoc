'use strict';

/**
 * PROTECTED ENFORCEMENT SURFACE — the ONE list of files whose write must trace to a
 * HUMAN approval, never an autonomous (sufficiency / pipeline) one, plus the ONE
 * definition of which coverage kinds count as "human".
 *
 * WHY THIS EXISTS (verified end-to-end in live code, 2026-08-01). CTOC's
 * irreversibility floor was not self-contained. The REVERSIBLE sufficiency flow —
 * "the plan carried enough information to build, so the pipeline crossed it with NO
 * human" — mints a `sufficiency`-kind approval-ledger entry, and
 * `approval-residency.classifyResidency` ACCEPTS a sufficiency entry at the pre-build
 * gates. `plan-coverage.findCoveringPlan` then treats that plan's `files:` globs as a
 * real write grant. An agent could therefore author a structurally-valid plan
 * declaring `files: ["src/hooks/human-gate-check.js"]` (or `["**"]`), let the
 * sufficiency gate auto-cross it with no human, and thereby earn write access over the
 * very code that guards the four human gates — before any human saw the edit.
 *
 * THE RULE. Coverage over any path below is granted ONLY when the covering plan's
 * approval kind is positively HUMAN (`human` or `backfilled` — a backfill is a
 * human-ordered migration). A `sufficiency` or `pipeline` (autonomous) kind, or any
 * unresolved / unknown / null kind, is REFUSED for these targets. Ordinary auto-build
 * over ordinary source is untouched; a HUMAN-approved plan editing a hook — which is
 * exactly how CTOC dogfoods its own gate code — is untouched.
 *
 * THE DECISION POINT lives in `plan-coverage.scanForCoverage` (reached by
 * `findCoveringPlan`), the shared oracle BOTH write channels call
 * (`PreToolUse.Edit.js` and `PreToolUse.Bash.js`). One encoding, both channels.
 *
 * WHY EACH CLASS IS ON THE LIST:
 *   - `src/hooks/**` — every PreToolUse / Stop / SessionStart hook, including
 *     `human-gate-check.js`. These ARE the enforcement: the edit/commit gates, the
 *     human-gate auto-revert, the continuation gate. An autonomous edit here disarms
 *     the guard that would catch the next autonomous edit.
 *   - `plan-coverage.js`, `approval-residency.js`, `approval-ledger.js` — the
 *     coverage oracle, the residency classifier, and the ledger that records approval
 *     provenance. An autonomous edit here forges the very predicate that says whether
 *     a write is approved.
 *   - `gate-order.js` — the ONE encoding of the gate edges / destinations that every
 *     approval predicate derives from.
 *   - `continuation.js`, `continuation-queue.js` — the autonomous-build steering; an
 *     edit here changes when building stops without a human.
 *   - `streaming-gate.js` — the sufficiency-cross WRITER itself (the code that mints
 *     the very autonomous entry this rule distrusts).
 *   - `ledger-backfill.js` — the only sanctioned writer of human-kind backfill
 *     entries; an autonomous edit here could mint human-looking provenance.
 *
 * Matching is repo-relative POSIX, segment-precise: an exact file match, or a
 * directory prefix match (`dir` or `dir/…`). This is the same prefix style
 * `PreToolUse.Edit.js` uses for its own protected dirs (`isUnderProtectedDir`), NOT a
 * new globber. PURE and TOTAL — no I/O, never throws.
 */

const path = require('path');

// Exact repo-relative files (POSIX). Kept module-private; the public predicate is the
// only supported reader, so callers cannot diverge on membership.
const PROTECTED_ENFORCEMENT_FILES = new Set([
  'src/lib/plan-coverage.js',
  'src/lib/approval-residency.js',
  'src/lib/approval-ledger.js',
  'src/lib/gate-order.js',
  'src/lib/continuation.js',
  'src/lib/continuation-queue.js',
  'src/lib/streaming-gate.js',
  'src/scripts/ledger-backfill.js',
]);

// Directory prefixes (POSIX, no trailing slash): the whole subtree is protected.
const PROTECTED_ENFORCEMENT_DIRS = ['src/hooks'];

// The coverage kinds that count as a HUMAN approval — the ONLY kinds permitted to
// cover a protected path. Mirrors `approval-ledger.entryKind`'s vocabulary: `human`
// is a click, `backfilled` is a human-ordered migration. Everything else
// (`sufficiency`, `pipeline`, `unknown`, null) is autonomous or unresolved.
const HUMAN_COVERAGE_KINDS = new Set(['human', 'backfilled']);

/**
 * Whether `rel` (a repo-relative path; POSIX or Windows separators accepted) targets
 * CTOC's own enforcement surface. Resolves `.`/`..` first, then rejects an
 * out-of-tree result — so a `..` that lands back inside a protected dir still matches,
 * and one that escapes does not (it is not ours to protect). Never throws.
 *
 * @param {string} rel - repo-relative path to the write target
 * @returns {boolean}
 */
function isProtectedEnforcementPath(rel) {
  if (typeof rel !== 'string' || rel === '') return false;
  // `rel` is a string here, so `path.posix.normalize` cannot throw — no defensive
  // catch (an unreachable branch would be dead code, not safety).
  const norm = path.posix.normalize(rel.replace(/\\/g, '/').replace(/^\.\//, ''));
  if (norm === '' || norm === '.' || norm === '..' || norm.startsWith('../')) return false;
  if (PROTECTED_ENFORCEMENT_FILES.has(norm)) return true;
  for (const dir of PROTECTED_ENFORCEMENT_DIRS) {
    if (norm === dir || norm.startsWith(`${dir}/`)) return true;
  }
  return false;
}

/**
 * Whether an approval `kind` (from `approval-ledger.entryKind` /
 * `approval-residency.classifyResidency`) is a positively-HUMAN kind. FAILS CLOSED:
 * anything not in the human set — the autonomous kinds, `unknown`, `null`, a casing
 * variant — returns false.
 *
 * @param {*} kind
 * @returns {boolean}
 */
function isHumanCoverageKind(kind) {
  return typeof kind === 'string' && HUMAN_COVERAGE_KINDS.has(kind);
}

module.exports = {
  isProtectedEnforcementPath,
  isHumanCoverageKind,
};
