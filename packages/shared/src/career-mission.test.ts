import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acceptMission,
  applyOfpBallastLb,
  assertRolesPackAllowsDirectInjection,
  cancelMission,
  careerAllowsDirectInject,
  careerLoadWeightMatchOk,
  careerFuelMatchOk,
  careerPreflightReady,
  commitStagedManifest,
  compareMissionIntentToOfp,
  createSeedEconomyWorld,
  departMission,
  revertFalseDepartMission,
  estimateRouteCargoLimit,
  findOpenManifestForRoute,
  findActivePlayerMission,
  getAircraftClass,
  isActiveMissionStatus,
  isOfpCargoUnderOnlyFailure,
  KG_TO_LB,
  listActivePlayerMissions,
  listMarketLots,
  listViableMarketLots,
  MAX_MANIFEST_LOTS,
  missionLoadPolicy,
  normalizeMissionIntent,
  normalizeOfpExpectation,
  ofpCargoKg,
  replaceMissionManifest,
  routeDistanceNm,
  settleMission,
  softenCareerPreflightVerdict,
  softenCgFindingSeverity,
  trimMissionCargoToKg,
  tickEconomyN,
  withMissionLoadPolicy,
  type MissionIntent,
  type ShipmentLot,
} from './index.js';

/**
 * First Market row the player could actually book.
 * The board also lists fully-reserved NPC crew offers (accepted via
 * acceptContractPilotOffer), so `listMarketLots(world)[0]` is not bookable.
 */
function firstBookableLot(
  world: ReturnType<typeof createSeedEconomyWorld>,
  minAvailableKg = 1,
): ShipmentLot {
  const view = listMarketLots(world).find(
    (entry) => !entry.npcClaim?.crewNeeded && entry.availableKg >= minAvailableKg,
  );
  assert.ok(view, `no bookable lot with >= ${minAvailableKg} kg`);
  return view.lot;
}

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

  it('allows fuel taxi burn undershoot and small unusable overshoot', () => {
    assert.equal(careerFuelMatchOk(2240, 2240, 50), true);
    assert.equal(careerFuelMatchOk(2090, 2240, 50), true); // -150 within taxi
    assert.equal(careerFuelMatchOk(2039, 2240, 50), false); // -201 beyond tol+taxi
    assert.equal(careerFuelMatchOk(2291, 2240, 50), true); // +51 within unusable slack
    assert.equal(careerFuelMatchOk(2285, 2240, 50), true); // +45 within tol
    // King Air-style tip residual (~122–168 lb) must not fail Loaded vs Due.
    assert.equal(careerFuelMatchOk(1980, 1858, 50), true);
    assert.equal(careerFuelMatchOk(2026, 1858, 50), true);
    assert.equal(careerFuelMatchOk(2110, 1858, 50), false); // beyond unusable slack
    assert.equal(careerFuelMatchOk(2291, 2240, 50, 150, 0), false); // no unusable slack
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
    assert.equal(result.estimatedBlockFuelKg, 494);
    assert.equal(result.fuelCapacityKg, 1_027);
    assert.equal(result.fuelFeasible, true);
    assert.equal(result.fuelDeficitKg, 0);
    assert.equal(result.operationalMaxCargoKg, 1_278);
    assert.ok(result.operationalMaxCargoKg < result.structuralMaxCargoKg);
  });

  it('rejects a nominal-range route when block fuel exceeds the tanks', () => {
    const result = estimateRouteCargoLimit(
      'light_turboprop',
      950,
      1_704,
    );
    assert.equal(result.estimatedBlockFuelKg, 1_034);
    assert.equal(result.fuelCapacityKg, 1_027);
    assert.equal(result.fuelFeasible, false);
    assert.equal(result.fuelDeficitKg, 7);
  });

  it('plans KMIA→MMUN Caravan block near SimBrief (not 80% over)', () => {
    // SimBrief C208 KMIA→MMUN: ~1716 lb block / 545 nm airway.
    // Career GC is ~462 nm; catalog burn × mild factor must stay near that ballpark.
    const result = estimateRouteCargoLimit('light_turboprop', 462, 2_948, {
      oewKg: 1_922,
      mtowKg: 3_969,
      fuelCapacityKg: 1_020,
      fuelBurnKgPerNm: 1.028,
      airframeTypeId: 'c208-caravan-cargo',
    });
    assert.equal(result.fuelFeasible, true);
    assert.ok(
      result.estimatedBlockFuelKg >= 650 && result.estimatedBlockFuelKg <= 820,
      `expected ~700–780 kg block, got ${result.estimatedBlockFuelKg}`,
    );
    assert.ok(result.operationalMaxCargoKg > 800);
  });

  it('uses Commander airframe burn so short light_ga hops stay feasible', () => {
    const result = estimateRouteCargoLimit('light_ga', 152, 320, {
      fuelCapacityKg: 190,
      oewKg: 855,
      mtowKg: 1424,
      airframeTypeId: 'blacksquare-commander-114',
    });
    assert.equal(result.fuelCapacityKg, 190);
    assert.ok(result.estimatedBlockFuelKg < result.fuelCapacityKg);
    assert.equal(result.fuelFeasible, true);
    // Must be well below Bonanza-class estimate (~196 kg) that used to block this hop.
    assert.ok(result.estimatedBlockFuelKg < 160);
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
    assert.ok(result.operationalMaxCargoKg > 1_009);
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
    assert.ok(listMarketLots(world).length > 0);
    const lot = firstBookableLot(world);
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
    const lot = listMarketLots(world).find(
      (entry) => entry.lot.quantityKg - entry.lot.reservedKg > 0,
    )!.lot;
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
    const lot = listMarketLots(world).find(
      (entry) => entry.lot.quantityKg - entry.lot.reservedKg > 0,
    )!.lot;
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
    const lot = listMarketLots(world).find(
      (entry) => entry.lot.quantityKg - entry.lot.reservedKg >= 5_000,
    )!.lot;
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
    const lot = listMarketLots(world).find(
      (entry) => entry.lot.quantityKg - entry.lot.reservedKg >= 5_000,
    )!.lot;
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

  it('keeps crew-needed holds even when the lot is fully reserved', () => {
    const world = createSeedEconomyWorld({ seed: 'viable-crew-needed' });
    tickEconomyN(world, 48);
    const crew = listMarketLots(world).filter((row) => row.npcClaim?.crewNeeded);
    assert.ok(crew.length > 0, 'expected crew-needed offers');
    const viable = new Set(
      listViableMarketLots(world, 'light_ga').map((row) => row.lot.id),
    );
    for (const row of crew) {
      assert.ok(
        viable.has(row.lot.id),
        `${row.lot.id} crew-needed dropped from GA viable`,
      );
    }
  });
});

