/**
 * Ground staff at player warehouses — hire / salary / logistics + yard perks.
 * Never dispatches aircraft (unlike companyCrew).
 */

import { resolveCrewPortraitId } from './career-crew.js';
import { applyWalletDelta } from './career-ledger.js';
import { ensurePlayerWarehouses } from './career-warehouse-stock.js';
import { economyDayIndex } from './career-weather.js';
import type {
  CareerEconomyWorld,
  CareerMissionsState,
  GroundStaffCandidate,
  GroundStaffGrade,
  GroundStaffMember,
  GroundStaffPerkId,
  GroundStaffState,
  PlayerWarehouse,
} from './types/career-economy.js';

/** Signing cost = this × daily salary. */
export const GROUND_STAFF_HIRE_SIGNING_DAYS = 7;

/**
 * One-time severance when firing = this × daily salary.
 * Closes hire→buff→fire same-day abuse (procurement / demand desk / etc.).
 */
export const GROUND_STAFF_FIRE_SEVERANCE_DAYS = 5;

/** Candidates shown at one hub hire desk. */
export const GROUND_STAFF_HIRE_POOL_SIZE = 3;

/** Mid-solid defaults (legacy migrate + tests). */
export const GROUND_STAFF_LOGISTICS_MULT = 0.55;
export const GROUND_STAFF_YARD_HOLD_MULT = 0.85;

/** skillPct band endpoints for effect curves. */
export const GROUND_STAFF_SKILL_MIN = 40;
export const GROUND_STAFF_SKILL_MAX = 99;
export const GROUND_STAFF_SOLID_MID_PCT = 82;

export const GROUND_STAFF_PERK_LABEL: Record<GroundStaffPerkId, string> = {
  logistics: 'Logistics',
  yard: 'Yard boss',
  procurement: 'Procurement',
  demand_desk: 'Demand desk',
  wh_ops: 'WH ops',
};

export const GROUND_STAFF_GRADE_LABEL: Record<GroundStaffGrade, string> = {
  ace: 'Ace',
  solid: 'Solid',
  capable: 'Capable',
  green: 'Green',
};

/** Static fallbacks when effectMult unknown (UI / docs). */
export const GROUND_STAFF_PERK_HINT: Record<GroundStaffPerkId, string> = {
  logistics: 'Transfer −45% port→WH',
  yard: '−15% yard hold at this hub',
  procurement: 'Port price −3%',
  demand_desk: 'Demand pay +4%',
  wh_ops: 'Upgrade −7% · shipped +5%',
};

/** Hire desk rolls all ground perks (no duplicate already hired at free WH). */
const GROUND_STAFF_V1_PERKS: GroundStaffPerkId[] = [
  'logistics',
  'yard',
  'procurement',
  'demand_desk',
  'wh_ops',
];

const GRADE_BANDS: Record<GroundStaffGrade, { min: number; max: number }> = {
  ace: { min: 90, max: 99 },
  solid: { min: 75, max: 89 },
  capable: { min: 55, max: 74 },
  green: { min: 40, max: 54 },
};

/** Cumulative weights: ace 8%, solid 32%, capable 40%, green 20%. */
const GRADE_WEIGHTS: Array<{ grade: GroundStaffGrade; weight: number }> = [
  { grade: 'ace', weight: 0.08 },
  { grade: 'solid', weight: 0.32 },
  { grade: 'capable', weight: 0.4 },
  { grade: 'green', weight: 0.2 },
];

/** Base daily salary by grade before jitter. */
const GRADE_SALARY_BASE: Record<GroundStaffGrade, number> = {
  ace: 95,
  solid: 75,
  capable: 60,
  green: 48,
};

