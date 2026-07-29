import type {
  AirportTerminal,
  CareerEconomyWorld,
  CommodityDef,
  CommodityId,
  MarketLotView,
  ShipmentLot,
  StockPile,
} from './types/career-economy.js';

export type {
  AirportTerminal,
  CareerEconomyWorld,
  CommodityDef,
  CommodityId,
  MarketLotView,
  ShipmentLot,
  StockPile,
} from './types/career-economy.js';

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
] as const;

const COMMODITY_BY_ID: Record<CommodityId, CommodityDef> = Object.fromEntries(
  CAREER_COMMODITIES.map((c) => [c.id, c]),
) as Record<CommodityId, CommodityDef>;

export function getCommodity(id: CommodityId): CommodityDef {
  return COMMODITY_BY_ID[id];
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
 * Seed a small local cargo world: ~12 hubs, 4 commodities, asymmetric
 * production/consumption so ticks create surplus→shortage lanes.
 */
export function createSeedEconomyWorld(opts: { seed?: string } = {}): CareerEconomyWorld {
  const seed = opts.seed?.trim() || 'skyline-career-v1';
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
      icao: 'SBBR',
      name: 'Brasília',
      region: 'BR-CW',
      produce: { general: 1.0 },
      consume: { electronics: 1.0, perishables: 1.1, machinery: 0.8 },
    },
    {
      icao: 'SBCF',
      name: 'Belo Horizonte/Confins',
      region: 'BR-SE',
      produce: { machinery: 1.3, general: 1.0 },
      consume: { electronics: 0.9, perishables: 1.0 },
    },
    {
      icao: 'SBSV',
      name: 'Salvador',
      region: 'BR-NE',
      produce: { perishables: 1.5, general: 0.9 },
      consume: { electronics: 0.8, machinery: 0.7 },
    },
    {
      icao: 'SBCT',
      name: 'Curitiba',
      region: 'BR-S',
      produce: { machinery: 1.1, perishables: 1.0 },
      consume: { electronics: 0.9, general: 1.0 },
    },
    {
      icao: 'KMIA',
      name: 'Miami Intl',
      region: 'US-SE',
      produce: { electronics: 1.2, general: 1.3 },
      consume: { perishables: 1.4, machinery: 0.9 },
    },
    {
      icao: 'KJFK',
      name: 'New York/JFK',
      region: 'US-NE',
      produce: { general: 1.1 },
      consume: { electronics: 1.3, perishables: 1.2, machinery: 1.0 },
    },
    {
      icao: 'KORD',
      name: 'Chicago O’Hare',
      region: 'US-MW',
      produce: { machinery: 1.5, general: 1.2 },
      consume: { electronics: 1.0, perishables: 1.0 },
    },
    {
      icao: 'KLAX',
      name: 'Los Angeles Intl',
      region: 'US-W',
      produce: { electronics: 1.5, perishables: 1.1 },
      consume: { machinery: 1.0, general: 1.1 },
    },
    {
      icao: 'EHAM',
      name: 'Amsterdam Schiphol',
      region: 'EU-W',
      produce: { general: 1.2, perishables: 1.0 },
      consume: { electronics: 1.1, machinery: 1.2 },
    },
  ];

  const airports: AirportTerminal[] = hubs.map((h) => {
    const level = 1;
    const capacityBoost = 1 + (level - 1) * 0.15;
    const inventory: AirportTerminal['inventory'] = {};
    const production: AirportTerminal['production'] = {};
    const consumption: AirportTerminal['consumption'] = {};

    for (const c of CAREER_COMMODITIES) {
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
      level,
      inventory,
      production,
      consumption,
    };
  });

  return {
    version: 1,
    seed,
    tick: 0,
    airports,
    lots: [],
  };
}

function airportMap(world: CareerEconomyWorld): Map<string, AirportTerminal> {
  return new Map(world.airports.map((a) => [a.icao, a]));
}

