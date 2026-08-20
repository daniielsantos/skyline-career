import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyClassOpsOnSettle,
  assertClassOpsUnlocked,
  branchReady,
  CLASS_OPS_BRANCH_UNLOCK,
  CLASS_OPS_NARROW_UNLOCK,
  CLASS_OPS_WIDE_UNLOCK,
  classOpsIsUnlocked,
  classOpsHidesBoardLot,
  classOpsLotAboveBoard,
  classOpsUnlockProgress,
  emptyCareerClassOps,
  maxUnlockedCargoKg,
  narrowReady,
  narrowReadyViaJet,
  narrowReadyViaMedium,
  normalizeCareerClassOps,
  syncClassOpsFromFleet,
  unlockAllCareerClassOps,
  wideReady,
} from './career-class-ops.js';

const cleanScore = { earned: 40, max: 50, pct: 85, categories: [] as [] };

function credit(
  ops: ReturnType<typeof emptyCareerClassOps>,
  classId:
    | 'light_ga'
    | 'light_turboprop'
    | 'light_jet'
    | 'medium_piston'
    | 'narrow_freighter'
    | 'wide_freighter',
  hours: number,
  opts: { onTime?: boolean; clean?: boolean } = {},
) {
  const onTime = opts.onTime !== false;
  const flightScore =
    opts.clean === false
      ? { earned: 10, max: 50, pct: 40, categories: [] as [] }
      : cleanScore;
  return applyClassOpsOnSettle(
    ops,
    { aircraftClassId: classId, status: 'settled' },
    { onTime, blockHours: hours, flightScore },
  ).classOps;
}

