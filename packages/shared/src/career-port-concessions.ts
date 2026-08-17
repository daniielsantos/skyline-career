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

export const PORT_CONCESSION_CLAIM_USD = 175_000;
/** Lease fee per economy day while concession is held. */
export const PORT_CONCESSION_LEASE_USD_PER_DAY = 2_500;
/** Initial / renew window length in economy days. */
export const PORT_CONCESSION_LEASE_DAYS = 7;
export const PORT_CONCESSION_LEASE_TICKS =
  PORT_CONCESSION_LEASE_DAYS * 96;
/** WH lifetime shipped kg gate at a pickup hub of the port. */
export const PORT_CONCESSION_SHIPPED_KG = 25_000;

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

export function portInventoryCapKg(commodityId: CommodityId): number {
  return PORT_INVENTORY_CAP_KG[commodityId] ?? 0;
}

export function ensurePlayerPortConcessions(
  state: CareerMissionsState,
): PlayerPortConcession[] {
  if (!Array.isArray(state.playerPortConcessions)) {
    state.playerPortConcessions = [];
  }
  return state.playerPortConcessions;
}

export function syncWorldPortConcessions(
  world: CareerEconomyWorld,
  state: CareerMissionsState,
): void {
  const live = ensurePlayerPortConcessions(state).filter(
    (c) => c.leasePaidThroughTick > world.tick,
  );
  world.portConcessions = live.map(
    (c): PortConcessionIndexRow => ({
      portId: c.portId,
      companyId: c.companyId,
      leasePaidThroughTick: c.leasePaidThroughTick,
    }),
  );
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

export function portListingSlotCap(
  world: CareerEconomyWorld,
  portId: string,
): number {
  return (
    PORT_LISTINGS_BASE +
    (findActivePortOperator(world, portId) ? PORT_OPERATOR_EXTRA_LISTINGS : 0)
  );
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

/** Restock toward caps based on ticks since lastRestockTick. */
export function ensurePortInventoryRestock(world: CareerEconomyWorld): void {
  const rows = ensurePortInventories(world);
  for (const row of rows) {
    const cap = portInventoryCapKg(row.commodityId);
    if (cap <= 0) continue;
    const elapsed = Math.max(0, world.tick - (row.lastRestockTick ?? world.tick));
    if (elapsed <= 0) continue;
    const days = elapsed / 96;
    const add = Math.floor(cap * PORT_RESTOCK_FRAC_PER_DAY * days);
    if (add > 0) {
      row.stockKg = Math.min(cap, row.stockKg + add);
    }
    row.lastRestockTick = world.tick;
  }
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
  const cap = portInventoryCapKg(commodityId);
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
  const cap = portInventoryCapKg(commodityId);
  if (cap <= 0) return 1;
  const stock = getPortInventoryStock(world, portId, commodityId);
  const frac = Math.min(1, Math.max(0, stock / cap));
  // frac=1 → 0.88; frac=0 → 1.18
  return 1.18 - frac * 0.3;
}

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
    reasons.push('Company already holds an active port concession');
  }
  if (portOccupied) {
    reasons.push('Port already has an active operator');
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
    throw new Error(gate.reasons[0] ?? 'Cannot claim port concession');
  }

  applyWalletDelta(state, {
    amountUsd: -gate.claimUsd,
    kind: 'port_concession_claim',
    atTick: world.tick,
    icao: port.pickupHubs[0],
    note: `Claim concession · ${port.name}`,
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
  syncWorldPortConcessions(world, state);
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
    throw new Error('No active concession to renew on this port');
  }
  const leaseUsd = money(PORT_CONCESSION_LEASE_USD_PER_DAY * days);
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
    note: `Renew lease ${days}d · ${port.name}`,
  });
  const base = Math.max(conc.leasePaidThroughTick, world.tick);
  conc.leasePaidThroughTick = base + days * 96;
  syncWorldPortConcessions(world, state);
  return conc;
}

/** Drop expired concessions from company + world index. */
export function tickPortConcessions(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
): boolean {
  const before = ensurePlayerPortConcessions(state).length;
  state.playerPortConcessions = ensurePlayerPortConcessions(state).filter(
    (c) => c.leasePaidThroughTick > world.tick,
  );
  syncWorldPortConcessions(world, state);
  // Also prune world index orphans.
  world.portConcessions = (world.portConcessions ?? []).filter(
    (c) => c.leasePaidThroughTick > world.tick,
  );
  return state.playerPortConcessions.length !== before;
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
  conc.lifetimeThroughputKg =
    (conc.lifetimeThroughputKg ?? 0) + Math.max(0, Math.floor(kg));
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
    capKg: portInventoryCapKg(commodityId),
  }));
}
