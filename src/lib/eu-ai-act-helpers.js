/**
 * EU AI Act deterministic rule core (EC3-s1).
 *
 * The machine-checkable heart of the EU-AI-Act compliance agent. The agent
 * prompt (s2) references these functions by name; the registry wiring (s3)
 * gates on them. Everything the agent needs that a linter/`node --test` can
 * actually verify lives HERE.
 *
 * Two load-bearing design decisions:
 *
 *  1. **Scope isolation is an OUTPUT FILTER, not phase invocation.** The
 *     `ai-governance-checker` skill interleaves EU AI Act, NIST and ISO
 *     obligations across its six scan phases — that is prose, not a code
 *     boundary. So `filterToEuAiAct(findings)` keeps ONLY findings whose
 *     `regulation === 'eu-ai-act'`, and is **fail-strict**: a finding with a
 *     missing/other `regulation` field is DROPPED (never passed through).
 *     This is the whole reason the module is unit-testable in isolation of the
 *     agent markdown.
 *
 *  2. **Dates are READ FROM THE PROFILE, never hardcoded.**
 *     `readEnforcementDates` parses `.ctoc/regulatory-regimes/eu-ai-act-high-risk.yaml`
 *     and returns whatever dates that file states, marked `verified: false`
 *     (informational this run; EC4 verifies live). No enforcement date is
 *     baked into this function body.
 *
 * Every function is pure and deterministic except `readEnforcementDates`,
 * which performs one fail-open `safe-fs` read and never throws. No I/O writes.
 *
 * Dependency direction: lib → lib only. Imports `./safe-fs` for the single
 * read; imports nothing from hooks or commands, and NOT `compliance-regime.js`
 * (the gate is the agent's job — this module stays independently testable).
 *
 * Cross-platform: caller-supplied path used as-is via `safe-fs` (CRLF-tolerant);
 * no hardcoded separators, no `~`, no shell.
 */

'use strict';

const safeFs = require('./safe-fs');

/** The single `regulation` value this agent owns (matches SKILL.md line 520). */
const EU_AI_ACT_REGULATION = 'eu-ai-act';

/**
 * Annex III category → risk_class, keyed on the skill's real
 * `annex_iii_category` enum spellings (SKILL.md lines 523–525). Frozen: no
 * untrusted key ever lands here. Every Annex III domain is `high-risk`.
 * @type {Readonly<Record<string, string>>}
 */
const RISK_TIER_TABLE = Object.freeze({
  '1-biometrics': 'high-risk',
  '2-critical-infrastructure': 'high-risk',
  '3-education': 'high-risk',
  '4-employment': 'high-risk',
  '5-essential-services': 'high-risk',
  '6-law-enforcement': 'high-risk',
  '7-migration': 'high-risk',
  '8-justice': 'high-risk',
});

/**
 * Static (never dynamic) keyword tables for the plan-text classifier. Ordered
 * by legal precedence: prohibited practices (Art. 5) win over Annex III, which
 * wins over transparency/GPAI. All matching is case-insensitive and
 * word-bounded; no RegExp is ever built from the input.
 */

// Art. 5 prohibited practices → { risk_class:'prohibited', category:null, confidence:'high' }
// Each pattern is linear-time (no nested/overlapping unbounded quantifiers).
const PROHIBITED_PATTERNS = [
  /\breal[- ]?time remote biometric identification\b/i,
  /\buntargeted facial scraping\b/i,
  /\buntargeted face image scraping\b/i,
  /\buntargeted facial image scraping\b/i,
  /\bsocial scoring\b/i,
  /\bemotion recognition in the workplace\b/i,
  /\bemotion recognition at school\b/i,
  /\bpredictive policing based on profiling\b/i,
  /\bpredictive policing based solely on profiling\b/i,
];

// Annex III domains → { risk_class:'high-risk', category, confidence:'medium' }
// First match wins; order = specificity.
const ANNEX_III_PATTERNS = [
  { re: /\b(?:screen(?:ing|s|ed)?|rank(?:ing|s|ed)?|filter(?:ing|s|ed)?)\s+(?:cvs?|r[eé]sum[eé]s?|candidates?|applicants?|job\s+applications?)\b/i, category: '4-employment' },
  { re: /\b(?:recruit(?:ment|ing)|hiring\s+decision|candidate\s+selection)\b/i, category: '4-employment' },
  { re: /\bbiometric\s+(?:identification|categorisation|categorization|verification)\b/i, category: '1-biometrics' },
  { re: /\bcredit scoring\b/i, category: '5-essential-services' },
  { re: /\bcreditworthiness\b/i, category: '5-essential-services' },
  { re: /\bloan (?:approval|decision|eligibility)\b/i, category: '5-essential-services' },
  { re: /\bessential (?:public )?services? (?:eligibility|access)\b/i, category: '5-essential-services' },
  { re: /\b(?:law[-\s]?enforcement|police\s+(?:use|investigation)|criminal\s+risk\s+assessment)\b/i, category: '6-law-enforcement' },
  { re: /\b(?:critical\s+infrastructure|safety\s+component\s+of\s+(?:road\s+traffic|water|gas|electricity))\b/i, category: '2-critical-infrastructure' },
  { re: /\b(?:student\s+(?:admission|assessment|grading)|educational\s+(?:admission|scoring)|exam\s+proctoring)\b/i, category: '3-education' },
  { re: /\b(?:visa\s+application|asylum\s+(?:claim|assessment)|migration\s+(?:risk|control)|border\s+control\s+eligibility)\b/i, category: '7-migration' },
  { re: /\b(?:judicial\s+decision|administration\s+of\s+justice|court\s+ruling\s+assistance)\b/i, category: '8-justice' },
];

