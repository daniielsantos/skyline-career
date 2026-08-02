import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  airplaneFolderFromCfgPath,
  findFlightModelCandidates,
  groupFlightModelCandidatesByContent,
  listMsfsVfsProjectionCandidates,
  parseInstalledPackagesPath,
  scoreCfgAgainstLiveHints,
  scorePathAgainstTokens,
  summarizeFlightModelCfg,
  titleSearchTokens,
} from './find-flight-model.js';

describe('parseInstalledPackagesPath', () => {
  it('reads same-line and next-line InstalledPackagesPath', () => {
    assert.equal(
      parseInstalledPackagesPath('InstalledPackagesPath "D:\\MSFS2024\\Packages"'),
      'D:\\MSFS2024\\Packages',
    );
    assert.equal(
      parseInstalledPackagesPath('InstalledPackagesPath\n  "E:/Packages"\n'),
      'E:/Packages',
    );
    assert.equal(parseInstalledPackagesPath('nope'), undefined);
  });
});

describe('titleSearchTokens / scorePathAgainstTokens', () => {
  it('adds Black Square shorthand and prefers non-TC folders', () => {
    const tokens = titleSearchTokens('Black Square Bonanza A36');
    assert.ok(tokens.includes('bksq'));
    assert.ok(tokens.includes('bonanza'));
    assert.ok(!tokens.includes('black'), 'bare "black" must not match blackbox packages');
    assert.ok(!tokens.includes('square'));

    const pro = scorePathAgainstTokens('bksq-aircraft-bonanzapro', tokens);
    const tc = scorePathAgainstTokens('bksq-aircraft-bonanzatc', tokens);
    assert.ok(pro > tc);
  });

  it('glues PC-24 into pc24 and drops bare 24 that matches *2024* packages', () => {
    const tokens = titleSearchTokens('PC-24 Cargo');
    assert.ok(tokens.includes('pc24'));
    assert.ok(tokens.includes('cargo'));
    assert.ok(!tokens.includes('24'), 'bare 24 must not match Community *2024*');
    const pc24 = scorePathAgainstTokens('microsoft_pc24_cargo', tokens);
    const legacy2024 = scorePathAgainstTokens('flysimware-legacy-2024', tokens);
    const pc12 = scorePathAgainstTokens('microsoft_pc12_ngx', tokens);
    const passive = scorePathAgainstTokens('asobo_passiveaircraft_pc24', tokens);
    assert.ok(pc24 > legacy2024);
    assert.ok(pc24 > pc12);
    assert.ok(pc24 > passive, 'player microsoft_pc24 must beat passive AI shell');
  });

  it('maps BN2 Islander titles to Black Box package tokens', () => {
    const tokens = titleSearchTokens(
      'BN2 Islander - Cargo / Analogue / Tip Tanks',
    );
    assert.ok(tokens.includes('islander'));
    assert.ok(tokens.includes('bn2'));
    assert.ok(tokens.includes('bn2islander'));
    assert.ok(tokens.includes('steam')); // analogue → steam preset folders
    assert.ok(tokens.includes('tiptank'));
  });

  it('maps Garmin glass titles to g3000 preset tokens', () => {
    const tokens = titleSearchTokens(
      'BN2 Islander - Cargo / Garmin / Tip Tanks',
    );
    assert.ok(tokens.includes('g3000'));
    assert.ok(tokens.includes('garmin'));
    assert.ok(tokens.includes('tiptank'));
    const g3000 = scorePathAgainstTokens(
      'presets/bbs/h_cargo_g3000_tiptank/config',
      tokens,
    );
    const steam = scorePathAgainstTokens(
      'presets/bbs/f_cargo_steam_tiptank/config',
      tokens,
    );
    assert.ok(g3000 > steam);
  });

  it('maps Duke titles to piston/stock folders and prefers B60 over Grand Duke', () => {
    const tokens = titleSearchTokens('Black Square B60 Duke');
    assert.ok(tokens.includes('bksq'));
    assert.ok(tokens.includes('duke'));
    assert.ok(tokens.includes('stockduke'));
    assert.ok(tokens.includes('pistonduke'));
    assert.ok(!tokens.includes('black'));

    const stock = scorePathAgainstTokens(
      'bksq-aircraft-pistonduke/SimObjects/Airplanes/bksq-aircraft-stockduke',
      tokens,
    );
    const grand = scorePathAgainstTokens(
      'bksq-aircraft-pistonduke/SimObjects/Airplanes/bksq-aircraft-grandduke',
      tokens,
    );
    const blackbox = scorePathAgainstTokens(
      'blackboxsimulation-bn2islander24',
      tokens,
    );
    assert.ok(stock > grand);
    assert.equal(blackbox, 0);
  });
});

