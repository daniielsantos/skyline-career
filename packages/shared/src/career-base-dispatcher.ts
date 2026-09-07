/**
 * Base Dispatcher seat — ground desk at a company Base (not flying crew).
 * Hire unlocks fleet Market scout + ferry-aware ranking perks.
 */

import { resolveCrewPortraitId } from './career-crew.js';
import { ensurePlayerFbos } from './career-fbo.js';
import { applyWalletDelta } from './career-ledger.js';
import { economyDayIndex } from './career-weather.js';
import type {
  BaseDispatcherCandidate,
  BaseDispatcherGrade,
  BaseDispatcherMember,
  CareerEconomyWorld,
  CareerMissionsState,
  PlayerFbo,
  PlayerFboState,
} from './types/career-economy.js';

/** Signing cost = this × daily salary. */
export const BASE_DISPATCHER_HIRE_SIGNING_DAYS = 7;

/** Severance when firing = this × daily salary. */
export const BASE_DISPATCHER_FIRE_SEVERANCE_DAYS = 5;

/** Candidates shown at one Base hire desk. */
export const BASE_DISPATCHER_HIRE_POOL_SIZE = 3;

export const BASE_DISPATCHER_GRADE_LABEL: Record<BaseDispatcherGrade, string> = {
  ace: 'Ace',
  solid: 'Solid',
  capable: 'Capable',
  green: 'Green',
};

const GRADE_BANDS: Record<BaseDispatcherGrade, { min: number; max: number }> = {
  ace: { min: 90, max: 99 },
  solid: { min: 75, max: 89 },
  capable: { min: 55, max: 74 },
  green: { min: 40, max: 54 },
};

const GRADE_WEIGHTS: Array<{ grade: BaseDispatcherGrade; weight: number }> = [
  { grade: 'ace', weight: 0.08 },
  { grade: 'solid', weight: 0.32 },
  { grade: 'capable', weight: 0.4 },
  { grade: 'green', weight: 0.2 },
];

const GRADE_SALARY_BASE: Record<BaseDispatcherGrade, number> = {
  ace: 110,
  solid: 85,
  capable: 68,
  green: 52,
};

const BD_FIRST_NAMES = [
  'Alex',
  'Sam',
  'Jordan',
  'Casey',
  'Riley',
  'Morgan',
  'Quinn',
  'Avery',
  'Cameron',
  'Drew',
  'Jamie',
  'Taylor',
  'Reese',
  'Skyler',
  'Parker',
];

const BD_LAST_NAMES = [
  'Nguyen',
  'Silva',
  'Okada',
  'Berg',
  'Costa',
  'Hassan',
  'Petrov',
  'Moreau',
  'Andersen',
  'Reyes',
  'Kowalski',
  'Ibrahim',
  'Chen',
  'Duarte',
  'Walsh',
];

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function nextId(tick: number, tag = 'bd'): string {
  return `${tag}_${tick}_${Math.floor(Math.random() * 1e6)}`;
}

