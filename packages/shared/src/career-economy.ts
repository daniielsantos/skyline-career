import {
  assertBrCareerHubCatalog,
  BR_CAREER_HUBS,
  buildBrFeederCorridors,
} from './career-br-hubs.js';
import {
  assertUsCareerHubCatalog,
  buildUsFeederCorridors,
  US_CAREER_HUBS,
} from './career-us-hubs.js';
import {
  ensureWorldHubLevels,
  hubLevelHealthMult,
  hubLevelLaneBonus,
  hubLevelOriginPayMult,
  recordFreightSettleActivity,
  recordLotFormationActivity,
  tickHubLevels,
} from './career-hub-level.js';
import {
  ensureFuelTruckFleet,
  seedFuelTruckFleet,
  settleFuelHaulsDue,
  shiftFuelLogisticsWallClock,
  tickFuelLogistics,
} from './career-fuel-logistics.js';
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
import {
  hoursToMs,
  MAX_CATCH_UP_TICKS,
  MS_PER_TICK,
  TICKS_PER_DAY,
} from './career-clock.js';
import {
  activeLaneKg,
  countryIdFromRegion,
  ensureHomeCountryId,
  isDomesticOd,
  listWorldCountryIds,
} from './career-partition.js';
import type {
  AirportTerminal,
  CareerEconomyWorld,
  CareerEconomyWorldV1,
  CommodityDef,
  CommodityId,
  EconomyEvent,
  EconomyEventKind,
  FuelHaul,
  FuelTruck,
  HubTier,
  InternationalLane,
  MarketLotView,
  NpcActivityView,
  NpcFlight,
  NpcFreighter,
  PartitionTickResult,
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
  FuelHaul,
  FuelHaulView,
  FuelTruck,
  FuelTruckClassId,
  HubTier,
  InboundPending,
  InternationalLane,
  MarketLotView,
  NpcActivityView,
  NpcFleetMemberView,
  NpcFlight,
  NpcFreighter,
  PartitionTickResult,
  ShipmentLot,
  StockPile,
} from './types/career-economy.js';

export {
  activeLaneKg,
  countryIdFromRegion,
  ensureHomeCountryId,
  findInternationalLane,
  inferHomeCountryId,
  isDomesticOd,
  isInternationalOdAllowed,
  laneMatchesOd,
  listWorldCountryIds,
} from './career-partition.js';

export {
  clampHubLevel,
  ensureAirportHubLevel,
  ensureWorldHubLevels,
  HUB_ACTIVITY,
  HUB_LEVEL_CURVE_VERSION,
  HUB_LEVEL_MAX,
  HUB_LEVEL_MIN,
  HUB_LEVEL_PROFILE,
  HUB_LEVEL_XP_PER_TICK_CAP,
  HUB_LEVEL_XP_TO_REACH,
  hubLevelFromXp,
  hubLevelHealthMult,
  hubLevelLaneBonus,
  hubLevelNpcBidMult,
  hubLevelOriginPayMult,
  hubLevelProfile,
  hubLevelXpProgress,
  recordFreightSettleActivity,
  recordFuelTruckDeliveryActivity,
  recordFuelUpliftActivity,
  recordHubActivity,
  recordLotFormationActivity,
  regionAverageHubLevel,
  tickHubLevels,
} from './career-hub-level.js';

export {
  countFuelHaulsEnroute,
  ensureFuelTruckFleet,
  estimateFuelHaulHours,
  FUEL_TRUCK_CAPACITY_KG,
  FUEL_TRUCK_COMPOSITION,
  FUEL_TRUCK_FLEET_SIZE,
  FUEL_TRUCK_LABEL,
  getFuelTruckCapacityKg,
  listAirportFuelInbound,
  listFuelHaulViews,
  regionFuelThin,
  seedFuelTruckFleet,
  settleFuelHaulsDue,
  tickFuelLogistics,
} from './career-fuel-logistics.js';

export {
  describeLotMarketPressure,
  drainNpcMroParts,
  ensureNpcAirframes,
  ensureNpcFleet,
  ensureNpcRegionCoverage,
  estimateNpcBlockHours,
  findNpcAirframe,
  listNpcAirframesForClass,
  listNpcActivity,
  listNpcFleetStatus,
  listRegionMarketPressure,
  npcAirframeLabel,
  npcClaimForLot,
  npcLaneAirborneKg,
  npcMaxCargoKg,
  playerLaneInboundKg,
  laneInboundKg,
  npcLaneSaturation,
  npcRegionBidCapacity,
  NPC_AIRFRAME_VARIANTS,
  NPC_FLEET_COMPOSITION,
  NPC_FLEET_SIZE,
  NPC_MX_INTERVAL_HOURS,
  NPC_MX_PARTS_KG,
  NPC_MX_SHOP_HOURS,
  LANE_BUSY_SATURATION,
  THIN_FLEET_CAPACITY,
  pickNpcAirframe,
  seedNpcFleet,
  settleNpcOpsDue,
  tickNpcFreighters,
} from './career-npc.js';

export type {
  LotMarketPressure,
  NpcAirframeVariant,
  RegionMarketPressure,
} from './career-npc.js';

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

export {
  hoursToMs,
  hoursToTicks,
  MAX_CATCH_UP_TICKS,
  msToHours,
  MS_PER_HOUR,
  MS_PER_TICK,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
} from './career-clock.js';

/** Max concurrent active lots on the same commodity+route (large + small). Fallback for major↔major. */
export const MAX_LOTS_PER_LANE = 5;
/** Soft caps within a lane so light aircraft see bookable slices. Fallback for major↔major. */
export const MAX_LARGE_LOTS_PER_LANE = 3;
export const MAX_SMALL_LOTS_PER_LANE = 2;

/**
 * Static cargo-role profile per hub tier.
 * Calibrated offline from BR cargo roles (~2024): GRU/VCP dominate tonnage;
 * GIG remains a national gateway; regionals mid-network; spokes are LTL/feeders.
 */
export const HUB_TIER_PROFILE: Record<
  HubTier,
  {
    capacityMult: number;
    flowMult: number;
    maxLots: number;
    maxLarge: number;
    maxSmall: number;
  }
> = {
  major: {
    capacityMult: 2.6,
    flowMult: 2.2,
    maxLots: 5,
    maxLarge: 3,
    maxSmall: 2,
  },
  regional: {
    capacityMult: 1.0,
    flowMult: 1.0,
    maxLots: 3,
    maxLarge: 2,
    maxSmall: 1,
  },
  spoke: {
    capacityMult: 0.45,
    flowMult: 0.55,
    maxLots: 2,
    maxLarge: 1,
    maxSmall: 2,
  },
};

