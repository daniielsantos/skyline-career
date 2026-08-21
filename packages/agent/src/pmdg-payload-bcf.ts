/**
 * Standalone PMDG 737-800 BCF validation: type MAIN / FWD / AFT **or ZFW** on CDU
 * FS ACTIONS → PAYLOAD via sendPmdgNg3Control. Not career inject.
 *
 * Assumed LSK map (PMDG tutorial + BCF freighter PAYLOAD page):
 *   MENU → R5 (FS ACTIONS) → L2 (PAYLOAD)
 *   On PAYLOAD screen: L1=MAIN, L2=FWD, L3=AFT (labels)
 *   Live BCF MSFS: SDK left-LSK events are +1 vs the screen —
 *   send L2/L3/L4 to hit MAIN/FWD/AFT (L1 event does not commit).
 *   ZFW entry (preferred product path): type display value → R2
 *   Optional R5=SET EMPTY before typing (--empty-first)
 *   Right side: R4=SET MAX, R5=SET EMPTY, R6=SET RANDOM (R2=ZFW)
 *
 * Live findings:
 * - `method=event` can no-op; use `method=control` + parameter=1.
 * - SET EMPTY is R5 (not R2=ZFW).
 * - One control write per key + EventId→0 clear (press+release double-fires digits).
 * - LSK needs long settle before next field or digits merge (1234+567→1234567).
 * - Live BCF: cargo LSKs are SDK L2/L3/L4 for on-screen MAIN/FWD/AFT (L1 no-ops).
 * - Use `--only main|fwd|aft` to validate one field at a time.
 * - Prefer `--zfw 89.3` (CDU display scale) — aircraft fills MAIN/FWD/AFT.
 */

import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';

/** Screenshot sample values — must match aircraft Options units (lb|kg). */
export const BCF_PAYLOAD_DEFAULTS = {
  main: 2797,
  fwd: 332,
  aft: 415,
  units: 'lb' as const,
  /** Inter-key delay (ms). */
  delayMs: 400,
  /** Extra pause after page changes (MENU / FS ACTIONS / PAYLOAD). */
  pageDelayMs: 800,
  /** Settle after SET EMPTY before typing (ms). */
  afterEmptyDelayMs: 2000,
  /** Pause after last digit before field LSK (ms). */
  commitDelayMs: 1200,
  /** Pause after field LSK before CLRs for the next field (ms). */
  afterFieldDelayMs: 2500,
  /** CLR presses before each cargo field (clears INVALID ENTRY + scratchpad). */
  fieldClrCount: 2,
  /** FS ACTIONS → PAYLOAD line (tutorial: FUEL=L1, PAYLOAD≈L2). */
  payloadPageLsk: 'L2',
  /** PAYLOAD page field LSKs (SDK event names — +1 vs on-screen L1/L2/L3 on BCF). */
  mainLsk: 'L2',
  fwdLsk: 'L3',
  aftLsk: 'L4',
  /**
   * SET EMPTY on BCF PAYLOAD (right column): R4=SET MAX, R5=SET EMPTY, R6=SET RANDOM.
   * Never R2 — that is TOCG/ZFW.
   */
  emptyLsk: 'R5',
  /** On-screen ZFW line (right side — not off-by-one like left LSKs). */
  zfwLsk: 'R2',
  method: 'control' as const,
  parameter: 1,
} as const;

/** Example ZFW display after a light unique-digits load (~89.3 × 1000 lb). */
export const BCF_ZFW_DISPLAY_EXAMPLE = '89.3';

export type BcfPayloadUnits = 'lb' | 'kg';
export type BcfPayloadMethod = 'event' | 'control';

export type BcfPayloadOptions = {
  main: number;
  fwd: number;
  aft: number;
  units: BcfPayloadUnits;
  delayMs: number;
  pageDelayMs: number;
  afterEmptyDelayMs: number;
  commitDelayMs: number;
  afterFieldDelayMs: number;
  fieldClrCount: number;
  emptyFirst: boolean;
  /** When set, only type that one cargo field (isolates LSK timing). */
  onlyField?: 'main' | 'fwd' | 'aft';
  /**
   * When set, type this ZFW **display** string (e.g. "89.3") and press zfwLsk.
   * Mutually preferred over MAIN/FWD/AFT when present.
   */
  zfwDisplay?: string;
  payloadPageLsk: string;
  mainLsk: string;
  fwdLsk: string;
  aftLsk: string;
  emptyLsk: string;
  zfwLsk: string;
  method: BcfPayloadMethod;
  parameter: number;
  release: boolean;
};

export type CduKeyStep = {
  label: string;
  key: string;
  pagePause?: boolean;
  /** Override delay after this key (ms). */
  delayAfterMs?: number;
};

function assertNonNegInt(name: string, n: number): number {
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    throw new Error(`${name} must be a non-negative integer (got ${n})`);
  }
  return n;
}

