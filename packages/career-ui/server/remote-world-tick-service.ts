/**
 * MP client WorldTickService — reads clock from a remote world host; never advances.
 *
 * Path styles:
 * - `api` (default): SP mold `/api/world/clock`, `/api/companies/session/open`
 * - `worlds`: sketch `/worlds/:id/clock`, `/companies/:id/session/open`
 *
 * Env: CAREER_WORLD_TICK=remote + CAREER_REMOTE_WORLD_URL=…
 */

import {
  CATCH_UP_PULSE_MS,
  LOCAL_WORLD_ID,
  type CompanySessionOpenOpts,
  type CompanySessionOpenResult,
  type WorldCatchUpProgress,
  type WorldClockSnapshot,
  type WorldId,
  type WorldTickAdvanceOpts,
  type WorldTickAdvanceResult,
  type WorldTickService,
} from '@msfs-compat/shared';

export type RemoteWorldPathStyle = 'api' | 'worlds';

export type RemoteWorldTickDeps = {
  /** Base URL of the world host, e.g. http://127.0.0.1:8787 */
  baseUrl: string;
  /** Default `api` matches today's Career API routes. */
  pathStyle?: RemoteWorldPathStyle;
  fetchImpl?: typeof fetch;
  /** Optional company header for multi-tenant hosts. */
  companyId?: string;
  /** Clock poll interval while background pulse is started (default CATCH_UP_PULSE_MS). */
  pollMs?: number;
  /** Called after each successful clock poll (UI / health). */
  onClock?: (clock: WorldClockSnapshot) => void;
};

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('CAREER_REMOTE_WORLD_URL is empty');
  return trimmed;
}

export function remoteWorldPathStyleFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RemoteWorldPathStyle {
  const raw = (env.CAREER_REMOTE_WORLD_PATH_STYLE ?? 'api').trim().toLowerCase();
  return raw === 'worlds' ? 'worlds' : 'api';
}

/** `CAREER_WORLD_TICK=remote` + URL → use RemoteWorldTickService. */
export function isRemoteWorldTickEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const mode = (env.CAREER_WORLD_TICK ?? 'local').trim().toLowerCase();
  if (mode !== 'remote' && mode !== 'mp-remote' && mode !== 'mp') return false;
  return Boolean(env.CAREER_REMOTE_WORLD_URL?.trim());
}

export class RemoteWorldTickService implements WorldTickService {
  readonly mode = 'mp-remote' as const;
  private readonly fetchImpl: typeof fetch;
  private readonly pathStyle: RemoteWorldPathStyle;
  private readonly pollMs: number;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private lastClock: WorldClockSnapshot | null = null;
  private pollWorldId: WorldId = LOCAL_WORLD_ID;

  constructor(private readonly deps: RemoteWorldTickDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.pathStyle = deps.pathStyle ?? 'api';
    this.pollMs = Math.max(1_000, deps.pollMs ?? CATCH_UP_PULSE_MS);
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = { ...(extra ?? {}) };
    const companyId = this.deps.companyId?.trim();
    if (companyId) out['x-skyline-company-id'] = companyId;
    return out;
  }

  private clockUrl(worldId: WorldId, nowMs: number): URL {
    const path =
      this.pathStyle === 'worlds'
        ? `/worlds/${encodeURIComponent(worldId)}/clock`
        : `/api/world/clock`;
    const url = new URL(path, normalizeBaseUrl(this.deps.baseUrl));
    url.searchParams.set('nowMs', String(nowMs));
    if (this.pathStyle === 'api') {
      url.searchParams.set('worldId', worldId);
    }
    return url;
  }

  private sessionUrl(companyId: string): URL {
    const path =
      this.pathStyle === 'worlds'
        ? `/companies/${encodeURIComponent(companyId)}/session/open`
        : `/api/companies/session/open`;
    return new URL(path, normalizeBaseUrl(this.deps.baseUrl));
  }

  async getClock(worldId: WorldId, nowMs = Date.now()): Promise<WorldClockSnapshot> {
    const res = await this.fetchImpl(this.clockUrl(worldId, nowMs), {
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(`Remote world clock failed (${res.status})`);
    }
    const clock = (await res.json()) as WorldClockSnapshot;
    this.lastClock = clock;
    return clock;
  }

  peekLastClock(): WorldClockSnapshot | null {
    return this.lastClock;
  }

  async advance(
    _worldId: WorldId,
    _opts?: WorldTickAdvanceOpts,
  ): Promise<WorldTickAdvanceResult> {
    throw new Error('MP client cannot advance world — server cron owns the clock');
  }

  async getCatchUpProgress(
    _worldId: WorldId,
    _nowMs?: number,
  ): Promise<WorldCatchUpProgress | null> {
    return null;
  }

  startBackgroundPulse(worldId: WorldId): void {
    this.stopBackgroundPulse();
    this.pollWorldId = worldId;
    const poll = () => {
      void this.getClock(this.pollWorldId)
        .then((clock) => this.deps.onClock?.(clock))
        .catch((err) => {
          console.warn(
            '[career] remote-clock poll fail:',
            err instanceof Error ? err.message : err,
          );
        });
    };
    poll();
    this.pollTimer = setInterval(poll, this.pollMs);
  }

  stopBackgroundPulse(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  async openCompanySession(
    opts: CompanySessionOpenOpts,
  ): Promise<CompanySessionOpenResult> {
    const res = await this.fetchImpl(this.sessionUrl(opts.companyId), {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        companyId: opts.companyId,
        worldId: opts.worldId,
        lastSeenTick: opts.lastSeenTick,
        serverNowMs: opts.serverNowMs,
      }),
    });
    if (!res.ok) {
      throw new Error(`Remote company session open failed (${res.status})`);
    }
    return (await res.json()) as CompanySessionOpenResult;
  }
}
