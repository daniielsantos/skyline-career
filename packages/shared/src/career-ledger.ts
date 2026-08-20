/**
 * Career company cashflow ledger — signed wallet movements for P&L views.
 */

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

export const LEDGER_KIND_LABEL: Record<CareerLedgerKind, string> = {
  freight_payout: 'Freight payout',
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
  fbo_buy: 'FBO purchase',
  fbo_storage: 'FBO storage',
  fbo_hold_expire: 'FBO hold expired',
  fbo_spot_buy: 'FBO spot buy',
  fbo_spot_sale: 'FBO spot sale',
  port_buy: 'Port purchase',
  port_yard_hold: 'Port yard hold',
  port_concession_claim: 'Port concession claim',
  port_concession_lease: 'Port concession lease',
  port_concession_upgrade: 'Port concession upgrade',
  warehouse_buy: 'Warehouse purchase',
  warehouse_storage: 'Warehouse storage',
  warehouse_upgrade: 'Warehouse upgrade',
  demand_payout: 'Demand delivery',
  fbo_reroute: 'FBO reroute',
  crew_fee: 'Crew dispatch fee',
  crew_salary: 'Crew salary',
  crew_hire: 'Crew hire',
  ground_staff_salary: 'Ground staff salary',
  ground_staff_hire: 'Ground staff hire',
  ground_staff_fire: 'Ground staff severance',
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

/** Soft cap so mission saves stay small. */
export const CAREER_LEDGER_MAX_ENTRIES = 400;

const KIND_SET = new Set<string>(Object.keys(LEDGER_KIND_LABEL));

let ledgerSeq = 0;

function nextLedgerId(atTick: number): string {
  ledgerSeq += 1;
  return `led_${atTick}_${ledgerSeq}_${Math.floor(Math.random() * 1e6)}`;
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
    });
  }
  return out.slice(-CAREER_LEDGER_MAX_ENTRIES);
}

/**
 * Mutate wallet and append a signed ledger row.
 * amountUsd > 0 credits; amountUsd < 0 debits. Zero is a no-op.
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
  },
): CareerLedgerEntry | null {
  const amountUsd = Math.round(opts.amountUsd * 100) / 100;
  if (!Number.isFinite(amountUsd) || amountUsd === 0) return null;
  const atTick = Math.max(0, Math.floor(opts.atTick));
  state.walletUsd = Math.round((state.walletUsd + amountUsd) * 100) / 100;
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
  const all = state.ledger ?? [];
  return {
    week: summarizeLedgerEntries(ledgerEntriesInWindow(all, atTick, 7)),
    month: summarizeLedgerEntries(ledgerEntriesInWindow(all, atTick, 30)),
    allTime: summarizeLedgerEntries(all),
    recent: [...all].reverse().slice(0, 80),
  };
}
