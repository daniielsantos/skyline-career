import assert from 'node:assert/strict';
import test from 'node:test';
import { stationBayFill } from './LoadSchematic.tsx';

test('uncapped stations scale to the heaviest bay', () => {
  assert.equal(stationBayFill(2100, undefined, 2100), 1);
  assert.equal(stationBayFill(1050, undefined, 2100), 0.5);
  assert.equal(stationBayFill(0, undefined, 2100), 0);
});

test('a published ceiling still uses weight over max', () => {
  assert.equal(stationBayFill(500, 2000, 2100), 0.25);
  assert.equal(stationBayFill(2500, 2000, 2100), 1);
});
