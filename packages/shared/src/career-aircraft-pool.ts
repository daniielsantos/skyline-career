/**
 * Finite dealer aircraft pool — country-scaled caps, equal SKU quota, homolog-aware sync.
 */

import { hubTierOf, type CareerEconomyWorld } from './career-economy.js';
import { isBushHub } from './career-bush.js';
import { conditionPctsForListing } from './career-aircraft-maintenance.js';
import {
  CONDITION_PRICE_MULT,
  resolveAircraftLeaseWeeklyUsd,
  resolveAircraftMsrpUsd,
} from './career-aircraft-pricing.js';
import { allocateAircraftRegistration } from './career-aircraft-registration.js';
import { TICKS_PER_DAY } from './career-clock.js';
import { countryIdFromRegion } from './career-partition.js';
import {
  findCareerPlayerAirframe,
  listCareerPlayerAirframes,
} from './career-player-airframes.js';
import type {
  AircraftInstance,
  AircraftListing,
  AircraftListingKind,
  AirframeCondition,
  CareerMissionsState,
  FreighterClassId,
  PlayerAircraft,
} from './types/career-economy.js';

export const POOL_BR_ANCHOR_HUBS = 62;
export const POOL_FACTOR_MAX = 1.5;

const CLASS_ORDER: FreighterClassId[] = [
  'light_ga',
  'light_turboprop',
  'light_jet',
  'medium_piston',
  'narrow_freighter',
  'wide_freighter',
];

const CLASS_ANCHOR: Record<FreighterClassId, number> = {
  light_ga: 12,
  light_turboprop: 6,
  light_jet: 5,
  medium_piston: 3,
  narrow_freighter: 2,
  wide_freighter: 1,
};

/**
 * Minimum dealer instances per enabled SKU worldwide (any status counts).
 * Country caps still drive density for lights; heavies need a real per-model quota.
 */
export const CLASS_GLOBAL_MIN_PER_SKU: Record<FreighterClassId, number> = {
  light_ga: 1,
  light_turboprop: 1,
  light_jet: 1,
  medium_piston: 2,
  narrow_freighter: 3,
  wide_freighter: 3,
};

const LISTING_LIFE_TICKS = TICKS_PER_DAY * 30;

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (t >>> 7), 61 | r);
    return ((r ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length]!;
}

export function countryScaleFactor(hubCount: number): number {
  const hubs = Math.max(0, Math.floor(hubCount));
  if (hubs <= 0) return 0;
  return Math.min(POOL_FACTOR_MAX, hubs / POOL_BR_ANCHOR_HUBS);
}

export function classGatePasses(
  hubCount: number,
  factor: number,
  classId: FreighterClassId,
): boolean {
  if (hubCount < 1) return false;
  if (classId === 'light_ga') return true;
  if (classId === 'light_turboprop') return hubCount >= 3;
  if (classId === 'light_jet') return factor >= 0.35;
  if (classId === 'medium_piston') return factor >= 0.4;
  if (classId === 'narrow_freighter') return factor >= 0.5;
  if (classId === 'wide_freighter') return factor >= 0.8;
  return false;
}

/** Country cap for one economic class (before SKU coverage floor). */
export function countryAircraftClassCap(
  hubCount: number,
  classId: FreighterClassId,
  skuCount: number,
): number {
  const factor = countryScaleFactor(hubCount);
  if (!classGatePasses(hubCount, factor, classId)) return 0;
  const scaled = Math.round(CLASS_ANCHOR[classId] * factor);
  const floor = classId === 'light_ga' ? 1 : 0;
  const lightClasses = new Set<FreighterClassId>([
    'light_ga',
    'light_turboprop',
    'light_jet',
  ]);
  const largeCountry =
    hubCount >= Math.floor(POOL_BR_ANCHOR_HUBS * 0.95) || factor >= POOL_FACTOR_MAX;
  if (lightClasses.has(classId) && skuCount > 0 && largeCountry) {
    return Math.max(floor, scaled, skuCount);
  }
  return Math.max(floor, scaled);
}

