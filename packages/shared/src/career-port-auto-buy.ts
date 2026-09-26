/**
 * Port FBO desk auto-buy (limit orders). Same price path as manual buyPortListing.
 */

import { economyDayIndex } from './career-weather.js';
import {
  buyPortListing,
  effectivePortBuyUnitPriceUsd,
  getCareerPort,
  resolvePortPickupHub,
} from './career-ports.js';
import { isPortOperator } from './career-port-concessions.js';
import { LOCAL_COMPANY_ID } from './career-store-v3.js';
import {
  ensurePlayerWarehouses,
  MIN_WAREHOUSE_INBOUND_KG,
  warehouseInboundFreeKg,
} from './career-warehouse-stock.js';
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

/** Active desk orders on one WH may not sum targetFillPct above this. */
export const PORT_AUTO_BUY_MAX_QUOTA_SUM_PCT = 100;

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

/** Missing field on legacy saves = WH-only (no yard spill). */
export function portAutoBuyWhOnly(order: PortAutoBuyOrder): boolean {
  return order.whOnly !== false;
}

export function portAutoBuyTargetFillPct(
  order: PortAutoBuyOrder,
): number | null {
  const n = order.targetFillPct;
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  return Math.min(100, Math.floor(n));
}

/**
 * Daily mass cap. `maxKgPerDay <= 0` = no day cap (fill quota / WH room only).
 * Requires a fill quota on upsert when uncapped.
 */
