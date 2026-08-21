/** Planned fuel from an OFP (manual JSON today; SimBrief adapter later). */
export type OfpWeightUnit = 'lb' | 'kg';

/** How Career prefers to get OFP fuel/payload into the aircraft. */
export type OfpLoadMethod = 'native-simbrief' | 'direct-injection';

/** @deprecated Use OfpWeightUnit — kept as alias for fuel tank plans. */
export type OfpFuelUnit = OfpWeightUnit;

export interface OfpFuelPlan {
  unit: OfpWeightUnit;
  left?: number;
  right?: number;
  center?: number;
  /** Tank sum or block fuel when split unknown. */
  total?: number;
}

/**
 * SimBrief-style load sheet weights (same unit).
 * From the OFP UI: Block Fuel, Payload, Baggage, Pass, Empty, ZFW/TOW/LW.
 */
export interface OfpLoadSheet {
  unit: OfpWeightUnit;
  /** SimBrief "Block Fuel" — total fuel at gate. */
  blockFuel?: number;
  /** SimBrief "Enroute Burn". */
  enrouteBurn?: number;
  /** SimBrief planned TAXI fuel (same unit as block). */
  taxiFuel?: number;
  /** SimBrief "Pass" / passenger count (heads, not weight). */
  passengerCount?: number;
  /** SimBrief "Baggage" weight. */
  baggage?: number;
  /** SimBrief "Payload" (pax + bags + cargo). */
  payload?: number;
  /** SimBrief "Empty Weight". */
  emptyWeight?: number;
  /** Estimated / planned ZFW. */
  zfw?: number;
  /** Estimated / planned takeoff weight (TOW). */
  tow?: number;
  /** Estimated / planned landing weight (LW). */
  lw?: number;
  maxZfw?: number;
  maxTow?: number;
  maxLw?: number;
}

/**
 * Per-aircraft map: which payload stations are seats vs baggage/cargo.
 * Without this, passengerCount / baggage can be planned but not verified live.
 */
export interface OfpStationRoleMap {
  /** Station indices that represent passenger seats (weights). */
  passengerStations?: number[];
  /** Station indices that represent baggage / cargo. */
  baggageStations?: number[];
  /** Pilot / crew stations (excluded from SimBrief payload). */
  crewStations?: number[];
  /** Galley / service stations (excluded from SimBrief payload). */
  serviceStations?: number[];
  /**
   * Average weight per passenger (same unit as load sheet / payload plan).
   * Used to estimate live passenger count from seat station weights.
   */
  averagePassengerWeight?: number;
}

/** Compact operational briefing shown after a SimBrief OFP is confirmed. */
export interface OfpRouteWaypoint {
  ident: string;
  lat: number;
  lon: number;
  /** SimBrief fix type (`wpt`, `vor`, `ndb`, `apt`, …). */
  type?: string;
}

export interface OfpBriefingSummary {
  aircraftIcao?: string;
  tailNumber?: string;
  distanceNm?: number;
  /** Gate-to-gate (taxi + air + taxi). Informational. */
  blockTime?: string;
  /**
   * SimBrief estimated air / enroute time (`est_time_enroute`) as `HH:MM`.
   * Preferred for the career min-airborne settle gate.
   */
  airTime?: string;
  cruiseAltitudeFt?: number;
  alternateIcao?: string;
  route?: string;
  /** Ordered navlog fixes with coordinates (when SimBrief provided them). */
  waypoints?: OfpRouteWaypoint[];
}

export interface OfpPayloadPlan {
  unit: OfpWeightUnit;
  stations?: Record<number, number>;
  total?: number;
  /** Optional role map for pax/baggage monitoring. */
  stationRoles?: OfpStationRoleMap;
}

