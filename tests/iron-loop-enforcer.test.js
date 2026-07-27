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

const { describe, it, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const projectRoot = path.join(__dirname, '..');
const {
  checkAllInvariants,
  checkGateDestinationsApproved,
  formatReport,
  formatCompact,
  CANONICAL_STEPS,
  TIER_1_AGENTS,
  REQUIRED_HOOKS,
  CHECKS,
} = require('../src/lib/iron-loop-enforcer');

// The live-repo clean-verdict assertions below run the THOROUGH fences
// (reachability / dead-export / false-green), which walk `<root>/src` at
// assertion time. Under `node --test` the suite runs test files in PARALLEL
// worker processes; a sibling worker that transiently creates or removes a
// `.js` under the live `src/` tree makes a real module momentarily unreachable,
// so the fence reports a phantom `block: 1`. Run standalone the same assertion
// is green — the flake only appears under concurrent load. "Is the tree clean?"
// is only meaningful against a STABLE tree, so these cases scan a one-time
// frozen snapshot of the repo instead of the mutable live checkout. The
// snapshot is a faithful copy (it yields the identical clean verdict) but
// nothing can churn it mid-scan.
const _SNAPSHOT_EXCLUDE = new Set(['node_modules', '.git', '.claude', 'tests', 'coverage']);
let _snapshotRoot = null;
function stableRepoRoot() {
  if (_snapshotRoot) return _snapshotRoot;
  // Copying a live tree is itself racy: a concurrent worker that removes a file
  // between cpSync's readdir and its lstat makes cpSync throw ENOENT. That is
  // the same churn the snapshot exists to escape, so tolerate it — a clean copy
  // window appears within a few attempts under realistic sporadic churn.
  let lastErr;
  for (let attempt = 0; attempt < 12; attempt++) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-enforce-snap-'));
    try {
      fs.cpSync(projectRoot, tmp, {
        recursive: true,
        filter: (src) => src === projectRoot || !_SNAPSHOT_EXCLUDE.has(path.basename(src)),
      });
      _snapshotRoot = tmp;
      return tmp;
    } catch (err) {
      fs.rmSync(tmp, { recursive: true, force: true });
      if (err && err.code === 'ENOENT') { lastErr = err; continue; }
      throw err;
    }
  }
  throw lastErr;
}
after(() => {
  if (_snapshotRoot) {
    fs.rmSync(_snapshotRoot, { recursive: true, force: true });
    _snapshotRoot = null;
  }
});

