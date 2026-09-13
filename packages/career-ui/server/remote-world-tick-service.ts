/**
 * MP client stub — reads clock from a remote world host; never advances ticks.
 * Wire when a hosted world exists. SP keeps using LocalWorldTickService.
 */

import type {
  CompanySessionOpenOpts,
  CompanySessionOpenResult,
  WorldCatchUpProgress,
  WorldClockSnapshot,
  WorldId,
  WorldTickAdvanceOpts,
  WorldTickAdvanceResult,
  WorldTickService,
} from '@msfs-compat/shared';

export type RemoteWorldTickDeps = {
  /** Base URL of the world host, e.g. https://world.example.com */
  baseUrl: string;
  fetchImpl?: typeof fetch;
};

export class RemoteWorldTickService implements WorldTickService {
  readonly mode = 'mp-remote' as const;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly deps: RemoteWorldTickDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  async getClock(worldId: WorldId, nowMs = Date.now()): Promise<WorldClockSnapshot> {
    const url = new URL(
      `/worlds/${encodeURIComponent(worldId)}/clock`,
      this.deps.baseUrl,
    );
    url.searchParams.set('nowMs', String(nowMs));
    const res = await this.fetchImpl(url);
    if (!res.ok) {
      throw new Error(`Remote world clock failed (${res.status})`);
    }
    return (await res.json()) as WorldClockSnapshot;
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

  startBackgroundPulse(_worldId: WorldId): void {
    /* Client may poll getClock; it must not tick. */
  }

  stopBackgroundPulse(): void {}

  async openCompanySession(
    opts: CompanySessionOpenOpts,
  ): Promise<CompanySessionOpenResult> {
    const url = new URL(
      `/companies/${encodeURIComponent(opts.companyId)}/session/open`,
      this.deps.baseUrl,
    );
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
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
