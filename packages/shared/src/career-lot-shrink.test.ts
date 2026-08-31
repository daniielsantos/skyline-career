import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createSeedEconomyWorld,
  pruneUnbookableMarketScraps,
  shrinkLotAfterDelivery,
} from './career-economy.js';
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

  it('retires sub-viable scraps to origin when world is passed', () => {
    const world = createSeedEconomyWorld({ seed: 'lot-scrap-retire' });
    const origin = world.airports.find((a) => a.icao === 'SBGR');
    assert.ok(origin);
    const pile = origin.inventory.electronics!;
    const stockBefore = pile.stockKg;
    // Partial claim: 95 kg reserved of a 100 kg lot; settle leaves 5 kg free.
    const lot = sampleLot({
      quantityKg: 100,
      reservedKg: 95,
      payUsd: 340,
      basePayUsd: 340,
    });
    world.lots.push(lot);
    shrinkLotAfterDelivery(lot, 95, world);
    assert.equal(lot.status, 'expired');
    assert.ok(lot.quantityKg < 180);
    // Formation-reserve fraction of the unclaimed scrap returns to origin.
    assert.ok(pile.stockKg > stockBefore);
  });
});
describe('pruneUnbookableMarketScraps', () => {
  it('recycles available leftovers below BOARD_SMALL_MIN_VIABLE_KG', () => {
    const world = createSeedEconomyWorld({ seed: 'lot-scrap-prune' });
    world.lots.push(
      sampleLot({
        id: 'lot_scrap',
        quantityKg: 5,
        reservedKg: 0,
        payUsd: 17,
        basePayUsd: 16,
        status: 'available',
        originIcao: 'SBPV',
        destIcao: 'SBEG',
        commodityId: 'perishables',
      }),
    );
    world.lots.push(
      sampleLot({
        id: 'lot_thin_ga',
        quantityKg: 120,
        reservedKg: 0,
        payUsd: 48,
        basePayUsd: 48,
        status: 'available',
        originIcao: 'EGLL',
        destIcao: 'EGHH',
        commodityId: 'general',
      }),
    );
    const retired = pruneUnbookableMarketScraps(world);
    assert.equal(retired, 2);
    assert.equal(world.lots.find((l) => l.id === 'lot_scrap')?.status, 'expired');
    assert.equal(
      world.lots.find((l) => l.id === 'lot_thin_ga')?.status,
      'expired',
    );
  });
});
