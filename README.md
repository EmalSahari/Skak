# Skak — Online Chess for 2, 3 & 4 Players

Real-time multiplayer chess. Create a room, share the 4-letter code, and play
classic 2-player chess or free-for-all games with 3 or 4 armies.

## Features

- **2-player** — full standard chess: legal-move validation, check, checkmate,
  stalemate, castling, en passant, and pawn promotion (with under-promotion).
- **3-player** & **4-player** — free-for-all on the cross board. When a player is
  checkmated they are eliminated and their pieces leave the board; the last
  army standing wins.
- **Single player** — play offline against the built-in bot (Easy / Normal /
  Hard) in any mode: one computer in 2-player, or two/three computers in the
  3- and 4-player games. The bot runs entirely in the browser.
- **Clocks & controls** — optional time controls (3+2, 5, 10 min) with
  server-authoritative flag-fall, plus resign, draw offers (2p), a move-history
  list, and a rematch button.
- **Accounts & leaderboards** (optional) — sign up with a username, password,
  country, and (optional) email to get an Elo rating. Online 2-player games are
  ranked with Elo; 3- and 4-player games feed a separate "wins" board. Guests
  can still play by link without an account.
- **Matchmaking** — "Play a stranger" pairs you with another player searching
  the same mode, with a live estimated wait.
- **AI coach** (optional) — a post-game "Review game" button asks an LLM for a
  short, friendly review of the game. Requires `OPENAI_API_KEY` on the server.
- **Real-time rooms** over WebSockets (Socket.IO) with auto-start when full,
  reconnect-on-refresh, a player list, turn/check indicators, and room chat.

## Project layout

This is an npm-workspaces monorepo:

| Package           | What it is                                                        |
| ----------------- | ----------------------------------------------------------------- |
| `packages/shared` | Game model, the chess engine (rules for every mode), and the network protocol. Shared by both client and server. |
| `packages/server` | Express + Socket.IO server. Authoritative room & game state.      |
| `packages/client` | React + TypeScript + Vite web app.                                |

The server is authoritative: it validates every move with the same engine the
client uses to preview legal moves, then broadcasts the new board to the room.

## Getting started

```bash
npm install        # install all workspaces
npm run dev         # runs the server (:3001) and the client (:5173) together
```

Open http://localhost:5173, create a game, and open the same URL (or the copied
room link) in another tab/device to join. A 2-player game starts automatically
once 2 players join; 3- and 4-player games start when their seats are full.

Set `VITE_SERVER_URL` for the client if the server is not on `host:3001`.

### Accounts & leaderboard (optional)

Accounts, ratings, and leaderboards need a Postgres database. The app runs fine
without one — it just disables sign-up and leaves games unranked. To enable it,
set these environment variables on the server:

| Variable       | Purpose                                                        |
| -------------- | -------------------------------------------------------------- |
| `DATABASE_URL` | Postgres connection string (e.g. a free [Neon](https://neon.tech) database). The schema is created automatically on boot. |
| `AUTH_SECRET`  | Secret used to sign auth tokens. Set a long random value.      |
| `OPENAI_API_KEY` | (Optional) Enables the post-game "AI coach" review. Without it, the Review button is hidden. The key is only ever used server-side. |
| `OPENAI_MODEL` | (Optional) Model for reviews; defaults to `gpt-4o-mini`.        |

Passwords are stored hashed (scrypt); only username, optional email, and a
two-letter country code are kept.

## Other commands

```bash
npm test            # run the chess-engine test suite
npm run build       # production build of every package
```

## Notes on the 3- and 4-player rules

The 3- and 4-player modes use a 14×14 cross board (the four 3×3 corners are
removed). 4-player seats all four armies; 3-player uses three and leaves the
fourth arm open. These are simplified, self-consistent free-for-all rulesets —
a dedicated hexagonal 3-player board could be added later.
