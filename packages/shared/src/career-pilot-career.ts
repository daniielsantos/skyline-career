/**
 * Pilot career counters on the home company (hours + last settle hangar note).
 * Not a reputation formula — identity / UX only.
 */
import type {
  CareerClassOps,
  CareerMissionsState,
  MissionIntent,
} from './types/career-economy.js';
import {
  CARGO_OPS_DRY_IDS,
  type CargoOpsDelta,
} from './career-cargo-ops.js';
import type { ClassOpsDelta } from './career-class-ops.js';

export type LastSettleOutcome = {
  missionId: string;
  originIcao: string;
  destIcao: string;
  atTick: number;
  /** One-liner under Hangar Cargo Ops / lease. */
  hangarNote: string;
  pilotHoursDelta: number;
  pilotHoursAfter: number;
  /** null = N/A (charter / empty / no cargo ladder touch). */
  dryClean: boolean | null;
  /** Member cut / IH fee credited to home; null if none. */
  pilotPayUsd: number | null;
};

const CARGO_LABEL: Record<string, string> = {
  general: 'General',
  supplies: 'Supplies',
  electronics: 'Electronics',
  perishables: 'Perishables',
  machinery: 'Machinery',
};

export function normalizePilotFlightHours(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return 0;
  return Math.round(raw * 10) / 10;
}

export function normalizeLastSettleOutcome(
  raw: unknown,
): LastSettleOutcome | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const missionId = typeof o.missionId === 'string' ? o.missionId.trim() : '';
  const originIcao =
    typeof o.originIcao === 'string' ? o.originIcao.trim().toUpperCase() : '';
  const destIcao =
    typeof o.destIcao === 'string' ? o.destIcao.trim().toUpperCase() : '';
  const hangarNote =
    typeof o.hangarNote === 'string' ? o.hangarNote.trim() : '';
  if (!missionId || !hangarNote) return undefined;
  const atTick =
    typeof o.atTick === 'number' && Number.isFinite(o.atTick)
      ? Math.max(0, Math.floor(o.atTick))
      : 0;
  const pilotHoursDelta =
    typeof o.pilotHoursDelta === 'number' && Number.isFinite(o.pilotHoursDelta)
      ? Math.max(0, Math.round(o.pilotHoursDelta * 10) / 10)
      : 0;
  const pilotHoursAfter = normalizePilotFlightHours(o.pilotHoursAfter);
  const dryClean =
    o.dryClean === true ? true : o.dryClean === false ? false : null;
  const pilotPayUsd =
    typeof o.pilotPayUsd === 'number' && Number.isFinite(o.pilotPayUsd)
      ? Math.round(o.pilotPayUsd)
      : null;
  return {
    missionId,
    originIcao,
    destIcao,
    atTick,
    hangarNote,
    pilotHoursDelta,
    pilotHoursAfter,
    dryClean,
    pilotPayUsd,
  };
}

/** True when every ladder class (jet / medium / narrow / wide) is unlocked. */
export function classOpsLadderComplete(
  ops: CareerClassOps | null | undefined,
): boolean {
  if (!ops?.classes) return true;
  return (
    Boolean(ops.classes.light_jet?.unlocked) &&
    Boolean(ops.classes.medium_piston?.unlocked) &&
    Boolean(ops.classes.narrow_freighter?.unlocked) &&
    Boolean(ops.classes.wide_freighter?.unlocked)
  );
}

export function pilotHoursFromFlightDurationMs(
  ms: number | null | undefined,
): number {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round((ms / 3_600_000) * 10) / 10;
}

function dryCleanFromDeltas(
  deltas: readonly CargoOpsDelta[] | null | undefined,
): boolean | null {
  if (!deltas?.length) return null;
  let sawDry = false;
  let anyClean = false;
  for (const d of deltas) {
    if (!(CARGO_OPS_DRY_IDS as readonly string[]).includes(d.commodityId)) {
      continue;
    }
    sawDry = true;
    if (d.clean) anyClean = true;
  }
  if (!sawDry) return null;
  return anyClean;
}