describe('compareMissionIntentToOfp', () => {
  it('passes when OFP matches intent', () => {
    const check = compareMissionIntentToOfp(baseMission(), matchingOfp());
    assert.equal(check.verdict, 'pass');
    assert.ok(check.findings.some((f) => f.code === 'INTENT_OFP_OK'));
  });

  it('accepts F406 OFP ICAO for F406 catalog airframe', () => {
    const check = compareMissionIntentToOfp(
      baseMission({
        aircraftClassId: 'light_turboprop',
        airframeTypeId: 'inibuilds-f406-caravan-ii-passenger',
        cargoKg: 500,
        rolesPackRelPath: 'profiles/ofp/inibuilds-f406-caravan-ii-passenger.json',
      }),
      matchingOfp({
        icao: 'F406',
        loadSheet: {
          unit: 'kg',
          blockFuel: 600,
          passengerCount: 0,
          baggage: 500,
          payload: 500,
        },
      }),
    );
    assert.equal(check.verdict, 'pass');
    assert.ok(!check.findings.some((f) => f.code === 'INTENT_AIRFRAME_MISMATCH'));
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

  it('fails when OFP cargo is cut below mission within the old ±500 kg band', () => {
    // KTPA→KDFW F406 case: mission ~816 kg, SimBrief MTOW-limited to 591 kg.
    const check = compareMissionIntentToOfp(
      baseMission({
        cargoKg: 816,
        aircraftClassId: 'light_turboprop',
        airframeTypeId: 'inibuilds-f406-caravan-ii-passenger',
      }),
      matchingOfp({
        icao: 'F406',
        loadSheet: {
          unit: 'kg',
          blockFuel: 1_406,
          passengerCount: 0,
          baggage: 591,
          payload: 591,
        },
      }),
    );
    assert.equal(check.verdict, 'fail');
    const finding = check.findings.find((f) => f.code === 'INTENT_CARGO_MISMATCH');
    assert.ok(finding);
    assert.match(finding!.message, /MTOW|below mission/i);
  });

  it('still allows small under-load within the tight under-tolerance', () => {
    const check = compareMissionIntentToOfp(
      baseMission({ cargoKg: 800 }),
      matchingOfp({
        loadSheet: {
          unit: 'kg',
          blockFuel: 1_000,
          passengerCount: 0,
          baggage: 760,
          payload: 760,
        },
      }),
    );
    assert.equal(check.verdict, 'pass');
    assert.ok(!check.findings.some((f) => f.code === 'INTENT_CARGO_MISMATCH'));
  });

  it('detects cargo-under as the only fail', () => {
    const check = compareMissionIntentToOfp(
      baseMission({ cargoKg: 1_800 }),
      matchingOfp({
        loadSheet: {
          unit: 'kg',
          blockFuel: 400,
          passengerCount: 0,
          baggage: 1_500,
          payload: 1_500,
        },
      }),
    );
    assert.equal(check.verdict, 'fail');
    assert.equal(isOfpCargoUnderOnlyFailure(check), true);
  });

  it('does not treat airframe mismatch as cargo-under-only', () => {
    const check = compareMissionIntentToOfp(
      baseMission({
        cargoKg: 1_800,
        airframeTypeId: 'c208-caravan-cargo',
        aircraftClassId: 'light_turboprop',
      }),
      matchingOfp({
        icao: 'B738',
        loadSheet: {
          unit: 'kg',
          blockFuel: 400,
          passengerCount: 0,
          baggage: 1_500,
          payload: 1_500,
        },
      }),
    );
    assert.equal(check.verdict, 'fail');
    assert.equal(isOfpCargoUnderOnlyFailure(check), false);
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

describe('applyOfpBallastLb', () => {
  const ferryOfp = (unit: 'kg' | 'lb') =>
    normalizeOfpExpectation({
      source: 'simbrief',
      fuel: { unit, total: 6986 },
      loadSheet: { unit, blockFuel: 6986, baggage: 0, payload: 0 },
    });

  it('leaves the sheet untouched when no ballast was placed', () => {
    const ofp = ferryOfp('lb');
    assert.equal(applyOfpBallastLb(ofp, 0), ofp);
    assert.equal(applyOfpBallastLb(ofp, -50), ofp);
  });

  it('adds ballast to a lb load sheet so a ferry Due is no longer zero', () => {
    const withBallast = applyOfpBallastLb(ferryOfp('lb'), 440);
    assert.equal(withBallast.loadSheet?.baggage, 440);
    assert.equal(withBallast.loadSheet?.payload, 440);
    // Due follows the sheet — this is what stops the empty-cabin preflight fail.
    assert.equal(Math.round(ofpCargoKg(withBallast)! * KG_TO_LB), 440);
  });

  it('converts ballast into the sheet unit when the OFP is metric', () => {
    const withBallast = applyOfpBallastLb(ferryOfp('kg'), 440);
    assert.ok(Math.abs(withBallast.loadSheet!.baggage! - 440 / KG_TO_LB) < 0.01);
    assert.ok(Math.abs(ofpCargoKg(withBallast)! - 440 / KG_TO_LB) < 0.01);
  });

  it('stacks ballast on top of real cargo instead of replacing it', () => {
    const loaded = normalizeOfpExpectation({
      source: 'simbrief',
      fuel: { unit: 'lb', total: 6986 },
      loadSheet: { unit: 'lb', blockFuel: 6986, baggage: 1200 },
    });
    assert.equal(applyOfpBallastLb(loaded, 300).loadSheet?.baggage, 1500);
  });
});

describe('trimMissionCargoToKg', () => {
  it('releases excess reservation and lowers pay', () => {
    const world = createSeedEconomyWorld({ seed: 'trim-cargo' });
    world.lots = [];
    world.inboundPending = [];
    const lot = pushTestLot(world, {
      id: 'lot_trim_1',
      originIcao: 'KLAX',
      destIcao: 'KSNA',
      commodityId: 'general',
      quantityKg: 2_000,
      payUsd: 2_000,
    });
    const mission = acceptMission(world, {
      lotId: lot.id,
      cargoKg: 1_800,
      aircraftClassId: 'light_turboprop',
      missionId: 'msn_trim_1',
      maxCargoKg: 3_000,
    });
    assert.equal(mission.cargoKg, 1_800);
    assert.equal(lot.reservedKg, 1_800);
    const payBefore = mission.payUsd;

    const trimmed = trimMissionCargoToKg(world, mission, 1_500);
    assert.equal(trimmed.mission.cargoKg, 1_500);
    assert.equal(trimmed.releasedKg, 300);
    assert.equal(lot.reservedKg, 1_500);
    assert.ok(trimmed.payAfterUsd < payBefore);
    assert.equal(trimmed.payAfterUsd, trimmed.mission.payUsd);
    assert.equal(
      (world.inboundPending ?? []).find((p) => p.missionId === mission.id)?.cargoKg,
      1_500,
    );
  });
});

describe('settleMission', () => {
  it('delivers cargo on-time and pays full freight', () => {
    const world = createSeedEconomyWorld({ seed: 'settle-ontime' });
    tickEconomyN(world, 24);
    const lot = firstBookableLot(world, 5_000);
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

  it('reverts a false auto-depart back to dispatched and clears airborne stamps', () => {
    const world = createSeedEconomyWorld({ seed: 'false-depart-revert' });
    tickEconomyN(world, 24);
    const lot = firstBookableLot(world);
    const mission = acceptMission(world, {
      lotId: lot.id,
      cargoKg: Math.min(5_000, lot.quantityKg - lot.reservedKg),
      aircraftClassId: 'narrow_freighter',
      missionId: 'msn_false_depart',
    });
    const departed = departMission(world, { ...mission, status: 'dispatched' });
    assert.equal(departed.mission.status, 'in_flight');
    assert.ok(departed.mission.airborneAtMs);

    const reverted = revertFalseDepartMission(world, departed.mission);
    assert.equal(reverted.status, 'dispatched');
    assert.equal(reverted.airborneAtMs, undefined);
    assert.equal(reverted.expectedRouteMs, undefined);
    assert.equal(reverted.departedAtTick, undefined);
  });

  it('stamps settledLandingFpm when provided', () => {
    const world = createSeedEconomyWorld({ seed: 'settle-fpm' });
    tickEconomyN(world, 24);
    const lot = firstBookableLot(world, 5_000);
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

  it('stamps runway touchdown projection when lat/lon provided', () => {
    const world = createSeedEconomyWorld({ seed: 'settle-rwy' });
    tickEconomyN(world, 24);
    const lot =
      listMarketLots(world).find(
        (v) =>
          v.lot.destIcao === 'SBGR' &&
          !v.npcClaim?.crewNeeded &&
          v.availableKg >= 5_000,
      )?.lot ?? firstBookableLot(world, 5_000);
    const mission = acceptMission(world, {
      lotId: lot.id,
      cargoKg: 5_000,
      aircraftClassId: 'narrow_freighter',
      missionId: 'msn_settle_rwy',
    });
    const departed = departMission(world, { ...mission, status: 'dispatched' });
    // Force dest to SBGR so catalog runways resolve.
    const inFlight = {
      ...departed.mission,
      destIcao: 'SBGR',
    };
    const result = settleMission(world, inFlight, {
      skipMinAirborneGate: true,
      touchdownLat: -23.429551,
      touchdownLon: -46.465875,
    });
    assert.ok(result.mission.settledRunwayTouch);
    assert.equal(result.mission.settledRunwayTouch!.icao, 'SBGR');
    assert.equal(result.settlement.runwayTouch?.icao, 'SBGR');
    assert.equal(typeof result.mission.settledRunwayTouch!.onPavement, 'boolean');
  });

  it('adds weather-ops bonus to settle payout', () => {
    const world = createSeedEconomyWorld({ seed: 'settle-wx' });
    const lot = pushTestLot(world, {
      id: 'lot_settle_wx',
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      commodityId: 'general',
      quantityKg: 8_000,
      reservedKg: 0,
      status: 'available',
      payUsd: 2_000,
    });
    const mission = acceptMission(world, {
      lotId: lot.id,
      cargoKg: 5_000,
      aircraftClassId: 'narrow_freighter',
      missionId: 'msn_settle_wx',
    });
    const departed = departMission(world, { ...mission, status: 'dispatched' });
    const contractPay = departed.mission.payUsd;
    const result = settleMission(world, departed.mission, {
      skipMinAirborneGate: true,
      weatherOps: {
        avgScore: 60,
        bonusFrac: 0.1,
        sampleCount: 20,
        approachSampleCount: 4,
        airborneMs: 600_000,
        avgHeadwindKt: 14,
        avgVisM: 2500,
        rainFraction: 0.4,
        minApproachVisM: 2000,
        eligible: true,
      },
    });
    const expectedBonus = Math.round(contractPay * 0.1);
    assert.equal(result.settlement.weatherBonusUsd, expectedBonus);
    assert.equal(result.settlement.payoutUsd, contractPay + expectedBonus);
    assert.equal(result.mission.settledWeatherBonusUsd, expectedBonus);
    assert.equal(result.mission.settledWeatherOps?.avgScore, 60);
  });

  it('applies late penalty after deadline', () => {
    const world = createSeedEconomyWorld({ seed: 'settle-late' });
    tickEconomyN(world, 24);
    const lot = firstBookableLot(world, 4_000);
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
    // 3 ticks = 0.75 h at 15-min batches; urgent rate 12%/h → 9% of pay.
    assert.equal(
      result.settlement.penaltyUsd,
      Math.min(1_000, Math.round(1_000 * (3 / 4) * 0.12)),
    );
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

  it('departs contract-pilot reposition without a real market lot', () => {
    const world = createSeedEconomyWorld({ seed: 'cp-repo-depart' });
    const mission = normalizeMissionIntent({
      id: 'msn_cp_repo_1',
      status: 'dispatched',
      originIcao: 'CYRJ',
      destIcao: 'CYOW',
      commodityId: 'general',
      cargoKg: 0,
      pax: 0,
      payUsd: 0,
      urgency: 'normal',
      reason: 'CP reposition',
      aircraftClassId: 'light_turboprop',
      rolesPackRelPath: 'profiles/ofp/c208.json',
      deadlineTick: world.tick + 100,
      shipmentLotId: 'deadhead_npcf-repo-test-1',
      lots: [
        {
          shipmentLotId: 'deadhead_npcf-repo-test-1',
          commodityId: 'general',
          cargoKg: 0,
          payUsd: 0,
          urgency: 'normal',
          reason: 'CP reposition',
          deadlineTick: world.tick + 100,
        },
      ],
      contractPilot: true,
      contractPilotReposition: true,
      acceptedAtTick: world.tick,
    });
    const departed = departMission(world, mission);
    assert.equal(departed.mission.status, 'in_flight');
    const settled = settleMission(world, departed.mission, {
      skipMinAirborneGate: true,
    });
    assert.equal(settled.mission.status, 'settled');
  });

  it('normalize clears phantom 0 kg lots on contract-pilot ferry', () => {
    const raw = {
      id: 'msn_cp_ferry',
      status: 'in_flight' as const,
      originIcao: 'KMEM',
      destIcao: 'KSTL',
      commodityId: 'general' as const,
      cargoKg: 0,
      pax: 0 as const,
      aircraftClassId: 'light_turboprop' as const,
      rolesPackRelPath: 'profiles/ofp/c208.json',
      deadlineTick: 100,
      payUsd: 558,
      urgency: 'urgent' as const,
      reason: 'Reposition · contract Midwest',
      shipmentLotId: 'deadhead_1',
      acceptedAtTick: 1,
      contractPilot: true,
      contractPilotReposition: true,
      contractPilotFeeUsd: 558,
      lots: [
        {
          shipmentLotId: 'deadhead_1',
          commodityId: 'general' as const,
          cargoKg: 0,
          payUsd: 558,
          urgency: 'urgent' as const,
          reason: 'leftover',
          deadlineTick: 100,
        },
      ],
    };
    const normalized = normalizeMissionIntent(raw);
    assert.equal(normalized.lots.length, 0);
    assert.equal(normalized.cargoKg, 0);
    assert.equal(normalized.payUsd, 558);
    assert.equal(normalized.urgency, 'normal');
    assert.equal(normalized.contractPilotReposition, true);
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
