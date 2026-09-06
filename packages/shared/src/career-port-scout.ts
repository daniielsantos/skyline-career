/**
 * Port FBO Scout — suggest WH→WH bridges, WH→Demand, and WH→terminal hauls
 * (human confirms → hold). No auto-create, no NPC fly Demand/haul.
 */

import { hubDistanceNm } from './career-ferry-route.js';
import {
  airportByIcao,
  routeDistanceNm,
} from './career-economy.js';
import { cargoOpsIsUnlocked } from './career-cargo-ops.js';
import {
  assertDemandInternationalAccept,
  demandEffectiveUnitPriceUsd,
  holdDemandOrder,
  listDemandHolds,
  listOpenDemandOrders,
} from './career-demand.js';
import { isPortOperator } from './career-port-concessions.js';
import {
  CAREER_PORTS,
  careerPortIdForPickupHub,
} from './career-ports.js';
import { assertDemandPortCorridorReach } from './career-port-corridor.js';
import { LOCAL_COMPANY_ID } from './career-store-v3.js';
import { holdWarehouseBridge } from './career-warehouse-bridge.js';
import {
  holdWarehouseHaul,
  quoteWarehouseHaulPayUsd,
} from './career-warehouse-haul.js';
import {
  ensurePlayerWarehouses,
  findPlayerWarehouseAtIcao,
  isWarehouseCommodityAllowed,
  warehouseBridgeDestRoomKg,
  warehouseFreeCommodityKg,
} from './career-warehouse-stock.js';
import { isBushHub, isBushTripOnlyHub } from './career-bush.js';
import type {
  CareerEconomyWorld,
  CareerMissionsState,
  CommodityId,
  PlayerDemandHold,
} from './types/career-economy.js';

/** Ignore tiny leftovers on the scout desk. */
export const PORT_SCOUT_MIN_KG = 200;

/** Cap suggestions returned to the UI (per list). */
export const PORT_SCOUT_MAX_SUGGESTIONS = 8;

/** Max nm for haul dest candidates (P2 corridor-ish). */
export const PORT_SCOUT_HAUL_MAX_NM = 1_800;

/** Only suggest haul to terminals below this fill fraction. */
export const PORT_SCOUT_HAUL_DEST_FILL_MAX = 0.4;

export type PortScoutBridgeSuggestion = {
  /** Stable key: ORIGIN|DEST|commodity */
  id: string;
  originIcao: string;
  destIcao: string;
  originWarehouseId: string;
  destWarehouseId: string;
  commodityId: CommodityId;
  kg: number;
  distanceNm: number;
  /** Human-readable why this bridge. */
  reason: string;
  score: number;
};

export type PortScoutDemandSuggestion = {
  /** Stable key: orderId|ORIGIN */
  id: string;
  orderId: string;
  originIcao: string;
  destIcao: string;
  originWarehouseId: string;
  commodityId: CommodityId;
  kg: number;
  distanceNm: number;
  unitPriceUsd: number;
  payUsd: number;
  reason: string;
  score: number;
};

export type PortScoutHaulSuggestion = {
  /** Stable key: ORIGIN|DEST|commodity */
  id: string;
  originIcao: string;
  destIcao: string;
  originWarehouseId: string;
  commodityId: CommodityId;
  kg: number;
  distanceNm: number;
  unitPriceUsd: number;
  payUsd: number;
  destFillPct: number;
  reason: string;
  score: number;
};

function moneyNm(
  world: CareerEconomyWorld,
  from: string,
  to: string,
): number {
  return hubDistanceNm(from, to) ?? routeDistanceNm(world, from, to) ?? 0;
}

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function playerOperatesPortTouchingHub(
  world: CareerEconomyWorld,
  hubIcao: string,
  companyId: string,
): boolean {
  const portId = careerPortIdForPickupHub(hubIcao);
  if (portId && isPortOperator(world, portId, companyId)) return true;
  // Also: any owned Port FBO whose pickup list includes this hub.
  for (const port of CAREER_PORTS) {
    if (
      port.pickupHubs.some((h) => h.toUpperCase() === hubIcao) &&
      isPortOperator(world, port.id, companyId)
    ) {
      return true;
    }
  }
  return false;
}

