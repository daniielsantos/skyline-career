/**
 * Company warehouse→warehouse air reposition.
 * Unpaid bridge (payUsd 0) or Internal Haul (company→pilot fee on settle).
 */

import { cargoOpsIsUnlocked } from './career-cargo-ops.js';
import { TICKS_PER_HOUR } from './career-clock.js';
import { getCommodity, routeDistanceNm } from './career-economy.js';
import {
  demandHoldTtlTicks,
  demandRouteMaxCargoKg,
  expireDemandHolds,
  listDemandHolds,
} from './career-demand.js';
import { hubDistanceNm } from './career-ferry-route.js';
import { assignAircraftToMission, findPlayerAircraft } from './career-fleet.js';
import { isBushHub, isBushTripOnlyHub } from './career-bush.js';
import {
  getAircraftClass,
  listActivePlayerMissions,
  recomputeMissionTotals,
  syncPlayerInbound,
} from './career-mission.js';
import { findCareerPlayerAirframe } from './career-player-airframes.js';
import { careerPortIdForPickupHub } from './career-ports.js';
import {
  findPlayerWarehouseAtIcao,
  warehouseBridgeDestRoomKg,
  warehouseFreeCommodityKg,
  withdrawCargoFromWarehouse,
} from './career-warehouse-stock.js';
import type {
  CareerEconomyWorld,
  CareerMissionsState,
  CommodityId,
  MissionIntent,
  PlayerDemandHold,
} from './types/career-economy.js';

/** Floor pilot fee for Internal Haul. */
export const INTERNAL_HAUL_PAY_MIN_USD = 75;

/** $/kg component of suggested Internal Haul pay. */
export const INTERNAL_HAUL_PAY_USD_PER_KG = 0.08;

/** $/nm component of suggested Internal Haul pay. */
export const INTERNAL_HAUL_PAY_USD_PER_NM = 0.45;

/** Dispatcher may set pay within this band of the suggest. */
export const INTERNAL_HAUL_PAY_BAND_MIN = 0.8;
export const INTERNAL_HAUL_PAY_BAND_MAX = 1.5;

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function nextId(prefix: string, tick: number): string {
  return `${prefix}_${tick}_${Math.floor(Math.random() * 1e6)}`;
}

function bridgeDistanceNm(
  world: CareerEconomyWorld,
  from: string,
  to: string,
): number {
  return hubDistanceNm(from, to) ?? routeDistanceNm(world, from, to) ?? 0;
}

export function quoteInternalHaulPayUsd(opts: {
  kg: number;
  distanceNm: number;
}): number {
  const kg = Math.max(0, opts.kg);
  const nm = Math.max(0, opts.distanceNm);
  return money(
    Math.max(
      INTERNAL_HAUL_PAY_MIN_USD,
      kg * INTERNAL_HAUL_PAY_USD_PER_KG + nm * INTERNAL_HAUL_PAY_USD_PER_NM,
    ),
  );
}

/** Clamp requested pay into 80–150% of suggested (or suggest when omitted). */
export function clampInternalHaulPayUsd(
  suggestedUsd: number,
  requestedUsd?: number | null,
): number {
  const suggested = money(Math.max(0, suggestedUsd));
  if (requestedUsd == null || !Number.isFinite(requestedUsd)) {
    return suggested;
  }
  const req = money(Math.max(0, requestedUsd));
  if (suggested <= 0) return 0;
  const min = money(suggested * INTERNAL_HAUL_PAY_BAND_MIN);
  const max = money(suggested * INTERNAL_HAUL_PAY_BAND_MAX);
  return money(Math.min(max, Math.max(min, req)));
}

