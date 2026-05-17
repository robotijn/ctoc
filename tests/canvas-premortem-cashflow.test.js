/**
 * Tests for v6.9.12 — canvas templates carry a 6-month pre-mortem
 * (Gary Klein, HBR 2007) and a 5-scenario 18-month cash flow plan
 * (Worst / Conservative / Base / Optimistic / Exceptional).
 *
 * Both sections must appear in lean-canvas AND business-model-canvas, and
 * the corresponding questions in questions.yaml must be founder/pm-gated
 * with a defer_to_persona of founder (so a programmer/architect persona
 * never gets asked these directly).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const CANVAS_TEMPLATES = [
  '.ctoc/templates/lean-canvas.md.template',
  '.ctoc/templates/business-model-canvas.md.template',
];

const QUESTIONS_FILE = path.join(ROOT, '.ctoc/templates/questions.yaml');

describe('Canvas templates — 6-month pre-mortem (Gary Klein)', () => {
  for (const rel of CANVAS_TEMPLATES) {
    const file = path.join(ROOT, rel);
    describe(rel, () => {
      const content = fs.readFileSync(file, 'utf8');

      it('declares a 6-Month Pre-Mortem section', () => {
        assert.match(content, /^## 6-Month Pre-Mortem$/m);
      });

      it('cites the Gary Klein / HBR 2007 methodology', () => {
        assert.match(content, /Gary Klein/);
        assert.match(content, /HBR 2007/);
      });

      it('asks for at least 5 failure modes ranked by likelihood × impact', () => {
        assert.match(content, /at least 5 distinct failure modes/i);
        assert.match(content, /Likelihood/);
        assert.match(content, /Impact/);
      });

      it('requires mitigations that can start THIS WEEK', () => {
        assert.match(content, /THIS WEEK/);
      });

      it('schedules a re-run cadence every 3-4 months', () => {
        assert.match(content, /every 3.4 months/i);
      });
    });
  }
});

describe('Canvas templates — 5-scenario cash flow planning', () => {
  const SCENARIOS = ['Worst', 'Conservative', 'Base', 'Optimistic', 'Exceptional'];

  for (const rel of CANVAS_TEMPLATES) {
    const file = path.join(ROOT, rel);
    describe(rel, () => {
      const content = fs.readFileSync(file, 'utf8');

      it('declares a Cash Flow Planning section with 5 scenarios over 18 months', () => {
        assert.match(content, /^## Cash Flow Planning — 5 Scenarios \(18-month horizon\)$/m);
      });

      it('lists all five scenario labels', () => {
        for (const s of SCENARIOS) {
          assert.match(content, new RegExp(`\\b${s}\\b`), `missing scenario: ${s}`);
        }
      });

      it('names base-case assumption anchors (starting cash, burn, MRR, pricing, churn, CAC)', () => {
        assert.match(content, /Starting cash/i);
        assert.match(content, /fixed burn/i);
        assert.match(content, /variable burn/i);
        assert.match(content, /Initial MRR/i);
        assert.match(content, /Pricing/i);
        assert.match(content, /churn/i);
        assert.match(content, /CAC/i);
      });

      it('projects MRR at M3, M6, M9, M12, M15, M18', () => {
        for (const m of ['M3', 'M6', 'M9', 'M12', 'M15', 'M18']) {
          assert.match(content, new RegExp(`\\| ${m}\\s*\\|`), `missing month row: ${m}`);
        }
      });

      it('records runway per scenario', () => {
        assert.match(content, /Runway per scenario/i);
      });

      it('declares decision triggers (when to switch operating plan)', () => {
        assert.match(content, /Decision triggers/i);
        assert.match(content, /2 consecutive months/);
      });

      it('insists the three middle scenarios are plausible, not aspirational', () => {
        assert.match(content, /three middle\s+scenarios must each be (plausible|PLAUSIBLE)/);
      });

      it('notes SaaS cash-timing pitfalls (annual prepay, fixed vs variable burn)', () => {
        assert.match(content, /Prepaid annual/i);
        assert.match(content, /fixed.*variable|Separate fixed/i);
      });
    });
  }
});

describe('questions.yaml — pre-mortem + cashflow are founder-gated', () => {
  const content = fs.readFileSync(QUESTIONS_FILE, 'utf8');

  function extractQuestion(id) {
    const idx = content.indexOf(`id: ${id}`);
    if (idx === -1) return null;
    // Slice from this id to the next `- id:` line (or end of file).
    const tail = content.slice(idx);
    const nextIdx = tail.indexOf('\n  - id:');
    return nextIdx === -1 ? tail : tail.slice(0, nextIdx);
  }

  it('canvas/premortem-6month question exists', () => {
    assert.ok(extractQuestion('canvas/premortem-6month'), 'question canvas/premortem-6month missing');
  });

  it('canvas/premortem-6month is for founder/pm; programmer/architect deferred', () => {
    const q = extractQuestion('canvas/premortem-6month');
    assert.match(q, /personas:\s*\[[^\]]*founder[^\]]*pm/);
    assert.match(q, /deferred_for:\s*\[[^\]]*programmer/);
    assert.match(q, /deferred_for:\s*\[[^\]]*architect/);
    assert.match(q, /defer_to_persona:\s*founder/);
    assert.match(q, /required:\s*true/);
  });

  it('canvas/cashflow-5scenarios question exists', () => {
    assert.ok(extractQuestion('canvas/cashflow-5scenarios'), 'question canvas/cashflow-5scenarios missing');
  });

  it('canvas/cashflow-5scenarios is founder-only; pm and others deferred', () => {
    const q = extractQuestion('canvas/cashflow-5scenarios');
    assert.match(q, /personas:\s*\[founder,\s*technical-founder\]/);
    assert.match(q, /deferred_for:\s*\[[^\]]*pm/);
    assert.match(q, /deferred_for:\s*\[[^\]]*programmer/);
    assert.match(q, /defer_to_persona:\s*founder/);
    assert.match(q, /required:\s*true/);
  });

  it('cashflow phrasing names all 5 scenarios', () => {
    const q = extractQuestion('canvas/cashflow-5scenarios');
    for (const s of ['Worst', 'Conservative', 'Base', 'Optimistic', 'Exceptional']) {
      assert.match(q, new RegExp(`\\b${s}\\b`), `cashflow question phrasing missing scenario: ${s}`);
    }
  });
});
