/**
 * Career flight score (OnAir-inspired MVP).
 * Envelope + taxi + landing from Watch telemetry peaks / touchdown snapshot.
 */

export type FlightScoreCategoryId = 'envelope' | 'taxi' | 'landing';

export type FlightScoreMetric = {
  id: string;
  label: string;
  category: FlightScoreCategoryId;
  points: number;
  maxPoints: number;
  /** Human detail, e.g. "−182 fpm" or "max 28°". */
  detail?: string;
};

export type FlightScoreCategory = {
  id: FlightScoreCategoryId;
  label: string;
  earned: number;
  max: number;
  metrics: FlightScoreMetric[];
};

export type FlightScoreSnapshot = {
  earned: number;
  max: number;
  /** 0–100 */
  pct: number;
  categories: FlightScoreCategory[];
};

/** Live sample fields used to accumulate score (all optional). */
export type FlightScoreSample = {
  onGround: boolean;
  /** True once this watch session has seen wheels-up. */
  sawAirborne: boolean;
  /** True after first touchdown following airborne. */
  postTouchdown: boolean;
  /**
   * Optional Watch phase — used so takeoff / landing roll GS is not scored as
   * taxi speeding.
   */
  phase?: string;
  groundSpeedKt?: number;
  bankDeg?: number;
  pitchDeg?: number;
  gForce?: number;
  indicatedAirspeedKt?: number;
  altitudeFt?: number;
  /** Radio / AGL height (ft) — used when SIM ON GROUND stays sticky on a bounce. */
  aglFt?: number;
  overspeedWarning?: boolean;
  stallWarning?: boolean;
  gearDown?: boolean;
  /** False for fixed-gear airframes (Kodiak, C172, …). */
  gearRetractable?: boolean;
  flapsPct?: number;
  /** Touchdown vertical speed (fpm); typically negative. */
  landingVsFpm?: number;
};

export type FlightScoreAccumulator = {
  maxAbsBankDeg: number;
  maxAbsPitchDeg: number;
  maxG: number;
  minG: number;
  maxIasBelow10kKt: number;
  sawOverspeed: boolean;
  sawStall: boolean;
  /** Max ground speed while taxiing before first airborne. */
  maxDepTaxiGsKt: number;
  /** Max ground speed on ground after first touchdown. */
  maxArrTaxiGsKt: number;
  bounceCount: number;
  /**
   * Previous *effective* on-ground after first landing.
   * Effective = SIM ON GROUND and AGL not lifted above the touchdown baseline.
   */
  lastOnGroundPostTd?: boolean;
  /** AGL (ft) latched on first grounded post-touchdown sample. */
  touchdownAglFt?: number;
  landing?: {
    vsFpm: number;
    gForce?: number;
    iasKt?: number;
    gearDown?: boolean;
    gearRetractable?: boolean;
    flapsPct?: number;
  };
};

export const FLIGHT_SCORE_LIMITS = {
  bankDeg: 35,
  pitchDeg: 25,
  minG: -0.5,
  maxG: 2.5,
  iasBelow10kKt: 250,
  taxiGsKt: 40,
} as const;

/**
 * AGL rise (ft) above the touchdown baseline that counts as wheels-off.
 * SIM ON GROUND often stays true on light bounces; radio alt still jumps.
 * Keep this tight — PLANE ALT ABOVE GROUND already sits several feet at rest.
 */
export const BOUNCE_LIFT_AGL_DELTA_FT = 2.5;

/**
 * True when the aircraft is settled on the gear for bounce tracking.
 * `SIM ON GROUND === false` always means airborne. When it stays sticky-true,
 * an AGL rise above the touchdown baseline still counts as a bounce arc.
 */
export function isEffectivelyOnGroundForBounce(
  onGround: boolean,
  aglFt: number | undefined,
  touchdownAglFt: number | undefined,
): boolean {
  // Explicit airborne from the sim — always treat as off the gear.
  if (!onGround) return false;
  if (
    typeof aglFt === 'number' &&
    Number.isFinite(aglFt) &&
    typeof touchdownAglFt === 'number' &&
    Number.isFinite(touchdownAglFt) &&
    aglFt >= touchdownAglFt + BOUNCE_LIFT_AGL_DELTA_FT
  ) {
    return false;
  }
  return true;
}