export function hashCareerPlayerAirframeCatalog(): string {
  const rows = listCareerPlayerAirframes()
    .map((a) => `${a.typeId}:${a.aircraftClassId}`)
    .sort();
  return rows.join('|');
}

type CountryHubRow = {
  countryId: string;
  hubCount: number;
  hubIcaos: string[];
};

function listCountryHubRows(world: CareerEconomyWorld): CountryHubRow[] {
  const byCountry = new Map<string, string[]>();
  for (const ap of world.airports) {
    if (isBushHub(ap.icao)) continue;
    const countryId = countryIdFromRegion(ap.region ?? '');
    const list = byCountry.get(countryId) ?? [];
    list.push(ap.icao);
    byCountry.set(countryId, list);
  }
  return [...byCountry.entries()]
    .map(([countryId, hubIcaos]) => ({
      countryId,
      hubCount: hubIcaos.length,
      hubIcaos,
    }))
    .sort((a, b) => b.hubCount - a.hubCount || a.countryId.localeCompare(b.countryId));
}

function distributeEqualQuota(
  totalSlots: number,
  skuIds: readonly string[],
): Map<string, number> {
  const out = new Map<string, number>();
  if (totalSlots <= 0 || skuIds.length === 0) return out;
  const base = Math.floor(totalSlots / skuIds.length);
  let rem = totalSlots % skuIds.length;
  for (const id of skuIds) out.set(id, base);
  for (let i = 0; rem > 0; i++, rem--) {
    const id = skuIds[i % skuIds.length]!;
    out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

/** Assign airframeTypeIds to country slots (1-de-cada when cap allows, else equal subset). */
export function allocateCountryClassSlots(
  countryId: string,
  classId: FreighterClassId,
  slotCount: number,
  skuIds: readonly string[],
): string[] {
  if (slotCount <= 0 || skuIds.length === 0) return [];
  const slots: string[] = [];
  if (slotCount >= skuIds.length) {
    slots.push(...skuIds);
    let i = 0;
    while (slots.length < slotCount) {
      slots.push(skuIds[i % skuIds.length]!);
      i += 1;
    }
    return slots;
  }
  const start =
    hashSeed(`${countryId}:${classId}:subset`) % skuIds.length;
  for (let i = 0; i < slotCount; i++) {
    slots.push(skuIds[(start + i) % skuIds.length]!);
  }
  return slots;
}

function pickKind(rng: () => number): AircraftListingKind {
  const r = rng();
  if (r < 0.3) return 'new';
  if (r < 0.75) return 'used';
  return 'lease';
}

function pickCondition(
  rng: () => number,
  kind: AircraftListingKind,
): AirframeCondition {
  if (kind === 'new') return 'excellent';
  const r = rng();
  if (r < 0.22) return 'excellent';
  if (r < 0.52) return 'good';
  if (r < 0.78) return 'fair';
  return 'tired';
}

function hoursFor(
  rng: () => number,
  kind: AircraftListingKind,
  condition: AirframeCondition,
): { hoursAirframe: number; hoursEngine: number } {
  if (kind === 'new') {
    const h = Math.round(rng() * 120);
    return { hoursAirframe: h, hoursEngine: h };
  }
  const base =
    condition === 'excellent'
      ? rng() * 800
      : condition === 'good'
        ? 800 + rng() * 1_500
        : condition === 'fair'
          ? 3_000 + rng() * 3_500
          : 6_000 + rng() * 5_000;
  const hoursAirframe = Math.round(base);
  const hoursEngine = Math.round(base * (0.55 + rng() * 0.4));
  return { hoursAirframe, hoursEngine };
}

type PoolAirport = CareerEconomyWorld['airports'][number];

function countryHubs(
  world: CareerEconomyWorld,
  countryId: string,
): PoolAirport[] {
  return world.airports.filter(
    (a) =>
      !isBushHub(a.icao) &&
      countryIdFromRegion(a.region ?? '') === countryId,
  );
}

function pickHubFromCandidates(
  hubs: readonly PoolAirport[],
  rng: () => number,
): string {
  if (hubs.length === 0) return 'SBGR';
  const majors = hubs.filter((a) => hubTierOf(a) === 'major');
  const regionals = hubs.filter((a) => hubTierOf(a) === 'regional');
  const spokes = hubs.filter((a) => hubTierOf(a) === 'spoke');
  const pool = [...majors, ...majors, ...regionals, ...spokes.slice(0, 6)];
  return pick(rng, pool.length > 0 ? pool : hubs).icao;
}

/** Flatten SE dominance without zeroing thin regions (North still gets tickets). */
export function regionSpawnWeight(hubCount: number): number {
  return Math.max(1, Math.sqrt(Math.max(0, hubCount)));
}

export function listCountrySubregions(
  world: CareerEconomyWorld,
  countryId: string,
): string[] {
  const seen = new Set<string>();
  for (const ap of countryHubs(world, countryId)) {
    const region = (ap.region ?? '').trim().toUpperCase();
    if (region) seen.add(region);
  }
  return [...seen].sort();
}

function pickBasedIcaoInRegion(
  world: CareerEconomyWorld,
  countryId: string,
  region: string,
  rng: () => number,
): string {
  const want = region.trim().toUpperCase();
  const hubs = countryHubs(world, countryId).filter(
    (a) => (a.region ?? '').trim().toUpperCase() === want,
  );
  if (hubs.length === 0) return pickBasedIcao(world, countryId, rng);
  return pickHubFromCandidates(hubs, rng);
}

function pickBasedIcao(
  world: CareerEconomyWorld,
  countryId: string,
  rng: () => number,
): string {
  const hubs = countryHubs(world, countryId);
  if (hubs.length === 0) {
    return world.airports.find((a) => !isBushHub(a.icao))?.icao ?? 'SBGR';
  }
  const byRegion = new Map<string, PoolAirport[]>();
  for (const ap of hubs) {
    const region =
      (ap.region ?? '').trim().toUpperCase() || countryId.toUpperCase();
    const list = byRegion.get(region) ?? [];
    list.push(ap);
    byRegion.set(region, list);
  }
  const regions = [...byRegion.keys()];
  if (regions.length === 1) {
    return pickHubFromCandidates(hubs, rng);
  }
  let total = 0;
  const weights = regions.map((region) => {
    const w = regionSpawnWeight(byRegion.get(region)!.length);
    total += w;
    return w;
  });
  let roll = rng() * total;
  let chosen = regions[0]!;
  for (let i = 0; i < regions.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) {
      chosen = regions[i]!;
      break;
    }
  }
  return pickHubFromCandidates(byRegion.get(chosen) ?? hubs, rng);
}

function priceInstance(
  kind: AircraftListingKind,
  classId: FreighterClassId,
  condition: AirframeCondition,
  basedIcao: string,
  world: CareerEconomyWorld,
  rng: () => number,
  maxCargoKg?: number,
): {
  askingUsd: number;
  leaseMonthlyUsd?: number;
  leaseTermMonths?: number;
} {
  const msrp = resolveAircraftMsrpUsd({ aircraftClassId: classId, maxCargoKg });
  const monthly = resolveAircraftLeaseWeeklyUsd({
    aircraftClassId: classId,
    maxCargoKg,
  });
  const ap = world.airports.find((a) => a.icao === basedIcao);
  const spokeDiscount =
    hubTierOf(ap ?? { icao: basedIcao, hubTier: 'spoke' }) === 'spoke'
      ? 0.94
      : 1;

  if (kind === 'lease') {
    const entryWeeks = 4;
    const roll = rng();
    const termMonths = roll < 0.4 ? 1 : roll < 0.75 ? 2 : 3;
    return {
      askingUsd: Math.round(monthly * entryWeeks),
      leaseMonthlyUsd: monthly,
      leaseTermMonths: termMonths,
    };
  }
  if (kind === 'new') {
    const noise = 0.97 + rng() * 0.06;
    return { askingUsd: Math.round(msrp * noise * spokeDiscount) };
  }
  const noise = 0.94 + rng() * 0.1;
  return {
    askingUsd: Math.round(
      msrp * CONDITION_PRICE_MULT[condition] * noise * spokeDiscount,
    ),
  };
}

function spawnDealerInstance(opts: {
  world: CareerEconomyWorld;
  countryId: string;
  airframeTypeId: string;
  aircraftClassId: FreighterClassId;
  seq: number;
  usedRegistrations: Set<string>;
  rng: () => number;
  preferIcao?: string;
  /** Force base (GA sub-region floor). */
  basedIcao?: string;
  availableAtTick?: number;
}): AircraftInstance {
  const forced = opts.basedIcao?.trim().toUpperCase();
  const prefer = opts.preferIcao?.trim().toUpperCase();
  const preferOk =
    prefer &&
    opts.world.airports.some(
      (a) =>
        a.icao.toUpperCase() === prefer &&
        countryIdFromRegion(a.region ?? '') === opts.countryId &&
        !isBushHub(a.icao),
    );
  const basedIcao =
    forced ||
    (preferOk && opts.rng() < 0.65
      ? prefer!
      : pickBasedIcao(opts.world, opts.countryId, opts.rng));
  const kind = pickKind(opts.rng);
  const condition = pickCondition(opts.rng, kind);
  const hours = hoursFor(opts.rng, kind, condition);
  const pcts = conditionPctsForListing(condition, kind, opts.rng);
  const registration = allocateAircraftRegistration({
    countryId: opts.countryId,
    used: opts.usedRegistrations,
    rng: opts.rng,
    seedHint: `${opts.countryId}_${opts.airframeTypeId}_${opts.seq}`,
  });
  return {
    id: `acinst_${opts.countryId}_${opts.airframeTypeId}_${opts.seq}`,
    airframeTypeId: opts.airframeTypeId,
    aircraftClassId: opts.aircraftClassId,
    countryId: opts.countryId,
    basedIcao,
    registration,
    kind,
    condition,
    hoursAirframe: hours.hoursAirframe,
    hoursEngine: hours.hoursEngine,
    airframeConditionPct: pcts.airframeConditionPct,
    engineConditionPct: pcts.engineConditionPct,
    status: 'available',
    seededAtTick: opts.world.tick,
    ...(opts.availableAtTick != null
      ? { availableAtTick: opts.availableAtTick }
      : {}),
  };
}

/** After a dealer trade-in: another unit of the same SKU in the same country. */
export function restockDealerAirframe(opts: {
  world: CareerEconomyWorld;
  countryId: string;
  airframeTypeId: string;
  aircraftClassId: FreighterClassId;
  preferIcao?: string;
  availableAtTick: number;
  usedRegistrations: Set<string>;
}): AircraftInstance {
  const rng = mulberry32(
    hashSeed(
      `${opts.world.seed}:acf-pool:restock:${opts.countryId}:${opts.airframeTypeId}:${opts.world.tick}`,
    ),
  );
  const seq = (opts.world.aircraftInstances?.length ?? 0) + 1;
  const inst = spawnDealerInstance({
    world: opts.world,
    countryId: opts.countryId,
    airframeTypeId: opts.airframeTypeId,
    aircraftClassId: opts.aircraftClassId,
    seq,
    usedRegistrations: opts.usedRegistrations,
    rng,
    preferIcao: opts.preferIcao,
    availableAtTick: opts.availableAtTick,
  });
  inst.id = `acinst_rs_${opts.countryId}_${opts.airframeTypeId}_${opts.world.tick}_${seq}`;
  opts.world.aircraftInstances = [
    ...(opts.world.aircraftInstances ?? []),
    inst,
  ];
  return inst;
}

/** Internal priced fields stored on listing conversion only — instances stay lean. */
type PricedInstanceFields = {
  askingUsd: number;
  leaseMonthlyUsd?: number;
  leaseTermMonths?: number;
};

function pricedFieldsForInstance(
  world: CareerEconomyWorld,
  instance: AircraftInstance,
  rng: () => number,
): PricedInstanceFields {
  const airframe = findCareerPlayerAirframe(instance.airframeTypeId);
  return priceInstance(
    instance.kind,
    instance.aircraftClassId,
    instance.condition,
    instance.basedIcao,
    world,
    rng,
    airframe?.maxCargoKg,
  );
}

export function seedWorldAircraftPool(world: CareerEconomyWorld): AircraftInstance[] {
  const used = new Set<string>();
  const instances: AircraftInstance[] = [];
  const countries = listCountryHubRows(world);
  const rng = mulberry32(hashSeed(`${world.seed}:acf-pool:seed`));
  let seq = 0;
  const gaFloorLeft = new Map<string, string[]>();

  function takeGaFloorBasedIcao(countryId: string): string | undefined {
    let left = gaFloorLeft.get(countryId);
    if (!left) {
      left = listCountrySubregions(world, countryId);
      gaFloorLeft.set(countryId, left);
    }
    const region = left.shift();
    if (!region) return undefined;
    return pickBasedIcaoInRegion(world, countryId, region, rng);
  }

  for (const classId of CLASS_ORDER) {
    const skus = listCareerPlayerAirframes(classId).map((a) => a.typeId);
    if (skus.length === 0) continue;

    const countryCaps = countries
      .map((row) => ({
        countryId: row.countryId,
        remaining: countryAircraftClassCap(row.hubCount, classId, skus.length),
      }))
      .filter((row) => row.remaining > 0);

    const sumCaps = countryCaps.reduce((sum, row) => sum + row.remaining, 0);
    const minPerSku = CLASS_GLOBAL_MIN_PER_SKU[classId] ?? 1;
    // Inflate when country caps alone cannot meet the per-SKU worldwide quota.
    const totalSlots = Math.max(sumCaps, skus.length * minPerSku);
    const targets = distributeEqualQuota(totalSlots, skus);
    const assignments: { countryId: string; airframeTypeId: string }[] = [];

    for (const row of countryCaps) {
      if (row.remaining < skus.length) continue;
      for (const sku of skus) {
        assignments.push({ countryId: row.countryId, airframeTypeId: sku });
        targets.set(sku, Math.max(0, (targets.get(sku) ?? 0) - 1));
        row.remaining -= 1;
      }
    }

    for (const row of countryCaps) {
      while (row.remaining > 0) {
        let pick = skus[0]!;
        let best = -1;
        for (const sku of skus) {
          const left = targets.get(sku) ?? 0;
          if (left > best) {
            best = left;
            pick = sku;
          }
        }
        if (best <= 0) {
          pick = skus[assignments.length % skus.length]!;
        }
        assignments.push({ countryId: row.countryId, airframeTypeId: pick });
        targets.set(pick, Math.max(0, (targets.get(pick) ?? 0) - 1));
        row.remaining -= 1;
      }
    }

    const hosts =
      countryCaps.length > 0
        ? countryCaps.map((row) => row.countryId)
        : listSkuFloorHosts(countries, classId, skus.length);
    let hostIdx = 0;
    for (const [sku, left] of targets) {
      for (let i = 0; i < left; i++) {
        assignments.push({
          countryId: hosts[hostIdx % hosts.length]!,
          airframeTypeId: sku,
        });
        hostIdx += 1;
      }
    }

    for (const slot of assignments) {
      seq += 1;
      const floorIcao =
        classId === 'light_ga'
          ? takeGaFloorBasedIcao(slot.countryId)
          : undefined;
      instances.push(
        spawnDealerInstance({
          world,
          countryId: slot.countryId,
          airframeTypeId: slot.airframeTypeId,
          aircraftClassId: classId,
          seq,
          usedRegistrations: used,
          rng,
          ...(floorIcao ? { basedIcao: floorIcao } : {}),
        }),
      );
    }
  }

  return instances;
}

export function collectPoolRegistrations(
  world: Pick<CareerEconomyWorld, 'aircraftInstances'>,
): Set<string> {
  const used = new Set<string>();
  for (const inst of world.aircraftInstances ?? []) {
    if (inst.status !== 'available') continue;
    if (inst.registration) used.add(inst.registration);
  }
  return used;
}

export function ensureWorldAircraftPool(world: CareerEconomyWorld): boolean {
  if ((world.aircraftInstances?.length ?? 0) > 0) return false;
  world.aircraftInstances = seedWorldAircraftPool(world);
  world.aircraftPoolCatalogHash = hashCareerPlayerAirframeCatalog();
  return true;
}

function countAvailableBySku(
  instances: AircraftInstance[],
  countryId: string,
  classId: FreighterClassId,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const inst of instances) {
    if (inst.status !== 'available') continue;
    if (inst.countryId !== countryId) continue;
    if (inst.aircraftClassId !== classId) continue;
    out.set(inst.airframeTypeId, (out.get(inst.airframeTypeId) ?? 0) + 1);
  }
  return out;
}

