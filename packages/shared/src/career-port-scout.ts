/**
 * Port FBO Scout — suggest WH→WH bridges, WH→Demand, and WH→terminal hauls
 * (human confirms → hold). No auto-create, no NPC fly Demand/haul.
 */

import { hubDistanceNm } from './career-ferry-route.js';
import {
  airportByIcao,
  CAREER_HUB_COORDS,
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

/**
 * Haul = short-fill only: dest warehouse fill must be ≤ this (hard gate).
 * Absolute room alone is not enough — large hubs near full still have tons
 * of free kg without "needing" a 50 klb dump.
 */
export const PORT_SCOUT_HAUL_MAX_DEST_FILL = 0.4;
/** @deprecated alias — same as PORT_SCOUT_HAUL_MAX_DEST_FILL */
export const PORT_SCOUT_HAUL_DEST_FILL_SOFT = PORT_SCOUT_HAUL_MAX_DEST_FILL;
/**
 * Size haul kg to bring dest toward this fill (not dump all free room).
 * Must stay above MAX_DEST_FILL so eligible hubs always have positive need.
 */
export const PORT_SCOUT_HAUL_DEST_FILL_TARGET = 0.55;

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
  /** Map pins (optional — UI draws route when both ends resolve). */
  originLat?: number;
  originLon?: number;
  destLat?: number;
  destLon?: number;
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
  originLat?: number;
  originLon?: number;
  destLat?: number;
  destLon?: number;
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
  originLat?: number;
  originLon?: number;
  destLat?: number;
  destLon?: number;
  reason: string;
  score: number;
};

function airportLatLon(
  world: CareerEconomyWorld,
  icao: string,
): { lat: number; lon: number } | null {
  const code = icao.trim().toUpperCase();
  const hub = CAREER_HUB_COORDS[code];
  if (
    hub &&
    typeof hub.lat === 'number' &&
    typeof hub.lon === 'number' &&
    Number.isFinite(hub.lat) &&
    Number.isFinite(hub.lon)
  ) {
    return { lat: hub.lat, lon: hub.lon };
  }
  const ap = airportByIcao(world, code);
  if (
    ap &&
    typeof ap.lat === 'number' &&
    typeof ap.lon === 'number' &&
    Number.isFinite(ap.lat) &&
    Number.isFinite(ap.lon)
  ) {
    return { lat: ap.lat, lon: ap.lon };
  }
  return null;
}

function routeCoords(
  world: CareerEconomyWorld,
  originIcao: string,
  destIcao: string,
): Pick<
  PortScoutHaulSuggestion,
  'originLat' | 'originLon' | 'destLat' | 'destLon'
> {
  const o = airportLatLon(world, originIcao);
  const d = airportLatLon(world, destIcao);
  return {
    ...(o ? { originLat: o.lat, originLon: o.lon } : {}),
    ...(d ? { destLat: d.lat, destLon: d.lon } : {}),
  };
}

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
          ...routeCoords(world, origin, dest),
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
        ...routeCoords(world, origin, dest),
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
        if (fill > PORT_SCOUT_HAUL_MAX_DEST_FILL) continue;
        const roomKg = Math.max(0, pile.capacityKg - pile.stockKg);
        if (roomKg < PORT_SCOUT_MIN_KG) continue;
        // Cap lot to what the dest still "needs" toward target fill.
        const needKg = Math.max(
          0,
          Math.floor(pile.capacityKg * PORT_SCOUT_HAUL_DEST_FILL_TARGET) -
            pile.stockKg,
        );
        if (needKg < PORT_SCOUT_MIN_KG) continue;

        const distanceNm = moneyNm(world, origin, dest);
        if (distanceNm <= 0 || distanceNm > PORT_SCOUT_HAUL_MAX_NM) continue;

        const kg = Math.min(free, roomKg, needKg);
        if (kg < PORT_SCOUT_MIN_KG) continue;
        const payUsd = quoteWarehouseHaulPayUsd(world, {
          originIcao: origin,
          destIcao: dest,
          commodityId,
          kg,
        });
        if (payUsd <= 0) continue;

        const unitPriceUsd = money(payUsd / kg);
        const nm = Math.round(distanceNm);
        // Prefer emptier dests among the short-fill band.
        const score = payUsd - Math.min(nm, 800) * 0.2 - fill * 800;
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
          ...routeCoords(world, origin, dest),
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

export type PortScoutEmptyHint = {
  /** Short player-facing lines (1–3). */
  lines: string[];
  warehouseCount: number;
  stockKgAtOwnedHubs: number;
  openDemandOrders: number;
  demandReachableMatches: number;
  haulRoomDests: number;
};

/**
 * Why Scout is empty — used for UI copy (not a second suggestion engine).
 */
