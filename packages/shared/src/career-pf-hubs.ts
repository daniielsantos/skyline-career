/**
 * French Polynesia career hub catalog — Tahiti + Bora Bora.
 *
 * Papeete cargo major is NTAA Faa'a; Bora Bora is NTTB.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type PfCareerRegion = 'PF-I' | 'PF-L';

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

/** 2 curated French Polynesia hubs — Tahiti (PF-I) + Bora Bora (PF-L). */
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
  {
    icao: 'NTTB',
    name: 'Bora Bora',
    region: 'PF-L',
    hubTier: 'major',
    lat: -16.4443,
    lon: -151.7513,
    produce: { perishables: 1.35, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.15 },
  },
];

export const PF_CAREER_HUB_COUNT = 2;

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
  if (!PF_CAREER_HUBS.some((h) => h.icao === 'NTTB' && h.hubTier === 'major')) {
    throw new Error('PF catalog must include major NTTB (Bora Bora)');
  }
}
