import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
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
import { emptyMissionsStateV2 } from './career-fleet.js';
import {
  readCompanyStateScalars,
  upsertCompanyState,
} from './career-store-v3.js';

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

  it('persists class_ops_json through company_state (crew hours survive reload)', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE companies (
        id TEXT PRIMARY KEY NOT NULL,
        display_name TEXT NOT NULL DEFAULT '',
        home_hub_icao TEXT NOT NULL DEFAULT '',
        home_country_id TEXT NOT NULL DEFAULT '',
        created_at_ms INTEGER NOT NULL,
        world_id TEXT NOT NULL DEFAULT 'local'
      );
      CREATE TABLE company_state (
        company_id TEXT PRIMARY KEY NOT NULL,
        wallet_usd REAL NOT NULL DEFAULT 0,
        pilot_name TEXT NOT NULL DEFAULT '',
        pilot_icao TEXT NOT NULL DEFAULT '',
        hub_selected INTEGER NOT NULL DEFAULT 0,
        company_credit_json TEXT,
        cargo_ops_json TEXT,
        class_ops_json TEXT,
        aircraft_market_json TEXT,
        aircraft_market_day INTEGER,
        aircraft_market_demand_day INTEGER,
        airframe_perf_json TEXT,
        player_fbos_json TEXT,
        company_crew_json TEXT,
        ground_staff_json TEXT,
        active_bush_trip_json TEXT,
        port_pickups_json TEXT,
        player_warehouses_json TEXT,
        player_port_concessions_json TEXT,
        last_seen_tick INTEGER NOT NULL DEFAULT 0,
        updated_at_ms INTEGER NOT NULL
      );
    `);
    let ops = emptyCareerClassOps();
    ops = credit(ops, 'light_turboprop', 1.4);
    const state = {
      ...emptyMissionsStateV2(),
      pilotName: 'Test',
      homeHubIcao: 'RCSS',
      hubSelected: true,
      classOps: ops,
    };
    upsertCompanyState(db, state);
    const loaded = readCompanyStateScalars(db, 'local');
    assert.ok(loaded?.classOps);
    assert.equal(loaded.classOps!.classes.light_turboprop.hours, 1.4);
    assert.equal(loaded.classOps!.classes.light_turboprop.cleans, 1);
    const progress = classOpsUnlockProgress(
      loaded.classOps!,
      'light_jet',
    );
    assert.match(progress.summary, /1\.4\/20 h/);
    assert.match(progress.summary, /1\/6 cleans/);
    db.close();
  });
});
