import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapSimBriefOfpToExpectation, unitsFromSimBrief } from './simbrief-fetch.js';

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
        fuel: { plan_ramp: '5236', enroute_burn: '2299' },
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
    assert.equal(ofp.loadSheet?.passengerCount, 156);
    assert.equal(ofp.loadSheet?.baggage, 3892);
    assert.equal(ofp.loadSheet?.payload, 17336);
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
