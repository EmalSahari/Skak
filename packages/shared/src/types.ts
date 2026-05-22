export type GameMode = '2p' | '3p' | '4p';

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

/**
 * Color identifies an army, each with a unique single-char code:
 *   w White, b Black, r Red, y Yellow, g Green, u blUe.
 * 2p uses w/b; 4p uses r (bottom) / u (left) / y (top) / g (right);
 * 3p uses r/g/u for the three hex armies.
 */
export type Color = 'w' | 'b' | 'r' | 'y' | 'g' | 'u';

export interface Piece {
  type: PieceType;
  color: Color;
  hasMoved: boolean;
}

/** A square on a grid board, row then column, both zero-based. */
export interface Coord {
  r: number;
  c: number;
}

export interface Move {
  from: Coord;
  to: Coord;
  /** Promotion target piece type, when a pawn reaches its promotion zone. */
  promotion?: PieceType;
}

export const PIECE_NAMES: Record<PieceType, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

export const COLOR_NAMES: Record<Color, string> = {
  w: 'White',
  b: 'Black',
  r: 'Red',
  y: 'Yellow',
  g: 'Green',
  u: 'Blue',
};

/** CSS colors used to render each army's pieces. */
export const COLOR_HEX: Record<Color, string> = {
  w: '#f4f4f5',
  b: '#27272a',
  r: '#dc2626',
  y: '#eab308',
  g: '#16a34a',
  u: '#2563eb',
};

/** Player count per mode. */
export const MODE_PLAYERS: Record<GameMode, number> = {
  '2p': 2,
  '3p': 3,
  '4p': 4,
};

/** Turn order of armies per mode. */
export const MODE_COLORS: Record<GameMode, Color[]> = {
  '2p': ['w', 'b'],
  '4p': ['r', 'u', 'y', 'g'],
  '3p': ['r', 'g', 'u'],
};
