import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  GFP_MAX_WAYPOINTS,
  gfpDownloadFilename,
  msfsPlnXmlToGfp,
  thinGfpWaypoints,
  toGarminDmm,
  type GfpWaypoint,
} from './career-pln-to-gfp.js';

const plnDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'profiles',
  'career',
  'bush_PLN',
);

describe('Garmin DMM', () => {
  it('encodes the Garmin PDF example N44°12.4′ W122°45.1′', () => {
    // 44 + 12.4/60, -(122 + 45.1/60)
    const lat = 44 + 12.4 / 60;
    const lon = -(122 + 45.1 / 60);
    assert.equal(toGarminDmm(lat, lon), 'N44124W122451');
  });
});

describe('PLN → GFP', () => {
  it('converts Breckenridge PLN to a single-line FPN/RI under GTN capacity', () => {
    const xml = readFileSync(
      join(plnDir, 'Breckenridge to Mariposa Yosemite.PLN'),
      'utf8',
    );
    const result = msfsPlnXmlToGfp(xml, {
      title: 'Breckenridge to Mariposa Yosemite',
    });
    assert.match(result.body, /^FPN\/RI(:F:[A-Z0-9,]+)+$/);
    assert.ok(!result.body.includes(' '));
    assert.ok(!result.body.includes('\n'));
    assert.ok(result.waypointCount >= 2);
    assert.ok(result.waypointCount <= GFP_MAX_WAYPOINTS);
    assert.equal(result.departureId, 'O64');
    assert.equal(result.destinationId, 'KMPI');
    // Obscure dep should carry coords (not bare O64 — Garmin collision risk).
    assert.match(result.body, /:F:O64,N\d{5}W\d{6}/);
    assert.equal(
      gfpDownloadFilename(result.title, result.departureId, result.destinationId),
      'Breckenridge_to_Mariposa_Yosemite.gfp',
    );
  });

  it('uses MSFS hub coords for 57NC and drops nearby Tuckasegee stand-in', () => {
    const xml = readFileSync(join(plnDir, 'Appalachian Summits.PLN'), 'utf8');
    // Old FAA estimate (also the PLN User WP) vs MSFS Facilities.
    const msfs = { lat: 35.42648322880268, lon: -83.45821380615234 };
    const result = msfsPlnXmlToGfp(xml, {
      title: 'Appalachian Summits',
      coordsByIcao: {
        '57NC': msfs,
        '26A': { lat: 33.2842, lon: -85.8086 },
        KFDK: { lat: 39.4176, lon: -77.3743 },
      },
    });
    const match = result.body.match(/:F:57NC,(N\d{5}W\d{6})/);
    assert.ok(match, '57NC airport segment present');
    assert.equal(match![1], toGarminDmm(msfs.lat, msfs.lon));
    // Old stand-in was ~1.5 nm west — must not appear as a separate user fix.
    const oldDmm = toGarminDmm(35.4298, -83.4878);
    assert.ok(!result.body.includes(oldDmm));
  });

  it('thins long lists while keeping endpoints', () => {
    const mk = (i: number): GfpWaypoint => ({
      segment: `N${String(35000 + i).padStart(5, '0')}W118000`,
      lat: 35 + i * 0.01,
      lon: -118,
      kind: 'user',
    });
    const many = Array.from({ length: 150 }, (_, i) => mk(i));
    const thin = thinGfpWaypoints(many, 10);
    assert.equal(thin.length, 10);
    assert.equal(thin[0]!.lat, many[0]!.lat);
    assert.equal(thin[thin.length - 1]!.lat, many[many.length - 1]!.lat);
  });
});
