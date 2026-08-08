import { fetchAirport, fetchNetworkHubs, type NetworkHub } from './api';
import type { DispatchRouteEndpoint } from './DispatchRouteMap';

let hubsCache: NetworkHub[] | null = null;
let hubsInflight: Promise<NetworkHub[]> | null = null;

export function usableAirportCoords(
  lat: number | undefined,
  lon: number | undefined,
): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    !(lat === 0 && lon === 0)
  );
}

export async function loadNetworkHubsCached(): Promise<NetworkHub[]> {
  if (hubsCache) return hubsCache;
  if (hubsInflight) return hubsInflight;
  hubsInflight = fetchNetworkHubs()
    .then((result) => {
      hubsCache = result.hubs;
      return result.hubs;
    })
    .finally(() => {
      hubsInflight = null;
    });
  return hubsInflight;
}

export function clearNetworkHubsCache(): void {
  hubsCache = null;
  hubsInflight = null;
}

/** Resolve ICAO → map endpoint via hub list, then airport API. */
export async function resolveAirportEndpoint(
  icao: string,
): Promise<DispatchRouteEndpoint | null> {
  const code = icao.trim().toUpperCase();
  if (!code) return null;

  try {
    const hubs = await loadNetworkHubsCached();
    const hub = hubs.find((h) => h.icao.toUpperCase() === code);
    if (hub && usableAirportCoords(hub.lat, hub.lon)) {
      return { icao: code, lat: hub.lat, lon: hub.lon, name: hub.name };
    }
  } catch {
    /* fall through */
  }

  try {
    const view = await fetchAirport(code);
    const { lat, lon, name } = view.airport;
    if (usableAirportCoords(lat, lon)) {
      return { icao: code, lat, lon: lon!, name };
    }
  } catch {
    /* missing */
  }
  return null;
}
