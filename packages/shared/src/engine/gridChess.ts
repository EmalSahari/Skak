import type { Color, Coord, Move, Piece, PieceType, GameMode } from '../types.js';

export interface GameResult {
  over: boolean;
  winner: Color | null;
  /** 'checkmate' | 'stalemate' | 'last-standing' | null */
  reason: 'checkmate' | 'stalemate' | 'last-standing' | null;
}

export interface GridSnapshot {
  mode: GameMode;
  size: number;
  voids: boolean[][];
  board: (Piece | null)[][];
  colors: Color[];
  turnIndex: number;
  eliminated: Color[];
  enPassant: { target: Coord; victim: Coord } | null;
  checks: Color[];
  result: GameResult;
  lastMove: Move | null;
}

export interface GridConfig {
  mode: GameMode;
  size: number;
  voids: boolean[][];
  board: (Piece | null)[][];
  colors: Color[];
  /** Forward direction for each color's pawns. */
  pawnDir: Record<string, Coord>;
  enableCastling: boolean;
  enableEnPassant: boolean;
  /** Whether reaching `to` promotes a pawn of `color`. */
  isPromotion: (color: Color, to: Coord) => boolean;
}

const ORTHO: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAG: [number, number][] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const KNIGHT: [number, number][] = [
  [2, 1],
  [2, -1],
  [-2, 1],
  [-2, -1],
  [1, 2],
  [1, -2],
  [-1, 2],
  [-1, -2],
];

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

const eq = (a: Coord, b: Coord) => a.r === b.r && a.c === b.c;

export class GridChess {
  readonly mode: GameMode;
  readonly size: number;
  readonly voids: boolean[][];
  readonly colors: Color[];
  private readonly pawnDir: Record<string, Coord>;
  private readonly enableCastling: boolean;
  private readonly enableEnPassant: boolean;
  private readonly isPromotion: (color: Color, to: Coord) => boolean;

  board: (Piece | null)[][];
  turnIndex = 0;
  eliminated: Color[] = [];
  enPassant: { target: Coord; victim: Coord } | null = null;
  result: GameResult = { over: false, winner: null, reason: null };
  lastMove: Move | null = null;

  constructor(cfg: GridConfig) {
    this.mode = cfg.mode;
    this.size = cfg.size;
    this.voids = cfg.voids;
    this.colors = cfg.colors;
    this.pawnDir = cfg.pawnDir;
    this.enableCastling = cfg.enableCastling;
    this.enableEnPassant = cfg.enableEnPassant;
    this.isPromotion = cfg.isPromotion;
    this.board = cfg.board;
  }

  // ---- geometry helpers ----

  inBounds(r: number, c: number): boolean {
    return r >= 0 && c >= 0 && r < this.size && c < this.size;
  }

  playable(r: number, c: number): boolean {
    return this.inBounds(r, c) && !this.voids[r][c];
  }

  pieceAt(co: Coord): Piece | null {
    if (!this.playable(co.r, co.c)) return null;
    return this.board[co.r][co.c];
  }

  currentColor(): Color {
    return this.colors[this.turnIndex];
  }

  activeColors(): Color[] {
    return this.colors.filter((c) => !this.eliminated.includes(c));
  }

  // ---- move generation ----

  /** Pseudo-legal moves (not yet filtered for self-check) for a piece. */
  private pseudoMoves(from: Coord): Move[] {
    const piece = this.pieceAt(from);
    if (!piece) return [];
    const moves: Move[] = [];
    const add = (r: number, c: number) => {
      if (!this.playable(r, c)) return false;
      const target = this.board[r][c];
      if (target && target.color === piece.color) return false;
      this.pushMove(moves, piece, from, { r, c });
      return !target; // can continue sliding only if empty
    };

    switch (piece.type) {
      case 'n':
        for (const [dr, dc] of KNIGHT) add(from.r + dr, from.c + dc);
        break;
      case 'k':
        for (const [dr, dc] of [...ORTHO, ...DIAG]) add(from.r + dr, from.c + dc);
        this.addCastling(moves, piece, from);
        break;
      case 'r':
        this.slide(moves, piece, from, ORTHO);
        break;
      case 'b':
        this.slide(moves, piece, from, DIAG);
        break;
      case 'q':
        this.slide(moves, piece, from, [...ORTHO, ...DIAG]);
        break;
      case 'p':
        this.pawnMoves(moves, piece, from);
        break;
    }
    return moves;
  }

