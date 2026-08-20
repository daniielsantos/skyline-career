import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyCargoOpsOnSettle,
  cargoOpsIsUnlocked,
  cargoOpsPayMult,
  cargoOpsUnlockProgress,
  computeCargoOpsRepDelta,
  CARGO_OPS_VALUE_UNLOCK,
  dryReady,
  emptyCareerCargoOps,
  normalizeCareerCargoOps,
  refreshCargoOpsUnlocks,
  unlockAllCareerCargoOps,
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

  it('does not unlock Value after only 3 Dry cleans', () => {
    let ops = emptyCareerCargoOps();
    for (let i = 0; i < 3; i++) {
      const applied = applyCargoOpsOnSettle(
        ops,
        { commodityId: 'general', lots: [], status: 'settled' },
        {
          onTime: true,
          lateTicks: 0,
          flightScore: { earned: 40, max: 51, pct: 85, categories: [] },
        },
      );
      ops = applied.cargoOps;
      assert.ok(applied.deltas[0]!.clean);
    }
    assert.ok(ops.commodities.general.settlesOk >= 3);
    assert.equal(ops.commodities.electronics.unlocked, false);
    assert.equal(dryReady(ops), false);
  });

  it('unlocks Value after 6 Dry cleans, peak rep 70, and both Dry types', () => {
    let ops = emptyCareerCargoOps();
    // 5 general + 1 supplies → both types, 6 cleans; force peak rep.
    for (let i = 0; i < 5; i++) {
      const applied = applyCargoOpsOnSettle(
        ops,
        { commodityId: 'general', lots: [], status: 'settled' },
        {
          onTime: true,
          lateTicks: 0,
          flightScore: { earned: 40, max: 51, pct: 85, categories: [] },
        },
      );
      ops = applied.cargoOps;
    }
    const last = applyCargoOpsOnSettle(
      ops,
      { commodityId: 'supplies', lots: [], status: 'settled' },
      {
        onTime: true,
        lateTicks: 0,
        flightScore: { earned: 40, max: 51, pct: 85, categories: [] },
      },
    );
    ops = last.cargoOps;
    assert.equal(
      ops.commodities.general.settlesOk + ops.commodities.supplies.settlesOk,
      CARGO_OPS_VALUE_UNLOCK.dryCleansRequired,
    );
    assert.ok(
      Math.max(ops.commodities.general.rep, ops.commodities.supplies.rep) >=
        CARGO_OPS_VALUE_UNLOCK.peakRepRequired,
    );
    assert.equal(ops.commodities.electronics.unlocked, true);
    assert.ok(
      last.deltas.some((d) => d.commodityId === 'electronics' && d.unlockedNow),
    );
  });

  it('keeps sticky Value unlock even when below the new gate', () => {
    const ops = emptyCareerCargoOps();
    ops.commodities.general.settlesOk = 2;
    ops.commodities.general.rep = 63;
    ops.commodities.supplies.settlesOk = 1;
    ops.commodities.supplies.rep = 59;
    ops.commodities.electronics.unlocked = true;
    assert.equal(dryReady(ops), false);
    refreshCargoOpsUnlocks(ops);
    assert.equal(ops.commodities.electronics.unlocked, true);
    const normalized = normalizeCareerCargoOps(ops);
    assert.equal(normalized.commodities.electronics.unlocked, true);
  });

  it('reports unlock progress for locked Value', () => {
    const ops = emptyCareerCargoOps();
    ops.commodities.general.settlesOk = 2;
    ops.commodities.general.rep = 63;
    ops.commodities.supplies.settlesOk = 1;
    ops.commodities.supplies.rep = 59;
    const progress = cargoOpsUnlockProgress(ops, 'value');
    assert.equal(progress.unlocked, false);
    assert.equal(progress.ready, false);
    assert.match(progress.summary, /3\/6 Dry cleans/);
    assert.match(progress.summary, /need both Dry types|both Dry types/);
    assert.match(progress.summary, /peak rep 63\/70/);
  });

  it('unlockAllCareerCargoOps opens Value/Time/Heavy without wiping Dry progress', () => {
    const ops = emptyCareerCargoOps();
    ops.commodities.general.settlesOk = 3;
    const open = unlockAllCareerCargoOps(ops);
    assert.equal(open.commodities.electronics.unlocked, true);
    assert.equal(open.commodities.perishables.unlocked, true);
    assert.equal(open.commodities.machinery.unlocked, true);
    assert.equal(open.commodities.general.settlesOk, 3);
    assert.equal(ops.commodities.electronics.unlocked, false);
  });

  it('reports post-unlock Value progress', () => {
    const ops = emptyCareerCargoOps();
    ops.commodities.electronics.unlocked = true;
    ops.commodities.electronics.rep = 0;
    const progress = cargoOpsUnlockProgress(ops, 'value');
    assert.equal(progress.unlocked, true);
    assert.match(progress.summary, /build Electronics rep/);
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
