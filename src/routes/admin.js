const express = require('express');
const router = express.Router();
const { isAdmin } = require('../lib/auth');

// DELETE /admin/wipe-data - a destructive admin-only action.
// Uses isAdmin() from lib/auth.js, which fails open on error.
router.delete('/wipe-data', (req, res) => {
  const userId = req.header('x-user-id');
  if (!isAdmin(userId)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  res.json({ status: 'wiped (simulated - nothing actually deleted in this demo)' });
});

module.exports = router;