export function diagnosePortScoutEmpty(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { companyId?: string } = {},
): PortScoutEmptyHint {
  const companyId = opts.companyId ?? LOCAL_COMPANY_ID;
  const warehouses = ensurePlayerWarehouses(state).warehouses;
  let stockKgAtOwnedHubs = 0;
  const ownedOrigins: string[] = [];
  for (const wh of warehouses) {
    const origin = wh.icao.trim().toUpperCase();
    if (!playerOperatesPortTouchingHub(world, origin, companyId)) continue;
    ownedOrigins.push(origin);
    for (const pile of ensurePlayerWarehouses(state).stock) {
      if (pile.warehouseId !== wh.id || pile.kg <= 0) continue;
      if (!isWarehouseCommodityAllowed(pile.commodityId)) continue;
      stockKgAtOwnedHubs += pile.kg;
    }
  }

  const open = listOpenDemandOrders(world);
  let demandReachableMatches = 0;
  for (const origin of ownedOrigins) {
    for (const order of open) {
      if (!cargoOpsIsUnlocked(state.cargoOps, order.commodityId)) continue;
      if (!isWarehouseCommodityAllowed(order.commodityId)) continue;
      const dest = order.destIcao.trim().toUpperCase();
      if (dest === origin) continue;
      const free = warehouseFreeCommodityKg(state, origin, order.commodityId);
      if (Math.min(free, order.remainingKg) < PORT_SCOUT_MIN_KG) continue;
      if (demandRouteReachable(state, world, origin, dest, order.portId)) {
        demandReachableMatches += 1;
      }
    }
  }

  let haulRoomDests = 0;
  for (const origin of ownedOrigins) {
    for (const pile of ensurePlayerWarehouses(state).stock) {
      const wh = warehouses.find((w) => w.id === pile.warehouseId);
      if (!wh || wh.icao.trim().toUpperCase() !== origin) continue;
      if (pile.kg < PORT_SCOUT_MIN_KG) continue;
      if (!cargoOpsIsUnlocked(state.cargoOps, pile.commodityId)) continue;
      for (const ap of world.airports ?? []) {
        const dest = ap.icao.trim().toUpperCase();
        if (!dest || dest === origin) continue;
        if (isBushHub(dest) || isBushTripOnlyHub(dest)) continue;
        const inv = ap.inventory[pile.commodityId];
        if (!inv || inv.capacityKg <= 0) continue;
        const fill = inv.stockKg / inv.capacityKg;
        if (fill > PORT_SCOUT_HAUL_MAX_DEST_FILL) continue;
        const roomKg = Math.max(0, inv.capacityKg - inv.stockKg);
        if (roomKg < PORT_SCOUT_MIN_KG) continue;
        const needKg = Math.max(
          0,
          Math.floor(inv.capacityKg * PORT_SCOUT_HAUL_DEST_FILL_TARGET) -
            inv.stockKg,
        );
        if (needKg < PORT_SCOUT_MIN_KG) continue;
        const nm = moneyNm(world, origin, dest);
        if (nm <= 0 || nm > PORT_SCOUT_HAUL_MAX_NM) continue;
        haulRoomDests += 1;
        if (haulRoomDests >= 3) break;
      }
      if (haulRoomDests >= 3) break;
    }
    if (haulRoomDests >= 3) break;
  }

  const lines: string[] = [];
  if (ownedOrigins.length === 0) {
    lines.push('Claim Port FBO first — Scout only runs from hubs you operate.');
  } else if (stockKgAtOwnedHubs < PORT_SCOUT_MIN_KG) {
    lines.push(
      'No usable stock at your Port FBO hubs yet — buy from Catalog or wait for inbound.',
    );
  } else {
    if (warehouses.length < 2) {
      lines.push(
        'Bridge needs a 2nd company warehouse (WH→WH). Demand / Haul use this stock.',
      );
    }
    if (open.length === 0) {
      lines.push('Demand board is empty — wait for a tick or check another desk.');
    } else if (demandReachableMatches === 0) {
      lines.push(
        'No open Demand matches your stock + corridor from this hub.',
      );
    }
    if (haulRoomDests === 0) {
      lines.push(
        'No short-fill terminal in range (dest ≤40% full with need toward 55%).',
      );
    }
  }
  if (lines.length === 0) {
    lines.push('No Scout ideas right now — try again after the next tick.');
  }

  return {
    lines: lines.slice(0, 3),
    warehouseCount: warehouses.length,
    stockKgAtOwnedHubs,
    openDemandOrders: open.length,
    demandReachableMatches,
    haulRoomDests,
  };
}

/** Bridge + Demand + Haul scout desk payload (API / UI). */
export function listPortScoutDesk(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { companyId?: string; max?: number } = {},
): {
  suggestions: PortScoutBridgeSuggestion[];
  demandSuggestions: PortScoutDemandSuggestion[];
  haulSuggestions: PortScoutHaulSuggestion[];
  emptyHint: PortScoutEmptyHint | null;
} {
  const companyId = opts.companyId ?? LOCAL_COMPANY_ID;
  const max = opts.max;
  const suggestions = listPortScoutBridgeSuggestions(state, world, {
    companyId,
    max,
  });
  const demandSuggestions = listPortScoutDemandSuggestions(state, world, {
    companyId,
    max,
  });
  const haulSuggestions = listPortScoutHaulSuggestions(state, world, {
    companyId,
    max,
  });
  const empty =
    suggestions.length +
      demandSuggestions.length +
      haulSuggestions.length ===
    0;
  return {
    suggestions,
    demandSuggestions,
    haulSuggestions,
    emptyHint: empty
      ? diagnosePortScoutEmpty(state, world, { companyId })
      : null,
  };
}