/** Curated ICAO → tier map (BR + US catalogs). */
export const HUB_TIER_BY_ICAO: Readonly<Record<string, HubTier>> = {
  ...Object.fromEntries(BR_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
  ...Object.fromEntries(US_CAREER_HUBS.map((h) => [h.icao, h.hubTier])),
};

export function hubTierOf(airport: Pick<AirportTerminal, 'icao' | 'hubTier'>): HubTier {
  if (airport.hubTier === 'major' || airport.hubTier === 'regional' || airport.hubTier === 'spoke') {
    return airport.hubTier;
  }
  return HUB_TIER_BY_ICAO[airport.icao.toUpperCase()] ?? 'spoke';
}

export function laneLotCaps(
  originTier: HubTier,
  destTier: HubTier,
  opts: { originLevel?: number; destLevel?: number } = {},
): { maxLots: number; maxLarge: number; maxSmall: number } {
  const origin = HUB_TIER_PROFILE[originTier];
  const dest = HUB_TIER_PROFILE[destTier];
  const bonus = hubLevelLaneBonus(opts.originLevel ?? 1, opts.destLevel ?? 1);
  return {
    maxLots: Math.min(origin.maxLots, dest.maxLots) + bonus,
    maxLarge: Math.min(origin.maxLarge, dest.maxLarge) + Math.min(1, bonus),
    maxSmall: Math.min(origin.maxSmall, dest.maxSmall) + Math.max(0, bonus - 1),
  };
}

/**
 * Curated domestic cargo corridors (bidirectional) + auto BR/US feeders.
 * Weights > 1 favor formation + a mild pay bump.
 */
const CAREER_CARGO_CORRIDORS_MANUAL: ReadonlyArray<{
  a: string;
  b: string;
  weight: number;
}> = [
  // SE trunk
  { a: 'SBGR', b: 'SBGL', weight: 2.2 },
  { a: 'SBGR', b: 'SBKP', weight: 1.8 },
  { a: 'SBKP', b: 'SBGL', weight: 1.6 },
  { a: 'SBGR', b: 'SBCF', weight: 1.7 },
  { a: 'SBKP', b: 'SBCF', weight: 1.5 },
  // Historic domestic cargo: SE ↔ Manaus
  { a: 'SBGR', b: 'SBEG', weight: 2.4 },
  { a: 'SBKP', b: 'SBEG', weight: 2.0 },
  { a: 'SBGL', b: 'SBEG', weight: 1.7 },
  // Brasília redistributor
  { a: 'SBGR', b: 'SBBR', weight: 1.9 },
  { a: 'SBKP', b: 'SBBR', weight: 1.7 },
  { a: 'SBGL', b: 'SBBR', weight: 1.5 },
  { a: 'SBBR', b: 'SBEG', weight: 1.6 },
  { a: 'SBBR', b: 'SBRF', weight: 1.5 },
  { a: 'SBBR', b: 'SBPA', weight: 1.4 },
  { a: 'SBBR', b: 'SBGO', weight: 1.7 },
  { a: 'SBBR', b: 'SBCY', weight: 1.4 },
  { a: 'SBBR', b: 'SBCG', weight: 1.3 },
  // SE → South
  { a: 'SBGR', b: 'SBPA', weight: 2.0 },
  { a: 'SBGR', b: 'SBCT', weight: 1.8 },
  { a: 'SBKP', b: 'SBPA', weight: 1.7 },
  { a: 'SBKP', b: 'SBCT', weight: 1.6 },
  { a: 'SBGL', b: 'SBPA', weight: 1.4 },
  // SE → NE
  { a: 'SBGR', b: 'SBRF', weight: 2.1 },
  { a: 'SBGR', b: 'SBFZ', weight: 1.9 },
  { a: 'SBGR', b: 'SBSV', weight: 1.8 },
  { a: 'SBKP', b: 'SBRF', weight: 1.7 },
  { a: 'SBKP', b: 'SBFZ', weight: 1.5 },
  { a: 'SBGL', b: 'SBRF', weight: 1.5 },
  // North internal + Belém links
  { a: 'SBEG', b: 'SBBE', weight: 1.6 },
  { a: 'SBEG', b: 'SBPV', weight: 1.4 },
  { a: 'SBEG', b: 'SBMQ', weight: 1.3 },
  { a: 'SBBE', b: 'SBGR', weight: 1.6 },
  { a: 'SBBE', b: 'SBRF', weight: 1.4 },
  // Center-West feeders
  { a: 'SBGO', b: 'SBGR', weight: 1.6 },
  { a: 'SBGO', b: 'SBKP', weight: 1.4 },
  { a: 'SBCY', b: 'SBGR', weight: 1.4 },
  { a: 'SBCG', b: 'SBGR', weight: 1.4 },
  { a: 'SBCG', b: 'SBPA', weight: 1.3 },
  // South / NE regional trunks
  { a: 'SBPA', b: 'SBCT', weight: 1.5 },
  { a: 'SBCT', b: 'SBFL', weight: 1.4 },
  { a: 'SBPA', b: 'SBNF', weight: 1.3 },
  { a: 'SBRF', b: 'SBFZ', weight: 1.5 },
  { a: 'SBRF', b: 'SBSV', weight: 1.5 },
  { a: 'SBSV', b: 'SBFZ', weight: 1.3 },
  // Spoke feeders (SE/S/NE)
  { a: 'SBVT', b: 'SBGR', weight: 1.5 },
  { a: 'SBVT', b: 'SBGL', weight: 1.4 },
  { a: 'SBRP', b: 'SBKP', weight: 1.5 },
  { a: 'SBRP', b: 'SBGR', weight: 1.4 },
  { a: 'SBLO', b: 'SBCT', weight: 1.4 },
  { a: 'SBLO', b: 'SBKP', weight: 1.3 },
  { a: 'SBJV', b: 'SBCT', weight: 1.4 },
  { a: 'SBFL', b: 'SBPA', weight: 1.3 },
  { a: 'SBPS', b: 'SBSV', weight: 1.4 },
  { a: 'SBAR', b: 'SBSV', weight: 1.3 },
  { a: 'SBMO', b: 'SBRF', weight: 1.4 },
  { a: 'SBJP', b: 'SBRF', weight: 1.4 },
  { a: 'SBSG', b: 'SBRF', weight: 1.3 },
  { a: 'SBSG', b: 'SBFZ', weight: 1.3 },
  // US domestic trunks + feeders
  { a: 'KMIA', b: 'KJFK', weight: 1.8 },
  { a: 'KMIA', b: 'KIAH', weight: 1.7 },
  { a: 'KJFK', b: 'KIAH', weight: 1.5 },
  { a: 'KORD', b: 'KJFK', weight: 2.2 },
  { a: 'KATL', b: 'KMIA', weight: 2.0 },
  { a: 'KATL', b: 'KORD', weight: 2.1 },
  { a: 'KDFW', b: 'KIAH', weight: 2.0 },
  { a: 'KDFW', b: 'KORD', weight: 1.9 },
  { a: 'KLAX', b: 'KSEA', weight: 2.0 },
  { a: 'KLAX', b: 'KDEN', weight: 1.9 },
  { a: 'KDEN', b: 'KORD', weight: 2.0 },
  { a: 'KSEA', b: 'KORD', weight: 1.7 },
  { a: 'KATL', b: 'KJFK', weight: 1.8 },
  { a: 'KLAX', b: 'KDFW', weight: 1.8 },
  { a: 'KMEM', b: 'KATL', weight: 1.6 },
  { a: 'KMEM', b: 'KORD', weight: 1.5 },
  { a: 'KMEM', b: 'KDFW', weight: 1.7 },
  { a: 'KMEM', b: 'KIAH', weight: 1.6 },
  // US regional feeders
  { a: 'KBOS', b: 'KJFK', weight: 1.7 },
  { a: 'KBOS', b: 'KORD', weight: 1.5 },
  { a: 'KEWR', b: 'KJFK', weight: 1.8 },
  { a: 'KEWR', b: 'KORD', weight: 1.6 },
  { a: 'KPHL', b: 'KJFK', weight: 1.5 },
  { a: 'KCLT', b: 'KATL', weight: 1.7 },
  { a: 'KCLT', b: 'KJFK', weight: 1.5 },
  { a: 'KMCO', b: 'KMIA', weight: 1.6 },
  { a: 'KFLL', b: 'KMIA', weight: 1.7 },
  { a: 'KDTW', b: 'KORD', weight: 1.6 },
  { a: 'KDTW', b: 'KATL', weight: 1.4 },
  { a: 'KMSP', b: 'KORD', weight: 1.6 },
  { a: 'KMSP', b: 'KDEN', weight: 1.5 },
  { a: 'KCVG', b: 'KORD', weight: 1.4 },
  { a: 'KAUS', b: 'KDFW', weight: 1.5 },
  { a: 'KAUS', b: 'KIAH', weight: 1.4 },
  { a: 'KPHX', b: 'KDEN', weight: 1.5 },
  { a: 'KPHX', b: 'KLAX', weight: 1.6 },
  { a: 'KSLC', b: 'KDEN', weight: 1.5 },
  { a: 'KSFO', b: 'KLAX', weight: 1.8 },
  { a: 'KSFO', b: 'KSEA', weight: 1.6 },
  { a: 'KSAN', b: 'KLAX', weight: 1.6 },
];

export const CAREER_CARGO_CORRIDORS: ReadonlyArray<{
  a: string;
  b: string;
  weight: number;
}> = [
  ...CAREER_CARGO_CORRIDORS_MANUAL,
  ...buildBrFeederCorridors(BR_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
  ...buildUsFeederCorridors(US_CAREER_HUBS, CAREER_CARGO_CORRIDORS_MANUAL),
];

/** Default corridor weight when an international lane has no domestic corridor entry. */
export const INTERNATIONAL_CORRIDOR_WEIGHT = 2.0;
/** Pay distance bias for cross-country lots (domestic cross-region is 1.12). */
export const INTERNATIONAL_DISTANCE_BIAS = 1.55;
/** Extra lot lifetime for long-haul international freights. */
export const INTERNATIONAL_LIFE_MULT = 1.35;
/** Emergency domestic release valve for non-major warehouses pinned near capacity. */
const DOMESTIC_OVERFLOW_ORIGIN_FILL = 0.9;
const DOMESTIC_OVERFLOW_DEST_FILL = 0.35;
const DOMESTIC_OVERFLOW_CORRIDOR_WEIGHT = 1.1;

/**
 * Sparse BR↔US hub lanes (stored directed; matching is bidirectional).
 * Soft capacityKgPerDay caps active freight on the OD.
 */
export const CAREER_INTERNATIONAL_LANES: ReadonlyArray<InternationalLane> = [
  {
    id: 'lane_sbgr_kmia',
    originCountryId: 'BR',
    destCountryId: 'US',
    originIcao: 'SBGR',
    destIcao: 'KMIA',
    capacityKgPerDay: 90_000,
  },
  {
    id: 'lane_sbkp_kmia',
    originCountryId: 'BR',
    destCountryId: 'US',
    originIcao: 'SBKP',
    destIcao: 'KMIA',
    capacityKgPerDay: 70_000,
  },
  {
    id: 'lane_sbgl_kmia',
    originCountryId: 'BR',
    destCountryId: 'US',
    originIcao: 'SBGL',
    destIcao: 'KMIA',
    capacityKgPerDay: 55_000,
  },
  {
    id: 'lane_sbgr_kjfk',
    originCountryId: 'BR',
    destCountryId: 'US',
    originIcao: 'SBGR',
    destIcao: 'KJFK',
    capacityKgPerDay: 60_000,
  },
  {
    id: 'lane_sbeg_kmia',
    originCountryId: 'BR',
    destCountryId: 'US',
    originIcao: 'SBEG',
    destIcao: 'KMIA',
    capacityKgPerDay: 50_000,
  },
  {
    id: 'lane_sbgr_kiah',
    originCountryId: 'BR',
    destCountryId: 'US',
    originIcao: 'SBGR',
    destIcao: 'KIAH',
    capacityKgPerDay: 55_000,
  },
  {
    id: 'lane_sbgl_kiah',
    originCountryId: 'BR',
    destCountryId: 'US',
    originIcao: 'SBGL',
    destIcao: 'KIAH',
    capacityKgPerDay: 40_000,
  },
  {
    id: 'lane_sbgr_katl',
    originCountryId: 'BR',
    destCountryId: 'US',
    originIcao: 'SBGR',
    destIcao: 'KATL',
    capacityKgPerDay: 65_000,
  },
  {
    id: 'lane_sbgr_kord',
    originCountryId: 'BR',
    destCountryId: 'US',
    originIcao: 'SBGR',
    destIcao: 'KORD',
    capacityKgPerDay: 55_000,
  },
  {
    id: 'lane_sbeg_kmem',
    originCountryId: 'BR',
    destCountryId: 'US',
    originIcao: 'SBEG',
    destIcao: 'KMEM',
    capacityKgPerDay: 35_000,
  },
];

/** Merge curated international lanes into a world (idempotent by id / OD). */
export function ensureInternationalLanes(world: CareerEconomyWorld): boolean {
  const existing = world.internationalLanes ?? [];
  const byId = new Map(existing.map((l) => [l.id, l]));
  const byOd = new Set(
    existing.map(
      (l) =>
        `${l.originIcao.toUpperCase()}:${l.destIcao.toUpperCase()}`,
    ),
  );
  let added = false;
  for (const lane of CAREER_INTERNATIONAL_LANES) {
    if (byId.has(lane.id)) continue;
    const od = `${lane.originIcao.toUpperCase()}:${lane.destIcao.toUpperCase()}`;
    const odRev = `${lane.destIcao.toUpperCase()}:${lane.originIcao.toUpperCase()}`;
    if (byOd.has(od) || byOd.has(odRev)) continue;
    existing.push({ ...lane });
    byId.set(lane.id, lane);
    byOd.add(od);
    added = true;
  }
  world.internationalLanes = existing;
  return added;
}

const CORRIDOR_WEIGHT_BY_OD: ReadonlyMap<string, number> = (() => {
  const map = new Map<string, number>();
  for (const { a, b, weight } of CAREER_CARGO_CORRIDORS) {
    const left = a.toUpperCase();
    const right = b.toUpperCase();
    map.set(`${left}:${right}`, weight);
    map.set(`${right}:${left}`, weight);
  }
  return map;
})();

const CORRIDOR_PARTNERS_BY_ICAO: ReadonlyMap<string, readonly string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const { a, b } of CAREER_CARGO_CORRIDORS) {
    const left = a.toUpperCase();
    const right = b.toUpperCase();
    if (!map.has(left)) map.set(left, []);
    if (!map.has(right)) map.set(right, []);
    map.get(left)!.push(right);
    map.get(right)!.push(left);
  }
  return map;
})();