export function portAutoBuyDayCapKg(order: PortAutoBuyOrder): number {
  const n = order.maxKgPerDay;
  if (n == null || !Number.isFinite(n) || n <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.floor(n);
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
): { warehouseId: string; hubIcao: string; capacityKg: number } {
  const port = getCareerPort(portId);
  if (!port) throw new Error(`Unknown port ${portId}`);
  const wh = ensurePlayerWarehouses(state).warehouses.find(
    (w) => w.id === warehouseId,
  );
  if (!wh) throw new Error('Warehouse not found');
  const hub = wh.icao.trim().toUpperCase();
  const desk = resolvePortPickupHub(port);
  if (hub !== desk) {
    throw new Error(
      `Desk auto-buy for ${port.name} delivers to ${desk} only. Use Truck from yard or move stock via stevedore.`,
    );
  }
  return {
    warehouseId: wh.id,
    hubIcao: hub,
    capacityKg: wh.capacityKg,
  };
}

/** Stock of one commodity in a WH (Demand holds still sit in stock). */
export function warehouseCommodityStockKg(
  state: CareerMissionsState,
  warehouseId: string,
  commodityId: CommodityId,
): number {
  return ensurePlayerWarehouses(state)
    .stock.filter(
      (s) =>
        s.warehouseId === warehouseId &&
        s.commodityId === commodityId &&
        s.kg > 0,
    )
    .reduce((sum, s) => sum + s.kg, 0);
}

/** Inbound transfers of one commodity toward a WH. */
export function warehouseCommodityInboundKg(
  state: CareerMissionsState,
  warehouseId: string,
  commodityId: CommodityId,
): number {
  return (ensurePlayerWarehouses(state).inboundTransfers ?? [])
    .filter(
      (t) =>
        t.warehouseId === warehouseId && t.commodityId === commodityId && t.kg > 0,
    )
    .reduce((sum, t) => sum + t.kg, 0);
}

/**
 * Gap (kg) until this order's fill quota. `null` = no quota cap.
 * Counts stock + inbound (holds occupy stock → count as used).
 */
export function portAutoBuyQuotaGapKg(
  state: CareerMissionsState,
  order: PortAutoBuyOrder,
): number | null {
  const pct = portAutoBuyTargetFillPct(order);
  if (pct == null) return null;
  const wh = ensurePlayerWarehouses(state).warehouses.find(
    (w) => w.id === order.warehouseId,
  );
  if (!wh || !(wh.capacityKg > 0)) return 0;
  const quotaKg = Math.floor((wh.capacityKg * pct) / 100);
  const used =
    warehouseCommodityStockKg(state, order.warehouseId, order.commodityId) +
    warehouseCommodityInboundKg(state, order.warehouseId, order.commodityId);
  return Math.max(0, quotaKg - used);
}

/** Sum of targetFillPct for active orders on a WH (optional exclude id). */
export function sumActiveAutoBuyQuotaPct(
  orders: readonly PortAutoBuyOrder[],
  warehouseId: string,
  excludeOrderId?: string,
): number {
  let sum = 0;
  for (const o of orders) {
    if (o.paused) continue;
    if (o.warehouseId !== warehouseId) continue;
    if (excludeOrderId && o.id === excludeOrderId) continue;
    const pct = portAutoBuyTargetFillPct(o);
    if (pct != null) sum += pct;
  }
  return sum;
}

function resolveWhOnly(
  raw: boolean | undefined,
  existing?: PortAutoBuyOrder,
): boolean {
  if (raw !== undefined) return raw === true;
  if (existing) return portAutoBuyWhOnly(existing);
  return true;
}

function resolveTargetFillPct(
  raw: number | null | undefined,
  existing?: PortAutoBuyOrder,
): number | null {
  if (raw === null) return null;
  if (raw !== undefined) {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    const n = Math.floor(raw);
    if (n > 100) {
      throw new Error('Target fill % must be between 1 and 100');
    }
    return n;
  }
  if (existing) return portAutoBuyTargetFillPct(existing);
  return null;
}

export type UpsertPortAutoBuyOrderOpts = {
  id?: string;
  portId: string;
  commodityId: string;
  maxPriceUsdPerKg: number;
  /**
   * Daily mass cap (kg). `0` = no day cap — only valid with `targetFillPct`
   * (fill quota / WH room pace the buys).
   */
  maxKgPerDay: number;
  warehouseId: string;
  walletFloorUsd?: number;
  /** Default true on new orders. */
  whOnly?: boolean;
  /** 1–100, or null/0 to clear. Omit keeps existing on update. */
  targetFillPct?: number | null;
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
  const orders = ensurePortAutoBuyOrders(state);
  const existingId = opts.id?.trim();
  const existing = existingId
    ? orders.find((o) => o.id === existingId)
    : undefined;
  const maxPriceUsdPerKg = money(Math.max(0.01, opts.maxPriceUsdPerKg));
  const whOnly = resolveWhOnly(opts.whOnly, existing);
  const targetFillPct = resolveTargetFillPct(opts.targetFillPct, existing);
  const rawDay = Number(opts.maxKgPerDay);
  if (!Number.isFinite(rawDay) || rawDay < 0) {
    throw new Error('maxKgPerDay must be zero or more');
  }
  let maxKgPerDay = Math.floor(rawDay);
  if (maxKgPerDay < 1) {
    if (targetFillPct == null) {
      throw new Error(
        'maxKgPerDay required unless a fill quota % is set',
      );
    }
    maxKgPerDay = 0;
  }
  const walletFloorUsd = money(Math.max(0, opts.walletFloorUsd ?? 0));
  const paused = opts.paused === true;

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

  if (!paused && targetFillPct != null) {
    const others = sumActiveAutoBuyQuotaPct(
      orders,
      warehouseId,
      existing?.id,
    );
    if (others + targetFillPct > PORT_AUTO_BUY_MAX_QUOTA_SUM_PCT) {
      throw new Error(
        `Desk fill quotas on this warehouse cannot exceed ${PORT_AUTO_BUY_MAX_QUOTA_SUM_PCT}% (others ${others}% + this ${targetFillPct}%)`,
      );
    }
  }

  const day = economyDayIndex(world.tick);
  if (existing) {
    existing.portId = portId;
    existing.commodityId = commodityId;
    existing.maxPriceUsdPerKg = maxPriceUsdPerKg;
    existing.maxKgPerDay = maxKgPerDay;
    existing.warehouseId = warehouseId;
    existing.walletFloorUsd = walletFloorUsd;
    existing.whOnly = whOnly;
    existing.targetFillPct = targetFillPct;
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
    whOnly,
    targetFillPct,
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
  if (!paused) {
    const pct = portAutoBuyTargetFillPct(order);
    if (pct != null) {
      const others = sumActiveAutoBuyQuotaPct(orders, order.warehouseId, order.id);
      if (others + pct > PORT_AUTO_BUY_MAX_QUOTA_SUM_PCT) {
        throw new Error(
          `Resuming would exceed ${PORT_AUTO_BUY_MAX_QUOTA_SUM_PCT}% fill quotas on this warehouse`,
        );
      }
    }
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

/** Free inbound room used by WH-only buys (mirrors buyPortListing tiny-slot rule). */
function autoBuyInboundRoomKg(
  state: CareerMissionsState,
  warehouseId: string,
): number {
  const freeRaw = warehouseInboundFreeKg(state, warehouseId);
  return freeRaw >= MIN_WAREHOUSE_INBOUND_KG ? freeRaw : 0;
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
    const remaining = portAutoBuyDayCapKg(order) - order.boughtKgToday;
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

    const quotaGap = portAutoBuyQuotaGapKg(state, order);
    if (quotaGap === 0) continue;

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
      const rem = portAutoBuyDayCapKg(order) - order.boughtKgToday;
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
      const gapNow = portAutoBuyQuotaGapKg(state, order);
      const maxByQuota = gapNow == null ? Number.POSITIVE_INFINITY : gapNow;
      const maxByWh = portAutoBuyWhOnly(order)
        ? autoBuyInboundRoomKg(state, order.warehouseId)
        : Number.POSITIVE_INFINITY;

      const buyKg = Math.min(
        listing.availableKg,
        rem,
        maxByWallet,
        maxByQuota,
        maxByWh,
      );
      if (buyKg <= 0) continue;

      try {
        const result = buyPortListing(state, world, {
          listingId: listing.id,
          kg: buyKg,
          companyId,
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
