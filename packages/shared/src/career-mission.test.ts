import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acceptMission,
  assertRolesPackAllowsDirectInjection,
  cancelMission,
  careerAllowsDirectInject,
  careerLoadWeightMatchOk,
  careerPreflightReady,
  commitStagedManifest,
  compareMissionIntentToOfp,
  createSeedEconomyWorld,
  departMission,
  estimateRouteCargoLimit,
  findOpenManifestForRoute,
  findActivePlayerMission,
  getAircraftClass,
  isActiveMissionStatus,
  listActivePlayerMissions,
  listMarketLots,
  listViableMarketLots,
  MAX_MANIFEST_LOTS,
  missionLoadPolicy,
  normalizeMissionIntent,
  normalizeOfpExpectation,
  replaceMissionManifest,
  routeDistanceNm,
  settleMission,
  softenCareerPreflightVerdict,
  softenCgFindingSeverity,
  tickEconomyN,
  withMissionLoadPolicy,
  type MissionIntent,
  type ShipmentLot,
} from './index.js';

describe('mission load method policy', () => {
  it('marks narrow/wide as native-simbrief and Caravan/Bonanza/light jet as direct-injection', () => {
    assert.deepEqual(missionLoadPolicy({ aircraftClassId: 'narrow_freighter' }), {
      loadMethod: 'native-simbrief',
      injectCapable: false,
    });
    assert.deepEqual(missionLoadPolicy({ aircraftClassId: 'wide_freighter' }), {
      loadMethod: 'native-simbrief',
      injectCapable: false,
    });
    assert.deepEqual(missionLoadPolicy({ aircraftClassId: 'light_turboprop' }), {
      loadMethod: 'direct-injection',
      injectCapable: true,
    });
    assert.deepEqual(missionLoadPolicy({ aircraftClassId: 'light_jet' }), {
      loadMethod: 'direct-injection',
      injectCapable: true,
    });
    assert.deepEqual(missionLoadPolicy({ aircraftClassId: 'medium_piston' }), {
      loadMethod: 'native-simbrief',
      injectCapable: false,
    });
    assert.deepEqual(missionLoadPolicy({ aircraftClassId: 'light_ga' }), {
      loadMethod: 'direct-injection',
      injectCapable: true,
    });
    assert.equal(
      careerAllowsDirectInject(missionLoadPolicy({ aircraftClassId: 'narrow_freighter' })),
      false,
    );
    assert.equal(
      careerAllowsDirectInject(missionLoadPolicy({ aircraftClassId: 'light_turboprop' })),
      true,
    );
    assert.equal(
      careerAllowsDirectInject(missionLoadPolicy({ aircraftClassId: 'light_ga' })),
      true,
    );
    assert.equal(
      withMissionLoadPolicy({ id: 'm1', aircraftClassId: 'light_turboprop' }).loadMethod,
      'direct-injection',
    );
  });

  it('refuses inject when roles pack is native-simbrief', () => {
    assert.throws(
      () =>
        assertRolesPackAllowsDirectInjection({
          loadMethod: 'native-simbrief',
          injectCapable: false,
        }),
      /loadMethod=native-simbrief/,
    );
    assert.doesNotThrow(() =>
      assertRolesPackAllowsDirectInjection({
        loadMethod: 'direct-injection',
        injectCapable: true,
      }),
    );
  });

  it('softens Preflight CG and keeps ready on fuel+payload only', () => {
    assert.equal(softenCgFindingSeverity('CG_OUT_OF_ENVELOPE', 'fail'), 'warn');
    assert.equal(softenCgFindingSeverity('FUEL_TOTAL', 'fail'), 'fail');
    assert.equal(softenCgFindingSeverity('FUEL_LEFT', 'fail'), 'warn');
    assert.equal(softenCgFindingSeverity('FUEL_RIGHT', 'fail'), 'warn');
    assert.equal(
      careerPreflightReady({ fuelFailed: false, payloadFailed: false }),
      true,
    );
    assert.equal(
      careerPreflightReady({ fuelFailed: false, payloadFailed: true }),
      false,
    );
    assert.equal(softenCareerPreflightVerdict(true, 'fail'), 'warn');
    assert.equal(softenCareerPreflightVerdict(false, 'pass'), 'fail');
    assert.equal(softenCareerPreflightVerdict(true, 'pass'), 'pass');
  });

  it('rejects Loaded vs Due when Sim payload is empty but Due cargo is set', () => {
    assert.equal(careerLoadWeightMatchOk(0, 992, 75), false);
    assert.equal(careerLoadWeightMatchOk(174, 174, 50), true);
    assert.equal(careerLoadWeightMatchOk(undefined, 992, 75), false);
    assert.equal(careerLoadWeightMatchOk(0, undefined, 75), true);
  });
});

