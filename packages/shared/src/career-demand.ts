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
import { TICKS_PER_DAY, TICKS_PER_HOUR } from './career-clock.js';
import { hubDistanceNm } from './career-ferry-route.js';
import { countryIdFromRegion } from './career-partition.js';
import { demandDeskMultForWarehouse } from './career-ground-staff.js';
import {
  depositCargoToWarehouse,
  findPlayerWarehouseAtIcao,
  warehouseFreeCommodityKg,
  withdrawCargoFromWarehouse,
} from './career-warehouse-stock.js';
import { isPortPickupHub, listPortPickupHubIcaos } from './career-warehouse.js';
import {
  assertDemandPortCorridorReach,
  DEMAND_PORT_CORRIDOR_NM,
  corridorNmForLevel,
  demandOrdersCapForPortDesk,
  destNearAnyHub,
  destWithinCorridorNm,
  listBoundCareerPorts,
  worldPortDeskCorridorLevel,
} from './career-port-corridor.js';
import { isBushHub, isBushTripOnlyHub } from './career-bush.js';
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
  PlayerDemandHold,
} from './types/career-economy.js';
import demandIntlCountryPairsRaw from './data/demand-intl-country-pairs.json' with { type: 'json' };

export const DEMAND_COMMODITIES: readonly CommodityId[] = [
  'general',
  'supplies',
  'machinery',
  'electronics',
];

/** Spawn when stock / capacity is below this fraction. */
export const DEMAND_STOCK_FRAC_THRESHOLD = 0.25;

/** Soft max open orders per destination hub (within a port desk). */
export const DEMAND_ORDERS_PER_HUB = 2;

/** Extra open slot at dests inside an active local operator’s port catchment. */
export const DEMAND_ORDERS_OPERATOR_SOFT_EXTRA = 1;

/**
 * Soft cap of open board rows worldwide (keeps Ports GET snappy).
 * Floor 192 (early-map size); scales with countries so a dense seed
 * is not stuck at ~2 rows per country. Split across countries (port-weighted)
 * so BR/early ports cannot monopolize every slot while US desks stay empty.
 */
export const DEMAND_ORDERS_GLOBAL_CAP_MIN = 192;
/** Raised with world densify — equal-split of 640 left US at ~3–4 open total. */
export const DEMAND_ORDERS_GLOBAL_CAP_MAX = 1280;
/** Target open rows per country when sizing the global cap (nCountries × target). */
export const DEMAND_ORDERS_PER_COUNTRY_TARGET = 12;
/**
 * Weight boost per bound career port when splitting the global cap.
 * Countries with more desks (US densify) get a larger share than 1/n.
 */
export const DEMAND_ORDERS_PORT_WEIGHT = 2;
/** Minimum floor — live board uses {@link demandOrdersGlobalCap}. */
export const DEMAND_ORDERS_GLOBAL_CAP = DEMAND_ORDERS_GLOBAL_CAP_MIN;

/** kg band rolled per new Demand row (then clipped to terminal deficit). */
export function demandWantedKgBand(commodityId: CommodityId): {
  min: number;
  max: number;
} {
  if (commodityId === 'machinery' || commodityId === 'electronics') {
    return { min: 400, max: 8_000 };
  }
  return { min: 400, max: 12_000 };
}

/** Premium on local spot for max unit price (rng in range). */
export const DEMAND_PRICE_PREMIUM_MIN = 1.05;
export const DEMAND_PRICE_PREMIUM_MAX = 1.15;

/**
 * Extra pay multiplier when fulfilling Demand cross-border from a port WH.
 * Stacks on the order's frozen maxUnitPriceUsd (already ~5–15% over spot).
 */
export const DEMAND_INTL_PAY_MULT = 1.28;

/** Hold TTL by warehouse tier (economy ticks). T1 ~12h, T2 ~18h, T3 ~1d. */
export const DEMAND_HOLD_TTL_TICKS_BY_TIER: Record<1 | 2 | 3, number> = {
  1: TICKS_PER_DAY / 2,
  2: (TICKS_PER_DAY * 3) / 4,
  3: TICKS_PER_DAY,
};

