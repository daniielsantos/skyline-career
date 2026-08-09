import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { DefaultProfileEngine } from '@msfs-compat/runtime';
import type { AircraftProfile, CareerPlayerAirframe } from '@msfs-compat/shared';
import {
  computeFingerprintV2,
  getAircraftClass,
  normalizeAircraftTitle,
  inferPublisher,
} from '@msfs-compat/shared';
import { buildSmokeStationTargets } from './smoke-targets.js';
import { calibrateProfile } from './calibrate-profile.js';
import { draftProfileFromVendorRecipe } from './draft-from-recipe.js';
import { draftProfileFromLive } from './draft-profile.js';
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';
import {
  confirm,
  chooseFromList,
  printKv,
  printSection,
  withPrompts,
  type AskFn,
} from './prompt.js';
import { listCatalogPublishers } from './catalog-publishers.js';
import {
  discoverClassicFuelTanks,
  isFuelWriteAccepted,
  liveFuelTanks,
  readAfterWriteSettles,
  writeTolerance,
} from './discover-fuel-tanks.js';
import {
  discoverWritablePayloadStations,
  liveStationIndexes as stickyStationIndexes,
} from './discover-payload-stations.js';
import {
  ensureAuxTanks,
  cleanIcaoCode,
  listExamplesByMatchTitle,
  normalizeConfirmedIcao,
  promoteDraftProfile,
} from './promote-profile.js';
import { sampleAircraftStructure } from './sample-structure.js';
import { probeLVars } from './probe-lvars.js';
import { readLiveCgState } from './live-cg.js';
import { promptFlightModelPath } from './find-flight-model.js';
import {
  applyClassPerfFallback,
  catalogPerfPrintRows,
  loadAircraftPerfFromCfg,
  type AircraftCfgUiStats,
} from './parse-aircraft-cfg-ui.js';
import {
  inferPublisherFromLiveTitle,
  loadVendorRecipes,
  probeRecipeLvars,
  scoreRecipesForLvarFallback,
} from './vendor-recipes.js';
import { upsertRolesPackFromProfile } from './ofp-compliance/draft-roles-pack.js';
import {
  loadRolesPackFile,
  matchHeuristic,
  type OfpRolesPackFile,
} from './ofp-compliance/scaffold-roles.js';
import {
  CAREER_CLASS_CHOICES,
  deriveCareerMarketWeights,
  inferCareerClassFromIcao,
  registerCareerPlayerAirframe,
} from './career-player-airframe-catalog.js';
import { careerOperationalCargoMaxLb } from './ofp-load-plan.js';
import {
  findMarketFamilyCandidates,
  stationLayoutFromProfile,
  type MarketFamilyCandidate,
} from './career-family-merge.js';

export interface HomologateWizardOptions {
  bridge: NamedPipeSimBridge;
  repoRoot: string;
  draftsDir: string;
  examplesDir: string;
  notesDir: string;
}

async function calibrateWithCgSources(
  ask: AskFn,
  bridge: NamedPipeSimBridge,
  profilePath: string,
  aircraftTitle: string,
  publisher?: string,
  icao?: string,
): Promise<{
  calibration: Awaited<ReturnType<typeof calibrateProfile>>;
  perf: AircraftCfgUiStats;
  emptyWeightLb?: number;
  mtowLb?: number;
}> {
  printSection('CG source + empirical validation');
  console.log('  Prefer live CG FWD/AFT LIMIT (Mass & Balance tablet), then flight_model.cfg.');
  const liveCg = await readLiveCgState(bridge);
  let liveMtowLb: number | undefined;
  let liveEmptyLb: number | undefined;
  let liveStationCount: number | undefined;
  try {
    const mtow = await bridge.readSimVar({
      name: 'MAX GROSS WEIGHT',
      unit: 'pounds',
    });
    if (Number.isFinite(mtow) && mtow > 0) liveMtowLb = mtow;
  } catch {
    liveMtowLb = undefined;
  }
  try {
    const empty = await bridge.readSimVar({
      name: 'EMPTY WEIGHT',
      unit: 'pounds',
    });
    if (Number.isFinite(empty) && empty > 0) liveEmptyLb = empty;
  } catch {
    liveEmptyLb = undefined;
  }
  try {
    const stations = await bridge.readSimVar({
      name: 'PAYLOAD STATION COUNT',
      unit: 'number',
    });
    if (Number.isFinite(stations) && stations > 0) {
      liveStationCount = Math.round(stations);
    }
  } catch {
    liveStationCount = undefined;
  }
  printKv([
    ['live CG %MAC', liveCg.liveMac?.toFixed(1)],
    [
      'live envelope',
      liveCg.minMac !== undefined && liveCg.maxMac !== undefined
        ? `${liveCg.minMac.toFixed(0)}–${liveCg.maxMac.toFixed(0)}% (SimVar)`
        : 'unavailable',
    ],
    ['live MTOW', liveMtowLb != null ? formatLb(liveMtowLb) : 'unavailable'],
    [
      'live empty',
      liveEmptyLb != null ? formatLb(liveEmptyLb) : 'unavailable',
    ],
    [
      'live stations',
      liveStationCount != null ? String(liveStationCount) : 'unavailable',
    ],
  ]);

  const flightModelPath = await promptFlightModelPath(ask, aircraftTitle, {
    publisher,
    liveHints: {
      mtowLb: liveMtowLb,
      emptyWeightLb: liveEmptyLb,
      stationCount: liveStationCount,
    },
  });
  if (flightModelPath) {
    printKv([['flight_model.cfg', flightModelPath]]);
  } else {
    console.log('  Continuing without flight_model.cfg (live SimVar envelope / sweep only).');
  }

  let perf = await loadAircraftPerfFromCfg({
    flightModelPath: flightModelPath ?? undefined,
  });
  const inferredClass = inferCareerClassFromIcao(icao ?? '');
  const classRow = getAircraftClass(inferredClass);
  perf = applyClassPerfFallback(perf, classRow);
  printSection('Catalog performance (range / burn)');
  printKv([
    ...catalogPerfPrintRows(perf),
    [
      'class fallback',
      `${inferredClass} · range ${classRow.maxRangeNm} nm · burn ${classRow.fuelBurnKgPerNm} kg/nm`,
    ],
  ]);

  const forwardRaw = await ask(
    'Forward CG limit in %MAC override (blank = use live SimVar/cfg)',
  );
  const aftRaw = await ask(
    'Aft CG limit in %MAC override (blank = use live SimVar/cfg)',
  );
  const forward = forwardRaw.trim() === '' ? undefined : Number(forwardRaw);
  const aft = aftRaw.trim() === '' ? undefined : Number(aftRaw);
  if (
    (forward === undefined) !== (aft === undefined) ||
    (forward !== undefined && (!Number.isFinite(forward) || !Number.isFinite(aft)))
  ) {
    throw new Error('Manual CG envelope requires valid forward and aft %MAC values');
  }

  const runCgSweep = await confirm(
    ask,
    'Run empirical CG station sweep now (on ground, engines off; payload is restored)',
    true,
  );
  const sweepPayloadLb = runCgSweep
    ? Number(await ask('Sweep payload (lb)', '200'))
    : undefined;
  if (runCgSweep && (!Number.isFinite(sweepPayloadLb) || sweepPayloadLb! <= 0)) {
    throw new Error('Sweep payload must be a positive number');
  }

  const calibration = await calibrateProfile(bridge, profilePath, {
    flightModelPath,
    manualEnvelope:
      forward !== undefined && aft !== undefined
        ? { minMac: forward, maxMac: aft }
        : undefined,
    runCgSweep,
    sweepPayloadLb,
  });
  if (calibration.cgEnvelope?.source === 'calibrated-live') {
    console.log(
      '  Warning: CG envelope remains provisional; confirm limits via SimVar/cfg/EFB before promotion.',
    );
  } else if (calibration.cgEnvelope?.source === 'simvar') {
    console.log('  Using live CG FWD/AFT LIMIT from the simulator (same as tablet).');
  }

  return { calibration, perf, emptyWeightLb: liveEmptyLb, mtowLb: liveMtowLb };
}

