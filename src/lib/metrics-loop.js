/**
 * Manufacturing-Grade Pipeline Metrics
 *
 * Implements the quantitative quality metrics that turn the Iron Loop
 * into a measured production line. All functions are pure-Node, zero-
 * dependency, cross-platform. Inputs are filesystem reads from:
 *
 *   .ctoc/audit/dispatches/<date>/<dispatch_id>.yaml   — per-dispatch records
 *   .ctoc/capa/<id>.yaml                                — corrective actions
 *   .ctoc/incidents/<id>.yaml                           — post-ship incidents
 *   plans/done/<slug>.md                                — completed plans
 *
 * Formulas are documented with the canonical reference URL inline. We do
 * not invent thresholds; thresholds live in .ctoc/config/andon-thresholds.yaml.
 *
 * References used in the formulas:
 *   - Defects Per Million Opportunities (DPMO):
 *     https://en.wikipedia.org/wiki/Defects_per_million_opportunities
 *   - Process Capability Index (Cpk):
 *     https://en.wikipedia.org/wiki/Process_capability_index
 *   - Shewhart Control Chart (3-sigma rule):
 *     https://en.wikipedia.org/wiki/Shewhart_individuals_control_chart
 *   - Escape Rate (also called Defect Escape Rate, DER) — Software Engineering
 *     Institute, *Capability Maturity Model Integration* glossary;
 *     summary at https://en.wikipedia.org/wiki/Defect_(computer_programming)
 *   - Defect Density — IEEE Std 982.1-2005 *Standard Dictionary of Measures
 *     of the Software Aspects of Dependability*; summary at
 *     https://en.wikipedia.org/wiki/Defect_density
 */

const safeFs = require('./safe-fs');
const { safeRegExp } = require('./regex-utils');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────
//  Filesystem helpers — all paths derived from projectRoot
// ─────────────────────────────────────────────────────────────────────

const DISPATCHES_DIR = path.join('.ctoc', 'audit', 'dispatches');
const CAPA_DIR = path.join('.ctoc', 'capa');
const INCIDENTS_DIR = path.join('.ctoc', 'incidents');
const PLANS_DONE_DIR = path.join('plans', 'done');
const LOOPS_DIR = path.join('.ctoc', 'loops');

function safeReadDir(p) {
  if (!safeFs.existsSync(p)) return [];
  try {
    return safeFs.readdirSync(p);
  } catch (_e) {
    return [];
  }
}

function safeReadFile(p) {
  if (!safeFs.existsSync(p)) return null;
  try {
    return safeFs.readFileSync(p, 'utf8');
  } catch (_e) {
    return null;
  }
}

/**
 * Minimal YAML field extractor for flat key: value lines. Sufficient for
 * the CAPA / incident / dispatch shapes which use top-level scalar fields
 * for the metrics we read. Avoids adding a YAML dependency.
 */
