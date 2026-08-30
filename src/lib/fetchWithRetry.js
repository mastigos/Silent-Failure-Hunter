// Simulates fetching live pricing data from an external service
// that is currently down (always throws, for demo purposes).
async function fetchLivePrice(itemId) {
  throw new Error('pricing service unavailable');
}

let staleCache = { itemId: 'widget-1', price: 9.99, cachedAt: 'yesterday' };

// BUG (Swallowed Error): retries 3 times, and when all 3 fail,
// silently returns stale cached data as if it were fresh -
// no error, no warning, no flag on the response indicating
// the data is stale. Callers have no way to know they're
// looking at old data.
async function getPriceWithRetry(itemId) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fetchLivePrice(itemId);
    } catch (err) {
      if (attempt === 3) {
        return staleCache; // <-- the bug: silently returns stale data
      }
    }
  }
}

module.exports = { getPriceWithRetry };