/** 1 = off-corridor; >1 = curated domestic cargo axis. */
export function corridorWeight(originIcao: string, destIcao: string): number {
  return (
    CORRIDOR_WEIGHT_BY_OD.get(
      `${originIcao.toUpperCase()}:${destIcao.toUpperCase()}`,
    ) ?? 1
  );
}

export function corridorPartners(icao: string): readonly string[] {
  return CORRIDOR_PARTNERS_BY_ICAO.get(icao.toUpperCase()) ?? [];
}

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
    id: 'supplies',
    name: 'Supplies',
    basePricePerKg: 2.5,
  },
  {
    id: 'fuel',
    name: 'Jet-A fuel',
    basePricePerKg: 0.95,
    kind: 'fuel',
  },
  {
    id: 'mro_parts',
    name: 'Aircraft parts (MRO)',
    basePricePerKg: 12,
    highValue: true,
    kind: 'mro',
  },
] as const;

/** Freight-board commodities (excludes terminal fuel + MRO parts). */
export const CAREER_CARGO_COMMODITIES: readonly CommodityDef[] =
  CAREER_COMMODITIES.filter((c) => c.kind !== 'fuel' && c.kind !== 'mro');

/** Major Jet-A production hubs (BR + US career anchors). */
export const FUEL_HUB_ICAOS = new Set([
  // BR producers (~1 per 3 hubs at 60 airports)
  'SBGR',
  'SBGL',
  'SBKP',
  'SBCF',
  'SBPA',
  'SBRF',
  'SBCT',
  'SBSV',
  'SBEG',
  'SBBR',
  'SBFZ',
  'SBBE',
  'SBGO',
  'SBVT',
  'SBSN',
  'SBPJ',
  'SBFI',
  'SBSL',
  'SBTE',
  'SBUL',
  // US continental Jet-A producers (~1 per 2–3 airports).
  'KMIA',
  'KATL',
  'KJFK',
  'KORD',
  'KIAH',
  'KDFW',
  'KDEN',
  'KLAX',
  'KSEA',
]);

/** Seed or repair fuel inventory + baseline flows on a terminal. */
export function ensureAirportFuelInventory(terminal: AirportTerminal): void {
  const icao = terminal.icao.trim().toUpperCase();
  const hub = FUEL_HUB_ICAOS.has(icao);
  const cap = hub ? 500_000 : 120_000;
  // kg / 15-min tick (legacy hourly rates ÷ 4)
  const prod = hub ? 2_000 : 200;
  const cons = hub ? 750 : 375;
  const existingCap = terminal.inventory.fuel?.capacityKg ?? 0;
  /** Spoke→hub promotion (e.g. US majors added to FUEL_HUB_ICAOS). */
  const upgradingToHub = hub && existingCap > 0 && existingCap < cap;

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
  if (terminal.production.fuel === undefined || upgradingToHub) {
    terminal.production = { ...terminal.production, fuel: prod };
  }
  if (terminal.consumption.fuel === undefined || upgradingToHub) {
    terminal.consumption = { ...terminal.consumption, fuel: cons };
  }
}

export function ensureWorldFuelInventory(world: CareerEconomyWorld): void {
  for (const ap of world.airports) {
    ensureAirportFuelInventory(ap);
  }
}

/** Seed or repair aircraft-parts (MRO) inventory + baseline flows on a terminal. */
export function ensureAirportMroInventory(terminal: AirportTerminal): void {
  const tier = hubTierOf(terminal);
  const cap =
    tier === 'major' ? 80_000 : tier === 'regional' ? 35_000 : 12_000;
  // kg / 15-min tick (legacy hourly rates ÷ 4)
  const prod =
    tier === 'major' ? 225 : tier === 'regional' ? 70 : 10;
  const cons =
    tier === 'major' ? 105 : tier === 'regional' ? 55 : 22;

  if (!terminal.inventory.mro_parts) {
    terminal.inventory.mro_parts = pile(Math.round(cap * 0.5), cap);
  } else {
    terminal.inventory.mro_parts.capacityKg = Math.max(
      terminal.inventory.mro_parts.capacityKg,
      cap,
    );
    terminal.inventory.mro_parts.stockKg = clamp(
      terminal.inventory.mro_parts.stockKg,
      0,
      terminal.inventory.mro_parts.capacityKg,
    );
  }

  terminal.baseProduction = { ...terminal.baseProduction, mro_parts: prod };
  terminal.baseConsumption = { ...terminal.baseConsumption, mro_parts: cons };
  if (terminal.production.mro_parts === undefined) {
    terminal.production = { ...terminal.production, mro_parts: prod };
  }
  if (terminal.consumption.mro_parts === undefined) {
    terminal.consumption = { ...terminal.consumption, mro_parts: cons };
  }
}

export function ensureWorldMroInventory(world: CareerEconomyWorld): void {
  for (const ap of world.airports) {
    ensureAirportMroInventory(ap);
  }
}

/**
 * Backfill Supplies piles on legacy airports (Tier-0 Dry ladder companion to General).
 */
