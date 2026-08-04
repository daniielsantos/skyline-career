import { useState, type ReactNode } from 'react';
import { estimateSellBackUsd } from './aircraft-pricing';
import { FerryHubCombobox, type FerryHubOption } from './FerryHubCombobox';
import type { AircraftClass, AircraftListing, PlayerAircraft } from './api';

export type AircraftCatalogEntry = {
  id: AircraftClass;
  name: string;
  msrpUsd: number;
  leaseMonthlyUsd: number;
  maxCargoKg: number;
  maxRangeNm: number;
  /** Optional cruise burn (kg/h) when known for the listing airframe. */
  cruiseFuelFlowKgPerHour?: number;
  /** Optional cruise TAS (kt). */
  cruiseSpeedKt?: number;
  fuelBurnKgPerNm?: number;
};

export const AIRCRAFT_CLASS_FILTERS: Array<{
  id: '' | AircraftClass;
  label: string;
}> = [
  { id: '', label: 'All' },
  { id: 'light_ga', label: 'GA' },
  { id: 'light_turboprop', label: 'Turboprop' },
  { id: 'light_jet', label: 'Light jet' },
  { id: 'medium_piston', label: 'Med. piston' },
  { id: 'narrow_freighter', label: 'Narrow' },
  { id: 'wide_freighter', label: 'Wide' },
];

export function aircraftClassLabel(id: string): string {
  if (id === 'wide_freighter') return 'Wide';
  if (id === 'light_turboprop') return 'Light TP';
  if (id === 'light_jet') return 'Light jet';
  if (id === 'medium_piston') return 'Med. piston';
  if (id === 'light_ga') return 'Light GA';
  if (id === 'narrow_freighter') return 'Narrow';
  return id.replace(/_/g, ' ');
}

export function aircraftModelLabel(id: AircraftClass): string {
  if (id === 'wide_freighter') return 'McDonnell Douglas MD-11F';
  if (id === 'light_turboprop') return 'Cessna 208 Caravan Cargo';
  if (id === 'light_jet') return 'Learjet 35A';
  if (id === 'medium_piston') return 'Douglas DC-6';
  if (id === 'light_ga') return 'Beechcraft Bonanza BE36';
  return 'Boeing 737-800 BCF';
}

/**
 * Card hero art under career-ui/public/airframes/.
 * Keyed by Market typeId (plus common legacy aliases).
 */
const AIRFRAME_CARD_ART: Record<string, string> = {
  // A2A Piper Aerostar 600
  'a2a-piper-aerostar-600': '/airframes/aerostar-600.png',
  // A2A Piper PA-24 Comanche
  'a2a-piper-pa-24-250-comanche': '/airframes/comanche-pa24.png',
  // Cessna 152
  'asobo-cessna-c152': '/airframes/cessna-152.png',
  // Cessna 172SP family
  'asobo-c172sp-cargo': '/airframes/cessna-172.png',
  'asobo-c172sp-classic-cargo': '/airframes/cessna-172.png',
  'asobo-c172sp-g1000-cargo': '/airframes/cessna-172.png',
  'asobo-c172sp-classic-passengers': '/airframes/cessna-172.png',
  'asobo-c172sp-g1000-passengers': '/airframes/cessna-172.png',
  'asobo-c172sp-ifd-cargo': '/airframes/cessna-172.png',
  'asobo-c172sp-ifd-passengers': '/airframes/cessna-172.png',
  // Rockwell Commander 114
  'blacksquare-commander-114': '/airframes/commander-114.png',
  'blacksquare-commander-114tc': '/airframes/commander-114.png',
  // Learjet 35A family
  'flysimware-learjet-35a-cargo': '/airframes/learjet-35a.png',
  'flysimware-learjet-35a': '/airframes/learjet-35a.png',
  'flysimware-learjet-35a-passenger': '/airframes/learjet-35a.png',
  'flysimware-learjet-35a-passenger-long-range': '/airframes/learjet-35a.png',
  'flysimware-learjet-35a-cargo-long-range': '/airframes/learjet-35a.png',
  // F406 Caravan II
  'inibuilds-f406-caravan-ii-passenger': '/airframes/cessna-406.png',
  'inibuilds-f406-caravan-ii-cargo': '/airframes/cessna-406.png',
  // EMB-110 Bandeirante
  'nextgensim-emb-110p1f-bandeirante': '/airframes/emb-110-bandeirante.png',
  'nextgensim-emb-110-bandeirante': '/airframes/emb-110-bandeirante.png',
  // Saab 340
  'carenado-saab-340-passenger': '/airframes/saab-340.png',
  'microsoft-saab-340-cargo': '/airframes/saab-340.png',
};

