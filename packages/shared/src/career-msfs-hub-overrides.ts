/**
 * MSFS-validated coords/names/runways for career hubs.
 * Shipped seed in data/msfs-bush-hub-overrides.json; runtime may layer profiles/career overlay.
 */

import shippedRaw from './data/msfs-bush-hub-overrides.json' with { type: 'json' };
import type { CareerRunway, RunwaySurface } from './career-runways.js';

export type MsfsBushHubOverrideSource =
  | 'msfs_panel'
  | 'parked_sample'
  | 'msfs_facility';

export type MsfsBushHubOverride = {
  name: string;
  lat: number;
  lon: number;
  source: MsfsBushHubOverrideSource;
  validatedAt: string;
  /** MSFS Facilities strips — when present, prefer over career-runways.json. */
  runways?: CareerRunway[];
};

export type MsfsBushHubOverridesFile = Record<string, MsfsBushHubOverride>;

const SURFACE_SET = new Set<RunwaySurface>([
  'asphalt',
  'concrete',
  'grass',
  'gravel',
  'dirt',
  'water',
  'other',
]);

const shipped = normalizeOverridesFile(shippedRaw);
const runtimeLayer: MsfsBushHubOverridesFile = {};

function isFiniteCoord(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function normalizeRunway(raw: unknown): CareerRunway | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.ident !== 'string' || !r.ident.trim()) return null;
  if (!isFiniteCoord(r.headingTrueDeg)) return null;
  if (!isFiniteCoord(r.lengthM) || r.lengthM < 5) return null;
  if (!isFiniteCoord(r.widthM) || r.widthM <= 0) return null;
  if (!isFiniteCoord(r.lat) || !isFiniteCoord(r.lon)) return null;
  if (r.lat === 0 && r.lon === 0) return null;
  const surface =
    typeof r.surface === 'string' && SURFACE_SET.has(r.surface as RunwaySurface)
      ? (r.surface as RunwaySurface)
      : undefined;
  const out: CareerRunway = {
    ident: r.ident.trim(),
    headingTrueDeg: r.headingTrueDeg,
    lengthM: r.lengthM,
    widthM: r.widthM,
    lat: r.lat,
    lon: r.lon,
  };
  if (typeof r.identReciprocal === 'string' && r.identReciprocal.trim()) {
    out.identReciprocal = r.identReciprocal.trim();
  }
  if (surface) out.surface = surface;
  if (typeof r.lighted === 'boolean') out.lighted = r.lighted;
  return out;
}

function normalizeRunways(raw: unknown): CareerRunway[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const rows = raw
    .map(normalizeRunway)
    .filter((r): r is CareerRunway => r != null);
  return rows.length > 0 ? rows : undefined;
}

function isOverride(row: unknown): row is MsfsBushHubOverride {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  if (
    typeof r.name !== 'string' ||
    !isFiniteCoord(r.lat) ||
    !isFiniteCoord(r.lon) ||
    !(
      r.source === 'msfs_panel' ||
      r.source === 'parked_sample' ||
      r.source === 'msfs_facility'
    ) ||
    typeof r.validatedAt !== 'string'
  ) {
    return false;
  }
  if (r.runways !== undefined && !Array.isArray(r.runways)) return false;
  return true;
}

export function normalizeOverridesFile(raw: unknown): MsfsBushHubOverridesFile {
  if (!raw || typeof raw !== 'object') return {};
  const out: MsfsBushHubOverridesFile = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const icao = key.trim().toUpperCase();
    if (!icao || !isOverride(value)) continue;
    const runways = normalizeRunways(
      (value as { runways?: unknown }).runways,
    );
    out[icao] = {
      name: value.name.trim() || icao,
      lat: value.lat,
      lon: value.lon,
      source: value.source,
      validatedAt: value.validatedAt,
      ...(runways ? { runways } : {}),
    };
  }
  return out;
}

/** Merge shipped + profiles overlay + in-memory runtime (later wins). */
export function mergeMsfsBushHubOverrides(
  ...layers: Array<MsfsBushHubOverridesFile | null | undefined>
): MsfsBushHubOverridesFile {
  const out: MsfsBushHubOverridesFile = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const [icao, row] of Object.entries(layer)) {
      out[icao.toUpperCase()] = row;
    }
  }
  return out;
}

export function getShippedMsfsBushHubOverrides(): MsfsBushHubOverridesFile {
  return { ...shipped };
}

export function getRuntimeMsfsBushHubOverrides(): MsfsBushHubOverridesFile {
  return { ...runtimeLayer };
}

/** Effective overrides: shipped ← runtime layer. */
export function listMsfsBushHubOverrides(): MsfsBushHubOverridesFile {
  return mergeMsfsBushHubOverrides(shipped, runtimeLayer);
}

export function lookupMsfsBushHubOverride(
  icao: string | null | undefined,
): MsfsBushHubOverride | undefined {
  if (!icao) return undefined;
  const code = icao.trim().toUpperCase();
  return runtimeLayer[code] ?? shipped[code];
}

/**
 * Load/replace the runtime overlay (e.g. from profiles/career JSON on server boot).
 * Does not mutate the shipped seed.
 */
export function setRuntimeMsfsBushHubOverrides(
  raw: unknown,
): MsfsBushHubOverridesFile {
  const next = normalizeOverridesFile(raw);
  for (const key of Object.keys(runtimeLayer)) delete runtimeLayer[key];
  Object.assign(runtimeLayer, next);
  return getRuntimeMsfsBushHubOverrides();
}

/** Upsert one ICAO into the runtime overlay (homologate API). */
export function upsertRuntimeMsfsBushHubOverride(
  icao: string,
  override: MsfsBushHubOverride,
): MsfsBushHubOverride {
  const code = icao.trim().toUpperCase();
  if (!code) throw new Error('icao required');
  if (!isOverride(override)) throw new Error('Invalid MSFS bush hub override');
  const runways = normalizeRunways(override.runways);
  const row: MsfsBushHubOverride = {
    name: override.name.trim() || code,
    lat: override.lat,
    lon: override.lon,
    source: override.source,
    validatedAt: override.validatedAt,
    ...(runways ? { runways } : {}),
  };
  runtimeLayer[code] = row;
  return row;
}

export function applyMsfsBushHubOverrideToTerminal(
  terminal: {
    icao: string;
    name: string;
    lat: number;
    lon: number;
  },
  override?: MsfsBushHubOverride | null,
): boolean {
  const row = override ?? lookupMsfsBushHubOverride(terminal.icao);
  if (!row) return false;
  let changed = false;
  if (terminal.name !== row.name) {
    terminal.name = row.name;
    changed = true;
  }
  if (
    Math.abs(terminal.lat - row.lat) > 1e-4 ||
    Math.abs(terminal.lon - row.lon) > 1e-4
  ) {
    terminal.lat = row.lat;
    terminal.lon = row.lon;
    changed = true;
  }
  return changed;
}
