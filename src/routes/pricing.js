const express = require('express');
const router = express.Router();
const { getPriceWithRetry } = require('../lib/fetchWithRetry');

router.get('/price/:itemId', async (req, res) => {
  const price = await getPriceWithRetry(req.params.itemId);
  res.json(price); // Looks like a normal successful response.
});

module.exports = router;
