import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  appendReturnLegToStart,
  bushTripDefFromPln,
  collapsePlnToKLegs,
  isUsBushTripPlnEndpoint,
  isUsIcaoIdent,
  parseMsfsBushPln,
} from './career-bush-pln.js';
import {
  assertBushTripCatalog,
  getBushTrip,
  listBushTrips,
  listPlayableBushTrips,
} from './career-bush-trips.js';
import { US_CAREER_HUBS } from './career-us-hubs.js';

const plnDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'profiles',
  'career',
  'bush_PLN',
);

describe('MSFS bush PLN parser', () => {
  it('collapses Appalachian on catalog hubs including 26A start', () => {
    const xml = readFileSync(join(plnDir, 'Appalachian Summits.PLN'), 'utf8');
    const parsed = parseMsfsBushPln(xml);
    assert.ok(isUsBushTripPlnEndpoint('26A'));
    assert.ok(isUsBushTripPlnEndpoint('57NC'));
    assert.ok(parsed.kAirports.includes('26A'));
    assert.ok(parsed.kAirports.includes('KRMG'));
    assert.ok(parsed.kAirports.includes('KFDK'));
    assert.equal(parsed.localAirports.some((a) => isUsIcaoIdent(a)), false);
    const legs = collapsePlnToKLegs(parsed);
    assert.ok(legs.length >= 6);
    assert.equal(legs[0]!.fromIcao, '26A');
    assert.equal(legs[legs.length - 1]!.toIcao, 'KFDK');
    const round = appendReturnLegToStart(legs);
    assert.equal(round[round.length - 1]!.toIcao, '26A');
  });

  it('builds a one-way BushTripDef from California Dreams PLN', () => {
    const xml = readFileSync(join(plnDir, 'California Dreams.PLN'), 'utf8');
    const trip = bushTripDefFromPln({
      id: 'test-ca-dreams',
      displayTitle: 'California Dreams',
      countryId: 'US',
      xml,
      payUsd: 1,
    });
    assert.equal(trip.legs[0]!.fromIcao, 'KAVX');
    assert.equal(trip.legs[trip.legs.length - 1]!.toIcao, 'CA51');
    assert.notEqual(
      trip.legs[0]!.fromIcao,
      trip.legs[trip.legs.length - 1]!.toIcao,
    );
    assert.equal(trip.msfsValidated, false);
    assertBushTripCatalog([
      {
        ...trip,
        msfsValidated: true,
        legs: trip.legs.map((l) => ({ ...l, msfsValidated: true })),
      },
    ]);
  });
});

describe('US bush trip stubs + tour spokes', () => {
  it('catalog includes three US trips, K**** spokes, and bushTripOnly locals', () => {
    assertBushTripCatalog();
    assert.ok(getBushTrip('us-appalachian-summits'));
    assert.ok(getBushTrip('us-california-dreams'));
    assert.ok(getBushTrip('us-breckenridge-yosemite'));
    assert.equal(listPlayableBushTrips().length, 4);
    assert.ok(listBushTrips().length >= 4);
    for (const icao of [
      'KAVL',
      'KAVX',
      'KBIH',
      'KFDK',
      'KMPI',
      'KRMG',
      'KTRK',
    ]) {
      assert.ok(
        US_CAREER_HUBS.some((h) => h.icao === icao && !h.bush && !h.bushTripOnly),
        `missing spoke ${icao}`,
      );
    }
    for (const icao of ['26A', '57NC', 'O64', 'CA51']) {
      assert.ok(
        US_CAREER_HUBS.some((h) => h.icao === icao && h.bushTripOnly === true),
        `missing bushTripOnly ${icao}`,
      );
    }
    assert.equal(US_CAREER_HUBS.filter((h) => h.bushTripOnly).length, 32);
  });
});
