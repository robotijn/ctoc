/**
 * GDPR deterministic rule core (EC2-s1).
 *
 * The single machine-checkable authority for the GDPR agent's deterministic
 * rules: which PII field triggers which Articles, severity normalization, the
 * finding-schema guard, and plan-vs-code finding routing. The skill's
 * `skills/compliance/gdpr-compliance-checker/SKILL.md` remains the
 * narrative-rules + BAD/SAFE-example authority; `VALID_GDPR_ARTICLES` here is
 * the machine mirror of that skill's `gdpr_article` letter-schema enum (parity
 * with SKILL.md is enforced by EC2-s2).
 *
 * Load-bearing property: this module imports NOTHING and touches no fs, no
 * paths, no OS-specific behaviour — it is pure computation, trivially
 * unit-testable and reusable by both the agent-referenced logic (s3) and the
 * s4 wiring. Cross-platform by construction.
 *
 * Fail-safe contract:
 *   - `mapPiiFieldToArticles` never throws (unknown/empty/non-string ⇒ []).
 *   - `normalizeSeverity` / `routeFinding` throw TypeError on non-object input
 *     (programmer error — loud-fail, never a wrong shape returned silently).
 *   - `validateFindingSchema` throws a named Error on missing/unknown
 *     `gdpr_article` — this is the guard preventing findings that mint a code
 *     the refinement-loop letter schema would reject.
 */

'use strict';

/**
 * The valid GDPR article codes. Exactly the skill's `gdpr_article` letter-schema
 * enum values PLUS `GDPR-6` and `GDPR-9` (the two the parent EC2 plan adds; the
 * skill's current enum omits them, and EC2-s2 adds them to SKILL.md with a
 * parity test asserting this Set equals the enum). Frozen — no mutation.
 * @type {ReadonlySet<string>}
 */
const VALID_GDPR_ARTICLES = new Set([
  'GDPR-6',
  'GDPR-7',
  'GDPR-9',
  'GDPR-13',
  'GDPR-14',
  'GDPR-15',
  'GDPR-17',
  'GDPR-20',
  'GDPR-28',
  'GDPR-30',
  'GDPR-33',
  'GDPR-34',
  'GDPR-37',
  'GDPR-Chapter-V',
]);

/**
 * Map from a normalized (lowercase, alphanumeric-only) PII field name to the
 * Articles its presence triggers. Grounded in the skill's `piiFields` list and
 * Article narrative. Every array value is a subset of `VALID_GDPR_ARTICLES`
 * (guarded by the map-integrity test). Frozen — no mutation.
 *
 * Rationale for the common trigger set `["GDPR-6","GDPR-13","GDPR-17"]`:
 *   - GDPR-6  (lawful basis) — any PII collection needs a legal basis.
 *   - GDPR-13 (info-at-collection) — collected directly from the data subject.
 *   - GDPR-17 (erasure) — the field must be reachable by right-to-be-forgotten.
 * Special-category fields (Article 9) additionally require GDPR-9.
 * Online identifiers (IP, cookie/device IDs) are personal data per Recital 30.
 * @type {Readonly<Object<string, string[]>>}
 */
const PII_FIELD_TO_ARTICLES = Object.freeze({
  // Identity — direct identifiers collected from the data subject.
  email: ['GDPR-6', 'GDPR-13', 'GDPR-17'],
  phone: ['GDPR-6', 'GDPR-13', 'GDPR-17'],
  name: ['GDPR-6', 'GDPR-13', 'GDPR-17'],
  firstname: ['GDPR-6', 'GDPR-13', 'GDPR-17'],
  lastname: ['GDPR-6', 'GDPR-13', 'GDPR-17'],
  address: ['GDPR-6', 'GDPR-13', 'GDPR-17'],

  // Online identifiers — personal data per Recital 30 (IP/cookie/device IDs).
  ipaddress: ['GDPR-6', 'GDPR-13', 'GDPR-17'],
  ip: ['GDPR-6', 'GDPR-13', 'GDPR-17'],
  cookieid: ['GDPR-6', 'GDPR-13', 'GDPR-17'],
  deviceid: ['GDPR-6', 'GDPR-13', 'GDPR-17'],
  fingerprint: ['GDPR-6', 'GDPR-13', 'GDPR-17'],

  // Special categories (Article 9) — extra lawful basis beyond Article 6.
  health: ['GDPR-6', 'GDPR-9', 'GDPR-13'],
  medical: ['GDPR-6', 'GDPR-9', 'GDPR-13'],
  biometric: ['GDPR-6', 'GDPR-9', 'GDPR-13'],
  ethnicity: ['GDPR-6', 'GDPR-9', 'GDPR-13'],
  religion: ['GDPR-6', 'GDPR-9', 'GDPR-13'],
  politicalview: ['GDPR-6', 'GDPR-9', 'GDPR-13'],
  sexualorientation: ['GDPR-6', 'GDPR-9', 'GDPR-13'],
});

