import {
  captureBaseline,
  compareOfpToLive,
  DEFAULT_AVGAS_LB_PER_GAL,
  DEFAULT_JET_A_LB_PER_GAL,
  deriveCompliancePhase,
  resolveAveragePassengerWeight,
  type ComplianceBaseline,
  type ComplianceSnapshot,
  type LiveFuelState,
  type OfpExpectation,
} from '@msfs-compat/shared';
import type { NamedPipeSimBridge } from '../named-pipe-sim-bridge.js';
import { readLiveLoad } from './live-reader.js';

export interface CompareOnceOptions {
  ofp: OfpExpectation;
  locked?: boolean;
  densityLbPerGal?: number;
  baseline?: ComplianceBaseline;
  previousFuel?: LiveFuelState;
  previousAtMs?: number;
  previousStationSumLb?: number;
}

/** Prefer avgas for light piston when MSFS reports Jet-A density on small tanks. */
export async function resolveLiveFuelDensityLbPerGal(
  bridge: NamedPipeSimBridge,
): Promise<number> {
  let dens: number | undefined;
  try {
    dens = await bridge.readSimVar({
      name: 'FUEL WEIGHT PER GALLON',
      unit: 'pounds',
    });
  } catch {
    dens = undefined;
  }
  let gallons = 0;
  try {
    const [left, right, center] = await Promise.all([
      bridge.readSimVar({ name: 'FUEL TANK LEFT MAIN QUANTITY', unit: 'gallons' }),
      bridge.readSimVar({ name: 'FUEL TANK RIGHT MAIN QUANTITY', unit: 'gallons' }),
      bridge.readSimVar({ name: 'FUEL TANK CENTER QUANTITY', unit: 'gallons' }),
    ]);
    gallons =
      (Number.isFinite(left) ? left : 0) +
      (Number.isFinite(right) ? right : 0) +
      (Number.isFinite(center) ? center : 0);
  } catch {
    gallons = 0;
  }
  const lightPiston = gallons > 0 && gallons <= 120;
  if (dens !== undefined && Number.isFinite(dens) && dens > 4 && dens < 9) {
    if (lightPiston && dens >= 6.45) return DEFAULT_AVGAS_LB_PER_GAL;
    return dens;
  }
  return lightPiston ? DEFAULT_AVGAS_LB_PER_GAL : DEFAULT_JET_A_LB_PER_GAL;
}

export async function compareOnce(
  bridge: NamedPipeSimBridge,
  opts: CompareOnceOptions,
): Promise<{
  snapshot: ComplianceSnapshot;
  live: Awaited<ReturnType<typeof readLiveLoad>>;
  nextBaseline?: ComplianceBaseline;
}> {
  const baseRoles = opts.ofp.payload?.stationRoles;
  const resolvedAvg = resolveAveragePassengerWeight(opts.ofp);
  const stationRoles =
    baseRoles && resolvedAvg && baseRoles.averagePassengerWeight === undefined
      ? { ...baseRoles, averagePassengerWeight: resolvedAvg.weight }
      : baseRoles;
  const roleWeightUnit =
    resolvedAvg?.unit ?? opts.ofp.payload?.unit ?? opts.ofp.loadSheet?.unit ?? 'lb';

  const densityLbPerGal =
    opts.densityLbPerGal ?? (await resolveLiveFuelDensityLbPerGal(bridge));

  const live = await readLiveLoad(bridge, {
    densityLbPerGal,
    stationRoles,
    roleWeightUnit,
    liveSources: opts.ofp.liveSources,
    previousStationSumLb: opts.previousStationSumLb,
  });
  const phase = deriveCompliancePhase(
    { onGround: live.onGround, enginesRunning: live.enginesRunning },
    { locked: opts.locked },
  );

  let baseline = opts.baseline;
  let nextBaseline: ComplianceBaseline | undefined;
  if ((phase === 'locked' || phase === 'airborne') && !baseline) {
    baseline = captureBaseline(live.fuel, live.payload, live.weights);
    nextBaseline = baseline;
  }

  const snapshot = compareOfpToLive({
    ofp: opts.ofp,
    liveFuel: live.fuel,
    livePayload: live.payload,
    liveWeights: live.weights,
    phase,
    baseline,
    previousFuel: opts.previousFuel,
    previousAtMs: opts.previousAtMs,
  });

  return { snapshot, live, nextBaseline };
}

export function formatComplianceSummary(snap: ComplianceSnapshot): string {
  const fuel = snap.liveFuel;
  const lines = [
    `verdict=${snap.verdict} phase=${snap.phase} fuelSource=${fuel.source}`,
    `  live fuel L/R/C/total lb: ${fuel.left.toFixed(1)} / ${fuel.right.toFixed(1)} / ${fuel.center.toFixed(1)} / ${fuel.total.toFixed(1)}`,
  ];
  if (snap.livePayload) {
    const p = snap.livePayload;
    let payloadLine = `  live payload[${p.source}] stations=${p.total.toFixed(1)}`;
    if (p.ofpPayloadLb !== undefined) {
      payloadLine += `  ofpPayload(pax+bags)=${p.ofpPayloadLb.toFixed(1)}`;
    }
    if (p.baggageLb !== undefined) {
      payloadLine += `  baggage=${p.baggageLb.toFixed(1)}`;
    }
    if (p.passengerWeightLb !== undefined) {
      payloadLine += `  paxWt=${p.passengerWeightLb.toFixed(1)}`;
    }
    if (p.estimatedPassengerCount !== undefined) {
      payloadLine += `  pax~${p.estimatedPassengerCount}`;
    }
    lines.push(payloadLine);
  }
  if (snap.liveWeights) {
    const w = snap.liveWeights;
    lines.push(
      `  live weights[${w.source}] empty/ZFW/TOW lb: ${w.emptyLb?.toFixed(0) ?? '?'} / ${w.zfwLb?.toFixed(0) ?? '?'} / ${w.grossLb?.toFixed(0) ?? '?'}`,
    );
  }
  for (const f of snap.findings) {
    lines.push(`  [${f.severity}] ${f.code}: ${f.message}`);
  }
  if (snap.findings.length === 0) {
    lines.push('  (no findings)');
  }
  return lines.join('\n');
}
