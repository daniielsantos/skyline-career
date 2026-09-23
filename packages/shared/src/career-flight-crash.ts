/**
 * Conservative in-flight impact detection for Career Watch.
 * No MSFS Crashed events — telemetry only. High confidence → auto-fail.
 */

export type CrashSample = {
  atMs: number;
  onGround: boolean;
  sawAirborne: boolean;
  groundSpeedKt?: number;
  verticalSpeedFpm?: number;
  aglFt?: number;
  gForce?: number;
  enginesRunning?: boolean;
  /** Pause / slew / menu — ignore episode. */
  frozen?: boolean;
  lat?: number;
  lon?: number;
};

export type CrashDetectContext = {
  /** True when within settle radius of mission destination. */
  nearDest: boolean;
  /** SimConnect / pipe healthy this tick. */
  simAlive: boolean;
};

export type CrashDetectState = {
  /** Spike window open (candidate impact). */
  episodeAtMs: number | null;
  peakG: number;
  peakAbsVs: number;
  deadTicks: number;
  /** Latched spike reasons this episode. */
  spikeBits: number;
  lastLat: number | null;
  lastLon: number | null;
  lastAgl: number | null;
  lastGs: number | null;
  lastAtMs: number | null;
  /** After a high verdict, stay quiet. */
  fired: boolean;
  /** Risk-envelope poll boost until this wall time. */
  boostUntilMs: number;
};

export type CrashVerdict = {
  confidence: 'high';
  reasonBits: string[];
  peakG: number;
  peakAbsVs: number;
  message: string;
};

export type CrashDetectStep = {
  state: CrashDetectState;
  verdict: CrashVerdict | null;
  /** Tighten Watch poll while true. */
  boostPoll: boolean;
};

/** Bit flags for spike candidates. */
export const CRASH_SPIKE_G = 1;
export const CRASH_SPIKE_VS = 2;
export const CRASH_SPIKE_AGL = 4;
export const CRASH_SPIKE_GS = 8;

/** G load factor peak — hard land ~1.5–2.5; crash much higher. */
export const CRASH_G_SPIKE = 4.5;
/** Sustained dive / impact VS (fpm absolute). */
export const CRASH_VS_SPIKE_FPM = 4500;
/** Prior AGL must be above this to count an AGL slam. */
export const CRASH_AGL_HIGH_FT = 200;
/** AGL after slam. */
export const CRASH_AGL_LOW_FT = 20;
/** GS after slam (kt). */
export const CRASH_GS_DEAD_KT = 8;
/** Prior GS to count GS collapse. */
export const CRASH_GS_FAST_KT = 60;
/** Dead / stopped ticks required after spike. */
export const CRASH_DEAD_TICKS = 3;
/** Episode window (ms). */
export const CRASH_EPISODE_MS = 12_000;
/** Slew-like jump (degrees) — ignore. ~0.05° ≈ 3 nm. */
export const CRASH_SLEW_DEG = 0.08;
/** Poll boost when AGL below this (ft). */
export const CRASH_BOOST_AGL_FT = 2500;
/** Poll boost when |VS| above this (fpm). */
export const CRASH_BOOST_VS_FPM = 2500;
/** Poll boost when |G−1| above this. */
export const CRASH_BOOST_G_DELTA = 1.5;
/** How long to keep boosted polling after trigger (ms). */
export const CRASH_BOOST_HOLD_MS = 15_000;

export function emptyCrashDetectState(): CrashDetectState {
  return {
    episodeAtMs: null,
    peakG: 1,
    peakAbsVs: 0,
    deadTicks: 0,
    spikeBits: 0,
    lastLat: null,
    lastLon: null,
    lastAgl: null,
    lastGs: null,
    lastAtMs: null,
    fired: false,
    boostUntilMs: 0,
  };
}

function finite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function absVs(sample: CrashSample): number {
  return finite(sample.verticalSpeedFpm)
    ? Math.abs(sample.verticalSpeedFpm)
    : 0;
}

function gAbs(sample: CrashSample): number {
  return finite(sample.gForce) ? Math.abs(sample.gForce) : 1;
}