/** Bidirectional country pairs for international Demand (not Market lanes). */
export const DEMAND_INTL_COUNTRY_PAIRS: ReadonlyArray<readonly [string, string]> =
  demandIntlCountryPairsRaw as unknown as ReadonlyArray<
    readonly [string, string]
  >;

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

/** Demand/Dispatch dests — bush trips use PLN, not SimBrief OFP. */
function isDemandBoardAirport(ap: {
  icao: string;
  bush?: boolean;
  bushTripOnly?: boolean;
}): boolean {
  const icao = ap.icao.trim().toUpperCase();
  if (!icao || !CAREER_HUB_COORDS[icao]) return false;
  if (ap.bush === true || ap.bushTripOnly === true) return false;
  if (isBushHub(icao) || isBushTripOnlyHub(icao)) return false;
  return true;
}

function demandBoardCountryIds(world: CareerEconomyWorld): string[] {
  const countries = new Set<string>();
  for (const ap of world.airports) {
    if (!isDemandBoardAirport(ap)) continue;
    const icao = ap.icao.trim().toUpperCase();
    if (!CAREER_HUB_COORDS[icao]) continue;
    const c = demandAirportCountryId(ap);
    if (c) countries.add(c);
  }
  return [...countries].sort((a, b) => a.localeCompare(b));
}

export function demandOrdersGlobalCap(world: CareerEconomyWorld): number {
  const n = Math.max(1, demandBoardCountryIds(world).length);
  return Math.min(
    DEMAND_ORDERS_GLOBAL_CAP_MAX,
    Math.max(DEMAND_ORDERS_GLOBAL_CAP_MIN, n * DEMAND_ORDERS_PER_COUNTRY_TARGET),
  );
}

/**
 * Equal-ish soft quotas per country so seed order (BR first) cannot fill
 * the live global cap alone. Countries with more bound ports get a larger
 * share (US densify); remainder goes to highest fractional parts.
 */
