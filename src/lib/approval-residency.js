'use strict';

/**
 * APPROVAL RESIDENCY — THE ONE ENCODING OF "IS THIS RESIDENT PLAN APPROVED".
 *
 * `classifyResidency` and `hasLedgerApproval` used to live inside
 * `src/hooks/human-gate-check.js`. They were MOVED here — not copied — because a
 * SECOND consumer now needs them: `src/lib/plan-coverage.js`, the oracle that
 * decides whether an edit is permitted at all.
 *
 * WHY THE MOVE WAS MANDATORY, not a matter of taste. Dependencies in this codebase
 * flow hooks → commands → lib, never the reverse, so `plan-coverage.js` may not
 * require a hook. The alternative — writing a second approval predicate inside
 * `plan-coverage.js` — would create TWO encodings of an approval predicate, which
 * this codebase correctly names a forgery surface (the exact argument recorded at
 * `approval-ledger.contentMatches` and in the comment block inside
 * `classifyResidency` below). Two encodings can diverge; a divergence in an
 * approval predicate is how an unearned approval becomes acceptable to one caller
 * and not the other. So there is exactly one, and it lives in `lib/`.
 *
 * THE DEFECT THIS EXTRACTION SERVES. `plan-coverage` derived write permission from
 * a plan's STAGE FOLDER. Plan files are edit-whitelisted (`/^plans\/.*\.md$/`), so
 * an agent could author `plans/implementation/anything.md` declaring
 * `files: ["src/hooks/human-gate-check.js"]` and thereby grant ITSELF permission to
 * edit the hook that enforces the four human gates — no human anywhere in the
 * chain. Reproduced, in both `implementation/` and `todo/`. Residing in a folder is
 * not proof of approval; a ledger entry an agent CANNOT MINT is. `.ctoc/approvals/`
 * is agent-write-denied on both the Edit channel (`PreToolUse.Edit.js`) and the
 * Bash channel, which is what makes it a real predicate and the folder a fake one.
 *
 * WHY `in-progress` IS CLASSIFIED AGAINST THE `todo` EDGE, and why that is correct
 * rather than lenient. `actions.startExecution` physically moves a plan into
 * `plans/in-progress/`, but `in-progress` is NOT a gate destination —
 * `gate-order.GATE_DESTINATIONS` is `['implementation','todo','done']` and
 * `crossesHumanGate('todo','in-progress')` is `false` — so NO ledger entry ever
 * records `stage_to: 'in-progress'`. Classifying a building plan against its own
 * folder would return `wrong-edge` for EVERY actively-building plan in existence
 * and kill the entire build phase. The approval that admits a plan into the build
 * phase is its Gate 2 `todo` entry, which it keeps for the whole build, so asking
 * "did a human cross Gate 2 with this plan?" is precisely the right question. It is
 * not a weakened question: a plan squatted into `in-progress/` with no entry is
 * still rejected (`no-ledger-entry`).
 */

const { GATE_DESTINATIONS, STAGE_ORDER } = require('./gate-order');
const safeFs = require('./safe-fs');

// Gate-destination folders where acceptance additionally requires a live-content
// hash match (invalidate-on-edit).
//
// THE OLD COMMENT HERE WAS FALSE, and the falsehood was load-bearing. It read
// "terminal gate-destination folders where NO LEGITIMATE AGENT EDITING OCCURS".
// That is simply untrue of `todo/`: a planner amends a queued plan, and an executor
// dispatched directly at a todo/ plan writes its step records, evidence and final
// report into that plan while it still resides there. Under whole-file hashing every
// one of those legitimate edits produced `hash-mismatch` — a reason classified as a
// LIVE ATTACK SIGNATURE, which reverts on every project, migrated or not. So ordinary
// building armed a mid-build revert of a plan out of the destination the human had
// just approved it into.
//
// What makes hash-sensitivity here TENABLE is that the comparison now runs against
// the SPECIFICATION (`approval-ledger.computeSpecHash`) for entries written with
// that scope: the executor's execution log is excluded, and everything that grants
// anything — the frontmatter and its `files:`, the scope prose, the specification,
// the step headings — stays hashed. `done/` genuinely has no legitimate editor, and
// entries written for it keep the stronger whole-file binding.
const HASH_SENSITIVE_FOLDERS = new Set(['todo', 'done']);

