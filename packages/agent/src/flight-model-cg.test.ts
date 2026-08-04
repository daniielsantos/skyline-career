import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AircraftProfile } from '@msfs-compat/shared';
import { selectCgSweepStations } from './cg-sweep.js';
import { parseFlightModelCg } from './flight-model-cg.js';

describe('parseFlightModelCg', () => {
  it('reads official %MAC limits, empty CG, and one-based station arms', () => {
    const parsed = parseFlightModelCg(
      `
[GENERAL]
foo = 1

[WEIGHT_AND_BALANCE]
empty_weight_CG_position = -3.25, 0, 1.1 ; z, x, y
CG_forward_limit = 0.11
CG_aft_limit = 0.32
station_load.0 = 180, 4.5, 0, 0, "Pilot"
station_load.1 = 120, -3.75, 0, 0, "Rear seat"
`,
      'C:/Community/example/flight_model.cfg',
    );

    assert.equal(parsed.minMac, 11);
    assert.equal(parsed.maxMac, 32);
    assert.deepEqual(parsed.emptyWeightCgPosition, [-3.25, 0, 1.1]);
    assert.deepEqual(parsed.stationArms, { 1: 4.5, 2: -3.75 });
    assert.deepEqual(parsed.stationMaxLoads, { 1: 180, 2: 120 });
    assert.equal(parsed.stationNames[1], 'Pilot');
    assert.equal(parsed.path, 'C:/Community/example/flight_model.cfg');
  });

  it('ignores zero station_load weight (unknown max) but keeps arm/name', () => {
    const parsed = parseFlightModelCg(`
[WEIGHT_AND_BALANCE]
station_load.0 = 170, 12.5, -1.2, 0.3, TT:MENU.PAYLOAD.PILOT
station_load.2 = 0, 5.2, 0, -1.1, TT:MENU.PAYLOAD.CARGO_CABIN_1
`);
    assert.equal(parsed.stationMaxLoads[1], 170);
    assert.equal(parsed.stationMaxLoads[3], undefined);
    assert.equal(parsed.stationArms[3], 5.2);
    assert.match(parsed.stationNames[3] ?? '', /Cargo Cabin 1/i);
  });

  it('accepts limits already expressed as percentage points', () => {
    const parsed = parseFlightModelCg(`
[WEIGHT_AND_BALANCE]
CG_forward_limit = -22
CG_aft_limit = 14
`);
    assert.equal(parsed.minMac, -22);
    assert.equal(parsed.maxMac, 14);
  });
});

describe('selectCgSweepStations', () => {
  function profile(
    stations: AircraftProfile['payload']['stations'],
  ): AircraftProfile {
    return {
      payload: { stations },
    } as AircraftProfile;
  }

  it('uses longitudinal arms when available', () => {
    const selected = selectCgSweepStations(
      profile([
        { index: 1, maxLoad: 300, arm: -4 },
        { index: 2, maxLoad: 300, arm: 5 },
      ]),
    );
    assert.equal(selected.forward.index, 2);
    assert.equal(selected.aft.index, 1);
    assert.equal(selected.usedStationArms, true);
  });

  it('falls back to first/last station ordering', () => {
    const selected = selectCgSweepStations(
      profile([
        { index: 3, maxLoad: 300 },
        { index: 8, maxLoad: 300 },
      ]),
    );
    assert.equal(selected.forward.index, 3);
    assert.equal(selected.aft.index, 8);
    assert.equal(selected.usedStationArms, false);
  });
});
