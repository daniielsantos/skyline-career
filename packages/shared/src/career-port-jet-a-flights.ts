/**
 * Player flights that move Jet-A: unpaid stocking into the Port FBO tank,
 * and the rare paid Demand haul. Payload stays empty so the sim load plan
 * is the flight, not a cargo station full of fuel.
 */

import { routeDistanceNm } from './career-economy.js';
import {
  assignAircraftToMission,
  releaseAircraftOnCancel,
} from './career-fleet.js';
import {
  getAircraftClass,
  syncPlayerInbound,
} from './career-mission.js';
import { findCareerPlayerAirframe } from './career-player-airframes.js';
import {
  bookJetAAtAirport,
  portJetATankCapacityKg,
  portJetATripCeilingKg,
} from './career-port-jet-a.js';
import { portPickupHubsBound } from './career-port-corridor.js';
import type {
  CareerEconomyWorld,
  CareerMissionsState,
  MissionIntent,
  PlayerPortConcession,
} from './types/career-economy.js';

function nextMissionId(tick: number): string {
  return `jeta_${tick}_${Math.floor(Math.random() * 1e9)}`;
}

function activeConcession(
  state: CareerMissionsState,
  tick: number,
  portId: string,
  companyId?: string,
): PlayerPortConcession | undefined {
  const id = portId.trim().toUpperCase();
  return (state.playerPortConcessions ?? []).find(
    (c) =>
      c.portId.trim().toUpperCase() === id &&
      c.leasePaidThroughTick > tick &&
      (!companyId || c.companyId === companyId),
  );
}

function pilotFields(opts: {
  pilotAccountId?: string;
  pilotHomeCompanyId?: string;
  vaFlight?: boolean;
}): Pick<MissionIntent, 'pilotAccountId' | 'pilotHomeCompanyId' | 'vaFlight'> {
  const pilotAccountId = opts.pilotAccountId?.trim();
  const pilotHomeCompanyId = opts.pilotHomeCompanyId?.trim();
  return {
    ...(pilotAccountId ? { pilotAccountId } : {}),
    ...(pilotHomeCompanyId ? { pilotHomeCompanyId } : {}),
    ...(opts.vaFlight ? { vaFlight: true as const } : {}),
  };
}

function commitFuelMission(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  mission: MissionIntent,
): MissionIntent {
  state.missions = [...(state.missions ?? []), mission];
  syncPlayerInbound(world, mission);
  return mission;
}

export function startPortJetAReposition(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    portId: string;
    originIcao: string;
    aircraftId: string;
    kg?: number;
    companyId?: string;
    pilotAccountId?: string;
    pilotHomeCompanyId?: string;
    vaFlight?: boolean;
    actorAccountId?: string | null;
    actorIsVaOwner?: boolean;
  },
): { mission: MissionIntent; kg: number; costUsd: number } {
  const conc = activeConcession(
    state,
    world.tick,
    opts.portId,
    opts.companyId,
  );
  if (!conc) throw new Error('No active Port FBO on this port');
  const dest = portPickupHubsBound(conc.portId)[0]?.trim().toUpperCase();
  if (!dest) throw new Error('This port has no pickup airport');
  const origin = opts.originIcao.trim().toUpperCase();
  if (origin === dest) {
    throw new Error('Buy Jet-A at the port airport instead of ferrying it there');
  }
  const level = conc.level === 2 || conc.level === 3 ? conc.level : 1;
  const room = Math.max(
    0,
    portJetATankCapacityKg(level) - Math.floor(conc.jetAKg ?? 0),
  );
  if (room <= 0) throw new Error('Port FBO Jet-A tank is full');
  const cap = Math.min(room, portJetATripCeilingKg(level));
  const kg = Math.min(
    cap,
    Math.max(0, Math.floor(opts.kg ?? cap)),
  );
  if (kg <= 0) throw new Error('Nothing to fetch — the tank is full');
  const aircraft = state.fleet.find((a) => a.id === opts.aircraftId);
  if (!aircraft) throw new Error(`Unknown aircraft ${opts.aircraftId}`);
  const classDef = getAircraftClass(aircraft.aircraftClassId);
  const airframe = findCareerPlayerAirframe(aircraft.airframeTypeId);
  const deadlineTick = world.tick + 96 * 3;
  const id = nextMissionId(world.tick);
  assignAircraftToMission(state, aircraft.id, id, origin, {
    actorAccountId: opts.actorAccountId,
    actorIsVaOwner: opts.actorIsVaOwner,
  });
  let booked;
  try {
    booked = bookJetAAtAirport(state, world, {
      originIcao: origin,
      kg,
      note: `Jet-A stock · ${origin} → ${dest}`,
    });
  } catch (error) {
    releaseAircraftOnCancel(state, {
      id,
      aircraftId: aircraft.id,
      originIcao: origin,
    } as MissionIntent);
    throw error;
  }
  const reason = `Jet-A stock · ${origin} → ${dest} · ${kg} kg`;
  const mission: MissionIntent = {
    id,
    missionType: 'freight',
    lots: [
      {
        shipmentLotId: `jeta_${id}`,
        commodityId: 'fuel',
        cargoKg: 0,
        payUsd: 0,
        urgency: 'normal',
        reason,
        deadlineTick,
      },
    ],
    shipmentLotId: `jeta_${id}`,
    commodityId: 'fuel',
    originIcao: origin,
    destIcao: dest,
    cargoKg: 0,
    pax: 0,
    aircraftClassId: aircraft.aircraftClassId,
    airframeTypeId: aircraft.airframeTypeId,
    rolesPackRelPath:
      airframe?.rolesPackRelPath ?? classDef.rolesPackRelPath,
    deadlineTick,
    payUsd: 0,
    urgency: 'normal',
    reason,
    status: 'accepted',
    acceptedAtTick: world.tick,
    aircraftId: aircraft.id,
    distanceNm: Math.round(routeDistanceNm(world, origin, dest) ?? 0),
    fuelHaul: {
      kind: 'reposition',
      portId: conc.portId,
      kg,
      fromTankKg: booked.fromTankKg,
      boughtKg: booked.boughtKg,
      boughtUsd: booked.boughtUsd,
    },
    ...pilotFields(opts),
  };
  commitFuelMission(state, world, mission);
  return { mission, kg, costUsd: booked.boughtUsd };
}

