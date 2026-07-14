/**
 * Sections — task-aligned grouping of plan stages (A2 / CTOC v7)
 *
 * Stages remain canonical (defined in state.js, menu-screens.js, etc.).
 * Sections are a thin grouping layer on top.
 *
 * Pipeline Philosophy: pre-todo is context-building, todo+ is execution.
 *   Business       = vision · canvas · functional   (WHY + WHO + WHAT)
 *   Implementation = implementation · todo          (HOW + ready-to-execute)
 *   Execution      = in-progress · review · done    (doing · verifying · shipped)
 *
 * See: /Users/doctony/Code/ctoc/plans/done/ctoc-v7-business-first-architecture.md
 *      CLAUDE.md "Pipeline Philosophy" section
 */

const safeFs = require('./safe-fs');
const path = require('path');

const SECTIONS = Object.freeze({
  business:       Object.freeze(['vision', 'canvas', 'functional']),
  implementation: Object.freeze(['implementation', 'todo']),
  execution:      Object.freeze(['in-progress', 'review', 'done']),
});

const SECTION_LABELS = Object.freeze({
  business: 'Business',
  implementation: 'Implementation',
  execution: 'Execution',
});

/**
 * Stage -> section name.
 * @param {string} stage
 * @returns {'business'|'implementation'|'execution'|null}
 */
function getSectionForStage(stage) {
  for (const [section, stages] of Object.entries(SECTIONS)) {
    // Object.entries widens the key to `string`; SECTIONS is frozen, so the key
    // is necessarily one of the three section names — narrow it back.
    if (stages.includes(stage)) return /** @type {'business'|'implementation'|'execution'} */ (section);
  }
  return null;
}

/**
 * Section -> stages in canonical order.
 * @param {string} section
 * @returns {string[]}
 */
function getStagesInSection(section) {
  return SECTIONS[section] ? Array.from(SECTIONS[section]) : [];
}

/**
 * Section -> display label.
 * @param {string} section
 * @returns {string}
 */
function getSectionLabel(section) {
  return SECTION_LABELS[section] || section;
}

/**
 * Default dashboard preferences.
 */
const DEFAULT_PREFS = Object.freeze({
  collapsed: { business: false, implementation: false, execution: false },
});

/**
 * Load dashboard preferences (collapse state) from .ctoc/state/dashboard-prefs.json.
 *
 * I5: On JSON corruption, falls back to defaults WITHOUT deleting the corrupt
 * file (user can inspect). On next successful save, the file is overwritten.
 *
 * @param {string} projectRoot - Project root path
 * @returns {{collapsed: Object}}
 */
function loadDashboardPrefs(projectRoot) {
  const prefsFile = path.join(projectRoot, '.ctoc', 'state', 'dashboard-prefs.json');
  if (!safeFs.existsSync(prefsFile)) {
    return JSON.parse(JSON.stringify(DEFAULT_PREFS));
  }
  try {
    const parsed = JSON.parse(safeFs.readFileSync(prefsFile, 'utf8'));
    // Merge with defaults so missing keys don't cause undefineds downstream
    return {
      collapsed: {
        business: parsed?.collapsed?.business ?? false,
        implementation: parsed?.collapsed?.implementation ?? false,
        execution: parsed?.collapsed?.execution ?? false,
      },
    };
  } catch (err) {
    // I5: corrupt file — log to stderr, return defaults, do NOT delete
    console.error(`[ctoc] dashboard-prefs.json corrupt (${err.message}); using defaults`);
    return JSON.parse(JSON.stringify(DEFAULT_PREFS));
  }
}

/**
 * Save dashboard preferences. Creates .ctoc/state/ if missing.
 *
 * @param {{collapsed: Object}} prefs
 * @param {string} projectRoot - Project root path
 */
function saveDashboardPrefs(prefs, projectRoot) {
  const stateDir = path.join(projectRoot, '.ctoc', 'state');
  if (!safeFs.existsSync(stateDir)) {
    safeFs.mkdirSync(stateDir, { recursive: true });
  }
  const prefsFile = path.join(stateDir, 'dashboard-prefs.json');
  safeFs.writeFileSync(prefsFile, JSON.stringify(prefs, null, 2));
}

module.exports = {
  SECTIONS,
  getSectionForStage,
  getStagesInSection,
  getSectionLabel,
  loadDashboardPrefs,
  saveDashboardPrefs,
};
