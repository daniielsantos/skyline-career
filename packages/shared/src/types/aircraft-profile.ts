export type Capability =
  | 'simconnect'
  | 'lvar'
  | 'hvar'
  | 'preset'
  | 'clientdata'
  | 'event'
  | 'hybrid-sync';

export type FuelStrategyName =
  | 'simconnect-direct'
  | 'lvar-bridge'
  | 'hybrid-sync'
  | 'vendor-specific';

export type PayloadStrategyName =
  | 'station-writeback'
  | 'simconnect-direct'
  | 'lvar-bridge'
  | 'vendor-specific';

export type FlightPhase =
  | 'preflight'
  | 'taxi'
  | 'takeoff'
  | 'cruise'
  | 'approach'
  | 'landing'
  | 'postflight';

export type ProfileStatus = 'draft' | 'provisional' | 'active' | 'deprecated' | 'blocked';

export interface AircraftIdentity {
  title: string;
  publisher: string;
  atcModel?: string;
  atcType?: string;
  icao?: string;
  packageName?: string;
  packageVersion?: string;
  baseContainer?: string;
}

export interface TankDescriptor {
  index: number;
  name?: string;
  capacity: number;
  unit?: 'gallons' | 'pounds' | 'liters' | 'kilograms';
}

export interface StationDescriptor {
  index: number;
  name?: string;
  maxLoad: number;
  arm?: number;
}

export interface WeightLimits {
  emptyWeightLb?: number;
  maxGrossWeightLb?: number;
  maxZeroFuelWeightLb?: number;
}

export interface AircraftStructure {
  tankSchema: TankDescriptor[];
  stationSchema: StationDescriptor[];
  weightLimits: WeightLimits;
}

export interface FingerprintInput {
  identity: AircraftIdentity;
  structure: AircraftStructure;
}

export interface GatingRules {
  requireOnGround?: boolean;
  requireEnginesOff?: boolean;
  requireParkingBrake?: boolean;
  blockWhenPaused?: boolean;
  blockWhenSlew?: boolean;
  minSimRate?: number;
  maxSimRate?: number;
}

export interface WriteOperation {
  op: 'simvar_set' | 'lvar_set' | 'hvar_trigger' | 'event' | 'delay';
  var?: string;
  unit?: string;
  valueExpr?: string;
  name?: string;
  event?: string;
  data?: number;
  ms?: number;
}

export interface VerifyCheck {
  var: string;
  unit: string;
  tolerancePct: number;
  valueExpr?: string;
}

export interface VerifyBlock {
  timeoutMs?: number;
  pollIntervalMs?: number;
  checks: VerifyCheck[];
}

export interface FuelTankProfile {
  id: string;
  name?: string;
  capacity?: number;
  readVar: string;
  readUnit: string;
  writeVar?: string;
  writeUnit?: string;
}

export interface PayloadStationProfile {
  index: number;
  name?: string;
  maxLoad: number;
  arm?: number;
  readVar?: string;
  writeVar?: string;
}

export interface FuelSection {
  strategy: FuelStrategyName;
  unit?: 'gallons' | 'pounds' | 'liters' | 'kilograms';
  tanks: FuelTankProfile[];
  writePlan: WriteOperation[];
  verify: VerifyBlock;
}

export interface PayloadSection {
  strategy: PayloadStrategyName;
  stations: PayloadStationProfile[];
  writePlan: WriteOperation[];
  verify: VerifyBlock;
}

export interface CgSection {
  readVar?: string;
  readUnit?: string;
  /** Provenance of the operational envelope stored in constraints. */
  envelopeSource?: 'cfg' | 'manual' | 'simvar' | 'live-sweep' | 'calibrated-live';
  /** Read/settling tolerance in percentage points of MAC. */
  toleranceMac?: number;
  constraints?: {
    minMac?: number;
    maxMac?: number;
  };
  calibration?: {
    observedMac?: number;
    calibratedAtIso?: string;
    cfgPath?: string;
    emptyWeightCgPosition?: [number, number, number];
    sweep?: {
      minObservedMac: number;
      maxObservedMac: number;
      payloadLb: number;
      forwardStation: number;
      aftStation: number;
      usedStationArms: boolean;
      restored: boolean;
      sampledAtIso: string;
    };
  };
}

export interface AircraftProfile {
  schemaVersion: '1.0.0';
  profileId: string;
  profileKey: string;
  semver: string;
  displayName?: string;
  match: {
    fingerprint: string;
    title?: string;
    /**
     * In-sim title(s) observed during homologation. Fingerprint is derived from
     * the first entry when present so cleaned catalog titles still resolve.
     */
    liveTitles?: string[];
    publisher?: string;
    icao?: string;
  };
  capabilities: Capability[];
  gating: GatingRules;
  fuel: FuelSection;
  payload: PayloadSection;
  cg?: CgSection;
  fallback?: {
    chain: string[];
  };
  notes?: string[];
}

export interface FuelTarget {
  total?: number;
  tanks?: Record<string, number>;
}

export interface PayloadTarget {
  total?: number;
  stations?: Record<number, number>;
}

export interface LoadPlanRequest {
  fuel?: FuelTarget;
  payload?: PayloadTarget;
  /**
   * How CG envelope failures affect apply success.
   * - strict: CG out of envelope fails the apply (default)
   * - soft: CG is reported but does not fail the apply
   */
  cgPolicy?: 'strict' | 'soft';
}

export interface OperationResult {
  success: boolean;
  strategyUsed: string;
  fallbackUsed: boolean;
  durationMs: number;
  errorCode?: string;
  details?: Record<string, unknown>;
}
