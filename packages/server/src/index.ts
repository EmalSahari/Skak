import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@skak/shared';
import { RoomManager, type Account, type Room } from './rooms.js';
import { Matchmaker } from './matchmaking.js';
import {
  createUser,
  dbEnabled,
  findById,
  findByUsername,
  initDb,
  leaderboard,
  refundReview,
  setBoardTheme,
  tryConsumeReview,
  usernameTaken,
} from './db.js';
import { hashPassword, signToken, verifyToken, verifyPassword } from './auth.js';
import { coachEnabled, reviewGame } from './coach.js';
import {
  billingEnabled,
  createCheckoutSession,
  createPortalSession,
  handleWebhook,
} from './billing.js';
import { BOARD_THEMES, type BoardTheme } from '@skak/shared';

const PORT = Number(process.env.PORT) || 3001;
const ORIGIN = process.env.CLIENT_ORIGIN || '*';

const app = express();
app.use(cors({ origin: ORIGIN }));

// Stripe webhook MUST receive the raw body to verify the signature, so it is
// registered with express.raw before the global express.json() middleware.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const result = await handleWebhook(req.body as Buffer, req.headers['stripe-signature'] as string | undefined);
  if (!result.ok) return res.status(400).send(result.error ?? 'Bad request');
  res.json({ received: true });
});

app.use(express.json());
app.get('/health', (_req, res) =>
  res.json({ ok: true, accounts: dbEnabled, coach: coachEnabled, billing: billingEnabled }),
);

// Lightweight per-IP rate limit for the (paid) review endpoint.
const reviewHits = new Map<string, number[]>();
function reviewAllowed(ip: string): boolean {
  const now = Date.now();
  const hits = (reviewHits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= 6) return false;
  hits.push(now);
  reviewHits.set(ip, hits);
  return true;
}

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

async function resolveAccount(token: string | undefined): Promise<Account | null> {
  const uid = verifyToken(token);
  if (uid == null) return null;
  const user = await findById(uid);
  if (!user) return null;
  return {
    userId: user.id,
    username: user.username,
    rating: user.elo,
    country: user.country,
    pro: user.pro,
  };
}

app.post('/api/signup', async (req, res) => {
  if (!dbEnabled) return res.status(503).json({ ok: false, error: 'Accounts are not set up yet.' });
  const { username, email, password, country } = req.body ?? {};
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return res.json({ ok: false, error: 'Username must be 3–20 letters, numbers, or underscores.' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.json({ ok: false, error: 'Password must be at least 6 characters.' });
  }
  try {
    if (await usernameTaken(username)) {
      return res.json({ ok: false, error: 'That username is taken.' });
    }
    const user = await createUser(
      username,
      typeof email === 'string' && email ? email.slice(0, 200) : null,
      hashPassword(password),
      typeof country === 'string' && country ? country.slice(0, 2).toUpperCase() : null,
    );
    return res.json({ ok: true, token: signToken(user.id), user });
  } catch (err) {
    console.error('signup failed', err);
    return res.status(500).json({ ok: false, error: 'Could not create account.' });
  }
});

app.post('/api/login', async (req, res) => {
  if (!dbEnabled) return res.status(503).json({ ok: false, error: 'Accounts are not set up yet.' });
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.json({ ok: false, error: 'Missing credentials.' });
  }
  try {
    const row = await findByUsername(username);
    if (!row || !verifyPassword(password, row.password_hash)) {
      return res.json({ ok: false, error: 'Wrong username or password.' });
    }
    const { password_hash, ...user } = row;
    void password_hash;
    return res.json({ ok: true, token: signToken(user.id), user });
  } catch (err) {
    console.error('login failed', err);
    return res.status(500).json({ ok: false, error: 'Could not log in.' });
  }
});

app.get('/api/me', async (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  const uid = verifyToken(token);
  if (uid == null) return res.json({ ok: false, error: 'Not signed in.' });
  const user = await findById(uid);
  return user ? res.json({ ok: true, user }) : res.json({ ok: false, error: 'Account not found.' });
});

app.get('/api/leaderboard', async (_req, res) => {
  res.json(await leaderboard());
});

