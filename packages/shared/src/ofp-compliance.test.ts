import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  captureBaseline,
  compareOfpToLive,
  deriveCompliancePhase,
  enrichPayloadWithRoles,
  fuelToleranceLb,
  normalizeOfpExpectation,
  ofpFuelToLb,
} from './ofp-compliance.js';
import type { LiveFuelState, OfpExpectation } from './types/ofp-compliance.js';

function makeOfp(overrides: {
  source?: OfpExpectation['source'];
  fuel?: Partial<OfpExpectation['fuel']>;
  loadSheet?: OfpExpectation['loadSheet'];
  payload?: OfpExpectation['payload'];
  tolerances?: Partial<OfpExpectation['tolerances']>;
} = {}): OfpExpectation {
  return normalizeOfpExpectation({
    source: overrides.source ?? 'manual',
    fuel: {
      unit: 'lb',
      left: 8600,
      right: 8600,
      center: 7800,
      total: 25_000,
      ...(overrides.fuel ?? {}),
    },
    loadSheet: overrides.loadSheet,
    payload:
      overrides.payload === undefined
        ? { unit: 'lb', total: 12_000 }
        : overrides.payload,
    tolerances: overrides.tolerances,
  });
}

function makeFuel(partial: Partial<LiveFuelState> = {}): LiveFuelState {
  return {
    source: 'pmdg-ng3',
    unit: 'lb',
    left: 8600,
    right: 8600,
    center: 7800,
    total: 25_000,
    ...partial,
  };
}

describe('ofpFuelToLb', () => {
  it('converts kg to lb', () => {
    const lb = ofpFuelToLb({ unit: 'kg', total: 1000 });
    assert.ok(lb.total !== undefined);
    assert.ok(Math.abs(lb.total - 2204.6226218) < 0.01);
  });
});

describe('normalizeOfpExpectation loadSheet', () => {
  it('fills fuel.total from blockFuel', () => {
    const ofp = normalizeOfpExpectation({
      source: 'simbrief',
      fuel: { unit: 'kg' },
      loadSheet: {
        unit: 'kg',
        blockFuel: 5291,
        payload: 18_114,
        baggage: 4066,
        passengerCount: 163,
        emptyWeight: 42_264,
        zfw: 60_378,
        tow: 65_442,
      },
    });
    assert.equal(ofp.fuel.total, 5291);
    assert.equal(ofp.loadSheet?.passengerCount, 163);
    assert.equal(ofp.payload?.total, 18_114);
  });
});

describe('enrichPayloadWithRoles', () => {
  it('estimates pax count from seat stations', () => {
    const enriched = enrichPayloadWithRoles(
      {
        source: 'classic-stations',
        unit: 'lb',
        stations: { 1: 170, 2: 170, 3: 0, 10: 500 },
        total: 840,
      },
      {
        passengerStations: [1, 2, 3],
        baggageStations: [10],
        averagePassengerWeight: 170,
      },
    );
    assert.equal(enriched.baggageLb, 500);
    assert.equal(enriched.passengerWeightLb, 340);
    assert.equal(enriched.estimatedPassengerCount, 2);
  });
});

describe('fuelToleranceLb', () => {
  it('uses max of abs and pct', () => {
    const ofp = makeOfp();
    assert.equal(fuelToleranceLb(100, ofp.tolerances), 200);
    assert.equal(fuelToleranceLb(20_000, ofp.tolerances), 400);
  });
});

describe('deriveCompliancePhase', () => {
  it('preflight on ground engines off', () => {
    assert.equal(deriveCompliancePhase({ onGround: true, enginesRunning: false }), 'preflight');
  });
  it('locked when flag set on ground', () => {
    assert.equal(
      deriveCompliancePhase({ onGround: true, enginesRunning: false }, { locked: true }),
      'locked',
    );
  });
  it('airborne when engines running', () => {
    assert.equal(deriveCompliancePhase({ onGround: true, enginesRunning: true }), 'airborne');
  });
  it('airborne when airborne', () => {
    assert.equal(deriveCompliancePhase({ onGround: false, enginesRunning: false }), 'airborne');
  });
});

