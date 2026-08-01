/**
 * Concrete aircraft available to the player. Economic limits remain on
 * FreighterClassId; this catalog controls the model, label, roles pack and
 * SimBrief variant carried by market listings and owned aircraft.
 *
 * The homologation wizard upserts the JSON source after a successful promote.
 * Set `enabled: false` (or use the agent CLI) to pull a model off the Market
 * without deleting the homologation / roles pack.
 *
 * Glass / TC variants with the same station map share one OFP pack (C172,
 * Commander 114). Vendors with different stations (Asobo vs Black Square
 * Caravan) share one Market SKU via familyRolesPackRelPaths.
 */
import catalogJson from './data/career-player-airframes.json' with { type: 'json' };
import type { FreighterClassId, PlayerAircraft } from './types/career-economy.js';

export interface CareerPlayerAirframe {
  typeId: string;
  aircraftClassId: FreighterClassId;
  label: string;
  rolesPackRelPath: string;
  /**
   * Extra OFP packs accepted for this Market SKU when station maps differ
   * (vendor forks). Always includes rolesPackRelPath when resolving.
   */
  familyRolesPackRelPaths?: string[];
  simbriefIcao: string;
  simbriefAirframeMatch: string;
  /** When false, omitted from Aircraft Market. Owned fleet still resolves. Default true. */
  enabled?: boolean;
}

export const CAREER_PLAYER_AIRFRAMES: readonly CareerPlayerAirframe[] =
  catalogJson as CareerPlayerAirframe[];

/** Older per-variant typeIds → current family Market SKU. */
const LEGACY_AIRFRAME_ALIASES: Record<string, string> = {
  'asobo-c172sp-classic-cargo': 'asobo-c172sp-cargo',
  'asobo-c172sp-g1000-cargo': 'asobo-c172sp-cargo',
  'blacksquare-commander-114tc': 'blacksquare-commander-114',
  'asobo-c208b-cargo': 'c208-caravan-cargo',
  'blacksquare-caravan-cargo-pod': 'c208-caravan-cargo',
};

const BY_ID = new Map(CAREER_PLAYER_AIRFRAMES.map((airframe) => [airframe.typeId, airframe]));
const LEGACY_DEFAULT_BY_CLASS: Record<FreighterClassId, string> = {
  light_ga: 'blacksquare-bonanza-professional',
  light_turboprop: 'c208-caravan-cargo',
  narrow_freighter: 'pmdg-738-bcf-family',
  wide_freighter: 'tfdi-md11f-family',
};

export function isCareerPlayerAirframeEnabled(
  airframe: Pick<CareerPlayerAirframe, 'enabled'> | null | undefined,
): boolean {
  return airframe != null && airframe.enabled !== false;
}

export function findCareerPlayerAirframe(
  typeId: string | null | undefined,
): CareerPlayerAirframe | undefined {
  if (!typeId) return undefined;
  return BY_ID.get(typeId) ?? BY_ID.get(LEGACY_AIRFRAME_ALIASES[typeId] ?? '');
}

/** All OFP pack paths this Market SKU may fly (primary + vendor forks). */
export function careerPlayerAirframePackPaths(
  airframe: CareerPlayerAirframe,
): string[] {
  return [
    ...new Set([
      airframe.rolesPackRelPath,
      ...(airframe.familyRolesPackRelPaths ?? []),
    ]),
  ];
}

export function listCareerPlayerAirframes(
  aircraftClassId?: FreighterClassId,
  opts?: { includeDisabled?: boolean },
): CareerPlayerAirframe[] {
  const includeDisabled = opts?.includeDisabled === true;
  return CAREER_PLAYER_AIRFRAMES.filter(
    (airframe) =>
      (!aircraftClassId || airframe.aircraftClassId === aircraftClassId) &&
      (includeDisabled || isCareerPlayerAirframeEnabled(airframe)),
  );
}

/** Light GA + light turboprop models offered as the free starter airframe. */
export function listStarterCareerPlayerAirframes(): CareerPlayerAirframe[] {
  return [
    ...listCareerPlayerAirframes('light_ga'),
    ...listCareerPlayerAirframes('light_turboprop'),
  ];
}

export const STARTER_AIRFRAME_CONDITIONS = ['good', 'excellent'] as const;
export type StarterAirframeCondition = (typeof STARTER_AIRFRAME_CONDITIONS)[number];

export function isStarterAirframeCondition(
  value: string | null | undefined,
): value is StarterAirframeCondition {
  return value === 'good' || value === 'excellent';
}

export function defaultCareerPlayerAirframe(
  aircraftClassId: FreighterClassId,
): CareerPlayerAirframe | undefined {
  return findCareerPlayerAirframe(LEGACY_DEFAULT_BY_CLASS[aircraftClassId]);
}

export function playerAircraftDisplayLabel(
  aircraft: Pick<PlayerAircraft, 'airframeTypeId' | 'label'>,
): string {
  return findCareerPlayerAirframe(aircraft.airframeTypeId)?.label ?? aircraft.label;
}
