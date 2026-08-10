/**
 * Career runway catalog (hub ICAOs only).
 * Base geometry is curated JSON (OurAirports-derived); MSFS Facilities overrides win when present.
 */

import { distanceNm } from './career-economy.js';
import { listCareerHubIcaos } from './career-fleet.js';
import { lookupMsfsBushHubOverride } from './career-msfs-hub-overrides.js';
import catalogJson from './data/career-runways.json' with { type: 'json' };

export type RunwaySurface =
  | 'asphalt'
  | 'concrete'
  | 'grass'
  | 'gravel'
  | 'dirt'
  | 'water'
  | 'other';

/** One physical strip; `ident` is the primary (LE) end label. */
export type CareerRunway = {
  ident: string;
  identReciprocal?: string;
  /** True heading of the primary end (degrees). */
  headingTrueDeg: number;
  lengthM: number;
  widthM: number;
  /** Runway center WGS84. */
  lat: number;
  lon: number;
  surface?: RunwaySurface;
  /** True when OurAirports reports night lighting on the strip. */
  lighted?: boolean;
};

export type RunwayProjection = {
  /** Meters from center along runway axis (+ toward reciprocal / HE). */
  alongM: number;
  /** Meters right of centerline when facing headingTrueDeg. */
  lateralM: number;
  /** Meters past the primary (ident) threshold along the strip. */
  pastThresholdM: number;
  /** True when inside length×width rectangle. */
  onPavement: boolean;
};

/** Settled touchdown vs catalog runway at dest ICAO. */
export type RunwayTouchdownSnapshot = {
  lat: number;
  lon: number;
  icao: string;
  runwayIdent: string;
  runwayIdentReciprocal?: string;
  lengthM: number;
  widthM: number;
  headingTrueDeg: number;
  lighted?: boolean;
  alongM: number;
  lateralM: number;
  pastThresholdM: number;
  onPavement: boolean;
  /**
   * Approach end used for debrief labeling.
   * Prefer aircraft true heading at touchdown (±90° of runway heading);
   * fall back to geometrically closer threshold when heading is missing.
   */
  landingEnd: 'primary' | 'reciprocal';
};

/** Smallest absolute difference between two headings (0–180). */
export function headingDeltaDeg(a: number, b: number): number {
  const d = ((((a - b) % 360) + 540) % 360) - 180;
  return Math.abs(d);
}

/**
 * Pick which runway end the aircraft was landing on.
 * When `headingTrueDeg` is finite, align to primary vs reciprocal (±90°).
 * Otherwise use the geometrically closer threshold.
 */
export function pickRunwayLandingEnd(
  runway: Pick<CareerRunway, 'headingTrueDeg' | 'lengthM'>,
  pastThresholdM: number,
  headingTrueDeg?: number,
): 'primary' | 'reciprocal' {
  if (typeof headingTrueDeg === 'number' && Number.isFinite(headingTrueDeg)) {
    const toPrimary = headingDeltaDeg(headingTrueDeg, runway.headingTrueDeg);
    const toReciprocal = headingDeltaDeg(
      headingTrueDeg,
      runway.headingTrueDeg + 180,
    );
    return toPrimary <= toReciprocal ? 'primary' : 'reciprocal';
  }
  const toReciprocalEnd = runway.lengthM - pastThresholdM;
  return pastThresholdM <= toReciprocalEnd ? 'primary' : 'reciprocal';
}

type CatalogFile = Record<string, CareerRunway[]>;

const catalog = catalogJson as CatalogFile;

/** Raw catalog map (hub ICAO → runways). */
export const CAREER_RUNWAYS: Readonly<CatalogFile> = catalog;

export function getAirportRunways(icao: string): CareerRunway[] {
  const key = icao.trim().toUpperCase();
  const msfs = lookupMsfsBushHubOverride(key)?.runways;
  if (msfs && msfs.length > 0) return msfs;
  const rows = CAREER_RUNWAYS[key];
  return Array.isArray(rows) ? rows : [];
}

/** Nearest runway center at an airport (great-circle). */
export function pickNearestRunway(
  icao: string,
  lat: number,
  lon: number,
): CareerRunway | undefined {
  return pickBestRunway(icao, lat, lon);
}

/** Distance from a projected point to the runway segment (meters). */
export function distanceToRunwaySegmentM(
  runway: Pick<CareerRunway, 'lengthM'>,
  proj: Pick<RunwayProjection, 'alongM' | 'lateralM'>,
): number {
  const halfLen = runway.lengthM / 2;
  const alongClamped = Math.max(-halfLen, Math.min(halfLen, proj.alongM));
  const dAlong = proj.alongM - alongClamped;
  return Math.hypot(dAlong, proj.lateralM);
}

