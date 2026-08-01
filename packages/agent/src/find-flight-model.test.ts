import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  airplaneFolderFromCfgPath,
  findFlightModelCandidates,
  groupFlightModelCandidatesByContent,
  parseInstalledPackagesPath,
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

    const pro = scorePathAgainstTokens('bksq-aircraft-bonanzapro', tokens);
    const tc = scorePathAgainstTokens('bksq-aircraft-bonanzatc', tokens);
    assert.ok(pro > tc);
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
});

describe('groupFlightModelCandidatesByContent', () => {
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
});