export function quoteInternalHaulForRoute(
  world: CareerEconomyWorld,
  opts: { originIcao: string; destIcao: string; kg: number },
): {
  distanceNm: number;
  suggestedPayUsd: number;
  minPayUsd: number;
  maxPayUsd: number;
} {
  const origin = opts.originIcao.trim().toUpperCase();
  const dest = opts.destIcao.trim().toUpperCase();
  const kg = Math.max(0, Math.floor(opts.kg));
  const distanceNm = Math.round(bridgeDistanceNm(world, origin, dest) * 10) / 10;
  const suggestedPayUsd = quoteInternalHaulPayUsd({ kg, distanceNm });
  return {
    distanceNm,
    suggestedPayUsd,
    minPayUsd: money(suggestedPayUsd * INTERNAL_HAUL_PAY_BAND_MIN),
    maxPayUsd: money(suggestedPayUsd * INTERNAL_HAUL_PAY_BAND_MAX),
  };
}

function resolveBridgePilotPayUsd(
  world: CareerEconomyWorld,
  opts: {
    originIcao: string;
    destIcao: string;
    kg: number;
    /** Omit = suggest; explicit 0 = unpaid bridge. */
    pilotPayUsd?: number | null;
  },
): { pilotPayUsd: number; internalHaul: boolean; unitPriceUsd: number } {
  const distanceNm = bridgeDistanceNm(
    world,
    opts.originIcao,
    opts.destIcao,
  );
  const suggested = quoteInternalHaulPayUsd({
    kg: opts.kg,
    distanceNm,
  });
  if (opts.pilotPayUsd === 0) {
    return { pilotPayUsd: 0, internalHaul: false, unitPriceUsd: 0 };
  }
  const pilotPayUsd = clampInternalHaulPayUsd(
    suggested,
    opts.pilotPayUsd ?? suggested,
  );
  const internalHaul = pilotPayUsd > 0;
  const unitPriceUsd =
    opts.kg > 0 && pilotPayUsd > 0 ? money(pilotPayUsd / opts.kg) : 0;
  return { pilotPayUsd, internalHaul, unitPriceUsd };
}

function clampBridgeKg(
  state: CareerMissionsState,
  originIcao: string,
  destWarehouseId: string,
  commodityId: CommodityId,
  requested?: number,
  excludeHoldId?: string,
): number {
  const stockAvail = warehouseFreeCommodityKg(state, originIcao, commodityId);
  const destRoom = warehouseBridgeDestRoomKg(
    state,
    destWarehouseId,
    excludeHoldId,
  );
  let kg = Math.max(
    0,
    Math.floor(requested ?? Math.min(stockAvail, destRoom)),
  );
  return Math.min(kg, stockAvail, destRoom);
}

function assertBridgeRoute(
  state: CareerMissionsState,
  origin: string,
  dest: string,
): {
  originWh: NonNullable<ReturnType<typeof findPlayerWarehouseAtIcao>>;
  destWh: NonNullable<ReturnType<typeof findPlayerWarehouseAtIcao>>;
} {
  if (origin === dest) {
    throw new Error('Bridge origin and destination warehouses must differ');
  }
  if (isBushHub(dest) || isBushTripOnlyHub(dest)) {
    throw new Error(
      `Cannot bridge to bush strip ${dest} — SimBrief Dispatch needs a civil hub`,
    );
  }
  const originWh = findPlayerWarehouseAtIcao(state, origin);
  if (!originWh) throw new Error(`No warehouse at ${origin}`);
  const destWh = findPlayerWarehouseAtIcao(state, dest);
  if (!destWh) throw new Error(`No warehouse at ${dest}`);
  return { originWh, destWh };
}

