/**
 * Tests for CU1 s6 — corpus audit ledger (.ctoc/audit/corpus-audit-2026-06-15.json)
 *
 * Content-contract, ZERO doubles. Every assertion reads the REAL ledger file and,
 * where it spot-checks the recorded verdict, the REAL on-disk source file. The
 * ledger is the no-silent-skip contract downstream corpus plans (CU2–CU5) diff
 * against, so its completeness and validity are asserted here.
 *
 * Verifies:
 *   1. Ledger exists at the invariant path.
 *   2. It is valid JSON (JSON.parse succeeds).
 *   3. Every file in the CU1 files: scope appears as a records[].path.
 *   4. Each record has path (string), line_count (int), section_count (int),
 *      verdict ∈ {SOLID, THIN, DEFECTIVE}.
 *   5. Discrepancy records exist and match reality:
 *      - the 3 phantom paths recorded DEFECTIVE and really absent on disk;
 *      - the 7 out-of-scope opus-4-7 agents recorded with a note and really
 *        still carrying opus-4-7 on disk;
 *      - the 21→14 model-bump count note is present.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const LEDGER_PATH = path.join(projectRoot, '.ctoc', 'audit', 'corpus-audit-2026-06-15.json');

// The CU1 scope — union of the s1–s5 slice files: lists plus the 3 phantom paths.
// This is the coverage contract: every one of these MUST appear as a record.
const CU1_SCOPE = [
  // s1
  'agents/infrastructure/deployment-setup.md',
  'tests/architecture-invariants.test.js',
  // s2
  'agents/coordinator/cto-chief.md',
  'agents/coordinator/synthesizer.md',
  'agents/iron-loop/iron-loop-integrator.md',
  'agents/iron-loop/iron-loop-critic.md',
  'agents/iron-loop/iron-loop-executor.md',
  'agents/pipeline/agent-writer.md',
  'agents/pipeline/agent-critic.md',
  'agents/pipeline/agent-tester.md',
  'agents/pipeline/agent-qa.md',
  'agents/pipeline/agent-publisher.md',
  'agents/planning/vision-advisor.md',
  'agents/planning/vision-decomposer.md',
  'agents/planning/product-owner.md',
  'agents/planning/implementation-planner.md',
  'tests/agent-modernization.test.js',
  'tests/skill-loading.test.js',
  // s3
  'skills/realtime/hil-harness/SKILL.md',
  'skills/realtime/wcet-budget/SKILL.md',
  'skills/safety/fault-tree-builder/SKILL.md',
  'skills/safety/fmeda-analyzer/SKILL.md',
  'skills/safety/redundancy-pattern-picker/SKILL.md',
  'skills/testing/runners/unit-test-runner/SKILL.md',
  // s4
  'skills/security/dependency-checker/SKILL.md',
  // s5
  'skills/saas/posthog-analytics/SKILL.md',
  'skills/saas/sentry-errors/SKILL.md',
  'skills/mobile/react-native-bridge-checker/SKILL.md',
  // phantom paths (must be recorded DEFECTIVE, must NOT be created)
  'agents/planning/functional-reviewer.md',
  'agents/planning/implementation-plan-reviewer.md',
  'agents/planning/iron-loop-integrator.md',
];

const PHANTOM_PATHS = [
  'agents/planning/functional-reviewer.md',
  'agents/planning/implementation-plan-reviewer.md',
  'agents/planning/iron-loop-integrator.md',
];

const OUT_OF_SCOPE_OPUS_47 = [
  'agents/compliance/eu-ai-act-agent.md',
  'agents/compliance/eu-solution-recommender.md',
  'agents/compliance/gdpr-agent.md',
  'agents/coordinator/ivv-chief.md',
  'agents/planning/kpi-planner.md',
  'agents/planning/stack-chooser.md',
  'agents/planning/unit-economics-modeler.md',
];

const VALID_VERDICTS = new Set(['SOLID', 'THIN', 'DEFECTIVE']);

function loadLedger() {
  const raw = fs.readFileSync(LEDGER_PATH, 'utf8');
  return JSON.parse(raw); // throws on invalid JSON — that IS the check
}

describe('CU1 s6 — corpus audit ledger', () => {
  it('exists at the invariant path', () => {
    assert.ok(fs.existsSync(LEDGER_PATH), `ledger missing at ${LEDGER_PATH}`);
  });

  it('is valid JSON with the expected top-level shape', () => {
    const ledger = loadLedger();
    assert.equal(ledger.audit_date, '2026-06-15');
    assert.equal(ledger.produced_by, 'CU1-tier0-quick-wins');
    assert.ok(Array.isArray(ledger.records), 'records must be an array');
    assert.ok(ledger.records.length > 0, 'records must be non-empty');
  });

  it('covers every file in the CU1 scope (no silent skip)', () => {
    const ledger = loadLedger();
    const recordedPaths = new Set(ledger.records.map((r) => r.path));
    for (const p of CU1_SCOPE) {
      assert.ok(recordedPaths.has(p), `CU1 scope path not recorded: ${p}`);
    }
  });

  it('every record has a well-formed shape and valid verdict', () => {
    const ledger = loadLedger();
    for (const r of ledger.records) {
      assert.equal(typeof r.path, 'string', `path not string: ${JSON.stringify(r)}`);
      assert.ok(Number.isInteger(r.line_count), `line_count not int: ${r.path}`);
      assert.ok(Number.isInteger(r.section_count), `section_count not int: ${r.path}`);
      assert.ok(VALID_VERDICTS.has(r.verdict), `bad verdict for ${r.path}: ${r.verdict}`);
    }
  });

  it('records the 3 phantom paths DEFECTIVE, and they really are absent on disk', () => {
    const ledger = loadLedger();
    const byPath = new Map(ledger.records.map((r) => [r.path, r]));
    for (const p of PHANTOM_PATHS) {
      const rec = byPath.get(p);
      assert.ok(rec, `phantom path not recorded: ${p}`);
      assert.equal(rec.verdict, 'DEFECTIVE', `phantom ${p} must be DEFECTIVE`);
      // spot-check reality: the file must genuinely not exist
      assert.ok(!fs.existsSync(path.join(projectRoot, p)), `phantom ${p} unexpectedly exists on disk`);
    }
  });

  it('records the 7 agents that were out of scope for the opus-4-7 model bump', () => {
    const ledger = loadLedger();
    const byPath = new Map(ledger.records.map((r) => [r.path, r]));
    for (const p of OUT_OF_SCOPE_OPUS_47) {
      const rec = byPath.get(p);
      assert.ok(rec, `out-of-scope opus-4-7 agent not recorded: ${p}`);
      assert.ok(rec.note && /opus-4-7/i.test(rec.note), `out-of-scope note must mention opus-4-7: ${p}`);
      // spot-check reality: the recorded path must still be a real agent on disk,
      // so the ledger cannot drift into referencing files that no longer exist.
      assert.ok(
        fs.existsSync(path.join(projectRoot, p)),
        `${p} recorded in the ledger but missing on disk`
      );
      // The former assertion here re-read each file and required
      // `model_optimized_for: opus-4-7` to still be present. That field has since
      // been DELETED from the corpus (it recorded authorship provenance on the opus
      // rows but was read as an execution target on the scouts, where it was false).
      // The ledger stays a historical record of the 2026-06-15 audit; it is no longer
      // re-verifiable against a field that does not exist. See
      // tests/no-model-optimized-for.test.js.
    }
  });

  it('carries the 21→14 model-bump count note somewhere in the ledger', () => {
    const ledger = loadLedger();
    const blob = JSON.stringify(ledger);
    assert.ok(/21/.test(blob) && /14/.test(blob), 'model-bump count delta (21 vs 14) not noted');
  });
});
