/**
 * Demand Board — NPC terminal buy-orders when hub stock is short.
 * Player fulfills from warehouse stock via Dispatch missions.
 */

import {
  airportByIcao,
  CAREER_HUB_COORDS,
  getCommodity,
  localUnitPriceUsd,
  resolveAirportCoords,
  routeDistanceNm,
  type CareerEconomyWorld,
} from './career-economy.js';
import { cargoOpsIsUnlocked } from './career-cargo-ops.js';
import { TICKS_PER_HOUR } from './career-clock.js';
import { hubDistanceNm } from './career-ferry-route.js';
import { countryIdFromRegion } from './career-partition.js';
import { demandDeskMultForWarehouse } from './career-ground-staff.js';
import {
  depositCargoToWarehouse,
  findPlayerWarehouseAtIcao,
  withdrawCargoFromWarehouse,
} from './career-warehouse-stock.js';
import { isPortPickupHub } from './career-warehouse.js';
import {
  estimateRouteCargoLimit,
  getAircraftClass,
  listActivePlayerMissions,
  normalizeMissionIntent,
  recomputeMissionTotals,
  resolveConservativeOpsWeights,
  syncPlayerInbound,
} from './career-mission.js';
import {
  assignAircraftToMission,
  findPlayerAircraft,
} from './career-fleet.js';
import {
  findCareerPlayerAirframe,
  resolveAirframeMaxRangeNm,
} from './career-player-airframes.js';
import type {
  CareerMissionsState,
  CommodityId,
  DemandOrder,
  MissionIntent,
} from './types/career-economy.js';

export const DEMAND_COMMODITIES: readonly CommodityId[] = [
  'general',
  'supplies',
  'machinery',
  'electronics',
];

/** Spawn when stock / capacity is below this fraction. */
export const DEMAND_STOCK_FRAC_THRESHOLD = 0.25;

/** Soft max open orders per destination hub. */
export const DEMAND_ORDERS_PER_HUB = 2;

/**
 * Soft cap of open board rows worldwide (keeps Ports GET snappy).
 * Split across countries present in the world so BR hubs (seeded first)
 * cannot monopolize every slot. With 6 map countries ≈ 32 open each.
 */
export const DEMAND_ORDERS_GLOBAL_CAP = 192;

/** Premium on local spot for max unit price (rng in range). */
export const DEMAND_PRICE_PREMIUM_MIN = 1.05;
export const DEMAND_PRICE_PREMIUM_MAX = 1.15;

/**
 * Extra pay multiplier when fulfilling Demand cross-border from a port WH.
 * Stacks on the order's frozen maxUnitPriceUsd (already ~5–15% over spot).
 */
export const DEMAND_INTL_PAY_MULT = 1.28;

/**
 * Bidirectional country pairs allowed for international Demand (not Market lanes).
 * Mirrors lane geography without binding to specific ICAO ODs.
 */
