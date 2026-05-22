import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build2p, build4p } from './setups.js';
import { createEngine } from './index.js';

test('2p: initial position has 32 pieces and white to move', () => {
  const g = build2p();
  assert.equal(g.currentColor(), 'w');
  let count = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (g.board[r][c]) count++;
  assert.equal(count, 32);
});

test('2p: each side has 20 opening moves', () => {
  const g = build2p();
  assert.equal(g.allLegalMoves('w').length, 20);
  assert.equal(g.allLegalMoves('b').length, 20);
});

test('2p: pawn double-step then en passant', () => {
  const g = build2p();
  g.applyMove({ from: { r: 6, c: 4 }, to: { r: 4, c: 4 } }); // e4
  g.applyMove({ from: { r: 1, c: 0 }, to: { r: 2, c: 0 } }); // a6
  g.applyMove({ from: { r: 4, c: 4 }, to: { r: 3, c: 4 } }); // e5
  g.applyMove({ from: { r: 1, c: 3 }, to: { r: 3, c: 3 } }); // d5, double next to e5
  const epMoves = g.legalMovesFrom({ r: 3, c: 4 });
  const ep = epMoves.find((m) => m.to.r === 2 && m.to.c === 3);
  assert.ok(ep, 'en passant capture should be available');
  g.applyMove(ep!);
  assert.equal(g.board[3][3], null, 'captured pawn removed');
  assert.ok(g.board[2][3] && g.board[2][3]!.color === 'w');
});

test("2p: fool's mate is checkmate", () => {
  const g = build2p();
  g.applyMove({ from: { r: 6, c: 5 }, to: { r: 5, c: 5 } }); // f3
  g.applyMove({ from: { r: 1, c: 4 }, to: { r: 3, c: 4 } }); // e5
  g.applyMove({ from: { r: 6, c: 6 }, to: { r: 4, c: 6 } }); // g4
  g.applyMove({ from: { r: 0, c: 3 }, to: { r: 4, c: 7 } }); // Qh4#
  assert.equal(g.result.over, true);
  assert.equal(g.result.reason, 'checkmate');
  assert.equal(g.result.winner, 'b');
});

test('2p: castling kingside', () => {
  const g = build2p();
  g.applyMove({ from: { r: 6, c: 4 }, to: { r: 4, c: 4 } });
  g.applyMove({ from: { r: 1, c: 4 }, to: { r: 3, c: 4 } });
  g.applyMove({ from: { r: 7, c: 6 }, to: { r: 5, c: 5 } }); // Nf3
  g.applyMove({ from: { r: 0, c: 6 }, to: { r: 2, c: 5 } });
  g.applyMove({ from: { r: 7, c: 5 }, to: { r: 4, c: 2 } }); // Bc4
  g.applyMove({ from: { r: 0, c: 5 }, to: { r: 3, c: 2 } });
  const kingMoves = g.legalMovesFrom({ r: 7, c: 4 });
  const castle = kingMoves.find((m) => m.to.c === 6);
  assert.ok(castle, 'kingside castle available');
  g.applyMove(castle!);
  assert.ok(g.board[7][6] && g.board[7][6]!.type === 'k');
  assert.ok(g.board[7][5] && g.board[7][5]!.type === 'r');
});

test('4p: four armies, 8 pawns + 8 pieces each', () => {
  const g = build4p();
  const counts: Record<string, number> = {};
  for (let r = 0; r < 14; r++)
    for (let c = 0; c < 14; c++) {
      const p = g.board[r][c];
      if (p) counts[p.color] = (counts[p.color] ?? 0) + 1;
    }
  assert.deepEqual(counts, { r: 16, u: 16, y: 16, g: 16 });
});

test('3p: three armies present, red to move', () => {
  const g = createEngine('3p');
  assert.equal(g.currentColor(), 'r');
  assert.ok(g.legalMovesFrom({ r: 12, c: 5 }).length > 0);
});

test('4p: starting with a subset removes unfilled armies', () => {
  const g = build4p();
  g.startWithColors(['r', 'y']); // only red & yellow seated
  const counts: Record<string, number> = {};
  for (let r = 0; r < 14; r++)
    for (let c = 0; c < 14; c++) {
      const p = g.board[r][c];
      if (p) counts[p.color] = (counts[p.color] ?? 0) + 1;
    }
  assert.deepEqual(counts, { r: 16, y: 16 });
  assert.equal(g.currentColor(), 'r');
  // turn order skips the removed blue/green seats
  g.applyMove({ from: { r: 12, c: 5 }, to: { r: 11, c: 5 } }); // red pawn up
  assert.equal(g.currentColor(), 'y');
});
