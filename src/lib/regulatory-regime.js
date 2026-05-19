/**
 * Regulatory Regime Profile System (v6.9.27)
 *
 * Opt-in industry-grade controls activated by profile selection in
 * .ctoc/settings.yaml. Default is `none` — CTOC stays lean.
 *
 * Reads profile YAML files from .ctoc/regulatory-regimes/<profile>.yaml.
 * Each profile declares which controls it requires and per-category
 * retention windows. Multiple profiles can be stacked; controls are
 * union-merged (any profile requiring a control activates it).
 *
 * Cross-platform: uses path.join, fs.promises, no shell-outs.
 */

const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = '.ctoc/settings.yaml';
const PROFILES_DIR = '.ctoc/regulatory-regimes';

// All controls a profile can require. Used as the canonical control vocabulary.
const KNOWN_CONTROLS = new Set([
  // Cluster 1 — Evidence and Auditability
  'audit_hash_chain',           // Append-only Merkle-style audit log
  'config_baseline',            // Per-release frozen baseline with hashes
  'tool_qualification',         // Tool Confidence Level records for each tool
  'retention_schedule',         // Per-category retention windows
  'legal_hold',                 // Litigation freeze on plans and audit log
  'spoliation_safe_delete',     // Content-addressed snapshot before destructive op
  'continuous_controls_monitoring', // Nightly evidence-pack aggregation
  'ai_provenance_stamp',        // EU AI Act Article 50 machine-readable provenance

  // Cluster 2 — Independence and Segregation of Duties
  'independent_verification_validation', // IV&V chief with separate audit root
  'four_eyes_gate3',            // Two distinct approvers at Gate 3
  'privilege_posture',          // Per-plan work-product privilege classification

  // Cluster 3 — Risk Analysis Before Build
  'fmeda_design',               // Failure Modes Effects Diagnostic Analysis at Step 6
  'fault_tree_analysis',        // Top-down deductive analysis for criticality:high
  'process_fmea_loop',          // FMEA on the Iron Loop itself
  'model_risk_file',            // Per-language-model risk file (SR 11-7)
  'third_party_risk_register',  // DORA Article 28 register

  // Cluster 4 — Traceability and Reconciliation
  'requirements_traceability_matrix', // Bidirectional RTM
  'data_lineage',               // inputs_hash / outputs_hash / parent_dispatch_id
  'spec_code_reconciliation',   // Step 14.5 reconcile
  'irac_compliance_output',     // Issue-Rule-Application-Conclusion schema

  // Cluster 5 — Continuous Improvement
  'capa_register',              // Corrective and Preventive Action register
  'eight_d_incident_template',  // Ford 8D incident response
  'defects_per_million',        // DPMO and escape-rate trend
  'process_capability_index',   // Cpk for refinement loop convergence
  'andon_cord_halt',            // Auto-halt when quality drops
  'critical_control_points',    // HACCP CCP map
  'kaizen_backlog',             // 10% throughput cap for loop improvement
  'control_chart_variance',     // Common vs special-cause distinction
  'lessons_learned_closure',    // Gate-3 mandatory one-line lesson
  'defect_density_target',      // Defects per thousand lines of code by criticality
  'graceful_degradation_matrix', // Fail-operational / fail-safe / fail-silent

  // Cluster 6 — Real-time and Timing
  'wcet_budget',                // Worst-Case Execution Time analysis
  'hil_test_ladder',            // Hardware/Processor/Software/Model-in-the-Loop
  'precision_time_protocol',    // Sub-100-microsecond clock sync

  // Cluster 7 — Regulatory Operational Controls
  'dsar_handler',               // Data Subject Access Request workflow
  'cra_incident_clocks',        // EU CRA 24h/72h/14d incident reporting
  'nydfs_dora_incident_class',  // Financial regulator incident classification
  'business_continuity_plan',   // DORA Article 11 BCP with RTO/RPO
  'proportionality_test',       // FRCP 26(b)(1) burden vs benefit log on kickback
  'clm_obligations_tracker',    // Contract Lifecycle Management beyond TOS template
]);

