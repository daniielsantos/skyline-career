/**
 * PMDG NG3 CDU keystream builders (BCF-validated).
 * Pure — no SimBridge. Used by agent CLI probes and runtime pmdg-cdu inject.
 */

export const BCF_PAYLOAD_DEFAULTS = {
  main: 2797,
  fwd: 332,
  aft: 415,
  units: 'lb' as const,
  delayMs: 200,
  pageDelayMs: 400,
  afterEmptyDelayMs: 800,
  commitDelayMs: 500,
  afterFieldDelayMs: 900,
  fieldClrCount: 2,
  payloadPageLsk: 'L2',
  mainLsk: 'L2',
  fwdLsk: 'L3',
  aftLsk: 'L4',
  /** Live BCF PAYLOAD: R3=SET MAX, R4=SET EMPTY, R5=SET RANDOM. */
  emptyLsk: 'R4',
  /**
   * Live BCF PAYLOAD: ZFW commits on R2 (same column as LOAD LEVEL label row
   * sits below ZFW). Do not use R1.
   */
  zfwLsk: 'R2',
  method: 'control' as const,
  parameter: 1,
  cdu: 'right' as const,
  /**
   * Scratchpad flush before MENU. Default: short CLR taps only (one char each).
   * Long-press hold (~3s) can desync live inject — leave at 0 unless debugging.
   * Tap count + inter-tap delay clear multi-char junk without a hold.
   */
  scratchpadClearHoldMs: 0,
  scratchpadClearTaps: 10,
  /** Pause after each short CLR so the delete registers before the next key. */
  scratchpadClearTapDelayMs: 150,
  /** Settle after the last CLR before MENU (ms). */
  scratchpadClearSettleMs: 350,
  /**
   * Skip the initial scratchpad CLR flush before MENU. Career inject sets this
   * when fuel TOTAL already cleared the scratchpad in the same session.
   */
  skipScratchpadClear: false,
} as const;

export const BCF_PAYLOAD_SLOW_TIMING = {
  delayMs: 400,
  pageDelayMs: 800,
  afterEmptyDelayMs: 2000,
  commitDelayMs: 1200,
  afterFieldDelayMs: 2500,
} as const;

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
  onlyField?: 'main' | 'fwd' | 'aft';
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
  cdu: 'left' | 'right';
  /** Long-press CLR at keystream start (ms). 0 = skip hold. */
  scratchpadClearHoldMs: number;
  /** Short CLR taps at start (one char each). */
  scratchpadClearTaps: number;
  /** Delay after each short CLR tap (ms). */
  scratchpadClearTapDelayMs: number;
  /** Settle after the last CLR before MENU (ms). */
  scratchpadClearSettleMs: number;
  /**
   * Skip the initial scratchpad CLR flush before MENU (fuel already flushed).
   */
  skipScratchpadClear?: boolean;
};

export type CduKeyStep = {
  label: string;
  key: string;
  pagePause?: boolean;
  delayAfterMs?: number;
  /** Keep key pressed this long before Host release/clear (CLR long-press). */
  holdMs?: number;
  /** Per-step overrides (CLR long-press uses method=event for a real mouse hold). */
  method?: 'event' | 'control';
  parameter?: number;
  release?: boolean;
};

export const BCF_FUEL_DEFAULTS = {
  units: 'lb' as const,
  delayMs: 200,
  pageDelayMs: 400,
  commitDelayMs: 500,
  afterFieldDelayMs: 900,
  fieldClrCount: 2,
  fuelPageLsk: 'L1',
  totalLsk: 'L1',
  presetFullLsk: 'L3',
  presetTwoThirdsLsk: 'L4',
  presetOneThirdLsk: 'L5',
  method: 'control' as const,
  parameter: 1,
  cdu: 'right' as const,
  /** Long-press CLR at start — default off (see payload defaults). */
  scratchpadClearHoldMs: 0,
  scratchpadClearTaps: 10,
  scratchpadClearTapDelayMs: 150,
  scratchpadClearSettleMs: 350,
} as const;

