import { readFile, writeFile } from 'node:fs/promises';
import { DefaultProfileEngine } from '@msfs-compat/runtime';
import type { AircraftProfile } from '@msfs-compat/shared';
import { normalizeAircraftTitle } from '@msfs-compat/shared';
import { calibrateProfile } from './calibrate-profile.js';
import { draftProfileFromLive } from './draft-profile.js';
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';
import { confirm, printKv, printSection, withPrompts } from './prompt.js';
import { ensureAuxTanks, cleanIcaoCode, normalizeConfirmedIcao, promoteDraftProfile } from './promote-profile.js';

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

async function runWritetest(bridge: NamedPipeSimBridge): Promise<WritetestOutcome[]> {
  const tests: Array<{ name: string; unit: string; value: number }> = [
    { name: 'FUELSYSTEM TANK QUANTITY:1', unit: 'gallons', value: 40 },
    { name: 'FUEL TANK LEFT MAIN QUANTITY', unit: 'gallons', value: 35 },
    { name: 'FUEL TANK RIGHT MAIN QUANTITY', unit: 'gallons', value: 35 },
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
  });

  const fuelOk = apply.fuel?.success === true;
  const payloadOk = apply.payload?.success === true;
  const cgOk = !('cg' in apply) || apply.cg === undefined || apply.cg.ok !== false;

  return {
    ok: fuelOk && payloadOk && cgOk,
    targets: fuelTanks,
    beforeFuel: pick(before),
    afterFuel: pick(after),
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
    printKv([
      ['bridge', `${ping.mode} connected=${ping.connected}`],
      ['title (live)', identity.title],
      ['match title?', suggestedTitle],
      ['atcModel', identity.atcModel],
      ['icao', identity.icao],
      ['empty lb', snapshot.vars?.['EMPTY WEIGHT']],
      ['mtow lb', snapshot.vars?.['MAX GROSS WEIGHT']],
      ['stations', snapshot.vars?.['PAYLOAD STATION COUNT']],
      ['CG %', snapshot.cgPercent?.toFixed?.(1) ?? snapshot.cgPercent],
      ['left main', snapshot.vars?.['FUEL TANK LEFT MAIN QUANTITY']],
      ['right main', snapshot.vars?.['FUEL TANK RIGHT MAIN QUANTITY']],
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
    const leftMainCap = await tryRead(bridge, 'FUEL TANK LEFT MAIN CAPACITY', 'gallons');
    const rightMainCap = await tryRead(bridge, 'FUEL TANK RIGHT MAIN CAPACITY', 'gallons');
    const leftAuxCap = await tryRead(bridge, 'FUEL TANK LEFT AUX CAPACITY', 'gallons');
    const rightAuxCap = await tryRead(bridge, 'FUEL TANK RIGHT AUX CAPACITY', 'gallons');
    const leftAuxQty = await tryRead(bridge, 'FUEL TANK LEFT AUX QUANTITY', 'gallons');
    const rightAuxQty = await tryRead(bridge, 'FUEL TANK RIGHT AUX QUANTITY', 'gallons');
    const fs1 = await tryRead(bridge, 'FUELSYSTEM TANK CAPACITY:1', 'gallons');
    printKv([
      ['FUELSYSTEM:1 cap', fs1 ?? 0],
      ['total capacity', totalCap],
      ['left main cap', leftMainCap],
      ['right main cap', rightMainCap],
      ['left aux cap/qty', `${leftAuxCap ?? '—'} / ${leftAuxQty ?? '—'}`],
      ['right aux cap/qty', `${rightAuxCap ?? '—'} / ${rightAuxQty ?? '—'}`],
    ]);
    const classicLikely = (fs1 ?? 0) < 5 && (leftMainCap ?? totalCap ?? 0) >= 5;
    console.log(
      classicLikely
        ? '  → Likely classic tanks (FUELSYSTEM dead). Same path as Black Square.'
        : '  → FUELSYSTEM may be live — draft will prefer it when capacity >= 5.',
    );

    printSection('3/5 Writetest');
    console.log('  Writing sample values (mains/aux/stations)...');
    const outcomes = await runWritetest(bridge);
    const matched = outcomes.filter((o) => o.matched);
    const failed = outcomes.filter((o) => !o.matched);
    for (const o of matched) {
      console.log(`  ✓ ${o.var}  offset=${o.writeOffsetHint ?? '—'}`);
    }
    for (const o of failed) {
      console.log(`  ✗ ${o.var}`);
    }
    const mainsOk = matched.some((o) => o.var.includes('LEFT MAIN')) && matched.some((o) => o.var.includes('RIGHT MAIN'));
    const auxWriteOk =
      matched.some((o) => o.var.includes('LEFT AUX')) && matched.some((o) => o.var.includes('RIGHT AUX'));
    // Many airframes accept AUX SimVar writes even with 0 capacity (ghost tanks). Only offer
    // inclusion when probe shows real AUX capacity (e.g. Starship Aft ~88 gal).
    const auxCapacityReal =
      (leftAuxCap !== null && leftAuxCap >= 5) || (rightAuxCap !== null && rightAuxCap >= 5);
    if (!mainsOk && !(fs1 && fs1 >= 5)) {
      console.log('  Fuel writes failed — stop and investigate (WASM may be required).');
      return;
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
      ['targets', JSON.stringify(smoke.targets)],
      ['before L/R', `${smoke.beforeFuel.LEFT_MAIN} / ${smoke.beforeFuel.RIGHT_MAIN}`],
      ['after L/R', `${smoke.afterFuel.LEFT_MAIN} / ${smoke.afterFuel.RIGHT_MAIN}`],
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

    const left = Number(await ask('Test apply left main gal', '40'));
    const right = Number(await ask('Test apply right main gal', '40'));
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
