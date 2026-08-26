import {
  captureBaseline,
  compareOfpToLive,
  DEFAULT_AVGAS_LB_PER_GAL,
  DEFAULT_JET_A_LB_PER_GAL,
  deriveCompliancePhase,
  resolveAveragePassengerWeight,
  sanitizeFuelDensityLbPerGal,
  toLb,
  type ComplianceBaseline,
  type ComplianceSnapshot,
  type LiveFuelState,
  type OfpExpectation,
} from '@msfs-compat/shared';
import type { NamedPipeSimBridge } from '../named-pipe-sim-bridge.js';
import { readSimVarsSoft } from '../read-simvars-soft.js';
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
  const [dens, left, right, center, cap] = await readSimVarsSoft(bridge, [
    { name: 'FUEL WEIGHT PER GALLON', unit: 'pounds' },
    { name: 'FUEL TANK LEFT MAIN QUANTITY', unit: 'gallons' },
    { name: 'FUEL TANK RIGHT MAIN QUANTITY', unit: 'gallons' },
    { name: 'FUEL TANK CENTER QUANTITY', unit: 'gallons' },
    { name: 'FUEL TOTAL CAPACITY', unit: 'gallons' },
  ]);
  const quantityGal =
    (Number.isFinite(left) ? left! : 0) +
    (Number.isFinite(right) ? right! : 0) +
    (Number.isFinite(center) ? center! : 0);
  const capacityGal =
    Number.isFinite(cap) && cap! > 0 ? cap : undefined;
  // Use tank capacity (not quantity aboard) so a half-full Kodiak is not treated as GA.
  const sizeGal = capacityGal ?? quantityGal;
  const lightPiston = sizeGal > 0 && sizeGal <= 120;
  if (dens !== undefined && Number.isFinite(dens) && dens > 4 && dens < 9) {
    if (lightPiston && dens >= 6.45) return DEFAULT_AVGAS_LB_PER_GAL;
    return sanitizeFuelDensityLbPerGal(dens, { totalCapacityGal: sizeGal });
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
    ofpEmptyLb:
      opts.ofp.loadSheet?.emptyWeight !== undefined
        ? toLb(
            opts.ofp.loadSheet.emptyWeight,
            opts.ofp.loadSheet.unit ?? opts.ofp.fuel.unit ?? 'lb',
          )
        : undefined,
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
