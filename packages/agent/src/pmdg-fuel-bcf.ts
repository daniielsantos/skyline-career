/**
 * Standalone PMDG 737-800 BCF FUEL validation CLI helpers.
 * Keystream builders live in @msfs-compat/shared (also used by career inject).
 */

import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';
import {
  BCF_FUEL_DEFAULTS,
  BCF_FUEL_SLOW_TIMING,
  fuelLbToDisplay,
  parseCduSide,
  parseFuelDisplay,
  type BcfFuelMethod,
  type BcfFuelOptions,
  type BcfFuelPreset,
  type CduKeyStep,
} from '@msfs-compat/shared';
import { sendBcfPayloadKeySequence } from './pmdg-payload-bcf.js';

export {
  BCF_FUEL_DEFAULTS,
  BCF_FUEL_DISPLAY_EXAMPLE,
  BCF_FUEL_SLOW_TIMING,
  buildBcfFuelKeySequence,
  buildMenuSmokeSequence,
  formatBcfFuelPlan,
  fuelLbToDisplay,
  parseFuelDisplay,
  type BcfFuelMethod,
  type BcfFuelOptions,
  type BcfFuelPreset,
  type BcfFuelUnits,
} from '@msfs-compat/shared';

function assertNonNegInt(name: string, n: number): number {
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    throw new Error(`${name} must be a non-negative integer (got ${n})`);
  }
  return n;
}

export async function sendBcfFuelKeySequence(
  bridge: NamedPipeSimBridge,
  steps: CduKeyStep[],
  opts: Pick<
    BcfFuelOptions,
    'delayMs' | 'pageDelayMs' | 'method' | 'parameter' | 'release' | 'cdu'
  >,
  log?: (line: string) => void,
): Promise<void> {
  return sendBcfPayloadKeySequence(bridge, steps, opts, log);
}

export async function dumpClassicFuelLb(
  bridge: NamedPipeSimBridge,
): Promise<{
  leftLb: number;
  rightLb: number;
  centerLb: number;
  totalLb: number;
  dens: number;
  leftGal: number;
  rightGal: number;
  centerGal: number;
}> {
  let dens = 6.7;
  try {
    const d = await bridge.readSimVar({
      name: 'FUEL WEIGHT PER GALLON',
      unit: 'pounds',
    });
    if (Number.isFinite(d) && d >= 5 && d <= 8) dens = d;
  } catch {
    /* Jet-A default */
  }
  const [leftGal, rightGal, centerGal] = await bridge.readSimVars([
    { name: 'FUEL TANK LEFT MAIN QUANTITY', unit: 'gallons' },
    { name: 'FUEL TANK RIGHT MAIN QUANTITY', unit: 'gallons' },
    { name: 'FUEL TANK CENTER QUANTITY', unit: 'gallons' },
  ]);
  const left = typeof leftGal === 'number' && Number.isFinite(leftGal) ? leftGal : 0;
  const right =
    typeof rightGal === 'number' && Number.isFinite(rightGal) ? rightGal : 0;
  const center =
    typeof centerGal === 'number' && Number.isFinite(centerGal) ? centerGal : 0;
  return {
    leftGal: left,
    rightGal: right,
    centerGal: center,
    leftLb: left * dens,
    rightLb: right * dens,
    centerLb: center * dens,
    totalLb: (left + right + center) * dens,
    dens,
  };
}

