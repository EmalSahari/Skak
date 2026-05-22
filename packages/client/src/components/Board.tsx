import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { Color, Coord, EngineSnapshot, Move, PieceType } from '@skak/shared';
import { engineFromSnapshot } from '@skak/shared';
import { PieceGlyph } from './Pieces.js';
import { sounds } from '../sound.js';

const ROTATION: Record<Color, number> = { w: 0, b: 180, r: 0, y: 180, g: 90, u: 270 };
const PROMO: PieceType[] = ['q', 'r', 'b', 'n'];

interface Props {
  snapshot: EngineSnapshot;
  myColor: Color | null;
  onMove: (move: Move) => void;
}

const key = (r: number, c: number) => `${r},${c}`;

export function Board({ snapshot, myColor, onMove }: Props) {
  const { size, voids, board, lastMove, checks, result } = snapshot;
  const [selected, setSelected] = useState<Coord | null>(null);
  const [promoteFrom, setPromoteFrom] = useState<{ from: Coord; to: Coord } | null>(null);

  const engine = useMemo(() => engineFromSnapshot(snapshot), [snapshot]);
  const myTurn = !result.over && myColor === engine.currentColor();

  // Sound effects when a move lands or the game ends.
  const histLen = snapshot.history.length;
  const prev = useRef({ len: histLen, over: result.over });
  useEffect(() => {
    if (histLen > prev.current.len) {
      const rec = snapshot.history[histLen - 1];
      if (result.over) sounds.end();
      else if (rec.check) sounds.check();
      else if (rec.capture) sounds.capture();
      else sounds.move();
    } else if (result.over && !prev.current.over) {
      sounds.end();
    }
    prev.current = { len: histLen, over: result.over };
  }, [histLen, result.over, snapshot.history]);

  const legal = useMemo(() => {
    if (!selected || !myTurn) return [];
    return engine.legalMovesFrom(selected);
  }, [engine, selected, myTurn]);

  const legalSet = useMemo(() => new Set(legal.map((m) => key(m.to.r, m.to.c))), [legal]);

  const checkSquares = useMemo(() => {
    const set = new Set<string>();
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) {
        const p = board[r][c];
        if (p && p.type === 'k' && checks.includes(p.color)) set.add(key(r, c));
      }
    return set;
  }, [board, checks, size]);

  const rotation = myColor ? ROTATION[myColor] : 0;

  const clickCell = (r: number, c: number) => {
    if (voids[r][c]) return;
    const piece = board[r][c];
    if (selected && legalSet.has(key(r, c))) {
      const promo = legal.find((m) => m.to.r === r && m.to.c === c && m.promotion);
      if (promo) {
        setPromoteFrom({ from: selected, to: { r, c } });
      } else {
        onMove({ from: selected, to: { r, c } });
        setSelected(null);
      }
      return;
    }
    if (piece && myTurn && piece.color === myColor) {
      setSelected({ r, c });
    } else {
      setSelected(null);
    }
  };

  const choosePromotion = (type: PieceType) => {
    if (promoteFrom) {
      onMove({ from: promoteFrom.from, to: promoteFrom.to, promotion: type });
      setPromoteFrom(null);
      setSelected(null);
    }
  };

  const cells = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (voids[r][c]) {
        cells.push(<div key={key(r, c)} className="cell void" />);
        continue;
      }
      const piece = board[r][c];
      const k = key(r, c);
      const isSel = selected && selected.r === r && selected.c === c;
      const isLast =
        lastMove &&
        ((lastMove.from.r === r && lastMove.from.c === c) ||
          (lastMove.to.r === r && lastMove.to.c === c));
      const classes = [
        'cell',
        (r + c) % 2 === 0 ? 'light' : 'dark',
        isSel ? 'selected' : '',
        isLast ? 'last' : '',
        checkSquares.has(k) ? 'check' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const isDest = lastMove && lastMove.to.r === r && lastMove.to.c === c;
      cells.push(
        <div key={k} className={classes} onClick={() => clickCell(r, c)}>
          {legalSet.has(k) && <span className={piece ? 'capture-ring' : 'move-dot'} />}
          {piece &&
            (isDest ? (
              <motion.span
                key={histLen}
                initial={{ scale: 0.4, opacity: 0.4 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 600, damping: 30 }}
                className="inline-flex"
              >
                <PieceGlyph type={piece.type} color={piece.color} counterRotate={-rotation} />
              </motion.span>
            ) : (
              <PieceGlyph type={piece.type} color={piece.color} counterRotate={-rotation} />
            ))}
        </div>,
      );
    }
  }

  return (
    <div className="relative">
      <div
        className="board"
        style={{
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          transform: `rotate(${rotation}deg)`,
        }}
      >
        {cells}
      </div>

      {promoteFrom && (
        <div
          className="absolute inset-0 z-20 grid place-items-center rounded-2xl bg-black/60 backdrop-blur-sm"
          onClick={() => setPromoteFrom(null)}
        >
          <div
            className="rounded-2xl border border-white/10 bg-zinc-900/95 px-5 py-4 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 text-sm font-medium text-zinc-300">Promote to</p>
            <div className="flex gap-2">
              {PROMO.map((t) => (
                <button
                  key={t}
                  onClick={() => choosePromotion(t)}
                  className="grid h-16 w-16 place-items-center rounded-xl border border-white/10 bg-white/5 text-5xl leading-none transition hover:border-brand-500/60 hover:bg-brand-500/10"
                >
                  <PieceGlyph type={t} color={myColor ?? 'w'} counterRotate={0} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