// Retention categories used across the system.
const RETENTION_CATEGORIES = [
  'dispatches',                 // Routine dispatch audit log
  'security_incident',          // Incident response artifacts
  'gdpr_dsar_log',              // Data subject access request log
  'contract_artifacts',         // Generated legal documents
  'tax_relevant',               // Financial / billing records
  'plans',                      // Plan files (vision through done)
  'model_risk',                 // Model-risk attestations
  'baselines',                  // Per-release configuration baselines
];

/**
 * Lightweight YAML parser for the subset of YAML used by profile files.
 * Avoids adding a YAML dependency. Handles: key: value, lists, nested maps,
 * and comments. Not a general YAML parser.
 */
function parseYAMLShallow(content) {
  const out = {};
  const lines = content.split('\n');
  const stack = [{ obj: out, indent: -1 }];

  for (let raw of lines) {
    const stripped = raw.replace(/#.*$/, '');
    if (stripped.trim() === '') continue;
    const indent = raw.match(/^[ \t]*/)[0].length;

    // Pop stack until we find the right parent
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].obj;

    // List item under current parent
    const listMatch = stripped.match(/^[ \t]*-\s*(.*)$/);
    if (listMatch) {
      const value = listMatch[1].trim();
      const parentKey = stack[stack.length - 1].lastKey;
      if (parentKey && Array.isArray(parent[parentKey])) {
        parent[parentKey].push(coerce(value));
      }
      continue;
    }

    // Key: value or key: (nested)
    const kvMatch = stripped.match(/^[ \t]*([^:]+):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      const value = kvMatch[2].trim();
      if (value === '' || value === '{}' || value === '[]') {
        // Decide list vs map by peeking ahead
        const nextLine = nextNonEmpty(lines, lines.indexOf(raw));
        const isList = nextLine && /^\s*-/.test(nextLine);
        parent[key] = isList ? [] : {};
        stack.push({ obj: parent[key], indent, lastKey: key });
        stack[stack.length - 2].lastKey = key;
      } else {
        parent[key] = coerce(value);
        stack[stack.length - 1].lastKey = key;
      }
    }
  }
  return out;
}

