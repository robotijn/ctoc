/**
 * Iron Loop self-enforcement (v8.4)
 *
 * Centralized invariant checks for CTOC. Called by:
 *   - src/hooks/SessionStart.js (fast mode, every session)
 *   - src/scripts/run-self-check.js (thorough mode, on-demand)
 *   - tests/iron-loop-enforcer.test.js
 *
 * Spec: docs/IRON_LOOP_ENFORCEMENT.md
 *
 * Invariants checked:
 *   Architectural (Tier 0/1/2/3 hierarchy)
 *   Iron Loop step labels + gate approval markers
 *   Plan health (frontmatter, files: declaration, stale plans)
 *   Persona system integrity
 *   SaaS template index integrity
 *   Hook registration (PreToolUse, SessionStart)
 *   VERSION sync across plugin JSON files
 *
 * Each check is a self-contained function returning { severity, message, details }
 * or null (no finding). Severities:
 *   critical = breaks the system (CTO Chief missing top-level marker)
 *   block    = unsafe state (gate destination without approved_by)
 *   warn     = drift (stale plan, version out of sync)
 *   info     = informational (plan counts)
 */

const safeFs = require('./safe-fs');
const path = require('path');
// W07-s4 (finding H1): shared CRLF-safe frontmatter reader — a plan checked out
// on Windows (CRLF) must self-check identically to its LF twin.
const { parseFrontmatter } = require('./frontmatter');

const CANONICAL_STEPS = [
  'IDEATE', 'ASSESS', 'ALIGN', 'CAPTURE',
  'PLAN', 'DESIGN', 'SPEC',
  'TEST', 'PREPARE', 'IMPLEMENT',
  'REVIEW', 'OPTIMIZE', 'SECURE', 'VERIFY', 'DOCUMENT', 'FINAL-REVIEW',
];

const GATE_DESTINATIONS = ['implementation', 'todo', 'done'];

const TIER_1_AGENTS = [
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
  'agents/planning/stack-chooser.md',
];

const REQUIRED_HOOKS = [
  'src/hooks/SessionStart.js',
  'src/hooks/PreToolUse.Edit.js',
  'src/hooks/PreToolUse.Write.js',
  'src/hooks/PreToolUse.MultiEdit.js',
  'src/hooks/PreToolUse.Bash.js',
  'src/hooks/human-gate-check.js',
  'src/hooks/validate-plan-steps.js',
];

const REQUIRED_LIBS = [
  'src/lib/state.js',
  'src/lib/actions.js',
  'src/lib/quality-gate.js',
  'src/lib/iron-loop.js',
  'src/lib/plan-validator.js',
  'src/lib/escape-phrases.js',
  'src/lib/v8-dispatcher.js',
  'src/lib/product-loop.js',     // v8.4+ Product Loop
];

// ─────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────

