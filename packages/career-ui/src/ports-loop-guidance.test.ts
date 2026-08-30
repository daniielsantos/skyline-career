import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  derivePortsLoopStep,
  portsLoopTargetSection,
} from './ports-loop-guidance.ts';

describe('derivePortsLoopStep', () => {
  it('prefers wait_inbound over buy_port when stock is empty but transfers exist', () => {
    const step = derivePortsLoopStep({
      warehouseCount: 1,
      stock: [],
      pickups: [],
      demand: [],
      inboundTransfers: [
        { hubIcao: 'sbgr', kg: 12_000, readyAtTick: 110 },
        { hubIcao: 'SBRJ', kg: 3_000, readyAtTick: 105 },
      ],
      economyTick: 100,
    });
    assert.deepEqual(step, {
      kind: 'wait_inbound',
      kg: 15_000,
      hubIcao: 'SBRJ',
      ticksLeft: 5,
    });
    assert.equal(portsLoopTargetSection(step), 'warehouse');
  });

  it('uses buy_port when empty stock and no inbound', () => {
    const step = derivePortsLoopStep({
      warehouseCount: 1,
      stock: [{ commodityId: 'steel', kg: 0 }],
      pickups: [],
      demand: [{ commodityId: 'steel', remainingKg: 5_000 }],
    });
    assert.equal(step.kind, 'buy_port');
    assert.equal(portsLoopTargetSection(step), 'catalog');
  });

  it('fulfill_demand when stock commodities match open orders', () => {
    const step = derivePortsLoopStep({
      warehouseCount: 1,
      stock: [{ commodityId: 'Steel', kg: 2_000 }],
      pickups: [],
      demand: [
        { commodityId: 'steel', remainingKg: 1_000 },
        { commodityId: 'fruit', remainingKg: 500 },
      ],
    });
    assert.deepEqual(step, { kind: 'fulfill_demand', matchCount: 1 });
    assert.equal(portsLoopTargetSection(step), 'demand');
  });

  it('wait_demand reports openDemandCount when stock has no match', () => {
    const step = derivePortsLoopStep({
      warehouseCount: 1,
      stock: [{ commodityId: 'electronics', kg: 800 }],
      pickups: [],
      demand: [
        { commodityId: 'steel', remainingKg: 1_000 },
        { commodityId: 'fruit', remainingKg: 0 },
      ],
    });
    assert.deepEqual(step, {
      kind: 'wait_demand',
      stockKg: 800,
      openDemandCount: 1,
    });
  });

  it('store_yard beats inbound while yard still holds cargo', () => {
    const step = derivePortsLoopStep({
      warehouseCount: 1,
      stock: [],
      pickups: [
        {
          id: 'p1',
          hubIcao: 'SBSN',
          commodityId: 'ore',
          kg: 4_000,
          holdUsdPerDay: 120,
        },
      ],
      demand: [],
      inboundTransfers: [{ hubIcao: 'SBSN', kg: 9_000, readyAtTick: 200 }],
      economyTick: 100,
    });
    assert.equal(step.kind, 'store_yard');
    if (step.kind === 'store_yard') {
      assert.equal(step.hubIcao, 'SBSN');
      assert.equal(step.kg, 4_000);
    }
  });
});
