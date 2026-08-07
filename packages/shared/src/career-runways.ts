/**
 * Career runway catalog (hub ICAOs only).
 * Geometry is curated JSON (OurAirports-derived); not SimConnect Facilities.
 */

import { distanceNm } from './career-economy.js';
import { listCareerHubIcaos } from './career-fleet.js';
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
  /** Closer to primary (ident) threshold vs reciprocal end. */
  landingEnd: 'primary' | 'reciprocal';
};

type CatalogFile = Record<string, CareerRunway[]>;

const catalog = catalogJson as CatalogFile;

/** Raw catalog map (hub ICAO → runways). */
export const CAREER_RUNWAYS: Readonly<CatalogFile> = catalog;

export function getAirportRunways(icao: string): CareerRunway[] {
  const key = icao.trim().toUpperCase();
  const rows = CAREER_RUNWAYS[key];
  return Array.isArray(rows) ? rows : [];
}

/** Nearest runway center at an airport (great-circle). */
export function pickNearestRunway(
  icao: string,
  lat: number,
  lon: number,
): CareerRunway | undefined {
  const runways = getAirportRunways(icao);
  if (runways.length === 0) return undefined;
  let best: CareerRunway | undefined;
  let bestNm = Infinity;
  for (const rwy of runways) {
    const d = distanceNm({ lat, lon }, { lat: rwy.lat, lon: rwy.lon });
    if (d < bestNm) {
      bestNm = d;
      best = rwy;
    }
  }
  return best;
}

/**
 * Project a WGS84 point onto a runway rectangle (local ENU approx).
 * `headingTrueDeg` is the primary-end true heading (LE → HE).
 */
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
  const halfWid = runway.widthM / 2;
  const pastThresholdM = alongM + halfLen;
  const onPavement =
    Math.abs(alongM) <= halfLen + 1e-6 && Math.abs(lateralM) <= halfWid + 1e-6;
  return { alongM, lateralM, pastThresholdM, onPavement };
}

/** Hub ICAOs missing runway rows in the committed catalog (for coverage tests). */
export function listHubsMissingRunways(): string[] {
  return listCareerHubIcaos().filter((icao) => getAirportRunways(icao).length === 0);
}

/**
 * Map a touchdown lat/lon onto the nearest catalog runway at `icao`.
 * Returns undefined when coords invalid or the hub has no runway rows.
 */
export function evaluateRunwayTouchdown(
  icao: string,
  lat: number,
  lon: number,
): RunwayTouchdownSnapshot | undefined {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  if (lat === 0 && lon === 0) return undefined;
  const runway = pickNearestRunway(icao, lat, lon);
  if (!runway) return undefined;
  const proj = projectOntoRunway(runway, lat, lon);
  const toReciprocal = runway.lengthM - proj.pastThresholdM;
  const landingEnd: 'primary' | 'reciprocal' =
    proj.pastThresholdM <= toReciprocal ? 'primary' : 'reciprocal';
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
  const side =
    Math.abs(touch.lateralM) < 2
      ? 'centerline'
      : touch.lateralM > 0
        ? `${Math.abs(touch.lateralM)} m right`
        : `${Math.abs(touch.lateralM)} m left`;
  const pavement = touch.onPavement ? 'on pavement' : 'OFF runway';
  const light =
    touch.lighted === true ? ' · lighted' : touch.lighted === false ? ' · unlit' : '';
  return `RWY ${ident} · ${Math.round(thrLabel)} m past THR · ${side} · ${pavement}${light}`;
}
