#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import { DefaultProfileEngine } from '@msfs-compat/runtime';
import type { AircraftProfile, LoadPlanRequest } from '@msfs-compat/shared';
import { computeFingerprintV2 } from '@msfs-compat/shared';
import { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';
import { defaultCacheDir, defaultProfileDirs, loadProfilesFromDirs } from './profile-registry.js';
import { draftProfileFromLive } from './draft-profile.js';
import { calibrateProfile } from './calibrate-profile.js';
import { CatalogClient } from './catalog-client.js';
import { ProfileCache } from './profile-cache.js';
import { sampleAircraftStructure } from './sample-structure.js';
import { resolveLiveAircraft } from './resolve-live.js';

const agentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(agentDir, '..', '..', '..');

function usage(): never {
  console.log(`Usage:
  msfs-compat-agent ping|status|live|probe|writetest [--pipe <name>]
  msfs-compat-agent fingerprint [--register] [--catalog-url <url>] [--pipe <name>]
  msfs-compat-agent sync-catalog [--catalog-url <url>] [--channel stable]
  msfs-compat-agent resolve [--catalog-url <url>] [--pipe <name>]
  msfs-compat-agent apply-auto --fuel-left <n> --fuel-right <n> [--station i=lbs ...] [--catalog-url <url>] [--pipe <name>]
  msfs-compat-agent draft-profile [--out <dir>] [--fuel-offset <n>] [--calibrate] [--pipe <name>]
  msfs-compat-agent calibrate --profile <path.json> [--pipe <name>]
  msfs-compat-agent smoke --profile <path.json> [--pipe <name>]
  msfs-compat-agent apply --profile <path.json> --fuel-left <n> --fuel-right <n> [--pipe <name>]

Notes:
  resolve / apply-auto: fingerprint → catalog API → cache → local examples
  Catalog default: http://localhost:8080/v1 (MSFS_COMPAT_CATALOG_URL)
  Homologation: draft-profile --calibrate → smoke → promote to profiles/examples
`);
  process.exit(1);
}

function catalogUrlFromArgs(args: string[]): string | undefined {
  return getFlag(args, '--catalog-url') ?? process.env.MSFS_COMPAT_CATALOG_URL;
}

function getFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

function getStationFlags(args: string[]): Record<number, number> {
  const stations: Record<number, number> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--station' && args[i + 1]) {
      const [idxRaw, valueRaw] = args[i + 1].split('=');
      const index = Number(idxRaw);
      const value = Number(valueRaw);
      if (Number.isFinite(index) && Number.isFinite(value)) {
        stations[index] = value;
      }
      i += 1;
    }
  }
  return stations;
}

async function loadProfile(path: string): Promise<AircraftProfile> {
  const raw = await readFile(resolve(path), 'utf8');
  return JSON.parse(raw) as AircraftProfile;
}

async function withBridge<T>(
  pipeName: string | undefined,
  fn: (bridge: NamedPipeSimBridge) => Promise<T>,
): Promise<T> {
  const bridge = new NamedPipeSimBridge({ pipeName });
  await bridge.open();
  try {
    return await fn(bridge);
  } finally {
    await bridge.close();
  }
}