function listSkuFloorHosts(
  countries: CountryHubRow[],
  classId: FreighterClassId,
  skuCount: number,
): string[] {
  const eligible = countries
    .filter(
      (row) => countryAircraftClassCap(row.hubCount, classId, skuCount) > 0,
    )
    .map((row) => row.countryId);
  if (eligible.length > 0) return eligible;
  const fallback = countries[0]?.countryId ?? 'BR';
  return [fallback];
}

/**
 * Every enabled player airframe reaches CLASS_GLOBAL_MIN_PER_SKU instances
 * worldwide (sold/available both count — buy does not auto-respawn).
 */
export function ensureDealerSkuFloor(
  world: CareerEconomyWorld,
  state?: Pick<CareerMissionsState, 'fleet' | 'aircraftMarket'>,
): boolean {
  ensureWorldAircraftPool(world);
  const used = collectPoolRegistrations(world);
  for (const inst of world.aircraftInstances ?? []) {
    if (inst.registration) used.add(inst.registration);
  }
  if (state) {
    for (const reg of collectUsedAircraftRegistrationsFromState(state)) {
      used.add(reg);
    }
  }
  const countries = listCountryHubRows(world);
  const rng = mulberry32(
    hashSeed(`${world.seed}:acf-pool:sku-floor:${world.tick}`),
  );
  const instances = [...(world.aircraftInstances ?? [])];
  const counts = new Map<string, number>();
  for (const inst of instances) {
    counts.set(inst.airframeTypeId, (counts.get(inst.airframeTypeId) ?? 0) + 1);
  }
  let added = 0;
  let hostIdx = 0;

  for (const classId of CLASS_ORDER) {
    const skus = listCareerPlayerAirframes(classId).map((a) => a.typeId);
    if (skus.length === 0) continue;
    const minPerSku = CLASS_GLOBAL_MIN_PER_SKU[classId] ?? 1;
    const hosts = listSkuFloorHosts(countries, classId, skus.length);
    for (const sku of skus) {
      let have = counts.get(sku) ?? 0;
      while (have < minPerSku) {
        const inst = spawnDealerInstance({
          world,
          countryId: hosts[hostIdx % hosts.length]!,
          airframeTypeId: sku,
          aircraftClassId: classId,
          seq: instances.length + added + 1,
          usedRegistrations: used,
          rng,
        });
        hostIdx += 1;
        instances.push(inst);
        have += 1;
        counts.set(sku, have);
        added += 1;
      }
    }
  }

  if (added > 0) world.aircraftInstances = instances;
  return added > 0;
}

