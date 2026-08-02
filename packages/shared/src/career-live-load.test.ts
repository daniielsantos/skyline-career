import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateLoadVerification,
  loadVerificationDrifted,
  resolveLivePayloadLb,
} from './career-live-load.js';

describe('resolveLivePayloadLb', () => {
  it('uses mass-balance when stations under-read vs heavy aircraft', () => {
    const r = resolveLivePayloadLb({
      stationSumLb: 0,
      massBalanceLb: 900,
      plannedLb: 992,
    });
    assert.equal(r.source, 'mass-balance');
    assert.equal(r.payloadLb, 900);
  });

  it('prefers stations when they carry a real load', () => {
    const r = resolveLivePayloadLb({
      stationSumLb: 850,
      massBalanceLb: 900,
    });
    assert.equal(r.source, 'stations');
    assert.equal(r.payloadLb, 850);
  });

  it('allows zero mass-balance (emptied aircraft)', () => {
    const r = resolveLivePayloadLb({ massBalanceLb: 0, stationSumLb: 0 });
    assert.equal(r.source, 'stations');
    assert.equal(r.payloadLb, 0);
  });
});

describe('evaluateLoadVerification', () => {
  it('fails when live payload is emptied vs planned', () => {
    const v = evaluateLoadVerification({
      plannedFuelLb: 400,
      liveFuelLb: 400,
      plannedPayloadLb: 992,
      livePayloadLb: 0,
    });
    assert.equal(v.ready, false);
    assert.equal(v.payload.ok, false);
    assert.equal(v.fuel.ok, true);
  });

  it('fails when live payload is missing but planned exists', () => {
    const v = evaluateLoadVerification({
      plannedFuelLb: 400,
      liveFuelLb: 400,
      plannedPayloadLb: 992,
      livePayloadLb: undefined,
    });
    assert.equal(v.ready, false);
  });

  it('passes when both match within tolerance', () => {
    const v = evaluateLoadVerification({
      plannedFuelLb: 400,
      liveFuelLb: 410,
      plannedPayloadLb: 992,
      livePayloadLb: 980,
    });
    assert.equal(v.ready, true);
  });
});

describe('loadVerificationDrifted', () => {
  it('detects ready flips', () => {
    const a = evaluateLoadVerification({
      plannedFuelLb: 400,
      liveFuelLb: 400,
      plannedPayloadLb: 900,
      livePayloadLb: 900,
    });
    const b = evaluateLoadVerification({
      plannedFuelLb: 400,
      liveFuelLb: 400,
      plannedPayloadLb: 900,
      livePayloadLb: 0,
    });
    assert.equal(loadVerificationDrifted(a, b), true);
  });
});
