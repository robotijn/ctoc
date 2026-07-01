/**
 * Product Loop library (v8.4)
 *
 * Spec: docs/PRODUCT_LOOP.md
 *
 * Loads:
 *   - .ctoc/templates/product-kpis.yaml (canonical KPI library)
 *   - .ctoc/templates/<template>/kpi-plan.yaml (template-specific defaults)
 *   - plans/canvas/<slug>-kpis.yaml (per-project plan, written by kpi-planner)
 *   - .ctoc/product-loop/reviews/YYYY-MM-DD.md (weekly reviews)
 *   - .ctoc/product-loop/experiments/<id>.yaml (A/B tests)
 *
 * Provides utility functions for kpi-planner, product-reviewer, experiment-designer.
 */

const safeFs = require('./safe-fs');
const path = require('path');

const ROOT = process.cwd();
const CANONICAL_KPI_PATH = path.join(ROOT, '.ctoc', 'templates', 'product-kpis.yaml');
const REVIEWS_DIR = path.join(ROOT, '.ctoc', 'product-loop', 'reviews');
const EXPERIMENTS_DIR = path.join(ROOT, '.ctoc', 'product-loop', 'experiments');

function ensureDir(d) { if (!safeFs.existsSync(d)) safeFs.mkdirSync(d, { recursive: true }); }
function readFile(p, fallback = '') { return safeFs.existsSync(p) ? safeFs.readFileSync(p, 'utf8') : fallback; }

// ─────────────────────────────────────────────────────────────────────
//  KPI library loading
// ─────────────────────────────────────────────────────────────────────

/**
 * Load the canonical KPI library.
 * Returns an array of KPI entries (each: { id, name, category, definition, default_target,
 * formula, event_source, applicable_to, notes }).
 */
