/**
 * MSFS CG SimVars / flight_model.cfg use "Percent over 100"
 * (0.11 = 11% MAC). Normalize to percentage points for comparisons.
 */
export function normalizeMacPercent(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Math.abs(value) <= 1.5 ? value * 100 : value;
}

/**
 * Same scale as CG: SimConnect "Percent over 100" (0.0–1.0) → 0–100 points.
 * Values already in 0–100 (or beyond ±1.5) pass through unchanged.
 */
export function normalizeSimPercent(value: number): number {
  return normalizeMacPercent(value);
}

export type CgEnvelopeSource =
  | 'manual'
  | 'simvar'
  | 'cfg'
  | 'live-sweep'
  | 'calibrated-live';

export type CgMacRange = {
  minMac?: number;
  maxMac?: number;
};

/** Prefer tablet/POH manual, then live SimVar limits, then cfg, then stored profile. */
export function resolveCgEnvelope(sources: {
  manual?: CgMacRange;
  simvar?: CgMacRange;
  cfg?: CgMacRange;
  profile?: CgMacRange;
  fallbackSource?: Exclude<CgEnvelopeSource, 'manual' | 'simvar' | 'cfg'>;
}): CgMacRange & { source: CgEnvelopeSource } {
  const pick = (
    range: CgMacRange | undefined,
    source: CgEnvelopeSource,
  ): (CgMacRange & { source: CgEnvelopeSource }) | undefined => {
    if (range?.minMac === undefined || range.maxMac === undefined) return undefined;
    let minMac = range.minMac;
    let maxMac = range.maxMac;
    if (minMac > maxMac) [minMac, maxMac] = [maxMac, minMac];
    return { minMac, maxMac, source };
  };

  return (
    pick(sources.manual, 'manual') ??
    pick(sources.simvar, 'simvar') ??
    pick(sources.cfg, 'cfg') ??
    pick(sources.profile, sources.fallbackSource ?? 'calibrated-live') ?? {
      minMac: sources.profile?.minMac ?? sources.cfg?.minMac ?? sources.simvar?.minMac,
      maxMac: sources.profile?.maxMac ?? sources.cfg?.maxMac ?? sources.simvar?.maxMac,
      source: sources.fallbackSource ?? 'calibrated-live',
    }
  );
}
