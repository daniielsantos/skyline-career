import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2, executeFerry, selectStarterHub } from './career-fleet.js';
import {
  completeNpcFerries,
  consumeVaLineCrewAllowance,
  fireVaLineCrew,
  hireVaLineCrew,
  quoteNpcFerryEtaTicks,
  settleVaLineCrewSalary,
  vaLineCrewAllowanceRemaining,
  vaWeekKeyFromTick,
  VA_LINE_CREW_HIRE_USD,
  VA_LINE_CREW_SALARY_USD_PER_WEEK,
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

  it('allowance floor 4 and scales 2× parked up to 16', () => {
    const world = createSeedEconomyWorld({ seed: 'va-line-allow' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
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
});
