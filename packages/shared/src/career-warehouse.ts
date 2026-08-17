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
  depositCargoToWarehouse,
  ensurePlayerWarehouses,
  findPlayerWarehouseAtIcao,
  warehouseFreeKg,
  warehouseUsedKg,
  warehouseInboundPendingKg,
  WAREHOUSE_CAPACITY_KG,
} from './career-warehouse-stock.js';
import { whOpsCapexMultForWarehouse } from './career-ground-staff.js';
import type {
  CareerMissionsState,
  HubTier,
  PlayerPortPickup,
  PlayerWarehouse,
  PlayerWarehousePile,
  WarehouseInboundTransfer,
} from './types/career-economy.js';

export {
  abandonWarehouseStock,
  depositCargoToWarehouse,
  emptyPlayerWarehouseState,
  ensurePlayerWarehouses,
  findPlayerWarehouseAtIcao,
  migrateWarehouseTierAndCapacity,
  normalizePlayerWarehouseState,
  previewWithdrawCargoCost,
  recordWarehouseShipmentKg,
  warehouseFreeKg,
  warehouseInboundFreeKg,
  warehouseInboundPendingKg,
  warehouseUsedKg,
  withdrawCargoFromWarehouse,
  WAREHOUSE_CAPACITY_KG,
  WAREHOUSE_LOT_MERGE_REL_BAND,
} from './career-warehouse-stock.js';

/** Base port→WH transfer duration (economy ticks). */
export const WAREHOUSE_INBOUND_BASE_TICKS = 4;
/** Cap on transfer duration before logistics perk. */
export const WAREHOUSE_INBOUND_MAX_TICKS = 8;

/**
 * Economy ticks until port buy cargo arrives at WH.
 * Scales mildly with mass; logisticsMult &lt; 1 shortens (ground staff logistics perk).
 */
export function warehouseInboundTransferTicks(
  kg: number,
  logisticsMult: number = 1,
): number {
  const mass = Math.max(0, Math.floor(kg));
  let ticks = WAREHOUSE_INBOUND_BASE_TICKS;
  if (mass > 10_000) {
    ticks += Math.min(4, Math.ceil((mass - 10_000) / 8_000));
  }
  ticks = Math.min(WAREHOUSE_INBOUND_MAX_TICKS, Math.max(WAREHOUSE_INBOUND_BASE_TICKS, ticks));
  const mult =
    Number.isFinite(logisticsMult) && logisticsMult > 0 ? logisticsMult : 1;
  return Math.max(2, Math.round(ticks * mult));
}

export const WAREHOUSE_T1_CAPACITY_KG = WAREHOUSE_CAPACITY_KG[1];
export const WAREHOUSE_T2_CAPACITY_KG = WAREHOUSE_CAPACITY_KG[2];
export const WAREHOUSE_T3_CAPACITY_KG = WAREHOUSE_CAPACITY_KG[3];

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

/** CAPEX to upgrade T2 → T3 (~0.85× T2 table). */
export const WAREHOUSE_T3_UPGRADE_USD: Record<HubTier, number> = {
  spoke: 8_500,
  regional: 15_300,
  major: 27_200,
};

/**
 * Lifetime Demand Board kg that must leave this warehouse (settle) before T2
 * upgrade is purchasable.
 */
export const WAREHOUSE_T2_SHIPPED_KG = 5_000;

