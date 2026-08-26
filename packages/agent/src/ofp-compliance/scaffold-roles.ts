import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type {
  OfpLiveSources,
  OfpLoadMethod,
  OfpStationRoleMap,
} from '@msfs-compat/shared';

/** On-disk OFP / roles pack with optional title matching for auto-resolve. */
export interface OfpRolesPackFile {
  source?: string;
  icao?: string;
  ofpId?: string;
  notes?: string[];
  /** Exact MSFS titles this pack covers. */
  matchTitles?: string[];
  /** RegExp source (no flags) tested against MSFS title. */
  matchTitlePattern?: string;
  /** Preferred Career load path (manual always allowed in UI). */
  loadMethod?: OfpLoadMethod;
  /** True when a writable Skyline profile exists for direct injection. */
  injectCapable?: boolean;
  fuel?: { unit?: string };
  loadSheet?: Record<string, unknown>;
  payload?: {
    unit?: string;
    total?: number;
    stationRoles?: OfpStationRoleMap;
  };
  /** Declared live read path — reader skips undeclared vendor probes. */
  liveSources?: OfpLiveSources;
  /**
   * ICAO key in SimBrief airframes.json (may differ from MSFS/OFP icao —
   * e.g. freighter MD-11F uses MD1F).
   */
  simbriefIcao?: string;
  /**
   * Regex source / substring matched against SimBrief airframe_comments
   * to pick the public variant Internal ID for dispatch `type=`.
   */
  simbriefAirframeMatch?: string;
  stationMap?: unknown[];
  tolerances?: Record<string, number>;
}

export interface ScaffoldHeuristic {
  id: string;
  icao: string;
  /** Match live aircraft title. */
  titlePattern: RegExp;
  stationRoles: OfpStationRoleMap;
  liveSources: OfpLiveSources;
  loadMethod?: OfpLoadMethod;
  injectCapable?: boolean;
  simbriefIcao?: string;
  simbriefAirframeMatch?: string;
  stationMap: Array<{
    simVarIndex: number;
    cfgIndex: number;
    name: string;
    role: string;
  }>;
  notes: string[];
  /** Family pack path relative to profiles/ofp (preferred over per-livery files). */
  familyPackRel?: string;
  /** Stable Aircraft Market label when variants share one SKU (glass / TC / livery). */
  marketLabel?: string;
  /**
   * Shared Aircraft Market typeId across OFP packs that differ in stations
   * (e.g. Asobo vs Black Square Caravan). Defaults to heuristic id / pack ofpId.
   */
  marketTypeId?: string;
}

const PMDG_738_LIVE_SOURCES: OfpLiveSources = {
  fuel: ['pmdg-ng3', 'classic'],
  weights: ['pmdg-efb-lvars'],
  payload: ['pmdg-efb', 'classic-stations'],
};

const TFDI_MD11_LIVE_SOURCES: OfpLiveSources = {
  fuel: ['tfdi-efb', 'mass-balance'],
  weights: ['tfdi-efb-lvars'],
  payload: ['tfdi-efb'],
};

const TOLISS_A346_LIVE_SOURCES: OfpLiveSources = {
  fuel: ['mass-balance', 'classic'],
  weights: ['classic-weights'],
  payload: ['classic-stations'],
};

const CLASSIC_LIGHT_LIVE_SOURCES: OfpLiveSources = {
  fuel: ['classic'],
  weights: ['classic-weights'],
  payload: ['classic-stations'],
};

