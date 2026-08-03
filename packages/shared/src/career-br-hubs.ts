/**
 * Brazil career hub catalog (60 airports).
 * Consumed by career-economy seed, coords, tiers, and feeder corridor generation.
 */

import type { CommodityId, HubTier } from './types/career-economy.js';
import type { CareerCorridorEdge } from './career-us-hubs.js';
import { buildCareerFeederCorridors } from './career-us-hubs.js';

export type BrCareerRegion = 'BR-S' | 'BR-SE' | 'BR-NE' | 'BR-N' | 'BR-CO';

export type BrCareerHubDef = {
  icao: string;
  name: string;
  region: BrCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

const agriSpoke = {
  produce: { perishables: 1.25, general: 1.0, supplies: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.85, machinery: 0.85, general: 0.9 } as Partial<
    Record<CommodityId, number>
  >,
};

const amazonSpoke = {
  produce: { general: 1.1, perishables: 1.05, supplies: 0.95 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 0.85, machinery: 0.9, perishables: 1.05 } as Partial<
    Record<CommodityId, number>
  >,
};

const dryRegional = {
  produce: { general: 1.25, supplies: 1.1, perishables: 1.05 } as Partial<
    Record<CommodityId, number>
  >,
  consume: { electronics: 1.0, machinery: 0.95, general: 1.0 } as Partial<
    Record<CommodityId, number>
  >,
};

/**
 * 60 curated BR hubs. Majors preserved (GRU/VCP/GIG/MAO); densifies N/CO/SE/S/NE holes.
 */
export const BR_CAREER_HUBS: readonly BrCareerHubDef[] = [
  // ── BR-SE (13) ───────────────────────────────────────────────────────────
  {
    icao: 'SBGR',
    name: 'São Paulo/Guarulhos',
    region: 'BR-SE',
    hubTier: 'major',
    lat: -23.4356,
    lon: -46.4731,
    produce: { electronics: 1.4, general: 1.1, supplies: 1.2, machinery: 0.9 },
    consume: { perishables: 1.2, general: 1.0, supplies: 0.9 },
  },
  {
    icao: 'SBGL',
    name: 'Rio de Janeiro/Galeão',
    region: 'BR-SE',
    hubTier: 'major',
    lat: -22.8099,
    lon: -43.2506,
    produce: { perishables: 1.3, general: 0.8, supplies: 1.1 },
    consume: { electronics: 1.1, machinery: 1.0, supplies: 1.0 },
  },
  {
    icao: 'SBKP',
    name: 'Campinas/Viracopos',
    region: 'BR-SE',
    hubTier: 'major',
    lat: -23.0074,
    lon: -47.1345,
    produce: { electronics: 1.6, machinery: 1.2, supplies: 1.0 },
    consume: { general: 0.9, perishables: 0.7, supplies: 0.85 },
  },
  {
    icao: 'SBCF',
    name: 'Belo Horizonte/Confins',
    region: 'BR-SE',
    hubTier: 'regional',
    lat: -19.6244,
    lon: -43.9719,
    produce: { machinery: 1.3, general: 1.0, supplies: 1.15 },
    consume: { electronics: 0.9, perishables: 1.0, supplies: 0.95 },
  },
  {
    icao: 'SBVT',
    name: 'Vitória',
    region: 'BR-SE',
    hubTier: 'regional',
    lat: -20.2581,
    lon: -40.2864,
    produce: { general: 1.2, machinery: 0.8 },
    consume: { electronics: 0.9, perishables: 1.0 },
  },
  {
    icao: 'SBUL',
    name: 'Uberlândia',
    region: 'BR-SE',
    hubTier: 'regional',
    lat: -18.8828,
    lon: -48.2256,
    ...dryRegional,
    produce: { general: 1.3, perishables: 1.15, machinery: 1.0, supplies: 1.1 },
    consume: { electronics: 1.0, machinery: 0.95, general: 1.0 },
  },
  {
    icao: 'SBRP',
    name: 'Ribeirão Preto',
    region: 'BR-SE',
    hubTier: 'spoke',
    lat: -21.1364,
    lon: -47.7767,
    produce: { machinery: 1.0, perishables: 1.2 },
    consume: { electronics: 0.9, general: 0.8 },
  },
  {
    icao: 'SBSJ',
    name: 'São José dos Campos',
    region: 'BR-SE',
    hubTier: 'spoke',
    lat: -23.2292,
    lon: -45.8611,
    produce: { electronics: 1.2, machinery: 1.1, general: 0.9 },
    consume: { perishables: 1.0, general: 0.95 },
  },
  {
    icao: 'SBUR',
    name: 'Uberaba',
    region: 'BR-SE',
    hubTier: 'spoke',
    lat: -19.7647,
    lon: -47.9661,
    ...agriSpoke,
  },
  {
    icao: 'SBDN',
    name: 'Presidente Prudente',
    region: 'BR-SE',
    hubTier: 'spoke',
    lat: -22.1756,
    lon: -51.4247,
    ...agriSpoke,
  },
  {
    icao: 'SBML',
    name: 'Marília',
    region: 'BR-SE',
    hubTier: 'spoke',
    lat: -22.1964,
    lon: -49.9264,
    ...agriSpoke,
  },
  {
    icao: 'SBSR',
    name: 'São José do Rio Preto',
    region: 'BR-SE',
    hubTier: 'spoke',
    lat: -20.8161,
    lon: -49.4064,
    ...agriSpoke,
    produce: { perishables: 1.3, general: 1.05, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.9, general: 0.95 },
  },
  {
    icao: 'SBAU',
    name: 'Araçatuba',
    region: 'BR-SE',
    hubTier: 'spoke',
    lat: -21.1414,
    lon: -50.4247,
    ...agriSpoke,
  },

  // ── BR-S (11) ────────────────────────────────────────────────────────────
  {
    icao: 'SBCT',
    name: 'Curitiba',
    region: 'BR-S',
    hubTier: 'regional',
    lat: -25.5285,
    lon: -49.1758,
    produce: { machinery: 1.1, perishables: 1.0 },
    consume: { electronics: 0.9, general: 1.0 },
  },
  {
    icao: 'SBPA',
    name: 'Porto Alegre',
    region: 'BR-S',
    hubTier: 'regional',
    lat: -29.9944,
    lon: -51.1714,
    produce: { machinery: 1.2, general: 1.1 },
    consume: { electronics: 1.0, perishables: 1.1 },
  },
  {
    icao: 'SBFI',
    name: 'Foz do Iguaçu',
    region: 'BR-S',
    hubTier: 'regional',
    lat: -25.5961,
    lon: -54.4872,
    ...dryRegional,
    produce: { general: 1.3, perishables: 1.1, supplies: 1.15 },
    consume: { electronics: 1.0, machinery: 0.95, general: 1.0 },
  },
  {
    icao: 'SBFL',
    name: 'Florianópolis',
    region: 'BR-S',
    hubTier: 'spoke',
    lat: -27.6703,
    lon: -48.5525,
    produce: { electronics: 0.8, perishables: 1.1 },
    consume: { machinery: 0.9, general: 1.0 },
  },
  {
    icao: 'SBNF',
    name: 'Navegantes',
    region: 'BR-S',
    hubTier: 'spoke',
    lat: -26.8794,
    lon: -48.6514,
    produce: { general: 1.3, machinery: 1.0 },
    consume: { electronics: 0.9, perishables: 0.8 },
  },
  {
    icao: 'SBLO',
    name: 'Londrina',
    region: 'BR-S',
    hubTier: 'spoke',
    lat: -23.3336,
    lon: -51.1301,
    produce: { perishables: 1.4, machinery: 0.8 },
    consume: { electronics: 0.9, general: 0.9 },
  },
  {
    icao: 'SBJV',
    name: 'Joinville',
    region: 'BR-S',
    hubTier: 'spoke',
    lat: -26.2245,
    lon: -48.7974,
    produce: { machinery: 1.3, general: 0.9 },
    consume: { electronics: 0.8, perishables: 0.9 },
  },
  {
    icao: 'SBCA',
    name: 'Cascavel',
    region: 'BR-S',
    hubTier: 'spoke',
    lat: -25.0003,
    lon: -53.5008,
    ...agriSpoke,
  },
  {
    icao: 'SBCH',
    name: 'Chapecó',
    region: 'BR-S',
    hubTier: 'spoke',
    lat: -27.1342,
    lon: -52.6566,
    ...agriSpoke,
    produce: { perishables: 1.35, general: 1.05, supplies: 1.0 },
    consume: { electronics: 0.85, machinery: 0.9, general: 0.95 },
  },
  {
    icao: 'SBCX',
    name: 'Caxias do Sul',
    region: 'BR-S',
    hubTier: 'spoke',
    lat: -29.1972,
    lon: -51.1875,
    produce: { machinery: 1.25, general: 1.0 },
    consume: { electronics: 0.9, perishables: 1.0 },
  },
  {
    icao: 'SBPK',
    name: 'Pelotas',
    region: 'BR-S',
    hubTier: 'spoke',
    lat: -31.7181,
    lon: -52.3278,
    ...agriSpoke,
  },

  // ── BR-NE (14) ───────────────────────────────────────────────────────────
  {
    icao: 'SBSV',
    name: 'Salvador',
    region: 'BR-NE',
    hubTier: 'regional',
    lat: -12.9086,
    lon: -38.3225,
    produce: { perishables: 1.5, general: 0.9 },
    consume: { electronics: 0.8, machinery: 0.7 },
  },
  {
    icao: 'SBRF',
    name: 'Recife',
    region: 'BR-NE',
    hubTier: 'regional',
    lat: -8.1265,
    lon: -34.9236,
    produce: { general: 1.2, perishables: 1.0 },
    consume: { electronics: 1.1, machinery: 0.9 },
  },
  {
    icao: 'SBFZ',
    name: 'Fortaleza',
    region: 'BR-NE',
    hubTier: 'regional',
    lat: -3.7763,
    lon: -38.5326,
    produce: { perishables: 1.3, general: 1.0 },
    consume: { electronics: 1.0, machinery: 0.8 },
  },
  {
    icao: 'SBSL',
    name: 'São Luís',
    region: 'BR-NE',
    hubTier: 'regional',
    lat: -2.5853,
    lon: -44.2342,
    ...dryRegional,
    produce: { perishables: 1.25, general: 1.15, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, general: 1.0 },
  },
  {
    icao: 'SBTE',
    name: 'Teresina',
    region: 'BR-NE',
    hubTier: 'regional',
    lat: -5.0597,
    lon: -42.8236,
    ...dryRegional,
  },
  {
    icao: 'SBSG',
    name: 'Natal/São Gonçalo',
    region: 'BR-NE',
    hubTier: 'spoke',
    lat: -5.7681,
    lon: -35.3761,
    produce: { perishables: 1.2, general: 0.8 },
    consume: { electronics: 0.9, machinery: 0.8 },
  },
  {
    icao: 'SBAR',
    name: 'Aracaju',
    region: 'BR-NE',
    hubTier: 'spoke',
    lat: -10.984,
    lon: -37.0703,
    produce: { perishables: 1.2, general: 0.9 },
    consume: { electronics: 0.8, machinery: 0.9 },
  },
  {
    icao: 'SBMO',
    name: 'Maceió',
    region: 'BR-NE',
    hubTier: 'spoke',
    lat: -9.5108,
    lon: -35.7917,
    produce: { perishables: 1.3, general: 0.8 },
    consume: { electronics: 0.9, machinery: 0.8 },
  },
  {
    icao: 'SBJP',
    name: 'João Pessoa',
    region: 'BR-NE',
    hubTier: 'spoke',
    lat: -7.1484,
    lon: -34.9507,
    produce: { perishables: 1.1, general: 0.9 },
    consume: { electronics: 0.8, machinery: 0.8 },
  },
  {
    icao: 'SBPS',
    name: 'Porto Seguro',
    region: 'BR-NE',
    hubTier: 'spoke',
    lat: -16.4386,
    lon: -39.0809,
    produce: { perishables: 1.1, general: 0.7 },
    consume: { electronics: 0.8, machinery: 0.7 },
  },
  {
    icao: 'SBPL',
    name: 'Petrolina',
    region: 'BR-NE',
    hubTier: 'spoke',
    lat: -9.3622,
    lon: -40.5692,
    ...agriSpoke,
    produce: { perishables: 1.4, general: 1.0, supplies: 0.95 },
    consume: { electronics: 0.85, machinery: 0.9, general: 0.95 },
  },
  {
    icao: 'SBJU',
    name: 'Juazeiro do Norte',
    region: 'BR-NE',
    hubTier: 'spoke',
    lat: -7.2189,
    lon: -39.2703,
    ...agriSpoke,
  },
  {
    icao: 'SBIL',
    name: 'Ilhéus',
    region: 'BR-NE',
    hubTier: 'spoke',
    lat: -14.8158,
    lon: -39.0333,
    produce: { perishables: 1.25, general: 0.85 },
    consume: { electronics: 0.85, machinery: 0.8 },
  },
  {
    icao: 'SBIZ',
    name: 'Imperatriz',
    region: 'BR-NE',
    hubTier: 'spoke',
    lat: -5.5314,
    lon: -47.4603,
    ...agriSpoke,
  },

  // ── BR-N (11) ────────────────────────────────────────────────────────────
  {
    icao: 'SBEG',
    name: 'Manaus',
    region: 'BR-N',
    hubTier: 'major',
    lat: -3.0386,
    lon: -60.0497,
    produce: { electronics: 1.9, machinery: 1.1, general: 0.9 },
    consume: { perishables: 1.3, general: 1.1 },
  },
  {
    icao: 'SBBE',
    name: 'Belém',
    region: 'BR-N',
    hubTier: 'regional',
    lat: -1.3792,
    lon: -48.4761,
    produce: { perishables: 1.4, general: 1.1 },
    consume: { electronics: 0.9, machinery: 0.8 },
  },
  {
    icao: 'SBSN',
    name: 'Santarém',
    region: 'BR-N',
    hubTier: 'regional',
    lat: -2.4225,
    lon: -54.7928,
    ...dryRegional,
    produce: { perishables: 1.3, general: 1.2, supplies: 1.1 },
    consume: { electronics: 0.95, machinery: 0.9, general: 1.0 },
  },
  {
    icao: 'SBPV',
    name: 'Porto Velho',
    region: 'BR-N',
    hubTier: 'spoke',
    lat: -8.7093,
    lon: -63.9023,
    produce: { general: 1.1, perishables: 1.0 },
    consume: { electronics: 0.8, machinery: 0.9 },
  },
  {
    icao: 'SBMQ',
    name: 'Macapá',
    region: 'BR-N',
    hubTier: 'spoke',
    lat: 0.0506,
    lon: -51.0722,
    produce: { perishables: 1.1, general: 0.9 },
    consume: { electronics: 0.8, machinery: 0.7 },
  },
  {
    icao: 'SBBV',
    name: 'Boa Vista',
    region: 'BR-N',
    hubTier: 'spoke',
    lat: 2.8461,
    lon: -60.69,
    ...amazonSpoke,
  },
  {
    icao: 'SBRB',
    name: 'Rio Branco',
    region: 'BR-N',
    hubTier: 'spoke',
    lat: -9.8689,
    lon: -67.8981,
    ...amazonSpoke,
  },
  {
    icao: 'SBMA',
    name: 'Marabá',
    region: 'BR-N',
    hubTier: 'spoke',
    lat: -5.3681,
    lon: -49.1381,
    produce: { machinery: 1.15, general: 1.1, perishables: 0.95 },
    consume: { electronics: 0.85, perishables: 1.0 },
  },
  {
    icao: 'SBHT',
    name: 'Altamira',
    region: 'BR-N',
    hubTier: 'spoke',
    lat: -3.2539,
    lon: -52.2542,
    ...amazonSpoke,
  },
  {
    icao: 'SBCZ',
    name: 'Cruzeiro do Sul',
    region: 'BR-N',
    hubTier: 'spoke',
    lat: -7.5994,
    lon: -72.7694,
    ...amazonSpoke,
  },
  {
    icao: 'SBTT',
    name: 'Tabatinga',
    region: 'BR-N',
    hubTier: 'spoke',
    lat: -4.2525,
    lon: -69.9358,
    ...amazonSpoke,
  },

  // ── BR-CO (11) ───────────────────────────────────────────────────────────
  {
    icao: 'SBBR',
    name: 'Brasília',
    region: 'BR-CO',
    hubTier: 'regional',
    lat: -15.8692,
    lon: -47.9208,
    produce: { general: 1.2, electronics: 0.9 },
    consume: { perishables: 1.2, machinery: 1.0, electronics: 1.0 },
  },
  {
    icao: 'SBGO',
    name: 'Goiânia',
    region: 'BR-CO',
    hubTier: 'regional',
    lat: -16.632,
    lon: -49.2207,
    produce: { perishables: 1.3, machinery: 1.0 },
    consume: { electronics: 0.9, general: 1.0 },
  },
  {
    icao: 'SBPJ',
    name: 'Palmas',
    region: 'BR-CO',
    hubTier: 'regional',
    lat: -10.2914,
    lon: -48.3572,
    ...dryRegional,
  },
  {
    icao: 'SBCY',
    name: 'Cuiabá',
    region: 'BR-CO',
    hubTier: 'spoke',
    lat: -15.6529,
    lon: -56.1167,
    produce: { perishables: 1.4, general: 1.0 },
    consume: { electronics: 0.8, machinery: 0.9 },
  },
  {
    icao: 'SBCG',
    name: 'Campo Grande',
    region: 'BR-CO',
    hubTier: 'spoke',
    lat: -20.4687,
    lon: -54.6725,
    produce: { perishables: 1.2, machinery: 0.9 },
    consume: { electronics: 0.8, general: 0.9 },
  },
  {
    icao: 'SBRD',
    name: 'Rondonópolis',
    region: 'BR-CO',
    hubTier: 'spoke',
    lat: -16.5861,
    lon: -54.7247,
    ...agriSpoke,
    produce: { perishables: 1.35, general: 1.15, supplies: 1.0 },
    consume: { electronics: 0.85, machinery: 0.95, general: 0.95 },
  },
  {
    icao: 'SBSI',
    name: 'Sinop',
    region: 'BR-CO',
    hubTier: 'spoke',
    lat: -11.885,
    lon: -55.5861,
    ...agriSpoke,
  },
  {
    icao: 'SBAT',
    name: 'Alta Floresta',
    region: 'BR-CO',
    hubTier: 'spoke',
    lat: -9.8661,
    lon: -56.1064,
    ...agriSpoke,
  },
  {
    icao: 'SBCR',
    name: 'Corumbá',
    region: 'BR-CO',
    hubTier: 'spoke',
    lat: -19.0119,
    lon: -57.6714,
    produce: { perishables: 1.15, general: 1.05 },
    consume: { electronics: 0.85, machinery: 0.85 },
  },
  {
    icao: 'SBBW',
    name: 'Barra do Garças',
    region: 'BR-CO',
    hubTier: 'spoke',
    lat: -15.8611,
    lon: -52.3889,
    ...agriSpoke,
  },
  {
    icao: 'SBDO',
    name: 'Dourados',
    region: 'BR-CO',
    hubTier: 'spoke',
    lat: -22.2014,
    lon: -54.9264,
    ...agriSpoke,
  },
];

export const BR_CAREER_HUB_COUNT = 60;

/** Auto feeder corridors so every BR hub has ≥2 partners. */
export function buildBrFeederCorridors(
  hubs: readonly BrCareerHubDef[] = BR_CAREER_HUBS,
  existing: readonly CareerCorridorEdge[] = [],
): CareerCorridorEdge[] {
  return buildCareerFeederCorridors(hubs, existing);
}

export function assertBrCareerHubCatalog(): void {
  if (BR_CAREER_HUBS.length !== BR_CAREER_HUB_COUNT) {
    throw new Error(
      `BR_CAREER_HUBS length ${BR_CAREER_HUBS.length} !== ${BR_CAREER_HUB_COUNT}`,
    );
  }
  const seen = new Set<string>();
  const byRegion: Record<string, number> = {};
  for (const h of BR_CAREER_HUBS) {
    const id = h.icao.toUpperCase();
    if (seen.has(id)) throw new Error(`Duplicate BR hub ${id}`);
    seen.add(id);
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) {
      throw new Error(`Bad coords for ${id}`);
    }
    byRegion[h.region] = (byRegion[h.region] ?? 0) + 1;
  }
  const expected: Record<BrCareerRegion, number> = {
    'BR-SE': 13,
    'BR-S': 11,
    'BR-NE': 14,
    'BR-N': 11,
    'BR-CO': 11,
  };
  for (const [region, n] of Object.entries(expected)) {
    if (byRegion[region] !== n) {
      throw new Error(
        `BR region ${region} has ${byRegion[region] ?? 0} hubs, expected ${n}`,
      );
    }
  }
}
