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
 * Each check is a self-contained function returning a VERDICT — see the CLEAN /
 * finding helpers below. Severities:
 *   critical = breaks the system (CTO Chief missing top-level marker)
 *   block    = unsafe state (gate destination without approved_by)
 *   warn     = drift (stale plan, version out of sync)
 *   info     = informational (plan counts)
 */

const safeFs = require('./safe-fs');
const path = require('path');
const { describeProjectRoot } = require('./project-root');
// W07-s4 (finding H1): shared CRLF-safe frontmatter reader — a plan checked out
// on Windows (CRLF) must self-check identically to its LF twin.
const { parseFrontmatter } = require('./frontmatter');

const CANONICAL_STEPS = [
  'IDEATE', 'ASSESS', 'ALIGN', 'CAPTURE',
  'PLAN', 'DESIGN', 'SPEC',
  'TEST', 'PREPARE', 'IMPLEMENT',
  'REVIEW', 'OPTIMIZE', 'SECURE', 'VERIFY', 'DOCUMENT', 'FINAL-REVIEW',
];

// R5-B: the gate destinations derive from gate-order (the ONE gate-edge encoding),
// so this and actions.js can never diverge from GATE_EDGES. Equals
// ['implementation', 'todo', 'done'] — the `to` side of each human gate edge.
const { GATE_DESTINATIONS } = require('./gate-order');

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
//  The verdict envelope — a clean answer you can READ
// ─────────────────────────────────────────────────────────────────────

/**
 * THE RULE: a check reports a VERDICT, and a clean verdict is an object you can
 * read — never a falsy value that crashes the reader who asks it a question.
 *
 * The original crash (2026-07-19): every check in this module returned `null` to
 * mean "clean" and an object to mean "violation". `checkGateDestinationsApproved`
 * is exported, so a caller outside this module wrote `result.severity` and got a
 * TypeError ON SUCCESS — a crash that read like a failure when the real answer was
 * "no violation". The falsy success value is indistinguishable from an absent
 * answer, which is this repository's central defect class wearing a small coat.
 *
 * So: `CLEAN()` for no finding, `finding({ severity, message, details })` for one.
 * Every check returns `{ clean: true }` or `{ clean: false, severity, message, … }`.
 * One check — `checkPlanCounts` — is clean AND informational: it reports counts,
 * not problems, so it returns `{ clean: true, severity: 'info', message, details }`
 * and the consumer records any verdict that carries a message.
 *
 * AND: a check that returns anything WITHOUT a boolean `clean` — `null`,
 * `undefined`, a bare string — is recorded by `checkAllInvariants` as an
 * `error`-severity finding naming the check id, exactly as a check that throws is.
 * It is NOT treated as clean. Treating an unreadable answer as a pass would
 * replace "a clean answer that crashes its reader" with "a broken check that reads
 * as clean", which is strictly worse than the defect this envelope fixes.
 *
 * A FRESH object per call, never a shared frozen singleton: a singleton is one
 * careless spread away from a consumer mutating every other check's verdict, and
 * twenty small allocations per run costs nothing against checks that read the disk.
 */
function CLEAN() {
  return { clean: true };
}

/**
 * Wrap a check's own `{ severity, message, details }` payload in the not-clean
 * envelope. The severity, the message text and the details belong to the check and
 * pass through untouched — this helper is the ONE place `clean: false` is written,
 * so no check can invent a third shape.
 * @param {{severity: 'critical'|'block'|'warn'|'info', message: string, details?: Object}} payload
 * @returns {{clean: false, severity: string, message: string, details?: Object}}
 */
function finding(payload) {
  return { clean: false, ...payload };
}

// ─────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Resolve the project root by delegating to the ONE shared resolver.
 *
 * This MUST NOT be re-implemented as a private ancestry walk. A private copy that
 * accepts a BARE `.ctoc` over-roots from any project beneath $HOME to the crypto home
 * `~/.ctoc`, so enforcement scans run against the wrong tree — and a gate that scans
 * nothing reports clean, the false-green shape this repository fences by name. The
 * shared resolver requires a genuine PROJECT `.ctoc` and fixed exactly this — see
 * src/lib/project-root.js:87-94 (plan 00178). Same name, arity, and STRING return.
 *
 * @param {string} [start=process.cwd()] - Directory to start searching from
 * @returns {string} Project root path (never null, never an object)
 */
function findProjectRoot(start = process.cwd()) {
  return describeProjectRoot(start).root;
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
    return finding({ severity: 'critical', message: 'CTO Chief agent file missing at agents/coordinator/cto-chief.md' });
  }
  const { fm } = readFM(p);
  if (!/role:\s*top-level-coordinator/.test(fm)) {
    return finding({ severity: 'critical', message: 'CTO Chief MUST declare role: top-level-coordinator' });
  }
  if (!/^tier:\s*0$/m.test(fm)) {
    return finding({ severity: 'warn', message: 'CTO Chief should declare tier: 0' });
  }
  return CLEAN();
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
    return finding({
      severity: 'critical',
      message: `Multiple agents declare role: top-level-coordinator: ${offenders.join(', ')}`,
      details: { offenders },
    });
  }
  return CLEAN();
}

function checkSynthesizerExists(root) {
  const p = path.join(root, 'agents/coordinator/synthesizer.md');
  if (!safeFs.existsSync(p)) {
    return finding({ severity: 'critical', message: 'Synthesizer (cross-pillar Tier 1) missing at agents/coordinator/synthesizer.md' });
  }
  const { fm } = readFM(p);
  if (!/^tier:\s*1$/m.test(fm)) {
    return finding({ severity: 'block', message: 'Synthesizer must declare tier: 1' });
  }
  if (!/reports_to:\s*cto-chief/.test(fm)) {
    return finding({ severity: 'block', message: 'Synthesizer must declare reports_to: cto-chief' });
  }
  return CLEAN();
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
    return finding({
      severity: 'block',
      message: `${missing.length} Tier 1 agents missing or misconfigured`,
      details: { missing },
    });
  }
  return CLEAN();
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
    return finding({
      severity: 'block',
      message: `${offenders.length} Tier 2 skills missing max_subagents: 0`,
      details: { offenders: offenders.slice(0, 5) },
    });
  }
  return CLEAN();
}

