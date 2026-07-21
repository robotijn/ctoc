/**
 * Tabs (compatibility shim) — re-exports AREAS as TABS so existing callers
 * (TUI code, src/commands/start.js) keep working during the A3 transition.
 *
 * NEW CODE: import from `./areas` directly. This shim is for backward compat only.
 * See: /Users/doctony/Code/ctoc/plans/in-progress/A3-menu-rethink-impl.md (I6 refinement)
 */

const {
  AREAS,
  getAreaById,
  getAreaByIndex,
  getAreaIndex,
  nextArea,
  prevArea,
} = require('./areas');

// Re-export AREAS as TABS for legacy callers
const TABS = AREAS;

function getTabNames() {
  return AREAS.map(a => a.name);
}

function getTabById(id) {
  return getAreaById(id);
}

function getTabByIndex(index) {
  return getAreaByIndex(index);
}

// I6: getTabIndex resolves old tab ids to area indexes via the shim.
// Callers like `TABS.findIndex(t => t.id === 'tools')` in src/commands/start.js
// continue working because getAreaIndex falls back to TAB_TO_AREA mapping.
function getTabIndex(id) {
  return getAreaIndex(id);
}

function nextTab(currentIndex) {
  return nextArea(currentIndex);
}

function prevTab(currentIndex) {
  return prevArea(currentIndex);
}

module.exports = {
  TABS,
  getTabNames,
  getTabById,
  getTabByIndex,
  getTabIndex,
  nextTab,
  prevTab,
};
