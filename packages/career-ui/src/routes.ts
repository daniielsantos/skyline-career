/** Career UI path ↔ tab / airport sync (History API, no router package). */

export type CareerTab =
  | 'market'
  | 'charter'
  | 'aircraft'
  | 'missions'
  | 'fleet'
  | 'staging'
  | 'hangar'
  | 'pilot'
  | 'map'
  | 'ports'
  | 'va'
  | 'vaDirectory'
  | 'vaRanking'
  | 'lab'
  | 'pulse'
  | 'settings';

export type CareerLocation = {
  tab: CareerTab;
  airportIcao: string | null;
};

/** Canonical public paths (operational vocabulary). */
const TAB_PATH: Record<CareerTab, string> = {
  market: '/freights',
  charter: '/charter',
  aircraft: '/airframes',
  hangar: '/hangar',
  staging: '/dispatch',
  fleet: '/rivals',
  pilot: '/company',
  map: '/network',
  ports: '/ports',
  va: '/va',
  vaDirectory: '/vas',
  vaRanking: '/ranking',
  missions: '/logbook',
  lab: '/lab',
  pulse: '/pulse',
  settings: '/settings',
};

/** Canonical + legacy aliases so old bookmarks keep working. */
const PATH_TAB: Record<string, CareerTab> = {
  '/': 'market',
  '/freights': 'market',
  '/market': 'market',
  '/charter': 'charter',
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
  '/va': 'va',
  '/vas': 'vaDirectory',
  '/va-directory': 'vaDirectory',
  '/ranking': 'vaRanking',
  '/va-ranking': 'vaRanking',
  '/logbook': 'missions',
  '/missions': 'missions',
  '/lab': 'lab',
  '/pulse': 'pulse',
  '/economy-pulse': 'pulse',
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

/**
 * Gate screens (profile / auth / waiting-for-host) should not keep stale
 * `/company?company=…` crumbs from a previous session.
 */
export function resetCareerShellUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    const alreadyClean =
      (url.pathname === '/' || url.pathname === '') &&
      !url.searchParams.has('company') &&
      !url.hash;
    if (alreadyClean) return;
    window.history.replaceState({}, '', '/');
  } catch {
    /* ignore */
  }
}

/**
 * Preserve ?company= only when already present (lab dual-tab without Auth).
 * Auth mode strips the param on session open — do not re-add it here.
 */
function withPreservedCompanyQuery(path: string): string {
  try {
    const current = new URL(window.location.href);
    const company = current.searchParams.get('company')?.trim();
    if (!company) return path;
    const next = new URL(path, window.location.origin);
    next.searchParams.set('company', company);
    return `${next.pathname}${next.search}`;
  } catch {
    return path;
  }
}

export function writeCareerLocation(
  loc: CareerLocation,
  opts: { replace?: boolean } = {},
): void {
  if (typeof window === 'undefined') return;
  const next = withPreservedCompanyQuery(pathForLocation(loc));
  const current = `${window.location.pathname}${window.location.search}`;
  if (current === next) return;
  if (opts.replace) {
    window.history.replaceState(loc, '', next);
  } else {
    window.history.pushState(loc, '', next);
  }
}
