'use strict';

const { loadSettings } = require('../lib/settings');

/**
 * The report lines for a list of build rows: a title line, then one line per row.
 * @param {{ name: string, ms: number }[]} rows
 * @param {object} [overrides]  settings overrides
 * @returns {string[]}
 */
function main(rows, overrides = {}) {
  const settings = loadSettings(overrides);
  return [settings.title, ...rows.map((r) => `${r.name}: ${r.ms} ms`)];
}

if (require.main === module) {
  process.stdout.write(main([{ name: 'example', ms: 65000 }]).join('\n') + '\n');
}

module.exports = { main };