async function loadMarketCatalogRows(
  repoRoot: string,
): Promise<CareerPlayerAirframe[]> {
  const path = join(
    repoRoot,
    'packages',
    'shared',
    'src',
    'data',
    'career-player-airframes.json',
  );
  try {
    return JSON.parse(await readFile(path, 'utf8')) as CareerPlayerAirframe[];
  } catch {
    return [];
  }
}

async function promptJoinMarketFamily(
  ask: AskFn,
  repoRoot: string,
  profile: AircraftProfile,
  aircraftClassId: CareerPlayerAirframe['aircraftClassId'],
  cabinAsBaggage: boolean,
): Promise<MarketFamilyCandidate | undefined> {
  const title = profile.match.title?.trim() || profile.displayName || profile.profileId;
  if (matchHeuristic(title)?.familyPackRel) {
    // Built-in family heuristic already routes the pack merge.
    return undefined;
  }
  const icao = (
    profile.match.icao ??
    ''
  ).trim();
  const catalog = await loadMarketCatalogRows(repoRoot);
  const packsByRelPath = new Map<string, OfpRolesPackFile>();
  for (const row of catalog) {
    if (packsByRelPath.has(row.rolesPackRelPath)) continue;
    try {
      packsByRelPath.set(
        row.rolesPackRelPath,
        await loadRolesPackFile(join(repoRoot, row.rolesPackRelPath)),
      );
    } catch {
      /* pack missing on disk */
    }
  }
  const candidates = findMarketFamilyCandidates({
    icao,
    aircraftClassId,
    profileLayout: stationLayoutFromProfile(profile, { cabinAsBaggage }),
    matchTitle: title,
    catalog,
    packsByRelPath,
  });
  if (candidates.length === 0) return undefined;

  const best = candidates[0]!;
  const stationNote =
    best.compatibility === 'different-stations'
      ? 'same ICAO/class but different station map — would share Market SKU with separate OFP pack'
      : 'same ICAO/class and compatible stations — would merge into one OFP pack';
  console.log(
    `  Existing Market SKU: ${best.label} (${best.typeId}, ${best.simbriefIcao})`,
  );
  console.log(`  → ${stationNote}`);
  if (
    await confirm(
      ask,
      `Join existing family "${best.label}"`,
      best.compatibility !== 'different-stations',
    )
  ) {
    return best;
  }
  return undefined;
}

async function writeCareerRolesPackAfterPromote(
  ask: AskFn,
  repoRoot: string,
  profile: AircraftProfile,
  perf?: AircraftCfgUiStats,
  liveWeights?: {
    emptyWeightLb?: number;
    mtowLb?: number;
    lbPerGal?: number;
  },
): Promise<void> {
  printSection('Career OFP roles pack');
  const cabinAsBaggage = await confirm(
    ask,
    'Map cabin seats as baggage for Career cargo inject (recommended)',
    true,
  );
  if (
    !(await confirm(
      ask,
      'Write / merge profiles/ofp roles pack now (direct-injection)',
      true,
    ))
  ) {
    console.log(
      '  Skipped roles pack — run: npm run agent -- draft-ofp-roles --profile PATH --write',
    );
    return;
  }
  const ofpDir = join(repoRoot, 'profiles', 'ofp');
  const inferredClass = inferCareerClassFromIcao(
    profile.match.icao ?? '',
  );
  const aircraftClassId = await chooseFromList(
    ask,
    'Skyline Career economic class',
    CAREER_CLASS_CHOICES.map((choice) => choice.value),
    { defaultValue: inferredClass },
  );
  const classId =
    CAREER_CLASS_CHOICES.find((choice) => choice.value === aircraftClassId)
      ?.value ?? inferredClass;

  const classRow = getAircraftClass(classId);
  const resolvedPerf = applyClassPerfFallback(perf ?? {}, classRow);
  printSection('Catalog performance (final for Market)');
  printKv(catalogPerfPrintRows(resolvedPerf));

  const family = await promptJoinMarketFamily(
    ask,
    repoRoot,
    profile,
    classId,
    cabinAsBaggage,
  );
  const mergePack =
    family != null && family.compatibility !== 'different-stations';

  const result = await upsertRolesPackFromProfile(profile, ofpDir, {
    loadMethod: 'direct-injection',
    injectCapable: true,
    cabinAsBaggage,
    ...(mergePack
      ? {
          familyPackRel: basename(family.rolesPackRelPath),
          familyOfpId: family.typeId,
          marketLabel: family.label,
        }
      : {}),
  });
  const roles = result.pack.payload?.stationRoles;
  const cargoMaxLoadLb = careerOperationalCargoMaxLb({
    stations: profile.payload.stations,
    stationRoles: roles,
  });
  const fuelCapacityGal = profile.fuel.tanks.reduce(
    (sum, tank) =>
      sum +
      (typeof tank.capacity === 'number' &&
      Number.isFinite(tank.capacity) &&
      tank.capacity > 0
        ? tank.capacity
        : 0),
    0,
  );
  let marketWeights = deriveCareerMarketWeights({
    emptyWeightLb: liveWeights?.emptyWeightLb,
    mtowLb: liveWeights?.mtowLb,
    cargoMaxLoadLb,
    fuelCapacityGal,
    lbPerGal: liveWeights?.lbPerGal,
  });
  // Shared Market SKU with different station maps: keep the tighter cargo ceiling.
  if (
    family != null &&
    family.compatibility === 'different-stations' &&
    marketWeights.maxCargoKg != null
  ) {
    const catalog = await loadMarketCatalogRows(repoRoot);
    const existing = catalog.find((row) => row.typeId === family.typeId);
    if (
      typeof existing?.maxCargoKg === 'number' &&
      Number.isFinite(existing.maxCargoKg) &&
      existing.maxCargoKg > 0
    ) {
      marketWeights = {
        ...marketWeights,
        maxCargoKg: Math.min(existing.maxCargoKg, marketWeights.maxCargoKg),
      };
    }
  }
  const registered = await registerCareerPlayerAirframe({
    repoRoot,
    rolesPackPath: result.path,
    pack: result.pack,
    aircraftClassId: classId,
    title: profile.match.title ?? profile.displayName,
    ...(family ? { typeId: family.typeId } : {}),
    ...marketWeights,
    ...(resolvedPerf.maxRangeNm != null
      ? { maxRangeNm: resolvedPerf.maxRangeNm }
      : {}),
    ...(resolvedPerf.cruiseFuelFlowKgPerHour != null
      ? { cruiseFuelFlowKgPerHour: resolvedPerf.cruiseFuelFlowKgPerHour }
      : {}),
    ...(resolvedPerf.cruiseSpeedKt != null
      ? { cruiseSpeedKt: resolvedPerf.cruiseSpeedKt }
      : {}),
    ...(resolvedPerf.fuelBurnKgPerNm != null
      ? { fuelBurnKgPerNm: resolvedPerf.fuelBurnKgPerNm }
      : {}),
  });
  const bagIdx = roles?.baggageStations ?? [];
  const cargoStationNote =
    bagIdx.length > 0
      ? bagIdx
          .map((idx) => {
            const st = profile.payload.stations.find((s) => s.index === idx);
            return `S${idx}:${st?.maxLoad ?? '?'}`;
          })
          .join(' ')
      : '—';
  printKv([
    ['roles pack', result.path],
    ['via', result.via],
    [result.created ? 'created' : 'updated', 'yes'],
    ['matchTitles', (result.pack.matchTitles ?? []).join(' | ')],
    [
      'roles',
      `crew=${result.pack.payload?.stationRoles?.crewStations?.join(',') ?? '—'} bags=${result.pack.payload?.stationRoles?.baggageStations?.join(',') ?? '—'}`,
    ],
    ['Aircraft Market', `${registered.label} (${registered.aircraftClassId})`],
    [
      'cargo ceiling',
      `${cargoMaxLoadLb} lb → ${registered.maxCargoKg ?? '—'} kg (${cargoStationNote})`,
    ],
    [
      'weights',
      [
        registered.oewKg != null ? `OEW ${registered.oewKg} kg` : null,
        registered.mtowKg != null ? `MTOW ${registered.mtowKg} kg` : null,
        registered.maxCargoKg != null
          ? `cargo ${registered.maxCargoKg} kg`
          : null,
        registered.fuelCapacityKg != null
          ? `fuel ${registered.fuelCapacityKg} kg`
          : null,
      ]
        .filter(Boolean)
        .join(' · ') || '—',
    ],
    [
      'range',
      registered.maxRangeNm != null
        ? `${registered.maxRangeNm} nm · ${resolvedPerf.rangeSource ?? '—'}`
        : '—',
    ],
    [
      'cruise burn',
      registered.cruiseFuelFlowKgPerHour != null
        ? `${registered.cruiseFuelFlowKgPerHour} kg/h · ${resolvedPerf.burnSource ?? '—'}`
        : '—',
    ],
    [
      'cruise TAS',
      registered.cruiseSpeedKt != null
        ? `${registered.cruiseSpeedKt} kt`
        : '—',
    ],
    [
      'burn / nm',
      registered.fuelBurnKgPerNm != null
        ? `${registered.fuelBurnKgPerNm} kg/nm · ${resolvedPerf.burnSource ?? '—'}`
        : '—',
    ],
    ...(family
      ? [['family', `${family.label} (${family.compatibility})`] as [string, string]]
      : []),
  ]);
}