export function holdWarehouseBridge(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    originIcao: string;
    destIcao: string;
    commodityId: CommodityId;
    kg?: number;
    /** Omit = suggest Internal Haul pay; 0 = unpaid bridge. */
    pilotPayUsd?: number | null;
  },
): { hold: PlayerDemandHold; kg: number; pilotPayUsd: number } {
  expireDemandHolds(state, world);
  if (!cargoOpsIsUnlocked(state.cargoOps, opts.commodityId)) {
    const name = getCommodity(opts.commodityId).name;
    throw new Error(
      `Cargo Ops: ${name} is locked — unlock it in Hangar → Cargo Ops`,
    );
  }
  const origin = opts.originIcao.trim().toUpperCase();
  const dest = opts.destIcao.trim().toUpperCase();
  const { originWh, destWh } = assertBridgeRoute(state, origin, dest);
  const holds = listDemandHolds(state);
  if (
    holds.some(
      (h) =>
        (h.kind ?? 'demand') === 'bridge' &&
        h.warehouseId === originWh.id &&
        h.destWarehouseId === destWh.id &&
        h.commodityId === opts.commodityId,
    )
  ) {
    throw new Error(
      `Already holding a bridge of ${opts.commodityId} from ${origin} to ${dest}`,
    );
  }
  const kg = clampBridgeKg(state, origin, destWh.id, opts.commodityId, opts.kg);
  if (kg <= 0) {
    throw new Error(
      `No free ${opts.commodityId} at ${origin}, or no room at ${dest}`,
    );
  }
  const pay = resolveBridgePilotPayUsd(world, {
    originIcao: origin,
    destIcao: dest,
    kg,
    pilotPayUsd: opts.pilotPayUsd,
  });
  const ttl = demandHoldTtlTicks(originWh.tier);
  const hold: PlayerDemandHold = {
    id: nextId('bhold', world.tick),
    kind: 'bridge',
    warehouseId: originWh.id,
    destWarehouseId: destWh.id,
    originIcao: origin,
    destIcao: dest,
    commodityId: opts.commodityId,
    kg,
    unitPriceUsd: pay.unitPriceUsd,
    pilotPayUsd: pay.pilotPayUsd,
    heldAtTick: world.tick,
    expiresAtTick: world.tick + ttl,
  };
  holds.push(hold);
  state.playerWarehouses!.demandHolds = holds;
  return { hold, kg, pilotPayUsd: pay.pilotPayUsd };
}

export function cancelWarehouseBridgeHold(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { holdId: string },
): { kg: number } {
  expireDemandHolds(state, world);
  const holds = listDemandHolds(state);
  const idx = holds.findIndex((h) => h.id === opts.holdId.trim());
  if (idx < 0) throw new Error('Bridge hold not found');
  const hold = holds[idx]!;
  if ((hold.kind ?? 'demand') !== 'bridge') {
    throw new Error('Not a warehouse bridge hold');
  }
  holds.splice(idx, 1);
  state.playerWarehouses!.demandHolds = holds;
  return { kg: hold.kg };
}

