import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CATCH_UP_PULSE_MS,
  ECONOMY_TICK_BUDGET_SCALE,
  takeCalibratedTickBudget,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
} from './career-clock.js';

describe('economy clock', () => {
  it('runs six ticks per hour and 144 per day', () => {
    assert.equal(TICKS_PER_HOUR, 6);
    assert.equal(TICKS_PER_DAY, 144);
    assert.equal(ECONOMY_TICK_BUDGET_SCALE, 4 / 6);
  });

  it('gives every tick a share and keeps the hourly total', () => {
    const world = {};
    let sum = 0;
    for (let i = 0; i < TICKS_PER_HOUR; i++) {
      const n = takeCalibratedTickBudget(world, 'spoke', 2);
      assert.ok(n >= 1);
      sum += n;
    }
    assert.equal(sum, 8);
  });

  it('wakes the background pulse every 30 seconds', () => {
    assert.equal(CATCH_UP_PULSE_MS, 30_000);
  });
});
