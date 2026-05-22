import type { Color, Coord, Piece, PieceType } from '../types.js';
import { GridChess, type GridConfig } from './gridChess.js';

const BACK_RANK: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

function piece(type: PieceType, color: Color): Piece {
  return { type, color, hasMoved: false };
}

function emptyBoard(size: number): (Piece | null)[][] {
  return Array.from({ length: size }, () => Array<Piece | null>(size).fill(null));
}

// ---------- 2-player standard ----------

export function build2p(): GridChess {
  const size = 8;
  const voids = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const board = emptyBoard(size);
  for (let c = 0; c < 8; c++) {
    board[0][c] = piece(BACK_RANK[c], 'b');
    board[1][c] = piece('p', 'b');
    board[6][c] = piece('p', 'w');
    board[7][c] = piece(BACK_RANK[c], 'w');
  }
  const cfg: GridConfig = {
    mode: '2p',
    size,
    voids,
    board,
    colors: ['w', 'b'],
    pawnDir: { w: { r: -1, c: 0 }, b: { r: 1, c: 0 } },
    enableCastling: true,
    enableEnPassant: true,
    isPromotion: (color, to) => (color === 'w' ? to.r === 0 : to.r === 7),
  };
  return new GridChess(cfg);
}

// ---------- 4-player cross board ----------

const FOUR_SIZE = 14;
const CORNER = 3; // 3x3 corner blocks are removed

export function fourPlayerVoids(): boolean[][] {
  const v = Array.from({ length: FOUR_SIZE }, () => Array<boolean>(FOUR_SIZE).fill(false));
  for (let r = 0; r < FOUR_SIZE; r++) {
    for (let c = 0; c < FOUR_SIZE; c++) {
      const topOrBottom = r < CORNER || r >= FOUR_SIZE - CORNER;
      const leftOrRight = c < CORNER || c >= FOUR_SIZE - CORNER;
      if (topOrBottom && leftOrRight) v[r][c] = true;
    }
  }
  return v;
}

export function build4p(): GridChess {
  const size = FOUR_SIZE;
  const voids = fourPlayerVoids();
  const board = emptyBoard(size);
  const mid = [3, 4, 5, 6, 7, 8, 9, 10]; // central eight files/ranks

  // Red (bottom): back rank row 13, pawns row 12
  // Yellow (top): back rank row 0, pawns row 1
  mid.forEach((c, i) => {
    board[13][c] = piece(BACK_RANK[i], 'r');
    board[12][c] = piece('p', 'r');
    board[0][c] = piece(BACK_RANK[i], 'y');
    board[1][c] = piece('p', 'y');
  });
  // Blue (left): back rank col 0, pawns col 1
  // Green (right): back rank col 13, pawns col 12
  mid.forEach((r, i) => {
    board[r][0] = piece(BACK_RANK[i], 'u');
    board[r][1] = piece('p', 'u');
    board[r][13] = piece(BACK_RANK[i], 'g');
    board[r][12] = piece('p', 'g');
  });

  const cfg: GridConfig = {
    mode: '4p',
    size,
    voids,
    board,
    colors: ['r', 'u', 'y', 'g'],
    pawnDir: {
      r: { r: -1, c: 0 }, // up
      y: { r: 1, c: 0 }, // down
      u: { r: 0, c: 1 }, // right
      g: { r: 0, c: -1 }, // left
    },
    enableCastling: false,
    enableEnPassant: true,
    isPromotion: (color, to) => promote4p(color, to),
  };
  return new GridChess(cfg);
}

// ---------- 3-player (cross board, fourth arm left open) ----------

export function build3p(): GridChess {
  const size = FOUR_SIZE;
  const voids = fourPlayerVoids();
  const board = emptyBoard(size);
  const mid = [3, 4, 5, 6, 7, 8, 9, 10];

  // Red (bottom), Blue (left), Green (right). Top arm stays empty.
  mid.forEach((c, i) => {
    board[13][c] = piece(BACK_RANK[i], 'r');
    board[12][c] = piece('p', 'r');
  });
  mid.forEach((r, i) => {
    board[r][0] = piece(BACK_RANK[i], 'u');
    board[r][1] = piece('p', 'u');
    board[r][13] = piece(BACK_RANK[i], 'g');
    board[r][12] = piece('p', 'g');
  });

  const cfg: GridConfig = {
    mode: '3p',
    size,
    voids,
    board,
    colors: ['r', 'g', 'u'],
    pawnDir: {
      r: { r: -1, c: 0 },
      u: { r: 0, c: 1 },
      g: { r: 0, c: -1 },
    },
    enableCastling: false,
    enableEnPassant: true,
    isPromotion: (color, to) => promote4p(color, to),
  };
  return new GridChess(cfg);
}

function promote4p(color: Color, to: Coord): boolean {
  // Promote on reaching the far outer edge of the opposite arm.
  switch (color) {
    case 'r':
      return to.r === 0;
    case 'y':
      return to.r === 13;
    case 'u':
      return to.c === 13;
    case 'g':
      return to.c === 0;
    default:
      return false;
  }
}
