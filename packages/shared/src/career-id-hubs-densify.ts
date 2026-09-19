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






  // Wave A Asia densify (+6)
  {
    icao: 'WIBB',
    name: "Sultan Syarif Kasim II International Airport",
    region: 'ID-S',
    hubTier: 'spoke',
    lat: 0.45865,
    lon: 101.44432,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'WAKK',
    name: "Mopah International Airport",
    region: 'ID-U',
    hubTier: 'spoke',
    lat: -8.5239,
    lon: 140.41969,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'WILL',
    name: "Radin Inten II International Airport",
    region: 'ID-S',
    hubTier: 'spoke',
    lat: -5.2468,
    lon: 105.18253,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'WICA',
    name: "Kertajati International Airport",
    region: 'ID-J',
    hubTier: 'spoke',
    lat: -6.64738,
    lon: 108.16556,
    produce: { machinery: 1.25, electronics: 1.15, general: 1.15 },
    consume: { perishables: 1.05, supplies: 1 },
  },
  {
    icao: 'WALS',
    name: "Aji Pangeran Tumenggung Pranoto International Airport",
    region: 'ID-K',
    hubTier: 'spoke',
    lat: -0.37448,
    lon: 117.25013,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'WADB',
    name: "Sultan Muhammad Salahuddin Airport",
    region: 'ID-U',
    hubTier: 'spoke',
    lat: -8.53718,
    lon: 118.685,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },

  // Wave B Asia densify (+6)
  {
    icao: 'WAGG',
    name: "Tjilik Riwut Airport",
    region: 'ID-K',
    hubTier: 'spoke',
    lat: -2.22715,
    lon: 113.94339,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'WAFP',
    name: "Kasiguncu Airport",
    region: 'ID-S',
    hubTier: 'spoke',
    lat: -1.41412,
    lon: 120.65924,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'WABI',
    name: "Douw Aturure Airport",
    region: 'ID-U',
    hubTier: 'spoke',
    lat: -3.39797,
    lon: 135.39307,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
  {
    icao: 'WABO',
    name: "Stevanus Rumbewas Airport",
    region: 'ID-U',
    hubTier: 'spoke',
    lat: -1.82842,
    lon: 136.0624,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'WAEE',
    name: "Sultan Babullah Airport",
    region: 'ID-S',
    hubTier: 'spoke',
    lat: 0.83101,
    lon: 127.38161,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'WAEW',
    name: "Pitu Airport",
    region: 'ID-S',
    hubTier: 'spoke',
    lat: 2.04599,
    lon: 128.325,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },

  // Wave C Asia densify (+6)
  {
    icao: 'WAFW',
    name: "Syukuran Aminuddin Amir Airport",
    region: 'ID-S',
    hubTier: 'spoke',
    lat: -1.03589,
    lon: 122.77393,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'WAHL',
    name: "Tunggul Wulung Airport",
    region: 'ID-J',
    hubTier: 'spoke',
    lat: -7.64506,
    lon: 109.034,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'WAPN',
    name: "Namniwel Airport",
    region: 'ID-U',
    hubTier: 'spoke',
    lat: -3.14316,
    lon: 126.97647,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
  {
    icao: 'WAJO',
    name: "Oksibil Airport",
    region: 'ID-J',
    hubTier: 'spoke',
    lat: -4.9071,
    lon: 140.6277,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'WAON',
    name: "Warukin Airport",
    region: 'ID-K',
    hubTier: 'spoke',
    lat: -2.21656,
    lon: 115.436,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'WAMH',
    name: "Naha Airport",
    region: 'ID-J',
    hubTier: 'spoke',
    lat: 3.68478,
    lon: 125.52716,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
];

export const ID_DENSIFY_HUB_COUNT = ID_DENSIFY_HUBS.length;
