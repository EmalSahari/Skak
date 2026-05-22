/** Elo rating helpers (used for ranked 2-player games). */

export const DEFAULT_ELO = 1200;
const K = 32;

/** Expected score (0..1) for `rating` against `opponent`. */
export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

/** Rating change for a player who scored `score` (1 win, 0.5 draw, 0 loss). */
export function eloDelta(rating: number, opponent: number, score: number, k = K): number {
  return Math.round(k * (score - expectedScore(rating, opponent)));
}

/** New ratings for both players given the first player's result. */
export function applyElo(
  a: number,
  b: number,
  result: 'a' | 'b' | 'draw',
): { a: number; b: number } {
  const scoreA = result === 'a' ? 1 : result === 'b' ? 0 : 0.5;
  return {
    a: a + eloDelta(a, b, scoreA),
    b: b + eloDelta(b, a, 1 - scoreA),
  };
}
