import type { Color, GameMode, Move } from './types.js';
import type { EngineSnapshot } from './engine/index.js';

export interface PlayerInfo {
  id: string;
  name: string;
  color: Color | null;
  connected: boolean;
  isHost: boolean;
}

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface RoomState {
  id: string;
  mode: GameMode;
  status: RoomStatus;
  capacity: number;
  players: PlayerInfo[];
}

export interface ChatMessage {
  from: string;
  text: string;
  ts: number;
}

/** Clock initial time and per-move increment, both in milliseconds. */
export interface TimeControl {
  initial: number;
  increment: number;
}

/** Live clock state; `remaining[active]` is correct as of when it was sent. */
export interface ClockState {
  remaining: Partial<Record<Color, number>>;
  active: Color | null;
  running: boolean;
}

/** Everything a client needs to render a room: lobby + live game. */
export interface RoomSync {
  room: RoomState;
  snapshot: EngineSnapshot | null;
  clock: ClockState | null;
  drawOffer: Color | null;
}

export interface CreateRoomReq {
  mode: GameMode;
  name: string;
  timeControl?: TimeControl | null;
}
export interface CreateRoomRes {
  ok: boolean;
  error?: string;
  roomId?: string;
  playerId?: string;
  token?: string;
}

export interface JoinRoomReq {
  roomId: string;
  name: string;
}
export type JoinRoomRes = CreateRoomRes;

export interface RejoinReq {
  roomId: string;
  token: string;
}

export interface MoveReq {
  roomId: string;
  move: Move;
}
export interface MoveRes {
  ok: boolean;
  error?: string;
}

export interface ServerToClientEvents {
  'room:state': (sync: RoomSync) => void;
  'room:error': (message: string) => void;
  'room:chat': (message: ChatMessage) => void;
}

export interface ClientToServerEvents {
  'room:create': (req: CreateRoomReq, cb: (res: CreateRoomRes) => void) => void;
  'room:join': (req: JoinRoomReq, cb: (res: JoinRoomRes) => void) => void;
  'room:rejoin': (req: RejoinReq, cb: (res: CreateRoomRes) => void) => void;
  'room:start': (req: { roomId: string }, cb: (res: MoveRes) => void) => void;
  'room:leave': (req: { roomId: string }) => void;
  'room:rematch': (req: { roomId: string }, cb: (res: MoveRes) => void) => void;
  'game:move': (req: MoveReq, cb: (res: MoveRes) => void) => void;
  'game:resign': (req: { roomId: string }, cb: (res: MoveRes) => void) => void;
  'game:draw-offer': (req: { roomId: string }, cb: (res: MoveRes) => void) => void;
  'game:draw-respond': (req: { roomId: string; accept: boolean }, cb: (res: MoveRes) => void) => void;
  'room:chat': (req: { roomId: string; text: string }) => void;
}
