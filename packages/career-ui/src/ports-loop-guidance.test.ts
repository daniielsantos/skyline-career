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
    assert.equal(portsLoopTargetSection(step), 'network');
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
    assert.equal(portsLoopTargetSection(step), 'network');
  });

  it('fulfill_demand counts only the focused port desk', () => {
    const step = derivePortsLoopStep({
      warehouseCount: 1,
      stock: [{ commodityId: 'electronics', kg: 2_000 }],
      pickups: [],
      focusPortId: 'BR-SANTOS',
      demand: [
        {
          commodityId: 'electronics',
          remainingKg: 1_000,
          portId: 'BR-SANTOS',
        },
        {
          commodityId: 'electronics',
          remainingKg: 1_000,
          portId: 'BR-SANTOS',
        },
        {
          commodityId: 'electronics',
          remainingKg: 5_000,
          portId: 'US-LA',
        },
        {
          commodityId: 'electronics',
          remainingKg: 5_000,
          // missing portId — ignored when focusing a desk
        },
      ],
    });
    assert.deepEqual(step, { kind: 'fulfill_demand', matchCount: 2 });
  });

  it('wait_demand when focus port desk has no commodity match', () => {
    const step = derivePortsLoopStep({
      warehouseCount: 1,
      stock: [{ commodityId: 'electronics', kg: 800 }],
      pickups: [],
      focusPortId: 'BR-SANTOS',
      demand: [
        {
          commodityId: 'electronics',
          remainingKg: 1_000,
          portId: 'US-LA',
        },
        {
          commodityId: 'supplies',
          remainingKg: 500,
          portId: 'BR-SANTOS',
        },
      ],
    });
    assert.deepEqual(step, {
      kind: 'wait_demand',
      stockKg: 800,
      openDemandCount: 1,
    });
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

  it('fulfill_demand ignores stock reserved by desk holds', () => {
    const step = derivePortsLoopStep({
      warehouseCount: 1,
      stock: [
        { commodityId: 'steel', kg: 2_000, warehouseId: 'wh1' },
      ],
      pickups: [],
      demand: [{ commodityId: 'steel', remainingKg: 1_000, portId: 'BR-SANTOS' }],
      focusPortId: 'BR-SANTOS',
      demandHolds: [
        { commodityId: 'steel', kg: 2_000, warehouseId: 'wh1' },
      ],
    });
    assert.equal(step.kind, 'buy_port');
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
