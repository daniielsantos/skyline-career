import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  normalizeMacPercent,
  resolveCgEnvelope,
  type AircraftProfile,
} from '@msfs-compat/shared';
import { sweepCgEnvelope, type CgSweepResult } from './cg-sweep.js';
import { readFlightModelCg } from './flight-model-cg.js';
import { readLiveCgState } from './live-cg.js';
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
  cgEnvelope?: {
    minMac?: number;
    maxMac?: number;
    liveCg: number;
    source: NonNullable<AircraftProfile['cg']>['envelopeSource'];
    cfgPath?: string;
    sweep?: CgSweepResult;
  };
  updated: boolean;
  notes: string[];
}

export interface CalibrateProfileOptions {
  flightModelPath?: string;
  manualEnvelope?: { minMac: number; maxMac: number };
  runCgSweep?: boolean;
  sweepPayloadLb?: number;
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
  options: CalibrateProfileOptions = {},
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
    const useLvar = profile.fuel.strategy === 'lvar-bridge';

    let before: number;
    let after: number;
    if (useLvar) {
      before = await bridge.readLVar(writeVar);
      await bridge.writeLVar({ name: writeVar, value: probeTarget });
      await bridge.delay(400);
      after = await bridge.readLVar(writeVar);
    } else {
      before = await bridge.readSimVar({ name: writeVar, unit });
      await bridge.writeSimVar({ name: writeVar, unit, value: probeTarget });
      await bridge.delay(400);
      after = await bridge.readSimVar({ name: writeVar, unit });
    }

    const writeOffsetHint = roundOffset(probeTarget - after);
    const matchedRaw = Math.abs(after - probeTarget) <= Math.max(probeTarget * 0.05, 0.25);

    tanks.push({
      tankId: tank.id,
      writeVar,
      unit: useLvar ? 'lvar' : unit,
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

  // Record live CG + SimVar envelope (CG FWD/AFT LIMIT — same as Mass & Balance tablet).
  // Prefer: manual override > live SimVar limits > flight_model.cfg > stored profile.
  if (!profile.cg) {
    profile.cg = {
      readVar: 'CG PERCENT',
      readUnit: 'Percent over 100',
      constraints: {},
    };
  }
  const liveCgState = await readLiveCgState(bridge, {
    readVar: profile.cg.readVar,
    readUnit: profile.cg.readUnit,
  });
  let liveCg = liveCgState.liveMac;
  if (liveCg === undefined) {
    liveCg = normalizeMacPercent(
      await bridge.readSimVar({
        name: profile.cg.readVar ?? 'CG PERCENT',
        unit: profile.cg.readUnit ?? 'Percent over 100',
      }),
    );
  }
  const cfg = options.flightModelPath
    ? await readFlightModelCg(options.flightModelPath)
    : undefined;
  if (cfg) {
    for (const station of profile.payload.stations) {
      const arm = cfg.stationArms[station.index];
      if (arm !== undefined && station.arm !== arm) {
        station.arm = arm;
        updated = true;
      }
    }
  }

  const resolvedEnvelope = resolveCgEnvelope({
    manual: options.manualEnvelope,
    simvar:
      liveCgState.minMac !== undefined && liveCgState.maxMac !== undefined
        ? { minMac: liveCgState.minMac, maxMac: liveCgState.maxMac }
        : undefined,
    cfg: cfg ? { minMac: cfg.minMac, maxMac: cfg.maxMac } : undefined,
    profile: profile.cg.constraints,
    fallbackSource: profile.cg.envelopeSource === 'live-sweep' ? 'live-sweep' : 'calibrated-live',
  });
  let minMac = resolvedEnvelope.minMac;
  let maxMac = resolvedEnvelope.maxMac;
  let source: NonNullable<AircraftProfile['cg']>['envelopeSource'] =
    resolvedEnvelope.source;

  if (!profile.cg.constraints) {
    profile.cg.constraints = {};
  }
  if (
    profile.cg.constraints.minMac !== minMac ||
    profile.cg.constraints.maxMac !== maxMac
  ) {
    profile.cg.constraints.minMac = minMac;
    profile.cg.constraints.maxMac = maxMac;
    updated = true;
  }
  profile.cg.toleranceMac = Math.min(1, Math.max(0, profile.cg.toleranceMac ?? 0.5));
  profile.cg.envelopeSource = source;
  profile.cg.calibration = {
    ...profile.cg.calibration,
    observedMac: liveCg,
    calibratedAtIso: new Date().toISOString(),
    cfgPath: cfg?.path,
    emptyWeightCgPosition: cfg?.emptyWeightCgPosition,
  };

  let sweep: CgSweepResult | undefined;
  if (options.runCgSweep) {
    sweep = await sweepCgEnvelope(bridge, profile, {
      payloadLb: options.sweepPayloadLb,
    });
    if (!sweep.restored) {
      throw new Error('CG sweep completed but payload restoration could not be verified');
    }
    profile.cg.calibration.sweep = {
      minObservedMac: sweep.minObservedMac,
      maxObservedMac: sweep.maxObservedMac,
      payloadLb: sweep.payloadLb,
      forwardStation: sweep.forwardStation,
      aftStation: sweep.aftStation,
      usedStationArms: sweep.usedStationArms,
      restored: sweep.restored,
      sampledAtIso: sweep.sampledAtIso,
    };
    if (source === 'calibrated-live') {
      minMac = Math.floor(sweep.minObservedMac) - 1;
      maxMac = Math.ceil(sweep.maxObservedMac) + 1;
      profile.cg.constraints = { minMac, maxMac };
      source = 'live-sweep';
      profile.cg.envelopeSource = source;
    }
    updated = true;
  }

  const noteLines = [
    `AUTO-CALIBRATED fuelOffset=${fuelOffsetApplied} (median of ${tanks.length} tank probe(s)).`,
    `verify.tolerancePct=${tolerancePct}; cg envelope ${minMac ?? '?'}-${maxMac ?? '?'}% source=${source} (live CG≈${liveCg.toFixed(1)}).`,
    ...(sweep
      ? [
          `CG sweep ${sweep.minObservedMac.toFixed(1)}-${sweep.maxObservedMac.toFixed(1)}% with ${sweep.payloadLb} lb; restored=${sweep.restored}.`,
        ]
      : []),
    'Re-run smoke to confirm; then promote to profiles/examples.',
  ];
  profile.notes = [
    ...noteLines,
    ...(profile.notes ?? []).filter(
      (n) =>
        !n.startsWith('AUTO-CALIBRATED') &&
        !n.startsWith('AUTO-DRAFT') &&
        !n.startsWith('Draft calibrated') &&
        !n.startsWith('verify.tolerancePct') &&
        !n.startsWith('CG sweep'),
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
    cgEnvelope: {
      minMac,
      maxMac,
      liveCg,
      source,
      cfgPath: cfg?.path,
      sweep,
    },
    updated,
    notes: noteLines,
  };
}
