/**
 * Warehouse stock helpers with no career-mission / career-fbo imports (avoids cycles).
 */

import type {
  CareerMissionsState,
  CommodityId,
  PlayerWarehouse,
  PlayerWarehousePile,
  PlayerWarehouseState,
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

/** Bonded storage capacity by warehouse tier. */
export const WAREHOUSE_CAPACITY_KG: Record<1 | 2, number> = {
  1: 5_000,
  2: 12_000,
};

export function warehouseTierOf(tier: unknown): 1 | 2 {
  return tier === 2 ? 2 : 1;
}

function costsWithinMergeBand(a: number, b: number): boolean {
  const mid = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) / mid <= WAREHOUSE_LOT_MERGE_REL_BAND;
}

export function emptyPlayerWarehouseState(): PlayerWarehouseState {
  return { warehouses: [], stock: [] };
}

export function normalizePlayerWarehouseState(
  raw: unknown,
): PlayerWarehouseState {
  if (!raw || typeof raw !== 'object') return emptyPlayerWarehouseState();
  const r = raw as Record<string, unknown>;
  const warehouses: PlayerWarehouse[] = [];
  if (Array.isArray(r.warehouses)) {
    for (const row of r.warehouses) {
      if (!row || typeof row !== 'object') continue;
      const w = row as Record<string, unknown>;
      const id = typeof w.id === 'string' ? w.id.trim() : '';
      const icao =
        typeof w.icao === 'string' ? w.icao.trim().toUpperCase() : '';
      const capacityKg =
        typeof w.capacityKg === 'number' && Number.isFinite(w.capacityKg)
          ? Math.max(0, Math.floor(w.capacityKg))
          : 0;
      if (!id || !icao || capacityKg <= 0) continue;
      const tier = warehouseTierOf(w.tier);
      const lifetimeShippedKg =
        typeof w.lifetimeShippedKg === 'number' &&
        Number.isFinite(w.lifetimeShippedKg)
          ? Math.max(0, Math.floor(w.lifetimeShippedKg))
          : 0;
      warehouses.push({
        id,
        icao,
        tier,
        capacityKg: Math.max(capacityKg, WAREHOUSE_CAPACITY_KG[tier]),
        lifetimeShippedKg,
      });
    }
  }
  const stock: PlayerWarehousePile[] = [];
  if (Array.isArray(r.stock)) {
    for (const row of r.stock) {
      if (!row || typeof row !== 'object') continue;
      const s = row as Record<string, unknown>;
      const id = typeof s.id === 'string' ? s.id.trim() : '';
      const warehouseId =
        typeof s.warehouseId === 'string' ? s.warehouseId.trim() : '';
      const commodityId =
        typeof s.commodityId === 'string'
          ? (s.commodityId as CommodityId)
          : null;
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
      stock.push({
        id,
        warehouseId,
        commodityId,
        kg,
        avgCostUsdPerKg,
        acquiredAtTick,
      });
    }
  }
  return { warehouses, stock };
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
  const avgCostUsdPerKg = pile.avgCostUsdPerKg;
  const warehouseId = pile.warehouseId;
  const hubIcao = wh.icao;
  whs.stock.splice(idx, 1);
  return { kg, hubIcao, commodityId, warehouseId, avgCostUsdPerKg };
}

/** Credit Demand Board deliveries toward WH T2 unlock (idempotent per call). */
export function recordWarehouseShipmentKg(
  state: CareerMissionsState,
  opts: { warehouseId?: string; icao?: string; kg: number },
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
  wh.lifetimeShippedKg = Math.max(0, Math.floor(wh.lifetimeShippedKg ?? 0)) + kg;
  return wh.lifetimeShippedKg;
}
