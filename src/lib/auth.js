const { permissionsCache } = require('./db');

// Simulates a permission lookup that occasionally throws
// (e.g. a timeout talking to a permissions service).
function lookupRole(userId) {
  if (userId === 'flaky-user') {
    throw new Error('permission service timeout');
  }
  return permissionsCache.get(userId) || 'guest';
}

// BUG (Fail-Open): if the lookup throws, the catch block
// defaults `role` to 'admin' instead of denying access.
// This never surfaces as an error - the request just succeeds
// with elevated privileges it should never have had.
function isAdmin(userId) {
  try {
    const role = lookupRole(userId);
    return role === 'admin';
  } catch (err) {
    // Should fail CLOSED (return false) - instead fails OPEN.
    return true; // <-- the bug
  }
}

module.exports = { isAdmin };