export function airframeCardArtUrl(
  airframeTypeId: string | null | undefined,
): string | undefined {
  const id = airframeTypeId?.trim();
  if (!id) return undefined;
  return AIRFRAME_CARD_ART[id];
}

function conditionTone(pct: number): 'ok' | 'warn' | 'danger' {
  if (pct < 40) return 'danger';
  if (pct < 55) return 'warn';
  return 'ok';
}

function listingConditionPcts(listing: AircraftListing): {
  airframe: number;
  engine: number;
} {
  const mid =
    listing.condition === 'excellent'
      ? 95
      : listing.condition === 'good'
        ? 82
        : listing.condition === 'fair'
          ? 64
          : 45;
  const airframe =
    typeof listing.airframeConditionPct === 'number'
      ? listing.airframeConditionPct
      : listing.kind === 'new'
        ? 99
        : mid;
  const engine =
    typeof listing.engineConditionPct === 'number'
      ? listing.engineConditionPct
      : listing.kind === 'new'
        ? 100
        : Math.min(100, mid + (listing.condition === 'tired' ? 2 : 4));
  return { airframe, engine };
}

export function AircraftClassStripe(props: {
  aircraftClassId: AircraftClass | string;
  /** Optional hero art URL (public/). Falls back to class silhouette. */
  imageSrc?: string;
  imageAlt?: string;
  badges?: ReactNode;
}) {
  const hasArt = Boolean(props.imageSrc);
  return (
    <div
      className={`aircraft-card-stripe class-${props.aircraftClassId}${hasArt ? ' has-art' : ''}`}
      aria-hidden={hasArt ? undefined : 'true'}
    >
      {props.badges ? (
        <div className="aircraft-card-stripe-badges">{props.badges}</div>
      ) : null}
      {hasArt ? (
        <img
          className="aircraft-card-art"
          src={props.imageSrc}
          alt={props.imageAlt ?? ''}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="aircraft-silhouette" />
      )}
    </div>
  );
}

export function ConditionBars(props: {
  rows: Array<{
    label: string;
    pct: number;
    tone?: 'ok' | 'warn' | 'danger' | 'fuel';
  }>;
}) {
  return (
    <div className="aircraft-condition-bars">
      {props.rows.map((row) => {
        const tone = row.tone ?? conditionTone(row.pct);
        const clamped = Math.max(0, Math.min(100, row.pct));
        return (
          <div key={row.label} className="aircraft-condition-row">
            <span>{row.label}</span>
            <div
              className={`aircraft-bar${tone !== 'ok' ? ` tone-${tone}` : ''}`}
            >
              <span style={{ width: `${clamped}%` }} />
            </div>
            <span>{Math.round(clamped)}%</span>
          </div>
        );
      })}
    </div>
  );
}

function formatCargoShort(kg: number, formatMass: (kg: number) => string): string {
  return formatMass(kg);
}

