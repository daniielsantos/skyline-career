/**
 * Company crew ops — AI flies accepted/hold missions on the player's airframe.
 * Phase 4a: roster + wall-clock settle. Phase 4b: hire pool, salary, perks.
 */

import { estimateMissionBlockHours } from './career-aircraft-market.js';
import { TICKS_PER_DAY } from './career-clock.js';
import {
  assignAircraftToMission,
  findPlayerAircraft,
} from './career-fleet.js';
import { applyWalletDelta } from './career-ledger.js';
import {
  departMission,
  listActivePlayerMissions,
  settleMission,
} from './career-mission.js';
import { economyDayIndex } from './career-weather.js';
import type {
  CareerEconomyWorld,
  CareerMissionsState,
  CompanyCrewCandidate,
  CompanyCrewMember,
  CompanyCrewPerkId,
  CompanyCrewState,
  MissionIntent,
  PlayerAircraft,
} from './types/career-economy.js';

/** Fraction of mission pay charged as crew fee at dispatch. */
export const CREW_FEE_FRAC = 0.12;

/** Empty return fee as a fraction of the outbound crew fee. */
export const CREW_RETURN_FEE_FRAC = 0.5;

/** Phase 4a legacy: minimum slots with any FBO. Prefer companyCrewSlotsUnlocked. */
export const CREW_SLOTS_WITH_FBO = 1;

/** Hard cap on hired roster size (Phase 4c). */
export const CREW_SLOTS_MAX = 3;

/** Hire desk size (short pool, not a market board). */
export const CREW_HIRE_POOL_SIZE = 4;

/** Roster slots contributed by one owned FBO (T1 → 1, T2 → 2). */
export function crewSlotsFromFboTier(tier: number): number {
  return tier >= 2 ? 2 : 1;
}

export function companyCrewSlotsUnlocked(
  state: Pick<CareerMissionsState, 'playerFbos'>,
): number {
  const fbos = state.playerFbos?.fbos ?? [];
  if (fbos.length === 0) return 0;
  let sum = 0;
  for (const f of fbos) {
    sum += crewSlotsFromFboTier(f.tier);
  }
  return Math.min(CREW_SLOTS_MAX, sum);
}

/** Signing cost = this × daily salary. */
export const CREW_HIRE_SIGNING_DAYS = 2;

export const CREW_PERK_LABEL: Record<CompanyCrewPerkId, string> = {
  fuel: 'Fuel saver',
  wear: 'Gentle hands',
  on_time: 'On-time',
  value: 'Value ops',
};

export const CREW_PERK_HINT: Record<CompanyCrewPerkId, string> = {
  fuel: '−8% Jet-A on crew legs',
  wear: '−15% airframe hours on crew legs',
  on_time: '−25% late penalty on crew legs',
  value: '+8% pay on electronics freights',
};

const CREW_PERK_IDS: CompanyCrewPerkId[] = [
  'fuel',
  'wear',
  'on_time',
  'value',
];

const CREW_FIRST_NAMES = [
  'Ana',
  'Bruno',
  'Carla',
  'Diego',
  'Elena',
  'Felipe',
  'Gabi',
  'Hugo',
  'Iris',
  'Joao',
  'Kai',
  'Lina',
  'Marco',
  'Nina',
  'Omar',
  'Paula',
] as const;

const CREW_LAST_NAMES = [
  'Costa',
  'Dias',
  'Freitas',
  'Hayes',
  'Ito',
  'Keller',
  'Lopes',
  'Moura',
  'Nair',
  'Ortiz',
  'Perez',
  'Quinn',
  'Ramos',
  'Silva',
  'Torres',
  'Vega',
] as const;

/** First names that map to woman_* portrait pack. */
const CREW_FEMALE_FIRST = new Set([
  'Ana',
  'Carla',
  'Elena',
  'Gabi',
  'Iris',
  'Lina',
  'Nina',
  'Paula',
]);

/** How many man_* / woman_* assets ship in career-ui/public/crew. */
export const CREW_PORTRAIT_COUNT = 5;

export type CrewPortraitGender = 'woman' | 'man';

export function crewGenderFromDisplayName(
  displayName: string,
): CrewPortraitGender {
  const first = displayName.trim().split(/\s+/)[0] ?? '';
  return CREW_FEMALE_FIRST.has(first) ? 'woman' : 'man';
}

export function isCrewPortraitId(raw: string): boolean {
  return /^(man|woman)_[1-5]$/.test(raw.trim());
}

/** Stable portrait id from name (+ optional salt) when none is stored yet. */
export function resolveCrewPortraitId(
  displayName: string,
  opts?: { portraitId?: string | null; salt?: string },
): string {
  const existing = opts?.portraitId?.trim();
  if (existing && isCrewPortraitId(existing)) return existing;
  const gender = crewGenderFromDisplayName(displayName);
  const salt = opts?.salt?.trim() || displayName;
  let h = 0;
  for (let i = 0; i < salt.length; i++) {
    h = (h * 31 + salt.charCodeAt(i)) >>> 0;
  }
  const idx = (h % CREW_PORTRAIT_COUNT) + 1;
  return `${gender}_${idx}`;
}

function pickRandomPortraitId(
  rng: () => number,
  gender: CrewPortraitGender,
): string {
  const idx = 1 + Math.floor(rng() * CREW_PORTRAIT_COUNT);
  return `${gender}_${idx}`;
}

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function nextCrewId(tick: number, tag = 'crew'): string {
  return `${tag}_${tick}_${Math.floor(Math.random() * 1e6)}`;
}

