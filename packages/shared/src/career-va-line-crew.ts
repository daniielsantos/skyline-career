/**
 * VA Line crew — weekly overhead + empty-ferry allowance (NPC reposition).
 * Tiers: Desk (T1) → Ops (T2) → Network (T3). Spec: docs/agent-context/16-va-logistics.md.
 */

import { applyWalletDelta } from './career-ledger.js';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from './career-clock.js';
import type {
  CareerMissionsState,
  PlayerAircraft,
} from './types/career-economy.js';

export type VaLineCrewTier = 1 | 2 | 3;

export type VaLineCrewTierDef = {
  tier: VaLineCrewTier;
  name: 'Desk' | 'Ops' | 'Network';
  /** Signing cost to reach this tier (hire for T1; upgrade for T2/T3). */
  unlockUsd: number;
  salaryUsdPerWeek: number;
  allowanceFloor: number;
  allowanceParkedMult: number;
  allowanceCap: number;
};

export const VA_LINE_CREW_TIERS: readonly VaLineCrewTierDef[] = [
  {
    tier: 1,
    name: 'Desk',
    unlockUsd: 2_500,
    salaryUsdPerWeek: 1_800,
    allowanceFloor: 4,
    allowanceParkedMult: 2,
    allowanceCap: 16,
  },
  {
    tier: 2,
    name: 'Ops',
    unlockUsd: 4_000,
    salaryUsdPerWeek: 3_200,
    allowanceFloor: 8,
    allowanceParkedMult: 3,
    allowanceCap: 24,
  },
  {
    tier: 3,
    name: 'Network',
    unlockUsd: 7_500,
    salaryUsdPerWeek: 5_500,
    allowanceFloor: 12,
    allowanceParkedMult: 4,
    allowanceCap: 32,
  },
] as const;

/** Signing bonus when hiring Line crew at Desk (VA wallet). */
export const VA_LINE_CREW_HIRE_USD = VA_LINE_CREW_TIERS[0]!.unlockUsd;
/** @deprecated Prefer tier salary via resolveVaLineCrewTier(1). Kept for T1 callers/tests. */
export const VA_LINE_CREW_SALARY_USD_PER_WEEK =
  VA_LINE_CREW_TIERS[0]!.salaryUsdPerWeek;
/** @deprecated Prefer fireSeveranceForTier — fire uses current tier salary. */
export const VA_LINE_CREW_FIRE_SEVERANCE_USD =
  VA_LINE_CREW_TIERS[0]!.salaryUsdPerWeek;

export type VaLineCrewState = {
  hired: boolean;
  /** Desk=1 / Ops=2 / Network=3. Legacy hired without tier → 1. */
  tier: VaLineCrewTier;
  hiredAtTick: number;
  /** Economy week key (floor(tick / TICKS_PER_DAY / 7)). */
  weekKey: number;
  /** Empty ferries consumed this week under allowance. */
  usedThisWeek: number;
};

export type VaLineCrewSnapshot = {
  hired: boolean;
  tier: VaLineCrewTier;
  tierName: 'Desk' | 'Ops' | 'Network' | null;
  allowance: number;
  used: number;
  remaining: number;
  hireUsd: number;
  upgradeUsd: number | null;
  nextTierName: 'Ops' | 'Network' | null;
  salaryUsdPerWeek: number;
  fireSeveranceUsd: number;
};

export function resolveVaLineCrewTier(tier: VaLineCrewTier): VaLineCrewTierDef {
  const def = VA_LINE_CREW_TIERS[tier - 1];
  if (!def) return VA_LINE_CREW_TIERS[0]!;
  return def;
}