describe('career-class-ops', () => {
  it('starts with Light GA and turboprop unlocked', () => {
    const ops = emptyCareerClassOps();
    assert.equal(ops.classes.light_ga.unlocked, true);
    assert.equal(ops.classes.light_turboprop.unlocked, true);
    assert.equal(ops.classes.light_jet.unlocked, false);
    assert.equal(ops.classes.medium_piston.unlocked, false);
    assert.equal(ops.classes.narrow_freighter.unlocked, false);
    assert.equal(ops.classes.wide_freighter.unlocked, false);
    assert.equal(classOpsIsUnlocked(undefined, 'wide_freighter'), true);
    assert.equal(classOpsIsUnlocked(ops, 'wide_freighter'), false);
    assert.equal(maxUnlockedCargoKg(ops), 1_704);
  });

  it('credits hours and cleans on settle; empty hours credit nothing', () => {
    let ops = emptyCareerClassOps();
    ops = applyClassOpsOnSettle(
      ops,
      { aircraftClassId: 'light_turboprop', status: 'settled' },
      { onTime: true, blockHours: 0, flightScore: cleanScore },
    ).classOps;
    assert.equal(ops.classes.light_turboprop.hours, 0);
    ops = credit(ops, 'light_turboprop', 2.5);
    assert.equal(ops.classes.light_turboprop.hours, 2.5);
    assert.equal(ops.classes.light_turboprop.cleans, 1);
  });

  it('does not count late / low-score as clean', () => {
    let ops = emptyCareerClassOps();
    ops = credit(ops, 'light_ga', 3, { clean: false });
    assert.equal(ops.classes.light_ga.hours, 3);
    assert.equal(ops.classes.light_ga.cleans, 0);
  });

  it('unlocks Jet and Medium in parallel after starter threshold', () => {
    let ops = emptyCareerClassOps();
    // 20h + 6 cleans on starters
    for (let i = 0; i < CLASS_OPS_BRANCH_UNLOCK.cleansRequired; i++) {
      ops = credit(
        ops,
        i % 2 === 0 ? 'light_ga' : 'light_turboprop',
        4,
      );
    }
    assert.equal(branchReady(ops), true);
    assert.equal(ops.classes.light_jet.unlocked, true);
    assert.equal(ops.classes.medium_piston.unlocked, true);
    assert.equal(ops.classes.narrow_freighter.unlocked, false);
  });

  it('unlocks Narrow via Jet without Medium hours', () => {
    let ops = emptyCareerClassOps();
    ops.classes.light_jet.unlocked = true;
    ops.classes.medium_piston.unlocked = true;
    for (let i = 0; i < CLASS_OPS_NARROW_UNLOCK.cleansRequired; i++) {
      ops = credit(
        ops,
        'light_jet',
        CLASS_OPS_NARROW_UNLOCK.hoursRequired /
          CLASS_OPS_NARROW_UNLOCK.cleansRequired,
      );
    }
    assert.equal(narrowReadyViaJet(ops), true);
    assert.equal(narrowReadyViaMedium(ops), false);
    assert.equal(narrowReady(ops), true);
    assert.equal(ops.classes.narrow_freighter.unlocked, true);
    assert.equal(ops.classes.wide_freighter.unlocked, false);
  });

  it('unlocks Narrow via Medium without Jet hours', () => {
    let ops = emptyCareerClassOps();
    ops.classes.light_jet.unlocked = true;
    ops.classes.medium_piston.unlocked = true;
    for (let i = 0; i < CLASS_OPS_NARROW_UNLOCK.cleansRequired; i++) {
      ops = credit(
        ops,
        'medium_piston',
        CLASS_OPS_NARROW_UNLOCK.hoursRequired /
          CLASS_OPS_NARROW_UNLOCK.cleansRequired,
      );
    }
    assert.equal(narrowReadyViaMedium(ops), true);
    assert.equal(narrowReadyViaJet(ops), false);
    assert.equal(ops.classes.narrow_freighter.unlocked, true);
  });

  it('unlocks Wide after Narrow threshold', () => {
    let ops = emptyCareerClassOps();
    ops.classes.narrow_freighter.unlocked = true;
    for (let i = 0; i < CLASS_OPS_WIDE_UNLOCK.cleansRequired; i++) {
      ops = credit(
        ops,
        'narrow_freighter',
        CLASS_OPS_WIDE_UNLOCK.hoursRequired / CLASS_OPS_WIDE_UNLOCK.cleansRequired,
      );
    }
    assert.equal(wideReady(ops), true);
    assert.equal(ops.classes.wide_freighter.unlocked, true);
    assert.equal(maxUnlockedCargoKg(ops), 90_000);
  });

  it('grandfathers Narrow from fleet without unlocking Wide or branches', () => {
    const ops = syncClassOpsFromFleet(emptyCareerClassOps(), [
      { aircraftClassId: 'narrow_freighter' },
    ]);
    assert.equal(ops.classes.narrow_freighter.unlocked, true);
    assert.equal(ops.classes.light_ga.unlocked, true);
    assert.equal(ops.classes.wide_freighter.unlocked, false);
    // Sibling branches stay locked unless earned/owned.
    assert.equal(ops.classes.light_jet.unlocked, false);
    assert.equal(ops.classes.medium_piston.unlocked, false);
  });

  it('grandfathers Wide from fleet unlocking everything', () => {
    const ops = syncClassOpsFromFleet(emptyCareerClassOps(), [
      { aircraftClassId: 'wide_freighter' },
    ]);
    assert.equal(ops.classes.wide_freighter.unlocked, true);
    assert.equal(ops.classes.narrow_freighter.unlocked, true);
    assert.equal(ops.classes.light_jet.unlocked, true);
    assert.equal(ops.classes.medium_piston.unlocked, true);
  });

  it('hides board lots above unlocked cargo ceiling', () => {
    const ops = emptyCareerClassOps();
    // Starter max 1704 × 1.25 = 2130
    assert.equal(classOpsLotAboveBoard(ops, 2_000), false);
    assert.equal(classOpsLotAboveBoard(ops, 5_000), true);
    assert.equal(classOpsLotAboveBoard(ops, 28_000), true);
  });

  it('hides class-locked crew holds even when availableKg is 0', () => {
    const ops = emptyCareerClassOps();
    assert.equal(
      classOpsHidesBoardLot(ops, {
        availableKg: 0,
        crewNeeded: true,
        claimCargoKg: 18_000,
        crewClassId: 'narrow_freighter',
      }),
      true,
    );
    assert.equal(
      classOpsHidesBoardLot(ops, {
        availableKg: 0,
        crewNeeded: true,
        claimCargoKg: 400,
        crewClassId: 'light_ga',
      }),
      false,
    );
    assert.equal(
      classOpsHidesBoardLot(ops, {
        availableKg: 0,
        crewNeeded: true,
        claimCargoKg: 5_000,
        crewClassId: 'light_turboprop',
      }),
      true,
    );
  });

  it('assertClassOpsUnlocked throws with progress summary', () => {
    const ops = emptyCareerClassOps();
    assert.throws(
      () => assertClassOpsUnlocked(ops, 'wide_freighter'),
      /Class locked: Wide/,
    );
  });

  it('reports unlock progress for locked Jet', () => {
    const ops = emptyCareerClassOps();
    ops.classes.light_ga.hours = 5;
    ops.classes.light_ga.cleans = 2;
    const progress = classOpsUnlockProgress(ops, 'light_jet');
    assert.equal(progress.unlocked, false);
    assert.match(progress.summary, /5\/20 h/);
    assert.match(progress.summary, /2\/6 cleans/);
  });

  it('normalize sticky unlocks from saved hours', () => {
    const ops = normalizeCareerClassOps({
      classes: {
        light_ga: { unlocked: true, hours: 12, cleans: 3 },
        light_turboprop: { unlocked: true, hours: 10, cleans: 3 },
        light_jet: { unlocked: false, hours: 0, cleans: 0 },
        medium_piston: { unlocked: false, hours: 0, cleans: 0 },
        narrow_freighter: { unlocked: false, hours: 0, cleans: 0 },
        wide_freighter: { unlocked: false, hours: 0, cleans: 0 },
      },
    });
    assert.equal(ops.classes.light_jet.unlocked, true);
    assert.equal(ops.classes.medium_piston.unlocked, true);
  });

  it('unlockAllCareerClassOps opens Jet through Wide without wiping hours', () => {
    const ops = emptyCareerClassOps();
    ops.classes.light_ga.hours = 4;
    const open = unlockAllCareerClassOps(ops);
    assert.equal(open.classes.light_jet.unlocked, true);
    assert.equal(open.classes.medium_piston.unlocked, true);
    assert.equal(open.classes.narrow_freighter.unlocked, true);
    assert.equal(open.classes.wide_freighter.unlocked, true);
    assert.equal(open.classes.light_ga.hours, 4);
    assert.equal(ops.classes.light_jet.unlocked, false);
  });
});
