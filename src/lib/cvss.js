/**
 * CVSS — the single source of truth for CVSS v3 base-score computation and
 * severity banding across the security fleet.
 *
 * WHY THIS MODULE EXISTS (F1): two independent runners must turn a CVSS signal into a
 * blocking/non-blocking severity — DependencyAuditor (npm/pip/go/cargo/... audit) and
 * SCARunner (osv-scanner universal + native parsers). SCARunner originally used
 * `parseFloat`, which returns NaN on a CVSS **vector** string
 * (`CVSS:3.1/AV:N/...` — exactly what OSV `severity[].score` and RustSec
 * `advisory.cvss` emit), silently downgrading a CRITICAL dependency CVE to a
 * non-blocking MEDIUM so it shipped green. DependencyAuditor already carried the
 * correct scorer. This module extracts that logic verbatim so BOTH runners route
 * through one audited implementation — never two divergent copies.
 *
 * Zero dependencies. Pure functions. The severity VOCABULARY is a parameter so the
 * same code serves DependencyAuditor (mid-band key `MODERATE`) and SCARunner
 * (mid-band key `MEDIUM`) without divergence.
 *
 * The governing rule is NEVER UNDER-REPORT: when a severity signal cannot be fully
 * understood we OVER-report (mid band, or HIGH for an unparseable vector), never LOW.
 */

'use strict';

/**
 * The mid-band / unknown-default severity for a given vocabulary. DependencyAuditor
 * names it MODERATE; SCARunner names it MEDIUM. Resolve whichever the caller's map
 * provides so one implementation serves both, with a hard fallback of 'MODERATE'.
 * @param {Record<string, string>} SEVERITY
 * @returns {string}
 */
function midBand(SEVERITY) {
  return SEVERITY.MODERATE ?? SEVERITY.MEDIUM ?? 'MODERATE';
}

/**
 * Rank a severity STRING for MAX comparison (higher = worse). Keyed by the literal
 * severity tokens of both vocabularies (MODERATE and MEDIUM share rank 2).
 * @param {string} sev
 * @returns {number}
 */
function severityRank(sev) {
  return { INFO: 0, LOW: 1, MODERATE: 2, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[sev] ?? 2;
}

/**
 * The worse (higher-ranked) of two severity strings.
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
function maxSeverity(a, b) {
  return severityRank(a) >= severityRank(b) ? a : b;
}

/**
 * Map a bare severity LABEL (case-insensitive) to a SEVERITY.*, or null when the
 * token is not a known label. `medium`/`moderate` both resolve to the mid band.
 * @param {string} raw
 * @param {Record<string, string>} SEVERITY
 * @returns {string|null}
 */
function labelToSeverity(raw, SEVERITY) {
  const mid = midBand(SEVERITY);
  const LABELS = {
    critical: SEVERITY.CRITICAL,
    high: SEVERITY.HIGH,
    moderate: mid,
    medium: mid,
    low: SEVERITY.LOW,
    info: SEVERITY.INFO,
    informational: SEVERITY.INFO,
    none: SEVERITY.INFO
  };
  const m = String(raw).toLowerCase().match(/critical|high|moderate|medium|low|informational|info|none/);
  return m ? LABELS[m[0]] : null;
}

/**
 * Band a finite CVSS v3 base score into a severity. Only ever called with a real
 * number. 0/negative is not a real score ⇒ mid band (unknown), never LOW.
 * @param {number} score - CVSS v3 base score (0.0–10.0)
 * @param {Record<string, string>} SEVERITY
 * @returns {string}
 */
function bandCvss(score, SEVERITY) {
  if (score >= 9.0) return SEVERITY.CRITICAL;
  if (score >= 7.0) return SEVERITY.HIGH;
  if (score >= 4.0) return midBand(SEVERITY);
  if (score > 0) return SEVERITY.LOW;
  return midBand(SEVERITY);
}

/**
 * Compute a CVSS v3.0/3.1 base score from a vector string. Returns null when a
 * required metric is missing/unparseable (the caller then bands HIGH rather than
 * under-reporting). Implements the standard CVSS v3 base-score formula.
 *
 * Ported verbatim from DependencyAuditor._cvssVectorBaseScore (the audited original)
 * so the extraction is behavior-preserving.
 *
 * @param {string} vector - e.g. "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"
 * @returns {number|null} Base score 0.0–10.0, or null if not computable.
 */
function cvssVectorBaseScore(vector) {
  const parts = {};
  for (const seg of String(vector).split('/')) {
    const [k, v] = seg.split(':');
    if (k && v) parts[k.trim().toUpperCase()] = v.trim().toUpperCase();
  }
  const scope = parts.S; // U (unchanged) or C (changed)
  const AV = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 }[parts.AV];
  const AC = { L: 0.77, H: 0.44 }[parts.AC];
  const UI = { N: 0.85, R: 0.62 }[parts.UI];
  const PR = scope === 'C'
    ? { N: 0.85, L: 0.68, H: 0.5 }[parts.PR]
    : { N: 0.85, L: 0.62, H: 0.27 }[parts.PR];
  const impactVal = { H: 0.56, L: 0.22, N: 0 };
  const C = impactVal[parts.C];
  const I = impactVal[parts.I];
  const A = impactVal[parts.A];

  if ([AV, AC, UI, PR, C, I, A].some((x) => x == null) || (scope !== 'U' && scope !== 'C')) {
    return null; // incomplete/garbage vector ⇒ caller bands HIGH, never MODERATE
  }

  const iss = 1 - (1 - C) * (1 - I) * (1 - A);
  const impact = scope === 'C'
    ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15)
    : 6.42 * iss;
  const exploitability = 8.22 * AV * AC * PR * UI;

  if (impact <= 0) return 0;
  const roundup = (x) => Math.ceil(x * 10) / 10;
  const raw = scope === 'C'
    ? Math.min(1.08 * (impact + exploitability), 10)
    : Math.min(impact + exploitability, 10);
  return roundup(raw);
}

