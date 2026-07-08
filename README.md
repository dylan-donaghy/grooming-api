# Scrum Poker / Grooming Estimation API

A small real-time API for running planning poker / backlog grooming sessions. Users sign up with a name, submit fibonacci estimates, and see everyone's votes update live via WebSockets, without needing to refresh the page.
Built as a hand-on exercise to practice Node.js, TypeScript, Express, and WebSockets.

## Features

- Sign up with a name to join the session
- Submit or update a fibonacci estimate
- Toggle showing/hiding everyone's estimates
- Reset all estimates back to null
- Live updates automatically pushed to all connected users whenever anything changes

## Prerequisites
- Node.js v22 or later
- npm

## Setup

1. Clone the repository and install dependencies:
```bash
   git clone https://github.com/dylan-donaghy/grooming-api.git
   cd grooming-api
   npm install
```

2. Start the backend server:
```bash
   npm run dev
```
   This runs `src/server.ts` directly via Node (using `--watch`, so the server automatically restarts whenever you save a server file). The API will be running at `http://localhost:3000`.
 
3. In a separate terminal, compile and serve the frontend:
```bash
   npm run frontend
```
 
   This compiles `main.ts`/`api.ts` into plain JavaScript, then serves `index.html` and the compiled files. Visit the URL printed in the terminal (typically `http://localhost:5173` if using vite) to open the app.
 
4. Open the app in two or more browser tabs to see live updates working, actions taken in one tab (signing up, voting, resetting, toggling visibility) will automatically appear in the others.
**Note:** Data is stored in memory only. Every time the server restarts (including automatically, via `--watch`, whenever you save a server file), all signed-up users and their estimates are cleared.
 
## REST API Reference
 
All endpoints are served from `http://localhost:3000`. Responses follow the shape `{ data: {...} }` on success or `{ errors: [{ message: "..." }] }` on failure.
 
### `POST` \`/api/signup\`
 
Registers a new user.
 
**Request body:**
```json
{ "name": "Dylan" }
```
 
**Success response:**
```json
{ "data": { "id": "1", "name": "Dylan" } }
```
 
The returned `id` must be stored by the client and sent with future requests (e.g. submitting an estimate) to identify that user.
 
---
 
### `POST /api/estimation`
 
Submits or updates the calling user's estimate.
 
**Request body:**
```json
{ "userId": "1", "estimation": "8" }
```
 
`estimation` accepts any fibonacci card value as a string (`"1"`, `"2"`, `"3"`, `"5"`, `"8"`, `"13"`), or `"☕"` to indicate a break / unable to estimate.
 
**Success response:**
```json
{ "data": { "id": "1", "name": "Dylan", "estimation": "8" } }
```
 
---
 
### `POST /api/resetEstimation`
 
Clears every user's estimate back to `null`. Affects all users, not just the caller.
 
**Request body:** none required (send an empty object `{}`)
 
**Success response:**
```json
{ "data": { "message": "All estimations have been reset" } }
```
 
---
 
### `POST /api/toggleVisibility`
 
Flips whether estimates are currently visible to everyone or hidden.
 
**Request body:** none required (send an empty object `{}`)
 
**Success response:**
```json
{ "data": { "visible": true } }
```
 
---
 
### `GET /api/users`
 
Returns every signed-up user and whether estimates are currently visible. Used by the frontend to render the participants table.
 
**Success response:**
```json
{
  "data": {
    "users": [
      { "id": "1", "name": "Dylan", "estimation": "8" }
    ],
    "visible": true
  }
}
```
 
## WebSocket Reference
 
Connect to:
 
```
ws://localhost:3000
```
 
Once connected, the server pushes a message to **every** connected client whenever any of the actions above happen. Clients are expected to respond to any incoming message by re-fetching `GET /api/users` and re-rendering the participant list.
 
Message shape:
 
```json
{ "type": "USER_JOINED" }
```
 
Possible `type` values:
 
| Type | Sent when |
|---|---|
| `USER_JOINED` | A new user signs up |
| `ESTIMATION_UPDATED` | Any user submits or changes their estimate |
| `RESET` | All estimates are cleared |
| `VISIBILITY_UPDATED` | The show/hide toggle is flipped |
 
The current implementation doesn't branch on `type` — any incoming message simply triggers a full refresh of the participant list. The `type` field is included so this can be made more granular later if needed.
 
## Dependencies
 
| Package | Why it's used |
|---|---|
| `express` | Handles HTTP routing so the API endpoints don't need to be built on raw Node networking code |
| `cors` | Allows the frontend (served from a different port) to make requests to the API without the browser blocking them |
| `ws` | Provides the WebSocket server used to push live updates to connected clients |
| `typescript` | Lets the project be written in TypeScript, catching type errors before runtime |
| `@types/express`, `@types/cors`, `@types/ws`, `@types/node` | Type definitions for the above libraries, so TypeScript can type-check and autocomplete their usage (these libraries aren't written in TypeScript themselves) |
| `http-server` | Simple static file server used to serve the compiled frontend during development |
| `vite` | (Optional) used during development for faster frontend iteration |
 
## Known Limitations
 
- **In-memory storage only** — no database. All data is lost on server restart.
- **Single shared room** — there's no concept of multiple separate sessions, every connected user joins the same estimation board.
- **No reconnection handling** — if a client's WebSocket connection drops, it won't automatically retry connecting.

## Project Structure
 
```
grooming-api/
  src/
    frontend/
        api.ts
        index.html
        main.ts
        styles.css
    routes/
        users.ts
    server.ts
  package.json
  tsconfig.json
```