function alreadyHoldingBridge(
  state: CareerMissionsState,
  originWhId: string,
  destWhId: string,
  commodityId: CommodityId,
): boolean {
  return listDemandHolds(state).some(
    (h) =>
      (h.kind ?? 'demand') === 'bridge' &&
      h.warehouseId === originWhId &&
      h.destWarehouseId === destWhId &&
      h.commodityId === commodityId,
  );
}

function alreadyHoldingDemandOrder(
  state: CareerMissionsState,
  orderId: string,
): boolean {
  return listDemandHolds(state).some(
    (h) => (h.kind ?? 'demand') === 'demand' && h.orderId === orderId,
  );
}

function demandRouteReachable(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  origin: string,
  dest: string,
  portId: string | undefined,
): boolean {
  try {
    assertDemandInternationalAccept(world, origin, dest);
    assertDemandPortCorridorReach(state, world, origin, dest, { portId });
    return true;
  } catch {
    return false;
  }
}

/**
 * List WH→WH bridge ideas from company stock (Port FBO desk).
 * Requires an active Port FBO whose pickup hubs include the origin (or dest).
 */
export function listPortScoutBridgeSuggestions(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { max?: number; companyId?: string } = {},
): PortScoutBridgeSuggestion[] {
  const companyId = opts.companyId ?? LOCAL_COMPANY_ID;
  const max = Math.max(
    1,
    Math.min(
      PORT_SCOUT_MAX_SUGGESTIONS,
      opts.max ?? PORT_SCOUT_MAX_SUGGESTIONS,
    ),
  );
  const warehouses = ensurePlayerWarehouses(state).warehouses;
  if (warehouses.length < 2) return [];

  const out: PortScoutBridgeSuggestion[] = [];
  for (const originWh of warehouses) {
    const origin = originWh.icao.trim().toUpperCase();
    if (!playerOperatesPortTouchingHub(world, origin, companyId)) continue;

    const commodities = new Set<CommodityId>();
    for (const pile of ensurePlayerWarehouses(state).stock) {
      if (pile.warehouseId !== originWh.id || pile.kg <= 0) continue;
      if (!isWarehouseCommodityAllowed(pile.commodityId)) continue;
      commodities.add(pile.commodityId);
    }

    for (const commodityId of commodities) {
      const free = warehouseFreeCommodityKg(state, origin, commodityId);
      if (free < PORT_SCOUT_MIN_KG) continue;

      for (const destWh of warehouses) {
        if (destWh.id === originWh.id) continue;
        const dest = destWh.icao.trim().toUpperCase();
        if (dest === origin) continue;
        if (
          !playerOperatesPortTouchingHub(world, dest, companyId) &&
          !playerOperatesPortTouchingHub(world, origin, companyId)
        ) {
          continue;
        }
        if (alreadyHoldingBridge(state, originWh.id, destWh.id, commodityId)) {
          continue;
        }
        const room = warehouseBridgeDestRoomKg(state, destWh.id);
        const kg = Math.min(free, room);
        if (kg < PORT_SCOUT_MIN_KG) continue;

        const distanceNm = Math.round(moneyNm(world, origin, dest));
        // Prefer more kg, mild preference for shorter hops.
        const score = kg - Math.min(distanceNm, 800) * 0.5;
        out.push({
          id: `${origin}|${dest}|${commodityId}`,
          originIcao: origin,
          destIcao: dest,
          originWarehouseId: originWh.id,
          destWarehouseId: destWh.id,
          commodityId,
          kg,
          distanceNm,
          reason: `${kg.toLocaleString()} kg ${commodityId} at ${origin} → ${dest} has room`,
          score,
        });
      }
    }
  }

  out.sort(
    (a, b) =>
      b.score - a.score ||
      a.distanceNm - b.distanceNm ||
      a.id.localeCompare(b.id),
  );
  return out.slice(0, max);
}

