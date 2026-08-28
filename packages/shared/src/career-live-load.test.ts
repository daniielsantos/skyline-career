import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateLoadVerification,
  isUsableFuelTankBreakdown,
  loadVerificationDrifted,
  pickFuelTankBreakdown,
  pickStableLiveFuelLb,
  paxAndCargoLiveStationSumLb,
  pickPaxAndCargoDisplayedLiveLb,
  careerFreighterLivePayloadLb,
  careerPaxAndCargoLivePayloadLb,
  resolveLivePayloadLb,
  parsePayloadStationCount,
  samplePayloadStationsFromValues,
  isClassicStationBatchIncomplete,
  stationSampleIncomplete,
  stationWeightsDrifted,
} from './career-live-load.js';
import {
  DEFAULT_JET_A_LB_PER_GAL,
  sanitizeFuelDensityLbPerGal,
} from './ofp-compliance.js';

describe('careerFreighterLivePayloadLb', () => {
  const roles = {
    crewStations: [1, 2],
    baggageStations: [3, 4, 5, 6, 7, 8, 9, 10],
  };
  // Turbine Duke after inject: 2×170 crew + 503 lb bags across holds.
  const stations = {
    1: 170,
    2: 170,
    3: 50,
    4: 50,
    5: 70,
    6: 70,
    7: 70,
    8: 71,
    9: 61,
    10: 61,
  };

  it('sums bags only so crew is not compared to freight Due', () => {
    assert.equal(
      careerFreighterLivePayloadLb({ stations, stationRoles: roles }),
      503,
    );
  });

  it('includes passenger seats used as cargo, still skips crew', () => {
    assert.equal(
      careerFreighterLivePayloadLb({
        stations: { ...stations, 11: 200 },
        stationRoles: {
          ...roles,
          passengerStations: [11],
        },
      }),
      703,
    );
  });

  it('returns undefined without bag/pax roles (caller falls back)', () => {
    assert.equal(
      careerFreighterLivePayloadLb({
        stations,
        stationRoles: { crewStations: [1, 2] },
      }),
      undefined,
    );
  });
});

describe('paxAndCargoLiveStationSumLb', () => {
  const stations = {
    1: 14985,
    2: 14985,
    3: 6222,
    4: 10920,
    5: 2543,
    6: 200,
    7: 200,
  };

  it('defaults to skipping Airbus/JF crew S1/S2', () => {
    assert.equal(paxAndCargoLiveStationSumLb(stations), 20085);
  });

  it('skips Maddog crew S6/S7 so cabin S1/S2 count', () => {
    assert.equal(paxAndCargoLiveStationSumLb(stations, [6, 7]), 49655);
  });

  it('sums only pack cabin+holds so Maddog S5 config is ignored', () => {
    assert.equal(
      paxAndCargoLiveStationSumLb(stations, [6, 7], [1, 2, 3, 4]),
      47112,
    );
  });
});

describe('careerPaxAndCargoLivePayloadLb', () => {
  const roles = {
    crewStations: [1, 2],
    passengerStations: [3, 6, 7, 8, 9],
    baggageStations: [4, 5, 14, 15, 16],
    serviceStations: [10, 11, 12, 13],
  };
  const stations = {
    1: 3420,
    2: 7980,
    3: 39520,
    4: 7506,
    5: 6263,
    6: 1060,
    7: 3200,
    8: 190,
    9: 190,
    10: 0,
    11: 300,
    12: 400,
    13: 600,
  };

  it('includes service bays in the career station sum', () => {
    assert.equal(
      careerPaxAndCargoLivePayloadLb({ stations, stationRoles: roles }),
      59229,
    );
  });

  it('prefers ZFW − OFP empty over classic station remap (PMDG CDU/EFB)', () => {
    assert.equal(
      careerPaxAndCargoLivePayloadLb({
        stations,
        stationRoles: roles,
        zfwLb: 396_495,
        ofpEmptyLb: 302_980,
      }),
      93_515,
    );
  });

  it('falls back to station sum when ZFW residual is too small', () => {
    assert.equal(
      careerPaxAndCargoLivePayloadLb({
        stations,
        stationRoles: roles,
        zfwLb: 303_000,
        ofpEmptyLb: 302_980,
      }),
      59229,
    );
  });
});