// DELETED by plan F3b (v6.12.79): checkTier3Scouts.
//
// It required agents/scouts/ to exist and each scout to declare tier: 3 +
// model: haiku, returning severity 'critical' when the directory was missing.
// With Tier 3 deleted on the owner's ruling, this check made CTOC's own
// self-check report a CRITICAL against the deletion the owner ordered — an
// enforcer demanding the false-green machine it was supposed to catch.
//
// The INVERSE is now fenced by tests/no-tier-3.test.js: the directory must NOT
// exist, no agent may declare model: haiku, and no agent may declare
// short_circuits:. Its registry entry in CHECKS is removed with it.

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
    return finding({
      severity: 'block',
      message: `${offenders.length} non-canonical step labels in active plans`,
      details: { offenders: offenders.slice(0, 5) },
    });
  }
  return CLEAN();
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

/**
 * Are all plans resident in a gate destination actually approved into it?
 *
 * "Approved" means the APPROVAL LEDGER says so — identical acceptance to the runtime
 * hook (`human-gate-check.hasLedgerApproval`), never the plan's own forgeable
 * frontmatter marker (R3-C). Exported so the invariant is directly testable against
 * a temp root.
 *
 * @param {string} root - project root
 * @returns {{clean: boolean, severity?: string, message?: string, details?: object}} a
 *   not-clean block-severity verdict, or { clean: true } when every gate-destination
 *   plan is ledger-approved. NEVER null — a clean answer must be readable.
 */
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

      // R5-B: the DUPLICATE `type: vision` exemption is GONE — it mirrored the hole
      // the runtime hook (human-gate-check.js) already closed in R3-A. A `type: vision`
      // frontmatter line is FORGEABLE (plans/**.md is Edit-whitelisted), so exempting
      // it let any agent squat done/ with one line and zero provenance. Residency is
      // now UNIFORMLY ledger-driven for BOTH systems: a decomposed vision archived to
      // done/ earns its residency with a PIPELINE-kind ledger entry
      // (approval-ledger.writeVisionArchiveEntry, evidence: 'vision-decomposed'),
      // accepted below by the SAME `hasLedgerApproval` the hook uses. The two systems
      // now agree on "is the repo clean."

      // R3-C: the enforcer no longer trusts the plan's own frontmatter. A marker in
      // a file is FORGEABLE — anything that can write the plan can write
      // `approved_by: human`, and the old check also accepted `approved_by_human:
      // true`, a form NO writer in the codebase produces. Meanwhile the runtime hook
      // (human-gate-check.js) decides residency from the APPROVAL LEDGER. Two systems
      // disagreeing about whether the repo is clean is worse than either being wrong:
      // the self-check would report OK on plans the hook was about to revert.
      //
      // Acceptance is now the hook's own predicate — one definition of "approved",
      // used by both. The stage/vision/SIP1 exemptions above still apply.
      //
      // Classify (not boolean-test), so the message names the REAL cause per offender.
      // The old boolean facade discarded the reason `classifyResidency` already
      // computes, collapsing every distinct cause — a missing entry, a wrong edge, a
      // moved specification hash from an appended section — into one sentence about
      // `approved_by: human`. That message alleges a FORGED approval on an offender
      // whose text merely gained a heading the deny-list does not know, and cost a full
      // gate run chasing the wrong diagnosis. The reason exists one call away.
      const { classifyResidency } = require('../hooks/human-gate-check');
      const verdict = classifyResidency(planPath, stage, root, content);
      if (!verdict.accepted) {
        offenders.push({
          plan: path.relative(root, planPath),
          stage,
          reason: verdict.reason,
          sections: verdict.sections || [],
        });
      }
    }
  }
  if (offenders.length > 0) {
    return finding({
      severity: 'block',
      message: `${offenders.length} plans in gate destinations are not approved into them: ${describeGateOffenders(offenders)}`,
      details: { offenders: offenders.slice(0, 5) },
    });
  }
  return CLEAN();
}

/**
 * Build the gate-destination finding message from the reasons ACTUALLY present, so it
 * never asserts a cause it did not measure. Each clause is emitted only when at least
 * one offender carries a reason in its category:
 *   - a MISSING or unrecognised approval keeps the `approved_by: human` sentence — TRUE
 *     for `no-ledger-entry` / `unknown-provenance`, and ONLY those;
 *   - an APPENDED SECTION (`hash-mismatch-new-section`) is reported as the plan's text
 *     changing after approval by adding section(s) the boundary does not recognise, the
 *     sections NAMED, pointing at `EXECUTION_SECTION_PRODUCERS`;
 *   - a specification change (`hash-mismatch` / `hash-mismatch-legacy`) is reported as a
 *     post-approval change to the specification;
 *   - an INDETERMINATE reason (`spec-boundary-unlocatable`, `ledger-corrupt`,
 *     `ledger-unkeyable`, `unreadable`, anything else) is reported as the check being
 *     unable to establish the answer — worded so it cannot read as a clean result.
 *
 * @param {Array<{plan: string, stage: string, reason: (string|null), sections: string[]}>} offenders
 * @returns {string}
 */
function describeGateOffenders(offenders) {
  const missing = [];
  const added = [];
  const changed = [];
  const indeterminate = [];
  for (const o of offenders) {
    if (o.reason === 'no-ledger-entry' || o.reason === 'unknown-provenance') missing.push(o);
    else if (o.reason === 'hash-mismatch-new-section') added.push(o);
    else if (o.reason === 'hash-mismatch' || o.reason === 'hash-mismatch-legacy') changed.push(o);
    else indeterminate.push(o);
  }
  const parts = [];
  if (missing.length > 0) {
    parts.push(`${missing.length} missing approved_by: human in the approval ledger ` +
      `(a frontmatter marker is not an approval — the runtime hook will revert these)`);
  }
  if (added.length > 0) {
    const names = [...new Set(added.flatMap((o) => o.sections || []))].slice(0, 5);
    parts.push(`${added.length} changed after approval by adding section(s) the specification boundary does not recognise` +
      `${names.length > 0 ? ` (${names.join('; ')})` : ''} — the recognised set is defined in approval-ledger.EXECUTION_SECTION_PRODUCERS`);
  }
  if (changed.length > 0) {
    parts.push(`${changed.length} changed in the specification after approval`);
  }
  if (indeterminate.length > 0) {
    const reasons = [...new Set(indeterminate.map((o) => o.reason))].join(', ');
    parts.push(`${indeterminate.length} where the check could not establish the answer (${reasons})`);
  }
  return parts.join('; ');
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
    return finding({
      severity: 'warn',
      message: `${stale.length} plans stale (in-progress > ${days} days without activity)`,
      details: { stale: stale.slice(0, 5) },
    });
  }
  return CLEAN();
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
    return finding({
      severity: 'warn',
      message: `${missing.length} active plans missing files: declaration (not coverage-aware)`,
      details: { missing: missing.slice(0, 5) },
    });
  }
  return CLEAN();
}