/**
 * Best matching runway for a touchdown: prefer heading-aligned strips, then
 * on-pavement, then smallest |lateral| to centerline (not distance to center).
 * Parallel runways (e.g. KSTL 30L/30R) break center-distance picking.
 */
export function pickBestRunway(
  icao: string,
  lat: number,
  lon: number,
  headingTrueDeg?: number,
): CareerRunway | undefined {
  const runways = getAirportRunways(icao);
  if (runways.length === 0) return undefined;

  type Cand = {
    rwy: CareerRunway;
    proj: RunwayProjection;
    headingScore: number;
    segmentM: number;
  };
  const cands: Cand[] = runways.map((rwy) => {
    const proj = projectOntoRunway(rwy, lat, lon);
    let headingScore = 180;
    if (typeof headingTrueDeg === 'number' && Number.isFinite(headingTrueDeg)) {
      const toPrimary = headingDeltaDeg(headingTrueDeg, rwy.headingTrueDeg);
      const toReciprocal = headingDeltaDeg(
        headingTrueDeg,
        rwy.headingTrueDeg + 180,
      );
      headingScore = Math.min(toPrimary, toReciprocal);
    }
    return {
      rwy,
      proj,
      headingScore,
      segmentM: distanceToRunwaySegmentM(rwy, proj),
    };
  });

  const aligned =
    typeof headingTrueDeg === 'number' && Number.isFinite(headingTrueDeg)
      ? cands.filter((c) => c.headingScore <= 40)
      : cands;
  const pool = aligned.length > 0 ? aligned : cands;
  const onPav = pool.filter((c) => c.proj.onPavement);
  const pool2 = onPav.length > 0 ? onPav : pool;

  pool2.sort((a, b) => {
    const latDiff = Math.abs(a.proj.lateralM) - Math.abs(b.proj.lateralM);
    if (Math.abs(latDiff) > 0.5) return latDiff;
    if (Math.abs(a.segmentM - b.segmentM) > 0.5) return a.segmentM - b.segmentM;
    return a.headingScore - b.headingScore;
  });
  return pool2[0]?.rwy;
}

/**
 * Project a WGS84 point onto a runway rectangle (local ENU approx).
 * `headingTrueDeg` is the primary-end true heading (LE → HE).
 *
 * OurAirports centers can sit a few meters off MSFS pavement — allow a small
 * lateral cushion before marking OFF runway.
 */
export const RUNWAY_PAVEMENT_LATERAL_SLACK_M = 12;

export function projectOntoRunway(
  runway: CareerRunway,
  lat: number,
  lon: number,
): RunwayProjection {
  const latRad = (runway.lat * Math.PI) / 180;
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos(latRad);
  const dNorth = (lat - runway.lat) * mPerDegLat;
  const dEast = (lon - runway.lon) * mPerDegLon;
  const hdg = (runway.headingTrueDeg * Math.PI) / 180;
  const cosH = Math.cos(hdg);
  const sinH = Math.sin(hdg);
  const alongM = dNorth * cosH + dEast * sinH;
  const lateralM = -dNorth * sinH + dEast * cosH;
  const halfLen = runway.lengthM / 2;
  const halfWid = runway.widthM / 2 + RUNWAY_PAVEMENT_LATERAL_SLACK_M;
  const pastThresholdM = alongM + halfLen;
  const onPavement =
    Math.abs(alongM) <= halfLen + 1e-6 && Math.abs(lateralM) <= halfWid + 1e-6;
  return { alongM, lateralM, pastThresholdM, onPavement };
}

/** Hub ICAOs missing runway rows in the committed catalog (for coverage tests). */
export function listHubsMissingRunways(): string[] {
  return listCareerHubIcaos().filter((icao) => {
    const rows = CAREER_RUNWAYS[icao];
    return !Array.isArray(rows) || rows.length === 0;
  });
}

/**
 * Map a touchdown lat/lon onto the nearest catalog runway at `icao`.
 * Returns undefined when coords invalid or the hub has no runway rows.
 * Pass `headingTrueDeg` (aircraft true heading at touchdown) so a deep
 * landing past midfield is still labeled with the approach end, not the
 * geometrically closer opposite threshold.
 */
