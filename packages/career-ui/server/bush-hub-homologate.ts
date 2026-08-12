/**
 * Persist MSFS bush hub overrides under profiles/career and apply to world.
 * Coords come from SimConnect Facilities (preferred) or explicit lat/lon.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  applyMsfsBushHubOverrideToTerminal,
  filterMsfsBushHubOverridesToIcaos,
  isCareerHubIcao,
  listBushTripOnlyIcaos,
  listCareerHubIcaos,
  listMsfsBushHubOverrides,
  msfsFacilityMatchesCareerHub,
  pruneRuntimeMsfsBushHubOverrides,
  setRuntimeMsfsBushHubOverrides,
  SIMBRIEF_DISPATCH_DENY_ICAOS,
  upsertRuntimeMsfsBushHubOverride,
  type CareerEconomyWorld,
  type MsfsBushHubOverride,
  type MsfsBushHubOverrideSource,
  type MsfsBushHubOverridesFile,
} from '@msfs-compat/shared';
import { NamedPipeSimBridge } from '../../agent/src/named-pipe-sim-bridge.ts';
import { withSimBridgeExclusive } from './simbridge-gate.ts';

export function profileMsfsBushHubOverridesPath(careerDir: string): string {
  return join(careerDir, 'msfs-bush-hub-overrides.json');
}

export async function loadProfileMsfsBushHubOverrides(
  careerDir: string,
): Promise<MsfsBushHubOverridesFile> {
  const path = profileMsfsBushHubOverridesPath(careerDir);
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as unknown;
    setRuntimeMsfsBushHubOverrides(raw);
  } catch {
    setRuntimeMsfsBushHubOverrides({});
  }
  pruneRuntimeMsfsBushHubOverrides(catalogOverrideKeepIcaos());
  return listMsfsBushHubOverrides();
}

function catalogOverrideKeepIcaos(): string[] {
  const deny = new Set(
    SIMBRIEF_DISPATCH_DENY_ICAOS.map((icao) => icao.toUpperCase()),
  );
  return listCareerHubIcaos().filter((icao) => !deny.has(icao));
}

export async function persistProfileMsfsBushHubOverrides(
  careerDir: string,
): Promise<string> {
  const path = profileMsfsBushHubOverridesPath(careerDir);
  await mkdir(dirname(path), { recursive: true });
  const keep = catalogOverrideKeepIcaos();
  pruneRuntimeMsfsBushHubOverrides(keep);
  const payload = filterMsfsBushHubOverridesToIcaos(
    listMsfsBushHubOverrides(),
    keep,
  );
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return path;
}

export type HomologateBushHubInput = {
  icao: string;
  name?: string;
  lat?: number;
  lon?: number;
  source?: MsfsBushHubOverrideSource;
  /** ISO date YYYY-MM-DD; defaults to today UTC. */
  validatedAt?: string;
  runways?: MsfsBushHubOverride['runways'];
};

export type HomologateBushHubResult = {
  override: MsfsBushHubOverride;
  icao: string;
  path: string;
  airport: {
    icao: string;
    name: string;
    lat: number;
    lon: number;
  } | null;
};