// PRE-BUILD gate destinations (X6): the gate destinations reached BEFORE any code is
// built — derived from the ONE gate-edge encoding, never hardcoded. A destination is
// pre-build iff it sits earlier in the stage order than the build phase (which begins
// at `in-progress`): implementation(1) and todo(2) qualify; done(5) does NOT. A
// SUFFICIENCY entry — "the plan has enough information to be built" — is accepted only
// here. `done/` is Gate 3 ("was this built correctly?"), answered by review and the 14
// quality dimensions, NEVER by an answered-question log (X6 Decision 1).
const BUILD_PHASE_START = STAGE_ORDER.indexOf('in-progress');
const PRE_BUILD_GATES = new Set(
  GATE_DESTINATIONS.filter((dest) => STAGE_ORDER.indexOf(dest) < BUILD_PHASE_START),
);

/**
 * The residency stage → the GATE EDGE that stage's residents are classified
 * against. Deliberately a CLOSED map, not a fallthrough: a stage added to
 * `plan-coverage.STAGE_PRIORITY` in the future that is NOT listed here fails
 * CLOSED (`stage-not-coverable`) instead of inheriting an accidental allow.
 *
 * @type {Readonly<Record<string, string>>}
 */
const COVERAGE_STAGE_EDGE = Object.freeze({
  // A plan queued at Gate 2's destination is classified against Gate 2 itself.
  todo: 'todo',
  // A plan BUILDING carries the Gate 2 entry it crossed with — see the file header.
  'in-progress': 'todo',
});

/**
 * Read a plan's full file content, or `null` if it cannot be read. Fail-soft so
 * a transient read error is treated as "not approved / not exempt" (a violation)
 * rather than throwing out of the sweep.
 *
 * @param {string} filePath - absolute path to the plan file
 * @returns {string|null}
 */
function readPlan(filePath) {
  try {
    return safeFs.readFileSync(filePath, 'utf8');
  } catch {
    // Unreadable content is NOT an approval — the caller turns this into a
    // non-accepted `unreadable` verdict, never into a pass.
    return null;
  }
}

/**
 * Classify a resident plan against the agent-write-denied ledger, per-plan fault-
 * isolated (R2-F). NEVER throws: an un-keyable slug or a corrupt entry returns a
 * NON-accepted result with the matching reason rather than propagating out and
 * killing the sweep. Folder-sensitive, and kind-sensitive:
 *   - `todo` / `done` (tamper-sensitive): the entry's `content_sha256` must match
 *     the live content (invalidate-on-edit);
 *   - `implementation` (active editing expected): acceptance binds to entry
 *     existence for this gate edge, NOT a frozen hash;
 *   - `done` accepts a human OR a pipeline (`advanced_by: 'pipeline'` + evidence)
 *     entry; every pre-done gate stays human-only.
 * Never trusts the plan-body `approved_by: human` marker.
 *
 * HONEST KIND (R3-A item 5). Every verdict — accepted or not — carries the entry's
 * REAL `kind` (`human` | `backfilled` | `pipeline` | `sufficiency` | `unknown` | `null`). A backfilled
 * entry is still ACCEPTED (the human ordered the migration): acceptance is not
 * weakened. But it is reported as `'backfilled'`, never laundered into `'human'`, so a
 * later audit can always separate a migrated record from a live human approval.
 *
 * FAILS CLOSED ON UNRECOGNISED PROVENANCE (X5). `'pipeline'` used to be the ONLY
 * guarded kind, and every other kind fell through to `accepted: true` — which, paired
 * with `entryKind`'s old `return 'human'` default, meant an entry with an unrecognised
 * `advanced_by` was accepted at EVERY gate including `todo/` with no evidence. An
 * `'unknown'` kind is now rejected (`unknown-provenance`) BEFORE the pipeline branch,
 * on every path. A new provenance earns acceptance only by being added to
 * `approval-ledger.entryKind` AND given an explicit guard here.
 *
 * @param {string} filePath - absolute path to the plan file
 * @param {string} folderName - the gate-destination folder the plan resides in
 * @param {string} [projectPath] - project root (defaults to cwd)
 * @param {string|null} [content] - pre-read file content, to avoid a re-read
 * @returns {{accepted: boolean, reason: (string|null), kind: ('human'|'backfilled'|'pipeline'|'sufficiency'|'unknown'|null), sections?: string[]}}
 *   accepted (with the entry's real kind), or a reason: `ledger-unkeyable` |
 *   `ledger-corrupt` | `no-ledger-entry` | `wrong-edge` | `hash-mismatch` |
 *   `hash-mismatch-new-section` | `spec-boundary-unlocatable` | `hash-mismatch-legacy` |
 *   `unreadable` | `unknown-provenance` | `pipeline-no-evidence` |
 *   `pipeline-not-allowed` | `sufficiency-no-evidence` | `sufficiency-not-allowed`.
 *   Under SPECIFICATION semantics the mismatch reason is the proof-carrying diagnosis:
 *   `hash-mismatch` (the specification really changed after approval),
 *   `hash-mismatch-new-section` (unrecognised section(s) were appended — named in
 *   `sections`), or `spec-boundary-unlocatable` (the boundary could not be established
 *   at all — the check could not look). `hash-mismatch-legacy` is a mismatch under a
 *   pre-specification `hash_scope: 'file'` entry. EVERY one of these reasons REJECTS —
 *   the legibility changed, the acceptance decision did not, and `spec-boundary-unlocatable`
 *   in particular denies because a check that cannot look must deny.
 */
