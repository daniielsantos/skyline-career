/**
 * IR densify Wave A — commercial spokes (MSFS + SimBrief).
 * Merged into IR_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { IrCareerRegion } from './career-ir-hubs.js';

type IrDensifyHub = {
  icao: string;
  name: string;
  region: IrCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave A MENA densify (+4). */
export const IR_DENSIFY_HUBS: readonly IrDensifyHub[] = [
  {
    icao: 'OIAW',
    name: "Qasem Soleimani International Airport",
    region: 'IR-S',
    hubTier: 'spoke',
    lat: 31.3364,
    lon: 48.76379,
    produce: { machinery: 1.25, electronics: 1.15, general: 1.15 },
    consume: { perishables: 1.05, supplies: 1 },
  },
  {
    icao: 'OIBB',
    name: "Bushehr Airport",
    region: 'IR-S',
    hubTier: 'spoke',
    lat: 28.9448,
    lon: 50.8346,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'OIBK',
    name: "Kish International Airport",
    region: 'IR-S',
    hubTier: 'spoke',
    lat: 26.52543,
    lon: 53.98046,
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1, machinery: 0.85 },
  },
  {
    icao: 'OITR',
    name: "Urmia Airport",
    region: 'IR-N',
    hubTier: 'spoke',
    lat: 37.6681,
    lon: 45.0687,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
];

export const IR_DENSIFY_HUB_COUNT = IR_DENSIFY_HUBS.length;
