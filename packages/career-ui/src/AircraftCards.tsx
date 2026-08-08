import { useEffect, useRef, useState, type ReactNode } from 'react';
import { estimateSellBackUsd } from './aircraft-pricing';
import { FerryHubCombobox, type FerryHubOption } from './FerryHubCombobox';
import { FerryJourneyDialog } from './FerryJourneyDialog';
import {
  fetchFerryPlan,
  type AircraftClass,
  type AircraftListing,
  type FerryPlanView,
  type PlayerAircraft,
} from './api';
import {
  formatFuelBurnPerNm,
  formatFuelFlow,
  formatMassExact,
  type WeightSystem,
} from './weight-units';

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
  weightSystem?: WeightSystem;
  onOpenAirport: (icao: string) => void;
  delivery?: {
    deliverToIcao: string;
    distanceNm: number;
    deliveryFeeUsd: number;
    needed: boolean;
  } | null;
  /** When false, Lease is disabled (buy still works). */
  leaseUnlocked?: boolean;
  leaseLockReason?: string;
  onBuy: (listingId: string, opts?: { deliver?: boolean }) => void;
  onLease: (listingId: string, opts?: { deliver?: boolean }) => void;
}) {
  const { listing, catalog } = props;
  const weightSystem = props.weightSystem ?? 'metric';
  const pcts = listingConditionPcts(listing);
  const isYourLease = listing.source === 'player_lease';
  const isResale = listing.source === 'player_sale';
  const canDeliver = Boolean(props.delivery?.needed);
  const [deliver, setDeliver] = useState(canDeliver);
  const deliveryFee =
    deliver && props.delivery?.needed ? props.delivery.deliveryFeeUsd : 0;
  const totalDue = listing.askingUsd + deliveryFee;
  const canAfford = props.wallet >= totalDue;
  const leaseUnlocked = props.leaseUnlocked !== false;
  const leaseDisabled = props.busy || !canAfford || !leaseUnlocked;
  const leaseTitle = !leaseUnlocked
    ? (props.leaseLockReason ?? 'Lease locked')
    : !canAfford
      ? 'Not enough cash for deposit'
      : undefined;

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
                ? formatFuelFlow(catalog.cruiseFuelFlowKgPerHour, weightSystem)
                : catalog?.fuelBurnKgPerNm != null
                  ? formatFuelBurnPerNm(catalog.fuelBurnKgPerNm, weightSystem)
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
        {canDeliver && props.delivery ? (
          <label className="aircraft-card-deliver">
            <input
              type="checkbox"
              checked={deliver}
              disabled={props.busy}
              onChange={(e) => setDeliver(e.target.checked)}
            />
            <span>
              Deliver to {props.delivery.deliverToIcao}
              <span className="muted">
                {' '}
                · {props.delivery.distanceNm.toLocaleString()} nm · +
                {props.formatMoney(props.delivery.deliveryFeeUsd)}
              </span>
            </span>
          </label>
        ) : null}
      </div>
      <div className="aircraft-card-price">
        <div className="aircraft-card-price-details">
          <span className="price-main">
            {props.formatMoney(totalDue)}
          </span>
          {listing.kind === 'lease' ? (
            <>
              <span className="price-term">
                {deliveryFee > 0 ? 'deposit + delivery' : 'deposit due now'}
              </span>
              <span className="price-sub">
                {listing.leaseMonthlyUsd != null
                  ? `${props.formatMoney(listing.leaseMonthlyUsd)} / month`
                  : '—'}
              </span>
              <span className="price-term">
                {listing.leaseTermMonths != null
                  ? `${listing.leaseTermMonths}-month term`
                  : '—'}
              </span>
            </>
          ) : (
            <>
              <span className="price-term">
                {deliveryFee > 0 ? 'purchase + delivery' : 'purchase price'}
              </span>
              <span className="price-sub is-empty" aria-hidden="true">
                —
              </span>
              <span className="price-term is-empty" aria-hidden="true">
                —
              </span>
            </>
          )}
        </div>
        {listing.source === 'player_lease' ? (
          <span className="muted">Your listing</span>
        ) : listing.kind === 'lease' ? (
          <button
            type="button"
            className="accept"
            disabled={leaseDisabled}
            title={leaseTitle}
            onClick={() =>
              props.onLease(listing.id, { deliver: deliver && canDeliver })
            }
          >
            Lease
          </button>
        ) : (
          <button
            type="button"
            className="accept"
            disabled={props.busy || !canAfford}
            onClick={() =>
              props.onBuy(listing.id, { deliver: deliver && canDeliver })
            }
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
  weightSystem?: WeightSystem;
  onOpenAirport: (icao: string) => void;
  onFerryDestChange: (icao: string) => void;
  onTravelDestChange: (icao: string) => void;
  onClearMaintenance: (id: string) => void;
  onRepair: (id: string) => void;
  onUnlist: (id: string) => void;
  onBuyout: (id: string) => void;
  onReturnLease: (id: string) => void;
  onListForLease: (id: string) => void;
  onSell: (id: string) => void;
  onFerry: (
    id: string,
    dest: string,
    opts?: { finalDest?: string },
  ) => Promise<void>;
  /** Empty flown reposition (Dispatch/Watch) — recovery from bush/trip-only. */
  onEmptyFlight: (id: string, dest: string) => Promise<void>;
  onTravel: (destIcao: string) => void;
}) {
  const acf = props.aircraft;
  const catalog = props.catalog;
  const weightSystem = props.weightSystem ?? 'metric';
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
  const sellBackUsd = canSell
    ? estimateSellBackUsd(acf, { maxCargoKg: catalog?.maxCargoKg })
    : null;
  const canRepair =
    (acf.status === 'parked' || acf.status === 'maintenance') &&
    (afPct < 100 || engPct < 100);
  const canBuyout = acf.ownership === 'leased' && Boolean(acf.lease);
  const canReturnLease =
    canBuyout &&
    !acf.leaseOverdue &&
    (acf.status === 'parked' || acf.status === 'maintenance');
  const pilotHere =
    props.pilotIcao.trim().toUpperCase() ===
    acf.locationIcao.trim().toUpperCase();
  const pilotLabel = props.pilotIcao.trim().toUpperCase() || '—';
  const [moveMode, setMoveMode] = useState<'ferry' | 'pilot'>(
    pilotHere ? 'ferry' : 'pilot',
  );
  const [ferryPlan, setFerryPlan] = useState<FerryPlanView | null>(null);
  const [ferryPlanError, setFerryPlanError] = useState<string | null>(null);
  const [ferryPlanLoading, setFerryPlanLoading] = useState(false);
  const [ferryJourneyOpen, setFerryJourneyOpen] = useState(false);
  const [ferryJourneyFinal, setFerryJourneyFinal] = useState<string | null>(
    null,
  );
  const journeyOriginRef = useRef<string | null>(null);
  const showMove =
    acf.status === 'parked' || acf.status === 'maintenance';
  const showManage =
    canRepair || canList || canSell || canBuyout || canReturnLease;

  const ferryFinal = props.ferryDest.trim().toUpperCase();
  useEffect(() => {
    if (moveMode !== 'ferry' || acf.status !== 'parked' || !ferryFinal) {
      setFerryPlan(null);
      setFerryPlanError(null);
      setFerryPlanLoading(false);
      if (!ferryFinal) journeyOriginRef.current = null;
      return;
    }
    const here = acf.locationIcao.trim().toUpperCase();
    if (here === ferryFinal) {
      setFerryPlan(null);
      setFerryPlanError(null);
      journeyOriginRef.current = null;
      return;
    }
    if (!journeyOriginRef.current) {
      journeyOriginRef.current = here;
    }
    let cancelled = false;
    setFerryPlanLoading(true);
    setFerryPlanError(null);
    const timer = setTimeout(() => {
      void fetchFerryPlan({
        aircraftId: acf.id,
        destIcao: ferryFinal,
        journeyOrigin: journeyOriginRef.current ?? here,
      })
        .then((view) => {
          if (cancelled) return;
          setFerryPlan(view);
          setFerryPlanLoading(false);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setFerryPlan(null);
          setFerryPlanError(
            err instanceof Error ? err.message : String(err),
          );
          setFerryPlanLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [acf.id, acf.locationIcao, acf.status, ferryFinal, moveMode]);

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
  const ferryBlockedForBush =
    /ferry unavailable|flown mission/i.test(ferryPlanError ?? '');
  const destReady =
    Boolean(ferryFinal) &&
    ferryFinal !== acf.locationIcao.trim().toUpperCase();
  /** Empty Watch reposition — always offered when a dest is picked. */
  const emptyFlightReady =
    moveMode === 'ferry' && destReady && acf.status === 'parked';
  const ferryReady = Boolean(
    moveMode === 'ferry' &&
      destReady &&
      !ferryPlanLoading &&
      !ferryPlanError &&
      ferryPlan,
  );
  const moveReady = Boolean(
    moveMode === 'ferry' ? ferryReady || emptyFlightReady : moveValue?.trim(),
  );
  const multiLeg = Boolean(ferryPlan && ferryPlan.legCount > 1);

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
              <strong title={`${formatMassExact(acf.fuelKg, weightSystem)} / ${formatMassExact(acf.fuelCapacityKg, weightSystem)}`}>
                {formatMassExact(acf.fuelKg, weightSystem)} /{' '}
                {formatMassExact(acf.fuelCapacityKg, weightSystem)}
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
                  ? formatFuelFlow(catalog.cruiseFuelFlowKgPerHour, weightSystem)
                  : catalog?.fuelBurnKgPerNm != null
                    ? formatFuelBurnPerNm(catalog.fuelBurnKgPerNm, weightSystem)
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
                  {moveMode === 'ferry' ? 'Destination' : 'Travel to'}
                  <FerryHubCombobox
                    hubs={props.hubOptions}
                    excludeIcao={moveExcludeIcao}
                    value={moveValue}
                    onChange={(icao) => {
                      if (moveMode === 'ferry') {
                        journeyOriginRef.current = null;
                      }
                      moveOnChange(icao);
                    }}
                    disabled={
                      props.busy ||
                      (moveMode === 'ferry' && acf.status !== 'parked')
                    }
                  />
                </label>
                {moveMode === 'ferry' ? (
                  <>
                    <button
                      type="button"
                      className="ghost hangar-move-go"
                      disabled={
                        props.busy || !ferryReady || acf.status !== 'parked'
                      }
                      onClick={() => {
                        setFerryJourneyFinal(ferryFinal);
                        setFerryJourneyOpen(true);
                      }}
                      title={
                        ferryBlockedForBush
                          ? ferryPlanError ?? 'Instant ferry unavailable'
                          : multiLeg
                            ? `Open ferry journey · ${ferryPlan?.legCount} legs to ${ferryFinal}`
                            : `Instant ferry ${acf.locationIcao} → ${ferryFinal}`
                      }
                    >
                      {multiLeg && ferryReady
                        ? `Ferry · ${ferryPlan?.legCount} legs`
                        : 'Plan ferry'}
                    </button>
                    <button
                      type="button"
                      className="ghost hangar-move-go"
                      disabled={
                        props.busy ||
                        !emptyFlightReady ||
                        acf.status !== 'parked'
                      }
                      onClick={() =>
                        void props.onEmptyFlight(acf.id, ferryFinal)
                      }
                      title={`Empty Watch flight ${acf.locationIcao} → ${ferryFinal} (no contract)`}
                    >
                      Plan empty flight
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="ghost hangar-move-go"
                    disabled={props.busy || !moveReady}
                    onClick={() => props.onTravel(props.travelDest)}
                  >
                    Go
                  </button>
                )}
              </div>
              {moveMode === 'ferry' && ferryFinal ? (
                <div className="ferry-plan">
                  {ferryPlanLoading ? (
                    <p className="ferry-plan-meta">Planning route…</p>
                  ) : ferryPlanError ? (
                    <p className="ferry-plan-error" role="status">
                      {ferryPlanError}
                      {emptyFlightReady
                        ? ' · Plan empty flight still available.'
                        : ''}
                    </p>
                  ) : ferryPlan && ferryPlan.plan ? (
                    <>
                      <p className="ferry-plan-route" title={ferryPlan.plan.hops.join(' → ')}>
                        {ferryPlan.plan.hops.map((hop, i) => {
                          const here =
                            hop === acf.locationIcao.trim().toUpperCase();
                          const isNext = hop === ferryPlan.nextLeg?.to;
                          return (
                            <span key={`${hop}-${i}`}>
                              {i > 0 ? ' → ' : ''}
                              <span
                                className={
                                  here
                                    ? 'is-here'
                                    : isNext
                                      ? 'is-next'
                                      : undefined
                                }
                              >
                                {hop}
                              </span>
                            </span>
                          );
                        })}
                      </p>
                      <p className="ferry-plan-meta">
                        {multiLeg
                          ? `${ferryPlan.legCount} legs · ferry hops instantly, or fly empty in one Watch leg if in range`
                          : `Direct · ${ferryPlan.remainingNm.toLocaleString()} nm`}
                        {ferryPlan.nextQuote
                          ? ` · ferry next ${props.formatMoney(ferryPlan.nextQuote.totalCostUsd)}`
                          : ''}
                      </p>
                    </>
                  ) : null}
                </div>
              ) : null}
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
                {canReturnLease ? (
                  <button
                    type="button"
                    className="action ghost"
                    disabled={props.busy}
                    onClick={() => props.onReturnLease(acf.id)}
                  >
                    Return lease
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
      {ferryJourneyOpen && ferryJourneyFinal && acf.status === 'parked' ? (
        <FerryJourneyDialog
          aircraft={acf}
          finalDestIcao={ferryJourneyFinal}
          formatMoney={props.formatMoney}
          busy={props.busy}
          onClose={() => {
            setFerryJourneyOpen(false);
            setFerryJourneyFinal(null);
          }}
          onFlyLeg={async (legDest) => {
            await props.onFerry(acf.id, legDest, {
              finalDest: ferryJourneyFinal,
            });
          }}
        />
      ) : null}
    </li>
  );
}
