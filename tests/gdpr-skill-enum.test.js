'use strict';

/**
 * EC2-s2 — parity test between the GDPR skill's letter-schema `gdpr_article`
 * enum and the JS mirror `VALID_GDPR_ARTICLES` from src/lib/gdpr-helpers.js.
 *
 * Two authorities describe the valid GDPR article codes:
 *   1. The skill's `gdpr_article` enum in
 *      skills/compliance/gdpr-compliance-checker/SKILL.md (narrative contract).
 *   2. `VALID_GDPR_ARTICLES` in src/lib/gdpr-helpers.js (machine mirror).
 * They must not diverge. This test parses the real SKILL.md enum block and
 * asserts (a) both new codes are present, (b) all 14 codes are present, (c) the
 * enum token set is DEEP-EQUAL to VALID_GDPR_ARTICLES, (d) no original code was
 * dropped by the additive edit.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { VALID_GDPR_ARTICLES } = require('../src/lib/gdpr-helpers');

const SKILL_PATH = path.join(
  __dirname,
  '..',
  'skills',
  'compliance',
  'gdpr-compliance-checker',
  'SKILL.md'
);

/**
 * Extract the set of `"GDPR-…"` tokens that appear in the `gdpr_article:` enum
 * block of SKILL.md. The enum may wrap across multiple lines (a leading `|`
 * continuation line), so we scan from the `gdpr_article:` line through any
 * continuation lines that begin (after whitespace) with a `|` union separator.
 * CRLF-tolerant (splits on \r?\n).
 * @param {string} md
 * @returns {Set<string>}
 */
function extractSkillEnum(md) {
  const lines = md.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => /^\s*gdpr_article:/.test(l));
  assert.notEqual(startIdx, -1, 'SKILL.md must contain a `gdpr_article:` enum line');

  const block = [lines[startIdx]];
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    // Continuation lines of a YAML union enum start (after indent) with `|`.
    if (/^\s*\|/.test(lines[i])) {
      block.push(lines[i]);
    } else {
      break;
    }
  }

  const tokens = new Set();
  const re = /"(GDPR-[^"]+)"/g;
  let m;
  const joined = block.join('\n');
  while ((m = re.exec(joined)) !== null) {
    tokens.add(m[1]);
  }
  return tokens;
}

const ORIGINAL_CODES = [
  'GDPR-7',
  'GDPR-13',
  'GDPR-14',
  'GDPR-15',
  'GDPR-17',
  'GDPR-20',
  'GDPR-28',
  'GDPR-30',
  'GDPR-33',
  'GDPR-34',
  'GDPR-37',
  'GDPR-Chapter-V',
];

const md = fs.readFileSync(SKILL_PATH, 'utf8');
const skillEnum = extractSkillEnum(md);

test('1. skill enum includes both new codes GDPR-6 and GDPR-9', () => {
  assert.ok(skillEnum.has('GDPR-6'), 'skill enum must contain "GDPR-6"');
  assert.ok(skillEnum.has('GDPR-9'), 'skill enum must contain "GDPR-9"');
});

test('2. skill enum contains all 14 expected codes (none dropped by the edit)', () => {
  const expected = new Set([...ORIGINAL_CODES, 'GDPR-6', 'GDPR-9']);
  assert.deepEqual(new Set(skillEnum), expected);
  assert.equal(skillEnum.size, 14);
});

test('3. parity: skill enum token set is DEEP-EQUAL to VALID_GDPR_ARTICLES', () => {
  // Both directions: same members, no divergence between the two authorities.
  assert.equal(
    skillEnum.size,
    VALID_GDPR_ARTICLES.size,
    'enum and VALID_GDPR_ARTICLES must have the same cardinality'
  );
  for (const code of VALID_GDPR_ARTICLES) {
    assert.ok(skillEnum.has(code), `skill enum missing "${code}" present in VALID_GDPR_ARTICLES`);
  }
  for (const code of skillEnum) {
    assert.ok(
      VALID_GDPR_ARTICLES.has(code),
      `VALID_GDPR_ARTICLES missing "${code}" present in skill enum`
    );
  }
});

test('4. no regression: every original code is still present', () => {
  for (const code of ORIGINAL_CODES) {
    assert.ok(skillEnum.has(code), `original code "${code}" was dropped`);
  }
});
