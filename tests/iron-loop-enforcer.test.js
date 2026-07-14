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
    assert.match(f.message, /approved_by: human in the approval ledger/);
  });

  // R3-C: a frontmatter marker is FORGEABLE — anything that can write the plan can
  // write `approved_by: human`. The enforcer now accepts exactly what the runtime
  // hook accepts: an APPROVAL LEDGER entry for this gate edge. A marker alone is a
  // block finding (below); a ledger-backed plan is clean (after).
  it('FLAGS a plan whose only approval is a frontmatter marker (forgeable, no ledger)', () => {
    const root = makeMinimalProject();
    fs.writeFileSync(path.join(root, 'plans/done/x.md'), '---\nfiles: ["*"]\napproved_by: human\n---\nbody');
    const result = checkAllInvariants({ root, mode: 'fast', scopes: ['iron-loop'] });
    const f = result.findings.find(x => x.id === 'gate-destinations-approved');
    assert.ok(f, 'a marker with no ledger entry is NOT an approval');
    assert.equal(f.severity, 'block');
  });

  it('does NOT flag a plan the approval LEDGER approves into this gate', () => {
    const root = makeMinimalProject();
    const planPath = path.join(root, 'plans/done/x.md');
    const content = '---\nfiles: ["*"]\napproved_by: human\n---\nbody';
    fs.writeFileSync(planPath, content);

    const ledger = require('../src/lib/approval-ledger');
    ledger.writeEntry(ledger.slugFromPlanPath(planPath), {
      stage_from: 'review',
      stage_to: 'done',
      content_sha256: ledger.computeContentHash(content),
      approved_by: 'human'
    }, root);

    const result = checkAllInvariants({ root, mode: 'fast', scopes: ['iron-loop'] });
    const f = result.findings.find(x => x.id === 'gate-destinations-approved');
    assert.equal(f, undefined, 'a ledger-backed approval is clean — enforcer and hook agree');
  });
});

