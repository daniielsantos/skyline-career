/**
 * Player warehouses at port pickup hubs — CAPEX storage for factory cargo.
 * Replaces FBO spot inventory for the Ports → Demand loop.
 */

import {
  airportByIcao,
  CAREER_HUB_COORDS,
  hubTierOf,
  resolveAirportCoords,
  type CareerEconomyWorld,
} from './career-economy.js';
import { applyWalletDelta } from './career-ledger.js';
import { countryIdFromRegion } from './career-partition.js';
import { economyDayIndex } from './career-weather.js';
import {
  ensurePlayerWarehouses,
  findPlayerWarehouseAtIcao,
  warehouseUsedKg,
  WAREHOUSE_CAPACITY_KG,
} from './career-warehouse-stock.js';
import type {
  CareerMissionsState,
  HubTier,
  PlayerWarehouse,
  PlayerWarehousePile,
} from './types/career-economy.js';

export {
  abandonWarehouseStock,
  depositCargoToWarehouse,
  emptyPlayerWarehouseState,
  ensurePlayerWarehouses,
  findPlayerWarehouseAtIcao,
  normalizePlayerWarehouseState,
  previewWithdrawCargoCost,
  recordWarehouseShipmentKg,
  warehouseFreeKg,
  warehouseUsedKg,
  withdrawCargoFromWarehouse,
  WAREHOUSE_CAPACITY_KG,
  WAREHOUSE_LOT_MERGE_REL_BAND,
} from './career-warehouse-stock.js';

export const WAREHOUSE_T1_CAPACITY_KG = WAREHOUSE_CAPACITY_KG[1];
export const WAREHOUSE_T2_CAPACITY_KG = WAREHOUSE_CAPACITY_KG[2];

/** CAPEX by hub tier (cheaper than FBO — storage only). */
export const WAREHOUSE_T1_BUY_USD: Record<HubTier, number> = {
  spoke: 12_000,
  regional: 22_000,
  major: 40_000,
};

/** CAPEX to upgrade T1 → T2 by hub tier. */
export const WAREHOUSE_T2_UPGRADE_USD: Record<HubTier, number> = {
  spoke: 10_000,
  regional: 18_000,
  major: 32_000,
};

/**
 * Lifetime Demand Board kg that must leave this warehouse (settle) before T2
 * upgrade is purchasable.
 */
export const WAREHOUSE_T2_SHIPPED_KG = 10_000;

/** Mirror FBO bonded storage rates. */
export const WAREHOUSE_STORAGE_USD_PER_KG_DAY = 0.02;
export const WAREHOUSE_STORAGE_VALUE_MULT = 2;

/** Must match CAREER_PORTS[*].pickupHubs (avoid career-ports import cycle). */
const PICKUP_HUB_SET = new Set([
  'SBGR',
  'SBKP',
  'SBCT',
  'SBRF',
  'SBEG',
  'SBPA',
  'SBBE',
  'SAEZ',
  'SAVC',
  'SCEL',
  'SCTE',
  'KMIA',
  'KEWR',
  'KIAH',
  'KLAX',
  'KSEA',
  'CYVR',
  'CYHZ',
  'MMVR',
  'MMZO',
  'MMUN',
]);

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function nextId(prefix: string, tick: number): string {
  return `${prefix}_${tick}_${Math.floor(Math.random() * 1e6)}`;
}

export function listPortPickupHubIcaos(): string[] {
  return [...PICKUP_HUB_SET].sort();
}

export function isPortPickupHub(icao: string): boolean {
  return PICKUP_HUB_SET.has(icao.trim().toUpperCase());
}

export function quoteWarehouseBuyUsd(
  world: Pick<CareerEconomyWorld, 'airports'>,
  icao: string,
): number {
  const ap = world.airports.find(
    (a) => a.icao.toUpperCase() === icao.trim().toUpperCase(),
  );
  return WAREHOUSE_T1_BUY_USD[hubTierOf(ap ?? { icao })];
}