function hashSeed(parts: Array<string | number>): number {
  let h = 2166136261;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parsePerkId(raw: unknown): CompanyCrewPerkId | undefined {
  return typeof raw === 'string' &&
    (CREW_PERK_IDS as string[]).includes(raw)
    ? (raw as CompanyCrewPerkId)
    : undefined;
}

function normalizeCandidate(raw: unknown): CompanyCrewCandidate | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as CompanyCrewCandidate;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const displayName =
    typeof row.displayName === 'string' && row.displayName.trim()
      ? row.displayName.trim().slice(0, 40)
      : '';
  const perkId = parsePerkId(row.perkId);
  const salaryUsdPerDay =
    typeof row.salaryUsdPerDay === 'number' &&
    Number.isFinite(row.salaryUsdPerDay)
      ? money(Math.max(40, row.salaryUsdPerDay))
      : 0;
  const hireUsd =
    typeof row.hireUsd === 'number' && Number.isFinite(row.hireUsd)
      ? money(Math.max(0, row.hireUsd))
      : money(salaryUsdPerDay * CREW_HIRE_SIGNING_DAYS);
  if (!id || !displayName || !perkId || salaryUsdPerDay <= 0) return null;
  return {
    id,
    displayName,
    perkId,
    salaryUsdPerDay,
    hireUsd,
    portraitId: resolveCrewPortraitId(displayName, {
      portraitId: row.portraitId,
      salt: id,
    }),
  };
}

function normalizeMember(raw: unknown): CompanyCrewMember | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as CompanyCrewMember;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const displayName =
    typeof row.displayName === 'string' && row.displayName.trim()
      ? row.displayName.trim().slice(0, 40)
      : 'Ops crew';
  const baseIcao =
    typeof row.baseIcao === 'string' ? row.baseIcao.trim().toUpperCase() : '';
  const locationIcao =
    typeof row.locationIcao === 'string'
      ? row.locationIcao.trim().toUpperCase()
      : baseIcao;
  if (!id || !baseIcao) return null;
  const status = row.status === 'airborne' ? 'airborne' : 'idle';
  const member: CompanyCrewMember = {
    id,
    displayName,
    baseIcao,
    locationIcao: locationIcao || baseIcao,
    status,
    portraitId: resolveCrewPortraitId(displayName, {
      portraitId: row.portraitId,
      salt: id,
    }),
  };
  if (typeof row.missionId === 'string' && row.missionId.trim()) {
    member.missionId = row.missionId.trim();
  }
  if (typeof row.aircraftId === 'string' && row.aircraftId.trim()) {
    member.aircraftId = row.aircraftId.trim();
  }
  if (
    typeof row.lastFeeUsd === 'number' &&
    Number.isFinite(row.lastFeeUsd) &&
    row.lastFeeUsd >= 0
  ) {
    member.lastFeeUsd = money(row.lastFeeUsd);
  }
  const perkId = parsePerkId(row.perkId);
  if (perkId) member.perkId = perkId;
  if (
    typeof row.salaryUsdPerDay === 'number' &&
    Number.isFinite(row.salaryUsdPerDay) &&
    row.salaryUsdPerDay > 0
  ) {
    member.salaryUsdPerDay = money(row.salaryUsdPerDay);
  }
  if (
    typeof row.hiredAtTick === 'number' &&
    Number.isFinite(row.hiredAtTick) &&
    row.hiredAtTick >= 0
  ) {
    member.hiredAtTick = Math.floor(row.hiredAtTick);
  }
  return member;
}

export function normalizeCompanyCrewState(raw: unknown): CompanyCrewState {
  if (!raw || typeof raw !== 'object') return { members: [] };
  const src = raw as CompanyCrewState;
  const members = Array.isArray(src.members)
    ? src.members.map(normalizeMember).filter(Boolean) as CompanyCrewMember[]
    : [];
  const hirePool = Array.isArray(src.hirePool)
    ? src.hirePool.map(normalizeCandidate).filter(Boolean) as CompanyCrewCandidate[]
    : [];
  const out: CompanyCrewState = { members };
  if (hirePool.length > 0) out.hirePool = hirePool;
  if (typeof src.hirePoolDay === 'number' && Number.isFinite(src.hirePoolDay)) {
    out.hirePoolDay = Math.floor(src.hirePoolDay);
  }
  if (typeof src.hirePoolIcao === 'string' && src.hirePoolIcao.trim()) {
    out.hirePoolIcao = src.hirePoolIcao.trim().toUpperCase();
  }
  return out;
}

/** Primary FBO ICAO used as crew home base (home hub FBO preferred). */
export function resolveCrewBaseIcao(
  state: Pick<CareerMissionsState, 'playerFbos' | 'homeHubIcao'>,
): string | null {
  const fbos = state.playerFbos?.fbos ?? [];
  if (fbos.length === 0) return null;
  const home = state.homeHubIcao?.trim().toUpperCase() || '';
  if (home) {
    const atHome = fbos.find((f) => f.icao.toUpperCase() === home);
    if (atHome) return atHome.icao.toUpperCase();
  }
  return fbos[0]!.icao.toUpperCase();
}

export function companyCrewRosterSlotsFree(state: CareerMissionsState): number {
  const unlocked = companyCrewSlotsUnlocked(state);
  const members = normalizeCompanyCrewState(state.companyCrew).members.length;
  return Math.max(0, unlocked - members);
}

function rollCandidate(
  rng: () => number,
  tick: number,
  perkBias?: CompanyCrewPerkId,
): CompanyCrewCandidate {
  const first =
    CREW_FIRST_NAMES[Math.floor(rng() * CREW_FIRST_NAMES.length)]!;
  const last = CREW_LAST_NAMES[Math.floor(rng() * CREW_LAST_NAMES.length)]!;
  const perkId =
    perkBias ?? CREW_PERK_IDS[Math.floor(rng() * CREW_PERK_IDS.length)]!;
  // Salary bands by perk (fuel/wear cheaper; on_time/value pricier).
  const baseSalary =
    perkId === 'value' || perkId === 'on_time'
      ? 110 + Math.floor(rng() * 50)
      : 70 + Math.floor(rng() * 45);
  const salaryUsdPerDay = money(baseSalary);
  const displayName = `${first} ${last}`;
  return {
    id: nextCrewId(tick, 'cand'),
    displayName,
    perkId,
    salaryUsdPerDay,
    hireUsd: money(salaryUsdPerDay * CREW_HIRE_SIGNING_DAYS),
    portraitId: pickRandomPortraitId(
      rng,
      crewGenderFromDisplayName(displayName),
    ),
  };
}

