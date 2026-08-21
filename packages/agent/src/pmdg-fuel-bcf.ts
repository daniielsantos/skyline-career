/**
 * Standalone PMDG 737-800 BCF validation: set total fuel on CDU
 * FS ACTIONS → FUEL via sendPmdgNg3Control. Not career inject.
 *
 * Assumed LSK map (PMDG tutorial + BCF live payload findings):
 *   MENU → R5 (FS ACTIONS) → L1 (FUEL)
 *   On FUEL screen (BCF live): L1=TOTAL LBS, L2=LEVEL (%), L3=SET FULL,
 *   L4=SET 2/3, L5=SET 1/3, L6=RETURN — left LSKs match on-screen (no +1).
 *   Default TOTAL commit is SDK L1 (NOT L2 — L2 writes LEVEL percent).
 *   Preferred path: type display scale (25.0 ≈ 25000 lb) → L1
 *   (aircraft redistributes L/C/R). Live: decimal scratchpad works like ZFW.
 *
 * Live findings (shared with pmdg-payload-bcf):
 * - `method=event` can no-op; use `method=control` + parameter=1.
 * - One control write per key + EventId→0 clear (Host).
 */

import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';
import {
  buildMenuSmokeSequence,
  parseCduSide,
  scratchpadToKeys,
  sendBcfPayloadKeySequence,
  type CduKeyStep,
} from './pmdg-payload-bcf.js';

export const BCF_FUEL_DEFAULTS = {
  units: 'lb' as const,
  /** Inter-key delay (ms). Tuned for ~5s TOTAL path; use --slow if flaky. */
  delayMs: 200,
  pageDelayMs: 400,
  commitDelayMs: 500,
  afterFieldDelayMs: 900,
  fieldClrCount: 2,
  /** FS ACTIONS → FUEL (tutorial L1; first row). */
  fuelPageLsk: 'L1',
  /**
   * TOTAL LBS line-select. Live BCF: L1 (L2 is LEVEL % — do not use for lb).
   */
  totalLsk: 'L1',
  /** Preset LSKs — match on-screen L3/L4/L5 (BCF live). */
  presetFullLsk: 'L3',
  presetTwoThirdsLsk: 'L4',
  presetOneThirdLsk: 'L5',
  method: 'control' as const,
  parameter: 1,
  /** FO CDU (right) — same side GSX types on. */
  cdu: 'right' as const,
} as const;

/** Conservative timings (pre-tune). Opt in with --slow. */
export const BCF_FUEL_SLOW_TIMING = {
  delayMs: 400,
  pageDelayMs: 800,
  commitDelayMs: 1200,
  afterFieldDelayMs: 2500,
} as const;

/** Example TOTAL display (~25000 lb at density 6.7). */
export const BCF_FUEL_DISPLAY_EXAMPLE = '25.0';

export type BcfFuelUnits = 'lb' | 'kg';
export type BcfFuelMethod = 'event' | 'control';
export type BcfFuelPreset = 'full' | '2/3' | '1/3';

export type BcfFuelOptions = {
  units: BcfFuelUnits;
  delayMs: number;
  pageDelayMs: number;
  commitDelayMs: number;
  afterFieldDelayMs: number;
  fieldClrCount: number;
  /** CDU TOTAL display string (e.g. "16.8"). */
  totalDisplay?: string;
  /** When set, press preset LSK instead of typing TOTAL. */
  preset?: BcfFuelPreset;
  fuelPageLsk: string;
  totalLsk: string;
  presetFullLsk: string;
  presetTwoThirdsLsk: string;
  presetOneThirdLsk: string;
  method: BcfFuelMethod;
  parameter: number;
  release: boolean;
  /** Captain left or FO right CDU (GSX uses right). */
  cdu: 'left' | 'right';
};

function assertNonNegInt(name: string, n: number): number {
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    throw new Error(`${name} must be a non-negative integer (got ${n})`);
  }
  return n;
}

/** CDU TOTAL line uses thousands (25.0 ≈ 25000 lb) — same scale as ZFW. */
export function fuelLbToDisplay(lb: number): string {
  if (!Number.isFinite(lb) || lb < 0) {
    throw new Error(`fuel lb must be a non-negative number (got ${lb})`);
  }
  return (lb / 1000).toFixed(1);
}

export function parseFuelDisplay(raw: string): string {
  const t = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) {
    throw new Error(
      `--total must look like 25.0 or 16.8 (CDU display scale), got "${raw}"`,
    );
  }
  return t;
}

function pushClr(steps: CduKeyStep[], count: number, reason: string): void {
  const n = Math.max(0, count);
  for (let i = 0; i < n; i++) {
    steps.push({ label: `CLR (${reason} ${i + 1}/${n})`, key: 'CLR' });
  }
}

function pushNavigateToFuel(steps: CduKeyStep[], opts: BcfFuelOptions): void {
  pushClr(steps, 2, 'start');
  steps.push({ label: 'MENU', key: 'MENU', pagePause: true });
  steps.push({ label: 'R5 (FS ACTIONS)', key: 'R5', pagePause: true });
  steps.push({
    label: `${opts.fuelPageLsk} (FUEL)`,
    key: opts.fuelPageLsk,
    pagePause: true,
  });
}

