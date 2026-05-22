import type { Server, Socket } from 'socket.io';
import {
  MODE_PLAYERS,
  type ClientToServerEvents,
  type GameMode,
  type ServerToClientEvents,
  type TimeControl,
} from '@skak/shared';
import { RoomManager, type Account, type Room } from './rooms.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents>;

interface Entry {
  socketId: string;
  name: string;
  account: Account | null;
  joinedAt: number;
  mode: GameMode;
  tc: TimeControl | null;
}

const BASE_ESTIMATE: Record<GameMode, number> = { '2p': 25, '3p': 75, '4p': 120 };

const tcKey = (tc: TimeControl | null) => (tc ? `${tc.initial}+${tc.increment}` : 'none');

export class Matchmaker {
  private queues = new Map<string, Entry[]>();
  private recentWaits = new Map<GameMode, number[]>();

  constructor(
    private io: IO,
    private manager: RoomManager,
    private onMatched: (socketId: string, roomId: string, playerId: string) => void,
    private broadcast: (room: Room) => void,
  ) {}

  private socket(id: string): Sock | undefined {
    return this.io.sockets.sockets.get(id);
  }

  private estimate(mode: GameMode): number {
    const waits = this.recentWaits.get(mode);
    if (waits && waits.length) return Math.round(waits.reduce((a, b) => a + b, 0) / waits.length);
    return BASE_ESTIMATE[mode];
  }

  join(socketId: string, entry: Omit<Entry, 'socketId' | 'joinedAt'>) {
    this.cancel(socketId);
    const key = `${entry.mode}|${tcKey(entry.tc)}`;
    const bucket = this.queues.get(key) ?? [];
    // Drop any entries whose socket has gone away.
    const live = bucket.filter((e) => this.socket(e.socketId));
    live.push({ ...entry, socketId, joinedAt: Date.now() });
    this.queues.set(key, live);

    const capacity = MODE_PLAYERS[entry.mode];
    if (live.length >= capacity) {
      const matched = live.splice(0, capacity);
      this.queues.set(key, live);
      this.startMatch(matched);
    } else {
      const status = { waiting: live.length, estimateSec: this.estimate(entry.mode) };
      for (const e of live) this.socket(e.socketId)?.emit('mm:status', status);
    }
  }

  private startMatch(matched: Entry[]) {
    const mode = matched[0].mode;
    const now = Date.now();
    const waits = this.recentWaits.get(mode) ?? [];
    for (const e of matched) waits.push(Math.round((now - e.joinedAt) / 1000));
    this.recentWaits.set(mode, waits.slice(-6));

    // A matched game counts toward ranking only if everyone is signed in.
    const rated = matched.every((e) => !!e.account);
    const { room, creds } = this.manager.createMatch(
      mode,
      matched[0].tc,
      rated,
      matched.map((e) => ({ name: e.name, account: e.account })),
    );

    matched.forEach((e, i) => {
      const cred = creds[i];
      if (!cred) return;
      const sock = this.socket(e.socketId);
      if (!sock) return;
      sock.join(room.id);
      this.onMatched(e.socketId, room.id, cred.playerId);
      sock.emit('mm:found', { roomId: room.id, playerId: cred.playerId, token: cred.token });
    });
    this.broadcast(room);
  }

  cancel(socketId: string) {
    for (const [key, bucket] of this.queues) {
      const idx = bucket.findIndex((e) => e.socketId === socketId);
      if (idx === -1) continue;
      const [removed] = bucket.splice(idx, 1);
      this.queues.set(key, bucket);
      const status = { waiting: bucket.length, estimateSec: this.estimate(removed.mode) };
      for (const e of bucket) this.socket(e.socketId)?.emit('mm:status', status);
      return;
    }
  }
}
