#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
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
  buildBcfFuelKeySequence,
  dumpClassicFuelLb,
  formatBcfFuelPlan,
  parseBcfFuelCliArgs,
  sendBcfFuelKeySequence,
} from './pmdg-fuel-bcf.js';
import {
  buildBcfPayloadKeySequence,
  buildMenuSmokeSequence,
  dumpPayloadStations,
  formatBcfPayloadPlan,
  parseBcfPayloadCliArgs,
  parseCduSide,
  sendBcfPayloadKeySequence,
} from './pmdg-payload-bcf.js';
import { confirm, withPrompts } from './prompt.js';
import {
  A2A_AEROSTAR_LVAR_CANDIDATES,
  probeLVars,
  watchLVars,
} from './probe-lvars.js';
import { buildOfpExpectation, applyOfpOverrides, loadLiveSourcesFromFile, loadStationRolesFromFile } from './ofp-compliance/parse-ofp.js';
import { compareOnce, formatComplianceSummary } from './ofp-compliance/run-compare.js';
import { fetchSimBriefLatestOfp } from './ofp-compliance/simbrief-fetch.js';
import {
  buildDispatchRedirectUrl,
  cargoWeightToThousands,
  makeStaticId,
  openDispatchInBrowser,
} from './ofp-compliance/simbrief-dispatch.js';
import {
  fetchSimBriefAirframesForIcao,
  resolveSimBriefDispatchType,
  resolveSimBriefMaxCargoKg,
} from './ofp-compliance/simbrief-airframes.js';
import {
  buildRolesPackFromHeuristic,
  loadRolesPackFile,
  matchHeuristic,
  resolveRolesPackForTitle,
  slugFromAircraftTitle,
  writeRolesPack,
  type OfpRolesPackFile,
} from './ofp-compliance/scaffold-roles.js';
import {
  buildRolesPackFromProfile,
  rolesPackPathForProfile,
  upsertRolesPackFromProfile,
} from './ofp-compliance/draft-roles-pack.js';
import {
  DEFAULT_CAREER_ECONOMY_PATH,
  loadOrCreateCareerEconomy,
  saveCareerEconomy,
} from './ofp-compliance/career-economy-store.js';
import {
  DEFAULT_CAREER_MISSIONS_PATH,
  creditWallet,
  findMission,
  loadOrCreateCareerMissions,
  saveCareerMissions,
  upsertMission,
} from './ofp-compliance/career-missions-store.js';
import {
  acceptMission,
  cancelMission,
  compareMissionIntentToOfp,
  createMissionFlightWatchState,
  createSeedEconomyWorld,
  computeEconomyPulse,
  sweepEconomyPulse,
  departMission,
  evaluateMissionFlightTransition,
  findOpenManifestForRoute,
  formatIntentOfpCheck,
  formatMissionSummary,
  formatSettlementSummary,
  getAircraftClass,
  listMarketLots,
  listViableMarketLots,
  parseFreighterClassId,
  pickActiveMission,
  resolveAirportCoords,
  settleMission,
  tickEconomyN,
  TICKS_PER_DAY,
  benchEconomyTicks,
  type CommodityId,
  type ComplianceBaseline,
  type FreighterClassId,
  type LiveFuelState,
  type MissionIntent,
} from '@msfs-compat/shared';

const agentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(agentDir, '..', '..', '..');