function createBridgeMission(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    origin: string;
    dest: string;
    commodityId: CommodityId;
    kg: number;
    pilotPayUsd: number;
    internalHaul: boolean;
    aircraft: {
      id: string;
      aircraftClassId: MissionIntent['aircraftClassId'];
      airframeTypeId: string;
    };
    warehouseId: string;
    destWarehouseId: string;
    destPortId: string;
    avgCostUsdPerKg: number;
  },
): MissionIntent {
  const classDef = getAircraftClass(opts.aircraft.aircraftClassId);
  const airframe = findCareerPlayerAirframe(opts.aircraft.airframeTypeId);
  const deadlineTick = world.tick + TICKS_PER_HOUR * 72;
  const lotId = `whbridge_${opts.origin}_${opts.dest}_${opts.kg}`;
  const payUsd = opts.internalHaul ? money(opts.pilotPayUsd) : 0;
  const sizeNote = opts.internalHaul ? ' · Internal haul' : '';
  const mission = recomputeMissionTotals({
    id: `msn_bridge_${world.tick}_${opts.origin}_${opts.dest}_${Math.floor(Math.random() * 1e6)}`,
    lots: [
      {
        shipmentLotId: lotId,
        commodityId: opts.commodityId,
        cargoKg: opts.kg,
        payUsd,
        urgency: 'normal',
        reason: `WH bridge${sizeNote} · ${getCommodity(opts.commodityId).name} → ${opts.dest}`,
        deadlineTick,
      },
    ],
    shipmentLotId: lotId,
    commodityId: opts.commodityId,
    originIcao: opts.origin,
    destIcao: opts.dest,
    cargoKg: opts.kg,
    pax: 0,
    aircraftClassId: opts.aircraft.aircraftClassId,
    airframeTypeId: opts.aircraft.airframeTypeId,
    rolesPackRelPath:
      airframe?.rolesPackRelPath ?? classDef.rolesPackRelPath,
    deadlineTick,
    payUsd,
    urgency: 'normal',
    reason: opts.internalHaul
      ? `Internal haul · ${opts.origin}→${opts.dest}`
      : `Warehouse bridge · ${opts.origin}→${opts.dest}`,
    status: 'accepted',
    acceptedAtTick: world.tick,
    aircraftId: opts.aircraft.id,
    warehouseBridge: true,
    internalHaul: opts.internalHaul || undefined,
    destWarehouseId: opts.destWarehouseId,
    warehouseId: opts.warehouseId,
    warehouseAvgCostUsdPerKg: opts.avgCostUsdPerKg,
    portId: opts.destPortId,
    distanceNm: Math.round(
      bridgeDistanceNm(world, opts.origin, opts.dest),
    ),
  });
  assignAircraftToMission(state, opts.aircraft.id, mission.id, opts.origin);
  state.missions = [...(state.missions ?? []), mission];
  syncPlayerInbound(world, mission);
  return mission;
}

function parkedAircraftAt(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  aircraftId: string,
  origin: string,
  dest: string,
  kg: number,
) {
  const open = listActivePlayerMissions(state.missions ?? []);
  if (open.length > 0) {
    throw new Error(
      `Finish or cancel ${open[0]!.id} before starting a warehouse bridge`,
    );
  }
  const aircraft = findPlayerAircraft(state, aircraftId);
  if (!aircraft) throw new Error(`Unknown aircraft ${aircraftId}`);
  const airframeTypeId = aircraft.airframeTypeId;
  if (!airframeTypeId) {
    throw new Error(`Aircraft ${aircraft.id} has no airframe`);
  }
  if (aircraft.status !== 'parked') {
    throw new Error(`Aircraft ${aircraft.id} is not parked`);
  }
  if (aircraft.locationIcao.trim().toUpperCase() !== origin) {
    throw new Error(
      `Aircraft is at ${aircraft.locationIcao}, not warehouse hub ${origin}`,
    );
  }
  const dispatchAircraft = {
    id: aircraft.id,
    aircraftClassId: aircraft.aircraftClassId,
    airframeTypeId,
  };
  const maxCargoKg = demandRouteMaxCargoKg(world, dispatchAircraft, origin, dest);
  if (kg > maxCargoKg) {
    throw new Error(
      `Bridge ${kg} kg exceeds this airframe's ${maxCargoKg} kg ops cap for ${origin}→${dest}`,
    );
  }
  return dispatchAircraft;
}

