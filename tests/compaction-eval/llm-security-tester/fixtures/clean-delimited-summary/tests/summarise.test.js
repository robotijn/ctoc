'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { summarise, CALLS_PER_HOUR } = require('../src/summarise');

test('a document is summarised', () => {
  assert.equal(summarise('ana', 'The parcel left the depot.'), 'A short summary.');
});

test('an over-long document and a missing user are rejected', () => {
  assert.throws(() => summarise('ana', 'x'.repeat(8001)), /input rejected/);
  assert.throws(() => summarise('', 'text'), /input rejected/);
});

test('a user over the hourly budget is refused', () => {
  const now = 1000;
  for (let i = 0; i < CALLS_PER_HOUR; i++) summarise('ben', 'text', now);
  assert.throws(() => summarise('ben', 'text', now), /budget exceeded/);
  assert.equal(summarise('ben', 'text', now + 60 * 60 * 1000), 'A short summary.');
});
