/**
 * PMDG 777 CDU keystream builders (77X / ROTOR_BRAKE).
 * Pure — no SimBridge. Kept separate from NG3/737 BCF so timing and LSKs
 * can change without touching the 737 path.
 */
import {
  BCF_FUEL_DEFAULTS,
  BCF_PAYLOAD_DEFAULTS,
  buildBcfFuelKeySequence,
  buildBcfZfwKeySequence,
  parseFuelDisplay,
  parseZfwDisplay,
  type BcfFuelOptions,
  type BcfPayloadOptions,
  type CduKeyStep,
} from './pmdg-ng3-cdu-keystream.js';

/**
 * PMDG 777 MENU → R6 FS ACTIONS → L2 PAYLOAD.
 * MSFS opens PAX 2/3 often — PREV → SUMMARY 1/3. ZFW at R2 (tutorial).
 * FO CDU (right) — same side the pilot usually watches during inject.
 * SET EMPTY (R5) before typing so the field accepts a full ZFW replace.
 * Leading fast CLR taps flush the scratchpad; no CLR mid-entry (rotor races digits).
 */
export const PMDG_777_PAYLOAD_DEFAULTS = {
  ...BCF_PAYLOAD_DEFAULTS,
  fsActionsLsk: 'R6',
  zfwLsk: 'R2',
  emptyLsk: 'R5',
  emptyFirst: true,
  /** Skip NG3-style CLR after SET EMPTY (see pushNavigateToPayload). */
  emptyClrCount: 0,
  cdu: 'right' as const,
  method: 'rotor' as const,
  parameter: 0,
  release: false,
  /** Slightly faster than the first working pass; keep headroom for rotor. */
  pageDelayMs: 1100,
  delayMs: 700,
  commitDelayMs: 1400,
  afterEmptyDelayMs: 2000,
  afterFieldDelayMs: 2000,
  /** Flush scratchpad before MENU — short, fast taps. */
  scratchpadClearTaps: 8,
  scratchpadClearHoldMs: 0,
  scratchpadClearTapDelayMs: 70,
  scratchpadClearSettleMs: 250,
  fieldClrCount: 0,
} as const;

export const PMDG_777_FUEL_DEFAULTS = {
  ...BCF_FUEL_DEFAULTS,
  fsActionsLsk: 'R6',
  cdu: 'right' as const,
  method: 'rotor' as const,
  parameter: 0,
  release: false,
  pageDelayMs: 1100,
  delayMs: 700,
  commitDelayMs: 1400,
  afterFieldDelayMs: 2000,
  scratchpadClearTaps: 8,
  scratchpadClearHoldMs: 0,
  scratchpadClearTapDelayMs: 70,
  scratchpadClearSettleMs: 250,
  fieldClrCount: 0,
} as const;

/**
 * PMDG 777 FUEL page shows TOTAL LBS as whole pounds (e.g. 15139), not BCF thousands.
 */
export function fuelLbToDisplay777(lb: number): string {
  if (!Number.isFinite(lb) || lb < 0) {
    throw new Error(`fuel lb must be a non-negative number (got ${lb})`);
  }
  return String(Math.round(lb));
}

/**
 * 777 L2 PAYLOAD often lands on PAX 2/3. PREV → SUMMARY 1/3, then
 * R5 SET EMPTY + ZFW at R2. Leading CLR flush only — never mid-digit.
 */
export function buildPmdg777ZfwKeySequence(opts: BcfPayloadOptions): CduKeyStep[] {
  const steps = buildBcfZfwKeySequence({
    ...opts,
    fieldClrCount: 0,
    emptyClrCount: opts.emptyClrCount ?? 0,
  });
  // Keep leading scratchpad CLR; drop any mid-stream CLR (empty/field).
  const menuIdx = steps.findIndex((s) => s.key === 'MENU');
  const kept = steps.filter(
    (s, i) => s.key !== 'CLR' || (menuIdx >= 0 && i < menuIdx),
  );
  const payloadIdx = kept.findIndex(
    (s) => s.key === opts.payloadPageLsk && s.pagePause === true,
  );
  if (payloadIdx >= 0) {
    kept.splice(payloadIdx + 1, 0, {
      label: 'PREV (PAYLOAD SUMMARY 1/3 for ZFW)',
      key: 'PREV',
      pagePause: true,
      delayAfterMs: Math.max(opts.pageDelayMs, 1400),
    });
  }
  const digitGap = Math.max(opts.delayMs, 700);
  for (const step of kept) {
    if (/^[0-9]$/.test(step.key) || step.key === 'DOT') {
      step.delayAfterMs = Math.max(step.delayAfterMs ?? 0, digitGap);
    }
  }
  const commit = kept.find(
    (s) => s.key === opts.zfwLsk && (s.label?.includes('ZFW') ?? false),
  );
  if (commit) {
    commit.delayAfterMs = Math.max(commit.delayAfterMs ?? 0, opts.afterFieldDelayMs);
  }
  return kept;
}

/**
 * 777 fuel: R6 + rotor, leading CLR flush, paced digits (no CLR before TOTAL).
 */
export function buildPmdg777FuelKeySequence(opts: BcfFuelOptions): CduKeyStep[] {
  const steps = buildBcfFuelKeySequence({
    ...opts,
    fieldClrCount: 0,
  });
  const menuIdx = steps.findIndex((s) => s.key === 'MENU');
  const kept = steps.filter(
    (s, i) => s.key !== 'CLR' || (menuIdx >= 0 && i < menuIdx),
  );
  const digitGap = Math.max(opts.delayMs, 700);
  for (const step of kept) {
    if (/^[0-9]$/.test(step.key) || step.key === 'DOT') {
      step.delayAfterMs = Math.max(step.delayAfterMs ?? 0, digitGap);
    }
  }
  const commit = kept.find(
    (s) => s.key === opts.totalLsk && (s.label?.includes('TOTAL') ?? false),
  );
  if (commit) {
    commit.delayAfterMs = Math.max(
      commit.delayAfterMs ?? 0,
      opts.afterFieldDelayMs,
    );
  }
  return kept;
}

/** PMDG 777-200ER/PAX: MENU → R6 FS ACTIONS → L2 PAYLOAD → ZFW (77X CDU events). */
export function bcf777ZfwInjectOptions(
  zfwDisplay: string,
  overrides?: { skipScratchpadClear?: boolean },
): BcfPayloadOptions {
  const skip = overrides?.skipScratchpadClear === true;
  return {
    ...PMDG_777_PAYLOAD_DEFAULTS,
    main: 0,
    fwd: 0,
    aft: 0,
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

/** PMDG 777 fuel TOTAL via MENU → R6 FS ACTIONS → L1 FUEL (whole lb display). */
export function bcf777FuelInjectOptions(totalDisplay: string): BcfFuelOptions {
  return {
    ...PMDG_777_FUEL_DEFAULTS,
    totalDisplay: parseFuelDisplay(totalDisplay),
  };
}
