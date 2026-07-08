/**
 * GDPR agent runner (EC2-s4) — the LIVE gate-then-route seam.
 *
 * The GDPR agent (agents/compliance/gdpr-agent.md) is prose; this module is the
 * unit-testable executable that enforces its contract end-to-end:
 *
 *   1. GATE FIRST on `shouldRunGdpr(projectRoot)`. When the gdpr regulatory
 *      profile is not active, the runner does NOTHING — no Inbox write, no plan
 *      read, no further work — and returns `{ ran:false, inbox:[], letter:[] }`
 *      (parent Scenario "Profile absent — agent produces no output").
 *   2. For each finding (gate on): `validateFindingSchema` (throws on an unknown
 *      `gdpr_article` — a bad code is caught loudly and never emitted) →
 *      `normalizeSeverity` (severity forced to "critical") → `routeFinding`.
 *   3. Plan-stage findings (`route:'inbox'` — no code coordinates) are written to
 *      the REAL Inbox via `inbox.createQuestion` — the existing plan-stage
 *      attachment surface the human acts on at morning review. Code-stage
 *      findings (`route:'letter'` — carry `target_file`/`target_line`) are
 *      COLLECTED and returned in `letter[]` for the refinement-loop letter path
 *      (this runner does not author the letter; the loop owns that).
 *
 * Advisory only: the runner adds NO human gate and mutates NO enforcement /
 * review-gate key — it writes only Inbox questions.
 *
 * Fail-open contract:
 *   - non-string / wrong root ⇒ `shouldRunGdpr` returns false ⇒ `{ ran:false }`;
 *   - non-array `findings` ⇒ treated as `[]` (ran:true, empty results);
 *   - an unknown `gdpr_article` is the ONE loud case — `validateFindingSchema`
 *     throws BEFORE any Inbox write, so the offending finding is never emitted.
 *
 * Dependency direction: lib → lib only. Imports `gdpr-helpers` (pure),
 * `compliance-regime` (the gate) and `inbox` (the real writer) — nothing from
 * hooks or commands. Cross-platform by delegation: `projectRoot` is passed
 * straight to `shouldRunGdpr` / `inbox.createQuestion`, both of which `path.join`
 * internally; the runner builds no paths.
 */

'use strict';

const { shouldRunGdpr } = require('./compliance-regime');
const { validateFindingSchema, normalizeSeverity, routeFinding } = require('./gdpr-helpers');
const inbox = require('./inbox');

/**
 * Build the human-facing context blob attached to an Inbox question. Names the
 * Article, the model's confidence, and the finding kind so morning review has
 * the machine-checkable facts alongside the prose question.
 * @param {object} finding - a schema-valid, severity-normalized finding
 * @returns {string}
 */
function buildContext(finding) {
  const parts = [
    `article: ${finding.gdpr_article}`,
    `severity: ${finding.severity}`,
  ];
  if (finding.confidence) parts.push(`confidence: ${finding.confidence}`);
  if (finding.kind) parts.push(`kind: ${finding.kind}`);
  return parts.join('\n');
}

/**
 * Execute the GDPR agent's gate-then-route contract for one compliance-review run.
 *
 * @param {string} projectRoot - the resolved project root (delegated to the gate
 *   and the Inbox writer; a wrong/non-string root fails safe to `{ ran:false }`).
 * @param {Array<object>} [findings] - raw findings the agent derived (plan-stage)
 *   or the skill produced (code-stage). Non-array ⇒ treated as `[]`.
 * @returns {{ ran: boolean, inbox: string[], letter: object[] }}
 *   - `ran`: whether the gate was on (false ⇒ no side effects at all);
 *   - `inbox`: the ids of the Inbox questions created for plan-stage findings;
 *   - `letter`: the schema-valid, severity:critical code-stage findings handed
 *     back for the refinement-loop letter path.
 * @throws {Error} propagates `validateFindingSchema`'s throw when a finding
 *   carries an unknown `gdpr_article` — a code the letter schema would reject
 *   must NOT be silently emitted (parent Scenario "validator rejects unknown").
 */
function runGdprFindings(projectRoot, findings) {
  // 1. GATE FIRST — no gate ⇒ no output, no writes, no reads.
  if (!shouldRunGdpr(projectRoot)) {
    return { ran: false, inbox: [], letter: [] };
  }

  // 2. Coerce a non-array findings arg to [] (fail-open; ran stays true).
  const list = Array.isArray(findings) ? findings : [];

  const inboxIds = [];
  const letter = [];

  for (const finding of list) {
    // 3. Validate (throws loudly on an unknown gdpr_article, BEFORE any emission),
    //    then normalize severity to critical, then route.
    validateFindingSchema(finding);
    const nf = normalizeSeverity(finding);
    const { route } = routeFinding(nf);

    if (route === 'inbox') {
      // 4. Plan-stage ⇒ real Inbox question (the human acts on it at review).
      const { id } = inbox.createQuestion(
        {
          source_plan: nf.plan || nf.source_plan || '',
          source_step: 'compliance-gdpr',
          question: nf.message || '',
          context: buildContext(nf),
        },
        projectRoot,
      );
      inboxIds.push(id);
    } else {
      // 5. Code-stage ⇒ returned for the refinement-loop letter path.
      letter.push(nf);
    }
  }

  // 6. Hand back the created Inbox ids and the code-stage findings.
  return { ran: true, inbox: inboxIds, letter };
}

module.exports = { runGdprFindings };