// Transparency (Art. 50) → { risk_class:'limited-risk', category:null, confidence:'medium' }
const LIMITED_RISK_PATTERNS = [
  /\bchat\s?bot\b/i,
  /\bchat\s+assistant\b/i,
  /\bcustomer[-\s]?facing\s+(?:chat|assistant|bot)\b/i,
  /\bdeepfake\b/i,
  /\bgenerated\s+content\b/i,
];

// GPAI provider (Chapter V) → { risk_class:'gpai', category:null, confidence:'medium' }
const GPAI_PATTERNS = [
  /\b(?:provide|provided|providing|train|trains|training) (?:a )?large language model\b/i,
  /\b(?:provide|provided|providing|train|trains|training) (?:a )?foundation model\b/i,
  /\bfoundation model provider\b/i,
  /\bgeneral[- ]purpose (?:ai )?model provider\b/i,
  /\bgpai provider\b/i,
];

/**
 * Heuristic risk classification from plan prose. Deterministic, never throws.
 *
 * Precedence: prohibited (Art. 5) > Annex III high-risk > transparency
 * (limited-risk) > GPAI provider > unknown. Case-insensitive, word-bounded;
 * no dynamic RegExp is built from the input.
 *
 * @param {string} planText - free-form plan prose.
 * @returns {{ risk_class: string, annex_iii_category: string|null, confidence: 'high'|'medium'|'low' }}
 *   `{ risk_class:'unknown', annex_iii_category:null, confidence:'low' }` for
 *   non-string / empty input or no keyword match.
 */
function classifyFromPlanText(planText) {
  if (typeof planText !== 'string' || planText.length === 0) {
    return { risk_class: 'unknown', annex_iii_category: null, confidence: 'low' };
  }

  for (const re of PROHIBITED_PATTERNS) {
    if (re.test(planText)) {
      return { risk_class: 'prohibited', annex_iii_category: null, confidence: 'high' };
    }
  }

  for (const { re, category } of ANNEX_III_PATTERNS) {
    if (re.test(planText)) {
      // risk_class flows from the frozen table, never a literal.
      return {
        risk_class: RISK_TIER_TABLE[category],
        annex_iii_category: category,
        confidence: 'medium',
      };
    }
  }

  for (const re of LIMITED_RISK_PATTERNS) {
    if (re.test(planText)) {
      return { risk_class: 'limited-risk', annex_iii_category: null, confidence: 'medium' };
    }
  }

  for (const re of GPAI_PATTERNS) {
    if (re.test(planText)) {
      return { risk_class: 'gpai', annex_iii_category: null, confidence: 'medium' };
    }
  }

  return { risk_class: 'unknown', annex_iii_category: null, confidence: 'low' };
}

/**
 * Retain ONLY findings whose `regulation === 'eu-ai-act'`. **Fail-strict:** a
 * finding with a missing `regulation` field, or any other regulation value
 * (`nist-ai-rmf`, `nist-ai-600-1`, `iso-42001`), is DROPPED. Non-array input
 * → `[]`. Does not mutate the input array.
 *
 * @param {object[]} findings
 * @returns {object[]}
 */
function filterToEuAiAct(findings) {
  if (!Array.isArray(findings)) return [];
  return findings.filter(
    (f) =>
      f !== null &&
      typeof f === 'object' &&
      f.regulation === EU_AI_ACT_REGULATION
  );
}

/**
 * Return a shallow copy with `severity: 'critical'` set unconditionally
 * (warnings-are-critical — no soft tier on the wire). Non-object input →
 * `{ severity: 'critical' }`. Never mutates the input.
 *
 * @param {object} finding
 * @returns {object}
 */
function normalizeSeverity(finding) {
  if (finding === null || typeof finding !== 'object') {
    return { severity: 'critical' };
  }
  return { ...finding, severity: 'critical' };
}

/**
 * Route a finding: `{ route:'letter' }` when it carries a non-empty
 * `target_file` string (a code-stage finding attached to a real path —
 * `'repo-root'` is a real org-level marker and routes to letter);
 * `{ route:'inbox' }` otherwise (plan-stage finding). Deterministic, never
 * throws.
 *
 * @param {object} finding
 * @returns {{ route: 'inbox' } | { route: 'letter' }}
 */