/** Lifetime shipped kg gate for T2 → T3. */
export const WAREHOUSE_T3_SHIPPED_KG = 12_000;

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
  'SUMU',
  'SPJC',
  'SEGU',
  'SKCG',
  'SKBQ',
  'SKCL',
  'SKBU',
  'SVMI',
  'SYCJ',
  'SYEC',
  'SMJP',
  'SMZO',
  'SOCA',
  'MPTO',
  'MPMG',
  'MRLM',
  'MROC',
  'MNMG',
  'MHLM',
  'MSLP',
  'MGGT',
  'MGSJ',
  'MZBZ',
  'MUHA',
  'MDSD',
  'MTPP',
  'MKJP',
  'MYNN',
  'TTPP',
  'TBPB',
  'TLPL',
  'TLPC',
  'TGPY',
  'TAPA',
  'TJSJ',
  'TFFR',
  'TFFF',
  'TNCC',
  'TNCM',
  'TNCA',
  'TIST',
  'LPPT',
  'LEBL',
  'LFML',
  'EGHI',
  'EDDH',
  'EHRD',
  'EBAW',
  'LIRN',
  'GMTT',
  'DAAG',
  'DTTA',
  'HEBA',
  'LLHA',
  'OEJN',
  'OEDF',
  'OMDB',
  'OMAA',
  'OTHH',
  'OBBI',
  'OKKK',
  'OOMS',
  'ORMM',
  'OIKB',
  'OJAQ',
  'OLBA',
  'OSLK',
  'HLMS',
  'HSPN',
  'OYAA',
  'OYHD',
  'OPKC',
  'VABB',
  'VOMM',
  'VECC',
  'VCBI',
  'UATE',
  'UTAK',
  'VGEG',
  'VYYY',
  'VTBU',
  'VTSP',
  'VVCI',
  'VVTS',
  'WMKK',
  'WSSS',
  'WIII',
  'WARR',
  'WIMM',
  'WBKK',
  'WBGG',
  'RPLL',
  'RPVM',
  'ZSPD',
  'ZGSZ',
  'RJTT',
  'RJBB',
  'RKSI',
  'RKPK',
  'RCTP',
  'RCKH',
  'YSSY',
  'YMML',
  'YBBN',
  'YPPH',
  'NZAA',
  'ZYTL',
  'ZSAM',
  'PHNL',
  'NFFN',
  'AYPY',
  'NWWW',
  'PGUM',
  'PGSN',
  'NTAA',
  'NTTB',
  'PTRO',
  'ANG',
  'NSTU',
  'NSFA',
  'NSAU',
  'NFTF',
  'NFTV',
  'NVVV',
  'NVSS',
  'AGGH',
  'AGGM',
  'NCRG',
  'NCAI',
  'NGTA',
  'PLCH',
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

export function quoteWarehouseTier3UpgradeUsd(
  world: Pick<CareerEconomyWorld, 'airports'>,
  icao: string,
): number {
  const ap = world.airports.find(
    (a) => a.icao.toUpperCase() === icao.trim().toUpperCase(),
  );
  return WAREHOUSE_T3_UPGRADE_USD[hubTierOf(ap ?? { icao })];
}

export function quoteWarehouseUpgradeUsd(
  world: Pick<CareerEconomyWorld, 'airports'>,
  warehouse: Pick<PlayerWarehouse, 'tier' | 'icao' | 'id'>,
  state?: Pick<CareerMissionsState, 'groundStaff'>,
): number | null {
  let base: number | null = null;
  if (warehouse.tier === 1) {
    base = quoteWarehouseTier2UpgradeUsd(world, warehouse.icao);
  } else if (warehouse.tier === 2) {
    base = quoteWarehouseTier3UpgradeUsd(world, warehouse.icao);
  } else {
    return null;
  }
  const mult = state
    ? whOpsCapexMultForWarehouse(state, warehouse.id)
    : 1;
  return money(base * mult);
}

export function warehouseUpgradeProgress(wh: PlayerWarehouse): {
  shippedKg: number;
  neededKg: number;
  unlocked: boolean;
  nextTier: 2 | 3 | null;
} {
  const shippedKg = Math.max(0, Math.floor(wh.lifetimeShippedKg ?? 0));
  if (wh.tier === 1) {
    return {
      shippedKg,
      neededKg: WAREHOUSE_T2_SHIPPED_KG,
      unlocked: shippedKg >= WAREHOUSE_T2_SHIPPED_KG,
      nextTier: 2,
    };
  }
  if (wh.tier === 2) {
    return {
      shippedKg,
      neededKg: WAREHOUSE_T3_SHIPPED_KG,
      unlocked: shippedKg >= WAREHOUSE_T3_SHIPPED_KG,
      nextTier: 3,
    };
  }
  return {
    shippedKg,
    neededKg: WAREHOUSE_T3_SHIPPED_KG,
    unlocked: false,
    nextTier: null,
  };
}

