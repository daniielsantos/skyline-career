/**
 * Wide / trunk haul from player warehouse → destination terminal.
 * Paid freight (Market-style quote); not Demand Board (no 8–12 t cap).
 */

import { cargoOpsIsUnlocked } from './career-cargo-ops.js';
import { TICKS_PER_HOUR } from './career-clock.js';
import {
  airportByIcao,
  getCommodity,
  isDomesticOd,
  quoteFreightLotPay,
  routeDistanceNm,
  XL_LOT_MIN_KG,
  XL_LOT_PAY_MULT,
  type CareerEconomyWorld,
} from './career-economy.js';
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
import {
  findPlayerWarehouseAtIcao,
  warehouseFreeCommodityKg,
  withdrawCargoFromWarehouse,
} from './career-warehouse-stock.js';
import type {
  CareerMissionsState,
  CommodityId,
  MissionIntent,
  PlayerDemandHold,
} from './types/career-economy.js';

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function nextId(prefix: string, tick: number): string {
  return `${prefix}_${tick}_${Math.floor(Math.random() * 1e6)}`;
}

function ensurePile(
  world: CareerEconomyWorld,
  icao: string,
  commodityId: CommodityId,
) {
  const ap = airportByIcao(world, icao);
  if (!ap) throw new Error(`Unknown hub ${icao}`);
  let pile = ap.inventory[commodityId];
  if (!pile) {
    pile = { stockKg: 0, capacityKg: 80_000 };
    ap.inventory[commodityId] = pile;
  }
  return pile;
}

export function quoteWarehouseHaulPayUsd(
  world: CareerEconomyWorld,
  opts: {
    originIcao: string;
    destIcao: string;
    commodityId: CommodityId;
    kg: number;
  },
): number {
  const origin = opts.originIcao.trim().toUpperCase();
  const dest = opts.destIcao.trim().toUpperCase();
  const kg = Math.max(0, Math.floor(opts.kg));
  if (kg <= 0) return 0;
  const originStock = ensurePile(world, origin, opts.commodityId);
  const destStock = ensurePile(world, dest, opts.commodityId);
  const distanceNm =
    hubDistanceNm(origin, dest) ?? routeDistanceNm(world, origin, dest);
  const originAp = airportByIcao(world, origin);
  const destAp = airportByIcao(world, dest);
  const international = !isDomesticOd(
    originAp?.region ?? '',
    destAp?.region ?? '',
  );
  const sizePayMult = kg >= XL_LOT_MIN_KG ? XL_LOT_PAY_MULT : 1;
  const quoted = quoteFreightLotPay({
    commodityId: opts.commodityId,
    quantityKg: kg,
    originStock,
    destStock,
    distanceNm: distanceNm ?? undefined,
    international,
    sizePayMult,
  });
  return money(quoted.payUsd);
}

function clampHaulKg(
  state: CareerMissionsState,
  originIcao: string,
  commodityId: CommodityId,
  requested?: number,
): number {
  const stockAvail = warehouseFreeCommodityKg(state, originIcao, commodityId);
  let kg = Math.max(0, Math.floor(requested ?? stockAvail));
  return Math.min(kg, stockAvail);
}

function assertHaulRoute(
  state: CareerMissionsState,
  origin: string,
  dest: string,
): NonNullable<ReturnType<typeof findPlayerWarehouseAtIcao>> {
  if (origin === dest) {
    throw new Error('Haul origin and destination must differ');
  }
  if (isBushHub(dest) || isBushTripOnlyHub(dest)) {
    throw new Error(
      `Cannot haul to bush strip ${dest} — SimBrief Dispatch needs a civil hub`,
    );
  }
  const originWh = findPlayerWarehouseAtIcao(state, origin);
  if (!originWh) throw new Error(`No warehouse at ${origin}`);
  return originWh;
}

