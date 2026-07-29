#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import { DefaultProfileEngine } from '@msfs-compat/runtime';
import type { AircraftProfile, LoadPlanRequest } from '@msfs-compat/shared';
import { computeFingerprintV2, inferPublisher } from '@msfs-compat/shared';
import { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';
import { defaultCacheDir, defaultProfileDirs, loadProfilesFromDirs } from './profile-registry.js';
import { draftProfileFromLive } from './draft-profile.js';
import { calibrateProfile } from './calibrate-profile.js';
import { CatalogClient } from './catalog-client.js';
import { ProfileCache } from './profile-cache.js';
import { sampleAircraftStructure } from './sample-structure.js';
import { resolveLiveAircraft } from './resolve-live.js';
import { runHomologateWizard } from './homologate-wizard.js';
import { buildSmokeStationTargets } from './smoke-targets.js';
import {
  A2A_AEROSTAR_LVAR_CANDIDATES,
  probeLVars,
  watchLVars,
} from './probe-lvars.js';
import { buildOfpExpectation } from './ofp-compliance/parse-ofp.js';
import { compareOnce, formatComplianceSummary } from './ofp-compliance/run-compare.js';
import { type ComplianceBaseline, type LiveFuelState } from '@msfs-compat/shared';

const agentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(agentDir, '..', '..', '..');

function usage(): never {
  console.log(`Usage:
  msfs-compat-agent ping|status|live|probe|probe-lvars|probe-pmdg-fuel|probe-payload-stations|pmdg-cdu|compare-ofp|monitor-ofp|writetest [--pipe <name>]
  msfs-compat-agent fingerprint [--register] [--catalog-url <url>] [--pipe <name>]
  msfs-compat-agent sync-catalog [--catalog-url <url>] [--channel stable]
  msfs-compat-agent resolve [--catalog-url <url>] [--pipe <name>]
  msfs-compat-agent apply-auto --fuel-left <n> --fuel-right <n> [--fuel-center <n>] [--fuel-left-tip <n>] [--fuel-right-tip <n>] [--fuel-left-aux <n>] [--fuel-right-aux <n>] [--station i=lbs ...] [--catalog-url <url>] [--pipe <name>]
  msfs-compat-agent draft-profile [--out <dir>] [--fuel-offset <n>] [--calibrate] [--pipe <name>]
  msfs-compat-agent calibrate --profile <path.json> [--pipe <name>]
  msfs-compat-agent smoke --profile <path.json> [--pipe <name>]
  msfs-compat-agent apply --profile <path.json> --fuel-left <n> --fuel-right <n> [--fuel-center <n>] [--fuel-left-aux <n>] [--fuel-right-aux <n>] [--pipe <name>]
  msfs-compat-agent homologate [--pipe <name>]
  msfs-compat-agent probe-lvars [--preset a2a-aerostar] [--var Name ...] [--watch [sec]] [--write Name=value ...] [--pipe <name>]
  msfs-compat-agent probe-pmdg-fuel [--pipe <name>]
  msfs-compat-agent probe-payload-stations [--pipe <name>]
  msfs-compat-agent pmdg-cdu [--key NAME] [--type digits] [--event id] [--method event|control] [--no-release] [--pipe <name>]
  msfs-compat-agent compare-ofp [--ofp path.json] [--fuel-left n] [--block-fuel n] [--payload-total n] [--baggage n] [--passengers n] [--zfw n] [--tow n] [--empty-weight n] [--station i=lb] [--lock] [--json] [--pipe <name>]
  msfs-compat-agent monitor-ofp [--ofp path.json] [same load-sheet flags] [--interval sec] [--lock] [--json] [--pipe <name>]

Notes:
  resolve / apply-auto: fingerprint → catalog API → cache → local examples
  Catalog default: http://localhost:8080/v1 (MSFS_COMPAT_CATALOG_URL)
  Homologation: homologate (wizard) OR draft-profile --calibrate → smoke → promote
  probe-lvars: read/watch/write Accu-Sim LVars (restart start:local after native rebuild)
  probe-pmdg-fuel: read PMDG_NG3_Data Client Data fuel qty (requires EnableDataBroadcast=1)
  probe-payload-stations: dump PAYLOAD STATION WEIGHT:1..N (homologate pax/cargo roles)
  pmdg-cdu: experimental/parked — not the fuel apply path (use SimBrief/EFB; Skyline monitors OFP vs live)
  compare-ofp / monitor-ofp: OFP/SimBrief load sheet vs live (fuel, payload, baggage/pax if mapped, ZFW/TOW)
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

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
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

function getNumberFlag(args: string[], name: string): number | undefined {
  const raw = getFlag(args, name);
  if (raw === undefined) {
    return undefined;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

async function resolveOfpFromArgs(args: string[]) {
  const ofpPath = getFlag(args, '--ofp');
  const fuelUnitRaw = getFlag(args, '--fuel-unit');
  const fuelUnit = fuelUnitRaw === 'kg' ? 'kg' : fuelUnitRaw === 'lb' ? 'lb' : undefined;
  return buildOfpExpectation(ofpPath, {
    fuelLeft: getNumberFlag(args, '--fuel-left'),
    fuelRight: getNumberFlag(args, '--fuel-right'),
    fuelCenter: getNumberFlag(args, '--fuel-center'),
    fuelTotal: getNumberFlag(args, '--fuel-total'),
    fuelUnit,
    blockFuel: getNumberFlag(args, '--block-fuel'),
    payloadTotal: getNumberFlag(args, '--payload-total'),
    baggage: getNumberFlag(args, '--baggage'),
    passengerCount: getNumberFlag(args, '--passengers') ?? getNumberFlag(args, '--pax'),
    emptyWeight: getNumberFlag(args, '--empty-weight'),
    zfw: getNumberFlag(args, '--zfw'),
    tow: getNumberFlag(args, '--tow'),
    stations: getStationFlags(args),
    icao: getFlag(args, '--icao'),
    ofpId: getFlag(args, '--ofp-id'),
  });
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

  if (command === 'homologate' || command === 'wizard') {
    await withBridge(pipeName, async (bridge) =>
      runHomologateWizard({
        bridge,
        repoRoot,
        draftsDir: join(repoRoot, 'profiles', 'drafts'),
        examplesDir: join(repoRoot, 'profiles', 'examples'),
        notesDir: join(repoRoot, 'profiles', 'notes'),
      }),
    );
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
      const publisher = inferPublisher(live.title, process.env.MSFS_COMPAT_PUBLISHER);
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
    const centerRaw = getFlag(rest, '--fuel-center');
    const center = centerRaw !== undefined ? Number(centerRaw) : undefined;
    const leftAuxRaw = getFlag(rest, '--fuel-left-aux');
    const rightAuxRaw = getFlag(rest, '--fuel-right-aux');
    const leftAux = leftAuxRaw !== undefined ? Number(leftAuxRaw) : 0;
    const rightAux = rightAuxRaw !== undefined ? Number(rightAuxRaw) : 0;
    const leftTipRaw = getFlag(rest, '--fuel-left-tip');
    const rightTipRaw = getFlag(rest, '--fuel-right-tip');
    const leftTip = leftTipRaw !== undefined ? Number(leftTipRaw) : 0;
    const rightTip = rightTipRaw !== undefined ? Number(rightTipRaw) : 0;
    const stations = getStationFlags(rest);

    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      console.error('apply-auto requires --fuel-left and --fuel-right');
      process.exit(1);
    }
    if (center !== undefined && !Number.isFinite(center)) {
      console.error('--fuel-center must be a number when provided');
      process.exit(1);
    }
    if (!Number.isFinite(leftAux) || !Number.isFinite(rightAux)) {
      console.error('--fuel-left-aux / --fuel-right-aux must be numbers when provided');
      process.exit(1);
    }
    if (!Number.isFinite(leftTip) || !Number.isFinite(rightTip)) {
      console.error('--fuel-left-tip / --fuel-right-tip must be numbers when provided');
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
      const tanks: Record<string, number> = { LEFT_MAIN: left, RIGHT_MAIN: right };
      // Include AUX when the resolved profile declares those tanks (e.g. Starship Aft).
      const tankIds = new Set(resolved.profile.fuel.tanks.map((t) => t.id));
      if (tankIds.has('LEFT_AUX')) tanks.LEFT_AUX = leftAux;
      if (tankIds.has('RIGHT_AUX')) tanks.RIGHT_AUX = rightAux;
      if (tankIds.has('LEFT_TIP')) tanks.LEFT_TIP = leftTip;
      if (tankIds.has('RIGHT_TIP')) tanks.RIGHT_TIP = rightTip;
      if (tankIds.has('CENTER') && center !== undefined) tanks.CENTER = center;

      const plan: LoadPlanRequest = {
        fuel: { tanks },
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

  if (command === 'probe-lvars' || command === 'lvars') {
    const preset = getFlag(rest, '--preset') ?? 'a2a-aerostar';
    const watchRaw = getFlag(rest, '--watch');
    const watchSec = watchRaw !== undefined ? Number(watchRaw || '60') : undefined;
    const extraVars: string[] = [];
    const writes: Array<{ name: string; value: number }> = [];
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--var' && rest[i + 1]) {
        extraVars.push(rest[i + 1]);
        i += 1;
      } else if (rest[i] === '--write' && rest[i + 1]) {
        const [name, valueRaw] = rest[i + 1].split('=');
        const value = Number(valueRaw);
        if (name && Number.isFinite(value)) writes.push({ name, value });
        i += 1;
      }
    }

    const presetNames =
      preset === 'a2a-aerostar' || preset === 'aerostar' || preset === 'a2a'
        ? A2A_AEROSTAR_LVAR_CANDIDATES
        : [];
    const names = [...presetNames, ...extraVars];
    if (names.length === 0) {
      console.error('No LVar names. Use --preset a2a-aerostar and/or --var Name');
      process.exit(1);
    }

    await withBridge(pipeName, async (bridge) => {
      const identity = await bridge.getAircraftIdentity();
      console.log(`Aircraft: ${identity.title}`);
      console.log(`Probing ${names.length} LVars (preset=${preset})…`);

      const readings = await probeLVars(bridge, names);
      const ok = readings.filter((r) => r.ok);
      const failed = readings.filter((r) => !r.ok);
      console.log('');
      console.log('── Readable ──');
      for (const r of ok) {
        console.log(`  ${r.name.padEnd(32)} ${r.value}`);
      }
      if (ok.length === 0) console.log('  (none)');
      console.log('');
      console.log(`── Failed / missing (${failed.length}) ──`);
      for (const r of failed.slice(0, 12)) {
        console.log(`  ${r.name.padEnd(32)} ${r.error}`);
      }
      if (failed.length > 12) console.log(`  … +${failed.length - 12} more`);

      if (writes.length > 0) {
        console.log('');
        console.log('── Write test ──');
        for (const w of writes) {
          const before = await probeLVars(bridge, [w.name]);
          try {
            await bridge.writeLVar({ name: w.name, value: w.value });
            await bridge.delay(400);
          } catch (error) {
            console.log(
              `  ✗ ${w.name} write error: ${error instanceof Error ? error.message : String(error)}`,
            );
            continue;
          }
          const after = await probeLVars(bridge, [w.name]);
          const b = before[0]?.value;
          const a = after[0]?.value;
          const stuck = a !== undefined && b !== undefined && Math.abs(a - b) < 0.05;
          const matched = a !== undefined && Math.abs(a - w.value) <= Math.max(Math.abs(w.value) * 0.05, 0.25);
          console.log(
            `  ${matched ? '✓' : stuck ? '✗ ignored' : '~'} ${w.name}: before=${b} → after=${a} (wanted ${w.value})`,
          );
          // Also show classic mirrors for fuel tanks
          if (/Fuel(Left|Right)WingTank|FuelFuselageTank/i.test(w.name)) {
            const mirrors = [
              'FUEL TANK LEFT MAIN QUANTITY',
              'FUEL TANK RIGHT MAIN QUANTITY',
              'FUEL TANK CENTER QUANTITY',
              'FUEL TOTAL QUANTITY',
            ];
            for (const m of mirrors) {
              try {
                const v = await bridge.readSimVar({ name: m, unit: 'gallons' });
                console.log(`      mirror ${m} = ${v}`);
              } catch {
                /* ignore */
              }
            }
          }
        }
      }

      if (watchSec !== undefined && Number.isFinite(watchSec) && watchSec > 0) {
        console.log('');
        console.log(
          `Watching ${Math.round(watchSec)}s — change fuel/payload on the A2A tablet now…`,
        );
        await watchLVars(bridge, names, {
          durationMs: watchSec * 1000,
          intervalMs: 750,
          onChange: (diff) => {
            const stamp = new Date().toISOString().slice(11, 19);
            for (const r of diff) {
              console.log(`  [${stamp}] ${r.name} → ${r.value}`);
            }
          },
        });
        console.log('Watch done.');
      }
    });
    return;
  }

  if (command === 'probe-pmdg-fuel' || command === 'pmdg-fuel') {
    await withBridge(pipeName, async (bridge) => {
      const identity = await bridge.getAircraftIdentity();
      console.log(`Aircraft: ${identity.title}`);
      console.log('Reading PMDG_NG3_Data Client Data fuel qty…');

      const sdk = await bridge.readPmdgNg3Fuel();
      if (!sdk.available) {
        console.log('available: false');
        if (sdk.nonzeroBytes != null) console.log(`  nonzeroBytes: ${sdk.nonzeroBytes}`);
        console.log(
          'No broadcast received. Set EnableDataBroadcast=1 in 737NG3_Options.ini, reload the NG3 aircraft, then retry.',
        );
        return;
      }

      if (sdk.layoutOk === false) {
        console.log(`available: true  layoutOk=false  ageMs=${sdk.ageMs ?? '?'}  nonzeroBytes=${sdk.nonzeroBytes ?? '?'}`);
        console.log(
          `  raw L/R/C lb: ${sdk.leftLb ?? '?'} / ${sdk.rightLb ?? '?'} / ${sdk.centerLb ?? '?'}`,
        );
        console.log(
          'Broadcast received but fuel qty looks invalid. Confirm EnableDataBroadcast=1 and reload the NG3.',
        );
        return;
      }

      let dens = 6.7;
      try {
        dens = await bridge.readSimVar({ name: 'FUEL WEIGHT PER GALLON', unit: 'pounds' });
        if (!Number.isFinite(dens) || dens < 5 || dens > 8) dens = 6.7;
      } catch {
        /* default Jet-A-ish */
      }

      const toGal = (lb: number | undefined) =>
        lb === undefined ? undefined : lb / dens;

      console.log(
        `available: true  layoutOk=true  offset=${sdk.layoutOffset ?? '?'}  ageMs=${sdk.ageMs ?? '?'}  nonzeroBytes=${sdk.nonzeroBytes ?? '?'}  weightInKgFlag=${sdk.weightInKg ?? '?'}`,
      );
      console.log(
        `  LEFT   ${sdk.leftLb?.toFixed(1)} lb  (~${toGal(sdk.leftLb)?.toFixed(1)} gal)`,
      );
      console.log(
        `  RIGHT  ${sdk.rightLb?.toFixed(1)} lb  (~${toGal(sdk.rightLb)?.toFixed(1)} gal)`,
      );
      console.log(
        `  CENTER ${sdk.centerLb?.toFixed(1)} lb  (~${toGal(sdk.centerLb)?.toFixed(1)} gal)`,
      );
      console.log(`  density used: ${dens.toFixed(3)} lb/gal`);

      try {
        const mirrors = [
          ['LEFT', 'FUEL TANK LEFT MAIN QUANTITY'],
          ['RIGHT', 'FUEL TANK RIGHT MAIN QUANTITY'],
          ['CENTER', 'FUEL TANK CENTER QUANTITY'],
        ] as const;
        console.log('Classic mirrors (gal → lb @ dens):');
        for (const [label, name] of mirrors) {
          const gal = await bridge.readSimVar({ name, unit: 'gallons' });
          console.log(`  ${label.padEnd(6)} ${gal.toFixed(1)} gal  (~${(gal * dens).toFixed(1)} lb)`);
        }
      } catch (error) {
        console.log(
          `  (mirror compare skipped: ${error instanceof Error ? error.message : String(error)})`,
        );
      }
    });
    return;
  }

  if (command === 'probe-payload-stations' || command === 'payload-stations') {
    await withBridge(pipeName, async (bridge) => {
      const identity = await bridge.getAircraftIdentity();
      console.log(`Aircraft: ${identity.title}`);
      console.log('Reading PAYLOAD STATION WEIGHT:1..14 (+ empty/gross)…');

      const snapshot = await bridge.snapshot();
      const stations: Array<{ index: number; lb: number }> = [];
      let total = 0;
      for (let i = 1; i <= 14; i++) {
        const key = `PAYLOAD STATION WEIGHT:${i}`;
        const lb = snapshot.vars?.[key];
        if (lb !== undefined && Number.isFinite(lb)) {
          stations.push({ index: i, lb });
          total += lb;
        }
      }

      const empty = snapshot.vars?.['EMPTY WEIGHT'];
      const gross = snapshot.grossWeightLb ?? snapshot.vars?.['TOTAL WEIGHT'];
      console.log(
        `empty=${empty?.toFixed(0) ?? '?'} lb  gross=${gross?.toFixed(0) ?? '?'} lb  payloadSum=${total.toFixed(1)} lb`,
      );
      console.log('Stations (PMDG 738 SSW TC hint: 1-4 pax zones, 5-6 cargo, 7-8 crew):');
      for (const s of stations) {
        const hint =
          s.index <= 4
            ? 'pax?'
            : s.index <= 6
              ? 'cargo?'
              : s.index <= 8
                ? 'crew?'
                : s.index <= 11
                  ? 'galley/other?'
                  : '';
        console.log(
          `  ${String(s.index).padStart(2)}: ${s.lb.toFixed(1).padStart(10)} lb  ${hint}`,
        );
      }
    });
    return;
  }

  if (command === 'pmdg-cdu') {
    const key = getFlag(rest, '--key');
    const typeText = getFlag(rest, '--type');
    const eventRaw = getFlag(rest, '--event');
    const release = !hasFlag(rest, '--no-release');
    const methodRaw = getFlag(rest, '--method') ?? 'event';
    const method = methodRaw === 'control' ? 'control' : 'event';
    const skipFuel = hasFlag(rest, '--no-fuel');

    if (!key && !typeText && eventRaw === undefined) {
      console.error('pmdg-cdu requires --key, --type, and/or --event');
      usage();
    }

    const keyDelayMs = 200;
    const steps: Array<{ label: string; eventId?: number; key?: string }> = [];

    if (typeText) {
      for (const ch of typeText) {
        if (ch >= '0' && ch <= '9') {
          steps.push({ label: ch, key: ch });
        } else if (ch === '.' || ch === ',') {
          steps.push({ label: '.', key: 'DOT' });
        } else if (ch === '/') {
          steps.push({ label: '/', key: '/' });
        } else if (!/\s/.test(ch)) {
          console.error(`Unsupported CDU char in --type: '${ch}'`);
          process.exit(1);
        }
      }
    }

    if (key) {
      steps.push({ label: key, key });
    }

    if (eventRaw !== undefined) {
      const eventId = Number(eventRaw);
      if (!Number.isFinite(eventId) || eventId < 0) {
        console.error(`Invalid --event: ${eventRaw}`);
        process.exit(1);
      }
      steps.push({ label: `event:${eventId}`, eventId });
    }

    await withBridge(pipeName, async (bridge) => {
      const identity = await bridge.getAircraftIdentity();
      console.log(`Aircraft: ${identity.title}`);
      console.log(
        `Sending ${steps.length} PMDG CDU key(s) method=${method}${release ? ' (+release)' : ''}…`,
      );

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i]!;
        const result = await bridge.sendPmdgNg3Control({
          ...(step.eventId !== undefined ? { eventId: step.eventId } : {}),
          ...(step.key !== undefined ? { key: step.key } : {}),
          release,
          method,
        });
        console.log(
          `  [${i + 1}/${steps.length}] ${step.label} → eventId=${result.eventId} parameter=0x${Number(result.parameter).toString(16)} method=${result.method ?? method}`,
        );
        if (i + 1 < steps.length) {
          await bridge.delay(keyDelayMs);
        }
      }

      if (!skipFuel) {
        console.log('Reading PMDG fuel after CDU sequence…');
        try {
          const sdk = await bridge.readPmdgNg3Fuel();
          if (!sdk.available) {
            console.log('  fuel: available=false');
          } else {
            console.log(
              `  fuel L/R/C lb: ${sdk.leftLb ?? '?'} / ${sdk.rightLb ?? '?'} / ${sdk.centerLb ?? '?'}  layoutOk=${sdk.layoutOk ?? '?'}`,
            );
          }
        } catch (error) {
          console.log(
            `  fuel read failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    });
    return;
  }

  if (command === 'compare-ofp') {
    const locked = hasFlag(rest, '--lock');
    const asJson = hasFlag(rest, '--json');
    const ofp = await resolveOfpFromArgs(rest);
    const { snapshot } = await withBridge(pipeName, (bridge) =>
      compareOnce(bridge, { ofp, locked }),
    );
    if (asJson) {
      console.log(JSON.stringify(snapshot, null, 2));
    } else {
      console.log(formatComplianceSummary(snapshot));
    }
    if (snapshot.verdict === 'fail') {
      process.exitCode = 2;
    } else if (snapshot.verdict === 'warn') {
      process.exitCode = 1;
    }
    return;
  }

  if (command === 'monitor-ofp') {
    const lockedFlag = hasFlag(rest, '--lock');
    const asJson = hasFlag(rest, '--json');
    const intervalSec = getNumberFlag(rest, '--interval') ?? 5;
    const intervalMs = Math.max(1, intervalSec) * 1000;
    const ofp = await resolveOfpFromArgs(rest);

    let baseline: ComplianceBaseline | undefined;
    let previousFuel: LiveFuelState | undefined;
    let previousAtMs: number | undefined;
    let stop = false;

    const onSignal = () => {
      stop = true;
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);

    console.log(
      `Monitoring OFP vs live every ${intervalSec}s (Ctrl+C to stop)${lockedFlag ? ' [lock]' : ''}…`,
    );

    await withBridge(pipeName, async (bridge) => {
      while (!stop) {
        const nowMs = Date.now();
        const { snapshot, live, nextBaseline } = await compareOnce(bridge, {
          ofp,
          locked: lockedFlag,
          baseline,
          previousFuel,
          previousAtMs,
        });

        if (nextBaseline && !baseline) {
          baseline = nextBaseline;
          console.log(`[monitor] baseline captured at ${baseline.capturedAt}`);
        }

        previousFuel = live.fuel;
        previousAtMs = nowMs;

        if (asJson) {
          console.log(JSON.stringify(snapshot));
        } else {
          console.log(`[${snapshot.at}] ${formatComplianceSummary(snapshot)}`);
        }

        await bridge.delay(intervalMs);
      }
    });

    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
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
        const leftAuxCap = profile.fuel.tanks.find((t) => t.id === 'LEFT_AUX')?.capacity;
        const rightAuxCap = profile.fuel.tanks.find((t) => t.id === 'RIGHT_AUX')?.capacity;
        const fuelTanks: Record<string, number> = {
          LEFT_MAIN: leftTarget,
          RIGHT_MAIN: rightTarget,
        };
        if (leftAuxCap !== undefined) {
          fuelTanks.LEFT_AUX = Math.max(0, Math.floor(leftAuxCap * 0.5));
        }
        if (rightAuxCap !== undefined) {
          fuelTanks.RIGHT_AUX = Math.max(0, Math.floor(rightAuxCap * 0.5));
        }

        const stationTargets = buildSmokeStationTargets(profile);
        const payloadTotal = Object.values(stationTargets).reduce((a, b) => a + b, 0);

        const apply = await engine.applyLoadPlan({
          fuel: { tanks: fuelTanks },
          payload: {
            stations: stationTargets,
            total: payloadTotal,
          },
        });

        const after = await bridge.snapshot();
        return {
          ping,
          identity,
          targets: { fuel: fuelTanks, payload: stationTargets },
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
    const centerRaw = getFlag(rest, '--fuel-center');
    const center = centerRaw !== undefined ? Number(centerRaw) : undefined;
    const leftAuxRaw = getFlag(rest, '--fuel-left-aux');
    const rightAuxRaw = getFlag(rest, '--fuel-right-aux');
    const leftAux = leftAuxRaw !== undefined ? Number(leftAuxRaw) : 0;
    const rightAux = rightAuxRaw !== undefined ? Number(rightAuxRaw) : 0;
    if (!profilePath) {
      usage();
    }

    const profile = await loadProfile(profilePath);
    const tanks: Record<string, number> = { LEFT_MAIN: left, RIGHT_MAIN: right };
    const tankIds = new Set(profile.fuel.tanks.map((t) => t.id));
    if (tankIds.has('LEFT_AUX')) tanks.LEFT_AUX = leftAux;
    if (tankIds.has('RIGHT_AUX')) tanks.RIGHT_AUX = rightAux;
    if (tankIds.has('LEFT_TIP')) {
      const leftTip = Number(getFlag(rest, '--fuel-left-tip') ?? '0');
      tanks.LEFT_TIP = leftTip;
    }
    if (tankIds.has('RIGHT_TIP')) {
      const rightTip = Number(getFlag(rest, '--fuel-right-tip') ?? '0');
      tanks.RIGHT_TIP = rightTip;
    }
    if (tankIds.has('CENTER') && center !== undefined) tanks.CENTER = center;

    const result = await withBridge(pipeName, async (bridge) => {
      const engine = new DefaultProfileEngine({ profile, bridge });
      return engine.applyLoadPlan({
        fuel: { tanks },
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
