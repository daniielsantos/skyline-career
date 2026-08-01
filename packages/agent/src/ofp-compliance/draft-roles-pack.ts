/**
 * Build / upsert Career OFP roles packs from a homologated aircraft profile.
 * Called after homologate promote so packs are not hand-written.
 */
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { AircraftProfile } from '@msfs-compat/shared';
import type { OfpLiveSources, OfpLoadMethod, OfpStationRoleMap } from '@msfs-compat/shared';
import {
  matchHeuristic,
  slugFromAircraftTitle,
  writeRolesPack,
  type OfpRolesPackFile,
} from './scaffold-roles.js';

export type DraftRolesPackOptions = {
  loadMethod?: OfpLoadMethod;
  injectCapable?: boolean;
  /**
   * Career freighter path: map non-crew cabin seats as baggage (pax=0).
   * Default true for direct-injection.
   */
  cabinAsBaggage?: boolean;
  /** Regex / substring for SimBrief airframe_comments. Default "Default". */
  simbriefAirframeMatch?: string;
  unit?: 'lb' | 'kg';
  /**
   * Join an existing Market family: merge matchTitles into this pack under ofpDir
   * and stamp ofpId / label notes from the family SKU.
   */
  familyPackRel?: string;
  familyOfpId?: string;
  marketLabel?: string;
};

const CREW_RE = /\b(pilot|co-?pilot|crew|captain|instructor|fo)\b/i;
const BAGGAGE_RE = /\b(bag|baggage|cargo|pod|hold|freight|luggage|belly)\b/i;
const PAX_RE = /\b(pax|pass(enger)?|seat|cabin|row|zone)\b/i;

function stationLabel(station: { index: number; name?: string }): string {
  return (station.name ?? `Station ${station.index}`).trim();
}

/**
 * Classify payload stations for OFP / Career inject.
 * Name heuristics first; GA fallback = stations 1–2 crew when unlabeled.
 */
export function inferStationRolesFromProfile(
  profile: AircraftProfile,
  opts: { cabinAsBaggage?: boolean } = {},
): { stationRoles: OfpStationRoleMap; stationMap: NonNullable<OfpRolesPackFile['stationMap']> } {
  const cabinAsBaggage = opts.cabinAsBaggage ?? true;
  const stations = [...profile.payload.stations].sort((a, b) => a.index - b.index);
  const crewStations: number[] = [];
  const baggageStations: number[] = [];
  const passengerStations: number[] = [];
  const unknown: number[] = [];

  for (const s of stations) {
    const label = stationLabel(s);
    if (CREW_RE.test(label)) crewStations.push(s.index);
    else if (BAGGAGE_RE.test(label)) baggageStations.push(s.index);
    else if (PAX_RE.test(label)) {
      if (cabinAsBaggage) baggageStations.push(s.index);
      else passengerStations.push(s.index);
    } else unknown.push(s.index);
  }

  if (crewStations.length === 0 && stations.length >= 2) {
    // Unlabeled GA / Black Square drafts ("Station 1"…): assume first two are crew.
    crewStations.push(stations[0]!.index, stations[1]!.index);
    for (const idx of [stations[0]!.index, stations[1]!.index]) {
      const u = unknown.indexOf(idx);
      if (u >= 0) unknown.splice(u, 1);
    }
  } else if (crewStations.length === 0 && stations.length === 1) {
    crewStations.push(stations[0]!.index);
    unknown.length = 0;
  }

  for (const idx of unknown) {
    if (cabinAsBaggage) baggageStations.push(idx);
    else passengerStations.push(idx);
  }

  const roleOf = (index: number): string => {
    if (crewStations.includes(index)) return 'crew';
    if (baggageStations.includes(index)) return 'baggage';
    if (passengerStations.includes(index)) return 'passenger';
    return 'unknown';
  };

  const stationMap = stations.map((s) => ({
    simVarIndex: s.index,
    cfgIndex: s.index - 1,
    name: stationLabel(s),
    role: roleOf(s.index),
  }));

  return {
    stationRoles: {
      crewStations: [...new Set(crewStations)].sort((a, b) => a - b),
      baggageStations: [...new Set(baggageStations)].sort((a, b) => a - b),
      passengerStations: [...new Set(passengerStations)].sort((a, b) => a - b),
    },
    stationMap,
  };
}

export function inferLiveSourcesFromProfile(profile: AircraftProfile): OfpLiveSources {
  const strategy = profile.fuel.strategy;
  if (strategy === 'lvar-bridge' || strategy === 'hybrid-sync' || strategy === 'vendor-specific') {
    return {
      fuel: ['mass-balance', 'classic'],
      weights: ['classic-weights'],
      payload: ['classic-stations'],
    };
  }
  return {
    fuel: ['classic'],
    weights: ['classic-weights'],
    payload: ['classic-stations'],
  };
}

