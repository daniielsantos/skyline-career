/**
 * Wizard: stamp career hub lat/lon/name from MSFS SimConnect Facilities.
 * Requires MSFS running + SimBridgeHost rebuilt with getAirportFacility.
 * Writes profiles/career/msfs-bush-hub-overrides.json and updates local economy airports.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  applyMsfsBushHubOverrideToTerminal,
  CAREER_HUB_COORDS,
  isCareerHubIcao,
  listBushTripOnlyIcaos,
  listCareerHubIcaos,
  listMsfsBushHubOverrides,
  openCareerStore,
  setRuntimeMsfsBushHubOverrides,
  upsertRuntimeMsfsBushHubOverride,
  type CareerRunway,
  type MsfsBushHubOverride,
  type MsfsBushHubOverridesFile,
  type RunwaySurface,
} from '@msfs-compat/shared';
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';
import { confirm, printSection, withPrompts, type AskFn } from './prompt.js';
import { IpcClientError } from './ipc/types.js';

export type CareerHubsWizardOpts = {
  bridge: NamedPipeSimBridge;
  repoRoot: string;
  /** Optional non-interactive scope: all | bush | icao */
  scope?: 'all' | 'bush' | string;
  /** Skip prompts when scope is set. */
  yes?: boolean;
};

type FacilityHit = {
  icao: string;
  name?: string;
  lat: number;
  lon: number;
  runways?: CareerRunway[];
};

const SURFACE_SET = new Set<RunwaySurface>([
  'asphalt',
  'concrete',
  'grass',
  'gravel',
  'dirt',
  'water',
  'other',
]);

function mapFacilityRunways(
  raw: Array<{
    ident: string;
    identReciprocal?: string;
    headingTrueDeg: number;
    lengthM: number;
    widthM: number;
    lat: number;
    lon: number;
    surface?: string;
  }> | undefined,
): CareerRunway[] | undefined {
  if (!raw?.length) return undefined;
  const rows: CareerRunway[] = [];
  for (const r of raw) {
    if (
      !r.ident?.trim() ||
      !Number.isFinite(r.headingTrueDeg) ||
      !Number.isFinite(r.lengthM) ||
      r.lengthM < 5 ||
      !Number.isFinite(r.widthM) ||
      r.widthM <= 0 ||
      !Number.isFinite(r.lat) ||
      !Number.isFinite(r.lon) ||
      (r.lat === 0 && r.lon === 0)
    ) {
      continue;
    }
    const surface =
      r.surface && SURFACE_SET.has(r.surface as RunwaySurface)
        ? (r.surface as RunwaySurface)
        : undefined;
    rows.push({
      ident: r.ident.trim(),
      ...(r.identReciprocal?.trim()
        ? { identReciprocal: r.identReciprocal.trim() }
        : {}),
      headingTrueDeg: r.headingTrueDeg,
      lengthM: r.lengthM,
      widthM: r.widthM,
      lat: r.lat,
      lon: r.lon,
      ...(surface ? { surface } : {}),
    });
  }
  return rows.length > 0 ? rows : undefined;
}

type RunRow =
  | { icao: string; ok: true; override: MsfsBushHubOverride }
  | { icao: string; ok: false; error: string };

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function overridesPath(repoRoot: string): string {
  return join(repoRoot, 'profiles', 'career', 'msfs-bush-hub-overrides.json');
}

async function loadRuntimeOverrides(repoRoot: string): Promise<void> {
  const path = overridesPath(repoRoot);
  try {
    const { readFile } = await import('node:fs/promises');
    const raw = JSON.parse(await readFile(path, 'utf8')) as unknown;
    setRuntimeMsfsBushHubOverrides(raw);
  } catch {
    setRuntimeMsfsBushHubOverrides({});
  }
}

async function persistOverrides(repoRoot: string): Promise<string> {
  const path = overridesPath(repoRoot);
  await mkdir(join(repoRoot, 'profiles', 'career'), { recursive: true });
  const payload: MsfsBushHubOverridesFile = listMsfsBushHubOverrides();
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return path;
}

