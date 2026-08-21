/**
 * Career inject one-shot for PMDG NG3 CDU strategies (BCF-validated).
 * Kept out of the classic multi-round tank/station CG loop.
 *
 * Primary ZFW source: SimBrief `loadSheet.zfw` (est_zfw). Fallback: live ZFW -
 * cargo + Due cargo when the OFP sheet has no zfw.
 */
import type { DefaultProfileEngine } from '@msfs-compat/runtime';
import {
  computePmdgCduZfwTargetLb,
  DEFAULT_JET_A_LB_PER_GAL,
  resolvePmdgLiveCargoLb,
  toLb,
  type AircraftProfile,
  type FuelTarget,
  type LoadPlanRequest,
  type OfpExpectation,
  type OfpWeightUnit,
  type OperationResult,
} from '@msfs-compat/shared';
import type { NamedPipeSimBridge } from '../../agent/src/named-pipe-sim-bridge.ts';

export function isPmdgCduFuelProfile(profile: AircraftProfile): boolean {
  return profile.fuel.strategy === 'pmdg-cdu';
}

export function isPmdgCduPayloadProfile(profile: AircraftProfile): boolean {
  return profile.payload.strategy === 'pmdg-cdu';
}

export function isPmdgCduInjectProfile(profile: AircraftProfile): boolean {
  return isPmdgCduFuelProfile(profile) || isPmdgCduPayloadProfile(profile);
}

export async function applyPmdgCduFuelOnce(opts: {
  engine: DefaultProfileEngine;
  fuel: FuelTarget;
}): Promise<OperationResult | undefined> {
  const result = await opts.engine.applyLoadPlan({
    fuel: opts.fuel,
    cgPolicy: 'none',
    skipVerify: true,
  } satisfies LoadPlanRequest);
  return result.fuel;
}

function sumStationIndexes(
  stations: Record<number, number> | undefined,
  indexes: number[],
): number {
  if (!stations || indexes.length === 0) return 0;
  let sum = 0;
  for (const idx of indexes) {
    const v = stations[idx];
    if (typeof v === 'number' && Number.isFinite(v)) sum += v;
  }
  return sum;
}

/** SimBrief est_zfw → lb. */
export function resolveOfpZfwLb(ofp: OfpExpectation): number | undefined {
  const sheet = ofp.loadSheet;
  if (!sheet?.zfw || !Number.isFinite(sheet.zfw) || !(sheet.zfw > 0)) {
    return undefined;
  }
  const unit: OfpWeightUnit = sheet.unit ?? 'lb';
  return toLb(sheet.zfw, unit);
}

async function readLiveZfwLb(bridge: NamedPipeSimBridge): Promise<number | undefined> {
  try {
    const z = await bridge.readLVar('ZFW_Lvar');
    if (Number.isFinite(z) && z >= 20_000 && z <= 200_000) return z;
    if (Number.isFinite(z) && z >= 40 && z < 500) return z * 1000;
  } catch {
    /* fall through */
  }
  try {
    const gross = await bridge.readSimVar({
      name: 'TOTAL WEIGHT',
      unit: 'pounds',
    });
    const fuelGal = await bridge.readSimVar({
      name: 'FUEL TOTAL QUANTITY',
      unit: 'gallons',
    });
    let dens = DEFAULT_JET_A_LB_PER_GAL;
    try {
      const d = await bridge.readSimVar({
        name: 'FUEL WEIGHT PER GALLON',
        unit: 'pounds',
      });
      if (Number.isFinite(d) && d >= 5 && d <= 8) dens = d;
    } catch {
      /* Jet-A default */
    }
    const z = gross - fuelGal * dens;
    if (Number.isFinite(z) && z >= 20_000 && z <= 200_000) return z;
  } catch {
    /* fall through */
  }
  return undefined;
}

async function readEmptyWeightLb(bridge: NamedPipeSimBridge): Promise<number> {
  try {
    const emptyLb = await bridge.readSimVar({
      name: 'EMPTY WEIGHT',
      unit: 'pounds',
    });
    return Number.isFinite(emptyLb) && emptyLb > 0 ? emptyLb : 0;
  } catch {
    return 0;
  }
}

async function readStationsLb(
  bridge: NamedPipeSimBridge,
  indexes: number[],
): Promise<Record<number, number>> {
  const out: Record<number, number> = {};
  if (indexes.length === 0) return out;
  try {
    if (typeof bridge.readSimVars === 'function') {
      const values = await bridge.readSimVars(
        indexes.map((index) => ({
          name: `PAYLOAD STATION WEIGHT:${index}`,
          unit: 'pounds' as const,
        })),
      );
      for (let i = 0; i < indexes.length; i++) {
        const lb = values[i];
        if (typeof lb === 'number' && Number.isFinite(lb)) {
          out[indexes[i]!] = lb;
        }
      }
      return out;
    }
  } catch {
    /* fall through per-station */
  }
  for (const index of indexes) {
    try {
      const lb = await bridge.readSimVar({
        name: `PAYLOAD STATION WEIGHT:${index}`,
        unit: 'pounds',
      });
      if (Number.isFinite(lb)) out[index] = lb;
    } catch {
      /* skip */
    }
  }
  return out;
}

