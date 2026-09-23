/**
 * Soft Crew Live uplink — re-posts Watch samples to VA flight-track.
 * Never touches SimBridge. Failures are swallowed (Live Stale only).
 */

import type { WorldApiAuth, WorldApiClient } from './world-api-client.js';

export type VaLiveUplinkSample = {
  companyId: string;
  missionId: string;
  lat: number;
  lon: number;
  altFt?: number;
  gsKt?: number;
  phase?: string | null;
  onGround?: boolean | null;
};

export type VaLiveUplink = {
  softReport: (sample: VaLiveUplinkSample) => void;
};

const DEFAULT_MIN_INTERVAL_MS = 5_000;
const POST_TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('live uplink timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      },
    );
  });
}

export function createVaLiveUplink(opts: {
  worldClient?: WorldApiClient | null;
  getAuth: () => WorldApiAuth;
  /** Full/lab: record into process-local flight-track store. */
  recordLocal?: (
    sample: VaLiveUplinkSample & { accountId: string },
  ) => void;
  getAccountId?: () => string | null | undefined;
  minIntervalMs?: number;
}): VaLiveUplink {
  let lastAtMs = 0;
  let inFlight = false;
  const minIntervalMs = opts.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;

  return {
    softReport(sample) {
      const companyId = sample.companyId?.trim() ?? '';
      const missionId = sample.missionId?.trim() ?? '';
      if (!companyId || !missionId) return;
      if (
        !Number.isFinite(sample.lat) ||
        !Number.isFinite(sample.lon) ||
        (sample.lat === 0 && sample.lon === 0)
      ) {
        return;
      }
      const now = Date.now();
      if (now - lastAtMs < minIntervalMs) return;
      if (inFlight) return;
      lastAtMs = now;
      inFlight = true;
      void (async () => {
        try {
          const auth = opts.getAuth();
          if (opts.worldClient && auth.authorization) {
            await withTimeout(
              opts.worldClient
                .withAuth({
                  authorization: auth.authorization,
                  companyId,
                })
                .postVaFlightTrack({
                  companyId,
                  missionId,
                  lat: sample.lat,
                  lon: sample.lon,
                  altFt: sample.altFt,
                  gsKt: sample.gsKt,
                  phase: sample.phase ?? undefined,
                  onGround:
                    typeof sample.onGround === 'boolean'
                      ? sample.onGround
                      : undefined,
                }),
              POST_TIMEOUT_MS,
            );
            return;
          }
          const accountId = opts.getAccountId?.()?.trim();
          if (opts.recordLocal && accountId) {
            opts.recordLocal({ ...sample, companyId, missionId, accountId });
          }
        } catch {
          /* soft — Live Stale; never affect Watch */
        } finally {
          inFlight = false;
        }
      })();
    },
  };
}