describe('pickPaxAndCargoDisplayedLiveLb', () => {
  it('prefers emptied mass-balance over ghost Fenix cabin stations', () => {
    assert.equal(
      pickPaxAndCargoDisplayedLiveLb({
        payloadSource: 'mass-balance',
        resolvedPayloadLb: 0,
        cabinStationSumLb: 2591,
      }),
      0,
    );
  });

  it('uses cabin stations when SimConnect is the payload source', () => {
    assert.equal(
      pickPaxAndCargoDisplayedLiveLb({
        payloadSource: 'stations',
        resolvedPayloadLb: 2931,
        cabinStationSumLb: 2591,
      }),
      2591,
    );
  });
});

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

  it('trusts a partial EFB unload even when mass-balance still looks heavy', () => {
    const r = resolveLivePayloadLb({
      stationSumLb: 340,
      massBalanceLb: 1332,
      plannedLb: 1332,
      previousStationSumLb: 1332,
    });
    assert.equal(r.source, 'stations');
    assert.equal(r.payloadLb, 340);
  });

  it('keeps tracking a later EFB step instead of reverting to mass-balance', () => {
    const r = resolveLivePayloadLb({
      stationSumLb: 290,
      massBalanceLb: 1332,
      plannedLb: 1332,
      previousStationSumLb: 340,
    });
    assert.equal(r.source, 'stations');
    assert.equal(r.payloadLb, 290);
  });

  it('does not revert to mass-balance on the next tick when stations are unchanged', () => {
    const r = resolveLivePayloadLb({
      stationSumLb: 340,
      massBalanceLb: 1332,
      plannedLb: 1332,
      previousStationSumLb: 340,
    });
    assert.equal(r.source, 'stations');
    assert.equal(r.payloadLb, 340);
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

  it('trusts mass-balance when Accu-Sim emptied but classic stations only twitched', () => {
    const r = resolveLivePayloadLb({
      stationSumLb: 1032,
      massBalanceLb: 186,
      plannedLb: 1332,
      previousStationSumLb: 1332,
    });
    assert.equal(r.source, 'mass-balance');
    assert.equal(r.payloadLb, 186);
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

  it('pickFuelTankBreakdown trusts tip drain when TOTAL matches mains', () => {
    const prev = {
      left: 933,
      right: 933,
      center: 0,
      leftAux: 52,
      rightAux: 52,
    };
    const drained = {
      left: 975,
      right: 975,
      center: 0,
      leftAux: 0,
      rightAux: 0,
    };
    assert.deepEqual(pickFuelTankBreakdown(drained, prev, 1950), drained);
  });

  it('pickFuelTankBreakdown marks a confirmed drain with explicit zeros', () => {
    const prev = {
      left: 933,
      right: 933,
      center: 0,
      leftAux: 52,
      rightAux: 52,
    };
    // SimConnect omits tanks it reads as empty — the drain marker must survive.
    const drained = { left: 975, right: 975, center: 0 };
    assert.deepEqual(pickFuelTankBreakdown(drained, prev, 1950), {
      left: 975,
      right: 975,
      center: 0,
      leftAux: 0,
      rightAux: 0,
    });
  });

  it('pickFuelTankBreakdown holds tips when the total still covers them', () => {
    // Heavy jet: a flat 3% band (900 lb) would swallow the whole 1054 lb tip
    // pair and release the sticky on the very flicker it absorbs.
    const prev = {
      left: 14_000,
      right: 14_000,
      center: 1000,
      leftAux: 527,
      rightAux: 527,
    };
    const glitch = { left: 14_000, right: 14_000, center: 1000 };
    assert.deepEqual(pickFuelTankBreakdown(glitch, prev, 30_054), prev);
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

  it('accepts a density-sized drop when the tank map also dropped', () => {
    assert.equal(
      pickStableLiveFuelLb({
        next: 605,
        prev: 674,
        plannedLb: 678,
        nextTanks: { left: 300, right: 305, center: 0 },
        prevTanks: { left: 337, right: 337, center: 0 },
      }),
      605,
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

  it('keeps fuel ok after taxi burn undershoot', () => {
    const v = evaluateLoadVerification({
      plannedFuelLb: 2240,
      liveFuelLb: 2100,
      plannedPayloadLb: 900,
      livePayloadLb: 900,
    });
    assert.equal(v.fuel.ok, true);
    assert.equal(v.ready, true);
  });
});

describe('stationSampleIncomplete', () => {
  it('rejects a crew-only map after a full 16-station inject', () => {
    const prev: Record<number, number> = {};
    for (let i = 1; i <= 16; i += 1) prev[i] = i <= 2 ? 170 : 200;
    assert.equal(stationSampleIncomplete(prev, { 1: 170, 2: 170 }), true);
    assert.equal(
      stationWeightsDrifted(prev, { 1: 170, 2: 170 }, 5),
      false,
    );
  });

  it('allows a full 16-key unload (explicit zeros)', () => {
    const prev: Record<number, number> = {};
    const next: Record<number, number> = {};
    for (let i = 1; i <= 16; i += 1) {
      prev[i] = i <= 2 ? 170 : 200;
      next[i] = i <= 2 ? 170 : 0;
    }
    assert.equal(stationSampleIncomplete(prev, next), false);
    assert.equal(stationWeightsDrifted(prev, next, 5), true);
  });
});

describe('stationWeightsDrifted', () => {
  it('detects a station unload', () => {
    assert.equal(
      stationWeightsDrifted({ 1: 170, 3: 400 }, { 1: 170, 3: 0 }, 5),
      true,
    );
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

describe('payload station count batch', () => {
  it('parsePayloadStationCount rejects invalid values', () => {
    assert.equal(parsePayloadStationCount(undefined), undefined);
    assert.equal(parsePayloadStationCount(0), undefined);
    assert.equal(parsePayloadStationCount(11.9), 11);
  });

  it('samplePayloadStationsFromValues respects SDK count', () => {
    const values = [
      100, 200, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ];
    const r = samplePayloadStationsFromValues(values, {
      stationValuesStart: 0,
      payloadStationCountRaw: 6,
    });
    assert.equal(r.stationLoopMax, 6);
    assert.equal(r.stationsRead, 6);
    assert.equal(r.stationSum, 300);
    assert.equal(r.payloadStationCount, 6);
    assert.equal(Object.keys(r.stations).length, 6);
    assert.equal(r.stations[1], 100);
    assert.equal(r.stations[3], 0);
    assert.equal(r.stations[7], undefined);
  });

  it('isClassicStationBatchIncomplete uses count when prior load was heavy', () => {
    assert.equal(
      isClassicStationBatchIncomplete({
        payloadStationCount: 11,
        stationLoopMax: 11,
        stationsRead: 3,
        previousStationSumLb: 2500,
      }),
      true,
    );
    assert.equal(
      isClassicStationBatchIncomplete({
        payloadStationCount: 11,
        stationLoopMax: 11,
        stationsRead: 11,
        previousStationSumLb: 2500,
      }),
      false,
    );
    assert.equal(
      isClassicStationBatchIncomplete({
        payloadStationCount: 6,
        stationLoopMax: 6,
        stationsRead: 6,
        previousStationSumLb: 2500,
      }),
      false,
    );
  });

  it('isClassicStationBatchIncomplete keeps legacy <8 heuristic without count', () => {
    assert.equal(
      isClassicStationBatchIncomplete({
        stationLoopMax: 16,
        stationsRead: 5,
        previousStationSumLb: 900,
      }),
      true,
    );
  });
});
