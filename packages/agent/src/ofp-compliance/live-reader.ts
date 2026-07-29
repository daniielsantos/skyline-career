import {
  DEFAULT_JET_A_LB_PER_GAL,
  applyPmdgEfbPayloadCorrection,
  enrichPayloadWithRoles,
  type LiveFuelState,
  type LivePayloadState,
  type LiveWeightState,
  type OfpStationRoleMap,
  type OfpWeightUnit,
} from '@msfs-compat/shared';
import type { SimSnapshot } from '@msfs-compat/runtime';
import type { NamedPipeSimBridge } from '../named-pipe-sim-bridge.js';

/** PMDG EFB Weight & Balance LVars (see PMDGTablet.js wb_update_interval). */
export const PMDG_EFB_LVARS = {
  grossWeight: 'L:GW_Lvar',
  grossCg: 'L:CG_GW_Lvar',
  zfw: 'L:ZFW_Lvar',
  zfwCg: 'L:CG_ZFW_Lvar',
  landingWeight: 'L:LW_Lvar',
  landingCg: 'L:CG_LW_Lvar',
} as const;

export interface LiveLoadReading {
  fuel: LiveFuelState;
  payload: LivePayloadState;
  weights: LiveWeightState;
  onGround: boolean;
  enginesRunning: boolean;
  /** Raw EFB LVars when readable. */
  pmdgEfb?: {
    gwLb?: number;
    zfwLb?: number;
    lwLb?: number;
  };
}

function galToLb(gal: number, densityLbPerGal: number): number {
  return Math.max(0, gal) * densityLbPerGal;
}

function saneWeight(n: number | undefined): number | undefined {
  if (n === undefined || !Number.isFinite(n) || n <= 0) {
    return undefined;
  }
  // PMDG EFB weights are in lb; reject tiny/placeholder noise.
  if (n < 1000) {
    return undefined;
  }
  return n;
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

async function readPmdgEfbLvars(
  bridge: NamedPipeSimBridge,
): Promise<{ gwLb?: number; zfwLb?: number; lwLb?: number }> {
  const read = async (name: string): Promise<number | undefined> => {
    try {
      return saneWeight(await bridge.readLVar(name));
    } catch {
      return undefined;
    }
  };
  const [gwLb, zfwLb, lwLb] = await Promise.all([
    read(PMDG_EFB_LVARS.grossWeight),
    read(PMDG_EFB_LVARS.zfw),
    read(PMDG_EFB_LVARS.landingWeight),
  ]);
  return { gwLb, zfwLb, lwLb };
}

/**
 * Prefer PMDG NG3 fuel Client Data + EFB LVars (ZFW/GW) for weights/cargo.
 * Classic PAYLOAD STATION cargo is unreliable after SimBrief EFB load.
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
  let weights = weightsFromSnapshot(snapshot, fuel.total, payload.ofpPayloadLb ?? payload.total);

  const pmdgEfb = await readPmdgEfbLvars(bridge);
  if (pmdgEfb.zfwLb !== undefined || pmdgEfb.gwLb !== undefined) {
    weights = {
      ...weights,
      source: 'pmdg-efb-lvars',
      zfwLb: pmdgEfb.zfwLb ?? weights.zfwLb,
      grossLb: pmdgEfb.gwLb ?? weights.grossLb,
      landingLb: pmdgEfb.lwLb,
    };
    const corrected = applyPmdgEfbPayloadCorrection(payload, weights, opts.stationRoles);
    payload = corrected.payload;
    weights = corrected.weights;
  }

  return {
    fuel,
    payload,
    weights,
    onGround: snapshot.onGround,
    enginesRunning: snapshot.enginesRunning,
    pmdgEfb,
  };
}