function isTaxiPhaseForScore(phase: string | undefined): boolean {
  return (
    phase === 'taxi_out' ||
    phase === 'taxi_in' ||
    phase === 'taxi' ||
    phase === 'ground' ||
    phase === 'ground+engines'
  );
}

export function createFlightScoreAccumulator(): FlightScoreAccumulator {
  return {
    maxAbsBankDeg: 0,
    maxAbsPitchDeg: 0,
    maxG: 1,
    minG: 1,
    maxIasBelow10kKt: 0,
    sawOverspeed: false,
    sawStall: false,
    maxDepTaxiGsKt: 0,
    maxArrTaxiGsKt: 0,
    bounceCount: 0,
  };
}

/**
 * Drop a premature landing snapshot (takeoff bounce / go-around) so the next
 * real touchdown can stamp VS / gear / flaps / G again.
 */
export function clearFlightScoreLanding(
  state: FlightScoreAccumulator,
): FlightScoreAccumulator {
  const {
    landing: _landing,
    lastOnGroundPostTd: _og,
    touchdownAglFt: _agl,
    ...rest
  } = state;
  return {
    ...rest,
    bounceCount: 0,
  };
}

/** Patch touchdown VS on an existing landing snapshot (settle override). */
export function patchFlightScoreLandingVs(
  state: FlightScoreAccumulator,
  vsFpm: number,
): FlightScoreAccumulator {
  if (!state.landing || !Number.isFinite(vsFpm)) return state;
  return {
    ...state,
    landing: { ...state.landing, vsFpm },
  };
}

function maxNum(a: number, b: number | undefined): number {
  if (typeof b !== 'number' || !Number.isFinite(b)) return a;
  return Math.max(a, b);
}

function minNum(a: number, b: number | undefined): number {
  if (typeof b !== 'number' || !Number.isFinite(b)) return a;
  return Math.min(a, b);
}

/**
 * Fold one telemetry sample into the accumulator (pure).
 * Call once per Watch tick; stamp landing fields on the touchdown sample.
 */