async function fetchFacility(
  bridge: NamedPipeSimBridge,
  icao: string,
): Promise<FacilityHit> {
  try {
    const facility = await bridge.getAirportFacility(icao);
    if (
      !Number.isFinite(facility.lat) ||
      !Number.isFinite(facility.lon) ||
      (facility.lat === 0 && facility.lon === 0)
    ) {
      throw new Error(`invalid coords for ${icao}`);
    }
      return {
        icao: (facility.icao || icao).trim().toUpperCase() || icao,
        name: facility.name?.trim() || undefined,
        lat: facility.lat,
        lon: facility.lon,
        runways: mapFacilityRunways(facility.runways),
      };
  } catch (error) {
    if (
      error instanceof IpcClientError &&
      (error.code === 'UNSUPPORTED' ||
        /Unknown method:\s*getAirportFacility/i.test(error.message))
    ) {
      throw new Error(
        'SimBridgeHost does not support getAirportFacility — rebuild and restart: npm run build:native && restart start:local (or host:simconnect)',
      );
    }
    throw error;
  }
}

async function pickScope(
  ask: AskFn,
  opts: CareerHubsWizardOpts,
): Promise<string[]> {
  if (opts.scope === 'all') return listCareerHubIcaos();
  if (opts.scope === 'bush') return listBushTripOnlyIcaos();
  if (opts.scope && opts.scope !== 'wizard') {
    const code = opts.scope.trim().toUpperCase();
    if (!isCareerHubIcao(code)) {
      throw new Error(`${code} is not a career hub`);
    }
    return [code];
  }

  const allCount = listCareerHubIcaos().length;
  const bushCount = listBushTripOnlyIcaos().length;
  printSection('MSFS hub Facilities homologation');
  console.log('  MSFS must be running. SimBridgeHost needs getAirportFacility.');
  console.log('  Writes profiles/career/msfs-bush-hub-overrides.json + local economy.');
  console.log('');
  console.log(`  1. All career hubs (${allCount})`);
  console.log(`  2. Bush-trip-only locals (${bushCount})`);
  console.log('  3. Single ICAO');
  const choice = (await ask('Choice', '1')).trim();
  if (choice === '2' || choice.toLowerCase() === 'bush') {
    return listBushTripOnlyIcaos();
  }
  if (choice === '3' || choice.toLowerCase() === 'icao') {
    const raw = (await ask('ICAO')).trim().toUpperCase();
    if (!isCareerHubIcao(raw)) {
      throw new Error(`${raw || '(empty)'} is not a career hub`);
    }
    return [raw];
  }
  return listCareerHubIcaos();
}