export function normalizeVaLineCrewTier(raw: unknown): VaLineCrewTier {
  if (raw === 2 || raw === '2') return 2;
  if (raw === 3 || raw === '3') return 3;
  return 1;
}

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
      tier: 1,
      hiredAtTick: 0,
      weekKey,
      usedThisWeek: 0,
    };
    state.vaLineCrew = fresh;
    return fresh;
  }
  const hired = raw.hired === true;
  const tier = hired
    ? normalizeVaLineCrewTier(
        (raw as { tier?: unknown }).tier !== undefined
          ? (raw as { tier?: unknown }).tier
          : 1,
      )
    : 1;
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
    tier,
    hiredAtTick,
    weekKey,
    usedThisWeek,
  };
  state.vaLineCrew = next;
  return next;
}

/**
 * Weekly NPC empty-ferry budget while Line crew is hired.
 * Formula depends on tier (floor / parked mult / cap).
 */
export function quoteVaLineCrewAllowance(
  state: CareerMissionsState,
  tier: VaLineCrewTier = 1,
): number {
  const def = resolveVaLineCrewTier(tier);
  const parked = (state.fleet ?? []).filter(
    (a) => a.status === 'parked' && !a.npcFerry,
  ).length;
  const byFleet = Math.max(0, parked) * def.allowanceParkedMult;
  const raw = Math.min(def.allowanceCap, byFleet);
  return Math.max(def.allowanceFloor, raw);
}

export function vaLineCrewAllowanceRemaining(
  state: CareerMissionsState,
  tick: number,
): {
  hired: boolean;
  tier: VaLineCrewTier;
  allowance: number;
  used: number;
  remaining: number;
} {
  const crew = ensureVaLineCrew(state, tick);
  const allowance = crew.hired
    ? quoteVaLineCrewAllowance(state, crew.tier)
    : 0;
  const used = crew.hired ? crew.usedThisWeek : 0;
  return {
    hired: crew.hired,
    tier: crew.hired ? crew.tier : 1,
    allowance,
    used,
    remaining: Math.max(0, allowance - used),
  };
}

export function buildVaLineCrewSnapshot(
  state: CareerMissionsState,
  tick: number,
): VaLineCrewSnapshot {
  const crew = ensureVaLineCrew(state, tick);
  const allowance = vaLineCrewAllowanceRemaining(state, tick);
  const hireUsd = VA_LINE_CREW_HIRE_USD;
  if (!crew.hired) {
    return {
      hired: false,
      tier: 1,
      tierName: null,
      allowance: 0,
      used: 0,
      remaining: 0,
      hireUsd,
      upgradeUsd: null,
      nextTierName: null,
      salaryUsdPerWeek: resolveVaLineCrewTier(1).salaryUsdPerWeek,
      fireSeveranceUsd: resolveVaLineCrewTier(1).salaryUsdPerWeek,
    };
  }
  const def = resolveVaLineCrewTier(crew.tier);
  const next =
    crew.tier < 3 ? resolveVaLineCrewTier((crew.tier + 1) as VaLineCrewTier) : null;
  return {
    hired: true,
    tier: crew.tier,
    tierName: def.name,
    allowance: allowance.allowance,
    used: allowance.used,
    remaining: allowance.remaining,
    hireUsd,
    upgradeUsd: next ? next.unlockUsd : null,
    nextTierName: next ? (next.name as 'Ops' | 'Network') : null,
    salaryUsdPerWeek: def.salaryUsdPerWeek,
    fireSeveranceUsd: def.salaryUsdPerWeek,
  };
}

export function hireVaLineCrew(
  state: CareerMissionsState,
  tick: number,
): { debitUsd: number; crew: VaLineCrewState } {
  const crew = ensureVaLineCrew(state, tick);
  if (crew.hired) throw new Error('Line crew already hired');
  const cost = VA_LINE_CREW_HIRE_USD;
  if (state.walletUsd < cost) {
    throw new Error(
      `Line crew hire costs $${cost.toLocaleString()} but wallet has $${state.walletUsd.toLocaleString()}`,
    );
  }
  applyWalletDelta(state, {
    amountUsd: -cost,
    kind: 'va_line_crew_hire',
    atTick: tick,
    note: 'Hire VA Line crew · Desk (ferry desk)',
  });
  const next: VaLineCrewState = {
    hired: true,
    tier: 1,
    hiredAtTick: tick,
    weekKey: vaWeekKeyFromTick(tick),
    usedThisWeek: 0,
  };
  state.vaLineCrew = next;
  return { debitUsd: cost, crew: next };
}

