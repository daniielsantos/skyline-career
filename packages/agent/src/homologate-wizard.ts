import { readFile, writeFile } from 'node:fs/promises';
import { DefaultProfileEngine } from '@msfs-compat/runtime';
import type { AircraftProfile } from '@msfs-compat/shared';
import { normalizeAircraftTitle } from '@msfs-compat/shared';
import { calibrateProfile } from './calibrate-profile.js';
import { draftA2aAerostarProfile } from './draft-a2a-aerostar.js';
import { draftProfileFromLive } from './draft-profile.js';
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';
import { confirm, printKv, printSection, withPrompts } from './prompt.js';
import { ensureAuxTanks, cleanIcaoCode, normalizeConfirmedIcao, promoteDraftProfile } from './promote-profile.js';
import { probeLVars } from './probe-lvars.js';

export interface HomologateWizardOptions {
  bridge: NamedPipeSimBridge;
  repoRoot: string;
  draftsDir: string;
  examplesDir: string;
  notesDir: string;
}

type WritetestOutcome = {
  var: string;
  matched: boolean;
  changed: boolean;
  writeOffsetHint: number | null;
  before: number | { error: string };
  after: number | { error: string } | null;
};

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

function formatPairGalLbs(
  left: number | null | undefined,
  right: number | null | undefined,
  lbPerGal: number,
): string {
  return `${formatGalLbs(left, lbPerGal)} / ${formatGalLbs(right, lbPerGal)}`;
}