function createHaulMission(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    origin: string;
    dest: string;
    commodityId: CommodityId;
    kg: number;
    payUsd: number;
    aircraft: {
      id: string;
      aircraftClassId: MissionIntent['aircraftClassId'];
      airframeTypeId: string;
    };
    warehouseId: string;
    avgCostUsdPerKg: number;
  },
): MissionIntent {
  const classDef = getAircraftClass(opts.aircraft.aircraftClassId);
  const airframe = findCareerPlayerAirframe(opts.aircraft.airframeTypeId);
  const distanceNm =
    hubDistanceNm(opts.origin, opts.dest) ??
    routeDistanceNm(world, opts.origin, opts.dest) ??
    0;
  const deadlineTick = world.tick + TICKS_PER_HOUR * 72;
  const lotId = `whhaul_${opts.origin}_${opts.dest}_${opts.kg}`;
  const sizeNote = opts.kg >= XL_LOT_MIN_KG ? ' · Wide' : '';
  const mission = recomputeMissionTotals({
    id: `msn_whhaul_${world.tick}_${opts.origin}_${opts.dest}_${Math.floor(Math.random() * 1e6)}`,
    lots: [
      {
        shipmentLotId: lotId,
        commodityId: opts.commodityId,
        cargoKg: opts.kg,
        payUsd: opts.payUsd,
        urgency: 'normal',
        reason: `WH haul${sizeNote} · ${getCommodity(opts.commodityId).name} → ${opts.dest}`,
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
    payUsd: opts.payUsd,
    urgency: 'normal',
    reason: `Warehouse haul · ${opts.origin}→${opts.dest}`,
    status: 'accepted',
    acceptedAtTick: world.tick,
    aircraftId: opts.aircraft.id,
    warehouseHaul: true,
    warehouseId: opts.warehouseId,
    warehouseAvgCostUsdPerKg: opts.avgCostUsdPerKg,
    distanceNm: Math.round(distanceNm),
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
      `Finish or cancel ${open[0]!.id} before starting a warehouse haul`,
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
  const maxCargoKg = demandRouteMaxCargoKg(
    world,
    dispatchAircraft,
    origin,
    dest,
  );
  if (kg > maxCargoKg) {
    throw new Error(
      `Haul ${kg} kg exceeds this airframe's ${maxCargoKg} kg ops cap for ${origin}→${dest}`,
    );
  }
  return dispatchAircraft;
}

export function holdWarehouseHaul(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    originIcao: string;
    destIcao: string;
    commodityId: CommodityId;
    kg?: number;
  },
): { hold: PlayerDemandHold; kg: number; payUsd: number } {
  expireDemandHolds(state, world);
  if (!cargoOpsIsUnlocked(state.cargoOps, opts.commodityId)) {
    const name = getCommodity(opts.commodityId).name;
    throw new Error(
      `Cargo Ops: ${name} is locked — unlock it in Hangar → Cargo Ops`,
    );
  }
  const origin = opts.originIcao.trim().toUpperCase();
  const dest = opts.destIcao.trim().toUpperCase();
  if (!airportByIcao(world, dest)) {
    throw new Error(`Unknown destination ${dest}`);
  }
  const originWh = assertHaulRoute(state, origin, dest);
  const holds = listDemandHolds(state);
  if (
    holds.some(
      (h) =>
        h.kind === 'haul' &&
        h.warehouseId === originWh.id &&
        h.destIcao === dest &&
        h.commodityId === opts.commodityId,
    )
  ) {
    throw new Error(
      `Already holding a haul of ${opts.commodityId} from ${origin} to ${dest}`,
    );
  }
  const kg = clampHaulKg(state, origin, opts.commodityId, opts.kg);
  if (kg <= 0) {
    throw new Error(`No free ${opts.commodityId} at ${origin}`);
  }
  const payUsd = quoteWarehouseHaulPayUsd(world, {
    originIcao: origin,
    destIcao: dest,
    commodityId: opts.commodityId,
    kg,
  });
  const unitPriceUsd = money(payUsd / kg);
  const ttl = demandHoldTtlTicks(originWh.tier);
  const hold: PlayerDemandHold = {
    id: nextId('hold_haul', world.tick),
    kind: 'haul',
    warehouseId: originWh.id,
    originIcao: origin,
    destIcao: dest,
    commodityId: opts.commodityId,
    kg,
    unitPriceUsd,
    heldAtTick: world.tick,
    expiresAtTick: world.tick + ttl,
  };
  holds.push(hold);
  state.playerWarehouses!.demandHolds = holds;
  return { hold, kg, payUsd };
}

export function cancelWarehouseHaulHold(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { holdId: string },
): { kg: number } {
  expireDemandHolds(state, world);
  const holds = listDemandHolds(state);
  const idx = holds.findIndex((h) => h.id === opts.holdId.trim());
  if (idx < 0) throw new Error('Haul hold not found');
  const hold = holds[idx]!;
  if (hold.kind !== 'haul') {
    throw new Error('Not a warehouse haul hold');
  }
  holds.splice(idx, 1);
  state.playerWarehouses!.demandHolds = holds;
  return { kg: hold.kg };
}

export function acceptWarehouseHaul(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    originIcao: string;
    destIcao: string;
    commodityId: CommodityId;
    aircraftId: string;
    kg?: number;
  },
): { mission: MissionIntent; kg: number; payUsd: number } {
  expireDemandHolds(state, world);
  if (!cargoOpsIsUnlocked(state.cargoOps, opts.commodityId)) {
    const name = getCommodity(opts.commodityId).name;
    throw new Error(
      `Cargo Ops: ${name} is locked — unlock it in Hangar → Cargo Ops`,
    );
  }
  const origin = opts.originIcao.trim().toUpperCase();
  const dest = opts.destIcao.trim().toUpperCase();
  if (!airportByIcao(world, dest)) {
    throw new Error(`Unknown destination ${dest}`);
  }
  assertHaulRoute(state, origin, dest);
  const kg = clampHaulKg(state, origin, opts.commodityId, opts.kg);
  if (kg <= 0) {
    throw new Error(`No free ${opts.commodityId} at ${origin}`);
  }
  const aircraft = parkedAircraftAt(
    state,
    world,
    opts.aircraftId,
    origin,
    dest,
    kg,
  );
  const payUsd = quoteWarehouseHaulPayUsd(world, {
    originIcao: origin,
    destIcao: dest,
    commodityId: opts.commodityId,
    kg,
  });
  const withdrawn = withdrawCargoFromWarehouse(state, {
    icao: origin,
    commodityId: opts.commodityId,
    kg,
  });
  const mission = createHaulMission(state, world, {
    origin,
    dest,
    commodityId: opts.commodityId,
    kg,
    payUsd,
    aircraft,
    warehouseId: withdrawn.warehouseId,
    avgCostUsdPerKg: withdrawn.avgCostUsdPerKg,
  });
  return { mission, kg, payUsd };
}

export function dispatchWarehouseHaulHold(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { holdId: string; aircraftId: string },
): { mission: MissionIntent; kg: number; payUsd: number } {
  expireDemandHolds(state, world);
  const holds = listDemandHolds(state);
  const idx = holds.findIndex((h) => h.id === opts.holdId.trim());
  if (idx < 0) throw new Error('Haul hold not found');
  const hold = holds[idx]!;
  if (hold.kind !== 'haul') {
    throw new Error('Not a warehouse haul hold');
  }
  const aircraft = parkedAircraftAt(
    state,
    world,
    opts.aircraftId,
    hold.originIcao,
    hold.destIcao,
    hold.kg,
  );
  const payUsd = money(hold.unitPriceUsd * hold.kg);
  const withdrawn = withdrawCargoFromWarehouse(state, {
    icao: hold.originIcao,
    commodityId: hold.commodityId,
    kg: hold.kg,
  });
  holds.splice(idx, 1);
  state.playerWarehouses!.demandHolds = holds;
  const mission = createHaulMission(state, world, {
    origin: hold.originIcao,
    dest: hold.destIcao,
    commodityId: hold.commodityId,
    kg: hold.kg,
    payUsd,
    aircraft,
    warehouseId: withdrawn.warehouseId,
    avgCostUsdPerKg: withdrawn.avgCostUsdPerKg,
  });
  return { mission, kg: hold.kg, payUsd };
}
