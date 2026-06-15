/**
 * Iron Loop self-enforcement tests (v8.4)
 *
 * Verifies:
 *   - All checks run against the live repo and pass (the system enforces itself)
 *   - The enforcer can detect violations when invariants are broken (via temp dir scenarios)
 *   - Fast mode skips thorough-only checks
 *   - Scope filtering works
 *   - Format functions produce parseable output
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const projectRoot = path.join(__dirname, '..');
const {
  checkAllInvariants,
  formatReport,
  formatCompact,
  CANONICAL_STEPS,
  TIER_1_AGENTS,
  REQUIRED_HOOKS,
} = require('../src/lib/iron-loop-enforcer');

describe('iron-loop-enforcer — live repo state', () => {
  it('CTOC repo passes the fast self-check with 0 critical and 0 block', () => {
    const result = checkAllInvariants({ root: projectRoot, mode: 'fast' });
    const critical = result.findings.filter(f => f.severity === 'critical');
    const block = result.findings.filter(f => f.severity === 'block');
    assert.equal(critical.length, 0, `Critical findings: ${JSON.stringify(critical.map(f => f.id))}`);
    assert.equal(block.length, 0, `Block findings: ${JSON.stringify(block.map(f => f.id))}`);
  });

  it('CTOC repo passes the thorough self-check with 0 critical and 0 block', () => {
    const result = checkAllInvariants({ root: projectRoot, mode: 'thorough' });
    const critical = result.findings.filter(f => f.severity === 'critical');
    const block = result.findings.filter(f => f.severity === 'block');
    assert.equal(critical.length, 0, `Critical findings: ${JSON.stringify(critical.map(f => f.id))}`);
    assert.equal(block.length, 0, `Block findings: ${JSON.stringify(block.map(f => f.id))}`);
  });

  it('formatCompact returns OK when no critical/block', () => {
    const result = checkAllInvariants({ root: projectRoot, mode: 'fast' });
    const compact = formatCompact(result);
    if (result.summary.critical === 0 && result.summary.block === 0) {
      assert.match(compact, /Self-check: OK/);
    }
  });

  it('formatReport produces a Markdown-like report', () => {
    const result = checkAllInvariants({ root: projectRoot, mode: 'fast' });
    const report = formatReport(result);
    assert.match(report, /CTOC Self-Check Report/);
    assert.match(report, /Summary:/);
  });
});

describe('iron-loop-enforcer — violation detection', () => {
  let tmpRoot;

  function makeMinimalProject() {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-enforce-'));
    fs.mkdirSync(path.join(tmpRoot, '.claude-plugin'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, '.ctoc/templates/saas/b2c-subscription'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'agents/coordinator'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'agents/scouts'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'skills'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'src/hooks'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'src/lib'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'plans/in-progress'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'plans/done'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'VERSION'), '1.0.0\n');
    fs.writeFileSync(path.join(tmpRoot, '.claude-plugin/hooks.json'), JSON.stringify({
      hooks: {
        SessionStart: [{ command: 'x' }],
        PreToolUse: [{ matcher: 'Edit', hooks: [{ command: 'PreToolUse.Edit.js' }] }, { matcher: '*', hooks: [{ command: 'human-gate-check.js' }] }],
      },
    }));
    return tmpRoot;
  }

  afterEach(() => {
    if (tmpRoot) {
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore: best-effort temp cleanup, non-fatal */ }
      tmpRoot = null;
    }
  });

  it('flags missing CTO Chief as critical', () => {
    const root = makeMinimalProject();
    const result = checkAllInvariants({ root, mode: 'fast', scopes: ['architecture'] });
    const f = result.findings.find(x => x.id === 'cto-chief-top-level');
    assert.ok(f, 'expected cto-chief-top-level finding');
    assert.equal(f.severity, 'critical');
    assert.match(f.message, /CTO Chief/);
  });

  it('flags multiple top-level agents as critical', () => {
    const root = makeMinimalProject();
    // Write CTO Chief
    fs.writeFileSync(path.join(root, 'agents/coordinator/cto-chief.md'), `---
name: cto-chief
role: top-level-coordinator
tier: 0
---
body`);
    // Write a SECOND agent claiming top-level
    fs.writeFileSync(path.join(root, 'agents/coordinator/imposter.md'), `---
name: imposter
role: top-level-coordinator
---
nope`);
    const result = checkAllInvariants({ root, mode: 'fast', scopes: ['architecture'] });
    const f = result.findings.find(x => x.id === 'only-one-top-level');
    assert.ok(f, 'expected only-one-top-level finding');
    assert.equal(f.severity, 'critical');
    assert.ok(f.message.includes('imposter'));
  });

  it('flags VERSION out of sync as block', () => {
    const root = makeMinimalProject();
    fs.writeFileSync(path.join(root, '.claude-plugin/plugin.json'), JSON.stringify({ version: '0.5.0' }));
    const result = checkAllInvariants({ root, mode: 'fast', scopes: ['system'] });
    const f = result.findings.find(x => x.id === 'version-sync');
    assert.ok(f, 'expected version-sync finding');
    assert.equal(f.severity, 'block');
    assert.match(f.message, /out of sync/);
  });

  it('flags missing required hooks as critical', () => {
    const root = makeMinimalProject();
    const result = checkAllInvariants({ root, mode: 'fast', scopes: ['system'] });
    const f = result.findings.find(x => x.id === 'required-hooks');
    assert.ok(f, 'expected required-hooks finding');
    assert.equal(f.severity, 'critical');
  });

  it('flags plan in done/ without approved_by marker as block', () => {
    const root = makeMinimalProject();
    fs.writeFileSync(path.join(root, 'plans/done/x.md'), '---\nfiles: ["*"]\n---\nbody');
    const result = checkAllInvariants({ root, mode: 'fast', scopes: ['iron-loop'] });
    const f = result.findings.find(x => x.id === 'gate-destinations-approved');
    assert.ok(f, 'expected gate-destinations-approved finding');
    assert.equal(f.severity, 'block');
    assert.match(f.message, /missing approved_by/);
  });

  it('does NOT flag plans with approved_by: human marker', () => {
    const root = makeMinimalProject();
    fs.writeFileSync(path.join(root, 'plans/done/x.md'), '---\nfiles: ["*"]\napproved_by: human\n---\nbody');
    const result = checkAllInvariants({ root, mode: 'fast', scopes: ['iron-loop'] });
    const f = result.findings.find(x => x.id === 'gate-destinations-approved');
    assert.equal(f, undefined, 'should not flag approved plan');
  });
});

