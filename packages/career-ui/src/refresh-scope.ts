import type { CareerTab } from './routes';
import { BUSH_TRIPS_BOARD_ENABLED } from './feature-flags';

export type CareerRefreshScope = {
  market?: boolean;
  missions?: boolean;
  npc?: boolean;
  aircraftMarket?: boolean;
  bushTrips?: boolean;
  airport?: boolean;
};

/**
 * Tab-scoped fetches. Missions stay on every scope so the sidebar Active
 * flight card is not tied to opening Dispatch or Logbook.
 */
export function liveRefreshScope(
  tab: CareerTab,
  airportOpen: boolean,
): CareerRefreshScope {
  if (airportOpen) {
    return { npc: true, market: true, airport: true, missions: true };
  }
  switch (tab) {
    case 'fleet':
      return { npc: true, missions: true };
    case 'market':
      return {
        market: true,
        npc: true,
        missions: true,
        bushTrips: BUSH_TRIPS_BOARD_ENABLED,
      };
    case 'aircraft':
      return { aircraftMarket: true, missions: true };
    case 'missions':
    case 'staging':
      return { missions: true };
    default:
      return { missions: true };
  }
}