export function upgradeVaLineCrew(
  state: CareerMissionsState,
  tick: number,
): { debitUsd: number; crew: VaLineCrewState } {
  const crew = ensureVaLineCrew(state, tick);
  if (!crew.hired) throw new Error('Hire Line crew before upgrading');
  if (crew.tier >= 3) throw new Error('Line crew already at Network');
  const nextTier = (crew.tier + 1) as VaLineCrewTier;
  const nextDef = resolveVaLineCrewTier(nextTier);
  const cost = nextDef.unlockUsd;
  if (state.walletUsd < cost) {
    throw new Error(
      `Upgrade to ${nextDef.name} costs $${cost.toLocaleString()} but wallet has $${state.walletUsd.toLocaleString()}`,
    );
  }
  applyWalletDelta(state, {
    amountUsd: -cost,
    kind: 'va_line_crew_upgrade',
    atTick: tick,
    note: `Upgrade VA Line crew · ${nextDef.name}`,
  });
  const next: VaLineCrewState = {
    ...crew,
    tier: nextTier,
  };
  state.vaLineCrew = next;
  return { debitUsd: cost, crew: next };
}

export function fireVaLineCrew(
  state: CareerMissionsState,
  tick: number,
): { debitUsd: number; crew: VaLineCrewState } {
  const crew = ensureVaLineCrew(state, tick);
  if (!crew.hired) throw new Error('No Line crew to fire');
  const severance = resolveVaLineCrewTier(crew.tier).salaryUsdPerWeek;
  if (state.walletUsd < severance) {
    throw new Error(
      `Severance costs $${severance.toLocaleString()} but wallet has $${state.walletUsd.toLocaleString()}`,
    );
  }
  const tierName = resolveVaLineCrewTier(crew.tier).name;
  applyWalletDelta(state, {
    amountUsd: -severance,
    kind: 'va_line_crew_fire',
    atTick: tick,
    note: `Fire VA Line crew · ${tierName} · 1 week severance`,
  });
  const next: VaLineCrewState = {
    hired: false,
    tier: 1,
    hiredAtTick: 0,
    weekKey: vaWeekKeyFromTick(tick),
    usedThisWeek: 0,
  };
  state.vaLineCrew = next;
  return { debitUsd: severance, crew: next };
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
  const salary = resolveVaLineCrewTier(crew.tier).salaryUsdPerWeek;
  const requestedUsd = weeksCharged * salary;
  const debitUsd = Math.min(state.walletUsd, requestedUsd);
  if (debitUsd > 0) {
    const tierName = resolveVaLineCrewTier(crew.tier).name;
    applyWalletDelta(state, {
      amountUsd: -debitUsd,
      kind: 'va_line_crew_salary',
      atTick: opts.toTick,
      note: `${weeksCharged}w · VA Line crew · ${tierName}`,
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
  const allowance = quoteVaLineCrewAllowance(state, crew.tier);
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

/**
 * Land any in-progress NPC hops immediately.
 * Player-initiated Line-crew ferry is instant now; this clears leftovers from
 * the old ETA path so tails reappear as parked at dest.
 */
export function finalizeStuckNpcFerries(
  state: CareerMissionsState,
  tick: number,
): PlayerAircraft[] {
  const due = completeNpcFerries(state, tick);
  for (const acf of state.fleet ?? []) {
    if (!acf.npcFerry) continue;
    acf.npcFerry = { ...acf.npcFerry, arriveAtTick: tick };
  }
  const forced = completeNpcFerries(state, tick);
  return due.length || forced.length ? [...due, ...forced] : due;
}

export function aircraftBusyWithNpcFerry(aircraft: PlayerAircraft): boolean {
  return Boolean(aircraft.npcFerry);
}
