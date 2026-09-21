/**
 * Endgame seaport concessions + passive port inventory.
 * Operator buffs listings; restock is world-driven (no marketplace bids).
 */

import { applyWalletDelta } from './career-ledger.js';
import { LOCAL_COMPANY_ID } from './career-store-v3.js';
import { getCareerPort, listCareerPorts } from './career-ports.js';
import { ensurePlayerWarehouses } from './career-warehouse.js';
import type {
  CareerEconomyWorld,
  CareerMissionsState,
  CommodityId,
  PlayerPortConcession,
  PortConcessionIndexRow,
  PortConcessionLevel,
  PortInboundShip,
  PortInventoryRow,
} from './types/career-economy.js';

const PORT_CARGO: readonly CommodityId[] = [
  'general',
  'supplies',
  'machinery',
  'electronics',
];

/** Must match PORT_LISTINGS_PER_PORT in career-ports.ts. */
const PORT_LISTINGS_BASE = 4;

/** Soft stock caps (kg) by commodity. */
export const PORT_INVENTORY_CAP_KG: Record<CommodityId, number> = {
  general: 200_000,
  supplies: 180_000,
  perishables: 0,
  machinery: 80_000,
  electronics: 80_000,
  fuel: 0,
  mro_parts: 0,
};

/** Passive restock toward cap per economy day (96 ticks). */
export const PORT_RESTOCK_FRAC_PER_DAY = 0.08;
/** One discharge per economy day — cargo is cap × frac, computed on arrival. */
export const PORT_RESTOCK_INTERVAL_TICKS = 96;

export const PORT_CONCESSION_CLAIM_USD = 175_000;
/** Lease fee per economy day while concession is held (P1, idle). */
export const PORT_CONCESSION_LEASE_USD_PER_DAY = 2_500;
/** Initial / renew window length in economy days. */
export const PORT_CONCESSION_LEASE_DAYS = 7;
export const PORT_CONCESSION_LEASE_TICKS =
  PORT_CONCESSION_LEASE_DAYS * 96;
/** WH lifetime shipped kg gate at a pickup hub of the port. */
export const PORT_CONCESSION_SHIPPED_KG = 25_000;

/** P2 yard: larger soft caps (restock % unchanged → more kg per ship). */
export const PORT_P2_CAP_MULT = 1.35;
export const PORT_P2_UPGRADE_USD = 220_000;
/** Lifetime kg through this port (operator) to unlock P2. */
export const PORT_P2_THROUGHPUT_KG = 80_000;
export const PORT_P2_LEASE_LEVEL_MULT = 1.2;

/** P3: faster restock + listing slot + mild inbound ETA. Same buy discount as P1. */
export const PORT_P3_RESTOCK_FRAC_PER_DAY = 0.11;
export const PORT_P3_UPGRADE_USD = 280_000;
/** Lifetime kg through this port (operator) to unlock P3. */
export const PORT_P3_THROUGHPUT_KG = 180_000;
export const PORT_P3_LEASE_LEVEL_MULT = 1.4;
export const PORT_P3_EXTRA_LISTINGS = 1;
export const PORT_P3_ETA_MULT = 0.78;

/** Recent 7-day throughput that doubles the variable lease term (capped). */
export const PORT_LEASE_THROUGHPUT_REF_KG = 80_000;
export const PORT_LEASE_THROUGHPUT_MAX_MULT = 1.75;

export const PORT_OPERATOR_PRICE_MULT = 0.9;
export const PORT_OPERATOR_ETA_MULT = 0.85;
export const PORT_OPERATOR_EXTRA_LISTINGS = 1;

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function portOperatorLevel(
  world: CareerEconomyWorld,
  portId: string,
): PortConcessionLevel {
  const level = findActivePortOperator(world, portId)?.level;
  return level === 2 || level === 3 ? level : 1;
}

export function portInventoryCapKg(
  commodityId: CommodityId,
  opts?: { world?: CareerEconomyWorld; portId?: string },
): number {
  const base = PORT_INVENTORY_CAP_KG[commodityId] ?? 0;
  if (base <= 0) return 0;
  if (!opts?.world || !opts.portId) return base;
  return Math.floor(
    base * (portOperatorLevel(opts.world, opts.portId) >= 2 ? PORT_P2_CAP_MULT : 1),
  );
}