export function ensureAirportSuppliesInventory(terminal: AirportTerminal): void {
  const tier = hubTierOf(terminal);
  const cap =
    tier === 'major' ? 90_000 : tier === 'regional' ? 45_000 : 22_000;
  const prod =
    tier === 'major' ? 180 : tier === 'regional' ? 90 : 40;
  const cons =
    tier === 'major' ? 160 : tier === 'regional' ? 95 : 55;

  if (!terminal.inventory.supplies) {
    terminal.inventory.supplies = pile(Math.round(cap * 0.45), cap);
  } else {
    terminal.inventory.supplies.capacityKg = Math.max(
      terminal.inventory.supplies.capacityKg,
      cap,
    );
    terminal.inventory.supplies.stockKg = clamp(
      terminal.inventory.supplies.stockKg,
      0,
      terminal.inventory.supplies.capacityKg,
    );
  }

  terminal.baseProduction = {
    ...terminal.baseProduction,
    supplies: terminal.baseProduction?.supplies ?? prod,
  };
  terminal.baseConsumption = {
    ...terminal.baseConsumption,
    supplies: terminal.baseConsumption?.supplies ?? cons,
  };
  if (terminal.production.supplies === undefined) {
    terminal.production = { ...terminal.production, supplies: prod };
  }
  if (terminal.consumption.supplies === undefined) {
    terminal.consumption = { ...terminal.consumption, supplies: cons };
  }
}

export function ensureWorldSuppliesInventory(world: CareerEconomyWorld): void {
  for (const ap of world.airports) {
    ensureAirportSuppliesInventory(ap);
  }
}

/**
 * Stamp curated hubTier on legacy airports. First time only: rescale cargo
 * warehouses/flows toward the tier profile so flat ~70t seeds become majors vs spokes.
 */
export function ensureAirportHubTier(terminal: AirportTerminal): void {
  const tier = HUB_TIER_BY_ICAO[terminal.icao.toUpperCase()] ?? 'spoke';
  const alreadyStamped =
    terminal.hubTier === 'major' ||
    terminal.hubTier === 'regional' ||
    terminal.hubTier === 'spoke';
  if (alreadyStamped) {
    // Keep map as source of truth if ICAO map was updated.
    terminal.hubTier = HUB_TIER_BY_ICAO[terminal.icao.toUpperCase()] ?? terminal.hubTier;
    return;
  }

  const profile = HUB_TIER_PROFILE[tier];
  terminal.hubTier = tier;
  if (!terminal.baseProduction) terminal.baseProduction = { ...(terminal.production ?? {}) };
  if (!terminal.baseConsumption) terminal.baseConsumption = { ...(terminal.consumption ?? {}) };

  for (const c of CAREER_CARGO_COMMODITIES) {
    const stock = terminal.inventory[c.id];
    if (stock && stock.capacityKg > 0) {
      const fill = stock.stockKg / stock.capacityKg;
      stock.capacityKg = Math.max(1_000, Math.round(stock.capacityKg * profile.capacityMult));
      stock.stockKg = clamp(Math.round(stock.capacityKg * fill), 0, stock.capacityKg);
    }
    const baseProd = terminal.baseProduction[c.id] ?? terminal.production[c.id] ?? 0;
    const baseCons = terminal.baseConsumption[c.id] ?? terminal.consumption[c.id] ?? 0;
    terminal.baseProduction[c.id] = Math.round(baseProd * profile.flowMult);
    terminal.baseConsumption[c.id] = Math.round(baseCons * profile.flowMult);
  }
}

