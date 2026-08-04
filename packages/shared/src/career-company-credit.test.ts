import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COMPANY_CREDIT_DAILY_RATE,
  COMPANY_CREDIT_LIMIT_BASE,
  COMPANY_CREDIT_LIMIT_REP_SPAN,
  assertCompanyCreditAllowsOps,
  companyCreditCollateralUsd,
  companyCreditLimitUsd,
  companyCreditRepScore,
  companyCreditSnapshot,
  drawCompanyCredit,
  repayCompanyCredit,
  settleCompanyCredit,
} from './career-company-credit.js';
import { emptyMissionsStateV2, PLAYER_FUEL_CAPACITY_KG } from './career-fleet.js';
import { sellBackValueUsd } from './career-aircraft-market.js';
import { TICKS_PER_DAY } from './career-clock.js';
import { normalizeCareerLedger } from './career-ledger.js';
import type { PlayerAircraft } from './types/career-economy.js';

function makeOwnedGa(id = 'acf_1'): PlayerAircraft {
  const capacity = PLAYER_FUEL_CAPACITY_KG.light_ga;
  return {
    id,
    aircraftClassId: 'light_ga',
    label: 'BE36',
    locationIcao: 'SBGR',
    fuelKg: capacity * 0.5,
    fuelCapacityKg: capacity,
    status: 'parked',
    ownership: 'owned',
    condition: 'good',
  };
}

describe('company credit', () => {
  it('limits credit from sell-back collateral and Cargo Ops rep', () => {
    const state = emptyMissionsStateV2();
    state.fleet = [makeOwnedGa()];
    const collateral = companyCreditCollateralUsd(state);
    assert.equal(collateral, sellBackValueUsd(state.fleet[0]!));

    // Dry commodities start unlocked with rep 55 → mean 55/100.
    const rep = companyCreditRepScore(state.cargoOps);
    assert.ok(rep > 0.5 && rep < 0.6);
    const expected =
      Math.round(
        collateral *
          (COMPANY_CREDIT_LIMIT_BASE + COMPANY_CREDIT_LIMIT_REP_SPAN * rep) *
          100,
      ) / 100;
    assert.equal(companyCreditLimitUsd(state), expected);

    // Floor when unlocked Dry rep is 0.
    state.cargoOps!.commodities.general.rep = 0;
    state.cargoOps!.commodities.supplies.rep = 0;
    assert.equal(companyCreditRepScore(state.cargoOps), 0);
    assert.equal(
      companyCreditLimitUsd(state),
      Math.round(collateral * COMPANY_CREDIT_LIMIT_BASE * 100) / 100,
    );
  });

  it('draws up to available and credits wallet', () => {
    const state = emptyMissionsStateV2();
    state.fleet = [makeOwnedGa()];
    state.walletUsd = 100;
    const available = companyCreditSnapshot(state).availableUsd;
    assert.ok(available > 0);
    const drawn = drawCompanyCredit(state, available, 10);
    assert.equal(drawn.drawnUsd, available);
    assert.equal(state.walletUsd, 100 + available);
    assert.equal(state.companyCredit!.principalUsd, available);
    assert.equal(companyCreditSnapshot(state).availableUsd, 0);
    assert.throws(() => drawCompanyCredit(state, 1, 10));
  });

  it('rejects oversize draws and clears principal on full repay', () => {
    const state = emptyMissionsStateV2();
    state.fleet = [makeOwnedGa()];
    const available = companyCreditSnapshot(state).availableUsd;
    drawCompanyCredit(state, Math.min(1_000, available), 0);
    state.walletUsd = 50_000;
    const principal = state.companyCredit!.principalUsd;
    const result = repayCompanyCredit(state, principal, 5);
    assert.equal(result.repaidUsd, principal);
    assert.equal(state.companyCredit!.principalUsd, 0);
    assert.equal(state.companyCredit!.overdueDays, 0);
  });

  it('compounds unpaid daily interest and sets overdue', () => {
    const state = emptyMissionsStateV2();
    state.fleet = [makeOwnedGa()];
    const available = companyCreditSnapshot(state).availableUsd;
    drawCompanyCredit(state, Math.min(5_000, available), 0);
    // Spend almost everything so interest cannot be paid.
    state.walletUsd = 0;
    const principalBefore = state.companyCredit!.principalUsd;
    const expectedInterest =
      Math.round(principalBefore * COMPANY_CREDIT_DAILY_RATE * 100) / 100;
    const settled = settleCompanyCredit(state, {
      fromTick: 0,
      toTick: TICKS_PER_DAY,
    });
    assert.equal(settled.daysCharged, 1);
    assert.equal(settled.interestPaidUsd, 0);
    assert.equal(settled.interestCompoundedUsd, expectedInterest);
    assert.equal(state.companyCredit!.overdueDays, 1);
    assert.equal(
      state.companyCredit!.principalUsd,
      Math.round((principalBefore + expectedInterest) * 100) / 100,
    );
    assert.throws(() => assertCompanyCreditAllowsOps(state));
  });

  it('clears overdue when interest is paid in full', () => {
    const state = emptyMissionsStateV2();
    state.fleet = [makeOwnedGa()];
    const available = companyCreditSnapshot(state).availableUsd;
    drawCompanyCredit(state, Math.min(2_000, available), 0);
    state.walletUsd = 0;
    settleCompanyCredit(state, { fromTick: 0, toTick: TICKS_PER_DAY });
    assert.ok(state.companyCredit!.overdueDays > 0);

    state.walletUsd = 10_000;
    settleCompanyCredit(state, {
      fromTick: TICKS_PER_DAY,
      toTick: TICKS_PER_DAY * 2,
    });
    assert.equal(state.companyCredit!.overdueDays, 0);
    assertCompanyCreditAllowsOps(state);
  });

  it('persists credit ledger kinds through normalize', () => {
    const entries = normalizeCareerLedger([
      {
        id: 'a',
        atTick: 1,
        dayIndex: 0,
        amountUsd: 100,
        kind: 'credit_draw',
      },
      {
        id: 'b',
        atTick: 2,
        dayIndex: 0,
        amountUsd: -5,
        kind: 'credit_interest',
      },
      {
        id: 'c',
        atTick: 3,
        dayIndex: 0,
        amountUsd: -50,
        kind: 'credit_repay',
      },
    ]);
    assert.equal(entries.length, 3);
    assert.deepEqual(
      entries.map((e) => e.kind),
      ['credit_draw', 'credit_interest', 'credit_repay'],
    );
  });
});