/**
 * Confirm a scout suggestion → same path as manual bridge Hold.
 */
export function confirmPortScoutBridge(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    originIcao: string;
    destIcao: string;
    commodityId: CommodityId;
    kg?: number;
    companyId?: string;
  },
): {
  hold: PlayerDemandHold;
  kg: number;
  suggestion: PortScoutBridgeSuggestion | null;
} {
  const companyId = opts.companyId ?? LOCAL_COMPANY_ID;
  const suggestions = listPortScoutBridgeSuggestions(state, world, {
    max: PORT_SCOUT_MAX_SUGGESTIONS,
    companyId,
  });
  const origin = opts.originIcao.trim().toUpperCase();
  const dest = opts.destIcao.trim().toUpperCase();
  const match = suggestions.find(
    (s) =>
      s.originIcao === origin &&
      s.destIcao === dest &&
      s.commodityId === opts.commodityId,
  );
  if (!match) {
    // Still allow if route is valid — scout desk is convenience, not a hard gate.
    // But require Port FBO touch on origin.
    if (!playerOperatesPortTouchingHub(world, origin, companyId)) {
      throw new Error(
        'Scout confirm needs an active Port FBO on a port serving the origin hub',
      );
    }
  }
  const held = holdWarehouseBridge(state, world, {
    originIcao: origin,
    destIcao: dest,
    commodityId: opts.commodityId,
    kg: opts.kg ?? match?.kg,
  });
  return { hold: held.hold, kg: held.kg, suggestion: match ?? null };
}

/**
 * List WH stock → open Demand board matches (Port FBO desk).
 * Player confirms → demand hold; you fly for pay (not shuttle).
 */
export function listPortScoutDemandSuggestions(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { max?: number; companyId?: string } = {},
): PortScoutDemandSuggestion[] {
  const companyId = opts.companyId ?? LOCAL_COMPANY_ID;
  const max = Math.max(
    1,
    Math.min(
      PORT_SCOUT_MAX_SUGGESTIONS,
      opts.max ?? PORT_SCOUT_MAX_SUGGESTIONS,
    ),
  );
  const warehouses = ensurePlayerWarehouses(state).warehouses;
  if (warehouses.length < 1) return [];

  const open = listOpenDemandOrders(world);
  if (open.length === 0) return [];

  const out: PortScoutDemandSuggestion[] = [];
  for (const originWh of warehouses) {
    const origin = originWh.icao.trim().toUpperCase();
    if (!playerOperatesPortTouchingHub(world, origin, companyId)) continue;

    for (const order of open) {
      if (alreadyHoldingDemandOrder(state, order.id)) continue;
      if (!cargoOpsIsUnlocked(state.cargoOps, order.commodityId)) continue;
      if (!isWarehouseCommodityAllowed(order.commodityId)) continue;

      const dest = order.destIcao.trim().toUpperCase();
      if (dest === origin) continue;
      if (isBushHub(dest) || isBushTripOnlyHub(dest)) continue;

      const free = warehouseFreeCommodityKg(state, origin, order.commodityId);
      const kg = Math.min(free, order.remainingKg);
      if (kg < PORT_SCOUT_MIN_KG) continue;

      if (!demandRouteReachable(state, world, origin, dest, order.portId)) {
        continue;
      }

      const unitPriceUsd = demandEffectiveUnitPriceUsd(world, order, origin, {
        state,
        warehouseId: originWh.id,
      });
      const payUsd = money(kg * unitPriceUsd);
      const distanceNm = Math.round(moneyNm(world, origin, dest));
      // Prefer pay, then shorter hops.
      const score = payUsd - Math.min(distanceNm, 800) * 0.25;
      out.push({
        id: `${order.id}|${origin}`,
        orderId: order.id,
        originIcao: origin,
        destIcao: dest,
        originWarehouseId: originWh.id,
        commodityId: order.commodityId,
        kg,
        distanceNm,
        unitPriceUsd,
        payUsd,
        reason: `${kg.toLocaleString()} kg ${order.commodityId} at ${origin} → Demand ${dest}`,
        score,
      });
    }
  }

  out.sort(
    (a, b) =>
      b.score - a.score ||
      b.payUsd - a.payUsd ||
      a.distanceNm - b.distanceNm ||
      a.id.localeCompare(b.id),
  );
  return out.slice(0, max);
}

