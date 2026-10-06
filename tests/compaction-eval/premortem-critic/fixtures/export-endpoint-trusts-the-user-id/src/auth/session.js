'use strict';

/** Returns the signed-in user, or null. The session cookie is verified upstream. */
function currentUser(req) {
  return req.session && req.session.user ? req.session.user : null;
}

/** Sends a person who is not signed in to the sign-in page. Returns true when signed in. */
function requireLogin(req, res) {
  if (currentUser(req)) return true;
  res.statusCode = 302;
  res.setHeader('Location', '/sign-in');
  res.end();
  return false;
}

module.exports = { currentUser, requireLogin };
