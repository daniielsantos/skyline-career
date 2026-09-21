/**
 * Career company cashflow ledger — signed wallet movements for P&L views.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { economyDayIndex } from './career-weather.js';
import type {
  CareerLedgerEntry,
  CareerLedgerKind,
  CareerMissionsState,
} from './types/career-economy.js';

export type { CareerLedgerEntry, CareerLedgerKind };

export type CareerLedgerSummary = {
  incomeUsd: number;
  expenseUsd: number;
  netUsd: number;
  entryCount: number;
  byKind: Partial<Record<CareerLedgerKind, number>>;
};

/**
 * Multi-day passive fee notes keep `Nd · …`; single-day omits the prefix
 * (Ledger Day column already shows the day).
 */
export function formatLedgerDaysNotePrefix(daysCharged: number): string {
  const days = Math.max(0, Math.floor(Number(daysCharged) || 0));
  return days > 1 ? `${days}d · ` : '';
}

export const LEDGER_KIND_LABEL: Record<CareerLedgerKind, string> = {
  freight_payout: 'Freight payout',
  charter_payout: 'Charter payout',
  hangar_parking: 'Hangar parking',
  lease_payment: 'Lease payment',
  lease_out_income: 'Lease-out income',
  lease_deposit: 'Lease deposit',
  lease_early_return: 'Lease early return',
  aircraft_buy: 'Aircraft purchase',
  aircraft_delivery: 'Aircraft delivery',
  aircraft_import: 'Aircraft import',
  aircraft_lease_sign: 'Lease entry',
  aircraft_sell: 'Aircraft sale',
  aircraft_buyout: 'Lease buyout',
  fbo_buy: 'Base purchase',
  fbo_storage: 'Base storage',
  fbo_hold_expire: 'Base hold expired',
  fbo_spot_buy: 'FBO spot buy',
  fbo_spot_sale: 'FBO spot sale',
  port_buy: 'Port purchase',
  port_yard_hold: 'Port yard hold',
  port_drayage: 'Port stevedore',
  port_shuttle: 'Port shuttle',
  internal_haul_pay: 'Internal haul pay',
  va_member_cut: 'VA member route cut',
  va_line_crew_hire: 'VA Line crew hire',
  va_line_crew_upgrade: 'VA Line crew upgrade',
  va_line_crew_fire: 'VA Line crew severance',
  va_line_crew_salary: 'VA Line crew salary',
  va_line_crew_ferry: 'VA ferry (member home)',
  port_concession_claim: 'Port FBO claim',
  port_concession_lease: 'Port FBO lease',
  port_concession_upgrade: 'Port FBO upgrade',
  warehouse_buy: 'Warehouse purchase',
  warehouse_storage: 'Warehouse storage',
  warehouse_upgrade: 'Warehouse upgrade',
  demand_payout: 'Demand delivery',
  fbo_reroute: 'Base reroute',
  crew_fee: 'Crew dispatch fee',
  crew_salary: 'Crew salary',
  crew_hire: 'Crew hire',
  ground_staff_salary: 'Ground staff salary',
  ground_staff_hire: 'Ground staff hire',
  ground_staff_fire: 'Ground staff severance',
  base_dispatcher_salary: 'Base Dispatcher salary',
  base_dispatcher_hire: 'Base Dispatcher hire',
  base_dispatcher_fire: 'Base Dispatcher severance',
  ferry: 'Ferry',
  pilot_travel: 'Pilot travel',
  fuel: 'Jet-A',
  inspection: 'Inspection',
  repair: 'Repair',
  credit_draw: 'Credit draw',
  credit_repay: 'Credit repay',
  credit_interest: 'Credit interest',
  other: 'Other',
};

/**
 * Pulse / housekeeping kinds — never stamp a member (UI shows System).
 * Hire/fire/fees remain attributable to the session actor.
 */
export const LEDGER_SYSTEM_KINDS = new Set<CareerLedgerKind>([
  'hangar_parking',
  'crew_salary',
  'ground_staff_salary',
  'base_dispatcher_salary',
  'va_line_crew_salary',
  'credit_interest',
  'warehouse_storage',
  'fbo_storage',
  'port_yard_hold',
  'port_concession_lease',
  'fbo_hold_expire',
  'lease_payment',
  'lease_out_income',
]);

