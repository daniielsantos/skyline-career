import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyPilotCareerSettle,
  buildHangerSettleNote,
  classOpsLadderComplete,
  formatPilotPayDebriefLine,
  pilotHoursFromFlightDurationMs,
} from './career-pilot-career.js';
import { emptyMissionsStateV2 } from './career-fleet.js';
import { normalizeCareerClassOps } from './career-class-ops.js';

describe('career-pilot-career', () => {
  it('converts airborne ms to hours', () => {
    assert.equal(pilotHoursFromFlightDurationMs(3_600_000), 1);
    assert.equal(pilotHoursFromFlightDurationMs(1_800_000), 0.5);
    assert.equal(pilotHoursFromFlightDurationMs(0), 0);
  });

  it('accumulates pilot hours and hangar note on settle', () => {
    const missions = emptyMissionsStateV2();
    const mission = {
      id: 'msn_1',
      originIcao: 'SBGR',
      destIcao: 'SBCA',
      commodityId: 'general',
      status: 'settled',
    } as import('./types/career-economy.js').MissionIntent;
    const outcome = applyPilotCareerSettle(missions, {
      atTick: 100,
      mission,
      flightDurationMs: 3_600_000,
      cargoOpsDeltas: [
        {
          commodityId: 'general',
          deltaRep: 4,
          repBefore: 50,
          repAfter: 54,
          settlesOkAfter: 1,
          unlockedNow: false,
          clean: true,
        },
      ],
      onTime: true,
      flightScorePct: 80,
      leaseCleanAfter: 1,
      leaseCleanRequired: 8,
      pilotPayUsd: 1400,
    });
    assert.equal(missions.pilotFlightHours, 1);
    assert.equal(outcome.pilotHoursAfter, 1);
    assert.equal(outcome.dryClean, true);
    assert.match(outcome.hangarNote, /clean/i);
    assert.match(outcome.hangarNote, /Lease 1\/8/);
  });

  it('explains soft Dry settles', () => {
    const note = buildHangerSettleNote({
      originIcao: 'SBGR',
      destIcao: 'SBCA',
      mission: { missionType: undefined } as never,
      cargoOpsDeltas: [
        {
          commodityId: 'general',
          deltaRep: 1,
          repBefore: 50,
          repAfter: 51,
          settlesOkAfter: 0,
          unlockedNow: false,
          clean: false,
        },
      ],
      flightScorePct: 62,
      onTime: true,
    });
    assert.match(note, /no clean/i);
    assert.match(note, /62/);
  });

  it('formats pay lines and detects complete class ladder', () => {
    assert.match(
      formatPilotPayDebriefLine({
        pilotPayUsd: 500,
        companyPayoutUsd: 2000,
      }),
      /Member cut/,
    );
    assert.match(
      formatPilotPayDebriefLine({
        pilotPayUsd: null,
        companyPayoutUsd: 2000,
        isVaFlight: true,
      }),
      /stayed with the company/,
    );
    const ops = normalizeCareerClassOps(undefined);
    assert.equal(classOpsLadderComplete(ops), false);
    ops.classes.light_jet.unlocked = true;
    ops.classes.medium_piston.unlocked = true;
    ops.classes.narrow_freighter.unlocked = true;
    ops.classes.wide_freighter.unlocked = true;
    assert.equal(classOpsLadderComplete(ops), true);
  });
});
