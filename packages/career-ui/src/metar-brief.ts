/** Live METAR fields the dispatch line actually shows. */
export type MetarStation = {
  windDir: number | null;
  windSpeedKt: number | null;
  windGustKt: number | null;
  qnhHpa: number | null;
  variable: boolean;
};

export function plannedRunway(
  route: string | undefined,
  icao: string,
  end: 'origin' | 'dest',
): string | null {
  const id = icao.trim().toUpperCase();
  if (!route?.trim() || !id) return null;
  const tokens = route.toUpperCase().split(/\s+/).filter(Boolean);
  const token = end === 'origin' ? tokens[0] : tokens[tokens.length - 1];
  if (!token?.startsWith(`${id}/`)) return null;
  const runway = token.slice(id.length + 1);
  return /^\d{2}[LRC]?$/.test(runway) ? runway : null;
}

/** Magnetic runway number × 10. METAR wind is compared the same way a pilot does. */
export function tailwindKt(
  windDir: number | null,
  windSpeedKt: number | null,
  runway: string | null,
): number | null {
  if (windDir == null || windSpeedKt == null || windSpeedKt <= 0 || !runway) return null;
  const number = Number(runway.slice(0, 2));
  if (!Number.isInteger(number) || number < 1 || number > 36) return null;
  const radians = ((windDir - number * 10) * Math.PI) / 180;
  const tail = -(windSpeedKt * Math.cos(radians));
  if (tail < 1) return null;
  return Math.round(tail);
}

export function formatWind(station: MetarStation): string | null {
  const speed = station.windSpeedKt;
  if (speed == null || !Number.isFinite(speed)) return null;
  if (speed === 0) return 'Calm';
  const gust =
    station.windGustKt != null && station.windGustKt > speed
      ? `, gust ${Math.round(station.windGustKt)}`
      : '';
  if (station.variable || station.windDir == null) return `Variable ${Math.round(speed)} kt${gust}`;
  return `${Math.round(station.windDir)}° ${Math.round(speed)} kt${gust}`;
}

export function formatQnh(station: MetarStation): string | null {
  if (station.qnhHpa == null || !Number.isFinite(station.qnhHpa)) return null;
  return `${Math.round(station.qnhHpa)} hPa`;
}

export function formatTailwind(station: MetarStation, runway: string | null): string | null {
  if (station.variable) return null;
  const sustained = tailwindKt(station.windDir, station.windSpeedKt, runway);
  if (sustained == null || !runway) return null;
  const gust = tailwindKt(station.windDir, station.windGustKt, runway);
  const gustText = gust != null && gust > sustained ? `, gust ${gust} kt` : '';
  return `Tailwind ${sustained} kt${gustText} on ${runway}`;
}

function finite(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function stationFromAviationWeather(row: unknown): { icao: string; station: MetarStation } | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  const icao = String(record.icaoId ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(icao)) return null;
  const rawDir = record.wdir;
  const variable = String(rawDir ?? '').toUpperCase() === 'VRB';
  const windSpeedKt = finite(record.wspd);
  if (windSpeedKt == null) return null;
  const gust = finite(record.wgst);
  return {
    icao,
    station: {
      windDir: variable ? null : finite(rawDir),
      windSpeedKt,
      windGustKt: gust != null && gust > windSpeedKt ? gust : null,
      qnhHpa: finite(record.altim),
      variable,
    },
  };
}

export function stationsFromAviationWeather(body: unknown): Record<string, MetarStation> {
  const rows = Array.isArray(body) ? body : [];
  const stations: Record<string, MetarStation> = {};
  for (const row of rows) {
    const parsed = stationFromAviationWeather(row);
    if (parsed) stations[parsed.icao] = parsed.station;
  }
  return stations;
}
