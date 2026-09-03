import { useEffect, useMemo, useState } from 'react';
import {
  fetchEconomyPulse,
  type EconomyPulseCommodityView,
  type EconomyPulseView,
} from './api';
import { BusyBlock } from './Busy';
import { KG_TO_LB, massUnitLabel, type WeightSystem } from './weight-units';

const TICKS_PER_DAY = 96;

const COMMODITY_ORDER = [
  'general',
  'supplies',
  'electronics',
  'machinery',
  'perishables',
] as const;

const COMMODITY_LABEL: Record<string, string> = {
  general: 'General',
  supplies: 'Supplies',
  electronics: 'Electronics',
  machinery: 'Machinery',
  perishables: 'Perishables',
};

type FillAlert = 'ok' | 'dry' | 'sat' | 'blocked';

type CommodityFillRow = {
  commodity: EconomyPulseCommodityView;
  alert: FillAlert;
  hint: string;
};

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

function fillBand(
  p50: number | null | undefined,
  p10: number | null | undefined,
  p90: number | null | undefined,
): string {
  if (p50 == null) return '—';
  if (p10 == null || p90 == null) return pct01(p50);
  return `${Math.round(p10 * 100)}–${Math.round(p90 * 100)}% · p50 ${Math.round(p50 * 100)}%`;
}

function hubPressureHint(c: EconomyPulseCommodityView): string {
  return `${c.hubsShortage.toLocaleString('en-US')} short · ${c.hubsSurplus.toLocaleString('en-US')} surplus hubs`;
}

/** Advisory bands — dev pulse only; does not change sim. */
function commodityFillRow(c: EconomyPulseCommodityView): CommodityFillRow {
  const fill = c.fillP50;
  const pressure = hubPressureHint(c);

  if (c.hubsSurplus > 0 && c.availableLots === 0) {
    return {
      commodity: c,
      alert: 'blocked',
      hint: 'Surplus hubs but 0 board lots',
    };
  }
  if (c.hubsShortage > 0 && c.hubsSurplus === 0 && c.availableLots > 8) {
    return {
      commodity: c,
      alert: 'blocked',
      hint: 'Many lots but almost no surplus hubs',
    };
  }

  if (fill == null) {
    return { commodity: c, alert: 'ok', hint: pressure };
  }

  switch (c.commodityId) {
    case 'general':
      if (fill > 0.75) {
        return { commodity: c, alert: 'sat', hint: 'Saturated — pay pressure' };
      }
      if (fill < 0.4) {
        return { commodity: c, alert: 'dry', hint: 'Network stock thin' };
      }
      break;
    case 'supplies':
      if (fill < 0.15) {
        return { commodity: c, alert: 'dry', hint: 'Shortage pressure' };
      }
      if (fill > 0.7) {
        return { commodity: c, alert: 'sat', hint: 'High warehouse fill' };
      }
      break;
    case 'electronics':
    case 'machinery':
      if (fill < 0.12) {
        return { commodity: c, alert: 'dry', hint: 'Thin value inventory' };
      }
      if (fill > 0.85) {
        return { commodity: c, alert: 'sat', hint: 'Glut / weak arbitrage' };
      }
      break;
    case 'perishables':
      if (fill < 0.12) {
        return { commodity: c, alert: 'dry', hint: 'Thin cold-chain stock' };
      }
      if (fill > 0.8) {
        return { commodity: c, alert: 'sat', hint: 'Spoilage risk' };
      }
      break;
    default:
      break;
  }

  return { commodity: c, alert: 'ok', hint: pressure };
}

function alertClass(alert: FillAlert): string {
  if (alert === 'dry') return ' hub-pulse-live-warn';
  if (alert === 'sat') return ' hub-pulse-live-sat';
  if (alert === 'blocked') return ' hub-pulse-live-warn';
  return '';
}

const FOCUS_NOTES = /^(BR|US|[A-Z]{2}):/;

