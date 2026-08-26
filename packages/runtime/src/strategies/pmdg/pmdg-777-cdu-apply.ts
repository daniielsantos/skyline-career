/**
 * PMDG 777 fuel/payload keystream apply helpers for runtime `pmdg-cdu` strategy.
 * Kept separate from NG3 so 777 LSK/timing changes do not touch the BCF path.
 */
import {
  buildPmdg777FuelKeySequence,
  buildPmdg777ZfwKeySequence,
  bcf777FuelInjectOptions,
  bcf777ZfwInjectOptions,
  fuelLbToDisplay777,
  zfwLbToDisplay,
  type CduKeyStep,
} from '@msfs-compat/shared';
import type { AircraftProfile, OperationResult } from '@msfs-compat/shared';
import type { SimBridge } from '../../types.js';

export function isPmdg777Profile(profile: AircraftProfile): boolean {
  const title = profile.match?.title ?? '';
  const key = profile.profileKey ?? profile.profileId ?? '';
  return /777/i.test(title) || /777/i.test(key);
}

type SendKeystream = (
  bridge: SimBridge,
  steps: CduKeyStep[],
  opts: {
    delayMs: number;
    pageDelayMs: number;
    method: 'event' | 'control' | 'rotor';
    parameter: number;
    release: boolean;
    cdu: 'left' | 'right';
    cduFamily?: 'ng3' | '777';
    eventOnly?: boolean;
  },
) => Promise<void>;

export async function applyPmdg777RuntimeFuel(opts: {
  bridge: SimBridge;
  totalLb: number;
  sendKeystream: SendKeystream;
  started: number;
  strategyName: string;
}): Promise<OperationResult> {
  const display = fuelLbToDisplay777(opts.totalLb);
  const keyOpts = bcf777FuelInjectOptions(display);
  const steps = buildPmdg777FuelKeySequence(keyOpts);
  await opts.sendKeystream(opts.bridge, steps, {
    ...keyOpts,
    cduFamily: '777',
    eventOnly: true,
  });
  return {
    success: true,
    strategyUsed: opts.strategyName,
    fallbackUsed: false,
    durationMs: Date.now() - opts.started,
    details: {
      totalLb: opts.totalLb,
      display,
      steps: steps.length,
      cdu: keyOpts.cdu,
      airframe: '777',
    },
  };
}

export async function applyPmdg777RuntimeZfw(opts: {
  bridge: SimBridge;
  zfwLb: number;
  skipScratchpadClear: boolean;
  sendKeystream: SendKeystream;
  started: number;
  strategyName: string;
  emptyLb: number;
  payloadLb: number;
}): Promise<OperationResult> {
  const display = zfwLbToDisplay(opts.zfwLb);
  const keyOpts = bcf777ZfwInjectOptions(display, {
    skipScratchpadClear: opts.skipScratchpadClear,
  });
  const steps = buildPmdg777ZfwKeySequence(keyOpts);
  await opts.sendKeystream(opts.bridge, steps, {
    ...keyOpts,
    cduFamily: '777',
    eventOnly: true,
  });
  return {
    success: true,
    strategyUsed: opts.strategyName,
    fallbackUsed: false,
    durationMs: Date.now() - opts.started,
    details: {
      zfwLb: opts.zfwLb,
      display,
      emptyLb: opts.emptyLb,
      payloadLb: opts.payloadLb,
      steps: steps.length,
      cdu: keyOpts.cdu,
      skipScratchpadClear: keyOpts.skipScratchpadClear === true,
      clrSteps: steps.filter((s) => s.key === 'CLR').length,
      airframe: '777',
    },
  };
}
