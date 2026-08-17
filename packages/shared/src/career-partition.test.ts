import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createSeedEconomyWorld,
  ensureCareerHubCoverage,
  migrateEconomyWorld,
  tickEconomyN,
} from './career-economy.js';
import {
  countryIdFromHubIcao,
  countryIdFromRegion,
  findInternationalLane,
  inferHomeCountryId,
  isDomesticOd,
  isInternationalOdAllowed,
  laneMatchesOd,
  listWorldCountryIds,
  syncHomeCountryFromHub,
} from './career-partition.js';

describe('career partition', () => {
  it('derives country id from region prefixes', () => {
    assert.equal(countryIdFromRegion('BR-SE'), 'BR');
    assert.equal(countryIdFromRegion('br-n'), 'BR');
    assert.equal(countryIdFromRegion('US-SE'), 'US');
    assert.equal(countryIdFromRegion('CA-ON'), 'CA');
    assert.equal(countryIdFromRegion('MX-C'), 'MX');
    assert.equal(countryIdFromRegion('AR-BA'), 'AR');
    assert.equal(countryIdFromRegion('CL-C'), 'CL');
    assert.equal(countryIdFromRegion('BR'), 'BR');
  });

  it('seeds Brazil home with full Americas partition hubs + international lanes', () => {
    const world = createSeedEconomyWorld({ seed: 'partition-seed' });
    assert.equal(world.homeCountryId, 'BR');
    assert.equal(inferHomeCountryId(world), 'BR');
    assert.deepEqual(listWorldCountryIds(world), [
      'AE',
      'AF',
      'AG',
      'AL',
      'AM',
      'AR',
      'AT',
      'AW',
      'AZ',
      'BA',
      'BB',
      'BD',
      'BE',
      'BG',
      'BH',
      'BO',
      'BR',
      'BS',
      'BT',
      'BY',
      'BZ',
      'CA',
      'CH',
      'CL',
      'CO',
      'CR',
      'CU',
      'CW',
      'CY',
      'CZ',
      'DE',
      'DK',
      'DO',
      'DZ',
      'EC',
      'EE',
      'EG',
      'ES',
      'FI',
      'FR',
      'GB',
      'GD',
      'GE',
      'GF',
      'GP',
      'GR',
      'GT',
      'GY',
      'HN',
      'HR',
      'HT',
      'HU',
      'IE',
      'IL',
      'IN',
      'IQ',
      'IR',
      'IS',
      'IT',
      'JM',
      'JO',
      'KG',
      'KW',
      'KZ',
      'LB',
      'LC',
      'LK',
      'LT',
      'LU',
      'LV',
      'LY',
      'MA',
      'MD',
      'ME',
      'MK',
      'MM',
      'MQ',
      'MT',
      'MX',
      'NI',
      'NL',
      'NO',
      'NP',
      'OM',
      'PA',
      'PE',
      'PK',
      'PL',
      'PT',
      'PY',
      'QA',
      'RO',
      'RS',
      'SA',
      'SD',
      'SE',
      'SI',
      'SK',
      'SR',
      'SV',
      'SX',
      'SY',
      'TH',
      'TJ',
      'TM',
      'TN',
      'TR',
      'TT',
      'UA',
      'US',
      'UY',
      'UZ',
      'VE',
      'XK',
      'YE',
    ]);
    assert.ok(world.airports.some((a) => a.icao === 'KMIA'));
    assert.ok(world.airports.some((a) => a.icao === 'KLAX'));
    assert.ok(world.airports.some((a) => a.icao === 'KORD'));
    assert.ok(world.airports.some((a) => a.icao === 'CYYZ'));
    assert.ok(world.airports.some((a) => a.icao === 'MMMX'));
    assert.ok(world.airports.some((a) => a.icao === 'SAEZ'));
    assert.ok(world.airports.some((a) => a.icao === 'SCEL'));
    assert.ok(world.airports.some((a) => a.icao === 'SUMU'));
    assert.ok(world.airports.some((a) => a.icao === 'SGAS'));
    assert.ok(world.airports.some((a) => a.icao === 'SPJC'));
    assert.ok(world.airports.some((a) => a.icao === 'SKBO'));
    assert.ok(world.airports.some((a) => a.icao === 'SVMI'));
    assert.ok(world.airports.some((a) => a.icao === 'SYCJ'));
    assert.ok(world.airports.some((a) => a.icao === 'MPTO'));
    assert.ok(world.airports.some((a) => a.icao === 'MROC'));
    assert.ok(world.airports.some((a) => a.icao === 'MGGT'));
    assert.ok(world.airports.some((a) => a.icao === 'MUHA'));
    assert.ok(world.airports.some((a) => a.icao === 'MDSD'));
    assert.ok(world.airports.some((a) => a.icao === 'MKJP'));
    assert.ok(world.airports.some((a) => a.icao === 'MYNN'));
    assert.ok(world.airports.some((a) => a.icao === 'TTPP'));
    assert.ok(world.airports.some((a) => a.icao === 'TJSJ'));
    assert.ok(world.airports.some((a) => a.icao === 'TFFR'));
    assert.ok(world.airports.some((a) => a.icao === 'TNCC'));
    assert.ok((world.internationalLanes?.length ?? 0) >= 90);
    const usRegions = new Set(
      world.airports
        .filter((a) => countryIdFromRegion(a.region) === 'US')
        .map((a) => a.region),
    );
    assert.deepEqual(
      usRegions,
      new Set(['US-MW', 'US-MT', 'US-NE', 'US-PR', 'US-SC', 'US-SE', 'US-VI', 'US-W']),
    );
  });

  it('syncs homeCountryId from the chosen starter hub', () => {
    const world = createSeedEconomyWorld({ seed: 'home-from-hub' });
    assert.equal(world.homeCountryId, 'BR');
    assert.equal(countryIdFromHubIcao(world, 'KMIA'), 'US');
    assert.equal(countryIdFromHubIcao(world, 'SBGR'), 'BR');
    assert.equal(syncHomeCountryFromHub(world, 'KMIA'), true);
    assert.equal(world.homeCountryId, 'US');
    assert.equal(syncHomeCountryFromHub(world, 'KMIA'), false);
    assert.equal(syncHomeCountryFromHub(world, 'SBGR'), true);
    assert.equal(world.homeCountryId, 'BR');
  });

  it('matches international lanes bidirectionally', () => {
    const lane = {
      id: 'lane_sbgr_kmia',
      originCountryId: 'BR',
      destCountryId: 'US',
      originIcao: 'SBGR',
      destIcao: 'KMIA',
    };
    assert.equal(laneMatchesOd(lane, 'SBGR', 'KMIA'), true);
    assert.equal(laneMatchesOd(lane, 'KMIA', 'SBGR'), true);
    assert.equal(laneMatchesOd(lane, 'SBGR', 'KJFK'), false);
    assert.equal(isDomesticOd('BR-SE', 'BR-N'), true);
    assert.equal(isDomesticOd('BR-SE', 'US-SE'), false);
  });

  it('gates cross-country ODs to the lane table', () => {
    const world = createSeedEconomyWorld({ seed: 'lane-gate' });
    assert.equal(isInternationalOdAllowed(world, 'SBGR', 'KMIA'), true);
    assert.equal(isInternationalOdAllowed(world, 'KMIA', 'SBGR'), true);
    assert.equal(isInternationalOdAllowed(world, 'SBGR', 'SAEZ'), true);
    assert.equal(isInternationalOdAllowed(world, 'SAEZ', 'SCEL'), true);
    assert.equal(isInternationalOdAllowed(world, 'KMIA', 'SBCT'), false);
    assert.ok(findInternationalLane(world, 'SBEG', 'KMIA'));
    assert.ok(findInternationalLane(world, 'SBGR', 'SCEL'));
  });

  it('adds US/CA/MX/AR/CL hubs and lanes to a Brazil-only legacy save', () => {
    const full = createSeedEconomyWorld({ seed: 'us-coverage' });
    const brOnly = {
      version: 3 as const,
      seed: 'us-coverage',
      tick: 3,
      lastBatchAtMs: full.lastBatchAtMs,
      homeCountryId: 'BR',
      airports: full.airports.filter((a) => countryIdFromRegion(a.region) === 'BR'),
      lots: [],
      events: [],
      npcs: full.npcs,
      npcFlights: [],
      internationalLanes: [],
    };
    assert.equal(brOnly.airports.length, 62);
    assert.equal(ensureCareerHubCoverage(brOnly as typeof full), true);
    assert.equal(brOnly.airports.length, full.airports.length);
    assert.ok(brOnly.airports.some((a) => a.icao === 'KMIA'));
    assert.ok(brOnly.airports.some((a) => a.icao === 'KSEA'));
    assert.ok(brOnly.airports.some((a) => a.icao === 'KPDX'));
    assert.ok(brOnly.airports.some((a) => a.icao === 'CYVR'));
    assert.ok(brOnly.airports.some((a) => a.icao === 'MMUN'));
    assert.ok(brOnly.airports.some((a) => a.icao === 'SAEZ'));
    assert.ok(brOnly.airports.some((a) => a.icao === 'SCEL'));
    assert.ok((brOnly.internationalLanes?.length ?? 0) >= 30);

    const migrated = migrateEconomyWorld({
      version: 3,
      seed: 'us-coverage-mig',
      tick: 1,
      lastBatchAtMs: full.lastBatchAtMs,
      airports: full.airports.filter((a) => countryIdFromRegion(a.region) === 'BR'),
      lots: [],
      events: [],
      npcs: [],
      npcFlights: [],
    });
    assert.equal(migrated.airports.length, full.airports.length);
    assert.ok((migrated.internationalLanes?.length ?? 0) >= 30);
  });

  it('forms domestic and international lots; never off-lane cross-country', () => {
    const world = createSeedEconomyWorld({ seed: 'intl-form' });
    tickEconomyN(world, 48, { advanceWallClock: false });
    const active = world.lots.filter(
      (l) =>
        l.status === 'available' ||
        l.status === 'reserved' ||
        l.status === 'in_transit',
    );
    const byCountry = (icao: string) => {
      const ap = world.airports.find((a) => a.icao === icao);
      return countryIdFromRegion(ap?.region ?? '');
    };
    let brDom = 0;
    let usDom = 0;
    let otherDom = 0;
    let intl = 0;
    for (const lot of active) {
      const oc = byCountry(lot.originIcao);
      const dc = byCountry(lot.destIcao);
      if (oc === dc) {
        if (oc === 'BR') brDom += 1;
        else if (oc === 'US') usDom += 1;
        else otherDom += 1;
      } else {
        intl += 1;
        assert.equal(
          isInternationalOdAllowed(world, lot.originIcao, lot.destIcao),
          true,
          `unexpected off-lane intl ${lot.originIcao}→${lot.destIcao}`,
        );
      }
    }
    assert.ok(brDom > 0, 'expected BR domestic lots');
    assert.ok(
      usDom > 0 || otherDom > 0 || intl > 0,
      'expected US/CA/MX domestic or intl lots',
    );
    assert.equal(
      active.some((l) => l.originIcao === 'KMIA' && l.destIcao === 'SBCT'),
      false,
    );
    assert.ok(
      active.some(
        (l) =>
          (l.originIcao === 'SBGR' && l.destIcao === 'KMIA') ||
          (l.originIcao === 'KMIA' && l.destIcao === 'SBGR') ||
          (l.originIcao === 'SBKP' && l.destIcao === 'KMIA') ||
          (l.originIcao === 'KMIA' && l.destIcao === 'SBKP') ||
          (l.originIcao === 'SBEG' && l.destIcao === 'KMIA') ||
          (l.originIcao === 'KMIA' && l.destIcao === 'SBEG'),
      ),
      'expected at least one curated BR↔US lane lot',
    );
  });
});
