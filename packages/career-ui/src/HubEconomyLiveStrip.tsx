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

const DOMESTIC_LENS_LABEL: Record<string, string> = {
  BR: 'BR',
  US: 'US',
  AM: 'Americas',
  EU: 'EU-West',
  EUR: 'Europe',
  MENA: 'MENA',
  AS: 'Asia',
  SEA: 'SE-Asia',
  AF: 'Africa',
  OC: 'Oceania',
  DE: 'DE',
  FR: 'FR',
  GB: 'GB',
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
            Intl {(pulse.intlSharePct * 100).toFixed(1)}% ·{' '}
            {pulse.internationalLanes.active.toLocaleString('en-US')} daily lanes ·{' '}
            {pulse.internationalLanes.connectedCountries} countries
            {pulse.internationalLanes.carryOver > 0
              ? ` · ${pulse.internationalLanes.carryOver} carry-over`
              : null}
          </span>
          {pulse.internationalLanes.distance ? (
            <span className="muted">
              Lanes ≤2500 nm{' '}
              {(pulse.internationalLanes.distance.regionalShare * 100).toFixed(0)}
              % · ≥4000 nm{' '}
              {(pulse.internationalLanes.distance.ultraShare * 100).toFixed(0)}%
              {pulse.internationalLanes.lots
                ? ` · lots ≤2000 ${(pulse.internationalLanes.lots.le2000Share * 100).toFixed(0)}% · ≤2500 ${(pulse.internationalLanes.lots.le2500Share * 100).toFixed(0)}% · ≥4000 ${(pulse.internationalLanes.lots.ultraShare * 100).toFixed(0)}%`
                : null}
            </span>
          ) : null}
        </div>
        <div className="hub-pulse-live-card">
          <span className="muted">Intl formation</span>
          <strong>
            {pulse.intlFormation
              ? `${(pulse.intlFormation.lanesMatchablePct * 100).toFixed(0)}% matchable`
              : '—'}
          </strong>
          <span className="muted">
            {pulse.intlFormation
              ? `${pulse.intlFormation.lanesMatchable.toLocaleString('en-US')} / ${pulse.intlFormation.lanesUndirected.toLocaleString('en-US')} OD · kg ${Math.round(pulse.intlFormation.boardKgOpen).toLocaleString('en-US')} / ${Math.round(pulse.intlFormation.boardKgTarget).toLocaleString('en-US')}`
              : 'No intlFormation payload'}
          </span>
          <span className="muted">
            {pulse.intlFormation
              ? [
                  pulse.intlFormation.skipAllByKg ? 'skipAll by kg' : null,
                  pulse.intlFormation.skipAllByCountSkus > 0
                    ? `${pulse.intlFormation.skipAllByCountSkus} SKU at lot quota`
                    : null,
                  pulse.intlFormation.skusWithNoMatchableLane > 0
                    ? `${pulse.intlFormation.skusWithNoMatchableLane} SKU 0-match`
                    : null,
                  !pulse.intlFormation.skipAllByKg &&
                  pulse.intlFormation.skipAllByCountSkus === 0 &&
                  pulse.intlFormation.skusWithNoMatchableLane === 0
                    ? 'room to form'
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : null}
          </span>
          {pulse.intlFormation?.rejects &&
          pulse.intlFormation.rejects.dirsTried > 0 ? (
            <span className="muted">
              {(() => {
                const r = pulse.intlFormation.rejects;
                const ranked: Array<[string, number]> = [
                  ['gap', r.rejectPriceGap],
                  ['feeder', r.rejectFeederFloor],
                  ['sat', r.rejectLaneSat],
                  ['maxLots', r.rejectMaxLots],
                  ['cap', r.rejectCapacity],
                  ['dryGap', r.rejectDryGap],
                  ['thinQty', r.rejectThinQty],
                  ['noSize', r.rejectNoSizePath],
                ];
                ranked.sort((a, b) => b[1] - a[1]);
                const top = ranked.filter(([, n]) => n > 0).slice(0, 2);
                const topTxt = top
                  .map(([k, n]) => `${k} ${n}`)
                  .join(' · ');
                return `dirs ${r.dirsTried} · canForm ${r.canForm}/${r.eligible}${topTxt ? ` · ${topTxt}` : ''}`;
              })()}
            </span>
          ) : null}
          {pulse.intlFormation?.shelf ? (
            <span className="muted">
              shelf {pulse.intlFormation.shelf.available.toLocaleString('en-US')}{' '}
              avail ·{' '}
              {pulse.intlFormation.shelf.reserved.toLocaleString('en-US')}{' '}
              reserved ·{' '}
              {pulse.intlFormation.shelf.inTransit.toLocaleString('en-US')}{' '}
              airborne
            </span>
          ) : null}
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
        <div className="hub-pulse-live-card">
          <span className="muted">Domestic size</span>
          <strong>
            {(() => {
              const lenses = pulse.domesticBoard?.lenses ?? [];
              const brD = lenses.find((l) => l.lensId === 'BR');
              const usD = lenses.find((l) => l.lensId === 'US');
              const fmt = (l: (typeof lenses)[number] | undefined) =>
                l && l.available > 0
                  ? `${pct01(l.largeShare)} large`
                  : '—';
              return `BR ${fmt(brD)} · US ${fmt(usD)}`;
            })()}
          </strong>
          <span className="muted">
            {(() => {
              const lenses = pulse.domesticBoard?.lenses ?? [];
              const brD = lenses.find((l) => l.lensId === 'BR');
              const usD = lenses.find((l) => l.lensId === 'US');
              const tip = (l: (typeof lenses)[number] | undefined, id: string) => {
                if (!l || l.available === 0) return `${id} —`;
                const sticky =
                  l.skusStickyLtl > 0
                    ? ` · sticky ${l.skusStickyLtl}`
                    : l.skusSkipAll > 0
                      ? ` · skipAll ${l.skusSkipAll}`
                      : '';
                return `${id} ${l.available.toLocaleString('en-US')} · ≤2t ${pct01(l.le2000Share)}${sticky}`;
              };
              return `${tip(brD, 'BR')} · ${tip(usD, 'US')}`;
            })()}
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

      {pulse.domesticBoard?.lenses?.length ? (
        <div className="hub-pulse-commodity-fill">
          <div className="hub-pulse-commodity-fill-head">
            <h4>Domestic board (Pulse lenses)</h4>
            <p className="muted">
              Available domestic lots by lens · ≤2t vs ≥2.2t mix · skipAll /
              sticky LTL (skipAll + 0 large). Same gates as formation.
            </p>
          </div>
          <div className="table-wrap hub-pulse-commodity-table-wrap">
            <table className="hub-pulse-commodity-table">
              <thead>
                <tr>
                  <th>Lens</th>
                  <th>Lots</th>
                  <th>≤2t</th>
                  <th>≥2.2t</th>
                  <th>skipAll</th>
                  <th>Sticky LTL</th>
                </tr>
              </thead>
              <tbody>
                {pulse.domesticBoard.lenses.map((lens) => {
                  const sticky = lens.skusStickyLtl > 0;
                  const thinLarge =
                    lens.available >= 50 &&
                    lens.le2000Share >= 0.95 &&
                    lens.largeShare === 0;
                  const alert = sticky || thinLarge;
                  return (
                    <tr
                      key={lens.lensId}
                      className={
                        alert
                          ? 'hub-pulse-commodity-row hub-pulse-live-warn'
                          : 'hub-pulse-commodity-row'
                      }
                    >
                      <th scope="row">
                        {DOMESTIC_LENS_LABEL[lens.lensId] ?? lens.lensId}
                      </th>
                      <td>{lens.available.toLocaleString('en-US')}</td>
                      <td>{pct01(lens.le2000Share)}</td>
                      <td>{pct01(lens.largeShare)}</td>
                      <td className="muted">
                        {lens.skusSkipAll > 0
                          ? `${lens.skusSkipAll} SKU · ${lens.countriesSkipAll}c`
                          : '—'}
                      </td>
                      <td
                        className={
                          sticky ? 'hub-pulse-commodity-alert' : 'muted'
                        }
                      >
                        {sticky
                          ? `${lens.skusStickyLtl} SKU · ${lens.countriesStickyLtl}c`
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

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
