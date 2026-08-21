import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mapSimBriefOfpToBriefing,
  mapSimBriefOfpToExpectation,
  unitsFromSimBrief,
} from './simbrief-fetch.js';

describe('unitsFromSimBrief', () => {
  it('maps kgs/lbs', () => {
    assert.equal(unitsFromSimBrief('kgs'), 'kg');
    assert.equal(unitsFromSimBrief('KGS'), 'kg');
    assert.equal(unitsFromSimBrief('lbs'), 'lb');
  });
});

describe('mapSimBriefOfpToExpectation', () => {
  it('maps load sheet fields; baggage uses cargo not per-bag weight', () => {
    const ofp = mapSimBriefOfpToExpectation(
      {
        params: { units: 'kgs', request_id: 'abc123' },
        aircraft: { icaocode: 'B738' },
        origin: { icao_code: 'SBGR' },
        destination: { icao_code: 'SBGL' },
        fuel: { plan_ramp: '5236', enroute_burn: '2299', taxi: '400' },
        weights: {
          oew: '42264',
          pax_count: '156',
          bag_count: '156',
          pax_weight: '86.183',
          bag_weight: '24.948',
          freight_added: '0',
          cargo: '3892',
          payload: '17336',
          est_zfw: '59600',
          est_tow: '64609',
          est_ldw: '62310',
          max_zfw: '62732',
          max_tow: '68660',
          max_ldw: '66361',
        },
      },
      {
        stationRoles: {
          passengerStations: [1, 2, 3, 4],
          baggageStations: [5, 6],
        },
      },
    );

    assert.equal(ofp.source, 'simbrief');
    assert.equal(ofp.fuel.total, 5236);
    assert.equal(ofp.loadSheet?.taxiFuel, 400);
    assert.equal(ofp.loadSheet?.passengerCount, 156);
    assert.equal(ofp.loadSheet?.baggage, 3892);
    assert.equal(ofp.loadSheet?.payload, 17336);
    assert.equal(ofp.originIcao, 'SBGR');
    assert.equal(ofp.destIcao, 'SBGL');
    assert.ok(
      ofp.payload?.stationRoles?.averagePassengerWeight !== undefined &&
        Math.abs(ofp.payload.stationRoles.averagePassengerWeight - 86.183) < 0.01,
    );
  });

  it('falls back to bag_count * bag_weight when cargo missing', () => {
    const ofp = mapSimBriefOfpToExpectation({
      params: { units: 'kgs' },
      fuel: { plan_ramp: '1000' },
      weights: {
        pax_count: '10',
        bag_count: '10',
        bag_weight: '25',
        payload: '1000',
      },
    });
    assert.equal(ofp.loadSheet?.baggage, 250);
  });
});

