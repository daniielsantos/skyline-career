import {
  DEFAULT_AVGAS_LB_PER_GAL,
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

/** A2A Accu-Sim tablet (Fuel* gallons, Character* + BaggageWeight + PayloadWeight lb). */
export const A2A_ACCUSIM_LVARS = {
  payloadWeight: 'PayloadWeight',
  emptyWeight: 'EmptyWeightLbs',
  grossWeight: 'GrossWeightLbs',
  fuelLeft: 'FuelLeftWingTank',
  fuelRight: 'FuelRightWingTank',
  fuelCenter: 'FuelFuselageTank',
  fuelLeftTip: 'FuelLeftTipTank',
  fuelRightTip: 'FuelRightTipTank',
  character: [
    'Character1Weight',
    'Character2Weight',
    'Character3Weight',
    'Character4Weight',
    'Character5Weight',
    'Character6Weight',
  ] as const,
  occupancy: [
    'Seat1Character',
    'Seat2Character',
    'Seat3Character',
    'Seat4Character',
    'Seat5Character',
    'Seat6Character',
  ] as const,
  baggage: 'BaggageWeight',
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
 *
 * Heavy freighter payload in kg (~85k) sits in the same numeric band as a
 * mid load already in lb (~50–90k). Pass zfwLb when known so we can pick the
 * unit that leaves a sane MD-11 empty (ZFW − payload ≈ 200–290k lb).
 */
export function interpretTfdiEfbWeightToLb(
  raw: number,
  kind: 'fuel' | 'payload' | 'weight',
  opts?: { zfwLb?: number },
): number | undefined {
  return interpretTfdiEfbWeightLvar(raw, kind, opts);
}

/**
 * Interpret raw L:MD11_EFB_PAYLOAD_* values as pounds.
 * TFDi has shipped these as kilograms, as full pounds, and as the EFB panel
 * ×1000-lb display number (Fuel 22.3, Payload 50, ZFW 298.6).
 */
export function interpretTfdiEfbWeightLvar(
  raw: number,
  kind: 'fuel' | 'payload' | 'weight',
  opts?: { zfwLb?: number },
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
  // Payload: small/mid kg loads (≤40k raw) always convert.
  // Ambiguous 40k–120k: freighter kg (~85k → ~187k lb) vs already-lb mid load.
  const asLb = raw;
  const fromKg = toLb(raw, 'kg');
  if (raw <= 40_000) {
    return fromKg >= 500 ? fromKg : undefined;
  }
  const zfwLb = opts?.zfwLb;
  if (
    typeof zfwLb === 'number' &&
    Number.isFinite(zfwLb) &&
    zfwLb >= 220_000 &&
    raw <= 120_000
  ) {
    const emptyAsLb = zfwLb - asLb;
    const emptyFromKg = zfwLb - fromKg;
    // MD-11 OEW band (load sheet ~248k; allow GE/PW + config slack).
    const emptyLo = 200_000;
    const emptyHi = 290_000;
    const inBand = (empty: number) => empty >= emptyLo && empty <= emptyHi;
    const asLbOk = inBand(emptyAsLb);
    const fromKgOk = inBand(emptyFromKg);
    if (fromKgOk && !asLbOk) return fromKg;
    if (asLbOk && !fromKgOk) return asLb;
    const targetEmpty = 250_000;
    return Math.abs(emptyFromKg - targetEmpty) <= Math.abs(emptyAsLb - targetEmpty)
      ? fromKg
      : asLb;
  }
  return asLb;
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
  a2a?: A2aAccusimLive;
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
  opts?: { oewLb?: number },
): LiveFuelState | undefined {
  const simEmptyLb = snapshot.vars?.['EMPTY WEIGHT'];
  const oewLb = opts?.oewLb;
  let emptyLb = simEmptyLb;
  if (
    typeof oewLb === 'number' &&
    Number.isFinite(oewLb) &&
    oewLb > 0 &&
    (simEmptyLb === undefined ||
      !Number.isFinite(simEmptyLb) ||
      Math.abs(simEmptyLb - oewLb) > 500)
  ) {
    // SimBrief/EFB OEW when MSFS EMPTY WEIGHT omits cabin equipment (ToLiss A346).
    emptyLb = oewLb;
  }
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

/** Sum FUELSYSTEM TANK QUANTITY:1..N (gallons) — A346 / Aerosoft multi-tank layouts. */
export function fuelFromFuelSystemSnapshot(
  snapshot: SimSnapshot,
  densityLbPerGal: number,
  tankCount = 8,
): LiveFuelState | undefined {
  let totalGal = 0;
  for (let i = 1; i <= tankCount; i += 1) {
    const raw = snapshot.vars?.[`FUELSYSTEM TANK QUANTITY:${i}`];
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
      totalGal += raw;
    }
  }
  if (totalGal < 1) {
    return undefined;
  }
  const total = galToLb(totalGal, densityLbPerGal);
  if (total < 100) {
    return undefined;
  }
  return {
    source: 'fuelsystem',
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

export type A2aAccusimLive = {
  payloadLb?: number;
  fuelLb?: number;
  emptyLb?: number;
  grossLb?: number;
  tanks: {
    left: number;
    right: number;
    center: number;
    leftTip?: number;
    rightTip?: number;
  };
  stations: Record<number, number>;
};

async function readLvarNumber(
  bridge: NamedPipeSimBridge,
  name: string,
): Promise<number | undefined> {
  try {
    const raw = await bridge.readLVar(name);
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
  } catch {
    return undefined;
  }
}

function galToFuelLb(gal: number | undefined, densityLbPerGal: number): number {
  if (gal === undefined || !Number.isFinite(gal) || gal <= 0) return 0;
  return gal * densityLbPerGal;
}

/**
 * Tablet paint: occupancy owns the seat boxes. Character* often linger after
 * the EFB empties a seat; PayloadWeight is the header total.
 */
export function paintA2aAccusimStations(opts: {
  characterLb: Array<number | undefined>;
  occupancy?: Array<number | undefined>;
  baggageLb?: number;
  payloadLb?: number;
  /** Pack station indexes (Comanche 1–4+7). Ghost Character5/6 stay off the schematic. */
  keepStationIndexes?: number[];
}): Record<number, number> {
  const keep = opts.keepStationIndexes?.length
    ? new Set(opts.keepStationIndexes)
    : undefined;
  const stations: Record<number, number> = {};
  for (let i = 0; i < 6; i += 1) {
    const index = i + 1;
    if (keep && !keep.has(index)) continue;
    const lb = opts.characterLb[i];
    const weight = typeof lb === 'number' && lb >= 0 ? lb : 0;
    const occ = opts.occupancy?.[i];
    if (typeof occ === 'number' && Number.isFinite(occ)) {
      stations[index] = occ >= 0.5 ? weight : 0;
    } else {
      stations[index] = weight;
    }
  }
  const baggage =
    typeof opts.baggageLb === 'number' && opts.baggageLb >= 0
      ? opts.baggageLb
      : 0;
  if (!keep || keep.has(7)) {
    stations[7] = baggage;
  }

  const payloadLb = opts.payloadLb;
  if (payloadLb === undefined || !Number.isFinite(payloadLb)) {
    return stations;
  }
  let sum = Object.values(stations).reduce((s, lb) => s + lb, 0);
  if (sum <= payloadLb + 75) {
    return stations;
  }
  const occupied = (index: number): boolean => {
    if (index === 7) return (stations[7] ?? 0) > 0;
    const occ = opts.occupancy?.[index - 1];
    return typeof occ === 'number' && occ >= 0.5;
  };
  // Occupancy lagged at 1 while the tablet header already dropped.
  // Never blank a seat the tablet still shows occupied (Comanche S4 vs ghost S5/S6).
  for (const index of [6, 5, 4, 3, 2, 7]) {
    if (sum <= payloadLb + 25) break;
    const cur = stations[index] ?? 0;
    if (cur <= 0 || occupied(index)) continue;
    stations[index] = 0;
    sum -= cur;
  }
  return stations;
}

/** Accu-Sim tablet LVars — not classic PAYLOAD STATION / FUEL TANK mirrors. */
export async function readA2aAccusimLvars(
  bridge: NamedPipeSimBridge,
  densityLbPerGal = DEFAULT_AVGAS_LB_PER_GAL,
  opts: { keepStationIndexes?: number[] } = {},
): Promise<A2aAccusimLive> {
  const names = [
    A2A_ACCUSIM_LVARS.payloadWeight,
    A2A_ACCUSIM_LVARS.emptyWeight,
    A2A_ACCUSIM_LVARS.grossWeight,
    A2A_ACCUSIM_LVARS.fuelLeft,
    A2A_ACCUSIM_LVARS.fuelRight,
    A2A_ACCUSIM_LVARS.fuelCenter,
    A2A_ACCUSIM_LVARS.fuelLeftTip,
    A2A_ACCUSIM_LVARS.fuelRightTip,
    ...A2A_ACCUSIM_LVARS.character,
    A2A_ACCUSIM_LVARS.baggage,
    ...A2A_ACCUSIM_LVARS.occupancy,
  ];
  let values: Array<number | undefined> = [];
  try {
    const batch = await readSimVarsSoft(
      bridge,
      names.map((name) => ({ name: `L:${name}`, unit: 'number' })),
    );
    values = batch.map((v) =>
      typeof v === 'number' && Number.isFinite(v) ? v : undefined,
    );
  } catch {
    values = await Promise.all(names.map((name) => readLvarNumber(bridge, name)));
  }

  const num = (i: number): number | undefined => values[i];
  const left = galToFuelLb(num(3), densityLbPerGal);
  const right = galToFuelLb(num(4), densityLbPerGal);
  const center = galToFuelLb(num(5), densityLbPerGal);
  const leftTip = galToFuelLb(num(6), densityLbPerGal);
  const rightTip = galToFuelLb(num(7), densityLbPerGal);
  const fuelLb = left + right + center + leftTip + rightTip;
  const payloadRaw = num(0);
  const characterLb = A2A_ACCUSIM_LVARS.character.map((_, i) => num(8 + i));
  const baggage = num(14);
  const occupancy = A2A_ACCUSIM_LVARS.occupancy.map((_, i) => num(15 + i));
  const payloadHint =
    typeof payloadRaw === 'number' && payloadRaw >= 50 ? payloadRaw : undefined;
  const stations = paintA2aAccusimStations({
    characterLb,
    occupancy,
    baggageLb: baggage,
    payloadLb: payloadHint,
    keepStationIndexes: opts.keepStationIndexes,
  });
  const stationSum = Object.values(stations).reduce((s, lb) => s + lb, 0);
  // Prefer painted Character* + baggage (tablet seat boxes). PayloadWeight on
  // Accu-Sim often caps occupants at 170 lb (Comanche 4×170+200 bag = 880
  // while seats show 201+201).
  const payloadLb =
    stationSum >= 50
      ? stationSum
      : payloadHint;
  const emptyRaw = num(1);
  const grossRaw = num(2);
  return {
    payloadLb,
    fuelLb: fuelLb >= 20 ? fuelLb : undefined,
    emptyLb:
      typeof emptyRaw === 'number' && emptyRaw >= 1000 ? emptyRaw : undefined,
    grossLb:
      typeof grossRaw === 'number' && grossRaw >= 1000 ? grossRaw : undefined,
    tanks: {
      left,
      right,
      center,
      ...(leftTip > 0.5 ? { leftTip } : {}),
      ...(rightTip > 0.5 ? { rightTip } : {}),
    },
    stations,
  };
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
  const readRaw = async (name: string): Promise<number | undefined> => {
    try {
      const raw = await bridge.readLVar(name);
      return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
    } catch {
      return undefined;
    }
  };
  const [gwRaw, zfwRaw, payloadRaw, fuelRaw] = await Promise.all([
    readRaw(TFDI_MD11_EFB_LVARS.grossWeight),
    readRaw(TFDI_MD11_EFB_LVARS.zfw),
    readRaw(TFDI_MD11_EFB_LVARS.payload),
    readRaw(TFDI_MD11_EFB_LVARS.fuel),
  ]);
  const gwLb =
    gwRaw !== undefined
      ? interpretTfdiEfbWeightLvar(gwRaw, 'weight')
      : undefined;
  const zfwLb =
    zfwRaw !== undefined
      ? interpretTfdiEfbWeightLvar(zfwRaw, 'weight')
      : undefined;
  const payloadLb =
    payloadRaw !== undefined
      ? interpretTfdiEfbWeightLvar(payloadRaw, 'payload', { zfwLb })
      : undefined;
  const fuelLb =
    fuelRaw !== undefined
      ? interpretTfdiEfbWeightLvar(fuelRaw, 'fuel')
      : undefined;
  return { gwLb, zfwLb, payloadLb, fuelLb };
}

function wants(
  prefs: string[],
  ...sources: string[]
): boolean {
  return sources.some((s) => prefs.includes(s));
}

export function stationRoleIndexes(
  roles: OfpStationRoleMap | undefined,
): number[] | undefined {
  if (!roles) return undefined;
  const ids = [
    ...(roles.crewStations ?? []),
    ...(roles.baggageStations ?? []),
    ...(roles.passengerStations ?? []),
    ...(roles.serviceStations ?? []),
  ].filter((n) => Number.isFinite(n) && n > 0);
  return ids.length > 0 ? [...new Set(ids)] : undefined;
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
    /** SimBrief load sheet empty — fallback when EMPTY WEIGHT SimVar is missing. */
    ofpEmptyLb?: number;
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

  if (wants(prefs.fuel, 'fuelsystem')) {
    const fuelSystemVars = Array.from(
      { length: 8 },
      (_, i) => `FUELSYSTEM TANK QUANTITY:${i + 1}`,
    );
    const missingFuel = fuelSystemVars.filter(
      (name) => snapshot.vars[name] === undefined,
    );
    if (missingFuel.length > 0) {
      const qty = await readSimVarsSoft(
        bridge,
        missingFuel.map((name) => ({ name, unit: 'gallons' })),
      );
      for (let i = 0; i < missingFuel.length; i += 1) {
        const raw = qty[i];
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          snapshot.vars[missingFuel[i]!] = raw;
        }
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
  const needA2aLvars =
    wants(prefs.fuel, 'a2a-lvars') ||
    wants(prefs.weights, 'a2a-lvars') ||
    wants(prefs.payload, 'a2a-lvars');

  let pmdgEfb: LiveLoadReading['pmdgEfb'];
  let tfdiEfb: LiveLoadReading['tfdiEfb'];
  let a2a: LiveLoadReading['a2a'];
  if (needPmdgEfb) {
    pmdgEfb = await readPmdgEfbLvars(bridge);
  }
  if (needTfdiEfb) {
    tfdiEfb = await readTfdiMd11EfbLvars(bridge);
  }
  if (needA2aLvars) {
    a2a = await readA2aAccusimLvars(bridge, density, {
      keepStationIndexes: stationRoleIndexes(opts.stationRoles),
    });
  }

  let fuel: LiveFuelState | undefined;
  const mbOpts =
    typeof opts.ofpEmptyLb === 'number' && Number.isFinite(opts.ofpEmptyLb)
      ? { oewLb: opts.ofpEmptyLb }
      : undefined;
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
    if (src === 'fuelsystem') {
      const fs = fuelFromFuelSystemSnapshot(snapshot, density);
      if (fs) {
        fuel = fs;
        break;
      }
    }
    if (src === 'classic') {
      fuel = fuelFromClassicSnapshot(snapshot, density);
      // May still upgrade to mass-balance if both are in prefs and classic under-reads.
      if (prefs.fuel.includes('mass-balance')) {
        const mb = fuelFromMassBalance(snapshot, payload.total, mbOpts);
        fuel = preferMassBalanceFuel(fuel, mb);
        if (fuel.source === 'mass-balance') {
          break;
        }
      }
      break;
    }
    if (src === 'mass-balance') {
      const mb = fuelFromMassBalance(snapshot, payload.total, mbOpts);
      if (mb) {
        fuel = mb;
        break;
      }
    }
    if (src === 'a2a-lvars' && a2a?.fuelLb !== undefined) {
      fuel = {
        source: 'a2a-lvars',
        unit: 'lb',
        left: a2a.tanks.left,
        right: a2a.tanks.right,
        center: a2a.tanks.center,
        ...(a2a.tanks.leftTip !== undefined ? { leftTip: a2a.tanks.leftTip } : {}),
        ...(a2a.tanks.rightTip !== undefined ? { rightTip: a2a.tanks.rightTip } : {}),
        total: a2a.fuelLb,
      };
      break;
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
  // Skip when the pack already has Accu-Sim tablet payload — classic stations are ghosts.
  if (a2a?.payloadLb === undefined) {
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
    if (
      src === 'a2a-lvars' &&
      a2a &&
      (a2a.emptyLb !== undefined ||
        a2a.grossLb !== undefined ||
        a2a.payloadLb !== undefined)
    ) {
      weights = {
        ...weights,
        source: 'a2a-lvars',
        emptyLb: a2a.emptyLb ?? weights.emptyLb,
        grossLb: a2a.grossLb ?? weights.grossLb,
        fuelLb: fuel.total,
        payloadLb: a2a.payloadLb ?? weights.payloadLb,
      };
      break;
    }
    if (src === 'classic-weights') {
      break;
    }
  }

  for (const src of prefs.payload) {
    if (src === 'pmdg-efb' && weights.source === 'pmdg-efb-lvars') {
      const corrected = applyPmdgEfbPayloadCorrection(payload, weights, opts.stationRoles, {
        ofpEmptyLb: opts.ofpEmptyLb,
      });
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
    if (src === 'a2a-lvars' && a2a?.payloadLb !== undefined) {
      payload = enrichPayloadWithRoles(
        {
          source: 'a2a-lvars',
          unit: 'lb',
          stations: a2a.stations,
          total: a2a.payloadLb,
        },
        opts.stationRoles,
        opts.roleWeightUnit ?? 'lb',
      );
      weights = { ...weights, payloadLb: a2a.payloadLb };
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
    a2a,
  };
}
