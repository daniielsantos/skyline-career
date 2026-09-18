/**
 * Base Dispatcher Charter Search — 1–2 leg tours from open charter offers.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hireBaseDispatcherCandidate,
  refreshBaseDispatcherHirePool,
} from './career-base-dispatcher.js';
import {
  bindCharterTourLegMission,
  charterActiveTourView,
  dropCharterActiveTour,
  listBaseDispatchCharterTours,
  prepareCharterActiveTour,
  syncCharterActiveTour,
} from './career-base-dispatch-charter-tour.js';
import { buyFboTier1 } from './career-fbo.js';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import type {
  CareerEconomyWorld,
  CharterOffer,
  PlayerAircraft,
} from './types/career-economy.js';

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

function primeCharterOffer(
  world: CareerEconomyWorld,
  overrides: Partial<CharterOffer> = {},
): CharterOffer {
  const offer: CharterOffer = {
    id: `charter_test_${(world.charterOffers ?? []).length}`,
    demandId: `demand_${(world.charterOffers ?? []).length}`,
    originIcao: 'SBGR',
    destIcao: 'SBSP',
    groupSize: 2,
    baggageKg: 40,
    distanceNm: 50,
    tier: 'standard',
    urgency: 'normal',
    international: false,
    payUsd: 12_000,
    createdAtTick: world.tick,
    expiresAtTick: world.tick + 200,
    status: 'available',
    ...overrides,
  };
  if (!world.charterOffers) world.charterOffers = [];
  world.charterOffers.push(offer);
  return offer;
}

function parkPassengerJet(
  state: ReturnType<typeof emptyMissionsStateV2>,
  icao: string,
): PlayerAircraft {
  const aircraft: PlayerAircraft = {
    id: 'acf_cj4_charter',
    aircraftClassId: 'light_jet',
    airframeTypeId: 'workingtitle-cessna-citation-cj4',
    airframeConfigurationId: 'passenger',
    rolesPackRelPath: 'profiles/ofp/workingtitle-cessna-citation-cj4.json',
    label: 'CJ4 Charter',
    registration: 'PR-CJ4',
    locationIcao: icao,
    fuelKg: 1_500,
    fuelCapacityKg: 2_200,
    status: 'parked',
    ownership: 'owned',
  };
  state.fleet = [aircraft];
  return aircraft;
}

function freshCompany(hubIcao: string, pilotName: string) {
  const state = selectStarterHub(emptyMissionsStateV2(), hubIcao, {
    pilotName,
  });
  parkPassengerJet(state, hubIcao);
  return state;
}

describe('base dispatch charter tours', () => {
  it('requires a hired Dispatcher', () => {
    const world = createSeedEconomyWorld({ seed: 'charter-tour-gate' });
    const state = freshCompany('SBGR', 'CharterGate');
    state.walletUsd = 100_000;
    buyFboTier1(state, world, 'SBGR');
    primeCharterOffer(world, {
      originIcao: 'SBGR',
      destIcao: 'SBSP',
      distanceNm: 120,
    });
    assert.throws(
      () =>
        listBaseDispatchCharterTours(state, world, {
          hubIcao: 'SBGR',
          legs: 1,
        }),
      /hired Base Dispatcher/i,
    );
  });

  it('lists 1-leg charter tours for parked passenger aircraft', () => {
    const world = createSeedEconomyWorld({ seed: 'charter-tour-1leg' });
    const state = freshCompany('SBGR', 'CharterOne');
    hireDispatcherAt(state, world, 'SBGR');
    primeCharterOffer(world, {
      id: 'c1',
      originIcao: 'SBGR',
      destIcao: 'SBSP',
      groupSize: 2,
      distanceNm: 120,
      payUsd: 18_000,
    });
    const tours = listBaseDispatchCharterTours(state, world, {
      hubIcao: 'SBGR',
      legs: 1,
      preferLeaveBase: true,
    });
    assert.ok(tours.length >= 1);
    assert.equal(tours[0]!.legCount, 1);
    assert.equal(tours[0]!.legs[0]!.offerId, 'c1');
  });

  it('chains 2 legs and prepare/bind Active Tour', () => {
    const world = createSeedEconomyWorld({ seed: 'charter-tour-2leg' });
    const state = freshCompany('SBGR', 'CharterTwo');
    hireDispatcherAt(state, world, 'SBGR');
    primeCharterOffer(world, {
      id: 'c_l1',
      originIcao: 'SBGR',
      destIcao: 'SBSP',
      groupSize: 2,
      distanceNm: 120,
      payUsd: 18_000,
    });
    primeCharterOffer(world, {
      id: 'c_l2',
      originIcao: 'SBSP',
      destIcao: 'SBKP',
      groupSize: 2,
      distanceNm: 100,
      payUsd: 16_000,
    });
    const tours = listBaseDispatchCharterTours(state, world, {
      hubIcao: 'SBGR',
      legs: 2,
      maxFerryNm: 200,
      returnMode: 'none',
    });
    const chain = tours.find(
      (t) =>
        t.legs.length === 2 &&
        t.legs[0]!.offerId === 'c_l1' &&
        t.legs[1]!.offerId === 'c_l2',
    );
    assert.ok(chain, 'expected SBGR→SBSP→SBKP charter chain');

    const prepared = prepareCharterActiveTour(state, world, {
      aircraftId: chain.aircraftId,
      hubIcao: 'SBGR',
      tourId: chain.id,
      routeLabel: chain.routeLabel,
      legs: chain.legs,
    });
    assert.equal(prepared.status, 'active');
    assert.equal(prepared.legs.length, 2);

    bindCharterTourLegMission(state, {
      legIndex: 1,
      missionId: 'msn_charter_l1',
      offerId: 'c_l1',
    });
    state.missions.push({
      id: 'msn_charter_l1',
      type: 'charter',
      status: 'settled',
      originIcao: 'SBGR',
      destIcao: 'SBSP',
      acceptedAtTick: world.tick,
      deadlineTick: world.tick + 40,
      cargoKg: 0,
      payUsd: 18_000,
      aircraftId: chain.aircraftId,
      charterOfferId: 'c_l1',
      passengerCount: 2,
      baggageKg: 40,
      aircraftClassId: 'light_jet',
      commodityId: 'general',
      urgency: 'normal',
      reason: 'test',
    } as never);

    const acf = state.fleet![0]!;
    acf.locationIcao = 'SBSP';
    acf.status = 'parked';

    const view = charterActiveTourView(state, world);
    assert.ok(view);
    assert.equal(view!.legs[0]!.status, 'done');
    assert.equal(view!.nextLegIndex, 2);
    assert.equal(view!.canAcceptNextLeg, true);

    dropCharterActiveTour(state);
    assert.equal(syncCharterActiveTour(state, world), null);
  });

  it('empty origin searches any departure (no Base lock)', () => {
    const world = createSeedEconomyWorld({ seed: 'charter-tour-any-origin' });
    const state = freshCompany('SBGR', 'CharterAny');
    hireDispatcherAt(state, world, 'SBGR');
    const acf = state.fleet![0]!;
    acf.locationIcao = 'SBSP';
    primeCharterOffer(world, {
      id: 'c_away',
      originIcao: 'SBSP',
      destIcao: 'SBKP',
      groupSize: 2,
      distanceNm: 100,
      payUsd: 16_000,
    });
    const tours = listBaseDispatchCharterTours(state, world, {
      hubIcao: 'SBGR',
      legs: 1,
      preferLeaveBase: false,
    });
    assert.ok(tours.some((t) => t.legs[0]?.offerId === 'c_away'));
  });
});