/**
 * Roll / refresh the short hire desk at the crew base FBO.
 * Regenerates when economy day or base ICAO changes (or force).
 */
export function refreshCrewHirePool(
  state: CareerMissionsState,
  world: Pick<CareerEconomyWorld, 'tick'> & { seed?: string },
  opts: { force?: boolean } = {},
): CompanyCrewState {
  const roster = ensureCompanyCrew(state);
  const baseIcao = resolveCrewBaseIcao(state);
  if (!baseIcao || companyCrewSlotsUnlocked(state) <= 0) {
    roster.hirePool = [];
    roster.hirePoolDay = undefined;
    roster.hirePoolIcao = undefined;
    state.companyCrew = roster;
    return roster;
  }

  const day = economyDayIndex(world.tick);
  const sameDay = roster.hirePoolDay === day;
  const sameIcao = roster.hirePoolIcao === baseIcao;
  const hasPool = (roster.hirePool?.length ?? 0) > 0;
  if (!opts.force && sameDay && sameIcao && hasPool) {
    return roster;
  }

  const rng = mulberry32(
    hashSeed([world.seed ?? 'career', baseIcao, day, 'hire-pool']),
  );
  // Guarantee each perk appears at least once when pool ≥ 4.
  const forced = [...CREW_PERK_IDS];
  for (let i = forced.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [forced[i], forced[j]] = [forced[j]!, forced[i]!];
  }
  const pool: CompanyCrewCandidate[] = [];
  for (let i = 0; i < CREW_HIRE_POOL_SIZE; i++) {
    pool.push(rollCandidate(rng, world.tick, forced[i]));
  }
  roster.hirePool = pool;
  roster.hirePoolDay = day;
  roster.hirePoolIcao = baseIcao;
  state.companyCrew = roster;
  return roster;
}

/**
 * Ensure roster metadata; do **not** auto-hire stubs (Phase 4b).
 * Legacy stub members without salary/perk keep working with defaults.
 * Never silently drop hired members — capacity only gates new hires.
 */
export function ensureCompanyCrew(
  state: CareerMissionsState,
  _opts: { tick?: number } = {},
): CompanyCrewState {
  const slots = companyCrewSlotsUnlocked(state);
  const baseIcao = resolveCrewBaseIcao(state);
  const current = normalizeCompanyCrewState(state.companyCrew);

  if (slots <= 0 || !baseIcao) {
    // Keep hired roster even if FBO/slots briefly unavailable during a load/merge.
    state.companyCrew = {
      ...current,
      hirePool: [],
      hirePoolDay: undefined,
      hirePoolIcao: undefined,
    };
    return state.companyCrew;
  }

  const members = current.members.map((m) => {
    const next = { ...m, baseIcao };
    if (next.status === 'idle') {
      next.locationIcao = baseIcao;
      next.missionId = undefined;
      next.aircraftId = undefined;
    }
    // Legacy stubs from 4a: assign mild defaults so salary/perks work.
    if (!next.perkId) next.perkId = 'fuel';
    if (!(typeof next.salaryUsdPerDay === 'number' && next.salaryUsdPerDay > 0)) {
      next.salaryUsdPerDay = 85;
    }
    return next;
  });

  state.companyCrew = {
    ...current,
    members,
  };
  return state.companyCrew;
}

/** Align roster with live crew-operated missions (orphans / mid-flight). */
export function reconcileCompanyCrew(
  state: CareerMissionsState,
): CompanyCrewState {
  const roster = ensureCompanyCrew(state);
  const airborneMissions = listCrewInFlightMissions(state);
  const claimed = new Set<string>();

  for (const mission of airborneMissions) {
    let member =
      (mission.crewMemberId
        ? roster.members.find((m) => m.id === mission.crewMemberId)
        : undefined) ??
      roster.members.find((m) => m.missionId === mission.id) ??
      roster.members.find((m) => m.status === 'idle' && !claimed.has(m.id));
    if (!member) continue;
    claimed.add(member.id);
    member.status = 'airborne';
    member.missionId = mission.id;
    member.aircraftId = mission.aircraftId;
    member.locationIcao = mission.originIcao.toUpperCase();
    if (
      typeof mission.crewFeeUsd === 'number' &&
      Number.isFinite(mission.crewFeeUsd)
    ) {
      member.lastFeeUsd = money(mission.crewFeeUsd);
    }
  }

  for (const member of roster.members) {
    if (claimed.has(member.id)) continue;
    if (member.status === 'airborne' || member.missionId) {
      member.status = 'idle';
      member.missionId = undefined;
      member.aircraftId = undefined;
      member.locationIcao = member.baseIcao;
    }
  }

  state.companyCrew = roster;
  return roster;
}

export function listCrewInFlightMissions(
  state: Pick<CareerMissionsState, 'missions'>,
): MissionIntent[] {
  return (state.missions ?? []).filter(
    (m) => m.crewOperated === true && m.status === 'in_flight',
  );
}

export function companyCrewSlotsInUse(
  state: Pick<CareerMissionsState, 'missions'>,
): number {
  return listCrewInFlightMissions(state).length;
}

export function quoteCrewDispatchFeeUsd(
  mission: Pick<MissionIntent, 'payUsd'>,
): number {
  const pay =
    typeof mission.payUsd === 'number' && Number.isFinite(mission.payUsd)
      ? Math.max(0, mission.payUsd)
      : 0;
  return money(Math.max(50, Math.round(pay * CREW_FEE_FRAC)));
}

