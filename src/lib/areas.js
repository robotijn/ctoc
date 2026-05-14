/**
 * Areas — top-level menu abstraction (A3 / CTOC v7)
 *
 * 5 task-aligned areas replace the 8-tab system:
 *   1. Pipeline  — default landing, 3-section view (Business/Implementation/Execution)
 *   2. Inbox     — async-overnight surface (questions, decisions, plans-at-gates)
 *   3. Agent     — agent control (status, budget, schedule)
 *   4. Library   — browse agents, skills, slash commands
 *   5. System    — doctor, update, settings, logs
 *
 * tabs.js becomes a compatibility shim that re-exports AREAS as TABS so existing
 * lookups (e.g., TABS.findIndex(t => t.id === 'tools')) continue working.
 * Per A3 impl plan ADR-1 and I6 refinement.
 */

const AREAS = Object.freeze([
  Object.freeze({ id: 'pipeline', name: 'Pipeline', shortcut: '1' }),
  Object.freeze({ id: 'inbox',    name: 'Inbox',    shortcut: '2' }),
  Object.freeze({ id: 'agent',    name: 'Agent',    shortcut: '3' }),
  Object.freeze({ id: 'library',  name: 'Library',  shortcut: '4' }),
  Object.freeze({ id: 'system',   name: 'System',   shortcut: '5' }),
]);

// I6: old tab IDs map to areas. When TUI code or any caller looks up a stale
// tab ID, the shim resolves to the right area's index.
const TAB_TO_AREA = Object.freeze({
  overview:       'pipeline',
  vision:         'pipeline',
  functional:     'pipeline',
  implementation: 'pipeline',
  review:         'pipeline',
  todo:           'pipeline',
  progress:       'agent',
  tools:          'system',
});

function listAreas() {
  return AREAS;
}

function getAreaById(id) {
  return AREAS.find(a => a.id === id);
}

function getAreaByIndex(index) {
  return AREAS[index];
}

function getAreaIndex(id) {
  const idx = AREAS.findIndex(a => a.id === id);
  if (idx !== -1) return idx;
  // I6: fall back to old-tab-id mapping
  const mappedAreaId = TAB_TO_AREA[id];
  if (mappedAreaId) return AREAS.findIndex(a => a.id === mappedAreaId);
  return -1;
}

function nextArea(currentIndex) {
  return (currentIndex + 1) % AREAS.length;
}

function prevArea(currentIndex) {
  return (currentIndex - 1 + AREAS.length) % AREAS.length;
}

module.exports = {
  AREAS,
  TAB_TO_AREA,
  listAreas,
  getAreaById,
  getAreaByIndex,
  getAreaIndex,
  nextArea,
  prevArea,
};