export const DEMAND_INTL_COUNTRY_PAIRS: ReadonlyArray<readonly [string, string]> =
  [
    ['BR', 'US'],
    ['BR', 'AR'],
    ['BR', 'CL'],
    ['BR', 'MX'],
    ['BR', 'CA'],
    ['BR', 'UY'],
    ['BR', 'PY'],
    ['BR', 'PE'],
    ['BR', 'BO'],
    ['BR', 'EC'],
    ['BR', 'CO'],
    ['BR', 'VE'],
    ['BR', 'GY'],
    ['BR', 'SR'],
    ['BR', 'GF'],
    ['AR', 'CL'],
    ['AR', 'US'],
    ['AR', 'UY'],
    ['AR', 'PY'],
    ['AR', 'BO'],
    ['CL', 'US'],
    ['CL', 'PE'],
    ['US', 'CA'],
    ['US', 'MX'],
    ['US', 'PE'],
    ['US', 'EC'],
    ['US', 'CO'],
    ['US', 'VE'],
    ['PE', 'BO'],
    ['PE', 'EC'],
    ['PE', 'CO'],
    ['EC', 'CO'],
    ['CO', 'VE'],
    ['CO', 'MX'],
    ['VE', 'GY'],
    ['GY', 'SR'],
    ['SR', 'GF'],
    // Central America
    ['PA', 'CR'],
    ['PA', 'CO'],
    ['PA', 'US'],
    ['PA', 'MX'],
    ['PA', 'BR'],
    ['CR', 'NI'],
    ['CR', 'US'],
    ['CR', 'MX'],
    ['NI', 'HN'],
    ['HN', 'SV'],
    ['HN', 'GT'],
    ['SV', 'GT'],
    ['GT', 'MX'],
    ['GT', 'BZ'],
    ['BZ', 'MX'],
    ['BZ', 'US'],
    // Caribbean intl-first
    ['CU', 'US'],
    ['CU', 'DO'],
    ['CU', 'BS'],
    ['DO', 'US'],
    ['DO', 'HT'],
    ['DO', 'JM'],
    ['DO', 'CO'],
    ['HT', 'US'],
    ['JM', 'US'],
    ['JM', 'TT'],
    ['BS', 'US'],
    ['BS', 'MX'],
    ['TT', 'VE'],
    ['TT', 'BB'],
    ['TT', 'GD'],
    ['BB', 'LC'],
    ['LC', 'AG'],
    ['LC', 'GD'],
    ['AG', 'US'],
    ['GP', 'MQ'],
    ['GP', 'AG'],
    ['GP', 'US'],
    ['MQ', 'BB'],
    ['MQ', 'US'],
    ['CW', 'TT'],
    ['CW', 'VE'],
    ['CW', 'US'],
    ['SX', 'AG'],
    ['SX', 'GP'],
    ['SX', 'US'],
    ['AW', 'CW'],
    ['AW', 'VE'],
    ['AW', 'US'],
    ['PT', 'ES'],
    ['PT', 'BR'],
    ['ES', 'FR'],
    ['ES', 'IT'],
    ['ES', 'US'],
    ['FR', 'GB'],
    ['FR', 'DE'],
    ['FR', 'IT'],
    ['FR', 'BR'],
    ['FR', 'US'],
    ['GB', 'NL'],
    ['GB', 'DE'],
    ['GB', 'US'],
    ['NL', 'DE'],
    ['NL', 'BE'],
    ['BE', 'DE'],
    ['DE', 'IT'],
    ['IT', 'US'],
    // MENA-1 Mediterranean face (do not backfill remaining EU-2+ pairs here)
    ['MA', 'ES'],
    ['MA', 'PT'],
    ['MA', 'FR'],
    ['MA', 'DZ'],
    ['DZ', 'FR'],
    ['DZ', 'ES'],
    ['DZ', 'TN'],
    ['TN', 'IT'],
    ['TN', 'FR'],
    ['TN', 'MT'],
    ['EG', 'GR'],
    ['EG', 'TR'],
    ['EG', 'CY'],
    ['EG', 'IL'],
    ['IL', 'CY'],
    ['IL', 'GR'],
    // MENA-2 Gulf (do not backfill remaining EU-2+ pairs here)
    ['SA', 'AE'],
    ['SA', 'KW'],
    ['SA', 'EG'],
    ['AE', 'QA'],
    ['AE', 'BH'],
    ['AE', 'OM'],
    ['AE', 'EG'],
    ['AE', 'IL'],
    ['AE', 'TR'],
    ['AE', 'CY'],
    ['QA', 'BH'],
    ['QA', 'TR'],
    ['BH', 'KW'],
    // MENA-3 North Gulf (do not backfill remaining EU-2+ pairs here)
    ['IQ', 'KW'],
    ['IQ', 'SA'],
    ['IQ', 'AE'],
    ['IQ', 'QA'],
    ['IQ', 'IR'],
    ['IQ', 'TR'],
    ['IQ', 'EG'],
    ['IR', 'AE'],
    ['IR', 'QA'],
    ['IR', 'OM'],
    ['IR', 'TR'],
    // MENA-4 Levant-east (do not backfill remaining EU-2+ pairs here)
    ['JO', 'IL'],
    ['JO', 'SA'],
    ['JO', 'IQ'],
    ['JO', 'TR'],
    ['JO', 'EG'],
    ['LB', 'IL'],
    ['LB', 'TR'],
    ['LB', 'CY'],
    ['LB', 'EG'],
    ['SY', 'TR'],
    ['SY', 'IQ'],
    ['SY', 'JO'],
    // MENA-5 Maghreb/Nile gap (do not backfill remaining EU-2+ pairs here)
    ['LY', 'TN'],
    ['LY', 'EG'],
    ['LY', 'MT'],
    ['LY', 'TR'],
    ['SD', 'EG'],
    ['SD', 'SA'],
    ['SD', 'LY'],
    // MENA-6 Yemen (do not backfill remaining EU-2+ pairs here)
    ['YE', 'SA'],
    ['YE', 'OM'],
    ['YE', 'AE'],
    ['YE', 'SD'],
    // Asia-1 Pakistan (do not backfill remaining EU-2+ pairs here)
    ['PK', 'AE'],
    ['PK', 'OM'],
    ['PK', 'IR'],
    ['PK', 'SA'],
    // Asia-2 India west (do not backfill remaining EU-2+ pairs here)
    ['IN', 'PK'],
    ['IN', 'AE'],
    ['IN', 'OM'],
    ['IN', 'SA'],
    // Asia-4 Sri Lanka (do not backfill remaining EU-2+ pairs here)
    ['LK', 'IN'],
    ['LK', 'AE'],
    ['LK', 'OM'],
    ['LK', 'SA'],
    // Asia-5 Central Asia (do not backfill remaining EU-2+ pairs here)
    ['KZ', 'UZ'],
    ['KZ', 'AZ'],
    ['KZ', 'TM'],
    ['UZ', 'TM'],
    ['UZ', 'IR'],
    ['TM', 'IR'],
    ['TM', 'AZ'],
    // Asia-6 Tajikistan / Kyrgyzstan (do not backfill remaining EU-2+ pairs here)
    ['TJ', 'UZ'],
    ['TJ', 'KG'],
    ['TJ', 'KZ'],
    ['KG', 'KZ'],
    ['KG', 'UZ'],
    // Asia-7 Afghanistan (do not backfill remaining EU-2+ pairs here)
    ['AF', 'PK'],
    ['AF', 'IR'],
    ['AF', 'UZ'],
    ['AF', 'TJ'],
    // Asia-8 Nepal / Bangladesh (do not backfill remaining EU-2+ pairs here)
    ['NP', 'IN'],
    ['BD', 'IN'],
    ['BD', 'NP'],
    // Asia-9 Bhutan / Myanmar (do not backfill remaining EU-2+ pairs here)
    ['BT', 'IN'],
    ['BT', 'NP'],
    ['BT', 'BD'],
    ['MM', 'BD'],
    ['MM', 'IN'],
    // Asia-10 Thailand (do not backfill remaining EU-2+ pairs here)
    ['TH', 'MM'],
    ['TH', 'BD'],
    ['TH', 'IN'],
    // Asia-11 Vietnam / Malaysia / Singapore (do not backfill remaining EU-2+ pairs here)
    ['VN', 'TH'],
    ['VN', 'MY'],
    ['VN', 'SG'],
    ['MY', 'TH'],
    ['MY', 'SG'],
    ['SG', 'TH'],
  ];

