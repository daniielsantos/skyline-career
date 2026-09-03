/**
 * Australia career hub catalog — Asia-14 Tasman / Indian Ocean face.
 *
 * Sydney cargo major is YSSY Kingsford Smith (not YSBK Bankstown). Melbourne
 * is YMML (not YMEN Essendon / YMAV Avalon). Gold Coast YBCG deferred;
 * Darwin is YPDN (AU-NT); Hobart is YMHB (AU-T).
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { AU_DENSIFY_HUBS, AU_DENSIFY_HUB_COUNT } from './career-au-hubs-densify.js';

export type AuCareerRegion = 'AU-E' | 'AU-S' | 'AU-Q' | 'AU-W' | 'AU-NT' | 'AU-T';

export type AuCareerHubDef = {
  icao: string;
  name: string;
  region: AuCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 9 curated Australia hubs. Sydney pickup is YSSY; Fremantle pickup is YPPH. */
export const AU_CAREER_HUBS: readonly AuCareerHubDef[] = [
  {
    icao: 'YSSY',
    name: 'Sydney Kingsford Smith',
    region: 'AU-E',
    hubTier: 'major',
    lat: -33.9461,
    lon: 151.177,
    produce: { electronics: 1.5, general: 1.5, machinery: 1.3 },
    consume: { perishables: 1.25, supplies: 1.2, general: 1.05, fuel: 1.25 },
  },
  {
    icao: 'YSCB',
    name: 'Canberra',
    region: 'AU-E',
    hubTier: 'regional',
    lat: -35.3069,
    lon: 149.195,
    produce: { general: 1.2, supplies: 1.2, electronics: 1.1 },
    consume: { perishables: 1.1, machinery: 0.95, fuel: 1.1 },
  },
  {
    icao: 'YMML',
    name: 'Melbourne Airport',
    region: 'AU-S',
    hubTier: 'major',
    lat: -37.6707,
    lon: 144.8379,
    produce: { machinery: 1.35, general: 1.4, electronics: 1.25 },
    consume: { perishables: 1.2, supplies: 1.15, fuel: 1.2 },
  },
  {
    icao: 'YPAD',
    name: 'Adelaide International',
    region: 'AU-S',
    hubTier: 'regional',
    lat: -34.9475,
    lon: 138.5334,
    produce: { perishables: 1.25, general: 1.25, supplies: 1.1 },
    consume: { electronics: 1.0, machinery: 1.0, fuel: 1.15 },
  },
  {
    icao: 'YBBN',
    name: 'Brisbane International',
    region: 'AU-Q',
    hubTier: 'regional',
    lat: -27.3842,
    lon: 153.117,
    produce: { general: 1.35, electronics: 1.2, perishables: 1.15 },
    consume: { machinery: 1.05, supplies: 1.15, fuel: 1.2 },
  },
  {
    icao: 'YBCS',
    name: 'Cairns International',
    region: 'AU-Q',
    hubTier: 'regional',
    lat: -16.8789,
    lon: 145.7495,
    produce: { perishables: 1.3, general: 1.2, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.15 },
  },
  {
    icao: 'YPPH',
    name: 'Perth International',
    region: 'AU-W',
    hubTier: 'regional',
    lat: -31.9403,
    lon: 115.967,
    produce: { machinery: 1.3, general: 1.3, supplies: 1.15 },
    consume: { perishables: 1.15, electronics: 1.05, fuel: 1.2 },
  },
  {
    icao: 'YPDN',
    name: 'Darwin International',
    region: 'AU-NT',
    hubTier: 'major',
    lat: -12.41497,
    lon: 130.88185,
    produce: { perishables: 1.25, general: 1.3, supplies: 1.15 },
    consume: { electronics: 1.0, machinery: 0.95, fuel: 1.2 },
  },
  {
    icao: 'YMHB',
    name: 'Hobart International',
    region: 'AU-T',
    hubTier: 'regional',
    lat: -42.837,
    lon: 147.513,
    produce: { perishables: 1.25, general: 1.2, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, fuel: 1.15 },
  },
  ...AU_DENSIFY_HUBS,
];

export const AU_CAREER_HUB_COUNT = 9 + AU_DENSIFY_HUB_COUNT;

export function buildAuFeederCorridors(
  hubs: readonly AuCareerHubDef[] = AU_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertAuCareerHubCatalog(): void {
  if (AU_CAREER_HUBS.length !== AU_CAREER_HUB_COUNT) {
    throw new Error(
      `AU_CAREER_HUBS length ${AU_CAREER_HUBS.length} !== ${AU_CAREER_HUB_COUNT}`,
    );
  }
  if (!AU_CAREER_HUBS.some((h) => h.icao === 'YSSY' && h.hubTier === 'major')) {
    throw new Error('AU catalog must include major YSSY (Kingsford Smith)');
  }
  if (!AU_CAREER_HUBS.some((h) => h.icao === 'YMML' && h.hubTier === 'major')) {
    throw new Error('AU catalog must include major YMML (Melbourne)');
  }
  if (!AU_CAREER_HUBS.some((h) => h.icao === 'YPDN' && h.hubTier === 'major')) {
    throw new Error('AU catalog must include major YPDN (Darwin)');
  }
  if (AU_CAREER_HUBS.some((h) => ['YSBK', 'YMEN', 'YMAV'].includes(h.icao))) {
    throw new Error('AU catalog must not seed Bankstown, Essendon, or Avalon');
  }
}
