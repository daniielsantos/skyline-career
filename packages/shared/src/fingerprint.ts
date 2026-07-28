import { createHash } from 'node:crypto';
import type { AircraftIdentity, AircraftStructure, FingerprintInput } from './types/aircraft-profile.js';

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

function semverMajor(version?: string): string {
  if (!version) return '0';
  const match = version.match(/^(\d+)/);
  return match?.[1] ?? '0';
}

function hashStructure(structure: AircraftStructure): string {
  // Weight limits intentionally excluded — they vary by load state / availability
  // and would break catalog seed vs live fingerprint matching.
  const payload = JSON.stringify({
    tanks: structure.tankSchema.map((t) => ({
      index: t.index,
      capacity: t.capacity,
      unit: t.unit ?? 'gallons',
    })),
    stations: structure.stationSchema.map((s) => ({
      index: s.index,
      maxLoad: s.maxLoad,
      arm: s.arm ?? 0,
    })),
  });

  return createHash('sha256').update(payload).digest('hex');
}

export function computeFingerprintV2(input: FingerprintInput): {
  fingerprint: string;
  structuralHash: string;
} {
  const { identity, structure } = input;
  const structuralHash = hashStructure(structure);

  const canonical = [
    normalize(identity.publisher),
    normalize(identity.title),
    normalize(identity.baseContainer ?? identity.packageName ?? ''),
    semverMajor(identity.packageVersion),
    structuralHash,
  ].join('|');

  const fingerprint = createHash('sha256').update(canonical).digest('hex');

  return { fingerprint, structuralHash };
}

export function buildFingerprintRequest(
  clientId: string,
  simVersion: string,
  identity: AircraftIdentity,
  structure: AircraftStructure,
) {
  const { fingerprint } = computeFingerprintV2({ identity, structure });

  return {
    clientId,
    simVersion,
    identity,
    structure,
    fingerprint,
  };
}
