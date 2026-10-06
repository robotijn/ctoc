---
title: "Download my data — the export endpoint"
type: implementation
parent_plan: functional/download-my-data.md
files:
  - src/routes/export.js
  - src/auth/session.js
  - src/data/store.js
---

# Download my data — the export endpoint

Let users download their data.

## Approach

`src/routes/export.js` already holds the handler, `exportHandler(req, res)`, mounted at
`GET /export?userId=<id>`. It calls `requireLogin` from `src/auth/session.js`, which sends a
person who is not signed in to the sign-in page, and then returns `store.recordsFor(userId)`
from `src/data/store.js` as JSON. The account page links to `/export?userId=<the person's id>`.

This plan wires the account page link and ships the handler as it stands.

## Acceptance criteria

The two criteria of the parent plan.
