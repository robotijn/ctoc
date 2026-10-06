'use strict';

const crypto = require('node:crypto');

/** True when signature is the hex HMAC-SHA256 of rawBody under secret. */
function signatureValid(secret, rawBody, signature) {
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'));
  const given = Buffer.from(String(signature || ''));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/**
 * Credits a paid top-up exactly once. The event id insert and the credit share one
 * transaction, so a duplicate delivery fails on the primary key and credits nothing.
 */
function handlePaymentEvent(db, secret, rawBody, signature) {
  if (!signatureValid(secret, rawBody, signature)) return 400;
  const event = JSON.parse(rawBody);
  try {
    db.transaction(() => {
      db.insertProcessedEvent(event.id);
      db.creditBalance(event.accountId, event.amount);
    });
    return 200;
  } catch (err) {
    if (err.code === 'DUPLICATE_KEY') return 200;
    return 500;
  }
}

module.exports = { handlePaymentEvent, signatureValid };
