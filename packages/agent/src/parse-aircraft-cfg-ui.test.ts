import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  applyClassPerfFallback,
  deriveFuelBurnKgPerNm,
  findAircraftCfgNearFlightModel,
  parseAircraftCfgUiText,
  parseCruiseSpeedKtFromFlightModel,
} from './parse-aircraft-cfg-ui.js';

describe('parseAircraftCfgUiText', () => {
  it('reads FLTSIM ui_* fields', () => {
    const parsed = parseAircraftCfgUiText(`
[FLTSIM.0]
title=Commander 114TC
ui_max_range=800
ui_certified_ceiling=25000
ui_fuel_burn_rate=72.4
ui_autonomy=4.5
`);
    assert.equal(parsed.maxRangeNm, 800);
    assert.equal(parsed.certifiedCeilingFt, 25_000);
    assert.equal(parsed.uiFuelBurnRateLbPerHour, 72.4);
    assert.equal(parsed.uiFuelBurnRateRaw, 72.4);
  });

  it('strips comments and quotes', () => {
    const parsed = parseAircraftCfgUiText(`
ui_max_range = "640" ; nm
ui_fuel_burn_rate=54 ; lbs/hr
`);
    assert.equal(parsed.maxRangeNm, 640);
    assert.equal(parsed.uiFuelBurnRateLbPerHour, 54);
  });

  it('treats ui_fuel_burn_rate <= 0 as missing', () => {
    const parsed = parseAircraftCfgUiText(`
ui_max_range=1840
ui_fuel_burn_rate=-1
`);
    assert.equal(parsed.maxRangeNm, 1840);
    assert.equal(parsed.uiFuelBurnRateRaw, -1);
    assert.equal(parsed.uiFuelBurnRateLbPerHour, undefined);
  });
});

describe('parseCruiseSpeedKtFromFlightModel', () => {
  it('reads REFERENCE SPEEDS cruise_speed', () => {
    const kt = parseCruiseSpeedKtFromFlightModel(`
[REFERENCE SPEEDS]
full_flaps_stall_speed = 50
flaps_up_stall_speed = 60
cruise_speed = 174
max_mach = 0.0
`);
    assert.equal(kt, 174);
  });
});

describe('deriveFuelBurnKgPerNm', () => {
  it('divides kg/h by cruise kt', () => {
    // 72.4 lb/h ≈ 32.8 kg/h at 174 kt → ~0.189 kg/nm
    const kgPerHour = Math.round(72.4 * 0.45359237 * 10) / 10;
    assert.equal(deriveFuelBurnKgPerNm(kgPerHour, 174), 0.189);
  });
});

describe('applyClassPerfFallback', () => {
  it('fills burn from class when cfg burn is -1 and keeps cfg range', () => {
    const perf = applyClassPerfFallback(
      {
        maxRangeNm: 1840,
        rangeSource: 'cfg',
        uiFuelBurnRateRaw: -1,
        cruiseSpeedKt: 210,
      },
      { maxRangeNm: 800, fuelBurnKgPerNm: 0.35 },
    );
    assert.equal(perf.maxRangeNm, 1840);
    assert.equal(perf.rangeSource, 'cfg');
    assert.equal(perf.burnSource, 'class');
    assert.equal(perf.fuelBurnKgPerNm, 0.35);
    assert.equal(perf.cruiseFuelFlowKgPerHour, 73.5);
  });
});

describe('findAircraftCfgNearFlightModel', () => {
  it('prefers common/config aircraft.cfg over empty preset sibling', async () => {
    const root = await mkdtemp(join(tmpdir(), 'msfs-acfg-'));
    const plane = join(root, 'microsoft_passiveaircraft_c404');
    const commonCfg = join(plane, 'common', 'config');
    const presetCfg = join(
      plane,
      'presets',
      'microsoft',
      'c404_titan_cargo',
      'config',
    );
    await mkdir(commonCfg, { recursive: true });
    await mkdir(presetCfg, { recursive: true });
    await writeFile(
      join(commonCfg, 'aircraft.cfg'),
      'ui_max_range=1840\nui_fuel_burn_rate=-1\n',
      'utf8',
    );
    await writeFile(
      join(commonCfg, 'flight_model.cfg'),
      '[WEIGHT_AND_BALANCE]\nmax_gross_weight=19000\n',
      'utf8',
    );
    await writeFile(join(presetCfg, 'aircraft.cfg'), '[FLTSIM.0]\ntitle=x\n', 'utf8');
    await writeFile(
      join(presetCfg, 'flight_model.cfg'),
      '[WEIGHT_AND_BALANCE]\n',
      'utf8',
    );

    const found = await findAircraftCfgNearFlightModel(
      join(presetCfg, 'flight_model.cfg'),
    );
    assert.equal(found, join(commonCfg, 'aircraft.cfg'));
  });
});
