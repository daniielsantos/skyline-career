/**
 * Real-world seaports feeding cheaper “factory” cargo into career hubs.
 * Ports are lat/lon nodes (not airports). Cargo is collected at pickup hubs.
 */

import {
  airportByIcao,
  CAREER_HUB_COORDS,
  getCommodity,
  localUnitPriceUsd,
} from './career-economy.js';
import { cargoOpsIsUnlocked } from './career-cargo-ops.js';
import { applyWalletDelta } from './career-ledger.js';
import { isFboHoldCommodityAllowed, ensurePlayerFbos } from './career-fbo.js';
import {
  depositCargoToWarehouse,
  findPlayerWarehouseAtIcao,
  warehouseFreeKg,
  playerWarehouseSnapshot,
} from './career-warehouse.js';
import { demandSnapshot, ensureDemandOrders } from './career-demand.js';
import { economyDayIndex } from './career-weather.js';
import type {
  CareerEconomyWorld,
  CareerMissionsState,
  CommodityId,
  PlayerPortPickup,
  PlayerWarehousePile,
  PortListing,
} from './types/career-economy.js';

export type CareerPortDef = {
  id: string;
  name: string;
  /** ISO-ish country (BR, US, …). */
  countryId: string;
  lat: number;
  lon: number;
  /** Preferred collection hubs, first = default. Must be career hubs. */
  pickupHubs: readonly string[];
};

/** Factory list price as a fraction of hub spot (or commodity base fallback). */
export const PORT_FACTORY_PRICE_FRAC = 0.48;
/** Listing spawn jitter around the factory anchor (±12%). */
export const PORT_LISTING_PRICE_JITTER = 0.12;
/** Floor: fraction of commodity basePricePerKg. */
export const PORT_LISTING_PRICE_FLOOR_FRAC = 0.35;
/** Ceiling: fraction of hub spot so factory stays below terminal. */
export const PORT_LISTING_PRICE_CEIL_FRAC = 0.7;

/**
 * Daily yard-hold fee for cargo waiting as port pickup (no WH / WH full).
 * Higher than warehouse storage to push Store in WH.
 */
export const PORT_YARD_HOLD_USD_PER_KG_DAY = 0.05;
export const PORT_YARD_HOLD_VALUE_MULT = 2;

/** Soft cap of simultaneous open listings per port. */
export const PORT_LISTINGS_PER_PORT = 4;

export const CAREER_PORTS: readonly CareerPortDef[] = [
  {
    id: 'BRSSZ',
    name: 'Port of Santos',
    countryId: 'BR',
    lat: -23.952,
    lon: -46.308,
    pickupHubs: ['SBGR', 'SBKP'],
  },
  {
    id: 'BRPNG',
    name: 'Port of Paranaguá',
    countryId: 'BR',
    lat: -25.503,
    lon: -48.508,
    pickupHubs: ['SBCT'],
  },
];

const PORT_BY_ID = new Map(CAREER_PORTS.map((p) => [p.id, p]));

const PORT_CARGO: readonly CommodityId[] = [
  'general',
  'supplies',
  'machinery',
  'electronics',
];

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function nextId(prefix: string, tick: number): string {
  return `${prefix}_${tick}_${Math.floor(Math.random() * 1e6)}`;
}

export function listCareerPorts(): readonly CareerPortDef[] {
  return CAREER_PORTS;
}

export function getCareerPort(portId: string): CareerPortDef | undefined {
  return PORT_BY_ID.get(portId.trim().toUpperCase());
}

export function resolvePortPickupHub(
  port: CareerPortDef,
  preferredIcao?: string,
): string {
  const pref = preferredIcao?.trim().toUpperCase();
  if (pref && port.pickupHubs.includes(pref)) return pref;
  return port.pickupHubs[0]!;
}

/** Static factory floor (no hub context) — used as fallback / tests. */
export function portFactoryUnitPriceUsd(commodityId: CommodityId): number {
  return money(getCommodity(commodityId).basePricePerKg * PORT_FACTORY_PRICE_FRAC);
}

