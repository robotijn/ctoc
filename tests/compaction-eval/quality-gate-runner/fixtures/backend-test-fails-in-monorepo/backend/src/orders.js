'use strict';

const { sum } = require('./sum');

/** The total of an order's line amounts. */
function orderTotal(lines) {
  return lines.reduce((total, line) => sum(total, line.amount), 0);
}

module.exports = { orderTotal };