/** Incremental backfill when homolog adds/enables SKUs (no delete/rebalance). */
function remigratePoolAirframeTypeIds(world: CareerEconomyWorld): boolean {
  let changed = false;
  for (const inst of world.aircraftInstances ?? []) {
    const canonical = findCareerPlayerAirframe(inst.airframeTypeId);
    if (!canonical || canonical.typeId === inst.airframeTypeId) continue;
    inst.airframeTypeId = canonical.typeId;
    changed = true;
  }
  return changed;
}

export function ensureAircraftPoolCatalogSync(
  world: CareerEconomyWorld,
  state?: Pick<CareerMissionsState, 'fleet' | 'aircraftMarket'>,
): boolean {
  ensureWorldAircraftPool(world);
  let changed = remigratePoolAirframeTypeIds(world);
  const hash = hashCareerPlayerAirframeCatalog();
  let added = 0;

  if (world.aircraftPoolCatalogHash !== hash) {
    const used = collectPoolRegistrations(world);
    if (state) {
      for (const reg of collectUsedAircraftRegistrationsFromState(state)) {
        used.add(reg);
      }
    }
    const rng = mulberry32(
      hashSeed(`${world.seed}:acf-pool:sync:${hash}`),
    );
    const instances = [...(world.aircraftInstances ?? [])];
    const countries = listCountryHubRows(world);

    for (const classId of CLASS_ORDER) {
      const skus = listCareerPlayerAirframes(classId).map((a) => a.typeId);
      if (skus.length === 0) continue;

      for (const row of countries) {
        const cap = countryAircraftClassCap(row.hubCount, classId, skus.length);
        if (cap < skus.length) continue;
        const have = countAvailableBySku(instances, row.countryId, classId);
        for (const sku of skus) {
          if ((have.get(sku) ?? 0) >= 1) continue;
          const inst = spawnDealerInstance({
            world,
            countryId: row.countryId,
            airframeTypeId: sku,
            aircraftClassId: classId,
            seq: instances.length + added + 1,
            usedRegistrations: used,
            rng,
          });
          instances.push(inst);
          have.set(sku, 1);
          added += 1;
        }
      }
    }

    world.aircraftInstances = instances;
    world.aircraftPoolCatalogHash = hash;
  }

  if (ensureDealerSkuFloor(world, state)) added += 1;
  return added > 0 || changed;
}