function classifyResidency(filePath, folderName, projectPath = process.cwd(), content = null) {
  const ledger = require('./approval-ledger');
  const slug = ledger.slugFromPlanPath(filePath);
  const res = ledger.readEntryResult(slug, projectPath);

  if (res.status === 'unkeyable') return { accepted: false, reason: 'ledger-unkeyable', kind: null };
  if (res.status === 'corrupt') return { accepted: false, reason: 'ledger-corrupt', kind: null };
  if (res.status === 'absent') return { accepted: false, reason: 'no-ledger-entry', kind: null };

  const entry = res.entry;
  const kind = ledger.entryKind(entry);
  if (entry.stage_to !== folderName) return { accepted: false, reason: 'wrong-edge', kind };

  if (HASH_SENSITIVE_FOLDERS.has(folderName)) {
    const text = content != null ? content : readPlan(filePath);
    if (text == null) return { accepted: false, reason: 'unreadable', kind };
    // THE SINGLE ENCODING of "does this content match this entry". This used to be an
    // inline `computeContentHash` comparison — a SECOND encoding of the approval
    // predicate alongside `ledger.verify`, and two encodings of an approval predicate
    // can diverge, which is a forgery surface. Both now call `ledger.contentMatches`,
    // which branches on the entry's recorded `hash_scope` and FAILS CLOSED when a
    // specification boundary cannot be established at all.
    const cmp = ledger.contentMatches(entry, text);
    if (!cmp.match) {
      // BOTH kinds still REJECT — no gate is weakened. The split exists so the human
      // and the enforcer can finally tell "this entry predates specification hashing,
      // so the mismatch may be nothing but the build that was authorised" from "the
      // specification actually changed after the approval". Without it the fence cries
      // wolf on every legacy entry and the real signal stays buried, which is the harm
      // this distinction removes — indistinguishability, never strictness.
      //
      // A legacy (`file`) mismatch carries no diagnosis — whole-file semantics cannot
      // support one. A specification mismatch carries the proof-carrying reason from
      // `contentMatches` (`hash-mismatch` | `hash-mismatch-new-section` |
      // `spec-boundary-unlocatable`) and the offending section titles. EVERY one of
      // these rejects, exactly as `hash-mismatch` did; the message became legible, the
      // decision did not move.
      if (cmp.scope === 'file') {
        return { accepted: false, reason: 'hash-mismatch-legacy', kind };
      }
      return { accepted: false, reason: cmp.reason, sections: cmp.sections || [], kind };
    }
  }

  // FAIL CLOSED ON UNRECOGNISED PROVENANCE (X5). This must come BEFORE the pipeline
  // branch, so no unrecognised provenance can reach `accepted: true` on ANY path.
  // Until X5 `'pipeline'` was the ONLY guarded kind and the function ended in a bare
  // `return { accepted: true }` — so an entry stamped `advanced_by: 'sufficiency-gate'`
  // classified as `'human'` (the old classifier's fallthrough), skipped the guard
  // below, and was ACCEPTED at every gate including `todo/`, with no evidence. It was
  // not mislabelled; it was waved through. That is the mechanism behind the 26 forged
  // approvals removed from this repo. A kind this hook does not RECOGNISE is never
  // accepted: adding a new provenance means adding its guard here, deliberately.
  if (kind === 'unknown') return { accepted: false, reason: 'unknown-provenance', kind };

  if (kind === 'pipeline') {
    // Pipeline provenance is accepted ONLY at the terminal `done/` gate, and only
    // with evidence; every pre-done gate (todo) stays human-only. A decomposed
    // vision archived to done/ arrives on exactly this path (evidence:
    // 'vision-decomposed') — there is no longer any `type: vision` exemption.
    if (folderName !== 'done') return { accepted: false, reason: 'pipeline-not-allowed', kind };
    if (typeof entry.evidence !== 'string' || entry.evidence.trim() === '') {
      return { accepted: false, reason: 'pipeline-no-evidence', kind };
    }
  }

  if (kind === 'sufficiency') {
    // SUFFICIENCY provenance (X6) — "the plan had enough information to be built
    // without guessing" — crosses the PRE-BUILD gates (implementation, todo) ONLY,
    // and only with evidence. It is REJECTED at `done/`: Gate 3 asks whether the work
    // was built correctly, which a sufficiency verdict cannot answer. Mirrors the
    // pipeline guard exactly, with the allowed set inverted (pre-build, not done).
    if (!PRE_BUILD_GATES.has(folderName)) return { accepted: false, reason: 'sufficiency-not-allowed', kind };
    if (typeof entry.evidence !== 'string' || entry.evidence.trim() === '') {
      return { accepted: false, reason: 'sufficiency-no-evidence', kind };
    }
  }
  return { accepted: true, reason: null, kind };
}

