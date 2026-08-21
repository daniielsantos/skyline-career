import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PmdgCduFuelStrategy,
  PmdgCduPayloadStrategy,
  resolvePmdgFuelTargetLb,
} from './pmdg-cdu-strategy.js';
import type { AircraftProfile, FuelTarget } from '@msfs-compat/shared';
import type { SimBridge, StrategyContext } from '../../types.js';

function mockBridge(opts?: {
  dens?: number;
  emptyLb?: number;
  keys?: string[];
}): SimBridge {
  const keys: string[] = opts?.keys ?? [];
  return {
    async readSimVar(req) {
      if (req.name === 'FUEL WEIGHT PER GALLON') return opts?.dens ?? 6.7;
      if (req.name === 'EMPTY WEIGHT') return opts?.emptyLb ?? 85_500;
      if (req.name.includes('FUEL TANK')) return 0;
      if (req.name === 'TOTAL WEIGHT') return 100_000;
      if (req.name === 'FUEL TOTAL QUANTITY') return 0;
      return 0;
    },
    async writeSimVar() {},
    async readLVar() {
      return 0;
    },
    async writeLVar() {},
    async triggerHVar() {},
    async triggerEvent() {},
    async snapshot() {
      return {
        onGround: true,
        enginesRunning: false,
        parkingBrake: true,
        paused: false,
        slewActive: false,
        simRate: 1,
        vars: {},
      };
    },
    async delay() {},
    async sendPmdgNg3Control(o) {
      if (o.key) keys.push(o.key);
      return {
        ok: true,
        eventId: 1,
        parameter: 1,
        method: 'control',
        cdu: o.cdu ?? 'right',
      };
    },
  };
}

function stubProfile(
  fuelStrategy: string,
  payloadStrategy: string,
): AircraftProfile {
  return {
    schemaVersion: '1.0.0',
    profileId: 'test-bcf',
    profileKey: 'test/bcf',
    semver: '1.0.0',
    displayName: 'test',
    match: { fingerprint: 'x', title: '737-800BCF BW', publisher: 'pmdg' },
    capabilities: ['simconnect'],
    gating: {
      requireOnGround: true,
      requireEnginesOff: false,
      blockWhenPaused: true,
      blockWhenSlew: true,
      minSimRate: 0.9,
      maxSimRate: 1.1,
    },
    fuel: {
      strategy: fuelStrategy as AircraftProfile['fuel']['strategy'],
      unit: 'gallons',
      tanks: [
        {
          id: 'LEFT_MAIN',
          name: 'L',
          capacity: 1288,
          readVar: 'FUEL TANK LEFT MAIN QUANTITY',
          readUnit: 'gallons',
        },
        {
          id: 'RIGHT_MAIN',
          name: 'R',
          capacity: 1288,
          readVar: 'FUEL TANK RIGHT MAIN QUANTITY',
          readUnit: 'gallons',
        },
        {
          id: 'CENTER',
          name: 'C',
          capacity: 4299,
          readVar: 'FUEL TANK CENTER QUANTITY',
          readUnit: 'gallons',
        },
      ],
      writePlan: [],
      verify: { timeoutMs: 1000, pollIntervalMs: 100, checks: [] },
    },
    payload: {
      strategy: payloadStrategy as AircraftProfile['payload']['strategy'],
      stations: [{ index: 1, name: 'S1', maxLoad: 500 }],
      writePlan: [],
      verify: { timeoutMs: 1000, pollIntervalMs: 100, checks: [] },
    },
  };
}

function ctx(bridge: SimBridge, profile: AircraftProfile): StrategyContext {
  return {
    profile,
    bridge,
    snapshot: {
      onGround: true,
      enginesRunning: false,
      parkingBrake: true,
      paused: false,
      slewActive: false,
      simRate: 1,
      vars: {},
    },
  };
}

describe('pmdg-cdu strategies', () => {
  it('resolvePmdgFuelTargetLb converts gallons to lb', async () => {
    const profile = stubProfile('pmdg-cdu', 'pmdg-cdu');
    const bridge = mockBridge({ dens: 6.7 });
    const target: FuelTarget = {
      tanks: { LEFT_MAIN: 100, RIGHT_MAIN: 100, CENTER: 50 },
    };
    const lb = await resolvePmdgFuelTargetLb(target, profile, bridge);
    assert.equal(Math.round(lb), Math.round(250 * 6.7));
  });

  it('fuel strategy sends TOTAL keystream when bridge supports CDU', async () => {
    const keys: string[] = [];
    const bridge = mockBridge({ keys });
    const profile = stubProfile('pmdg-cdu', 'station-writeback');
    const strategy = new PmdgCduFuelStrategy();
    const result = await strategy.setFuel(
      { tanks: { LEFT_MAIN: 500, RIGHT_MAIN: 500, CENTER: 0 } },
      ctx(bridge, profile),
    );
    assert.equal(result.success, true);
    assert.ok(keys.includes('MENU'));
    assert.ok(keys.includes('L1'));
    assert.ok(keys.includes('DOT'));
  });

  it('fuel strategy fails without sendPmdgNg3Control', async () => {
    const bridge = mockBridge();
    delete bridge.sendPmdgNg3Control;
    const profile = stubProfile('pmdg-cdu', 'pmdg-cdu');
    const strategy = new PmdgCduFuelStrategy();
    const result = await strategy.setFuel({ total: 100 }, ctx(bridge, profile));
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'FUEL_WRITE_FAILED');
  });

  it('payload strategy types ZFW from empty + payload', async () => {
    const keys: string[] = [];
    const bridge = mockBridge({ keys, emptyLb: 85_500 });
    const profile = stubProfile('simconnect-direct', 'pmdg-cdu');
    const strategy = new PmdgCduPayloadStrategy();
    // Absolute ZFW path: total already > empty
    const result = await strategy.setPayload(
      { total: 91_805 },
      ctx(bridge, profile),
    );
    assert.equal(result.success, true);
    assert.ok(keys.includes('MENU'));
    assert.ok(keys.includes('R2'));
    assert.ok(keys.some((k) => k === '9' || k === '1' || k === '8'));
  });

  it('canHandle only matches pmdg-cdu strategy name', () => {
    const fuel = new PmdgCduFuelStrategy();
    const payload = new PmdgCduPayloadStrategy();
    assert.equal(fuel.canHandle(stubProfile('pmdg-cdu', 'pmdg-cdu')), true);
    assert.equal(fuel.canHandle(stubProfile('simconnect-direct', 'pmdg-cdu')), false);
    assert.equal(payload.canHandle(stubProfile('pmdg-cdu', 'pmdg-cdu')), true);
    assert.equal(
      payload.canHandle(stubProfile('pmdg-cdu', 'station-writeback')),
      false,
    );
  });
});