/** Risk envelope → tighten Watch poll (does not arm crash). */
export function crashPollBoostActive(
  sample: CrashSample,
  state: CrashDetectState,
  nowMs: number,
): boolean {
  if (!sample.sawAirborne || sample.frozen) return false;
  if (state.boostUntilMs > nowMs) return true;
  if (finite(sample.aglFt) && sample.aglFt < CRASH_BOOST_AGL_FT) return true;
  if (absVs(sample) >= CRASH_BOOST_VS_FPM) return true;
  if (Math.abs(gAbs(sample) - 1) >= CRASH_BOOST_G_DELTA) return true;
  return false;
}

function isDead(sample: CrashSample): boolean {
  const gs = finite(sample.groundSpeedKt) ? sample.groundSpeedKt : 0;
  const agl = finite(sample.aglFt) ? sample.aglFt : 0;
  const vs = absVs(sample);
  if (sample.onGround && gs <= CRASH_GS_DEAD_KT) return true;
  if (gs <= CRASH_GS_DEAD_KT && agl <= CRASH_AGL_LOW_FT && vs < 400) {
    return true;
  }
  return false;
}

function reasonLabels(bits: number): string[] {
  const out: string[] = [];
  if (bits & CRASH_SPIKE_G) out.push('g_spike');
  if (bits & CRASH_SPIKE_VS) out.push('vs_spike');
  if (bits & CRASH_SPIKE_AGL) out.push('agl_slam');
  if (bits & CRASH_SPIKE_GS) out.push('gs_collapse');
  return out;
}

/**
 * Step the detector. High-confidence verdict at most once (state.fired).
 * Near destination never verdicts.
 */