export function ensurePlayerPortConcessions(
  state: CareerMissionsState,
): PlayerPortConcession[] {
  if (!Array.isArray(state.playerPortConcessions)) {
    state.playerPortConcessions = [];
  }
  return state.playerPortConcessions;
}

/**
 * Merge this company's live Port FBOs into the world index.
 * Must not wipe other companies' rows (MP shared world).
 */
export function syncWorldPortConcessions(
  world: CareerEconomyWorld,
  state: CareerMissionsState,
  opts?: { companyId?: string; companyIds?: readonly string[] },
): void {
  let live = ensurePlayerPortConcessions(state).filter(
    (c) => c.leasePaidThroughTick > world.tick,
  );
  // Heal: company normalize used to drop playerPortConcessions on save while the
  // world index still had the row — restore before wiping the index.
  if (live.length === 0) {
    const orphans = (world.portConcessions ?? []).filter(
      (c) =>
        c.companyId === LOCAL_COMPANY_ID &&
        c.leasePaidThroughTick > world.tick,
    );
    if (orphans.length > 0) {
      const bag = ensurePlayerPortConcessions(state);
      for (const row of orphans) {
        bag.push({
          portId: row.portId,
          companyId: row.companyId,
          level: row.level === 2 || row.level === 3 ? row.level : 1,
          claimedAtTick: Math.max(
            0,
            row.leasePaidThroughTick - PORT_CONCESSION_LEASE_TICKS,
          ),
          leasePaidThroughTick: row.leasePaidThroughTick,
          lifetimeThroughputKg: 0,
        });
      }
      live = bag.filter((c) => c.leasePaidThroughTick > world.tick);
    }
  }

  const touch = new Set<string>();
  const optId = opts?.companyId?.trim();
  if (optId) touch.add(optId);
  for (const id of opts?.companyIds ?? []) {
    const t = id?.trim();
    if (t) touch.add(t);
  }
  for (const c of live) {
    if (c.companyId) touch.add(c.companyId);
  }
  if (touch.size === 0) touch.add(LOCAL_COMPANY_ID);

  const preserved = (world.portConcessions ?? []).filter(
    (c) =>
      c.leasePaidThroughTick > world.tick &&
      !touch.has(c.companyId),
  );
  const mine = live
    .filter((c) => touch.has(c.companyId))
    .map(
      (c): PortConcessionIndexRow => ({
        portId: c.portId,
        companyId: c.companyId,
        leasePaidThroughTick: c.leasePaidThroughTick,
        level: c.level === 2 || c.level === 3 ? c.level : 1,
      }),
    );
  world.portConcessions = [...preserved, ...mine];
}

/**
 * Rebuild Port FBO from ledger when claim was debited but company JSON dropped
 * the concession (normalize bug). Restores if lease window still open; otherwise
 * refunds CAPEX+lease once.
 */
export function healMissingPortConcessionFromLedger(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
): 'restored' | 'refunded' | 'none' {
  if (
    ensurePlayerPortConcessions(state).some(
      (c) => c.leasePaidThroughTick > world.tick,
    )
  ) {
    return 'none';
  }
  if (
    (world.portConcessions ?? []).some(
      (c) =>
        c.companyId === LOCAL_COMPANY_ID &&
        c.leasePaidThroughTick > world.tick,
    )
  ) {
    // syncWorldPortConcessions will pull these into player state.
    return 'none';
  }

  const ledger = state.ledger ?? [];
  let claimIdx = -1;
  for (let i = ledger.length - 1; i >= 0; i -= 1) {
    const e = ledger[i];
    if (!e || e.kind !== 'port_concession_claim') continue;
    if ((e.note ?? '').startsWith('Refund dropped Port FBO')) continue;
    if (e.amountUsd >= 0) continue;
    claimIdx = i;
    break;
  }
  if (claimIdx < 0) return 'none';
  const claim = ledger[claimIdx]!;

  const alreadyRefunded = ledger.some(
    (e) =>
      e.kind === 'port_concession_claim' &&
      e.amountUsd > 0 &&
      (e.note ?? '').startsWith('Refund dropped Port FBO') &&
      e.atTick >= claim.atTick,
  );
  if (alreadyRefunded) return 'none';

  const lease = ledger.find(
    (e) =>
      e.kind === 'port_concession_lease' &&
      e.amountUsd < 0 &&
      e.atTick === claim.atTick,
  );
  const hub = (claim.icao ?? '').trim().toUpperCase();
  const port =
    listCareerPorts().find((p) =>
      p.pickupHubs.some((h) => h.trim().toUpperCase() === hub),
    ) ?? null;
  if (!port) return 'none';

  const through = claim.atTick + PORT_CONCESSION_LEASE_TICKS;
  if (through > world.tick) {
    ensurePlayerPortConcessions(state).push({
      portId: port.id,
      companyId: LOCAL_COMPANY_ID,
      level: 1,
      claimedAtTick: claim.atTick,
      leasePaidThroughTick: through,
      lifetimeThroughputKg: 0,
    });
    syncWorldPortConcessions(world, state, { companyId: LOCAL_COMPANY_ID });
    return 'restored';
  }

  const refund = money(
    Math.abs(claim.amountUsd) + Math.abs(lease?.amountUsd ?? 0),
  );
  if (refund <= 0) return 'none';
  applyWalletDelta(state, {
    amountUsd: refund,
    kind: 'port_concession_claim',
    atTick: world.tick,
    icao: hub || port.pickupHubs[0],
    note: `Refund dropped Port FBO · ${port.name}`,
  });
  return 'refunded';
}