/**
 * Resolve absolute ZFW for CDU entry.
 * Prefer SimBrief est_zfw; else live ZFW − cargo + Due cargo.
 */
export async function resolvePmdgCduZfwTarget(opts: {
  bridge: NamedPipeSimBridge;
  requestedCargoLb: number;
  liveStations?: Record<number, number>;
  baggageStationIndexes: number[];
  fixedNonCargoStationIndexes?: number[];
  ofp?: OfpExpectation;
}): Promise<{
  zfwLb: number;
  liveZfwLb: number;
  liveCargoLb: number;
  stationCargoLb: number;
  emptyLb: number;
  cargoSource: string;
  method: 'ofp-zfw' | 'zfw-delta' | 'empty-plus-cargo';
}> {
  const liveZfwLb = (await readLiveZfwLb(opts.bridge)) ?? 0;
  const emptyLb = await readEmptyWeightLb(opts.bridge);
  const ofpZfw = opts.ofp ? resolveOfpZfwLb(opts.ofp) : undefined;

  const fixedIdx = opts.fixedNonCargoStationIndexes ?? [];
  const allIdx = [
    ...new Set([...opts.baggageStationIndexes, ...fixedIdx]),
  ];
  const freshStations = await readStationsLb(opts.bridge, allIdx);
  const stationCargoLb = sumStationIndexes(
    Object.keys(freshStations).length > 0 ? freshStations : opts.liveStations,
    opts.baggageStationIndexes,
  );
  const fixedNonCargoLb = sumStationIndexes(freshStations, fixedIdx);

  if (ofpZfw !== undefined && ofpZfw >= 40_000) {
    return {
      zfwLb: Math.round(ofpZfw),
      liveZfwLb,
      liveCargoLb: stationCargoLb,
      stationCargoLb,
      emptyLb,
      cargoSource: 'simbrief-est-zfw',
      method: 'ofp-zfw',
    };
  }

  if (liveZfwLb >= 20_000) {
    const resolvedCargo = resolvePmdgLiveCargoLb({
      liveZfwLb,
      emptyLb,
      stationCargoLb,
      fixedNonCargoLb,
    });
    const zfwLb = computePmdgCduZfwTargetLb({
      liveZfwLb,
      liveCargoLb: resolvedCargo.liveCargoLb,
      requestedCargoLb: opts.requestedCargoLb,
    });
    return {
      zfwLb,
      liveZfwLb,
      liveCargoLb: resolvedCargo.liveCargoLb,
      stationCargoLb,
      emptyLb,
      cargoSource: resolvedCargo.source,
      method: 'zfw-delta',
    };
  }

  const zfwLb = Math.max(0, emptyLb) + Math.max(0, opts.requestedCargoLb);
  return {
    zfwLb,
    liveZfwLb: emptyLb + stationCargoLb,
    liveCargoLb: stationCargoLb,
    stationCargoLb,
    emptyLb,
    cargoSource: 'stations',
    method: 'empty-plus-cargo',
  };
}

/**
 * Type absolute ZFW on FO CDU (SimBrief est_zfw preferred).
 */
export async function applyPmdgCduPayloadOnce(opts: {
  engine: DefaultProfileEngine;
  bridge: NamedPipeSimBridge;
  ofp: OfpExpectation;
  requestedCargoLb: number;
  liveStations?: Record<number, number>;
  baggageStationIndexes: number[];
  fixedNonCargoStationIndexes?: number[];
}): Promise<{
  payload?: OperationResult;
  zfwLb: number;
  emptyLb: number;
  liveZfwLb: number;
  liveCargoLb: number;
  method: string;
  corrected: boolean;
}> {
  const resolved = await resolvePmdgCduZfwTarget(opts);

  // Delta path only: never type below live ZFW when increasing load.
  if (
    resolved.method !== 'ofp-zfw' &&
    resolved.liveZfwLb > 20_000 &&
    resolved.zfwLb + 50 < resolved.liveZfwLb
  ) {
    throw new Error(
      `PMDG CDU ZFW target ${resolved.zfwLb.toFixed(0)} lb is below live ZFW ${resolved.liveZfwLb.toFixed(0)} lb (cargoSource=${resolved.cargoSource}, stationCargo=${resolved.stationCargoLb.toFixed(0)})`,
    );
  }

  const result = await opts.engine.applyLoadPlan({
    payload: { total: resolved.zfwLb },
    cgPolicy: 'none',
    skipVerify: true,
  } satisfies LoadPlanRequest);

  return {
    payload: result.payload,
    zfwLb: resolved.zfwLb,
    emptyLb: resolved.emptyLb,
    liveZfwLb: resolved.liveZfwLb,
    liveCargoLb: resolved.liveCargoLb,
    method: `${resolved.method}/${resolved.cargoSource}`,
    corrected: false,
  };
}
