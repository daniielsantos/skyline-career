import {
  ensureNpcFleet,
  listNpcActivity,
  npcClaimForLot,
  laneInboundKg,
  npcLaneSaturation,
  npcRegionBidCapacity,
  describeLotMarketPressure,
  seedNpcFleet,
  settleNpcOpsDue,
  tickNpcFreighters,
} from './career-npc.js';
import {
  regionalWeatherIndex,
  regionalWeatherLifeMult,
  regionalWeatherPayMult,
  worseWeather,
} from './career-weather.js';
import type {
  AirportTerminal,
  CareerEconomyWorld,
  CareerEconomyWorldV1,
  CommodityDef,
  CommodityId,
  EconomyEvent,
  EconomyEventKind,
  MarketLotView,
  NpcActivityView,
  NpcFlight,
  NpcFreighter,
  ShipmentLot,
  StockPile,
} from './types/career-economy.js';

export type {
  AirportTerminal,
  CareerEconomyWorld,
  CareerEconomyWorldV1,
  CareerEconomyWorldV2,
  CommodityDef,
  CommodityId,
  EconomyEvent,
  EconomyEventKind,
  InboundPending,
  MarketLotView,
  NpcActivityView,
  NpcFleetMemberView,
  NpcFlight,
  NpcFreighter,
  ShipmentLot,
  StockPile,
} from './types/career-economy.js';

export {
  describeLotMarketPressure,
  ensureNpcFleet,
  estimateNpcBlockHours,
  listNpcActivity,
  listNpcFleetStatus,
  listRegionMarketPressure,
  npcClaimForLot,
  npcLaneAirborneKg,
  playerLaneInboundKg,
  laneInboundKg,
  npcLaneSaturation,
  npcRegionBidCapacity,
  NPC_FLEET_SIZE,
  LANE_BUSY_SATURATION,
  THIN_FLEET_CAPACITY,
  seedNpcFleet,
  settleNpcOpsDue,
  tickNpcFreighters,
} from './career-npc.js';

export type { LotMarketPressure, RegionMarketPressure } from './career-npc.js';

export {
  economyDayIndex,
  listRegionalWeather,
  regionalWeatherBidMult,
  regionalWeatherIndex,
  regionalWeatherLifeMult,
  regionalWeatherPayMult,
  worseWeather,
} from './career-weather.js';

export type { RegionalWeather, RegionWeatherView } from './career-weather.js';

/** 1 economy tick = 1 real hour. */
export const MS_PER_TICK = 3_600_000;
/** Cap catch-up per load so a long offline stretch stays responsive. */
export const MAX_CATCH_UP_TICKS = 24 * 14;
/** Max concurrent active lots on the same commodity+route (large + small). */
export const MAX_LOTS_PER_LANE = 4;
/** Soft caps within a lane so light aircraft see bookable slices. */
export const MAX_LARGE_LOTS_PER_LANE = 2;
export const MAX_SMALL_LOTS_PER_LANE = 2;
export const CAREER_COMMODITIES: readonly CommodityDef[] = [
  {
    id: 'electronics',
    name: 'Electronics',
    basePricePerKg: 18,
    highValue: true,
  },
  {
    id: 'perishables',
    name: 'Perishables',
    basePricePerKg: 4.5,
    perishable: true,
  },
  {
    id: 'machinery',
    name: 'Machinery',
    basePricePerKg: 6,
  },
  {
    id: 'general',
    name: 'General cargo',
    basePricePerKg: 2.2,
  },
  {
    id: 'fuel',
    name: 'Jet-A fuel',
    basePricePerKg: 0.95,
    kind: 'fuel',
  },
] as const;

/** Freight-board commodities (excludes terminal fuel). */
export const CAREER_CARGO_COMMODITIES: readonly CommodityDef[] =
  CAREER_COMMODITIES.filter((c) => c.kind !== 'fuel');

/** Major Jet-A production hubs in the Brazil career map. */
export const FUEL_HUB_ICAOS = new Set([
  'SBGR',
  'SBGL',
  'SBKP',
  'SBCF',
  'SBPA',
  'SBRF',
  'SBCT',
  'SBSV',
]);

/** Seed or repair fuel inventory + baseline flows on a terminal. */
export function ensureAirportFuelInventory(terminal: AirportTerminal): void {
  const hub = FUEL_HUB_ICAOS.has(terminal.icao);
  const cap = hub ? 500_000 : 120_000;
  const prod = hub ? 8_000 : 800;
  const cons = hub ? 3_000 : 1_500;

  if (!terminal.inventory.fuel) {
    terminal.inventory.fuel = pile(Math.round(cap * 0.55), cap);
  } else {
    terminal.inventory.fuel.capacityKg = Math.max(
      terminal.inventory.fuel.capacityKg,
      cap,
    );
    terminal.inventory.fuel.stockKg = clamp(
      terminal.inventory.fuel.stockKg,
      0,
      terminal.inventory.fuel.capacityKg,
    );
  }

  terminal.baseProduction = { ...terminal.baseProduction, fuel: prod };
  terminal.baseConsumption = { ...terminal.baseConsumption, fuel: cons };
  if (terminal.production.fuel === undefined) {
    terminal.production = { ...terminal.production, fuel: prod };
  }
  if (terminal.consumption.fuel === undefined) {
    terminal.consumption = { ...terminal.consumption, fuel: cons };
  }
}

export function ensureWorldFuelInventory(world: CareerEconomyWorld): void {
  for (const ap of world.airports) {
    ensureAirportFuelInventory(ap);
  }
}

const COMMODITY_BY_ID: Record<CommodityId, CommodityDef> = Object.fromEntries(
  CAREER_COMMODITIES.map((c) => [c.id, c]),
) as Record<CommodityId, CommodityDef>;

export function getCommodity(id: CommodityId): CommodityDef {
  return COMMODITY_BY_ID[id];
}

/** Reference coordinates for career hubs (WGS84). */
export const CAREER_HUB_COORDS: Readonly<
  Record<string, { lat: number; lon: number; name?: string }>
