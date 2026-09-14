/**
 * Company registry — SP N=1 / shared world N companies (Phase 3).
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { resolveCompanyId } from './career-companies.js';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2 } from './career-fleet.js';
import { executeAcceptLot } from './career-persist-commands.js';
import { LOCAL_COMPANY_ID, openCareerStore } from './career-store.js';
import { LOCAL_WORLD_ID } from './career-store-v4.js';
import type { ShipmentLot } from './types/career-economy.js';

async function cleanupDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

describe('career companies registry', () => {
  it('ensureCompany + listCompaniesForWorld on shared world', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-co-reg-'));
    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    try {
      const a = await Promise.resolve(
        store.ensureCompany({
          id: 'co_alpha',
          worldId: LOCAL_WORLD_ID,
          displayName: 'Alpha Air',
        }),
      );
      const b = await Promise.resolve(
        store.ensureCompany({
          id: 'co_beta',
          worldId: LOCAL_WORLD_ID,
          displayName: 'Beta Cargo',
        }),
      );
      assert.equal(a.worldId, LOCAL_WORLD_ID);
      assert.equal(b.worldId, LOCAL_WORLD_ID);
      const listed = await Promise.resolve(
        store.listWorldCompanies(LOCAL_WORLD_ID),
      );
      const ids = listed.map((c) => c.id).sort();
      assert.ok(ids.includes(LOCAL_COMPANY_ID));
      assert.ok(ids.includes('co_alpha'));
      assert.ok(ids.includes('co_beta'));
      assert.equal(resolveCompanyId({ requested: 'co_alpha' }), 'co_alpha');
    } finally {
      store.close();
      await cleanupDir(dir);
    }
  });

  it('dual-company Accept: second company gets conflict on claimed lot', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-co-claim-'));
    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    try {
      await Promise.resolve(store.ensureCompany({ id: 'co_a', worldId: LOCAL_WORLD_ID }));
      await Promise.resolve(store.ensureCompany({ id: 'co_b', worldId: LOCAL_WORLD_ID }));
      await store.saveMissions(emptyMissionsStateV2(), { companyId: 'co_a' });
      await store.saveMissions(emptyMissionsStateV2(), { companyId: 'co_b' });

      const world = createSeedEconomyWorld({ seed: 'dual-co-accept' });
      const lot: ShipmentLot = {
        id: 'dual_lot_1',
        commodityId: 'general',
        originIcao: 'SBGR',
        destIcao: 'SBGL',
        quantityKg: 800,
        reservedKg: 0,
        createdAtTick: world.tick,
        expiresAtTick: world.tick + 200,
        payUsd: 4_000,
        urgency: 'normal',
        reason: 'dual company',
        status: 'available',
      };
      world.lots.push(lot);

      const missionsA = await store.loadMissions({ companyId: 'co_a' });
      const first = executeAcceptLot(world, missionsA, {
        lotId: lot.id,
        cargoKg: 200,
        companyId: 'co_a',
      });
      assert.ok(first.kind === 'applied' || first.kind === 'replay');
      assert.equal(lot.claimedByCompanyId, 'co_a');

      const missionsB = await store.loadMissions({ companyId: 'co_b' });
      const second = executeAcceptLot(world, missionsB, {
        lotId: lot.id,
        cargoKg: 100,
        companyId: 'co_b',
      });
      assert.equal(second.kind, 'conflict');
      if (second.kind === 'conflict') {
        assert.equal(second.claimedByCompanyId, 'co_a');
      }
    } finally {
      store.close();
      await cleanupDir(dir);
    }
  });

  it('company-scoped ledger does not wipe the other tenant', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-co-ledger-'));
    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    try {
      await Promise.resolve(store.ensureCompany({ id: 'co_a', worldId: LOCAL_WORLD_ID }));
      await Promise.resolve(store.ensureCompany({ id: 'co_b', worldId: LOCAL_WORLD_ID }));
      const a = emptyMissionsStateV2();
      a.ledger = [
        {
          id: 'la1',
          atTick: 1,
          dayIndex: 0,
          amountUsd: 10,
          kind: 'freight_payout',
          note: 'a',
        },
      ];
      const b = emptyMissionsStateV2();
      b.ledger = [
        {
          id: 'lb1',
          atTick: 1,
          dayIndex: 0,
          amountUsd: 20,
          kind: 'freight_payout',
          note: 'b',
        },
      ];
      await store.saveMissions(a, { companyId: 'co_a' });
      await store.saveMissions(b, { companyId: 'co_b' });
      a.ledger = [];
      await store.saveMissions(a, { companyId: 'co_a' });
      const loadedB = await store.loadMissions({ companyId: 'co_b' });
      assert.equal(loadedB.ledger?.length, 1);
      assert.equal(loadedB.ledger?.[0]?.id, 'lb1');
    } finally {
      store.close();
      await cleanupDir(dir);
    }
  });
});
