import { assignAircraftToMission, findPlayerAircraft } from './career-fleet.js';
import type { CareerEconomyWorld } from './types/career-economy.js';
import type {
  CareerMissionsState,
  CommodityId,
  MissionIntent,
} from './types/career-economy.js';

/** Extra stops beyond the leg being planned. Four missions on one trip. */
export const CARGO_TRIP_MAX_STOPS = 3;

export type CargoThroughLoad = {
  missionId: string;
  destIcao: string;
  cargoKg: number;
  commodityId: CommodityId;
  stopIndex: number;
};

/** Host contract plus freight still riding to later stops. */
export function missionDispatchCargoKg(mission: {
  cargoKg: number;
  throughLoads?: ReadonlyArray<{ cargoKg: number }> | null;
}): number {
  const extra = (mission.throughLoads ?? []).reduce(
    (sum, row) => sum + (row.cargoKg > 0 ? row.cargoKg : 0),
    0,
  );
  return Math.max(0, mission.cargoKg) + extra;
}

function tripRefusal(mission: MissionIntent): string | null {
  if (mission.missionType === 'charter') return 'Charter stays on its own flight';
  if (mission.payloadLab) return 'Payload Lab stays on its own flight';
  if (mission.fuelHaul) return 'A Jet-A haul stays on its own flight';
  if (
    mission.emptyFlight ||
    mission.crewDeadhead ||
    mission.contractPilotReposition
  ) {
    return 'An empty leg cannot join a cargo trip';
  }
  if (!(mission.cargoKg > 0)) return 'That contract has no cargo';
  return null;
}

/**
 * Attach an accepted contract as the next stop. Both stay at the same
 * origin until the host settles. The first OFP must carry the sum.
 */
export function addCargoStop(
  state: CareerMissionsState,
  hostId: string,
  riderId: string,
  opts: { maxCargoKg?: number } = {},
): MissionIntent {
  const host = state.missions.find((row) => row.id === hostId);
  const rider = state.missions.find((row) => row.id === riderId);
  if (!host) throw new Error(`Unknown mission ${hostId}`);
  if (!rider) throw new Error(`Unknown mission ${riderId}`);
  if (host.id === rider.id) throw new Error('A flight cannot stop for itself');
  if (host.status !== 'accepted') {
    throw new Error('Add the next stop before dispatch');
  }
  if (rider.status !== 'accepted') {
    throw new Error('That contract is not waiting to fly');
  }
  if (host.throughHostId) {
    throw new Error('This freight is already riding another flight');
  }
  if (rider.throughHostId || (rider.throughLoads?.length ?? 0) > 0) {
    throw new Error('That contract is already part of a trip');
  }
  const hostBlock = tripRefusal(host);
  if (hostBlock) throw new Error(hostBlock);
  const riderBlock = tripRefusal(rider);
  if (riderBlock) throw new Error(riderBlock);
  if (host.originIcao.toUpperCase() !== rider.originIcao.toUpperCase()) {
    throw new Error('Every stop on this trip leaves from the same airport');
  }
  const dests = new Set<string>([
    host.destIcao.toUpperCase(),
    ...(host.throughLoads ?? []).map((row) => row.destIcao.toUpperCase()),
  ]);
  if (dests.has(rider.destIcao.toUpperCase())) {
    throw new Error('That destination is already on this trip');
  }
  const loads = host.throughLoads ?? [];
  if (loads.length >= CARGO_TRIP_MAX_STOPS) {
    throw new Error(`A trip can add at most ${CARGO_TRIP_MAX_STOPS} stops`);
  }
  const nextKg = missionDispatchCargoKg(host) + rider.cargoKg;
  if (
    typeof opts.maxCargoKg === 'number' &&
    Number.isFinite(opts.maxCargoKg) &&
    opts.maxCargoKg >= 0 &&
    nextKg > opts.maxCargoKg + 0.5
  ) {
    throw new Error(
      `This aircraft can carry ${Math.floor(opts.maxCargoKg)} kg on this leg; the trip would be ${Math.floor(nextKg)} kg`,
    );
  }
  const throughLoads: CargoThroughLoad[] = [
    ...loads,
    {
      missionId: rider.id,
      destIcao: rider.destIcao.toUpperCase(),
      cargoKg: rider.cargoKg,
      commodityId: rider.commodityId,
      stopIndex: loads.length + 1,
    },
  ];
  const nextHost: MissionIntent = { ...host, throughLoads };
  const nextRider: MissionIntent = { ...rider, throughHostId: host.id };
  state.missions = state.missions.map((row) => {
    if (row.id === host.id) return nextHost;
    if (row.id === rider.id) return nextRider;
    return row;
  });
  return nextHost;
}

/**
 * Host settled. The next contract becomes a freight hold at the hub just
 * landed. Later stops ride that continuation, so the yard bills one pile.
 */
export function continueCargoTripAfterSettle(
  world: CareerEconomyWorld,
  state: CareerMissionsState,
  host: MissionIntent,
): MissionIntent | undefined {
  const loads = [...(host.throughLoads ?? [])].sort(
    (a, b) => a.stopIndex - b.stopIndex,
  );
  const next = loads[0];
  if (!next) return undefined;
  const rider = state.missions.find((row) => row.id === next.missionId);
  if (!rider || rider.status === 'cancelled' || rider.status === 'settled') {
    return undefined;
  }
  const hub = host.destIcao.toUpperCase();
  const rest: CargoThroughLoad[] = loads.slice(1).map((row, index) => ({
    ...row,
    stopIndex: index + 1,
  }));
  const parked: MissionIntent = {
    ...rider,
    status: 'accepted',
    originIcao: hub,
    aircraftId: undefined,
    aircraftClassId: host.aircraftClassId || rider.aircraftClassId,
    throughHostId: undefined,
    throughLoads: rest.length > 0 ? rest : undefined,
    freightHold: { icao: hub, sinceTick: world.tick },
    airborneAtMs: undefined,
    expectedRouteMs: undefined,
    departedAtTick: undefined,
    dispatchedAtTick: undefined,
  };
  const aircraft = host.aircraftId
    ? findPlayerAircraft(state, host.aircraftId)
    : undefined;
  if (aircraft && aircraft.status === 'parked') {
    assignAircraftToMission(state, aircraft.id, rider.id, hub, {
      requirePilotAtOrigin: false,
    });
    parked.aircraftId = aircraft.id;
  }
  const restIds = new Set(rest.map((row) => row.missionId));
  state.missions = state.missions.map((row) => {
    if (row.id === rider.id) return parked;
    if (restIds.has(row.id)) return { ...row, throughHostId: rider.id };
    return row;
  });
  return parked;
}

/** Cancel drops the link. Riders stay accepted where they already are. */
export function releaseCargoTripOnCancel(
  state: CareerMissionsState,
  mission: MissionIntent,
): void {
  const riderIds = new Set(
    (mission.throughLoads ?? []).map((row) => row.missionId),
  );
  const hostId = mission.throughHostId;
  state.missions = state.missions.map((row) => {
    if (riderIds.has(row.id) && row.throughHostId === mission.id) {
      return { ...row, throughHostId: undefined };
    }
    if (hostId && row.id === hostId && row.throughLoads) {
      const throughLoads = row.throughLoads.filter(
        (load) => load.missionId !== mission.id,
      );
      return {
        ...row,
        throughLoads: throughLoads.length > 0 ? throughLoads : undefined,
      };
    }
    return row;
  });
}