export function evaluateRunwayTouchdown(
  icao: string,
  lat: number,
  lon: number,
  headingTrueDeg?: number,
): RunwayTouchdownSnapshot | undefined {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  if (lat === 0 && lon === 0) return undefined;
  const runway = pickBestRunway(icao, lat, lon, headingTrueDeg);
  if (!runway) return undefined;
  const proj = projectOntoRunway(runway, lat, lon);
  const landingEnd = pickRunwayLandingEnd(
    runway,
    proj.pastThresholdM,
    headingTrueDeg,
  );
  return {
    lat,
    lon,
    icao: icao.trim().toUpperCase(),
    runwayIdent: runway.ident,
    ...(runway.identReciprocal
      ? { runwayIdentReciprocal: runway.identReciprocal }
      : {}),
    lengthM: runway.lengthM,
    widthM: runway.widthM,
    headingTrueDeg: runway.headingTrueDeg,
    ...(runway.lighted !== undefined ? { lighted: runway.lighted } : {}),
    alongM: Math.round(proj.alongM),
    lateralM: Math.round(proj.lateralM),
    pastThresholdM: Math.round(proj.pastThresholdM),
    onPavement: proj.onPavement,
    landingEnd,
  };
}

/** Compact debrief line, e.g. `RWY 10L · 420 m past THR · on pavement`. */
export function formatRunwayTouchdownLine(
  touch: RunwayTouchdownSnapshot | null | undefined,
): string {
  if (!touch) return '';
  const ident =
    touch.landingEnd === 'reciprocal' && touch.runwayIdentReciprocal
      ? touch.runwayIdentReciprocal
      : touch.runwayIdent;
  const thrM = Math.max(0, touch.pastThresholdM);
  const thrLabel =
    touch.landingEnd === 'reciprocal' && touch.runwayIdentReciprocal
      ? Math.max(0, touch.lengthM - touch.pastThresholdM)
      : thrM;
  // lateralM is relative to primary heading; flip for reciprocal approach view.
  const lateralForPilot =
    touch.landingEnd === 'reciprocal' ? -touch.lateralM : touch.lateralM;
  const side =
    Math.abs(lateralForPilot) < 2
      ? 'centerline'
      : lateralForPilot > 0
        ? `${Math.abs(Math.round(lateralForPilot))} m right`
        : `${Math.abs(Math.round(lateralForPilot))} m left`;
  const pavement = touch.onPavement ? 'on pavement' : 'OFF runway';
  const light =
    touch.lighted === true ? ' · lighted' : touch.lighted === false ? ' · unlit' : '';
  const lenKm =
    touch.lengthM >= 1000
      ? `${(touch.lengthM / 1000).toFixed(touch.lengthM >= 10_000 ? 1 : 2)} km`
      : `${Math.round(touch.lengthM)} m`;
  return `RWY ${ident} · ${Math.round(thrLabel)} m past THR · ${side} · ${pavement} · ${lenKm}${light}`;
}

const MAX_SIM_TOUCHDOWN_NM = 0.45; // ~830 m — reject stale prior-landing latch

function usableCoord(
  pos: { lat: number; lon: number } | null | undefined,
): pos is { lat: number; lon: number } {
  return (
    pos != null &&
    Number.isFinite(pos.lat) &&
    Number.isFinite(pos.lon) &&
    !(pos.lat === 0 && pos.lon === 0) &&
    Math.abs(pos.lat) <= 90 &&
    Math.abs(pos.lon) <= 180
  );
}

/**
 * Pick first-contact WGS84 for the debrief runway marker.
 * Prefer SimConnect's latched TOUCHDOWN LAT/LON (true first contact) when it
 * is near the live aircraft — Watch poll alone often samples tens of meters
 * past the real touch. Fall back to last airborne sample, then plane-now.
 */
export function pickFirstContactCoords(opts: {
  simTouchdown?: { lat: number; lon: number } | null;
  planeNow?: { lat: number; lon: number } | null;
  lastAirborne?: { lat: number; lon: number } | null;
  /** Reject sim latch farther than this from plane-now (nm). */
  maxSimTouchdownNm?: number;
}): {
  lat: number;
  lon: number;
  source: 'sim_touchdown' | 'last_airborne' | 'plane';
} | null {
  const plane = usableCoord(opts.planeNow) ? opts.planeNow : null;
  const airborne = usableCoord(opts.lastAirborne) ? opts.lastAirborne : null;
  const sim = usableCoord(opts.simTouchdown) ? opts.simTouchdown : null;
  const maxNm = opts.maxSimTouchdownNm ?? MAX_SIM_TOUCHDOWN_NM;

  if (sim && plane) {
    const d = distanceNm(sim, plane);
    if (Number.isFinite(d) && d <= maxNm) {
      return { lat: sim.lat, lon: sim.lon, source: 'sim_touchdown' };
    }
  } else if (sim && !plane) {
    return { lat: sim.lat, lon: sim.lon, source: 'sim_touchdown' };
  }

  // Prefer live aircraft when already on the ground — last airborne can sit on
  // short final between parallel strips and pick the wrong runway.
  if (plane) {
    return { lat: plane.lat, lon: plane.lon, source: 'plane' };
  }
  if (airborne) {
    return { lat: airborne.lat, lon: airborne.lon, source: 'last_airborne' };
  }
  return null;
}