export function findActivePortOperator(
  world: CareerEconomyWorld,
  portId: string,
): PortConcessionIndexRow | undefined {
  const id = portId.trim().toUpperCase();
  return (world.portConcessions ?? []).find(
    (c) =>
      c.portId === id &&
      c.leasePaidThroughTick > world.tick &&
      Boolean(c.companyId),
  );
}

export function isPortOperator(
  world: CareerEconomyWorld,
  portId: string,
  companyId: string = LOCAL_COMPANY_ID,
): boolean {
  const op = findActivePortOperator(world, portId);
  return Boolean(op && op.companyId === companyId);
}

/**
 * Operator pricing / ETA / UI “yours” — exact operator **or** allied company
 * (VA members inherit Port FBO buy/ETA at ports the listed VA operates).
 * Desk mutations (auto-buy, scout, shuttle, claim) stay on {@link isPortOperator}.
 */
export function hasPortOperatorBenefits(
  world: CareerEconomyWorld,
  portId: string,
  companyId: string = LOCAL_COMPANY_ID,
  alliedCompanyIds?: readonly string[] | null,
): boolean {
  const op = findActivePortOperator(world, portId);
  if (!op?.companyId) return false;
  if (op.companyId === companyId) return true;
  if (!alliedCompanyIds?.length) return false;
  return alliedCompanyIds.some(
    (id) => id.trim() !== '' && id.trim() === op.companyId,
  );
}

export function portListingSlotCap(
  world: CareerEconomyWorld,
  portId: string,
): number {
  const op = findActivePortOperator(world, portId);
  if (!op) return PORT_LISTINGS_BASE;
  return (
    PORT_LISTINGS_BASE +
    PORT_OPERATOR_EXTRA_LISTINGS +
    (portOperatorLevel(world, portId) >= 3 ? PORT_P3_EXTRA_LISTINGS : 0)
  );
}

/** Daily inbound discharge as a fraction of yard cap. */
export function portRestockFracPerDay(
  world: CareerEconomyWorld,
  portId: string,
): number {
  return portOperatorLevel(world, portId) >= 3
    ? PORT_P3_RESTOCK_FRAC_PER_DAY
    : PORT_RESTOCK_FRAC_PER_DAY;
}

/** Port→WH inbound duration multiplier (1 = default). No extra buy discount. */
export function portOperatorEtaMult(
  world: CareerEconomyWorld,
  portId: string,
  companyId: string = LOCAL_COMPANY_ID,
  alliedCompanyIds?: readonly string[] | null,
): number {
  if (!hasPortOperatorBenefits(world, portId, companyId, alliedCompanyIds)) {
    return 1;
  }
  return portOperatorLevel(world, portId) >= 3
    ? PORT_P3_ETA_MULT
    : PORT_OPERATOR_ETA_MULT;
}

