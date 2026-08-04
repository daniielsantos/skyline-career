/**
 * Company revolving credit — limit from fleet sell-back collateral + Cargo Ops rep.
 * Daily interest on day-tick; overdue soft-blocks buy / ferry / accept.
 */

import { sellBackValueUsd } from './career-aircraft-market.js';
import {
  CARGO_OPS_COMMODITY_IDS,
  normalizeCareerCargoOps,
} from './career-cargo-ops.js';
import { applyWalletDelta } from './career-ledger.js';
import { economyDayIndex } from './career-weather.js';
import type {
  CareerCargoOps,
  CareerMissionsState,
  CompanyCreditSnapshot,
  CompanyCreditState,
} from './types/career-economy.js';

/** Interest per economy day on outstanding principal (~0.08%/day). */
export const COMPANY_CREDIT_DAILY_RATE = 0.0008;

/** Floor share of collateral when Cargo Ops rep is 0. */
export const COMPANY_CREDIT_LIMIT_BASE = 0.25;

/** Extra share of collateral at repScore = 1. */
export const COMPANY_CREDIT_LIMIT_REP_SPAN = 0.4;

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

export function emptyCompanyCredit(atTick = 0): CompanyCreditState {
  return {
    principalUsd: 0,
    overdueDays: 0,
    lastSettledDayIndex: economyDayIndex(atTick),
  };
}

export function normalizeCompanyCredit(
  raw: unknown,
  atTick = 0,
): CompanyCreditState {
  const fallback = emptyCompanyCredit(atTick);
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Record<string, unknown>;
  const principalUsd =
    typeof r.principalUsd === 'number' && Number.isFinite(r.principalUsd)
      ? Math.max(0, money(r.principalUsd))
      : 0;
  const overdueDays =
    typeof r.overdueDays === 'number' && Number.isFinite(r.overdueDays)
      ? Math.max(0, Math.floor(r.overdueDays))
      : 0;
  const lastSettledDayIndex =
    typeof r.lastSettledDayIndex === 'number' &&
    Number.isFinite(r.lastSettledDayIndex)
      ? Math.max(0, Math.floor(r.lastSettledDayIndex))
      : fallback.lastSettledDayIndex;
  return { principalUsd, overdueDays, lastSettledDayIndex };
}

export function ensureCompanyCredit(
  state: CareerMissionsState,
  atTick = 0,
): CompanyCreditState {
  if (!state.companyCredit) {
    state.companyCredit = emptyCompanyCredit(atTick);
  }
  return state.companyCredit;
}

/** Mean unlocked Cargo Ops rep as 0–1. */
export function companyCreditRepScore(
  cargoOps: CareerCargoOps | undefined,
): number {
  const ops = normalizeCareerCargoOps(cargoOps);
  let sum = 0;
  let n = 0;
  for (const id of CARGO_OPS_COMMODITY_IDS) {
    const row = ops.commodities[id];
    if (!row?.unlocked) continue;
    sum += Math.max(0, Math.min(100, row.rep));
    n += 1;
  }
  if (n === 0) return 0;
  return sum / n / 100;
}

/** Sell-back sum of owned (non-leased) airframes. */
export function companyCreditCollateralUsd(
  state: Pick<CareerMissionsState, 'fleet'>,
): number {
  let total = 0;
  for (const aircraft of state.fleet ?? []) {
    if ((aircraft.ownership ?? 'owned') === 'leased') continue;
    total += sellBackValueUsd(aircraft);
  }
  return money(total);
}

export function companyCreditLimitUsd(
  state: Pick<CareerMissionsState, 'fleet' | 'cargoOps'>,
): number {
  const collateral = companyCreditCollateralUsd(state);
  const rep = companyCreditRepScore(state.cargoOps);
  const mult = COMPANY_CREDIT_LIMIT_BASE + COMPANY_CREDIT_LIMIT_REP_SPAN * rep;
  return money(collateral * mult);
}

export function companyCreditSnapshot(
  state: CareerMissionsState,
): CompanyCreditSnapshot {
  const credit = ensureCompanyCredit(state);
  const limitUsd = companyCreditLimitUsd(state);
  const principalUsd = money(credit.principalUsd);
  const collateralUsd = companyCreditCollateralUsd(state);
  const repScore = companyCreditRepScore(state.cargoOps);
  return {
    principalUsd,
    limitUsd,
    availableUsd: money(Math.max(0, limitUsd - principalUsd)),
    collateralUsd,
    repScore,
    overdueDays: credit.overdueDays,
    dailyInterestUsd: money(principalUsd * COMPANY_CREDIT_DAILY_RATE),
    lastSettledDayIndex: credit.lastSettledDayIndex,
  };
}

export function assertCompanyCreditAllowsOps(
  state: CareerMissionsState,
): void {
  const credit = state.companyCredit;
  if (credit && credit.overdueDays > 0) {
    throw new Error(
      `Company credit overdue (${credit.overdueDays} day${
        credit.overdueDays === 1 ? '' : 's'
      }) — repay interest from Hangar → Cashflow before buying, ferrying, or accepting freights`,
    );
  }
}