const DEMAND_INTL_PAIR_SET = new Set(
  DEMAND_INTL_COUNTRY_PAIRS.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]),
);

const DEMAND_TTL_TICKS = 96 * 2.5; // ~2.5 economy days

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function nextId(prefix: string, tick: number): string {
  return `${prefix}_${tick}_${Math.floor(Math.random() * 1e6)}`;
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

function demandAirportCountryId(ap: { region?: string }): string | null {
  const id = countryIdFromRegion(ap.region ?? '');
  return /^[A-Z]{2}$/.test(id) && id !== 'XX' ? id : null;
}

/**
 * Equal-ish soft quotas per country so seed order (BR first) cannot fill
 * DEMAND_ORDERS_GLOBAL_CAP alone. Remainder goes to sorted countries first.
 */
export function demandCountryOpenQuotas(
  world: CareerEconomyWorld,
  globalCap: number = DEMAND_ORDERS_GLOBAL_CAP,
): Map<string, number> {
  const countries = new Set<string>();
  for (const ap of world.airports) {
    if (ap.bushTripOnly) continue;
    const icao = ap.icao.trim().toUpperCase();
    if (!CAREER_HUB_COORDS[icao]) continue;
    const c = demandAirportCountryId(ap);
    if (c) countries.add(c);
  }
  const list = [...countries].sort((a, b) => a.localeCompare(b));
  const n = Math.max(1, list.length);
  const base = Math.floor(globalCap / n);
  let rem = globalCap % n;
  const quotas = new Map<string, number>();
  for (const c of list) {
    const extra = rem > 0 ? 1 : 0;
    if (rem > 0) rem -= 1;
    quotas.set(c, base + extra);
  }
  return quotas;
}

/** Country id for a career hub ICAO (from world airport region). */
export function demandHubCountryId(
  world: CareerEconomyWorld,
  icao: string,
): string | null {
  const ap = airportByIcao(world, icao.trim().toUpperCase());
  if (!ap?.region) return null;
  const id = countryIdFromRegion(ap.region);
  return /^[A-Z]{2}$/.test(id) && id !== 'XX' ? id : null;
}

export function isDemandInternationalCountryPair(
  originCountryId: string,
  destCountryId: string,
): boolean {
  const a = originCountryId.trim().toUpperCase();
  const b = destCountryId.trim().toUpperCase();
  if (!a || !b || a === b) return false;
  return DEMAND_INTL_PAIR_SET.has(`${a}|${b}`);
}

/**
 * Soft mult for pay (1 = domestic). Does not enforce port-WH / allowlist errors.
 */
export function demandInternationalUnitPriceMult(
  world: CareerEconomyWorld,
  originIcao: string,
  destIcao: string,
): number {
  const originCountry = demandHubCountryId(world, originIcao);
  const destCountry = demandHubCountryId(world, destIcao);
  if (!originCountry || !destCountry || originCountry === destCountry) {
    return 1;
  }
  if (!isDemandInternationalCountryPair(originCountry, destCountry)) {
    return 1;
  }
  return DEMAND_INTL_PAY_MULT;
}

/**
 * Gate cross-border Demand accept: allowlisted country pair + port pickup WH origin.
 * Domestic (same country) always passes with mult 1.
 */
export function assertDemandInternationalAccept(
  world: CareerEconomyWorld,
  originIcao: string,
  destIcao: string,
): { international: boolean; unitPriceMult: number; originCountryId: string; destCountryId: string } {
  const origin = originIcao.trim().toUpperCase();
  const dest = destIcao.trim().toUpperCase();
  const originCountryId = demandHubCountryId(world, origin);
  const destCountryId = demandHubCountryId(world, dest);
  if (!originCountryId || !destCountryId) {
    throw new Error(`Unknown country for demand route ${origin}→${dest}`);
  }
  if (originCountryId === destCountryId) {
    return {
      international: false,
      unitPriceMult: 1,
      originCountryId,
      destCountryId,
    };
  }
  if (!isDemandInternationalCountryPair(originCountryId, destCountryId)) {
    throw new Error(
      `International demand ${originCountryId}→${destCountryId} is not on the allowed country pairs`,
    );
  }
  if (!isPortPickupHub(origin)) {
    throw new Error(
      `International demand requires a warehouse at a port pickup hub (not ${origin})`,
    );
  }
  return {
    international: true,
    unitPriceMult: DEMAND_INTL_PAY_MULT,
    originCountryId,
    destCountryId,
  };
}

export function demandEffectiveUnitPriceUsd(
  world: CareerEconomyWorld,
  order: Pick<DemandOrder, 'maxUnitPriceUsd' | 'destIcao'>,
  originIcao: string,
  opts?: {
    state?: Pick<CareerMissionsState, 'groundStaff'>;
    warehouseId?: string;
  },
): number {
  const intl = demandInternationalUnitPriceMult(
    world,
    originIcao,
    order.destIcao,
  );
  let unit = order.maxUnitPriceUsd * intl;
  if (opts?.state && opts.warehouseId) {
    unit *= demandDeskMultForWarehouse(opts.state, opts.warehouseId);
  }
  return money(unit);
}

export function ensureDemandOrders(world: CareerEconomyWorld): DemandOrder[] {
  if (!Array.isArray(world.demandOrders)) {
    world.demandOrders = [];
  }
  const orders = world.demandOrders;

  // Expire past-due open orders
  for (const order of orders) {
    if (
      order.status === 'open' &&
      (order.remainingKg <= 0 || order.expiresAtTick <= world.tick)
    ) {
      order.status = order.remainingKg <= 0 ? 'filled' : 'expired';
      if (order.remainingKg <= 0) order.remainingKg = 0;
    }
  }

  const rng = mulberry32(hashSeed(`${world.seed}:demand:${world.tick}`));

  const isOpen = (o: DemandOrder) =>
    o.status === 'open' &&
    o.remainingKg > 0 &&
    o.expiresAtTick > world.tick;

  const quotas = demandCountryOpenQuotas(world);

  // Existing saves may already hold a BR-only full board. Trim countries that
  // exceed their quota (oldest first) so under-served countries can spawn.
  {
    const byCountry = new Map<string, DemandOrder[]>();
    for (const o of orders) {
      if (!isOpen(o)) continue;
      const c = demandHubCountryId(world, o.destIcao);
      if (!c) continue;
      const list = byCountry.get(c) ?? [];
      list.push(o);
      byCountry.set(c, list);
    }
    for (const [country, list] of byCountry) {
      const quota = quotas.get(country) ?? 0;
      if (list.length <= quota) continue;
      list.sort((a, b) => a.arrivedAtTick - b.arrivedAtTick || a.id.localeCompare(b.id));
      const overflow = list.length - quota;
      for (let i = 0; i < overflow; i++) {
        const o = list[i]!;
        o.status = 'expired';
      }
    }
  }

  const openGlobal = () => orders.filter(isOpen).length;

  if (openGlobal() >= DEMAND_ORDERS_GLOBAL_CAP) {
    world.demandOrders = orders.filter(
      (o) =>
        o.status === 'open' ||
        o.expiresAtTick > world.tick - 96,
    );
    return world.demandOrders;
  }

  const openByCountry = new Map<string, number>();
  for (const o of orders) {
    if (!isOpen(o)) continue;
    const c = demandHubCountryId(world, o.destIcao);
    if (!c) continue;
    openByCountry.set(c, (openByCountry.get(c) ?? 0) + 1);
  }

  const trySpawnAtAirport = (ap: (typeof world.airports)[number]): void => {
    if (openGlobal() >= DEMAND_ORDERS_GLOBAL_CAP) return;
    if (ap.bushTripOnly) return;
    const icao = ap.icao.trim().toUpperCase();
    if (!CAREER_HUB_COORDS[icao]) return;

    const country = demandAirportCountryId(ap);
    if (!country) return;
    const quota = quotas.get(country) ?? 0;
    if ((openByCountry.get(country) ?? 0) >= quota) return;

    const openHere = orders.filter(
      (o) =>
        o.destIcao === icao &&
        o.status === 'open' &&
        o.remainingKg > 0 &&
        o.expiresAtTick > world.tick,
    );
    let slots = DEMAND_ORDERS_PER_HUB - openHere.length;
    if (slots <= 0) return;

    for (const commodityId of DEMAND_COMMODITIES) {
      if (slots <= 0) break;
      if (openGlobal() >= DEMAND_ORDERS_GLOBAL_CAP) break;
      if ((openByCountry.get(country) ?? 0) >= quota) break;
      if (openHere.some((o) => o.commodityId === commodityId)) continue;

      const pile = ap.inventory[commodityId];
      if (!pile || pile.capacityKg <= 0) continue;
      const frac = pile.stockKg / pile.capacityKg;
      if (frac >= DEMAND_STOCK_FRAC_THRESHOLD) continue;

      const deficitKg = Math.max(
        0,
        Math.floor(pile.capacityKg * DEMAND_STOCK_FRAC_THRESHOLD - pile.stockKg),
      );
      if (deficitKg < 200) continue;

      const bandMax =
        commodityId === 'machinery' || commodityId === 'electronics'
          ? 2_500
          : 4_000;
      const bandMin = 400;
      const wantedKg = Math.min(
        deficitKg,
        bandMin + Math.floor(rng() * (bandMax - bandMin)),
      );
      if (wantedKg < bandMin) continue;

      const spot = money(localUnitPriceUsd(commodityId, pile));
      const premium =
        DEMAND_PRICE_PREMIUM_MIN +
        rng() * (DEMAND_PRICE_PREMIUM_MAX - DEMAND_PRICE_PREMIUM_MIN);
      const maxUnitPriceUsd = money(spot * premium);

      orders.push({
        id: nextId('demand', world.tick),
        destIcao: icao,
        commodityId,
        wantedKg,
        remainingKg: wantedKg,
        maxUnitPriceUsd,
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + Math.floor(DEMAND_TTL_TICKS),
        status: 'open',
      });
      openHere.push(orders[orders.length - 1]!);
      openByCountry.set(country, (openByCountry.get(country) ?? 0) + 1);
      slots -= 1;
    }
  };

  // Respect per-country quotas so BR-first seed order cannot monopolize the board.
  for (const ap of world.airports) {
    trySpawnAtAirport(ap);
  }

  // Prune filled/expired that are old enough (keep recent for UI briefly)
  world.demandOrders = orders.filter(
    (o) =>
      o.status === 'open' ||
      o.expiresAtTick > world.tick - 96,
  );
  return world.demandOrders;
}

export function listOpenDemandOrders(
  world: CareerEconomyWorld,
  opts: { destIcao?: string; commodityId?: CommodityId } = {},
): DemandOrder[] {
  ensureDemandOrders(world);
  const dest = opts.destIcao?.trim().toUpperCase();
  return (world.demandOrders ?? []).filter(
    (o) =>
      o.status === 'open' &&
      o.remainingKg > 0 &&
      o.expiresAtTick > world.tick &&
      (!dest || o.destIcao === dest) &&
      (!opts.commodityId || o.commodityId === opts.commodityId),
  );
}

/**
 * Accept a demand order: withdraw from warehouse at origin, stage mission WH→dest.
 */
export function acceptDemandOrder(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    orderId: string;
    originIcao: string;
    aircraftId: string;
    /** Optional kg (defaults to min(remaining, warehouse, aircraft)). */
    kg?: number;
  },
): { mission: MissionIntent; order: DemandOrder; kg: number; payUsd: number } {
  ensureDemandOrders(world);
  const order = (world.demandOrders ?? []).find(
    (o) => o.id === opts.orderId.trim(),
  );
  if (!order || order.status !== 'open' || order.remainingKg <= 0) {
    throw new Error('Demand order not available');
  }
  if (order.expiresAtTick <= world.tick) {
    order.status = 'expired';
    throw new Error('Demand order expired');
  }
  if (!cargoOpsIsUnlocked(state.cargoOps, order.commodityId)) {
    const name = getCommodity(order.commodityId).name;
    throw new Error(
      `Cargo Ops: ${name} is locked — unlock it in Hangar → Cargo Ops`,
    );
  }

  const origin = opts.originIcao.trim().toUpperCase();
  const dest = order.destIcao.trim().toUpperCase();
  if (origin === dest) {
    throw new Error('Warehouse and demand destination must differ');
  }

  const wh = findPlayerWarehouseAtIcao(state, origin);
  if (!wh) {
    throw new Error(`No warehouse at ${origin}`);
  }

  const open = listActivePlayerMissions(state.missions ?? []);
  if (open.length > 0) {
    throw new Error(
      `Finish or cancel ${open[0]!.id} before accepting a demand order`,
    );
  }

  const aircraft = findPlayerAircraft(state, opts.aircraftId);
  if (!aircraft) throw new Error(`Unknown aircraft ${opts.aircraftId}`);
  if (aircraft.status !== 'parked') {
    throw new Error(`Aircraft ${aircraft.id} is not parked`);
  }
  if (aircraft.locationIcao.trim().toUpperCase() !== origin) {
    throw new Error(
      `Aircraft is at ${aircraft.locationIcao}, not warehouse hub ${origin}`,
    );
  }

  if (!CAREER_HUB_COORDS[origin] || !CAREER_HUB_COORDS[dest]) {
    throw new Error(`Unknown hub route ${origin}→${dest}`);
  }
  if (!airportByIcao(world, dest)) {
    throw new Error(`Unknown destination ${dest}`);
  }

  const intl = assertDemandInternationalAccept(world, origin, dest);

  const distanceNm =
    hubDistanceNm(origin, dest) ?? routeDistanceNm(world, origin, dest);
  if (distanceNm === undefined) {
    throw new Error(`No route distance for ${origin}→${dest}`);
  }
  const maxRangeNm = resolveAirframeMaxRangeNm(
    aircraft.airframeTypeId,
    aircraft.aircraftClassId,
  );
  if (distanceNm > maxRangeNm) {
    throw new Error(
      `Leg ${origin}→${dest} is ${Math.round(distanceNm)} nm; max range is ${maxRangeNm} nm`,
    );
  }

  const classDef = getAircraftClass(aircraft.aircraftClassId);
  const airframe = findCareerPlayerAirframe(aircraft.airframeTypeId);
  const structuralMax =
    (typeof airframe?.maxCargoKg === 'number' && airframe.maxCargoKg > 0
      ? airframe.maxCargoKg
      : undefined) ?? classDef.maxCargoKg;
  // Match Dispatch / SimBrief prefill: fuel + MTOW ops + station crew, not
  // structural alone (otherwise Demand books 2.2 klb and inject only flies ~1.6).
  const opsWeights = resolveConservativeOpsWeights({
    oewKg: airframe?.oewKg,
    mtowKg: airframe?.mtowKg,
    catalogOewKg: airframe?.oewKg,
    catalogMtowKg: airframe?.mtowKg,
  });
  const routeLimit = estimateRouteCargoLimit(
    aircraft.aircraftClassId,
    distanceNm,
    structuralMax,
    {
      oewKg: opsWeights.oewKg,
      mtowKg: opsWeights.mtowKg,
      fuelCapacityKg: airframe?.fuelCapacityKg,
      fuelBurnKgPerNm: airframe?.fuelBurnKgPerNm,
      airframeTypeId: aircraft.airframeTypeId,
      crewKg: opsWeights.crewKg,
    },
  );
  if (!routeLimit.fuelFeasible) {
    throw new Error(
      `Estimated block fuel ${routeLimit.estimatedBlockFuelKg} kg exceeds ` +
        `tank capacity ${routeLimit.fuelCapacityKg} kg for ${origin}→${dest}`,
    );
  }
  const maxCargoKg = routeLimit.operationalMaxCargoKg;

  const stockAvail = (state.playerWarehouses?.stock ?? [])
    .filter(
      (s) => s.warehouseId === wh.id && s.commodityId === order.commodityId,
    )
    .reduce((s, p) => s + p.kg, 0);

  let kg = Math.max(
    0,
    Math.floor(
      opts.kg ??
        Math.min(order.remainingKg, stockAvail, maxCargoKg),
    ),
  );
  kg = Math.min(kg, order.remainingKg, stockAvail, maxCargoKg);
  if (kg <= 0) {
    throw new Error(
      maxCargoKg <= 0
        ? `No payload room under MTOW/fuel for ${origin}→${dest} on this airframe`
        : `No ${order.commodityId} available in warehouse at ${origin} for this order`,
    );
  }

  const withdrawn = withdrawCargoFromWarehouse(state, {
    icao: origin,
    commodityId: order.commodityId,
    kg,
  });

  order.remainingKg -= kg;
  if (order.remainingKg <= 0) {
    order.remainingKg = 0;
    order.status = 'filled';
  }

  const unitPriceUsd = money(
    order.maxUnitPriceUsd *
      intl.unitPriceMult *
      demandDeskMultForWarehouse(state, withdrawn.warehouseId),
  );
  const payUsd = money(unitPriceUsd * kg);
  const deadlineTick = Math.min(
    order.expiresAtTick,
    world.tick + TICKS_PER_HOUR * 72,
  );
  const missionId = `msn_demand_${world.tick}_${origin}_${dest}_${Math.floor(Math.random() * 1e6)}`;
  const lotId = `demand_${order.id}_${kg}`;
  const laneLabel = intl.international
    ? `Intl demand · ${intl.originCountryId}→${intl.destCountryId}`
    : `Demand delivery · ${origin}→${dest}`;

  const mission = recomputeMissionTotals({
    id: missionId,
    lots: [
      {
        shipmentLotId: lotId,
        commodityId: order.commodityId,
        cargoKg: kg,
        payUsd,
        urgency: 'normal',
        reason: intl.international
          ? `Intl demand · ${getCommodity(order.commodityId).name} → ${dest}`
          : `Demand · ${getCommodity(order.commodityId).name} → ${dest}`,
        deadlineTick,
      },
    ],
    shipmentLotId: lotId,
    commodityId: order.commodityId,
    originIcao: origin,
    destIcao: dest,
    cargoKg: kg,
    pax: 0,
    aircraftClassId: aircraft.aircraftClassId,
    airframeTypeId: aircraft.airframeTypeId,
    rolesPackRelPath:
      airframe?.rolesPackRelPath ?? classDef.rolesPackRelPath,
    deadlineTick,
    payUsd,
    urgency: 'normal',
    reason: laneLabel,
    status: 'accepted',
    acceptedAtTick: world.tick,
    aircraftId: aircraft.id,
    demandOrderId: order.id,
    warehouseId: withdrawn.warehouseId,
    warehouseAvgCostUsdPerKg: withdrawn.avgCostUsdPerKg,
    distanceNm: Math.round(distanceNm),
  });

  assignAircraftToMission(state, aircraft.id, mission.id, origin);
  state.missions = [...(state.missions ?? []), mission];
  syncPlayerInbound(world, mission);

  return { mission, order: { ...order }, kg, payUsd };
}

