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
  filterMsfsBushHubOverridesToIcaos,
  isCareerHubIcao,
  listBushTripOnlyIcaos,
  listCareerHubIcaos,
  listMsfsBushHubOverrides,
  lookupMsfsBushHubOverride,
  msfsFacilityMatchesCareerHub,
  openCareerStore,
  pruneOrphanCareerHubs,
  pruneRuntimeMsfsBushHubOverrides,
  setRuntimeMsfsBushHubOverrides,
  SIMBRIEF_DISPATCH_DENY_ICAOS,
  upsertRuntimeMsfsBushHubOverride,
  type CareerRunway,
  type MsfsBushHubOverride,
  type MsfsBushHubOverridesFile,
  type RunwaySurface,
} from '@msfs-compat/shared';
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';
import { confirm, printSection, withPrompts, type AskFn } from './prompt.js';
import { IpcClientError } from './ipc/types.js';
import { isSimDownError } from './sim-session-health.js';

export type CareerHubsWizardOpts = {
  bridge: NamedPipeSimBridge;
  repoRoot: string;
  /** Optional non-interactive scope: all | bush | missing | icao */
  scope?: 'all' | 'bush' | 'missing' | string;
  /** Skip prompts when scope is set. */
  yes?: boolean;
  /** Re-fetch even when an msfs_facility override already exists. */
  force?: boolean;
};

type FacilityHit = {
  icao: string;
  name?: string;
  lat: number;
  lon: number;
  runways?: CareerRunway[];
};

/** Host may spend ~5s on RequestFacilityData + up to 15s on airport-list fallback. */
const FACILITY_IPC_TIMEOUT_MS = 30_000;
const FACILITY_TIMEOUT_RETRIES = 2;
const FACILITY_RETRY_DELAY_MS = 750;
/** Pace requests so Facility + list fallback does not tear down SimConnect. */
const BETWEEN_HUB_DELAY_MS = 200;
/** Persist overrides periodically so a mid-run crash keeps progress. */
const PERSIST_EVERY_OK = 25;
const SESSION_RECONNECT_ATTEMPTS = 2;
const SESSION_RECONNECT_DELAY_MS = 2_000;

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
  | { icao: string; ok: true; override: MsfsBushHubOverride; skipped?: boolean }
  | { icao: string; ok: false; error: string };

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function overridesPath(repoRoot: string): string {
  return join(repoRoot, 'profiles', 'career', 'msfs-bush-hub-overrides.json');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof IpcClientError && error.code === 'TIMEOUT') return true;
  const message = error instanceof Error ? error.message : String(error);
  return /\bTIMEOUT\b/i.test(message) || /timed out/i.test(message);
}

