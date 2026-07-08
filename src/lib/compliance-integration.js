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
 * Fail-open contract (SEAM fail-open, RUNNER fail-loud — the load-bearing split):
 *   - non-string `projectRoot` ⇒ both runners' gates resolve false ⇒ empty summary,
 *     `deduped:0`, no throw;
 *   - missing/`undefined` `opts` or non-array findings fields ⇒ coerced to `[]`;
 *   - The GDPR RUNNER stays fail-loud: it THROWS via `validateFindingSchema` on a
 *     missing/unknown `gdpr_article` — a bad code must never be silently EMITTED to
 *     the Inbox (that is the runner's single-responsibility guard, unchanged here).
 *     The SEAM wraps that guard so the SEAM never throws: BEFORE dispatching GDPR
 *     findings, the seam partitions them into schema-VALID vs INVALID by calling
 *     `validateFindingSchema` per finding inside a try/catch (mirroring the
 *     EU-AI-Act runner's `filterToEuAiAct` fail-strict-DROP). Valid findings are
 *     dispatched to the runner (which re-validates them, always passing); invalid
 *     findings are DROPPED and RECORDED in `summary.droppedFindings` — never emitted,
 *     never silently lost. The runner therefore only ever RECEIVES valid findings,
 *     so its loud throw never fires through this seam.
 *   - The two regimes run INDEPENDENTLY: a failure (or empty result) in one regime
 *     NEVER aborts or skips the other. Each runner dispatch is additionally wrapped
 *     in a try/catch as defense-in-depth — any unexpected throw is recorded in
 *     `droppedFindings` and the other regime still runs. This closes the confirmed
 *     defect where an unguarded GDPR throw aborted the seam and silently dropped a
 *     valid sibling EU-AI-Act finding (non-atomic cross-regime contamination).
 *   - never throws for any input; the seam's contract is total.
 *
 * Dependency direction: lib → lib only. Imports the two runners and the pure dedup
 * module — nothing from hooks or commands. Cross-platform by delegation: builds no
 * paths; `projectRoot` flows straight to the runners.
 */

'use strict';

const { runGdprFindings } = require('./gdpr-agent-runner');
const { runEuAiActFindings } = require('./eu-ai-act-agent-runner');
const { deduplicateFindings } = require('./compliance-dedup');
const { validateFindingSchema } = require('./gdpr-helpers');

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
 * Partition a list of GDPR-bound findings into schema-VALID vs INVALID using the
 * runner's own `validateFindingSchema`, wrapped per finding in a try/catch so the
 * SEAM never throws (the runner stays fail-loud; the seam turns that loud throw
 * into a fail-strict DROP + RECORD, mirroring the EU-AI-Act `filterToEuAiAct`
 * pattern). A finding that throws (unknown/missing `gdpr_article`, or a non-object
 * element) is DROPPED and recorded with its cause — never emitted, never silently
 * lost. Never mutates its input; never throws.
 *
 * @param {object[]} findings - GDPR-bound findings (plan-stage survivors and/or
 *   code-stage findings) headed for `runGdprFindings`.
 * @returns {{ valid: object[], dropped: Array<{ regime: 'gdpr', finding: any, reason: string }> }}
 */
function partitionValidGdpr(findings) {
  const valid = [];
  /** @type {Array<{ regime: 'gdpr', finding: any, reason: string }>} */
  const dropped = [];
  for (const finding of findings) {
    try {
      validateFindingSchema(finding);
      valid.push(finding);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      dropped.push({ regime: 'gdpr', finding, reason });
    }
  }
  return { valid, dropped };
}

/**
 * Orchestrate both regime runners with cross-regime plan-stage dedup, a
 * guaranteed single-write, and a total (never-throws) seam. See the module header
 * for the full SEAM-fail-open / RUNNER-fail-loud contract.
 *
 * @param {string} projectRoot - resolved project root (delegated to the runners'
 *   gates and Inbox writer; a wrong/non-string root fails safe to an empty summary).
 * @param {{ gdprFindings?: object[], euAiActFindings?: object[] }} [opts] - the raw
 *   findings each agent derived. Missing/non-array fields ⇒ `[]`.
 * @returns {{ gdprRan: boolean, euAiActRan: boolean, inboxIds: string[], letters: object[], deduped: number, droppedFindings: Array<{ regime: string, finding: any, reason: string }> }}
 *   - `gdprRan` / `euAiActRan`: each runner's authoritative gate result;
 *   - `inboxIds`: all created Inbox question ids (single-write ⇒ deduped count);
 *   - `letters`: all code-stage findings collected across both regimes (never
 *     cross-deduped);
 *   - `deduped`: count of cross-regime plan-stage duplicates collapsed (0 when
 *     fewer than two plan-stage findings survive to merge);
 *   - `droppedFindings`: findings the seam DID NOT emit — schema-invalid GDPR
 *     findings the runner would have thrown on, plus any finding lost to an
 *     unexpected runner throw (defense-in-depth). Always an array (empty on the
 *     clean path) so callers can surface it without a presence check.
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

  /** @type {Array<{ regime: string, finding: any, reason: string }>} */
  const droppedFindings = [];

  // 4. SEAM FAIL-OPEN: before dispatching GDPR findings, partition them into
  //    schema-VALID vs INVALID using the runner's own validator wrapped per
  //    finding (mirrors the EU-AI-Act filterToEuAiAct fail-strict-drop). The
  //    runner stays fail-loud on what it RECEIVES; the seam only ever hands it
  //    valid findings, so its throw never fires here. Invalid findings are
  //    dropped and recorded — never emitted, never silently lost.
  const { valid: gdprValid, dropped: gdprDropped } = partitionValidGdpr([...gdprPlan, ...g.codeStage]);
  droppedFindings.push(...gdprDropped);

  // 5. Dispatch each runner INDEPENDENTLY: a failure/empty in one regime must
  //    NEVER abort or skip the other. Each dispatch is wrapped in try/catch as
  //    defense-in-depth — any unexpected throw is recorded and the other regime
  //    still runs. Each runner gates internally; an off profile ⇒ {ran:false} ⇒
  //    no side effects, so an empty-profile run stays a provable no-op.
  let gdprRes = { ran: false, inbox: [], letter: [] };
  try {
    gdprRes = runGdprFindings(projectRoot, gdprValid);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    droppedFindings.push({ regime: 'gdpr', finding: gdprValid, reason: `runGdprFindings threw: ${msg}` });
  }

  const aiActInput = [...aiActPlan, ...a.codeStage];
  let aiActRes = { ran: false, inbox: [], letter: [] };
  try {
    aiActRes = runEuAiActFindings(projectRoot, aiActInput);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    droppedFindings.push({ regime: 'eu-ai-act', finding: aiActInput, reason: `runEuAiActFindings threw: ${msg}` });
  }

  return {
    gdprRan: gdprRes.ran,
    euAiActRan: aiActRes.ran,
    inboxIds: [...gdprRes.inbox, ...aiActRes.inbox],
    letters: [...gdprRes.letter, ...aiActRes.letter],
    deduped,
    droppedFindings,
  };
}

module.exports = { runComplianceForTransition };