function loadCanonicalKPIs() {
  const content = readFile(CANONICAL_KPI_PATH);
  if (!content) return [];
  const kpis = [];
  // Parse minimal YAML — extract each entry under `kpis:`
  const blockMatches = [...content.matchAll(/^\s*- id:\s*(\S+)\n([\s\S]*?)(?=^\s*- id:|^\s*#=|$)/gm)];
  for (const m of blockMatches) {
    const id = m[1];
    const body = m[2];
    const get = (key) => {
      const r = body.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm'));
      return r ? r[1].trim().replace(/^["']|["']$/g, '') : null;
    };
    const getList = (key) => {
      const r = body.match(new RegExp(`^\\s*${key}:\\s*\\[([^\\]]*)\\]`, 'm'));
      if (r) return r[1].split(',').map(s => s.trim()).filter(Boolean);
      return [];
    };
    kpis.push({
      id,
      name: get('name'),
      category: get('category'),
      definition: get('definition'),
      default_target: get('default_target'),
      formula: get('formula'),
      event_source: get('event_source'),
      applicable_to: getList('applicable_to'),
      notes: get('notes'),
    });
  }
  return kpis;
}

/**
 * Filter canonical KPIs by project type.
 * @returns {Array} applicable KPIs
 */
function getApplicableKPIs({ projectType }) {
  const canonical = loadCanonicalKPIs();
  return canonical.filter(k => {
    if (projectType && k.applicable_to && k.applicable_to.length > 0 && !k.applicable_to.includes(projectType)) return false;
    return true;
  });
}

/**
 * Load a template's kpi-plan.yaml (the launch_kpis subset).
 */
function loadTemplateKPIPlan(templateId) {
  const p = path.join(ROOT, '.ctoc', 'templates', templateId, 'kpi-plan.yaml');
  const content = readFile(p);
  if (!content) return null;
  const launchMatch = content.match(/^launch_kpis:\s*\n((?:\s+-\s+\S.*\n)+)/m);
  const launchKpis = launchMatch ? [...launchMatch[1].matchAll(/-\s+(\S+)/g)].map(x => x[1]) : [];
  return { template_id: templateId, launch_kpis: launchKpis, raw: content };
}

// ─────────────────────────────────────────────────────────────────────
//  Per-project KPI plan I/O
// ─────────────────────────────────────────────────────────────────────

function projectKPIPlanPath(slug) {
  return path.join(ROOT, 'plans', 'canvas', `${slug}-kpis.yaml`);
}

function loadProjectKPIPlan(slug) {
  const p = projectKPIPlanPath(slug);
  const content = readFile(p);
  if (!content) return null;
  return { path: p, raw: content };
}

function saveProjectKPIPlan(slug, plan) {
  const p = projectKPIPlanPath(slug);
  ensureDir(path.dirname(p));
  const yaml = renderKPIPlan(plan);
  safeFs.writeFileSync(p, yaml);
  return p;
}

function renderKPIPlan(plan) {
  const now = new Date().toISOString();
  let yaml = `schema_version: 1\nproject: ${plan.project || 'unknown'}\ncreated_at: ${now}\ncreated_by: kpi-planner\n`;
  if (plan.template_id) yaml += `template_id: ${plan.template_id}\n`;
  if (plan.activation_event) yaml += `activation_event: ${plan.activation_event}\n`;
  yaml += `\nlaunch_kpis:\n`;
  for (const k of plan.launch_kpis || []) {
    yaml += `  - id: ${k.id}\n    target: ${JSON.stringify(k.target)}\n`;
    if (k.rationale) yaml += `    rationale: ${JSON.stringify(k.rationale)}\n`;
    if (k.activation_event) yaml += `    activation_event: ${JSON.stringify(k.activation_event)}\n`;
  }
  if (plan.next_review) {
    yaml += `\nnext_review:\n`;
    for (const [k, v] of Object.entries(plan.next_review)) {
      yaml += `  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}\n`;
    }
  }
  return yaml;
}

// ─────────────────────────────────────────────────────────────────────
//  Reviews + experiments
// ─────────────────────────────────────────────────────────────────────

function listReviews() {
  if (!safeFs.existsSync(REVIEWS_DIR)) return [];
  return safeFs.readdirSync(REVIEWS_DIR).filter(f => f.endsWith('.md')).map(f => path.join(REVIEWS_DIR, f)).sort();
}

function latestReview() {
  const all = listReviews();
  return all.length > 0 ? all[all.length - 1] : null;
}

function saveReview(date, content) {
  ensureDir(REVIEWS_DIR);
  const p = path.join(REVIEWS_DIR, `${date}.md`);
  safeFs.writeFileSync(p, content);
  return p;
}

function listExperiments({ status } = {}) {
  if (!safeFs.existsSync(EXPERIMENTS_DIR)) return [];
  const files = safeFs.readdirSync(EXPERIMENTS_DIR).filter(f => f.endsWith('.yaml'));
  const out = [];
  for (const f of files) {
    const content = safeFs.readFileSync(path.join(EXPERIMENTS_DIR, f), 'utf8');
    const statusMatch = content.match(/^status:\s*(\S+)/m);
    const expStatus = statusMatch ? statusMatch[1] : 'unknown';
    if (status && expStatus !== status) continue;
    out.push({ id: f.replace(/\.yaml$/, ''), status: expStatus, path: path.join(EXPERIMENTS_DIR, f) });
  }
  return out;
}

function saveExperiment(id, content) {
  ensureDir(EXPERIMENTS_DIR);
  const p = path.join(EXPERIMENTS_DIR, `${id}.yaml`);
  safeFs.writeFileSync(p, content);
  return p;
}

// ─────────────────────────────────────────────────────────────────────
//  Review scheduling
// ─────────────────────────────────────────────────────────────────────

/**
 * When is the next review due?
 * Returns the ISO date string OR null if no schedule defined.
 */
function nextReviewDue(slug, cadenceDays = 7) {
  const plan = loadProjectKPIPlan(slug);
  if (!plan) return null;
  const reviews = listReviews();
  // Filter reviews matching this slug (best effort — check filenames)
  const last = reviews.length > 0 ? reviews[reviews.length - 1] : null;
  if (!last) {
    // No prior review — next review is 7 days after KPI plan creation
    const createdMatch = plan.raw.match(/created_at:\s*(\S+)/);
    if (!createdMatch) return null;
    const created = new Date(createdMatch[1]);
    return new Date(created.getTime() + cadenceDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
  const lastDate = path.basename(last, '.md');
  const next = new Date(`${lastDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + cadenceDays);
  return next.toISOString().slice(0, 10);
}

/**
 * Is a review overdue?
 */
function isReviewOverdue(slug, cadenceDays = 7) {
  const due = nextReviewDue(slug, cadenceDays);
  if (!due) return false;
  const today = new Date().toISOString().slice(0, 10);
  return today > due;
}

// ─────────────────────────────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────────────────────────────

module.exports = {
  // KPI library
  loadCanonicalKPIs,
  getApplicableKPIs,
  loadTemplateKPIPlan,
  // Project KPI plan
  loadProjectKPIPlan,
  saveProjectKPIPlan,
  projectKPIPlanPath,
  // Reviews
  listReviews,
  latestReview,
  saveReview,
  // Experiments
  listExperiments,
  saveExperiment,
  // Scheduling
  nextReviewDue,
  isReviewOverdue,
  // Constants
  CANONICAL_KPI_PATH,
  REVIEWS_DIR,
  EXPERIMENTS_DIR,
};
