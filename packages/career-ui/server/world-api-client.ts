/**
 * HTTP client from desktop gateway → world host API.
 * Forwards Bearer + X-Skyline-Company-Id; used by Watch settle/depart and
 * mission load/patch for local inject/preflight.
 */

import type {
  CareerMissionsState,
  MissionIntent,
} from '@msfs-compat/shared';

export type WorldApiAuth = {
  authorization?: string;
  companyId?: string;
};

export type WorldApiClientOpts = {
  baseUrl: string;
  /** Default auth when a call does not pass per-request headers. */
  defaultAuth?: WorldApiAuth;
  fetchImpl?: typeof fetch;
};

export class WorldApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'WorldApiError';
    this.status = status;
    this.body = body;
  }
}

function mergeAuth(
  defaults: WorldApiAuth | undefined,
  override?: WorldApiAuth,
): WorldApiAuth {
  return {
    authorization: override?.authorization ?? defaults?.authorization,
    companyId: override?.companyId ?? defaults?.companyId,
  };
}

export class WorldApiClient {
  readonly baseUrl: string;
  private readonly defaultAuth: WorldApiAuth | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: WorldApiClientOpts) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.defaultAuth = opts.defaultAuth;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  withAuth(auth: WorldApiAuth): WorldApiClient {
    return new WorldApiClient({
      baseUrl: this.baseUrl,
      defaultAuth: mergeAuth(this.defaultAuth, auth),
      fetchImpl: this.fetchImpl,
    });
  }

  private headers(auth?: WorldApiAuth, json = true): Record<string, string> {
    const a = mergeAuth(this.defaultAuth, auth);
    const h: Record<string, string> = {};
    if (json) h['content-type'] = 'application/json';
    if (a.authorization) h.authorization = a.authorization;
    if (a.companyId) h['x-skyline-company-id'] = a.companyId;
    return h;
  }

  async request<T>(
    method: string,
    path: string,
    opts?: { body?: unknown; auth?: WorldApiAuth },
  ): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await this.fetchImpl(url, {
      method,
      headers: this.headers(opts?.auth, opts?.body !== undefined),
      body:
        opts?.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = text;
      }
    }
    if (!res.ok) {
      const errMsg =
        parsed &&
        typeof parsed === 'object' &&
        parsed !== null &&
        'error' in parsed &&
        typeof (parsed as { error: unknown }).error === 'string'
          ? (parsed as { error: string }).error
          : `world API ${method} ${path} → ${res.status}`;
      throw new WorldApiError(res.status, errMsg, parsed);
    }
    return parsed as T;
  }

  getMissions(auth?: WorldApiAuth): Promise<CareerMissionsState> {
    return this.request('GET', '/api/missions', { auth });
  }

  /**
   * Patch fields on an open mission (inject/preflight/Watch scrub).
   * World host: POST /api/missions/open-update
   */
  openUpdate(
    opts: {
      missionId: string;
      patch?: Partial<MissionIntent>;
      revertFalseDepart?: boolean;
      companyId?: string;
    },
    auth?: WorldApiAuth,
  ): Promise<{ ok: boolean; mission?: MissionIntent }> {
    return this.request('POST', '/api/missions/open-update', {
      auth: mergeAuth(auth, {
        companyId: opts.companyId ?? auth?.companyId,
      }),
      body: {
        missionId: opts.missionId,
        patch: opts.patch,
        revertFalseDepart: opts.revertFalseDepart === true,
        companyId: opts.companyId,
      },
    });
  }

  depart(
    opts: {
      missionId: string;
      override?: boolean;
      nowMs?: number;
      distanceNm?: number;
      expectedRouteMs?: number;
      companyId?: string;
    },
    auth?: WorldApiAuth,
  ): Promise<unknown> {
    return this.request('POST', '/api/depart', {
      auth: mergeAuth(auth, { companyId: opts.companyId }),
      body: opts,
    });
  }

  settle(
    opts: {
      missionId: string;
      companyId?: string;
      residualFuelKg?: number;
      landingFpm?: number;
      airborneEndedAtMs?: number;
      airborneElapsedMs?: number;
      flightScore?: unknown;
      weatherOps?: unknown;
      mxFuelDrainUnsettledKg?: number;
      mxFuelDrainTotalKg?: number;
      touchdownLat?: number;
      touchdownLon?: number;
      touchdownHeadingTrueDeg?: number;
      nowMs?: number;
    },
    auth?: WorldApiAuth,
  ): Promise<unknown> {
    return this.request('POST', '/api/settle', {
      auth: mergeAuth(auth, { companyId: opts.companyId }),
      body: opts,
    });
  }

  getAirport(
    icao: string,
    auth?: WorldApiAuth,
  ): Promise<{ icao: string; lat?: number; lon?: number } | null> {
    return this.request('GET', `/api/airport/${encodeURIComponent(icao)}`, {
      auth,
    }).catch((err) => {
      if (err instanceof WorldApiError && err.status === 404) return null;
      throw err;
    });
  }
}

/** Build auth bag from an incoming Node request (gateway → world). */
export function worldAuthFromIncoming(req: {
  headers: Record<string, string | string[] | undefined>;
}): WorldApiAuth {
  const rawAuth = req.headers.authorization;
  const authorization = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
  const rawCo = req.headers['x-skyline-company-id'];
  const companyId = Array.isArray(rawCo) ? rawCo[0] : rawCo;
  return {
    ...(authorization ? { authorization } : {}),
    ...(companyId ? { companyId: String(companyId).trim() } : {}),
  };
}