/** @deprecated Prefer warehouseUpgradeProgress. */
export function warehouseTier2Progress(wh: PlayerWarehouse): {
  shippedKg: number;
  neededKg: number;
  unlocked: boolean;
} {
  const progress = warehouseUpgradeProgress(wh);
  return {
    shippedKg: progress.shippedKg,
    neededKg: WAREHOUSE_T2_SHIPPED_KG,
    unlocked: wh.tier === 1 && progress.unlocked,
  };
}

/**
 * Upgrade an owned warehouse T1 → T2 or T2 → T3 (same ICAO).
 * Requires lifetime Demand Board shipped kg + CAPEX.
 */
export function upgradeWarehouse(
  state: CareerMissionsState,
  world: Pick<CareerEconomyWorld, 'airports' | 'tick'>,
  warehouseId: string,
): { warehouse: PlayerWarehouse; debitUsd: number } {
  const whs = ensurePlayerWarehouses(state);
  const warehouse = whs.warehouses.find((w) => w.id === warehouseId.trim());
  if (!warehouse) throw new Error(`Unknown warehouse ${warehouseId}`);
  if (warehouse.tier >= 3) {
    throw new Error(`Warehouse at ${warehouse.icao} is already Tier ${warehouse.tier}`);
  }
  const progress = warehouseUpgradeProgress(warehouse);
  if (!progress.nextTier || !progress.unlocked) {
    throw new Error(
      `Ship ${progress.neededKg.toLocaleString()} kg from ${warehouse.icao} via Demand Board before upgrading (have ${progress.shippedKg.toLocaleString()} kg)`,
    );
  }

  const debitUsd = quoteWarehouseUpgradeUsd(world, warehouse, state);
  if (debitUsd == null) {
    throw new Error(`Warehouse at ${warehouse.icao} cannot be upgraded further`);
  }
  if (state.walletUsd < debitUsd) {
    throw new Error(
      `Warehouse upgrade $${debitUsd.toLocaleString()} exceeds wallet $${state.walletUsd.toLocaleString()}`,
    );
  }

  const nextTier = progress.nextTier;
  const nextCap = WAREHOUSE_CAPACITY_KG[nextTier];
  applyWalletDelta(state, {
    amountUsd: -debitUsd,
    kind: 'warehouse_upgrade',
    atTick: world.tick,
    icao: warehouse.icao,
    note: `Warehouse T${nextTier} upgrade · ${warehouse.icao} · ${nextCap.toLocaleString()} kg`,
  });
  warehouse.tier = nextTier;
  warehouse.capacityKg = Math.max(warehouse.capacityKg, nextCap);
  return { warehouse, debitUsd };
}

/**
 * @deprecated Prefer upgradeWarehouse (T1→T2 or T2→T3).
 */
