import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyPmdgEfbPayloadCorrection,
  captureBaseline,
  compareOfpToLive,
  deriveCompliancePhase,
  DISCOVERY_LIVE_SOURCES,
  enrichPayloadWithRoles,
  fuelToleranceLb,
  normalizeOfpExpectation,
  ofpFuelToLb,
  resolveLiveSourcePrefs,
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

describe('resolveLiveSourcePrefs', () => {
  it('uses discovery cascade when liveSources omitted', () => {
    assert.deepEqual(resolveLiveSourcePrefs(undefined), DISCOVERY_LIVE_SOURCES);
  });

  it('keeps declared lists and fills missing keys with classic-safe defaults', () => {
    const prefs = resolveLiveSourcePrefs({
      fuel: ['mass-balance', 'classic'],
      payload: ['classic-stations'],
    });
    assert.deepEqual(prefs.fuel, ['mass-balance', 'classic']);
    assert.deepEqual(prefs.weights, ['classic-weights']);
    assert.deepEqual(prefs.payload, ['classic-stations']);
  });

  it('preserves liveSources on normalize', () => {
    const ofp = normalizeOfpExpectation({
      source: 'simbrief',
      fuel: { unit: 'kg', total: 1000 },
      liveSources: {
        fuel: ['pmdg-ng3', 'classic'],
        weights: ['pmdg-efb-lvars'],
        payload: ['pmdg-efb'],
      },
    });
    assert.deepEqual(ofp.liveSources?.fuel, ['pmdg-ng3', 'classic']);
    assert.deepEqual(ofp.liveSources?.weights, ['pmdg-efb-lvars']);
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
    assert.equal(enriched.ofpPayloadLb, 840);
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

  it('compares freighter baggage to cabin+bags when GA passenger seats are mapped', () => {
    const ofp = normalizeOfpExpectation({
      source: 'manual',
      fuel: { unit: 'lb', total: 200 },
      loadSheet: { unit: 'lb', baggage: 700, passengerCount: 0 },
      payload: {
        unit: 'lb',
        stationRoles: {
          crewStations: [1, 2],
          passengerStations: [3, 4],
          baggageStations: [5],
        },
      },
      tolerances: { payloadAbsLb: 75 },
    });
    const snap = compareOfpToLive({
      ofp,
      liveFuel: makeFuel({ left: 100, right: 100, center: 0, total: 200 }),
      livePayload: enrichPayloadWithRoles(
        {
          source: 'classic-stations',
          unit: 'lb',
          stations: { 1: 170, 2: 170, 3: 350, 4: 350, 5: 0 },
          total: 1040,
        },
        ofp.payload?.stationRoles,
      ),
      phase: 'preflight',
    });
    assert.ok(!snap.findings.some((f) => f.code === 'BAGGAGE' && f.severity === 'fail'));
  });

  it('fails freighter baggage-only OFP when aircraft payload is empty', () => {
    const ofp = normalizeOfpExpectation({
      source: 'simbrief',
      fuel: { unit: 'lb', total: 174 },
      loadSheet: {
        unit: 'lb',
        blockFuel: 174,
        baggage: 992,
        passengerCount: 0,
      },
      payload: {
        unit: 'lb',
        stationRoles: {
          crewStations: [1, 2],
          baggageStations: [3, 4, 5],
          passengerStations: [],
        },
      },
      tolerances: { payloadAbsLb: 75 },
    });
    const livePayload = enrichPayloadWithRoles(
      {
        source: 'classic-stations',
        unit: 'lb',
        stations: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        total: 0,
      },
      ofp.payload?.stationRoles,
    );
    const snap = compareOfpToLive({
      ofp,
      liveFuel: makeFuel({ left: 87, right: 87, center: 0, total: 174 }),
      livePayload,
      phase: 'preflight',
    });
    assert.equal(snap.verdict, 'fail');
    assert.ok(
      snap.findings.some(
        (f) =>
          f.severity === 'fail' &&
          (f.code === 'PAYLOAD_TOTAL' || f.code === 'BAGGAGE'),
      ),
    );
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

  it('skips PAX_COUNT_UNMAPPED when OFP passengerCount is 0 (freighter)', () => {
    const ofp = normalizeOfpExpectation({
      source: 'simbrief',
      fuel: { unit: 'kg', total: 4927 },
      loadSheet: {
        unit: 'kg',
        blockFuel: 4927,
        payload: 15_200,
        baggage: 15_200,
        passengerCount: 0,
        emptyWeight: 39_633,
        zfw: 54_833,
      },
      payload: {
        unit: 'kg',
        total: 15_200,
        stationRoles: {
          passengerStations: [],
          baggageStations: [1, 2, 3, 4, 5, 6],
          crewStations: [7, 8, 9],
          serviceStations: [10, 11],
        },
      },
    });
    const bagsLb = toApproxLb(15_200);
    const emptyLb = 85_500;
    const zfwLb = emptyLb + bagsLb + 380 + 1495;
    const snap = compareOfpToLive({
      ofp,
      liveFuel: makeFuel({ total: toApproxLb(4927), source: 'classic' }),
      livePayload: {
        source: 'pmdg-efb',
        unit: 'lb',
        stations: {},
        total: bagsLb + 2000,
        baggageLb: bagsLb,
        ofpPayloadLb: bagsLb,
      },
      liveWeights: {
        source: 'pmdg-efb-lvars',
        unit: 'lb',
        emptyLb,
        zfwLb,
        grossLb: zfwLb + toApproxLb(4927),
        fuelLb: toApproxLb(4927),
      },
      phase: 'preflight',
    });
    assert.ok(!snap.findings.some((f) => f.code === 'PAX_COUNT_UNMAPPED'));
    assert.ok(!snap.findings.some((f) => f.code === 'PAX_COUNT'));
    assert.ok(snap.findings.some((f) => f.code === 'EMPTY_WEIGHT' && f.severity === 'warn'));
    assert.equal(snap.verdict, 'warn');
  });

  it('compares payload as pax+bags when roles enrich live state', () => {
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
      payload: {
        unit: 'kg',
        total: 18_114,
        stationRoles: {
          passengerStations: [1, 2, 3, 4],
          baggageStations: [5, 6],
          averagePassengerWeight: 86,
        },
      },
    });
    const payloadLb = toApproxLb(18_114);
    const bagsLb = toApproxLb(4066);
    const paxLb = payloadLb - bagsLb;
    const snap = compareOfpToLive({
      ofp,
      liveFuel: makeFuel({ total: toApproxLb(5291) }),
      livePayload: {
        source: 'classic-stations',
        unit: 'lb',
        stations: {},
        total: payloadLb + 2000, // crew/galley noise in full sum
        ofpPayloadLb: payloadLb,
        baggageLb: bagsLb,
        passengerWeightLb: paxLb,
        estimatedPassengerCount: 163,
      },
      phase: 'preflight',
    });
    assert.equal(
      snap.verdict,
      'pass',
      snap.findings.map((f) => `${f.severity}:${f.code}`).join(' | '),
    );
  });

  it('warns on empty weight mismatch instead of fail', () => {
    const ofp = normalizeOfpExpectation({
      source: 'simbrief',
      fuel: { unit: 'lb', total: 10_000 },
      loadSheet: { unit: 'lb', blockFuel: 10_000, emptyWeight: 93_000 },
    });
    const snap = compareOfpToLive({
      ofp,
      liveFuel: makeFuel({ total: 10_000 }),
      liveWeights: {
        source: 'classic-weights',
        unit: 'lb',
        emptyLb: 91_300,
        grossLb: 120_000,
        zfwLb: 110_000,
        fuelLb: 10_000,
      },
      phase: 'preflight',
    });
    assert.ok(snap.findings.some((f) => f.code === 'EMPTY_WEIGHT' && f.severity === 'warn'));
    assert.equal(snap.verdict, 'warn');
  });

  it('uses PMDG EFB ZFW/GW and derived baggage (not inflated stations)', () => {
    const zfwKg = 59_600;
    const blockKg = 5236;
    const bagsKg = 3892;
    const payloadKg = 17_340;
    const ofp = normalizeOfpExpectation({
      source: 'simbrief',
      fuel: { unit: 'kg', total: blockKg },
      loadSheet: {
        unit: 'kg',
        blockFuel: blockKg,
        payload: payloadKg,
        baggage: bagsKg,
        passengerCount: 156,
        emptyWeight: 42_264,
        zfw: zfwKg,
        tow: 64_609, // post-taxi — should not be the EFB GW target
      },
      payload: {
        unit: 'kg',
        total: payloadKg,
        stationRoles: {
          passengerStations: [1, 2, 3, 4],
          baggageStations: [5, 6],
          crewStations: [7, 8, 9],
          serviceStations: [10, 11],
          averagePassengerWeight: 86.18,
        },
      },
    });
    const emptyLb = 91_300;
    const paxLb = 29_640;
    const crewLb = 380;
    const serviceLb = 1495;
    const zfwLb = toApproxLb(zfwKg);
    const bagsLb = zfwLb - emptyLb - paxLb - crewLb - serviceLb;
    const gwLb = zfwLb + toApproxLb(blockKg);
    const corrected = applyPmdgEfbPayloadCorrection(
      {
        source: 'classic-stations',
        unit: 'lb',
        stations: {
          1: 7400,
          2: 7400,
          3: 7400,
          4: 7440,
          5: 5000,
          6: 5778, // inflated classic cargo
          7: 190,
          8: 190,
          10: 635,
          11: 860,
        },
        total: 50_000,
        passengerWeightLb: paxLb,
        baggageLb: 10_778,
        ofpPayloadLb: paxLb + 10_778,
        estimatedPassengerCount: 156,
      },
      {
        source: 'pmdg-efb-lvars',
        unit: 'lb',
        emptyLb,
        zfwLb,
        grossLb: gwLb,
        fuelLb: toApproxLb(blockKg),
      },
      {
        passengerStations: [1, 2, 3, 4],
        baggageStations: [5, 6],
        crewStations: [7, 8, 9],
        serviceStations: [10, 11],
        averagePassengerWeight: 86.18,
      },
    );
    assert.ok(Math.abs((corrected.payload.baggageLb ?? 0) - bagsLb) < 2);
    const snap = compareOfpToLive({
      ofp,
      liveFuel: makeFuel({ total: toApproxLb(blockKg), source: 'pmdg-ng3' }),
      livePayload: corrected.payload,
      liveWeights: corrected.weights,
      phase: 'preflight',
    });
    assert.ok(!snap.findings.some((f) => f.code === 'BAGGAGE' && f.severity === 'fail'));
    assert.ok(!snap.findings.some((f) => f.code === 'ZFW' && f.severity === 'fail'));
    assert.ok(!snap.findings.some((f) => f.code === 'TOW' && f.severity === 'fail'));
    assert.ok(snap.findings.some((f) => f.code === 'EMPTY_WEIGHT' && f.severity === 'warn'));
    assert.equal(snap.verdict, 'warn', snap.findings.map((f) => `${f.severity}:${f.code}`).join(' | '));
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
