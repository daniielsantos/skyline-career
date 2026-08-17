/**
 * Kosovo career hub catalog — EU-8 Europe gaps.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type XkCareerRegion = 'XK-C';

export type XkCareerHubDef = {
  icao: string;
  name: string;
  region: XkCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

/** 1 curated Kosovo hub (BKPR — ICAO used in MSFS/Dispatch). */
export const XK_CAREER_HUBS: readonly XkCareerHubDef[] = [
  {
    icao: 'BKPR',
    name: 'Pristina',
    region: 'XK-C',
    hubTier: 'major',
    lat: 42.5728,
    lon: 21.0358,
    produce: { general: 1.25, electronics: 1.15, machinery: 1.1 },
    consume: { perishables: 1.15, supplies: 1.05, general: 1.05 },
  },
];

export const XK_CAREER_HUB_COUNT = 1;

export function buildXkFeederCorridors(
  hubs: readonly XkCareerHubDef[] = XK_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertXkCareerHubCatalog(): void {
  if (XK_CAREER_HUBS.length !== XK_CAREER_HUB_COUNT) {
    throw new Error(
      `XK_CAREER_HUBS length ${XK_CAREER_HUBS.length} !== ${XK_CAREER_HUB_COUNT}`,
    );
  }
  if (!XK_CAREER_HUBS.some((h) => h.icao === 'BKPR' && h.hubTier === 'major')) {
    throw new Error('XK catalog must include major BKPR');
  }
}