/** Known families where station roles are stable across liveries/cabin options. */
export const OFP_ROLE_HEURISTICS: ScaffoldHeuristic[] = [
  {
    id: 'pmdg-738-pax',
    icao: 'B738',
    titlePattern: /737-800\s+PAX/i,
    familyPackRel: 'pmdg-738-pax.json',
    marketTypeId: 'pmdg-738-pax-family',
    marketLabel: 'PMDG 737-800 PAX',
    stationRoles: {
      passengerStations: [1, 2, 3, 4],
      baggageStations: [5, 6],
      crewStations: [7, 8, 9],
      serviceStations: [10, 11],
      averagePassengerWeight: 86.18,
    },
    liveSources: PMDG_738_LIVE_SOURCES,
    loadMethod: 'native-simbrief',
    injectCapable: false,
    simbriefIcao: 'B738',
    simbriefAirframeMatch: 'PMDG \\(MSFS\\) - Dual Class',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'PaxZone1', role: 'passenger' },
      { simVarIndex: 2, cfgIndex: 1, name: 'PaxZone2', role: 'passenger' },
      { simVarIndex: 3, cfgIndex: 2, name: 'PaxZone3', role: 'passenger' },
      { simVarIndex: 4, cfgIndex: 3, name: 'PaxZone4', role: 'passenger' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Fwd Cargo', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Aft Cargo', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Pilot', role: 'crew' },
      { simVarIndex: 8, cfgIndex: 7, name: 'Copilot', role: 'crew' },
      { simVarIndex: 9, cfgIndex: 8, name: 'Instructor', role: 'crew' },
      { simVarIndex: 10, cfgIndex: 9, name: 'fwd_gly', role: 'galley' },
      { simVarIndex: 11, cfgIndex: 10, name: 'aft_gly', role: 'galley' },
    ],
    notes: [
      'PMDG 737-800 PAX family (SSW/BW · TC/HD/SC) — same station_load layout',
      'One Skyline Market SKU: pmdg-738-pax-family (narrow_freighter)',
      'SimConnect PAYLOAD STATION WEIGHT:n is 1-based (station_load.0 → :1)',
      'After EFB Load from Simbrief, classic cargo may inflate — use L:ZFW_Lvar / L:GW_Lvar',
      'liveSources: NG3 fuel + PMDG EFB LVars (no TFDi / mass-balance probe)',
    ],
  },
  {
    id: 'pmdg-738-bbj2',
    icao: 'B738',
    titlePattern: /737-800\s+BBJ2/i,
    familyPackRel: 'pmdg-738-bbj2.json',
    marketTypeId: 'pmdg-738-bbj2-family',
    marketLabel: 'PMDG 737-800 BBJ2',
    stationRoles: {
      passengerStations: [1, 2, 3, 4],
      baggageStations: [5, 6],
      crewStations: [7, 8, 9],
      serviceStations: [10, 11],
      averagePassengerWeight: 86.18,
    },
    liveSources: PMDG_738_LIVE_SOURCES,
    loadMethod: 'native-simbrief',
    injectCapable: false,
    simbriefIcao: 'B738',
    simbriefAirframeMatch: 'PMDG \\(MSFS\\) - Dual Class',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'PaxZone1', role: 'passenger' },
      { simVarIndex: 2, cfgIndex: 1, name: 'PaxZone2', role: 'passenger' },
      { simVarIndex: 3, cfgIndex: 2, name: 'PaxZone3', role: 'passenger' },
      { simVarIndex: 4, cfgIndex: 3, name: 'PaxZone4', role: 'passenger' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Fwd Cargo', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Aft Cargo', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Pilot', role: 'crew' },
      { simVarIndex: 8, cfgIndex: 7, name: 'Copilot', role: 'crew' },
      { simVarIndex: 9, cfgIndex: 8, name: 'Instructor', role: 'crew' },
      { simVarIndex: 10, cfgIndex: 9, name: 'fwd_gly', role: 'galley' },
      { simVarIndex: 11, cfgIndex: 10, name: 'aft_gly', role: 'galley' },
    ],
    notes: [
      'PMDG 737-800 BBJ2 family (SSW / BW) — VIP layout; Market SKU disabled pending OEW fix',
      'One Skyline Market SKU: pmdg-738-bbj2-family (enabled: false)',
      'loadMethod: native-simbrief; injectCapable: false',
      'liveSources: NG3 fuel + PMDG EFB LVars',
    ],
  },
  {
    id: 'pmdg-738-bcf',
    icao: 'B738',
    // 737-800BCF SSW / 737-800BCF BW (no space before BCF in MSFS title)
    titlePattern: /737-800BCF/i,
    familyPackRel: 'pmdg-738-bcf.json',
    marketTypeId: 'pmdg-738-bcf-family',
    marketLabel: 'PMDG 737-800 BCF',
    stationRoles: {
      // cfg still names PaxZone1..4 but BCF uses them as main-deck cargo.
      passengerStations: [],
      baggageStations: [1, 2, 3, 4, 5, 6],
      crewStations: [7, 8, 9],
      serviceStations: [10, 11],
    },
    liveSources: PMDG_738_LIVE_SOURCES,
    loadMethod: 'native-simbrief',
    injectCapable: false,
    simbriefIcao: 'B738',
    simbriefAirframeMatch: 'PMDG \\(MSFS\\) - Boeing Converted Freighter',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'PaxZone1 (main deck cargo)', role: 'baggage' },
      { simVarIndex: 2, cfgIndex: 1, name: 'PaxZone2 (main deck cargo)', role: 'baggage' },
      { simVarIndex: 3, cfgIndex: 2, name: 'PaxZone3 (main deck cargo)', role: 'baggage' },
      { simVarIndex: 4, cfgIndex: 3, name: 'PaxZone4 (main deck cargo)', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Fwd Cargo', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Aft Cargo', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Pilot', role: 'crew' },
      { simVarIndex: 8, cfgIndex: 7, name: 'Copilot', role: 'crew' },
      { simVarIndex: 9, cfgIndex: 8, name: 'Instructor', role: 'crew' },
      { simVarIndex: 10, cfgIndex: 9, name: 'fwd_gly', role: 'galley' },
      { simVarIndex: 11, cfgIndex: 10, name: 'aft_gly', role: 'galley' },
    ],
    notes: [
      'PMDG 737-800BCF freighter family (SSW / BW)',
      'One Skyline Market SKU: pmdg-738-bcf-family (narrow_freighter) — shares SKU with BDSF pack',
      'SimBrief: use PMDG Boeing Converted Freighter airframe — payload is cargo, not pax',
      'Zones 1–4 are main-deck cargo despite PaxZone names in flight_model.cfg',
      'Live cargo via EFB L:ZFW_Lvar residual (classic stations may inflate)',
      'liveSources: NG3 fuel + PMDG EFB LVars',
    ],
  },
  {
    id: 'pmdg-738-bdsf',
    icao: 'B738',
    titlePattern: /737-800BDSF/i,
    familyPackRel: 'pmdg-738-bdsf.json',
    marketTypeId: 'pmdg-738-bcf-family',
    marketLabel: 'PMDG 737-800 BCF',
    stationRoles: {
      passengerStations: [],
      baggageStations: [1, 2, 3, 4, 5, 6],
      crewStations: [7, 8, 9],
      serviceStations: [10, 11],
    },
    liveSources: PMDG_738_LIVE_SOURCES,
    loadMethod: 'native-simbrief',
    injectCapable: false,
    simbriefIcao: 'B738',
    simbriefAirframeMatch: 'PMDG \\(MSFS\\) - Boeing Converted Freighter',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'PaxZone1 (main deck cargo)', role: 'baggage' },
      { simVarIndex: 2, cfgIndex: 1, name: 'PaxZone2 (main deck cargo)', role: 'baggage' },
      { simVarIndex: 3, cfgIndex: 2, name: 'PaxZone3 (main deck cargo)', role: 'baggage' },
      { simVarIndex: 4, cfgIndex: 3, name: 'PaxZone4 (main deck cargo)', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Fwd Cargo', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Aft Cargo', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Pilot', role: 'crew' },
      { simVarIndex: 8, cfgIndex: 7, name: 'Copilot', role: 'crew' },
      { simVarIndex: 9, cfgIndex: 8, name: 'Instructor', role: 'crew' },
      { simVarIndex: 10, cfgIndex: 9, name: 'fwd_gly', role: 'galley' },
      { simVarIndex: 11, cfgIndex: 10, name: 'aft_gly', role: 'galley' },
    ],
    notes: [
      'PMDG 737-800BDSF freighter family (SSW / BW) — same deck roles as BCF',
      'Shares Market SKU pmdg-738-bcf-family with BCF pack (familyRolesPackRelPaths)',
      'SimBrief: Converted Freighter airframe; load via PMDG EFB',
      'liveSources: NG3 fuel + PMDG EFB LVars',
    ],
  },
  {
    id: 'pmdg-dc6',
    icao: 'DC6',
    // DC-6A freighter, DC-6B passenger, DC-6BP — same 12-station layout in PMDG MSFS.
    titlePattern: /\bDC-6(?:BP|[AB])\b/i,
    familyPackRel: 'pmdg-dc6.json',
    marketTypeId: 'pmdg-dc6',
    marketLabel: 'PMDG DC-6',
    stationRoles: {
      passengerStations: [],
      baggageStations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      crewStations: [1, 2],
    },
    liveSources: {
      fuel: ['classic', 'mass-balance'],
      weights: ['classic-weights'],
      payload: ['classic-stations'],
    },
    loadMethod: 'native-simbrief',
    injectCapable: false,
    simbriefIcao: 'DC6',
    simbriefAirframeMatch: 'Default',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Pilot', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Copilot', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Cabin / cargo 1', role: 'baggage' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Cabin / cargo 2', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Cabin / cargo 3', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Cabin / cargo 4', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Cabin / cargo 5', role: 'baggage' },
      { simVarIndex: 8, cfgIndex: 7, name: 'Cabin / cargo 6', role: 'baggage' },
      { simVarIndex: 9, cfgIndex: 8, name: 'Cabin / cargo 7', role: 'baggage' },
      { simVarIndex: 10, cfgIndex: 9, name: 'Cabin / cargo 8', role: 'baggage' },
      { simVarIndex: 11, cfgIndex: 10, name: 'Cabin / cargo 9', role: 'baggage' },
      { simVarIndex: 12, cfgIndex: 11, name: 'Cabin / cargo 10', role: 'baggage' },
    ],
    notes: [
      'PMDG DC-6 family (DC-6A / DC-6B / DC-6BP) — same 12-station layout',
      'One Skyline Market SKU: pmdg-dc6 (medium_piston)',
      'loadMethod: native-simbrief; injectCapable: false — load via PMDG Fuel/Load Manager',
      'liveSources: classic tanks + mass-balance fuel; payload classic-stations (MB residual when stations ghost)',
      'SimBrief: Default DC6',
    ],
  },
  {
    id: 'pmdg-777f',
    icao: 'B77F',
    titlePattern: /\b777F\b/i,
    familyPackRel: 'pmdg-777.json',
    marketTypeId: 'pmdg-777f',
    marketLabel: 'PMDG 777F',
    stationRoles: {
      passengerStations: [],
      baggageStations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      crewStations: [1, 2],
    },
    liveSources: {
      fuel: ['classic', 'mass-balance'],
      weights: ['classic-weights'],
      payload: ['classic-stations'],
    },
    loadMethod: 'native-simbrief',
    injectCapable: false,
    simbriefIcao: 'B77F',
    simbriefAirframeMatch: 'Default',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Station 1', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Station 2', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Station 3', role: 'baggage' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Station 4', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Station 5', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Station 6', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Station 7', role: 'baggage' },
      { simVarIndex: 8, cfgIndex: 7, name: 'Station 8', role: 'baggage' },
      { simVarIndex: 9, cfgIndex: 8, name: 'Station 9', role: 'baggage' },
      { simVarIndex: 10, cfgIndex: 9, name: 'Station 10', role: 'baggage' },
      { simVarIndex: 11, cfgIndex: 10, name: 'Station 11', role: 'baggage' },
      { simVarIndex: 12, cfgIndex: 11, name: 'Station 12', role: 'baggage' },
      { simVarIndex: 13, cfgIndex: 12, name: 'Station 13', role: 'baggage' },
      { simVarIndex: 14, cfgIndex: 13, name: 'Station 14', role: 'baggage' },
      { simVarIndex: 15, cfgIndex: 14, name: 'Station 15', role: 'baggage' },
      { simVarIndex: 16, cfgIndex: 15, name: 'Station 16', role: 'baggage' },
    ],
    notes: [
      'PMDG 777F — shares freighter OFP pack with 300ER (same stations/tanks)',
      'Market SKU pmdg-777f (wide_freighter); SimBrief B77F',
      'loadMethod: native-simbrief; injectCapable: false',
    ],
  },
  {
    id: 'pmdg-777-200lr',
    icao: 'B77L',
    titlePattern: /\b777-200LR\b/i,
    familyPackRel: 'pmdg-777-200lr-pax.json',
    marketTypeId: 'pmdg-777-200lr',
    marketLabel: 'PMDG 777-200LR',
    stationRoles: {
      passengerStations: [3, 6, 7, 8, 9],
      baggageStations: [4, 5, 14, 15, 16],
      crewStations: [1, 2],
      serviceStations: [10, 11, 12, 13],
    },
    liveSources: {
      fuel: ['classic', 'mass-balance'],
      weights: ['pmdg-efb-lvars', 'classic-weights'],
      payload: ['pmdg-efb', 'classic-stations'],
    },
    loadMethod: 'direct-injection',
    injectCapable: true,
    simbriefIcao: 'B77L',
    simbriefAirframeMatch: 'PMDG \\(MSFS\\) - Standard',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Station 1', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Station 2', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Station 3', role: 'passenger' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Station 4', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Station 5', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Station 6', role: 'passenger' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Station 7', role: 'passenger' },
      { simVarIndex: 8, cfgIndex: 7, name: 'Station 8', role: 'passenger' },
      { simVarIndex: 9, cfgIndex: 8, name: 'Station 9', role: 'passenger' },
      { simVarIndex: 10, cfgIndex: 9, name: 'Station 10', role: 'service' },
      { simVarIndex: 11, cfgIndex: 10, name: 'Station 11', role: 'service' },
      { simVarIndex: 12, cfgIndex: 11, name: 'Station 12', role: 'service' },
      { simVarIndex: 13, cfgIndex: 12, name: 'Station 13', role: 'service' },
      { simVarIndex: 14, cfgIndex: 13, name: 'Station 14', role: 'baggage' },
      { simVarIndex: 15, cfgIndex: 14, name: 'Station 15', role: 'baggage' },
      { simVarIndex: 16, cfgIndex: 15, name: 'Station 16', role: 'baggage' },
    ],
    notes: [
      'PMDG 777-200LR — pax_and_cargo; SimBrief PMDG (MSFS) - Standard (297 seats)',
      'Market SKU pmdg-777-200lr (wide_freighter); SimBrief B77L',
      'loadMethod: direct-injection; injectCapable: true — CDU FO TOTAL + ZFW (pmdg-cdu)',
      '777F / 300ER remain on pmdg-777.json freighter stations',
    ],
  },
  {
    id: 'pmdg-777-200er',
    icao: 'B772',
    titlePattern: /\b777-200ER(?:\s+(?:RR|PW|GE))?\b/i,
    familyPackRel: 'pmdg-777-pax.json',
    marketTypeId: 'pmdg-777-200er',
    marketLabel: 'PMDG 777-200ER',
    stationRoles: {
      passengerStations: [3, 6, 7, 8, 9],
      baggageStations: [4, 5, 14, 15, 16],
      crewStations: [1, 2],
      serviceStations: [10, 11, 12, 13],
    },
    liveSources: {
      fuel: ['classic', 'mass-balance'],
      weights: ['pmdg-efb-lvars', 'classic-weights'],
      payload: ['pmdg-efb', 'classic-stations'],
    },
    loadMethod: 'direct-injection',
    injectCapable: true,
    simbriefIcao: 'B772',
    simbriefAirframeMatch: 'Default',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Station 1', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Station 2', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Station 3', role: 'passenger' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Station 4', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Station 5', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Station 6', role: 'passenger' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Station 7', role: 'passenger' },
      { simVarIndex: 8, cfgIndex: 7, name: 'Station 8', role: 'passenger' },
      { simVarIndex: 9, cfgIndex: 8, name: 'Station 9', role: 'passenger' },
      { simVarIndex: 10, cfgIndex: 9, name: 'Station 10', role: 'service' },
      { simVarIndex: 11, cfgIndex: 10, name: 'Station 11', role: 'service' },
      { simVarIndex: 12, cfgIndex: 11, name: 'Station 12', role: 'service' },
      { simVarIndex: 13, cfgIndex: 12, name: 'Station 13', role: 'service' },
      { simVarIndex: 14, cfgIndex: 13, name: 'Station 14', role: 'baggage' },
      { simVarIndex: 15, cfgIndex: 14, name: 'Station 15', role: 'baggage' },
      { simVarIndex: 16, cfgIndex: 15, name: 'Station 16', role: 'baggage' },
    ],
    notes: [
      'PMDG 777-200ER (RR / PW / GE) — pax_and_cargo pack (294 seats; SimBrief hold cap ~85,140 lb)',
      'Market SKU pmdg-777-200er (wide_freighter); SimBrief B772 per engine',
      'loadMethod: direct-injection; injectCapable: true — CDU FO TOTAL + ZFW (pmdg-cdu)',
      '777F / 300ER remain on pmdg-777.json freighter stations; 200LR → pmdg-777-200lr-pax.json',
    ],
  },
  {
    id: 'pmdg-777-300er',
    icao: 'B77W',
    titlePattern: /\b777-300ER\b/i,
    familyPackRel: 'pmdg-777.json',
    marketTypeId: 'pmdg-777-300er',
    marketLabel: 'PMDG 777-300ER',
    stationRoles: {
      passengerStations: [],
      baggageStations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      crewStations: [1, 2],
    },
    liveSources: {
      fuel: ['classic', 'mass-balance'],
      weights: ['classic-weights'],
      payload: ['classic-stations'],
    },
    loadMethod: 'native-simbrief',
    injectCapable: false,
    simbriefIcao: 'B77W',
    simbriefAirframeMatch: 'Default',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Station 1', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Station 2', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Station 3', role: 'baggage' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Station 4', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Station 5', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Station 6', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Station 7', role: 'baggage' },
      { simVarIndex: 8, cfgIndex: 7, name: 'Station 8', role: 'baggage' },
      { simVarIndex: 9, cfgIndex: 8, name: 'Station 9', role: 'baggage' },
      { simVarIndex: 10, cfgIndex: 9, name: 'Station 10', role: 'baggage' },
      { simVarIndex: 11, cfgIndex: 10, name: 'Station 11', role: 'baggage' },
      { simVarIndex: 12, cfgIndex: 11, name: 'Station 12', role: 'baggage' },
      { simVarIndex: 13, cfgIndex: 12, name: 'Station 13', role: 'baggage' },
      { simVarIndex: 14, cfgIndex: 13, name: 'Station 14', role: 'baggage' },
      { simVarIndex: 15, cfgIndex: 14, name: 'Station 15', role: 'baggage' },
      { simVarIndex: 16, cfgIndex: 15, name: 'Station 16', role: 'baggage' },
    ],
    notes: [
      'PMDG 777-300ER — shares freighter OFP pack with 777F',
      'Market SKU pmdg-777-300er (wide_freighter); SimBrief B77W',
      'loadMethod: native-simbrief; injectCapable: false',
    ],
  },
  {
    id: 'tfdi-md11f',
    icao: 'MD11',
    titlePattern: /MD-11F/i,
    familyPackRel: 'tfdi-md11f.json',
    stationRoles: {
      passengerStations: [],
      // Upper zones 1–4 L/R + lower forward/rear (cfg station_load.3..12 → SimVars 4..13)
      baggageStations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
      crewStations: [1, 2, 3],
      // :14/:15 are aux tank stations — not cargo
    },
    liveSources: TFDI_MD11_LIVE_SOURCES,
    loadMethod: 'native-simbrief',
    injectCapable: false,
    simbriefIcao: 'MD1F',
    // Title hint (PW/GE) disambiguates among TFDi freighter variants.
    simbriefAirframeMatch: 'TFDi Design \\(MSFS\\) - MD-11F',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Pilot', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'First Officer', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Engineer', role: 'crew' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Upper zone 1 L', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Upper zone 1 R', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Upper zone 2 L', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Upper zone 2 R', role: 'baggage' },
      { simVarIndex: 8, cfgIndex: 7, name: 'Upper zone 3 L', role: 'baggage' },
      { simVarIndex: 9, cfgIndex: 8, name: 'Upper zone 3 R', role: 'baggage' },
      { simVarIndex: 10, cfgIndex: 9, name: 'Upper zone 4 L', role: 'baggage' },
      { simVarIndex: 11, cfgIndex: 10, name: 'Upper zone 4 R', role: 'baggage' },
      { simVarIndex: 12, cfgIndex: 11, name: 'Lower forward cargo', role: 'baggage' },
      { simVarIndex: 13, cfgIndex: 12, name: 'Lower rear cargo', role: 'baggage' },
      { simVarIndex: 14, cfgIndex: 13, name: 'Left aux tank', role: 'unused' },
      { simVarIndex: 15, cfgIndex: 14, name: 'Right aux tank', role: 'unused' },
    ],
    notes: [
      'TFDi Design MD-11F (GE/PW presets share this station layout)',
      'liveSources: TFDi EFB LVars (kg→lb); fuel fallback mass-balance',
      'SimBrief: MD11 freighter airframe matching engines (PW4462 / GE)',
      'Host snapshot currently includes stations 1–14 (covers all cargo indices)',
    ],
  },
  {
    id: 'toliss-a346',
    icao: 'A346',
    titlePattern: /ToLiss A346|A346 PRO/i,
    familyPackRel: 'toliss-a346.json',
    stationRoles: {
      passengerStations: [3, 4, 5],
      baggageStations: [6, 7],
      crewStations: [1, 2],
      // averagePassengerWeight: leave unset — resolve from OFP (payload−bags)/pax
    },
    liveSources: TOLISS_A346_LIVE_SOURCES,
    loadMethod: 'native-simbrief',
    injectCapable: false,
    simbriefIcao: 'A346',
    simbriefAirframeMatch: 'Aerosoft \\(MSFS\\) - A340-600 Pro \\(Standard Gross Weight\\)',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Pilot', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Copilot', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Business class', role: 'passenger' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Premium economy', role: 'passenger' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Economy class', role: 'passenger' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Forward baggage', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Rear baggage', role: 'baggage' },
    ],
    notes: [
      'Aerosoft / ToLiss A346 PRO (Preset Pax) — flight_model station_load.0..6',
      'liveSources: classic stations; fuel mass-balance then classic (no PMDG/TFDi probe)',
      'SimBrief: A346 passenger airframe',
      'Package has Pax preset only (no freighter)',
    ],
  },
  {
    id: 'blacksquare-caravan-professional-super-cargomaster',
    icao: 'C208',
    titlePattern: /Black Square Caravan Professional Super Cargomaster/i,
    familyPackRel: 'blacksquare-caravan-professional-super-cargomaster.json',
    marketTypeId: 'c208-caravan-cargo',
    marketLabel: 'Cessna 208 Caravan Cargo',
    stationRoles: {
      passengerStations: [],
      baggageStations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      crewStations: [1, 2],
    },
    liveSources: CLASSIC_LIGHT_LIVE_SOURCES,
    loadMethod: 'direct-injection',
    injectCapable: true,
    simbriefIcao: 'C208',
    simbriefAirframeMatch: 'Default',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Pilot', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Copilot', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Zone 1', role: 'baggage' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Zone 2', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Zone 3', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Zone 4', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Zone 5', role: 'baggage' },
      { simVarIndex: 8, cfgIndex: 7, name: 'Zone 6', role: 'baggage' },
      { simVarIndex: 9, cfgIndex: 8, name: 'Cargo pod 1', role: 'baggage' },
      { simVarIndex: 10, cfgIndex: 9, name: 'Cargo pod 2', role: 'baggage' },
      { simVarIndex: 11, cfgIndex: 10, name: 'Cargo pod 3', role: 'baggage' },
      { simVarIndex: 12, cfgIndex: 11, name: 'Cargo pod 4', role: 'baggage' },
    ],
    notes: [
      'Black Square Caravan Professional Super Cargomaster',
      'One Market SKU c208-caravan-cargo (Gear / Cargo Pod / Super Cargomaster / Asobo C208B)',
      'liveSources: classic fuel tanks + classic stations/weights',
      'SimBrief: Default C208',
    ],
  },
  {
    id: 'blacksquare-caravan-professional-gear',
    icao: 'C208',
    titlePattern: /Black Square Caravan Professional Gear/i,
    familyPackRel: 'blacksquare-caravan-professional-gear.json',
    marketTypeId: 'c208-caravan-cargo',
    marketLabel: 'Cessna 208 Caravan Cargo',
    stationRoles: {
      passengerStations: [],
      baggageStations: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      crewStations: [1, 2],
    },
    liveSources: CLASSIC_LIGHT_LIVE_SOURCES,
    loadMethod: 'direct-injection',
    injectCapable: true,
    simbriefIcao: 'C208',
    simbriefAirframeMatch: 'Default',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Pilot', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Copilot', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Passenger 03', role: 'baggage' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Passenger 04', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Passenger 05', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Passenger 06', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Passenger 07', role: 'baggage' },
      { simVarIndex: 8, cfgIndex: 7, name: 'Passenger 08', role: 'baggage' },
      { simVarIndex: 9, cfgIndex: 8, name: 'Passenger 09', role: 'baggage' },
      { simVarIndex: 10, cfgIndex: 9, name: 'Passenger 10', role: 'baggage' },
      { simVarIndex: 11, cfgIndex: 10, name: 'Cargo cabin', role: 'baggage' },
    ],
    notes: [
      'Black Square Caravan Professional Gear',
      'One Market SKU c208-caravan-cargo (Gear / Cargo Pod / Super Cargomaster / Asobo C208B)',
      'liveSources: classic fuel tanks + classic stations/weights',
      'SimBrief: Default C208',
    ],
  },
  {
    id: 'blacksquare-caravan-cargo-pod',
    icao: 'C208',
    titlePattern: /Black Square Caravan Professional Cargo Pod/i,
    familyPackRel: 'blacksquare-caravan-cargo-pod.json',
    marketTypeId: 'c208-caravan-cargo',
    marketLabel: 'Cessna 208 Caravan Cargo',
    stationRoles: {
      passengerStations: [],
      // Cabin seats + cabin cargo + belly pods — freighter career (pax=0).
      baggageStations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      crewStations: [1, 2],
    },
    liveSources: CLASSIC_LIGHT_LIVE_SOURCES,
    loadMethod: 'direct-injection',
    injectCapable: true,
    simbriefIcao: 'C208',
    simbriefAirframeMatch: 'Default',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Pilot', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Copilot', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Cabin seat 03 (cargo)', role: 'baggage' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Cabin seat 04 (cargo)', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Cabin seat 05 (cargo)', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Cabin seat 06 (cargo)', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Cabin seat 07 (cargo)', role: 'baggage' },
      { simVarIndex: 8, cfgIndex: 7, name: 'Cabin seat 08 (cargo)', role: 'baggage' },
      { simVarIndex: 9, cfgIndex: 8, name: 'Cabin seat 09 (cargo)', role: 'baggage' },
      { simVarIndex: 10, cfgIndex: 9, name: 'Cabin seat 10 (cargo)', role: 'baggage' },
      { simVarIndex: 11, cfgIndex: 10, name: 'Cargo cabin', role: 'baggage' },
      { simVarIndex: 12, cfgIndex: 11, name: 'Cargo pod 1', role: 'baggage' },
      { simVarIndex: 13, cfgIndex: 12, name: 'Cargo pod 2', role: 'baggage' },
      { simVarIndex: 14, cfgIndex: 13, name: 'Cargo pod 3', role: 'baggage' },
      { simVarIndex: 15, cfgIndex: 14, name: 'Cargo pod 4', role: 'baggage' },
    ],
    notes: [
      'Black Square Caravan Professional Cargo Pod',
      'One Market SKU c208-caravan-cargo (Gear / Cargo Pod / Super Cargomaster / Asobo C208B)',
      'liveSources: classic fuel tanks + classic stations/weights',
      'SimBrief: Default C208 only (structural maxcargo ≈ mzfw−oew)',
      'Host snapshot may expose stations 1–14; station 15 still in roles for full cfg',
    ],
  },
  {
    id: 'asobo-c208b-cargo',
    icao: 'C208',
    titlePattern: /C208B Cargo/i,
    familyPackRel: 'asobo-c208b-cargo.json',
    marketTypeId: 'c208-caravan-cargo',
    marketLabel: 'Cessna 208 Caravan Cargo',
    stationRoles: {
      passengerStations: [],
      baggageStations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      crewStations: [1, 2],
    },
    liveSources: CLASSIC_LIGHT_LIVE_SOURCES,
    loadMethod: 'direct-injection',
    injectCapable: true,
    simbriefIcao: 'C208',
    simbriefAirframeMatch: 'Default',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Station 1', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Station 2', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Station 3', role: 'baggage' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Station 4', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Station 5', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Station 6', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Station 7', role: 'baggage' },
      { simVarIndex: 8, cfgIndex: 7, name: 'Station 8', role: 'baggage' },
      { simVarIndex: 9, cfgIndex: 8, name: 'Station 9', role: 'baggage' },
      { simVarIndex: 10, cfgIndex: 9, name: 'Station 10', role: 'baggage' },
      { simVarIndex: 11, cfgIndex: 10, name: 'Station 11', role: 'baggage' },
      { simVarIndex: 12, cfgIndex: 11, name: 'Station 12', role: 'baggage' },
    ],
    notes: [
      'Asobo C208B Cargo',
      'One Market SKU c208-caravan-cargo (Gear / Cargo Pod / Super Cargomaster / Asobo C208B)',
      'liveSources: classic fuel tanks + classic stations/weights',
      'SimBrief: Default C208',
    ],
  },
  {
    id: 'flightfx-mg-hjet-ha420',
    icao: 'HDJT',
    // Live title often includes "[Preset Default]" / other cabin presets.
    titlePattern: /mg hjet ha420/i,
    familyPackRel: 'flightfx-mg-hjet-ha420.json',
    marketTypeId: 'flightfx-mg-hjet-ha420',
    marketLabel: 'FlightFX HondaJet HA420',
    stationRoles: {
      passengerStations: [],
      baggageStations: [3, 4, 5, 6, 7, 8, 9],
      crewStations: [1, 2],
    },
    liveSources: CLASSIC_LIGHT_LIVE_SOURCES,
    loadMethod: 'direct-injection',
    injectCapable: true,
    simbriefIcao: 'HDJT',
    simbriefAirframeMatch: 'Default',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'PILOT', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'PAX0', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'PAX1', role: 'baggage' },
      { simVarIndex: 4, cfgIndex: 3, name: 'PAX2', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'PAX3', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'PAX4', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'PAX5', role: 'baggage' },
      { simVarIndex: 8, cfgIndex: 7, name: 'CARGO REAR', role: 'baggage' },
      { simVarIndex: 9, cfgIndex: 8, name: 'CARGO FRONT', role: 'baggage' },
    ],
    notes: [
      'FlightFX HondaJet HA420 (mg hjet ha420) — presets share stations/tanks',
      'CG PERCENT scale disagrees with CG FWD/AFT LIMIT (20–31); profile uses calibrated-live',
      'loadMethod: direct-injection; classic L/R/CENTER/CENTER2',
      'SimBrief: Default HDJT',
    ],
  },
  {
    id: 'blackbox-bn2-islander-cargo-tip-tanks',
    icao: 'BN2P',
    // Analogue (steam) and Garmin (G3000) cargo tip-tank share stations / SimBrief.
    titlePattern: /BN2 Islander - Cargo \/ (?:Analogue|Garmin) \/ Tip Tanks/i,
    familyPackRel: 'blackbox-bn2-islander-cargo-tip-tanks.json',
    marketLabel: 'BN2 Islander',
    stationRoles: {
      passengerStations: [],
      baggageStations: [3, 4],
      crewStations: [1, 2],
    },
    liveSources: CLASSIC_LIGHT_LIVE_SOURCES,
    loadMethod: 'direct-injection',
    injectCapable: true,
    simbriefIcao: 'BN2P',
    simbriefAirframeMatch: 'Default',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Station 1', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Station 2', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Station 3', role: 'baggage' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Station 4', role: 'baggage' },
    ],
    notes: [
      'Black Box BN-2 Islander family (Cargo Tip Tanks Analogue/Garmin + SpecialOps)',
      'One Market SKU — live MSFS title picks cargo vs specialops roles pack',
      'Cargo tip-tank: same 4-station layout for steam vs G3000 panel',
      'liveSources: classic fuel tanks + classic stations/weights',
      'SimBrief: Default BN2P',
    ],
  },
  {
    id: 'justflight-fokker-f70',
    icao: 'F70',
    titlePattern: /Just Flight F70\b/i,
    familyPackRel: 'justflight-fokker-f70.json',
    marketTypeId: 'justflight-f70',
    marketLabel: 'Just Flight F70',
    stationRoles: {
      passengerStations: [],
      baggageStations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
      crewStations: [1, 2],
    },
    liveSources: {
      fuel: ['classic', 'mass-balance'],
      weights: ['classic-weights'],
      payload: ['classic-stations'],
    },
    loadMethod: 'native-simbrief',
    injectCapable: false,
    simbriefAirframeMatch: 'Just Flight \\(MSFS\\) - 70 Passengers',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Station 1', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Station 2', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Station 3', role: 'baggage' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Station 4', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Station 5', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Station 6', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Station 7', role: 'baggage' },
      { simVarIndex: 8, cfgIndex: 7, name: 'Station 8', role: 'baggage' },
      { simVarIndex: 9, cfgIndex: 8, name: 'Station 9', role: 'baggage' },
      { simVarIndex: 10, cfgIndex: 9, name: 'Station 10', role: 'baggage' },
      { simVarIndex: 11, cfgIndex: 10, name: 'Station 11', role: 'baggage' },
      { simVarIndex: 12, cfgIndex: 11, name: 'Station 12', role: 'baggage' },
      { simVarIndex: 13, cfgIndex: 12, name: 'Station 13', role: 'baggage' },
    ],
    notes: [
      'Just Flight F70 — own OFP pack (same 13-station layout as F100)',
      'Market SKU justflight-f70 (narrow_freighter, pax_and_cargo, 70 seats); SimBrief F70',
      'loadMethod: native-simbrief; injectCapable: false',
    ],
  },
  {
    id: 'justflight-fokker-f100',
    icao: 'F100',
    titlePattern: /Just Flight F100\b/i,
    familyPackRel: 'justflight-fokker-f100.json',
    marketTypeId: 'justflight-f100',
    marketLabel: 'Just Flight F100',
    stationRoles: {
      passengerStations: [],
      baggageStations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
      crewStations: [1, 2],
    },
    liveSources: {
      fuel: ['classic', 'mass-balance'],
      weights: ['classic-weights'],
      payload: ['classic-stations'],
    },
    loadMethod: 'native-simbrief',
    injectCapable: false,
    simbriefIcao: 'F100',
    simbriefAirframeMatch: 'Default',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Station 1', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Station 2', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Station 3', role: 'baggage' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Station 4', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Station 5', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Station 6', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Station 7', role: 'baggage' },
      { simVarIndex: 8, cfgIndex: 7, name: 'Station 8', role: 'baggage' },
      { simVarIndex: 9, cfgIndex: 8, name: 'Station 9', role: 'baggage' },
      { simVarIndex: 10, cfgIndex: 9, name: 'Station 10', role: 'baggage' },
      { simVarIndex: 11, cfgIndex: 10, name: 'Station 11', role: 'baggage' },
      { simVarIndex: 12, cfgIndex: 11, name: 'Station 12', role: 'baggage' },
      { simVarIndex: 13, cfgIndex: 12, name: 'Station 13', role: 'baggage' },
    ],
    notes: [
      'Just Flight F100 — own OFP pack (same 13-station layout as F70)',
      'Market SKU justflight-f100 (narrow_freighter, pax_and_cargo, 100 seats); SimBrief F100',
      'loadMethod: native-simbrief; injectCapable: false',
    ],
  },
  {
    id: 'justflight-fokker-f28',
    icao: 'F28',
    // 1000/2000/3000/4000 + livery suffixes (Air21, Ansett, …) — same stations/tanks.
    titlePattern: /Just Flight Fokker F28-(?:1000|2000|3000|4000)/i,
    familyPackRel: 'justflight-fokker-f28.json',
    marketTypeId: 'justflight-fokker-f28',
    marketLabel: 'Just Flight Fokker F28',
    stationRoles: {
      passengerStations: [],
      baggageStations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
      crewStations: [1, 2],
    },
    liveSources: {
      fuel: ['classic', 'mass-balance'],
      weights: ['classic-weights'],
      payload: ['classic-stations'],
    },
    loadMethod: 'native-simbrief',
    injectCapable: false,
    simbriefIcao: 'F28',
    simbriefAirframeMatch: 'Default',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Station 1', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Station 2', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Station 3', role: 'baggage' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Station 4', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Station 5', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Station 6', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Station 7', role: 'baggage' },
      { simVarIndex: 8, cfgIndex: 7, name: 'Station 8', role: 'baggage' },
      { simVarIndex: 9, cfgIndex: 8, name: 'Station 9', role: 'baggage' },
      { simVarIndex: 10, cfgIndex: 9, name: 'Station 10', role: 'baggage' },
      { simVarIndex: 11, cfgIndex: 10, name: 'Station 11', role: 'baggage' },
      { simVarIndex: 12, cfgIndex: 11, name: 'Station 12', role: 'baggage' },
      { simVarIndex: 13, cfgIndex: 12, name: 'Station 13', role: 'baggage' },
    ],
    notes: [
      'Just Flight Fokker F28 family (1000–4000) — same 13-station layout',
      'One Market SKU justflight-fokker-f28 (narrow_freighter, pax_and_cargo; seats from live Mk)',
      'loadMethod: native-simbrief; injectCapable: false',
      'SimBrief: Just Flight F28 Mk.1000–4000 (no Default type=F28)',
    ],
  },
  {
    id: 'fenix-a319',
    icao: 'A319',
    titlePattern: /FenixA319\s+(?:CFM|IAE)\s+(?:SL|WF)\s+(?:HD|SD)\b/i,
    familyPackRel: 'fenix-a319.json',
    marketTypeId: 'fenix-a319',
    marketLabel: 'Fenix A319',
    stationRoles: {
      passengerStations: [],
      baggageStations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      crewStations: [1, 2],
    },
    liveSources: {
      fuel: ['classic', 'mass-balance'],
      weights: ['classic-weights'],
      payload: ['classic-stations'],
    },
    loadMethod: 'native-simbrief',
    injectCapable: false,
    simbriefIcao: 'A319',
    simbriefAirframeMatch: 'Default',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Station 1', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Station 2', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Station 3', role: 'baggage' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Station 4', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Station 5', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Station 6', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Station 7', role: 'baggage' },
      { simVarIndex: 8, cfgIndex: 7, name: 'Station 8', role: 'baggage' },
      { simVarIndex: 9, cfgIndex: 8, name: 'Station 9', role: 'baggage' },
      { simVarIndex: 10, cfgIndex: 9, name: 'Station 10', role: 'baggage' },
      { simVarIndex: 11, cfgIndex: 10, name: 'Station 11', role: 'baggage' },
      { simVarIndex: 12, cfgIndex: 11, name: 'Station 12', role: 'baggage' },
      { simVarIndex: 13, cfgIndex: 12, name: 'Station 13', role: 'baggage' },
      { simVarIndex: 14, cfgIndex: 13, name: 'Station 14', role: 'baggage' },
      { simVarIndex: 15, cfgIndex: 14, name: 'Station 15', role: 'baggage' },
      { simVarIndex: 16, cfgIndex: 15, name: 'Station 16', role: 'baggage' },
    ],
    notes: [
      'Fenix A319 family (CFM/IAE × SL/WF × HD/SD) — same 16-station layout',
      'Market SKU fenix-a319 (narrow_freighter, pax_and_cargo, 150 seats); SimBrief A319 Fenix CFM/IAE',
      'loadMethod: native-simbrief; injectCapable: false',
    ],
  },
  {
    id: 'fenix-a320',
    icao: 'A320',
    titlePattern: /FenixA320\s+(?:CFM|IAE)\s+(?:SL|WF)\b/i,
    familyPackRel: 'fenix-a320.json',
    marketTypeId: 'fenix-a320',
    marketLabel: 'Fenix A320',
    stationRoles: {
      passengerStations: [],
      baggageStations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      crewStations: [1, 2],
    },
    liveSources: {
      fuel: ['classic', 'mass-balance'],
      weights: ['classic-weights'],
      payload: ['classic-stations'],
    },
    loadMethod: 'native-simbrief',
    injectCapable: false,
    simbriefIcao: 'A320',
    simbriefAirframeMatch: 'Default',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Station 1', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Station 2', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Station 3', role: 'baggage' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Station 4', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Station 5', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Station 6', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Station 7', role: 'baggage' },
      { simVarIndex: 8, cfgIndex: 7, name: 'Station 8', role: 'baggage' },
      { simVarIndex: 9, cfgIndex: 8, name: 'Station 9', role: 'baggage' },
      { simVarIndex: 10, cfgIndex: 9, name: 'Station 10', role: 'baggage' },
      { simVarIndex: 11, cfgIndex: 10, name: 'Station 11', role: 'baggage' },
      { simVarIndex: 12, cfgIndex: 11, name: 'Station 12', role: 'baggage' },
      { simVarIndex: 13, cfgIndex: 12, name: 'Station 13', role: 'baggage' },
      { simVarIndex: 14, cfgIndex: 13, name: 'Station 14', role: 'baggage' },
      { simVarIndex: 15, cfgIndex: 14, name: 'Station 15', role: 'baggage' },
      { simVarIndex: 16, cfgIndex: 15, name: 'Station 16', role: 'baggage' },
    ],
    notes: [
      'Fenix A320 family (CFM/IAE × SL/WF) — same 16-station layout',
      'Market SKU fenix-a320 (narrow_freighter, pax_and_cargo, 180 seats); SimBrief A320 Fenix CFM/IAE',
      'loadMethod: native-simbrief; injectCapable: false',
    ],
  },
  {
    id: 'fenix-a321',
    icao: 'A321',
    titlePattern: /FenixA321\s+(?:CFM|IAE)\s+(?:SL|WF)\s+(?:TC|SC)\b/i,
    familyPackRel: 'fenix-a321.json',
    marketTypeId: 'fenix-a321',
    marketLabel: 'Fenix A321',
    stationRoles: {
      passengerStations: [],
      baggageStations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      crewStations: [1, 2],
    },
    liveSources: {
      fuel: ['classic', 'mass-balance'],
      weights: ['classic-weights'],
      payload: ['classic-stations'],
    },
    loadMethod: 'native-simbrief',
    injectCapable: false,
    simbriefIcao: 'A321',
    simbriefAirframeMatch: 'Default',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Station 1', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Station 2', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Station 3', role: 'baggage' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Station 4', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Station 5', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Station 6', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Station 7', role: 'baggage' },
      { simVarIndex: 8, cfgIndex: 7, name: 'Station 8', role: 'baggage' },
      { simVarIndex: 9, cfgIndex: 8, name: 'Station 9', role: 'baggage' },
      { simVarIndex: 10, cfgIndex: 9, name: 'Station 10', role: 'baggage' },
      { simVarIndex: 11, cfgIndex: 10, name: 'Station 11', role: 'baggage' },
      { simVarIndex: 12, cfgIndex: 11, name: 'Station 12', role: 'baggage' },
      { simVarIndex: 13, cfgIndex: 12, name: 'Station 13', role: 'baggage' },
      { simVarIndex: 14, cfgIndex: 13, name: 'Station 14', role: 'baggage' },
      { simVarIndex: 15, cfgIndex: 14, name: 'Station 15', role: 'baggage' },
      { simVarIndex: 16, cfgIndex: 15, name: 'Station 16', role: 'baggage' },
    ],
    notes: [
      'Fenix A321 family (CFM/IAE × SL/WF × TC/SC) — same 16-station layout',
      'Market SKU fenix-a321 (narrow_freighter, pax_and_cargo, 230 seats); SimBrief A321 Fenix CFM/IAE',
      'loadMethod: native-simbrief; injectCapable: false',
    ],
  },
  {
    id: 'microsoft-a320neo-v2',
    icao: 'A20N',
    titlePattern: /A320neo\s*V2\b/i,
    familyPackRel: 'microsoft-a320neo-v2.json',
    marketTypeId: 'microsoft-a320neo-v2',
    marketLabel: 'Microsoft A320neo V2',
    stationRoles: {
      passengerStations: [],
      baggageStations: [3, 4, 5, 6, 7, 8],
      crewStations: [1, 2],
    },
    liveSources: {
      fuel: ['classic', 'mass-balance'],
      weights: ['classic-weights'],
      payload: ['classic-stations'],
    },
    loadMethod: 'native-simbrief',
    injectCapable: false,
    simbriefIcao: 'A20N',
    simbriefAirframeMatch: 'iniBuilds \\(MSFS\\) - A320neo V2',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Station 1', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Station 2', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Station 3', role: 'baggage' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Station 4', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Station 5', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Station 6', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Station 7', role: 'baggage' },
      { simVarIndex: 8, cfgIndex: 7, name: 'Station 8', role: 'baggage' },
    ],
    notes: [
      'Microsoft A320neo V2 — 8-station layout',
      'Market SKU microsoft-a320neo-v2 (narrow_freighter, pax_and_cargo, 180 seats); SimBrief A20N iniBuilds V2',
      'loadMethod: native-simbrief; injectCapable: false',
    ],
  },
  {
    id: 'microsoft-a321lr',
    icao: 'A21N',
    titlePattern: /(?:Microsoft\s+)?A321LR\b|^A321$/i,
    familyPackRel: 'microsoft-a321lr.json',
    marketTypeId: 'microsoft-a321lr',
    marketLabel: 'Microsoft A321LR',
    stationRoles: {
      passengerStations: [],
      baggageStations: [3, 4, 5, 6, 7, 8],
      crewStations: [1, 2],
    },
    liveSources: {
      fuel: ['classic', 'mass-balance'],
      weights: ['classic-weights'],
      payload: ['classic-stations'],
    },
    loadMethod: 'native-simbrief',
    injectCapable: false,
    simbriefIcao: 'A21N',
    simbriefAirframeMatch: 'iniBuilds \\(MSFS\\) - A321LR LEAP-1A',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Station 1', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Station 2', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Station 3', role: 'baggage' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Station 4', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Station 5', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Station 6', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Station 7', role: 'baggage' },
      { simVarIndex: 8, cfgIndex: 7, name: 'Station 8', role: 'baggage' },
    ],
    notes: [
      'Microsoft A321LR — 8-station layout',
      'Market SKU microsoft-a321lr (narrow_freighter, pax_and_cargo, 220 seats); SimBrief A21N iniBuilds A321LR LEAP-1A',
      'loadMethod: native-simbrief; injectCapable: false',
    ],
  },
  {
    id: 'blacksquare-commander-114',
    icao: 'AC11',
    // NA and turbo share the same 5-station cargo layout.
    titlePattern: /Black Square Commander 114(?:TC)?\b/i,
    familyPackRel: 'blacksquare-commander-114.json',
    marketLabel: 'Rockwell Commander 114',
    stationRoles: {
      passengerStations: [],
      baggageStations: [3, 4, 5],
      crewStations: [1, 2],
    },
    liveSources: CLASSIC_LIGHT_LIVE_SOURCES,
    loadMethod: 'direct-injection',
    injectCapable: true,
    simbriefIcao: 'C182',
    simbriefAirframeMatch: 'Default',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Station 1', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Station 2', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Station 3', role: 'baggage' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Station 4', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Station 5', role: 'baggage' },
    ],
    notes: [
      'Black Square Commander 114 family (114 / 114TC) — same 5-station cargo layout',
      'One Skyline Market SKU; either NA or TC matches the purchased airframe',
      'liveSources: classic fuel tanks + classic stations/weights',
      'SimBrief has no AC11 — dispatch uses Default C182 as performance proxy',
    ],
  },
  {
    id: 'blacksquare-b36tp-bonanza-professional',
    icao: 'B36T',
    titlePattern: /Black Square B36TP Bonanza Professional/i,
    familyPackRel: 'blacksquare-b36tp-bonanza-professional.json',
    marketTypeId: 'blacksquare-b36tp-bonanza-professional',
    marketLabel: 'Beechcraft Bonanza B36TP',
    stationRoles: {
      passengerStations: [],
      baggageStations: [3, 4, 5, 6, 7],
      crewStations: [1, 2],
    },
    liveSources: CLASSIC_LIGHT_LIVE_SOURCES,
    loadMethod: 'direct-injection',
    injectCapable: true,
    simbriefIcao: 'B36T',
    simbriefAirframeMatch: 'Default',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Pilot', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Copilot', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Front pax left (cargo)', role: 'baggage' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Front pax right (cargo)', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Rear pax left (cargo)', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Rear pax right (cargo)', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Baggage', role: 'baggage' },
    ],
    notes: [
      'Black Square Bonanza B36TP (PT6) — separate Market SKU from piston A36/A36TC',
      'Same 7-station layout as piston Bonanza; Jet-A tanks / light_turboprop class',
      'liveSources: classic fuel tanks + classic stations/weights',
      'SimBrief: Default B36T',
    ],
  },
  {
    id: 'blacksquare-bonanza-professional',
    icao: 'BE36',
    titlePattern: /Black Square A36(?:TC)? Bonanza Professional/i,
    familyPackRel: 'blacksquare-bonanza-professional.json',
    marketTypeId: 'blacksquare-bonanza-professional',
    marketLabel: 'Beechcraft Bonanza BE36',
    stationRoles: {
      passengerStations: [],
      // Front/rear pax + aft baggage — career cargo (pax=0).
      baggageStations: [3, 4, 5, 6, 7],
      crewStations: [1, 2],
    },
    liveSources: CLASSIC_LIGHT_LIVE_SOURCES,
    loadMethod: 'direct-injection',
    injectCapable: true,
    simbriefIcao: 'BE36',
    simbriefAirframeMatch: 'Default',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Pilot', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Copilot', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Front pax left (cargo)', role: 'baggage' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Front pax right (cargo)', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Rear pax left (cargo)', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Rear pax right (cargo)', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Baggage', role: 'baggage' },
    ],
    notes: [
      'Black Square Bonanza Professional piston family (A36 / A36TC)',
      'Same 7-station layout; fuel capacities differ per variant profile',
      'B36TP is a separate light_turboprop Market SKU',
      'liveSources: classic fuel tanks + classic stations/weights',
      'SimBrief: Default BE36',
    ],
  },
  {
    id: 'blacksquare-turbine-duke',
    icao: 'B60T',
    titlePattern: /Black Square (?:B60T )?Turbine Duke/i,
    familyPackRel: 'blacksquare-turbine-duke.json',
    marketTypeId: 'blacksquare-turbine-duke',
    marketLabel: 'Beechcraft Turbine Duke',
    stationRoles: {
      passengerStations: [],
      baggageStations: [1, 4, 5, 6, 7, 8],
      crewStations: [2, 3],
    },
    liveSources: CLASSIC_LIGHT_LIVE_SOURCES,
    loadMethod: 'direct-injection',
    injectCapable: true,
    simbriefIcao: 'B60T',
    simbriefAirframeMatch: 'Default',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Forward baggage', role: 'baggage' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Pilot', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Copilot', role: 'crew' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Front pax left (cargo)', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Front pax right (cargo)', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Rear pax left (cargo)', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Rear pax right (cargo)', role: 'baggage' },
      { simVarIndex: 8, cfgIndex: 7, name: 'Rear baggage', role: 'baggage' },
    ],
    notes: [
      'Black Square Turbine Duke (PT6) — separate Market SKU from piston B60/Grand',
      'Same 8-station layout as piston Duke; Jet-A / light_turboprop class',
      'liveSources: classic fuel tanks + classic stations/weights',
      'SimBrief: Default B60T',
    ],
  },
  {
    id: 'blacksquare-b60-duke',
    icao: 'BE60',
    titlePattern: /Black Square (B60|Grand) Duke/i,
    familyPackRel: 'blacksquare-b60-duke.json',
    marketTypeId: 'blacksquare-b60-duke',
    marketLabel: 'Beechcraft Duke BE60',
    stationRoles: {
      passengerStations: [],
      // 1 forward bag + cabin + rear bag — career cargo (pax=0). Crew is 2–3.
      baggageStations: [1, 4, 5, 6, 7, 8],
      crewStations: [2, 3],
    },
    liveSources: CLASSIC_LIGHT_LIVE_SOURCES,
    loadMethod: 'direct-injection',
    injectCapable: true,
    simbriefIcao: 'BE60',
    simbriefAirframeMatch: 'Default',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Forward baggage', role: 'baggage' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Pilot', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Copilot', role: 'crew' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Front pax left (cargo)', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Front pax right (cargo)', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Rear pax left (cargo)', role: 'baggage' },
      { simVarIndex: 7, cfgIndex: 6, name: 'Rear pax right (cargo)', role: 'baggage' },
      { simVarIndex: 8, cfgIndex: 7, name: 'Rear baggage', role: 'baggage' },
    ],
    notes: [
      'Black Square Duke piston family (B60 / Grand)',
      'Same 8-station layout: 1 forward bag, 2–3 crew, 4–7 cabin as baggage, 8 rear bag',
      'Turbine Duke is a separate light_turboprop Market SKU',
      'Fuel capacities differ per variant profile (classic LEFT/RIGHT MAIN)',
      'liveSources: classic fuel tanks + classic stations/weights',
      'SimBrief: Default BE60',
    ],
  },
  {
    id: 'asobo-c172sp-cargo',
    icao: 'C172',
    // Classic / G1000 / IFD · Cargo + Passengers share stations / SimBrief Default.
    titlePattern: /C172SP (?:Classic|G1000|IFD) (?:Cargo|Passengers)/i,
    familyPackRel: 'asobo-c172sp-cargo.json',
    marketLabel: 'Cessna 172SP',
    stationRoles: {
      passengerStations: [],
      baggageStations: [3, 4, 5, 6],
      crewStations: [1, 2],
    },
    liveSources: CLASSIC_LIGHT_LIVE_SOURCES,
    loadMethod: 'direct-injection',
    injectCapable: true,
    simbriefIcao: 'C172',
    simbriefAirframeMatch: 'Default',
    stationMap: [
      { simVarIndex: 1, cfgIndex: 0, name: 'Station 1', role: 'crew' },
      { simVarIndex: 2, cfgIndex: 1, name: 'Station 2', role: 'crew' },
      { simVarIndex: 3, cfgIndex: 2, name: 'Station 3', role: 'baggage' },
      { simVarIndex: 4, cfgIndex: 3, name: 'Station 4', role: 'baggage' },
      { simVarIndex: 5, cfgIndex: 4, name: 'Station 5', role: 'baggage' },
      { simVarIndex: 6, cfgIndex: 5, name: 'Station 6', role: 'baggage' },
    ],
    notes: [
      'Asobo C172SP family (Classic / G1000 / IFD · Cargo + Passengers) — same 6-station layout',
      'One Skyline Market SKU; any glass/cabin matches the purchased airframe',
      'liveSources: classic fuel tanks + classic stations/weights',
      'SimBrief: Default C172',
    ],
  },
];

