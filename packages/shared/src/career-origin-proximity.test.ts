import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_SETTLE_RADIUS_NM,
  evaluateOriginProximity,
} from './career-economy.js';

/** SBGR approx catalog coords for distance checks. */
const SBGR = { lat: -23.4356, lon: -46.4731 };
/** ~1 nm east of SBGR. */
const NEAR_SBGR = { lat: -23.4356, lon: -46.455 };
/** ~80 nm away (toward SBSP-ish). */
const FAR = { lat: -23.0, lon: -45.0 };

describe('evaluateOriginProximity', () => {
  it('ORIGIN_OK when on ground within radius', () => {
    const r = evaluateOriginProximity({
      originIcao: 'sbgr',
      position: NEAR_SBGR,
      onGround: true,
      originCoords: SBGR,
    });
    assert.equal(r.ok, true);
    assert.equal(r.code, 'ORIGIN_OK');
    assert.equal(r.severity, 'info');
    assert.equal(r.originIcao, 'SBGR');
    assert.equal(r.radiusNm, DEFAULT_SETTLE_RADIUS_NM);
    assert.ok(r.distanceNm !== undefined && r.distanceNm <= 12);
  });

  it('ORIGIN_TOO_FAR when on ground beyond radius', () => {
    const r = evaluateOriginProximity({
      originIcao: 'SBGR',
      position: FAR,
      onGround: true,
      originCoords: SBGR,
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'ORIGIN_TOO_FAR');
    assert.equal(r.severity, 'fail');
    assert.ok((r.distanceNm ?? 0) > 12);
  });

  it('ORIGIN_NOT_ON_GROUND when airborne even if near', () => {
    const r = evaluateOriginProximity({
      originIcao: 'SBGR',
      position: NEAR_SBGR,
      onGround: false,
      originCoords: SBGR,
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'ORIGIN_NOT_ON_GROUND');
    assert.equal(r.severity, 'fail');
  });

  it('ORIGIN_POSITION_UNKNOWN when lat/lon missing', () => {
    const r = evaluateOriginProximity({
      originIcao: 'SBGR',
      position: null,
      onGround: true,
      originCoords: SBGR,
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'ORIGIN_POSITION_UNKNOWN');
    assert.equal(r.severity, 'fail');
  });

  it('ORIGIN_COORDS_UNRESOLVED warns and does not block', () => {
    const r = evaluateOriginProximity({
      originIcao: 'ZZZZ',
      position: NEAR_SBGR,
      onGround: true,
      originCoords: null,
    });
    assert.equal(r.ok, true);
    assert.equal(r.code, 'ORIGIN_COORDS_UNRESOLVED');
    assert.equal(r.severity, 'warn');
  });
});