function hashSeed(parts: Array<string | number>): number {
  let h = 2166136261;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function parseBaseDispatcherGrade(
  raw: unknown,
): BaseDispatcherGrade | null {
  if (raw === 'ace') return 'ace';
  if (raw === 'solid') return 'solid';
  if (raw === 'capable') return 'capable';
  if (raw === 'green') return 'green';
  return null;
}

export function baseDispatcherGradeFromSkillPct(
  pct: number,
): BaseDispatcherGrade {
  const n = Math.round(pct);
  if (n >= 90) return 'ace';
  if (n >= 75) return 'solid';
  if (n >= 55) return 'capable';
  return 'green';
}

function pickGrade(rng: () => number): BaseDispatcherGrade {
  const roll = rng();
  let acc = 0;
  for (const row of GRADE_WEIGHTS) {
    acc += row.weight;
    if (roll < acc) return row.grade;
  }
  return 'capable';
}

function rollSkillPct(grade: BaseDispatcherGrade, rng: () => number): number {
  const { min, max } = GRADE_BANDS[grade];
  return Math.round(min + rng() * Math.max(0, max - min));
}

function rollSalary(grade: BaseDispatcherGrade, rng: () => number): number {
  const base = GRADE_SALARY_BASE[grade];
  const jitter = 0.92 + rng() * 0.16;
  return money(base * jitter);
}

function rollName(rng: () => number): string {
  const first = BD_FIRST_NAMES[Math.floor(rng() * BD_FIRST_NAMES.length)]!;
  const last = BD_LAST_NAMES[Math.floor(rng() * BD_LAST_NAMES.length)]!;
  return `${first} ${last}`;
}

function normalizeMember(raw: unknown): BaseDispatcherMember | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const id = typeof m.id === 'string' ? m.id.trim() : '';
  const displayName =
    typeof m.displayName === 'string' ? m.displayName.trim() : '';
  const fboId = typeof m.fboId === 'string' ? m.fboId.trim() : '';
  const hubIcao =
    typeof m.hubIcao === 'string' ? m.hubIcao.trim().toUpperCase() : '';
  const grade = parseBaseDispatcherGrade(m.grade);
  const skillPct =
    typeof m.skillPct === 'number' && Number.isFinite(m.skillPct)
      ? Math.max(40, Math.min(99, Math.round(m.skillPct)))
      : 0;
  const salaryUsdPerDay =
    typeof m.salaryUsdPerDay === 'number' && Number.isFinite(m.salaryUsdPerDay)
      ? money(Math.max(0, m.salaryUsdPerDay))
      : 0;
  const hiredAtTick =
    typeof m.hiredAtTick === 'number' && Number.isFinite(m.hiredAtTick)
      ? Math.max(0, Math.floor(m.hiredAtTick))
      : 0;
  if (!id || !displayName || !fboId || !hubIcao || !grade || skillPct <= 0) {
    return null;
  }
  return {
    id,
    displayName,
    fboId,
    hubIcao,
    grade,
    skillPct,
    salaryUsdPerDay,
    hiredAtTick,
    portraitId: resolveCrewPortraitId(displayName, {
      portraitId: typeof m.portraitId === 'string' ? m.portraitId : undefined,
      salt: id,
    }),
  };
}

function normalizeCandidate(raw: unknown): BaseDispatcherCandidate | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const id = typeof c.id === 'string' ? c.id.trim() : '';
  const displayName =
    typeof c.displayName === 'string' ? c.displayName.trim() : '';
  const grade = parseBaseDispatcherGrade(c.grade);
  const skillPct =
    typeof c.skillPct === 'number' && Number.isFinite(c.skillPct)
      ? Math.max(40, Math.min(99, Math.round(c.skillPct)))
      : 0;
  const salaryUsdPerDay =
    typeof c.salaryUsdPerDay === 'number' && Number.isFinite(c.salaryUsdPerDay)
      ? money(Math.max(0, c.salaryUsdPerDay))
      : 0;
  const hireUsd =
    typeof c.hireUsd === 'number' && Number.isFinite(c.hireUsd)
      ? money(Math.max(0, c.hireUsd))
      : 0;
  if (!id || !displayName || !grade || skillPct <= 0 || salaryUsdPerDay <= 0) {
    return null;
  }
  return {
    id,
    displayName,
    grade,
    skillPct,
    salaryUsdPerDay,
    hireUsd:
      hireUsd > 0
        ? hireUsd
        : money(salaryUsdPerDay * BASE_DISPATCHER_HIRE_SIGNING_DAYS),
    portraitId: resolveCrewPortraitId(displayName, {
      portraitId: typeof c.portraitId === 'string' ? c.portraitId : undefined,
      salt: id,
    }),
  };
}