// ─────────────────────────────────────────────────────────────────────
//  System integrity (hooks, libs, JSON sync)
// ─────────────────────────────────────────────────────────────────────

function checkRequiredHooks(root) {
  const missing = REQUIRED_HOOKS.filter(rel => !safeFs.existsSync(path.join(root, rel)));
  if (missing.length > 0) {
    return finding({
      severity: 'critical',
      message: `${missing.length} required hook file(s) missing — Iron Loop enforcement DEGRADED`,
      details: { missing },
    });
  }
  return CLEAN();
}

function checkRequiredLibs(root) {
  const missing = REQUIRED_LIBS.filter(rel => !safeFs.existsSync(path.join(root, rel)));
  if (missing.length > 0) {
    return finding({
      severity: 'critical',
      message: `${missing.length} required lib file(s) missing`,
      details: { missing },
    });
  }
  return CLEAN();
}

function checkHooksJsonRegistration(root) {
  const hooksJson = path.join(root, '.claude-plugin/hooks.json');
  if (!safeFs.existsSync(hooksJson)) {
    return finding({ severity: 'critical', message: '.claude-plugin/hooks.json missing — no hooks registered' });
  }
  const content = safeFs.readFileSync(hooksJson, 'utf8');
  const required = ['SessionStart', 'PreToolUse', 'PreToolUse.Edit.js', 'human-gate-check.js'];
  const missing = required.filter(s => !content.includes(s));
  if (missing.length > 0) {
    return finding({
      severity: 'critical',
      message: `hooks.json missing registration for: ${missing.join(', ')}`,
      details: { missing },
    });
  }
  return CLEAN();
}

function checkVersionSync(root) {
  const versionPath = path.join(root, 'VERSION');
  if (!safeFs.existsSync(versionPath)) {
    return finding({ severity: 'critical', message: 'VERSION file missing' });
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
    return finding({
      severity: 'block',
      message: `VERSION (${version}) out of sync with plugin JSON files. Run: node src/scripts/release.js`,
      details: { mismatches },
    });
  }
  return CLEAN();
}

// ─────────────────────────────────────────────────────────────────────
//  SaaS template integrity
// ─────────────────────────────────────────────────────────────────────

function checkSaasTemplates(root) {
  const indexPath = path.join(root, '.ctoc/templates/saas/index.yaml');
  if (!safeFs.existsSync(indexPath)) {
    return finding({ severity: 'warn', message: 'SaaS template index missing — autonomous SaaS build degraded' });
  }
  const b2c = path.join(root, '.ctoc/templates/saas/b2c-subscription');
  const required = ['README.md', 'manifest.yaml', 'production-readiness.yaml'];
  const missing = required.filter(f => !safeFs.existsSync(path.join(b2c, f)));
  if (missing.length > 0) {
    return finding({
      severity: 'warn',
      message: `b2c-subscription template incomplete: missing ${missing.join(', ')}`,
      details: { missing },
    });
  }
  return CLEAN();
}

function checkBudgetConfigExists(root) {
  const p = path.join(root, '.ctoc', 'config', 'budget.yaml');
  if (!safeFs.existsSync(p)) {
    return finding({
      severity: 'warn',
      message: 'Session-level build budget config missing at .ctoc/config/budget.yaml — autonomous runs are unbounded',
      details: { suggested: 'Copy from .ctoc/config/budget.yaml in the CTOC repo, or run /ctoc:budget to generate.' },
    });
  }
  return CLEAN();
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
    return finding({
      severity: 'warn',
      message: `Product Loop artifacts missing: ${missing.join(', ')}`,
      details: { missing },
    });
  }
  return CLEAN();
}

// ─────────────────────────────────────────────────────────────────────
//  Plan statistics (info-only)
// ─────────────────────────────────────────────────────────────────────

