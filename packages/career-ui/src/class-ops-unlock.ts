/**
 * Browser-side Class Ops unlock helpers (mirrors @msfs-compat/shared career-class-ops).
 */
import type { AircraftClass, CareerClassOps } from './api';

export const CLASS_OPS_PROGRESS_IDS: readonly AircraftClass[] = [
  'light_jet',
  'medium_piston',
  'narrow_freighter',
  'wide_freighter',
];

const CLASS_LABEL: Record<AircraftClass, string> = {
  light_ga: 'Light GA',
  light_turboprop: 'Light turboprop',
  light_jet: 'Light jet',
  medium_piston: 'Medium piston',
  narrow_freighter: 'Narrow',
  wide_freighter: 'Wide',
};

const BRANCH = { hoursRequired: 20, cleansRequired: 6 } as const;
const NARROW = { hoursRequired: 25, cleansRequired: 5 } as const;
const WIDE = { hoursRequired: 40, cleansRequired: 8 } as const;

function formatHours(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function starterHours(ops: CareerClassOps): number {
  return (
    (ops.classes.light_ga?.hours ?? 0) +
    (ops.classes.light_turboprop?.hours ?? 0)
  );
}

function starterCleans(ops: CareerClassOps): number {
  return (
    (ops.classes.light_ga?.cleans ?? 0) +
    (ops.classes.light_turboprop?.cleans ?? 0)
  );
}

function statsLine(hours: number, cleans: number): string {
  return `${formatHours(hours)} h · ${cleans} clean settle${cleans === 1 ? '' : 's'}`;
}

export function classOpsIsUnlocked(
  ops: CareerClassOps | null | undefined,
  classId: AircraftClass,
): boolean {
  if (!ops?.classes) return true;
  return Boolean(ops.classes[classId]?.unlocked);
}

export function classOpsUnlockProgress(
  ops: CareerClassOps | null | undefined,
  classId: AircraftClass,
): { unlocked: boolean; summary: string; label: string } {
  const label = CLASS_LABEL[classId];
  if (!ops?.classes) {
    return { unlocked: true, summary: 'Open', label };
  }
  const row = ops.classes[classId];
  const unlocked = Boolean(row?.unlocked);
  const hours = row?.hours ?? 0;
  const cleans = row?.cleans ?? 0;

  if (classId === 'light_ga' || classId === 'light_turboprop') {
    return {
      unlocked: true,
      summary: `Starter · ${statsLine(hours, cleans)}`,
      label,
    };
  }

  if (classId === 'light_jet' || classId === 'medium_piston') {
    if (unlocked) {
      return {
        unlocked: true,
        label,
        summary: statsLine(hours, cleans),
      };
    }
    const h = starterHours(ops);
    const c = starterCleans(ops);
    return {
      unlocked: false,
      label,
      summary: `${formatHours(h)}/${BRANCH.hoursRequired} h · ${c}/${BRANCH.cleansRequired} cleans on Light GA / turboprop`,
    };
  }

  if (classId === 'narrow_freighter') {
    if (unlocked) {
      return {
        unlocked: true,
        label,
        summary: statsLine(hours, cleans),
      };
    }
    const jet = ops.classes.light_jet;
    const med = ops.classes.medium_piston;
    const jetLine = jet?.unlocked
      ? `Jet ${formatHours(jet.hours ?? 0)}/${NARROW.hoursRequired} h · ${jet.cleans ?? 0}/${NARROW.cleansRequired} cleans`
      : 'Jet locked';
    const medLine = med?.unlocked
      ? `Medium ${formatHours(med.hours ?? 0)}/${NARROW.hoursRequired} h · ${med.cleans ?? 0}/${NARROW.cleansRequired} cleans`
      : 'Medium locked';
    return { unlocked: false, label, summary: `${jetLine}  OR  ${medLine}` };
  }

  if (unlocked) {
    return {
      unlocked: true,
      label,
      summary: statsLine(hours, cleans),
    };
  }
  const narrow = ops.classes.narrow_freighter;
  if (!narrow?.unlocked) {
    return { unlocked: false, label, summary: 'Unlock Narrow first' };
  }
  return {
    unlocked: false,
    label,
    summary: `${formatHours(narrow.hours ?? 0)}/${WIDE.hoursRequired} h · ${narrow.cleans ?? 0}/${WIDE.cleansRequired} cleans on Narrow`,
  };
}

/** First locked ladder step the player is working toward (or null if all open). */
export function classOpsNextUnlock(ops: CareerClassOps | null | undefined): {
  classId: AircraftClass;
  label: string;
  summary: string;
} | null {
  if (!ops?.classes) return null;
  for (const id of CLASS_OPS_PROGRESS_IDS) {
    const progress = classOpsUnlockProgress(ops, id);
    if (!progress.unlocked) {
      return {
        classId: id,
        label: progress.label,
        summary: progress.summary,
      };
    }
  }
  return null;
}
