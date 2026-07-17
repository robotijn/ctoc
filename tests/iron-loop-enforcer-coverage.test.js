/**
 * iron-loop-enforcer — dark-branch coverage (v6.12.31)
 *
 * Companion to tests/iron-loop-enforcer.test.js. That file drives the live-repo
 * happy path and the gate-destination ledger logic. THIS file targets the branches
 * that file leaves dark — chosen so each test pins an ALLOW-vs-BLOCK (or which-
 * severity) decision that goes RED under mutation:
 *
 *   • findProjectRoot     — the upward walk, the `.claude-plugin` OR `.ctoc` disjunction,
 *                           and the "no marker → return start" terminus.
 *   • readFM              — missing-file sentinel, the heading-first `---` fallback
 *                           (line 110), and its CRLF normalization.
 *   • every architectural check's SEVERITY fork (critical vs warn vs block vs null)
 *     and the exact frontmatter condition that flips it.
 *   • the Tier-2 `continue` short-circuit (a tier-3 skill must NOT be flagged) and the
 *     Tier-3 scout else-if ORDER (only one reason reported).
 *   • fail-soft: a check that THROWS becomes an `error` finding, never a crash.
 *   • the two reachability fences returning a finding (dead file / dead export).
 *   • formatReport verbose second operand and formatCompact's critical/error guards.
 *
 * Fakes only at the true boundary (fs): every test builds a real temp project and
 * cleans it in afterEach/finally. The real module is loaded — nothing is mocked.
 *
 * AI-authored (Claude) and read line-by-line before commit; every assertion was
 * checked to go red against a trivially-wrong implementation of its target branch.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  checkAllInvariants,
  formatReport,
  formatCompact,
  findProjectRoot,
  readFM,
  TIER_1_AGENTS,
} = require('../src/lib/iron-loop-enforcer');

// ── shared temp-root plumbing ────────────────────────────────────────────────
let tmpRoot = null;
function mkTmp(prefix = 'ile-cov-') {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return tmpRoot;
}
function write(root, rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}
function findingById(root, id, opts) {
  const result = checkAllInvariants({ root, ...opts });
  return result.findings.find((f) => f.id === id);
}
afterEach(() => {
  if (tmpRoot) {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort temp cleanup */ }
    tmpRoot = null;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