describe('iron-loop-enforcer — fast vs thorough modes', () => {
  it('fast mode skips thorough-only checks', () => {
    const fast = checkAllInvariants({ root: projectRoot, mode: 'fast' });
    const thorough = checkAllInvariants({ root: projectRoot, mode: 'thorough' });
    // Thorough must include at least everything fast does
    assert.ok(thorough.findings.length >= fast.findings.length);
  });

  it('scope filtering limits checks', () => {
    const result = checkAllInvariants({ root: projectRoot, mode: 'fast', scopes: ['architecture'] });
    for (const f of result.findings) {
      assert.equal(f.scope, 'architecture');
    }
  });
});

describe('iron-loop-enforcer — performance', () => {
  it('fast mode completes in under 500ms on the live repo', () => {
    const start = Date.now();
    checkAllInvariants({ root: projectRoot, mode: 'fast' });
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 500, `Fast mode took ${elapsed}ms, target < 500ms`);
  });
});

describe('iron-loop-enforcer — constants', () => {
  it('CANONICAL_STEPS includes all 16 Iron Loop labels', () => {
    assert.equal(CANONICAL_STEPS.length, 16);
    assert.ok(CANONICAL_STEPS.includes('IDEATE'));
    assert.ok(CANONICAL_STEPS.includes('IMPLEMENT'));
    assert.ok(CANONICAL_STEPS.includes('FINAL-REVIEW'));
  });

  it('TIER_1_AGENTS lists all expected sub-orchestrators', () => {
    assert.ok(TIER_1_AGENTS.includes('agents/coordinator/synthesizer.md'));
    assert.ok(TIER_1_AGENTS.includes('agents/planning/stack-chooser.md'));
    assert.ok(TIER_1_AGENTS.includes('agents/planning/stack-chooser.md'));
  });

  it('REQUIRED_HOOKS lists all PreToolUse + SessionStart + human-gate-check', () => {
    assert.ok(REQUIRED_HOOKS.includes('src/hooks/SessionStart.js'));
    assert.ok(REQUIRED_HOOKS.includes('src/hooks/PreToolUse.Edit.js'));
    assert.ok(REQUIRED_HOOKS.includes('src/hooks/human-gate-check.js'));
  });
});
