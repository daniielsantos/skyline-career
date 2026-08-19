/**
 * Unique tail numbers / registrations for player fleet and market listings.
 */

import { airportByIcao, type CareerEconomyWorld } from './career-economy.js';
import { countryIdFromRegion, inferHomeCountryId } from './career-partition.js';
import type { AircraftListing, CareerMissionsState } from './types/career-economy.js';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeAircraftRegistration(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const compact = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (compact.length < 3 || compact.length > 12) return null;
  if (!/^[A-Z0-9-]+$/.test(compact)) return null;
  return compact;
}

export function collectUsedAircraftRegistrations(
  state: Pick<CareerMissionsState, 'fleet' | 'aircraftMarket'>,
): Set<string> {
  const used = new Set<string>();
  for (const aircraft of state.fleet) {
    const reg = normalizeAircraftRegistration(aircraft.registration);
    if (reg) used.add(reg);
  }
  for (const listing of state.aircraftMarket ?? []) {
    if (listing.status === 'expired' || listing.status === 'sold') continue;
    const reg = normalizeAircraftRegistration(listing.registration);
    if (reg) used.add(reg);
  }
  return used;
}

/** Country for registration format — airport region when world is available. */
export function countryIdForHubIcao(
  icao: string,
  world?: Pick<CareerEconomyWorld, 'airports' | 'homeCountryId'>,
): string {
  const code = icao.trim().toUpperCase();
  if (world) {
    const ap = airportByIcao(world, code);
    if (ap?.region) return countryIdFromRegion(ap.region);
    return inferHomeCountryId(world);
  }
  if (/^SB|^SD|^SS|^SW|^SN|^SI|^SJ|^SY/.test(code)) return 'BR';
  if (/^SA|^SC/.test(code)) return 'AR';
  if (/^K/.test(code)) return 'US';
  if (/^C[A-Z]/.test(code)) return 'CA';
  if (/^EG/.test(code)) return 'GB';
  if (/^LF|^L[A-Z]/.test(code)) return 'FR';
  if (/^ED|^ET/.test(code)) return 'DE';
  if (/^RJ|^RO/.test(code)) return 'JP';
  if (/^SP|^SC/.test(code)) return 'PE';
  return 'US';
}

function randomLetters(count: number, rng: () => number): string {
  let out = '';
  for (let i = 0; i < count; i++) {
    out += LETTERS[Math.floor(rng() * LETTERS.length)]!;
  }
  return out;
}

function candidateRegistration(countryId: string, rng: () => number): string {
  switch (countryId) {
    case 'BR': {
      const prefix =
        ['PR', 'PP', 'PT', 'PS'][Math.floor(rng() * 4)] ?? 'PR';
      return `${prefix}-${randomLetters(3, rng)}`;
    }
    case 'US':
      if (rng() < 0.55) {
        return `N${String(10000 + Math.floor(rng() * 89999))}`;
      }
      return `N${String(100 + Math.floor(rng() * 900))}${randomLetters(2, rng)}`;
    case 'CA':
      return `C-G${randomLetters(3, rng)}`;
    case 'GB':
      return `G-${randomLetters(4, rng)}`;
    case 'DE':
      return `D-${randomLetters(4, rng)}`;
    case 'FR':
      return `F-${randomLetters(4, rng)}`;
    default:
      return `${countryId}-${String(1000 + Math.floor(rng() * 8999))}${randomLetters(rng() < 0.5 ? 0 : 1, rng)}`;
  }
}

export function allocateAircraftRegistration(opts: {
  countryId: string;
  used: Set<string>;
  rng?: () => number;
  seedHint?: string;
}): string {
  const rng =
    opts.rng ??
    mulberry32(hashSeed(`acf-reg:${opts.countryId}:${opts.seedHint ?? 'x'}`));
  for (let attempt = 0; attempt < 512; attempt++) {
    const reg = candidateRegistration(opts.countryId, rng);
    if (!opts.used.has(reg)) {
      opts.used.add(reg);
      return reg;
    }
  }
  throw new Error(`Unable to allocate unique aircraft registration (${opts.countryId})`);
}

export function ensureAircraftRegistrations(
  state: CareerMissionsState,
  world?: Pick<CareerEconomyWorld, 'airports' | 'homeCountryId'>,
): void {
  const used = collectUsedAircraftRegistrations(state);
  const homeCountry = state.homeHubIcao
    ? countryIdForHubIcao(state.homeHubIcao, world)
    : world
      ? inferHomeCountryId(world)
      : 'BR';

  for (const aircraft of state.fleet) {
    const reg = normalizeAircraftRegistration(aircraft.registration);
    if (reg) {
      aircraft.registration = reg;
      continue;
    }
    aircraft.registration = allocateAircraftRegistration({
      countryId: countryIdForHubIcao(aircraft.locationIcao, world) || homeCountry,
      used,
      seedHint: aircraft.id,
    });
  }

  state.aircraftMarket = (state.aircraftMarket ?? []).map((listing) => {
    const existing = normalizeAircraftRegistration(listing.registration);
    if (existing) {
      return { ...listing, registration: existing };
    }
    if (listing.sellerAircraftId) {
      const seller = state.fleet.find((a) => a.id === listing.sellerAircraftId);
      const sellerReg = normalizeAircraftRegistration(seller?.registration);
      if (sellerReg && !used.has(sellerReg)) {
        used.add(sellerReg);
        return { ...listing, registration: sellerReg };
      }
    }
    const reg = allocateAircraftRegistration({
      countryId: countryIdForHubIcao(listing.basedIcao, world) || homeCountry,
      used,
      seedHint: listing.id,
    });
    return { ...listing, registration: reg };
  });
}

export function registrationForListingPurchase(
  listing: AircraftListing,
  state: CareerMissionsState,
  world?: Pick<CareerEconomyWorld, 'airports' | 'homeCountryId'>,
): string {
  const fromListing = normalizeAircraftRegistration(listing.registration);
  if (fromListing) return fromListing;
  const used = collectUsedAircraftRegistrations(state);
  return allocateAircraftRegistration({
    countryId: countryIdForHubIcao(listing.basedIcao, world),
    used,
    seedHint: listing.id,
  });
}

export function formatAircraftRegistration(
  registration: string | undefined | null,
): string | null {
  return normalizeAircraftRegistration(registration);
}
