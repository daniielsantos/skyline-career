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
  groundSpeedKt?: number;
  bankDeg?: number;
  pitchDeg?: number;
  gForce?: number;
  indicatedAirspeedKt?: number;
  altitudeFt?: number;
  overspeedWarning?: boolean;
  stallWarning?: boolean;
  gearDown?: boolean;
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
  /** Previous onGround after we started tracking post-touchdown bounce. */
  lastOnGroundPostTd?: boolean;
  landing?: {
    vsFpm: number;
    gForce?: number;
    iasKt?: number;
    gearDown?: boolean;
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
  if (sample.onGround && typeof gs === 'number' && Number.isFinite(gs)) {
    if (!sample.sawAirborne) {
      next.maxDepTaxiGsKt = Math.max(next.maxDepTaxiGsKt, gs);
    } else if (sample.postTouchdown) {
      next.maxArrTaxiGsKt = Math.max(next.maxArrTaxiGsKt, gs);
    }
  }

  // Bounce: wheels leave then touch again after first landing.
  if (sample.postTouchdown) {
    if (
      next.lastOnGroundPostTd === true &&
      sample.onGround === false
    ) {
      /* airborne bounce arc — wait for next ground */
    }
    if (
      next.lastOnGroundPostTd === false &&
      sample.onGround === true
    ) {
      next = { ...next, bounceCount: next.bounceCount + 1 };
    }
    next = { ...next, lastOnGroundPostTd: sample.onGround };
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
        flapsPct: sample.flapsPct,
      },
    };
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
  const landingVs =
    acc.landing?.vsFpm ??
    (typeof opts?.landingVsFpm === 'number' && Number.isFinite(opts.landingVsFpm)
      ? opts.landingVsFpm
      : undefined);

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

  const gearDown = acc.landing?.gearDown === true;
  landing.push(
    binaryMetric(
      'landing_gear',
      'Landing gear down',
      'landing',
      Boolean(acc.landing) && gearDown,
      1,
      acc.landing ? (gearDown ? 'down' : 'up / unknown') : 'not captured',
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
