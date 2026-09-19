/**
 * DZ densify Wave A — commercial spokes (MSFS + SimBrief).
 * Merged into DZ_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { DzCareerRegion } from './career-dz-hubs.js';

type DzDensifyHub = {
  icao: string;
  name: string;
  region: DzCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave A MENA densify (+3). */
export const DZ_DENSIFY_HUBS: readonly DzDensifyHub[] = [
  {
    icao: 'DABB',
    name: "Annaba Rabah Bitat Airport",
    region: 'DZ-E',
    hubTier: 'spoke',
    lat: 36.82678,
    lon: 7.81334,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'DAUG',
    name: "Noumérat - Moufdi Zakaria Airport",
    region: 'DZ-N',
    hubTier: 'spoke',
    lat: 32.3841,
    lon: 3.79411,
    produce: { perishables: 1.35, general: 1.1, supplies: 1 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  {
    icao: 'DAAT',
    name: "Aguenar – Hadj Bey Akhamok Airport",
    region: 'DZ-W',
    hubTier: 'spoke',
    lat: 22.81099,
    lon: 5.45083,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
];

export const DZ_DENSIFY_HUB_COUNT = DZ_DENSIFY_HUBS.length;
