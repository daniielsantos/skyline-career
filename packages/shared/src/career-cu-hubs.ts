/**
 * Cuba career hub catalog — intl-first island pattern.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type CuCareerRegion = 'CU-C';

export type CuCareerHubDef = {
  icao: string;
  name: string;
  region: CuCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  bush?: true;
};

const drySpoke = {
  produce: { general: 1.1, supplies: 1.0, perishables: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.85, machinery: 0.8, general: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

const agroSpoke = {
  produce: { perishables: 1.4, general: 1.05, supplies: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.85, machinery: 0.85, fuel: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/** 7 curated Cuba hubs — Havana + provincial gateways. */
export const CU_CAREER_HUBS: readonly CuCareerHubDef[] = [
  {
    icao: 'MUHA',
    name: 'Havana Jose Marti',
    region: 'CU-C',
    hubTier: 'major',
    lat: 22.9892,
    lon: -82.4091,
    produce: { general: 1.45, electronics: 1.15, machinery: 1.1 },
    consume: { perishables: 1.2, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'MUCU',
    name: 'Santiago de Cuba Antonio Maceo',
    region: 'CU-C',
    hubTier: 'regional',
    lat: 19.9698,
    lon: -75.8354,
    produce: { perishables: 1.2, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.95 },
  },
  {
    icao: 'MUVR',
    name: 'Varadero Juan G. Gomez',
    region: 'CU-C',
    hubTier: 'regional',
    lat: 23.0344,
    lon: -81.4353,
    produce: { general: 1.2, perishables: 1.15, supplies: 1.05 },
    consume: { electronics: 1.05, machinery: 0.9 },
  },
  {
    icao: 'MUSC',
    name: 'Santa Clara Abel Santamaria',
    region: 'CU-C',
    hubTier: 'spoke',
    lat: 22.4922,
    lon: -79.9436,
    ...agroSpoke,
  },
  {
    icao: 'MUCM',
    name: 'Camaguey Ignacio Agramonte',
    region: 'CU-C',
    hubTier: 'spoke',
    lat: 21.4203,
    lon: -77.8475,
    ...agroSpoke,
  },
  {
    icao: 'MUHG',
    name: 'Holguin Frank Pais',
    region: 'CU-C',
    hubTier: 'spoke',
    lat: 20.7856,
    lon: -76.3151,
    ...agroSpoke,
  },
  {
    icao: 'MUCF',
    name: 'Cienfuegos Jaime Gonzalez',
    region: 'CU-C',
    hubTier: 'spoke',
    lat: 22.15,
    lon: -80.4142,
    ...drySpoke,
  },
];

export const CU_CAREER_HUB_COUNT = 7;

export function buildCuFeederCorridors(
  hubs: readonly CuCareerHubDef[] = CU_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertCuCareerHubCatalog(): void {
  if (CU_CAREER_HUBS.length !== CU_CAREER_HUB_COUNT) {
    throw new Error(
      `CU_CAREER_HUBS length ${CU_CAREER_HUBS.length} !== ${CU_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  let n = 0;
  for (const h of CU_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate CU hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    if (h.region === 'CU-C') n += 1;
  }
  if (n !== 7) throw new Error(`CU-C has ${n} hubs, expected 7`);
}
