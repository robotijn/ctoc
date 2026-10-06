'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { sum } = require('../src/sum');
const { formatTotal } = require('../src/report');

test('sum adds two amounts', () => {
  assert.equal(sum(2, 3), 5);
});

test('formatTotal names the total', () => {
  assert.equal(formatTotal(2, 3), 'Total: 5');
});
