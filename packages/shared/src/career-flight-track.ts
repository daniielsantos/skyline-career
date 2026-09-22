/**
 * In-memory VA flight telemetry — OD intent + breadcrumb trail for Crew Live.
 * Process-local (world-api); lost on restart — fine for live-only UX.
 */

export type FlightTrackPoint = {
  lat: number;
  lon: number;
  atMs: number;
  altFt?: number;
  gsKt?: number;
  /** Watch CareerFlightPhase string when known. */
  phase?: string;
  onGround?: boolean;
};

export type FlightTrackSnapshot = {
  companyId: string;
  accountId: string;
  missionId: string;
  originIcao: string;
  destIcao: string;
  updatedAtMs: number;
  /** Latest Watch phase / speed / alt (refreshed even when trail does not grow). */
  phase?: string;
  onGround?: boolean;
  altFt?: number;
  gsKt?: number;
  points: FlightTrackPoint[];
};

export const FLIGHT_TRACK_FRESH_MS = 90_000;
export const FLIGHT_TRACK_POST_MIN_MS = 15_000;
/** Ignore samples closer than this to the previous point (noise). */
export const FLIGHT_TRACK_MIN_MOVE_NM = 0.35;
export const FLIGHT_TRACK_MAX_POINTS = 180;

type StoreEntry = FlightTrackSnapshot;

const store = new Map<string, StoreEntry>();

function trackKey(companyId: string, accountId: string): string {
  return `${companyId.trim()}:${accountId.trim()}`;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in nautical miles. */
export function flightTrackDistanceNm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 3440.065; // Earth radius nm
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isUsableFlightTrackPosition(
  lat: number,
  lon: number,
): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    !(lat === 0 && lon === 0) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  );
}

export function isFlightTrackFresh(
  updatedAtMs: number,
  nowMs = Date.now(),
): boolean {
  return nowMs - updatedAtMs <= FLIGHT_TRACK_FRESH_MS;
}

/**
 * Fraction 0…1 of OD great-circle completed (origin → aircraft / origin → dest).
 */
export function flightTrackProgressPct(opts: {
  origin: { lat: number; lon: number };
  dest: { lat: number; lon: number };
  aircraft: { lat: number; lon: number };
}): number {
  const total = flightTrackDistanceNm(opts.origin, opts.dest);
  if (!(total > 0.05)) return 0;
  const flown = flightTrackDistanceNm(opts.origin, opts.aircraft);
  return Math.max(0, Math.min(100, Math.round((flown / total) * 100)));
}

function applyLiveTelemetry(
  row: StoreEntry,
  opts: {
    altFt?: number;
    gsKt?: number;
    phase?: string;
    onGround?: boolean;
  },
): void {
  if (typeof opts.altFt === 'number' && Number.isFinite(opts.altFt)) {
    row.altFt = opts.altFt;
  }
  if (typeof opts.gsKt === 'number' && Number.isFinite(opts.gsKt)) {
    row.gsKt = opts.gsKt;
  }
  const phase = opts.phase?.trim();
  if (phase) row.phase = phase;
  if (typeof opts.onGround === 'boolean') row.onGround = opts.onGround;
}

function pointFromSample(
  opts: {
    lat: number;
    lon: number;
    atMs: number;
    altFt?: number;
    gsKt?: number;
    phase?: string;
    onGround?: boolean;
  },
): FlightTrackPoint {
  const point: FlightTrackPoint = {
    lat: opts.lat,
    lon: opts.lon,
    atMs: opts.atMs,
  };
  if (typeof opts.altFt === 'number' && Number.isFinite(opts.altFt)) {
    point.altFt = opts.altFt;
  }
  if (typeof opts.gsKt === 'number' && Number.isFinite(opts.gsKt)) {
    point.gsKt = opts.gsKt;
  }
  const phase = opts.phase?.trim();
  if (phase) point.phase = phase;
  if (typeof opts.onGround === 'boolean') point.onGround = opts.onGround;
  return point;
}

export function getFlightTrack(
  companyId: string,
  accountId: string,
): FlightTrackSnapshot | null {
  const row = store.get(trackKey(companyId, accountId));
  return row ? { ...row, points: [...row.points] } : null;
}

export function clearFlightTrack(
  companyId: string,
  accountId: string,
): void {
  store.delete(trackKey(companyId, accountId));
}

export function recordFlightTrackSample(opts: {
  companyId: string;
  accountId: string;
  missionId: string;
  originIcao: string;
  destIcao: string;
  lat: number;
  lon: number;
  atMs?: number;
  altFt?: number;
  gsKt?: number;
  phase?: string;
  onGround?: boolean;
}): FlightTrackSnapshot {
  const companyId = opts.companyId.trim();
  const accountId = opts.accountId.trim();
  const missionId = opts.missionId.trim();
  if (!companyId || !accountId || !missionId) {
    throw new Error('companyId, accountId, and missionId required');
  }
  if (!isUsableFlightTrackPosition(opts.lat, opts.lon)) {
    throw new Error('Invalid position');
  }
  const atMs = opts.atMs ?? Date.now();
  const key = trackKey(companyId, accountId);
  let row = store.get(key);
  if (!row || row.missionId !== missionId) {
    row = {
      companyId,
      accountId,
      missionId,
      originIcao: opts.originIcao.trim().toUpperCase(),
      destIcao: opts.destIcao.trim().toUpperCase(),
      updatedAtMs: atMs,
      points: [],
    };
  } else {
    row = {
      ...row,
      originIcao: opts.originIcao.trim().toUpperCase() || row.originIcao,
      destIcao: opts.destIcao.trim().toUpperCase() || row.destIcao,
    };
  }

  applyLiveTelemetry(row, opts);

  const last = row.points[row.points.length - 1];
  if (last) {
    const moved = flightTrackDistanceNm(last, {
      lat: opts.lat,
      lon: opts.lon,
    });
    if (moved < FLIGHT_TRACK_MIN_MOVE_NM && atMs - last.atMs < FLIGHT_TRACK_POST_MIN_MS) {
      // Refresh last crumb telemetry without growing the trail (taxi / hold).
      const refreshed = pointFromSample({
        lat: last.lat,
        lon: last.lon,
        atMs,
        altFt: opts.altFt ?? last.altFt,
        gsKt: opts.gsKt ?? last.gsKt,
        phase: opts.phase ?? last.phase,
        onGround:
          typeof opts.onGround === 'boolean' ? opts.onGround : last.onGround,
      });
      row.points[row.points.length - 1] = refreshed;
      row.updatedAtMs = atMs;
      store.set(key, row);
      return { ...row, points: [...row.points] };
    }
  }

  row.points.push(pointFromSample({ ...opts, atMs }));
  while (row.points.length > FLIGHT_TRACK_MAX_POINTS) {
    row.points.shift();
  }
  row.updatedAtMs = atMs;
  store.set(key, row);
  return { ...row, points: [...row.points] };
}

/** Test helper — wipe process store. */
export function resetFlightTrackStoreForTests(): void {
  store.clear();
}