export function isLedgerSystemKind(kind: CareerLedgerKind): boolean {
  return LEDGER_SYSTEM_KINDS.has(kind);
}

/** Soft cap so mission saves stay small. */
export const CAREER_LEDGER_MAX_ENTRIES = 400;

const KIND_SET = new Set<string>(Object.keys(LEDGER_KIND_LABEL));

/** Request-scoped actor for applyWalletDelta (authenticated writes). */
const ledgerActorAls = new AsyncLocalStorage<string | undefined>();

/** Bind the current async context to this account (HTTP request after auth). */
export function enterLedgerActorAccountId(
  accountId: string | null | undefined,
): void {
  const id = accountId?.trim();
  ledgerActorAls.enterWith(id || undefined);
}

export function peekLedgerActorAccountId(): string | undefined {
  const id = ledgerActorAls.getStore()?.trim();
  return id || undefined;
}

export function runWithLedgerActorAccountId<T>(
  accountId: string | null | undefined,
  fn: () => T,
): T {
  const id = accountId?.trim() || undefined;
  return ledgerActorAls.run(id, fn);
}

let ledgerSeq = 0;

/** Parse append order from `led_<tick>_<seq>_<rand>` (legacy unpadded seq ok). */
function ledgerAppendSeq(id: string): number {
  const parts = id.split('_');
  // led, tick, seq, rand… — seq is parts[2]
  if (parts.length < 3 || parts[0] !== 'led') return 0;
  const n = Number(parts[2]);
  return Number.isFinite(n) ? n : 0;
}

/** Chronological: tick ASC, then in-tick append seq (not lexicographic id). */
export function compareLedgerChronological(
  a: Pick<CareerLedgerEntry, 'atTick' | 'id'>,
  b: Pick<CareerLedgerEntry, 'atTick' | 'id'>,
): number {
  if (a.atTick !== b.atTick) return a.atTick - b.atTick;
  const sa = ledgerAppendSeq(a.id);
  const sb = ledgerAppendSeq(b.id);
  if (sa !== sb) return sa - sb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function nextLedgerId(atTick: number): string {
  ledgerSeq += 1;
  // Zero-pad seq so DB `ORDER BY id` stays chronological if someone sorts by id.
  return `led_${atTick}_${String(ledgerSeq).padStart(8, '0')}_${Math.floor(Math.random() * 1e6)}`;
}

function resolveLedgerActorAccountId(
  state: CareerMissionsState,
  opts: {
    kind: CareerLedgerKind;
    actorAccountId?: string | null;
    missionId?: string;
  },
): string | undefined {
  if (isLedgerSystemKind(opts.kind)) return undefined;
  const explicit = opts.actorAccountId?.trim();
  if (explicit) return explicit;
  if (opts.actorAccountId === null) return undefined;
  const ambient = peekLedgerActorAccountId();
  if (ambient) return ambient;
  const missionId = opts.missionId?.trim();
  if (!missionId) return undefined;
  const mission = state.missions?.find((m) => m.id === missionId);
  const pilot = mission?.pilotAccountId?.trim();
  return pilot || undefined;
}

export function normalizeCareerLedger(raw: unknown): CareerLedgerEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: CareerLedgerEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const amountUsd =
      typeof r.amountUsd === 'number' && Number.isFinite(r.amountUsd)
        ? Math.round(r.amountUsd * 100) / 100
        : null;
    const atTick =
      typeof r.atTick === 'number' && Number.isFinite(r.atTick)
        ? Math.max(0, Math.floor(r.atTick))
        : null;
    const kind =
      typeof r.kind === 'string' && KIND_SET.has(r.kind)
        ? (r.kind as CareerLedgerKind)
        : null;
    if (amountUsd == null || atTick == null || !kind || amountUsd === 0) continue;
    const actorRaw =
      typeof r.actorAccountId === 'string'
        ? r.actorAccountId.trim()
        : typeof r.actor_account_id === 'string'
          ? r.actor_account_id.trim()
          : '';
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : nextLedgerId(atTick),
      atTick,
      dayIndex:
        typeof r.dayIndex === 'number' && Number.isFinite(r.dayIndex)
          ? Math.max(0, Math.floor(r.dayIndex))
          : economyDayIndex(atTick),
      amountUsd,
      kind,
      note: typeof r.note === 'string' ? r.note.slice(0, 120) : undefined,
      aircraftId: typeof r.aircraftId === 'string' ? r.aircraftId : undefined,
      missionId: typeof r.missionId === 'string' ? r.missionId : undefined,
      icao: typeof r.icao === 'string' ? r.icao.toUpperCase() : undefined,
      ...(actorRaw ? { actorAccountId: actorRaw } : {}),
    });
  }
  return out
    .sort(compareLedgerChronological)
    .slice(-CAREER_LEDGER_MAX_ENTRIES);
}

