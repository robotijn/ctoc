/**
 * Compliance integration seam (EC5-s3) — the advisory functional→implementation
 * orchestration that ties the two regime runners and the cross-regime dedup into
 * ONE gate-respecting call.
 *
 * `runComplianceForTransition(projectRoot, { gdprFindings, euAiActFindings })`:
 *
 *   1. Splits each regime's raw findings into plan-stage vs code-stage using the
 *      SAME routing predicate the runners use (a finding with a non-empty
 *      `target_file` string is code-stage; the rest are plan-stage).
 *   2. Cross-dedups ONLY the plan-stage findings via EC5-s2's
 *      `deduplicateFindings(gdprPlanStage, euAiActPlanStage)` on
 *      `(kind, regulation_ref_normalized)`. Code-stage findings are NEVER
 *      cross-deduped (letters are per-regime; the loop owns them).
 *   3. Guarantees a SINGLE Inbox write per merged plan-stage finding. This is the
 *      load-bearing composition choice (documented in the plan's "Decisions Taken
 *      Under Ambiguity"): the EC2/EC5-s1 runners write-and-return — each plan-stage
 *      finding they receive is written to the Inbox exactly once. To dedup BEFORE
 *      Inbox attachment (parent Success Metric 6) WITHOUT double-writing, the seam
 *      dedups the raw plan-stage findings first, then partitions each survivor to
 *      EXACTLY ONE runner by the survivor's regime shape. Because dedup already
 *      collapsed cross-regime duplicates to a single survivor, and each survivor is
 *      handed to a single runner, every merged finding is written once and only
 *      once. The runners remain the sole Inbox writers (single responsibility); no
 *      new Inbox writer is introduced.
 *   4. Returns a summary the caller (CTO Chief dispatch, EC5-s5) and the trigger
 *      emitter (EC5-s4) act on and log.
 *
 * Gating is DELEGATED, never re-implemented: each runner gates internally on its
 * own `shouldRun*`, so a profile that is off contributes nothing and this seam is
 * a provable no-op (no Inbox write, no plan mutation) when `active_profiles: []`.
 *
 * Advisory only: the seam adds NO human gate and mutates NO enforcement /
 * review-gate key. It NEVER moves a plan across any stage and NEVER requires the
 * gate-crossing path (no `../hooks/*`, no `./actions`). Its only side effect is
 * Inbox questions written by the runners. (Asserted by the gate-invariant test:
 * this source names no gate key and requires no hook.)
 *
 * Fail-open contract:
 *   - non-string `projectRoot` ⇒ both runners' gates resolve false ⇒ empty summary,
 *     `deduped:0`, no throw;
 *   - missing/`undefined` `opts` or non-array findings fields ⇒ coerced to `[]`;
 *   - never throws for the documented fail-open cases.
 *
 * Dependency direction: lib → lib only. Imports the two runners and the pure dedup
 * module — nothing from hooks or commands. Cross-platform by delegation: builds no
 * paths; `projectRoot` flows straight to the runners.
 */

'use strict';

const { runGdprFindings } = require('./gdpr-agent-runner');
const { runEuAiActFindings } = require('./eu-ai-act-agent-runner');
const { deduplicateFindings } = require('./compliance-dedup');

/**
 * Split a findings list into plan-stage vs code-stage using the SAME predicate the
 * runners use: a finding carrying a non-empty `target_file` string is code-stage
 * (it takes the per-regime letter path); everything else is plan-stage (it takes
 * the Inbox path and is eligible for cross-regime dedup). Non-array ⇒ empty split.
 * Never mutates its input; never throws.
 *
 * @param {object[]} findings
 * @returns {{ planStage: object[], codeStage: object[] }}
 */
function splitByRoute(findings) {
  const list = Array.isArray(findings) ? findings : [];
  const planStage = [];
  const codeStage = [];
  for (const f of list) {
    if (f !== null && typeof f === 'object' && typeof f.target_file === 'string' && f.target_file.length > 0) {
      codeStage.push(f);
    } else {
      planStage.push(f);
    }
  }
  return { planStage, codeStage };
}

/**
 * Decide which runner a merged plan-stage survivor belongs to, from its shape.
 * A finding whose `regulation === 'eu-ai-act'` is EU-AI-Act's; everything else
 * (including a GDPR finding carrying `gdpr_article`, or a survivor lacking a
 * regime tag) defaults to GDPR dispatch. Documented choice: GDPR-first precedence,
 * consistent with the dedup tie-break (EC2/first-seen wins). This matters for
 * single-write: the EU-AI-Act runner fail-strictly DROPS any finding whose
 * `regulation !== 'eu-ai-act'`, so a GDPR-shaped survivor must go to the GDPR
 * runner to be written at all.
 *
 * @param {object} finding
 * @returns {'gdpr' | 'eu-ai-act'}
 */
function regimeOf(finding) {
  if (finding !== null && typeof finding === 'object' && finding.regulation === 'eu-ai-act') {
    return 'eu-ai-act';
  }
  return 'gdpr';
}

/**
 * Orchestrate both regime runners with cross-regime plan-stage dedup and a
 * guaranteed single-write. See the module header for the full contract.
 *
 * @param {string} projectRoot - resolved project root (delegated to the runners'
 *   gates and Inbox writer; a wrong/non-string root fails safe to an empty summary).
 * @param {{ gdprFindings?: object[], euAiActFindings?: object[] }} [opts] - the raw
 *   findings each agent derived. Missing/non-array fields ⇒ `[]`.
 * @returns {{ gdprRan: boolean, euAiActRan: boolean, inboxIds: string[], letters: object[], deduped: number }}
 *   - `gdprRan` / `euAiActRan`: each runner's authoritative gate result;
 *   - `inboxIds`: all created Inbox question ids (single-write ⇒ deduped count);
 *   - `letters`: all code-stage findings collected across both regimes (never
 *     cross-deduped);
 *   - `deduped`: count of cross-regime plan-stage duplicates collapsed (0 when
 *     fewer than two plan-stage findings survive to merge).
 */
function runComplianceForTransition(projectRoot, opts) {
  const o = opts && typeof opts === 'object' ? opts : {};

  // 1. Split each regime's raw findings by route.
  const g = splitByRoute(o.gdprFindings);
  const a = splitByRoute(o.euAiActFindings);

  // 2. Cross-dedup ONLY the plan-stage findings (EC2 first for stable precedence).
  const mergedPlanStage = deduplicateFindings(g.planStage, a.planStage);
  const deduped = (g.planStage.length + a.planStage.length) - mergedPlanStage.length;

  // 3. Partition the merged survivors by regime so each is written EXACTLY ONCE.
  const gdprPlan = [];
  const aiActPlan = [];
  for (const finding of mergedPlanStage) {
    if (regimeOf(finding) === 'eu-ai-act') aiActPlan.push(finding);
    else gdprPlan.push(finding);
  }

  // 4. Dispatch to each runner: its deduped plan-stage survivors + its own
  //    code-stage findings (untouched). Each runner gates internally; an off
  //    profile ⇒ {ran:false} ⇒ no side effects, so this is a provable no-op.
  const gdprRes = runGdprFindings(projectRoot, [...gdprPlan, ...g.codeStage]);
  const aiActRes = runEuAiActFindings(projectRoot, [...aiActPlan, ...a.codeStage]);

  return {
    gdprRan: gdprRes.ran,
    euAiActRan: aiActRes.ran,
    inboxIds: [...gdprRes.inbox, ...aiActRes.inbox],
    letters: [...gdprRes.letter, ...aiActRes.letter],
    deduped,
  };
}

module.exports = { runComplianceForTransition };
