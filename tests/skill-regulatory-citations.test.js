/**
 * Content-contract tests for CU1 s4 — dependency-checker regulatory citations.
 *
 * Reads the REAL SKILL.md file (no mocks/doubles) and asserts the CU1 acceptance
 * criteria "dependency-checker CRA references are grounded" and "regulation-bearing
 * skills gain last verified dates" are satisfied for the one regulation-bearing
 * skill in the CU1 files: list.
 *
 * Every fact asserted here is web-verified against EUR-Lex (Regulation (EU)
 * 2024/2847, Article 71 application dates + Article 64 fines) and the NTIA
 * July-2021 minimum-elements report — the same authoritative sources the sibling
 * skills/compliance/sbom-cra-checker/SKILL.md and
 * skills/security/dependency-auditor/SKILL.md cite. This test guards against the
 * citation being dropped by a future edit; it does NOT re-verify the facts.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(projectRoot, rel), 'utf8');
}

describe('CU1 s4 — dependency-checker CRA citations (web-verified)', () => {
  const rel = 'skills/security/dependency-checker/SKILL.md';

  it('cites the CRA regulation number Reg. (EU) 2024/2847', () => {
    const md = read(rel);
    assert.match(md, /2024\/2847/, 'expected the CRA regulation number 2024/2847');
  });

  it('cites the 11 Sep 2026 Article 14 reporting-obligation application date', () => {
    const md = read(rel);
    assert.match(md, /11 Sep(?:tember)? 2026|September 2026/i,
      'expected the 11 September 2026 reporting date');
  });

  it('cites the 11 Dec 2027 full-application date', () => {
    const md = read(rel);
    assert.match(md, /11 Dec(?:ember)? 2027|December 2027/i,
      'expected the 11 December 2027 full-application date');
  });

  it('references the NTIA minimum elements', () => {
    const md = read(rel);
    assert.match(md, /NTIA minimum elements/i,
      'expected the NTIA minimum elements reference');
  });

  it('carries a source: URL / document reference for the added citations', () => {
    const md = read(rel);
    // At least one authoritative source URL among the CRA/NTIA official domains.
    assert.match(
      md,
      /eur-lex\.europa\.eu|digital-strategy\.ec\.europa\.eu|enisa\.europa\.eu|ntia\.gov/i,
      'expected at least one official source URL for the citation'
    );
  });

  it('carries a "last verified:" line', () => {
    const md = read(rel);
    assert.match(md, /last verified:/i, 'expected a "last verified:" line');
  });

  it('does not diverge from the sibling on the regulation number or dates', () => {
    const checker = read(rel);
    const sibling = read('skills/compliance/sbom-cra-checker/SKILL.md');
    // The three load-bearing facts must appear identically framed in both files.
    for (const fact of [/2024\/2847/, /11 Sep(?:tember)? 2026|September 2026/i, /11 Dec(?:ember)? 2027|December 2027/i]) {
      assert.match(checker, fact, 'dependency-checker must carry the fact');
      assert.match(sibling, fact, 'sbom-cra-checker must carry the same fact (no divergence)');
    }
  });
});