/** Live scan from `/api/debug/economy-pulse` (current world, not daily samples). */
export function HubEconomyLiveStrip(props: {
  weightSystem: WeightSystem;
  refreshToken?: string | number;
}) {
  const [pulse, setPulse] = useState<EconomyPulseView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchEconomyPulse()
      .then((data) => {
        if (!cancelled) {
          setPulse(data);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.refreshToken]);

  const commodityRows = useMemo(() => {
    if (!pulse) return [];
    const byId = new Map(pulse.commodities.map((c) => [c.commodityId, c]));
    return COMMODITY_ORDER.map((id) => {
      const c = byId.get(id);
      if (!c) return null;
      return commodityFillRow(c);
    }).filter((row): row is CommodityFillRow => row != null);
  }, [pulse]);

  const focusNotes = useMemo(() => {
    if (!pulse?.notes?.length) return [];
    const home = pulse.homeCountryId;
    return pulse.notes.filter(
      (n) =>
        FOCUS_NOTES.test(n) &&
        (n.startsWith('BR:') ||
          n.startsWith('US:') ||
          (home != null && n.startsWith(`${home}:`))),
    );
  }, [pulse]);

  const commodityNotes = useMemo(() => {
    if (!pulse?.notes?.length) return [];
    return pulse.notes.filter((n) =>
      COMMODITY_ORDER.some((id) => n.startsWith(`${id}:`)),
    );
  }, [pulse]);

  if (loading && !pulse) {
    return <BusyBlock label="Loading live pulse" />;
  }
  if (error && !pulse) {
    return (
      <p className="muted hub-pulse-live-error" role="alert">
        Live pulse: {error}
      </p>
    );
  }
  if (!pulse) return null;

  const day = Math.floor(pulse.tick / TICKS_PER_DAY);
  const br = pulse.countries.find((c) => c.countryId === 'BR');
  const us = pulse.countries.find((c) => c.countryId === 'US');
  const home = pulse.homeCountryId;
  const book = pulse.board;

  return (
    <section className="hub-pulse-live" aria-label="Live economy pulse">
      <div className="hub-pulse-live-head">
        <h3>Live now</h3>
        <p className="muted">
          Day {day} · tick {pulse.tick.toLocaleString('en-US')} ·{' '}
          <code>/api/debug/economy-pulse</code>
          {loading ? ' · refreshing…' : null}
        </p>
      </div>
      <div className="hub-pulse-live-grid">
        <div className="hub-pulse-live-card">
          <span className="muted">Board</span>
          <strong>{pulse.availableLots.toLocaleString('en-US')} lots</strong>
          <span className="muted">
            World pay p50 {money(pulse.payUsdP50)} · Player bookable p50{' '}
            {money(book.playerBookablePayUsdP50)} (
            {book.playerBookableLots.toLocaleString('en-US')} lots)
          </span>
          <span className="muted">
            Intl {(pulse.intlSharePct * 100).toFixed(1)}%
          </span>
        </div>
        <div className="hub-pulse-live-card">
          <span className="muted">NPC fleet</span>
          <strong>{pct01(pulse.npc.readyPct)} ready</strong>
          <span className="muted">
            {pulse.npc.fleetSize.toLocaleString('en-US')} /{' '}
            {pulse.npc.targetFleetSize.toLocaleString('en-US')} ·{' '}
            {pulse.npc.thinRegions} thin regions
          </span>
        </div>
        <div className="hub-pulse-live-card">
          <span className="muted">Live hubs</span>
          <strong>
            BR {br ? pct01(br.liveHubPct) : '—'} · US{' '}
            {us ? pct01(us.liveHubPct) : '—'}
          </strong>
          <span className="muted">
            Dead {br?.deadHubs ?? '—'} / {us?.deadHubs ?? '—'}
          </span>
        </div>
        <div className="hub-pulse-live-card hub-pulse-live-commodities">
          <span className="muted">Bookable GA pay</span>
          <strong>
            {formatSpot(book.generalBookablePayPerKgP50, props.weightSystem)}
          </strong>
          <span className="muted">
            Last-mile {pct01(book.generalLastMilePct)} of GA lots · BR{' '}
            {formatSpot(book.bookableGeneralPayPerKgP50.BR, props.weightSystem)}{' '}
            · US{' '}
            {formatSpot(book.bookableGeneralPayPerKgP50.US, props.weightSystem)}
            {home && home !== 'BR' && home !== 'US'
              ? ` · ${home} ${formatSpot(book.bookableGeneralPayPerKgP50[home], props.weightSystem)}`
              : ''}
          </span>
        </div>
      </div>

      <div className="hub-pulse-commodity-fill">
        <div className="hub-pulse-commodity-fill-head">
          <h4>Inventory fill (all commodities)</h4>
          <p className="muted">
            Median hub warehouse fill · shortage/surplus hub counts · board
            lots. Highlight = outside advisory band.
          </p>
        </div>
        <div className="table-wrap hub-pulse-commodity-table-wrap">
          <table className="hub-pulse-commodity-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Fill (p10–p90)</th>
                <th>Lots</th>
                <th>Pay / kg</th>
                <th>Hub pressure</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {commodityRows.map(({ commodity: c, alert, hint }) => (
                <tr
                  key={c.commodityId}
                  className={`hub-pulse-commodity-row${alertClass(alert)}`}
                >
                  <th scope="row">{COMMODITY_LABEL[c.commodityId] ?? c.commodityId}</th>
                  <td>{fillBand(c.fillP50, c.fillP10, c.fillP90)}</td>
                  <td>{c.availableLots.toLocaleString('en-US')}</td>
                  <td>{formatSpot(c.payPerKgP50, props.weightSystem)}</td>
                  <td className="muted">{hubPressureHint(c)}</td>
                  <td
                    className={
                      alert === 'ok' ? 'muted' : 'hub-pulse-commodity-alert'
                    }
                  >
                    {hint}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {commodityNotes.length > 0 || focusNotes.length > 0 ? (
        <ul className="hub-pulse-live-notes muted">
          {[...commodityNotes, ...focusNotes].slice(0, 8).map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="muted hub-pulse-live-error" role="alert">
          Refresh failed: {error}
        </p>
      ) : null}
    </section>
  );
}