function collectUsedAircraftRegistrationsFromState(
  state: Pick<CareerMissionsState, 'fleet' | 'aircraftMarket'>,
): Set<string> {
  const used = new Set<string>();
  for (const aircraft of state.fleet) {
    const reg = aircraft.registration?.trim().toUpperCase();
    if (reg) used.add(reg);
  }
  for (const listing of state.aircraftMarket ?? []) {
    if (listing.status === 'expired' || listing.status === 'sold') continue;
    const reg = listing.registration?.trim().toUpperCase();
    if (reg) used.add(reg);
  }
  return used;
}

export function resolveMarketCountryId(
  world: CareerEconomyWorld,
  state: Pick<CareerMissionsState, 'homeHubIcao'>,
): string {
  if (state.homeHubIcao?.trim()) {
    const ap = world.airports.find(
      (a) => a.icao.toUpperCase() === state.homeHubIcao.trim().toUpperCase(),
    );
    if (ap?.region) return countryIdFromRegion(ap.region);
  }
  return world.homeCountryId ?? 'BR';
}

export const AIRCRAFT_MARKET_BROWSE_WORLD = 'WORLD';

export function dealerInstancesForMarket(
  world: CareerEconomyWorld,
  countryId: string,
  economyTick = world.tick,
): AircraftInstance[] {
  return (world.aircraftInstances ?? []).filter(
    (inst) =>
      inst.status === 'available' &&
      inst.countryId === countryId.toUpperCase() &&
      (inst.availableAtTick == null || economyTick >= inst.availableAtTick),
  );
}