function getYamlField(content, field) {
  if (!content) return null;
  const re = safeRegExp(`^${field}:\\s*(.*)$`, 'm');
  const m = content.match(re);
  if (!m) return null;
  let v = m[1].trim();
  v = v.replace(/^["']|["']$/g, '');
  if (v === 'null' || v === '~' || v === '') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  return v;
}

// ─────────────────────────────────────────────────────────────────────
//  Time-window helpers
// ─────────────────────────────────────────────────────────────────────

function parseIso(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

function isWithinWindow(timestamp, windowDays, now = new Date()) {
  const d = parseIso(timestamp);
  if (!d) return false;
  const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  return d >= cutoff && d <= now;
}

// ─────────────────────────────────────────────────────────────────────
//  Data loaders
// ─────────────────────────────────────────────────────────────────────

/**
 * Walk .ctoc/audit/dispatches/<date>/*.yaml and return parsed records.
 * Skips the example/ subdirectory by convention.
 */
function loadDispatches(projectRoot) {
  const dir = path.join(projectRoot, DISPATCHES_DIR);
  const results = [];
  for (const subdir of safeReadDir(dir)) {
    if (subdir === 'example' || subdir.startsWith('.')) continue;
    const subPath = path.join(dir, subdir);
    let stat;
    try {
      stat = safeFs.statSync(subPath);
    } catch (_e) {
      continue;
    }
    if (!stat.isDirectory()) continue;
    for (const file of safeReadDir(subPath)) {
      if (!file.endsWith('.yaml')) continue;
      const content = safeReadFile(path.join(subPath, file));
      if (!content) continue;
      results.push({
        file: path.join(subdir, file),
        content,
        issuedAt: getYamlField(content, 'issued_at') || getYamlField(content, 'completed_at'),
        targetAgent: getYamlField(content, 'target_agent'),
        tokensUsed: getYamlField(content, 'tokens_used'),
        toolCalls: getYamlField(content, 'tool_calls'),
      });
    }
  }
  return results;
}

function loadCapaRegister(projectRoot) {
  const dir = path.join(projectRoot, CAPA_DIR);
  const results = [];
  for (const file of safeReadDir(dir)) {
    if (file.startsWith('_') || !file.endsWith('.yaml')) continue;
    const content = safeReadFile(path.join(dir, file));
    if (!content) continue;
    results.push({
      file,
      content,
      id: getYamlField(content, 'id'),
      planId: getYamlField(content, 'plan_id'),
      discoveredAt: getYamlField(content, 'discovered_at'),
      discoveredVia: getYamlField(content, 'discovered_via'),
      severity: getYamlField(content, 'severity'),
      effective: getYamlField(content, 'effective'),
      closedAt: getYamlField(content, 'closed_at'),
    });
  }
  return results;
}

function loadIncidents(projectRoot) {
  const dir = path.join(projectRoot, INCIDENTS_DIR);
  const results = [];
  for (const file of safeReadDir(dir)) {
    if (file.startsWith('_') || !file.endsWith('.yaml')) continue;
    const content = safeReadFile(path.join(dir, file));
    if (!content) continue;
    results.push({
      file,
      content,
      id: getYamlField(content, 'id'),
      planId: getYamlField(content, 'plan_id'),
      occurredAt: getYamlField(content, 'occurred_at') || getYamlField(content, 'discovered_at'),
      severity: getYamlField(content, 'severity'),
    });
  }
  return results;
}

function loadCompletedPlans(projectRoot) {
  const dir = path.join(projectRoot, PLANS_DONE_DIR);
  const results = [];
  for (const file of safeReadDir(dir)) {
    if (!file.endsWith('.md')) continue;
    const content = safeReadFile(path.join(dir, file));
    if (!content) continue;
    const completedAt = extractFrontmatterField(content, 'completed_at')
      || extractFrontmatterField(content, 'done_at')
      || extractFrontmatterField(content, 'approved_at');
    results.push({
      slug: file.replace(/\.md$/, ''),
      file,
      content,
      completedAt,
    });
  }
  return results;
}

function extractFrontmatterField(content, field) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  return getYamlField(fmMatch[1], field);
}

// ─────────────────────────────────────────────────────────────────────
//  Test-opportunity counting (for DPMO)
//
//  An "opportunity" in Six Sigma terms is a chance for a defect to occur.
//  In CTOC, one opportunity = one assertion-bearing test. We count these
//  by scanning the dispatch records for test-runner outputs, which record
//  the total test count per run.
// ─────────────────────────────────────────────────────────────────────

function countTestOpportunities(projectRoot, windowDays) {
  const dispatches = loadDispatches(projectRoot);
  let total = 0;
  for (const d of dispatches) {
    if (!isWithinWindow(d.issuedAt, windowDays)) continue;
    if (d.targetAgent !== 'iron-loop/verifier' && d.targetAgent !== 'quality/test-runner') continue;
    const testsTotal = getYamlField(d.content, 'tests_total')
      || getYamlField(d.content, 'total_tests')
      || extractAssertionsFromContent(d.content);
    if (typeof testsTotal === 'number') total += testsTotal;
  }
  return total;
}

function extractAssertionsFromContent(content) {
  // Look for "total: N" inside a tests_result inline object
  const m = content.match(/tests_result:[^{]*\{[^}]*total:\s*(\d+)/);
  if (m) return parseInt(m[1], 10);
  return 0;
}

// ─────────────────────────────────────────────────────────────────────
//  Public metric: escapeRate
//
//  Definition: number of plans that produced a CAPA or incident within
//  thirty days of Gate 3 approval, divided by number of plans completed
//  in the window.
//
//  Reference (Defect Escape Rate / DER): IEEE Std 982.1-2005;
//  glossary at https://en.wikipedia.org/wiki/Software_quality
// ─────────────────────────────────────────────────────────────────────

function escapeRate(projectRoot, windowDays = 30) {
  const plans = loadCompletedPlans(projectRoot);
  const completedInWindow = plans.filter(p => isWithinWindow(p.completedAt, windowDays));
  if (completedInWindow.length === 0) {
    return { rate: 0, escaped: 0, total: 0, window_days: windowDays, note: 'No plans completed in window.' };
  }

  const capas = loadCapaRegister(projectRoot);
  const incidents = loadIncidents(projectRoot);
  const escapedPlanIds = new Set();

  for (const capa of capas) {
    if (!capa.planId) continue;
    if (!isWithinWindow(capa.discoveredAt, windowDays)) continue;
    // Only count escapes — defects discovered AFTER Gate 3 approval
    if (capa.discoveredVia === 'incident' || capa.discoveredVia === 'customer-report') {
      escapedPlanIds.add(capa.planId);
    }
  }
  for (const inc of incidents) {
    if (!inc.planId) continue;
    if (!isWithinWindow(inc.occurredAt, windowDays)) continue;
    escapedPlanIds.add(inc.planId);
  }

  // Restrict to plans actually completed in the window
  let escaped = 0;
  const completedSlugs = new Set(completedInWindow.map(p => p.slug));
  for (const planId of escapedPlanIds) {
    if (completedSlugs.has(planId)) escaped++;
  }

  return {
    rate: escaped / completedInWindow.length,
    escaped,
    total: completedInWindow.length,
    window_days: windowDays,
  };
}

// ─────────────────────────────────────────────────────────────────────
//  Public metric: defectsPerMillion (DPMO)
//
//  Definition:
//    DPMO = (defects / (units × opportunities_per_unit)) × 1,000,000
//
//  In CTOC:
//    defects = count of CAPA entries in the window with severity in
//              {medium, high, critical}
//    units × opportunities_per_unit = total assertion-bearing tests run
//                                      in the window
//
//  Reference: https://en.wikipedia.org/wiki/Defects_per_million_opportunities
// ─────────────────────────────────────────────────────────────────────

function defectsPerMillion(projectRoot, windowDays = 30) {
  const capas = loadCapaRegister(projectRoot);
  const opportunities = countTestOpportunities(projectRoot, windowDays);

  if (opportunities === 0) {
    return { dpmo: null, defects: 0, opportunities: 0, window_days: windowDays, note: 'No test opportunities recorded in window.' };
  }

  let defects = 0;
  for (const capa of capas) {
    if (!isWithinWindow(capa.discoveredAt, windowDays)) continue;
    if (['medium', 'high', 'critical'].includes(capa.severity)) defects++;
  }

  return {
    dpmo: (defects / opportunities) * 1_000_000,
    defects,
    opportunities,
    window_days: windowDays,
  };
}

// ─────────────────────────────────────────────────────────────────────
//  Public metric: processCapabilityIndex (Cpk)
//
//  Definition:
//    Cpk = min( (USL - mean) / (3 * sigma), (mean - LSL) / (3 * sigma) )
//
//  Here we apply Cpk to the refinement-loop convergence: how many rounds
//  it takes the loop to converge for a plan. Specification limits:
//    USL = K-budget for the loop's hardest phase (`critical` phase, K=3)
//          times the number of phases (4) = 12 rounds.
//    LSL = 0 (cannot have negative rounds).
//
//  Reference: https://en.wikipedia.org/wiki/Process_capability_index
// ─────────────────────────────────────────────────────────────────────

const CPK_USL_DEFAULT = 12; // K_PER_PHASE.critical × number_of_phases
const CPK_LSL_DEFAULT = 0;

function processCapabilityIndex(projectRoot, windowDays = 90, usl = CPK_USL_DEFAULT, lsl = CPK_LSL_DEFAULT) {
  const loopsDir = path.join(projectRoot, LOOPS_DIR);
  const roundCounts = [];

  for (const planSlug of safeReadDir(loopsDir)) {
    const journalPath = path.join(loopsDir, planSlug, 'journal.yaml');
    const content = safeReadFile(journalPath);
    if (!content) continue;

    const startedAt = getYamlField(content, 'started_at');
    if (!isWithinWindow(startedAt, windowDays)) continue;

    // Count rounds by counting occurrences of "  - round:"
    const matches = content.match(/^ {2}- round:/gm) || [];
    if (matches.length > 0) roundCounts.push(matches.length);
  }

  if (roundCounts.length < 2) {
    return {
      cpk: null,
      samples: roundCounts.length,
      window_days: windowDays,
      note: 'Need at least 2 plans with refinement-loop journals to compute Cpk.',
    };
  }

  const mean = roundCounts.reduce((a, b) => a + b, 0) / roundCounts.length;
  // Sample standard deviation (n-1 in denominator — Bessel's correction)
  const variance = roundCounts.reduce((a, b) => a + (b - mean) ** 2, 0) / (roundCounts.length - 1);
  const sigma = Math.sqrt(variance);

  if (sigma === 0) {
    // Perfect consistency — Cpk undefined; report as Infinity-bounded.
    return {
      cpk: Infinity,
      mean,
      sigma: 0,
      samples: roundCounts.length,
      window_days: windowDays,
      usl, lsl,
      note: 'Zero variance — perfect consistency. Cpk reported as Infinity.',
    };
  }

  const cpkUpper = (usl - mean) / (3 * sigma);
  const cpkLower = (mean - lsl) / (3 * sigma);
  const cpk = Math.min(cpkUpper, cpkLower);

  return {
    cpk,
    mean,
    sigma,
    samples: roundCounts.length,
    window_days: windowDays,
    usl, lsl,
  };
}

// ─────────────────────────────────────────────────────────────────────
//  Public metric: controlChart (Shewhart 3-sigma)
//
//  Standard Shewhart individuals control chart:
//    UCL = mean + 3 * sigma
//    LCL = mean - 3 * sigma
//
//  A point outside ±3σ signals "special-cause" variation — the process
//  has shifted and requires investigation. Points inside ±3σ are
//  "common-cause" — the noise of a stable process.
//
//  Reference: https://en.wikipedia.org/wiki/Shewhart_individuals_control_chart
//
//  Supported metrics:
//    "rounds"        — refinement-loop rounds per plan
//    "tokens"        — tokens per dispatch
//    "test-failures" — failed tests per verify run
// ─────────────────────────────────────────────────────────────────────

function controlChart(projectRoot, metric = 'rounds', windowDays = 90) {
  let points = [];

  if (metric === 'rounds') {
    const loopsDir = path.join(projectRoot, LOOPS_DIR);
    for (const planSlug of safeReadDir(loopsDir)) {
      const journalPath = path.join(loopsDir, planSlug, 'journal.yaml');
      const content = safeReadFile(journalPath);
      if (!content) continue;
      const startedAt = getYamlField(content, 'started_at');
      if (!isWithinWindow(startedAt, windowDays)) continue;
      const matches = content.match(/^ {2}- round:/gm) || [];
      points.push({ label: planSlug, timestamp: startedAt, value: matches.length });
    }
  } else if (metric === 'tokens') {
    for (const d of loadDispatches(projectRoot)) {
      if (!isWithinWindow(d.issuedAt, windowDays)) continue;
      if (typeof d.tokensUsed === 'number') {
        points.push({ label: d.file, timestamp: d.issuedAt, value: d.tokensUsed });
      }
    }
  } else if (metric === 'test-failures') {
    for (const d of loadDispatches(projectRoot)) {
      if (!isWithinWindow(d.issuedAt, windowDays)) continue;
      if (d.targetAgent !== 'iron-loop/verifier' && d.targetAgent !== 'quality/test-runner') continue;
      const m = d.content.match(/tests_result:[^{]*\{[^}]*failed:\s*(\d+)/);
      if (m) points.push({ label: d.file, timestamp: d.issuedAt, value: parseInt(m[1], 10) });
    }
  } else {
    return {
      error: `Unknown metric: ${metric}. Supported: rounds, tokens, test-failures.`,
    };
  }

  if (points.length < 2) {
    return {
      metric,
      window_days: windowDays,
      points,
      mean: null,
      upper_control_limit: null,
      lower_control_limit: null,
      special_cause_alerts: [],
      note: 'Need at least 2 data points to compute control limits.',
    };
  }

  const values = points.map(p => p.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  const sigma = Math.sqrt(variance);
  const ucl = mean + 3 * sigma;
  const lcl = Math.max(0, mean - 3 * sigma); // lines/rounds/tokens cannot be negative

  const alerts = [];
  for (const p of points) {
    if (p.value > ucl) {
      alerts.push({ ...p, kind: 'above-ucl', distance_sigma: sigma > 0 ? (p.value - mean) / sigma : 0 });
    } else if (sigma > 0 && p.value < lcl) {
      alerts.push({ ...p, kind: 'below-lcl', distance_sigma: (mean - p.value) / sigma });
    }
  }

  return {
    metric,
    window_days: windowDays,
    points,
    mean,
    sigma,
    upper_control_limit: ucl,
    lower_control_limit: lcl,
    special_cause_alerts: alerts,
  };
}

// ─────────────────────────────────────────────────────────────────────
//  Public metric: defectDensity
//
//  Definition:
//    defect_density = defects / (KLOC)   (defects per thousand lines of code)
//
//  Applied to the most recent shipped plan: count the lines added by the
//  plan (from the `files:` declaration and git, if available, else from
//  the body of the plan's Implementation section), and divide by the
//  count of CAPA entries opened against that plan.
//
//  Reference: IEEE Std 982.1-2005; https://en.wikipedia.org/wiki/Defect_density
// ─────────────────────────────────────────────────────────────────────

function defectDensity(projectRoot) {
  const plans = loadCompletedPlans(projectRoot)
    .filter(p => p.completedAt)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

  if (plans.length === 0) {
    return { density: null, defects: 0, kloc: 0, note: 'No shipped plans found.' };
  }

  const mostRecent = plans[0];
  const planId = mostRecent.slug;

  const capas = loadCapaRegister(projectRoot);
  const defects = capas.filter(c => c.planId === planId).length;

  const linesAdded = countLinesAddedByPlan(projectRoot, mostRecent);
  const kloc = linesAdded / 1000;

  if (kloc === 0) {
    return {
      density: null,
      defects,
      kloc: 0,
      plan_id: planId,
      note: 'Could not determine lines added by this plan.',
    };
  }

  return {
    density: defects / kloc,
    defects,
    kloc,
    lines_added: linesAdded,
    plan_id: planId,
    plan_completed_at: mostRecent.completedAt,
  };
}

/**
 * Count lines added by a plan. Strategy:
 *   1. Read the `files:` declaration from frontmatter.
 *   2. For each declared file path, if it exists, count its current
 *      line count (proxy for lines-added; assumes plans declare new
 *      or substantially-rewritten files).
 *   3. If `files:` is absent or empty, return 0 (caller handles).
 */
function countLinesAddedByPlan(projectRoot, plan) {
  const filesDeclared = extractFilesDeclaration(plan.content);
  if (filesDeclared.length === 0) return 0;
  let total = 0;
  for (const rel of filesDeclared) {
    const p = path.join(projectRoot, rel);
    const content = safeReadFile(p);
    if (!content) continue;
    total += content.split('\n').length;
  }
  return total;
}

function extractFilesDeclaration(content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return [];
  const fm = fmMatch[1];
  // Look for "files:" block
  const filesIdx = fm.search(/^files:\s*$/m);
  if (filesIdx === -1) return [];
  const after = fm.slice(filesIdx).split('\n').slice(1);
  const files = [];
  for (const line of after) {
    if (/^[a-zA-Z_]/.test(line)) break; // next top-level key
    const m = line.match(/^\s+-\s+"?(.+?)"?\s*$/);
    if (m) files.push(m[1]);
  }
  return files;
}

// ─────────────────────────────────────────────────────────────────────
//  Aggregate snapshot — used by the Andon hook and dashboards
// ─────────────────────────────────────────────────────────────────────

function snapshot(projectRoot, options = {}) {
  const windowDays = options.windowDays || 30;
  const cpkWindow = options.cpkWindowDays || 90;
  return {
    timestamp: new Date().toISOString(),
    escape_rate: escapeRate(projectRoot, windowDays),
    dpmo: defectsPerMillion(projectRoot, windowDays),
    cpk: processCapabilityIndex(projectRoot, cpkWindow),
    defect_density: defectDensity(projectRoot),
    rounds_control_chart: controlChart(projectRoot, 'rounds', cpkWindow),
  };
}

module.exports = {
  // Public metrics (per the task brief)
  escapeRate,
  defectsPerMillion,
  processCapabilityIndex,
  controlChart,
  defectDensity,

  // Aggregate
  snapshot,

  // Loaders — exposed for testing and tooling
  loadDispatches,
  loadCapaRegister,
  loadIncidents,
  loadCompletedPlans,
  countTestOpportunities,
  countLinesAddedByPlan,

  // Constants — exposed for tuning
  CPK_USL_DEFAULT,
  CPK_LSL_DEFAULT,
};
