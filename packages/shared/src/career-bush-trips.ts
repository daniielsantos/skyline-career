/**
 * Unified bush trips — Activities-style arcs over soft-field bush hubs / tour spokes / bushTripOnly locals.
 * Market freights no longer form on bush ODs; payload rides on trip legs.
 * Playable only when `msfsValidated` (manual MSFS 2024 check).
 */

import {
  type BushCountryId,
} from './career-bush.js';
import { BR_CAREER_HUBS } from './career-br-hubs.js';
import { CA_CAREER_HUBS } from './career-ca-hubs.js';
import { MX_CAREER_HUBS } from './career-mx-hubs.js';
import { US_CAREER_HUBS } from './career-us-hubs.js';
import { US_BUSH_TRIP_STUBS } from './career-bush-trips-us.js';
import { countryIdFromRegion } from './career-partition.js';

export type BushWaypoint = {
  lat: number;
  lon: number;
  name?: string;
};

export type BushTripLeg = {
  id: string;
  fromIcao: string;
  toIcao: string;
  /** Intermediate VFR points between airports (may be empty until curated). */
  waypoints: readonly BushWaypoint[];
  /** Great-circle NM; derived from hub coords when omitted. */
  distanceNm?: number;
  /** 0 = deadhead. */
  cargoKg: number;
  /** Per-leg MSFS strip check; trip playable requires all true (or trip flag). */
  msfsValidated?: boolean;
};

export type BushTripDef = {
  id: string;
  title: string;
  countryId: BushCountryId;
  summary?: string;
  /** Always light_ga for v1. */
  aircraftHint?: 'light_ga';
  legs: readonly BushTripLeg[];
  /**
   * Whole-arc gate: set true only after manual MSFS 2024 validation.
   * Unvalidated trips are hidden from the playable list.
   */
  msfsValidated: boolean;
  /** Optional fixed payout; otherwise UI/mission may derive from cargo×legs. */
  payUsd?: number;
  /**
   * Suggested cruise (ft MSL) from Activities PLN `<CruisingAlt>`.
   * One value for the whole tour — not per leg.
   */
  cruisingAltFt?: number;
};

const ALL_HUBS = [
  ...BR_CAREER_HUBS,
  ...US_CAREER_HUBS,
  ...CA_CAREER_HUBS,
  ...MX_CAREER_HUBS,
];

const HUB_COORDS: ReadonlyMap<string, { lat: number; lon: number }> = new Map(
  ALL_HUBS.map((h) => [h.icao.toUpperCase(), { lat: h.lat, lon: h.lon }]),
);

const HUB_COUNTRY: ReadonlyMap<string, string> = new Map(
  ALL_HUBS.map((h) => [h.icao.toUpperCase(), countryIdFromRegion(h.region)]),
);

function haversineNm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const r = 3440.065;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bushTripLegDistanceNm(leg: BushTripLeg): number {
  if (
    typeof leg.distanceNm === 'number' &&
    Number.isFinite(leg.distanceNm) &&
    leg.distanceNm > 0
  ) {
    return leg.distanceNm;
  }
  const from = HUB_COORDS.get(leg.fromIcao.trim().toUpperCase());
  const to = HUB_COORDS.get(leg.toIcao.trim().toUpperCase());
  if (!from || !to) return 0;
  let nm = 0;
  let prev = from;
  for (const wp of leg.waypoints) {
    const next = { lat: wp.lat, lon: wp.lon };
    nm += haversineNm(prev, next);
    prev = next;
  }
  nm += haversineNm(prev, to);
  return Math.round(nm * 10) / 10;
}

export function bushTripTotalDistanceNm(trip: BushTripDef): number {
  return (
    Math.round(
      trip.legs.reduce((sum, leg) => sum + bushTripLegDistanceNm(leg), 0) * 10,
    ) / 10
  );
}

/** True when ICAO is any career hub (spoke/regional/major/bush) in `countryId`. */
export function isBushTripHubEndpoint(
  icao: string,
  countryId: BushCountryId,
): boolean {
  const id = icao.trim().toUpperCase();
  return HUB_COUNTRY.get(id) === countryId;
}