> = {
  SBGR: { lat: -23.4356, lon: -46.4731, name: 'São Paulo/Guarulhos' },
  SBGL: { lat: -22.8099, lon: -43.2506, name: 'Rio de Janeiro/Galeão' },
  SBKP: { lat: -23.0074, lon: -47.1345, name: 'Campinas/Viracopos' },
  SBCF: { lat: -19.6244, lon: -43.9719, name: 'Belo Horizonte/Confins' },
  SBVT: { lat: -20.2581, lon: -40.2864, name: 'Vitória' },
  SBRP: { lat: -21.1364, lon: -47.7767, name: 'Ribeirão Preto' },
  SBCT: { lat: -25.5285, lon: -49.1758, name: 'Curitiba' },
  SBPA: { lat: -29.9944, lon: -51.1714, name: 'Porto Alegre' },
  SBFL: { lat: -27.6703, lon: -48.5525, name: 'Florianópolis' },
  SBNF: { lat: -26.8794, lon: -48.6514, name: 'Navegantes' },
  SBLO: { lat: -23.3336, lon: -51.1301, name: 'Londrina' },
  SBJV: { lat: -26.2245, lon: -48.7974, name: 'Joinville' },
  SBSV: { lat: -12.9086, lon: -38.3225, name: 'Salvador' },
  SBRF: { lat: -8.1265, lon: -34.9236, name: 'Recife' },
  SBFZ: { lat: -3.7763, lon: -38.5326, name: 'Fortaleza' },
  SBSG: { lat: -5.7681, lon: -35.3761, name: 'Natal/São Gonçalo' },
  SBAR: { lat: -10.984, lon: -37.0703, name: 'Aracaju' },
  SBMO: { lat: -9.5108, lon: -35.7917, name: 'Maceió' },
  SBJP: { lat: -7.1484, lon: -34.9507, name: 'João Pessoa' },
  SBPS: { lat: -16.4386, lon: -39.0809, name: 'Porto Seguro' },
};

export function resolveAirportCoords(
  icao: string,
  terminal?: Pick<AirportTerminal, 'lat' | 'lon'> | null,
): { lat: number; lon: number } | undefined {
  if (
    terminal &&
    Number.isFinite(terminal.lat) &&
    Number.isFinite(terminal.lon) &&
    !(terminal.lat === 0 && terminal.lon === 0)
  ) {
    return { lat: terminal.lat, lon: terminal.lon };
  }
  return CAREER_HUB_COORDS[icao.trim().toUpperCase()];
}

/** Great-circle distance in nautical miles. */
export function distanceNm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const rLat1 = toRad(a.lat);
  const rLat2 = toRad(b.lat);
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;
  const earthNm = 3440.065;
  return 2 * earthNm * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Default radius around dest airport to accept auto-settle (nm). */
export const DEFAULT_SETTLE_RADIUS_NM = 12;

export function isNearAirport(
  position: { lat: number; lon: number },
  airport: { lat: number; lon: number },
  radiusNm = DEFAULT_SETTLE_RADIUS_NM,
): { near: boolean; distanceNm: number } {
  const d = distanceNm(position, airport);
  return { near: d <= radiusNm, distanceNm: d };
}

export function routeDistanceNm(
  world: CareerEconomyWorld,
  originIcao: string,
  destIcao: string,
): number | undefined {
  const originCode = originIcao.trim().toUpperCase();
  const destCode = destIcao.trim().toUpperCase();
  const origin = world.airports.find((airport) => airport.icao === originCode);
  const dest = world.airports.find((airport) => airport.icao === destCode);
  const originCoords = resolveAirportCoords(originCode, origin);
  const destCoords = resolveAirportCoords(destCode, dest);
  if (!originCoords || !destCoords) {
    return undefined;
  }
  return distanceNm(originCoords, destCoords);
}