const GS_FIRST_NAMES = [
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

const GS_LAST_NAMES = [
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

function nextId(tick: number, tag = 'gs'): string {
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

function parsePerkId(raw: unknown): GroundStaffPerkId | null {
  if (raw === 'logistics') return 'logistics';
  if (raw === 'yard') return 'yard';
  if (raw === 'procurement') return 'procurement';
  if (raw === 'demand_desk') return 'demand_desk';
  if (raw === 'wh_ops') return 'wh_ops';
  return null;
}

export function parseGroundStaffGrade(raw: unknown): GroundStaffGrade | null {
  if (raw === 'ace') return 'ace';
  if (raw === 'solid') return 'solid';
  if (raw === 'capable') return 'capable';
  if (raw === 'green') return 'green';
  return null;
}

export function groundStaffGradeFromSkillPct(pct: number): GroundStaffGrade {
  const n = Math.round(pct);
  if (n >= 90) return 'ace';
  if (n >= 75) return 'solid';
  if (n >= 55) return 'capable';
  return 'green';
}

export function groundStaffSkillPctRange(grade: GroundStaffGrade): {
  min: number;
  max: number;
} {
  return GRADE_BANDS[grade];
}

export function pickGroundStaffGrade(rng: () => number): GroundStaffGrade {
  const roll = rng();
  let acc = 0;
  for (const row of GRADE_WEIGHTS) {
    acc += row.weight;
    if (roll < acc) return row.grade;
  }
  return 'capable';
}

export function rollGroundStaffSkillPct(
  grade: GroundStaffGrade,
  rng: () => number,
): number {
  const { min, max } = GRADE_BANDS[grade];
  const span = Math.max(0, max - min);
  return Math.round(min + rng() * span);
}

function clampSkillPct(n: number): number {
  if (!Number.isFinite(n)) return GROUND_STAFF_SOLID_MID_PCT;
  return Math.max(
    GROUND_STAFF_SKILL_MIN,
    Math.min(GROUND_STAFF_SKILL_MAX, Math.round(n)),
  );
}

function lerp(t: number, a: number, b: number): number {
  return a + (b - a) * t;
}

/**
 * Perk effect from skillPct.
 * logistics/yard/procurement/wh_ops: lower = stronger.
 * demand_desk: higher = stronger.
 */
export function effectMultForPerk(
  perkId: GroundStaffPerkId,
  skillPct: number,
): number {
  const pct = clampSkillPct(skillPct);
  const t =
    (pct - GROUND_STAFF_SKILL_MIN) /
    (GROUND_STAFF_SKILL_MAX - GROUND_STAFF_SKILL_MIN);
  if (perkId === 'logistics') {
    // skill 40 → 0.85; skill 99 → 0.45
    return money(lerp(t, 0.85, 0.45));
  }
  if (perkId === 'yard') {
    // skill 40 → 0.98; skill 99 → 0.72
    return money(lerp(t, 0.98, 0.72));
  }
  if (perkId === 'procurement') {
    // skill 40 → 0.99; skill 99 → 0.94 (mid-solid ≈ 0.97)
    return money(lerp(t, 0.99, 0.94));
  }
  if (perkId === 'demand_desk') {
    // skill 40 → 1.02; skill 99 → 1.08 (mid-solid ≈ 1.04)
    return money(lerp(t, 1.02, 1.08));
  }
  if (perkId === 'wh_ops') {
    // CAPEX mult: skill 40 → 0.97; skill 99 → 0.88 (mid ≈ 0.93)
    return money(lerp(t, 0.97, 0.88));
  }
  return 1;
}

/** Shipped-credit mult for wh_ops from frozen skillPct (1.02 → 1.10). */
export function whOpsShippedMultFromSkillPct(skillPct: number): number {
  const pct = clampSkillPct(skillPct);
  const t =
    (pct - GROUND_STAFF_SKILL_MIN) /
    (GROUND_STAFF_SKILL_MAX - GROUND_STAFF_SKILL_MIN);
  return money(lerp(t, 1.02, 1.1));
}

/** Human hint from a frozen effectMult (e.g. Transfer −45%). */
export function groundStaffPerkHintFromEffect(
  perkId: GroundStaffPerkId,
  effectMult: number,
  skillPct?: number,
): string {
  const mult =
    Number.isFinite(effectMult) && effectMult > 0 ? effectMult : 1;
  if (perkId === 'logistics') {
    const pct = Math.round((1 - mult) * 100);
    return `Transfer −${pct}% port→WH`;
  }
  if (perkId === 'yard') {
    const pct = Math.round((1 - mult) * 100);
    return `−${pct}% yard hold at this hub`;
  }
  if (perkId === 'procurement') {
    const pct = Math.max(0, Math.round((1 - mult) * 100));
    return `Port price −${pct}%`;
  }
  if (perkId === 'demand_desk') {
    const pct = Math.max(0, Math.round((mult - 1) * 100));
    return `Demand pay +${pct}%`;
  }
  if (perkId === 'wh_ops') {
    const capexPct = Math.max(0, Math.round((1 - mult) * 100));
    const shipPct = Math.max(
      0,
      Math.round(
        (whOpsShippedMultFromSkillPct(
          skillPct ?? GROUND_STAFF_SOLID_MID_PCT,
        ) -
          1) *
          100,
      ),
    );
    return `Upgrade −${capexPct}% · shipped +${shipPct}%`;
  }
  return GROUND_STAFF_PERK_HINT[perkId];
}

function salaryForGrade(grade: GroundStaffGrade, rng: () => number): number {
  const base = GRADE_SALARY_BASE[grade];
  const jitter = Math.floor(rng() * 12) - 4;
  return money(Math.max(40, base + jitter));
}

function resolveGradeFields(
  perkId: GroundStaffPerkId,
  raw: Record<string, unknown>,
): { grade: GroundStaffGrade; skillPct: number; effectMult: number } {
  const hasSkill =
    typeof raw.skillPct === 'number' && Number.isFinite(raw.skillPct);
  const hasGrade = parseGroundStaffGrade(raw.grade) != null;
  const hasEffect =
    typeof raw.effectMult === 'number' &&
    Number.isFinite(raw.effectMult) &&
    (raw.effectMult as number) > 0;

  // Full legacy row → solid mid + frozen legacy constants.
  if (!hasSkill && !hasGrade && !hasEffect) {
    const legacyMult =
      perkId === 'logistics'
        ? GROUND_STAFF_LOGISTICS_MULT
        : perkId === 'yard'
          ? GROUND_STAFF_YARD_HOLD_MULT
          : effectMultForPerk(perkId, GROUND_STAFF_SOLID_MID_PCT);
    return {
      grade: 'solid',
      skillPct: GROUND_STAFF_SOLID_MID_PCT,
      effectMult: money(legacyMult),
    };
  }

  let skillPct = hasSkill
    ? clampSkillPct(raw.skillPct as number)
    : GROUND_STAFF_SOLID_MID_PCT;
  let grade = parseGroundStaffGrade(raw.grade);
  if (!grade) grade = groundStaffGradeFromSkillPct(skillPct);
  const band = GRADE_BANDS[grade];
  if (skillPct < band.min || skillPct > band.max) {
    if (!hasSkill) {
      skillPct = Math.round((band.min + band.max) / 2);
    } else {
      grade = groundStaffGradeFromSkillPct(skillPct);
    }
  }
  const effectMult = hasEffect
    ? money(raw.effectMult as number)
    : effectMultForPerk(perkId, skillPct);
  return { grade, skillPct, effectMult };
}

function normalizeCandidate(row: unknown): GroundStaffCandidate | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id.trim() : '';
  const displayName =
    typeof r.displayName === 'string' && r.displayName.trim()
      ? r.displayName.trim().slice(0, 40)
      : 'Ground ops';
  const perkId = parsePerkId(r.perkId) ?? 'logistics';
  const { grade, skillPct, effectMult } = resolveGradeFields(perkId, r);
  const salaryUsdPerDay =
    typeof r.salaryUsdPerDay === 'number' &&
    Number.isFinite(r.salaryUsdPerDay) &&
    r.salaryUsdPerDay > 0
      ? money(r.salaryUsdPerDay)
      : GRADE_SALARY_BASE[grade];
  const hireUsd =
    typeof r.hireUsd === 'number' && Number.isFinite(r.hireUsd) && r.hireUsd > 0
      ? money(r.hireUsd)
      : money(salaryUsdPerDay * GROUND_STAFF_HIRE_SIGNING_DAYS);
  if (!id) return null;
  return {
    id,
    displayName,
    perkId,
    grade,
    skillPct,
    effectMult,
    salaryUsdPerDay,
    hireUsd,
    portraitId: resolveCrewPortraitId(displayName, {
      portraitId: typeof r.portraitId === 'string' ? r.portraitId : undefined,
      salt: id,
    }),
  };
}

function normalizeMember(row: unknown): GroundStaffMember | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id.trim() : '';
  const displayName =
    typeof r.displayName === 'string' && r.displayName.trim()
      ? r.displayName.trim().slice(0, 40)
      : 'Ground ops';
  const warehouseId =
    typeof r.warehouseId === 'string' ? r.warehouseId.trim() : '';
  const hubIcao =
    typeof r.hubIcao === 'string' ? r.hubIcao.trim().toUpperCase() : '';
  const perkId = parsePerkId(r.perkId) ?? 'logistics';
  const { grade, skillPct, effectMult } = resolveGradeFields(perkId, r);
  const salaryUsdPerDay =
    typeof r.salaryUsdPerDay === 'number' &&
    Number.isFinite(r.salaryUsdPerDay) &&
    r.salaryUsdPerDay > 0
      ? money(r.salaryUsdPerDay)
      : GRADE_SALARY_BASE[grade];
  const hiredAtTick =
    typeof r.hiredAtTick === 'number' &&
    Number.isFinite(r.hiredAtTick) &&
    r.hiredAtTick >= 0
      ? Math.floor(r.hiredAtTick)
      : 0;
  if (!id || !warehouseId || !hubIcao) return null;
  return {
    id,
    displayName,
    warehouseId,
    hubIcao,
    perkId,
    grade,
    skillPct,
    effectMult,
    salaryUsdPerDay,
    hiredAtTick,
    portraitId: resolveCrewPortraitId(displayName, {
      portraitId: typeof r.portraitId === 'string' ? r.portraitId : undefined,
      salt: id,
    }),
  };
}

export function normalizeGroundStaffState(raw: unknown): GroundStaffState {
  if (!raw || typeof raw !== 'object') return { members: [] };
  const src = raw as GroundStaffState;
  const members = Array.isArray(src.members)
    ? (src.members.map(normalizeMember).filter(Boolean) as GroundStaffMember[])
    : [];
  const out: GroundStaffState = { members };
  if (src.hirePoolByHub && typeof src.hirePoolByHub === 'object') {
    const byHub: Record<string, GroundStaffCandidate[]> = {};
    for (const [icao, pool] of Object.entries(src.hirePoolByHub)) {
      const key = icao.trim().toUpperCase();
      if (!key || !Array.isArray(pool)) continue;
      const cleaned = pool
        .map(normalizeCandidate)
        .filter(Boolean) as GroundStaffCandidate[];
      if (cleaned.length > 0) byHub[key] = cleaned;
    }
    if (Object.keys(byHub).length > 0) out.hirePoolByHub = byHub;
  }
  if (src.hirePoolDayByHub && typeof src.hirePoolDayByHub === 'object') {
    const days: Record<string, number> = {};
    for (const [icao, day] of Object.entries(src.hirePoolDayByHub)) {
      const key = icao.trim().toUpperCase();
      if (!key || typeof day !== 'number' || !Number.isFinite(day)) continue;
      days[key] = Math.floor(day);
    }
    if (Object.keys(days).length > 0) out.hirePoolDayByHub = days;
  }
  return out;
}

export function ensureGroundStaff(state: CareerMissionsState): GroundStaffState {
  const next = normalizeGroundStaffState(state.groundStaff);
  // Drop members whose warehouse was sold / abandoned.
  const whIds = new Set(
    (ensurePlayerWarehouses(state).warehouses ?? []).map((w) => w.id),
  );
  next.members = next.members.filter((m) => whIds.has(m.warehouseId));
  state.groundStaff = next;
  return next;
}

/** Slots at one WH: T1 → 1, T2 → 2, T3 → 3. */
export function groundStaffSlotsForWarehouse(
  warehouse: Pick<PlayerWarehouse, 'tier'> | null | undefined,
): number {
  if (!warehouse) return 0;
  if (warehouse.tier >= 3) return 3;
  if (warehouse.tier >= 2) return 2;
  return 1;
}

export function findWarehouseById(
  state: Pick<CareerMissionsState, 'playerWarehouses'>,
  warehouseId: string,
): PlayerWarehouse | null {
  const id = warehouseId.trim();
  if (!id) return null;
  return (
    (state.playerWarehouses?.warehouses ?? []).find((w) => w.id === id) ?? null
  );
}

export function groundStaffMembersAtWarehouse(
  state: Pick<CareerMissionsState, 'groundStaff'>,
  warehouseId: string,
): GroundStaffMember[] {
  const id = warehouseId.trim();
  return normalizeGroundStaffState(state.groundStaff).members.filter(
    (m) => m.warehouseId === id,
  );
}

export function groundStaffRosterSlotsFree(
  state: CareerMissionsState,
  warehouseId: string,
): number {
  const wh = findWarehouseById(state, warehouseId);
  const unlocked = groundStaffSlotsForWarehouse(wh);
  const used = groundStaffMembersAtWarehouse(state, warehouseId).length;
  return Math.max(0, unlocked - used);
}

export function warehouseHasGroundPerk(
  state: Pick<CareerMissionsState, 'groundStaff'>,
  warehouseId: string,
  perkId: GroundStaffPerkId,
): boolean {
  return groundStaffMembersAtWarehouse(state, warehouseId).some(
    (m) => m.perkId === perkId,
  );
}

/** Port→WH transfer duration multiplier (1 = default). */
export function logisticsMultForWarehouse(
  state: Pick<CareerMissionsState, 'groundStaff'>,
  warehouseId: string,
): number {
  const member = groundStaffMembersAtWarehouse(state, warehouseId).find(
    (m) => m.perkId === 'logistics',
  );
  if (!member) return 1;
  const mult = member.effectMult;
  return Number.isFinite(mult) && mult > 0 ? mult : GROUND_STAFF_LOGISTICS_MULT;
}

/**
 * Yard hold fee multiplier for pickups at a hub.
 * No stacking — first yard perk at that hub wins.
 */
export function yardHoldMultForHub(
  state: Pick<CareerMissionsState, 'groundStaff' | 'playerWarehouses'>,
  hubIcao: string,
): number {
  const hub = hubIcao.trim().toUpperCase();
  if (!hub) return 1;
  const warehouses = state.playerWarehouses?.warehouses ?? [];
  for (const wh of warehouses) {
    if (wh.icao.trim().toUpperCase() !== hub) continue;
    const member = groundStaffMembersAtWarehouse(state, wh.id).find(
      (m) => m.perkId === 'yard',
    );
    if (member) {
      const mult = member.effectMult;
      return Number.isFinite(mult) && mult > 0
        ? mult
        : GROUND_STAFF_YARD_HOLD_MULT;
    }
  }
  return 1;
}

function memberEffectMult(
  state: Pick<CareerMissionsState, 'groundStaff'>,
  warehouseId: string,
  perkId: GroundStaffPerkId,
): number | null {
  const member = groundStaffMembersAtWarehouse(state, warehouseId).find(
    (m) => m.perkId === perkId,
  );
  if (!member) return null;
  const mult = member.effectMult;
  return Number.isFinite(mult) && mult > 0 ? mult : null;
}

/** Port buy unit-price multiplier at hub (1 = default). */
export function procurementMultForHub(
  state: Pick<CareerMissionsState, 'groundStaff' | 'playerWarehouses'>,
  hubIcao: string,
): number {
  const hub = hubIcao.trim().toUpperCase();
  if (!hub) return 1;
  const warehouses = state.playerWarehouses?.warehouses ?? [];
  for (const wh of warehouses) {
    if (wh.icao.trim().toUpperCase() !== hub) continue;
    const mult = memberEffectMult(state, wh.id, 'procurement');
    if (mult != null) return mult;
  }
  return 1;
}

/** Demand pay unit-price multiplier for a warehouse (1 = default). */
export function demandDeskMultForWarehouse(
  state: Pick<CareerMissionsState, 'groundStaff'>,
  warehouseId: string,
): number {
  return memberEffectMult(state, warehouseId, 'demand_desk') ?? 1;
}

/** WH upgrade CAPEX multiplier (1 = default). */
export function whOpsCapexMultForWarehouse(
  state: Pick<CareerMissionsState, 'groundStaff'>,
  warehouseId: string,
): number {
  return memberEffectMult(state, warehouseId, 'wh_ops') ?? 1;
}

/** lifetimeShipped credit multiplier when wh_ops is on duty. */
export function whOpsShippedMultForWarehouse(
  state: Pick<CareerMissionsState, 'groundStaff'>,
  warehouseId: string,
): number {
  const member = groundStaffMembersAtWarehouse(state, warehouseId).find(
    (m) => m.perkId === 'wh_ops',
  );
  if (!member) return 1;
  return whOpsShippedMultFromSkillPct(member.skillPct);
}

function rollCandidate(
  rng: () => number,
  tick: number,
  perkId: GroundStaffPerkId = 'logistics',
): GroundStaffCandidate {
  const first = GS_FIRST_NAMES[Math.floor(rng() * GS_FIRST_NAMES.length)]!;
  const last = GS_LAST_NAMES[Math.floor(rng() * GS_LAST_NAMES.length)]!;
  const grade = pickGroundStaffGrade(rng);
  const skillPct = rollGroundStaffSkillPct(grade, rng);
  const effectMult = effectMultForPerk(perkId, skillPct);
  const salaryUsdPerDay = salaryForGrade(grade, rng);
  const displayName = `${first} ${last}`;
  const id = nextId(tick, 'gscand');
  return {
    id,
    displayName,
    perkId,
    grade,
    skillPct,
    effectMult,
    salaryUsdPerDay,
    hireUsd: money(salaryUsdPerDay * GROUND_STAFF_HIRE_SIGNING_DAYS),
    portraitId: resolveCrewPortraitId(displayName, { salt: id }),
  };
}

/**
 * Refresh hire desk for one pickup hub (or all owned WH hubs when hub omitted).
 */
export function refreshGroundStaffHirePool(
  state: CareerMissionsState,
  world: Pick<CareerEconomyWorld, 'tick'> & { seed?: string },
  opts: { hubIcao?: string; force?: boolean } = {},
): GroundStaffState {
  const roster = ensureGroundStaff(state);
  const day = economyDayIndex(world.tick);
  const warehouses = ensurePlayerWarehouses(state).warehouses ?? [];
  const hubs = new Set<string>();
  if (opts.hubIcao?.trim()) {
    hubs.add(opts.hubIcao.trim().toUpperCase());
  } else {
    for (const w of warehouses) {
      const icao = w.icao.trim().toUpperCase();
      if (icao) hubs.add(icao);
    }
  }

  const hirePoolByHub = { ...(roster.hirePoolByHub ?? {}) };
  const hirePoolDayByHub = { ...(roster.hirePoolDayByHub ?? {}) };

  // Drop pools for hubs with no warehouse.
  const ownedHubs = new Set(
    warehouses.map((w) => w.icao.trim().toUpperCase()).filter(Boolean),
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
    const whAtHub = warehouses.filter(
      (w) => w.icao.trim().toUpperCase() === hub,
    );
    const anyFree = whAtHub.some(
      (w) => groundStaffRosterSlotsFree(state, w.id) > 0,
    );
    // No free seats across WHs at hub → empty desk (still refresh day stamp).
    const sameDay = hirePoolDayByHub[hub] === day;
    const hasPool = (hirePoolByHub[hub]?.length ?? 0) > 0;
    if (!opts.force && sameDay && (hasPool || !anyFree)) {
      if (!anyFree) hirePoolByHub[hub] = [];
      continue;
    }

    if (!anyFree) {
      hirePoolByHub[hub] = [];
      hirePoolDayByHub[hub] = day;
      continue;
    }

    const rng = mulberry32(
      hashSeed([world.seed ?? 'career', hub, day, 'ground-hire']),
    );
    const freeWhs = whAtHub.filter(
      (w) => groundStaffRosterSlotsFree(state, w.id) > 0,
    );
    const availablePerks = GROUND_STAFF_V1_PERKS.filter((perk) =>
      freeWhs.some((w) => !warehouseHasGroundPerk(state, w.id, perk)),
    );
    const perkChoices =
      availablePerks.length > 0 ? availablePerks : GROUND_STAFF_V1_PERKS;
    const pool: GroundStaffCandidate[] = [];
    for (let i = 0; i < GROUND_STAFF_HIRE_POOL_SIZE; i++) {
      const perk =
        perkChoices[Math.floor(rng() * perkChoices.length)] ??
        perkChoices[i % perkChoices.length] ??
        'logistics';
      pool.push(rollCandidate(rng, world.tick, perk));
    }
    hirePoolByHub[hub] = pool;
    hirePoolDayByHub[hub] = day;
  }

  roster.hirePoolByHub = hirePoolByHub;
  roster.hirePoolDayByHub = hirePoolDayByHub;
  state.groundStaff = roster;
  return roster;
}

export function quoteGroundStaffFireSeveranceUsd(
  member: Pick<GroundStaffMember, 'salaryUsdPerDay'>,
): number {
  return money(
    Math.max(0, member.salaryUsdPerDay) * GROUND_STAFF_FIRE_SEVERANCE_DAYS,
  );
}

export function hireGroundStaffCandidate(
  state: CareerMissionsState,
  world: Pick<CareerEconomyWorld, 'tick'> & { seed?: string },
  opts: { warehouseId: string; candidateId: string },
): { member: GroundStaffMember; debitUsd: number } {
  const warehouseId = opts.warehouseId.trim();
  const wh = findWarehouseById(state, warehouseId);
  if (!wh) throw new Error(`Unknown warehouse ${warehouseId}`);
  const hub = wh.icao.trim().toUpperCase();

  refreshGroundStaffHirePool(state, world, { hubIcao: hub });
  const roster = ensureGroundStaff(state);

  if (groundStaffRosterSlotsFree(state, warehouseId) <= 0) {
    throw new Error(
      `No free ground staff slots at ${hub} — fire someone or upgrade the warehouse`,
    );
  }

  const pool = roster.hirePoolByHub?.[hub] ?? [];
  const idx = pool.findIndex((c) => c.id === opts.candidateId);
  if (idx < 0) throw new Error(`Unknown hire candidate ${opts.candidateId}`);
  const candidate = pool[idx]!;

  if (warehouseHasGroundPerk(state, warehouseId, candidate.perkId)) {
    throw new Error(
      `Already have ${GROUND_STAFF_PERK_LABEL[candidate.perkId]} at ${hub}`,
    );
  }

  if (state.walletUsd < candidate.hireUsd) {
    throw new Error(
      `Hire costs $${candidate.hireUsd.toLocaleString()} but wallet has $${state.walletUsd.toLocaleString()}`,
    );
  }

  const member: GroundStaffMember = {
    id: nextId(world.tick, 'gs'),
    displayName: candidate.displayName,
    warehouseId,
    hubIcao: hub,
    perkId: candidate.perkId,
    grade: candidate.grade,
    skillPct: candidate.skillPct,
    effectMult: candidate.effectMult,
    salaryUsdPerDay: candidate.salaryUsdPerDay,
    hiredAtTick: world.tick,
    portraitId: resolveCrewPortraitId(candidate.displayName, {
      portraitId: candidate.portraitId,
      salt: candidate.id,
    }),
  };

  applyWalletDelta(state, {
    amountUsd: -candidate.hireUsd,
    kind: 'ground_staff_hire',
    atTick: world.tick,
    icao: hub,
    note: `Hire ${member.displayName} · ${GROUND_STAFF_GRADE_LABEL[member.grade]} ${GROUND_STAFF_PERK_LABEL[member.perkId]} @ ${hub}`,
  });

  roster.members.push(member);
  roster.hirePoolByHub = {
    ...(roster.hirePoolByHub ?? {}),
    [hub]: pool.filter((c) => c.id !== candidate.id),
  };
  state.groundStaff = roster;
  return { member, debitUsd: candidate.hireUsd };
}

export function fireGroundStaffMember(
  state: CareerMissionsState,
  world: Pick<CareerEconomyWorld, 'tick'>,
  memberId: string,
): { member: GroundStaffMember; debitUsd: number } {
  const roster = ensureGroundStaff(state);
  const idx = roster.members.findIndex((m) => m.id === memberId);
  if (idx < 0) throw new Error(`Unknown ground staff ${memberId}`);
  const member = roster.members[idx]!;
  const debitUsd = quoteGroundStaffFireSeveranceUsd(member);
  if (debitUsd > 0 && state.walletUsd < debitUsd) {
    throw new Error(
      `Severance costs $${debitUsd.toLocaleString()} but wallet has $${state.walletUsd.toLocaleString()}`,
    );
  }

  if (debitUsd > 0) {
    applyWalletDelta(state, {
      amountUsd: -debitUsd,
      kind: 'ground_staff_fire',
      atTick: world.tick,
      icao: member.hubIcao,
      note: `Fire ${member.displayName} · ${GROUND_STAFF_FIRE_SEVERANCE_DAYS}d severance @ ${member.hubIcao}`,
    });
  }

  roster.members.splice(idx, 1);
  state.groundStaff = roster;
  return { member, debitUsd };
}

export type GroundStaffSalarySettleResult = {
  debitUsd: number;
  requestedUsd: number;
  shortfallUsd: number;
  daysCharged: number;
};

export function settleGroundStaffSalaries(
  state: CareerMissionsState,
  opts: { fromTick: number; toTick: number },
): GroundStaffSalarySettleResult {
  const daysCharged = Math.max(
    0,
    economyDayIndex(opts.toTick) - economyDayIndex(opts.fromTick),
  );
  const empty: GroundStaffSalarySettleResult = {
    debitUsd: 0,
    requestedUsd: 0,
    shortfallUsd: 0,
    daysCharged: 0,
  };
  if (daysCharged <= 0) return empty;

  const roster = ensureGroundStaff(state);
  if (roster.members.length === 0) {
    return { ...empty, daysCharged };
  }

  let requestedUsd = 0;
  for (const m of roster.members) {
    requestedUsd += m.salaryUsdPerDay * daysCharged;
  }
  requestedUsd = money(requestedUsd);
  if (requestedUsd <= 0) return { ...empty, daysCharged };

  const debitUsd = money(Math.min(state.walletUsd, requestedUsd));
  const shortfallUsd = money(Math.max(0, requestedUsd - debitUsd));
  if (debitUsd > 0) {
    applyWalletDelta(state, {
      amountUsd: -debitUsd,
      kind: 'ground_staff_salary',
      atTick: opts.toTick,
      note: `${daysCharged}d · ${roster.members.length} ground staff`,
    });
  }
  return { debitUsd, requestedUsd, shortfallUsd, daysCharged };
}

export function settleGroundStaffDailyOps(
  state: CareerMissionsState,
  world: Pick<CareerEconomyWorld, 'tick'> & { seed?: string },
  opts: { fromTick: number; toTick: number },
): { salary: GroundStaffSalarySettleResult } {
  refreshGroundStaffHirePool(state, world);
  const salary = settleGroundStaffSalaries(state, opts);
  return { salary };
}

export function groundStaffSnapshot(
  state: CareerMissionsState,
  world?: Pick<CareerEconomyWorld, 'tick'> & { seed?: string },
  opts: { hubIcao?: string } = {},
): {
  members: Array<
    GroundStaffMember & {
      perkLabel: string;
      perkHint: string;
      gradeLabel: string;
      fireSeveranceUsd: number;
    }
  >;
  hirePoolByHub: Record<
    string,
    Array<
      GroundStaffCandidate & {
        perkLabel: string;
        perkHint: string;
        gradeLabel: string;
      }
    >
  >;
  hirePoolDayByHub: Record<string, number>;
  byWarehouse: Record<
    string,
    {
      warehouseId: string;
      hubIcao: string;
      tier: 1 | 2 | 3;
      slotsUnlocked: number;
      slotsUsed: number;
      slotsFree: number;
      logisticsActive: boolean;
      logisticsMult: number;
      yardActive: boolean;
      yardHoldMult: number;
      procurementActive: boolean;
      procurementMult: number;
      demandDeskActive: boolean;
      demandDeskMult: number;
      whOpsActive: boolean;
      whOpsCapexMult: number;
      whOpsShippedMult: number;
      members: Array<
        GroundStaffMember & {
          perkLabel: string;
          perkHint: string;
          gradeLabel: string;
          fireSeveranceUsd: number;
        }
      >;
    }
  >;
} {
  if (world) {
    refreshGroundStaffHirePool(state, world, { hubIcao: opts.hubIcao });
  }
  const roster = ensureGroundStaff(state);
  const decorate = <
    T extends {
      perkId: GroundStaffPerkId;
      grade: GroundStaffGrade;
      effectMult: number;
      skillPct: number;
    },
  >(
    row: T,
  ) => ({
    ...row,
    perkLabel: GROUND_STAFF_PERK_LABEL[row.perkId],
    perkHint: groundStaffPerkHintFromEffect(
      row.perkId,
      row.effectMult,
      row.skillPct,
    ),
    gradeLabel: GROUND_STAFF_GRADE_LABEL[row.grade],
  });

  const members = roster.members.map((row) => ({
    ...decorate(row),
    fireSeveranceUsd: quoteGroundStaffFireSeveranceUsd(row),
  }));
  const hirePoolByHub: Record<
    string,
    Array<
      GroundStaffCandidate & {
        perkLabel: string;
        perkHint: string;
        gradeLabel: string;
      }
    >
  > = {};
  for (const [hub, pool] of Object.entries(roster.hirePoolByHub ?? {})) {
    hirePoolByHub[hub] = pool.map(decorate);
  }

  const byWarehouse: ReturnType<typeof groundStaffSnapshot>['byWarehouse'] = {};
  for (const wh of ensurePlayerWarehouses(state).warehouses ?? []) {
    const at = members.filter((m) => m.warehouseId === wh.id);
    const slotsUnlocked = groundStaffSlotsForWarehouse(wh);
    const hub = wh.icao.trim().toUpperCase();
    byWarehouse[wh.id] = {
      warehouseId: wh.id,
      hubIcao: hub,
      tier: wh.tier,
      slotsUnlocked,
      slotsUsed: at.length,
      slotsFree: Math.max(0, slotsUnlocked - at.length),
      logisticsActive: at.some((m) => m.perkId === 'logistics'),
      logisticsMult: logisticsMultForWarehouse(state, wh.id),
      yardActive: at.some((m) => m.perkId === 'yard'),
      yardHoldMult: yardHoldMultForHub(state, hub),
      procurementActive: at.some((m) => m.perkId === 'procurement'),
      procurementMult: procurementMultForHub(state, hub),
      demandDeskActive: at.some((m) => m.perkId === 'demand_desk'),
      demandDeskMult: demandDeskMultForWarehouse(state, wh.id),
      whOpsActive: at.some((m) => m.perkId === 'wh_ops'),
      whOpsCapexMult: whOpsCapexMultForWarehouse(state, wh.id),
      whOpsShippedMult: whOpsShippedMultForWarehouse(state, wh.id),
      members: at,
    };
  }

  return {
    members,
    hirePoolByHub,
    hirePoolDayByHub: { ...(roster.hirePoolDayByHub ?? {}) },
    byWarehouse,
  };
}
