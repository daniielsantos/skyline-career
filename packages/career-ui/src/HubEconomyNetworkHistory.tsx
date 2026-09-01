import { useEffect, useMemo, useState } from 'react';
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

function pctRound(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n)}%`;
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

function sizeMixLotPcts(w: HubEconomyHistoryBucket | null | undefined): {
  ga: number | null;
  tp: number | null;
  medium: number | null;
  narrow: number | null;
  wide: number | null;
} {
  const total = lotTotalOf(w);
  const mix = w?.sizeMixLots;
  if (!mix || total <= 0) {
    return { ga: null, tp: null, medium: null, narrow: null, wide: null };
  }
  const pct = (n: number) => Math.round((n / total) * 100);
  return {
    ga: pct(mix.ga ?? 0),
    tp: pct(mix.tp ?? 0),
    medium: pct(mix.medium ?? 0),
    narrow: pct(mix.narrow ?? 0),
    wide: pct(mix.wide ?? 0),
  };
}

function formatSizeMix(w: HubEconomyHistoryBucket | null | undefined): string {
  const p = sizeMixLotPcts(w);
  if (p.ga == null) return '—';
  return `${p.ga}/${p.tp}/${p.medium}/${p.narrow}/${p.wide}`;
}

function payBand(w: HubEconomyHistoryBucket | null | undefined): string {
  if (w?.payP50Usd == null) return '—';
  if (w.payP10Usd == null || w.payP90Usd == null) return money(w.payP50Usd);
  return `${money(w.payP10Usd)}–${money(w.payP90Usd)}`;
}

/** Tiny SVG sparkline (oldest → newest). */
function Sparkline(props: {
  values: Array<number | null>;
  label: string;
  format?: (n: number) => string;
}) {
  const present = props.values
    .map((v, i) => (v == null || !Number.isFinite(v) ? null : { i, v }))
    .filter((p): p is { i: number; v: number } => p != null);
  if (present.length < 2) {
    return (
      <div className="hub-pulse-spark">
        <span className="muted">{props.label}</span>
        <span className="muted">—</span>
      </div>
    );
  }
  const vals = present.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(1e-9, max - min);
  const w = 120;
  const h = 28;
  const n = Math.max(1, props.values.length - 1);
  const points = present
    .map((p) => {
      const x = (p.i / n) * w;
      const y = h - ((p.v - min) / span) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const last = present[present.length - 1]!;
  const fmt = props.format ?? ((n: number) => String(Math.round(n)));
  return (
    <div className="hub-pulse-spark">
      <span className="muted">{props.label}</span>
      <svg
        className="hub-pulse-spark-svg"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${props.label} ${fmt(last.v)}`}
      >
        <polyline points={points} fill="none" />
      </svg>
      <strong>{fmt(last.v)}</strong>
    </div>
  );
}

/** Network-wide pulse from saved hub_economy_samples (not live world scan). */
export function HubEconomyNetworkHistory(props: {
  weightSystem: WeightSystem;
  refreshToken?: string | number;
  /** `page` = full-width panel body (dev Economy pulse). */
  layout?: 'card' | 'page';
}) {
  const layout = props.layout ?? 'card';
  const [windowDays, setWindowDays] = useState<7 | 30 | 90>(7);
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
  // Newest first for the table.
  const rows = [...(pulse?.days ?? [])].reverse();
  // Oldest → newest for sparklines.
  const chrono = pulse?.days ?? [];

  const sparkSeries = useMemo(() => {
    const live: Array<number | null> = [];
    const lots: Array<number | null> = [];
    const pay: Array<number | null> = [];
    const ga: Array<number | null> = [];
    const soft: Array<number | null> = [];
    for (const d of chrono) {
      const w = d.world;
      live.push(w?.liveHubPct != null ? w.liveHubPct * 100 : null);
      lots.push(w?.outboundLots ?? null);
      pay.push(w?.payP50Usd ?? null);
      soft.push(w?.softFillPct ?? null);
      const mix = sizeMixLotPcts(w);
      ga.push(mix.ga);
    }
    return { live, lots, pay, ga, soft };
  }, [chrono]);

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
      <button
        type="button"
        className={windowDays === 90 ? 'active' : ''}
        onClick={() => setWindowDays(90)}
      >
        90d
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
            {layout === 'page'
              ? ' · Size mix = GA/TP/Med/Nar/Wide lot% · Quiet = activityScore < 8'
              : ''}
          </p>
          {layout === 'page' && chrono.length >= 2 ? (
            <div className="hub-pulse-sparks" aria-label="Trend sparklines">
              <Sparkline
                label="World live"
                values={sparkSeries.live}
                format={(n) => `${Math.round(n)}%`}
              />
              <Sparkline
                label="Lots"
                values={sparkSeries.lots}
                format={(n) => Math.round(n).toLocaleString('en-US')}
              />
              <Sparkline label="Pay p50" values={sparkSeries.pay} format={money} />
              <Sparkline
                label="GA lot%"
                values={sparkSeries.ga}
                format={(n) => `${Math.round(n)}%`}
              />
              <Sparkline
                label="Soft-fill"
                values={sparkSeries.soft}
                format={(n) => `${Math.round(n)}%`}
              />
            </div>
          ) : null}
          <div className="table-wrap hub-pulse-table-wrap">
            <table className="hub-pulse-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>World live</th>
                  <th>BR live</th>
                  <th>US live</th>
                  <th
                    title="Share of spoke hubs with outbound lots > 0"
                  >
                    Spoke live
                  </th>
                  <th
                    title="Share of spoke hubs with activityScore below 8 (cold / dormant)"
                  >
                    Spoke quiet
                  </th>
                  <th>Fill</th>
                  <th title="Mean soft-fill = (stock + inbound) / capacity">
                    Soft-fill
                  </th>
                  <th>Inbound</th>
                  <th>Lots</th>
                  <th>Pay p50</th>
                  <th title="p10–p90 of per-hub pay p50 (hubs with a board)">
                    Pay band
                  </th>
                  <th>General</th>
                  <th>Electronics</th>
                  <th title="Lot share GA / TP / Med / Narrow / Wide">
                    Size mix
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const w = d.world;
                  const br = d.byCountry?.BR;
                  const us = d.byCountry?.US;
                  const spoke = d.byTier?.spoke;
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
                          ? pct01(spoke.liveHubPct)
                          : '—'}
                      </td>
                      <td>
                        {spoke && spoke.hubs > 0
                          ? pct01(spoke.quietHubPct)
                          : '—'}
                      </td>
                      <td>{pctRound(w?.avgCargoFillPct)}</td>
                      <td>{pctRound(w?.softFillPct)}</td>
                      <td>
                        {formatMass(w?.inboundKg ?? 0, props.weightSystem)}
                      </td>
                      <td>
                        {(w?.outboundLots ?? 0).toLocaleString('en-US')}
                      </td>
                      <td>{money(w?.payP50Usd)}</td>
                      <td className="hub-pulse-pay-band">{payBand(w)}</td>
                      <td>
                        {formatSpot(w?.spotGeneralUsd, props.weightSystem)}
                      </td>
                      <td>
                        {formatSpot(w?.spotElectronicsUsd, props.weightSystem)}
                      </td>
                      <td className="hub-pulse-size-mix">
                        <code>{formatSizeMix(w)}</code>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {layout === 'page' ? (
            <p className="muted hub-stats-network-meta">
              Size mix legend: GA ≤450 kg · TP · Med · Narrow · Wide (lot count
              share). Quiet = activityScore below 8, not “zero lots”.
            </p>
          ) : rows[0]?.world ? (
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
