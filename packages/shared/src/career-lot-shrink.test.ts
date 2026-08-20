import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shrinkLotAfterDelivery } from './career-economy.js';
import type { ShipmentLot } from './types/career-economy.js';

function sampleLot(overrides: Partial<ShipmentLot> = {}): ShipmentLot {
  return {
    id: 'lot_test',
    commodityId: 'electronics',
    originIcao: 'SBGR',
    destIcao: 'SBGL',
    quantityKg: 20_000,
    reservedKg: 5_000,
    createdAtTick: 0,
    expiresAtTick: 100,
    payUsd: 800_000,
    basePayUsd: 700_000,
    urgency: 'normal',
    reason: 'test',
    status: 'reserved',
    ...overrides,
  };
}

describe('shrinkLotAfterDelivery', () => {
  it('pro-rates pay when a partial delivery leaves remainder', () => {
    const lot = sampleLot();
    shrinkLotAfterDelivery(lot, 15_000);
    assert.equal(lot.quantityKg, 5_000);
    assert.equal(lot.reservedKg, 0);
    assert.equal(lot.status, 'available');
    assert.equal(lot.payUsd, 200_000);
    assert.equal(lot.basePayUsd, 175_000);
  });

  it('clears pay when the lot is fully delivered', () => {
    const lot = sampleLot({ reservedKg: 20_000 });
    shrinkLotAfterDelivery(lot, 20_000);
    assert.equal(lot.quantityKg, 0);
    assert.equal(lot.status, 'delivered');
    assert.equal(lot.payUsd, 0);
    assert.equal(lot.basePayUsd, 0);
  });
});