  private pushMove(moves: Move[], piece: Piece, from: Coord, to: Coord) {
    if (piece.type === 'p' && this.isPromotion(piece.color, to)) {
      moves.push({ from, to, promotion: 'q' });
    } else {
      moves.push({ from, to });
    }
  }

  private slide(moves: Move[], piece: Piece, from: Coord, dirs: [number, number][]) {
    for (const [dr, dc] of dirs) {
      let r = from.r + dr;
      let c = from.c + dc;
      while (this.playable(r, c)) {
        const target = this.board[r][c];
        if (!target) {
          moves.push({ from, to: { r, c } });
        } else {
          if (target.color !== piece.color) moves.push({ from, to: { r, c } });
          break;
        }
        r += dr;
        c += dc;
      }
    }
  }

  private pawnMoves(moves: Move[], piece: Piece, from: Coord) {
    const dir = this.pawnDir[piece.color];
    if (!dir) return;
    const one: Coord = { r: from.r + dir.r, c: from.c + dir.c };
    if (this.playable(one.r, one.c) && !this.board[one.r][one.c]) {
      this.pushMove(moves, piece, from, one);
      const two: Coord = { r: from.r + 2 * dir.r, c: from.c + 2 * dir.c };
      if (!piece.hasMoved && this.playable(two.r, two.c) && !this.board[two.r][two.c]) {
        moves.push({ from, to: two });
      }
    }
    // captures: forward plus each perpendicular
    for (const perp of this.perpendiculars(dir)) {
      const cap: Coord = { r: from.r + dir.r + perp.r, c: from.c + dir.c + perp.c };
      if (!this.playable(cap.r, cap.c)) continue;
      const target = this.board[cap.r][cap.c];
      if (target && target.color !== piece.color) {
        this.pushMove(moves, piece, from, cap);
      } else if (!target && this.enableEnPassant && this.enPassant && eq(this.enPassant.target, cap)) {
        const victim = this.pieceAt(this.enPassant.victim);
        if (victim && victim.color !== piece.color) moves.push({ from, to: cap });
      }
    }
  }

  private perpendiculars(dir: Coord): Coord[] {
    return dir.c === 0
      ? [{ r: 0, c: 1 }, { r: 0, c: -1 }]
      : [{ r: 1, c: 0 }, { r: -1, c: 0 }];
  }

  private addCastling(moves: Move[], king: Piece, from: Coord) {
    if (!this.enableCastling || king.hasMoved) return;
    if (this.isAttacked(from, king.color)) return;
    for (const dc of [1, -1]) {
      // find rook in this horizontal direction
      let c = from.c + dc;
      while (this.inBounds(from.r, c) && !this.board[from.r][c]) c += dc;
      if (!this.inBounds(from.r, c)) continue;
      const rook = this.board[from.r][c];
      if (!rook || rook.type !== 'r' || rook.color !== king.color || rook.hasMoved) continue;
      // king travels two squares toward the rook; both passed squares must be safe & empty
      const step1: Coord = { r: from.r, c: from.c + dc };
      const step2: Coord = { r: from.r, c: from.c + 2 * dc };
      if (this.board[step1.r][step1.c] || this.board[step2.r][step2.c]) continue;
      if (this.isAttacked(step1, king.color) || this.isAttacked(step2, king.color)) continue;
      moves.push({ from, to: step2 });
    }
  }