function findProjectRoot(start = process.cwd()) {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (safeFs.existsSync(path.join(dir, '.claude-plugin')) || safeFs.existsSync(path.join(dir, '.ctoc'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

// W07-s4 (finding H1): CRLF-safe. Line-1 frontmatter goes through the shared
// reader (which strips every \r from the interior); the heading-first case (a
// `---` block that is not at line 1) uses a CRLF-tolerant fallback whose capture
// is \r-normalized so a CRLF plan reads byte-identically to its LF twin.
function readFM(filePath) {
  if (!safeFs.existsSync(filePath)) return { fm: '', body: '', missing: true };
  const content = safeFs.readFileSync(filePath, 'utf8');
  const parsed = parseFrontmatter(content);
  if (parsed.hasFrontmatter) return { fm: parsed.raw, body: content };
  const m = content.match(/\r?\n---\r?\n([\s\S]*?)\r?\n---/);
  return { fm: m ? m[1].replace(/\r/g, '') : '', body: content };
}

function listAgents(root) {
  const out = [];
  function walk(d) {
    if (!safeFs.existsSync(d)) return;
    for (const entry of safeFs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) out.push(full);
    }
  }
  walk(path.join(root, 'agents'));
  return out;
}

function listSkills(root) {
  const out = [];
  function walk(d) {
    if (!safeFs.existsSync(d)) return;
    for (const entry of safeFs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'SKILL.md') out.push(full);
    }
  }
  walk(path.join(root, 'skills'));
  return out;
}

function listPlans(root, stage) {
  const dir = path.join(root, 'plans', stage);
  if (!safeFs.existsSync(dir)) return [];
  return safeFs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== '.gitkeep').map(f => path.join(dir, f));
}

// ─────────────────────────────────────────────────────────────────────
//  Architectural invariants (Tier 0/1/2/3)
// ─────────────────────────────────────────────────────────────────────

function checkCtoChiefTopLevel(root) {
  const p = path.join(root, 'agents/coordinator/cto-chief.md');
  if (!safeFs.existsSync(p)) {
    return { severity: 'critical', message: 'CTO Chief agent file missing at agents/coordinator/cto-chief.md' };
  }
  const { fm } = readFM(p);
  if (!/role:\s*top-level-coordinator/.test(fm)) {
    return { severity: 'critical', message: 'CTO Chief MUST declare role: top-level-coordinator' };
  }
  if (!/^tier:\s*0$/m.test(fm)) {
    return { severity: 'warn', message: 'CTO Chief should declare tier: 0' };
  }
  return null;
}

function checkOnlyOneTopLevel(root) {
  const offenders = [];
  for (const a of listAgents(root)) {
    if (a.endsWith('/cto-chief.md')) continue;
    const content = safeFs.readFileSync(a, 'utf8');
    if (/role:\s*top-level-coordinator/.test(content)) {
      offenders.push(path.relative(root, a));
    }
  }
  if (offenders.length > 0) {
    return {
      severity: 'critical',
      message: `Multiple agents declare role: top-level-coordinator: ${offenders.join(', ')}`,
      details: { offenders },
    };
  }
  return null;
}

function checkSynthesizerExists(root) {
  const p = path.join(root, 'agents/coordinator/synthesizer.md');
  if (!safeFs.existsSync(p)) {
    return { severity: 'critical', message: 'Synthesizer (cross-pillar Tier 1) missing at agents/coordinator/synthesizer.md' };
  }
  const { fm } = readFM(p);
  if (!/^tier:\s*1$/m.test(fm)) {
    return { severity: 'block', message: 'Synthesizer must declare tier: 1' };
  }
  if (!/reports_to:\s*cto-chief/.test(fm)) {
    return { severity: 'block', message: 'Synthesizer must declare reports_to: cto-chief' };
  }
  return null;
}

function checkTier1ReportsTo(root) {
  const missing = [];
  for (const rel of TIER_1_AGENTS) {
    const p = path.join(root, rel);
    if (!safeFs.existsSync(p)) {
      missing.push({ agent: rel, issue: 'file missing' });
      continue;
    }
    const { fm } = readFM(p);
    if (!/reports_to:\s*cto-chief/.test(fm)) {
      missing.push({ agent: rel, issue: 'missing reports_to: cto-chief' });
    }
  }
  if (missing.length > 0) {
    return {
      severity: 'block',
      message: `${missing.length} Tier 1 agents missing or misconfigured`,
      details: { missing },
    };
  }
  return null;
}

function checkTier2NoSubagent(root) {
  const offenders = [];
  for (const skill of listSkills(root)) {
    const { fm } = readFM(skill);
    if (!/^tier:\s*2$/m.test(fm)) continue;  // not a Tier 2 skill, skip
    if (!/max_subagents:\s*0/.test(fm)) {
      offenders.push(path.relative(root, skill));
    }
  }
  if (offenders.length > 0) {
    return {
      severity: 'block',
      message: `${offenders.length} Tier 2 skills missing max_subagents: 0`,
      details: { offenders: offenders.slice(0, 5) },
    };
  }
  return null;
}

function checkTier3Scouts(root) {
  const scoutsDir = path.join(root, 'agents/scouts');
  if (!safeFs.existsSync(scoutsDir)) {
    return { severity: 'critical', message: 'agents/scouts/ directory missing' };
  }
  const files = safeFs.readdirSync(scoutsDir).filter(f => f.endsWith('.md'));
  if (files.length < 5) {
    return { severity: 'warn', message: `Expected ≥5 scouts, found ${files.length}` };
  }
  const offenders = [];
  for (const f of files) {
    const { fm } = readFM(path.join(scoutsDir, f));
    if (!/^tier:\s*3$/m.test(fm)) offenders.push(`${f}: missing tier: 3`);
    else if (!/^model:\s*haiku$/m.test(fm)) offenders.push(`${f}: missing model: haiku`);
    else if (!/reports_to:\s*cto-chief/.test(fm)) offenders.push(`${f}: missing reports_to: cto-chief`);
    else if (!/max_subagents:\s*0/.test(fm)) offenders.push(`${f}: missing max_subagents: 0`);
  }
  if (offenders.length > 0) {
    return {
      severity: 'block',
      message: `${offenders.length} scouts misconfigured`,
      details: { offenders },
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
//  Iron Loop invariants
// ─────────────────────────────────────────────────────────────────────

function checkActivePlanStepLabels(root) {
  const offenders = [];
  for (const stage of ['todo', 'implementation', 'review']) {
    for (const planPath of listPlans(root, stage)) {
      const content = safeFs.readFileSync(planPath, 'utf8');
      // Plans declare steps via "## Step N: LABEL" or "step: <num>" — scan both
      const stepHeadings = [...content.matchAll(/^##\s+Step\s+(\d+)[:.\s]+([A-Z][A-Z-]+)/gm)];
      for (const m of stepHeadings) {
        const stepNum = parseInt(m[1], 10);
        const label = m[2].trim();
        // Step indexing: in v6+ canonical, ASSESS=2, ALIGN=3, ..., FINAL-REVIEW=16
        // But the plan may use 1-9 numbering for the impl-phase subset. Accept any canonical label.
        if (!CANONICAL_STEPS.includes(label)) {
          offenders.push({ plan: path.relative(root, planPath), step: stepNum, label, expected: CANONICAL_STEPS });
        }
      }
    }
  }
  if (offenders.length > 0) {
    return {
      severity: 'block',
      message: `${offenders.length} non-canonical step labels in active plans`,
      details: { offenders: offenders.slice(0, 5) },
    };
  }
  return null;
}

// Extract the leading frontmatter region — the one or more consecutive `---`
// delimited blocks at the top of a plan. Handles the Gate-1 prepended-marker-block
// form, where the approval block (`approved_by: human`) is prepended ABOVE the plan's
// own frontmatter, so the file opens with two consecutive `---` blocks. Implemented as
// a linear line scan (no backtracking regex) so it is ReDoS-safe by construction.
// Returns '' if the file has no leading frontmatter.
function frontmatterRegion(content) {
  const lines = content.split(/\r?\n/);
  const region = [];
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') region.push(lines[i++]);  // leading blanks
  while (i < lines.length && lines[i].trim() === '---') {
    region.push(lines[i++]);                                                    // opening ---
    while (i < lines.length && lines[i].trim() !== '---') region.push(lines[i++]);
    if (i < lines.length) region.push(lines[i++]);                              // closing ---
    while (i < lines.length && lines[i].trim() === '') region.push(lines[i++]); // inter-block blanks
  }
  return region.join('\n');
}

function checkGateDestinationsApproved(root) {
  const offenders = [];
  for (const stage of GATE_DESTINATIONS) {
    for (const planPath of listPlans(root, stage)) {
      const content = safeFs.readFileSync(planPath, 'utf8');
      const fm = frontmatterRegion(content);

      // Pre-Gate-2 SIP1 slices live UNMARKED in implementation/ awaiting *batch*
      // approval at Gate 2 (approveSubplans). They carry parent_plan: and are
      // legitimately unmarked — exempt them. This is H7's second home: the loose
      // substring check used to flag all such slices as block-severity. The REAL
      // gate is enforced by human-gate-check.js's ledger (W02-s3); this enforcer is
      // an ADVISORY self-check, so the exemption opens no gate hole.
      if (stage === 'implementation' && /^parent_plan:/m.test(fm)) continue;

      // Decomposed visions are archived to done/ (type: vision, status: decomposed);
      // they cross Gate 0 in vision/, never the review→done code gate, and carry no
      // approval marker. Exempt them so an incidental `approved_by: human` phrase in
      // their prose body is neither required nor mistaken for an approval.
      if (/^type:\s*vision\b/m.test(fm)) continue;

      // Detect the approval marker in the FRONTMATTER region only — a raw substring
      // scan false-passes on prose body text that merely discusses the marker.
      const approved = /^approved_by:\s*human\b/m.test(fm) ||
                       /^approved_by_human:\s*true\b/m.test(fm);
      if (!approved) {
        offenders.push({ plan: path.relative(root, planPath), stage });
      }
    }
  }
  if (offenders.length > 0) {
    return {
      severity: 'block',
      message: `${offenders.length} plans in gate destinations missing approved_by: human marker`,
      details: { offenders: offenders.slice(0, 5) },
    };
  }
  return null;
}

function checkStalePlans(root, days = 7) {
  const stale = [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  for (const planPath of listPlans(root, 'in-progress')) {
    const stat = safeFs.statSync(planPath);
    if (stat.mtimeMs < cutoff) {
      stale.push({ plan: path.relative(root, planPath), age_days: Math.floor((Date.now() - stat.mtimeMs) / (24 * 60 * 60 * 1000)) });
    }
  }
  if (stale.length > 0) {
    return {
      severity: 'warn',
      message: `${stale.length} plans stale (in-progress > ${days} days without activity)`,
      details: { stale: stale.slice(0, 5) },
    };
  }
  return null;
}

function checkPlansHaveFilesDeclaration(root) {
  const missing = [];
  for (const stage of ['todo', 'in-progress', 'implementation']) {
    for (const planPath of listPlans(root, stage)) {
      const { fm } = readFM(planPath);
      if (!/^files:/m.test(fm)) {
        missing.push({ plan: path.relative(root, planPath), stage });
      }
    }
  }
  if (missing.length > 0) {
    return {
      severity: 'warn',
      message: `${missing.length} active plans missing files: declaration (not coverage-aware)`,
      details: { missing: missing.slice(0, 5) },
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
//  System integrity (hooks, libs, JSON sync)
// ─────────────────────────────────────────────────────────────────────

function checkRequiredHooks(root) {
  const missing = REQUIRED_HOOKS.filter(rel => !safeFs.existsSync(path.join(root, rel)));
  if (missing.length > 0) {
    return {
      severity: 'critical',
      message: `${missing.length} required hook file(s) missing — Iron Loop enforcement DEGRADED`,
      details: { missing },
    };
  }
  return null;
}

function checkRequiredLibs(root) {
  const missing = REQUIRED_LIBS.filter(rel => !safeFs.existsSync(path.join(root, rel)));
  if (missing.length > 0) {
    return {
      severity: 'critical',
      message: `${missing.length} required lib file(s) missing`,
      details: { missing },
    };
  }
  return null;
}

function checkHooksJsonRegistration(root) {
  const hooksJson = path.join(root, '.claude-plugin/hooks.json');
  if (!safeFs.existsSync(hooksJson)) {
    return { severity: 'critical', message: '.claude-plugin/hooks.json missing — no hooks registered' };
  }
  const content = safeFs.readFileSync(hooksJson, 'utf8');
  const required = ['SessionStart', 'PreToolUse', 'PreToolUse.Edit.js', 'human-gate-check.js'];
  const missing = required.filter(s => !content.includes(s));
  if (missing.length > 0) {
    return {
      severity: 'critical',
      message: `hooks.json missing registration for: ${missing.join(', ')}`,
      details: { missing },
    };
  }
  return null;
}

function checkVersionSync(root) {
  const versionPath = path.join(root, 'VERSION');
  if (!safeFs.existsSync(versionPath)) {
    return { severity: 'critical', message: 'VERSION file missing' };
  }
  const version = safeFs.readFileSync(versionPath, 'utf8').trim();
  const pluginJson = path.join(root, '.claude-plugin/plugin.json');
  const marketplaceJson = path.join(root, '.claude-plugin/marketplace.json');
  const mismatches = [];

  if (safeFs.existsSync(pluginJson)) {
    try {
      const j = JSON.parse(safeFs.readFileSync(pluginJson, 'utf8'));
      if (j.version && j.version !== version) mismatches.push({ file: 'plugin.json', got: j.version, expected: version });
    } catch { /* ignore: unreadable/invalid plugin.json is reported by other checks */ }
  }
  if (safeFs.existsSync(marketplaceJson)) {
    try {
      const j = JSON.parse(safeFs.readFileSync(marketplaceJson, 'utf8'));
      const v = j?.plugins?.[0]?.version;
      if (v && v !== version) mismatches.push({ file: 'marketplace.json', got: v, expected: version });
    } catch { /* ignore: unreadable/invalid marketplace.json is reported by other checks */ }
  }
  if (mismatches.length > 0) {
    return {
      severity: 'block',
      message: `VERSION (${version}) out of sync with plugin JSON files. Run: node src/scripts/release.js`,
      details: { mismatches },
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
//  SaaS template integrity
// ─────────────────────────────────────────────────────────────────────

function checkSaasTemplates(root) {
  const indexPath = path.join(root, '.ctoc/templates/saas/index.yaml');
  if (!safeFs.existsSync(indexPath)) {
    return { severity: 'warn', message: 'SaaS template index missing — autonomous SaaS build degraded' };
  }
  const b2c = path.join(root, '.ctoc/templates/saas/b2c-subscription');
  const required = ['README.md', 'manifest.yaml', 'production-readiness.yaml'];
  const missing = required.filter(f => !safeFs.existsSync(path.join(b2c, f)));
  if (missing.length > 0) {
    return {
      severity: 'warn',
      message: `b2c-subscription template incomplete: missing ${missing.join(', ')}`,
      details: { missing },
    };
  }
  return null;
}

function checkBudgetConfigExists(root) {
  const p = path.join(root, '.ctoc', 'config', 'budget.yaml');
  if (!safeFs.existsSync(p)) {
    return {
      severity: 'warn',
      message: 'Session-level build budget config missing at .ctoc/config/budget.yaml — autonomous runs are unbounded',
      details: { suggested: 'Copy from .ctoc/config/budget.yaml in the CTOC repo, or run /ctoc:budget to generate.' },
    };
  }
  return null;
}

function checkProductLoop(root) {
  const required = [
    'docs/PRODUCT_LOOP.md',
    '.ctoc/templates/product-kpis.yaml',
    'agents/planning/kpi-planner.md',
    'skills/product/product-reviewer/SKILL.md',
    'skills/product/experiment-designer/SKILL.md',
    'src/lib/product-loop.js',
  ];
  const missing = required.filter(rel => !safeFs.existsSync(path.join(root, rel)));
  if (missing.length > 0) {
    return {
      severity: 'warn',
      message: `Product Loop artifacts missing: ${missing.join(', ')}`,
      details: { missing },
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
//  Plan statistics (info-only)
// ─────────────────────────────────────────────────────────────────────

function checkPlanCounts(root) {
  const counts = {};
  for (const stage of ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done']) {
    counts[stage] = listPlans(root, stage).length;
  }
  return {
    severity: 'info',
    message: `Plans: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' · ')}`,
    details: counts,
  };
}

// ─────────────────────────────────────────────────────────────────────
//  The registry — each check has an id, scope, and mode
// ─────────────────────────────────────────────────────────────────────

const CHECKS = [
  { id: 'cto-chief-top-level',         scope: 'architecture', mode: 'fast', fn: checkCtoChiefTopLevel },
  { id: 'only-one-top-level',          scope: 'architecture', mode: 'fast', fn: checkOnlyOneTopLevel },
  { id: 'synthesizer-exists',          scope: 'architecture', mode: 'fast', fn: checkSynthesizerExists },
  { id: 'tier-1-reports-to',           scope: 'architecture', mode: 'fast', fn: checkTier1ReportsTo },
  { id: 'tier-2-no-subagent',          scope: 'architecture', mode: 'thorough', fn: checkTier2NoSubagent },
  { id: 'tier-3-scouts',               scope: 'architecture', mode: 'fast', fn: checkTier3Scouts },
  { id: 'active-plan-step-labels',     scope: 'iron-loop',    mode: 'thorough', fn: checkActivePlanStepLabels },
  { id: 'gate-destinations-approved',  scope: 'iron-loop',    mode: 'fast', fn: checkGateDestinationsApproved },
  { id: 'stale-plans',                 scope: 'iron-loop',    mode: 'fast', fn: checkStalePlans },
  { id: 'plans-files-declaration',     scope: 'iron-loop',    mode: 'fast', fn: checkPlansHaveFilesDeclaration },
  { id: 'required-hooks',              scope: 'system',       mode: 'fast', fn: checkRequiredHooks },
  { id: 'required-libs',               scope: 'system',       mode: 'fast', fn: checkRequiredLibs },
  { id: 'hooks-json-registration',     scope: 'system',       mode: 'fast', fn: checkHooksJsonRegistration },
  { id: 'version-sync',                scope: 'system',       mode: 'fast', fn: checkVersionSync },
  { id: 'saas-templates',              scope: 'saas',         mode: 'fast', fn: checkSaasTemplates },
  { id: 'budget-config-exists',        scope: 'budget',       mode: 'fast', fn: checkBudgetConfigExists },
  { id: 'product-loop',                scope: 'product',      mode: 'fast', fn: checkProductLoop },
  { id: 'plan-counts',                 scope: 'info',         mode: 'fast', fn: checkPlanCounts },
  { id: 'reachability-fence',          scope: 'architecture', mode: 'thorough', fn: checkReachabilityFence },
];

/**
 * Dead-code fence invariant (2026-07-14 root cause): every src file must be
 * reachable from a live root — a test is a caller, so "module + its own test"
 * proves nothing. The ratchet lives in tests/reachability.test.js; this check
 * surfaces the same truth through the self-check so a human can ask for it
 * on demand. Thorough mode only (walks the whole src tree).
 */
function checkReachabilityFence(root) {
  const { analyze } = require('./reachability');
  const result = analyze(root);
  if (result.total === 0) return null; // not a CTOC source tree — nothing to check
  if (result.unreachable.length === 0) return null;
  return {
    severity: 'block',
    message: `${result.unreachable.length} source file(s) unreachable from every live root (dead on arrival): ${result.unreachable.join(', ')} — wire each to a live root or delete it; a module is not done when its test passes, it is done when a human can reach it`
  };
}

// ─────────────────────────────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────────────────────────────

/**
 * Run all invariant checks against the project at `root`.
 * @param {Object} opts
 * @param {string} opts.root - Project root (auto-detected if omitted)
 * @param {'fast'|'thorough'} opts.mode - Fast skips expensive checks; thorough runs everything
 * @param {string[]} opts.scopes - Limit to scopes (e.g. ['architecture','iron-loop'])
 * @returns {Object} { findings: [...], summary: {critical, block, warn, info, total}, mode }
 */
function checkAllInvariants(opts = {}) {
  const root = opts.root || findProjectRoot();
  const mode = opts.mode || 'fast';
  const scopes = opts.scopes;
  const findings = [];

  for (const check of CHECKS) {
    if (mode === 'fast' && check.mode === 'thorough') continue;
    if (scopes && !scopes.includes(check.scope)) continue;
    try {
      const finding = check.fn(root);
      if (finding) findings.push({ id: check.id, scope: check.scope, ...finding });
    } catch (err) {
      findings.push({ id: check.id, scope: check.scope, severity: 'error', message: `Check threw: ${err.message}` });
    }
  }

  const summary = {
    critical: findings.filter(f => f.severity === 'critical').length,
    block: findings.filter(f => f.severity === 'block').length,
    warn: findings.filter(f => f.severity === 'warn').length,
    info: findings.filter(f => f.severity === 'info').length,
    error: findings.filter(f => f.severity === 'error').length,
    total: findings.length,
  };

  return { findings, summary, mode, root };
}

/**
 * Format findings as a human-readable report.
 */
function formatReport({ findings, summary, mode }) {
  const lines = [];
  lines.push(`# CTOC Self-Check Report (${mode} mode)`);
  lines.push('');
  lines.push(`Summary: ${summary.critical} critical · ${summary.block} block · ${summary.warn} warn · ${summary.info} info`);
  lines.push('');

  const groups = {
    critical: findings.filter(f => f.severity === 'critical'),
    block: findings.filter(f => f.severity === 'block'),
    warn: findings.filter(f => f.severity === 'warn'),
    info: findings.filter(f => f.severity === 'info'),
  };

  for (const [sev, items] of Object.entries(groups)) {
    if (items.length === 0) continue;
    lines.push(`## ${sev.toUpperCase()} (${items.length})`);
    for (const f of items) {
      lines.push(`- [${f.scope}/${f.id}] ${f.message}`);
      if (f.details && process.env.CTOC_SELFCHECK_VERBOSE) {
        lines.push(`    details: ${JSON.stringify(f.details).slice(0, 200)}`);
      }
    }
    lines.push('');
  }

  if (summary.critical === 0 && summary.block === 0) {
    lines.push('OK: no critical or blocking issues.');
  }

  return lines.join('\n');
}

/**
 * Compact format for SessionStart hook (one-line summary + critical findings).
 */
function formatCompact({ findings, summary }) {
  if (summary.critical === 0 && summary.block === 0 && summary.error === 0) {
    return `Self-check: OK${summary.warn > 0 ? ` (${summary.warn} warn)` : ''}`;
  }
  const lines = [`Self-check: ${summary.critical} CRITICAL · ${summary.block} BLOCK · ${summary.warn} warn`];
  for (const f of findings.filter(x => x.severity === 'critical' || x.severity === 'block')) {
    lines.push(`  - [${f.id}] ${f.message}`);
  }
  if (summary.critical > 0 || summary.block > 0) {
    lines.push(`Run /ctoc:self-check for the full report.`);
  }
  return lines.join('\n');
}

module.exports = {
  checkAllInvariants,
  formatReport,
  formatCompact,
  findProjectRoot,
  readFM,
  // Constants
  CANONICAL_STEPS,
  GATE_DESTINATIONS,
  TIER_1_AGENTS,
  REQUIRED_HOOKS,
  REQUIRED_LIBS,
  CHECKS,
};
