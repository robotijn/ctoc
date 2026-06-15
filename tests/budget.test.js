/**
 * Tests for src/lib/budget.js — session-level build budget enforcement.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

function loadBudget() {
  const p = require.resolve('../src/lib/budget');
  delete require.cache[p];
  return require('../src/lib/budget');
}

let originalCwd;
let tmpDir;
let SESSION;

function setupTempProject(yamlOverride) {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-budget-'));
  process.chdir(tmpDir);
  fs.mkdirSync(path.join(tmpDir, '.ctoc', 'config'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.ctoc', 'budget-usage'), { recursive: true });

  if (yamlOverride !== undefined) {
    fs.writeFileSync(path.join(tmpDir, '.ctoc', 'config', 'budget.yaml'), yamlOverride);
  }
  // Unique session id per test to avoid cross-bleed
  SESSION = `test-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  process.env.CTOC_SESSION_ID = SESSION;
}

function teardownTempProject() {
  delete process.env.CTOC_SESSION_ID;
  process.chdir(originalCwd);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore: best-effort temp cleanup, non-fatal */ }
}

describe('budget — loadBudget', () => {
  it('returns DEFAULTS when budget.yaml is missing', () => {
    setupTempProject(undefined);
    const b = loadBudget();
    const cfg = b.loadBudget();
    assert.equal(cfg.max_session_hours, 4);
    assert.equal(cfg.max_dispatches, 100);
    assert.equal(cfg.max_iron_loop_iterations, 50);
    assert.equal(cfg.halt_action, 'ask_user');
    assert.equal(cfg.enabled, true);
    teardownTempProject();
  });

  it('respects user overrides while merging defaults', () => {
    setupTempProject(
      `budget:\n  max_session_hours: 8\n  max_dispatches: 200\n  halt_action: log_only\n`
    );
    const b = loadBudget();
    const cfg = b.loadBudget();
    assert.equal(cfg.max_session_hours, 8);
    assert.equal(cfg.max_dispatches, 200);
    assert.equal(cfg.max_iron_loop_iterations, 50);   // from default
    assert.equal(cfg.halt_action, 'log_only');
    teardownTempProject();
  });
});

describe('budget — usage round-trip', () => {
  it('currentUsage returns zero counters for a fresh session', () => {
    setupTempProject();
    const b = loadBudget();
    const u = b.currentUsage();
    assert.equal(u.dispatches, 0);
    assert.equal(u.iron_loop_iterations, 0);
    assert.match(u.started_at, /^\d{4}-\d{2}-\d{2}T/);
    teardownTempProject();
  });

  it('recordDispatch increments and persists', () => {
    setupTempProject();
    const b = loadBudget();
    b.recordDispatch('quality/code-reviewer');
    b.recordDispatch('security/sast-scanner');
    const u = b.currentUsage();
    assert.equal(u.dispatches, 2);
    assert.equal(u.last_target, 'security/sast-scanner');
    teardownTempProject();
  });

  it('recordIronLoopStep increments and persists', () => {
    setupTempProject();
    const b = loadBudget();
    b.recordIronLoopStep('IMPLEMENT');
    b.recordIronLoopStep('REVIEW');
    b.recordIronLoopStep('VERIFY');
    const u = b.currentUsage();
    assert.equal(u.iron_loop_iterations, 3);
    assert.equal(u.last_step, 'VERIFY');
    teardownTempProject();
  });

  it('round-trips through the usage file', () => {
    setupTempProject();
    const b = loadBudget();
    b.recordDispatch('quality/code-reviewer');
    const p = b.getUsagePath();
    assert.ok(fs.existsSync(p), 'usage file must be written');
    const content = fs.readFileSync(p, 'utf8');
    assert.match(content, /dispatches: 1/);
    assert.match(content, /quality\/code-reviewer/);
    teardownTempProject();
  });
});

