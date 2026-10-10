/**
 * Brazil densify batch — commercial airports with scheduled service (MSFS + SimBrief).
 * Merged into BR_CAREER_HUBS. No new bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';

type BrDensifyHub = {
  icao: string;
  name: string;
  region: 'BR-S' | 'BR-SE' | 'BR-NE' | 'BR-N' | 'BR-CO';
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

const drySpoke = {
  produce: { general: 1.05, supplies: 1.0 },
  consume: { electronics: 0.85, machinery: 0.85, perishables: 0.9 },
} as const;

const agriSpoke = {
  produce: { perishables: 1.25, general: 1.0, supplies: 0.95 },
  consume: { electronics: 0.85, machinery: 0.85, general: 0.9 },
} as const;

const amazonSpoke = {
  produce: { general: 1.1, perishables: 1.05, supplies: 0.95 },
  consume: { electronics: 0.85, machinery: 0.9, perishables: 1.05 },
} as const;

const dryRegional = {
  produce: { general: 1.2, supplies: 1.1, perishables: 1.05 },
  consume: { electronics: 0.95, machinery: 0.9 },
} as const;

/** BR-SE densify (+15). Santos / GRU / GIG catchment. */
export const BR_SE_DENSIFY_HUBS: readonly BrDensifyHub[] = [
  {
    icao: 'SBRJ',
    name: 'Rio de Janeiro/Santos Dumont',
    region: 'BR-SE',
    hubTier: 'regional',
    lat: -22.9104,
    lon: -43.1631,
    produce: { general: 1.25, supplies: 1.15, perishables: 1.1 },
    consume: { electronics: 1.0, machinery: 0.95 },
  },
  {
    icao: 'SBSP',
    name: 'São Paulo/Congonhas',
    region: 'BR-SE',
    hubTier: 'regional',
    lat: -23.6261,
    lon: -46.6553,
    produce: { electronics: 1.2, general: 1.25, supplies: 1.1 },
    consume: { perishables: 1.1, machinery: 0.95 },
  },
  {
    icao: 'SBBH',
    name: 'Belo Horizonte/Pampulha',
    region: 'BR-SE',
    hubTier: 'spoke',
    lat: -19.8512,
    lon: -43.9506,
    ...drySpoke,
  },
  {
    icao: 'SBJF',
    name: 'Juiz de Fora/Francisco de Assis',
    region: 'BR-SE',
    hubTier: 'spoke',
    lat: -21.7916,
    lon: -43.3509,
    ...drySpoke,
  },
  {
    icao: 'SBPC',
    name: 'Poços de Caldas',
    region: 'BR-SE',
    hubTier: 'spoke',
    lat: -21.8434,
    lon: -46.5692,
    ...agriSpoke,
  },
  {
    icao: 'SBCP',
    name: 'Campos dos Goytacazes',
    region: 'BR-SE',
    hubTier: 'spoke',
    lat: -21.6983,
    lon: -41.3077,
    produce: { machinery: 1.15, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.85, perishables: 0.9 },
  },
  {
    icao: 'SBCB',
    name: 'Cabo Frio',
    region: 'BR-SE',
    hubTier: 'spoke',
    lat: -22.9217,
    lon: -42.0742,
    ...drySpoke,
  },
  {
    icao: 'SBME',
    name: 'Macaé',
    region: 'BR-SE',
    hubTier: 'spoke',
    lat: -22.343,
    lon: -41.766,
    produce: { machinery: 1.25, supplies: 1.15, general: 1.05 },
    consume: { electronics: 0.9, perishables: 0.9 },
  },
  {
    icao: 'SBAE',
    name: 'Bauru',
    region: 'BR-SE',
    hubTier: 'spoke',
    lat: -22.1608,
    lon: -49.0703,
    ...drySpoke,
  },
  {
    icao: 'SBAQ',
    name: 'Araraquara',
    region: 'BR-SE',
    hubTier: 'spoke',
    lat: -21.812,
    lon: -48.133,
    ...drySpoke,
  },
  {
    icao: 'SBAX',
    name: 'Araxá',
    region: 'BR-SE',
    hubTier: 'spoke',
    lat: -19.5632,
    lon: -46.9604,
    ...agriSpoke,
  },
  {
    icao: 'SBGV',
    name: 'Governador Valadares',
    region: 'BR-SE',
    hubTier: 'spoke',
    lat: -18.8959,
    lon: -41.9829,
    ...drySpoke,
  },
  {
    icao: 'SBIP',
    name: 'Ipatinga',
    region: 'BR-SE',
    hubTier: 'spoke',
    lat: -19.4707,
    lon: -42.4876,
    ...drySpoke,
  },
  {
    icao: 'SBMK',
    name: 'Montes Claros',
    region: 'BR-SE',
    hubTier: 'spoke',
    lat: -16.7069,
    lon: -43.8189,
    ...drySpoke,
  },
  {
    icao: 'SBZM',
    name: 'Juiz de Fora',
    region: 'BR-SE',
    hubTier: 'spoke',
    lat: -21.5131,
    lon: -43.1731,
    ...drySpoke,
  },
];

