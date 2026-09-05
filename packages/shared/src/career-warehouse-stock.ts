/**
 * Warehouse stock helpers with no career-mission / career-fbo imports (avoids cycles).
 */

import type {
  CareerMissionsState,
  CommodityId,
  PlayerDemandHold,
  PlayerWarehouse,
  PlayerWarehousePile,
  PlayerWarehouseState,
  WarehouseInboundTransfer,
  PlayerPortPickup,
} from './types/career-economy.js';

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function nextId(prefix: string, tick: number): string {
  return `${prefix}_${tick}_${Math.floor(Math.random() * 1e6)}`;
}

const WAREHOUSE_COMMODITIES = new Set<CommodityId>([
  'general',
  'supplies',
  'machinery',
  'electronics',
  'perishables',
]);

export function isWarehouseCommodityAllowed(id: CommodityId): boolean {
  return WAREHOUSE_COMMODITIES.has(id);
}

/**
 * Relative band for merging deposit into an existing lot.
 * Costs outside this band stay as separate piles (dynamic port buys).
 */
export const WAREHOUSE_LOT_MERGE_REL_BAND = 0.03;

/**
 * Bonded storage capacity by warehouse tier (literal klb → kg).
 * T1 5 klb · T2 10 klb · T3 15 klb · T4 Port Bonded ~99 klb (45 t).
 */
export const WAREHOUSE_CAPACITY_KG: Record<1 | 2 | 3 | 4, number> = {
  1: 2_268,
  2: 4_536,
  3: 6_804,
  4: 45_000,
};

/** Legacy caps before klb-literal T1/T2/T3 (5 t / 12 t). */
const LEGACY_WAREHOUSE_T1_CAP_KG = 5_000;
const LEGACY_WAREHOUSE_T2_CAP_KG = 12_000;

export type WarehouseTier = 1 | 2 | 3 | 4;

export function warehouseTierOf(tier: unknown): WarehouseTier {
  if (tier === 4) return 4;
  if (tier === 3) return 3;
  if (tier === 2) return 2;
  return 1;
}

/**
 * Remap saved WH row to current T1–T4.
 * Old T1 (~5 t) → T2; old T2 (~12 t) → T3; new caps keep declared tier.
 * `capacityKg = max(usedKg, tierCap)` so stock is never truncated.
 */
export function migrateWarehouseTierAndCapacity(opts: {
  tier: unknown;
  capacityKg: number;
  usedKg?: number;
}): { tier: WarehouseTier; capacityKg: number } {
  const rawCap = Math.max(0, Math.floor(opts.capacityKg));
  const usedKg = Math.max(0, Math.floor(opts.usedKg ?? 0));
  const declared = warehouseTierOf(opts.tier);

  const matchesNewCap = (t: WarehouseTier) =>
    rawCap === WAREHOUSE_CAPACITY_KG[t] ||
    Math.abs(rawCap - WAREHOUSE_CAPACITY_KG[t]) <= 2;

  let tier: WarehouseTier;
  if (matchesNewCap(4) || (declared === 4 && rawCap >= 40_000)) {
    tier = 4;
  } else if (matchesNewCap(1)) {
    tier = 1;
  } else if (matchesNewCap(2)) {
    tier = 2;
  } else if (matchesNewCap(3)) {
    tier = 3;
  } else if (
    rawCap >= LEGACY_WAREHOUSE_T2_CAP_KG - 500 ||
    (declared === 2 && rawCap >= 8_000)
  ) {
    // Legacy T2 (~10–12 t) → T3.
    tier = 3;
  } else if (rawCap >= LEGACY_WAREHOUSE_T1_CAP_KG - 500 || declared === 2) {
    // Legacy T1 (~5 t) or odd mid-cap T2 → T2.
    tier = 2;
  } else {
    tier = declared === 4 ? 4 : declared === 3 ? 3 : declared;
  }

  return {
    tier,
    capacityKg: Math.max(usedKg, WAREHOUSE_CAPACITY_KG[tier]),
  };
}

function costsWithinMergeBand(a: number, b: number): boolean {
  const mid = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) / mid <= WAREHOUSE_LOT_MERGE_REL_BAND;
}

export function emptyPlayerWarehouseState(): PlayerWarehouseState {
  return { warehouses: [], stock: [], inboundTransfers: [], demandHolds: [] };
}