describe('mapSimBriefOfpToBriefing', () => {
  it('maps a JetCard-style operational strip and complete route', () => {
    const briefing = mapSimBriefOfpToBriefing({
      general: {
        route: ' DCT REPID   DCT VANOK DCT ',
        route_distance: '395',
        initial_altitude: '7000',
      },
      aircraft: { icaocode: 'C208', reg: 'N017SB' },
      origin: { icao_code: 'SBCT', plan_rwy: '33' },
      destination: { icao_code: 'SBGL', plan_rwy: '10' },
      alternate: [{ icao_code: 'SBSJ' }],
      times: { est_block: '02:40:43' },
    });

    assert.deepEqual(briefing, {
      aircraftIcao: 'C208',
      tailNumber: 'N017SB',
      distanceNm: 395,
      blockTime: '02:40',
      cruiseAltitudeFt: 7000,
      alternateIcao: 'SBSJ',
      route: 'SBCT/33 DCT REPID DCT VANOK DCT SBGL/10',
    });
  });

  it('maps air time from est_time_enroute seconds', () => {
    const briefing = mapSimBriefOfpToBriefing({
      origin: { icao_code: 'SBCT' },
      destination: { icao_code: 'SBJV' },
      times: {
        est_block: '00:59:00',
        est_time_enroute: 1860,
      },
    });
    assert.equal(briefing.blockTime, '00:59');
    assert.equal(briefing.airTime, '00:31');
  });

  it('maps air time from HH:MM est_time_enroute', () => {
    const briefing = mapSimBriefOfpToBriefing({
      times: {
        est_block: '00:59:00',
        est_time_enroute: '00:31:12',
      },
    });
    assert.equal(briefing.airTime, '00:31');
  });

  it('falls back to air distance and scheduled block time', () => {
    const briefing = mapSimBriefOfpToBriefing({
      general: { route_ifps: 'DCT ABC', air_distance: 123 },
      origin: { icao: 'KORD' },
      destination: { icao: 'KFAR' },
      times: { sched_block: '01:25:00' },
    });
    assert.equal(briefing.distanceNm, 123);
    assert.equal(briefing.blockTime, '01:25');
    assert.equal(briefing.route, 'KORD DCT ABC KFAR');
  });

  it('maps navlog fixes with coordinates onto briefing.waypoints', () => {
    const briefing = mapSimBriefOfpToBriefing({
      origin: { icao_code: 'KDTW', plan_rwy: '04R' },
      destination: { icao_code: 'KORD', plan_rwy: '09L' },
      general: { route: 'METRO4 DUNKS DCT PMM DCT' },
      navlog: {
        fix: [
          {
            ident: 'KDTW',
            type: 'apt',
            pos_lat: '42.2162',
            pos_long: '-83.3554',
          },
          {
            ident: 'DUNKS',
            type: 'wpt',
            pos_lat: '41.712',
            pos_long: '-85.421',
          },
          {
            ident: 'PMM',
            type: 'vor',
            pos_lat: '42.212',
            pos_long: '-85.553',
          },
          {
            ident: 'KORD',
            type: 'apt',
            pos_lat: '41.9742',
            pos_long: '-87.9073',
          },
        ],
      },
    });
    assert.equal(briefing.route, 'KDTW/04R METRO4 DUNKS DCT PMM DCT KORD/09L');
    assert.deepEqual(briefing.waypoints, [
      { ident: 'KDTW', lat: 42.2162, lon: -83.3554, type: 'apt' },
      { ident: 'DUNKS', lat: 41.712, lon: -85.421, type: 'wpt' },
      { ident: 'PMM', lat: 42.212, lon: -85.553, type: 'vor' },
      { ident: 'KORD', lat: 41.9742, lon: -87.9073, type: 'apt' },
    ]);
  });

  it('maps navlog when fix list is an object map (XML→JSON style)', () => {
    const briefing = mapSimBriefOfpToBriefing({
      origin: { icao_code: 'KDTW' },
      destination: { icao_code: 'KORD' },
      navlog: {
        fix: {
          '0': {
            ident: 'DUNKS',
            type: 'wpt',
            pos_lat: '41.712',
            pos_long: '-85.421',
          },
          '1': {
            ident: 'PMM',
            type: 'vor',
            pos_lat: '42.212',
            pos_long: '-85.553',
          },
        },
      } as never,
    });
    assert.deepEqual(briefing.waypoints, [
      { ident: 'DUNKS', lat: 41.712, lon: -85.421, type: 'wpt' },
      { ident: 'PMM', lat: 42.212, lon: -85.553, type: 'vor' },
    ]);
  });
});

describe('fetchSimBriefLatestOfp static_id', () => {
  it('appends static_id to fetcher query', async () => {
    const { fetchSimBriefLatestOfp } = await import('./simbrief-fetch.js');
    let requested = '';
    await fetchSimBriefLatestOfp({
      username: 'pilot',
      staticId: 'skyline_abc',
      fetchImpl: async (input) => {
        requested = String(input);
        return new Response(
          JSON.stringify({
            params: { units: 'kgs' },
            fuel: { plan_ramp: '1000' },
            weights: { payload: '5000', pax_count: '10' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    });
    const qs = new URL(requested).searchParams;
    assert.equal(qs.get('username'), 'pilot');
    assert.equal(qs.get('static_id'), 'skyline_abc');
    assert.equal(qs.get('json'), 'v2');
  });
});
