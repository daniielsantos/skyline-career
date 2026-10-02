import { addCargoStop, CARGO_TRIP_MAX_STOPS, missionDispatchCargoKg } from './career-cargo-trip.js';
import {
  dispatchDemandHold,
  replaceDemandMissionCargo,
} from './career-demand.js';
import { assignAircraftToMission, findPlayerAircraft } from './career-fleet.js';
import {
  cancelMission,
  clearPlayerInbound,
  recomputeMissionTotals,
  restoreDeskCargoLines,
  syncPlayerInbound,
} from './career-mission.js';
import { dispatchWarehouseBridgeHold } from './career-warehouse-bridge.js';
import {
  dispatchWarehouseHaulHold,
  replaceWarehouseDeskMissionCargo,
} from './career-warehouse-haul.js';
import { withdrawCargoFromWarehouse } from './career-warehouse-stock.js';
import {
  MAX_MANIFEST_LOTS,
  type CareerEconomyWorld,
  type CareerMissionsState,
  type MissionIntent,
  type PlayerDemandHold,
} from './types/career-economy.js';

function deskHoldKind(hold: PlayerDemandHold): string {
  return hold.kind ?? 'demand';
}

function missionMatchesDeskKind(mission: MissionIntent, kind: string): boolean {
  if (kind === 'bridge') return mission.warehouseBridge === true;
  if (kind === 'haul') return mission.warehouseHaul === true;
  if (kind === 'demand') return Boolean(mission.demandOrderId);
  return false;
}

/**
 * A second contract for a stop already on the trip joins that contract.
 * Machinery and supplies for the same airport stay one landing, two lots.
 */