/** Persist-safe normalize of dispatcher fields on PlayerFboState. */
export function normalizeBaseDispatcherFields(
  state: PlayerFboState,
): PlayerFboState {
  const dispatchers: BaseDispatcherMember[] = [];
  const seenFbo = new Set<string>();
  if (Array.isArray(state.dispatchers)) {
    for (const row of state.dispatchers) {
      const m = normalizeMember(row);
      if (!m) continue;
      if (seenFbo.has(m.fboId)) continue;
      seenFbo.add(m.fboId);
      dispatchers.push(m);
    }
  }

  const dispatcherHirePoolByHub: Record<string, BaseDispatcherCandidate[]> = {};
  if (
    state.dispatcherHirePoolByHub &&
    typeof state.dispatcherHirePoolByHub === 'object'
  ) {
    for (const [hub, rows] of Object.entries(state.dispatcherHirePoolByHub)) {
      const key = hub.trim().toUpperCase();
      if (!key || !Array.isArray(rows)) continue;
      const pool: BaseDispatcherCandidate[] = [];
      for (const row of rows) {
        const c = normalizeCandidate(row);
        if (c) pool.push(c);
      }
      if (pool.length > 0) dispatcherHirePoolByHub[key] = pool;
    }
  }

  const dispatcherHirePoolDayByHub: Record<string, number> = {};
  if (
    state.dispatcherHirePoolDayByHub &&
    typeof state.dispatcherHirePoolDayByHub === 'object'
  ) {
    for (const [hub, day] of Object.entries(state.dispatcherHirePoolDayByHub)) {
      const key = hub.trim().toUpperCase();
      if (
        !key ||
        typeof day !== 'number' ||
        !Number.isFinite(day)
      ) {
        continue;
      }
      dispatcherHirePoolDayByHub[key] = Math.max(0, Math.floor(day));
    }
  }

  return {
    ...state,
    dispatchers,
    dispatcherHirePoolByHub,
    dispatcherHirePoolDayByHub,
  };
}

export function ensureBaseDispatchers(
  state: CareerMissionsState,
): PlayerFboState {
  const fbos = ensurePlayerFbos(state);
  const normalized = normalizeBaseDispatcherFields(fbos);
  state.playerFbos = normalized;
  return normalized;
}

export function findBaseDispatcherAtFbo(
  state: CareerMissionsState,
  fboId: string,
): BaseDispatcherMember | null {
  const id = fboId.trim();
  if (!id) return null;
  return (
    ensureBaseDispatchers(state).dispatchers?.find((m) => m.fboId === id) ??
    null
  );
}

export function findBaseDispatcherAtHub(
  state: CareerMissionsState,
  hubIcao: string,
): BaseDispatcherMember | null {
  const hub = hubIcao.trim().toUpperCase();
  if (!hub) return null;
  return (
    ensureBaseDispatchers(state).dispatchers?.find(
      (m) => m.hubIcao === hub,
    ) ?? null
  );
}

/** Best hired dispatcher across all Bases (for scout policy). */
export function bestBaseDispatcher(
  state: CareerMissionsState,
): BaseDispatcherMember | null {
  const list = ensureBaseDispatchers(state).dispatchers ?? [];
  if (list.length === 0) return null;
  return [...list].sort((a, b) => b.skillPct - a.skillPct)[0] ?? null;
}

export function quoteBaseDispatcherFireSeveranceUsd(
  member: Pick<BaseDispatcherMember, 'salaryUsdPerDay'>,
): number {
  return money(member.salaryUsdPerDay * BASE_DISPATCHER_FIRE_SEVERANCE_DAYS);
}

function rollCandidate(
  world: Pick<CareerEconomyWorld, 'tick'> & { seed?: string },
  hub: string,
  slot: number,
): BaseDispatcherCandidate {
  const rng = mulberry32(
    hashSeed([
      world.seed ?? 'career',
      'base-dispatcher',
      hub,
      economyDayIndex(world.tick),
      slot,
    ]),
  );
  const grade = pickGrade(rng);
  const skillPct = rollSkillPct(grade, rng);
  const salaryUsdPerDay = rollSalary(grade, rng);
  const displayName = rollName(rng);
  const id = `bdc_${hub}_${economyDayIndex(world.tick)}_${slot}`;
  return {
    id,
    displayName,
    grade,
    skillPct,
    salaryUsdPerDay,
    hireUsd: money(salaryUsdPerDay * BASE_DISPATCHER_HIRE_SIGNING_DAYS),
    portraitId: resolveCrewPortraitId(displayName, { salt: id }),
  };
}