export function acceptWarehouseBridge(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    originIcao: string;
    destIcao: string;
    commodityId: CommodityId;
    aircraftId: string;
    kg?: number;
    pilotPayUsd?: number | null;
  },
): { mission: MissionIntent; kg: number; pilotPayUsd: number } {
  expireDemandHolds(state, world);
  if (!cargoOpsIsUnlocked(state.cargoOps, opts.commodityId)) {
    const name = getCommodity(opts.commodityId).name;
    throw new Error(
      `Cargo Ops: ${name} is locked — unlock it in Hangar → Cargo Ops`,
    );
  }
  const origin = opts.originIcao.trim().toUpperCase();
  const dest = opts.destIcao.trim().toUpperCase();
  const { destWh } = assertBridgeRoute(state, origin, dest);
  const kg = clampBridgeKg(state, origin, destWh.id, opts.commodityId, opts.kg);
  if (kg <= 0) {
    throw new Error(
      `No free ${opts.commodityId} at ${origin}, or no room at ${dest}`,
    );
  }
  const pay = resolveBridgePilotPayUsd(world, {
    originIcao: origin,
    destIcao: dest,
    kg,
    pilotPayUsd: opts.pilotPayUsd,
  });
  const aircraft = parkedAircraftAt(
    state,
    world,
    opts.aircraftId,
    origin,
    dest,
    kg,
  );
  const withdrawn = withdrawCargoFromWarehouse(state, {
    icao: origin,
    commodityId: opts.commodityId,
    kg,
  });
  const destPortId = careerPortIdForPickupHub(dest) ?? dest;
  const mission = createBridgeMission(state, world, {
    origin,
    dest,
    commodityId: opts.commodityId,
    kg,
    pilotPayUsd: pay.pilotPayUsd,
    internalHaul: pay.internalHaul,
    aircraft,
    warehouseId: withdrawn.warehouseId,
    destWarehouseId: destWh.id,
    destPortId,
    avgCostUsdPerKg: withdrawn.avgCostUsdPerKg,
  });
  return { mission, kg, pilotPayUsd: pay.pilotPayUsd };
}

export function dispatchWarehouseBridgeHold(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    holdId: string;
    aircraftId: string;
    /** Override hold pay; omit keeps hold; 0 forces unpaid. */
    pilotPayUsd?: number | null;
  },
): { mission: MissionIntent; kg: number; pilotPayUsd: number } {
  expireDemandHolds(state, world);
  const holds = listDemandHolds(state);
  const idx = holds.findIndex((h) => h.id === opts.holdId.trim());
  if (idx < 0) throw new Error('Bridge hold not found');
  const hold = holds[idx]!;
  if ((hold.kind ?? 'demand') !== 'bridge' || !hold.destWarehouseId) {
    throw new Error('Not a warehouse bridge hold');
  }
  const aircraft = parkedAircraftAt(
    state,
    world,
    opts.aircraftId,
    hold.originIcao,
    hold.destIcao,
    hold.kg,
  );
  const withdrawn = withdrawCargoFromWarehouse(state, {
    icao: hold.originIcao,
    commodityId: hold.commodityId,
    kg: hold.kg,
  });
  holds.splice(idx, 1);
  state.playerWarehouses!.demandHolds = holds;
  const destPortId = careerPortIdForPickupHub(hold.destIcao) ?? hold.destIcao;
  const holdPay =
    hold.pilotPayUsd != null
      ? hold.pilotPayUsd
      : hold.unitPriceUsd > 0
        ? money(hold.unitPriceUsd * hold.kg)
        : undefined;
  const pay = resolveBridgePilotPayUsd(world, {
    originIcao: hold.originIcao,
    destIcao: hold.destIcao,
    kg: hold.kg,
    pilotPayUsd:
      opts.pilotPayUsd !== undefined ? opts.pilotPayUsd : holdPay ?? 0,
  });
  // Legacy holds without pilotPayUsd/unitPrice: unpaid bridge (preserve tests).
  const legacyUnpaid =
    opts.pilotPayUsd === undefined &&
    hold.pilotPayUsd == null &&
    !(hold.unitPriceUsd > 0);
  const pilotPayUsd = legacyUnpaid ? 0 : pay.pilotPayUsd;
  const internalHaul = !legacyUnpaid && pay.internalHaul;
  const mission = createBridgeMission(state, world, {
    origin: hold.originIcao,
    dest: hold.destIcao,
    commodityId: hold.commodityId,
    kg: hold.kg,
    pilotPayUsd,
    internalHaul,
    aircraft,
    warehouseId: withdrawn.warehouseId,
    destWarehouseId: hold.destWarehouseId,
    destPortId,
    avgCostUsdPerKg: withdrawn.avgCostUsdPerKg,
  });
  return { mission, kg: hold.kg, pilotPayUsd };
}
