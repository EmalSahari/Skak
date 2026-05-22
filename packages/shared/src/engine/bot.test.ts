import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build2p, build4p } from './setups.js';
import { chooseMove } from './bot.js';

test('bot returns a legal move for the opening position', () => {
  const g = build2p();
  const move = chooseMove(g, 'w', 'normal');
  assert.ok(move, 'bot produced a move');
  assert.ok(g.applyMove(move!), 'bot move was legal');
});

test('a hard bot captures a hanging queen', () => {
  const g = build2p();
  g.applyMove({ from: { r: 6, c: 4 }, to: { r: 4, c: 4 } }); // e4 (white)
  g.applyMove({ from: { r: 1, c: 0 }, to: { r: 2, c: 0 } }); // a6 (black) -> white to move
  // Plant a black queen on d5, attackable by the e4 pawn at (4,4).
  g.board[3][3] = { type: 'q', color: 'b', hasMoved: true };
  const move = chooseMove(g, 'w', 'hard');
  assert.ok(move);
  assert.deepEqual(move!.to, { r: 3, c: 3 }, 'bot takes the free queen');
});

test('bot vs bot 4p game runs many plies without error', () => {
  const g = build4p();
  for (let i = 0; i < 60 && !g.result.over; i++) {
    const color = g.currentColor();
    const move = chooseMove(g, color, 'normal');
    if (!move) break;
    assert.ok(g.applyMove(move), `ply ${i} legal`);
  }
  assert.ok(true);
});
