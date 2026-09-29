import assert from 'node:assert/strict';
import test from 'node:test';
import { ledgerDayClock } from './CashflowPanel.tsx';

test('day number stays 1-based and time is the 10-minute economy clock', () => {
  assert.deepEqual(ledgerDayClock({ dayIndex: 35, atTick: 35 * 144 }), {
    day: 36,
    time: '00:00',
  });
  assert.deepEqual(ledgerDayClock({ dayIndex: 35, atTick: 35 * 144 + 57 }), {
    day: 36,
    time: '09:30',
  });
  assert.deepEqual(ledgerDayClock({ dayIndex: 0, atTick: 143 }), {
    day: 1,
    time: '23:50',
  });
});
