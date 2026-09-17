import { useEffect, useState } from 'react';
import {
  fetchCharters,
  type CharterOfferView,
  type PlayerAircraft,
} from './api';
import { BusyChip, TableSkeleton } from './Busy';
import {
  formatCharterBoardSorts,
  withCharterFitSort,
  withCharterMetricPrimarySort,
  type CharterBoardSortKey,
  type CharterBoardSortLevel,
} from './charter-board-sort';
import {
  boardMoneyLabel,
  boardNetClassName,
  formatBoardDistanceNm,
} from './board-money';
import { IcaoLink } from './IcaoLink';

export const CHARTER_PAGE_SIZE = 10;

export type CharterLaneFilter = '' | 'intl' | 'domestic' | 'pilot-domestic';
export type CharterFitFilter = '' | 'open' | 'locked';

export function resolveBaseCharterOrigin(
  dispatcherOrigin: string,
  baseIcao: string,
): string {
  return dispatcherOrigin.trim().toUpperCase() || baseIcao.trim().toUpperCase();
}

export function charterExpiryLabel(ticksRemaining: number): string {
  const hours = Math.max(0, ticksRemaining) * 0.25;
  if (hours < 1) return `${Math.max(0, Math.ceil(hours * 60))} min`;
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)} h`;
  return `${Math.ceil(hours / 24)} d`;
}

/** Compact fit chip for compatible rows; incompatible reasons stay on the CTA title. */
export function charterFitLabel(offer: CharterOfferView): string {
  const fit = offer.fit;
  if (!fit) return '';
  if (!fit.compatible) return '';
  return fit.ferryRequired
    ? `Ferry ${Math.round(fit.ferryNm)} nm`
    : 'At origin';
}

/** Net cell — never call formatMoney on null (JSON NaN) or missing fit.netUsd. */
export function charterNetLabel(
  offer: CharterOfferView,
  formatMoney: (value: number) => string,
): string {
  return boardMoneyLabel(offer.fit?.netUsd, formatMoney);
}

type CharterBoardProps = {
  fleet: PlayerAircraft[];
  initialAircraftId?: string;
  /** Exact origin lock (Terminal outbound / Base dispatcher). */
  origin?: string;
  /** Exact destination lock (Terminal inbound). */
  dest?: string;
  busy?: boolean;
  formatMoney: (value: number) => string;
  formatMass: (kg: number) => string;
  onPrepare: (offer: CharterOfferView, aircraftId: string) => void;
  selectedOfferId?: string | null;
  onSelectOffer?: (offer: CharterOfferView | null) => void;
  onOpenAirport?: (icao: string) => void;
};

const SORT_TITLE =
  'Sort by this column. Click another column to add a sort level; click again to reverse or clear.';

export function CharterBoard(props: CharterBoardProps) {
  const parked = props.fleet.filter((aircraft) => aircraft.status === 'parked');
  const originLocked = props.origin !== undefined;
  const destLocked = props.dest !== undefined;
  const [aircraftId, setAircraftId] = useState(
    props.initialAircraftId && parked.some((a) => a.id === props.initialAircraftId)
      ? props.initialAircraftId
      : '',
  );
  const [originQuery, setOriginQuery] = useState('');
  const [destQuery, setDestQuery] = useState('');
  const [lane, setLane] = useState<CharterLaneFilter>('');
  const [fitFilter, setFitFilter] = useState<CharterFitFilter>('');
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [offers, setOffers] = useState<CharterOfferView[]>([]);
  const [sorts, setSorts] = useState<CharterBoardSortLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const originExact = originLocked
    ? (props.origin ?? '').trim().toUpperCase()
    : '';
  const destExact = destLocked ? (props.dest ?? '').trim().toUpperCase() : '';

  useEffect(() => {
    if (!aircraftId) return;
    if (parked.some((a) => a.id === aircraftId)) return;
    setAircraftId('');
  }, [aircraftId, parked]);

  useEffect(() => {
    setPage(1);
  }, [props.origin, props.dest]);

  useEffect(() => {
    if (!aircraftId && fitFilter) setFitFilter('');
  }, [aircraftId, fitFilter]);

  const hasFilters =
    (!originLocked && originQuery.trim() !== '') ||
    (!destLocked && destQuery.trim() !== '') ||
    lane !== '' ||
    fitFilter !== '' ||
    sorts.length > 0;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      void fetchCharters({
        origin: originExact || undefined,
        dest: destExact || undefined,
        originQuery: originLocked ? undefined : originQuery,
        destQuery: destLocked ? undefined : destQuery,
        lane: lane || undefined,
        fit: fitFilter || undefined,
        aircraftId,
        page,
        pageSize: CHARTER_PAGE_SIZE,
        sort: formatCharterBoardSorts(sorts),
      })
        .then((result) => {
          if (cancelled) return;
          setOffers(result.offers);
          setTotal(result.total);
          setPage(result.page);
          setPageCount(Math.max(1, result.pageCount));
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setOffers([]);
            setError(err instanceof Error ? err.message : String(err));
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    aircraftId,
    destExact,
    destLocked,
    destQuery,
    fitFilter,
    lane,
    originExact,
    originLocked,
    originQuery,
    page,
    sorts,
  ]);

  function toggleSort(key: CharterBoardSortKey) {
    setSorts((current) =>
      key === 'fit'
        ? withCharterFitSort(current)
        : withCharterMetricPrimarySort(current, key),
    );
    setPage(1);
  }

  function clearFilters() {
    if (!originLocked) setOriginQuery('');
    if (!destLocked) setDestQuery('');
    setLane('');
    setFitFilter('');
    setSorts([]);
    setPage(1);
  }

  function sortIndicator(key: CharterBoardSortKey): string {
    const index = sorts.findIndex((level) => level.key === key);
    if (index < 0) return '↕';
    const arrow = sorts[index]!.direction === 'asc' ? '↑' : '↓';
    return sorts.length > 1 ? `${index + 1}${arrow}` : arrow;
  }

  function ariaSort(
    key: CharterBoardSortKey,
  ): 'ascending' | 'descending' | 'none' | 'other' {
    const index = sorts.findIndex((level) => level.key === key);
    if (index < 0) return 'none';
    if (index > 0) return 'other';
    return sorts[0]!.direction === 'asc' ? 'ascending' : 'descending';
  }

  function SortTh(header: {
    columnKey: CharterBoardSortKey;
    label: string;
    className: string;
    title?: string;
    disabled?: boolean;
  }) {
    return (
      <th aria-sort={ariaSort(header.columnKey)} className={header.className}>
        <button
          type="button"
          className={`sort-header${
            sorts.some((l) => l.key === header.columnKey) ? ' is-sorted' : ''
          }`}
          title={header.title ?? SORT_TITLE}
          disabled={header.disabled}
          onClick={() => toggleSort(header.columnKey)}
        >
          {header.label} <span>{sortIndicator(header.columnKey)}</span>
        </button>
      </th>
    );
  }

  return (
    <div className="charter-board">
      <div className="board-aircraft charter-board-aircraft">
        <label className="board-aircraft-picker">
          Aircraft
          <select
            aria-label="Aircraft for Charter net estimate"
            value={aircraftId}
            disabled={parked.length === 0}
            onChange={(event) => {
              setAircraftId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">
              {parked.length === 0
                ? 'Gross pay (no aircraft)'
                : 'Gross pay only'}
            </option>
            {parked.map((aircraft) => (
              <option key={aircraft.id} value={aircraft.id}>
                {aircraft.label} · {aircraft.locationIcao}
              </option>
            ))}
          </select>
        </label>
        <span className="charter-count">{total} offers</span>
      </div>

      {error ? <p className="banner error">{error}</p> : null}
      <div
        className={`table-wrap freights-board-table charter-board-table${
          loading ? ' is-loading' : ''
        }`}
        aria-busy={loading}
      >
        {loading ? (
          <BusyChip
            className="freights-board-loading"
            label={offers.length === 0 ? 'Loading charters' : 'Updating charters'}
          />
        ) : null}
        <table className="charter-table">
          <thead>
            <tr>
              <th className="col-route">Route</th>
              <SortTh columnKey="distance" label="Distance" className="col-compact" />
              <SortTh columnKey="pax" label="Pax" className="col-compact" />
              <SortTh columnKey="baggage" label="Baggage" className="col-cargo" />
              <SortTh columnKey="expires" label="Expires" className="col-compact" />
              <SortTh columnKey="pay" label="Pay" className="col-money" />
              <SortTh
                columnKey="net"
                label="Net"
                className="col-money"
                disabled={!aircraftId}
                title={
                  aircraftId
                    ? 'Sort by estimated net (pay − ferry). Click another column to add a sort level.'
                    : 'Select an aircraft to estimate net'
                }
              />
              <SortTh
                columnKey="fit"
                label="Fit"
                className="col-access"
                disabled={!aircraftId}
                title={
                  aircraftId
                    ? 'Sort by Fit. Click for compatible-first, again for incompatible-first, again to clear.'
                    : 'Select an aircraft to sort by Fit'
                }
              />
            </tr>
            <tr className="filter-row">
              <th className="col-route">
                <div className="route-filter-stack">
                  <div className="route-filter-pair">
                    <input
                      type="search"
                      className="route-filter"
                      aria-label="Filter origin by ICAO or city"
                      placeholder="Origin"
                      value={originLocked ? originExact : originQuery}
                      disabled={originLocked}
                      title={
                        originLocked
                          ? `Locked to ${originExact}`
                          : 'Filter origin by ICAO or city'
                      }
                      onChange={(event) => {
                        setOriginQuery(event.target.value);
                        setPage(1);
                      }}
                    />
                    <input
                      type="search"
                      className="route-filter"
                      aria-label="Filter destination by ICAO or city"
                      placeholder="Dest"
                      value={destLocked ? destExact : destQuery}
                      disabled={destLocked}
                      title={
                        destLocked
                          ? `Locked to ${destExact}`
                          : 'Filter destination by ICAO or city'
                      }
                      onChange={(event) => {
                        setDestQuery(event.target.value);
                        setPage(1);
                      }}
                    />
                    <select
                      className="route-lane-filter"
                      aria-label="Filter by route scope"
                      value={lane}
                      onChange={(event) => {
                        const next = event.target.value;
                        setLane(
                          next === 'intl' ||
                            next === 'domestic' ||
                            next === 'pilot-domestic'
                            ? next
                            : '',
                        );
                        setPage(1);
                      }}
                    >
                      <option value="">Any route</option>
                      <option value="intl">Intl</option>
                      <option value="domestic">Domestic</option>
                      <option value="pilot-domestic">
                        Domestic · pilot country
                      </option>
                    </select>
                  </div>
                </div>
              </th>
              <th className="col-compact" />
              <th className="col-compact" />
              <th className="col-cargo" />
              <th className="col-compact" />
              <th className="col-money" />
              <th className="col-money" />
              <th className="col-access">
                <div className="access-filter-cell">
                  <select
                    aria-label="Filter by Fit"
                    value={fitFilter}
                    disabled={!aircraftId}
                    title={
                      aircraftId
                        ? 'Open = aircraft can take the charter (ferry OK). Locked = not compatible.'
                        : 'Select an aircraft to filter by Fit'
                    }
                    onChange={(event) => {
                      const next = event.target.value;
                      setFitFilter(
                        next === 'open' || next === 'locked' ? next : '',
                      );
                      setPage(1);
                    }}
                  >
                    <option value="">Any</option>
                    <option value="open">Open</option>
                    <option value="locked">Locked</option>
                  </select>
                  {hasFilters ? (
                    <button
                      type="button"
                      className="clear-filters"
                      onClick={clearFilters}
                      title={
                        sorts.length > 1
                          ? `Clear filters and reset ${sorts.length} sort levels`
                          : 'Clear filters and reset sort'
                      }
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && offers.length === 0 ? (
              <TableSkeleton rows={8} cols={8} lead="text" />
            ) : (
              <>
                {offers.map((offer) => {
                  const fit = offer.fit;
                  const fitLabel = charterFitLabel(offer);
                  const canPrepare =
                    Boolean(aircraftId) &&
                    offer.status === 'available' &&
                    fit?.compatible === true;
                  return (
                    <tr
                      key={offer.id}
                      className={[
                        props.onSelectOffer ? 'is-selectable' : '',
                        props.selectedOfferId === offer.id ? 'is-selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ') || undefined}
                      aria-selected={
                        props.onSelectOffer
                          ? props.selectedOfferId === offer.id
                          : undefined
                      }
                      onClick={
                        props.onSelectOffer
                          ? () =>
                              props.onSelectOffer?.(
                                props.selectedOfferId === offer.id ? null : offer,
                              )
                          : undefined
                      }
                    >
                      <td className="col-route">
                        <div className="route">
                          {props.onOpenAirport ? (
                            <>
                              <IcaoLink
                                icao={offer.originIcao}
                                name={offer.originName}
                                onOpen={props.onOpenAirport}
                                disabled={props.busy}
                              />
                              <span className="arrow">→</span>
                              <IcaoLink
                                icao={offer.destIcao}
                                name={offer.destName}
                                onOpen={props.onOpenAirport}
                                disabled={props.busy}
                              />
                            </>
                          ) : (
                            <strong>
                              {offer.originIcao} → {offer.destIcao}
                            </strong>
                          )}
                          {offer.urgency === 'urgent' ? (
                            <span className="tag">Urgent</span>
                          ) : null}
                          {offer.international ? (
                            <span className="tag" title="International charter">
                              intl
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="col-compact">
                        {formatBoardDistanceNm(offer.distanceNm)}
                      </td>
                      <td className="col-compact">{offer.paxCount}</td>
                      <td className="col-cargo">
                        {props.formatMass(offer.baggageKg)}
                      </td>
                      <td className="col-compact">
                        {charterExpiryLabel(offer.ticksRemaining)}
                      </td>
                      <td className="col-money pay">
                        <strong>
                          {boardMoneyLabel(offer.payUsd, props.formatMoney)}
                        </strong>
                      </td>
                      <td
                        className={`col-money ${boardNetClassName(fit?.netUsd)}`}
                      >
                        {charterNetLabel(offer, props.formatMoney)}
                      </td>
                      <td className="col-access">
                        {fitLabel ? (
                          <span className="charter-fit-ok">{fitLabel}</span>
                        ) : (
                          <span className="npc-badge-slot" aria-hidden="true" />
                        )}
                        <button
                          type="button"
                          className="accept"
                          disabled={props.busy || !canPrepare}
                          title={
                            fit && !fit.compatible
                              ? fit.reasons.join(' · ')
                              : !aircraftId
                                ? 'Select a parked aircraft'
                                : `Prepare ${offer.originIcao} → ${offer.destIcao}`
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            props.onPrepare(offer, aircraftId);
                          }}
                        >
                          Prepare
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!loading && offers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty">
                      No charter offers match.
                    </td>
                  </tr>
                ) : null}
              </>
            )}
          </tbody>
        </table>
      </div>
      <nav className="pagination" aria-label="Charter pages">
        <p>
          {total === 0
            ? '0 records'
            : `${(page - 1) * CHARTER_PAGE_SIZE + 1}–${Math.min(
                page * CHARTER_PAGE_SIZE,
                total,
              )} of ${total}`}
        </p>
        <div>
          <button
            disabled={page <= 1 || loading}
            onClick={() => setPage((v) => Math.max(1, v - 1))}
          >
            Previous
          </button>
          <span>
            Page {page} of {pageCount}
          </span>
          <button
            disabled={page >= pageCount || loading}
            onClick={() => setPage((v) => Math.min(pageCount, v + 1))}
          >
            Next
          </button>
        </div>
      </nav>
    </div>
  );
}
