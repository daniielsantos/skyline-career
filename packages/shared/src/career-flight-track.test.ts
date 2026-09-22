import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  clearFlightTrack,
  flightTrackProgressPct,
  getFlightTrack,
  isFlightTrackFresh,
  recordFlightTrackSample,
  resetFlightTrackStoreForTests,
} from './career-flight-track.js';

describe('career flight track', () => {
  beforeEach(() => {
    resetFlightTrackStoreForTests();
  });

  it('records trail and resets on new mission', () => {
    recordFlightTrackSample({
      companyId: 'co_va',
      accountId: 'acc_1',
      missionId: 'm1',
      originIcao: 'SBKP',
      destIcao: 'SBGL',
      lat: -23.0,
      lon: -47.0,
      atMs: 1_000,
    });
    recordFlightTrackSample({
      companyId: 'co_va',
      accountId: 'acc_1',
      missionId: 'm1',
      originIcao: 'SBKP',
      destIcao: 'SBGL',
      lat: -23.2,
      lon: -46.5,
      atMs: 20_000,
    });
    const a = getFlightTrack('co_va', 'acc_1');
    assert.equal(a?.points.length, 2);
    assert.equal(a?.missionId, 'm1');

    recordFlightTrackSample({
      companyId: 'co_va',
      accountId: 'acc_1',
      missionId: 'm2',
      originIcao: 'SBGL',
      destIcao: 'SBRJ',
      lat: -22.8,
      lon: -43.2,
      atMs: 30_000,
    });
    const b = getFlightTrack('co_va', 'acc_1');
    assert.equal(b?.missionId, 'm2');
    assert.equal(b?.points.length, 1);
  });

  it('reports OD progress and freshness', () => {
    const pct = flightTrackProgressPct({
      origin: { lat: 0, lon: 0 },
      dest: { lat: 0, lon: 10 },
      aircraft: { lat: 0, lon: 5 },
    });
    assert.ok(pct >= 45 && pct <= 55);
    assert.equal(isFlightTrackFresh(Date.now() - 10_000), true);
    assert.equal(isFlightTrackFresh(Date.now() - 120_000), false);
  });

  it('clear removes the track', () => {
    recordFlightTrackSample({
      companyId: 'co_va',
      accountId: 'acc_1',
      missionId: 'm1',
      originIcao: 'SBKP',
      destIcao: 'SBGL',
      lat: -23.0,
      lon: -47.0,
    });
    clearFlightTrack('co_va', 'acc_1');
    assert.equal(getFlightTrack('co_va', 'acc_1'), null);
  });

  it('refreshes phase and alt without growing trail when nearly stationary', () => {
    recordFlightTrackSample({
      companyId: 'co_va',
      accountId: 'acc_1',
      missionId: 'm1',
      originIcao: 'SBKP',
      destIcao: 'SBGL',
      lat: -23.0,
      lon: -47.0,
      atMs: 1_000,
      phase: 'taxi_out',
      onGround: true,
      gsKt: 12,
      altFt: 2100,
    });
    recordFlightTrackSample({
      companyId: 'co_va',
      accountId: 'acc_1',
      missionId: 'm1',
      originIcao: 'SBKP',
      destIcao: 'SBGL',
      lat: -23.0001,
      lon: -47.0001,
      atMs: 5_000,
      phase: 'takeoff',
      onGround: false,
      gsKt: 95,
      altFt: 2200,
    });
    const row = getFlightTrack('co_va', 'acc_1');
    assert.equal(row?.points.length, 1);
    assert.equal(row?.phase, 'takeoff');
    assert.equal(row?.onGround, false);
    assert.equal(row?.gsKt, 95);
    assert.equal(row?.altFt, 2200);
    assert.equal(row?.points[0]?.phase, 'takeoff');
  });
});
