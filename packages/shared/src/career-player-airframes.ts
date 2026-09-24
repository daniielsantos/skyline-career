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
import { isCharterEligibleAircraftClass } from './career-charter.js';
import type {
  FreighterClassId,
  PlayerAircraft,
  AirframePerfOverride,
} from './types/career-economy.js';

export type PassengerCertificationState =
  | 'catalog_only'
  | 'dispatch_ready'
  | 'inject_verified';

export type AirframeConfigurationRole = 'cargo' | 'passenger';

/**
 * A concrete cabin/configuration inside one Market family SKU.
 *
 * baggageAllowanceLbPerPassenger is the SimBrief dispatch allowance. The
 * configuration capacity is an operational cap, not a substitute for the
 * aircraft's structural maxCargoKg.
 */
export interface CareerAirframeConfiguration {
  id: string;
  label: string;
  role: AirframeConfigurationRole;
  certificationState: PassengerCertificationState;
  passengerCapacity: number;
  requiredCrew: number;
  baggageAllowanceLbPerPassenger: number;
  baggageCapacityLb: number;
  rolesPackRelPath: string;
}

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
  /** Concrete default persisted on newly bought and normalized fleet tails. */
  defaultConfigurationId?: string;
  /** Passenger/cargo eligibility is pack-specific; one SKU still represents the family. */
  configurations?: CareerAirframeConfiguration[];
  simbriefIcao: string;
  simbriefAirframeMatch: string;
  /** When false, omitted from Aircraft Market. Owned fleet still resolves. Default true. */
  enabled?: boolean;
  /**
   * Load policy override vs the economic class default:
   * - `false` — force native SimBrief / EFB even in a direct-injection class
   * - `true` — enable Skyline inject even in an EFB-default class
   * - omitted — follow CAREER_AIRCRAFT_CLASSES
   */
  injectCapable?: boolean;
  /**
   * How freight is staged into SimBrief / EFB:
   * - omitted / `freighter` — cargo-only (pax≤1 for EFB pilot)
   * - `pax_and_cargo` — fill cabin seats first (SimBrief 175 lb/pax), remainder as freight
   *   so Mass & Balance CG stays in envelope on passenger airframes
   */
  loadLayout?: 'freighter' | 'pax_and_cargo';
  /**
   * Cabin seats for charter Fit / Dispatch fallback. Keep in sync with the
   * matched SimBrief row (`simbriefIcao` + `simbriefAirframeMatch`) via
   * `node scripts/audit-simbrief-max-pax.mjs --sync`. Live Dispatch still
   * prefers `airframe_passengers` from that row.
   */
  maxPaxSeats?: number;
  /**
   * Physical PAYLOAD STATION occupant slots in the cabin (MSFS 170 lb each).
   * JF F70 EFB imports 70 pax but SimConnect still fills 80 row stations.
   * Loaded vs Due subtracts (simconnectCabinSeats − maxPaxSeats) × 170.
   */
  simconnectCabinSeats?: number;
  /**
   * Fenix EFB empty ZFW still leaves this many lb on S3–S16. SimConnect EMPTY
   * is dry (OEW catalog); EFB BOW is EMPTY + this bias. Subtract from Loaded.
   */
  simconnectEmptyPayloadBiasLb?: number;
  /**
   * Combined FWD+AFT hold cap the JF EFB can actually place (lb). SimBrief
   * bag/cargo often exceeds this; Loaded vs Due clamps OFP cargo to this.
   */
  simconnectCargoHoldMaxLb?: number;
  /**
   * iniBuilds A320neo V2 EFB uses ~187 lb/pax on APPLY LOAD vs SimBrief 175.
   * Loaded vs Due adds (efbPaxWeightLb − 175) × planned pax.
   */
  efbPaxWeightLb?: number;
  /** Optional real-airframe weights — prefer over SimBrief proxy for light GA caps. */
  oewKg?: number;
  mtowKg?: number;
  mzfwKg?: number;
  maxCargoKg?: number;
  fuelCapacityKg?: number;
  /**
   * Max range (nm) — usually from aircraft.cfg ui_max_range.
   * Falls back to CAREER_AIRCRAFT_CLASSES.maxRangeNm when omitted.
   */
  maxRangeNm?: number;
  /**
   * Cruise fuel flow (kg/hour) — from ui_fuel_burn_rate (lbs→kg) or live sample.
   */
  cruiseFuelFlowKgPerHour?: number;
  /**
   * Typical cruise TAS (kt) — from flight_model cruise_speed or live sample.
   */
  cruiseSpeedKt?: number;
  /**
   * Planning burn (kg/nm). Derived from cruise flow ÷ cruise KTAS, or live sample.
   * Falls back to class fuelBurnKgPerNm when omitted.
   */
  fuelBurnKgPerNm?: number;
}