describe('estimateRouteCargoLimit', () => {
  it('limits a full Caravan by MTOW and route fuel', () => {
    const result = estimateRouteCargoLimit(
      'light_turboprop',
      363,
      1_704,
    );
    assert.equal(result.structuralMaxCargoKg, 1_704);
    assert.equal(result.estimatedBlockFuelKg, 763);
    assert.equal(result.fuelCapacityKg, 1_027);
    assert.equal(result.fuelFeasible, true);
    assert.equal(result.fuelDeficitKg, 0);
    assert.equal(result.operationalMaxCargoKg, 1_060);
    assert.ok(result.operationalMaxCargoKg < result.structuralMaxCargoKg);
  });

  it('rejects a nominal-range route when block fuel exceeds the tanks', () => {
    const result = estimateRouteCargoLimit(
      'light_turboprop',
      786,
      1_704,
    );
    assert.equal(result.estimatedBlockFuelKg, 1_372);
    assert.equal(result.fuelCapacityKg, 1_027);
    assert.equal(result.fuelFeasible, false);
    assert.equal(result.fuelDeficitKg, 345);
  });

  it('uses live SimBrief weights when supplied', () => {
    const result = estimateRouteCargoLimit(
      'light_turboprop',
      363,
      1_704,
      { oewKg: 2_100, mtowKg: 4_100 },
    );
    assert.equal(result.oewKg, 2_100);
    assert.equal(result.mtowKg, 4_100);
    assert.ok(result.operationalMaxCargoKg > 1_060);
  });
});

function pushTestLot(
  world: ReturnType<typeof createSeedEconomyWorld>,
  overrides: Partial<ShipmentLot> & Pick<ShipmentLot, 'id' | 'originIcao' | 'destIcao'>,
): ShipmentLot {
  const lot: ShipmentLot = {
    commodityId: 'electronics',
    quantityKg: 2_000,
    reservedKg: 0,
    createdAtTick: world.tick,
    expiresAtTick: world.tick + 48,
    payUsd: 500,
    urgency: 'normal',
    reason: 'test lot',
    status: 'available',
    ...overrides,
  };
  world.lots.push(lot);
  return lot;
}

function baseMission(overrides: Partial<MissionIntent> = {}): MissionIntent {
  const base = {
    id: 'msn_intent',
    shipmentLotId: 'lot_1',
    commodityId: 'electronics' as const,
    originIcao: 'SBGR',
    destIcao: 'SBRF',
    cargoKg: 8_000,
    pax: 0 as const,
    aircraftClassId: 'narrow_freighter' as const,
    rolesPackRelPath: 'profiles/ofp/pmdg-738-bcf.json',
    deadlineTick: 40,
    payUsd: 200,
    urgency: 'urgent' as const,
    reason: 'test',
    status: 'dispatched' as const,
    acceptedAtTick: 24,
    ...overrides,
  };
  return normalizeMissionIntent(base as MissionIntent);
}

