import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyCargoOpsOnSettle,
  cargoOpsIsUnlocked,
  cargoOpsPayMult,
  computeCargoOpsRepDelta,
  emptyCareerCargoOps,
  normalizeCareerCargoOps,
  refreshCargoOpsUnlocks,
} from './career-cargo-ops.js';
import { CAREER_COMMODITIES, getCommodity } from './career-economy.js';

describe('supplies commodity', () => {
  it('is a freight cargo commodity', () => {
    const supplies = getCommodity('supplies');
    assert.equal(supplies.name, 'Supplies');
    assert.ok(CAREER_COMMODITIES.some((c) => c.id === 'supplies'));
    assert.notEqual(supplies.kind, 'fuel');
    assert.notEqual(supplies.kind, 'mro');
  });
});

describe('cargoOps', () => {
  it('starts with Dry unlocked', () => {
    const ops = emptyCareerCargoOps();
    assert.equal(ops.commodities.general.unlocked, true);
    assert.equal(ops.commodities.supplies.unlocked, true);
    assert.equal(ops.commodities.electronics.unlocked, false);
    assert.equal(cargoOpsIsUnlocked(ops, 'general'), true);
    assert.equal(cargoOpsIsUnlocked(ops, 'electronics'), false);
    assert.equal(cargoOpsIsUnlocked(undefined, 'electronics'), true);
  });

  it('scales pay by reputation', () => {
    const ops = emptyCareerCargoOps();
    ops.commodities.general.rep = 20;
    assert.equal(cargoOpsPayMult(ops, 'general'), 0.85);
    ops.commodities.general.rep = 90;
    assert.equal(cargoOpsPayMult(ops, 'general'), 1.15);
  });

  it('awards clean settle and unlocks Value after Dry progress', () => {
    let ops = emptyCareerCargoOps();
    for (let i = 0; i < 3; i++) {
      const applied = applyCargoOpsOnSettle(
        ops,
        { commodityId: 'general', lots: [], status: 'settled' },
        { onTime: true, lateTicks: 0, flightScore: { earned: 40, max: 51, pct: 85, categories: [] } },
      );
      ops = applied.cargoOps;
      assert.ok(applied.deltas[0]!.clean);
    }
    assert.ok(ops.commodities.general.settlesOk >= 3);
    assert.equal(ops.commodities.electronics.unlocked, true);
  });

  it('punishes late perishables harder in delta table', () => {
    const soft = computeCargoOpsRepDelta('general', {
      onTime: false,
      lateTicks: 1,
      flightScorePct: 80,
    });
    const hard = computeCargoOpsRepDelta('perishables', {
      onTime: false,
      lateTicks: 1,
      flightScorePct: 80,
    });
    assert.ok(hard.deltaRep < soft.deltaRep);
  });

  it('normalizes legacy missing cargoOps', () => {
    const ops = normalizeCareerCargoOps(undefined);
    assert.equal(ops.commodities.supplies.unlocked, true);
    refreshCargoOpsUnlocks(ops);
    assert.equal(ops.commodities.machinery.unlocked, false);
  });
});
