import assert from 'node:assert/strict';
import test from 'node:test';
import type { SimSnapshot } from '@msfs-compat/runtime';
import { fuelFromClassicSnapshot } from './live-reader.js';

function snap(vars: Record<string, number>): SimSnapshot {
  return {
    onGround: true,
    enginesRunning: false,
    parkingBrake: true,
    simRate: 1,
    cgPercent: 20,
    grossWeightLb: 70_000,
    vars,
  } as SimSnapshot;
}

test('fuelFromClassicSnapshot sums aux/tip beyond L/R/C', () => {
  const fuel = fuelFromClassicSnapshot(
    snap({
      'FUEL TANK LEFT MAIN QUANTITY': 342,
      'FUEL TANK RIGHT MAIN QUANTITY': 342,
      'FUEL TANK LEFT AUX QUANTITY': 342,
      'FUEL TANK RIGHT AUX QUANTITY': 342,
    }),
    6,
  );
  assert.equal(fuel.total, 4 * 342 * 6);
});

test('fuelFromClassicSnapshot prefers FUEL TOTAL when higher than tank sum', () => {
  const fuel = fuelFromClassicSnapshot(
    snap({
      'FUEL TANK LEFT MAIN QUANTITY': 342,
      'FUEL TANK RIGHT MAIN QUANTITY': 342,
      'FUEL TOTAL QUANTITY': 1368,
    }),
    6,
  );
  assert.equal(fuel.total, 1368 * 6);
});

test('fuelFromClassicSnapshot uses tip tanks without FUEL TOTAL', () => {
  const fuel = fuelFromClassicSnapshot(
    snap({
      'FUEL TANK LEFT MAIN QUANTITY': 263,
      'FUEL TANK RIGHT MAIN QUANTITY': 263,
      'FUEL TANK LEFT TIP QUANTITY': 263,
      'FUEL TANK RIGHT TIP QUANTITY': 263,
    }),
    6,
  );
  assert.equal(fuel.total, 4 * 263 * 6);
});
