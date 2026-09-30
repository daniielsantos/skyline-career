/**
 * Move the touchdown marker from the aircraft datum to the main-gear contact.
 * The arm comes from that airframe's flight_model.cfg contact points. There
 * is no live SimVar for wheel position, and an empty-CG or class guess is
 * not the tire — when the cfg is missing the datum is left alone.
 */
import { readFile } from 'node:fs/promises';
import {
  parseMainGearStationFt,
  placeMainGearContact,
  type MainGearStationFt,
} from '@msfs-compat/shared';
import type { NamedPipeSimBridge } from '../../agent/src/named-pipe-sim-bridge.ts';
import {
  defaultProfileDirs,
  loadProfilesFromDirs,
  type LoadedProfile,
} from '../../agent/src/profile-registry.ts';
import { resolveProfile } from '../../agent/src/profile-resolver.ts';
import { getRepoRoot } from './skyline-paths.ts';

let catalogPromise: Promise<LoadedProfile[] | null> | null = null;
const stationByTitle = new Map<string, MainGearStationFt | null>();

function loadCatalog(): Promise<LoadedProfile[] | null> {
  if (!catalogPromise) {
    catalogPromise = loadProfilesFromDirs(defaultProfileDirs(getRepoRoot())).catch(
      () => null,
    );
  }
  return catalogPromise;
}

async function stationForTitle(
  title: string,
  icao?: string,
  atcModel?: string,
): Promise<MainGearStationFt | null> {
  const key = title.trim().toLowerCase();
  if (!key) return null;
  const cached = stationByTitle.get(key);
  if (cached !== undefined) return cached;
  const catalog = await loadCatalog();
  if (!catalog) {
    stationByTitle.set(key, null);
    return null;
  }
  const resolved = resolveProfile({ title, icao, atcModel }, catalog);
  const trusted =
    resolved.matched &&
    resolved.profile != null &&
    (resolved.reason === 'exact_fingerprint' ||
      resolved.reason === 'exact_title' ||
      resolved.reason === 'title_alias');
  const cfgPath = trusted
    ? resolved.profile?.cg?.calibration?.cfgPath?.trim()
    : undefined;
  if (!cfgPath) {
    stationByTitle.set(key, null);
    return null;
  }
  try {
    const text = await readFile(cfgPath, 'utf8');
    const station = parseMainGearStationFt(text) ?? null;
    stationByTitle.set(key, station);
    return station;
  } catch {
    stationByTitle.set(key, null);
    return null;
  }
}

/**
 * Shift a datum lat/lon aft to the main gear. Returns the original point
 * when the aircraft cfg does not publish a contact-point station.
 */
export async function shiftDatumToMainGear(
  bridge: NamedPipeSimBridge,
  point: { lat: number; lon: number },
  headingTrueDeg: number | undefined,
  pitchDeg: number | undefined,
): Promise<{ lat: number; lon: number; aftM?: number }> {
  if (typeof headingTrueDeg !== 'number' || !Number.isFinite(headingTrueDeg)) {
    return point;
  }
  try {
    const id = await bridge.getAircraftIdentity();
    const title = id.title?.trim();
    if (!title) return point;
    const station = await stationForTitle(title, id.icao, id.atcModel);
    if (!station) return point;
    const placed = placeMainGearContact(
      point.lat,
      point.lon,
      headingTrueDeg,
      station,
      pitchDeg,
    );
    if (!placed) return point;
    return { lat: placed.lat, lon: placed.lon, aftM: placed.aftM };
  } catch {
    return point;
  }
}
