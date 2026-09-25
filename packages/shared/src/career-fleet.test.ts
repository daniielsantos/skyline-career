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
  resolveSettledAircraftFuelKg,
  selectStarterHub,
  STARTER_WALLET_USD,
  isContractPilotCareer,
  acquireCompanyAircraft,
  listAircraftMarket,
  purchaseAircraftListing,
  settleMission,
  reserveAircraftForMember,
  releaseAircraftReservation,
  isAircraftReservationActive,
  VA_AIRCRAFT_RESERVE_TTL_MS,
} from './index.js';

const pilot = {
  pilotName: 'Ada Skyline',
  airframeTypeId: 'asobo-c172sp-cargo',
};

describe('career fleet hangar', () => {
  it('selectStarterHub registers a contract pilot with empty hangar', () => {
    let state = emptyMissionsStateV2();
    assert.equal(state.hubSelected, false);
    assert.equal(state.pilotName, '');
    assert.equal(state.homeHubIcao, '');
    assert.equal(state.walletUsd, 0);
    state = selectStarterHub(state, 'sbgr', { pilotName: 'Ada Skyline' });
    assert.equal(state.hubSelected, true);
    assert.equal(state.pilotName, 'Ada Skyline');
    assert.equal(state.homeHubIcao, 'SBGR');
    assert.equal(state.pilotIcao, 'SBGR');
    assert.equal(state.walletUsd, STARTER_WALLET_USD);
    assert.equal(state.fleet.length, 0);
    assert.equal(isContractPilotCareer(state), true);
  });

  it('selectStarterHub can still park a light starter when requested', () => {
    let state = emptyMissionsStateV2();
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
    assert.equal(isContractPilotCareer(state), false);
  });

  it('normalize keeps hubSelected for empty-fleet contract pilots', () => {
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'Ada Skyline',
    });
    const migrated = normalizeMissionsState({
      ...state,
      fleet: [],
    });
    assert.equal(migrated.hubSelected, true);
    assert.equal(migrated.fleet.length, 0);
    assert.equal(migrated.pilotName, 'Ada Skyline');
    assert.equal(migrated.homeHubIcao, 'SBGR');
  });

  it('normalizes and persists a concrete family configuration/roles pack', () => {
    const state = emptyMissionsStateV2();
    state.hubSelected = true;
    state.pilotName = 'Config Pilot';
    state.homeHubIcao = 'SBGR';
    state.fleet = [
      {
        id: 'acf_pc24_1',
        aircraftClassId: 'light_jet',
        airframeTypeId: 'microsoft-pc-24-cargo',
        airframeConfigurationId: 'vip',
        rolesPackRelPath: 'profiles/ofp/microsoft-pc-24-cargo.json',
        label: 'PC-24 VIP',
        locationIcao: 'SBGR',
        fuelKg: 1000,
        fuelCapacityKg: 2705,
        status: 'parked',
      },
    ];

    const migrated = normalizeMissionsState(state);
    assert.equal(migrated.fleet[0]?.airframeConfigurationId, 'vip');
    assert.equal(
      migrated.fleet[0]?.rolesPackRelPath,
      'profiles/ofp/microsoft-pc-24-vip.json',
    );

    const legacy = normalizeMissionsState({
      ...state,
      fleet: [
        {
          ...state.fleet[0]!,
          airframeConfigurationId: undefined,
          rolesPackRelPath: undefined,
        },
      ],
    });
    assert.equal(legacy.fleet[0]?.airframeConfigurationId, 'cargo');
    assert.equal(
      legacy.fleet[0]?.rolesPackRelPath,
      'profiles/ofp/microsoft-pc-24-cargo.json',
    );
  });

  it('normalize preserves Base Dispatcher seat on playerFbos', () => {
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBKP', {
      pilotName: 'DispPersist',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.playerFbos = {
      fbos: [
        {
          id: 'fbo_sbkp',
          icao: 'SBKP',
          tier: 1,
          capacityKg: 3000,
        },
      ],
      holds: [],
      stock: [],
      dispatchers: [
        {
          id: 'bd_1',
          displayName: 'Quinn Hassan',
          fboId: 'fbo_sbkp',
          hubIcao: 'SBKP',
          grade: 'solid',
          skillPct: 82,
          salaryUsdPerDay: 88,
          hiredAtTick: 10,
        },
      ],
      dispatcherHirePoolByHub: { SBKP: [] },
      dispatcherHirePoolDayByHub: { SBKP: 1 },
    };
    const migrated = normalizeMissionsState(state);
    assert.equal(migrated.playerFbos?.dispatchers?.length, 1);
    assert.equal(
      migrated.playerFbos?.dispatchers?.[0]?.displayName,
      'Quinn Hassan',
    );
    assert.ok(migrated.playerFbos?.dispatcherHirePoolByHub);
    assert.equal(migrated.playerFbos?.dispatcherHirePoolDayByHub?.SBKP, 1);
  });

  it('preserves the passive-fee watermark on normalizeMissionsState', () => {
    const state = emptyMissionsStateV2();
    state.lastSeenTick = 36_000;
    const migrated = normalizeMissionsState(state);
    assert.equal(migrated.lastSeenTick, 36_000);
  });

  it('preserves Active Tour on normalizeMissionsState', () => {
    const state = emptyMissionsStateV2();
    state.playerFbos = {
      fbos: [
        {
          id: 'fbo_sbkp',
          icao: 'SBKP',
          tier: 1,
          capacityKg: 3000,
        },
      ],
      holds: [],
      stock: [],
      activeTour: {
        id: 'tour_1',
        aircraftId: 'acf_1',
        aircraftClassId: 'light_ga',
        hubIcao: 'SBKP',
        originIcao: 'SBKP',
        routeLabel: 'SBKP→SBGR→SBSP',
        startedAtTick: 10,
        status: 'active',
        legs: [
          {
            index: 1,
            lotId: 'lot_a',
            originIcao: 'SBKP',
            destIcao: 'SBGR',
            commodityId: 'general',
            liftKg: 200,
            distanceNm: 50,
            ferryNm: 0,
            payUsd: 1000,
            fuelCostUsd: 100,
            netUsd: 900,
            lastMile: false,
            status: 'done',
          },
          {
            index: 2,
            lotId: 'lot_b',
            originIcao: 'SBGR',
            destIcao: 'SBSP',
            commodityId: 'general',
            liftKg: 180,
            distanceNm: 40,
            ferryNm: 0,
            payUsd: 900,
            fuelCostUsd: 80,
            netUsd: 820,
            lastMile: false,
            status: 'planned',
          },
        ],
      },
    };
    const migrated = normalizeMissionsState(state);
    assert.equal(migrated.playerFbos?.activeTour?.id, 'tour_1');
    assert.equal(migrated.playerFbos?.activeTour?.legs.length, 2);
    assert.equal(migrated.playerFbos?.activeTour?.legs[1]?.status, 'planned');
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
    assert.ok(quote.softNmApplied > 0);
    assert.ok(quote.ferryFeeUsd < quote.fullRateFeeUsd);
    const result = executeFerry(world, state, {
      aircraftId: state.fleet[0]!.id,
      destIcao: 'SBKP',
    });
    assert.equal(result.aircraft.locationIcao, 'SBKP');
    assert.equal(listParkedAt(state, 'SBKP').length, 1);
    assert.equal(listParkedAt(state, 'SBGR').length, 0);
    assert.ok(state.walletUsd < 50_000);
    // Hop Jet-A is billed in totalCostUsd; hangar tanks stay untouched.
    assert.equal(result.aircraft.fuelKg, beforeFuel);
    assert.ok((state.ferrySoftNmUsed ?? 0) > 0);
  });

  it('ferry preserves hangar fuel when tanks already cover the hop', () => {
    const world = createSeedEconomyWorld({ seed: 'ferry-keep-fuel' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
    state.walletUsd = 50_000;
    const aircraft = state.fleet[0]!;
    aircraft.fuelKg = aircraft.fuelCapacityKg;
    const quote = quoteFerry(world, state, {
      aircraftId: aircraft.id,
      destIcao: 'SBKP',
    });
    assert.equal(quote.fuelUpliftKg, 0);
    assert.equal(quote.fuelCostUsd, 0);
    const result = executeFerry(world, state, {
      aircraftId: aircraft.id,
      destIcao: 'SBKP',
    });
    assert.equal(result.aircraft.fuelKg, aircraft.fuelCapacityKg);
  });

  it('ferry soft budget expires into full-rate fees', () => {
    const world = createSeedEconomyWorld({ seed: 'ferry-soft' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
    state.walletUsd = 100_000;
    state.ferrySoftNmUsed = 3_000;
    const quote = quoteFerry(world, state, {
      aircraftId: state.fleet[0]!.id,
      destIcao: 'SBKP',
    });
    assert.equal(quote.softNmApplied, 0);
    assert.equal(quote.ferryFeeUsd, quote.fullRateFeeUsd);
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
    // Hangar already holds paid fuel near the live residual (no surplus / unpaid).
    state.fleet[0]!.fuelKg = 140;
    state.fleet[0]!.airframeConditionPct = 100;
    state.fleet[0]!.engineConditionPct = 100;
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

  it('normalize parks assigned fleet when the mission is gone', () => {
    const state = selectStarterHub(emptyMissionsStateV2(), 'SAEZ', pilot);
    const acf = state.fleet[0]!;
    acf.status = 'assigned';
    acf.assignedMissionId = 'msn_578_SAEZ_SGAS_6';
    const migrated = normalizeMissionsState({
      ...state,
      missions: [
        {
          id: 'msn_578_SAEZ_SGAS_6',
          originIcao: 'SAEZ',
          destIcao: 'SGAS',
          status: 'settled',
          aircraftId: acf.id,
        } as never,
      ],
    });
    assert.equal(migrated.fleet[0]!.status, 'parked');
    assert.equal(migrated.fleet[0]!.assignedMissionId, undefined);
  });

  it('normalize keeps assignment for an open dispatched mission', () => {
    const state = selectStarterHub(emptyMissionsStateV2(), 'SAEZ', pilot);
    const acf = state.fleet[0]!;
    acf.status = 'assigned';
    acf.assignedMissionId = 'msn_open';
    const migrated = normalizeMissionsState({
      ...state,
      missions: [
        {
          id: 'msn_open',
          originIcao: 'SAEZ',
          destIcao: 'SGAS',
          status: 'dispatched',
          aircraftId: acf.id,
        } as never,
      ],
    });
    assert.equal(migrated.fleet[0]!.status, 'assigned');
    assert.equal(migrated.fleet[0]!.assignedMissionId, 'msn_open');
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
    aircraft.fuelKg = 80;
    const mission = {
      id: 'msn_ofp_fuel',
      aircraftId: aircraft.id,
      aircraftClassId: aircraft.aircraftClassId,
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      status: 'dispatched',
    } as never;

    const requiredBlockFuelKg = Math.min(140, aircraft.fuelCapacityKg);
    const shortfallKg = requiredBlockFuelKg - 80;
    assert.ok(shortfallKg > 0);

    const quote = quotePlayerMissionOfpFuel(world, state, mission, {
      ofpId: 'ofp-1',
      requiredBlockFuelKg,
    });
    assert.equal(quote.currentFuelKg, 80);
    assert.equal(quote.shortfallKg, shortfallKg);
    assert.ok(quote.uplift.costUsd > 0);

    const purchase = purchasePlayerMissionOfpFuel(world, state, mission, {
      ofpId: 'ofp-1',
      requiredBlockFuelKg,
    });
    assert.equal(aircraft.fuelKg, requiredBlockFuelKg);
    assert.equal(purchase.mission.fuelAuthorizedOfpId, 'ofp-1');
    assert.equal(purchase.mission.fuelUplift?.requestedKg, shortfallKg);
    assert.ok(purchase.mission.tripFuelBurnKg! > 0);
    assert.ok(purchase.fuelDebitUsd > 0);

    const departFuel = applyPlayerDepartFuel(
      world,
      state,
      purchase.mission,
    );
    assert.equal(departFuel.fuelDebitUsd, 0);
  });

  it('settle debits accrued MX drain from live residual fuel', () => {
    const world = createSeedEconomyWorld({ seed: 'mx-drain-live' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
    const aircraft = state.fleet[0]!;
    aircraft.fuelKg = 120;
    aircraft.airframeConditionPct = 100;
    aircraft.engineConditionPct = 100;
    const mission = {
      id: 'msn_mx_live',
      aircraftId: aircraft.id,
      aircraftClassId: aircraft.aircraftClassId,
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      status: 'in_flight',
      tripFuelBurnKg: 40,
    } as never;
    state.missions.push(mission);
    assignAircraftToMission(state, aircraft.id, 'msn_mx_live', 'SBGR');

    const resolved = resolveSettledAircraftFuelKg(aircraft, mission, world, {
      residualFuelKg: 80,
      mxFuelDrainTotalKg: 45.2,
    });
    assert.equal(resolved.fuelKg, 35);
    assert.equal(resolved.mxFuelDrainAppliedKg, 45.2);
  });

  it('settle uses max of Watch ledger and full-flight MX estimate', () => {
    const world = createSeedEconomyWorld({ seed: 'mx-drain-max' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
    const aircraft = state.fleet[0]!;
    aircraft.fuelKg = 200;
    aircraft.airframeConditionPct = 40;
    aircraft.engineConditionPct = 40;
    const mission = {
      id: 'msn_mx_max',
      aircraftId: aircraft.id,
      aircraftClassId: aircraft.aircraftClassId,
      airframeTypeId: aircraft.airframeTypeId,
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      status: 'in_flight',
      tripFuelBurnKg: 40,
      expectedRouteMs: 3_600_000,
    } as never;
    const flowOpts = { cruiseFuelFlowKgPerHour: 120 };

    const estimatedAlone = resolveSettledAircraftFuelKg(
      aircraft,
      mission,
      world,
      { residualFuelKg: 160, ...flowOpts },
    );
    assert.ok(estimatedAlone.mxFuelDrainAppliedKg > 5);

    const resolved = resolveSettledAircraftFuelKg(aircraft, mission, world, {
      residualFuelKg: 160,
      mxFuelDrainTotalKg: 5,
      ...flowOpts,
    });
    assert.equal(
      resolved.mxFuelDrainAppliedKg,
      estimatedAlone.mxFuelDrainAppliedKg,
    );
    assert.ok(resolved.mxFuelDrainAppliedKg > 5);
  });

  it('settle trusts live residual and rejects unpaid sim fuel', () => {
    const world = createSeedEconomyWorld({ seed: 'mx-surplus' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
    const aircraft = state.fleet[0]!;
    aircraft.fuelKg = 200;
    aircraft.airframeConditionPct = 100;
    aircraft.engineConditionPct = 100;
    const mission = {
      id: 'msn_mx_surplus',
      aircraftId: aircraft.id,
      aircraftClassId: aircraft.aircraftClassId,
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      status: 'in_flight',
      tripFuelBurnKg: 60,
    } as never;

    // Sim burned more than tripBurn estimate — hangar follows residual, not floor.
    const burnedMore = resolveSettledAircraftFuelKg(aircraft, mission, world, {
      residualFuelKg: 40,
      mxFuelDrainTotalKg: 10,
    });
    assert.equal(burnedMore.fuelKg, 30);
    assert.equal(burnedMore.mxFuelDrainAppliedKg, 10);

    aircraft.fuelKg = 100;
    const unpaid = resolveSettledAircraftFuelKg(aircraft, mission, world, {
      residualFuelKg: 150,
      mxFuelDrainTotalKg: 10,
    });
    // Cap residual to hangar → 100 − 10 = 90 (no free fuel from sim)
    assert.equal(unpaid.fuelKg, 90);
  });

  it('settle debits estimated MX drain when live residual is unavailable', () => {
    const world = createSeedEconomyWorld({ seed: 'mx-drain-fallback' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
    const aircraft = state.fleet[0]!;
    aircraft.fuelKg = 120;
    aircraft.airframeConditionPct = 40;
    aircraft.engineConditionPct = 40;
    const mission = {
      id: 'msn_mx_fallback',
      aircraftId: aircraft.id,
      aircraftClassId: aircraft.aircraftClassId,
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      status: 'in_flight',
      tripFuelBurnKg: 40,
      expectedRouteMs: 3_600_000,
    } as never;
    state.missions.push(mission);

    const resolved = resolveSettledAircraftFuelKg(aircraft, mission, world, {});
    assert.ok(resolved.mxFuelDrainAppliedKg > 0);
    assert.ok(resolved.fuelKg < 80);
    assert.equal(
      resolved.fuelKg,
      Math.round(120 - 40 - resolved.mxFuelDrainAppliedKg),
    );
  });
});

describe('VA aircraft reservation', () => {
  it('reserves, TTL-expires, and swaps one-per-member', () => {
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
    const a = state.fleet[0]!;
    const b = {
      ...a,
      id: 'acf_second',
      registration: 'PP-TWO',
      label: 'Second',
    };
    state.fleet.push(b);

    const t0 = 1_700_000_000_000;
    reserveAircraftForMember(state, a.id, 'acc_a', t0);
    assert.equal(a.reservedByAccountId, 'acc_a');
    assert.equal(isAircraftReservationActive(a, t0 + 60_000), true);
    assert.equal(
      isAircraftReservationActive(a, t0 + VA_AIRCRAFT_RESERVE_TTL_MS + 1),
      false,
    );

    reserveAircraftForMember(state, b.id, 'acc_a', t0 + 1_000);
    assert.equal(a.reservedByAccountId, undefined);
    assert.equal(b.reservedByAccountId, 'acc_a');
  });

  it('blocks assign/ferry for other members; owner bypasses', () => {
    const world = createSeedEconomyWorld({ seed: 'va-reserve-lock' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
    state.walletUsd = 50_000;
    const acf = state.fleet[0]!;
    const t0 = Date.now();
    reserveAircraftForMember(state, acf.id, 'acc_holder', t0);

    assert.throws(
      () =>
        assignAircraftToMission(state, acf.id, 'msn_x', 'SBGR', {
          actorAccountId: 'acc_other',
          nowMs: t0,
        }),
      /reserved/i,
    );
    assert.throws(
      () =>
        quoteFerry(world, state, {
          aircraftId: acf.id,
          destIcao: 'SBKP',
          actorAccountId: 'acc_other',
          nowMs: t0,
        }),
      /reserved/i,
    );

    assignAircraftToMission(state, acf.id, 'msn_ok', 'SBGR', {
      actorAccountId: 'acc_holder',
      nowMs: t0,
    });
    assert.equal(acf.reservedByAccountId, 'acc_holder');
    releaseAircraftOnCancel(state, {
      id: 'msn_ok',
      aircraftId: acf.id,
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      status: 'accepted',
    } as never);
    assert.equal(acf.reservedByAccountId, 'acc_holder');

    quoteFerry(world, state, {
      aircraftId: acf.id,
      destIcao: 'SBKP',
      actorIsVaOwner: true,
      nowMs: t0,
    });
  });

  it('auto-reserves on assign when actorAccountId is set', () => {
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
    const acf = state.fleet[0]!;
    const t0 = Date.now();
    assignAircraftToMission(state, acf.id, 'msn_auto', 'SBGR', {
      actorAccountId: 'acc_pilot',
      nowMs: t0,
    });
    assert.equal(acf.reservedByAccountId, 'acc_pilot');
    assert.equal(acf.reservedAtMs, t0);
  });

  it('release clears hold', () => {
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
    const acf = state.fleet[0]!;
    reserveAircraftForMember(state, acf.id, 'acc_a', Date.now());
    releaseAircraftReservation(state, acf.id);
    assert.equal(acf.reservedByAccountId, undefined);
    assert.equal(acf.reservedAtMs, undefined);
  });

  it('normalizeMissionsState keeps reserved fields through save/load path', () => {
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
    const acf = state.fleet[0]!;
    const t0 = 1_700_000_000_000;
    reserveAircraftForMember(state, acf.id, 'acc_norm', t0);
    const roundTrip = normalizeMissionsState(
      JSON.parse(JSON.stringify(state)),
    );
    const again = roundTrip.fleet.find((a) => a.id === acf.id);
    assert.ok(again);
    assert.equal(again!.reservedByAccountId, 'acc_norm');
    assert.equal(again!.reservedAtMs, t0);
  });
});