/** Default gallons offered in the post-smoke "Test apply" prompts. */
function defaultTestApplyGallons(tankId: string): string {
  if (tankId === 'LEFT_MAIN' || tankId === 'RIGHT_MAIN') return '20';
  // Tip / aux / FUELSYSTEM:3+ (TANK_3…) and center — keep the test load light.
  return '10';
}

async function tryRead(bridge: NamedPipeSimBridge, name: string, unit: string): Promise<number | null> {
  try {
    const value = await bridge.readSimVar({ name, unit });
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** MSFS Jet-A default when FUEL WEIGHT PER GALLON is unavailable. */
const FALLBACK_LB_PER_GAL = 6.7;

function roundFuel(n: number, digits = 1): string {
  const f = 10 ** digits;
  return String(Math.round(n * f) / f);
}

/** Format gallons with pounds using live (or fallback) fuel density. */
function formatGalLbs(gal: number | null | undefined, lbPerGal: number): string {
  const n = typeof gal === 'number' ? gal : Number(gal);
  if (!Number.isFinite(n)) return '—';
  return `${roundFuel(n)} gal (${roundFuel(n * lbPerGal)} lb)`;
}

/** Compact fuel line for profile tanks: `LEFT_MAIN 24 gal · RIGHT_TIP 8 gal · …` */
function formatProfileFuelLine(
  profile: AircraftProfile,
  quantities: Record<string, number | undefined>,
  lbPerGal: number,
): string {
  return profile.fuel.tanks
    .map((t) => `${t.id} ${formatGalLbs(quantities[t.id], lbPerGal)}`)
    .join(' · ');
}

function applyAutoHint(profile: AircraftProfile): string {
  let cmd =
    '  node packages/agent/dist/cli.js apply-auto --fuel-left 30 --fuel-right 30';
  if (profile.fuel.tanks.some((t) => t.id === 'CENTER')) cmd += ' --fuel-center 20';
  if (profile.fuel.tanks.some((t) => t.id === 'LEFT_TIP')) cmd += ' --fuel-left-tip 10';
  if (profile.fuel.tanks.some((t) => t.id === 'RIGHT_TIP')) cmd += ' --fuel-right-tip 10';
  if (profile.fuel.tanks.some((t) => t.id === 'LEFT_AUX')) cmd += ' --fuel-left-aux 10';
  if (profile.fuel.tanks.some((t) => t.id === 'RIGHT_AUX')) cmd += ' --fuel-right-aux 10';
  return cmd;
}

function formatLb(n: number | null | undefined): string {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${roundFuel(v)} lb`;
}

type StationWeight = { index: number; lb: number };
type PayloadWeightSummary = { count: number; stations: StationWeight[]; totalLb: number };

/** Discovery dump: all classic PAYLOAD STATION WEIGHT:n (may include Accu-Sim ghost stations). */
function readStationWeights(snap: {
  vars?: Record<string, number | undefined>;
  payloadTotal?: number;
}): PayloadWeightSummary {
  const countRaw = snap.vars?.['PAYLOAD STATION COUNT'];
  const countHint = Math.round(typeof countRaw === 'number' ? countRaw : Number(countRaw) || 0);
  const limit = Math.max(0, Math.min(16, countHint > 0 ? countHint : 14));
  const stations: StationWeight[] = [];
  for (let i = 1; i <= limit; i++) {
    const raw = snap.vars?.[`PAYLOAD STATION WEIGHT:${i}`];
    if (raw === undefined || raw === null) {
      if (countHint > 0) stations.push({ index: i, lb: 0 });
      continue;
    }
    const lb = Number(raw);
    if (!Number.isFinite(lb)) continue;
    stations.push({ index: i, lb });
  }
  const summed = stations.reduce((a, s) => a + s.lb, 0);
  const totalFromSnap = snap.payloadTotal ?? snap.vars?.['TOTAL PAYLOAD WEIGHT'];
  const totalLb =
    typeof totalFromSnap === 'number' && Number.isFinite(totalFromSnap) ? totalFromSnap : summed;
  return {
    count: countHint > 0 ? countHint : stations.length,
    stations,
    totalLb,
  };
}

/** Map profile station index → LVar name from writePlan (`lvar_set` + `{station_N}`). */
function stationLvarMap(profile: AircraftProfile): Map<number, string> {
  const map = new Map<number, string>();
  for (const step of profile.payload.writePlan ?? []) {
    if (step.op !== 'lvar_set' || !step.name || !step.valueExpr) continue;
    const m = /^\{station_(\d+)\}$/.exec(step.valueExpr.trim());
    if (m) map.set(Number(m[1]), step.name);
  }
  return map;
}

/**
 * Smoke/display payload: only stations declared on the profile.
 * Prefer LVars when the write plan uses them (Accu-Sim); else classic SimVars.
 * Total is the sum of those stations — never TOTAL PAYLOAD WEIGHT (ghost stations).
 */
async function readProfileStationWeights(
  bridge: NamedPipeSimBridge,
  profile: AircraftProfile,
  snap: { vars?: Record<string, number | undefined> },
): Promise<PayloadWeightSummary> {
  const lvars = stationLvarMap(profile);
  const stations: StationWeight[] = [];

  for (const st of profile.payload.stations) {
    const lvar = lvars.get(st.index);
    if (lvar) {
      try {
        const v = await bridge.readLVar(lvar);
        stations.push({ index: st.index, lb: Number.isFinite(v) ? v : 0 });
        continue;
      } catch {
        // fall through to classic
      }
    }
    const raw = snap.vars?.[`PAYLOAD STATION WEIGHT:${st.index}`];
    const lb = typeof raw === 'number' && Number.isFinite(raw) ? raw : Number(raw);
    stations.push({ index: st.index, lb: Number.isFinite(lb) ? lb : 0 });
  }

  const totalLb = stations.reduce((a, s) => a + s.lb, 0);
  return { count: stations.length, stations, totalLb };
}

/** Compact station line: `1=180 2=0 3=50 …` (zeros kept so layout is visible). */
function formatStationsLine(stations: StationWeight[]): string {
  if (stations.length === 0) return '—';
  return stations.map((s) => `${s.index}=${roundFuel(s.lb)}`).join(' ');
}

async function runSmoke(
  bridge: NamedPipeSimBridge,
  profile: AircraftProfile,
): Promise<{
  ok: boolean;
  targets: Record<string, number>;
  beforeFuel: Record<string, number | undefined>;
  afterFuel: Record<string, number | undefined>;
  beforePayload: PayloadWeightSummary;
  afterPayload: PayloadWeightSummary;
  payloadTargets: Record<number, number>;
  apply: Awaited<ReturnType<DefaultProfileEngine['applyLoadPlan']>>;
}> {
  const engine = new DefaultProfileEngine({ profile, bridge });
  const fuelTanks: Record<string, number> = {};
  for (const tank of profile.fuel.tanks) {
    const cap = tank.capacity ?? 40;
    // Aux/tip often have a high unusable floor (Baron G58 AUX stuck ~8.5 of 14).
    // Target high on the usable band so smoke does not aim below what the sim will hold.
    const ratio = /TIP|AUX/i.test(tank.id) ? 0.85 : 0.8;
    const minGal = /TIP|AUX/i.test(tank.id) ? Math.min(10, Math.floor(cap * 0.6)) : 5;
    fuelTanks[tank.id] = Math.max(minGal, Math.floor(cap * ratio));
  }
  if (fuelTanks.LEFT_MAIN === undefined && profile.fuel.tanks[0]) {
    fuelTanks[profile.fuel.tanks[0].id] = Math.max(
      5,
      Math.floor((profile.fuel.tanks[0].capacity ?? 40) * 0.8),
    );
  }

  const stationTargets = buildSmokeStationTargets(profile);

  const before = await bridge.snapshot();
  const beforePayload = await readProfileStationWeights(bridge, profile, before);
  const apply = await engine.applyLoadPlan({
    fuel: { tanks: fuelTanks },
    payload: {
      stations: stationTargets,
      total: Object.values(stationTargets).reduce((a, b) => a + b, 0),
    },
  });
  const after = await bridge.snapshot();
  const afterPayload = await readProfileStationWeights(bridge, profile, after);

  const pick = async (snap: typeof before) => {
    const out: Record<string, number | undefined> = {
      LEFT_MAIN: snap.vars?.['FUEL TANK LEFT MAIN QUANTITY'],
      RIGHT_MAIN: snap.vars?.['FUEL TANK RIGHT MAIN QUANTITY'],
      CENTER: snap.vars?.['FUEL TANK CENTER QUANTITY'],
      LEFT_TIP: snap.vars?.['FUEL TANK LEFT TIP QUANTITY'],
      RIGHT_TIP: snap.vars?.['FUEL TANK RIGHT TIP QUANTITY'],
      LEFT_AUX: snap.vars?.['FUEL TANK LEFT AUX QUANTITY'],
      RIGHT_AUX: snap.vars?.['FUEL TANK RIGHT AUX QUANTITY'],
    };
    // Snapshot may omit tip/aux — fill from profile readVars when needed for display.
    for (const tank of profile.fuel.tanks) {
      if (out[tank.id] !== undefined) continue;
      try {
        out[tank.id] = await bridge.readSimVar({ name: tank.readVar, unit: tank.readUnit || 'gallons' });
      } catch {
        out[tank.id] = undefined;
      }
    }
    return out;
  };

  const beforeFuel = await pick(before);
  const afterFuel = await pick(after);

  const fuelOk = apply.fuel?.success === true;
  const payloadOk = apply.payload?.success === true;
  const cgOk = !('cg' in apply) || apply.cg === undefined || apply.cg.ok !== false;

  if (!fuelOk) {
    console.log('  Fuel verify detail (target → after):');
    for (const tank of profile.fuel.tanks) {
      const want = fuelTanks[tank.id];
      const got = afterFuel[tank.id];
      if (want === undefined) continue;
      const delta =
        got !== undefined ? ` Δ=${(got - want).toFixed(1)}` : '';
      console.log(
        `    ${tank.id}: want ${want} after ${got ?? '—'} gal${delta}`,
      );
    }
    if (apply.fuel?.errorCode) {
      console.log(`  fuel errorCode     ${apply.fuel.errorCode}`);
    }
  }
  if (!payloadOk) {
    if (apply.payload?.errorCode) {
      console.log(`  payload errorCode  ${apply.payload.errorCode}`);
    }
    const details =
      apply.payload && 'details' in apply.payload
        ? (apply.payload as { details?: unknown }).details
        : undefined;
    if (details !== undefined) {
      console.log(`  payload details    ${JSON.stringify(details)}`);
    }
  }

  return {
    ok: fuelOk && payloadOk && cgOk,
    targets: fuelTanks,
    beforeFuel,
    afterFuel,
    beforePayload,
    afterPayload,
    payloadTargets: stationTargets,
    apply,
  };
}

/**
 * Interactive homologation wizard: discover → draft → smoke → promote → seed.
 */
export async function runHomologateWizard(options: HomologateWizardOptions): Promise<void> {
  const { bridge, repoRoot, draftsDir, examplesDir, notesDir } = options;

  await withPrompts(async (ask) => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║         Skyline — Aircraft Homologation Wizard           ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('Load the aircraft in MSFS (on ground, engines off, park brake).');
    console.log('Keep start:local running. Confirm the aircraft EFB (vendor UI) is open.');

    if (!(await confirm(ask, 'Ready to start discovery', true))) {
      console.log('Aborted.');
      return;
    }

    printSection('1/5 Identity');
    const ping = await bridge.ping();
    const identity = await bridge.getAircraftIdentity();
    const snapshot = await bridge.snapshot();
    const suggestedTitle = normalizeAircraftTitle(identity.title);
    const lbPerGalLive = await tryRead(bridge, 'FUEL WEIGHT PER GALLON', 'pounds');
    const lbPerGal =
      lbPerGalLive !== null && lbPerGalLive > 0.1 ? lbPerGalLive : FALLBACK_LB_PER_GAL;
    const leftMainQty = snapshot.vars?.['FUEL TANK LEFT MAIN QUANTITY'];
    const rightMainQty = snapshot.vars?.['FUEL TANK RIGHT MAIN QUANTITY'];
    const payloadLive = readStationWeights(snapshot);
    printKv([
      ['bridge', `${ping.mode} connected=${ping.connected}`],
      ['title (live)', identity.title],
      ['match title?', suggestedTitle],
      ['atcModel', identity.atcModel],
      ['icao', identity.icao],
      ['empty lb', formatLb(snapshot.vars?.['EMPTY WEIGHT'])],
      ['total wt', formatLb(snapshot.vars?.['TOTAL WEIGHT'] ?? snapshot.grossWeightLb)],
      ['mtow lb', formatLb(snapshot.vars?.['MAX GROSS WEIGHT'])],
      ['stations', payloadLive.count],
      ['payload tot', formatLb(payloadLive.totalLb)],
      ['payload stn', formatStationsLine(payloadLive.stations)],
      ['CG %', snapshot.cgPercent?.toFixed?.(1) ?? snapshot.cgPercent],
      ['fuel dens', `${roundFuel(lbPerGal, 3)} lb/gal${lbPerGalLive == null ? ' (fallback)' : ''}`],
      ['left main', formatGalLbs(typeof leftMainQty === 'number' ? leftMainQty : Number(leftMainQty), lbPerGal)],
      ['right main', formatGalLbs(typeof rightMainQty === 'number' ? rightMainQty : Number(rightMainQty), lbPerGal)],
    ]);
    console.log('  Tip: strip livery/cabin names from match title (shared across paints).');
    const matchTitle = (await ask('Catalog match title', suggestedTitle)).trim() || suggestedTitle;
    // Match titles are often stripped of the vendor prefix (e.g. "BN2 Islander - …");
    // also probe the live title / ATC model so Black Box / PMDG-style branding still wins.
    const suggestedPublisher = inferPublisher(
      [identity.title, matchTitle, identity.atcModel].filter(Boolean).join(' '),
      process.env.MSFS_COMPAT_PUBLISHER,
    );
    const publishers = await listCatalogPublishers(repoRoot);
    const matchPublisher = await chooseFromList(
      ask,
      'Catalog publisher (profileKey prefix)',
      publishers,
      { defaultValue: suggestedPublisher, otherLabel: 'other (type custom slug)' },
    );
    printKv([['catalog publisher', matchPublisher]]);
    const suggestedIcao = cleanIcaoCode({
      icao: identity.icao,
      atcModel: identity.atcModel,
      title: matchTitle,
    });
    console.log('  Tip: ICAO type designator is required for SimBrief / OFP later — confirm carefully.');
    if (suggestedIcao === 'ZZZZ') {
      console.log('  Warning: could not infer ICAO from sim — enter the real type (e.g. E55P, C172).');
    }
    const matchIcao = normalizeConfirmedIcao(
      (await ask('ICAO type designator (SimBrief)', suggestedIcao)).trim() || suggestedIcao,
      suggestedIcao,
    );
    printKv([['catalog ICAO', matchIcao]]);

    const existingForTitle = await listExamplesByMatchTitle(examplesDir, matchTitle);
    if (existingForTitle.length > 0) {
      console.log(
        `  Re-homologation: will overwrite ${existingForTitle
          .map((e) => e.profile.profileKey)
          .join(', ')} (same match title).`,
      );
    }

    const publisherForFp = inferPublisher(
      [identity.title, matchTitle, identity.atcModel].filter(Boolean).join(' '),
      matchPublisher,
    );
    const { structure: liveStructure } = await sampleAircraftStructure(bridge);
    const { fingerprint: liveFingerprint } = computeFingerprintV2({
      identity: {
        title: identity.title,
        publisher: publisherForFp,
        atcModel: identity.atcModel,
        atcType: identity.atcType,
        icao: identity.icao ?? identity.atcModel,
      },
      structure: liveStructure,
    });

    printSection('Load method');
    console.log('  How should Career load fuel/payload for this aircraft?');
    console.log(
      '    1. native-simbrief — pilot imports OFP in the addon EFB/FMC (PMDG, TFDi, ToLiss)',
    );
    console.log(
      '    2. direct-injection — Skyline writes SimVars/LVars (e.g. Caravan without SimBrief import)',
    );
    const loadMethodRaw = (
      await ask('Load method (1=native-simbrief, 2=direct-injection)', '1')
    )
      .trim()
      .toLowerCase();
    const loadMethod: 'native-simbrief' | 'direct-injection' =
      loadMethodRaw === '2' ||
      loadMethodRaw.includes('direct') ||
      loadMethodRaw.includes('inject')
        ? 'direct-injection'
        : 'native-simbrief';
    printKv([['loadMethod', loadMethod]]);

    if (loadMethod === 'native-simbrief') {
      printSection('OFP monitor path (native-simbrief)');
      console.log('  No Skyline inject — draft a monitor profile for resolve/catalog, then roles pack.');
      console.log('  Checklist after promote:');
      console.log('    1. Ensure pack has loadMethod: "native-simbrief" and injectCapable: false');
      console.log('    2. In MSFS: EFB/FMC/tablet → Load from SimBrief / Import OFP');
      console.log('    3. npm run compare-ofp -- --simbrief-user YOUR_ALIAS');
      console.log('    4. Career Staging: Validate Fuel and Payload (Loaded vs Due)');
      console.log('  Details: profiles/notes/ofp-homologation.md (track A)');

      if (
        !(await confirm(
          ask,
          'Promote monitor profile to profiles/examples @ 1.0.0 + seed catalog',
          true,
        ))
      ) {
        console.log('  Skipped promote — resolve will stay no_candidates until an example exists.');
        printSection('Done');
        return;
      }

      printSection('Draft monitor profile + promote');
      const drafted = await draftProfileFromLive(bridge, {
        outDir: draftsDir,
        publisher: matchPublisher,
        matchTitle,
        icao: matchIcao,
        monitorOnly: true,
        fingerprint: liveFingerprint,
      });
      printKv([
        ['draft', drafted.path],
        ['profileKey', drafted.profile.profileKey],
        ['tanks', String(drafted.profile.fuel.tanks.length)],
        ['stations', String(drafted.profile.payload.stations.length)],
        ['writePlans', 'empty (monitor-only)'],
      ]);

      const promoted = await promoteDraftProfile({
        draftPath: drafted.path,
        examplesDir,
        notesDir,
        repoRoot,
        identityTitle: identity.title,
        matchTitle,
        atcModel: identity.atcModel,
        icao: matchIcao,
        liveFingerprint,
        discoveryNotes: [
          'Load method: native-simbrief (no Skyline inject).',
          'Fuel/payload write plans intentionally empty — load via addon EFB/tablet.',
          'Use compare-ofp + Career Loaded vs Due for validation.',
        ],
      });
      printKv([
        ['example', promoted.examplePath],
        ['notes', promoted.notesPath],
        ['profileKey', promoted.profile.profileKey],
        ['semver', promoted.profile.semver],
        ['fingerprint', promoted.profile.match.fingerprint?.slice(0, 16) + '…'],
        ['icao', promoted.profile.match.icao],
        ['loadMethod', 'native-simbrief'],
        ['overwritten', promoted.overwritten ? 'yes' : 'no'],
      ]);
      console.log('  Next: npm run resolve  (should match this fingerprint)');

      const packGuesses = [
        join(repoRoot, 'profiles', 'ofp', `${promoted.profile.profileId}.json`),
        join(
          repoRoot,
          'profiles',
          'ofp',
          `${matchPublisher}-${(matchIcao || 'zz').toLowerCase()}.json`,
        ),
        join(repoRoot, 'profiles', 'ofp', `${matchPublisher}-dc6.json`),
      ];
      let defaultPack = '';
      for (const guess of packGuesses) {
        try {
          await readFile(guess, 'utf8');
          defaultPack = guess;
          break;
        } catch {
          /* try next */
        }
      }
      const packPathRaw = await ask(
        'Roles pack JSON to stamp loadMethod (blank skips)',
        defaultPack,
      );
      const packPath = packPathRaw.trim().replace(/^"(.*)"$/, '$1');
      if (packPath) {
        const abs =
          packPath.includes(':') ||
          packPath.startsWith('/') ||
          packPath.startsWith('\\')
            ? packPath
            : join(repoRoot, packPath);
        const pack = JSON.parse(await readFile(abs, 'utf8')) as OfpRolesPackFile;
        pack.loadMethod = 'native-simbrief';
        pack.injectCapable = false;
        const titles = new Set(
          [...(pack.matchTitles ?? []), matchTitle, identity.title].filter(Boolean),
        );
        pack.matchTitles = [...titles];
        await writeFile(abs, `${JSON.stringify(pack, null, 2)}\n`, 'utf8');
        console.log(`  Stamped ${abs}`);
        const inferredClass = inferCareerClassFromIcao(matchIcao);
        const aircraftClassId = await chooseFromList(
          ask,
          'Skyline Career economic class',
          CAREER_CLASS_CHOICES.map((choice) => choice.value),
          { defaultValue: inferredClass },
        );
        const registered = await registerCareerPlayerAirframe({
          repoRoot,
          rolesPackPath: abs,
          pack,
          aircraftClassId:
            CAREER_CLASS_CHOICES.find(
              (choice) => choice.value === aircraftClassId,
            )?.value ?? inferredClass,
          title: matchTitle,
        });
        console.log(
          `  Aircraft Market: ${registered.label} (${registered.aircraftClassId})`,
        );
      } else {
        console.log(
          '  No roles pack stamped — create/update with scaffold-ofp-roles or draft-ofp-roles.',
        );
      }

      printSection('Done');
      console.log(
        '  Native SimBrief path complete — resolve should match this fingerprint; validate with compare-ofp after tablet load.',
      );
      return;
    }

    console.log(
      '  Continuing writable inject path — draft + calibrate + smoke required.',
    );
    console.log(
      '  On promote, wizard writes/merges the Career roles pack (direct-injection + injectCapable).',
    );

    printSection('2/5 Probe (capacities)');
    const totalCap = await tryRead(bridge, 'FUEL TOTAL CAPACITY', 'gallons');
    const totalQty = await tryRead(bridge, 'FUEL TOTAL QUANTITY', 'gallons');
    const leftMainCap = await tryRead(bridge, 'FUEL TANK LEFT MAIN CAPACITY', 'gallons');
    const rightMainCap = await tryRead(bridge, 'FUEL TANK RIGHT MAIN CAPACITY', 'gallons');
    const centerCap = await tryRead(bridge, 'FUEL TANK CENTER CAPACITY', 'gallons');
    const centerQty = await tryRead(bridge, 'FUEL TANK CENTER QUANTITY', 'gallons');
    const leftAuxCap = await tryRead(bridge, 'FUEL TANK LEFT AUX CAPACITY', 'gallons');
    const rightAuxCap = await tryRead(bridge, 'FUEL TANK RIGHT AUX CAPACITY', 'gallons');
    const leftAuxQty = await tryRead(bridge, 'FUEL TANK LEFT AUX QUANTITY', 'gallons');
    const rightAuxQty = await tryRead(bridge, 'FUEL TANK RIGHT AUX QUANTITY', 'gallons');
    const fs1 = await tryRead(bridge, 'FUELSYSTEM TANK CAPACITY:1', 'gallons');
    printKv([
      ['fuel dens', `${roundFuel(lbPerGal, 3)} lb/gal`],
      ['FUELSYSTEM:1 cap', formatGalLbs(fs1 ?? 0, lbPerGal)],
      ['total cap/qty', `${formatGalLbs(totalCap, lbPerGal)} / ${formatGalLbs(totalQty, lbPerGal)}`],
      ['left main cap', formatGalLbs(leftMainCap, lbPerGal)],
      ['right main cap', formatGalLbs(rightMainCap, lbPerGal)],
      ['center cap/qty', `${formatGalLbs(centerCap, lbPerGal)} / ${formatGalLbs(centerQty, lbPerGal)}`],
      [
        'left aux cap/qty',
        `${formatGalLbs(leftAuxCap, lbPerGal)} / ${formatGalLbs(leftAuxQty, lbPerGal)}`,
      ],
      [
        'right aux cap/qty',
        `${formatGalLbs(rightAuxCap, lbPerGal)} / ${formatGalLbs(rightAuxQty, lbPerGal)}`,
      ],
      ['stations', payloadLive.count],
      ['payload tot', formatLb(payloadLive.totalLb)],
      ['payload stn', formatStationsLine(payloadLive.stations)],
    ]);
    const classicLikely = (fs1 ?? 0) < 5 && (leftMainCap ?? totalCap ?? 0) >= 5;
    const centerLikely = (centerCap ?? 0) >= 5;
    if (classicLikely && centerLikely) {
      console.log(
        `  → Classic 3-tank layout likely (L/R main + center). total≈${roundFuel(totalCap ?? 0)} gal.`,
      );
    } else if (classicLikely) {
      console.log('  → Likely classic tanks (FUELSYSTEM dead). Same path as Black Square.');
    } else {
      console.log(
        '  → FUELSYSTEM capacity live — draft prefers classic slots if writetest proves them.',
      );
    }

    printSection('3/5 Tank discovery + writetest');
    console.log('  Probing classic fuel slots (read capacity → write probe → restore)...');
    const fuelProbes = await discoverClassicFuelTanks(bridge);
    const liveTanks = liveFuelTanks(fuelProbes);
    for (const p of fuelProbes) {
      const capStr = p.capacity !== null ? formatGalLbs(p.capacity, lbPerGal) : 'cap?—';
      if (p.live) {
        const residual =
          p.after !== null && p.target !== null
            ? Math.abs(p.after - p.target)
            : 0;
        const residualNote =
          residual > writeTolerance(p.target ?? 0)
            ? ` (offset residual ${residual.toFixed(1)} gal — calibrate will measure)`
            : '';
        console.log(`  ✓ ${p.id.padEnd(10)} ${capStr}  writable (restored)${residualNote}`);
      } else if (p.writable && !p.hasCapacity) {
        console.log(`  · ${p.id.padEnd(10)} ghost write (cap < 5) — skipped`);
      } else if (p.hasCapacity && p.changed) {
        console.log(
          `  ~ ${p.id.padEnd(10)} ${capStr}  partial write — ${p.note ?? 'did not reach target'}`,
        );
      } else if (p.hasCapacity && !p.writable) {
        console.log(`  ✗ ${p.id.padEnd(10)} ${capStr}  write ignored`);
      } else {
        console.log(`  · ${p.id.padEnd(10)} inactive${p.note ? ` (${p.note})` : ''}`);
      }
    }
    const partialTanks = fuelProbes.filter((p) => p.hasCapacity && !p.writable && p.changed);
    console.log(
      liveTanks.length > 0
        ? `  → Live tanks for draft: ${liveTanks.map((t) => t.id).join(', ')}`
        : '  → No classic tanks responded (capacity≥5 + writable).',
    );
    if (partialTanks.length > 0) {
      console.log(
        `  → ${partialTanks.map((t) => t.id).join(', ')} moved but settled off target — vendor fuel system may rebalance after the write.`,
      );
    }

    console.log('  Payload station writetest (write → settle → restore, 50 ms gap)...');
    const stationProbes = await discoverWritablePayloadStations(bridge, {
      writeGapMs: 50,
      settleMs: 400,
    });
    const liveStationIndexes = stickyStationIndexes(stationProbes);
    for (const p of stationProbes) {
      if (p.live) {
        console.log(`  ✓ Station ${String(p.index).padStart(2)}  writable (restored)`);
      } else if (p.note?.includes('ghost') || (p.after !== null && !p.changed)) {
        console.log(`  · Station ${String(p.index).padStart(2)}  ghost (write ignored)`);
      } else if (p.changed) {
        console.log(
          `  ~ Station ${String(p.index).padStart(2)}  partial — ${p.note ?? 'did not reach target'}`,
        );
      } else {
        console.log(
          `  ✗ Station ${String(p.index).padStart(2)}  ${p.note ?? 'write ignored'}`,
        );
      }
    }
    console.log(
      liveStationIndexes.length > 0
        ? `  → Sticky stations for draft: ${liveStationIndexes.join(', ')}`
        : '  → No payload stations retained weight after writetest.',
    );

    let fsWriteOk = false;
    try {
      const beforeFs = await bridge.readSimVar({ name: 'FUELSYSTEM TANK QUANTITY:1', unit: 'gallons' });
      await bridge.writeSimVar({ name: 'FUELSYSTEM TANK QUANTITY:1', unit: 'gallons', value: 40 });
      const afterFs =
        (await readAfterWriteSettles(bridge, 'FUELSYSTEM TANK QUANTITY:1', 40)) ?? beforeFs;
      fsWriteOk = isFuelWriteAccepted(beforeFs, afterFs, 40);
      await bridge.writeSimVar({ name: 'FUELSYSTEM TANK QUANTITY:1', unit: 'gallons', value: beforeFs });
      await bridge.delay(200);
      if (fsWriteOk) {
        console.log('  ✓ FUELSYSTEM TANK QUANTITY:1 writable');
      } else if (Math.abs(afterFs - beforeFs) > 0.05) {
        console.log(
          `  ~ FUELSYSTEM TANK QUANTITY:1 partial write — moved ${beforeFs.toFixed(1)} → ${afterFs.toFixed(1)} gal (wanted 40)`,
        );
      } else {
        console.log('  ✗ FUELSYSTEM TANK QUANTITY:1 write ignored');
      }
    } catch {
      console.log('  · FUELSYSTEM TANK QUANTITY:1 unreadable/unwritable');
    }

    const mainsOk =
      liveTanks.some((t) => t.id === 'LEFT_MAIN') && liveTanks.some((t) => t.id === 'RIGHT_MAIN');
    const centerOk = liveTanks.some((t) => t.id === 'CENTER');
    if (!mainsOk && !(fs1 && fs1 >= 5) && !fsWriteOk) {
      console.log('  Fuel writes failed — SimConnect QUANTITY sets did not stick.');

      const recipesDir = join(repoRoot, 'profiles', 'vendors');
      const recipes = await loadVendorRecipes(recipesDir);
      // Prefer the publisher chosen in step 1 (title often lacks "pmdg" / "flightfx").
      const publisherForRecipes = matchPublisher || inferPublisherFromLiveTitle(identity.title);
      console.log(
        `  Loading vendor recipes (${recipes.length}) — publisher: ${publisherForRecipes}`,
      );

      const abortRecipe = recipes.find(
        (r) =>
          r.wizard.onClassicWriteFail === 'abort' &&
          r.publisher.toLowerCase() === publisherForRecipes.toLowerCase(),
      );
      if (abortRecipe) {
        console.log(`  Recipe ${abortRecipe.recipeId}: classic fuel writes not supported.`);
        console.log(`  ${abortRecipe.summary}`);
        if (abortRecipe.docs) console.log(`  See ${abortRecipe.docs}`);
        console.log('  Payload stations may still be writable — fuel apply needs vendor SDK support.');
        if (abortRecipe.recipeId === 'pmdg-ng3') {
          try {
            const sdk = await bridge.readPmdgNg3Fuel();
            if (sdk.available && sdk.layoutOk) {
              console.log(
                `  SDK broadcast OK — fuel read works (L=${sdk.leftLb?.toFixed(0)} R=${sdk.rightLb?.toFixed(0)} C=${sdk.centerLb?.toFixed(0)} lb @ offset ${sdk.layoutOffset}); write still unsupported.`,
              );
            } else if (sdk.available) {
              console.log(
                '  SDK broadcast OK — but fuel layout not locked yet (retry with distinctive fuel load, e.g. full tanks).',
              );
            } else {
              console.log(
                '  SDK broadcast not received — set EnableDataBroadcast=1 in 737NG3_Options.ini and reload the aircraft.',
              );
            }
          } catch (error) {
            console.log(
              `  SDK fuel probe failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
        return;
      }

      // Pre-probe union of try-lvar-bridge recipe LVars for scoring.
      const probeNames = new Set<string>();
      for (const r of recipes) {
        if (r.wizard.onClassicWriteFail !== 'try-lvar-bridge') continue;
        for (const n of r.fuel.probeLVars ?? []) probeNames.add(n);
        for (const t of r.fuel.tanks) if (t.writeLVar) probeNames.add(t.writeLVar);
      }
      const pre = await probeLVars(bridge, [...probeNames]);
      const readableLVars = new Set(pre.filter((r) => r.ok).map((r) => r.name));

      const scored = scoreRecipesForLvarFallback(recipes, {
        title: identity.title,
        publisher: publisherForRecipes,
        classicWritetestFailed: true,
        readableLVars,
      });

      if (scored.length === 0) {
        console.log('  No vendor recipe matched for lvar-bridge fallback.');
        console.log('  Next: run `npm run probe-lvars` / add a profiles/vendors recipe.');
        if (centerLikely) {
          console.log(
            `  Note: CENTER tank is live (${formatGalLbs(centerCap, lbPerGal)}) — profile will need LEFT/RIGHT/CENTER when writable.`,
          );
        }
        return;
      }

      const best = scored[0]!;
      console.log(
        `  Recipe match: ${best.recipe.recipeId} (score=${best.score}, ${best.reasons.join('+')})`,
      );
      console.log(`  ${best.recipe.summary}`);

      const { writeProbe } = await probeRecipeLvars(bridge, best.recipe);
      if (writeProbe) {
        console.log(
          writeProbe.ok
            ? `  ✓ LVar ${writeProbe.name} write ${writeProbe.before} → ${writeProbe.after} (wanted ${writeProbe.target})`
            : `  ✗ LVar ${writeProbe.name} write ignored (${writeProbe.before} → ${writeProbe.after})`,
        );
      }

      if (!writeProbe?.ok) {
        console.log('  Recipe LVar write probe failed — cannot promote via lvar-bridge yet.');
        return;
      }

      if (
        !(await confirm(
          ask,
          `Continue homologation via recipe ${best.recipe.recipeId} (lvar-bridge)`,
          true,
        ))
      ) {
        console.log('Stopped after recipe discovery.');
        return;
      }

      printSection(`4/5 Draft + calibrate (${best.recipe.recipeId})`);
      const drafted = await draftProfileFromVendorRecipe(bridge, best.recipe, {
        outDir: draftsDir,
        matchTitle,
        icao: matchIcao,
      });
      const { calibration, perf, emptyWeightLb, mtowLb } =
        await calibrateWithCgSources(
          ask,
          bridge,
          drafted.path,
          matchTitle,
          matchPublisher,
          matchIcao,
        );
      let profile = JSON.parse(await readFile(drafted.path, 'utf8')) as AircraftProfile;
      printKv([
        ['draft', drafted.path],
        ['recipe', best.recipe.recipeId],
        ['profileKey', profile.profileKey],
        ['strategy', profile.fuel.strategy],
        ['tanks', profile.fuel.tanks.map((t) => t.id).join(', ')],
        [
          'capacities',
          profile.fuel.tanks
            .map((t) => `${t.id} ${formatGalLbs(t.capacity, lbPerGal)}`)
            .join(', '),
        ],
        ['stations', profile.payload.stations.length],
        ['CG envelope', `${profile.cg?.constraints?.minMac}..${profile.cg?.constraints?.maxMac}`],
        ['CG source', profile.cg?.envelopeSource],
        ['fuelOffset', calibration.fuelOffsetApplied],
        ...catalogPerfPrintRows(perf).filter(([k]) => k !== 'aircraft.cfg'),
      ]);

      printSection('5/5 Smoke');
      const smoke = await runSmoke(bridge, profile);
      printKv([
        ['fuel ok', smoke.apply.fuel?.success],
        ['payload ok', smoke.apply.payload?.success],
        ['cg ok', 'cg' in smoke.apply ? smoke.apply.cg?.ok : undefined],
        ['targets', formatProfileFuelLine(profile, smoke.targets, lbPerGal)],
        ['before', formatProfileFuelLine(profile, smoke.beforeFuel, lbPerGal)],
        ['after', formatProfileFuelLine(profile, smoke.afterFuel, lbPerGal)],
        [
          'payload after',
          `${formatLb(smoke.afterPayload.totalLb)} · ${formatStationsLine(smoke.afterPayload.stations)}`,
        ],
      ]);
      if (!smoke.ok) {
        console.log('  Smoke failed — fix draft manually or re-run wizard.');
        console.log(`  Draft left at: ${drafted.path}`);
        return;
      }

      console.log('');
      console.log('  Check the vendor tablet / Mass & Balance UI now.');
      if (!(await confirm(ask, 'UI looks correct (fuel/payload)', true))) {
        console.log(`  Draft kept for manual edit: ${drafted.path}`);
        return;
      }

      const tanksApply: Record<string, number> = {};
      for (const tank of profile.fuel.tanks) {
        const def = defaultTestApplyGallons(tank.id);
        tanksApply[tank.id] = Number(
          await ask(
            `Test apply ${tank.name ?? tank.id} gal (~${roundFuel(Number(def) * lbPerGal)} lb)`,
            def,
          ),
        );
      }
      const engine = new DefaultProfileEngine({ profile, bridge });
      const apply = await engine.applyLoadPlan({
        fuel: { tanks: tanksApply },
        payload: { stations: { 1: 180 }, total: 180 },
      });
      const afterApplySnap = await bridge.snapshot();
      const payloadNow = await readProfileStationWeights(bridge, profile, afterApplySnap);
      printKv([
        ['apply fuel', apply.fuel?.success],
        [
          'apply payload',
          `${apply.payload?.success} · ${formatLb(payloadNow.totalLb)} · ${formatStationsLine(payloadNow.stations)}`,
        ],
        ['apply tanks', formatProfileFuelLine(profile, tanksApply, lbPerGal)],
        ['apply cg', 'cg' in apply ? apply.cg?.ok : undefined],
      ]);

      if (!(await confirm(ask, 'Promote to profiles/examples @ 1.0.0 + seed catalog', true))) {
        console.log(`  Draft kept: ${drafted.path}`);
        return;
      }

      const discoveryNotes = [
        `Drafted from vendor recipe ${best.recipe.recipeId}.`,
        best.recipe.summary,
        `Fuel strategy: ${profile.fuel.strategy}; tanks: ${profile.fuel.tanks.map((t) => t.id).join(', ')}.`,
        best.recipe.docs ? `See ${best.recipe.docs}` : undefined,
        'Homologated with interactive wizard (recipe lvar-bridge).',
      ].filter(Boolean) as string[];

      const promoted = await promoteDraftProfile({
        draftPath: drafted.path,
        examplesDir,
        notesDir,
        repoRoot,
        identityTitle: identity.title,
        matchTitle,
        atcModel: identity.atcModel,
        icao: matchIcao,
        liveFingerprint,
        discoveryNotes,
        runSeed: await confirm(ask, 'Run db:seed (Postgres if DATABASE_URL set)', true),
      });

      printSection('Done');
      printKv([
        ['example', promoted.examplePath],
        ['notes', promoted.notesPath],
        ['recipe', best.recipe.recipeId],
        ['profileKey', promoted.profile.profileKey],
        ['semver', promoted.profile.semver],
        ['fingerprint', promoted.profile.match.fingerprint?.slice(0, 16) + '…'],
        ['icao', promoted.profile.match.icao],
        ['strategy', promoted.profile.fuel.strategy],
        ['loadMethod', 'direct-injection'],
        ['overwritten', promoted.overwritten ? 'yes' : 'no'],
      ]);
      await writeCareerRolesPackAfterPromote(
        ask,
        repoRoot,
        promoted.profile,
        perf,
        { emptyWeightLb, mtowLb, lbPerGal },
      );
      console.log('');
      console.log('Next:');
      console.log('  node packages/agent/dist/cli.js resolve');
      console.log(applyAutoHint(promoted.profile));
      return;
    }
    if (centerLikely && !centerOk) {
      console.log(
        '  Warning: CENTER has capacity but writes failed — mains ok; decide later if CENTER needs LVar path.',
      );
    }

    // AUX/TIP already in liveTanks when capacity≥5 + writable — no separate confirm.
    const includeAux = liveTanks.some((t) => t.id === 'LEFT_AUX' || t.id === 'RIGHT_AUX');
    if (includeAux) {
      console.log('  AUX tanks detected live — will be included in draft.');
    }
    const tipLive = liveTanks.some((t) => t.id === 'LEFT_TIP' || t.id === 'RIGHT_TIP');
    if (tipLive) {
      console.log('  TIP tanks detected live — will be included in draft.');
    }

    if (liveStationIndexes.length === 0) {
      console.log(
        '  No sticky payload stations — cannot draft an inject profile. Fix SimConnect payload or use NATIVE-SIMBRIEF monitor path.',
      );
      return;
    }

    if (!(await confirm(ask, 'Continue to draft + calibrate', true))) {
      console.log('Stopped after discovery.');
      return;
    }

    printSection('4/5 Draft + calibrate');
    const drafted = await draftProfileFromLive(bridge, {
      outDir: draftsDir,
      matchTitle,
      icao: matchIcao,
      publisher: matchPublisher,
      liveTankIds: liveTanks.map((t) => t.id),
      liveStationIndexes,
    });
    let profile = drafted.profile;
    // Safety net: if discovery missed AUX but probe capacities said real, still allow ensureAux.
    if (
      !includeAux &&
      ((leftAuxCap !== null && leftAuxCap >= 5) || (rightAuxCap !== null && rightAuxCap >= 5))
    ) {
      const addAux = await confirm(ask, 'AUX capacity ≥5 but write probe failed earlier. Force-include AUX', false);
      if (addAux) {
        profile = await ensureAuxTanks(profile, {
          left: leftAuxCap && leftAuxCap >= 5 ? leftAuxCap : Math.max(leftAuxQty ?? 0, 15),
          right: rightAuxCap && rightAuxCap >= 5 ? rightAuxCap : Math.max(rightAuxQty ?? 0, 15),
        });
        await writeFile(drafted.path, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
        console.log('  AUX tanks force-added to draft.');
      }
    }

    const { calibration, perf, emptyWeightLb, mtowLb } =
      await calibrateWithCgSources(
        ask,
        bridge,
        drafted.path,
        matchTitle,
        matchPublisher,
        matchIcao,
      );
    profile = JSON.parse(await readFile(drafted.path, 'utf8')) as AircraftProfile;
    printKv([
      ['draft', drafted.path],
      ['profileKey', profile.profileKey],
      ['tanks', profile.fuel.tanks.map((t) => t.id).join(', ')],
      [
        'capacities',
        profile.fuel.tanks
          .map((t) => `${t.id} ${formatGalLbs(t.capacity, lbPerGal)}`)
          .join(', '),
      ],
      ['stations', profile.payload.stations.length],
      ['CG envelope', `${profile.cg?.constraints?.minMac}..${profile.cg?.constraints?.maxMac}`],
      ['CG source', profile.cg?.envelopeSource],
      ['fuelOffset', calibration.fuelOffsetApplied],
      ...catalogPerfPrintRows(perf).filter(([k]) => k !== 'aircraft.cfg'),
    ]);

    printSection('5/5 Smoke');
    const smoke = await runSmoke(bridge, profile);
    printKv([
      ['fuel ok', smoke.apply.fuel?.success],
      ['payload ok', smoke.apply.payload?.success],
      ['cg ok', 'cg' in smoke.apply ? smoke.apply.cg?.ok : undefined],
      ['targets', formatProfileFuelLine(profile, smoke.targets, lbPerGal)],
      ['before', formatProfileFuelLine(profile, smoke.beforeFuel, lbPerGal)],
      ['after', formatProfileFuelLine(profile, smoke.afterFuel, lbPerGal)],
      [
        'payload tgt',
        `${formatLb(Object.values(smoke.payloadTargets).reduce((a, b) => a + b, 0))} · ${formatStationsLine(
          Object.entries(smoke.payloadTargets).map(([i, lb]) => ({ index: Number(i), lb })),
        )}`,
      ],
      [
        'payload before',
        `${formatLb(smoke.beforePayload.totalLb)} · ${formatStationsLine(smoke.beforePayload.stations)}`,
      ],
      [
        'payload after',
        `${formatLb(smoke.afterPayload.totalLb)} · ${formatStationsLine(smoke.afterPayload.stations)}`,
      ],
    ]);
    if (!smoke.ok) {
      console.log('  Smoke failed — fix draft manually or re-run wizard.');
      console.log(`  Draft left at: ${drafted.path}`);
      return;
    }

    console.log('');
    console.log('  Check the vendor EFB / Mass & Balance UI now.');
    if (!(await confirm(ask, 'UI looks correct (fuel/payload)', true))) {
      console.log(`  Draft kept for manual edit: ${drafted.path}`);
      return;
    }

    const tanksApply: Record<string, number> = {};
    for (const tank of profile.fuel.tanks) {
      const def = defaultTestApplyGallons(tank.id);
      tanksApply[tank.id] = Number(
        await ask(
          `Test apply ${tank.name ?? tank.id} gal (~${roundFuel(Number(def) * lbPerGal)} lb)`,
          def,
        ),
      );
    }
    const engine = new DefaultProfileEngine({ profile, bridge });
    const apply = await engine.applyLoadPlan({
      fuel: { tanks: tanksApply },
      payload: { stations: { 1: 180 }, total: 180 },
    });
    const afterApplySnap = await bridge.snapshot();
    const payloadNow = await readProfileStationWeights(bridge, profile, afterApplySnap);
    printKv([
      ['apply fuel', apply.fuel?.success],
      [
        'apply payload',
        `${apply.payload?.success} · ${formatLb(payloadNow.totalLb)} · ${formatStationsLine(payloadNow.stations)}`,
      ],
      ['apply tanks', formatProfileFuelLine(profile, tanksApply, lbPerGal)],
      ['apply cg', 'cg' in apply ? apply.cg?.ok : undefined],
    ]);

    if (!(await confirm(ask, 'Promote to profiles/examples @ 1.0.0 + seed catalog', true))) {
      console.log(`  Draft kept: ${drafted.path}`);
      return;
    }

    const discoveryNotes = [
      liveTanks.length > 0
        ? `Fuel via classic FUEL TANK * from writetest (${liveTanks.map((t) => t.id).join(', ')}).`
        : classicLikely
          ? 'Fuel via classic FUEL TANK * (offset 0). Do not use FUELSYSTEM.'
          : 'Fuel via FUELSYSTEM where capacity >= 5 (no classic writetest hits).',
      includeAux ? 'AUX/Aft tanks included.' : 'AUX deferred for v1.',
      `Payload stations from writetest: ${liveStationIndexes.join(', ')}.`,
      'Station maxLoad: placeholder until flight_model.cfg calibrate.',
      'Homologated with interactive wizard.',
    ];

    const promoted = await promoteDraftProfile({
      draftPath: drafted.path,
      examplesDir,
      notesDir,
      repoRoot,
      identityTitle: identity.title,
      matchTitle,
      atcModel: identity.atcModel,
      icao: matchIcao,
      liveFingerprint,
      discoveryNotes,
      runSeed: await confirm(ask, 'Run db:seed (Postgres if DATABASE_URL set)', true),
    });

    printSection('Done');
    printKv([
      ['example', promoted.examplePath],
      ['notes', promoted.notesPath],
      ['profileKey', promoted.profile.profileKey],
      ['semver', promoted.profile.semver],
      ['fingerprint', promoted.profile.match.fingerprint?.slice(0, 16) + '…'],
      ['icao', promoted.profile.match.icao],
      ['loadMethod', 'direct-injection'],
      ['overwritten', promoted.overwritten ? 'yes' : 'no'],
    ]);
    await writeCareerRolesPackAfterPromote(
      ask,
      repoRoot,
      promoted.profile,
      perf,
      { emptyWeightLb, mtowLb, lbPerGal },
    );
    console.log('');
    console.log('Next:');
    console.log('  node packages/agent/dist/cli.js resolve');
    console.log(applyAutoHint(promoted.profile));
    return;
  });
}
