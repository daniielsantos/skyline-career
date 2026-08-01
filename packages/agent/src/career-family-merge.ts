/**
 * Detect existing Career Market SKUs that can absorb a newly homologated
 * airframe (same SimBrief ICAO + economic class), then classify whether the
 * station layout is compatible for a single OFP pack merge.
 */
import type { AircraftProfile, FreighterClassId } from '@msfs-compat/shared';
import type { CareerPlayerAirframe } from '@msfs-compat/shared';
import type { OfpRolesPackFile } from './ofp-compliance/scaffold-roles.js';
import { inferStationRolesFromProfile } from './ofp-compliance/draft-roles-pack.js';

export type StationLayoutCompatibility =
  | 'identical'
  | 'same-indexes'
  | 'different-stations';

export type StationLayoutSignature = {
  indexes: number[];
  /** Stable "index:role" pairs when roles are known. */
  rolesKey: string;
};

export type MarketFamilyCandidate = {
  typeId: string;
  label: string;
  aircraftClassId: FreighterClassId;
  simbriefIcao: string;
  rolesPackRelPath: string;
  compatibility: StationLayoutCompatibility;
};

function normalizeIcao(icao: string | null | undefined): string {
  return (icao ?? '').trim().toUpperCase();
}

export function stationLayoutFromIndexes(
  indexes: number[],
  roles?: Record<number, string>,
): StationLayoutSignature {
  const sorted = [...new Set(indexes)].sort((a, b) => a - b);
  const rolesKey = sorted
    .map((index) => `${index}:${roles?.[index] ?? '?'}`)
    .join(',');
  return { indexes: sorted, rolesKey };
}

export function stationLayoutFromProfile(
  profile: AircraftProfile,
  opts: { cabinAsBaggage?: boolean } = {},
): StationLayoutSignature {
  const { stationRoles, stationMap } = inferStationRolesFromProfile(profile, opts);
  const roleByIndex: Record<number, string> = {};
  for (const row of stationMap) {
    const index = (row as { simVarIndex?: number }).simVarIndex;
    const role = (row as { role?: string }).role;
    if (typeof index === 'number' && role) roleByIndex[index] = role;
  }
  // Prefer inferred roles map when stationMap labels were generic.
  for (const index of stationRoles.crewStations ?? []) roleByIndex[index] = 'crew';
  for (const index of stationRoles.baggageStations ?? []) roleByIndex[index] = 'baggage';
  for (const index of stationRoles.passengerStations ?? []) {
    roleByIndex[index] = 'passenger';
  }
  return stationLayoutFromIndexes(
    profile.payload.stations.map((s) => s.index),
    roleByIndex,
  );
}

export function stationLayoutFromPack(
  pack: OfpRolesPackFile,
): StationLayoutSignature | undefined {
  const map = pack.stationMap ?? [];
  if (map.length === 0) return undefined;
  const roleByIndex: Record<number, string> = {};
  const indexes: number[] = [];
  for (const row of map) {
    const index = (row as { simVarIndex?: number }).simVarIndex;
    const role = (row as { role?: string }).role;
    if (typeof index !== 'number') continue;
    indexes.push(index);
    if (role) roleByIndex[index] = role;
  }
  if (indexes.length === 0) return undefined;
  return stationLayoutFromIndexes(indexes, roleByIndex);
}

export function compareStationLayouts(
  a: StationLayoutSignature,
  b: StationLayoutSignature,
): StationLayoutCompatibility {
  if (a.indexes.length !== b.indexes.length) return 'different-stations';
  if (a.indexes.some((index, i) => index !== b.indexes[i])) {
    return 'different-stations';
  }
  const aKnown = !a.rolesKey.includes(':?') && a.rolesKey.length > 0;
  const bKnown = !b.rolesKey.includes(':?') && b.rolesKey.length > 0;
  if (aKnown && bKnown && a.rolesKey === b.rolesKey) return 'identical';
  return 'same-indexes';
}

/**
 * Catalog rows that share SimBrief ICAO + economic class with the new profile.
 * Skips rows that already list the live title in their pack matchTitles.
 */
export function findMarketFamilyCandidates(opts: {
  icao: string;
  aircraftClassId: FreighterClassId;
  profileLayout: StationLayoutSignature;
  matchTitle?: string;
  catalog: readonly CareerPlayerAirframe[];
  packsByRelPath: ReadonlyMap<string, OfpRolesPackFile>;
}): MarketFamilyCandidate[] {
  const icao = normalizeIcao(opts.icao);
  if (!icao || icao === 'ZZZZ') return [];
  const titleNorm = (opts.matchTitle ?? '').trim().toLowerCase();
  const out: MarketFamilyCandidate[] = [];

  for (const row of opts.catalog) {
    if (row.aircraftClassId !== opts.aircraftClassId) continue;
    if (normalizeIcao(row.simbriefIcao) !== icao) continue;

    const pack = opts.packsByRelPath.get(row.rolesPackRelPath);
    if (pack && titleNorm) {
      const already = pack.matchTitles?.some(
        (t) => t.trim().toLowerCase() === titleNorm,
      );
      if (already) continue;
    }

    const packLayout = pack ? stationLayoutFromPack(pack) : undefined;
    const compatibility: StationLayoutCompatibility = packLayout
      ? compareStationLayouts(opts.profileLayout, packLayout)
      : 'same-indexes';

    out.push({
      typeId: row.typeId,
      label: row.label,
      aircraftClassId: row.aircraftClassId,
      simbriefIcao: row.simbriefIcao,
      rolesPackRelPath: row.rolesPackRelPath,
      compatibility,
    });
  }

  return out.sort((a, b) => {
    const rank = (c: StationLayoutCompatibility) =>
      c === 'identical' ? 0 : c === 'same-indexes' ? 1 : 2;
    return rank(a.compatibility) - rank(b.compatibility) || a.label.localeCompare(b.label);
  });
}