export function ensureWorldHubTiers(world: CareerEconomyWorld): void {
  for (const ap of world.airports) {
    ensureAirportHubTier(ap);
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
  ...Object.fromEntries(
    BR_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
  ...Object.fromEntries(
    US_CAREER_HUBS.map((h) => [
      h.icao,
      { lat: h.lat, lon: h.lon, name: h.name },
    ]),
  ),
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
  world: Pick<CareerEconomyWorld, 'airports'>,
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
 * Seed the career cargo world: Brazil domestic hubs + US continental map,
 * with asymmetric production/consumption so ticks create explainable lanes.
 */
export function createSeedEconomyWorld(opts: { seed?: string } = {}): CareerEconomyWorld {
  const seed = opts.seed?.trim() || 'skyline-career-br-v1';
  const rng = mulberry32(hashSeed(seed));

  assertBrCareerHubCatalog();
  assertUsCareerHubCatalog();

  const hubs: Array<{
    icao: string;
    name: string;
    region: string;
    hubTier: HubTier;
    /** Relative production bias by commodity. */
    produce: Partial<Record<CommodityId, number>>;
    /** Relative consumption bias. */
    consume: Partial<Record<CommodityId, number>>;
  }> = [
    ...BR_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
    })),
    ...US_CAREER_HUBS.map((h) => ({
      icao: h.icao,
      name: h.name,
      region: h.region,
      hubTier: h.hubTier,
      produce: h.produce,
      consume: h.consume,
    })),
  ];

  const airports: AirportTerminal[] = hubs.map((h) => {
    const coords = CAREER_HUB_COORDS[h.icao];
    if (!coords) {
      throw new Error(`Missing coordinates for seeded airport ${h.icao}`);
    }
    const level = 1;
    const tier = h.hubTier;
    const tierProfile = HUB_TIER_PROFILE[tier];
    const capacityBoost = 1 + (level - 1) * 0.15;
    const inventory: AirportTerminal['inventory'] = {};
    const production: AirportTerminal['production'] = {};
    const consumption: AirportTerminal['consumption'] = {};

    for (const c of CAREER_COMMODITIES) {
      if (c.id === 'fuel') {
        const hub = FUEL_HUB_ICAOS.has(h.icao);
        const cap = Math.round((hub ? 500_000 : 120_000) * capacityBoost);
        // kg / 15-min tick (legacy hourly rates ÷ 4)
        const prod = Math.round((hub ? 2_000 : 200) * (0.8 + rng() * 0.4));
        const cons = Math.round((hub ? 750 : 375) * (0.8 + rng() * 0.4));
        production[c.id] = prod;
        consumption[c.id] = cons;
        const startFill = 0.45 + rng() * 0.25;
        inventory[c.id] = pile(Math.round(cap * startFill), cap);
        continue;
      }
      if (c.id === 'mro_parts') {
        const tier = h.hubTier;
        const cap = Math.round(
          (tier === 'major' ? 80_000 : tier === 'regional' ? 35_000 : 12_000) *
            capacityBoost,
        );
        const prod = Math.round(
          (tier === 'major' ? 225 : tier === 'regional' ? 70 : 10) *
            (0.85 + rng() * 0.3),
        );
        const cons = Math.round(
          (tier === 'major' ? 105 : tier === 'regional' ? 55 : 22) *
            (0.85 + rng() * 0.3),
        );
        production[c.id] = prod;
        consumption[c.id] = cons;
        inventory[c.id] = pile(Math.round(cap * (0.4 + rng() * 0.25)), cap);
        continue;
      }
      const cap = Math.round(
        70_000 * capacityBoost * tierProfile.capacityMult * (0.85 + rng() * 0.3),
      );
      const prodBias = h.produce[c.id] ?? 0.15;
      const consBias = h.consume[c.id] ?? 0.25;
      // kg / 15-min tick — asymmetric by design, scaled by hub tier
      const prod = Math.round(
        550 * prodBias * tierProfile.flowMult * (0.8 + rng() * 0.4),
      );
      const cons = Math.round(
        500 * consBias * tierProfile.flowMult * (0.8 + rng() * 0.4),
      );
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
      hubTier: tier,
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
  const world: CareerEconomyWorld = {
    version: 3,
    seed,
    tick: 0,
    lastBatchAtMs: now,
    lastSyncedAtMs: now,
    homeCountryId: 'BR',
    airports,
    lots: [],
    events: [],
    npcs: seedNpcFleet({ seed, regions }),
    npcFlights: [],
    inboundPending: [],
    fuelTrucks: seedFuelTruckFleet({ seed, regions }),
    fuelHauls: [],
    internationalLanes: CAREER_INTERNATIONAL_LANES.map((l) => ({ ...l })),
  };
  ensureWorldHubLevels(world);
  ensureHomeCountryId(world);
  ensureInternationalLanes(world);
  return world;
}

/** Continuous economy ticks = completed batches + fractional batch since lastBatchAtMs. */
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
        flight.arrivesAtMs = flight.departedAtMs + hoursToMs(2);
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
 * Merge airports present in the current seed that are missing from a legacy
 * save (e.g. BR-N / BR-CO / US anchors). Returns true when any hub was added.
 */
export function ensureCareerHubCoverage(world: CareerEconomyWorld): boolean {
  const have = new Set(world.airports.map((a) => a.icao.toUpperCase()));
  const fresh = createSeedEconomyWorld({ seed: world.seed });
  let added = false;
  for (const ap of fresh.airports) {
    const icao = ap.icao.toUpperCase();
    if (have.has(icao)) continue;
    world.airports.push(JSON.parse(JSON.stringify(ap)) as AirportTerminal);
    have.add(icao);
    added = true;
  }
  if (ensureInternationalLanes(world)) added = true;
  return added;
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
    fuelTrucks?: FuelTruck[];
    fuelHauls?: FuelHaul[];
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

  const homeCountryRaw = (base as { homeCountryId?: unknown }).homeCountryId;
  const lanesRaw = (base as { internationalLanes?: unknown }).internationalLanes;
  const migrated: CareerEconomyWorld = {
    version: 3,
    seed,
    tick: typeof base.tick === 'number' ? base.tick : 0,
    lastBatchAtMs,
    lastSyncedAtMs: lastBatchAtMs,
    homeCountryId:
      typeof homeCountryRaw === 'string' && homeCountryRaw.trim()
        ? homeCountryRaw.trim().toUpperCase()
        : undefined,
    airports: base.airports,
    lots: Array.isArray(base.lots) ? base.lots : [],
    events: Array.isArray(base.events) ? base.events : [],
    npcs: Array.isArray(base.npcs) ? base.npcs : [],
    npcFlights: Array.isArray(base.npcFlights) ? base.npcFlights : [],
    inboundPending: Array.isArray((base as { inboundPending?: unknown }).inboundPending)
      ? ((base as { inboundPending: CareerEconomyWorld['inboundPending'] }).inboundPending ?? [])
      : [],
    fuelTrucks: Array.isArray(base.fuelTrucks) ? base.fuelTrucks : [],
    fuelHauls: Array.isArray(base.fuelHauls) ? base.fuelHauls : [],
    internationalLanes: Array.isArray(lanesRaw)
      ? (lanesRaw as InternationalLane[])
      : [],
  };

  ensureCareerHubCoverage(migrated);
  ensureInternationalLanes(migrated);
  ensureNpcFleet(migrated);
  migrateNpcTimestamps(migrated, Number.isFinite(version) ? version : 0);
  ensureWorldFuelInventory(migrated);
  ensureWorldMroInventory(migrated);
  ensureWorldSuppliesInventory(migrated);
  ensureWorldHubTiers(migrated);
  ensureFuelTruckFleet(migrated);
  ensureWorldHubLevels(migrated);
  ensureHomeCountryId(migrated);
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
  w.fuelTrucks = migrated.fuelTrucks;
  w.fuelHauls = migrated.fuelHauls;
  w.homeCountryId = migrated.homeCountryId;
  w.internationalLanes = migrated.internationalLanes;

  // Mid-hour continuous ops first (arrivals between batches).
  let settledFlights = settleNpcOpsDue(w, nowMs).settledFlights;
  settledFlights += settleFuelHaulsDue(w, nowMs).settledHauls;

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
  settledFlights += settleFuelHaulsDue(w, nowMs).settledHauls;
  return { advancedTicks: hours, settledFlights, world: w };
}

function baseProdOf(ap: AirportTerminal, commodityId: CommodityId): number {
  return ap.baseProduction?.[commodityId] ?? ap.production[commodityId] ?? 0;
}

function baseConsOf(ap: AirportTerminal, commodityId: CommodityId): number {
  return ap.baseConsumption?.[commodityId] ?? ap.consumption[commodityId] ?? 0;
}

/** Day-of-year style season from tick (96 ticks ≈ 1 day). */
function seasonalFactor(commodityId: CommodityId, tick: number): number {
  const day = Math.floor(tick / TICKS_PER_DAY) % 365;
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

function eventTouchesCommodity(ev: EconomyEvent, commodityId: CommodityId): boolean {
  return !ev.commodityId || ev.commodityId === commodityId;
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
    if (!eventTouchesCommodity(ev, commodityId)) continue;
    switch (ev.kind) {
      case 'harvest_boost':
        if (side === 'prod' && (!ev.commodityId || ev.commodityId === 'perishables')) m *= 1.35;
        break;
      case 'factory_outage':
        if (
          side === 'prod' &&
          (!ev.commodityId ||
            ev.commodityId === 'electronics' ||
            ev.commodityId === 'machinery')
        ) {
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
      case 'labor_strike':
        if (side === 'prod') m *= 0.65;
        if (side === 'cons') m *= 0.8;
        break;
      default:
        break;
    }
  }
  return m;
}

/** Short chip label for a demand-shock kind. */
export function economyEventChipLabel(kind: EconomyEventKind): string {
  switch (kind) {
    case 'harvest_boost':
      return 'Harvest';
    case 'factory_outage':
      return 'Outage';
    case 'port_congestion':
      return 'Congestion';
    case 'festival_demand':
      return 'Festival';
    case 'labor_strike':
      return 'Strike';
    default:
      return 'Shock';
  }
}

export type LaneDemandShock = {
  payMult: number;
  forceUrgent: boolean;
  lifeMult: number;
  labels: string[];
  kinds: EconomyEventKind[];
};

/**
 * Freight-facing demand shocks for an OD lane.
 * Events on origin or dest (matching commodity) raise pay / urgency / shorten life.
 */
export function laneDemandShock(
  world: CareerEconomyWorld,
  opts: {
    originRegion: string;
    destRegion: string;
    commodityId: CommodityId;
    tick?: number;
  },
): LaneDemandShock {
  const tick = opts.tick ?? world.tick;
  let payMult = 1;
  let forceUrgent = false;
  let lifeMult = 1;
  const labels: string[] = [];
  const kinds: EconomyEventKind[] = [];

  for (const ev of activeEvents(world, tick)) {
    if (ev.region !== opts.originRegion && ev.region !== opts.destRegion) continue;
    if (!eventTouchesCommodity(ev, opts.commodityId)) continue;
    const atOrigin = ev.region === opts.originRegion;
    const atDest = ev.region === opts.destRegion;
    kinds.push(ev.kind);
    const chip = economyEventChipLabel(ev.kind);
    if (!labels.includes(chip)) labels.push(chip);

    switch (ev.kind) {
      case 'harvest_boost':
        // Origin surplus dump — slight pay bump to clear perishables.
        if (atOrigin) payMult *= 1.08;
        if (atDest) {
          payMult *= 1.05;
          lifeMult *= 0.92;
        }
        break;
      case 'festival_demand':
        if (atDest) {
          payMult *= 1.18;
          forceUrgent = true;
          lifeMult *= 0.9;
        }
        if (atOrigin) payMult *= 1.06;
        break;
      case 'factory_outage':
        if (atDest) {
          payMult *= 1.16;
          forceUrgent = true;
        }
        if (atOrigin) payMult *= 1.1;
        break;
      case 'port_congestion':
        payMult *= 1.1;
        lifeMult *= 0.88;
        if (atDest) forceUrgent = true;
        break;
      case 'labor_strike':
        payMult *= 1.14;
        lifeMult *= 0.85;
        forceUrgent = true;
        break;
      default:
        break;
    }
  }

  return {
    payMult: Math.min(1.45, payMult),
    forceUrgent,
    lifeMult: Math.max(0.7, lifeMult),
    labels,
    kinds,
  };
}

function maybeSpawnEvents(world: CareerEconomyWorld, rng: () => number): void {
  if (!world.events) world.events = [];
  // Drop finished events older than ~48 wall-hours (192 × 15-min ticks).
  world.events = world.events.filter(
    (e) => e.endsAtTick > world.tick - TICKS_PER_DAY * 2,
  );
  const active = activeEvents(world);
  if (active.length >= 4) return;
  // ~1.75%/15-min tick ≈ ~7%/hour — occasional overlapping shocks.
  if (rng() > 0.0175) return;

  const regions = [...new Set(world.airports.map((a) => a.region))];
  const region = regions[Math.floor(rng() * regions.length)] ?? 'BR-SE';
  const kinds: EconomyEventKind[] = [
    'harvest_boost',
    'port_congestion',
    'factory_outage',
    'festival_demand',
    'labor_strike',
  ];
  const kind = kinds[Math.floor(rng() * kinds.length)]!;
  const duration = 48 + Math.floor(rng() * 144);
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
    case 'labor_strike':
      commodityId = rng() > 0.5 ? 'general' : 'machinery';
      label = `Labor strike slowing ${commodityId} in ${region}`;
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
  // Per 15-min tick thresholds (legacy ±80 kg/hour ÷ 4).
  if (net > 20) return 'rising';
  if (net < -20) return 'falling';
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
  if (addedToDestKg > 0 || removedFromOriginKg > 0) {
    recordFreightSettleActivity(world, opts.originIcao, opts.destIcao);
  }
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

      // Production nearly stops at a full warehouse instead of creating a
      // permanent 100%-fill pressure source.
      const prodSaturation = fill >= 0.7 ? 1 - ((fill - 0.7) / 0.3) * 0.95 : 1;
      const consStarvation = fill <= 0.15 ? Math.max(0.15, fill / 0.15) : 1;
      const season = seasonalFactor(c.id, world.tick);
      const noise = 0.88 + rng() * 0.24;
      const evProd = eventMultiplier(world, ap, c.id, 'prod');
      const evCons = eventMultiplier(world, ap, c.id, 'cons');

      const health = hubLevelHealthMult(ap);
      const prod = Math.max(
        0,
        Math.round(baseProd * prodSaturation * season * evProd * noise * health),
      );
      const cons = Math.max(
        0,
        Math.round(
          baseCons *
            consStarvation *
            season *
            evCons *
            (0.9 + rng() * 0.2) *
            health,
        ),
      );

      ap.production[c.id] = prod;
      ap.consumption[c.id] = cons;
      stock.stockKg = clamp(stock.stockKg + prod - cons, 0, stock.capacityKg);
    }
  }
}

/** Keep expired/delivered lots this many ticks after expiresAtTick, then drop (~12h). */
export const DEAD_LOT_RETENTION_TICKS = 48;

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
    // Only unbooked market remainder expires. Reserved / in_transit cargo is
    // owned by holds or airborne missions until settle / FBO expire paths run.
    if (lot.status !== 'available') continue;
    if (lot.reservedKg > 0) continue;
    if (world.tick >= lot.expiresAtTick) {
      lot.status = 'expired';
    }
  }
  pruneDeadLots(world);
}