export function normalizePlayerWarehouseState(
  raw: unknown,
): PlayerWarehouseState {
  if (!raw || typeof raw !== 'object') return emptyPlayerWarehouseState();
  const r = raw as Record<string, unknown>;

  // Parse stock first so usedKg can protect capacity on migrate.
  const stock: PlayerWarehousePile[] = [];
  if (Array.isArray(r.stock)) {
    for (const row of r.stock) {
      if (!row || typeof row !== 'object') continue;
      const s = row as Record<string, unknown>;
      const id = typeof s.id === 'string' ? s.id.trim() : '';
      const warehouseId =
        typeof s.warehouseId === 'string' ? s.warehouseId.trim() : '';
      const commodityId =
        typeof s.commodityId === 'string' ? s.commodityId.trim() : '';
      const kg =
        typeof s.kg === 'number' && Number.isFinite(s.kg)
          ? Math.max(0, Math.floor(s.kg))
          : 0;
      const avgCostUsdPerKg =
        typeof s.avgCostUsdPerKg === 'number' &&
        Number.isFinite(s.avgCostUsdPerKg)
          ? Math.max(0, money(s.avgCostUsdPerKg))
          : 0;
      const acquiredAtTick =
        typeof s.acquiredAtTick === 'number' &&
        Number.isFinite(s.acquiredAtTick)
          ? Math.max(0, Math.floor(s.acquiredAtTick))
          : 0;
      if (!id || !warehouseId || !commodityId || kg <= 0) continue;
      if (!isWarehouseCommodityAllowed(commodityId as CommodityId)) continue;
      stock.push({
        id,
        warehouseId,
        commodityId: commodityId as CommodityId,
        kg,
        avgCostUsdPerKg,
        acquiredAtTick,
      });
    }
  }

  const usedByWh = new Map<string, number>();
  for (const s of stock) {
    usedByWh.set(s.warehouseId, (usedByWh.get(s.warehouseId) ?? 0) + s.kg);
  }

  const warehouses: PlayerWarehouse[] = [];
  if (Array.isArray(r.warehouses)) {
    for (const row of r.warehouses) {
      if (!row || typeof row !== 'object') continue;
      const w = row as Record<string, unknown>;
      const id = typeof w.id === 'string' ? w.id.trim() : '';
      const icao =
        typeof w.icao === 'string' ? w.icao.trim().toUpperCase() : '';
      const capacityKgRaw =
        typeof w.capacityKg === 'number' && Number.isFinite(w.capacityKg)
          ? Math.max(0, Math.floor(w.capacityKg))
          : 0;
      if (!id || !icao || capacityKgRaw <= 0) continue;
      const lifetimeShippedKg =
        typeof w.lifetimeShippedKg === 'number' &&
        Number.isFinite(w.lifetimeShippedKg)
          ? Math.max(0, Math.floor(w.lifetimeShippedKg))
          : 0;
      const migrated = migrateWarehouseTierAndCapacity({
        tier: w.tier,
        capacityKg: capacityKgRaw,
        usedKg: usedByWh.get(id) ?? 0,
      });
      warehouses.push({
        id,
        icao,
        tier: migrated.tier,
        capacityKg: migrated.capacityKg,
        lifetimeShippedKg,
      });
    }
  }
  const inboundTransfers: WarehouseInboundTransfer[] = [];
  if (Array.isArray(r.inboundTransfers)) {
    for (const row of r.inboundTransfers) {
      if (!row || typeof row !== 'object') continue;
      const t = row as Record<string, unknown>;
      const id = typeof t.id === 'string' ? t.id.trim() : '';
      const warehouseId =
        typeof t.warehouseId === 'string' ? t.warehouseId.trim() : '';
      const hubIcao =
        typeof t.hubIcao === 'string' ? t.hubIcao.trim().toUpperCase() : '';
      const portId = typeof t.portId === 'string' ? t.portId.trim() : '';
      const listingId =
        typeof t.listingId === 'string' ? t.listingId.trim() : undefined;
      const commodityId =
        typeof t.commodityId === 'string'
          ? (t.commodityId as CommodityId)
          : null;
      const kg =
        typeof t.kg === 'number' && Number.isFinite(t.kg)
          ? Math.max(0, Math.floor(t.kg))
          : 0;
      const unitCostUsd =
        typeof t.unitCostUsd === 'number' && Number.isFinite(t.unitCostUsd)
          ? Math.max(0, money(t.unitCostUsd))
          : 0;
      const purchasedAtTick =
        typeof t.purchasedAtTick === 'number' &&
        Number.isFinite(t.purchasedAtTick)
          ? Math.max(0, Math.floor(t.purchasedAtTick))
          : 0;
      const readyAtTick =
        typeof t.readyAtTick === 'number' && Number.isFinite(t.readyAtTick)
          ? Math.max(0, Math.floor(t.readyAtTick))
          : 0;
      if (!id || !warehouseId || !hubIcao || !portId || !commodityId || kg <= 0) {
        continue;
      }
      inboundTransfers.push({
        id,
        warehouseId,
        hubIcao,
        portId,
        ...(listingId ? { listingId } : {}),
        commodityId,
        kg,
        unitCostUsd,
        purchasedAtTick,
        readyAtTick: Math.max(readyAtTick, purchasedAtTick),
      });
    }
  }
  const demandHolds: PlayerDemandHold[] = [];
  if (Array.isArray(r.demandHolds)) {
    for (const row of r.demandHolds) {
      if (!row || typeof row !== 'object') continue;
      const h = row as Record<string, unknown>;
      const id = typeof h.id === 'string' ? h.id.trim() : '';
      const kindRaw = typeof h.kind === 'string' ? h.kind.trim() : '';
      const kind: 'demand' | 'bridge' | 'haul' =
        kindRaw === 'bridge' ? 'bridge' : kindRaw === 'haul' ? 'haul' : 'demand';
      const orderId = typeof h.orderId === 'string' ? h.orderId.trim() : '';
      const destWarehouseId =
        typeof h.destWarehouseId === 'string' ? h.destWarehouseId.trim() : '';
      const warehouseId =
        typeof h.warehouseId === 'string' ? h.warehouseId.trim() : '';
      const originIcao =
        typeof h.originIcao === 'string'
          ? h.originIcao.trim().toUpperCase()
          : '';
      const destIcao =
        typeof h.destIcao === 'string' ? h.destIcao.trim().toUpperCase() : '';
      const commodityId =
        typeof h.commodityId === 'string'
          ? (h.commodityId as CommodityId)
          : null;
      const kg =
        typeof h.kg === 'number' && Number.isFinite(h.kg)
          ? Math.max(0, Math.floor(h.kg))
          : 0;
      const unitPriceUsd =
        typeof h.unitPriceUsd === 'number' && Number.isFinite(h.unitPriceUsd)
          ? Math.max(0, money(h.unitPriceUsd))
          : 0;
      const heldAtTick =
        typeof h.heldAtTick === 'number' && Number.isFinite(h.heldAtTick)
          ? Math.max(0, Math.floor(h.heldAtTick))
          : 0;
      const expiresAtTick =
        typeof h.expiresAtTick === 'number' && Number.isFinite(h.expiresAtTick)
          ? Math.max(0, Math.floor(h.expiresAtTick))
          : 0;
      if (
        !id ||
        !warehouseId ||
        !originIcao ||
        !destIcao ||
        !commodityId ||
        kg <= 0 ||
        !isWarehouseCommodityAllowed(commodityId)
      ) {
        continue;
      }
      if (kind === 'demand' && !orderId) continue;
      if (kind === 'bridge' && !destWarehouseId) continue;
      demandHolds.push({
        id,
        kind,
        ...(orderId ? { orderId } : {}),
        warehouseId,
        originIcao,
        destIcao,
        ...(destWarehouseId ? { destWarehouseId } : {}),
        commodityId,
        kg,
        unitPriceUsd,
        heldAtTick,
        expiresAtTick: Math.max(expiresAtTick, heldAtTick),
      });
    }
  }
  return { warehouses, stock, inboundTransfers, demandHolds };
}

