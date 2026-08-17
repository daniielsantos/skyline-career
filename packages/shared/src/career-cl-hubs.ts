/**
 * Chile career hub catalog.
 * Consumed by career-economy seed, coords, tiers, and feeder corridor generation.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import {
  buildCareerFeederCorridors,
  type CareerCorridorEdge,
} from './career-us-hubs.js';

export type ClCareerRegion = 'CL-C' | 'CL-S';

export type ClCareerHubDef = {
  icao: string;
  name: string;
  region: ClCareerRegion;
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
  consume: { electronics: 0.85, machinery: 0.85, general: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

const miningSpoke = {
  produce: { machinery: 1.4, electronics: 1.05, general: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { perishables: 1.05, supplies: 1.0, general: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
};

/**
 * 21 curated Chile hubs — Centro (incl. Norte) + Sur / Austral.
 * Cargo hubs must exist in SimBrief (no MSFS-only strips: SCCD/SCSN/SCST/SCTC).
 */
export const CL_CAREER_HUBS: readonly ClCareerHubDef[] = [
  // ── CL-C (13) ────────────────────────────────────────────────────────────
  {
    icao: 'SCEL',
    name: 'Santiago Arturo Merino Benítez',
    region: 'CL-C',
    hubTier: 'major',
    lat: -33.393,
    lon: -70.7858,
    produce: { general: 1.5, electronics: 1.3, machinery: 1.15 },
    consume: { perishables: 1.15, general: 1.05, supplies: 1.0 },
  },
  {
    icao: 'SCDA',
    name: 'Iquique Diego Aracena',
    region: 'CL-C',
    hubTier: 'regional',
    lat: -20.5352,
    lon: -70.1813,
    ...miningSpoke,
  },
  {
    icao: 'SCFA',
    name: 'Antofagasta Andrés Sabella',
    region: 'CL-C',
    hubTier: 'regional',
    lat: -23.4445,
    lon: -70.4451,
    ...miningSpoke,
  },
  {
    icao: 'SCSE',
    name: 'La Serena La Florida',
    region: 'CL-C',
    hubTier: 'regional',
    lat: -29.9162,
    lon: -71.1995,
    ...agroSpoke,
  },
  {
    icao: 'SCIE',
    name: 'Concepción Carriel Sur',
    region: 'CL-C',
    hubTier: 'regional',
    lat: -36.7727,
    lon: -73.0631,
    produce: { machinery: 1.2, general: 1.15, perishables: 1.05 },
    consume: { electronics: 0.95, supplies: 0.95 },
  },
  {
    icao: 'SCQP',
    name: 'Temuco La Araucanía',
    region: 'CL-C',
    hubTier: 'spoke',
    lat: -38.9259,
    lon: -72.6515,
    ...agroSpoke,
  },
  {
    icao: 'SCAR',
    name: 'Arica Chacalluta',
    region: 'CL-C',
    hubTier: 'spoke',
    lat: -18.3485,
    lon: -70.3387,
    ...drySpoke,
  },
  {
    icao: 'SCCF',
    name: 'Calama El Loa',
    region: 'CL-C',
    hubTier: 'spoke',
    lat: -22.4982,
    lon: -68.9036,
    ...miningSpoke,
  },
  {
    icao: 'SCAT',
    name: 'Copiapó Desierto de Atacama',
    region: 'CL-C',
    hubTier: 'spoke',
    lat: -27.2612,
    lon: -70.7792,
    ...miningSpoke,
  },
  {
    icao: 'SCVM',
    name: 'Viña del Mar',
    region: 'CL-C',
    hubTier: 'spoke',
    lat: -32.9496,
    lon: -71.4786,
    produce: { general: 1.1, supplies: 1.05 },
    consume: { perishables: 1.1, electronics: 0.95, general: 0.95 },
  },
  {
    icao: 'SCRG',
    name: 'Rancagua / De La Independencia',
    region: 'CL-C',
    hubTier: 'spoke',
    lat: -34.1737,
    lon: -70.7757,
    ...agroSpoke,
  },
  {
    icao: 'SCIC',
    name: 'Curicó General Freire',
    region: 'CL-C',
    hubTier: 'spoke',
    lat: -34.9667,
    lon: -71.2167,
    ...agroSpoke,
  },
  {
    icao: 'SCCH',
    name: 'Chillán General Bernardo O\'Higgins',
    region: 'CL-C',
    hubTier: 'spoke',
    lat: -36.5825,
    lon: -72.0314,
    ...agroSpoke,
  },

  // ── CL-S (8) ────────────────────────────────────────────────────────────
  {
    icao: 'SCTE',
    name: 'Puerto Montt El Tepual',
    region: 'CL-S',
    hubTier: 'regional',
    lat: -41.4389,
    lon: -73.094,
    produce: { perishables: 1.35, general: 1.15, supplies: 1.05 },
    consume: { electronics: 0.95, machinery: 0.95 },
  },
  {
    icao: 'SCBA',
    name: 'Balmaceda',
    region: 'CL-S',
    hubTier: 'regional',
    lat: -45.9161,
    lon: -71.6895,
    produce: { general: 1.1, supplies: 1.05, perishables: 1.0 },
    consume: { electronics: 0.95, perishables: 1.05 },
  },
  {
    icao: 'SCCI',
    name: 'Punta Arenas Carlos Ibáñez del Campo',
    region: 'CL-S',
    hubTier: 'regional',
    lat: -53.0026,
    lon: -70.8546,
    produce: { general: 1.05, supplies: 1.1 },
    consume: { perishables: 1.25, supplies: 1.2, electronics: 0.95 },
  },
  {
    icao: 'SCJO',
    name: 'Osorno Cañal Bajo Carlos Hott Siebert',
    region: 'CL-S',
    hubTier: 'spoke',
    lat: -40.6112,
    lon: -73.0608,
    ...agroSpoke,
  },
  {
    icao: 'SCPQ',
    name: 'Puerto Williams',
    region: 'CL-S',
    hubTier: 'spoke',
    lat: -54.9311,
    lon: -67.6263,
    produce: { general: 0.85, supplies: 0.95 },
    consume: { perishables: 1.35, supplies: 1.3, general: 1.1 },
  },
  {
    icao: 'SCVD',
    name: 'Valdivia Pichoy',
    region: 'CL-S',
    hubTier: 'spoke',
    lat: -39.6506,
    lon: -73.0861,
    ...agroSpoke,
  },
  {
    icao: 'SCNT',
    name: 'Puerto Natales Teniente Julio Gallardo',
    region: 'CL-S',
    hubTier: 'spoke',
    lat: -51.6715,
    lon: -72.5292,
    produce: { general: 0.95, supplies: 1.0 },
    consume: { perishables: 1.2, supplies: 1.15, electronics: 0.9 },
  },
  {
    icao: 'SCCY',
    name: 'Coyhaique Teniente Vidal',
    region: 'CL-S',
    hubTier: 'spoke',
    lat: -45.5942,
    lon: -72.1061,
    produce: { general: 1.0, supplies: 1.05 },
    consume: { perishables: 1.15, supplies: 1.1, electronics: 0.9 },
  },
];

