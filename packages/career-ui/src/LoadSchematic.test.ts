import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aggregatePayloadNarrative,
  cgEnvelopeScale,
} from './LoadSchematic.tsx';

describe('cgEnvelopeScale', () => {
  it('keeps Accu-Sim negative MAC on the rail (not clamped to 0–100)', () => {
    const scale = cgEnvelopeScale(-15, 15, -3.2);
    assert.ok(scale.scaleMin < -3.2);
    assert.ok(scale.scaleMax > 15);
    assert.ok(scale.scaleMin < -15);
  });

  it('still spans a simvar 0–100 envelope', () => {
    const scale = cgEnvelopeScale(0, 100, 31);
    assert.ok(scale.scaleMin < 0.1);
    assert.ok(scale.scaleMax > 99.9);
  });
});

describe('aggregatePayloadNarrative', () => {
  it('freighter: cargo (+ crew when mass above floor stations)', () => {
    const buckets = aggregatePayloadNarrative(
      { 1: 170, 2: 170, 3: 400, 4: 200 },
      { 1: 170, 2: 170, 3: 500, 4: 500 },
      {
        crewStations: [1, 2],
        baggageStations: [3, 4],
      },
    );
    assert.deepEqual(
      buckets.map((b) => ({ id: b.id, lb: b.lb, maxLb: b.maxLb })),
      [
        { id: 'crew', lb: 340, maxLb: 340 },
        { id: 'cargo', lb: 600, maxLb: 1000 },
      ],
    );
  });

  it('freighter bags-only live: omits empty crew when max omitted', () => {
    const buckets = aggregatePayloadNarrative(
      { 3: 503 },
      { 3: 800 },
      { crewStations: [1, 2], baggageStations: [3] },
    );
    assert.deepEqual(
      buckets.map((b) => b.id),
      ['cargo'],
    );
    assert.equal(buckets[0]?.lb, 503);
  });

  it('charter / pax_and_cargo: Crew · Pax · Cargo (baggage)', () => {
    const buckets = aggregatePayloadNarrative(
      { 1: 170, 2: 170, 3: 175, 4: 175, 5: 55, 6: 55 },
      undefined,
      {
        crewStations: [1, 2],
        passengerStations: [3, 4],
        baggageStations: [5, 6],
      },
    );
    assert.deepEqual(
      buckets.map((b) => ({ id: b.id, label: b.label, lb: b.lb })),
      [
        { id: 'crew', label: 'Crew', lb: 340 },
        { id: 'pax', label: 'Pax', lb: 350 },
        { id: 'cargo', label: 'Cargo', lb: 110 },
      ],
    );
  });

  it('omits Pax when passengerStations empty', () => {
    const buckets = aggregatePayloadNarrative(
      { 1: 170, 5: 400 },
      undefined,
      { crewStations: [1], baggageStations: [5] },
    );
    assert.deepEqual(
      buckets.map((b) => b.id),
      ['crew', 'cargo'],
    );
  });

  it('other residual outside roles (service excluded)', () => {
    const buckets = aggregatePayloadNarrative(
      { 1: 170, 3: 200, 9: 80, 10: 40 },
      { 9: 100 },
      {
        crewStations: [1],
        baggageStations: [3],
        serviceStations: [10],
      },
    );
    assert.deepEqual(
      buckets.map((b) => ({ id: b.id, lb: b.lb, maxLb: b.maxLb })),
      [
        { id: 'crew', lb: 170, maxLb: undefined },
        { id: 'cargo', lb: 200, maxLb: undefined },
        { id: 'other', lb: 80, maxLb: 100 },
      ],
    );
  });

  it('no roles: single Cargo over all stations', () => {
    const buckets = aggregatePayloadNarrative(
      { 1: 10, 2: 20 },
      { 1: 50, 2: 50 },
      null,
    );
    assert.deepEqual(buckets, [
      { id: 'cargo', label: 'Cargo', lb: 30, maxLb: 100 },
    ]);
  });
});
