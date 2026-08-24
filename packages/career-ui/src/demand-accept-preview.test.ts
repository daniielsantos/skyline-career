import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { demandOrderReachableFromOrigins, warehouseFreeCommodityKgClient } from './demand-accept-preview.ts';

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
