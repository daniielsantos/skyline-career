import {
  DEFAULT_JET_A_LB_PER_GAL,
  enrichPayloadWithRoles,
  type LiveFuelState,
  type LivePayloadState,
  type LiveWeightState,
  type OfpStationRoleMap,
  type OfpWeightUnit,
} from '@msfs-compat/shared';
import type { SimSnapshot } from '@msfs-compat/runtime';
import type { NamedPipeSimBridge } from '../named-pipe-sim-bridge.js';

export interface LiveLoadReading {
  fuel: LiveFuelState;
  payload: LivePayloadState;
  weights: LiveWeightState;
  onGround: boolean;
  enginesRunning: boolean;
}

function galToLb(gal: number, densityLbPerGal: number): number {
  return Math.max(0, gal) * densityLbPerGal;
}

export function payloadFromSnapshot(snapshot: SimSnapshot): LivePayloadState {
  const stations: Record<number, number> = {};
  let total = 0;
  for (const [name, value] of Object.entries(snapshot.vars ?? {})) {
    const m = /^PAYLOAD STATION WEIGHT:(\d+)$/i.exec(name);
    if (!m) {
      continue;
    }
    const index = Number(m[1]);
    if (!Number.isFinite(index) || !Number.isFinite(value)) {
      continue;
    }
    stations[index] = value;
    total += value;
  }
  if (total === 0 && snapshot.payloadTotal !== undefined && Number.isFinite(snapshot.payloadTotal)) {
    total = snapshot.payloadTotal;
  }
  return {
    source: 'classic-stations',
    unit: 'lb',
    stations,
    total,
  };
}

export function weightsFromSnapshot(
  snapshot: SimSnapshot,
  fuelTotalLb: number,
  payloadTotalLb: number,
): LiveWeightState {
  const emptyLb = snapshot.vars?.['EMPTY WEIGHT'];
  const grossLb = snapshot.grossWeightLb ?? snapshot.vars?.['TOTAL WEIGHT'];
  const maxGrossLb = snapshot.vars?.['MAX GROSS WEIGHT'];
  const zfwLb =
    grossLb !== undefined && Number.isFinite(grossLb)
      ? Math.max(0, grossLb - fuelTotalLb)
      : emptyLb !== undefined && Number.isFinite(emptyLb)
        ? emptyLb + payloadTotalLb
        : undefined;

  return {
    source: 'classic-weights',
    unit: 'lb',
    emptyLb: emptyLb !== undefined && Number.isFinite(emptyLb) ? emptyLb : undefined,
    grossLb: grossLb !== undefined && Number.isFinite(grossLb) ? grossLb : undefined,
    maxGrossLb: maxGrossLb !== undefined && Number.isFinite(maxGrossLb) ? maxGrossLb : undefined,
    zfwLb,
    fuelLb: fuelTotalLb,
    payloadLb: payloadTotalLb,
  };
}

export function fuelFromClassicSnapshot(
  snapshot: SimSnapshot,
  densityLbPerGal = DEFAULT_JET_A_LB_PER_GAL,
): LiveFuelState {
  const leftGal = snapshot.vars?.['FUEL TANK LEFT MAIN QUANTITY'] ?? 0;
  const rightGal = snapshot.vars?.['FUEL TANK RIGHT MAIN QUANTITY'] ?? 0;
  const centerGal = snapshot.vars?.['FUEL TANK CENTER QUANTITY'] ?? 0;
  const left = galToLb(leftGal, densityLbPerGal);
  const right = galToLb(rightGal, densityLbPerGal);
  const center = galToLb(centerGal, densityLbPerGal);
  return {
    source: 'classic',
    unit: 'lb',
    left,
    right,
    center,
    total: left + right + center,
  };
}

/**
 * Prefer PMDG NG3 Client Data (lb). Fall back to classic gallons × density.
 * Applies optional station role map for baggage / pax estimate.
 */
export async function readLiveLoad(
  bridge: NamedPipeSimBridge,
  opts: {
    densityLbPerGal?: number;
    stationRoles?: OfpStationRoleMap;
    roleWeightUnit?: OfpWeightUnit;
  } = {},
): Promise<LiveLoadReading> {
  const density = opts.densityLbPerGal ?? DEFAULT_JET_A_LB_PER_GAL;
  const snapshot = await bridge.snapshot();
  let payload = payloadFromSnapshot(snapshot);

  let fuel: LiveFuelState | undefined;
  try {
    const sdk = await bridge.readPmdgNg3Fuel();
    if (
      sdk.available &&
      sdk.layoutOk &&
      sdk.leftLb !== undefined &&
      sdk.rightLb !== undefined &&
      sdk.centerLb !== undefined
    ) {
      const left = sdk.leftLb;
      const right = sdk.rightLb;
      const center = sdk.centerLb;
      fuel = {
        source: 'pmdg-ng3',
        unit: 'lb',
        left,
        right,
        center,
        total: left + right + center,
        ageMs: sdk.ageMs,
      };
    }
  } catch {
    // Classic fallback below.
  }

  if (!fuel) {
    fuel = fuelFromClassicSnapshot(snapshot, density);
  }

  payload = enrichPayloadWithRoles(payload, opts.stationRoles, opts.roleWeightUnit ?? 'lb');
  const weights = weightsFromSnapshot(snapshot, fuel.total, payload.total);

  return {
    fuel,
    payload,
    weights,
    onGround: snapshot.onGround,
    enginesRunning: snapshot.enginesRunning,
  };
}
