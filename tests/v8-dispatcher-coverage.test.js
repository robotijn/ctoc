/**
 * Coverage-hardening tests for src/lib/v8-dispatcher.js
 *
 * Companion to tests/v8-dispatcher.test.js — does NOT duplicate it. Every test
 * here pins a DARK branch that the existing suite leaves green under mutation:
 *
 *   - Tier-routing / no-peer invariants (dispatch TO tier 0 refused; explicit
 *     targetTier overrides inference; the `>= 2` max_subagents boundary).
 *   - normalizeRequest fallbacks — the SECOND operand of every `opts.X || default`
 *     (a caller-supplied id / priority / ancestry must survive, not be defaulted).
 *   - updateGrade confidence→bucket RESOLUTION (HIGH/MEDIUM/LOW/undefined route to
 *     the right precision bucket), the `|| 'kickback'` second operand, the
 *     unknown-agent namespacing, and the neither-outcome no-op.
 *   - beginDispatch budget-override branch (167-172) — enforce() throws
 *     BUDGET_EXCEEDED; without skipBudgetCheck it rethrows, with it, it proceeds.
 *   - finalizeDispatch second operands (status/reason/gradedAt/grade defaults).
 *   - The zero-dep YAML writer/reader dark paths reached via saveGrades/loadGrades:
 *     array-of-primitives emit (260), the `- ` array-skip on read (312-315), the
 *     quoted-string parse (340), and the unreadable-grades-file fail-open (288-289).
 *
 * AI-authored, human-reviewed line-by-line: each assertion was checked to go RED
 * against a trivially-wrong implementation (mutation intuition), not just to run.
 *
 * Fixtures: real os.tmpdir() projects, cwd swapped so the module's ROOT-derived
 * paths resolve into the temp dir, cleaned in finally.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

let originalCwd;
let originalSession;
let tmpDir;

function loadDispatcher() {
  // Re-require fresh AFTER cwd change: the module caches ROOT = process.cwd()
  // (and AUDIT_BASE / GRADES_PATH derived from it) at require time.
  const p = require.resolve('../src/lib/v8-dispatcher');
  delete require.cache[p];
  return require('../src/lib/v8-dispatcher');
}

function setupTempProject() {
  originalCwd = process.cwd();
  originalSession = process.env.CTOC_SESSION_ID;
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-disp-cov-'));
  process.chdir(tmpDir);
  fs.mkdirSync('.ctoc/agents', { recursive: true });
  fs.mkdirSync('.ctoc/audit/dispatches', { recursive: true });
}

function teardownTempProject() {
  process.chdir(originalCwd);
  if (originalSession === undefined) delete process.env.CTOC_SESSION_ID;
  else process.env.CTOC_SESSION_ID = originalSession;
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
}

function writeFile(relPath, content) {
  const abs = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

// ─────────────────────────────────────────────────────────────────────
// Tier routing / dispatch resolution invariants
// ─────────────────────────────────────────────────────────────────────

describe('v8-dispatcher — tier routing invariants', () => {
  it('refuses to dispatch TO the tier-0 coordinator (cto-chief is not a valid target)', () => {
    setupTempProject();
    try {
      const { normalizeRequest } = loadDispatcher();

      // cto-chief infers tier 0; a dispatch TARGET must be tier 1-2. This is the
      // no-dispatch-to-the-top-coordinator invariant — mutating the lower bound
      // (< 1) to <= 0 would let this through.
      assert.throws(
        () => normalizeRequest({ target: 'coordinator/cto-chief', goal: 'Please review this thing.' }),
        /target_tier must be 1-2, got 0/
      );
    } finally {
      teardownTempProject();
    }
  });

  // Plan F3b LOWERED this ceiling from 3 to 2 and added the tier-3 case. Tier 2 is
  // now the leaf tier, so a dispatch to tier 3 must be refused outright rather than
  // routed to a tier that has no agents.
  it('rejects an explicit target_tier above the tier-2 ceiling', () => {
    setupTempProject();
    try {
      const { normalizeRequest } = loadDispatcher();

      assert.throws(
        () => normalizeRequest({ target: 'quality/code-reviewer', goal: 'Review the changes.', targetTier: 3 }),
        /target_tier must be 1-2, got 3/,
        'tier 3 is deleted — a dispatch to it must be refused, not accepted'
      );
      assert.throws(
        () => normalizeRequest({ target: 'quality/code-reviewer', goal: 'Review the changes.', targetTier: 4 }),
        /target_tier must be 1-2, got 4/
      );
    } finally {
      teardownTempProject();
    }
  });

  it('honors an explicit target_tier over the inferred one and allows tier-1 fan-out', () => {
    setupTempProject();
    try {
      const { normalizeRequest } = loadDispatcher();

      // Target string infers tier 2 (specialist default), but the caller declares
      // tier 1. The explicit value must win (the `opts.targetTier != null` first
      // operand), and a tier-1 sub-orchestrator is ALLOWED a non-zero max_subagents
      // — the `targetTier >= 2` guard must NOT fire at tier 1.
      // (Plan F3b: the target string here was a deleted scout; only the string
      // changed. The explicit-over-inferred contract is untouched.)
      const req = normalizeRequest({
        target: 'quality/code-reviewer',
        goal: 'Coordinate a sub-review across pillars.',
        targetTier: 1,
        effortBudget: { max_subagents: 5 },
      });

      assert.equal(req.target_tier, 1);
      assert.equal(req.effort_budget.max_subagents, 5);
    } finally {
      teardownTempProject();
    }
  });

  // DELETED by plan F3b: 'rejects a tier-3 scout that requests sub-agents
  // (no-cascade guard fires at tier 3)'. It asserted that normalizeRequest throws
  // /Tier 3 target must have max_subagents: 0/ for a scouts/ target with
  // max_subagents: 2. Its stated purpose was to pin the `>= 2` guard at tier 3 so a
  // mutant narrowing it to `=== 2` would go red. With the ceiling lowered to 2, tier
  // 3 is unreachable — `>= 2` and `=== 2` are now equivalent, so the mutant this
  // guarded against no longer exists and the scenario cannot be constructed. The
  // tier-2 case is still asserted by the existing suite.

  it('defaults an unknown category to specialist tier 2 without a false orchestrator match', () => {
    setupTempProject();
    try {
      const { inferTier } = loadDispatcher();

      // The fallback: any category the switch does not recognise is a specialist.
      // The `startsWith` (not `includes`) prefix check matters — a category that
      // merely CONTAINS "planning/" mid-string must NOT route to tier 1.
      const rows = [
        { target: 'made-up-category/agent', expected: 2, id: 'unknown-prefix' },
        { target: 'x/planning/nested', expected: 2, id: 'planning-not-at-start' },
        // Plan F3b: `scouts/` no longer has a branch at all. A leftover scout target
        // must fall through to the specialist default, NOT to a resurrected tier 3.
        { target: 'scouts/syntax-scout', expected: 2, id: 'deleted-scout-has-no-branch' },
        { target: 'x/scouts/nested', expected: 2, id: 'scouts-not-at-start' },
      ];
      for (const row of rows) {
        assert.equal(inferTier(row.target), row.expected, `row=${row.id}`);
      }
    } finally {
      teardownTempProject();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// normalizeRequest — caller-supplied values must survive (|| second operands)
// ─────────────────────────────────────────────────────────────────────

describe('v8-dispatcher — normalizeRequest preserves caller-supplied fields', () => {
  it('uses the caller id, priority, ancestry, context, and expected output instead of defaults', () => {
    setupTempProject();
    try {
      const { normalizeRequest } = loadDispatcher();

      // Every field below exercises the SECOND operand of an `opts.X || default`.
      // A mutant that hardcodes the default would drop the caller's value.
      const req = normalizeRequest({
        target: 'quality/code-reviewer',
        goal: 'Review the auth refactor for correctness.',
        id: 'CALLERID0123456789ABCDEFGH',
        priority: 'high',
        planAncestry: { vision: 'plans/done/vision.md' },
        context: { branch: 'feature-x' },
        expectedOutput: { schema: 'findings-v1' },
      });

      assert.equal(req.id, 'CALLERID0123456789ABCDEFGH');
      assert.equal(req.priority, 'high');
      assert.equal(req.plan_ancestry.vision, 'plans/done/vision.md');
      assert.equal(req.context.branch, 'feature-x');
      assert.equal(req.expected_output.schema, 'findings-v1');
    } finally {
      teardownTempProject();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// beginDispatch — session-budget override branch (lines 167-172)
// ─────────────────────────────────────────────────────────────────────

function armOverBudgetSession() {
  // max_dispatches: 0 with a recorded dispatch → over budget; halt_action ask_user
  // → enforce() throws BUDGET_EXCEEDED.
  process.env.CTOC_SESSION_ID = 'cov-test-session';
  writeFile('.ctoc/config/budget.yaml', 'budget:\n  max_dispatches: 0\n  halt_action: ask_user\n');
  writeFile(
    '.ctoc/budget-usage/cov-test-session.yaml',
    `usage:\n  started_at: ${new Date().toISOString()}\n  dispatches: 1\n`
  );
}

describe('v8-dispatcher — beginDispatch budget gate', () => {
  it('propagates BUDGET_EXCEEDED when the caller does not override the budget check', () => {
    setupTempProject();
    try {
      const { beginDispatch } = loadDispatcher();
      armOverBudgetSession();

      assert.throws(
        () => beginDispatch({ target: 'quality/code-reviewer', goal: 'Review the changes carefully.' }),
        (err) => err && err.code === 'BUDGET_EXCEEDED'
      );
    } finally {
      teardownTempProject();
    }
  });

  it('proceeds and writes the audit entry when skipBudgetCheck overrides an exceeded budget', () => {
    setupTempProject();
    try {
      const { beginDispatch } = loadDispatcher();
      armOverBudgetSession();

      // Same over-budget state — the ONLY difference is the explicit override.
      const token = beginDispatch({
        target: 'quality/code-reviewer',
        goal: 'Review the changes carefully.',
        skipBudgetCheck: true,
      });

      assert.ok(fs.existsSync(token.auditPath), 'audit entry must be written despite the exceeded budget');
    } finally {
      teardownTempProject();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// finalizeDispatch — outcome default second operands
// ─────────────────────────────────────────────────────────────────────

describe('v8-dispatcher — finalizeDispatch records the supplied outcome', () => {
  it('writes the caller status, reason, gradedAt, and grade rather than the defaults', () => {
    setupTempProject();
    try {
      const { beginDispatch, finalizeDispatch } = loadDispatcher();
      const token = beginDispatch({
        target: 'quality/code-reviewer',
        goal: 'Review the auth changes for issues.',
      });

      const res = finalizeDispatch(token, {
        status: 'error',
        reason: 'compiler blew up',
        gradedAt: '2026-07-16T00:00:00.000Z',
        grade: 'A',
      });

      // Each assertion kills a distinct `outcome.X || default` mutant: 'error' vs
      // 'completed', a real reason vs '', a real timestamp vs null, 'A' vs null.
      assert.equal(res.outcome.status, 'error');
      assert.equal(res.outcome.reason, 'compiler blew up');
      assert.equal(res.outcome.graded_at, '2026-07-16T00:00:00.000Z');
      assert.equal(res.outcome.grade, 'A');
    } finally {
      teardownTempProject();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// updateGrade — confidence→bucket resolution and outcome branches
// ─────────────────────────────────────────────────────────────────────

describe('v8-dispatcher — updateGrade confidence routing', () => {
  const routingRows = [
    { confidence: 'MEDIUM', precKey: 'precision_med', id: 'medium->med-bucket' },
    { confidence: 'LOW', precKey: 'precision_low', id: 'low->low-bucket' },
    { confidence: undefined, precKey: 'precision_low', id: 'undefined-defaults-to-low' },
  ];

  for (const row of routingRows) {
    it(`routes an accepted ${row.id} finding to the ${row.precKey} bucket`, () => {
      setupTempProject();
      try {
        const { updateGrade } = loadDispatcher();

        const entry = updateGrade('quality/code-reviewer', row.confidence, 'accepted');

        // The routed bucket is boosted to 1.0; the unrelated high bucket is not.
        assert.equal(entry[row.precKey], 1.0, `${row.id}: routed bucket should reach 1.0`);
        assert.equal(entry.precision_high, 0, `${row.id}: high bucket must stay untouched`);
      } finally {
        teardownTempProject();
      }
    });
  }

  it('increments the canonical total_med counter (not a phantom total_medium) for MEDIUM findings', () => {
    setupTempProject();
    try {
      const { updateGrade } = loadDispatcher();

      // Two MEDIUM-confidence findings: one accepted, one false_positive.
      updateGrade('quality/code-reviewer', 'MEDIUM', 'accepted');
      const entry = updateGrade('quality/code-reviewer', 'MEDIUM', 'false_positive');

      // The total counter MUST land in the schema field total_med. Before the
      // fix, the total key was derived from the RAW confidence string
      // ('total_medium') while the precision key was bucketed ('precision_med'),
      // so total_med stayed 0 and a phantom out-of-schema total_medium accrued.
      assert.equal(entry.total_med, 2, 'both MEDIUM findings must count toward total_med');
      assert.ok(
        !Object.prototype.hasOwnProperty.call(entry, 'total_medium'),
        'no phantom out-of-schema total_medium key may exist',
      );
      // precision_med must remain numerically correct (1 accept of 2 → 0.5),
      // and derived from a non-zero denominator (not NaN).
      assert.equal(entry.precision_med, 0.5, 'precision_med = 1 accepted / 2 total');
    } finally {
      teardownTempProject();
    }
  });

  it('decays precision on a kickback outcome (the || second operand)', () => {
    setupTempProject();
    try {
      const { updateGrade } = loadDispatcher();

      updateGrade('quality/code-reviewer', 'HIGH', 'accepted');
      updateGrade('quality/code-reviewer', 'HIGH', 'accepted');
      const entry = updateGrade('quality/code-reviewer', 'HIGH', 'kickback');

      // Existing suite only proves 'false_positive'. Dropping `|| 'kickback'`
      // would treat this as a no-op and leave precision at 1.0.
      assert.equal(entry.total_high, 3);
      assert.ok(entry.precision_high < 1.0, 'precision must drop after a kickback');
      assert.ok(entry.precision_high > 0.5, 'two accepted still keep it a majority');
    } finally {
      teardownTempProject();
    }
  });

  it('leaves precision unchanged for an outcome that is neither accepted nor a decay', () => {
    setupTempProject();
    try {
      const { updateGrade } = loadDispatcher();

      // 'ignored' matches no branch: the total increments but precision stays put.
      // A mutant that made the accepted-boost unconditional would push it to 1.0.
      const entry = updateGrade('quality/code-reviewer', 'HIGH', 'ignored');

      assert.equal(entry.total_high, 1);
      assert.equal(entry.precision_high, 0);
    } finally {
      teardownTempProject();
    }
  });

  it('namespaces a bare agent name under unknown/ instead of keying it raw', () => {
    setupTempProject();
    try {
      const { updateGrade, loadGrades } = loadDispatcher();

      updateGrade('code-reviewer', 'HIGH', 'accepted');
      const grades = loadGrades();

      assert.ok(grades['unknown/code-reviewer'], 'bare name must be namespaced');
      assert.equal(grades['code-reviewer'], undefined, 'raw un-namespaced key must not exist');
    } finally {
      teardownTempProject();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Zero-dep YAML writer/reader dark paths (via saveGrades / loadGrades)
// ─────────────────────────────────────────────────────────────────────

describe('v8-dispatcher — YAML round-trip edge paths', () => {
  it('emits array-of-primitive values as YAML list items and survives reading them back', () => {
    setupTempProject();
    try {
      const { saveGrades, loadGrades } = loadDispatcher();

      // Array-of-primitives forces the writer's list-item branch (yamlStringify
      // line 260); reading it back forces the reader's `- ` array-skip
      // (parseYaml lines 312-315). The scalar sibling must survive the skip.
      saveGrades({ 'quality/x': { tags: ['alpha', 'beta'], score: 3 } });

      const raw = fs.readFileSync(path.join(tmpDir, '.ctoc/agents/dispatch-grades.yaml'), 'utf8');
      assert.match(raw, /- alpha/, 'primitive array element must be emitted as a list item');

      const grades = loadGrades();
      assert.equal(grades['quality/x'].score, 3, 'scalar sibling survives the skipped array lines');
    } finally {
      teardownTempProject();
    }
  });

  it('round-trips a value that requires YAML quoting through JSON.parse on read', () => {
    setupTempProject();
    try {
      const { saveGrades, loadGrades } = loadDispatcher();

      // A comma is outside the writer's bare-string charset, so it is JSON-quoted
      // on write and must be JSON.parsed back on read (parseYamlValue line 340).
      saveGrades({ 'quality/x': { note: 'alpha, beta' } });

      const grades = loadGrades();
      assert.equal(grades['quality/x'].note, 'alpha, beta');
    } finally {
      teardownTempProject();
    }
  });

  it('fails open to an empty object when the grades file cannot be read', () => {
    setupTempProject();
    try {
      const { loadGrades } = loadDispatcher();

      // Grades path exists but is a DIRECTORY → readFileSync throws (EISDIR),
      // exercising parseYamlFile's catch (lines 288-289). The gate must not crash;
      // it fails open to {}.
      fs.mkdirSync(path.join(tmpDir, '.ctoc/agents/dispatch-grades.yaml'), { recursive: true });

      assert.deepEqual(loadGrades(), {});
    } finally {
      teardownTempProject();
    }
  });
});
