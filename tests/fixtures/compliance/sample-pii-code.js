'use strict';

/*
 * DATA FIXTURE — NOT a module under test, never `require`d by a test.
 *
 * Illustrative (deliberately non-compliant) source scanned by the GDPR
 * agent/skill layer. It demonstrates three tracked GDPR issues:
 *
 *   1. Analytics SDK initialised BEFORE any consent gate (missing-consent-banner
 *      → GDPR Art. 7 conditions for consent).
 *   2. `email` / `ipAddress` (an online identifier per Recital 30) shipped to a
 *      US endpoint with no SCC/DPF safeguard (non-eu-transfer-without-sccs-dpf
 *      → GDPR Chapter V).
 *   3. A "delete" that only soft-deletes, never hard-purging the PII
 *      (bears on the erasure duty, GDPR Art. 17).
 *
 * The finding kinds are tracked in fixture-manifest.yaml. This file is loaded as
 * TEXT by the manifest-completeness test; it is not executed there.
 */

// Non-EU (US) analytics endpoint — no SCC/DPF basis documented anywhere.
const ANALYTICS_ENDPOINT = 'https://api.segment.io/v1/track';

// ISSUE 1: the analytics SDK fires on load, before any consent has been asked.
function initAnalyticsOnLoad(session) {
  return sendEvent('pageview', {
    email: session.email,
    ipAddress: session.ipAddress,
  });
}

// ISSUE 2: PII (email + ipAddress) transferred to a US endpoint with no safeguard.
function sendEvent(eventName, payload) {
  return {
    endpoint: ANALYTICS_ENDPOINT,
    body: JSON.stringify({ event: eventName, properties: payload }),
  };
}

// ISSUE 3: "deletion" only flips a flag — the PII is never actually purged.
function deleteUser(store, userId) {
  const record = store.get(userId);
  if (record) {
    record.deleted = true; // soft delete only; email/ipAddress remain in place
  }
  return record;
}

module.exports = {
  ANALYTICS_ENDPOINT,
  initAnalyticsOnLoad,
  sendEvent,
  deleteUser,
};
