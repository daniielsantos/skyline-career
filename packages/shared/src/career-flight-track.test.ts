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
    // Tip moves with the aircraft even when the crumb count stays 1.
    assert.equal(row?.points[0]?.lat, -23.0001);
    assert.equal(row?.points[0]?.lon, -47.0001);
    assert.equal(row?.lat, -23.0001);
    assert.equal(row?.lon, -47.0001);
  });

  it('uses denser early crumbs then cruise MIN_MOVE', () => {
    // ~0.18 nm east of origin — above EARLY (0.12), below cruise (0.35).
    recordFlightTrackSample({
      companyId: 'co_va',
      accountId: 'acc_1',
      missionId: 'm1',
      originIcao: 'SBBR',
      destIcao: 'SBSP',
      lat: -15.87,
      lon: -47.92,
      atMs: 1_000,
    });
    recordFlightTrackSample({
      companyId: 'co_va',
      accountId: 'acc_1',
      missionId: 'm1',
      originIcao: 'SBBR',
      destIcao: 'SBSP',
      lat: -15.87,
      lon: -47.917,
      atMs: 6_000,
    });
    assert.equal(getFlightTrack('co_va', 'acc_1')?.points.length, 2);

    // Pad to EARLY_POINTS with larger steps so cruise threshold applies next.
    let lon = -47.917;
    for (let i = 0; i < 13; i++) {
      lon -= 0.01; // ~0.58 nm at this lat
      recordFlightTrackSample({
        companyId: 'co_va',
        accountId: 'acc_1',
        missionId: 'm1',
        originIcao: 'SBBR',
        destIcao: 'SBSP',
        lat: -15.87,
        lon,
        atMs: 10_000 + i * 5_000,
      });
    }
    const padded = getFlightTrack('co_va', 'acc_1');
    assert.equal(padded?.points.length, 15);

    const tip = padded!.points[14]!;
    // ~0.18 nm again — must stay tip-only under cruise MIN_MOVE.
    recordFlightTrackSample({
      companyId: 'co_va',
      accountId: 'acc_1',
      missionId: 'm1',
      originIcao: 'SBBR',
      destIcao: 'SBSP',
      lat: tip.lat,
      lon: tip.lon + 0.003,
      atMs: 100_000,
    });
    assert.equal(getFlightTrack('co_va', 'acc_1')?.points.length, 15);
  });

  it('resets trail on teleport jump instead of drawing a spike', () => {
    recordFlightTrackSample({
      companyId: 'co_va',
      accountId: 'acc_1',
      missionId: 'm1',
      originIcao: 'SBGR',
      destIcao: 'SBCA',
      lat: -23.43,
      lon: -46.47,
      atMs: 1_000,
    });
    // ~900 nm west — bogus SimConnect crumb.
    recordFlightTrackSample({
      companyId: 'co_va',
      accountId: 'acc_1',
      missionId: 'm1',
      originIcao: 'SBGR',
      destIcao: 'SBCA',
      lat: -23.0,
      lon: -60.0,
      atMs: 20_000,
      phase: 'climb',
      altFt: 9000,
    });
    const row = getFlightTrack('co_va', 'acc_1');
    assert.equal(row?.points.length, 1);
    assert.equal(row?.points[0]?.lon, -60.0);
    assert.equal(row?.phase, 'climb');
  });
});