function nextNonEmpty(lines, fromIdx) {
  for (let i = fromIdx + 1; i < lines.length; i++) {
    const s = lines[i].replace(/#.*$/, '').trim();
    if (s !== '') return lines[i];
  }
  return null;
}

function coerce(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  return v.replace(/^["']|["']$/g, '');
}

/**
 * Read the active regulatory profiles from settings.
 */
function loadActiveProfiles(projectRoot) {
  const settingsPath = path.join(projectRoot, SETTINGS_PATH);
  if (!fs.existsSync(settingsPath)) return { profiles: [], overrides: {} };

  const content = fs.readFileSync(settingsPath, 'utf8');

  // Extract just the regulatory_regime block
  const blockMatch = content.match(/^regulatory_regime:\s*\n([\s\S]*?)(?=^[a-zA-Z_]+:|\Z)/m);
  if (!blockMatch) return { profiles: [], overrides: {} };

  const block = blockMatch[1];

  // active_profiles list
  const profilesMatch = block.match(/^\s+active_profiles:\s*(?:\[([^\]]*)\]|\n((?:\s+-\s+\S+\n?)+))/m);
  let profiles = [];
  if (profilesMatch) {
    if (profilesMatch[1] !== undefined) {
      // Inline list
      profiles = profilesMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    } else if (profilesMatch[2]) {
      // Block list
      profiles = [...profilesMatch[2].matchAll(/-\s+(\S+)/g)].map(m => m[1]);
    }
  }

  // overrides map
  const overridesMatch = block.match(/^\s+overrides:\s*\n((?:\s+\S+:\s+\S+\n?)+)/m);
  let overrides = {};
  if (overridesMatch) {
    for (const line of overridesMatch[1].split('\n')) {
      const kv = line.match(/^\s+(\S+):\s+(\S+)\s*$/);
      if (kv) overrides[kv[1]] = coerce(kv[2]);
    }
  }

  return { profiles, overrides };
}

/**
 * Load a profile's required-controls and retention table.
 */
function loadProfile(projectRoot, profileName) {
  const profilePath = path.join(projectRoot, PROFILES_DIR, `${profileName}.yaml`);
  if (!fs.existsSync(profilePath)) {
    return null;
  }
  const content = fs.readFileSync(profilePath, 'utf8');
  const parsed = parseYAMLShallow(content);
  return parsed;
}

/**
 * Compute the effective control set for the active profile stack.
 * Controls are union-merged: any profile requiring a control activates it.
 * Overrides take precedence.
 */
function effectiveControls(projectRoot) {
  const { profiles, overrides } = loadActiveProfiles(projectRoot);
  const active = new Set();

  for (const profileName of profiles) {
    const profile = loadProfile(projectRoot, profileName);
    if (!profile || !Array.isArray(profile.required_controls)) continue;
    for (const c of profile.required_controls) active.add(c);
  }

  // Apply overrides
  for (const [k, v] of Object.entries(overrides)) {
    if (v === true) active.add(k);
    if (v === false) active.delete(k);
  }

  return active;
}

/**
 * Is the named control activated for the current project?
 */
function isControlEnabled(projectRoot, controlName) {
  if (!KNOWN_CONTROLS.has(controlName)) {
    throw new Error(`Unknown control: ${controlName}. Add it to KNOWN_CONTROLS in regulatory-regime.js.`);
  }
  return effectiveControls(projectRoot).has(controlName);
}

/**
 * Retention days for a category. Returns the LONGEST window required across
 * active profiles (data-protection rule: when in doubt, hold longer).
 * Falls back to the per-category default if no profile specifies one.
 */
const DEFAULT_RETENTION_DAYS = {
  dispatches: 90,
  security_incident: 2555,      // 7 years
  gdpr_dsar_log: 1095,          // 3 years
  contract_artifacts: 2555,     // 7 years
  tax_relevant: 2555,           // 7 years
  plans: 1825,                  // 5 years
  model_risk: 2555,             // 7 years
  baselines: 3650,              // 10 years
};

function retentionDays(projectRoot, category) {
  if (!RETENTION_CATEGORIES.includes(category)) {
    throw new Error(`Unknown retention category: ${category}.`);
  }
  const { profiles } = loadActiveProfiles(projectRoot);
  let maxDays = DEFAULT_RETENTION_DAYS[category] || 90;

  for (const profileName of profiles) {
    const profile = loadProfile(projectRoot, profileName);
    if (!profile || !profile.retention) continue;
    const days = profile.retention[category];
    if (typeof days === 'number' && days > maxDays) maxDays = days;
  }

  return maxDays;
}

/**
 * Summary of active regime for display in session-start banner.
 */
function regimeSummary(projectRoot) {
  const { profiles } = loadActiveProfiles(projectRoot);
  if (profiles.length === 0) return null;
  const controls = effectiveControls(projectRoot);
  return `Regulatory regime: ${profiles.join(', ')} (${controls.size} controls active)`;
}

/**
 * List all known profiles available in .ctoc/regulatory-regimes/
 */
function listAvailableProfiles(projectRoot) {
  const dir = path.join(projectRoot, PROFILES_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.yaml'))
    .map(f => f.replace(/\.yaml$/, ''))
    .sort();
}

module.exports = {
  KNOWN_CONTROLS,
  RETENTION_CATEGORIES,
  DEFAULT_RETENTION_DAYS,
  loadActiveProfiles,
  loadProfile,
  effectiveControls,
  isControlEnabled,
  retentionDays,
  regimeSummary,
  listAvailableProfiles,
};
