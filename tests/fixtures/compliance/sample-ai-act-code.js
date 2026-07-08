'use strict';

/*
 * DATA FIXTURE — NOT a module under test, never `require`d by a test.
 *
 * Illustrative (deliberately non-compliant) source touching an EU-AI-Act
 * relevant surface: an automated loan-decision model. It demonstrates two
 * tracked AI-Act issues:
 *
 *   1. The model's decision is written straight to the database and acted on
 *      with NO human-review step (missing-oversight → EU-AI-Act Art. 14 human
 *      oversight for high-risk systems).
 *   2. There is NO AI-system inventory entry (no ai-systems.yaml registration)
 *      for this deployed model (missing-inventory → EU-AI-Act Art. 11 technical
 *      documentation / registration).
 *
 * The finding kinds are tracked in fixture-manifest.yaml. This file is loaded as
 * TEXT by the manifest-completeness test; it is not executed there.
 */

// A creditworthiness / loan-eligibility model — an Annex III point-5 surface.
function scoreLoanApplication(application) {
  // Placeholder scoring; the point is the missing governance around it.
  const risk = (application.debtRatio || 0) * 100 - (application.income || 0) / 1000;
  return { approved: risk < 0, score: risk };
}

// ISSUE 1 + 2: the model output is persisted and enforced with no human review,
// and the system is never registered in an AI-system inventory.
function decideAndPersist(db, application) {
  const decision = scoreLoanApplication(application);
  // No human-oversight endpoint, no reviewer sign-off — decision is final here.
  db.write('loan_decisions', {
    applicationId: application.id,
    approved: decision.approved,
    decidedBy: 'model', // never a human
  });
  return decision;
}

module.exports = {
  scoreLoanApplication,
  decideAndPersist,
};
