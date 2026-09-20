/**
 * VA Line crew — weekly overhead + empty-ferry allowance (NPC reposition).
 * Spec: docs/agent-context/16-va-logistics.md (Ferry ops).
 */

import { applyWalletDelta } from './career-ledger.js';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from './career-clock.js';
import { VA_MEMBER_CAP } from './career-va.js';
import type {
  CareerMissionsState,
  PlayerAircraft,
} from './types/career-economy.js';

/** Signing bonus when hiring Line crew (VA wallet). */
export const VA_LINE_CREW_HIRE_USD = 2_500;
/** Weekly salary debited from the VA wallet. */
export const VA_LINE_CREW_SALARY_USD_PER_WEEK = 1_800;
/** Fire severance = one week salary. */
export const VA_LINE_CREW_FIRE_SEVERANCE_USD = VA_LINE_CREW_SALARY_USD_PER_WEEK;

export type VaLineCrewState = {
  hired: boolean;
  hiredAtTick: number;
  /** Economy week key (floor(tick / TICKS_PER_DAY / 7)). */
  weekKey: number;
  /** Empty ferries consumed this week under allowance. */
  usedThisWeek: number;
};

export function vaWeekKeyFromTick(tick: number): number {
  const day = Math.floor(Math.max(0, tick) / TICKS_PER_DAY);
  return Math.floor(day / 7);
}

export function ensureVaLineCrew(
  state: CareerMissionsState,
  tick: number,
): VaLineCrewState {
  const weekKey = vaWeekKeyFromTick(tick);
  const raw = state.vaLineCrew;
  if (!raw || typeof raw !== 'object') {
    const fresh: VaLineCrewState = {
      hired: false,
      hiredAtTick: 0,
      weekKey,
      usedThisWeek: 0,
    };
    state.vaLineCrew = fresh;
    return fresh;
  }
  const hired = raw.hired === true;
  const hiredAtTick =
    typeof raw.hiredAtTick === 'number' && Number.isFinite(raw.hiredAtTick)
      ? Math.max(0, Math.floor(raw.hiredAtTick))
      : 0;
  const prevWeek =
    typeof raw.weekKey === 'number' && Number.isFinite(raw.weekKey)
      ? Math.floor(raw.weekKey)
      : weekKey;
  let usedThisWeek =
    typeof raw.usedThisWeek === 'number' && Number.isFinite(raw.usedThisWeek)
      ? Math.max(0, Math.floor(raw.usedThisWeek))
      : 0;
  if (prevWeek !== weekKey) {
    usedThisWeek = 0;
  }
  const next: VaLineCrewState = {
    hired,
    hiredAtTick,
    weekKey,
    usedThisWeek,
  };
  state.vaLineCrew = next;
  return next;
}

/** Allowance K = min(2×memberCap, parked hulls), floor 2 when hired. */
/**
 * Weekly NPC empty-ferry budget while Line crew is hired.
 * Floor 4 so a 2-hull starter VA can reposition more than once/week;
 * scales 2× parked up to 2× member cap (16).
 */
export function quoteVaLineCrewAllowance(
  state: CareerMissionsState,
): number {
  const parked = (state.fleet ?? []).filter(
    (a) => a.status === 'parked' && !a.npcFerry,
  ).length;
  const byCap = 2 * VA_MEMBER_CAP;
  const byFleet = Math.max(0, parked) * 2;
  const raw = Math.min(byCap, byFleet);
  return Math.max(4, raw);
}

export function vaLineCrewAllowanceRemaining(
  state: CareerMissionsState,
  tick: number,
): { hired: boolean; allowance: number; used: number; remaining: number } {
  const crew = ensureVaLineCrew(state, tick);
  const allowance = crew.hired ? quoteVaLineCrewAllowance(state) : 0;
  const used = crew.hired ? crew.usedThisWeek : 0;
  return {
    hired: crew.hired,
    allowance,
    used,
    remaining: Math.max(0, allowance - used),
  };
}

export function hireVaLineCrew(
  state: CareerMissionsState,
  tick: number,
): { debitUsd: number; crew: VaLineCrewState } {
  const crew = ensureVaLineCrew(state, tick);
  if (crew.hired) throw new Error('Line crew already hired');
  if (state.walletUsd < VA_LINE_CREW_HIRE_USD) {
    throw new Error(
      `Line crew hire costs $${VA_LINE_CREW_HIRE_USD.toLocaleString()} but wallet has $${state.walletUsd.toLocaleString()}`,
    );
  }
  applyWalletDelta(state, {
    amountUsd: -VA_LINE_CREW_HIRE_USD,
    kind: 'va_line_crew_hire',
    atTick: tick,
    note: 'Hire VA Line crew (ferry desk)',
  });
  const next: VaLineCrewState = {
    hired: true,
    hiredAtTick: tick,
    weekKey: vaWeekKeyFromTick(tick),
    usedThisWeek: 0,
  };
  state.vaLineCrew = next;
  return { debitUsd: VA_LINE_CREW_HIRE_USD, crew: next };
}