  /** Is `sq` attacked by any color other than `friendly` (and not eliminated)? */
  isAttacked(sq: Coord, friendly: Color): boolean {
    const enemies = this.activeColors().filter((c) => c !== friendly);
    // knight attackers
    for (const [dr, dc] of KNIGHT) {
      const p = this.pieceAt({ r: sq.r + dr, c: sq.c + dc });
      if (p && p.type === 'n' && enemies.includes(p.color)) return true;
    }
    // king attackers
    for (const [dr, dc] of [...ORTHO, ...DIAG]) {
      const p = this.pieceAt({ r: sq.r + dr, c: sq.c + dc });
      if (p && p.type === 'k' && enemies.includes(p.color)) return true;
    }
    // sliding attackers
    const scan = (dirs: [number, number][], types: PieceType[]) => {
      for (const [dr, dc] of dirs) {
        let r = sq.r + dr;
        let c = sq.c + dc;
        while (this.playable(r, c)) {
          const p = this.board[r][c];
          if (p) {
            if (enemies.includes(p.color) && types.includes(p.type)) return true;
            break;
          }
          r += dr;
          c += dc;
        }
      }
      return false;
    };
    if (scan(ORTHO, ['r', 'q'])) return true;
    if (scan(DIAG, ['b', 'q'])) return true;
    // pawn attackers: an enemy pawn attacks `sq` if `sq` is one of its capture squares
    for (const color of enemies) {
      const dir = this.pawnDir[color];
      if (!dir) continue;
      for (const perp of this.perpendiculars(dir)) {
        const src: Coord = { r: sq.r - dir.r - perp.r, c: sq.c - dir.c - perp.c };
        const p = this.pieceAt(src);
        if (p && p.type === 'p' && p.color === color) return true;
      }
    }
    return false;
  }

