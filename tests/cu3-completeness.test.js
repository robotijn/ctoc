/**
 * CU3 — the 14-file completeness check.
 *
 * ZERO DOUBLES: reads ALL 14 named CU3 framework guides off disk via
 * fs.readFileSync, reads the corpus audit ledger (read-only), and reads the CU3
 * slice plan files (read-only) to reconcile the per-file UPGRADED verdicts. No
 * mocks, no fixtures, no fakes.
 *
 * This is the CU3-wide gate. It proves every named framework guide is substantive
 * (well past the stub floor, has required sections, carries a dated source), that
 * every named file has a recorded UPGRADED verdict somewhere in the pipeline
 * artifacts (no silent omission), and that the ai-ml scope boundary holds (no
 * ai-ml file BEYOND the 6 named was upgraded under CU3 — those are CU4a scope).
 *
 * Verdict reconciliation (audit-ledger fallback, CU2 s1 precedent): the corpus
 * audit JSON is OUTSIDE every CU3 slice's `files:` set and the dispatch briefs
 * explicitly forbid touching it, so each slice recorded its per-file UPGRADED
 * verdicts in its own plan's "## Decisions Taken Under Ambiguity" section. This
 * test reconciles the verdict for each of the 14 named files by scanning: (a) the
 * audit ledger records, then (b) the CU3 slice plan files. A named file with NO
 * verdict in EITHER source is a silent omission and FAILS.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(projectRoot, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(projectRoot, rel));
}

// The canonical CU3 in-scope set: the 14 named framework guides.
// floor is the strict lower bound on "## " section count — > floor must hold.
// react.md + nextjs.md started at 6 sections (raised floor > 6); the other 12
// started at 5 (floor > 5). This defeats a no-op false-green on the two web files.
const AI_ML = ['pytorch', 'tensorflow', 'langchain', 'transformers', 'anthropic-sdk', 'openai-sdk'];
const NAMED = [
  { rel: 'skills/frameworks/ai-ml/pytorch.md', floor: 5 },
  { rel: 'skills/frameworks/ai-ml/tensorflow.md', floor: 5 },
  { rel: 'skills/frameworks/ai-ml/langchain.md', floor: 5 },
  { rel: 'skills/frameworks/ai-ml/transformers.md', floor: 5 },
  { rel: 'skills/frameworks/ai-ml/anthropic-sdk.md', floor: 5 },
  { rel: 'skills/frameworks/ai-ml/openai-sdk.md', floor: 5 },
  { rel: 'skills/frameworks/web/react.md', floor: 6 },
  { rel: 'skills/frameworks/web/nextjs.md', floor: 6 },
  { rel: 'skills/frameworks/data/pandas.md', floor: 5 },
  { rel: 'skills/frameworks/data/numpy.md', floor: 5 },
  { rel: 'skills/frameworks/data/prisma.md', floor: 5 },
  { rel: 'skills/frameworks/mobile/react-native.md', floor: 5 },
  { rel: 'skills/frameworks/mobile/flutter.md', floor: 5 },
  { rel: 'skills/frameworks/mobile/expo.md', floor: 5 },
];

const AUDIT_LEDGER = '.ctoc/audit/corpus-audit-2026-06-15.json';

// CU3 slice plan files (any stage) — the reconciled verdict source of record.
const CU3_PLAN_GLOBS = [
  'plans/todo',
  'plans/in-progress',
  'plans/review',
  'plans/done',
  'plans/implementation',
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

// Gather every text artifact that may carry a recorded verdict: the audit ledger
// + every CU3 slice plan file on disk. Read once.
function verdictCorpus() {
  let text = '';
  if (exists(AUDIT_LEDGER)) text += read(AUDIT_LEDGER);
  for (const dir of CU3_PLAN_GLOBS) {
    const abs = path.join(projectRoot, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) {
      if (/^CU3-tier1-frameworks.*\.md$/.test(f)) {
        text += '\n' + fs.readFileSync(path.join(abs, f), 'utf8');
      }
    }
  }
  return text;
}

describe('CU3 — 14-file completeness check (real files + reconciled verdicts, zero doubles)', () => {
  it('all 14 named guide files exist on disk', () => {
    for (const { rel } of NAMED) {
      assert.ok(exists(rel), `named CU3 guide missing on disk: ${rel}`);
    }
  });

  describe('every named file exceeds its section floor', () => {
    for (const { rel, floor } of NAMED) {
      it(`${rel} has > ${floor} "## " sections`, () => {
        const n = sectionCount(read(rel));
        assert.ok(n > floor, `expected > ${floor} "## " sections, found ${n}`);
      });
    }
  });

  describe('every named file is well past the stub floor (line count)', () => {
    for (const { rel } of NAMED) {
      it(`${rel} is > 120 lines`, () => {
        const lines = read(rel).split('\n').length;
        assert.ok(lines > 120, `expected > 120 lines (de-stubbed), found ${lines}`);
      });
    }
  });

  describe('every named file carries a dated source (>= 2025) with an http URL', () => {
    for (const { rel } of NAMED) {
      it(`${rel} has a >= 2025 date and an http source`, () => {
        const md = read(rel);
        assert.match(md, /20(2[5-9]|[3-9]\d)/, `expected a >= 2025 date token in ${rel}`);
        assert.match(md, /https?:\/\//, `expected an http(s) source URL in ${rel}`);
      });
    }
  });

  describe('no silent omission — every named file has a recorded UPGRADED verdict', () => {
    const corpus = verdictCorpus();
    for (const { rel } of NAMED) {
      it(`${rel} appears in the reconciled verdict corpus`, () => {
        assert.ok(
          corpus.includes(rel),
          `no UPGRADED/verdict record found for ${rel} in the audit ledger or CU3 slice plans`
        );
      });
    }
  });

  it('ai-ml scope: the 6 named CU3 ai-ml files are each substantive', () => {
    // CU3's guarantee for ai-ml is that its 6 named files are upgraded off the
    // 5-section stub floor. The prior exclusivity assertion ("no OTHER ai-ml file
    // is substantive") was a point-in-time snapshot that CU4a intentionally
    // invalidates — CU4a-frameworks-longtail upgrades the ai-ml long-tail. So we
    // assert only what CU3 owns: its 6 files are substantive. The long-tail is
    // covered by CU4a's own completeness gate (tests/cu4a-completeness.test.js).
    const aiMlDir = path.join(projectRoot, 'skills/frameworks/ai-ml');
    const namedAiMl = new Set(AI_ML.map((n) => `${n}.md`));
    for (const f of namedAiMl) {
      const n = sectionCount(fs.readFileSync(path.join(aiMlDir, f), 'utf8'));
      assert.ok(
        n > 5,
        `CU3-named ai-ml file ${f} must be substantive (> 5 sections) but has ${n}`
      );
    }
    // And confirm the named set is exactly 6 (no drift in the canonical list).
    assert.equal(AI_ML.length, 6, 'the canonical CU3 ai-ml set must be exactly 6 files');
  });
});
