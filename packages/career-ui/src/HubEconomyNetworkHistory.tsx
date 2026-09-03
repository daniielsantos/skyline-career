import { useEffect, useMemo, useState } from 'react';
import {
  fetchHubEconomyHistory,
  type HubEconomyHistoryBucket,
  type HubEconomyHistoryPulseView,
} from './api';
import { BusyBlock, BusyStatus } from './Busy';
import { HubEconomyLiveStrip } from './HubEconomyLiveStrip';
import { formatMass, KG_TO_LB, massUnitLabel, type WeightSystem } from './weight-units';

const HISTORY_PAGE_SIZE = 14;

type PulseLens = 'world' | 'BR' | 'US' | 'EU' | 'DE' | 'FR' | 'GB' | 'spoke';

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

/** Hubs with zero outbound lots (not the same as quiet). */
function deadHubs(b: HubEconomyHistoryBucket | null | undefined): number | null {
  if (!b || b.hubs <= 0) return null;
  return Math.max(0, b.hubs - (b.liveHubs ?? 0));
}

function countOrDash(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}

function bucketForLens(
  day: HubEconomyHistoryPulseView['days'][number],
  lens: PulseLens,
): HubEconomyHistoryBucket | null {
  if (lens === 'world') return day.world ?? null;
  if (lens === 'spoke') return day.byTier?.spoke ?? null;
  return day.byCountry?.[lens] ?? null;
}

