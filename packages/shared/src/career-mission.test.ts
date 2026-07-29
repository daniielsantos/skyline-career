import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acceptMission,
  cancelMission,
  compareMissionIntentToOfp,
  createSeedEconomyWorld,
  getAircraftClass,
  listMarketLots,
  normalizeOfpExpectation,
  tickEconomyN,
  type MissionIntent,
} from './index.js';

function baseMission(overrides: Partial<MissionIntent> = {}): MissionIntent {
  return {
    id: 'msn_intent',
    shipmentLotId: 'lot_1',
    commodityId: 'electronics',
    originIcao: 'KMIA',
    destIcao: 'SBBR',
    cargoKg: 8_000,
    pax: 0,
    aircraftClassId: 'narrow_freighter',
    rolesPackRelPath: 'profiles/ofp/pmdg-738-bcf.json',
    deadlineTick: 40,
    payUsd: 200,
    urgency: 'urgent',
    reason: 'test',
    status: 'dispatched',
    acceptedAtTick: 24,
    ...overrides,
  };
}

function matchingOfp(overrides: Parameters<typeof normalizeOfpExpectation>[0] = {}) {
  return normalizeOfpExpectation({
    source: 'simbrief',
    icao: 'B738',
    originIcao: 'KMIA',
    destIcao: 'SBBR',
    fuel: { unit: 'kg', total: 10_000 },
    loadSheet: {
      unit: 'kg',
      blockFuel: 10_000,
      passengerCount: 0,
      baggage: 8_000,
      payload: 8_000,
    },
    ...overrides,
  });
}

describe('acceptMission', () => {
  it('reserves cargo and creates MissionIntent for generate-ofp', () => {
    const world = createSeedEconomyWorld({ seed: 'accept-test' });
    tickEconomyN(world, 24);
    const market = listMarketLots(world);
    assert.ok(market.length > 0);
    const lot = market[0]!.lot;
    const before = lot.reservedKg;

    const mission = acceptMission(world, {
      lotId: lot.id,
      aircraftClassId: 'narrow_freighter',
      missionId: 'msn_test_1',
    });

    assert.equal(mission.id, 'msn_test_1');
    assert.equal(mission.status, 'accepted');
    assert.equal(mission.pax, 0);
    assert.equal(mission.originIcao, lot.originIcao);
    assert.equal(mission.destIcao, lot.destIcao);
    assert.equal(mission.shipmentLotId, lot.id);
    assert.ok(mission.cargoKg > 0);
    assert.ok(mission.cargoKg <= getAircraftClass('narrow_freighter').maxCargoKg);
    assert.ok(mission.payUsd > 0);
    assert.equal(mission.rolesPackRelPath, 'profiles/ofp/pmdg-738-bcf.json');
    assert.equal(lot.reservedKg, before + mission.cargoKg);
  });

  it('clamps cargo to aircraft max and remaining lot', () => {
    const world = createSeedEconomyWorld({ seed: 'clamp-test' });
    tickEconomyN(world, 24);
    const lot = listMarketLots(world)[0]!.lot;
    const mission = acceptMission(world, {
      lotId: lot.id,
      cargoKg: 999_999,
      aircraftClassId: 'narrow_freighter',
    });
    assert.equal(mission.cargoKg, Math.min(lot.quantityKg, 22_000));
  });

  it('cancel releases reservation', () => {
    const world = createSeedEconomyWorld({ seed: 'cancel-test' });
    tickEconomyN(world, 24);
    const lot = listMarketLots(world)[0]!.lot;
    const mission = acceptMission(world, {
      lotId: lot.id,
      cargoKg: 5_000,
      aircraftClassId: 'wide_freighter',
      missionId: 'msn_cancel',
    });
    const reservedAfter = lot.reservedKg;
    const cancelled = cancelMission(world, mission);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(lot.reservedKg, reservedAfter - 5_000);
  });
});

describe('compareMissionIntentToOfp', () => {
  it('passes when OFP matches intent', () => {
    const check = compareMissionIntentToOfp(baseMission(), matchingOfp());
    assert.equal(check.verdict, 'pass');
    assert.ok(check.findings.some((f) => f.code === 'INTENT_OFP_OK'));
  });

  it('fails on origin/dest edits', () => {
    const check = compareMissionIntentToOfp(
      baseMission(),
      matchingOfp({ originIcao: 'KJFK', destIcao: 'EGLL' }),
    );
    assert.equal(check.verdict, 'fail');
    assert.ok(check.findings.some((f) => f.code === 'INTENT_ORIGIN_MISMATCH'));
    assert.ok(check.findings.some((f) => f.code === 'INTENT_DEST_MISMATCH'));
  });

  it('fails when cargo drifts beyond tolerance', () => {
    const check = compareMissionIntentToOfp(
      baseMission({ cargoKg: 8_000 }),
      matchingOfp({
        loadSheet: {
          unit: 'kg',
          blockFuel: 10_000,
          passengerCount: 0,
          baggage: 12_000,
          payload: 12_000,
        },
      }),
    );
    assert.equal(check.verdict, 'fail');
    assert.ok(check.findings.some((f) => f.code === 'INTENT_CARGO_MISMATCH'));
  });

  it('fails when freighter OFP has passengers', () => {
    const check = compareMissionIntentToOfp(
      baseMission(),
      matchingOfp({
        loadSheet: {
          unit: 'kg',
          blockFuel: 10_000,
          passengerCount: 40,
          baggage: 8_000,
          payload: 12_000,
        },
      }),
    );
    assert.equal(check.verdict, 'fail');
    assert.ok(check.findings.some((f) => f.code === 'INTENT_PAX_MISMATCH'));
  });

  it('accepts MD11 as alias of MD1F wide freighter', () => {
    const check = compareMissionIntentToOfp(
      baseMission({
        aircraftClassId: 'wide_freighter',
        rolesPackRelPath: 'profiles/ofp/tfdi-md11f.json',
        cargoKg: 40_000,
      }),
      matchingOfp({
        icao: 'MD11',
        loadSheet: {
          unit: 'kg',
          blockFuel: 40_000,
          passengerCount: 0,
          baggage: 40_000,
          payload: 40_000,
        },
      }),
    );
    assert.equal(check.verdict, 'pass');
  });

  it('warns when route ICAOs are missing from OFP', () => {
    const check = compareMissionIntentToOfp(
      baseMission(),
      matchingOfp({ originIcao: undefined, destIcao: undefined }),
    );
    assert.equal(check.verdict, 'warn');
    assert.ok(check.findings.some((f) => f.code === 'INTENT_ORIGIN_MISSING'));
    assert.ok(check.findings.some((f) => f.code === 'INTENT_DEST_MISSING'));
  });
});
