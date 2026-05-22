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
import { RoomManager, type Room } from './rooms.js';

const PORT = Number(process.env.PORT) || 3001;
const ORIGIN = process.env.CLIENT_ORIGIN || '*';

const app = express();
app.use(cors({ origin: ORIGIN }));
app.get('/health', (_req, res) => res.json({ ok: true }));

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

  socket.on('room:create', (req, cb) => {
    const { room, player } = manager.create(req.mode, req.name, req.timeControl ?? null);
    enter(room.id, player.id);
    cb({ ok: true, roomId: room.id, playerId: player.id, token: player.token });
    broadcast(room);
  });

  socket.on('room:join', (req, cb) => {
    const result = manager.join(req.roomId, req.name);
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

httpServer.listen(PORT, () => {
  console.log(`Skak server listening on http://localhost:${PORT}`);
});
