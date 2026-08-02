import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acceptMission,
  applyPlayerDepartFuel,
  assignAircraftToMission,
  cancelMission,
  createSeedEconomyWorld,
  departMission,
  emptyMissionsStateV2,
  executeFerry,
  listParkedAt,
  normalizeMissionsState,
  purchasePlayerMissionOfpFuel,
  quotePlayerMissionOfpFuel,
  quoteFerry,
  releaseAircraftOnCancel,
  relocateAircraftOnSettle,
  selectStarterHub,
  STARTER_WALLET_USD,
  acquireCompanyAircraft,
  listAircraftMarket,
  purchaseAircraftListing,
  settleMission,
} from './index.js';

const pilot = { pilotName: 'Ada Skyline' };

describe('career fleet hangar', () => {
  it('selectStarterHub registers pilot and parks a C172 at the hub', () => {
    let state = emptyMissionsStateV2();
    assert.equal(state.hubSelected, false);
    assert.equal(state.pilotName, '');
    assert.equal(state.homeHubIcao, '');
    assert.equal(state.walletUsd, 0);
    state = selectStarterHub(state, 'sbgr', pilot);
    assert.equal(state.hubSelected, true);
    assert.equal(state.pilotName, 'Ada Skyline');
    assert.equal(state.homeHubIcao, 'SBGR');
    assert.equal(state.walletUsd, STARTER_WALLET_USD);
    assert.equal(state.fleet.length, 1);
    assert.equal(state.fleet[0]!.aircraftClassId, 'light_ga');
    assert.equal(state.fleet[0]!.airframeTypeId, 'asobo-c172sp-cargo');
    assert.ok(
      state.fleet[0]!.condition === 'good' ||
        state.fleet[0]!.condition === 'excellent',
    );
    assert.equal(state.fleet[0]!.locationIcao, 'SBGR');
    assert.equal(state.fleet[0]!.status, 'parked');
    assert.ok(state.fleet[0]!.fuelKg > 0);
  });

  it('selectStarterHub lets the pilot pick a light GA starter', () => {
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBPA', {
      ...pilot,
      airframeTypeId: 'asobo-cessna-c152',
    });
    assert.equal(state.fleet[0]!.aircraftClassId, 'light_ga');
    assert.equal(state.fleet[0]!.airframeTypeId, 'asobo-cessna-c152');
    assert.equal(state.fleet[0]!.label, 'Cessna C152');
    assert.ok(
      state.fleet[0]!.condition === 'good' ||
        state.fleet[0]!.condition === 'excellent',
    );
  });

  it('selectStarterHub rejects non-starter or unknown airframes', () => {
    assert.throws(
      () =>
        selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
          ...pilot,
          airframeTypeId: 'pmdg-738-bcf-family',
        }),
      /C152, C172, or Commander 114/i,
    );
    assert.throws(
      () =>
        selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
          ...pilot,
          airframeTypeId: 'c208-caravan-cargo',
        }),
      /C152, C172, or Commander 114/i,
    );
  });

  it('free acquire is disabled — Aircraft Market purchase parks light_ga', () => {
    const world = createSeedEconomyWorld({ seed: 'fleet-buy-ga' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
    assert.throws(() => acquireCompanyAircraft(state, 'light_ga'), /Aircraft Market/i);
    const listing = listAircraftMarket(state, world).find(
      (l) => l.kind !== 'lease' && l.aircraftClassId === 'light_ga',
    );
    assert.ok(listing);
    state.walletUsd = listing!.askingUsd;
    const { aircraft } = purchaseAircraftListing(state, world, listing!.id);
    assert.equal(aircraft.aircraftClassId, 'light_ga');
    assert.equal(aircraft.status, 'parked');
    assert.ok(state.fleet.some((a) => a.id === aircraft.id));
  });

  it('selectStarterHub rejects empty pilot name and second register', () => {
    assert.throws(
      () => selectStarterHub(emptyMissionsStateV2(), 'SBGR', { pilotName: ' ' }),
      /pilot name/i,
    );
    assert.throws(
      () => selectStarterHub(emptyMissionsStateV2(), 'SBGR', { pilotName: 'A' }),
      /pilot name/i,
    );
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
    assert.throws(
      () => selectStarterHub(state, 'SBKP', { pilotName: 'Other' }),
      /already selected/i,
    );
  });

  it('migrates v1 missions without inventing a hub', () => {
    const migrated = normalizeMissionsState({
      version: 1,
      walletUsd: 12_000,
      missions: [],
    });
    assert.equal(migrated.version, 2);
    assert.equal(migrated.walletUsd, 12_000);
    assert.equal(migrated.hubSelected, false);
    assert.deepEqual(migrated.fleet, []);
    assert.equal(migrated.pilotName, '');
    assert.equal(migrated.homeHubIcao, '');
  });

  it('backfills homeHubIcao from fleet when missing', () => {
    const migrated = normalizeMissionsState({
      version: 2,
      walletUsd: 1,
      missions: [],
      hubSelected: true,
      fleet: [
        {
          id: 'acf_caravan_1',
          aircraftClassId: 'light_turboprop',
          label: 'Company Caravan',
          locationIcao: 'SBCT',
          fuelKg: 400,
          fuelCapacityKg: 1010,
          status: 'parked',
        },
      ],
    });
    assert.equal(migrated.homeHubIcao, 'SBCT');
    assert.equal(migrated.hubSelected, true);
  });

  it('rejects staging assignment when aircraft is elsewhere', () => {
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
    assert.throws(
      () => assignAircraftToMission(state, state.fleet[0]!.id, 'msn_x', 'SBGL'),
      /ferry first/i,
    );
  });

  it('ferry relocates instantly and debits wallet + fuel', () => {
    const world = createSeedEconomyWorld({ seed: 'ferry-test' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
    state.walletUsd = 50_000;
    const beforeFuel = state.fleet[0]!.fuelKg;
    const quote = quoteFerry(world, state, {
      aircraftId: state.fleet[0]!.id,
      destIcao: 'SBKP',
    });
    assert.ok(quote.distanceNm > 0);
    assert.ok(quote.totalCostUsd > 0);
    const result = executeFerry(world, state, {
      aircraftId: state.fleet[0]!.id,
      destIcao: 'SBKP',
    });
    assert.equal(result.aircraft.locationIcao, 'SBKP');
    assert.equal(listParkedAt(state, 'SBKP').length, 1);
    assert.equal(listParkedAt(state, 'SBGR').length, 0);
    assert.ok(state.walletUsd < 50_000);
    assert.ok(result.aircraft.fuelKg < beforeFuel + quote.fuelUpliftKg);
  });

  it('settle relocates aircraft to destination; cancel keeps origin', () => {
    const world = createSeedEconomyWorld({ seed: 'fleet-settle' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
    state.walletUsd = 100_000;

    // Seed a tiny same-OD lot at SBGR.
    world.lots.push({
      id: 'lot_fleet_1',
      commodityId: 'general',
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      quantityKg: 400,
      reservedKg: 0,
      createdAtTick: world.tick,
      expiresAtTick: world.tick + 48,
      payUsd: 900,
      urgency: 'normal',
      reason: 'test',
      status: 'available',
    });

    const mission = acceptMission(world, {
      lotId: 'lot_fleet_1',
      cargoKg: 400,
      aircraftClassId: 'light_turboprop',
      missionId: 'msn_fleet_1',
    });
    mission.aircraftId = state.fleet[0]!.id;
    assignAircraftToMission(state, state.fleet[0]!.id, mission.id, 'SBGR');

    const cancelled = cancelMission(world, { ...mission, status: 'accepted' }, {
      fleet: state,
    });
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(state.fleet[0]!.status, 'parked');
    assert.equal(state.fleet[0]!.locationIcao, 'SBGR');

    // Re-accept after cancel released reservation.
    world.lots[0]!.status = 'available';
    world.lots[0]!.reservedKg = 0;
    world.lots[0]!.quantityKg = 400;
    const mission2 = acceptMission(world, {
      lotId: 'lot_fleet_1',
      cargoKg: 400,
      aircraftClassId: 'light_turboprop',
      missionId: 'msn_fleet_2',
    });
    mission2.aircraftId = state.fleet[0]!.id;
    assignAircraftToMission(state, state.fleet[0]!.id, mission2.id, 'SBGR');

    const departed = departMission(
      world,
      { ...mission2, status: 'dispatched' },
      { fleet: state },
    );
    assert.ok(departed.mission.tripFuelBurnKg! > 0);
    const settled = settleMission(world, departed.mission, {
      fleet: state,
      residualFuelKg: 137.6,
      skipMinAirborneGate: true,
    });
    assert.equal(settled.mission.status, 'settled');
    assert.equal(settled.mission.settledFuelKg, 138);
    assert.equal(state.fleet[0]!.locationIcao, 'SBKP');
    assert.equal(state.fleet[0]!.status, 'parked');
    assert.equal(state.fleet[0]!.fuelKg, 138);
  });

  it('releaseAircraftOnCancel is idempotent for unknown aircraft', () => {
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBCF', pilot);
    const released = releaseAircraftOnCancel(state, {
      id: 'msn_none',
      originIcao: 'SBCF',
      destIcao: 'SBGR',
    } as never);
    assert.equal(released, undefined);
    relocateAircraftOnSettle(state, {
      id: 'msn_none',
      originIcao: 'SBCF',
      destIcao: 'SBGR',
      tripFuelBurnKg: 100,
    } as never);
    assert.equal(state.fleet[0]!.locationIcao, 'SBCF');
  });

  it('quotes and purchases only the OFP block-fuel shortfall once', () => {
    const world = createSeedEconomyWorld({ seed: 'ofp-fuel-purchase' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
    const aircraft = state.fleet[0]!;
    aircraft.fuelKg = 100;
    const mission = {
      id: 'msn_ofp_fuel',
      aircraftId: aircraft.id,
      aircraftClassId: aircraft.aircraftClassId,
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      status: 'dispatched',
    } as never;

    const quote = quotePlayerMissionOfpFuel(world, state, mission, {
      ofpId: 'ofp-1',
      requiredBlockFuelKg: 300,
    });
    assert.equal(quote.currentFuelKg, 100);
    assert.equal(quote.shortfallKg, 200);
    assert.ok(quote.uplift.costUsd > 0);

    const purchase = purchasePlayerMissionOfpFuel(world, state, mission, {
      ofpId: 'ofp-1',
      requiredBlockFuelKg: 300,
    });
    assert.equal(aircraft.fuelKg, 300);
    assert.equal(purchase.mission.fuelAuthorizedOfpId, 'ofp-1');
    assert.equal(purchase.mission.fuelUplift?.requestedKg, 200);
    assert.ok(purchase.mission.tripFuelBurnKg! > 0);
    assert.ok(purchase.fuelDebitUsd > 0);

    const departFuel = applyPlayerDepartFuel(
      world,
      state,
      purchase.mission,
    );
    assert.equal(departFuel.fuelDebitUsd, 0);
  });
});