export const CL_CAREER_HUB_COUNT = 21;

/**
 * MSFS / a leftover catalog used SCCD for Carriel Sur. Real + SimBrief ident
 * is SCIE. Do not bring SCCD/SCST/SCSN/SCTC back — they are not Dispatch airports.
 */
export const CAREER_AIRPORT_ICAO_REMAP: Readonly<Record<string, string>> = {
  SCCD: 'SCIE',
  // Wizard / scenery corrections (wrong ICAO or missing→civil swap)
  MDJB: 'MDCY',
  MGFL: 'MGMM',
  MGHT: 'MGRT',
  MNRR: 'MNMR',
  MNCE: 'MNMR',
  MPPB: 'MPPA',
  MPSA: 'MPSM',
  MRQP: 'MRNS',
  MZCF: 'MZSP',
  SLRI: 'SLCO',
  SLET: 'SLGY',
  SPMS: 'SPJI',
  SVCP: 'SVMT',
  ESMX: 'ESMQ',
  // EU-8 MSFS Facilities corrections
  UBGN: 'UBBG',
  UDLS: 'UDSG',
  // MENA-2 MSFS Facilities corrections
  OETH: 'OETF',
  OKBK: 'OKKK',
};

const CAREER_ICAO_FIELD_KEYS = new Set([
  'icao',
  'originIcao',
  'destIcao',
  'locationIcao',
  'homeHubIcao',
  'pilotIcao',
  'basedIcao',
  'hirePoolIcao',
]);