export function pushFlightScoreSample(
  state: FlightScoreAccumulator,
  sample: FlightScoreSample,
): FlightScoreAccumulator {
  let next: FlightScoreAccumulator = { ...state };

  if (typeof sample.bankDeg === 'number' && Number.isFinite(sample.bankDeg)) {
    next.maxAbsBankDeg = Math.max(next.maxAbsBankDeg, Math.abs(sample.bankDeg));
  }
  if (typeof sample.pitchDeg === 'number' && Number.isFinite(sample.pitchDeg)) {
    next.maxAbsPitchDeg = Math.max(
      next.maxAbsPitchDeg,
      Math.abs(sample.pitchDeg),
    );
  }
  if (typeof sample.gForce === 'number' && Number.isFinite(sample.gForce)) {
    next.maxG = maxNum(next.maxG, sample.gForce);
    next.minG = minNum(next.minG, sample.gForce);
  }
  if (
    typeof sample.indicatedAirspeedKt === 'number' &&
    Number.isFinite(sample.indicatedAirspeedKt) &&
    typeof sample.altitudeFt === 'number' &&
    sample.altitudeFt < 10_000
  ) {
    next.maxIasBelow10kKt = Math.max(
      next.maxIasBelow10kKt,
      sample.indicatedAirspeedKt,
    );
  }
  if (sample.overspeedWarning) next.sawOverspeed = true;
  if (sample.stallWarning) next.sawStall = true;

  const gs = sample.groundSpeedKt;
  // Taxi speeding only — ignore takeoff / landing roll (phase or high GS).
  if (
    sample.onGround &&
    typeof gs === 'number' &&
    Number.isFinite(gs) &&
    (sample.phase == null || isTaxiPhaseForScore(sample.phase)) &&
    (sample.phase != null || gs <= FLIGHT_SCORE_LIMITS.taxiGsKt + 8)
  ) {
    if (!sample.sawAirborne) {
      next.maxDepTaxiGsKt = Math.max(next.maxDepTaxiGsKt, gs);
    } else if (sample.postTouchdown) {
      next.maxArrTaxiGsKt = Math.max(next.maxArrTaxiGsKt, gs);
    }
  }

  // Bounce: wheels leave then touch again after first landing.
  // Prefer SIM ON GROUND edges; also treat AGL rise above the TD baseline as
  // airborne because MSFS often keeps SIM ON GROUND sticky on light bounces.
  // Keep tracking whenever we already stamped a landing (or postTouchdown), so a
  // brief go-around-clear flicker cannot drop bounce arcs.
  const trackBounce =
    sample.postTouchdown || Boolean(next.landing) || next.bounceCount > 0;
  if (trackBounce) {
    let baseline = next.touchdownAglFt;
    if (
      baseline === undefined &&
      sample.onGround &&
      typeof sample.aglFt === 'number' &&
      Number.isFinite(sample.aglFt)
    ) {
      baseline = sample.aglFt;
      next = { ...next, touchdownAglFt: baseline };
    }

    const effOnGround = isEffectivelyOnGroundForBounce(
      sample.onGround,
      sample.aglFt,
      baseline,
    );

    if (next.lastOnGroundPostTd === false && effOnGround) {
      next = { ...next, bounceCount: next.bounceCount + 1 };
    }
    next = { ...next, lastOnGroundPostTd: effOnGround };
  }

  // Capture landing snapshot once (first touchdown with VS).
  if (
    !next.landing &&
    sample.postTouchdown &&
    typeof sample.landingVsFpm === 'number' &&
    Number.isFinite(sample.landingVsFpm)
  ) {
    next = {
      ...next,
      landing: {
        vsFpm: sample.landingVsFpm,
        gForce: sample.gForce,
        iasKt: sample.indicatedAirspeedKt,
        gearDown: sample.gearDown,
        gearRetractable: sample.gearRetractable,
        flapsPct: sample.flapsPct,
      },
    };
  } else if (next.landing && sample.postTouchdown) {
    let landing = next.landing;
    // Peak G over the first-contact / bounce window (first sample is often ~1.0).
    if (
      typeof sample.gForce === 'number' &&
      Number.isFinite(sample.gForce)
    ) {
      const prevG = landing.gForce;
      if (
        typeof prevG !== 'number' ||
        !Number.isFinite(prevG) ||
        sample.gForce > prevG
      ) {
        landing = { ...landing, gForce: sample.gForce };
      }
    }
    // First touchdown tick often misses SimVars — backfill gear/flaps when they
    // arrive on later post-touchdown samples (do not overwrite a firm "up").
    if (
      landing.gearDown !== true &&
      sample.gearDown === true
    ) {
      landing = { ...landing, gearDown: true };
    }
    if (
      landing.gearRetractable === undefined &&
      typeof sample.gearRetractable === 'boolean'
    ) {
      landing = { ...landing, gearRetractable: sample.gearRetractable };
    }
    if (
      (typeof landing.flapsPct !== 'number' ||
        !Number.isFinite(landing.flapsPct) ||
        landing.flapsPct <= 5) &&
      typeof sample.flapsPct === 'number' &&
      Number.isFinite(sample.flapsPct) &&
      sample.flapsPct > 5
    ) {
      landing = { ...landing, flapsPct: sample.flapsPct };
    }
    if (landing !== next.landing) {
      next = { ...next, landing };
    }
  }

  return next;
}

/** Graded landing VS points (abs fpm). Soft landings score higher. */
export function scoreLandingVsPoints(vsFpm: number, maxPoints = 12): number {
  const abs = Math.abs(vsFpm);
  if (abs <= 200) return maxPoints;
  if (abs <= 250) return Math.round(maxPoints * 0.85);
  if (abs <= 350) return Math.round(maxPoints * 0.65);
  if (abs <= 450) return Math.round(maxPoints * 0.4);
  if (abs <= 600) return Math.round(maxPoints * 0.2);
  return 0;
}

