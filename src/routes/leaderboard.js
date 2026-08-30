const express = require('express');
const router = express.Router();
const { leaderboard } = require('../lib/db');

// POST /leaderboard/:userId/score - updates a user's score.
// BUG (Race Condition): reads-then-writes with an artificial
// delay (simulating a real async DB round trip) and no locking.
// Two concurrent requests can interleave so the LOSER of the
// race overwrites the WINNER, with no error and no indication
// anything went wrong - the leaderboard just quietly shows a
// lower score than it should.
router.post('/:userId/score', async (req, res) => {
  const { userId } = req.params;
  const { newScore } = req.body;

  const current = leaderboard.get(userId) || { score: 0 };

  // Simulated async I/O delay - this is where the race window opens.
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 50));

  // Only writes if newScore is higher... using the STALE `current`
  // read from before the delay, not a fresh read. Two concurrent
  // requests can both read the same stale `current` and both decide
  // to write, with whichever finishes last "winning" regardless of
  // which score is actually higher.
  if (newScore > current.score) {
    leaderboard.set(userId, { score: newScore, updatedAt: Date.now() });
  }

  res.json({ status: 'ok' });
});

router.get('/:userId', (req, res) => {
  res.json(leaderboard.get(req.params.userId) || { score: 0 });
});

module.exports = router;
