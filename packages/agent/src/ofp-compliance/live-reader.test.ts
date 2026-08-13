import assert from 'node:assert/strict';
import test from 'node:test';
import type { SimSnapshot } from '@msfs-compat/runtime';
import {
  fuelFromClassicSnapshot,
  interpretTfdiEfbWeightLvar,
  paintA2aAccusimStations,
  readA2aAccusimLvars,
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

test('readA2aAccusimLvars maps tablet gallons and Character weights', async () => {
  const values = [
    1332, 4050, 6000, 32, 32, 0, 0, 0, 170, 170, 180, 180, 180, 252, 200,
  ];
  const bridge = {
    readSimVars: async () => values,
  };
  const live = await readA2aAccusimLvars(
    bridge as unknown as Parameters<typeof readA2aAccusimLvars>[0],
    6,
  );
  assert.equal(live.payloadLb, 1332);
  assert.equal(live.fuelLb, 384);
  assert.equal(live.tanks.left, 192);
  assert.equal(live.tanks.right, 192);
  assert.equal(live.stations[1], 170);
  assert.equal(live.stations[6], 252);
  assert.equal(live.stations[7], 200);
  assert.equal(live.emptyLb, 4050);
  assert.equal(live.grossLb, 6000);
});

test('paintA2aAccusimStations zeros seats the tablet occupancy cleared', () => {
  const stations = paintA2aAccusimStations({
    characterLb: [170, 170, 200, 200, 200, 200],
    occupancy: [1, 0, 0, 0, 0, 0],
    baggageLb: 0,
    payloadLb: 170,
  });
  assert.equal(stations[1], 170);
  assert.equal(stations[2], 0);
  assert.equal(stations[6], 0);
  assert.equal(stations[7], 0);
});

test('paintA2aAccusimStations drops lingering Character weights when PayloadWeight falls', () => {
  const stations = paintA2aAccusimStations({
    characterLb: [170, 170, 200, 200, 200, 200],
    baggageLb: 0,
    payloadLb: 170,
  });
  assert.equal(stations[1], 170);
  assert.equal(stations[2], 0);
  assert.equal(stations[6], 0);
});

test('readA2aAccusimLvars prefers seat-box sum over PayloadWeight occupant cap', async () => {
  const values = [
    880, 1693, 2948, 28, 28, 0, 0, 0, 170, 170, 201, 201, 0, 0, 200, 1, 1, 1, 1,
    0, 0,
  ];
  const bridge = {
    readSimVars: async () => values,
  };
  const live = await readA2aAccusimLvars(
    bridge as unknown as Parameters<typeof readA2aAccusimLvars>[0],
    6,
    { keepStationIndexes: [1, 2, 3, 4, 7] },
  );
  assert.equal(live.payloadLb, 942);
  assert.equal(live.stations[4], 201);
  assert.equal(live.stations[7], 200);
});

test('paintA2aAccusimStations keeps occupied S4 when ghost S5/S6 inflate the sum', () => {
  const stations = paintA2aAccusimStations({
    characterLb: [170, 170, 201, 201, 150, 150],
    occupancy: [1, 1, 1, 1, 1, 1],
    baggageLb: 200,
    payloadLb: 880,
    keepStationIndexes: [1, 2, 3, 4, 7],
  });
  assert.equal(stations[3], 201);
  assert.equal(stations[4], 201);
  assert.equal(stations[5], undefined);
  assert.equal(stations[6], undefined);
  assert.equal(stations[7], 200);
});
