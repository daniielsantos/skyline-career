/**
 * Gateway-mode career access: missions via world HTTP (no local store).
 */

import type {
  CareerEconomyWorld,
  CareerMissionsState,
  MissionIntent,
} from '@msfs-compat/shared';
import type { WatchWorldMutations } from './watch-helpers.js';
import {
  WorldApiClient,
  type WorldApiAuth,
} from './world-api-client.js';

/** Minimal world shell — routeDistanceNm falls back to catalog coords. */
export function gatewayEconomyShell(): CareerEconomyWorld {
  return {
    version: 3,
    seed: 'gateway',
    tick: 0,
    lastBatchAtMs: 0,
    lastSyncedAtMs: 0,
    airports: [],
    lots: [],
    inboundPending: [],
    events: [],
    npcs: [],
    npcFlights: [],
  };
}

export function createGatewayWatchMutations(
  client: WorldApiClient,
  getAuth: () => WorldApiAuth,
): WatchWorldMutations {
  return {
    async departFlight(opts) {
      try {
        await client.withAuth(getAuth()).depart({
          missionId: opts.missionId,
          nowMs: opts.nowMs,
          distanceNm: opts.distanceNm,
          expectedRouteMs: opts.expectedRouteMs,
        });
        return true;
      } catch {
        return false;
      }
    },
    async revertFalseDepart(missionId) {
      try {
        const res = await client.withAuth(getAuth()).openUpdate({
          missionId,
          revertFalseDepart: true,
        });
        return res.ok === true;
      } catch {
        return false;
      }
    },
    async settleFlight(opts) {
      try {
        await client.withAuth(getAuth()).settle(opts);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export async function gatewayLoadMissions(
  client: WorldApiClient,
  auth: WorldApiAuth,
): Promise<CareerMissionsState> {
  return client.withAuth(auth).getMissions();
}

export async function gatewayUpdateOpenMission(
  client: WorldApiClient,
  auth: WorldApiAuth,
  missionId: string,
  update: (
    missions: CareerMissionsState,
    mission: MissionIntent,
    idx: number,
  ) => Promise<boolean> | boolean,
): Promise<boolean> {
  const missions = await client.withAuth(auth).getMissions();
  const idx = missions.missions.findIndex((m) => m.id === missionId);
  if (idx < 0) return false;
  const mission = missions.missions[idx]!;
  const shouldSave = await update(missions, mission, idx);
  if (!shouldSave) return false;
  const patched = missions.missions[idx]!;
  const res = await client.withAuth(auth).openUpdate({
    missionId,
    patch: patched,
  });
  return res.ok === true;
}
