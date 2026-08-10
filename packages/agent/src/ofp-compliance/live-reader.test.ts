import assert from 'node:assert/strict';
import test from 'node:test';
import type { SimSnapshot } from '@msfs-compat/runtime';
import {
  fuelFromClassicSnapshot,
  interpretTfdiEfbWeightLvar,
} from './live-reader.js';

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

test('interpretTfdiEfbWeightLvar accepts panel ×1000, kg, and lb', () => {
  assert.equal(interpretTfdiEfbWeightLvar(22.3, 'fuel'), 22_300);
  assert.ok(
    Math.abs((interpretTfdiEfbWeightLvar(10_102, 'fuel') ?? 0) - 22_272) < 2,
  );
  assert.equal(interpretTfdiEfbWeightLvar(22_272, 'fuel'), 22_272);

  assert.equal(interpretTfdiEfbWeightLvar(50, 'payload'), 50_000);
  assert.ok(
    Math.abs((interpretTfdiEfbWeightLvar(22_700, 'payload') ?? 0) - 50_045) < 5,
  );
  assert.equal(interpretTfdiEfbWeightLvar(50_045, 'payload'), 50_045);

  assert.equal(interpretTfdiEfbWeightLvar(298.6, 'weight'), 298_600);
  assert.equal(interpretTfdiEfbWeightLvar(298_611, 'weight'), 298_611);
});
