import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { OfpStationRoleMap } from '@msfs-compat/shared';

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
  stationMap?: unknown[];
  tolerances?: Record<string, number>;
}

export interface ScaffoldHeuristic {
  id: string;
  icao: string;
  /** Match live aircraft title. */
  titlePattern: RegExp;
  stationRoles: OfpStationRoleMap;
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
