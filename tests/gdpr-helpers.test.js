/**
 * Tests for src/lib/gdpr-helpers.js (EC2-s1).
 *
 * The deterministic GDPR rule core: PII→Article mapping, severity
 * normalization, finding-schema validation, and plan-vs-code finding routing.
 * Pure in-memory inputs — no tmp project. Maps the parent CAPTURE scenarios
 * 1:1 for this module's surface (14 cases).
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  VALID_GDPR_ARTICLES,
  PII_FIELD_TO_ARTICLES,
  mapPiiFieldToArticles,
  normalizeSeverity,
  validateFindingSchema,
  routeFinding,
} = require('../src/lib/gdpr-helpers');

describe('gdpr-helpers — mapPiiFieldToArticles', () => {
  it('1. email deep-equals ["GDPR-6","GDPR-13","GDPR-17"] (exact array + order)', () => {
    assert.deepEqual(mapPiiFieldToArticles('email'), ['GDPR-6', 'GDPR-13', 'GDPR-17']);
  });

  it('2. special-category fields (health, biometric) include "GDPR-9"', () => {
    assert.ok(mapPiiFieldToArticles('health').includes('GDPR-9'));
    assert.ok(mapPiiFieldToArticles('biometric').includes('GDPR-9'));
  });

  it('3. unknown field / non-string / empty → [] and never throws', () => {
    assert.doesNotThrow(() => mapPiiFieldToArticles('favouriteColour'));
    assert.deepEqual(mapPiiFieldToArticles('favouriteColour'), []);
    assert.deepEqual(mapPiiFieldToArticles(''), []);
    assert.deepEqual(mapPiiFieldToArticles(null), []);
    assert.deepEqual(mapPiiFieldToArticles(42), []);
    assert.deepEqual(mapPiiFieldToArticles(undefined), []);
  });

  it('3b. normalizes case / punctuation (IP address, ipAddress → same mapping)', () => {
    assert.deepEqual(mapPiiFieldToArticles('ipAddress'), ['GDPR-6', 'GDPR-13', 'GDPR-17']);
    assert.deepEqual(mapPiiFieldToArticles('IP Address'), ['GDPR-6', 'GDPR-13', 'GDPR-17']);
    assert.deepEqual(mapPiiFieldToArticles('ip'), ['GDPR-6', 'GDPR-13', 'GDPR-17']);
  });
});

describe('gdpr-helpers — map integrity + VALID_GDPR_ARTICLES', () => {
  it('4. every article in every PII_FIELD_TO_ARTICLES value is a member of VALID_GDPR_ARTICLES', () => {
    for (const [field, articles] of Object.entries(PII_FIELD_TO_ARTICLES)) {
      for (const article of articles) {
        assert.ok(
          VALID_GDPR_ARTICLES.has(article),
          `field "${field}" maps to unknown article "${article}"`
        );
      }
    }
  });

  it('5. VALID_GDPR_ARTICLES contains "GDPR-6" and "GDPR-9"', () => {
    assert.ok(VALID_GDPR_ARTICLES.has('GDPR-6'));
    assert.ok(VALID_GDPR_ARTICLES.has('GDPR-9'));
  });
});

describe('gdpr-helpers — normalizeSeverity', () => {
  it('6. upgrades severity to critical without mutating the input', () => {
    const input = { gdpr_article: 'GDPR-13', severity: 'medium' };
    const out = normalizeSeverity(input);
    assert.equal(out.severity, 'critical');
    assert.equal(input.severity, 'medium'); // original unchanged
    assert.notEqual(out, input); // new object
  });

  it('7. sets critical when severity is absent', () => {
    const out = normalizeSeverity({ gdpr_article: 'GDPR-17' });
    assert.equal(out.severity, 'critical');
  });

  it('8. non-object input throws TypeError', () => {
    assert.throws(() => normalizeSeverity(null), TypeError);
    assert.throws(() => normalizeSeverity('nope'), TypeError);
    assert.throws(() => normalizeSeverity(7), TypeError);
  });
});

describe('gdpr-helpers — validateFindingSchema', () => {
  it('9. accepts a valid code and returns the finding', () => {
    const finding = { gdpr_article: 'GDPR-9' };
    let out;
    assert.doesNotThrow(() => { out = validateFindingSchema(finding); });
    assert.equal(out, finding);
  });

  it('10. rejects unknown code and names it in the message', () => {
    assert.throws(
      () => validateFindingSchema({ gdpr_article: 'GDPR-99' }),
      /GDPR-99/
    );
  });

  it('11. missing gdpr_article throws (message mentions gdpr_article)', () => {
    assert.throws(
      () => validateFindingSchema({ severity: 'critical' }),
      /gdpr_article/
    );
    assert.throws(() => validateFindingSchema(null), TypeError);
  });
});

describe('gdpr-helpers — routeFinding', () => {
  it('12. plan-stage finding (no target_file) → { route: "inbox" }', () => {
    assert.deepEqual(routeFinding({ gdpr_article: 'GDPR-13' }), { route: 'inbox' });
  });

  it('13. code-stage finding (has target_file) → { route: "letter" }', () => {
    assert.deepEqual(
      routeFinding({ gdpr_article: 'GDPR-17', target_file: 'src/x.ts', target_line: 42 }),
      { route: 'letter' }
    );
  });

  it('13b. empty/falsy target_file still routes to inbox', () => {
    assert.deepEqual(routeFinding({ gdpr_article: 'GDPR-13', target_file: '' }), { route: 'inbox' });
  });

  it('14. non-object input throws TypeError', () => {
    assert.throws(() => routeFinding(null), TypeError);
    assert.throws(() => routeFinding('x'), TypeError);
  });
});