describe('scoreCfgAgainstLiveHints', () => {
  it('boosts MTOW/station matches and demotes far-off GA decoys', () => {
    const live = { mtowLb: 18300, emptyWeightLb: 11820, stationCount: 6 };
    const match = scoreCfgAgainstLiveHints(
      [
        '[WEIGHT_AND_BALANCE]',
        'max_gross_weight = 18300',
        'empty_weight = 11800',
        'station_load.0 = 180,0,0,0,TT:MENU.PAYLOAD.PILOT,1',
        'station_load.1 = 180,0,0,0,TT:MENU.PAYLOAD.COPILOT,2',
        'station_load.2 = 50,0,0,0,TT:MENU.PAYLOAD.CARGO_01,6',
        'station_load.3 = 0,0,0,0,TT:MENU.PAYLOAD.CARGO_02,6',
        'station_load.4 = 0,0,0,0,TT:MENU.PAYLOAD.CARGO_03,6',
        'station_load.5 = 0,0,0,0,TT:MENU.PAYLOAD.CARGO_04,6',
      ].join('\n'),
      live,
    );
    const decoy = scoreCfgAgainstLiveHints(
      [
        '[WEIGHT_AND_BALANCE]',
        'max_gross_weight = 2550',
        'empty_weight = 1729',
        'station_load.0 = 170,0,0,0,TT:MENU.PAYLOAD.PILOT,1',
        'station_load.1 = 170,0,0,0,TT:MENU.PAYLOAD.COPILOT,2',
        'station_load.2 = 0,0,0,0,TT:MENU.PAYLOAD.PASSENGER,1',
        'station_load.3 = 0,0,0,0,TT:MENU.PAYLOAD.BAGGAGE,6',
      ].join('\n'),
      live,
    );
    assert.ok(match >= 60);
    assert.ok(decoy < 0);
    assert.ok(match > decoy + 40);
  });
});

