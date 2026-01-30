/**
 * Tab System
 * Manages tab definitions and navigation
 */

const TABS = [
  { id: 'overview', name: 'Overview' },
  { id: 'functional', name: 'Functional' },
  { id: 'implementation', name: 'Implementation' },
  { id: 'review', name: 'Review' },
  { id: 'todo', name: 'Todo' },
  { id: 'progress', name: 'Progress' },
  { id: 'tools', name: 'Tools' }
];

function getTabNames() {
  return TABS.map(t => t.name);
}

function getTabById(id) {
  return TABS.find(t => t.id === id);
}

function getTabByIndex(index) {
  return TABS[index];
}

function getTabIndex(id) {
  return TABS.findIndex(t => t.id === id);
}

function nextTab(currentIndex) {
  return (currentIndex + 1) % TABS.length;
}

function prevTab(currentIndex) {
  return (currentIndex - 1 + TABS.length) % TABS.length;
}

module.exports = {
  TABS,
  getTabNames,
  getTabById,
  getTabByIndex,
  getTabIndex,
  nextTab,
  prevTab
};
