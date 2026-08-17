/**
 * French Polynesia career hub catalog — Asia-16 East Pacific face.
 *
 * Papeete cargo major is NTAA Faa'a (not Bora Bora NTTB).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type PfCareerRegion = 'PF-I';

export type PfCareerHubDef = {
  icao: string;
  name: string;
  region: PfCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated French Polynesia hub. Papeete seaport pickup is NTAA. */
export const PF_CAREER_HUBS: readonly PfCareerHubDef[] = [
  {
    icao: 'NTAA',
    name: "Papeete Faa'a",
    region: 'PF-I',
    hubTier: 'major',
    lat: -17.5535,
    lon: -149.6069,
    produce: { perishables: 1.3, general: 1.3, supplies: 1.1 },
    consume: { electronics: 1.05, machinery: 1.0, fuel: 1.2 },
  },
];

export const PF_CAREER_HUB_COUNT = 1;

export function buildPfFeederCorridors(
  hubs: readonly PfCareerHubDef[] = PF_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertPfCareerHubCatalog(): void {
  if (PF_CAREER_HUBS.length !== PF_CAREER_HUB_COUNT) {
    throw new Error(
      `PF_CAREER_HUBS length ${PF_CAREER_HUBS.length} !== ${PF_CAREER_HUB_COUNT}`,
    );
  }
  if (!PF_CAREER_HUBS.some((h) => h.icao === 'NTAA' && h.hubTier === 'major')) {
    throw new Error('PF catalog must include major NTAA (Faa\'a)');
  }
  if (PF_CAREER_HUBS.some((h) => h.icao === 'NTTB')) {
    throw new Error('PF catalog must not seed NTTB Bora Bora as the cargo major');
  }
}