function routeFinding(finding) {
  if (
    finding !== null &&
    typeof finding === 'object' &&
    typeof finding.target_file === 'string' &&
    finding.target_file.length > 0
  ) {
    return { route: 'letter' };
  }
  return { route: 'inbox' };
}

/**
 * The all-null date shape returned on any read/parse failure (fail-open).
 * @param {string|null} source
 * @returns {{ art5_prohibitions: null, art4_ai_literacy: null, chapter_v_gpai: null, annex_iii_high_risk: null, effective_date: null, source: string|null, verified: false }}
 */
function nullDates(source) {
  return {
    art5_prohibitions: null,
    art4_ai_literacy: null,
    chapter_v_gpai: null,
    annex_iii_high_risk: null,
    effective_date: null,
    source: source,
    verified: false,
  };
}

// Word-month → 2-digit month, for parsing the profile's prose date notes.
const MONTHS = Object.freeze({
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
});

/**
 * Parse a word date ("February 2 2025") that immediately follows a given
 * anchor phrase in the profile prose, returning ISO `YYYY-MM-DD` or null.
 * The anchor is a STATIC regex source (never built from untrusted input).
 *
 * @param {string} text
 * @param {RegExp} anchorDateRe - static regex whose groups 1=month,2=day,3=year
 * @returns {string|null}
 */
function isoDateAfter(text, anchorDateRe) {
  const m = anchorDateRe.exec(text);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  const day = String(m[2]).padStart(2, '0');
  const year = m[3];
  return `${year}-${month}-${day}`;
}

/**
 * Read the EU AI Act enforcement dates FROM the regime profile YAML — never
 * hardcoded. Parses the `effective_date:` line and the prose `notes:` block of
 * `.ctoc/regulatory-regimes/eu-ai-act-high-risk.yaml` and returns the
 * structured milestone dates, marked `verified: false` (informational this
 * run; EC4 verifies live).
 *
 * Fail-open: missing file, unreadable path, or unparsable content → all date
 * fields `null`, `source: profilePath`, `verified: false`. NEVER throws.
 *
 * @param {string} profilePath - path to the regime YAML (supplied by caller).
 * @returns {{ art5_prohibitions: string|null, art4_ai_literacy: string|null, chapter_v_gpai: string|null, annex_iii_high_risk: string|null, effective_date: string|null, source: string|null, verified: false }}
 */
function readEnforcementDates(profilePath) {
  if (typeof profilePath !== 'string' || profilePath.length === 0) {
    return nullDates(typeof profilePath === 'string' ? profilePath : null);
  }

  try {
    if (!safeFs.existsSync(profilePath)) return nullDates(profilePath);

    const raw = safeFs.readFileSync(profilePath, 'utf8');
    if (typeof raw !== 'string' || raw.length === 0) return nullDates(profilePath);

    // effective_date: "YYYY-MM-DD" — the top-level structured field.
    const effM = /^effective_date:\s*["']?(\d{4}-\d{2}-\d{2})["']?/m.exec(raw);
    const effective_date = effM ? effM[1] : null;

    // Milestone dates from the prose notes block. Each anchor is a STATIC
    // regex; the word-date is parsed to ISO. Dates come from the file, not
    // from any literal in this function.
    const WORD_DATE = '([A-Za-z]+)\\s+(\\d{1,2})\\s+(\\d{4})';
    const art5_prohibitions = isoDateAfter(
      raw,
      new RegExp('Article\\s+5\\s+prohibitions\\s+effective\\s+' + WORD_DATE, 'i')
    );
    const art4_ai_literacy = isoDateAfter(
      raw,
      new RegExp('Article\\s+4\\s+AI\\s+literacy\\s+effective\\s+' + WORD_DATE, 'i')
    );
    const chapter_v_gpai = isoDateAfter(
      raw,
      new RegExp('Chapter\\s+V[^.]*?obligations\\s+effective\\s+' + WORD_DATE, 'i')
    );
    const annex_iii_high_risk = isoDateAfter(
      raw,
      new RegExp('Annex\\s+III\\s+high-risk\\s+obligations\\s+effective\\s+' + WORD_DATE, 'i')
    );

    return {
      art5_prohibitions,
      art4_ai_literacy,
      chapter_v_gpai,
      annex_iii_high_risk,
      effective_date,
      source: profilePath,
      verified: false,
    };
  } catch {
    // fs / parse error ⇒ fail-open (matching compliance-regime.js).
    return nullDates(profilePath);
  }
}

module.exports = {
  EU_AI_ACT_REGULATION,
  RISK_TIER_TABLE,
  classifyFromPlanText,
  filterToEuAiAct,
  normalizeSeverity,
  routeFinding,
  readEnforcementDates,
};