/** MSFS PAYLOAD STATION WEIGHT occupant quantum. */
export const MSFS_STATION_OCCUPANT_LB = 170;

/**
 * Extra cabin mass SimConnect reports vs SimBrief/EFB pax count (row stations).
 * JF F70: 80 slots × 170 while OFP/EFB is 70 pax.
 */
export function simconnectCabinOvershootLb(
  airframe: CareerPlayerAirframe | undefined,
): number {
  if (!airframe || airframe.loadLayout !== 'pax_and_cargo') return 0;
  const slots = airframe.simconnectCabinSeats;
  const pax = airframe.maxPaxSeats;
  if (
    typeof slots !== 'number' ||
    typeof pax !== 'number' ||
    !Number.isFinite(slots) ||
    !Number.isFinite(pax) ||
    slots <= pax
  ) {
    return 0;
  }
  return Math.round(slots - pax) * MSFS_STATION_OCCUPANT_LB;
}

export function simconnectEmptyPayloadBiasLb(
  airframe: CareerPlayerAirframe | undefined,
): number {
  if (!airframe || airframe.loadLayout !== 'pax_and_cargo') return 0;
  const bias = airframe.simconnectEmptyPayloadBiasLb;
  if (typeof bias !== 'number' || !Number.isFinite(bias) || bias <= 0) {
    return 0;
  }
  return Math.round(bias);
}

/**
 * Soft freight ceiling for Career: never above zero-fuel / takeoff structural
 * leftover (MZFW−OEW or MTOW−OEW). Station sums often overstate this.
 */
export function clampCareerMaxCargoKg(opts: {
  maxCargoKg?: number | null;
  oewKg?: number | null;
  mtowKg?: number | null;
  mzfwKg?: number | null;
}): number | undefined {
  const raw = opts.maxCargoKg;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return undefined;
  }
  let cap = Math.floor(raw);
  const oew =
    typeof opts.oewKg === 'number' && Number.isFinite(opts.oewKg) && opts.oewKg > 0
      ? opts.oewKg
      : undefined;
  const mtow =
    typeof opts.mtowKg === 'number' && Number.isFinite(opts.mtowKg) && opts.mtowKg > 0
      ? opts.mtowKg
      : undefined;
  const mzfw =
    typeof opts.mzfwKg === 'number' && Number.isFinite(opts.mzfwKg) && opts.mzfwKg > 0
      ? opts.mzfwKg
      : undefined;
  if (oew != null && mtow != null && mtow > oew) {
    cap = Math.min(cap, Math.floor(mtow - oew));
  }
  if (oew != null && mzfw != null && mzfw > oew) {
    cap = Math.min(cap, Math.floor(mzfw - oew));
  }
  return cap > 0 ? cap : undefined;
}

/** Keep in sync with CAREER_AIRCRAFT_CLASSES (avoid circular import). */
const CLASS_PERF_FALLBACK: Record<
  FreighterClassId,
  { maxRangeNm: number; fuelBurnKgPerNm: number }