function lensLabel(lens: PulseLens): string {
  if (lens === 'world') return 'World';
  if (lens === 'spoke') return 'Spoke';
  if (lens === 'EU') return 'EU-West';
  return lens;
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

function MetricCells(props: {
  bucket: HubEconomyHistoryBucket | null;
  weightSystem: WeightSystem;
}) {
  const b = props.bucket;
  return (
    <>
      <td>{pctRound(b?.avgCargoFillPct)}</td>
      <td>{pctRound(b?.softFillPct)}</td>
      <td>{formatMass(b?.inboundKg ?? 0, props.weightSystem)}</td>
      <td>{(b?.outboundLots ?? 0).toLocaleString('en-US')}</td>
      <td>{money(b?.payP50Usd)}</td>
      <td className="hub-pulse-pay-band">{payBand(b)}</td>
      <td>{formatSpot(b?.spotGeneralUsd, props.weightSystem)}</td>
      <td>{formatSpot(b?.spotElectronicsUsd, props.weightSystem)}</td>
      <td className="hub-pulse-size-mix">
        <code>{formatSizeMix(b)}</code>
      </td>
    </>
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
  const [lens, setLens] = useState<PulseLens>('world');
  const [pulse, setPulse] = useState<HubEconomyHistoryPulseView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);

  useEffect(() => {
    setHistoryPage(1);
  }, [windowDays, lens]);

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
  const rows = [...(pulse?.days ?? [])].reverse();
  const historyPageCount = Math.max(1, Math.ceil(rows.length / HISTORY_PAGE_SIZE));
  const safeHistoryPage = Math.min(historyPage, historyPageCount);
  const pagedRows = rows.slice(
    (safeHistoryPage - 1) * HISTORY_PAGE_SIZE,
    safeHistoryPage * HISTORY_PAGE_SIZE,
  );
  const chrono = pulse?.days ?? [];

  const sparkSeries = useMemo(() => {
    const live: Array<number | null> = [];
    const lots: Array<number | null> = [];
    const pay: Array<number | null> = [];
    const ga: Array<number | null> = [];
    const soft: Array<number | null> = [];
    const dead: Array<number | null> = [];
    for (const d of chrono) {
      const b = bucketForLens(d, lens);
      const spoke = d.byTier?.spoke;
      live.push(b?.liveHubPct != null ? b.liveHubPct * 100 : null);
      lots.push(b?.outboundLots ?? null);
      pay.push(b?.payP50Usd ?? null);
      soft.push(b?.softFillPct ?? null);
      ga.push(sizeMixLotPcts(b).ga);
      // Dead spoke count always tracks the spoke tier (diag number we care about).
      dead.push(
        lens === 'spoke' || lens === 'world'
          ? deadHubs(spoke)
          : deadHubs(b),
      );
    }
    return { live, lots, pay, ga, soft, dead };
  }, [chrono, lens]);

  const windowToggle = (
    <div className="hub-stats-window" role="group" aria-label="Network window">
      {([7, 30, 90] as const).map((d) => (
        <button
          key={d}
          type="button"
          className={windowDays === d ? 'active' : ''}
          onClick={() => setWindowDays(d)}
        >
          {d}d
        </button>
      ))}
    </div>
  );

  const lensToggle =
    layout === 'page' ? (
      <div className="hub-stats-window" role="group" aria-label="Pulse lens">
        {(['world', 'BR', 'US', 'EU', 'DE', 'FR', 'GB', 'spoke'] as const).map(
          (id) => (
            <button
              key={id}
              type="button"
              className={lens === id ? 'active' : ''}
              onClick={() => setLens(id)}
            >
              {lensLabel(id)}
            </button>
          ),
        )}
      </div>
    ) : null;

  const metricHeaders = (
    <>
      <th>Fill</th>
      <th title="Mean soft-fill = (stock + inbound) / capacity">Soft-fill</th>
      <th>Inbound</th>
      <th>Lots</th>
      <th>Pay p50</th>
      <th title="p10–p90 of per-hub pay p50 (hubs with a board)">Pay band</th>
      <th>General</th>
      <th>Electronics</th>
      <th title="Lot share GA / TP / Med / Narrow / Wide">Size mix</th>
    </>
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
        <BusyBlock label="Loading network history" />
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
          <div className="hub-pulse-toolbar-row">
            <p className="muted hub-stats-network-meta">
              {sampleDays} day{sampleDays === 1 ? '' : 's'} ·{' '}
              {(pulse?.hubSamples ?? 0).toLocaleString('en-US')} hub-rows
              {loading ? (
                <>
                  {' · '}
                  <BusyStatus label="Updating…" />
                </>
              ) : null}
              {layout === 'page'
                ? ` · Lens ${lensLabel(lens)} · Dead = hubs with 0 outbound lots · Quiet = activityScore < 8`
                : ''}
            </p>
            {lensToggle}
          </div>
          {layout === 'page' && chrono.length >= 2 ? (
            <div className="hub-pulse-sparks" aria-label="Trend sparklines">
              <Sparkline
                label={`${lensLabel(lens)} live`}
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
              <Sparkline
                label={
                  lens === 'spoke' || lens === 'world'
                    ? 'Spoke dead'
                    : 'Dead hubs'
                }
                values={sparkSeries.dead}
                format={(n) => Math.round(n).toLocaleString('en-US')}
              />
            </div>
          ) : null}
          <div className="table-wrap hub-pulse-table-wrap">
            <table className="hub-pulse-table">
              <thead>
                {lens === 'world' ? (
                  <tr>
                    <th>Day</th>
                    <th>Live</th>
                    <th>BR live</th>
                    <th>US live</th>
                    <th>EU live</th>
                    <th title="Spoke hubs with outbound lots > 0">Spoke live</th>
                    <th title="Spoke hubs with activityScore below 8">
                      Spoke quiet%
                    </th>
                    <th title="Spoke hubs with activityScore below 8 (count)">
                      Quiet N
                    </th>
                    <th title="Spoke hubs with zero outbound lots">Spoke dead</th>
                    {metricHeaders}
                  </tr>
                ) : (
                  <tr>
                    <th>Day</th>
                    <th>Live</th>
                    <th title="activityScore below 8">Quiet%</th>
                    <th title="Hubs with activityScore below 8">Quiet N</th>
                    <th title="Hubs with zero outbound lots">Dead N</th>
                    <th title="Hubs in this lens">Hubs</th>
                    {metricHeaders}
                  </tr>
                )}
              </thead>
              <tbody>
                {pagedRows.map((d) => {
                  const focus = bucketForLens(d, lens);
                  const br = d.byCountry?.BR;
                  const us = d.byCountry?.US;
                  const eu = d.byCountry?.EU;
                  const spoke = d.byTier?.spoke;
                  if (lens === 'world') {
                    return (
                      <tr key={d.dayIndex}>
                        <td>{d.dayIndex}</td>
                        <td>{pct01(focus?.liveHubPct)}</td>
                        <td>
                          {br && br.hubs > 0 ? pct01(br.liveHubPct) : '—'}
                        </td>
                        <td>
                          {us && us.hubs > 0 ? pct01(us.liveHubPct) : '—'}
                        </td>
                        <td>
                          {eu && eu.hubs > 0 ? pct01(eu.liveHubPct) : '—'}
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
                        <td>
                          {spoke && spoke.hubs > 0
                            ? countOrDash(spoke.quietHubs)
                            : '—'}
                        </td>
                        <td>{countOrDash(deadHubs(spoke))}</td>
                        <MetricCells
                          bucket={focus}
                          weightSystem={props.weightSystem}
                        />
                      </tr>
                    );
                  }
                  return (
                    <tr key={d.dayIndex}>
                      <td>{d.dayIndex}</td>
                      <td>
                        {focus && focus.hubs > 0
                          ? pct01(focus.liveHubPct)
                          : '—'}
                      </td>
                      <td>
                        {focus && focus.hubs > 0
                          ? pct01(focus.quietHubPct)
                          : '—'}
                      </td>
                      <td>
                        {focus && focus.hubs > 0
                          ? countOrDash(focus.quietHubs)
                          : '—'}
                      </td>
                      <td>{countOrDash(deadHubs(focus))}</td>
                      <td>
                        {focus && focus.hubs > 0
                          ? countOrDash(focus.hubs)
                          : '—'}
                      </td>
                      <MetricCells
                        bucket={focus}
                        weightSystem={props.weightSystem}
                      />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > HISTORY_PAGE_SIZE ? (
            <nav
              className="pagination hub-stats-pagination"
              aria-label="Network history pages"
            >
              <p>
                {rows.length === 0
                  ? '0 days'
                  : `${(safeHistoryPage - 1) * HISTORY_PAGE_SIZE + 1}–${Math.min(
                      safeHistoryPage * HISTORY_PAGE_SIZE,
                      rows.length,
                    )} of ${rows.length} days`}
              </p>
              <div>
                <button
                  type="button"
                  disabled={safeHistoryPage <= 1}
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span>
                  Page {safeHistoryPage} of {historyPageCount}
                </span>
                <button
                  type="button"
                  disabled={safeHistoryPage >= historyPageCount}
                  onClick={() =>
                    setHistoryPage((p) => Math.min(historyPageCount, p + 1))
                  }
                >
                  Next
                </button>
              </div>
            </nav>
          ) : null}
          {layout === 'page' ? (
            <p className="muted hub-stats-network-meta">
              Dead ≠ quiet: dead = 0 outbound lots; quiet = activityScore below 8.
              Size mix = GA/TP/Med/Nar/Wide lot%. Lens filters fill / pay / spots /
              size mix to that slice.
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
        <HubEconomyLiveStrip
          weightSystem={props.weightSystem}
          refreshToken={props.refreshToken}
        />
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