/** Deadhead return fee (~50% of outbound crew fee, min $50). */
export function quoteCrewReturnFeeUsd(
  outbound: Pick<MissionIntent, 'payUsd' | 'crewFeeUsd'>,
): number {
  const outboundFee =
    typeof outbound.crewFeeUsd === 'number' &&
    Number.isFinite(outbound.crewFeeUsd) &&
    outbound.crewFeeUsd > 0
      ? outbound.crewFeeUsd
      : quoteCrewDispatchFeeUsd(outbound);
  return money(
    Math.max(50, Math.round(outboundFee * CREW_RETURN_FEE_FRAC)),
  );
}

export function quoteCrewRoundTripFeesUsd(
  mission: Pick<MissionIntent, 'payUsd'>,
): {
  outboundFeeUsd: number;
  returnFeeUsd: number;
  totalFeeUsd: number;
} {
  const outboundFeeUsd = quoteCrewDispatchFeeUsd(mission);
  const returnFeeUsd = quoteCrewReturnFeeUsd({
    payUsd: mission.payUsd,
    crewFeeUsd: outboundFeeUsd,
  });
  return {
    outboundFeeUsd,
    returnFeeUsd,
    totalFeeUsd: money(outboundFeeUsd + returnFeeUsd),
  };
}

export function hireCrewCandidate(
  state: CareerMissionsState,
  world: Pick<CareerEconomyWorld, 'tick'> & { seed?: string },
  candidateId: string,
): { member: CompanyCrewMember; debitUsd: number } {
  refreshCrewHirePool(state, world);
  const roster = ensureCompanyCrew(state);
  if (companyCrewRosterSlotsFree(state) <= 0) {
    throw new Error('No free crew slots — fire someone or upgrade FBO tiers');
  }
  const pool = roster.hirePool ?? [];
  const idx = pool.findIndex((c) => c.id === candidateId);
  if (idx < 0) throw new Error(`Unknown hire candidate ${candidateId}`);
  const candidate = pool[idx]!;
  if (state.walletUsd < candidate.hireUsd) {
    throw new Error(
      `Hire costs $${candidate.hireUsd.toLocaleString()} but wallet has $${state.walletUsd.toLocaleString()}`,
    );
  }

  const member: CompanyCrewMember = {
    id: nextCrewId(world.tick),
    displayName: candidate.displayName,
    baseIcao: resolveCrewBaseIcao(state)!,
    locationIcao: resolveCrewBaseIcao(state)!,
    status: 'idle',
    perkId: candidate.perkId,
    salaryUsdPerDay: candidate.salaryUsdPerDay,
    hiredAtTick: world.tick,
    portraitId: resolveCrewPortraitId(candidate.displayName, {
      portraitId: candidate.portraitId,
      salt: candidate.id,
    }),
  };

  applyWalletDelta(state, {
    amountUsd: -candidate.hireUsd,
    kind: 'crew_hire',
    atTick: world.tick,
    icao: member.baseIcao,
    note: `Hire ${member.displayName} · ${CREW_PERK_LABEL[member.perkId!]}`,
  });

  roster.members.push(member);
  roster.hirePool = pool.filter((c) => c.id !== candidateId);
  state.companyCrew = roster;
  return { member, debitUsd: candidate.hireUsd };
}

export function fireCrewMember(
  state: CareerMissionsState,
  memberId: string,
): CompanyCrewMember {
  const roster = reconcileCompanyCrew(state);
  const idx = roster.members.findIndex((m) => m.id === memberId);
  if (idx < 0) throw new Error(`Unknown crew member ${memberId}`);
  const member = roster.members[idx]!;
  if (member.status === 'airborne') {
    throw new Error(`Cannot fire ${member.displayName} while airborne`);
  }
  roster.members.splice(idx, 1);
  state.companyCrew = roster;
  return member;
}

function pickIdleCrewMember(
  state: CareerMissionsState,
  crewMemberId?: string,
): CompanyCrewMember {
  const roster = reconcileCompanyCrew(state);
  if (roster.members.length === 0) {
    throw new Error('No hired crew — hire someone in Hangar → Crew');
  }
  const wanted = crewMemberId?.trim();
  if (wanted) {
    const member = roster.members.find((m) => m.id === wanted);
    if (!member) throw new Error(`Unknown crew member ${wanted}`);
    if (member.status !== 'idle') {
      throw new Error(`${member.displayName} is airborne — pick idle crew`);
    }
    return member;
  }
  const idle = roster.members.find((m) => m.status === 'idle');
  if (!idle) {
    throw new Error('No idle company crew — wait for arrival');
  }
  return idle;
}

/**
 * Remember which idle crew should fly an Accepted/Dispatched leg (before Crew fly).
 * Does not charge a fee or mark anyone airborne.
 */
export function assignCrewMemberToMission(
  state: CareerMissionsState,
  opts: { missionId: string; crewMemberId: string },
): MissionIntent {
  const idx = state.missions.findIndex((m) => m.id === opts.missionId);
  if (idx < 0) throw new Error(`Unknown mission ${opts.missionId}`);
  const mission = state.missions[idx]!;
  if (mission.status !== 'accepted' && mission.status !== 'dispatched') {
    throw new Error(
      `Cannot assign crew on mission in status=${mission.status}`,
    );
  }
  if (mission.crewOperated) {
    throw new Error('Mission is already assigned to company crew');
  }
  const member = pickIdleCrewMember(state, opts.crewMemberId);
  const next: MissionIntent = {
    ...mission,
    crewMemberId: member.id,
  };
  state.missions[idx] = next;
  return next;
}

export function releaseCompanyCrewFromMission(
  state: CareerMissionsState,
  missionId: string,
): void {
  const roster = ensureCompanyCrew(state);
  for (const member of roster.members) {
    if (member.missionId === missionId) {
      member.status = 'idle';
      member.missionId = undefined;
      member.aircraftId = undefined;
      member.locationIcao = member.baseIcao;
    }
  }
  state.companyCrew = roster;
}

export type CrewSalarySettleResult = {
  debitUsd: number;
  requestedUsd: number;
  shortfallUsd: number;
  daysCharged: number;
};

