/**
 * NPC airframe variants for display + cargo ceilings.
 *
 * Prefer homologated player Market SKUs (`career-player-airframes`) whenever
 * that class has enabled entries — required for future contract-pilot Watch/OFP.
 * Classes without a player catalog entry fall back to the abstract FSLTL-derived
 * pool (label + optional cargo only; not a player flight_model).
 *
 * Abstract candidates: node scripts/scrape-fsltl-traffic-catalog.mjs
 */
import type { FreighterClassId } from './types/career-economy.js';
import type { NpcFreighter } from './types/career-economy.js';
import { getAircraftClass } from './career-mission.js';
import {
  findCareerPlayerAirframe,
  isCareerPlayerAirframeEnabled,
  listCareerPlayerAirframes,
  type CareerPlayerAirframe,
} from './career-player-airframes.js';

export type NpcAirframeVariant = {
  /** Player typeId or abstract ICAO-ish code (B738F, 208B, …). */
  typeId: string;
  aircraftClassId: FreighterClassId;
  /** Short board label. */
  label: string;
  /** True when type looks like a freighter conversion / dedicated freighter. */
  freighter: boolean;
  /**
   * Optional cargo ceiling (kg). When set, NPC bids use
   * min(class.maxCargoKg, maxCargoKg). Omitted when FSLTL numbers were junk.
   */
  maxCargoKg?: number;
  /** True when this variant is a player-homologated Market SKU. */
  homologated?: boolean;
};

function playerToNpcVariant(airframe: CareerPlayerAirframe): NpcAirframeVariant {
  return {
    typeId: airframe.typeId,
    aircraftClassId: airframe.aircraftClassId,
    label: airframe.label,
    freighter: true,
    ...(typeof airframe.maxCargoKg === 'number' &&
    Number.isFinite(airframe.maxCargoKg) &&
    airframe.maxCargoKg > 0
      ? { maxCargoKg: Math.floor(airframe.maxCargoKg) }
      : {}),
    homologated: true,
  };
}

/** Enabled player airframes for this class, as NPC variant rows. */
export function listHomologatedNpcAirframesForClass(
  classId: FreighterClassId,
): NpcAirframeVariant[] {
  return listCareerPlayerAirframes(classId).map(playerToNpcVariant);
}

export function npcAirframeIsHomologated(
  typeId: string | null | undefined,
): boolean {
  const airframe = findCareerPlayerAirframe(typeId);
  return isCareerPlayerAirframeEnabled(airframe);
}

/** Contract-pilot offers require a flyable homologated SKU. */
export function npcCanOfferContractPilot(
  npc: Pick<NpcFreighter, 'airframeTypeId'>,
): boolean {
  return npcAirframeIsHomologated(npc.airframeTypeId);
}

/**
 * Hand-curated from fsltl-traffic-base scrape (71 unique flight_model.cfg).
 * Payload overrides only where MTOW−OEW−fuel looked plausible.
 * Used only when the player catalog has no enabled SKU for the class.
 */