export function drawCompanyCredit(
  state: CareerMissionsState,
  amountUsd: number,
  atTick: number,
): { state: CareerMissionsState; drawnUsd: number; snapshot: CompanyCreditSnapshot } {
  assertCompanyCreditAllowsOps(state);
  const credit = ensureCompanyCredit(state, atTick);
  const snap = companyCreditSnapshot(state);
  const want = money(amountUsd);
  if (!(want > 0)) {
    throw new Error('Draw amount must be positive');
  }
  if (want > snap.availableUsd + 1e-9) {
    throw new Error(
      `Draw $${want.toLocaleString()} exceeds available credit $${snap.availableUsd.toLocaleString()}`,
    );
  }
  credit.principalUsd = money(credit.principalUsd + want);
  applyWalletDelta(state, {
    amountUsd: want,
    kind: 'credit_draw',
    atTick,
    note: `Credit draw · limit $${snap.limitUsd.toLocaleString()}`,
  });
  return {
    state,
    drawnUsd: want,
    snapshot: companyCreditSnapshot(state),
  };
}

export function repayCompanyCredit(
  state: CareerMissionsState,
  amountUsd: number,
  atTick: number,
): { state: CareerMissionsState; repaidUsd: number; snapshot: CompanyCreditSnapshot } {
  const credit = ensureCompanyCredit(state, atTick);
  const want = money(amountUsd);
  if (!(want > 0)) {
    throw new Error('Repay amount must be positive');
  }
  const due = money(credit.principalUsd);
  if (due <= 0) {
    throw new Error('No outstanding company credit');
  }
  const repay = money(Math.min(want, due, Math.max(0, state.walletUsd)));
  if (repay <= 0) {
    throw new Error('Wallet cannot cover this repayment');
  }
  if (repay + 1e-9 < want && want <= due) {
    throw new Error(
      `Needs $${want.toLocaleString()} but wallet has $${state.walletUsd.toLocaleString()}`,
    );
  }
  applyWalletDelta(state, {
    amountUsd: -repay,
    kind: 'credit_repay',
    atTick,
    note: `Credit repay · left $${money(due - repay).toLocaleString()}`,
  });
  credit.principalUsd = money(Math.max(0, credit.principalUsd - repay));
  if (credit.principalUsd <= 0) {
    credit.principalUsd = 0;
    credit.overdueDays = 0;
  }
  return {
    state,
    repaidUsd: repay,
    snapshot: companyCreditSnapshot(state),
  };
}

export type CompanyCreditSettleResult = {
  daysCharged: number;
  interestRequestedUsd: number;
  interestPaidUsd: number;
  interestCompoundedUsd: number;
  overdueDays: number;
  principalUsd: number;
};

/**
 * Accrue daily interest for economy days crossed by [fromTick, toTick).
 * Unpaid interest compounds onto principal and increments overdueDays.
 */
export function settleCompanyCredit(
  state: CareerMissionsState,
  opts: { fromTick: number; toTick: number },
): CompanyCreditSettleResult {
  const credit = ensureCompanyCredit(state, opts.toTick);
  const fromDay = economyDayIndex(opts.fromTick);
  const toDay = economyDayIndex(opts.toTick);
  const daysCharged = Math.max(0, toDay - fromDay);

  let interestRequestedUsd = 0;
  let interestPaidUsd = 0;
  let interestCompoundedUsd = 0;
  let anyShortfall = false;

  if (daysCharged <= 0 || credit.principalUsd <= 0) {
    if (credit.principalUsd <= 0) {
      credit.principalUsd = 0;
      credit.overdueDays = 0;
    }
    credit.lastSettledDayIndex = toDay;
    return {
      daysCharged,
      interestRequestedUsd: 0,
      interestPaidUsd: 0,
      interestCompoundedUsd: 0,
      overdueDays: credit.overdueDays,
      principalUsd: credit.principalUsd,
    };
  }

  for (let d = 0; d < daysCharged; d++) {
    if (credit.principalUsd <= 0) break;
    const interest = money(credit.principalUsd * COMPANY_CREDIT_DAILY_RATE);
    if (interest <= 0) continue;
    interestRequestedUsd = money(interestRequestedUsd + interest);
    const paid = money(
      Math.min(Math.max(0, state.walletUsd), interest),
    );
    if (paid > 0) {
      applyWalletDelta(state, {
        amountUsd: -paid,
        kind: 'credit_interest',
        atTick: opts.toTick,
        note: `Day interest · ${money(credit.principalUsd)} principal`,
      });
      interestPaidUsd = money(interestPaidUsd + paid);
    }
    const unpaid = money(interest - paid);
    if (unpaid > 0) {
      credit.principalUsd = money(credit.principalUsd + unpaid);
      credit.overdueDays += 1;
      interestCompoundedUsd = money(interestCompoundedUsd + unpaid);
      anyShortfall = true;
    }
  }

  if (!anyShortfall && interestRequestedUsd > 0) {
    credit.overdueDays = 0;
  }
  credit.lastSettledDayIndex = toDay;

  return {
    daysCharged,
    interestRequestedUsd: money(interestRequestedUsd),
    interestPaidUsd: money(interestPaidUsd),
    interestCompoundedUsd: money(interestCompoundedUsd),
    overdueDays: credit.overdueDays,
    principalUsd: money(credit.principalUsd),
  };
}