/**
 * Grace fraction of lot life before idle pay starts rising.
 * After that, pay ramps linearly to IDLE_LOT_PAY_MAX_MULT at expiry.
 */
export const IDLE_LOT_ESCALATION_START = 0.25;
/** Max pay multiplier vs formation base for a fully aged available lot. */
export const IDLE_LOT_PAY_MAX_MULT = 1.4;
/** Life progress at which a lingering lot flips to urgent. */
export const IDLE_LOT_URGENT_PROGRESS = 0.55;

/** Life progress of a lot at `tick` (0 at create, 1 at expiry). */
export function idleLotLifeProgress(
  lot: Pick<ShipmentLot, 'createdAtTick' | 'expiresAtTick'>,
  tick: number,
): number {
  const life = Math.max(1, lot.expiresAtTick - lot.createdAtTick);
  const age = Math.max(0, tick - lot.createdAtTick);
  return Math.min(1, age / life);
}

/**
 * Idle freight multiplier from formation base (≥ 1).
 * No boost for the first IDLE_LOT_ESCALATION_START of life, then ramps to max.
 */
export function idleLotPayMult(
  lot: Pick<ShipmentLot, 'createdAtTick' | 'expiresAtTick'>,
  tick: number,
): number {
  const progress = idleLotLifeProgress(lot, tick);
  if (progress <= IDLE_LOT_ESCALATION_START) return 1;
  const t =
    (progress - IDLE_LOT_ESCALATION_START) / (1 - IDLE_LOT_ESCALATION_START);
  return 1 + (IDLE_LOT_PAY_MAX_MULT - 1) * t;
}

/**
 * Raise pay on lingering available lots from stamped basePayUsd.
 * Also flips urgency late in life so the board shows the pressure.
 */
