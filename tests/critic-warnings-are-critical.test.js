/**
 * Tests for v6.9.8 — every refinement-loop critic declares the
 * warnings-are-critical rule and references the shared definition.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const SHARED_RULE = path.join(ROOT, 'agents', '_shared', 'warnings-are-critical.md');

const CRITICS = [
  'quality/duplicate-code-detector',
  'security/sast-scanner',
  'quality/code-reviewer',
  'specialized/accessibility-checker',
  'frontend/visual-regression-checker',
  'specialized/database-reviewer',
  'saas/multi-tenancy-row-level',
  'security/input-validation-checker',
  'security/secrets-detector',
  'specialized/observability-checker',
  'specialized/error-handler-checker',
  'saas/stripe-subscriptions',
  'specialized/resilience-checker',
  'ai-quality/hallucination-detector',
  'ai-quality/ai-code-quality-reviewer',
  'compliance/audit-log-checker',
  'compliance/gdpr-compliance-checker',
];

describe('Shared warnings-are-critical rule', () => {
  it('exists', () => {
    assert.ok(fs.existsSync(SHARED_RULE), 'agents/_shared/warnings-are-critical.md missing');
  });

  const content = fs.existsSync(SHARED_RULE) ? fs.readFileSync(SHARED_RULE, 'utf8') : '';

  it('lists all warning categories (compiler/linter/type/deprecation/CVE)', () => {
    assert.match(content, /Compiler warning/i);
    assert.match(content, /Linter warning/i);
    assert.match(content, /Type-checker warning/i);
    assert.match(content, /Deprecation notice/i);
    assert.match(content, /CVEs.*any severity/i);
  });

  it('explicitly rejects a "warn" severity', () => {
    assert.match(content, /schema rejects.*warn|Do not invent.*warn/i);
  });

  it('mentions phase consequence (blocks critical → medium advancement)', () => {
    assert.match(content, /critical.*medium/);
  });
});

describe('Critic skills — refinement-loop mode block (v6.9.8)', () => {
  for (const p of CRITICS) {
    const file = path.join(ROOT, 'skills', p, 'SKILL.md');

    describe(`skills/${p}/SKILL.md`, () => {
      it('exists', () => {
        assert.ok(fs.existsSync(file), `${file} missing`);
      });

      if (!fs.existsSync(file)) return;
      const content = fs.readFileSync(file, 'utf8');

      it('declares the refinement-loop critic-mode block', () => {
        assert.match(content, /Refinement Loop — critic mode/);
      });

      it('references the warnings-are-critical shared rule', () => {
        assert.match(content, /warnings-are-critical/);
      });

      it('references the letter schema (no "warn" severity)', () => {
        assert.match(content, /refinement-loop-schema\.json/);
      });

      it('references the refinement loop spec', () => {
        assert.match(content, /docs\/REFINEMENT_LOOP\.md/);
      });

      it('mentions severity: critical', () => {
        assert.match(content, /severity:\s*critical/i);
      });
    });
  }
});