export const NPC_AIRFRAME_VARIANTS: readonly NpcAirframeVariant[] = [
  // —— narrow (prefer *F; pax types are label-only or mild cargo) ——
  {
    typeId: 'A321F',
    aircraftClassId: 'narrow_freighter',
    label: 'A321 freighter',
    freighter: true,
    maxCargoKg: 16_366,
  },
  {
    typeId: 'B738F',
    aircraftClassId: 'narrow_freighter',
    label: '737-800 freighter',
    freighter: true,
    // FSLTL B738F weights were unusable — keep class ceiling.
  },
  {
    typeId: 'B737F',
    aircraftClassId: 'narrow_freighter',
    label: '737-700 freighter',
    freighter: true,
  },
  {
    typeId: 'B734F',
    aircraftClassId: 'narrow_freighter',
    label: '737-400 freighter',
    freighter: true,
  },
  {
    typeId: 'B733F',
    aircraftClassId: 'narrow_freighter',
    label: '737-300 freighter',
    freighter: true,
  },
  {
    typeId: 'AT75F',
    aircraftClassId: 'narrow_freighter',
    label: 'ATR 72 freighter',
    freighter: true,
  },
  {
    typeId: 'SF34F',
    aircraftClassId: 'narrow_freighter',
    label: 'Saab 340 freighter',
    freighter: true,
  },
  {
    typeId: 'BCS3',
    aircraftClassId: 'narrow_freighter',
    label: 'A220-300',
    freighter: false,
    maxCargoKg: 13_260,
  },
  {
    typeId: 'B738',
    aircraftClassId: 'narrow_freighter',
    label: '737-800',
    freighter: false,
  },
  {
    typeId: 'A320',
    aircraftClassId: 'narrow_freighter',
    label: 'A320',
    freighter: false,
  },
  {
    typeId: 'E190',
    aircraftClassId: 'narrow_freighter',
    label: 'E190',
    freighter: false,
  },
  {
    typeId: 'DH8D',
    aircraftClassId: 'narrow_freighter',
    label: 'Dash 8-400',
    freighter: false,
  },

  // —— wide ——
  {
    typeId: 'MD11F',
    aircraftClassId: 'wide_freighter',
    label: 'MD-11F',
    freighter: true,
    maxCargoKg: 43_875,
  },
  {
    typeId: 'A306F',
    aircraftClassId: 'wide_freighter',
    label: 'A300-600F',
    freighter: true,
    // Cap to class table — FSLTL payload was optimistic vs Skyline wide class.
    maxCargoKg: 90_000,
  },
  {
    typeId: 'A30BF',
    aircraftClassId: 'wide_freighter',
    label: 'A300B4 freighter',
    freighter: true,
    maxCargoKg: 61_246,
  },
  {
    typeId: 'A332F',
    aircraftClassId: 'wide_freighter',
    label: 'A330-200F',
    freighter: true,
  },
  {
    typeId: 'A333F',
    aircraftClassId: 'wide_freighter',
    label: 'A330-300 freighter',
    freighter: true,
  },
  {
    typeId: 'B744F',
    aircraftClassId: 'wide_freighter',
    label: '747-400F',
    freighter: true,
  },
  {
    typeId: 'B748F',
    aircraftClassId: 'wide_freighter',
    label: '747-8F',
    freighter: true,
  },
  {
    typeId: 'B77LF',
    aircraftClassId: 'wide_freighter',
    label: '777-200LRF',
    freighter: true,
  },
  {
    typeId: 'B763F',
    aircraftClassId: 'wide_freighter',
    label: '767-300F',
    freighter: true,
  },
  {
    typeId: 'B788',
    aircraftClassId: 'wide_freighter',
    label: '787-8',
    freighter: false,
    maxCargoKg: 27_851,
  },

  // —— light turboprop / regional ——
  {
    typeId: '208B',
    aircraftClassId: 'light_turboprop',
    label: 'Cessna 208B',
    freighter: false,
    maxCargoKg: 673,
  },
  {
    typeId: 'B350',
    aircraftClassId: 'light_turboprop',
    label: 'King Air 350',
    freighter: false,
    maxCargoKg: 1_377,
  },
  {
    typeId: 'TBM930',
    aircraftClassId: 'light_turboprop',
    label: 'TBM 930',
    freighter: false,
    maxCargoKg: 395,
  },
  {
    typeId: 'DA62',
    aircraftClassId: 'light_turboprop',
    label: 'DA62',
    freighter: false,
    maxCargoKg: 495,
  },
  {
    typeId: 'C25C',
    aircraftClassId: 'light_turboprop',
    label: 'Citation CJ4',
    freighter: false,
    maxCargoKg: 676,
  },

  // —— light GA ——
  {
    typeId: 'C172SP',
    aircraftClassId: 'light_ga',
    label: 'C172SP',
    freighter: false,
    maxCargoKg: 249,
  },
  {
    typeId: 'C152',
    aircraftClassId: 'light_ga',
    label: 'C152',
    freighter: false,
    maxCargoKg: 200,
  },
  {
    typeId: 'G36',
    aircraftClassId: 'light_ga',
    label: 'Bonanza G36',
    freighter: false,
    maxCargoKg: 276,
  },
  {
    typeId: 'P28A',
    aircraftClassId: 'light_ga',
    label: 'Cherokee',
    freighter: false,
    maxCargoKg: 301,
  },
  {
    typeId: 'DA40_NG',
    aircraftClassId: 'light_ga',
    label: 'DA40 NG',
    freighter: false,
    maxCargoKg: 309,
  },
  {
    typeId: 'DR400',
    aircraftClassId: 'light_ga',
    label: 'DR400',
    freighter: false,
    maxCargoKg: 221,
  },
  {
    typeId: 'VL3',
    aircraftClassId: 'light_ga',
    label: 'VL3',
    freighter: false,
    maxCargoKg: 125,
  },
  // —— light jet (bizjets / air taxi cargo) ——
  {
    typeId: 'LJ35',
    aircraftClassId: 'light_jet',
    label: 'Learjet 35',
    freighter: false,
    maxCargoKg: 1_450,
  },
  {
    typeId: 'C25B',
    aircraftClassId: 'light_jet',
    label: 'Citation CJ3',
    freighter: false,
    maxCargoKg: 900,
  },
  {
    typeId: 'C56X',
    aircraftClassId: 'light_jet',
    label: 'Citation XLS',
    freighter: false,
    maxCargoKg: 1_100,
  },
  {
    typeId: 'E55P',
    aircraftClassId: 'light_jet',
    label: 'Phenom 300',
    freighter: false,
    maxCargoKg: 1_000,
  },
  // —— medium piston (classic 4-engine / regional freighter) ——
  {
    typeId: 'DC6',
    aircraftClassId: 'medium_piston',
    label: 'Douglas DC-6',
    freighter: true,
    maxCargoKg: 10_000,
  },
  {
    typeId: 'DC6B',
    aircraftClassId: 'medium_piston',
    label: 'Douglas DC-6B',
    freighter: false,
    maxCargoKg: 8_500,
  },
];