/** All available dealer stock across every country (worldwide browse). */
export function dealerInstancesWorldwide(
  world: CareerEconomyWorld,
  economyTick = world.tick,
): AircraftInstance[] {
  return (world.aircraftInstances ?? []).filter(
    (inst) =>
      inst.status === 'available' &&
      (inst.availableAtTick == null || economyTick >= inst.availableAtTick),
  );
}

export function dealerPoolCountryCounts(
  world: CareerEconomyWorld,
  economyTick = world.tick,
): { countryId: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const inst of world.aircraftInstances ?? []) {
    if (inst.status !== 'available') continue;
    if (inst.availableAtTick != null && economyTick < inst.availableAtTick) {
      continue;
    }
    const id = inst.countryId.toUpperCase();
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([countryId, count]) => ({ countryId, count }))
    .sort((a, b) => b.count - a.count || a.countryId.localeCompare(b.countryId));
}

export function instanceToListing(
  world: CareerEconomyWorld,
  instance: AircraftInstance,
  economyTick: number,
): AircraftListing {
  const airframe = findCareerPlayerAirframe(instance.airframeTypeId);
  const rng = mulberry32(hashSeed(`${world.seed}:price:${instance.id}`));
  const priced = pricedFieldsForInstance(world, instance, rng);
  const ap = world.airports.find(
    (a) => a.icao.toUpperCase() === instance.basedIcao.trim().toUpperCase(),
  );
  return {
    id: instance.id,
    kind: instance.kind,
    aircraftClassId: instance.aircraftClassId,
    airframeTypeId: airframe?.typeId ?? instance.airframeTypeId,
    label: airframe?.label ?? instance.airframeTypeId,
    registration: instance.registration,
    basedIcao: instance.basedIcao,
    countryId: instance.countryId,
    region: ap?.region,
    askingUsd: Math.max(500, priced.askingUsd),
    leaseMonthlyUsd: priced.leaseMonthlyUsd,
    leaseTermMonths: priced.leaseTermMonths,
    condition: instance.condition,
    hoursAirframe: instance.hoursAirframe,
    hoursEngine: instance.hoursEngine,
    airframeConditionPct: instance.airframeConditionPct,
    engineConditionPct: instance.engineConditionPct,
    expiresAtTick: economyTick + LISTING_LIFE_TICKS,
    status: 'available',
    source: 'generated',
  };
}