export function slugFromAircraftTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function matchHeuristic(title: string): ScaffoldHeuristic | undefined {
  return OFP_ROLE_HEURISTICS.find((h) => h.titlePattern.test(title));
}

export function buildRolesPackFromHeuristic(
  title: string,
  heuristic: ScaffoldHeuristic,
): OfpRolesPackFile {
  return {
    source: 'simbrief',
    icao: heuristic.icao,
    ofpId: `${heuristic.id}-${slugFromAircraftTitle(title)}`,
    matchTitles: [title],
    matchTitlePattern: heuristic.titlePattern.source,
    notes: [
      ...heuristic.notes,
      `Scaffolded from live title: ${title}`,
      'Checklist: profiles/notes/ofp-homologation.md — still run compare-ofp after SimBrief load',
    ],
    fuel: { unit: 'kg' },
    loadSheet: { unit: 'kg' },
    payload: {
      unit: 'kg',
      stationRoles: heuristic.stationRoles,
    },
    liveSources: heuristic.liveSources,
    loadMethod: heuristic.loadMethod ?? 'native-simbrief',
    injectCapable: heuristic.injectCapable ?? false,
    simbriefIcao: heuristic.simbriefIcao,
    simbriefAirframeMatch: heuristic.simbriefAirframeMatch,
    stationMap: heuristic.stationMap,
    tolerances: {
      fuelAbsLb: 200,
      fuelPct: 0.02,
      payloadAbsLb: 150,
      weightAbsLb: 300,
      passengerCountAbs: 2,
      maxFuelIncreaseLb: 0,
    },
  };
}