export function acceptPortJetAHaul(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    orderId: string;
    aircraftId: string;
    companyId?: string;
    pilotAccountId?: string;
    pilotHomeCompanyId?: string;
    vaFlight?: boolean;
    actorAccountId?: string | null;
    actorIsVaOwner?: boolean;
  },
): { mission: MissionIntent; kg: number; payUsd: number; fuelCostUsd: number } {
  const order = (world.demandOrders ?? []).find(
    (o) => o.id === opts.orderId.trim(),
  );
  if (!order || order.commodityId !== 'fuel' || !order.fuelHaul) {
    throw new Error('Jet-A haul is not on the desk');
  }
  if (order.status !== 'open' || order.remainingKg <= 0) {
    throw new Error('Jet-A haul is no longer open');
  }
  if (order.expiresAtTick <= world.tick) {
    order.status = 'expired';
    throw new Error('Jet-A haul expired');
  }
  const origin = order.fuelHaul.pickupIcao.trim().toUpperCase();
  const dest = order.destIcao.trim().toUpperCase();
  const kg = Math.floor(order.remainingKg);
  const nm = routeDistanceNm(world, origin, dest) ?? 0;
  const payUsd = Math.round(kg * order.maxUnitPriceUsd);
  const aircraft = state.fleet.find((a) => a.id === opts.aircraftId);
  if (!aircraft) throw new Error(`Unknown aircraft ${opts.aircraftId}`);
  const classDef = getAircraftClass(aircraft.aircraftClassId);
  const airframe = findCareerPlayerAirframe(aircraft.airframeTypeId);
  const deadlineTick = world.tick + 96 * 3;
  const id = nextMissionId(world.tick);
  assignAircraftToMission(state, aircraft.id, id, origin, {
    actorAccountId: opts.actorAccountId,
    actorIsVaOwner: opts.actorIsVaOwner,
  });
  let booked;
  try {
    booked = bookJetAAtAirport(state, world, {
      originIcao: origin,
      kg,
      note: `Jet-A haul · ${origin} → ${dest}`,
    });
  } catch (error) {
    releaseAircraftOnCancel(state, {
      id,
      aircraftId: aircraft.id,
      originIcao: origin,
    } as MissionIntent);
    throw error;
  }
  order.remainingKg = 0;
  order.status = 'filled';
  const reason = `Jet-A haul · ${origin} → ${dest} · ${kg} kg`;
  const mission: MissionIntent = {
    id,
    missionType: 'freight',
    lots: [
      {
        shipmentLotId: `jeta_${id}`,
        commodityId: 'fuel',
        cargoKg: 0,
        payUsd,
        urgency: 'normal',
        reason,
        deadlineTick,
      },
    ],
    shipmentLotId: `jeta_${id}`,
    commodityId: 'fuel',
    originIcao: origin,
    destIcao: dest,
    cargoKg: 0,
    pax: 0,
    aircraftClassId: aircraft.aircraftClassId,
    airframeTypeId: aircraft.airframeTypeId,
    rolesPackRelPath:
      airframe?.rolesPackRelPath ?? classDef.rolesPackRelPath,
    deadlineTick,
    payUsd,
    urgency: 'normal',
    reason,
    status: 'accepted',
    acceptedAtTick: world.tick,
    aircraftId: aircraft.id,
    demandOrderId: order.id,
    distanceNm: Math.round(nm),
    fuelHaul: {
      kind: 'demand',
      portId: order.portId ?? '',
      kg,
      fromTankKg: booked.fromTankKg,
      boughtKg: booked.boughtKg,
      boughtUsd: booked.boughtUsd,
      orderId: order.id,
    },
    ...pilotFields(opts),
  };
  try {
    commitFuelMission(state, world, mission);
  } catch (error) {
    order.remainingKg = kg;
    order.status = 'open';
    throw error;
  }
  return { mission, kg, payUsd, fuelCostUsd: booked.boughtUsd };
}
