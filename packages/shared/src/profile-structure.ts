import type {
  AircraftIdentity,
  AircraftProfile,
  AircraftStructure,
} from './types/aircraft-profile.js';
import { computeFingerprintV2 } from './fingerprint.js';

function tankIndexFromVar(varName: string | undefined, fallback: number): number {
  if (!varName) return fallback;
  const match = varName.match(/:(\d+)\s*$/);
  if (match) {
    return Number(match[1]);
  }
  return fallback;
}

/**
 * Derive AircraftStructure from a profile document (catalog seed / backfill).
 * Weight limits are omitted so fingerprints stay stable across live vs catalog.
 */
export function structureFromProfile(profile: AircraftProfile): AircraftStructure {
  const tankSchema = profile.fuel.tanks.map((tank, i) => ({
    index: tankIndexFromVar(tank.writeVar ?? tank.readVar, i + 1),
    name: tank.name,
    capacity: tank.capacity ?? 0,
    unit: (profile.fuel.unit ?? 'gallons') as 'gallons' | 'pounds' | 'liters' | 'kilograms',
  }));

  const stationSchema = profile.payload.stations.map((station) => ({
    index: station.index,
    name: station.name,
    maxLoad: station.maxLoad,
    arm: station.arm,
  }));

  return {
    tankSchema,
    stationSchema,
    weightLimits: {},
  };
}

export function identityFromProfile(profile: AircraftProfile): AircraftIdentity {
  return {
    title: profile.match.title ?? profile.displayName ?? profile.profileId,
    publisher: profile.match.publisher ?? 'asobo',
    icao: profile.match.icao,
  };
}

export function fingerprintFromProfile(profile: AircraftProfile): {
  fingerprint: string;
  structuralHash: string;
} {
  return computeFingerprintV2({
    identity: identityFromProfile(profile),
    structure: structureFromProfile(profile),
  });
}

export function isPlaceholderFingerprint(value: string | undefined): boolean {
  if (!value || value.length !== 64) return true;
  return /^0+$/.test(value);
}
