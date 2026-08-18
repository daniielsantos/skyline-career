/**
 * Gabon career hub catalog — AF-4 Central Africa / Congo basin.
 *
 * Libreville cargo major is FOOL Léon M'ba. Port-Gentil FOOG is the oil coast.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type GaCareerRegion = 'GA-N' | 'GA-W';

export type GaCareerHubDef = {
  icao: string;
  name: string;
  region: GaCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Gabon hubs. Libreville is FOOL; Port-Gentil is FOOG. */
export const GA_CAREER_HUBS: readonly GaCareerHubDef[] = [
  {
    icao: 'FOOL',
    name: "Libreville Léon M'ba",
    region: 'GA-N',
    hubTier: 'major',
    lat: 0.459,
    lon: 9.4121,
    produce: { general: 1.35, electronics: 1.2, perishables: 1.15 },
    consume: { machinery: 1.0, supplies: 1.15, fuel: 1.15 },
  },
  {
    icao: 'FOOG',
    name: 'Port-Gentil International',
    region: 'GA-W',
    hubTier: 'regional',
    lat: -0.7117,
    lon: 8.7544,
    produce: { machinery: 1.3, general: 1.25, supplies: 1.15 },
    consume: { perishables: 1.1, electronics: 0.95, fuel: 1.15 },
  },
];

export const GA_CAREER_HUB_COUNT = 2;

export function buildGaFeederCorridors(
  hubs: readonly GaCareerHubDef[] = GA_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertGaCareerHubCatalog(): void {
  if (GA_CAREER_HUBS.length !== GA_CAREER_HUB_COUNT) {
    throw new Error(
      `GA_CAREER_HUBS length ${GA_CAREER_HUBS.length} !== ${GA_CAREER_HUB_COUNT}`,
    );
  }
  if (!GA_CAREER_HUBS.some((h) => h.icao === 'FOOL' && h.hubTier === 'major')) {
    throw new Error("GA catalog must include major FOOL (Léon M'ba)");
  }
  if (!GA_CAREER_HUBS.some((h) => h.icao === 'FOOG')) {
    throw new Error('GA catalog must include FOOG Port-Gentil');
  }
}
