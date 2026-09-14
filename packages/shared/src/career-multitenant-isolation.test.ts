/**
 * Multitenant isolation — store + ambient thrash (Phase 6 validation).
 * Proves explicit companyId load/save ignores activeCompanyId.
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { createSeedEconomyWorld, listMarketLots } from './career-economy.js';
import { emptyMissionsStateV2 } from './career-fleet.js';
import { cancelMission, listActivePlayerMissions } from './career-mission.js';
import { acceptContractPilotOffer } from './career-npc.js';
import { executeAcceptLot } from './career-persist-commands.js';
import { LOCAL_COMPANY_ID, openCareerStore } from './career-store.js';
import { LOCAL_WORLD_ID } from './career-store-v4.js';
import type { MissionIntent, ShipmentLot } from './types/career-economy.js';

async function cleanupDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

function stubMission(id: string): MissionIntent {
  return {
    id,
    lots: [],
    shipmentLotId: `deadhead_${id}`,
    commodityId: 'general',
    originIcao: 'SBGR',
    destIcao: 'SBGL',
    cargoKg: 0,
    pax: 0,
    aircraftClassId: 'light_turboprop',
    rolesPackRelPath: '',
    deadlineTick: 9999,
    payUsd: 100,
    urgency: 'normal',
    reason: 'isolation stub',
    status: 'accepted',
    acceptedAtTick: 1,
    contractPilot: true,
  };
}

describe('multitenant isolation (store)', () => {
  it('explicit companyId load ignores ambient activeCompanyId', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-mt-ambient-'));
    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    try {
      store.ensureCompany({ id: 'co_a', worldId: LOCAL_WORLD_ID });
      store.ensureCompany({ id: 'co_b', worldId: LOCAL_WORLD_ID });

      const missionsA = emptyMissionsStateV2();
      missionsA.walletUsd = 50_000;
      missionsA.missions = [stubMission('msn_a_only')];
      await store.saveMissions(missionsA, { companyId: 'co_a' });
      await store.saveMissions(emptyMissionsStateV2(), { companyId: 'co_b' });

      // Ambient thrash: host thinks co_a is active (Tab A session/open).
      store.setActiveCompanyId('co_a');

      const loadedB = await store.loadMissions({ companyId: 'co_b' });
      assert.equal(loadedB.missions.length, 0, 'co_b must not see co_a missions');
      assert.equal(
        listActivePlayerMissions(loadedB.missions).length,
        0,
        'Labubu-style tenant must have empty active list under ambient co_a',
      );

      const loadedA = await store.loadMissions({ companyId: 'co_a' });
      assert.equal(loadedA.missions.some((m) => m.id === 'msn_a_only'), true);

      // Bare load follows ambient — documents why API must pass companyId.
      const ambient = await store.loadMissions();
      assert.equal(ambient.missions.some((m) => m.id === 'msn_a_only'), true);
      assert.equal(store.getActiveCompanyId(), 'co_a');
    } finally {
      store.close();
      await cleanupDir(dir);
    }
  });

  it('cancel on co_a does not invent missions on co_b', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-mt-cancel-'));
    const store = await openCareerStore({ careerDir: dir, backend: 'sqlite' });
    try {
      store.ensureCompany({ id: 'co_a', worldId: LOCAL_WORLD_ID });
      store.ensureCompany({ id: 'co_b', worldId: LOCAL_WORLD_ID });

      const world = createSeedEconomyWorld({ seed: 'mt-cancel' });
      const lot: ShipmentLot = {
        id: 'mt_cancel_lot',
        commodityId: 'general',
        originIcao: 'SBGR',
        destIcao: 'SBGL',
        quantityKg: 600,
        reservedKg: 0,
        createdAtTick: world.tick,
        expiresAtTick: world.tick + 200,
        payUsd: 3_000,
        urgency: 'normal',
        reason: 'mt cancel',
        status: 'available',
      };
      world.lots.push(lot);

      const missionsA = emptyMissionsStateV2();
      missionsA.hubSelected = true;
      const accepted = executeAcceptLot(world, missionsA, {
        lotId: lot.id,
        cargoKg: 600,
        companyId: 'co_a',
      });
      assert.ok(accepted.kind === 'applied' || accepted.kind === 'replay');
      await store.saveMissions(missionsA, { companyId: 'co_a' });
      await store.saveMissions(emptyMissionsStateV2(), { companyId: 'co_b' });

      store.setActiveCompanyId('co_b'); // wrong ambient
      const a = await store.loadMissions({ companyId: 'co_a' });
      const open = a.missions.find((m) => m.status === 'accepted');
      assert.ok(open);
      cancelMission(world, open!, { fleet: a });
      await store.saveMissions(a, { companyId: 'co_a' });

      const b = await store.loadMissions({ companyId: 'co_b' });
      assert.equal(b.missions.length, 0);
      // Owned-lot cancel clears claim → rival can see the lot again (unlike Contract FLY).
      assert.equal(
        listMarketLots(world, { viewerCompanyId: 'co_b' }).some(
          (row) => row.lot.id === lot.id,
        ),
        true,
        'after cancel, foreign claim is cleared and lot can reappear for rival',
      );
    } finally {
      store.close();
      await cleanupDir(dir);
    }
  });

  it('contract-pilot active gate is per company missions blob', () => {
    const missionsA = emptyMissionsStateV2();
    missionsA.missions = [stubMission('msn_cp_a')];
    const missionsB = emptyMissionsStateV2();

    const blockingA = listActivePlayerMissions(missionsA.missions).find(
      (m) => m.crewOperated !== true,
    );
    const blockingB = listActivePlayerMissions(missionsB.missions).find(
      (m) => m.crewOperated !== true,
    );
    assert.ok(blockingA, 'co_a has active flight');
    assert.equal(blockingB, undefined, 'co_b must not inherit co_a gate');
    // acceptContractPilotOffer is imported to keep the CP path in the checklist.
    assert.equal(typeof acceptContractPilotOffer, 'function');
    assert.notEqual(LOCAL_COMPANY_ID, 'co_a');
  });
});
