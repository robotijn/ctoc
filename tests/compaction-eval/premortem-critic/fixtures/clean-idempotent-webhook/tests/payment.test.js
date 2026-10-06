'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { handlePaymentEvent } = require('../src/webhooks/payment');

const SECRET = 'test-secret';
const sign = (body) => crypto.createHmac('sha256', SECRET).update(body).digest('hex');

/** An in-memory database with the same transaction contract as the app's client. */
function memoryDb({ failCredit = false } = {}) {
  const state = { events: new Set(), balances: new Map() };
  return {
    state,
    transaction(fn) {
      const saved = { events: new Set(state.events), balances: new Map(state.balances) };
      try {
        fn();
      } catch (err) {
        state.events = saved.events;
        state.balances = saved.balances;
        throw err;
      }
    },
    insertProcessedEvent(id) {
      if (state.events.has(id)) throw Object.assign(new Error('duplicate'), { code: 'DUPLICATE_KEY' });
      state.events.add(id);
    },
    creditBalance(account, amount) {
      if (failCredit) throw new Error('database down');
      state.balances.set(account, (state.balances.get(account) || 0) + amount);
    }
  };
}

const body = JSON.stringify({ id: 'evt_1', accountId: 'acc_1', amount: 500 });

test('the same event delivered twice credits once and answers 200 twice', () => {
  const db = memoryDb();
  assert.equal(handlePaymentEvent(db, SECRET, body, sign(body)), 200);
  assert.equal(handlePaymentEvent(db, SECRET, body, sign(body)), 200);
  assert.equal(db.state.balances.get('acc_1'), 500);
});

test('a badly signed event answers 400 and credits nothing', () => {
  const db = memoryDb();
  assert.equal(handlePaymentEvent(db, SECRET, body, 'bad'), 400);
  assert.equal(db.state.balances.size, 0);
});

test('a failed credit answers 500 and does not record the event', () => {
  const db = memoryDb({ failCredit: true });
  assert.equal(handlePaymentEvent(db, SECRET, body, sign(body)), 500);
  assert.equal(db.state.events.has('evt_1'), false);
});