export function upgradeWarehouseToTier2(
  state: CareerMissionsState,
  world: Pick<CareerEconomyWorld, 'airports' | 'tick'>,
  warehouseId: string,
): { warehouse: PlayerWarehouse; debitUsd: number } {
  const whs = ensurePlayerWarehouses(state);
  const warehouse = whs.warehouses.find((w) => w.id === warehouseId.trim());
  if (!warehouse) throw new Error(`Unknown warehouse ${warehouseId}`);
  if (warehouse.tier !== 1) {
    throw new Error(
      warehouse.tier >= 2
        ? `Warehouse at ${warehouse.icao} is already Tier ${warehouse.tier}`
        : `Unknown warehouse ${warehouseId}`,
    );
  }
  return upgradeWarehouse(state, world, warehouseId);
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

/**
 * Deposit ready inbound transfers into WH stock; overflow → yard pickup.
 */
export function settleWarehouseInboundTransfers(
  state: CareerMissionsState,
  world: Pick<CareerEconomyWorld, 'tick'>,
): {
  deposited: WarehouseInboundTransfer[];
  yardOverflow: PlayerPortPickup[];
} {
  const pending = [...(ensurePlayerWarehouses(state).inboundTransfers ?? [])];
  if (pending.length === 0) return { deposited: [], yardOverflow: [] };

  const still: WarehouseInboundTransfer[] = [];
  const deposited: WarehouseInboundTransfer[] = [];
  const yardOverflow: PlayerPortPickup[] = [];
  const tick = world.tick;

  for (const tr of pending) {
    if (tr.readyAtTick > tick) {
      still.push(tr);
      continue;
    }
    const free = warehouseFreeKg(state, tr.warehouseId);
    const intoWh = Math.min(tr.kg, Math.max(0, free));
    const overflowKg = tr.kg - intoWh;
    if (intoWh > 0) {
      depositCargoToWarehouse(state, {
        icao: tr.hubIcao,
        commodityId: tr.commodityId,
        kg: intoWh,
        avgCostUsdPerKg: tr.unitCostUsd,
        tick,
      });
    }
    if (overflowKg > 0) {
      const pickup: PlayerPortPickup = {
        id: nextId('portpk', tick),
        portId: tr.portId,
        listingId: tr.listingId,
        hubIcao: tr.hubIcao,
        commodityId: tr.commodityId,
        kg: overflowKg,
        avgCostUsdPerKg: tr.unitCostUsd,
        purchasedAtTick: tick,
      };
      if (!Array.isArray(state.portPickups)) state.portPickups = [];
      state.portPickups.push(pickup);
      yardOverflow.push(pickup);
    }
    deposited.push({ ...tr });
  }

  // depositCargoToWarehouse re-normalizes warehouses — write still onto the live state.
  ensurePlayerWarehouses(state).inboundTransfers = still;
  return { deposited, yardOverflow };
}

export function playerWarehouseSnapshot(
  state: CareerMissionsState,
  world?: Pick<CareerEconomyWorld, 'airports'>,
): {
  warehouses: Array<
    PlayerWarehouse & {
      usedKg: number;
      freeKg: number;
      inboundKg: number;
      inboundFreeKg: number;
      lifetimeShippedKg: number;
      /** @deprecated Prefer shippedNeededForNextTierKg. */
      shippedNeededForT2Kg: number;
      shippedNeededForNextTierKg: number;
      nextTier: 2 | 3 | null;
      upgradeUsd: number | null;
      canUpgrade: boolean;
      hubTier: HubTier;
      countryId: string | null;
      lat: number | null;
      lon: number | null;
    }
  >;
  stock: PlayerWarehousePile[];
  inboundTransfers: WarehouseInboundTransfer[];
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
      const inboundKg = warehouseInboundPendingKg(state, w.id);
      const progress = warehouseUpgradeProgress(w);
      const ap = world?.airports.find(
        (a) => a.icao.toUpperCase() === w.icao.toUpperCase(),
      );
      const hubTier = hubTierOf(ap ?? { icao: w.icao });
      const upgradeUsd = world
        ? quoteWarehouseUpgradeUsd(world, w, state)
        : null;
      const countryId = ap?.region
        ? countryIdFromRegion(ap.region)
        : null;
      const coords = resolveAirportCoords(w.icao, ap ?? null);
      return {
        ...w,
        lifetimeShippedKg: progress.shippedKg,
        shippedNeededForT2Kg: progress.neededKg,
        shippedNeededForNextTierKg: progress.neededKg,
        nextTier: progress.nextTier,
        upgradeUsd,
        canUpgrade:
          progress.nextTier != null &&
          progress.unlocked &&
          upgradeUsd != null,
        hubTier,
        countryId:
          countryId && /^[A-Z]{2}$/.test(countryId) && countryId !== 'XX'
            ? countryId
            : null,
        lat: coords?.lat ?? null,
        lon: coords?.lon ?? null,
        usedKg,
        freeKg: Math.max(0, w.capacityKg - usedKg),
        inboundKg,
        inboundFreeKg: Math.max(0, w.capacityKg - usedKg - inboundKg),
      };
    }),
    stock: whs.stock.map((s) => ({ ...s })),
    inboundTransfers: (whs.inboundTransfers ?? []).map((t) => ({ ...t })),
    pickupHubs,
    buyUsdByIcao,
  };
}