describe('iron-loop-enforcer — findProjectRoot upward walk', () => {
  it('walks up to a .ctoc-marked ancestor from a nested start dir', () => {
    // Arrange — marker two levels above the start dir (exercises the loop body,
    // not just an immediate hit).
    const root = mkTmp();
    fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
    const start = path.join(root, 'a', 'b');
    fs.mkdirSync(start, { recursive: true });

    // Act
    const found = findProjectRoot(start);

    // Assert — the walk must climb to the marked root, not stop at `start`.
    assert.equal(found, root);
  });

  it('recognizes a .claude-plugin-only marker (first operand of the OR)', () => {
    // Arrange — ONLY .claude-plugin present, no .ctoc: pins the first ||-operand.
    const root = mkTmp();
    fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
    const start = path.join(root, 'nested');
    fs.mkdirSync(start, { recursive: true });

    // Act
    const found = findProjectRoot(start);

    // Assert
    assert.equal(found, root);
  });

  it('returns the start dir unchanged when no marker exists up to the fs root', () => {
    // Arrange — a temp tree with NO .ctoc / .claude-plugin anywhere upward.
    const root = mkTmp();
    const start = path.join(root, 'x', 'y', 'z');
    fs.mkdirSync(start, { recursive: true });

    // Act
    const found = findProjectRoot(start);

    // Assert — the terminus branch returns `start`, never a climbed dir.
    assert.equal(found, start);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('iron-loop-enforcer — readFM', () => {
  it('returns the missing sentinel for a non-existent file', () => {
    const root = mkTmp();

    const out = readFM(path.join(root, 'nope.md'));

    assert.deepEqual(out, { fm: '', body: '', missing: true });
  });

  it('captures a heading-first --- block when there is no line-1 frontmatter', () => {
    // Arrange — content opens with a heading, so parseFrontmatter reports NO
    // frontmatter and readFM must fall through to the line-110 regex fallback.
    const root = mkTmp();
    const p = write(root, 'doc.md', '# Title\n\nintro\n\n---\nrole: top-level-coordinator\n---\n\nrest');

    // Act
    const out = readFM(p);

    // Assert — the fallback capture must contain the block interior; a mutant that
    // returns '' (dropping the `m ? m[1] : ''` truthy arm) fails here.
    assert.match(out.fm, /role: top-level-coordinator/);
  });

  it('strips carriage returns from a CRLF heading-first block', () => {
    // Arrange — CRLF line endings around the heading-first block.
    const root = mkTmp();
    const p = write(root, 'crlf.md', '# Title\r\n\r\n---\r\nreports_to: cto-chief\r\n---\r\n');

    // Act
    const out = readFM(p);

    // Assert — the fallback's .replace(/\r/g,'') must have run.
    assert.ok(!out.fm.includes('\r'), 'fm must be \\r-free');
    assert.match(out.fm, /reports_to: cto-chief/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('iron-loop-enforcer — checkCtoChiefTopLevel severity fork', () => {
  const arch = { mode: 'fast', scopes: ['architecture'] };

  it('flags critical when the role line is absent', () => {
    // Arrange — file present, tier present, but NO role: top-level-coordinator.
    const root = mkTmp();
    write(root, 'agents/coordinator/cto-chief.md', '---\nname: cto-chief\ntier: 0\n---\nbody');

    // Act
    const f = findingById(root, 'cto-chief-top-level', arch);

    // Assert
    assert.ok(f, 'expected a cto-chief-top-level finding');
    assert.equal(f.severity, 'critical');
    assert.match(f.message, /MUST declare role: top-level-coordinator/);
  });

  it('flags only warn when role is present but tier: 0 is missing', () => {
    // Arrange — role present, tier line absent → the softer branch (164-165).
    const root = mkTmp();
    write(root, 'agents/coordinator/cto-chief.md', '---\nname: cto-chief\nrole: top-level-coordinator\n---\nbody');

    // Act
    const f = findingById(root, 'cto-chief-top-level', arch);

    // Assert — critical vs warn is the mutable decision; a mutant that returns
    // critical here (or null) fails.
    assert.ok(f, 'expected a cto-chief-top-level finding');
    assert.equal(f.severity, 'warn');
    assert.match(f.message, /should declare tier: 0/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('iron-loop-enforcer — checkSynthesizerExists severity fork', () => {
  const arch = { mode: 'fast', scopes: ['architecture'] };

  it('blocks when the synthesizer declares a tier other than 1', () => {
    // Arrange — has reports_to but the WRONG tier: the tier check fires first.
    const root = mkTmp();
    write(root, 'agents/coordinator/synthesizer.md',
      '---\nname: synthesizer\ntier: 2\nreports_to: cto-chief\n---\nbody');

    // Act
    const f = findingById(root, 'synthesizer-exists', arch);

    // Assert
    assert.ok(f, 'expected a synthesizer-exists finding');
    assert.equal(f.severity, 'block');
    assert.match(f.message, /must declare tier: 1/);
  });

  it('blocks when tier is 1 but reports_to: cto-chief is missing', () => {
    // Arrange — correct tier, missing reports_to → the SECOND block branch (198-199).
    const root = mkTmp();
    write(root, 'agents/coordinator/synthesizer.md',
      '---\nname: synthesizer\ntier: 1\n---\nbody');

    // Act
    const f = findingById(root, 'synthesizer-exists', arch);

    // Assert — the message distinguishes this from the tier branch above.
    assert.ok(f, 'expected a synthesizer-exists finding');
    assert.equal(f.severity, 'block');
    assert.match(f.message, /must declare reports_to: cto-chief/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('iron-loop-enforcer — checkTier1ReportsTo present-but-misconfigured', () => {
  it('names a present Tier-1 agent that lacks reports_to as a misconfigured offender', () => {
    // Arrange — write EVERY Tier-1 agent WITH reports_to, then blank it on exactly
    // one. This isolates the "present, missing reports_to" push (213-214) from the
    // "file missing" push, so the offender's issue is specifically the reports_to one.
    const root = mkTmp();
    const victim = TIER_1_AGENTS[0];
    for (const rel of TIER_1_AGENTS) {
      const body = rel === victim
        ? '---\nname: x\ntier: 1\n---\nbody'                       // present, no reports_to
        : '---\nname: x\ntier: 1\nreports_to: cto-chief\n---\nbody';
      write(root, rel, body);
    }

    // Act
    const f = findingById(root, 'tier-1-reports-to', { mode: 'fast', scopes: ['architecture'] });

    // Assert — exactly one offender, and it is the reports_to case (not "file missing").
    assert.ok(f, 'expected a tier-1-reports-to finding');
    assert.equal(f.severity, 'block');
    const off = f.details.missing.find((m) => m.agent === victim);
    assert.ok(off, `${victim} must be an offender`);
    assert.equal(off.issue, 'missing reports_to: cto-chief');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('iron-loop-enforcer — checkTier2NoSubagent continue short-circuit', () => {
  it('blocks a tier-2 skill missing max_subagents:0 but SKIPS a tier-3 skill', () => {
    // Arrange — a tier-2 skill missing the guard (an offender) and a tier-3 skill
    // ALSO missing it. The `continue` for non-tier-2 skills must exclude the tier-3
    // one; a mutant that drops the continue would wrongly flag it too.
    const root = mkTmp();
    write(root, 'skills/two/SKILL.md', '---\nname: two\ntier: 2\n---\nbody');            // offender
    write(root, 'skills/three/SKILL.md', '---\nname: three\ntier: 3\n---\nbody');        // must be skipped

    // Act
    const f = findingById(root, 'tier-2-no-subagent', { mode: 'thorough', scopes: ['architecture'] });

    // Assert
    assert.ok(f, 'expected a tier-2-no-subagent finding');
    assert.equal(f.severity, 'block');
    assert.ok(f.details.offenders.some((o) => o.includes(path.join('skills', 'two'))),
      'the tier-2 skill must be flagged');
    assert.ok(!f.details.offenders.some((o) => o.includes(path.join('skills', 'three'))),
      'the tier-3 skill must NOT be flagged (continue short-circuit)');
  });

  it('produces no finding when the only tier-2 skill declares max_subagents: 0', () => {
    // Arrange — a compliant tier-2 skill: the null-return (allow) path.
    const root = mkTmp();
    write(root, 'skills/ok/SKILL.md', '---\nname: ok\ntier: 2\nmax_subagents: 0\n---\nbody');

    // Act
    const f = findingById(root, 'tier-2-no-subagent', { mode: 'thorough', scopes: ['architecture'] });

    // Assert
    assert.equal(f, undefined, 'a compliant tier-2 skill must not be flagged');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETED by plan F3b (v6.12.79): describe('iron-loop-enforcer — checkTier3Scouts').
// Two assertions stood here, both contracting a check that no longer exists:
//   1. 'warns (not blocks) when fewer than five scouts exist' — asserted severity
//      'warn' and /Expected .*5 scouts, found 4/ from the count guard.
//   2. 'blocks and reports the FIRST failing rule (model) for a misconfigured scout'
//      — asserted severity 'block' and the offender 'bad.md: missing model: haiku',
//      pinning the else-if branch order.
// checkTier3Scouts and its CHECKS registry entry are deleted from
// src/lib/iron-loop-enforcer.js: the check demanded that agents/scouts/ exist and
// raised a CRITICAL when it did not, so it enforced the very false-green machine the
// owner ordered removed. There is no code left for these tests to exercise. The
// inverse invariant is fenced by tests/no-tier-3.test.js.

// ─────────────────────────────────────────────────────────────────────────────
describe('iron-loop-enforcer — checkActivePlanStepLabels', () => {
  const il = { mode: 'thorough', scopes: ['iron-loop'] };

  it('blocks a plan whose step heading uses a non-canonical label', () => {
    // Arrange — a todo plan with a step label that is not in CANONICAL_STEPS.
    const root = mkTmp();
    write(root, 'plans/todo/bad.md', '---\nfiles: ["*"]\n---\n\n## Step 8: BOGUSLABEL\n\ndo stuff');

    // Act
    const f = findingById(root, 'active-plan-step-labels', il);

    // Assert
    assert.ok(f, 'expected an active-plan-step-labels finding');
    assert.equal(f.severity, 'block');
    assert.ok(f.details.offenders.some((o) => o.label === 'BOGUSLABEL'),
      `BOGUSLABEL must be an offender: ${JSON.stringify(f.details.offenders)}`);
  });

  it('does NOT flag a plan whose step heading uses a canonical label', () => {
    // Arrange — a canonical label (IMPLEMENT) must produce no finding: the allow path.
    const root = mkTmp();
    write(root, 'plans/todo/good.md', '---\nfiles: ["*"]\n---\n\n## Step 10: IMPLEMENT\n\ndo stuff');

    // Act
    const f = findingById(root, 'active-plan-step-labels', il);

    // Assert
    assert.equal(f, undefined, 'a canonical step label must not be flagged');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('iron-loop-enforcer — checkStalePlans boundary', () => {
  const il = { mode: 'fast', scopes: ['iron-loop'] };

  it('warns for an in-progress plan whose mtime is older than the cutoff', () => {
    // Arrange — an in-progress plan aged 10 days (default cutoff is 7).
    const root = mkTmp();
    const p = write(root, 'plans/in-progress/old.md', '---\nfiles: ["*"]\n---\nbody');
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    fs.utimesSync(p, tenDaysAgo, tenDaysAgo);

    // Act
    const f = findingById(root, 'stale-plans', il);

    // Assert
    assert.ok(f, 'expected a stale-plans finding');
    assert.equal(f.severity, 'warn');
    assert.ok(f.details.stale.some((s) => s.plan.endsWith('old.md')), 'old.md must be listed');
  });

  it('does NOT warn for a freshly-touched in-progress plan', () => {
    // Arrange — a plan written now (mtime ≈ now) is inside the 7-day window; pins the
    // `mtimeMs < cutoff` boundary against a mutant that flips the comparison.
    const root = mkTmp();
    write(root, 'plans/in-progress/fresh.md', '---\nfiles: ["*"]\n---\nbody');

    // Act
    const f = findingById(root, 'stale-plans', il);

    // Assert
    assert.equal(f, undefined, 'a fresh plan must not be reported stale');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('iron-loop-enforcer — checkHooksJsonRegistration', () => {
  const sys = { mode: 'fast', scopes: ['system'] };

  it('flags critical when .claude-plugin/hooks.json is absent', () => {
    // Arrange — a project with no hooks.json at all.
    const root = mkTmp();
    fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });

    // Act
    const f = findingById(root, 'hooks-json-registration', sys);

    // Assert
    assert.ok(f, 'expected a hooks-json-registration finding');
    assert.equal(f.severity, 'critical');
    assert.match(f.message, /hooks\.json missing/);
  });

  it('flags critical and names the missing registration token when hooks.json is incomplete', () => {
    // Arrange — hooks.json present but missing the human-gate-check.js registration.
    const root = mkTmp();
    write(root, '.claude-plugin/hooks.json',
      JSON.stringify({ hooks: { SessionStart: [{ command: 'PreToolUse.Edit.js' }], PreToolUse: [] } }));

    // Act
    const f = findingById(root, 'hooks-json-registration', sys);

    // Assert — the specific missing token is surfaced.
    assert.ok(f, 'expected a hooks-json-registration finding');
    assert.equal(f.severity, 'critical');
    assert.match(f.message, /human-gate-check\.js/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('iron-loop-enforcer — checkVersionSync missing VERSION', () => {
  it('flags critical when the VERSION file is absent', () => {
    // Arrange — no VERSION file: the early critical branch (476-477), distinct from
    // the "out of sync" block branch the sibling suite already covers.
    const root = mkTmp();
    write(root, '.claude-plugin/plugin.json', JSON.stringify({ version: '1.2.3' }));

    // Act
    const f = findingById(root, 'version-sync', { mode: 'fast', scopes: ['system'] });

    // Assert
    assert.ok(f, 'expected a version-sync finding');
    assert.equal(f.severity, 'critical');
    assert.match(f.message, /VERSION file missing/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('iron-loop-enforcer — checkSaasTemplates', () => {
  const saas = { mode: 'fast', scopes: ['saas'] };

  it('warns when the SaaS template index is missing entirely', () => {
    const root = mkTmp();
    fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });

    const f = findingById(root, 'saas-templates', saas);

    assert.ok(f, 'expected a saas-templates finding');
    assert.equal(f.severity, 'warn');
    assert.match(f.message, /template index missing/);
  });

  it('warns and names the missing b2c file when the index exists but the template is incomplete', () => {
    // Arrange — index present, b2c dir present but missing production-readiness.yaml.
    const root = mkTmp();
    write(root, '.ctoc/templates/saas/index.yaml', 'templates: []\n');
    write(root, '.ctoc/templates/saas/b2c-subscription/README.md', '# readme');
    write(root, '.ctoc/templates/saas/b2c-subscription/manifest.yaml', 'x: 1');

    // Act
    const f = findingById(root, 'saas-templates', saas);

    // Assert — the incomplete-template branch (519-524), not the missing-index one.
    assert.ok(f, 'expected a saas-templates finding');
    assert.equal(f.severity, 'warn');
    assert.match(f.message, /production-readiness\.yaml/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('iron-loop-enforcer — checkBudgetConfigExists', () => {
  it('warns when .ctoc/config/budget.yaml is missing', () => {
    const root = mkTmp();
    fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });

    const f = findingById(root, 'budget-config-exists', { mode: 'fast', scopes: ['budget'] });

    assert.ok(f, 'expected a budget-config-exists finding');
    assert.equal(f.severity, 'warn');
    assert.match(f.message, /budget\.yaml — autonomous runs are unbounded/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('iron-loop-enforcer — checkProductLoop', () => {
  it('warns and names missing Product Loop artifacts', () => {
    const root = mkTmp();
    fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });

    const f = findingById(root, 'product-loop', { mode: 'fast', scopes: ['product'] });

    assert.ok(f, 'expected a product-loop finding');
    assert.equal(f.severity, 'warn');
    assert.match(f.message, /Product Loop artifacts missing/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('iron-loop-enforcer — reachability fences return a finding', () => {
  const arch = { mode: 'thorough', scopes: ['architecture'] };

  it('blocks when a src file is unreachable from every live root', () => {
    // Arrange — a sanctioned root (src/commands/menu.js) plus an orphan lib nobody
    // requires. The file fence must report the orphan.
    const root = mkTmp();
    write(root, 'src/commands/menu.js', 'module.exports = {};\n');
    write(root, 'src/lib/orphan.js', 'function dead() { return 1; }\nmodule.exports = { dead };\n');

    // Act
    const f = findingById(root, 'reachability-fence', arch);

    // Assert
    assert.ok(f, 'expected a reachability-fence finding');
    assert.equal(f.severity, 'block');
    assert.match(f.message, /src\/lib\/orphan\.js/);
    assert.match(f.message, /unreachable/);
  });

  it('blocks when a live module exports a name no live caller uses', () => {
    // Arrange — a live root that exports deadFn but never calls it, with no baseline
    // file to excuse it. The export fence must report menu.js#deadFn.
    const root = mkTmp();
    write(root, 'src/commands/menu.js',
      'function deadFn() { return 1; }\nmodule.exports = { deadFn };\n');

    // Act
    const f = findingById(root, 'dead-export-fence', arch);

    // Assert
    assert.ok(f, 'expected a dead-export-fence finding');
    assert.equal(f.severity, 'block');
    assert.match(f.message, /deadFn/);
    assert.match(f.message, /NEW dead export/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('iron-loop-enforcer — fault isolation (a throwing check becomes an error finding)', () => {
  it('reports severity: error instead of propagating when a check throws', () => {
    // Arrange — a plans/todo entry that is a DIRECTORY named *.md. listPlans keeps it
    // (ends with .md), then readFileSync on a directory throws EISDIR — a genuine,
    // no-monkeypatch fault inside checkActivePlanStepLabels. The checkAllInvariants
    // try/catch (687-688) must convert it to an `error` finding, not crash the run.
    const root = mkTmp();
    fs.mkdirSync(path.join(root, 'plans', 'todo', 'is-a-dir.md'), { recursive: true });

    // Act
    const result = checkAllInvariants({ root, mode: 'thorough', scopes: ['iron-loop'] });
    const f = result.findings.find((x) => x.id === 'active-plan-step-labels');

    // Assert — fault isolation: the finding exists, is severity error, and the summary
    // counts it. A mutant that removes the catch would throw and fail the test.
    // (Every plan-reading check in this scope hits the bogus directory, so error ≥ 1.)
    assert.ok(f, 'expected the throwing check to yield a finding');
    assert.equal(f.severity, 'error');
    assert.match(f.message, /Check threw:/);
    assert.ok(result.summary.error >= 1, `summary must count the error finding(s), got ${result.summary.error}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('iron-loop-enforcer — formatReport verbose details', () => {
  it('prints the details line only when CTOC_SELFCHECK_VERBOSE is set (second operand)', () => {
    // Arrange — a synthetic result carrying a finding WITH details.
    const result = {
      mode: 'fast',
      summary: { critical: 0, block: 0, warn: 1, info: 0 },
      findings: [{ scope: 'iron-loop', id: 'demo', severity: 'warn', message: 'a drift', details: { foo: 'bar' } }],
    };
    const prev = process.env.CTOC_SELFCHECK_VERBOSE;
    process.env.CTOC_SELFCHECK_VERBOSE = '1';

    try {
      // Act
      const report = formatReport(result);

      // Assert — the details JSON is emitted; the `f.details && env` conjunction is live.
      assert.match(report, /details: \{"foo":"bar"\}/);
    } finally {
      if (prev === undefined) delete process.env.CTOC_SELFCHECK_VERBOSE;
      else process.env.CTOC_SELFCHECK_VERBOSE = prev;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('iron-loop-enforcer — formatCompact critical/error guards', () => {
  it('lists critical findings and the self-check pointer when critical > 0', () => {
    // Arrange — a synthetic result with a critical finding.
    const result = {
      summary: { critical: 1, block: 0, warn: 2, info: 0, error: 0 },
      findings: [{ id: 'boom-check', severity: 'critical', message: 'the sky is falling' }],
    };

    // Act
    const compact = formatCompact(result);

    // Assert — the critical branch (746-753): header, the finding line, and the pointer.
    assert.match(compact, /1 CRITICAL/);
    assert.match(compact, /- \[boom-check\] the sky is falling/);
    assert.match(compact, /Run \/ctoc:self-check/);
  });

  it('does NOT report OK when there are error findings but zero critical/block', () => {
    // Arrange — the OK guard also requires summary.error === 0; a mutant dropping that
    // conjunct would wrongly print "OK" here.
    const result = {
      summary: { critical: 0, block: 0, warn: 0, info: 0, error: 1 },
      findings: [{ id: 'threw', severity: 'error', message: 'Check threw: boom' }],
    };

    // Act
    const compact = formatCompact(result);

    // Assert
    assert.ok(!/Self-check: OK/.test(compact), 'must not claim OK while an error finding exists');
  });
});