describe('compareOfpToLive preflight', () => {
  it('passes within tolerance', () => {
    const snap = compareOfpToLive({
      ofp: makeOfp(),
      liveFuel: makeFuel({ left: 8650, right: 8550, center: 7850, total: 25_050 }),
      livePayload: { source: 'classic-stations', unit: 'lb', stations: {}, total: 12_020 },
      phase: 'preflight',
    });
    assert.equal(snap.verdict, 'pass');
    assert.equal(snap.findings.length, 0);
  });

  it('fails outside fuel tolerance', () => {
    const snap = compareOfpToLive({
      ofp: makeOfp(),
      liveFuel: makeFuel({ left: 5000, total: 21_400 }),
      phase: 'preflight',
    });
    assert.equal(snap.verdict, 'fail');
    assert.ok(snap.findings.some((f) => f.code === 'FUEL_LEFT'));
  });

  it('only compares fields present in OFP', () => {
    const sparse = normalizeOfpExpectation({
      source: 'manual',
      fuel: { unit: 'lb', left: 8600, right: 8600 },
    });
    const snap = compareOfpToLive({
      ofp: sparse,
      liveFuel: makeFuel({ center: 0, total: 0 }),
      phase: 'preflight',
    });
    assert.equal(snap.verdict, 'pass');
    assert.ok(!snap.findings.some((f) => f.code === 'FUEL_CENTER'));
    assert.ok(!snap.findings.some((f) => f.code === 'FUEL_TOTAL'));
  });

  it('fails payload total drift', () => {
    const snap = compareOfpToLive({
      ofp: makeOfp(),
      liveFuel: makeFuel(),
      livePayload: { source: 'classic-stations', unit: 'lb', stations: {}, total: 15_000 },
      phase: 'locked',
    });
    assert.equal(snap.verdict, 'fail');
    assert.ok(snap.findings.some((f) => f.code === 'PAYLOAD_TOTAL'));
  });

  it('warns when baggage/pax planned without station roles', () => {
    const ofp = normalizeOfpExpectation({
      source: 'simbrief',
      fuel: { unit: 'kg', total: 5291 },
      loadSheet: {
        unit: 'kg',
        blockFuel: 5291,
        payload: 18_114,
        baggage: 4066,
        passengerCount: 163,
      },
    });
    const snap = compareOfpToLive({
      ofp,
      liveFuel: makeFuel({ total: toApproxLb(5291) }),
      livePayload: {
        source: 'classic-stations',
        unit: 'lb',
        stations: {},
        total: toApproxLb(18_114),
      },
      phase: 'preflight',
    });
    assert.ok(snap.findings.some((f) => f.code === 'BAGGAGE_UNMAPPED'));
    assert.ok(snap.findings.some((f) => f.code === 'PAX_COUNT_UNMAPPED'));
  });

  it('compares ZFW/TOW/empty from load sheet', () => {
    const ofp = normalizeOfpExpectation({
      source: 'simbrief',
      fuel: { unit: 'kg', total: 5291 },
      loadSheet: {
        unit: 'kg',
        blockFuel: 5291,
        emptyWeight: 42_264,
        zfw: 60_378,
        tow: 65_669, // empty + payload + block = 42264+18114+5291
        payload: 18_114,
      },
    });
    const fuelLb = toApproxLb(5291);
    const emptyLb = toApproxLb(42_264);
    const payloadLb = toApproxLb(18_114);
    const zfwLb = emptyLb + payloadLb;
    const towLb = zfwLb + fuelLb;
    const snap = compareOfpToLive({
      ofp,
      liveFuel: makeFuel({ total: fuelLb }),
      livePayload: {
        source: 'classic-stations',
        unit: 'lb',
        stations: {},
        total: payloadLb,
      },
      liveWeights: {
        source: 'classic-weights',
        unit: 'lb',
        emptyLb,
        grossLb: towLb,
        zfwLb,
        fuelLb,
        payloadLb,
      },
      phase: 'preflight',
    });
    assert.equal(
      snap.verdict,
      'pass',
      snap.findings.map((f) => `${f.code}:${f.message}`).join(' | '),
    );
  });
});

function toApproxLb(kg: number): number {
  return kg * 2.2046226218;
}

describe('compareOfpToLive airborne burn', () => {
  it('allows fuel decrease', () => {
    const baseline = captureBaseline(makeFuel());
    const snap = compareOfpToLive({
      ofp: makeOfp(),
      liveFuel: makeFuel({ left: 8000, right: 8000, center: 7000, total: 23_000 }),
      livePayload: { source: 'classic-stations', unit: 'lb', stations: {}, total: 12_000 },
      phase: 'airborne',
      baseline,
      previousFuel: makeFuel({ total: 24_000 }),
      previousAtMs: 1_000,
      nowMs: 61_000,
    });
    assert.equal(snap.verdict, 'pass');
  });

  it('fails fuel increase mid-flight', () => {
    const baseline = captureBaseline(makeFuel({ total: 24_000 }));
    const snap = compareOfpToLive({
      ofp: makeOfp(),
      liveFuel: makeFuel({ total: 25_500 }),
      phase: 'airborne',
      baseline,
      previousFuel: makeFuel({ total: 24_000 }),
      previousAtMs: 1_000,
      nowMs: 5_000,
    });
    assert.equal(snap.verdict, 'fail');
    assert.ok(snap.findings.some((f) => f.code.startsWith('FUEL_REFUEL')));
  });

  it('fails payload drift after lock', () => {
    const baseline = captureBaseline(makeFuel(), {
      source: 'classic-stations',
      unit: 'lb',
      stations: { 1: 170 },
      total: 12_000,
    });
    const snap = compareOfpToLive({
      ofp: makeOfp(),
      liveFuel: makeFuel({ total: 24_000 }),
      livePayload: { source: 'classic-stations', unit: 'lb', stations: { 1: 170 }, total: 14_000 },
      phase: 'airborne',
      baseline,
    });
    assert.equal(snap.verdict, 'fail');
    assert.ok(snap.findings.some((f) => f.code === 'PAYLOAD_DRIFT'));
  });

  it('fails suspicious burn rate', () => {
    const ofp = normalizeOfpExpectation({
      source: 'manual',
      fuel: { unit: 'lb', total: 25_000 },
      tolerances: {
        fuelAbsLb: 200,
        fuelPct: 0.02,
        payloadAbsLb: 50,
        weightAbsLb: 200,
        passengerCountAbs: 0,
        maxFuelIncreaseLb: 0,
        maxBurnRateLbPerMin: 500,
      },
    });
    const baseline = captureBaseline(makeFuel({ total: 25_000 }));
    const snap = compareOfpToLive({
      ofp,
      liveFuel: makeFuel({ total: 20_000 }),
      phase: 'airborne',
      baseline,
      previousFuel: makeFuel({ total: 25_000 }),
      previousAtMs: 0,
      nowMs: 60_000,
    });
    assert.equal(snap.verdict, 'fail');
    assert.ok(snap.findings.some((f) => f.code === 'FUEL_BURN_RATE'));
  });
});
