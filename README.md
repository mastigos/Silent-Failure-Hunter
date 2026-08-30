# Quiet Fail Demo App

A small demo app built for the IBM TechXchange Dev Day Hackathon,
used to demonstrate Silent Failure Hunter's ability to find bugs
that don't throw errors or fail tests.

## Endpoints
- POST /profile — save a user profile
- GET /profile/:id — read a user profile
- DELETE /admin/wipe-data — admin-only destructive action (x-user-id header)
- POST /leaderboard/:userId/score — update a leaderboard score
- GET /leaderboard/:userId — read a leaderboard score
- GET /pricing/price/:itemId — get item pricing

## Run
npm install && npm start
