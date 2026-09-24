import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { listAirframeAddons } from './airframe-addons';
import { estimateFairUsd, estimateHoursMxCostMult, estimateLeaseOverdueAmountUsd, estimateLeaseOverdueWeeks, estimateOverhaulQuote, estimateSellBackUsd } from './aircraft-pricing';
import { FerryHubCombobox, type FerryHubOption } from './FerryHubCombobox';
import { IcaoLink } from './IcaoLink';
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
import { PLAYER_LEASE_OUT_ENABLED } from './feature-flags';

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
  /** Max charter seats when the SKU has a dispatch-ready passenger config. */
  passengerSeats?: number;
  /** Cargo + passenger glass share this Market SKU. */
  dualLayout?: boolean;
  /** Catalog default cabin role for new purchases. */
  defaultCabinRole?: 'cargo' | 'passenger';
};

export type HangarCabinStatus = {
  /** Active cabin role on this tail, when known. */
  activeRole?: 'cargo' | 'passenger';
  activeLabel?: string;
  passengerSeats: number;
  dualLayout: boolean;
  /** True when active cargo config blocks charter despite passenger glass on SKU. */
  charterNeedsPassenger: boolean;
};

/** Market card line — passenger seats (peer to Cargo). */
export function formatMarketCharterSpec(catalog: AircraftCatalogEntry | undefined): {
  value: string;
  title?: string;
} | null {
  const seats = catalog?.passengerSeats ?? 0;
  if (seats <= 0) return null;
  if (catalog?.dualLayout) {
    return {
      value: `${seats} · dual`,
      title:
        'dual = this SKU has two cabin configs (cargo glass + passenger glass), not the Cargo kg payload line. These seats are on the passenger glass — Charter Fit needs that config active.',
    };
  }
  return {
    value: String(seats),
    title:
      'Charter seat capacity on this cabin. Cargo kg is freight payload — this SKU has a single passenger config (no cargo glass switch).',
  };
}

/** Hangar card line — active cabin + charter readiness. */
export function formatHangarCabinSpec(status: HangarCabinStatus | undefined): {
  value: string;
  title?: string;
} | null {
  if (!status || status.passengerSeats <= 0) return null;
  if (status.charterNeedsPassenger) {
    return {
      value: `cargo · needs pax`,
      title:
        'Active config is cargo glass (not just freight payload). Switch to passenger glass — Charter Fit needs it on dual-layout families.',
    };
  }
  if (status.dualLayout && status.activeRole === 'passenger') {
    return {
      value: `${status.passengerSeats} pax`,
      title:
        'Passenger glass active — Charter Fit by seats and range. This family also has a separate cargo glass; Cargo kg is payload on either layout.',
    };
  }
  return {
    value: `${status.passengerSeats} pax`,
    title:
      'Charter seat capacity. Cargo kg is freight payload — single cabin config (no cargo glass switch).',
  };
}

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
  if (id === 'light_ga') return 'Bonanza A36/A36TC Professional';
  return 'Boeing 737-800 BCF';
}

/** Name / type / tail / base ICAO — not the class fallback (all TPs used to match "208"). */
export function aircraftListingMatchesQuery(
  listing: Pick<
    AircraftListing,
    'label' | 'airframeTypeId' | 'registration' | 'basedIcao'
  >,
  rawQuery: string,
): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    listing.label,
    listing.airframeTypeId,
    listing.registration,
    listing.basedIcao,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return q.split(/\s+/).every((token) => haystack.includes(token));
}

/** Hangar fleet filter — name, typeId, tail, parking ICAO, class label. */
export function hangarAircraftMatchesQuery(
  aircraft: Pick<
    PlayerAircraft,
    'label' | 'airframeTypeId' | 'registration' | 'locationIcao' | 'aircraftClassId'
  >,
  rawQuery: string,
  classLabel?: string,
): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    aircraft.label,
    aircraft.airframeTypeId,
    aircraft.registration,
    aircraft.locationIcao,
    aircraft.aircraftClassId,
    classLabel,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return q.split(/\s+/).every((token) => haystack.includes(token));
}

/**
 * Card hero art under career-ui/public/airframes/.
 * Keyed by Market typeId (plus common family / pack aliases).
 */