describe('iron-loop-enforcer — live repo state', () => {
  it('CTOC repo passes the fast self-check with 0 critical and 0 block', () => {
    const result = checkAllInvariants({ root: projectRoot, mode: 'fast' });
    const critical = result.findings.filter(f => f.severity === 'critical');
    const block = result.findings.filter(f => f.severity === 'block');
    assert.equal(critical.length, 0, `Critical findings: ${JSON.stringify(critical.map(f => f.id))}`);
    assert.equal(block.length, 0, `Block findings: ${JSON.stringify(block.map(f => f.id))}`);
  });

  it('CTOC repo passes the thorough self-check with 0 critical and 0 block', () => {
    const result = checkAllInvariants({ root: stableRepoRoot(), mode: 'thorough' });
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

// ─────────────────────────────────────────────────────────────────────
//  The verdict-envelope contract (plan 00101)
//
//  The defect: every check returned `null` for "clean" and an object for
//  "violation", so a caller that wrote `result.severity` CRASHED ON SUCCESS.
//  The contract below pins the envelope so a clean answer can never again be
//  falsy, and so a check that answers nothing is recorded as an ERROR rather
//  than silently read as clean.
// ─────────────────────────────────────────────────────────────────────

describe('iron-loop-enforcer — the verdict envelope', () => {
  let tmpRoot;

  function makeBareRoot() {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-verdict-'));
    fs.mkdirSync(path.join(tmpRoot, '.ctoc'), { recursive: true });
    for (const s of ['implementation', 'todo', 'done']) {
      fs.mkdirSync(path.join(tmpRoot, 'plans', s), { recursive: true });
    }
    return tmpRoot;
  }

  afterEach(() => {
    if (tmpRoot) {
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
      tmpRoot = null;
    }
  });

  /** Run one injected probe check through the real consumer, then restore CHECKS. */
  function runProbe(fn) {
    CHECKS.push({ id: 'contract-probe', scope: 'contract-probe', mode: 'fast', fn });
    try {
      return checkAllInvariants({ root: projectRoot, mode: 'fast', scopes: ['contract-probe'] });
    } finally {
      const i = CHECKS.findIndex(c => c.id === 'contract-probe');
      if (i !== -1) CHECKS.splice(i, 1);
    }
  }

  // Case 1 — iterates the registry, so a check added later is covered without
  // editing this case.
  it('(1) EVERY check returns a readable verdict object with a boolean `clean`', () => {
    const root = makeBareRoot();
    for (const check of CHECKS) {
      const r = check.fn(root);
      assert.equal(typeof r, 'object', `${check.id} returned ${typeof r}, not an object`);
      assert.notEqual(r, null, `${check.id} returned null — a clean answer must never be falsy`);
      assert.equal(typeof r.clean, 'boolean', `${check.id} has no boolean .clean (got ${JSON.stringify(r && r.clean)})`);
    }
  });

  // Case 2 — the exact crash the human hit, reproduced as an assertion.
  it('(2) a CLEAN verdict is truthy and readable — reading .severity does not throw', () => {
    const root = makeBareRoot();   // no plans anywhere ⇒ no gate-destination offender
    const r = checkGateDestinationsApproved(root);
    assert.notEqual(r, null, 'a clean check must not answer null');
    assert.equal(r.clean, true, 'a clean check reports clean: true');
    assert.doesNotThrow(() => { void r.severity; void r.message; },
      'a caller reading the verdict fields on a clean run must not throw');
    assert.equal(r.severity, undefined, 'a clean verdict carries no severity');
  });

  // Case 3 — the violating verdict is unchanged apart from the envelope.
  it('(3) a VIOLATING verdict still carries its severity, message and details', () => {
    const root = makeBareRoot();
    fs.writeFileSync(path.join(root, 'plans', 'todo', 'unapproved.md'),
      '---\ntitle: "unapproved"\ntype: feature\nfiles: ["src/x.js"]\n---\n\n# body');
    const r = checkGateDestinationsApproved(root);
    assert.equal(r.clean, false, 'a violation reports clean: false');
    assert.equal(r.severity, 'block');
    assert.match(r.message, /gate destinations/);
    assert.ok(r.details.offenders.some(o => o.plan.endsWith('unapproved.md')));
  });

  // Case 4 — the case that keeps this slice from becoming the defect it fixes.
  it('(4) a check returning UNDEFINED is recorded as an ERROR, never as a pass', () => {
    const result = runProbe(() => undefined);
    const f = result.findings.find(x => x.id === 'contract-probe');
    assert.ok(f, 'an unreadable verdict must produce a finding, not silence');
    assert.equal(f.severity, 'error');
    assert.match(f.message, /contract-probe|verdict/i);
    assert.equal(result.summary.error, 1, 'the run is NOT clean');
  });

  it('(5) a check returning NULL is recorded as an ERROR, never as a pass', () => {
    const result = runProbe(() => null);
    const f = result.findings.find(x => x.id === 'contract-probe');
    assert.ok(f, 'a null verdict must produce a finding — null is exactly the old falsy-clean bug');
    assert.equal(f.severity, 'error');
    assert.equal(result.summary.error, 1, 'the run is NOT clean');
  });

  it('(6) a THROWING check still records an error (behaviour unchanged)', () => {
    const result = runProbe(() => { throw new Error('boom'); });
    const f = result.findings.find(x => x.id === 'contract-probe');
    assert.ok(f, 'a throwing check must be recorded');
    assert.equal(f.severity, 'error');
    assert.match(f.message, /Check threw: boom/);
  });

  // Case 7 — the summary counts do not move. checkPlanCounts is clean AND
  // informational: its info finding must keep appearing in the report.
  it('(7) the summary counts are unchanged — plan-counts still reports exactly one info', () => {
    for (const mode of ['fast', 'thorough']) {
      const r = checkAllInvariants({ root: stableRepoRoot(), mode });
      assert.equal(r.summary.critical, 0, `${mode}: critical must stay 0`);
      assert.equal(r.summary.block, 0, `${mode}: block must stay 0`);
      assert.equal(r.summary.error, 0, `${mode}: error must stay 0`);
      assert.equal(r.summary.info, 1, `${mode}: exactly one info finding (plan-counts)`);
      const counts = r.findings.find(x => x.id === 'plan-counts');
      assert.ok(counts, `${mode}: the informational plan-counts finding must still be reported`);
      assert.equal(counts.severity, 'info');
      assert.match(counts.message, /^Plans: vision=/);
      assert.equal(counts.clean, undefined, 'the envelope flag must not leak into a finding');
    }
  });

  // Case 8 — the report text for a fixed finding set is byte-identical to the
  // text measured before the envelope change.
  it('(8) formatReport and formatCompact are byte-identical for a fixed finding set', () => {
    const fixed = {
      mode: 'fast',
      findings: [
        { scope: 'iron-loop', id: 'plans-files-declaration', severity: 'warn', message: '12 active plans missing files: declaration (not coverage-aware)' },
        { scope: 'info', id: 'plan-counts', severity: 'info', message: 'Plans: vision=3 · canvas=0 · functional=1' },
      ],
      summary: { critical: 0, block: 0, warn: 1, info: 1, error: 0, total: 2 },
    };
    assert.equal(formatReport(fixed), [
      '# CTOC Self-Check Report (fast mode)',
      '',
      'Summary: 0 critical · 0 block · 1 warn · 1 info',
      '',
      '## WARN (1)',
      '- [iron-loop/plans-files-declaration] 12 active plans missing files: declaration (not coverage-aware)',
      '',
      '## INFO (1)',
      '- [info/plan-counts] Plans: vision=3 · canvas=0 · functional=1',
      '',
      'OK: no critical or blocking issues.',
    ].join('\n'));
    assert.equal(formatCompact(fixed), 'Self-check: OK (1 warn)');
  });
});