> = {
  light_ga: { maxRangeNm: 800, fuelBurnKgPerNm: 0.35 },
  light_turboprop: { maxRangeNm: 900, fuelBurnKgPerNm: 0.8 },
  light_jet: { maxRangeNm: 2_000, fuelBurnKgPerNm: 1.4 },
  medium_piston: { maxRangeNm: 2_200, fuelBurnKgPerNm: 3.2 },
  narrow_freighter: { maxRangeNm: 2_500, fuelBurnKgPerNm: 5 },
  wide_freighter: { maxRangeNm: 6_000, fuelBurnKgPerNm: 12 },
};

/** Prefer per-airframe catalog range; else class default. */
export function resolveAirframeMaxRangeNm(
  airframeTypeId: string | null | undefined,
  aircraftClassId: FreighterClassId | string,
): number {
  const airframe = findCareerPlayerAirframe(airframeTypeId);
  if (
    typeof airframe?.maxRangeNm === 'number' &&
    Number.isFinite(airframe.maxRangeNm) &&
    airframe.maxRangeNm > 0
  ) {
    return Math.round(airframe.maxRangeNm);
  }
  return (
    CLASS_PERF_FALLBACK[aircraftClassId as FreighterClassId]?.maxRangeNm ?? 800
  );
}

/** Prefer per-airframe planning burn; else class default.
 * Live cruise-sample overrides (save-scoped) win when present — never mutate
 * the shared class template from a single hull's sample.
 */
export function resolveAirframeFuelBurnKgPerNm(
  airframeTypeId: string | null | undefined,
  aircraftClassId: FreighterClassId | string,
  liveOverride?: AirframePerfOverride | null,
): number {
  if (
    typeof liveOverride?.fuelBurnKgPerNm === 'number' &&
    Number.isFinite(liveOverride.fuelBurnKgPerNm) &&
    liveOverride.fuelBurnKgPerNm > 0
  ) {
    return Math.round(liveOverride.fuelBurnKgPerNm * 1000) / 1000;
  }
  const airframe = findCareerPlayerAirframe(airframeTypeId);
  if (
    typeof airframe?.fuelBurnKgPerNm === 'number' &&
    Number.isFinite(airframe.fuelBurnKgPerNm) &&
    airframe.fuelBurnKgPerNm > 0
  ) {
    return airframe.fuelBurnKgPerNm;
  }
  return (
    CLASS_PERF_FALLBACK[aircraftClassId as FreighterClassId]?.fuelBurnKgPerNm ??
    0.35
  );
}

/** Cruise fuel flow (kg/h) when known on the airframe catalog. */
export function resolveAirframeCruiseFuelFlowKgPerHour(
  airframeTypeId: string | null | undefined,
): number | undefined {
  const airframe = findCareerPlayerAirframe(airframeTypeId);
  if (
    typeof airframe?.cruiseFuelFlowKgPerHour === 'number' &&
    Number.isFinite(airframe.cruiseFuelFlowKgPerHour) &&
    airframe.cruiseFuelFlowKgPerHour > 0
  ) {
    return airframe.cruiseFuelFlowKgPerHour;
  }
  return undefined;
}

/** Cruise TAS (kt) — catalog value, or derived from kg/h ÷ kg/nm when both exist. */
export function resolveAirframeCruiseSpeedKt(
  airframeTypeId: string | null | undefined,
): number | undefined {
  const airframe = findCareerPlayerAirframe(airframeTypeId);
  if (
    typeof airframe?.cruiseSpeedKt === 'number' &&
    Number.isFinite(airframe.cruiseSpeedKt) &&
    airframe.cruiseSpeedKt > 0
  ) {
    return Math.round(airframe.cruiseSpeedKt);
  }
  const flow = resolveAirframeCruiseFuelFlowKgPerHour(airframeTypeId);
  const burnNm =
    typeof airframe?.fuelBurnKgPerNm === 'number' &&
    Number.isFinite(airframe.fuelBurnKgPerNm) &&
    airframe.fuelBurnKgPerNm > 0
      ? airframe.fuelBurnKgPerNm
      : undefined;
  if (flow != null && burnNm != null) {
    return Math.round(flow / burnNm);
  }
  return undefined;
}