const AIRFRAME_CARD_ART: Record<string, string> = {
  // --- light_ga ---
  'blacksquare-baron-58-professional': '/airframes/baron-58.png',
  'blacksquare-baron-58p-professional': '/airframes/baron-58tc.png',
  'asobo-beech-baron-g58': '/airframes/baron-g58.png',
  'blacksquare-bonanza-professional': '/airframes/bonanza-be36.png',
  'asobo-beechcraft-bonanza': '/airframes/bonanza-g36.png',
  'blacksquare-b60-duke': '/airframes/duke-be60.png',
  'blackbox-bn2-islander-specialops-analogue': '/airframes/bn2-islander.png',
  'blackbox-bn2-islander-cargo-tip-tanks': '/airframes/bn2-islander.png',
  'blackbox-bn2-islander-passenger-analogue-tip-tanks': '/airframes/bn2-islander.png',
  'microsoft-c400-corvalis': '/airframes/c400-corvalis.png',
  'microsoft-404-titan': '/airframes/cessna-404-titan.png',
  'asobo-c172sp-cargo': '/airframes/cessna-172.png',
  'asobo-c172sp-classic-cargo': '/airframes/cessna-172.png',
  'asobo-c172sp-g1000-cargo': '/airframes/cessna-172.png',
  'asobo-c172sp-classic-passengers': '/airframes/cessna-172.png',
  'asobo-c172sp-g1000-passengers': '/airframes/cessna-172.png',
  'asobo-c172sp-ifd-cargo': '/airframes/cessna-172.png',
  'asobo-c172sp-ifd-passengers': '/airframes/cessna-172.png',
  'asobo-cessna-c152': '/airframes/cessna-152.png',
  'skyward-da50': '/airframes/da50.png',
  'justflight-just-flight-pa28-arrow-iii': '/airframes/pa28-arrow.png',
  'justflight-just-flight-pa28-warrior-ii': '/airframes/pa28-warrior.png',
  'a2a-piper-aerostar-600': '/airframes/aerostar-600.png',
  'a2a-piper-pa-24-250-comanche': '/airframes/comanche-pa24.png',
  'asobo-piper-pa28-236-dakota-standard': '/airframes/pa28-dakota.png',
  'asobo-robin-dr400': '/airframes/robin-dr400.png',
  'blacksquare-commander-114': '/airframes/commander-114.png',
  'blacksquare-commander-114tc': '/airframes/commander-114.png',
  'asobo-savage-norden': '/airframes/savage-norden.png',

  // --- light_jet ---
  'workingtitle-cessna-citation-longitude-passengers':
    '/airframes/citation-longitude.png',
  'flightfx-citation-x': '/airframes/citation-c750.png',
  'workingtitle-cessna-citation-cj4': '/airframes/citation-cj4.png',
  'skyward-cessna-c680': '/airframes/citation-sovereign.png',
  'flysimware-learjet-35a-cargo': '/airframes/learjet-35a.png',
  'flysimware-learjet-35a': '/airframes/learjet-35a.png',
  'flysimware-learjet-35a-passenger': '/airframes/learjet-35a.png',
  'flysimware-learjet-35a-passenger-long-range': '/airframes/learjet-35a.png',
  'flysimware-learjet-35a-cargo-long-range': '/airframes/learjet-35a.png',
  'workingtitle-microsoft-vision-jet-complete-seating':
    '/airframes/vision-jet-sf50.png',
  'microsoft-pc-24-cargo': '/airframes/pc-24.png',
  'microsoft-pc-24-vip': '/airframes/pc-24.png',
  'flightfx-mg-hjet-ha420': '/airframes/hondajet-ha420.png',
  'fsreborn-phenom-300e': '/airframes/phenom-300e.png',
  'contrail-contrail-falcon-50': '/airframes/falcon-50.png',

  // --- light_turboprop ---
  'asobo-beechcraft-king-air-350i': '/airframes/king-air-350i.png',
  'workingtitle-tbm-930-passengers': '/airframes/tbm-930.png',
  'blacksquare-b36tp-bonanza-professional': '/airframes/bonanza-b36tp.png',
  'blacksquare-turbine-duke': '/airframes/turbine-duke.png',
  'blacksquare-starship': '/airframes/starship.png',
  'c208-caravan-cargo': '/airframes/c208-caravan.png',
  'asobo-c208b-cargo': '/airframes/c208-caravan.png',
  'asobo-c208b-passengers': '/airframes/c208-caravan.png',
  'blacksquare-caravan-cargo-pod': '/airframes/c208-caravan.png',
  'blacksquare-caravan-professional-gear': '/airframes/c208-caravan.png',
  'blacksquare-caravan-professional-super-cargomaster':
    '/airframes/c208-caravan.png',
  'microsoft-c408-skycourier-cargo': '/airframes/c408-skycourier.png',
  'microsoft-c408-skycourier-passenger': '/airframes/c408-skycourier.png',
  'microsoft-atr-42-600': '/airframes/atr-42-600.png',
  'microsoft-atr-72-600': '/airframes/atr-72-600.png',
  'microsoft-dhc-6-300-twin-otter-wheels': '/airframes/dhc6-twin-otter.png',
  'nextgensim-emb-110p1f-bandeirante': '/airframes/emb-110-bandeirante.png',
  'nextgensim-emb-110-bandeirante': '/airframes/emb-110-bandeirante.png',
  'nextgensim-emb-110p-bandeirante': '/airframes/emb-110-bandeirante.png',
  'nextgensim-emb-110p1-bandeirante': '/airframes/emb-110-bandeirante.png',
  'nextgensim-emb-110p2-bandeirante': '/airframes/emb-110-bandeirante.png',
  'inibuilds-f406-caravan-ii-passenger': '/airframes/cessna-406.png',
  'inibuilds-f406-caravan-ii-cargo': '/airframes/cessna-406.png',
  'microsoft-king-air-c90-gtx-passengers': '/airframes/king-air-c90.png',
  'sws-kodiak-100-commuter-cargopod-tundra-wheels': '/airframes/kodiak-100.png',
  'sws-kodiak-100-cargo-tundra-wheels': '/airframes/kodiak-100.png',
  'sws-kodiak-100-cargo': '/airframes/kodiak-100.png',
  'sws-kodiak-100-combi-tundra-wheels': '/airframes/kodiak-100.png',
  'sws-kodiak-100-combi': '/airframes/kodiak-100.png',
  'sws-kodiak-100-commuter-tundra-wheels': '/airframes/kodiak-100.png',
  'sws-kodiak-100-commuter': '/airframes/kodiak-100.png',
  'sws-kodiak-100-summit-cargopod-tundra-wheels': '/airframes/kodiak-100.png',
  'sws-kodiak-100-summit-cargopod': '/airframes/kodiak-100.png',
  'sws-kodiak-100-summit-tundra-wheels': '/airframes/kodiak-100.png',
  'sws-kodiak-100-summit': '/airframes/kodiak-100.png',
  'microsoft-pc-12-ngx-passengers': '/airframes/pc-12-ngx.png',
  'microsoft-pc-12-ngx-vip': '/airframes/pc-12-ngx.png',
  'microsoft-pc-12ngx-cargo': '/airframes/pc-12-ngx.png',
  'carenado-saab-340-passenger': '/airframes/saab-340.png',
  'microsoft-saab-340-cargo': '/airframes/saab-340.png',
  'inibuilds-ys-11': '/airframes/ys-11.png',
  'blacksquare-tbm-850-feather-red': '/airframes/tbm-850.png',

  // --- medium_piston ---
  'microsoft-douglas-dc-3-metal-left': '/airframes/dc-3.png',
  'pmdg-dc6': '/airframes/dc-6.png',

  // --- narrow_freighter ---
  'leonardo-fly-the-maddog-x-md-82-20th': '/airframes/md-82.png',
  'leonardo-fly-the-maddog-x-md-83-20th': '/airframes/md-83.png',
  'leonardo-fly-the-maddog-x-md-88-20th': '/airframes/md-88.png',
  'blackbird-c-130j-long-configuration': '/airframes/c130j-long.png',
  'fenix-a319': '/airframes/fenix-a319.png',
  'fenix-a320': '/airframes/fenix-a320.png',
  'fenix-a321': '/airframes/fenix-a321.png',
  'justflight-fokker-f28': '/airframes/fokker-f28.png',
  'justflight-f70': '/airframes/fokker-f70.png',
  'justflight-f100': '/airframes/fokker-f100.png',
  'justflight-146-100': '/airframes/bae-146-100.png',
  'justflight-146-200': '/airframes/bae-146-200.png',
  'justflight-146-300': '/airframes/bae-146-300.png',
  'microsoft-a320neo-v2': '/airframes/a320neo-v2.png',
  'microsoft-a321lr': '/airframes/a321lr.png',
  'synaptic-a220-300': '/airframes/a220-300.png',
  'pmdg-738-bbj2-family': '/airframes/b738-bbj2.png',
  'pmdg-738-bcf-family': '/airframes/b738-bcf.png',
  'pmdg-738-pax-family': '/airframes/b738-pax.png',
  'asobo-737-max-8-passengers': '/airframes/737-max-8.png',
  'ifly-737-max-8': '/airframes/ifly-737-max-8.png',
  'ifly-737-max-8200': '/airframes/ifly-737-max-8.png',
  'inibuilds-boeing-b707-gns': '/airframes/b707-gns.png',

  // --- wide_freighter ---
  'tfdi-md11f-family': '/airframes/md-11f.png',
  'pmdg-777f': '/airframes/b777f.png',
  'pmdg-777-200lr': '/airframes/b777-200lr.png',
  'pmdg-777-200er': '/airframes/b777-200er.png',
  'pmdg-777-200er-rr': '/airframes/b777-200er.png',
  'pmdg-777-300er': '/airframes/b777-300er.png',
  'inibuilds-a350-900-default-cabin': '/airframes/a350-900.png',
  'inibuilds-a350-900-ulr': '/airframes/a350-900-ulr.png',
  'inibuilds-a350-1000-default-cabin': '/airframes/a350-1000.png',
  'inibuilds-a330-200': '/airframes/a330-200.png',
  'inibuilds-a330-300': '/airframes/a330-300.png',
  'inibuilds-a340-300': '/airframes/a340-300.png',
  'inibuilds-a300-600': '/airframes/a300-600.png',
  'inibuilds-l1011-500': '/airframes/l1011-500.png',
  'toliss-toliss-a346-pro-preset-pax': '/airframes/a346.png',
};

