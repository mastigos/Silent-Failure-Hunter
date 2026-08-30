// Fake in-memory "database" so the app runs with zero setup.
const users = new Map();
const leaderboard = new Map(); // userId -> { score, updatedAt }
const permissionsCache = new Map(); // userId -> role, simulates a flaky lookup

module.exports = { users, leaderboard, permissionsCache };