export function refreshBaseDispatcherHirePool(
  state: CareerMissionsState,
  world: Pick<CareerEconomyWorld, 'tick'> & { seed?: string },
  opts: { hubIcao?: string; force?: boolean } = {},
): PlayerFboState {
  const roster = ensureBaseDispatchers(state);
  const day = economyDayIndex(world.tick);
  const fbos = roster.fbos ?? [];
  const hubs = new Set<string>();
  if (opts.hubIcao?.trim()) {
    hubs.add(opts.hubIcao.trim().toUpperCase());
  } else {
    for (const f of fbos) {
      const icao = f.icao.trim().toUpperCase();
      if (icao) hubs.add(icao);
    }
  }

  const hirePoolByHub = { ...(roster.dispatcherHirePoolByHub ?? {}) };
  const hirePoolDayByHub = { ...(roster.dispatcherHirePoolDayByHub ?? {}) };
  const ownedHubs = new Set(
    fbos.map((f) => f.icao.trim().toUpperCase()).filter(Boolean),
  );

  for (const key of Object.keys(hirePoolByHub)) {
    if (!ownedHubs.has(key)) {
      delete hirePoolByHub[key];
      delete hirePoolDayByHub[key];
    }
  }

  for (const hub of hubs) {
    if (!ownedHubs.has(hub)) {
      delete hirePoolByHub[hub];
      delete hirePoolDayByHub[hub];
      continue;
    }
    if (!opts.force && hirePoolDayByHub[hub] === day && hirePoolByHub[hub]) {
      continue;
    }
    const pool: BaseDispatcherCandidate[] = [];
    for (let i = 0; i < BASE_DISPATCHER_HIRE_POOL_SIZE; i++) {
      pool.push(rollCandidate(world, hub, i));
    }
    hirePoolByHub[hub] = pool;
    hirePoolDayByHub[hub] = day;
  }

  roster.dispatcherHirePoolByHub = hirePoolByHub;
  roster.dispatcherHirePoolDayByHub = hirePoolDayByHub;
  state.playerFbos = roster;
  return roster;
}

function findFboById(
  state: CareerMissionsState,
  fboId: string,
): PlayerFbo | null {
  const id = fboId.trim();
  return ensurePlayerFbos(state).fbos.find((f) => f.id === id) ?? null;
}

export function hireBaseDispatcherCandidate(
  state: CareerMissionsState,
  world: Pick<CareerEconomyWorld, 'tick'> & { seed?: string },
  opts: { fboId: string; candidateId: string },
): { member: BaseDispatcherMember; debitUsd: number } {
  const fbo = findFboById(state, opts.fboId);
  if (!fbo) throw new Error(`Unknown Base ${opts.fboId}`);
  const hub = fbo.icao.trim().toUpperCase();

  if (findBaseDispatcherAtFbo(state, fbo.id)) {
    throw new Error(
      `Already have a Dispatcher at ${hub} — fire them before hiring again`,
    );
  }

  const lookup = (): { roster: PlayerFboState; idx: number } => {
    const roster = ensureBaseDispatchers(state);
    const pool = roster.dispatcherHirePoolByHub?.[hub] ?? [];
    return {
      roster,
      idx: pool.findIndex((c) => c.id === opts.candidateId),
    };
  };

  let { roster, idx } = lookup();
  if (idx < 0) {
    refreshBaseDispatcherHirePool(state, world, { hubIcao: hub, force: true });
    ({ roster, idx } = lookup());
  }
  if (idx < 0) throw new Error(`Unknown hire candidate ${opts.candidateId}`);
  const candidate = (roster.dispatcherHirePoolByHub?.[hub] ?? [])[idx]!;

  if (state.walletUsd < candidate.hireUsd) {
    throw new Error(
      `Hire costs $${candidate.hireUsd.toLocaleString()} but wallet has $${state.walletUsd.toLocaleString()}`,
    );
  }

  const member: BaseDispatcherMember = {
    id: nextId(world.tick, 'bd'),
    displayName: candidate.displayName,
    fboId: fbo.id,
    hubIcao: hub,
    grade: candidate.grade,
    skillPct: candidate.skillPct,
    salaryUsdPerDay: candidate.salaryUsdPerDay,
    hiredAtTick: world.tick,
    portraitId: resolveCrewPortraitId(candidate.displayName, {
      portraitId: candidate.portraitId,
      salt: candidate.id,
    }),
  };

  applyWalletDelta(state, {
    amountUsd: -candidate.hireUsd,
    kind: 'base_dispatcher_hire',
    atTick: world.tick,
    icao: hub,
    note: `Hire ${member.displayName} · ${BASE_DISPATCHER_GRADE_LABEL[member.grade]} Dispatcher @ ${hub}`,
  });

  roster.dispatchers = [...(roster.dispatchers ?? []), member];
  roster.dispatcherHirePoolByHub = {
    ...(roster.dispatcherHirePoolByHub ?? {}),
    [hub]: (roster.dispatcherHirePoolByHub?.[hub] ?? []).filter(
      (c) => c.id !== candidate.id,
    ),
  };
  state.playerFbos = roster;
  return { member, debitUsd: candidate.hireUsd };
}

