'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { orderTotal } = require('../src/orders');

test('orderTotal adds every line', () => {
  assert.equal(orderTotal([{ amount: 2 }, { amount: 3 }]), 5);
});

test('orderTotal rejects an order with no lines', () => {
  assert.throws(() => orderTotal([]), /an order needs at least one line/);
});