/** Daily salaries for hired roster members. */
export function settleCrewSalaries(
  state: CareerMissionsState,
  opts: { fromTick: number; toTick: number },
): CrewSalarySettleResult {
  const daysCharged = Math.max(
    0,
    economyDayIndex(opts.toTick) - economyDayIndex(opts.fromTick),
  );
  const empty: CrewSalarySettleResult = {
    debitUsd: 0,
    requestedUsd: 0,
    shortfallUsd: 0,
    daysCharged: 0,
  };
  if (daysCharged <= 0) return empty;

  const roster = ensureCompanyCrew(state);
  if (roster.members.length === 0) {
    return { ...empty, daysCharged };
  }

  let requestedUsd = 0;
  for (const m of roster.members) {
    const day = m.salaryUsdPerDay ?? 85;
    requestedUsd += day * daysCharged;
  }
  requestedUsd = money(requestedUsd);
  if (requestedUsd <= 0) return { ...empty, daysCharged };

  const debitUsd = money(Math.min(state.walletUsd, requestedUsd));
  const shortfallUsd = money(Math.max(0, requestedUsd - debitUsd));
  if (debitUsd > 0) {
    applyWalletDelta(state, {
      amountUsd: -debitUsd,
      kind: 'crew_salary',
      atTick: opts.toTick,
      note: `${daysCharged}d · ${roster.members.length} crew`,
    });
  }
  return { debitUsd, requestedUsd, shortfallUsd, daysCharged };
}

/**
 * Tick / catch-up: refresh hire desk + charge salaries.
 */
export function settleCrewDailyOps(
  state: CareerMissionsState,
  world: Pick<CareerEconomyWorld, 'tick'> & { seed?: string },
  opts: { fromTick: number; toTick: number },
): { salary: CrewSalarySettleResult } {
  refreshCrewHirePool(state, world);
  const salary = settleCrewSalaries(state, opts);
  return { salary };
}

export function companyCrewSnapshot(
  state: CareerMissionsState,
  world?: Pick<CareerEconomyWorld, 'tick'> & { seed?: string },
): {
  slotsUnlocked: number;
  slotsInUse: number;
  slotsFree: number;
  rosterSlotsFree: number;
  feeFrac: number;
  baseIcao: string | null;
  members: Array<
    CompanyCrewMember & {
      perkLabel?: string;
      perkHint?: string;
      arrivesAtMs?: number;
      originIcao?: string;
      destIcao?: string;
      expectedRouteMs?: number;
      airborneAtMs?: number;
    }
  >;
  hirePool: Array<
    CompanyCrewCandidate & { perkLabel: string; perkHint: string }
  >;
  hirePoolDay?: number;
  slotsMax: number;
  inFlight: Array<{
    missionId: string;
    originIcao: string;
    destIcao: string;
    aircraftId?: string;
    crewMemberId?: string;
    airborneAtMs?: number;
    expectedRouteMs?: number;
    arrivesAtMs?: number;
    crewFeeUsd?: number;
    crewDeadhead?: boolean;
    crewRoundTrip?: boolean;
    crewReturnIcao?: string;
  }>;
} {
  if (world) refreshCrewHirePool(state, world);
  const roster = reconcileCompanyCrew(state);
  const slotsUnlocked = companyCrewSlotsUnlocked(state);
  const inFlight = listCrewInFlightMissions(state).map((m) => {
    const arrivesAtMs =
      typeof m.airborneAtMs === 'number' &&
      Number.isFinite(m.airborneAtMs) &&
      typeof m.expectedRouteMs === 'number' &&
      Number.isFinite(m.expectedRouteMs) &&
      m.expectedRouteMs > 0
        ? m.airborneAtMs + m.expectedRouteMs
        : undefined;
    return {
      missionId: m.id,
      originIcao: m.originIcao,
      destIcao: m.destIcao,
      aircraftId: m.aircraftId,
      crewMemberId: m.crewMemberId,
      airborneAtMs: m.airborneAtMs,
      expectedRouteMs: m.expectedRouteMs,
      arrivesAtMs,
      crewFeeUsd: m.crewFeeUsd,
      crewDeadhead: m.crewDeadhead === true,
      crewRoundTrip: m.crewRoundTrip === true,
      crewReturnIcao: m.crewReturnIcao,
    };
  });
  const missionById = new Map(
    listCrewInFlightMissions(state).map((m) => [m.id, m]),
  );
  const members = roster.members.map((m) => {
    const mission = m.missionId ? missionById.get(m.missionId) : undefined;
    const arrivesAtMs =
      mission &&
      typeof mission.airborneAtMs === 'number' &&
      typeof mission.expectedRouteMs === 'number' &&
      mission.expectedRouteMs > 0
        ? mission.airborneAtMs + mission.expectedRouteMs
        : undefined;
    return {
      ...m,
      perkLabel: m.perkId ? CREW_PERK_LABEL[m.perkId] : undefined,
      perkHint: m.perkId ? CREW_PERK_HINT[m.perkId] : undefined,
      originIcao: mission?.originIcao,
      destIcao: mission?.destIcao,
      airborneAtMs: mission?.airborneAtMs,
      expectedRouteMs: mission?.expectedRouteMs,
      arrivesAtMs,
    };
  });
  const hirePool = (roster.hirePool ?? []).map((c) => ({
    ...c,
    perkLabel: CREW_PERK_LABEL[c.perkId],
    perkHint: CREW_PERK_HINT[c.perkId],
  }));
  const slotsInUse = members.length;
  const idleCount = members.filter((m) => m.status === 'idle').length;
  return {
    slotsUnlocked,
    slotsInUse,
    /** Idle crew available to dispatch (not airborne). */
    slotsFree: idleCount,
    rosterSlotsFree: companyCrewRosterSlotsFree(state),
    feeFrac: CREW_FEE_FRAC,
    baseIcao: resolveCrewBaseIcao(state),
    members,
    hirePool,
    hirePoolDay: roster.hirePoolDay,
    slotsMax: CREW_SLOTS_MAX,
    inFlight,
  };
}

