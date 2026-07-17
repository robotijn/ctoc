/**
 * Tests for src/lib/v8-dispatcher.js
 *
 * Verifies:
 *   - ULID generation (length, character set, monotonic-ish ordering)
 *   - Tier inference from target path
 *   - Request normalization + validation
 *   - Effort budget enforcement (Tier 2/3 must have max_subagents: 0)
 *   - Audit log round-trip (write + read + finalize)
 *   - Grade tracking math
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

let originalCwd;
let tmpDir;

function loadDispatcher() {
  // Re-require fresh after cwd change so the module picks up new paths.
  const p = require.resolve('../src/lib/v8-dispatcher');
  delete require.cache[p];
  return require('../src/lib/v8-dispatcher');
}

function setupTempProject() {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-disp-'));
  process.chdir(tmpDir);
  fs.mkdirSync('.ctoc/agents', { recursive: true });
  fs.mkdirSync('.ctoc/audit/dispatches', { recursive: true });
}

function teardownTempProject() {
  process.chdir(originalCwd);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore: best-effort temp cleanup */ }
}

describe('v8-dispatcher — ULID generation', () => {
  it('generates 26-char ULIDs', () => {
    setupTempProject();
    const { generateUlid } = loadDispatcher();
    const id = generateUlid();
    assert.equal(id.length, 26);
    assert.match(id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
    teardownTempProject();
  });

  it('generates monotonic-ish IDs (timestamp prefix increases over time)', () => {
    setupTempProject();
    const { generateUlid } = loadDispatcher();
    const id1 = generateUlid(1700000000000);
    const id2 = generateUlid(1700000001000);
    assert.ok(id1.slice(0, 10) <= id2.slice(0, 10), 'timestamp prefix should be ordered');
    teardownTempProject();
  });
});

describe('v8-dispatcher — tier inference', () => {
  it('infers tier 0 for cto-chief', () => {
    setupTempProject();
    const { inferTier } = loadDispatcher();
    assert.equal(inferTier('coordinator/cto-chief'), 0);
    teardownTempProject();
  });

  it('infers tier 1 for sub-orchestrators', () => {
    setupTempProject();
    const { inferTier } = loadDispatcher();
    assert.equal(inferTier('coordinator/synthesizer'), 1);
    assert.equal(inferTier('planning/vision-advisor'), 1);
    assert.equal(inferTier('iron-loop/iron-loop-critic'), 1);
    assert.equal(inferTier('pipeline/agent-writer'), 1);
    teardownTempProject();
  });

  it('infers tier 2 for specialist categories', () => {
    setupTempProject();
    const { inferTier } = loadDispatcher();
    assert.equal(inferTier('quality/code-reviewer'), 2);
    assert.equal(inferTier('security/sast-scanner'), 2);
    assert.equal(inferTier('infrastructure/terraform-validator'), 2);
    teardownTempProject();
  });

  // DELETED by plan F3b: 'infers tier 3 for scouts', which asserted
  // inferTier('scouts/syntax-scout') === 3 and inferTier('scouts/test-scout') === 3.
  // Tier 3 is deleted and inferTier no longer has a `scouts/` branch, so the
  // contract this asserted no longer exists. An unknown category now correctly
  // falls through to the tier-2 specialist default, which the coverage suite
  // asserts. tests/no-tier-3.test.js fences the tier's absence.
});

describe('v8-dispatcher — request normalization', () => {
  it('validates target is required', () => {
    setupTempProject();
    const { normalizeRequest } = loadDispatcher();
    assert.throws(
      () => normalizeRequest({ goal: 'Some valid goal text here.' }),
      /target is required/
    );
    teardownTempProject();
  });

  it('validates goal must be ≥ 10 chars', () => {
    setupTempProject();
    const { normalizeRequest } = loadDispatcher();
    assert.throws(
      () => normalizeRequest({ target: 'quality/code-reviewer', goal: 'tiny' }),
      /goal must be ≥ 10 chars/
    );
    teardownTempProject();
  });

  it('rejects Tier 2 dispatches with max_subagents > 0', () => {
    setupTempProject();
    const { normalizeRequest } = loadDispatcher();
    // v6.9.3+: max_tokens / max_tool_calls dropped from the enforced schema;
    // only max_subagents is runtime-checked.
    assert.throws(
      () => normalizeRequest({
        target: 'quality/code-reviewer',
        goal: 'Review the changes thoroughly.',
        effortBudget: { max_subagents: 5 },
      }),
      /Tier 2 target must have max_subagents: 0/
    );
    teardownTempProject();
  });

  it('rejects non-cto-chief issuers', () => {
    setupTempProject();
    const { normalizeRequest } = loadDispatcher();
    assert.throws(
      () => normalizeRequest({
        target: 'quality/code-reviewer',
        goal: 'Review the changes thoroughly.',
        issuedBy: 'planning/vision-advisor',
      }),
      /only cto-chief may issue dispatches/
    );
    teardownTempProject();
  });

  it('produces a valid normalized request with defaults', () => {
    setupTempProject();
    const { normalizeRequest } = loadDispatcher();
    const req = normalizeRequest({
      target: 'quality/code-reviewer',
      goal: 'Review the auth changes for SRP violations.',
    });
    assert.equal(req.protocol_version, 1);
    assert.equal(req.issued_by, 'cto-chief');
    assert.equal(req.target_agent, 'quality/code-reviewer');
    assert.equal(req.target_tier, 2);
    assert.equal(req.priority, 'normal');
    assert.equal(req.effort_budget.max_subagents, 0);
    assert.match(req.id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
    assert.match(req.issued_at, /^\d{4}-\d{2}-\d{2}T/);
    teardownTempProject();
  });
});

describe('v8-dispatcher — audit log round-trip', () => {
  it('writes request to audit log', () => {
    setupTempProject();
    const { beginDispatch } = loadDispatcher();
    const token = beginDispatch({
      target: 'quality/code-reviewer',
      goal: 'Review the auth changes for SRP violations.',
    });
    assert.ok(fs.existsSync(token.auditPath), `audit log must exist at ${token.auditPath}`);
    const content = fs.readFileSync(token.auditPath, 'utf8');
    assert.match(content, /target_agent: quality\/code-reviewer/);
    assert.match(content, /protocol_version: 1/);
    teardownTempProject();
  });

  it('round-trips response into the audit log', () => {
    setupTempProject();
    const { beginDispatch, recordResponse } = loadDispatcher();
    const token = beginDispatch({
      target: 'quality/code-reviewer',
      goal: 'Review the auth changes for SRP violations.',
    });
    recordResponse(token, {
      findings: [
        {
          id: 'test/001',
          severity: 'high',
          type: 'long_function',
          file: 'src/auth/x.py',
          message: 'too long',
          confidence: 'HIGH',
        },
      ],
      self_assessment: { coverage: 0.95, confidence_overall: 'HIGH' },
      metadata: { tokens_used: 10000, tool_calls: 5 },
    });
    const content = fs.readFileSync(token.auditPath, 'utf8');
    assert.match(content, /response:/);
    assert.match(content, /severity: high/);
    assert.match(content, /long_function/);
    teardownTempProject();
  });

  it('rejects responses with no findings/synthesis', () => {
    setupTempProject();
    const { beginDispatch, recordResponse } = loadDispatcher();
    const token = beginDispatch({
      target: 'quality/code-reviewer',
      goal: 'Review the auth changes for SRP violations.',
    });
    assert.throws(
      () => recordResponse(token, { self_assessment: { coverage: 1.0 } }),
      /must include findings or synthesis/
    );
    teardownTempProject();
  });

  // TIGHTENED by plan F3b (this is a new assertion, not a relaxed one). `decision`
  // used to be an accepted response shape — the scout's pass|flag|error verdict.
  // With Tier 3 deleted, a bare verdict that a deep specialist was skipped is not a
  // response at all: every agent returns real findings (an empty list is a real
  // result) or a synthesis. This pins that narrowing so `decision` cannot creep back
  // in as an accepted shape.
  it('rejects a bare scout-style decision as a response shape', () => {
    setupTempProject();
    const { beginDispatch, recordResponse } = loadDispatcher();
    const token = beginDispatch({
      target: 'security/secrets-detector',
      goal: 'Scan the changed files for leaked credentials.',
    });
    assert.throws(
      () => recordResponse(token, { decision: 'pass', pillar: 'security', reason: 'no patterns' }),
      /must include findings or synthesis/,
      'a bare `decision: pass` must NOT be accepted — that was the scout form, and a ' +
        'verdict recorded without findings is how "scanned, nothing found" got written ' +
        'for a scan that never ran'
    );
    teardownTempProject();
  });

  // DELETED by plan F3b: 'validates scout responses have decision: pass|flag|error'.
  // It asserted that a tier-3 target rejects a decision outside pass|flag|error.
  // `decision` was the scout response form; the scout tier and the schema's
  // `scout_response` definition are both gone, so there is no such contract to
  // validate. A bare verdict is no longer an accepted response at all — the
  // tightened rule (findings or synthesis, nothing else) is asserted directly above.

  // Retargeted by plan F3b, NOT deleted: this asserts finalizeDispatch writes the
  // outcome block — a contract that is very much alive. Only the target string and
  // the response shape changed, from a deleted scout to a real watcher.
  it('finalizes a dispatch with outcome', () => {
    setupTempProject();
    const { beginDispatch, recordResponse, finalizeDispatch } = loadDispatcher();
    const token = beginDispatch({
      target: 'quality/type-checker',
      goal: 'Type-check the changed files.',
    });
    recordResponse(token, { findings: [] });
    finalizeDispatch(token, { status: 'completed' });
    const content = fs.readFileSync(token.auditPath, 'utf8');
    assert.match(content, /outcome:/);
    assert.match(content, /status: completed/);
    teardownTempProject();
  });
});

describe('v8-dispatcher — grade tracking', () => {
  it('updates grade after an accepted HIGH finding', () => {
    setupTempProject();
    const { updateGrade, loadGrades } = loadDispatcher();
    const entry = updateGrade('quality/code-reviewer', 'HIGH', 'accepted');
    assert.equal(entry.total_high, 1);
    assert.equal(entry.precision_high, 1.0);
    const grades = loadGrades();
    assert.ok(grades['quality/code-reviewer'], 'grade entry persists');
    teardownTempProject();
  });

  it('decays precision after a false-positive', () => {
    setupTempProject();
    const { updateGrade } = loadDispatcher();
    updateGrade('quality/code-reviewer', 'HIGH', 'accepted');
    updateGrade('quality/code-reviewer', 'HIGH', 'accepted');
    const entry = updateGrade('quality/code-reviewer', 'HIGH', 'false_positive');
    assert.equal(entry.total_high, 3);
    assert.ok(entry.precision_high < 1.0, 'precision must drop after FP');
    assert.ok(entry.precision_high > 0.5, 'precision should still be majority');
    teardownTempProject();
  });
});
