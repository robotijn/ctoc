/**
 * EU AI Act agent runner (EC5-s1) — the LIVE gate-then-route seam.
 *
 * Parity with `src/lib/gdpr-agent-runner.js`, adapted to the EU-AI-Act rule
 * core. The EU AI Act agent (agents/compliance/eu-ai-act-agent.md) is prose;
 * this module is the unit-testable executable that enforces its contract
 * end-to-end so EC5's orchestration (s3) can call `runEuAiActFindings` exactly
 * as it calls `runGdprFindings`:
 *
 *   1. GATE FIRST on `shouldRunEuAiAct(projectRoot)`. When the eu-ai-act-high-risk
 *      regulatory profile is not active, the runner does NOTHING — no Inbox
 *      write, no plan read, no further work — and returns
 *      `{ ran:false, inbox:[], letter:[] }`.
 *   2. `filterToEuAiAct(list)` — fail-strict scope isolation: DROP any finding
 *      whose `regulation !== 'eu-ai-act'` (a foreign or fieldless finding is
 *      never emitted). This is the EU-AI-Act rule core's authority mechanism,
 *      replacing the GDPR runner's per-finding throwing validator.
 *   3. For each surviving finding: `normalizeSeverity` (severity forced to
 *      "critical") → `routeFinding`. Plan-stage findings (`route:'inbox'` — no
 *      `target_file`) are written to the REAL Inbox via `inbox.createQuestion` —
 *      the plan-stage attachment surface the human acts on at morning review.
 *      Code-stage findings (`route:'letter'` — carry `target_file`) are
 *      COLLECTED and returned in `letter[]` for the refinement-loop letter path
 *      (this runner does not author the letter; the loop owns that).
 *
 * Advisory only: the runner adds NO human gate and mutates NO enforcement /
 * review-gate key — it writes only Inbox questions. (Asserted by the gate
 * invariant test: this source names no gate key.)
 *
 * Fail-open contract:
 *   - non-string / wrong root ⇒ `shouldRunEuAiAct` returns false ⇒ `{ ran:false }`;
 *   - non-array `findings` ⇒ treated as `[]` (ran:true, empty results);
 *   - `filterToEuAiAct` / `normalizeSeverity` / `routeFinding` never throw.
 *   The runner NEVER throws.
 *
 * Dependency direction: lib → lib only. Imports `eu-ai-act-helpers` (pure),
 * `compliance-regime` (the gate) and `inbox` (the real writer) — nothing from
 * hooks or commands. Cross-platform by delegation: `projectRoot` is passed
 * straight to `shouldRunEuAiAct` / `inbox.createQuestion`, both of which
 * `path.join` internally; the runner builds no paths.
 */

'use strict';

const { shouldRunEuAiAct } = require('./compliance-regime');
const { filterToEuAiAct, normalizeSeverity, routeFinding } = require('./eu-ai-act-helpers');
const inbox = require('./inbox');

/**
 * Build the human-facing context blob attached to an Inbox question. Names the
 * EU-AI-Act facts (risk_class, severity, and — when present — the Annex III
 * category, the model's confidence, the finding kind and any regulation_ref) so
 * morning review has the machine-checkable facts alongside the prose question.
 * @param {object} finding - a scope-filtered, severity-normalized finding
 * @returns {string}
 */
function buildContext(finding) {
  const parts = [
    `risk_class: ${finding.risk_class}`,
    `severity: ${finding.severity}`,
  ];
  if (finding.annex_iii_category) parts.push(`annex_iii_category: ${finding.annex_iii_category}`);
  if (finding.confidence) parts.push(`confidence: ${finding.confidence}`);
  if (finding.kind) parts.push(`kind: ${finding.kind}`);
  if (finding.regulation_ref) parts.push(`regulation_ref: ${finding.regulation_ref}`);
  return parts.join('\n');
}

/**
 * Execute the EU AI Act agent's gate-then-route contract for one
 * compliance-review run.
 *
 * @param {string} projectRoot - the resolved project root (delegated to the gate
 *   and the Inbox writer; a wrong/non-string root fails safe to `{ ran:false }`).
 * @param {Array<object>} [findings] - raw findings the agent derived (plan-stage)
 *   or the skill produced (code-stage). Non-array ⇒ treated as `[]`.
 * @returns {{ ran: boolean, inbox: string[], letter: object[] }}
 *   - `ran`: whether the gate was on (false ⇒ no side effects at all);
 *   - `inbox`: the ids of the Inbox questions created for plan-stage findings;
 *   - `letter`: the scope-filtered, severity:critical code-stage findings handed
 *     back for the refinement-loop letter path.
 */
function runEuAiActFindings(projectRoot, findings) {
  // 1. GATE FIRST — no gate ⇒ no output, no writes, no reads.
  if (!shouldRunEuAiAct(projectRoot)) {
    return { ran: false, inbox: [], letter: [] };
  }

  // 2. Coerce a non-array findings arg to [] (fail-open; ran stays true), then
  //    fail-strictly drop every finding whose regulation !== 'eu-ai-act'.
  const list = Array.isArray(findings) ? findings : [];
  const kept = filterToEuAiAct(list);

  const inboxIds = [];
  const letter = [];

  for (const finding of kept) {
    // 3. Normalize severity to critical, then route.
    const nf = normalizeSeverity(finding);
    const { route } = routeFinding(nf);

    if (route === 'inbox') {
      // 4. Plan-stage ⇒ real Inbox question (the human acts on it at review).
      const { id } = inbox.createQuestion(
        {
          source_plan: nf.plan || nf.source_plan || '',
          source_step: 'compliance-eu-ai-act',
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

module.exports = { runEuAiActFindings };