function pickParkedAircraftAtOrigin(
  state: CareerMissionsState,
  originIcao: string,
  aircraftClassId: string,
  aircraftId?: string,
): PlayerAircraft {
  const origin = originIcao.trim().toUpperCase();
  if (aircraftId?.trim()) {
    const acf = findPlayerAircraft(state, aircraftId.trim());
    if (!acf) throw new Error(`Unknown aircraft ${aircraftId}`);
    if (acf.aircraftClassId !== aircraftClassId) {
      throw new Error(
        `Aircraft ${acf.id} is ${acf.aircraftClassId}, mission needs ${aircraftClassId}`,
      );
    }
    return acf;
  }
  const parked = state.fleet.filter(
    (a) =>
      a.status === 'parked' &&
      a.locationIcao.toUpperCase() === origin &&
      a.aircraftClassId === aircraftClassId &&
      !a.leaseOverdue,
  );
  if (parked.length === 0) {
    throw new Error(
      `No parked ${aircraftClassId} at ${origin} for crew dispatch`,
    );
  }
  if (parked.length > 1) {
    throw new Error(
      `Multiple parked aircraft at ${origin} — pass aircraftId`,
    );
  }
  return parked[0]!;
}

export type DispatchCrewMissionResult = {
  mission: MissionIntent;
  crewFeeUsd: number;
  /** Quoted empty-return fee (charged when return leg starts). */
  returnFeeUsd: number;
  totalRoundTripFeeUsd: number;
  fuelDebitUsd: number;
  fuelPerkCreditUsd: number;
  aircraft: PlayerAircraft;
  crewMember: CompanyCrewMember;
};

/**
 * Assign a parked player airframe and depart under company crew (wall-clock).
 * Does not require the player pilot at origin.
 */
export function dispatchCrewMission(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: {
    missionId: string;
    aircraftId?: string;
    /** Prefer a specific idle roster member; otherwise first idle. */
    crewMemberId?: string;
    nowMs?: number;
  },
): DispatchCrewMissionResult {
  const slotsUnlocked = companyCrewSlotsUnlocked(state);
  if (slotsUnlocked <= 0) {
    throw new Error('Company crew requires an owned FBO');
  }
  ensureCompanyCrew(state, { tick: world.tick });
  if (companyCrewSlotsInUse(state) >= slotsUnlocked) {
    throw new Error(
      `All ${slotsUnlocked} crew slot(s) are in use — wait for arrival`,
    );
  }

  const idx = state.missions.findIndex((m) => m.id === opts.missionId);
  if (idx < 0) throw new Error(`Unknown mission ${opts.missionId}`);
  let mission = state.missions[idx]!;
  if (mission.status !== 'accepted' && mission.status !== 'dispatched') {
    throw new Error(
      `Cannot crew-dispatch mission in status=${mission.status}`,
    );
  }

  // Allow sister Accepted legs (e.g. after Split) and other crew airborne.
  // Only block when the player is personally flying Watch on another mission.
  const playerWatch = listActivePlayerMissions(state.missions).find(
    (m) =>
      m.id !== mission.id &&
      m.status === 'in_flight' &&
      m.crewOperated !== true,
  );
  if (playerWatch) {
    throw new Error(
      `Finish or cancel your Watch flight ${playerWatch.id} before crew dispatch`,
    );
  }

  const feeUsd = quoteCrewDispatchFeeUsd(mission);
  const returnFeeUsd = quoteCrewReturnFeeUsd({
    payUsd: mission.payUsd,
    crewFeeUsd: feeUsd,
  });
  if (state.walletUsd < feeUsd) {
    throw new Error(
      `Crew fee $${feeUsd.toLocaleString()} exceeds wallet $${state.walletUsd.toLocaleString()}`,
    );
  }

  const crewMember = pickIdleCrewMember(state, opts.crewMemberId);

  let aircraft: PlayerAircraft;
  if (
    mission.aircraftId &&
    findPlayerAircraft(state, mission.aircraftId)?.assignedMissionId ===
      mission.id
  ) {
    aircraft = findPlayerAircraft(state, mission.aircraftId)!;
    if (aircraft.locationIcao.toUpperCase() !== mission.originIcao.toUpperCase()) {
      throw new Error(
        `Aircraft ${aircraft.id} is at ${aircraft.locationIcao}, not ${mission.originIcao}`,
      );
    }
  } else {
    aircraft = pickParkedAircraftAtOrigin(
      state,
      mission.originIcao,
      mission.aircraftClassId,
      opts.aircraftId ?? mission.aircraftId,
    );
    assignAircraftToMission(
      state,
      aircraft.id,
      mission.id,
      mission.originIcao,
      { requirePilotAtOrigin: false },
    );
  }

  mission = {
    ...mission,
    aircraftId: aircraft.id,
    airframeTypeId: aircraft.airframeTypeId ?? mission.airframeTypeId,
  };

  const nowMs = opts.nowMs ?? Date.now();
  const blockHours = estimateMissionBlockHours(
    world,
    mission.originIcao,
    mission.destIcao,
    mission.aircraftClassId,
  );
  const expectedRouteMs = Math.max(1, Math.round(blockHours * 3_600_000));

  const departed = departMission(world, mission, {
    fleet: state,
    nowMs,
    expectedRouteMs,
  });

  const next: MissionIntent = {
    ...departed.mission,
    crewOperated: true,
    crewFeeUsd: feeUsd,
    crewMemberId: crewMember.id,
    crewRoundTrip: true,
    crewReturnIcao: departed.mission.originIcao.toUpperCase(),
  };
  state.missions[idx] = next;

  crewMember.status = 'airborne';
  crewMember.missionId = next.id;
  crewMember.aircraftId = aircraft.id;
  crewMember.locationIcao = next.originIcao.toUpperCase();
  crewMember.lastFeeUsd = feeUsd;

  applyWalletDelta(state, {
    amountUsd: -feeUsd,
    kind: 'crew_fee',
    atTick: world.tick,
    missionId: next.id,
    aircraftId: aircraft.id,
    icao: next.originIcao,
    note: `${crewMember.displayName} · ${next.originIcao}→${next.destIcao}`,
  });

  let fuelDebitUsd = departed.fuelDebitUsd;
  let fuelPerkCreditUsd = 0;
  if (fuelDebitUsd > 0) {
    applyWalletDelta(state, {
      amountUsd: -fuelDebitUsd,
      kind: 'fuel',
      atTick: world.tick,
      missionId: next.id,
      aircraftId: aircraft.id,
      icao: next.originIcao,
      note: `Crew fuel · ${next.originIcao}→${next.destIcao}`,
    });
    if (crewMember.perkId === 'fuel') {
      fuelPerkCreditUsd = money(fuelDebitUsd * 0.08);
      if (fuelPerkCreditUsd > 0) {
        applyWalletDelta(state, {
          amountUsd: fuelPerkCreditUsd,
          kind: 'fuel',
          atTick: world.tick,
          missionId: next.id,
          aircraftId: aircraft.id,
          icao: next.originIcao,
          note: `Fuel perk · ${crewMember.displayName}`,
        });
        fuelDebitUsd = money(fuelDebitUsd - fuelPerkCreditUsd);
      }
    }
  }

  return {
    mission: next,
    crewFeeUsd: feeUsd,
    returnFeeUsd,
    totalRoundTripFeeUsd: money(feeUsd + returnFeeUsd),
    fuelDebitUsd,
    fuelPerkCreditUsd,
    aircraft,
    crewMember,
  };
}