export function ensurePlayerWarehouses(
  state: CareerMissionsState,
): PlayerWarehouseState {
  state.playerWarehouses = normalizePlayerWarehouseState(
    state.playerWarehouses,
  );
  return state.playerWarehouses;
}

export function findPlayerWarehouseAtIcao(
  state: CareerMissionsState,
  icao: string,
): PlayerWarehouse | undefined {
  const code = icao.trim().toUpperCase();
  return ensurePlayerWarehouses(state).warehouses.find(
    (w) => w.icao === code,
  );
}

export function warehouseUsedKg(
  state: CareerMissionsState,
  warehouseId: string,
): number {
  return ensurePlayerWarehouses(state)
    .stock.filter((s) => s.warehouseId === warehouseId)
    .reduce((sum, s) => sum + s.kg, 0);
}

export function warehouseFreeKg(
  state: CareerMissionsState,
  warehouseId: string,
): number {
  const wh = ensurePlayerWarehouses(state).warehouses.find(
    (w) => w.id === warehouseId,
  );
  if (!wh) return 0;
  return Math.max(0, wh.capacityKg - warehouseUsedKg(state, warehouseId));
}

/** Kg already committed to inbound transfers (not yet in stock). */
export function warehouseInboundPendingKg(
  state: CareerMissionsState,
  warehouseId: string,
): number {
  return ensurePlayerWarehouses(state)
    .inboundTransfers!.filter((t) => t.warehouseId === warehouseId)
    .reduce((sum, t) => sum + t.kg, 0);
}

