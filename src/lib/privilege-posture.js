/**
 * Privilege Posture Library (v6.9.x)
 *
 * Reads and validates the per-plan `privilege_posture` frontmatter field.
 * The privilege posture declares whether the work product of a given plan
 * is intended to fall inside the protection of the attorney-client
 * privilege and the attorney work-product doctrine, and produces the
 * disclosure banner that must be embedded in the audit log so that the
 * privilege claim is not silently waived.
 *
 * Allowed values:
 *
 *   none              No privilege claimed. Default. The plan and all
 *                     downstream artefacts are ordinary business records,
 *                     discoverable in litigation under the ordinary rules.
 *
 *   counsel-directed  The plan was authored at the direction of legal
 *                     counsel for the purpose of obtaining legal advice or
 *                     in anticipation of litigation. The work product may
 *                     fall within the attorney-client privilege or the
 *                     work-product doctrine; the audit log must carry the
 *                     "Privileged and Confidential — Prepared at the
 *                     Direction of Counsel" banner.
 *
 *   client-only       The plan was authored by in-house client personnel
 *                     without counsel involvement. The work product is
 *                     NOT covered by the attorney-client privilege. The
 *                     audit log must carry the "Not privileged" disclosure
 *                     so the project record does not over-claim protection
 *                     and forfeit it across the board.
 *
 * Rationale and references:
 *
 *   - Heppner v. Allianz Global Investors U.S. LLC, decided in the United
 *     States District Court for the Southern District of New York on
 *     17 February 2026, held that internal investigation work product
 *     prepared by client personnel without counsel direction is not
 *     protected by the attorney-client privilege merely because the
 *     subject matter is sensitive. Over-claiming privilege in the audit
 *     trail risks a subject-matter waiver.
 *
 *   - Warner v. Gilbarco Veeder-Root LLC, decided in the United States
 *     District Court for the Middle District of North Carolina on
 *     10 February 2026, reinforced that the work-product doctrine requires
 *     a demonstrable anticipation-of-litigation purpose at the time of
 *     creation; retrospective relabeling does not retroactively confer
 *     protection.
 *
 *   The combined holdings are why CTOC requires the posture to be
 *   DECLARED at plan creation time, and why the audit log carries a
 *   disclosure banner — both for protection and for the symmetric
 *   non-protection case where over-claiming would be the worse error.
 *
 * Cross-platform: uses path.join, fs.promises is not required (read is
 * synchronous; the file is tiny), no shell-outs, no external dependencies.
 */

'use strict';

const safeFs = require('./safe-fs');
const path = require('path');

/**
 * The set of valid privilege-posture values. `Object.freeze` prevents
 * accidental mutation by callers.
 */
const VALID_POSTURES = Object.freeze(['none', 'counsel-directed', 'client-only']);

/**
 * The default posture when a plan's frontmatter does not declare one.
 * Defaulting to `none` is deliberate: under Heppner v. Allianz (S.D.N.Y.
 * 17 February 2026), silently claiming privilege without counsel direction
 * is the larger risk.
 */
const DEFAULT_POSTURE = 'none';

/**
 * Read the privilege posture from a plan file's frontmatter. Returns the
 * declared value if valid, the default value (`none`) if absent, and
 * throws if the file declares an invalid value (callers should NOT
 * silently coerce an invalid posture — that is exactly the kind of audit
 * inconsistency that defeats a later privilege claim).
 *
 * @param {string} planPath - Absolute or relative path to the plan file.
 * @returns {'none'|'counsel-directed'|'client-only'}
 */
