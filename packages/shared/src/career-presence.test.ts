import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createSeedEconomyWorld,
  emptyMissionsStateV2,
  ensureWorldAircraftPool,
  LOCAL_COMPANY_ID,
  listPresenceEvents,
  markDealerInstanceSold,
  pushPresenceEvent,
  syncWorldPortConcessions,
} from './index.js';

describe('MP presence + contested scarcity helpers', () => {
  it('syncWorldPortConcessions merges other companies instead of wiping', () => {
    const world = createSeedEconomyWorld({ seed: 'presence-merge' });
    world.tick = 100;
    world.portConcessions = [
      {
        portId: 'BRSSZ',
        companyId: 'co_rival',
        leasePaidThroughTick: 500,
        level: 1,
      },
    ];
    const state = emptyMissionsStateV2();
    state.hubSelected = true;
    state.homeHubIcao = 'SBSP';
    state.walletUsd = 500_000;
    state.playerPortConcessions = [
      {
        portId: 'BRMAO',
        companyId: LOCAL_COMPANY_ID,
        level: 1,
        claimedAtTick: 90,
        leasePaidThroughTick: 400,
        lifetimeThroughputKg: 0,
      },
    ];
    syncWorldPortConcessions(world, state, { companyId: LOCAL_COMPANY_ID });
    assert.ok(
      world.portConcessions?.some((c) => c.companyId === 'co_rival'),
      'rival Port FBO must survive sync',
    );
    assert.ok(
      world.portConcessions?.some((c) => c.companyId === LOCAL_COMPANY_ID),
      'local Port FBO must be indexed',
    );
  });

  it('presence log keeps a short newest-first ring', () => {
    const world = createSeedEconomyWorld({ seed: 'presence-log' });
    for (let i = 0; i < 35; i++) {
      pushPresenceEvent(world, {
        kind: 'lot_accept',
        atTick: i,
        atMs: 1_000 + i,
        companyId: 'co_a',
        companyDisplayName: 'Alpha',
        summary: `SBSP→SBGR #${i}`,
      });
    }
    const recent = listPresenceEvents(world, 20);
    assert.equal(recent.length, 20);
    assert.equal(recent[0]?.summary, 'SBSP→SBGR #34');
    assert.ok((world.presenceLog?.length ?? 0) <= 30);
  });

  it('markDealerInstanceSold stamps ownerCompanyId and rejects double claim', () => {
    const world = createSeedEconomyWorld({ seed: 'presence-pool' });
    ensureWorldAircraftPool(world);
    const inst = world.aircraftInstances?.find((a) => a.status === 'available');
    assert.ok(inst, 'expected dealer pool after ensure');
    assert.equal(
      markDealerInstanceSold(world, inst!.id, { companyId: 'co_a' }),
      true,
    );
    assert.equal(inst!.status, 'sold');
    assert.equal(inst!.ownerCompanyId, 'co_a');
    assert.equal(
      markDealerInstanceSold(world, inst!.id, { companyId: 'co_b' }),
      false,
    );
  });
});
