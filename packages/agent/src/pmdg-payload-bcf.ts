/**
 * Standalone PMDG 737-800 BCF PAYLOAD validation CLI helpers.
 * Keystream builders live in @msfs-compat/shared (also used by career inject).
 */

import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';
import {
  BCF_PAYLOAD_DEFAULTS,
  BCF_PAYLOAD_SLOW_TIMING,
  parseCduSide,
  parseZfwDisplay,
  zfwLbToDisplay,
  type BcfPayloadMethod,
  type BcfPayloadOptions,
  type CduKeyStep,
} from '@msfs-compat/shared';

export {
  BCF_PAYLOAD_DEFAULTS,
  BCF_PAYLOAD_SLOW_TIMING,
  BCF_ZFW_DISPLAY_EXAMPLE,
  buildBcfPayloadKeySequence,
  buildBcfZfwKeySequence,
  buildMenuSmokeSequence,
  formatBcfPayloadPlan,
  parseCduSide,
  parseZfwDisplay,
  scratchpadToKeys,
  zfwLbToDisplay,
  type BcfPayloadMethod,
  type BcfPayloadOptions,
  type BcfPayloadUnits,
  type CduKeyStep,
} from '@msfs-compat/shared';

function assertNonNegInt(name: string, n: number): number {
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    throw new Error(`${name} must be a non-negative integer (got ${n})`);
  }
  return n;
}

export async function sendBcfPayloadKeySequence(
  bridge: NamedPipeSimBridge,
  steps: CduKeyStep[],
  opts: Pick<
    BcfPayloadOptions,
    'delayMs' | 'pageDelayMs' | 'method' | 'parameter' | 'release' | 'cdu'
  >,
  log: (line: string) => void = console.log,
): Promise<void> {
  let prevKey: string | undefined;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    if (prevKey !== undefined && prevKey === step.key) {
      await bridge.delay(Math.max(opts.delayMs, 100));
    }
    const result = await bridge.sendPmdgNg3Control({
      key: step.key,
      release: step.release ?? opts.release,
      method: step.method ?? opts.method,
      parameter: step.parameter ?? opts.parameter,
      cdu: opts.cdu,
      ...(step.holdMs !== undefined ? { holdMs: step.holdMs } : {}),
    });
    log(
      `  [${i + 1}/${steps.length}] ${step.label} → eventId=${result.eventId} cdu=${result.cdu ?? opts.cdu} method=${result.method ?? step.method ?? opts.method} parameter=0x${Number(result.parameter).toString(16)}${step.holdMs ? ` holdMs=${step.holdMs}` : ''}`,
    );
    prevKey = step.key;
    if (i + 1 >= steps.length) break;
    const wait =
      step.delayAfterMs ??
      (step.pagePause ? opts.pageDelayMs : opts.delayMs);
    if (wait > 0) {
      await bridge.delay(wait);
    }
  }
}

export async function dumpPayloadStations(
  bridge: NamedPipeSimBridge,
  maxStation = 11,
): Promise<Array<{ index: number; lb: number }>> {
  const requests = Array.from({ length: maxStation }, (_, i) => ({
    name: `PAYLOAD STATION WEIGHT:${i + 1}`,
    unit: 'pounds' as const,
  }));
  const values = await bridge.readSimVars(requests);
  const out: Array<{ index: number; lb: number }> = [];
  for (let i = 0; i < maxStation; i++) {
    const lb = values[i];
    if (typeof lb === 'number' && Number.isFinite(lb)) {
      out.push({ index: i + 1, lb });
    }
  }
  return out;
}