export function demandCountryOpenQuotas(
  world: CareerEconomyWorld,
  globalCap: number = demandOrdersGlobalCap(world),
): Map<string, number> {
  const list = demandBoardCountryIds(world);
  const n = Math.max(1, list.length);
  const portCount = new Map<string, number>();
  for (const port of listBoundCareerPorts()) {
    // PortDeskDef has no countryId — infer from first pickup hub region.
    let country: string | null = null;
    for (const hub of port.pickupHubs) {
      country = demandHubCountryId(world, hub);
      if (country) break;
    }
    if (!country) continue;
    portCount.set(country, (portCount.get(country) ?? 0) + 1);
  }
  const weights = list.map((c) => {
    const ports = portCount.get(c) ?? 0;
    return { c, w: 1 + DEMAND_ORDERS_PORT_WEIGHT * ports };
  });
  const totalW = weights.reduce((s, x) => s + x.w, 0);
  const exact = weights.map((x) => ({
    c: x.c,
    v: (globalCap * x.w) / totalW,
  }));
  const floors = exact.map((x) => ({
    c: x.c,
    n: Math.floor(x.v),
    frac: x.v - Math.floor(x.v),
  }));
  let rem = globalCap - floors.reduce((s, x) => s + x.n, 0);
  floors.sort((a, b) => b.frac - a.frac || a.c.localeCompare(b.c));
  for (let i = 0; i < floors.length && rem > 0; i += 1) {
    floors[i]!.n += 1;
    rem -= 1;
  }
  const quotas = new Map<string, number>();
  for (const c of list) {
    const row = floors.find((f) => f.c === c);
    quotas.set(c, row?.n ?? Math.floor(globalCap / n));
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

export function demandHoldTtlTicks(tier: 1 | 2 | 3): number {
  return DEMAND_HOLD_TTL_TICKS_BY_TIER[tier] ?? DEMAND_HOLD_TTL_TICKS_BY_TIER[1];
}

function restoreDemandRemainingKg(
  world: CareerEconomyWorld,
  orderId: string,
  kg: number,
): void {
  const add = Math.max(0, Math.floor(kg));
  if (add <= 0) return;
  if (!Array.isArray(world.demandOrders)) world.demandOrders = [];
  const order = world.demandOrders.find((o) => o.id === orderId);
  if (!order) return;
  if (order.expiresAtTick <= world.tick) return;
  order.remainingKg = Math.min(order.wantedKg, order.remainingKg + add);
  if (order.remainingKg > 0) {
    order.status = 'open';
  }
}

export function listDemandHolds(state: CareerMissionsState): PlayerDemandHold[] {
  const whs = state.playerWarehouses;
  if (!whs) return [];
  if (!Array.isArray(whs.demandHolds)) whs.demandHolds = [];
  return whs.demandHolds;
}

/** Drop expired holds and return claimed kg to the Demand Board. */
export function expireDemandHolds(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
): number {
  const holds = listDemandHolds(state);
  if (holds.length === 0) return 0;
  let released = 0;
  const kept: PlayerDemandHold[] = [];
  for (const hold of holds) {
    if (hold.expiresAtTick > world.tick) {
      kept.push(hold);
      continue;
    }
    if ((hold.kind ?? 'demand') === 'demand' && hold.orderId) {
      restoreDemandRemainingKg(world, hold.orderId, hold.kg);
    }
    released += hold.kg;
  }
  state.playerWarehouses!.demandHolds = kept;
  return released;
}

export function holdDemandOrder(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    orderId: string;
    originIcao: string;
    kg?: number;
  },
): { hold: PlayerDemandHold; order: DemandOrder; kg: number } {
  ensureDemandOrders(world);
  expireDemandHolds(state, world);
  const order = (world.demandOrders ?? []).find(
    (o) => o.id === opts.orderId.trim(),
  );
  if (!order || order.status !== 'open' || order.remainingKg <= 0) {
    throw new Error('Demand order not available');
  }
  if (!order.portId?.trim()) {
    throw new Error('Demand order has no port desk — refresh the board');
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
  if (isBushHub(dest) || isBushTripOnlyHub(dest)) {
    throw new Error(
      `Demand cannot stage to bush strip ${dest} — SimBrief Dispatch needs a civil hub`,
    );
  }

  const wh = findPlayerWarehouseAtIcao(state, origin);
  if (!wh) {
    throw new Error(`No warehouse at ${origin}`);
  }

  const holds = listDemandHolds(state);
  if (holds.some((h) => (h.kind ?? 'demand') === 'demand' && h.orderId === order.id)) {
    throw new Error('This demand order is already held at your warehouse');
  }

  assertDemandInternationalAccept(world, origin, dest);
  assertDemandPortCorridorReach(state, world, origin, dest, {
    portId: order.portId,
  });

  const stockAvail = warehouseFreeCommodityKg(state, origin, order.commodityId);
  let kg = Math.max(
    0,
    Math.floor(opts.kg ?? Math.min(order.remainingKg, stockAvail)),
  );
  kg = Math.min(kg, order.remainingKg, stockAvail);
  if (kg <= 0) {
    throw new Error(
      `No ${order.commodityId} available in warehouse at ${origin} for this order`,
    );
  }

  const unitPriceUsd = money(
    order.maxUnitPriceUsd *
      demandInternationalUnitPriceMult(world, origin, dest) *
      demandDeskMultForWarehouse(state, wh.id),
  );
  const ttl = demandHoldTtlTicks(wh.tier);
  const hold: PlayerDemandHold = {
    id: nextId('dhold', world.tick),
    kind: 'demand',
    orderId: order.id,
    warehouseId: wh.id,
    originIcao: origin,
    destIcao: dest,
    commodityId: order.commodityId,
    kg,
    unitPriceUsd,
    heldAtTick: world.tick,
    expiresAtTick: Math.min(world.tick + ttl, order.expiresAtTick),
  };
  holds.push(hold);
  state.playerWarehouses!.demandHolds = holds;

  order.remainingKg -= kg;
  if (order.remainingKg <= 0) {
    order.remainingKg = 0;
    order.status = 'filled';
  }

  return { hold, order: { ...order }, kg };
}

export function cancelDemandHold(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { holdId: string },
): { kg: number; orderId: string } {
  expireDemandHolds(state, world);
  const holds = listDemandHolds(state);
  const idx = holds.findIndex((h) => h.id === opts.holdId.trim());
  if (idx < 0) throw new Error('Demand hold not found');
  const hold = holds[idx]!;
  if ((hold.kind ?? 'demand') === 'bridge') {
    throw new Error('Use warehouse bridge cancel for this hold');
  }
  const orderId = hold.orderId?.trim();
  if (!orderId) throw new Error('Demand hold is missing an order');
  restoreDemandRemainingKg(world, orderId, hold.kg);
  holds.splice(idx, 1);
  state.playerWarehouses!.demandHolds = holds;
  return { kg: hold.kg, orderId };
}

export function dispatchDemandHold(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { holdId: string; aircraftId: string },
): { mission: MissionIntent; order: DemandOrder; kg: number; payUsd: number } {
  ensureDemandOrders(world);
  expireDemandHolds(state, world);
  const holds = listDemandHolds(state);
  const idx = holds.findIndex((h) => h.id === opts.holdId.trim());
  if (idx < 0) throw new Error('Demand hold not found');
  const hold = holds[idx]!;
  if ((hold.kind ?? 'demand') === 'bridge') {
    throw new Error('Use warehouse bridge dispatch for this hold');
  }
  const orderId = hold.orderId?.trim();
  if (!orderId) throw new Error('Demand hold is missing an order');

  const open = listActivePlayerMissions(state.missions ?? []);
  if (open.length > 0) {
    throw new Error(
      `Finish or cancel ${open[0]!.id} before dispatching a demand hold`,
    );
  }

  const aircraft = findPlayerAircraft(state, opts.aircraftId);
  if (!aircraft) throw new Error(`Unknown aircraft ${opts.aircraftId}`);
  const airframeTypeId = aircraft.airframeTypeId;
  if (!airframeTypeId) {
    throw new Error(`Aircraft ${aircraft.id} has no airframe`);
  }
  if (aircraft.status !== 'parked') {
    throw new Error(`Aircraft ${aircraft.id} is not parked`);
  }
  if (aircraft.locationIcao.trim().toUpperCase() !== hold.originIcao) {
    throw new Error(
      `Aircraft is at ${aircraft.locationIcao}, not warehouse hub ${hold.originIcao}`,
    );
  }

  const dispatchAircraft = {
    id: aircraft.id,
    aircraftClassId: aircraft.aircraftClassId,
    airframeTypeId,
  };
  const maxCargoKg = demandRouteMaxCargoKg(
    world,
    dispatchAircraft,
    hold.originIcao,
    hold.destIcao,
  );
  if (hold.kg > maxCargoKg) {
    throw new Error(
      `Held ${hold.kg} kg exceeds this airframe's ${maxCargoKg} kg ops cap for ${hold.originIcao}→${hold.destIcao} — release the hold or use a larger aircraft`,
    );
  }

  const order = (world.demandOrders ?? []).find((o) => o.id === orderId);
  const withdrawn = withdrawCargoFromWarehouse(state, {
    icao: hold.originIcao,
    commodityId: hold.commodityId,
    kg: hold.kg,
  });

  holds.splice(idx, 1);
  state.playerWarehouses!.demandHolds = holds;

  const kg = hold.kg;
  const payUsd = money(hold.unitPriceUsd * kg);
  const deadlineTick = Math.min(
    order?.expiresAtTick ?? world.tick + TICKS_PER_HOUR * 72,
    world.tick + TICKS_PER_HOUR * 72,
  );
  const mission = createDemandMission(state, world, {
    origin: hold.originIcao,
    dest: hold.destIcao,
    commodityId: hold.commodityId,
    kg,
    payUsd,
    aircraft: dispatchAircraft,
    orderId,
    warehouseId: withdrawn.warehouseId,
    avgCostUsdPerKg: withdrawn.avgCostUsdPerKg,
    international:
      demandInternationalUnitPriceMult(world, hold.originIcao, hold.destIcao) >
      1,
    originCountryId: demandHubCountryId(world, hold.originIcao) ?? '',
    destCountryId: demandHubCountryId(world, hold.destIcao) ?? '',
    deadlineTick,
  });

  return {
    mission,
    order: order ? { ...order } : {
      id: orderId,
      destIcao: hold.destIcao,
      commodityId: hold.commodityId,
      wantedKg: kg,
      remainingKg: 0,
      maxUnitPriceUsd: hold.unitPriceUsd,
      arrivedAtTick: world.tick,
      expiresAtTick: deadlineTick,
      status: 'filled',
    },
    kg,
    payUsd,
  };
}

export function demandRouteMaxCargoKg(
  world: CareerEconomyWorld,
  aircraft: { aircraftClassId: MissionIntent['aircraftClassId']; airframeTypeId: string },
  origin: string,
  dest: string,
): number {
  if (!CAREER_HUB_COORDS[origin] || !CAREER_HUB_COORDS[dest]) {
    throw new Error(`Unknown hub route ${origin}→${dest}`);
  }
  if (!airportByIcao(world, dest)) {
    throw new Error(`Unknown destination ${dest}`);
  }
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
  return routeLimit.operationalMaxCargoKg;
}

function createDemandMission(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    origin: string;
    dest: string;
    commodityId: CommodityId;
    kg: number;
    payUsd: number;
    aircraft: {
      id: string;
      aircraftClassId: MissionIntent['aircraftClassId'];
      airframeTypeId: string;
    };
    orderId: string;
    warehouseId: string;
    avgCostUsdPerKg: number;
    international: boolean;
    originCountryId: string;
    destCountryId: string;
    deadlineTick: number;
  },
): MissionIntent {
  const classDef = getAircraftClass(opts.aircraft.aircraftClassId);
  const airframe = findCareerPlayerAirframe(opts.aircraft.airframeTypeId);
  const distanceNm =
    hubDistanceNm(opts.origin, opts.dest) ??
    routeDistanceNm(world, opts.origin, opts.dest) ??
    0;
  const missionId = `msn_demand_${world.tick}_${opts.origin}_${opts.dest}_${Math.floor(Math.random() * 1e6)}`;
  const lotId = `demand_${opts.orderId}_${opts.kg}`;
  const laneLabel = opts.international
    ? `Intl demand · ${opts.originCountryId}→${opts.destCountryId}`
    : `Demand delivery · ${opts.origin}→${opts.dest}`;
  const mission = recomputeMissionTotals({
    id: missionId,
    lots: [
      {
        shipmentLotId: lotId,
        commodityId: opts.commodityId,
        cargoKg: opts.kg,
        payUsd: opts.payUsd,
        urgency: 'normal',
        reason: opts.international
          ? `Intl demand · ${getCommodity(opts.commodityId).name} → ${opts.dest}`
          : `Demand · ${getCommodity(opts.commodityId).name} → ${opts.dest}`,
        deadlineTick: opts.deadlineTick,
      },
    ],
    shipmentLotId: lotId,
    commodityId: opts.commodityId,
    originIcao: opts.origin,
    destIcao: opts.dest,
    cargoKg: opts.kg,
    pax: 0,
    aircraftClassId: opts.aircraft.aircraftClassId,
    airframeTypeId: opts.aircraft.airframeTypeId,
    rolesPackRelPath:
      airframe?.rolesPackRelPath ?? classDef.rolesPackRelPath,
    deadlineTick: opts.deadlineTick,
    payUsd: opts.payUsd,
    urgency: 'normal',
    reason: laneLabel,
    status: 'accepted',
    acceptedAtTick: world.tick,
    aircraftId: opts.aircraft.id,
    demandOrderId: opts.orderId,
    warehouseId: opts.warehouseId,
    warehouseAvgCostUsdPerKg: opts.avgCostUsdPerKg,
    distanceNm: Math.round(distanceNm),
  });
  assignAircraftToMission(state, opts.aircraft.id, mission.id, opts.origin);
  state.missions = [...(state.missions ?? []), mission];
  syncPlayerInbound(world, mission);
  return mission;
}

/** Keep aligned with PORT_HUB_SURPLUS_FILL in career-ports (avoid import cycle). */
const PORT_PICKUP_SURPLUS_FILL = 0.58;

export type EnsureDemandOrdersOpts = {
  /**
   * @deprecated Per-port desk spawn uses world.portConcessions; kept for call-site compat.
   */
  operatorCatchmentHubs?: readonly string[];
};

/**
 * Port-pickup hubs with surplus fill for each demand commodity.
 */
export function portPickupSurplusHubsByCommodity(
  world: CareerEconomyWorld,
): Map<CommodityId, string[]> {
  const out = new Map<CommodityId, string[]>();
  for (const commodityId of DEMAND_COMMODITIES) {
    const hubs: string[] = [];
    for (const raw of listPortPickupHubIcaos()) {
      const hub = raw.trim().toUpperCase();
      const ap = airportByIcao(world, hub);
      const pile = ap?.inventory?.[commodityId];
      if (!pile || !(pile.capacityKg > 0)) continue;
      const fill = Math.min(1, Math.max(0, pile.stockKg / pile.capacityKg));
      if (fill >= PORT_PICKUP_SURPLUS_FILL) hubs.push(hub);
    }
    if (hubs.length > 0) out.set(commodityId, hubs);
  }
  return out;
}

export {
  DEMAND_CORRIDOR_NM_BY_LEVEL,
  DEMAND_ORDERS_PER_PORT_BASE,
  DEMAND_ORDERS_PER_PORT_OPERATOR_EXTRA,
  corridorNmForLevel,
  clampPortCorridorLevel,
  formatPortCorridorReachLabel,
  resolvePlayerPortCorridorLevel,
  destWithinCorridorNm,
  minNmToHubs,
  assertDemandPortCorridorReach,
  worldPortDeskCorridorLevel,
  demandOrdersCapForPortDesk,
  listBoundCareerPorts,
} from './career-port-corridor.js';
export type { PortCorridorLevel, PortDeskDef } from './career-port-corridor.js';
export { DEMAND_PORT_CORRIDOR_NM, destNearAnyHub };

export function destInPortSurplusCorridor(
  destIcao: string,
  commodityId: CommodityId,
  surplusByCommodity: Map<CommodityId, string[]>,
  maxNm: number = DEMAND_PORT_CORRIDOR_NM,
): boolean {
  const hubs = surplusByCommodity.get(commodityId) ?? [];
  return destNearAnyHub(destIcao, hubs, maxNm);
}

function portDeskCommodityOrder(
  world: CareerEconomyWorld,
  pickups: readonly string[],
): CommodityId[] {
  const preferred: CommodityId[] = [];
  const rest: CommodityId[] = [];
  for (const commodityId of DEMAND_COMMODITIES) {
    let surplus = false;
    for (const hub of pickups) {
      const ap = airportByIcao(world, hub);
      const pile = ap?.inventory?.[commodityId];
      if (!pile || !(pile.capacityKg > 0)) continue;
      if (pile.stockKg / pile.capacityKg >= PORT_PICKUP_SURPLUS_FILL) {
        surplus = true;
        break;
      }
    }
    if (surplus) preferred.push(commodityId);
    else rest.push(commodityId);
  }
  return [...preferred, ...rest];
}

export function ensureDemandOrders(
  world: CareerEconomyWorld,
  _opts: EnsureDemandOrdersOpts = {},
): DemandOrder[] {
  if (!Array.isArray(world.demandOrders)) {
    world.demandOrders = [];
  }
  const orders = world.demandOrders;

  // Expire bush dests, due dates, and legacy rows without portId (pre per-port desk).
  for (const order of orders) {
    if (order.status !== 'open') continue;
    const dest = order.destIcao.trim().toUpperCase();
    if (isBushHub(dest) || isBushTripOnlyHub(dest)) {
      order.status = 'expired';
      continue;
    }
    if (!order.portId?.trim()) {
      order.status = 'expired';
      continue;
    }
    if (order.remainingKg <= 0 || order.expiresAtTick <= world.tick) {
      order.status = order.remainingKg <= 0 ? 'filled' : 'expired';
      if (order.remainingKg <= 0) order.remainingKg = 0;
    }
  }

  const rng = mulberry32(hashSeed(`${world.seed}:demand:${world.tick}`));

  const isOpen = (o: DemandOrder) =>
    o.status === 'open' &&
    o.remainingKg > 0 &&
    o.expiresAtTick > world.tick &&
    Boolean(o.portId?.trim());

  const quotas = demandCountryOpenQuotas(world);
  const boardCap = demandOrdersGlobalCap(world);

  // Trim countries that exceed quota (oldest first).
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
      list.sort(
        (a, b) => a.arrivedAtTick - b.arrivedAtTick || a.id.localeCompare(b.id),
      );
      const overflow = list.length - quota;
      for (let i = 0; i < overflow; i++) {
        list[i]!.status = 'expired';
      }
    }
  }

  // Trim port desks over cap.
  {
    const byPort = new Map<string, DemandOrder[]>();
    for (const o of orders) {
      if (!isOpen(o)) continue;
      const pid = o.portId!.trim().toUpperCase();
      const list = byPort.get(pid) ?? [];
      list.push(o);
      byPort.set(pid, list);
    }
    for (const [portId, list] of byPort) {
      const cap = demandOrdersCapForPortDesk(world, portId);
      if (list.length <= cap) continue;
      list.sort(
        (a, b) => a.arrivedAtTick - b.arrivedAtTick || a.id.localeCompare(b.id),
      );
      const overflow = list.length - cap;
      for (let i = 0; i < overflow; i++) {
        list[i]!.status = 'expired';
      }
    }
  }

  const openGlobal = () => orders.filter(isOpen).length;

  if (openGlobal() >= boardCap) {
    world.demandOrders = orders.filter(
      (o) => o.status === 'open' || o.expiresAtTick > world.tick - 96,
    );
    return world.demandOrders;
  }

  const openByCountry = new Map<string, number>();
  const openByPort = new Map<string, number>();
  for (const o of orders) {
    if (!isOpen(o)) continue;
    const c = demandHubCountryId(world, o.destIcao);
    if (c) openByCountry.set(c, (openByCountry.get(c) ?? 0) + 1);
    const pid = o.portId!.trim().toUpperCase();
    openByPort.set(pid, (openByPort.get(pid) ?? 0) + 1);
  }

  const boardAirports = world.airports.filter((ap) => isDemandBoardAirport(ap));
  const portsAll = listBoundCareerPorts();
  // Rotate which desks lead so densified US ports are not starved by MIA/EWR order.
  const portRot =
    portsAll.length > 0 ? world.tick % portsAll.length : 0;
  const ports =
    portRot === 0
      ? portsAll
      : [...portsAll.slice(portRot), ...portsAll.slice(0, portRot)];

  for (const port of ports) {
    if (openGlobal() >= boardCap) break;
    const portId = port.id.trim().toUpperCase();
    const pickups = port.pickupHubs
      .map((h) => h.trim().toUpperCase())
      .filter((h) => Boolean(h) && CAREER_HUB_COORDS[h]);
    if (pickups.length === 0) continue;

    const portCap = demandOrdersCapForPortDesk(world, portId);
    let portSlots = portCap - (openByPort.get(portId) ?? 0);
    if (portSlots <= 0) continue;

    const { level } = worldPortDeskCorridorLevel(world, portId);
    const maxNm = corridorNmForLevel(level);
    const commodities = portDeskCommodityOrder(world, pickups);

    const catchmentAirports = boardAirports.filter((ap) => {
    const icao = ap.icao.trim().toUpperCase();
      if (!CAREER_HUB_COORDS[icao]) return false;
      if (pickups.includes(icao)) return false; // no dest = own pickup
      return destWithinCorridorNm(icao, pickups, maxNm);
    });

    for (const ap of catchmentAirports) {
      if (openGlobal() >= boardCap || portSlots <= 0) break;
      const icao = ap.icao.trim().toUpperCase();
    const country = demandAirportCountryId(ap);
      if (!country) continue;
    const quota = quotas.get(country) ?? 0;
      if ((openByCountry.get(country) ?? 0) >= quota) continue;

    const openHere = orders.filter(
      (o) =>
          isOpen(o) &&
        o.destIcao === icao &&
          o.portId?.trim().toUpperCase() === portId,
      );
      let hubSlots = DEMAND_ORDERS_PER_HUB - openHere.length;
      if (hubSlots <= 0) continue;

      for (const commodityId of commodities) {
        if (hubSlots <= 0 || portSlots <= 0) break;
        if (openGlobal() >= boardCap) break;
      if ((openByCountry.get(country) ?? 0) >= quota) break;
      if (openHere.some((o) => o.commodityId === commodityId)) continue;

      const pile = ap.inventory[commodityId];
      if (!pile || pile.capacityKg <= 0) continue;
      const frac = pile.stockKg / pile.capacityKg;
      if (frac >= DEMAND_STOCK_FRAC_THRESHOLD) continue;

      const deficitKg = Math.max(
        0,
          Math.floor(
            pile.capacityKg * DEMAND_STOCK_FRAC_THRESHOLD - pile.stockKg,
          ),
      );
      if (deficitKg < 200) continue;

        const { min: bandMin, max: bandMax } = demandWantedKgBand(commodityId);
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

        const row: DemandOrder = {
        id: nextId('demand', world.tick),
          portId,
        destIcao: icao,
        commodityId,
        wantedKg,
        remainingKg: wantedKg,
        maxUnitPriceUsd,
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + Math.floor(DEMAND_TTL_TICKS),
        status: 'open',
        };
        orders.push(row);
        openHere.push(row);
      openByCountry.set(country, (openByCountry.get(country) ?? 0) + 1);
        openByPort.set(portId, (openByPort.get(portId) ?? 0) + 1);
        hubSlots -= 1;
        portSlots -= 1;
      }
    }
  }

  world.demandOrders = orders.filter(
    (o) => o.status === 'open' || o.expiresAtTick > world.tick - 96,
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
  expireDemandHolds(state, world);
  const order = (world.demandOrders ?? []).find(
    (o) => o.id === opts.orderId.trim(),
  );
  if (!order || order.status !== 'open' || order.remainingKg <= 0) {
    throw new Error('Demand order not available');
  }
  if (!order.portId?.trim()) {
    throw new Error('Demand order has no port desk — refresh the board');
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
  if (isBushHub(dest) || isBushTripOnlyHub(dest)) {
    throw new Error(
      `Demand cannot stage to bush strip ${dest} — SimBrief Dispatch needs a civil hub`,
    );
  }

  const wh = findPlayerWarehouseAtIcao(state, origin);
  if (!wh) {
    throw new Error(`No warehouse at ${origin}`);
  }
  if (listDemandHolds(state).some((h) => h.orderId === order.id)) {
    throw new Error('Dispatch the warehouse hold for this order instead of Fly now');
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
  assertDemandPortCorridorReach(state, world, origin, dest, {
    portId: order.portId,
  });

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

  const stockAvail = warehouseFreeCommodityKg(state, origin, order.commodityId);

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
  return warehouseFreeCommodityKg(state, icao, commodityId);
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