export const BCF_FUEL_SLOW_TIMING = {
  delayMs: 400,
  pageDelayMs: 800,
  commitDelayMs: 1200,
  afterFieldDelayMs: 2500,
} as const;

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
  totalDisplay?: string;
  preset?: BcfFuelPreset;
  fuelPageLsk: string;
  totalLsk: string;
  presetFullLsk: string;
  presetTwoThirdsLsk: string;
  presetOneThirdLsk: string;
  method: BcfFuelMethod;
  parameter: number;
  release: boolean;
  cdu: 'left' | 'right';
  /** Long-press CLR at keystream start (ms). 0 = skip hold. */
  scratchpadClearHoldMs: number;
  /** Short CLR taps at start (one char each). */
  scratchpadClearTaps: number;
  /** Delay after each short CLR tap (ms). */
  scratchpadClearTapDelayMs: number;
  /** Settle after the last CLR before MENU (ms). */
  scratchpadClearSettleMs: number;
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

/** CDU TOTAL line uses thousands (25.0 ≈ 25000 lb). */
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

export function parseCduSide(raw: string): 'left' | 'right' {
  const t = raw.trim().toLowerCase();
  if (t === 'left' || t === 'l' || t === 'capt' || t === 'captain' || t === '0') {
    return 'left';
  }
  if (t === 'right' || t === 'r' || t === 'fo' || t === '1') {
    return 'right';
  }
  throw new Error(`--cdu must be left|right (got ${raw})`);
}

function digitsToKeys(value: number): CduKeyStep[] {
  const text = String(assertNonNegInt('value', value));
  return [...text].map((ch) => ({ label: ch, key: ch }));
}

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

function pushClr(
  steps: CduKeyStep[],
  count: number,
  reason: string,
  delayAfterMs = 0,
  lastDelayAfterMs?: number,
  /** Scratchpad delete needs TransmitClientEvent click; control area often no-ops CLR. */
  asEventTap = false,
): void {
  const n = Math.max(0, count);
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const d =
      isLast && lastDelayAfterMs !== undefined ? lastDelayAfterMs : delayAfterMs;
    steps.push({
      label: `CLR (${reason} ${i + 1}/${n})`,
      key: 'CLR',
      ...(d > 0 ? { delayAfterMs: d } : {}),
      ...(asEventTap
        ? {
            method: 'event' as const,
            parameter: 0,
            release: true,
            // Brief press so Host sends LEFTSINGLE → delay → LEFTRELEASE.
            holdMs: 80,
          }
        : {}),
    });
  }
}

/**
 * Flush scratchpad before MENU: short CLR taps as real mouse events (not control
 * area). Optional long hold stays event-method for probes.
 */
function pushScratchpadClear(
  steps: CduKeyStep[],
  opts: {
    scratchpadClearHoldMs: number;
    scratchpadClearTaps: number;
    scratchpadClearTapDelayMs: number;
    scratchpadClearSettleMs: number;
  },
  reason: string,
): void {
  const holdMs = Math.max(0, opts.scratchpadClearHoldMs);
  const taps = Math.max(0, opts.scratchpadClearTaps);
  const tapDelay = Math.max(0, opts.scratchpadClearTapDelayMs);
  const settle = Math.max(tapDelay, opts.scratchpadClearSettleMs);

  if (holdMs > 0) {
    steps.push({
      label: `CLR hold ${holdMs}ms event (${reason})`,
      key: 'CLR',
      holdMs,
      method: 'event',
      parameter: 0,
      release: true,
      delayAfterMs: settle,
    });
  }

  if (taps > 0) {
    pushClr(steps, taps, `flush ${reason}`, tapDelay, settle, true);
    return;
  }

  // taps=0 and hold=0 → no scratchpad flush (caller opted out).
}

function pushNavigateToPayload(
  steps: CduKeyStep[],
  opts: BcfPayloadOptions,
): void {
  if (!opts.skipScratchpadClear) {
    pushScratchpadClear(steps, opts, 'start');
  }
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
    pushClr(steps, 2, 'after empty', opts.scratchpadClearTapDelayMs, undefined, true);
  }
}

