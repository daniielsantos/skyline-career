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
  it('maps load sheet fields from weights/fuel (kg sample)', () => {
    const ofp = mapSimBriefOfpToExpectation(
      {
        params: { units: 'kgs', request_id: 'abc123' },
        aircraft: { icaocode: 'B738' },
        fuel: { plan_ramp: '5291', enroute_burn: '2322' },
        weights: {
          oew: '42264',
          pax_count: '163',
          bag_weight: '4066',
          payload: '18114',
          est_zfw: '60378',
          est_tow: '65442',
          est_ldw: '63120',
          max_zfw: '62732',
          max_tow: '79333',
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
    assert.equal(ofp.ofpId, 'abc123');
    assert.equal(ofp.icao, 'B738');
    assert.equal(ofp.fuel.unit, 'kg');
    assert.equal(ofp.fuel.total, 5291);
    assert.equal(ofp.loadSheet?.blockFuel, 5291);
    assert.equal(ofp.loadSheet?.passengerCount, 163);
    assert.equal(ofp.loadSheet?.baggage, 4066);
    assert.equal(ofp.loadSheet?.payload, 18114);
    assert.equal(ofp.payload?.stationRoles?.passengerStations?.length, 4);
    assert.ok(
      ofp.payload?.stationRoles?.averagePassengerWeight !== undefined &&
        Math.abs(ofp.payload.stationRoles.averagePassengerWeight - (18114 - 4066) / 163) < 0.01,
    );
  });
});
