import { useMemo, useState } from 'react';
import { BusyBlock } from './Busy';
import type { HubStatsCommodityNow, HubStatsHistorySample, HubStatsView } from './api';
import {
  formatMass,
  KG_TO_LB,
  massUnitLabel,
  type WeightSystem,
} from './weight-units';

type HistoryWindow = 7 | 30;
type HistorySortKey = 'day' | 'lots' | 'pay' | 'fill' | 'spot';
type SortDir = 'asc' | 'desc';

/** Chart unlock — 2 days is enough for a price line. */
const PRICE_CHART_MIN_DAYS = 2;
const HISTORY_PAGE_SIZE = 4;

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function pct(n: number): string {
  return `${Math.round(n)}%`;
}

function formatSpotPerUnit(
  usdPerKg: number,
  system: WeightSystem,
  opts?: { digits?: number },
): string {
  if (!Number.isFinite(usdPerKg)) return '—';
  const unit = massUnitLabel(system);
  const perUnit =
    system === 'imperial' ? usdPerKg / KG_TO_LB : usdPerKg;
  const digits =
    opts?.digits ??
    (perUnit >= 10 ? 0 : perUnit >= 1 ? 2 : 3);
  return `$${perUnit.toFixed(digits)}/${unit}`;
}

function avgCargoFillPct(
  commodities: Array<{ id: string; fill: number }> | null | undefined,
): number {
  const cargo = (commodities ?? []).filter(
    (c) => c.id !== 'fuel' && c.id !== 'mro_parts',
  );
  if (cargo.length === 0) return 0;
  const sum = cargo.reduce(
    (s, c) => s + (Number.isFinite(c.fill) ? c.fill : 0),
    0,
  );
  return (sum / cargo.length) * 100;
}

/** Fixed-length window (oldest → newest); null = no sample that day. */
function padSeries<T extends { dayIndex: number }>(
  history: T[],
  windowDays: number,
  lastDay: number,
  pick: (row: T) => number | null,
): Array<{ dayIndex: number; value: number | null }> {
  const byDay = new Map(history.map((h) => [h.dayIndex, pick(h)] as const));
  const out: Array<{ dayIndex: number; value: number | null }> = [];
  for (let d = lastDay - windowDays + 1; d <= lastDay; d++) {
    const v = byDay.has(d) ? byDay.get(d)! : null;
    out.push({
      dayIndex: d,
      value: v == null || !Number.isFinite(v) ? null : v,
    });
  }
  return out;
}

function pickDefaultCommodityId(
  nowList: HubStatsCommodityNow[],
  history: HubStatsView['history'],
): string {
  const ids = nowList
    .filter((c) => c.kind !== 'mro')
    .map((c) => c.id);
  if (ids.includes('general')) return 'general';

  let bestId = ids[0] ?? 'general';
  let bestVar = -1;
  for (const id of ids) {
    const spots = history
      .map(
        (h) => h.commodities.find((c) => c.id === id)?.spotUsd ?? null,
      )
      .filter((v): v is number => v != null && Number.isFinite(v));
    if (spots.length < 2) continue;
    const min = Math.min(...spots);
    const max = Math.max(...spots);
    const spread = max - min;
    if (spread > bestVar) {
      bestVar = spread;
      bestId = id;
    }
  }
  return bestId;
}

type HistoryRow = {
  sample: HubStatsHistorySample;
  fillPct: number;
  spotUsd: number | null;
};

