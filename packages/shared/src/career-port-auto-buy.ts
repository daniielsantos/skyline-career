/**
 * Port FBO desk auto-buy (limit orders). Same price path as manual buyPortListing.
 */

import { economyDayIndex } from './career-weather.js';
import {
  buyPortListing,
  effectivePortBuyUnitPriceUsd,
  getCareerPort,
} from './career-ports.js';
import { isPortOperator } from './career-port-concessions.js';
import { LOCAL_COMPANY_ID } from './career-store-v3.js';
import { ensurePlayerWarehouses } from './career-warehouse-stock.js';
import { cargoOpsIsUnlocked } from './career-cargo-ops.js';
import { isFboHoldCommodityAllowed } from './career-fbo.js';
import type {
  CareerEconomyWorld,
  CareerMissionsState,
  CommodityId,
  PortAutoBuyOrder,
} from './types/career-economy.js';

/** Solo MVP — max active (non-paused) desk orders per company. */
export const PORT_AUTO_BUY_MAX_ACTIVE = 3;

const PORT_AUTO_BUY_COMMODITIES: readonly CommodityId[] = [
  'general',
  'supplies',
  'machinery',
  'electronics',
];

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

export function ensurePortAutoBuyOrders(
  state: CareerMissionsState,
): PortAutoBuyOrder[] {
  if (!Array.isArray(state.portAutoBuyOrders)) {
    state.portAutoBuyOrders = [];
  }
  return state.portAutoBuyOrders;
}

function normalizeCommodityId(raw: string): CommodityId | null {
  const id = raw.trim().toLowerCase() as CommodityId;
  return PORT_AUTO_BUY_COMMODITIES.includes(id) ? id : null;
}

function countActiveOrders(orders: PortAutoBuyOrder[]): number {
  return orders.filter((o) => !o.paused).length;
}

function assertWarehouseForPort(
  state: CareerMissionsState,
  portId: string,
  warehouseId: string,
): { warehouseId: string; hubIcao: string } {
  const port = getCareerPort(portId);
  if (!port) throw new Error(`Unknown port ${portId}`);
  const wh = ensurePlayerWarehouses(state).warehouses.find(
    (w) => w.id === warehouseId,
  );
  if (!wh) throw new Error('Warehouse not found');
  const hub = wh.icao.trim().toUpperCase();
  if (!port.pickupHubs.map((h) => h.toUpperCase()).includes(hub)) {
    throw new Error(
      `Warehouse at ${hub} is not a pickup hub for ${port.name}`,
    );
  }
  return { warehouseId: wh.id, hubIcao: hub };
}

export type UpsertPortAutoBuyOrderOpts = {
  id?: string;
  portId: string;
  commodityId: string;
  maxPriceUsdPerKg: number;
  maxKgPerDay: number;
  warehouseId: string;
  walletFloorUsd?: number;
  paused?: boolean;
  companyId?: string;
};

export function upsertPortAutoBuyOrder(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: UpsertPortAutoBuyOrderOpts,
): PortAutoBuyOrder {
  const companyId = opts.companyId ?? LOCAL_COMPANY_ID;
  const portId = opts.portId.trim().toUpperCase();
  const commodityId = normalizeCommodityId(opts.commodityId);
  if (!commodityId) throw new Error('Invalid commodity for Port FBO desk');
  if (!isPortOperator(world, portId, companyId)) {
    throw new Error('Port FBO desk requires an active Port FBO on this port');
  }
  const { warehouseId } = assertWarehouseForPort(
    state,
    portId,
    opts.warehouseId.trim(),
  );
  const maxPriceUsdPerKg = money(Math.max(0.01, opts.maxPriceUsdPerKg));
  const maxKgPerDay = Math.max(1, Math.floor(opts.maxKgPerDay));
  const walletFloorUsd = money(Math.max(0, opts.walletFloorUsd ?? 0));
  const paused = opts.paused === true;
  const orders = ensurePortAutoBuyOrders(state);
  const existingId = opts.id?.trim();
  const existing = existingId
    ? orders.find((o) => o.id === existingId)
    : undefined;

  if (!existing && !paused && countActiveOrders(orders) >= PORT_AUTO_BUY_MAX_ACTIVE) {
    throw new Error(
      `Port FBO desk allows at most ${PORT_AUTO_BUY_MAX_ACTIVE} active orders`,
    );
  }
  if (
    existing &&
    existing.paused &&
    !paused &&
    countActiveOrders(orders) >= PORT_AUTO_BUY_MAX_ACTIVE
  ) {
    throw new Error(
      `Port FBO desk allows at most ${PORT_AUTO_BUY_MAX_ACTIVE} active orders`,
    );
  }

  const day = economyDayIndex(world.tick);
  if (existing) {
    existing.portId = portId;
    existing.commodityId = commodityId;
    existing.maxPriceUsdPerKg = maxPriceUsdPerKg;
    existing.maxKgPerDay = maxKgPerDay;
    existing.warehouseId = warehouseId;
    existing.walletFloorUsd = walletFloorUsd;
    existing.paused = paused;
    return existing;
  }

  const order: PortAutoBuyOrder = {
    id: `pabo_${portId.toLowerCase()}_${commodityId}_${world.tick}_${orders.length}`,
    portId,
    commodityId,
    maxPriceUsdPerKg,
    maxKgPerDay,
    warehouseId,
    walletFloorUsd,
    paused,
    boughtKgToday: 0,
    boughtDayIndex: day,
    createdAtTick: world.tick,
  };
  orders.push(order);
  return order;
}