/**
 * Free capacity after stock + inbound reservations (for port buy routing).
 */
export function warehouseInboundFreeKg(
  state: CareerMissionsState,
  warehouseId: string,
): number {
  const wh = ensurePlayerWarehouses(state).warehouses.find(
    (w) => w.id === warehouseId,
  );
  if (!wh) return 0;
  const committed =
    warehouseUsedKg(state, warehouseId) +
    warehouseInboundPendingKg(state, warehouseId);
  return Math.max(0, wh.capacityKg - committed);
}

export function warehouseReservedCommodityKg(
  state: CareerMissionsState,
  warehouseId: string,
  commodityId: CommodityId,
): number {
  const holds = state.playerWarehouses?.demandHolds ?? [];
  return holds
    .filter(
      (h) => h.warehouseId === warehouseId && h.commodityId === commodityId,
    )
    .reduce((sum, h) => sum + h.kg, 0);
}

export function warehouseFreeCommodityKg(
  state: CareerMissionsState,
  icao: string,
  commodityId: CommodityId,
): number {
  const wh = findPlayerWarehouseAtIcao(state, icao);
  if (!wh) return 0;
  const stock = ensurePlayerWarehouses(state)
    .stock.filter(
      (s) => s.warehouseId === wh.id && s.commodityId === commodityId && s.kg > 0,
    )
    .reduce((sum, s) => sum + s.kg, 0);
  return Math.max(0, stock - warehouseReservedCommodityKg(state, wh.id, commodityId));
}

/** Room at dest WH for incoming bridge holds (capacity minus stock, inbound, other bridges). */
export function warehouseBridgeDestRoomKg(
  state: CareerMissionsState,
  destWarehouseId: string,
  excludeHoldId?: string,
): number {
  const inboundFree = warehouseInboundFreeKg(state, destWarehouseId);
  const pledged = (state.playerWarehouses?.demandHolds ?? [])
    .filter(
      (h) =>
        (h.kind ?? 'demand') === 'bridge' &&
        h.destWarehouseId === destWarehouseId &&
        h.id !== excludeHoldId,
    )
    .reduce((sum, h) => sum + h.kg, 0);
  return Math.max(0, inboundFree - pledged);
}