function applyProductionConsumption(world: CareerEconomyWorld): void {
  for (const ap of world.airports) {
    for (const c of CAREER_COMMODITIES) {
      const stock = ensurePile(ap, c.id);
      const prod = ap.production[c.id] ?? 0;
      const cons = ap.consumption[c.id] ?? 0;
      stock.stockKg = clamp(stock.stockKg + prod - cons, 0, stock.capacityKg);
    }
  }
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

/**
 * Form shipment lots from surplus→shortage pairs.
 * Only creates a lot when value of moving cargo is clearly positive.
 */
function formLotsFromImbalances(world: CareerEconomyWorld, rng: () => number): void {
  const activeKeys = new Set(
    world.lots
      .filter((l) => l.status === 'available' || l.status === 'reserved' || l.status === 'in_transit')
      .map((l) => `${l.commodityId}:${l.originIcao}:${l.destIcao}`),
  );

  for (const commodity of CAREER_COMMODITIES) {
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

    // Destinations: low fill / high price. Origins: high fill / low price.
    const destinations = ranked.filter((r) => r.fill <= 0.42).slice(0, 6);
    const origins = ranked.filter((r) => r.fill >= 0.58).slice(-6).reverse();

    for (const origin of origins) {
      for (const dest of destinations) {
        if (origin.ap.icao === dest.ap.icao) {
          continue;
        }
        const key = `${commodity.id}:${origin.ap.icao}:${dest.ap.icao}`;
        if (activeKeys.has(key)) {
          continue;
        }

        const priceGap = dest.price - origin.price;
        // Need meaningful arbitrage / freight value
        if (priceGap < commodity.basePricePerKg * 0.25) {
          continue;
        }

        const surplusKg = origin.stock.stockKg - origin.stock.capacityKg * 0.5;
        const roomKg = dest.stock.capacityKg * 0.55 - dest.stock.stockKg;
        let qty = Math.min(surplusKg, roomKg);
        qty = Math.floor(qty / 100) * 100;
        if (qty < 4_000) {
          continue;
        }
        // Cap lot size so narrow freighters remain relevant
        qty = Math.min(qty, 28_000);

        const urgent = dest.fill < 0.22 || commodity.perishable === true;
        const urgencyMult = urgent ? 1.35 : 1;
        const distanceBias =
          origin.ap.region.split('-')[0] === dest.ap.region.split('-')[0] ? 1 : 1.15;
        const payUsd = Math.round(qty * priceGap * 0.55 * urgencyMult * distanceBias);

        const life = commodity.perishable ? 8 + Math.floor(rng() * 4) : 18 + Math.floor(rng() * 8);

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
          reason: `${commodity.name}: surplus at ${origin.ap.icao} (fill ${(origin.fill * 100).toFixed(0)}%) → shortage at ${dest.ap.icao} (fill ${(dest.fill * 100).toFixed(0)}%)`,
          status: 'available',
        };

        // Soft-commit surplus so we don't spam identical lots next tick
        origin.stock.stockKg = clamp(origin.stock.stockKg - qty * 0.15, 0, origin.stock.capacityKg);

        world.lots.push(lot);
        activeKeys.add(key);
      }
    }
  }
}

/** Advance the local economy by one tick. Mutates and returns the world. */
export function tickEconomy(world: CareerEconomyWorld, opts: { rngSeed?: string } = {}): CareerEconomyWorld {
  world.tick += 1;
  const rng = mulberry32(hashSeed(`${opts.rngSeed ?? world.seed}:t${world.tick}`));

  applyProductionConsumption(world);
  expireLots(world);
  formLotsFromImbalances(world, rng);

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
      for (const c of CAREER_COMMODITIES) {
        const s = ensurePile(ap, c.id);
        s.capacityKg = Math.round(s.capacityKg * 1.08);
      }
    }
  }

  return world;
}

export function tickEconomyN(world: CareerEconomyWorld, n: number): CareerEconomyWorld {
  const steps = Math.max(0, Math.floor(n));
  for (let i = 0; i < steps; i++) {
    tickEconomy(world);
  }
  return world;
}

export function listMarketLots(
  world: CareerEconomyWorld,
  opts: { originIcao?: string; destIcao?: string; commodityId?: CommodityId } = {},
): MarketLotView[] {
  const byIcao = airportMap(world);
  const views: MarketLotView[] = [];

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
    });
  }

  views.sort((a, b) => b.lot.payUsd - a.lot.payUsd);
  return views;
}

/** Clone world for immutable-style tests / saves. */
export function cloneEconomyWorld(world: CareerEconomyWorld): CareerEconomyWorld {
  return structuredClone(world);
}
