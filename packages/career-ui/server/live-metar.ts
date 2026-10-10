import { stationsFromAviationWeather, type MetarStation } from '../src/metar-brief.ts';

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; stations: Record<string, MetarStation> }>();

function codes(icaos: readonly string[]): string[] {
  return [...new Set(icaos.map((icao) => icao.trim().toUpperCase()))]
    .filter((icao) => /^[A-Z0-9]{4}$/.test(icao))
    .slice(0, 2)
    .sort();
}

export async function liveMetar(
  icaos: readonly string[],
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<Record<string, MetarStation>> {
  const ids = codes(icaos);
  if (!ids.length) return {};
  const key = ids.join(',');
  const cached = cache.get(key);
  if (cached && now - cached.at < TTL_MS) return cached.stations;
  try {
    const response = await fetchImpl(
      `https://aviationweather.gov/api/data/metar?ids=${key}&format=json`,
      {
        headers: { 'User-Agent': 'Airframe Career' },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) return {};
    const stations = stationsFromAviationWeather(await response.json());
    cache.set(key, { at: now, stations });
    return stations;
  } catch {
    return {};
  }
}