export function ensurePortInventories(
  world: CareerEconomyWorld,
): PortInventoryRow[] {
  if (!Array.isArray(world.portInventories)) {
    world.portInventories = [];
  }
  const rows = world.portInventories;
  const byKey = new Map<string, PortInventoryRow>(
    rows.map((r) => [`${r.portId}:${r.commodityId}`, r] as const),
  );
  const rng = mulberry32(hashSeed(`${world.seed}:port-inv`));
  for (const port of listCareerPorts()) {
    for (const commodityId of PORT_CARGO) {
      const key = `${port.id}:${commodityId}`;
      if (byKey.has(key)) continue;
      const cap = portInventoryCapKg(commodityId);
      const seeded = Math.floor(cap * (0.45 + rng() * 0.35));
      const row: PortInventoryRow = {
        portId: port.id,
        commodityId,
        stockKg: seeded,
        lastRestockTick: world.tick,
      };
      rows.push(row);
      byKey.set(key, row);
    }
  }
  return rows;
}

export function getPortInventoryStock(
  world: CareerEconomyWorld,
  portId: string,
  commodityId: CommodityId,
): number {
  ensurePortInventories(world);
  const id = portId.trim().toUpperCase();
  const row = (world.portInventories ?? []).find(
    (r) => r.portId === id && r.commodityId === commodityId,
  );
  return row?.stockKg ?? 0;
}

function restockKgForArrival(
  world: CareerEconomyWorld,
  portId: string,
  commodityId: CommodityId,
): number {
  const cap = portInventoryCapKg(commodityId, { world, portId });
  if (cap <= 0) return 0;
  const stock = getPortInventoryStock(world, portId, commodityId);
  const room = Math.max(0, cap - stock);
  const add = Math.floor(cap * portRestockFracPerDay(world, portId));
  return Math.min(room, add);
}

function dischargePortShip(world: CareerEconomyWorld, portId: string): void {
  for (const commodityId of PORT_CARGO) {
    const add = restockKgForArrival(world, portId, commodityId);
    if (add > 0) creditPortInventory(world, portId, commodityId, add);
  }
  const id = portId.trim().toUpperCase();
  for (const row of world.portInventories ?? []) {
    if (row.portId === id) row.lastRestockTick = world.tick;
  }
}

function portLastRestockTick(world: CareerEconomyWorld, portId: string): number {
  const id = portId.trim().toUpperCase();
  let last = 0;
  for (const row of world.portInventories ?? []) {
    if (row.portId !== id) continue;
    last = Math.max(last, row.lastRestockTick ?? 0);
  }
  return last;
}

/**
 * Economy-tick restock: one inbound ship per port per economy day.
 * Catch-up discharges missed ships (offline days). Does not spawn listings.
 */
export function tickPortInboundShips(world: CareerEconomyWorld): void {
  ensurePortInventories(world);
  if (!Array.isArray(world.portInboundShips)) {
    world.portInboundShips = [];
  }
  const next: PortInboundShip[] = [];
  const seen = new Set<string>();

  for (const ship of world.portInboundShips) {
    const portId = String(ship.portId ?? '').trim().toUpperCase();
    if (!portId || seen.has(portId)) continue;
    seen.add(portId);
    let arrives = Math.floor(Number(ship.arrivesAtTick) || 0);
    if (arrives <= 0) {
      arrives = world.tick + PORT_RESTOCK_INTERVAL_TICKS;
    }
    while (arrives <= world.tick) {
      dischargePortShip(world, portId);
      arrives += PORT_RESTOCK_INTERVAL_TICKS;
    }
    next.push({ portId, arrivesAtTick: arrives });
  }

  for (const port of listCareerPorts()) {
    if (seen.has(port.id)) continue;
    const baseline = portLastRestockTick(world, port.id);
    let arrives = baseline + PORT_RESTOCK_INTERVAL_TICKS;
    if (arrives <= 0) arrives = world.tick + PORT_RESTOCK_INTERVAL_TICKS;
    while (arrives <= world.tick) {
      dischargePortShip(world, port.id);
      arrives += PORT_RESTOCK_INTERVAL_TICKS;
    }
    next.push({ portId: port.id, arrivesAtTick: arrives });
  }

  world.portInboundShips = next;
}

/** @deprecated Use tickPortInboundShips — kept for tests and debug time-skip. */
export function ensurePortInventoryRestock(world: CareerEconomyWorld): void {
  tickPortInboundShips(world);
}