export function packMatchesTitle(pack: OfpRolesPackFile, title: string): boolean {
  if (pack.matchTitles?.some((t) => t.toLowerCase() === title.toLowerCase())) {
    return true;
  }
  if (pack.matchTitlePattern) {
    try {
      return new RegExp(pack.matchTitlePattern, 'i').test(title);
    } catch {
      return false;
    }
  }
  return false;
}

export async function loadRolesPackFile(path: string): Promise<OfpRolesPackFile> {
  const raw = await readFile(resolve(path), 'utf8');
  return JSON.parse(raw) as OfpRolesPackFile;
}

/**
 * Find a roles pack under profiles/ofp for this MSFS title.
 * Prefer exact matchTitles, then matchTitlePattern, then built-in heuristics' family pack.
 */
export async function resolveRolesPackForTitle(
  title: string,
  ofpProfilesDir: string,
): Promise<{ path: string; pack: OfpRolesPackFile; via: string } | undefined> {
  let names: string[];
  try {
    names = (await readdir(ofpProfilesDir)).filter(
      (n) => n.endsWith('.json') && !n.startsWith('_') && !n.includes('template'),
    );
  } catch {
    return undefined;
  }

  const loaded: Array<{ path: string; pack: OfpRolesPackFile }> = [];
  for (const name of names) {
    const path = join(ofpProfilesDir, name);
    try {
      loaded.push({ path, pack: await loadRolesPackFile(path) });
    } catch {
      // skip bad json
    }
  }

  const exact = loaded.find((x) =>
    x.pack.matchTitles?.some((t) => t.toLowerCase() === title.toLowerCase()),
  );
  if (exact) {
    return { ...exact, via: `matchTitles (${basename(exact.path)})` };
  }

  const pattern = loaded.find(
    (x) =>
      x.pack.matchTitlePattern &&
      (() => {
        try {
          return new RegExp(x.pack.matchTitlePattern!, 'i').test(title);
        } catch {
          return false;
        }
      })(),
  );
  if (pattern) {
    return { ...pattern, via: `matchTitlePattern (${basename(pattern.path)})` };
  }

  const heuristic = matchHeuristic(title);
  if (heuristic?.familyPackRel) {
    const path = join(ofpProfilesDir, heuristic.familyPackRel);
    try {
      const pack = await loadRolesPackFile(path);
      return { path, pack, via: `heuristic ${heuristic.id}` };
    } catch {
      // family pack missing — fall through
    }
  }

  return undefined;
}

export async function writeRolesPack(
  outPath: string,
  pack: OfpRolesPackFile,
): Promise<void> {
  await mkdir(resolve(outPath, '..'), { recursive: true });
  await writeFile(resolve(outPath), `${JSON.stringify(pack, null, 2)}\n`, 'utf8');
}
