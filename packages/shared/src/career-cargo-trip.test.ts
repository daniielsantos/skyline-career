import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acceptMission,
  addCargoStop,
  assignAircraftToMission,
  cancelMission,
  createSeedEconomyWorld,
  departMission,
  emptyMissionsStateV2,
  missionDispatchCargoKg,
  selectStarterHub,
  settleFreightHoldFees,
  settleMission,
  TICKS_PER_DAY,
  type MissionIntent,
} from './index.js';

const pilot = {
  pilotName: 'Ada Skyline',
  airframeTypeId: 'asobo-c172sp-cargo',
};

function acceptedPair(): {
  world: ReturnType<typeof createSeedEconomyWorld>;
  state: ReturnType<typeof emptyMissionsStateV2>;
  host: MissionIntent;
  rider: MissionIntent;
} {
  const world = createSeedEconomyWorld({ seed: 'cargo-trip' });
  const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
  state.walletUsd = 100_000;
  world.lots.push(
    {
      id: 'lot_trip_host',
      commodityId: 'general',
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      quantityKg: 400,
      reservedKg: 0,
      createdAtTick: world.tick,
      expiresAtTick: world.tick + 800,
      payUsd: 900,
      urgency: 'normal',
      reason: 'test',
      status: 'available',
    },
    {
      id: 'lot_trip_rider',
      commodityId: 'supplies',
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      quantityKg: 400,
      reservedKg: 0,
      createdAtTick: world.tick,
      expiresAtTick: world.tick + 800,
      payUsd: 1200,
      urgency: 'normal',
      reason: 'test',
      status: 'available',
    },
    {
      id: 'lot_trip_later',
      commodityId: 'general',
      originIcao: 'SBGR',
      destIcao: 'SBRF',
      quantityKg: 400,
      reservedKg: 0,
      createdAtTick: world.tick,
      expiresAtTick: world.tick + 800,
      payUsd: 1500,
      urgency: 'normal',
      reason: 'test',
      status: 'available',
    },
  );
  const host = acceptMission(world, {
    lotId: 'lot_trip_host',
    cargoKg: 200,
    aircraftClassId: 'light_ga',
    missionId: 'msn_trip_host',
  });
  const rider = acceptMission(world, {
    lotId: 'lot_trip_rider',
    cargoKg: 150,
    aircraftClassId: 'light_ga',
    missionId: 'msn_trip_rider',
  });
  const later = acceptMission(world, {
    lotId: 'lot_trip_later',
    cargoKg: 100,
    aircraftClassId: 'light_ga',
    missionId: 'msn_trip_later',
  });
  host.aircraftId = state.fleet[0]!.id;
  state.missions = [host, rider, later];
  return { world, state, host, rider };
}