function matchingOfp(overrides: Parameters<typeof normalizeOfpExpectation>[0] = {}) {
  return normalizeOfpExpectation({
    source: 'simbrief',
    icao: 'B738',
    originIcao: 'SBGR',
    destIcao: 'SBRF',
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
    assert.equal(
      (world.inboundPending ?? []).find((p) => p.missionId === mission.id)?.cargoKg,
      mission.cargoKg,
    );
  });

  it('publishes player inbound on accept and clears on cancel/settle', () => {
    const world = createSeedEconomyWorld({ seed: 'player-inbound-lifecycle' });
    world.lots = [];
    world.npcFlights = [];
    world.inboundPending = [];
    const lot = pushTestLot(world, {
      id: 'lot_inbound_life',
      originIcao: 'SBKP',
      destIcao: 'SBGL',
      commodityId: 'electronics',
      quantityKg: 8_000,
      reservedKg: 0,
      payUsd: 40_000,
      urgency: 'normal',
      expiresAtTick: world.tick + 20,
    });
    const mission = acceptMission(world, {
      lotId: lot.id,
      cargoKg: 5_000,
      aircraftClassId: 'narrow_freighter',
      missionId: 'msn_inbound_life',
    });
    assert.equal(world.inboundPending?.length, 1);
    assert.equal(world.inboundPending![0]!.destIcao, 'SBGL');
    assert.equal(world.inboundPending![0]!.cargoKg, 5_000);

    const cancelled = cancelMission(world, mission);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(world.inboundPending?.length ?? 0, 0);

    const again = acceptMission(world, {
      lotId: lot.id,
      cargoKg: 4_000,
      aircraftClassId: 'narrow_freighter',
      missionId: 'msn_inbound_settle',
    });
    assert.equal(world.inboundPending?.length, 1);
    settleMission(world, again);
    assert.equal(world.inboundPending?.length ?? 0, 0);
  });

  it('clamps cargo to aircraft max and remaining lot', () => {
    const world = createSeedEconomyWorld({ seed: 'clamp-test' });
    tickEconomyN(world, 24);
    const lot = listMarketLots(world)[0]!.lot;
    const availableKg = lot.quantityKg - lot.reservedKg;
    const mission = acceptMission(world, {
      lotId: lot.id,
      cargoKg: 999_999,
      aircraftClassId: 'narrow_freighter',
    });
    assert.equal(mission.cargoKg, Math.min(availableKg, 18_137));
  });

  it('honors maxCargoKg override from SimBrief', () => {
    const world = createSeedEconomyWorld({ seed: 'simbrief-cap' });
    tickEconomyN(world, 24);
    const lot = listMarketLots(world)[0]!.lot;
    const availableKg = lot.quantityKg - lot.reservedKg;
    const mission = acceptMission(world, {
      lotId: lot.id,
      cargoKg: 999_999,
      aircraftClassId: 'narrow_freighter',
      maxCargoKg: 18_137,
    });
    assert.equal(mission.cargoKg, Math.min(availableKg, 18_137));
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
    const bookedKg = mission.cargoKg;
    const cancelled = cancelMission(world, mission);
    assert.equal(cancelled.status, 'cancelled');
    // Lot may already hold NPC reservations — only our booked kg must release.
    assert.equal(lot.reservedKg, reservedAfter - bookedKg);
  });

  it('cancels an orphan mission after its shipment lot was pruned', () => {
    const world = createSeedEconomyWorld({ seed: 'cancel-orphan-test' });
    tickEconomyN(world, 24);
    const lot = listMarketLots(world)[0]!.lot;
    const mission = acceptMission(world, {
      lotId: lot.id,
      cargoKg: 5_000,
      aircraftClassId: 'wide_freighter',
      missionId: 'msn_cancel_orphan',
    });
    world.lots = world.lots.filter((candidate) => candidate.id !== lot.id);

    const cancelled = cancelMission(world, mission);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.shipmentLotId, lot.id);
  });

  it('appends a second same-OD lot onto an open flight', () => {
    const world = createSeedEconomyWorld({ seed: 'manifest-append' });
    const a = pushTestLot(world, {
      id: 'lot_a',
      originIcao: 'SBKP',
      destIcao: 'SBVT',
      commodityId: 'electronics',
      quantityKg: 800,
      payUsd: 200,
    });
    const b = pushTestLot(world, {
      id: 'lot_b',
      originIcao: 'SBKP',
      destIcao: 'SBVT',
      commodityId: 'perishables',
      quantityKg: 600,
      payUsd: 180,
      urgency: 'urgent',
      expiresAtTick: world.tick + 12,
    });

    const flight = acceptMission(world, {
      lotId: a.id,
      cargoKg: 800,
      aircraftClassId: 'light_turboprop',
      maxCargoKg: 1_704,
      missionId: 'msn_manifest',
    });
    assert.equal(flight.lots.length, 1);

    const appended = acceptMission(world, {
      lotId: b.id,
      cargoKg: 500,
      aircraftClassId: 'light_turboprop',
      maxCargoKg: 1_704,
      intoMission: flight,
    });
    assert.equal(appended.id, 'msn_manifest');
    assert.equal(appended.lots.length, 2);
    assert.equal(appended.cargoKg, 1_300);
    assert.equal(appended.payUsd, appended.lots.reduce((s, l) => s + l.payUsd, 0));
    assert.equal(appended.urgency, 'urgent');
    assert.equal(appended.deadlineTick, b.expiresAtTick);
    assert.equal(appended.commodityId, 'electronics');
  });

  it('rejects append for different OD, over capacity, and over lot cap', () => {
    const world = createSeedEconomyWorld({ seed: 'manifest-reject' });
    const a = pushTestLot(world, {
      id: 'lot_od_a',
      originIcao: 'SBKP',
      destIcao: 'SBVT',
      quantityKg: 1_704,
      payUsd: 400,
    });
    const wrongOd = pushTestLot(world, {
      id: 'lot_od_wrong',
      originIcao: 'SBKP',
      destIcao: 'SBGR',
      quantityKg: 500,
      payUsd: 100,
    });
    const extra = pushTestLot(world, {
      id: 'lot_od_extra',
      originIcao: 'SBKP',
      destIcao: 'SBVT',
      quantityKg: 500,
      payUsd: 100,
    });

    const full = acceptMission(world, {
      lotId: a.id,
      cargoKg: 1_704,
      aircraftClassId: 'light_turboprop',
      maxCargoKg: 1_704,
      missionId: 'msn_full',
    });
    assert.throws(
      () =>
        acceptMission(world, {
          lotId: wrongOd.id,
          cargoKg: 100,
          aircraftClassId: 'light_turboprop',
          maxCargoKg: 1_704,
          intoMission: full,
        }),
      /Route mismatch/,
    );
    assert.throws(
      () =>
        acceptMission(world, {
          lotId: extra.id,
          cargoKg: 100,
          aircraftClassId: 'light_turboprop',
          maxCargoKg: 1_704,
          intoMission: full,
        }),
      /No remaining capacity/,
    );

    const world2 = createSeedEconomyWorld({ seed: 'manifest-5lots' });
    const lines: ShipmentLot[] = [];
    for (let i = 0; i < MAX_MANIFEST_LOTS + 1; i++) {
      lines.push(
        pushTestLot(world2, {
          id: `lot_cap_${i}`,
          originIcao: 'SBKP',
          destIcao: 'SBVT',
          quantityKg: 100,
          payUsd: 50,
        }),
      );
    }
    let flight = acceptMission(world2, {
      lotId: lines[0]!.id,
      cargoKg: 100,
      aircraftClassId: 'light_turboprop',
      maxCargoKg: 1_704,
      missionId: 'msn_5',
    });
    for (let i = 1; i < MAX_MANIFEST_LOTS; i++) {
      flight = acceptMission(world2, {
        lotId: lines[i]!.id,
        cargoKg: 100,
        aircraftClassId: 'light_turboprop',
        maxCargoKg: 1_704,
        intoMission: flight,
      });
    }
    assert.equal(flight.lots.length, MAX_MANIFEST_LOTS);
    assert.throws(
      () =>
        acceptMission(world2, {
          lotId: lines[MAX_MANIFEST_LOTS]!.id,
          cargoKg: 100,
          aircraftClassId: 'light_turboprop',
          maxCargoKg: 1_704,
          intoMission: flight,
        }),
      /Manifest full/,
    );
  });

  it('normalizes legacy single-lot missions without lots[]', () => {
    const legacy = {
      id: 'msn_legacy',
      shipmentLotId: 'lot_old',
      commodityId: 'electronics' as const,
      originIcao: 'SBGR',
      destIcao: 'SBRF',
      cargoKg: 8_000,
      pax: 0 as const,
      aircraftClassId: 'narrow_freighter' as const,
      rolesPackRelPath: 'profiles/ofp/pmdg-738-bcf.json',
      deadlineTick: 40,
      payUsd: 200,
      urgency: 'urgent' as const,
      reason: 'legacy save',
      status: 'accepted' as const,
      acceptedAtTick: 24,
    };
    const normalized = normalizeMissionIntent(legacy);
    assert.equal(normalized.lots.length, 1);
    assert.equal(normalized.lots[0]!.shipmentLotId, 'lot_old');
    assert.equal(normalized.cargoKg, 8_000);
    assert.equal(normalized.shipmentLotId, 'lot_old');
  });

  it('findOpenManifestForRoute returns only when exactly one match', () => {
    const a = baseMission({
      id: 'msn_a',
      status: 'accepted',
      originIcao: 'SBKP',
      destIcao: 'SBVT',
      aircraftClassId: 'light_turboprop',
      lots: [
        {
          shipmentLotId: 'l1',
          commodityId: 'electronics',
          cargoKg: 400,
          payUsd: 100,
          urgency: 'normal',
          reason: 'a',
          deadlineTick: 40,
        },
      ],
    });
    const b = baseMission({
      id: 'msn_b',
      status: 'accepted',
      originIcao: 'SBKP',
      destIcao: 'SBVT',
      aircraftClassId: 'light_turboprop',
      lots: [
        {
          shipmentLotId: 'l2',
          commodityId: 'perishables',
          cargoKg: 400,
          payUsd: 100,
          urgency: 'normal',
          reason: 'b',
          deadlineTick: 40,
        },
      ],
    });
    assert.equal(
      findOpenManifestForRoute([a], {
        originIcao: 'SBKP',
        destIcao: 'SBVT',
        aircraftClassId: 'light_turboprop',
      })?.id,
      'msn_a',
    );
    assert.equal(
      findOpenManifestForRoute([a, b], {
        originIcao: 'SBKP',
        destIcao: 'SBVT',
        aircraftClassId: 'light_turboprop',
      }),
      undefined,
    );
  });

  it('isActiveMissionStatus covers accepted/dispatched/in_flight only', () => {
    assert.equal(isActiveMissionStatus('accepted'), true);
    assert.equal(isActiveMissionStatus('dispatched'), true);
    assert.equal(isActiveMissionStatus('in_flight'), true);
    assert.equal(isActiveMissionStatus('settled'), false);
    assert.equal(isActiveMissionStatus('cancelled'), false);
  });

  it('findActivePlayerMission prefers the latest operational flight', () => {
    const older = baseMission({
      id: 'msn_old',
      status: 'accepted',
      acceptedAtTick: 10,
      lots: [
        {
          shipmentLotId: 'l1',
          commodityId: 'electronics',
          cargoKg: 400,
          payUsd: 100,
          urgency: 'normal',
          reason: 'old',
          deadlineTick: 40,
        },
      ],
    });
    const newer = baseMission({
      id: 'msn_new',
      status: 'dispatched',
      acceptedAtTick: 20,
      lots: [
        {
          shipmentLotId: 'l2',
          commodityId: 'machinery',
          cargoKg: 500,
          payUsd: 120,
          urgency: 'normal',
          reason: 'new',
          deadlineTick: 40,
        },
      ],
    });
    const settled = baseMission({
      id: 'msn_done',
      status: 'settled',
      acceptedAtTick: 30,
      lots: [
        {
          shipmentLotId: 'l3',
          commodityId: 'general',
          cargoKg: 300,
          payUsd: 80,
          urgency: 'normal',
          reason: 'done',
          deadlineTick: 40,
        },
      ],
    });
    assert.equal(findActivePlayerMission([older, newer, settled])?.id, 'msn_new');
    assert.equal(listActivePlayerMissions([older, newer, settled]).length, 2);
  });
});