/** Graded touchdown G — ideal near 1.0. */
export function scoreLandingGPoints(gForce: number, maxPoints = 10): number {
  const delta = Math.abs(gForce - 1);
  if (delta <= 0.25) return maxPoints;
  if (delta <= 0.4) return Math.round(maxPoints * 0.8);
  if (delta <= 0.6) return Math.round(maxPoints * 0.5);
  if (delta <= 0.9) return Math.round(maxPoints * 0.25);
  return 0;
}

function binaryMetric(
  id: string,
  label: string,
  category: FlightScoreCategoryId,
  ok: boolean,
  maxPoints: number,
  detail?: string,
): FlightScoreMetric {
  return {
    id,
    label,
    category,
    points: ok ? maxPoints : 0,
    maxPoints,
    detail,
  };
}

function sumMetrics(metrics: FlightScoreMetric[]): {
  earned: number;
  max: number;
} {
  let earned = 0;
  let max = 0;
  for (const m of metrics) {
    earned += m.points;
    max += m.maxPoints;
  }
  return { earned, max };
}

/**
 * Finalize accumulator into a debrief scorecard.
 * Landing metrics require a touchdown snapshot; otherwise landing max is still
 * counted as available points (earned 0) so the card stays honest.
 */
export function finalizeFlightScore(
  acc: FlightScoreAccumulator,
  opts?: { landingVsFpm?: number | null },
): FlightScoreSnapshot {
  // Explicit settle/override VS wins over a stale accumulator stamp (e.g. after
  // TOUCHDOWN NORMAL VELOCITY is read, or a takeoff-bounce sample was cleared).
  const landingVs =
    typeof opts?.landingVsFpm === 'number' && Number.isFinite(opts.landingVsFpm)
      ? opts.landingVsFpm
      : acc.landing?.vsFpm;

  const envelope: FlightScoreMetric[] = [
    binaryMetric(
      'bank',
      'Max bank',
      'envelope',
      acc.maxAbsBankDeg <= FLIGHT_SCORE_LIMITS.bankDeg,
      4,
      `max ${acc.maxAbsBankDeg.toFixed(0)}° · limit ±${FLIGHT_SCORE_LIMITS.bankDeg}°`,
    ),
    binaryMetric(
      'pitch',
      'Max pitch',
      'envelope',
      acc.maxAbsPitchDeg <= FLIGHT_SCORE_LIMITS.pitchDeg,
      4,
      `max ${acc.maxAbsPitchDeg.toFixed(0)}° · limit ±${FLIGHT_SCORE_LIMITS.pitchDeg}°`,
    ),
    binaryMetric(
      'g_force',
      'G envelope',
      'envelope',
      acc.minG >= FLIGHT_SCORE_LIMITS.minG &&
        acc.maxG <= FLIGHT_SCORE_LIMITS.maxG,
      4,
      `${acc.minG.toFixed(2)} … ${acc.maxG.toFixed(2)} G`,
    ),
    binaryMetric(
      'ias_10k',
      'IAS under 10,000 ft',
      'envelope',
      acc.maxIasBelow10kKt <= FLIGHT_SCORE_LIMITS.iasBelow10kKt,
      4,
      acc.maxIasBelow10kKt > 0
        ? `max ${acc.maxIasBelow10kKt.toFixed(0)} kt · limit ${FLIGHT_SCORE_LIMITS.iasBelow10kKt}`
        : 'no sample',
    ),
    binaryMetric(
      'overspeed',
      'No overspeed',
      'envelope',
      !acc.sawOverspeed,
      6,
      acc.sawOverspeed ? 'warning fired' : 'clean',
    ),
    binaryMetric(
      'stall',
      'No stall',
      'envelope',
      !acc.sawStall,
      6,
      acc.sawStall ? 'warning fired' : 'clean',
    ),
  ];

  const taxi: FlightScoreMetric[] = [
    binaryMetric(
      'dep_taxi',
      'Departure taxi < 40 kt',
      'taxi',
      acc.maxDepTaxiGsKt <= FLIGHT_SCORE_LIMITS.taxiGsKt,
      1,
      `max ${acc.maxDepTaxiGsKt.toFixed(0)} kt`,
    ),
    binaryMetric(
      'arr_taxi',
      'Arrival taxi < 40 kt',
      'taxi',
      acc.maxArrTaxiGsKt <= FLIGHT_SCORE_LIMITS.taxiGsKt,
      1,
      `max ${acc.maxArrTaxiGsKt.toFixed(0)} kt`,
    ),
  ];

  const landing: FlightScoreMetric[] = [];
  const vsMax = 12;
  if (landingVs !== undefined) {
    const pts = scoreLandingVsPoints(landingVs, vsMax);
    landing.push({
      id: 'landing_vs',
      label: 'Vertical speed',
      category: 'landing',
      points: pts,
      maxPoints: vsMax,
      detail: `${landingVs > 0 ? '+' : ''}${Math.round(landingVs)} fpm`,
    });
  } else {
    landing.push({
      id: 'landing_vs',
      label: 'Vertical speed',
      category: 'landing',
      points: 0,
      maxPoints: vsMax,
      detail: 'not captured',
    });
  }

  const gMax = 10;
  const gAtTd = acc.landing?.gForce;
  if (typeof gAtTd === 'number' && Number.isFinite(gAtTd)) {
    const pts = scoreLandingGPoints(gAtTd, gMax);
    landing.push({
      id: 'landing_g',
      label: 'Touchdown G',
      category: 'landing',
      points: pts,
      maxPoints: gMax,
      detail: `${gAtTd.toFixed(2)} G`,
    });
  } else {
    landing.push({
      id: 'landing_g',
      label: 'Touchdown G',
      category: 'landing',
      points: 0,
      maxPoints: gMax,
      detail: 'not captured',
    });
  }

  landing.push(
    binaryMetric(
      'landing_bounces',
      'Bounces ≤ 1',
      'landing',
      acc.bounceCount <= 1,
      2,
      `${acc.bounceCount} bounce${acc.bounceCount === 1 ? '' : 's'}`,
    ),
  );

  const gearRetractable = acc.landing?.gearRetractable === true;
  // Only fail when we positively saw gear up. Missing SimVar at the first
  // touchdown tick used to score as "up / unknown" on every retractable type.
  const gearState = acc.landing?.gearDown;
  const gearOk =
    Boolean(acc.landing) && (!gearRetractable || gearState !== false);
  landing.push(
    binaryMetric(
      'landing_gear',
      'Landing gear down',
      'landing',
      gearOk,
      1,
      acc.landing
        ? !gearRetractable
          ? acc.landing.gearRetractable === false
            ? 'fixed gear'
            : 'n/a'
          : gearState === true
            ? 'down'
            : gearState === false
              ? 'up'
              : 'unknown'
        : 'not captured',
    ),
  );

  const flapsPct = acc.landing?.flapsPct;
  const flapsOk =
    typeof flapsPct === 'number' && Number.isFinite(flapsPct) && flapsPct > 5;
  landing.push(
    binaryMetric(
      'landing_flaps',
      'Flaps at touchdown',
      'landing',
      Boolean(acc.landing) && flapsOk,
      1,
      typeof flapsPct === 'number' ? `${flapsPct.toFixed(0)}%` : 'not captured',
    ),
  );

  const categories: FlightScoreCategory[] = [
    {
      id: 'envelope',
      label: 'Entire flight',
      ...sumMetrics(envelope),
      metrics: envelope,
    },
    {
      id: 'taxi',
      label: 'Taxi',
      ...sumMetrics(taxi),
      metrics: taxi,
    },
    {
      id: 'landing',
      label: 'Landing',
      ...sumMetrics(landing),
      metrics: landing,
    },
  ];

  let earned = 0;
  let max = 0;
  for (const c of categories) {
    earned += c.earned;
    max += c.max;
  }
  const pct = max > 0 ? Math.round((earned / max) * 1000) / 10 : 0;

  return { earned, max, pct, categories };
}