export function buildBcfZfwKeySequence(opts: BcfPayloadOptions): CduKeyStep[] {
  const zfw = opts.zfwDisplay?.trim();
  if (!zfw) {
    throw new Error('zfwDisplay is required for ZFW keystream');
  }
  const steps: CduKeyStep[] = [];
  pushNavigateToPayload(steps, opts);
  const fieldClr = opts.skipScratchpadClear
    ? 0
    : opts.fieldClrCount;
  if (fieldClr > 0) {
    pushClr(
      steps,
      fieldClr,
      'before ZFW',
      opts.scratchpadClearTapDelayMs,
      undefined,
      true,
    );
  }
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
    pushClr(
      steps,
      opts.fieldClrCount,
      `before ${field.name}`,
      opts.scratchpadClearTapDelayMs,
      undefined,
      true,
    );
    const digs = digitsToKeys(field.value);
    for (let i = 0; i < digs.length; i++) {
      const d = digs[i]!;
      const isLast = i === digs.length - 1;
      steps.push(isLast ? { ...d, delayAfterMs: opts.commitDelayMs } : d);
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

function pushNavigateToFuel(steps: CduKeyStep[], opts: BcfFuelOptions): void {
  pushScratchpadClear(steps, opts, 'start');
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
  pushClr(
    steps,
    opts.fieldClrCount,
    'before TOTAL',
    opts.scratchpadClearTapDelayMs,
    undefined,
    true,
  );
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

/** Inject helpers: ZFW options from display string. */
export function bcfZfwInjectOptions(
  zfwDisplay: string,
  overrides?: { skipScratchpadClear?: boolean },
): BcfPayloadOptions {
  const skip = overrides?.skipScratchpadClear === true;
  return {
    ...BCF_PAYLOAD_DEFAULTS,
    main: 0,
    fwd: 0,
    aft: 0,
    emptyFirst: false,
    release: false,
    zfwDisplay: parseZfwDisplay(zfwDisplay),
    ...(skip
      ? {
          skipScratchpadClear: true,
          scratchpadClearTaps: 0,
          scratchpadClearHoldMs: 0,
          fieldClrCount: 0,
        }
      : {}),
  };
}

/** Inject helpers: fuel TOTAL options from display string. */
export function bcfFuelInjectOptions(totalDisplay: string): BcfFuelOptions {
  return {
    ...BCF_FUEL_DEFAULTS,
    release: false,
    totalDisplay: parseFuelDisplay(totalDisplay),
  };
}

/**
 * PMDG BCF CDU ZFW target: replace live cargo with OFP cargo on the same
 * empty baseline. Crew is usually folded into BEW — do not add crew again.
 *
 * Classic PAYLOAD STATION WEIGHT often ghosts after CDU empty/light ZFW
 * (stations still show tens of klb while CDU ZFW≈OEW). Prefer ZFW residual.
 *
 * When using ZFW−empty residual, subtract crew/galley station weight — classic
 * EMPTY WEIGHT often omits them, so residual otherwise overstates cargo and the
 * typed ZFW ends ~1–2k short of Due.
 */
export function resolvePmdgLiveCargoLb(opts: {
  liveZfwLb: number;
  emptyLb: number;
  stationCargoLb: number;
  /** Crew + service/galley station sum (not Due cargo). */
  fixedNonCargoLb?: number;
}): { liveCargoLb: number; source: 'stations' | 'zfw-residual' | 'zfw-assume-empty' } {
  const station = Math.max(0, opts.stationCargoLb);
  const zfw = opts.liveZfwLb;
  const empty = opts.emptyLb > 20_000 ? opts.emptyLb : 0;
  const fixed = Math.max(0, opts.fixedNonCargoLb ?? 0);

  const residualCargo = (): number => {
    if (!(empty > 0)) return 0;
    return Math.max(0, Math.round(zfw - empty - fixed));
  };

  // Cargo cannot be a huge fraction of ZFW while ZFW sits near OEW — ghost stations.
  if (station > zfw * 0.35) {
    if (empty > 0 && empty <= zfw + 2_000) {
      return {
        liveCargoLb: residualCargo(),
        source: 'zfw-residual',
      };
    }
    return { liveCargoLb: 0, source: 'zfw-assume-empty' };
  }

  if (empty > 0) {
    const implied = residualCargo();
    if (Math.abs(station - implied) > Math.max(1_500, zfw * 0.02)) {
      return { liveCargoLb: implied, source: 'zfw-residual' };
    }
  }
  return { liveCargoLb: station, source: 'stations' };
}

/**
 * Example: live ZFW 115700, live cargo 28325, OFP cargo 29694 → 117069 (117.1).
 * Never returns a ZFW below live when increasing cargo (avoids typing 17.1).
 */
export function computePmdgCduZfwTargetLb(opts: {
  liveZfwLb: number;
  liveCargoLb: number;
  requestedCargoLb: number;
}): number {
  const liveZfw = opts.liveZfwLb;
  const liveCargo = Math.max(0, opts.liveCargoLb);
  const requested = Math.max(0, opts.requestedCargoLb);
  if (!Number.isFinite(liveZfw) || liveZfw < 1000) {
    throw new Error(`live ZFW lb looks invalid (${liveZfw})`);
  }
  let zfw = Math.round(liveZfw - liveCargo + requested);
  // Increasing load must not type below current ZFW (PMDG rejects / no-ops).
  if (requested >= liveCargo) {
    zfw = Math.max(zfw, Math.round(liveZfw + (requested - liveCargo)));
    zfw = Math.max(zfw, Math.round(liveZfw));
  }
  return zfw;
}

/**
 * Dual Class (or any lighter OEW) OFP on a heavier live airframe (BBJ2 VIP)
 * can publish est_zfw below EMPTY WEIGHT — CDU rejects the entry. Floor to
 * empty + Due so inject still applies payload.
 */
export function floorPmdgCduZfwToEmpty(opts: {
  ofpZfwLb: number;
  emptyLb: number;
  requestedCargoLb: number;
  /** lb slack — OFP slightly under empty still counts as mismatch */
  slackLb?: number;
}): { zfwLb: number; floored: boolean } {
  const slack = opts.slackLb ?? 50;
  const empty = opts.emptyLb;
  const ofp = opts.ofpZfwLb;
  if (
    Number.isFinite(empty) &&
    empty > 1000 &&
    Number.isFinite(ofp) &&
    ofp + slack < empty
  ) {
    return {
      zfwLb: Math.round(empty + Math.max(0, opts.requestedCargoLb)),
      floored: true,
    };
  }
  return { zfwLb: Math.round(ofp), floored: false };
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
    `  method=${opts.method}  parameter=${opts.parameter}  release=${opts.release}  cdu=${opts.cdu}`,
    mode === 'smoke-menu'
      ? '  (no payload typing)'
      : isZfw
        ? `  ZFW display=${opts.zfwDisplay}  units=${opts.units}  lsk=${opts.zfwLsk}`
        : `  MAIN=${opts.main}  FWD=${opts.fwd}  AFT=${opts.aft}  units=${opts.units}${
            opts.onlyField ? `  onlyField=${opts.onlyField}` : ''
          }`,
    `  emptyFirst=${opts.emptyFirst}  delayMs=${opts.delayMs}  pageDelayMs=${opts.pageDelayMs}`,
    `  afterEmptyDelayMs=${opts.afterEmptyDelayMs}  commitDelayMs=${opts.commitDelayMs}  afterFieldDelayMs=${opts.afterFieldDelayMs}  fieldClrCount=${opts.fieldClrCount}`,
    `  emptyLsk=${opts.emptyLsk} (R4=SET EMPTY; R2=ZFW)`,
    mode === 'smoke-menu'
      ? '  nav: CLR → MENU'
      : isZfw
        ? `  nav: MENU → R5 → ${opts.payloadPageLsk}(PAYLOAD) → type ZFW → ${opts.zfwLsk}`
        : `  nav: MENU → R5 → ${opts.payloadPageLsk}(PAYLOAD) → fields ${opts.mainLsk}/${opts.fwdLsk}/${opts.aftLsk}`,
    `  steps (${steps.length}):`,
    ...steps.map((s, i) => `    ${String(i + 1).padStart(3)}. ${s.label}`),
    '',
    'Before run: BCF loaded, FO (right) CDU powered if cdu=right, parked, do not touch the CDU.',
    isZfw
      ? 'ZFW uses CDU display scale (89.3 ≈ 89300 lb). After run: MAIN/FWD/AFT should auto-fill.'
      : 'Match --units to PMDG Options (lb vs kg). INVALID ENTRY → more CLR/timing or wrong units.',
    'After run: check CDU page; for payload also EFB ZFW/LOAD LEVEL + stations.',
  ];
  return lines.join('\n');
}

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
