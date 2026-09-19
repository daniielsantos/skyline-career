/**
 * Philippines densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into PH_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { PhCareerRegion } from './career-ph-hubs.js';

type PhDensifyHub = {
  icao: string;
  name: string;
  region: PhCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** PH densify (+8). */
export const PH_DENSIFY_HUBS: readonly PhDensifyHub[] = [
  {
    icao: 'RPVB',
    name: "Bacolod-Silay International Airport",
    region: 'PH-V',
    hubTier: 'regional',
    lat: 10.77624,
    lon: 123.01888,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'RPLK',
    name: "Bicol International Airport",
    region: 'PH-L',
    hubTier: 'regional',
    lat: 13.11191,
    lon: 123.67683,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    // RPSP Panglao mismatch in stock MSFS — use Tagbilaran RPVT for Bohol.
    icao: 'RPVT',
    name: "Tagbilaran Airport",
    region: 'PH-V',
    hubTier: 'regional',
    lat: 9.66408,
    lon: 123.853,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'RPMR',
    name: "General Santos International Airport",
    region: 'PH-M',
    hubTier: 'regional',
    lat: 6.05721,
    lon: 125.09624,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'RPVI',
    name: "Iloilo International Airport",
    region: 'PH-V',
    hubTier: 'regional',
    lat: 10.83302,
    lon: 122.49336,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'RPVK',
    name: "Kalibo International Airport",
    region: 'PH-V',
    hubTier: 'regional',
    lat: 11.6794,
    lon: 122.376,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    icao: 'RPLI',
    name: "Laoag International Airport",
    region: 'PH-L',
    hubTier: 'regional',
    lat: 18.17509,
    lon: 120.53101,
    produce: {"general":1.2,"electronics":1.1,"supplies":1},
    consume: {"perishables":1.1,"general":1,"machinery":0.9},
  },
  {
    // RPVE = Caticlan (Boracay), not Kalibo (RPVK already seeded).
    icao: 'RPVE',
    name: "Godofredo P. Ramos Airport",
    region: 'PH-V',
    hubTier: 'spoke',
    lat: 11.9245,
    lon: 121.952,
    produce: {"perishables":1.15,"general":1.1,"supplies":1.05},
    consume: {"electronics":1.0,"machinery":0.85},
  },






  // Wave A Asia densify (+5)
  {
    icao: 'RPMZ',
    name: "Zamboanga International Airport",
    region: 'PH-M',
    hubTier: 'spoke',
    lat: 6.92242,
    lon: 122.06,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'RPMC',
    name: "Cotabato (Awang) Airport",
    region: 'PH-M',
    hubTier: 'spoke',
    lat: 7.16475,
    lon: 124.20994,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'RPME',
    name: "Bancasi Airport",
    region: 'PH-M',
    hubTier: 'spoke',
    lat: 8.9515,
    lon: 125.4788,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'RPMG',
    name: "Dipolog Airport",
    region: 'PH-M',
    hubTier: 'spoke',
    lat: 8.60198,
    lon: 123.34188,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'RPMP',
    name: "Pagadian Airport",
    region: 'PH-M',
    hubTier: 'spoke',
    lat: 7.82563,
    lon: 123.45964,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
];

export const PH_DENSIFY_HUB_COUNT = PH_DENSIFY_HUBS.length;
