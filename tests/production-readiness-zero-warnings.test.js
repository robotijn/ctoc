/**
 * Tests for v6.9.9 — production-readiness checklists declare
 * "0 warnings across all toolchains" as a block-severity check.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const TEMPLATES = [
  '.ctoc/templates/saas/b2c-subscription/production-readiness.yaml',
  '.ctoc/templates/saas/b2b-sales-led/production-readiness.yaml',
];

describe('Production-readiness — zero-warnings rule (v6.9.9)', () => {
  for (const rel of TEMPLATES) {
    const file = path.join(ROOT, rel);

    describe(rel, () => {
      it('exists', () => {
        assert.ok(fs.existsSync(file), `${file} missing`);
      });

      if (!fs.existsSync(file)) return;
      const content = fs.readFileSync(file, 'utf8');

      it('declares the zero_warnings_all_toolchains check', () => {
        assert.match(content, /id:\s*zero_warnings_all_toolchains/);
      });

      it('zero_warnings check is severity: block', () => {
        const idx = content.indexOf('id: zero_warnings_all_toolchains');
        assert.ok(idx >= 0);
        const block = content.slice(idx, idx + 400);
        assert.match(block, /severity:\s*block/);
      });

      it('declares the zero_open_cves check', () => {
        assert.match(content, /id:\s*zero_open_cves/);
      });

      it('zero_open_cves is severity: block', () => {
        const idx = content.indexOf('id: zero_open_cves');
        assert.ok(idx >= 0);
        const block = content.slice(idx, idx + 400);
        assert.match(block, /severity:\s*block/);
      });

      it('references the shared warnings-are-critical rule', () => {
        assert.match(content, /warnings-are-critical\.md/);
      });

      it('mentions warnings-as-errors enforcement', () => {
        assert.match(content, /warnings-as-errors/);
      });

      it('mentions specific toolchains (eslint, tsc, etc.)', () => {
        assert.match(content, /eslint/);
        assert.match(content, /tsc/);
      });
    });
  }
});