function usage(): never {
  console.log(`Usage:
  msfs-compat-agent ping|status|live|probe|probe-lvars|probe-pmdg-fuel|probe-payload-stations|scaffold-ofp-roles|draft-ofp-roles|pmdg-cdu|pmdg-payload-bcf|pmdg-fuel-bcf|generate-ofp|compare-ofp|monitor-ofp|career|writetest [--pipe <name>]
  msfs-compat-agent fingerprint [--register] [--catalog-url <url>] [--pipe <name>]
  msfs-compat-agent sync-catalog [--catalog-url <url>] [--channel stable]
  msfs-compat-agent resolve [--catalog-url <url>] [--pipe <name>]
  msfs-compat-agent apply-auto --fuel-left <n> --fuel-right <n> [--fuel-center <n>] [--fuel-left-tip <n>] [--fuel-right-tip <n>] [--fuel-left-aux <n>] [--fuel-right-aux <n>] [--station i=lbs ...] [--catalog-url <url>] [--pipe <name>]
  msfs-compat-agent draft-profile [--out <dir>] [--fuel-offset <n>] [--calibrate] [--pipe <name>]
  msfs-compat-agent calibrate --profile <path.json> [--flight-model <flight_model.cfg>] [--cg-min <%MAC> --cg-max <%MAC>] [--cg-sweep] [--cg-sweep-lb <n>] [--pipe <name>]
  msfs-compat-agent smoke --profile <path.json> [--pipe <name>]
  msfs-compat-agent apply --profile <path.json> --fuel-left <n> --fuel-right <n> [--fuel-center <n>] [--fuel-left-aux <n>] [--fuel-right-aux <n>] [--pipe <name>]
  msfs-compat-agent homologate [--pipe <name>]
  msfs-compat-agent career-hubs [all|bush|missing|<ICAO>] [--yes] [--force] [--pipe <name>]
  msfs-compat-agent sample-burn [--type typeId] [--pipe <name>]
  msfs-compat-agent career-airframe [wizard]|list|disable|enable|rename|remove|backfill-simbrief-cargo [--type typeId] [--label name] [--keep-files] [--apply]
  msfs-compat-agent career-payload
  msfs-compat-agent probe-lvars [--preset a2a-aerostar] [--var Name ...] [--watch [sec]] [--write Name=value ...] [--pipe <name>]
  msfs-compat-agent probe-pmdg-fuel [--pipe <name>]
  msfs-compat-agent probe-payload-stations [--pipe <name>]
  msfs-compat-agent scaffold-ofp-roles [--write] [--out path.json] [--pipe <name>]
  msfs-compat-agent draft-ofp-roles --profile path.json [--write] [--keep-passengers]
  msfs-compat-agent pmdg-cdu [--key NAME] [--type digits] [--event id] [--method event|control] [--no-release] [--pipe <name>]
  msfs-compat-agent pmdg-payload-bcf [--main n] [--fwd n] [--aft n] [--zfw 89.3 | --zfw-lb n] [--units lb|kg] [--cdu right|left] [--tiny] [--unique-digits] [--only main|fwd|aft] [--method control|event] [--smoke-menu] [--empty-first] [--slow] [--dry-run] [--yes] [--delay-ms n] [--commit-delay-ms n] [--after-empty-ms n] [--pipe <name>]
  msfs-compat-agent pmdg-fuel-bcf [--total 25.0 | --total-lb n | --preset full|2/3|1/3] [--units lb|kg] [--cdu right|left] [--total-lsk L1] [--method control|event] [--smoke-menu] [--slow] [--dry-run] [--yes] [--pipe <name>]
  msfs-compat-agent generate-ofp --orig ICAO --dest ICAO [--type airframeId] [--roles pack.json] [--pax n] [--cargo thousands | --cargo-weight n] [--payload thousands | --payload-weight n] [--units kg|lb] [--simbrief-user ALIAS] [--airline XX] [--fltnum n] [--route …] [--altn ICAO] [--static-id id] [--list-airframes ICAO] [--no-open] [--compare] [--pipe <name>]
  msfs-compat-agent compare-ofp [--simbrief-user ALIAS | --simbrief-userid ID] [--roles path.json] [--ofp path.json] [--block-fuel n] … [--lock] [--json] [--pipe <name>]
  msfs-compat-agent monitor-ofp [--simbrief-user ALIAS | --simbrief-userid ID] [--roles path.json] … [--interval sec] [--lock] [--json] [--pipe <name>]
  msfs-compat-agent career init|tick|market|accept|missions|cancel|dispatch|depart|settle|watch [--save path] [--missions path] [--lot id] [--mission id] [--kg n] [--aircraft class] [--simbrief-user ALIAS] [--n ticks] [--interval sec] [--json]

Notes:
  resolve / apply-auto: fingerprint → catalog API → cache → local examples
  Catalog default: http://localhost:8080/v1 (MSFS_COMPAT_CATALOG_URL)
  Homologation: homologate (wizard) OR draft-profile --calibrate → smoke → promote
  career-hubs: SimConnect Facilities → lat/lon/name for career hubs (all / bush / missing / one ICAO)
  sample-burn: live cruise fuel-flow sample → patch career-player-airframes.json burn
  career-airframe: interactive wizard (or list / disable / enable / rename / remove / backfill-simbrief-cargo) for Market models
  career-payload: SimBrief maxcargo / OEW / MTOW / fuel → career-player-airframes.json (Freights ceiling)
  probe-lvars: read/watch/write Accu-Sim LVars (restart start:local after native rebuild)
  probe-pmdg-fuel: read PMDG_NG3_Data Client Data fuel qty (requires EnableDataBroadcast=1)
  probe-payload-stations: dump PAYLOAD STATION WEIGHT:1..N (homologate pax/cargo roles)
  scaffold-ofp-roles: detect known family from live title and print/write roles pack
  draft-ofp-roles: build/merge roles pack from a homologated profiles/examples JSON (no sim)
  pmdg-cdu: experimental/parked — not the fuel apply path (use SimBrief/EFB; Skyline monitors OFP vs live)
  pmdg-payload-bcf: BCF CDU PAYLOAD validation — prefer --zfw 89.3; default --cdu right (FO, like GSX)
  pmdg-fuel-bcf: BCF CDU FUEL validation — prefer --total 25.0; default --cdu right (FO, like GSX)
  generate-ofp: Dispatch Redirect with homologated SimBrief variant (pack match / live title); fuel AUTO → fetch by static_id
  compare-ofp / monitor-ofp: fetch latest SimBrief OFP; omit --roles to auto-pick pack from aircraft title
  career: local cargo economy + accept/dispatch missions (SimBrief generate-ofp)
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

async function waitForEnter(prompt: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await new Promise<void>((resolveWait) => {
      rl.question(prompt, () => resolveWait());
    });
  } finally {
    rl.close();
  }
}

async function resolveOfpFromArgs(
  args: string[],
  opts: { aircraftTitle?: string } = {},
) {
  const ofpPath = getFlag(args, '--ofp');
  let rolesPath = getFlag(args, '--roles') ?? ofpPath;
  const simbriefUser =
    getFlag(args, '--simbrief-user') ?? process.env.SIMBRIEF_USERNAME ?? undefined;
  const simbriefUserid =
    getFlag(args, '--simbrief-userid') ?? process.env.SIMBRIEF_USERID ?? undefined;
  const fuelUnitRaw = getFlag(args, '--fuel-unit');
  const fuelUnit: 'lb' | 'kg' | undefined =
    fuelUnitRaw === 'kg' ? 'kg' : fuelUnitRaw === 'lb' ? 'lb' : undefined;

  const overrides = {
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
  };

  if (!rolesPath && opts.aircraftTitle) {
    const ofpDir = join(repoRoot, 'profiles', 'ofp');
    const resolved = await resolveRolesPackForTitle(opts.aircraftTitle, ofpDir);
    if (resolved) {
      rolesPath = resolved.path;
      console.log(`Auto roles: ${resolved.via} ← ${opts.aircraftTitle}`);
    } else {
      const heuristic = matchHeuristic(opts.aircraftTitle);
      if (heuristic) {
        console.log(
          `No roles pack on disk for "${opts.aircraftTitle}" (heuristic ${heuristic.id}). Run: npm run scaffold-ofp-roles -- --write`,
        );
      } else {
        console.log(
          `No roles pack matched for "${opts.aircraftTitle}" — payload/pax/bags checks may warn.`,
        );
      }
    }
  }

  const stationRoles = rolesPath ? await loadStationRolesFromFile(rolesPath) : undefined;
  const liveSources = rolesPath ? await loadLiveSourcesFromFile(rolesPath) : undefined;

  if (simbriefUser || simbriefUserid) {
    console.log(
      `Fetching latest SimBrief OFP (${simbriefUserid ? `userid=${simbriefUserid}` : `user=${simbriefUser}`})…`,
    );
    const { expectation, raw } = await fetchSimBriefLatestOfp({
      username: simbriefUser,
      userid: simbriefUserid,
      stationRoles,
    });
    const origin = raw.general
      ? `${raw.aircraft?.icaocode ?? '?'} ${raw.general.icao_airline ?? ''}${raw.general.flight_number ?? ''}`.trim()
      : expectation.ofpId ?? 'simbrief';
    console.log(
      `  OFP: ${origin}  units=${expectation.fuel.unit}  block=${expectation.loadSheet?.blockFuel ?? '?'}  payload=${expectation.loadSheet?.payload ?? '?'}  pax=${expectation.loadSheet?.passengerCount ?? '?'}  bags=${expectation.loadSheet?.baggage ?? '?'}`,
    );
    return applyOfpOverrides(expectation, { ...overrides, stationRoles, liveSources });
  }

  return buildOfpExpectation(ofpPath, { ...overrides, stationRoles, liveSources });
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

  if (command === 'career-hubs' || command === 'homologate-hubs') {
    const { runCareerHubsWizard } = await import('./career-hubs-wizard.js');
    const scopeArg = rest.find((a) => !a.startsWith('--'));
    const yes = hasFlag(rest, '--yes');
    const force = hasFlag(rest, '--force');
    await withBridge(pipeName, async (bridge) =>
      runCareerHubsWizard({
        bridge,
        repoRoot,
        scope: scopeArg,
        yes,
        force,
      }),
    );
    return;
  }

  if (command === 'sample-burn' || command === 'burn-sample') {
    const { runSampleBurnWizard } = await import('./sample-burn-wizard.js');
    await withBridge(pipeName, async (bridge) =>
      runSampleBurnWizard({
        bridge,
        repoRoot,
        typeId: getFlag(rest, '--type'),
      }),
    );
    return;
  }

  if (command === 'career-payload' || command === 'payload-homologate') {
    const { runCareerPayloadWizard } = await import(
      './career-payload-wizard.js'
    );
    await runCareerPayloadWizard({ repoRoot });
    return;
  }

  if (command === 'career-airframe') {
    const sub = rest[0];
    if (
      !sub ||
      sub === 'wizard' ||
      sub === 'help' ||
      sub === '--help'
    ) {
      const { runCareerAirframeWizard } = await import(
        './career-airframe-wizard.js'
      );
      await runCareerAirframeWizard({ repoRoot });
      return;
    }
    const {
      listCareerPlayerAirframeCatalog,
      removeCareerPlayerAirframeFamily,
      setCareerPlayerAirframeEnabled,
      setCareerPlayerAirframeLabel,
      suggestShortMarketLabel,
    } = await import('./career-player-airframe-catalog.js');
    const typeIdFlag = getFlag(rest, '--type');
    const typeIdPositional =
      rest[1] && !rest[1].startsWith('-') ? rest[1] : undefined;
    const typeId = typeIdFlag ?? typeIdPositional;
    if (sub === 'list') {
      const { listFamilyMatchTitles } = await import(
        './career-player-airframe-catalog.js'
      );
      const rows = await listCareerPlayerAirframeCatalog(repoRoot);
      for (const row of rows) {
        const flag = row.enabled === false ? 'disabled' : 'enabled';
        console.log(
          `${flag.padEnd(8)}  ${row.typeId.padEnd(36)}  ${row.aircraftClassId.padEnd(16)}  ${row.label}`,
        );
        const titles = await listFamilyMatchTitles({ repoRoot, row });
        for (const title of titles) {
          console.log(`          · ${title}`);
        }
      }
      if (rows.length === 0) console.log('(no player airframes registered)');
      return;
    }
    if (sub === 'backfill-simbrief-cargo') {
      const {
        backfillSimbriefMaxCargo,
        formatBackfillSimbriefMaxCargoReport,
      } = await import('./backfill-simbrief-max-cargo.js');
      const apply = hasFlag(rest, '--apply');
      const result = await backfillSimbriefMaxCargo({
        repoRoot,
        apply,
        typeId: typeId || undefined,
      });
      console.log(formatBackfillSimbriefMaxCargoReport(result));
      if (!apply && result.wouldUpdate > 0) {
        console.log(
          'Re-run with --apply to write packages/shared/src/data/career-player-airframes.json',
        );
      }
      if (result.errors > 0) process.exitCode = 1;
      return;
    }
    if (sub === 'disable' || sub === 'enable') {
      if (!typeId) {
        console.error(
          `Usage: node packages/agent/dist/cli.js career-airframe ${sub} --type <typeId>`,
        );
        console.error(
          'Or run the wizard: node packages/agent/dist/cli.js career-airframe',
        );
        process.exit(1);
      }
      const row = await setCareerPlayerAirframeEnabled({
        repoRoot,
        typeId,
        enabled: sub === 'enable',
      });
      console.log(
        JSON.stringify(
          {
            typeId: row.typeId,
            label: row.label,
            enabled: row.enabled !== false,
          },
          null,
          2,
        ),
      );
      console.log(
        'Restart career-ui / rebuild @msfs-compat/shared if the Market board does not refresh.',
      );
      return;
    }
    if (sub === 'rename' || sub === 'label') {
      const labelFlag = getFlag(rest, '--label');
      if (!typeId) {
        console.error(
          'Usage: node packages/agent/dist/cli.js career-airframe rename --type <typeId> --label "Learjet 35A"',
        );
        console.error(
          'Or run the wizard: node packages/agent/dist/cli.js career-airframe',
        );
        process.exit(1);
      }
      const rows = await listCareerPlayerAirframeCatalog(repoRoot);
      const current = rows.find((row) => row.typeId === typeId);
      if (!current) {
        console.error(`No Skyline player airframe registered as ${typeId}`);
        process.exit(1);
      }
      const label =
        labelFlag?.trim() || suggestShortMarketLabel(current.label);
      if (!label) {
        console.error('label is required (--label "...")');
        process.exit(1);
      }
      const row = await setCareerPlayerAirframeLabel({
        repoRoot,
        typeId,
        label,
      });
      console.log(
        JSON.stringify(
          {
            typeId: row.typeId,
            label: row.label,
            previousLabel: current.label,
          },
          null,
          2,
        ),
      );
      console.log(
        'Restart career-ui / rebuild @msfs-compat/shared if the Market board does not refresh.',
      );
      return;
    }
    if (sub === 'remove' || sub === 'delete') {
      if (!typeId) {
        console.error(
          'Usage: node packages/agent/dist/cli.js career-airframe remove --type <typeId> [--keep-files]',
        );
        process.exit(1);
      }
      const result = await removeCareerPlayerAirframeFamily({
        repoRoot,
        typeId,
        deleteHomologationFiles: !hasFlag(rest, '--keep-files'),
      });
      console.log(JSON.stringify(result, null, 2));
      console.log(
        'Restart career-ui / rebuild @msfs-compat/shared, then re-run homologate.',
      );
      return;
    }
    console.error(
      'Usage: node packages/agent/dist/cli.js career-airframe [wizard]|list|disable|enable|rename|remove|backfill-simbrief-cargo [--type typeId] [--label name] [--apply]',
    );
    process.exit(1);
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
    const minRaw = getFlag(rest, '--cg-min');
    const maxRaw = getFlag(rest, '--cg-max');
    if ((minRaw === undefined) !== (maxRaw === undefined)) {
      throw new Error('--cg-min and --cg-max must be provided together');
    }
    const minMac = minRaw === undefined ? undefined : Number(minRaw);
    const maxMac = maxRaw === undefined ? undefined : Number(maxRaw);
    if (
      (minMac !== undefined && !Number.isFinite(minMac)) ||
      (maxMac !== undefined && !Number.isFinite(maxMac))
    ) {
      throw new Error('--cg-min and --cg-max must be valid numbers');
    }
    const sweepRaw = getFlag(rest, '--cg-sweep-lb');
    const sweepPayloadLb = sweepRaw === undefined ? undefined : Number(sweepRaw);
    if (sweepPayloadLb !== undefined && (!Number.isFinite(sweepPayloadLb) || sweepPayloadLb <= 0)) {
      throw new Error('--cg-sweep-lb must be a positive number');
    }
    const result = await withBridge(pipeName, async (bridge) =>
      calibrateProfile(bridge, profilePath, {
        flightModelPath: getFlag(rest, '--flight-model'),
        manualEnvelope:
          minMac !== undefined && maxMac !== undefined
            ? { minMac, maxMac }
            : undefined,
        runCgSweep: rest.includes('--cg-sweep'),
        sweepPayloadLb,
      }),
    );
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
      console.log('Reading PAYLOAD STATION WEIGHT:1..20 (+ empty/gross)…');

      const snapshot = await bridge.snapshot();
      const stations: Array<{ index: number; lb: number }> = [];
      let total = 0;
      for (let i = 1; i <= 20; i++) {
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
        `empty=${empty?.toFixed(0) ?? '?'} lb  gross(classic)=${gross?.toFixed(0) ?? '?'} lb  payloadSum=${total.toFixed(1)} lb`,
      );

      const efbNames = ['L:ZFW_Lvar', 'L:GW_Lvar', 'L:LW_Lvar'] as const;
      const efb: Record<string, number> = {};
      for (const name of efbNames) {
        try {
          const v = await bridge.readLVar(name);
          if (Number.isFinite(v) && v >= 1000) {
            efb[name] = v;
          }
        } catch {
          // ignore
        }
      }
      if (Object.keys(efb).length > 0) {
        console.log(
          `PMDG EFB LVars: ZFW=${efb['L:ZFW_Lvar']?.toFixed(0) ?? '?'}  GW=${efb['L:GW_Lvar']?.toFixed(0) ?? '?'}  LW=${efb['L:LW_Lvar']?.toFixed(0) ?? '?'}`,
        );
      }

      console.log('Stations (host snapshot currently defines :1..14; higher may be missing):');
      for (const s of stations) {
        console.log(`  ${String(s.index).padStart(2)}: ${s.lb.toFixed(1).padStart(10)} lb`);
      }
    });
    return;
  }

  if (command === 'draft-ofp-roles') {
    const profilePath = getFlag(rest, '--profile');
    if (!profilePath) {
      console.error('draft-ofp-roles requires --profile path.json');
      usage();
    }
    const doWrite = hasFlag(rest, '--write');
    const cabinAsBaggage = !hasFlag(rest, '--keep-passengers');
    const profile = JSON.parse(
      await readFile(resolve(profilePath), 'utf8'),
    ) as AircraftProfile;
    const ofpDir = join(repoRoot, 'profiles', 'ofp');
    if (!doWrite) {
      const pack = buildRolesPackFromProfile(profile, {
        loadMethod: 'direct-injection',
        injectCapable: true,
        cabinAsBaggage,
      });
      const target = rolesPackPathForProfile(profile, ofpDir);
      console.log(`Would write ${target.path} (via ${target.via})`);
      console.log(JSON.stringify(pack, null, 2));
      console.log('\nDry-run only. Add --write to save.');
      return;
    }
    const result = await upsertRolesPackFromProfile(profile, ofpDir, {
      loadMethod: 'direct-injection',
      injectCapable: true,
      cabinAsBaggage,
    });
    console.log(
      `${result.created ? 'Wrote' : 'Updated'} ${result.path} (${result.via})`,
    );
    console.log(
      `matchTitles: ${(result.pack.matchTitles ?? []).join(' | ')}`,
    );
    return;
  }

  if (command === 'scaffold-ofp-roles') {
    const doWrite = hasFlag(rest, '--write');
    await withBridge(pipeName, async (bridge) => {
      const identity = await bridge.getAircraftIdentity();
      const title = identity.title;
      console.log(`Aircraft: ${title}`);
      const heuristic = matchHeuristic(title);
      if (!heuristic) {
        console.error(
          'No known family heuristic for this title. Map stations manually (see profiles/notes/ofp-homologation.md).',
        );
        process.exitCode = 2;
        return;
      }

      const ofpDir = join(repoRoot, 'profiles', 'ofp');
      const existing = await resolveRolesPackForTitle(title, ofpDir);
      if (existing) {
        console.log(`Already covered: ${existing.via}`);
        console.log(`  pack: ${existing.path}`);
        console.log('Next: Load from Simbrief, then:');
        console.log(`  npm run compare-ofp -- --simbrief-user YOUR_ALIAS`);
        return;
      }

      const pack = buildRolesPackFromHeuristic(title, heuristic);
      const defaultOut = heuristic.familyPackRel
        ? join(ofpDir, heuristic.familyPackRel)
        : join(ofpDir, `${slugFromAircraftTitle(title)}.json`);
      const outPath = resolve(getFlag(rest, '--out') ?? defaultOut);

      console.log(`Heuristic: ${heuristic.id} (icao ${heuristic.icao})`);
      console.log(`Roles: pax=${heuristic.stationRoles.passengerStations?.join(',')} bags=${heuristic.stationRoles.baggageStations?.join(',')} crew=${heuristic.stationRoles.crewStations?.join(',')} service=${heuristic.stationRoles.serviceStations?.join(',')}`);

      if (doWrite) {
        // If writing family pack, merge this title into matchTitles when file exists.
        let toWrite = pack;
        try {
          const prev = JSON.parse(await readFile(outPath, 'utf8')) as {
            matchTitles?: string[];
            payload?: { stationRoles?: unknown };
          };
          const titles = new Set([...(prev.matchTitles ?? []), title]);
          toWrite = {
            ...prev,
            ...pack,
            matchTitles: [...titles],
            payload: pack.payload,
          };
        } catch {
          // new file
        }
        await writeRolesPack(outPath, toWrite);
        console.log(`Wrote ${outPath}`);
      } else {
        console.log(JSON.stringify(pack, null, 2));
        console.log('\nDry-run only. Add --write to save the family/roles pack.');
      }
      console.log('Next: Load from Simbrief, then npm run compare-ofp -- --simbrief-user YOUR_ALIAS');
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
    const cduRaw = getFlag(rest, '--cdu') ?? 'right';
    let cdu: 'left' | 'right';
    try {
      cdu = parseCduSide(cduRaw);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }

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
        `Sending ${steps.length} PMDG CDU key(s) method=${method} cdu=${cdu}${release ? ' (+release)' : ''}…`,
      );

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i]!;
        const result = await bridge.sendPmdgNg3Control({
          ...(step.eventId !== undefined ? { eventId: step.eventId } : {}),
          ...(step.key !== undefined ? { key: step.key } : {}),
          release,
          method,
          cdu,
        });
        console.log(
          `  [${i + 1}/${steps.length}] ${step.label} → eventId=${result.eventId} cdu=${result.cdu ?? cdu} parameter=0x${Number(result.parameter).toString(16)} method=${result.method ?? method}`,
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

  if (command === 'pmdg-payload-bcf') {
    let parsed;
    try {
      parsed = parseBcfPayloadCliArgs(rest);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }

    const {
      dryRun,
      yes,
      smokeMenu,
      main,
      fwd,
      aft,
      units,
      delayMs,
      pageDelayMs,
      afterEmptyDelayMs,
      commitDelayMs,
      afterFieldDelayMs,
      fieldClrCount,
      emptyFirst,
      onlyField,
      zfwDisplay,
      payloadPageLsk,
      mainLsk,
      fwdLsk,
      aftLsk,
      emptyLsk,
      zfwLsk,
      method,
      parameter,
      release,
      cdu,
    } = parsed;
    const opts = {
      main,
      fwd,
      aft,
      units,
      delayMs,
      pageDelayMs,
      afterEmptyDelayMs,
      commitDelayMs,
      afterFieldDelayMs,
      fieldClrCount,
      emptyFirst: smokeMenu ? false : emptyFirst,
      ...(onlyField ? { onlyField } : {}),
      ...(zfwDisplay ? { zfwDisplay } : {}),
      payloadPageLsk,
      mainLsk,
      fwdLsk,
      aftLsk,
      emptyLsk,
      zfwLsk,
      method,
      parameter,
      release,
      cdu,
    };
    const steps = smokeMenu
      ? buildMenuSmokeSequence()
      : buildBcfPayloadKeySequence(opts);
    const planMode = smokeMenu
      ? 'smoke-menu'
      : zfwDisplay
        ? 'zfw'
        : 'payload';
    console.log(formatBcfPayloadPlan(opts, steps, planMode));

    if (dryRun) {
      console.log('\nDry-run only — no keys sent. Drop --dry-run to send.');
      return;
    }

    if (!yes) {
      const ok = await withPrompts((ask) =>
        confirm(
          ask,
          'Send this keystream to the live PMDG CDU? (do not touch the CDU)',
          true,
        ),
      );
      if (!ok) {
        console.log('Aborted.');
        return;
      }
    }

    await withBridge(pipeName, async (bridge) => {
      const identity = await bridge.getAircraftIdentity();
      console.log(`Aircraft: ${identity.title}`);
      console.log(
        `Sending keystream method=${method} cdu=${cdu} parameter=${parameter} release=${release}…`,
      );
      await sendBcfPayloadKeySequence(bridge, steps, opts);
      if (smokeMenu) {
        console.log(
          'Smoke done. Did the FO/right CDU jump to MENU (if cdu=right)? If no: rebuild Host + check --cdu.',
        );
        return;
      }
      console.log('Keystream done. Dumping PAYLOAD STATION WEIGHT:1..11…');
      try {
        const stations = await dumpPayloadStations(bridge, 11);
        let sum = 0;
        for (const s of stations) {
          console.log(`  S${s.index}: ${Math.round(s.lb)} lb`);
          sum += s.lb;
        }
        console.log(`  sum S1–S11: ${Math.round(sum)} lb`);
        if (zfwDisplay) {
          console.log(
            `  typed ZFW display=${zfwDisplay} (~${Math.round(Number(zfwDisplay) * 1000)} ${units}) — check MAIN/FWD/AFT auto-fill on CDU`,
          );
        } else {
          console.log(
            `  typed MAIN+FWD+AFT: ${main + fwd + aft} ${units} (compare CDU page / EFB; stations may redistribute)`,
          );
        }
      } catch (error) {
        console.log(
          `  station dump failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      console.log(
        zfwDisplay
          ? 'Validate: CDU ZFW matches; MAIN/FWD/AFT populated; LOAD LEVEL moved. Report pass/fail.'
          : 'Validate: CDU PAYLOAD shows MAIN/FWD/AFT; EFB ZFW/LOAD LEVEL updated. Report pass/fail.',
      );
    });
    return;
  }

  if (command === 'pmdg-fuel-bcf') {
    let parsed;
    try {
      parsed = parseBcfFuelCliArgs(rest);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }

    const {
      dryRun,
      yes,
      smokeMenu,
      units,
      delayMs,
      pageDelayMs,
      commitDelayMs,
      afterFieldDelayMs,
      fieldClrCount,
      totalDisplay,
      preset,
      fuelPageLsk,
      totalLsk,
      presetFullLsk,
      presetTwoThirdsLsk,
      presetOneThirdLsk,
      method,
      parameter,
      release,
      cdu,
    } = parsed;
    const opts = {
      units,
      delayMs,
      pageDelayMs,
      commitDelayMs,
      afterFieldDelayMs,
      fieldClrCount,
      ...(totalDisplay ? { totalDisplay } : {}),
      ...(preset ? { preset } : {}),
      fuelPageLsk,
      totalLsk,
      presetFullLsk,
      presetTwoThirdsLsk,
      presetOneThirdLsk,
      method,
      parameter,
      release,
      cdu,
    };
    const steps = smokeMenu
      ? buildMenuSmokeSequence()
      : buildBcfFuelKeySequence(opts);
    const planMode = smokeMenu
      ? 'smoke-menu'
      : preset
        ? 'preset'
        : 'total';
    console.log(formatBcfFuelPlan(opts, steps, planMode));

    if (dryRun) {
      console.log('\nDry-run only — no keys sent. Drop --dry-run to send.');
      return;
    }

    if (!yes) {
      const ok = await withPrompts((ask) =>
        confirm(
          ask,
          'Send this keystream to the live PMDG CDU? (do not touch the CDU)',
          true,
        ),
      );
      if (!ok) {
        console.log('Aborted.');
        return;
      }
    }

    await withBridge(pipeName, async (bridge) => {
      const identity = await bridge.getAircraftIdentity();
      console.log(`Aircraft: ${identity.title}`);
      console.log(
        `Sending keystream method=${method} cdu=${cdu} parameter=${parameter} release=${release}…`,
      );
      await sendBcfFuelKeySequence(bridge, steps, opts);
      if (smokeMenu) {
        console.log(
          'Smoke done. Did the FO/right CDU jump to MENU (if cdu=right)? If no: rebuild Host + check --cdu.',
        );
        return;
      }
      console.log('Keystream done. Dumping classic fuel mirrors…');
      try {
        const fuel = await dumpClassicFuelLb(bridge);
        console.log(
          `  L/R/C gal: ${fuel.leftGal.toFixed(1)} / ${fuel.rightGal.toFixed(1)} / ${fuel.centerGal.toFixed(1)}`,
        );
        console.log(
          `  L/R/C lb @ ${fuel.dens.toFixed(2)}: ${fuel.leftLb.toFixed(0)} / ${fuel.rightLb.toFixed(0)} / ${fuel.centerLb.toFixed(0)}  total=${fuel.totalLb.toFixed(0)} lb`,
        );
        if (totalDisplay) {
          const targetLb = Math.round(Number(totalDisplay) * 1000);
          console.log(
            `  typed TOTAL display=${totalDisplay} (~${targetLb} ${units}) — compare CDU TOTAL / EFB`,
          );
        } else if (preset) {
          console.log(`  preset SET ${preset.toUpperCase()} — compare CDU TOTAL / LEVEL`);
        }
        try {
          const sdk = await bridge.readPmdgNg3Fuel();
          if (
            sdk.available &&
            sdk.layoutOk &&
            sdk.leftLb !== undefined &&
            sdk.rightLb !== undefined &&
            sdk.centerLb !== undefined
          ) {
            console.log(
              `  SDK L/R/C lb: ${sdk.leftLb.toFixed(0)} / ${sdk.rightLb.toFixed(0)} / ${sdk.centerLb.toFixed(0)}  total=${(sdk.leftLb + sdk.rightLb + sdk.centerLb).toFixed(0)}`,
            );
          }
        } catch {
          /* optional */
        }
      } catch (error) {
        console.log(
          `  fuel dump failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      console.log(
        totalDisplay
          ? 'Validate: CDU TOTAL ≈ typed display; L/C/R filled; classic/SDK total near target. Report pass/fail.'
          : 'Validate: CDU TOTAL/LEVEL moved for preset. Report pass/fail.',
      );
    });
    return;
  }

  if (command === 'generate-ofp') {
    const listIcao = getFlag(rest, '--list-airframes');
    if (listIcao) {
      const airframes = await fetchSimBriefAirframesForIcao(listIcao);
      if (airframes.length === 0) {
        console.error(`No SimBrief airframes for ${listIcao.toUpperCase()}`);
        process.exit(1);
      }
      console.log(`SimBrief variants for ${listIcao.toUpperCase()}:`);
      for (const a of airframes) {
        console.log(`  ${a.internalId}  pax=${a.passengers}  ${a.comments || a.name}`);
      }
      return;
    }

    const orig = getFlag(rest, '--orig');
    const dest = getFlag(rest, '--dest');
    if (!orig || !dest) {
      console.error('generate-ofp requires --orig and --dest (and a SimBrief variant via --type, --roles, or live aircraft)');
      usage();
    }

    const simbriefUser =
      getFlag(rest, '--simbrief-user') ?? process.env.SIMBRIEF_USERNAME ?? undefined;
    const simbriefUserid =
      getFlag(rest, '--simbrief-userid') ?? process.env.SIMBRIEF_USERID ?? undefined;
    if (!simbriefUser && !simbriefUserid) {
      console.error(
        'generate-ofp requires --simbrief-user (or SIMBRIEF_USERNAME) / --simbrief-userid to fetch after Generate',
      );
      process.exit(1);
    }

    let type = getFlag(rest, '--type');
    let titleHint: string | undefined;
    let rolesPack: OfpRolesPackFile | undefined;
    const rolesPathFlag = getFlag(rest, '--roles');

    if (rolesPathFlag) {
      rolesPack = await loadRolesPackFile(rolesPathFlag);
      console.log(`Roles pack: ${rolesPathFlag}`);
    }

    if (!type || !rolesPack) {
      try {
        await withBridge(pipeName, async (bridge) => {
          titleHint = (await bridge.getAircraftIdentity()).title;
          if (!rolesPack) {
            const ofpDir = join(repoRoot, 'profiles', 'ofp');
            const resolved = await resolveRolesPackForTitle(titleHint, ofpDir);
            if (resolved) {
              rolesPack = resolved.pack;
              console.log(`Auto roles: ${resolved.via} ← ${titleHint}`);
            } else {
              console.log(`No roles pack matched for "${titleHint}".`);
            }
          } else {
            console.log(`Live title: ${titleHint}`);
          }
        });
      } catch (error) {
        if (!type && !rolesPack?.simbriefAirframeMatch) {
          console.error(
            `Could not read live aircraft (${error instanceof Error ? error.message : String(error)}).`,
          );
          console.error(
            'Without MSFS/SimBridge, pass a roles pack or explicit type, e.g.:',
          );
          console.error(
            '  npm run generate-ofp -- --orig SBGR --dest SBGL --pax 156 --roles profiles/ofp/pmdg-738-pax.json --simbrief-user YOUR_ALIAS',
          );
          console.error(
            '  npm run generate-ofp -- --orig SBGR --dest SBGL --pax 156 --type 746599_1761165451022 --simbrief-user YOUR_ALIAS',
          );
          console.error('Or start the sim host: npm run start:local');
          process.exit(1);
        }
        console.log(
          `Live aircraft unavailable — resolving variant from pack/flags only (${error instanceof Error ? error.message : String(error)}).`,
        );
      }
    }

    if (!type) {
      const simbriefIcao = rolesPack?.simbriefIcao ?? rolesPack?.icao;
      const match = rolesPack?.simbriefAirframeMatch;
      if (!simbriefIcao || !match) {
        console.error(
          'No SimBrief variant: pass --type <internalId|ICAO>, or use a roles pack with simbriefIcao + simbriefAirframeMatch (or spawn a homologated aircraft).',
        );
        console.error('Tip: npm run generate-ofp -- --list-airframes B738');
        process.exit(1);
      }
      console.log(`Resolving SimBrief variant: icao=${simbriefIcao} match=/${match}/`);
      const resolved = await resolveSimBriefDispatchType({
        simbriefIcao,
        simbriefAirframeMatch: match,
        titleHint,
      });
      type = resolved.type;
      console.log(
        `SimBrief type=${type}  (${resolved.airframe.comments || resolved.airframe.name}, pax=${resolved.airframe.passengers})`,
      );
    } else {
      console.log(`SimBrief type=${type} (--type override)`);
    }

    const unitsRaw = (getFlag(rest, '--units') ?? 'kg').toLowerCase();
    const units = unitsRaw === 'lb' || unitsRaw === 'lbs' ? 'LBS' : 'KGS';
    const pax = getNumberFlag(rest, '--pax') ?? getNumberFlag(rest, '--passengers');
    const cargoThousands = getNumberFlag(rest, '--cargo');
    const cargoWeight = getNumberFlag(rest, '--cargo-weight');
    const cargo =
      cargoThousands !== undefined
        ? cargoThousands
        : cargoWeight !== undefined
          ? cargoWeightToThousands(cargoWeight)
          : undefined;
    const payloadThousands = getNumberFlag(rest, '--payload');
    const payloadWeight = getNumberFlag(rest, '--payload-weight');
    const manualPayload =
      payloadThousands !== undefined
        ? payloadThousands
        : payloadWeight !== undefined
          ? cargoWeightToThousands(payloadWeight)
          : undefined;

    const staticId = getFlag(rest, '--static-id') ?? makeStaticId();
    const url = buildDispatchRedirectUrl({
      type,
      orig,
      dest,
      pax,
      cargo,
      manualPayload,
      units,
      staticId,
      airline: getFlag(rest, '--airline'),
      fltnum: getFlag(rest, '--fltnum'),
      route: getFlag(rest, '--route'),
      altn: getFlag(rest, '--altn'),
      reg: getFlag(rest, '--reg'),
      callsign: getFlag(rest, '--callsign'),
    });

    console.log(`static_id=${staticId}`);
    console.log(`Dispatch URL:\n  ${url}`);
    if (pax === undefined && cargo === undefined) {
      console.log(
        'Note: pax/cargo omitted — SimBrief may AUTO-load. Freighter: pass --pax 0 --cargo <thousands>.',
      );
    }
    console.log('Fuel planning left to SimBrief AUTO (not sent).');

    if (!hasFlag(rest, '--no-open')) {
      openDispatchInBrowser(url);
      console.log('Opened SimBrief Dispatch in your browser.');
    } else {
      console.log('Skipped browser open (--no-open).');
    }

    await waitForEnter(
      'After you click Generate on SimBrief and the OFP is ready, press Enter to fetch… ',
    );

    console.log(
      `Fetching OFP (${simbriefUserid ? `userid=${simbriefUserid}` : `user=${simbriefUser}`}, static_id=${staticId})…`,
    );
    const { expectation, raw } = await fetchSimBriefLatestOfp({
      username: simbriefUser,
      userid: simbriefUserid,
      staticId,
    });

    const origin = raw.general
      ? `${raw.aircraft?.icaocode ?? type} ${raw.general.icao_airline ?? ''}${raw.general.flight_number ?? ''}`.trim()
      : expectation.ofpId ?? 'simbrief';
    console.log(
      `OFP ready: ${origin}  units=${expectation.fuel.unit}  block=${expectation.loadSheet?.blockFuel ?? '?'}  burn=${expectation.loadSheet?.enrouteBurn ?? '?'}  payload=${expectation.loadSheet?.payload ?? '?'}  pax=${expectation.loadSheet?.passengerCount ?? '?'}  bags=${expectation.loadSheet?.baggage ?? '?'}  zfw=${expectation.loadSheet?.zfw ?? '?'}`,
    );

    if (hasFlag(rest, '--compare')) {
      const locked = hasFlag(rest, '--lock');
      const asJson = hasFlag(rest, '--json');
      const { snapshot } = await withBridge(pipeName, async (bridge) => {
        const title = (await bridge.getAircraftIdentity()).title;
        const ofpDir = join(repoRoot, 'profiles', 'ofp');
        const resolved = await resolveRolesPackForTitle(title, ofpDir);
        let ofp = expectation;
        if (resolved) {
          console.log(`Auto roles: ${resolved.via} ← ${title}`);
          const stationRoles = await loadStationRolesFromFile(resolved.path);
          const liveSources = await loadLiveSourcesFromFile(resolved.path);
          ofp = applyOfpOverrides(expectation, { stationRoles, liveSources });
        } else if (rolesPack) {
          ofp = applyOfpOverrides(expectation, {
            stationRoles: rolesPack.payload?.stationRoles,
            liveSources: rolesPack.liveSources,
          });
        } else {
          console.log(`No roles pack matched for "${title}" — payload/pax/bags checks may warn.`);
        }
        return compareOnce(bridge, { ofp, locked });
      });
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
    } else {
      console.log(
        'Next: Load from SimBrief in the EFB, then: npm run compare-ofp -- --simbrief-user YOUR_ALIAS',
      );
    }
    return;
  }

  if (command === 'career') {
    const sub = rest[0];
    const subArgs = rest.slice(1);
    const saveRel =
      getFlag(subArgs, '--save') ?? join(repoRoot, DEFAULT_CAREER_ECONOMY_PATH);
    const savePath = resolve(saveRel);
    const missionsRel =
      getFlag(subArgs, '--missions') ?? join(repoRoot, DEFAULT_CAREER_MISSIONS_PATH);
    const missionsPath = resolve(missionsRel);
    const asJson = hasFlag(subArgs, '--json');

    if (!sub || sub === 'help' || sub === '--help') {
      console.log(`career commands:
  career init [--save path] [--seed s] [--reset]
  career tick [--n 24] [--save path]
  career tick --bench [--seed s] [--skip-warm] [--json]
  career pulse [--save path] [--json]
  career pulse --days 7 [--every-days 1] [--write] [--out path] [--save path] [--json]
  career pulse --ticks 672 [--every 96] [--write] [--out path] [--save path] [--json]
  career market [--origin ICAO] [--dest ICAO] [--commodity id] [--aircraft narrow_freighter|wide_freighter|medium_piston|light_jet|light_turboprop|light_ga] [--save path] [--json]
  career accept --lot <id> [--kg n] [--aircraft narrow_freighter|wide_freighter|medium_piston|light_jet|light_turboprop|light_ga] [--save path] [--missions path] [--json]
  career missions [--missions path] [--json]
  career cancel --mission <id> [--save path] [--missions path]
  career dispatch --mission <id> [--simbrief-user ALIAS] [--no-open] [--compare] [--missions path] [--save path]
  career depart --mission <id> [--save path] [--missions path]
  career settle --mission <id> [--save path] [--missions path] [--json]
  career watch [--mission id] [--interval 5] [--settle-on-touchdown] [--allow-any-airport] [--radius-nm 12] [--no-depart] [--no-settle] [--save path] [--missions path] [--pipe name]
`);
      return;
    }

    if (sub === 'init') {
      const fresh = createSeedEconomyWorld({ seed: getFlag(subArgs, '--seed') });
      await saveCareerEconomy(savePath, fresh);
      console.log(
        `Career economy initialized: ${savePath}  seed=${fresh.seed}  airports=${fresh.airports.length}  tick=${fresh.tick}`,
      );
      return;
    }

    if (sub === 'tick') {
      if (hasFlag(subArgs, '--bench')) {
        const report = benchEconomyTicks({
          seed: getFlag(subArgs, '--seed'),
          skipWarm: hasFlag(subArgs, '--skip-warm'),
        });
        if (asJson) {
          console.log(JSON.stringify(report, null, 2));
          return;
        }
        const fmt = (ms: number) => `${(ms / 1000).toFixed(2)}s`;
        const pct = (part: number, total: number) =>
          total <= 0 ? '0%' : `${((100 * part) / total).toFixed(1)}%`;
        console.log(
          `Economy tick bench  seed=${report.seed}  airports=${report.airports}  countries=${report.countries}  regions=${report.regions}  npcs=${report.npcs}`,
        );
        console.log(
          `  warmTick=${report.warmTick}  lotsAfterWarm=${report.availableLotsAfterWarm}  lotsAfterDay=${report.availableLotsAfterDay}  npcInFlight=${report.npcFlightsInFlightAfterDay}`,
        );
        for (const [label, profile] of [
          ['oneTick', report.oneTick],
          ['oneDay', report.oneDay],
        ] as const) {
          const total = profile.ms.total;
          console.log(
            `  ${label}  ticks=${profile.ticks}  total=${fmt(total)}  avg=${(total / Math.max(1, profile.ticks)).toFixed(0)}ms/tick`,
          );
          for (const phase of [
            'npc',
            'formLots',
            'production',
            'fuel',
            'settle',
            'expire',
            'escalate',
            'events',
            'hubLevels',
            'portRestock',
            'ensure',
          ] as const) {
            const ms = profile.ms[phase];
            if (ms < 1) continue;
            console.log(
              `    ${phase.padEnd(12)} ${fmt(ms).padStart(8)}  ${pct(ms, total)}`,
            );
          }
        }
        return;
      }
      const world = await loadOrCreateCareerEconomy(savePath, {
        seed: getFlag(subArgs, '--seed'),
      });
      const n = getNumberFlag(subArgs, '--n') ?? 1;
      const beforeLots = world.lots.filter((l) => l.status === 'available').length;
      tickEconomyN(world, n);
      await saveCareerEconomy(savePath, world);
      const afterLots = world.lots.filter((l) => l.status === 'available').length;
      console.log(
        `tick=${world.tick} (+${n})  availableLots=${afterLots} (was ${beforeLots})  saved=${savePath}`,
      );
      return;
    }

    if (sub === 'pulse') {
      const world = await loadOrCreateCareerEconomy(savePath, {
        seed: getFlag(subArgs, '--seed'),
      });
      const days = getNumberFlag(subArgs, '--days');
      const ticksFlag = getNumberFlag(subArgs, '--ticks');
      const everyDays = getNumberFlag(subArgs, '--every-days');
      const everyTicks = getNumberFlag(subArgs, '--every');
      const doSweep =
        days !== undefined ||
        ticksFlag !== undefined ||
        everyDays !== undefined ||
        everyTicks !== undefined ||
        hasFlag(subArgs, '--sweep');

      const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
      const money = (n: number | null) =>
        n === null ? '—' : `$${n.toFixed(2)}/kg`;
      const pay = (n: number | null) =>
        n === null ? '—' : `$${Math.round(n).toLocaleString('en-US')}`;
      const fill = (n: number | null) => (n === null ? '—' : pct(n));

      if (!doSweep) {
        const pulse = computeEconomyPulse(world);
        if (asJson) {
          console.log(JSON.stringify(pulse, null, 2));
          return;
        }
        console.log(
          `Economy pulse  tick=${pulse.tick}  lots=${pulse.availableLots} available  hubs=${pulse.airportCount}  home=${pulse.homeCountryId ?? '—'}  intl=${pct(pulse.intlSharePct)}`,
        );
        console.log(
          `  board pay  p50=${pay(pulse.payUsdP50)}  avg=${pay(pulse.payUsdAvg)}`,
        );
        const st = pulse.lotStatus;
        console.log(
          `  lot status  avail=${st.available}  reserved=${st.reserved}  transit=${st.in_transit}  expired=${st.expired}  delivered=${st.delivered}${st.other ? `  other=${st.other}` : ''}`,
        );
        console.log('  commodities:');
        for (const c of pulse.commodities) {
          console.log(
            `    ${c.commodityId.padEnd(12)} lots=${String(c.availableLots).padStart(3)}  fill p50=${fill(c.fillP50).padStart(4)}  pay p50=${pay(c.payUsdP50).padStart(8)}  net p50=${pay(c.netPayUsdP50).padStart(8)}  fuel p50=${pay(c.fuelCostUsdP50).padStart(7)}  margin=${fill(c.marginPctP50).padStart(4)}  surplus=${c.hubsSurplus}  shortage=${c.hubsShortage}`,
          );
        }
        for (const c of pulse.countries) {
          if (c.countryId === 'INTL') {
            console.log(
              `  INTL  avail=${c.availableLots}  pay/kg p50=${money(c.payPerKgP50)}  lane busy=${pct(c.laneBusyPct)}`,
            );
            continue;
          }
          console.log(
            `  ${c.countryId.padEnd(4)} hubs=${String(c.hubs).padStart(3)}  avail=${String(c.availableLots).padStart(3)}  live=${pct(c.liveHubPct).padStart(4)}  fill p50=${fill(c.fillP50).padStart(4)}  pay/kg p50=${money(c.payPerKgP50)}  lane busy=${pct(c.laneBusyPct)}  dead=${c.deadHubs} quiet=${c.quietHubs}`,
          );
          if (c.deadHubIcaos.length > 0 && c.deadHubs > 0) {
            const more =
              c.deadHubs > c.deadHubIcaos.length
                ? ` +${c.deadHubs - c.deadHubIcaos.length}`
                : '';
            console.log(`         dead: ${c.deadHubIcaos.join(' ')}${more}`);
          }
        }
        const npc = pulse.npc;
        const kg = (n: number) =>
          `${Math.round(n).toLocaleString('en-US')}kg`;
        console.log(
          `  npc fleet  ${npc.fleetSize}/${npc.targetFleetSize}${npc.fleetShortfall > 0 ? ` (short ${npc.fleetShortfall})` : ''}  ready=${npc.ready} (${pct(npc.readyPct)})  airborne=${npc.airborne} (${pct(npc.utilizationPct)})  idle=${npc.idle}  rest=${npc.resting}  mx=${npc.maintenance}  turn=${npc.turnaround}  aloft=${kg(npc.cargoKgAirborne)}`,
        );
        console.log(
          `  npc regions  thin=${npc.thinRegions}/${npc.hubRegionCount}  empty home=${npc.emptyHomeRegions}`,
        );
        if (npc.byClass.length > 0) {
          console.log(
            `  npc classes  ${npc.byClass
              .map(
                (c) =>
                  `${c.aircraftClassId} ${c.total}/${c.target} air=${c.airborne}`,
              )
              .join('  ')}`,
          );
        }
        const thinOrEmpty = npc.byRegion.filter(
          (r) => r.total === 0 || r.thinFleet,
        );
        if (thinOrEmpty.length > 0) {
          console.log(
            `  npc thin/empty  ${thinOrEmpty
              .slice(0, 12)
              .map(
                (r) =>
                  r.total === 0
                    ? `${r.region}=0`
                    : `${r.region} ready=${r.ready}/${r.total}`,
              )
              .join('  ')}${thinOrEmpty.length > 12 ? `  +${thinOrEmpty.length - 12}` : ''}`,
          );
        }
        if (pulse.notes.length > 0) {
          console.log('  notes:');
          for (const note of pulse.notes) {
            console.log(`    · ${note}`);
          }
        }
        return;
      }

      const ticks = ticksFlag ?? Math.round((days ?? 7) * TICKS_PER_DAY);
      const every = everyTicks ?? Math.round((everyDays ?? 1) * TICKS_PER_DAY);
      const write = hasFlag(subArgs, '--write');
      const report = sweepEconomyPulse(world, { ticks, every });
      if (write) {
        await saveCareerEconomy(savePath, world);
      }
      const reportPath = resolve(
        getFlag(subArgs, '--out') ??
          join(dirname(savePath), 'economy-pulse-sweep.json'),
      );
      await writeFile(
        reportPath,
        `${JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            economySave: savePath,
            wroteEconomy: write,
            ...report,
          },
          null,
          2,
        )}\n`,
        'utf8',
      );
      console.error(`Wrote pulse sweep report → ${reportPath}`);
      if (asJson) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }
      const pctDelta = (n: number) => {
        const pts = n * 100;
        const sign = pts > 0 ? '+' : '';
        return `${sign}${pts.toFixed(1)}pt`;
      };
      const payDelta = (n: number | null) => {
        if (n === null) return '—';
        const sign = n > 0 ? '+' : '';
        return `${sign}$${Math.round(n).toLocaleString('en-US')}`;
      };
      const fillDelta = (n: number | null) => {
        if (n === null) return '—';
        const pts = n * 100;
        const sign = pts > 0 ? '+' : '';
        return `${sign}${pts.toFixed(1)}pt`;
      };
      const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
      const daysAdvanced = report.ticksAdvanced / TICKS_PER_DAY;
      console.log(
        `Economy sweep  ${daysAdvanced.toFixed(1)}d (${report.ticksAdvanced} ticks)  every ${report.sampleEvery} ticks  samples=${report.sampleCount}  tick ${report.startTick}→${report.endTick}${write ? `  wrote=${savePath}` : '  (economy memory only — pass --write to save)'}`,
      );
      console.log(`  report  ${reportPath}  (overwrites)`);
      console.log(
        `  board lots  ${report.first.availableLots} → ${report.last.availableLots} (${signed(report.delta.availableLots)})`,
      );
      console.log(
        `  board pay   p50 ${pay(report.first.payUsdP50)} → ${pay(report.last.payUsdP50)} (${payDelta(report.delta.payUsdP50)})   avg ${pay(report.first.payUsdAvg)} → ${pay(report.last.payUsdAvg)} (${payDelta(report.delta.payUsdAvg)})`,
      );
      console.log(
        `  intl share  ${pct(report.first.intlSharePct)} → ${pct(report.last.intlSharePct)} (${pctDelta(report.delta.intlSharePct)})`,
      );
      const st0 = report.first.lotStatus;
      const st1 = report.last.lotStatus;
      const dSt = report.delta.lotStatus;
      console.log(
        `  lot status  avail ${st0.available}→${st1.available} (${signed(dSt.available)})  reserved ${st0.reserved}→${st1.reserved} (${signed(dSt.reserved)})  transit ${st0.in_transit}→${st1.in_transit} (${signed(dSt.in_transit)})  expired ${st0.expired}→${st1.expired} (${signed(dSt.expired)})`,
      );
      console.log('  commodities (start → end / Δ):');
      for (let i = 0; i < report.last.commodities.length; i++) {
        const a = report.first.commodities[i]!;
        const b = report.last.commodities[i]!;
        const d = report.delta.commodities[i]!;
        console.log(
          `    ${b.commodityId.padEnd(12)} lots ${String(a.availableLots).padStart(4)}→${String(b.availableLots).padStart(4)} (${signed(d.availableLots).padStart(5)})  pay p50 ${pay(a.payUsdP50)}→${pay(b.payUsdP50)} (${payDelta(d.payUsdP50)})  net p50 ${pay(a.netPayUsdP50)}→${pay(b.netPayUsdP50)} (${payDelta(d.netPayUsdP50)})  margin ${fill(a.marginPctP50)}→${fill(b.marginPctP50)} (${fillDelta(d.marginPctP50)})  fill ${fill(a.fillP50)}→${fill(b.fillP50)} (${fillDelta(d.fillP50)})`,
        );
      }
      {
        const tPerDay = (n: number) =>
          `${(n / 1000).toFixed(1).padStart(6)}t`;
        console.log('  warehouse / career day (produced − consumed = net):');
        for (let i = 0; i < report.last.commodities.length; i++) {
          const b = report.last.commodities[i]!;
          const d = report.delta.commodities[i]!;
          const net = d.netWarehouseKgPerDay;
          const trend = net > 0 ? '↑fill' : net < 0 ? '↓fill' : 'flat';
          console.log(
            `    ${b.commodityId.padEnd(12)} prod ${tPerDay(d.producedKgPerDay)}  cons ${tPerDay(d.consumedKgPerDay)}  net ${tPerDay(net)} ${trend}  fill p10/p50/p90 ${fill(b.fillP10)}/${fill(b.fillP50)}/${fill(b.fillP90)}  surplus/shortage ${b.hubsSurplus}/${b.hubsShortage} of ${b.hubCount}`,
          );
        }
      }
      {
        const a = report.first.npc;
        const b = report.last.npc;
        const d = report.delta.npc;
        const kg = (n: number) =>
          `${Math.round(n).toLocaleString('en-US')}kg`;
        console.log(
          `  npc  fleet ${a.fleetSize}→${b.fleetSize} (${signed(d.fleetSize)})  airborne ${a.airborne}→${b.airborne} (${signed(d.airborne)})  ready ${pct(a.readyPct)}→${pct(b.readyPct)} (${pctDelta(d.readyPct)})  util ${pct(a.utilizationPct)}→${pct(b.utilizationPct)} (${pctDelta(d.utilizationPct)})  thin ${a.thinRegions}→${b.thinRegions}  empty ${a.emptyHomeRegions}→${b.emptyHomeRegions}  aloft ${kg(a.cargoKgAirborne)}→${kg(b.cargoKgAirborne)}`,
        );
        console.log(
          `  npc  states (end)  airborne ${b.airborne}  crew-hold ${b.awaitingPilot}  turnaround ${b.turnaround}  resting ${b.resting}  mx ${b.maintenance}  ready ${b.ready}`,
        );
      }
      {
        const f = report.delta.flowPerDay;
        const t = (n: number) => `${Math.round(n).toLocaleString('en-US')}`;
        const tons = (n: number) =>
          `${Math.round(n / 1000).toLocaleString('en-US')}t`;
        const share = (n: number | null) =>
          n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`;
        console.log('  flow / career day:');
        console.log(
          `    lots    formed ${t(f.formedLots)}  claimed ${t(f.claimedLots)}  delivered ${t(f.deliveredLots)}  expired ${t(f.expiredLots)}  recycled ${t(f.recycledLots)}`,
        );
        console.log(
          `    mass    formed ${tons(f.formedKg)}  claimed ${tons(f.claimedKg)}  delivered ${tons(f.deliveredKg)}  expired ${tons(f.expiredKg)}`,
        );
        console.log(
          `    ratios  claim share ${share(f.claimShare)}  expired:delivered ${
            f.expiredPerDelivered === null
              ? 'n/a'
              : `${f.expiredPerDelivered.toFixed(1)}:1`
          }  GA-LTL formed ${share(f.gaLtlShare)}`,
        );
      }
      if (report.samples.length > 2) {
        console.log('  samples:');
        for (const s of report.samples) {
          const n = s.pulse.npc;
          console.log(
            `    #${s.sampleIndex} tick=${s.atTick}  lots=${s.pulse.availableLots}  pay p50=${pay(s.pulse.payUsdP50)}  avg=${pay(s.pulse.payUsdAvg)}  intl=${pct(s.pulse.intlSharePct)}  npc air=${n.airborne} ready=${pct(n.readyPct)} thin=${n.thinRegions}`,
          );
        }
      }
      if (report.delta.pressureSeries.length > 2) {
        // fill p50 and surplus:shortage per commodity across the sweep — the
        // series that tells whether a shelf is drifting to saturation.
        console.log('  pressure series (fill p50 · surplus:shortage):');
        const ids = report.last.commodities.map((c) => c.commodityId);
        for (const id of ids) {
          const cells = report.delta.pressureSeries.map((p) => {
            const c = p.commodities.find((x) => x.commodityId === id);
            if (!c) return '·';
            const f =
              c.fillP50 === null ? '--' : `${Math.round(c.fillP50 * 100)}`;
            return `${f.padStart(3)}%${String(c.hubsSurplus).padStart(3)}:${String(
              c.hubsShortage,
            ).padStart(2)}`;
          });
          console.log(`    ${id.padEnd(12)} ${cells.join(' ')}`);
        }
      }
      if (report.last.notes.length > 0) {
        console.log('  notes (end):');
        for (const note of report.last.notes) {
          console.log(`    · ${note}`);
        }
      }
      return;
    }

    if (sub === 'market') {
      const world = await loadOrCreateCareerEconomy(savePath, {
        seed: getFlag(subArgs, '--seed'),
      });
      const commodityRaw = getFlag(subArgs, '--commodity');
      const commodityId = commodityRaw as CommodityId | undefined;
      if (
        commodityId &&
        !['electronics', 'perishables', 'machinery', 'general'].includes(commodityId)
      ) {
        console.error(`Unknown commodity: ${commodityRaw}`);
        process.exit(1);
      }
      const aircraftRaw = getFlag(subArgs, '--aircraft');
      const aircraftClassId = parseFreighterClassId(aircraftRaw);
      if (aircraftRaw && !aircraftClassId) {
        console.error(
          `Unknown aircraft class: ${aircraftRaw} (use narrow_freighter|wide_freighter|medium_piston|light_jet|light_turboprop|light_ga)`,
        );
        process.exit(1);
      }
      const filter = {
        originIcao: getFlag(subArgs, '--origin'),
        destIcao: getFlag(subArgs, '--dest'),
        commodityId,
      };
      let maxCargoKg: number | undefined;
      let maxCargoNote = '';
      if (aircraftClassId) {
        const aircraft = getAircraftClass(aircraftClassId);
        try {
          const limit = await resolveSimBriefMaxCargoKg({
            simbriefIcao: aircraft.simbriefIcao,
            simbriefAirframeMatch: aircraft.simbriefAirframeMatch,
            titleHint: aircraft.name,
          });
          maxCargoKg = limit.maxCargoKg;
          maxCargoNote = `  simbriefMax=${maxCargoKg}kg (${limit.source})`;
        } catch {
          maxCargoKg = aircraft.maxCargoKg;
          maxCargoNote = `  classMax=${maxCargoKg}kg (simbrief unreachable)`;
        }
      }
      const market = aircraftClassId
        ? listViableMarketLots(world, aircraftClassId, { ...filter, maxCargoKg })
        : listMarketLots(world, filter);
      if (asJson) {
        console.log(
          JSON.stringify(
            { tick: world.tick, aircraftClassId, maxCargoKg: maxCargoKg ?? null, lots: market },
            null,
            2,
          ),
        );
        return;
      }
      console.log(
        `Career market tick=${world.tick}  lots=${market.length}` +
          (aircraftClassId ? `  aircraft=${aircraftClassId}` : '') +
          maxCargoNote +
          `  (${savePath})`,
      );
      for (const row of market.slice(0, 30)) {
        const urgent = row.lot.urgency === 'urgent' ? ' URGENT' : '';
        console.log(
          `  ${row.lot.id}  ${row.lot.originIcao}→${row.lot.destIcao}  ${row.commodityName}  ${(row.availableKg / 1000).toFixed(1)}t  pay=$${row.lot.payUsd.toLocaleString()}${urgent}`,
        );
        console.log(`    ${row.lot.reason}`);
      }
      if (market.length > 30) {
        console.log(`  … ${market.length - 30} more`);
      }
      return;
    }

    if (sub === 'accept') {
      const lotId = getFlag(subArgs, '--lot');
      if (!lotId) {
        console.error('career accept requires --lot <id> (from career market)');
        process.exit(1);
      }
      const aircraftRaw = getFlag(subArgs, '--aircraft') ?? 'narrow_freighter';
      const aircraftClassId = parseFreighterClassId(aircraftRaw) as FreighterClassId | undefined;
      if (!aircraftClassId) {
        console.error(
          `Unknown aircraft class: ${aircraftRaw} (use narrow_freighter|wide_freighter|medium_piston|light_jet|light_turboprop|light_ga)`,
        );
        process.exit(1);
      }
      const world = await loadOrCreateCareerEconomy(savePath);
      const missions = await loadOrCreateCareerMissions(missionsPath);
      const lot = world.lots.find((l) => l.id === lotId);
      if (!lot) {
        console.error(`Unknown lot: ${lotId}`);
        process.exit(1);
      }
      const aircraft = getAircraftClass(aircraftClassId);
      let maxCargoKg = aircraft.maxCargoKg;
      try {
        const limit = await resolveSimBriefMaxCargoKg({
          simbriefIcao: aircraft.simbriefIcao,
          simbriefAirframeMatch: aircraft.simbriefAirframeMatch,
          titleHint: aircraft.name,
        });
        maxCargoKg = limit.maxCargoKg;
        if (!asJson) {
          console.log(
            `SimBrief cargo limit: ${maxCargoKg} kg (${limit.source}) · ${limit.airframe.comments || limit.airframe.name}`,
          );
        }
      } catch (error) {
        if (!asJson) {
          console.log(
            `Using class cargo limit ${maxCargoKg} kg (SimBrief airframes unavailable: ${
              error instanceof Error ? error.message : String(error)
            })`,
          );
        }
      }
      const intoFlag = getFlag(subArgs, '--mission');
      let intoMission = intoFlag ? findMission(missions, intoFlag) : undefined;
      if (intoFlag && !intoMission) {
        console.error(`Unknown mission: ${intoFlag}`);
        process.exit(1);
      }
      if (!intoMission) {
        intoMission = findOpenManifestForRoute(missions.missions, {
          originIcao: lot.originIcao,
          destIcao: lot.destIcao,
          aircraftClassId,
        });
      }
      let mission;
      try {
        mission = acceptMission(world, {
          lotId,
          cargoKg: getNumberFlag(subArgs, '--kg'),
          aircraftClassId,
          maxCargoKg,
          intoMission,
        });
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
      upsertMission(missions, mission);
      await saveCareerEconomy(savePath, world);
      await saveCareerMissions(missionsPath, missions);
      if (asJson) {
        console.log(JSON.stringify(mission, null, 2));
        return;
      }
      console.log(
        `${intoMission ? 'Added to' : 'Accepted'}: ${formatMissionSummary(mission)}`,
      );
      console.log(
        `Next: npm run career -- dispatch --mission ${mission.id} --simbrief-user YOUR_ALIAS`,
      );
      return;
    }

    if (sub === 'missions') {
      const missions = await loadOrCreateCareerMissions(missionsPath);
      const active = missions.missions.filter(
        (m) => m.status === 'accepted' || m.status === 'dispatched' || m.status === 'in_flight',
      );
      if (asJson) {
        console.log(JSON.stringify({ walletUsd: missions.walletUsd, missions: missions.missions }, null, 2));
        return;
      }
      console.log(
        `Career missions active=${active.length} total=${missions.missions.length}  wallet=$${missions.walletUsd.toLocaleString()}  (${missionsPath})`,
      );
      for (const m of missions.missions.slice().reverse()) {
        console.log(`  ${formatMissionSummary(m)}`);
      }
      return;
    }

    if (sub === 'cancel') {
      const missionId = getFlag(subArgs, '--mission');
      if (!missionId) {
        console.error('career cancel requires --mission <id>');
        process.exit(1);
      }
      const world = await loadOrCreateCareerEconomy(savePath);
      const missions = await loadOrCreateCareerMissions(missionsPath);
      const existing = findMission(missions, missionId);
      if (!existing) {
        console.error(`Unknown mission: ${missionId}`);
        process.exit(1);
      }
      let cancelled;
      try {
        cancelled = cancelMission(world, existing, { fleet: missions });
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
      upsertMission(missions, cancelled);
      await saveCareerEconomy(savePath, world);
      await saveCareerMissions(missionsPath, missions);
      console.log(`Cancelled: ${formatMissionSummary(cancelled)}`);
      return;
    }

    if (sub === 'dispatch') {
      const missionId = getFlag(subArgs, '--mission');
      if (!missionId) {
        console.error('career dispatch requires --mission <id>');
        process.exit(1);
      }
      const world = await loadOrCreateCareerEconomy(savePath);
      const missions = await loadOrCreateCareerMissions(missionsPath);
      const mission = findMission(missions, missionId);
      if (!mission) {
        console.error(`Unknown mission: ${missionId}`);
        process.exit(1);
      }
      if (mission.status !== 'accepted' && mission.status !== 'dispatched') {
        console.error(`Mission ${missionId} cannot dispatch (status=${mission.status})`);
        process.exit(1);
      }

      const simbriefUser =
        getFlag(subArgs, '--simbrief-user') ?? process.env.SIMBRIEF_USERNAME ?? undefined;
      const simbriefUserid =
        getFlag(subArgs, '--simbrief-userid') ?? process.env.SIMBRIEF_USERID ?? undefined;
      if (!simbriefUser && !simbriefUserid) {
        console.error(
          'career dispatch requires --simbrief-user (or SIMBRIEF_USERNAME) / --simbrief-userid',
        );
        process.exit(1);
      }

      const rolesPath = resolve(repoRoot, mission.rolesPackRelPath);
      const rolesPack = await loadRolesPackFile(rolesPath);
      console.log(`Mission: ${formatMissionSummary(mission)}`);
      console.log(`Roles pack: ${mission.rolesPackRelPath}`);

      let type = getFlag(subArgs, '--type');
      if (!type) {
        const simbriefIcao = rolesPack.simbriefIcao ?? rolesPack.icao;
        const match = rolesPack.simbriefAirframeMatch;
        if (!simbriefIcao || !match) {
          console.error(
            'Roles pack missing simbriefIcao/simbriefAirframeMatch — pass --type <internalId>',
          );
          process.exit(1);
        }
        console.log(`Resolving SimBrief variant: icao=${simbriefIcao} match=/${match}/`);
        const resolved = await resolveSimBriefDispatchType({
          simbriefIcao,
          simbriefAirframeMatch: match,
        });
        type = resolved.type;
        console.log(
          `SimBrief type=${type}  (${resolved.airframe.comments || resolved.airframe.name})`,
        );
      }

      const staticId = mission.staticId ?? makeStaticId('career');
      const cargoThousands = cargoWeightToThousands(mission.cargoKg);
      const usePayloadPrefill = mission.aircraftClassId === 'light_ga';
      const url = buildDispatchRedirectUrl({
        type,
        orig: mission.originIcao,
        dest: mission.destIcao,
        pax: 1,
        ...(usePayloadPrefill
          ? { manualPayload: cargoThousands }
          : { cargo: cargoThousands }),
        units: 'KGS',
        staticId,
      });

      mission.staticId = staticId;
      mission.status = 'dispatched';
      mission.dispatchedAtTick = world.tick;
      upsertMission(missions, mission);
      await saveCareerMissions(missionsPath, missions);

      console.log(`static_id=${staticId}`);
      console.log(`Dispatch URL:\n  ${url}`);
      console.log(
        `Prefill: ${mission.originIcao}→${mission.destIcao}  pax=1 (EFB pilot)  cargo=${mission.cargoKg} kg (${cargoThousands} thousands)`,
      );
      console.log('Fuel planning left to SimBrief AUTO (not sent).');

      if (!hasFlag(subArgs, '--no-open')) {
        openDispatchInBrowser(url);
        console.log('Opened SimBrief Dispatch in your browser.');
      } else {
        console.log('Skipped browser open (--no-open).');
      }

      await waitForEnter(
        'After you click Generate on SimBrief and the OFP is ready, press Enter to fetch… ',
      );

      console.log(
        `Fetching OFP (${simbriefUserid ? `userid=${simbriefUserid}` : `user=${simbriefUser}`}, static_id=${staticId})…`,
      );
      const { expectation, raw } = await fetchSimBriefLatestOfp({
        username: simbriefUser,
        userid: simbriefUserid,
        staticId,
      });

      const origin = raw.general
        ? `${raw.aircraft?.icaocode ?? type} ${raw.general.icao_airline ?? ''}${raw.general.flight_number ?? ''}`.trim()
        : expectation.ofpId ?? 'simbrief';
      console.log(
        `OFP ready: ${origin}  units=${expectation.fuel.unit}  block=${expectation.loadSheet?.blockFuel ?? '?'}  payload=${expectation.loadSheet?.payload ?? '?'}  cargo intent=${mission.cargoKg} kg`,
      );

      const intentCheck = compareMissionIntentToOfp(mission, expectation);
      console.log(formatIntentOfpCheck(intentCheck));
      if (intentCheck.verdict === 'fail') {
        process.exitCode = 2;
      } else if (intentCheck.verdict === 'warn' && process.exitCode !== 2) {
        process.exitCode = 1;
      }

      if (hasFlag(subArgs, '--compare')) {
        const locked = hasFlag(subArgs, '--lock');
        const { snapshot } = await withBridge(pipeName, async (bridge) => {
          const ofp = applyOfpOverrides(expectation, {
            stationRoles: rolesPack.payload?.stationRoles,
            liveSources: rolesPack.liveSources,
          });
          return compareOnce(bridge, { ofp, locked });
        });
        if (asJson) {
          console.log(JSON.stringify({ mission, snapshot }, null, 2));
        } else {
          console.log(formatComplianceSummary(snapshot));
        }
        if (snapshot.verdict === 'fail') {
          process.exitCode = 2;
        } else if (snapshot.verdict === 'warn') {
          process.exitCode = 1;
        }
      } else {
        console.log(
          'Next: Load from SimBrief in the EFB, then compare-ofp; after landing: npm run career -- settle --mission ' +
            mission.id,
        );
      }
      return;
    }

    if (sub === 'depart') {
      const missionId = getFlag(subArgs, '--mission');
      if (!missionId) {
        console.error('career depart requires --mission <id>');
        process.exit(1);
      }
      const world = await loadOrCreateCareerEconomy(savePath);
      const missions = await loadOrCreateCareerMissions(missionsPath);
      const existing = findMission(missions, missionId);
      if (!existing) {
        console.error(`Unknown mission: ${missionId}`);
        process.exit(1);
      }
      let departed;
      try {
        const result = departMission(world, existing, { fleet: missions });
        departed = result.mission;
        creditWallet(missions, -result.fuelDebitUsd);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
      upsertMission(missions, departed);
      await saveCareerEconomy(savePath, world);
      await saveCareerMissions(missionsPath, missions);
      console.log(`Departed: ${formatMissionSummary(departed)}`);
      if (departed.fuelUplift) {
        console.log(
          `Fuel uplift: ${(departed.fuelUplift.requestedKg / 1000).toFixed(2)} t` +
            ` · $${departed.fuelUplift.costUsd.toLocaleString()}` +
            ` · ${departed.fuelUplift.scarcity}` +
            ` @ ${departed.fuelUplift.originIcao}`,
        );
      }
      console.log(`Next: after landing → npm run career -- settle --mission ${departed.id}`);
      return;
    }

    if (sub === 'settle') {
      const missionId = getFlag(subArgs, '--mission');
      if (!missionId) {
        console.error('career settle requires --mission <id>');
        process.exit(1);
      }
      const world = await loadOrCreateCareerEconomy(savePath);
      const missions = await loadOrCreateCareerMissions(missionsPath);
      const existing = findMission(missions, missionId);
      if (!existing) {
        console.error(`Unknown mission: ${missionId}`);
        process.exit(1);
      }
      let result;
      try {
        result = settleMission(world, existing, { fleet: missions });
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
      upsertMission(missions, result.mission);
      creditWallet(missions, -result.fuelDebitUsd);
      const wallet = creditWallet(missions, result.walletCreditUsd);
      await saveCareerEconomy(savePath, world);
      await saveCareerMissions(missionsPath, missions);
      if (asJson) {
        console.log(JSON.stringify({ ...result, walletUsd: wallet }, null, 2));
        return;
      }
      console.log(formatSettlementSummary(result.settlement, wallet));
      console.log(`Mission: ${formatMissionSummary(result.mission)}`);
      return;
    }

    if (sub === 'watch') {
      const intervalSec = getNumberFlag(subArgs, '--interval') ?? 5;
      const intervalMs = Math.max(1, intervalSec) * 1000;
      const autoDepart = !hasFlag(subArgs, '--no-depart');
      const autoSettle = !hasFlag(subArgs, '--no-settle');
      const requireEnginesOff = !hasFlag(subArgs, '--settle-on-touchdown');
      const requireDestProximity = !hasFlag(subArgs, '--allow-any-airport');
      const settleRadiusNm = getNumberFlag(subArgs, '--radius-nm') ?? 12;
      const missionIdFlag = getFlag(subArgs, '--mission');

      let stop = false;
      const onSignal = () => {
        stop = true;
      };
      process.on('SIGINT', onSignal);
      process.on('SIGTERM', onSignal);

      const missionsBoot = await loadOrCreateCareerMissions(missionsPath);
      let mission = pickActiveMission(missionsBoot.missions, missionIdFlag);
      if (!mission) {
        console.error(
          missionIdFlag
            ? `Unknown mission: ${missionIdFlag}`
            : 'No active mission (accepted/dispatched/in_flight). Accept one first.',
        );
        process.exit(1);
      }
      let current: MissionIntent = mission;
      if (
        current.status !== 'accepted' &&
        current.status !== 'dispatched' &&
        current.status !== 'in_flight'
      ) {
        console.error(`Mission ${current.id} is ${current.status} — nothing to watch`);
        process.exit(1);
      }

      console.log(
        `Career watch every ${intervalSec}s (Ctrl+C to stop)` +
          `${autoDepart ? ' [auto-depart]' : ''}${autoSettle ? ' [auto-settle]' : ''}` +
          `${requireEnginesOff ? ' [engines-off]' : ' [touchdown]'}` +
          `${requireDestProximity ? ` [dest≤${settleRadiusNm}nm]` : ' [any-airport]'}`,
      );
      console.log(`Watching: ${formatMissionSummary(current)}`);

      let watchState = createMissionFlightWatchState();
      let lastBlockedLog = '';

      await withBridge(pipeName, async (bridge) => {
        while (!stop) {
          const snap = await bridge.snapshot();
          let position: { lat: number; lon: number } | undefined;
          try {
            const lat = await bridge.readSimVar({ name: 'PLANE LATITUDE', unit: 'degrees' });
            const lon = await bridge.readSimVar({ name: 'PLANE LONGITUDE', unit: 'degrees' });
            if (Number.isFinite(lat) && Number.isFinite(lon)) {
              position = { lat, lon };
            }
          } catch {
            position = undefined;
          }

          let groundSpeedKt: number | undefined;
          let indicatedAirspeedKt: number | undefined;
          try {
            const gs = await bridge.readSimVar({
              name: 'GROUND VELOCITY',
              unit: 'knots',
            });
            if (Number.isFinite(gs) && gs >= 0) groundSpeedKt = gs;
          } catch {
            groundSpeedKt = undefined;
          }
          try {
            const ias = await bridge.readSimVar({
              name: 'AIRSPEED INDICATED',
              unit: 'knots',
            });
            if (Number.isFinite(ias) && ias >= 0) indicatedAirspeedKt = ias;
          } catch {
            indicatedAirspeedKt = undefined;
          }

          const sample = {
            onGround: snap.onGround,
            enginesRunning: snap.enginesRunning,
            paused: snap.paused === true,
            slewActive: snap.slewActive === true,
            position,
            groundSpeedKt,
            indicatedAirspeedKt,
          };

          const world = await loadOrCreateCareerEconomy(savePath);
          const missions = await loadOrCreateCareerMissions(missionsPath);
          current = pickActiveMission(missions.missions, current.id) ?? current;

          const destTerminal = world.airports.find((a) => a.icao === current.destIcao);
          const destCoords = resolveAirportCoords(current.destIcao, destTerminal);

          const { event, nextState } = evaluateMissionFlightTransition(
            current,
            sample,
            watchState,
            {
              requireEnginesOffToSettle: requireEnginesOff,
              requireDestProximity,
              destCoords,
              settleRadiusNm,
            },
          );
          watchState = nextState;

          const phaseLabel = sample.onGround
            ? sample.enginesRunning
              ? 'ground+engines'
              : 'ground'
            : 'airborne';
          const posLabel = position
            ? ` pos=${position.lat.toFixed(3)},${position.lon.toFixed(3)}`
            : ' pos=?';

          if (event.type === 'none') {
            if (!asJson) {
              console.log(
                `[watch] ${new Date().toISOString()}  ${phaseLabel}${posLabel}  mission=${current.status}  sawAirborne=${watchState.sawAirborne}`,
              );
            }
          } else if (event.type === 'settle_blocked') {
            if (event.reason !== lastBlockedLog) {
              console.log(`[watch] SETTLE BLOCKED: ${event.reason}`);
              lastBlockedLog = event.reason;
            }
          } else if (event.type === 'depart' && autoDepart) {
            let departed: MissionIntent;
            try {
              const result = departMission(world, current, { fleet: missions });
              departed = result.mission;
              creditWallet(missions, -result.fuelDebitUsd);
            } catch (error) {
              console.error(
                `[watch] depart failed: ${error instanceof Error ? error.message : String(error)}`,
              );
              await bridge.delay(intervalMs);
              continue;
            }
            upsertMission(missions, departed);
            await saveCareerEconomy(savePath, world);
            await saveCareerMissions(missionsPath, missions);
            current = departed;
            console.log(`[watch] AUTO-DEPART (${event.reason}): ${formatMissionSummary(departed)}`);
          } else if (event.type === 'settle' && autoSettle) {
            let settled;
            try {
              settled = settleMission(world, current, { fleet: missions });
            } catch (error) {
              console.error(
                `[watch] settle failed: ${error instanceof Error ? error.message : String(error)}`,
              );
              await bridge.delay(intervalMs);
              continue;
            }
            upsertMission(missions, settled.mission);
            creditWallet(missions, -settled.fuelDebitUsd);
            const wallet = creditWallet(missions, settled.walletCreditUsd);
            await saveCareerEconomy(savePath, world);
            await saveCareerMissions(missionsPath, missions);
            current = settled.mission;
            console.log(`[watch] AUTO-SETTLE (${event.reason})`);
            console.log(formatSettlementSummary(settled.settlement, wallet));
            console.log(`Mission: ${formatMissionSummary(settled.mission)}`);
            console.log('[watch] Mission settled — stopping watch.');
            stop = true;
            break;
          } else if (event.type === 'depart' || event.type === 'settle') {
            console.log(
              `[watch] would ${event.type} (${event.reason}) but auto-${event.type} disabled`,
            );
          }

          if (!stop) {
            await bridge.delay(intervalMs);
          }
        }
      });

      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      return;
    }

    console.error(`Unknown career subcommand: ${sub}`);
    process.exit(1);
  }

  if (command === 'compare-ofp') {
    const locked = hasFlag(rest, '--lock');
    const asJson = hasFlag(rest, '--json');
    const { snapshot } = await withBridge(pipeName, async (bridge) => {
      const title = (await bridge.getAircraftIdentity()).title;
      const ofp = await resolveOfpFromArgs(rest, { aircraftTitle: title });
      return compareOnce(bridge, { ofp, locked });
    });
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
      const title = (await bridge.getAircraftIdentity()).title;
      const ofp = await resolveOfpFromArgs(rest, { aircraftTitle: title });

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

        // Target ~80% of every profile tank (wizard smoke does the same).
        // Omitting CENTER/CENTER2 would write 0 via the profile writePlan and wipe fuel.
        const fuelTanks: Record<string, number> = {};
        for (const tank of profile.fuel.tanks) {
          const cap = tank.capacity ?? 40;
          const ratio = /TIP|AUX/i.test(tank.id) ? 0.85 : 0.8;
          const minGal = /TIP|AUX/i.test(tank.id)
            ? Math.min(10, Math.floor(cap * 0.6))
            : 5;
          fuelTanks[tank.id] = Math.max(minGal, Math.floor(cap * ratio));
        }
        if (fuelTanks.LEFT_MAIN === undefined && profile.fuel.tanks[0]) {
          fuelTanks[profile.fuel.tanks[0].id] = Math.max(
            5,
            Math.floor((profile.fuel.tanks[0].capacity ?? 40) * 0.8),
          );
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