export interface OfpTolerances {
  /** Absolute fuel tolerance (lb). Default 200. */
  fuelAbsLb: number;
  /** Relative fuel tolerance vs planned. Default 0.02. */
  fuelPct: number;
  /** Absolute payload / baggage / weight tolerance (lb). Default 50. */
  payloadAbsLb: number;
  /** Absolute empty/ZFW/TOW tolerance (lb). Default 200. */
  weightAbsLb: number;
  /** Allowed passenger count delta. Default 0. */
  passengerCountAbs: number;
  /**
   * Max fuel *increase* allowed while airborne / between samples (lb).
   * Default 0 — any mid-flight refuel fails.
   */
  maxFuelIncreaseLb: number;
  /**
   * Optional sanity cap: max fuel *decrease* rate (lb/min).
   * Sudden dumps above this fail as suspicious unload.
   */
  maxBurnRateLbPerMin?: number;
}

export type LiveFuelSource =
  | 'pmdg-ng3'
  | 'classic'
  | 'mass-balance'
  | 'tfdi-efb'
  | 'a2a-lvars';

export type LiveWeightSourcePref =
  | 'classic-weights'
  | 'pmdg-efb-lvars'
  | 'tfdi-efb-lvars'
  | 'a2a-lvars';

export type LivePayloadSourcePref =
  | 'classic-stations'
  | 'pmdg-efb'
  | 'tfdi-efb'
  | 'a2a-lvars';

/**
 * Declared live read path for a homologated aircraft family.
 * Arrays are preference order (first usable wins).
 * When omitted on OfpExpectation, discovery cascade is used.
 */
export interface OfpLiveSources {
  fuel?: LiveFuelSource[];
  weights?: LiveWeightSourcePref[];
  payload?: LivePayloadSourcePref[];
}

export interface OfpExpectation {
  source: 'manual' | 'simbrief';
  ofpId?: string;
  icao?: string;
  /** Departure airport ICAO when known (SimBrief origin). */
  originIcao?: string;
  /** Arrival airport ICAO when known (SimBrief destination). */
  destIcao?: string;
  fuel: OfpFuelPlan;
  /** SimBrief load sheet block (weights + pax count). */
  loadSheet?: OfpLoadSheet;
  payload?: OfpPayloadPlan;
  /** Preferred live fuel/weight/payload sources (from roles pack). */
  liveSources?: OfpLiveSources;
  tolerances: OfpTolerances;
}

export interface LiveFuelState {
  source: LiveFuelSource;
  unit: 'lb';
  /** Classic LEFT MAIN only (aux/tip reported separately when present). */
  left: number;
  right: number;
  center: number;
  leftAux?: number;
  rightAux?: number;
  leftTip?: number;
  rightTip?: number;
  total: number;
  ageMs?: number;
}

export interface LivePayloadState {
  source:
    | 'classic-stations'
    | 'pmdg-efb'
    | 'tfdi-efb'
    | 'a2a-lvars'
    | 'mass-balance';
  unit: 'lb';
  stations: Record<number, number>;
  /** Sum of all stations (includes crew/galley). */
  total: number;
  /** Sum of baggage/cargo stations when role map provided. */
  baggageLb?: number;
  /** Sum of passenger seat stations when role map provided. */
  passengerWeightLb?: number;
  /** Estimated heads from passengerWeightLb / averagePassengerWeight. */
  estimatedPassengerCount?: number;
  /**
   * SimBrief-style payload for compare: passengerWeightLb + baggageLb
   * (excludes crew / galley / unused stations).
   */
  ofpPayloadLb?: number;
}

/** Gross / empty / derived ZFW — prefer vendor EFB LVars when present. */
export interface LiveWeightState {
  source:
    | 'classic-weights'
    | 'pmdg-efb-lvars'
    | 'tfdi-efb-lvars'
    | 'a2a-lvars';
  unit: 'lb';
  emptyLb?: number;
  grossLb?: number;
  maxGrossLb?: number;
  /** Prefer vendor EFB ZFW LVar; else gross − fuel. */
  zfwLb?: number;
  fuelLb?: number;
  payloadLb?: number;
  landingLb?: number;
}