/** Cabin / charter hints for Market + Hangar cards. */
export type AirframeCabinUiSummary = {
  /** Max eligible passenger seats on this SKU (0 = no charter config). */
  passengerSeats: number;
  hasCargoConfig: boolean;
  hasPassengerConfig: boolean;
  /** Cargo + passenger glass share one Market SKU. */
  dualLayout: boolean;
  defaultConfigurationId?: string;
  defaultRole?: AirframeConfigurationRole;
  /** Compact config list so Hangar can label the active cabin without a second catalog fetch. */
  configurations: Array<{
    id: string;
    label: string;
    role: AirframeConfigurationRole;
    passengerCapacity: number;
    rolesPackRelPath: string;
  }>;
};

export function resolveAirframeCabinSummary(
  airframeTypeId: string | null | undefined,
  aircraftClassId?: FreighterClassId | string | null,
): AirframeCabinUiSummary {
  const airframe = findCareerPlayerAirframe(airframeTypeId);
  const classId = aircraftClassId ?? airframe?.aircraftClassId;
  const configs = airframe?.configurations ?? [];
  const passengerConfigs = configs.filter(isPassengerConfigurationEligible);
  const hasCargoConfig = configs.some((row) => row.role === 'cargo');
  const hasPassengerConfig = passengerConfigs.length > 0;
  const charterClass = isCharterEligibleAircraftClass(classId ?? null);
  const passengerSeats =
    charterClass && hasPassengerConfig
      ? Math.max(...passengerConfigs.map((row) => row.passengerCapacity))
      : 0;
  const defaultConfiguration = findCareerAirframeConfiguration(
    airframe,
    airframe?.defaultConfigurationId,
  );
  return {
    passengerSeats,
    hasCargoConfig,
    hasPassengerConfig: charterClass && hasPassengerConfig,
    dualLayout: charterClass && hasCargoConfig && hasPassengerConfig,
    defaultConfigurationId: airframe?.defaultConfigurationId,
    defaultRole: defaultConfiguration?.role,
    configurations: configs.map((row) => ({
      id: row.id,
      label: row.label,
      role: row.role,
      passengerCapacity: row.passengerCapacity,
      rolesPackRelPath: row.rolesPackRelPath,
    })),
  };
}

/** Specs for market/hangar cards — airframe overrides with class fallback. */
export function resolveAirframePerfForUi(
  airframeTypeId: string | null | undefined,
  aircraftClassId: FreighterClassId | string,
  classFallback?: { maxCargoKg: number; maxRangeNm: number },
  liveOverride?: AirframePerfOverride | null,
): {
  maxCargoKg: number;
  maxRangeNm: number;
  cruiseFuelFlowKgPerHour?: number;
  cruiseSpeedKt?: number;
  fuelBurnKgPerNm: number;
  cabin: AirframeCabinUiSummary;
} {
  const airframe = findCareerPlayerAirframe(airframeTypeId);
  const catalogFlow = resolveAirframeCruiseFuelFlowKgPerHour(airframeTypeId);
  const catalogSpeed = resolveAirframeCruiseSpeedKt(airframeTypeId);
  const overrideFlow =
    typeof liveOverride?.cruiseFuelFlowKgPerHour === 'number' &&
    liveOverride.cruiseFuelFlowKgPerHour > 0
      ? liveOverride.cruiseFuelFlowKgPerHour
      : undefined;
  const overrideSpeed =
    typeof liveOverride?.cruiseSpeedKt === 'number' &&
    liveOverride.cruiseSpeedKt > 0
      ? Math.round(liveOverride.cruiseSpeedKt)
      : undefined;
  return {
    maxCargoKg:
      typeof airframe?.maxCargoKg === 'number' && airframe.maxCargoKg > 0
        ? airframe.maxCargoKg
        : (classFallback?.maxCargoKg ?? 450),
    maxRangeNm: resolveAirframeMaxRangeNm(airframeTypeId, aircraftClassId),
    cruiseFuelFlowKgPerHour: overrideFlow ?? catalogFlow,
    cruiseSpeedKt: overrideSpeed ?? catalogSpeed,
    fuelBurnKgPerNm: resolveAirframeFuelBurnKgPerNm(
      airframeTypeId,
      aircraftClassId,
      liveOverride,
    ),
    cabin: resolveAirframeCabinSummary(airframeTypeId, aircraftClassId),
  };
}

