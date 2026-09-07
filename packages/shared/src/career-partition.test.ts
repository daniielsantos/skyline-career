import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createSeedEconomyWorld,
  DYNAMIC_INTL_LONG_HAUL_MIN_NM,
  DYNAMIC_INTL_MAX_LANES_PER_COUNTRY,
  DYNAMIC_INTL_MAX_LANES_PER_COUNTRY_PAIR,
  DYNAMIC_INTL_MIN_LANES_PER_COUNTRY,
  ensureCareerHubCoverage,
  ensureInternationalLanes,
  migrateEconomyWorld,
  routeDistanceNm,
  selectDynamicInternationalLanes,
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
      'AO',
      'AR',
        'AT',
        'AU',
        'AW',
      'AZ',
      'BA',
      'BB',
      'BD',
      'BE',
      'BF',
      'BG',
      'BH',
      'BI',
      'BJ',
      'BN',
      'BO',
      'BR',
      'BS',
      'BT',
      'BW',
      'BY',
      'BZ',
      'CA',
      'CD',
      'CF',
      'CG',
      'CH',
        'CI',
        'CK',
        'CL',
      'CM',
      'CN',
      'CO',
      'CR',
      'CU',
      'CV',
      'CW',
      'CY',
      'CZ',
      'DE',
      'DJ',
      'DK',
      'DO',
      'DZ',
      'EC',
      'EE',
      'EG',
      'ER',
      'ES',
      'ET',
        'FI',
        'FJ',
        'FR',
      'GA',
      'GB',
      'GD',
      'GE',
      'GF',
      'GH',
      'GM',
      'GN',
      'GP',
      'GQ',
      'GR',
      'GT',
      'GW',
      'GY',
      'HN',
      'HR',
      'HT',
      'HU',
      'ID',
      'IE',
      'IL',
      'IN',
      'IQ',
      'IR',
      'IS',
      'IT',
      'JM',
      'JO',
      'JP',
        'KE',
        'KG',
        'KI',
        'KM',
        'KR',
      'KW',
      'KZ',
      'LB',
      'LC',
      'LK',
      'LR',
      'LS',
      'LT',
      'LU',
      'LV',
      'LY',
      'MA',
      'MD',
      'ME',
      'MG',
      'MK',
      'ML',
      'MM',
      'MQ',
      'MR',
      'MT',
      'MU',
      'MW',
      'MX',
        'MY',
        'MZ',
        'NA',
        'NC',
        'NE',
        'NG',
        'NI',
      'NL',
      'NO',
        'NP',
        'NZ',
        'OM',
      'PA',
        'PE',
        'PF',
        'PG',
        'PH',
      'PK',
      'PL',
        'PT',
        'PW',
        'PY',
      'QA',
      'RO',
      'RS',
      'RU',
      'RW',
        'SA',
        'SB',
        'SC',
        'SD',
      'SE',
      'SG',
      'SI',
      'SK',
      'SL',
      'SN',
      'SO',
      'SR',
      'SS',
      'ST',
      'SV',
      'SX',
      'SY',
      'SZ',
      'TD',
      'TG',
      'TH',
      'TJ',
      'TM',
        'TN',
        'TO',
        'TR',
        'TT',
        'TW',
        'TZ',
        'UA',
      'UG',
      'US',
      'UY',
      'UZ',
      'VE',
        'VN',
        'VU',
        'WS',
        'XK',
      'YE',
      'ZA',
      'ZM',
      'ZW',
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
      new Set(['US-AS', 'US-GU', 'US-HI', 'US-MP', 'US-MW', 'US-MT', 'US-NE', 'US-PR', 'US-SC', 'US-SE', 'US-VI', 'US-W']),
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

  it('gates cross-country ODs to the current daily lane graph', () => {
    const world = createSeedEconomyWorld({ seed: 'lane-gate' });
    const lane = world.internationalLanes?.[0];
    assert.ok(lane);
    assert.match(lane!.id, /^dyn_d0_/);
    assert.equal(
      isInternationalOdAllowed(world, lane!.originIcao, lane!.destIcao),
      true,
    );
    assert.equal(
      isInternationalOdAllowed(world, lane!.destIcao, lane!.originIcao),
      true,
    );
    assert.ok(findInternationalLane(world, lane!.originIcao, lane!.destIcao));
    assert.equal(
      isInternationalOdAllowed(world, lane!.originIcao, 'SBCT'),
      lane!.destIcao === 'SBCT',
    );
  });

  it('bounds daily lanes fairly by country and country pair', () => {
    const world = createSeedEconomyWorld({ seed: 'lane-fairness' });
    const lanes = world.internationalLanes ?? [];
    const byCountry = new Map<string, number>();
    const byPair = new Map<string, number>();
    let longHaul = 0;
    for (const lane of lanes) {
      byCountry.set(
        lane.originCountryId,
        (byCountry.get(lane.originCountryId) ?? 0) + 1,
      );
      byCountry.set(
        lane.destCountryId,
        (byCountry.get(lane.destCountryId) ?? 0) + 1,
      );
      const pair = [lane.originCountryId, lane.destCountryId].sort().join('|');
      byPair.set(pair, (byPair.get(pair) ?? 0) + 1);
      const nm = routeDistanceNm(world, lane.originIcao, lane.destIcao) ?? 0;
      if (nm >= DYNAMIC_INTL_LONG_HAUL_MIN_NM) longHaul += 1;
    }
    for (const country of listWorldCountryIds(world)) {
      const n = byCountry.get(country) ?? 0;
      assert.ok(
        n >= DYNAMIC_INTL_MIN_LANES_PER_COUNTRY,
        `${country} should have at least ${DYNAMIC_INTL_MIN_LANES_PER_COUNTRY} lanes, got ${n}`,
      );
      assert.ok(
        n <= DYNAMIC_INTL_MAX_LANES_PER_COUNTRY,
        `${country} exceeds country lane cap: ${n}`,
      );
    }
    for (const [pair, n] of byPair) {
      assert.ok(
        n <= DYNAMIC_INTL_MAX_LANES_PER_COUNTRY_PAIR,
        `${pair} exceeds pair lane cap: ${n}`,
      );
    }
    assert.ok(longHaul > 0, 'expected a long-haul slice');
  });

  it('replays the exact lane set for the same seed and economy day', () => {
    const a = createSeedEconomyWorld({ seed: 'lane-day-replay' });
    const b = createSeedEconomyWorld({ seed: 'lane-day-replay' });
    const fingerprint = (lanes: typeof a.internationalLanes) =>
      (lanes ?? [])
        .map(
          (lane) =>
            `${lane.id}|${lane.originIcao}|${lane.destIcao}|${lane.capacityKgPerDay}`,
        )
        .sort();
    const day0 = fingerprint(a.internationalLanes);
    assert.deepEqual(day0, fingerprint(b.internationalLanes));

    a.tick = 96;
    b.tick = 96;
    ensureInternationalLanes(a);
    ensureInternationalLanes(b);
    assert.deepEqual(
      fingerprint(a.internationalLanes),
      fingerprint(b.internationalLanes),
    );
    assert.notDeepEqual(fingerprint(a.internationalLanes), day0);

    a.tick = 0;
    assert.deepEqual(fingerprint(selectDynamicInternationalLanes(a)), day0);
  });

  it('rotates lanes daily and carries active freight ODs across midnight', () => {
    const world = createSeedEconomyWorld({ seed: 'lane-daily-refresh' });
    const day0 = world.internationalLanes ?? [];
    assert.ok(day0.length > 0);
    const carried = day0[0]!;
    for (const [index, lane] of day0.slice(0, 250).entries()) {
      world.lots.push({
        id: `lot_lane_carry_${index}`,
        commodityId: 'general',
        originIcao: lane.originIcao,
        destIcao: lane.destIcao,
        quantityKg: 1_000,
        reservedKg: 0,
        createdAtTick: 0,
        expiresAtTick: 200,
        payUsd: 2_000,
        basePayUsd: 2_000,
        urgency: 'normal',
        reason: 'daily lane carry test',
        status: 'available',
      });
    }
    world.tick = 96;
    assert.equal(ensureInternationalLanes(world), true);
    assert.ok(world.internationalLanes?.some((lane) => /^dyn_d1_/.test(lane.id)));
    assert.ok(
      findInternationalLane(world, carried.originIcao, carried.destIcao),
      'active freight OD must remain legal after the refresh',
    );
    assert.ok(
      (world.internationalLanes?.length ?? 0) <= 480,
      'carry-over must consume the bounded daily graph instead of growing it',
    );
    const countryCounts = new Map<string, number>();
    for (const lane of world.internationalLanes ?? []) {
      countryCounts.set(
        lane.originCountryId,
        (countryCounts.get(lane.originCountryId) ?? 0) + 1,
      );
      countryCounts.set(
        lane.destCountryId,
        (countryCounts.get(lane.destCountryId) ?? 0) + 1,
      );
    }
    assert.ok(
      Math.max(...countryCounts.values()) <= DYNAMIC_INTL_MAX_LANES_PER_COUNTRY,
      'carry-over must count against the per-country cap',
    );
    assert.notDeepEqual(
      (world.internationalLanes ?? [])
        .filter((lane) => lane.id.startsWith('dyn_'))
        .map((lane) => lane.id)
        .sort(),
      day0.map((lane) => lane.id).sort(),
    );
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
    assert.equal(
      brOnly.airports.length,
      full.airports.filter((a) => countryIdFromRegion(a.region) === 'BR').length,
    );
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
    assert.ok(intl > 0, 'expected at least one dynamic international lot');
  });
});
