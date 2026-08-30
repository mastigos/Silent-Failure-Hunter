const express = require('express');
const router = express.Router();
const { users } = require('../lib/db');

// POST /profile - saves a user profile
// BUG (Data Contract Mismatch): writes the field as `user_name`,
// but GET /profile and the rest of the app read `username`.
// No error is thrown anywhere - the field is just silently absent
// wherever it's read, and appears as `undefined`.
router.post('/profile', (req, res) => {
  const { id, user_name, email } = req.body;
  users.set(id, { id, user_name, email }); // <-- should be `username`
  res.json({ status: 'ok' });
});

// GET /profile/:id - reads a user profile
router.get('/profile/:id', (req, res) => {
  const user = users.get(req.params.id) || {};
  // Reads `username`, which was never written by POST /profile above.
  res.json({ id: user.id, username: user.username, email: user.email });
});

module.exports = router;
