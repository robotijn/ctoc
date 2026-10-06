'use strict';

/** Renders the reports table as HTML rows. */
function renderRows(rows) {
  return rows.map((r) => `<tr><td>${r.name}</td><td>${r.total}</td></tr>`).join('');
}

module.exports = { renderRows };