/** SimBrief / navdata ident for a career airport (SCCD → SCIE). */
export function canonicalCareerAirportIcao(icao: string): string {
  const code = icao.trim().toUpperCase();
  return CAREER_AIRPORT_ICAO_REMAP[code] ?? code;
}

/** Rewrite known ICAO fields in a missions/economy tree. */
export function rewriteCareerIcaoFields(
  value: unknown,
  fromIcao: string,
  toIcao: string,
): void {
  const from = fromIcao.trim().toUpperCase();
  const to = toIcao.trim().toUpperCase();
  if (!from || !to || from === to) return;
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) rewriteCareerIcaoFields(item, from, to);
    return;
  }
  const rec = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(rec)) {
    if (typeof child === 'string' && CAREER_ICAO_FIELD_KEYS.has(key)) {
      if (child.trim().toUpperCase() === from) rec[key] = to;
      continue;
    }
    if (child && typeof child === 'object') {
      rewriteCareerIcaoFields(child, from, to);
    }
  }
}

/**
 * Player-state remaps after a CL hub ident migrate.
 * Old catalog: La Serena = SCIE, Concepción = SCCD.
 * New catalog: La Serena = SCSE, Concepción = SCIE.
 */
export function clHubIdentRemapsForPlayer(
  beforeIcaos: Iterable<string>,
  afterIcaos: Iterable<string>,
): ReadonlyArray<readonly [string, string]> {
  const before = new Set(
    [...beforeIcaos].map((code) => code.trim().toUpperCase()).filter(Boolean),
  );
  const after = new Set(
    [...afterIcaos].map((code) => code.trim().toUpperCase()).filter(Boolean),
  );
  const remaps: [string, string][] = [];
  if (before.has('SCIE') && !before.has('SCSE') && after.has('SCSE')) {
    remaps.push(['SCIE', 'SCSE']);
  }
  if (before.has('SCCD') && !after.has('SCCD')) {
    remaps.push(['SCCD', 'SCIE']);
  }
  return remaps;
}

export function buildClFeederCorridors(
  hubs: readonly ClCareerHubDef[] = CL_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(
    hubs.filter((h) => h.bush !== true),
    existing,
  );
}

export function assertClCareerHubCatalog(): void {
  if (CL_CAREER_HUBS.length !== CL_CAREER_HUB_COUNT) {
    throw new Error(
      `CL_CAREER_HUBS length ${CL_CAREER_HUBS.length} !== ${CL_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  const byRegion: Record<string, number> = {};
  for (const h of CL_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate CL hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    byRegion[h.region] = (byRegion[h.region] ?? 0) + 1;
  }
  const expected: Record<ClCareerRegion, number> = {
    'CL-C': 13,
    'CL-S': 8,
  };
  for (const [region, n] of Object.entries(expected)) {
    if (byRegion[region] !== n) {
      throw new Error(
        `CL region ${region} has ${byRegion[region] ?? 0} hubs, expected ${n}`,
      );
    }
  }
}
