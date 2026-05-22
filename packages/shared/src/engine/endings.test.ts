import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build2p, build4p } from './setups.js';

test('2p: resignation makes the opponent win', () => {
  const g = build2p();
  g.endByElimination('w', 'resignation');
  assert.equal(g.result.over, true);
  assert.equal(g.result.winner, 'b');
  assert.equal(g.result.reason, 'resignation');
});

test('2p: timeout makes the opponent win', () => {
  const g = build2p();
  g.endByElimination('b', 'timeout');
  assert.deepEqual(g.result, { over: true, winner: 'w', reason: 'timeout' });
});

test('2p: declareDraw ends with no winner', () => {
  const g = build2p();
  g.declareDraw();
  assert.deepEqual(g.result, { over: true, winner: null, reason: 'agreement' });
});

test('4p: resigning on your turn advances to the next active army', () => {
  const g = build4p(); // turn order r, u, y, g; red to move
  assert.equal(g.currentColor(), 'r');
  g.endByElimination('r', 'resignation');
  assert.equal(g.result.over, false, 'game continues with three armies');
  assert.equal(g.currentColor(), 'u', 'turn passed to blue');
  assert.ok(g.eliminated.includes('r'));
});

test('history records moves with capture and check flags', () => {
  const g = build2p();
  g.applyMove({ from: { r: 6, c: 4 }, to: { r: 4, c: 4 } }); // e4
  assert.equal(g.history.length, 1);
  assert.equal(g.history[0].piece, 'p');
  assert.equal(g.history[0].color, 'w');
  assert.equal(g.history[0].capture, false);
});