export type SettleCrewOpsResult = {
  settled: string[];
  /** Outbound legs that spawned an empty return. */
  returnsStarted: Array<{
    outboundMissionId: string;
    returnMissionId: string;
    returnIcao: string;
    returnFeeUsd: number;
  }>;
  payoutUsd: number;
  fuelDebitUsd: number;
};

function startCrewDeadheadReturn(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  outbound: MissionIntent,
  opts: {
    nowMs: number;
    crewMember?: CompanyCrewMember;
  },
): {
  returnMission: MissionIntent;
  returnFeeUsd: number;
  fuelDebitUsd: number;
} | null {
  const returnIcao = (
    outbound.crewReturnIcao ?? outbound.originIcao
  ).toUpperCase();
  const fromIcao = outbound.destIcao.toUpperCase();
  if (!returnIcao || returnIcao === fromIcao) return null;
  if (!outbound.aircraftId) return null;

  const aircraft = findPlayerAircraft(state, outbound.aircraftId);
  if (!aircraft) return null;

  const returnFeeUsd = quoteCrewReturnFeeUsd(outbound);
  const blockHours = estimateMissionBlockHours(
    world,
    fromIcao,
    returnIcao,
    aircraft.aircraftClassId,
  );
  const expectedRouteMs = Math.max(1, Math.round(blockHours * 3_600_000));
  const returnId = `msn_crew_rtn_${outbound.id}`;

  const draft: MissionIntent = {
    id: returnId,
    lots: [],
    shipmentLotId: `deadhead_${outbound.id}`,
    commodityId: 'general',
    originIcao: fromIcao,
    destIcao: returnIcao,
    cargoKg: 0,
    pax: 0,
    aircraftClassId: aircraft.aircraftClassId,
    airframeTypeId: aircraft.airframeTypeId ?? outbound.airframeTypeId,
    rolesPackRelPath: outbound.rolesPackRelPath,
    deadlineTick: world.tick + TICKS_PER_DAY * 2,
    payUsd: 0,
    urgency: 'normal',
    reason: `Crew return · ${fromIcao}→${returnIcao}`,
    status: 'accepted',
    acceptedAtTick: world.tick,
    aircraftId: aircraft.id,
    crewOperated: true,
    crewDeadhead: true,
    crewRoundTrip: true,
    crewOutboundMissionId: outbound.id,
    crewReturnIcao: returnIcao,
    crewMemberId: opts.crewMember?.id ?? outbound.crewMemberId,
    crewFeeUsd: returnFeeUsd,
  };

  // Aircraft is parked at outbound dest after settle — reassign for return.
  aircraft.status = 'parked';
  aircraft.assignedMissionId = undefined;
  aircraft.locationIcao = fromIcao;
  assignAircraftToMission(state, aircraft.id, returnId, fromIcao, {
    requirePilotAtOrigin: false,
  });

  const departed = departMission(world, draft, {
    fleet: state,
    nowMs: opts.nowMs,
    expectedRouteMs,
  });

  applyWalletDelta(state, {
    amountUsd: -returnFeeUsd,
    kind: 'crew_fee',
    atTick: world.tick,
    missionId: departed.mission.id,
    aircraftId: aircraft.id,
    icao: fromIcao,
    note: `Crew return · ${fromIcao}→${returnIcao}`,
  });

  let fuelDebitUsd = departed.fuelDebitUsd;
  if (fuelDebitUsd > 0) {
    applyWalletDelta(state, {
      amountUsd: -fuelDebitUsd,
      kind: 'fuel',
      atTick: world.tick,
      missionId: departed.mission.id,
      aircraftId: aircraft.id,
      icao: fromIcao,
      note: `Crew return fuel · ${fromIcao}→${returnIcao}`,
    });
    if (opts.crewMember?.perkId === 'fuel') {
      const perkCredit = money(fuelDebitUsd * 0.08);
      if (perkCredit > 0) {
        applyWalletDelta(state, {
          amountUsd: perkCredit,
          kind: 'fuel',
          atTick: world.tick,
          missionId: departed.mission.id,
          aircraftId: aircraft.id,
          icao: fromIcao,
          note: `Fuel perk · ${opts.crewMember.displayName}`,
        });
        fuelDebitUsd = money(fuelDebitUsd - perkCredit);
      }
    }
  }

  state.missions.push(departed.mission);

  if (opts.crewMember) {
    opts.crewMember.status = 'airborne';
    opts.crewMember.missionId = departed.mission.id;
    opts.crewMember.aircraftId = aircraft.id;
    opts.crewMember.locationIcao = fromIcao;
    opts.crewMember.lastFeeUsd = returnFeeUsd;
  }

  return {
    returnMission: departed.mission,
    returnFeeUsd,
    fuelDebitUsd,
  };
}

