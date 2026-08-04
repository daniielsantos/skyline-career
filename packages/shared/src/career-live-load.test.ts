import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateLoadVerification,
  isUsableFuelTankBreakdown,
  loadVerificationDrifted,
  pickFuelTankBreakdown,
  pickStableLiveFuelLb,
  resolveLivePayloadLb,
} from './career-live-load.js';
import {
  DEFAULT_JET_A_LB_PER_GAL,
  sanitizeFuelDensityLbPerGal,
} from './ofp-compliance.js';

describe('resolveLivePayloadLb', () => {
  it('uses mass-balance when stations under-read vs heavy aircraft', () => {
    const r = resolveLivePayloadLb({
      stationSumLb: 0,
      massBalanceLb: 900,
      plannedLb: 992,
    });
    assert.equal(r.source, 'mass-balance');
    assert.equal(r.payloadLb, 900);
  });

  it('prefers stations when they carry a real load', () => {
    const r = resolveLivePayloadLb({
      stationSumLb: 850,
      massBalanceLb: 900,
    });
    assert.equal(r.source, 'stations');
    assert.equal(r.payloadLb, 850);
  });

  it('uses mass-balance when classic stations are inflated vs MB', () => {
    const r = resolveLivePayloadLb({
      stationSumLb: 4711,
      massBalanceLb: 230,
    });
    assert.equal(r.source, 'mass-balance');
    assert.equal(r.payloadLb, 230);
  });

  it('allows zero mass-balance (emptied aircraft)', () => {
    const r = resolveLivePayloadLb({ massBalanceLb: 0, stationSumLb: 0 });
    assert.equal(r.source, 'stations');
    assert.equal(r.payloadLb, 0);
  });

  it('trusts emptied stations after a prior real station load', () => {
    const r = resolveLivePayloadLb({
      stationSumLb: 0,
      massBalanceLb: 900,
      plannedLb: 992,
      previousStationSumLb: 1246,
    });
    assert.equal(r.source, 'stations');
    assert.equal(r.payloadLb, 0);
  });

  it('trusts mass-balance when stations stuck at planned but gross dropped', () => {
    const r = resolveLivePayloadLb({
      stationSumLb: 1279,
      massBalanceLb: 40,
      plannedLb: 1246,
    });
    assert.equal(r.source, 'mass-balance');
    assert.equal(r.payloadLb, 40);
  });
});

describe('isUsableFuelTankBreakdown', () => {
  it('rejects all-zero tanks when total fuel is present', () => {
    assert.equal(
      isUsableFuelTankBreakdown({ left: 0, right: 0, center: 0 }, 521),
      false,
    );
  });

  it('accepts balanced L/R tanks', () => {
    assert.equal(
      isUsableFuelTankBreakdown({ left: 261, right: 261, center: 0 }, 521),
      true,
    );
  });

  it('pickFuelTankBreakdown keeps previous on glitch', () => {
    const prev = { left: 261, right: 261, center: 0 };
    assert.deepEqual(
      pickFuelTankBreakdown({ left: 0, right: 0, center: 0 }, prev, 521),
      prev,
    );
  });

  it('pickFuelTankBreakdown keeps previous on tip/aux post-inject flicker', () => {
    const prev = {
      left: 1200,
      right: 1200,
      center: 0,
      leftAux: 800,
      rightAux: 800,
    };
    const glitch = { left: 1200, right: 1200, center: 0 };
    assert.deepEqual(pickFuelTankBreakdown(glitch, prev, 4000), prev);
  });

  it('pickFuelTankBreakdown keeps tips when mains rise mid fuel-inject', () => {
    const prev = {
      left: 800,
      right: 800,
      center: 200,
      leftAux: 400,
      rightAux: 400,
    };
    // AUX read hole while LEFT/RIGHT MAIN already stepped up.
    const glitch = { left: 1100, right: 1100, center: 100 };
    assert.deepEqual(pickFuelTankBreakdown(glitch, prev, 3200), {
      left: 1100,
      right: 1100,
      center: 100,
      leftAux: 400,
      rightAux: 400,
    });
  });

  it('pickStableLiveFuelLb lifts Sim total to match held tip tanks', () => {
    const held = {
      left: 1254,
      right: 1254,
      center: 0,
      leftAux: 527,
      rightAux: 527,
    };
    assert.equal(
      pickStableLiveFuelLb({
        next: 2508,
        prev: 3563,
        plannedLb: 3563,
        nextTanks: held,
        prevTanks: held,
      }),
      3562,
    );
  });

  it('pickFuelTankBreakdown rejects all-zero when total fuel read failed', () => {
    assert.equal(
      pickFuelTankBreakdown({ left: 0, right: 0, center: 0 }, undefined, null),
      undefined,
    );
  });

  it('pickStableLiveFuelLb keeps previous when tip collapse matches the dip', () => {
    const prevTanks = {
      left: 1200,
      right: 1200,
      center: 0,
      leftAux: 800,
      rightAux: 800,
    };
    const nextTanks = { left: 1200, right: 1200, center: 0 };
    assert.equal(
      pickStableLiveFuelLb({
        next: 2400,
        prev: 4000,
        plannedLb: 4000,
        tolLb: 50,
        nextTanks,
        prevTanks,
      }),
      4000,
    );
  });

  it('pickFuelTankBreakdown drops unusable prev when total fuel is present', () => {
    assert.equal(
      pickFuelTankBreakdown(
        { left: 0, right: 0, center: 0 },
        { left: 0, right: 0, center: 0 },
        521,
      ),
      undefined,
    );
    assert.equal(
      pickFuelTankBreakdown(undefined, { left: 0, right: 0, center: 0 }, 521),
      undefined,
    );
  });

  it('pickFuelTankBreakdown accepts empty tanks when aircraft is empty', () => {
    assert.deepEqual(
      pickFuelTankBreakdown(
        { left: 0, right: 0, center: 0 },
        undefined,
        0,
      ),
      { left: 0, right: 0, center: 0 },
    );
  });
});

