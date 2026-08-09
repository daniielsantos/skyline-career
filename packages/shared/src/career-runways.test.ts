import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isBushTripOnlyHub } from './career-bush.js';
import { listCareerHubIcaos } from './career-fleet.js';
import {
  getAirportRunways,
  listHubsMissingRunways,
  pickNearestRunway,
  projectOntoRunway,
  evaluateRunwayTouchdown,
  type CareerRunway,
} from './career-runways.js';

const SAMPLE: CareerRunway = {
  ident: '09',
  identReciprocal: '27',
  headingTrueDeg: 90,
  lengthM: 2000,
  widthM: 45,
  lat: 0,
  lon: 0,
  surface: 'asphalt',
};

describe('career-runways catalog', () => {
  it('covers every network career hub with at least one runway', () => {
    // bushTripOnly strips may be empty in OurAirports JSON — filled via MSFS Facilities overrides.
    const missing = listHubsMissingRunways().filter((icao) => !isBushTripOnlyHub(icao));
    assert.equal(
      missing.length,
      0,
      `hubs missing runways: ${missing.join(', ')}`,
    );
    assert.ok(listCareerHubIcaos().length >= 200);
  });

  it('returns runways for a known hub', () => {
    const rwys = getAirportRunways('SBGR');
    assert.ok(rwys.length >= 1);
    const longest = rwys[0]!;
    assert.ok(longest.lengthM > 1000);
    assert.ok(Number.isFinite(longest.headingTrueDeg));
    assert.ok(Number.isFinite(longest.lat));
    assert.ok(Number.isFinite(longest.lon));
    assert.equal(typeof longest.lighted, 'boolean');
  });

  it('pickNearestRunway prefers the closer center', () => {
    const nearest = pickNearestRunway('SBGR', -23.4356, -46.4731);
    assert.ok(nearest);
    assert.ok(nearest!.lengthM > 0);
  });
});

describe('projectOntoRunway', () => {
  it('places the center near along=0 / lateral=0 and on pavement', () => {
    const p = projectOntoRunway(SAMPLE, 0, 0);
    assert.ok(Math.abs(p.alongM) < 1);
    assert.ok(Math.abs(p.lateralM) < 1);
    assert.equal(p.onPavement, true);
    assert.ok(Math.abs(p.pastThresholdM - 1000) < 1);
  });

  it('marks past the end as off pavement', () => {
    // ~1200 m east of center along heading 90° → past HE threshold
    const lon = 1200 / (111_320 * Math.cos(0));
    const p = projectOntoRunway(SAMPLE, 0, lon);
    assert.ok(p.alongM > 1000);
    assert.equal(p.onPavement, false);
  });

  it('marks large lateral offset as off pavement', () => {
    // ~100 m north while runway runs east-west → lateral left/right
    const lat = 100 / 111_320;
    const p = projectOntoRunway(SAMPLE, lat, 0);
    assert.ok(Math.abs(p.lateralM) > 45);
    assert.equal(p.onPavement, false);
  });
});

describe('evaluateRunwayTouchdown', () => {
  it('projects a hub touchdown onto the nearest strip', () => {
    const rwys = getAirportRunways('SBGR');
    assert.ok(rwys.length >= 1);
    const rwy = rwys[0]!;
    const snap = evaluateRunwayTouchdown('SBGR', rwy.lat, rwy.lon);
    assert.ok(snap);
    assert.equal(snap!.onPavement, true);
    assert.ok(Math.abs(snap!.alongM) < 50);
    assert.equal(typeof snap!.lighted, 'boolean');
  });

  it('returns undefined for unknown ICAO', () => {
    assert.equal(evaluateRunwayTouchdown('ZZZZ', 0.1, 0.1), undefined);
  });

  it('uses aircraft heading for approach end on a deep landing past midfield', () => {
    const rwy = getAirportRunways('KCLT').find((r) => r.ident === '18L');
    assert.ok(rwy);
    // ~1582 m past 18L threshold (past midfield → closer to 36R geometrically).
    // Debrief previously showed that as ~1062 m past 36R THR.
    const pastThr = Math.round(rwy!.lengthM * 0.6);
    const alongM = pastThr - rwy!.lengthM / 2;
    const latRad = (rwy!.lat * Math.PI) / 180;
    const mPerDegLat = 111_320;
    const mPerDegLon = 111_320 * Math.cos(latRad);
    const hdg = (rwy!.headingTrueDeg * Math.PI) / 180;
    const lat = rwy!.lat + (alongM * Math.cos(hdg)) / mPerDegLat;
    const lon = rwy!.lon + (alongM * Math.sin(hdg)) / mPerDegLon;

    const withoutHdg = evaluateRunwayTouchdown('KCLT', lat, lon);
    assert.ok(withoutHdg);
    assert.equal(withoutHdg!.runwayIdent, '18L');
    assert.equal(withoutHdg!.landingEnd, 'reciprocal');

    const landing18 = evaluateRunwayTouchdown('KCLT', lat, lon, 176);
    assert.ok(landing18);
    assert.equal(landing18!.landingEnd, 'primary');
    assert.equal(landing18!.runwayIdent, '18L');

    const landing36 = evaluateRunwayTouchdown('KCLT', lat, lon, 356);
    assert.ok(landing36);
    assert.equal(landing36!.landingEnd, 'reciprocal');
  });
});
