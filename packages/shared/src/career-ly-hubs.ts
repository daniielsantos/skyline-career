/**
 * Libya career hub catalog — MENA-5 Maghreb/Nile gap.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type LyCareerRegion = 'LY-W' | 'LY-E';

export type LyCareerHubDef = {
  icao: string;
  name: string;
  region: LyCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/**
 * 3 curated Libya hubs. Tripoli Dispatch major is HLLM (Mitiga), not closed HLLT.
 */
export const LY_CAREER_HUBS: readonly LyCareerHubDef[] = [
  {
    icao: 'HLLM',
    name: 'Tripoli Mitiga',
    region: 'LY-W',
    hubTier: 'major',
    lat: 32.8941,
    lon: 13.288,
    produce: { electronics: 1.35, general: 1.4, machinery: 1.2 },
    consume: { perishables: 1.2, supplies: 1.15, general: 1.05 },
  },
  {
    icao: 'HLMS',
    name: 'Misrata',
    region: 'LY-W',
    hubTier: 'regional',
    lat: 32.325,
    lon: 15.061,
    produce: { machinery: 1.25, general: 1.3, supplies: 1.15 },
    consume: { perishables: 1.1, electronics: 0.95, fuel: 1.1 },
  },
  {
    icao: 'HLLB',
    name: 'Benghazi Benina',
    region: 'LY-E',
    hubTier: 'major',
    lat: 32.0969,
    lon: 20.2695,
    produce: { electronics: 1.3, general: 1.35, machinery: 1.15 },
    consume: { perishables: 1.15, supplies: 1.1 },
  },
];

export const LY_CAREER_HUB_COUNT = 3;

export function buildLyFeederCorridors(
  hubs: readonly LyCareerHubDef[] = LY_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertLyCareerHubCatalog(): void {
  if (LY_CAREER_HUBS.length !== LY_CAREER_HUB_COUNT) {
    throw new Error(
      `LY_CAREER_HUBS length ${LY_CAREER_HUBS.length} !== ${LY_CAREER_HUB_COUNT}`,
    );
  }
  if (!LY_CAREER_HUBS.some((h) => h.icao === 'HLLM' && h.hubTier === 'major')) {
    throw new Error('LY catalog must include major HLLM (Mitiga)');
  }
  if (!LY_CAREER_HUBS.some((h) => h.icao === 'HLLB' && h.hubTier === 'major')) {
    throw new Error('LY catalog must include major HLLB');
  }
  if (!LY_CAREER_HUBS.some((h) => h.icao === 'HLMS')) {
    throw new Error('LY catalog must include HLMS Misrata (port pickup)');
  }
  if (LY_CAREER_HUBS.some((h) => h.icao === 'HLLT')) {
    throw new Error('LY catalog must use HLLM for Tripoli, not closed HLLT');
  }
}