/**
 * Confirm a Demand scout suggestion → same path as manual Demand Hold.
 */
export function confirmPortScoutDemand(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    orderId: string;
    originIcao: string;
    kg?: number;
    companyId?: string;
  },
): {
  hold: PlayerDemandHold;
  kg: number;
  suggestion: PortScoutDemandSuggestion | null;
} {
  const companyId = opts.companyId ?? LOCAL_COMPANY_ID;
  const origin = opts.originIcao.trim().toUpperCase();
  const suggestions = listPortScoutDemandSuggestions(state, world, {
    max: PORT_SCOUT_MAX_SUGGESTIONS,
    companyId,
  });
  const match = suggestions.find(
    (s) => s.orderId === opts.orderId.trim() && s.originIcao === origin,
  );
  if (!match) {
    if (!playerOperatesPortTouchingHub(world, origin, companyId)) {
      throw new Error(
        'Scout Demand needs an active Port FBO on a port serving the origin hub',
      );
    }
    if (!findPlayerWarehouseAtIcao(state, origin)) {
      throw new Error(`No warehouse at ${origin}`);
    }
  }
  const held = holdDemandOrder(state, world, {
    orderId: opts.orderId,
    originIcao: origin,
    kg: opts.kg ?? match?.kg,
  });
  return { hold: held.hold, kg: held.kg, suggestion: match ?? null };
}

function alreadyHoldingHaul(
  state: CareerMissionsState,
  originWhId: string,
  destIcao: string,
  commodityId: CommodityId,
): boolean {
  return listDemandHolds(state).some(
    (h) =>
      h.kind === 'haul' &&
      h.warehouseId === originWhId &&
      h.destIcao === destIcao &&
      h.commodityId === commodityId,
  );
}

/**
 * List WH stock → short-fill terminal haul ideas (Port FBO desk).
 * Confirm → haul hold; player flies for trunk pay (not shuttle / Demand).
 */