describe('cargo trip', () => {
  it('arms later stops on the host and blocks the rider from departing', () => {
    const { world, state } = acceptedPair();
    const armed = addCargoStop(state, 'msn_trip_host', 'msn_trip_rider');
    addCargoStop(state, 'msn_trip_host', 'msn_trip_later');
    assert.equal(missionDispatchCargoKg(armed) > 200, true);
    const host = state.missions.find((row) => row.id === 'msn_trip_host')!;
    assert.equal(host.throughLoads?.length, 2);
    assert.equal(missionDispatchCargoKg(host), 450);
    const rider = state.missions.find((row) => row.id === 'msn_trip_rider')!;
    assert.equal(rider.throughHostId, 'msn_trip_host');
    assert.throws(
      () => departMission(world, { ...rider, status: 'dispatched' }, { fleet: state }),
      /riding on another leg/,
    );
  });

  it('refuses a different origin, a repeated dest, and a load the aircraft cannot lift', () => {
    const { state } = acceptedPair();
    const other = state.missions.find((row) => row.id === 'msn_trip_rider')!;
    other.originIcao = 'SBKP';
    assert.throws(
      () => addCargoStop(state, 'msn_trip_host', 'msn_trip_rider'),
      /same airport/,
    );
    other.originIcao = 'SBGR';
    const host = state.missions.find((row) => row.id === 'msn_trip_host')!;
    host.destIcao = 'SBGL';
    assert.throws(
      () => addCargoStop(state, 'msn_trip_host', 'msn_trip_rider'),
      /already on this trip/,
    );
    host.destIcao = 'SBKP';
    assert.throws(
      () =>
        addCargoStop(state, 'msn_trip_host', 'msn_trip_rider', {
          maxCargoKg: 100,
        }),
      /trip would be/,
    );
  });

  it('parks the next contract as a yard hold when the host settles', () => {
    const { world, state } = acceptedPair();
    addCargoStop(state, 'msn_trip_host', 'msn_trip_rider');
    addCargoStop(state, 'msn_trip_host', 'msn_trip_later');
    const host = state.missions.find((row) => row.id === 'msn_trip_host')!;
    assignAircraftToMission(state, state.fleet[0]!.id, host.id, 'SBGR');
    const departed = departMission(
      world,
      { ...host, status: 'dispatched' },
      { fleet: state },
    );
    state.missions = state.missions.map((row) =>
      row.id === departed.mission.id ? departed.mission : row,
    );
    const settled = settleMission(world, departed.mission, {
      fleet: state,
      skipMinAirborneGate: true,
    });
    assert.equal(settled.mission.throughLoads, undefined);
    assert.equal(settled.mission.status, 'settled');
    const rider = state.missions.find((row) => row.id === 'msn_trip_rider')!;
    assert.equal(rider.status, 'accepted');
    assert.equal(rider.originIcao, 'SBKP');
    assert.equal(rider.freightHold?.icao, 'SBKP');
    assert.equal(rider.throughHostId, undefined);
    assert.equal(rider.throughLoads?.length, 1);
    assert.equal(rider.aircraftId, state.fleet[0]!.id);
    assert.equal(state.fleet[0]!.assignedMissionId, rider.id);
    assert.equal(state.fleet[0]!.locationIcao, 'SBKP');
    const later = state.missions.find((row) => row.id === 'msn_trip_later')!;
    assert.equal(later.throughHostId, rider.id);
    assert.equal(later.originIcao, 'SBGR');
    const sameDay = settleFreightHoldFees(state, {
      fromTick: world.tick,
      toTick: world.tick,
    });
    assert.equal(sameDay.debitUsd, 0);
    const nextDay = settleFreightHoldFees(state, {
      fromTick: world.tick,
      toTick: world.tick + TICKS_PER_DAY,
    });
    assert.equal(nextDay.debitUsd, 12.5);
    const left = departMission(world, rider, { fleet: state });
    state.missions = state.missions.map((row) =>
      row.id === left.mission.id ? left.mission : row,
    );
    assert.equal(left.mission.freightHold, undefined);
    const afterDepart = settleFreightHoldFees(state, {
      fromTick: world.tick + TICKS_PER_DAY,
      toTick: world.tick + TICKS_PER_DAY * 2,
    });
    assert.equal(afterDepart.debitUsd, 0);
  });

  it('hands the aircraft to the next stop while it is still reserved for that pilot', () => {
    const { world, state } = acceptedPair();
    addCargoStop(state, 'msn_trip_host', 'msn_trip_rider');
    const host = state.missions.find((row) => row.id === 'msn_trip_host')!;
    host.pilotAccountId = 'pilot-a';
    const aircraft = state.fleet[0]!;
    assignAircraftToMission(state, aircraft.id, host.id, 'SBGR', {
      requirePilotAtOrigin: false,
      actorAccountId: 'pilot-a',
    });
    assert.equal(aircraft.reservedByAccountId, 'pilot-a');
    const departed = departMission(
      world,
      { ...host, status: 'dispatched' },
      { fleet: state },
    );
    state.missions = state.missions.map((row) =>
      row.id === departed.mission.id ? departed.mission : row,
    );
    settleMission(world, departed.mission, {
      fleet: state,
      skipMinAirborneGate: true,
    });
    const rider = state.missions.find((row) => row.id === 'msn_trip_rider')!;
    assert.equal(rider.aircraftId, aircraft.id);
    assert.equal(aircraft.assignedMissionId, rider.id);
    assert.equal(aircraft.locationIcao, 'SBKP');
    assert.equal(aircraft.reservedByAccountId, 'pilot-a');
  });

  it('cancels later stops when the host flight is cancelled', () => {
    const { world, state } = acceptedPair();
    addCargoStop(state, 'msn_trip_host', 'msn_trip_rider');
    addCargoStop(state, 'msn_trip_host', 'msn_trip_later');
    const host = state.missions.find((row) => row.id === 'msn_trip_host')!;
    const cancelled = cancelMission(world, host, { fleet: state });
    state.missions = state.missions.map((row) =>
      row.id === cancelled.id ? cancelled : row,
    );
    const rider = state.missions.find((row) => row.id === 'msn_trip_rider')!;
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(rider.throughHostId, undefined);
    assert.equal(rider.originIcao, 'SBGR');
    assert.equal(rider.status, 'cancelled');
    assert.equal(
      state.missions.find((row) => row.id === 'msn_trip_later')?.status,
      'cancelled',
    );
  });

  it('drops a cancelled rider off the host', () => {
    const { world, state } = acceptedPair();
    addCargoStop(state, 'msn_trip_host', 'msn_trip_rider');
    const rider = state.missions.find((row) => row.id === 'msn_trip_rider')!;
    cancelMission(world, rider, { fleet: state });
    const host = state.missions.find((row) => row.id === 'msn_trip_host')!;
    assert.equal(host.throughLoads, undefined);
  });
});
