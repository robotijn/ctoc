'use strict';

const { sum } = require('./sum');

/** One line naming the total of two amounts. */
function formatTotal(a, b) {
  return `Total: ${sum(a, b)}`;
}

module.exports = { formatTotal };