/** BR-S densify (+9). Paranaguá / Rio Grande catchment. */
export const BR_S_DENSIFY_HUBS: readonly BrDensifyHub[] = [
  {
    icao: 'SBSM',
    name: 'Santa Maria',
    region: 'BR-S',
    hubTier: 'spoke',
    lat: -29.7114,
    lon: -53.6882,
    ...drySpoke,
  },
  {
    icao: 'SBPF',
    name: 'Passo Fundo',
    region: 'BR-S',
    hubTier: 'spoke',
    lat: -28.2439,
    lon: -52.3266,
    ...agriSpoke,
  },
  {
    icao: 'SBNM',
    name: 'Santo Ângelo',
    region: 'BR-S',
    hubTier: 'spoke',
    lat: -28.2817,
    lon: -54.1694,
    ...agriSpoke,
  },
  {
    icao: 'SBUG',
    name: 'Uruguaiana/Rubem Berta',
    region: 'BR-S',
    hubTier: 'spoke',
    lat: -29.7822,
    lon: -57.0382,
    ...agriSpoke,
  },
  {
    icao: 'SBBG',
    name: 'Bagé',
    region: 'BR-S',
    hubTier: 'spoke',
    lat: -31.3905,
    lon: -54.1199,
    ...drySpoke,
  },
  {
    icao: 'SBJA',
    name: 'Jaguaruna',
    region: 'BR-S',
    hubTier: 'spoke',
    lat: -28.6753,
    lon: -49.0596,
    ...drySpoke,
  },
  {
    icao: 'SBLJ',
    name: 'Lages',
    region: 'BR-S',
    hubTier: 'spoke',
    lat: -27.7821,
    lon: -50.2815,
    ...agriSpoke,
  },
  {
    icao: 'SBMG',
    name: 'Maringá',
    region: 'BR-S',
    hubTier: 'spoke',
    lat: -23.4761,
    lon: -52.0162,
    ...agriSpoke,
  },
  {
    icao: 'SSZW',
    name: 'Ponta Grossa',
    region: 'BR-S',
    hubTier: 'spoke',
    lat: -25.1845,
    lon: -50.1438,
    ...agriSpoke,
  },
];