export function estimatePortInboundCargo(
  world: CareerEconomyWorld,
  portId: string,
): Array<{ commodityId: CommodityId; kg: number }> {
  const id = portId.trim().toUpperCase();
  return PORT_CARGO.map((commodityId) => ({
    commodityId,
    kg: restockKgForArrival(world, id, commodityId),
  }));
}

export function portInboundShipFor(
  world: CareerEconomyWorld,
  portId: string,
): PortInboundShip | undefined {
  const id = portId.trim().toUpperCase();
  return (world.portInboundShips ?? []).find((s) => s.portId === id);
}

export function nextPortDischargeTick(
  world: CareerEconomyWorld,
  portId: string,
): number {
  const ship = portInboundShipFor(world, portId);
  if (ship && ship.arrivesAtTick > 0) return ship.arrivesAtTick;
  return portLastRestockTick(world, portId) + PORT_RESTOCK_INTERVAL_TICKS;
}

export function debitPortInventory(
  world: CareerEconomyWorld,
  portId: string,
  commodityId: CommodityId,
  kg: number,
): number {
  const rows = ensurePortInventories(world);
  const id = portId.trim().toUpperCase();
  const row = rows.find(
    (r) => r.portId === id && r.commodityId === commodityId,
  );
  if (!row) return 0;
  const take = Math.min(row.stockKg, Math.max(0, Math.floor(kg)));
  row.stockKg -= take;
  return take;
}

export function creditPortInventory(
  world: CareerEconomyWorld,
  portId: string,
  commodityId: CommodityId,
  kg: number,
): void {
  const rows = ensurePortInventories(world);
  const id = portId.trim().toUpperCase();
  let row = rows.find(
    (r) => r.portId === id && r.commodityId === commodityId,
  );
  if (!row) {
    row = {
      portId: id,
      commodityId,
      stockKg: 0,
      lastRestockTick: world.tick,
    };
    rows.push(row);
  }
  const cap = portInventoryCapKg(commodityId, { world, portId: id });
  row.stockKg = Math.min(
    cap > 0 ? cap : row.stockKg + kg,
    row.stockKg + Math.max(0, Math.floor(kg)),
  );
}

/**
 * Stock factor for listing quotes: full stock cheaper, empty closer to ceiling.
 * Returns multiplier around 1 (≈0.88–1.18).
 */
export function portStockPriceFactor(
  world: CareerEconomyWorld,
  portId: string,
  commodityId: CommodityId,
): number {
  const cap = portInventoryCapKg(commodityId, { world, portId });
  if (cap <= 0) return 1;
  const stock = getPortInventoryStock(world, portId, commodityId);
  const frac = Math.min(1, Math.max(0, stock / cap));
  // frac=1 → 0.88; frac=0 → 1.18
  return 1.18 - frac * 0.3;
}

const THROUGHPUT_WINDOW_DAYS = 7;

function economyDayIndex(tick: number): number {
  return Math.floor(Math.max(0, tick) / 96);
}

export function alignConcessionThroughputWindow(
  conc: PlayerPortConcession,
  tick: number,
): number[] {
  const day = economyDayIndex(tick);
  let window = Array.isArray(conc.throughputWindowKg)
    ? conc.throughputWindowKg.map((n) =>
        Math.max(0, Math.floor(Number(n) || 0)),
      )
    : [];
  if (window.length !== THROUGHPUT_WINDOW_DAYS) {
    window = Array.from({ length: THROUGHPUT_WINDOW_DAYS }, () => 0);
    conc.throughputWindowDay = day;
    conc.throughputWindowKg = window;
    return window;
  }
  const prev = conc.throughputWindowDay ?? day;
  const shift = day - prev;
  if (shift > 0) {
    if (shift >= THROUGHPUT_WINDOW_DAYS) {
      window = Array.from({ length: THROUGHPUT_WINDOW_DAYS }, () => 0);
    } else {
      window = [
        ...Array.from({ length: shift }, () => 0),
        ...window.slice(0, THROUGHPUT_WINDOW_DAYS - shift),
      ];
    }
    conc.throughputWindowDay = day;
    conc.throughputWindowKg = window;
  } else if (conc.throughputWindowDay == null) {
    conc.throughputWindowDay = day;
  }
  return window;
}

export function recentPortThroughputKg(
  conc: PlayerPortConcession,
  tick: number,
): number {
  return alignConcessionThroughputWindow(conc, tick).reduce(
    (s, n) => s + n,
    0,
  );
}