/** CDU ZFW line shows thousands (89.3 ≈ 89300 lb). */
export function zfwLbToDisplay(lb: number): string {
  if (!Number.isFinite(lb) || lb < 0) {
    throw new Error(`zfw lb must be a non-negative number (got ${lb})`);
  }
  return (lb / 1000).toFixed(1);
}

export function parseZfwDisplay(raw: string): string {
  const t = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) {
    throw new Error(
      `--zfw must look like 89.3 or 90 (CDU display scale), got "${raw}"`,
    );
  }
  return t;
}

function digitsToKeys(value: number): CduKeyStep[] {
  const text = String(assertNonNegInt('value', value));
  return [...text].map((ch) => ({ label: ch, key: ch }));
}

/** Scratchpad keys for an integer or decimal display string (e.g. 89.3). */
export function scratchpadToKeys(text: string): CduKeyStep[] {
  const steps: CduKeyStep[] = [];
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') {
      steps.push({ label: ch, key: ch });
    } else if (ch === '.') {
      steps.push({ label: '.', key: 'DOT' });
    } else if (!/\s/.test(ch)) {
      throw new Error(`Unsupported scratchpad char: '${ch}'`);
    }
  }
  if (steps.length === 0) {
    throw new Error('scratchpad text is empty');
  }
  return steps;
}

function pushClr(steps: CduKeyStep[], count: number, reason: string): void {
  const n = Math.max(0, count);
  for (let i = 0; i < n; i++) {
    steps.push({ label: `CLR (${reason} ${i + 1}/${n})`, key: 'CLR' });
  }
}

function pushNavigateToPayload(
  steps: CduKeyStep[],
  opts: BcfPayloadOptions,
): void {
  pushClr(steps, 2, 'start');
  steps.push({ label: 'MENU', key: 'MENU', pagePause: true });
  steps.push({ label: 'R5 (FS ACTIONS)', key: 'R5', pagePause: true });
  steps.push({
    label: `${opts.payloadPageLsk} (PAYLOAD)`,
    key: opts.payloadPageLsk,
    pagePause: true,
  });
  if (opts.emptyFirst) {
    steps.push({
      label: `${opts.emptyLsk} (SET EMPTY)`,
      key: opts.emptyLsk,
      delayAfterMs: opts.afterEmptyDelayMs,
    });
    pushClr(steps, 2, 'after empty');
  }
}

/**
 * Build keystream: navigate to PAYLOAD and enter ZFW display value (R2).
 * Aircraft redistributes MAIN / FWD / AFT.
 */
export function buildBcfZfwKeySequence(opts: BcfPayloadOptions): CduKeyStep[] {
  const zfw = opts.zfwDisplay?.trim();
  if (!zfw) {
    throw new Error('zfwDisplay is required for ZFW keystream');
  }
  const steps: CduKeyStep[] = [];
  pushNavigateToPayload(steps, opts);
  pushClr(steps, opts.fieldClrCount, 'before ZFW');
  const digs = scratchpadToKeys(zfw);
  for (let i = 0; i < digs.length; i++) {
    const d = digs[i]!;
    const isLast = i === digs.length - 1;
    steps.push(isLast ? { ...d, delayAfterMs: opts.commitDelayMs } : d);
  }
  steps.push({
    label: `${opts.zfwLsk} (ZFW=${zfw} ${opts.units} display)`,
    key: opts.zfwLsk,
    delayAfterMs: opts.afterFieldDelayMs,
  });
  return steps;
}

/**
 * Build the full keystream for BCF PAYLOAD cargo fields.
 * Starts from an unknown CDU page: CLR + MENU, then navigate.
 */
export function buildBcfPayloadKeySequence(
  opts: BcfPayloadOptions,
): CduKeyStep[] {
  if (opts.zfwDisplay) {
    return buildBcfZfwKeySequence(opts);
  }

  const steps: CduKeyStep[] = [];
  pushNavigateToPayload(steps, opts);

  const fields: Array<{ name: string; value: number; lsk: string }> = [
    { name: 'MAIN', value: opts.main, lsk: opts.mainLsk },
    { name: 'FWD', value: opts.fwd, lsk: opts.fwdLsk },
    { name: 'AFT', value: opts.aft, lsk: opts.aftLsk },
  ].filter((f) => {
    if (!opts.onlyField) return true;
    return f.name.toLowerCase() === opts.onlyField;
  });

  if (fields.length === 0) {
    throw new Error(`onlyField=${opts.onlyField} matched no cargo fields`);
  }

  for (const field of fields) {
    pushClr(steps, opts.fieldClrCount, `before ${field.name}`);
    const digs = digitsToKeys(field.value);
    for (let i = 0; i < digs.length; i++) {
      const d = digs[i]!;
      const isLast = i === digs.length - 1;
      steps.push(
        isLast ? { ...d, delayAfterMs: opts.commitDelayMs } : d,
      );
    }
    steps.push({
      label: `${field.lsk} (${field.name} CARGO=${field.value} ${opts.units})`,
      key: field.lsk,
      delayAfterMs: opts.afterFieldDelayMs,
    });
  }

  return steps;
}

