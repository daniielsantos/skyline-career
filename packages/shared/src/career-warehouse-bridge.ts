/**
 * Company warehouse→warehouse air reposition (no Demand Board, no payout).
 */

import { cargoOpsIsUnlocked } from './career-cargo-ops.js';
import { TICKS_PER_HOUR } from './career-clock.js';
import { getCommodity } from './career-economy.js';
import {
  demandHoldTtlTicks,
  demandRouteMaxCargoKg,
  expireDemandHolds,
  listDemandHolds,
} from './career-demand.js';
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

function nextId(prefix: string, tick: number): string {
  return `${prefix}_${tick}_${Math.floor(Math.random() * 1e6)}`;
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
  },
): { hold: PlayerDemandHold; kg: number } {
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
    unitPriceUsd: 0,
    heldAtTick: world.tick,
    expiresAtTick: world.tick + ttl,
  };
  holds.push(hold);
  state.playerWarehouses!.demandHolds = holds;
  return { hold, kg };
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
  const mission = recomputeMissionTotals({
    id: `msn_bridge_${world.tick}_${opts.origin}_${opts.dest}_${Math.floor(Math.random() * 1e6)}`,
    lots: [
      {
        shipmentLotId: lotId,
        commodityId: opts.commodityId,
        cargoKg: opts.kg,
        payUsd: 0,
        urgency: 'normal',
        reason: `WH bridge · ${getCommodity(opts.commodityId).name} → ${opts.dest}`,
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
    payUsd: 0,
    urgency: 'normal',
    reason: `Warehouse bridge · ${opts.origin}→${opts.dest}`,
    status: 'accepted',
    acceptedAtTick: world.tick,
    aircraftId: opts.aircraft.id,
    warehouseBridge: true,
    destWarehouseId: opts.destWarehouseId,
    warehouseId: opts.warehouseId,
    warehouseAvgCostUsdPerKg: opts.avgCostUsdPerKg,
    portId: opts.destPortId,
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
  },
): { mission: MissionIntent; kg: number } {
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
    aircraft,
    warehouseId: withdrawn.warehouseId,
    destWarehouseId: destWh.id,
    destPortId,
    avgCostUsdPerKg: withdrawn.avgCostUsdPerKg,
  });
  return { mission, kg };
}

export function dispatchWarehouseBridgeHold(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { holdId: string; aircraftId: string },
): { mission: MissionIntent; kg: number } {
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
  const mission = createBridgeMission(state, world, {
    origin: hold.originIcao,
    dest: hold.destIcao,
    commodityId: hold.commodityId,
    kg: hold.kg,
    aircraft,
    warehouseId: withdrawn.warehouseId,
    destWarehouseId: hold.destWarehouseId,
    destPortId,
    avgCostUsdPerKg: withdrawn.avgCostUsdPerKg,
  });
  return { mission, kg: hold.kg };
}
