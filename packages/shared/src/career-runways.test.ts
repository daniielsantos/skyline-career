import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listCareerHubIcaos } from './career-fleet.js';
import {
  getAirportRunways,
  listHubsMissingRunways,
  pickNearestRunway,
  pickBestRunway,
  projectOntoRunway,
  evaluateRunwayTouchdown,
  pickFirstContactCoords,
  formatRunwayTouchdownLine,
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
    const missing = listHubsMissingRunways();
    for (const icao of ['GMMN', 'HEBA', 'LLER', 'DAAG', 'DTTA', 'SBGR', 'OEJN', 'OMDB', 'OTHH', 'OKKK', 'OETF', 'ORBI', 'ORMM', 'OIIE', 'OJAI', 'OLBA', 'OSDI', 'HLLM', 'HSSK', 'OYSN', 'OYAA', 'OPIS', 'OPKC', 'VIDP', 'VABB', 'VOBL', 'VOMM', 'VECC', 'VCBI', 'VCRI', 'UAAA', 'UTTT', 'UTAA', 'UATE', 'UTDD', 'UCFM', 'UCFO'] as const) {
      assert.ok(getAirportRunways(icao).length >= 1, `${icao} needs runways`);
      assert.equal(missing.includes(icao), false, `${icao} should not be missing`);
    }
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

describe('pickFirstContactCoords', () => {
  const plane = { lat: -23.43, lon: -46.47 };
  const earlier = { lat: -23.4305, lon: -46.47 }; // ~55 m south

  it('prefers sim touchdown when near the live aircraft', () => {
    const picked = pickFirstContactCoords({
      simTouchdown: earlier,
      planeNow: plane,
      lastAirborne: { lat: -23.431, lon: -46.47 },
    });
    assert.ok(picked);
    assert.equal(picked!.source, 'sim_touchdown');
    assert.equal(picked!.lat, earlier.lat);
  });

  it('rejects stale sim touchdown and prefers plane over last airborne', () => {
    const picked = pickFirstContactCoords({
      simTouchdown: { lat: -22.0, lon: -46.47 },
      planeNow: plane,
      lastAirborne: earlier,
    });
    assert.ok(picked);
    assert.equal(picked!.source, 'plane');
    assert.equal(picked!.lat, plane.lat);
  });

  it('falls back to plane when nothing else is usable', () => {
    const picked = pickFirstContactCoords({ planeNow: plane });
    assert.deepEqual(picked, {
      lat: plane.lat,
      lon: plane.lon,
      source: 'plane',
    });
  });

  it('uses last airborne only when plane is unavailable', () => {
    const picked = pickFirstContactCoords({ lastAirborne: earlier });
    assert.deepEqual(picked, {
      lat: earlier.lat,
      lon: earlier.lon,
      source: 'last_airborne',
    });
  });
});

describe('pickBestRunway parallel strips', () => {
  it('picks KSTL 30L (12R) over 30R when on the southwest parallel', () => {
    const rwy30L = getAirportRunways('KSTL').find((r) => r.ident === '12R');
    assert.ok(rwy30L);
    // Center of 12R/30L — old center-distance pick can still win here; the
    // real bug is near thresholds. Offset ~200 m past the 30L threshold
    // (primary HE) on centerline, approaching ~302°.
    const past30L = 200;
    const alongFromCenter = rwy30L!.lengthM / 2 - past30L;
    const latRad = (rwy30L!.lat * Math.PI) / 180;
    const mPerDegLat = 111_320;
    const mPerDegLon = 111_320 * Math.cos(latRad);
    const hdg = (rwy30L!.headingTrueDeg * Math.PI) / 180;
    const lat = rwy30L!.lat + (alongFromCenter * Math.cos(hdg)) / mPerDegLat;
    const lon = rwy30L!.lon + (alongFromCenter * Math.sin(hdg)) / mPerDegLon;

    // Midpoint between the two parallels is closer to neither center alone
    // for some geometries; ensure lateral pick wins with heading.
    const best = pickBestRunway('KSTL', lat, lon, 302);
    assert.ok(best);
    assert.equal(best!.ident, '12R');
    assert.equal(best!.identReciprocal, '30L');

    const snap = evaluateRunwayTouchdown('KSTL', lat, lon, 302);
    assert.ok(snap);
    assert.equal(snap!.landingEnd, 'reciprocal');
    assert.equal(snap!.onPavement, true);
    assert.ok(Math.abs(snap!.lateralM) < 15);
    const line = formatRunwayTouchdownLine(snap);
    assert.match(line, /RWY 30L/);
    assert.match(line, /on pavement/);
    assert.match(line, /3\.36 km/);
  });

  it('does not label a 30L touchdown as 30R off-runway (user KMEM→KSTL case)', () => {
    // Reconstruct: ~392 m lateral from 12L/30R center ≈ sitting on 12R/30L.
    const rwy30R = getAirportRunways('KSTL').find((r) => r.ident === '12L');
    const rwy30L = getAirportRunways('KSTL').find((r) => r.ident === '12R');
    assert.ok(rwy30R && rwy30L);
    const snapWrongCenter = evaluateRunwayTouchdown(
      'KSTL',
      rwy30L!.lat,
      rwy30L!.lon,
      302,
    );
    assert.ok(snapWrongCenter);
    assert.equal(snapWrongCenter!.runwayIdent, '12R');
    assert.equal(snapWrongCenter!.onPavement, true);
    // From the other strip this would look ~390 m off — confirm we did not pick it.
    const projWrong = projectOntoRunway(rwy30R!, rwy30L!.lat, rwy30L!.lon);
    assert.ok(Math.abs(projWrong.lateralM) > 300);
  });
});