export function airframeCardArtUrl(
  airframeTypeId: string | null | undefined,
): string | undefined {
  const id = airframeTypeId?.trim();
  if (!id) return undefined;
  if (AIRFRAME_CARD_ART[id]) return AIRFRAME_CARD_ART[id];
  const family = id.replace(
    /-(highline-\d+|passenger|passengers|freighter|cargo|stol)$/i,
    '',
  );
  return family !== id ? AIRFRAME_CARD_ART[family] : undefined;
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
  /** Corner mark on the art (e.g. hangar maintenance wrench). */
  mark?: ReactNode;
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
      {props.mark ? (
        <div className="aircraft-card-stripe-mark">{props.mark}</div>
      ) : null}
    </div>
  );
}

/** Compact wrench mark — hangar card art when status is maintenance. */
function HangarMaintenanceMark(props: { title: string }) {
  return (
    <span className="hangar-mx-mark" title={props.title} aria-label={props.title}>
      <svg
        className="hangar-mx-mark-icon"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        aria-hidden="true"
        focusable="false"
      >
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
        />
      </svg>
    </span>
  );
}

/** Compact plane mark — hangar card art when the airframe is on a Dispatch mission. */
function HangarInFlightMark(props: { title: string }) {
  return (
    <span
      className="hangar-inflight-mark"
      title={props.title}
      aria-label={props.title}
    >
      <svg
        className="hangar-inflight-mark-icon"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        aria-hidden="true"
        focusable="false"
      >
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"
        />
      </svg>
    </span>
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

function formatAircraftRegistration(
  registration: string | undefined | null,
): string | null {
  if (typeof registration !== 'string') return null;
  const compact = registration.trim().toUpperCase();
  return compact.length >= 3 ? compact : null;
}

function hoursMxTooltip(mult: number): string {
  return `Maintenance cost ×${mult.toFixed(2)} from airframe/engine hours vs class life`;
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
    crossBorder?: boolean;
  } | null;
  /** When false, Lease is disabled (buy still works unless classUnlocked is false). */
  leaseUnlocked?: boolean;
  leaseLockReason?: string;
  /** When false, Buy and Lease are disabled for this class. */
  classUnlocked?: boolean;
  classLockReason?: string;
  onBuy: (listingId: string, opts?: { deliver?: boolean }) => void;
  onLease: (listingId: string, opts?: { deliver?: boolean }) => void;
}) {
  const { listing, catalog } = props;
  const hoursMxMult = estimateHoursMxCostMult(listing);
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
  const classUnlocked = props.classUnlocked !== false;
  const leaseUnlocked = props.leaseUnlocked !== false;
  const isImport = Boolean(props.delivery?.crossBorder);
  const buyDisabled = props.busy || !canAfford || !classUnlocked;
  const leaseDisabled =
    props.busy || !canAfford || !leaseUnlocked || !classUnlocked;
  const buyTitle = !classUnlocked
    ? (props.classLockReason ?? 'Class locked')
    : !canAfford
      ? 'Not enough cash'
      : undefined;
  const leaseTitle = !classUnlocked
    ? (props.classLockReason ?? 'Class locked')
    : !leaseUnlocked
      ? (props.leaseLockReason ?? 'Lease locked')
      : !canAfford
        ? 'Not enough cash for deposit'
        : undefined;
  const registration = formatAircraftRegistration(listing.registration);

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
          <div className="aircraft-card-title-row">
            <strong>{listing.label || aircraftModelLabel(listing.aircraftClassId)}</strong>
            <AirframeAddonInfo
              airframeTypeId={listing.airframeTypeId}
              label={listing.label || aircraftModelLabel(listing.aircraftClassId)}
            />
          </div>
          {registration ? (
            <div className="aircraft-card-registration">{registration}</div>
          ) : null}
          <div className="aircraft-card-meta">
            <span>{aircraftClassLabel(listing.aircraftClassId)}</span>
            <IcaoLink
              icao={listing.basedIcao}
              onOpen={props.onOpenAirport}
              disabled={props.busy}
            />
            <span title={hoursMxTooltip(hoursMxMult)}>
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
          {(() => {
            const charter = formatMarketCharterSpec(catalog);
            if (!charter) return null;
            return (
              <li>
                <span>Pax</span>
                <strong title={charter.title}>{charter.value}</strong>
              </li>
            );
          })()}
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
              {isImport ? 'Import to' : 'Deliver to'} {props.delivery.deliverToIcao}
              <span className="muted">
                {' '}
                · {props.delivery.distanceNm.toLocaleString()} nm · +
                {props.formatMoney(props.delivery.deliveryFeeUsd)}
              </span>
            </span>
          </label>
        ) : null}
        {isImport && !canDeliver ? (
          <p className="aircraft-card-import-note muted">
            Buy here — aircraft stays abroad until you ferry it home.
          </p>
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
                  ? `${props.formatMoney(listing.leaseMonthlyUsd)} / week`
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
                {deliveryFee > 0
                  ? isImport
                    ? 'purchase + import'
                    : 'purchase + delivery'
                  : isImport
                    ? 'purchase abroad'
                    : 'purchase price'}
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
            {props.busy ? 'Leasing…' : 'Lease'}
          </button>
        ) : (
          <button
            type="button"
            className="accept"
            disabled={buyDisabled}
            title={buyTitle}
            onClick={() =>
              props.onBuy(listing.id, { deliver: deliver && canDeliver })
            }
          >
            {props.busy ? 'Buying…' : 'Buy'}
          </button>
        )}
      </div>
    </article>
  );
}