function warehouseCommodityKg(
  state: CareerMissionsState,
  icao: string,
  commodityId: CommodityId,
): number {
  const wh = findPlayerWarehouseAtIcao(state, icao);
  if (!wh) return 0;
  return (state.playerWarehouses?.stock ?? [])
    .filter(
      (s) => s.warehouseId === wh.id && s.commodityId === commodityId && s.kg > 0,
    )
    .reduce((s, p) => s + p.kg, 0);
}

/**
 * Max kg the pilot may set on Edit cargo for a Demand Board mission:
 * current onboard + min(warehouse stock, demand remaining), capped by aircraft.
 */
export function demandMissionEditableMaxKg(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  mission: MissionIntent,
  opts: { maxCargoKg?: number } = {},
): number {
  const normalized = normalizeMissionIntent(mission);
  if (!normalized.demandOrderId) {
    return Math.max(0, Math.floor(normalized.cargoKg));
  }
  const current = Math.max(0, Math.floor(normalized.cargoKg));
  const commodityId = normalized.commodityId;
  const stock = warehouseCommodityKg(state, normalized.originIcao, commodityId);
  const order = (world.demandOrders ?? []).find(
    (o) => o.id === normalized.demandOrderId,
  );
  const remaining =
    order && order.expiresAtTick > world.tick
      ? Math.max(0, Math.floor(order.remainingKg))
      : 0;
  const headroom = Math.min(stock, remaining);
  const cap =
    opts.maxCargoKg !== undefined &&
    Number.isFinite(opts.maxCargoKg) &&
    opts.maxCargoKg > 0
      ? Math.floor(opts.maxCargoKg)
      : Number.POSITIVE_INFINITY;
  return Math.max(1, Math.min(cap, current + headroom));
}