export function depositCargoToWarehouse(
  state: CareerMissionsState,
  opts: {
    icao: string;
    commodityId: CommodityId;
    kg: number;
    avgCostUsdPerKg: number;
    tick: number;
  },
): PlayerWarehousePile {
  const kg = Math.max(0, Math.floor(opts.kg));
  if (kg <= 0) throw new Error('Deposit amount must be positive');
  if (!isWarehouseCommodityAllowed(opts.commodityId)) {
    throw new Error('Commodity not allowed in warehouse');
  }
  const wh = findPlayerWarehouseAtIcao(state, opts.icao);
  if (!wh) {
    throw new Error(`No warehouse at ${opts.icao.trim().toUpperCase()}`);
  }
  const free = warehouseFreeKg(state, wh.id);
  if (kg > free) {
    throw new Error(
      `Warehouse free capacity ${free.toLocaleString()} kg; need ${kg.toLocaleString()} kg`,
    );
  }

  const stock = ensurePlayerWarehouses(state).stock;
  const unit = Math.max(0, money(opts.avgCostUsdPerKg));
  // Prefer merging into the closest-cost lot within band (keeps distinct buy prices).
  const candidates = stock.filter(
    (s) =>
      s.warehouseId === wh.id &&
      s.commodityId === opts.commodityId &&
      costsWithinMergeBand(s.avgCostUsdPerKg, unit),
  );
  candidates.sort(
    (a, b) =>
      Math.abs(a.avgCostUsdPerKg - unit) - Math.abs(b.avgCostUsdPerKg - unit),
  );
  const existing = candidates[0];
  if (existing) {
    const totalKg = existing.kg + kg;
    existing.avgCostUsdPerKg = money(
      (existing.avgCostUsdPerKg * existing.kg + unit * kg) / totalKg,
    );
    existing.kg = totalKg;
    return { ...existing };
  }
  const pile: PlayerWarehousePile = {
    id: nextId('whpile', opts.tick),
    warehouseId: wh.id,
    commodityId: opts.commodityId,
    kg,
    avgCostUsdPerKg: unit,
    acquiredAtTick: opts.tick,
  };
  stock.push(pile);
  return { ...pile };
}

/** Deposit as much as fits in the WH; leftover becomes a port-yard pickup. */
export function depositCargoToWarehouseOrYard(
  state: CareerMissionsState,
  opts: {
    icao: string;
    commodityId: CommodityId;
    kg: number;
    avgCostUsdPerKg: number;
    tick: number;
    portId: string;
  },
): { storedKg: number; yardKg: number } {
  const kg = Math.max(0, Math.floor(opts.kg));
  if (kg <= 0) return { storedKg: 0, yardKg: 0 };
  const wh = findPlayerWarehouseAtIcao(state, opts.icao);
  const room = wh ? warehouseFreeKg(state, wh.id) : 0;
  const storedKg = Math.min(kg, room);
  const yardKg = kg - storedKg;
  if (storedKg > 0) {
    depositCargoToWarehouse(state, {
      icao: opts.icao,
      commodityId: opts.commodityId,
      kg: storedKg,
      avgCostUsdPerKg: opts.avgCostUsdPerKg,
      tick: opts.tick,
    });
  }
  if (yardKg > 0) {
    const pickup: PlayerPortPickup = {
      id: nextId('portpk', opts.tick),
      portId: opts.portId.trim().toUpperCase(),
      hubIcao: opts.icao.trim().toUpperCase(),
      commodityId: opts.commodityId,
      kg: yardKg,
      avgCostUsdPerKg: money(opts.avgCostUsdPerKg),
      purchasedAtTick: opts.tick,
    };
    if (!Array.isArray(state.portPickups)) state.portPickups = [];
    state.portPickups.push(pickup);
  }
  return { storedKg, yardKg };
}

/** Remove kg from warehouse piles at ICAO (FIFO by acquiredAtTick). */
export function withdrawCargoFromWarehouse(
  state: CareerMissionsState,
  opts: { icao: string; commodityId: CommodityId; kg: number },
): { kg: number; avgCostUsdPerKg: number; warehouseId: string } {
  const need = Math.max(0, Math.floor(opts.kg));
  if (need <= 0) throw new Error('Withdraw amount must be positive');
  const wh = findPlayerWarehouseAtIcao(state, opts.icao);
  if (!wh) {
    throw new Error(`No warehouse at ${opts.icao.trim().toUpperCase()}`);
  }
  const stock = ensurePlayerWarehouses(state).stock;
  const piles = stock
    .filter(
      (s) =>
        s.warehouseId === wh.id && s.commodityId === opts.commodityId && s.kg > 0,
    )
    .sort((a, b) => a.acquiredAtTick - b.acquiredAtTick);
  const available = piles.reduce((s, p) => s + p.kg, 0);
  if (available < need) {
    throw new Error(
      `Warehouse has ${available.toLocaleString()} kg ${opts.commodityId}; need ${need.toLocaleString()} kg`,
    );
  }

  let left = need;
  let costSum = 0;
  for (const pile of piles) {
    if (left <= 0) break;
    const take = Math.min(pile.kg, left);
    costSum += pile.avgCostUsdPerKg * take;
    pile.kg -= take;
    left -= take;
  }
  ensurePlayerWarehouses(state).stock = stock.filter((s) => s.kg > 0);

  return {
    kg: need,
    avgCostUsdPerKg: money(costSum / need),
    warehouseId: wh.id,
  };
}

