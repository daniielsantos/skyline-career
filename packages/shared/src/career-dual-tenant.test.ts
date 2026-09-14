/**
 * Phase 5 — dual-tenant shared world: same tick, lot vanishes for rival, Accept conflict.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSeedEconomyWorld, listMarketLots } from './career-economy.js';
import { emptyMissionsStateV2 } from './career-fleet.js';
import {
  executeAcceptLot,
  executeAcceptManifest,
} from './career-persist-commands.js';
import type { ShipmentLot } from './types/career-economy.js';

function pushLot(
  world: ReturnType<typeof createSeedEconomyWorld>,
  overrides: Partial<ShipmentLot> = {},
): ShipmentLot {
  const lot: ShipmentLot = {
    id: overrides.id ?? `dual_${world.lots.length}`,
    commodityId: 'general',
    originIcao: 'SBGR',
    destIcao: 'SBGL',
    quantityKg: 1_200,
    reservedKg: 0,
    createdAtTick: world.tick,
    expiresAtTick: world.tick + 200,
    payUsd: 6_000,
    urgency: 'normal',
    reason: 'dual tenant',
    status: 'available',
    ...overrides,
  };
  world.lots.push(lot);
  return lot;
}

describe('Phase 5 dual-tenant shared world', () => {
  it('same world tick for both companies; claim hides lot from rival board', () => {
    const world = createSeedEconomyWorld({ seed: 'dual-tenant-board' });
    const tick = world.tick;
    const lot = pushLot(world, { id: 'dual_board_1', quantityKg: 800 });

    const missionsA = emptyMissionsStateV2();
    missionsA.hubSelected = true;
    const accepted = executeAcceptLot(world, missionsA, {
      lotId: lot.id,
      cargoKg: 800,
      companyId: 'co_a',
    });
    assert.ok(accepted.kind === 'applied' || accepted.kind === 'replay');
    assert.equal(lot.claimedByCompanyId, 'co_a');
    assert.equal(world.tick, tick);

    const boardA = listMarketLots(world, { viewerCompanyId: 'co_a' });
    const boardB = listMarketLots(world, { viewerCompanyId: 'co_b' });
    assert.equal(
      boardA.some((row) => row.lot.id === lot.id),
      false,
      'full accept should leave availableKg=0 for claimant too',
    );
    assert.equal(
      boardB.some((row) => row.lot.id === lot.id),
      false,
      'rival must not see foreign-claimed lot',
    );

    const missionsB = emptyMissionsStateV2();
    const conflict = executeAcceptLot(world, missionsB, {
      lotId: lot.id,
      cargoKg: 100,
      companyId: 'co_b',
    });
    assert.equal(conflict.kind, 'conflict');
    if (conflict.kind === 'conflict') {
      assert.equal(conflict.claimedByCompanyId, 'co_a');
    }
  });

  it('partial claim hides remaining kg from rival; staging Accept conflicts', () => {
    const world = createSeedEconomyWorld({ seed: 'dual-tenant-partial' });
    const lot = pushLot(world, {
      id: 'dual_partial_1',
      quantityKg: 1_000,
    });

    const missionsA = emptyMissionsStateV2();
    missionsA.hubSelected = true;
    const first = executeAcceptLot(world, missionsA, {
      lotId: lot.id,
      cargoKg: 200,
      companyId: 'co_a',
    });
    assert.ok(first.kind === 'applied' || first.kind === 'replay');
    assert.equal(lot.claimedByCompanyId, 'co_a');
    assert.ok(lot.quantityKg - lot.reservedKg > 0);

    const boardB = listMarketLots(world, { viewerCompanyId: 'co_b' });
    assert.equal(
      boardB.some((row) => row.lot.id === lot.id),
      false,
    );
    const boardA = listMarketLots(world, { viewerCompanyId: 'co_a' });
    assert.equal(
      boardA.some((row) => row.lot.id === lot.id),
      true,
      'claimant still sees remaining kg',
    );

    const missionsB = emptyMissionsStateV2();
    missionsB.hubSelected = true;
    const staged = executeAcceptManifest(world, missionsB, {
      lines: [{ lotId: lot.id, cargoKg: 100 }],
      companyId: 'co_b',
    });
    assert.equal(staged.kind, 'conflict');
    if (staged.kind === 'conflict') {
      assert.equal(staged.claimedByCompanyId, 'co_a');
    }
  });
});
