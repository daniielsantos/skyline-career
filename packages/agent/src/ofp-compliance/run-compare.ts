import {
  captureBaseline,
  compareOfpToLive,
  deriveCompliancePhase,
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
}

export async function compareOnce(
  bridge: NamedPipeSimBridge,
  opts: CompareOnceOptions,
): Promise<{
  snapshot: ComplianceSnapshot;
  live: Awaited<ReturnType<typeof readLiveLoad>>;
  nextBaseline?: ComplianceBaseline;
}> {
  const live = await readLiveLoad(bridge, {
    densityLbPerGal: opts.densityLbPerGal,
    stationRoles: opts.ofp.payload?.stationRoles,
    roleWeightUnit: opts.ofp.payload?.unit ?? opts.ofp.loadSheet?.unit ?? 'lb',
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
    let payloadLine = `  live payload total lb: ${p.total.toFixed(1)}`;
    if (p.baggageLb !== undefined) {
      payloadLine += `  baggage=${p.baggageLb.toFixed(1)}`;
    }
    if (p.estimatedPassengerCount !== undefined) {
      payloadLine += `  pax~${p.estimatedPassengerCount}`;
    }
    lines.push(payloadLine);
  }
  if (snap.liveWeights) {
    const w = snap.liveWeights;
    lines.push(
      `  live weights empty/ZFW/TOW lb: ${w.emptyLb?.toFixed(0) ?? '?'} / ${w.zfwLb?.toFixed(0) ?? '?'} / ${w.grossLb?.toFixed(0) ?? '?'}`,
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