describe('budget — checkBudget', () => {
  it('reports within limits on a fresh session', () => {
    setupTempProject();
    const b = loadBudget();
    const r = b.checkBudget();
    assert.equal(r.withinLimits, true);
    assert.deepEqual(r.exceeded, []);
    teardownTempProject();
  });

  it('detects max_dispatches exceeded', () => {
    setupTempProject(`budget:\n  max_dispatches: 3\n`);
    const b = loadBudget();
    for (let i = 0; i < 4; i++) b.recordDispatch(`agent/${i}`);
    const r = b.checkBudget();
    assert.equal(r.withinLimits, false);
    assert.equal(r.exceeded.length, 1);
    assert.equal(r.exceeded[0].kind, 'max_dispatches');
    assert.equal(r.exceeded[0].current, 4);
    assert.equal(r.exceeded[0].limit, 3);
    teardownTempProject();
  });

  it('detects max_iron_loop_iterations exceeded', () => {
    setupTempProject(`budget:\n  max_iron_loop_iterations: 2\n`);
    const b = loadBudget();
    b.recordIronLoopStep('A');
    b.recordIronLoopStep('B');
    b.recordIronLoopStep('C');
    const r = b.checkBudget();
    assert.equal(r.withinLimits, false);
    assert.ok(r.exceeded.some(e => e.kind === 'max_iron_loop_iterations'));
    teardownTempProject();
  });

  it('detects max_session_hours exceeded via stale started_at', () => {
    setupTempProject(`budget:\n  max_session_hours: 1\n`);
    const b = loadBudget();
    // Plant a started_at 5 hours ago
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    const p = b.getUsagePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(
      p,
      `usage:\n  started_at: ${JSON.stringify(fiveHoursAgo)}\n  dispatches: 0\n  iron_loop_iterations: 0\n`
    );
    const r = b.checkBudget();
    assert.equal(r.withinLimits, false);
    assert.ok(r.exceeded.some(e => e.kind === 'max_session_hours'));
    teardownTempProject();
  });

  it('triggers checkpoint at configured thresholds', () => {
    setupTempProject(
      `budget:\n  max_dispatches: 100\n  checkpoint_at:\n    dispatches: [2]\n    iron_loop_iterations: []\n`
    );
    const b = loadBudget();
    b.recordDispatch('a');
    const r1 = b.checkBudget();
    assert.equal(r1.shouldCheckpoint, false, '1 dispatch — no checkpoint yet');
    b.recordDispatch('b');
    const r2 = b.checkBudget();
    assert.equal(r2.shouldCheckpoint, true, '2 dispatches — hits checkpoint');
    assert.equal(r2.checkpoints[0].kind, 'dispatches');
    assert.equal(r2.checkpoints[0].at, 2);
    teardownTempProject();
  });

  it('returns withinLimits: true when enabled: false', () => {
    setupTempProject(`budget:\n  enabled: false\n  max_dispatches: 1\n`);
    const b = loadBudget();
    b.recordDispatch('a');
    b.recordDispatch('b');
    b.recordDispatch('c');
    const r = b.checkBudget();
    assert.equal(r.withinLimits, true, 'disabled budget never reports over-limit');
    teardownTempProject();
  });
});

describe('budget — enforce', () => {
  it('throws BUDGET_EXCEEDED when halt_action: ask_user and over limit', () => {
    setupTempProject(`budget:\n  max_dispatches: 1\n  halt_action: ask_user\n`);
    const b = loadBudget();
    b.recordDispatch('a');
    b.recordDispatch('b');
    let err;
    try { b.enforce(); } catch (e) { err = e; }
    assert.ok(err, 'enforce should throw');
    assert.equal(err.code, 'BUDGET_EXCEEDED');
    assert.ok(err.details);
    assert.ok(err.details.exceeded.length >= 1);
    teardownTempProject();
  });

  it('warns (no throw) when halt_action: log_only', () => {
    setupTempProject(`budget:\n  max_dispatches: 1\n  halt_action: log_only\n`);
    const b = loadBudget();
    b.recordDispatch('a');
    b.recordDispatch('b');
    // Should not throw
    const r = b.enforce();
    assert.equal(r.withinLimits, false);
    teardownTempProject();
  });

  it('is quiet when halt_action: continue', () => {
    setupTempProject(`budget:\n  max_dispatches: 1\n  halt_action: continue\n`);
    const b = loadBudget();
    b.recordDispatch('a');
    b.recordDispatch('b');
    const r = b.enforce();
    assert.equal(r.withinLimits, false);
    teardownTempProject();
  });
});

describe('budget — resetSession', () => {
  it('clears the per-session counters', () => {
    setupTempProject();
    const b = loadBudget();
    b.recordDispatch('a');
    b.recordDispatch('b');
    assert.equal(b.currentUsage().dispatches, 2);
    b.resetSession();
    assert.equal(b.currentUsage().dispatches, 0);
    teardownTempProject();
  });
});

describe('budget — formatStatus', () => {
  it('returns a human-readable summary', () => {
    setupTempProject();
    const b = loadBudget();
    b.recordDispatch('quality/code-reviewer');
    const text = b.formatStatus();
    assert.match(text, /CTOC Build Budget/);
    assert.match(text, /Dispatches:\s+1\s+\/\s+100/);
    assert.match(text, /STATUS: within limits/);
    teardownTempProject();
  });
});

describe('budget — getCurrentSessionId', () => {
  it('honors CTOC_SESSION_ID when set', () => {
    setupTempProject();
    process.env.CTOC_SESSION_ID = 'fixed-test-id';
    const b = loadBudget();
    assert.equal(b.getCurrentSessionId(), 'fixed-test-id');
    teardownTempProject();
  });

  it('derives a date-bucketed id by default', () => {
    setupTempProject();
    delete process.env.CTOC_SESSION_ID;
    const b = loadBudget();
    const id = b.getCurrentSessionId();
    assert.match(id, /^session-\d{4}-\d{2}-\d{2}-\d+$/);
    teardownTempProject();
  });
});