export function setPortAutoBuyOrderPaused(
  state: CareerMissionsState,
  orderId: string,
  paused: boolean,
): PortAutoBuyOrder {
  const orders = ensurePortAutoBuyOrders(state);
  const order = orders.find((o) => o.id === orderId);
  if (!order) throw new Error('Auto-buy order not found');
  if (!paused && order.paused && countActiveOrders(orders) >= PORT_AUTO_BUY_MAX_ACTIVE) {
    throw new Error(
      `Port FBO desk allows at most ${PORT_AUTO_BUY_MAX_ACTIVE} active orders`,
    );
  }
  order.paused = paused;
  return order;
}

export function removePortAutoBuyOrder(
  state: CareerMissionsState,
  orderId: string,
): void {
  const orders = ensurePortAutoBuyOrders(state);
  const next = orders.filter((o) => o.id !== orderId);
  if (next.length === orders.length) {
    throw new Error('Auto-buy order not found');
  }
  state.portAutoBuyOrders = next;
}

function alignOrderDay(order: PortAutoBuyOrder, day: number): void {
  if (order.boughtDayIndex !== day) {
    order.boughtDayIndex = day;
    order.boughtKgToday = 0;
  }
}

/**
 * Execute active Port FBO desk orders against open listings.
 * Call after ensurePortListings on the same tick.
 */
export function tickPortAutoBuyOrders(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  companyId = LOCAL_COMPANY_ID,
): { buys: number; kg: number; debitUsd: number } {
  const orders = ensurePortAutoBuyOrders(state);
  if (orders.length === 0) return { buys: 0, kg: 0, debitUsd: 0 };

  const day = economyDayIndex(world.tick);
  let buys = 0;
  let kg = 0;
  let debitUsd = 0;

  const sorted = orders.slice().sort((a, b) => a.id.localeCompare(b.id));
  for (const order of sorted) {
    alignOrderDay(order, day);
    if (order.paused) continue;
    if (!isPortOperator(world, order.portId, companyId)) {
      order.paused = true;
      continue;
    }
    const remaining = order.maxKgPerDay - order.boughtKgToday;
    if (remaining <= 0) continue;
    if (!cargoOpsIsUnlocked(state.cargoOps, order.commodityId)) continue;
    if (!isFboHoldCommodityAllowed(order.commodityId)) continue;

    let wh;
    try {
      wh = assertWarehouseForPort(state, order.portId, order.warehouseId);
    } catch {
      order.paused = true;
      continue;
    }

    const candidates = (world.portListings ?? [])
      .filter(
        (l) =>
          l.status === 'open' &&
          l.availableKg > 0 &&
          l.expiresAtTick > world.tick &&
          l.portId.toUpperCase() === order.portId &&
          l.commodityId === order.commodityId &&
          l.allocatedHubIcao.trim().toUpperCase() === wh.hubIcao,
      )
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const listing of candidates) {
      const rem = order.maxKgPerDay - order.boughtKgToday;
      if (rem <= 0) break;

      const unit = effectivePortBuyUnitPriceUsd(
        state,
        world,
        listing,
        companyId,
      );
      if (unit > order.maxPriceUsdPerKg) continue;

      const maxByWallet = Math.floor(
        Math.max(0, state.walletUsd - order.walletFloorUsd) / unit,
      );
      const buyKg = Math.min(listing.availableKg, rem, maxByWallet);
      if (buyKg <= 0) continue;

      try {
        const result = buyPortListing(state, world, {
          listingId: listing.id,
          kg: buyKg,
        });
        order.boughtKgToday += result.kg;
        buys += 1;
        kg += result.kg;
        debitUsd = money(debitUsd + result.debitUsd);
      } catch {
        // Listing raced / wallet edge — skip and try next.
      }
    }
  }

  return { buys, kg, debitUsd };
}