/** BR-NE densify (+10). Suape + interior NE. */
export const BR_NE_DENSIFY_HUBS: readonly BrDensifyHub[] = [
  {
    icao: 'SBKG',
    name: 'Campina Grande',
    region: 'BR-NE',
    hubTier: 'regional',
    lat: -7.2699,
    lon: -35.8963,
    ...dryRegional,
  },
  {
    icao: 'SBMS',
    name: 'Mossoró/Dix-Sept Rosado',
    region: 'BR-NE',
    hubTier: 'spoke',
    lat: -5.2019,
    lon: -37.3643,
    ...agriSpoke,
  },
  {
    icao: 'SBFN',
    name: 'Fernando de Noronha',
    region: 'BR-NE',
    hubTier: 'spoke',
    lat: -3.8547,
    lon: -32.4233,
    produce: { perishables: 1.15, general: 1.0, supplies: 0.95 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'SBQV',
    name: 'Vitória da Conquista',
    region: 'BR-NE',
    hubTier: 'spoke',
    lat: -14.8635,
    lon: -40.8631,
    ...agriSpoke,
  },
  {
    icao: 'SBUF',
    name: 'Paulo Afonso',
    region: 'BR-NE',
    hubTier: 'spoke',
    lat: -9.4007,
    lon: -38.2506,
    produce: { machinery: 1.15, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.85, perishables: 0.9 },
  },
  {
    icao: 'SBLE',
    name: 'Lençóis Chapada Diamantina',
    region: 'BR-NE',
    hubTier: 'spoke',
    lat: -12.4825,
    lon: -41.277,
    ...drySpoke,
  },
  {
    icao: 'SDIY',
    name: 'Feira de Santana/João Durval Carneiro',
    region: 'BR-NE',
    hubTier: 'spoke',
    lat: -12.2003,
    lon: -38.9065,
    ...agriSpoke,
  },
  {
    icao: 'SBCV',
    name: 'Caravelas',
    region: 'BR-NE',
    hubTier: 'spoke',
    lat: -17.6523,
    lon: -39.2531,
    ...drySpoke,
  },
  {
    icao: 'SBJE',
    name: 'Jericoacoara',
    region: 'BR-NE',
    hubTier: 'spoke',
    lat: -2.9064,
    lon: -40.3573,
    ...drySpoke,
  },
  {
    icao: 'SBPB',
    name: 'Parnaíba',
    region: 'BR-NE',
    hubTier: 'spoke',
    lat: -2.8937,
    lon: -41.732,
    ...drySpoke,
  },
];

/** BR-N densify (+8 network). Manaus / Belém feeders — no bush. */
export const BR_N_DENSIFY_HUBS: readonly BrDensifyHub[] = [
  {
    icao: 'SBCJ',
    name: 'Carajás',
    region: 'BR-N',
    hubTier: 'regional',
    lat: -6.1153,
    lon: -50.0035,
    produce: { machinery: 1.4, general: 1.15, supplies: 1.1 },
    consume: { electronics: 0.9, perishables: 0.95 },
  },
  {
    icao: 'SBIH',
    name: 'Itaituba',
    region: 'BR-N',
    hubTier: 'spoke',
    lat: -4.2422,
    lon: -56.0006,
    ...amazonSpoke,
  },
  {
    icao: 'SBTB',
    name: 'Trombetas',
    region: 'BR-N',
    hubTier: 'spoke',
    lat: -1.4896,
    lon: -56.3968,
    produce: { machinery: 1.3, general: 1.1, supplies: 1.05 },
    consume: { electronics: 0.85, perishables: 0.95 },
  },
  {
    icao: 'SBMY',
    name: 'Manicoré',
    region: 'BR-N',
    hubTier: 'spoke',
    lat: -5.8114,
    lon: -61.2783,
    ...amazonSpoke,
  },
  {
    icao: 'SBTU',
    name: 'Tucuruí',
    region: 'BR-N',
    hubTier: 'spoke',
    lat: -3.785,
    lon: -49.72,
    produce: { machinery: 1.2, general: 1.1, supplies: 1.05 },
    consume: { electronics: 0.85, perishables: 0.95 },
  },
  {
    icao: 'SBJI',
    name: 'Ji-Paraná',
    region: 'BR-N',
    hubTier: 'spoke',
    lat: -10.8706,
    lon: -61.8465,
    ...amazonSpoke,
  },
  {
    icao: 'SBTF',
    name: 'Tefé',
    region: 'BR-N',
    hubTier: 'spoke',
    lat: -3.3829,
    lon: -64.7241,
    ...amazonSpoke,
  },
  {
    icao: 'SBUA',
    name: 'São Gabriel da Cachoeira',
    region: 'BR-N',
    hubTier: 'spoke',
    lat: -0.1484,
    lon: -66.9855,
    ...amazonSpoke,
  },
];

/** BR-CO densify (+8). Cerrado / agri. */
export const BR_CO_DENSIFY_HUBS: readonly BrDensifyHub[] = [
  {
    icao: 'SBAN',
    name: 'Anápolis',
    region: 'BR-CO',
    hubTier: 'spoke',
    lat: -16.2292,
    lon: -48.9643,
    produce: { machinery: 1.2, general: 1.15, supplies: 1.1 },
    consume: { electronics: 0.9, perishables: 0.95 },
  },
  {
    icao: 'SBCN',
    name: 'Caldas Novas',
    region: 'BR-CO',
    hubTier: 'spoke',
    lat: -17.725,
    lon: -48.61,
    ...drySpoke,
  },
  {
    icao: 'SBVH',
    name: 'Vilhena',
    region: 'BR-CO',
    hubTier: 'spoke',
    lat: -12.6944,
    lon: -60.0983,
    ...agriSpoke,
  },
  {
    icao: 'SWKC',
    name: 'Cáceres',
    region: 'BR-CO',
    hubTier: 'spoke',
    lat: -16.0436,
    lon: -57.6406,
    ...agriSpoke,
  },
  {
    icao: 'SBDB',
    name: 'Bonito',
    region: 'BR-CO',
    hubTier: 'spoke',
    lat: -21.2473,
    lon: -56.4525,
    ...drySpoke,
  },
  {
    icao: 'SBPN',
    name: 'Porto Nacional',
    region: 'BR-CO',
    hubTier: 'spoke',
    lat: -10.7194,
    lon: -48.3997,
    ...agriSpoke,
  },
  {
    icao: 'SBPP',
    name: 'Ponta Porã',
    region: 'BR-CO',
    hubTier: 'spoke',
    lat: -22.5496,
    lon: -55.7026,
    ...agriSpoke,
  },
  {
    icao: 'SWGN',
    name: 'Araguaína',
    region: 'BR-CO',
    hubTier: 'spoke',
    lat: -7.2279,
    lon: -48.2405,
    ...agriSpoke,
  },
];

export const BR_DENSIFY_HUB_COUNT =
  BR_SE_DENSIFY_HUBS.length +
  BR_S_DENSIFY_HUBS.length +
  BR_NE_DENSIFY_HUBS.length +
  BR_N_DENSIFY_HUBS.length +
  BR_CO_DENSIFY_HUBS.length;