export function fireVaLineCrew(
  state: CareerMissionsState,
  tick: number,
): { debitUsd: number; crew: VaLineCrewState } {
  const crew = ensureVaLineCrew(state, tick);
  if (!crew.hired) throw new Error('No Line crew to fire');
  if (state.walletUsd < VA_LINE_CREW_FIRE_SEVERANCE_USD) {
    throw new Error(
      `Severance costs $${VA_LINE_CREW_FIRE_SEVERANCE_USD.toLocaleString()} but wallet has $${state.walletUsd.toLocaleString()}`,
    );
  }
  applyWalletDelta(state, {
    amountUsd: -VA_LINE_CREW_FIRE_SEVERANCE_USD,
    kind: 'va_line_crew_fire',
    atTick: tick,
    note: 'Fire VA Line crew · 1 week severance',
  });
  const next: VaLineCrewState = {
    hired: false,
    hiredAtTick: 0,
    weekKey: vaWeekKeyFromTick(tick),
    usedThisWeek: 0,
  };
  state.vaLineCrew = next;
  return { debitUsd: VA_LINE_CREW_FIRE_SEVERANCE_USD, crew: next };
}

export function settleVaLineCrewSalary(
  state: CareerMissionsState,
  opts: { fromTick: number; toTick: number },
): { debitUsd: number; weeksCharged: number; requestedUsd: number } {
  const crew = ensureVaLineCrew(state, opts.toTick);
  if (!crew.hired) {
    return { debitUsd: 0, weeksCharged: 0, requestedUsd: 0 };
  }
  const fromWeek = vaWeekKeyFromTick(opts.fromTick);
  const toWeek = vaWeekKeyFromTick(opts.toTick);
  const weeksCharged = Math.max(0, toWeek - fromWeek);
  if (weeksCharged <= 0) {
    return { debitUsd: 0, weeksCharged: 0, requestedUsd: 0 };
  }
  const requestedUsd = weeksCharged * VA_LINE_CREW_SALARY_USD_PER_WEEK;
  const debitUsd = Math.min(state.walletUsd, requestedUsd);
  if (debitUsd > 0) {
    applyWalletDelta(state, {
      amountUsd: -debitUsd,
      kind: 'va_line_crew_salary',
      atTick: opts.toTick,
      note: `${weeksCharged}w · VA Line crew`,
    });
  }
  return { debitUsd, weeksCharged, requestedUsd };
}

export function consumeVaLineCrewAllowance(
  state: CareerMissionsState,
  tick: number,
): boolean {
  const crew = ensureVaLineCrew(state, tick);
  if (!crew.hired) return false;
  const allowance = quoteVaLineCrewAllowance(state);
  if (crew.usedThisWeek >= allowance) return false;
  crew.usedThisWeek += 1;
  state.vaLineCrew = { ...crew };
  return true;
}

/** ETA ticks for an NPC reposition (min ~1h, max 1 day). */
export function quoteNpcFerryEtaTicks(distanceNm: number): number {
  const hours = Math.max(1, distanceNm / 180);
  const ticks = Math.ceil(hours * TICKS_PER_HOUR);
  return Math.min(TICKS_PER_DAY, Math.max(TICKS_PER_HOUR, ticks));
}

export function completeNpcFerries(
  state: CareerMissionsState,
  tick: number,
): PlayerAircraft[] {
  const done: PlayerAircraft[] = [];
  for (const acf of state.fleet ?? []) {
    const pending = acf.npcFerry;
    if (!pending) continue;
    if (pending.arriveAtTick > tick) continue;
    const hours =
      typeof pending.distanceNm === 'number' && pending.distanceNm > 0
        ? pending.distanceNm / 180
        : 1;
    acf.locationIcao = pending.destIcao;
    acf.status = 'parked';
    acf.npcFerry = undefined;
    acf.hoursAirframe = (acf.hoursAirframe ?? 0) + hours;
    acf.hoursEngine = (acf.hoursEngine ?? 0) + hours;
    acf.hoursSinceInspection = (acf.hoursSinceInspection ?? 0) + hours;
    done.push(acf);
  }
  return done;
}

export function aircraftBusyWithNpcFerry(aircraft: PlayerAircraft): boolean {
  return Boolean(aircraft.npcFerry);
}