describe('commitStagedManifest', () => {
  it('atomically accepts multiple same-OD lots into one flight', () => {
    const world = createSeedEconomyWorld({ seed: 'staging-commit' });
    const a = pushTestLot(world, {
      id: 'lot_st_a',
      originIcao: 'SBKP',
      destIcao: 'SBVT',
      commodityId: 'electronics',
      quantityKg: 800,
      payUsd: 200,
    });
    const b = pushTestLot(world, {
      id: 'lot_st_b',
      originIcao: 'SBKP',
      destIcao: 'SBVT',
      commodityId: 'machinery',
      quantityKg: 600,
      payUsd: 150,
    });
    const { mission, appended, lineCount } = commitStagedManifest(world, {
      lines: [
        { lotId: a.id, cargoKg: 700 },
        { lotId: b.id, cargoKg: 500 },
      ],
      aircraftClassId: 'light_turboprop',
      maxCargoKg: 1_704,
      missionId: 'msn_staged',
    });
    assert.equal(appended, false);
    assert.equal(lineCount, 2);
    assert.equal(mission.id, 'msn_staged');
    assert.equal(mission.lots.length, 2);
    assert.equal(mission.cargoKg, 1_200);
    assert.equal(a.reservedKg, 700);
    assert.equal(b.reservedKg, 500);
  });

  it('rejects over-capacity and leaves reservations unchanged', () => {
    const world = createSeedEconomyWorld({ seed: 'staging-reject' });
    const a = pushTestLot(world, {
      id: 'lot_rej_a',
      originIcao: 'SBKP',
      destIcao: 'SBVT',
      quantityKg: 2_000,
      payUsd: 400,
    });
    const b = pushTestLot(world, {
      id: 'lot_rej_b',
      originIcao: 'SBKP',
      destIcao: 'SBVT',
      quantityKg: 2_000,
      payUsd: 400,
    });
    assert.throws(
      () =>
        commitStagedManifest(world, {
          lines: [
            { lotId: a.id, cargoKg: 1_000 },
            { lotId: b.id, cargoKg: 1_000 },
          ],
          aircraftClassId: 'light_turboprop',
          maxCargoKg: 1_704,
        }),
      /exceeds remaining capacity/,
    );
    assert.equal(a.reservedKg, 0);
    assert.equal(b.reservedKg, 0);
  });

  it('rejects different OD and duplicate lots', () => {
    const world = createSeedEconomyWorld({ seed: 'staging-od' });
    const a = pushTestLot(world, {
      id: 'lot_od1',
      originIcao: 'SBKP',
      destIcao: 'SBVT',
      quantityKg: 500,
      payUsd: 100,
    });
    const b = pushTestLot(world, {
      id: 'lot_od2',
      originIcao: 'SBKP',
      destIcao: 'SBGR',
      quantityKg: 500,
      payUsd: 100,
    });
    assert.throws(
      () =>
        commitStagedManifest(world, {
          lines: [
            { lotId: a.id, cargoKg: 200 },
            { lotId: b.id, cargoKg: 200 },
          ],
          aircraftClassId: 'light_turboprop',
          maxCargoKg: 1_704,
        }),
      /share one route/,
    );
    assert.throws(
      () =>
        commitStagedManifest(world, {
          lines: [
            { lotId: a.id, cargoKg: 200 },
            { lotId: a.id, cargoKg: 100 },
          ],
          aircraftClassId: 'light_turboprop',
          maxCargoKg: 1_704,
        }),
      /Duplicate lot/,
    );
  });

  it('rejects routes beyond the selected aircraft range', () => {
    const world = createSeedEconomyWorld({ seed: 'staging-range' });
    const longHaul = pushTestLot(world, {
      id: 'lot_long',
      originIcao: 'SBPA',
      destIcao: 'SBRF',
      quantityKg: 800,
      payUsd: 200,
    });
    assert.throws(
      () =>
        commitStagedManifest(world, {
          lines: [{ lotId: longHaul.id, cargoKg: 500 }],
          aircraftClassId: 'light_turboprop',
          maxCargoKg: 1_704,
        }),
      /max range/i,
    );
    assert.equal(longHaul.reservedKg, 0);
  });
});