export async function runCareerHubsWizard(
  opts: CareerHubsWizardOpts,
): Promise<{ okCount: number; failCount: number; path: string }> {
  await loadRuntimeOverrides(opts.repoRoot);

  const icaos = await withPrompts(async (ask) => {
    const list = await pickScope(ask, opts);
    if (opts.yes) return list;
    const label =
      list.length === 1
        ? list[0]!
        : list.length === listBushTripOnlyIcaos().length
          ? `${list.length} bushTripOnly hubs`
          : `${list.length} career hubs`;
    const ok = await confirm(
      ask,
      `Look up ${label} via SimConnect Facilities and write overrides?`,
      true,
    );
    if (!ok) throw new Error('Cancelled');
    return list;
  });

  const status = await opts.bridge.status().catch(() => null);
  if (!status?.connected) {
    throw new Error(
      'SimBridge not connected to MSFS — start the sim, then npm run host:simconnect / start:local',
    );
  }

  // Probe once so UNSUPPORTED fails fast with a clear message.
  await fetchFacility(opts.bridge, icaos[0]!);

  printSection(`Fetching ${icaos.length} facilities`);
  const rows: RunRow[] = [];
  let i = 0;
  for (const icao of icaos) {
    i += 1;
    process.stdout.write(`  [${i}/${icaos.length}] ${icao}…`);
    try {
      const hit = await fetchFacility(opts.bridge, icao);
      const catalogName = CAREER_HUB_COORDS[icao]?.name;
      const override: MsfsBushHubOverride = {
        name: hit.name || catalogName || icao,
        lat: hit.lat,
        lon: hit.lon,
        source: 'msfs_facility',
        validatedAt: todayUtc(),
        ...(hit.runways?.length ? { runways: hit.runways } : {}),
      };
      upsertRuntimeMsfsBushHubOverride(icao, override);
      rows.push({ icao, ok: true, override });
      const rwyN = hit.runways?.length ?? 0;
      console.log(
        ` ok  ${override.name}  ${override.lat.toFixed(4)},${override.lon.toFixed(4)}  rwy×${rwyN}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      rows.push({ icao, ok: false, error: message });
      console.log(` FAIL  ${message}`);
      // Hard stop if the host itself is wrong — no point looping 200×.
      if (/getAirportFacility|rebuild and restart/i.test(message)) {
        throw error;
      }
    }
  }

  const path = await persistOverrides(opts.repoRoot);

  // Stamp live economy (SQLite/JSON) — always save so Facilities coords stick
  // even when migrate already applied them in-memory (dirty flag used to skip).
  const careerDir = join(opts.repoRoot, 'profiles', 'career');
  const store = await openCareerStore({ careerDir });
  let stampedAirports = 0;
  try {
    const { world } = await store.loadEconomy();
    const overrides = listMsfsBushHubOverrides();
    for (const [icao, override] of Object.entries(overrides)) {
      const airport = world.airports.find(
        (a) => a.icao.toUpperCase() === icao,
      );
      if (airport && applyMsfsBushHubOverrideToTerminal(airport, override)) {
        stampedAirports += 1;
      }
    }
    // Force persist: sqlite previously kept FAA/PLN estimates when dirty=false.
    await store.saveEconomy(world);
  } finally {
    store.close();
  }

  // Refresh bushTripOnly catalog + shipped seed from MSFS overrides (no PLN edits).
  let catalogUpdated = false;
  try {
    const { spawnSync } = await import('node:child_process');
    const genScript = join(
      opts.repoRoot,
      'packages',
      'shared',
      'scripts',
      'gen-bush-trip-only-hubs.mjs',
    );
    const gen = spawnSync(process.execPath, [genScript], {
      cwd: opts.repoRoot,
      encoding: 'utf8',
      env: process.env,
    });
    if (gen.status === 0) {
      catalogUpdated = true;
    } else {
      console.log(
        `  warn: gen-bush-trip-only-hubs exited ${gen.status}: ${
          gen.stderr || gen.stdout || ''
        }`.trim(),
      );
    }
  } catch (error) {
    console.log(
      `  warn: could not regen bushTripOnly catalog: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const okCount = rows.filter((r) => r.ok).length;
  const failCount = rows.filter((r) => !r.ok).length;
  printSection('Done');
  console.log(`  ok=${okCount}  fail=${failCount}`);
  console.log(`  overrides → ${path}`);
  console.log(
    `  economy (sqlite) stamped ${stampedAirports} airport(s) and saved`,
  );
  if (catalogUpdated) {
    console.log(
      '  bushTripOnly catalog regenerated from MSFS overrides (PLN files untouched)',
    );
    console.log(
      '  Rebuild shared if career-ui is running: npm run build -w @msfs-compat/shared',
    );
  }
  if (failCount > 0) {
    console.log('  Failures:');
    for (const row of rows) {
      if (row.ok) continue;
      console.log(`    ${row.icao}: ${row.error}`);
    }
  }
  console.log('  Restart career-ui so map/GFP pick up the new coords.');
  return { okCount, failCount, path };
}
