import {
  DEFAULT_JET_A_LB_PER_GAL,
  applyPmdgEfbPayloadCorrection,
  enrichPayloadWithRoles,
  resolveLiveSourcePrefs,
  toLb,
  type LiveFuelState,
  type LivePayloadState,
  type LiveWeightState,
  type OfpLiveSources,
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

/** TFDi MD-11 EFB payload panel (efb.js setPayload → L:MD11_EFB_PAYLOAD_*). */
export const TFDI_MD11_EFB_LVARS = {
  grossWeight: 'L:MD11_EFB_PAYLOAD_GW',
  zfw: 'L:MD11_EFB_PAYLOAD_ZFW',
  payload: 'L:MD11_EFB_PAYLOAD_PAYLOAD',
  fuel: 'L:MD11_EFB_PAYLOAD_FUEL',
  load: 'L:MD11_EFB_PAYLOAD_LOAD',
} as const;

export interface LiveLoadReading {
  fuel: LiveFuelState;
  payload: LivePayloadState;
  weights: LiveWeightState;
  onGround: boolean;
  enginesRunning: boolean;
  pmdgEfb?: {
    gwLb?: number;
    zfwLb?: number;
    lwLb?: number;
  };
  tfdiEfb?: {
    gwLb?: number;
    zfwLb?: number;
    payloadLb?: number;
    fuelLb?: number;
  };
}

function galToLb(gal: number, densityLbPerGal: number): number {
  return Math.max(0, gal) * densityLbPerGal;
}

function saneWeight(n: number | undefined): number | undefined {
  if (n === undefined || !Number.isFinite(n) || n <= 0) {
    return undefined;
  }
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

export function fuelFromMassBalance(
  snapshot: SimSnapshot,
  payloadStationsTotalLb: number,
): LiveFuelState | undefined {
  const emptyLb = snapshot.vars?.['EMPTY WEIGHT'];
  const grossLb = snapshot.grossWeightLb ?? snapshot.vars?.['TOTAL WEIGHT'];
  if (
    emptyLb === undefined ||
    !Number.isFinite(emptyLb) ||
    grossLb === undefined ||
    !Number.isFinite(grossLb)
  ) {
    return undefined;
  }
  const total = Math.max(0, grossLb - emptyLb - Math.max(0, payloadStationsTotalLb));
  if (total < 100) {
    return undefined;
  }
  return {
    source: 'mass-balance',
    unit: 'lb',
    left: 0,
    right: 0,
    center: 0,
    total,
  };
}

export function preferMassBalanceFuel(
  tankFuel: LiveFuelState,
  massBalance: LiveFuelState | undefined,
): LiveFuelState {
  if (!massBalance) {
    return tankFuel;
  }
  if (tankFuel.total < massBalance.total * 0.92 && massBalance.total - tankFuel.total > 500) {
    return massBalance;
  }
  return tankFuel;
}

async function readLvarWeight(
  bridge: NamedPipeSimBridge,
  name: string,
): Promise<number | undefined> {
  try {
    return saneWeight(await bridge.readLVar(name));
  } catch {
    return undefined;
  }
}

async function readPmdgEfbLvars(
  bridge: NamedPipeSimBridge,
): Promise<{ gwLb?: number; zfwLb?: number; lwLb?: number }> {
  const [gwLb, zfwLb, lwLb] = await Promise.all([
    readLvarWeight(bridge, PMDG_EFB_LVARS.grossWeight),
    readLvarWeight(bridge, PMDG_EFB_LVARS.zfw),
    readLvarWeight(bridge, PMDG_EFB_LVARS.landingWeight),
  ]);
  return { gwLb, zfwLb, lwLb };
}

async function readTfdiMd11EfbLvars(
  bridge: NamedPipeSimBridge,
): Promise<{ gwLb?: number; zfwLb?: number; payloadLb?: number; fuelLb?: number }> {
  // EFB UI shows ×1000 lb, but L:MD11_EFB_PAYLOAD_* store kilograms.
  const readKgAsLb = async (name: string): Promise<number | undefined> => {
    try {
      const kg = await bridge.readLVar(name);
      if (!Number.isFinite(kg) || kg <= 0) {
        return undefined;
      }
      const lb = toLb(kg, 'kg');
      return lb >= 1000 ? lb : undefined;
    } catch {
      return undefined;
    }
  };
  const [gwLb, zfwLb, payloadLb, fuelLb] = await Promise.all([
    readKgAsLb(TFDI_MD11_EFB_LVARS.grossWeight),
    readKgAsLb(TFDI_MD11_EFB_LVARS.zfw),
    readKgAsLb(TFDI_MD11_EFB_LVARS.payload),
    readKgAsLb(TFDI_MD11_EFB_LVARS.fuel),
  ]);
  return { gwLb, zfwLb, payloadLb, fuelLb };
}

function wants(
  prefs: string[],
  ...sources: string[]
): boolean {
  return sources.some((s) => prefs.includes(s));
}

/**
 * Read live fuel/payload/weights using pack-declared liveSources when present.
 * Without liveSources, uses discovery cascade (probe all known vendor paths).
 */
export async function readLiveLoad(
  bridge: NamedPipeSimBridge,
  opts: {
    densityLbPerGal?: number;
    stationRoles?: OfpStationRoleMap;
    roleWeightUnit?: OfpWeightUnit;
    liveSources?: OfpLiveSources;
  } = {},
): Promise<LiveLoadReading> {
  const prefs = resolveLiveSourcePrefs(opts.liveSources);
  const density = opts.densityLbPerGal ?? DEFAULT_JET_A_LB_PER_GAL;
  const snapshot = await bridge.snapshot();
  // The fixed native snapshot may expose fewer stations than a homologated
  // profile (for example Caravan cargo station 15). Hydrate every mapped role
  // directly so OFP verification covers the full injected load.
  const mappedStations = new Set<number>([
    ...(opts.stationRoles?.passengerStations ?? []),
    ...(opts.stationRoles?.baggageStations ?? []),
    ...(opts.stationRoles?.crewStations ?? []),
    ...(opts.stationRoles?.serviceStations ?? []),
  ]);
  for (const index of mappedStations) {
    const key = `PAYLOAD STATION WEIGHT:${index}`;
    if (snapshot.vars[key] !== undefined) continue;
    try {
      snapshot.vars[key] = await bridge.readSimVar({
        name: key,
        unit: 'pounds',
      });
    } catch {
      // Keep partial snapshot; compare will surface an unavailable/mismatch finding.
    }
  }
  let payload = payloadFromSnapshot(snapshot);
  payload = enrichPayloadWithRoles(payload, opts.stationRoles, opts.roleWeightUnit ?? 'lb');

  const needPmdgNg3 = wants(prefs.fuel, 'pmdg-ng3');
  const needPmdgEfb = wants(prefs.weights, 'pmdg-efb-lvars') || wants(prefs.payload, 'pmdg-efb');
  const needTfdiEfb =
    wants(prefs.fuel, 'tfdi-efb') ||
    wants(prefs.weights, 'tfdi-efb-lvars') ||
    wants(prefs.payload, 'tfdi-efb');

  let pmdgEfb: LiveLoadReading['pmdgEfb'];
  let tfdiEfb: LiveLoadReading['tfdiEfb'];
  if (needPmdgEfb) {
    pmdgEfb = await readPmdgEfbLvars(bridge);
  }
  if (needTfdiEfb) {
    tfdiEfb = await readTfdiMd11EfbLvars(bridge);
  }

  let fuel: LiveFuelState | undefined;
  for (const src of prefs.fuel) {
    if (src === 'pmdg-ng3' && needPmdgNg3) {
      try {
        const sdk = await bridge.readPmdgNg3Fuel();
        if (
          sdk.available &&
          sdk.layoutOk &&
          sdk.leftLb !== undefined &&
          sdk.rightLb !== undefined &&
          sdk.centerLb !== undefined
        ) {
          fuel = {
            source: 'pmdg-ng3',
            unit: 'lb',
            left: sdk.leftLb,
            right: sdk.rightLb,
            center: sdk.centerLb,
            total: sdk.leftLb + sdk.rightLb + sdk.centerLb,
            ageMs: sdk.ageMs,
          };
          break;
        }
      } catch {
        // try next preference
      }
    }
    if (src === 'classic') {
      fuel = fuelFromClassicSnapshot(snapshot, density);
      // May still upgrade to mass-balance if both are in prefs and classic under-reads.
      if (prefs.fuel.includes('mass-balance')) {
        const mb = fuelFromMassBalance(snapshot, payload.total);
        fuel = preferMassBalanceFuel(fuel, mb);
        if (fuel.source === 'mass-balance') {
          break;
        }
      }
      break;
    }
    if (src === 'mass-balance') {
      const mb = fuelFromMassBalance(snapshot, payload.total);
      if (mb) {
        fuel = mb;
        break;
      }
    }
    if (src === 'tfdi-efb' && tfdiEfb?.fuelLb !== undefined) {
      fuel = {
        source: 'tfdi-efb',
        unit: 'lb',
        left: 0,
        right: 0,
        center: 0,
        total: tfdiEfb.fuelLb,
      };
      break;
    }
  }
  if (!fuel) {
    fuel = fuelFromClassicSnapshot(snapshot, density);
  }

  let weights = weightsFromSnapshot(snapshot, fuel.total, payload.ofpPayloadLb ?? payload.total);

  for (const src of prefs.weights) {
    if (
      src === 'pmdg-efb-lvars' &&
      pmdgEfb &&
      (pmdgEfb.zfwLb !== undefined || pmdgEfb.gwLb !== undefined)
    ) {
      weights = {
        ...weights,
        source: 'pmdg-efb-lvars',
        zfwLb: pmdgEfb.zfwLb ?? weights.zfwLb,
        grossLb: pmdgEfb.gwLb ?? weights.grossLb,
        landingLb: pmdgEfb.lwLb,
        fuelLb: fuel.total,
      };
      break;
    }
    if (
      src === 'tfdi-efb-lvars' &&
      tfdiEfb &&
      (tfdiEfb.zfwLb !== undefined || tfdiEfb.gwLb !== undefined || tfdiEfb.payloadLb !== undefined)
    ) {
      weights = {
        ...weights,
        source: 'tfdi-efb-lvars',
        zfwLb: tfdiEfb.zfwLb ?? weights.zfwLb,
        grossLb: tfdiEfb.gwLb ?? weights.grossLb,
        fuelLb: fuel.total,
        payloadLb: tfdiEfb.payloadLb ?? weights.payloadLb,
      };
      break;
    }
    if (src === 'classic-weights') {
      break;
    }
  }

  for (const src of prefs.payload) {
    if (src === 'pmdg-efb' && weights.source === 'pmdg-efb-lvars') {
      const corrected = applyPmdgEfbPayloadCorrection(payload, weights, opts.stationRoles);
      payload = corrected.payload;
      weights = corrected.weights;
      break;
    }
    if (src === 'tfdi-efb' && tfdiEfb?.payloadLb !== undefined) {
      payload = {
        ...payload,
        source: 'tfdi-efb',
        baggageLb: tfdiEfb.payloadLb,
        ofpPayloadLb: tfdiEfb.payloadLb,
      };
      weights = { ...weights, payloadLb: tfdiEfb.payloadLb };
      break;
    }
    if (src === 'classic-stations') {
      break;
    }
  }

  return {
    fuel,
    payload,
    weights,
    onGround: snapshot.onGround,
    enginesRunning: snapshot.enginesRunning,
    pmdgEfb,
    tfdiEfb,
  };
}