export function concessionLeaseUsdPerDay(
  conc: PlayerPortConcession,
  tick: number,
): number {
  const level = conc.level ?? 1;
  const levelMult =
    level >= 3
      ? PORT_P3_LEASE_LEVEL_MULT
      : level >= 2
        ? PORT_P2_LEASE_LEVEL_MULT
        : 1;
  const recent = recentPortThroughputKg(conc, tick);
  const tMult =
    1 +
    Math.min(
      PORT_LEASE_THROUGHPUT_MAX_MULT - 1,
      recent / PORT_LEASE_THROUGHPUT_REF_KG,
    );
  return money(PORT_CONCESSION_LEASE_USD_PER_DAY * levelMult * tMult);
}

export function concessionLeaseUsdForDays(
  conc: PlayerPortConcession,
  tick: number,
  days: number,
): number {
  return money(
    concessionLeaseUsdPerDay(conc, tick) * Math.max(1, Math.floor(days)),
  );
}

export type PortConcessionUpgradeGate = {
  ok: boolean;
  reasons: string[];
  upgradeUsd: number;
  neededKg: number;
  shippedKg: number;
  fromLevel: PortConcessionLevel;
  toLevel: PortConcessionLevel;
};

export type PortConcessionClaimGate = {
  ok: boolean;
  reasons: string[];
  claimUsd: number;
  leaseUsd: number;
  leaseDays: number;
  shippedKg: number;
  shippedNeededKg: number;
  hasTier3Warehouse: boolean;
  alreadyHoldsConcession: boolean;
  portOccupied: boolean;
};

export function evaluatePortConcessionClaim(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  portId: string,
  companyId: string = LOCAL_COMPANY_ID,
): PortConcessionClaimGate {
  const port = getCareerPort(portId);
  const reasons: string[] = [];
  if (!port) {
    return {
      ok: false,
      reasons: ['Unknown port'],
      claimUsd: PORT_CONCESSION_CLAIM_USD,
      leaseUsd: money(
        PORT_CONCESSION_LEASE_USD_PER_DAY * PORT_CONCESSION_LEASE_DAYS,
      ),
      leaseDays: PORT_CONCESSION_LEASE_DAYS,
      shippedKg: 0,
      shippedNeededKg: PORT_CONCESSION_SHIPPED_KG,
      hasTier3Warehouse: false,
      alreadyHoldsConcession: false,
      portOccupied: false,
    };
  }

  const concessions = ensurePlayerPortConcessions(state);
  const alreadyHoldsConcession = concessions.some(
    (c) =>
      c.companyId === companyId && c.leasePaidThroughTick > world.tick,
  );
  const occupied = findActivePortOperator(world, port.id);
  const portOccupied = Boolean(occupied && occupied.companyId !== companyId);

  const warehouses = ensurePlayerWarehouses(state).warehouses;
  const atPickup = warehouses.filter((w) =>
    port.pickupHubs.includes(w.icao.trim().toUpperCase()),
  );
  const best = atPickup
    .slice()
    .sort(
      (a, b) =>
        (b.lifetimeShippedKg ?? 0) - (a.lifetimeShippedKg ?? 0) ||
        b.tier - a.tier,
    )[0];
  const hasTier3Warehouse = Boolean(best && best.tier >= 3);
  const shippedKg = best?.lifetimeShippedKg ?? 0;

  if (alreadyHoldsConcession) {
    reasons.push('Company already holds an active Port FBO');
  }
  if (portOccupied) {
    reasons.push('Port already has an active Port FBO operator');
  }
  if (!hasTier3Warehouse) {
    reasons.push(
      `Need a T3 warehouse at a pickup hub (${port.pickupHubs.join(', ')})`,
    );
  }
  if (shippedKg < PORT_CONCESSION_SHIPPED_KG) {
    reasons.push(
      `Need ${PORT_CONCESSION_SHIPPED_KG.toLocaleString()} kg shipped from that WH (have ${shippedKg.toLocaleString()})`,
    );
  }
  const leaseUsd = money(
    PORT_CONCESSION_LEASE_USD_PER_DAY * PORT_CONCESSION_LEASE_DAYS,
  );
  const totalDue = money(PORT_CONCESSION_CLAIM_USD + leaseUsd);
  if (state.walletUsd < totalDue) {
    reasons.push(
      `Need $${totalDue.toLocaleString()} (claim + first lease window)`,
    );
  }

  return {
    ok: reasons.length === 0,
    reasons,
    claimUsd: PORT_CONCESSION_CLAIM_USD,
    leaseUsd,
    leaseDays: PORT_CONCESSION_LEASE_DAYS,
    shippedKg,
    shippedNeededKg: PORT_CONCESSION_SHIPPED_KG,
    hasTier3Warehouse,
    alreadyHoldsConcession,
    portOccupied,
  };
}