export function MarketListingCard(props: {
  listing: AircraftListing;
  catalog?: AircraftCatalogEntry;
  wallet: number;
  busy: boolean;
  formatMoney: (n: number) => string;
  formatMass: (kg: number) => string;
  onOpenAirport: (icao: string) => void;
  onBuy: (listingId: string) => void;
  onLease: (listingId: string) => void;
}) {
  const { listing, catalog } = props;
  const pcts = listingConditionPcts(listing);
  const isYourLease = listing.source === 'player_lease';
  const isResale = listing.source === 'player_sale';
  const canAfford = props.wallet >= listing.askingUsd;

  return (
    <article className="aircraft-card">
      <AircraftClassStripe
        aircraftClassId={listing.aircraftClassId}
        imageSrc={airframeCardArtUrl(listing.airframeTypeId)}
        imageAlt={listing.label || aircraftModelLabel(listing.aircraftClassId)}
        badges={
          <>
            <span className={`badge badge-kind-${listing.kind}`}>{listing.kind}</span>
            {isYourLease ? (
              <span className="badge badge-player" title="Your lease listing — still in Hangar">
                yours
              </span>
            ) : isResale ? (
              <span
                className="badge badge-player"
                title="Trade-in from a player sell-back — same as other used stock"
              >
                resale
              </span>
            ) : null}
            <span className={`badge badge-cond-${listing.condition}`}>
              {listing.condition}
            </span>
          </>
        }
      />
      <div className="aircraft-card-body">
        <div className="aircraft-card-title">
          <strong>{listing.label || aircraftModelLabel(listing.aircraftClassId)}</strong>
          <div className="aircraft-card-meta">
            <span>{aircraftClassLabel(listing.aircraftClassId)}</span>
            <button
              type="button"
              className="icao-link"
              disabled={props.busy}
              onClick={() => props.onOpenAirport(listing.basedIcao)}
              title={`Open ${listing.basedIcao} terminal`}
            >
              {listing.basedIcao}
            </button>
            <span>
              {Math.round(listing.hoursAirframe)}/
              {Math.round(listing.hoursEngine)} h
            </span>
          </div>
        </div>
        <ul className="aircraft-card-specs">
          <li>
            <span>Cargo</span>
            <strong>
              {catalog
                ? formatCargoShort(catalog.maxCargoKg, props.formatMass)
                : '—'}
            </strong>
          </li>
          <li>
            <span>Range</span>
            <strong>
              {catalog ? `${catalog.maxRangeNm.toLocaleString()} nm` : '—'}
            </strong>
          </li>
          <li>
            <span>Cruise</span>
            <strong>
              {catalog?.cruiseSpeedKt != null
                ? `${catalog.cruiseSpeedKt} kt`
                : '—'}
            </strong>
          </li>
          <li>
            <span>Burn</span>
            <strong>
              {catalog?.cruiseFuelFlowKgPerHour != null
                ? `${catalog.cruiseFuelFlowKgPerHour.toLocaleString(undefined, {
                    maximumFractionDigits: 1,
                  })} kg/h`
                : catalog?.fuelBurnKgPerNm != null
                  ? `${catalog.fuelBurnKgPerNm} kg/nm`
                  : '—'}
            </strong>
          </li>
        </ul>
        <ConditionBars
          rows={[
            { label: 'Airframe', pct: pcts.airframe },
            { label: 'Engine', pct: pcts.engine },
          ]}
        />
      </div>
      <div className="aircraft-card-price">
        {listing.kind === 'lease' ? (
          <>
            <span className="price-main">{props.formatMoney(listing.askingUsd)}</span>
            <span className="price-term">deposit due now</span>
            {listing.leaseMonthlyUsd != null ? (
              <span className="price-sub">
                {props.formatMoney(listing.leaseMonthlyUsd)} / month
              </span>
            ) : null}
            {listing.leaseTermMonths != null ? (
              <span className="price-term">{listing.leaseTermMonths}-month term</span>
            ) : null}
          </>
        ) : (
          <span className="price-main">{props.formatMoney(listing.askingUsd)}</span>
        )}
        {listing.source === 'player_lease' ? (
          <span className="muted">Your listing</span>
        ) : listing.kind === 'lease' ? (
          <button
            type="button"
            className="accept"
            disabled={props.busy || !canAfford}
            onClick={() => props.onLease(listing.id)}
          >
            Lease
          </button>
        ) : (
          <button
            type="button"
            className="accept"
            disabled={props.busy || !canAfford}
            onClick={() => props.onBuy(listing.id)}
          >
            Buy
          </button>
        )}
      </div>
    </article>
  );
}

function hangarWhereLabel(acf: PlayerAircraft): string {
  switch (acf.status) {
    case 'parked':
      return 'Parked at';
    case 'assigned':
      return acf.assignedMissionId
        ? `Mission ${acf.assignedMissionId} ·`
        : 'Assigned ·';
    case 'maintenance':
      return 'AOG at';
    case 'listed':
      return 'Listed · based';
    case 'leased_out':
      return acf.leaseOut?.lesseeName
        ? `Leased to ${acf.leaseOut.lesseeName} · last seen`
        : 'Leased out · last seen';
    default:
      return 'At';
  }
}

