/**
 * Player flights that move Jet-A as cargo in the hold.
 * Stock opens the flight unpaid. The manifest load button buys the Jet-A once.
 * Demand hauls pay the transport fee only. The fuel itself is bought at accept.
 * The hauled kg is the sim payload (manifest, OFP, cargo stations).
 * Wing tanks stay the trip fuel. Settle still credits fuelHaul.kg.
 */

import { TICKS_PER_DAY } from './career-clock.js';
import { airportByIcao, routeDistanceNm } from './career-economy.js';
import {
  assignAircraftToMission,
  releaseAircraftOnCancel,
} from './career-fleet.js';
import { fuelTerminalSellableKg } from './career-fuel.js';
import {
  estimateRouteCargoLimit,
  getAircraftClass,
  resolveConservativeOpsWeights,
  syncPlayerInbound,
} from './career-mission.js';
import { findCareerPlayerAirframe } from './career-player-airframes.js';
import {
  bookJetAAtAirport,
  portJetATankCapacityKg,
  releaseBookedJetA,
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

/** Kg this airframe can put in the hold on the leg, after trip fuel and crew. */
function jetAHoldKg(
  world: CareerEconomyWorld,
  aircraft: {
    aircraftClassId: MissionIntent['aircraftClassId'];
    airframeTypeId?: string;
  },
  origin: string,
  dest: string,
): number {
  const airframeTypeId = aircraft.airframeTypeId?.trim();
  if (!airframeTypeId) {
    throw new Error('This aircraft has no airframe for a Jet-A cargo load');
  }
  const classDef = getAircraftClass(aircraft.aircraftClassId);
  const airframe = findCareerPlayerAirframe(airframeTypeId);
  const structuralMax =
    (typeof airframe?.maxCargoKg === 'number' && airframe.maxCargoKg > 0
      ? airframe.maxCargoKg
      : undefined) ?? classDef.maxCargoKg;
  const distanceNm = routeDistanceNm(world, origin, dest);
  if (distanceNm == null || !(distanceNm >= 0)) {
    return Math.max(0, Math.floor(structuralMax));
  }
  const opsWeights = resolveConservativeOpsWeights({
    oewKg: airframe?.oewKg,
    mtowKg: airframe?.mtowKg,
    catalogOewKg: airframe?.oewKg,
    catalogMtowKg: airframe?.mtowKg,
  });
  const routeLimit = estimateRouteCargoLimit(
    aircraft.aircraftClassId,
    distanceNm,
    structuralMax,
    {
      oewKg: opsWeights.oewKg,
      mtowKg: opsWeights.mtowKg,
      fuelCapacityKg: airframe?.fuelCapacityKg,
      fuelBurnKgPerNm: airframe?.fuelBurnKgPerNm,
      airframeTypeId,
      crewKg: opsWeights.crewKg,
    },
  );
  if (!routeLimit.fuelFeasible) {
    throw new Error(
      `Estimated block fuel ${routeLimit.estimatedBlockFuelKg} kg exceeds ` +
        `tank capacity ${routeLimit.fuelCapacityKg} kg for ${origin}→${dest}`,
    );
  }
  return Math.max(0, Math.floor(routeLimit.operationalMaxCargoKg));
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
): { mission: MissionIntent; kg: number; maxKg: number; costUsd: number } {
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
  const aircraft = state.fleet.find((a) => a.id === opts.aircraftId);
  if (!aircraft) throw new Error(`Unknown aircraft ${opts.aircraftId}`);
  const liftKg = jetAHoldKg(world, aircraft, origin, dest);
  const available = jetAAvailableAtOriginKg(state, world, origin);
  const maxKg = Math.max(0, Math.min(room, liftKg, available));
  if (maxKg <= 0) {
    throw new Error(
      available <= 0
        ? `Not enough Jet-A at ${origin}`
        : `This aircraft cannot carry Jet-A as cargo on ${origin}→${dest}`,
    );
  }
  const classDef = getAircraftClass(aircraft.aircraftClassId);
  const airframe = findCareerPlayerAirframe(aircraft.airframeTypeId);
  const deadlineTick = world.tick + TICKS_PER_DAY * 3;
  const id = nextMissionId(world.tick);
  assignAircraftToMission(state, aircraft.id, id, origin, {
    actorAccountId: opts.actorAccountId,
    actorIsVaOwner: opts.actorIsVaOwner,
  });
  const reason = `Jet-A stock · ${origin} → ${dest} · set the load`;
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
      kg: 0,
      maxKg,
      fromTankKg: 0,
      boughtKg: 0,
      boughtUsd: 0,
    },
    ...pilotFields(opts),
  };
  commitFuelMission(state, world, mission);
  return { mission, kg: 0, maxKg, costUsd: 0 };
}