/**
 * Map a CVSS score OR a severity label OR a CVSS vector OR a list/object of any of
 * those to a standard severity — NEVER under-report.
 *
 * Ported verbatim from DependencyAuditor.mapCvssOrLabel, parameterized on the
 * SEVERITY vocabulary. Rules:
 *   - a number (or numeric string like "9.8") bands as a CVSS v3 score;
 *   - a CVSS vector string is base-scored, then banded; an unparseable vector ⇒ HIGH;
 *   - a known label maps to itself (case-insensitive; "medium"/"moderate" ⇒ mid band);
 *   - a list/object takes the MAX severity across its members;
 *   - anything unrecognised (absent, empty, an object with no score, NaN) ⇒ mid band,
 *     the documented unknown default — never LOW.
 *
 * @param {number|string|Array<any>|Record<string, any>|null|undefined} severity
 * @param {Record<string, string>} SEVERITY - the caller's vocabulary
 * @returns {string} one of SEVERITY.*
 */
function severityFromCvss(severity, SEVERITY) {
  const mid = midBand(SEVERITY);

  if (Array.isArray(severity)) {
    let worst = SEVERITY.INFO;
    for (const s of severity) worst = maxSeverity(worst, severityFromCvss(s, SEVERITY));
    return severity.length ? worst : mid;
  }
  if (severity && typeof severity === 'object') {
    const candidate = severity.baseScore ?? severity.score ?? severity.severity ?? severity.cvss ?? severity.vector;
    return candidate == null ? mid : severityFromCvss(candidate, SEVERITY);
  }

  if (typeof severity === 'string') {
    const raw = severity.trim();
    if (raw === '') return mid;

    // A CVSS vector string ("CVSS:3.1/AV:N/...") is NOT a bare number, so Number() is
    // NaN. Compute its base score; if the vector cannot be fully parsed, band HIGH — a
    // security advisory carrying a CVSS vector is never mid band, never LOW.
    if (/CVSS:|\bAV:[NALP]\b/i.test(raw)) {
      const score = cvssVectorBaseScore(raw);
      return score != null ? bandCvss(score, SEVERITY) : SEVERITY.HIGH;
    }

    // A MIXED string ("7.5 HIGH", "9.8 CRITICAL"): scan for BOTH a label token and a
    // numeric token and take the MAX of what each implies — never under-report.
    const labelSev = labelToSeverity(raw, SEVERITY);
    const numMatch = raw.match(/[\d.]+/);
    const numSev = (numMatch && Number.isFinite(parseFloat(numMatch[0]))) ? bandCvss(parseFloat(numMatch[0]), SEVERITY) : null;
    if (labelSev && numSev) return maxSeverity(labelSev, numSev);
    if (labelSev) return labelSev;
    if (numSev) return numSev;
    return mid; // unrecognised ⇒ over-report, never LOW
  }

  if (typeof severity === 'number' && Number.isFinite(severity)) {
    return bandCvss(severity, SEVERITY);
  }

  return mid; // null / undefined / NaN ⇒ unknown, not LOW
}

module.exports = {
  cvssVectorBaseScore,
  severityFromCvss,
  bandCvss
};
