import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  demandOrderReachableFromOrigins,
  warehouseFreeCommodityKgClient,
  countPortCorridorDemandMatches,
  corridorNmForLevel,
  destWithinPortCorridorUi,
} from './demand-accept-preview.ts';

describe('demandOrderReachableFromOrigins', () => {
  it('keeps US domestic dests from a KMIA warehouse', () => {
    assert.equal(
      demandOrderReachableFromOrigins({
        destIcao: 'KLAX',
        destCountryId: 'US',
        origins: [{ icao: 'KMIA', countryId: 'US' }],
        pickupHubs: ['KMIA'],
      }),
      true,
    );
  });

  it('hides GE dests from a US warehouse (not an allowlisted pair)', () => {
    assert.equal(
      demandOrderReachableFromOrigins({
        destIcao: 'UGTB',
        destCountryId: 'GE',
        origins: [{ icao: 'KMIA', countryId: 'US' }],
        pickupHubs: ['KMIA'],
      }),
      false,
    );
  });

  it('allows PT→ES from a Lisbon port warehouse', () => {
    assert.equal(
      demandOrderReachableFromOrigins({
        destIcao: 'LEMD',
        destCountryId: 'ES',
        origins: [{ icao: 'LPPT', countryId: 'PT' }],
        pickupHubs: ['LPPT'],
      }),
      true,
    );
  });

  it('subtracts reserved hold kg from free warehouse stock', () => {
    assert.equal(warehouseFreeCommodityKgClient(800, 300), 500);
    assert.equal(warehouseFreeCommodityKgClient(200, 200), 0);
  });
});

describe('countPortCorridorDemandMatches', () => {
  it('counts reachable orders matching port commodities within nm', () => {
    // SBGR ~ -23.43,-46.47; SBSP is nearby; a far lat/lon stands in for KMIA.
    const sbgr = { lat: -23.4356, lon: -46.4731 };
    const n = countPortCorridorDemandMatches({
      orders: [
        {
          destIcao: 'SBSP',
          destCountryId: 'BR',
          destLat: -23.6261,
          destLon: -46.6553,
          commodityId: 'general',
          remainingKg: 1_000,
          status: 'open',
        },
        {
          destIcao: 'SBSP',
          destCountryId: 'BR',
          destLat: -23.6261,
          destLon: -46.6553,
          commodityId: 'electronics',
          remainingKg: 500,
          status: 'open',
        },
        {
          destIcao: 'KMIA',
          destCountryId: 'US',
          destLat: 25.7959,
          destLon: -80.287,
          commodityId: 'general',
          remainingKg: 800,
          status: 'open',
        },
      ],
      portPickupOrigins: [{ icao: 'SBGR', countryId: 'BR' }],
      portCommodityIds: ['general'],
      pickupHubs: ['SBGR', 'SBKP'],
      hubCoords: [sbgr],
      maxNm: corridorNmForLevel(1),
    });
    assert.equal(n, 1);
  });

  it('open corridor includes long-haul when maxNm is null', () => {
    const sbgr = { lat: -23.4356, lon: -46.4731 };
    assert.equal(
      destWithinPortCorridorUi({
        destLat: 25.7959,
        destLon: -80.287,
        hubCoords: [sbgr],
        maxNm: null,
      }),
      true,
    );
    assert.equal(
      destWithinPortCorridorUi({
        destLat: 25.7959,
        destLon: -80.287,
        hubCoords: [sbgr],
        maxNm: 500,
      }),
      false,
    );
  });
});