describe('iron-loop-enforcer — gate-destination exemption for pre-Gate-2 slices (W02-s6)', () => {
  // H7's second home: checkGateDestinationsApproved must exempt SIP1 slices that
  // carry parent_plan: and live unmarked in implementation/ awaiting batch Gate-2
  // approval, and must scope the approved_by marker to the frontmatter region (not a
  // raw substring that a prose body mention satisfies). Real temp dir, real files.
  let tmpRoot;

  function makeGateProject() {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-gate-'));
    for (const s of ['implementation', 'todo', 'done']) {
      fs.mkdirSync(path.join(tmpRoot, 'plans', s), { recursive: true });
    }
    // Make findProjectRoot resolve to tmpRoot.
    fs.mkdirSync(path.join(tmpRoot, '.ctoc'), { recursive: true });
    return tmpRoot;
  }

  function writePlan(stage, name, content) {
    fs.writeFileSync(path.join(tmpRoot, 'plans', stage, name), content);
  }

  function gateFinding(root) {
    const result = checkAllInvariants({ root, mode: 'fast', scopes: ['iron-loop'] });
    return result.findings.find(x => x.id === 'gate-destinations-approved');
  }

  afterEach(() => {
    if (tmpRoot) {
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
      tmpRoot = null;
    }
  });

  it('(a) does NOT flag an unmarked implementation/ slice that carries parent_plan', () => {
    const root = makeGateProject();
    writePlan('implementation', 'w-s1.md',
      '---\ntitle: "slice"\ntype: feature\nparent_plan: "w-parent"\nfiles: ["src/x.js"]\n---\n\n# body\nno marker here');
    const f = gateFinding(root);
    assert.equal(f, undefined, 'pre-Gate-2 slice with parent_plan must be exempt');
  });

  it('(b) DOES flag an unmarked implementation/ plan with NO parent_plan (genuine gate-jump)', () => {
    const root = makeGateProject();
    writePlan('implementation', 'orphan.md',
      '---\ntitle: "orphan"\ntype: feature\nfiles: ["src/x.js"]\n---\n\n# body');
    const f = gateFinding(root);
    assert.ok(f, 'expected gate-destinations-approved finding');
    assert.equal(f.severity, 'block');
    assert.ok(f.details.offenders.some(o => o.plan.endsWith('orphan.md')),
      `orphan.md should be an offender: ${JSON.stringify(f.details.offenders)}`);
  });

  it('(c) DOES flag an unmarked todo/ or done/ plan even with a parent_plan (past Gate 2/3)', () => {
    const root = makeGateProject();
    writePlan('todo', 't.md',
      '---\ntitle: "t"\ntype: feature\nparent_plan: "w-parent"\nfiles: ["src/x.js"]\n---\n\n# body');
    writePlan('done', 'd.md',
      '---\ntitle: "d"\ntype: feature\nparent_plan: "w-parent"\nfiles: ["src/x.js"]\n---\n\n# body');
    const f = gateFinding(root);
    assert.ok(f, 'expected gate-destinations-approved finding');
    assert.equal(f.severity, 'block');
    assert.ok(f.details.offenders.some(o => o.plan.endsWith('t.md')), 'todo slice must be flagged');
    assert.ok(f.details.offenders.some(o => o.plan.endsWith('d.md')), 'done slice must be flagged');
  });

  it('(d) DOES flag a plan whose only approved_by: human is in the prose body (frontmatter-scoped)', () => {
    const root = makeGateProject();
    writePlan('done', 'body-only.md',
      '---\ntitle: "body only"\ntype: feature\nfiles: ["src/x.js"]\n---\n\n# body\n' +
      'This plan discusses that `approved_by: human` is self-asserted text.');
    const f = gateFinding(root);
    assert.ok(f, 'expected gate-destinations-approved finding');
    assert.equal(f.severity, 'block');
    assert.ok(f.details.offenders.some(o => o.plan.endsWith('body-only.md')),
      'body-only marker mention must NOT count as approval');
  });

  it('does NOT flag a marked parent plan whose Gate-1 crossing is in the LEDGER', () => {
    const root = makeGateProject();
    // Gate-1 stamps a separate marker block PREPENDED above the plan frontmatter —
    // AND (R3-C) records the crossing in the approval ledger, which is what the
    // enforcer and the runtime hook both read. The stamp alone is not enough.
    const content =
      '---\napproved_by: human\napproved_at: 2026-07-13T00:00:00Z\ngate_crossed: functional → implementation\n---\n\n' +
      '---\ntitle: "parent index"\ntype: feature\nfiles: ["src/x.js"]\n---\n\n# body';
    writePlan('implementation', 'parent.md', content);

    const ledger = require('../src/lib/approval-ledger');
    ledger.writeEntry('parent', {
      stage_from: 'functional',
      stage_to: 'implementation',
      content_sha256: ledger.computeContentHash(content),
      approved_by: 'human'
    }, root);

    const f = gateFinding(root);
    assert.equal(f, undefined, 'a ledger-backed Gate-1 crossing must pass');
  });

  it('(e) DOES flag a plan carrying a FORGED marker block with no ledger entry', () => {
    const root = makeGateProject();
    // The exact shape a forger would write: a perfect-looking Gate-2 marker block,
    // stamped by anything that can write the file. No ledger entry ⇒ not approved.
    writePlan('todo', 'forged.md',
      '---\napproved_by: human\napproved_at: 2026-07-13T00:00:00Z\ngate_crossed: implementation → todo\n---\n\n' +
      '---\ntitle: "forged"\ntype: feature\nfiles: ["src/x.js"]\n---\n\n# body');
    const f = gateFinding(root);
    assert.ok(f, 'a forged marker with no ledger entry must be reported');
    assert.equal(f.severity, 'block');
    assert.ok(f.details.offenders.some(o => o.plan.endsWith('forged.md')),
      'the forged plan must be named as an offender');
  });

  // R5-B: the DUPLICATE `type: vision` exemption is GONE from the enforcer — it
  // mirrored the forgery hole the runtime hook already closed (R3-A). A `type: vision`
  // frontmatter line is forgeable; residency is now UNIFORMLY ledger-driven for both
  // systems. A decomposed vision archive earns done/ residency with a PIPELINE-kind
  // ledger entry, not a self-asserted frontmatter line.
  it('FLAGS a type: vision plan in done/ with NO ledger entry (the old exemption was a forgery hole)', () => {
    const root = makeGateProject();
    writePlan('done', 'vision.md',
      '---\ntype: vision\nstatus: decomposed\ntitle: "a vision"\n---\n\n# Vision\nbody');
    const f = gateFinding(root);
    assert.ok(f, 'an un-ledgered vision archive is no longer exempt');
    assert.equal(f.severity, 'block');
    assert.ok(f.details.offenders.some(o => o.plan.endsWith('vision.md')),
      'the un-ledgered vision must be named as an offender');
  });

  it('does NOT flag a decomposed vision archived in done/ that has a PIPELINE ledger entry', () => {
    const root = makeGateProject();
    const planPath = path.join(root, 'plans', 'done', 'vision.md');
    fs.writeFileSync(planPath,
      '---\ntype: vision\nstatus: decomposed\ntitle: "a vision"\n---\n\n# Vision\nbody');

    // Earn residency the sanctioned way: the vision-archive pipeline entry
    // (advanced_by: pipeline, evidence: 'vision-decomposed'), the SAME acceptance the
    // runtime hook uses — enforcer and hook now agree.
    const ledger = require('../src/lib/approval-ledger');
    ledger.writeVisionArchiveEntry(root, planPath);

    const f = gateFinding(root);
    assert.equal(f, undefined, 'a ledger-backed vision archive is clean');
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
