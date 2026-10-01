import { addCargoStop, CARGO_TRIP_MAX_STOPS, missionDispatchCargoKg } from './career-cargo-trip.js';
import { dispatchDemandHold } from './career-demand.js';
import { assignAircraftToMission, findPlayerAircraft } from './career-fleet.js';
import { cancelMission } from './career-mission.js';
import { dispatchWarehouseBridgeHold } from './career-warehouse-bridge.js';
import { dispatchWarehouseHaulHold } from './career-warehouse-haul.js';
import type {
  CareerEconomyWorld,
  CareerMissionsState,
  MissionIntent,
} from './types/career-economy.js';

/**
 * Turn a desk hold into the next stop on a flight that is still accepted.
 * The aircraft stays on that flight. The hold leaves the desk.
 */
export function attachDeskHoldToCargoTrip(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    hostMissionId: string;
    holdId: string;
    maxCargoKg?: number;
    /** Partial load. Omit = the whole hold. The rest stays on the desk. */
    kg?: number;
    /** Pilot clicking Add. The tail is already reserved for this flight. */
    actorAccountId?: string | null;
    actorIsVaOwner?: boolean;
  },
): MissionIntent {
  const host = state.missions.find((row) => row.id === opts.hostMissionId);
  if (!host) throw new Error(`Unknown mission ${opts.hostMissionId}`);
  if (host.status !== 'accepted') {
    throw new Error('Add the next stop before dispatch');
  }
  if (host.throughHostId) {
    throw new Error('This freight is already riding another flight');
  }
  if (!host.aircraftId) {
    throw new Error('Assign an aircraft before adding a stop');
  }
  const hold = (state.playerWarehouses?.demandHolds ?? []).find(
    (row) => row.id === opts.holdId.trim(),
  );
  if (!hold) throw new Error('Hold not found');
  if (hold.originIcao.toUpperCase() !== host.originIcao.toUpperCase()) {
    throw new Error('Every stop on this trip leaves from the same airport');
  }
  const taken = new Set<string>([
    host.destIcao.toUpperCase(),
    ...(host.throughLoads ?? []).map((row) => row.destIcao.toUpperCase()),
  ]);
  if (taken.has(hold.destIcao.toUpperCase())) {
    throw new Error('That destination is already on this trip');
  }
  if ((host.throughLoads?.length ?? 0) >= CARGO_TRIP_MAX_STOPS) {
    throw new Error(`A trip can add at most ${CARGO_TRIP_MAX_STOPS} stops`);
  }
  const requested =
    opts.kg != null && Number.isFinite(opts.kg) ? Math.floor(opts.kg) : hold.kg;
  const takeKg = Math.min(hold.kg, Math.max(0, requested));
  if (takeKg <= 0) throw new Error('Dispatch amount must be positive');
  const nextKg = missionDispatchCargoKg(host) + takeKg;
  if (
    typeof opts.maxCargoKg === 'number' &&
    Number.isFinite(opts.maxCargoKg) &&
    nextKg > opts.maxCargoKg + 0.5
  ) {
    throw new Error(
      `This aircraft can carry ${Math.floor(opts.maxCargoKg)} kg on this leg; the trip would be ${Math.floor(nextKg)} kg`,
    );
  }
  const kind = hold.kind ?? 'demand';
  const aircraft = findPlayerAircraft(state, host.aircraftId);
  if (!aircraft) throw new Error(`Unknown aircraft ${host.aircraftId}`);
  const parkedForJoin = aircraft.status === 'assigned' && aircraft.assignedMissionId === host.id;
  if (parkedForJoin) {
    aircraft.status = 'parked';
    aircraft.assignedMissionId = undefined;
  }
  const actorAccountId =
    opts.actorAccountId?.trim() || host.pilotAccountId?.trim() || undefined;
  const shared = {
    holdId: hold.id,
    aircraftId: host.aircraftId,
    tripHostId: host.id,
    pilotAccountId: host.pilotAccountId?.trim() || actorAccountId,
    pilotHomeCompanyId: host.pilotHomeCompanyId,
    actorIsVaOwner: opts.actorIsVaOwner === true,
    kg: takeKg,
  };
  let created: { mission: MissionIntent } | null = null;
  try {
    created =
      kind === 'haul'
        ? dispatchWarehouseHaulHold(state, world, {
            ...shared,
            vaFlight: host.vaFlight,
          })
        : kind === 'bridge'
          ? dispatchWarehouseBridgeHold(state, world, shared)
          : kind === 'demand'
            ? dispatchDemandHold(state, world, {
                ...shared,
                vaFlight: host.vaFlight,
              })
            : null;
  } catch (error) {
    if (parkedForJoin && aircraft.assignedMissionId !== host.id) {
      aircraft.status = 'assigned';
      aircraft.assignedMissionId = host.id;
    }
    throw error;
  }
  if (!created) {
    if (parkedForJoin) {
      aircraft.status = 'assigned';
      aircraft.assignedMissionId = host.id;
    }
    throw new Error('That hold cannot join a cargo trip');
  }
  const rider = state.missions.find((row) => row.id === created.mission.id);
  if (!rider) throw new Error('Hold did not become a contract');
  rider.aircraftId = undefined;
  aircraft.status = 'parked';
  aircraft.assignedMissionId = undefined;
  try {
    assignAircraftToMission(state, host.aircraftId, host.id, host.originIcao, {
      requirePilotAtOrigin: false,
      ...(actorAccountId ? { actorAccountId } : {}),
      actorIsVaOwner: opts.actorIsVaOwner === true,
    });
    return addCargoStop(state, host.id, rider.id, {
      ...(opts.maxCargoKg != null ? { maxCargoKg: opts.maxCargoKg } : {}),
    });
  } catch (error) {
    if (aircraft.assignedMissionId !== host.id) {
      aircraft.status = 'assigned';
      aircraft.assignedMissionId = host.id;
    }
    const leftover = state.missions.find((row) => row.id === rider.id);
    if (leftover && leftover.status === 'accepted') {
      const cancelled = cancelMission(world, leftover, { fleet: state });
      state.missions = state.missions.map((row) =>
        row.id === cancelled.id ? cancelled : row,
      );
    }
    throw error;
  }
}