/**
 * Draft BR round-trip + US Activities one-way tours (PLN-collapsed catalog hubs).
 */
export const BUSH_TRIPS: readonly BushTripDef[] = [
  {
    id: 'br-rio-negro-tapuruquara',
    title: 'Rio Negro — Tapuruquara',
    countryId: 'BR',
    summary:
      'Gateway out-and-back to the Tapuruquara soft-field (SWTP). Draft route — confirm strips in MSFS 2024 before enabling.',
    aircraftHint: 'light_ga',
    /** Provisional for board smoke — re-confirm strips in MSFS 2024. */
    msfsValidated: true,
    payUsd: 4_200,
    legs: [
      {
        id: 'br-rio-negro-1',
        fromIcao: 'SBEG',
        toIcao: 'SWTP',
        waypoints: [],
        cargoKg: 180,
        msfsValidated: true,
      },
      {
        id: 'br-rio-negro-2',
        fromIcao: 'SWTP',
        toIcao: 'SBEG',
        waypoints: [],
        cargoKg: 0,
        msfsValidated: true,
      },
    ],
  },
  ...US_BUSH_TRIP_STUBS,
];

export function listBushTrips(): readonly BushTripDef[] {
  return BUSH_TRIPS;
}

export function getBushTrip(id: string): BushTripDef | undefined {
  const key = id.trim();
  return BUSH_TRIPS.find((t) => t.id === key);
}

/** Trips ready for the player board (MSFS-validated arcs only). */
export function listPlayableBushTrips(): BushTripDef[] {
  return BUSH_TRIPS.filter((t) => isBushTripPlayable(t));
}

export function isBushTripPlayable(trip: BushTripDef): boolean {
  if (!trip.msfsValidated) return false;
  if (trip.legs.length < 2) return false;
  return trip.legs.every((leg) => leg.msfsValidated !== false);
}

export function assertBushTripCatalog(
  trips: readonly BushTripDef[] = BUSH_TRIPS,
): void {
  const seen = new Set<string>();
  for (const trip of trips) {
    if (seen.has(trip.id)) {
      throw new Error(`Duplicate bush trip id ${trip.id}`);
    }
    seen.add(trip.id);

    if (trip.legs.length < 1) {
      throw new Error(`Bush trip ${trip.id} needs ≥1 leg`);
    }

    const first = trip.legs[0]!.fromIcao.trim().toUpperCase();
    const last = trip.legs[trip.legs.length - 1]!.toIcao.trim().toUpperCase();
    if (!isBushTripHubEndpoint(first, trip.countryId)) {
      throw new Error(
        `Bush trip ${trip.id} start ${first} is not a ${trip.countryId} career hub`,
      );
    }
    if (!isBushTripHubEndpoint(last, trip.countryId)) {
      throw new Error(
        `Bush trip ${trip.id} end ${last} is not a ${trip.countryId} career hub`,
      );
    }

    for (let i = 0; i < trip.legs.length; i++) {
      const leg = trip.legs[i]!;
      const from = leg.fromIcao.trim().toUpperCase();
      const to = leg.toIcao.trim().toUpperCase();
      if (i > 0) {
        const prevTo = trip.legs[i - 1]!.toIcao.trim().toUpperCase();
        if (from !== prevTo) {
          throw new Error(
            `Bush trip ${trip.id} leg ${leg.id} breaks chain (${prevTo}→${from})`,
          );
        }
      }
      for (const icao of [from, to]) {
        if (!isBushTripHubEndpoint(icao, trip.countryId)) {
          throw new Error(
            `Bush trip ${trip.id} leg ${leg.id}: ${icao} is not a ${trip.countryId} career hub`,
          );
        }
      }
      if (!Number.isFinite(leg.cargoKg) || leg.cargoKg < 0) {
        throw new Error(`Bush trip ${trip.id} leg ${leg.id}: bad cargoKg`);
      }
    }
  }
}
