/**
 * Base Dispatcher tour generator — chain Market lots (multi-option table).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hireBaseDispatcherCandidate,
  refreshBaseDispatcherHirePool,
} from './career-base-dispatcher.js';
import {
  acceptActiveTourLeg,
  activeTourView,
  attachActiveTourFromMission,
  bindActiveTourLegToMission,
  confirmBaseDispatchTour,
  dropActiveTour,
  dropPreparedActiveTourIfUnbound,
  listBaseDispatchTours,
  prepareActiveTour,
} from './career-base-dispatch-tour.js';
import { buyFboTier1 } from './career-fbo.js';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import type { CareerEconomyWorld, ShipmentLot } from './types/career-economy.js';

function primeLot(
  world: CareerEconomyWorld,
  overrides: Partial<ShipmentLot> = {},
): ShipmentLot {
  const lot: ShipmentLot = {
    id: `lot_tour_${world.lots.length}`,
    commodityId: 'general',
    originIcao: 'SBGR',
    destIcao: 'SBGL',
    quantityKg: 2_000,
    reservedKg: 0,
    createdAtTick: world.tick,
    expiresAtTick: world.tick + 200,
    payUsd: 8_000,
    basePayUsd: 8_000,
    urgency: 'normal',
    reason: 'test trunk',
    status: 'available',
    ...overrides,
  };
  world.lots.push(lot);
  return lot;
}

function hireDispatcherAt(
  state: ReturnType<typeof emptyMissionsStateV2>,
  world: CareerEconomyWorld,
  icao: string,
) {
  state.walletUsd = 100_000;
  const { fbo } = buyFboTier1(state, world, icao);
  refreshBaseDispatcherHirePool(state, world, { hubIcao: icao, force: true });
  const pool = state.playerFbos?.dispatcherHirePoolByHub?.[icao] ?? [];
  assert.ok(pool.length >= 1);
  hireBaseDispatcherCandidate(state, world, {
    fboId: fbo.id,
    candidateId: pool[0]!.id,
  });
  return fbo;
}

describe('base dispatch tours', () => {
  it('requires a hired Dispatcher', () => {
    const world = createSeedEconomyWorld({ seed: 'dispatch-tour-gate' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'TourGate',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 100_000;
    buyFboTier1(state, world, 'SBGR');
    assert.throws(
      () =>
        listBaseDispatchTours(state, world, {
          hubIcao: 'SBGR',
          legs: 2,
        }),
      /hired Base Dispatcher/i,
    );
  });

  it('chains two regional lots into multiple tour options', () => {
    const world = createSeedEconomyWorld({ seed: 'dispatch-tour-chain' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'TourChain',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    hireDispatcherAt(state, world, 'SBGR');
    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';

    // SBGR → SBGL → SBSP (or similar BR-S hubs).
    primeLot(world, {
      id: 'tour_leg_a1',
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      quantityKg: 400,
      payUsd: 5_000,
      reason: 'tour A1',
    });
    primeLot(world, {
      id: 'tour_leg_a2',
      originIcao: 'SBGL',
      destIcao: 'SBSP',
      quantityKg: 350,
      payUsd: 4_200,
      reason: 'tour A2',
    });
    primeLot(world, {
      id: 'tour_leg_b1',
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      quantityKg: 380,
      payUsd: 4_800,
      reason: 'tour B1',
    });
    primeLot(world, {
      id: 'tour_leg_b2',
      originIcao: 'SBKP',
      destIcao: 'SBSP',
      quantityKg: 360,
      payUsd: 4_100,
      reason: 'tour B2',
    });

    const tours = listBaseDispatchTours(state, world, {
      hubIcao: 'SBGR',
      aircraftId: aircraft.id,
      originIcao: 'SBGR',
      legs: 2,
      minNm: 40,
      maxNm: null,
      returnMode: 'none',
    });
    assert.ok(tours.length >= 1);
    assert.ok(tours.length <= 8);
    assert.ok(tours.every((t) => t.legCount === 2));
    assert.ok(tours.every((t) => t.legs.length === 2));
    assert.ok(
      tours.some(
        (t) =>
          t.legs[0]!.lotId === 'tour_leg_a1' &&
          t.legs[1]!.lotId === 'tour_leg_a2',
      ),
    );
  });

  it('confirm tour accepts only the first leg', () => {
    const world = createSeedEconomyWorld({ seed: 'dispatch-tour-accept' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'TourAccept',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    hireDispatcherAt(state, world, 'SBGR');
    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';

    primeLot(world, {
      id: 'tour_acc_1',
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      quantityKg: 400,
      payUsd: 5_000,
      reason: 'accept L1',
    });
    primeLot(world, {
      id: 'tour_acc_2',
      originIcao: 'SBGL',
      destIcao: 'SBSP',
      quantityKg: 350,
      payUsd: 4_200,
      reason: 'accept L2',
    });

    const tours = listBaseDispatchTours(state, world, {
      hubIcao: 'SBGR',
      aircraftId: aircraft.id,
      originIcao: 'SBGR',
      legs: 2,
      minNm: 40,
    });
    assert.ok(tours.length >= 1);
    const tour = tours[0]!;
    const result = confirmBaseDispatchTour(state, world, {
      aircraftId: aircraft.id,
      firstLotId: tour.legs[0]!.lotId,
      hubIcao: 'SBGR',
    });
    assert.equal(result.tourLegIndex, 1);
    assert.equal(result.mission.originIcao, tour.legs[0]!.originIcao);
    assert.equal(result.mission.destIcao, tour.legs[0]!.destIcao);
    // Second lot still available on the board.
    const second = world.lots.find((l) => l.id === tour.legs[1]!.lotId);
    assert.ok(second);
    assert.equal(second!.status, 'available');
  });

  it('uses softer tour minNm so light_jet can chain regional lots', () => {
    const world = createSeedEconomyWorld({ seed: 'dispatch-tour-jet-min' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBSP', {
      pilotName: 'TourJetMin',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    hireDispatcherAt(state, world, 'SBSP');
    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBSP';
    aircraft.aircraftClassId = 'light_jet';
    aircraft.airframeTypeId = 'skyward-cessna-c680';
    aircraft.label = 'Cessna Citation Sovereign C680';

    // Below Scout light_jet floor (400), above tour floor (120).
    primeLot(world, {
      id: 'tour_jet_1',
      originIcao: 'SBSP',
      destIcao: 'SBCT',
      quantityKg: 500,
      payUsd: 12_000,
      reason: 'tour jet L1',
    });
    primeLot(world, {
      id: 'tour_jet_2',
      originIcao: 'SBCT',
      destIcao: 'SBFL',
      quantityKg: 480,
      payUsd: 11_000,
      reason: 'tour jet L2',
    });

    const tours = listBaseDispatchTours(state, world, {
      hubIcao: 'SBSP',
      aircraftId: aircraft.id,
      originIcao: 'SBSP',
      legs: 2,
      returnMode: 'none',
    });
    assert.ok(
      tours.some(
        (t) =>
          t.legs[0]!.lotId === 'tour_jet_1' &&
          t.legs[1]!.lotId === 'tour_jet_2',
      ),
      'expected SBSP→SBCT→SBFL tour under soft tour minNm',
    );
  });

  it('routeLabel includes ferry hop between lots', () => {
    const world = createSeedEconomyWorld({ seed: 'dispatch-tour-ferry-label' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBKP', {
      pilotName: 'TourFerryLbl',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    hireDispatcherAt(state, world, 'SBKP');
    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBKP';

    primeLot(world, {
      id: 'flbl_1',
      originIcao: 'SBKP',
      destIcao: 'SBCT',
      quantityKg: 400,
      payUsd: 5_000,
      reason: 'L1',
    });
    // Next lot starts at SBFL — not SBCT — so label must show ferry stop.
    primeLot(world, {
      id: 'flbl_2',
      originIcao: 'SBFL',
      destIcao: 'SBCT',
      quantityKg: 380,
      payUsd: 4_500,
      reason: 'L2',
    });

    const tours = listBaseDispatchTours(state, world, {
      hubIcao: 'SBKP',
      aircraftId: aircraft.id,
      originIcao: 'SBKP',
      legs: 2,
      minNm: 40,
      returnMode: 'none',
    });
    const hit = tours.find(
      (t) =>
        t.legs[0]!.lotId === 'flbl_1' && t.legs[1]!.lotId === 'flbl_2',
    );
    assert.ok(hit, 'expected SBKP→SBCT ferry→SBFL→SBCT tour');
    assert.equal(hit!.routeLabel, 'SBKP→SBCT→SBFL→SBCT');
  });

  it('prefer origin keeps tours that end at origin when any exist', () => {
    const world = createSeedEconomyWorld({ seed: 'dispatch-tour-return' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBSP', {
      pilotName: 'TourReturn',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    hireDispatcherAt(state, world, 'SBSP');
    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBSP';

    primeLot(world, {
      id: 'ret_out',
      originIcao: 'SBSP',
      destIcao: 'SBCT',
      quantityKg: 400,
      payUsd: 5_000,
      reason: 'outbound',
    });
    primeLot(world, {
      id: 'ret_home',
      originIcao: 'SBCT',
      destIcao: 'SBSP',
      quantityKg: 380,
      payUsd: 4_500,
      reason: 'homebound',
    });
    primeLot(world, {
      id: 'ret_away',
      originIcao: 'SBCT',
      destIcao: 'SBFL',
      quantityKg: 400,
      payUsd: 20_000,
      reason: 'away',
    });

    const tours = listBaseDispatchTours(state, world, {
      hubIcao: 'SBSP',
      aircraftId: aircraft.id,
      originIcao: 'SBSP',
      legs: 2,
      minNm: 40,
      returnMode: 'origin',
    });
    assert.ok(tours.length >= 1);
    assert.ok(
      tours.every((t) => t.legs[t.legs.length - 1]!.destIcao === 'SBSP'),
      'expected only tours ending at SBSP',
    );
    assert.ok(
      tours.some(
        (t) =>
          t.legs[0]!.lotId === 'ret_out' && t.legs[1]!.lotId === 'ret_home',
      ),
    );
  });

  it('persists Active Tour on L1 and accepts L2 after settle + reposition', () => {
    const world = createSeedEconomyWorld({ seed: 'dispatch-tour-active' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'TourActive',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    hireDispatcherAt(state, world, 'SBGR');
    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';

    primeLot(world, {
      id: 'act_l1',
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      quantityKg: 400,
      payUsd: 5_000,
      reason: 'active L1',
    });
    primeLot(world, {
      id: 'act_l2',
      originIcao: 'SBGL',
      destIcao: 'SBSP',
      quantityKg: 350,
      payUsd: 4_200,
      reason: 'active L2',
    });

    const tours = listBaseDispatchTours(state, world, {
      hubIcao: 'SBGR',
      aircraftId: aircraft.id,
      originIcao: 'SBGR',
      legs: 2,
      minNm: 40,
    });
    const tour = tours.find(
      (t) =>
        t.legs[0]!.lotId === 'act_l1' && t.legs[1]!.lotId === 'act_l2',
    );
    assert.ok(tour);

    const confirmed = confirmBaseDispatchTour(state, world, {
      aircraftId: aircraft.id,
      firstLotId: tour!.legs[0]!.lotId,
      hubIcao: 'SBGR',
      tourId: tour!.id,
      routeLabel: tour!.routeLabel,
      tourLegs: tour!.legs,
    });
    assert.equal(confirmed.tourLegIndex, 1);
    assert.ok(confirmed.activeTour);
    assert.equal(confirmed.activeTour!.legs.length, 2);
    assert.equal(confirmed.activeTour!.legs[0]!.status, 'active');
    assert.equal(confirmed.activeTour!.legs[1]!.status, 'planned');

    // Settle L1 + park at L2 origin.
    const m1 = state.missions.find((m) => m.id === confirmed.mission.id);
    assert.ok(m1);
    m1!.status = 'settled';
    aircraft.status = 'parked';
    aircraft.assignedMissionId = undefined;
    aircraft.locationIcao = 'SBGL';

    const view = activeTourView(state, world);
    assert.ok(view);
    assert.equal(view!.legs[0]!.status, 'done');
    assert.equal(view!.nextLegIndex, 2);
    assert.equal(view!.canAcceptNextLeg, true);

    const l2 = acceptActiveTourLeg(state, world, { legIndex: 2 });
    assert.equal(l2.tourLegIndex, 2);
    assert.equal(l2.mission.originIcao, 'SBGL');
    assert.equal(l2.mission.destIcao, 'SBSP');
    assert.equal(l2.rebound, false);

    dropActiveTour(state);
    assert.equal(activeTourView(state, world), null);
  });

  it('prepareActiveTour persists itinerary; sync binds in-flight L1 without attach', () => {
    const world = createSeedEconomyWorld({ seed: 'dispatch-tour-prepare' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'TourPrepare',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    hireDispatcherAt(state, world, 'SBGR');
    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';

    primeLot(world, {
      id: 'prep_l1',
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      quantityKg: 400,
      payUsd: 5_000,
      reason: 'prepare L1',
    });
    primeLot(world, {
      id: 'prep_l2',
      originIcao: 'SBGL',
      destIcao: 'SBSP',
      quantityKg: 350,
      payUsd: 4_200,
      reason: 'prepare L2',
    });

    const prepared = prepareActiveTour(state, world, {
      aircraftId: aircraft.id,
      hubIcao: 'SBGR',
      legs: [
        {
          lotId: 'prep_l1',
          originIcao: 'SBGR',
          destIcao: 'SBGL',
          commodityId: 'general',
          liftKg: 200,
          distanceNm: 50,
          ferryNm: 0,
          payUsd: 5_000,
          fuelCostUsd: 100,
          netUsd: 4_900,
          lastMile: false,
        },
        {
          lotId: 'prep_l2',
          originIcao: 'SBGL',
          destIcao: 'SBSP',
          commodityId: 'general',
          liftKg: 180,
          distanceNm: 40,
          ferryNm: 0,
          payUsd: 4_200,
          fuelCostUsd: 80,
          netUsd: 4_120,
          lastMile: false,
        },
      ],
      routeLabel: 'SBGR→SBGL→SBSP',
    });
    assert.equal(prepared.status, 'active');
    assert.equal(prepared.legs[0]!.status, 'planned');
    assert.ok(activeTourView(state, world));

    // Manifest-style accept without attach — lot reserved, mission in flight.
    const confirmed = confirmBaseDispatchTour(state, world, {
      aircraftId: aircraft.id,
      firstLotId: 'prep_l1',
      hubIcao: 'SBGR',
    });
    confirmed.mission.status = 'in_flight';
    const lot = world.lots.find((l) => l.id === 'prep_l1')!;
    lot.status = 'reserved';
    lot.reservedKg = lot.quantityKg;

    const view = activeTourView(state, world);
    assert.ok(view);
    assert.equal(view!.legs[0]!.status, 'active');
    assert.equal(view!.legs[0]!.missionId, confirmed.mission.id);

    // Discard Manifest before bind: unbound prepare clears.
    dropActiveTour(state);
    state.missions = [];
    prepareActiveTour(state, world, {
      aircraftId: aircraft.id,
      hubIcao: 'SBGR',
      legs: prepared.legs.map((l) => ({
        lotId: l.lotId,
        originIcao: l.originIcao,
        destIcao: l.destIcao,
        commodityId: l.commodityId,
        liftKg: l.liftKg,
        distanceNm: l.distanceNm,
        ferryNm: l.ferryNm,
        payUsd: l.payUsd,
        fuelCostUsd: l.fuelCostUsd,
        netUsd: l.netUsd,
        lastMile: l.lastMile,
      })),
    });
    assert.equal(dropPreparedActiveTourIfUnbound(state), true);
    assert.equal(activeTourView(state, world), null);
  });

  it('attachActiveTourFromMission binds after Manifest-style accept', () => {
    const world = createSeedEconomyWorld({ seed: 'dispatch-tour-attach' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'TourAttach',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    hireDispatcherAt(state, world, 'SBGR');
    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';

    primeLot(world, {
      id: 'att_l1',
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      quantityKg: 400,
      payUsd: 5_000,
      reason: 'attach L1',
    });
    primeLot(world, {
      id: 'att_l2',
      originIcao: 'SBGL',
      destIcao: 'SBSP',
      quantityKg: 350,
      payUsd: 4_200,
      reason: 'attach L2',
    });

    const tours = listBaseDispatchTours(state, world, {
      hubIcao: 'SBGR',
      aircraftId: aircraft.id,
      originIcao: 'SBGR',
      legs: 2,
      minNm: 40,
    });
    const tour = tours.find(
      (t) =>
        t.legs[0]!.lotId === 'att_l1' && t.legs[1]!.lotId === 'att_l2',
    );
    assert.ok(tour);

    // Manifest Accept & Dispatch path: accept L1 without tourLegs, then attach.
    const confirmed = confirmBaseDispatchTour(state, world, {
      aircraftId: aircraft.id,
      firstLotId: tour!.legs[0]!.lotId,
      hubIcao: 'SBGR',
    });
    dropActiveTour(state);

    const attached = attachActiveTourFromMission(state, world, {
      missionId: confirmed.mission.id,
      aircraftId: aircraft.id,
      hubIcao: 'SBGR',
      tourLegs: tour!.legs,
      routeLabel: tour!.routeLabel,
    });
    assert.equal(attached.legs.length, 2);
    assert.equal(attached.legs[0]!.status, 'active');
    assert.equal(attached.legs[1]!.status, 'planned');

    const m1 = state.missions.find((m) => m.id === confirmed.mission.id)!;
    m1.status = 'settled';
    aircraft.status = 'parked';
    aircraft.assignedMissionId = undefined;
    aircraft.locationIcao = 'SBGL';

    const l2 = confirmBaseDispatchTour(state, world, {
      aircraftId: aircraft.id,
      firstLotId: 'att_l2',
      hubIcao: 'SBGR',
    });
    const bound = bindActiveTourLegToMission(state, world, {
      legIndex: 2,
      missionId: l2.mission.id,
    });
    assert.equal(bound.legs[1]!.status, 'active');
    assert.equal(bound.legs[1]!.missionId, l2.mission.id);
  });

  it('excludes locked Cargo Ops commodities from tour Search', () => {
    const world = createSeedEconomyWorld({ seed: 'dispatch-tour-cargo-ops' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'TourCargoOps',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    hireDispatcherAt(state, world, 'SBGR');
    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';

    primeLot(world, {
      id: 'ops_dry_1',
      commodityId: 'general',
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      quantityKg: 400,
      payUsd: 5_000,
      reason: 'dry L1',
    });
    primeLot(world, {
      id: 'ops_dry_2',
      commodityId: 'supplies',
      originIcao: 'SBGL',
      destIcao: 'SBSP',
      quantityKg: 350,
      payUsd: 4_200,
      reason: 'dry L2',
    });
    primeLot(world, {
      id: 'ops_peri_1',
      commodityId: 'perishables',
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      quantityKg: 400,
      payUsd: 50_000,
      reason: 'locked peri L1',
    });
    primeLot(world, {
      id: 'ops_peri_2',
      commodityId: 'perishables',
      originIcao: 'SBGL',
      destIcao: 'SBSP',
      quantityKg: 350,
      payUsd: 45_000,
      reason: 'locked peri L2',
    });

    const tours = listBaseDispatchTours(state, world, {
      hubIcao: 'SBGR',
      aircraftId: aircraft.id,
      originIcao: 'SBGR',
      legs: 2,
      minNm: 40,
    });
    assert.ok(tours.length >= 1);
    assert.ok(
      tours.every((t) =>
        t.legs.every(
          (l) => l.commodityId === 'general' || l.commodityId === 'supplies',
        ),
      ),
      'expected only unlocked Dry commodities',
    );
    assert.ok(
      !tours.some((t) =>
        t.legs.some((l) => l.lotId.startsWith('ops_peri')),
      ),
    );
  });

  it('rebinds L2 when the planned lot disappears', () => {
    const world = createSeedEconomyWorld({ seed: 'dispatch-tour-rebind' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'TourRebind',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    hireDispatcherAt(state, world, 'SBGR');
    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';

    primeLot(world, {
      id: 'rb_l1',
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      quantityKg: 400,
      payUsd: 5_000,
      reason: 'rebind L1',
    });
    primeLot(world, {
      id: 'rb_l2',
      originIcao: 'SBGL',
      destIcao: 'SBSP',
      quantityKg: 350,
      payUsd: 4_200,
      reason: 'rebind L2 original',
    });

    const tours = listBaseDispatchTours(state, world, {
      hubIcao: 'SBGR',
      aircraftId: aircraft.id,
      originIcao: 'SBGR',
      legs: 2,
      minNm: 40,
    });
    const tour = tours.find(
      (t) =>
        t.legs[0]!.lotId === 'rb_l1' && t.legs[1]!.lotId === 'rb_l2',
    );
    assert.ok(tour);

    const confirmed = confirmBaseDispatchTour(state, world, {
      aircraftId: aircraft.id,
      firstLotId: tour!.legs[0]!.lotId,
      hubIcao: 'SBGR',
      tourLegs: tour!.legs,
      routeLabel: tour!.routeLabel,
    });
    const m1 = state.missions.find((m) => m.id === confirmed.mission.id);
    assert.ok(m1);
    m1!.status = 'settled';
    aircraft.status = 'parked';
    aircraft.assignedMissionId = undefined;
    aircraft.locationIcao = 'SBGL';

    const gone = world.lots.find((l) => l.id === 'rb_l2')!;
    gone.status = 'expired';
    primeLot(world, {
      id: 'rb_l2_alt',
      originIcao: 'SBGL',
      destIcao: 'SBSP',
      quantityKg: 360,
      payUsd: 4_100,
      reason: 'rebind L2 alt',
    });

    const view = activeTourView(state, world);
    assert.ok(view?.canAcceptNextLeg);
    assert.equal(view!.nextLegNeedsRebind, true);

    const l2 = acceptActiveTourLeg(state, world, { legIndex: 2 });
    assert.equal(l2.rebound, true);
    assert.equal(l2.mission.originIcao, 'SBGL');
    assert.equal(l2.mission.destIcao, 'SBSP');
  });
});
