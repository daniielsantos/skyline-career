import {
  DEFAULT_JET_A_LB_PER_GAL,
  applyPmdgEfbPayloadCorrection,
  enrichPayloadWithRoles,
  resolveLivePayloadLb,
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
import { readSimVarsSoft } from '../read-simvars-soft.js';

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

/**
 * Normalize TFDi EFB weight LVars to pounds.
 * Panel shows ×1000 lb; older builds stored kg; some reads already return lb.
 * L:MD11_EFB_PAYLOAD_LOAD is utilization (% of capacity), not a progress bar.
 */
export function interpretTfdiEfbWeightToLb(
  raw: number,
  kind: 'fuel' | 'payload' | 'weight',
): number | undefined {
  if (!Number.isFinite(raw) || raw <= 0) {
    return undefined;
  }
  // Panel units (Fuel 22.3, Payload 50, ZFW 298.6).
  if (raw < 1000) {
    const lb = raw * 1000;
    return lb >= 500 ? lb : undefined;
  }
  if (kind === 'weight') {
    // MD-11 ZFW/GW: lb ≥ ~220k; kg typically 100k–200k.
    if (raw >= 220_000) return raw;
    const lb = toLb(raw, 'kg');
    return lb >= 1000 ? lb : undefined;
  }
  if (kind === 'fuel') {
    // Short-hop block ~10k kg vs ~22k lb — kg band stays ≤20k raw.
    if (raw <= 20_000) {
      const lb = toLb(raw, 'kg');
      return lb >= 500 ? lb : undefined;
    }
    return raw;
  }
  // Payload: OFP cargo ~23k kg or ~50k lb.
  if (raw <= 40_000) {
    const lb = toLb(raw, 'kg');
    return lb >= 500 ? lb : undefined;
  }
  return raw;
}

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
  const gal = (name: string): number => {
    const v = snapshot.vars?.[name];
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
  };

  const leftMain = gal('FUEL TANK LEFT MAIN QUANTITY');
  const rightMain = gal('FUEL TANK RIGHT MAIN QUANTITY');
  const center = gal('FUEL TANK CENTER QUANTITY') + gal('FUEL TANK CENTER2 QUANTITY');
  const leftAux = gal('FUEL TANK LEFT AUX QUANTITY');
  const rightAux = gal('FUEL TANK RIGHT AUX QUANTITY');
  const leftTip = gal('FUEL TANK LEFT TIP QUANTITY');
  const rightTip = gal('FUEL TANK RIGHT TIP QUANTITY');

  const tankGal =
    leftMain + rightMain + center + leftAux + rightAux + leftTip + rightTip;
  // Optional FUEL TOTAL when the host already put it on the snapshot (never force-read —
  // it throws on PMDG DC-6 and some other airframes).
  const totalQtyGal = gal('FUEL TOTAL QUANTITY');
  const totalGal =
    totalQtyGal > tankGal * 1.02 + 1 ? totalQtyGal : Math.max(tankGal, totalQtyGal);

  const left = galToLb(leftMain, densityLbPerGal);
  const right = galToLb(rightMain, densityLbPerGal);
  const centerLb = galToLb(center, densityLbPerGal);
  const leftAuxLb = galToLb(leftAux, densityLbPerGal);
  const rightAuxLb = galToLb(rightAux, densityLbPerGal);
  const leftTipLb = galToLb(leftTip, densityLbPerGal);
  const rightTipLb = galToLb(rightTip, densityLbPerGal);
  const tankTotal =
    left +
    right +
    centerLb +
    leftAuxLb +
    rightAuxLb +
    leftTipLb +
    rightTipLb;
  const total = galToLb(totalGal, densityLbPerGal);

  return {
    source: 'classic',
    unit: 'lb',
    left,
    right,
    center: centerLb,
    ...(leftAuxLb > 0.5 ? { leftAux: leftAuxLb } : {}),
    ...(rightAuxLb > 0.5 ? { rightAux: rightAuxLb } : {}),
    ...(leftTipLb > 0.5 ? { leftTip: leftTipLb } : {}),
    ...(rightTipLb > 0.5 ? { rightTip: rightTipLb } : {}),
    // Keep L/R/C (+ aux/tip) for display; total may exceed their sum when TOTAL QUANTITY wins.
    total: Math.max(total, tankTotal),
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

/**
 * Payload from gross − empty − fuel. Used when PAYLOAD STATION WEIGHT:* reads as 0
 * (Black Square Accu-Sim tablet can show load while classic station SimVars stay empty).
 */
export function payloadLbFromMassBalance(
  snapshot: SimSnapshot,
  fuelTotalLb: number,
): number | undefined {
  const emptyLb = snapshot.vars?.['EMPTY WEIGHT'];
  const grossLb = snapshot.grossWeightLb ?? snapshot.vars?.['TOTAL WEIGHT'];
  if (
    emptyLb === undefined ||
    !Number.isFinite(emptyLb) ||
    emptyLb <= 0 ||
    grossLb === undefined ||
    !Number.isFinite(grossLb) ||
    grossLb <= 0
  ) {
    return undefined;
  }
  const payloadLb = grossLb - emptyLb - Math.max(0, fuelTotalLb);
  if (!Number.isFinite(payloadLb)) {
    return undefined;
  }
  // Allow 0 — emptied aircraft must not become "unknown" and freeze READY.
  return Math.max(0, payloadLb);
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

/**
 * Interpret raw L:MD11_EFB_PAYLOAD_* values as pounds.
 * TFDi has shipped these as kilograms, as full pounds, and as the EFB panel
 * ×1000-lb display number (Fuel 22.3, Payload 50, ZFW 298.6).
 */
export function interpretTfdiEfbWeightLvar(
  raw: number,
  kind: 'fuel' | 'payload' | 'weight',
): number | undefined {
  if (!Number.isFinite(raw) || raw <= 0) {
    return undefined;
  }
  // Panel display units (×1000 lb).
  if (raw < 1000) {
    const lb = raw * 1000;
    return lb >= 500 ? lb : undefined;
  }
  if (kind === 'weight') {
    // ZFW/GW: lb is typically ≥220k on MD-11; below that treat as kg.
    if (raw >= 220_000) {
      return raw;
    }
    const lb = toLb(raw, 'kg');
    return lb >= 1000 ? lb : undefined;
  }
  if (kind === 'fuel') {
    // Block fuel: ≤20k → kg (short-hop ~10t); else already lb.
    if (raw <= 20_000) {
      const lb = toLb(raw, 'kg');
      return lb >= 500 ? lb : undefined;
    }
    return raw;
  }
  // Payload: ≤40k → kg (~23t → ~50k lb); else already lb.
  if (raw <= 40_000) {
    const lb = toLb(raw, 'kg');
    return lb >= 500 ? lb : undefined;
  }
  return raw;
}

export async function readTfdiMd11EfbLvars(
  bridge: NamedPipeSimBridge,
): Promise<{
  gwLb?: number;
  zfwLb?: number;
  payloadLb?: number;
  fuelLb?: number;
}> {
  // L:MD11_EFB_PAYLOAD_LOAD is utilization (% of capacity), not a progress bar.
  const readWeight = async (
    name: string,
    kind: 'fuel' | 'payload' | 'weight',
  ): Promise<number | undefined> => {
    try {
      const raw = await bridge.readLVar(name);
      return interpretTfdiEfbWeightLvar(raw, kind);
    } catch {
      return undefined;
    }
  };
  const [gwLb, zfwLb, payloadLb, fuelLb] = await Promise.all([
    readWeight(TFDI_MD11_EFB_LVARS.grossWeight, 'weight'),
    readWeight(TFDI_MD11_EFB_LVARS.zfw, 'weight'),
    readWeight(TFDI_MD11_EFB_LVARS.payload, 'payload'),
    readWeight(TFDI_MD11_EFB_LVARS.fuel, 'fuel'),
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
    previousStationSumLb?: number;
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
  const missingStations = [...mappedStations].filter(
    (index) => snapshot.vars[`PAYLOAD STATION WEIGHT:${index}`] === undefined,
  );
  if (missingStations.length > 0) {
    const weights = await readSimVarsSoft(
      bridge,
      missingStations.map((index) => ({
        name: `PAYLOAD STATION WEIGHT:${index}`,
        unit: 'pounds',
      })),
    );
    for (let i = 0; i < missingStations.length; i += 1) {
      const raw = weights[i];
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        snapshot.vars[`PAYLOAD STATION WEIGHT:${missingStations[i]!}`] = raw;
      }
    }
  }

  // Snapshot struct only carries L/R/C. Hydrate AUX/TIP only when the pack
  // opts into classic+mass-balance (multi-tank freighters like PMDG DC-6) or
  // declares many cargo stations — avoid extra SimConnect traffic on light GA.
  const needsExtraClassicTanks =
    wants(prefs.fuel, 'classic') &&
    (wants(prefs.fuel, 'mass-balance') ||
      (opts.stationRoles?.baggageStations?.length ?? 0) >= 8);
  if (needsExtraClassicTanks) {
    // Do NOT request FUEL TOTAL QUANTITY or TIP LEFT/RIGHT: NAME_UNRECOGNIZED on
    // several payware airframes (including PMDG DC-6) and spam the host log.
    const classicFuelVars = [
      'FUEL TANK LEFT AUX QUANTITY',
      'FUEL TANK RIGHT AUX QUANTITY',
      'FUEL TANK LEFT TIP QUANTITY',
      'FUEL TANK RIGHT TIP QUANTITY',
      'FUEL TANK CENTER2 QUANTITY',
    ] as const;
    const extraNames = classicFuelVars.filter(
      (name) => snapshot.vars[name] === undefined,
    );
    if (extraNames.length > 0) {
      const extra = await readSimVarsSoft(
        bridge,
        extraNames.map((name) => ({ name, unit: 'gallons' })),
      );
      for (let i = 0; i < extraNames.length; i += 1) {
        const raw = extra[i];
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          snapshot.vars[extraNames[i]!] = raw;
        }
      }
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

  // Accu-Sim / some GA: station SimVars read 0 while gross weight includes the load.
  // Also: stations cleared while TOTAL WEIGHT still lags → trust stations vs planned.
  const mbPayloadLb = payloadLbFromMassBalance(snapshot, fuel.total);
  const resolvedPayload = resolveLivePayloadLb({
    stationSumLb: payload.total,
    massBalanceLb: mbPayloadLb,
    previousStationSumLb: opts.previousStationSumLb,
  });
  if (
    resolvedPayload.source === 'mass-balance' &&
    resolvedPayload.payloadLb !== undefined
  ) {
    payload = {
      ...payload,
      source: 'mass-balance',
      total: resolvedPayload.payloadLb,
      // Prefer MB for OFP compare too — station role sums can be ghost weights (PMDG DC-6).
      ofpPayloadLb: resolvedPayload.payloadLb,
      baggageLb: resolvedPayload.payloadLb,
    };
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