/**
 * Normalize a field name for map lookup: lowercase, strip every non-alphanumeric
 * character (so `"IP Address"`, `"ipAddress"`, `"ip_address"` all collapse to
 * `"ipaddress"`).
 * @param {string} fieldName
 * @returns {string} the normalized key, or '' for non-string input.
 */
function normalizeFieldName(fieldName) {
  if (typeof fieldName !== 'string') return '';
  return fieldName.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Map a PII field name to the GDPR Articles it triggers.
 * Never throws — unknown/empty/non-string input returns `[]`.
 * @param {string} fieldName
 * @returns {string[]} a fresh copy of the mapped Articles (order stable), or [].
 */
function mapPiiFieldToArticles(fieldName) {
  const key = normalizeFieldName(fieldName);
  if (!key) return [];
  const articles = PII_FIELD_TO_ARTICLES[key];
  // Return a copy so callers cannot mutate the frozen source array's contents
  // via a shared reference in older engines; also decouples caller lifetime.
  return articles ? articles.slice() : [];
}

/**
 * Return a shallow copy of `finding` with `severity: "critical"` set
 * unconditionally (the warnings-are-critical contract for refinement-loop
 * output). Does NOT mutate the input.
 * @param {object} finding
 * @returns {object} a new object with severity forced to "critical".
 * @throws {TypeError} when `finding` is not a non-null object.
 */
function normalizeSeverity(finding) {
  if (finding === null || typeof finding !== 'object' || Array.isArray(finding)) {
    throw new TypeError('normalizeSeverity: finding must be an object');
  }
  return { ...finding, severity: 'critical' };
}

/**
 * Assert `finding.gdpr_article` is a member of `VALID_GDPR_ARTICLES`.
 * Returns the finding unchanged on success so callers can chain.
 * @param {object} finding
 * @returns {object} the same finding, on success.
 * @throws {TypeError} when `finding` is not a non-null object.
 * @throws {Error} when `gdpr_article` is missing or not a valid code (the
 *   thrown message names the offending code).
 */
function validateFindingSchema(finding) {
  if (finding === null || typeof finding !== 'object' || Array.isArray(finding)) {
    throw new TypeError('validateFindingSchema: finding must be an object');
  }
  const article = finding.gdpr_article;
  if (article === undefined || article === null || article === '') {
    throw new Error('validateFindingSchema: gdpr_article is required');
  }
  if (!VALID_GDPR_ARTICLES.has(article)) {
    throw new Error(`validateFindingSchema: unknown gdpr_article "${article}"`);
  }
  return finding;
}

/**
 * Route a finding to the Inbox (plan-stage — no code coordinates) or to a
 * refinement-loop letter (code-stage — has a `target_file`). The letter schema
 * (`.ctoc/architecture/refinement-loop-schema.json`) REQUIRES `file` +
 * `line_range`, which a plan-stage finding lacks — so plan-stage findings must
 * NOT use the letter path.
 * @param {object} finding
 * @returns {{ route: 'inbox' } | { route: 'letter' }}
 * @throws {TypeError} when `finding` is not a non-null object.
 */
function routeFinding(finding) {
  if (finding === null || typeof finding !== 'object' || Array.isArray(finding)) {
    throw new TypeError('routeFinding: finding must be an object');
  }
  return finding.target_file ? { route: 'letter' } : { route: 'inbox' };
}

module.exports = {
  VALID_GDPR_ARTICLES,
  PII_FIELD_TO_ARTICLES,
  mapPiiFieldToArticles,
  normalizeSeverity,
  validateFindingSchema,
  routeFinding,
};
