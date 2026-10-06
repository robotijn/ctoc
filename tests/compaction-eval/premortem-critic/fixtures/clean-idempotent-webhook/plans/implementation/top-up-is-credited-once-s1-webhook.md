---
title: "A top-up is credited exactly once — the webhook handler"
type: implementation
parent_plan: functional/top-up-is-credited-once.md
files:
  - src/webhooks/payment.js
  - tests/payment.test.js
---

# A top-up is credited exactly once — the webhook handler

## Approach

`handlePaymentEvent(db, secret, rawBody, signature)` in `src/webhooks/payment.js`:

1. Verifies the signature: an HMAC-SHA256 of the raw body with the shared secret, compared
   with `crypto.timingSafeEqual`. A mismatch returns 400 and touches nothing.
2. In ONE database transaction: inserts the event id into `processed_events`, whose primary
   key is the event id, and credits the balance. A duplicate event id violates the primary key,
   the transaction rolls back, nothing is credited, and the handler returns 200 so the provider
   stops retrying. Because the insert and the credit share one transaction, two deliveries of
   one event racing each other cannot both credit: the second insert fails on the key.
3. Any other database error returns 500, so the provider retries later.

The `db` argument is the app's existing database client, whose `transaction(fn)` commits when
`fn` returns and rolls back when it throws; `processed_events` already exists with the event id
as its primary key.

## Tests

`tests/payment.test.js` delivers the same signed event twice and asserts one credit and two
200s; delivers a badly signed event and asserts 400 and no credit; and makes the credit throw
and asserts 500 with the event id not recorded.

## Acceptance criteria

The three criteria of the parent plan, each covered by a test in `tests/payment.test.js`.