export function parseBcfPayloadCliArgs(args: string[]): BcfPayloadOptions & {
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

  const unitsRaw = (get('--units') ?? BCF_PAYLOAD_DEFAULTS.units).toLowerCase();
  if (unitsRaw !== 'lb' && unitsRaw !== 'kg') {
    throw new Error(`--units must be lb or kg (got ${unitsRaw})`);
  }

  const methodRaw = (get('--method') ?? BCF_PAYLOAD_DEFAULTS.method).toLowerCase();
  if (methodRaw !== 'event' && methodRaw !== 'control') {
    throw new Error(`--method must be event or control (got ${methodRaw})`);
  }
  const method: BcfPayloadMethod = methodRaw;

  const timing = has('--slow') ? BCF_PAYLOAD_SLOW_TIMING : BCF_PAYLOAD_DEFAULTS;

  const num = (flag: string, fallback: number): number => {
    const raw = get(flag);
    if (raw === undefined) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`Invalid ${flag}: ${raw}`);
    return assertNonNegInt(flag, Math.round(n));
  };

  const defaultParam =
    method === 'control' ? BCF_PAYLOAD_DEFAULTS.parameter : 0;
  const defaultRelease = method === 'event';

  const tiny = has('--tiny');
  const uniqueDigits = has('--unique-digits');
  const onlyRaw = (get('--only') ?? '').toLowerCase();
  let onlyField: 'main' | 'fwd' | 'aft' | undefined;
  if (onlyRaw) {
    if (onlyRaw !== 'main' && onlyRaw !== 'fwd' && onlyRaw !== 'aft') {
      throw new Error(`--only must be main|fwd|aft (got ${onlyRaw})`);
    }
    onlyField = onlyRaw;
  }

  let zfwDisplay: string | undefined;
  const zfwRaw = get('--zfw');
  const zfwLbRaw = get('--zfw-lb');
  if (zfwRaw !== undefined && zfwLbRaw !== undefined) {
    throw new Error('Use only one of --zfw or --zfw-lb');
  }
  if (zfwRaw !== undefined) {
    zfwDisplay = parseZfwDisplay(zfwRaw);
  } else if (zfwLbRaw !== undefined) {
    const lb = Number(zfwLbRaw);
    if (!Number.isFinite(lb)) throw new Error(`Invalid --zfw-lb: ${zfwLbRaw}`);
    zfwDisplay = zfwLbToDisplay(lb);
  }

  if (zfwDisplay && onlyField) {
    throw new Error('--zfw and --only cannot be combined');
  }

  return {
    main: num(
      '--main',
      uniqueDigits ? 1234 : tiny ? 1000 : BCF_PAYLOAD_DEFAULTS.main,
    ),
    fwd: num(
      '--fwd',
      uniqueDigits ? 567 : tiny ? 200 : BCF_PAYLOAD_DEFAULTS.fwd,
    ),
    aft: num(
      '--aft',
      uniqueDigits ? 89 : tiny ? 200 : BCF_PAYLOAD_DEFAULTS.aft,
    ),
    units: unitsRaw,
    delayMs: num('--delay-ms', timing.delayMs),
    pageDelayMs: num('--page-delay-ms', timing.pageDelayMs),
    afterEmptyDelayMs: num('--after-empty-ms', timing.afterEmptyDelayMs),
    commitDelayMs: num('--commit-delay-ms', timing.commitDelayMs),
    afterFieldDelayMs: num('--after-field-ms', timing.afterFieldDelayMs),
    fieldClrCount: num('--field-clr', BCF_PAYLOAD_DEFAULTS.fieldClrCount),
    emptyFirst: has('--empty-first'),
    ...(onlyField ? { onlyField } : {}),
    ...(zfwDisplay ? { zfwDisplay } : {}),
    payloadPageLsk: (
      get('--payload-page-lsk') ?? BCF_PAYLOAD_DEFAULTS.payloadPageLsk
    ).toUpperCase(),
    mainLsk: (get('--main-lsk') ?? BCF_PAYLOAD_DEFAULTS.mainLsk).toUpperCase(),
    fwdLsk: (get('--fwd-lsk') ?? BCF_PAYLOAD_DEFAULTS.fwdLsk).toUpperCase(),
    aftLsk: (get('--aft-lsk') ?? BCF_PAYLOAD_DEFAULTS.aftLsk).toUpperCase(),
    emptyLsk: (get('--empty-lsk') ?? BCF_PAYLOAD_DEFAULTS.emptyLsk).toUpperCase(),
    zfwLsk: (get('--zfw-lsk') ?? BCF_PAYLOAD_DEFAULTS.zfwLsk).toUpperCase(),
    method,
    parameter: num('--parameter', defaultParam),
    release: has('--release')
      ? true
      : has('--no-release')
        ? false
        : defaultRelease,
    cdu: parseCduSide(get('--cdu') ?? BCF_PAYLOAD_DEFAULTS.cdu),
    scratchpadClearHoldMs: num(
      '--scratchpad-clear-ms',
      BCF_PAYLOAD_DEFAULTS.scratchpadClearHoldMs,
    ),
    scratchpadClearTaps: num(
      '--scratchpad-clear-taps',
      BCF_PAYLOAD_DEFAULTS.scratchpadClearTaps,
    ),
    scratchpadClearTapDelayMs: num(
      '--scratchpad-clear-tap-delay',
      BCF_PAYLOAD_DEFAULTS.scratchpadClearTapDelayMs,
    ),
    scratchpadClearSettleMs: num(
      '--scratchpad-clear-settle',
      BCF_PAYLOAD_DEFAULTS.scratchpadClearSettleMs,
    ),
    dryRun: has('--dry-run'),
    yes: has('--yes'),
    smokeMenu: has('--smoke-menu'),
  };
}