function presetLsk(opts: BcfFuelOptions, preset: BcfFuelPreset): string {
  switch (preset) {
    case 'full':
      return opts.presetFullLsk;
    case '2/3':
      return opts.presetTwoThirdsLsk;
    case '1/3':
      return opts.presetOneThirdLsk;
    default: {
      const _exhaustive: never = preset;
      return _exhaustive;
    }
  }
}

/**
 * Build keystream: navigate to FUEL and enter TOTAL display (or preset LSK).
 */
export function buildBcfFuelKeySequence(opts: BcfFuelOptions): CduKeyStep[] {
  if (opts.preset && opts.totalDisplay) {
    throw new Error('preset and totalDisplay are mutually exclusive');
  }
  if (!opts.preset && !opts.totalDisplay) {
    throw new Error('totalDisplay or preset is required for fuel keystream');
  }

  const steps: CduKeyStep[] = [];
  pushNavigateToFuel(steps, opts);

  if (opts.preset) {
    const lsk = presetLsk(opts, opts.preset);
    steps.push({
      label: `${lsk} (SET ${opts.preset.toUpperCase()})`,
      key: lsk,
      delayAfterMs: opts.afterFieldDelayMs,
    });
    return steps;
  }

  const total = opts.totalDisplay!.trim();
  pushClr(steps, opts.fieldClrCount, 'before TOTAL');
  const digs = scratchpadToKeys(total);
  for (let i = 0; i < digs.length; i++) {
    const d = digs[i]!;
    const isLast = i === digs.length - 1;
    steps.push(isLast ? { ...d, delayAfterMs: opts.commitDelayMs } : d);
  }
  steps.push({
    label: `${opts.totalLsk} (TOTAL=${total} ${opts.units} display)`,
    key: opts.totalLsk,
    delayAfterMs: opts.afterFieldDelayMs,
  });
  return steps;
}

export { buildMenuSmokeSequence };

export function formatBcfFuelPlan(
  opts: BcfFuelOptions,
  steps: CduKeyStep[],
  mode: 'total' | 'preset' | 'smoke-menu' = 'total',
): string {
  const lines = [
    mode === 'smoke-menu'
      ? 'PMDG BCF — CDU smoke (MENU only; watch the CDU screen)'
      : mode === 'preset'
        ? `PMDG 737-800 BCF — CDU FUEL preset SET ${opts.preset?.toUpperCase()}`
        : 'PMDG 737-800 BCF — CDU FUEL TOTAL validation (aircraft fills L/C/R)',
    `  method=${opts.method}  parameter=${opts.parameter}  release=${opts.release}  cdu=${opts.cdu}`,
    mode === 'smoke-menu'
      ? '  (no fuel typing)'
      : mode === 'preset'
        ? `  preset=${opts.preset}  units=${opts.units}`
        : `  TOTAL display=${opts.totalDisplay}  units=${opts.units}  lsk=${opts.totalLsk}`,
    `  delayMs=${opts.delayMs}  pageDelayMs=${opts.pageDelayMs}  commitDelayMs=${opts.commitDelayMs}  afterFieldDelayMs=${opts.afterFieldDelayMs}  fieldClrCount=${opts.fieldClrCount}`,
    mode === 'smoke-menu'
      ? '  nav: CLR → MENU'
      : mode === 'preset'
        ? `  nav: MENU → R5 → ${opts.fuelPageLsk}(FUEL) → preset LSK`
        : `  nav: MENU → R5 → ${opts.fuelPageLsk}(FUEL) → type TOTAL → ${opts.totalLsk}`,
    `  steps (${steps.length}):`,
    ...steps.map((s, i) => `    ${String(i + 1).padStart(3)}. ${s.label}`),
    '',
    'Before run: BCF loaded, FO (right) CDU powered if cdu=right, parked, do not touch that CDU.',
    mode === 'total'
      ? 'TOTAL uses CDU display scale (25.0 ≈ 25000 lb). After run: L/C/R should redistribute.'
      : 'Match --units to PMDG Options (lb vs kg).',
    'TOTAL is L1; L2 is LEVEL (%) — if you see xx.x% on LEVEL, you hit the wrong LSK.',
    'After run: check CDU TOTAL LBS (not LEVEL); EFB/classic fuel mirrors; optional probe-pmdg-fuel.',
  ];
  return lines.join('\n');
}

export async function sendBcfFuelKeySequence(
  bridge: NamedPipeSimBridge,
  steps: CduKeyStep[],
  opts: Pick<
    BcfFuelOptions,
    'delayMs' | 'pageDelayMs' | 'method' | 'parameter' | 'release' | 'cdu'
  >,
): Promise<void> {
  return sendBcfPayloadKeySequence(bridge, steps, opts);
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
    dryRun: has('--dry-run'),
    yes: has('--yes'),
    smokeMenu,
  };
}
