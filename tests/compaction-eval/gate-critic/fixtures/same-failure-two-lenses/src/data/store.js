'use strict';

const records = new Map();

/** Every record owned by the given user id. */
function recordsFor(userId) {
  return records.get(String(userId)) || [];
}

module.exports = { recordsFor };