function hangarWhereLabel(
  acf: PlayerAircraft,
  missionRoute?: { originIcao: string; destIcao: string } | null,
): string {
  switch (acf.status) {
    case 'parked':
      return 'Parked at';
    case 'assigned':
      return missionRoute
        ? `${missionRoute.originIcao} → ${missionRoute.destIcao} ·`
        : 'On mission ·';
    case 'maintenance':
      return acf.overhaulKind ? 'Shop at' : 'AOG at';
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

function hangarStatusBadgeLabel(acf: PlayerAircraft): string {
  if (acf.status === 'maintenance' && acf.overhaulKind) {
    return acf.overhaulKind === 'engine' ? 'engine OH' : 'airframe OH';
  }
  return acf.status;
}

/** Mirror shared CRITICAL_CONDITION_PCT — hangar copy only. */
const HANGAR_CRITICAL_CONDITION_PCT = 40;
const HANGAR_HOURS_PER_TICK = 0.25;
const HANGAR_HOURS_PER_DAY = 24;

function formatHangarDurationHours(hours: number): string {
  if (!(hours > 0)) return '0h';
  if (hours < 1) {
    const m = Math.max(1, Math.round(hours * 60));
    return `${m}m`;
  }
  const totalHours = Math.round(hours);
  if (totalHours < HANGAR_HOURS_PER_DAY) return `${totalHours}h`;
  const days = Math.floor(totalHours / HANGAR_HOURS_PER_DAY);
  const rem = totalHours % HANGAR_HOURS_PER_DAY;
  return rem === 0 ? `${days}d` : `${days}d ${rem}h`;
}

function hangarOverhaulRemainingLabel(
  acf: PlayerAircraft,
  opts?: { economyTick?: number; economyClock?: number },
): string | null {
  if (!acf.overhaulKind) return null;
  const ready =
    typeof acf.overhaulReadyAtTick === 'number'
      ? acf.overhaulReadyAtTick
      : null;
  if (ready == null) return null;
  const now = opts?.economyClock ?? opts?.economyTick ?? 0;
  const ticksLeft = Math.max(0, ready - Math.max(0, now));
  if (ticksLeft <= 0) return 'ready soon';
  return `${formatHangarDurationHours(ticksLeft * HANGAR_HOURS_PER_TICK)} left`;
}

function hangarStatusNote(
  acf: PlayerAircraft,
  opts?: {
    economyTick?: number;
    economyClock?: number;
    formatClock?: (tick: number) => string;
    mutationsLocked?: boolean;
  },
): string | null {
  switch (acf.status) {
    case 'assigned':
      // Badge + corner plane mark cover this — skip Where prose.
      return null;
    case 'maintenance':
      // Overhaul ETA lives on the status badge (`engine OH · Nh left`) — skip
      // the Where prose so the card stays as tight as a parked airframe.
      if (acf.overhaulKind) return null;
      if (opts?.mutationsLocked) {
        return 'AOG — not timed. Owner must Inspect / Repair on this Hangar before anyone can fly it.';
      }
      {
        const critical =
          (acf.airframeConditionPct ?? 100) < HANGAR_CRITICAL_CONDITION_PCT ||
          (acf.engineConditionPct ?? 100) < HANGAR_CRITICAL_CONDITION_PCT;
        return critical
          ? 'AOG — not timed. Pay Inspect, then Repair until airframe/engine are above 40%.'
          : 'AOG — not timed. Pay Inspect to clear and fly again.';
      }
    case 'listed':
      return 'Listed on Airframes — unlist to fly again.';
    case 'leased_out':
      return 'Returns with utilization wear when the term ends.';
    case 'ferry':
      return acf.npcFerry
        ? `Line crew ferry to ${acf.npcFerry.destIcao} — delayed hop leftover; parks there on next Hangar refresh after world update.`
        : 'Line crew ferry in progress.';
    default:
      return null;
  }
}

export function ListSaleAskBody(props: {
  fairUsd: number;
  dealerUsd: number;
  minAsk: number;
  maxAsk: number;
  formatMoney: (n: number) => string;
  onChange: (askingUsd: number) => void;
}) {
  const [ask, setAsk] = useState(props.fairUsd);
  return (
    <>
      <p>
        Fair {props.formatMoney(props.fairUsd)} · dealer cash now{' '}
        {props.formatMoney(props.dealerUsd)}. No payment until someone buys.
      </p>
      <p>
        Asking price ({props.formatMoney(props.minAsk)}–
        {props.formatMoney(props.maxAsk)})
      </p>
      <input
        type="number"
        min={props.minAsk}
        max={props.maxAsk}
        step={100}
        value={ask}
        onChange={(event) => {
          const n = Number(event.target.value);
          setAsk(n);
          if (Number.isFinite(n)) props.onChange(n);
        }}
      />
    </>
  );
}

export function ListLeaseAskBody(props: {
  catalogMonthlyUsd: number;
  minMonthly: number;
  maxMonthly: number;
  minTerm: number;
  maxTerm: number;
  formatMoney: (n: number) => string;
  onChange: (next: { monthlyUsd: number; termMonths: number }) => void;
}) {
  const [monthly, setMonthly] = useState(props.catalogMonthlyUsd);
  const [term, setTerm] = useState(3);
  const deposit = Math.round(monthly * 4);
  return (
    <>
      <p>
        Catalog {props.formatMoney(props.catalogMonthlyUsd)}/wk. NPC typically
        accepts ~70–130% of that and 1–3 month terms. Deposit is four weeks (
        {props.formatMoney(deposit)}).
      </p>
      <p>
        Weekly ({props.formatMoney(props.minMonthly)}–
        {props.formatMoney(props.maxMonthly)})
      </p>
      <input
        type="number"
        min={props.minMonthly}
        max={props.maxMonthly}
        step={50}
        value={monthly}
        onChange={(event) => {
          const n = Number(event.target.value);
          setMonthly(n);
          if (Number.isFinite(n)) props.onChange({ monthlyUsd: n, termMonths: term });
        }}
      />
      <p>
        Term months ({props.minTerm}–{props.maxTerm})
      </p>
      <input
        type="number"
        min={props.minTerm}
        max={props.maxTerm}
        step={1}
        value={term}
        onChange={(event) => {
          const n = Number(event.target.value);
          setTerm(n);
          if (Number.isFinite(n)) {
            props.onChange({ monthlyUsd: monthly, termMonths: n });
          }
        }}
      />
    </>
  );
}

export function HangarAircraftCard(props: {
  aircraft: PlayerAircraft;
  catalog?: AircraftCatalogEntry;
  cabinStatus?: HangarCabinStatus;
  busy: boolean;
  hubOptions: FerryHubOption[];
  /** One-shot prefill when App navigates to Hangar with a target dest. */
  preferredFerryDest?: string;
  ferrySeedToken?: number;
  pilotIcao: string;
  ownedCount: number;
  hasListed: boolean;
  formatMoney: (n: number) => string;
  formatMass: (kg: number) => string;
  /** Economy tick for lease due / overdue copy. */
  economyTick?: number;
  /** Fractional economy clock for live overhaul remaining (optional). */
  economyClock?: number;
  /** Optional clock formatter for next-due ticks. */
  formatClock?: (tick: number) => string;
  weightSystem?: WeightSystem;
  onOpenAirport: (icao: string) => void;
  onClearMaintenance: (id: string) => void;
  onRepair: (id: string) => void;
  onOverhaul: (id: string, which: 'engine' | 'airframe') => void;
  onUnlist: (id: string) => void;
  onBuyout: (id: string) => void;
  onPayLeaseOverdue: (id: string) => void;
  onReturnLease: (id: string) => void;
  onListForLease: (id: string) => void;
  onListForSale: (id: string) => void;
  onSell: (id: string) => void;
  onFerry: (
    id: string,
    dest: string,
    opts?: { finalDest?: string },
  ) => Promise<void>;
  /** Empty flown reposition (Dispatch/Watch) — recovery from bush/trip-only. */
  onEmptyFlight: (id: string, dest: string) => Promise<void>;
  onTravel: (destIcao: string) => void;
  /** Open freight route when the airframe is actually assigned. */
  missionRoute?: { originIcao: string; destIcao: string } | null;
  /** VA pilot hangar — hide sell/lease/MX mutations; ferry stays. */
  mutationsLocked?: boolean;
  /** VA hangar aircraft reservation controls. */
  vaReserve?: {
    viewerAccountId: string | null;
    isOwner: boolean;
    labelByAccountId: Record<string, string>;
    /** True when this airframe's open mission is in_flight. */
    inFlight: boolean;
    onReserve: (aircraftId: string) => void | Promise<void>;
    onRelease: (aircraftId: string) => void | Promise<void>;
  };
  /** Dual-tenant: ferry-plan company when chrome ≠ airframe owner. */
  opsCompanyId?: string;
}) {
  const acf = props.aircraft;
  const catalog = props.catalog;
  const weightSystem = props.weightSystem ?? 'metric';
  const mutationsLocked = props.mutationsLocked === true;
  const vaReserve = props.vaReserve;
  const reserveTtlMs = 4 * 60 * 60 * 1000;
  const reservedBy = acf.reservedByAccountId?.trim() || '';
  const reservedAt =
    typeof acf.reservedAtMs === 'number' && Number.isFinite(acf.reservedAtMs)
      ? acf.reservedAtMs
      : 0;
  const reserveActive =
    Boolean(reservedBy) &&
    (reservedAt <= 0 || Date.now() - reservedAt < reserveTtlMs);
  const reserveHolderId = reserveActive ? reservedBy : null;
  const reserveIsMine =
    Boolean(reserveHolderId) &&
    Boolean(vaReserve?.viewerAccountId) &&
    reserveHolderId === vaReserve!.viewerAccountId;
  const reserveBlocksMove =
    Boolean(vaReserve) &&
    reserveActive &&
    !reserveIsMine &&
    vaReserve!.isOwner !== true;
  const reserveLabel = reserveHolderId
    ? vaReserve?.labelByAccountId[reserveHolderId] ?? 'pilot'
    : null;
  const canReserve =
    Boolean(vaReserve) &&
    acf.status === 'parked' &&
    !acf.npcFerry &&
    (!reserveActive || reserveIsMine);
  const canReleaseReserve =
    Boolean(vaReserve) &&
    reserveActive &&
    !vaReserve!.inFlight &&
    (reserveIsMine || vaReserve!.isOwner);
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
  const ohLeft = hangarOverhaulRemainingLabel(acf, {
    economyTick: props.economyTick,
    economyClock: props.economyClock,
  });
  const note = hangarStatusNote(acf, {
    economyTick: props.economyTick,
    economyClock: props.economyClock,
    formatClock: props.formatClock,
    mutationsLocked,
  });
  const registration = formatAircraftRegistration(acf.registration);
  const hoursMxMult = estimateHoursMxCostMult(acf);
  const engOhQuote = estimateOverhaulQuote(acf, 'engine', {
    maxCargoKg: catalog?.maxCargoKg,
  });
  const afOhQuote = estimateOverhaulQuote(acf, 'airframe', {
    maxCargoKg: catalog?.maxCargoKg,
  });
  const showOverhaulActions =
    !mutationsLocked &&
    (acf.ownership ?? 'owned') === 'owned' &&
    (acf.status === 'parked' || acf.status === 'maintenance') &&
    !acf.overhaulKind;
  const canList =
    PLAYER_LEASE_OUT_ENABLED &&
    (acf.ownership ?? 'owned') === 'owned' &&
    acf.status === 'parked' &&
    props.ownedCount >= 2 &&
    !props.hasListed;
  const canSell =
    (acf.ownership ?? 'owned') === 'owned' &&
    (acf.status === 'parked' || acf.status === 'maintenance') &&
    props.ownedCount >= 2 &&
    !acf.overhaulKind;
  const sellBackUsd = canSell
    ? estimateSellBackUsd(acf, { maxCargoKg: catalog?.maxCargoKg })
    : null;
  const canRepair =
    (acf.status === 'parked' || acf.status === 'maintenance') &&
    (afPct < 100 || engPct < 100) &&
    !acf.overhaulKind;
  const canBuyout = acf.ownership === 'leased' && Boolean(acf.lease);
  const softTermEnded = acf.lease?.termEndedSoft === true;
  const economyTick = props.economyTick ?? 0;
  const overdueWeeks = estimateLeaseOverdueWeeks(acf, economyTick);
  const overdueAmountUsd = estimateLeaseOverdueAmountUsd(acf, economyTick);
  const leaseOverdueTitle =
    overdueWeeks > 0
      ? `${overdueWeeks} week${overdueWeeks === 1 ? '' : 's'} overdue · ${props.formatMoney(overdueAmountUsd)} due — pay now in Hangar or advance time with enough wallet`
      : 'Lease payment overdue — pay now in Hangar or advance time with enough wallet';
  const canPayLeaseOverdue =
    canBuyout &&
    acf.leaseOverdue === true &&
    !softTermEnded &&
    overdueWeeks > 0;
  const canReturnLease =
    canBuyout &&
    (!acf.leaseOverdue || softTermEnded) &&
    (acf.status === 'parked' || acf.status === 'maintenance');
  const pilotHere =
    props.pilotIcao.trim().toUpperCase() ===
    acf.locationIcao.trim().toUpperCase();
  const pilotLabel = props.pilotIcao.trim().toUpperCase() || '—';
  const [ferryDest, setFerryDest] = useState('');
  const [appliedFerrySeedToken, setAppliedFerrySeedToken] = useState(0);
  const [ferryPlan, setFerryPlan] = useState<FerryPlanView | null>(null);
  const [ferryPlanError, setFerryPlanError] = useState<string | null>(null);
  const [ferryPlanLoading, setFerryPlanLoading] = useState(false);
  const [ferryJourneyOpen, setFerryJourneyOpen] = useState(false);
  const [ferryJourneyFinal, setFerryJourneyFinal] = useState<string | null>(
    null,
  );
  const journeyOriginRef = useRef<string | null>(null);
  const showMove = acf.status === 'parked';
  const hasManageActions =
    !mutationsLocked &&
    (canRepair ||
      showOverhaulActions ||
      canList ||
      canSell ||
      canBuyout ||
      canPayLeaseOverdue ||
      canReturnLease);
  /** Keep Manage row on every owned hangar card so neighbors stay aligned. */
  const showManageChrome = !mutationsLocked;

  // Prefill from App navigation (market/board → Hangar) without syncing
  // every card while the player types a dest on one of them.
  useEffect(() => {
    const seed = props.preferredFerryDest?.trim().toUpperCase() ?? '';
    const token = props.ferrySeedToken ?? 0;
    if (!seed || !token || token === appliedFerrySeedToken) return;
    const here = acf.locationIcao.trim().toUpperCase();
    if (here !== seed) setFerryDest(seed);
    setAppliedFerrySeedToken(token);
  }, [
    props.preferredFerryDest,
    props.ferrySeedToken,
    appliedFerrySeedToken,
    acf.locationIcao,
  ]);

  // Clear dest once this airframe arrives.
  useEffect(() => {
    const here = acf.locationIcao.trim().toUpperCase();
    const dest = ferryDest.trim().toUpperCase();
    if (dest && here === dest) setFerryDest('');
  }, [acf.locationIcao, ferryDest]);

  const ferryFinal = ferryDest.trim().toUpperCase();
  useEffect(() => {
    if (acf.status !== 'parked' || !ferryFinal) {
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
        companyId: props.opsCompanyId,
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
  }, [acf.id, acf.locationIcao, acf.status, ferryFinal, props.opsCompanyId]);

  const primaryAction = mutationsLocked
    ? acf.status === 'parked' && !pilotHere
      ? {
          label: 'Travel here',
          title: `Travel to ${acf.locationIcao} (pilot reposition)`,
          onClick: () => props.onTravel(acf.locationIcao),
          tone: 'quiet' as const,
        }
      : null
    : acf.status === 'maintenance'
      ? acf.overhaulKind
        ? null
        : {
            label: 'Inspect',
            title: 'Pay inspection to clear AOG',
            onClick: () => props.onClearMaintenance(acf.id),
            tone: 'accent' as const,
          }
      : acf.status === 'listed'
        ? {
            label: 'Unlist',
            title: 'Remove from Airframes market',
            onClick: () => props.onUnlist(acf.id),
            tone: 'accent' as const,
          }
        : acf.status === 'parked' && !pilotHere
          ? {
              label: 'Travel here',
              title: `Travel to ${acf.locationIcao} (pilot reposition)`,
              onClick: () => props.onTravel(acf.locationIcao),
              tone: 'quiet' as const,
            }
          : null;

  const ferryBlockedForBush =
    /ferry unavailable|flown mission/i.test(ferryPlanError ?? '');
  const destReady =
    Boolean(ferryFinal) &&
    ferryFinal !== acf.locationIcao.trim().toUpperCase();
  /** Empty Watch reposition — always offered when a dest is picked. */
  const emptyFlightReady =
    destReady && acf.status === 'parked';
  const ferryReady = Boolean(
    destReady &&
      !ferryPlanLoading &&
      !ferryPlanError &&
      ferryPlan,
  );
  const multiLeg = Boolean(ferryPlan && ferryPlan.legCount > 1);

  return (
    <li className="hangar-card">
      <AircraftClassStripe
        aircraftClassId={acf.aircraftClassId}
        imageSrc={airframeCardArtUrl(acf.airframeTypeId)}
        imageAlt={acf.label}
        mark={
          acf.status === 'maintenance' ? (
            <HangarMaintenanceMark
              title={
                acf.overhaulKind
                  ? ohLeft
                    ? `Overhaul · ${ohLeft}`
                    : 'Overhaul in progress'
                  : 'In maintenance'
              }
            />
          ) : acf.status === 'assigned' ? (
            <HangarInFlightMark title="On a Dispatch mission — finish or cancel there before moving" />
          ) : null
        }
        badges={
          <>
            <span
              className={`status status-${acf.status}`}
              title={
                acf.overhaulKind
                  ? ohLeft
                    ? `Overhaul · ${ohLeft}`
                    : 'Overhaul in progress'
                  : undefined
              }
            >
              {hangarStatusBadgeLabel(acf)}
              {ohLeft ? ` · ${ohLeft}` : ''}
            </span>
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
            {reserveActive ? (
              <span
                className={`badge badge-reserved${reserveIsMine ? ' is-mine' : ''}`}
                title={
                  reserveIsMine
                    ? 'You reserved this aircraft (4h hold)'
                    : `Reserved by ${reserveLabel}`
                }
              >
                {reserveIsMine ? 'reserved · you' : `reserved · ${reserveLabel}`}
              </span>
            ) : null}
          </>
        }
      />
      <div className="hangar-card-body">
        <div className="hangar-section hangar-section-title">
          <div className="aircraft-card-title">
            <div className="aircraft-card-title-row">
              <strong>{acf.label}</strong>
              <AirframeAddonInfo
                airframeTypeId={acf.airframeTypeId}
                label={acf.label}
              />
            </div>
            {registration ? (
              <div className="aircraft-card-registration">{registration}</div>
            ) : null}
            <div className="aircraft-card-meta">
              <span>{aircraftClassLabel(acf.aircraftClassId)}</span>
              {acf.condition ? (
                <span className={`badge badge-cond-${acf.condition}`}>
                  {acf.condition}
                </span>
              ) : null}
              {acf.lease?.termEndedSoft ? (
                <span className="badge badge-warn">lease term ended</span>
              ) : acf.leaseOverdue ? (
                <span className="badge badge-warn" title={leaseOverdueTitle}>
                  lease overdue
                  {overdueWeeks > 0 ? ` · ${overdueWeeks}w` : ''}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="hangar-section hangar-section-where">
          <p className="aircraft-card-section-label">Where</p>
          <div className="hangar-where-line">
            <span className="hangar-where-status">{hangarWhereLabel(acf, props.missionRoute)}</span>
            <IcaoLink
              icao={acf.locationIcao}
              onOpen={props.onOpenAirport}
              disabled={props.busy}
            />
          </div>
          {note ? <p className="hangar-card-note hangar-where-note">{note}</p> : null}
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
            {(() => {
              const cabin = formatHangarCabinSpec(props.cabinStatus);
              if (!cabin) return null;
              return (
                <li>
                  <span>Pax</span>
                  <strong title={cabin.title}>{cabin.value}</strong>
                </li>
              );
            })()}
            <li>
              <span>Range</span>
              <strong>
                {catalog && catalog.maxRangeNm > 0
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
              <strong title={hoursMxTooltip(hoursMxMult)}>
                {Math.round(acf.hoursAirframe ?? 0)}/
                {Math.round(acf.hoursEngine ?? 0)} h
              </strong>
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
            {acf.parkingUsdPerDay != null && acf.parkingUsdPerDay > 0 ? (
              <span>
                Parking {props.formatMoney(acf.parkingUsdPerDay)}/day at{' '}
                {acf.locationIcao}
              </span>
            ) : acf.parkingUsdPerDay === 0 ? (
              <span>
                Parking free at HQ ({acf.locationIcao})
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
                  Lease {props.formatMoney(acf.lease.monthlyUsd)}/wk
                  {acf.leaseOverdue && overdueWeeks > 0 ? (
                    <>
                      {' '}
                      ·{' '}
                      <span className="hangar-lease-overdue-note">
                        {overdueWeeks} wk overdue (
                        {props.formatMoney(overdueAmountUsd)})
                      </span>
                    </>
                  ) : props.formatClock ? (
                    <> · next due {props.formatClock(acf.lease.nextDueTick)}</>
                  ) : (
                    <> · next due tick {acf.lease.nextDueTick}</>
                  )}
                </span>
                {canPayLeaseOverdue ? (
                  <button
                    type="button"
                    className="action hangar-pay-lease"
                    disabled={props.busy}
                    title={leaseOverdueTitle}
                    onClick={() => props.onPayLeaseOverdue(acf.id)}
                  >
                    Pay {props.formatMoney(overdueAmountUsd)} now
                  </button>
                ) : null}
                {acf.lease.buyoutUsd != null ? (
                  <span>Buyout {props.formatMoney(acf.lease.buyoutUsd)}</span>
                ) : null}
              </>
            ) : null}
            {acf.leaseOut ? (
              <>
                <span>
                  Income {props.formatMoney(acf.leaseOut.monthlyUsd)}/wk
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
              className={
                primaryAction.tone === 'quiet'
                  ? 'action ghost hangar-primary hangar-travel'
                  : 'accept hangar-primary'
              }
              disabled={props.busy}
              title={primaryAction.title}
              onClick={primaryAction.onClick}
            >
              {primaryAction.label}
            </button>
          ) : (
            <div className="hangar-primary-spacer" aria-hidden="true" />
          )}
        </div>

        <div className="hangar-footer-move">
          {showMove ? (
            <div className="hangar-move">
              <div className="hangar-move-row">
                <label className="staging-aircraft ferry-hub-label">
                  Destination
                  <FerryHubCombobox
                    hubs={props.hubOptions}
                    excludeIcao={acf.locationIcao}
                    value={ferryDest}
                    onChange={(icao) => {
                      journeyOriginRef.current = null;
                      setFerryDest(icao);
                    }}
                    disabled={props.busy || acf.status !== 'parked'}
                  />
                </label>
                <div
                  className={
                    vaReserve
                      ? 'hangar-move-actions has-reserve'
                      : 'hangar-move-actions'
                  }
                >
                  {vaReserve ? (
                    canReleaseReserve ? (
                      <button
                        type="button"
                        className="ghost hangar-move-go"
                        disabled={props.busy}
                        onClick={() => void vaReserve.onRelease(acf.id)}
                        title="Release hangar reservation"
                      >
                        Release reserve
                      </button>
                    ) : canReserve && !reserveActive ? (
                      <button
                        type="button"
                        className="ghost hangar-move-go"
                        disabled={props.busy}
                        onClick={() => void vaReserve.onReserve(acf.id)}
                        title="Reserve this aircraft for your session (4h)"
                      >
                        Reserve
                      </button>
                    ) : (
                      <span
                        className="hangar-move-go hangar-move-slot"
                        aria-hidden="true"
                      />
                    )
                  ) : null}
                  <button
                    type="button"
                    className="ghost hangar-move-go"
                    disabled={
                      props.busy ||
                      !ferryReady ||
                      acf.status !== 'parked' ||
                      reserveBlocksMove
                    }
                    onClick={() => {
                      setFerryJourneyFinal(ferryFinal);
                      setFerryJourneyOpen(true);
                    }}
                    title={
                      reserveBlocksMove
                        ? `Reserved by ${reserveLabel}`
                        : ferryBlockedForBush
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
                      acf.status !== 'parked' ||
                      reserveBlocksMove
                    }
                    onClick={() =>
                      void props.onEmptyFlight(acf.id, ferryFinal)
                    }
                    title={
                      reserveBlocksMove
                        ? `Reserved by ${reserveLabel}`
                        : `Empty Watch flight ${acf.locationIcao} → ${ferryFinal} (no contract)`
                    }
                  >
                    Plan empty flight
                  </button>
                </div>
              </div>
              {ferryFinal ? (
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
                        {ferryPlan.ferryBilling?.mode === 'allowance'
                          ? ' · Line crew · $0 you'
                          : ferryPlan.ferryBilling?.mode === 'overflow'
                            ? ` · your wallet ${props.formatMoney(ferryPlan.ferryBilling.yourCostUsd)}`
                            : ferryPlan.ferryBilling?.mode === 'company'
                              ? ' · company wallet'
                              : ''}
                      </p>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="hangar-move-spacer" aria-hidden="true" />
          )}
        </div>

        <div className="hangar-footer-manage">
          {showManageChrome ? (
            <details className="hangar-manage">
              <summary>Manage</summary>
              {hasManageActions ? (
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
                {showOverhaulActions ? (
                  <button
                    type="button"
                    className="action ghost"
                    disabled={props.busy || !engOhQuote.eligible}
                    title={
                      engOhQuote.eligible
                        ? `${props.formatMoney(engOhQuote.debitUsd)} · ${engOhQuote.downtimeDays}d AOG · resets engine hours (MX ×${engOhQuote.mxMultBefore.toFixed(2)} → ×${engOhQuote.mxMultAfter.toFixed(2)})`
                        : engOhQuote.reason
                    }
                    onClick={() => props.onOverhaul(acf.id, 'engine')}
                  >
                    Engine overhaul
                    {engOhQuote.eligible
                      ? ` · ${props.formatMoney(engOhQuote.debitUsd)}`
                      : ''}
                  </button>
                ) : null}
                {showOverhaulActions ? (
                  <button
                    type="button"
                    className="action ghost"
                    disabled={props.busy || !afOhQuote.eligible}
                    title={
                      afOhQuote.eligible
                        ? `${props.formatMoney(afOhQuote.debitUsd)} · ${afOhQuote.downtimeDays}d AOG · resets airframe hours (MX ×${afOhQuote.mxMultBefore.toFixed(2)} → ×${afOhQuote.mxMultAfter.toFixed(2)})`
                        : afOhQuote.reason
                    }
                    onClick={() => props.onOverhaul(acf.id, 'airframe')}
                  >
                    Airframe overhaul
                    {afOhQuote.eligible
                      ? ` · ${props.formatMoney(afOhQuote.debitUsd)}`
                      : ''}
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
                {canPayLeaseOverdue ? (
                  <button
                    type="button"
                    className="action ghost"
                    disabled={props.busy}
                    onClick={() => props.onPayLeaseOverdue(acf.id)}
                  >
                    Pay lease overdue
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
                    {softTermEnded ? ' (free)' : ''}
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
                    title={`List at your price (fair ${props.formatMoney(estimateFairUsd(acf, { maxCargoKg: catalog?.maxCargoKg }))})`}
                    onClick={() => props.onListForSale(acf.id)}
                  >
                    List on Market
                  </button>
                ) : null}
                {canSell ? (
                  <button
                    type="button"
                    className="action ghost"
                    disabled={props.busy}
                    title={`Dealer pays 50% of fair (${props.formatMoney(sellBackUsd ?? 0)})`}
                    onClick={() => props.onSell(acf.id)}
                  >
                    Dealer · {props.formatMoney(sellBackUsd ?? 0)}
                  </button>
                ) : null}
              </div>
              ) : (
                <p className="hangar-manage-empty">
                  {acf.overhaulKind
                    ? 'Overhaul in progress — actions unlock when the shop finishes.'
                    : 'No hangar actions right now.'}
                </p>
              )}
            </details>
          ) : (
            <div className="hangar-manage-spacer" aria-hidden="true" />
          )}
        </div>
      </div>
      {ferryJourneyOpen && ferryJourneyFinal && acf.status === 'parked' ? (
        <FerryJourneyDialog
          aircraft={acf}
          finalDestIcao={ferryJourneyFinal}
          formatMoney={props.formatMoney}
          busy={props.busy}
          companyId={props.opsCompanyId}
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

function AirframeAddonInfo(props: {
  airframeTypeId?: string | null;
  label: string;
}) {
  const addons = listAirframeAddons(props.airframeTypeId);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  if (addons.length === 0) return null;
  return (
    <>
      <button
        type="button"
        className="aircraft-addon-info"
        aria-label={`Homologated add-ons for ${props.label}`}
        title="Which MSFS add-on this is"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        i
      </button>
      {open ? (
        <div
          className="confirm-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            className="confirm-dialog aircraft-addon-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <p className="confirm-kicker">MSFS add-on</p>
            <h2 id={titleId} className="confirm-title">
              {props.label}
            </h2>
            <div className="confirm-body">
              <p>
                Airframe Load and Watch are homologated for these store
                products — not every livery pack with a similar name.
              </p>
              <ul className="aircraft-addon-list">
                {addons.map((row) => (
                  <li key={`${row.publisher}-${row.product ?? ''}`}>
                    <strong>{row.publisher}</strong>
                    {row.product ? <span>{row.product}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
            <div className="confirm-actions">
              <button
                type="button"
                className="accept"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
