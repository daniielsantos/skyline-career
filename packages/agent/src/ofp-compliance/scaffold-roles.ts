import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { OfpLiveSources, OfpStationRoleMap } from '@msfs-compat/shared';

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
  fuel?: { unit?: string };
  loadSheet?: Record<string, unknown>;
  payload?: {
    unit?: string;
    total?: number;
    stationRoles?: OfpStationRoleMap;
  };
  /** Declared live read path — reader skips undeclared vendor probes. */
  liveSources?: OfpLiveSources;
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
  stationMap: Array<{
    simVarIndex: number;
    cfgIndex: number;
    name: string;
    role: string;
  }>;
  notes: string[];
  /** Family pack path relative to profiles/ofp (preferred over per-livery files). */
  familyPackRel?: string;
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

/** Known families where station roles are stable across liveries/cabin options. */
export const OFP_ROLE_HEURISTICS: ScaffoldHeuristic[] = [
  {
    id: 'pmdg-738-pax',
    icao: 'B738',
    titlePattern: /737-800\s+PAX/i,
    familyPackRel: 'pmdg-738-pax.json',
    stationRoles: {
      passengerStations: [1, 2, 3, 4],
      baggageStations: [5, 6],
      crewStations: [7, 8, 9],
      serviceStations: [10, 11],
      averagePassengerWeight: 86.18,
    },
    liveSources: PMDG_738_LIVE_SOURCES,
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
      'PMDG 737-800 PAX family (SSW TC, BW TC, …) — same station_load layout',
      'SimConnect PAYLOAD STATION WEIGHT:n is 1-based (station_load.0 → :1)',
      'After EFB Load from Simbrief, classic cargo may inflate — use L:ZFW_Lvar / L:GW_Lvar',
      'liveSources: NG3 fuel + PMDG EFB LVars (no TFDi / mass-balance probe)',
    ],
  },
  {
    id: 'pmdg-738-bcf',
    icao: 'B738',
    // 737-800BCF SSW / 737-800BCF BW (no space before BCF in MSFS title)
    titlePattern: /737-800BCF/i,
    familyPackRel: 'pmdg-738-bcf.json',
    stationRoles: {
      // cfg still names PaxZone1..4 but BCF uses them as main-deck cargo.
      passengerStations: [],
      baggageStations: [1, 2, 3, 4, 5, 6],
      crewStations: [7, 8, 9],
      serviceStations: [10, 11],
    },
    liveSources: PMDG_738_LIVE_SOURCES,
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
      'SimBrief: use PMDG Boeing Converted Freighter airframe — payload is cargo, not pax',
      'Zones 1–4 are main-deck cargo despite PaxZone names in flight_model.cfg',
      'Live cargo via EFB L:ZFW_Lvar residual (classic stations may inflate)',
      'liveSources: NG3 fuel + PMDG EFB LVars',
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
