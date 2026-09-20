import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSeedEconomyWorld } from './career-economy.js';
import {
  assignAircraftToMission,
  emptyMissionsStateV2,
  executeFerry,
  normalizeMissionsState,
  relocateAircraftOnSettle,
  selectStarterHub,
} from './career-fleet.js';
import {
  PILOT_TRAVEL_MIN_USD,
  PILOT_TRAVEL_USD_PER_NM,
  assertPilotAtIcao,
  executePilotTravel,
  quotePilotTravel,
  syncPilotIcaoTo,
} from './career-pilot-travel.js';
import { normalizeCareerLedger } from './career-ledger.js';
import type { MissionIntent } from './types/career-economy.js';

const pilot = {
  pilotName: 'Ada Skyline',
  airframeTypeId: 'asobo-c172sp-cargo',
};

describe('pilot travel', () => {
  it('selectStarterHub and normalize set pilotIcao to home hub', () => {
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
    assert.equal(state.pilotIcao, 'SBGR');
    state = normalizeMissionsState({
      ...state,
      pilotIcao: undefined,
    });
    assert.equal(state.pilotIcao, 'SBGR');
  });

  it('quotes floor and per-nm travel', () => {
    const world = createSeedEconomyWorld({ seed: 'pilot-travel-quote' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
    const quote = quotePilotTravel(world, state, 'SBGL');
    assert.equal(quote.originIcao, 'SBGR');
    assert.equal(quote.destIcao, 'SBGL');
    assert.ok(quote.distanceNm > 0);
    const expected = Math.max(
      PILOT_TRAVEL_MIN_USD,
      Math.round(quote.distanceNm * PILOT_TRAVEL_USD_PER_NM),
    );
    assert.equal(quote.costUsd, expected);
  });

  it('executes travel debit and moves pilot only', () => {
    const world = createSeedEconomyWorld({ seed: 'pilot-travel-exec' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
    const acfIcao = state.fleet[0]!.locationIcao;
    const beforeWallet = state.walletUsd;
    const result = executePilotTravel(world, state, 'SBKP');
    assert.equal(state.pilotIcao, 'SBKP');
    assert.equal(state.fleet[0]!.locationIcao, acfIcao);
    assert.equal(state.walletUsd, beforeWallet - result.walletDebitUsd);
    assert.equal(result.walletDebitUsd, result.quote.costUsd);
  });

  it('blocks assign when pilot is away; ferry does not move pilot', () => {
    const world = createSeedEconomyWorld({ seed: 'pilot-travel-gate' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
    executePilotTravel(world, state, 'SBKP');
    assert.throws(
      () => assertPilotAtIcao(state, 'SBGR'),
      /Pilot is at SBKP/,
    );
    assert.throws(
      () =>
        assignAircraftToMission(
          state,
          state.fleet[0]!.id,
          'msn_gate',
          'SBGR',
        ),
      /Pilot is at SBKP/,
    );

    executePilotTravel(world, state, 'SBGR');
    state.walletUsd = 100_000;
    executeFerry(world, state, {
      aircraftId: state.fleet[0]!.id,
      destIcao: 'SBKP',
    });
    assert.equal(state.fleet[0]!.locationIcao, 'SBKP');
    assert.equal(state.pilotIcao, 'SBGR');
  });

  it('settle syncs pilot to destination with the aircraft', () => {
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
    const mission = {
      id: 'msn_test',
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      aircraftId: state.fleet[0]!.id,
      status: 'in_flight',
      aircraftClassId: state.fleet[0]!.aircraftClassId,
      lots: [],
      cargoKg: 100,
      payUsd: 500,
      acceptedAtTick: 0,
    } as unknown as MissionIntent;
    state.fleet[0]!.status = 'assigned';
    state.fleet[0]!.assignedMissionId = mission.id;
    state.pilotIcao = 'SBGR';
    relocateAircraftOnSettle(state, mission);
    assert.equal(state.fleet[0]!.locationIcao, 'SBGL');
    assert.equal(state.pilotIcao, 'SBGL');
  });

  it('settle relocates by aircraftId even when assignment was cleared', () => {
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
    const mission = {
      id: 'msn_cleared',
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      aircraftId: state.fleet[0]!.id,
      status: 'in_flight',
      aircraftClassId: state.fleet[0]!.aircraftClassId,
      lots: [],
      cargoKg: 100,
      payUsd: 500,
      acceptedAtTick: 0,
    } as unknown as MissionIntent;
    state.fleet[0]!.status = 'parked';
    state.fleet[0]!.assignedMissionId = undefined;
    state.pilotIcao = 'SBGR';
    relocateAircraftOnSettle(state, mission);
    assert.equal(state.fleet[0]!.locationIcao, 'SBGL');
    assert.equal(state.pilotIcao, 'SBGL');
  });

  it('crew settle relocates aircraft without moving the pilot', () => {
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'CrewPilotStay',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const mission = {
      id: 'msn_crew',
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      aircraftId: state.fleet[0]!.id,
      status: 'in_flight',
      aircraftClassId: state.fleet[0]!.aircraftClassId,
      crewOperated: true,
      lots: [],
      cargoKg: 100,
      payUsd: 500,
      acceptedAtTick: 0,
    } as unknown as MissionIntent;
    state.fleet[0]!.status = 'assigned';
    state.fleet[0]!.assignedMissionId = mission.id;
    state.pilotIcao = 'SBGR';
    relocateAircraftOnSettle(state, mission);
    assert.equal(state.fleet[0]!.locationIcao, 'SBGL');
    assert.equal(state.pilotIcao, 'SBGR');
  });

  it('dual-tenant: relocate moves ops pilot; home needs separate sync', () => {
    const home = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'Home',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const va = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'VA',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const mission = {
      id: 'msn_va_dual',
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      aircraftId: va.fleet[0]!.id,
      status: 'in_flight',
      aircraftClassId: va.fleet[0]!.aircraftClassId,
      pilotHomeCompanyId: 'co_home',
      lots: [],
      cargoKg: 100,
      payUsd: 500,
      acceptedAtTick: 0,
    } as unknown as MissionIntent;
    va.fleet[0]!.status = 'assigned';
    va.fleet[0]!.assignedMissionId = mission.id;
    home.pilotIcao = 'SBGR';
    va.pilotIcao = 'SBGR';
    relocateAircraftOnSettle(va, mission);
    assert.equal(va.fleet[0]!.locationIcao, 'SBGL');
    assert.equal(va.pilotIcao, 'SBGL');
    // Chrome sticky reads home — still at origin until API dual-write.
    assert.equal(home.pilotIcao, 'SBGR');
    syncPilotIcaoTo(home, mission.destIcao);
    assert.equal(home.pilotIcao, 'SBGL');
  });

  it('persists pilot_travel ledger kind', () => {
    const entries = normalizeCareerLedger([
      {
        id: 't1',
        atTick: 1,
        dayIndex: 0,
        amountUsd: -90,
        kind: 'pilot_travel',
      },
    ]);
    assert.equal(entries[0]?.kind, 'pilot_travel');
  });
});