describe('groupFlightModelCandidatesByContent', () => {
  it('keeps Access-Denied / missing paths as locked selectable rows', async () => {
    const lockedPath = join(
      await mkdtemp(join(tmpdir(), 'msfs-fm-locked-')),
      'microsoft_pc24',
      'presets',
      'microsoft',
      'pc24_cargo_loaded',
      'config',
      'flight_model.cfg',
    );
    const groups = await groupFlightModelCandidatesByContent([
      {
        path: lockedPath,
        packageName: 'microsoft_pc24',
        airplaneFolder: 'microsoft_pc24/presets/microsoft/pc24_cargo_loaded',
        rootKind: 'VFSProjection',
        score: 40,
      },
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.locked, true);
    assert.match(groups[0]!.summary ?? '', /locked/i);
    assert.ok(groups[0]!.primary.path.includes('pc24_cargo_loaded'));
  });

  it('ranks live MTOW/station matches above path-token decoys with aircraft.cfg range', async () => {
    const root = await mkdtemp(join(tmpdir(), 'msfs-fm-live-'));
    const decoyDir = join(
      root,
      'Community',
      'microsoft-legacy-ga',
      'SimObjects',
      'Airplanes',
      'microsoft_legacy_cargo',
      'common',
      'config',
    );
    await mkdir(decoyDir, { recursive: true });
    await writeFile(
      join(decoyDir, 'flight_model.cfg'),
      [
        '[WEIGHT_AND_BALANCE]',
        'max_gross_weight = 2550',
        'empty_weight = 1729',
        'station_load.0 = 170,0,0,0,TT:MENU.PAYLOAD.PILOT,1',
        'station_load.1 = 170,0,0,0,TT:MENU.PAYLOAD.COPILOT,2',
        'station_load.2 = 0,0,0,0,TT:MENU.PAYLOAD.PASSENGER,1',
        'station_load.3 = 0,0,0,0,TT:MENU.PAYLOAD.BAGGAGE,6',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      join(decoyDir, 'aircraft.cfg'),
      'ui_max_range = 600\nui_fuel_burn_rate = 156.8\n',
      'utf8',
    );

    const matchDir = join(
      root,
      'Community2024',
      'microsoft-aircraft-pc24',
      'SimObjects',
      'Airplanes',
      'microsoft_pc24',
      'common',
      'config',
    );
    await mkdir(matchDir, { recursive: true });
    await writeFile(
      join(matchDir, 'flight_model.cfg'),
      [
        '[WEIGHT_AND_BALANCE]',
        'max_gross_weight = 18300',
        'empty_weight = 11820',
        'CG_forward_limit = 0.25',
        'CG_aft_limit = 0.40',
        'station_load.0 = 180,0,0,0,TT:MENU.PAYLOAD.PILOT,1',
        'station_load.1 = 180,0,0,0,TT:MENU.PAYLOAD.COPILOT,2',
        'station_load.2 = 50,0,0,0,TT:MENU.PAYLOAD.CARGO_01,6',
        'station_load.3 = 0,0,0,0,TT:MENU.PAYLOAD.CARGO_02,6',
        'station_load.4 = 0,0,0,0,TT:MENU.PAYLOAD.CARGO_03,6',
        'station_load.5 = 0,0,0,0,TT:MENU.PAYLOAD.CARGO_04,6',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      join(matchDir, 'aircraft.cfg'),
      'ui_max_range = 2000\nui_fuel_burn_rate = 900\n',
      'utf8',
    );

    const found = await findFlightModelCandidates(root, 'PC-24 Cargo', {
      publisher: 'microsoft',
    });
    const groups = await groupFlightModelCandidatesByContent(found, {
      mtowLb: 18300,
      emptyWeightLb: 11820,
      stationCount: 6,
    });
    assert.ok(groups.length >= 2);
    assert.ok(groups[0]!.primary.path.includes('microsoft_pc24'));
    assert.match(groups[0]!.summary ?? '', /MTOW 18300 lb/);
  });

  it('collapses identical preset stubs and demotes them below real attachments', async () => {
    const root = await mkdtemp(join(tmpdir(), 'msfs-fm-dup-'));
    const plane = join(
      root,
      'Community2024',
      'blackboxsimulation-bn2islander24',
      'SimObjects',
      'Airplanes',
      'BBS_BN2_Piston',
    );
    const stubBody = '; generated file\n\n[MODULAR_MERGE]\nauto = true\n';
    const presets = ['f_cargo_steam_tiptank', 'h_cargo_g3000_tiptank', 'e_cargo_steam'];
    for (const preset of presets) {
      const dir = join(plane, 'presets', 'bbs', preset, 'config');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'flight_model.cfg'), stubBody, 'utf8');
    }
    const cargoDir = join(plane, 'attachments', 'bbs', 'part_interior_cargo', 'config');
    await mkdir(cargoDir, { recursive: true });
    await writeFile(
      join(cargoDir, 'flight_model.cfg'),
      '[WEIGHT_AND_BALANCE]\nCG_forward_limit = 0.17\nmax_gross_weight = 6600\n',
      'utf8',
    );

    const found = await findFlightModelCandidates(
      root,
      'BN2 Islander - Cargo / Garmin / Tip Tanks',
    );
    const groups = await groupFlightModelCandidatesByContent(found);
    assert.equal(groups.length, 2);
    const stubGroup = groups.find((g) => g.stub);
    const cargoGroup = groups.find((g) => !g.stub);
    assert.ok(stubGroup);
    assert.ok(cargoGroup);
    assert.equal(stubGroup!.duplicates.length, 2);
    assert.ok(cargoGroup!.primary.path.includes('part_interior_cargo'));
    // Real W&B attachment should rank above demoted identical stubs.
    assert.ok(cargoGroup!.primary.score >= stubGroup!.primary.score);
    assert.match(cargoGroup!.summary ?? '', /MTOW 6600 lb/);
  });
});

describe('summarizeFlightModelCfg', () => {
  it('summarizes a cargo interior part with stations and CG limits', () => {
    const summary = summarizeFlightModelCfg(
      [
        '[WEIGHT_AND_BALANCE]',
        'CG_forward_limit =0.17',
        'CG_aft_limit =0.264',
        'max_gross_weight =6600',
        'empty_weight =4240',
        'station_load.0 =170,5.79,-0.95,-2.79,TT:MENU.PAYLOAD.PILOT,1',
        'station_load.1 =170,5.79,0.95,-2.72,TT:MENU.PAYLOAD.COPILOT,2',
        'station_load.2 =1200,0.38,0,-3.50,TT:MENU.PAYLOAD.CARGO_MID,6',
        'station_load.3 =400,-8,0,-2.01,TT:MENU.PAYLOAD.BAGGAGE_BAY,6',
      ].join('\n'),
    );
    assert.match(summary ?? '', /MTOW 6600 lb \/ empty 4240 lb/);
    assert.match(summary ?? '', /CG 17\.0–26\.4%/);
    assert.match(summary ?? '', /4 stations \(PILOT, COPILOT, CARGO_MID, BAGGAGE_BAY\)/);
  });

  it('summarizes a wing part by tank count and capacity', () => {
    const summary = summarizeFlightModelCfg(
      [
        '[FUEL_SYSTEM]',
        'Tank.1 = Name:LeftMain #Capacity:65.0 #Priority:1',
        'Tank.2 = Name:RightMain #Capacity:65.0 #Priority:1',
        'Tank.3 = Name:LeftTip #Capacity:27.5 #Priority:2',
        'Tank.4 = Name:RightTip #Capacity:27.5 #Priority:2',
      ].join('\n'),
    );
    assert.match(summary ?? '', /4 tanks \(185 gal\)/);
  });

  it('returns undefined for an empty modular stub', () => {
    assert.equal(
      summarizeFlightModelCfg('; generated file\n\n[MODULAR_MERGE]\nauto = true\n'),
      undefined,
    );
  });
});

describe('findFlightModelCandidates', () => {
  it('finds cfg under Community2024 ranked by title tokens', async () => {
    const root = await mkdtemp(join(tmpdir(), 'msfs-fm-'));
    const planeDir = join(
      root,
      'Community2024',
      'bksq-aircraft-bonanzapro',
      'SimObjects',
      'Airplanes',
      'bksq-aircraft-bonanzapro',
    );
    await mkdir(planeDir, { recursive: true });
    const cfg = join(planeDir, 'flight_model.cfg');
    await writeFile(cfg, '[WEIGHT_AND_BALANCE]\nCG_forward_limit = 0.1\n', 'utf8');

    const decoyDir = join(
      root,
      'Community2024',
      'asobo-aircraft-c172sp-asobo',
      'SimObjects',
      'Airplanes',
      'Asobo_C172sp_Asobo',
    );
    await mkdir(decoyDir, { recursive: true });
    await writeFile(
      join(decoyDir, 'flight_model.cfg'),
      '[WEIGHT_AND_BALANCE]\n',
      'utf8',
    );

    const found = await findFlightModelCandidates(
      root,
      'Black Square Bonanza A36 Professional',
    );
    assert.ok(found.length >= 1);
    assert.equal(found[0]!.airplaneFolder, 'bksq-aircraft-bonanzapro');
    assert.equal(found[0]!.rootKind, 'Community2024');
    assert.equal(airplaneFolderFromCfgPath(found[0]!.path), 'bksq-aircraft-bonanzapro');
  });

  it('finds modular preset flight_model.cfg and ignores unrelated packages', async () => {
    const root = await mkdtemp(join(tmpdir(), 'msfs-fm-mod-'));
    const presetDir = join(
      root,
      'Community2024',
      'blackboxsimulation-bn2islander24',
      'SimObjects',
      'Airplanes',
      'BBS_BN2_Piston',
      'presets',
      'bbs',
      'f_cargo_steam_tiptank',
      'config',
    );
    await mkdir(presetDir, { recursive: true });
    const cfg = join(presetDir, 'flight_model.cfg');
    await writeFile(cfg, '[WEIGHT_AND_BALANCE]\nCG_forward_limit = 0.17\n', 'utf8');

    const decoyDir = join(
      root,
      'Community2024',
      'aerosoft-aircraft-a346-pro',
      'SimObjects',
      'Airplanes',
      'airbus-a346-pro',
    );
    await mkdir(decoyDir, { recursive: true });
    await writeFile(
      join(decoyDir, 'flight_model.cfg'),
      '[WEIGHT_AND_BALANCE]\n',
      'utf8',
    );

    const found = await findFlightModelCandidates(
      root,
      'BN2 Islander - Cargo / Analogue / Tip Tanks',
    );
    assert.ok(found.length >= 1);
    assert.equal(found.some((c) => c.path.includes('a346')), false);
    assert.ok(found[0]!.path.includes('f_cargo_steam_tiptank'));
    assert.match(found[0]!.airplaneFolder, /BBS_BN2_Piston.*f_cargo_steam_tiptank/);
  });

  it('filters Black Square Duke away from Black Box and sibling BKSQ airframes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'msfs-fm-duke-'));
    async function writePlane(
      pkg: string,
      airplane: string,
      body = '[WEIGHT_AND_BALANCE]\nCG_forward_limit = 0.25\n',
    ) {
      const dir = join(
        root,
        'Community2024',
        pkg,
        'SimObjects',
        'Airplanes',
        airplane,
      );
      await mkdir(dir, { recursive: true });
      const cfg = join(dir, 'flight_model.cfg');
      await writeFile(cfg, body, 'utf8');
      return cfg;
    }

    await writePlane('bksq-aircraft-pistonduke', 'bksq-aircraft-stockduke');
    await writePlane('bksq-aircraft-pistonduke', 'bksq-aircraft-grandduke');
    await writePlane('bksq-aircraft-baronpro', 'bksq-aircraft-baronpro');
    await writePlane('bksq-aircraft-bonanzapro', 'bksq-aircraft-bonanzapro');
    const islander = join(
      root,
      'Community2024',
      'blackboxsimulation-bn2islander24',
      'SimObjects',
      'Airplanes',
      'BBS_BN2_Piston',
      'attachments',
      'bbs',
      'part_interior_cargo',
      'config',
    );
    await mkdir(islander, { recursive: true });
    await writeFile(
      join(islander, 'flight_model.cfg'),
      '[WEIGHT_AND_BALANCE]\nmax_gross_weight = 6600\n',
      'utf8',
    );

    const found = await findFlightModelCandidates(
      root,
      'Black Square B60 Duke',
      { publisher: 'blacksquare' },
    );
    assert.ok(found.length >= 1);
    assert.ok(found.every((c) => c.packageName.startsWith('bksq-')));
    assert.ok(
      found.every(
        (c) =>
          c.airplaneFolder.includes('duke') || c.packageName.includes('duke'),
      ),
    );
    assert.equal(found.some((c) => c.path.includes('blackbox')), false);
    assert.equal(
      found.some((c) => c.path.includes('baron') || c.path.includes('bonanza')),
      false,
    );
    assert.ok(found[0]!.path.includes('stockduke'));
  });

  it('finds cfg under VFSProjection/simobjects/airplanes when vfsProjectionRoot is set', async () => {
    const root = await mkdtemp(join(tmpdir(), 'msfs-fm-vfs-'));
    const packagesRoot = join(root, 'Packages');
    const vfsRoot = join(root, 'VFSProjection');
    const planeDir = join(vfsRoot, 'simobjects', 'airplanes', 'asobo_c208b');
    const cfgDir = join(planeDir, 'common', 'config');
    await mkdir(cfgDir, { recursive: true });
    await mkdir(packagesRoot, { recursive: true });
    const cfg = join(cfgDir, 'flight_model.cfg');
    await writeFile(
      cfg,
      '[WEIGHT_AND_BALANCE]\nmax_gross_weight = 8750\n',
      'utf8',
    );
    await writeFile(
      join(cfgDir, 'aircraft.cfg'),
      'ui_max_range = 964\nui_fuel_burn_rate = 400\n',
      'utf8',
    );

    const decoy = join(vfsRoot, 'simobjects', 'airplanes', 'asobo_b787');
    await mkdir(join(decoy, 'common', 'config'), { recursive: true });
    await writeFile(
      join(decoy, 'common', 'config', 'flight_model.cfg'),
      '[WEIGHT_AND_BALANCE]\n',
      'utf8',
    );

    const found = await findFlightModelCandidates(packagesRoot, 'Cessna C208B Grand Caravan', {
      vfsProjectionRoot: vfsRoot,
      publisher: 'asobo',
    });
    assert.ok(found.length >= 1);
    assert.equal(found[0]!.rootKind, 'VFSProjection');
    assert.ok(found[0]!.path.includes('asobo_c208b'));
    assert.equal(
      found.some((c) => c.path.includes('asobo_b787')),
      false,
    );
  });
});

describe('listMsfsVfsProjectionCandidates', () => {
  it('includes sibling of Packages and Roaming default', () => {
    const paths = listMsfsVfsProjectionCandidates(
      { APPDATA: 'D:\\AppData\\Roaming' },
      'D:\\MSFS\\Packages',
    );
    assert.ok(paths.some((p) => /VFSProjection$/i.test(p) && p.includes('MSFS')));
    assert.ok(
      paths.some((p) =>
        p.replace(/\\/g, '/').endsWith('Microsoft Flight Simulator 2024/VFSProjection'),
      ),
    );
  });
});