export function fireBaseDispatcherMember(
  state: CareerMissionsState,
  world: Pick<CareerEconomyWorld, 'tick'>,
  memberId: string,
): { member: BaseDispatcherMember; debitUsd: number } {
  const roster = ensureBaseDispatchers(state);
  const idx = (roster.dispatchers ?? []).findIndex((m) => m.id === memberId);
  if (idx < 0) throw new Error(`Unknown Base Dispatcher ${memberId}`);
  const member = roster.dispatchers![idx]!;
  const debitUsd = quoteBaseDispatcherFireSeveranceUsd(member);
  if (debitUsd > 0 && state.walletUsd < debitUsd) {
    throw new Error(
      `Severance costs $${debitUsd.toLocaleString()} but wallet has $${state.walletUsd.toLocaleString()}`,
    );
  }

  if (debitUsd > 0) {
    applyWalletDelta(state, {
      amountUsd: -debitUsd,
      kind: 'base_dispatcher_fire',
      atTick: world.tick,
      icao: member.hubIcao,
      note: `Fire ${member.displayName} · ${BASE_DISPATCHER_FIRE_SEVERANCE_DAYS}d severance @ ${member.hubIcao}`,
    });
  }

  roster.dispatchers = (roster.dispatchers ?? []).filter(
    (m) => m.id !== memberId,
  );
  state.playerFbos = roster;
  return { member, debitUsd };
}

export type BaseDispatcherSalarySettleResult = {
  debitUsd: number;
  requestedUsd: number;
  shortfallUsd: number;
  daysCharged: number;
};

export function settleBaseDispatcherSalaries(
  state: CareerMissionsState,
  opts: { fromTick: number; toTick: number },
): BaseDispatcherSalarySettleResult {
  const daysCharged = Math.max(
    0,
    economyDayIndex(opts.toTick) - economyDayIndex(opts.fromTick),
  );
  const empty: BaseDispatcherSalarySettleResult = {
    debitUsd: 0,
    requestedUsd: 0,
    shortfallUsd: 0,
    daysCharged: 0,
  };
  if (daysCharged <= 0) return empty;

  const members = ensureBaseDispatchers(state).dispatchers ?? [];
  if (members.length === 0) {
    return { ...empty, daysCharged };
  }

  let requestedUsd = 0;
  for (const m of members) {
    requestedUsd += m.salaryUsdPerDay * daysCharged;
  }
  requestedUsd = money(requestedUsd);
  if (requestedUsd <= 0) return { ...empty, daysCharged };

  const debitUsd = money(Math.min(state.walletUsd, requestedUsd));
  const shortfallUsd = money(Math.max(0, requestedUsd - debitUsd));
  if (debitUsd > 0) {
    applyWalletDelta(state, {
      amountUsd: -debitUsd,
      kind: 'base_dispatcher_salary',
      atTick: opts.toTick,
      note: `${daysCharged}d · ${members.length} Base Dispatcher`,
    });
  }
  return { debitUsd, requestedUsd, shortfallUsd, daysCharged };
}