export function claimPortConcession(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { portId: string; companyId?: string },
): PlayerPortConcession {
  const companyId = opts.companyId ?? LOCAL_COMPANY_ID;
  const port = getCareerPort(opts.portId);
  if (!port) throw new Error('Unknown port');
  const gate = evaluatePortConcessionClaim(state, world, port.id, companyId);
  if (!gate.ok) {
    throw new Error(gate.reasons[0] ?? 'Cannot claim Port FBO');
  }

  applyWalletDelta(state, {
    amountUsd: -gate.claimUsd,
    kind: 'port_concession_claim',
    atTick: world.tick,
    icao: port.pickupHubs[0],
    note: `Claim Port FBO · ${port.name}`,
  });
  applyWalletDelta(state, {
    amountUsd: -gate.leaseUsd,
    kind: 'port_concession_lease',
    atTick: world.tick,
    icao: port.pickupHubs[0],
    note: `Lease ${gate.leaseDays}d · ${port.name}`,
  });

  const row: PlayerPortConcession = {
    portId: port.id,
    companyId,
    level: 1,
    claimedAtTick: world.tick,
    leasePaidThroughTick: world.tick + PORT_CONCESSION_LEASE_TICKS,
    lifetimeThroughputKg: 0,
  };
  // Drop any expired rows for this company, then add.
  state.playerPortConcessions = ensurePlayerPortConcessions(state).filter(
    (c) =>
      !(c.companyId === companyId && c.leasePaidThroughTick <= world.tick),
  );
  state.playerPortConcessions.push(row);
  syncWorldPortConcessions(world, state, { companyId });
  return row;
}

export function renewPortConcession(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { portId: string; companyId?: string; days?: number },
): PlayerPortConcession {
  const companyId = opts.companyId ?? LOCAL_COMPANY_ID;
  const port = getCareerPort(opts.portId);
  if (!port) throw new Error('Unknown port');
  const days = Math.max(
    1,
    Math.floor(opts.days ?? PORT_CONCESSION_LEASE_DAYS),
  );
  const conc = ensurePlayerPortConcessions(state).find(
    (c) =>
      c.portId === port.id &&
      c.companyId === companyId &&
      c.leasePaidThroughTick > world.tick,
  );
  if (!conc) {
    throw new Error('No active Port FBO to renew on this port');
  }
  const leaseUsd = concessionLeaseUsdForDays(
    conc,
    world.tick,
    days,
  );
  if (state.walletUsd < leaseUsd) {
    throw new Error(
      `Lease renew $${leaseUsd.toLocaleString()} exceeds wallet`,
    );
  }
  applyWalletDelta(state, {
    amountUsd: -leaseUsd,
    kind: 'port_concession_lease',
    atTick: world.tick,
    icao: port.pickupHubs[0],
    note: `Renew Port FBO lease ${days}d · ${port.name}`,
  });
  const base = Math.max(conc.leasePaidThroughTick, world.tick);
  conc.leasePaidThroughTick = base + days * 96;
  syncWorldPortConcessions(world, state, { companyId });
  return conc;
}