export function markDealerInstanceSold(
  world: CareerEconomyWorld,
  instanceId: string,
): boolean {
  const inst = world.aircraftInstances?.find((row) => row.id === instanceId);
  if (!inst || inst.status !== 'available') return false;
  inst.status = 'sold';
  return true;
}

/**
 * Option B: player sale bought by NPC — same airframe becomes dealer stock
 * (registration / hours / condition kept). Does not inflate the country pool.
 */
export function ingestPlayerAircraftToDealerPool(opts: {
  world: CareerEconomyWorld;
  aircraft: PlayerAircraft;
  countryId: string;
}): AircraftInstance {
  ensureWorldAircraftPool(opts.world);
  const used = collectPoolRegistrations(opts.world);
  const registration =
    opts.aircraft.registration?.trim().toUpperCase() ||
    allocateAircraftRegistration({
      countryId: opts.countryId,
      used,
      seedHint: `ingest_${opts.aircraft.id}`,
    });
  used.add(registration);
  const seq = (opts.world.aircraftInstances?.length ?? 0) + 1;
  const basedIcao = (
    opts.aircraft.locationIcao ||
    pickBasedIcao(opts.world, opts.countryId, () => 0.5)
  ).toUpperCase();
  const inst: AircraftInstance = {
    id: `acinst_npc_${opts.countryId}_${opts.aircraft.id}_${seq}`,
    airframeTypeId: opts.aircraft.airframeTypeId ?? opts.aircraft.aircraftClassId,
    aircraftClassId: opts.aircraft.aircraftClassId,
    countryId: opts.countryId.toUpperCase(),
    basedIcao,
    registration,
    kind: 'used',
    condition: opts.aircraft.condition ?? 'good',
    hoursAirframe: opts.aircraft.hoursAirframe ?? 0,
    hoursEngine: opts.aircraft.hoursEngine ?? 0,
    airframeConditionPct: opts.aircraft.airframeConditionPct,
    engineConditionPct: opts.aircraft.engineConditionPct,
    status: 'available',
    seededAtTick: opts.world.tick,
  };
  opts.world.aircraftInstances = [
    ...(opts.world.aircraftInstances ?? []),
    inst,
  ];
  return inst;
}

export function countInstancesBySkuGlobally(
  world: CareerEconomyWorld,
  classId: FreighterClassId,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const inst of world.aircraftInstances ?? []) {
    if (inst.status !== 'available') continue;
    if (inst.aircraftClassId !== classId) continue;
    out.set(inst.airframeTypeId, (out.get(inst.airframeTypeId) ?? 0) + 1);
  }
  return out;
}
