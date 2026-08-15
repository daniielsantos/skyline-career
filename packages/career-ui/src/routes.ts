/** Career UI path ↔ tab / airport sync (History API, no router package). */

export type CareerTab =
  | 'market'
  | 'aircraft'
  | 'missions'
  | 'fleet'
  | 'staging'
  | 'hangar'
  | 'pilot'
  | 'map'
  | 'ports'
  | 'settings';

export type CareerLocation = {
  tab: CareerTab;
  airportIcao: string | null;
};

/** Canonical public paths (operational vocabulary). */
const TAB_PATH: Record<CareerTab, string> = {
  market: '/freights',
  aircraft: '/airframes',
  hangar: '/hangar',
  staging: '/dispatch',
  fleet: '/rivals',
  pilot: '/company',
  map: '/network',
  ports: '/ports',
  missions: '/logbook',
  settings: '/settings',
};

/** Canonical + legacy aliases so old bookmarks keep working. */
const PATH_TAB: Record<string, CareerTab> = {
  '/': 'market',
  '/freights': 'market',
  '/market': 'market',
  '/airframes': 'aircraft',
  '/aircraft': 'aircraft',
  '/hangar': 'hangar',
  '/dispatch': 'staging',
  '/staging': 'staging',
  '/rivals': 'fleet',
  '/npc-fleet': 'fleet',
  '/fleet': 'fleet',
  '/company': 'pilot',
  '/pilot': 'pilot',
  '/network': 'map',
  '/map': 'map',
  '/ports': 'ports',
  '/logbook': 'missions',
  '/missions': 'missions',
  '/settings': 'settings',
};

export function pathForLocation(loc: CareerLocation): string {
  if (loc.airportIcao) {
    return `/airport/${loc.airportIcao.toUpperCase()}`;
  }
  return TAB_PATH[loc.tab];
}

export function parseCareerPath(pathname: string): CareerLocation {
  const raw = pathname.split('?')[0] ?? '/';
  const p = (raw.replace(/\/+$/, '') || '/').toLowerCase();
  const airport = /^\/airport\/([a-z0-9]+)$/i.exec(p);
  if (airport) {
    return {
      tab: 'market',
      airportIcao: airport[1]!.toUpperCase(),
    };
  }
  const tab = PATH_TAB[p] ?? 'market';
  return { tab, airportIcao: null };
}

export function readCareerLocation(): CareerLocation {
  if (typeof window === 'undefined') {
    return { tab: 'market', airportIcao: null };
  }
  return parseCareerPath(window.location.pathname);
}

export function writeCareerLocation(
  loc: CareerLocation,
  opts: { replace?: boolean } = {},
): void {
  if (typeof window === 'undefined') return;
  const next = pathForLocation(loc);
  if (window.location.pathname === next) return;
  if (opts.replace) {
    window.history.replaceState(loc, '', next);
  } else {
    window.history.pushState(loc, '', next);
  }
}