export function buildHangerSettleNote(opts: {
  originIcao: string;
  destIcao: string;
  mission: Pick<
    MissionIntent,
    'missionType' | 'crewDeadhead' | 'emptyFlight' | 'contractPilotReposition'
  >;
  cargoOpsDeltas?: readonly CargoOpsDelta[] | null;
  flightScorePct?: number | null;
  onTime?: boolean;
  leaseCleanAfter?: number | null;
  leaseCleanRequired?: number | null;
}): string {
  const route = `${opts.originIcao}→${opts.destIcao}`;
  if (opts.mission.missionType === 'charter') {
    return `${route} · Charter — does not count toward Dry / lease.`;
  }
  if (
    opts.mission.crewDeadhead ||
    opts.mission.emptyFlight ||
    opts.mission.contractPilotReposition
  ) {
    return `${route} · Empty / reposition — no Cargo Ops.`;
  }
  const deltas = opts.cargoOpsDeltas ?? [];
  if (deltas.length === 0) {
    return `${route} · No Cargo Ops change this settle.`;
  }
  const dryClean = dryCleanFromDeltas(deltas);
  const primary = deltas[0]!;
  const name = CARGO_LABEL[primary.commodityId] ?? primary.commodityId;
  if (dryClean === true) {
    const lease =
      typeof opts.leaseCleanAfter === 'number' &&
      typeof opts.leaseCleanRequired === 'number'
        ? ` Lease ${opts.leaseCleanAfter}/${opts.leaseCleanRequired}.`
        : '';
    return `${route} · ${name} clean.${lease}`;
  }
  if (dryClean === false) {
    const score =
      typeof opts.flightScorePct === 'number' &&
      Number.isFinite(opts.flightScorePct)
        ? ` score ${Math.round(opts.flightScorePct)} < 70`
        : opts.onTime === false
          ? ' late'
          : ' soft score';
    return `${route} · ${name} on-time but no clean (${score.trim()}).`;
  }
  // Non-dry commodity touch
  const clean = primary.clean ? 'clean' : 'no clean';
  const sign = primary.deltaRep > 0 ? '+' : '';
  return `${route} · ${name} ${sign}${primary.deltaRep} rep · ${clean}.`;
}

export type ApplyPilotCareerSettleOpts = {
  atTick: number;
  mission: MissionIntent;
  flightDurationMs?: number | null;
  /** Fallback when duration missing (estimated block hours). */
  blockHoursFallback?: number;
  cargoOpsDeltas?: readonly CargoOpsDelta[] | null;
  classOpsDeltas?: readonly ClassOpsDelta[] | null;
  flightScorePct?: number | null;
  onTime?: boolean;
  pilotPayUsd?: number | null;
  leaseCleanAfter?: number | null;
  leaseCleanRequired?: number | null;
};

export function applyPilotCareerSettle(
  missions: CareerMissionsState,
  opts: ApplyPilotCareerSettleOpts,
): LastSettleOutcome {
  const fromDuration = pilotHoursFromFlightDurationMs(opts.flightDurationMs);
  const fallback =
    typeof opts.blockHoursFallback === 'number' &&
    Number.isFinite(opts.blockHoursFallback) &&
    opts.blockHoursFallback > 0
      ? Math.round(opts.blockHoursFallback * 10) / 10
      : 0;
  const delta = fromDuration > 0 ? fromDuration : fallback;
  const before = normalizePilotFlightHours(missions.pilotFlightHours);
  const after = normalizePilotFlightHours(before + delta);
  missions.pilotFlightHours = after;
  const origin = (opts.mission.originIcao ?? '').trim().toUpperCase();
  const dest = (opts.mission.destIcao ?? '').trim().toUpperCase();
  const hangarNote = buildHangerSettleNote({
    originIcao: origin,
    destIcao: dest,
    mission: opts.mission,
    cargoOpsDeltas: opts.cargoOpsDeltas,
    flightScorePct: opts.flightScorePct,
    onTime: opts.onTime,
    leaseCleanAfter: opts.leaseCleanAfter,
    leaseCleanRequired: opts.leaseCleanRequired,
  });
  const outcome: LastSettleOutcome = {
    missionId: opts.mission.id,
    originIcao: origin,
    destIcao: dest,
    atTick: opts.atTick,
    hangarNote,
    pilotHoursDelta: delta,
    pilotHoursAfter: after,
    dryClean: dryCleanFromDeltas(opts.cargoOpsDeltas),
    pilotPayUsd:
      typeof opts.pilotPayUsd === 'number' && opts.pilotPayUsd > 0
        ? Math.round(opts.pilotPayUsd)
        : null,
  };
  missions.lastSettleOutcome = outcome;
  return outcome;
}

/** Debrief “for you” pay line. */
export function formatPilotPayDebriefLine(opts: {
  pilotPayUsd: number | null | undefined;
  companyPayoutUsd: number;
  isVaFlight?: boolean;
  internalHaul?: boolean;
}): string {
  if (
    typeof opts.pilotPayUsd === 'number' &&
    Number.isFinite(opts.pilotPayUsd) &&
    opts.pilotPayUsd > 0
  ) {
    const kind = opts.internalHaul ? 'Internal haul fee' : 'Member cut';
    return `${kind} $${Math.round(opts.pilotPayUsd).toLocaleString('en-US')} → your home Wallet`;
  }
  if (opts.isVaFlight) {
    return `Route $${Math.round(opts.companyPayoutUsd).toLocaleString('en-US')} stayed with the company (no home cut)`;
  }
  return `Net route pay $${Math.round(opts.companyPayoutUsd).toLocaleString('en-US')} → your Wallet`;
}
