import { randomUUID } from 'node:crypto';
import {
  createEngine,
  MODE_COLORS,
  MODE_PLAYERS,
  type ChessEngine,
  type ChatMessage,
  type ClockState,
  type Color,
  type GameMode,
  type PlayerInfo,
  type RoomState,
  type RoomSync,
  type TimeControl,
} from '@skak/shared';

interface Player {
  id: string;
  token: string;
  name: string;
  color: Color | null;
  connected: boolean;
  socketId: string | null;
}

export interface Room {
  id: string;
  mode: GameMode;
  capacity: number;
  status: 'waiting' | 'playing' | 'finished';
  players: Map<string, Player>;
  hostId: string;
  engine: ChessEngine | null;
  chat: ChatMessage[];
  deleteTimer: NodeJS.Timeout | null;
  timeControl: TimeControl | null;
  clocks: Partial<Record<Color, number>>;
  activeColor: Color | null;
  turnStart: number;
  clockTimer: NodeJS.Timeout | null;
  drawOffer: Color | null;
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROOM_TTL_MS = 10 * 60 * 1000;

function makeCode(taken: Set<string>): string {
  let code = '';
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (taken.has(code));
  return code;
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  /** `broadcast` lets async clock flag-falls push a fresh state to the room. */
  constructor(private broadcast: (room: Room) => void) {}

  create(mode: GameMode, name: string, timeControl: TimeControl | null): { room: Room; player: Player } {
    const id = makeCode(new Set(this.rooms.keys()));
    const player = this.newPlayer(name);
    const room: Room = {
      id,
      mode,
      capacity: MODE_PLAYERS[mode],
      status: 'waiting',
      players: new Map([[player.id, player]]),
      hostId: player.id,
      engine: null,
      chat: [],
      deleteTimer: null,
      timeControl: timeControl && timeControl.initial > 0 ? timeControl : null,
      clocks: {},
      activeColor: null,
      turnStart: 0,
      clockTimer: null,
      drawOffer: null,
    };
    this.assignColors(room);
    this.rooms.set(id, room);
    return { room, player };
  }

  get(id: string): Room | undefined {
    return this.rooms.get(id.toUpperCase());
  }

  join(id: string, name: string): { room: Room; player: Player } | { error: string } {
    const room = this.get(id);
    if (!room) return { error: 'Room not found' };
    if (room.status !== 'waiting') return { error: 'Game already started' };
    if (room.players.size >= room.capacity) return { error: 'Room is full' };
    const player = this.newPlayer(name);
    room.players.set(player.id, player);
    this.assignColors(room);
    this.maybeStart(room);
    return { room, player };
  }

  rejoin(id: string, token: string): { room: Room; player: Player } | { error: string } {
    const room = this.get(id);
    if (!room) return { error: 'Room not found' };
    const player = [...room.players.values()].find((p) => p.token === token);
    if (!player) return { error: 'Unknown player' };
    player.connected = true;
    this.cancelDeletion(room);
    return { room, player };
  }

  start(roomId: string, playerId: string): { error?: string } {
    const room = this.get(roomId);
    if (!room) return { error: 'Room not found' };
    if (room.hostId !== playerId) return { error: 'Only the host can start' };
    if (room.status !== 'waiting') return { error: 'Game already started' };
    if (room.players.size < 2) return { error: 'Need at least 2 players' };
    this.beginGame(room);
    return {};
  }

  rematch(roomId: string, playerId: string): { error?: string } {
    const room = this.get(roomId);
    if (!room) return { error: 'Room not found' };
    if (!room.players.has(playerId)) return { error: 'Not in this room' };
    if (room.status !== 'finished') return { error: 'Game is still in progress' };
    this.beginGame(room);
    return {};
  }

  move(roomId: string, playerId: string, move: Parameters<ChessEngine['applyMove']>[0]): { error?: string } {
    const room = this.get(roomId);
    if (!room || !room.engine) return { error: 'No active game' };
    const player = room.players.get(playerId);
    if (!player) return { error: 'Not in this room' };
    if (player.color !== room.engine.currentColor()) return { error: 'Not your turn' };
    if (!room.engine.applyMove(move)) return { error: 'Illegal move' };
    room.drawOffer = null;
    this.afterTurn(room);
    return {};
  }

  resign(roomId: string, playerId: string): { error?: string } {
    const room = this.get(roomId);
    if (!room || !room.engine || room.status !== 'playing') return { error: 'No active game' };
    const player = room.players.get(playerId);
    if (!player || !player.color) return { error: 'Not in this room' };
    room.engine.endByElimination(player.color, 'resignation');
    room.drawOffer = null;
    this.afterTurn(room);
    return {};
  }

  offerDraw(roomId: string, playerId: string): { error?: string } {
    const room = this.get(roomId);
    if (!room || !room.engine || room.status !== 'playing') return { error: 'No active game' };
    const player = room.players.get(playerId);
    if (!player || !player.color) return { error: 'Not in this room' };
    room.drawOffer = player.color;
    return {};
  }

  respondDraw(roomId: string, playerId: string, accept: boolean): { error?: string } {
    const room = this.get(roomId);
    if (!room || !room.engine) return { error: 'No active game' };
    const player = room.players.get(playerId);
    if (!player || !player.color) return { error: 'Not in this room' };
    if (accept && room.drawOffer && room.drawOffer !== player.color) {
      room.engine.declareDraw();
      this.afterTurn(room);
    }
    room.drawOffer = null;
    return {};
  }

  chat(roomId: string, playerId: string, text: string): ChatMessage | null {
    const room = this.get(roomId);
    if (!room) return null;
    const player = room.players.get(playerId);
    if (!player) return null;
    const clean = text.slice(0, 300).trim();
    if (!clean) return null;
    const msg: ChatMessage = { from: player.name, text: clean, ts: Date.now() };
    room.chat.push(msg);
    if (room.chat.length > 100) room.chat.shift();
    return msg;
  }

  disconnect(socketId: string): Room | null {
    for (const room of this.rooms.values()) {
      const player = [...room.players.values()].find((p) => p.socketId === socketId);
      if (player) {
        player.connected = false;
        player.socketId = null;
        if ([...room.players.values()].every((p) => !p.connected)) {
          this.scheduleDeletion(room);
        }
        return room;
      }
    }
    return null;
  }

  bindSocket(roomId: string, playerId: string, socketId: string) {
    const player = this.get(roomId)?.players.get(playerId);
    if (player) {
      player.socketId = socketId;
      player.connected = true;
    }
  }

  sync(room: Room): RoomSync {
    return {
      room: this.publicState(room),
      snapshot: room.engine ? room.engine.snapshot() : null,
      clock: room.timeControl ? this.clockState(room) : null,
      drawOffer: room.drawOffer,
    };
  }

  // ---- clocks ----

  private clockState(room: Room): ClockState {
    const remaining: Partial<Record<Color, number>> = { ...room.clocks };
    const running = room.status === 'playing' && !!room.engine && !room.engine.result.over;
    const active = running ? room.activeColor : null;
    if (active && remaining[active] != null) {
      remaining[active] = Math.max(0, remaining[active]! - (Date.now() - room.turnStart));
    }
    return { remaining, active, running };
  }

  /** Charge the player who just moved, then (re)arm or stop the clock. */
  private afterTurn(room: Room) {
    if (room.engine?.result.over) room.status = 'finished';
    if (!room.timeControl || !room.engine) return;
    const now = Date.now();
    const moved = room.activeColor;
    if (moved && room.clocks[moved] != null) {
      room.clocks[moved] = Math.max(0, room.clocks[moved]! - (now - room.turnStart));
      room.clocks[moved]! += room.timeControl.increment;
    }
    if (room.engine.result.over) {
      this.clearClock(room);
      return;
    }
    this.startClock(room, now);
  }

  private startClock(room: Room, now = Date.now()) {
    if (!room.timeControl || !room.engine) return;
    room.activeColor = room.engine.currentColor();
    room.turnStart = now;
    this.clearClock(room);
    const ms = room.clocks[room.activeColor];
    if (ms != null) room.clockTimer = setTimeout(() => this.onFlag(room), Math.max(0, ms));
  }

  private clearClock(room: Room) {
    if (room.clockTimer) {
      clearTimeout(room.clockTimer);
      room.clockTimer = null;
    }
  }

  private onFlag(room: Room) {
    if (!room.engine || room.engine.result.over) return;
    const color = room.activeColor;
    if (!color) return;
    room.clocks[color] = 0;
    room.engine.endByElimination(color, 'timeout');
    if (room.engine.result.over) {
      room.status = 'finished';
      this.clearClock(room);
    } else {
      this.startClock(room);
    }
    this.broadcast(room);
  }

  // ---- helpers ----

  private publicState(room: Room): RoomState {
    const players: PlayerInfo[] = [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      connected: p.connected,
      isHost: p.id === room.hostId,
    }));
    return { id: room.id, mode: room.mode, status: room.status, capacity: room.capacity, players };
  }

  private newPlayer(name: string): Player {
    return {
      id: randomUUID(),
      token: randomUUID(),
      name: (name || 'Player').slice(0, 24),
      color: null,
      connected: true,
      socketId: null,
    };
  }

  private assignColors(room: Room) {
    const order = MODE_COLORS[room.mode];
    const used = new Set([...room.players.values()].map((p) => p.color).filter(Boolean));
    for (const player of room.players.values()) {
      if (player.color) continue;
      const next = order.find((c) => !used.has(c));
      if (next) {
        player.color = next;
        used.add(next);
      }
    }
  }

  private maybeStart(room: Room) {
    if (room.status === 'waiting' && room.players.size === room.capacity) {
      this.beginGame(room);
    }
  }

  private beginGame(room: Room) {
    const engine = createEngine(room.mode);
    const active = [...room.players.values()]
      .map((p) => p.color)
      .filter((c): c is Color => c !== null);
    if (active.length < MODE_COLORS[room.mode].length) {
      engine.startWithColors(active);
    }
    room.engine = engine;
    room.status = 'playing';
    room.drawOffer = null;
    this.clearClock(room);
    if (room.timeControl) {
      room.clocks = {};
      for (const c of active) room.clocks[c] = room.timeControl.initial;
      this.startClock(room);
    }
  }

  private scheduleDeletion(room: Room) {
    this.cancelDeletion(room);
    room.deleteTimer = setTimeout(() => {
      this.clearClock(room);
      this.rooms.delete(room.id);
    }, ROOM_TTL_MS);
  }

  private cancelDeletion(room: Room) {
    if (room.deleteTimer) {
      clearTimeout(room.deleteTimer);
      room.deleteTimer = null;
    }
  }
}
