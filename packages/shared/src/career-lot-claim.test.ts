/**
 * Lot claim ownership — SP N=1 / MP first-claim mold.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSeedEconomyWorld } from './career-economy.js';
import {
  LotClaimConflictError,
  releaseShipmentReservation,
  reserveShipmentLot,
} from './career-mission.js';
import { executeAcceptLot } from './career-persist-commands.js';
import { emptyMissionsStateV2 } from './career-fleet.js';
import type { ShipmentLot } from './types/career-economy.js';

function pushLot(world: ReturnType<typeof createSeedEconomyWorld>, overrides: Partial<ShipmentLot> = {}) {
  const lot: ShipmentLot = {
    id: overrides.id ?? `claim_${world.lots.length}`,
    commodityId: 'general',
    originIcao: 'SBGR',
    destIcao: 'SBGL',
    quantityKg: 1_000,
    reservedKg: 0,
    createdAtTick: world.tick,
    expiresAtTick: world.tick + 200,
    payUsd: 5_000,
    urgency: 'normal',
    reason: 'claim test',
    status: 'available',
    ...overrides,
  };
  world.lots.push(lot);
  return lot;
}

describe('lot claimedByCompanyId', () => {
  it('stamps claim on reserve and clears on full release', () => {
    const world = createSeedEconomyWorld({ seed: 'lot-claim-stamp' });
    const lot = pushLot(world, { id: 'c1' });
    reserveShipmentLot(world, lot.id, 200, { companyId: 'co_a' });
    assert.equal(lot.claimedByCompanyId, 'co_a');
    assert.equal(lot.reservedKg, 200);
    releaseShipmentReservation(world, lot.id, 200);
    assert.equal(lot.reservedKg, 0);
    assert.equal(lot.claimedByCompanyId, undefined);
  });

  it('blocks another company from reserving a claimed lot', () => {
    const world = createSeedEconomyWorld({ seed: 'lot-claim-block' });
    const lot = pushLot(world, { id: 'c2' });
    reserveShipmentLot(world, lot.id, 100, { companyId: 'co_a' });
    assert.throws(
      () => reserveShipmentLot(world, lot.id, 50, { companyId: 'co_b' }),
      (err: unknown) => err instanceof LotClaimConflictError,
    );
  });

  it('executeAcceptLot returns conflict for foreign claim', () => {
    const world = createSeedEconomyWorld({ seed: 'lot-claim-accept' });
    const lot = pushLot(world, { id: 'c3', quantityKg: 500 });
    lot.claimedByCompanyId = 'other_co';
    lot.reservedKg = 100;
    lot.status = 'reserved';
    const missions = emptyMissionsStateV2();
    const result = executeAcceptLot(world, missions, {
      lotId: lot.id,
      cargoKg: 100,
      companyId: 'local',
    });
    assert.equal(result.kind, 'conflict');
    if (result.kind === 'conflict') {
      assert.equal(result.claimedByCompanyId, 'other_co');
    }
  });
});