/**
 * Edit cargo on an accepted/dispatched Demand Board mission.
 * Reducing kg restores warehouse stock and demand `remainingKg`;
 * increasing withdraws more from the warehouse and consumes demand remaining.
 */
export function replaceDemandMissionCargo(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  mission: MissionIntent,
  opts: { cargoKg: number; maxCargoKg?: number },
): MissionIntent {
  const normalized = normalizeMissionIntent(mission);
  if (!normalized.demandOrderId) {
    throw new Error('Not a Demand Board mission');
  }
  if (normalized.status !== 'accepted' && normalized.status !== 'dispatched') {
    throw new Error(`Cannot edit mission in status=${normalized.status}`);
  }

  const newKg = Math.floor(opts.cargoKg);
  if (!Number.isFinite(newKg) || newKg <= 0) {
    throw new Error('Edited cargo must be at least 1 kg');
  }

  const line = normalized.lots[0];
  const oldKg = Math.max(
    0,
    Math.floor(line?.cargoKg ?? normalized.cargoKg ?? 0),
  );
  if (oldKg <= 0) {
    throw new Error('Demand mission has no cargo to edit');
  }

  const commodityId = line?.commodityId ?? normalized.commodityId;
  const origin = normalized.originIcao.trim().toUpperCase();
  const dest = normalized.destIcao.trim().toUpperCase();

  const classDef = getAircraftClass(normalized.aircraftClassId);
  const airframeMax = findCareerPlayerAirframe(
    normalized.airframeTypeId,
  )?.maxCargoKg;
  const maxCargoKg =
    opts.maxCargoKg !== undefined &&
    Number.isFinite(opts.maxCargoKg) &&
    opts.maxCargoKg > 0
      ? Math.floor(opts.maxCargoKg)
      : (airframeMax ?? classDef.maxCargoKg);
  if (newKg > maxCargoKg) {
    throw new Error(
      `Edited cargo ${newKg} kg exceeds aircraft capacity ${maxCargoKg} kg`,
    );
  }

  ensureDemandOrders(world);
  const order = (world.demandOrders ?? []).find(
    (o) => o.id === normalized.demandOrderId,
  );
  if (!order) {
    throw new Error('Demand order no longer exists');
  }

  const delta = newKg - oldKg;
  let warehouseAvgCostUsdPerKg =
    normalized.warehouseAvgCostUsdPerKg ?? 0;

  if (delta < 0) {
    const restore = -delta;
    try {
      depositCargoToWarehouse(state, {
        icao: origin,
        commodityId,
        kg: restore,
        avgCostUsdPerKg: warehouseAvgCostUsdPerKg,
        tick: normalized.acceptedAtTick ?? world.tick,
      });
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? `Cannot return cargo to warehouse: ${error.message}`
          : 'Cannot return cargo to warehouse',
      );
    }
    order.remainingKg = Math.min(
      order.wantedKg,
      order.remainingKg + restore,
    );
    if (order.status === 'filled' && order.remainingKg > 0) {
      order.status = 'open';
    }
  } else if (delta > 0) {
    if (order.expiresAtTick <= world.tick) {
      order.status = 'expired';
      throw new Error('Demand order expired — cannot add more cargo');
    }
    if (order.status !== 'open' && order.status !== 'filled') {
      throw new Error('Demand order is not open');
    }
    if (order.remainingKg < delta) {
      throw new Error(
        `Demand order only has ${order.remainingKg} kg remaining (need ${delta} kg more)`,
      );
    }
    const withdrawn = withdrawCargoFromWarehouse(state, {
      icao: origin,
      commodityId,
      kg: delta,
    });
    order.remainingKg -= delta;
    if (order.remainingKg <= 0) {
      order.remainingKg = 0;
      order.status = 'filled';
    } else if (order.status === 'filled') {
      order.status = 'open';
    }
    warehouseAvgCostUsdPerKg = money(
      (warehouseAvgCostUsdPerKg * oldKg +
        withdrawn.avgCostUsdPerKg * delta) /
        newKg,
    );
  }

  const payUsd = money(
    demandEffectiveUnitPriceUsd(world, order, origin, {
      state,
      warehouseId: normalized.warehouseId,
    }) * newKg,
  );
  const deadlineTick = Math.min(
    order.expiresAtTick,
    line?.deadlineTick ?? normalized.deadlineTick,
  );
  const lotId = line?.shipmentLotId ?? normalized.shipmentLotId;

  const replaced = recomputeMissionTotals({
    ...normalized,
    lots: [
      {
        shipmentLotId: lotId,
        commodityId,
        cargoKg: newKg,
        payUsd,
        urgency: line?.urgency ?? 'normal',
        reason:
          line?.reason ??
          `Demand · ${getCommodity(commodityId).name} → ${dest}`,
        deadlineTick,
      },
    ],
    shipmentLotId: lotId,
    commodityId,
    cargoKg: newKg,
    payUsd,
    deadlineTick,
    warehouseId: normalized.warehouseId,
    warehouseAvgCostUsdPerKg,
    demandOrderId: order.id,
    status: 'accepted',
    lastOfpCheck: undefined,
    lastPreflightCheck: undefined,
    fuelAuthorizedOfpId: undefined,
    tripFuelBurnKg: undefined,
    dispatchedAtTick: undefined,
  });

  const missionIdx = (state.missions ?? []).findIndex((m) => m.id === replaced.id);
  if (missionIdx >= 0) {
    state.missions![missionIdx] = replaced;
  }

  syncPlayerInbound(world, replaced);
  return replaced;
}

