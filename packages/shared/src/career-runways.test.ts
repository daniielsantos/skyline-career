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
});
