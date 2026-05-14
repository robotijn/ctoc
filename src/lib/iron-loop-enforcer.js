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

const fs = require('fs');
const path = require('path');

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
  'agents/coordinator/persona-classifier.md',     // v8.3+
  'agents/planning/stack-chooser.md',             // v8.3+
  'agents/planning/unit-economics-modeler.md',    // v8.3+
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
  'src/lib/persona.js',
  'src/lib/v8-dispatcher.js',
];

// ─────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────

function findProjectRoot(start = process.cwd()) {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, '.claude-plugin')) || fs.existsSync(path.join(dir, '.ctoc'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

function readFM(filePath) {
  if (!fs.existsSync(filePath)) return { fm: '', body: '', missing: true };
  const content = fs.readFileSync(filePath, 'utf8');
  const m = content.match(/^---\n([\s\S]*?)\n---/m) ||
            content.match(/\n---\n([\s\S]*?)\n---/);
  return { fm: m ? m[1] : '', body: content };
}

function listAgents(root) {
  const out = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
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
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
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
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== '.gitkeep').map(f => path.join(dir, f));
}

// ─────────────────────────────────────────────────────────────────────
//  Architectural invariants (Tier 0/1/2/3)
// ─────────────────────────────────────────────────────────────────────

function checkCtoChiefTopLevel(root) {
  const p = path.join(root, 'agents/coordinator/cto-chief.md');
  if (!fs.existsSync(p)) {
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
    const content = fs.readFileSync(a, 'utf8');
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
  if (!fs.existsSync(p)) {
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
    if (!fs.existsSync(p)) {
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
  if (!fs.existsSync(scoutsDir)) {
    return { severity: 'critical', message: 'agents/scouts/ directory missing' };
  }
  const files = fs.readdirSync(scoutsDir).filter(f => f.endsWith('.md'));
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
      const content = fs.readFileSync(planPath, 'utf8');
      // Plans declare steps via "## Step N: LABEL" or "step: <num>" — scan both
      const stepHeadings = [...content.matchAll(/^##\s+Step\s+(\d+)[:\.\s]+([A-Z][A-Z-]+)/gm)];
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

function checkGateDestinationsApproved(root) {
  const offenders = [];
  for (const stage of GATE_DESTINATIONS) {
    for (const planPath of listPlans(root, stage)) {
      const content = fs.readFileSync(planPath, 'utf8');
      if (!content.includes('approved_by: human') && !content.includes('approved_by_human: true')) {
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
    const stat = fs.statSync(planPath);
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
  const missing = REQUIRED_HOOKS.filter(rel => !fs.existsSync(path.join(root, rel)));
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
  const missing = REQUIRED_LIBS.filter(rel => !fs.existsSync(path.join(root, rel)));
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
  if (!fs.existsSync(hooksJson)) {
    return { severity: 'critical', message: '.claude-plugin/hooks.json missing — no hooks registered' };
  }
  const content = fs.readFileSync(hooksJson, 'utf8');
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
  if (!fs.existsSync(versionPath)) {
    return { severity: 'critical', message: 'VERSION file missing' };
  }
  const version = fs.readFileSync(versionPath, 'utf8').trim();
  const pluginJson = path.join(root, '.claude-plugin/plugin.json');
  const marketplaceJson = path.join(root, '.claude-plugin/marketplace.json');
  const mismatches = [];

  if (fs.existsSync(pluginJson)) {
    try {
      const j = JSON.parse(fs.readFileSync(pluginJson, 'utf8'));
      if (j.version && j.version !== version) mismatches.push({ file: 'plugin.json', got: j.version, expected: version });
    } catch {}
  }
  if (fs.existsSync(marketplaceJson)) {
    try {
      const j = JSON.parse(fs.readFileSync(marketplaceJson, 'utf8'));
      const v = j?.plugins?.[0]?.version;
      if (v && v !== version) mismatches.push({ file: 'marketplace.json', got: v, expected: version });
    } catch {}
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
//  Persona system integrity
// ─────────────────────────────────────────────────────────────────────

function checkPersonaSystemExists(root) {
  const required = [
    'src/lib/persona.js',
    '.ctoc/templates/questions.yaml',
    'agents/coordinator/persona-classifier.md',
    'docs/PERSONA_ROUTING.md',
  ];
  const missing = required.filter(rel => !fs.existsSync(path.join(root, rel)));
  if (missing.length > 0) {
    return {
      severity: 'block',
      message: `Persona system files missing: ${missing.join(', ')}`,
      details: { missing },
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
//  SaaS template integrity
// ─────────────────────────────────────────────────────────────────────

function checkSaasTemplates(root) {
  const indexPath = path.join(root, '.ctoc/templates/saas/index.yaml');
  if (!fs.existsSync(indexPath)) {
    return { severity: 'warn', message: 'SaaS template index missing — autonomous SaaS build degraded' };
  }
  const b2c = path.join(root, '.ctoc/templates/saas/b2c-subscription');
  const required = ['README.md', 'manifest.yaml', 'production-readiness.yaml'];
  const missing = required.filter(f => !fs.existsSync(path.join(b2c, f)));
  if (missing.length > 0) {
    return {
      severity: 'warn',
      message: `b2c-subscription template incomplete: missing ${missing.join(', ')}`,
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
  { id: 'persona-system',              scope: 'persona',      mode: 'fast', fn: checkPersonaSystemExists },
  { id: 'saas-templates',              scope: 'saas',         mode: 'fast', fn: checkSaasTemplates },
  { id: 'plan-counts',                 scope: 'info',         mode: 'fast', fn: checkPlanCounts },
];

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
  // Constants
  CANONICAL_STEPS,
  GATE_DESTINATIONS,
  TIER_1_AGENTS,
  REQUIRED_HOOKS,
  REQUIRED_LIBS,
  CHECKS,
};