describe('pickStableLiveFuelLb', () => {
  it('keeps previous when next matches Jet-A→avgas density flicker', () => {
    const planned = 678;
    const prev = 674;
    const next = 605; // 674 * (6.0/6.7) ≈ 604
    assert.equal(
      pickStableLiveFuelLb({ next, prev, plannedLb: planned }),
      prev,
    );
  });

  it('accepts a real fuel drop larger than the density ratio', () => {
    assert.equal(
      pickStableLiveFuelLb({
        next: 400,
        prev: 674,
        plannedLb: 678,
      }),
      400,
    );
  });

  it('accepts next when it matches planned', () => {
    assert.equal(
      pickStableLiveFuelLb({
        next: 670,
        prev: 605,
        plannedLb: 678,
      }),
      670,
    );
  });
});

describe('sanitizeFuelDensityLbPerGal', () => {
  it('rejects avgas density on large-capacity tanks', () => {
    assert.equal(
      sanitizeFuelDensityLbPerGal(6.0, { totalCapacityGal: 315 }),
      DEFAULT_JET_A_LB_PER_GAL,
    );
    assert.equal(sanitizeFuelDensityLbPerGal(6.0, { totalCapacityGal: 80 }), 6.0);
  });
});

describe('evaluateLoadVerification', () => {
  it('fails when live payload is emptied vs planned', () => {
    const v = evaluateLoadVerification({
      plannedFuelLb: 400,
      liveFuelLb: 400,
      plannedPayloadLb: 992,
      livePayloadLb: 0,
    });
    assert.equal(v.ready, false);
    assert.equal(v.payload.ok, false);
    assert.equal(v.fuel.ok, true);
  });

  it('fails when live payload is missing but planned exists', () => {
    const v = evaluateLoadVerification({
      plannedFuelLb: 400,
      liveFuelLb: 400,
      plannedPayloadLb: 992,
      livePayloadLb: undefined,
    });
    assert.equal(v.ready, false);
  });

  it('passes when both match within tolerance', () => {
    const v = evaluateLoadVerification({
      plannedFuelLb: 400,
      liveFuelLb: 410,
      plannedPayloadLb: 992,
      livePayloadLb: 980,
    });
    assert.equal(v.ready, true);
  });
});

describe('loadVerificationDrifted', () => {
  it('detects ready flips', () => {
    const a = evaluateLoadVerification({
      plannedFuelLb: 400,
      liveFuelLb: 400,
      plannedPayloadLb: 900,
      livePayloadLb: 900,
    });
    const b = evaluateLoadVerification({
      plannedFuelLb: 400,
      liveFuelLb: 400,
      plannedPayloadLb: 900,
      livePayloadLb: 0,
    });
    assert.equal(loadVerificationDrifted(a, b), true);
  });
});
