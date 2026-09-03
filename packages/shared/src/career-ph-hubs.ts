/**
 * Philippines career hub catalog — Asia-12 Luzon / Visayas / Mindanao face.
 *
 * Manila cargo major is RPLL Ninoy Aquino. Cagayan de Oro civil is RPMY
 * Laguindingan (not closed RPML Lumbia). Subic RPLB and Palawan RPVP deferred.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { PH_DENSIFY_HUBS, PH_DENSIFY_HUB_COUNT } from './career-ph-hubs-densify.js';

export type PhCareerRegion = 'PH-L' | 'PH-V' | 'PH-M';

export type PhCareerHubDef = {
  icao: string;
  name: string;
  region: PhCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 5 curated Philippines hubs. Manila port pickup is RPLL; Cebu is RPVM. */
export const PH_CAREER_HUBS: readonly PhCareerHubDef[] = [
  {
    icao: 'RPLL',
    name: 'Manila Ninoy Aquino',
    region: 'PH-L',
    hubTier: 'major',
    lat: 14.5086,
    lon: 121.02,
    produce: { electronics: 1.5, general: 1.5, machinery: 1.3 },
    consume: { perishables: 1.25, supplies: 1.2, general: 1.05, fuel: 1.25 },
  },
  {
    icao: 'RPLC',
    name: 'Clark International',
    region: 'PH-L',
    hubTier: 'regional',
    lat: 15.186,
    lon: 120.56,
    produce: { general: 1.3, electronics: 1.2, supplies: 1.1 },
    consume: { perishables: 1.15, machinery: 1.0, fuel: 1.1 },
  },
  {
    icao: 'RPVM',
    name: 'Mactan Cebu International',
    region: 'PH-V',
    hubTier: 'regional',
    lat: 10.3093,
    lon: 123.9797,
    produce: { electronics: 1.35, general: 1.35, perishables: 1.15 },
    consume: { machinery: 1.05, supplies: 1.15, fuel: 1.2 },
  },
  {
    icao: 'RPMD',
    name: 'Davao Francisco Bangoy',
    region: 'PH-M',
    hubTier: 'regional',
    lat: 7.1255,
    lon: 125.646,
    produce: { perishables: 1.3, general: 1.3, supplies: 1.15 },
    consume: { electronics: 1.05, machinery: 1.0, fuel: 1.15 },
  },
  {
    icao: 'RPMY',
    name: 'Laguindingan International',
    region: 'PH-M',
    hubTier: 'regional',
    lat: 8.6122,
    lon: 124.4565,
    produce: { general: 1.2, perishables: 1.2, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.1 },
  },
  ...PH_DENSIFY_HUBS,
];

export const PH_CAREER_HUB_COUNT = 5 + PH_DENSIFY_HUB_COUNT;

export function buildPhFeederCorridors(
  hubs: readonly PhCareerHubDef[] = PH_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertPhCareerHubCatalog(): void {
  if (PH_CAREER_HUBS.length !== PH_CAREER_HUB_COUNT) {
    throw new Error(
      `PH_CAREER_HUBS length ${PH_CAREER_HUBS.length} !== ${PH_CAREER_HUB_COUNT}`,
    );
  }
  if (!PH_CAREER_HUBS.some((h) => h.icao === 'RPLL' && h.hubTier === 'major')) {
    throw new Error('PH catalog must include major RPLL (Ninoy Aquino)');
  }
  if (!PH_CAREER_HUBS.some((h) => h.icao === 'RPVM')) {
    throw new Error('PH catalog must include RPVM Mactan Cebu (port pickup)');
  }
  if (!PH_CAREER_HUBS.some((h) => h.icao === 'RPMY')) {
    throw new Error('PH catalog must include RPMY Laguindingan (not RPML)');
  }
  if (PH_CAREER_HUBS.some((h) => ['RPML', 'RPLB', 'RPVP'].includes(h.icao))) {
    throw new Error('PH catalog must not seed RPML Lumbia, RPLB Subic, or RPVP');
  }
}