export function escalateIdleLots(world: CareerEconomyWorld): {
  escalated: number;
  markedUrgent: number;
} {
  let escalated = 0;
  let markedUrgent = 0;
  for (const lot of world.lots) {
    if (lot.status !== 'available' && lot.status !== 'reserved') continue;
    if (typeof lot.basePayUsd !== 'number' || !Number.isFinite(lot.basePayUsd)) {
      lot.basePayUsd = lot.payUsd;
    }
    const mult = idleLotPayMult(lot, world.tick);
    const nextPay = Math.max(1, Math.round(lot.basePayUsd * mult));
    if (mult > 1 && nextPay !== lot.payUsd) escalated += 1;
    lot.payUsd = nextPay;
    if (
      lot.urgency === 'normal' &&
      idleLotLifeProgress(lot, world.tick) >= IDLE_LOT_URGENT_PROGRESS
    ) {
      lot.urgency = 'urgent';
      markedUrgent += 1;
    }
  }
  return { escalated, markedUrgent };
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

type RankedAirport = {
  ap: AirportTerminal;
  stock: StockPile;
  fill: number;
  price: number;
  surplusKg: number;
  roomKg: number;
  tier: HubTier;
};

/**
 * Form shipment lots from surplus→shortage pairs.
 * Domestic passes are per country; cross-country only via internationalLanes.
 */
function formLotsFromImbalances(
  world: CareerEconomyWorld,
  rng: () => number,
): PartitionTickResult[] {
  ensureInternationalLanes(world);

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

  const formedByPartition = new Map<string, number>();
  const bumpFormed = (partitionId: string, n = 1) => {
    formedByPartition.set(partitionId, (formedByPartition.get(partitionId) ?? 0) + n);
  };

  const pushLot = (
    key: string,
    commodity: (typeof CAREER_COMMODITIES)[number],
    origin: RankedAirport,
    dest: RankedAirport,
    qty: number,
    size: 'large' | 'small',
    laneSaturation: number,
    inboundKg: number,
    corridorW: number,
    opts: { international: boolean; partitionId: string; capacityKgPerDay?: number },
  ): boolean => {
    if (opts.capacityKgPerDay != null && opts.capacityKgPerDay > 0) {
      const activeKg = activeLaneKg(world, origin.ap.icao, dest.ap.icao);
      if (activeKg + qty > opts.capacityKgPerDay) {
        return false;
      }
    }

    const international = opts.international;
    const originWx = regionalWeatherIndex(world, origin.ap.region);
    const destWx = regionalWeatherIndex(world, dest.ap.region);
    const laneWeather = worseWeather(originWx, destWx);
    const shock = laneDemandShock(world, {
      originRegion: origin.ap.region,
      destRegion: dest.ap.region,
      commodityId: commodity.id,
    });
    const destCap = dest.stock.capacityKg;
    const effectiveDestFill =
      destCap > 0 ? (dest.stock.stockKg + inboundKg) / destCap : dest.fill;
    const urgent =
      shock.forceUrgent ||
      effectiveDestFill < 0.22 ||
      commodity.perishable === true ||
      (dest.fill < 0.28 && inboundKg < 1_000) ||
      laneSaturation >= 0.5 ||
      (laneWeather === 'poor' && dest.fill < 0.35);
    const urgencyMult = urgent ? 1.35 : 1;
    const distanceBias = international
      ? INTERNATIONAL_DISTANCE_BIAS
      : origin.ap.region === dest.ap.region
        ? 1
        : 1.12;
    const corridorPayMult = 1 + Math.max(0, corridorW - 1) * 0.1;
    const destPile = ensurePile(dest.ap, commodity.id);
    const gap =
      localUnitPriceUsd(commodity.id, destPile) - localUnitPriceUsd(commodity.id, origin.stock);
    const batchNowMs = world.lastBatchAtMs ?? Date.now();
    const capacity = npcRegionBidCapacity(world, origin.ap.region, batchNowMs);
    const capacityPayMult = 1 + (1 - capacity) * 0.22;
    const scarcePayMult =
      laneSaturation >= 0.35 ? 1 + laneSaturation * 0.12 : 1;
    const weatherPayMult = regionalWeatherPayMult(laneWeather);
    const originLevelPay = hubLevelOriginPayMult(origin.ap.level ?? 1);
    const payPerKg = Math.min(
      gap *
        0.55 *
        urgencyMult *
        distanceBias *
        capacityPayMult *
        scarcePayMult *
        weatherPayMult *
        corridorPayMult *
        shock.payMult *
        originLevelPay,
      commodity.basePricePerKg * (international ? 2.1 : 1.8),
    );
    const payUsd = Math.round(qty * payPerKg);
    // Lot life in 15-min ticks (legacy hour lives × 4).
    const baseLife = commodity.perishable
      ? 32 + Math.floor(rng() * 16)
      : 72 + Math.floor(rng() * 32);
    const life = Math.max(
      16,
      Math.round(
        baseLife *
          regionalWeatherLifeMult(laneWeather) *
          shock.lifeMult *
          (international ? INTERNATIONAL_LIFE_MULT : 1),
      ),
    );

    const shockNote =
      shock.labels.length > 0 ? ` · ${shock.labels.join('/')}` : '';
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
      basePayUsd: payUsd,
      urgency: urgent ? 'urgent' : 'normal',
      reason: `${commodity.name}: surplus at ${origin.ap.icao} (fill ${(origin.fill * 100).toFixed(0)}%) → shortage at ${dest.ap.icao} (fill ${(dest.fill * 100).toFixed(0)}%)${size === 'small' ? ' · LTL' : ''}${international ? ' · intl' : ''}${shockNote}`,
      status: 'available',
    };

    origin.stock.stockKg = clamp(origin.stock.stockKg - qty * 0.25, 0, origin.stock.capacityKg);
    world.lots.push(lot);
    recordLotFormationActivity(world, origin.ap.icao, dest.ap.icao);
    activeCounts.set(key, (activeCounts.get(key) ?? 0) + 1);
    if (size === 'large') {
      largeCounts.set(key, (largeCounts.get(key) ?? 0) + 1);
    } else {
      smallCounts.set(key, (smallCounts.get(key) ?? 0) + 1);
    }
    bumpFormed(opts.partitionId);
    return true;
  };

  const tryFormPair = (
    commodity: (typeof CAREER_CARGO_COMMODITIES)[number],
    origin: RankedAirport,
    dest: RankedAirport,
    cw: number,
    opts: {
      international: boolean;
      partitionId: string;
      capacityKgPerDay?: number;
      allowSpokeFiller: boolean;
      originHasOpenCorridor: boolean;
    },
  ): void => {
    if (origin.ap.icao === dest.ap.icao) return;
    if (!opts.international && !isDomesticOd(origin.ap.region, dest.ap.region)) {
      return;
    }
    if (cw <= 1) {
      if (!opts.allowSpokeFiller) return;
      const spokeFiller = origin.tier === 'spoke' && dest.tier === 'spoke';
      if (!spokeFiller) return;
      if (opts.originHasOpenCorridor || rng() > 0.2) return;
    }
    const key = laneKey(commodity.id, origin.ap.icao, dest.ap.icao);
    let caps = laneLotCaps(origin.tier, dest.tier, {
      originLevel: origin.ap.level,
      destLevel: dest.ap.level,
    });
    if (cw >= 1.8) {
      caps = {
        maxLots: caps.maxLots + 1,
        maxLarge: caps.maxLarge + 1,
        maxSmall: caps.maxSmall,
      };
    }
    const laneSat = npcLaneSaturation(
      world,
      origin.ap.icao,
      dest.ap.icao,
      commodity.id,
    );
    if (laneSat >= 1) return;
    const satPenalty = laneSat >= 0.5 ? 1 : 0;
    if ((activeCounts.get(key) ?? 0) + satPenalty >= caps.maxLots) return;

    const priceGap = dest.price - origin.price;
    const minGapMult = opts.international ? 0.12 : cw >= 1.5 ? 0.15 : 0.22;
    if (priceGap < commodity.basePricePerKg * minGapMult) return;

    if (opts.capacityKgPerDay != null && opts.capacityKgPerDay > 0) {
      if (activeLaneKg(world, origin.ap.icao, dest.ap.icao) >= opts.capacityKgPerDay) {
        return;
      }
    }

    const inboundKg = laneInboundKg(world, null, dest.ap.icao, commodity.id);
    const surplusKg = origin.stock.stockKg - origin.stock.capacityKg * 0.48;
    const roomKg = dest.stock.capacityKg * 0.58 - dest.stock.stockKg;
    let qty = Math.min(surplusKg, roomKg);
    qty = Math.floor(qty / 100) * 100;

    if (
      qty >= 4_000 &&
      caps.maxLarge > 0 &&
      (largeCounts.get(key) ?? 0) < caps.maxLarge &&
      (activeCounts.get(key) ?? 0) + satPenalty < caps.maxLots
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
        cw,
        opts,
      );
      const surplusAfter = origin.stock.stockKg - origin.stock.capacityKg * 0.48;
      const roomAfter = dest.stock.capacityKg * 0.58 - dest.stock.stockKg;
      qty = Math.floor(Math.min(surplusAfter, roomAfter) / 100) * 100;
    }

    if (
      qty >= 400 &&
      caps.maxSmall > 0 &&
      (smallCounts.get(key) ?? 0) < caps.maxSmall &&
      (activeCounts.get(key) ?? 0) + satPenalty < caps.maxLots
    ) {
      const smallQty = Math.min(qty, 2_000);
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
        cw,
        opts,
      );
    }
  };

  const rankAirports = (
    airports: AirportTerminal[],
    commodity: (typeof CAREER_CARGO_COMMODITIES)[number],
  ): RankedAirport[] =>
    airports.map((ap) => {
      const stock = ensurePile(ap, commodity.id);
      const fill = fillPct(stock);
      return {
        ap,
        stock,
        fill,
        price: localUnitPriceUsd(commodity.id, stock),
        surplusKg: Math.max(0, stock.stockKg - stock.capacityKg * 0.48),
        roomKg: Math.max(0, stock.capacityKg * 0.58 - stock.stockKg),
        tier: hubTierOf(ap),
      };
    });

  // --- Domestic: one pass per country present in the world ---
  for (const countryId of listWorldCountryIds(world)) {
    const countryAirports = world.airports.filter(
      (ap) => countryIdFromRegion(ap.region) === countryId,
    );
    for (const commodity of CAREER_CARGO_COMMODITIES) {
      const ranked = rankAirports(countryAirports, commodity);
      const destinations = ranked
        .filter((r) => r.fill <= 0.45 && r.roomKg >= 400)
        .sort((a, b) => b.roomKg - a.roomKg)
        .slice(0, 12);
      const origins = ranked
        .filter((r) => r.fill >= 0.55 && r.surplusKg >= 400)
        .sort((a, b) => b.surplusKg - a.surplusKg)
        .slice(0, 12);

      const byIcao = new Map(ranked.map((r) => [r.ap.icao, r]));
      const mergeUnique = (
        list: RankedAirport[],
        candidate: RankedAirport | undefined,
      ) => {
        if (!candidate) return;
        if (list.some((r) => r.ap.icao === candidate.ap.icao)) return;
        list.push(candidate);
      };
      // Absolute-kg ranking favors majors. Keep critically full regionals and
      // spokes eligible for the overflow valve even when they miss the top 12.
      for (const row of ranked) {
        if (
          row.tier !== 'major' &&
          row.fill >= DOMESTIC_OVERFLOW_ORIGIN_FILL &&
          row.surplusKg >= 400
        ) {
          mergeUnique(origins, row);
        }
      }
      for (const origin of [...origins]) {
        for (const partner of corridorPartners(origin.ap.icao)) {
          const row = byIcao.get(partner);
          if (row && row.fill <= 0.45 && row.roomKg >= 400) {
            mergeUnique(destinations, row);
          }
        }
      }
      for (const dest of [...destinations]) {
        for (const partner of corridorPartners(dest.ap.icao)) {
          const row = byIcao.get(partner);
          if (row && row.fill >= 0.55 && row.surplusKg >= 400) {
            mergeUnique(origins, row);
          }
        }
      }

      const laneOpen = (o: RankedAirport, d: RankedAirport, weight: number): boolean => {
        let caps = laneLotCaps(o.tier, d.tier, {
          originLevel: o.ap.level,
          destLevel: d.ap.level,
        });
        if (weight >= 1.8) {
          caps = {
            maxLots: caps.maxLots + 1,
            maxLarge: caps.maxLarge + 1,
            maxSmall: caps.maxSmall,
          };
        }
        const key = laneKey(commodity.id, o.ap.icao, d.ap.icao);
        const laneSat = npcLaneSaturation(world, o.ap.icao, d.ap.icao, commodity.id);
        if (laneSat >= 1) return false;
        const satPenalty = laneSat >= 0.5 ? 1 : 0;
        return (activeCounts.get(key) ?? 0) + satPenalty < caps.maxLots;
      };

      const originHasOpenCorridor = (o: RankedAirport): boolean => {
        for (const partnerIcao of corridorPartners(o.ap.icao)) {
          const partner = byIcao.get(partnerIcao);
          if (!partner || partner.fill > 0.45 || partner.roomKg < 400) continue;
          if (countryIdFromRegion(partner.ap.region) !== countryId) continue;
          const w = corridorWeight(o.ap.icao, partner.ap.icao);
          if (laneOpen(o, partner, w)) return true;
        }
        return false;
      };

      for (const origin of origins) {
        const hasOpenCorridor = originHasOpenCorridor(origin);
        const orderedDests = [...destinations].sort((a, b) => {
          const wa = corridorWeight(origin.ap.icao, a.ap.icao);
          const wb = corridorWeight(origin.ap.icao, b.ap.icao);
          return wb - wa;
        });
        for (const dest of orderedDests) {
          tryFormPair(commodity, origin, dest, corridorWeight(origin.ap.icao, dest.ap.icao), {
            international: false,
            partitionId: countryId,
            allowSpokeFiller: true,
            originHasOpenCorridor: hasOpenCorridor,
          });
        }

        // If a non-major warehouse remains critically full and every curated
        // gateway is blocked, release at most one low-priority domestic OD per
        // commodity/tick. It still requires a deep shortage, price gap, range,
        // and normal lane caps; curated corridors continue to win first.
        if (
          origin.tier !== 'major' &&
          origin.fill >= DOMESTIC_OVERFLOW_ORIGIN_FILL &&
          !hasOpenCorridor
        ) {
          const overflowDest = destinations.find(
            (dest) =>
              dest.ap.icao !== origin.ap.icao &&
              dest.fill <= DOMESTIC_OVERFLOW_DEST_FILL &&
              corridorWeight(origin.ap.icao, dest.ap.icao) === 1 &&
              laneOpen(origin, dest, DOMESTIC_OVERFLOW_CORRIDOR_WEIGHT),
          );
          if (overflowDest) {
            tryFormPair(
              commodity,
              origin,
              overflowDest,
              DOMESTIC_OVERFLOW_CORRIDOR_WEIGHT,
              {
                international: false,
                partitionId: countryId,
                allowSpokeFiller: false,
                originHasOpenCorridor: false,
              },
            );
          }
        }
      }
    }
  }

  // --- International: only curated sparse lanes (both directions) ---
  const byIcaoAll = new Map(world.airports.map((ap) => [ap.icao.toUpperCase(), ap]));
  for (const commodity of CAREER_CARGO_COMMODITIES) {
    const rankedAll = rankAirports(world.airports, commodity);
    const rankedByIcao = new Map(rankedAll.map((r) => [r.ap.icao.toUpperCase(), r]));
    for (const lane of world.internationalLanes ?? []) {
      const pairs: Array<[string, string]> = [
        [lane.originIcao, lane.destIcao],
        [lane.destIcao, lane.originIcao],
      ];
      for (const [oIcao, dIcao] of pairs) {
        if (!byIcaoAll.has(oIcao.toUpperCase()) || !byIcaoAll.has(dIcao.toUpperCase())) {
          continue;
        }
        const origin = rankedByIcao.get(oIcao.toUpperCase());
        const dest = rankedByIcao.get(dIcao.toUpperCase());
        if (!origin || !dest) continue;
        if (origin.fill < 0.55 || origin.surplusKg < 400) continue;
        if (dest.fill > 0.45 || dest.roomKg < 400) continue;
        const cw = Math.max(
          corridorWeight(origin.ap.icao, dest.ap.icao),
          INTERNATIONAL_CORRIDOR_WEIGHT,
        );
        tryFormPair(commodity, origin, dest, cw, {
          international: true,
          partitionId: 'INTL',
          capacityKgPerDay: lane.capacityKgPerDay,
          allowSpokeFiller: false,
          originHasOpenCorridor: false,
        });
      }
    }
  }

  const results: PartitionTickResult[] = [];
  for (const countryId of listWorldCountryIds(world)) {
    results.push({
      countryId,
      ticksAdvanced: 1,
      lotsFormed: formedByPartition.get(countryId) ?? 0,
      npcSettled: 0,
    });
  }
  results.push({
    countryId: 'INTL',
    ticksAdvanced: 1,
    lotsFormed: formedByPartition.get('INTL') ?? 0,
    npcSettled: 0,
  });
  return results;
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
    world.fuelTrucks = migrated.fuelTrucks;
    world.fuelHauls = migrated.fuelHauls;
    world.homeCountryId = migrated.homeCountryId;
    world.internationalLanes = migrated.internationalLanes;
  }

  ensureNpcFleet(world);
  ensureFuelTruckFleet(world);
  ensureWorldHubLevels(world);
  ensureInternationalLanes(world);
  ensureHomeCountryId(world);

  world.tick += 1;
  const batchNowMs =
    opts.batchNowMs ??
    (world.lastBatchAtMs ?? Date.now()) + MS_PER_TICK;
  const rng = mulberry32(hashSeed(`${opts.rngSeed ?? world.seed}:t${world.tick}`));

  applyProductionConsumption(world, rng);
  tickFuelLogistics(world, rng, { batchNowMs });
  expireLots(world);
  escalateIdleLots(world);
  maybeSpawnEvents(world, rng);
  formLotsFromImbalances(world, rng);
  tickNpcFreighters(world, rng, { batchNowMs });
  tickHubLevels(world);

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
  shiftFuelLogisticsWallClock(world, deltaMs);
}

