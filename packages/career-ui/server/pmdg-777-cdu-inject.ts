/**
 * Career inject one-shot for PMDG 777 CDU (77X / ROTOR_BRAKE).
 * Kept separate from NG3/737 inject so LSK/timing/display changes do not
 * cross-break the BCF path.
 */
import {
  bcf777FuelInjectOptions,
  bcf777ZfwInjectOptions,
  buildPmdg777FuelKeySequence,
  buildPmdg777ZfwKeySequence,
  DEFAULT_JET_A_LB_PER_GAL,
  fuelLbToDisplay777,
  zfwLbToDisplay,
  type AircraftProfile,
  type FuelTarget,
  type OfpExpectation,
  type OperationResult,
} from '@msfs-compat/shared';
import type { DefaultProfileEngine } from '@msfs-compat/runtime';
import type { NamedPipeSimBridge } from '../../agent/src/named-pipe-sim-bridge.ts';
import { watchDebugLog } from './debug-log.ts';
import {
  resolvePmdgCduZfwTarget,
  sendPmdgCduKeystream,
} from './pmdg-cdu-inject.ts';

/** PMDG 777 uses 77X SDK event IDs via SimBridge cduFamily=777 (not NG3 offsets). */
export function isPmdg777CduProfile(profile: AircraftProfile): boolean {
  const title = profile.match?.title ?? '';
  const key = profile.profileKey ?? profile.profileId ?? '';
  return /777/i.test(title) || /777/i.test(key);
}