export function demandSnapshot(
  world: CareerEconomyWorld,
  opts: { warehouseIcaos?: readonly string[] } = {},
): {
  orders: Array<
    DemandOrder & {
      commodityName: string;
      destName: string;
      destCountryId: string | null;
      destLat: number | null;
      destLon: number | null;
      localSpotUsd: number | null;
    }
  >;
} {
  const warehouseIcaos = [
    ...new Set(
      (opts.warehouseIcaos ?? [])
        .map((icao) => icao.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  const open = listOpenDemandOrders(world).filter((o) => {
    // With warehouses owned: hide Dest = only-WH hub (no valid origin≠dest).
    // With no warehouses yet: still show the board as market intel.
    if (warehouseIcaos.length === 0) return true;
    const dest = o.destIcao.trim().toUpperCase();
    return warehouseIcaos.some((icao) => icao !== dest);
  });
  return {
    orders: open.map((o) => {
      const ap = airportByIcao(world, o.destIcao);
      const pile = ap?.inventory[o.commodityId];
      const coords = resolveAirportCoords(o.destIcao, ap ?? null);
      return {
        ...o,
        commodityName: getCommodity(o.commodityId).name,
        destName: ap?.name?.trim() || o.destIcao,
        destCountryId: demandHubCountryId(world, o.destIcao),
        destLat: coords?.lat ?? null,
        destLon: coords?.lon ?? null,
        localSpotUsd: pile ? money(localUnitPriceUsd(o.commodityId, pile)) : null,
      };
    }),
  };
}