function stackDeskHoldOntoStop(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  host: MissionIntent,
  riderId: string,
  hold: PlayerDemandHold,
  opts: {
    maxCargoKg?: number;
    kg: number;
    actorAccountId?: string | null;
    actorIsVaOwner?: boolean;
  },
): MissionIntent {
  const ontoHost = riderId === host.id;
  const rider = ontoHost
    ? host
    : state.missions.find((row) => row.id === riderId);
  if (!rider || (!ontoHost && rider.throughHostId !== host.id)) {
    throw new Error('That destination is already on this trip');
  }
  const kind = deskHoldKind(hold);
  if (!missionMatchesDeskKind(rider, kind)) {
    throw new Error('That destination is already on this trip');
  }
  if (rider.lots.length >= MAX_MANIFEST_LOTS) {
    throw new Error(`At most ${MAX_MANIFEST_LOTS} lots on one stop`);
  }
  const takeKg = opts.kg;
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
  if (!host.aircraftId) throw new Error('Assign an aircraft before adding a stop');
  const aircraft = findPlayerAircraft(state, host.aircraftId);
  if (!aircraft) throw new Error(`Unknown aircraft ${host.aircraftId}`);
  const parkedForJoin =
    aircraft.status === 'assigned' && aircraft.assignedMissionId === host.id;
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
          : dispatchDemandHold(state, world, {
              ...shared,
              vaFlight: host.vaFlight,
            });
  } catch (error) {
    if (parkedForJoin && aircraft.assignedMissionId !== host.id) {
      aircraft.status = 'assigned';
      aircraft.assignedMissionId = host.id;
    }
    throw error;
  }
  const fresh = state.missions.find((row) => row.id === created.mission.id);
  if (!fresh) throw new Error('Hold did not become a contract');
  const lots = [...rider.lots];
  for (const line of fresh.lots) {
    const shipmentLotId = lots.some((row) => row.shipmentLotId === line.shipmentLotId)
      ? `${line.shipmentLotId}_${line.commodityId}`
      : line.shipmentLotId;
    lots.push({ ...line, shipmentLotId });
  }
  const merged = recomputeMissionTotals({
    ...rider,
    lots,
    throughHostId: ontoHost ? undefined : host.id,
    aircraftId: ontoHost ? host.aircraftId : undefined,
    cargoKg: lots.reduce((sum, line) => sum + line.cargoKg, 0),
    payUsd: lots.reduce((sum, line) => sum + line.payUsd, 0),
  });
  clearPlayerInbound(world, fresh.id);
  const throughLoads = ontoHost
    ? host.throughLoads
    : (host.throughLoads ?? []).map((row) =>
        row.missionId === rider.id ? { ...row, cargoKg: merged.cargoKg } : row,
      );
  const mergedHost: MissionIntent = ontoHost
    ? merged
    : { ...host, throughLoads };
  state.missions = state.missions
    .filter((row) => row.id !== fresh.id)
    .map((row) => {
      if (!ontoHost && row.id === rider.id) return merged;
      if (row.id === host.id) return mergedHost;
      return row;
    });
  aircraft.status = 'parked';
  aircraft.assignedMissionId = undefined;
  assignAircraftToMission(state, host.aircraftId, host.id, host.originIcao, {
    requirePilotAtOrigin: false,
    ...(actorAccountId ? { actorAccountId } : {}),
    actorIsVaOwner: opts.actorIsVaOwner === true,
  });
  const nextHost = state.missions.find((row) => row.id === host.id);
  syncPlayerInbound(world, merged);
  return nextHost ?? { ...host, throughLoads };
}

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
  let host = state.missions.find((row) => row.id === opts.hostMissionId);
  if (!host) throw new Error(`Unknown mission ${opts.hostMissionId}`);
  if (host.status === 'in_flight') {
    throw new Error('This flight has already departed');
  }
  if (host.status !== 'accepted' && host.status !== 'dispatched') {
    throw new Error('Add the next stop before the flight departs');
  }
  if (host.status === 'dispatched') {
    host = {
      ...host,
      status: 'accepted',
      dispatchedAtTick: undefined,
      lastOfpCheck: undefined,
      lastPreflightCheck: undefined,
      fuelAuthorizedOfpId: undefined,
      staticId: undefined,
      tripFuelBurnKg: undefined,
    };
    state.missions = state.missions.map((row) =>
      row.id === host!.id ? host! : row,
    );
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
  const requested =
    opts.kg != null && Number.isFinite(opts.kg) ? Math.floor(opts.kg) : hold.kg;
  const takeKg = Math.min(hold.kg, Math.max(0, requested));
  if (takeKg <= 0) throw new Error('Dispatch amount must be positive');
  const dest = hold.destIcao.toUpperCase();
  const kind = hold.kind ?? 'demand';
  if (dest === host.destIcao.toUpperCase() && missionMatchesDeskKind(host, kind)) {
    return stackDeskHoldOntoStop(state, world, host, host.id, hold, {
      ...opts,
      kg: takeKg,
    });
  }
  const existingStop = (host.throughLoads ?? []).find(
    (row) => row.destIcao.toUpperCase() === dest,
  );
  if (existingStop) {
    const rider = state.missions.find((row) => row.id === existingStop.missionId);
    if (rider && missionMatchesDeskKind(rider, kind)) {
      return stackDeskHoldOntoStop(state, world, host, existingStop.missionId, hold, {
        ...opts,
        kg: takeKg,
      });
    }
  }
  const sameLanding = dest === host.destIcao.toUpperCase() || Boolean(existingStop);
  if ((host.throughLoads?.length ?? 0) >= CARGO_TRIP_MAX_STOPS) {
    throw new Error(`A trip can add at most ${CARGO_TRIP_MAX_STOPS} stops`);
  }
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
      ...(sameLanding ? { allowSameDest: true } : {}),
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

function tripFamily(state: CareerMissionsState, hostId: string): MissionIntent[] {
  return state.missions.filter(
    (row) =>
      (row.id === hostId || row.throughHostId === hostId) &&
      (row.status === 'accepted' || row.status === 'dispatched'),
  );
}

function refreshHostThroughLoads(
  state: CareerMissionsState,
  hostId: string,
): MissionIntent {
  const host = state.missions.find((row) => row.id === hostId);
  if (!host) throw new Error(`Unknown mission ${hostId}`);
  const throughLoads = (host.throughLoads ?? []).flatMap((row) => {
    const rider = state.missions.find(
      (mission) =>
        mission.id === row.missionId &&
        (mission.status === 'accepted' || mission.status === 'dispatched'),
    );
    if (!rider) return [];
    return [{ ...row, cargoKg: Math.max(0, Math.floor(rider.cargoKg)) }];
  });
  const next: MissionIntent = {
    ...host,
    throughLoads: throughLoads.length > 0 ? throughLoads : undefined,
  };
  state.missions = state.missions.map((row) => (row.id === hostId ? next : row));
  return next;
}

/**
 * Write the Manifest sliders back onto an accepted desk flight.
 * Each line is a lot already on the host or on a later stop.
 * Zero drops that later contract. The first contract stays.
 */
export function syncDeskTripLoads(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  hostId: string,
  loads: Array<{ lotId: string; cargoKg: number }>,
  opts: { maxCargoKg?: number } = {},
): MissionIntent {
  const host = state.missions.find((row) => row.id === hostId);
  if (!host) throw new Error(`Unknown mission ${hostId}`);
  if (host.status !== 'accepted' && host.status !== 'dispatched') {
    throw new Error(`Cannot edit mission in status=${host.status}`);
  }
  const parsed = loads
    .filter((line) => line.lotId)
    .map((line) => ({
      lotId: String(line.lotId),
      cargoKg: Math.floor(Number(line.cargoKg)),
    }));
  if (parsed.length === 0) throw new Error('lines required');

  const locate = (lotId: string) => {
    for (const mission of tripFamily(state, hostId)) {
      const lot = mission.lots.find((row) => row.shipmentLotId === lotId);
      if (lot) return { mission, lot };
    }
    return undefined;
  };
  for (const line of parsed) {
    if (!locate(line.lotId)) throw new Error(`Unknown cargo line ${line.lotId}`);
  }

  const assertTripRoom = (delta: number) => {
    if (delta <= 0) return;
    const current = state.missions.find((row) => row.id === hostId) ?? host;
    const nextKg = missionDispatchCargoKg(current) + delta;
    if (
      typeof opts.maxCargoKg === 'number' &&
      Number.isFinite(opts.maxCargoKg) &&
      nextKg > opts.maxCargoKg + 0.5
    ) {
      throw new Error(
        `This aircraft can carry ${Math.floor(opts.maxCargoKg)} kg on this leg; the trip would be ${Math.floor(nextKg)} kg`,
      );
    }
  };

  const dropLot = (missionId: string, lotId: string) => {
    const mission = state.missions.find((row) => row.id === missionId);
    if (!mission) return;
    const lot = mission.lots.find((row) => row.shipmentLotId === lotId);
    if (!lot || Math.floor(lot.cargoKg) <= 0) return;
    if (mission.id === hostId && mission.lots.length === 1) {
      throw new Error('The first contract stays on this flight');
    }
    if (mission.lots.length === 1) {
      const cancelled = cancelMission(world, mission, { fleet: state });
      state.missions = state.missions.map((row) =>
        row.id === cancelled.id ? cancelled : row,
      );
      return;
    }
    restoreDeskCargoLines(world, state, mission, [lot]);
    const next = recomputeMissionTotals({
      ...mission,
      lots: mission.lots.filter((row) => row.shipmentLotId !== lotId),
      status: 'accepted',
      lastOfpCheck: undefined,
      lastPreflightCheck: undefined,
      fuelAuthorizedOfpId: undefined,
      tripFuelBurnKg: undefined,
      dispatchedAtTick: undefined,
    });
    state.missions = state.missions.map((row) => (row.id === next.id ? next : row));
    syncPlayerInbound(world, next);
  };

  const resizeLot = (missionId: string, lotId: string, newKg: number) => {
    const mission = state.missions.find((row) => row.id === missionId);
    if (!mission) return;
    const lot = mission.lots.find((row) => row.shipmentLotId === lotId);
    if (!lot) return;
    const oldKg = Math.max(0, Math.floor(lot.cargoKg));
    if (oldKg === newKg) return;
    const delta = newKg - oldKg;
    assertTripRoom(delta);
    if (mission.lots.length === 1) {
      if (
        mission.demandOrderId &&
        !mission.warehouseHaul &&
        !mission.warehouseBridge
      ) {
        replaceDemandMissionCargo(state, world, mission, {
          cargoKg: newKg,
          maxCargoKg: opts.maxCargoKg,
        });
      } else {
        replaceWarehouseDeskMissionCargo(state, world, mission, {
          cargoKg: newKg,
          maxCargoKg: opts.maxCargoKg,
        });
      }
      return;
    }
    let avg = lot.avgCostUsdPerKg ?? mission.warehouseAvgCostUsdPerKg ?? 0;
    if (delta < 0) {
      restoreDeskCargoLines(world, state, mission, [{ ...lot, cargoKg: -delta }]);
    } else if (
      mission.demandOrderId &&
      !mission.warehouseHaul &&
      !mission.warehouseBridge
    ) {
      const orderId = lot.demandOrderId?.trim() || mission.demandOrderId;
      const order = world.demandOrders?.find((row) => row.id === orderId);
      if (!order || order.remainingKg < delta) {
        throw new Error('Not enough left on that demand order');
      }
      order.remainingKg -= delta;
    } else {
      const withdrawn = withdrawCargoFromWarehouse(state, {
        icao: mission.originIcao,
        commodityId: lot.commodityId,
        kg: delta,
      });
      avg =
        newKg > 0
          ? Math.round(((avg * oldKg + withdrawn.avgCostUsdPerKg * delta) / newKg) * 100) /
            100
          : avg;
    }
    const payUsd = oldKg > 0 ? Math.round((lot.payUsd * newKg) / oldKg) : lot.payUsd;
    const next = recomputeMissionTotals({
      ...mission,
      lots: mission.lots.map((row) =>
        row.shipmentLotId === lotId
          ? { ...row, cargoKg: newKg, payUsd, avgCostUsdPerKg: avg }
          : row,
      ),
      status: 'accepted',
      warehouseAvgCostUsdPerKg: avg,
      lastOfpCheck: undefined,
      lastPreflightCheck: undefined,
      fuelAuthorizedOfpId: undefined,
      tripFuelBurnKg: undefined,
      dispatchedAtTick: undefined,
    });
    state.missions = state.missions.map((row) => (row.id === next.id ? next : row));
    syncPlayerInbound(world, next);
  };

  const ordered = [...parsed].sort((a, b) => {
    const aOld = locate(a.lotId)?.lot.cargoKg ?? 0;
    const bOld = locate(b.lotId)?.lot.cargoKg ?? 0;
    return a.cargoKg - aOld - (b.cargoKg - bOld);
  });
  let changed = false;
  for (const line of ordered) {
    const found = locate(line.lotId);
    if (!found) continue;
    const oldKg = Math.max(0, Math.floor(found.lot.cargoKg));
    const nextKg = Math.max(0, line.cargoKg);
    if (nextKg === oldKg) continue;
    changed = true;
    if (nextKg <= 0) dropLot(found.mission.id, line.lotId);
    else resizeLot(found.mission.id, line.lotId, nextKg);
    refreshHostThroughLoads(state, hostId);
  }
  const current = refreshHostThroughLoads(state, hostId);
  if (!changed) return current;
  const next: MissionIntent = {
    ...current,
    status: 'accepted',
    lastOfpCheck: undefined,
    lastPreflightCheck: undefined,
    fuelAuthorizedOfpId: undefined,
    tripFuelBurnKg: undefined,
    dispatchedAtTick: undefined,
  };
  state.missions = state.missions.map((row) => (row.id === hostId ? next : row));
  return next;
}
