'use strict';

const ROWS = Object.freeze([{ region: 'north', total: 120 }, { region: 'south', total: 80 }]);

/**
 * The reporting database. This project answers every query from fixed rows.
 * @param {string} sql
 * @returns {object[]}
 */
function query(sql) {
  if (typeof sql !== 'string') throw new Error('query must be text');
  return ROWS.slice();
}

module.exports = { query };
