import type { Color, Coord, Move, PieceType } from '../types.js';
import type { ChessEngine } from './index.js';

export type Difficulty = 'easy' | 'normal' | 'hard';

const VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

interface Board {
  board: (import('../types.js').Piece | null)[][];
  size: number;
}

/** Material balance from `color`'s view: own value minus everyone else's. */
function material(snap: Board, color: Color): number {
  let own = 0;
  let others = 0;
  for (let r = 0; r < snap.size; r++)
    for (let c = 0; c < snap.size; c++) {
      const p = snap.board[r][c];
      if (!p) continue;
      const v = VALUE[p.type];
      if (p.color === color) own += v;
      else others += v;
    }
  return own - others;
}

/** Value of the most valuable `victim`-owned piece the side-to-move can capture. */
function bestThreatAgainst(engine: ChessEngine, victim: Color): number {
  const snap = engine.snapshot();
  let best = 0;
  for (let r = 0; r < snap.size; r++)
    for (let c = 0; c < snap.size; c++) {
      const p = snap.board[r][c];
      if (!p || p.color !== engine.currentColor()) continue;
      for (const m of engine.legalMovesFrom({ r, c })) {
        const target = snap.board[m.to.r][m.to.c];
        if (target && target.color === victim) best = Math.max(best, VALUE[target.type]);
      }
    }
  return best;
}

function allMoves(engine: ChessEngine, color: Color): Move[] {
  const snap = engine.snapshot();
  const moves: Move[] = [];
  for (let r = 0; r < snap.size; r++)
    for (let c = 0; c < snap.size; c++) {
      const p = snap.board[r][c];
      if (p && p.color === color) moves.push(...engine.legalMovesFrom({ r, c }));
    }
  return moves;
}

function captureValue(snap: Board, to: Coord): number {
  const target = snap.board[to.r][to.c];
  return target ? VALUE[target.type] : 0;
}

const NOISE: Record<Difficulty, number> = { easy: 6, normal: 1.2, hard: 0.25 };

/**
 * Pick a move for `color`. Greedy material search one ply deep; on 'hard' it
 * also discounts moves that hang a piece to the next opponent's reply.
 */
export function chooseMove(engine: ChessEngine, color: Color, level: Difficulty = 'normal'): Move | null {
  const moves = allMoves(engine, color);
  if (moves.length === 0) return null;
  const baseSnap = engine.snapshot();

  // Easy mostly grabs free material or wanders, to feel beatable.
  if (level === 'easy' && Math.random() < 0.45) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  let best: Move | null = null;
  let bestScore = -Infinity;
  for (const move of moves) {
    const sim = engine.clone();
    if (!sim.applyMove(move)) continue;
    let score = material(sim.snapshot(), color) + captureValue(baseSnap, move.to) * 0.1;
    if (level === 'hard' && !sim.result.over) {
      score -= bestThreatAgainst(sim, color) * 0.9;
    }
    score += Math.random() * NOISE[level];
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best ?? moves[0];
}