const BY_CLASS: Record<FreighterClassId, NpcAirframeVariant[]> = {
  narrow_freighter: [],
  wide_freighter: [],
  medium_piston: [],
  light_jet: [],
  light_turboprop: [],
  light_ga: [],
};

for (const v of NPC_AIRFRAME_VARIANTS) {
  BY_CLASS[v.aircraftClassId]!.push(v);
}

const BY_TYPE = new Map(NPC_AIRFRAME_VARIANTS.map((v) => [v.typeId, v]));

export function listNpcAirframesForClass(
  classId: FreighterClassId,
): readonly NpcAirframeVariant[] {
  return BY_CLASS[classId] ?? [];
}

export function findNpcAirframe(typeId: string | undefined): NpcAirframeVariant | undefined {
  if (!typeId) return undefined;
  const player = findCareerPlayerAirframe(typeId);
  if (player) return playerToNpcVariant(player);
  return BY_TYPE.get(typeId);
}

/**
 * Prefer homologated player SKUs when the class has any enabled.
 * Otherwise abstract FSLTL pool (freighter-coded ~70% when available).
 */
export function pickNpcAirframe(
  classId: FreighterClassId,
  rng: () => number,
): NpcAirframeVariant | undefined {
  const homologated = listHomologatedNpcAirframesForClass(classId);
  if (homologated.length > 0) {
    return homologated[Math.floor(rng() * homologated.length)]!;
  }
  const all = listNpcAirframesForClass(classId);
  if (all.length === 0) return undefined;
  const freighters = all.filter((v) => v.freighter);
  const pool =
    freighters.length > 0 && rng() < 0.7
      ? freighters
      : all;
  return pool[Math.floor(rng() * pool.length)]!;
}

/** Effective cargo ceiling for NPC bidding / claims. */
export function npcMaxCargoKg(npc: Pick<NpcFreighter, 'aircraftClassId' | 'maxCargoKg' | 'airframeTypeId'>): number {
  const aircraft = getAircraftClass(npc.aircraftClassId);
  const classMax = aircraft.maxCargoKg;
  if (typeof npc.maxCargoKg === 'number' && Number.isFinite(npc.maxCargoKg) && npc.maxCargoKg > 0) {
    return Math.min(classMax, Math.floor(npc.maxCargoKg));
  }
  const variant = findNpcAirframe(npc.airframeTypeId);
  if (
    variant?.maxCargoKg !== undefined &&
    Number.isFinite(variant.maxCargoKg) &&
    variant.maxCargoKg > 0
  ) {
    return Math.min(classMax, Math.floor(variant.maxCargoKg));
  }
  return classMax;
}

export function npcAirframeLabel(
  npc: Pick<NpcFreighter, 'aircraftClassId' | 'airframeTypeId'>,
): string {
  const variant = findNpcAirframe(npc.airframeTypeId);
  if (variant) return variant.label;
  return getAircraftClass(npc.aircraftClassId).name;
}
