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

/** RWY 06 → 60°, RWY 36 → 0°. Magnetic runway-number estimate (not true). */
export function headingFromRunwayIdent(ident: string | undefined): number | null {
  const m = String(ident ?? '')
    .trim()
    .toUpperCase()
    .match(/^(\d{1,2})/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 1 || n > 36) return null;
  return (n * 10) % 360;
}

/**
 * True when catalog heading looks like merge-missing's ident×10 stub
 * (magnetic runway number), not surveyed true heading.
 */
export function isLikelyMagneticHeadingStub(
  runway: Pick<CareerRunway, 'ident' | 'headingTrueDeg'>,
): boolean {
  const fromIdent = headingFromRunwayIdent(runway.ident);
  if (fromIdent == null) return false;
  return headingDeltaDeg(runway.headingTrueDeg, fromIdent) <= 3;
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
  if (msfs && msfs.length > 0) {
    return msfs.filter(isUsableRunwayCenter);
  }
  const rows = CAREER_RUNWAYS[key];
  if (!Array.isArray(rows)) return [];
  return rows.filter(isUsableRunwayCenter);
}

/**
 * Reject Null Island / missing centers — empty OA fields used to become lat=0
 * lon=0 via Number(""), which made touchdown project millions of meters off.
 */
export function isUsableRunwayCenter(
  runway: Pick<CareerRunway, 'lat' | 'lon'>,
): boolean {
  return (
    Number.isFinite(runway.lat) &&
    Number.isFinite(runway.lon) &&
    !(Math.abs(runway.lat) < 1e-9 && Math.abs(runway.lon) < 1e-9)
  );
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
    const { proj } = bestRunwayProjection(rwy, lat, lon, headingTrueDeg);
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
 * `headingTrueDeg` is the primary-end true heading (LE → HE), unless
 * `axisHeadingTrueDeg` overrides the strip axis (used when catalog heading is
 * a magnetic runway-number stub and aircraft true heading is known).
 *
 * OurAirports centers can sit a few meters off MSFS pavement — allow a small
 * lateral cushion before marking OFF runway.
 */
export const RUNWAY_PAVEMENT_LATERAL_SLACK_M = 12;

export function projectOntoRunway(
  runway: CareerRunway,
  lat: number,
  lon: number,
  axisHeadingTrueDeg?: number,
): RunwayProjection {
  const latRad = (runway.lat * Math.PI) / 180;
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos(latRad);
  const dNorth = (lat - runway.lat) * mPerDegLat;
  const dEast = (lon - runway.lon) * mPerDegLon;
  const rawHdg =
    typeof axisHeadingTrueDeg === 'number' && Number.isFinite(axisHeadingTrueDeg)
      ? axisHeadingTrueDeg
      : runway.headingTrueDeg;
  const hdg = (((rawHdg % 360) + 360) % 360) * (Math.PI / 180);
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

/**
 * A crab of a few degrees is not a new runway axis. Only a magnetic ident×10
 * stub that disagrees with the aircraft by more than this (local declination)
 * may replace the catalog heading.
 */
const MAGNETIC_STUB_AXIS_MIN_DELTA_DEG = 12;

/**
 * Catalog true heading is the strip axis. Aircraft heading replaces it only
 * for a leftover ident×10 magnetic stub that the aircraft clearly disagrees
 * with. Crab on a surveyed heading used to swing lateral by tens of meters.
 */
export function bestRunwayProjection(
  runway: CareerRunway,
  lat: number,
  lon: number,
  aircraftHeadingTrueDeg?: number,
): { proj: RunwayProjection; axisHeadingTrueDeg: number } {
  const catalog = projectOntoRunway(runway, lat, lon);
  const catalogAxis = runway.headingTrueDeg;
  if (
    typeof aircraftHeadingTrueDeg !== 'number' ||
    !Number.isFinite(aircraftHeadingTrueDeg) ||
    !isLikelyMagneticHeadingStub(runway)
  ) {
    return { proj: catalog, axisHeadingTrueDeg: catalogAxis };
  }
  const heading = aircraftHeadingTrueDeg;
  const stubDisagrees =
    Math.min(
      headingDeltaDeg(heading, runway.headingTrueDeg),
      headingDeltaDeg(heading, runway.headingTrueDeg + 180),
    ) > MAGNETIC_STUB_AXIS_MIN_DELTA_DEG;
  if (!stubDisagrees) {
    return { proj: catalog, axisHeadingTrueDeg: catalogAxis };
  }
  const a = projectOntoRunway(runway, lat, lon, heading);
  const b = projectOntoRunway(runway, lat, lon, heading + 180);
  type Cand = { proj: RunwayProjection; axis: number; prefer: number };
  const cands: Cand[] = [
    {
      proj: catalog,
      axis: catalogAxis,
      // Magnetic stubs: demote catalog so aircraft true heading wins.
      prefer: 2,
    },
    {
      proj: a,
      axis: ((heading % 360) + 360) % 360,
      prefer: 0,
    },
    {
      proj: b,
      axis: (((heading + 180) % 360) + 360) % 360,
      prefer: 0,
    },
  ];
  cands.sort((x, y) => {
    if (x.proj.onPavement !== y.proj.onPavement) {
      return x.proj.onPavement ? -1 : 1;
    }
    if (x.prefer !== y.prefer) return x.prefer - y.prefer;
    const latDiff = Math.abs(x.proj.lateralM) - Math.abs(y.proj.lateralM);
    if (Math.abs(latDiff) > 0.5) return latDiff;
    return Math.abs(x.proj.alongM) - Math.abs(y.proj.alongM);
  });
  const best = cands[0]!;
  return { proj: best.proj, axisHeadingTrueDeg: best.axis };
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
  const { proj, axisHeadingTrueDeg } = bestRunwayProjection(
    runway,
    lat,
    lon,
    headingTrueDeg,
  );
  const landingEnd = pickRunwayLandingEnd(
    runway,
    proj.pastThresholdM,
    headingTrueDeg,
  );
  // pastThresholdM / lateralM in the snapshot are always in the catalog-primary
  // frame (format + diagram flip for reciprocal). When the winning axis is the
  // reciprocal true heading, convert from that axis's LE frame.
  let pastThresholdM = proj.pastThresholdM;
  let lateralM = proj.lateralM;
  const toPrimary = headingDeltaDeg(axisHeadingTrueDeg, runway.headingTrueDeg);
  const toReciprocal = headingDeltaDeg(
    axisHeadingTrueDeg,
    runway.headingTrueDeg + 180,
  );
  if (toReciprocal + 1 < toPrimary) {
    pastThresholdM = runway.lengthM - proj.pastThresholdM;
    lateralM = -proj.lateralM;
  }
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
    // Keep catalog heading for strip identity. Projection uses that axis unless
    // the catalog value is still a magnetic ident×10 stub.
    headingTrueDeg: runway.headingTrueDeg,
    ...(runway.lighted !== undefined ? { lighted: runway.lighted } : {}),
    alongM: Math.round(pastThresholdM - runway.lengthM / 2),
    lateralM: Math.round(lateralM),
    pastThresholdM: Math.round(pastThresholdM),
    onPavement: proj.onPavement,
    landingEnd,
  };
}

/**
 * Accept a desktop-computed touchdown. The world catalog can still be the
 * OurAirports strip (threshold stored as the center); the machine that flew
 * already has the MSFS pavement.
 */
export function parseRunwayTouchdownSnapshot(
  raw: unknown,
  destIcao?: string,
): RunwayTouchdownSnapshot | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Record<string, unknown>;
  const lat = Number(row.lat);
  const lon = Number(row.lon);
  const lengthM = Number(row.lengthM);
  const widthM = Number(row.widthM);
  const headingTrueDeg = Number(row.headingTrueDeg);
  const alongM = Number(row.alongM);
  const lateralM = Number(row.lateralM);
  const pastThresholdM = Number(row.pastThresholdM);
  const runwayIdent =
    typeof row.runwayIdent === 'string' ? row.runwayIdent.trim() : '';
  const icao = typeof row.icao === 'string' ? row.icao.trim().toUpperCase() : '';
  const landingEnd =
    row.landingEnd === 'primary' || row.landingEnd === 'reciprocal'
      ? row.landingEnd
      : undefined;
  if (!runwayIdent || !icao || !landingEnd) return undefined;
  if (
    destIcao &&
    icao !== destIcao.trim().toUpperCase()
  ) {
    return undefined;
  }
  if (
    ![lat, lon, lengthM, widthM, headingTrueDeg, alongM, lateralM, pastThresholdM].every(
      (n) => Number.isFinite(n),
    )
  ) {
    return undefined;
  }
  if (lat === 0 && lon === 0) return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined;
  if (lengthM < 5 || lengthM > 8_000 || widthM <= 0 || widthM > 200) return undefined;
  if (Math.abs(pastThresholdM) > lengthM + 500) return undefined;
  if (Math.abs(lateralM) > 2_000) return undefined;
  const snap: RunwayTouchdownSnapshot = {
    lat,
    lon,
    icao,
    runwayIdent,
    lengthM,
    widthM,
    headingTrueDeg,
    alongM: Math.round(alongM),
    lateralM: Math.round(lateralM),
    pastThresholdM: Math.round(pastThresholdM),
    onPavement: row.onPavement === true,
    landingEnd,
  };
  if (
    typeof row.runwayIdentReciprocal === 'string' &&
    row.runwayIdentReciprocal.trim()
  ) {
    snap.runwayIdentReciprocal = row.runwayIdentReciprocal.trim();
  }
  if (typeof row.lighted === 'boolean') snap.lighted = row.lighted;
  return snap;
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

/** Reject a touchdown latch left over from an earlier landing. */
export const MAX_SIM_TOUCHDOWN_NM = 0.45; // ~830 m

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
