import type { CSSProperties } from 'react';
import type { Color, PieceType } from '@skak/shared';
import { COLOR_HEX } from '@skak/shared';

// U+FE0E (text variation selector) forces text rendering. Without it, iOS
// renders some glyphs — notably the pawn ♟ — as a fixed-color emoji that
// ignores the CSS color, making every army's pawns look identical.
const VS = '︎';
const GLYPH: Record<PieceType, string> = {
  k: '♚' + VS,
  q: '♛' + VS,
  r: '♜' + VS,
  b: '♝' + VS,
  n: '♞' + VS,
  p: '♟' + VS,
};

/** Dark armies get a light outline; light armies get a dark outline. */
const LIGHT_ARMIES: Color[] = ['w', 'y'];

export function PieceGlyph({
  type,
  color,
  counterRotate,
}: {
  type: PieceType;
  color: Color;
  counterRotate: number;
}) {
  const outline = LIGHT_ARMIES.includes(color) ? '#1f2937' : '#f8fafc';
  return (
    <span
      className="piece"
      style={
        {
          color: COLOR_HEX[color],
          textShadow: `0 0 1px ${outline}, 0 0 1px ${outline}, 0.6px 0.6px 0 ${outline}, -0.6px -0.6px 0 ${outline}`,
          '--cr': `${counterRotate}deg`,
        } as CSSProperties
      }
    >
      {GLYPH[type]}
    </span>
  );
}
