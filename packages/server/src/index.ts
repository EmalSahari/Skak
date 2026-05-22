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
import {
  createUser,
  dbEnabled,
  findById,
  findByUsername,
  initDb,
  leaderboard,
  usernameTaken,
} from './db.js';
import { hashPassword, signToken, verifyToken, verifyPassword } from './auth.js';

const PORT = Number(process.env.PORT) || 3001;
const ORIGIN = process.env.CLIENT_ORIGIN || '*';

const app = express();
app.use(cors({ origin: ORIGIN }));
app.use(express.json());
app.get('/health', (_req, res) => res.json({ ok: true, accounts: dbEnabled }));

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

async function resolveAccount(token: string | undefined): Promise<Account | null> {
  const uid = verifyToken(token);
  if (uid == null) return null;
  const user = await findById(uid);
  if (!user) return null;
  return { userId: user.id, username: user.username, rating: user.elo, country: user.country };
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

io.on('connection', (socket) => {
  let myRoomId: string | null = null;
  let myPlayerId: string | null = null;

  const enter = (roomId: string, playerId: string) => {
    myRoomId = roomId;
    myPlayerId = playerId;
    socket.join(roomId);
    manager.bindSocket(roomId, playerId, socket.id);
  };

  socket.on('room:create', async (req, cb) => {
    const account = await resolveAccount(req.authToken);
    const { room, player } = manager.create(req.mode, req.name, req.timeControl ?? null, account);
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
    if (!myPlayerId) return cb({ ok: false, error: 'Not in a room' });
    const result = manager.start(req.roomId, myPlayerId);
    if (result.error) return cb({ ok: false, error: result.error });
    cb({ ok: true });
    const room = manager.get(req.roomId);
    if (room) broadcast(room);
  });

  socket.on('game:move', (req, cb) => {
    if (!myPlayerId) return cb({ ok: false, error: 'Not in a room' });
    const result = manager.move(req.roomId, myPlayerId, req.move);
    if (result.error) return cb({ ok: false, error: result.error });
    cb({ ok: true });
    const room = manager.get(req.roomId);
    if (room) broadcast(room);
  });

  socket.on('game:resign', (req, cb) => {
    if (!myPlayerId) return cb({ ok: false, error: 'Not in a room' });
    const result = manager.resign(req.roomId, myPlayerId);
    if (result.error) return cb({ ok: false, error: result.error });
    cb({ ok: true });
    const room = manager.get(req.roomId);
    if (room) broadcast(room);
  });

  socket.on('game:draw-offer', (req, cb) => {
    if (!myPlayerId) return cb({ ok: false, error: 'Not in a room' });
    const result = manager.offerDraw(req.roomId, myPlayerId);
    if (result.error) return cb({ ok: false, error: result.error });
    cb({ ok: true });
    const room = manager.get(req.roomId);
    if (room) broadcast(room);
  });

  socket.on('game:draw-respond', (req, cb) => {
    if (!myPlayerId) return cb({ ok: false, error: 'Not in a room' });
    const result = manager.respondDraw(req.roomId, myPlayerId, req.accept);
    if (result.error) return cb({ ok: false, error: result.error });
    cb({ ok: true });
    const room = manager.get(req.roomId);
    if (room) broadcast(room);
  });

  socket.on('room:rematch', (req, cb) => {
    if (!myPlayerId) return cb({ ok: false, error: 'Not in a room' });
    const result = manager.rematch(req.roomId, myPlayerId);
    if (result.error) return cb({ ok: false, error: result.error });
    cb({ ok: true });
    const room = manager.get(req.roomId);
    if (room) broadcast(room);
  });

  socket.on('room:chat', (req) => {
    if (!myPlayerId) return;
    const msg = manager.chat(req.roomId, myPlayerId, req.text);
    if (msg) io.to(req.roomId).emit('room:chat', msg);
  });

  socket.on('room:leave', () => {
    if (myRoomId) socket.leave(myRoomId);
  });

  socket.on('disconnect', () => {
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