export const CAREER_PLAYER_AIRFRAMES: readonly CareerPlayerAirframe[] =
  catalogJson as CareerPlayerAirframe[];

/** Older per-variant typeIds → current family Market SKU. */
const LEGACY_AIRFRAME_ALIASES: Record<string, string> = {
  'asobo-c172sp-classic-cargo': 'asobo-c172sp-cargo',
  'asobo-c172sp-g1000-cargo': 'asobo-c172sp-cargo',
  'asobo-c172sp-classic-passengers': 'asobo-c172sp-cargo',
  'asobo-c172sp-g1000-passengers': 'asobo-c172sp-cargo',
  'asobo-c172sp-ifd-cargo': 'asobo-c172sp-cargo',
  'asobo-c172sp-ifd-passengers': 'asobo-c172sp-cargo',
  'asobo-beechcraft-bonanza-private-charter': 'asobo-beechcraft-bonanza',
  'blacksquare-commander-114tc': 'blacksquare-commander-114',
  'blacksquare-a36-bonanza-professional': 'blacksquare-bonanza-professional',
  'blacksquare-a36tc-bonanza-professional': 'blacksquare-bonanza-professional',
  'blacksquare-grand-duke': 'blacksquare-b60-duke',
  'asobo-c208b-cargo': 'c208-caravan-cargo',
  'blacksquare-caravan-cargo-pod': 'c208-caravan-cargo',
  'blacksquare-caravan-professional-gear': 'c208-caravan-cargo',
  'blacksquare-caravan-professional-super-cargomaster': 'c208-caravan-cargo',
  'blackbox-bn2-islander-cargo-analogue-tip-tanks':
    'blackbox-bn2-islander-cargo-tip-tanks',
  'blackbox-bn2-islander-cargo-garmin-tip-tanks':
    'blackbox-bn2-islander-cargo-tip-tanks',
  /** SpecialOps cabin preset — same Black Box BN2 Market family as Cargo Tip Tanks. */
  'blackbox-bn2-islander-specialops-analogue':
    'blackbox-bn2-islander-cargo-tip-tanks',
  'microsoft-saab-340-cargo': 'carenado-saab-340-passenger',
  'microsoft-404-titan-cargo': 'microsoft-404-titan',
  'microsoft-404-titan-passengers': 'microsoft-404-titan',
  'microsoft-atr-42-600-highline-01': 'microsoft-atr-42-600',
  'microsoft-atr-42-600-highline-02': 'microsoft-atr-42-600',
  'microsoft-atr-42-600-highline-03': 'microsoft-atr-42-600',
  'microsoft-atr-42-600-passenger': 'microsoft-atr-42-600',
  'microsoft-atr-42-600-stol': 'microsoft-atr-42-600',
  'microsoft-atr-72-600-highline-01': 'microsoft-atr-72-600',
  'microsoft-atr-72-600-highline-02': 'microsoft-atr-72-600',
  'microsoft-atr-72-600-highline-03': 'microsoft-atr-72-600',
  'microsoft-atr-72-600-highline-04': 'microsoft-atr-72-600',
  'microsoft-atr-72-600-passenger': 'microsoft-atr-72-600',
  'microsoft-atr-72-600-freighter': 'microsoft-atr-72-600',
  'pmdg-777-200er-rr': 'pmdg-777-200er',
  'pmdg-777-200er-pw': 'pmdg-777-200er',
  'pmdg-777-200er-ge': 'pmdg-777-200er',
  'flightfx-c750': 'flightfx-citation-x',
  'flightfx-c750-winglets': 'flightfx-citation-x',
  'flightfx-citation-x-winglets': 'flightfx-citation-x',
  /** iFly MAX 8 / 8200 glasses — same Market family as Asobo 737 Max 8. */
  'ifly-737-max-8': 'asobo-737-max-8-passengers',
  'ifly-737-max-8200': 'asobo-737-max-8-passengers',
};