export function buyWarehouseAtPickupHub(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  icao: string,
): { warehouse: PlayerWarehouse; debitUsd: number } {
  const code = icao.trim().toUpperCase();
  if (!isPortPickupHub(code)) {
    throw new Error(
      `${code} is not a port pickup hub — warehouses only at port feeders`,
    );
  }
  if (!CAREER_HUB_COORDS[code] && !airportByIcao(world, code)) {
    throw new Error(`Unknown hub ${code}`);
  }
  if (findPlayerWarehouseAtIcao(state, code)) {
    throw new Error(`Already own a warehouse at ${code}`);
  }

  const debitUsd = quoteWarehouseBuyUsd(world, code);
  if (state.walletUsd < debitUsd) {
    throw new Error(
      `Warehouse $${debitUsd.toLocaleString()} exceeds wallet $${state.walletUsd.toLocaleString()}`,
    );
  }

  const warehouses = ensurePlayerWarehouses(state);
  const warehouse: PlayerWarehouse = {
    id: nextId('wh', world.tick),
    icao: code,
    capacityKg: WAREHOUSE_T1_CAPACITY_KG,
    tier: 1,
    lifetimeShippedKg: 0,
  };
  warehouses.warehouses.push(warehouse);
  applyWalletDelta(state, {
    amountUsd: -debitUsd,
    kind: 'warehouse_buy',
    atTick: world.tick,
    icao: code,
    note: `Warehouse T1 · ${code} · ${WAREHOUSE_T1_CAPACITY_KG.toLocaleString()} kg`,
  });
  return { warehouse, debitUsd };
}

export function quoteWarehouseTier2UpgradeUsd(
  world: Pick<CareerEconomyWorld, 'airports'>,
  icao: string,
): number {
  const ap = world.airports.find(
    (a) => a.icao.toUpperCase() === icao.trim().toUpperCase(),
  );
  return WAREHOUSE_T2_UPGRADE_USD[hubTierOf(ap ?? { icao })];
}

export function warehouseTier2Progress(wh: PlayerWarehouse): {
  shippedKg: number;
  neededKg: number;
  unlocked: boolean;
} {
  const shippedKg = Math.max(0, Math.floor(wh.lifetimeShippedKg ?? 0));
  return {
    shippedKg,
    neededKg: WAREHOUSE_T2_SHIPPED_KG,
    unlocked: shippedKg >= WAREHOUSE_T2_SHIPPED_KG,
  };
}

/**
 * Upgrade an owned warehouse T1 → T2 (same ICAO).
 * Requires lifetime Demand Board shipped kg + CAPEX.
 */
export function upgradeWarehouseToTier2(
  state: CareerMissionsState,
  world: Pick<CareerEconomyWorld, 'airports' | 'tick'>,
  warehouseId: string,
): { warehouse: PlayerWarehouse; debitUsd: number } {
  const whs = ensurePlayerWarehouses(state);
  const warehouse = whs.warehouses.find((w) => w.id === warehouseId.trim());
  if (!warehouse) throw new Error(`Unknown warehouse ${warehouseId}`);
  if (warehouse.tier >= 2) {
    throw new Error(`Warehouse at ${warehouse.icao} is already Tier ${warehouse.tier}`);
  }
  const progress = warehouseTier2Progress(warehouse);
  if (!progress.unlocked) {
    throw new Error(
      `Ship ${progress.neededKg.toLocaleString()} kg from ${warehouse.icao} via Demand Board before upgrading (have ${progress.shippedKg.toLocaleString()} kg)`,
    );
  }

  const debitUsd = quoteWarehouseTier2UpgradeUsd(world, warehouse.icao);
  if (state.walletUsd < debitUsd) {
    throw new Error(
      `Warehouse upgrade $${debitUsd.toLocaleString()} exceeds wallet $${state.walletUsd.toLocaleString()}`,
    );
  }

  applyWalletDelta(state, {
    amountUsd: -debitUsd,
    kind: 'warehouse_upgrade',
    atTick: world.tick,
    icao: warehouse.icao,
    note: `Warehouse T2 upgrade · ${warehouse.icao} · ${WAREHOUSE_T2_CAPACITY_KG.toLocaleString()} kg`,
  });
  warehouse.tier = 2;
  warehouse.capacityKg = Math.max(
    warehouse.capacityKg,
    WAREHOUSE_T2_CAPACITY_KG,
  );
  return { warehouse, debitUsd };
}