function pile(stockKg: number, capacityKg: number): StockPile {
  return {
    stockKg: clamp(stockKg, 0, capacityKg),
    capacityKg,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Fill ratio 0..1; low stock → high local price multiplier. */
export function localPriceMultiplier(stock: StockPile): number {
  if (stock.capacityKg <= 0) {
    return 1;
  }
  const fill = stock.stockKg / stock.capacityKg;
  // 0% fill → ~2.2×, 50% → ~1.0×, 100% → ~0.45×
  return clamp(0.45 + (1 - fill) * 1.75, 0.4, 2.4);
}

export function localUnitPriceUsd(commodityId: CommodityId, stock: StockPile): number {
  return getCommodity(commodityId).basePricePerKg * localPriceMultiplier(stock);
}

function ensurePile(
  terminal: AirportTerminal,
  commodityId: CommodityId,
  defaultCapacity = 80_000,
): StockPile {
  const existing = terminal.inventory[commodityId];
  if (existing) {
    return existing;
  }
  const created = pile(0, defaultCapacity);
  terminal.inventory[commodityId] = created;
  return created;
}

/**
 * Seed a Brazil-first cargo world: South, Southeast and Northeast hubs,
 * with asymmetric production/consumption so ticks create explainable lanes.
 */
export function createSeedEconomyWorld(opts: { seed?: string } = {}): CareerEconomyWorld {
  const seed = opts.seed?.trim() || 'skyline-career-br-v1';
  const rng = mulberry32(hashSeed(seed));

  const hubs: Array<{
    icao: string;
    name: string;
    region: string;
    /** Relative production bias by commodity. */
    produce: Partial<Record<CommodityId, number>>;
    /** Relative consumption bias. */
    consume: Partial<Record<CommodityId, number>>;
  }> = [
    {
      icao: 'SBGR',
      name: 'São Paulo/Guarulhos',
      region: 'BR-SE',
      produce: { electronics: 1.4, general: 1.1, machinery: 0.9 },
      consume: { perishables: 1.2, general: 1.0 },
    },
    {
      icao: 'SBGL',
      name: 'Rio de Janeiro/Galeão',
      region: 'BR-SE',
      produce: { perishables: 1.3, general: 0.8 },
      consume: { electronics: 1.1, machinery: 1.0 },
    },
    {
      icao: 'SBKP',
      name: 'Campinas/Viracopos',
      region: 'BR-SE',
      produce: { electronics: 1.6, machinery: 1.2 },
      consume: { general: 0.9, perishables: 0.7 },
    },
    {
      icao: 'SBCF',
      name: 'Belo Horizonte/Confins',
      region: 'BR-SE',
      produce: { machinery: 1.3, general: 1.0 },
      consume: { electronics: 0.9, perishables: 1.0 },
    },
    {
      icao: 'SBVT',
      name: 'Vitória',
      region: 'BR-SE',
      produce: { general: 1.2, machinery: 0.8 },
      consume: { electronics: 0.9, perishables: 1.0 },
    },
    {
      icao: 'SBRP',
      name: 'Ribeirão Preto',
      region: 'BR-SE',
      produce: { machinery: 1.0, perishables: 1.2 },
      consume: { electronics: 0.9, general: 0.8 },
    },
    {
      icao: 'SBCT',
      name: 'Curitiba',
      region: 'BR-S',
      produce: { machinery: 1.1, perishables: 1.0 },
      consume: { electronics: 0.9, general: 1.0 },
    },
    {
      icao: 'SBPA',
      name: 'Porto Alegre',
      region: 'BR-S',
      produce: { machinery: 1.2, general: 1.1 },
      consume: { electronics: 1.0, perishables: 1.1 },
    },
    {
      icao: 'SBFL',
      name: 'Florianópolis',
      region: 'BR-S',
      produce: { electronics: 0.8, perishables: 1.1 },
      consume: { machinery: 0.9, general: 1.0 },
    },
    {
      icao: 'SBNF',
      name: 'Navegantes',
      region: 'BR-S',
      produce: { general: 1.3, machinery: 1.0 },
      consume: { electronics: 0.9, perishables: 0.8 },
    },
    {
      icao: 'SBLO',
      name: 'Londrina',
      region: 'BR-S',
      produce: { perishables: 1.4, machinery: 0.8 },
      consume: { electronics: 0.9, general: 0.9 },
    },
    {
      icao: 'SBJV',
      name: 'Joinville',
      region: 'BR-S',
      produce: { machinery: 1.3, general: 0.9 },
      consume: { electronics: 0.8, perishables: 0.9 },
    },
    {
      icao: 'SBSV',
      name: 'Salvador',
      region: 'BR-NE',
      produce: { perishables: 1.5, general: 0.9 },
      consume: { electronics: 0.8, machinery: 0.7 },
    },
    {
      icao: 'SBRF',
      name: 'Recife',
      region: 'BR-NE',
      produce: { general: 1.2, perishables: 1.0 },
      consume: { electronics: 1.1, machinery: 0.9 },
    },
    {
      icao: 'SBFZ',
      name: 'Fortaleza',
      region: 'BR-NE',
      produce: { perishables: 1.3, general: 1.0 },
      consume: { electronics: 1.0, machinery: 0.8 },
    },
    {
      icao: 'SBSG',
      name: 'Natal/São Gonçalo',
      region: 'BR-NE',
      produce: { perishables: 1.2, general: 0.8 },
      consume: { electronics: 0.9, machinery: 0.8 },
    },
    {
      icao: 'SBAR',
      name: 'Aracaju',
      region: 'BR-NE',
      produce: { perishables: 1.2, general: 0.9 },
      consume: { electronics: 0.8, machinery: 0.9 },
    },
    {
      icao: 'SBMO',
      name: 'Maceió',
      region: 'BR-NE',
      produce: { perishables: 1.3, general: 0.8 },
      consume: { electronics: 0.9, machinery: 0.8 },
    },
    {
      icao: 'SBJP',
      name: 'João Pessoa',
      region: 'BR-NE',
      produce: { perishables: 1.1, general: 0.9 },
      consume: { electronics: 0.8, machinery: 0.8 },
    },
    {
      icao: 'SBPS',
      name: 'Porto Seguro',
      region: 'BR-NE',
      produce: { perishables: 1.1, general: 0.7 },
      consume: { electronics: 0.8, machinery: 0.7 },
    },
  ];

  const airports: AirportTerminal[] = hubs.map((h) => {
    const coords = CAREER_HUB_COORDS[h.icao];
    if (!coords) {
      throw new Error(`Missing coordinates for seeded airport ${h.icao}`);
    }
    const level = 1;
    const capacityBoost = 1 + (level - 1) * 0.15;
    const inventory: AirportTerminal['inventory'] = {};
    const production: AirportTerminal['production'] = {};
    const consumption: AirportTerminal['consumption'] = {};

    for (const c of CAREER_COMMODITIES) {
      if (c.id === 'fuel') {
        const hub = FUEL_HUB_ICAOS.has(h.icao);
        const cap = Math.round((hub ? 500_000 : 120_000) * capacityBoost);
        const prod = Math.round((hub ? 8_000 : 800) * (0.8 + rng() * 0.4));
        const cons = Math.round((hub ? 3_000 : 1_500) * (0.8 + rng() * 0.4));
        production[c.id] = prod;
        consumption[c.id] = cons;
        const startFill = 0.45 + rng() * 0.25;
        inventory[c.id] = pile(Math.round(cap * startFill), cap);
        continue;
      }
      const cap = Math.round(70_000 * capacityBoost * (0.85 + rng() * 0.3));
      const prodBias = h.produce[c.id] ?? 0.15;
      const consBias = h.consume[c.id] ?? 0.25;
      // kg / tick — asymmetric by design
      const prod = Math.round(2_200 * prodBias * (0.8 + rng() * 0.4));
      const cons = Math.round(2_000 * consBias * (0.8 + rng() * 0.4));
      production[c.id] = prod;
      consumption[c.id] = cons;
      // Start near mid stock with mild noise
      const startFill = 0.35 + rng() * 0.35;
      inventory[c.id] = pile(Math.round(cap * startFill), cap);
    }

    return {
      icao: h.icao,
      name: h.name,
      region: h.region,
      lat: coords.lat,
      lon: coords.lon,
      level,
      inventory,
      baseProduction: { ...production },
      baseConsumption: { ...consumption },
      production,
      consumption,
    };
  });

  const now = Date.now();
  const regions = airports.map((a) => a.region);
  return {
    version: 3,
    seed,
    tick: 0,
    lastBatchAtMs: now,
    lastSyncedAtMs: now,
    airports,
    lots: [],
    events: [],
    npcs: seedNpcFleet({ seed, regions }),
    npcFlights: [],
    inboundPending: [],
  };
}

/** Continuous economy hours = completed batches + fractional hour since last batch. */
export function continuousEconomyHours(
  world: CareerEconomyWorld,
  nowMs = Date.now(),
): number {
  const anchor = world.lastBatchAtMs ?? world.lastSyncedAtMs ?? nowMs;
  const frac = Math.max(0, nowMs - anchor) / MS_PER_TICK;
  return world.tick + frac;
}

function resolveBatchAnchorMs(raw: {
  lastBatchAtMs?: number;
  lastSyncedAtMs?: number;
}, nowMs: number): number {
  if (typeof raw.lastBatchAtMs === 'number' && Number.isFinite(raw.lastBatchAtMs)) {
    return raw.lastBatchAtMs;
  }
  if (typeof raw.lastSyncedAtMs === 'number' && Number.isFinite(raw.lastSyncedAtMs)) {
    return raw.lastSyncedAtMs;
  }
  return nowMs;
}

function tickToWallMs(anchorMs: number, worldTick: number, eventTick: number): number {
  return anchorMs - (worldTick - eventTick) * MS_PER_TICK;
}

function migrateNpcTimestamps(
  world: CareerEconomyWorld,
  fromVersion: number,
): void {
  const anchor = world.lastBatchAtMs;
  for (const flight of world.npcFlights) {
    const needsMs =
      typeof flight.departedAtMs !== 'number' ||
      !Number.isFinite(flight.departedAtMs) ||
      typeof flight.arrivesAtMs !== 'number' ||
      !Number.isFinite(flight.arrivesAtMs);
    if (needsMs || fromVersion < 3) {
      if (typeof flight.departedAtTick === 'number') {
        flight.departedAtMs = tickToWallMs(anchor, world.tick, flight.departedAtTick);
      } else if (typeof flight.departedAtMs !== 'number') {
        flight.departedAtMs = anchor;
      }
      if (typeof flight.arrivesAtTick === 'number') {
        flight.arrivesAtMs = tickToWallMs(anchor, world.tick, flight.arrivesAtTick);
      } else if (typeof flight.arrivesAtMs !== 'number') {
        flight.arrivesAtMs = flight.departedAtMs + 2 * MS_PER_TICK;
      }
    }
  }
  for (const npc of world.npcs) {
    if (
      (typeof npc.busyUntilMs !== 'number' || !Number.isFinite(npc.busyUntilMs)) &&
      typeof npc.busyUntilTick === 'number'
    ) {
      npc.busyUntilMs = tickToWallMs(anchor, world.tick, npc.busyUntilTick);
    }
    if (
      (typeof npc.restUntilMs !== 'number' || !Number.isFinite(npc.restUntilMs)) &&
      typeof npc.restUntilTick === 'number'
    ) {
      npc.restUntilMs = tickToWallMs(anchor, world.tick, npc.restUntilTick);
    }
  }
}

/**
 * Migrate legacy saves into the hybrid live-economy schema (v3).
 * Does not catch up wall-clock time — caller should set/keep lastBatchAtMs.
 */
export function migrateEconomyWorld(
  raw: CareerEconomyWorld | CareerEconomyWorldV1 | Record<string, unknown>,
  opts: { nowMs?: number } = {},
): CareerEconomyWorld {
  const nowMs = opts.nowMs ?? Date.now();
  const base = raw as {
    version?: number;
    seed?: string;
    tick?: number;
    lastSyncedAtMs?: number;
    lastBatchAtMs?: number;
    airports?: AirportTerminal[];
    lots?: ShipmentLot[];
    events?: EconomyEvent[];
    npcs?: NpcFreighter[];
    npcFlights?: NpcFlight[];
  };
  if (!Array.isArray(base.airports)) {
    throw new Error('Invalid career economy: missing airports');
  }

  const version = Number(base.version);

  for (const ap of base.airports) {
    if (!ap.baseProduction) {
      ap.baseProduction = { ...(ap.production ?? {}) };
    }
    if (!ap.baseConsumption) {
      ap.baseConsumption = { ...(ap.consumption ?? {}) };
    }
  }

  const seed = typeof base.seed === 'string' ? base.seed : 'skyline-career-br-v1';
  let lastBatchAtMs = resolveBatchAnchorMs(base, nowMs);

  // Freshly migrated v1: anchor now without retroactive catch-up.
  if (version === 1) {
    lastBatchAtMs = nowMs;
  }

  const migrated: CareerEconomyWorld = {
    version: 3,
    seed,
    tick: typeof base.tick === 'number' ? base.tick : 0,
    lastBatchAtMs,
    lastSyncedAtMs: lastBatchAtMs,
    airports: base.airports,
    lots: Array.isArray(base.lots) ? base.lots : [],
    events: Array.isArray(base.events) ? base.events : [],
    npcs: Array.isArray(base.npcs) ? base.npcs : [],
    npcFlights: Array.isArray(base.npcFlights) ? base.npcFlights : [],
    inboundPending: Array.isArray((base as { inboundPending?: unknown }).inboundPending)
      ? ((base as { inboundPending: CareerEconomyWorld['inboundPending'] }).inboundPending ?? [])
      : [],
  };

  ensureNpcFleet(migrated);
  migrateNpcTimestamps(migrated, Number.isFinite(version) ? version : 0);
  ensureWorldFuelInventory(migrated);
  pruneDeadLots(migrated);

  return migrated;
}

/**
 * Advance the world by whole hours elapsed since lastBatchAtMs (1:1 batches),
 * and settle continuous NPC ops due at nowMs. Partial hours are preserved.
 */
export function ensureEconomyCaughtUp(
  world: CareerEconomyWorld | CareerEconomyWorldV1 | Record<string, unknown>,
  nowMs = Date.now(),
  opts: { maxTicks?: number } = {},
): { advancedTicks: number; settledFlights: number; world: CareerEconomyWorld } {
  const migrated = migrateEconomyWorld(world, { nowMs });
  const w = world as CareerEconomyWorld;
  w.version = 3;
  w.seed = migrated.seed;
  w.tick = migrated.tick;
  w.lastBatchAtMs = migrated.lastBatchAtMs;
  w.lastSyncedAtMs = migrated.lastBatchAtMs;
  w.airports = migrated.airports;
  w.lots = migrated.lots;
  w.events = migrated.events ?? [];
  w.npcs = migrated.npcs;
  w.npcFlights = migrated.npcFlights;

  // Mid-hour continuous ops first (arrivals between batches).
  let settledFlights = settleNpcOpsDue(w, nowMs).settledFlights;

  const last = w.lastBatchAtMs;
  const elapsed = Math.max(0, nowMs - last);
  const maxTicks = opts.maxTicks ?? MAX_CATCH_UP_TICKS;
  const hours = Math.min(maxTicks, Math.floor(elapsed / MS_PER_TICK));
  if (hours > 0) {
    tickEconomyN(w, hours, { advanceWallClock: true, fromBatchAtMs: last });
  }
  // Preserve fractional hour for the next batch boundary.
  w.lastBatchAtMs = nowMs - (elapsed % MS_PER_TICK);
  w.lastSyncedAtMs = w.lastBatchAtMs;

  settledFlights += settleNpcOpsDue(w, nowMs).settledFlights;
  return { advancedTicks: hours, settledFlights, world: w };
}

function baseProdOf(ap: AirportTerminal, commodityId: CommodityId): number {
  return ap.baseProduction?.[commodityId] ?? ap.production[commodityId] ?? 0;
}

function baseConsOf(ap: AirportTerminal, commodityId: CommodityId): number {
  return ap.baseConsumption?.[commodityId] ?? ap.consumption[commodityId] ?? 0;
}

/** Day-of-year style season from tick (1 tick = 1h). */
function seasonalFactor(commodityId: CommodityId, tick: number): number {
  const day = Math.floor(tick / 24) % 365;
  const wave = Math.sin((2 * Math.PI * day) / 365);
  if (commodityId === 'perishables') {
    return 1 + wave * 0.18;
  }
  if (commodityId === 'electronics') {
    return 1 + wave * 0.06;
  }
  return 1 + wave * 0.04;
}

function activeEvents(world: CareerEconomyWorld, tick = world.tick): EconomyEvent[] {
  return (world.events ?? []).filter((e) => e.startsAtTick <= tick && tick < e.endsAtTick);
}

function eventMultiplier(
  world: CareerEconomyWorld,
  ap: AirportTerminal,
  commodityId: CommodityId,
  side: 'prod' | 'cons',
): number {
  let m = 1;
  for (const ev of activeEvents(world)) {
    if (ev.region !== ap.region) continue;
    if (ev.commodityId && ev.commodityId !== commodityId) continue;
    switch (ev.kind) {
      case 'harvest_boost':
        if (side === 'prod' && (!ev.commodityId || ev.commodityId === 'perishables')) m *= 1.35;
        break;
      case 'factory_outage':
        if (side === 'prod' && (!ev.commodityId || ev.commodityId === 'electronics' || ev.commodityId === 'machinery')) {
          m *= 0.55;
        }
        break;
      case 'port_congestion':
        if (side === 'cons') m *= 0.85;
        if (side === 'prod') m *= 0.9;
        break;
      case 'festival_demand':
        if (side === 'cons') m *= 1.4;
        break;
      default:
        break;
    }
  }
  return m;
}

function maybeSpawnEvents(world: CareerEconomyWorld, rng: () => number): void {
  if (!world.events) world.events = [];
  // Drop finished events older than 48h
  world.events = world.events.filter((e) => e.endsAtTick > world.tick - 48);
  const active = activeEvents(world);
  if (active.length >= 3) return;
  if (rng() > 0.04) return;

  const regions = [...new Set(world.airports.map((a) => a.region))];
  const region = regions[Math.floor(rng() * regions.length)] ?? 'BR-SE';
  const kinds: EconomyEventKind[] = [
    'harvest_boost',
    'port_congestion',
    'factory_outage',
    'festival_demand',
  ];
  const kind = kinds[Math.floor(rng() * kinds.length)]!;
  const duration = 12 + Math.floor(rng() * 36);
  let commodityId: CommodityId | undefined;
  let label = '';
  switch (kind) {
    case 'harvest_boost':
      commodityId = 'perishables';
      label = `Harvest surge in ${region}`;
      break;
    case 'factory_outage':
      commodityId = rng() > 0.5 ? 'electronics' : 'machinery';
      label = `Factory outage (${commodityId}) in ${region}`;
      break;
    case 'port_congestion':
      label = `Port congestion in ${region}`;
      break;
    case 'festival_demand':
      commodityId = rng() > 0.5 ? 'general' : 'perishables';
      label = `Festival demand for ${commodityId} in ${region}`;
      break;
  }
  world.events.push({
    id: `evt_${world.tick}_${kind}_${Math.floor(rng() * 1e6)}`,
    kind,
    region,
    commodityId,
    startsAtTick: world.tick,
    endsAtTick: world.tick + duration,
    label,
  });
}

/** Net flow trend for UI: rising / falling / stable. */
export function stockTrend(
  productionKg: number,
  consumptionKg: number,
): 'rising' | 'falling' | 'stable' {
  const net = productionKg - consumptionKg;
  if (net > 80) return 'rising';
  if (net < -80) return 'falling';
  return 'stable';
}

export function listActiveEconomyEvents(
  world: CareerEconomyWorld,
  opts: { region?: string; icao?: string } = {},
): EconomyEvent[] {
  let region = opts.region;
  if (!region && opts.icao) {
    region = world.airports.find((a) => a.icao === opts.icao?.toUpperCase())?.region;
  }
  return activeEvents(world).filter((e) => !region || e.region === region);
}

function airportMap(world: CareerEconomyWorld): Map<string, AirportTerminal> {
  return new Map(world.airports.map((a) => [a.icao, a]));
}

/**
 * Apply a freight delivery to terminal stocks.
 * Removes up to `kg` from origin; credits full `kg` into dest (capacity-clamped).
 * Dest credit can exceed origin draw because lot formation soft-commits surplus.
 */
export function applyFreightDelivery(
  world: CareerEconomyWorld,
  opts: {
    commodityId: CommodityId;
    originIcao: string;
    destIcao: string;
    kg: number;
  },
): { removedFromOriginKg: number; addedToDestKg: number; originStockKg: number; destStockKg: number } {
  const byIcao = airportMap(world);
  const origin = byIcao.get(opts.originIcao.toUpperCase());
  const dest = byIcao.get(opts.destIcao.toUpperCase());
  if (!origin) {
    throw new Error(`Unknown origin airport: ${opts.originIcao}`);
  }
  if (!dest) {
    throw new Error(`Unknown destination airport: ${opts.destIcao}`);
  }

  const qty = Math.max(0, Math.floor(opts.kg));
  const oStock = ensurePile(origin, opts.commodityId);
  const dStock = ensurePile(dest, opts.commodityId);
  const removedFromOriginKg = Math.min(qty, oStock.stockKg);
  oStock.stockKg = clamp(oStock.stockKg - removedFromOriginKg, 0, oStock.capacityKg);
  const room = Math.max(0, dStock.capacityKg - dStock.stockKg);
  const addedToDestKg = Math.min(qty, room);
  dStock.stockKg = clamp(dStock.stockKg + addedToDestKg, 0, dStock.capacityKg);
  return {
    removedFromOriginKg,
    addedToDestKg,
    originStockKg: oStock.stockKg,
    destStockKg: dStock.stockKg,
  };
}

function applyProductionConsumption(world: CareerEconomyWorld, rng: () => number): void {
  for (const ap of world.airports) {
    if (!ap.baseProduction) ap.baseProduction = { ...(ap.production ?? {}) };
    if (!ap.baseConsumption) ap.baseConsumption = { ...(ap.consumption ?? {}) };

    for (const c of CAREER_COMMODITIES) {
      const stock = ensurePile(ap, c.id);
      const fill = fillPct(stock);
      const baseProd = baseProdOf(ap, c.id);
      const baseCons = baseConsOf(ap, c.id);

      // Production slows as warehouse fills; consumption slows when nearly empty.
      const prodSaturation = fill >= 0.7 ? 1 - ((fill - 0.7) / 0.3) * 0.55 : 1;
      const consStarvation = fill <= 0.15 ? Math.max(0.15, fill / 0.15) : 1;
      const season = seasonalFactor(c.id, world.tick);
      const noise = 0.88 + rng() * 0.24;
      const evProd = eventMultiplier(world, ap, c.id, 'prod');
      const evCons = eventMultiplier(world, ap, c.id, 'cons');

      const prod = Math.max(
        0,
        Math.round(baseProd * prodSaturation * season * evProd * noise),
      );
      const cons = Math.max(
        0,
        Math.round(baseCons * consStarvation * season * evCons * (0.9 + rng() * 0.2)),
      );

      ap.production[c.id] = prod;
      ap.consumption[c.id] = cons;
      stock.stockKg = clamp(stock.stockKg + prod - cons, 0, stock.capacityKg);
    }
  }
}

/** Keep expired/delivered lots this many ticks after expiresAtTick, then drop. */
export const DEAD_LOT_RETENTION_TICKS = 12;

/**
 * Drop market lots that are no longer actionable.
 * Keeps available / reserved / in_transit always; expired & delivered only briefly.
 * Does not touch player missions / logbook (separate file).
 */
export function pruneDeadLots(
  world: CareerEconomyWorld,
  opts: { retentionTicks?: number } = {},
): { removed: number; kept: number } {
  const retention = Math.max(
    0,
    Math.floor(opts.retentionTicks ?? DEAD_LOT_RETENTION_TICKS),
  );
  const keepFrom = world.tick - retention;
  const before = world.lots.length;
  world.lots = world.lots.filter((lot) => {
    if (
      lot.status === 'available' ||
      lot.status === 'reserved' ||
      lot.status === 'in_transit'
    ) {
      return true;
    }
    // expired | delivered — retain only a short window for debugging
    return (
      typeof lot.expiresAtTick === 'number' && lot.expiresAtTick >= keepFrom
    );
  });

  // Drop orphan/stale player inbound so soft-fill cannot linger forever.
  if (Array.isArray(world.inboundPending) && world.inboundPending.length > 0) {
    world.inboundPending = world.inboundPending.filter(
      (pending) =>
        typeof pending.expiresAtTick === 'number' &&
        pending.expiresAtTick >= keepFrom,
    );
  }

  return { removed: before - world.lots.length, kept: world.lots.length };
}

function expireLots(world: CareerEconomyWorld): void {
  for (const lot of world.lots) {
    if (lot.status !== 'available' && lot.status !== 'reserved') {
      continue;
    }
    if (world.tick >= lot.expiresAtTick) {
      lot.status = 'expired';
    }
  }
  pruneDeadLots(world);
}

function availableKg(lot: ShipmentLot): number {
  if (lot.status !== 'available' && lot.status !== 'reserved') {
    return 0;
  }
  return Math.max(0, lot.quantityKg - lot.reservedKg);
}

function fillPct(stock: StockPile): number {
  return stock.capacityKg > 0 ? stock.stockKg / stock.capacityKg : 0;
}

function laneKey(commodityId: CommodityId, origin: string, dest: string): string {
  return `${commodityId}:${origin}:${dest}`;
}

/**
 * Form shipment lots from surplus→shortage pairs.
 * Only creates a lot when value of moving cargo is clearly positive.
 */
function formLotsFromImbalances(world: CareerEconomyWorld, rng: () => number): void {
  const activeCounts = new Map<string, number>();
  const largeCounts = new Map<string, number>();
  const smallCounts = new Map<string, number>();
  for (const l of world.lots) {
    if (l.status !== 'available' && l.status !== 'reserved' && l.status !== 'in_transit') {
      continue;
    }
    const key = laneKey(l.commodityId, l.originIcao, l.destIcao);
    activeCounts.set(key, (activeCounts.get(key) ?? 0) + 1);
    if (l.quantityKg >= 4_000) {
      largeCounts.set(key, (largeCounts.get(key) ?? 0) + 1);
    } else {
      smallCounts.set(key, (smallCounts.get(key) ?? 0) + 1);
    }
  }

  const pushLot = (
    key: string,
    commodity: (typeof CAREER_COMMODITIES)[number],
    origin: { ap: AirportTerminal; stock: { stockKg: number; capacityKg: number }; fill: number },
    dest: {
      ap: AirportTerminal;
      stock: { stockKg: number; capacityKg: number };
      fill: number;
    },
    qty: number,
    size: 'large' | 'small',
    laneSaturation: number,
    inboundKg: number,
  ): void => {
    const originWx = regionalWeatherIndex(world, origin.ap.region);
    const destWx = regionalWeatherIndex(world, dest.ap.region);
    const laneWeather = worseWeather(originWx, destWx);
    const destCap = dest.stock.capacityKg;
    const effectiveDestFill =
      destCap > 0 ? (dest.stock.stockKg + inboundKg) / destCap : dest.fill;
    const urgent =
      effectiveDestFill < 0.22 ||
      commodity.perishable === true ||
      (dest.fill < 0.28 && inboundKg < 1_000) ||
      laneSaturation >= 0.5 ||
      (laneWeather === 'poor' && dest.fill < 0.35);
    const urgencyMult = urgent ? 1.35 : 1;
    const distanceBias =
      origin.ap.region.split('-')[0] === dest.ap.region.split('-')[0] ? 1 : 1.15;
    const destPile = ensurePile(dest.ap, commodity.id);
    const gap =
      localUnitPriceUsd(commodity.id, destPile) - localUnitPriceUsd(commodity.id, origin.stock);
    // Low home-region NPC bid capacity → slightly richer freight for the player.
    const batchNowMs = world.lastBatchAtMs ?? Date.now();
    const capacity = npcRegionBidCapacity(world, origin.ap.region, batchNowMs);
    const capacityPayMult = 1 + (1 - capacity) * 0.22;
    // Saturated OD lane → scarce remaining slots pay a bit more.
    const scarcePayMult =
      laneSaturation >= 0.35 ? 1 + laneSaturation * 0.12 : 1;
    const weatherPayMult = regionalWeatherPayMult(laneWeather);
    const payPerKg = Math.min(
      gap *
        0.55 *
        urgencyMult *
        distanceBias *
        capacityPayMult *
        scarcePayMult *
        weatherPayMult,
      commodity.basePricePerKg * 1.8,
    );
    const payUsd = Math.round(qty * payPerKg);
    const baseLife = commodity.perishable
      ? 8 + Math.floor(rng() * 4)
      : 18 + Math.floor(rng() * 8);
    const life = Math.max(
      4,
      Math.round(baseLife * regionalWeatherLifeMult(laneWeather)),
    );

    const lot: ShipmentLot = {
      id: `lot_${world.tick}_${commodity.id}_${origin.ap.icao}_${dest.ap.icao}_${Math.floor(rng() * 1e6)}`,
      commodityId: commodity.id,
      originIcao: origin.ap.icao,
      destIcao: dest.ap.icao,
      quantityKg: qty,
      reservedKg: 0,
      createdAtTick: world.tick,
      expiresAtTick: world.tick + life,
      payUsd,
      urgency: urgent ? 'urgent' : 'normal',
      reason: `${commodity.name}: surplus at ${origin.ap.icao} (fill ${(origin.fill * 100).toFixed(0)}%) → shortage at ${dest.ap.icao} (fill ${(dest.fill * 100).toFixed(0)}%)${size === 'small' ? ' · LTL' : ''}`,
      status: 'available',
    };

    origin.stock.stockKg = clamp(origin.stock.stockKg - qty * 0.25, 0, origin.stock.capacityKg);
    world.lots.push(lot);
    activeCounts.set(key, (activeCounts.get(key) ?? 0) + 1);
    if (size === 'large') {
      largeCounts.set(key, (largeCounts.get(key) ?? 0) + 1);
    } else {
      smallCounts.set(key, (smallCounts.get(key) ?? 0) + 1);
    }
  };

  for (const commodity of CAREER_CARGO_COMMODITIES) {
    const ranked = world.airports
      .map((ap) => {
        const stock = ensurePile(ap, commodity.id);
        return {
          ap,
          stock,
          fill: fillPct(stock),
          price: localUnitPriceUsd(commodity.id, stock),
        };
      })
      .sort((a, b) => a.fill - b.fill);

    const destinations = ranked.filter((r) => r.fill <= 0.45).slice(0, 8);
    const origins = ranked.filter((r) => r.fill >= 0.55).slice(-8).reverse();

    for (const origin of origins) {
      for (const dest of destinations) {
        if (origin.ap.icao === dest.ap.icao) {
          continue;
        }
        const key = laneKey(commodity.id, origin.ap.icao, dest.ap.icao);
        const laneSat = npcLaneSaturation(
          world,
          origin.ap.icao,
          dest.ap.icao,
          commodity.id,
        );
        if (laneSat >= 1) {
          continue;
        }
        const satPenalty = laneSat >= 0.5 ? 1 : 0;
        if ((activeCounts.get(key) ?? 0) + satPenalty >= MAX_LOTS_PER_LANE) {
          continue;
        }

        const priceGap = dest.price - origin.price;
        if (priceGap < commodity.basePricePerKg * 0.2) {
          continue;
        }

        const inboundKg = laneInboundKg(
          world,
          null,
          dest.ap.icao,
          commodity.id,
        );

        const surplusKg = origin.stock.stockKg - origin.stock.capacityKg * 0.48;
        const roomKg = dest.stock.capacityKg * 0.58 - dest.stock.stockKg;
        let qty = Math.min(surplusKg, roomKg);
        qty = Math.floor(qty / 100) * 100;

        // Large lot for narrow/wide freighters.
        if (
          qty >= 4_000 &&
          (largeCounts.get(key) ?? 0) < MAX_LARGE_LOTS_PER_LANE &&
          (activeCounts.get(key) ?? 0) + satPenalty < MAX_LOTS_PER_LANE
        ) {
          const largeQty = Math.min(qty, 28_000);
          pushLot(
            key,
            commodity,
            origin,
            dest,
            largeQty,
            'large',
            laneSat,
            inboundKg,
          );
          // Refresh remaining after soft-commit for optional LTL companion.
          const surplusAfter = origin.stock.stockKg - origin.stock.capacityKg * 0.48;
          const roomAfter = dest.stock.capacityKg * 0.58 - dest.stock.stockKg;
          qty = Math.floor(Math.min(surplusAfter, roomAfter) / 100) * 100;
        }

        // Small LTL lots for light turboprop / partial fills.
        if (
          qty >= 400 &&
          (smallCounts.get(key) ?? 0) < MAX_SMALL_LOTS_PER_LANE &&
          (activeCounts.get(key) ?? 0) + satPenalty < MAX_LOTS_PER_LANE
        ) {
          const smallQty = Math.min(qty, 2_000);
          // Prefer variety: 400–2000 in 100 kg steps.
          const sized = Math.max(400, Math.min(smallQty, 400 + Math.floor(rng() * 17) * 100));
          pushLot(
            key,
            commodity,
            origin,
            dest,
            Math.min(smallQty, sized),
            'small',
            laneSat,
            inboundKg,
          );
        }
      }
    }
  }
}

/** Advance the local economy by one hourly batch. Mutates and returns the world. */
export function tickEconomy(
  world: CareerEconomyWorld,
  opts: { rngSeed?: string; batchNowMs?: number } = {},
): CareerEconomyWorld {
  if (
    (world as { version?: number }).version !== 3 ||
    !Array.isArray(world.events) ||
    !Array.isArray(world.npcs) ||
    typeof world.lastBatchAtMs !== 'number'
  ) {
    const migrated = migrateEconomyWorld(world);
    world.version = 3;
    world.lastBatchAtMs = migrated.lastBatchAtMs;
    world.lastSyncedAtMs = migrated.lastBatchAtMs;
    world.events = migrated.events;
    world.airports = migrated.airports;
    world.lots = migrated.lots;
    world.npcs = migrated.npcs;
    world.npcFlights = migrated.npcFlights;
  }

  ensureNpcFleet(world);

  world.tick += 1;
  const batchNowMs =
    opts.batchNowMs ??
    (world.lastBatchAtMs ?? Date.now()) + MS_PER_TICK;
  const rng = mulberry32(hashSeed(`${opts.rngSeed ?? world.seed}:t${world.tick}`));

  applyProductionConsumption(world, rng);
  expireLots(world);
  maybeSpawnEvents(world, rng);
  formLotsFromImbalances(world, rng);
  tickNpcFreighters(world, rng, { batchNowMs });

  // Mild TF-like growth: terminals that stay well-supplied bump level slowly
  for (const ap of world.airports) {
    let ok = 0;
    let n = 0;
    for (const c of CAREER_COMMODITIES) {
      const s = ap.inventory[c.id];
      if (!s) continue;
      n += 1;
      if (fillPct(s) > 0.35 && fillPct(s) < 0.85) {
        ok += 1;
      }
    }
    if (n > 0 && ok / n >= 0.75 && world.tick % 12 === 0 && ap.level < 5) {
      ap.level += 1;
      if (!ap.baseProduction) ap.baseProduction = { ...(ap.production ?? {}) };
      if (!ap.baseConsumption) ap.baseConsumption = { ...(ap.consumption ?? {}) };
      for (const c of CAREER_COMMODITIES) {
        const s = ensurePile(ap, c.id);
        s.capacityKg = Math.round(s.capacityKg * 1.05);
        ap.baseProduction[c.id] = Math.round(baseProdOf(ap, c.id) * 1.03);
        ap.baseConsumption[c.id] = Math.round(baseConsOf(ap, c.id) * 1.03);
      }
    }
  }

  return world;
}

/**
 * Shift absolute wall-clock stamps (batch anchor, NPC flights, busy/rest).
 * Used so instant +N hour advances age in-progress ops instead of freezing them.
 */
export function shiftEconomyWallClock(
  world: CareerEconomyWorld,
  deltaMs: number,
): void {
  if (!Number.isFinite(deltaMs) || deltaMs === 0) return;
  if (typeof world.lastBatchAtMs === 'number' && Number.isFinite(world.lastBatchAtMs)) {
    world.lastBatchAtMs += deltaMs;
  }
  if (typeof world.lastSyncedAtMs === 'number' && Number.isFinite(world.lastSyncedAtMs)) {
    world.lastSyncedAtMs += deltaMs;
  }
  for (const flight of world.npcFlights ?? []) {
    if (typeof flight.departedAtMs === 'number' && Number.isFinite(flight.departedAtMs)) {
      flight.departedAtMs += deltaMs;
    }
    if (typeof flight.arrivesAtMs === 'number' && Number.isFinite(flight.arrivesAtMs)) {
      flight.arrivesAtMs += deltaMs;
    }
  }
  for (const npc of world.npcs ?? []) {
    if (typeof npc.busyUntilMs === 'number' && Number.isFinite(npc.busyUntilMs)) {
      npc.busyUntilMs += deltaMs;
    }
    if (typeof npc.restUntilMs === 'number' && Number.isFinite(npc.restUntilMs)) {
      npc.restUntilMs += deltaMs;
    }
  }
}

/**
 * Advance n hourly batches. When advanceWallClock is true (default for UI +1 day /
 * catch-up), shifts lastBatchAtMs and uses coherent batch wall times for NPC claims.
 *
 * Instant +N (no fromBatchAtMs) rewinds wall timestamps so the previous lastBatch
 * maps to (now − N hours), then resimulates forward to now. Without that rewind,
 * rapid +1 day clicks only bump the tick counter while NPC ETAs stay glued to
 * Date.now() and the competing fleet board looks frozen.
 */
export function tickEconomyN(
  world: CareerEconomyWorld,
  n: number,
  opts: { advanceWallClock?: boolean; fromBatchAtMs?: number } = {},
): CareerEconomyWorld {
  const steps = Math.max(0, Math.floor(n));
  const advanceWall = opts.advanceWallClock !== false;
  const explicitStart =
    typeof opts.fromBatchAtMs === 'number' && Number.isFinite(opts.fromBatchAtMs)
      ? opts.fromBatchAtMs
      : undefined;

  let startBatch: number;
  if (explicitStart !== undefined) {
    startBatch = explicitStart;
  } else if (advanceWall && steps > 0) {
    const endBatch = Date.now();
    startBatch = endBatch - steps * MS_PER_TICK;
    const prev = world.lastBatchAtMs ?? endBatch;
    shiftEconomyWallClock(world, startBatch - prev);
  } else {
    startBatch = Date.now() - steps * MS_PER_TICK;
  }

  for (let i = 0; i < steps; i++) {
    const batchNowMs = startBatch + (i + 1) * MS_PER_TICK;
    settleNpcOpsDue(world, batchNowMs);
    tickEconomy(world, { batchNowMs });
  }

  if (advanceWall && steps > 0) {
    world.lastBatchAtMs = startBatch + steps * MS_PER_TICK;
    world.lastSyncedAtMs = world.lastBatchAtMs;
  }
  // Catch-up often lands many turnarounds on the same hour — spread them for the board.
  ensureNpcFleet(world);
  return world;
}

export function listMarketLots(
  world: CareerEconomyWorld,
  opts: {
    originIcao?: string;
    destIcao?: string;
    commodityId?: CommodityId;
    nowMs?: number;
  } = {},
): MarketLotView[] {
  const byIcao = airportMap(world);
  const views: MarketLotView[] = [];
  const nowMs = opts.nowMs ?? Date.now();

  for (const lot of world.lots) {
    if (lot.status !== 'available' && lot.status !== 'reserved') {
      continue;
    }
    const avail = availableKg(lot);
    if (avail <= 0) {
      continue;
    }
    if (opts.originIcao && lot.originIcao !== opts.originIcao.toUpperCase()) {
      continue;
    }
    if (opts.destIcao && lot.destIcao !== opts.destIcao.toUpperCase()) {
      continue;
    }
    if (opts.commodityId && lot.commodityId !== opts.commodityId) {
      continue;
    }

    const origin = byIcao.get(lot.originIcao);
    const dest = byIcao.get(lot.destIcao);
    const oStock = origin ? ensurePile(origin, lot.commodityId) : pile(0, 1);
    const dStock = dest ? ensurePile(dest, lot.commodityId) : pile(0, 1);
    const commodity = getCommodity(lot.commodityId);
    const claim = npcClaimForLot(world, lot.id, nowMs);
    const pressure = describeLotMarketPressure(world, lot, nowMs);

    views.push({
      lot,
      originName: origin?.name ?? lot.originIcao,
      destName: dest?.name ?? lot.destIcao,
      commodityName: commodity.name,
      availableKg: avail,
      payPerKgUsd: lot.payUsd / lot.quantityKg,
      originStockKg: oStock.stockKg,
      destStockKg: dStock.stockKg,
      originFillPct: fillPct(oStock),
      destFillPct: fillPct(dStock),
      npcClaim: claim
        ? {
            npcId: claim.npcId,
            npcName: claim.npcName,
            cargoKg: claim.cargoKg,
            etaHours: claim.etaHours,
          }
        : undefined,
      pressure,
    });
  }

  views.sort((a, b) => b.lot.payUsd - a.lot.payUsd);
  return views;
}

/** Active NPC hauls for UI boards. */
export function listActiveNpcFreights(
  world: CareerEconomyWorld,
  nowMs = Date.now(),
): NpcActivityView[] {
  return listNpcActivity(world, nowMs);
}

/** Clone world for immutable-style tests / saves. */
export function cloneEconomyWorld(world: CareerEconomyWorld): CareerEconomyWorld {
  return structuredClone(world);
}