async function waitForHost(pipeName: string | undefined, attempts = 40): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await withBridge(pipeName, async (bridge) => {
        await bridge.ping();
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error('Timed out waiting for SimBridgeHost');
}

async function maybeStartHost(hostPath: string | undefined, pipeName: string | undefined): Promise<ChildProcess | null> {
  if (!hostPath) {
    return null;
  }

  const child = spawn(hostPath, ['--mode', 'mock', ...(pipeName ? ['--pipe', pipeName] : [])], {
    stdio: 'inherit',
    windowsHide: true,
  });

  await waitForHost(pipeName);
  return child;
}

async function loadCatalog() {
  return loadProfilesFromDirs(defaultProfileDirs(repoRoot));
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;
  if (!command) {
    usage();
  }

  const pipeName = getFlag(rest, '--pipe') ?? process.env.MSFS_COMPAT_PIPE;
  const catalogUrl = catalogUrlFromArgs(rest);
  const cache = new ProfileCache(defaultCacheDir(repoRoot));

  if (command === 'ping') {
    const result = await withBridge(pipeName, (b) => b.ping());
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'status') {
    const result = await withBridge(pipeName, (b) => b.status());
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'sync-catalog') {
    const client = new CatalogClient({ baseUrl: catalogUrl });
    const channel = getFlag(rest, '--channel') ?? 'stable';
    const result = await cache.syncFromCatalog(client, channel);
    console.log(
      JSON.stringify(
        {
          cacheDir: cache.cacheDir,
          channel,
          entries: result.manifest.entries.length,
          downloaded: result.downloaded,
          skipped: result.skipped,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command === 'fingerprint') {
    const doRegister = rest.includes('--register');
    const result = await withBridge(pipeName, async (bridge) => {
      const live = await bridge.getAircraftIdentity();
      const publisher = process.env.MSFS_COMPAT_PUBLISHER ?? 'asobo';
      const identity = {
        title: live.title,
        publisher,
        atcModel: live.atcModel,
        atcType: live.atcType,
        icao: live.icao ?? live.atcModel,
      };
      const { structure, liveWeights } = await sampleAircraftStructure(bridge);
      const { fingerprint, structuralHash } = computeFingerprintV2({ identity, structure });
      let catalogRegister: unknown;
      if (doRegister) {
        const client = new CatalogClient({ baseUrl: catalogUrl });
        catalogRegister = await client.registerFingerprint({
          clientId: process.env.MSFS_COMPAT_CLIENT_ID ?? 'local-dev',
          simVersion: process.env.MSFS_COMPAT_SIM_VERSION ?? '1.0.0.0',
          identity,
          structure,
        });
      }
      return { identity, structure, liveWeights, fingerprint, structuralHash, catalogRegister };
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'resolve') {
    const localCatalog = await loadCatalog();
    const result = await withBridge(pipeName, async (bridge) =>
      resolveLiveAircraft({
        bridge,
        localCatalog,
        cache,
        catalogUrl,
      }),
    );
    console.log(
      JSON.stringify(
        {
          identity: result.identity,
          fingerprint: result.fingerprint,
          structuralHash: result.structuralHash,
          source: result.source,
          catalog: result.catalog,
          resolved: {
            matched: result.matched,
            confidence: result.confidence,
            reason: result.reason,
            profileKey: result.profile?.profileKey,
            path: result.path,
            candidates: result.candidates,
          },
        },
        null,
        2,
      ),
    );
    if (!result.matched) {
      process.exitCode = 3;
    }
    return;
  }

  if (command === 'apply-auto') {
    const left = Number(getFlag(rest, '--fuel-left') ?? 'NaN');
    const right = Number(getFlag(rest, '--fuel-right') ?? 'NaN');
    const stations = getStationFlags(rest);

    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      console.error('apply-auto requires --fuel-left and --fuel-right');
      process.exit(1);
    }

    const localCatalog = await loadCatalog();
    const result = await withBridge(pipeName, async (bridge) => {
      const resolved = await resolveLiveAircraft({
        bridge,
        localCatalog,
        cache,
        catalogUrl,
      });
      if (!resolved.matched || !resolved.profile) {
        return {
          ok: false as const,
          identity: resolved.identity,
          fingerprint: resolved.fingerprint,
          source: resolved.source,
          resolved: {
            matched: false as const,
            confidence: resolved.confidence,
            reason: resolved.reason,
            candidates: resolved.candidates,
          },
        };
      }

      const before = await bridge.snapshot();
      const plan: LoadPlanRequest = {
        fuel: { tanks: { LEFT_MAIN: left, RIGHT_MAIN: right } },
      };

      if (Object.keys(stations).length > 0) {
        const total = Object.values(stations).reduce((a, b) => a + b, 0);
        plan.payload = { stations, total };
      }

      const engine = new DefaultProfileEngine({ profile: resolved.profile, bridge });
      const apply = await engine.applyLoadPlan(plan);
      const after = await bridge.snapshot();

      return {
        ok: true as const,
        identity: resolved.identity,
        fingerprint: resolved.fingerprint,
        source: resolved.source,
        resolved: {
          matched: true as const,
          confidence: resolved.confidence,
          reason: resolved.reason,
          profileKey: resolved.profile.profileKey,
          path: resolved.path,
        },
        before,
        apply,
        after,
      };
    });

    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      process.exitCode = 3;
      return;
    }
    const fuelOk = result.apply?.fuel?.success === true;
    const payloadRequested = Object.keys(stations).length > 0;
    const payloadOk = !payloadRequested || result.apply?.payload?.success === true;
    if (!fuelOk || !payloadOk) {
      process.exitCode = 2;
    }
    return;
  }

  if (command === 'draft-profile') {
    const outDir = resolve(getFlag(rest, '--out') ?? join(repoRoot, 'profiles', 'drafts'));
    const fuelOffset = Number(getFlag(rest, '--fuel-offset') ?? '0');
    const autoCalibrate = rest.includes('--calibrate');
    const result = await withBridge(pipeName, async (bridge) => {
      const drafted = await draftProfileFromLive(bridge, {
        outDir,
        fuelOffset: Number.isFinite(fuelOffset) ? fuelOffset : 0,
      });
      const base = {
        path: drafted.path,
        profileKey: drafted.profile.profileKey,
        title: drafted.profile.match.title,
        tanks: drafted.profile.fuel.tanks.length,
        stations: drafted.profile.payload.stations.length,
        notes: drafted.profile.notes,
      };
      if (!autoCalibrate) {
        return base;
      }
      const calibration = await calibrateProfile(bridge, drafted.path);
      return { ...base, calibration };
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'calibrate') {
    const profilePath = getFlag(rest, '--profile');
    if (!profilePath) {
      usage();
    }
    const result = await withBridge(pipeName, async (bridge) => calibrateProfile(bridge, profilePath));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'live') {
    const result = await withBridge(pipeName, async (bridge) => {
      const ping = await bridge.ping();
      const status = await bridge.status();
      const identity = await bridge.getAircraftIdentity();
      const snap = await bridge.snapshot();
      return { ping, status, identity, snapshot: snap };
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'probe') {
    const candidates: Array<{ name: string; unit: string }> = [
      { name: 'FUEL TOTAL QUANTITY', unit: 'gallons' },
      { name: 'FUEL TOTAL CAPACITY', unit: 'gallons' },
      { name: 'FUEL TANK LEFT MAIN QUANTITY', unit: 'gallons' },
      { name: 'FUEL TANK RIGHT MAIN QUANTITY', unit: 'gallons' },
      { name: 'FUEL TANK LEFT AUX QUANTITY', unit: 'gallons' },
      { name: 'FUEL TANK RIGHT AUX QUANTITY', unit: 'gallons' },
      { name: 'FUEL TANK CENTER QUANTITY', unit: 'gallons' },
      { name: 'FUEL TANK CENTER2 QUANTITY', unit: 'gallons' },
      { name: 'FUEL TANK TIP LEFT QUANTITY', unit: 'gallons' },
      { name: 'FUEL TANK TIP RIGHT QUANTITY', unit: 'gallons' },
    ];

    for (let i = 1; i <= 10; i++) {
      candidates.push({ name: `FUELSYSTEM TANK QUANTITY:${i}`, unit: 'gallons' });
      candidates.push({ name: `FUELSYSTEM TANK CAPACITY:${i}`, unit: 'gallons' });
    }

    candidates.push(
      { name: 'TOTAL PAYLOAD WEIGHT', unit: 'pounds' },
      { name: 'PAYLOAD STATION COUNT', unit: 'number' },
      { name: 'CG PERCENT', unit: 'Percent over 100' },
      { name: 'EMPTY WEIGHT', unit: 'pounds' },
      { name: 'MAX GROSS WEIGHT', unit: 'pounds' },
    );

    for (let i = 0; i <= 16; i++) {
      candidates.push({ name: `PAYLOAD STATION WEIGHT:${i}`, unit: 'pounds' });
    }

    const result = await withBridge(pipeName, async (bridge) => {
      const identity = await bridge.getAircraftIdentity();
      const readings: Array<{ name: string; unit: string; ok: boolean; value?: number; error?: string }> = [];

      for (const candidate of candidates) {
        try {
          const value = await bridge.readSimVar(candidate);
          const sane = Number.isFinite(value) && !(Math.abs(value) > 0 && Math.abs(value) < 1e-6);
          readings.push({
            name: candidate.name,
            unit: candidate.unit,
            ok: sane,
            value: sane ? value : undefined,
            error: sane ? undefined : 'insane_or_uninitialized',
          });
        } catch (error) {
          readings.push({
            name: candidate.name,
            unit: candidate.unit,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const fuelQty = readings.filter(
        (r) => r.ok && r.name.includes('TANK QUANTITY') && (r.value ?? 0) >= 0,
      );
      const fuelCap = readings.filter((r) => r.ok && r.name.includes('TANK CAPACITY') && (r.value ?? 0) > 0);
      const stations = readings.filter(
        (r) => r.ok && r.name.startsWith('PAYLOAD STATION WEIGHT:'),
      );

      return {
        identity,
        summary: {
          fuelQuantityVars: fuelQty,
          fuelCapacityVars: fuelCap,
          payloadStations: stations,
          emptyWeightLb: readings.find((r) => r.name === 'EMPTY WEIGHT')?.value,
          maxGrossWeightLb: readings.find((r) => r.name === 'MAX GROSS WEIGHT')?.value,
          stationCount: readings.find((r) => r.name === 'PAYLOAD STATION COUNT')?.value,
          cgRaw: readings.find((r) => r.name === 'CG PERCENT')?.value,
        },
        readable: readings.filter((r) => r.ok),
        failed: readings.filter((r) => !r.ok),
      };
    });

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'writetest') {
    const tests: Array<{ name: string; unit: string; value: number }> = [
      { name: 'FUELSYSTEM TANK QUANTITY:1', unit: 'gallons', value: 40 },
      { name: 'FUELSYSTEM TANK QUANTITY:2', unit: 'gallons', value: 40 },
      { name: 'FUELSYSTEM TANK QUANTITY:3', unit: 'gallons', value: 20 },
      { name: 'FUELSYSTEM TANK QUANTITY:4', unit: 'gallons', value: 20 },
      { name: 'FUEL TANK LEFT MAIN QUANTITY', unit: 'gallons', value: 35 },
      { name: 'FUEL TANK RIGHT MAIN QUANTITY', unit: 'gallons', value: 35 },
      { name: 'FUEL TANK LEFT AUX QUANTITY', unit: 'gallons', value: 15 },
      { name: 'FUEL TANK RIGHT AUX QUANTITY', unit: 'gallons', value: 15 },
      { name: 'PAYLOAD STATION WEIGHT:1', unit: 'pounds', value: 180 },
      { name: 'PAYLOAD STATION WEIGHT:2', unit: 'pounds', value: 0 },
      { name: 'PAYLOAD STATION WEIGHT:3', unit: 'pounds', value: 50 },
      { name: 'PAYLOAD STATION WEIGHT:4', unit: 'pounds', value: 0 },
      { name: 'PAYLOAD STATION WEIGHT:5', unit: 'pounds', value: 25 },
      { name: 'PAYLOAD STATION WEIGHT:6', unit: 'pounds', value: 0 },
      { name: 'PAYLOAD STATION WEIGHT:7', unit: 'pounds', value: 10 },
      { name: 'PAYLOAD STATION WEIGHT:8', unit: 'pounds', value: 0 },
    ];

    const result = await withBridge(pipeName, async (bridge) => {
      const identity = await bridge.getAircraftIdentity();
      const outcomes = [];

      for (const test of tests) {
        let before: number | { error: string };
        try {
          before = await bridge.readSimVar({ name: test.name, unit: test.unit });
        } catch (e) {
          before = { error: e instanceof Error ? e.message : String(e) };
        }

        if (typeof before !== 'number') {
          outcomes.push({
            var: test.name,
            unit: test.unit,
            requested: test.value,
            before,
            writeError: 'skipped_unreadable',
            after: null,
            changed: false,
            matched: false,
          });
          continue;
        }

        let writeError: string | undefined;
        try {
          await bridge.writeSimVar(test);
          await bridge.delay(350);
        } catch (error) {
          writeError = error instanceof Error ? error.message : String(error);
        }

        let after: number | { error: string };
        try {
          after = await bridge.readSimVar({ name: test.name, unit: test.unit });
        } catch (e) {
          after = { error: e instanceof Error ? e.message : String(e) };
        }

        const writeOffsetHint =
          typeof after === 'number' && writeError === undefined
            ? Number((test.value - after).toFixed(3))
            : null;

        outcomes.push({
          var: test.name,
          unit: test.unit,
          requested: test.value,
          before,
          writeError: writeError ?? null,
          after,
          changed: typeof after === 'number' ? Math.abs(after - before) > 0.05 : false,
          matched:
            typeof after === 'number'
              ? Math.abs(after - test.value) <= Math.max(Math.abs(test.value) * 0.05, 0.25)
              : false,
          writeOffsetHint,
        });
      }

      return { identity, outcomes };
    });

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'smoke') {
    const profilePath = getFlag(rest, '--profile');
    if (!profilePath) {
      usage();
    }

    const hostPath = getFlag(rest, '--host');
    const host = await maybeStartHost(hostPath, pipeName);

    try {
      const profile = await loadProfile(profilePath);
      const result = await withBridge(pipeName, async (bridge) => {
        const ping = await bridge.ping();
        const identity = await bridge.getAircraftIdentity();
        const before = await bridge.snapshot();

        const engine = new DefaultProfileEngine({ profile, bridge });

        // Use ~80% of first two tank capacities when available (avoids overfill on C185 etc.).
        const leftCap = profile.fuel.tanks.find((t) => t.id === 'LEFT_MAIN')?.capacity ?? 40;
        const rightCap = profile.fuel.tanks.find((t) => t.id === 'RIGHT_MAIN')?.capacity ?? 40;
        const leftTarget = Math.max(5, Math.floor(leftCap * 0.8));
        const rightTarget = Math.max(5, Math.floor(rightCap * 0.8));

        const stationTargets: Record<number, number> = {};
        for (const station of profile.payload.stations) {
          stationTargets[station.index] = 0;
        }
        if (stationTargets[1] !== undefined) stationTargets[1] = 180;
        if (stationTargets[3] !== undefined) stationTargets[3] = 50;
        if (stationTargets[5] !== undefined) stationTargets[5] = 25;
        const payloadTotal = Object.values(stationTargets).reduce((a, b) => a + b, 0);

        const apply = await engine.applyLoadPlan({
          fuel: { tanks: { LEFT_MAIN: leftTarget, RIGHT_MAIN: rightTarget } },
          payload: {
            stations: stationTargets,
            total: payloadTotal,
          },
        });

        const after = await bridge.snapshot();
        return {
          ping,
          identity,
          targets: { fuel: { LEFT_MAIN: leftTarget, RIGHT_MAIN: rightTarget }, payload: stationTargets },
          before,
          apply,
          after,
        };
      });

      console.log(JSON.stringify(result, null, 2));

      const fuelOk = result.apply.fuel?.success === true;
      const payloadOk = result.apply.payload?.success === true;
      if (!fuelOk || !payloadOk) {
        process.exitCode = 2;
      }
    } finally {
      host?.kill();
    }
    return;
  }

  if (command === 'apply') {
    const profilePath = getFlag(rest, '--profile');
    const left = Number(getFlag(rest, '--fuel-left') ?? '20');
    const right = Number(getFlag(rest, '--fuel-right') ?? '20');
    if (!profilePath) {
      usage();
    }

    const profile = await loadProfile(profilePath);
    const result = await withBridge(pipeName, async (bridge) => {
      const engine = new DefaultProfileEngine({ profile, bridge });
      return engine.applyLoadPlan({
        fuel: { tanks: { LEFT_MAIN: left, RIGHT_MAIN: right } },
      });
    });

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  usage();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