/**
 * Mutate wallet and append a signed ledger row.
 * amountUsd > 0 credits; amountUsd < 0 debits. Zero is a no-op.
 * Actor: opts > ambient session > mission.pilotAccountId (system kinds skip).
 */
export function applyWalletDelta(
  state: CareerMissionsState,
  opts: {
    amountUsd: number;
    kind: CareerLedgerKind;
    atTick: number;
    note?: string;
    aircraftId?: string;
    missionId?: string;
    icao?: string;
    /** Explicit actor; omit to use ambient/mission. Pass null to force no actor. */
    actorAccountId?: string | null;
  },
): CareerLedgerEntry | null {
  const amountUsd = Math.round(opts.amountUsd * 100) / 100;
  if (!Number.isFinite(amountUsd) || amountUsd === 0) return null;
  const atTick = Math.max(0, Math.floor(opts.atTick));
  state.walletUsd = Math.round((state.walletUsd + amountUsd) * 100) / 100;
  const actorAccountId = resolveLedgerActorAccountId(state, opts);
  const entry: CareerLedgerEntry = {
    id: nextLedgerId(atTick),
    atTick,
    dayIndex: economyDayIndex(atTick),
    amountUsd,
    kind: opts.kind,
    note: opts.note?.slice(0, 120),
    aircraftId: opts.aircraftId,
    missionId: opts.missionId,
    icao: opts.icao?.toUpperCase(),
    ...(actorAccountId ? { actorAccountId } : {}),
  };
  const ledger = state.ledger ? [...state.ledger] : [];
  ledger.push(entry);
  state.ledger =
    ledger.length > CAREER_LEDGER_MAX_ENTRIES
      ? ledger.slice(ledger.length - CAREER_LEDGER_MAX_ENTRIES)
      : ledger;
  return entry;
}

export function summarizeLedgerEntries(
  entries: readonly CareerLedgerEntry[],
): CareerLedgerSummary {
  let incomeUsd = 0;
  let expenseUsd = 0;
  const byKind: Partial<Record<CareerLedgerKind, number>> = {};
  for (const e of entries) {
    byKind[e.kind] = Math.round(((byKind[e.kind] ?? 0) + e.amountUsd) * 100) / 100;
    if (e.amountUsd > 0) incomeUsd += e.amountUsd;
    else expenseUsd += -e.amountUsd;
  }
  incomeUsd = Math.round(incomeUsd * 100) / 100;
  expenseUsd = Math.round(expenseUsd * 100) / 100;
  return {
    incomeUsd,
    expenseUsd,
    netUsd: Math.round((incomeUsd - expenseUsd) * 100) / 100,
    entryCount: entries.length,
    byKind,
  };
}

/** Inclusive window of the last `windowDays` economy days ending at `atTick`. */
export function ledgerEntriesInWindow(
  entries: readonly CareerLedgerEntry[],
  atTick: number,
  windowDays: number | null,
): CareerLedgerEntry[] {
  if (windowDays == null) return [...entries];
  const endDay = economyDayIndex(atTick);
  const startDay = Math.max(0, endDay - Math.max(0, windowDays) + 1);
  return entries.filter((e) => e.dayIndex >= startDay && e.dayIndex <= endDay);
}

export function summarizeCareerLedger(
  state: Pick<CareerMissionsState, 'ledger'>,
  atTick: number,
): {
  week: CareerLedgerSummary;
  month: CareerLedgerSummary;
  allTime: CareerLedgerSummary;
  recent: CareerLedgerEntry[];
} {
  const all = [...(state.ledger ?? [])].sort(compareLedgerChronological);
  return {
    week: summarizeLedgerEntries(ledgerEntriesInWindow(all, atTick, 7)),
    month: summarizeLedgerEntries(ledgerEntriesInWindow(all, atTick, 30)),
    allTime: summarizeLedgerEntries(all),
    // Newest first for Recent activity.
    recent: all.slice().reverse().slice(0, 80),
  };
}
