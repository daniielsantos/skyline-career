import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2, executeFerry, selectStarterHub } from './career-fleet.js';
import {
  completeNpcFerries,
  consumeVaLineCrewAllowance,
  fireVaLineCrew,
  finalizeStuckNpcFerries,
  hireVaLineCrew,
  upgradeVaLineCrew,
  quoteNpcFerryEtaTicks,
  settleVaLineCrewSalary,
  vaLineCrewAllowanceRemaining,
  buildVaLineCrewSnapshot,
  vaWeekKeyFromTick,
  VA_LINE_CREW_HIRE_USD,
  VA_LINE_CREW_SALARY_USD_PER_WEEK,
  resolveVaLineCrewTier,
} from './career-va-line-crew.js';
import { TICKS_PER_DAY } from './career-clock.js';

describe('VA Line crew ferry ops', () => {
  it('hires, grants allowance, and fires with severance', () => {
    const world = createSeedEconomyWorld({ seed: 'va-line-hire' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'VA',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 100_000;
    const before = state.walletUsd;
    const hired = hireVaLineCrew(state, world.tick);
    assert.equal(hired.debitUsd, VA_LINE_CREW_HIRE_USD);
    assert.equal(state.walletUsd, before - VA_LINE_CREW_HIRE_USD);
    assert.equal(state.vaLineCrew?.hired, true);
    assert.equal(state.vaLineCrew?.tier, 1);
    const allowance = vaLineCrewAllowanceRemaining(state, world.tick);
    assert.ok(allowance.remaining >= 4);
    assert.equal(allowance.allowance, 4); // 1 parked starter → floor 4
    assert.ok(consumeVaLineCrewAllowance(state, world.tick));
    assert.equal(
      vaLineCrewAllowanceRemaining(state, world.tick).used,
      1,
    );
    const fired = fireVaLineCrew(state, world.tick);
    assert.ok(fired.debitUsd > 0);
    assert.equal(state.vaLineCrew?.hired, false);
  });

  it('charges weekly salary across week boundaries', () => {
    const state = emptyMissionsStateV2();
    state.walletUsd = 50_000;
    hireVaLineCrew(state, 0);
    const from = 0;
    const to = TICKS_PER_DAY * 7;
    assert.equal(vaWeekKeyFromTick(from), 0);
    assert.equal(vaWeekKeyFromTick(to), 1);
    const pay = settleVaLineCrewSalary(state, { fromTick: from, toTick: to });
    assert.equal(pay.weeksCharged, 1);
    assert.equal(pay.requestedUsd, VA_LINE_CREW_SALARY_USD_PER_WEEK);
    assert.equal(pay.debitUsd, VA_LINE_CREW_SALARY_USD_PER_WEEK);
  });

  it('NPC allowance ferry arrives after ETA ticks', () => {
    const world = createSeedEconomyWorld({ seed: 'va-line-eta' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'VA',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    hireVaLineCrew(state, world.tick);
    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';
    const beforeWallet = state.walletUsd;
    assert.ok(consumeVaLineCrewAllowance(state, world.tick));
    const eta = quoteNpcFerryEtaTicks(300);
    const ferried = executeFerry(world, state, {
      aircraftId: aircraft.id,
      destIcao: 'SBSP',
      skipWalletDebit: true,
      npcArriveAtTick: world.tick + eta,
    });
    assert.equal(ferried.walletDebitUsd, 0);
    assert.equal(state.walletUsd, beforeWallet);
    assert.equal(ferried.aircraft.status, 'ferry');
    assert.equal(ferried.aircraft.locationIcao, 'SBGR');
    assert.ok(ferried.aircraft.npcFerry);
    completeNpcFerries(state, world.tick + eta - 1);
    assert.equal(aircraft.status, 'ferry');
    completeNpcFerries(state, world.tick + eta);
    assert.equal(aircraft.status, 'parked');
    assert.equal(aircraft.locationIcao, 'SBSP');
    assert.equal(aircraft.npcFerry, undefined);
  });

  it('finalizeStuckNpcFerries lands mid-ETA hops immediately', () => {
    const world = createSeedEconomyWorld({ seed: 'va-line-force' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'VA',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    hireVaLineCrew(state, world.tick);
    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';
    const eta = quoteNpcFerryEtaTicks(300);
    executeFerry(world, state, {
      aircraftId: aircraft.id,
      destIcao: 'SBSP',
      skipWalletDebit: true,
      npcArriveAtTick: world.tick + eta,
    });
    assert.equal(aircraft.status, 'ferry');
    finalizeStuckNpcFerries(state, world.tick);
    assert.equal(aircraft.status, 'parked');
    assert.equal(aircraft.locationIcao, 'SBSP');
    assert.equal(aircraft.npcFerry, undefined);
  });

  it('player allowance ferry without npcArriveAtTick is instant', () => {
    const world = createSeedEconomyWorld({ seed: 'va-line-instant' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'VA',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    hireVaLineCrew(state, world.tick);
    const aircraft = state.fleet.find((a) => a.status === 'parked')!;
    aircraft.locationIcao = 'SBGR';
    assert.ok(consumeVaLineCrewAllowance(state, world.tick));
    const ferried = executeFerry(world, state, {
      aircraftId: aircraft.id,
      destIcao: 'SBSP',
      skipWalletDebit: true,
    });
    assert.equal(ferried.walletDebitUsd, 0);
    assert.equal(ferried.aircraft.status, 'parked');
    assert.equal(ferried.aircraft.locationIcao, 'SBSP');
    assert.equal(ferried.aircraft.npcFerry, undefined);
  });

  it('Desk allowance floor 4 and scales 2× parked up to 16', () => {
    const world = createSeedEconomyWorld({ seed: 'va-line-allow' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'VA',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 100_000;
    hireVaLineCrew(state, world.tick);
    assert.equal(vaLineCrewAllowanceRemaining(state, world.tick).allowance, 4);

    const base = state.fleet[0]!;
    state.fleet.push({
      ...base,
      id: 'acf_second',
      registration: 'PP-TWO',
      status: 'parked',
    });
    assert.equal(vaLineCrewAllowanceRemaining(state, world.tick).allowance, 4);

    for (let i = 0; i < 3; i++) {
      state.fleet.push({
        ...base,
        id: `acf_extra_${i}`,
        registration: `PP-X${i}`,
        status: 'parked',
      });
    }
    // 5 parked → 10
    assert.equal(vaLineCrewAllowanceRemaining(state, world.tick).allowance, 10);

    for (let i = 0; i < 5; i++) {
      state.fleet.push({
        ...base,
        id: `acf_more_${i}`,
        registration: `PP-Y${i}`,
        status: 'parked',
      });
    }
    // 10 parked → cap 16
    assert.equal(vaLineCrewAllowanceRemaining(state, world.tick).allowance, 16);
  });

  it('upgrades Desk→Ops→Network, keeps used, fires at Ops severance', () => {
    const world = createSeedEconomyWorld({ seed: 'va-line-tiers' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'VA',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    hireVaLineCrew(state, world.tick);
    assert.ok(consumeVaLineCrewAllowance(state, world.tick));
    assert.equal(state.vaLineCrew?.usedThisWeek, 1);

    const beforeOps = state.walletUsd;
    const ops = upgradeVaLineCrew(state, world.tick);
    assert.equal(ops.debitUsd, resolveVaLineCrewTier(2).unlockUsd);
    assert.equal(state.walletUsd, beforeOps - ops.debitUsd);
    assert.equal(state.vaLineCrew?.tier, 2);
    assert.equal(state.vaLineCrew?.usedThisWeek, 1);
    const snapOps = buildVaLineCrewSnapshot(state, world.tick);
    assert.equal(snapOps.tierName, 'Ops');
    assert.equal(snapOps.upgradeUsd, resolveVaLineCrewTier(3).unlockUsd);
    assert.equal(snapOps.nextTierName, 'Network');
    assert.equal(
      snapOps.salaryUsdPerWeek,
      resolveVaLineCrewTier(2).salaryUsdPerWeek,
    );

    // 1 parked → Ops floor 8
    assert.equal(vaLineCrewAllowanceRemaining(state, world.tick).allowance, 8);

    const beforeNet = state.walletUsd;
    const net = upgradeVaLineCrew(state, world.tick);
    assert.equal(net.debitUsd, resolveVaLineCrewTier(3).unlockUsd);
    assert.equal(state.walletUsd, beforeNet - net.debitUsd);
    assert.equal(state.vaLineCrew?.tier, 3);
    assert.equal(buildVaLineCrewSnapshot(state, world.tick).upgradeUsd, null);
    assert.equal(vaLineCrewAllowanceRemaining(state, world.tick).allowance, 12);
    assert.throws(() => upgradeVaLineCrew(state, world.tick));

    // Fire from Network uses Network salary severance
    const beforeFire = state.walletUsd;
    fireVaLineCrew(state, world.tick);
    assert.equal(
      beforeFire - state.walletUsd,
      resolveVaLineCrewTier(3).salaryUsdPerWeek,
    );
    assert.equal(state.vaLineCrew?.hired, false);

    hireVaLineCrew(state, world.tick);
    upgradeVaLineCrew(state, world.tick); // Ops
    const beforeOpsFire = state.walletUsd;
    fireVaLineCrew(state, world.tick);
    assert.equal(
      beforeOpsFire - state.walletUsd,
      resolveVaLineCrewTier(2).salaryUsdPerWeek,
    );
  });

  it('Ops/Network allowance scales with parked mult and caps', () => {
    const world = createSeedEconomyWorld({ seed: 'va-line-tier-allow' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'VA',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    const base = state.fleet[0]!;
    for (let i = 0; i < 9; i++) {
      state.fleet.push({
        ...base,
        id: `acf_park_${i}`,
        registration: `PP-P${i}`,
        status: 'parked',
      });
    }
    // 10 parked
    hireVaLineCrew(state, world.tick);
    assert.equal(vaLineCrewAllowanceRemaining(state, world.tick).allowance, 16); // Desk cap
    upgradeVaLineCrew(state, world.tick);
    assert.equal(vaLineCrewAllowanceRemaining(state, world.tick).allowance, 24); // Ops: 10×3 cap 24
    upgradeVaLineCrew(state, world.tick);
    assert.equal(vaLineCrewAllowanceRemaining(state, world.tick).allowance, 32); // Network: 10×4 cap 32
  });

  it('salary uses current tier rate', () => {
    const state = emptyMissionsStateV2();
    state.walletUsd = 100_000;
    hireVaLineCrew(state, 0);
    upgradeVaLineCrew(state, 0);
    const pay = settleVaLineCrewSalary(state, {
      fromTick: 0,
      toTick: TICKS_PER_DAY * 7,
    });
    assert.equal(pay.weeksCharged, 1);
    assert.equal(pay.requestedUsd, resolveVaLineCrewTier(2).salaryUsdPerWeek);
  });

  it('legacy hired without tier normalizes to Desk', () => {
    const state = emptyMissionsStateV2();
    state.walletUsd = 10_000;
    state.vaLineCrew = {
      hired: true,
      hiredAtTick: 0,
      weekKey: 0,
      usedThisWeek: 2,
    } as typeof state.vaLineCrew;
    const snap = buildVaLineCrewSnapshot(state, 0);
    assert.equal(snap.hired, true);
    assert.equal(snap.tier, 1);
    assert.equal(snap.tierName, 'Desk');
    assert.equal(snap.used, 2);
  });
});