/**
 * Advance n 15-minute batches. When advanceWallClock is true (default for UI +1 day /
 * catch-up), shifts lastBatchAtMs and uses coherent batch wall times for NPC claims.
 *
 * Instant +N (no fromBatchAtMs) rewinds wall timestamps so the previous lastBatch
 * maps to (now − N batches), then resimulates forward to now. Without that rewind,
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
    settleFuelHaulsDue(world, batchNowMs);
    tickEconomy(world, { batchNowMs });
  }

  if (advanceWall && steps > 0) {
    world.lastBatchAtMs = startBatch + steps * MS_PER_TICK;
    world.lastSyncedAtMs = world.lastBatchAtMs;
  }
  // Catch-up often lands many turnarounds on the same hour — spread them for the board.
  ensureNpcFleet(world);
  ensureFuelTruckFleet(world);
  return world;
}

/**
 * Fresh seeds start at tick 0 with an empty board. Warm one career day so
 * Freights/Contracts exist on first boot and after reset without a manual +1 day.
 * No-op when the world already has time or available lots.
 */
export function ensureSeedMarketFormed(world: CareerEconomyWorld): boolean {
  const hasAvailable = world.lots.some(
    (lot) => lot.status === 'available' && lot.quantityKg > lot.reservedKg,
  );
  if (world.tick > 0 || hasAvailable) return false;
  tickEconomyN(world, TICKS_PER_DAY);
  return true;
}

/** Split a free-text route search ("SBAR", "SBAR SBGR", "SBAR→SBGR") into tokens. */
export function marketQueryTokens(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/[\s,/>\-→]+/)
    .filter(Boolean);
}

/** Every token must appear in a single ICAO/city endpoint blob. */
export function marketEndpointMatchesQuery(
  tokens: string[],
  icao: string,
  name?: string,
): boolean {
  if (tokens.length === 0) return true;
  const blob = `${icao} ${name ?? ''}`.toLowerCase();
  return tokens.every((token) => blob.includes(token));
}

/** Every token must appear in the ICAO/city blob, matching the market board input. */
export function marketLotMatchesQuery(
  tokens: string[],
  fields: {
    originIcao: string;
    destIcao: string;
    originName?: string;
    destName?: string;
  },
): boolean {
  if (tokens.length === 0) return true;
  const blob =
    `${fields.originIcao} ${fields.destIcao} ${fields.originName ?? ''} ${fields.destName ?? ''}`.toLowerCase();
  return tokens.every((token) => blob.includes(token));
}

export function listMarketLots(
  world: CareerEconomyWorld,
  opts: {
    originIcao?: string;
    destIcao?: string;
    commodityId?: CommodityId;
    /** Free-text ICAO/city search applied to the whole route (legacy combined). */
    query?: string;
    /** Free-text ICAO/city search applied only to origin. */
    originQuery?: string;
    /** Free-text ICAO/city search applied only to destination. */
    destQuery?: string;
    nowMs?: number;
  } = {},
): MarketLotView[] {
  const byIcao = airportMap(world);
  const views: MarketLotView[] = [];
  const nowMs = opts.nowMs ?? Date.now();
  const queryTokens = marketQueryTokens(opts.query ?? '');
  const originQueryTokens = marketQueryTokens(opts.originQuery ?? '');
  const destQueryTokens = marketQueryTokens(opts.destQuery ?? '');

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
    const originName = origin?.name ?? lot.originIcao;
    const destName = dest?.name ?? lot.destIcao;
    if (
      !marketLotMatchesQuery(queryTokens, {
        originIcao: lot.originIcao,
        destIcao: lot.destIcao,
        originName,
        destName,
      })
    ) {
      continue;
    }
    if (
      !marketEndpointMatchesQuery(originQueryTokens, lot.originIcao, originName)
    ) {
      continue;
    }
    if (!marketEndpointMatchesQuery(destQueryTokens, lot.destIcao, destName)) {
      continue;
    }
    const oStock = origin ? ensurePile(origin, lot.commodityId) : pile(0, 1);
    const dStock = dest ? ensurePile(dest, lot.commodityId) : pile(0, 1);
    const commodity = getCommodity(lot.commodityId);
    const claim = npcClaimForLot(world, lot.id, nowMs);
    const pressure = describeLotMarketPressure(world, lot, nowMs);
    const idlePayMult = idleLotPayMult(lot, world.tick);
    pressure.idlePayMult = idlePayMult;
    pressure.idleEscalated = idlePayMult > 1.02;
    const originRegion =
      byIcao.get(lot.originIcao)?.region ?? pressure.originRegion;
    const destRegion = byIcao.get(lot.destIcao)?.region ?? '';
    const shock = laneDemandShock(world, {
      originRegion,
      destRegion,
      commodityId: lot.commodityId,
    });
    pressure.demandShock = shock.labels.length > 0;
    pressure.shockLabels = shock.labels;
    pressure.shockPayMult = shock.payMult;
    pressure.international = !isDomesticOd(originRegion, destRegion);

    views.push({
      lot,
      originName,
      destName,
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