export type AirportFacilitySample = {
  icao: string;
  name?: string;
  lat: number;
  lon: number;
  altMeters?: number;
  runways?: MsfsBushHubOverride['runways'];
};

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function isFiniteCoord(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function buildMsfsBushHubOverrideFromInput(
  input: HomologateBushHubInput,
): { icao: string; override: MsfsBushHubOverride } {
  const icao = input.icao.trim().toUpperCase();
  if (!icao) throw new Error('icao required');
  if (!isCareerHubIcao(icao)) {
    throw new Error(`${icao} is not a career hub`);
  }
  const lat = input.lat;
  const lon = input.lon;
  if (
    !isFiniteCoord(lat) ||
    !isFiniteCoord(lon) ||
    (lat === 0 && lon === 0)
  ) {
    throw new Error('lat/lon required (SimConnect Facilities or explicit coords)');
  }
  const existing = listMsfsBushHubOverrides()[icao];
  const name =
    (input.name?.trim() || existing?.name || icao).trim() || icao;
  const source: MsfsBushHubOverrideSource =
    input.source === 'parked_sample' ||
    input.source === 'msfs_panel' ||
    input.source === 'msfs_facility'
      ? input.source
      : 'msfs_facility';
  return {
    icao,
    override: {
      name,
      lat,
      lon,
      source,
      validatedAt: input.validatedAt?.trim() || todayUtc(),
      ...(input.runways?.length ? { runways: input.runways } : {}),
    },
  };
}

export async function homologateBushHub(
  careerDir: string,
  world: CareerEconomyWorld,
  input: HomologateBushHubInput,
): Promise<HomologateBushHubResult> {
  const { icao, override } = buildMsfsBushHubOverrideFromInput(input);
  upsertRuntimeMsfsBushHubOverride(icao, override);
  const path = await persistProfileMsfsBushHubOverrides(careerDir);
  const airport = world.airports.find((a) => a.icao.toUpperCase() === icao);
  if (airport) {
    applyMsfsBushHubOverrideToTerminal(airport, override);
  }
  return {
    icao,
    override,
    path,
    airport: airport
      ? {
          icao: airport.icao,
          name: airport.name,
          lat: airport.lat,
          lon: airport.lon,
        }
      : null,
  };
}

/** Look up one airport via SimConnect Facilities (sim online; any location). */
export async function fetchAirportFacility(
  icao: string,
  pipeName?: string,
): Promise<AirportFacilitySample> {
  const code = icao.trim().toUpperCase();
  if (!code) throw new Error('icao required');
  return withSimBridgeExclusive(async () => {
    const bridge = new NamedPipeSimBridge(pipeName ? { pipeName } : {});
    try {
      await bridge.open('MSFS Compat Bush Hub Homologate');
      const facility = await bridge.getAirportFacility(code);
      if (
        !isFiniteCoord(facility.lat) ||
        !isFiniteCoord(facility.lon) ||
        (facility.lat === 0 && facility.lon === 0)
      ) {
        throw new Error(`Facilities returned invalid coords for ${code}`);
      }
      return {
        icao: (facility.icao || code).trim().toUpperCase() || code,
        name: facility.name?.trim() || undefined,
        lat: facility.lat,
        lon: facility.lon,
        altMeters: facility.altMeters,
        runways: facility.runways?.length
          ? (facility.runways as MsfsBushHubOverride['runways'])
          : undefined,
      };
    } finally {
      await bridge.close({ disconnectHost: false });
    }
  });
}

/**
 * Resolve lat/lon for homologate: explicit body coords, else SimConnect Facilities.
 * Does not use Watch parked position.
 */
export async function resolveHomologateCoords(
  input: {
    icao: string;
    name?: string;
    lat?: number;
    lon?: number;
    source?: MsfsBushHubOverrideSource;
    pipeName?: string;
  },
  deps?: {
    fetchFacility?: (
      icao: string,
      pipeName?: string,
    ) => Promise<AirportFacilitySample>;
  },
): Promise<HomologateBushHubInput> {
  const icao = input.icao.trim().toUpperCase();
  if (isFiniteCoord(input.lat) && isFiniteCoord(input.lon)) {
    return {
      icao,
      name: input.name,
      lat: input.lat,
      lon: input.lon,
      source: input.source ?? 'msfs_panel',
    };
  }
  const fetchFacility = deps?.fetchFacility ?? fetchAirportFacility;
  const facility = await fetchFacility(icao, input.pipeName);
  const match = msfsFacilityMatchesCareerHub(icao, facility);
  if (!match.ok) {
    throw new Error(match.reason);
  }
  return {
    icao,
    name: input.name?.trim() || facility.name,
    lat: facility.lat,
    lon: facility.lon,
    source: 'msfs_facility',
    ...(facility.runways?.length ? { runways: facility.runways } : {}),
  };
}

export type HomologateBushHubBatchItem =
  | { icao: string; ok: true; result: HomologateBushHubResult }
  | { icao: string; ok: false; error: string };

export type HomologateBushHubBatchResult = {
  results: HomologateBushHubBatchItem[];
  okCount: number;
  failCount: number;
};

export async function homologateBushHubBatch(
  careerDir: string,
  opts: {
    icaos?: string[];
    /** All career hubs (BR/US/CA/MX). Default when no icaos list. */
    all?: boolean;
    /** Only bushTripOnly locals (subset of career hubs). */
    bushOnly?: boolean;
    pipeName?: string;
  },
  writeWorld: (
    fn: (w: CareerEconomyWorld) => Promise<HomologateBushHubResult>,
  ) => Promise<HomologateBushHubResult>,
): Promise<HomologateBushHubBatchResult> {
  const icaos = (
    opts.icaos?.length
      ? opts.icaos.map((c) => c.trim().toUpperCase()).filter(Boolean)
      : opts.bushOnly
        ? listBushTripOnlyIcaos()
        : listCareerHubIcaos()
  ).filter((icao, i, arr) => arr.indexOf(icao) === i);

  const results: HomologateBushHubBatchItem[] = [];
  for (const icao of icaos) {
    try {
      const resolved = await resolveHomologateCoords({
        icao,
        pipeName: opts.pipeName,
      });
      const result = await writeWorld((w) =>
        homologateBushHub(careerDir, w, resolved),
      );
      results.push({ icao, ok: true, result });
    } catch (error) {
      results.push({
        icao,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    results,
    okCount: results.filter((r) => r.ok).length,
    failCount: results.filter((r) => !r.ok).length,
  };
}