function storageUsdPerKgDay(commodityId: PlayerWarehousePile['commodityId']): number {
  if (commodityId === 'electronics' || commodityId === 'machinery') {
    return WAREHOUSE_STORAGE_USD_PER_KG_DAY * WAREHOUSE_STORAGE_VALUE_MULT;
  }
  return WAREHOUSE_STORAGE_USD_PER_KG_DAY;
}

export type WarehouseStorageSettleResult = {
  debitUsd: number;
  requestedUsd: number;
  shortfallUsd: number;
  daysCharged: number;
};

export function settleWarehouseStorageFees(
  state: CareerMissionsState,
  opts: { fromTick: number; toTick: number },
): WarehouseStorageSettleResult {
  const daysCharged = Math.max(
    0,
    economyDayIndex(opts.toTick) - economyDayIndex(opts.fromTick),
  );
  const empty: WarehouseStorageSettleResult = {
    debitUsd: 0,
    requestedUsd: 0,
    shortfallUsd: 0,
    daysCharged: 0,
  };
  if (daysCharged <= 0) return empty;
  const whs = ensurePlayerWarehouses(state);
  if (whs.stock.length === 0) return { ...empty, daysCharged };

  let requestedUsd = 0;
  for (const pile of whs.stock) {
    requestedUsd += pile.kg * storageUsdPerKgDay(pile.commodityId) * daysCharged;
  }
  requestedUsd = money(requestedUsd);
  if (requestedUsd <= 0) return { ...empty, daysCharged };

  const debitUsd = money(Math.min(state.walletUsd, requestedUsd));
  const shortfallUsd = money(Math.max(0, requestedUsd - debitUsd));
  if (debitUsd > 0) {
    applyWalletDelta(state, {
      amountUsd: -debitUsd,
      kind: 'warehouse_storage',
      atTick: opts.toTick,
      note: `${daysCharged}d · ${whs.stock.length} pile(s)`,
    });
  }
  return { debitUsd, requestedUsd, shortfallUsd, daysCharged };
}

export function playerWarehouseSnapshot(
  state: CareerMissionsState,
  world?: Pick<CareerEconomyWorld, 'airports'>,
): {
  warehouses: Array<
    PlayerWarehouse & {
      usedKg: number;
      freeKg: number;
      lifetimeShippedKg: number;
      shippedNeededForT2Kg: number;
      upgradeUsd: number | null;
      canUpgrade: boolean;
      hubTier: HubTier;
      countryId: string | null;
      lat: number | null;
      lon: number | null;
    }
  >;
  stock: PlayerWarehousePile[];
  pickupHubs: string[];
  /** CAPEX quote per pickup hub (for Buy UI). */
  buyUsdByIcao: Record<string, number>;
} {
  const whs = ensurePlayerWarehouses(state);
  const pickupHubs = listPortPickupHubIcaos();
  const buyUsdByIcao: Record<string, number> = {};
  if (world) {
    for (const icao of pickupHubs) {
      buyUsdByIcao[icao] = quoteWarehouseBuyUsd(world, icao);
    }
  }
  return {
    warehouses: whs.warehouses.map((w) => {
      const usedKg = warehouseUsedKg(state, w.id);
      const progress = warehouseTier2Progress(w);
      const ap = world?.airports.find(
        (a) => a.icao.toUpperCase() === w.icao.toUpperCase(),
      );
      const hubTier = hubTierOf(ap ?? { icao: w.icao });
      const upgradeUsd =
        w.tier === 1 && world
          ? quoteWarehouseTier2UpgradeUsd(world, w.icao)
          : null;
      const countryId = ap?.region
        ? countryIdFromRegion(ap.region)
        : null;
      const coords = resolveAirportCoords(w.icao, ap ?? null);
      return {
        ...w,
        lifetimeShippedKg: progress.shippedKg,
        shippedNeededForT2Kg: progress.neededKg,
        upgradeUsd,
        canUpgrade: w.tier === 1 && progress.unlocked && upgradeUsd != null,
        hubTier,
        countryId:
          countryId && /^[A-Z]{2}$/.test(countryId) && countryId !== 'XX'
            ? countryId
            : null,
        lat: coords?.lat ?? null,
        lon: coords?.lon ?? null,
        usedKg,
        freeKg: Math.max(0, w.capacityKg - usedKg),
      };
    }),
    stock: whs.stock.map((s) => ({ ...s })),
    pickupHubs,
    buyUsdByIcao,
  };
}