function hangarStatusNote(acf: PlayerAircraft): string | null {
  switch (acf.status) {
    case 'assigned':
      return 'Finish or cancel the flight in Dispatch before moving this airframe.';
    case 'maintenance':
      return 'Pay inspection and/or repair before dispatch.';
    case 'listed':
      return 'Listed on Airframes — unlist to fly again.';
    case 'leased_out':
      return 'Returns with utilization wear when the term ends.';
    default:
      return null;
  }
}

export function HangarAircraftCard(props: {
  aircraft: PlayerAircraft;
  catalog?: AircraftCatalogEntry;
  busy: boolean;
  hubOptions: FerryHubOption[];
  ferryDest: string;
  travelDest: string;
  pilotIcao: string;
  ownedCount: number;
  hasListed: boolean;
  formatMoney: (n: number) => string;
  formatMass: (kg: number) => string;
  onOpenAirport: (icao: string) => void;
  onFerryDestChange: (icao: string) => void;
  onTravelDestChange: (icao: string) => void;
  onClearMaintenance: (id: string) => void;
  onRepair: (id: string) => void;
  onUnlist: (id: string) => void;
  onBuyout: (id: string) => void;
  onListForLease: (id: string) => void;
  onSell: (id: string) => void;
  onFerry: (id: string, dest: string) => void;
  onTravel: (destIcao: string) => void;
}) {
  const acf = props.aircraft;
  const catalog = props.catalog;
  const fuelPct =
    (acf.fuelKg / Math.max(1, acf.fuelCapacityKg)) * 100;
  const afPct = acf.airframeConditionPct ?? 100;
  const engPct = acf.engineConditionPct ?? 100;
  const inspLeft =
    acf.hoursSinceInspection != null && acf.maintenanceDueAtHours != null
      ? Math.max(
          0,
          Math.round((acf.maintenanceDueAtHours ?? 0) - (acf.hoursAirframe ?? 0)),
        )
      : null;
  const note = hangarStatusNote(acf);
  const canList =
    (acf.ownership ?? 'owned') === 'owned' &&
    acf.status === 'parked' &&
    props.ownedCount >= 2 &&
    !props.hasListed;
  const canSell =
    (acf.ownership ?? 'owned') === 'owned' &&
    (acf.status === 'parked' || acf.status === 'maintenance') &&
    props.ownedCount >= 2;
  const sellBackUsd = canSell ? estimateSellBackUsd(acf) : null;
  const canRepair =
    (acf.status === 'parked' || acf.status === 'maintenance') &&
    (afPct < 100 || engPct < 100);
  const canBuyout = acf.ownership === 'leased' && Boolean(acf.lease);
  const pilotHere =
    props.pilotIcao.trim().toUpperCase() ===
    acf.locationIcao.trim().toUpperCase();
  const pilotLabel = props.pilotIcao.trim().toUpperCase() || '—';
  const [moveMode, setMoveMode] = useState<'ferry' | 'pilot'>(
    pilotHere ? 'ferry' : 'pilot',
  );
  const showMove =
    acf.status === 'parked' || acf.status === 'maintenance';
  const showManage = canRepair || canList || canSell || canBuyout;

  const primaryAction =
    acf.status === 'maintenance'
      ? {
          label: 'Inspect',
          title: 'Pay inspection to clear AOG',
          onClick: () => props.onClearMaintenance(acf.id),
        }
      : acf.status === 'listed'
        ? {
            label: 'Unlist',
            title: 'Remove from Airframes market',
            onClick: () => props.onUnlist(acf.id),
          }
        : acf.status === 'parked' && !pilotHere
          ? {
              label: 'Travel here',
              title: `Travel to ${acf.locationIcao} (pilot reposition)`,
              onClick: () => props.onTravel(acf.locationIcao),
            }
          : null;

  const moveExcludeIcao =
    moveMode === 'ferry' ? acf.locationIcao : props.pilotIcao;
  const moveValue = moveMode === 'ferry' ? props.ferryDest : props.travelDest;
  const moveOnChange =
    moveMode === 'ferry' ? props.onFerryDestChange : props.onTravelDestChange;
  const moveReady = Boolean(moveValue?.trim());

  return (
    <li className="hangar-card">
      <AircraftClassStripe
        aircraftClassId={acf.aircraftClassId}
        imageSrc={airframeCardArtUrl(acf.airframeTypeId)}
        imageAlt={acf.label}
        badges={
          <>
            <span className={`status status-${acf.status}`}>{acf.status}</span>
            <span className="badge badge-ownership">
              {(acf.ownership ?? 'owned') === 'leased' ? 'leased' : 'owned'}
            </span>
            {!pilotHere ? (
              <span
                className="badge badge-warn"
                title={`Pilot is at ${pilotLabel} — travel here before dispatch`}
              >
                pilot away
              </span>
            ) : null}
          </>
        }
      />
      <div className="hangar-card-body">
        <div className="hangar-section hangar-section-title">
          <div className="aircraft-card-title">
            <strong>{acf.label}</strong>
            <div className="aircraft-card-meta">
              <span>{aircraftClassLabel(acf.aircraftClassId)}</span>
              {acf.condition ? (
                <span className={`badge badge-cond-${acf.condition}`}>
                  {acf.condition}
                </span>
              ) : null}
              {acf.leaseOverdue ? (
                <span className="badge badge-warn">lease overdue</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="hangar-section hangar-section-where">
          <p className="aircraft-card-section-label">Where</p>
          <div className="hangar-where-line">
            <span className="hangar-where-status">{hangarWhereLabel(acf)}</span>
            <button
              type="button"
              className="icao-link"
              disabled={props.busy}
              onClick={() => props.onOpenAirport(acf.locationIcao)}
              title={`Open ${acf.locationIcao} terminal`}
            >
              {acf.locationIcao}
            </button>
          </div>
          <div className="hangar-where-line hangar-where-pilot">
            Pilot {pilotHere ? 'here' : `at ${pilotLabel}`}
          </div>
        </div>

        <div className="hangar-section hangar-section-health">
          <p className="aircraft-card-section-label">Health</p>
          <ConditionBars
            rows={[
              { label: 'Fuel', pct: fuelPct, tone: 'fuel' },
              { label: 'Airframe', pct: afPct },
              { label: 'Engine', pct: engPct },
            ]}
          />
          <ul className="aircraft-card-specs">
            <li>
              <span>Fuel</span>
              <strong>
                {props.formatMass(acf.fuelKg)} /{' '}
                {props.formatMass(acf.fuelCapacityKg)}
              </strong>
            </li>
            <li>
              <span>Range</span>
              <strong>
                {catalog
                  ? `${catalog.maxRangeNm.toLocaleString()} nm`
                  : '—'}
              </strong>
            </li>
            <li>
              <span>Cruise</span>
              <strong>
                {catalog?.cruiseSpeedKt != null
                  ? `${catalog.cruiseSpeedKt} kt`
                  : '—'}
              </strong>
            </li>
            <li>
              <span>Burn</span>
              <strong>
                {catalog?.cruiseFuelFlowKgPerHour != null
                  ? `${catalog.cruiseFuelFlowKgPerHour.toLocaleString(undefined, {
                      maximumFractionDigits: 1,
                    })} kg/h`
                  : catalog?.fuelBurnKgPerNm != null
                    ? `${catalog.fuelBurnKgPerNm} kg/nm`
                    : '—'}
              </strong>
            </li>
            <li>
              <span>Hours</span>
              <strong>{Math.round(acf.hoursAirframe ?? 0)} AF</strong>
            </li>
            <li>
              <span>Inspect</span>
              <strong>
                {inspLeft != null ? `${inspLeft}h` : '—'}
              </strong>
            </li>
          </ul>
        </div>

        <div className="hangar-section hangar-section-money">
          <p className="aircraft-card-section-label">Money</p>
          <div className="aircraft-card-money">
            {acf.parkingUsdPerDay != null ? (
              <span>
                Parking {props.formatMoney(acf.parkingUsdPerDay)}/day at{' '}
                {acf.locationIcao}
              </span>
            ) : acf.status === 'assigned' ? (
              <span>Parking waived while assigned</span>
            ) : acf.status === 'leased_out' ? (
              <span>Parking waived while leased out</span>
            ) : acf.status === 'listed' ? (
              <span>Parking waived while listed</span>
            ) : (
              <span className="muted">No parking charge right now</span>
            )}
            {acf.lease ? (
              <>
                <span>
                  Lease {props.formatMoney(acf.lease.monthlyUsd)}/mo · next due
                  tick {acf.lease.nextDueTick}
                </span>
                {acf.lease.buyoutUsd != null ? (
                  <span>Buyout {props.formatMoney(acf.lease.buyoutUsd)}</span>
                ) : null}
              </>
            ) : null}
            {acf.leaseOut ? (
              <>
                <span>
                  Income {props.formatMoney(acf.leaseOut.monthlyUsd)}/mo
                  {acf.leaseOut.lesseeName
                    ? ` · ${acf.leaseOut.lesseeName}`
                    : ''}
                </span>
                <span>
                  Deposit held {props.formatMoney(acf.leaseOut.depositUsd)}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="hangar-footer">
        <div className="hangar-footer-primary">
          {primaryAction ? (
            <button
              type="button"
              className="accept hangar-primary"
              disabled={props.busy}
              title={primaryAction.title}
              onClick={primaryAction.onClick}
            >
              {primaryAction.label}
            </button>
          ) : null}
        </div>

        <div className="hangar-footer-move">
          {showMove ? (
            <div className="hangar-move">
              <div
                className="hangar-move-toggle"
                role="group"
                aria-label="Move mode"
              >
                <button
                  type="button"
                  className={moveMode === 'ferry' ? 'is-active' : undefined}
                  disabled={props.busy || acf.status !== 'parked'}
                  onClick={() => setMoveMode('ferry')}
                >
                  Aircraft
                </button>
                <button
                  type="button"
                  className={moveMode === 'pilot' ? 'is-active' : undefined}
                  disabled={props.busy}
                  onClick={() => setMoveMode('pilot')}
                >
                  Pilot
                </button>
              </div>
              <div className="hangar-move-row">
                <label className="staging-aircraft ferry-hub-label">
                  {moveMode === 'ferry' ? 'Ferry to' : 'Pilot to'}
                  <FerryHubCombobox
                    hubs={props.hubOptions}
                    excludeIcao={moveExcludeIcao}
                    value={moveValue}
                    onChange={moveOnChange}
                    disabled={
                      props.busy ||
                      (moveMode === 'ferry' && acf.status !== 'parked')
                    }
                  />
                </label>
                <button
                  type="button"
                  className="ghost hangar-move-go"
                  disabled={
                    props.busy ||
                    !moveReady ||
                    (moveMode === 'ferry' && acf.status !== 'parked')
                  }
                  onClick={() => {
                    if (moveMode === 'ferry') {
                      props.onFerry(acf.id, props.ferryDest);
                    } else {
                      props.onTravel(props.travelDest);
                    }
                  }}
                >
                  Go
                </button>
              </div>
            </div>
          ) : note ? (
            <p className="hangar-card-note">{note}</p>
          ) : null}
        </div>

        <div className="hangar-footer-manage">
          {showManage ? (
            <details className="hangar-manage">
              <summary>Manage</summary>
              <div className="hangar-manage-actions">
                {canRepair ? (
                  <button
                    type="button"
                    className="action ghost"
                    disabled={props.busy}
                    onClick={() => props.onRepair(acf.id)}
                  >
                    Repair
                  </button>
                ) : null}
                {canBuyout ? (
                  <button
                    type="button"
                    className="action ghost"
                    disabled={props.busy || acf.status === 'assigned'}
                    onClick={() => props.onBuyout(acf.id)}
                  >
                    Buy out
                  </button>
                ) : null}
                {canList ? (
                  <button
                    type="button"
                    className="action ghost"
                    disabled={props.busy}
                    onClick={() => props.onListForLease(acf.id)}
                  >
                    List for lease
                  </button>
                ) : null}
                {canSell ? (
                  <button
                    type="button"
                    className="action ghost"
                    disabled={props.busy}
                    title={`Dealer buy-back ${props.formatMoney(sellBackUsd ?? 0)}`}
                    onClick={() => props.onSell(acf.id)}
                  >
                    Sell · {props.formatMoney(sellBackUsd ?? 0)}
                  </button>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </li>
  );
}
