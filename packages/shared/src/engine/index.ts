import type { Color, Coord, GameMode, Move } from '../types.js';
import type { GameResult, GridSnapshot } from './gridChess.js';
import { build2p, build3p, build4p } from './setups.js';

export type { GameResult, GridSnapshot } from './gridChess.js';
export { GridChess } from './gridChess.js';
export * from './setups.js';
export { chooseMove, type Difficulty } from './bot.js';

/** A serialized game state. Today every mode uses the grid representation. */
export type EngineSnapshot = GridSnapshot;

/**
 * Shared surface implemented by every game engine, so the server and client
 * can drive any mode without knowing its internal geometry.
 */
export interface ChessEngine {
  readonly mode: GameMode;
  currentColor(): Color;
  legalMovesFrom(from: Coord): Move[];
  applyMove(move: Move): boolean;
  startWithColors(active: Color[]): void;
  clone(): ChessEngine;
  snapshot(): EngineSnapshot;
  load(snapshot: EngineSnapshot): void;
  get result(): GameResult;
}

export function createEngine(mode: GameMode): ChessEngine {
  switch (mode) {
    case '2p':
      return build2p();
    case '4p':
      return build4p();
    case '3p':
      return build3p();
  }
}

/** Rebuild an engine from a snapshot (used on the client to render + preview). */
export function engineFromSnapshot(snapshot: EngineSnapshot): ChessEngine {
  const engine = createEngine(snapshot.mode);
  engine.load(snapshot);
  return engine;
}