export function stepCrashDetect(
  prev: CrashDetectState,
  sample: CrashSample,
  ctx: CrashDetectContext,
): CrashDetectStep {
  const nowMs = sample.atMs;
  let state: CrashDetectState = { ...prev };

  const boostNow = crashPollBoostActive(sample, state, nowMs);
  if (boostNow && state.boostUntilMs < nowMs) {
    state = { ...state, boostUntilMs: nowMs + CRASH_BOOST_HOLD_MS };
  }
  const boostPoll = boostNow || state.boostUntilMs > nowMs;

  if (state.fired) {
    return {
      state: {
        ...state,
        lastLat: finite(sample.lat) ? sample.lat : state.lastLat,
        lastLon: finite(sample.lon) ? sample.lon : state.lastLon,
        lastAgl: finite(sample.aglFt) ? sample.aglFt : state.lastAgl,
        lastGs: finite(sample.groundSpeedKt)
          ? sample.groundSpeedKt
          : state.lastGs,
        lastAtMs: nowMs,
      },
      verdict: null,
      boostPoll,
    };
  }

  if (
    !sample.sawAirborne ||
    sample.frozen ||
    !ctx.simAlive ||
    ctx.nearDest
  ) {
    state = {
      ...emptyCrashDetectState(),
      fired: false,
      boostUntilMs: state.boostUntilMs,
      lastLat: finite(sample.lat) ? sample.lat : null,
      lastLon: finite(sample.lon) ? sample.lon : null,
      lastAgl: finite(sample.aglFt) ? sample.aglFt : null,
      lastGs: finite(sample.groundSpeedKt) ? sample.groundSpeedKt : null,
      lastAtMs: nowMs,
    };
    return { state, verdict: null, boostPoll };
  }

  if (
    finite(sample.lat) &&
    finite(sample.lon) &&
    finite(state.lastLat) &&
    finite(state.lastLon)
  ) {
    const dLat = Math.abs(sample.lat - state.lastLat!);
    const dLon = Math.abs(sample.lon - state.lastLon!);
    if (dLat > CRASH_SLEW_DEG || dLon > CRASH_SLEW_DEG) {
      state = {
        ...emptyCrashDetectState(),
        boostUntilMs: state.boostUntilMs,
        lastLat: sample.lat,
        lastLon: sample.lon,
        lastAgl: finite(sample.aglFt) ? sample.aglFt : null,
        lastGs: finite(sample.groundSpeedKt) ? sample.groundSpeedKt : null,
        lastAtMs: nowMs,
      };
      return { state, verdict: null, boostPoll };
    }
  }

  let spikeBits = 0;
  const g = gAbs(sample);
  if (g >= CRASH_G_SPIKE || (finite(sample.gForce) && sample.gForce <= -1)) {
    spikeBits |= CRASH_SPIKE_G;
  }
  const vs = absVs(sample);
  if (vs >= CRASH_VS_SPIKE_FPM) {
    spikeBits |= CRASH_SPIKE_VS;
  }
  if (
    finite(state.lastAgl) &&
    state.lastAgl! >= CRASH_AGL_HIGH_FT &&
    finite(sample.aglFt) &&
    sample.aglFt <= CRASH_AGL_LOW_FT
  ) {
    spikeBits |= CRASH_SPIKE_AGL;
  }
  if (
    finite(state.lastGs) &&
    state.lastGs! >= CRASH_GS_FAST_KT &&
    finite(sample.groundSpeedKt) &&
    sample.groundSpeedKt <= CRASH_GS_DEAD_KT &&
    (!finite(sample.aglFt) || sample.aglFt <= CRASH_AGL_HIGH_FT)
  ) {
    spikeBits |= CRASH_SPIKE_GS;
  }

  if (spikeBits !== 0) {
    const episodeAtMs = state.episodeAtMs ?? nowMs;
    state = {
      ...state,
      episodeAtMs,
      spikeBits: state.spikeBits | spikeBits,
      peakG: Math.max(state.peakG, g),
      peakAbsVs: Math.max(state.peakAbsVs, vs),
      deadTicks: isDead(sample) ? state.deadTicks + 1 : 0,
    };
  } else if (state.episodeAtMs != null) {
    if (nowMs - state.episodeAtMs > CRASH_EPISODE_MS) {
      state = {
        ...emptyCrashDetectState(),
        boostUntilMs: state.boostUntilMs,
        lastLat: finite(sample.lat) ? sample.lat : null,
        lastLon: finite(sample.lon) ? sample.lon : null,
        lastAgl: finite(sample.aglFt) ? sample.aglFt : null,
        lastGs: finite(sample.groundSpeedKt) ? sample.groundSpeedKt : null,
        lastAtMs: nowMs,
      };
      return { state, verdict: null, boostPoll };
    }
    if (isDead(sample)) {
      state = { ...state, deadTicks: state.deadTicks + 1 };
    } else {
      state = { ...state, deadTicks: 0 };
    }
  }

  state = {
    ...state,
    lastLat: finite(sample.lat) ? sample.lat : state.lastLat,
    lastLon: finite(sample.lon) ? sample.lon : state.lastLon,
    lastAgl: finite(sample.aglFt) ? sample.aglFt : state.lastAgl,
    lastGs: finite(sample.groundSpeedKt) ? sample.groundSpeedKt : state.lastGs,
    lastAtMs: nowMs,
  };

  const spikeCount =
    (state.spikeBits & CRASH_SPIKE_G ? 1 : 0) +
    (state.spikeBits & CRASH_SPIKE_VS ? 1 : 0) +
    (state.spikeBits & CRASH_SPIKE_AGL ? 1 : 0) +
    (state.spikeBits & CRASH_SPIKE_GS ? 1 : 0);

  if (
    state.episodeAtMs != null &&
    spikeCount >= 2 &&
    state.deadTicks >= CRASH_DEAD_TICKS &&
    !ctx.nearDest &&
    ctx.simAlive
  ) {
    const reasonBits = reasonLabels(state.spikeBits);
    const verdict: CrashVerdict = {
      confidence: 'high',
      reasonBits,
      peakG: state.peakG,
      peakAbsVs: state.peakAbsVs,
      message:
        'Flight ended — impact away from destination. Cargo lost; no payout.',
    };
    return {
      state: { ...state, fired: true, episodeAtMs: null, deadTicks: 0 },
      verdict,
      boostPoll,
    };
  }

  return { state, verdict: null, boostPoll };
}