function isSessionDeadError(error: unknown): boolean {
  if (isSimDownError(error)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /SimConnect is not connected|SimConnect disconnected|not connected to MSFS/i.test(
    message,
  );
}

async function reconnectSimSession(bridge: NamedPipeSimBridge): Promise<void> {
  console.log('  reconnecting SimConnect session…');
  await bridge.open('MSFS Compat Career Hubs', { resetSession: true });
  const status = await bridge.status().catch(() => null);
  if (!status?.connected) {
    throw new Error(
      'SimConnect still disconnected after reconnect — check MSFS / host:simconnect',
    );
  }
}

function hasFacilityOverride(icao: string): boolean {
  const row = lookupMsfsBushHubOverride(icao);
  return row?.source === 'msfs_facility';
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
  pruneRuntimeMsfsBushHubOverrides(catalogOverrideKeepIcaos());
}

function catalogOverrideKeepIcaos(): string[] {
  const deny = new Set(
    SIMBRIEF_DISPATCH_DENY_ICAOS.map((icao) => icao.toUpperCase()),
  );
  return listCareerHubIcaos().filter((icao) => !deny.has(icao));
}

async function persistOverrides(repoRoot: string): Promise<string> {
  const path = overridesPath(repoRoot);
  await mkdir(join(repoRoot, 'profiles', 'career'), { recursive: true });
  const keep = catalogOverrideKeepIcaos();
  pruneRuntimeMsfsBushHubOverrides(keep);
  const payload: MsfsBushHubOverridesFile = filterMsfsBushHubOverridesToIcaos(
    listMsfsBushHubOverrides(),
    keep,
  );
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return path;
}

async function fetchFacility(
  bridge: NamedPipeSimBridge,
  icao: string,
): Promise<FacilityHit> {
  try {
    const facility = await bridge.getAirportFacility(icao, {
      timeoutMs: FACILITY_IPC_TIMEOUT_MS,
    });
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

async function fetchFacilityWithRetry(
  bridge: NamedPipeSimBridge,
  icao: string,
): Promise<FacilityHit> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= FACILITY_TIMEOUT_RETRIES; attempt++) {
    try {
      return await fetchFacility(bridge, icao);
    } catch (error) {
      lastError = error;
      if (!isTimeoutError(error) || attempt >= FACILITY_TIMEOUT_RETRIES) {
        throw error;
      }
      process.stdout.write(` retry${attempt + 1}…`);
      await sleep(FACILITY_RETRY_DELAY_MS);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? 'facility lookup failed'));
}

function filterMissingFacilityOverrides(icaos: string[]): string[] {
  return icaos.filter((icao) => !hasFacilityOverride(icao));
}

async function pickScope(
  ask: AskFn,
  opts: CareerHubsWizardOpts,
): Promise<string[]> {
  if (opts.scope === 'all') return listCareerHubIcaos();
  if (opts.scope === 'bush') return listBushTripOnlyIcaos();
  if (opts.scope === 'missing') {
    return filterMissingFacilityOverrides(listCareerHubIcaos());
  }
  if (opts.scope && opts.scope !== 'wizard') {
    const code = opts.scope.trim().toUpperCase();
    if (!isCareerHubIcao(code)) {
      throw new Error(`${code} is not a career hub`);
    }
    return [code];
  }

  const allCount = listCareerHubIcaos().length;
  const bushCount = listBushTripOnlyIcaos().length;
  const missingCount = filterMissingFacilityOverrides(listCareerHubIcaos())
    .length;
  printSection('MSFS hub Facilities homologation');
  console.log('  MSFS must be running. SimBridgeHost needs getAirportFacility.');
  console.log('  Writes profiles/career/msfs-bush-hub-overrides.json + local economy.');
  console.log('  Facility lookups use a 30s IPC timeout (host may warm the airport list).');
  console.log('');
  console.log(`  1. All career hubs (${allCount})`);
  console.log(`  2. Bush-trip-only locals (${bushCount})`);
  console.log(`  3. Missing only — no msfs_facility override yet (${missingCount})`);
  console.log('  4. Single ICAO');
  const choice = (await ask('Choice', '3')).trim();
  if (choice === '2' || choice.toLowerCase() === 'bush') {
    return listBushTripOnlyIcaos();
  }
  if (choice === '3' || choice.toLowerCase() === 'missing') {
    return filterMissingFacilityOverrides(listCareerHubIcaos());
  }
  if (choice === '4' || choice.toLowerCase() === 'icao') {
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
    let list = await pickScope(ask, opts);
    if (!opts.force && opts.scope !== 'missing' && list.length > 1) {
      const before = list.length;
      list = filterMissingFacilityOverrides(list);
      const skipped = before - list.length;
      if (skipped > 0) {
        console.log(
          `  Skipping ${skipped} hub(s) that already have msfs_facility overrides (use --force to redo).`,
        );
      }
    }
    if (opts.yes) return list;
    if (list.length === 0) {
      console.log('  Nothing to fetch — every hub already has an msfs_facility override.');
      return list;
    }
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

  if (icaos.length === 0) {
    const path = await persistOverrides(opts.repoRoot);
    printSection('Done');
    console.log('  ok=0  fail=0  (nothing pending)');
    console.log(`  overrides → ${path}`);
    return { okCount: 0, failCount: 0, path };
  }

  const status = await opts.bridge.status().catch(() => null);
  if (!status?.connected) {
    throw new Error(
      'SimBridge not connected to MSFS — start the sim, then npm run host:simconnect / start:local',
    );
  }

  // Probe once so UNSUPPORTED fails fast. NOT_FOUND/TIMEOUT on the first ICAO
  // must not abort the whole batch (common for hubs missing from local scenery).
  try {
    await fetchFacilityWithRetry(opts.bridge, icaos[0]!);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/getAirportFacility|rebuild and restart/i.test(message)) {
      throw error;
    }
    console.log(
      `  note: probe ${icaos[0]} failed (${message}) — continuing with the batch`,
    );
  }

  printSection(`Fetching ${icaos.length} facilities`);
  const rows: RunRow[] = [];
  let i = 0;
  let okSincePersist = 0;
  let abortedForSession = false;
  for (const icao of icaos) {
    i += 1;
    if (i > 1) await sleep(BETWEEN_HUB_DELAY_MS);
    process.stdout.write(`  [${i}/${icaos.length}] ${icao}…`);
    try {
      let hit: FacilityHit;
      try {
        hit = await fetchFacilityWithRetry(opts.bridge, icao);
      } catch (error) {
        if (!isSessionDeadError(error)) throw error;
        let recovered = false;
        for (let r = 0; r < SESSION_RECONNECT_ATTEMPTS; r++) {
          try {
            process.stdout.write(` reconnect${r + 1}…`);
            await sleep(SESSION_RECONNECT_DELAY_MS);
            await reconnectSimSession(opts.bridge);
            hit = await fetchFacilityWithRetry(opts.bridge, icao);
            recovered = true;
            break;
          } catch (reconnectError) {
            if (
              r + 1 >= SESSION_RECONNECT_ATTEMPTS ||
              !isSessionDeadError(reconnectError)
            ) {
              throw reconnectError;
            }
          }
        }
        if (!recovered) {
          throw error;
        }
      }
      const match = msfsFacilityMatchesCareerHub(icao, hit!);
      if (!match.ok) {
        rows.push({ icao, ok: false, error: match.reason });
        console.log(` SKIP  ${match.reason}`);
        continue;
      }
      const catalogName = CAREER_HUB_COORDS[icao]?.name;
      const override: MsfsBushHubOverride = {
        name: hit!.name || catalogName || icao,
        lat: hit!.lat,
        lon: hit!.lon,
        source: 'msfs_facility',
        validatedAt: todayUtc(),
        ...(hit!.runways?.length ? { runways: hit!.runways } : {}),
      };
      upsertRuntimeMsfsBushHubOverride(icao, override);
      rows.push({ icao, ok: true, override });
      okSincePersist += 1;
      const rwyN = hit!.runways?.length ?? 0;
      console.log(
        ` ok  ${override.name}  ${override.lat.toFixed(4)},${override.lon.toFixed(4)}  rwy×${rwyN}`,
      );
      if (okSincePersist >= PERSIST_EVERY_OK) {
        await persistOverrides(opts.repoRoot);
        okSincePersist = 0;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      rows.push({ icao, ok: false, error: message });
      console.log(` FAIL  ${message}`);
      // Hard stop if the host itself is wrong — no point looping 200×.
      if (/getAirportFacility|rebuild and restart/i.test(message)) {
        await persistOverrides(opts.repoRoot).catch(() => undefined);
        throw error;
      }
      // SimConnect died and reconnect failed — stop so we don't spam FAIL.
      if (isSessionDeadError(error)) {
        abortedForSession = true;
        console.log(
          '  aborting batch — SimConnect session is down. Progress saved; re-run with `npm run career-hubs -- missing` after MSFS/host is healthy.',
        );
        break;
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
    pruneOrphanCareerHubs(world);
    const keep = new Set(catalogOverrideKeepIcaos());
    const overrides = filterMsfsBushHubOverridesToIcaos(
      listMsfsBushHubOverrides(),
      keep,
    );
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
    console.log(
      '  Tip: re-run with `npm run career-hubs -- missing` to retry only hubs still without overrides.',
    );
  }
  if (abortedForSession) {
    console.log(
      '  Session aborted early — confirm MSFS is running and host:simconnect is healthy, then retry missing.',
    );
  }
  console.log('  Restart career-ui so map/GFP pick up the new coords.');
  return { okCount, failCount, path };
}