function getPosture(planPath) {
  if (typeof planPath !== 'string' || planPath === '') {
    throw new Error('getPosture: planPath must be a non-empty string');
  }
  const resolved = path.resolve(planPath);
  if (!safeFs.existsSync(resolved)) {
    throw new Error(`getPosture: plan not found: ${resolved}`);
  }

  const text = safeFs.readFileSync(resolved, 'utf8');
  const fmMatch = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!fmMatch) {
    // No frontmatter at all — treat as default. This matches Heppner: the
    // safer default is no privilege claim.
    return DEFAULT_POSTURE;
  }
  const fm = fmMatch[1];
  const m = fm.match(/^\s*privilege_posture\s*:\s*(.+?)\s*$/m);
  if (!m) return DEFAULT_POSTURE;

  const raw = m[1].replace(/^["']|["']$/g, '').trim();
  if (!VALID_POSTURES.includes(raw)) {
    throw new Error(
      `Invalid privilege_posture "${raw}" in ${planPath}. ` +
      `Allowed values: ${VALID_POSTURES.join(', ')}.`
    );
  }
  return raw;
}

/**
 * Validate a candidate posture value WITHOUT touching the filesystem.
 * Useful for plan generators that need to verify a user-supplied value
 * before writing the plan. Returns a structured result rather than
 * throwing so the caller can render an actionable message.
 *
 * @param {string} value - The candidate value.
 * @returns {{valid: boolean, value: ?string, reason: ?string}}
 */
function validatePosture(value) {
  if (value == null) {
    return {
      valid: true,
      value: DEFAULT_POSTURE,
      reason: `No value supplied; defaulting to "${DEFAULT_POSTURE}".`,
    };
  }
  if (typeof value !== 'string') {
    return { valid: false, value: null, reason: 'privilege_posture must be a string' };
  }
  const trimmed = value.trim().replace(/^["']|["']$/g, '');
  if (!VALID_POSTURES.includes(trimmed)) {
    return {
      valid: false,
      value: null,
      reason: `Invalid posture "${trimmed}". Allowed: ${VALID_POSTURES.join(', ')}.`,
    };
  }
  return { valid: true, value: trimmed, reason: null };
}

/**
 * Return the disclosure banner text that the audit log must carry for a
 * given posture. The banner is intentionally verbose — terseness in
 * privilege claims is what gets them waived. The text is patterned after
 * the standard United States legal-industry conventions and the rulings
 * cited at the top of this file.
 *
 * Callers should embed this text in the dispatch audit log header AND in
 * any artefact (plan, finding, summary) that derives from the plan.
 *
 * @param {'none'|'counsel-directed'|'client-only'} posture
 * @returns {string} The banner text. Includes a trailing newline.
 */
function warningBanner(posture) {
  const result = validatePosture(posture);
  if (!result.valid) {
    throw new Error(`warningBanner: ${result.reason}`);
  }
  const value = result.value;

  switch (value) {
    case 'counsel-directed':
      return (
        'PRIVILEGED AND CONFIDENTIAL — PREPARED AT THE DIRECTION OF COUNSEL.\n' +
        'This document and its derivatives were prepared by or at the direction of\n' +
        'legal counsel for the purpose of providing legal advice or in anticipation\n' +
        'of litigation. The contents are protected by the attorney-client privilege\n' +
        'and the attorney work-product doctrine. Do not disclose outside the\n' +
        'attorney-client relationship without written authorization from counsel.\n' +
        'See Warner v. Gilbarco Veeder-Root LLC (M.D.N.C. 10 Feb 2026); Heppner v.\n' +
        'Allianz Global Investors U.S. LLC (S.D.N.Y. 17 Feb 2026).\n'
      );

    case 'client-only':
      return (
        'NOT PRIVILEGED — CLIENT-AUTHORED ORDINARY BUSINESS RECORD.\n' +
        'This document was authored by client personnel without legal-counsel\n' +
        'direction. It does NOT fall within the attorney-client privilege or the\n' +
        'attorney work-product doctrine and is discoverable in litigation under\n' +
        'the ordinary rules. This disclosure is recorded explicitly so that no\n' +
        'inadvertent privilege claim is made over the audit record.\n' +
        'See Heppner v. Allianz Global Investors U.S. LLC (S.D.N.Y. 17 Feb 2026)\n' +
        'on the risks of over-claiming privilege for client-only work product.\n'
      );

    case 'none':
    default:
      return (
        'NO PRIVILEGE CLAIMED.\n' +
        'This document carries no claim of attorney-client privilege or attorney\n' +
        'work-product protection. It is an ordinary business record, retained\n' +
        'and produced under the ordinary rules.\n'
      );
  }
}

module.exports = {
  VALID_POSTURES,
  DEFAULT_POSTURE,
  getPosture,
  validatePosture,
  warningBanner,
};
