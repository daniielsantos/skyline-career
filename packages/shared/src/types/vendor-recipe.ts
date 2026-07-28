/**
 * Vendor / family recipes — shared compat patterns across airframes from one developer.
 * Per-aircraft profiles in profiles/examples still own title, ICAO, fingerprint, capacities.
 * Recipes teach the wizard HOW to draft; they are not apply-time substitutes for AircraftProfile.
 */
export type VendorRecipeId =
  | 'a2a-accusim'
  | 'blacksquare-classic'
  | 'asobo-default'
  | (string & {});

export type VendorDetectSignal =
  | { kind: 'publisher'; value: string }
  | { kind: 'title_regex'; value: string }
  | { kind: 'simvar_capacity_lt'; name: string; unit?: string; max: number }
  | { kind: 'simvar_capacity_gte'; name: string; unit?: string; min: number }
  | { kind: 'lvar_readable'; name: string }
  | { kind: 'classic_writetest_fails' };

export interface VendorFuelTankHint {
  /** Profile tank id (LEFT_MAIN, CENTER, …). */
  id: string;
  /** Human label for notes / wizard. */
  label?: string;
  /** Classic SimVar used for verify/read mirrors (often still valid on Accu-Sim). */
  readSimVar?: string;
  /** LVar name used for writes when strategy is lvar-bridge. */
  writeLVar?: string;
  /** Classic SimVar for writes when strategy is simconnect-direct. */
  writeSimVar?: string;
  /** Capacity LVar (usable) when Accu-Sim exposes one. */
  capacityLVar?: string;
  /** Capacity SimVar when classic. */
  capacitySimVar?: string;
}

export interface VendorPayloadHint {
  /** Map station index → LVar (e.g. Character1Weight) or omit for station SimVars. */
  stationLVars?: Record<string, string>;
  /** Extra LVars (baggage, etc.). */
  extras?: Array<{ id: string; lvar: string; maxLVar?: string }>;
  strategy: 'station-writeback' | 'lvar-bridge' | 'simconnect-direct';
}

export interface VendorRecipe {
  schemaVersion: '0.1.0';
  /** Stable id: a2a-accusim, blacksquare-classic, … */
  recipeId: VendorRecipeId;
  /** Catalog publisher slug this recipe usually binds to. */
  publisher: string;
  displayName: string;
  summary: string;
  /** All signals are hints; wizard may require a subset to fire. */
  detect: VendorDetectSignal[];
  /** How many of `detect` must match (default: publisher OR title). Documented in recipe. */
  detectMode?: 'any' | 'all' | 'publisher_then_probes';
  capabilities: Array<'simconnect' | 'lvar' | 'hvar' | 'hybrid-sync'>;
  fuel: {
    strategy: 'simconnect-direct' | 'lvar-bridge' | 'hybrid-sync' | 'vendor-specific';
    /** Prefer usable LVar caps when present. */
    preferUsableCapacity?: boolean;
    tanks: VendorFuelTankHint[];
    /** Candidate LVars to probe when discovering a new airframe in this family. */
    probeLVars?: string[];
  };
  payload: VendorPayloadHint;
  wizard: {
    /** If classic SimVar writetest fails, try this recipe's LVar / classic path. */
    onClassicWriteFail?: 'try-lvar-bridge' | 'abort' | 'continue-classic';
    /** Notes file stem hint under profiles/notes (optional). */
    notesTemplate?: string;
  };
  docs?: string;
  /** Known airframe profileKeys that already use this recipe (informational). */
  knownProfileKeys?: string[];
}
