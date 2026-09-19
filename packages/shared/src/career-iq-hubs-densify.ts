/**
 * IQ densify Wave A — commercial spokes (MSFS + SimBrief).
 * Merged into IQ_CAREER_HUBS.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { IqCareerRegion } from './career-iq-hubs.js';

type IqDensifyHub = {
  icao: string;
  name: string;
  region: IqCareerRegion;
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** Wave A MENA densify (+2). */
export const IQ_DENSIFY_HUBS: readonly IqDensifyHub[] = [
  {
    icao: 'ORQW',
    name: "Qayyarah West Airport",
    region: 'IQ-N',
    hubTier: 'spoke',
    lat: 35.7672,
    lon: 43.1251,
    produce: { general: 1.2, electronics: 1.1, supplies: 1 },
    consume: { perishables: 1.1, machinery: 0.9 },
  },
  {
    icao: 'ORAA',
    name: "Al Asad Air Base",
    region: 'IQ-C',
    hubTier: 'spoke',
    lat: 33.7856,
    lon: 42.4412,
    produce: { general: 1.1, supplies: 1, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
];

export const IQ_DENSIFY_HUB_COUNT = IQ_DENSIFY_HUBS.length;