/**
 * Non-mutating FIFO cost preview (same order as withdrawCargoFromWarehouse).
 * Returns null when needKg <= 0 or stock is insufficient.
 */
export function previewWithdrawCargoCost(
  piles: ReadonlyArray<{
    kg: number;
    avgCostUsdPerKg: number;
    acquiredAtTick: number;
  }>,
  needKg: number,
): { kg: number; avgCostUsdPerKg: number; costUsd: number } | null {
  const need = Math.max(0, Math.floor(needKg));
  if (need <= 0) return null;
  const ordered = [...piles]
    .filter((p) => p.kg > 0)
    .sort((a, b) => a.acquiredAtTick - b.acquiredAtTick);
  const available = ordered.reduce((s, p) => s + p.kg, 0);
  if (available < need) return null;
  let left = need;
  let costSum = 0;
  for (const pile of ordered) {
    if (left <= 0) break;
    const take = Math.min(pile.kg, left);
    costSum += pile.avgCostUsdPerKg * take;
    left -= take;
  }
  const avgCostUsdPerKg = money(costSum / need);
  return {
    kg: need,
    avgCostUsdPerKg,
    costUsd: money(avgCostUsdPerKg * need),
  };
}

/** Drop a warehouse stock lot (no refund) to free capacity. */
export function abandonWarehouseStock(
  state: CareerMissionsState,
  opts: { stockId: string },
): {
  kg: number;
  hubIcao: string;
  commodityId: CommodityId;
  warehouseId: string;
  avgCostUsdPerKg: number;
} {
  const whs = ensurePlayerWarehouses(state);
  const idx = whs.stock.findIndex((s) => s.id === opts.stockId.trim());
  if (idx < 0) throw new Error('Warehouse stock lot not found');
  const pile = whs.stock[idx]!;
  const wh = whs.warehouses.find((w) => w.id === pile.warehouseId);
  if (!wh) throw new Error('Warehouse for stock lot not found');
  const kg = pile.kg;
  const commodityId = pile.commodityId;
  const reserved = (whs.demandHolds ?? [])
    .filter(
      (h) => h.warehouseId === pile.warehouseId && h.commodityId === commodityId,
    )
    .reduce((sum, h) => sum + h.kg, 0);
  if (reserved > 0) {
    throw new Error(
      'Release the Demand hold on this commodity before abandoning the lot',
    );
  }
  const avgCostUsdPerKg = pile.avgCostUsdPerKg;
  const warehouseId = pile.warehouseId;
  const hubIcao = wh.icao;
  whs.stock.splice(idx, 1);
  return { kg, hubIcao, commodityId, warehouseId, avgCostUsdPerKg };
}

/** Credit Demand Board deliveries toward WH T2 unlock (idempotent per call). */
export function recordWarehouseShipmentKg(
  state: CareerMissionsState,
  opts: {
    warehouseId?: string;
    icao?: string;
    kg: number;
    /** Optional credit multiplier (e.g. wh_ops). Defaults to 1. */
    creditMult?: number;
  },
): number {
  const kg = Math.max(0, Math.floor(opts.kg));
  if (kg <= 0) return 0;
  const whs = ensurePlayerWarehouses(state);
  let wh =
    opts.warehouseId != null && opts.warehouseId.trim()
      ? whs.warehouses.find((w) => w.id === opts.warehouseId!.trim())
      : undefined;
  if (!wh && opts.icao) {
    wh = findPlayerWarehouseAtIcao(state, opts.icao);
  }
  if (!wh) return 0;
  const mult =
    typeof opts.creditMult === 'number' &&
    Number.isFinite(opts.creditMult) &&
    opts.creditMult > 0
      ? opts.creditMult
      : 1;
  const credited =
    mult >= 1
      ? Math.max(kg, Math.floor(kg * mult))
      : Math.max(0, Math.floor(kg * mult));
  wh.lifetimeShippedKg =
    Math.max(0, Math.floor(wh.lifetimeShippedKg ?? 0)) + credited;
  return wh.lifetimeShippedKg;
}