describe('listViableMarketLots', () => {
  it('filters routes beyond the aircraft class range', () => {
    const world = createSeedEconomyWorld({ seed: 'range-filter' });
    tickEconomyN(world, 24);
    const narrow = listViableMarketLots(world, 'narrow_freighter');
    const wide = listViableMarketLots(world, 'wide_freighter');

    assert.ok(narrow.length > 0);
    assert.ok(wide.length >= narrow.length);
    for (const row of narrow) {
      const distance = routeDistanceNm(world, row.lot.originIcao, row.lot.destIcao);
      assert.ok(distance !== undefined && distance <= 2_500);
    }
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

  it('accepts Commander C182 OFP on light_ga when mission airframe is Commander', () => {
    const check = compareMissionIntentToOfp(
      baseMission({
        aircraftClassId: 'light_ga',
        airframeTypeId: 'blacksquare-commander-114',
        rolesPackRelPath: 'profiles/ofp/blacksquare-commander-114.json',
        cargoKg: 200,
        pax: 0,
      }),
      matchingOfp({
        icao: 'C182',
        loadSheet: {
          unit: 'kg',
          blockFuel: 100,
          passengerCount: 0,
          baggage: 200,
          payload: 200,
        },
      }),
    );
    assert.equal(check.verdict, 'pass');
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

describe('settleMission', () => {
  it('delivers cargo on-time and pays full freight', () => {
    const world = createSeedEconomyWorld({ seed: 'settle-ontime' });
    tickEconomyN(world, 24);
    const lot = listMarketLots(world)[0]!.lot;
    const mission = acceptMission(world, {
      lotId: lot.id,
      cargoKg: 5_000,
      aircraftClassId: 'narrow_freighter',
      missionId: 'msn_settle_1',
    });
    const destBefore =
      world.airports.find((a) => a.icao === mission.destIcao)!.inventory[mission.commodityId]!
        .stockKg;

    const departed = departMission(world, { ...mission, status: 'dispatched' });
    assert.equal(departed.mission.status, 'in_flight');
    assert.ok(departed.mission.fuelUplift);
    assert.ok(departed.fuelDebitUsd > 0);

    const result = settleMission(world, departed.mission, {
      skipMinAirborneGate: true,
    });
    assert.equal(result.mission.status, 'settled');
    assert.equal(result.settlement.onTime, true);
    assert.equal(result.settlement.penaltyUsd, 0);
    assert.equal(result.settlement.payoutUsd, mission.payUsd);
    assert.equal(result.walletCreditUsd, mission.payUsd);

    const destAfter =
      world.airports.find((a) => a.icao === mission.destIcao)!.inventory[mission.commodityId]!
        .stockKg;
    assert.ok(destAfter > destBefore);
    assert.equal(result.settlement.destStockAfterKg, destAfter);
  });

  it('stamps settledLandingFpm when provided', () => {
    const world = createSeedEconomyWorld({ seed: 'settle-fpm' });
    tickEconomyN(world, 24);
    const lot = listMarketLots(world)[0]!.lot;
    const mission = acceptMission(world, {
      lotId: lot.id,
      cargoKg: 5_000,
      aircraftClassId: 'narrow_freighter',
      missionId: 'msn_settle_fpm',
    });
    const departed = departMission(world, { ...mission, status: 'dispatched' });
    const result = settleMission(world, departed.mission, {
      skipMinAirborneGate: true,
      landingFpm: -187.6,
    });
    assert.equal(result.mission.settledLandingFpm, -188);
  });

  it('applies late penalty after deadline', () => {
    const world = createSeedEconomyWorld({ seed: 'settle-late' });
    tickEconomyN(world, 24);
    const lot = listMarketLots(world)[0]!.lot;
    const mission = acceptMission(world, {
      lotId: lot.id,
      cargoKg: 4_000,
      aircraftClassId: 'narrow_freighter',
      missionId: 'msn_late',
    });
    const deadline = world.tick;
    const lateMission = normalizeMissionIntent({
      ...mission,
      status: 'dispatched',
      lots: mission.lots.map((line) => ({
        ...line,
        deadlineTick: deadline,
        urgency: 'urgent' as const,
        payUsd: 1_000,
      })),
    });
    tickEconomyN(world, 3);
    const result = settleMission(world, lateMission);
    assert.equal(result.settlement.lateTicks, 3);
    assert.equal(result.settlement.onTime, false);
    assert.equal(result.settlement.penaltyUsd, Math.min(1_000, Math.round(1_000 * 3 * 0.12)));
    assert.equal(result.settlement.payoutUsd, 1_000 - result.settlement.penaltyUsd);
  });

  it('settle from accepted auto-departs then closes lot portion', () => {
    const world = createSeedEconomyWorld({ seed: 'settle-auto' });
    const lot = pushTestLot(world, {
      id: 'lot_settle_auto',
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      commodityId: 'general',
      quantityKg: 8_000,
      payUsd: 2_000,
    });
    const mission = acceptMission(world, {
      lotId: lot.id,
      cargoKg: 8_000,
      aircraftClassId: 'wide_freighter',
      missionId: 'msn_full',
    });
    assert.equal(lot.status, 'reserved');
    assert.equal(mission.cargoKg, 8_000);
    const result = settleMission(world, mission);
    assert.equal(result.mission.status, 'settled');
    assert.ok(result.fuelDebitUsd > 0);
    assert.ok(result.mission.fuelUplift);
    assert.equal(lot.status, 'delivered');
    assert.equal(lot.quantityKg, 0);
  });

  it('settles multi-commodity manifests with per-line settlement', () => {
    const world = createSeedEconomyWorld({ seed: 'settle-multi' });
    const a = pushTestLot(world, {
      id: 'lot_multi_a',
      originIcao: 'SBKP',
      destIcao: 'SBVT',
      commodityId: 'electronics',
      quantityKg: 500,
      payUsd: 200,
    });
    const b = pushTestLot(world, {
      id: 'lot_multi_b',
      originIcao: 'SBKP',
      destIcao: 'SBVT',
      commodityId: 'machinery',
      quantityKg: 400,
      payUsd: 160,
    });
    let flight = acceptMission(world, {
      lotId: a.id,
      cargoKg: 500,
      aircraftClassId: 'light_turboprop',
      maxCargoKg: 1_704,
      missionId: 'msn_multi',
    });
    flight = acceptMission(world, {
      lotId: b.id,
      cargoKg: 400,
      aircraftClassId: 'light_turboprop',
      maxCargoKg: 1_704,
      intoMission: flight,
    });
    const elecBefore =
      world.airports.find((x) => x.icao === 'SBVT')!.inventory.electronics!.stockKg;
    const machBefore =
      world.airports.find((x) => x.icao === 'SBVT')!.inventory.machinery!.stockKg;

    const result = settleMission(world, { ...flight, status: 'dispatched' });
    assert.equal(result.mission.status, 'settled');
    assert.equal(result.settlement.deliveredKg, 900);
    assert.equal(result.settlement.lines?.length, 2);
    assert.equal(
      result.settlement.payoutUsd,
      result.settlement.lines!.reduce((s, l) => s + l.payoutUsd, 0),
    );
    assert.ok(
      world.airports.find((x) => x.icao === 'SBVT')!.inventory.electronics!.stockKg > elecBefore,
    );
    assert.ok(
      world.airports.find((x) => x.icao === 'SBVT')!.inventory.machinery!.stockKg > machBefore,
    );
    assert.equal(a.status, 'delivered');
    assert.equal(b.status, 'delivered');
  });

  it('cancel releases every line reservation', () => {
    const world = createSeedEconomyWorld({ seed: 'cancel-multi' });
    const a = pushTestLot(world, {
      id: 'lot_can_a',
      originIcao: 'SBKP',
      destIcao: 'SBVT',
      quantityKg: 500,
      payUsd: 100,
    });
    const b = pushTestLot(world, {
      id: 'lot_can_b',
      originIcao: 'SBKP',
      destIcao: 'SBVT',
      quantityKg: 400,
      payUsd: 80,
    });
    let flight = acceptMission(world, {
      lotId: a.id,
      cargoKg: 500,
      aircraftClassId: 'light_turboprop',
      maxCargoKg: 1_704,
      missionId: 'msn_can',
    });
    flight = acceptMission(world, {
      lotId: b.id,
      cargoKg: 400,
      aircraftClassId: 'light_turboprop',
      maxCargoKg: 1_704,
      intoMission: flight,
    });
    assert.equal(a.reservedKg, 500);
    assert.equal(b.reservedKg, 400);
    const cancelled = cancelMission(world, flight);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(a.reservedKg, 0);
    assert.equal(b.reservedKg, 0);
    assert.equal(a.status, 'available');
    assert.equal(b.status, 'available');
  });

  it('cancel mid-flight releases in_transit lots back to market', () => {
    const world = createSeedEconomyWorld({ seed: 'cancel-inflight' });
    const lot = pushTestLot(world, {
      id: 'lot_can_air',
      originIcao: 'SBKP',
      destIcao: 'SBVT',
      quantityKg: 500,
      payUsd: 100,
    });
    let flight = acceptMission(world, {
      lotId: lot.id,
      cargoKg: 500,
      aircraftClassId: 'light_turboprop',
      maxCargoKg: 1_704,
      missionId: 'msn_can_air',
    });
    flight = departMission(world, flight).mission;
    assert.equal(flight.status, 'in_flight');
    assert.equal(lot.status, 'in_transit');
    assert.equal(lot.reservedKg, 500);
    const cancelled = cancelMission(world, flight);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(lot.reservedKg, 0);
    assert.equal(lot.status, 'available');
  });
});

describe('replaceMissionManifest', () => {
  it('reduces payload, keeps mission id, and clears OFP/preflight', () => {
    const world = createSeedEconomyWorld({ seed: 'replace-manifest' });
    const lot = pushTestLot(world, {
      id: 'lot_rep_1',
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      quantityKg: 1_500,
      payUsd: 1_200,
    });
    let mission = acceptMission(world, {
      lotId: lot.id,
      cargoKg: 1_200,
      aircraftClassId: 'light_turboprop',
      maxCargoKg: 1_704,
      missionId: 'msn_rep_1',
    });
    mission = {
      ...mission,
      status: 'dispatched',
      staticId: 'career_static_rep',
      aircraftId: 'acf_caravan_1',
      dispatchedAtTick: world.tick,
      fuelUplift: {
        originIcao: 'SBGR',
        requestedKg: 100,
        deliveredKg: 100,
        unitPriceUsd: 1,
        costUsd: 100,
        scarcity: 'ok',
        upliftedAtTick: world.tick,
      },
      fuelAuthorizedOfpId: 'old-ofp',
      lastOfpCheck: {
        verdict: 'fail',
        summary: 'too heavy',
        checkedAtIso: new Date().toISOString(),
        findings: [],
      },
      lastPreflightCheck: {
        verdict: 'fail',
        summary: 'payload',
        checkedAtIso: new Date().toISOString(),
        findings: [],
      },
    };
    assert.equal(lot.reservedKg, 1_200);

    const replaced = replaceMissionManifest(world, mission, {
      lines: [{ lotId: lot.id, cargoKg: 600 }],
      aircraftClassId: 'light_turboprop',
      maxCargoKg: 1_704,
    });

    assert.equal(replaced.id, 'msn_rep_1');
    assert.equal(replaced.status, 'accepted');
    assert.equal(replaced.cargoKg, 600);
    assert.equal(replaced.lots.length, 1);
    assert.equal(replaced.lots[0]?.shipmentLotId, lot.id);
    assert.equal(replaced.lots[0]?.cargoKg, 600);
    assert.equal(replaced.aircraftId, 'acf_caravan_1');
    assert.equal(replaced.staticId, 'career_static_rep');
    assert.equal(replaced.lastOfpCheck, undefined);
    assert.equal(replaced.lastPreflightCheck, undefined);
    assert.equal(replaced.fuelUplift?.costUsd, 100);
    assert.equal(replaced.fuelAuthorizedOfpId, undefined);
    assert.equal(replaced.dispatchedAtTick, undefined);
    assert.equal(lot.reservedKg, 600);
    assert.equal(lot.status, 'available');
  });

  it('rolls back reservations if the new lines are invalid', () => {
    const world = createSeedEconomyWorld({ seed: 'replace-rollback' });
    const lot = pushTestLot(world, {
      id: 'lot_rep_2',
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      quantityKg: 800,
      payUsd: 400,
    });
    const mission = acceptMission(world, {
      lotId: lot.id,
      cargoKg: 500,
      aircraftClassId: 'light_turboprop',
      maxCargoKg: 1_704,
      missionId: 'msn_rep_2',
    });
    assert.throws(
      () =>
        replaceMissionManifest(world, mission, {
          lines: [{ lotId: lot.id, cargoKg: 5_000 }],
          maxCargoKg: 1_704,
        }),
      /available|capacity/i,
    );
    assert.equal(lot.reservedKg, 500);
  });
});