/**
 * Settle crew legs whose wall-clock ETA has elapsed (full planned route).
 * Outbound round-trip legs spawn an empty return; deadheads finalize at base.
 */
export function settleCrewOpsDue(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  nowMs = Date.now(),
): SettleCrewOpsResult {
  const settled: string[] = [];
  const returnsStarted: SettleCrewOpsResult['returnsStarted'] = [];
  let payoutUsd = 0;
  let fuelDebitUsd = 0;

  // Snapshot ids — return legs appended mid-loop must not settle in the same call.
  const dueIds = state.missions
    .filter((m) => {
      if (m.crewOperated !== true || m.status !== 'in_flight') return false;
      const airborneAtMs = m.airborneAtMs;
      const expectedRouteMs = m.expectedRouteMs;
      if (
        typeof airborneAtMs !== 'number' ||
        !Number.isFinite(airborneAtMs) ||
        typeof expectedRouteMs !== 'number' ||
        !Number.isFinite(expectedRouteMs) ||
        expectedRouteMs <= 0
      ) {
        return false;
      }
      return nowMs >= airborneAtMs + expectedRouteMs;
    })
    .map((m) => m.id);

  for (const missionId of dueIds) {
    const idx = state.missions.findIndex((m) => m.id === missionId);
    if (idx < 0) continue;
    const mission = state.missions[idx]!;
    if (mission.crewOperated !== true || mission.status !== 'in_flight') {
      continue;
    }
    const airborneAtMs = mission.airborneAtMs!;
    const expectedRouteMs = mission.expectedRouteMs!;
    const arrivesAtMs = airborneAtMs + expectedRouteMs;

    const crewMember =
      (mission.crewMemberId
        ? state.companyCrew?.members?.find((m) => m.id === mission.crewMemberId)
        : undefined) ??
      state.companyCrew?.members?.find((m) => m.missionId === mission.id);

    const hoursMult = crewMember?.perkId === 'wear' ? 0.85 : 1;

    const result = settleMission(world, mission, {
      fleet: state,
      nowMs,
      airborneEndedAtMs: arrivesAtMs,
      skipMinAirborneGate: true,
      hoursMult,
    });

    let walletCredit = result.walletCreditUsd;
    let settledMission = result.mission;

    if (!mission.crewDeadhead) {
      // On-time perk: rebate part of late penalty.
      if (
        crewMember?.perkId === 'on_time' &&
        typeof settledMission.penaltyUsd === 'number' &&
        settledMission.penaltyUsd > 0
      ) {
        const rebate = money(settledMission.penaltyUsd * 0.25);
        if (rebate > 0) {
          walletCredit = money(walletCredit + rebate);
          settledMission = {
            ...settledMission,
            penaltyUsd: money(settledMission.penaltyUsd - rebate),
            payoutUsd: money((settledMission.payoutUsd ?? 0) + rebate),
          };
        }
      }

      // Value perk: +8% on electronics freight line pay.
      if (crewMember?.perkId === 'value') {
        const electronicsPay = (settledMission.lots ?? [])
          .filter((l) => l.commodityId === 'electronics')
          .reduce((s, l) => s + l.payUsd, 0);
        const valueBonus = money(electronicsPay * 0.08);
        if (valueBonus > 0) {
          walletCredit = money(walletCredit + valueBonus);
          settledMission = {
            ...settledMission,
            payoutUsd: money((settledMission.payoutUsd ?? 0) + valueBonus),
          };
        }
      }
    }

    state.missions[idx] = settledMission;
    settled.push(settledMission.id);
    payoutUsd += walletCredit;
    fuelDebitUsd += result.fuelDebitUsd;

    if (walletCredit > 0) {
      applyWalletDelta(state, {
        amountUsd: walletCredit,
        kind: 'freight_payout',
        atTick: world.tick,
        missionId: settledMission.id,
        icao: settledMission.destIcao,
        note: `Crew · ${settledMission.originIcao}→${settledMission.destIcao}`,
      });
    }
    if (result.fuelDebitUsd > 0) {
      applyWalletDelta(state, {
        amountUsd: -result.fuelDebitUsd,
        kind: 'fuel',
        atTick: world.tick,
        missionId: settledMission.id,
        icao: settledMission.destIcao,
        note: mission.crewDeadhead
          ? 'crew return settlement fuel'
          : 'crew settlement fuel',
      });
    }

    const wantsReturn =
      settledMission.crewRoundTrip === true &&
      settledMission.crewDeadhead !== true &&
      Boolean(settledMission.crewReturnIcao ?? settledMission.originIcao);

    if (wantsReturn) {
      const started = startCrewDeadheadReturn(state, world, settledMission, {
        nowMs: arrivesAtMs,
        crewMember: crewMember ?? undefined,
      });
      if (started) {
        returnsStarted.push({
          outboundMissionId: settledMission.id,
          returnMissionId: started.returnMission.id,
          returnIcao: started.returnMission.destIcao,
          returnFeeUsd: started.returnFeeUsd,
        });
        fuelDebitUsd += started.fuelDebitUsd;
      } else {
        releaseCompanyCrewFromMission(state, settledMission.id);
      }
    } else {
      releaseCompanyCrewFromMission(state, settledMission.id);
    }
  }

  return {
    settled,
    returnsStarted,
    payoutUsd: money(payoutUsd),
    fuelDebitUsd: money(fuelDebitUsd),
  };
}
