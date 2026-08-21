/**
 * Career inject one-shot for PMDG NG3 CDU strategies (BCF-validated).
 * Kept out of the classic multi-round tank/station CG loop.
 *
 * Primary ZFW source: SimBrief `loadSheet.zfw` (est_zfw). Fallback: live ZFW -
 * cargo + Due cargo when the OFP sheet has no zfw.
 */
import type { DefaultProfileEngine } from '@msfs-compat/runtime';
import {
  bcfZfwInjectOptions,
  buildBcfZfwKeySequence,
  computePmdgCduZfwTargetLb,
  DEFAULT_JET_A_LB_PER_GAL,
  resolvePmdgLiveCargoLb,
  toLb,
  zfwLbToDisplay,
  floorPmdgCduZfwToEmpty,
  type AircraftProfile,
  type CduKeyStep,
  type FuelTarget,
  type LoadPlanRequest,
  type OfpExpectation,
  type OfpWeightUnit,
  type OperationResult,
} from '@msfs-compat/shared';
import type { NamedPipeSimBridge } from '../../agent/src/named-pipe-sim-bridge.ts';
import { watchDebugLog } from './debug-log.ts';

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

/** Send FO CDU keys (same pacing as runtime pmdg-cdu strategy). */
async function sendPmdgCduKeystream(
  bridge: NamedPipeSimBridge,
  steps: CduKeyStep[],
  opts: {
    delayMs: number;
    pageDelayMs: number;
    method: 'event' | 'control';
    parameter: number;
    release: boolean;
    cdu: 'left' | 'right';
  },
): Promise<void> {
  if (typeof bridge.sendPmdgNg3Control !== 'function') {
    throw new Error(
      'PMDG CDU inject requires bridge.sendPmdgNg3Control (NamedPipe / SimBridgeHost)',
    );
  }
  let prevKey: string | undefined;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    if (prevKey !== undefined && prevKey === step.key) {
      await bridge.delay(Math.max(opts.delayMs, 100));
    }
    await bridge.sendPmdgNg3Control({
      key: step.key,
      release: step.release ?? opts.release,
      method: step.method ?? opts.method,
      parameter: step.parameter ?? opts.parameter,
      cdu: opts.cdu,
      ...(step.holdMs !== undefined ? { holdMs: step.holdMs } : {}),
    });
    prevKey = step.key;
    if (i + 1 >= steps.length) break;
    const wait =
      step.delayAfterMs ?? (step.pagePause ? opts.pageDelayMs : opts.delayMs);
    if (wait > 0) {
      await bridge.delay(wait);
    }
  }
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
  /**
   * Career pax_and_cargo: ignore SimBrief est_zfw when the pilot hand-edited
   * cargo= without the hybrid seat split (est_zfw embeds inflated payload).
   */
  ignoreOfpZfw?: boolean;
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
  const ofpZfw =
    opts.ignoreOfpZfw === true
      ? undefined
      : opts.ofp
        ? resolveOfpZfwLb(opts.ofp)
        : undefined;

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
    const floored = floorPmdgCduZfwToEmpty({
      ofpZfwLb: ofpZfw,
      emptyLb,
      requestedCargoLb: opts.requestedCargoLb,
    });
    return {
      zfwLb: floored.zfwLb,
      liveZfwLb,
      liveCargoLb: stationCargoLb,
      stationCargoLb,
      emptyLb,
      cargoSource: floored.floored
        ? 'ofp-zfw-below-empty'
        : 'simbrief-est-zfw',
      method: floored.floored ? 'empty-plus-cargo' : 'ofp-zfw',
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
 * Builds the keystream here (not via runtime dist) so skipScratchpadClear is
 * honored even when packages/runtime/dist is stale.
 */
export async function applyPmdgCduPayloadOnce(opts: {
  engine: DefaultProfileEngine;
  bridge: NamedPipeSimBridge;
  ofp: OfpExpectation;
  requestedCargoLb: number;
  liveStations?: Record<number, number>;
  baggageStationIndexes: number[];
  fixedNonCargoStationIndexes?: number[];
  ignoreOfpZfw?: boolean;
  /** Fuel TOTAL already flushed the scratchpad in this inject session. */
  skipScratchpadClear?: boolean;
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

  const started = Date.now();
  const skip = opts.skipScratchpadClear === true;
  const display = zfwLbToDisplay(resolved.zfwLb);
  const keyOpts = bcfZfwInjectOptions(display, { skipScratchpadClear: skip });
  const steps = buildBcfZfwKeySequence(keyOpts);
  const clrSteps = steps.filter((s) => s.key === 'CLR').length;
  watchDebugLog('inject', 'pmdg-cdu zfw keystream', {
    skipScratchpadClear: skip,
    clrSteps,
    steps: steps.length,
    zfwDisplay: display,
    firstKeys: steps.slice(0, 5).map((s) => s.key),
  });
  if (skip && clrSteps > 0) {
    throw new Error(
      `PMDG CDU ZFW skipScratchpadClear requested but keystream still has ${clrSteps} CLR step(s)`,
    );
  }

  try {
    await sendPmdgCduKeystream(opts.bridge, steps, keyOpts);
  } catch (error) {
    return {
      payload: {
        success: false,
        strategyUsed: 'pmdg-cdu',
        fallbackUsed: false,
        durationMs: Date.now() - started,
        errorCode: 'PAYLOAD_WRITE_FAILED',
        details: {
          message: error instanceof Error ? error.message : String(error),
          skipScratchpadClear: skip,
          clrSteps,
        },
      },
      zfwLb: resolved.zfwLb,
      emptyLb: resolved.emptyLb,
      liveZfwLb: resolved.liveZfwLb,
      liveCargoLb: resolved.liveCargoLb,
      method: `${resolved.method}/${resolved.cargoSource}`,
      corrected: false,
    };
  }

  return {
    payload: {
      success: true,
      strategyUsed: 'pmdg-cdu',
      fallbackUsed: false,
      durationMs: Date.now() - started,
      details: {
        zfwLb: resolved.zfwLb,
        display,
        skipScratchpadClear: skip,
        clrSteps,
        steps: steps.length,
      },
    },
    zfwLb: resolved.zfwLb,
    emptyLb: resolved.emptyLb,
    liveZfwLb: resolved.liveZfwLb,
    liveCargoLb: resolved.liveCargoLb,
    method: `${resolved.method}/${resolved.cargoSource}`,
    corrected: false,
  };
}