export function baseDispatcherSnapshot(
  state: CareerMissionsState,
  world?: Pick<CareerEconomyWorld, 'tick'> & { seed?: string },
  opts: { hubIcao?: string } = {},
): {
  members: Array<
    BaseDispatcherMember & {
      gradeLabel: string;
      fireSeveranceUsd: number;
      perkHint: string;
    }
  >;
  hirePoolByHub: Record<
    string,
    Array<
      BaseDispatcherCandidate & {
        gradeLabel: string;
        perkHint: string;
      }
    >
  >;
} {
  if (world) {
    refreshBaseDispatcherHirePool(state, world, {
      hubIcao: opts.hubIcao,
    });
  }
  const roster = ensureBaseDispatchers(state);
  const members = (roster.dispatchers ?? []).map((m) => ({
    ...m,
    gradeLabel: BASE_DISPATCHER_GRADE_LABEL[m.grade],
    fireSeveranceUsd: quoteBaseDispatcherFireSeveranceUsd(m),
    perkHint: baseDispatcherPerkHint(m.skillPct),
  }));
  const hirePoolByHub: Record<
    string,
    Array<
      BaseDispatcherCandidate & {
        gradeLabel: string;
        perkHint: string;
      }
    >
  > = {};
  for (const [hub, pool] of Object.entries(
    roster.dispatcherHirePoolByHub ?? {},
  )) {
    hirePoolByHub[hub] = pool.map((c) => ({
      ...c,
      gradeLabel: BASE_DISPATCHER_GRADE_LABEL[c.grade],
      perkHint: baseDispatcherPerkHint(c.skillPct),
    }));
  }
  return { members, hirePoolByHub };
}

/** Player-facing perk blurb from skill. */
export function baseDispatcherPerkHint(skillPct: number): string {
  const policy = scoutPolicyFromSkill(skillPct);
  return `Fleet scout · up to ${policy.max} · ferry −$${policy.ferryPenaltyUsdPerNm.toFixed(2)}/nm`;
}

export type BaseDispatchScoutPolicy = {
  /** manual = parked @ origin only; fleet = any parked + ferry score */
  mode: 'manual' | 'fleet';
  max: number;
  ferryPenaltyUsdPerNm: number;
  requireAtOrigin: boolean;
  skillPct: number | null;
  dispatcherId: string | null;
  dispatcherName: string | null;
};

export function scoutPolicyFromSkill(skillPct: number): {
  max: number;
  ferryPenaltyUsdPerNm: number;
} {
  const pct = Math.max(40, Math.min(99, Math.round(skillPct)));
  const t = (pct - 40) / 59;
  const max = Math.round(6 + t * 6); // 6..12
  const ferryPenaltyUsdPerNm = money(0.18 - t * 0.12); // 0.18 → 0.06
  return { max, ferryPenaltyUsdPerNm };
}

export function resolveBaseDispatchScoutPolicy(
  state: CareerMissionsState,
): BaseDispatchScoutPolicy {
  const best = bestBaseDispatcher(state);
  if (!best) {
    return {
      mode: 'manual',
      max: 3,
      ferryPenaltyUsdPerNm: 0.35,
      requireAtOrigin: true,
      skillPct: null,
      dispatcherId: null,
      dispatcherName: null,
    };
  }
  const { max, ferryPenaltyUsdPerNm } = scoutPolicyFromSkill(best.skillPct);
  return {
    mode: 'fleet',
    max,
    ferryPenaltyUsdPerNm,
    requireAtOrigin: false,
    skillPct: best.skillPct,
    dispatcherId: best.id,
    dispatcherName: best.displayName,
  };
}