/** Spot still for sale, plus any company tank parked at this airport. */
function jetAAvailableAtOriginKg(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  originIcao: string,
): number {
  const origin = originIcao.trim().toUpperCase();
  const ap = airportByIcao(world, origin);
  const sellable = ap ? fuelTerminalSellableKg(ap) : 0;
  let tank = 0;
  for (const conc of state.playerPortConcessions ?? []) {
    if (conc.leasePaidThroughTick <= world.tick) continue;
    const hubs = portPickupHubsBound(conc.portId).map((hub) =>
      hub.trim().toUpperCase(),
    );
    if (!hubs.includes(origin)) continue;
    tank += Math.max(0, Math.floor(conc.jetAKg ?? 0));
  }
  return sellable + tank;
}

function jetAStockSliderMaxKg(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  mission: MissionIntent,
  heldKg: number,
): number {
  const haul = mission.fuelHaul;
  const held = Math.max(0, Math.floor(heldKg));
  if (!haul) return held;
  const aircraft = state.fleet.find((a) => a.id === mission.aircraftId);
  const conc = activeConcession(state, world.tick, haul.portId);
  const level = conc?.level === 2 || conc?.level === 3 ? conc.level : 1;
  const room = conc
    ? Math.max(0, portJetATankCapacityKg(level) - Math.floor(conc.jetAKg ?? 0))
    : 0;
  const liftKg = aircraft
    ? jetAHoldKg(world, aircraft, mission.originIcao, mission.destIcao)
    : 0;
  const available = jetAAvailableAtOriginKg(state, world, mission.originIcao);
  const ceiling = Math.max(0, Math.min(room, liftKg, held + available));
  return Math.max(held, ceiling);
}

/** Change how much Jet-A a Stock flight is carrying. Demand hauls stay fixed. */
export function setPortJetAStockKg(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { missionId: string; kg: number },
): { mission: MissionIntent; kg: number; maxKg: number; costUsd: number } {
  const mission = state.missions.find((m) => m.id === opts.missionId);
  if (!mission) throw new Error('Flight not found');
  const haul = mission.fuelHaul;
  if (!haul || haul.kind !== 'reposition' || haul.refunded) {
    throw new Error('Only a Jet-A stock flight can change this load');
  }
  if (mission.status !== 'accepted') {
    throw new Error('Jet-A load is fixed once the flight plan is open');
  }
  const ofpVerdict = mission.lastOfpCheck?.verdict;
  if (ofpVerdict === 'pass' || ofpVerdict === 'warn' || mission.fuelAuthorizedOfpId) {
    throw new Error('Jet-A load is fixed once the flight plan is confirmed');
  }
  const current = Math.max(0, Math.floor(haul.kg));
  const maxKg = jetAStockSliderMaxKg(state, world, mission, current);
  const next = Math.max(1, Math.min(maxKg, Math.floor(opts.kg)));
  if (next === current) {
    haul.maxKg = maxKg;
    return { mission, kg: current, maxKg, costUsd: haul.boughtUsd };
  }
  const origin = mission.originIcao.trim().toUpperCase();
  const dest = mission.destIcao.trim().toUpperCase();
  if (next < current) {
    const cut = current - next;
    const cutTank = Math.min(cut, haul.fromTankKg);
    const cutBought = cut - cutTank;
    const refundUsd =
      haul.boughtKg > 0 && cutBought > 0
        ? Math.round((haul.boughtUsd * cutBought) / haul.boughtKg)
        : 0;
    releaseBookedJetA(state, world, {
      originIcao: origin,
      fromTankKg: cutTank,
      boughtKg: cutBought,
      boughtUsd: refundUsd,
      missionId: mission.id,
      note: `Jet-A stock reduced · ${origin}`,
    });
    haul.fromTankKg -= cutTank;
    haul.boughtKg -= cutBought;
    haul.boughtUsd = Math.max(0, haul.boughtUsd - refundUsd);
  } else {
    const booked = bookJetAAtAirport(state, world, {
      originIcao: origin,
      kg: next - current,
      note: `Jet-A stock · ${origin} → ${dest}`,
    });
    haul.fromTankKg += booked.fromTankKg;
    haul.boughtKg += booked.boughtKg;
    haul.boughtUsd += booked.boughtUsd;
  }
  haul.kg = next;
  haul.maxKg = maxKg;
  const reason = `Jet-A stock · ${origin} → ${dest} · ${next} kg`;
  mission.cargoKg = next;
  mission.reason = reason;
  if (mission.lots?.[0]) {
    mission.lots[0].cargoKg = next;
    mission.lots[0].reason = reason;
  }
  mission.status = 'accepted';
  mission.lastOfpCheck = undefined;
  mission.lastPreflightCheck = undefined;
  mission.fuelAuthorizedOfpId = undefined;
  return { mission, kg: next, maxKg, costUsd: haul.boughtUsd };
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
  const liftKg = jetAHoldKg(world, aircraft, origin, dest);
  if (kg > liftKg) {
    throw new Error(
      `This aircraft can carry ${liftKg} kg of cargo on ${origin}→${dest}; this Jet-A haul is ${kg} kg`,
    );
  }
  const classDef = getAircraftClass(aircraft.aircraftClassId);
  const airframe = findCareerPlayerAirframe(aircraft.airframeTypeId);
  const deadlineTick = world.tick + TICKS_PER_DAY * 3;
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
        cargoKg: kg,
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
    cargoKg: kg,
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