export function evaluatePortConcessionUpgrade(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  portId: string,
  companyId: string = LOCAL_COMPANY_ID,
): PortConcessionUpgradeGate {
  const port = getCareerPort(portId);
  const reasons: string[] = [];
  const conc = port
    ? ensurePlayerPortConcessions(state).find(
        (c) =>
          c.portId === port.id &&
          c.companyId === companyId &&
          c.leasePaidThroughTick > world.tick,
      )
    : undefined;
  const fromLevel: PortConcessionLevel =
    conc?.level === 2 || conc?.level === 3 ? conc.level : 1;
  const shippedKg = conc?.lifetimeThroughputKg ?? 0;
  const toLevel: PortConcessionLevel =
    fromLevel === 1 ? 2 : fromLevel === 2 ? 3 : 3;
  const upgradeUsd =
    fromLevel === 1
      ? PORT_P2_UPGRADE_USD
      : fromLevel === 2
        ? PORT_P3_UPGRADE_USD
        : 0;
  const neededKg =
    fromLevel === 1
      ? PORT_P2_THROUGHPUT_KG
      : fromLevel === 2
        ? PORT_P3_THROUGHPUT_KG
        : PORT_P3_THROUGHPUT_KG;
  if (!port) reasons.push('Unknown port');
  if (!conc) reasons.push('No active Port FBO on this port');
  if (conc && fromLevel >= 3) reasons.push('Port is already at P3');
  if (conc && fromLevel < 3 && shippedKg < neededKg) {
    reasons.push(
      `Need ${neededKg.toLocaleString()} kg throughput at this port (have ${shippedKg.toLocaleString()})`,
    );
  }
  if (upgradeUsd > 0 && state.walletUsd < upgradeUsd) {
    reasons.push(
      fromLevel === 1
        ? `Need $${upgradeUsd.toLocaleString()} to enlarge the yard`
        : `Need $${upgradeUsd.toLocaleString()} for P3 terminal cadence`,
    );
  }
  return {
    ok: reasons.length === 0,
    reasons,
    upgradeUsd,
    neededKg,
    shippedKg,
    fromLevel,
    toLevel,
  };
}

export function upgradePortConcession(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { portId: string; companyId?: string },
): PlayerPortConcession {
  const companyId = opts.companyId ?? LOCAL_COMPANY_ID;
  const port = getCareerPort(opts.portId);
  if (!port) throw new Error('Unknown port');
  const gate = evaluatePortConcessionUpgrade(state, world, port.id, companyId);
  if (!gate.ok) {
    throw new Error(gate.reasons[0] ?? 'Cannot upgrade Port FBO');
  }
  const conc = ensurePlayerPortConcessions(state).find(
    (c) =>
      c.portId === port.id &&
      c.companyId === companyId &&
      c.leasePaidThroughTick > world.tick,
  );
  if (!conc) throw new Error('No active Port FBO on this port');
  applyWalletDelta(state, {
    amountUsd: -gate.upgradeUsd,
    kind: 'port_concession_upgrade',
    atTick: world.tick,
    icao: port.pickupHubs[0],
    note: `Port FBO · P${gate.toLevel} · ${port.name}`,
  });
  conc.level = gate.toLevel;
  syncWorldPortConcessions(world, state, { companyId });
  return conc;
}

/** Drop expired concessions from company + world index. */
export function tickPortConcessions(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
): boolean {
  const before = ensurePlayerPortConcessions(state);
  const touchIds = [...new Set(before.map((c) => c.companyId).filter(Boolean))];
  state.playerPortConcessions = before.filter(
    (c) => c.leasePaidThroughTick > world.tick,
  );
  syncWorldPortConcessions(world, state, { companyIds: touchIds });
  // Also prune world index orphans (all companies).
  world.portConcessions = (world.portConcessions ?? []).filter(
    (c) => c.leasePaidThroughTick > world.tick,
  );
  return state.playerPortConcessions.length !== before.length;
}

export function creditPortOperatorThroughput(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  portId: string,
  kg: number,
): void {
  const op = findActivePortOperator(world, portId);
  if (!op) return;
  const conc = ensurePlayerPortConcessions(state).find(
    (c) =>
      c.portId === op.portId &&
      c.companyId === op.companyId &&
      c.leasePaidThroughTick > world.tick,
  );
  if (!conc) return;
  const add = Math.max(0, Math.floor(kg));
  conc.lifetimeThroughputKg = (conc.lifetimeThroughputKg ?? 0) + add;
  const window = alignConcessionThroughputWindow(conc, world.tick);
  window[0] = (window[0] ?? 0) + add;
}

export function portInventorySnapshot(
  world: CareerEconomyWorld,
  portId: string,
): Array<{ commodityId: CommodityId; stockKg: number; capKg: number }> {
  ensurePortInventories(world);
  const id = portId.trim().toUpperCase();
  return PORT_CARGO.map((commodityId) => ({
    commodityId,
    stockKg: getPortInventoryStock(world, id, commodityId),
    capKg: portInventoryCapKg(commodityId, { world, portId: id }),
  }));
}