export function buildMenuSmokeSequence(): CduKeyStep[] {
  return [
    { label: 'CLR', key: 'CLR' },
    { label: 'MENU', key: 'MENU', pagePause: true },
  ];
}

export function formatBcfPayloadPlan(
  opts: BcfPayloadOptions,
  steps: CduKeyStep[],
  mode: 'payload' | 'smoke-menu' | 'zfw' = 'payload',
): string {
  const isZfw = mode === 'zfw' || Boolean(opts.zfwDisplay);
  const lines = [
    mode === 'smoke-menu'
      ? 'PMDG BCF — CDU smoke (MENU only; watch the CDU screen)'
      : isZfw
        ? 'PMDG 737-800 BCF — CDU ZFW validation (aircraft fills MAIN/FWD/AFT)'
        : 'PMDG 737-800 BCF — CDU PAYLOAD validation (not career inject)',
    `  method=${opts.method}  parameter=${opts.parameter}  release=${opts.release}`,
    mode === 'smoke-menu'
      ? '  (no payload typing)'
      : isZfw
        ? `  ZFW display=${opts.zfwDisplay}  units=${opts.units}  lsk=${opts.zfwLsk}`
        : `  MAIN=${opts.main}  FWD=${opts.fwd}  AFT=${opts.aft}  units=${opts.units}${
            opts.onlyField ? `  onlyField=${opts.onlyField}` : ''
          }`,
    `  emptyFirst=${opts.emptyFirst}  delayMs=${opts.delayMs}  pageDelayMs=${opts.pageDelayMs}`,
    `  afterEmptyDelayMs=${opts.afterEmptyDelayMs}  commitDelayMs=${opts.commitDelayMs}  afterFieldDelayMs=${opts.afterFieldDelayMs}  fieldClrCount=${opts.fieldClrCount}`,
    `  emptyLsk=${opts.emptyLsk} (R5=SET EMPTY; R2=ZFW)`,
    mode === 'smoke-menu'
      ? '  nav: CLR → MENU'
      : isZfw
        ? `  nav: MENU → R5 → ${opts.payloadPageLsk}(PAYLOAD) → type ZFW → ${opts.zfwLsk}`
        : `  nav: MENU → R5 → ${opts.payloadPageLsk}(PAYLOAD) → fields ${opts.mainLsk}/${opts.fwdLsk}/${opts.aftLsk}`,
    `  steps (${steps.length}):`,
    ...steps.map((s, i) => `    ${String(i + 1).padStart(3)}. ${s.label}`),
    '',
    'Before run: BCF loaded, CDU powered, parked, do not touch the CDU.',
    isZfw
      ? 'ZFW uses CDU display scale (89.3 ≈ 89300 lb). After run: MAIN/FWD/AFT should auto-fill.'
      : 'Match --units to PMDG Options (lb vs kg). INVALID ENTRY → more CLR/timing or wrong units.',
    'After run: check CDU page; for payload also EFB ZFW/LOAD LEVEL + stations.',
  ];
  return lines.join('\n');
}

export async function sendBcfPayloadKeySequence(
  bridge: NamedPipeSimBridge,
  steps: CduKeyStep[],
  opts: Pick<
    BcfPayloadOptions,
    'delayMs' | 'pageDelayMs' | 'method' | 'parameter' | 'release'
  >,
): Promise<void> {
  let prevKey: string | undefined;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    // Extra settle when the same CDU key repeats (especially digit 0).
    if (prevKey !== undefined && prevKey === step.key) {
      await bridge.delay(Math.max(opts.delayMs, 200));
    }
    const result = await bridge.sendPmdgNg3Control({
      key: step.key,
      release: opts.release,
      method: opts.method,
      parameter: opts.parameter,
    });
    console.log(
      `  [${i + 1}/${steps.length}] ${step.label} → eventId=${result.eventId} method=${result.method ?? opts.method} parameter=0x${Number(result.parameter).toString(16)}`,
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

  // --tiny: small numbers; --unique-digits: no repeated digits (isolates EventId coalesce bugs)
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
    delayMs: num('--delay-ms', BCF_PAYLOAD_DEFAULTS.delayMs),
    pageDelayMs: num('--page-delay-ms', BCF_PAYLOAD_DEFAULTS.pageDelayMs),
    afterEmptyDelayMs: num(
      '--after-empty-ms',
      BCF_PAYLOAD_DEFAULTS.afterEmptyDelayMs,
    ),
    commitDelayMs: num('--commit-delay-ms', BCF_PAYLOAD_DEFAULTS.commitDelayMs),
    afterFieldDelayMs: num(
      '--after-field-ms',
      BCF_PAYLOAD_DEFAULTS.afterFieldDelayMs,
    ),
    fieldClrCount: num('--field-clr', BCF_PAYLOAD_DEFAULTS.fieldClrCount),
    emptyFirst: !has('--no-empty-first'),
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
    dryRun: has('--dry-run'),
    yes: has('--yes'),
    smokeMenu: has('--smoke-menu'),
  };
}