export function listPortScoutHaulSuggestions(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { max?: number; companyId?: string } = {},
): PortScoutHaulSuggestion[] {
  const companyId = opts.companyId ?? LOCAL_COMPANY_ID;
  const max = Math.max(
    1,
    Math.min(
      PORT_SCOUT_MAX_SUGGESTIONS,
      opts.max ?? PORT_SCOUT_MAX_SUGGESTIONS,
    ),
  );
  const warehouses = ensurePlayerWarehouses(state).warehouses;
  if (warehouses.length < 1) return [];

  const out: PortScoutHaulSuggestion[] = [];
  for (const originWh of warehouses) {
    const origin = originWh.icao.trim().toUpperCase();
    if (!playerOperatesPortTouchingHub(world, origin, companyId)) continue;

    const commodities = new Set<CommodityId>();
    for (const pile of ensurePlayerWarehouses(state).stock) {
      if (pile.warehouseId !== originWh.id || pile.kg <= 0) continue;
      if (!isWarehouseCommodityAllowed(pile.commodityId)) continue;
      commodities.add(pile.commodityId);
    }

    for (const commodityId of commodities) {
      if (!cargoOpsIsUnlocked(state.cargoOps, commodityId)) continue;
      const free = warehouseFreeCommodityKg(state, origin, commodityId);
      if (free < PORT_SCOUT_MIN_KG) continue;

      for (const ap of world.airports ?? []) {
        const dest = ap.icao.trim().toUpperCase();
        if (!dest || dest === origin) continue;
        if (isBushHub(dest) || isBushTripOnlyHub(dest)) continue;
        if (alreadyHoldingHaul(state, originWh.id, dest, commodityId)) {
          continue;
        }

        const pile = ap.inventory[commodityId];
        if (!pile || pile.capacityKg <= 0) continue;
        const fill = pile.stockKg / pile.capacityKg;
        if (fill > PORT_SCOUT_HAUL_DEST_FILL_MAX) continue;

        const distanceNm = moneyNm(world, origin, dest);
        if (distanceNm <= 0 || distanceNm > PORT_SCOUT_HAUL_MAX_NM) continue;

        const kg = free;
        const payUsd = quoteWarehouseHaulPayUsd(world, {
          originIcao: origin,
          destIcao: dest,
          commodityId,
          kg,
        });
        if (payUsd <= 0) continue;

        const unitPriceUsd = money(payUsd / kg);
        const nm = Math.round(distanceNm);
        const score =
          payUsd - Math.min(nm, 800) * 0.2 - fill * 500;
        out.push({
          id: `${origin}|${dest}|${commodityId}`,
          originIcao: origin,
          destIcao: dest,
          originWarehouseId: originWh.id,
          commodityId,
          kg,
          distanceNm: nm,
          unitPriceUsd,
          payUsd,
          destFillPct: Math.round(fill * 1000) / 10,
          reason: `${kg.toLocaleString()} kg ${commodityId} at ${origin} → terminal ${dest} (${Math.round(fill * 100)}% fill)`,
          score,
        });
      }
    }
  }

  out.sort(
    (a, b) =>
      b.score - a.score ||
      b.payUsd - a.payUsd ||
      a.distanceNm - b.distanceNm ||
      a.id.localeCompare(b.id),
  );
  return out.slice(0, max);
}

/**
 * Confirm a haul scout suggestion → same path as manual Haul Hold.
 */
export function confirmPortScoutHaul(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    originIcao: string;
    destIcao: string;
    commodityId: CommodityId;
    kg?: number;
    companyId?: string;
  },
): {
  hold: PlayerDemandHold;
  kg: number;
  payUsd: number;
  suggestion: PortScoutHaulSuggestion | null;
} {
  const companyId = opts.companyId ?? LOCAL_COMPANY_ID;
  const origin = opts.originIcao.trim().toUpperCase();
  const dest = opts.destIcao.trim().toUpperCase();
  const suggestions = listPortScoutHaulSuggestions(state, world, {
    max: PORT_SCOUT_MAX_SUGGESTIONS,
    companyId,
  });
  const match = suggestions.find(
    (s) =>
      s.originIcao === origin &&
      s.destIcao === dest &&
      s.commodityId === opts.commodityId,
  );
  if (!match) {
    if (!playerOperatesPortTouchingHub(world, origin, companyId)) {
      throw new Error(
        'Scout Haul needs an active Port FBO on a port serving the origin hub',
      );
    }
    if (!findPlayerWarehouseAtIcao(state, origin)) {
      throw new Error(`No warehouse at ${origin}`);
    }
    if (!airportByIcao(world, dest)) {
      throw new Error(`Unknown destination ${dest}`);
    }
  }
  const held = holdWarehouseHaul(state, world, {
    originIcao: origin,
    destIcao: dest,
    commodityId: opts.commodityId,
    kg: opts.kg ?? match?.kg,
  });
  return {
    hold: held.hold,
    kg: held.kg,
    payUsd: held.payUsd,
    suggestion: match ?? null,
  };
}
