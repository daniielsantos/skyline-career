/**
 * PG Wave-1 lots/charter sync — retain predicates must match shouldRetain*.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CHARTER_DEAD_OFFER_RETENTION_TICKS,
  shouldRetainCharterOffer,
} from './career-charter.js';
import {
  DEAD_LOT_RETENTION_TICKS,
  shouldRetainLot,
} from './career-economy.js';
import {
  charterOfferPgRetainKeepFromTick,
  charterOfferPgRowMatchesRetain,
  lotPgRetainKeepFromTick,
  lotPgRowMatchesRetain,
} from './career-store-pg-world.js';
import type { CharterOffer, ShipmentLot } from './types/career-economy.js';

function stubLot(
  overrides: Partial<ShipmentLot> & Pick<ShipmentLot, 'status'>,
): ShipmentLot {
  return {
    id: 'lot_1',
    commodityId: 'general',
    originIcao: 'SBGR',
    destIcao: 'SBSP',
    quantityKg: 100,
    reservedKg: 0,
    createdAtTick: 100,
    expiresAtTick: 200,
    payUsd: 1000,
    urgency: 'normal',
    reason: 'test',
    ...overrides,
  };
}

function stubOffer(
  overrides: Partial<CharterOffer> & Pick<CharterOffer, 'status'>,
): CharterOffer {
  return {
    id: 'c1',
    demandId: 'd1',
    originIcao: 'SBGR',
    destIcao: 'SBSP',
    groupSize: 4,
    baggageKg: 40,
    distanceNm: 120,
    tier: 'executive',
    urgency: 'normal',
    international: false,
    payUsd: 5000,
    createdAtTick: 100,
    expiresAtTick: 200,
    ...overrides,
  };
}

describe('PG lots/charter retain parity (Wave 1 upsert)', () => {
  it('keepFrom mirrors DEAD_LOT / CHARTER retention constants', () => {
    assert.equal(lotPgRetainKeepFromTick(1000), 1000 - DEAD_LOT_RETENTION_TICKS);
    assert.equal(
      charterOfferPgRetainKeepFromTick(1000),
      1000 - CHARTER_DEAD_OFFER_RETENTION_TICKS,
    );
  });

  it('lotPgRowMatchesRetain matches shouldRetainLot for live and dead statuses', () => {
    const tick = 500;
    const cases: Array<Partial<ShipmentLot> & Pick<ShipmentLot, 'status'>> = [
      { status: 'available' },
      { status: 'reserved' },
      { status: 'in_transit' },
      { status: 'delivered' },
      { status: 'expired', expiresAtTick: tick },
      { status: 'expired', expiresAtTick: tick - DEAD_LOT_RETENTION_TICKS },
      { status: 'expired', expiresAtTick: tick - DEAD_LOT_RETENTION_TICKS - 1 },
    ];
    for (const partial of cases) {
      const lot = stubLot(partial);
      assert.equal(
        lotPgRowMatchesRetain(lot.status, lot.expiresAtTick, tick),
        shouldRetainLot(lot, tick),
        `${lot.status}@${lot.expiresAtTick}`,
      );
    }
    // Unknown/terminal statuses not in ShipmentLotStatus still drop (SQL parity).
    assert.equal(lotPgRowMatchesRetain('cancelled', tick, tick), false);
    assert.equal(lotPgRowMatchesRetain('completed', tick, tick), false);
  });

  it('charterOfferPgRowMatchesRetain matches shouldRetainCharterOffer', () => {
    const tick = 500;
    const cases: Array<Partial<CharterOffer> & Pick<CharterOffer, 'status'>> = [
      { status: 'available' },
      { status: 'reserved' },
      { status: 'completed' },
      { status: 'cancelled' },
      { status: 'expired', expiresAtTick: tick },
      {
        status: 'expired',
        expiresAtTick: tick - CHARTER_DEAD_OFFER_RETENTION_TICKS,
      },
      {
        status: 'expired',
        expiresAtTick: tick - CHARTER_DEAD_OFFER_RETENTION_TICKS - 1,
      },
    ];
    for (const partial of cases) {
      const offer = stubOffer(partial);
      assert.equal(
        charterOfferPgRowMatchesRetain(offer.status, offer.expiresAtTick, tick),
        shouldRetainCharterOffer(offer, tick),
        `${offer.status}@${offer.expiresAtTick}`,
      );
    }
  });
});