function checkPlanCounts(root) {
  const counts = {};
  for (const stage of ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done']) {
    counts[stage] = listPlans(root, stage).length;
  }
  // CLEAN and informational: this check reports counts, not problems, so its
  // verdict is clean by definition — but it still carries a reportable payload,
  // and the consumer records any verdict that carries a message. The `info` count
  // in the summary must not move.
  return {
    clean: true,
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
  { id: 'dead-export-fence',           scope: 'architecture', mode: 'thorough', fn: checkDeadExportFence },
  { id: 'unexecutable-instruction-fence', scope: 'architecture', mode: 'thorough', fn: checkUnexecutableInstructionFence },
  { id: 'false-green-fence',           scope: 'architecture', mode: 'thorough', fn: checkFalseGreenFence },
  { id: 'golden-corpus-fence',         scope: 'architecture', mode: 'thorough', fn: checkGoldenCorpusFence },
  { id: 'recipe-execution-fence',      scope: 'architecture', mode: 'thorough', fn: checkRecipeExecutionFence },
  { id: 'gate-words-fence',            scope: 'architecture', mode: 'thorough', fn: checkGateWordsFence },
  { id: 'instruction-gate-words-fence', scope: 'architecture', mode: 'thorough', fn: checkInstructionGateWordsFence },
  { id: 'agent-honesty-fence',         scope: 'architecture', mode: 'thorough', fn: checkAgentHonestyFence },
  { id: 'claim-census',                scope: 'architecture', mode: 'thorough', fn: checkClaimCensus },
  { id: 'dispatch-seat-liveness',      scope: 'system',       mode: 'thorough', fn: checkDispatchSeatLiveness },
];

/**
 * Dispatch-seat liveness fence (plan 00165). Has CTOC's dispatch-path hook
 * (`src/hooks/PreToolUse.Task.js`) produced evidence of running in this project? The
 * seat's job is to record what a background dispatch is building; a claim mechanism
 * built into a hook that never fires would leave the registry exactly as empty as it
 * is now while the suite stayed green — this repository's false-green defect wearing
 * the shape of an enforcement fence. `src/lib/dispatch-seat-liveness.js` answers the
 * question at runtime and is reached HERE, from the enforcer a human runs; it is not
 * reachable only from a test (a test is not a caller — see src/lib/reachability.js).
 *
 * The verdict mapping, and WHY it is not the plan's guessed block/block:
 *   • `live`     → CLEAN (silent pass). The seat runs; a claim can be relied on. The
 *                  evidence age lives on the module's return for any caller; a clean
 *                  check emits no finding, exactly like every other healthy check, so
 *                  the informational `plan-counts` stays the ONLY info finding.
 *   • `not-live` → WARN. The instruments were read and hold no evidence the seat ever
 *                  ran. This is a RUNTIME observation (`.ctoc/state`, `.ctoc/logs` are
 *                  gitignored and environment-specific), not a defect in the committed
 *                  source tree — so it is surfaced as drift a human reads, not as a
 *                  `block` that would make CTOC's own clean-tree self-check permanently
 *                  red on every fresh checkout until plan 00166 lands. The human still
 *                  meets the verdict in the WARN section of the self-check report.
 *   • `unknown`  → BLOCK. The instruments could not be READ, so nothing is known. This
 *                  is the whole discipline: a check that cannot read its own instrument
 *                  must NOT return the success value (mirroring test-gate.js's `null`).
 *                  `unknown` is louder than `not-live` — "I could not look" is a worse
 *                  position than "I looked and it is dead" (the plan's own ordering).
 *                  It arises only when an instrument is unreadable, which never happens
 *                  on a healthy checkout, so it never fires against the clean tree.
 *
 * Thorough mode only (it reads runtime state, off the SessionStart fast path).
 *
 * @param {string} root - Project root
 * @returns {{clean: boolean, severity?: string, message?: string, details?: Object}}
 */
function checkDispatchSeatLiveness(root) {
  const { seatLiveness, describeLiveness } = require('./dispatch-seat-liveness');
  const result = seatLiveness(root);
  if (result.state === 'live') return CLEAN();
  const severity = result.state === 'unknown' ? 'block' : 'warn';
  return finding({
    severity,
    message: describeLiveness(result),
    details: { state: result.state, reason: result.reason, sources: result.sources },
  });
}

/**
 * Dead-EXPORT fence invariant (2026-07-14, the deeper root cause). The file-level
 * fence below cannot see a dead export inside a LIVE file: `actions.js` is
 * reachable, so `completeExecution` — the sole producer of the Gate-3 verify
 * evidence — sat there with zero callers while the suite stayed green and Gate 3
 * became un-passable. This check compares the live dead-export set against the
 * committed baseline (`.ctoc/export-reachability-baseline.json`); anything NOT in
 * that baseline is a NEW dead export and blocks. The ratchet itself lives in
 * tests/export-reachability.test.js — this surfaces the same truth on demand.
 * Thorough mode only.
 *
 * @param {string} root - Project root
 * @returns {{clean: boolean, severity?: string, message?: string}} not-clean, or { clean: true }
 */
function checkDeadExportFence(root) {
  const { analyzeExports } = require('./reachability');
  const path = require('path');
  const safeFs = require('./safe-fs');

  const result = analyzeExports(root);
  if (!result || result.totalExports === 0) return CLEAN(); // not a CTOC source tree

  const baselineFile = path.join(root, '.ctoc', 'export-reachability-baseline.json');
  /** @type {Set<string>} */
  const baselined = new Set();
  if (safeFs.existsSync(baselineFile)) {
    try {
      const parsed = JSON.parse(safeFs.readFileSync(baselineFile, 'utf8'));
      const list = Array.isArray(parsed) ? parsed : (parsed && parsed.dead) || [];
      for (const name of list) if (typeof name === 'string') baselined.add(name);
    } catch { /* malformed baseline → nothing is excused; every dead export blocks */ }
  }

  const fresh = result.dead.filter((name) => !baselined.has(name));
  if (fresh.length === 0) return CLEAN();
  return finding({
    severity: 'block',
    message: `${fresh.length} NEW dead export(s) — defined and exported, called by nothing live: ${fresh.slice(0, 10).join(', ')}${fresh.length > 10 ? ` (+${fresh.length - 10} more)` : ''} — wire each to a live call site or delete it; a test is not a caller`
  });
}

/**
 * Unexecutable-order fence invariant (plan 00110). An agent definition is a set of
 * orders, and its `tools:` frontmatter is the complete list of what it can do. An order
 * to CALL a JavaScript function — `call `shouldRunGdpr(projectRoot)`` — under a grant
 * with no way to execute JavaScript (in practice, no `Bash`) is IMPOSSIBLE: the agent
 * skips the part it cannot do and returns a result that reads like success. Five agent
 * definitions carried exactly this. `src/lib/unexecutable-instruction-scan.js` finds
 * such orders across the agent corpus (following reachability.js's strip-first,
 * parenthesis-required, under-reporting discipline — a citation is not an invocation),
 * and this is its LIVE call site.
 *
 * Compares the live scan against `.ctoc/unexecutable-instruction-baseline.json`, which
 * holds TWO deliberately separate structures: `debt` is real orders being paid down (may
 * only SHRINK, no per-entry justification) and `exemptions` is a PERMANENT list asserting
 * the detector is wrong (a written reason per entry, shipped EMPTY). Anything in neither
 * blocks. A malformed baseline excuses NOTHING, mirroring checkDeadExportFence. A scan
 * that read ZERO agents is not a CTOC agent corpus → CLEAN (never a false zero). Thorough
 * mode only (walks the whole agent corpus).
 *
 * Structured for extension: plan 00073 appends its two remaining detections to the same
 * scanner and this same CHECKS entry; `Finding.detection` is already a union.
 *
 * @param {string} root - Project root
 * @returns {{clean: boolean, severity?: string, message?: string}} not-clean, or { clean: true }
 */
function checkUnexecutableInstructionFence(root) {
  const { scan } = require('./unexecutable-instruction-scan');
  const path = require('path');
  const safeFs = require('./safe-fs');

  const result = scan(root);
  // Not a CTOC tree only when there is NOTHING of any detected class to check. A tree
  // with command docs but no agents (or vice versa) is still checked (plan 00073 widened
  // the guard from agents-only so a missing agents/ dir never false-cleans the recipe and
  // config detections).
  if (result.scanned.agents === 0 && result.scanned.commandDocs === 0) return CLEAN();

  const baselineFile = path.join(root, '.ctoc', 'unexecutable-instruction-baseline.json');
  /** @type {Set<string>} */
  const excused = new Set();
  if (safeFs.existsSync(baselineFile)) {
    try {
      const parsed = JSON.parse(safeFs.readFileSync(baselineFile, 'utf8'));
      for (const key of (parsed && parsed.debt) || []) if (typeof key === 'string') excused.add(key);
      for (const e of (parsed && parsed.exemptions) || []) if (e && typeof e.key === 'string') excused.add(e.key);
    } catch {
      // A malformed baseline excuses NOTHING: drop any partially-parsed keys so every
      // finding blocks. An unreadable ledger must never read as "all clear".
      excused.clear();
    }
  }

  const fresh = result.findings.filter((f) => !excused.has(f.key));
  if (fresh.length === 0) return CLEAN();
  // Findings span three detections now (plan 00073): an agent order that cannot execute,
  // a recipe naming a task kind KINDS rejects, and a settings key written but never read.
  // Each finding carries its own prescriptive `fix`; the summary names the keys.
  return finding({
    severity: 'block',
    message: `${fresh.length} unexecutable instruction(s) with no receiver — an order, recipe kind, or config key that nothing on the other end can act on: ${fresh.slice(0, 10).map((f) => f.key).join(', ')}${fresh.length > 10 ? ` (+${fresh.length - 10} more)` : ''} — see each finding's fix; a citation is not an invocation`
  });
}

/**
 * Dead-code fence invariant (2026-07-14 root cause): every src file must be
 * reachable from a live root — a test is a caller, so "module + its own test"
 * proves nothing. The ratchet lives in tests/reachability.test.js; this check
 * surfaces the same truth through the self-check so a human can ask for it
 * on demand. Thorough mode only (walks the whole src tree).
 *
 * BASELINE-AWARE, mirroring checkDeadExportFence exactly. This check used to block
 * on ANY unreachable file, which was tenable only while the file fence reported a
 * false zero (it credited a bare markdown MENTION as an execution root and any
 * `.js` string literal as a call edge). With the fence telling the truth there is
 * real committed DEBT, so what blocks is a NEW dead file — anything not in
 * `.ctoc/reachability-baseline.json`. A malformed baseline excuses NOTHING: every
 * unreachable file blocks, because a baseline that cannot be read must never read
 * as "all clear".
 *
 * @param {string} root - Project root
 * @returns {{clean: boolean, severity?: string, message?: string}} not-clean, or { clean: true }
 */
function checkReachabilityFence(root) {
  const { analyze } = require('./reachability');
  const path = require('path');
  const safeFs = require('./safe-fs');

  const result = analyze(root);
  if (result.total === 0) return CLEAN(); // not a CTOC source tree — nothing to check

  const baselineFile = path.join(root, '.ctoc', 'reachability-baseline.json');
  /** @type {Set<string>} */
  const baselined = new Set();
  if (safeFs.existsSync(baselineFile)) {
    // A baseline that EXISTS but cannot be read is a broken instrument, and the
    // check must SAY SO rather than swallow it: proceeding with an empty set would
    // still block, but on a message blaming the source files for a defect in the
    // baseline. Absent is a different fact and keeps its own meaning below.
    try {
      const parsed = JSON.parse(safeFs.readFileSync(baselineFile, 'utf8'));
      const list = Array.isArray(parsed) ? parsed : (parsed && parsed.unreachable) || [];
      for (const rel of list) if (typeof rel === 'string') baselined.add(rel);
    } catch (err) {
      return finding({
        severity: 'block',
        message: `.ctoc/reachability-baseline.json exists but could not be read (${err && err.message}) — the dead-code ratchet cannot be evaluated, and an unreadable baseline must never read as "all clear"; repair the file`
      });
    }
  }

  const fresh = result.unreachable.filter((rel) => !baselined.has(rel));
  if (fresh.length === 0) return CLEAN();
  return finding({
    severity: 'block',
    message: `${fresh.length} NEW source file(s) unreachable from every live root (dead on arrival): ${fresh.slice(0, 10).join(', ')}${fresh.length > 10 ? ` (+${fresh.length - 10} more)` : ''} — wire each to a live root or delete it; a module is not done when its test passes, it is done when a human can reach it`
  });
}

/**
 * False-green fence invariant (2026-07-18). The defect class, in the human's words:
 * "a check that reports failure or success based on input it never actually
 * received." It shipped FIVE times — a parser whose no-match default was the SUCCESS
 * value 0; a verdict parsed off a TRUNCATED copy of the output; `process.exit`
 * discarding ~1.4MB of pending piped writes; an `execSync` overflowing its default
 * 1MB maxBuffer and reporting a PASSING suite as failed. Every one passed review and
 * a green suite, because the instrument was blind and the blindness was reported as
 * a value.
 *
 * This compares the live scan against `.ctoc/false-green-baseline.json`. That file
 * holds TWO deliberately separate structures: `findings` is pre-existing DEBT which
 * may only ever SHRINK (no per-entry justification — demanding one for each of 135
 * sites would mean the fence never lands), and `whitelist` is a PERMANENT exemption
 * requiring a written justification per entry. Anything in neither is a NEW
 * false-green site and blocks.
 *
 * A malformed baseline excuses NOTHING (mirroring checkDeadExportFence): a baseline
 * that cannot be read must never read as "all clear" — that would be this very
 * defect class, committed by the check built to catch it. The ratchet itself lives in
 * tests/false-green-fence.test.js; this surfaces the same truth on demand. Thorough
 * mode only (walks the whole src tree).
 *
 * @param {string} root - Project root
 * @returns {{clean: boolean, severity?: string, message?: string}} { clean: true } when
 *   clean or when this is not a CTOC source tree.
 */
function checkFalseGreenFence(root) {
  const { scanFalseGreen } = require('./false-green-scan');
  const path = require('path');
  const safeFs = require('./safe-fs');

  const result = scanFalseGreen(root);
  if (result.filesScanned === 0) return CLEAN(); // not a CTOC source tree — nothing to check

  const baselineFile = path.join(root, '.ctoc', 'false-green-baseline.json');
  /** @type {Set<string>} */
  const excused = new Set();
  if (safeFs.existsSync(baselineFile)) {
    try {
      const parsed = JSON.parse(safeFs.readFileSync(baselineFile, 'utf8'));
      for (const key of (parsed && parsed.findings) || []) if (typeof key === 'string') excused.add(key);
      for (const key of Object.keys((parsed && parsed.whitelist) || {})) excused.add(key);
    } catch { /* malformed baseline → nothing is excused; every finding blocks */ }
  }

  const fresh = result.findings.filter((f) => !excused.has(f.key));
  if (fresh.length === 0) return CLEAN();

  const shown = fresh.slice(0, 5).map(
    (f) => `${f.file}:${f.line} [${f.signature}] ${f.evidence} → ${f.fix}`
  );
  return finding({
    severity: 'block',
    message: `${fresh.length} NEW false-green site(s) — a check that can report a verdict on input it never received: ` +
      `${shown.join(' | ')}${fresh.length > 5 ? ` (+${fresh.length - 5} more)` : ''}`
  });
}

/**
 * Golden-corpus fence invariant (plan 00074). The defect class, in the human's words:
 * "the matrix fix passed its own tests while your screen was still unreadable. It only
 * broke when rendered against the real question files in your store." A test that
 * exercises only SYNTHETIC input, for a module whose real job is to read a file the
 * pipeline actually WROTE. This surfaces the STATIC half — a module that consumes a
 * persisted contract with no test linked to a real captured sample — mirroring
 * checkFalseGreenFence exactly. The load-bearing half (driving every real sample through
 * its canonical reader, and the extremes ratchet) lives in tests/golden-corpus-fence.js
 * and tests/real-question-file-render.test.js.
 *
 * Compares the live scan against `.ctoc/golden-corpus-baseline.json`: `findings` is
 * pre-existing DEBT which may only SHRINK, `exemptions` is a PERMANENT exemption
 * requiring a written justification. Anything in neither is a NEW unlinked consumer and
 * blocks. A malformed baseline excuses NOTHING — an unreadable baseline must never read
 * as "all clear". Thorough mode only.
 *
 * @param {string} root - Project root
 * @returns {{clean: boolean, severity?: string, message?: string}} { clean: true } when
 *   clean or when this is not a CTOC source tree.
 */
function checkGoldenCorpusFence(root) {
  const { scanGoldenCorpus } = require('./golden-corpus-scan');
  const path = require('path');
  const safeFs = require('./safe-fs');

  const result = scanGoldenCorpus(root);
  if (result.filesScanned === 0) return CLEAN(); // not a CTOC source tree — nothing to check
  // No corpus present means this fence cannot assess linkage (which contracts a test
  // exercises with a real sample) — e.g. a tree copied WITHOUT tests/, or a fresh clone
  // mid-checkout. The corpus's PRESENCE is itself guarded by tests/golden-corpus-fence.js
  // (its non-vacuous test asserts samplesExercised > 0), so this can never silence the
  // gated suite; it only stops the self-check inventing findings on a tree with no corpus.
  if (result.samplesExercised === 0) return CLEAN();

  const baselineFile = path.join(root, '.ctoc', 'golden-corpus-baseline.json');
  /** @type {Set<string>} */
  const excused = new Set();
  if (safeFs.existsSync(baselineFile)) {
    try {
      const parsed = JSON.parse(safeFs.readFileSync(baselineFile, 'utf8'));
      for (const key of (parsed && parsed.findings) || []) if (typeof key === 'string') excused.add(key);
      for (const key of Object.keys((parsed && parsed.exemptions) || {})) excused.add(key);
    } catch {
      excused.clear(); // malformed baseline excuses NOTHING — an unreadable baseline must never read as "all clear"
    }
  }

  const fresh = result.findings.filter((f) => !excused.has(f.key));
  if (fresh.length === 0) return CLEAN();

  const shown = fresh.slice(0, 5).map((f) => `${f.module} → ${f.contract} [${f.signal}]`);
  return finding({
    severity: 'block',
    message: `${fresh.length} NEW consumer(s) of a persisted contract with no test driving a real ` +
      `captured sample — a synthetic-only test for a module that reads a file the pipeline wrote: ` +
      `${shown.join(' | ')}${fresh.length > 5 ? ` (+${fresh.length - 5} more)` : ''}. ` +
      `Add a test that drives a real sample from tests/fixtures/golden-corpus/, or exempt with a justification.`
  });
}

/**
 * Recipe-execution fence (plan 00186). A shipped state-changing recipe is proven by
 * RUNNING it, not by reading it — a static arity check is green on the 00185 defect
 * (a string where a proposal object belonged is arity-legal). `src/lib/recipe-harness.js`
 * extracts and executes those recipes; `tests/shipped-recipes-execute.test.js` is the
 * ratchet. This is that instrument's LIVE call site — the harness is reached HERE, from
 * the enforcer a human runs, exactly as `false-green-scan.js` is (a test is never a
 * caller; see src/lib/reachability.js), so it is not dead code the ratchet must flag.
 *
 * It surfaces the same on-demand truth as test case 6, cheaply (no child processes): a
 * state-changing recipe present in `src/commands/start.md` but absent from BOTH the
 * `covered` and `uncovered` lists of `.ctoc/recipe-coverage.json` — the ARRIVAL of an
 * unfenced recipe. Otherwise SILENT (contributes no finding on a healthy repo, leaving
 * the enforcer summary counts unmoved). An unreadable ledger BLOCKS rather than reads as
 * clean. Thorough mode only.
 *
 * @param {string} root - Project root
 * @returns {{clean: boolean, severity?: string, message?: string}}
 */
function checkRecipeExecutionFence(root) {
  const { extractRecipes, isStateChanging, recipeId } = require('./recipe-harness');
  const path = require('path');
  const safeFs = require('./safe-fs');

  const startMd = path.join(root, 'src', 'commands', 'start.md');
  if (!safeFs.existsSync(startMd)) return CLEAN(); // not a CTOC source tree — nothing to check

  const inScope = extractRecipes(startMd).filter(isStateChanging);
  if (inScope.length === 0) return CLEAN();

  const coverageFile = path.join(root, '.ctoc', 'recipe-coverage.json');
  if (!safeFs.existsSync(coverageFile)) {
    return finding({
      severity: 'block',
      message: `${inScope.length} state-changing shipped recipe(s) exist but .ctoc/recipe-coverage.json is missing — the recipe-execution ratchet cannot be evaluated; a missing ledger must never read as "all fenced"`
    });
  }
  /** @type {Set<string>} */
  const ledgerIds = new Set();
  try {
    const parsed = JSON.parse(safeFs.readFileSync(coverageFile, 'utf8'));
    for (const e of [...((parsed && parsed.covered) || []), ...((parsed && parsed.uncovered) || [])]) {
      if (e && typeof e.id === 'string') ledgerIds.add(e.id);
    }
  } catch (err) {
    return finding({
      severity: 'block',
      message: `.ctoc/recipe-coverage.json exists but could not be read (${err && err.message}) — an unreadable recipe ledger must never read as "all clear"; repair the file`
    });
  }

  const unfenced = inScope.filter((r) => !ledgerIds.has(recipeId(r)));
  if (unfenced.length === 0) return CLEAN();
  return finding({
    severity: 'block',
    message: `${unfenced.length} state-changing shipped recipe(s) in start.md are in NEITHER covered nor uncovered: ` +
      `${unfenced.slice(0, 5).map((r) => 'row ' + r.row + ' [' + (r.calls.join(',') || r.scriptPath) + ']').join(' | ')}` +
      `${unfenced.length > 5 ? ` (+${unfenced.length - 5} more)` : ''} — add a fixture (→ covered) or a one-line reason (→ uncovered) to .ctoc/recipe-coverage.json; a shipped recipe is proven by running it`
  });
}

/**
 * Corpus claim-census fence (plan 00135). The corpus verifies its own skill/guide
 * files with ~61 STRUCTURAL tests (line counts, section counts, fence counts) that
 * guard against a future edit THINNING a guide — a real and different property — but
 * never check whether a guide is TRUE. This fence adds the orthogonal axis: it walks
 * the DECLARED `<!-- ctoc:claims … -->` blocks via `src/lib/claim-extractor.js` and
 * holds citation coverage to a one-directional floor (`.ctoc/claim-coverage-baseline.json`
 * `minDeclaredFiles`). It is this slice's LIVE call site — the census is reachable
 * from the enforcer a human runs, not merely from its own test (a test is never a
 * caller; see src/lib/reachability.js). Slice 00136 fetches; 00138 surfaces the
 * census to the menu.
 *
 * It BLOCKS on exactly two facts, and is otherwise silent (so it contributes no
 * finding on a healthy corpus, leaving the enforcer summary counts unmoved):
 *   1. the walk was PARTIAL (`unreadableCount > 0`) — a corpus that could not be
 *      fully read must never read as complete, the same could-not-look contract the
 *      stale detector enforces; or
 *   2. declared coverage REGRESSED below the committed floor — a guide's claim block
 *      was removed. The floor may only rise; the ratchet lives in
 *      tests/claim-census.test.js and this surfaces the same truth on demand.
 * Thorough mode only (walks the whole skills/ tree).
 *
 * @param {string} root - Project root
 * @returns {{clean: boolean, severity?: string, message?: string, details?: Object}}
 */
function checkClaimCensus(root) {
  const { censusCorpus } = require('./claim-extractor');
  const path = require('path');
  const safeFs = require('./safe-fs');

  const census = censusCorpus(root);
  if (census.totalFiles === 0) return CLEAN(); // not a corpus tree — nothing to check

  if (census.unreadableCount > 0) {
    return finding({
      severity: 'block',
      message: `claim census could not read ${census.unreadableCount} corpus input(s) — a PARTIAL walk must never read as complete; repair the read before trusting the coverage count`,
      details: { unreadable: census.unreadable },
    });
  }

  // ABSENT and UNREADABLE are different facts (mirroring checkReachabilityFence). No
  // baseline at all is a legitimate "no measured floor yet" and keeps the 0 default;
  // a baseline that EXISTS but cannot be read or lacks a numeric minDeclaredFiles is a
  // broken instrument, and an unreadable ratchet must never read as "all clear".
  const baselineFile = path.join(root, '.ctoc', 'claim-coverage-baseline.json');
  let minDeclared = 0;
  if (safeFs.existsSync(baselineFile)) {
    let brokenBaseline = false;
    try {
      const parsed = JSON.parse(safeFs.readFileSync(baselineFile, 'utf8'));
      if (parsed && Number.isFinite(parsed.minDeclaredFiles)) minDeclared = parsed.minDeclaredFiles;
      else brokenBaseline = true;
    } catch (err) {
      void err; // a parse failure is a broken instrument, handled by the block below
      brokenBaseline = true;
    }
    if (brokenBaseline) {
      return finding({
        severity: 'block',
        message: '.ctoc/claim-coverage-baseline.json exists but is unreadable or has no numeric minDeclaredFiles — the citation-coverage ratchet cannot be evaluated, and an unreadable ratchet must never read as "all clear"; repair the file',
      });
    }
  }

  if (census.declaredFiles < minDeclared) {
    return finding({
      severity: 'block',
      message: `claim coverage REGRESSED: ${census.declaredFiles} guide(s) declare claims, below the floor of ${minDeclared} — a guide's claim block was removed; restore it (the floor may only rise, never be lowered)`,
    });
  }

  return CLEAN();
}

/**
 * Gate-number fence (2026-07-21). The owner's rule: never put a gate number in text
 * a person reads — say what the MOMENT is (`src/lib/gate-words.js`), not the number.
 * It was stated three times and applied to prose all three times while the shipped
 * strings kept the number; a prose rule silently stops being true, so this makes it
 * a check. `src/lib/human-facing-scan.js` PARSES the screen-producing modules (a text
 * search cannot — the defect that reached the owner's screen, `` `Gate ${n}` ``, has
 * no digit in its source) and reports two things: gate numbers that reach a human,
 * and screen modules missing from the registry (so the registry cannot rot silently).
 *
 * UNAVAILABLE IS A FAILURE, never a pass and never a skip. A scan that could not run
 * — the parser absent, a registry file unreadable — has no verdict to give, and
 * reporting one would be the false-green defect this repository has fixed repeatedly.
 * A tree with no `src/lib` is not a CTOC source tree and is CLEAN (nothing to check),
 * mirroring `checkFalseGreenFence`'s `filesScanned === 0` gate. Thorough mode only.
 *
 * @param {string} root - Project root
 * @returns {{clean: boolean, severity?: string, message?: string}} { clean: true } when
 *   clean or when this is not a CTOC source tree.
 */
function checkGateWordsFence(root) {
  const scan = require('./human-facing-scan');
  const path = require('path');
  const safeFs = require('./safe-fs');

  // Not a CTOC source tree — nothing to check.
  if (!safeFs.existsSync(path.join(root, 'src', 'lib'))) return CLEAN();

  const unreg = scan.findUnregisteredScreens(root);
  if (!unreg.available) {
    // checkJs does not narrow this union on `!available`; the cast is safe — the
    // unavailable branch IS the { available:false, reason } shape.
    const reason = /** @type {{ reason: string }} */ (unreg).reason;
    return finding({ severity: 'block', message: `the gate-number scan could not run: ${reason}` });
  }

  const reg = scan.scanRegistry(root);
  if (!reg.available) {
    const reason = /** @type {{ reason: string }} */ (reg).reason;
    return finding({ severity: 'block', message: `the gate-number scan could not run: ${reason}` });
  }

  const problems = [];
  if (reg.findings.length > 0) {
    const shown = reg.findings.slice(0, 5).map(
      (f) => `${f.file}:${f.line}:${f.column} [${f.pattern}] "${f.text}"`
    );
    problems.push(
      `${reg.findings.length} gate number(s) reach a human — say what the moment is ` +
      `(src/lib/gate-words.js), not the number: ${shown.join(' | ')}` +
      `${reg.findings.length > 5 ? ` (+${reg.findings.length - 5} more)` : ''}`
    );
  }
  if (unreg.modules.length > 0) {
    problems.push(
      `${unreg.modules.length} screen module(s) return the { text, ask, actions } ` +
      `contract but are not in SCREEN_MODULES: ${unreg.modules.join(', ')}`
    );
  }
  if (problems.length === 0) return CLEAN();
  return finding({ severity: 'block', message: problems.join(' — ') });
}

/**
 * Instruction-surface gate-number fence (2026-07-31). The sibling of the gate-number
 * fence above, for the surface the JavaScript parser cannot see: the Markdown
 * instruction surfaces (the `.md` files under `src/commands` and `agents`). Those told the session
 * model to EMIT a gate number to a human — `report "Gate N ready"`, `User outcome:
 * Gate 0 — …`, `Gate 1/2/3` — and the model echoed the number, which is exactly the
 * "no numbers" rule the owner has restated repeatedly. `src/lib/gate-words.js` holds
 * the plain-moment phrasing the instructions should use instead; the shared rule for
 * agents lives in `skills/agent-fragments/plain-gate-words.md`.
 *
 * NARROW / under-report by design (see the scan's header): it fires only on the
 * output-INSTRUCTION shapes, never on the internal gate table, the `--gate N` flag, or
 * a machinery description like "crosses Gate 1 (functional → implementation)".
 *
 * UNAVAILABLE IS A FAILURE, never a pass and never a skip — a scan that could not read
 * a surface has no verdict to give. A tree with no `agents/` and no `src/commands/` is
 * not a CTOC surface tree and is CLEAN (nothing to check). Thorough mode only.
 *
 * @param {string} root - Project root
 * @returns {{clean: boolean, severity?: string, message?: string}}
 */
function checkInstructionGateWordsFence(root) {
  const scan = require('./instruction-gate-words-scan');
  const res = scan.scanInstructionSurfaces(root);
  if (!res.available) {
    // checkJs does not narrow this union on `!available`; the cast is safe — the
    // unavailable branch IS the { available:false, reason } shape.
    const reason = /** @type {{ reason: string }} */ (res).reason;
    return finding({ severity: 'block', message: `the instruction-surface gate-number scan could not run: ${reason}` });
  }
  if (res.findings.length === 0) return CLEAN();
  const shown = res.findings.slice(0, 5).map(
    (f) => `${f.file}:${f.line} [${f.pattern}] "${f.text}"`
  );
  return finding({
    severity: 'block',
    message:
      `${res.findings.length} instruction(s) tell the model to emit a gate number to a human — ` +
      `say what the moment is (src/lib/gate-words.js; skills/agent-fragments/plain-gate-words.md), ` +
      `not the number: ${shown.join(' | ')}` +
      `${res.findings.length > 5 ? ` (+${res.findings.length - 5} more)` : ''}`,
  });
}

/**
 * Agent-honesty fence (plan 00160). An agent, asked for status with no data,
 * invented "your session's compliance gate is at 11:15" — a fluent sentence with
 * an invented time, an invented schedule, and a subsystem (`isControlEnabled`,
 * zero callers in src/) named as running. No fence can reach agent OUTPUT — it
 * streams straight to the terminal. The only lever is the instruction the model
 * carries BEFORE it speaks: `skills/agent-fragments/honest-status.md`, referenced
 * by every dispatchable definition. This is the LIVE call site for the census
 * that the reference is present and the fragment is substantive — reachable from
 * the enforcer a human runs, not only from its own test (a test is not a caller).
 *
 * Verdict mapping (unavailable is FAILURE, never a pass or a skip):
 *   • fragment unreadable/absent → BLOCK, naming the reason.
 *   • fragment present but hollow → BLOCK, naming the absent sections.
 *   • census unavailable (an unreadable def, or the non-vacuity floor)  → BLOCK.
 *   • any definition missing the reference → BLOCK, naming the file(s).
 *   • otherwise → CLEAN (silent, like every sibling fence).
 *
 * Thorough mode only (walks the whole agent corpus).
 *
 * @param {string} root - Project root
 * @returns {{clean: boolean, severity?: string, message?: string}} not-clean, or { clean: true }
 */
function checkAgentHonestyFence(root) {
  const { censusAgents, fragmentIsSubstantive } = require('./agent-honesty-scan');
  const path = require('path');
  const safeFs = require('./safe-fs');

  // Not a CTOC agent corpus — nothing to check.
  if (!safeFs.existsSync(path.join(root, 'agents'))) return CLEAN();

  const frag = fragmentIsSubstantive(root);
  if (!frag.available) {
    const reason = /** @type {{ reason: string }} */ (frag).reason;
    return finding({ severity: 'block', message: `the honest-status fragment could not be read: ${reason}` });
  }
  if (!frag.ok) {
    return finding({
      severity: 'block',
      message: `the honest-status fragment is present but hollow — missing section(s): ${frag.missingSections.join(', ')}`,
    });
  }

  const census = censusAgents(root);
  if (!census.available) {
    const reason = /** @type {{ reason: string }} */ (census).reason;
    return finding({ severity: 'block', message: `the agent-honesty census could not run: ${reason}` });
  }
  if (census.missing.length > 0) {
    const shown = census.missing.slice(0, 10).map((p) => path.relative(root, p)).join(', ');
    return finding({
      severity: 'block',
      message: `${census.missing.length} agent definition(s) do not reference skills/agent-fragments/honest-status.md — assert only what you verified: ${shown}${census.missing.length > 10 ? ` (+${census.missing.length - 10} more)` : ''}`,
    });
  }
  return CLEAN();
}

// ─────────────────────────────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────────────────────────────

/**
 * Run all invariant checks against the project at `root`.
 * @param {Object} [opts]
 * @param {string} [opts.root] - Project root (auto-detected if omitted)
 * @param {'fast'|'thorough'} [opts.mode] - Fast skips expensive checks; thorough runs everything
 * @param {string[]} [opts.scopes] - Limit to scopes (e.g. ['architecture','iron-loop'])
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
      const verdict = check.fn(root);
      if (!verdict || typeof verdict.clean !== 'boolean') {
        // An unreadable verdict is an ERROR, never a pass. A check that answers
        // `null`/`undefined` has told us nothing, and recording nothing as "clean"
        // is exactly the false-green defect this envelope exists to close. Only the
        // check id is named — never the returned value, which a future check could
        // fill with arbitrary content.
        findings.push({
          id: check.id, scope: check.scope, severity: 'error',
          message: `Check returned an unreadable verdict (no boolean \`clean\`) — treated as an ERROR, not a pass`,
        });
        continue;
      }
      // Record a finding when the verdict is not clean, or when a clean verdict
      // still carries a reportable message (the informational plan-counts check).
      // `clean` itself is stripped: the findings element shape is unchanged.
      if (verdict.clean === false || typeof verdict.message === 'string') {
        const { clean, ...payload } = verdict;   // `clean` is a rest sibling: dropped, never reported
        findings.push({ id: check.id, scope: check.scope, ...payload });
      }
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
  checkGateDestinationsApproved,
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
