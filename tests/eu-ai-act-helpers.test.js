/**
 * Unit tests for src/lib/eu-ai-act-helpers.js (EC3-s1).
 *
 * The deterministic EU-AI-Act rule core: risk classification from plan prose,
 * the EU-AI-Act-ONLY output filter (fail-strict), the severity normalizer
 * (warnings-are-critical), the finding router (inbox vs letter), and the
 * profile date reader (dates read from the regime YAML, NEVER hardcoded;
 * marked verified:false this run).
 *
 * `node:test` + `assert/strict` only. Real assertions, no always-green.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const helpers = require('../src/lib/eu-ai-act-helpers');

const PROFILE_SRC = path.join(
  __dirname,
  '..',
  '.ctoc',
  'regulatory-regimes',
  'eu-ai-act-high-risk.yaml'
);

// ─────────────────────────────────────────────────────────────────────
// classifyFromPlanText
// ─────────────────────────────────────────────────────────────────────

describe('classifyFromPlanText', () => {
  it('1. CV screening → Annex III §4 employment, high-risk, medium confidence', () => {
    const text =
      'We build a system that screens CVs and ranks candidates to select ' +
      'applicants for a job interview.';
    const out = helpers.classifyFromPlanText(text);
    assert.equal(out.risk_class, 'high-risk');
    assert.equal(out.annex_iii_category, '4-employment');
    assert.equal(out.confidence, 'medium');
  });

  it('2. real-time remote biometric ID in public → prohibited, null category, high confidence', () => {
    const text =
      'The service performs real-time remote biometric identification in ' +
      'publicly accessible spaces for law enforcement.';
    const out = helpers.classifyFromPlanText(text);
    assert.equal(out.risk_class, 'prohibited');
    assert.equal(out.annex_iii_category, null);
    assert.equal(out.confidence, 'high');
  });

  it('3. customer chatbot → limited-risk, medium confidence', () => {
    const text =
      'A customer-facing chatbot answers support questions using generated ' +
      'content in a chat assistant window.';
    const out = helpers.classifyFromPlanText(text);
    assert.equal(out.risk_class, 'limited-risk');
    assert.equal(out.confidence, 'medium');
  });

  it('4. GPAI provider → gpai', () => {
    const text =
      'Our company will provide and train a large language model as a ' +
      'foundation model provider for downstream deployers.';
    const out = helpers.classifyFromPlanText(text);
    assert.equal(out.risk_class, 'gpai');
    assert.equal(out.annex_iii_category, null);
  });

  it('5. no AI signal → unknown, null, low', () => {
    const text = 'A simple static marketing landing page with a contact form.';
    const out = helpers.classifyFromPlanText(text);
    assert.deepEqual(out, {
      risk_class: 'unknown',
      annex_iii_category: null,
      confidence: 'low',
    });
  });

  it('6. non-string input → unknown/low, never throws', () => {
    for (const bad of [null, 42, undefined, {}, [], '']) {
      const out = helpers.classifyFromPlanText(bad);
      assert.equal(out.risk_class, 'unknown');
      assert.equal(out.annex_iii_category, null);
      assert.equal(out.confidence, 'low');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// filterToEuAiAct — FAIL-STRICT
// ─────────────────────────────────────────────────────────────────────

describe('filterToEuAiAct (fail-strict output filter)', () => {
  it('7. drops NIST and ISO findings', () => {
    const input = [{ regulation: 'nist-ai-rmf' }, { regulation: 'iso-42001' }];
    assert.deepEqual(helpers.filterToEuAiAct(input), []);
  });

  it('8. keeps only eu-ai-act, order preserved', () => {
    const input = [
      { regulation: 'eu-ai-act', id: 'a' },
      { regulation: 'nist-ai-rmf' },
      { regulation: 'eu-ai-act', id: 'b' },
    ];
    const out = helpers.filterToEuAiAct(input);
    assert.equal(out.length, 2);
    assert.equal(out[0].id, 'a');
    assert.equal(out[1].id, 'b');
  });

  it('9. fail-strict: a finding with NO regulation field is DROPPED', () => {
    const input = [{ kind: 'missing-inventory' }];
    assert.deepEqual(helpers.filterToEuAiAct(input), []);
  });

  it('9b. fail-strict: null/undefined regulation values dropped, non-object entries dropped', () => {
    const input = [
      { regulation: null },
      { regulation: undefined },
      null,
      'eu-ai-act',
      { regulation: 'eu-ai-act', id: 'keep' },
    ];
    const out = helpers.filterToEuAiAct(input);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 'keep');
  });

  it('10. non-array input → []', () => {
    assert.deepEqual(helpers.filterToEuAiAct(null), []);
    assert.deepEqual(helpers.filterToEuAiAct(undefined), []);
    assert.deepEqual(helpers.filterToEuAiAct({}), []);
    assert.deepEqual(helpers.filterToEuAiAct('eu-ai-act'), []);
  });

  it('11. does not mutate the input array', () => {
    const input = [
      { regulation: 'eu-ai-act', id: 'a' },
      { regulation: 'nist-ai-rmf' },
    ];
    const len = input.length;
    helpers.filterToEuAiAct(input);
    assert.equal(input.length, len);
    assert.equal(input[1].regulation, 'nist-ai-rmf');
  });
});

// ─────────────────────────────────────────────────────────────────────
// normalizeSeverity — warnings-are-critical
// ─────────────────────────────────────────────────────────────────────

describe('normalizeSeverity (always critical)', () => {
  it('12. upgrades low to critical, preserves other fields, no mutation', () => {
    const input = { severity: 'low', kind: 'x' };
    const out = helpers.normalizeSeverity(input);
    assert.equal(out.severity, 'critical');
    assert.equal(out.kind, 'x');
    // input unmutated
    assert.equal(input.severity, 'low');
    assert.notEqual(out, input);
  });

  it('13. non-object input → { severity: "critical" }', () => {
    assert.deepEqual(helpers.normalizeSeverity(null), { severity: 'critical' });
    assert.deepEqual(helpers.normalizeSeverity(42), { severity: 'critical' });
    assert.deepEqual(helpers.normalizeSeverity(undefined), { severity: 'critical' });
  });
});

// ─────────────────────────────────────────────────────────────────────
// routeFinding — inbox vs letter
// ─────────────────────────────────────────────────────────────────────

describe('routeFinding (inbox vs letter)', () => {
  it('14. target_file present (real path) → letter', () => {
    assert.deepEqual(helpers.routeFinding({ target_file: 'src/x.js' }), {
      route: 'letter',
    });
  });

  it('14b. target_file "repo-root" is a real file marker → letter', () => {
    assert.deepEqual(helpers.routeFinding({ target_file: 'repo-root' }), {
      route: 'letter',
    });
  });

  it('15. no target_file → inbox', () => {
    assert.deepEqual(helpers.routeFinding({ risk_class: 'high-risk' }), {
      route: 'inbox',
    });
  });

  it('15b. empty / non-string target_file → inbox, non-object → inbox, never throws', () => {
    assert.deepEqual(helpers.routeFinding({ target_file: '' }), { route: 'inbox' });
    assert.deepEqual(helpers.routeFinding({ target_file: null }), { route: 'inbox' });
    assert.deepEqual(helpers.routeFinding({ target_file: 42 }), { route: 'inbox' });
    assert.deepEqual(helpers.routeFinding(null), { route: 'inbox' });
    assert.deepEqual(helpers.routeFinding('x'), { route: 'inbox' });
  });
});

// ─────────────────────────────────────────────────────────────────────
// readEnforcementDates — dates from profile, verified:false
// ─────────────────────────────────────────────────────────────────────

describe('readEnforcementDates (from profile, never hardcoded)', () => {
  it('16. reads dates from the real profile, verified:false', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'euai-'));
    const fixture = path.join(tmp, 'eu-ai-act-high-risk.yaml');
    fs.copyFileSync(PROFILE_SRC, fixture);

    const out = helpers.readEnforcementDates(fixture);

    // effective_date read straight from the profile line.
    assert.equal(out.effective_date, '2026-08-02');
    // Art. 5 prohibitions / Art. 4 AI literacy / Chapter V GPAI / Annex III
    // all populated FROM the profile prose, not from a literal in the fn.
    assert.equal(out.art5_prohibitions, '2025-02-02');
    assert.equal(out.art4_ai_literacy, '2025-02-02');
    assert.equal(out.chapter_v_gpai, '2025-08-02');
    assert.equal(out.annex_iii_high_risk, '2026-08-02');
    assert.equal(out.source, fixture);
    assert.equal(out.verified, false);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('16b. dates are NOT hardcoded: an edited profile yields the edited effective_date', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'euai-edit-'));
    const fixture = path.join(tmp, 'eu-ai-act-high-risk.yaml');
    const src = fs.readFileSync(PROFILE_SRC, 'utf8');
    const edited = src.replace('effective_date: "2026-08-02"', 'effective_date: "2099-01-01"');
    assert.notEqual(edited, src); // guard the replace actually fired
    fs.writeFileSync(fixture, edited);

    const out = helpers.readEnforcementDates(fixture);
    assert.equal(out.effective_date, '2099-01-01');
    assert.equal(out.verified, false);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('17. missing file → all-null date fields, verified:false, no throw', () => {
    const missing = path.join(os.tmpdir(), 'does-not-exist-euai-' + Date.now() + '.yaml');
    const out = helpers.readEnforcementDates(missing);
    assert.equal(out.effective_date, null);
    assert.equal(out.art5_prohibitions, null);
    assert.equal(out.art4_ai_literacy, null);
    assert.equal(out.chapter_v_gpai, null);
    assert.equal(out.annex_iii_high_risk, null);
    assert.equal(out.verified, false);
    assert.equal(out.source, missing);
  });

  it('17b. non-string path → all-null, verified:false, no throw', () => {
    for (const bad of [null, undefined, 42, '']) {
      const out = helpers.readEnforcementDates(bad);
      assert.equal(out.effective_date, null);
      assert.equal(out.verified, false);
    }
  });
});
