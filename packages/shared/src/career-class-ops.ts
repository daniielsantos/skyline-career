/**
 * Aircraft class unlock ladder.
 * Starters (GA + turboprop) → Light jet | Medium piston (parallel) → Narrow → Wide.
 */

import type { FlightScoreSnapshot } from './career-flight-score.js';
import type {
  CareerClassOps,
  ClassOpsClassState,
  FreighterClassId,
  MissionIntent,
  PlayerAircraft,
} from './types/career-economy.js';

/** Mirrors CAREER_AIRCRAFT_CLASSES maxCargoKg — kept local to avoid import cycles. */
const CLASS_MAX_CARGO_KG: Record<FreighterClassId, number> = {
  light_ga: 450,
  light_turboprop: 1_704,
  light_jet: 1_450,
  medium_piston: 10_000,
  narrow_freighter: 18_137,
  wide_freighter: 90_000,
};

export const CLASS_OPS_CLASS_IDS: readonly FreighterClassId[] = [
  'light_ga',
  'light_turboprop',
  'light_jet',
  'medium_piston',
  'narrow_freighter',
  'wide_freighter',
] as const;

export const CLASS_OPS_STARTER_IDS: readonly FreighterClassId[] = [
  'light_ga',
  'light_turboprop',
] as const;

/** Score % required for a clean settle that counts toward class unlock. */
export const CLASS_OPS_CLEAN_SCORE = 70;

/** Jet / Medium unlock from starter hours + cleans. */
export const CLASS_OPS_BRANCH_UNLOCK = {
  hoursRequired: 20,
  cleansRequired: 6,
} as const;

/** Narrow unlock from either Jet or Medium branch. */
export const CLASS_OPS_NARROW_UNLOCK = {
  hoursRequired: 25,
  cleansRequired: 5,
} as const;

/** Wide unlock from Narrow. */
export const CLASS_OPS_WIDE_UNLOCK = {
  hoursRequired: 40,
  cleansRequired: 8,
} as const;

/**
 * Board hide threshold: lots larger than unlocked cargo × this factor are
 * hidden when browsing without a selected airframe.
 */
export const CLASS_OPS_BOARD_CARGO_SLACK = 1.25;

const STARTER_SET = new Set<FreighterClassId>(CLASS_OPS_STARTER_IDS);

function isStarter(id: FreighterClassId): boolean {
  return STARTER_SET.has(id);
}

function defaultClassState(id: FreighterClassId): ClassOpsClassState {
  return {
    unlocked: isStarter(id),
    hours: 0,
    cleans: 0,
  };
}

export function emptyCareerClassOps(): CareerClassOps {
  const classes = {} as Record<FreighterClassId, ClassOpsClassState>;
  for (const id of CLASS_OPS_CLASS_IDS) {
    classes[id] = defaultClassState(id);
  }
  return { classes };
}

export function isFreighterClassId(id: string): id is FreighterClassId {
  return (CLASS_OPS_CLASS_IDS as readonly string[]).includes(id);
}

function clampHours(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 10) / 10;
}