function formatLb(n: number | null | undefined): string {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${roundFuel(v)} lb`;
}

type StationWeight = { index: number; lb: number };

function readStationWeights(snap: {
  vars?: Record<string, number | undefined>;
  payloadTotal?: number;
}): { count: number; stations: StationWeight[]; totalLb: number } {
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

/** Compact station line: `1=180 2=0 3=50 …` (zeros kept so layout is visible). */
function formatStationsLine(stations: StationWeight[]): string {
  if (stations.length === 0) return '—';
  return stations.map((s) => `${s.index}=${roundFuel(s.lb)}`).join(' ');
}

async function runWritetest(bridge: NamedPipeSimBridge): Promise<WritetestOutcome[]> {
  const tests: Array<{ name: string; unit: string; value: number }> = [
    { name: 'FUELSYSTEM TANK QUANTITY:1', unit: 'gallons', value: 40 },
    { name: 'FUEL TANK LEFT MAIN QUANTITY', unit: 'gallons', value: 35 },
    { name: 'FUEL TANK RIGHT MAIN QUANTITY', unit: 'gallons', value: 35 },
    { name: 'FUEL TANK CENTER QUANTITY', unit: 'gallons', value: 20 },
    { name: 'FUEL TANK LEFT AUX QUANTITY', unit: 'gallons', value: 15 },
    { name: 'FUEL TANK RIGHT AUX QUANTITY', unit: 'gallons', value: 15 },
    { name: 'PAYLOAD STATION WEIGHT:1', unit: 'pounds', value: 180 },
    { name: 'PAYLOAD STATION WEIGHT:3', unit: 'pounds', value: 50 },
  ];

  const outcomes: WritetestOutcome[] = [];
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
        matched: false,
        changed: false,
        writeOffsetHint: null,
        before,
        after: null,
      });
      continue;
    }
    try {
      await bridge.writeSimVar(test);
      await bridge.delay(350);
    } catch {
      outcomes.push({
        var: test.name,
        matched: false,
        changed: false,
        writeOffsetHint: null,
        before,
        after: null,
      });
      continue;
    }
    let after: number | { error: string };
    try {
      after = await bridge.readSimVar({ name: test.name, unit: test.unit });
    } catch (e) {
      after = { error: e instanceof Error ? e.message : String(e) };
    }
    const matched =
      typeof after === 'number'
        ? Math.abs(after - test.value) <= Math.max(Math.abs(test.value) * 0.05, 0.25)
        : false;
    outcomes.push({
      var: test.name,
      matched,
      changed: typeof after === 'number' ? Math.abs(after - before) > 0.05 : false,
      writeOffsetHint: typeof after === 'number' ? Number((test.value - after).toFixed(3)) : null,
      before,
      after,
    });
  }
  return outcomes;
}

async function runSmoke(
  bridge: NamedPipeSimBridge,
  profile: AircraftProfile,
): Promise<{
  ok: boolean;
  targets: Record<string, number>;
  beforeFuel: Record<string, number | undefined>;
  afterFuel: Record<string, number | undefined>;
  beforePayload: ReturnType<typeof readStationWeights>;
  afterPayload: ReturnType<typeof readStationWeights>;
  payloadTargets: Record<number, number>;
  apply: Awaited<ReturnType<DefaultProfileEngine['applyLoadPlan']>>;
}> {
  const engine = new DefaultProfileEngine({ profile, bridge });
  const leftCap = profile.fuel.tanks.find((t) => t.id === 'LEFT_MAIN')?.capacity ?? 40;
  const rightCap = profile.fuel.tanks.find((t) => t.id === 'RIGHT_MAIN')?.capacity ?? 40;
  const fuelTanks: Record<string, number> = {
    LEFT_MAIN: Math.max(5, Math.floor(leftCap * 0.8)),
    RIGHT_MAIN: Math.max(5, Math.floor(rightCap * 0.8)),
  };
  const leftAuxCap = profile.fuel.tanks.find((t) => t.id === 'LEFT_AUX')?.capacity;
  const rightAuxCap = profile.fuel.tanks.find((t) => t.id === 'RIGHT_AUX')?.capacity;
  if (leftAuxCap !== undefined) fuelTanks.LEFT_AUX = Math.max(0, Math.floor(leftAuxCap * 0.5));
  if (rightAuxCap !== undefined) fuelTanks.RIGHT_AUX = Math.max(0, Math.floor(rightAuxCap * 0.5));
  const centerCap = profile.fuel.tanks.find((t) => t.id === 'CENTER')?.capacity;
  if (centerCap !== undefined) fuelTanks.CENTER = Math.max(5, Math.floor(centerCap * 0.8));

  const stationTargets: Record<number, number> = {};
  for (const station of profile.payload.stations) stationTargets[station.index] = 0;
  if (stationTargets[1] !== undefined) stationTargets[1] = 180;
  if (stationTargets[3] !== undefined) stationTargets[3] = 50;
  if (stationTargets[5] !== undefined) stationTargets[5] = 25;

  const before = await bridge.snapshot();
  const apply = await engine.applyLoadPlan({
    fuel: { tanks: fuelTanks },
    payload: {
      stations: stationTargets,
      total: Object.values(stationTargets).reduce((a, b) => a + b, 0),
    },
  });
  const after = await bridge.snapshot();

  const pick = (snap: typeof before) => ({
    LEFT_MAIN: snap.vars?.['FUEL TANK LEFT MAIN QUANTITY'],
    RIGHT_MAIN: snap.vars?.['FUEL TANK RIGHT MAIN QUANTITY'],
    CENTER: snap.vars?.['FUEL TANK CENTER QUANTITY'],
  });

  const fuelOk = apply.fuel?.success === true;
  const payloadOk = apply.payload?.success === true;
  const cgOk = !('cg' in apply) || apply.cg === undefined || apply.cg.ok !== false;

  return {
    ok: fuelOk && payloadOk && cgOk,
    targets: fuelTanks,
    beforeFuel: pick(before),
    afterFuel: pick(after),
    beforePayload: readStationWeights(before),
    afterPayload: readStationWeights(after),
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
      console.log('  → FUELSYSTEM may be live — draft will prefer it when capacity >= 5.');
    }

    printSection('3/5 Writetest');
    console.log('  Writing sample values (mains/center/aux/stations)...');
    const outcomes = await runWritetest(bridge);
    const matched = outcomes.filter((o) => o.matched);
    const failed = outcomes.filter((o) => !o.matched);
    for (const o of matched) {
      console.log(`  ✓ ${o.var}  offset=${o.writeOffsetHint ?? '—'}`);
    }
    for (const o of failed) {
      const stuck =
        typeof o.before === 'number' && typeof o.after === 'number' && Math.abs(o.after - o.before) < 0.05
          ? ' (write ignored — value unchanged)'
          : '';
      console.log(`  ✗ ${o.var}${stuck}`);
    }
    const mainsOk = matched.some((o) => o.var.includes('LEFT MAIN')) && matched.some((o) => o.var.includes('RIGHT MAIN'));
    const centerOk = matched.some((o) => o.var.includes('CENTER QUANTITY'));
    const auxWriteOk =
      matched.some((o) => o.var.includes('LEFT AUX')) && matched.some((o) => o.var.includes('RIGHT AUX'));
    // Many airframes accept AUX SimVar writes even with 0 capacity (ghost tanks). Only offer
    // inclusion when probe shows real AUX capacity (e.g. Starship Aft ~88 gal).
    const auxCapacityReal =
      (leftAuxCap !== null && leftAuxCap >= 5) || (rightAuxCap !== null && rightAuxCap >= 5);
    if (!mainsOk && !(fs1 && fs1 >= 5)) {
      console.log('  Fuel writes failed — SimConnect QUANTITY sets did not stick.');
      console.log(
        '  Typical on Accu-Sim / A2A: tablet owns fuel & payload; classic SimVars are read-only mirrors.',
      );

      console.log('  Probing Accu-Sim LVars (Fuel*Tank)…');
      const lvarProbe = await probeLVars(bridge, [
        'FuelLeftWingTank',
        'FuelRightWingTank',
        'FuelFuselageTank',
        'Character1Weight',
      ]);
      const lvarReadable = lvarProbe.filter((r) => r.ok);
      for (const r of lvarReadable) {
        console.log(`  LVar ${r.name} = ${r.value}`);
      }

      let lvarFuelOk = false;
      if (lvarReadable.some((r) => r.name === 'FuelLeftWingTank')) {
        try {
          const before = await bridge.readLVar('FuelLeftWingTank');
          const target = Math.max(5, Math.min(30, Math.floor(before * 0.5) || 20));
          await bridge.writeLVar({ name: 'FuelLeftWingTank', value: target });
          await bridge.delay(400);
          const after = await bridge.readLVar('FuelLeftWingTank');
          lvarFuelOk = Math.abs(after - target) <= Math.max(target * 0.05, 0.25);
          console.log(
            lvarFuelOk
              ? `  ✓ LVar FuelLeftWingTank write ${before} → ${after} (wanted ${target})`
              : `  ✗ LVar FuelLeftWingTank write ignored (${before} → ${after})`,
          );
          // restore
          await bridge.writeLVar({ name: 'FuelLeftWingTank', value: before });
          await bridge.delay(200);
        } catch (error) {
          console.log(
            `  ✗ LVar write error: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      if (!lvarFuelOk) {
        console.log(
          '  Next: run `npm run probe-lvars` / identify vendor LVars — cannot promote yet.',
        );
        if (centerLikely) {
          console.log(
            `  Note: CENTER tank is live (${formatGalLbs(centerCap, lbPerGal)}) — profile will need LEFT/RIGHT/CENTER when writable.`,
          );
        }
        return;
      }

      if (
        !(await confirm(
          ask,
          'Accu-Sim LVars writable. Continue homologation via lvar-bridge (Aerostar path)',
          true,
        ))
      ) {
        console.log('Stopped after LVar discovery.');
        return;
      }

      printSection('4/5 Draft + calibrate (lvar-bridge)');
      const drafted = await draftA2aAerostarProfile(bridge, {
        outDir: draftsDir,
        matchTitle,
        icao: matchIcao,
      });
      const calibration = await calibrateProfile(bridge, drafted.path);
      let profile = JSON.parse(await readFile(drafted.path, 'utf8')) as AircraftProfile;
      printKv([
        ['draft', drafted.path],
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
        ['fuelOffset', calibration.fuelOffsetApplied],
      ]);

      printSection('5/5 Smoke');
      const smoke = await runSmoke(bridge, profile);
      printKv([
        ['fuel ok', smoke.apply.fuel?.success],
        ['payload ok', smoke.apply.payload?.success],
        ['cg ok', 'cg' in smoke.apply ? smoke.apply.cg?.ok : undefined],
        [
          'targets L/R/C',
          `${formatPairGalLbs(smoke.targets.LEFT_MAIN, smoke.targets.RIGHT_MAIN, lbPerGal)} / ${formatGalLbs(smoke.targets.CENTER, lbPerGal)}`,
        ],
        [
          'before L/R/C',
          `${formatPairGalLbs(smoke.beforeFuel.LEFT_MAIN, smoke.beforeFuel.RIGHT_MAIN, lbPerGal)} / ${formatGalLbs(smoke.beforeFuel.CENTER, lbPerGal)}`,
        ],
        [
          'after L/R/C',
          `${formatPairGalLbs(smoke.afterFuel.LEFT_MAIN, smoke.afterFuel.RIGHT_MAIN, lbPerGal)} / ${formatGalLbs(smoke.afterFuel.CENTER, lbPerGal)}`,
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
      console.log('  Check the A2A tablet / Mass & Balance UI now.');
      if (!(await confirm(ask, 'UI looks correct (fuel/payload)', true))) {
        console.log(`  Draft kept for manual edit: ${drafted.path}`);
        return;
      }

      const left = Number(
        await ask(`Test apply left wing gal (~${roundFuel(40 * lbPerGal)} lb)`, '40'),
      );
      const right = Number(
        await ask(`Test apply right wing gal (~${roundFuel(40 * lbPerGal)} lb)`, '40'),
      );
      const center = Number(
        await ask(`Test apply fuselage gal (~${roundFuel(20 * lbPerGal)} lb)`, '20'),
      );
      const engine = new DefaultProfileEngine({ profile, bridge });
      const apply = await engine.applyLoadPlan({
        fuel: { tanks: { LEFT_MAIN: left, RIGHT_MAIN: right, CENTER: center } },
        payload: { stations: { 1: 180 }, total: 180 },
      });
      printKv([
        ['apply fuel', apply.fuel?.success],
        ['apply payload', apply.payload?.success],
        ['apply L/R/C', `${formatPairGalLbs(left, right, lbPerGal)} / ${formatGalLbs(center, lbPerGal)}`],
        ['apply cg', 'cg' in apply ? apply.cg?.ok : undefined],
      ]);

      if (!(await confirm(ask, 'Promote to profiles/examples @ 1.0.0 + seed catalog', true))) {
        console.log(`  Draft kept: ${drafted.path}`);
        return;
      }

      const discoveryNotes = [
        'Fuel via Accu-Sim LVars FuelLeftWingTank / FuelRightWingTank / FuelFuselageTank.',
        'Verify mirrors classic FUEL TANK LEFT/RIGHT MAIN + CENTER.',
        'Payload via Character1-6Weight + BaggageWeight LVars.',
        'See profiles/notes/a2a-piper-aerostar-600.md',
        'Homologated with interactive wizard (lvar-bridge).',
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
        ['strategy', promoted.profile.fuel.strategy],
      ]);
      console.log('');
      console.log('Next:');
      console.log('  node packages/agent/dist/cli.js resolve');
      console.log(
        '  node packages/agent/dist/cli.js apply-auto --fuel-left 30 --fuel-right 30 --fuel-center 20',
      );
      return;
    }
    if (centerLikely && !centerOk) {
      console.log(
        '  Warning: CENTER has capacity but writes failed — mains ok; decide later if CENTER needs LVar path.',
      );
    }

    let includeAux = false;
    if (auxWriteOk && auxCapacityReal) {
      includeAux = await confirm(
        ask,
        'AUX/Aft tanks have capacity and are writable. Include them in the profile',
        true,
      );
    } else if (auxWriteOk && !auxCapacityReal) {
      console.log(
        '  AUX SimVars accepted writes but capacity is 0 — treating as ghost tanks (not offered).',
      );
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
    });
    let profile = drafted.profile;
    if (includeAux) {
      const leftCapGuess =
        leftAuxCap && leftAuxCap >= 5
          ? leftAuxCap
          : Math.max(leftAuxQty ?? 0, 15);
      const rightCapGuess =
        rightAuxCap && rightAuxCap >= 5
          ? rightAuxCap
          : Math.max(rightAuxQty ?? 0, 15);
      profile = await ensureAuxTanks(profile, {
        left: leftCapGuess,
        right: rightCapGuess,
      });
      await writeFile(drafted.path, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
      console.log('  AUX tanks added to draft.');
    }

    const calibration = await calibrateProfile(bridge, drafted.path);
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
      ['fuelOffset', calibration.fuelOffsetApplied],
    ]);

    printSection('5/5 Smoke');
    const smoke = await runSmoke(bridge, profile);
    printKv([
      ['fuel ok', smoke.apply.fuel?.success],
      ['payload ok', smoke.apply.payload?.success],
      ['cg ok', 'cg' in smoke.apply ? smoke.apply.cg?.ok : undefined],
      [
        'targets L/R',
        formatPairGalLbs(smoke.targets.LEFT_MAIN, smoke.targets.RIGHT_MAIN, lbPerGal),
      ],
      [
        'before L/R',
        formatPairGalLbs(smoke.beforeFuel.LEFT_MAIN, smoke.beforeFuel.RIGHT_MAIN, lbPerGal),
      ],
      [
        'after L/R',
        formatPairGalLbs(smoke.afterFuel.LEFT_MAIN, smoke.afterFuel.RIGHT_MAIN, lbPerGal),
      ],
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

    const left = Number(
      await ask(`Test apply left main gal (~${roundFuel(40 * lbPerGal)} lb @ dens)`, '40'),
    );
    const right = Number(
      await ask(`Test apply right main gal (~${roundFuel(40 * lbPerGal)} lb @ dens)`, '40'),
    );
    const engine = new DefaultProfileEngine({ profile, bridge });
    const tanks: Record<string, number> = { LEFT_MAIN: left, RIGHT_MAIN: right };
    if (profile.fuel.tanks.some((t) => t.id === 'LEFT_AUX')) {
      tanks.LEFT_AUX = Number(await ask('Test apply left aux gal', '0'));
    }
    if (profile.fuel.tanks.some((t) => t.id === 'RIGHT_AUX')) {
      tanks.RIGHT_AUX = Number(await ask('Test apply right aux gal', '0'));
    }
    const apply = await engine.applyLoadPlan({ fuel: { tanks } });
    printKv([
      ['apply fuel', apply.fuel?.success],
      ['apply L/R', formatPairGalLbs(left, right, lbPerGal)],
      ['apply cg', 'cg' in apply ? apply.cg?.ok : undefined],
    ]);

    if (!(await confirm(ask, 'Promote to profiles/examples @ 1.0.0 + seed catalog', true))) {
      console.log(`  Draft kept: ${drafted.path}`);
      return;
    }

    const discoveryNotes = [
      classicLikely
        ? 'Fuel via classic FUEL TANK * (offset 0). Do not use FUELSYSTEM.'
        : 'Draft preferred FUELSYSTEM where capacity >= 5.',
      includeAux ? 'AUX/Aft tanks included.' : 'AUX deferred for v1.',
      `Stations: ${profile.payload.stations.length}.`,
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
    ]);
    console.log('');
    console.log('Next:');
    console.log('  node packages/agent/dist/cli.js resolve');
    console.log('  node packages/agent/dist/cli.js apply-auto --fuel-left 20 --fuel-right 20');
  });
}
