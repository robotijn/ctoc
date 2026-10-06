'use strict';

const { requireLogin } = require('../auth/session');
const store = require('../data/store');

/** GET /export?userId=<id> — every record of that user, as one JSON download. */
function exportHandler(req, res) {
  if (!requireLogin(req, res)) return;
  const records = store.recordsFor(req.query.userId);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="my-data.json"');
  res.end(JSON.stringify(records));
}

module.exports = { exportHandler };
