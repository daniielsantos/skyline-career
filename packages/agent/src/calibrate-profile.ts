import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AircraftProfile } from '@msfs-compat/shared';
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';

export interface TankCalibration {
  tankId: string;
  writeVar: string;
  unit: string;
  capacity: number;
  probeTarget: number;
  before: number;
  after: number;
  writeOffsetHint: number;
  matchedRaw: boolean;
}

export interface CalibrateResult {
  path: string;
  identityTitle?: string;
  fuelOffsetApplied: number;
  tanks: TankCalibration[];
  tolerancePct: number;
  cgEnvelope?: { minMac: number; maxMac: number; liveCg: number };
  updated: boolean;
  notes: string[];
}

function roundOffset(value: number): number {
  // Quantize to 0.1 gal — matches observed MSFS unusable-fuel offsets.
  return Math.round(value * 10) / 10;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

/**
 * Probe each profile fuel tank, measure write→read offset, and patch writePlan + verify tolerance.
 */
export async function calibrateProfile(
  bridge: NamedPipeSimBridge,
  profilePath: string,
): Promise<CalibrateResult> {
  const path = resolve(profilePath);
  const profile = JSON.parse(await readFile(path, 'utf8')) as AircraftProfile;

  const identity = await bridge.getAircraftIdentity().catch(() => null);
  const tanks: TankCalibration[] = [];

  for (const tank of profile.fuel.tanks) {
    const writeVar = tank.writeVar ?? tank.readVar;
    if (!writeVar) {
      continue;
    }
    const unit = tank.writeUnit || tank.readUnit || profile.fuel.unit || 'gallons';
    const capacity = tank.capacity !== undefined && tank.capacity > 0 ? tank.capacity : 40;
    // Stay under capacity so clamping does not inflate the offset hint.
    const probeTarget = Math.max(5, Math.floor(capacity * 0.75));

    const before = await bridge.readSimVar({ name: writeVar, unit });
    await bridge.writeSimVar({ name: writeVar, unit, value: probeTarget });
    await bridge.delay(400);
    const after = await bridge.readSimVar({ name: writeVar, unit });

    const writeOffsetHint = roundOffset(probeTarget - after);
    const matchedRaw = Math.abs(after - probeTarget) <= Math.max(probeTarget * 0.05, 0.25);

    tanks.push({
      tankId: tank.id,
      writeVar,
      unit,
      capacity,
      probeTarget,
      before,
      after,
      writeOffsetHint,
      matchedRaw,
    });
  }

  const offsets = tanks.map((t) => t.writeOffsetHint).filter((o) => Number.isFinite(o));
  const fuelOffsetApplied = roundOffset(median(offsets));

  // Residual after offset → tolerance floor 2%, bump if probe still noisy.
  let maxResidualPct = 2;
  for (const t of tanks) {
    const compensated = t.probeTarget; // we measured raw write; residual vs target is |hint|
    const residual = Math.abs(t.writeOffsetHint - fuelOffsetApplied);
    const pct = compensated > 0 ? (residual / compensated) * 100 : 0;
    maxResidualPct = Math.max(maxResidualPct, Math.ceil(pct + 1));
  }
  const tolerancePct = Math.min(8, maxResidualPct);

  let updated = false;
  const tankByVar = new Map(
    profile.fuel.tanks
      .filter((t) => t.writeVar ?? t.readVar)
      .map((t) => [t.writeVar ?? t.readVar!, t]),
  );

  for (const step of profile.fuel.writePlan) {
    if (step.op !== 'simvar_set' || !step.var) continue;
    const tank = tankByVar.get(step.var);
    if (!tank) continue;
    const nextExpr =
      fuelOffsetApplied > 0
        ? `{${tank.id}} + ${fuelOffsetApplied}`
        : fuelOffsetApplied < 0
          ? `{${tank.id}} - ${Math.abs(fuelOffsetApplied)}`
          : `{${tank.id}}`;
    if (step.valueExpr !== nextExpr) {
      step.valueExpr = nextExpr;
      updated = true;
    }
  }

  for (const check of profile.fuel.verify.checks) {
    if (check.tolerancePct !== tolerancePct) {
      check.tolerancePct = tolerancePct;
      updated = true;
    }
  }

  // Expand CG envelope around the live CG (Asobo twins often sit near 5–10% MAC).
  if (!profile.cg) {
    profile.cg = {
      readVar: 'CG PERCENT',
      readUnit: 'Percent over 100',
      constraints: {},
    };
  }
  let liveCg = await bridge.readSimVar({
    name: profile.cg.readVar ?? 'CG PERCENT',
    unit: profile.cg.readUnit ?? 'Percent over 100',
  });
  if (liveCg <= 1.5) {
    liveCg *= 100;
  }
  const minMac = Math.max(0, Math.floor(liveCg) - 15);
  const maxMac = Math.min(100, Math.ceil(liveCg) + 20);
  if (!profile.cg.constraints) {
    profile.cg.constraints = {};
  }
  if (profile.cg.constraints.minMac !== minMac || profile.cg.constraints.maxMac !== maxMac) {
    profile.cg.constraints.minMac = minMac;
    profile.cg.constraints.maxMac = maxMac;
    updated = true;
  }

  const noteLines = [
    `AUTO-CALIBRATED fuelOffset=${fuelOffsetApplied} (median of ${tanks.length} tank probe(s)).`,
    `verify.tolerancePct=${tolerancePct}; cg envelope ${minMac}-${maxMac}% (live CG≈${liveCg.toFixed(1)}).`,
    'Re-run smoke to confirm; then promote to profiles/examples.',
  ];
  profile.notes = [
    ...noteLines,
    ...(profile.notes ?? []).filter(
      (n) =>
        !n.startsWith('AUTO-CALIBRATED') &&
        !n.startsWith('AUTO-DRAFT') &&
        !n.startsWith('Draft calibrated') &&
        !n.startsWith('verify.tolerancePct'),
    ),
  ];

  await writeFile(path, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
  updated = true;

  return {
    path,
    identityTitle: identity?.title,
    fuelOffsetApplied,
    tanks,
    tolerancePct,
    cgEnvelope: { minMac, maxMac, liveCg },
    updated,
    notes: noteLines,
  };
}
