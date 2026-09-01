import { useEffect, useState } from 'react';
import {
  fetchHubEconomyHistory,
  type HubEconomyHistoryBucket,
  type HubEconomyHistoryPulseView,
} from './api';
import { formatMass, KG_TO_LB, massUnitLabel, type WeightSystem } from './weight-units';

function pct01(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function formatSpot(
  usdPerKg: number | null | undefined,
  system: WeightSystem,
): string {
  if (usdPerKg == null || !Number.isFinite(usdPerKg)) return '—';
  const unit = massUnitLabel(system);
  const per = system === 'imperial' ? usdPerKg / KG_TO_LB : usdPerKg;
  const digits = per >= 10 ? 0 : per >= 1 ? 2 : 3;
  return `$${per.toFixed(digits)}/${unit}`;
}

function lotTotalOf(w: HubEconomyHistoryBucket | null | undefined): number {
  const mix = w?.sizeMixLots;
  if (!mix) return 0;
  return (
    (mix.ga ?? 0) +
    (mix.tp ?? 0) +
    (mix.medium ?? 0) +
    (mix.narrow ?? 0) +
    (mix.wide ?? 0)
  );
}

/** Network-wide pulse from saved hub_economy_samples (not live world scan). */
export function HubEconomyNetworkHistory(props: {
  weightSystem: WeightSystem;
  refreshToken?: string | number;
  /** `page` = full-width panel body (dev Economy pulse). `card` unused after Stats move. */
  layout?: 'card' | 'page';
}) {
  const layout = props.layout ?? 'card';
  const [windowDays, setWindowDays] = useState<7 | 30>(7);
  const [pulse, setPulse] = useState<HubEconomyHistoryPulseView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchHubEconomyHistory(windowDays)
      .then((data) => {
        if (!cancelled) {
          setPulse(data);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Keep last good pulse; surface the failure.
        setError(err instanceof Error ? err.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [windowDays, props.refreshToken]);

  const sampleDays = pulse?.sampleDays ?? pulse?.days?.length ?? 0;
  const rows = [...(pulse?.days ?? [])].reverse();

  const windowToggle = (
    <div className="hub-stats-window" role="group" aria-label="Network window">
      <button
        type="button"
        className={windowDays === 7 ? 'active' : ''}
        onClick={() => setWindowDays(7)}
      >
        7d
      </button>
      <button
        type="button"
        className={windowDays === 30 ? 'active' : ''}
        onClick={() => setWindowDays(30)}
      >
        30d
      </button>
    </div>
  );

  const body = (
    <>
      {layout === 'card' ? (
        <p className="muted hub-stats-card-hint">
          Saved daily samples across all hubs (BR / US / tiers). Builds after each
          economy day rollover + save.
        </p>
      ) : null}
      {loading && !pulse ? (
        <p className="muted">Loading network history…</p>
      ) : error && !pulse ? (
        <p className="muted" role="alert">
          {error}
        </p>
      ) : sampleDays === 0 ? (
        <p className="muted">
          No network samples yet — advance at least one economy day and save.
        </p>
      ) : (
        <>
          {error ? (
            <p className="muted" role="alert">
              Refresh failed: {error}
            </p>
          ) : null}
          <p className="muted hub-stats-network-meta">
            {sampleDays} day{sampleDays === 1 ? '' : 's'} ·{' '}
            {(pulse?.hubSamples ?? 0).toLocaleString('en-US')} hub-rows
            {loading ? ' · updating…' : ''}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Day</th>
                  <th>World live</th>
                  <th>BR live</th>
                  <th>US live</th>
                  <th>Spoke quiet</th>
                  <th>Fill</th>
                  <th>Lots</th>
                  <th>Pay p50</th>
                  <th>General spot</th>
                  <th>GA lot%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const w = d.world;
                  const br = d.byCountry?.BR;
                  const us = d.byCountry?.US;
                  const spoke = d.byTier?.spoke;
                  const lotTotal = lotTotalOf(w);
                  const gaLotPct =
                    lotTotal > 0 && w?.sizeMixLots
                      ? Math.round(((w.sizeMixLots.ga ?? 0) / lotTotal) * 100)
                      : null;
                  return (
                    <tr key={d.dayIndex}>
                      <td>{d.dayIndex}</td>
                      <td>{pct01(w?.liveHubPct)}</td>
                      <td>
                        {br && br.hubs > 0 ? pct01(br.liveHubPct) : '—'}
                      </td>
                      <td>
                        {us && us.hubs > 0 ? pct01(us.liveHubPct) : '—'}
                      </td>
                      <td>
                        {spoke && spoke.hubs > 0
                          ? pct01(spoke.quietHubPct)
                          : '—'}
                      </td>
                      <td>
                        {w?.avgCargoFillPct == null
                          ? '—'
                          : `${Math.round(w.avgCargoFillPct)}%`}
                      </td>
                      <td>
                        {(w?.outboundLots ?? 0).toLocaleString('en-US')}
                      </td>
                      <td>{money(w?.payP50Usd)}</td>
                      <td>
                        {formatSpot(w?.spotGeneralUsd, props.weightSystem)}
                      </td>
                      <td>{gaLotPct == null ? '—' : `${gaLotPct}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows[0]?.world ? (
            <p className="muted hub-stats-network-meta">
              Latest soft-fill{' '}
              {rows[0].world.softFillPct == null
                ? '—'
                : `${Math.round(rows[0].world.softFillPct)}%`}{' '}
              · inbound{' '}
              {formatMass(rows[0].world.inboundKg ?? 0, props.weightSystem)}{' '}
              · electronics spot{' '}
              {formatSpot(
                rows[0].world.spotElectronicsUsd,
                props.weightSystem,
              )}
            </p>
          ) : null}
        </>
      )}
    </>
  );

  if (layout === 'page') {
    return (
      <div className="hub-economy-pulse-body">
        <div className="hub-stats-history-head hub-economy-pulse-toolbar">
          <p className="muted hub-stats-card-hint">
            Source: <code>hub_economy_samples</code> · API{' '}
            <code>/api/debug/hub-economy-history</code>
          </p>
          {windowToggle}
        </div>
        {body}
      </div>
    );
  }

  return (
    <section className="hub-stats-card hub-stats-history">
      <div className="hub-stats-history-head">
        <h3>Network history</h3>
        {windowToggle}
      </div>
      {body}
    </section>
  );
}