export type CompliancePhase = 'preflight' | 'locked' | 'airborne' | 'complete';

export type ComplianceVerdict = 'pass' | 'warn' | 'fail';

export type ComplianceFindingSeverity = 'info' | 'warn' | 'fail';

export interface ComplianceFinding {
  code: string;
  severity: ComplianceFindingSeverity;
  message: string;
  expected?: number;
  actual?: number;
  delta?: number;
}

/** Captured at lock / start of airborne burn monitor. */
export interface ComplianceBaseline {
  fuel: LiveFuelState;
  payload?: LivePayloadState;
  weights?: LiveWeightState;
  capturedAt: string;
}

export interface ComplianceSnapshot {
  at: string;
  phase: CompliancePhase;
  ofp: OfpExpectation;
  liveFuel: LiveFuelState;
  livePayload?: LivePayloadState;
  liveWeights?: LiveWeightState;
  baseline?: ComplianceBaseline;
  findings: ComplianceFinding[];
  verdict: ComplianceVerdict;
}

/**
 * Human map: SimBrief field → how Skyline reads/compares it.
 * Documented for career OFP monitoring; not all fields are universally readable.
 */
export const SIMBRIEF_LIVE_FIELD_MAP = [
  {
    simbrief: 'Block Fuel',
    ofpPath: 'loadSheet.blockFuel | fuel.total',
    live: 'PMDG_NG3 fuel L+R+C (lb) or classic FUEL TANK * QUANTITY × density',
    notes: 'Primary fuel compliance target at gate.',
  },
  {
    simbrief: 'Payload',
    ofpPath: 'loadSheet.payload | payload.total',
    live: 'PMDG: pax stations + cargo from L:ZFW_Lvar residual; else Σ stations',
    notes: 'After PMDG EFB SimBrief load, classic cargo stations are inflated vs EFB.',
  },
  {
    simbrief: 'Baggage',
    ofpPath: 'loadSheet.baggage',
    live: 'PMDG: ZFW − empty − pax − crew − service; else Σ baggageStations',
    notes: 'Requires role map (crewStations + serviceStations for PMDG).',
  },
  {
    simbrief: 'Pass (passenger count)',
    ofpPath: 'loadSheet.passengerCount',
    live: 'Estimated from passengerStations weights ÷ averagePassengerWeight',
    notes: 'No universal passenger-count SimVar; needs role map + avg weight.',
  },
  {
    simbrief: 'Empty Weight',
    ofpPath: 'loadSheet.emptyWeight',
    live: 'EMPTY WEIGHT (pounds)',
    notes: 'SimBrief OEW ≠ MSFS empty — advisory warn only.',
  },
  {
    simbrief: 'Estimated ZFW',
    ofpPath: 'loadSheet.zfw',
    live: 'PMDG L:ZFW_Lvar (EFB); else TOTAL WEIGHT − fuel',
    notes: 'EFB LVar matches SimBrief after Load from Simbrief.',
  },
  {
    simbrief: 'Estimated TOW',
    ofpPath: 'loadSheet.tow (or zfw+block on PMDG)',
    live: 'PMDG L:GW_Lvar; else TOTAL WEIGHT',
    notes: 'EFB GW ≈ ZFW+block (ramp). SimBrief est_tow is usually post-taxi.',
  },
  {
    simbrief: 'Estimated LW',
    ofpPath: 'loadSheet.lw',
    live: 'Not directly monitored in flight (TOW − burn over time)',
    notes: 'Optional postflight / predictive only.',
  },
  {
    simbrief: 'Enroute Burn',
    ofpPath: 'loadSheet.enrouteBurn',
    live: 'Fuel burned vs baseline after airborne',
    notes: 'Informational for career; not a hard gate at preflight.',
  },
] as const;