app.post('/api/review', async (req, res) => {
  if (!coachEnabled) {
    return res.json({ ok: false, error: 'Game review is not enabled on this server.' });
  }
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  const uid = verifyToken(token);
  if (uid == null) {
    return res.json({ ok: false, error: 'Sign in to use the AI coach.' });
  }
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'anon';
  if (!reviewAllowed(ip)) {
    return res.json({ ok: false, error: 'Too many reviews — give it a minute.' });
  }
  const quota = await tryConsumeReview(uid);
  if (!quota.allowed) {
    return res.json({
      ok: false,
      error: `Daily free reviews used (${quota.limit}/day). Upgrade to Pro for unlimited reviews.`,
    });
  }
  const { mode, result, players, transcript } = req.body ?? {};
  if (typeof transcript !== 'string' || !Array.isArray(players) || !['2p', '3p', '4p'].includes(mode)) {
    await refundReview(uid);
    return res.json({ ok: false, error: 'Invalid review request.' });
  }
  const out = await reviewGame({ mode, result: String(result ?? ''), players, transcript });
  if (!out.ok && !quota.isPro) await refundReview(uid);
  res.json(out);
});

app.post('/api/billing/checkout', async (req, res) => {
  const uid = verifyToken(req.headers.authorization?.replace(/^Bearer /, ''));
  if (uid == null) return res.json({ ok: false, error: 'Sign in to upgrade.' });
  const user = await findById(uid);
  if (!user) return res.json({ ok: false, error: 'Account not found.' });
  res.json(await createCheckoutSession(uid, user.username, null));
});

app.post('/api/billing/portal', async (req, res) => {
  const uid = verifyToken(req.headers.authorization?.replace(/^Bearer /, ''));
  if (uid == null) return res.json({ ok: false, error: 'Sign in first.' });
  res.json(await createPortalSession(uid));
});

app.post('/api/me/theme', async (req, res) => {
  const uid = verifyToken(req.headers.authorization?.replace(/^Bearer /, ''));
  if (uid == null) return res.json({ ok: false, error: 'Sign in first.' });
  const user = await findById(uid);
  if (!user?.pro) return res.json({ ok: false, error: 'Custom board themes are a Pro perk.' });
  const theme = req.body?.theme;
  if (theme !== null && !BOARD_THEMES.includes(theme)) {
    return res.json({ ok: false, error: 'Unknown theme.' });
  }
  const updated = await setBoardTheme(uid, theme as BoardTheme | null);
  return updated ? res.json({ ok: true, user: updated }) : res.json({ ok: false, error: 'Could not update.' });
});

// Serve the built client (if present) so the whole app runs on one origin.
const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  console.log(`Serving client from ${clientDist}`);
}

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: ORIGIN },
});

function broadcast(room: Room) {
  io.to(room.id).emit('room:state', manager.sync(room));
}

const manager = new RoomManager(broadcast);

/** Maps each connected socket to the room/player it is currently controlling. */
const sessions = new Map<string, { roomId: string; playerId: string }>();

const matchmaker = new Matchmaker(
  io,
  manager,
  (socketId, roomId, playerId) => {
    sessions.set(socketId, { roomId, playerId });
    manager.bindSocket(roomId, playerId, socketId);
  },
  broadcast,
);

