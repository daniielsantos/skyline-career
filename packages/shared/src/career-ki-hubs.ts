/**
 * Kiribati career hub catalog — Gilbert + Line Islands.
 *
 * Tarawa cargo major is NGTA Bonriki; Kiritimati is PLCH Cassidy (not NGTU).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type KiCareerRegion = 'KI-T' | 'KI-L';

export type KiCareerHubDef = {
  icao: string;
  name: string;
  region: KiCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 2 curated Kiribati hubs — Tarawa (KI-T) + Kiritimati (KI-L). */
export const KI_CAREER_HUBS: readonly KiCareerHubDef[] = [
  {
    icao: 'NGTA',
    name: 'Tarawa Bonriki',
    region: 'KI-T',
    hubTier: 'major',
    lat: 1.3816,
    lon: 173.147,
    produce: { general: 1.25, supplies: 1.2, perishables: 1.15 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.2 },
  },
  {
    icao: 'PLCH',
    name: 'Kiritimati Cassidy Field',
    region: 'KI-L',
    hubTier: 'major',
    lat: 1.9861,
    lon: -157.3498,
    produce: { perishables: 1.2, general: 1.15, supplies: 1.1 },
    consume: { electronics: 0.9, machinery: 0.85, fuel: 1.15 },
  },
];

export const KI_CAREER_HUB_COUNT = 2;

export function buildKiFeederCorridors(
  hubs: readonly KiCareerHubDef[] = KI_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertKiCareerHubCatalog(): void {
  if (KI_CAREER_HUBS.length !== KI_CAREER_HUB_COUNT) {
    throw new Error(
      `KI_CAREER_HUBS length ${KI_CAREER_HUBS.length} !== ${KI_CAREER_HUB_COUNT}`,
    );
  }
  if (!KI_CAREER_HUBS.some((h) => h.icao === 'NGTA' && h.hubTier === 'major')) {
    throw new Error('KI catalog must include major NGTA (Bonriki)');
  }
  if (!KI_CAREER_HUBS.some((h) => h.icao === 'PLCH' && h.hubTier === 'major')) {
    throw new Error('KI catalog must include major PLCH (Cassidy Field)');
  }
  if (KI_CAREER_HUBS.some((h) => h.icao === 'NGTU')) {
    throw new Error('KI catalog must not seed NGTU');
  }
}