/**
 * Dynamic factory unit price for a new listing, frozen at spawn.
 * Anchored to allocated-hub spot × factory frac, with jitter + clamp.
 */
export function quotePortListingUnitPriceUsd(
  world: CareerEconomyWorld,
  opts: {
    commodityId: CommodityId;
    allocatedHubIcao: string;
    rng?: () => number;
  },
): { unitPriceUsd: number; hubSpotUnitPriceUsd: number | null } {
  const commodityId = opts.commodityId;
  const base = getCommodity(commodityId).basePricePerKg;
  const hubSpot = hubSpotUnitPriceUsd(world, opts.allocatedHubIcao, commodityId);
  const anchor =
    hubSpot != null && hubSpot > 0
      ? hubSpot * PORT_FACTORY_PRICE_FRAC
      : base * PORT_FACTORY_PRICE_FRAC;
  const rng = opts.rng ?? (() => 0.5);
  const jitter =
    1 - PORT_LISTING_PRICE_JITTER + rng() * (2 * PORT_LISTING_PRICE_JITTER);
  let unit = anchor * jitter;
  const floor = base * PORT_LISTING_PRICE_FLOOR_FRAC;
  const ceil =
    hubSpot != null && hubSpot > 0
      ? hubSpot * PORT_LISTING_PRICE_CEIL_FRAC
      : base * PORT_LISTING_PRICE_CEIL_FRAC;
  unit = Math.min(Math.max(unit, floor), ceil);
  // Never quote at/above live hub spot.
  if (hubSpot != null && hubSpot > 0 && unit >= hubSpot) {
    unit = hubSpot * PORT_FACTORY_PRICE_FRAC;
  }
  return { unitPriceUsd: money(unit), hubSpotUnitPriceUsd: hubSpot };
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

/** Seed / top-up port catalog listings (idempotent per missing slots). */
export function ensurePortListings(world: CareerEconomyWorld): PortListing[] {
  if (!Array.isArray(world.portListings)) {
    world.portListings = [];
  }
  const listings = world.portListings;
  const rng = mulberry32(hashSeed(`${world.seed}:ports:${world.tick}`));

  for (const port of CAREER_PORTS) {
    const open = listings.filter(
      (l) =>
        l.portId === port.id &&
        l.status === 'open' &&
        l.availableKg > 0 &&
        l.expiresAtTick > world.tick,
    );
    let need = PORT_LISTINGS_PER_PORT - open.length;
    let guard = 0;
    let slot = 0;
    while (need > 0 && guard++ < 12) {
      const commodityId = PORT_CARGO[Math.floor(rng() * PORT_CARGO.length)]!;
      // Prefer default pickup hub for the first open slot so home-hub careers
      // can always find a same-ICAO deposit path in tests / early play.
      const hub =
        slot === 0
          ? port.pickupHubs[0]!
          : (port.pickupHubs[Math.floor(rng() * port.pickupHubs.length)] ??
            port.pickupHubs[0]!);
      slot += 1;
      if (!airportByIcao(world, hub)) {
        need -= 1;
        continue;
      }
      const baseKg = commodityId === 'machinery' || commodityId === 'electronics'
        ? 8_000 + Math.floor(rng() * 22_000)
        : 20_000 + Math.floor(rng() * 80_000);
      const quoted = quotePortListingUnitPriceUsd(world, {
        commodityId,
        allocatedHubIcao: hub,
        rng,
      });
      listings.push({
        id: nextId('portlot', world.tick),
        portId: port.id,
        commodityId,
        availableKg: baseKg,
        unitPriceUsd: quoted.unitPriceUsd,
        allocatedHubIcao: hub,
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 96 * 3, // ~3 economy days
        status: 'open',
      });
      need -= 1;
    }
  }

  // Drop expired empties
  world.portListings = listings.filter(
    (l) =>
      !(l.status === 'open' && (l.availableKg <= 0 || l.expiresAtTick <= world.tick)),
  );
  return world.portListings;
}

export function listPortListings(
  world: CareerEconomyWorld,
  portId?: string,
): PortListing[] {
  ensurePortListings(world);
  const id = portId?.trim().toUpperCase();
  return (world.portListings ?? []).filter(
    (l) =>
      l.status === 'open' &&
      l.availableKg > 0 &&
      l.expiresAtTick > world.tick &&
      (!id || l.portId === id),
  );
}

export function normalizePlayerPortPickups(raw: unknown): PlayerPortPickup[] {
  if (!Array.isArray(raw)) return [];
  const out: PlayerPortPickup[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id.trim() : '';
    const portId = typeof r.portId === 'string' ? r.portId.trim().toUpperCase() : '';
    const hubIcao =
      typeof r.hubIcao === 'string' ? r.hubIcao.trim().toUpperCase() : '';
    const commodityId =
      typeof r.commodityId === 'string' ? (r.commodityId as CommodityId) : null;
    const kg =
      typeof r.kg === 'number' && Number.isFinite(r.kg)
        ? Math.max(0, Math.floor(r.kg))
        : 0;
    const avgCostUsdPerKg =
      typeof r.avgCostUsdPerKg === 'number' && Number.isFinite(r.avgCostUsdPerKg)
        ? Math.max(0, money(r.avgCostUsdPerKg))
        : 0;
    const purchasedAtTick =
      typeof r.purchasedAtTick === 'number' && Number.isFinite(r.purchasedAtTick)
        ? Math.max(0, Math.floor(r.purchasedAtTick))
        : 0;
    const listingId =
      typeof r.listingId === 'string' ? r.listingId.trim() : undefined;
    if (!id || !portId || !hubIcao || !commodityId || kg <= 0) continue;
    out.push({
      id,
      portId,
      hubIcao,
      commodityId,
      kg,
      avgCostUsdPerKg,
      purchasedAtTick,
      ...(listingId ? { listingId } : {}),
    });
  }
  return out;
}

export function ensurePlayerPortPickups(
  state: CareerMissionsState,
): PlayerPortPickup[] {
  state.portPickups = normalizePlayerPortPickups(state.portPickups);
  return state.portPickups;
}

/**
 * Buy kg from a port listing → warehouse and/or yard pickup at the allocated hub.
 * If a warehouse has free space, as much as fits is deposited; the rest waits as pickup.
 */
export function buyPortListing(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { listingId: string; kg: number },
): {
  debitUsd: number;
  unitPriceUsd: number;
  kg: number;
  storedKg: number;
  yardKg: number;
  pickup: PlayerPortPickup | null;
  warehousePile: PlayerWarehousePile | null;
  listing: PortListing;
} {
  ensurePortListings(world);
  const qty = Math.max(0, Math.floor(opts.kg));
  if (qty <= 0) throw new Error('Buy amount must be positive');

  const listing = (world.portListings ?? []).find(
    (l) => l.id === opts.listingId.trim(),
  );
  if (!listing || listing.status !== 'open' || listing.availableKg <= 0) {
    throw new Error('Port listing not available');
  }
  if (listing.expiresAtTick <= world.tick) {
    throw new Error('Port listing expired');
  }
  if (!isFboHoldCommodityAllowed(listing.commodityId)) {
    throw new Error('Commodity not allowed from ports');
  }
  if (!cargoOpsIsUnlocked(state.cargoOps, listing.commodityId)) {
    const name = getCommodity(listing.commodityId).name;
    throw new Error(
      `Cargo Ops: ${name} is locked — unlock it in Hangar → Cargo Ops`,
    );
  }
  if (qty > listing.availableKg) {
    throw new Error(
      `Only ${listing.availableKg.toLocaleString()} kg left on this listing`,
    );
  }

  const port = getCareerPort(listing.portId);
  if (!port) throw new Error(`Unknown port ${listing.portId}`);

  const hub = listing.allocatedHubIcao.trim().toUpperCase();
  if (!port.pickupHubs.includes(hub)) {
    throw new Error(`Hub ${hub} is not a pickup for ${port.name}`);
  }
  if (!airportByIcao(world, hub)) {
    throw new Error(`Unknown pickup hub ${hub}`);
  }

  const unitPriceUsd = money(listing.unitPriceUsd);
  const debitUsd = money(unitPriceUsd * qty);
  if (state.walletUsd < debitUsd) {
    throw new Error(
      `Port buy $${debitUsd.toLocaleString()} exceeds wallet $${state.walletUsd.toLocaleString()}`,
    );
  }

  listing.availableKg -= qty;
  if (listing.availableKg <= 0) {
    listing.status = 'sold_out';
    listing.availableKg = 0;
  }

  applyWalletDelta(state, {
    amountUsd: -debitUsd,
    kind: 'port_buy',
    atTick: world.tick,
    icao: hub,
    note: `${port.name} · ${listing.commodityId} · ${qty} kg @ $${unitPriceUsd}/kg → ${hub}`,
  });

  const wh = findPlayerWarehouseAtIcao(state, hub);
  const free = wh ? warehouseFreeKg(state, wh.id) : 0;
  const storedKg = wh ? Math.min(qty, Math.max(0, free)) : 0;
  const yardKg = qty - storedKg;

  let warehousePile: PlayerWarehousePile | null = null;
  if (storedKg > 0) {
    warehousePile = depositCargoToWarehouse(state, {
      icao: hub,
      commodityId: listing.commodityId,
      kg: storedKg,
      avgCostUsdPerKg: unitPriceUsd,
      tick: world.tick,
    });
  }

  let pickup: PlayerPortPickup | null = null;
  if (yardKg > 0) {
    pickup = {
      id: nextId('portpk', world.tick),
      portId: listing.portId,
      listingId: listing.id,
      hubIcao: hub,
      commodityId: listing.commodityId,
      kg: yardKg,
      avgCostUsdPerKg: unitPriceUsd,
      purchasedAtTick: world.tick,
    };
    ensurePlayerPortPickups(state).push(pickup);
  }

  return {
    debitUsd,
    unitPriceUsd,
    kg: qty,
    storedKg,
    yardKg,
    pickup,
    warehousePile,
    listing: { ...listing },
  };
}

/**
 * Move port pickup kg into the player warehouse at the same ICAO (no flight).
 * Defaults to as much as fits in free WH capacity (partial store allowed).
 */
export function depositPortPickupToWarehouse(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { pickupId: string; kg?: number },
): {
  pile: PlayerWarehousePile;
  kg: number;
  hubIcao: string;
  remainingYardKg: number;
} {
  const pickups = ensurePlayerPortPickups(state);
  const idx = pickups.findIndex((p) => p.id === opts.pickupId.trim());
  if (idx < 0) throw new Error('Port pickup not found');
  const pickup = pickups[idx]!;
  const hub = pickup.hubIcao.trim().toUpperCase();
  const wh = findPlayerWarehouseAtIcao(state, hub);
  if (!wh) {
    throw new Error(`No warehouse at ${hub}`);
  }
  const free = warehouseFreeKg(state, wh.id);
  if (free <= 0) {
    throw new Error(`Warehouse at ${hub} has no free capacity`);
  }
  const want =
    opts.kg != null && Number.isFinite(opts.kg)
      ? Math.max(0, Math.floor(opts.kg))
      : pickup.kg;
  const take = Math.min(want, pickup.kg, free);
  if (take <= 0) {
    throw new Error('Nothing to store');
  }

  const pile = depositCargoToWarehouse(state, {
    icao: hub,
    commodityId: pickup.commodityId,
    kg: take,
    avgCostUsdPerKg: pickup.avgCostUsdPerKg,
    tick: world.tick,
  });

  pickup.kg -= take;
  if (pickup.kg <= 0) {
    pickups.splice(idx, 1);
  }

  return {
    pile,
    kg: take,
    hubIcao: hub,
    remainingYardKg: Math.max(0, pickup.kg),
  };
}

/** Drop yard-hold cargo (no refund) so oversized pickups can stop accruing fees. */
export function abandonPortPickup(
  state: CareerMissionsState,
  opts: { pickupId: string },
): { kg: number; hubIcao: string; commodityId: CommodityId } {
  const pickups = ensurePlayerPortPickups(state);
  const idx = pickups.findIndex((p) => p.id === opts.pickupId.trim());
  if (idx < 0) throw new Error('Port pickup not found');
  const pickup = pickups[idx]!;
  const kg = pickup.kg;
  const hubIcao = pickup.hubIcao;
  const commodityId = pickup.commodityId;
  pickups.splice(idx, 1);
  return { kg, hubIcao, commodityId };
}

function yardHoldUsdPerKgDay(commodityId: CommodityId): number {
  if (commodityId === 'electronics' || commodityId === 'machinery') {
    return PORT_YARD_HOLD_USD_PER_KG_DAY * PORT_YARD_HOLD_VALUE_MULT;
  }
  return PORT_YARD_HOLD_USD_PER_KG_DAY;
}

export type PortYardHoldSettleResult = {
  debitUsd: number;
  requestedUsd: number;
  shortfallUsd: number;
  daysCharged: number;
};

/** Daily fee for cargo sitting in port pickups (yard), by economy day. */
export function settlePortYardHoldFees(
  state: CareerMissionsState,
  opts: { fromTick: number; toTick: number },
): PortYardHoldSettleResult {
  const daysCharged = Math.max(
    0,
    economyDayIndex(opts.toTick) - economyDayIndex(opts.fromTick),
  );
  const empty: PortYardHoldSettleResult = {
    debitUsd: 0,
    requestedUsd: 0,
    shortfallUsd: 0,
    daysCharged: 0,
  };
  if (daysCharged <= 0) return empty;
  const pickups = ensurePlayerPortPickups(state);
  if (pickups.length === 0) return { ...empty, daysCharged };

  let requestedUsd = 0;
  for (const pickup of pickups) {
    requestedUsd +=
      pickup.kg * yardHoldUsdPerKgDay(pickup.commodityId) * daysCharged;
  }
  requestedUsd = money(requestedUsd);
  if (requestedUsd <= 0) return { ...empty, daysCharged };

  const debitUsd = money(Math.min(state.walletUsd, requestedUsd));
  const shortfallUsd = money(Math.max(0, requestedUsd - debitUsd));
  if (debitUsd > 0) {
    applyWalletDelta(state, {
      amountUsd: -debitUsd,
      kind: 'port_yard_hold',
      atTick: opts.toTick,
      note: `${daysCharged}d · ${pickups.length} pickup(s)`,
    });
  }
  return { debitUsd, requestedUsd, shortfallUsd, daysCharged };
}

/**
 * @deprecated FBO spot removed — use depositPortPickupToWarehouse.
 */
export function depositPortPickupToFboSpot(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { pickupId: string },
): ReturnType<typeof depositPortPickupToWarehouse> {
  return depositPortPickupToWarehouse(state, world, opts);
}

/**
 * @deprecated Fly-to-FBO-spot removed — fulfill Demand Board orders instead.
 */
export function stagePortPickupToFbo(
  _state: CareerMissionsState,
  _world: CareerEconomyWorld,
  _opts: { pickupId: string; destIcao: string; aircraftId: string },
): never {
  throw new Error(
    'Fly to FBO for spot removed — store in Warehouse and accept a Demand Board order',
  );
}

/** Restore a cancelled port-reposition mission back onto the pickup list. */
export function restorePortPickupFromMission(
  state: CareerMissionsState,
  mission: {
    portPickupId?: string;
    portId?: string;
    originIcao: string;
    commodityId: CommodityId;
    cargoKg: number;
    portAvgCostUsdPerKg?: number;
    acceptedAtTick?: number;
    lots?: Array<{ cargoKg: number; commodityId: CommodityId }>;
  },
): PlayerPortPickup | null {
  const id = mission.portPickupId?.trim();
  if (!id) return null;
  const pickups = ensurePlayerPortPickups(state);
  if (pickups.some((p) => p.id === id)) return null;

  const line = mission.lots?.[0];
  const kg = line?.cargoKg ?? mission.cargoKg ?? 0;
  if (kg <= 0) return null;

  const restored: PlayerPortPickup = {
    id,
    portId: (mission.portId ?? 'UNKNOWN').trim().toUpperCase(),
    hubIcao: mission.originIcao.trim().toUpperCase(),
    commodityId: (line?.commodityId ?? mission.commodityId) as CommodityId,
    kg,
    avgCostUsdPerKg: mission.portAvgCostUsdPerKg ?? 0,
    purchasedAtTick: mission.acceptedAtTick ?? 0,
  };
  pickups.push(restored);
  return restored;
}

/** Hub spot price for UI contrast (null if hub/commodity missing). */
export function hubSpotUnitPriceUsd(
  world: CareerEconomyWorld,
  hubIcao: string,
  commodityId: CommodityId,
): number | null {
  const ap = airportByIcao(world, hubIcao);
  const pile = ap?.inventory[commodityId];
  if (!pile) return null;
  return money(localUnitPriceUsd(commodityId, pile));
}

export function portSnapshot(
  world: CareerEconomyWorld,
  state?: CareerMissionsState,
): {
  ports: Array<
    CareerPortDef & {
      pickupHubDetails: Array<{
        icao: string;
        lat: number;
        lon: number;
        name?: string;
      }>;
      listings: Array<
        PortListing & {
          commodityName: string;
          hubSpotUnitPriceUsd: number | null;
        }
      >;
    }
  >;
  pickups: Array<PlayerPortPickup & { commodityName: string }>;
  warehouses: ReturnType<typeof playerWarehouseSnapshot>;
  demand: ReturnType<typeof demandSnapshot>;
  ownedFbos: Array<{
    id: string;
    icao: string;
    lat: number;
    lon: number;
    name?: string;
    tier: number;
  }>;
} {
  ensurePortListings(world);
  ensureDemandOrders(world);
  const pickups = state ? ensurePlayerPortPickups(state) : [];
  const warehouses = state
    ? playerWarehouseSnapshot(state, world)
    : { warehouses: [], stock: [], pickupHubs: [], buyUsdByIcao: {} };
  const demand = demandSnapshot(world, {
    warehouseIcaos: warehouses.warehouses.map((w) => w.icao),
  });
  const ownedFbos = state
    ? ensurePlayerFbos(state).fbos.flatMap((fbo) => {
        const icao = fbo.icao.trim().toUpperCase();
        const coords = CAREER_HUB_COORDS[icao];
        const ap = airportByIcao(world, icao);
        const lat = coords?.lat ?? ap?.lat;
        const lon = coords?.lon ?? ap?.lon;
        if (lat == null || lon == null) return [];
        return [
          {
            id: fbo.id,
            icao,
            lat,
            lon,
            name: coords?.name ?? ap?.name,
            tier: fbo.tier,
          },
        ];
      })
    : [];
  return {
    ports: CAREER_PORTS.map((port) => ({
      ...port,
      pickupHubs: [...port.pickupHubs],
      pickupHubDetails: port.pickupHubs.map((icao) => {
        const coords = CAREER_HUB_COORDS[icao];
        const ap = airportByIcao(world, icao);
        return {
          icao,
          lat: coords?.lat ?? ap?.lat ?? port.lat,
          lon: coords?.lon ?? ap?.lon ?? port.lon,
          name: coords?.name ?? ap?.name,
        };
      }),
      listings: listPortListings(world, port.id).map((l) => ({
        ...l,
        commodityName: getCommodity(l.commodityId).name,
        hubSpotUnitPriceUsd: hubSpotUnitPriceUsd(
          world,
          l.allocatedHubIcao,
          l.commodityId,
        ),
      })),
    })),
    pickups: pickups.map((p) => ({
      ...p,
      commodityName: getCommodity(p.commodityId).name,
    })),
    warehouses,
    demand,
    ownedFbos,
  };
}
