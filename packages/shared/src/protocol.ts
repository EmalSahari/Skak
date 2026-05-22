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

/** Everything a client needs to render a room: lobby + live game. */
export interface RoomSync {
  room: RoomState;
  snapshot: EngineSnapshot | null;
}

export interface CreateRoomReq {
  mode: GameMode;
  name: string;
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
  'game:move': (req: MoveReq, cb: (res: MoveRes) => void) => void;
  'room:chat': (req: { roomId: string; text: string }) => void;
}