/**
 * Boolean facade over {@link classifyResidency}, preserving the historical
 * `hasLedgerApproval` contract for any external caller.
 *
 * @param {string} filePath
 * @param {string} folderName
 * @param {string} [projectPath]
 * @param {string|null} [content]
 * @returns {boolean}
 */
function hasLedgerApproval(filePath, folderName, projectPath = process.cwd(), content = null) {
  return classifyResidency(filePath, folderName, projectPath, content).accepted;
}

/**
 * Is a plan RESIDENT in a coverage-scanned stage genuinely approved, such that its
 * `files:` declaration may grant write permission?
 *
 * THE INVERSION, WRITTEN IN THE CODE BECAUSE IT WILL BE "FIXED" OTHERWISE. This is a
 * PERMISSION check, so its fault direction is the OPPOSITE of the fail-open default
 * used by this codebase's reporting checks. It must never throw: `PreToolUse.Edit.js`
 * wraps the whole enforcement decision in a catch that fails OPEN, so a THROW out of
 * here becomes an ALLOW — a permission check whose failure mode is "permission
 * granted". Every fault path below therefore returns a NOT-approved verdict.
 *
 * @param {string} planPath - absolute path to the resident plan file
 * @param {string} stage - the stage folder the plan resides in
 * @param {string} projectPath - project root
 * @param {string|null} [content] - the plan's already-read content, so the file is
 *   never read twice per call
 * @returns {{approved: boolean, reason: (string|null), kind: (string|null)}}
 */
function isApprovedForCoverage(planPath, stage, projectPath, content = null) {
  const edge = Object.prototype.hasOwnProperty.call(COVERAGE_STAGE_EDGE, stage)
    ? COVERAGE_STAGE_EDGE[stage]
    : null;
  // A stage with no declared edge is NOT coverable. Fail CLOSED, so adding a stage
  // to the coverage scan without deciding which gate vouches for it grants nothing
  // rather than granting everything.
  if (edge === null) return { approved: false, reason: 'stage-not-coverable', kind: null };

  try {
    const verdict = classifyResidency(planPath, edge, projectPath, content);
    return { approved: verdict.accepted, reason: verdict.reason, kind: verdict.kind };
  } catch {
    // NEVER rethrow: see the inversion note above. An unexpected fault inside the
    // classifier is reported as NOT approved, which denies the edit.
    return { approved: false, reason: 'classify-error', kind: null };
  }
}

module.exports = {
  HASH_SENSITIVE_FOLDERS,
  PRE_BUILD_GATES,
  COVERAGE_STAGE_EDGE,
  readPlan,
  classifyResidency,
  hasLedgerApproval,
  isApprovedForCoverage,
};
