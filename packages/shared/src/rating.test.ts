import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyElo, eloDelta } from './rating.js';

test('equal ratings: winner +16, loser -16 (K=32)', () => {
  assert.equal(eloDelta(1200, 1200, 1), 16);
  assert.equal(eloDelta(1200, 1200, 0), -16);
  const next = applyElo(1200, 1200, 'a');
  assert.deepEqual(next, { a: 1216, b: 1184 });
});

test('draw between equal ratings is a no-op', () => {
  assert.deepEqual(applyElo(1500, 1500, 'draw'), { a: 1500, b: 1500 });
});

test('beating a much stronger player gains more than beating a weaker one', () => {
  const upset = eloDelta(1200, 1800, 1);
  const expected = eloDelta(1800, 1200, 1);
  assert.ok(upset > expected, 'underdog win is worth more');
  assert.ok(expected >= 0 && expected < 8);
});
