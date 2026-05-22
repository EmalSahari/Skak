import type { Color, GameMode, Move } from './types.js';
import type { EngineSnapshot } from './engine/index.js';

export interface PlayerInfo {
  id: string;
  name: string;
  color: Color | null;
  connected: boolean;
  isHost: boolean;
  rating: number | null;
  country: string | null;
}

/** A registered account, as exposed to clients (no password/email). */
export interface PublicUser {
  id: number;
  username: string;
  country: string | null;
  elo: number;
  w2: number;
  l2: number;
  d2: number;
  played3: number;
  won3: number;
  played4: number;
  won4: number;
}

export interface AuthResponse {
  ok: boolean;
  error?: string;
  token?: string;
  user?: PublicUser;
}

export interface EloEntry {
  username: string;
  country: string | null;
  elo: number;
  games: number;
}

export interface WinsEntry {
  username: string;
  country: string | null;
  wins: number;
  games: number;
}

export interface Leaderboard {
  elo: EloEntry[];
  wins: WinsEntry[];
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
  authToken?: string;
  rated?: boolean;
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
  authToken?: string;
}
export type JoinRoomRes = CreateRoomRes;

export interface RejoinReq {
  roomId: string;
  token: string;
  authToken?: string;
}

export interface MoveReq {
  roomId: string;
  move: Move;
}
export interface MoveRes {
  ok: boolean;
  error?: string;
}

export interface MatchmakeReq {
  mode: GameMode;
  name: string;
  timeControl?: TimeControl | null;
  rated?: boolean;
  authToken?: string;
}

export interface MatchStatus {
  waiting: number;
  estimateSec: number;
}

export interface MatchFound {
  roomId: string;
  playerId: string;
  token: string;
}

export interface ServerToClientEvents {
  'room:state': (sync: RoomSync) => void;
  'room:error': (message: string) => void;
  'room:chat': (message: ChatMessage) => void;
  'mm:status': (status: MatchStatus) => void;
  'mm:found': (found: MatchFound) => void;
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
  'mm:join': (req: MatchmakeReq, cb: (res: MoveRes) => void) => void;
  'mm:cancel': () => void;
}