const BY_ID = new Map(CAREER_PLAYER_AIRFRAMES.map((airframe) => [airframe.typeId, airframe]));
const LEGACY_DEFAULT_BY_CLASS: Record<FreighterClassId, string> = {
  light_ga: 'blacksquare-bonanza-professional',
  light_turboprop: 'c208-caravan-cargo',
  light_jet: 'flysimware-learjet-35a',
  medium_piston: 'pmdg-dc6',
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
      ...(airframe.configurations ?? []).map(
        (configuration) => configuration.rolesPackRelPath,
      ),
    ]),
  ];
}

export function findCareerAirframeConfiguration(
  airframe: CareerPlayerAirframe | undefined,
  configurationId?: string | null,
  rolesPackRelPath?: string | null,
): CareerAirframeConfiguration | undefined {
  const configurations = airframe?.configurations ?? [];
  const byId = configurationId?.trim();
  if (byId) {
    const match = configurations.find((configuration) => configuration.id === byId);
    if (match) return match;
  }
  const byPack = rolesPackRelPath?.trim();
  if (byPack) {
    const match = configurations.find(
      (configuration) => configuration.rolesPackRelPath === byPack,
    );
    if (match) return match;
  }
  if (byId || byPack) return undefined;
  return configurations.find(
    (configuration) => configuration.id === airframe?.defaultConfigurationId,
  ) ?? configurations[0];
}

export function isPassengerConfigurationEligible(
  configuration: CareerAirframeConfiguration | null | undefined,
): boolean {
  return Boolean(
    configuration &&
      configuration.role === 'passenger' &&
      configuration.certificationState !== 'catalog_only' &&
      configuration.passengerCapacity > 0,
  );
}

/** Certified dispatch capacity; cargo and catalog-only packs always resolve to zero. */
export function resolvePassengerCapacity(
  airframeTypeId: string | null | undefined,
  configurationId?: string | null,
  rolesPackRelPath?: string | null,
): number {
  const airframe = findCareerPlayerAirframe(airframeTypeId);
  const configuration = findCareerAirframeConfiguration(
    airframe,
    configurationId,
    rolesPackRelPath,
  );
  return isPassengerConfigurationEligible(configuration)
    ? Math.max(0, Math.floor(configuration!.passengerCapacity))
    : 0;
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

/** Fixed free-starter choices (not the full light Market board). */
export const STARTER_AIRFRAME_TYPE_IDS = [
  'asobo-cessna-c152',
  'asobo-c172sp-cargo',
  'blacksquare-commander-114',
] as const;

/** Default when signup omits airframeTypeId. */
export const DEFAULT_STARTER_AIRFRAME_TYPE_ID =
  'asobo-c172sp-cargo' as const;

/** C152 / C172 / Commander 114 — free starter airframes only. */
export function listStarterCareerPlayerAirframes(): CareerPlayerAirframe[] {
  return STARTER_AIRFRAME_TYPE_IDS.map((typeId) => findCareerPlayerAirframe(typeId)).filter(
    (row): row is CareerPlayerAirframe =>
      row != null && isCareerPlayerAirframeEnabled(row),
  );
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