export async function applyPmdg777CduFuelOnce(opts: {
  bridge: NamedPipeSimBridge;
  fuel: FuelTarget;
  profile: AircraftProfile;
}): Promise<OperationResult | undefined> {
  const started = Date.now();
  let dens = DEFAULT_JET_A_LB_PER_GAL;
  try {
    const d = await opts.bridge.readSimVar({
      name: 'FUEL WEIGHT PER GALLON',
      unit: 'pounds',
    });
    if (Number.isFinite(d) && d >= 5 && d <= 8) dens = d;
  } catch {
    /* Jet-A default */
  }
  const unit = (opts.profile.fuel.unit ?? 'gallons').toLowerCase();
  const tankSum = Object.values(opts.fuel.tanks ?? {}).reduce(
    (sum, v) => sum + (typeof v === 'number' && Number.isFinite(v) ? v : 0),
    0,
  );
  const raw =
    tankSum > 0
      ? tankSum
      : typeof opts.fuel.total === 'number' && Number.isFinite(opts.fuel.total)
        ? opts.fuel.total
        : 0;
  const totalLb =
    unit === 'lb' || unit === 'lbs' || unit === 'pounds'
      ? raw
      : unit === 'kg' || unit === 'kgs'
        ? raw * 2.2046226218
        : raw * dens;
  if (totalLb < 1) {
    return {
      success: false,
      strategyUsed: 'pmdg-cdu',
      fallbackUsed: false,
      durationMs: Date.now() - started,
      errorCode: 'FUEL_WRITE_FAILED',
      details: { message: 'PMDG 777 CDU fuel target is empty (0 lb)' },
    };
  }

  const display = fuelLbToDisplay777(totalLb);
  const keyOpts = bcf777FuelInjectOptions(display);
  const steps = buildPmdg777FuelKeySequence(keyOpts);

  watchDebugLog('inject', 'pmdg-777 fuel keystream', {
    airframe: '777',
    sdk: '77x-rotor',
    cdu: keyOpts.cdu,
    fsActionsLsk: keyOpts.fsActionsLsk,
    totalLsk: keyOpts.totalLsk,
    method: keyOpts.method,
    steps: steps.length,
    totalDisplay: display,
    totalTargetLb: Math.round(totalLb),
    plan: steps.map((s, idx) => ({
      n: idx + 1,
      key: s.key,
      label: s.label,
      method: s.method ?? keyOpts.method,
    })),
  });

  try {
    await sendPmdgCduKeystream(opts.bridge, steps, {
      delayMs: keyOpts.delayMs,
      pageDelayMs: keyOpts.pageDelayMs,
      method: keyOpts.method,
      parameter: keyOpts.parameter,
      release: keyOpts.release,
      cdu: keyOpts.cdu,
      cduFamily: '777',
      eventOnly: true,
    });
  } catch (error) {
    return {
      success: false,
      strategyUsed: 'pmdg-cdu',
      fallbackUsed: false,
      durationMs: Date.now() - started,
      errorCode: 'FUEL_WRITE_FAILED',
      details: {
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }

  return {
    success: true,
    strategyUsed: 'pmdg-cdu',
    fallbackUsed: false,
    durationMs: Date.now() - started,
    details: {
      totalLb,
      display,
      steps: steps.length,
      cdu: keyOpts.cdu,
      airframe: '777',
    },
  };
}

async function readLiveZfwLbAfterWrite(
  bridge: NamedPipeSimBridge,
): Promise<number | undefined> {
  try {
    const z = await bridge.readLVar('ZFW_Lvar');
    if (Number.isFinite(z) && z >= 20_000 && z <= 200_000) return z;
    if (Number.isFinite(z) && z >= 40 && z < 500) return z * 1000;
  } catch {
    /* fall through */
  }
  return undefined;
}

/**
 * Type absolute ZFW on FO CDU for PMDG 777 (SimBrief est_zfw preferred).
 * Tries EFB L:ZFW_Lvar first; falls back to 77X rotor keystream.
 */
export async function applyPmdg777CduPayloadOnce(opts: {
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
  profile?: AircraftProfile;
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

  if (
    resolved.method !== 'ofp-zfw' &&
    resolved.liveZfwLb > 20_000 &&
    resolved.zfwLb + 50 < resolved.liveZfwLb
  ) {
    throw new Error(
      `PMDG 777 CDU ZFW target ${resolved.zfwLb.toFixed(0)} lb is below live ZFW ${resolved.liveZfwLb.toFixed(0)} lb (cargoSource=${resolved.cargoSource}, stationCargo=${resolved.stationCargoLb.toFixed(0)})`,
    );
  }

  const started = Date.now();
  const skip = opts.skipScratchpadClear === true;
  const display = zfwLbToDisplay(resolved.zfwLb);

  // 777 MSFS: SUMMARY ZFW often ignores CDU LSK via SimConnect. Try EFB LVar first.
  if (typeof opts.bridge.writeLVar === 'function') {
    try {
      watchDebugLog('inject', 'pmdg-777 try L:ZFW_Lvar write', {
        zfwTargetLb: Math.round(resolved.zfwLb),
      });
      await opts.bridge.writeLVar({ name: 'ZFW_Lvar', value: resolved.zfwLb });
      await opts.bridge.delay(600);
      const liveAfter = await readLiveZfwLbAfterWrite(opts.bridge);
      const tol = Math.max(500, resolved.zfwLb * 0.01);
      if (
        liveAfter !== undefined &&
        Math.abs(liveAfter - resolved.zfwLb) <= tol
      ) {
        watchDebugLog('inject', 'pmdg-777 L:ZFW_Lvar write ok', {
          liveZfw: Math.round(liveAfter),
        });
        return {
          payload: {
            success: true,
            strategyUsed: 'pmdg-cdu',
            fallbackUsed: false,
            durationMs: Date.now() - started,
            details: {
              zfwLb: resolved.zfwLb,
              display,
              path: 'L:ZFW_Lvar',
              skipScratchpadClear: skip,
            },
          },
          zfwLb: resolved.zfwLb,
          emptyLb: resolved.emptyLb,
          liveZfwLb: liveAfter,
          liveCargoLb: resolved.liveCargoLb,
          method: `${resolved.method}/${resolved.cargoSource}/lvar`,
          corrected: false,
        };
      }
      watchDebugLog('inject', 'pmdg-777 L:ZFW_Lvar write no-op — CDU fallback', {
        liveZfw: liveAfter !== undefined ? Math.round(liveAfter) : null,
      });
    } catch (error) {
      watchDebugLog('inject', 'pmdg-777 L:ZFW_Lvar write failed — CDU fallback', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const keyOpts = bcf777ZfwInjectOptions(display, { skipScratchpadClear: skip });
  const steps = buildPmdg777ZfwKeySequence(keyOpts);
  const clrSteps = steps.filter((s) => s.key === 'CLR').length;
  watchDebugLog('inject', 'pmdg-777 zfw keystream', {
    skipScratchpadClear: skip,
    airframe: '777',
    sdk: '77x-rotor',
    cdu: keyOpts.cdu,
    fsActionsLsk: keyOpts.fsActionsLsk,
    zfwLsk: keyOpts.zfwLsk,
    emptyFirst: keyOpts.emptyFirst === true,
    method: keyOpts.method,
    clrSteps,
    steps: steps.length,
    zfwDisplay: display,
    zfwTargetLb: Math.round(resolved.zfwLb),
    plan: steps.map((s, idx) => ({
      n: idx + 1,
      key: s.key,
      label: s.label,
      method: s.method ?? keyOpts.method,
    })),
  });
  watchDebugLog('inject', 'debug log path', {
    path: 'profiles/career/watch-debug.log',
    filter: 'Select-String "\\[cdu\\]|\\[inject\\]" profiles/career/watch-debug.log',
  });
  if (skip && clrSteps > 0) {
    throw new Error(
      `PMDG 777 CDU ZFW skipScratchpadClear requested but keystream still has ${clrSteps} CLR step(s)`,
    );
  }

  try {
    await sendPmdgCduKeystream(opts.bridge, steps, {
      ...keyOpts,
      cduFamily: '777',
      eventOnly: true,
    });
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