io.on('connection', (socket) => {
  const session = () => sessions.get(socket.id);

  const enter = (roomId: string, playerId: string) => {
    sessions.set(socket.id, { roomId, playerId });
    socket.join(roomId);
    manager.bindSocket(roomId, playerId, socket.id);
  };

  socket.on('room:create', async (req, cb) => {
    const account = await resolveAccount(req.authToken);
    const { room, player } = manager.create(
      req.mode,
      req.name,
      req.timeControl ?? null,
      account,
      req.rated ?? true,
    );
    enter(room.id, player.id);
    cb({ ok: true, roomId: room.id, playerId: player.id, token: player.token });
    broadcast(room);
  });

  socket.on('room:join', async (req, cb) => {
    const account = await resolveAccount(req.authToken);
    const result = manager.join(req.roomId, req.name, account);
    if ('error' in result) {
      cb({ ok: false, error: result.error });
      return;
    }
    enter(result.room.id, result.player.id);
    cb({ ok: true, roomId: result.room.id, playerId: result.player.id, token: result.player.token });
    broadcast(result.room);
  });

  socket.on('room:rejoin', (req, cb) => {
    const result = manager.rejoin(req.roomId, req.token);
    if ('error' in result) {
      cb({ ok: false, error: result.error });
      return;
    }
    enter(result.room.id, result.player.id);
    cb({ ok: true, roomId: result.room.id, playerId: result.player.id, token: result.player.token });
    broadcast(result.room);
  });

  socket.on('room:start', (req, cb) => {
    const s = session();
    if (!s) return cb({ ok: false, error: 'Not in a room' });
    const result = manager.start(req.roomId, s.playerId);
    if (result.error) return cb({ ok: false, error: result.error });
    cb({ ok: true });
    const room = manager.get(req.roomId);
    if (room) broadcast(room);
  });

  socket.on('game:move', (req, cb) => {
    const s = session();
    if (!s) return cb({ ok: false, error: 'Not in a room' });
    const result = manager.move(req.roomId, s.playerId, req.move);
    if (result.error) return cb({ ok: false, error: result.error });
    cb({ ok: true });
    const room = manager.get(req.roomId);
    if (room) broadcast(room);
  });

  socket.on('game:resign', (req, cb) => {
    const s = session();
    if (!s) return cb({ ok: false, error: 'Not in a room' });
    const result = manager.resign(req.roomId, s.playerId);
    if (result.error) return cb({ ok: false, error: result.error });
    cb({ ok: true });
    const room = manager.get(req.roomId);
    if (room) broadcast(room);
  });

  socket.on('game:draw-offer', (req, cb) => {
    const s = session();
    if (!s) return cb({ ok: false, error: 'Not in a room' });
    const result = manager.offerDraw(req.roomId, s.playerId);
    if (result.error) return cb({ ok: false, error: result.error });
    cb({ ok: true });
    const room = manager.get(req.roomId);
    if (room) broadcast(room);
  });

  socket.on('game:draw-respond', (req, cb) => {
    const s = session();
    if (!s) return cb({ ok: false, error: 'Not in a room' });
    const result = manager.respondDraw(req.roomId, s.playerId, req.accept);
    if (result.error) return cb({ ok: false, error: result.error });
    cb({ ok: true });
    const room = manager.get(req.roomId);
    if (room) broadcast(room);
  });

  socket.on('room:rematch', (req, cb) => {
    const s = session();
    if (!s) return cb({ ok: false, error: 'Not in a room' });
    const result = manager.rematch(req.roomId, s.playerId);
    if (result.error) return cb({ ok: false, error: result.error });
    cb({ ok: true });
    const room = manager.get(req.roomId);
    if (room) broadcast(room);
  });

  socket.on('room:chat', (req) => {
    const s = session();
    if (!s) return;
    const msg = manager.chat(req.roomId, s.playerId, req.text);
    if (msg) io.to(req.roomId).emit('room:chat', msg);
  });

  socket.on('room:leave', () => {
    const s = session();
    if (s) socket.leave(s.roomId);
    matchmaker.cancel(socket.id);
  });

  socket.on('mm:join', async (req, cb) => {
    const account = await resolveAccount(req.authToken);
    matchmaker.join(socket.id, {
      name: account?.username ?? req.name,
      account,
      mode: req.mode,
      tc: req.timeControl ?? null,
    });
    cb({ ok: true });
  });

  socket.on('mm:cancel', () => {
    matchmaker.cancel(socket.id);
  });

  socket.on('disconnect', () => {
    matchmaker.cancel(socket.id);
    sessions.delete(socket.id);
    const room = manager.disconnect(socket.id);
    if (room) broadcast(room);
  });
});

initDb()
  .catch((err) => console.error('Database init failed:', err))
  .finally(() => {
    httpServer.listen(PORT, () => {
      console.log(`Skak server listening on http://localhost:${PORT}`);
    });
  });
