/**
 * Indonesia densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into ID_CAREER_HUBS. No bush strips.
 *
 * Homolog traps: skip WARS/WAHS Semarang, WAHI Yogya, WAJJ Papua, WAMM Manado,
 * WIMK Polonia, WIDD Batam, WARQ Solo (absent), WAJW Wamena (absent), WIPT Padang (absent).
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { IdCareerRegion } from './career-id-hubs.js';

type IdDensifyHub = {
  icao: string;
  name: string;
  region: IdCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

const city = {
  produce: { general: 1.2, electronics: 1.1, supplies: 1.0 },
  consume: { perishables: 1.1, general: 1.0, machinery: 0.9 },
} as const;

const drySpoke = {
  produce: { general: 1.1, supplies: 1.0, perishables: 1.05 },
  consume: { electronics: 0.9, machinery: 0.85 },
} as const;

/** ID densify (+13) — MSFS-homologated replacements for Wave B traps. */
export const ID_DENSIFY_HUBS: readonly IdDensifyHub[] = [
  {
    icao: 'WICC',
    name: 'Bandung Husein Sastranegara',
    region: 'ID-J',
    hubTier: 'regional',
    lat: -6.90063,
    lon: 107.576,
    ...city,
  },
  {
    icao: 'WIJJ',
    name: 'Jambi Sultan Thaha',
    region: 'ID-S',
    hubTier: 'regional',
    lat: -1.638,
    lon: 103.644,
    ...city,
  },
  {
    icao: 'WIDN',
    name: 'Tanjung Pinang Raja Haji Fisabilillah',
    region: 'ID-S',
    hubTier: 'regional',
    lat: 0.92268,
    lon: 104.532,
    ...drySpoke,
  },
  {
    icao: 'WADL',
    name: 'Lombok International Airport',
    region: 'ID-K',
    hubTier: 'regional',
    lat: -8.75996,
    lon: 116.27817,
    ...city,
  },
  {
    icao: 'WAPP',
    name: 'Pattimura International Airport',
    region: 'ID-U',
    hubTier: 'regional',
    lat: -3.71026,
    lon: 128.089,
    ...city,
  },
  {
    // Palu Mutiara: WAML→WAFF (Indonesia ICAO renumber).
    icao: 'WAFF',
    name: 'Mutiara SIS Al-Jufrie Airport',
    region: 'ID-K',
    hubTier: 'regional',
    lat: -0.91854,
    lon: 119.90973,
    ...drySpoke,
  },
  {
    icao: 'WITT',
    name: 'Sultan Iskandar Muda International Airport',
    region: 'ID-S',
    hubTier: 'regional',
    lat: 5.52509,
    lon: 95.41997,
    ...city,
  },
  {
    icao: 'WIOO',
    name: 'Supadio International Airport',
    region: 'ID-K',
    hubTier: 'regional',
    lat: -0.15226,
    lon: 109.40449,
    ...city,
  },
  {
    icao: 'WAOO',
    name: 'Syamsudin Noor International Airport',
    region: 'ID-K',
    hubTier: 'regional',
    lat: -3.44011,
    lon: 114.76121,
    ...city,
  },
  {
    // Tarakan Juwata: WALR→WAQQ.
    icao: 'WAQQ',
    name: 'Tarakan Juwata',
    region: 'ID-K',
    hubTier: 'spoke',
    lat: 3.32669,
    lon: 117.566,
    ...drySpoke,
  },
  {
    icao: 'WABB',
    name: 'Biak Frans Kaisiepo',
    region: 'ID-U',
    hubTier: 'regional',
    lat: -1.19014,
    lon: 136.108,
    ...city,
  },
  {
    // Not major — WIII remains Jakarta cargo major.
    icao: 'WIHH',
    name: 'Halim Perdanakusuma International Airport',
    region: 'ID-J',
    hubTier: 'regional',
    lat: -6.26699,
    lon: 106.89032,
    ...city,
  },
  {
    // Pangkal Pinang Depati Amir: WIPB/WIPK absent in MSFS — stock is WIKK (AIP).
    icao: 'WIKK',
    name: 'Pangkal Pinang Depati Amir',
    region: 'ID-S',
    hubTier: 'spoke',
    lat: -2.162,
    lon: 106.139,
    ...drySpoke,
  },
];

export const ID_DENSIFY_HUB_COUNT = ID_DENSIFY_HUBS.length;
