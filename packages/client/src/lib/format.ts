import type { Coord, GameMode, MoveRecord, PieceType } from '@skak/shared';

const PIECE_LETTER: Record<PieceType, string> = {
  k: 'K',
  q: 'Q',
  r: 'R',
  b: 'B',
  n: 'N',
  p: '',
};

/** Board square label, e.g. (7,4) on an 8x8 board -> "e1". */
export function squareName(coord: Coord, size: number): string {
  const file = String.fromCharCode(97 + coord.c);
  const rank = size - coord.r;
  return `${file}${rank}`;
}

/** Compact algebraic-ish label for a played move (no disambiguation). */
export function moveLabel(rec: MoveRecord, size: number): string {
  const piece = PIECE_LETTER[rec.piece];
  const target = squareName(rec.to, size);
  const sep = rec.capture ? 'x' : '';
  const from = rec.capture && rec.piece === 'p' ? String.fromCharCode(97 + rec.from.c) : '';
  const promo = rec.promotion ? `=${rec.promotion.toUpperCase()}` : '';
  const check = rec.check ? '+' : '';
  return `${piece || from}${sep}${target}${promo}${check}`;
}

/** Build a readable move transcript for the post-game coach. */
export function buildTranscript(history: MoveRecord[], size: number, mode: GameMode): string {
  if (mode === '2p') {
    const lines: string[] = [];
    for (let i = 0; i < history.length; i += 2) {
      const w = moveLabel(history[i], size);
      const b = history[i + 1] ? moveLabel(history[i + 1], size) : '';
      lines.push(`${i / 2 + 1}. ${w} ${b}`.trim());
    }
    return lines.join('  ');
  }
  return history.map((r, i) => `${i + 1}. ${r.color.toUpperCase()} ${moveLabel(r, size)}`).join('  ');
}

/** Format milliseconds as m:ss (or m:ss.t under 10s). */
export function formatClock(ms: number): string {
  const total = Math.max(0, ms);
  const mins = Math.floor(total / 60000);
  const secs = Math.floor((total % 60000) / 1000);
  if (total < 10000) {
    const tenths = Math.floor((total % 1000) / 100);
    return `${secs}.${tenths}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
