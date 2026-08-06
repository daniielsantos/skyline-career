/**
 * Company crew dispatch, hire pool, salary, wall-clock settle.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CREW_FEE_FRAC,
  CREW_RETURN_FEE_FRAC,
  companyCrewSnapshot,
  dispatchCrewMission,
  ensureCompanyCrew,
  hireCrewCandidate,
  quoteCrewDispatchFeeUsd,
  quoteCrewReturnFeeUsd,
  quoteCrewRoundTripFeesUsd,
  refreshCrewHirePool,
  resolveCrewPortraitId,
  settleCrewDailyOps,
  settleCrewOpsDue,
  assignCrewMemberToMission,
} from './career-crew.js';
import {
  buyFboTier1,
  holdLotAtFbo,
  releaseFboHoldToMission,
  upgradeFboToTier2,
} from './career-fbo.js';
import { normalizeCareerCargoOps } from './career-cargo-ops.js';
import {
  createSeedEconomyWorld,
  ensureSeedMarketFormed,
  tickEconomyN,
  TICKS_PER_DAY,
} from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';

describe('company crew', () => {
  function setupWithFbo() {
    const world = createSeedEconomyWorld({ seed: 'crew-ops' });
    ensureSeedMarketFormed(world);
    tickEconomyN(world, 48);
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'CrewBoss',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    buyFboTier1(state, world, 'SBGR');
    return { world, state };
  }

  function setupWithHoldAndHire() {
    const { world, state } = setupWithFbo();
    refreshCrewHirePool(state, world, { force: true });
    const cand = state.companyCrew!.hirePool![0]!;
    hireCrewCandidate(state, world, cand.id);

    const lot = world.lots.find(
      (l) =>
        l.originIcao === 'SBGR' &&
        (l.status === 'available' || l.status === 'reserved') &&
        (l.commodityId === 'general' || l.commodityId === 'supplies') &&
        l.quantityKg - l.reservedKg >= 100,
    );
    assert.ok(lot, 'expected outbound lot from SBGR');
    const cargoKg = Math.min(400, lot!.quantityKg - lot!.reservedKg);
    holdLotAtFbo(state, world, { lotId: lot!.id, cargoKg });
    const holdId = state.playerFbos!.holds[0]!.id;
    const { mission } = releaseFboHoldToMission(state, world, {
      holdId,
      aircraftClassId: state.fleet[0]!.aircraftClassId,
      maxCargoKg: 450,
    });
    const acf = state.fleet[0]!;
    acf.status = 'parked';
    acf.assignedMissionId = undefined;
    acf.locationIcao = 'SBGR';
    return { world, state, mission, aircraft: acf };
  }

  it('quotes fee as fraction of pay (min $50)', () => {
    assert.equal(quoteCrewDispatchFeeUsd({ payUsd: 10_000 }), money(10_000 * CREW_FEE_FRAC));
    assert.equal(quoteCrewDispatchFeeUsd({ payUsd: 100 }), 50);
    assert.equal(
      quoteCrewReturnFeeUsd({ payUsd: 10_000, crewFeeUsd: 1_200 }),
      money(1_200 * CREW_RETURN_FEE_FRAC),
    );
    const rt = quoteCrewRoundTripFeesUsd({ payUsd: 10_000 });
    assert.equal(rt.outboundFeeUsd, money(10_000 * CREW_FEE_FRAC));
    assert.equal(rt.returnFeeUsd, money(rt.outboundFeeUsd * CREW_RETURN_FEE_FRAC));
    assert.equal(rt.totalFeeUsd, money(rt.outboundFeeUsd + rt.returnFeeUsd));
  });

  it('maps crew names to gendered portrait ids', () => {
    assert.match(resolveCrewPortraitId('Iris Keller', { salt: 'a' }), /^woman_[1-5]$/);
    assert.match(resolveCrewPortraitId('Joao Hayes', { salt: 'b' }), /^man_[1-5]$/);
    assert.equal(
      resolveCrewPortraitId('Iris Keller', { portraitId: 'woman_3' }),
      'woman_3',
    );
  });

  it('rejects crew without FBO', () => {
    const world = createSeedEconomyWorld({ seed: 'crew-nofbo' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'NoFbo',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.missions.push({
      id: 'msn_x',
      lots: [
        {
          shipmentLotId: 'lot_x',
          commodityId: 'general',
          cargoKg: 100,
          payUsd: 1000,
          urgency: 'normal',
          reason: 'test',
          deadlineTick: world.tick + 48,
        },
      ],
      shipmentLotId: 'lot_x',
      commodityId: 'general',
      originIcao: 'SBGR',
      destIcao: 'SBSP',
      cargoKg: 100,
      pax: 0,
      aircraftClassId: state.fleet[0]!.aircraftClassId,
      rolesPackRelPath: 'x',
      deadlineTick: world.tick + 48,
      payUsd: 1000,
      urgency: 'normal',
      reason: 'test',
      status: 'accepted',
      acceptedAtTick: world.tick,
    });
    assert.throws(
      () =>
        dispatchCrewMission(state, world, {
          missionId: 'msn_x',
          aircraftId: state.fleet[0]!.id,
        }),
      /FBO/i,
    );
  });

  it('opens a hire pool on FBO buy and requires hire before dispatch', () => {
    const { world, state } = setupWithFbo();
    const snap = companyCrewSnapshot(state, world);
    assert.equal(snap.slotsUnlocked, 1);
    assert.equal(snap.members.length, 0);
    assert.ok(snap.hirePool.length >= 3);
    assert.equal(new Set(snap.hirePool.map((c) => c.perkId)).size, 4);

    assert.throws(
      () =>
        dispatchCrewMission(state, world, {
          missionId: 'missing',
          aircraftId: state.fleet[0]!.id,
        }),
      /Unknown mission|hire/i,
    );
  });

  it('hires from pool, dispatches without pilot at origin, settles on ETA', () => {
    const { world, state, mission, aircraft } = setupWithHoldAndHire();
    state.pilotIcao = 'SBPA';
    const snap = companyCrewSnapshot(state, world);
    assert.equal(snap.members.length, 1);
    assert.equal(snap.slotsInUse, 1);
    assert.equal(snap.slotsFree, 1);
    assert.equal(snap.members[0]!.baseIcao, 'SBGR');
    assert.equal(snap.members[0]!.status, 'idle');
    assert.ok(snap.members[0]!.perkId);
    assert.ok((snap.members[0]!.salaryUsdPerDay ?? 0) > 0);

    const nowMs = 1_000_000;
    const result = dispatchCrewMission(state, world, {
      missionId: mission.id,
      aircraftId: aircraft.id,
      nowMs,
    });
    assert.equal(result.mission.status, 'in_flight');
    assert.equal(result.mission.crewOperated, true);
    assert.equal(result.mission.crewRoundTrip, true);
    assert.equal(result.mission.crewReturnIcao, 'SBGR');
    assert.equal(result.crewMember.status, 'airborne');
    assert.equal(result.crewMember.missionId, mission.id);
    assert.ok(result.crewFeeUsd > 0);
    assert.ok(result.returnFeeUsd > 0);
    assert.equal(
      result.totalRoundTripFeeUsd,
      money(result.crewFeeUsd + result.returnFeeUsd),
    );
    assert.ok((state.ledger ?? []).some((e) => e.kind === 'crew_fee'));
    assert.equal(aircraft.status, 'assigned');
    assert.equal(companyCrewSnapshot(state, world).slotsFree, 0);
    assert.equal(companyCrewSnapshot(state, world).slotsInUse, 1);

    const early = settleCrewOpsDue(state, world, nowMs + 60_000);
    assert.equal(early.settled.length, 0);

    const eta =
      (result.mission.airborneAtMs ?? nowMs) +
      (result.mission.expectedRouteMs ?? 0);
    const outboundDone = settleCrewOpsDue(state, world, eta);
    assert.equal(outboundDone.settled.length, 1);
    assert.equal(outboundDone.settled[0], mission.id);
    assert.equal(outboundDone.returnsStarted.length, 1);
    assert.equal(outboundDone.returnsStarted[0]!.returnIcao, 'SBGR');
    const settled = state.missions.find((m) => m.id === mission.id)!;
    assert.equal(settled.status, 'settled');
    assert.ok(outboundDone.payoutUsd > 0);
    const returnMission = state.missions.find(
      (m) => m.id === outboundDone.returnsStarted[0]!.returnMissionId,
    )!;
    assert.equal(returnMission.status, 'in_flight');
    assert.equal(returnMission.crewDeadhead, true);
    assert.equal(returnMission.originIcao, mission.destIcao);
    assert.equal(returnMission.destIcao, 'SBGR');
    assert.equal(aircraft.status, 'assigned');
    assert.equal(aircraft.locationIcao, mission.destIcao);
    const mid = companyCrewSnapshot(state, world).members[0]!;
    assert.equal(mid.status, 'airborne');
    assert.equal(mid.missionId, returnMission.id);
    const feeEntries = (state.ledger ?? []).filter((e) => e.kind === 'crew_fee');
    assert.ok(feeEntries.length >= 2);

    const returnEta =
      (returnMission.airborneAtMs ?? eta) +
      (returnMission.expectedRouteMs ?? 0);
    const returnDone = settleCrewOpsDue(state, world, returnEta);
    assert.ok(returnDone.settled.includes(returnMission.id));
    assert.equal(aircraft.status, 'parked');
    assert.equal(aircraft.locationIcao, 'SBGR');
    const after = companyCrewSnapshot(state, world).members[0]!;
    assert.equal(after.status, 'idle');
    assert.equal(after.locationIcao, 'SBGR');
    // Pilot hub position must not ride along with company crew.
    assert.equal(state.pilotIcao, 'SBPA');
  });

  it('allows crew dispatch while sister Accepted missions remain', () => {
    const { world, state, mission, aircraft } = setupWithHoldAndHire();
    const sister = {
      ...mission,
      id: 'msn_sister',
      acceptedAtTick: world.tick,
      status: 'accepted' as const,
    };
    state.missions = [...state.missions, sister];
    const result = dispatchCrewMission(state, world, {
      missionId: mission.id,
      aircraftId: aircraft.id,
      nowMs: 2_000_000,
    });
    assert.equal(result.mission.status, 'in_flight');
    assert.equal(result.mission.crewOperated, true);
    assert.equal(
      state.missions.find((m) => m.id === 'msn_sister')?.status,
      'accepted',
    );
  });

  it('blocks crew dispatch while player Watch is in flight', () => {
    const { world, state, mission, aircraft } = setupWithHoldAndHire();
    state.missions.push({
      ...mission,
      id: 'msn_watch',
      status: 'in_flight',
      crewOperated: false,
      acceptedAtTick: world.tick,
      departedAtTick: world.tick,
    });
    assert.throws(
      () =>
        dispatchCrewMission(state, world, {
          missionId: mission.id,
          aircraftId: aircraft.id,
        }),
      /Watch flight/i,
    );
  });

  it('keeps hired roster when slots are temporarily zero', () => {
    const { world, state } = setupWithFbo();
    refreshCrewHirePool(state, world, { force: true });
    hireCrewCandidate(state, world, state.companyCrew!.hirePool![0]!.id);
    assert.equal(state.companyCrew!.members.length, 1);
    state.playerFbos = { fbos: [], holds: [] };
    ensureCompanyCrew(state, { tick: world.tick });
    assert.equal(state.companyCrew!.members.length, 1);
  });

  it('does not truncate roster below FBO slot count', () => {
    const { world, state } = setupWithFbo();
    const fbo = state.playerFbos!.fbos[0]!;
    upgradeFboToTier2(state, world, fbo.id);
    refreshCrewHirePool(state, world, { force: true });
    hireCrewCandidate(state, world, state.companyCrew!.hirePool![0]!.id);
    refreshCrewHirePool(state, world, { force: true });
    hireCrewCandidate(state, world, state.companyCrew!.hirePool![0]!.id);
    assert.equal(state.companyCrew!.members.length, 2);
    // Simulate older buggy truncate path would have dropped #2 when slots=1;
    // ensure must keep both even if we only check capacity on hire.
    state.playerFbos!.fbos[0]!.tier = 1;
    ensureCompanyCrew(state, { tick: world.tick });
    assert.equal(state.companyCrew!.members.length, 2);
  });

  it('persists preferred crew on an accepted mission before dispatch', () => {
    const { world, state, mission } = setupWithHoldAndHire();
    const member = state.companyCrew!.members[0]!;
    const assigned = assignCrewMemberToMission(state, {
      missionId: mission.id,
      crewMemberId: member.id,
    });
    assert.equal(assigned.crewMemberId, member.id);
    assert.equal(
      state.missions.find((m) => m.id === mission.id)?.crewMemberId,
      member.id,
    );
    assert.equal(member.status, 'idle');
    assert.equal(
      state.missions.find((m) => m.id === mission.id)?.status,
      'accepted',
    );
    // Silence unused when setup returns world-only helpers
    assert.ok(world.tick >= 0);
  });

  it('dispatches a chosen idle crew member onto the assigned airframe', () => {
    const { world, state } = setupWithFbo();
    const fbo = state.playerFbos!.fbos[0]!;
    upgradeFboToTier2(state, world, fbo.id);
    refreshCrewHirePool(state, world, { force: true });
    hireCrewCandidate(state, world, state.companyCrew!.hirePool![0]!.id);
    refreshCrewHirePool(state, world, { force: true });
    hireCrewCandidate(state, world, state.companyCrew!.hirePool![0]!.id);
    const [first, second] = state.companyCrew!.members;
    assert.ok(first && second);

    const lot = world.lots.find(
      (l) =>
        l.originIcao === 'SBGR' &&
        (l.status === 'available' || l.status === 'reserved') &&
        (l.commodityId === 'general' || l.commodityId === 'supplies') &&
        l.quantityKg - l.reservedKg >= 100,
    );
    assert.ok(lot);
    holdLotAtFbo(state, world, {
      lotId: lot!.id,
      cargoKg: Math.min(200, lot!.quantityKg - lot!.reservedKg),
    });
    const { mission } = releaseFboHoldToMission(state, world, {
      holdId: state.playerFbos!.holds[0]!.id,
      aircraftClassId: state.fleet[0]!.aircraftClassId,
      maxCargoKg: 450,
    });
    const acf = state.fleet[0]!;
    acf.status = 'parked';
    acf.assignedMissionId = undefined;
    acf.locationIcao = 'SBGR';

    const result = dispatchCrewMission(state, world, {
      missionId: mission.id,
      aircraftId: acf.id,
      crewMemberId: second!.id,
      nowMs: 3_000_000,
    });
    assert.equal(result.crewMember.id, second!.id);
    assert.equal(result.mission.crewMemberId, second!.id);
    const after = state.companyCrew!.members;
    assert.equal(after.find((m) => m.id === first!.id)?.status, 'idle');
    assert.equal(after.find((m) => m.id === second!.id)?.status, 'airborne');
  });

  it('rejects crew dispatch for an airborne member id', () => {
    const { world, state, mission, aircraft } = setupWithHoldAndHire();
    const only = state.companyCrew!.members[0]!;
    dispatchCrewMission(state, world, {
      missionId: mission.id,
      aircraftId: aircraft.id,
      nowMs: 4_000_000,
    });
    // Need a second accepted mission + second crew to attempt pick of airborne
    const fbo = state.playerFbos!.fbos[0]!;
    upgradeFboToTier2(state, world, fbo.id);
    refreshCrewHirePool(state, world, { force: true });
    hireCrewCandidate(state, world, state.companyCrew!.hirePool![0]!.id);
    const idle = state.companyCrew!.members.find((m) => m.status === 'idle');
    assert.ok(idle);
    state.missions.push({
      ...mission,
      id: 'msn_second',
      status: 'accepted',
      aircraftId: undefined,
      acceptedAtTick: world.tick,
    });
    const acf2 = {
      ...aircraft,
      id: `${aircraft.id}_b`,
      assignedMissionId: undefined,
      status: 'parked' as const,
      locationIcao: 'SBGR',
    };
    state.fleet.push(acf2);
    assert.throws(
      () =>
        dispatchCrewMission(state, world, {
          missionId: 'msn_second',
          aircraftId: acf2.id,
          crewMemberId: only.id,
        }),
      /airborne/i,
    );
  });

  it('charges daily crew salary across economy days', () => {
    const { world, state } = setupWithFbo();
    refreshCrewHirePool(state, world, { force: true });
    hireCrewCandidate(state, world, state.companyCrew!.hirePool![0]!.id);
    const fromTick = world.tick;
    tickEconomyN(world, TICKS_PER_DAY);
    const salary = settleCrewDailyOps(state, world, {
      fromTick,
      toTick: world.tick,
    }).salary;
    assert.equal(salary.daysCharged, 1);
    assert.ok(salary.requestedUsd > 0);
    assert.ok(salary.debitUsd > 0);
    assert.ok((state.ledger ?? []).some((e) => e.kind === 'crew_salary'));
  });

  it('scales roster slots with FBO tiers up to 3', () => {
    const { world, state } = setupWithFbo();
    assert.equal(companyCrewSnapshot(state, world).slotsUnlocked, 1);

    const fbo = state.playerFbos!.fbos[0]!;
    upgradeFboToTier2(state, world, fbo.id);
    assert.equal(companyCrewSnapshot(state, world).slotsUnlocked, 2);

    state.fleet.push({
      ...state.fleet[0]!,
      id: 'acf_2',
      ownership: 'owned',
      status: 'parked',
      locationIcao: 'SBPA',
    });
    state.cargoOps = normalizeCareerCargoOps(state.cargoOps);
    state.cargoOps.commodities.electronics.unlocked = true;
    buyFboTier1(state, world, 'SBPA');
    // T2(2) + T1(1) = 3 capped
    assert.equal(companyCrewSnapshot(state, world).slotsUnlocked, 3);
    assert.equal(companyCrewSnapshot(state, world).slotsMax, 3);
  });
});

function money(n: number): number {
  return Math.round(n * 100) / 100;
}