  private findKing(color: Color): Coord | null {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const p = this.board[r][c];
        if (p && p.type === 'k' && p.color === color) return { r, c };
      }
    }
    return null;
  }

  isInCheck(color: Color): boolean {
    const king = this.findKing(color);
    return king ? this.isAttacked(king, color) : false;
  }

  /** Legal moves from a square for the side to move. */
  legalMovesFrom(from: Coord): Move[] {
    const piece = this.pieceAt(from);
    if (!piece || piece.color !== this.currentColor() || this.result.over) return [];
    return this.pseudoMoves(from).filter((m) => !this.leavesKingInCheck(m, piece.color));
  }

  allLegalMoves(color: Color): Move[] {
    const moves: Move[] = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const p = this.board[r][c];
        if (p && p.color === color) {
          for (const m of this.pseudoMoves({ r, c })) {
            if (!this.leavesKingInCheck(m, color)) moves.push(m);
          }
        }
      }
    }
    return moves;
  }

  private leavesKingInCheck(move: Move, color: Color): boolean {
    const sim = this.fork();
    sim.execute(move);
    return sim.isInCheck(color);
  }

  /** A lightweight clone used purely for move simulation. */
  private fork(): GridChess {
    const f = Object.create(GridChess.prototype) as GridChess;
    Object.assign(f, this);
    f.board = this.board.map((row) => row.map((p) => (p ? { ...p } : null)));
    f.enPassant = this.enPassant ? clone(this.enPassant) : null;
    f.eliminated = this.eliminated.slice();
    return f;
  }

  /** Apply a move's board mutation without legality checks or turn advance. */
  private execute(move: Move) {
    const piece = this.board[move.from.r][move.from.c];
    if (!piece) return;
    // en passant capture
    if (
      piece.type === 'p' &&
      this.enPassant &&
      eq(this.enPassant.target, move.to) &&
      !this.board[move.to.r][move.to.c]
    ) {
      this.board[this.enPassant.victim.r][this.enPassant.victim.c] = null;
    }
    // castling: king moved two squares horizontally
    if (piece.type === 'k' && Math.abs(move.to.c - move.from.c) === 2 && move.to.r === move.from.r) {
      const dc = move.to.c > move.from.c ? 1 : -1;
      let c = move.from.c + dc;
      while (this.inBounds(move.from.r, c) && this.board[move.from.r][c]?.type !== 'r') c += dc;
      const rook = this.board[move.from.r][c];
      if (rook) {
        this.board[move.from.r][c] = null;
        rook.hasMoved = true;
        this.board[move.from.r][move.from.c + dc] = rook;
      }
    }

    // set / clear en passant target
    if (piece.type === 'p' && !piece.hasMoved) {
      const dir = this.pawnDir[piece.color];
      const isDouble =
        dir && move.to.r === move.from.r + 2 * dir.r && move.to.c === move.from.c + 2 * dir.c;
      this.enPassant = isDouble
        ? { target: { r: move.from.r + dir!.r, c: move.from.c + dir!.c }, victim: move.to }
        : null;
    } else {
      this.enPassant = null;
    }

    piece.hasMoved = true;
    this.board[move.from.r][move.from.c] = null;
    this.board[move.to.r][move.to.c] = piece;
    if (move.promotion && piece.type === 'p') piece.type = move.promotion;
  }

  /** Validate and apply a move for the side to move. Returns success. */
  applyMove(move: Move): boolean {
    if (this.result.over) return false;
    const candidates = this.legalMovesFrom(move.from).filter((m) => eq(m.to, move.to));
    if (candidates.length === 0) return false;
    const applied: Move = { from: move.from, to: move.to };
    if (candidates.some((m) => m.promotion)) {
      const allowed: PieceType[] = ['q', 'r', 'b', 'n'];
      applied.promotion = allowed.includes(move.promotion as PieceType)
        ? (move.promotion as PieceType)
        : 'q';
    }
    this.execute(applied);
    this.lastMove = applied;
    this.advanceTurn();
    return true;
  }

  private advanceTurn() {
    const order = this.colors;
    let guard = 0;
    do {
      this.turnIndex = (this.turnIndex + 1) % order.length;
      guard++;
      const color = this.colors[this.turnIndex];
      if (this.eliminated.includes(color)) continue;
      const moves = this.allLegalMoves(color);
      if (moves.length > 0) {
        this.refreshResult();
        return;
      }
      // no legal moves for this color
      const inCheck = this.isInCheck(color);
      if (this.mode === '2p') {
        const opponent = this.colors.find((c) => c !== color)!;
        this.result = {
          over: true,
          winner: inCheck ? opponent : null,
          reason: inCheck ? 'checkmate' : 'stalemate',
        };
        return;
      }
      // 3p / 4p: eliminate this player and remove their pieces
      this.eliminate(color);
      if (this.activeColors().length <= 1) {
        this.result = {
          over: true,
          winner: this.activeColors()[0] ?? null,
          reason: 'last-standing',
        };
        return;
      }
    } while (guard <= order.length * 2);
    this.refreshResult();
  }

  private eliminate(color: Color) {
    if (!this.eliminated.includes(color)) this.eliminated.push(color);
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.board[r][c]?.color === color) this.board[r][c] = null;
      }
    }
  }

  private refreshResult() {
    if (this.activeColors().length <= 1 && this.colors.length > 1) {
      this.result = {
        over: true,
        winner: this.activeColors()[0] ?? null,
        reason: 'last-standing',
      };
    }
  }

  private currentChecks(): Color[] {
    return this.activeColors().filter((c) => this.isInCheck(c));
  }

  /**
   * Begin a game with only `active` armies in play; any unfilled army is
   * removed from the board so its turn is skipped. Used when the host starts
   * a 3p/4p room before every seat is taken.
   */
  startWithColors(active: Color[]) {
    for (const color of this.colors) {
      if (!active.includes(color)) this.eliminate(color);
    }
    const first = this.colors.findIndex((c) => !this.eliminated.includes(c));
    this.turnIndex = first >= 0 ? first : 0;
    this.refreshResult();
  }

  // ---- serialization ----

  snapshot(): GridSnapshot {
    return {
      mode: this.mode,
      size: this.size,
      voids: this.voids,
      board: clone(this.board),
      colors: this.colors,
      turnIndex: this.turnIndex,
      eliminated: this.eliminated.slice(),
      enPassant: this.enPassant ? clone(this.enPassant) : null,
      checks: this.currentChecks(),
      result: clone(this.result),
      lastMove: this.lastMove ? clone(this.lastMove) : null,
    };
  }

  load(s: GridSnapshot) {
    this.board = clone(s.board);
    this.turnIndex = s.turnIndex;
    this.eliminated = s.eliminated.slice();
    this.enPassant = s.enPassant ? clone(s.enPassant) : null;
    this.result = clone(s.result);
    this.lastMove = s.lastMove ? clone(s.lastMove) : null;
  }
}