export function buildRolesPackFromProfile(
  profile: AircraftProfile,
  opts: DraftRolesPackOptions = {},
): OfpRolesPackFile {
  const loadMethod = opts.loadMethod ?? 'direct-injection';
  const injectCapable =
    opts.injectCapable ?? loadMethod === 'direct-injection';
  const cabinAsBaggage =
    opts.cabinAsBaggage ?? loadMethod === 'direct-injection';
  const unit = opts.unit ?? 'lb';
  const title = profile.match.title?.trim() || profile.displayName || profile.profileId;
  const icao = (profile.match.icao ?? 'ZZZZ').toUpperCase();
  const { stationRoles, stationMap } = inferStationRolesFromProfile(profile, {
    cabinAsBaggage,
  });
  const ofpId = profile.profileId || slugFromAircraftTitle(title);

  return {
    source: 'simbrief',
    icao,
    ofpId,
    loadMethod,
    injectCapable,
    matchTitles: [title],
    matchTitlePattern: escapeRegExp(title),
    notes: [
      `${title} — auto roles pack from homologated profile`,
      `Profile: ${profile.profileKey}@${profile.semver}`,
      `loadMethod: ${loadMethod}; injectCapable: ${injectCapable}`,
      cabinAsBaggage
        ? 'Cabin seats mapped as baggage (career cargo / pax=0)'
        : 'Cabin seats mapped as passengers',
      `Fuel strategy: ${profile.fuel.strategy}`,
    ],
    fuel: { unit },
    loadSheet: { unit },
    payload: {
      unit,
      stationRoles,
    },
    liveSources: inferLiveSourcesFromProfile(profile),
    simbriefIcao: icao,
    simbriefAirframeMatch: opts.simbriefAirframeMatch ?? 'Default',
    stationMap,
    tolerances: {
      fuelAbsLb: 50,
      fuelPct: 0.03,
      payloadAbsLb: 75,
      weightAbsLb: 150,
      passengerCountAbs: 0,
      maxFuelIncreaseLb: 0,
    },
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function rolesPackPathForProfile(
  profile: AircraftProfile,
  ofpDir: string,
  opts: Pick<DraftRolesPackOptions, 'familyPackRel'> = {},
): { path: string; via: 'family' | 'profile' | 'family-join' } {
  if (opts.familyPackRel?.trim()) {
    return {
      path: join(ofpDir, opts.familyPackRel.trim().replace(/^.*\//, '')),
      via: 'family-join',
    };
  }
  const title =
    profile.match.title?.trim() || profile.displayName || profile.profileId;
  const heuristic = matchHeuristic(title);
  if (heuristic?.familyPackRel) {
    return { path: join(ofpDir, heuristic.familyPackRel), via: 'family' };
  }
  const stem = profile.profileId || slugFromAircraftTitle(title);
  return { path: join(ofpDir, `${stem}.json`), via: 'profile' };
}

/**
 * Write a new pack or merge matchTitles / notes into an existing family or profile pack.
 */
export async function upsertRolesPackFromProfile(
  profile: AircraftProfile,
  ofpDir: string,
  opts: DraftRolesPackOptions = {},
): Promise<{ path: string; pack: OfpRolesPackFile; created: boolean; via: string }> {
  const target = rolesPackPathForProfile(profile, ofpDir, opts);
  const title =
    profile.match.title?.trim() || profile.displayName || profile.profileId;
  const heuristic = matchHeuristic(title);
  let pack = buildRolesPackFromProfile(profile, opts);

  if (heuristic) {
    pack = {
      ...pack,
      ofpId: heuristic.id,
      icao: heuristic.icao,
      matchTitlePattern: heuristic.titlePattern.source,
      payload: {
        ...pack.payload,
        unit: pack.payload?.unit ?? opts.unit ?? 'lb',
        stationRoles: heuristic.stationRoles,
      },
      liveSources: heuristic.liveSources,
      loadMethod: opts.loadMethod ?? heuristic.loadMethod ?? pack.loadMethod,
      injectCapable:
        opts.injectCapable ?? heuristic.injectCapable ?? pack.injectCapable,
      simbriefIcao: heuristic.simbriefIcao ?? pack.simbriefIcao,
      simbriefAirframeMatch:
        opts.simbriefAirframeMatch ??
        heuristic.simbriefAirframeMatch ??
        pack.simbriefAirframeMatch,
      stationMap: heuristic.stationMap,
      notes: [
        ...heuristic.notes,
        `Homologated profile: ${profile.profileKey}@${profile.semver}`,
        `Title: ${title}`,
      ],
    };
  }

  if (opts.familyOfpId?.trim()) {
    pack = {
      ...pack,
      ofpId: opts.familyOfpId.trim(),
      notes: [
        ...(pack.notes ?? []),
        opts.marketLabel
          ? `Joined Market family: ${opts.marketLabel} (${opts.familyOfpId.trim()})`
          : `Joined Market family ofpId=${opts.familyOfpId.trim()}`,
        `Homologated profile: ${profile.profileKey}@${profile.semver}`,
        `Title: ${title}`,
      ],
    };
  }

  let created = true;
  try {
    const prev = JSON.parse(await readFile(resolve(target.path), 'utf8')) as OfpRolesPackFile;
    created = false;
    const titles = [
      ...new Set([...(prev.matchTitles ?? []), ...(pack.matchTitles ?? [])]),
    ];
    // Keep the family's ofpId / station map when joining an existing pack.
    pack = {
      ...prev,
      ...pack,
      ofpId: opts.familyOfpId?.trim() || prev.ofpId || pack.ofpId,
      matchTitles: titles,
      notes: [...new Set([...(prev.notes ?? []), ...(pack.notes ?? [])])],
      payload: pack.payload ?? prev.payload,
      stationMap:
        target.via === 'family-join' && (prev.stationMap?.length ?? 0) > 0
          ? prev.stationMap
          : pack.stationMap,
      liveSources: pack.liveSources ?? prev.liveSources,
      loadMethod: pack.loadMethod ?? prev.loadMethod,
      injectCapable: pack.injectCapable ?? prev.injectCapable,
      matchTitlePattern: prev.matchTitlePattern ?? pack.matchTitlePattern,
    };
  } catch {
    // new file
  }

  await writeRolesPack(target.path, pack);
  const via =
    target.via === 'family-join'
      ? `family-join (${opts.familyOfpId ?? basename(target.path)})`
      : target.via === 'family'
        ? `family (${heuristic?.id})`
        : 'profile pack';
  return {
    path: target.path,
    pack,
    created,
    via,
  };
}

function basename(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() ?? path;
}
