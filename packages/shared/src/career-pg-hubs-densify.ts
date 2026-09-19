/**
 * Pg densify Wave A Oceania — commercial spokes (MSFS + SimBrief).
 * Merged into PG_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { PgCareerRegion } from './career-pg-hubs.js';

type PgDensifyHub = {
  icao: string;
  name: string;
  region: PgCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave A Oceania densify (+12). */
export const PG_DENSIFY_HUBS: readonly PgDensifyHub[] = [
  {
    icao: 'AYWK',
    name: "Wewak International Airport",
    region: 'PG-S',
    hubTier: 'spoke',
    lat: -3.58383,
    lon: 143.66901,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'AYMD',
    name: "Madang Airport",
    region: 'PG-S',
    hubTier: 'spoke',
    lat: -5.20708,
    lon: 145.789,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'AYTK',
    name: "Tokua Airport",
    region: 'PG-S',
    hubTier: 'spoke',
    lat: -4.34046,
    lon: 152.38001,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'AYGA',
    name: "Goroka Airport",
    region: 'PG-S',
    hubTier: 'spoke',
    lat: -6.08169,
    lon: 145.392,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'AYGN',
    name: "Gurney Airport",
    region: 'PG-S',
    hubTier: 'spoke',
    lat: -10.3115,
    lon: 150.334,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'AYHK',
    name: "Hoskins Airport",
    region: 'PG-S',
    hubTier: 'spoke',
    lat: -5.46385,
    lon: 150.40733,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'AYKM',
    name: "Kerema Airport",
    region: 'PG-S',
    hubTier: 'spoke',
    lat: -7.96361,
    lon: 145.771,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'AYKV',
    name: "Kavieng Airport",
    region: 'PG-S',
    hubTier: 'spoke',
    lat: -2.5794,
    lon: 150.808,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'AYMH',
    name: "Mount Hagen Kagamuga Airport",
    region: 'PG-S',
    hubTier: 'spoke',
    lat: -5.82821,
    lon: 144.29941,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'AYMN',
    name: "Mendi Airport",
    region: 'PG-S',
    hubTier: 'spoke',
    lat: -6.14774,
    lon: 143.657,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'AYMO',
    name: "Momote Airport",
    region: 'PG-S',
    hubTier: 'spoke',
    lat: -2.06189,
    lon: 147.424,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'AYVN',
    name: "Vanimo Airport",
    region: 'PG-S',
    hubTier: 'spoke',
    lat: -2.6926,
    lon: 141.3028,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
];

export const PG_DENSIFY_HUB_COUNT = PG_DENSIFY_HUBS.length;