export function parseBcfFuelCliArgs(args: string[]): BcfFuelOptions & {
  dryRun: boolean;
  yes: boolean;
  smokeMenu: boolean;
} {
  const get = (name: string): string | undefined => {
    const idx = args.indexOf(name);
    if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
    return undefined;
  };
  const has = (name: string) => args.includes(name);

  const unitsRaw = (get('--units') ?? BCF_FUEL_DEFAULTS.units).toLowerCase();
  if (unitsRaw !== 'lb' && unitsRaw !== 'kg') {
    throw new Error(`--units must be lb or kg (got ${unitsRaw})`);
  }

  const methodRaw = (get('--method') ?? BCF_FUEL_DEFAULTS.method).toLowerCase();
  if (methodRaw !== 'event' && methodRaw !== 'control') {
    throw new Error(`--method must be event or control (got ${methodRaw})`);
  }
  const method: BcfFuelMethod = methodRaw;

  const timing = has('--slow') ? BCF_FUEL_SLOW_TIMING : BCF_FUEL_DEFAULTS;

  const num = (flag: string, fallback: number): number => {
    const raw = get(flag);
    if (raw === undefined) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`Invalid ${flag}: ${raw}`);
    return assertNonNegInt(flag, Math.round(n));
  };

  const defaultParam = method === 'control' ? BCF_FUEL_DEFAULTS.parameter : 0;
  const defaultRelease = method === 'event';

  let totalDisplay: string | undefined;
  const totalRaw = get('--total');
  const totalLbRaw = get('--total-lb');
  if (totalRaw !== undefined && totalLbRaw !== undefined) {
    throw new Error('Use only one of --total or --total-lb');
  }
  if (totalRaw !== undefined) {
    totalDisplay = parseFuelDisplay(totalRaw);
  } else if (totalLbRaw !== undefined) {
    const lb = Number(totalLbRaw);
    if (!Number.isFinite(lb)) throw new Error(`Invalid --total-lb: ${totalLbRaw}`);
    totalDisplay = fuelLbToDisplay(lb);
  }

  const presetRaw = (get('--preset') ?? '').toLowerCase();
  let preset: BcfFuelPreset | undefined;
  if (presetRaw) {
    if (presetRaw !== 'full' && presetRaw !== '2/3' && presetRaw !== '1/3') {
      throw new Error(`--preset must be full|2/3|1/3 (got ${presetRaw})`);
    }
    preset = presetRaw;
  }

  const smokeMenu = has('--smoke-menu');
  if (!smokeMenu && !preset && !totalDisplay) {
    throw new Error(
      'Provide --total 25.0, --total-lb 25000, --preset full|2/3|1/3, or --smoke-menu',
    );
  }
  if (preset && totalDisplay) {
    throw new Error('--preset and --total/--total-lb cannot be combined');
  }

  return {
    units: unitsRaw,
    delayMs: num('--delay-ms', timing.delayMs),
    pageDelayMs: num('--page-delay-ms', timing.pageDelayMs),
    commitDelayMs: num('--commit-delay-ms', timing.commitDelayMs),
    afterFieldDelayMs: num('--after-field-ms', timing.afterFieldDelayMs),
    fieldClrCount: num('--field-clr', BCF_FUEL_DEFAULTS.fieldClrCount),
    ...(totalDisplay ? { totalDisplay } : {}),
    ...(preset ? { preset } : {}),
    fuelPageLsk: (
      get('--fuel-page-lsk') ?? BCF_FUEL_DEFAULTS.fuelPageLsk
    ).toUpperCase(),
    totalLsk: (get('--total-lsk') ?? BCF_FUEL_DEFAULTS.totalLsk).toUpperCase(),
    presetFullLsk: (
      get('--preset-full-lsk') ?? BCF_FUEL_DEFAULTS.presetFullLsk
    ).toUpperCase(),
    presetTwoThirdsLsk: (
      get('--preset-23-lsk') ?? BCF_FUEL_DEFAULTS.presetTwoThirdsLsk
    ).toUpperCase(),
    presetOneThirdLsk: (
      get('--preset-13-lsk') ?? BCF_FUEL_DEFAULTS.presetOneThirdLsk
    ).toUpperCase(),
    method,
    parameter: num('--parameter', defaultParam),
    release: has('--release')
      ? true
      : has('--no-release')
        ? false
        : defaultRelease,
    cdu: parseCduSide(get('--cdu') ?? BCF_FUEL_DEFAULTS.cdu),
    scratchpadClearHoldMs: num(
      '--scratchpad-clear-ms',
      BCF_FUEL_DEFAULTS.scratchpadClearHoldMs,
    ),
    scratchpadClearTaps: num(
      '--scratchpad-clear-taps',
      BCF_FUEL_DEFAULTS.scratchpadClearTaps,
    ),
    scratchpadClearTapDelayMs: num(
      '--scratchpad-clear-tap-delay',
      BCF_FUEL_DEFAULTS.scratchpadClearTapDelayMs,
    ),
    scratchpadClearSettleMs: num(
      '--scratchpad-clear-settle',
      BCF_FUEL_DEFAULTS.scratchpadClearSettleMs,
    ),
    dryRun: has('--dry-run'),
    yes: has('--yes'),
    smokeMenu,
  };
}