function clampCleans(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function normalizeCareerClassOps(raw: unknown): CareerClassOps {
  const base = emptyCareerClassOps();
  if (!raw || typeof raw !== 'object') return base;
  const src = (raw as CareerClassOps).classes;
  if (!src || typeof src !== 'object') return base;
  for (const id of CLASS_OPS_CLASS_IDS) {
    const row = src[id];
    if (!row || typeof row !== 'object') continue;
    base.classes[id] = {
      unlocked: Boolean(row.unlocked) || isStarter(id),
      hours: clampHours(typeof row.hours === 'number' ? row.hours : 0),
      cleans: clampCleans(typeof row.cleans === 'number' ? row.cleans : 0),
    };
  }
  refreshClassOpsUnlocks(base);
  return base;
}

function starterHours(ops: CareerClassOps): number {
  return (
    ops.classes.light_ga.hours + ops.classes.light_turboprop.hours
  );
}

function starterCleans(ops: CareerClassOps): number {
  return (
    ops.classes.light_ga.cleans + ops.classes.light_turboprop.cleans
  );
}

export function branchReady(ops: CareerClassOps): boolean {
  return (
    starterHours(ops) >= CLASS_OPS_BRANCH_UNLOCK.hoursRequired &&
    starterCleans(ops) >= CLASS_OPS_BRANCH_UNLOCK.cleansRequired
  );
}

export function narrowReadyViaJet(ops: CareerClassOps): boolean {
  const jet = ops.classes.light_jet;
  return (
    jet.unlocked &&
    jet.hours >= CLASS_OPS_NARROW_UNLOCK.hoursRequired &&
    jet.cleans >= CLASS_OPS_NARROW_UNLOCK.cleansRequired
  );
}

export function narrowReadyViaMedium(ops: CareerClassOps): boolean {
  const med = ops.classes.medium_piston;
  return (
    med.unlocked &&
    med.hours >= CLASS_OPS_NARROW_UNLOCK.hoursRequired &&
    med.cleans >= CLASS_OPS_NARROW_UNLOCK.cleansRequired
  );
}

export function narrowReady(ops: CareerClassOps): boolean {
  return narrowReadyViaJet(ops) || narrowReadyViaMedium(ops);
}

export function wideReady(ops: CareerClassOps): boolean {
  const narrow = ops.classes.narrow_freighter;
  return (
    narrow.unlocked &&
    narrow.hours >= CLASS_OPS_WIDE_UNLOCK.hoursRequired &&
    narrow.cleans >= CLASS_OPS_WIDE_UNLOCK.cleansRequired
  );
}

/** Sticky unlocks from hours/cleans (and starters always open). */
export function refreshClassOpsUnlocks(ops: CareerClassOps): CareerClassOps {
  ops.classes.light_ga.unlocked = true;
  ops.classes.light_turboprop.unlocked = true;
  if (branchReady(ops)) {
    ops.classes.light_jet.unlocked = true;
    ops.classes.medium_piston.unlocked = true;
  }
  if (narrowReady(ops)) {
    ops.classes.narrow_freighter.unlocked = true;
  }
  if (wideReady(ops)) {
    ops.classes.wide_freighter.unlocked = true;
  }
  return ops;
}

/**
 * Owning/leasing an airframe unlocks its class and ladder inferiors.
 * Jet and Medium are siblings — owning Narrow does not unlock them.
 * Owning Wide unlocks everything.
 */
export function syncClassOpsFromFleet(
  ops: CareerClassOps | undefined,
  fleet: readonly Pick<PlayerAircraft, 'aircraftClassId'>[],
): CareerClassOps {
  const next = normalizeCareerClassOps(ops);
  for (const acf of fleet) {
    const id = acf.aircraftClassId;
    if (!isFreighterClassId(id)) continue;
    next.classes[id].unlocked = true;
    if (id === 'wide_freighter') {
      for (const c of CLASS_OPS_CLASS_IDS) next.classes[c].unlocked = true;
    } else if (id === 'narrow_freighter') {
      next.classes.narrow_freighter.unlocked = true;
      next.classes.light_ga.unlocked = true;
      next.classes.light_turboprop.unlocked = true;
    } else if (id === 'light_jet' || id === 'medium_piston') {
      next.classes[id].unlocked = true;
      next.classes.light_ga.unlocked = true;
      next.classes.light_turboprop.unlocked = true;
    }
  }
  refreshClassOpsUnlocks(next);
  return next;
}

export function classOpsIsUnlocked(
  ops: CareerClassOps | undefined,
  classId: FreighterClassId,
): boolean {
  // No ladder state → do not gate (legacy callers / unit tests).
  if (ops == null) return true;
  return normalizeCareerClassOps(ops).classes[classId].unlocked;
}

/**
 * Dev / cheat: every freighter class unlocked (does not bump hours/cleans).
 * Returns a fresh normalized copy — safe for gates without persisting.
 */
export function unlockAllCareerClassOps(
  ops?: CareerClassOps | null,
): CareerClassOps {
  const next = normalizeCareerClassOps(ops ?? undefined);
  for (const id of CLASS_OPS_CLASS_IDS) {
    next.classes[id].unlocked = true;
  }
  return next;
}

export function assertClassOpsUnlocked(
  ops: CareerClassOps | undefined,
  classId: FreighterClassId,
): void {
  if (classOpsIsUnlocked(ops, classId)) return;
  const progress = classOpsUnlockProgress(
    ops ?? emptyCareerClassOps(),
    classId,
  );
  throw new Error(
    progress.summary
      ? `Class locked: ${progress.label}. ${progress.summary}`
      : `Class locked: ${progress.label}`,
  );
}

/** Structural max cargo among unlocked classes. */
export function maxUnlockedCargoKg(ops: CareerClassOps | undefined): number {
  const normalized = normalizeCareerClassOps(ops);
  let max = 0;
  for (const id of CLASS_OPS_CLASS_IDS) {
    if (!normalized.classes[id].unlocked) continue;
    max = Math.max(max, CLASS_MAX_CARGO_KG[id] ?? 0);
  }
  return max;
}

/** True when a market lot is oversized for the player's unlocked classes. */
export function classOpsLotAboveBoard(
  ops: CareerClassOps | undefined,
  availableKg: number,
): boolean {
  if (!(availableKg > 0)) return false;
  const ceiling = maxUnlockedCargoKg(ops) * CLASS_OPS_BOARD_CARGO_SLACK;
  return availableKg > ceiling;
}

/**
 * Hide board rows a contract-pilot / empty-hangar starter cannot sit:
 * class-locked crew offers, or lots heavier than the unlocked cargo ceiling.
 * Crew-needed lots are often fully reserved (`availableKg` 0) — use claim kg.
 */
export function classOpsHidesBoardLot(
  ops: CareerClassOps | undefined,
  opts: {
    availableKg: number;
    crewNeeded?: boolean;
    claimCargoKg?: number;
    crewClassId?: string;
  },
): boolean {
  if (opts.crewNeeded) {
    const crewClass = CLASS_OPS_CLASS_IDS.find((id) => id === opts.crewClassId);
    if (crewClass && !classOpsIsUnlocked(ops, crewClass)) return true;
    const kg =
      typeof opts.claimCargoKg === 'number' &&
      Number.isFinite(opts.claimCargoKg) &&
      opts.claimCargoKg > 0
        ? opts.claimCargoKg
        : opts.availableKg;
    return classOpsLotAboveBoard(ops, kg);
  }
  return classOpsLotAboveBoard(ops, opts.availableKg);
}

export type ClassOpsUnlockProgress = {
  classId: FreighterClassId;
  label: string;
  unlocked: boolean;
  ready: boolean;
  summary: string;
};

const CLASS_LABEL: Record<FreighterClassId, string> = {
  light_ga: 'Light GA',
  light_turboprop: 'Light turboprop',
  light_jet: 'Light jet',
  medium_piston: 'Medium piston',
  narrow_freighter: 'Narrow',
  wide_freighter: 'Wide',
};

function formatHours(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function classOpsUnlockProgress(
  ops: CareerClassOps,
  classId: FreighterClassId,
): ClassOpsUnlockProgress {
  const normalized = normalizeCareerClassOps(ops);
  const label = CLASS_LABEL[classId];
  const row = normalized.classes[classId];

  if (isStarter(classId)) {
    return {
      classId,
      label,
      unlocked: true,
      ready: true,
      summary: '',
    };
  }

  if (classId === 'light_jet' || classId === 'medium_piston') {
    const unlocked = row.unlocked;
    const ready = branchReady(normalized);
    if (unlocked) {
      return { classId, label, unlocked: true, ready, summary: '' };
    }
    const h = starterHours(normalized);
    const c = starterCleans(normalized);
    return {
      classId,
      label,
      unlocked: false,
      ready,
      summary: `${formatHours(h)}/${CLASS_OPS_BRANCH_UNLOCK.hoursRequired} h · ${c}/${CLASS_OPS_BRANCH_UNLOCK.cleansRequired} cleans on Light GA / turboprop`,
    };
  }

  if (classId === 'narrow_freighter') {
    const unlocked = row.unlocked;
    const ready = narrowReady(normalized);
    if (unlocked) {
      return { classId, label, unlocked: true, ready, summary: '' };
    }
    const jet = normalized.classes.light_jet;
    const med = normalized.classes.medium_piston;
    const jetLine = jet.unlocked
      ? `Jet ${formatHours(jet.hours)}/${CLASS_OPS_NARROW_UNLOCK.hoursRequired} h · ${jet.cleans}/${CLASS_OPS_NARROW_UNLOCK.cleansRequired} cleans`
      : 'Jet locked';
    const medLine = med.unlocked
      ? `Medium ${formatHours(med.hours)}/${CLASS_OPS_NARROW_UNLOCK.hoursRequired} h · ${med.cleans}/${CLASS_OPS_NARROW_UNLOCK.cleansRequired} cleans`
      : 'Medium locked';
    return {
      classId,
      label,
      unlocked: false,
      ready,
      summary: `${jetLine}  OR  ${medLine}`,
    };
  }

  // wide_freighter
  const unlocked = row.unlocked;
  const ready = wideReady(normalized);
  if (unlocked) {
    return { classId, label, unlocked: true, ready, summary: '' };
  }
  const narrow = normalized.classes.narrow_freighter;
  if (!narrow.unlocked) {
    return {
      classId,
      label,
      unlocked: false,
      ready,
      summary: 'Unlock Narrow first',
    };
  }
  return {
    classId,
    label,
    unlocked: false,
    ready,
    summary: `${formatHours(narrow.hours)}/${CLASS_OPS_WIDE_UNLOCK.hoursRequired} h · ${narrow.cleans}/${CLASS_OPS_WIDE_UNLOCK.cleansRequired} cleans on Narrow`,
  };
}

/** Progress rows for Hangar UI (gated classes only). */
export const CLASS_OPS_PROGRESS_IDS: readonly FreighterClassId[] = [
  'light_jet',
  'medium_piston',
  'narrow_freighter',
  'wide_freighter',
] as const;

function scorePctOf(
  score: FlightScoreSnapshot | null | undefined,
): number | undefined {
  if (!score || typeof score.pct !== 'number' || !Number.isFinite(score.pct)) {
    return undefined;
  }
  return score.pct;
}

export type ClassOpsDelta = {
  classId: FreighterClassId;
  deltaHours: number;
  hoursAfter: number;
  clean: boolean;
  cleansAfter: number;
  unlockedNow: boolean;
};

/**
 * Credit block hours + optional clean settle on the mission's aircraft class.
 * Empty / ferry / deadhead legs must not call this (caller filters).
 */
export function applyClassOpsOnSettle(
  ops: CareerClassOps | undefined,
  mission: Pick<MissionIntent, 'aircraftClassId' | 'status'>,
  settlement: {
    onTime: boolean;
    blockHours: number;
    flightScore?: FlightScoreSnapshot | null;
  },
): { classOps: CareerClassOps; deltas: ClassOpsDelta[] } {
  const next = normalizeCareerClassOps(ops);
  const classId = mission.aircraftClassId;
  if (!isFreighterClassId(classId)) {
    return { classOps: next, deltas: [] };
  }

  const hours = clampHours(settlement.blockHours);
  if (hours <= 0) {
    return { classOps: next, deltas: [] };
  }

  const before = next.classes[classId];
  const unlockedSnapshot: Record<FreighterClassId, boolean> = {
    light_ga: next.classes.light_ga.unlocked,
    light_turboprop: next.classes.light_turboprop.unlocked,
    light_jet: next.classes.light_jet.unlocked,
    medium_piston: next.classes.medium_piston.unlocked,
    narrow_freighter: next.classes.narrow_freighter.unlocked,
    wide_freighter: next.classes.wide_freighter.unlocked,
  };
  const scorePct = scorePctOf(settlement.flightScore ?? undefined);
  const hasScore = scorePct !== undefined;
  // Without Watch score, on-time still counts (early career / soft settle).
  const scoreOk = hasScore ? scorePct! >= CLASS_OPS_CLEAN_SCORE : true;
  const clean = Boolean(settlement.onTime && scoreOk);

  const hoursAfter = clampHours(before.hours + hours);
  const cleansAfter = clean ? before.cleans + 1 : before.cleans;
  next.classes[classId] = {
    ...before,
    hours: hoursAfter,
    cleans: cleansAfter,
  };
  refreshClassOpsUnlocks(next);
  let unlockedNow = false;
  for (const id of CLASS_OPS_PROGRESS_IDS) {
    if (next.classes[id].unlocked && !unlockedSnapshot[id]) {
      unlockedNow = true;
      break;
    }
  }

  return {
    classOps: next,
    deltas: [
      {
        classId,
        deltaHours: hours,
        hoursAfter,
        clean,
        cleansAfter,
        unlockedNow,
      },
    ],
  };
}

export function formatClassOpsDeltas(deltas: ClassOpsDelta[]): string {
  if (deltas.length === 0) return '';
  return deltas
    .map((d) => {
      const clean = d.clean ? ' · clean' : '';
      const unlock = d.unlockedNow ? ' · unlocked' : '';
      return `${CLASS_LABEL[d.classId]} +${formatHours(d.deltaHours)}h→${formatHours(d.hoursAfter)}${clean}${unlock}`;
    })
    .join(' · ');
}
