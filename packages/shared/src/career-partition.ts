/**
 * Country / region partition helpers for world-scale career economy.
 * Domestic ticks are per country; international lanes are a sparse overlay.
 */

import type {
  CareerEconomyWorld,
  InternationalLane,
} from './types/career-economy.js';

/** `BR-SE` → `BR`, `US-SE` → `US`. Bare codes pass through uppercased. */
export function countryIdFromRegion(region: string): string {
  const raw = region.trim().toUpperCase();
  if (!raw) return 'XX';
  const dash = raw.indexOf('-');
  if (dash > 0) return raw.slice(0, dash);
  // Two-letter country already, or unknown tag.
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  return raw.slice(0, 2) || 'XX';
}

export function inferHomeCountryId(
  world: Pick<CareerEconomyWorld, 'airports' | 'homeCountryId'>,
): string {
  if (world.homeCountryId && /^[A-Z]{2}$/.test(world.homeCountryId)) {
    return world.homeCountryId;
  }
  const counts = new Map<string, number>();
  for (const ap of world.airports ?? []) {
    const id = countryIdFromRegion(ap.region ?? '');
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let best = 'BR';
  let bestN = -1;
  for (const [id, n] of counts) {
    if (n > bestN) {
      best = id;
      bestN = n;
    }
  }
  return best;
}

/** Ensure `homeCountryId` is stamped (mutate). */
export function ensureHomeCountryId(world: CareerEconomyWorld): string {
  const id = inferHomeCountryId(world);
  world.homeCountryId = id;
  return id;
}

/** Country of the airport's region (`KMIA` → `US` via `US-SE`). */
export function countryIdFromHubIcao(
  world: Pick<CareerEconomyWorld, 'airports'>,
  hubIcao: string,
): string | undefined {
  const hub = hubIcao.trim().toUpperCase();
  if (!hub) return undefined;
  const ap = (world.airports ?? []).find((a) => a.icao.toUpperCase() === hub);
  if (!ap?.region) return undefined;
  return countryIdFromRegion(ap.region);
}

/**
 * Player home partition follows the chosen starter hub's country.
 * Returns true when `homeCountryId` changed.
 */
export function syncHomeCountryFromHub(
  world: CareerEconomyWorld,
  homeHubIcao: string | undefined | null,
): boolean {
  if (!homeHubIcao?.trim()) return false;
  const id = countryIdFromHubIcao(world, homeHubIcao);
  if (!id) return false;
  if (world.homeCountryId === id) return false;
  world.homeCountryId = id;
  return true;
}

/** Distinct country ids present in the airport list. */
export function listWorldCountryIds(
  world: Pick<CareerEconomyWorld, 'airports'>,
): string[] {
  const set = new Set<string>();
  for (const ap of world.airports ?? []) {
    set.add(countryIdFromRegion(ap.region ?? ''));
  }
  return [...set].sort();
}

/** Bidirectional OD match against a curated international lane. */
export function laneMatchesOd(
  lane: Pick<InternationalLane, 'originIcao' | 'destIcao'>,
  originIcao: string,
  destIcao: string,
): boolean {
  const o = originIcao.trim().toUpperCase();
  const d = destIcao.trim().toUpperCase();
  const lo = lane.originIcao.trim().toUpperCase();
  const ld = lane.destIcao.trim().toUpperCase();
  return (lo === o && ld === d) || (lo === d && ld === o);
}

export function isDomesticOd(originRegion: string, destRegion: string): boolean {
  return countryIdFromRegion(originRegion) === countryIdFromRegion(destRegion);
}

export function findInternationalLane(
  world: Pick<CareerEconomyWorld, 'internationalLanes'>,
  originIcao: string,
  destIcao: string,
): InternationalLane | undefined {
  return (world.internationalLanes ?? []).find((lane) =>
    laneMatchesOd(lane, originIcao, destIcao),
  );
}

/** Cross-country OD is allowed only when a seeded international lane exists. */
export function isInternationalOdAllowed(
  world: Pick<CareerEconomyWorld, 'internationalLanes'>,
  originIcao: string,
  destIcao: string,
): boolean {
  return findInternationalLane(world, originIcao, destIcao) != null;
}

/** Active freight kg on an OD (both directions) for soft international caps. */
export function activeLaneKg(
  world: Pick<CareerEconomyWorld, 'lots'>,
  originIcao: string,
  destIcao: string,
): number {
  const o = originIcao.trim().toUpperCase();
  const d = destIcao.trim().toUpperCase();
  let kg = 0;
  for (const lot of world.lots ?? []) {
    if (
      lot.status !== 'available' &&
      lot.status !== 'reserved' &&
      lot.status !== 'in_transit'
    ) {
      continue;
    }
    const lo = lot.originIcao.toUpperCase();
    const ld = lot.destIcao.toUpperCase();
    if ((lo === o && ld === d) || (lo === d && ld === o)) {
      kg += lot.quantityKg;
    }
  }
  return kg;
}
