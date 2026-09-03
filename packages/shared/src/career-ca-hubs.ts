/**
 * Canada career hub catalog (53 curated + densify).
 * Consumed by career-economy seed, coords, tiers, and feeder corridor generation.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';
import { CA_DENSIFY_HUBS, CA_DENSIFY_HUB_COUNT } from './career-ca-hubs-densify.js';

export type CaCareerRegion = 'CA-W' | 'CA-PR' | 'CA-ON' | 'CA-QC' | 'CA-AT';

export type CaCareerHubDef = {
  icao: string;
  name: string;
  region: CaCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
  /** Soft-field bush strip — no ferry; light_ga OD only vs same-country gateways. */
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

const dryRegional = {
  produce: { general: 1.3, supplies: 1.15, perishables: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 1.0, machinery: 0.95, general: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
};

const forestSpoke = {
  produce: { general: 1.3, supplies: 1.15, perishables: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.8, machinery: 0.9, general: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

const agriSpoke = {
  produce: { supplies: 1.3, general: 1.1, perishables: 1.1 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.8, machinery: 0.85, general: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

const fisherySpoke = {
  produce: { perishables: 1.4, general: 0.95, supplies: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.85, machinery: 0.85, general: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

/**
 * 50 curated Canada hubs. Majors preserved (CYVR/CYYC/CYEG/CYYZ/CYUL);
 * densifies W/PR/ON/QC/AT holes for starter-friendly short-haul demand.
 */
export const CA_CAREER_HUBS: readonly CaCareerHubDef[] = [
  // ── CA-W (12) ────────────────────────────────────────────────────────────
  {
    icao: 'CYVR',
    name: 'Vancouver International',
    region: 'CA-W',
    hubTier: 'major',
    lat: 49.1939,
    lon: -123.1844,
    produce: { electronics: 1.4, general: 1.3, perishables: 1.1 },
    consume: { machinery: 1.0, general: 1.0 },
  },
  {
    icao: 'CYYJ',
    name: 'Victoria International',
    region: 'CA-W',
    hubTier: 'regional',
    lat: 48.6469,
    lon: -123.426,
    produce: { general: 1.2, perishables: 1.05, supplies: 1.0 },
    consume: { electronics: 0.95, machinery: 0.85 },
  },
  {
    icao: 'CYXX',
    name: 'Abbotsford International',
    region: 'CA-W',
    hubTier: 'spoke',
    lat: 49.0253,
    lon: -122.3606,
    ...drySpoke,
  },
  {
    icao: 'CYLW',
    name: 'Kelowna International',
    region: 'CA-W',
    hubTier: 'regional',
    lat: 49.9561,
    lon: -119.3778,
    produce: { perishables: 1.35, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'CYXS',
    name: 'Prince George',
    region: 'CA-W',
    hubTier: 'spoke',
    lat: 53.8894,
    lon: -122.6789,
    ...forestSpoke,
  },
  {
    icao: 'CYXT',
    name: 'Terrace-Kitimat',
    region: 'CA-W',
    hubTier: 'spoke',
    lat: 54.4692,
    lon: -128.5775,
    ...forestSpoke,
  },
  {
    icao: 'CYQQ',
    name: 'Comox Valley',
    region: 'CA-W',
    hubTier: 'spoke',
    lat: 49.7108,
    lon: -124.8867,
    ...drySpoke,
  },
  {
    icao: 'CYCD',
    name: 'Nanaimo',
    region: 'CA-W',
    hubTier: 'spoke',
    lat: 49.0553,
    lon: -123.87,
    ...drySpoke,
  },
  {
    icao: 'CYBL',
    name: 'Campbell River',
    region: 'CA-W',
    hubTier: 'spoke',
    lat: 49.9508,
    lon: -125.2708,
    ...forestSpoke,
  },
  {
    icao: 'CYKA',
    name: 'Kamloops',
    region: 'CA-W',
    hubTier: 'spoke',
    lat: 50.7022,
    lon: -120.4442,
    ...forestSpoke,
  },
  {
    icao: 'CYPR',
    name: 'Prince Rupert',
    region: 'CA-W',
    hubTier: 'spoke',
    lat: 54.2861,
    lon: -130.445,
    ...forestSpoke,
    produce: { general: 1.35, supplies: 1.2, perishables: 0.95 },
  },
  {
    icao: 'CYYF',
    name: 'Penticton',
    region: 'CA-W',
    hubTier: 'spoke',
    lat: 49.4631,
    lon: -119.6022,
    produce: { perishables: 1.35, general: 1.0, supplies: 0.9 },
    consume: { electronics: 0.85, machinery: 0.8 },
  },

  // ── CA-PR (12) ───────────────────────────────────────────────────────────
  {
    icao: 'CYYC',
    name: 'Calgary International',
    region: 'CA-PR',
    hubTier: 'major',
    lat: 51.1139,
    lon: -114.0203,
    produce: { machinery: 1.5, general: 1.2, electronics: 0.9 },
    consume: { perishables: 1.0, general: 1.0 },
  },
  {
    icao: 'CYEG',
    name: 'Edmonton International',
    region: 'CA-PR',
    hubTier: 'major',
    lat: 53.3097,
    lon: -113.58,
    produce: { machinery: 1.6, general: 1.1, electronics: 0.9 },
    consume: { perishables: 1.0, general: 1.0 },
  },
  {
    icao: 'CYWG',
    name: 'Winnipeg/James Armstrong Richardson',
    region: 'CA-PR',
    hubTier: 'regional',
    lat: 49.91,
    lon: -97.2399,
    produce: { general: 1.3, supplies: 1.15, machinery: 1.0 },
    consume: { electronics: 0.95, perishables: 0.95 },
  },
  {
    icao: 'CYXE',
    name: 'Saskatoon/John G. Diefenbaker',
    region: 'CA-PR',
    hubTier: 'regional',
    lat: 52.1708,
    lon: -106.6997,
    produce: { supplies: 1.3, general: 1.15, perishables: 1.0 },
    consume: { electronics: 0.9, machinery: 0.9 },
  },
  {
    icao: 'CYQR',
    name: 'Regina International',
    region: 'CA-PR',
    hubTier: 'regional',
    lat: 50.4319,
    lon: -104.6658,
    ...dryRegional,
    produce: { supplies: 1.25, general: 1.2, perishables: 1.05 },
    consume: { electronics: 0.95, machinery: 0.9, general: 1.0 },
  },
  {
    icao: 'CYMJ',
    name: 'Moose Jaw/Air Vice Marshal C.M. McEwen',
    region: 'CA-PR',
    hubTier: 'spoke',
    lat: 50.3306,
    lon: -105.5578,
    ...agriSpoke,
  },
  {
    icao: 'CYQU',
    name: 'Grande Prairie',
    region: 'CA-PR',
    hubTier: 'spoke',
    lat: 55.1797,
    lon: -118.8853,
    produce: { machinery: 1.2, general: 1.05, supplies: 1.0 },
    consume: { electronics: 0.85, perishables: 0.85 },
  },
  {
    icao: 'CYPA',
    name: 'Prince Albert (Glass Field)',
    region: 'CA-PR',
    hubTier: 'spoke',
    lat: 53.2142,
    lon: -105.6728,
    ...agriSpoke,
  },
  {
    icao: 'CYQF',
    name: 'Red Deer Regional',
    region: 'CA-PR',
    hubTier: 'spoke',
    lat: 52.1822,
    lon: -113.8942,
    produce: { machinery: 1.25, general: 1.1, supplies: 0.95 },
    consume: { electronics: 0.85, perishables: 0.85 },
  },
  {
    icao: 'CYYN',
    name: 'Swift Current',
    region: 'CA-PR',
    hubTier: 'spoke',
    lat: 50.2919,
    lon: -107.6911,
    ...agriSpoke,
  },
  {
    icao: 'CYXH',
    name: 'Medicine Hat',
    region: 'CA-PR',
    hubTier: 'spoke',
    lat: 50.0189,
    lon: -110.7211,
    produce: { supplies: 1.2, general: 1.1, machinery: 1.0 },
    consume: { electronics: 0.85, perishables: 0.85 },
  },
  {
    icao: 'CYLL',
    name: 'Lloydminster',
    region: 'CA-PR',
    hubTier: 'spoke',
    lat: 53.3092,
    lon: -110.0722,
    produce: { machinery: 1.15, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.85, perishables: 0.85 },
  },

  // ── CA-ON (12) ───────────────────────────────────────────────────────────
  {
    icao: 'CYYZ',
    name: 'Toronto Pearson',
    region: 'CA-ON',
    hubTier: 'major',
    lat: 43.6777,
    lon: -79.6248,
    produce: { general: 1.5, electronics: 1.3, machinery: 1.0 },
    consume: { perishables: 1.1, general: 1.0 },
  },
  {
    icao: 'CYOW',
    name: 'Ottawa Macdonald-Cartier',
    region: 'CA-ON',
    hubTier: 'regional',
    lat: 45.3225,
    lon: -75.6692,
    produce: { electronics: 1.2, general: 1.15, supplies: 1.0 },
    consume: { perishables: 1.0, machinery: 0.9 },
  },
  {
    icao: 'CYHM',
    name: 'Hamilton (John C. Munro)',
    region: 'CA-ON',
    hubTier: 'regional',
    lat: 43.1736,
    lon: -79.935,
    produce: { machinery: 1.35, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.9, perishables: 0.9 },
  },
  {
    icao: 'CYKF',
    name: 'Region of Waterloo International',
    region: 'CA-ON',
    hubTier: 'spoke',
    lat: 43.4608,
    lon: -80.3789,
    produce: { electronics: 1.3, general: 1.0 },
    consume: { perishables: 0.9, machinery: 0.85 },
  },
  {
    icao: 'CYXU',
    name: 'London International',
    region: 'CA-ON',
    hubTier: 'spoke',
    lat: 43.0356,
    lon: -81.1539,
    produce: { machinery: 1.2, general: 1.1 },
    consume: { electronics: 0.9, perishables: 0.9 },
  },
  {
    icao: 'CYQG',
    name: 'Windsor International',
    region: 'CA-ON',
    hubTier: 'spoke',
    lat: 42.2756,
    lon: -82.9556,
    produce: { machinery: 1.35, general: 1.0 },
    consume: { electronics: 0.9, perishables: 0.9 },
  },
  {
    icao: 'CYYB',
    name: 'North Bay/Jack Garland',
    region: 'CA-ON',
    hubTier: 'spoke',
    lat: 46.3628,
    lon: -79.4231,
    ...forestSpoke,
  },
  {
    icao: 'CYAM',
    name: 'Sault Ste. Marie',
    region: 'CA-ON',
    hubTier: 'spoke',
    lat: 46.485,
    lon: -84.5094,
    produce: { machinery: 1.1, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.85, perishables: 0.85 },
  },
  {
    icao: 'CYTS',
    name: 'Timmins/Victor M. Power',
    region: 'CA-ON',
    hubTier: 'spoke',
    lat: 48.5697,
    lon: -81.3767,
    produce: { machinery: 1.15, general: 1.05, supplies: 1.0 },
    consume: { electronics: 0.85, perishables: 0.85 },
  },
  {
    icao: 'CYOO',
    name: 'Oshawa Executive',
    region: 'CA-ON',
    hubTier: 'spoke',
    lat: 43.9214,
    lon: -78.8953,
    produce: { machinery: 1.25, general: 1.0 },
    consume: { electronics: 0.9, perishables: 0.9 },
  },
  {
    icao: 'CYXZ',
    name: 'Wawa',
    region: 'CA-ON',
    hubTier: 'spoke',
    lat: 47.9678,
    lon: -84.7861,
    ...forestSpoke,
  },
  {
    icao: 'CYPQ',
    name: 'Peterborough',
    region: 'CA-ON',
    hubTier: 'spoke',
    lat: 44.2256,
    lon: -78.3675,
    ...drySpoke,
  },

  // ── CA-QC (8) ────────────────────────────────────────────────────────────
  {
    icao: 'CYUL',
    name: 'Montréal-Trudeau',
    region: 'CA-QC',
    hubTier: 'major',
    lat: 45.4706,
    lon: -73.7408,
    produce: { electronics: 1.5, machinery: 1.3, general: 1.0 },
    consume: { perishables: 1.1, general: 1.0 },
  },
  {
    icao: 'CYQB',
    name: 'Québec City Jean Lesage',
    region: 'CA-QC',
    hubTier: 'regional',
    lat: 46.7911,
    lon: -71.3933,
    produce: { general: 1.2, machinery: 1.0, supplies: 1.0 },
    consume: { electronics: 0.95, perishables: 1.0 },
  },
  {
    icao: 'CYBG',
    name: 'Bagotville',
    region: 'CA-QC',
    hubTier: 'spoke',
    lat: 48.3306,
    lon: -70.9964,
    produce: { machinery: 1.2, general: 1.05, supplies: 1.0 },
    consume: { electronics: 0.85, perishables: 0.85 },
  },
  {
    icao: 'CYHU',
    name: 'Montréal/St-Hubert',
    region: 'CA-QC',
    hubTier: 'spoke',
    lat: 45.5175,
    lon: -73.4169,
    produce: { electronics: 1.1, general: 1.0 },
    consume: { perishables: 0.9, machinery: 0.85 },
  },
  {
    icao: 'CYRJ',
    name: 'Roberval',
    region: 'CA-QC',
    hubTier: 'spoke',
    lat: 48.5192,
    lon: -72.2642,
    ...forestSpoke,
  },
  {
    icao: 'CYUY',
    name: 'Rouyn-Noranda',
    region: 'CA-QC',
    hubTier: 'spoke',
    lat: 48.2061,
    lon: -79.0231,
    produce: { machinery: 1.15, general: 1.05, supplies: 1.0 },
    consume: { electronics: 0.85, perishables: 0.85 },
  },
  {
    icao: 'CYMT',
    name: 'Chibougamau/Chapais',
    region: 'CA-QC',
    hubTier: 'spoke',
    lat: 49.7711,
    lon: -74.5261,
    ...forestSpoke,
  },
  {
    icao: 'CYVP',
    name: 'Kuujjuaq',
    region: 'CA-QC',
    hubTier: 'spoke',
    lat: 58.0961,
    lon: -68.4269,
    produce: { general: 0.9, supplies: 0.85 },
    consume: { perishables: 1.2, general: 1.1, supplies: 1.1 },
  },

  // ── CA-AT (6) ────────────────────────────────────────────────────────────
  {
    icao: 'CYHZ',
    name: 'Halifax Stanfield',
    region: 'CA-AT',
    hubTier: 'regional',
    lat: 44.8808,
    lon: -63.5086,
    produce: { general: 1.3, perishables: 1.2, supplies: 1.1 },
    consume: { electronics: 1.0, machinery: 0.95 },
  },
  {
    icao: 'CYYT',
    name: "St. John's International",
    region: 'CA-AT',
    hubTier: 'regional',
    lat: 47.6186,
    lon: -52.7519,
    produce: { perishables: 1.4, general: 1.0 },
    consume: { electronics: 0.9, machinery: 0.95 },
  },
  {
    icao: 'CYQM',
    name: 'Greater Moncton International',
    region: 'CA-AT',
    hubTier: 'spoke',
    lat: 46.1122,
    lon: -64.6786,
    produce: { general: 1.2, supplies: 1.1 },
    consume: { electronics: 0.9, perishables: 0.9 },
  },
  {
    icao: 'CYFC',
    name: 'Fredericton International',
    region: 'CA-AT',
    hubTier: 'spoke',
    lat: 45.8689,
    lon: -66.5372,
    ...drySpoke,
  },
  {
    icao: 'CYSJ',
    name: 'Saint John',
    region: 'CA-AT',
    hubTier: 'spoke',
    lat: 45.316,
    lon: -65.8903,
    produce: { general: 1.15, machinery: 1.0, supplies: 1.05 },
    consume: { electronics: 0.85, perishables: 0.9 },
  },
  {
    icao: 'CYQY',
    name: 'Sydney/J.A. Douglas McCurdy',
    region: 'CA-AT',
    hubTier: 'spoke',
    lat: 46.1614,
    lon: -60.0478,
    ...fisherySpoke,
  },

  ...CA_DENSIFY_HUBS,

  // ── CA soft-field spokes (3) — former bush strips, now normal cargo spokes ──
  {
    icao: 'CYHE',
    name: 'Hope / FVRD Regional Airpark',
    region: 'CA-W',
    hubTier: 'spoke',
    lat: 49.3689,
    lon: -121.495,
    ...drySpoke,
  },
  {
    icao: 'CYJA',
    name: 'Jasper',
    region: 'CA-PR',
    hubTier: 'spoke',
    lat: 52.9964,
    lon: -118.0602,
    ...drySpoke,
  },
  {
    icao: 'CYHH',
    name: 'Nemiscau',
    region: 'CA-QC',
    hubTier: 'spoke',
    lat: 51.6911,
    lon: -76.1356,
    ...drySpoke,
  },
];

export const CA_CAREER_HUB_COUNT = 53 + CA_DENSIFY_HUB_COUNT;

/** Auto feeder corridors so every non-bush CA hub has ≥2 partners. */
export function buildCaFeederCorridors(
  hubs: readonly CaCareerHubDef[] = CA_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertCaCareerHubCatalog(): void {
  if (CA_CAREER_HUBS.length !== CA_CAREER_HUB_COUNT) {
    throw new Error(
      `CA_CAREER_HUBS length ${CA_CAREER_HUBS.length} !== ${CA_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  const byRegion: Record<string, number> = {};
  for (const h of CA_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate CA hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    byRegion[h.region] = (byRegion[h.region] ?? 0) + 1;
  }
  const expected: Record<CaCareerRegion, number> = {
    'CA-W': 24,
    'CA-PR': 24,
    'CA-ON': 22,
    'CA-QC': 22,
    'CA-AT': 14,
  };
  for (const [region, n] of Object.entries(expected)) {
    if (byRegion[region] !== n) {
      throw new Error(
        `CA region ${region} has ${byRegion[region] ?? 0} hubs, expected ${n}`,
      );
    }
  }
}