function SpotPriceChart(props: {
  series: Array<{ dayIndex: number; value: number | null }>;
  formatValue: (usdPerKg: number) => string;
  commodityName: string;
}) {
  const present = props.series
    .map((p, i) =>
      p.value == null ? null : { i, dayIndex: p.dayIndex, v: p.value },
    )
    .filter(
      (p): p is { i: number; dayIndex: number; v: number } => p != null,
    );

  if (present.length === 0) {
    return (
      <p className="muted hub-stats-spark-wait">
        No spot samples for {props.commodityName} in this window.
      </p>
    );
  }

  const values = present.map((p) => p.v);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const last = present[present.length - 1]!;
  const high = present.reduce((a, b) => (b.v >= a.v ? b : a));

  const yPad = (max - min) * 0.18 || max * 0.1 || 0.01;
  const yMin = Math.max(0, min - yPad);
  const yMax = max + yPad;
  const ySpan = Math.max(1e-9, yMax - yMin);

  // Tall + wide viewBox ≈ CSS box aspect so `meet` fills width without
  // letterboxing or stretching text.
  const w = 1120;
  const h = 360;
  const padL = 72;
  const padR = 28;
  const padT = 36;
  const padB = 36;
  const n = Math.max(1, props.series.length - 1);
  const xAt = (i: number) => padL + (i / n) * (w - padL - padR);
  const yAt = (v: number) =>
    padT + (1 - (v - yMin) / ySpan) * (h - padT - padB);

  const points = present
    .map((p) => `${xAt(p.i).toFixed(1)},${yAt(p.v).toFixed(1)}`)
    .join(' ');

  const yTicks = [yMin, (yMin + yMax) / 2, yMax];
  const firstDay = props.series[0]!.dayIndex;
  const lastDay = props.series[props.series.length - 1]!.dayIndex;

  // Current price lives in the header — only call out in-window High when it
  // isn't the latest point (avoids stacking labels on axes / day ticks).
  const showHigh =
    high.i !== last.i && high.v > last.v * 1.002;
  const highCx = showHigh ? xAt(high.i) : 0;
  const highCy = showHigh ? yAt(high.v) : 0;
  const highAnchor =
    highCx < padL + 80 ? 'start' : highCx > w - padR - 80 ? 'end' : 'middle';
  const highTy = Math.max(padT + 4, highCy - 16);

  return (
    <div className="hub-stats-price-chart">
      <div className="hub-stats-price-chart-head">
        <div>
          <strong>{props.commodityName}</strong>
          <span className="muted"> Spot price</span>
        </div>
        <strong className="hub-stats-price-now">
          {props.formatValue(last.v)}
        </strong>
      </div>
      <svg
        className="hub-stats-price-svg"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${props.commodityName} spot ${props.formatValue(last.v)}`}
      >
        {yTicks.map((t, idx) => (
          <g key={idx}>
            <line
              className="hub-stats-price-grid"
              x1={padL}
              x2={w - padR}
              y1={yAt(t)}
              y2={yAt(t)}
            />
            <text
              className="hub-stats-price-axis"
              x={padL - 10}
              y={yAt(t) + 4}
              textAnchor="end"
            >
              {props.formatValue(t).replace(/^\$/, '')}
            </text>
          </g>
        ))}
        <text
          className="hub-stats-price-axis"
          x={padL}
          y={h - 10}
          textAnchor="start"
        >
          Day {firstDay}
        </text>
        <text
          className="hub-stats-price-axis"
          x={w - padR}
          y={h - 10}
          textAnchor="end"
        >
          Day {lastDay}
        </text>
        {present.length >= 2 ? (
          <polyline
            className="hub-stats-price-line"
            points={points}
            fill="none"
          />
        ) : null}
        {present.map((p) => (
          <circle
            key={p.dayIndex}
            className="hub-stats-price-dot"
            cx={xAt(p.i)}
            cy={yAt(p.v)}
            r={p.i === last.i ? 4 : 2.8}
          >
            <title>
              Day {p.dayIndex}: {props.formatValue(p.v)}
            </title>
          </circle>
        ))}
        {showHigh ? (
          <g>
            <text
              className="hub-stats-price-anno"
              x={highCx}
              y={highTy}
              textAnchor={highAnchor}
            >
              {props.formatValue(high.v)}
            </text>
            <text
              className="hub-stats-price-anno-sub"
              x={highCx}
              y={highTy - 14}
              textAnchor={highAnchor}
            >
              High
            </text>
          </g>
        ) : null}
      </svg>
      <p className="muted hub-stats-price-range">
        Window {props.formatValue(min)} – {props.formatValue(max)}
      </p>
    </div>
  );
}

export function TerminalHubStatsPanel(props: {
  stats: HubStatsView | null;
  loading?: boolean;
  error?: string | null;
  icao: string;
  weightSystem: WeightSystem;
}) {
  const system = props.weightSystem;
  const unit = massUnitLabel(system);
  const [windowDays, setWindowDays] = useState<HistoryWindow>(7);
  const [commodityId, setCommodityId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<HistorySortKey>('day');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [historyPage, setHistoryPage] = useState(0);

  const now = props.stats?.now;
  const commodityOptions = useMemo(
    () => (now?.commodities ?? []).filter((c) => c.kind !== 'mro'),
    [now?.commodities],
  );

  const history = useMemo(() => {
    const rows = props.stats?.history ?? [];
    if (rows.length === 0) return [];
    const lastDay = rows[rows.length - 1]!.dayIndex;
    const minDay = lastDay - windowDays + 1;
    return rows.filter((r) => r.dayIndex >= minDay);
  }, [props.stats?.history, windowDays]);

  const lastHistoryDay =
    history.length > 0 ? history[history.length - 1]!.dayIndex : 0;

  const resolvedCommodityId = useMemo(() => {
    if (
      commodityId &&
      commodityOptions.some((c) => c.id === commodityId)
    ) {
      return commodityId;
    }
    return pickDefaultCommodityId(commodityOptions, history);
  }, [commodityId, commodityOptions, history]);

  const selectedCommodity = commodityOptions.find(
    (c) => c.id === resolvedCommodityId,
  );

  const spotSeries = useMemo(
    () =>
      padSeries(history, windowDays, lastHistoryDay, (h) => {
        const row = h.commodities.find((c) => c.id === resolvedCommodityId);
        return row?.spotUsd ?? null;
      }),
    [history, windowDays, lastHistoryDay, resolvedCommodityId],
  );

  const historyRows: HistoryRow[] = useMemo(
    () =>
      history.map((sample) => ({
        sample,
        fillPct: avgCargoFillPct(sample.commodities),
        spotUsd:
          sample.commodities.find((c) => c.id === resolvedCommodityId)
            ?.spotUsd ?? null,
      })),
    [history, resolvedCommodityId],
  );

  const sortedHistoryRows = useMemo(() => {
    const rows = [...historyRows];
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const av =
        sortKey === 'day'
          ? a.sample.dayIndex
          : sortKey === 'lots'
            ? a.sample.outboundLots
            : sortKey === 'pay'
              ? (a.sample.payP50Usd ?? -1)
              : sortKey === 'fill'
                ? a.fillPct
                : (a.spotUsd ?? -1);
      const bv =
        sortKey === 'day'
          ? b.sample.dayIndex
          : sortKey === 'lots'
            ? b.sample.outboundLots
            : sortKey === 'pay'
              ? (b.sample.payP50Usd ?? -1)
              : sortKey === 'fill'
                ? b.fillPct
                : (b.spotUsd ?? -1);
      if (av === bv) return (a.sample.dayIndex - b.sample.dayIndex) * dir;
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
    });
    return rows;
  }, [historyRows, sortKey, sortDir]);

  const historyPageCount = Math.max(
    1,
    Math.ceil(sortedHistoryRows.length / HISTORY_PAGE_SIZE),
  );
  const safeHistoryPage = Math.min(historyPage, historyPageCount - 1);
  const pagedHistoryRows = sortedHistoryRows.slice(
    safeHistoryPage * HISTORY_PAGE_SIZE,
    safeHistoryPage * HISTORY_PAGE_SIZE + HISTORY_PAGE_SIZE,
  );

  const sizeTotal =
    (now?.sizeMixKg?.ga ?? 0) +
    (now?.sizeMixKg?.tp ?? 0) +
    (now?.sizeMixKg?.medium ?? 0) +
    (now?.sizeMixKg?.narrow ?? 0) +
    (now?.sizeMixKg?.wide ?? 0);

  const showPriceChart = history.length >= PRICE_CHART_MIN_DAYS;
  const formatSpot = (usdPerKg: number) =>
    formatSpotPerUnit(usdPerKg, system);

  function toggleSort(key: HistorySortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'day' ? 'desc' : 'desc');
    }
    setHistoryPage(0);
  }

  function ariaSort(key: HistorySortKey): 'ascending' | 'descending' | 'none' {
    if (sortKey !== key) return 'none';
    return sortDir === 'asc' ? 'ascending' : 'descending';
  }

  function sortMark(key: HistorySortKey): string {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  return (
    <>
      <div className="panel-head">
        <div>
          <h2>Hub stats</h2>
          <p>
            Live radar for {props.icao}
            {props.stats?.hubLevel
              ? ` · L${props.stats.hubLevel.level}${
                  props.stats.hubLevel.quiet ? ' · quiet' : ''
                }`
              : ''}
          </p>
        </div>
      </div>

      {props.loading && !now ? (
        <BusyBlock label="Loading hub stats" />
      ) : props.error && !now ? (
        <p className="muted" role="alert">
          Could not load hub stats: {props.error}
        </p>
      ) : !now ? (
        <p className="muted">No stats for this hub yet.</p>
      ) : (
        <div className="hub-stats-grid">
          <section className="hub-stats-card">
            <h3>Terminal inventory</h3>
            <p className="muted hub-stats-card-hint">
              Fill % and spot at this hub
            </p>
            <ul className="hub-stats-commodity-list">
              {commodityOptions.map((c) => (
                <li key={c.id}>
                  <div className="hub-stats-commodity-head">
                    <strong>{c.name}</strong>
                    <span>
                      {pct(c.fillPct)} · {formatSpot(c.unitPriceUsd)}
                    </span>
                  </div>
                  <div className="fill-bar" aria-hidden>
                    <span style={{ width: `${Math.min(100, c.fillPct)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="hub-stats-card">
            <h3>Board outbound</h3>
            <dl className="hub-stats-dl">
              <div>
                <dt>Lots</dt>
                <dd>{now.outboundLots}</dd>
              </div>
              <div>
                <dt>Cargo</dt>
                <dd>{formatMass(now.outboundKg, system)}</dd>
              </div>
              <div>
                <dt>Pay p50</dt>
                <dd>{money(now.payP50Usd)}</dd>
              </div>
              <div>
                <dt>Jet-A</dt>
                <dd>{pct(now.jetAFillPct)}</dd>
              </div>
            </dl>
            <p className="muted hub-stats-size-mix">
              Size mix:{' '}
              {sizeTotal <= 0
                ? '—'
                : (
                    [
                      ['GA', now.sizeMixKg?.ga ?? 0],
                      ['TP', now.sizeMixKg?.tp ?? 0],
                      ['Med', now.sizeMixKg?.medium ?? 0],
                      ['Nar', now.sizeMixKg?.narrow ?? 0],
                      ['Wide', now.sizeMixKg?.wide ?? 0],
                    ] as const
                  )
                    .filter(([, kg]) => kg > 0)
                    .map(
                      ([label, kg]) =>
                        `${label} ${Math.round((kg / sizeTotal) * 100)}%`,
                    )
                    .join(' · ')}
            </p>
            <p className="muted">
              Soft-fill {pct(now.softFill?.fillPct ?? 0)} (
              {formatMass(now.softFill?.stockKg ?? 0, system)} stock +{' '}
              {formatMass(now.softFill?.inboundKg ?? 0, system)} inbound)
            </p>
          </section>

          <section className="hub-stats-card hub-stats-history">
            <div className="hub-stats-history-head">
              <h3>History</h3>
              <div
                className="hub-stats-window"
                role="group"
                aria-label="History window"
              >
                <button
                  type="button"
                  className={windowDays === 7 ? 'active' : ''}
                  onClick={() => {
                    setWindowDays(7);
                    setHistoryPage(0);
                  }}
                >
                  7d
                </button>
                <button
                  type="button"
                  className={windowDays === 30 ? 'active' : ''}
                  onClick={() => {
                    setWindowDays(30);
                    setHistoryPage(0);
                  }}
                >
                  30d
                </button>
              </div>
            </div>
            {history.length === 0 ? (
              <p className="muted">
                No daily samples yet — they appear after each economy day
                rollover (and a save).
              </p>
            ) : (
              <>
                <div
                  className="hub-stats-commodity-chips"
                  role="group"
                  aria-label="Commodity for spot history"
                >
                  {commodityOptions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={
                        c.id === resolvedCommodityId ? 'active' : ''
                      }
                      onClick={() => {
                        setCommodityId(c.id);
                        setHistoryPage(0);
                      }}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>

                {showPriceChart ? (
                  <SpotPriceChart
                    key={resolvedCommodityId}
                    series={spotSeries}
                    commodityName={selectedCommodity?.name ?? 'Spot'}
                    formatValue={formatSpot}
                  />
                ) : (
                  <p className="muted hub-stats-spark-wait">
                    Spot trend unlocks after {PRICE_CHART_MIN_DAYS} daily
                    samples ({history.length}/{PRICE_CHART_MIN_DAYS}).
                  </p>
                )}

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th aria-sort={ariaSort('day')}>
                          <button
                            type="button"
                            className="hub-stats-th-sort"
                            onClick={() => toggleSort('day')}
                          >
                            Day{sortMark('day')}
                          </button>
                        </th>
                        <th aria-sort={ariaSort('lots')}>
                          <button
                            type="button"
                            className="hub-stats-th-sort"
                            onClick={() => toggleSort('lots')}
                          >
                            Lots{sortMark('lots')}
                          </button>
                        </th>
                        <th aria-sort={ariaSort('pay')}>
                          <button
                            type="button"
                            className="hub-stats-th-sort"
                            onClick={() => toggleSort('pay')}
                          >
                            Pay p50{sortMark('pay')}
                          </button>
                        </th>
                        <th aria-sort={ariaSort('fill')}>
                          <button
                            type="button"
                            className="hub-stats-th-sort"
                            onClick={() => toggleSort('fill')}
                          >
                            Fill{sortMark('fill')}
                          </button>
                        </th>
                        <th aria-sort={ariaSort('spot')}>
                          <button
                            type="button"
                            className="hub-stats-th-sort"
                            onClick={() => toggleSort('spot')}
                          >
                            Spot ({unit}){sortMark('spot')}
                          </button>
                        </th>
                        <th>Quiet</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedHistoryRows.map((row) => (
                        <tr
                          key={`${row.sample.dayIndex}-${row.sample.tick}`}
                        >
                          <td>{row.sample.dayIndex}</td>
                          <td>{row.sample.outboundLots}</td>
                          <td>{money(row.sample.payP50Usd)}</td>
                          <td>{pct(row.fillPct)}</td>
                          <td>
                            {row.spotUsd == null
                              ? '—'
                              : formatSpot(row.spotUsd)}
                          </td>
                          <td>{row.sample.quiet ? 'yes' : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {sortedHistoryRows.length > HISTORY_PAGE_SIZE ? (
                  <nav
                    className="pagination hub-stats-pagination"
                    aria-label="History pages"
                  >
                    <p>
                      {sortedHistoryRows.length} day
                      {sortedHistoryRows.length === 1 ? '' : 's'}
                    </p>
                    <div>
                      <button
                        type="button"
                        disabled={safeHistoryPage <= 0}
                        onClick={() =>
                          setHistoryPage((p) => Math.max(0, p - 1))
                        }
                      >
                        Prev
                      </button>
                      <span>
                        {safeHistoryPage + 1} / {historyPageCount}
                      </span>
                      <button
                        type="button"
                        disabled={safeHistoryPage >= historyPageCount - 1}
                        onClick={() =>
                          setHistoryPage((p) =>
                            Math.min(historyPageCount - 1, p + 1),
                          )
                        }
                      >
                        Next
                      </button>
                    </div>
                  </nav>
                ) : null}
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
