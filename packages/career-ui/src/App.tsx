import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchAirport,
  fetchAirportStats,
  fetchCargoLimit,
  fetchMarket,
  fetchMissions,
  fetchNpcFleet,
  fetchRouteLots,
  fetchState,
  fetchWorldClock,
  fetchCompanies,
  fetchWorldPresence,
  postCompany,
  postCompanySessionOpen,
  fetchCareerProfiles,
  postCareerProfileCreate,
  postCareerProfileSelect,
  postCareerProfileClear,
  postCareerProfileRename,
  deleteCareerProfile,
  fetchWatchStatus,
  fetchSimBridgeStatus,
  postCancel,
  postCharterAccept,
  postConfirmOfp,
  postAcceptOfpCargo,
  postBushTripAccept,
  postBushTripAbandon,
  fetchBushTrips,
  downloadBushTripPln,
  downloadBushTripGfp,
  fetchBushWatchStatus,
  postBushWatchStart,
  postBushWatchStop,
  postDepart,
  postDispatch,
  postFuelPurchase,
  postFuelQuote,
  postLoadOfp,
  postCancelLoadOfp,
  fetchLoadOfpProgress,
  postPreflight,
  postSettle,
  postSelectHub,
  fetchAircraftMarket,
  AIRCRAFT_MARKET_NEAR_NM,
  fetchCashflow,
  fetchNetworkHubs,
  postAircraftBuy,
  postAircraftLease,
  postAircraftSell,
  postAircraftListSale,
  postAircraftListLease,
  postAircraftUnlist,
  postAircraftMaintenance,
  postAircraftRepair,
  postAircraftOverhaul,
  postAircraftBuyout,
  postAircraftPayLease,
  postAircraftReturnLease,
  postFboBuy,
  postFboUpgrade,
  postFboHold,
  postFboCancelHold,
  postFboRelease,
  postFboSplit,
  postFboReturnMission,
  postBaseDispatchTours,
  postBaseDispatchCharters,
  postBaseDispatcher,
  postCrewAssign,
  postCrewDispatch,
  postCrewHire,
  postCrewFire,
  postFerry,
  postEmptyFlight,
  postPilotTravel,
  postContractPilotAccept,
  postStagingCommit,
  postDemandDispatchHold,
  postWarehouseBridgeDispatchHold,
  postWarehouseHaulDispatchHold,
  postTick,
  postDebugCreditWallet,
  postDebugClaimPort,
  postWatchStart,
  postWatchStop,
  type AircraftClass,
  type AircraftDeliveryQuoteView,
  type AircraftLeaseUnlock,
  type AircraftListing,
  type AircraftMarketPoolCountry,
  type AirportLot,
  type AirportMovement,
  type AirportView,
  type BushTripBoardRow,
  type BushTripMapNode,
  type ActiveBushTripView,
  type BushWatchStatus,
  type CareerProfileMeta,
  type CharterOfferView,
  type CareerCashflowSnapshot,
  type CareerCompanyView,
  type CompanyCreditSnapshot,
  type EconomyEvent,
  type FuelHaulView,
  type MarketLot,
  type LotPressure,
  type MissionFuelQuote,
  type OfpLoadProgress,
  type Mission,
  type NetworkHub,
  type NpcActivity,
  type NpcClaim,
  type NpcFleetMember,
  type PlayerAircraft,
  type VaHaulHold,
  type PlayerFboSnapshot,
  type BaseDispatchScoutPolicy,
  type BaseDispatchTour,
  type BaseDispatchTourLeg,
  type BaseDispatchTourReturnMode,
  type BaseCharterTour,
  type BaseCharterTourReturnMode,
  type CharterActiveTourView,
  type ActiveTourView,
  type BaseDispatcherSnapshot,
  describeTourFerry,
  type CompanyCrewSnapshot,
  type OfflineFeeSummary,
  type EconomyCatchUpStatus,
  type HubStatsView,
  type RegionPressure,
  type SimBridgeStatus,
  type StarterHubOption,
  type WatchStatus,
  fetchAuthStatus,
  postAuthLogin,
  postAuthRegister,
  postAuthLogout,
  fetchVaMembers,
  fetchCareerHealth,
  resolveClientUpdateBlock,
  formatClientUpdateRequiredLabel,
  formatClientUpdateCtaLabel,
  getCareerClientVersion,
  type ClientUpdateBlock,
} from './api';
import {
  companyIdFromUrl,
  getStoredCompanyId,
  LOCAL_COMPANY_ID,
  setActiveCompanyIdForRequests,
  setStoredCompanyId,
  suggestCompanyId,
} from './career-company-client';
import {
  AUTH_REQUIRED_EVENT,
  clearAuthToken,
  getAuthToken,
  setAuthToken,
  setRememberedLoginName,
} from './career-auth-client';
import {
  buildOpsFleet,
  filterOpsFleetForPrepare,
  findOpsEntry,
  isOpsAircraftBoardSelectable,
  opsAircraftSelectLabel,
  opsFleetAircraft,
  pickOpsAircraftForOrigin,
} from './ops-fleet';
import { AuthGate } from './AuthGate';
import { WorldWaitingGate } from './WorldWaitingGate';
import {
  pathForLocation,
  readCareerLocation,
  writeCareerLocation,
  resetCareerShellUrl,
  type CareerTab,
} from './routes';
import {
  fuelMatchToleranceLb,
  loadVerificationNumbersMatch,
  matchFuelOk,
  payloadMatchToleranceLb,
  pickFuelTankBreakdown,
  pickLivePayloadLb,
  holdWrittenFuelLb,
} from './load-verification';
import { estimateFairUsd, estimateLeaseMonthlyUsd, estimateSellBackUsd, estimateLeaseEarlyReturnUsd, estimateLeaseOverdueAmountUsd, estimateLeaseOverdueWeeks, estimateOverhaulQuote } from './aircraft-pricing';
import {
  boardNetSortUsd,
  contractPilotFeePctLabel,
} from './contract-pilot-fee';
import { useConfirm } from './ConfirmDialog';
import { PageHelpButton } from './PageHelpButton';
import { resolvePageHelp } from './page-help';
import { ContractPilotPick } from './ContractPilotPick';
import { PilotTravelDialog } from './PilotTravelDialog';
import { PortsPanel } from './PortsPanel';
import { FboSplitDialog } from './FboSplitDialog';
import { FboRouteMapCard } from './FboRouteMapCard';
import { FerryHubCombobox } from './FerryHubCombobox';
import { FerryJourneyDialog } from './FerryJourneyDialog';
import { CharterBoard, resolveBaseCharterOrigin, charterExpiryLabel } from './CharterBoard';
import {
  formatTourPaxByLeg,
  TourRouteLabel,
} from './TourRouteLabel';
import {
  boardMoneyLabel,
  boardNetClassName,
  formatBoardDistanceNm,
  formatBoardMoney,
  isFiniteMoney,
} from './board-money';
import {
  CharterManifest,
  type CharterManifestDraft,
} from './CharterManifest';
import { BUSH_TRIPS_BOARD_ENABLED, FBO_BONDED_HOLD_ENABLED, COMPANY_CREW_ENABLED } from './feature-flags';
import {
  AircraftMarketCountryCombobox,
  type AircraftMarketCountryOption,
} from './AircraftMarketCountryCombobox';
import { marketCountryLabel } from './market-country-label';
import { BrandMark } from './BrandMark';
import { SidebarFlightStrip } from './SidebarFlightStrip';
import { StagingLotReason } from './StagingLotReason';
import { DispatchFlightSummary } from './DispatchFlightSummary';
import {
  canRestoreStagingDraft,
  clearPersistedStagingDraft,
  readPersistedStagingDraft,
  writePersistedStagingDraft,
} from './staging-draft-persist';
import { AirportNamesProvider, IcaoLink } from './IcaoLink';
import { BusyBlock, BusyBoot, BusyChip, BusyStatus, TableSkeleton } from './Busy';
import { CareerProfileManage, ProfileGate, ProfileGateLoading } from './ProfileGate';
import { PlayModeGate } from './PlayModeGate';
import {
  DesktopUpdateHeaderButton,
  DesktopUpdatesCard,
} from './DesktopUpdates';
import { VaPage } from './VaPage';
import { VaDirectoryPage } from './VaDirectoryPage';
import { VaRankingPage } from './VaRankingPage';
import { CompanyVaPublishCard } from './CompanyVaPublishCard';
import { EconomySyncIndicator } from './EconomySyncIndicator';
import { CrewFlyControls } from './CrewFlyControls';
import {
  AIRCRAFT_CLASS_FILTERS,
  HangarAircraftCard,
  ListLeaseAskBody,
  ListSaleAskBody,
  MarketListingCard,
  aircraftClassLabel,
  aircraftListingMatchesQuery,
  hangarAircraftMatchesQuery,
  type AircraftCatalogEntry,
  type HangarCabinStatus,
} from './AircraftCards';
import { HangarCashflowPanel } from './CashflowPanel';
import { CargoOpsPanel } from './CargoOpsPanel';
import { CARGO_OPS_FILTER_OPTIONS } from './cargo-ops-unlock';
import { ClassOpsPanel } from './ClassOpsPanel';
import { classOpsUnlockProgress } from './class-ops-unlock';
import { CrewPanel, CrewPortrait } from './CrewPanel';
import { crewPortraitUrl } from './crewPortraits';
import { CommodityIcon } from './CommodityIcon';
import type { CareerCargoOps, CareerClassOps } from './api';
import { HubNetworkMap } from './HubNetworkMap';
import {
  logbookAircraftLabel,
  logbookCargoLabel,
  logbookDistanceNm,
  logbookFlightDurationLabel,
  logbookFlightKind,
  logbookFlightWhenLabel,
  logbookIsVaFlight,
  logbookPayoutIsPilotCut,
  logbookPayoutUsd,
  logbookStatusLabel,
  mergeLogbookMissions,
  filterVaMissionsForPilot,
} from './logbook';
import {
  liveRefreshScope,
  type CareerRefreshScope,
} from './refresh-scope';

function normalizeStarterHubs(
  hubs: Array<StarterHubOption | string> | null | undefined,
): StarterHubOption[] {
  if (!hubs?.length) return [];
  return hubs.map((hub) =>
    typeof hub === 'string'
      ? { icao: hub, name: hub, region: '', hubTier: 'spoke' as const }
      : hub,
  );
}

/** Signup / FBO — network cargo hubs only (no soft-field bush or trip-only). */
function aircraftMarketFetchOpts(
  browseRef: string,
): { country: string } | undefined {
  const id = browseRef.trim().toUpperCase();
  if (!id) return undefined;
  return { country: id };
}

function syncAircraftBrowseFromApi(
  browseCountryId: string | undefined,
  homeCountryId: string | undefined,
): string {
  const home = (homeCountryId ?? '').toUpperCase();
  const browse = (browseCountryId ?? '').toUpperCase();
  if (!browse || browse === home) return '';
  return browse;
}

function networkCargoHubs(hubs: StarterHubOption[]): StarterHubOption[] {
  return hubs.filter((hub) => !hub.bush && !hub.bushTripOnly);
}

/**
 * Hangar ferry, empty flight, and pilot travel destinations.
 * Network cargo hubs only — trip-only FAA locals (bush-trip PLN strips like
 * Baker / 1Q2) stay in the world for trips but are not Market/ferry hubs.
 */
function ferryDestinationHubs(hubs: StarterHubOption[]): StarterHubOption[] {
  return networkCargoHubs(hubs);
}

function hubTierLabel(tier: StarterHubOption['hubTier']): string {
  switch (tier) {
    case 'major':
      return 'Major';
    case 'regional':
      return 'Regional';
    default:
      return 'Spoke';
  }
}

function formatStarterHubOption(hub: StarterHubOption): string {
  const place = hub.name && hub.name !== hub.icao ? hub.name : '';
  const tier = hubTierLabel(hub.hubTier);
  if (place && hub.region) return `${hub.icao} — ${place} · ${tier} · ${hub.region}`;
  if (place) return `${hub.icao} — ${place} · ${tier}`;
  return `${hub.icao} · ${tier}`;
}
import {
  displayToKg,
  formatMass,
  formatMassExact,
  formatWeightText,
  KG_TO_LB,
  kgToDisplay,
  loadDevMode,
  loadFilterOptions,
  loadWeightSystem,
  massUnitLabel,
  massUnitLong,
  saveDevMode,
  saveWeightSystem,
  type WeightSystem,
} from './weight-units';
import {
  loadUiSoundMode,
  playFlightSettledSound,
  playUiSound,
  saveUiSoundMode,
  type UiSoundMode,
} from './ui-sounds';
import {
  buildFlightDebrief,
  deriveDispatchStep,
  dispatchStepStatusLine,
  formatCargoOpsDebriefLine,
  formatClassOpsDebriefLine,
  formatFlightDurationMs,
  formatLandingFpm,
  formatRunwayTouchdownDebriefLine,
  fuelAuthorizedForOfp,
  resolveLoadPath,
  airborneResumeShouldOpenDispatch,
  type FlightDebrief,
} from './dispatch-flow';
import { RunwayTouchdownDiagram } from './RunwayTouchdownDiagram';
import { DispatchActivePanel, DispatchStepper } from './DispatchActivePanel';
import { PayloadLabPanel } from './PayloadLabPanel';
import { HubEconomyPulsePage } from './HubEconomyPulsePage';
import { CargoLotCards } from './CargoLotCards';
import { TerminalAirportPanel } from './TerminalAirportPanel';
import { TerminalHubStatsPanel } from './TerminalHubStatsPanel';
import { WatchStatusFooter } from './WatchStatusFooter';
import { mxFuelBurnFromAircraft } from './mx-fuel-burn';

type Tab = CareerTab;
type TerminalSection =
  | 'airport'
  | 'inventory'
  | 'contracts'
  | 'movements'
  | 'fbo'
  | 'stats';
type ContractsLane = 'outbound' | 'inbound';
type ContractsProduct = 'freight' | 'charter';
type MarketSortKey =
  | 'distance'
  | 'cargo'
  | 'load'
  | 'expires'
  | 'pay'
  | 'net'
  | 'access';
type SortDirection = 'asc' | 'desc';
type MarketSortLevel = { key: MarketSortKey; direction: SortDirection };
type AccessFilter = '' | 'open' | 'locked';
type LaneFilter =
  | ''
  | 'intl'
  | 'domestic'
  | 'pilot-domestic'
  | 'pilot-intl'
  | 'bush';

const DEFAULT_BOARD_SORTS: MarketSortLevel[] = [];

/** Origins within this nm of the pilot / parked aircraft (matches LAST_MILE_MAX_NM). */
const BOARD_NEAR_MAX_NM = 600;

const EMPTY_BUSH_MAP_NODES: BushTripMapNode[] = [];

function compareAirportLot(
  a: AirportLot,
  b: AirportLot,
  key: MarketSortKey,
  isLocked: (commodityId: string) => boolean,
  hangarEmpty: boolean,
): number {
  switch (key) {
    case 'distance':
      return (
        (a.distanceNm ?? Number.POSITIVE_INFINITY) -
        (b.distanceNm ?? Number.POSITIVE_INFINITY)
      );
    case 'cargo':
      return a.commodityName.localeCompare(b.commodityName);
    case 'load':
      return a.availableKg - b.availableKg;
    case 'expires':
      return a.expiresAtTick - b.expiresAtTick;
    case 'pay': {
      const payOf = (lot: AirportLot) => {
        const claim = lot.npcClaim;
        if (claim?.crewNeeded && typeof claim.pilotFeeUsd === 'number') {
          return claim.pilotFeeUsd;
        }
        return lot.payUsd;
      };
      return payOf(a) - payOf(b);
    }
    case 'net':
      return (
        boardNetSortUsd(a, { hangarEmpty }) - boardNetSortUsd(b, { hangarEmpty })
      );
    case 'access':
      return Number(isLocked(a.commodityId)) - Number(isLocked(b.commodityId));
  }
}

function sortAirportLots(
  lots: readonly AirportLot[],
  sorts: MarketSortLevel[],
  isLocked: (commodityId: string) => boolean,
  hangarEmpty: boolean,
): AirportLot[] {
  if (sorts.length === 0) return [...lots];
  return lots
    .map((lot, index) => ({ lot, index }))
    .sort((a, b) => {
      for (const level of sorts) {
        const comparison = compareAirportLot(
          a.lot,
          b.lot,
          level.key,
          isLocked,
          hangarEmpty,
        );
        if (comparison !== 0) {
          return comparison * (level.direction === 'asc' ? 1 : -1);
        }
      }
      return a.index - b.index;
    })
    .map(({ lot }) => lot);
}

const MARKET_PAGE_SIZE = 10;
/** Wait out ICAO/city typing before hitting the board API. */
const MARKET_TEXT_DEBOUNCE_MS = 500;
const MARKET_FILTER_DEBOUNCE_MS = 180;
const CONTRACTS_PAGE_SIZE = 10;

function formatMarketSortParam(sorts: MarketSortLevel[]): string {
  // Preserve client order (metric-first when the player clicked Pay/Net/…).
  return sorts.map((level) => `${level.key}:${level.direction}`).join(',');
}

/** Promote a metric column to primary; third click clears it. */
function withMetricPrimarySort(
  current: MarketSortLevel[],
  key: MarketSortKey,
): MarketSortLevel[] {
  // Money / weight: highest first. Distance / expiry / name: natural asc.
  const preferred: SortDirection =
    key === 'pay' || key === 'net' || key === 'load' ? 'desc' : 'asc';
  const flipped: SortDirection = preferred === 'asc' ? 'desc' : 'asc';
  const existing = current.find((level) => level.key === key);
  const others = current.filter((level) => level.key !== key);
  if (!existing) {
    return [{ key, direction: preferred }, ...others];
  }
  if (existing.direction === preferred) {
    return [{ key, direction: flipped }, ...others];
  }
  return others;
}
const FLEET_PAGE_SIZE = 10;
const MAX_STAGING_LOTS = 5;
const SIMBRIEF_USER_KEY = 'skyline.simbriefUser';
const LAST_FBO_ICAO_KEY = 'skyline.career.lastFboIcao';
/** Career economy: 1 tick = 15 wall-clock minutes. */
const HOURS_PER_TICK = 0.25;
const HOURS_PER_DAY = 24;
const MS_PER_HOUR = 3_600_000;
const MS_PER_TICK_DEFAULT = 900_000;

type StagingLine = {
  lot: MarketLot;
  cargoKg: number;
};

type StagingDraft = {
  originIcao: string;
  destIcao: string;
  originName: string;
  destName: string;
  aircraft: AircraftClass;
  aircraftId?: string;
  intoMissionId?: string;
  /** When true, commit replaces the full manifest instead of appending. */
  replaceManifest?: boolean;
  lines: StagingLine[];
  /**
   * VA desk hold prepared from My VA → Hauls (no Market lots).
   * Accept & Dispatch calls *DispatchHold once the tail is at origin.
   */
  deskHold?: {
    id: string;
    kind: 'demand' | 'bridge' | 'haul';
    commodityId: string;
    /** Full reserved hold kg (Open desk remainder after partial Accept). */
    kg: number;
    /** This flight's load ≤ kg and aircraft ops cap. */
    loadKg: number;
    unitPriceUsd?: number;
    pilotPayUsd?: number;
    /** Desk hold TTL — same clock as Open desk. */
    expiresAtTick?: number;
  };
};

function deskHoldEffectiveLoadKg(
  desk: NonNullable<StagingDraft['deskHold']>,
): number {
  const holdKg = Math.max(0, Math.floor(desk.kg));
  const raw =
    desk.loadKg != null && Number.isFinite(desk.loadKg)
      ? Math.floor(desk.loadKg)
      : holdKg;
  return Math.max(0, Math.min(holdKg, raw));
}

function deskHoldPayUsd(desk: NonNullable<StagingDraft['deskHold']>): number {
  const loadKg = deskHoldEffectiveLoadKg(desk);
  if (loadKg <= 0) return 0;
  if (desk.kind === 'bridge') {
    const fullPay = Math.max(0, Math.round(desk.pilotPayUsd ?? 0));
    const holdKg = Math.max(0, Math.floor(desk.kg));
    if (holdKg <= 0) return 0;
    return Math.max(0, Math.round((fullPay * loadKg) / holdKg));
  }
  if (desk.unitPriceUsd != null) {
    return Math.max(0, Math.round(desk.unitPriceUsd * loadKg));
  }
  return 0;
}

function lotQuantityKg(lot: MarketLot): number {
  const qty = Number(lot.quantityKg);
  if (Number.isFinite(qty) && qty > 0) return qty;
  return Math.max(1, lot.availableKg);
}

/** Reserved lots leave the board; restore free kg + this flight's booked slice only. */
function manifestEditAvailableKg(opts: {
  bookedKg: number;
  lotQuantityKg?: number;
  marketAvailableKg?: number;
  demandMaxKg?: number;
}): number {
  const booked = Math.max(0, Math.floor(opts.bookedKg));
  const fromBoard =
    Math.max(0, Math.floor(opts.marketAvailableKg ?? 0)) + booked;
  const demand = Math.max(0, Math.floor(opts.demandMaxKg ?? 0));
  const quantity = Math.max(0, Math.floor(opts.lotQuantityKg ?? 0));
  const uncapped = Math.max(booked, fromBoard, demand);
  if (quantity > 0) return Math.min(uncapped, quantity);
  return uncapped;
}

function proRataPayUsd(lot: MarketLot, cargoKg: number): number {
  return Math.max(1, Math.round((cargoKg / lotQuantityKg(lot)) * lot.payUsd));
}

/**
 * Full-lot contract rate for Manifest compare ($/klb imperial, $/t metric).
 * Independent of partial load — same rate as pro-rata pay.
 */
function formatLotPayRate(
  payUsd: number,
  quantityKg: number,
  weightSystem: WeightSystem = activeWeightSystem,
): string | null {
  if (!(quantityKg > 0) || !Number.isFinite(payUsd) || payUsd < 0) return null;
  const usdPerKg = payUsd / quantityKg;
  if (weightSystem === 'imperial') {
    const perKlb = usdPerKg * (1000 / KG_TO_LB);
    if (!Number.isFinite(perKlb)) return null;
    return `$${Math.round(perKlb).toLocaleString('en-US')}/klb`;
  }
  const perT = usdPerKg * 1000;
  if (!Number.isFinite(perT)) return null;
  return `$${Math.round(perT).toLocaleString('en-US')}/t`;
}

function defaultStagingKg(maxKg: number): number {
  if (maxKg <= 0) return 0;
  const half = Math.floor(maxKg / 200) * 100;
  return Math.min(maxKg, Math.max(Math.min(100, maxKg), half || Math.min(100, maxKg)));
}

function lotPayForKg(
  lot: Pick<AirportLot | MarketLot, 'payUsd' | 'availableKg'> & {
    quantityKg?: number;
  },
  cargoKg: number,
): number {
  const denom =
    typeof lot.quantityKg === 'number' && lot.quantityKg > 0
      ? lot.quantityKg
      : Math.max(1, lot.availableKg);
  return Math.max(1, Math.round((cargoKg / denom) * lot.payUsd));
}

/** Confirm body: pick bonded hold kg (clamped to lot + FBO room). */
function HoldFboAmountFields(props: {
  maxKg: number;
  roomKg: number;
  lot: AirportLot;
  weightSystem: WeightSystem;
  valueRef: { current: number };
}) {
  const [kg, setKg] = useState(() => defaultStagingKg(props.maxKg));
  props.valueRef.current = kg;
  const unit = massUnitLabel(props.weightSystem);
  const displayMax = Math.max(1, Math.floor(kgToDisplay(props.maxKg, props.weightSystem)));
  const displayValue = Math.max(
    1,
    Math.min(displayMax, Math.floor(kgToDisplay(kg, props.weightSystem))),
  );

  function setFraction(fraction: number) {
    const next =
      fraction >= 1
        ? props.maxKg
        : Math.max(1, Math.min(props.maxKg, Math.round(props.maxKg * fraction)));
    setKg(next);
  }

  return (
    <div className="fbo-hold-amount">
      <p>
        Bond {props.lot.commodityName} {props.lot.originIcao}→{props.lot.destIcao} at
        your Base. Destination soft-fill waits until you send to Dispatch.
      </p>
      <p className="muted">
        Lot {formatTonnes(props.lot.availableKg, props.weightSystem)} available · Base room{' '}
        {formatTonnes(props.roomKg, props.weightSystem)} · max this hold{' '}
        {formatTonnes(props.maxKg, props.weightSystem)}
      </p>
      <label className="cargo-amount">
        Quantity to hold
        <div>
          <input
            type="number"
            min={1}
            max={displayMax}
            step={props.weightSystem === 'imperial' ? 10 : 100}
            value={displayValue}
            onChange={(e) => {
              const next = displayToKg(Number(e.target.value), props.weightSystem);
              setKg(Math.max(1, Math.min(props.maxKg, Math.floor(next) || 1)));
            }}
          />
          <span>{unit}</span>
        </div>
        <input
          type="range"
          min={1}
          max={displayMax}
          step={props.weightSystem === 'imperial' ? 10 : 100}
          value={displayValue}
          onChange={(e) => {
            const next = displayToKg(Number(e.target.value), props.weightSystem);
            setKg(Math.max(1, Math.min(props.maxKg, Math.floor(next) || 1)));
          }}
        />
      </label>
      <div className="cargo-presets">
        {[0.25, 0.5, 0.75, 1].map((fraction) => (
          <button
            key={fraction}
            type="button"
            onClick={() => setFraction(fraction)}
            disabled={props.maxKg <= 0}
          >
            {fraction === 1 ? 'Max' : `${fraction * 100}%`}
          </button>
        ))}
      </div>
      <p>
        Est. pay {formatMoney(lotPayForKg(props.lot, kg))} · storage fees apply while
        parked
      </p>
    </div>
  );
}

function formatTonnes(kg: number, system?: WeightSystem): string {
  return formatMass(kg, system ?? activeWeightSystem);
}

/** Updated by App so module-level formatters respect Settings. */
let activeWeightSystem: WeightSystem = loadWeightSystem();

function formatMoney(n: number): string {
  return formatBoardMoney(n);
}

/** Player-facing route for an active dispatch (hide raw msn_… ids). */
function activeFlightRouteLabel(mission: {
  originIcao: string;
  destIcao: string;
}): string {
  return `${mission.originIcao.trim().toUpperCase()}→${mission.destIcao
    .trim()
    .toUpperCase()}`;
}

/**
 * Load column: lot total (formation size). Claim / open remain in the tooltip
 * so Contracts do not look artificially capped at class max (~1.0 klb GA).
 */
function LotLoadCell(props: {
  lot: {
    availableKg: number;
    quantityKg?: number;
    payUsd?: number;
    npcClaim?: {
      crewNeeded?: boolean;
      crewReposition?: boolean;
      cargoKg?: number;
    } | null;
  };
  weightSystem?: WeightSystem;
}) {
  const totalKg =
    typeof props.lot.quantityKg === 'number' &&
    Number.isFinite(props.lot.quantityKg) &&
    props.lot.quantityKg > 0
      ? props.lot.quantityKg
      : Math.max(props.lot.availableKg, 0);
  const claim = props.lot.npcClaim;
  const claimKg =
    claim?.crewNeeded &&
    typeof claim.cargoKg === 'number' &&
    claim.cargoKg > 0
      ? claim.cargoKg
      : null;
  const freeKg = props.lot.availableKg;
  const kind = claim?.crewReposition ? 'Ferry' : 'Contract';
  const title =
    claimKg != null
      ? freeKg > 0
        ? `Lot ${formatTonnes(totalKg, props.weightSystem)} · ${kind} hold ${formatTonnes(claimKg, props.weightSystem)} · ${formatTonnes(freeKg, props.weightSystem)} still open`
        : `Lot ${formatTonnes(totalKg, props.weightSystem)} · ${kind} hold ${formatTonnes(claimKg, props.weightSystem)}`
      : `Lot ${formatTonnes(totalKg, props.weightSystem)} · ${formatTonnes(freeKg, props.weightSystem)} available`;
  return (
    <span title={title}>
      {formatTonnes(totalKg, props.weightSystem)}
      {claimKg != null && freeKg > 0 ? (
        <small className="muted">
          {formatTonnes(freeKg, props.weightSystem)} open
        </small>
      ) : null}
    </span>
  );
}

/** Contract/Ferry Pay: pilot fee (what you earn). Normal lots: freight pay. */
function freightPayExplainTitle(
  lot: {
    payUsd: number;
    basePayUsd?: number;
    distanceNm?: number;
    urgency?: string;
  },
  idlePct: number | null | undefined,
): string {
  const parts: string[] = [];
  const base =
    typeof lot.basePayUsd === 'number' && Number.isFinite(lot.basePayUsd)
      ? Math.round(lot.basePayUsd)
      : null;
  if (idlePct != null && idlePct > 0) {
    if (base != null) {
      parts.push(
        `Formation ${formatMoney(base)} · now +${idlePct}% idle (sat on the board)`,
      );
    } else {
      parts.push(
        `Pay is up ${idlePct}% vs formation — freight sat on the board`,
      );
    }
  } else if (base != null && Math.abs(base - Math.round(lot.payUsd)) > 1) {
    parts.push(`Formation ${formatMoney(base)}`);
  }
  if (lot.distanceNm != null && Number.isFinite(lot.distanceNm) && lot.distanceNm > 0) {
    parts.push(`${Math.round(lot.distanceNm).toLocaleString()} nm haul`);
  }
  if (lot.urgency === 'urgent') parts.push('Urgent');
  return parts.length > 0
    ? parts.join(' · ')
    : 'Freight pay for the full available load';
}

function LotPayCell(props: {
  lot: {
    payUsd: number;
    basePayUsd?: number;
    distanceNm?: number;
    urgency?: string;
    quantityKg?: number;
    availableKg?: number;
    npcClaim?: {
      crewNeeded?: boolean;
      crewReposition?: boolean;
      cargoKg?: number;
      pilotFeeUsd?: number;
      pilotFeeMinUsd?: number;
    } | null;
  };
  /** Idle ↑ badge — only for freight pay (not crew fee). */
  idlePct?: number | null;
}) {
  const claim = props.lot.npcClaim;
  const crewPct = contractPilotFeePctLabel();
  if (claim?.crewNeeded && typeof claim.pilotFeeUsd === 'number') {
    const title = claim.crewReposition
      ? 'Ferry pilot fee — empty reposition; NPC pays fuel'
      : `Your ${crewPct} crew cut — operator keeps the rest and pays fuel & MX`;
    return (
      <CrewFeeAmount
        claim={claim}
        formatMoney={formatMoney}
        title={title}
      />
    );
  }
  const title = freightPayExplainTitle(props.lot, props.idlePct);
  return (
    <span title={title}>
      {formatMoney(props.lot.payUsd)}
      {props.idlePct != null ? (
        <span className="idle-uptick" aria-label={`Idle +${props.idlePct}%`}>
          ↑{props.idlePct}%
        </span>
      ) : null}
    </span>
  );
}

/** `BR-SE` → `BR`, `US-SC` → `US`. Bare two-letter codes pass through. */
function countryIdFromRegion(region: string): string {
  const raw = region.trim().toUpperCase();
  if (!raw) return '';
  const dash = raw.indexOf('-');
  if (dash > 0) return raw.slice(0, dash);
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  return raw.slice(0, 2);
}

function countryLabel(countryId: string): string {
  switch (countryId) {
    case 'BR':
      return 'Brazil';
    case 'US':
      return 'USA';
    default:
      return countryId;
  }
}

function countryDisplayName(countryId: string, sampleRegion: string): string {
  const labeled = regionLabel(sampleRegion);
  if (labeled !== sampleRegion) {
    const dash = labeled.indexOf('—');
    const name = (dash > 0 ? labeled.slice(0, dash) : labeled).trim();
    if (name) return name;
  }
  return countryLabel(countryId);
}

const FALLBACK_STARTER_HUBS: StarterHubOption[] = [
  {
    icao: 'SBGR',
    name: 'São Paulo/Guarulhos',
    region: 'BR-SE',
    hubTier: 'major',
  },
  {
    icao: 'SBGL',
    name: 'Rio de Janeiro/Galeão',
    region: 'BR-SE',
    hubTier: 'major',
  },
  {
    icao: 'SBKP',
    name: 'Campinas/Viracopos',
    region: 'BR-SE',
    hubTier: 'major',
  },
  {
    icao: 'SBCF',
    name: 'Belo Horizonte/Confins',
    region: 'BR-SE',
    hubTier: 'regional',
  },
  {
    icao: 'SBPA',
    name: 'Porto Alegre',
    region: 'BR-S',
    hubTier: 'regional',
  },
  {
    icao: 'SBRF',
    name: 'Recife',
    region: 'BR-NE',
    hubTier: 'regional',
  },
];

function regionLabel(region: string): string {
  switch (region) {
    case 'BR-S':
      return 'Brazil — South';
    case 'BR-SE':
      return 'Brazil — Southeast';
    case 'BR-NE':
      return 'Brazil — Northeast';
    case 'BR-N':
      return 'Brazil — North';
    case 'BR-CW':
    case 'BR-CO':
      return 'Brazil — Central-West';
    case 'US-SE':
      return 'USA — Southeast';
    case 'US-NE':
      return 'USA — Northeast';
    case 'US-SC':
      return 'USA — South-Central';
    case 'US-MW':
      return 'USA — Midwest';
    case 'US-MT':
      return 'USA — Mountain';
    case 'US-W':
      return 'USA — West Coast';
    case 'US-PR':
      return 'Puerto Rico';
    case 'US-VI':
      return 'U.S. Virgin Islands';
    case 'US-HI':
      return 'USA — Hawaii';
    case 'US-GU':
      return 'USA — Guam';
    case 'US-AS':
      return 'USA — American Samoa';
    case 'US-MP':
      return 'USA — Northern Mariana Islands';
    case 'CA-W':
      return 'Canada — West';
    case 'CA-PR':
      return 'Canada — Prairies';
    case 'CA-ON':
      return 'Canada — Ontario';
    case 'CA-QC':
      return 'Canada — Quebec';
    case 'CA-AT':
      return 'Canada — Atlantic';
    case 'MX-N':
      return 'Mexico — North';
    case 'MX-C':
      return 'Mexico — Central';
    case 'MX-S':
      return 'Mexico — South';
    case 'MX-Y':
      return 'Mexico — Yucatán';
    case 'AR-BA':
      return 'Argentina — Buenos Aires';
    case 'AR-CO':
      return 'Argentina — Centro';
    case 'AR-NO':
      return 'Argentina — Norte';
    case 'AR-PA':
      return 'Argentina — Patagonia';
    case 'CL-C':
      return 'Chile — Centro';
    case 'CL-S':
      return 'Chile — Sur';
    case 'UY-S':
      return 'Uruguay';
    case 'PY-C':
      return 'Paraguay';
    case 'PE-C':
      return 'Peru — Costa / Centro';
    case 'PE-S':
      return 'Peru — Sur';
    case 'BO-W':
      return 'Bolivia — Altiplano';
    case 'BO-E':
      return 'Bolivia — Oriente';
    case 'EC-C':
      return 'Ecuador — Sierra / Norte';
    case 'EC-S':
      return 'Ecuador — Costa / Sur';
    case 'CO-C':
      return 'Colombia — Central';
    case 'CO-N':
      return 'Colombia — Caribe';
    case 'CO-W':
      return 'Colombia — Pacífico / Sur';
    case 'VE-C':
      return 'Venezuela — Central / Oriente';
    case 'VE-W':
      return 'Venezuela — Occidente';
    case 'GY-C':
      return 'Guyana';
    case 'SR-C':
      return 'Suriname';
    case 'GF-C':
      return 'French Guiana';
    case 'PA-C':
      return 'Panama';
    case 'CR-C':
      return 'Costa Rica';
    case 'NI-C':
      return 'Nicaragua';
    case 'HN-C':
      return 'Honduras';
    case 'SV-C':
      return 'El Salvador';
    case 'GT-C':
      return 'Guatemala';
    case 'BZ-C':
      return 'Belize';
    case 'CU-C':
      return 'Cuba';
    case 'DO-C':
      return 'Dominican Republic';
    case 'HT-C':
      return 'Haiti';
    case 'JM-C':
      return 'Jamaica';
    case 'BS-C':
      return 'Bahamas';
    case 'TT-C':
      return 'Trinidad and Tobago';
    case 'BB-C':
      return 'Barbados';
    case 'LC-C':
      return 'Saint Lucia';
    case 'GD-C':
      return 'Grenada';
    case 'AG-C':
      return 'Antigua and Barbuda';
    case 'GP-C':
      return 'Guadeloupe';
    case 'MQ-C':
      return 'Martinique';
    case 'CW-C':
      return 'Curacao';
    case 'SX-C':
      return 'Sint Maarten';
    case 'AW-C':
      return 'Aruba';
    case 'PT-N':
      return 'Portugal — North';
    case 'PT-C':
      return 'Portugal — Central';
    case 'PT-S':
      return 'Portugal — South';
    case 'PT-M':
      return 'Portugal — Madeira';
    case 'PT-A':
      return 'Portugal — Azores';
    case 'ES-N':
      return 'Spain — North';
    case 'ES-C':
      return 'Spain — Central';
    case 'ES-S':
      return 'Spain — South';
    case 'ES-E':
      return 'Spain — East';
    case 'ES-CN':
      return 'Spain — Canary Islands';
    case 'FR-N':
      return 'France — North';
    case 'FR-C':
      return 'France — Central';
    case 'FR-S':
      return 'France — South';
    case 'FR-E':
      return 'France — East';
    case 'GB-S':
      return 'UK — South';
    case 'GB-M':
      return 'UK — Midlands';
    case 'GB-N':
      return 'UK — North';
    case 'DE-N':
      return 'Germany — North';
    case 'DE-W':
      return 'Germany — West';
    case 'DE-S':
      return 'Germany — South';
    case 'DE-E':
      return 'Germany — East';
    case 'NL-C':
      return 'Netherlands';
    case 'BE-C':
      return 'Belgium';
    case 'IT-N':
      return 'Italy — North';
    case 'IT-C':
      return 'Italy — Central';
    case 'IT-S':
      return 'Italy — South';
    case 'IE-E':
      return 'Ireland — East';
    case 'IE-W':
      return 'Ireland — West';
    case 'DK-E':
      return 'Denmark — East';
    case 'DK-W':
      return 'Denmark — West';
    case 'NO-S':
      return 'Norway — South';
    case 'NO-N':
      return 'Norway — North';
    case 'SE-S':
      return 'Sweden — South';
    case 'SE-N':
      return 'Sweden — North';
    case 'FI-S':
      return 'Finland — South';
    case 'FI-N':
      return 'Finland — North';
    case 'CH-C':
      return 'Switzerland';
    case 'AT-E':
      return 'Austria — East';
    case 'AT-W':
      return 'Austria — West';
    case 'PL-N':
      return 'Poland — North';
    case 'PL-C':
      return 'Poland — Central';
    case 'PL-S':
      return 'Poland — South';
    case 'CZ-W':
      return 'Czechia — West';
    case 'CZ-E':
      return 'Czechia — East';
    case 'SK-C':
      return 'Slovakia';
    case 'HU-C':
      return 'Hungary';
    case 'EE-C':
      return 'Estonia';
    case 'LV-C':
      return 'Latvia';
    case 'LT-C':
      return 'Lithuania';
    case 'HR-N':
      return 'Croatia — North';
    case 'HR-S':
      return 'Croatia — South';
    case 'SI-C':
      return 'Slovenia';
    case 'RO-W':
      return 'Romania — West';
    case 'RO-E':
      return 'Romania — East';
    case 'BG-C':
      return 'Bulgaria';
    case 'GR-N':
      return 'Greece — North';
    case 'GR-S':
      return 'Greece — South / Islands';
    case 'RS-C':
      return 'Serbia';
    case 'RU-M':
      return 'Russia — Moscow / Central';
    case 'RU-NW':
      return 'Russia — Northwest';
    case 'RU-N':
      return 'Russia — Arctic / Kaliningrad';
    case 'RU-V':
      return 'Russia — Volga / Urals';
    case 'RU-S':
      return 'Russia — South';
    case 'RU-SI':
      return 'Russia — Siberia';
    case 'RU-E':
      return 'Russia — Central Siberia';
    case 'RU-NE':
      return 'Russia — Yakutia / North Pacific';
    case 'RU-FE':
      return 'Russia — Far East';
    case 'IS-SW':
      return 'Iceland — Southwest';
    case 'IS-NE':
      return 'Iceland — North / East';
    case 'BA-C':
      return 'Bosnia and Herzegovina';
    case 'ME-C':
      return 'Montenegro';
    case 'AL-C':
      return 'Albania';
    case 'MK-C':
      return 'North Macedonia';
    case 'TR-W':
      return 'Turkey — West';
    case 'TR-C':
      return 'Turkey — Central / South';
    case 'TR-E':
      return 'Turkey — East';
    case 'UA-W':
      return 'Ukraine — West / Black Sea';
    case 'UA-C':
      return 'Ukraine — Central';
    case 'UA-E':
      return 'Ukraine — East';
    case 'BY-C':
      return 'Belarus';
    case 'MD-C':
      return 'Moldova';
    case 'GE-C':
      return 'Georgia';
    case 'AM-C':
      return 'Armenia';
    case 'AZ-C':
      return 'Azerbaijan';
    case 'LU-C':
      return 'Luxembourg';
    case 'MT-C':
      return 'Malta';
    case 'CY-C':
      return 'Cyprus';
    case 'XK-C':
      return 'Kosovo';
    case 'MA-N':
      return 'Morocco — North';
    case 'MA-C':
      return 'Morocco — Center';
    case 'MA-S':
      return 'Morocco — South';
    case 'DZ-N':
      return 'Algeria — North / Algiers';
    case 'DZ-W':
      return 'Algeria — West';
    case 'DZ-E':
      return 'Algeria — East';
    case 'TN-N':
      return 'Tunisia — North';
    case 'TN-S':
      return 'Tunisia — South / Coast';
    case 'EG-N':
      return 'Egypt — Nile Delta';
    case 'EG-S':
      return 'Egypt — Upper Nile';
    case 'EG-R':
      return 'Egypt — Red Sea';
    case 'IL-C':
      return 'Israel — Center';
    case 'IL-S':
      return 'Israel — South';
    case 'SA-W':
      return 'Saudi Arabia — West / Red Sea';
    case 'SA-C':
      return 'Saudi Arabia — Central';
    case 'SA-E':
      return 'Saudi Arabia — East / Gulf';
    case 'AE-N':
      return 'UAE — Northern Emirates';
    case 'AE-C':
      return 'UAE — Abu Dhabi';
    case 'QA-C':
      return 'Qatar';
    case 'BH-C':
      return 'Bahrain';
    case 'KW-C':
      return 'Kuwait';
    case 'OM-N':
      return 'Oman — North / Muscat';
    case 'OM-S':
      return 'Oman — South / Salalah';
    case 'IQ-C':
      return 'Iraq — Central / Baghdad';
    case 'IQ-S':
      return 'Iraq — South / Basra';
    case 'IQ-N':
      return 'Iraq — North / Kurdistan';
    case 'IR-N':
      return 'Iran — North / East';
    case 'IR-C':
      return 'Iran — Central / Tehran';
    case 'IR-S':
      return 'Iran — South / Gulf';
    case 'JO-C':
      return 'Jordan — Central / Amman';
    case 'JO-S':
      return 'Jordan — South / Aqaba';
    case 'LB-C':
      return 'Lebanon — Beirut';
    case 'SY-S':
      return 'Syria — South / Damascus';
    case 'SY-N':
      return 'Syria — North / Coast';
    case 'LY-W':
      return 'Libya — West / Tripoli';
    case 'LY-E':
      return 'Libya — East / Benghazi';
    case 'SD-C':
      return 'Sudan — Central / Khartoum';
    case 'SD-E':
      return 'Sudan — East / Port Sudan';
    case 'YE-N':
      return "Yemen — North / Sana'a";
    case 'YE-S':
      return 'Yemen — South / Aden';
    case 'PK-N':
      return 'Pakistan — North / Islamabad';
    case 'PK-S':
      return 'Pakistan — South / Karachi';
    case 'IN-N':
      return 'India — North / Delhi';
    case 'IN-W':
      return 'India — West / Mumbai';
    case 'IN-S':
      return 'India — South / Bengaluru';
    case 'IN-E':
      return 'India — East / Kolkata';
    case 'LK-W':
      return 'Sri Lanka — West / Colombo';
    case 'LK-E':
      return 'Sri Lanka — East / Hambantota';
    case 'KZ-S':
      return 'Kazakhstan — South / Almaty';
    case 'KZ-N':
      return 'Kazakhstan — North / Astana';
    case 'UZ-E':
      return 'Uzbekistan — East / Tashkent';
    case 'UZ-W':
      return 'Uzbekistan — West / Bukhara';
    case 'TM-C':
      return 'Turkmenistan — Ashgabat';
    case 'TJ-S':
      return 'Tajikistan — South / Dushanbe';
    case 'TJ-N':
      return 'Tajikistan — North / Khujand';
    case 'KG-N':
      return 'Kyrgyzstan — North / Bishkek';
    case 'KG-S':
      return 'Kyrgyzstan — South / Osh';
    case 'AF-N':
      return 'Afghanistan — North / Kabul';
    case 'AF-S':
      return 'Afghanistan — South / Kandahar';
    case 'NP-C':
      return 'Nepal — Kathmandu';
    case 'BD-C':
      return 'Bangladesh — Central / Dhaka';
    case 'BD-E':
      return 'Bangladesh — East / Chittagong';
    case 'BT-C':
      return 'Bhutan — Paro';
    case 'MM-S':
      return 'Myanmar — South / Yangon';
    case 'MM-N':
      return 'Myanmar — North / Mandalay';
    case 'TH-C':
      return 'Thailand — Central / Bangkok';
    case 'TH-N':
      return 'Thailand — North / Chiang Mai';
    case 'TH-S':
      return 'Thailand — South / Phuket';
    case 'VN-N':
      return 'Vietnam — North / Hanoi';
    case 'VN-S':
      return 'Vietnam — South / Ho Chi Minh';
    case 'MY-C':
      return 'Malaysia — Central / Kuala Lumpur';
    case 'MY-N':
      return 'Malaysia — North / Penang';
    case 'MY-E':
      return 'Malaysia — Sabah / Kota Kinabalu';
    case 'MY-K':
      return 'Malaysia — Sarawak / Kuching';
    case 'SG-C':
      return 'Singapore';
    case 'ID-J':
      return 'Indonesia — Java / Jakarta';
    case 'ID-S':
      return 'Indonesia — Sumatra / Medan';
    case 'ID-B':
      return 'Indonesia — Bali / Denpasar';
    case 'ID-K':
      return 'Indonesia — Kalimantan / Balikpapan';
    case 'ID-U':
      return 'Indonesia — Sulawesi / Makassar';
    case 'PH-L':
      return 'Philippines — Luzon / Manila';
    case 'PH-V':
      return 'Philippines — Visayas / Cebu';
    case 'PH-M':
      return 'Philippines — Mindanao / Davao';
    case 'CN-N':
      return 'China — North / Beijing';
    case 'CN-E':
      return 'China — East / Shanghai';
    case 'CN-S':
      return 'China — South / Guangzhou';
    case 'CN-W':
      return 'China — West / Chengdu';
    case 'JP-E':
      return 'Japan — Kanto / Tokyo';
    case 'JP-W':
      return 'Japan — Kansai / Osaka';
    case 'JP-S':
      return 'Japan — Kyushu / Fukuoka';
    case 'JP-N':
      return 'Japan — Hokkaido / Sapporo';
    case 'KR-C':
      return 'South Korea — Seoul / Incheon';
    case 'KR-S':
      return 'South Korea — Busan';
    case 'KR-J':
      return 'South Korea — Jeju';
    case 'TW-N':
      return 'Taiwan — Taipei / Taoyuan';
    case 'TW-S':
      return 'Taiwan — Kaohsiung';
    case 'AU-E':
      return 'Australia — Sydney / Canberra';
    case 'AU-S':
      return 'Australia — Melbourne / Adelaide';
    case 'AU-Q':
      return 'Australia — Queensland';
    case 'AU-W':
      return 'Australia — Perth';
    case 'NZ-N':
      return 'New Zealand — Auckland';
    case 'NZ-S':
      return 'New Zealand — Christchurch';
    case 'FJ-W':
      return 'Fiji — Nadi';
    case 'PG-S':
      return 'Papua New Guinea — Port Moresby';
    case 'NC-S':
      return 'New Caledonia — Noumea';
    case 'PF-I':
      return 'French Polynesia — Tahiti';
    case 'PF-L':
      return 'French Polynesia — Bora Bora';
    case 'PW-C':
      return 'Palau — Koror';
    case 'WS-U':
      return 'Samoa — Upolu';
    case 'WS-S':
      return "Samoa — Savai'i";
    case 'TO-T':
      return 'Tonga — Tongatapu';
    case 'TO-V':
      return "Tonga — Vava'u";
    case 'VU-C':
      return 'Vanuatu — Efate';
    case 'VU-S':
      return 'Vanuatu — Santo';
    case 'SB-G':
      return 'Solomon Islands — Guadalcanal';
    case 'SB-W':
      return 'Solomon Islands — Western';
    case 'CK-C':
      return 'Cook Islands — Rarotonga';
    case 'CK-N':
      return 'Cook Islands — Aitutaki';
    case 'KI-T':
      return 'Kiribati — Tarawa';
    case 'KI-L':
      return 'Kiribati — Kiritimati';
    case 'NG-SW':
      return 'Nigeria — Southwest / Lagos';
    case 'NG-C':
      return 'Nigeria — Central / Abuja';
    case 'GH-C':
      return 'Ghana — Accra';
    case 'SN-W':
      return 'Senegal — Dakar / Coast';
    case 'SN-E':
      return 'Senegal — East / Tambacounda';
    case 'CI-S':
      return "Côte d'Ivoire — Abidjan";
    case 'KE-C':
      return 'Kenya — Central / Nairobi';
    case 'KE-E':
      return 'Kenya — Coast / Mombasa';
    case 'ET-C':
      return 'Ethiopia — Addis Ababa';
    case 'ZA-G':
      return 'South Africa — Gauteng / Johannesburg';
    case 'ZA-W':
      return 'South Africa — Western Cape';
    case 'ZA-E':
      return 'South Africa — KwaZulu-Natal';
    case 'TZ-E':
      return 'Tanzania — Coast / Dar es Salaam';
    case 'TZ-N':
      return 'Tanzania — North / Kilimanjaro';
    case 'AO-N':
      return 'Angola — Luanda';
    case 'CM-L':
      return 'Cameroon — Littoral / Douala';
    case 'CM-C':
      return 'Cameroon — Centre / Yaoundé';
    case 'UG-C':
      return 'Uganda — Entebbe / Kampala';
    case 'RW-C':
      return 'Rwanda — Kigali';
    case 'MZ-S':
      return 'Mozambique — South / Maputo';
    case 'MZ-C':
      return 'Mozambique — Central / Beira';
    case 'NA-C':
      return 'Namibia — Central / Windhoek';
    case 'NA-W':
      return 'Namibia — Coast / Walvis Bay';
    case 'BW-C':
      return 'Botswana — Gaborone';
    case 'NG-N':
      return 'Nigeria — North / Kano';
    case 'ZM-C':
      return 'Zambia — Lusaka';
    case 'ZW-C':
      return 'Zimbabwe — Harare';
    case 'ZW-S':
      return 'Zimbabwe — South / Bulawayo';
    case 'MW-C':
      return 'Malawi — Central / Lilongwe';
    case 'MW-S':
      return 'Malawi — South / Blantyre';
    case 'CD-W':
      return 'DR Congo — West / Kinshasa';
    case 'CD-S':
      return 'DR Congo — South / Lubumbashi';
    case 'CD-N':
      return 'DR Congo — North / Kisangani';
    case 'CG-C':
      return 'Congo — Brazzaville';
    case 'CG-W':
      return 'Congo — Coast / Pointe-Noire';
    case 'GA-N':
      return 'Gabon — Libreville';
    case 'GA-W':
      return 'Gabon — Coast / Port-Gentil';
    case 'GQ-N':
      return 'Equatorial Guinea — Malabo';
    case 'CF-C':
      return 'Central African Republic — Bangui';
    case 'TD-C':
      return "Chad — N'Djamena";
    case 'BI-C':
      return 'Burundi — Bujumbura';
    case 'BJ-S':
      return 'Benin — Cotonou';
    case 'TG-S':
      return 'Togo — Lomé';
    case 'BF-C':
      return 'Burkina Faso — Ouagadougou';
    case 'ML-C':
      return 'Mali — Bamako';
    case 'NE-W':
      return 'Niger — Niamey';
    case 'GN-W':
      return 'Guinea — Conakry';
    case 'SL-W':
      return 'Sierra Leone — Freetown';
    case 'LR-C':
      return 'Liberia — Monrovia';
    case 'GM-W':
      return 'Gambia — Banjul';
    case 'GW-C':
      return 'Guinea-Bissau — Bissau';
    case 'CV-N':
      return 'Cabo Verde — Sal';
    case 'ST-C':
      return 'São Tomé and Príncipe';
    case 'MR-W':
      return 'Mauritania — Nouakchott';
    case 'MG-C':
      return 'Madagascar — Antananarivo';
    case 'MG-E':
      return 'Madagascar — Toamasina';
    case 'MU-C':
      return 'Mauritius';
    case 'SC-N':
      return 'Seychelles — Mahé';
    case 'KM-C':
      return 'Comoros — Moroni';
    case 'LS-C':
      return 'Lesotho — Maseru';
    case 'SZ-E':
      return 'Eswatini — King Mswati';
    case 'SO-S':
      return 'Somalia — Mogadishu';
    case 'DJ-E':
      return 'Djibouti';
    case 'ER-C':
      return 'Eritrea — Asmara';
    case 'SS-C':
      return 'South Sudan — Juba';
    default:
      return region;
  }
}

/** Compact climate for Freights / Rivals: local region first, rest collapsed. */
function MarketSignalsLine(props: {
  regions: RegionPressure[];
  focusIcao?: string;
  focusRegion?: string;
}) {
  const [worldOpen, setWorldOpen] = useState(false);
  const tokens: {
    key: string;
    region: string;
    text: string;
    title: string;
  }[] = [];
  for (const r of props.regions) {
    if (r.thinFleet) {
      tokens.push({
        key: `thin-${r.region}`,
        region: r.region,
        text: 'thin fleet',
        title: `${regionLabel(r.region)}: ${r.ready}/${r.total} ready to bid · ${r.resting} resting · ${r.maintenance ?? 0} in MX — thinner local fleet tends to raise outbound freights`,
      });
    }
    if (r.laneBusy) {
      tokens.push({
        key: `busy-${r.region}`,
        region: r.region,
        text: 'lane busy',
        title: `${regionLabel(r.region)}: outbound lanes are crowded — freight pays more, NPCs back off`,
      });
    }
    if (r.weather === 'marginal' || r.weather === 'poor') {
      tokens.push({
        key: `wx-${r.region}`,
        region: r.region,
        text: r.weather,
        title: `${regionLabel(r.region)}: simulated ${r.weather} weather today — freights pay more / expire sooner; local NPCs bid less`,
      });
    }
    if (r.fuelThin) {
      tokens.push({
        key: `fuel-${r.region}`,
        region: r.region,
        text: 'fuel thin',
        title: `${regionLabel(r.region)}: non-hub Jet-A is low and no road tanker is inbound — expect higher uplift prices until trucks catch up`,
      });
    }
  }
  if (tokens.length === 0) return null;

  const focusRegion = props.focusRegion;
  const focusCountry = focusRegion
    ? countryIdFromRegionLabel(focusRegion)
    : undefined;
  const local = focusRegion
    ? tokens.filter((t) => t.region === focusRegion)
    : [];
  const country =
    focusCountry && focusRegion
      ? tokens.filter(
          (t) =>
            t.region !== focusRegion &&
            countryIdFromRegionLabel(t.region) === focusCountry,
        )
      : [];
  const world = tokens.filter((t) => {
    if (focusRegion && t.region === focusRegion) return false;
    if (
      focusCountry &&
      countryIdFromRegionLabel(t.region) === focusCountry
    ) {
      return false;
    }
    return true;
  });
  // No hub focus yet — keep one short country-agnostic collapse of everything.
  const awaitingRegion = Boolean(props.focusIcao) && !focusRegion;
  const primary = focusRegion
    ? local
    : awaitingRegion
      ? []
      : tokens.slice(0, 3);
  const collapsed = focusRegion
    ? [...country, ...world]
    : awaitingRegion
      ? tokens
      : tokens.slice(3);
  const worldGroups = groupSignalsByCountry(collapsed);
  const worldShown = worldGroups.slice(0, 12);
  const worldHidden = worldGroups.length - worldShown.length;

  const nearLabel = props.focusIcao
    ? `Near ${props.focusIcao}${focusRegion ? ` · ${focusRegion}` : ''}`
    : focusRegion
      ? regionLabel(focusRegion)
      : 'Signals';

  return (
    <div className="market-signals">
      <p className="market-signals-line">
        <span className="market-signals-label">{nearLabel}</span>
        {awaitingRegion ? null : primary.length === 0 ? (
          <span className="market-signals-token"> · clear</span>
        ) : (
          primary.map((t) => (
            <span key={t.key} className="market-signals-token" title={t.title}>
              {' '}
              · {focusRegion ? t.text : `${t.region} ${t.text}`}
            </span>
          ))
        )}
        {collapsed.length > 0 ? (
          <>
            {' '}
            <button
              type="button"
              className="market-signals-more"
              aria-expanded={worldOpen}
              onClick={() => setWorldOpen((v) => !v)}
            >
              {worldOpen
                ? 'Hide more'
                : `More · ${worldGroups.length} countr${worldGroups.length === 1 ? 'y' : 'ies'}`}
            </button>
          </>
        ) : null}
      </p>
      {worldOpen && worldShown.length > 0 ? (
        <p className="market-signals-world">
          {worldShown.map((g, i) => (
            <span
              key={g.countryId}
              className="market-signals-token"
              title={g.title}
            >
              {i > 0 ? ' · ' : ''}
              {g.countryId} {g.count}
            </span>
          ))}
          {worldHidden > 0 ? (
            <span className="market-signals-token">
              {` · +${worldHidden} countr${worldHidden === 1 ? 'y' : 'ies'}`}
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function countryIdFromRegionLabel(region: string): string {
  const raw = region.trim().toUpperCase();
  const dash = raw.indexOf('-');
  if (dash > 0) return raw.slice(0, dash);
  return raw.slice(0, 2) || raw;
}

function groupSignalsByCountry(
  tokens: readonly {
    key: string;
    region: string;
    text: string;
    title: string;
  }[],
): Array<{ countryId: string; count: number; title: string }> {
  const map = new Map<string, { count: number; bits: string[] }>();
  for (const t of tokens) {
    const id = countryIdFromRegionLabel(t.region) || t.region;
    const cur = map.get(id) ?? { count: 0, bits: [] };
    cur.count += 1;
    if (cur.bits.length < 8) cur.bits.push(`${t.region} ${t.text}`);
    map.set(id, cur);
  }
  return [...map.entries()]
    .map(([countryId, v]) => ({
      countryId,
      count: v.count,
      title:
        v.bits.join(' · ') +
        (v.count > v.bits.length ? ` · +${v.count - v.bits.length}` : ''),
    }))
    .sort(
      (a, b) => b.count - a.count || a.countryId.localeCompare(b.countryId),
    );
}

function resolveHubRegion(
  icao: string | undefined,
  hubs: readonly { icao: string; region: string }[],
): string | undefined {
  if (!icao) return undefined;
  const id = icao.trim().toUpperCase();
  return hubs.find((h) => h.icao.toUpperCase() === id)?.region;
}

function haversineNm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  return 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function FuelLogisticsBlock(props: {
  inbound: FuelHaulView[];
  recent: FuelHaulView[];
  weightSystem: WeightSystem;
  onOpen: (icao: string) => void;
  busy: boolean;
}) {
  const { inbound, recent, weightSystem, onOpen, busy } = props;
  if (inbound.length === 0 && recent.length === 0) return null;
  return (
    <div className="fuel-logistics">
      <h3>Fuel logistics</h3>
      <p className="fuel-logistics-note">
        Background road tankers redistributing Jet-A from fuel hubs
      </p>
      {inbound.length > 0 ? (
        <ul className="fuel-haul-list">
          {inbound.map((h) => (
            <li key={h.id}>
              <strong>{h.truckLabel.replace(' tanker', '')}</strong>
              {' · '}
              <IcaoLink icao={h.originIcao} onOpen={onOpen} disabled={busy} />
              <span className="arrow"> → </span>
              <IcaoLink icao={h.destIcao} onOpen={onOpen} disabled={busy} />
              {' · '}
              {formatTonnes(h.cargoKg, weightSystem)}
              {' · '}
              {h.phase === 'arriving'
                ? 'arriving'
                : `ETA ${formatDuration(h.etaHours)}`}
              <small>
                {' '}
                · {h.truckName} · {h.progressPct}%
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="fuel-logistics-empty">No tanker inbound right now.</p>
      )}
      {recent.length > 0 ? (
        <ul className="fuel-haul-list fuel-haul-recent">
          {recent.map((h) => (
            <li key={`r-${h.id}`}>
              <span className="tag">Delivered</span>{' '}
              {formatTonnes(h.cargoKg, weightSystem)} from{' '}
              <IcaoLink icao={h.originIcao} onOpen={onOpen} disabled={busy} />
              <small> · {h.truckName}</small>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function eventChipLabel(kind: string): string {
  switch (kind) {
    case 'harvest_boost':
      return 'Harvest';
    case 'factory_outage':
      return 'Outage';
    case 'port_congestion':
      return 'Congestion';
    case 'festival_demand':
      return 'Festival';
    case 'labor_strike':
      return 'Strike';
    default:
      return 'Shock';
  }
}

function MarketEventsSummary(props: {
  events: EconomyEvent[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const { events, expanded, onToggle } = props;
  if (events.length === 0) return null;
  const preview = events
    .slice(0, 3)
    .map((ev) => `${eventChipLabel(ev.kind)} ${ev.region}`);
  const extra = events.length > 3 ? ` · +${events.length - 3}` : '';
  return (
    <div className="market-events-summary">
      <button
        type="button"
        className="market-events-toggle"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        {events.length} regional shock{events.length === 1 ? '' : 's'}
        {preview.length > 0 ? ` · ${preview.join(' · ')}${extra}` : ''}
        <span className="muted"> · {expanded ? 'Hide' : 'Show'}</span>
      </button>
      {expanded ? (
        <ul className="event-list market-events">
          {events.map((ev) => (
            <li key={ev.id} className={`event-badge shock-${ev.kind}`}>
              <strong>{ev.region}</strong> · {ev.label}
              <small> · ends {formatClock(ev.endsAtTick)}</small>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Secondary lot signals as one muted line (not a pill stack). Cap at 2. */
function lotPressureMeta(lot: {
  pressure?: LotPressure | null;
}): { text: string; title: string } | null {
  const tokens: string[] = [];
  const titles: string[] = [];
  const p = lot.pressure;
  if (p?.idleEscalated) {
    const pct = Math.round(((p.idlePayMult || 1) - 1) * 100);
    tokens.push(`Idle +${pct}%`);
    titles.push(`Freight has sat on the board — pay is up ${pct}% vs formation`);
  }
  if (p?.weather === 'marginal' || p?.weather === 'poor') {
    tokens.push(p.weather);
    titles.push(
      `Simulated ${p.weather} weather on this lane — richer / shorter-lived freights`,
    );
  }
  if (p?.laneBusy) {
    tokens.push('Busy');
    titles.push(
      `Lane is crowded (${Math.round((p.laneSaturation || 0) * 100)}% inbound) — freight pays more, NPCs back off`,
    );
  }
  if (p?.thinFleet) {
    tokens.push('Thin');
    titles.push(
      `${regionLabel(p.originRegion || 'region')}: local fleet is thin — outbound freight pays more`,
    );
  }
  if (p?.demandShock) {
    const label = (p.shockLabels ?? ['Shock'])[0]!;
    tokens.push(label);
    titles.push(
      `Regional demand shock — freight pay ×${(p.shockPayMult ?? 1).toFixed(2)}`,
    );
  }
  if (tokens.length === 0) return null;
  const shown = tokens.slice(0, 3);
  const extra = tokens.length - shown.length;
  return {
    text: extra > 0 ? `${shown.join(' · ')} · +${extra}` : shown.join(' · '),
    title: titles.join(' · '),
  };
}

function idleUptickPct(lot: {
  pressure?: LotPressure | null;
  npcClaim?: { crewNeeded?: boolean; pilotFeeUsd?: number } | null;
}): number | null {
  // Crew fee is not lot pay — idle % would mislead.
  if (
    lot.npcClaim?.crewNeeded &&
    typeof lot.npcClaim.pilotFeeUsd === 'number'
  ) {
    return null;
  }
  if (!lot.pressure?.idleEscalated) return null;
  const pct = Math.round(((lot.pressure.idlePayMult || 1) - 1) * 100);
  return pct > 0 ? pct : null;
}

function fallbackMaxCargoKg(aircraft: AircraftClass): number {
  if (aircraft === 'wide_freighter') return 90_000;
  if (aircraft === 'medium_piston') return 10_000;
  if (aircraft === 'light_turboprop') return 1_704;
  if (aircraft === 'light_jet') return 1_450;
  if (aircraft === 'light_ga') return 450;
  return 18_137;
}

function resolveMissionStructuralMaxCargoKg(
  mission: Mission,
  fleet: PlayerAircraft[],
  airframePerf: Record<string, { maxCargoKg?: number }>,
  structuralFromApi: number | null,
  activeMissionId?: string,
): number {
  const acf = mission.aircraftId
    ? fleet.find((a) => a.id === mission.aircraftId)
    : undefined;
  const typeId =
    mission.airframeTypeId?.trim() || acf?.airframeTypeId?.trim() || '';

  if (
    activeMissionId === mission.id &&
    structuralFromApi !== null &&
    structuralFromApi > 0
  ) {
    return structuralFromApi;
  }

  if (typeId) {
    const perfKg = airframePerf[typeId]?.maxCargoKg;
    if (typeof perfKg === 'number' && perfKg > 0) return perfKg;
  }

  if (acf?.airframeTypeId) {
    const perfKg = airframePerf[acf.airframeTypeId]?.maxCargoKg;
    if (typeof perfKg === 'number' && perfKg > 0) return perfKg;
  }

  return fallbackMaxCargoKg(mission.aircraftClassId as AircraftClass);
}

function aircraftMaxRangeNm(aircraft: AircraftClass): number {
  if (aircraft === 'wide_freighter') return 6_000;
  if (aircraft === 'medium_piston') return 2_200;
  if (aircraft === 'light_turboprop') return 900;
  if (aircraft === 'light_jet') return 2_000;
  if (aircraft === 'light_ga') return 800;
  return 2_500;
}

function isActiveMissionStatus(status: string): boolean {
  return status === 'accepted' || status === 'dispatched' || status === 'in_flight';
}

/** API 409 before a save is open — the profile gate already covers this. */
function isNeedsProfileMessage(message: string): boolean {
  return /Select a career profile first/i.test(message);
}

/** 401 noise from in-flight polls during AuthGate / account switch. */
function isAuthRequiredMessage(message: string): boolean {
  return /authentication required/i.test(message);
}

/** Skip banners that the gate already handled or that lost a race to a new login. */
function shouldSurfaceApiError(message: string): boolean {
  if (isNeedsProfileMessage(message)) return false;
  // AuthGate is the UX for 401 — never paint a red banner (esp. after logout
  // when in-flight polls return Authentication required with no Bearer).
  if (isAuthRequiredMessage(message)) return false;
  return true;
}

/**
 * True when the player has started (or is flying) the Dispatch / Watch pipeline.
 * Bare Accepted / crew-operated legs do not count — Freights stays open and the
 * Active-flight banners stay off.
 */
function isPlayerDispatchMission(mission: Mission): boolean {
  if (mission.crewOperated) return false;
  if (mission.status === 'dispatched' || mission.status === 'in_flight') {
    return true;
  }
  if (mission.status !== 'accepted') return false;
  return Boolean(
    mission.staticId ||
      mission.lastOfpCheck ||
      mission.fuelAuthorizedOfpId ||
      mission.lastPreflightCheck,
  );
}

/** Split sister legs wait on FBO for Crew fly — not the Dispatch OFP pipeline. */
function isFboSplitSisterMission(mission: Mission): boolean {
  return /\u00b7\s*split\b/i.test(mission.reason ?? '');
}

/**
 * Mission shown on the Dispatch board / Watch automation.
 * Excludes crew airborne and Split sisters waiting for Crew fly.
 * When `pilotAccountId` is set (VA), prefer that pilot's mission so a friend's
 * flight does not take over Dispatch / Watch.
 */
function findDispatchBoardMission(
  missions: Mission[],
  pilotAccountId?: string | null,
): Mission | undefined {
  const player = findPlayerDispatchMission(missions, pilotAccountId);
  if (player) return player;
  const actor = pilotAccountId?.trim() || '';
  const candidates = missions.filter((m) => {
    if (
      !isActiveMissionStatus(m.status) ||
      m.crewOperated ||
      isFboSplitSisterMission(m)
    ) {
      return false;
    }
    if (!actor) return true;
    const owner = m.pilotAccountId?.trim() || '';
    if (!owner) return true;
    return owner === actor;
  });
  if (candidates.length === 0) return undefined;
  return candidates.reduce((best, mission) =>
    (mission.acceptedAtTick ?? 0) >= (best.acceptedAtTick ?? 0) ? mission : best,
  );
}

/** Personal Dispatch / Watch only — never crew airborne. */
function findPlayerDispatchMission(
  missions: Mission[],
  pilotAccountId?: string | null,
): Mission | undefined {
  const actor = pilotAccountId?.trim() || '';
  const active = missions.filter((m) => {
    if (!isActiveMissionStatus(m.status) || !isPlayerDispatchMission(m)) {
      return false;
    }
    if (!actor) return true;
    const owner = m.pilotAccountId?.trim() || '';
    if (!owner) return true;
    return owner === actor;
  });
  if (active.length === 0) return undefined;
  return active.reduce((best, mission) =>
    (mission.acceptedAtTick ?? 0) >= (best.acceptedAtTick ?? 0) ? mission : best,
  );
}

function missionLotLines(mission: Mission): Array<{
  shipmentLotId: string;
  cargoKg: number;
}> {
  if (mission.lots?.length) {
    return mission.lots.map((line) => ({
      shipmentLotId: line.shipmentLotId,
      cargoKg: line.cargoKg,
    }));
  }
  if (mission.shipmentLotId) {
    return [
      {
        shipmentLotId: mission.shipmentLotId,
        cargoKg: mission.cargoKg,
      },
    ];
  }
  return [];
}

function stagingManifestEditDirty(
  draft: StagingDraft,
  mission: Mission | undefined,
): boolean {
  if (!draft.replaceManifest || !mission) return false;
  const saved = missionLotLines(mission).map((line) => ({
    lotId: line.shipmentLotId,
    cargoKg: Math.max(0, Math.floor(line.cargoKg)),
  }));
  const staged = draft.lines.map((line) => ({
    lotId: line.lot.id,
    cargoKg: Math.max(0, Math.floor(line.cargoKg)),
  }));
  if (saved.length !== staged.length) return true;
  const savedKg = new Map(saved.map((line) => [line.lotId, line.cargoKg]));
  return staged.some((line) => savedKg.get(line.lotId) !== line.cargoKg);
}

/** Open player flight that blocks staging (hidden accepted leg or same-route hold). */
function findStagingBlockingMission(
  draft: StagingDraft,
  missionList: Mission[],
): Mission | undefined {
  const editingId =
    draft.replaceManifest && draft.intoMissionId
      ? draft.intoMissionId
      : undefined;
  const lotIds = new Set(draft.lines.map((line) => line.lot.id));
  for (const mission of missionList) {
    if (!isActiveMissionStatus(mission.status) || mission.crewOperated) continue;
    if (editingId && mission.id === editingId) continue;
    if (missionLotLines(mission).some((line) => lotIds.has(line.shipmentLotId))) {
      return mission;
    }
  }
  if (draft.intoMissionId && !draft.replaceManifest) {
    const bound = missionList.find(
      (mission) =>
        mission.id === draft.intoMissionId && isActiveMissionStatus(mission.status),
    );
    if (bound) return bound;
  }
  const routeMatches = missionList.filter(
    (mission) =>
      isActiveMissionStatus(mission.status) &&
      !mission.crewOperated &&
      mission.id !== editingId &&
      mission.originIcao === draft.originIcao &&
      mission.destIcao === draft.destIcao &&
      mission.aircraftClassId === draft.aircraft &&
      (!draft.aircraftId ||
        !mission.aircraftId ||
        mission.aircraftId === draft.aircraftId),
  );
  return routeMatches.length === 1 ? routeMatches[0] : undefined;
}

function bookedKgForStagingLot(
  lotId: string,
  missionList: Mission[],
): number {
  for (const mission of missionList) {
    if (!isActiveMissionStatus(mission.status) || mission.crewOperated) continue;
    for (const line of missionLotLines(mission)) {
      if (line.shipmentLotId === lotId) {
        return Math.max(0, Math.floor(line.cargoKg));
      }
    }
  }
  return 0;
}

function stagingResolvedLot(
  draft: StagingDraft,
  lot: MarketLot,
  missionList: Mission[],
  routeLots: MarketLot[],
  marketLots: MarketLot[],
): MarketLot {
  const live =
    routeLots.find((row) => row.id === lot.id) ??
    marketLots.find((row) => row.id === lot.id);
  const base = live ?? lot;
  const boardAvail = Math.max(0, Math.floor(base.availableKg ?? 0));
  // New staging must trust the board free slice only. manifestEditAvailableKg
  // takes max(quantityKg, …) which inflates past reserved kg and lets Accept
  // request more than lotAvailableKg (e.g. 8900 requested, 900 free).
  // Edit/replace credits back this flight's booked slice so the slider can keep it.
  const bookedKg = draft.replaceManifest
    ? bookedKgForStagingLot(lot.id, missionList)
    : 0;
  const availableKg =
    bookedKg > 0
      ? manifestEditAvailableKg({
          bookedKg,
          lotQuantityKg: base.quantityKg,
          marketAvailableKg: boardAvail,
        })
      : boardAvail;
  return {
    ...base,
    availableKg,
    quantityKg: Math.max(base.quantityKg ?? 0, availableKg),
  };
}

/** Most recent company-crew airborne leg (sidebar status only). */
function findCrewAirborneMission(missions: Mission[]): Mission | undefined {
  const airborne = missions.filter(
    (m) => m.crewOperated === true && m.status === 'in_flight',
  );
  if (airborne.length === 0) return undefined;
  return airborne.reduce((best, mission) =>
    (mission.acceptedAtTick ?? 0) >= (best.acceptedAtTick ?? 0) ? mission : best,
  );
}

/** Format a wall-clock duration in hours; shows minutes when under 2 hours. */
function formatDuration(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(Math.abs(hours) * 60));
  if (totalMinutes < 120) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h <= 0) return `${m}m`;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  const totalHours = Math.round(totalMinutes / 60);
  if (totalHours < HOURS_PER_DAY) {
    return `${totalHours}h`;
  }
  const days = Math.floor(totalHours / HOURS_PER_DAY);
  const rem = totalHours % HOURS_PER_DAY;
  return rem === 0 ? `${days}d` : `${days}d ${rem}h`;
}

/** Continuous clock from fractional economy ticks: Day 1 · 14:37 */
function formatClock(continuousTicks: number): string {
  const totalMinutes = Math.max(
    0,
    Math.floor(continuousTicks * HOURS_PER_TICK * 60),
  );
  const day = Math.floor(totalMinutes / (HOURS_PER_DAY * 60)) + 1;
  const rem = totalMinutes % (HOURS_PER_DAY * 60);
  const hour = Math.floor(rem / 60);
  const minute = rem % 60;
  return `Day ${day} · ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Wall countdown to the next economy tick pulse (compact topbar). */
function formatNextPulseCountdown(msRemaining: number): string {
  const sec = Math.max(0, Math.ceil(msRemaining / 1000));
  // Fixed-width under 1h so the World chip does not resize every second
  // (and when seconds hit :00).
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  }
  const h = Math.floor(sec / 3600);
  const rm = Math.floor((sec % 3600) / 60);
  return `${h}h ${String(rm).padStart(2, '0')}m`;
}

function formatExpiry(opts: {
  expiresAtTick: number;
  ticksRemaining?: number;
  currentTick: number;
  continuousHours: number;
}): string {
  const remaining =
    opts.ticksRemaining ?? Math.max(0, opts.expiresAtTick - opts.currentTick);
  if (opts.currentTick >= opts.expiresAtTick) {
    return 'Expired';
  }
  // Soft continuous remaining within the current 15-min batch.
  const frac = opts.continuousHours - opts.currentTick;
  const continuousRemainingTicks = Math.max(
    0,
    remaining - Math.min(1, Math.max(0, frac)),
  );
  return `${formatDuration(continuousRemainingTicks * HOURS_PER_TICK)} left`;
}

function formatDeadline(deadlineTick: number, continuousHours: number): string {
  const deltaTicks = deadlineTick - continuousHours;
  if (deltaTicks < 0) {
    return `Overdue by ${formatDuration(Math.abs(deltaTicks) * HOURS_PER_TICK)} · was ${formatClock(deadlineTick)}`;
  }
  if (deltaTicks * HOURS_PER_TICK < 1 / 60) {
    return `Due now (${formatClock(deadlineTick)})`;
  }
  return `Due in ${formatDuration(deltaTicks * HOURS_PER_TICK)} · ${formatClock(deadlineTick)}`;
}

function stationMapDrifted(
  prev: Record<number, number> | undefined,
  next: Record<number, number> | undefined,
  tolLb: number,
): boolean {
  if (!next) return false;
  if (!prev) return true;
  const keys = new Set([
    ...Object.keys(prev).map(Number),
    ...Object.keys(next).map(Number),
  ]);
  for (const key of keys) {
    if (Math.abs((prev[key] ?? 0) - (next[key] ?? 0)) >= tolLb) return true;
  }
  return false;
}

function liveProgress(opts: {
  departedAtMs?: number;
  arrivesAtMs?: number;
  nowMs: number;
  fallbackPct?: number;
}): number {
  if (
    typeof opts.departedAtMs === 'number' &&
    typeof opts.arrivesAtMs === 'number' &&
    opts.arrivesAtMs > opts.departedAtMs
  ) {
    const duration = opts.arrivesAtMs - opts.departedAtMs;
    const flown = Math.min(duration, Math.max(0, opts.nowMs - opts.departedAtMs));
    return Math.min(100, Math.round((flown / duration) * 100));
  }
  return opts.fallbackPct ?? 0;
}

function liveEtaHours(opts: {
  arrivesAtMs?: number;
  nowMs: number;
  fallbackHours?: number;
}): number {
  if (typeof opts.arrivesAtMs === 'number') {
    return Math.max(0, (opts.arrivesAtMs - opts.nowMs) / MS_PER_HOUR);
  }
  return opts.fallbackHours ?? 0;
}

function livePhase(
  etaHours: number,
  fallback?: string,
): 'enroute' | 'arriving' | string {
  // Match server arriving window: last economy batch (~15 min).
  if (etaHours <= HOURS_PER_TICK) return 'arriving';
  if (fallback === 'boarding' || fallback === 'turnaround' || fallback === 'idle') {
    return fallback;
  }
  return 'enroute';
}

function loadSimbriefUser(): string {
  try {
    return localStorage.getItem(SIMBRIEF_USER_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Open SimBrief in the OS browser — never navigate the Skyline window. */
async function openSimBriefDispatchUrl(url: string): Promise<boolean> {
  const href = url.trim();
  if (!href || !/^https?:\/\//i.test(href)) return false;
  const desktop = window.skylineDesktop;
  if (desktop?.openExternal) {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        desktop.openExternal(href),
        new Promise<null>((resolve) => {
          timeoutId = setTimeout(() => resolve(null), 8_000);
        }),
      ]);
      if (result?.ok) return true;
    } catch {
      // Fall through to window.open.
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }
  // Prefer a real http window.open. Avoid "noopener" in features — it makes
  // the return value null even on success. Electron denies the window but may
  // still forward http to the OS via setWindowOpenHandler.
  try {
    const win = window.open(href, '_blank');
    if (win) {
      try {
        win.opener = null;
      } catch {
        /* ignore */
      }
      return true;
    }
  } catch {
    /* popup blocked */
  }
  const gestureActive =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.userActivation?.isActive);
  if (!gestureActive) return false;
  try {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  } catch {
    return false;
  }
}

/**
 * First Open must await /api/dispatch (no URL yet). Hold a blank tab under the
 * click gesture in the browser; desktop relies on IPC after the await.
 */
function reserveSimBriefBrowserTab(): Window | null {
  if (window.skylineDesktop?.openExternal) return null;
  try {
    return window.open('about:blank', '_blank');
  } catch {
    return null;
  }
}

function navigateReservedSimBriefTab(
  pending: Window | null,
  href: string,
): boolean {
  if (!pending || pending.closed) return false;
  try {
    pending.location.href = href;
    return true;
  } catch {
    try {
      pending.close();
    } catch {
      /* ignore */
    }
    return false;
  }
}

function readLastFboIcao(): string | null {
  try {
    const value = sessionStorage.getItem(LAST_FBO_ICAO_KEY);
    return value ? value.toUpperCase() : null;
  } catch {
    return null;
  }
}

function writeLastFboIcao(icao: string): void {
  try {
    sessionStorage.setItem(LAST_FBO_ICAO_KEY, icao.toUpperCase());
  } catch {
    // ignore quota / private mode
  }
}

function marketLotToAirportLot(lot: MarketLot): AirportLot {
  return {
    id: lot.id,
    originIcao: lot.originIcao,
    destIcao: lot.destIcao,
    commodityId: lot.commodityId,
    commodityName: lot.commodityName,
    availableKg: lot.availableKg,
    quantityKg: lot.quantityKg,
    payUsd: lot.payUsd,
    basePayUsd: lot.basePayUsd,
    estimatedFuelCostUsd: lot.estimatedFuelCostUsd,
    estimatedNetUsd: lot.estimatedNetUsd,
    estimatedLiftKg: lot.estimatedLiftKg,
    estimatedMarginPct: lot.estimatedMarginPct,
    estimatedFuelFeasible: lot.estimatedFuelFeasible,
    estimatedInRange: lot.estimatedInRange,
    urgency: lot.urgency,
    status: 'available',
    createdAtTick: lot.createdAtTick ?? 0,
    expiresAtTick: lot.expiresAtTick,
    ticksRemaining: lot.ticksRemaining ?? 0,
    expired: false,
    perishable: Boolean(lot.perishable),
    bush: lot.bush,
    lastMile: lot.lastMile,
    distanceNm: lot.distanceNm,
    reason: lot.reason,
    idleEscalated: lot.idleEscalated,
    international: lot.international,
    pressure: lot.pressure,
    npcClaim: lot.npcClaim,
  };
}

/** Enough AirportView to paint the terminal before `/api/airport` finishes. */
function buildOptimisticAirportView(
  icao: string,
  opts: {
    hub?: NetworkHub | null;
    playerFbos?: PlayerFboSnapshot | null;
    homeHubIcao?: string | null;
    tick: number;
    lastBatchAtMs: number;
    msPerTick: number;
    lots?: MarketLot[];
  },
): AirportView {
  const code = icao.trim().toUpperCase();
  const hub = opts.hub ?? null;
  const related = (opts.lots ?? []).filter(
    (lot) =>
      lot.originIcao.toUpperCase() === code ||
      lot.destIcao.toUpperCase() === code,
  );
  return {
    serverNowMs: Date.now(),
    lastBatchAtMs: opts.lastBatchAtMs,
    tick: opts.tick,
    continuousHours: 0,
    msPerTick: opts.msPerTick,
    airport: {
      icao: code,
      name: hub?.name ?? code,
      region: hub?.region ?? '',
      level: hub?.level ?? 1,
      lat: hub?.lat,
      lon: hub?.lon,
      hubTier: hub?.hubTier,
      bush: hub?.bush,
      bushTripOnly: hub?.bushTripOnly,
    },
    totalStockKg: 0,
    totalStockTonnes: 0,
    commodities: [],
    outboundLots: related
      .filter((lot) => lot.originIcao.toUpperCase() === code)
      .map(marketLotToAirportLot),
    inboundLots: related
      .filter((lot) => lot.destIcao.toUpperCase() === code)
      .map(marketLotToAirportLot),
    arrivals: [],
    departures: [],
    npcActivity: [],
    fuelInbound: [],
    fuelRecent: [],
    playerFbos: opts.playerFbos ?? null,
    homeHubIcao: opts.homeHubIcao ?? null,
    runways: [],
  };
}

function mergeAirportStock(
  prev: AirportView | null,
  stock: AirportView,
): AirportView {
  if (!prev || prev.airport.icao !== stock.airport.icao) return stock;
  return {
    ...stock,
    airport: {
      ...stock.airport,
      name: prev.airport.name || stock.airport.name,
      region: prev.airport.region || stock.airport.region,
      lat: prev.airport.lat ?? stock.airport.lat,
      lon: prev.airport.lon ?? stock.airport.lon,
      hubTier: prev.airport.hubTier ?? stock.airport.hubTier,
    },
    outboundLots: stock.outboundLots.length
      ? stock.outboundLots
      : prev.outboundLots,
    inboundLots: stock.inboundLots.length
      ? stock.inboundLots
      : prev.inboundLots,
    arrivals: stock.arrivals?.length ? stock.arrivals : prev.arrivals,
    departures: stock.departures?.length ? stock.departures : prev.departures,
    npcActivity: stock.npcActivity?.length ? stock.npcActivity : prev.npcActivity,
    playerFbos: stock.playerFbos ?? prev.playerFbos,
    events: stock.events?.length ? stock.events : prev.events,
    runways: stock.runways?.length ? stock.runways : prev.runways,
    homeHubIcao: stock.homeHubIcao ?? prev.homeHubIcao,
    charter: stock.charter ?? prev.charter ?? null,
  };
}

function LotExpiry(props: {
  lot: MarketLot | AirportLot;
  tick: number;
  continuousHours: number;
  nowMs?: number;
}) {
  const claim = props.lot.npcClaim;
  // Crew-needed holds stay on the board past market expiry until the pilot
  // window closes — show that window instead of a misleading "Expired".
  if (claim?.crewNeeded) {
    const kind = claim.crewReposition ? 'Ferry' : 'Contract';
    const untilMs = claim.awaitingPilotUntilMs;
    const nowMs = props.nowMs ?? Date.now();
    if (typeof untilMs === 'number' && Number.isFinite(untilMs)) {
      const leftMs = untilMs - nowMs;
      if (leftMs <= 0) {
        return (
          <span
            className="expiry overdue"
            title={`${kind} window closed — operator departing`}
          >
            Closed
          </span>
        );
      }
      const leftHours = leftMs / MS_PER_HOUR;
      return (
        <span
          className={leftHours <= 1 ? 'expiry soon' : 'expiry'}
          title={`${kind}${
            claim.aircraftClassId
              ? ` · ${aircraftClassLabel(claim.aircraftClassId)}`
              : ''
          } · market deadline paused while open`}
        >
          {formatDuration(leftHours)} left
        </span>
      );
    }
    return (
      <span
        className="expiry"
        title={`${kind} open — operator waiting for a pilot`}
      >
        Open
      </span>
    );
  }

  const remaining =
    'ticksRemaining' in props.lot && props.lot.ticksRemaining !== undefined
      ? props.lot.ticksRemaining
      : Math.max(0, props.lot.expiresAtTick - props.tick);
  const overdue = props.tick >= props.lot.expiresAtTick;
  return (
    <span className={overdue ? 'expiry overdue' : remaining <= 6 ? 'expiry soon' : 'expiry'}>
      {formatExpiry({
        expiresAtTick: props.lot.expiresAtTick,
        ticksRemaining: remaining,
        currentTick: props.tick,
        continuousHours: props.continuousHours,
      })}
    </span>
  );
}

function formatCrewFeeText(
  claim: { pilotFeeUsd?: number; pilotFeeMinUsd?: number },
  formatMoney: (n: number) => string,
): string | null {
  if (typeof claim.pilotFeeUsd !== 'number') return null;
  const max = claim.pilotFeeUsd;
  const min =
    typeof claim.pilotFeeMinUsd === 'number' ? claim.pilotFeeMinUsd : max;
  if (min < max) return `${formatMoney(min)}–${formatMoney(max)}`;
  return formatMoney(max);
}

function CrewFeeAmount(props: {
  claim: { pilotFeeUsd?: number; pilotFeeMinUsd?: number };
  formatMoney: (n: number) => string;
  title?: string;
}) {
  if (typeof props.claim.pilotFeeUsd !== 'number') return null;
  const max = props.claim.pilotFeeUsd;
  const min =
    typeof props.claim.pilotFeeMinUsd === 'number'
      ? props.claim.pilotFeeMinUsd
      : max;
  if (min < max) {
    return (
      <span className="pay-range" title={props.title}>
        {props.formatMoney(min)}–{props.formatMoney(max)}
      </span>
    );
  }
  return <span title={props.title}>{props.formatMoney(max)}</span>;
}

function NpcTakenBadge(props: {
  claim?: NpcClaim | null;
  nowMs: number;
  weightSystem?: WeightSystem;
  formatMoney?: (n: number) => string;
}) {
  if (!props.claim) return null;
  if (props.claim.crewNeeded) {
    const eta = liveEtaHours({
      arrivesAtMs: props.claim.awaitingPilotUntilMs ?? props.claim.arrivesAtMs,
      nowMs: props.nowMs,
      fallbackHours: props.claim.etaHours,
    });
    const feeFmt = props.formatMoney ?? formatBoardMoney;
    const fee = formatCrewFeeText(props.claim, feeFmt);
    const classLabel = props.claim.aircraftClassId
      ? aircraftClassLabel(props.claim.aircraftClassId)
      : props.claim.aircraftLabel;
    const tipParts = [
      props.claim.crewReposition ? 'Ferry' : 'Contract',
      props.claim.npcName,
      classLabel,
      fee ? `fee ${fee}` : null,
      !props.claim.crewReposition && props.claim.cargoKg > 0
        ? formatTonnes(props.claim.cargoKg, props.weightSystem)
        : null,
      `${formatDuration(eta)} left`,
    ].filter(Boolean);
    return (
      <span
        className={`npc-badge npc-badge-crew${props.claim.crewReposition ? ' npc-badge-reposition' : ''}`}
        title={tipParts.join(' · ')}
      >
        {props.claim.crewReposition ? 'Ferry' : 'Contract'}
        {classLabel ? (
          <span className="npc-badge-class"> · {classLabel}</span>
        ) : null}
        <span className="npc-badge-eta"> · {formatDuration(eta)}</span>
      </span>
    );
  }
  const eta = liveEtaHours({
    arrivesAtMs: props.claim.arrivesAtMs,
    nowMs: props.nowMs,
    fallbackHours: props.claim.etaHours,
  });
  return (
    <span
      className="npc-badge"
      title={`${props.claim.npcName} · ${formatTonnes(props.claim.cargoKg, props.weightSystem)} · ETA ${formatDuration(eta)}`}
    >
      Taken
      <span className="npc-badge-eta"> · {formatDuration(eta)}</span>
    </span>
  );
}

function ProgressTrack(props: { pct: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, props.pct));
  return (
    <div className="progress-track" title={props.label ?? `${pct}%`}>
      <span style={{ width: `${pct}%` }} />
      <em>{pct}%</em>
    </div>
  );
}

function phaseLabel(phase: string): string {
  switch (phase) {
    case 'arriving':
      return 'Arriving';
    case 'enroute':
      return 'En route';
    case 'turnaround':
      return 'Turnaround';
    case 'resting':
      return 'Resting';
    case 'maintenance':
      return 'Maintenance';
    case 'boarding':
      return 'Boarding';
    case 'idle':
      return 'Idle';
    default:
      return phase;
  }
}

function MovementBoard(props: {
  title: string;
  rows: AirportMovement[];
  onOpen: (icao: string) => void;
  busy?: boolean;
  empty: string;
  mode: 'arrivals' | 'departures';
  nowMs: number;
  weightSystem?: WeightSystem;
}) {
  return (
    <div className="movement-board">
      <h3>{props.title}</h3>
      {props.rows.length === 0 ? (
        <p className="empty">{props.empty}</p>
      ) : (
        <ul className="movement-list">
          {props.rows.map((row) => {
            const other = props.mode === 'arrivals' ? row.originIcao : row.destIcao;
            const eta = liveEtaHours({
              arrivesAtMs: row.arrivesAtMs,
              nowMs: props.nowMs,
              fallbackHours: row.etaHours,
            });
            const pct = liveProgress({
              departedAtMs: row.departedAtMs,
              arrivesAtMs: row.arrivesAtMs,
              nowMs: props.nowMs,
              fallbackPct: row.progressPct,
            });
            const phase =
              row.phase === 'boarding' || row.phase === 'turnaround'
                ? row.phase
                : livePhase(eta, row.phase);
            return (
              <li key={`${row.kind}-${row.id}`} className={`movement movement-${row.kind}`}>
                <div className="movement-head">
                  <strong>{row.operatorName}</strong>
                  <span className={`phase-tag phase-${phase}`}>{phaseLabel(phase)}</span>
                  {row.kind === 'player' ? (
                    <span className={row.crewOperated ? 'tag' : 'tag you'}>
                      {row.crewOperated ? 'Crew' : 'You'}
                    </span>
                  ) : null}
                  {row.urgency === 'urgent' ? <span className="tag">Urgent</span> : null}
                </div>
                <div className="route">
                  {props.mode === 'arrivals' ? (
                    <>
                      <span className="muted">from</span>
                      <IcaoLink icao={other} onOpen={props.onOpen} disabled={props.busy} />
                    </>
                  ) : (
                    <>
                      <span className="muted">to</span>
                      <IcaoLink icao={other} onOpen={props.onOpen} disabled={props.busy} />
                    </>
                  )}
                </div>
                <p>
                  {row.commodityName} · {formatTonnes(row.cargoKg, props.weightSystem)}
                  {props.mode === 'arrivals'
                    ? ` · ETA ${formatDuration(eta)}`
                    : row.phase === 'boarding'
                      ? ' · not departed'
                      : ` · ${pct}% outbound`}
                </p>
                <ProgressTrack pct={pct} />
                <small>
                  {row.aircraftLabel ?? row.aircraftClassId}
                  {isFiniteMoney(row.distanceNm)
                    ? ` · ${formatBoardDistanceNm(row.distanceNm)}`
                    : ''}
                  {typeof row.arrivesAtMs === 'number'
                    ? ` · ETA ${formatDuration(eta)}`
                    : ''}
                </small>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type FleetPhaseFilter =
  | ''
  | 'airborne'
  | 'enroute'
  | 'arriving'
  | 'turnaround'
  | 'resting'
  | 'maintenance'
  | 'idle';

function resolveNpcLiveState(npc: NpcFleetMember, nowMs: number) {
  const mission = npc.mission;
  const eta = mission
    ? liveEtaHours({
        arrivesAtMs: mission.arrivesAtMs,
        nowMs,
        fallbackHours: mission.etaHours,
      })
    : 0;
  const pct = mission
    ? liveProgress({
        departedAtMs: mission.departedAtMs,
        arrivesAtMs: mission.arrivesAtMs,
        nowMs,
        fallbackPct: mission.progressPct,
      })
    : 0;
  const turnaroundLeft =
    npc.phase === 'turnaround' && typeof npc.busyUntilMs === 'number'
      ? Math.max(0, (npc.busyUntilMs - nowMs) / MS_PER_HOUR)
      : npc.turnaroundHoursLeft;
  const restLeft =
    npc.phase === 'resting' && typeof npc.restUntilMs === 'number'
      ? Math.max(0, (npc.restUntilMs - nowMs) / MS_PER_HOUR)
      : npc.restHoursLeft;
  const mxLeft =
    npc.phase === 'maintenance' && typeof npc.mxUntilMs === 'number'
      ? Math.max(0, (npc.mxUntilMs - nowMs) / MS_PER_HOUR)
      : npc.mxHoursLeft;
  const phase =
    mission != null
      ? livePhase(eta, mission.phase)
      : npc.phase === 'turnaround' && (turnaroundLeft ?? 0) <= 0
        ? 'idle'
        : npc.phase === 'resting' && (restLeft ?? 0) <= 0
          ? 'idle'
          : npc.phase === 'maintenance' && (mxLeft ?? 0) <= 0
            ? 'idle'
            : npc.phase;
  return { mission, eta, pct, turnaroundLeft, restLeft, mxLeft, phase };
}

function FleetRoster(props: {
  fleet: NpcFleetMember[];
  onOpen: (icao: string) => void;
  busy?: boolean;
  nowMs: number;
  weightSystem?: WeightSystem;
  homeCountryId?: string;
}) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<FleetPhaseFilter>('');
  const [countryOverride, setCountryOverride] = useState<string | undefined>(
    undefined,
  );
  const [classFilter, setClassFilter] = useState<'' | AircraftClass>('');
  const [laneFilter, setLaneFilter] = useState<LaneFilter>('');
  const countryFilter =
    countryOverride !== undefined
      ? countryOverride
      : (props.homeCountryId ?? '');

  const enriched = useMemo(
    () =>
      props.fleet.map((npc) => ({
        npc,
        ...resolveNpcLiveState(npc, props.nowMs),
      })),
    [props.fleet, props.nowMs],
  );

  const countryOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const npc of props.fleet) {
      const id = countryIdFromRegion(npc.homeRegion);
      if (id) ids.add(id);
    }
    return [...ids].sort();
  }, [props.fleet]);

  const filtered = useMemo(() => {
    const tokens = query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    return enriched.filter(({ npc, phase, mission }) => {
      if (phaseFilter === 'airborne') {
        if (phase !== 'enroute' && phase !== 'arriving') return false;
      } else if (phaseFilter && phase !== phaseFilter) {
        return false;
      }
      if (classFilter && npc.aircraftClassId !== classFilter) return false;
      if (
        countryFilter &&
        countryIdFromRegion(npc.homeRegion) !== countryFilter
      ) {
        return false;
      }
      if (laneFilter === 'intl') {
        if (!mission?.international) return false;
      } else if (laneFilter === 'domestic') {
        if (!mission || mission.international) return false;
      }
      if (tokens.length === 0) return true;
      const hay = [
        npc.name,
        npc.aircraftLabel,
        npc.airframeTypeId,
        aircraftClassLabel(npc.aircraftClassId),
        npc.homeRegion,
        regionLabel(npc.homeRegion),
        countryIdFromRegion(npc.homeRegion),
        countryLabel(countryIdFromRegion(npc.homeRegion)),
        npc.locationIcao ?? '',
        mission?.originIcao ?? '',
        mission?.destIcao ?? '',
        mission?.commodityName ?? '',
        mission?.international ? 'intl international' : '',
        phaseLabel(phase),
      ]
        .join(' ')
        .toLowerCase();
      return tokens.every((token) => hay.includes(token));
    });
  }, [enriched, phaseFilter, classFilter, countryFilter, laneFilter, query]);

  const scoped = useMemo(
    () =>
      countryFilter
        ? enriched.filter(
            ({ npc }) => countryIdFromRegion(npc.homeRegion) === countryFilter,
          )
        : enriched,
    [enriched, countryFilter],
  );
  const phaseCounts = useMemo(() => {
    let airborne = 0;
    let turnaround = 0;
    let resting = 0;
    let maintenance = 0;
    let idle = 0;
    for (const row of scoped) {
      if (row.phase === 'enroute' || row.phase === 'arriving') airborne += 1;
      else if (row.phase === 'turnaround') turnaround += 1;
      else if (row.phase === 'resting') resting += 1;
      else if (row.phase === 'maintenance') maintenance += 1;
      else idle += 1;
    }
    return {
      airborne,
      turnaround,
      resting,
      maintenance,
      idle,
      total: scoped.length,
    };
  }, [scoped]);
  const defaultCountry = props.homeCountryId ?? '';
  const hasFilters =
    query.trim() !== '' ||
    phaseFilter !== '' ||
    classFilter !== '' ||
    laneFilter !== '' ||
    countryFilter !== defaultCountry;

  const pageCount = Math.max(1, Math.ceil(filtered.length / FLEET_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice(
    (safePage - 1) * FLEET_PAGE_SIZE,
    safePage * FLEET_PAGE_SIZE,
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    setPage(1);
  }, [
    query,
    phaseFilter,
    classFilter,
    countryFilter,
    laneFilter,
    props.fleet.length,
  ]);

  if (props.fleet.length === 0) {
    return (
      <p className="empty">
        No rival freighters seeded yet — wait for world migration or a pulse.
      </p>
    );
  }

  const togglePhase = (phase: FleetPhaseFilter) => {
    setPhaseFilter((cur) => (cur === phase ? '' : phase));
  };

  return (
    <>
      <div className="rivals-phase-bar" role="toolbar" aria-label="Rival status">
        {(
          [
            ['', 'All', phaseCounts.total],
            ['airborne', 'Airborne', phaseCounts.airborne],
            ['turnaround', 'Turnaround', phaseCounts.turnaround],
            ['maintenance', 'MX', phaseCounts.maintenance],
            ['resting', 'Resting', phaseCounts.resting],
            ['idle', 'Idle', phaseCounts.idle],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id || 'all'}
            type="button"
            className={phaseFilter === id ? 'is-on' : undefined}
            aria-pressed={phaseFilter === id}
            onClick={() => togglePhase(id)}
          >
            {label} {count}
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table className="fleet-table">
          <thead>
            <tr>
              <th>Operator</th>
              <th>Aircraft</th>
              <th>Home</th>
              <th>Status</th>
              <th>Mission</th>
              <th>Progress</th>
            </tr>
            <tr className="filter-row">
              <th>
                <input
                  className="route-filter"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Name / ICAO / type"
                  aria-label="Filter rivals"
                />
              </th>
              <th>
                <select
                  value={classFilter}
                  onChange={(e) =>
                    setClassFilter(e.target.value as '' | AircraftClass)
                  }
                  aria-label="Filter by aircraft class"
                >
                  {AIRCRAFT_CLASS_FILTERS.map((opt) => (
                    <option key={opt.id || 'all'} value={opt.id}>
                      {opt.id ? opt.label : 'All classes'}
                    </option>
                  ))}
                </select>
              </th>
              <th>
                <select
                  value={countryFilter}
                  onChange={(e) => setCountryOverride(e.target.value)}
                  aria-label="Filter by home country"
                >
                  <option value="">All countries</option>
                  {countryOptions.map((id) => (
                    <option key={id} value={id}>
                      {countryLabel(id)} ({id})
                    </option>
                  ))}
                </select>
              </th>
              <th>
                <select
                  value={phaseFilter}
                  onChange={(e) =>
                    setPhaseFilter(e.target.value as FleetPhaseFilter)
                  }
                  aria-label="Filter by status"
                >
                  <option value="">All statuses</option>
                  <option value="airborne">Airborne</option>
                  <option value="enroute">En route</option>
                  <option value="arriving">Arriving</option>
                  <option value="turnaround">Turnaround</option>
                  <option value="resting">Resting</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="idle">Idle</option>
                </select>
              </th>
              <th>
                <select
                  aria-label="Filter by route scope"
                  value={laneFilter}
                  onChange={(e) => {
                    const next = e.target.value;
                    setLaneFilter(
                      next === 'intl' ||
                        next === 'domestic' ||
                        next === 'bush'
                        ? next
                        : '',
                    );
                  }}
                >
                  <option value="">Any route</option>
                  <option value="intl">Intl</option>
                  <option value="domestic">Domestic</option>
                </select>
              </th>
              <th>
                {hasFilters ? (
                  <button
                    type="button"
                    className="clear-filters"
                    onClick={() => {
                      setQuery('');
                      setPhaseFilter('');
                      setClassFilter('');
                      setCountryOverride(undefined);
                      setLaneFilter('');
                    }}
                  >
                    Clear
                  </button>
                ) : null}
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(
              ({ npc, mission, eta, pct, turnaroundLeft, restLeft, mxLeft, phase }) => (
                <tr key={npc.id} className={`fleet-row phase-${phase}`}>
                  <td>
                    <strong>{npc.name}</strong>
                    <small>
                      rel {(npc.reliability * 100).toFixed(0)}% · agg{' '}
                      {(npc.aggressiveness * 100).toFixed(0)}%
                    </small>
                  </td>
                  <td>
                    {aircraftClassLabel(npc.aircraftClassId)}
                    <small>{npc.aircraftLabel}</small>
                  </td>
                  <td title={regionLabel(npc.homeRegion)}>{npc.homeRegion}</td>
                  <td>
                    <span
                      className={`phase-tag phase-${phase}`}
                      title={
                        phase === 'resting'
                          ? `Crew rest after duty day${
                              typeof npc.dutyHoursAccum === 'number'
                                ? ` · ${npc.dutyHoursAccum.toFixed(1)}h duty`
                                : ''
                            } · back in ${formatDuration(restLeft ?? 0)}`
                          : phase === 'maintenance'
                            ? `Shop visit${
                                npc.locationIcao ? ` at ${npc.locationIcao}` : ''
                              } · draws local aircraft parts · free in ${formatDuration(mxLeft ?? 0)}`
                            : phase === 'turnaround'
                              ? `Ground turnaround · free in ${formatDuration(turnaroundLeft ?? 0)}`
                              : undefined
                      }
                    >
                      {phaseLabel(phase)}
                    </span>
                    {phase === 'turnaround' && turnaroundLeft !== undefined ? (
                      <small>free in {formatDuration(turnaroundLeft)}</small>
                    ) : null}
                    {phase === 'resting' && restLeft !== undefined ? (
                      <small>back in {formatDuration(restLeft)}</small>
                    ) : null}
                    {phase === 'maintenance' && mxLeft !== undefined ? (
                      <small>
                        {npc.locationIcao ? `${npc.locationIcao} · ` : ''}
                        free in {formatDuration(mxLeft)}
                      </small>
                    ) : null}
                  </td>
                  <td>
                    {mission ? (
                      <>
                        <div className="route">
                          <IcaoLink
                            icao={mission.originIcao}
                            onOpen={props.onOpen}
                            disabled={props.busy}
                          />
                          <span className="arrow">→</span>
                          <IcaoLink
                            icao={mission.destIcao}
                            onOpen={props.onOpen}
                            disabled={props.busy}
                          />
                          {mission.urgency === 'urgent' ? (
                            <span className="tag">Urgent</span>
                          ) : null}
                          {mission.international ? (
                            <span className="tag" title="International lane freight">
                              intl
                            </span>
                          ) : null}
                        </div>
                        <small>
                          {mission.commodityName} ·{' '}
                          {formatTonnes(mission.cargoKg, props.weightSystem)} · ETA{' '}
                          {formatDuration(eta)} · {formatMoney(mission.payUsd)}
                        </small>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {mission ? (
                      <ProgressTrack pct={pct} />
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ),
            )}
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  No rivals match the selected filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <nav className="pagination" aria-label="Rival pages">
        <p>
          {filtered.length === 0
            ? '0 records'
            : `${(safePage - 1) * FLEET_PAGE_SIZE + 1}–${Math.min(
                safePage * FLEET_PAGE_SIZE,
                filtered.length,
              )} of ${filtered.length}`}
        </p>
        <div>
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span>
            Page {safePage} of {pageCount}
          </span>
          <button
            type="button"
            disabled={safePage >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            Next
          </button>
        </div>
      </nav>
    </>
  );
}

export function App() {
  const { confirm, confirmDialog, setConfirmDisabled } = useConfirm();
  const initialLocation = readCareerLocation();
  const [tab, setTab] = useState<Tab>(initialLocation.tab);
  const [airportIcao, setAirportIcao] = useState<string | null>(
    initialLocation.airportIcao,
  );
  const [airportView, setAirportView] = useState<AirportView | null>(null);
  const [airportHydrating, setAirportHydrating] = useState(false);
  const [terminalSection, setTerminalSection] =
    useState<TerminalSection>('inventory');
  const [hubStats, setHubStats] = useState<HubStatsView | null>(null);
  const [hubStatsLoading, setHubStatsLoading] = useState(false);
  const [hubStatsError, setHubStatsError] = useState<string | null>(null);
  const [contractsLane, setContractsLane] =
    useState<ContractsLane>('outbound');
  const [contractsProduct, setContractsProduct] =
    useState<ContractsProduct>('freight');
  const [contractsOffer, setContractsOffer] = useState<'aircraft' | 'crew'>(
    'aircraft',
  );
  const [contractsSorts, setContractsSorts] =
    useState<MarketSortLevel[]>(DEFAULT_BOARD_SORTS);
  const [contractsPage, setContractsPage] = useState(1);
  const [contractsAccessFilter, setContractsAccessFilter] =
    useState<AccessFilter>('');
  /** When true, terminal Contracts outbound shows only dest ∈ other owned FBOs. */
  const [contractsSisterOnly, setContractsSisterOnly] = useState(false);
  const [contractsProfitableOnly, setContractsProfitableOnly] = useState(false);
  const [selectedContractLotId, setSelectedContractLotId] = useState<
    string | null
  >(null);
  const [selectedCharterOffer, setSelectedCharterOffer] =
    useState<CharterOfferView | null>(null);
  /** Return target after Manifest (or legacy Hangar ferry) opened from a terminal. */
  const [airportReturn, setAirportReturn] = useState<{
    icao: string;
    section: TerminalSection;
  } | null>(null);
  const [preferredAircraft, setPreferredAircraft] =
    useState<AircraftClass>('narrow_freighter');
  const [tick, setTick] = useState(0);
  const [lastBatchAtMs, setLastBatchAtMs] = useState(Date.now());
  const [msPerTick, setMsPerTick] = useState(MS_PER_TICK_DEFAULT);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [displayNowMs, setDisplayNowMs] = useState(Date.now());
  const [wallet, setWalletState] = useState(0);
  const walletRef = useRef(0);
  walletRef.current = wallet;
  const [lots, setLots] = useState<MarketLot[]>([]);
  const [marketTotalLots, setMarketTotalLots] = useState(0);
  const [marketPageCount, setMarketPageCount] = useState(1);
  /** Local Freights board refresh — not the app-wide `busy` lock. */
  const [marketBoardLoading, setMarketBoardLoading] = useState(false);
  /** Kept in a ref so `refresh` stays stable while board query params change. */
  /** Last /api/market query that successfully painted the Freights board. */
  const marketFetchOptsRef = useRef({
    originQuery: '',
    destQuery: '',
    page: 1,
    pageSize: MARKET_PAGE_SIZE,
    sort: formatMarketSortParam(DEFAULT_BOARD_SORTS),
    distanceMaxNm: '',
    commodity: '',
    loadMinKg: '',
    loadMaxKg: '',
    expiresWithinHours: '',
    minPayUsd: '',
    access: '' as AccessFilter,
    lane: '' as LaneFilter,
    crew: '' as '' | 'crew' | 'aircraft',
    airframe: '',
    profitableOnly: false,
    nearIcao: '',
    nearMaxNm: '' as number | string,
    aircraft: undefined as AircraftClass | undefined,
  });
  /**
   * Live filter intent (updated synchronously on edit). Live polls must read
   * this — not marketFetchOptsRef — or a clear/reselect races the last paint.
   */
  const marketBoardIntentRef = useRef(marketFetchOptsRef.current);
  /** Bumps when Freights filters change so in-flight / poll responses can't clobber. */
  const marketFetchSeqRef = useRef(0);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  /** First scoped refresh after profile select finished (wallet/missions painted). */
  const careerReadyRef = useRef(false);
  /** False until the first scoped refresh after profile select finishes. */
  const [careerReady, setCareerReady] = useState(false);
  /** True once /api/state has painted wallet, clock, and fleet (before missions/NPC). */
  const careerStateReadyRef = useRef(false);
  const [careerStateReady, setCareerStateReady] = useState(false);
  /** Avoid double bootstrap refresh (profile select + Strict Mode). */
  const bootProfileKeyRef = useRef<string | null>(null);
  /** Latest enterCareerProfile — boot effect resumes via this ref. */
  const enterCareerProfileRef = useRef<(id: string) => Promise<void>>(
    async () => undefined,
  );
  /** Fixed-world attach — warm only (host already has the save open). */
  const attachOpenWorldRef = useRef<(profile: CareerProfileMeta) => Promise<void>>(
    async () => undefined,
  );
  /** Boot/retry entry for fixed-world attach (Listening for host poll). */
  const attachFixedWorldRef = useRef<
    (activeProfileId: string, nameHint?: string | null) => Promise<boolean>
  >(async () => false);
  const [marketEvents, setMarketEvents] = useState<EconomyEvent[]>([]);
  const [marketEventsExpanded, setMarketEventsExpanded] = useState(false);
  const [npcActivity, setNpcActivity] = useState<NpcActivity[]>([]);
  const [npcBusy, setNpcBusy] = useState(0);
  const [npcFleet, setNpcFleet] = useState<NpcFleetMember[]>([]);
  const [npcSummary, setNpcSummary] = useState({
    airborne: 0,
    turnaround: 0,
    resting: 0,
    maintenance: 0,
    idle: 0,
  });
  const [regionPressure, setRegionPressure] = useState<RegionPressure[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [busy, setBusy] = useState(false);
  /** Chunked time-advance progress (dev +1 / +3 / +7 / +14 / +30 day skips). */
  const [tickAdvance, setTickAdvance] = useState<{
    done: number;
    total: number;
    label: string;
    startedAtMs: number;
  } | null>(null);
  const tickAdvanceRef = useRef(tickAdvance);
  tickAdvanceRef.current = tickAdvance;
  const [tickAdvanceClockMs, setTickAdvanceClockMs] = useState(0);

  const [companies, setCompanies] = useState<CareerCompanyView[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState(getStoredCompanyId);
  /** Owner home company — restore when leaving My VA (member dual-tenant). */
  const [homeCompanyId, setHomeCompanyId] = useState<string | null>(null);
  const homeCompanyIdRef = useRef<string | null>(null);
  const activeCompanyIdRef = useRef(activeCompanyId);
  activeCompanyIdRef.current = activeCompanyId;
  const viewingVaTenant = Boolean(
    homeCompanyId && activeCompanyId && homeCompanyId !== activeCompanyId,
  );
  /**
   * VA overlay caches — My VA session may pin activeCompanyId to the listed
   * company, but chrome wallet/fleet stay on home. These feed VaPage only.
   */
  const [vaSessionWallet, setVaSessionWallet] = useState<number | null>(null);
  /** Bump so My VA Ledger refetches after external wallet credits. */
  const [vaLedgerRefreshEpoch, setVaLedgerRefreshEpoch] = useState(0);
  /** Chrome h1 while Crew is open — public airline name (sidebar stays Crew). */
  const [vaChromeTitle, setVaChromeTitle] = useState<string | null>(null);
  const [vaSessionFleet, setVaSessionFleet] = useState<PlayerAircraft[]>([]);
  /** Listed VA company id when this account is a member (chrome stays home). */
  const [memberVaCompanyId, setMemberVaCompanyId] = useState<string | null>(
    null,
  );
  const [authAccountId, setAuthAccountId] = useState<string | null>(null);
  const [memberVaIsOwner, setMemberVaIsOwner] = useState(false);
  /** Listed VA pilot cut % for Freights Prepare chip (from /api/va/members). */
  const [vaMemberRouteCutPct, setVaMemberRouteCutPct] = useState<number | null>(
    null,
  );
  /** Home company listed in VAs directory (Company Identity status). */
  const [companyDirectoryListed, setCompanyDirectoryListed] = useState(false);
  const memberVaCompanyIdRef = useRef<string | null>(null);
  memberVaCompanyIdRef.current = memberVaCompanyId;
  const authAccountIdRef = useRef<string | null>(null);
  authAccountIdRef.current = authAccountId;
  const memberVaIsOwnerRef = useRef(false);
  memberVaIsOwnerRef.current = memberVaIsOwner;
  const vaSessionFleetRef = useRef(vaSessionFleet);
  vaSessionFleetRef.current = vaSessionFleet;

  /** Paint wallet without flashing $0 from ambient-tenant / empty shells mid +Nd. */
  const walletCommitHoldRef = useRef<{ usd: number; untilMs: number } | null>(
    null,
  );
  /**
   * Bumped on every refresh start + tenant switch. Late /api/state or missions
   * from a prior tenant must not flash VA cash onto the chrome wallet.
   */
  const refreshGenRef = useRef(0);
  const paintWallet = useCallback(
    (
      next: number | null | undefined,
      opts?: { sourceCompanyId?: string | null },
    ) => {
      if (typeof next !== 'number' || !Number.isFinite(next)) return;
      // Chrome sticky: never paint home wallet from a VA-tenant response.
      const home = homeCompanyIdRef.current?.trim();
      const source = opts?.sourceCompanyId?.trim();
      if (home && source && source !== home) {
        setVaSessionWallet(next);
        return;
      }
      // Prefer live request tenant (URL/memory) — ref can lag one tick behind setState.
      const active =
        getStoredCompanyId()?.trim() ||
        activeCompanyIdRef.current?.trim();
      if (home && active && home !== active) {
        setVaSessionWallet(next);
        return;
      }
      if (next === 0 && walletRef.current > 0 && tickAdvanceRef.current) {
        return;
      }
      const hold = walletCommitHoldRef.current;
      if (hold && Date.now() < hold.untilMs) {
        // Mutation response already painted the true balance; ignore in-flight
        // /api/state or /api/missions that started before the write committed.
        if (Math.abs(next - hold.usd) > 0.5) return;
        walletCommitHoldRef.current = null;
      }
      setWalletState(next);
    },
    [],
  );
  /** Authoritative wallet from a mutation — holds ambient refresh from regressing. */
  const commitWallet = useCallback(
    (next: number, opts?: { sourceCompanyId?: string | null }) => {
      if (!Number.isFinite(next)) return;
      const home = homeCompanyIdRef.current?.trim();
      const source = opts?.sourceCompanyId?.trim();
      if (home && source && source !== home) {
        setVaSessionWallet(next);
        return;
      }
      // Explicit home-source writes (pilot travel) paint chrome even while Crew
      // has the VA tenant pinned — otherwise cash lands in vaSessionWallet.
      if (home && source && source === home) {
        walletCommitHoldRef.current = {
          usd: next,
          untilMs: Date.now() + 12_000,
        };
        setWalletState(next);
        return;
      }
      const active =
        getStoredCompanyId()?.trim() ||
        activeCompanyIdRef.current?.trim();
      if (home && active && home !== active) {
        setVaSessionWallet(next);
        return;
      }
      walletCommitHoldRef.current = {
        usd: next,
        untilMs: Date.now() + 12_000,
      };
      setWalletState(next);
    },
    [],
  );
  /** Local lock for Crew fly — avoids app-wide busy flash on every button. */
  const [crewDispatchBusy, setCrewDispatchBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastState, setToastState] = useState<{ id: number; text: string } | null>(
    null,
  );
  const [toastKind, setToastKind] = useState<'ok' | 'warn' | 'fail'>('ok');
  const [offlineFeeBanner, setOfflineFeeBanner] =
    useState<OfflineFeeSummary | null>(null);
  const [catchUpBanner, setCatchUpBanner] =
    useState<EconomyCatchUpStatus | null>(null);
  const toast = toastState?.text ?? null;
  const toastSeqRef = useRef(0);
  const setToast = useCallback((text: string | null) => {
    if (text === null) {
      setToastState(null);
      return;
    }
    // Profile gate already asks the player to pick a save — never toast 409s.
    if (isNeedsProfileMessage(text)) return;
    toastSeqRef.current += 1;
    setToastState({ id: toastSeqRef.current, text });
  }, []);
  const [simbriefUser, setSimbriefUser] = useState(loadSimbriefUser);
  /** Last successful /api/dispatch SimBrief URL for the active mission. */
  const [simbriefLaunchUrl, setSimbriefLaunchUrl] = useState<string | null>(
    null,
  );
  const [weightSystem, setWeightSystem] = useState<WeightSystem>(loadWeightSystem);
  const [uiSoundMode, setUiSoundMode] = useState<UiSoundMode>(loadUiSoundMode);
  const [devMode, setDevMode] = useState(loadDevMode);
  /** VA-listed company + non-owner → Hangar MX/sell locked (ferry ok). */
  const [vaHangarMutationsLocked, setVaHangarMutationsLocked] = useState(false);
  const [worldPresence, setWorldPresence] = useState<{
    onlineCount: number;
    recent: Array<{ companyDisplayName: string; summary: string }>;
  } | null>(null);

  useEffect(() => {
    setActiveCompanyIdForRequests(activeCompanyId);
  }, [activeCompanyId]);

  useEffect(() => {
    let cancelled = false;
    if (!activeCompanyId || !getAuthToken()) {
      setVaHangarMutationsLocked(false);
      return;
    }
    void fetchVaMembers()
      .then((m) => {
        if (cancelled) return;
        setVaHangarMutationsLocked(
          Boolean(m.listed) && m.role !== 'owner',
        );
      })
      .catch(() => {
        if (!cancelled) setVaHangarMutationsLocked(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeCompanyId]);

  const [ofpAutoStatus, setOfpAutoStatus] =
    useState<'idle' | 'waiting' | 'checking'>('idle');
  const [loadOfpAutoStatus, setLoadOfpAutoStatus] = useState<
    'idle' | 'waiting' | 'loading' | 'done' | 'failed'
  >('idle');
  const [loadOfpAutoError, setLoadOfpAutoError] = useState<string | null>(null);
  const [loadOfpProgress, setLoadOfpProgress] = useState<OfpLoadProgress | null>(
    null,
  );
  /** User must arm Skyline inject (default off) — no auto-inject on Preflight. */
  const [skylineInjectEnabled, setSkylineInjectEnabled] = useState(false);
  /** First /api/preflight failure while Load has no card yet (was silently swallowed). */
  const [preflightBootstrapError, setPreflightBootstrapError] = useState<
    string | null
  >(null);
  const preflightBootstrapErrorRef = useRef<string | null>(null);
  /**
   * Watch started before the first Preflight card (SAMPLING) — keep it off until
   * /api/preflight lands so pollWatch cannot resurrect a stuck session.
   * State (not only a ref) so Preflight eligibility re-renders when we hold.
   */
  const [holdWatchOffForPreflight, setHoldWatchOffForPreflight] =
    useState(false);
  const holdWatchOffForPreflightRef = useRef(false);
  holdWatchOffForPreflightRef.current = holdWatchOffForPreflight;
  /** Prevents a second /api/load-ofp while one is already in flight. */
  const ofpInjectInFlightRef = useRef(false);
  const loadOfpAutoStatusRef = useRef(loadOfpAutoStatus);
  loadOfpAutoStatusRef.current = loadOfpAutoStatus;
  /** Ignore Watch fuel samples until the sim finishes settling after inject. */
  const injectFuelQuietUntilRef = useRef(0);
  const loadOfpControlRef = useRef<{
    stop: () => void;
    abort: AbortController;
  } | null>(null);
  const [missionFuelQuote, setMissionFuelQuote] = useState<{
    quote: MissionFuelQuote;
    walletUsd: number;
    walletAfterUsd: number;
  } | null>(null);
  const [missionFuelQuoteStatus, setMissionFuelQuoteStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [missionFuelQuoteError, setMissionFuelQuoteError] = useState<string | null>(
    null,
  );
  const [missionFuelQuoteRetryToken, setMissionFuelQuoteRetryToken] = useState(0);
  const [watchAutoStatus, setWatchAutoStatus] = useState<
    'idle' | 'waiting' | 'connecting' | 'blocked'
  >('idle');
  const [watchAutoPaused, setWatchAutoPaused] = useState(false);
  const [flightDebrief, setFlightDebrief] = useState<FlightDebrief | null>(null);
  /** Keep Settling overlay until debrief paints (server clears `settling` on stop). */
  const [settleOverlaySticky, setSettleOverlaySticky] = useState(false);
  const activeMissionRef = useRef<Mission | undefined>(undefined);
  /** One-shot: reopen mid-flight → Dispatch so settle UI is visible. */
  const airborneResumeNavDoneRef = useRef(false);
  const stagingRestoreAttemptedRef = useRef<string | null>(null);
  const [maxCargoKg, setMaxCargoKg] = useState<number | null>(null);
  /** Which fleet tail the live `maxCargoKg` belongs to — ignore stale C152=0 after switching to Duke. */
  const [maxCargoBoundAircraftId, setMaxCargoBoundAircraftId] = useState<
    string | null
  >(null);
  const cargoLimitRequestGenRef = useRef(0);
  const [structuralMaxCargoKg, setStructuralMaxCargoKg] =
    useState<number | null>(null);
  const [estimatedBlockFuelKg, setEstimatedBlockFuelKg] =
    useState<number | null>(null);
  const [mxFuelBurn, setMxFuelBurn] = useState<{
    mult: number;
    excessPct: number;
    conditionPct: number;
    blockFuelKg?: number;
    baseBlockFuelKg?: number | null;
    exceedsTank?: boolean;
    deficitKg?: number;
  } | null>(null);
  const [estimatedFuelCostUsd, setEstimatedFuelCostUsd] =
    useState<number | null>(null);
  const [estimatedFuelUnitPriceUsd, setEstimatedFuelUnitPriceUsd] =
    useState<number | null>(null);
  const [estimatedFuelScarcity, setEstimatedFuelScarcity] = useState<
    'ok' | 'partial' | 'dry' | null
  >(null);
  const [routeFuelCapacityKg, setRouteFuelCapacityKg] =
    useState<number | null>(null);
  const [routeFuelDeficitKg, setRouteFuelDeficitKg] =
    useState<number | null>(null);
  const [routeFuelFeasible, setRouteFuelFeasible] =
    useState<boolean | null>(null);
  /** Resolved OD distance from /api/cargo-limit when lot.distanceNm is missing. */
  const [routeDistanceNmResolved, setRouteDistanceNmResolved] =
    useState<number | null>(null);
  const [maxCargoSource, setMaxCargoSource] = useState<string | null>(null);
  const [airframeLabel, setAirframeLabel] = useState<string | null>(null);
  const [watch, setWatch] = useState<WatchStatus | null>(null);
  const [simBridge, setSimBridge] = useState<SimBridgeStatus | null>(null);
  const simBridgeRef = useRef(simBridge);
  simBridgeRef.current = simBridge;
  const [marketPage, setMarketPage] = useState(1);
  const [originFilter, setOriginFilter] = useState('');
  const [destFilter, setDestFilter] = useState('');
  const [distanceMaxNm, setDistanceMaxNm] = useState('');
  const [cargoFilter, setCargoFilter] = useState('');
  const [loadMinKg, setLoadMinKg] = useState('');
  const [loadMaxKg, setLoadMaxKg] = useState('');
  const [expiresWithinHours, setExpiresWithinHours] = useState('');
  const [minimumPayUsd, setMinimumPayUsd] = useState('');
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('');
  const [laneFilter, setLaneFilter] = useState<LaneFilter>('');
  const [freightsBoard, setFreightsBoard] = useState<
    'aircraft' | 'crew' | 'bush'
  >('aircraft');
  const [bushTrips, setBushTrips] = useState<BushTripBoardRow[]>([]);
  const [activeBushTrip, setActiveBushTrip] =
    useState<ActiveBushTripView | null>(null);
  const [bushWatch, setBushWatch] = useState<BushWatchStatus | null>(null);
  const [careerProfiles, setCareerProfiles] = useState<CareerProfileMeta[]>([]);
  const [activeCareerProfile, setActiveCareerProfile] =
    useState<CareerProfileMeta | null>(null);
  /** True until the player picks a save this session. */
  const [showProfileGate, setShowProfileGate] = useState(true);
  const [profileGateBusyLabel, setProfileGateBusyLabel] = useState(
    'Opening career…',
  );
  const [authRequired, setAuthRequired] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [authRegisterEnabled, setAuthRegisterEnabled] = useState(true);
  const [authInviteRequired, setAuthInviteRequired] = useState(false);
  const [authAccessKeysRequired, setAuthAccessKeysRequired] = useState(false);
  /** World kill switch: Prepare/Accept blocked until desktop ≥ min. */
  const [clientUpdateBlock, setClientUpdateBlock] =
    useState<ClientUpdateBlock | null>(null);
  const [clientVersion, setClientVersion] = useState<string | null>(null);
  /** Bumps when token is set/cleared so ProfileGate Sign out UI refreshes. */
  const [authSessionEpoch, setAuthSessionEpoch] = useState(0);
  const [profilesLoading, setProfilesLoading] = useState(true);
  /** Host CAREER_WORLD_FIXED — clients attach, no ProfileGate. */
  const [worldFixed, setWorldFixed] = useState(false);
  const [worldWaiting, setWorldWaiting] = useState(false);

  useEffect(() => {
    if (!careerReady || showAuthGate || !(authRequired || worldFixed)) {
      setWorldPresence(null);
      return;
    }
    let cancelled = false;
    const pull = () => {
      void fetchWorldPresence()
        .then((p) => {
          if (cancelled) return;
          setWorldPresence({
            onlineCount: p.onlineCount,
            recent: (p.recent ?? []).slice(0, 5).map((r) => ({
              companyDisplayName: r.companyDisplayName,
              summary: r.summary,
            })),
          });
        })
        .catch(() => {
          /* presence is best-effort */
        });
    };
    pull();
    const id = window.setInterval(pull, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [careerReady, authRequired, worldFixed, showAuthGate]);

  /** Electron: first-run / Settings switch between SP and MP. */
  const [playModeGate, setPlayModeGate] = useState<
    'loading' | 'needed' | 'hidden'
  >(() => (window.skylineDesktop?.getPlayConfig ? 'loading' : 'hidden'));
  const [playModeBusy, setPlayModeBusy] = useState(false);
  const [playModeError, setPlayModeError] = useState<string | null>(null);
  const [playModeConfig, setPlayModeConfig] = useState<{
    mode: 'sp' | 'mp' | null;
    worldApiUrl: string;
    defaultWorldApiUrl: string;
    suggestedMpWorldApiUrl?: string;
    envForced: boolean;
  } | null>(null);
  const [forcePlayModeGate, setForcePlayModeGate] = useState(false);
  const [boardAircraftId, setBoardAircraftId] = useState('');
  const [profitableOnly, setProfitableOnly] = useState(false);
  const boardAircraftInitRef = useRef(false);
  /** Bumps on each airport open so stale FBO hydrates are ignored. */
  const airportOpenSeqRef = useRef(0);
  /** Sidebar Base opened home with empty client FBO list — jump to owned hub after hydrate. */
  const fboBoardRedirectOwnedRef = useRef(false);
  const [nearMe, setNearMe] = useState(false);
  const [marketSorts, setMarketSorts] =
    useState<MarketSortLevel[]>(DEFAULT_BOARD_SORTS);
  const [staging, setStaging] = useState<StagingDraft | null>(null);
  const [charterManifest, setCharterManifest] =
    useState<CharterManifestDraft | null>(null);
  const [stagingRouteLots, setStagingRouteLots] = useState<MarketLot[]>([]);
  const [stagingRouteLotsLoading, setStagingRouteLotsLoading] = useState(false);
  const [stagingRouteLotsError, setStagingRouteLotsError] = useState<string | null>(null);
  const [hubSelected, setHubSelected] = useState(false);
  const [fleet, setFleet] = useState<PlayerAircraft[]>([]);
  const opsFleetEntries = useMemo(
    () => buildOpsFleet(fleet, vaSessionFleet),
    [fleet, vaSessionFleet],
  );
  const prepareOpsFleetEntries = useMemo(
    () =>
      filterOpsFleetForPrepare(opsFleetEntries, {
        accountId: authAccountId,
        isVaOwner: memberVaIsOwner,
      }),
    [opsFleetEntries, authAccountId, memberVaIsOwner],
  );
  const opsFleet = useMemo(
    () => opsFleetAircraft(opsFleetEntries),
    [opsFleetEntries],
  );
  const prepareOpsFleet = useMemo(
    () => opsFleetAircraft(prepareOpsFleetEntries),
    [prepareOpsFleetEntries],
  );
  const vaAircraftIdSet = useMemo(() => {
    const s = new Set<string>();
    for (const e of opsFleetEntries) {
      if (e.owner === 'va') s.add(e.aircraft.id);
    }
    return s;
  }, [opsFleetEntries]);

  function resolveOpsCompanyId(aircraftId: string | null | undefined): string {
    const home =
      homeCompanyIdRef.current?.trim() ||
      homeCompanyId?.trim() ||
      getStoredCompanyId();
    const vaId = memberVaCompanyIdRef.current?.trim();
    const id = aircraftId?.trim() ?? '';
    // Prefer live VA session membership over home-first merge ghosts.
    if (
      vaId &&
      id &&
      vaSessionFleet.some((a) => a.id === id)
    ) {
      return vaId;
    }
    const entry = findOpsEntry(opsFleetEntries, aircraftId);
    if (entry?.owner === 'va' && vaId) {
      return vaId;
    }
    return home;
  }

  /** Mutation fleet payload: keep VA tails out of chrome home `fleet`. */
  function paintOpsMutationFleet(
    nextFleet: PlayerAircraft[] | null | undefined,
    opsCompanyId: string,
  ) {
    if (!Array.isArray(nextFleet)) return;
    const vaId = memberVaCompanyIdRef.current?.trim();
    if (vaId && opsCompanyId === vaId) {
      setVaSessionFleet(nextFleet);
      const vaIds = new Set(
        nextFleet.map((a) => a.id?.trim()).filter(Boolean) as string[],
      );
      if (vaIds.size > 0) {
        setFleet((prev) => prev.filter((a) => !vaIds.has(a.id?.trim() ?? '')));
      }
      return;
    }
    setFleet(nextFleet);
  }

  /** Keep My VA Ledger wallet card in sync when ops debit/credit the VA. */
  function paintOpsMutationWallet(opsCompanyId: string, nextUsd: number) {
    const vaId = memberVaCompanyIdRef.current?.trim();
    const home = homeCompanyIdRef.current?.trim();
    if (vaId && opsCompanyId === vaId) {
      setVaSessionWallet(nextUsd);
      setVaLedgerRefreshEpoch((n) => n + 1);
      // Dual-tenant: VA ops must not paint chrome even if selectTab already
      // restored home (active === home) before this mutation response lands.
      if (home && home !== vaId) return;
    }
    commitWallet(nextUsd, { sourceCompanyId: opsCompanyId });
  }

  const [hangarPane, setHangarPane] = useState<
    'aircraft' | 'cashflow' | 'cargo' | 'crew'
  >('aircraft');
  const [cargoOps, setCargoOps] = useState<CareerCargoOps | null>(null);
  const [classOps, setClassOps] = useState<CareerClassOps | null>(null);
  const [playerFbos, setPlayerFbos] = useState<PlayerFboSnapshot | null>(null);
  const [dispatchScoutPolicy, setDispatchScoutPolicy] =
    useState<BaseDispatchScoutPolicy | null>(null);
  const [baseDispatcher, setBaseDispatcher] =
    useState<BaseDispatcherSnapshot | null>(null);
  const [dispatchScoutLoading, setDispatchScoutLoading] = useState(false);
  const [dispatchTourLoading, setDispatchTourLoading] = useState(false);
  /** Hire/fire/refresh desk — may briefly lock hire cards. */
  const dispatchHireBusy = dispatchScoutLoading || dispatchTourLoading;
  /** Search / tour Accept — do not tie to desk list refresh (state poll). */
  const dispatchTourBusy = dispatchTourLoading;
  const ownsBaseAtAirport = useMemo(() => {
    const hub = (airportIcao ?? '').trim().toUpperCase();
    if (!hub) return false;
    return (playerFbos?.fbos ?? []).some(
      (f) => f.icao.trim().toUpperCase() === hub,
    );
  }, [airportIcao, playerFbos]);
  const [dispatchTours, setDispatchTours] = useState<BaseDispatchTour[]>([]);
  const [charterTours, setCharterTours] = useState<BaseCharterTour[]>([]);
  const [baseDispatchProduct, setBaseDispatchProduct] = useState<
    'freight' | 'charter'
  >('freight');
  const [baseDispatcherHireOpen, setBaseDispatcherHireOpen] = useState(false);
  const [activeTour, setActiveTour] = useState<ActiveTourView | null>(null);
  const [charterActiveTour, setCharterActiveTour] =
    useState<CharterActiveTourView | null>(null);
  /** Tour itinerary to attach after Manifest Accept & Dispatch. */
  const [pendingActiveTour, setPendingActiveTourState] = useState<{
    kind: 'start' | 'bind';
    hubIcao: string;
    aircraftId: string;
    tourId?: string;
    routeLabel: string;
    tourLegs: BaseDispatchTourLeg[];
    legIndex: number;
  } | null>(null);
  const pendingActiveTourRef = useRef(pendingActiveTour);
  function setPendingActiveTour(
    next:
      | typeof pendingActiveTour
      | ((prev: typeof pendingActiveTour) => typeof pendingActiveTour),
  ) {
    const resolved =
      typeof next === 'function'
        ? (
            next as (
              prev: typeof pendingActiveTour,
            ) => typeof pendingActiveTour
          )(pendingActiveTourRef.current)
        : next;
    pendingActiveTourRef.current = resolved;
    setPendingActiveTourState(resolved);
  }
  /** FerryJourneyDialog from Manifest when selected airframe is off-origin. */
  const [stagingFerryOpen, setStagingFerryOpen] = useState(false);
  const [selectedDispatchTourId, setSelectedDispatchTourId] = useState<
    string | null
  >(null);
  const [dispatchTourAircraftId, setDispatchTourAircraftId] = useState('');
  const [dispatchTourOrigin, setDispatchTourOrigin] = useState('');
  /** Base → Charters desk only — never share Freight Search origin (different meaning). */
  const [baseCharterOrigin, setBaseCharterOrigin] = useState('');
  const [charterTourLegs, setCharterTourLegs] = useState<1 | 2>(1);
  const [charterTourReturnMode, setCharterTourReturnMode] =
    useState<BaseCharterTourReturnMode>('none');
  const [selectedCharterTourId, setSelectedCharterTourId] = useState<
    string | null
  >(null);
  const [dispatchTourLegs, setDispatchTourLegs] = useState<1 | 2 | 3 | 4>(2);
  const [dispatchTourMinNm, setDispatchTourMinNm] = useState('');
  const [dispatchTourMaxNm, setDispatchTourMaxNm] = useState('');
  const [dispatchTourMaxFerryNm, setDispatchTourMaxFerryNm] = useState('200');
  const [dispatchTourReturnMode, setDispatchTourReturnMode] =
    useState<BaseDispatchTourReturnMode>('none');
  /** Score-boost first-leg origins at Base (default on). */
  const [dispatchTourPreferLeaveBase, setDispatchTourPreferLeaveBase] =
    useState(true);
  const [splitHoldId, setSplitHoldId] = useState<string | null>(null);
  const [selectedFboHoldId, setSelectedFboHoldId] = useState<string | null>(
    null,
  );
  const [selectedFboMissionId, setSelectedFboMissionId] = useState<
    string | null
  >(null);
  const [companyCrew, setCompanyCrew] = useState<CompanyCrewSnapshot | null>(
    null,
  );
  const [cashflow, setCashflow] = useState<CareerCashflowSnapshot | null>(null);
  const [companyCredit, setCompanyCredit] =
    useState<CompanyCreditSnapshot | null>(null);
  const [hubOptions, setHubOptions] = useState<StarterHubOption[]>([]);
  const [ferrySeed, setFerrySeed] = useState<{
    dest: string;
    token: number;
  } | null>(null);
  const [pilotTravelOpen, setPilotTravelOpen] = useState(false);
  const [pilotTravelInitialDest, setPilotTravelInitialDest] = useState<
    string | null
  >(null);
  /** Ferry journey opened from the topbar Move chip (after PilotTravelDialog). */
  const [topbarFerry, setTopbarFerry] = useState<{
    aircraftId: string;
    finalDest: string;
  } | null>(null);
  const [pilotName, setPilotName] = useState('');
  /** Logged-in account label — sidebar must not show VA owner pilotName. */
  const [authAccountLabel, setAuthAccountLabel] = useState('');
  const [homeHubIcao, setHomeHubIcao] = useState('');
  const [pilotIcao, setPilotIcao] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupHub, setSignupHub] = useState('');
  const [signupCountry, setSignupCountry] = useState('');
  const [aircraftListings, setAircraftListings] = useState<AircraftListing[]>([]);
  const [aircraftDeliveryQuotes, setAircraftDeliveryQuotes] = useState<
    Record<string, AircraftDeliveryQuoteView>
  >({});
  const [leaseUnlock, setLeaseUnlock] = useState<AircraftLeaseUnlock | null>(null);
  const [aircraftCatalog, setAircraftCatalog] = useState<
    Array<{
      id: AircraftClass;
      name: string;
      msrpUsd: number;
      leaseMonthlyUsd: number;
      maxCargoKg: number;
      maxRangeNm: number;
    }>
  >([]);
  const [airframePerf, setAirframePerf] = useState<
    Record<
      string,
      {
        maxCargoKg: number;
        maxRangeNm: number;
        cruiseFuelFlowKgPerHour?: number;
        cruiseSpeedKt?: number;
        fuelBurnKgPerNm: number;
        cabin?: {
          passengerSeats: number;
          hasCargoConfig: boolean;
          hasPassengerConfig: boolean;
          dualLayout: boolean;
          defaultConfigurationId?: string;
          defaultRole?: 'cargo' | 'passenger';
          configurations: Array<{
            id: string;
            label: string;
            role: 'cargo' | 'passenger';
            passengerCapacity: number;
            rolesPackRelPath: string;
          }>;
        };
      }
    >
  >({});
  const [aircraftMarketClass, setAircraftMarketClass] = useState<
    '' | AircraftClass
  >('');
  const [aircraftMarketQuery, setAircraftMarketQuery] = useState('');
  const [hangarQuery, setHangarQuery] = useState('');
  const [aircraftMarketGeo, setAircraftMarketGeo] = useState<
    'country' | 'region' | 'near'
  >('country');
  const [aircraftMarketLoading, setAircraftMarketLoading] = useState(false);
  const [aircraftHomeCountryId, setAircraftHomeCountryId] = useState('');
  const [aircraftBrowseCountry, setAircraftBrowseCountry] = useState('');
  const [aircraftPoolCountries, setAircraftPoolCountries] = useState<
    AircraftMarketPoolCountry[]
  >([]);
  const aircraftBrowseCountryRef = useRef('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [networkHubs, setNetworkHubs] = useState<NetworkHub[]>([]);
  const [networkHubsLoading, setNetworkHubsLoading] = useState(false);
  const [networkMapFocusIcao, setNetworkMapFocusIcao] = useState('');
  const [networkMapFocusToken, setNetworkMapFocusToken] = useState(0);

  useEffect(() => {
    setSelectedFboHoldId(null);
    setSelectedFboMissionId(null);
    setSplitHoldId(null);
  }, [airportIcao, terminalSection]);

  useEffect(() => {
    if (terminalSection !== 'stats' || !airportIcao) {
      return;
    }
    let cancelled = false;
    const icao = airportIcao.trim().toUpperCase();
    setHubStatsLoading(true);
    setHubStatsError(null);
    // Drop stale other-hub payload so we don't flash wrong ICAO while loading.
    setHubStats((prev) =>
      prev && prev.airport?.icao?.toUpperCase() === icao ? prev : null,
    );
    void fetchAirportStats(icao)
      .then((stats) => {
        if (!cancelled) {
          setHubStats(stats);
          setHubStatsError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setHubStats(null);
          setHubStatsError(
            err instanceof Error ? err.message : 'Failed to load hub stats',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setHubStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [terminalSection, airportIcao]);

  useEffect(() => {
    if (terminalSection !== 'fbo' || !airportIcao || !ownsBaseAtAirport) return;
    const hub = airportIcao.trim().toUpperCase();
    let cancelled = false;
    setDispatchScoutLoading(true);
    void Promise.all([
      postBaseDispatcher({ action: 'list', hubIcao: hub }),
      postBaseDispatchTours({ action: 'status' }),
    ])
      .then(([desk, tours]) => {
        if (cancelled) return;
        if (desk.dispatcher) setBaseDispatcher(desk.dispatcher);
        if (desk.policy) setDispatchScoutPolicy(desk.policy);
        setActiveTour(tours.activeTour ?? null);
      })
      .catch(() => {
        /* Base desk retries on next open */
      })
      .finally(() => {
        if (!cancelled) setDispatchScoutLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // ownsBaseAtAirport is a stable boolean — not playerFbos.fbos array identity
    // (state poll replaces that every tick and was locking Search filters forever).
  }, [terminalSection, airportIcao, ownsBaseAtAirport]);

  /** Keep Accept/resume gates alive — raw /api/state tour has no view fields. */
  useEffect(() => {
    if (terminalSection !== 'fbo' || !airportIcao) return;
    if (!activeTour || activeTour.status !== 'active') return;
    if (activeTour.resumeState != null || activeTour.canAcceptNextLeg != null) {
      return;
    }
    let cancelled = false;
    void postBaseDispatchTours({ action: 'status' })
      .then((tours) => {
        if (cancelled) return;
        setActiveTour(tours.activeTour ?? null);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [
    terminalSection,
    airportIcao,
    activeTour?.id,
    activeTour?.status,
    activeTour?.resumeState,
    activeTour?.canAcceptNextLeg,
  ]);

  /** Charter Active Tour — raw /api/state has no resumeHint / Accept gates. */
  useEffect(() => {
    if (terminalSection !== 'fbo' || !airportIcao) return;
    if (!charterActiveTour || charterActiveTour.status !== 'active') return;
    if (charterActiveTour.resumeHint != null) return;
    let cancelled = false;
    void postBaseDispatchCharters({ action: 'status' })
      .then((status) => {
        if (cancelled) return;
        setCharterActiveTour(status.charterActiveTour ?? null);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [
    terminalSection,
    airportIcao,
    charterActiveTour?.id,
    charterActiveTour?.status,
    charterActiveTour?.resumeHint,
  ]);

  /** One Active Tour desk at a time — keep the matching product tab selected. */
  useEffect(() => {
    if (activeTour?.status === 'active') {
      setBaseDispatchProduct('freight');
    } else if (charterActiveTour?.status === 'active') {
      setBaseDispatchProduct('charter');
    }
  }, [
    activeTour?.status,
    activeTour?.id,
    charterActiveTour?.status,
    charterActiveTour?.id,
  ]);

  useEffect(() => {
    if (!BUSH_TRIPS_BOARD_ENABLED && freightsBoard === 'bush') {
      setFreightsBoard('aircraft');
    }
  }, [freightsBoard]);

  // Empty hangar (home + VA): open Operator aircraft board once per profile.
  const freightsBoardInitRef = useRef(false);
  const [vaOpsPrefetchGen, setVaOpsPrefetchGen] = useState(0);
  useEffect(() => {
    if (freightsBoardInitRef.current) return;
    if (!activeCareerProfile || showProfileGate || !careerStateReady) return;
    // Auth: wait VA members prefetch so empty-home + VA fleet stays on Your aircraft.
    if (authRequired && vaOpsPrefetchGen === 0) return;
    freightsBoardInitRef.current = true;
    if (prepareOpsFleet.length === 0) setFreightsBoard('crew');
  }, [
    activeCareerProfile,
    showProfileGate,
    careerStateReady,
    authRequired,
    vaOpsPrefetchGen,
    prepareOpsFleet.length,
  ]);

  // Prefetch listed-VA fleet for Prepare pickers (does not pin chrome).
  useEffect(() => {
    if (!careerStateReady || showProfileGate || showAuthGate) return;
    if (!authRequired && !getAuthToken()) return;
    let cancelled = false;
    void (async () => {
      try {
        const snap = await fetchVaMembers();
        if (cancelled) return;
        if (snap.viewerAccountId?.trim()) {
          setAuthAccountId(snap.viewerAccountId.trim());
        }
        if (snap.listed && snap.companyId) {
          setMemberVaCompanyId(snap.companyId);
          setMemberVaIsOwner(snap.role === 'owner');
          const vaName = snap.displayName?.trim();
          if (vaName) setVaChromeTitle(vaName);
          if (typeof snap.memberRouteCutPct === 'number') {
            setVaMemberRouteCutPct(snap.memberRouteCutPct);
          }
          if (Array.isArray(snap.fleet)) {
            setVaSessionFleet(snap.fleet);
          }
          if (snap.airframePerf) {
            setAirframePerf((prev) => ({
              ...prev,
              ...snap.airframePerf,
            }));
          }
        } else {
          setMemberVaCompanyId(null);
          setMemberVaIsOwner(false);
          setVaMemberRouteCutPct(null);
          setVaSessionFleet([]);
          setVaChromeTitle(null);
        }
      } catch {
        if (!cancelled) {
          setMemberVaCompanyId(null);
          setMemberVaIsOwner(false);
          setVaMemberRouteCutPct(null);
        }
      } finally {
        if (!cancelled) setVaOpsPrefetchGen((n) => n + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    careerStateReady,
    showProfileGate,
    showAuthGate,
    authRequired,
    authSessionEpoch,
    homeCompanyId,
  ]);

  useEffect(() => {
    if (!selectedFboHoldId) return;
    const stillThere = (playerFbos?.holds ?? []).some(
      (h) => h.id === selectedFboHoldId,
    );
    if (!stillThere) setSelectedFboHoldId(null);
  }, [playerFbos, selectedFboHoldId]);

  useEffect(() => {
    if (!selectedFboMissionId) return;
    const stillThere = missions.some(
      (m) =>
        m.id === selectedFboMissionId &&
        (['accepted', 'dispatched'].includes(m.status) ||
          (m.status === 'in_flight' && m.crewOperated === true)),
    );
    if (!stillThere) setSelectedFboMissionId(null);
  }, [missions, selectedFboMissionId]);

  useEffect(() => {
    if (!selectedContractLotId || !airportView) return;
    const stillThere =
      airportView.outboundLots.some((lot) => lot.id === selectedContractLotId) ||
      airportView.inboundLots.some((lot) => lot.id === selectedContractLotId);
    if (!stillThere) setSelectedContractLotId(null);
  }, [airportView, selectedContractLotId]);

  useEffect(() => {
    setSelectedCharterOffer(null);
  }, [airportIcao]);

  useEffect(() => {
    const handleAuthRequired = () => {
      setError(null);
      setAuthRequired(true);
      setAuthChecked(true);
      setBusy(false);
      setShowProfileGate(false);
      setShowAuthGate(true);
      setAuthSessionEpoch((epoch) => epoch + 1);
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
    return () => {
      window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
    };
  }, []);

  useEffect(() => {
    const onGate =
      profilesLoading ||
      worldWaiting ||
      showAuthGate ||
      showProfileGate ||
      !activeCareerProfile;
    if (!onGate) return;
    resetCareerShellUrl();
  }, [
    profilesLoading,
    worldWaiting,
    showAuthGate,
    showProfileGate,
    activeCareerProfile,
  ]);

  // Keep path in sync while the career shell is active — gates own `/`.
  useEffect(() => {
    if (
      profilesLoading ||
      worldWaiting ||
      showAuthGate ||
      showProfileGate ||
      !activeCareerProfile
    ) {
      return;
    }
    const loc = { tab, airportIcao };
    const canonical = pathForLocation(loc);
    if (window.location.pathname !== canonical) {
      writeCareerLocation(loc, { replace: true });
    }
  }, [
    profilesLoading,
    worldWaiting,
    showAuthGate,
    showProfileGate,
    activeCareerProfile,
    tab,
    airportIcao,
  ]);

  useEffect(() => {
    function onPopState() {
      const loc = readCareerLocation();
      setTab(loc.tab);
      if (loc.airportIcao) {
        void (async () => {
          try {
            const view = await fetchAirportView(loc.airportIcao!);
            setAirportView(view);
            setAirportIcao(loc.airportIcao);
            setTerminalSection('inventory');
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (shouldSurfaceApiError(message)) {
              setError(message);
            }
            setAirportIcao(null);
            setAirportView(null);
            writeCareerLocation({ tab: loc.tab, airportIcao: null }, { replace: true });
          }
        })();
      } else {
        setAirportIcao(null);
        setAirportView(null);
        setTerminalSection('inventory');
      }
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Restore deep-linked airport only after a profile is open (requireStore).
  useEffect(() => {
    if (
      worldWaiting ||
      showAuthGate ||
      showProfileGate ||
      !activeCareerProfile
    ) {
      return;
    }
    if (!airportIcao || airportView) return;
    let cancelled = false;
    void (async () => {
      try {
        const view = await fetchAirportView(airportIcao);
        if (!cancelled) {
          setAirportView(view);
          setTerminalSection('inventory');
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          if (shouldSurfaceApiError(message)) {
            setError(message);
          }
          setAirportIcao(null);
          writeCareerLocation({ tab, airportIcao: null }, { replace: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    worldWaiting,
    showAuthGate,
    showProfileGate,
    activeCareerProfile?.id,
    airportIcao,
    airportView,
    tab,
  ]);

  const refreshBushTrips = useCallback(async () => {
    try {
      const data = await fetchBushTrips();
      setBushTrips(data.trips ?? []);
      setActiveBushTrip(data.active ?? null);
      if (Array.isArray(data.fleet)) {
        const home = homeCompanyIdRef.current?.trim();
        const active =
          getStoredCompanyId()?.trim() ||
          activeCompanyIdRef.current?.trim();
        if (!home || !active || home === active) {
          setFleet(data.fleet);
        } else {
          setVaSessionFleet(data.fleet);
        }
      }
    } catch {
      /* board optional until server rebuilt */
    }
  }, []);

  /**
   * Logbook is dual-tenant: home solo legs + VA ops legs live in different
   * company files. Merge every known tenant that is not the primary response.
   * VA company file is shared across members — filter to this pilot only.
   */
  const loadMissionsMerged = useCallback(async () => {
    const primary = await fetchMissions();
    const active =
      activeCompanyIdRef.current?.trim() || getStoredCompanyId();
    const va = memberVaCompanyIdRef.current?.trim();
    let home = homeCompanyIdRef.current?.trim();
    if (!home && va && active && active !== va) {
      home = active;
      homeCompanyIdRef.current = home;
    }
    const viewerAccountId = authAccountIdRef.current?.trim() || '';
    const filterVaSlice = (slice: Mission[]) => {
      if (!va || !viewerAccountId) return [];
      return filterVaMissionsForPilot(slice, {
        viewerAccountId,
        viewerHomeCompanyId: home,
        includeUnstampedLegacy: memberVaIsOwnerRef.current,
      });
    };
    let missions = primary.missions ?? [];
    // Owner home === listed VA: primary is the shared company file.
    if (va && active === va) {
      missions = filterVaSlice(missions);
    }
    const extraIds = [...new Set([home, va].filter(Boolean) as string[])].filter(
      (id) => id !== active,
    );
    if (extraIds.length === 0) {
      return { ...primary, missions };
    }
    for (const companyId of extraIds) {
      try {
        const other = await fetchMissions({ companyId });
        let slice = other.missions ?? [];
        if (va && companyId === va) {
          if (!viewerAccountId) continue;
          slice = filterVaSlice(slice);
        }
        missions = mergeLogbookMissions(missions, slice);
      } catch {
        /* soft — keep what we have */
      }
    }
    return { ...primary, missions };
  }, []);

  const refresh = useCallback(async (scope?: CareerRefreshScope) => {
    setError(null);
    const gen = ++refreshGenRef.current;
    const requestTenant =
      getStoredCompanyId()?.trim() ||
      activeCompanyIdRef.current?.trim() ||
      '';
    const state = await fetchState();
    if (gen !== refreshGenRef.current) return;
    const liveTenant =
      getStoredCompanyId()?.trim() ||
      activeCompanyIdRef.current?.trim() ||
      '';
    // Tenant switched mid-flight (leave My VA / pin VA) — drop this paint so
    // VA walletUsd cannot flash onto chrome before the next home refresh.
    if (requestTenant && liveTenant && requestTenant !== liveTenant) return;
    if (state.needsProfile) {
      setShowProfileGate(true);
      setCareerReady(false);
      careerReadyRef.current = false;
      careerStateReadyRef.current = false;
      setCareerStateReady(false);
      return;
    }
    const full = scope == null;
    const bootstrapping = !careerReadyRef.current;
    // First paint after login: only load what the restored tab needs. A full
    // dump (market + aircraft board + NPC) was blocking Dispatch for ~10s with
    // $0 wallet and a fake empty flight.
    const effectiveScope =
      bootstrapping && full
        ? liveRefreshScope(tabRef.current, Boolean(airportIcao))
        : scope;
    const scopedFull = effectiveScope == null;
    const boardOwnsMarket =
      tabRef.current === 'market' || Boolean(airportIcao);
    // Skip market on *unscoped* bootstrap when the Freights board effect will
    // load it — but honor explicit `{ market: true }` (profile-gate warm).
    const wantMarket =
      (scopedFull || effectiveScope?.market === true) &&
      !(bootstrapping && boardOwnsMarket && scopedFull);
    const marketSeqAtFetch = marketFetchSeqRef.current;
    const wantMissions =
      bootstrapping || scopedFull || effectiveScope?.missions === true;
    const wantNpc = scopedFull || effectiveScope?.npc === true;
    const wantAircraft = scopedFull || effectiveScope?.aircraftMarket === true;
    if (wantAircraft) setAircraftMarketLoading(true);
    try {
    const wantBush = scopedFull || effectiveScope?.bushTrips === true;
    const wantAirport =
      Boolean(airportIcao) &&
      (scopedFull || effectiveScope?.airport === true);
    // Paint wallet/fleet/pilot from /api/state immediately so the sidebar is
    // not stuck at $0 / "—" while missions (or other scoped fetches) finish.
    const clientNow = Date.now();
    const serverNow = state.serverNowMs ?? clientNow;
    setServerOffsetMs(serverNow - clientNow);
    setTick(state.tick);
    setLastBatchAtMs(state.lastBatchAtMs ?? serverNow);
    setMsPerTick(state.msPerTick ?? MS_PER_TICK_DEFAULT);
    setDisplayNowMs(serverNow);
    const stateCompanyId =
      typeof state.companyId === 'string' ? state.companyId.trim() : '';
    const expectedTenant =
      companyIdFromUrl() ||
      activeCompanyIdRef.current ||
      getStoredCompanyId();
    const tenantMatches =
      !stateCompanyId ||
      !expectedTenant ||
      stateCompanyId === expectedTenant;
    const homeId = homeCompanyIdRef.current?.trim() || '';
    /** Chrome wallet/fleet follow home only — VA session paints VaPage caches. */
    const isHomeState =
      !homeId || !stateCompanyId || stateCompanyId === homeId;
    if (tenantMatches && isHomeState) {
      paintWallet(state.walletUsd, { sourceCompanyId: stateCompanyId });
    } else if (tenantMatches && !isHomeState) {
      if (typeof state.walletUsd === 'number' && Number.isFinite(state.walletUsd)) {
        setVaSessionWallet(state.walletUsd);
      }
    }
    setCargoOps(state.cargoOps ?? null);
    setClassOps(state.classOps ?? null);
    if (stateCompanyId && tenantMatches) {
      activeCompanyIdRef.current = stateCompanyId;
      setActiveCompanyId(stateCompanyId);
      setActiveCompanyIdForRequests(stateCompanyId);
      // Persist only when the tab is not pinned by ?company= (shared storage).
      if (!companyIdFromUrl()) {
        setStoredCompanyId(stateCompanyId);
      }
    }
    if (state.leaseUnlock) setLeaseUnlock(state.leaseUnlock);
    if (state.offlineFeeSummary) {
      setOfflineFeeBanner(state.offlineFeeSummary);
    }
    if (state.catchUp) {
      setCatchUpBanner(state.catchUp);
    } else {
      setCatchUpBanner(null);
    }
    setHubSelected(Boolean(state.hubSelected));
    if (isHomeState) {
      const vaIds = new Set(
        vaSessionFleetRef.current
          .map((a) => a.id?.trim())
          .filter(Boolean) as string[],
      );
      const homeFleet = state.fleet ?? [];
      setFleet(
        vaIds.size > 0
          ? homeFleet.filter((a) => !vaIds.has(a.id?.trim() ?? ''))
          : homeFleet,
      );
      if (state.airframePerf) {
        setAirframePerf((prev) => ({ ...prev, ...state.airframePerf }));
      }
      setHubOptions(normalizeStarterHubs(state.hubs));
      setPilotName(state.pilotName ?? '');
      setHomeHubIcao(state.homeHubIcao ?? '');
      setPilotIcao(state.pilotIcao ?? state.homeHubIcao ?? '');
      if (state.cashflow) setCashflow(state.cashflow);
      if (state.companyCredit) setCompanyCredit(state.companyCredit);
      // Base/FBO is home-company only — never paint VA tenant fbos into sidebar Base
      // (that showed VA's "second base" gate / hid personal Buy T1 · Free).
      if (state.playerFbos) {
        setPlayerFbos((prev) => {
          const next = state.playerFbos!;
          // /api/state uses global snapshot (no canBuyAtIcao). Preserve terminal
          // buy affordance from GET /api/airport until fleet ownership changes.
          const prevOwned = (prev?.fbos ?? [])
            .map((f) => f.icao.toUpperCase())
            .sort()
            .join(',');
          const nextOwned = (next.fbos ?? [])
            .map((f) => f.icao.toUpperCase())
            .sort()
            .join(',');
          if (
            prev &&
            prevOwned === nextOwned &&
            next.canBuyAtIcao === undefined &&
            next.buyAtIcaoReason === undefined &&
            (prev.canBuyAtIcao !== undefined ||
              prev.buyAtIcaoReason != null ||
              prev.buyAtIcaoUsd !== undefined)
          ) {
            return {
              ...next,
              canBuyAtIcao: prev.canBuyAtIcao,
              buyAtIcaoUsd: prev.buyAtIcaoUsd,
              buyAtIcaoReason: prev.buyAtIcaoReason,
            };
          }
          return next;
        });
        // Raw persist snapshot has no canAcceptNextLeg / resumeState. Never
        // overwrite a rich ActiveTourView with it — that made Accept flicker off
        // on every /api/state poll after Base Refresh.
        const snapTour = state.playerFbos.activeTour;
        if (!snapTour || snapTour.status !== 'active') {
          setActiveTour(null);
        } else {
          setActiveTour((prev) => {
            if (
              prev &&
              prev.id === snapTour.id &&
              prev.status === 'active' &&
              (prev.resumeState != null || prev.canAcceptNextLeg != null)
            ) {
              return prev;
            }
            return snapTour as ActiveTourView;
          });
        }
        const snapCharter = state.playerFbos.charterActiveTour;
        if (!snapCharter || snapCharter.status !== 'active') {
          setCharterActiveTour(null);
        } else {
          setCharterActiveTour((prev) => {
            if (
              prev &&
              prev.id === snapCharter.id &&
              prev.status === 'active' &&
              prev.resumeHint != null
            ) {
              return prev;
            }
            // Raw persist has no resumeHint / Accept gates — status fetch fills them.
            return {
              ...snapCharter,
              nextLegIndex:
                snapCharter.legs.find(
                  (l) => l.status === 'planned' || l.status === 'active',
                )?.index ?? null,
              canAcceptNextLeg: false,
            } as CharterActiveTourView;
          });
        }
      }
    } else if (tenantMatches) {
      setVaSessionFleet(state.fleet ?? []);
      if (state.airframePerf) {
        setAirframePerf((prev) => ({ ...prev, ...state.airframePerf }));
      }
    }
    if (state.companyCrew) setCompanyCrew(state.companyCrew);
    careerStateReadyRef.current = true;
    setCareerStateReady(true);

    const [market, missionState, npcState, acMarket] = await Promise.all([
      wantMarket
        ? fetchMarket(
            marketBoardIntentRef.current.aircraft,
            marketBoardIntentRef.current,
          )
        : Promise.resolve(null),
      wantMissions ? loadMissionsMerged() : Promise.resolve(null),
      wantNpc ? fetchNpcFleet() : Promise.resolve(null),
      wantAircraft
        ? fetchAircraftMarket(
            aircraftMarketFetchOpts(aircraftBrowseCountryRef.current),
          ).catch(() => null)
        : Promise.resolve(null),
    ]);
    if (gen !== refreshGenRef.current) return;
    const liveTenantAfterBoard =
      getStoredCompanyId()?.trim() ||
      activeCompanyIdRef.current?.trim() ||
      '';
    if (
      requestTenant &&
      liveTenantAfterBoard &&
      requestTenant !== liveTenantAfterBoard
    ) {
      return;
    }
    if (wantBush) void refreshBushTrips();
    if (missionState && typeof missionState.walletUsd === 'number') {
      if (isHomeState) {
        paintWallet(missionState.walletUsd, {
          sourceCompanyId: stateCompanyId || requestTenant,
        });
      } else {
        setVaSessionWallet(missionState.walletUsd);
      }
    }
    if (market) {
      // Drop late polls that raced a filter edit (seq bumped in the board effect).
      if (marketSeqAtFetch === marketFetchSeqRef.current) {
        const intent = marketBoardIntentRef.current;
        setLots(market.lots);
        setMarketTotalLots(market.totalLots ?? market.lots.length);
        setMarketPageCount(market.pageCount ?? 1);
        marketFetchOptsRef.current = intent;
        if (market.page && market.page !== intent.page) {
          setMarketPage(market.page);
          marketFetchOptsRef.current = {
            ...intent,
            page: market.page,
          };
          marketBoardIntentRef.current = marketFetchOptsRef.current;
        }
      }
      setMarketEvents(market.events ?? []);
      if (!npcState?.activity.length) {
        setNpcActivity(market.npcActivity ?? []);
      }
      if (!npcState?.regionPressure?.length) {
        setRegionPressure(market.regionPressure ?? []);
      }
    }
    if (npcState) {
      setNpcActivity(
        npcState.activity.length ? npcState.activity : market?.npcActivity ?? [],
      );
      setNpcBusy(npcState.busy);
      setNpcFleet(npcState.fleet);
      setNpcSummary({
        airborne: npcState.airborne,
        turnaround: npcState.turnaround,
        resting: npcState.resting ?? 0,
        maintenance: npcState.maintenance ?? 0,
        idle: npcState.idle,
      });
      setRegionPressure(
        npcState.regionPressure?.length
          ? npcState.regionPressure
          : market?.regionPressure ?? [],
      );
    }
    if (missionState) {
      setMissions(missionState.missions.slice().reverse());
    }
    if (acMarket) {
      setAircraftListings(acMarket.listings);
      setAircraftDeliveryQuotes(acMarket.deliveryQuotes ?? {});
      setAircraftCatalog(acMarket.catalog);
      setAirframePerf((prev) => ({
        ...prev,
        ...(acMarket.airframePerf ?? {}),
      }));
      if (isHomeState) {
        paintWallet(acMarket.walletUsd, {
          sourceCompanyId: stateCompanyId || requestTenant,
        });
        if (Array.isArray(acMarket.fleet)) setFleet(acMarket.fleet);
      } else if (Array.isArray(acMarket.fleet)) {
        setVaSessionFleet(acMarket.fleet);
      }
      if (acMarket.homeCountryId) setAircraftHomeCountryId(acMarket.homeCountryId);
      if (acMarket.browseCountryId) {
        aircraftBrowseCountryRef.current = syncAircraftBrowseFromApi(
          acMarket.browseCountryId,
          acMarket.homeCountryId,
        );
        setAircraftBrowseCountry(aircraftBrowseCountryRef.current);
      }
      if (acMarket.poolCountries) setAircraftPoolCountries(acMarket.poolCountries);
      if (acMarket.leaseUnlock) setLeaseUnlock(acMarket.leaseUnlock);
    }
    if (!state.hubSelected && full) {
      const firstHub = networkCargoHubs(normalizeStarterHubs(state.hubs))[0]
        ?.icao;
      setSignupHub((prev) => prev || firstHub || 'SBGR');
      // Auth already collected the person name — don't force a blank callsign field.
      setSignupName((prev) => {
        if (prev.trim().length >= 2) return prev;
        const fromState = state.pilotName?.trim() ?? '';
        if (fromState.length >= 2) return fromState;
        return prev;
      });
    }
    if (wantAirport && airportIcao) {
      const view = await fetchAirportView(airportIcao);
      setAirportView(view);
    }
    careerReadyRef.current = true;
    setCareerReady(true);
    } finally {
      if (wantAircraft) setAircraftMarketLoading(false);
    }
  }, [airportIcao, loadMissionsMerged, refreshBushTrips]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const refreshCargoLimit = useCallback(
    async (
      aircraftClass: AircraftClass,
      distanceNm?: number,
      airframeTypeId?: string,
      route?: {
        originIcao?: string;
        destIcao?: string;
        aircraftId?: string;
        companyId?: string;
      },
    ) => {
      const requestGen = ++cargoLimitRequestGenRef.current;
      const boundAircraftId = route?.aircraftId?.trim() || null;
      try {
        const limit = await fetchCargoLimit(
          aircraftClass,
          distanceNm,
          airframeTypeId,
          {
            originIcao: route?.originIcao,
            destIcao: route?.destIcao,
            aircraftId: route?.aircraftId,
            companyId: route?.companyId,
          },
        );
        if (requestGen !== cargoLimitRequestGenRef.current) return;
        setMaxCargoBoundAircraftId(boundAircraftId);
        setStructuralMaxCargoKg(limit.maxCargoKg);
        setMaxCargoKg(limit.operationalMaxCargoKg);
        setEstimatedBlockFuelKg(limit.estimatedBlockFuelKg ?? null);
        setEstimatedFuelCostUsd(limit.estimatedFuelCostUsd ?? null);
        setEstimatedFuelUnitPriceUsd(limit.estimatedFuelUnitPriceUsd ?? null);
        setEstimatedFuelScarcity(limit.estimatedFuelScarcity ?? null);
        setRouteFuelCapacityKg(limit.fuelCapacityKg ?? null);
        setRouteFuelDeficitKg(limit.fuelDeficitKg ?? null);
        setRouteFuelFeasible(limit.fuelFeasible ?? null);
        setRouteDistanceNmResolved(
          typeof limit.distanceNm === 'number' && Number.isFinite(limit.distanceNm)
            ? limit.distanceNm
            : null,
        );
        setMaxCargoSource(limit.maxCargoSource);
        setAirframeLabel(limit.airframeLabel);
        setMxFuelBurn(limit.mxFuelBurn ?? null);
      } catch {
        if (requestGen !== cargoLimitRequestGenRef.current) return;
        const fallback = fallbackMaxCargoKg(aircraftClass);
        setMaxCargoBoundAircraftId(boundAircraftId);
        setStructuralMaxCargoKg(fallback);
        setMaxCargoKg(fallback);
        setEstimatedBlockFuelKg(null);
        setEstimatedFuelCostUsd(null);
        setEstimatedFuelUnitPriceUsd(null);
        setEstimatedFuelScarcity(null);
        setRouteFuelCapacityKg(null);
        setRouteFuelDeficitKg(null);
        setRouteFuelFeasible(null);
        setRouteDistanceNmResolved(null);
        setMaxCargoSource('class-fallback');
        setAirframeLabel(null);
        setMxFuelBurn(null);
      }
    },
    [],
  );

  useEffect(() => {
    const desktop = window.skylineDesktop;
    if (!desktop?.getPlayConfig) {
      setPlayModeGate('hidden');
      return;
    }
    let cancelled = false;
    void desktop.getPlayConfig().then((cfg) => {
      if (cancelled) return;
      setPlayModeConfig({
        mode: cfg.mode,
        worldApiUrl: cfg.worldApiUrl,
        defaultWorldApiUrl: cfg.defaultWorldApiUrl,
        suggestedMpWorldApiUrl: cfg.suggestedMpWorldApiUrl,
        envForced: cfg.envForced,
      });
      setPlayModeGate(cfg.needsChoice ? 'needed' : 'hidden');
    }).catch(() => {
      if (!cancelled) setPlayModeGate('hidden');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function applyDesktopPlayMode(opts: {
    mode: 'sp' | 'mp';
    worldApiUrl: string;
  }) {
    const desktop = window.skylineDesktop;
    if (!desktop?.setPlayMode) {
      throw new Error('Play mode switching requires the desktop app');
    }
    setPlayModeBusy(true);
    setPlayModeError(null);
    clearAuthToken();
    setAuthSessionEpoch((n) => n + 1);
    setShowAuthGate(false);
    const result = await desktop.setPlayMode(opts);
    if (!result.ok) {
      setPlayModeBusy(false);
      throw new Error(result.reason ?? 'Failed to switch play mode');
    }
    // Main reloads the window after API restart; keep busy if navigation stalls.
  }

  useEffect(() => {
    let cancelled = false;

    async function attachFixedWorld(
      activeProfileId: string,
      nameHint?: string | null,
    ): Promise<boolean> {
      // A fixed MP world has no client-side save picker. Do not fetch the
      // authenticated profiles endpoint before AuthGate has a Bearer token.
      const last = {
        id: activeProfileId,
        name: nameHint?.trim() || 'World',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      } satisfies CareerProfileMeta;
      setCareerProfiles([last]);
      setActiveCareerProfile(last);
      setWorldWaiting(false);
      // Do not clear showProfileGate / profilesLoading here — that paints the
      // main Freights shell before Auth finishes (Ctrl+R flicker after truncate).
      setProfileGateBusyLabel('Joining world…');
      setBusy(true);
      try {
        await attachOpenWorldRef.current(last);
        return true;
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          // Host may be mid-deploy — WorldWaitingGate poll retries attach.
          setWorldWaiting(true);
        }
        return false;
      } finally {
        if (!cancelled) {
          setBusy(false);
          setProfilesLoading(false);
        }
      }
    }
    attachFixedWorldRef.current = attachFixedWorld;

    async function bootFromHealth(): Promise<'done' | 'wait-host'> {
      const health = await fetchCareerHealth();
      if (cancelled) return 'done';
      const fixed = Boolean(health.worldFixed);
      setWorldFixed(fixed);
      setAuthRequired(Boolean(health.authRequired));
      void resolveClientUpdateBlock(health.clientUpdatePolicy).then((block) => {
        if (!cancelled) setClientUpdateBlock(block);
      });

      if (fixed) {
        if (health.needsProfile || !health.activeProfileId) {
          setProfilesLoading(false);
          setWorldWaiting(true);
          setShowProfileGate(false);
          return 'wait-host';
        }
        // Stay on ProfileGateLoading until Auth/company warm finishes.
        const ok = await attachFixedWorld(
          health.activeProfileId,
          health.activeProfileName,
        );
        return ok ? 'done' : 'wait-host';
      }

      const data = await fetchCareerProfiles();
      if (cancelled) return 'done';
      setCareerProfiles(data.profiles ?? []);
      const last =
        data.profiles?.find((p) => p.id === data.activeId) ?? null;
      setActiveCareerProfile(last);
      setError((prev) =>
        prev && isNeedsProfileMessage(prev) ? null : prev,
      );
      if (last) {
        // Ctrl+R / tab restore: reopen last save instead of ProfileGate.
        setProfileGateBusyLabel('Resuming save…');
        setShowProfileGate(true);
        setProfilesLoading(false);
        setBusy(true);
        try {
          await enterCareerProfileRef.current(last.id);
        } catch (err) {
          if (!cancelled) {
            setShowProfileGate(true);
            setShowAuthGate(false);
            setError(err instanceof Error ? err.message : String(err));
          }
        } finally {
          if (!cancelled) setBusy(false);
        }
      } else {
        setShowProfileGate(true);
      }
      return 'done';
    }

    void (async () => {
      // Deploy/restart: keep probing health instead of a one-shot ProfileGate.
      for (;;) {
        if (cancelled) return;
        try {
          const outcome = await bootFromHealth();
          if (cancelled) return;
          if (outcome === 'wait-host') return;
          return;
        } catch (err) {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : String(err));
          setProfilesLoading(false);
          setShowProfileGate(false);
          setWorldWaiting(true);
          await new Promise((r) => setTimeout(r, 2000));
        } finally {
          if (!cancelled) setProfilesLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // While Listening for host — retry health + attach (boot wait, attach fail, deploy).
  useEffect(() => {
    if (!worldWaiting) return;
    let cancelled = false;
    let inFlight = false;

    const tick = () => {
      if (inFlight) return;
      inFlight = true;
      void (async () => {
        try {
          const health = await fetchCareerHealth();
          if (cancelled) return;
          setWorldFixed(Boolean(health.worldFixed));
          setAuthRequired(Boolean(health.authRequired));
          void resolveClientUpdateBlock(health.clientUpdatePolicy).then(
            (block) => {
              if (!cancelled) setClientUpdateBlock(block);
            },
          );
          if (!health.worldFixed) {
            // Unexpected SP health while waiting — drop gate so ProfileGate can run.
            setWorldWaiting(false);
            setShowProfileGate(true);
            return;
          }
          if (health.needsProfile || !health.activeProfileId) return;
          setProfilesLoading(true);
          await attachFixedWorldRef.current(
            health.activeProfileId,
            health.activeProfileName,
          );
        } catch {
          /* host still down — keep Listening */
        } finally {
          inFlight = false;
        }
      })();
    };

    tick();
    const pollTimer = window.setInterval(tick, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
    };
  }, [worldWaiting]);

  // Rare force-update kill switch: re-check world health while in-session.
  useEffect(() => {
    if (showProfileGate || showAuthGate || profilesLoading || worldWaiting) return;
    let cancelled = false;
    const poll = () => {
      void (async () => {
        try {
          const health = await fetchCareerHealth();
          if (cancelled) return;
          const block = await resolveClientUpdateBlock(health.clientUpdatePolicy);
          if (!cancelled) setClientUpdateBlock(block);
        } catch {
          /* keep last known */
        }
      })();
    };
    poll();
    const timer = window.setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [showProfileGate, showAuthGate, profilesLoading, worldWaiting]);

  // Keep chrome name on the logged-in account (not VA owner pilotName).
  useEffect(() => {
    if (!authRequired || showAuthGate || !getAuthToken()) return;
    if (authAccountLabel.trim().length >= 2) return;
    let cancelled = false;
    void fetchAuthStatus()
      .then((status) => {
        if (cancelled || !status.authenticated) return;
        const label =
          status.account?.displayName?.trim() ||
          status.account?.loginName?.trim() ||
          status.companies[0]?.displayName?.trim() ||
          '';
        if (label.length >= 2) setAuthAccountLabel(label);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [authRequired, showAuthGate, authAccountLabel, authSessionEpoch]);

  useEffect(() => {
    let cancelled = false;
    void getCareerClientVersion().then((version) => {
      if (!cancelled) setClientVersion(version);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (showProfileGate || showAuthGate || profilesLoading) {
      bootProfileKeyRef.current = null;
      careerReadyRef.current = false;
      setCareerReady(false);
      careerStateReadyRef.current = false;
      setCareerStateReady(false);
      return;
    }
    if (!activeCareerProfile) return;
    if (bootProfileKeyRef.current === activeCareerProfile.id) return;
    bootProfileKeyRef.current = activeCareerProfile.id;
    careerReadyRef.current = false;
    setCareerReady(false);
    careerStateReadyRef.current = false;
    setCareerStateReady(false);
    void refreshRef.current().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      if (shouldSurfaceApiError(message)) setError(message);
    });
  }, [showProfileGate, showAuthGate, profilesLoading, activeCareerProfile?.id]);

  // Freights board: filter/sort/page run server-side over the full lot set.
  useEffect(() => {
    if (showProfileGate || showAuthGate || !activeCareerProfile) return;
    if (tab !== 'market' && !airportIcao) return;
    if (tab === 'charter') {
      setMarketBoardLoading(false);
      return;
    }
    if (!careerStateReadyRef.current) {
      setMarketBoardLoading(false);
      return;
    }
    const boardAcf =
      findOpsEntry(opsFleetEntries, boardAircraftId)?.aircraft ??
      fleet.find((a) => a.id === boardAircraftId);
    const originQuery = originFilter.trim();
    const focusIcao = (
      boardAcf?.locationIcao ||
      pilotIcao ||
      homeHubIcao
    )
      .trim()
      .toUpperCase();
    const useNear = nearMe && !originQuery && Boolean(focusIcao);
    const crewFilter: '' | 'crew' | 'aircraft' =
      freightsBoard === 'crew' || freightsBoard === 'aircraft'
        ? freightsBoard
        : '';
    const nextOpts = {
      originQuery,
      destQuery: destFilter.trim(),
      page: marketPage,
      pageSize: MARKET_PAGE_SIZE,
      sort: formatMarketSortParam(marketSorts),
      distanceMaxNm,
      commodity: cargoFilter,
      loadMinKg,
      loadMaxKg,
      expiresWithinHours,
      minPayUsd: minimumPayUsd,
      access: accessFilter,
      lane: laneFilter,
      crew: crewFilter,
      airframe: boardAcf?.airframeTypeId?.trim() ?? '',
      profitableOnly: Boolean(boardAcf && profitableOnly),
      nearIcao: useNear ? focusIcao : '',
      nearMaxNm: useNear ? BOARD_NEAR_MAX_NM : '',
      aircraft: boardAcf?.aircraftClassId,
    };
    const prev = marketFetchOptsRef.current;
    const unchanged =
      prev.originQuery === nextOpts.originQuery &&
      prev.destQuery === nextOpts.destQuery &&
      prev.page === nextOpts.page &&
      prev.pageSize === nextOpts.pageSize &&
      prev.sort === nextOpts.sort &&
      prev.distanceMaxNm === nextOpts.distanceMaxNm &&
      prev.commodity === nextOpts.commodity &&
      prev.loadMinKg === nextOpts.loadMinKg &&
      prev.loadMaxKg === nextOpts.loadMaxKg &&
      prev.expiresWithinHours === nextOpts.expiresWithinHours &&
      prev.minPayUsd === nextOpts.minPayUsd &&
      prev.access === nextOpts.access &&
      prev.lane === nextOpts.lane &&
      prev.crew === nextOpts.crew &&
      prev.airframe === nextOpts.airframe &&
      prev.profitableOnly === nextOpts.profitableOnly &&
      prev.nearIcao === nextOpts.nearIcao &&
      prev.nearMaxNm === nextOpts.nearMaxNm &&
      prev.aircraft === nextOpts.aircraft;
    if (unchanged) {
      setMarketBoardLoading(false);
      return;
    }

    // Drop stale rows when board mode / Near me changes — otherwise Crew can
    // briefly show a previous world page (often Ferry-heavy) under the new tabs.
    const boardScopeChanged =
      prev.crew !== nextOpts.crew ||
      prev.nearIcao !== nextOpts.nearIcao ||
      prev.nearMaxNm !== nextOpts.nearMaxNm;
    if (boardScopeChanged) {
      setLots([]);
      setMarketTotalLots(0);
      setMarketPageCount(1);
    }

    // Intent updates immediately; last-fetched stays until paint so a fleet
    // identity bump mid-debounce still sees "changed" and reschedules.
    marketBoardIntentRef.current = nextOpts;
    const fetchSeq = ++marketFetchSeqRef.current;

    let cancelled = false;
    const typingIcao =
      prev.originQuery !== nextOpts.originQuery ||
      prev.destQuery !== nextOpts.destQuery;
    const debounceMs = typingIcao
      ? MARKET_TEXT_DEBOUNCE_MS
      : MARKET_FILTER_DEBOUNCE_MS;
    const timer = setTimeout(() => {
      if (cancelled) return;
      setMarketBoardLoading(true);
      void fetchMarket(nextOpts.aircraft, nextOpts)
        .then((market) => {
          if (cancelled || fetchSeq !== marketFetchSeqRef.current) return;
          marketFetchOptsRef.current = nextOpts;
          marketBoardIntentRef.current = nextOpts;
          setLots(market.lots);
          setMarketTotalLots(market.totalLots ?? market.lots.length);
          setMarketPageCount(market.pageCount ?? 1);
          if (market.page && market.page !== nextOpts.page) {
            setMarketPage(market.page);
            const paged = { ...nextOpts, page: market.page };
            marketFetchOptsRef.current = paged;
            marketBoardIntentRef.current = paged;
          }
        })
        .catch((err: unknown) => {
          if (cancelled || fetchSeq !== marketFetchSeqRef.current) return;
          const message = err instanceof Error ? err.message : String(err);
          if (shouldSurfaceApiError(message)) setError(message);
        })
        .finally(() => {
          if (!cancelled && fetchSeq === marketFetchSeqRef.current) {
            setMarketBoardLoading(false);
          }
        });
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    accessFilter,
    activeCareerProfile,
    boardAircraftId,
    cargoFilter,
    destFilter,
    distanceMaxNm,
    expiresWithinHours,
    fleet,
    opsFleetEntries,
    freightsBoard,
    laneFilter,
    loadMinKg,
    loadMaxKg,
    marketPage,
    marketSorts,
    minimumPayUsd,
    originFilter,
    profitableOnly,
    showProfileGate,
    nearMe,
    pilotIcao,
    homeHubIcao,
    tab,
    airportIcao,
    careerReady,
    careerStateReady,
  ]);

  useEffect(() => {
    if (!staging) {
      return;
    }
    const opsEntry = findOpsEntry(opsFleetEntries, staging.aircraftId);
    const typeId =
      opsEntry?.aircraft.airframeTypeId?.trim() ||
      fleet.find((aircraft) => aircraft.id === staging.aircraftId)
        ?.airframeTypeId;
    void refreshCargoLimit(
      staging.aircraft,
      stagingRouteDistanceNm(staging),
      typeId,
      {
        originIcao: staging.originIcao,
        destIcao: staging.destIcao,
        aircraftId: staging.aircraftId,
        companyId: resolveOpsCompanyId(staging.aircraftId),
      },
    );
  }, [
    staging?.aircraft,
    staging?.aircraftId,
    staging?.originIcao,
    staging?.destIcao,
    staging?.lines[0]?.lot.distanceNm,
    fleet,
    opsFleetEntries,
    refreshCargoLimit,
  ]);

  // After live SimBrief cargo limit arrives, clamp staged kg to the new capacity.
  // Also refill lines left at 0 by a stale zero-cap (e.g. C152 → Duke switch).
  useEffect(() => {
    if (!staging || maxCargoKg === null) return;
    if (
      maxCargoBoundAircraftId &&
      staging.aircraftId &&
      maxCargoBoundAircraftId !== staging.aircraftId
    ) {
      return;
    }
    setStaging((current) => {
      if (!current || current.aircraft !== staging.aircraft) return current;
      if (
        maxCargoBoundAircraftId &&
        current.aircraftId &&
        maxCargoBoundAircraftId !== current.aircraftId
      ) {
        return current;
      }
      let next = clampDraftToCapacity(current);
      next = {
        ...next,
        lines: next.lines.map((line) => {
          if (line.cargoKg > 0) return line;
          const maxKg = lineMaxKg(next, line.lot);
          return maxKg > 0
            ? { ...line, cargoKg: defaultStagingKg(maxKg) }
            : line;
        }),
      };
      next = clampDraftToCapacity(next);
      const changed =
        next.lines.some(
          (line, index) => line.cargoKg !== current.lines[index]?.cargoKg,
        ) ||
        next.deskHold?.loadKg !== current.deskHold?.loadKg;
      return changed ? next : current;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reclamp when capacity payload changes
  }, [maxCargoKg, maxCargoBoundAircraftId]);

  // Manifest ferry: when the selected airframe arrives at origin, unlock Accept.
  useEffect(() => {
    if (!staging || staging.replaceManifest) return;
    if (!staging.aircraftId) return;
    const acf =
      findOpsEntry(opsFleetEntries, staging.aircraftId)?.aircraft ??
      fleet.find((a) => a.id === staging.aircraftId);
    if (!acf || acf.status !== 'parked') return;
    const atOrigin =
      acf.locationIcao.trim().toUpperCase() ===
      staging.originIcao.trim().toUpperCase();
    if (!atOrigin) return;
    setStagingFerryOpen(false);
    const openFlight = openFlightForRoute(
      staging.originIcao,
      staging.destIcao,
      acf.aircraftClassId,
      acf.id,
    );
    setStaging((current) => {
      if (!current || current.aircraftId !== acf.id) return current;
      if (
        current.aircraft === acf.aircraftClassId &&
        current.intoMissionId === openFlight?.id
      ) {
        return current;
      }
      return clampDraftToCapacity({
        ...current,
        aircraft: acf.aircraftClassId,
        intoMissionId: openFlight?.id,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fleet,
    vaSessionFleet,
    staging?.aircraftId,
    staging?.originIcao,
    staging?.destIcao,
    staging?.replaceManifest,
  ]);

  // Self-heal manifests created by the old replacement bug while they are open.
  useEffect(() => {
    if (!staging?.replaceManifest) return;
    setStaging((current) => {
      if (!current?.replaceManifest) return current;
      const merged = new Map<string, StagingLine>();
      let changed = false;
      for (const line of current.lines) {
        if (line.cargoKg <= 0) {
          changed = true;
          continue;
        }
        const existing = merged.get(line.lot.id);
        if (!existing) {
          merged.set(line.lot.id, line);
          continue;
        }
        changed = true;
        merged.set(line.lot.id, {
          lot: {
            ...line.lot,
            availableKg: Math.max(
              existing.lot.availableKg,
              line.lot.availableKg,
            ),
          },
          cargoKg: existing.cargoKg + line.cargoKg,
        });
      }
      const lines = [...merged.values()];
      return changed && lines.length > 0 ? { ...current, lines } : current;
    });
  }, [staging?.replaceManifest, staging?.lines]);

  // While SP catch-up banner is up, refresh catchUp progress (MP omits catchUp).
  const economySyncing = catchUpBanner != null;
  useEffect(() => {
    if (!economySyncing) return;
    if (showProfileGate || showAuthGate || !activeCareerProfile) return;
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void fetchState()
        .then((state) => {
          if (state.catchUp) {
            setCatchUpBanner(state.catchUp);
          } else {
            setCatchUpBanner(null);
          }
        })
        .catch(() => undefined);
    }, 15_000);
    return () => window.clearInterval(id);
  }, [economySyncing, showProfileGate, showAuthGate, activeCareerProfile?.id]);

  // World chip clock: always poll lightweight /api/world/clock (peek, no write
  // lock). MP never sends catchUp on /api/state, so the old catchUp-gated
  // fetchState poll never ran — lastBatchAtMs froze → stuck "pulse due".
  useEffect(() => {
    if (showProfileGate || showAuthGate || !activeCareerProfile) return;
    if (!hubSelected) return;
    let cancelled = false;
    const pullClock = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void fetchWorldClock()
        .then((clock) => {
          if (cancelled) return;
          if (typeof clock.tick === 'number') setTick(clock.tick);
          if (typeof clock.lastBatchAtMs === 'number') {
            setLastBatchAtMs(clock.lastBatchAtMs);
          }
          if (typeof clock.msPerTick === 'number' && clock.msPerTick > 0) {
            setMsPerTick(clock.msPerTick);
          }
          if (typeof clock.serverNowMs === 'number') {
            const clientNow = Date.now();
            setServerOffsetMs(clock.serverNowMs - clientNow);
            setDisplayNowMs(clock.serverNowMs);
          }
        })
        .catch(() => undefined);
    };
    pullClock();
    const id = window.setInterval(pullClock, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    showProfileGate,
    showAuthGate,
    activeCareerProfile?.id,
    hubSelected,
  ]);

  // Smooth local clock / ETA / progress between authoritative polls.
  useEffect(() => {
    const id = window.setInterval(() => {
      setDisplayNowMs(Date.now() + serverOffsetMs);
    }, 1_000);
    return () => window.clearInterval(id);
  }, [serverOffsetMs]);

  // Live board: poll only what the open view needs (not the whole career dump).
  // Freights needs periodic lot refresh (expiry / new freight), but not as often
  // as Fleet NPC motion — and never while the tab is hidden.
  useEffect(() => {
    if (tab !== 'fleet' && tab !== 'market' && !airportIcao) return;
    const intervalMs =
      tab === 'market' || airportIcao ? 30_000 : 15_000;
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void refresh(liveRefreshScope(tab, Boolean(airportIcao))).catch(() => {
        /* ignore background refresh errors */
      });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [tab, airportIcao, refresh]);

  useEffect(() => {
    if (showProfileGate || showAuthGate || !activeCareerProfile) return;
    if (!hubSelected) return;
    void refreshNetworkHubs().catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      if (isNeedsProfileMessage(message)) return;
      setToastKind('fail');
      setToast(message);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubSelected, showProfileGate, showAuthGate, activeCareerProfile?.id]);

  // Sidebar "Active flight" is shell chrome — load missions even if the open
  // tab never asked for the board (Freights-only bootstrap used to skip it).
  useEffect(() => {
    if (showProfileGate || showAuthGate || !activeCareerProfile || !hubSelected)
      return;
    let cancelled = false;
    void loadMissionsMerged()
      .then((missionState) => {
        if (cancelled) return;
        setMissions(missionState.missions.slice().reverse());
        if (typeof missionState.walletUsd === 'number') {
          const home = homeCompanyIdRef.current?.trim();
          const active = activeCompanyIdRef.current?.trim();
          if (!home || !active || home === active) {
            paintWallet(missionState.walletUsd, {
              sourceCompanyId: active || home,
            });
          } else {
            setVaSessionWallet(missionState.walletUsd);
          }
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [
    hubSelected,
    showProfileGate,
    showAuthGate,
    activeCareerProfile?.id,
    memberVaCompanyId,
    authAccountId,
    loadMissionsMerged,
  ]);

  useEffect(() => {
    stagingRestoreAttemptedRef.current = null;
  }, [activeCareerProfile?.id]);

  useEffect(() => {
    if (!activeCareerProfile?.id || !staging) return;
    writePersistedStagingDraft(activeCareerProfile.id, staging);
  }, [activeCareerProfile?.id, staging]);

  // Poll MSFS watch session while active. One shot when idle so a mid-flight
  // reload can still attach; stop interval after settle (no forever /api/watch/status).
  useEffect(() => {
    let cancelled = false;
    async function pollWatch() {
      try {
        const status = await fetchWatchStatus();
        if (cancelled) return;
        setWatch((prev) => {
          // First Preflight owns the pipe — ignore a resurrected server Watch
          // until loadVerification exists (see holdWatchOffForPreflightRef).
          if (holdWatchOffForPreflightRef.current && status.running) {
            if (!prev || !prev.running) return prev;
            return { ...prev, running: false };
          }
          const justSettled =
            Boolean(prev?.running) &&
            !status.running &&
            Boolean(status.settlement) &&
            Boolean(status.missionId);
          // Arm overlay as soon as we see settle intent — don't wait for a
          // second poll (settle can block the server for seconds).
          const missionLive =
            activeMissionRef.current?.status === 'in_flight' &&
            (!status.missionId ||
              activeMissionRef.current.id === status.missionId);
          const settleIntent =
            missionLive &&
            (Boolean(status.settling) ||
              status.lastEvent?.type === 'settle' ||
              (status.sawAirborne &&
                status.onGround === true &&
                (status.enginesRunning === false ||
                  status.parkingBrake === true) &&
                status.lastEvent?.type !== 'settle_blocked'));
          if (settleIntent && !justSettled) {
            queueMicrotask(() => setSettleOverlaySticky(true));
          }
          if (justSettled && status.settlement && status.missionId) {
            const settledMission = activeMissionRef.current;
            const settledId = status.missionId;
            queueMicrotask(() => playFlightSettledSound(settledId));
            const debrief =
              settledMission && settledMission.id === settledId
                ? buildFlightDebrief({
                    mission: settledMission,
                    settlement: status.settlement,
                  })
                : null;
            queueMicrotask(() => {
              setSettleOverlaySticky(false);
              // Drop in_flight locally so dismissing debrief cannot re-arm overlay
              // from a stale Watch lastEvent=settle / engines-off sample.
              setMissions((current) =>
                current.map((m) =>
                  m.id === settledId && isActiveMissionStatus(m.status)
                    ? { ...m, status: 'completed' }
                    : m,
                ),
              );
              if (debrief) setFlightDebrief(debrief);
              if (typeof status.walletUsd === 'number') {
                commitWallet(status.walletUsd);
              }
              // Debrief sheet carries P&L — only toast when we could not build it.
              if (!debrief) {
                setToastKind(status.settlement!.onTime ? 'ok' : 'warn');
                const cargoLine = formatCargoOpsDebriefLine(
                  status.settlement!.cargoOpsDeltas,
                );
                const classLine = formatClassOpsDebriefLine(
                  status.settlement!.classOpsDeltas,
                );
                const opsLine = [cargoLine, classLine]
                  .filter(Boolean)
                  .join(' · ');
                setToast(
                  `Flight settled · net ${formatMoney(
                    status.settlement!.payoutUsd,
                  )}${opsLine ? ` · ${opsLine}` : ''}`,
                );
              }
              goToTab('staging');
              void (async () => {
                const home = homeCompanyIdRef.current?.trim();
                if (
                  home &&
                  activeCompanyIdRef.current &&
                  home !== activeCompanyIdRef.current
                ) {
                  try {
                    await switchCompanyForVa(home);
                  } catch {
                    /* soft */
                  }
                }
                await refresh().catch(() => {
                  /* ignore */
                });
                await postBaseDispatchTours({ action: 'status' })
                  .then((r) => {
                    setActiveTour(r.activeTour ?? null);
                    if (r.playerFbos) setPlayerFbos(r.playerFbos);
                  })
                  .catch(() => {
                    /* ignore */
                  });
              })();
            });
          }
          // Skip no-op updates so the sticky footer doesn't re-render every poll
          // from checkedAtIso / ground-speed jitter alone. Still push when live
          // fuel/payload drift enough to refresh Loaded vs Due.
          const liveFuelDelta = Math.abs(
            (prev?.liveFuelLb ?? 0) - (status.liveFuelLb ?? 0),
          );
          const livePayloadDelta = Math.abs(
            (prev?.livePayloadLb ?? 0) - (status.livePayloadLb ?? 0),
          );
          const prevTanks = prev?.loadVerification?.fuel.tanks;
          const nextTanks = status.loadVerification?.fuel.tanks;
          const tanksChanged =
            Boolean(nextTanks) &&
            (!prevTanks ||
              Math.abs(prevTanks.left - nextTanks!.left) >= 5 ||
              Math.abs(prevTanks.right - nextTanks!.right) >= 5 ||
              Math.abs(prevTanks.center - nextTanks!.center) >= 5);
          const onRamp = status.onGround !== false;
          const weightPaintTol = onRamp ? 5 : 15;
          const verificationChanged =
            prev?.loadVerification?.ready !== status.loadVerification?.ready ||
            prev?.loadVerification?.fuel.ok !==
              status.loadVerification?.fuel.ok ||
            prev?.loadVerification?.payload.ok !==
              status.loadVerification?.payload.ok ||
            Math.abs(
              (prev?.loadVerification?.payload.liveLb ?? 0) -
                (status.loadVerification?.payload.liveLb ?? 0),
            ) >= weightPaintTol ||
            Math.abs(
              (prev?.loadVerification?.fuel.liveLb ?? 0) -
                (status.loadVerification?.fuel.liveLb ?? 0),
            ) >= weightPaintTol ||
            stationMapDrifted(
              prev?.loadVerification?.payload.stations,
              status.loadVerification?.payload.stations,
              5,
            ) ||
            tanksChanged;
          // ~0.0005° ≈ 55 m — keep Dispatch route aircraft marker moving in cruise.
          const positionStable =
            (prev?.position == null && status.position == null) ||
            (prev?.position != null &&
              status.position != null &&
              Math.abs(prev.position.lat - status.position.lat) < 0.0005 &&
              Math.abs(prev.position.lon - status.position.lon) < 0.0005);
          if (
            prev &&
            prev.running === status.running &&
            prev.missionId === status.missionId &&
            prev.missionStatus === status.missionStatus &&
            prev.phase === status.phase &&
            prev.onGround === status.onGround &&
            prev.enginesRunning === status.enginesRunning &&
            prev.sawAirborne === status.sawAirborne &&
            prev.lastError === status.lastError &&
            prev.pipeConnected === status.pipeConnected &&
            Boolean(prev.settling) === Boolean(status.settling) &&
            prev.lastEvent?.type === status.lastEvent?.type &&
            Boolean(prev.settlement) === Boolean(status.settlement) &&
            prev.flightTime?.met === status.flightTime?.met &&
            Math.round((prev.flightTime?.elapsedMs ?? 0) / 60_000) ===
              Math.round((status.flightTime?.elapsedMs ?? 0) / 60_000) &&
            liveFuelDelta < (onRamp ? 5 : 25) &&
            livePayloadDelta < (onRamp ? 5 : 25) &&
            !verificationChanged &&
            positionStable
          ) {
            return prev;
          }
          // Mirror Watch-persisted Loaded vs Due into local mission state.
          if (
            status.running &&
            status.missionId &&
            status.loadVerification
          ) {
            const missionId = status.missionId;
            const verification = status.loadVerification;
            queueMicrotask(() => {
              const quietWatchFuel =
                ofpInjectInFlightRef.current ||
                loadOfpAutoStatusRef.current === 'loading' ||
                loadOfpAutoStatusRef.current === 'done' ||
                Date.now() < injectFuelQuietUntilRef.current;
              setMissions((current) =>
                current.map((mission) => {
                  if (mission.id !== missionId) return mission;
                  const prevCheck = mission.lastPreflightCheck;
                  if (!prevCheck?.loadVerification) return mission;
                  if (quietWatchFuel) {
                    const prevFuel = prevCheck.loadVerification.fuel;
                    const nextFuel = verification.fuel;
                    const watchCaughtUp =
                      typeof prevFuel.plannedLb === 'number' &&
                      matchFuelOk(
                        nextFuel.liveLb ?? 0,
                        prevFuel.plannedLb,
                        fuelMatchToleranceLb(prevFuel.plannedLb),
                        nextFuel.taxiBurnLb ?? prevFuel.taxiBurnLb,
                      );
                    if (!watchCaughtUp) {
                      const livePayloadLb = pickLivePayloadLb(
                        verification.payload.liveLb,
                        prevCheck.loadVerification.payload.liveLb,
                      );
                      return {
                        ...mission,
                        lastPreflightCheck: {
                          ...prevCheck,
                          loadVerification: {
                            ...prevCheck.loadVerification,
                            payload: {
                              ...prevCheck.loadVerification.payload,
                              ...(livePayloadLb !== undefined
                                ? { liveLb: livePayloadLb }
                                : {}),
                              ...(verification.payload.stations
                                ? { stations: verification.payload.stations }
                                : {}),
                            },
                          },
                        },
                      };
                    }
                    injectFuelQuietUntilRef.current = 0;
                  }
                  if (
                    prevCheck.loadVerification.ready === verification.ready &&
                    Math.abs(
                      (prevCheck.loadVerification.payload.liveLb ?? 0) -
                        (verification.payload.liveLb ?? 0),
                    ) < 1 &&
                    Math.abs(
                      (prevCheck.loadVerification.fuel.liveLb ?? 0) -
                        (verification.fuel.liveLb ?? 0),
                    ) < 1
                  ) {
                    const prevTanks = prevCheck.loadVerification.fuel.tanks;
                    const nextTanks = verification.fuel.tanks;
                    const prevStations =
                      prevCheck.loadVerification.payload.stations;
                    const nextStations = verification.payload.stations;
                    const usableTanks = pickFuelTankBreakdown(
                      nextTanks,
                      prevTanks,
                      verification.fuel.liveLb,
                    );
                    const tanksChanged =
                      usableTanks != null &&
                      usableTanks === nextTanks &&
                      (!prevTanks ||
                        Math.abs(prevTanks.left - nextTanks!.left) >= 5 ||
                        Math.abs(prevTanks.right - nextTanks!.right) >= 5 ||
                        Math.abs(prevTanks.center - nextTanks!.center) >= 5 ||
                        Math.abs(
                          (prevTanks.leftAux ?? 0) - (nextTanks!.leftAux ?? 0),
                        ) >= 5 ||
                        Math.abs(
                          (prevTanks.rightAux ?? 0) - (nextTanks!.rightAux ?? 0),
                        ) >= 5 ||
                        Math.abs(
                          (prevTanks.leftTip ?? 0) - (nextTanks!.leftTip ?? 0),
                        ) >= 5 ||
                        Math.abs(
                          (prevTanks.rightTip ?? 0) - (nextTanks!.rightTip ?? 0),
                        ) >= 5);
                    const stationsChanged =
                      nextStations != null &&
                      stationMapDrifted(prevStations, nextStations, 5);
                    if (!tanksChanged && !stationsChanged) {
                      return mission;
                    }
                    return {
                      ...mission,
                      lastPreflightCheck: {
                        ...prevCheck,
                        loadVerification: {
                          ...prevCheck.loadVerification,
                          fuel: {
                            ...prevCheck.loadVerification.fuel,
                            ...(tanksChanged && usableTanks
                              ? { tanks: usableTanks }
                              : {}),
                            ...(verification.fuel.tankCapacity
                              ? {
                                  tankCapacity:
                                    verification.fuel.tankCapacity,
                                }
                              : {}),
                          },
                          payload: {
                            ...prevCheck.loadVerification.payload,
                            ...(stationsChanged && nextStations
                              ? { stations: nextStations }
                              : {}),
                            ...(verification.payload.stationMax
                              ? {
                                  stationMax:
                                    verification.payload.stationMax,
                                }
                              : {}),
                          },
                        },
                      },
                    };
                  }
                  const livePayloadLb = pickLivePayloadLb(
                    verification.payload.liveLb,
                    prevCheck.loadVerification.payload.liveLb,
                  );
                  const { tanks: _nextTanks, ...fuelRest } = verification.fuel;
                  const {
                    liveLb: _nextPayloadLive,
                    stations: _nextStations,
                    ...payloadRest
                  } = verification.payload;
                  const mergedTanks = pickFuelTankBreakdown(
                    verification.fuel.tanks,
                    prevCheck.loadVerification.fuel.tanks,
                    verification.fuel.liveLb,
                  );
                  const mergedStations =
                    verification.payload.stations ??
                    prevCheck.loadVerification.payload.stations;
                  const mergedTankCapacity =
                    verification.fuel.tankCapacity ??
                    prevCheck.loadVerification.fuel.tankCapacity;
                  const mergedStationMax =
                    verification.payload.stationMax ??
                    prevCheck.loadVerification.payload.stationMax;
                  const { tanks: _prevTanks, ...prevFuelRest } =
                    prevCheck.loadVerification.fuel;
                  const payloadOk =
                    livePayloadLb !== undefined
                      ? verification.payload.liveLb !== undefined
                        ? verification.payload.ok
                        : prevCheck.loadVerification.payload.ok
                      : false;
                  const ready = verification.fuel.ok && payloadOk;
                  return {
                    ...mission,
                    lastPreflightCheck: {
                      ...prevCheck,
                      checkedAtIso: new Date().toISOString(),
                      verdict: ready
                        ? prevCheck.verdict === 'fail'
                          ? 'pass'
                          : prevCheck.verdict
                        : 'fail',
                      loadVerification: {
                        ...prevCheck.loadVerification,
                        ready,
                        fuel: {
                          ...prevFuelRest,
                          ...fuelRest,
                          ...(mergedTanks ? { tanks: mergedTanks } : {}),
                          ...(mergedTankCapacity
                            ? { tankCapacity: mergedTankCapacity }
                            : {}),
                        },
                        payload: {
                          ...prevCheck.loadVerification.payload,
                          ...payloadRest,
                          liveLb: livePayloadLb,
                          ok: payloadOk,
                          ...(mergedStations
                            ? { stations: mergedStations }
                            : {}),
                          ...(mergedStationMax
                            ? { stationMax: mergedStationMax }
                            : {}),
                        },
                      },
                    },
                  };
                }),
              );
            });
          }
          return status;
        });
        // Watch auto-depart/settle (and false-depart revert) updates server
        // mission status — mirror into local missions so Dispatch step advances
        // without waiting for a full refresh.
        if (
          status.running &&
          status.missionId &&
          status.missionStatus &&
          [
            'accepted',
            'dispatched',
            'in_flight',
            'settled',
            'failed',
            'cancelled',
          ].includes(status.missionStatus)
        ) {
          const missionId = status.missionId;
          const nextStatus = status.missionStatus;
          queueMicrotask(() => {
            setMissions((current) => {
              let changed = false;
              const next = current.map((mission) => {
                if (mission.id !== missionId) return mission;
                if (mission.status === nextStatus) return mission;
                changed = true;
                return { ...mission, status: nextStatus as Mission['status'] };
              });
              return changed ? next : current;
            });
          });
        }
        if (status.running) {
          setSimBridge((prev) => {
            const connected = Boolean(status.pipeConnected);
            const next = {
              connected,
              mode: 'watch' as const,
              aircraftTitle: prev?.aircraftTitle ?? null,
              onGround: status.onGround,
              enginesRunning: status.enginesRunning,
              parkingBrake: prev?.parkingBrake ?? null,
              phase: status.phase,
              groundSpeedKt: status.groundSpeedKt,
              source: 'watch' as const,
              error: status.lastError,
              checkedAtIso: new Date().toISOString(),
            };
            if (
              prev &&
              prev.connected === next.connected &&
              prev.phase === next.phase &&
              prev.onGround === next.onGround &&
              prev.enginesRunning === next.enginesRunning &&
              prev.error === next.error &&
              prev.source === 'watch'
            ) {
              return prev;
            }
            return next;
          });
        }
      } catch {
        /* ignore watch poll errors */
      }
    }
    void pollWatch();
    const inFlight = activeMissionRef.current?.status === 'in_flight';
    // Keep polling while IN_FLIGHT even if the client dropped `running` —
    // otherwise a dead Watch UI never sees the server session (or a restart).
    if (!watch?.running && !inFlight) {
      return () => {
        cancelled = true;
      };
    }
    const id = window.setInterval(() => {
      void pollWatch();
    }, watch?.settling ||
      watch?.lastEvent?.type === 'settle' ||
      settleOverlaySticky ||
      (watch?.onGround === true &&
        watch?.sawAirborne &&
        (watch?.enginesRunning === false || watch?.parkingBrake === true) &&
        inFlight) ||
      (watch?.onGround === true && inFlight)
      ? 250
      : watch?.onGround === false
        ? 5_000
        : 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    watch?.running,
    watch?.onGround,
    watch?.settling,
    watch?.lastEvent?.type,
    watch?.enginesRunning,
    watch?.sawAirborne,
    watch?.parkingBrake,
    settleOverlaySticky,
    refresh,
  ]);

  // Global Settling overlay: only while an in-flight mission is settling.
  useEffect(() => {
    const mission = activeMissionRef.current;
    const settleBlocked = watch?.lastEvent?.type === 'settle_blocked';
    const liveInFlight = mission?.status === 'in_flight';
    const optimisticLandedSettle =
      liveInFlight &&
      !flightDebrief &&
      !settleBlocked &&
      Boolean(watch?.sawAirborne) &&
      watch?.onGround === true &&
      (watch?.enginesRunning === false ||
        watch?.parkingBrake === true ||
        watch?.lastEvent?.type === 'settle' ||
        Boolean(watch?.settling));
    if (liveInFlight && (watch?.settling || optimisticLandedSettle)) {
      setSettleOverlaySticky(true);
      return;
    }
    // Debrief open, mission gone, or settle finished — never leave sticky on.
    setSettleOverlaySticky(false);
  }, [
    watch?.settling,
    watch?.onGround,
    watch?.enginesRunning,
    watch?.parkingBrake,
    watch?.sawAirborne,
    watch?.lastEvent?.type,
    flightDebrief,
    missions,
  ]);

  useEffect(() => {
    if (!settleOverlaySticky && !watch?.settling) return;
    if (activeMissionRef.current?.status !== 'in_flight') return;
    if (tab !== 'staging' || airportIcao) {
      setAirportIcao(null);
      setTab('staging');
    }
  }, [settleOverlaySticky, watch?.settling, tab, airportIcao]);
  // Independent SimBridge probe — does not require Watch to be running.
  // When Watch is already sampling, skip probing entirely (server would only
  // mirror Watch anyway, and the extra poll re-rendered the status bar).
  useEffect(() => {
    if (watch?.running) return;
    // Don't open a competing probe pipe on an in-flight leg — that 0xC00000B0
    // fight with Watch resume left settle dead after landing.
    if (activeMissionRef.current?.status === 'in_flight') return;
    let cancelled = false;
    let consecutiveFailures = 0;
    async function pollBridge() {
      try {
        const status = await fetchSimBridgeStatus();
        if (cancelled) return;
        consecutiveFailures = 0;
        setSimBridge((prev) => {
          if (
            prev &&
            prev.connected === status.connected &&
            prev.phase === status.phase &&
            prev.onGround === status.onGround &&
            prev.enginesRunning === status.enginesRunning &&
            prev.error === status.error &&
            prev.aircraftTitle === status.aircraftTitle
          ) {
            return prev;
          }
          return status;
        });
      } catch {
        if (cancelled) return;
        consecutiveFailures += 1;
        // Only flip to disconnected after repeated failures — single blips
        // from pipe contention were flashing the status bar.
        if (consecutiveFailures >= 3) {
          setSimBridge((prev) => ({
            connected: false,
            mode: prev?.mode ?? null,
            aircraftTitle: prev?.aircraftTitle ?? null,
            onGround: prev?.onGround ?? null,
            enginesRunning: prev?.enginesRunning ?? null,
            parkingBrake: prev?.parkingBrake ?? null,
            phase: prev?.phase ?? null,
            groundSpeedKt: prev?.groundSpeedKt ?? null,
            source: 'probe',
            error: 'SimBridge status unavailable',
            checkedAtIso: new Date().toISOString(),
          }));
        }
      }
    }
    void pollBridge();
    const id = window.setInterval(() => {
      void pollBridge();
    }, 8_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [watch?.running]);

  const continuousHours = useMemo(() => {
    const frac = Math.max(0, displayNowMs - lastBatchAtMs) / msPerTick;
    return tick + frac;
  }, [displayNowMs, lastBatchAtMs, msPerTick, tick]);

  useEffect(() => {
    try {
      localStorage.setItem(SIMBRIEF_USER_KEY, simbriefUser.trim());
    } catch {
      /* ignore */
    }
  }, [simbriefUser]);

  useEffect(() => {
    activeWeightSystem = weightSystem;
    saveWeightSystem(weightSystem);
  }, [weightSystem]);

  useEffect(() => {
    if (!tickAdvance) {
      setTickAdvanceClockMs(0);
      return;
    }
    setTickAdvanceClockMs(Date.now());
    const id = window.setInterval(() => setTickAdvanceClockMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [tickAdvance]);

  const tickAdvanceElapsedSec = tickAdvance
    ? Math.max(
        0,
        Math.floor(
          ((tickAdvanceClockMs || Date.now()) - tickAdvance.startedAtMs) / 1000,
        ),
      )
    : 0;

  const msUntilNextPulse = lastBatchAtMs + msPerTick - displayNowMs;
  const worldClockLabel = tickAdvance
    ? tickAdvance.done <= 0
      ? `World · ${tickAdvanceElapsedSec}s`
      : `World · ${tickAdvance.done}/${tickAdvance.total}`
    : msUntilNextPulse <= 0
      ? 'World · pulse due'
      : `World · ${formatNextPulseCountdown(msUntilNextPulse)}`;
  // Stable title — a changing `title` every second makes native tooltips flicker.
  const worldClockTitle = tickAdvance
    ? `Advancing ${tickAdvance.label}… ${tickAdvance.done}/${tickAdvance.total} economy batches`
    : 'Economy day/time (shared world clock). Label countdown = wall time to next 15-min tick pulse. Not your local timezone.';

  const formatTickAdvanceButton = (total: number, idleLabel: string) => {
    if (!tickAdvance || tickAdvance.total !== total) return idleLabel;
    if (tickAdvance.done <= 0) return `…${tickAdvanceElapsedSec}s`;
    return `${tickAdvance.done}/${tickAdvance.total}`;
  };

  const loadFilterSteps = useMemo(
    () => loadFilterOptions(weightSystem),
    [weightSystem],
  );

  // Load filter option kg values change with metric/imperial — drop stale picks.
  useEffect(() => {
    const allowed = new Set(loadFilterSteps.map((s) => String(s.kg)));
    if (loadMinKg && !allowed.has(loadMinKg)) {
      setLoadMinKg('');
      setMarketPage(1);
    }
    if (loadMaxKg && !allowed.has(loadMaxKg)) {
      setLoadMaxKg('');
      setMarketPage(1);
    }
    // Only when the unit system (hence step table) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [loadFilterSteps]);

  useEffect(() => {
    saveDevMode(devMode);
  }, [devMode]);

  // Lab / Pulse / Rivals are dev-only — leave those tabs if Dev Mode is off.
  useEffect(() => {
    if (devMode) return;
    if (tab !== 'lab' && tab !== 'pulse' && tab !== 'fleet') return;
    setTab('market');
    writeCareerLocation({ tab: 'market', airportIcao: null }, { replace: true });
  }, [devMode, tab]);

  const activeCount = useMemo(
    () => missions.filter((m) => isActiveMissionStatus(m.status)).length,
    [missions],
  );
  const activeMission = useMemo(
    () => findDispatchBoardMission(missions, authAccountId),
    [missions, authAccountId],
  );
  activeMissionRef.current = activeMission;

  useEffect(() => {
    if (
      showProfileGate ||
      !activeCareerProfile?.id ||
      !careerReady ||
      staging ||
      charterManifest
    ) {
      return;
    }
    if (stagingRestoreAttemptedRef.current === activeCareerProfile.id) return;
    stagingRestoreAttemptedRef.current = activeCareerProfile.id;

    const persisted = readPersistedStagingDraft(activeCareerProfile.id);
    if (!persisted) return;
    if (
      !canRestoreStagingDraft(
        persisted,
        missions,
        activeMission?.id,
      )
    ) {
      clearPersistedStagingDraft(activeCareerProfile.id);
      return;
    }
    setStaging(persisted as StagingDraft);
    setPreferredAircraft(persisted.aircraft as AircraftClass);
    if (persisted.deskHold) {
      setStaging((current) => {
        if (!current?.deskHold) return current;
        const holdKg = Math.max(0, Math.floor(current.deskHold.kg));
        const loadKg =
          current.deskHold.loadKg != null &&
          Number.isFinite(current.deskHold.loadKg)
            ? Math.max(
                0,
                Math.min(holdKg, Math.floor(current.deskHold.loadKg)),
              )
            : holdKg;
        if (loadKg === current.deskHold.loadKg) return current;
        return {
          ...current,
          deskHold: { ...current.deskHold, loadKg },
        };
      });
    }
  }, [
    showProfileGate,
    activeCareerProfile?.id,
    careerReady,
    missions,
    staging,
    charterManifest,
    activeMission?.id,
  ]);

  useEffect(() => {
    setSimbriefLaunchUrl(null);
  }, [activeMission?.id]);

  // Reopen with a pilot in_flight mission → land on Dispatch once.
  // Do not mark the one-shot until we actually see in_flight — a first
  // missions payload of accepted/dispatched used to skip cruise resume.
  useEffect(() => {
    const airborne = findPlayerDispatchMission(missions, authAccountId);
    const action = airborneResumeShouldOpenDispatch({
      alreadyDone: airborneResumeNavDoneRef.current,
      hubSelected,
      tab,
      airportIcao,
      playerMissionStatus: airborne?.status,
    });
    if (action === 'wait') return;
    airborneResumeNavDoneRef.current = true;
    if (action === 'mark-done') return;
    setAirportIcao(null);
    setAirportView(null);
    setAirportHydrating(false);
    setTab('staging');
    writeCareerLocation({ tab: 'staging', airportIcao: null }, { replace: true });
  }, [hubSelected, missions, tab, airportIcao, authAccountId]);

  // Route ops cargo ceiling for Active Dispatch "Capacity left" (and staging).
  useEffect(() => {
    if (staging) return;
    if (tab === 'staging' && activeMission) {
      const opsEntry = findOpsEntry(
        opsFleetEntries,
        activeMission.aircraftId,
      );
      const typeId =
        activeMission.airframeTypeId?.trim() ||
        opsEntry?.aircraft.airframeTypeId?.trim() ||
        fleet.find((a) => a.id === activeMission.aircraftId)?.airframeTypeId
          ?.trim();
      void refreshCargoLimit(
        activeMission.aircraftClassId as AircraftClass,
        undefined,
        typeId,
        {
          originIcao: activeMission.originIcao,
          destIcao: activeMission.destIcao,
          aircraftId: activeMission.aircraftId,
          companyId: resolveOpsCompanyId(activeMission.aircraftId),
        },
      );
      return;
    }
    setMaxCargoKg(null);
    setMaxCargoBoundAircraftId(null);
    setStructuralMaxCargoKg(null);
    setEstimatedBlockFuelKg(null);
    setEstimatedFuelCostUsd(null);
    setEstimatedFuelUnitPriceUsd(null);
    setEstimatedFuelScarcity(null);
    setRouteFuelCapacityKg(null);
    setRouteFuelDeficitKg(null);
    setRouteFuelFeasible(null);
    setRouteDistanceNmResolved(null);
    setMaxCargoSource(null);
    setAirframeLabel(null);
    setMxFuelBurn(null);
  }, [
    activeMission?.id,
    activeMission?.aircraftClassId,
    activeMission?.aircraftId,
    activeMission?.airframeTypeId,
    activeMission?.originIcao,
    activeMission?.destIcao,
    fleet,
    opsFleetEntries,
    refreshCargoLimit,
    staging,
    tab,
  ]);

  const activeMissionMxFuelBurn = useMemo(
    () =>
      mxFuelBurnFromAircraft(
        findOpsEntry(opsFleetEntries, activeMission?.aircraftId)?.aircraft ??
          fleet.find((a) => a.id === activeMission?.aircraftId),
      ),
    [opsFleetEntries, fleet, activeMission?.aircraftId],
  );
  /** Active Tour context while a tour leg is the current Dispatch flight. */
  const activeTourOnDispatch = useMemo(() => {
    if (!activeTour || activeTour.status !== 'active') return null;
    const missionId = activeMission?.id;
    const flyingLeg =
      (missionId
        ? activeTour.legs.find((l) => l.missionId === missionId)
        : undefined) ??
      activeTour.legs.find((l) => l.status === 'active') ??
      null;
    if (!flyingLeg) return null;
    const nextAfter = activeTour.legs.find(
      (l) =>
        l.index > flyingLeg.index &&
        (l.status === 'planned' || l.status === 'lost'),
    );
    return {
      legIndex: flyingLeg.index,
      legCount: activeTour.legs.length,
      nextOrigin: nextAfter?.originIcao ?? null,
      nextDest: nextAfter?.destIcao ?? null,
      nextFerryNm: nextAfter?.ferryNm ?? 0,
      hubIcao: activeTour.hubIcao,
    };
  }, [activeTour, activeMission?.id]);

  /** Base map route: prefer Active Tour legs, else Search selection. */
  const baseDispatchMapTour = useMemo(() => {
    if (baseDispatchProduct === 'charter') {
      if (
        charterActiveTour?.status === 'active' &&
        charterActiveTour.legs.length > 0
      ) {
        return {
          legs: charterActiveTour.legs,
          routeLabel: charterActiveTour.routeLabel,
          totalFerryNm: charterActiveTour.legs.reduce(
            (s, l) => s + (l.ferryNm ?? 0),
            0,
          ),
          totalDistanceNm: charterActiveTour.legs.reduce(
            (s, l) => s + (l.distanceNm ?? 0),
            0,
          ),
        };
      }
      const tour = charterTours.find((t) => t.id === selectedCharterTourId);
      if (!tour?.legs.length) return null;
      return {
        legs: tour.legs,
        routeLabel: tour.routeLabel,
        totalFerryNm: tour.totalFerryNm,
        totalDistanceNm: tour.totalDistanceNm,
      };
    }
    if (activeTour?.status === 'active' && activeTour.legs.length > 0) {
      return {
        legs: activeTour.legs,
        routeLabel: activeTour.routeLabel,
        totalFerryNm: activeTour.legs.reduce(
          (s, l) => s + (l.ferryNm ?? 0),
          0,
        ),
        totalDistanceNm: activeTour.legs.reduce(
          (s, l) => s + (l.distanceNm ?? 0),
          0,
        ),
      };
    }
    const tour = dispatchTours.find((t) => t.id === selectedDispatchTourId);
    if (!tour?.legs.length) return null;
    return {
      legs: tour.legs,
      routeLabel: tour.routeLabel,
      totalFerryNm: tour.totalFerryNm,
      totalDistanceNm: tour.totalDistanceNm,
    };
  }, [
    baseDispatchProduct,
    charterActiveTour,
    charterTours,
    selectedCharterTourId,
    activeTour,
    dispatchTours,
    selectedDispatchTourId,
  ]);

  const playerDispatchMission = useMemo(
    () => findPlayerDispatchMission(missions, authAccountId),
    [missions, authAccountId],
  );
  const crewAirborneMission = useMemo(
    () => findCrewAirborneMission(missions),
    [missions],
  );
  const idleCrewOptions = useMemo(
    () =>
      (companyCrew?.members ?? [])
        .filter((m) => m.status === 'idle')
        .map((m) => ({
          id: m.id,
          displayName: m.displayName,
          perkLabel: m.perkLabel,
        })),
    [companyCrew?.members],
  );

  // Dispatch needs the complete route inventory. The global Freights payload is capped
  // at 200 rows and may omit valid same-route lots shown by the Terminal.
  useEffect(() => {
    if (!staging) {
      setStagingRouteLots([]);
      setStagingRouteLotsLoading(false);
      setStagingRouteLotsError(null);
      return;
    }

    let cancelled = false;
    setStagingRouteLots([]);
    setStagingRouteLotsLoading(true);
    setStagingRouteLotsError(null);
    void fetchRouteLots(staging.originIcao, staging.destIcao)
      .then((result) => {
        if (!cancelled) setStagingRouteLots(result.lots);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStagingRouteLotsError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setStagingRouteLotsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [staging?.originIcao, staging?.destIcao, tick]);

  /** Tour Manifest: when route lots hydrate, rebind a dead planned lot. */
  useEffect(() => {
    if (!staging || staging.replaceManifest) return;
    if (!pendingActiveTourRef.current) return;
    if (stagingRouteLotsLoading || stagingRouteLots.length === 0) return;
    const line = staging.lines[0];
    if (!line) return;
    const resolved = stagingResolvedLot(
      staging,
      line.lot,
      missions,
      stagingRouteLots,
      lots,
    );
    const avail = Math.max(0, Math.floor(resolved.availableKg ?? 0));
    if (avail >= 1 && line.cargoKg > 0 && line.cargoKg <= avail) return;

    const wantKg = Math.max(line.cargoKg, line.lot.quantityKg || 1, 1);
    const pending = pendingActiveTourRef.current;
    const alt = findSameRouteAlternateLot(
      staging.originIcao,
      staging.destIcao,
      wantKg,
      [
        line.lot.id,
        ...(pending ? tourLegExcludeLotIds(pending.legIndex) : []),
      ],
      [...stagingRouteLots, ...lots],
    );
    if (!alt) return;

    if (pending) {
      patchPendingTourLegLot(
        pending.legIndex,
        alt.id,
        Math.min(alt.availableKg, wantKg),
      );
    }
    const nextDraft: StagingDraft = {
      ...staging,
      lines: [
        {
          lot: { ...alt, reason: alt.reason || 'tour leg (rebound)' },
          cargoKg: 0,
        },
      ],
    };
    const maxKg = lineMaxKg(nextDraft, alt);
    nextDraft.lines[0]!.cargoKg =
      maxKg > 0 ? Math.min(maxKg, alt.availableKg) : 0;
    setStaging(nextDraft);
    setToastKind('warn');
    setToast(
      `Planned lot gone — rebound ${alt.originIcao}→${alt.destIcao} · ${formatTonnes(alt.availableKg)} free`,
    );
  }, [
    staging?.originIcao,
    staging?.destIcao,
    staging?.lines[0]?.lot.id,
    staging?.lines[0]?.cargoKg,
    stagingRouteLots,
    stagingRouteLotsLoading,
    lots,
    missions,
  ]);

  useEffect(() => {
    const username = simbriefUser.trim();
    const eligible =
      tab === 'staging' &&
      !airportIcao &&
      !staging?.replaceManifest &&
      activeMission?.status === 'dispatched' &&
      Boolean(activeMission.staticId) &&
      (!activeMission.lastOfpCheck ||
        activeMission.lastOfpCheck.verdict === 'fail') &&
      Boolean(username) &&
      !busy;

    if (!eligible || !activeMission) {
      setOfpAutoStatus('idle');
      return;
    }

    let cancelled = false;
    let stopped = false;
    let inFlight = false;
    setOfpAutoStatus('waiting');

    async function pollOfp() {
      if (cancelled || stopped || inFlight || !activeMission) return;
      inFlight = true;
      setOfpAutoStatus('checking');
      try {
        const result = await postConfirmOfp({
          missionId: activeMission.id,
          simbriefUser: username,
          companyId: resolveOpsCompanyId(activeMission.aircraftId) || undefined,
        });
        if (cancelled) return;
        setMissions((current) =>
          current.map((mission) =>
            mission.id === result.mission.id ? result.mission : mission,
          ),
        );
        if (
          result.check.verdict === 'pass' ||
          result.check.verdict === 'warn'
        ) {
          stopped = true;
          // Preflight card updates in place — no toast for a quiet auto-pass.
          if (result.check.verdict === 'warn') {
            setToastKind('warn');
            setToast('OFP confirmed with warnings · check Preflight');
          }
          setOfpAutoStatus('idle');
        } else {
          setOfpAutoStatus('waiting');
        }
      } catch {
        if (!cancelled) {
          setOfpAutoStatus('waiting');
        }
      } finally {
        inFlight = false;
      }
    }

    void pollOfp();
    // 5s while waiting — shorter than 10s so Generate→confirm feels responsive.
    // Also re-check the moment the user returns to Skyline from the browser.
    const id = window.setInterval(() => {
      void pollOfp();
    }, 5_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void pollOfp();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [
    activeMission?.id,
    activeMission?.status,
    activeMission?.staticId,
    activeMission?.lastOfpCheck?.verdict,
    airportIcao,
    simbriefUser,
    staging?.replaceManifest,
    tab,
    busy,
  ]);

  // Compare persisted fleet fuel against confirmed OFP block fuel. A zero-cost
  // authorization is automatic; a positive shortfall requires user purchase.
  useEffect(() => {
    const mission = activeMission;
    const ofp = mission?.lastOfpCheck;
    const eligible =
      tab === 'staging' &&
      !airportIcao &&
      mission?.status === 'dispatched' &&
      !mission.contractPilot &&
      Boolean(ofp?.ofpId) &&
      (ofp?.verdict === 'pass' || ofp?.verdict === 'warn') &&
      typeof ofp?.plannedBlockFuelKg === 'number' &&
      ofp.plannedBlockFuelKg > 0;

    if (!eligible || !mission || !ofp?.ofpId) {
      setMissionFuelQuote(null);
      setMissionFuelQuoteStatus('idle');
      setMissionFuelQuoteError(null);
      return;
    }
    if (mission.fuelAuthorizedOfpId === ofp.ofpId) {
      setMissionFuelQuote(null);
      setMissionFuelQuoteStatus('ready');
      setMissionFuelQuoteError(null);
      return;
    }

    let cancelled = false;
    setMissionFuelQuoteStatus('loading');
    setMissionFuelQuoteError(null);
    void (async () => {
      try {
        const opsCompanyId = resolveOpsCompanyId(mission.aircraftId);
        const result = await postFuelQuote(mission.id, {
          companyId: opsCompanyId || undefined,
        });
        if (cancelled) return;
        if (result.quote.shortfallKg <= 0) {
          const purchased = await postFuelPurchase(mission.id, {
            companyId: opsCompanyId || undefined,
          });
          if (cancelled) return;
          setMissions((current) =>
            current.map((m) =>
              m.id === purchased.mission.id ? purchased.mission : m,
            ),
          );
          paintOpsMutationFleet(purchased.fleet, opsCompanyId);
          commitWallet(purchased.walletUsd);
          setMissionFuelQuote(null);
          setMissionFuelQuoteStatus('ready');
          return;
        }
        setMissionFuelQuote(result);
        setMissionFuelQuoteStatus('ready');
      } catch (err) {
        if (!cancelled) {
          setMissionFuelQuote(null);
          setMissionFuelQuoteStatus('error');
          setMissionFuelQuoteError(
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeMission?.id,
    activeMission?.status,
    activeMission?.aircraftId,
    activeMission?.contractPilot,
    activeMission?.fuelAuthorizedOfpId,
    activeMission?.lastOfpCheck?.ofpId,
    activeMission?.lastOfpCheck?.plannedBlockFuelKg,
    activeMission?.lastOfpCheck?.verdict,
    airportIcao,
    missionFuelQuoteRetryToken,
    tab,
  ]);

  // Live inject progress (planning → injecting → balancing CG → verifying).
  // Skyline inject is user-armed from Preflight (default off) — no auto-start.
  useEffect(() => {
    if (loadOfpAutoStatus !== 'loading' || !activeMission?.id) {
      return;
    }
    let cancelled = false;
    async function poll() {
      try {
        const { progress } = await fetchLoadOfpProgress(activeMission!.id);
        if (cancelled) return;
        setLoadOfpProgress(progress);
        // Overlay live Sim weights onto Preflight cards while inject owns the pipe.
        // Do NOT touch checkedAtIso / ready — those remounted the auto-inject effect
        // and hid Cancel / started a second inject.
        if (
          progress &&
          (progress.livePayloadLb !== undefined ||
            progress.liveFuelLb !== undefined ||
            progress.liveMac !== undefined ||
            progress.liveTanks ||
            progress.liveStations)
        ) {
          const missionId = activeMission!.id;
          setMissions((current) =>
            current.map((mission) => {
              if (mission.id !== missionId) return mission;
              const prev = mission.lastPreflightCheck;
              const verification = prev?.loadVerification;
              if (!prev || !verification) {
                return mission;
              }
              const livePayload =
                progress.livePayloadLb ?? verification.payload.liveLb;
              const heldFuel = holdWrittenFuelLb({
                liveLb: progress.liveFuelLb ?? verification.fuel.liveLb,
                writtenLb: verification.fuel.plannedLb,
                prevLb: verification.fuel.liveLb,
              });
              const fuelDumpedDuringPayload =
                typeof progress.liveFuelLb === 'number' &&
                typeof heldFuel === 'number' &&
                Math.abs(progress.liveFuelLb - heldFuel) > 80;
              const stableTanks = fuelDumpedDuringPayload
                ? verification.fuel.tanks
                : pickFuelTankBreakdown(
                    progress.liveTanks,
                    verification.fuel.tanks,
                    heldFuel ?? verification.fuel.liveLb,
                  );
              const liveFuel = heldFuel ?? verification.fuel.liveLb;
              return {
                ...mission,
                lastPreflightCheck: {
                  ...prev,
                  loadVerification: {
                    ...verification,
                    fuel: {
                      ...verification.fuel,
                      liveLb: liveFuel,
                      ...(stableTanks ? { tanks: stableTanks } : {}),
                      ...(progress.tankCapacity
                        ? { tankCapacity: progress.tankCapacity }
                        : {}),
                    },
                    payload: {
                      ...verification.payload,
                      liveLb: livePayload,
                      ...(progress.liveStations
                        ? { stations: progress.liveStations }
                        : {}),
                      ...(progress.stationMax
                        ? { stationMax: progress.stationMax }
                        : {}),
                    },
                    cg:
                      progress.liveMac !== undefined ||
                      progress.minMac !== undefined ||
                      verification.cg
                        ? {
                            ...(verification.cg ?? {
                              ok: true,
                              severity: 'info' as const,
                            }),
                            liveMac:
                              progress.liveMac ?? verification.cg?.liveMac,
                            ...(progress.minMac !== undefined
                              ? { minMac: progress.minMac }
                              : {}),
                            ...(progress.maxMac !== undefined
                              ? { maxMac: progress.maxMac }
                              : {}),
                          }
                        : verification.cg,
                  },
                },
              };
            }),
          );
        }
      } catch {
        /* soft — inject request is the source of truth for completion */
      }
    }
    void poll();
    const id = window.setInterval(() => {
      void poll();
    }, 700);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [loadOfpAutoStatus, activeMission?.id]);

  // Writes finished (`done`) or premature `failed` (HTTP verify lagged classic
  // stations) — clear when Loaded vs Due numbers actually match Preflight.
  useEffect(() => {
    if (loadOfpAutoStatus !== 'done' && loadOfpAutoStatus !== 'failed') return;
    const watchV =
      watch?.running && watch.missionId === activeMission?.id
        ? watch.loadVerification
        : undefined;
    const missionV = activeMission?.lastPreflightCheck?.loadVerification;
    const v = watchV ?? missionV;
    if (!loadVerificationNumbersMatch(v)) return;
    setLoadOfpAutoStatus('idle');
    setLoadOfpAutoError(null);
    setLoadOfpProgress(null);
    setSkylineInjectEnabled(false);
  }, [
    activeMission?.id,
    activeMission?.lastPreflightCheck?.loadVerification,
    loadOfpAutoStatus,
    watch?.loadVerification,
    watch?.missionId,
    watch?.running,
  ]);

  // Confirming forever when Sim payload never reaches Due (MTOW cut without
  // Accept, Accu-Sim under-read, etc.) — time out to a recoverable failed state.
  useEffect(() => {
    if (loadOfpAutoStatus !== 'done') return;
    const timer = window.setTimeout(() => {
      if (loadOfpAutoStatusRef.current !== 'done') return;
      setLoadOfpAutoStatus('failed');
      setLoadOfpAutoError(
        'Inject wrote, but Loaded vs Due still does not match. If SimBrief limited cargo, Accept OFP cargo first; otherwise re-check stations and retry inject.',
      );
      setLoadOfpProgress(null);
    }, 20_000);
    return () => window.clearTimeout(timer);
  }, [loadOfpAutoStatus]);

  // Do not auto-hide the inject toggle on a timer — user turns it off manually.

  // Continuously refresh Loaded vs Due while staging on the ground.
  // Full /api/preflight opens its own pipe — pause while Watch owns SimBridge
  // (Watch tick persists loadVerification as the single source of truth).
  // First Preflight must succeed before Watch starts — otherwise the Load step
  // has no Preflight card / Skyline inject toggle.
  useEffect(() => {
    const username = simbriefUser.trim();
    const ofp = activeMission?.lastOfpCheck;
    // Match deriveDispatchStep: contract-pilot skips fuel purchase, so do not
    // require fuelAuthorizedOfpId (Accept OFP clears it; step can still be load).
    const fuelOk = activeMission ? fuelAuthorizedForOfp(activeMission) : false;
    // Do not gate on simBridge.connected — the probe can lag/false-negative while
    // /api/preflight still opens a pipe. Call the API and surface failures on the
    // Load card instead of spinning "Waiting for live preflight…" forever.
    const eligible =
      tab === 'staging' &&
      !airportIcao &&
      Boolean(activeMission) &&
      activeMission?.status === 'dispatched' &&
      Boolean(username) &&
      Boolean(ofp?.ofpId) &&
      fuelOk &&
      simBridge?.onGround !== false &&
      // Hold-off means we already dropped UI Watch; do not wait for a hung
      // server tick to finish before the first Preflight sample.
      (!watch?.running || holdWatchOffForPreflight) &&
      loadOfpAutoStatus !== 'loading' &&
      loadOfpAutoStatus !== 'waiting' &&
      !ofpInjectInFlightRef.current &&
      !staging?.replaceManifest;
    if (!eligible || !activeMission) return;

    let cancelled = false;
    let inFlight = false;
    async function refreshLiveLoad() {
      if (cancelled || inFlight || !activeMission) return;
      inFlight = true;
      try {
        const result = await postPreflight({
          missionId: activeMission.id,
          simbriefUser: username,
          companyId: resolveOpsCompanyId(activeMission.aircraftId) || undefined,
        });
        if (cancelled) return;
        setPreflightBootstrapError(null);
        preflightBootstrapErrorRef.current = null;
        setMissions((current) =>
          current.map((mission) =>
            mission.id === result.mission.id ? result.mission : mission,
          ),
        );
      } catch (err) {
        // Soft background refresh — but surface the first failure so Load
        // isn't a blank wait when SimBridge is up and the sample still fails.
        if (cancelled || activeMission.lastPreflightCheck) return;
        const message = err instanceof Error ? err.message : String(err);
        if (preflightBootstrapErrorRef.current === message) return;
        preflightBootstrapErrorRef.current = message;
        setPreflightBootstrapError(message);
      } finally {
        inFlight = false;
      }
    }

    void refreshLiveLoad();
    // Bootstrap: retry ~1.5s until the Preflight card exists; steady 5s after.
    const bootstrap = !activeMission.lastPreflightCheck;
    const id = window.setInterval(() => {
      void refreshLiveLoad();
    }, bootstrap ? 1_500 : 5_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshLiveLoad();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [
    activeMission?.id,
    activeMission?.status,
    activeMission?.contractPilot,
    activeMission?.fuelAuthorizedOfpId,
    activeMission?.lastOfpCheck?.ofpId,
    activeMission?.lastOfpCheck?.verdict,
    activeMission?.lastPreflightCheck,
    airportIcao,
    holdWatchOffForPreflight,
    loadOfpAutoStatus,
    simBridge?.onGround,
    simbriefUser,
    staging?.replaceManifest,
    tab,
    watch?.running,
  ]);

  // Reset bootstrap hint when leaving this mission / getting a Preflight card.
  useEffect(() => {
    if (!activeMission?.id || activeMission.lastPreflightCheck) {
      setPreflightBootstrapError(null);
      preflightBootstrapErrorRef.current = null;
      if (activeMission?.lastPreflightCheck) {
        setHoldWatchOffForPreflight(false);
      }
    }
  }, [activeMission?.id, activeMission?.lastPreflightCheck]);

  // If Watch started before the first Preflight (stuck Load with no card), stop
  // it once so /api/preflight can bootstrap Loaded vs Due + inject toggle.
  // Never stop an already airborne mission — reopen mid-flight must keep Watch.
  useEffect(() => {
    if (
      !watch?.running ||
      !activeMission ||
      watch.missionId !== activeMission.id ||
      activeMission.lastPreflightCheck ||
      activeMission.status === 'in_flight'
    ) {
      return;
    }
    // Drop UI Watch immediately — a hung SAMPLING tick can take seconds to
    // abort; Preflight must not wait behind "Watch still holds SimBridge".
    setHoldWatchOffForPreflight(true);
    setWatch(null);
    void postWatchStop({ reset: true }).catch(() => {
      /* soft — hold flag still blocks poll/auto-start */
    });
  }, [
    activeMission?.id,
    activeMission?.lastPreflightCheck,
    activeMission?.status,
    watch?.missionId,
    watch?.running,
  ]);

  // Keep Watch running after the first Preflight exists; Preflight gates auto-depart.
  // Mid-flight reopen: resume without requiring Dispatch tab or a Preflight card
  // (depart already happened; airborne % was persisted separately).
  useEffect(() => {
    const alreadyWatching =
      Boolean(watch?.running) && watch?.missionId === activeMission?.id;
    const isAirborneResume = activeMission?.status === 'in_flight';
    // Settlement / cruise from a *previous* mission must not block Watch on the
    // next flight — that left PC24 stuck on DISPATCHED while probe showed AIRBORNE.
    const staleWatchOtherMission =
      Boolean(watch?.missionId) &&
      Boolean(activeMission?.id) &&
      watch?.missionId !== activeMission?.id;
    const settlementBlocks =
      Boolean(watch?.settlement) && watch?.missionId === activeMission?.id;
    const eligible =
      (tab === 'staging' || isAirborneResume) &&
      // Airport panel can stay selected while Dispatch is open — do not block
      // Watch for an active staged flight (only block when not on staging).
      (tab === 'staging' || !airportIcao || isAirborneResume) &&
      Boolean(activeMission) &&
      ['dispatched', 'in_flight'].includes(activeMission?.status ?? '') &&
      // Ground Dispatch needs Loaded vs Due before Watch owns the pipe.
      (isAirborneResume ||
        Boolean(activeMission?.lastPreflightCheck?.loadVerification)) &&
      !alreadyWatching &&
      !watchAutoPaused &&
      !holdWatchOffForPreflight &&
      !settlementBlocks &&
      // Inject owns the SimBridge pipe — do not auto-start Watch until inject
      // leaves waiting/loading (Watch tick is the Loaded vs Due owner afterward).
      loadOfpAutoStatus !== 'loading' &&
      loadOfpAutoStatus !== 'waiting' &&
      !ofpInjectInFlightRef.current;

    if (staleWatchOtherMission && !watch?.running) {
      setWatch(null);
    }

    if (!eligible || !activeMission) {
      if (!alreadyWatching) {
        setWatchAutoStatus('idle');
      }
      return;
    }

    let cancelled = false;
    let stopped = false;
    let inFlight = false;
    setWatchAutoStatus('waiting');

    async function tryStartWatch() {
      if (cancelled || stopped || inFlight || !activeMission) return;
      inFlight = true;
      setWatchAutoStatus('connecting');
      try {
        const status = await postWatchStart({
          missionId: activeMission.id,
          intervalSec: 5,
        });
        // Late responses must not resurrect Watch while Preflight owns the pipe
        // (or after this effect was cancelled / remounted).
        const stillNeedsHold =
          holdWatchOffForPreflightRef.current ||
          (!isAirborneResume &&
            !activeMissionRef.current?.lastPreflightCheck?.loadVerification);
        if (cancelled || stillNeedsHold) {
          if (status.running) {
            void postWatchStop({ reset: true }).catch(() => {
              /* soft */
            });
          }
          if (!cancelled) setWatchAutoStatus('waiting');
          return;
        }
        setWatch(status);
        stopped = true;
        if (!cancelled) {
          setWatchAutoStatus('idle');
        }
      } catch {
        if (!cancelled) {
          setWatchAutoStatus('waiting');
        }
      } finally {
        inFlight = false;
      }
    }

    void tryStartWatch();
    const id = window.setInterval(() => {
      void tryStartWatch();
    }, isAirborneResume
      ? 5_000
      : loadOfpAutoStatus === 'done' || loadOfpAutoStatus === 'failed'
        ? 2_000
        : 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    activeMission?.id,
    activeMission?.status,
    activeMission?.destIcao,
    // Presence of first Preflight only — do NOT depend on ready/checkedAtIso
    // (those flip every sample and remounted this effect → Watch start storms).
    Boolean(activeMission?.lastPreflightCheck?.loadVerification),
    airportIcao,
    holdWatchOffForPreflight,
    loadOfpAutoStatus,
    tab,
    watch?.running,
    watch?.missionId,
    watch?.settlement,
    watchAutoPaused,
  ]);

  // Reset watch auto-pause only when switching missions (not on every live check).
  // Also drop leftover Watch UI (settlement / cruise / missionId) from the prior leg
  // so auto-start is not blocked and the footer stops looking like the last flight.
  useEffect(() => {
    setWatchAutoPaused(false);
    const nextId = activeMission?.id ?? null;
    setWatch((prev) => {
      if (!prev) return null;
      if (nextId && prev.missionId === nextId) return prev;
      return null;
    });
    let cancelled = false;
    void (async () => {
      try {
        const status = await fetchWatchStatus();
        if (cancelled) return;
        if (
          status.running &&
          status.missionId &&
          nextId &&
          status.missionId !== nextId
        ) {
          await postWatchStop({ reset: true });
        }
      } catch {
        /* soft — auto-start will retry */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeMission?.id]);

  useEffect(() => {
    setSkylineInjectEnabled(false);
    setLoadOfpAutoStatus('idle');
    setLoadOfpAutoError(null);
    setLoadOfpProgress(null);
  }, [activeMission?.id]);

  // Draft is only for pre-commit preparation; once a flight is operational, clear it.
  // Keep the draft while editing an accepted/dispatched manifest in place.
  useEffect(() => {
    if (!activeMission || !staging) return;
    if (
      staging.intoMissionId === activeMission.id &&
      (activeMission.status === 'accepted' ||
        (staging.replaceManifest && activeMission.status === 'dispatched'))
    ) {
      return;
    }
    if (activeCareerProfile?.id) {
      clearPersistedStagingDraft(activeCareerProfile.id);
    }
    setStaging(null);
  }, [
    activeMission?.id,
    activeMission?.status,
    staging?.intoMissionId,
    staging?.replaceManifest,
  ]);

  async function run(
    action: () => Promise<void>,
    opts: {
      lockUi?: boolean;
      /**
       * Post-unlock client re-read. Default: none — trust mutation response paint.
       * Pass a CareerRefreshScope or `'full'` only when boards/world slices
       * change beyond what the action already set.
       */
      sync?: CareerRefreshScope | 'full';
    } = {},
  ) {
    const lockUi = opts.lockUi !== false;
    if (lockUi) setBusy(true);
    setError(null);
    let failed = false;
    try {
      await action();
    } catch (err) {
      failed = true;
      const message = err instanceof Error ? err.message : String(err);
      if (shouldSurfaceApiError(message)) setError(message);
    } finally {
      // Unlock before board sync — holding busy through refresh() made every
      // confirm (buy/lease/contract/travel/…) feel stuck after OK.
      if (lockUi) setBusy(false);
    }
    if (!failed && opts.sync) {
      try {
        await refresh(opts.sync === 'full' ? undefined : opts.sync);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (shouldSurfaceApiError(message)) setError(message);
      }
    }
  }

  async function openAirport(
    icao: string,
    opts?: { section?: TerminalSection },
  ) {
    const next = icao.toUpperCase();
    const section = opts?.section ?? 'inventory';
    const switchingIcao = airportIcao !== next;

    const applyTerminalNav = () => {
      if (switchingIcao) {
        setTerminalSection(section);
        setContractsLane('outbound');
        setContractsProduct('freight');
        setContractsOffer('aircraft');
        setContractsSorts([...DEFAULT_BOARD_SORTS]);
        setContractsAccessFilter('');
        setContractsSisterOnly(false);
        setContractsProfitableOnly(false);
        setContractsPage(1);
        setSelectedContractLotId(null);
      } else if (opts?.section) {
        setTerminalSection(opts.section);
      }
      setAirportIcao(next);
      writeCareerLocation({ tab, airportIcao: next });
      if (section === 'fbo') {
        writeLastFboIcao(next);
      }
    };

    // Paint the terminal immediately from hub metadata + Freights lots already
    // on screen; hydrate `/api/airport` (stock, movements, estimates) in the
    // background so a click from Freights does not sit on the board for seconds.
    if (!switchingIcao) {
      applyTerminalNav();
      return;
    }

    const hub =
      networkHubs.find((h) => h.icao.toUpperCase() === next) ?? null;
    setAirportView(
      buildOptimisticAirportView(next, {
        hub,
        playerFbos,
        homeHubIcao: homeHubIcao || null,
        tick,
        lastBatchAtMs,
        msPerTick,
        lots,
      }),
    );
    applyTerminalNav();
    setAirportHydrating(true);
    const seq = ++airportOpenSeqRef.current;
    void (async () => {
      try {
        const stock = await fetchAirport(next, { part: 'stock' });
        if (airportOpenSeqRef.current !== seq) return;
        setAirportView((prev) => mergeAirportStock(prev, stock));
      } catch {
        /* Full payload below may still succeed. */
      }
      try {
        const view = await fetchAirportView(next);
        if (airportOpenSeqRef.current !== seq) return;
        setAirportView(view);
        if (view.playerFbos) {
          setPlayerFbos(view.playerFbos);
          if (fboBoardRedirectOwnedRef.current && section === 'fbo') {
            fboBoardRedirectOwnedRef.current = false;
            const ownedIcaos = (view.playerFbos.fbos ?? []).map((f) =>
              f.icao.trim().toUpperCase(),
            );
            if (ownedIcaos.length > 0 && !ownedIcaos.includes(next)) {
              const home = homeHubIcao.trim().toUpperCase();
              const prefer =
                (home && ownedIcaos.includes(home) ? home : null) ??
                ownedIcaos[0]!;
              void openAirport(prefer, { section: 'fbo' });
              return;
            }
          }
        }
        setAirportHydrating(false);
      } catch (err: unknown) {
        if (airportOpenSeqRef.current !== seq) return;
        setAirportHydrating(false);
        const message = err instanceof Error ? err.message : String(err);
        if (shouldSurfaceApiError(message)) setError(message);
      }
    })();
  }

  function openFboBoard() {
    setAirportReturn(null);
    setSidebarOpen(false);
    const owned = (playerFbos?.fbos ?? []).map((f) => f.icao.toUpperCase());
    const current = airportIcao?.toUpperCase() ?? null;
    if (current && owned.includes(current) && airportView) {
      writeLastFboIcao(current);
      setTerminalSection('fbo');
      return;
    }
    const last = readLastFboIcao();
    const home = homeHubIcao.trim().toUpperCase();
    let target: string | null = null;
    if (last && owned.includes(last)) target = last;
    else if (home && owned.includes(home)) target = home;
    else if (owned[0]) target = owned[0]!;
    else if (home) target = home;
    if (!target) {
      setToastKind('warn');
      setToast('Set a home hub before opening Base');
      return;
    }
    // Client FBO list can be empty before first airport hydrate — open home,
    // then redirect to the owned Base once /api/airport returns the fleet.
    fboBoardRedirectOwnedRef.current = owned.length === 0;
    void openAirport(target, { section: 'fbo' });
  }

  function closeAirport() {
    airportOpenSeqRef.current += 1;
    setAirportIcao(null);
    setAirportView(null);
    setAirportHydrating(false);
    setTerminalSection('inventory');
    setContractsLane('outbound');
    setContractsProduct('freight');
    setContractsOffer('aircraft');
    setContractsSorts([...DEFAULT_BOARD_SORTS]);
    setContractsAccessFilter('');
    setContractsSisterOnly(false);
    setContractsProfitableOnly(false);
    setContractsPage(1);
    setSelectedContractLotId(null);
    setAirportReturn(null);
    writeCareerLocation({ tab, airportIcao: null });
  }

  function goToTab(next: Tab, opts: { replace?: boolean } = {}) {
    airportOpenSeqRef.current += 1;
    setAirportIcao(null);
    setAirportView(null);
    setAirportHydrating(false);
    setTerminalSection('inventory');
    setContractsLane('outbound');
    setContractsProduct('freight');
    setContractsOffer('aircraft');
    setContractsSorts([...DEFAULT_BOARD_SORTS]);
    setContractsAccessFilter('');
    setContractsSisterOnly(false);
    setContractsProfitableOnly(false);
    setContractsPage(1);
    setSelectedContractLotId(null);
    setTab(next);
    writeCareerLocation({ tab: next, airportIcao: null }, opts);
    // Sidebar / deep-link Hangar must never show VA fleet while session is VA
    // — unless a VA Dispatch mission is active (ops tenant must stay).
    if (next === 'hangar') {
      const home = homeCompanyIdRef.current?.trim();
      const me = authAccountIdRef.current?.trim() || '';
      const activeVaDispatch = missions.some((m) => {
        if (!isActiveMissionStatus(m.status) || !isPlayerDispatchMission(m)) {
          return false;
        }
        if (!me) return true;
        const owner = m.pilotAccountId?.trim() || '';
        if (!owner) return true;
        return owner === me;
      });
      if (
        home &&
        home !== activeCompanyIdRef.current &&
        !activeVaDispatch
      ) {
        void switchCompanyForVa(home).catch(() => undefined);
      }
    }
  }

  function selectTab(next: Tab) {
    setAirportReturn(null);
    setSidebarOpen(false);
    // Soft refresh in background — don't flash disabled on every nav button.
    void (async () => {
      const home = homeCompanyIdRef.current?.trim();
      // Keep VA tenant while an active Dispatch mission needs that company
      // (member accepted Freights/Charter on a VA tail).
      // Company port desk lives under My VA → Ports (session already VA there).
      // Sidebar Ports is always home logistics.
      const me = authAccountIdRef.current?.trim() || '';
      const activeVaDispatch = missions.some((m) => {
        if (!isActiveMissionStatus(m.status) || !isPlayerDispatchMission(m)) {
          return false;
        }
        if (!me) return true;
        const owner = m.pilotAccountId?.trim() || '';
        if (!owner) return true;
        return owner === me;
      });
      const onVaTenant =
        Boolean(home) && home !== activeCompanyIdRef.current;
      const mustRestoreHome =
        onVaTenant && next !== 'va' && !activeVaDispatch;
      if (mustRestoreHome && home) {
        try {
          await switchCompanyForVa(home);
        } catch {
          /* soft — refresh below may still heal */
        }
      }
      goToTab(next);
      // My VA loads its own /api/va/members — don't block tab paint on App refresh.
      if (next === 'va') {
        void run(() => refresh(liveRefreshScope(next, false)), {
          lockUi: false,
        });
      } else {
        await run(() => refresh(liveRefreshScope(next, false)), {
          lockUi: false,
        });
      }
    })();
  }

  async function returnToAirport() {
    if (!airportReturn) return;
    const { icao, section } = airportReturn;
    setAirportReturn(null);
    setSidebarOpen(false);
    await run(async () => {
      const view = await fetchAirportView(icao);
      setAirportView(view);
      if (view.playerFbos) setPlayerFbos(view.playerFbos);
      setAirportIcao(icao);
      setTerminalSection(section);
      writeCareerLocation({ tab, airportIcao: icao });
    }, { lockUi: false });
  }

  async function onDebugCreditWallet(amountUsd = 5_000) {
    await run(async () => {
      const result = await postDebugCreditWallet({ amountUsd });
      commitWallet(result.walletUsd);
      // Hangar cashflow + My VA Ledger keep their own snapshots — refresh both.
      try {
        const snap = await fetchCashflow();
        setCashflow(snap);
        if (snap.companyCredit) setCompanyCredit(snap.companyCredit);
      } catch {
        /* soft — wallet paint already committed */
      }
      setVaLedgerRefreshEpoch((n) => n + 1);
      setToastKind('ok');
      setToast(`Debug credit +${formatMoney(result.creditedUsd)}`);
    });
  }

  async function onDebugClaimSantos() {
    await run(async () => {
      const result = await postDebugClaimPort({ portId: 'BRSSZ' });
      commitWallet(result.walletUsd);
      setToastKind('ok');
      setToast(
        `Debug Port FBO · ${result.concession.portId} P${result.concession.level}`,
      );
    });
  }

  async function onTick(ticks = 1) {
    const hoursLabel =
      ticks === 1
        ? '15 min'
        : ticks === 96
          ? '1 day'
          : ticks === 96 * 7
            ? '7 days'
            : ticks === 96 * 14
              ? '14 days'
              : ticks === 96 * 30
                ? '30 days'
                : `${ticks * 15} min`;
    // Progress every ≤¼ day so +1d isn't stuck at 0/96 for minutes on one POST.
    // Still 4 saves/day vs the old 12 (chunk=8). Hub Stats sample = 1×/day boundary only.
    const ticksPerDay = 96;
    const chunkSize = ticks <= 8 ? ticks : Math.min(ticks, 24);
    const startedAtMs = Date.now();
    await run(async () => {
      let done = 0;
      let leasePaidUsd = 0;
      let leaseRepossessed = 0;
      let hangarDebitUsd = 0;
      let hangarShortfallUsd = 0;
      let creditPaid = 0;
      let creditCompounded = 0;
      let creditOverdue = 0;
      let lastTick = tick;
      let lastLots = 0;
      let lastWallet: number | undefined;
      let lastCredit: CompanyCreditSnapshot | undefined;

      if (ticks > chunkSize || ticks >= ticksPerDay) {
        setTickAdvance({
          done: 0,
          total: ticks,
          label: hoursLabel,
          startedAtMs,
        });
        setToastKind('ok');
        setToast(`Advancing ${hoursLabel}…`);
      }

      try {
        while (done < ticks) {
          const step = Math.min(chunkSize, ticks - done);
          const result = await postTick(step);
          done += step;
          lastTick = result.tick;
          lastLots = result.availableLots;
          if (typeof result.walletUsd === 'number') {
            lastWallet = result.walletUsd;
            paintWallet(result.walletUsd);
          }
          if (result.companyCredit) {
            lastCredit = result.companyCredit;
            setCompanyCredit(result.companyCredit);
          }
          setTick(result.tick);
          if (typeof result.lastBatchAtMs === 'number') {
            setLastBatchAtMs(result.lastBatchAtMs);
          }
          if (typeof result.serverNowMs === 'number') {
            const clientNow = Date.now();
            setServerOffsetMs(result.serverNowMs - clientNow);
            setDisplayNowMs(result.serverNowMs);
          }
          leasePaidUsd += result.leasePaidUsd ?? 0;
          leaseRepossessed += result.leaseRepossessed?.length ?? 0;
          hangarDebitUsd += result.hangarDebitUsd ?? 0;
          hangarShortfallUsd += result.hangarShortfallUsd ?? 0;
          creditPaid += result.creditInterestPaidUsd ?? 0;
          creditCompounded += result.creditInterestCompoundedUsd ?? 0;
          if (typeof result.creditOverdueDays === 'number') {
            creditOverdue = result.creditOverdueDays;
          }

          if (ticks > chunkSize || ticks >= ticksPerDay) {
            setTickAdvance({
              done,
              total: ticks,
              label: hoursLabel,
              startedAtMs,
            });
            setToast(
              `Advancing ${hoursLabel}… ${done}/${ticks}`,
            );
            // Let React paint progress before the next Host write.
            await new Promise<void>((resolve) => {
              window.setTimeout(resolve, 0);
            });
          }
        }
      } finally {
        setTickAdvance(null);
      }

      if (typeof lastWallet === 'number') paintWallet(lastWallet);
      if (lastCredit) setCompanyCredit(lastCredit);
      const leaseNote =
        leasePaidUsd > 0
          ? ` · lease ${formatMoney(leasePaidUsd)}`
          : leaseRepossessed > 0
            ? ` · ${leaseRepossessed} lease repossessed`
            : '';
      const hangarNote =
        hangarDebitUsd > 0 && hangarShortfallUsd > 0
          ? ` · hangar −${formatMoney(hangarDebitUsd)} (short ${formatMoney(hangarShortfallUsd)})`
          : hangarDebitUsd > 0
            ? ` · hangar −${formatMoney(hangarDebitUsd)}`
            : hangarShortfallUsd > 0
              ? ` · hangar unpaid ${formatMoney(hangarShortfallUsd)}`
              : '';
      const creditNote =
        creditCompounded > 0
          ? ` · credit interest unpaid ${formatMoney(creditCompounded)} (overdue ${creditOverdue}d)`
          : creditPaid > 0
            ? ` · credit interest −${formatMoney(creditPaid)}`
            : '';
      setToastKind(
        hangarShortfallUsd > 0 || creditCompounded > 0 ? 'warn' : 'ok',
      );
      setToast(
        `Time advanced ${hoursLabel} → ${formatClock(lastTick)} · ${lastLots} lots${leaseNote}${hangarNote}${creditNote}`,
      );
    }, { sync: 'full' });
  }

  function clearCareerSessionPaint() {
    careerReadyRef.current = false;
    setCareerReady(false);
    careerStateReadyRef.current = false;
    setCareerStateReady(false);
    bootProfileKeyRef.current = null;
    // Unknown until /api/state — default true used to flash Freights before hub picker.
    setHubSelected(false);
    // Do not commitWallet(0): careerStateReady is false so chrome shows "…" —
    // painting $0 here made +Nd / session switches look like a wipe.
    setMissions([]);
    setFleet([]);
    setLots([]);
    setPilotIcao('');
    setHomeHubIcao('');
    setPilotName('');
    // Drop callsign draft so a prior save (e.g. "Nothin") cannot stick onto a
    // newly registered account's locked hub-picker name.
    setSignupName('');
    setStaging(null);
    setActiveBushTrip(null);
    setBushWatch(null);
    setFlightDebrief(null);
    setSettleOverlaySticky(false);
    setWatch(null);
    // Drop tenant-scoped Base/FBO paint so co_b’s “second base” gate cannot
    // flash on co_a before airport/state refresh lands.
    setPlayerFbos(null);
    setAirportView(null);
    freightsBoardInitRef.current = false;
    setVaOpsPrefetchGen(0);
  }

  /**
   * Keep the profile gate up until company + tab board are warm — avoids the
   * Freights “Loading…” flash after Continue.
   */
  async function ensureCompanySessionForUi(opts?: {
    /** When true, only pick companies owned by the Bearer session (Auth). */
    authEnforced?: boolean;
  }): Promise<string> {
    let listed = await fetchCompanies();
    let companyId = getStoredCompanyId();
    const authEnforced = opts?.authEnforced ?? authRequired;

    if (authEnforced) {
      const preferred = companyIdFromUrl() || companyId;
      const owned =
        listed.companies.find((c) => c.id === preferred)?.id ??
        listed.companies[0]?.id;
      if (!owned) {
        throw new Error('No company linked to this account');
      }
      companyId = owned;
      setStoredCompanyId(companyId);
    } else {
      // Only write shared storage when this tab is not URL-pinned.
      if (!companyIdFromUrl()) {
        setStoredCompanyId(companyId);
      }
      if (
        companyId !== LOCAL_COMPANY_ID &&
        !listed.companies.some((c) => c.id === companyId)
      ) {
        await postCompany({
          id: companyId,
          displayName: companyId,
          activate: false,
        });
        listed = await fetchCompanies();
      }
    }

    try {
      const url = new URL(window.location.href);
      if (authEnforced) {
        // Auth owns the tenant via session + header — keep URLs clean.
        if (url.searchParams.has('company')) {
          url.searchParams.delete('company');
          window.history.replaceState(
            {},
            '',
            `${url.pathname}${url.search}${url.hash}`,
          );
        }
      } else if (companyId !== LOCAL_COMPANY_ID) {
        // Lab dual-tab only: pin tenant in the URL so two tabs can differ.
        url.searchParams.set('company', companyId);
        window.history.replaceState(
          {},
          '',
          `${url.pathname}${url.search}${url.hash}`,
        );
      } else if (
        url.searchParams.has('company') &&
        url.searchParams.get('company') !== LOCAL_COMPANY_ID
      ) {
        url.searchParams.delete('company');
        window.history.replaceState(
          {},
          '',
          `${url.pathname}${url.search}${url.hash}`,
        );
      }
    } catch {
      /* ignore */
    }
    await postCompanySessionOpen({ companyId });
    setCompanies(listed.companies);
    activeCompanyIdRef.current = companyId;
    setActiveCompanyId(companyId);
    setActiveCompanyIdForRequests(companyId);
    return companyId;
  }

  async function switchCompany(nextId: string): Promise<void> {
    const id = nextId.trim() || LOCAL_COMPANY_ID;
    setStoredCompanyId(id);
    try {
      const url = new URL(window.location.href);
      if (id !== LOCAL_COMPANY_ID) {
        url.searchParams.set('company', id);
      } else {
        url.searchParams.delete('company');
      }
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* ignore */
    }
    await ensureCompanySessionForUi();
    clearCareerSessionPaint();
    await refreshRef.current();
  }

  /** VA My VA: open tenant without wiping the shell chrome (wallet/fleet = home). */
  async function switchCompanyForVa(nextId: string): Promise<void> {
    const id = nextId.trim() || LOCAL_COMPANY_ID;
    if (!id || id === activeCompanyIdRef.current) return;
    // Invalidate in-flight refresh paints from the previous tenant.
    refreshGenRef.current += 1;
    const homeId = homeCompanyIdRef.current?.trim() || '';
    const switchingToHome = Boolean(homeId && id === homeId);
    // Remember home before pinning the VA so leaving My VA can restore it.
    if (!homeId && !switchingToHome) {
      const prev =
        activeCompanyIdRef.current || getStoredCompanyId();
      homeCompanyIdRef.current = prev;
      setHomeCompanyId(prev);
    }
    setStoredCompanyId(id);
    try {
      const url = new URL(window.location.href);
      if (id !== LOCAL_COMPANY_ID) {
        url.searchParams.set('company', id);
      } else {
        url.searchParams.delete('company');
      }
      window.history.replaceState(
        {},
        '',
        `${url.pathname}${url.search}${url.hash}`,
      );
    } catch {
      /* ignore */
    }
    await postCompanySessionOpen({ companyId: id });
    // Sync ref immediately — sticky wallet/fleet must not wait for React render.
    // Otherwise onWallet/refresh right after switch still see the old tenant and
    // paint VA cash onto chrome (or home cash into vaSession).
    activeCompanyIdRef.current = id;
    setActiveCompanyId(id);
    setActiveCompanyIdForRequests(id);
    if (switchingToHome) {
      // Keep vaSessionFleet / wallet — Prepare opsFleet needs VA tails while
      // chrome Hangar stays on home `fleet`. Clearing here left members with
      // only "Yours" after visiting My VA.
      return;
    }
    // Hangar/wallet for VA pin already painted from /api/va/members.
    // Do not await /api/state — withCareerRead queues behind world pulse.
  }

  async function createCompanyAndSwitch(): Promise<void> {
    const id = suggestCompanyId();
    await postCompany({
      id,
      displayName: id,
      activate: false,
    });
    setStoredCompanyId(id);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('company', id);
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* ignore */
    }
    await ensureCompanySessionForUi();
    clearCareerSessionPaint();
    await refreshRef.current();
  }

  async function warmCareerBeforeEnter(profileId: string): Promise<void> {
    setProfileGateBusyLabel('Checking sign-in…');
    const status = await fetchAuthStatus();
    setAuthRequired(status.required);
    setAuthChecked(true);
    setAuthRegisterEnabled(status.registerEnabled !== false);
    setAuthInviteRequired(status.inviteRequired === true);
    setAuthAccessKeysRequired(status.accessKeysRequired === true);
    let authEnforced = false;
    if (status.required) {
      const withToken = getAuthToken()
        ? await fetchAuthStatus().catch(() => status)
        : status;
      if (!withToken.authenticated) {
        // Stale Bearer after DB truncate / logout elsewhere — drop local token
        // so ProfileGate does not flash “Signed in / Sign out”.
        if (getAuthToken()) {
          clearAuthToken();
          setAuthSessionEpoch((n) => n + 1);
          setAuthAccountLabel('');
          setAuthAccountId(null);
        }
        setShowAuthGate(true);
        setShowProfileGate(false);
        bootProfileKeyRef.current = profileId;
        return;
      }
      authEnforced = true;
      if (withToken.account?.id?.trim()) {
        setAuthAccountId(withToken.account.id.trim());
      }
      const fromAuth =
        withToken.account?.displayName?.trim() ||
        withToken.account?.loginName?.trim() ||
        withToken.companies[0]?.displayName?.trim() ||
        '';
      if (fromAuth.length >= 2) {
        setSignupName(fromAuth);
        setAuthAccountLabel(fromAuth);
      }
      if (withToken.companies[0]) {
        const homeId = withToken.companies[0].id;
        homeCompanyIdRef.current = homeId;
        setHomeCompanyId(homeId);
        setStoredCompanyId(homeId);
        setCompanies(withToken.companies);
      }
      setShowAuthGate(false);
    } else {
      setShowAuthGate(false);
    }
    setProfileGateBusyLabel('Loading company & board…');
    await ensureCompanySessionForUi({ authEnforced });
    const scope = liveRefreshScope(tabRef.current, Boolean(airportIcao));
    await refreshRef.current({
      ...scope,
      market: true,
      missions: true,
    });
    setMarketBoardLoading(false);
    // Mark boot done before closing the gate so the enter-effect does not
    // fire a second full refresh.
    bootProfileKeyRef.current = profileId;
    setShowProfileGate(false);
  }

  async function finishAuthAndEnter(result: {
    token: string;
    account?: { id?: string; displayName?: string; loginName?: string };
    companies: Array<{ id: string; displayName: string }>;
    rememberMe?: boolean;
  }): Promise<void> {
    setError(null);
    setAuthToken(result.token, { remember: result.rememberMe === true });
    if (result.rememberMe === true && result.account?.loginName?.trim()) {
      setRememberedLoginName(result.account.loginName);
    }
    setAuthSessionEpoch((n) => n + 1);
    setAuthRequired(true);
    setAuthChecked(true);
    if (result.account?.id?.trim()) {
      setAuthAccountId(result.account.id.trim());
    }
    // Keep AuthGate up until company state is warm — otherwise Freights paints
    // with hubSelected still unknown (new accounts need Choose home hub first).
    clearCareerSessionPaint();
    const fromAuth =
      result.account?.displayName?.trim() ||
      result.account?.loginName?.trim() ||
      result.companies[0]?.displayName?.trim() ||
      '';
    if (fromAuth.length >= 2) {
      setSignupName(fromAuth);
      setAuthAccountLabel(fromAuth);
    }
    if (result.companies[0]) {
      const homeId = result.companies[0].id;
      homeCompanyIdRef.current = homeId;
      setHomeCompanyId(homeId);
      setStoredCompanyId(homeId);
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('company', homeId);
        window.history.replaceState(
          {},
          '',
          `${url.pathname}${url.search}${url.hash}`,
        );
      } catch {
        /* ignore */
      }
      activeCompanyIdRef.current = homeId;
      setActiveCompanyId(homeId);
      setActiveCompanyIdForRequests(homeId);
      setCompanies(
        result.companies.map((c) => ({
          id: c.id,
          displayName: c.displayName,
          homeHubIcao: '',
          homeCountryId: '',
          worldId: 'local',
          createdAtMs: 0,
        })),
      );
    }
    const profileId =
      activeCareerProfile?.id ?? bootProfileKeyRef.current ?? '';
    setProfileGateBusyLabel('Loading company & board…');
    try {
      await ensureCompanySessionForUi({ authEnforced: true });
      const scope = liveRefreshScope(tabRef.current, Boolean(airportIcao));
      await refreshRef.current({
        ...scope,
        market: true,
        missions: true,
      });
      setMarketBoardLoading(false);
      if (profileId) bootProfileKeyRef.current = profileId;
      setError(null);
      setShowProfileGate(false);
      setShowAuthGate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // Leave AuthGate visible with the error so Sign in is not stuck forever.
      throw err;
    }
  }

  /** Open (or re-open) a save then Auth/company warm — used by Continue and Ctrl+R resume. */
  async function enterCareerProfile(id: string): Promise<void> {
    const result = await postCareerProfileSelect(id);
    clearCareerSessionPaint();
    setCareerProfiles(result.profiles);
    setActiveCareerProfile(
      result.profile ??
        result.profiles.find((p) => p.id === result.activeId) ??
        null,
    );
    await warmCareerBeforeEnter(id);
  }
  enterCareerProfileRef.current = enterCareerProfile;

  /** Fixed world: host already opened the save — do not POST profiles/select. */
  async function attachOpenWorld(profile: CareerProfileMeta): Promise<void> {
    clearCareerSessionPaint();
    setActiveCareerProfile(profile);
    await warmCareerBeforeEnter(profile.id);
  }
  attachOpenWorldRef.current = attachOpenWorld;

  async function onSelectCareerProfile(id: string) {
    await run(async () => {
      setProfileGateBusyLabel('Opening save…');
      await enterCareerProfile(id);
    });
  }

  async function onCreateCareerProfile(name: string) {
    await run(async () => {
      setProfileGateBusyLabel('Creating save…');
      const created = await postCareerProfileCreate(name);
      setProfileGateBusyLabel('Opening save…');
      await enterCareerProfile(created.profile.id);
    });
  }

  async function onDeleteCareerProfile(id: string) {
    const profile = careerProfiles.find((p) => p.id === id);
    const ok = await confirm({
      title: 'Delete profile?',
      body: `Permanently delete “${profile?.name ?? id}” and its career save (wallet, fleet, missions).`,
      confirmLabel: 'Delete profile',
      cancelLabel: 'Keep',
      tone: 'danger',
    });
    if (!ok) return;
    await run(
      async () => {
        const result = await deleteCareerProfile(id);
        setCareerProfiles(result.profiles);
        if (activeCareerProfile?.id === id) {
          if (watch?.running) {
            try {
              await postWatchStop({ reset: true });
            } catch {
              /* ignore */
            }
          }
          if (bushWatch?.running) {
            try {
              await postBushWatchStop();
            } catch {
              /* ignore */
            }
          }
          setActiveCareerProfile(null);
          setShowProfileGate(true);
          setStaging(null);
          setActiveBushTrip(null);
          setBushWatch(null);
          setWatch(null);
        }
        setToastKind('ok');
        setToast('Profile deleted');
      },
    );
  }

  async function onRenameCareerProfile(id: string, name: string) {
    await run(async () => {
      const result = await postCareerProfileRename(id, name);
      setCareerProfiles((prev) =>
        prev.map((p) => (p.id === id ? result.profile : p)),
      );
      if (activeCareerProfile?.id === id) {
        setActiveCareerProfile(result.profile);
      }
    });
  }

  async function onSwitchCareerProfile() {
    if (worldFixed) {
      setError(
        'This client is attached to the host world. Switch or create saves on the host only.',
      );
      return;
    }
    await run(async () => {
      if (watch?.running) {
        try {
          await postWatchStop({ reset: true });
        } catch {
          /* ignore */
        }
      }
      if (bushWatch?.running) {
        try {
          await postBushWatchStop();
        } catch {
          /* ignore */
        }
      }
      await postCareerProfileClear();
      setActiveCareerProfile(null);
      setShowProfileGate(true);
      setShowAuthGate(false);
      setStaging(null);
      setActiveBushTrip(null);
      setBushWatch(null);
      setWatch(null);
    });
  }

  async function onSignOutAccount() {
    await run(async () => {
      setError(null);
      try {
        await postAuthLogout();
      } catch {
        /* ignore — clear local anyway */
      }
      clearAuthToken();
      setAuthSessionEpoch((n) => n + 1);
      setAuthAccountLabel('');
      setShowAuthGate(false);
      setCompanies([]);
      // Next Continue on a save will show AuthGate again when CAREER_AUTH=1.
    });
  }

  async function onSignOutAndSwitchProfile() {
    await run(async () => {
      setError(null);
      try {
        await postAuthLogout();
      } catch {
        /* ignore */
      }
      clearAuthToken();
      setAuthSessionEpoch((n) => n + 1);
      setAuthAccountLabel('');
      setCompanies([]);
      if (watch?.running) {
        try {
          await postWatchStop({ reset: true });
        } catch {
          /* ignore */
        }
      }
      if (bushWatch?.running) {
        try {
          await postBushWatchStop();
        } catch {
          /* ignore */
        }
      }
      if (worldFixed) {
        // Stay on the host world — only re-prompt Auth.
        setError(null);
        setShowAuthGate(true);
        setShowProfileGate(false);
        setStaging(null);
        setActiveBushTrip(null);
        setBushWatch(null);
        setWatch(null);
        return;
      }
      await postCareerProfileClear();
      setActiveCareerProfile(null);
      setShowProfileGate(true);
      setShowAuthGate(false);
      setStaging(null);
      setActiveBushTrip(null);
      setBushWatch(null);
      setWatch(null);
    });
  }

  function resolvedSignupPilotName(): string {
    // Auth locks the callsign to the account/company identity — never prefer a
    // stale React draft left over from another save/session.
    if (authRequired) {
      const fromCompany =
        companies.find((c) => c.id === activeCompanyId)?.displayName?.trim() ||
        companies[0]?.displayName?.trim() ||
        '';
      if (fromCompany.length >= 2) return fromCompany;
    }
    const fromField = signupName.trim();
    if (fromField.length >= 2) return fromField;
    const company =
      companies.find((c) => c.id === activeCompanyId)?.displayName?.trim() ||
      companies[0]?.displayName?.trim() ||
      '';
    return company.length >= 2 ? company : '';
  }

  async function onSelectHub() {
    const name = resolvedSignupPilotName();
    const icao = signupHub.trim().toUpperCase();
    if (name.length < 2) {
      setError('Enter a pilot name (at least 2 characters)');
      return;
    }
    if (!icao) {
      setError('Select a home hub ICAO');
      return;
    }
    await run(async () => {
      const result = await postSelectHub({
        icao,
        pilotName: name,
      });
      setHubSelected(result.hubSelected);
      setFleet(result.fleet);
      setHubOptions(normalizeStarterHubs(result.hubs));
      setPilotName(result.pilotName);
      setHomeHubIcao(result.homeHubIcao);
      setPilotIcao(result.pilotIcao ?? result.homeHubIcao);
      commitWallet(result.walletUsd);
      setToastKind('ok');
      setToast(
        `${result.pilotName} registered at ${result.homeHubIcao} · fly Operator aircraft offers until you buy your first aircraft`,
      );
      goToTab('pilot');
    }, { sync: 'full' });
  }

  async function refreshAircraftMarket() {
    setAircraftMarketLoading(true);
    try {
      const acMarket = await fetchAircraftMarket(
        aircraftMarketFetchOpts(aircraftBrowseCountryRef.current),
      );
      setAircraftListings(acMarket.listings);
      setAircraftDeliveryQuotes(acMarket.deliveryQuotes ?? {});
      setAircraftCatalog(acMarket.catalog);
      setAirframePerf((prev) => ({
        ...prev,
        ...(acMarket.airframePerf ?? {}),
      }));
      paintWallet(acMarket.walletUsd);
      if (acMarket.homeCountryId) setAircraftHomeCountryId(acMarket.homeCountryId);
      if (acMarket.browseCountryId) {
        aircraftBrowseCountryRef.current = syncAircraftBrowseFromApi(
          acMarket.browseCountryId,
          acMarket.homeCountryId,
        );
        setAircraftBrowseCountry(aircraftBrowseCountryRef.current);
      }
      if (acMarket.poolCountries) setAircraftPoolCountries(acMarket.poolCountries);
      if (acMarket.fleet) setFleet(acMarket.fleet);
      if (acMarket.leaseUnlock) setLeaseUnlock(acMarket.leaseUnlock);
      return acMarket;
    } finally {
      setAircraftMarketLoading(false);
    }
  }

  async function refreshNetworkHubs() {
    setNetworkHubsLoading(true);
    try {
      const payload = await fetchNetworkHubs();
      setNetworkHubs(payload.hubs);
      if (payload.homeHubIcao) setHomeHubIcao(payload.homeHubIcao);
      return payload;
    } finally {
      setNetworkHubsLoading(false);
    }
  }

  async function onBuyAircraft(
    listingId: string,
    opts?: { deliver?: boolean },
  ) {
    await run(async () => {
      const result = await postAircraftBuy({
        listingId,
        deliver: opts?.deliver === true,
      });
      setFleet(result.fleet);
      commitWallet(result.walletUsd);
      setAircraftListings(result.listings);
      setAircraftDeliveryQuotes({});
      setToastKind('ok');
      const deliveryNote =
        (result.deliveryFeeUsd ?? 0) > 0
          ? ` (+${formatMoney(result.deliveryFeeUsd!)} delivery)`
          : '';
      setToast(
        `Purchased ${result.aircraft.label} for ${formatMoney(result.debitUsd)}${deliveryNote} · parked at ${result.aircraft.locationIcao}`,
      );
      goToTab('hangar');
    });
  }

  async function onLeaseAircraft(
    listingId: string,
    opts?: { deliver?: boolean },
  ) {
    await run(async () => {
      const result = await postAircraftLease({
        listingId,
        deliver: opts?.deliver === true,
      });
      setFleet(result.fleet);
      commitWallet(result.walletUsd);
      setAircraftListings(result.listings);
      setAircraftDeliveryQuotes({});
      if (result.leaseUnlock) setLeaseUnlock(result.leaseUnlock);
      setToastKind('ok');
      const quote = aircraftDeliveryQuotes[listingId];
      const deliveryNote =
        (result.deliveryFeeUsd ?? 0) > 0
          ? ` (+${formatMoney(result.deliveryFeeUsd!)} ${
              quote?.crossBorder ? 'import' : 'delivery'
            })`
          : '';
      setToast(
        `Lease signed · ${result.aircraft.label} · due ${formatMoney(result.debitUsd)}${deliveryNote} · parked at ${result.aircraft.locationIcao}`,
      );
      goToTab('hangar');
    });
  }

  async function onSellAircraft(aircraftId: string) {
    const acf = fleet.find((a) => a.id === aircraftId);
    if (!acf) return;
    const ownedCount = fleet.filter(
      (a) => (a.ownership ?? 'owned') === 'owned',
    ).length;
    if (ownedCount < 2) {
      setError(
        'Keep at least one owned aircraft — buy another before selling this one',
      );
      return;
    }
    const catalog = hangarCatalogEntry(acf);
    const fairUsd = estimateFairUsd(acf, { maxCargoKg: catalog?.maxCargoKg });
    const creditUsd = estimateSellBackUsd(acf, { maxCargoKg: catalog?.maxCargoKg });
    const ok = await confirm({
      title: `Sell ${acf.label} to dealer?`,
      body: `Instant cash ${formatMoney(creditUsd)} (50% of fair ${formatMoney(fairUsd)}). This tail is gone; another ${acf.label} restocks in this country within 0–2 days.`,
      confirmLabel: 'Sell to dealer',
    });
    if (!ok) return;
    await run(async () => {
      const result = await postAircraftSell({ aircraftId });
      setFleet(result.fleet);
      commitWallet(result.walletUsd);
      if (result.listings) setAircraftListings(result.listings);
      setToastKind('ok');
      setToast(`Dealer paid ${formatMoney(result.creditUsd)}`);
    }, { sync: { aircraftMarket: true } });
  }

  async function onListForSale(aircraftId: string) {
    const acf = fleet.find((a) => a.id === aircraftId);
    if (!acf) return;
    const ownedCount = fleet.filter(
      (a) => (a.ownership ?? 'owned') === 'owned',
    ).length;
    if (ownedCount < 2) {
      setError(
        'Keep at least one owned aircraft — buy another before listing this one',
      );
      return;
    }
    const catalog = hangarCatalogEntry(acf);
    const fairUsd = estimateFairUsd(acf, { maxCargoKg: catalog?.maxCargoKg });
    const dealerUsd = estimateSellBackUsd(acf, {
      maxCargoKg: catalog?.maxCargoKg,
    });
    const minAsk = Math.max(500, Math.round(fairUsd * 0.5));
    const maxAsk = Math.max(minAsk, Math.round(fairUsd * 2));
    const askRef = { current: fairUsd };
    const ok = await confirm({
      title: `List ${acf.label} on Market?`,
      body: (
        <ListSaleAskBody
          fairUsd={fairUsd}
          dealerUsd={dealerUsd}
          minAsk={minAsk}
          maxAsk={maxAsk}
          formatMoney={formatMoney}
          onChange={(n) => {
            askRef.current = n;
          }}
        />
      ),
      confirmLabel: 'List on Market',
    });
    if (!ok) return;
    await run(async () => {
      const result = await postAircraftListSale({
        aircraftId,
        askingUsd: askRef.current,
      });
      setFleet(result.fleet);
      commitWallet(result.walletUsd);
      setAircraftListings(result.listings);
      setToastKind('ok');
      setToast(
        `Listed at ${formatMoney(result.listing.askingUsd)} · no cash until sold`,
      );
    });
  }

  async function onListForLease(aircraftId: string) {
    const acf = fleet.find((a) => a.id === aircraftId);
    if (!acf) return;
    const catalog = hangarCatalogEntry(acf);
    const catalogMonthly = estimateLeaseMonthlyUsd(acf, {
      maxCargoKg: catalog?.maxCargoKg,
    });
    const minMonthly = Math.max(1, Math.round(catalogMonthly * 0.6));
    const maxMonthly = Math.max(minMonthly, Math.round(catalogMonthly * 1.8));
    const leaseRef = { monthlyUsd: catalogMonthly, termMonths: 3 };
    const ok = await confirm({
      title: `List ${acf.label} for lease?`,
      body: (
        <ListLeaseAskBody
          catalogMonthlyUsd={catalogMonthly}
          minMonthly={minMonthly}
          maxMonthly={maxMonthly}
          minTerm={1}
          maxTerm={3}
          formatMoney={formatMoney}
          onChange={(next) => {
            leaseRef.monthlyUsd = next.monthlyUsd;
            leaseRef.termMonths = next.termMonths;
          }}
        />
      ),
      confirmLabel: 'List for lease',
    });
    if (!ok) return;
    await run(async () => {
      const result = await postAircraftListLease({
        aircraftId,
        termMonths: leaseRef.termMonths,
        monthlyUsd: leaseRef.monthlyUsd,
      });
      setFleet(result.fleet);
      commitWallet(result.walletUsd);
      setAircraftListings(result.listings);
      setToastKind('ok');
      setToast(
        `Listed ${formatMoney(result.listing.leaseMonthlyUsd ?? 0)}/wk · ${result.listing.leaseTermMonths} mo · deposit ${formatMoney(result.listing.askingUsd)}`,
      );
    });
  }

  async function onUnlistAircraft(aircraftId: string) {
    await run(async () => {
      const result = await postAircraftUnlist({ aircraftId });
      setFleet(result.fleet);
      commitWallet(result.walletUsd);
      setAircraftListings(result.listings);
      setToastKind('ok');
      setToast('Listing removed');
    });
  }

  async function onClearMaintenance(aircraftId: string) {
    const acf =
      fleet.find((a) => a.id === aircraftId) ??
      vaSessionFleet.find((a) => a.id === aircraftId);
    if (!acf) return;
    const ok = await confirm({
      title: `Workshop inspection on ${acf.label}?`,
      body: `Pays the scheduled inspection at ${acf.locationIcao} using local aircraft parts + shop labor. Does not restore condition % — use Repair for that. Thin/dry parts raise the labor bill.`,
      confirmLabel: 'Pay inspection',
    });
    if (!ok) return;
    const opsCompanyId = resolveOpsCompanyId(aircraftId);
    await run(async () => {
      const result = await postAircraftMaintenance({
        aircraftId,
        companyId: opsCompanyId || undefined,
      });
      paintOpsMutationFleet(result.fleet, opsCompanyId);
      paintOpsMutationWallet(opsCompanyId, result.walletUsd);
      setToastKind(result.needsRepair ? 'warn' : 'ok');
      const mroNote =
        result.mro?.scarcity === 'dry'
          ? ' · dry parts (labor premium)'
          : result.mro?.scarcity === 'partial'
            ? ' · partial parts'
            : result.mro
              ? ` · ${Math.round(result.mro.fromTerminalKg)} kg parts`
              : '';
      setToast(
        result.needsRepair
          ? `Inspection paid · ${formatMoney(result.debitUsd)}${mroNote} — repair condition before dispatch`
          : `Inspection cleared · ${formatMoney(result.debitUsd)}${mroNote}`,
      );
    }, { sync: { airport: true } });
  }

  async function onRepairAircraft(aircraftId: string) {
    const acf =
      fleet.find((a) => a.id === aircraftId) ??
      vaSessionFleet.find((a) => a.id === aircraftId);
    if (!acf) return;
    const afNeed = Math.max(0, Math.ceil(100 - (acf.airframeConditionPct ?? 100)));
    const engNeed = Math.max(0, Math.ceil(100 - (acf.engineConditionPct ?? 100)));
    const afPts = Math.min(10, afNeed);
    const engPts = Math.min(10, engNeed);
    if (afPts === 0 && engPts === 0) {
      setToastKind('ok');
      setToast('Condition already at 100%');
      return;
    }
    const ok = await confirm({
      title: `Repair ${acf.label}?`,
      body: `Restores up to ${afPts} airframe pts and ${engPts} engine pts at ${acf.locationIcao} (capped at 10 per click). Draws terminal aircraft parts; dry stock still works at a labor premium.`,
      confirmLabel: 'Repair',
    });
    if (!ok) return;
    const opsCompanyId = resolveOpsCompanyId(aircraftId);
    await run(async () => {
      const result = await postAircraftRepair({
        aircraftId,
        airframePts: afPts || undefined,
        enginePts: engPts || undefined,
        companyId: opsCompanyId || undefined,
      });
      paintOpsMutationFleet(result.fleet, opsCompanyId);
      paintOpsMutationWallet(opsCompanyId, result.walletUsd);
      setToastKind(result.mro?.scarcity === 'ok' ? 'ok' : 'warn');
      const mroNote =
        result.mro?.scarcity === 'dry'
          ? ' · dry parts (labor premium)'
          : result.mro?.scarcity === 'partial'
            ? ' · partial parts'
            : result.mro
              ? ` · ${Math.round(result.mro.fromTerminalKg)} kg parts`
              : '';
      setToast(`Repaired · ${formatMoney(result.debitUsd)}${mroNote}`);
    }, { sync: { airport: true } });
  }

  async function onOverhaulAircraft(
    aircraftId: string,
    which: 'engine' | 'airframe',
  ) {
    const acf =
      fleet.find((a) => a.id === aircraftId) ??
      vaSessionFleet.find((a) => a.id === aircraftId);
    if (!acf) return;
    const quote = estimateOverhaulQuote(acf, which, {
      maxCargoKg: hangarCatalogEntry(acf)?.maxCargoKg,
    });
    if (!quote.eligible) {
      setToastKind('warn');
      setToast(quote.reason ?? 'Overhaul not available');
      return;
    }
    const kindLabel = which === 'engine' ? 'Engine' : 'Airframe';
    const hoursLabel = which === 'engine' ? 'engine' : 'airframe';
    const ok = await confirm({
      title: `${kindLabel} overhaul on ${acf.label}?`,
      body: `Pay ${formatMoney(quote.debitUsd)} and ground the airframe for ${quote.downtimeDays} economy day${quote.downtimeDays === 1 ? '' : 's'}. Resets ${hoursLabel} hours (${Math.round(quote.hoursBefore).toLocaleString()} → 0). MX age mult ≈ ×${quote.mxMultBefore.toFixed(2)} → ×${quote.mxMultAfter.toFixed(2)}. Does not restore condition % — use Repair for that.`,
      confirmLabel: `Start ${kindLabel.toLowerCase()} overhaul`,
    });
    if (!ok) return;
    const opsCompanyId = resolveOpsCompanyId(aircraftId);
    await run(async () => {
      const result = await postAircraftOverhaul({
        aircraftId,
        which,
        companyId: opsCompanyId || undefined,
      });
      paintOpsMutationFleet(result.fleet, opsCompanyId);
      paintOpsMutationWallet(opsCompanyId, result.walletUsd);
      setToastKind('ok');
      setToast(
        `${kindLabel} overhaul started · ${formatMoney(result.debitUsd)} · ready after ${result.quote.downtimeDays}d`,
      );
    });
  }

  async function onBuyoutLease(aircraftId: string) {
    const acf = fleet.find((a) => a.id === aircraftId);
    if (!acf?.lease) return;
    const buyout = acf.lease.buyoutUsd ?? 0;
    const ok = await confirm({
      title: `Buy out lease on ${acf.label}?`,
      body: `Pays ${formatMoney(buyout)} and converts the airframe to owned.`,
      confirmLabel: 'Buy out',
    });
    if (!ok) return;
    await run(async () => {
      const result = await postAircraftBuyout({ aircraftId });
      setFleet(result.fleet);
      commitWallet(result.walletUsd);
      setToastKind('ok');
      setToast(`Lease bought out · ${formatMoney(result.debitUsd)}`);
    });
  }

  async function onPayLeaseOverdue(aircraftId: string) {
    const acf = fleet.find((a) => a.id === aircraftId);
    if (!acf?.lease || !acf.leaseOverdue) return;
    const weeks = estimateLeaseOverdueWeeks(acf, tick);
    const due = estimateLeaseOverdueAmountUsd(acf, tick);
    const ok = await confirm({
      title: `Pay overdue lease on ${acf.label}?`,
      body: `Clears ${weeks} week${weeks === 1 ? '' : 's'} now for ${formatMoney(due)}. You can dispatch as soon as it posts.`,
      confirmLabel: 'Pay lease',
    });
    if (!ok) return;
    await run(async () => {
      const result = await postAircraftPayLease({ aircraftId });
      setFleet(result.fleet);
      commitWallet(result.walletUsd);
      setToastKind('ok');
      setToast(
        `Lease catch-up · ${result.weeksPaid} wk · ${formatMoney(result.paidUsd)}`,
      );
    });
  }

  async function onReturnLease(aircraftId: string) {
    const acf = fleet.find((a) => a.id === aircraftId);
    if (!acf?.lease) return;
    const softEnded = acf.lease.termEndedSoft === true;
    if (acf.leaseOverdue && !softEnded) {
      setToastKind('fail');
      setToast('Clear the overdue lease payment before returning early');
      return;
    }
    const { penaltyUsd, remainingMonths } = estimateLeaseEarlyReturnUsd(
      acf.lease,
      tick,
    );
    if (softEnded || remainingMonths <= 0) {
      const ok = await confirm({
        title: `Return ${acf.label}?`,
        body: 'Lease term ended while you were away — return the airframe to the lessor at no penalty (or buy out to keep it).',
        confirmLabel: 'Return airframe',
        tone: 'warn',
      });
      if (!ok) return;
      await run(async () => {
        const result = await postAircraftReturnLease({ aircraftId });
        setFleet(result.fleet);
        commitWallet(result.walletUsd);
        setToastKind('ok');
        setToast('Lease returned · term ended');
      }, { sync: { aircraftMarket: true } });
      return;
    }
    const ok = await confirm({
      title: `Return lease on ${acf.label}?`,
      body: `Pays an early-return penalty of ${formatMoney(penaltyUsd)} (${remainingMonths} mo left · deposit not refunded) and removes the airframe from your fleet.`,
      confirmLabel: 'Return lease',
      tone: 'warn',
    });
    if (!ok) return;
    await run(async () => {
      const result = await postAircraftReturnLease({ aircraftId });
      setFleet(result.fleet);
      commitWallet(result.walletUsd);
      setToastKind('ok');
      setToast(
        `Lease returned · ${formatMoney(result.debitUsd)} penalty · ${result.remainingMonths} mo left`,
      );
    }, { sync: { aircraftMarket: true } });
  }

  async function onBuyFbo(icao?: string) {
    const target = (icao ?? homeHubIcao).trim().toUpperCase();
    const price =
      target === homeHubIcao.toUpperCase()
        ? playerFbos?.homeBuyUsd
        : playerFbos?.buyAtIcaoUsd ?? playerFbos?.homeBuyUsd;
    const ownedCount = playerFbos?.fbos.length ?? 0;
    const isSecond = ownedCount === 1;
    const isThird = ownedCount === 2;
    const freeFirst = ownedCount === 0 && (price === 0 || price == null);
    const ok = await confirm({
      title: `Buy Base at ${target}?`,
      body: isThird
        ? `Third base · Tier-1 (${formatTonnes(3000)}). Late-game CAPEX ${price != null ? formatMoney(price) : ''} — needs T2 + 3 owned aircraft + Cargo Ops Time.`
        : isSecond
          ? `Second base · Tier-1 (${formatTonnes(3000)}). Premium CAPEX ${price != null ? formatMoney(price) : ''}. Same parking/Jet-A/MRO perks + Dispatcher desk at this hub.`
          : freeFirst
            ? `First company Base is free — parking/Jet-A/MRO perks and Dispatcher contract scout at ${target}.`
            : `Tier-1 Base (${formatTonnes(3000)} capacity). Pays ${price != null ? formatMoney(price) : 'the listed CAPEX'} — parking and Jet-A/MRO discounts at this hub.`,
      confirmLabel: freeFirst ? 'Claim Base' : 'Buy Base',
    });
    if (!ok) return;
    await run(async () => {
      const result = await postFboBuy({ icao: target });
      commitWallet(result.walletUsd);
      setPlayerFbos(result.playerFbos);
      if (result.companyCrew) setCompanyCrew(result.companyCrew);
      if (result.dispatcher) setBaseDispatcher(result.dispatcher);
      if (result.policy) setDispatchScoutPolicy(result.policy);
      setDispatchTours([]);
      setSelectedDispatchTourId(null);
      setToastKind('ok');
      setToast(
        result.debitUsd > 0
          ? `Base T1 at ${result.fbo.icao} · ${formatMoney(result.debitUsd)}`
          : `Base T1 at ${result.fbo.icao} · free`,
      );
      if (airportIcao) {
        const view = await fetchAirportView(airportIcao);
        setAirportView(view);
        if (view.playerFbos) setPlayerFbos(view.playerFbos);
      }
    });
  }

  async function onGenerateDispatchTours() {
    if (busy || dispatchTourBusy) return;
    const hub = (airportIcao ?? '').trim().toUpperCase();
    if (!hub) return;
    setDispatchTourLoading(true);
    try {
      const minNmRaw = dispatchTourMinNm.trim();
      const maxNmRaw = dispatchTourMaxNm.trim();
      const minNm =
        minNmRaw && Number.isFinite(Number(minNmRaw))
          ? Number(minNmRaw)
          : undefined;
      const maxNm =
        maxNmRaw && Number.isFinite(Number(maxNmRaw)) && Number(maxNmRaw) > 0
          ? Number(maxNmRaw)
          : null;
      const maxFerryRaw = dispatchTourMaxFerryNm.trim();
      const maxFerryNm =
        maxFerryRaw &&
        Number.isFinite(Number(maxFerryRaw)) &&
        Number(maxFerryRaw) > 0
          ? Number(maxFerryRaw)
          : 200;
      const result = await postBaseDispatchTours({
        action: 'list',
        hubIcao: hub,
        aircraftId: dispatchTourAircraftId.trim() || undefined,
        // Empty Origin means this Base (the placeholder already shows it).
        // The server otherwise falls back to aircraft location, which made an
        // empty SBKP field silently search from an aircraft parked at SBCT.
        originIcao: dispatchTourOrigin.trim() || hub,
        legs: dispatchTourLegs,
        minNm,
        maxNm,
        maxFerryNm,
        returnMode: dispatchTourReturnMode,
        preferLeaveBase: dispatchTourPreferLeaveBase,
      });
      setDispatchTours(result.tours ?? []);
      if (result.activeTour !== undefined) {
        setActiveTour(result.activeTour ?? null);
      }
      if (result.policy) setDispatchScoutPolicy(result.policy);
      if (result.dispatcher) setBaseDispatcher(result.dispatcher);
      setSelectedDispatchTourId(null);
      if ((result.tours ?? []).length === 0) {
        setToastKind('fail');
        const base = hub;
        if (dispatchTourLegs > 1 && dispatchTourReturnMode === 'base') {
          setToast(
            `No tours ending at Base ${base} — need a last cargo leg into ${base} (not a ferry home). Try Any end, more Legs, or Max ferry.`,
          );
        } else if (
          dispatchTourLegs > 1 &&
          dispatchTourReturnMode === 'origin'
        ) {
          const origin =
            dispatchTourOrigin.trim().toUpperCase() || 'origin';
          setToast(
            `No tours ending at ${origin} — need a last cargo leg home. Try Any end or raise Max ferry.`,
          );
        } else {
          setToast(
            dispatchTourLegs === 1
              ? 'No executable freight found — Search allows partial loads, then checks parked-aircraft range, fuel, Cargo Ops, positive net, and ferry limits.'
              : 'No executable 2–4 leg chain — Search allows partial loads, then checks parked-aircraft range, fuel, Cargo Ops, positive net, and ferry limits.',
          );
        }
      }
    } catch (err) {
      setToastKind('fail');
      setToast(err instanceof Error ? err.message : String(err));
    } finally {
      setDispatchTourLoading(false);
    }
  }

  async function onConfirmDispatchTour(tour: BaseDispatchTour) {
    if (busy || dispatchTourBusy) return;
    if (clientUpdateBlock) {
      setToastKind('fail');
      setToast(
        formatClientUpdateRequiredLabel(clientUpdateBlock.minClientVersion),
      );
      return;
    }
    if (charterActiveTour?.status === 'active') {
      setToastKind('fail');
      setToast('Drop the Charter tour before starting a Freight tour');
      return;
    }
    const first = tour.legs[0];
    if (!first) return;
    const hub =
      (airportIcao ?? '').trim().toUpperCase() ||
      homeHubIcao.trim().toUpperCase() ||
      first.originIcao;
    const lot = marketLotFromTourLeg(first);
    if (isCargoOpsCommodityLocked(lot.commodityId)) {
      setToastKind('fail');
      setToast(
        `Cargo Ops: ${lot.commodityName} is locked — unlock it in Hangar → Cargo Ops`,
      );
      return;
    }
    setDispatchTourLoading(true);
    try {
      if (tour.legCount === 1) {
        setSelectedDispatchTourId(null);
        enterStagingForTourLeg(lot, tour.aircraftId);
        return;
      }
      // Persist itinerary only — Manifest opens from Active Tour L1 Continue.
      const prepared = await postBaseDispatchTours({
        action: 'prepare',
        aircraftId: tour.aircraftId,
        hubIcao: hub,
        tourId: tour.id,
        routeLabel: tour.routeLabel,
        tourLegs: tour.legs,
      });
      setActiveTour(prepared.activeTour ?? null);
      if (prepared.playerFbos) setPlayerFbos(prepared.playerFbos);
      setPendingActiveTour(null);
      setSelectedDispatchTourId(null);
      setDispatchTours([]);
      setBaseDispatchProduct('freight');
      setToastKind('ok');
      setToast('Freight tour ready — Continue L1 when you are set');
    } catch (err) {
      setToastKind('fail');
      setToast(err instanceof Error ? err.message : String(err));
    } finally {
      setDispatchTourLoading(false);
    }
  }

  async function onGenerateCharterTours() {
    if (busy || dispatchTourBusy) return;
    const hub = (airportIcao ?? '').trim().toUpperCase();
    if (!hub) return;
    setDispatchTourLoading(true);
    try {
      const minNmRaw = dispatchTourMinNm.trim();
      const maxNmRaw = dispatchTourMaxNm.trim();
      const minNm =
        minNmRaw && Number.isFinite(Number(minNmRaw))
          ? Number(minNmRaw)
          : undefined;
      const maxNm =
        maxNmRaw && Number.isFinite(Number(maxNmRaw)) && Number(maxNmRaw) > 0
          ? Number(maxNmRaw)
          : null;
      const maxFerryRaw = dispatchTourMaxFerryNm.trim();
      const maxFerryNm =
        maxFerryRaw &&
        Number.isFinite(Number(maxFerryRaw)) &&
        Number(maxFerryRaw) > 0
          ? Number(maxFerryRaw)
          : 200;
      const result = await postBaseDispatchCharters({
        action: 'list',
        hubIcao: hub,
        aircraftId: dispatchTourAircraftId.trim() || undefined,
        originIcao: resolveBaseCharterOrigin(baseCharterOrigin, hub),
        legs: charterTourLegs,
        minNm,
        maxNm,
        maxFerryNm,
        returnMode: charterTourReturnMode,
        preferLeaveBase: dispatchTourPreferLeaveBase,
      });
      setCharterTours(result.tours ?? []);
      if (result.charterActiveTour !== undefined) {
        setCharterActiveTour(result.charterActiveTour ?? null);
      }
      if (result.policy) setDispatchScoutPolicy(result.policy);
      if (result.dispatcher) setBaseDispatcher(result.dispatcher);
      setSelectedCharterTourId(null);
      if ((result.tours ?? []).length === 0) {
        setToastKind('fail');
        setToast(
          charterTourLegs === 1
            ? 'No executable charter found — check parked passenger aircraft, seats/baggage, range, and ferry.'
            : 'No executable 2-leg charter chain — try Any end, raise Max ferry, or clear Origin.',
        );
      }
    } catch (err) {
      setToastKind('fail');
      setToast(err instanceof Error ? err.message : String(err));
    } finally {
      setDispatchTourLoading(false);
    }
  }

  function charterOfferFromTourLeg(
    leg: BaseCharterTour['legs'][number],
  ): CharterOfferView {
    return {
      id: leg.offerId,
      originIcao: leg.originIcao,
      destIcao: leg.destIcao,
      originName: leg.originIcao,
      destName: leg.destIcao,
      paxCount: leg.groupSize,
      baggageKg: leg.baggageKg,
      payUsd: leg.payUsd,
      basePayUsd: leg.payUsd,
      urgency: 'normal',
      reason: 'Base charter tour',
      createdAtTick: 0,
      expiresAtTick: leg.expiresAtTick,
      ticksRemaining: Math.max(0, leg.expiresAtTick),
      distanceNm: leg.distanceNm,
      international: false,
      status: 'available',
    };
  }

  async function onConfirmCharterTour(tour: BaseCharterTour) {
    if (busy || dispatchTourBusy) return;
    if (clientUpdateBlock) {
      setToastKind('fail');
      setToast(
        formatClientUpdateRequiredLabel(clientUpdateBlock.minClientVersion),
      );
      return;
    }
    if (activeTour?.status === 'active') {
      setToastKind('fail');
      setToast('Drop the Freight tour before starting a Charter tour');
      return;
    }
    const first = tour.legs[0];
    if (!first) return;
    const hub =
      (airportIcao ?? '').trim().toUpperCase() ||
      homeHubIcao.trim().toUpperCase() ||
      first.originIcao;
    setDispatchTourLoading(true);
    try {
      if (tour.legCount === 1) {
        setSelectedCharterTourId(null);
        enterCharterManifest(
          charterOfferFromTourLeg(first),
          tour.aircraftId,
        );
        return;
      }
      const prepared = await postBaseDispatchCharters({
        action: 'prepare',
        aircraftId: tour.aircraftId,
        hubIcao: hub,
        tourId: tour.id,
        routeLabel: tour.routeLabel,
        tourLegs: tour.legs,
      });
      setCharterActiveTour(prepared.charterActiveTour ?? null);
      if (prepared.playerFbos) setPlayerFbos(prepared.playerFbos);
      setSelectedCharterTourId(null);
      setCharterTours([]);
      setBaseDispatchProduct('charter');
      setToastKind('ok');
      setToast('Charter tour ready — Continue L1 when you are set');
    } catch (err) {
      setToastKind('fail');
      setToast(err instanceof Error ? err.message : String(err));
    } finally {
      setDispatchTourLoading(false);
    }
  }

  async function onAcceptCharterTourLeg(legIndex: number) {
    if (busy || dispatchTourBusy || !charterActiveTour) return;
    const leg = charterActiveTour.legs.find((l) => l.index === legIndex);
    if (!leg) return;
    setDispatchTourLoading(true);
    try {
      const status = await postBaseDispatchCharters({ action: 'status' });
      setCharterActiveTour(status.charterActiveTour ?? null);
      const view = status.charterActiveTour;
      if (!view || view.nextLegIndex !== legIndex) {
        setToastKind('fail');
        setToast(view?.resumeHint ?? 'Cannot continue this charter leg');
        return;
      }
      const next = view.legs.find((l) => l.index === legIndex);
      if (!next || next.status !== 'planned' || next.missionId) {
        setToastKind('fail');
        setToast(view.resumeHint ?? 'Cannot continue this charter leg');
        return;
      }
      if (next.offerExpired) {
        setToastKind('fail');
        setToast(view.resumeHint ?? 'Offer expired — Drop tour');
        return;
      }
      // Mirror Freight: allow Manifest while off-origin (Ferry lives there).
      const ferryContinue = Boolean(
        view.resumeHint?.match(/^Ferry to [A-Z0-9]{3,4}/i),
      );
      if (!view.canAcceptNextLeg && !ferryContinue) {
        setToastKind('fail');
        setToast(view.resumeHint ?? 'Cannot accept this charter leg yet');
        return;
      }
      enterCharterManifest(
        {
          id: next.offerId,
          originIcao: next.originIcao,
          destIcao: next.destIcao,
          originName: next.originIcao,
          destName: next.destIcao,
          paxCount: next.groupSize,
          baggageKg: next.baggageKg,
          payUsd: next.payUsd,
          basePayUsd: next.payUsd,
          urgency: 'normal',
          reason: 'Base charter tour',
          createdAtTick: 0,
          expiresAtTick: next.expiresAtTick ?? 0,
          ticksRemaining: next.ticksRemaining ?? 0,
          distanceNm: next.distanceNm,
          international: false,
          status: 'available',
        },
        view.aircraftId,
      );
    } catch (err) {
      setToastKind('fail');
      setToast(err instanceof Error ? err.message : String(err));
    } finally {
      setDispatchTourLoading(false);
    }
  }

  async function onDropCharterActiveTour() {
    if (busy || dispatchTourBusy) return;
    setDispatchTourLoading(true);
    try {
      const result = await postBaseDispatchCharters({ action: 'drop' });
      setCharterActiveTour(null);
      if (result.playerFbos) setPlayerFbos(result.playerFbos);
    } catch (err) {
      setToastKind('fail');
      setToast(err instanceof Error ? err.message : String(err));
    } finally {
      setDispatchTourLoading(false);
    }
  }

  async function onRefreshCharterActiveTour() {
    if (busy || dispatchTourBusy) return;
    setDispatchTourLoading(true);
    try {
      const result = await postBaseDispatchCharters({ action: 'status' });
      setCharterActiveTour(result.charterActiveTour ?? null);
      if (result.playerFbos) setPlayerFbos(result.playerFbos);
    } catch (err) {
      setToastKind('fail');
      setToast(err instanceof Error ? err.message : String(err));
    } finally {
      setDispatchTourLoading(false);
    }
  }

  async function onAcceptActiveTourLeg(legIndex: number) {
    if (busy || dispatchTourBusy || !activeTour) return;
    const leg = activeTour.legs.find((l) => l.index === legIndex);
    if (!leg) return;
    // Refresh gates / rebind hint before staging.
    setDispatchTourLoading(true);
    try {
      const status = await postBaseDispatchTours({ action: 'status' });
      setActiveTour(status.activeTour ?? null);
      const view = status.activeTour;
      if (!view || view.nextLegIndex !== legIndex) {
        setToastKind('fail');
        setToast(
          view?.acceptBlockedReason ??
            'Cannot prepare this tour leg yet — Refresh Active Tour',
        );
        return;
      }
      // Stranded (no lot / Drop) — do not open Manifest.
      if (view.resumeState === 'stranded') {
        setToastKind('warn');
        setToast(
          view.acceptBlockedReason ??
            view.resumeHint ??
            'Tour cannot continue — Drop or Search again',
        );
        return;
      }
      // ready + blocked (ferry/parked): Manifest owns Ferry CTA + Accept gate.
      const liveLeg =
        view.legs.find((l) => l.index === legIndex) ?? leg;
      const lot = marketLotFromTourLeg(liveLeg);
      const isFirstUnbound =
        legIndex === 1 && !liveLeg.missionId && liveLeg.status === 'planned';
      setPendingActiveTour({
        kind: isFirstUnbound ? 'start' : 'bind',
        hubIcao: view.hubIcao,
        aircraftId: view.aircraftId,
        tourId: view.tourTemplateId,
        routeLabel: view.routeLabel,
        tourLegs: view.legs.map((l) => ({
          lotId: l.lotId,
          originIcao: l.originIcao,
          destIcao: l.destIcao,
          commodityId: l.commodityId,
          liftKg: l.liftKg,
          distanceNm: l.distanceNm,
          ferryNm: l.ferryNm,
          payUsd: l.payUsd,
          fuelCostUsd: l.fuelCostUsd,
          netUsd: l.netUsd,
          lastMile: l.lastMile,
        })),
        legIndex,
      });
      enterStagingForTourLeg(lot, view.aircraftId);
    } catch (err) {
      setToastKind('fail');
      setToast(err instanceof Error ? err.message : String(err));
    } finally {
      setDispatchTourLoading(false);
    }
  }

  function marketLotFromTourLeg(leg: {
    lotId: string;
    originIcao: string;
    destIcao: string;
    commodityId: string;
    liftKg: number;
    distanceNm: number;
    payUsd: number;
    lastMile: boolean;
  }): MarketLot {
    const fromBoard = lots.find((l) => l.id === leg.lotId);
    if (fromBoard) {
      // Never inflate past board free kg — Accept uses server lotAvailableKg.
      return { ...fromBoard };
    }
    // Lot not on the loaded board page — show 0 free until route lots hydrate
    // or we rebind to a live same-OD freight.
    return {
      id: leg.lotId,
      originIcao: leg.originIcao,
      destIcao: leg.destIcao,
      originName: leg.originIcao,
      destName: leg.destIcao,
      distanceNm: leg.distanceNm,
      commodityId: leg.commodityId,
      commodityName: leg.commodityId,
      quantityKg: leg.liftKg,
      availableKg: 0,
      payUsd: leg.payUsd,
      urgency: 'normal',
      reason: 'tour leg',
      expiresAtTick: (tick ?? 0) + 200,
      lastMile: leg.lastMile,
    };
  }

  /** Same OD, free kg — when the planned tour lot was taken after Search. */
  function findSameRouteAlternateLot(
    originIcao: string,
    destIcao: string,
    wantKg: number,
    excludeLotIds: Iterable<string> | string | undefined,
    pools: MarketLot[],
  ): MarketLot | null {
    const origin = originIcao.trim().toUpperCase();
    const dest = destIcao.trim().toUpperCase();
    const want = Math.max(1, Math.floor(wantKg));
    const exclude = new Set<string>();
    if (typeof excludeLotIds === 'string') {
      if (excludeLotIds) exclude.add(excludeLotIds);
    } else if (excludeLotIds) {
      for (const id of excludeLotIds) {
        if (id) exclude.add(id);
      }
    }
    let best: { lot: MarketLot; score: number } | null = null;
    const seen = new Set<string>();
    for (const lot of pools) {
      if (!lot?.id || seen.has(lot.id)) continue;
      seen.add(lot.id);
      if (exclude.has(lot.id)) continue;
      if (lot.originIcao.trim().toUpperCase() !== origin) continue;
      if (lot.destIcao.trim().toUpperCase() !== dest) continue;
      if (isCargoOpsCommodityLocked(lot.commodityId)) continue;
      const avail = Math.max(0, Math.floor(lot.availableKg ?? 0));
      if (avail < 1) continue;
      const lift = Math.min(avail, want);
      const score = -Math.abs(lift - want);
      if (!best || score > best.score) {
        best = { lot: { ...lot, availableKg: avail }, score };
      }
    }
    return best?.lot ?? null;
  }

  function tourLegExcludeLotIds(forLegIndex: number): string[] {
    const pending = pendingActiveTourRef.current;
    const fromPending =
      pending?.tourLegs
        .map((leg, i) => (i === forLegIndex - 1 ? null : leg.lotId))
        .filter((id): id is string => Boolean(id)) ?? [];
    const fromActive =
      activeTour?.legs
        .filter((leg) => leg.index !== forLegIndex)
        .map((leg) => leg.lotId) ?? [];
    return [...new Set([...fromPending, ...fromActive])];
  }

  function patchPendingTourLegLot(
    legIndex: number,
    lotId: string,
    liftKg: number,
  ) {
    setPendingActiveTour((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tourLegs: prev.tourLegs.map((leg, i) =>
          i === legIndex - 1
            ? {
                ...leg,
                lotId,
                liftKg: Math.max(1, Math.floor(liftKg)),
              }
            : leg,
        ),
      };
    });
  }

  /**
   * Open Manifest for a tour leg. Prefers the tour aircraft (even if off-origin);
   * Manifest lists the fleet and offers Ferry when not at the lot hub.
   */
  function enterStagingForTourLeg(lot: MarketLot, preferredAircraftId: string) {
    if (!hubSelected) {
      setPendingActiveTour(null);
      setError('Create your pilot profile first (name + home hub)');
      goToTab('pilot');
      return;
    }
    if (isCargoOpsCommodityLocked(lot.commodityId)) {
      setPendingActiveTour(null);
      setError(
        `Cargo Ops: ${lot.commodityName} is locked — unlock it in Hangar → Cargo Ops`,
      );
      setHangarPane('cargo');
      goToTab('hangar');
      return;
    }
    if (playerDispatchMission) {
      setPendingActiveTour(null);
      setError(
        `Finish or cancel ${activeFlightRouteLabel(playerDispatchMission)} in Dispatch before preparing another flight`,
      );
      goToTab('staging');
      return;
    }
    const preferred =
      fleet.find((a) => a.id === preferredAircraftId) ??
      fleet.find((a) => a.status === 'parked') ??
      null;
    if (!preferred) {
      setPendingActiveTour(null);
      setError('No aircraft in the hangar — buy or lease one first');
      goToTab('hangar');
      return;
    }

    let resolvedLot = lot;
    const liveAvail = Math.max(0, Math.floor(resolvedLot.availableKg ?? 0));
    if (liveAvail < 1) {
      const quantityKg = lot.quantityKg ?? 0;
      const wantKg =
        quantityKg > 0 ? quantityKg : Math.max(1, lot.availableKg || 500);
      const alt = findSameRouteAlternateLot(
        lot.originIcao,
        lot.destIcao,
        wantKg,
        [
          lot.id,
          ...(pendingActiveTourRef.current
            ? tourLegExcludeLotIds(pendingActiveTourRef.current.legIndex)
            : []),
        ],
        [...lots, ...stagingRouteLots],
      );
      if (alt) {
        const altAvailableKg = Math.max(0, alt.availableKg ?? 0);
        const pending = pendingActiveTourRef.current;
        if (pending) {
          patchPendingTourLegLot(
            pending.legIndex,
            alt.id,
            Math.min(altAvailableKg, wantKg),
          );
        }
        resolvedLot = {
          ...alt,
          reason: alt.reason || 'tour leg (rebound)',
        };
        setToastKind('warn');
        setToast(
          `Planned lot gone — rebound ${alt.originIcao}→${alt.destIcao} · ${formatTonnes(altAvailableKg)} free`,
        );
      }
    }

    const atOrigin =
      preferred.status === 'parked' &&
      preferred.locationIcao.trim().toUpperCase() ===
        resolvedLot.originIcao.trim().toUpperCase();
    const aircraft = preferred.aircraftClassId;
    const openFlight = atOrigin
      ? openFlightForRoute(
          resolvedLot.originIcao,
          resolvedLot.destIcao,
          aircraft,
          preferred.id,
        )
      : undefined;
    const draft: StagingDraft = {
      originIcao: resolvedLot.originIcao,
      destIcao: resolvedLot.destIcao,
      originName: resolvedLot.originName,
      destName: resolvedLot.destName,
      aircraft,
      aircraftId: preferred.id,
      intoMissionId: openFlight?.id,
      lines: [],
    };
    const maxKg = lineMaxKg(draft, resolvedLot);
    const freeKg = Math.max(0, Math.floor(resolvedLot.availableKg ?? 0));
    draft.lines = [
      {
        lot: resolvedLot,
        cargoKg: maxKg > 0 && freeKg > 0 ? Math.min(maxKg, freeKg) : 0,
      },
    ];
    setFlightDebrief(null);
    // Ferry only via Manifest CTA — do not block the pilot with an auto modal.
    setStagingFerryOpen(false);
    setStaging(draft);
    setPreferredAircraft(aircraft);
    setError(null);
    const restoreAirport = airportIcao
      ? { icao: airportIcao, section: terminalSection }
      : null;
    closeAirport();
    setAirportReturn(restoreAirport);
    goToTab('staging');
    if (liveAvail >= 1 || resolvedLot.id !== lot.id) {
      setToastKind(atOrigin ? (resolvedLot.id !== lot.id ? 'warn' : 'ok') : 'warn');
      setToast(
        atOrigin
          ? `Manifest · ${resolvedLot.originIcao}→${resolvedLot.destIcao} · pick aircraft, then Accept & Dispatch`
          : `Manifest · ${preferred.label} is at ${preferred.locationIcao} — ferry to ${resolvedLot.originIcao} before Accept & Dispatch`,
      );
    } else {
      setToastKind('warn');
      setToast(
        `Manifest · ${resolvedLot.originIcao}→${resolvedLot.destIcao} · planned lot empty — waiting for live freights to rebind`,
      );
    }
  }

  async function onDropActiveTour() {
    if (busy || dispatchTourBusy) return;
    setDispatchTourLoading(true);
    try {
      const result = await postBaseDispatchTours({ action: 'drop' });
      setActiveTour(null);
      if (result.policy) setDispatchScoutPolicy(result.policy);
      if (result.dispatcher) setBaseDispatcher(result.dispatcher);
      setToastKind('ok');
      setToast('Active Tour dropped');
    } catch (err) {
      setToastKind('fail');
      setToast(err instanceof Error ? err.message : String(err));
    } finally {
      setDispatchTourLoading(false);
    }
  }

  async function onRefreshActiveTour() {
    if (busy || dispatchTourBusy) return;
    setDispatchTourLoading(true);
    try {
      const result = await postBaseDispatchTours({ action: 'status' });
      setActiveTour(result.activeTour ?? null);
      if (result.policy) setDispatchScoutPolicy(result.policy);
      if (result.dispatcher) setBaseDispatcher(result.dispatcher);
    } catch (err) {
      setToastKind('fail');
      setToast(err instanceof Error ? err.message : String(err));
    } finally {
      setDispatchTourLoading(false);
    }
  }

  /**
   * Sidebar Resume tour click:
   * - Manifest open → Manifest
   * - Flight already accepted → Flight plan (Dispatch)
   * - After cancel Manifest/flight → Base (Accept / Drop)
   */
  function openActiveTourResume() {
    if (!activeTour || activeTour.status !== 'active') return;

    if (staging) {
      closeAirport();
      goToTab('staging');
      return;
    }

    if (activeMission) {
      closeAirport();
      goToTab('staging');
      return;
    }

    const pending = pendingActiveTourRef.current;
    if (pending) {
      const nextLeg =
        activeTour.legs.find((l) => l.index === pending.legIndex) ??
        activeTour.legs.find((l) => l.index === activeTour.nextLegIndex) ??
        activeTour.legs.find(
          (l) => l.status === 'planned' || l.status === 'lost',
        ) ??
        null;
      if (nextLeg) {
        enterStagingForTourLeg(
          marketLotFromTourLeg(nextLeg),
          pending.aircraftId || activeTour.aircraftId,
        );
        return;
      }
    }

    const hub =
      activeTour.hubIcao.trim().toUpperCase() ||
      homeHubIcao.trim().toUpperCase();
    if (hub) void openAirport(hub, { section: 'fbo' });
  }

  async function onHireBaseDispatcher(fboId: string, candidateId: string) {
    if (busy || dispatchHireBusy) return;
    setDispatchScoutLoading(true);
    try {
      const result = await postBaseDispatcher({
        action: 'hire',
        fboId,
        candidateId,
      });
      if (result.walletUsd != null) commitWallet(result.walletUsd);
      if (result.dispatcher) setBaseDispatcher(result.dispatcher);
      if (result.policy) setDispatchScoutPolicy(result.policy);
      setDispatchTours([]);
      setSelectedDispatchTourId(null);
      setBaseDispatcherHireOpen(false);
      setBaseDispatchProduct('freight');
      setToastKind('ok');
      setToast(
        `Hired ${result.member?.displayName ?? 'Dispatcher'} · fleet scout unlocked`,
      );
    } catch (err) {
      setToastKind('fail');
      setToast(err instanceof Error ? err.message : String(err));
    } finally {
      setDispatchScoutLoading(false);
    }
  }

  async function onFireBaseDispatcher(memberId: string) {
    if (busy || dispatchHireBusy) return;
    setDispatchScoutLoading(true);
    try {
      const result = await postBaseDispatcher({
        action: 'fire',
        memberId,
      });
      if (result.walletUsd != null) commitWallet(result.walletUsd);
      if (result.dispatcher) setBaseDispatcher(result.dispatcher);
      if (result.policy) setDispatchScoutPolicy(result.policy);
      setDispatchTours([]);
      setSelectedDispatchTourId(null);
      setToastKind('ok');
      setToast('Dispatcher released · desk back to manual');
    } catch (err) {
      setToastKind('fail');
      setToast(err instanceof Error ? err.message : String(err));
    } finally {
      setDispatchScoutLoading(false);
    }
  }

  async function onUpgradeFbo(fboId: string) {
    const fbo = playerFbos?.fbos.find((f) => f.id === fboId);
    if (!fbo?.canUpgradeToTier2) return;
    const ok = await confirm({
      title: `Upgrade Base at ${fbo.icao} to Tier 2?`,
      body: `Raises capacity to ${formatTonnes(8000)}, parking discount to 30%, Jet-A/MRO discount to 10%, and +1 crew roster slot. Pays ${fbo.upgradeUsd != null ? formatMoney(fbo.upgradeUsd) : 'the listed CAPEX'}.`,
      confirmLabel: 'Upgrade to T2',
    });
    if (!ok) return;
    await run(async () => {
      const result = await postFboUpgrade({ fboId });
      commitWallet(result.walletUsd);
      setPlayerFbos(result.playerFbos);
      if (result.companyCrew) setCompanyCrew(result.companyCrew);
      if (result.fleet) setFleet(result.fleet);
      setToastKind('ok');
      setToast(
        `Base T2 at ${result.fbo.icao} · ${formatMoney(result.debitUsd)}${
          COMPANY_CREW_ENABLED && result.companyCrew
            ? ` · ${result.companyCrew.slotsUnlocked} crew slot(s)`
            : ''
        }`,
      );
      if (airportIcao) {
        const view = await fetchAirportView(airportIcao);
        setAirportView(view);
        if (view.playerFbos) setPlayerFbos(view.playerFbos);
      }
    });
  }

  async function onHoldAtFbo(lot: AirportLot) {
    const fbo = (playerFbos?.fbos ?? []).find(
      (f) => f.icao.toUpperCase() === lot.originIcao.toUpperCase(),
    );
    if (!fbo) {
      setToastKind('fail');
      setToast(`No base at ${lot.originIcao}`);
      return;
    }
    const roomKg = Math.max(0, fbo.capacityKg - fbo.usedKg);
    const maxKg = Math.min(Math.floor(lot.availableKg), roomKg);
    if (maxKg <= 0) {
      setToastKind('fail');
      setToast(
        roomKg <= 0
          ? `Base at ${fbo.icao} is full`
          : 'No cargo left on this contract',
      );
      return;
    }

    const amountRef = { current: defaultStagingKg(maxKg) };
    const ok = await confirm({
      title: `Hold at Base ${fbo.icao}?`,
      body: (
        <HoldFboAmountFields
          maxKg={maxKg}
          roomKg={roomKg}
          lot={lot}
          weightSystem={weightSystem}
          valueRef={amountRef}
        />
      ),
      confirmLabel: 'Hold at Base',
    });
    if (!ok) return;

    const cargoKg = Math.max(1, Math.min(maxKg, Math.floor(amountRef.current) || 0));
    if (cargoKg <= 0) return;

    await run(async () => {
      const result = await postFboHold({ lotId: lot.id, cargoKg });
      setPlayerFbos(result.playerFbos);
      setToastKind('ok');
      setToast(
        `Held at Base · ${formatTonnes(result.hold.cargoKg)} → ${result.hold.destIcao} (no inbound until Dispatch)`,
      );
      if (airportIcao) {
        const view = await fetchAirportView(airportIcao);
        setAirportView(view);
        if (view.playerFbos) setPlayerFbos(view.playerFbos);
      }
    }, { sync: { market: true } });
  }

  async function onCancelFboHold(holdId: string) {
    const hold = playerFbos?.holds.find((h) => h.id === holdId);
    const ok = await confirm({
      title: 'Cancel Base hold?',
      body: hold
        ? `Releases ${formatTonnes(hold.cargoKg)} ${hold.commodityId} back to the board. No payout.`
        : 'Releases the bonded reservation back to the board.',
      confirmLabel: 'Cancel hold',
      tone: 'warn',
    });
    if (!ok) return;
    await run(async () => {
      const result = await postFboCancelHold({ holdId });
      setPlayerFbos(result.playerFbos);
      setToastKind('ok');
      setToast(`Hold cancelled · ${formatTonnes(result.releasedKg)} released`);
      if (airportIcao) {
        const view = await fetchAirportView(airportIcao);
        setAirportView(view);
      }
    }, { sync: { market: true } });
  }

  async function onReleaseFboHold(holdId: string) {
    const hold = playerFbos?.holds.find((h) => h.id === holdId);
    const ok = await confirm({
      title: 'Send hold to Dispatch?',
      body: hold
        ? `Creates an accepted mission ${hold.originIcao}→${hold.destIcao} (${formatTonnes(hold.cargoKg)}). Destination soft-fill starts now.`
        : 'Creates an accepted mission from this bonded hold.',
      confirmLabel: 'Send to Dispatch',
    });
    if (!ok) return;
    await run(async () => {
      const result = await postFboRelease({ holdId });
      setPlayerFbos(result.playerFbos);
      setMissions(result.missions.slice().reverse());
      commitWallet(result.walletUsd);
      selectTab('staging');
    }, { sync: { market: true } });
  }

  function onSplitFboHold(holdId: string) {
    const hold = playerFbos?.holds.find((h) => h.id === holdId);
    if (!hold) return;
    setSelectedFboHoldId(holdId);
    setSplitHoldId(holdId);
  }

  async function confirmSplitFboHold(
    legs: Array<{ aircraftId: string; cargoKg: number }>,
  ) {
    const holdId = splitHoldId;
    if (!holdId) return;
    await run(async () => {
      const result = await postFboSplit({ holdId, legs });
      setPlayerFbos(result.playerFbos);
      if (result.fleet) setFleet(result.fleet);
      setMissions(result.allMissions.slice().reverse());
      commitWallet(result.walletUsd);
      setSplitHoldId(null);
      setToastKind('ok');
      setToast(
        `Crew fly · ${result.missions.length} Accepted leg(s) ready` +
          (result.remainingKg > 0
            ? ` · ${formatTonnes(result.remainingKg)} still bonded`
            : '') +
          ` · Send from Accepted list below or Hangar → Crew`,
      );
    }, { sync: { market: true } });
  }

  async function onReturnMissionToFbo(mission: Mission) {
    const ok = await confirm({
      title: 'Return cargo to Base?',
      body: `Cancels ${mission.originIcao}→${mission.destIcao} (${formatTonnes(mission.cargoKg)}) and bonds it back at the Base. Soft-fill stops; aircraft is freed.`,
      confirmLabel: 'Return to Base',
    });
    if (!ok) return;
    await run(async () => {
      const result = await postFboReturnMission({ missionId: mission.id });
      setPlayerFbos(result.playerFbos);
      if (result.fleet) setFleet(result.fleet);
      setMissions(result.missions.slice().reverse());
      commitWallet(result.walletUsd);
      setToastKind('ok');
      setToast(
        `Returned ${formatTonnes(mission.cargoKg)} to Base` +
          (result.merged ? ' · merged into existing hold' : ''),
      );
      if (airportIcao) {
        const view = await fetchAirportView(airportIcao);
        setAirportView(view);
        if (view.playerFbos) setPlayerFbos(view.playerFbos);
      }
    }, { sync: { market: true } });
  }

  async function onCrewAssignMission(
    missionId: string,
    crewMemberId: string,
  ) {
    setMissions((current) =>
      current.map((m) =>
        m.id === missionId ? { ...m, crewMemberId } : m,
      ),
    );
    try {
      const result = await postCrewAssign({ missionId, crewMemberId });
      setCompanyCrew(result.companyCrew);
      setMissions(result.missions.slice().reverse());
    } catch (err: unknown) {
      setToastKind('fail');
      setToast(err instanceof Error ? err.message : String(err));
      void refresh().catch(() => {
        /* ignore */
      });
    }
  }

  async function onCrewDispatchMission(
    mission: Mission,
    crewMemberId?: string,
  ) {
    const outboundFee = companyCrew
      ? Math.max(50, Math.round(mission.payUsd * companyCrew.feeFrac))
      : null;
    const returnFee =
      outboundFee != null ? Math.max(50, Math.round(outboundFee * 0.5)) : null;
    const parked =
      (mission.aircraftId
        ? fleet.find((a) => a.id === mission.aircraftId)
        : undefined) ??
      fleet.find(
        (a) =>
          a.status === 'parked' &&
          a.locationIcao.toUpperCase() === mission.originIcao.toUpperCase() &&
          a.aircraftClassId === mission.aircraftClassId,
      );
    const crewName = crewMemberId
      ? companyCrew?.members?.find((m) => m.id === crewMemberId)?.displayName
      : undefined;
    const ok = await confirm({
      title: 'Send with company crew?',
      body: `${crewName ?? 'Crew'} flies ${mission.originIcao}→${mission.destIcao} then empty return to ${mission.originIcao} (wall-clock). Out ~${outboundFee != null ? formatMoney(outboundFee) : '12%'} · return ~${returnFee != null ? formatMoney(returnFee) : '½ fee'}${parked ? ` · ${parked.label}` : ''}. Settles on ETA — no Watch.`,
      confirmLabel: 'Send with crew',
    });
    if (!ok) return;
    await run(
      async () => {
        setCrewDispatchBusy(true);
        try {
          const result = await postCrewDispatch({
            missionId: mission.id,
            aircraftId: parked?.id ?? mission.aircraftId,
            crewMemberId,
          });
          setCompanyCrew(result.companyCrew);
          setPlayerFbos(result.playerFbos);
          setMissions(result.missions.slice().reverse());
          commitWallet(result.walletUsd);
          if (result.fleet) setFleet(result.fleet);
          setToastKind('ok');
          setToast(
            `Crew airborne${crewName ? ` · ${crewName}` : ''} · out ${formatMoney(result.crewFeeUsd)} · return ${formatMoney(result.returnFeeUsd)}${result.fuelDebitUsd > 0 ? ` · fuel ${formatMoney(result.fuelDebitUsd)}` : ''}`,
          );
        } finally {
          setCrewDispatchBusy(false);
        }
      },
      { lockUi: false },
    );
  }

  async function onCrewHire(candidateId: string) {
    const cand = companyCrew?.hirePool?.find((c) => c.id === candidateId);
    const ok = await confirm({
      title: cand ? `Hire ${cand.displayName}?` : 'Hire crew?',
      body: cand
        ? `${cand.perkLabel} — ${cand.perkHint}. Signing ${formatMoney(cand.hireUsd)} · salary ${formatMoney(cand.salaryUsdPerDay)}/day.`
        : 'Signs the candidate onto your Base roster.',
      confirmLabel: 'Hire',
    });
    if (!ok) return;
    await run(async () => {
      const result = await postCrewHire({ candidateId });
      setCompanyCrew(result.companyCrew);
      commitWallet(result.walletUsd);
      setToastKind('ok');
      setToast(
        `Hired ${result.member.displayName} · ${formatMoney(result.debitUsd)}`,
      );
    });
  }

  async function onCrewFire(memberId: string) {
    const member = companyCrew?.members?.find((m) => m.id === memberId);
    const ok = await confirm({
      title: member ? `Fire ${member.displayName}?` : 'Fire crew?',
      body: 'Removes them from the roster. You can hire someone else from the desk.',
      confirmLabel: 'Fire',
      tone: 'warn',
    });
    if (!ok) return;
    await run(async () => {
      const result = await postCrewFire({ memberId });
      setCompanyCrew(result.companyCrew);
      commitWallet(result.walletUsd);
    });
  }

  async function onFerry(
    aircraftId: string,
    destIcao: string,
    opts?: { finalDest?: string; companyId?: string },
  ) {
    if (!destIcao.trim()) return;
    const dest = destIcao.trim().toUpperCase();
    const finalDest = opts?.finalDest?.trim().toUpperCase() || dest;
    const opsCompanyId =
      opts?.companyId?.trim() || resolveOpsCompanyId(aircraftId);
    const vaOps =
      Boolean(memberVaCompanyIdRef.current) &&
      opsCompanyId === memberVaCompanyIdRef.current;
    setBusy(true);
    setError(null);
    try {
      const result = await postFerry({
        aircraftId,
        destIcao: dest,
        companyId: opsCompanyId,
      });
      paintOpsMutationFleet(result.fleet, opsCompanyId);
      // Overflow debit hits home wallet; allowance/solo on VA must not paint
      // VA cash onto chrome.
      if (!vaOps) {
        commitWallet(result.walletUsd);
      } else {
        setVaSessionWallet(result.walletUsd);
        if (result.ferryMode === 'overflow') {
          void refresh({ missions: false }).catch(() => undefined);
        }
      }
      const arrivedAt =
        result.aircraft?.locationIcao?.trim().toUpperCase() ?? dest;
      setToastKind(result.quote.fuelScarcity === 'ok' ? 'ok' : 'warn');
      const fuelNote = ' · tanks unchanged';
      const payLabel =
        result.ferryMode === 'allowance'
          ? 'Line crew · $0'
          : result.ferryMode === 'overflow'
            ? `−${formatMoney(
                result.walletDebitUsd && result.walletDebitUsd > 0
                  ? result.walletDebitUsd
                  : result.quote.totalCostUsd,
              )} your wallet`
            : `−${formatMoney(result.walletDebitUsd ?? result.quote.totalCostUsd)}`;
      setToast(
        arrivedAt === finalDest
          ? `Ferry complete · ${result.quote.originIcao}→${result.quote.destIcao} · ${payLabel}${fuelNote}`
          : `Ferry leg · ${result.quote.originIcao}→${result.quote.destIcao} · ${payLabel} · continue toward ${finalDest}${fuelNote}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setBusy(false);
    }
  }

  async function onEmptyFlight(aircraftId: string, destIcao: string) {
    if (!destIcao.trim()) return;
    const dest = destIcao.trim().toUpperCase();
    await run(async () => {
      const opsCompanyId = resolveOpsCompanyId(aircraftId);
      const vaOps =
        Boolean(memberVaCompanyIdRef.current) &&
        opsCompanyId === memberVaCompanyIdRef.current;
      // Pin VA for Dispatch while chrome stays home-sticky.
      if (vaOps && memberVaCompanyIdRef.current) {
        await switchCompanyForVa(memberVaCompanyIdRef.current);
      }
      const result = await postEmptyFlight({
        aircraftId,
        destIcao: dest,
        companyId: opsCompanyId,
      });
      paintOpsMutationFleet(result.fleet, opsCompanyId);
      if (vaOps) setVaSessionWallet(result.walletUsd);
      else commitWallet(result.walletUsd);
      setMissions((prev) => {
        const others = prev.filter((m) => m.id !== result.mission.id);
        return [...others, result.mission];
      });
      setToastKind('ok');
      setToast(
        `Empty flight ${result.mission.originIcao}→${result.mission.destIcao} · open Dispatch`,
      );
      selectTab('staging');
    }, { sync: { missions: true } });
  }

  function openPilotTravel(destIcao?: string) {
    const dest = destIcao?.trim().toUpperCase() || null;
    setPilotTravelInitialDest(dest);
    setPilotTravelOpen(true);
  }

  function closePilotTravel() {
    setPilotTravelOpen(false);
    setPilotTravelInitialDest(null);
  }

  function openTopbarFerry(aircraftId: string, destIcao: string) {
    const dest = destIcao.trim().toUpperCase();
    if (!aircraftId.trim() || !dest) return;
    closePilotTravel();
    setTopbarFerry({ aircraftId: aircraftId.trim(), finalDest: dest });
  }

  /** Execute pilot travel (quote already shown in PilotTravelDialog). */
  async function onPilotTravel(destIcao: string): Promise<boolean> {
    if (!destIcao.trim()) return false;
    const dest = destIcao.trim().toUpperCase();
    let moved = false;
    await run(async () => {
      setError(null);
      // Hub + debit always on home — Crew may have the VA tenant pinned.
      const home =
        homeCompanyIdRef.current?.trim() ||
        homeCompanyId?.trim() ||
        undefined;
      const result = await postPilotTravel({
        destIcao: dest,
        companyId: home,
      });
      const homeId =
        result.companyId?.trim() ||
        home ||
        homeCompanyIdRef.current?.trim() ||
        undefined;
      // Travel mutates home missions only — never replace chrome fleet with a
      // VA/home mismatch payload while Crew is pinned.
      if (result.fleet && homeId) {
        const active =
          getStoredCompanyId()?.trim() ||
          activeCompanyIdRef.current?.trim();
        if (!active || active === homeId) {
          setFleet(result.fleet);
        }
      }
      commitWallet(result.walletUsd, { sourceCompanyId: homeId });
      if (result.pilotIcao) setPilotIcao(result.pilotIcao);
      else setPilotIcao(dest);
      setToastKind('ok');
      setToast(
        `Pilot at ${result.pilotIcao ?? dest} · −${formatMoney(result.walletDebitUsd ?? 0)}`,
      );
      moved = true;
    });
    return moved;
  }

  function openFlightForRoute(
    originIcao: string,
    destIcao: string,
    aircraftClass: AircraftClass,
    aircraftId?: string,
  ): Mission | undefined {
    const matches = missions.filter(
      (mission) =>
        ['accepted', 'dispatched'].includes(mission.status) &&
        mission.aircraftClassId === aircraftClass &&
        mission.originIcao === originIcao &&
        mission.destIcao === destIcao &&
        (!aircraftId ||
          !mission.aircraftId ||
          mission.aircraftId === aircraftId),
    );
    return matches.length === 1 ? matches[0] : undefined;
  }

  function aircraftCapKg(aircraftClass: AircraftClass): number {
    if (
      staging &&
      staging.aircraft === aircraftClass &&
      maxCargoKg !== null &&
      Number.isFinite(maxCargoKg) &&
      (!maxCargoBoundAircraftId ||
        !staging.aircraftId ||
        maxCargoBoundAircraftId === staging.aircraftId)
    ) {
      return maxCargoKg;
    }
    return fallbackMaxCargoKg(aircraftClass);
  }

  function stagingUsedKg(draft: StagingDraft): number {
    const existing =
      draft.replaceManifest || !draft.intoMissionId
        ? 0
        : missions.find((m) => m.id === draft.intoMissionId)?.cargoKg ?? 0;
    return (
      existing + draft.lines.reduce((sum, line) => sum + line.cargoKg, 0)
    );
  }

  function stagingRemainingKg(draft: StagingDraft, excludeLotId?: string): number {
    const existing =
      draft.replaceManifest || !draft.intoMissionId
        ? 0
        : missions.find((m) => m.id === draft.intoMissionId)?.cargoKg ?? 0;
    const staged = draft.lines
      .filter((line) => line.lot.id !== excludeLotId)
      .reduce((sum, line) => sum + line.cargoKg, 0);
    return Math.max(0, aircraftCapKg(draft.aircraft) - existing - staged);
  }

  function lineMaxKg(draft: StagingDraft, lot: MarketLot): number {
    const resolved = stagingResolvedLot(
      draft,
      lot,
      missions,
      stagingRouteLots,
      lots,
    );
    return Math.max(
      0,
      Math.floor(
        Math.min(resolved.availableKg, stagingRemainingKg(draft, lot.id)),
      ),
    );
  }

  function stagingRouteDistanceNm(draft: StagingDraft): number | undefined {
    const fromLine = draft.lines[0]?.lot.distanceNm;
    if (typeof fromLine === 'number' && Number.isFinite(fromLine)) return fromLine;
    const marketMatch = lots.find(
      (lot) =>
        lot.originIcao === draft.originIcao && lot.destIcao === draft.destIcao,
    );
    if (
      typeof marketMatch?.distanceNm === 'number' &&
      Number.isFinite(marketMatch.distanceNm)
    ) {
      return marketMatch.distanceNm;
    }
    if (
      typeof routeDistanceNmResolved === 'number' &&
      Number.isFinite(routeDistanceNmResolved)
    ) {
      return routeDistanceNmResolved;
    }
    return undefined;
  }

  function stagingRangeOk(draft: StagingDraft): boolean {
    const distance = stagingRouteDistanceNm(draft);
    if (distance === undefined) return true;
    return distance <= aircraftMaxRangeNm(draft.aircraft);
  }

  function clampDraftToCapacity(draft: StagingDraft): StagingDraft {
    let remaining = aircraftCapKg(draft.aircraft);
    if (draft.intoMissionId && !draft.replaceManifest) {
      const existing = missions.find((m) => m.id === draft.intoMissionId);
      remaining = Math.max(0, remaining - (existing?.cargoKg ?? 0));
    }
    const lines = draft.lines.map((line) => {
      const maxKg = Math.max(
        0,
        Math.floor(Math.min(line.lot.availableKg, remaining)),
      );
      const cargoKg = Math.min(line.cargoKg, maxKg);
      remaining = Math.max(0, remaining - cargoKg);
      return { ...line, cargoKg };
    });
    if (!draft.deskHold) return { ...draft, lines };
    const holdKg = Math.max(0, Math.floor(draft.deskHold.kg));
    const maxLoad = Math.max(0, Math.floor(Math.min(holdKg, remaining)));
    const raw = deskHoldEffectiveLoadKg(draft.deskHold);
    const loadKg =
      maxLoad <= 0
        ? 0
        : Math.max(1, Math.min(maxLoad, raw > 0 ? raw : maxLoad));
    return {
      ...draft,
      lines,
      deskHold: { ...draft.deskHold, loadKg },
    };
  }

  function fleetTailAtOrigin(icao: string, preferId?: string) {
    const here = (a: (typeof fleet)[number]) =>
      a.locationIcao === icao &&
      (a.status === 'parked' || a.status === 'assigned');
    if (preferId) {
      const named = fleet.find((a) => a.id === preferId && here(a));
      if (named) return named;
    }
    return (
      fleet.find((a) => a.status === 'parked' && a.locationIcao === icao) ??
      fleet.find((a) => a.status === 'assigned' && a.locationIcao === icao)
    );
  }

  function enterStaging(lot: MarketLot) {
    if (!hubSelected) {
      setError('Create your pilot profile first (name + home hub)');
      goToTab('pilot');
      return;
    }
    if (isCargoOpsCommodityLocked(lot.commodityId)) {
      setError(
        `Cargo Ops: ${lot.commodityName} is locked — unlock it in Hangar → Cargo Ops`,
      );
      setHangarPane('cargo');
      goToTab('hangar');
      return;
    }
    if (playerDispatchMission) {
      setError(
        `Finish or cancel ${activeFlightRouteLabel(playerDispatchMission)} in Dispatch before preparing another flight`,
      );
      goToTab('staging');
      return;
    }
    const preferEntry = boardAircraftId
      ? findOpsEntry(opsFleetEntries, boardAircraftId)
      : null;
    const atOriginPrefer =
      preferEntry &&
      preferEntry.aircraft.status === 'parked' &&
      preferEntry.aircraft.locationIcao.trim().toUpperCase() ===
        lot.originIcao.trim().toUpperCase()
        ? preferEntry
        : null;
    const picked =
      atOriginPrefer ??
      pickOpsAircraftForOrigin(
        prepareOpsFleetEntries,
        lot.originIcao,
        boardAircraftId,
      );
    if (!picked) {
      setError(`No parked aircraft available for ${lot.originIcao}`);
      return;
    }
    const selectedAircraft = picked.aircraft;
    const atOrigin =
      selectedAircraft.locationIcao.trim().toUpperCase() ===
      lot.originIcao.trim().toUpperCase();
    const busyMission = missions.find(
      (m) =>
        ['accepted', 'dispatched', 'in_flight'].includes(m.status) &&
        (m.aircraftId === selectedAircraft.id ||
          selectedAircraft.assignedMissionId === m.id),
    );
    if (
      busyMission &&
      (busyMission.originIcao !== lot.originIcao ||
        busyMission.destIcao !== lot.destIcao)
    ) {
      setError(
        `Your ${selectedAircraft.label} is already on ${busyMission.originIcao}→${busyMission.destIcao}. Finish or cancel it in Dispatch, or ferry another aircraft to ${lot.originIcao}.`,
      );
      goToTab('staging');
      return;
    }
    const aircraft = selectedAircraft.aircraftClassId;
    const openFlight = atOrigin
      ? openFlightForRoute(
          lot.originIcao,
          lot.destIcao,
          aircraft,
          selectedAircraft.id,
        )
      : undefined;
    const existingLots = openFlight?.lots?.length ?? 0;
    if (existingLots >= MAX_STAGING_LOTS) {
      setError(`Flight ${openFlight!.id} already has ${MAX_STAGING_LOTS} lots`);
      return;
    }
    const draft: StagingDraft = {
      originIcao: lot.originIcao,
      destIcao: lot.destIcao,
      originName: lot.originName,
      destName: lot.destName,
      aircraft,
      aircraftId: selectedAircraft.id,
      intoMissionId: openFlight?.id,
      lines: [],
    };
    const maxKg = lineMaxKg(draft, lot);
    draft.lines = [
      {
        lot,
        cargoKg: maxKg > 0 ? defaultStagingKg(maxKg) : 0,
      },
    ];
    setFlightDebrief(null);
    // Never auto-open Ferry Journey — pilot picks aircraft first, then CTA.
    setStagingFerryOpen(false);
    setStaging(draft);
    setPreferredAircraft(aircraft);
    setError(null);
    const restoreAirport = airportIcao
      ? { icao: airportIcao, section: terminalSection }
      : null;
    closeAirport();
    // closeAirport clears airportReturn — restore after so Back can reopen the terminal.
    setAirportReturn(restoreAirport);
    goToTab('staging');
    if (!atOrigin) {
      setToastKind('warn');
      setToast(
        `Manifest · ${selectedAircraft.label} is at ${selectedAircraft.locationIcao} — pick aircraft or ferry to ${lot.originIcao} before Accept & Dispatch`,
      );
    }
  }

  function enterStagingForVaHaulHold(hold: VaHaulHold, aircraftId: string) {
    if (!hubSelected) {
      setError('Create your pilot profile first (name + home hub)');
      goToTab('pilot');
      return;
    }
    if (playerDispatchMission) {
      setError(
        `Finish or cancel ${activeFlightRouteLabel(playerDispatchMission)} in Dispatch before preparing another flight`,
      );
      goToTab('staging');
      return;
    }
    const id = aircraftId.trim();
    const selectedAircraft =
      findOpsEntry(opsFleetEntries, id)?.aircraft ??
      vaSessionFleet.find((a) => a.id === id) ??
      fleet.find((a) => a.id === id);
    if (!selectedAircraft || selectedAircraft.status !== 'parked') {
      setError('Pick a parked company aircraft for this desk hold');
      return;
    }
    const origin = hold.originIcao.trim().toUpperCase();
    const dest = hold.destIcao.trim().toUpperCase();
    const atOrigin =
      selectedAircraft.locationIcao.trim().toUpperCase() === origin;
    const kind = hold.kind ?? 'demand';
    const holdKg = Math.max(0, Math.floor(hold.kg));
    const fallbackCap = Math.max(
      0,
      Math.floor(fallbackMaxCargoKg(selectedAircraft.aircraftClassId)),
    );
    const loadKg =
      holdKg <= 0
        ? 0
        : Math.max(
            1,
            Math.min(holdKg, fallbackCap > 0 ? fallbackCap : holdKg),
          );
    const draft: StagingDraft = {
      originIcao: origin,
      destIcao: dest,
      originName: origin,
      destName: dest,
      aircraft: selectedAircraft.aircraftClassId,
      aircraftId: selectedAircraft.id,
      lines: [],
      deskHold: {
        id: hold.id,
        kind,
        commodityId: hold.commodityId,
        kg: holdKg,
        loadKg,
        unitPriceUsd: hold.unitPriceUsd,
        pilotPayUsd: hold.pilotPayUsd,
        expiresAtTick: hold.expiresAtTick,
      },
    };
    setFlightDebrief(null);
    setStagingFerryOpen(false);
    setCharterManifest(null);
    setStaging(draft);
    setPreferredAircraft(selectedAircraft.aircraftClassId);
    setError(null);
    goToTab('staging');
    const vaId = memberVaCompanyIdRef.current?.trim();
    if (vaId) {
      void switchCompanyForVa(vaId).catch(() => undefined);
    }
    if (!atOrigin) {
      setToastKind('warn');
      setToast(
        `Manifest · ${selectedAircraft.label} is at ${selectedAircraft.locationIcao} — ferry to ${origin} before Accept & Dispatch`,
      );
    }
  }

  function enterCharterManifest(
    offer: CharterOfferView,
    aircraftId: string,
  ) {
    if (!hubSelected) {
      setError('Create your pilot profile first (name + home hub)');
      goToTab('pilot');
      return;
    }
    if (playerDispatchMission) {
      setError(
        `Finish or cancel ${activeFlightRouteLabel(playerDispatchMission)} in Dispatch before preparing another flight`,
      );
      goToTab('staging');
      return;
    }
    const aircraft =
      findOpsEntry(opsFleetEntries, aircraftId)?.aircraft ??
      fleet.find(
        (item) => item.id === aircraftId && item.status === 'parked',
      );
    if (!aircraft || aircraft.status !== 'parked') {
      setError('Select a parked aircraft for this charter');
      return;
    }
    const restoreAirport = airportIcao
      ? { icao: airportIcao, section: terminalSection }
      : null;
    setFlightDebrief(null);
    setStaging(null);
    setCharterManifest({ offer, aircraftId });
    setError(null);
    closeAirport();
    setAirportReturn(restoreAirport);
    goToTab('staging');
    if (aircraft.locationIcao.trim().toUpperCase() !== offer.originIcao) {
      setToastKind('warn');
      setToast(
        `Charter manifest · ${aircraft.label} is at ${aircraft.locationIcao} — ferry to ${offer.originIcao} before accepting`,
      );
    }
  }

  async function onAcceptCharter(draft: CharterManifestDraft) {
    await run(
      async () => {
        const opsCompanyId = resolveOpsCompanyId(draft.aircraftId);
        const vaOps =
          Boolean(memberVaCompanyIdRef.current) &&
          opsCompanyId === memberVaCompanyIdRef.current;
        if (vaOps && memberVaCompanyIdRef.current) {
          await switchCompanyForVa(memberVaCompanyIdRef.current);
        }
        const result = await postCharterAccept({
          offerId: draft.offer.id,
          aircraftId: draft.aircraftId,
          companyId: opsCompanyId,
        });
        paintOpsMutationFleet(result.fleet, opsCompanyId);
        if (vaOps) setVaSessionWallet(result.walletUsd);
        else commitWallet(result.walletUsd);
        if (result.charterActiveTour !== undefined) {
          setCharterActiveTour(result.charterActiveTour ?? null);
        }
        setMissions((current) => [
          result.mission,
          ...current.filter((mission) => mission.id !== result.mission.id),
        ]);
        setCharterManifest(null);
        setWatchAutoPaused(false);
        setSimbriefLaunchUrl(null);
        goToTab('staging');
      },
      { sync: { market: true } },
    );
  }

  function isCargoOpsCommodityLocked(commodityId: string): boolean {
    if (devMode) return false;
    const row =
      cargoOps?.commodities?.[
        commodityId as keyof NonNullable<typeof cargoOps>['commodities']
      ];
    return Boolean(row && !row.unlocked);
  }

  function enterStagingFromContract(lot: AirportLot) {
    const marketLot = lots.find((candidate) => candidate.id === lot.id);
    enterStaging(
      marketLot ?? {
        id: lot.id,
        originIcao: lot.originIcao,
        destIcao: lot.destIcao,
        originName: lot.originIcao,
        destName: lot.destIcao,
        distanceNm: lot.distanceNm,
        commodityId: lot.commodityId,
        commodityName: lot.commodityName,
        availableKg: lot.availableKg,
        payUsd: lot.payUsd,
        urgency: lot.urgency === 'urgent' ? 'urgent' : 'normal',
        reason: lot.reason,
        createdAtTick: lot.createdAtTick,
        expiresAtTick: lot.expiresAtTick,
        ticksRemaining: lot.ticksRemaining,
        perishable: lot.perishable,
        npcClaim: lot.npcClaim,
      },
    );
  }

  function exitStaging() {
    if (busy) return;
    setPendingActiveTour(null);
    setStagingFerryOpen(false);
    if (staging?.replaceManifest) {
      if (activeCareerProfile?.id) {
        clearPersistedStagingDraft(activeCareerProfile.id);
      }
      setStaging(null);
      goToTab('staging');
      return;
    }
    if (activeCareerProfile?.id) {
      clearPersistedStagingDraft(activeCareerProfile.id);
    }
    setStaging(null);
    // Keep Active Tour after Discard Manifest — Resume card → Base until Drop.
    if (airportReturn) {
      void returnToAirport();
      return;
    }
    goToTab('market');
  }

  async function onBackFromManifestEdit() {
    if (!staging?.replaceManifest || busy) return;
    const mission = missions.find((m) => m.id === staging.intoMissionId);
    if (stagingManifestEditDirty(staging, mission)) {
      const ok = await confirm({
        title: 'Leave manifest editor?',
        body: (
          <p>
            Unsaved cargo changes will be lost. Your accepted flight stays
            as-is until you save a new manifest.
          </p>
        ),
        confirmLabel: 'Back to Dispatch',
        cancelLabel: 'Keep editing',
      });
      if (!ok) return;
    }
    exitStaging();
  }

  async function onCancelStagingFlight() {
    if (!staging || busy) return;
    const blocking = findStagingBlockingMission(staging, missions);
    if (blocking) {
      await onCancel(blocking);
      return;
    }
    const ok = await confirm({
      title: staging.replaceManifest ? 'Discard manifest edits?' : 'Discard this manifest?',
      body: (
        <>
          <p>
            {staging.replaceManifest
              ? 'Staged changes will be cleared. The accepted flight stays open until you cancel it from Dispatch.'
              : staging.deskHold
                ? 'This desk hold stays reserved on Hauls until you Accept here, Cancel on Hauls, or the hold expires. Discarding only leaves Manifest.'
                : 'Your staged cargo lines will be cleared. No flight has been accepted yet.'}
          </p>
        </>
      ),
      confirmLabel: staging.replaceManifest ? 'Discard edits' : 'Discard manifest',
      cancelLabel: 'Keep editing',
      tone: 'danger',
    });
    if (!ok) return;
    exitStaging();
  }

  async function enterEditManifest(mission: Mission) {
    if (mission.contractPilot) {
      setError(
        'Crew offers lock cargo at accept (route-limited lift). Cancel and re-accept to change airframe/lift.',
      );
      return;
    }
    if (!['accepted', 'dispatched'].includes(mission.status)) {
      setError('Only accepted or dispatched flights can edit the manifest');
      return;
    }
    if (watch?.running && watch.missionId === mission.id) {
      try {
        await postWatchStop({ reset: true });
        setWatch(null);
        setWatchAutoPaused(true);
        setWatchAutoStatus('idle');
      } catch {
        /* ignore — still allow edit */
      }
    }
    const missionLots = mission.lots?.length
      ? mission.lots
      : [
          {
            shipmentLotId: mission.shipmentLotId ?? '',
            commodityId: mission.commodityId,
            cargoKg: mission.cargoKg,
            payUsd: mission.payUsd,
            urgency: mission.urgency,
            reason: mission.reason,
            deadlineTick: mission.deadlineTick,
          },
        ];
    // Repair legacy/corrupted manifests before editing: zero-weight ghost lines
    // are discarded and duplicate shipment IDs become one independent control.
    const editableLots = new Map<string, (typeof missionLots)[number]>();
    for (const line of missionLots) {
      if (!line.shipmentLotId || line.cargoKg <= 0) continue;
      const existing = editableLots.get(line.shipmentLotId);
      editableLots.set(
        line.shipmentLotId,
        existing
          ? {
              ...existing,
              cargoKg: existing.cargoKg + line.cargoKg,
              payUsd: existing.payUsd + line.payUsd,
              urgency:
                existing.urgency === 'urgent' || line.urgency === 'urgent'
                  ? 'urgent'
                  : 'normal',
              deadlineTick: Math.min(existing.deadlineTick, line.deadlineTick),
            }
          : { ...line },
      );
    }
    const lines: StagingLine[] = [];
    for (const line of editableLots.values()) {
      const market = lots.find((lot) => lot.id === line.shipmentLotId);
      const demandMax =
        typeof mission.demandEditMaxKg === 'number' &&
        Number.isFinite(mission.demandEditMaxKg) &&
        mission.demandEditMaxKg > 0
          ? Math.floor(mission.demandEditMaxKg)
          : undefined;
      const availableKg = manifestEditAvailableKg({
        bookedKg: line.cargoKg,
        lotQuantityKg: line.lotQuantityKg ?? market?.quantityKg,
        marketAvailableKg: market?.availableKg,
        demandMaxKg: demandMax,
      });
      const fullLotPayUsd =
        market?.payUsd ??
        (line.cargoKg > 0 && availableKg > line.cargoKg
          ? Math.max(1, Math.round((line.payUsd * availableKg) / line.cargoKg))
          : line.payUsd);
      const lot: MarketLot = market
        ? {
            ...market,
            quantityKg: Math.max(market.quantityKg ?? 0, availableKg),
            availableKg,
            payUsd: market.payUsd,
          }
        : {
            id: line.shipmentLotId,
            originIcao: mission.originIcao,
            destIcao: mission.destIcao,
            originName: mission.originIcao,
            destName: mission.destIcao,
            commodityId: line.commodityId,
            commodityName: line.commodityId,
            quantityKg: availableKg,
            availableKg,
            payUsd: fullLotPayUsd,
            urgency: line.urgency === 'urgent' ? 'urgent' : 'normal',
            reason: line.reason,
            expiresAtTick: line.deadlineTick,
            ticksRemaining: Math.max(0, line.deadlineTick - tick),
          };
      lines.push({ lot, cargoKg: line.cargoKg });
    }
    if (lines.length === 0) {
      setError('This flight has no cargo lines to edit');
      return;
    }
    const draft: StagingDraft = {
      originIcao: mission.originIcao,
      destIcao: mission.destIcao,
      originName:
        lots.find((lot) => lot.originIcao === mission.originIcao)?.originName ??
        mission.originIcao,
      destName:
        lots.find((lot) => lot.destIcao === mission.destIcao)?.destName ??
        mission.destIcao,
      aircraft: mission.aircraftClassId as AircraftClass,
      aircraftId: mission.aircraftId,
      intoMissionId: mission.id,
      replaceManifest: true,
      lines,
    };
    setStaging(draft);
    setPreferredAircraft(draft.aircraft);
    setError(null);
    setAirportReturn(null);
    goToTab('staging');
  }

  function changeStagingAircraft(nextAircraftId: string) {
    if (!staging || busy || nextAircraftId === staging.aircraftId) return;
    if (staging.replaceManifest || staging.intoMissionId) return;
    const selected =
      findOpsEntry(opsFleetEntries, nextAircraftId)?.aircraft ??
      vaSessionFleet.find((aircraft) => aircraft.id === nextAircraftId) ??
      fleet.find((aircraft) => aircraft.id === nextAircraftId);
    if (!selected) return;
    // Allow off-origin parked airframes — Ferry CTA on Manifest brings them in.
    if (
      selected.status !== 'parked' &&
      selected.id !== staging.aircraftId
    ) {
      return;
    }
    const atOrigin =
      selected.status === 'parked' &&
      selected.locationIcao.trim().toUpperCase() ===
        staging.originIcao.trim().toUpperCase();
    const next = selected.aircraftClassId;
    const openFlight = atOrigin
      ? openFlightForRoute(
          staging.originIcao,
          staging.destIcao,
          next,
          selected.id,
        )
      : undefined;
    // Drop stale live ops cap from the previous tail (C152 operationalMax=0
    // must not clamp Duke lines to 0 while /api/cargo-limit is in flight).
    cargoLimitRequestGenRef.current += 1;
    setMaxCargoKg(null);
    setMaxCargoBoundAircraftId(null);
    setStructuralMaxCargoKg(null);
    setEstimatedBlockFuelKg(null);
    setEstimatedFuelCostUsd(null);
    setEstimatedFuelUnitPriceUsd(null);
    setEstimatedFuelScarcity(null);
    setRouteFuelCapacityKg(null);
    setRouteFuelDeficitKg(null);
    setRouteFuelFeasible(null);
    setMaxCargoSource(null);
    setAirframeLabel(null);
    setMxFuelBurn(null);

    const fallbackCap = fallbackMaxCargoKg(next);
    let remaining = fallbackCap;
    if (openFlight && !staging.replaceManifest) {
      remaining = Math.max(0, remaining - (openFlight.cargoKg ?? 0));
    }
    const lines = staging.lines.map((line) => {
      const maxKg = Math.max(
        0,
        Math.floor(Math.min(line.lot.availableKg, remaining)),
      );
      let cargoKg = Math.min(line.cargoKg, maxKg);
      if (cargoKg <= 0 && maxKg > 0) cargoKg = defaultStagingKg(maxKg);
      remaining = Math.max(0, remaining - cargoKg);
      return { ...line, cargoKg };
    });
    let deskHold = staging.deskHold;
    if (deskHold) {
      const holdKg = Math.max(0, Math.floor(deskHold.kg));
      const maxLoad = Math.max(0, Math.floor(Math.min(holdKg, remaining)));
      const raw = deskHoldEffectiveLoadKg(deskHold);
      const loadKg =
        maxLoad <= 0
          ? 0
          : Math.max(1, Math.min(maxLoad, raw > 0 ? raw : maxLoad));
      deskHold = { ...deskHold, loadKg };
    }
    setStaging({
      ...staging,
      aircraft: next,
      aircraftId: selected.id,
      intoMissionId: openFlight?.id,
      lines,
      deskHold,
    });
    setPreferredAircraft(next);
    setStagingFerryOpen(false);
  }

  function updateStagingDeskHoldKg(rawKg: number) {
    setStaging((current) => {
      if (!current?.deskHold) return current;
      const holdKg = Math.max(0, Math.floor(current.deskHold.kg));
      const maxLoad = Math.max(
        0,
        Math.floor(Math.min(holdKg, aircraftCapKg(current.aircraft))),
      );
      const loadKg =
        maxLoad <= 0
          ? 0
          : Math.max(1, Math.min(maxLoad, Math.floor(rawKg) || 0));
      return {
        ...current,
        deskHold: { ...current.deskHold, loadKg },
      };
    });
  }

  function setStagingDeskHoldFraction(fraction: number) {
    setStaging((current) => {
      if (!current?.deskHold) return current;
      const holdKg = Math.max(0, Math.floor(current.deskHold.kg));
      const maxLoad = Math.max(
        0,
        Math.floor(Math.min(holdKg, aircraftCapKg(current.aircraft))),
      );
      if (maxLoad <= 0) {
        return {
          ...current,
          deskHold: { ...current.deskHold, loadKg: 0 },
        };
      }
      const loadKg =
        fraction >= 1
          ? maxLoad
          : Math.max(1, Math.min(maxLoad, Math.round(maxLoad * fraction)));
      return {
        ...current,
        deskHold: { ...current.deskHold, loadKg },
      };
    });
  }

  function updateStagingLineKg(lotId: string, rawKg: number) {
    setStaging((current) => {
      if (!current) return current;
      return {
        ...current,
        lines: current.lines.map((line) => {
          if (line.lot.id !== lotId) return line;
          const maxKg = lineMaxKg(current, line.lot);
          const cargoKg =
            maxKg <= 0
              ? 0
              : Math.max(1, Math.min(maxKg, Math.floor(rawKg) || 0));
          return { ...line, cargoKg };
        }),
      };
    });
  }

  function setStagingLineFraction(lotId: string, fraction: number) {
    setStaging((current) => {
      if (!current) return current;
      const target = current.lines.find((line) => line.lot.id === lotId);
      if (!target) return current;
      const maxKg = lineMaxKg(current, target.lot);
      const cargoKg =
        maxKg <= 0
          ? 0
          : fraction >= 1
            ? maxKg
            : Math.max(
                1,
                Math.min(maxKg, Math.round(maxKg * fraction)),
              );
      return {
        ...current,
        lines: current.lines.map((line) =>
          line.lot.id === lotId ? { ...line, cargoKg } : line,
        ),
      };
    });
  }

  function removeStagingLine(lotId: string) {
    setStaging((current) => {
      if (!current) return current;
      const lines = current.lines.filter((line) => line.lot.id !== lotId);
      if (lines.length === 0) return null;
      return { ...current, lines };
    });
  }

  function addLotToStaging(lot: MarketLot) {
    if (isCargoOpsCommodityLocked(lot.commodityId)) {
      setError(
        `Cargo Ops: ${lot.commodityName} is locked — unlock it in Hangar → Cargo Ops`,
      );
      return;
    }
    setStaging((current) => {
      if (!current) return current;
      if (lot.originIcao !== current.originIcao || lot.destIcao !== current.destIcao) {
        return current;
      }
      if (current.lines.some((line) => line.lot.id === lot.id)) return current;
      const existingCount =
        (current.intoMissionId && !current.replaceManifest
          ? missions.find((m) => m.id === current.intoMissionId)?.lots?.length ?? 0
          : 0) + current.lines.length;
      if (existingCount >= MAX_STAGING_LOTS) return current;
      const maxKg = lineMaxKg(current, lot);
      if (maxKg <= 0) return current;
      return {
        ...current,
        lines: [...current.lines, { lot, cargoKg: defaultStagingKg(maxKg) }],
      };
    });
  }

  async function onCommitStaging() {
    if (!staging) return;
    if (staging.deskHold) {
      const hold = staging.deskHold;
      const aircraftId = staging.aircraftId?.trim();
      if (!aircraftId) return;
      const assigned =
        findOpsEntry(opsFleetEntries, aircraftId)?.aircraft ??
        vaSessionFleet.find((a) => a.id === aircraftId) ??
        fleet.find((a) => a.id === aircraftId);
      const atOrigin =
        Boolean(assigned) &&
        assigned!.status === 'parked' &&
        assigned!.locationIcao.trim().toUpperCase() ===
          staging.originIcao.trim().toUpperCase();
      if (!atOrigin) return;
      await run(async () => {
        const opsCompanyId = resolveOpsCompanyId(aircraftId);
        const vaOps =
          Boolean(memberVaCompanyIdRef.current) &&
          opsCompanyId === memberVaCompanyIdRef.current;
        const loadKg = deskHoldEffectiveLoadKg(hold);
        const result =
          hold.kind === 'bridge'
            ? await postWarehouseBridgeDispatchHold({
                holdId: hold.id,
                aircraftId,
                kg: loadKg,
                companyId: opsCompanyId,
              })
            : hold.kind === 'haul'
              ? await postWarehouseHaulDispatchHold({
                  holdId: hold.id,
                  aircraftId,
                  kg: loadKg,
                  companyId: opsCompanyId,
                })
              : await postDemandDispatchHold({
                  holdId: hold.id,
                  aircraftId,
                  kg: loadKg,
                  companyId: opsCompanyId,
                });
        if (result.fleet) {
          paintOpsMutationFleet(result.fleet, opsCompanyId);
        }
        if (result.missions?.length) {
          setMissions(result.missions.slice().reverse());
        } else if (result.mission) {
          setMissions((prev) => {
            const idx = prev.findIndex((m) => m.id === result.mission.id);
            if (idx >= 0) {
              const next = prev.slice();
              next[idx] = result.mission;
              return next;
            }
            return [result.mission, ...prev];
          });
        }
        if (typeof result.walletUsd === 'number') {
          if (vaOps) setVaSessionWallet(result.walletUsd);
          else commitWallet(result.walletUsd);
        }
        if (vaOps && memberVaCompanyIdRef.current) {
          await switchCompanyForVa(memberVaCompanyIdRef.current);
        }
        if (activeCareerProfile?.id) {
          clearPersistedStagingDraft(activeCareerProfile.id);
        }
        setStaging(null);
        setWatchAutoPaused(false);
        setSimbriefLaunchUrl(null);
        goToTab('staging');
        const payNote =
          hold.kind === 'bridge' &&
          'pilotPayUsd' in result &&
          typeof result.pilotPayUsd === 'number'
            ? ` · pilot ${formatMoney(result.pilotPayUsd)}`
            : 'payUsd' in result && typeof result.payUsd === 'number'
              ? ` · ${formatMoney(result.payUsd)}`
              : '';
        setToastKind('ok');
        setToast(
          `Desk hold ${result.mission.originIcao}→${result.mission.destIcao} · ${formatTonnes(result.kg)}${payNote} · open Dispatch`,
        );
      });
      return;
    }
    if (staging.lines.length === 0) return;
    // Refresh free kg from the board, then clamp sliders (never send quantityKg as avail).
    let refreshed: StagingDraft = {
      ...staging,
      lines: staging.lines.map((line) => ({
        ...line,
        lot: stagingResolvedLot(
          staging,
          line.lot,
          missions,
          stagingRouteLots,
          lots,
        ),
      })),
    };

    // Tour Manifest: planned lot often empties after Search — rebind same OD.
    const pendingTour = pendingActiveTourRef.current;
    if (pendingTour) {
      const healedLines = refreshed.lines.map((line) => {
        const avail = Math.max(0, Math.floor(line.lot.availableKg ?? 0));
        if (avail >= 1 && line.cargoKg <= avail) return line;
        const wantKg = Math.max(line.cargoKg, 1);
        const alt = findSameRouteAlternateLot(
          refreshed.originIcao,
          refreshed.destIcao,
          wantKg,
          [
            line.lot.id,
            ...tourLegExcludeLotIds(pendingTour.legIndex),
          ],
          [...stagingRouteLots, ...lots],
        );
        if (!alt) return line;
        patchPendingTourLegLot(
          pendingTour.legIndex,
          alt.id,
          Math.min(alt.availableKg, wantKg),
        );
        return {
          lot: { ...alt, reason: alt.reason || 'tour leg (rebound)' },
          cargoKg: Math.min(wantKg, alt.availableKg),
        };
      });
      if (
        healedLines.some((line, i) => line.lot.id !== refreshed.lines[i]?.lot.id)
      ) {
        refreshed = { ...refreshed, lines: healedLines };
        setStaging(refreshed);
        setToastKind('warn');
        setToast('Planned tour lot was taken — rebound to live freight on this route');
      }
    }

    const clamped = clampDraftToCapacity(refreshed);
    if (clamped.lines.some((line) => line.cargoKg <= 0)) {
      setToastKind('fail');
      setToast(
        pendingTour
          ? 'No free freight left on this tour leg — Search again or Drop tour'
          : 'One or more lots no longer have free cargo — refresh Freights or lower the slider',
      );
      setStaging(clamped);
      return;
    }
    if (
      clamped.lines.some(
        (line, i) => line.cargoKg !== staging.lines[i]?.cargoKg,
      )
    ) {
      setStaging(clamped);
    }
    await run(
      async () => {
        try {
          const opsCompanyId = resolveOpsCompanyId(clamped.aircraftId);
          const vaOps =
            Boolean(memberVaCompanyIdRef.current) &&
            opsCompanyId === memberVaCompanyIdRef.current;
          // Commit with explicit companyId first — do not wait on VA session
          // pin (that was stacking ~session open ahead of the world write).
          const result = await postStagingCommit({
            aircraft: clamped.aircraft,
            aircraftId: clamped.aircraftId,
            missionId: clamped.intoMissionId,
            openDispatch: false,
            replace: Boolean(clamped.replaceManifest),
            weightSystem,
            companyId: opsCompanyId,
            lines: clamped.lines.map((line) => ({
              lotId: line.lot.id,
              cargoKg: line.cargoKg,
            })),
          });
          if (result.fleet) {
            paintOpsMutationFleet(result.fleet, opsCompanyId);
          }
          if (result.mission) {
            setMissions((prev) => {
              const idx = prev.findIndex((m) => m.id === result.mission.id);
              if (idx >= 0) {
                const next = prev.slice();
                next[idx] = result.mission;
                return next;
              }
              return [result.mission, ...prev];
            });
          }
          if (typeof result.walletUsd === 'number') {
            if (vaOps) setVaSessionWallet(result.walletUsd);
            else commitWallet(result.walletUsd);
          }
          // Pin VA for Dispatch/OFP after paint so Accept is not blocked on it.
          if (vaOps && memberVaCompanyIdRef.current) {
            await switchCompanyForVa(memberVaCompanyIdRef.current);
          }
          if (activeCareerProfile?.id) {
            clearPersistedStagingDraft(activeCareerProfile.id);
          }
          setStaging(null);
          setWatchAutoPaused(false);
          if (result.replaced || result.mission) {
            setSimbriefLaunchUrl(null);
          }
          // Mission appears on Dispatch — no success toast / mission-id noise.
          goToTab('staging');
          const pending = pendingActiveTourRef.current;
          if (
            pending &&
            typeof pending === 'object' &&
            result.mission?.id
          ) {
            setPendingActiveTour(null);
            try {
              if (pending.kind === 'start') {
                const attached = await postBaseDispatchTours({
                  action: 'attach',
                  missionId: result.mission.id,
                  aircraftId:
                    result.mission.aircraftId ??
                    pending.aircraftId ??
                    clamped.aircraftId,
                  hubIcao: pending.hubIcao,
                  tourId: pending.tourId,
                  routeLabel: pending.routeLabel,
                  tourLegs: pending.tourLegs,
                });
                setActiveTour(attached.activeTour ?? null);
                if (attached.playerFbos) setPlayerFbos(attached.playerFbos);
                if (attached.missions) {
                  setMissions(attached.missions.slice().reverse());
                }
              } else if (
                pending.kind === 'bind' &&
                pending.legIndex != null
              ) {
                const bound = await postBaseDispatchTours({
                  action: 'bind-leg',
                  missionId: result.mission.id,
                  legIndex: pending.legIndex,
                });
                setActiveTour(bound.activeTour ?? null);
                if (bound.playerFbos) setPlayerFbos(bound.playerFbos);
                if (bound.missions) {
                  setMissions(bound.missions.slice().reverse());
                }
              } else {
                setToastKind('fail');
                setToast('Tour bind failed — missing leg index; open Base and Refresh');
              }
            } catch (attachErr) {
              setToastKind('fail');
              setToast(
                attachErr instanceof Error
                  ? attachErr.message
                  : String(attachErr),
              );
            }
          }
        } catch (err) {
          // `run()` already paints `error` — do not also toast the same string.
          throw err;
        }
      },
      // Paint from commit response; only re-fetch the freight board (lots claimed).
      { sync: { market: true } },
    );
  }

  async function onAcceptContractPilot(lot: {
    id: string;
    originIcao?: string;
    destIcao?: string;
    npcClaim?: {
      crewNeeded?: boolean;
      crewReposition?: boolean;
      pilotFeeUsd?: number;
      npcName?: string;
      cargoKg?: number;
      aircraftClassId?: string;
    } | null;
  }) {
    if (!lot.npcClaim?.crewNeeded) return;
    const isRepo = Boolean(lot.npcClaim.crewReposition);
    const selectedRef = { current: '' };
    const ok = await confirm({
      title: isRepo ? 'Choose aircraft for ferry' : 'Choose aircraft for contract',
      confirmLabel: isRepo ? 'Ferry' : 'Fly',
      cancelLabel: 'Cancel',
      confirmDisabled: true,
      body: (
        <ContractPilotPick
          lotId={lot.id}
          isRepo={isRepo}
          originIcao={lot.originIcao}
          destIcao={lot.destIcao}
          cargoKg={lot.npcClaim.cargoKg}
          aircraftClassId={lot.npcClaim.aircraftClassId}
          formatTonnes={formatTonnes}
          formatMoney={formatMoney}
          selectedRef={selectedRef}
          onReadyChange={(ready) => setConfirmDisabled(!ready)}
        />
      ),
    });
    if (!ok) return;
    if (!selectedRef.current) {
      setToastKind('fail');
      setToast('Pick an airframe before flying');
      return;
    }
    await run(async () => {
      const result = await postContractPilotAccept({
        lotId: lot.id,
        airframeTypeId: selectedRef.current,
        openDispatch: false,
      });
      if (result.mission) {
        setMissions((prev) => {
          const idx = prev.findIndex((m) => m.id === result.mission.id);
          if (idx >= 0) {
            const next = prev.slice();
            next[idx] = result.mission;
            return next;
          }
          return [result.mission, ...prev];
        });
      }
      if (typeof result.walletUsd === 'number') commitWallet(result.walletUsd);
      if (result.pilotIcao) setPilotIcao(result.pilotIcao);
      setStaging(null);
      setWatchAutoPaused(false);
      const fee = formatMoney(result.pilotFeeUsd);
      const op = result.npcName ?? lot.npcClaim?.npcName ?? 'operator';
      const air = result.airframeLabel ? ` · ${result.airframeLabel}` : '';
      const split =
        (result.remainderKg ?? 0) > 0
          ? result.remainderOpenOnBoard
            ? ` · you ${formatTonnes(result.liftedKg ?? 0)}, ${formatTonnes(result.remainderKg ?? 0)} left on board`
            : ` · you ${formatTonnes(result.liftedKg ?? 0)}, NPC ${formatTonnes(result.remainderKg ?? 0)}`
          : ` · ${formatTonnes(result.liftedKg ?? result.mission.cargoKg)}`;
      const reposition = result.pilotRelocatedFrom
        ? ` · operator covered travel ${result.pilotRelocatedFrom}→${result.pilotIcao ?? result.mission.originIcao}`
        : '';
      // Fee + split are not obvious on the Dispatch card — keep that money signal.
      setToastKind('ok');
      setToast(
        `${isRepo ? 'Ferry' : 'Contract'} accepted · fee ${fee} (${op})${air}${split}${reposition}`,
      );
      goToTab('staging');
    }, { sync: { market: true } });
  }

  async function onDispatch(mission: Mission) {
    // Always rebuild the SimBrief URL (Bonanza A36 vs A36TC → BE36 vs BT36).
    // Re-using a cached href kept the wrong type after switching glass.
    // Browser: reserve a tab under this click so await does not drop the gesture.
    const pendingTab = reserveSimBriefBrowserTab();
    setBusy(true);
    setError(null);
    try {
      const result = await postDispatch({
        missionId: mission.id,
        open: true,
        weightSystem,
        liveTitle: simBridgeRef.current?.aircraftTitle ?? null,
        companyId: resolveOpsCompanyId(mission.aircraftId) || undefined,
      });
      if (result.mission) {
        setMissions((current) =>
          current.map((m) => (m.id === result.mission.id ? result.mission : m)),
        );
      }
      const href = typeof result.url === 'string' ? result.url.trim() : '';
      if (!href) {
        if (pendingTab && !pendingTab.closed) {
          try {
            pendingTab.close();
          } catch {
            /* ignore */
          }
        }
        throw new Error(
          'Dispatch saved, but no SimBrief URL came back — try Re-open SimBrief',
        );
      }
      setSimbriefLaunchUrl(href);
      let opened = navigateReservedSimBriefTab(pendingTab, href);
      if (!opened) {
        opened = await openSimBriefDispatchUrl(href);
      }
      if (!opened) {
        try {
          await navigator.clipboard.writeText(href);
        } catch {
          /* ignore */
        }
        setToastKind('warn');
        setToast(
          'Dispatch ready · browser did not auto-open — URL copied if clipboard allows; use Re-open SimBrief.',
        );
      }
      // Happy path: SimBrief tab + Dispatch card are enough — no success toast.
      void refresh({ missions: true }).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        if (shouldSurfaceApiError(message)) setError(message);
      });
    } catch (err) {
      if (pendingTab && !pendingTab.closed) {
        try {
          pendingTab.close();
        } catch {
          /* ignore */
        }
      }
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setToastKind('fail');
      setToast(message);
    } finally {
      setBusy(false);
    }
  }

  async function onOpenSimbriefLaunchUrl() {
    const href = simbriefLaunchUrl?.trim();
    if (!href) return;
    const opened = await openSimBriefDispatchUrl(href);
    if (!opened) {
      try {
        await navigator.clipboard.writeText(href);
      } catch {
        /* ignore */
      }
      setToastKind('warn');
      setToast(
        'Browser still did not open — paste the copied SimBrief URL into Chrome/Edge.',
      );
      return;
    }
  }

  async function onRefreshOfpBriefing(mission: Mission) {
    const username = simbriefUser.trim();
    if (!username) {
      throw new Error('Enter SimBrief username in Settings first');
    }
    const result = await postConfirmOfp({
      missionId: mission.id,
      simbriefUser: username,
      companyId: resolveOpsCompanyId(mission.aircraftId) || undefined,
    });
    setMissions((current) =>
      current.map((m) => (m.id === result.mission.id ? result.mission : m)),
    );
    const wptCount = result.mission.lastOfpCheck?.briefing?.waypoints?.length ?? 0;
    const diag = result.ofp.navlogDiag;
    if (wptCount > 0) {
      // Route map updates in place — no toast.
      return;
    }
    setToastKind('warn');
    if (diag && !diag.present) {
      setToast(
        'SimBrief OFP has no navlog — re-open SimBrief (Detailed Navlog is now forced), generate again, then Load navlog',
      );
    } else if (diag && diag.fixCount > 0 && diag.withCoords === 0) {
      setToast(
        `Navlog has ${diag.fixCount} fixes but no coordinates — enable Detailed Navlog and regenerate the OFP`,
      );
    } else {
      setToast('OFP refreshed without route fixes — regenerate with Detailed Navlog');
    }
  }

  async function onAcceptOfpCargo(mission: Mission) {
    const username = simbriefUser.trim();
    if (!username) {
      setToastKind('fail');
      setToast('Enter SimBrief username in Settings first');
      return;
    }
    await run(async () => {
      const result = await postAcceptOfpCargo({
        missionId: mission.id,
        simbriefUser: username,
        companyId: resolveOpsCompanyId(mission.aircraftId) || undefined,
      });
      // Cargo changed — next Open SimBrief must rebuild the dispatch URL.
      setSimbriefLaunchUrl(null);
      setMissions((current) =>
        current.map((m) => (m.id === result.mission.id ? result.mission : m)),
      );
      const released = formatTonnes(result.releasedKg);
      const payDelta = result.payAfterUsd - result.payBeforeUsd;
      const payBit =
        payDelta === 0
          ? 'pay unchanged'
          : `pay ${formatMoney(result.payAfterUsd)} (${payDelta < 0 ? '−' : '+'}${formatMoney(Math.abs(payDelta))})`;
      setToastKind(result.check.verdict === 'fail' ? 'warn' : 'ok');
      setToast(
        `Accepted OFP cargo · released ${released} to the board · ${payBit} · OFP ${result.check.verdict.toUpperCase()}`,
      );
    }, { sync: { market: true } });
  }

  async function onCancel(mission: Mission) {
    const airborne = mission.status === 'in_flight';
    const ok = await confirm({
      title: airborne ? 'Abort this flight?' : 'Cancel this flight?',
      body: airborne ? (
        <p>No payout — cargo returns to the market.</p>
      ) : (
        <p>No payout. Reserved cargo returns to the market.</p>
      ),
      confirmLabel: airborne ? 'Yes, abort flight' : 'Yes, cancel flight',
      cancelLabel: 'Keep flying',
      tone: 'danger',
    });
    if (!ok) return;
    await run(async () => {
      // Clear active flight immediately so auto-OFP / Preflight / Watch polls stop.
      setMissions((current) =>
        current.map((m) =>
          m.id === mission.id ? { ...m, status: 'cancelled' } : m,
        ),
      );
      setFlightDebrief(null);
      setStaging(null);
      try {
        await postWatchStop({ reset: true });
        setWatch(null);
      } catch {
        /* watch may already be idle */
        setWatch(null);
      }
      const result = await postCancel({
        missionId: mission.id,
        companyId: resolveOpsCompanyId(mission.aircraftId) || undefined,
      });
      setMissions((current) =>
        current.map((m) => (m.id === result.mission.id ? result.mission : m)),
      );
      commitWallet(result.walletUsd);
      if (result.activeTour !== undefined) {
        setActiveTour(result.activeTour ?? null);
      }
      const tourHint =
        result.activeTour?.status === 'active'
          ? result.activeTour.resumeHint
          : null;
      if (tourHint) {
        setToastKind(
          result.activeTour?.resumeState === 'stranded' || result.warning
            ? 'warn'
            : 'ok',
        );
        setToast(
          result.returnedToMarket
            ? `Cancelled · ${formatTonnes(result.releasedKg)} released · ${tourHint}`
            : `Cancelled · ${tourHint}`,
        );
      } else {
        setToastKind(result.warning ? 'warn' : 'ok');
        setToast(
          result.returnedToMarket
            ? `Cancelled · ${formatTonnes(result.releasedKg)} released to market`
            : `Cancelled · ${result.warning ?? 'no active lot to release'}`,
        );
      }
      goToTab('staging');
    }, { sync: { market: true } });
  }

  async function onAcceptBushTrip(trip: BushTripBoardRow) {
    if (!trip.playable) {
      setToastKind('warn');
      setToast('Draft trip — confirm strips in MSFS before Accept');
      return;
    }
    const eligible = fleet.filter(
      (a) =>
        a.status === 'parked' &&
        a.aircraftClassId === 'light_ga' &&
        a.locationIcao === trip.startIcao,
    );
    const aircraftId = eligible[0]?.id;
    if (!aircraftId) {
      setToastKind('warn');
      setToast(
        `Park a light GA at ${trip.startIcao} (pilot co-located) before accepting`,
      );
      return;
    }
    await run(async () => {
      const result = await postBushTripAccept({ tripId: trip.id, aircraftId });
      if (Array.isArray(result.fleet)) setFleet(result.fleet);
      commitWallet(result.walletUsd);
      await refreshBushTrips();
      selectTab('staging');
    });
  }

  async function onAbandonBushTrip() {
    if (!activeBushTrip) return;
    const ok = await confirm({
      title: 'Abandon this bush trip?',
      body: (
        <>
          <p>
            <strong>{activeBushTrip.title}</strong> ·{' '}
            {activeBushTrip.fromIcao}→{activeBushTrip.toIcao} (leg{' '}
            {activeBushTrip.legIndex + 1}/{activeBushTrip.legs}).
          </p>
          <p>No payout in this build. Aircraft returns to parked.</p>
        </>
      ),
      confirmLabel: 'Yes, abandon trip',
      cancelLabel: 'Keep trip',
      tone: 'danger',
    });
    if (!ok) return;
    await run(async () => {
      const result = await postBushTripAbandon();
      if (Array.isArray(result.fleet)) setFleet(result.fleet);
      commitWallet(result.walletUsd);
      setActiveBushTrip(null);
      setBushWatch(null);
      await refreshBushTrips();
      setToastKind('ok');
      setToast('Bush trip abandoned — no payout');
    });
  }

  function onToggleSkylineInject(enabled: boolean) {
    if (!enabled) {
      setSkylineInjectEnabled(false);
      if (loadOfpAutoStatus === 'loading') {
        void onCancelInject();
      } else if (loadOfpAutoStatus === 'done') {
        setLoadOfpAutoStatus('idle');
        setLoadOfpAutoError(null);
        setLoadOfpProgress(null);
      } else if (loadOfpAutoStatus === 'failed') {
        // Keep status=failed so the Skyline inject switch stays visible for retry
        // (loadPath can be efb while injectCapable still allows Skyline inject).
        setLoadOfpAutoError(
          'Inject failed — turn Airframe inject on to retry.',
        );
        setLoadOfpProgress(null);
      }
      return;
    }
    if (!activeMission) return;
    if (!simBridge?.connected) {
      setToastKind('warn');
      setToast('Start SimBridge before enabling Airframe inject');
      return;
    }
    if (simBridge.onGround === false) {
      setToastKind('warn');
      setToast('Aircraft must be on ground to inject fuel and payload');
      return;
    }
    setSkylineInjectEnabled(true);
    setLoadOfpAutoError(null);
    void onLoadFuelAndPayload(activeMission);
  }

  async function onCancelInject() {
    const missionId = activeMission?.id;
    if (!missionId || loadOfpAutoStatus !== 'loading') {
      setSkylineInjectEnabled(false);
      return;
    }
    // Flip UI immediately — cancel stops inject + rebalance + verify.
    setSkylineInjectEnabled(false);
    setLoadOfpAutoStatus('failed');
    setLoadOfpAutoError('Cancelling…');
    setLoadOfpProgress((prev) =>
      prev
        ? {
            ...prev,
            phase: 'failed',
            message: 'Cancel requested — stopping…',
            updatedAtIso: new Date().toISOString(),
          }
        : {
            missionId,
            phase: 'failed',
            message: 'Cancel requested — stopping…',
            updatedAtIso: new Date().toISOString(),
          },
    );
    loadOfpControlRef.current?.stop();
    ofpInjectInFlightRef.current = false;
    try {
      // Tell the server first so long settle loops see the flag.
      await postCancelLoadOfp(missionId);
    } catch {
      /* soft — local stop still applies */
    }
    loadOfpControlRef.current?.abort.abort();
    setLoadOfpAutoError('Inject cancelled');
    setLoadOfpProgress(null);
    setToastKind('warn');
    setToast('Inject cancelled');
  }

  async function onLoadFuelAndPayload(mission: Mission) {
    const username = simbriefUser.trim();
    if (!username) {
      setSkylineInjectEnabled(false);
      setToastKind('warn');
      setToast('Enter SimBrief username before loading fuel and payload');
      return;
    }
    if (ofpInjectInFlightRef.current) return;
    const abort = new AbortController();
    loadOfpControlRef.current = {
      stop: () => {
        /* manual path uses abort + status */
      },
      abort,
    };
    ofpInjectInFlightRef.current = true;
    setSkylineInjectEnabled(true);
    setLoadOfpAutoStatus('loading');
    setLoadOfpAutoError(null);
    setLoadOfpProgress(null);
    let succeeded = false;
    let failureMessage: string | null = null;
    let userCancelled = false;
    await run(
      async () => {
      try {
        const result = await postLoadOfp(
          {
            missionId: mission.id,
            simbriefUser: username,
            runPreflightAfter: true,
            companyId: resolveOpsCompanyId(mission.aircraftId) || undefined,
          },
          { signal: abort.signal },
        );
        if (abort.signal.aborted) {
          userCancelled = true;
          return;
        }
        if (!result.ok) {
          if (result.error === 'Inject cancelled') {
            userCancelled = true;
            return;
          }
          throw new Error(result.error ?? 'Fuel and payload load failed');
        }
        succeeded = true;
        if (result.mission) {
          setMissions((current) =>
            current.map((m) =>
              m.id === result.mission.id ? result.mission : m,
            ),
          );
        }
        const injectReady = Boolean(
          result.mission?.lastPreflightCheck?.loadVerification?.ready,
        );
        // HTTP inject succeeded — use `done` while waiting for live sample;
        // reserve `failed` for hard errors (cancel, rollback, verify throw).
        setSkylineInjectEnabled(false);
        setLoadOfpAutoStatus(injectReady ? 'idle' : 'done');
        injectFuelQuietUntilRef.current = Date.now() + 12_000;
        setLoadOfpAutoError(null);
        if (injectReady) {
          setLoadOfpProgress(null);
        }
        // Preflight / progress card already reflect inject — toast only when
        // live sample still needs to catch up.
        if (!injectReady) {
          setToastKind('ok');
          setToast('Fuel and payload written · waiting for live sample');
        }
      } catch (err) {
        if (abort.signal.aborted) {
          userCancelled = true;
          return;
        }
        failureMessage = err instanceof Error ? err.message : String(err);
        throw err;
      } finally {
        ofpInjectInFlightRef.current = false;
        if (loadOfpControlRef.current?.abort === abort) {
          loadOfpControlRef.current = null;
        }
      }
      },
    );
    if (userCancelled) {
      setSkylineInjectEnabled(false);
      setLoadOfpAutoStatus('failed');
      setLoadOfpAutoError('Inject cancelled');
      setLoadOfpProgress(null);
      return;
    }
    if (!succeeded) {
      setSkylineInjectEnabled(false);
      setLoadOfpAutoStatus('failed');
      setLoadOfpAutoError(failureMessage ?? 'Fuel and payload load failed');
      setLoadOfpProgress(null);
      return;
    }
    try {
      const status = await postWatchStart({
        missionId: mission.id,
        intervalSec: 5,
      });
      setWatch(status);
    } catch {
      /* auto-start effect retries */
    }
  }

  async function onBuyMissionFuel(mission: Mission) {
    setMissionFuelQuoteStatus('loading');
    await run(async () => {
      const opsCompanyId = resolveOpsCompanyId(mission.aircraftId);
      const result = await postFuelPurchase(mission.id, {
        companyId: opsCompanyId || undefined,
      });
      commitWallet(result.walletUsd);
      paintOpsMutationFleet(result.fleet, opsCompanyId);
      setMissions((current) =>
        current.map((m) => (m.id === result.mission.id ? result.mission : m)),
      );
      setMissionFuelQuote(null);
      setMissionFuelQuoteStatus('ready');
      setMissionFuelQuoteError(null);
      setToastKind(result.quote.uplift.scarcity === 'ok' ? 'ok' : 'warn');
      setToast(
        `Fuel purchased · ${formatMassExact(
          result.quote.shortfallKg,
          weightSystem,
        )} · −${formatMoney(result.fuelDebitUsd)} · continuing automatically`,
      );
    }, { sync: { airport: true } });
  }

  async function onDepart(mission: Mission) {
    let override = false;
    const preflightReady =
      mission.lastPreflightCheck?.loadVerification?.ready === true;
    const locationOk = mission.lastPreflightCheck?.location?.ok !== false;
    if (!mission.lastPreflightCheck || !preflightReady || !locationOk) {
      const loc = mission.lastPreflightCheck?.location;
      const locationLine =
        loc && loc.ok === false
          ? loc.distanceNm !== undefined
            ? `Aircraft is ${loc.distanceNm.toFixed(1)} nm from ${loc.originIcao} (need ≤${loc.radiusNm} nm). `
            : `${loc.code}: not verified at ${loc.originIcao}. `
          : '';
      const body = !mission.lastPreflightCheck
        ? `No Preflight check for ${mission.id}. Depart anyway?`
        : !locationOk && preflightReady
          ? `${locationLine}Fuel/payload are ready. Depart anyway?`
          : !locationOk
            ? `${locationLine}Preflight is not ready for ${mission.id}. Depart anyway without fixing fuel/payload/location?`
            : `Preflight is not ready for ${mission.id}. Depart anyway without fixing fuel/payload?`;
      const ok = await confirm({
        title: 'Depart with failed Preflight?',
        body,
        confirmLabel: 'Depart anyway',
        cancelLabel: 'Stay on ground',
        tone: 'warn',
      });
      if (!ok) return;
      override = true;
    }
    await run(async () => {
      const opsCompanyId = resolveOpsCompanyId(mission.aircraftId);
      const result = await postDepart({
        missionId: mission.id,
        override,
        companyId: opsCompanyId || undefined,
      });
      setMissions((current) =>
        current.map((m) => (m.id === result.mission.id ? result.mission : m)),
      );
      paintOpsMutationFleet(result.fleet, opsCompanyId);
      if (typeof result.walletUsd === 'number') commitWallet(result.walletUsd);
      setToastKind(
        override || result.mission.fuelUplift?.scarcity === 'dry'
          ? 'warn'
          : result.mission.fuelUplift?.scarcity === 'partial'
            ? 'warn'
            : 'ok',
      );
      const fuelNote = result.mission.fuelUplift
        ? ` · fuel ${formatTonnes(result.mission.fuelUplift.requestedKg)} (−${formatMoney(result.mission.fuelUplift.costUsd)}${result.mission.fuelUplift.scarcity !== 'ok' ? ` · ${result.mission.fuelUplift.scarcity}` : ''})`
        : '';
      setToast(
        override
          ? `Departed ${result.mission.id} with preflight override · in_flight${fuelNote}`
          : `Departed ${result.mission.id} · in_flight${fuelNote}`,
      );
    }, { sync: { airport: true } });
  }

  async function onSettle(mission: Mission) {
    const ok = await confirm({
      title: 'Settle without MSFS?',
      body: `Deliver cargo to ${mission.destIcao} and credit the wallet now. Skips the live SimBridge arrival check.`,
      confirmLabel: 'Settle now',
      cancelLabel: 'Keep flying',
      tone: 'warn',
    });
    if (!ok) return;
    await run(async () => {
      const home = homeCompanyIdRef.current?.trim();
      const active = activeCompanyIdRef.current?.trim();
      const settlingVa = Boolean(home && active && home !== active);
      const opsCompanyId =
        resolveOpsCompanyId(mission.aircraftId) || active || home || undefined;
      const result = await postSettle({
        missionId: mission.id,
        companyId: opsCompanyId,
      });
      if (Array.isArray(result.fleet)) {
        if (settlingVa) setVaSessionFleet(result.fleet);
        else setFleet(result.fleet);
      }
      if (result.pilotIcao) setPilotIcao(result.pilotIcao);
      if (typeof result.walletUsd === 'number') commitWallet(result.walletUsd);
      if (result.activeTour !== undefined) {
        setActiveTour(result.activeTour ?? null);
      }
      if (result.charterActiveTour !== undefined) {
        setCharterActiveTour(result.charterActiveTour ?? null);
      }
      setMissions((current) =>
        current.map((m) => (m.id === result.mission.id ? result.mission : m)),
      );
      setWatch((prev) =>
        prev?.missionId === mission.id ? { ...prev, running: false } : prev,
      );
      const debrief = buildFlightDebrief({
        mission: result.mission.fuelUplift ? result.mission : mission,
        settlement: result.settlement,
      });
      playFlightSettledSound(mission.id);
      setFlightDebrief(debrief);
      setSettleOverlaySticky(false);
      setStaging(null);
      // After VA ops flight, restore home tenant for chrome boards.
      if (settlingVa && home) {
        try {
          await switchCompanyForVa(home);
        } catch {
          /* soft */
        }
      }
      goToTab('staging');
      // Debrief sheet is the settle summary — skip the duplicate toast.
    }, { sync: { missions: true } });
  }

  const cargoOptions = CARGO_OPS_FILTER_OPTIONS;
  const catalogByClass = useMemo(
    () => new Map(aircraftCatalog.map((c) => [c.id, c])),
    [aircraftCatalog],
  );

  function listingCatalogEntry(
    listing: AircraftListing,
  ): AircraftCatalogEntry | undefined {
    const classRow = catalogByClass.get(listing.aircraftClassId);
    const perf = listing.airframeTypeId
      ? airframePerf[listing.airframeTypeId]
      : undefined;
    if (!classRow && !perf) return undefined;
    return {
      id: listing.aircraftClassId,
      name: classRow?.name ?? listing.label,
      msrpUsd: classRow?.msrpUsd ?? 0,
      leaseMonthlyUsd: classRow?.leaseMonthlyUsd ?? 0,
      maxCargoKg: perf?.maxCargoKg ?? classRow?.maxCargoKg ?? 0,
      maxRangeNm: perf?.maxRangeNm ?? classRow?.maxRangeNm ?? 0,
      cruiseFuelFlowKgPerHour: perf?.cruiseFuelFlowKgPerHour,
      cruiseSpeedKt: perf?.cruiseSpeedKt,
      fuelBurnKgPerNm: perf?.fuelBurnKgPerNm,
      passengerSeats: perf?.cabin?.passengerSeats,
      dualLayout: perf?.cabin?.dualLayout,
      defaultCabinRole: perf?.cabin?.defaultRole,
    };
  }

  function hangarCatalogEntry(
    acf: PlayerAircraft,
  ): AircraftCatalogEntry | undefined {
    const classRow = catalogByClass.get(acf.aircraftClassId);
    const perf = acf.airframeTypeId
      ? airframePerf[acf.airframeTypeId]
      : undefined;
    if (!classRow && !perf) return undefined;
    return {
      id: acf.aircraftClassId,
      name: classRow?.name ?? acf.label,
      msrpUsd: classRow?.msrpUsd ?? 0,
      leaseMonthlyUsd: classRow?.leaseMonthlyUsd ?? 0,
      maxCargoKg: perf?.maxCargoKg ?? classRow?.maxCargoKg ?? 0,
      maxRangeNm: perf?.maxRangeNm ?? classRow?.maxRangeNm ?? 0,
      cruiseFuelFlowKgPerHour: perf?.cruiseFuelFlowKgPerHour,
      cruiseSpeedKt: perf?.cruiseSpeedKt,
      fuelBurnKgPerNm: perf?.fuelBurnKgPerNm,
      passengerSeats: perf?.cabin?.passengerSeats,
      dualLayout: perf?.cabin?.dualLayout,
      defaultCabinRole: perf?.cabin?.defaultRole,
    };
  }

  function hangarCabinStatus(acf: PlayerAircraft): HangarCabinStatus | undefined {
    const cabin = acf.airframeTypeId
      ? airframePerf[acf.airframeTypeId]?.cabin
      : undefined;
    if (!cabin || cabin.passengerSeats <= 0) return undefined;
    const resolved =
      cabin.configurations.find(
        (row) => row.id === acf.airframeConfigurationId,
      ) ??
      cabin.configurations.find(
        (row) => row.rolesPackRelPath === acf.rolesPackRelPath,
      ) ??
      cabin.configurations.find(
        (row) => row.id === cabin.defaultConfigurationId,
      );
    const activeRole = resolved?.role;
    return {
      activeRole,
      activeLabel: resolved?.label,
      passengerSeats: cabin.passengerSeats,
      dualLayout: cabin.dualLayout,
      charterNeedsPassenger: cabin.dualLayout && activeRole === 'cargo',
    };
  }
  const aircraftCountryOptions = useMemo((): AircraftMarketCountryOption[] => {
    const home = (aircraftHomeCountryId || 'BR').trim().toUpperCase();
    const pool = aircraftPoolCountries;
    const worldTotal = pool.reduce((sum, row) => sum + row.count, 0);
    const byId = new Map(
      pool.map((row) => [row.countryId.trim().toUpperCase(), row.count]),
    );
    const opts: AircraftMarketCountryOption[] = [
      {
        countryId: home,
        count: byId.get(home) ?? 0,
        isHome: true,
      },
      { countryId: 'WORLD', count: worldTotal },
      ...pool
        .filter((row) => row.countryId.trim().toUpperCase() !== home)
        .map((row) => ({
          countryId: row.countryId.trim().toUpperCase(),
          count: row.count,
        }))
        .sort((a, b) =>
          marketCountryLabel(a.countryId).localeCompare(
            marketCountryLabel(b.countryId),
          ),
        ),
    ];
    return opts;
  }, [aircraftPoolCountries, aircraftHomeCountryId]);
  const filteredAircraftListings = useMemo(() => {
    const q = aircraftMarketQuery.trim().toLowerCase();
    const homeRegion = resolveHubRegion(
      homeHubIcao || pilotIcao,
      networkHubs,
    )?.toUpperCase();
    const originIcao = (pilotIcao || homeHubIcao).trim().toUpperCase();
    const originHub = networkHubs.find(
      (h) => h.icao.toUpperCase() === originIcao,
    );
    const browsingAway =
      Boolean(aircraftBrowseCountry) &&
      aircraftBrowseCountry !== aircraftHomeCountryId;
    return aircraftListings
      .filter((listing) => {
      if (aircraftMarketClass && listing.aircraftClassId !== aircraftMarketClass) {
        return false;
      }
      if (aircraftMarketGeo === 'region' && !browsingAway) {
        const listingRegion = (
          listing.region ||
          resolveHubRegion(listing.basedIcao, networkHubs) ||
          ''
        ).toUpperCase();
        if (!homeRegion || listingRegion !== homeRegion) return false;
      }
      if (aircraftMarketGeo === 'near' && originHub) {
        const dest = networkHubs.find(
          (h) => h.icao.toUpperCase() === listing.basedIcao.trim().toUpperCase(),
        );
        if (!dest) return false;
        if (haversineNm(originHub, dest) > AIRCRAFT_MARKET_NEAR_NM) return false;
      }
      return aircraftListingMatchesQuery(listing, q);
    })
      .sort((a, b) => {
        const price = a.askingUsd - b.askingUsd;
        if (price !== 0) return price;
        const monthly = (a.leaseMonthlyUsd ?? 0) - (b.leaseMonthlyUsd ?? 0);
        if (monthly !== 0) return monthly;
        return a.label.localeCompare(b.label);
      });
  }, [
    aircraftListings,
    aircraftMarketClass,
    aircraftMarketQuery,
    aircraftMarketGeo,
    aircraftBrowseCountry,
    aircraftHomeCountryId,
    homeHubIcao,
    pilotIcao,
    networkHubs,
  ]);
  const ownedFleetCount = useMemo(
    () => fleet.filter((a) => (a.ownership ?? 'owned') === 'owned').length,
    [fleet],
  );
  const filteredHangarFleet = useMemo(() => {
    const q = hangarQuery.trim();
    if (!q) return fleet;
    return fleet.filter((acf) =>
      hangarAircraftMatchesQuery(
        acf,
        q,
        aircraftClassLabel(acf.aircraftClassId),
      ),
    );
  }, [fleet, hangarQuery]);
  const boardEstimateFleet = useMemo(
    () => prepareOpsFleet.filter(isOpsAircraftBoardSelectable),
    [prepareOpsFleet],
  );
  const boardAircraft = useMemo(
    () => boardEstimateFleet.find((a) => a.id === boardAircraftId) ?? null,
    [boardAircraftId, boardEstimateFleet],
  );
  const boardNearIcao = (
    boardAircraft?.locationIcao ||
    pilotIcao ||
    homeHubIcao
  )
    .trim()
    .toUpperCase();
  const boardEstimateOptsRef = useRef<{
    aircraft?: AircraftClass;
    airframe?: string;
  }>({});
  boardEstimateOptsRef.current = boardAircraft
    ? {
        aircraft: boardAircraft.aircraftClassId,
        airframe: boardAircraft.airframeTypeId,
      }
    : {};
  function fetchAirportView(icao: string) {
    return fetchAirport(icao, boardEstimateOptsRef.current);
  }
  useEffect(() => {
    if (showProfileGate || showAuthGate || !activeCareerProfile) return;
    if (!airportIcao) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void fetchAirportView(airportIcao)
        .then((view) => {
          if (cancelled) return;
          setAirportView(view);
          if (view.playerFbos) setPlayerFbos(view.playerFbos);
          setAirportHydrating(false);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const message = err instanceof Error ? err.message : String(err);
          if (shouldSurfaceApiError(message)) setError(message);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Refetch terminal lots when the estimate aircraft changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardAircraftId, airportIcao, showProfileGate, activeCareerProfile?.id]);
  useEffect(() => {
    if (boardEstimateFleet.length === 0) {
      if (boardAircraftId) setBoardAircraftId('');
      boardAircraftInitRef.current = false;
      return;
    }
    // Keep a valid selection if the aircraft is still in the fleet; otherwise
    // clear. Do not auto-pick — Freights defaults to gross pay so contract-pilot
    // browsing is not skewed by starter-aircraft fuel nets.
    if (
      boardAircraftId &&
      !boardEstimateFleet.some((a) => a.id === boardAircraftId)
    ) {
      setBoardAircraftId('');
    }
    boardAircraftInitRef.current = true;
  }, [boardAircraftId, boardEstimateFleet]);
  const hasListedAircraft = useMemo(
    () => fleet.some((a) => a.status === 'listed'),
    [fleet],
  );
  const safeMarketPage = Math.min(marketPage, marketPageCount);
  const pagedLots = lots;
  const hasMarketFilters = Boolean(
    originFilter.trim() ||
      destFilter.trim() ||
      distanceMaxNm ||
      cargoFilter ||
      loadMinKg ||
      loadMaxKg ||
      expiresWithinHours ||
      minimumPayUsd ||
      accessFilter ||
      laneFilter ||
      profitableOnly ||
      nearMe,
  );

  function updateMarketFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setMarketPage(1);
  }

  function clearMarketFilters() {
    setOriginFilter('');
    setDestFilter('');
    setDistanceMaxNm('');
    setCargoFilter('');
    setLoadMinKg('');
    setLoadMaxKg('');
    setExpiresWithinHours('');
    setMinimumPayUsd('');
    setAccessFilter('');
    setLaneFilter('');
    setProfitableOnly(false);
    setNearMe(false);
    setMarketPage(1);
  }

  function focusNearBoard() {
    const icao = (
      boardAircraft?.locationIcao ||
      pilotIcao ||
      homeHubIcao
    )
      .trim()
      .toUpperCase();
    if (!icao) return;
    setNearMe(true);
    setOriginFilter('');
    setDestFilter('');
    setProfitableOnly(Boolean(boardAircraft));
    setAccessFilter('open');
    setMarketPage(1);
  }

  function toggleNearBoard() {
    if (nearMe && !originFilter.trim()) {
      setNearMe(false);
      setMarketPage(1);
      return;
    }
    const icao = (
      boardAircraft?.locationIcao ||
      pilotIcao ||
      homeHubIcao
    )
      .trim()
      .toUpperCase();
    if (!icao) return;
    setNearMe(true);
    setOriginFilter('');
    setMarketPage(1);
  }

  /** Open Hangar ferry with dest = current terminal (parked board aircraft, else any parked). */
  function ferryAircraftToCurrentTerminal() {
    if (!airportView) return;
    const dest = airportView.airport.icao.trim().toUpperCase();
    const acf =
      boardAircraft?.status === 'parked'
        ? boardAircraft
        : boardEstimateFleet.find((a) => a.status === 'parked');
    if (!acf) {
      setError('No parked aircraft available to ferry');
      return;
    }
    const from = acf.locationIcao.trim().toUpperCase();
    if (from === dest) return;
    setAirportReturn({
      icao: dest,
      section: terminalSection,
    });
    setFerrySeed({ dest, token: Date.now() });
    setHangarPane('aircraft');
    goToTab('hangar');
  }

  function toggleMarketSort(key: MarketSortKey) {
    setMarketSorts((current) => {
      if (key === 'access') {
        const existing = current.find((level) => level.key === 'access');
        const rest = current.filter((level) => level.key !== 'access');
        if (!existing) {
          return [{ key: 'access', direction: 'asc' }, ...rest];
        }
        if (existing.direction === 'asc') {
          return [{ key: 'access', direction: 'desc' }, ...rest];
        }
        return rest;
      }
      return withMetricPrimarySort(current, key);
    });
    setMarketPage(1);
  }

  function sortIndicator(key: MarketSortKey): string {
    const index = marketSorts.findIndex((level) => level.key === key);
    if (index < 0) return '↕';
    const arrow = marketSorts[index]!.direction === 'asc' ? '↑' : '↓';
    return marketSorts.length > 1 ? `${index + 1}${arrow}` : arrow;
  }

  function marketAriaSort(
    key: MarketSortKey,
  ): 'ascending' | 'descending' | 'none' | 'other' {
    const index = marketSorts.findIndex((level) => level.key === key);
    if (index < 0) return 'none';
    if (index > 0) return 'other';
    return marketSorts[0]!.direction === 'asc' ? 'ascending' : 'descending';
  }

  function toggleContractsSort(key: MarketSortKey) {
    setContractsSorts((current) => {
      if (key === 'access') {
        const existing = current.find((level) => level.key === 'access');
        const rest = current.filter((level) => level.key !== 'access');
        if (!existing) {
          return [{ key: 'access', direction: 'asc' }, ...rest];
        }
        if (existing.direction === 'asc') {
          return [{ key: 'access', direction: 'desc' }, ...rest];
        }
        return rest;
      }
      return withMetricPrimarySort(current, key);
    });
    setContractsPage(1);
  }

  function contractsSortIndicator(key: MarketSortKey): string {
    const index = contractsSorts.findIndex((level) => level.key === key);
    if (index < 0) return '↕';
    const arrow = contractsSorts[index]!.direction === 'asc' ? '↑' : '↓';
    return contractsSorts.length > 1 ? `${index + 1}${arrow}` : arrow;
  }

  function contractsAriaSort(
    key: MarketSortKey,
  ): 'ascending' | 'descending' | 'none' | 'other' {
    const index = contractsSorts.findIndex((level) => level.key === key);
    if (index < 0) return 'none';
    if (index > 0) return 'other';
    return contractsSorts[0]!.direction === 'asc' ? 'ascending' : 'descending';
  }

  const stagingExisting =
    staging?.intoMissionId && !staging.replaceManifest
      ? missions.find((m) => m.id === staging.intoMissionId)
      : undefined;
  const stagingBlockingMission = staging
    ? findStagingBlockingMission(staging, missions)
    : undefined;
  const stagingExistingLots = stagingExisting?.lots?.length ?? 0;
  const stagingPayUsd = staging
    ? staging.deskHold
      ? deskHoldPayUsd(staging.deskHold)
      : staging.lines.reduce(
          (sum, line) => sum + proRataPayUsd(line.lot, line.cargoKg),
          0,
        )
    : 0;
  const stagingContractPayUsd =
    stagingPayUsd + (stagingExisting?.payUsd ?? 0);
  const stagingEstNetUsd =
    estimatedFuelCostUsd !== null
      ? stagingContractPayUsd - estimatedFuelCostUsd
      : null;
  const stagingTotalKg = staging
    ? staging.deskHold
      ? deskHoldEffectiveLoadKg(staging.deskHold)
      : stagingUsedKg(staging)
    : 0;
  const stagingDeskHoldMaxKg = staging?.deskHold
    ? Math.max(
        0,
        Math.floor(
          Math.min(
            Math.floor(staging.deskHold.kg),
            aircraftCapKg(staging.aircraft),
          ),
        ),
      )
    : 0;
  const stagingFreeKg = staging
    ? Math.max(0, aircraftCapKg(staging.aircraft) - stagingTotalKg)
    : 0;
  const stagingAssignedAircraft = staging?.aircraftId
    ? findOpsEntry(opsFleetEntries, staging.aircraftId)?.aircraft ??
      fleet.find((a) => a.id === staging.aircraftId) ??
      vaSessionFleet.find((a) => a.id === staging.aircraftId)
    : undefined;
  const stagingAircraftAtOrigin = Boolean(
    staging &&
      stagingAssignedAircraft &&
      stagingAssignedAircraft.status === 'parked' &&
      stagingAssignedAircraft.locationIcao.trim().toUpperCase() ===
        staging.originIcao.trim().toUpperCase(),
  );
  const stagingValid = staging?.deskHold
    ? Boolean(staging.aircraftId) &&
      stagingAircraftAtOrigin &&
      stagingRangeOk(staging) &&
      routeFuelFeasible !== false &&
      deskHoldEffectiveLoadKg(staging.deskHold) > 0 &&
      deskHoldEffectiveLoadKg(staging.deskHold) <= stagingDeskHoldMaxKg
    : Boolean(staging) &&
      staging!.lines.length > 0 &&
      stagingAircraftAtOrigin &&
      stagingRangeOk(staging!) &&
      routeFuelFeasible !== false &&
      staging!.lines.every((line) => {
        const maxKg = lineMaxKg(staging!, line.lot);
        return line.cargoKg > 0 && line.cargoKg <= maxKg;
      }) &&
      stagingExistingLots + staging!.lines.length <= MAX_STAGING_LOTS;
  const stagingDistanceNm = staging ? stagingRouteDistanceNm(staging) : undefined;
  const stagingInRange = staging ? stagingRangeOk(staging) : true;
  const stagingFuelOk = routeFuelFeasible !== false;
  const stagingMxFuelWarn = Boolean(mxFuelBurn?.exceedsTank && stagingFuelOk);
  const stagingCandidates = staging
    ? stagingRouteLots.filter(
        (lot) =>
          lot.originIcao === staging.originIcao &&
          lot.destIcao === staging.destIcao &&
          !staging.lines.some((line) => line.lot.id === lot.id) &&
          lot.availableKg > 0,
      )
    : [];
  const stagingAssignedLabel = staging
    ? findOpsEntry(opsFleetEntries, staging.aircraftId)?.aircraft.label ??
      vaSessionFleet.find((aircraft) => aircraft.id === staging.aircraftId)
        ?.label ??
      fleet.find((aircraft) => aircraft.id === staging.aircraftId)?.label ??
      aircraftClassLabel(staging.aircraft)
    : '';

  const showAirport = airportIcao !== null && airportView !== null;
  const showBack = showAirport || airportReturn !== null;
  const showStaging = tab === 'staging';

  // Bush-trip Watch: auto-start on Dispatch + poll. Like freight Watch, keep
  // retrying start if the session dies mid-leg (pipe blips reconnect in-tick
  // while running; full session death needs a new start).
  useEffect(() => {
    if (!hubSelected || !showStaging || !activeBushTrip) {
      return;
    }
    let cancelled = false;
    let startInFlight = false;
    let nextStartAttemptAtMs = 0;
    const tripId = activeBushTrip.tripId;

    async function tickBushWatch() {
      try {
        let status = await fetchBushWatchStatus();
        if (cancelled) return;

        const needsStart =
          !status.running &&
          !status.completed &&
          Date.now() >= nextStartAttemptAtMs &&
          !startInFlight;

        if (needsStart) {
          startInFlight = true;
          try {
            status = await postBushWatchStart({ intervalSec: 5 });
            // Allow another start soon if the session dies after a successful open.
            nextStartAttemptAtMs = Date.now() + 5_000;
          } catch (err) {
            // Back off like freight Watch (~15s) when SimBridge is busy/down.
            nextStartAttemptAtMs = Date.now() + 15_000;
            if (!cancelled) {
              setBushWatch((prev: BushWatchStatus | null) => ({
                ...(prev ?? status),
                running: false,
                tripId,
                lastError:
                  err instanceof Error ? err.message : String(err),
              }));
            }
            return;
          } finally {
            startInFlight = false;
          }
        }

        if (cancelled) return;
        setBushWatch(status);
        if (status.completed) {
          setToastKind('ok');
          setToast(
            status.payoutUsd != null && status.payoutUsd > 0
              ? `Bush trip complete · +${formatMoney(status.payoutUsd)}`
              : 'Bush trip complete',
          );
          if (typeof status.walletUsd === 'number') {
            commitWallet(status.walletUsd);
          }
          setActiveBushTrip(null);
          setBushWatch(null);
          void refresh().catch(() => undefined);
          void refreshBushTrips().catch(() => undefined);
          return;
        }
        // Keep Dispatch card in sync when Watch advances a leg.
        const trip = activeBushTrip;
        if (
          trip &&
          status.running &&
          status.legIndex != null &&
          (status.legIndex !== trip.legIndex ||
            status.legStatus !== trip.legStatus ||
            status.fromIcao !== trip.fromIcao)
        ) {
          void refreshBushTrips().catch(() => undefined);
        }
      } catch {
        /* ignore poll errors */
      }
    }

    void tickBushWatch();
    const id = window.setInterval(() => {
      void tickBushWatch();
    }, 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubSelected, showStaging, activeBushTrip?.tripId]);

  const stagingMode: 'empty' | 'draft' | 'active' | 'debrief' = staging
    ? 'draft'
    : flightDebrief
      ? 'debrief'
      : activeMission
        ? 'active'
        : 'empty';
  const showSettleBusyOverlay =
    !flightDebrief &&
    activeMission?.status === 'in_flight' &&
    (Boolean(watch?.settling) ||
      settleOverlaySticky ||
      watch?.lastEvent?.type === 'settle' ||
      (Boolean(watch?.sawAirborne) &&
        watch?.onGround === true &&
        (watch?.enginesRunning === false || watch?.parkingBrake === true) &&
        watch?.lastEvent?.type !== 'settle_blocked'));
  const dispatchStep = deriveDispatchStep({
    hasDraft: Boolean(staging || charterManifest),
    hasDebrief: stagingMode === 'debrief',
    mission:
      activeMission &&
      watch?.running &&
      watch.missionId === activeMission.id &&
      activeMission.status !== 'in_flight' &&
      (watch.missionStatus === 'in_flight' ||
        watch.lastEvent?.type === 'depart')
        ? { ...activeMission, status: 'in_flight' }
        : activeMission,
  });
  const activeLoadPath = activeMission
    ? resolveLoadPath(activeMission, false)
    : 'manual';
  const dispatchStatusText = dispatchStepStatusLine({
    step: dispatchStep,
    mission: activeMission,
    simbriefUser,
    ofpAutoStatus,
    missionFuelQuoteStatus,
    missionFuelQuoteError,
    loadOfpAutoStatus,
    loadOfpAutoError,
    loadOfpProgress,
    loadPath: activeLoadPath,
    simBridgeConnected: Boolean(simBridge?.connected),
    watchRunning: Boolean(
      watch?.running &&
        watch.missionId === activeMission?.id &&
        !holdWatchOffForPreflight,
    ),
    watchAutoStatus,
    watchOnGround:
      watch?.running && watch.missionId === activeMission?.id
        ? watch.onGround
        : (simBridge?.onGround ?? null),
    watchEnginesRunning:
      watch?.running && watch.missionId === activeMission?.id
        ? watch.enginesRunning
        : (simBridge?.enginesRunning ?? null),
    watchSawAirborne: Boolean(watch?.sawAirborne),
    watchSettling: Boolean(watch?.settling) || settleOverlaySticky,
    watchSettleBlockedReason:
      watch?.lastEvent?.type === 'settle_blocked'
        ? watch.lastEvent.reason
        : null,
  });
  const terminalMovementCount = showAirport
    ? (airportView.arrivals?.length ?? 0) + (airportView.departures?.length ?? 0)
    : 0;
  const terminalContractCount = showAirport
    ? airportView.outboundLots.length + airportView.inboundLots.length
    : 0;
  const sisterFboIcaos = useMemo(() => {
    const here = (airportIcao ?? '').toUpperCase();
    return (playerFbos?.fbos ?? [])
      .map((f) => f.icao.toUpperCase())
      .filter((icao) => icao && icao !== here);
  }, [playerFbos, airportIcao]);

  const ownedFboIcaos = useMemo(
    () =>
      (playerFbos?.fbos ?? [])
        .map((f) => f.icao.toUpperCase())
        .filter(Boolean),
    [playerFbos],
  );

  const contractLots = showAirport
    ? contractsLane === 'outbound'
      ? airportView.outboundLots
      : airportView.inboundLots
    : [];
  const sortedContractLots = useMemo(() => {
    let filtered =
      contractsAccessFilter === 'open'
        ? contractLots.filter((lot) => !isCargoOpsCommodityLocked(lot.commodityId))
        : contractsAccessFilter === 'locked'
          ? contractLots.filter((lot) =>
              isCargoOpsCommodityLocked(lot.commodityId),
            )
          : contractLots;
    filtered =
      contractsOffer === 'crew'
        ? filtered.filter((lot) => Boolean(lot.npcClaim?.crewNeeded))
        : filtered.filter((lot) => !lot.npcClaim?.crewNeeded);
    if (
      contractsSisterOnly &&
      contractsLane === 'outbound' &&
      sisterFboIcaos.length > 0
    ) {
      const sisters = new Set(sisterFboIcaos);
      filtered = filtered.filter((lot) =>
        sisters.has(lot.destIcao.toUpperCase()),
      );
    }
    if (contractsProfitableOnly) {
      filtered = filtered.filter(
        (lot) =>
          isFiniteMoney(lot.estimatedNetUsd) &&
          lot.estimatedNetUsd > 0 &&
          lot.estimatedInRange !== false,
      );
    }
    return sortAirportLots(
      filtered,
      contractsSorts,
      isCargoOpsCommodityLocked,
      boardEstimateFleet.length === 0,
    );
  }, [
    contractLots,
    contractsSorts,
    contractsAccessFilter,
    contractsOffer,
    contractsSisterOnly,
    contractsProfitableOnly,
    boardAircraft,
    boardEstimateFleet.length,
    contractsLane,
    sisterFboIcaos,
    cargoOps,
  ]);
  const contractsPageCount = Math.max(
    1,
    Math.ceil(sortedContractLots.length / CONTRACTS_PAGE_SIZE) || 1,
  );
  const safeContractsPage = Math.min(contractsPage, contractsPageCount);
  const pagedContractLots = useMemo(() => {
    const start = (safeContractsPage - 1) * CONTRACTS_PAGE_SIZE;
    return sortedContractLots.slice(start, start + CONTRACTS_PAGE_SIZE);
  }, [safeContractsPage, sortedContractLots]);
  const selectedContractLot = showAirport
    ? (airportView.outboundLots.find((lot) => lot.id === selectedContractLotId) ??
      airportView.inboundLots.find((lot) => lot.id === selectedContractLotId) ??
      null)
    : null;
  const toastScope = showAirport ? `airport:${airportIcao}` : `tab:${tab}`;
  const toastScopeRef = useRef<{ id: number; scope: string } | null>(null);

  useEffect(() => {
    if (!toastState) {
      toastScopeRef.current = null;
      return;
    }
    const recorded = toastScopeRef.current;
    // The scope is captured one commit late so a toast raised together with a
    // navigation (e.g. "editing manifest" jumping to Dispatch) survives it.
    if (!recorded || recorded.id !== toastState.id) {
      toastScopeRef.current = { id: toastState.id, scope: toastScope };
      return;
    }
    if (recorded.scope !== toastScope) setToastState(null);
  }, [toastState, toastScope]);

  useEffect(() => {
    if (!toastState) return;
    const ms = toastKind === 'ok' ? 7000 : toastKind === 'warn' ? 11000 : 14000;
    const timer = setTimeout(() => setToastState(null), ms);
    return () => clearTimeout(timer);
  }, [toastState, toastKind]);

  const pageTitle = showAirport
    ? airportView.airport.icao
    : showStaging
      ? 'Dispatch'
      : tab === 'fleet'
        ? 'Rivals'
        : tab === 'aircraft'
          ? 'Airframes'
          : tab === 'hangar'
            ? 'Hangar'
            : tab === 'pilot'
              ? 'Company'
              : tab === 'map'
                ? 'Network'
                : tab === 'ports'
                  ? 'Ports'
                  : tab === 'va'
                    ? vaChromeTitle?.trim() || 'Crew'
                    : tab === 'vaDirectory'
                      ? 'Airlines'
                    : tab === 'vaRanking'
                      ? 'Ranking'
                  : tab === 'missions'
                  ? 'Logbook'
                  : tab === 'lab'
                    ? 'Payload Lab'
                    : tab === 'pulse'
                      ? 'Economy pulse'
                  : tab === 'settings'
                    ? 'Settings'
                    : tab === 'charter'
                      ? 'Charter'
                      : 'Freights';
  const pageLede = showAirport
    ? `${airportView.airport.name} · ${airportView.airport.region} · ${
        airportView.airport.bushTripOnly
          ? 'trip-only'
          : airportView.airport.bush
            ? 'bush'
            : (airportView.airport.hubTier ?? 'spoke')
      }`
    : showStaging
      ? stagingMode === 'active'
        ? 'Guided preflight — flight plan, fuel, load, then fly and settle.'
        : stagingMode === 'draft'
          ? staging?.replaceManifest
            ? 'Adjust payload, then Save & re-dispatch to reopen SimBrief with the new load.'
            : 'Build a same-route manifest, adjust each payload, then accept and open SimBrief.'
          : stagingMode === 'debrief'
            ? 'Flight complete — review payout, fuel cost, and net.'
            : activeBushTrip
              ? 'Bush trip accepted — full route on the map. Fly/settle comes next.'
              : 'Prepare a freight from Freights, or resume after settling the last flight.'
      : tab === 'fleet'
        ? 'Competing freighters — idle, airborne, turnaround, shop MX, or crew rest.'
        : tab === 'aircraft'
          ? 'New, used, and lease airframes priced to Airframe freights — not real-world MSRP.'
          : tab === 'hangar'
            ? 'Your aircraft — ownership, condition, ferry, and maintenance.'
            : tab === 'pilot'
              ? hubSelected
                ? 'Company identity, fleet snapshot, and progression.'
                : 'Register your name and home hub to start the career.'
              : tab === 'map'
                ? 'Registered Airframe hubs on OpenFreeMap Dark (free public tiles).'
                : tab === 'ports'
                  ? 'Factory-priced seaport cargo — buy into a warehouse, fulfill Demand Board orders.'
                  : tab === 'va'
                    ? 'Company crew desk — roster, hangar, and hiring.'
                    : tab === 'vaDirectory'
                      ? 'Published airlines — request to join or use an invite code.'
                    : tab === 'vaRanking'
                      ? 'Internal Haul distance and count over the last week.'
                  : tab === 'missions'
                  ? 'Past flights — aircraft, cargo, distance, and payout.'
                  : tab === 'lab'
                    ? 'Inject Due vs Sim without buy/ferry (dev).'
                    : tab === 'pulse'
                      ? 'Saved network economy samples — world / BR / US pulse (dev).'
                  : tab === 'settings'
                    ? 'SimBrief, weight units, and local career preferences.'
                    : tab === 'charter'
                      ? 'Passenger offers — seats and range on your aircraft, separate from cargo freights.'
                      : freightsBoard === 'bush' && BUSH_TRIPS_BOARD_ENABLED
                        ? 'Validated bush trip arcs — light GA only, separate from Market freights.'
                        : freightsBoard === 'crew'
                          ? 'Fly operator airframes for a pilot fee — starter path until you own a hull.'
                          : 'Cargo board for your aircraft — lot pay, then Dispatch.';
  const pageHelp = resolvePageHelp({
    showAirport,
    showStaging,
    tab,
  });
  const parkedIcao =
    fleet.find((a) => a.status === 'parked')?.locationIcao ?? homeHubIcao;
  const signalFocusIcao = pilotIcao || parkedIcao || homeHubIcao;

  const airportNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const hub of networkHubs) {
      const name = hub.name?.trim();
      if (name) names.set(hub.icao.toUpperCase(), name);
    }
    for (const lot of lots) {
      const origin = lot.originName?.trim();
      const dest = lot.destName?.trim();
      if (origin) names.set(lot.originIcao.toUpperCase(), origin);
      if (dest) names.set(lot.destIcao.toUpperCase(), dest);
    }
    const here = airportView?.airport;
    if (here?.name?.trim()) {
      names.set(here.icao.toUpperCase(), here.name.trim());
    }
    return names;
  }, [networkHubs, lots, airportView?.airport.icao, airportView?.airport.name]);

  const signupCargoHubs = useMemo(() => {
    const raw =
      hubOptions.length > 0 ? networkCargoHubs(hubOptions) : FALLBACK_STARTER_HUBS;
    const tierRank = { major: 0, regional: 1, spoke: 2 };
    return raw.slice().sort((a, b) => {
      const tr = tierRank[a.hubTier] - tierRank[b.hubTier];
      return tr !== 0 ? tr : a.icao.localeCompare(b.icao);
    });
  }, [hubOptions]);

  const signupCountries = useMemo(() => {
    const samples = new Map<string, string>();
    for (const hub of signupCargoHubs) {
      const id = countryIdFromRegion(hub.region);
      if (!id) continue;
      const prev = samples.get(id);
      if (!prev) {
        samples.set(id, hub.region);
        continue;
      }
      const preferNext =
        regionLabel(hub.region).includes('—') && !regionLabel(prev).includes('—');
      if (preferNext) samples.set(id, hub.region);
    }
    return [...samples.entries()]
      .map(([id, region]) => ({
        id,
        label: countryDisplayName(id, region),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [signupCargoHubs]);

  const signupHubsForCountry = useMemo(() => {
    if (!signupCountry) return signupCargoHubs;
    return signupCargoHubs.filter(
      (hub) => countryIdFromRegion(hub.region) === signupCountry,
    );
  }, [signupCargoHubs, signupCountry]);

  const signupPilotResolved = resolvedSignupPilotName();
  const signupPilotLocked = authRequired && signupPilotResolved.length >= 2;

  const showDesktopPlayModeGate =
    Boolean(window.skylineDesktop?.setPlayMode) &&
    (forcePlayModeGate || playModeGate === 'needed' || playModeGate === 'loading');

  if (showDesktopPlayModeGate) {
    if (playModeGate === 'loading' && !forcePlayModeGate) {
      return (
        <div className="app-shell profile-gate-shell">
          <ProfileGateLoading />
        </div>
      );
    }
    return (
      <div className="app-shell profile-gate-shell">
        <PlayModeGate
          defaultUrl={
            playModeConfig?.defaultWorldApiUrl ?? 'http://127.0.0.1:8787'
          }
          suggestedMpUrl={
            playModeConfig?.suggestedMpWorldApiUrl ??
            'https://world.playairframe.com'
          }
          initialUrl={playModeConfig?.worldApiUrl}
          currentMode={playModeConfig?.mode}
          busy={playModeBusy}
          error={playModeError}
          onChoose={async (opts) => {
            try {
              await applyDesktopPlayMode(opts);
            } catch (err) {
              setPlayModeError(
                err instanceof Error ? err.message : String(err),
              );
            }
          }}
        />
        {forcePlayModeGate && !playModeBusy ? (
          <p className="profile-gate-footer-actions">
            <button
              type="button"
              className="action ghost"
              onClick={() => {
                setForcePlayModeGate(false);
                setPlayModeError(null);
              }}
            >
              Cancel
            </button>
          </p>
        ) : null}
      </div>
    );
  }

  if (profilesLoading) {
    return (
      <div className="app-shell profile-gate-shell">
        <ProfileGateLoading />
        {confirmDialog}
      </div>
    );
  }

  if (worldWaiting) {
    return (
      <div className="app-shell profile-gate-shell">
        <WorldWaitingGate />
        {confirmDialog}
      </div>
    );
  }

  // Auth before profile picker / main shell — avoids Freights flash on Ctrl+R
  // when a stale remembered token is about to be rejected.
  if (showAuthGate) {
    return (
      <div className="app-shell profile-gate-shell">
        <AuthGate
          busy={false}
          error={
            error && shouldSurfaceApiError(error) ? error : null
          }
          registerEnabled={authRegisterEnabled}
          inviteRequired={authInviteRequired}
          accessKeysRequired={authAccessKeysRequired}
          onLogin={async (opts) => {
            const result = await postAuthLogin(opts);
            return {
              token: result.token,
              account: result.account,
              companies: result.companies,
            };
          }}
          onRegister={async (opts) => {
            const result = await postAuthRegister({
              loginName: opts.loginName,
              displayName: opts.displayName,
              password: opts.password,
              companyDisplayName: opts.companyDisplayName,
              inviteCode: opts.inviteCode,
            });
            return {
              token: result.token,
              account: result.account,
              companies: result.companies,
            };
          }}
          onSuccess={finishAuthAndEnter}
        />
        {confirmDialog}
      </div>
    );
  }

  if (showProfileGate || !activeCareerProfile) {
    const gateError =
      error && shouldSurfaceApiError(error) ? error : null;
    return (
      <div className="app-shell profile-gate-shell">
        {gateError || (toast && !isNeedsProfileMessage(toast)) ? (
          <div className="app-toast-stack profile-gate-toast-stack">
            {gateError ? (
              <p className="banner error" role="alert" aria-live="assertive">
                <span>{gateError}</span>
                <button
                  type="button"
                  className="banner-close"
                  onClick={() => setError(null)}
                  aria-label="Dismiss error"
                >
                  ×
                </button>
              </p>
            ) : null}
            {toast && !isNeedsProfileMessage(toast) ? (
              <p
                className={`banner ${toastKind === 'ok' ? 'ok' : toastKind}`}
                role="status"
                aria-live="polite"
              >
                <span>{toast}</span>
                <button
                  type="button"
                  className="banner-close"
                  onClick={() => setToast(null)}
                  aria-label="Dismiss message"
                >
                  ×
                </button>
              </p>
            ) : null}
          </div>
        ) : null}
        <ProfileGate
          key={`profiles-${authSessionEpoch}`}
          profiles={careerProfiles}
          lastActiveId={activeCareerProfile?.id ?? null}
          busy={busy}
          busyLabel={profileGateBusyLabel}
          onSelect={(id) => void onSelectCareerProfile(id)}
          onCreate={(name) => void onCreateCareerProfile(name)}
          authSignedIn={authChecked && Boolean(getAuthToken())}
          onSignOut={() => void onSignOutAccount()}
        />
        {confirmDialog}
      </div>
    );
  }

  return (
    <AirportNamesProvider names={airportNames}>
    <div className={`app-shell${sidebarOpen ? ' sidebar-open' : ''}`}>
      {sidebarOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <aside className="sidebar" aria-label="Primary">
        <div className="sidebar-brand">
          <BrandMark />
        </div>
        <nav className="sidebar-nav" aria-label="Board sections">
          <button
            type="button"
            className={`tab tab-back${showBack ? '' : ' is-placeholder'}`}
            onClick={() => {
              if (airportReturn && !showAirport) {
                void returnToAirport();
                return;
              }
              setSidebarOpen(false);
              selectTab(tab);
            }}
            disabled={busy || !showBack}
            aria-hidden={!showBack}
            tabIndex={showBack ? undefined : -1}
            title={
              airportReturn && !showAirport
                ? `Back to ${airportReturn.icao}`
                : undefined
            }
          >
            ← Back
          </button>

          <button
            type="button"
            className={!showAirport && tab === 'market' ? 'tab active' : 'tab'}
            onClick={() => selectTab('market')}
            disabled={busy}
            title="Cargo board — your aircraft or operator holds"
          >
            Freights
          </button>
          <button
            type="button"
            className={!showAirport && tab === 'charter' ? 'tab active' : 'tab'}
            onClick={() => selectTab('charter')}
            disabled={busy}
            title="Passenger charter offers"
          >
            Charter
          </button>
          <button
            type="button"
            className={!showAirport && tab === 'aircraft' ? 'tab active' : 'tab'}
            onClick={() => {
              selectTab('aircraft');
              void refreshAircraftMarket().catch(() => undefined);
            }}
            disabled={busy}
            title={
              aircraftListings.length
                ? `${aircraftListings.length} airframe listings today`
                : 'Buy, used, and lease airframes'
            }
          >
            Airframes
          </button>
          <button
            type="button"
            className={!showAirport && tab === 'hangar' ? 'tab active' : 'tab'}
            onClick={() => selectTab('hangar')}
            disabled={busy}
            title={
              fleet[0]
                ? `Company hangar · ${fleet[0].label} at ${fleet[0].locationIcao}`
                : 'Company hangar'
            }
          >
            Hangar
          </button>
          <button
            type="button"
            className={
              showAirport && terminalSection === 'fbo' ? 'tab active' : 'tab'
            }
            onClick={() => openFboBoard()}
            disabled={busy}
            title={
              playerFbos?.fbos.length
                ? `Base · ${playerFbos.fbos.map((f) => f.icao).join(', ')}`
                : homeHubIcao
                  ? `Buy Base · ${homeHubIcao}`
                  : 'Base'
            }
          >
            Base
          </button>
          {devMode ? (
            <button
              type="button"
              className={!showAirport && tab === 'fleet' ? 'tab active' : 'tab'}
              onClick={() => selectTab('fleet')}
              disabled={busy}
              title={`${npcBusy} busy · ${npcSummary.airborne} airborne · Dev Mode`}
            >
              Rivals
            </button>
          ) : null}
          <button
            type="button"
            className={!showAirport && tab === 'pilot' ? 'tab active' : 'tab'}
            onClick={() => selectTab('pilot')}
            disabled={busy}
            title={
              hubSelected && homeHubIcao
                ? `Company profile · home ${homeHubIcao}`
                : 'Company profile'
            }
          >
            Company
          </button>
          <button
            type="button"
            className={!showAirport && tab === 'map' ? 'tab active' : 'tab'}
            onClick={() => selectTab('map')}
            disabled={busy}
            title={
              networkHubs.length
                ? `${networkHubs.length} hubs on the network map`
                : 'Interactive hub network map'
            }
          >
            Network
          </button>
          <button
            type="button"
            className={!showAirport && tab === 'ports' ? 'tab active' : 'tab'}
            onClick={() => selectTab('ports')}
            disabled={busy}
            title="Seaport factory cargo"
          >
            Ports
          </button>
          <button
            type="button"
            className={
              !showAirport && tab === 'vaDirectory' ? 'tab active' : 'tab'
            }
            onClick={() => selectTab('vaDirectory')}
            disabled={busy}
            title="Browse published airlines"
          >
            Airlines
          </button>
          <button
            type="button"
            className={!showAirport && tab === 'va' ? 'tab active' : 'tab'}
            onClick={() => selectTab('va')}
            disabled={busy}
            title="Crew desk for your published company, or the one you joined"
          >
            Crew
          </button>
          <button
            type="button"
            className={
              !showAirport && tab === 'vaRanking' ? 'tab active' : 'tab'
            }
            onClick={() => selectTab('vaRanking')}
            disabled={busy}
            title="Airline Internal Haul ranking · 7 days"
          >
            Ranking
          </button>
          <button
            type="button"
            className={!showAirport && tab === 'missions' ? 'tab active' : 'tab'}
            onClick={() => selectTab('missions')}
            disabled={busy}
            title="Flight history"
          >
            Logbook
          </button>
          {devMode ? (
            <>
              <button
                type="button"
                className={!showAirport && tab === 'lab' ? 'tab active' : 'tab'}
                onClick={() => selectTab('lab')}
                disabled={busy}
                title="Payload Lab — inject Due vs Sim without buy/ferry"
              >
                Lab
              </button>
              <button
                type="button"
                className={!showAirport && tab === 'pulse' ? 'tab active' : 'tab'}
                onClick={() => selectTab('pulse')}
                disabled={busy}
                title="Economy pulse — network hub samples (dev)"
              >
                Pulse
              </button>
            </>
          ) : null}

          {showAirport && terminalSection !== 'fbo' ? (
            <span className="tab active">Terminal</span>
          ) : null}
        </nav>
        {activeMission ? (
          <SidebarFlightStrip
            kind="active"
            label="Active flight"
            originIcao={activeMission.originIcao}
            destIcao={activeMission.destIcao}
            detail={
              activeTourOnDispatch
                ? `Tour L${activeTourOnDispatch.legIndex}/${activeTourOnDispatch.legCount} · ${activeMission.status.replace(/_/g, ' ')}${
                    activeTourOnDispatch.nextOrigin &&
                    activeTourOnDispatch.nextDest
                      ? ` · next ${activeTourOnDispatch.nextOrigin}→${activeTourOnDispatch.nextDest}`
                      : ''
                  }`
                : activeMission.status.replace(/_/g, ' ')
            }
            busy={busy}
            onOpen={() => selectTab('staging')}
          />
        ) : activeTour &&
          activeTour.status === 'active' &&
          activeTour.nextLegIndex != null ? (
          <SidebarFlightStrip
            kind="draft"
            label={
              activeTour.resumeState === 'stranded'
                ? 'Tour stranded'
                : staging || pendingActiveTour
                  ? 'Resume tour'
                  : activeTour.resumeState === 'ready'
                    ? 'Resume tour'
                    : 'Active tour'
            }
            originIcao={
              activeTour.legs.find(
                (l) => l.index === activeTour.nextLegIndex,
              )?.originIcao ?? activeTour.originIcao
            }
            destIcao={
              activeTour.legs.find(
                (l) => l.index === activeTour.nextLegIndex,
              )?.destIcao ?? activeTour.routeLabel
            }
            detail={
              activeTour.resumeState === 'stranded'
                ? `L${activeTour.nextLegIndex}/${activeTour.legs.length} · Drop → Base`
                : staging || pendingActiveTour
                  ? `L${activeTour.nextLegIndex}/${activeTour.legs.length} · Resume → Manifest`
                  : activeMission
                    ? `L${activeTour.nextLegIndex}/${activeTour.legs.length} · Resume → Flight plan`
                    : `L${activeTour.nextLegIndex}/${activeTour.legs.length} · Resume → Base`
            }
            busy={busy}
            onOpen={() => openActiveTourResume()}
          />
        ) : activeBushTrip ? (
          <SidebarFlightStrip
            kind="bush"
            label="Bush trip"
            originIcao={activeBushTrip.fromIcao}
            destIcao={activeBushTrip.toIcao}
            detail={`${activeBushTrip.title} · leg ${activeBushTrip.legIndex + 1}/${activeBushTrip.legs}${
              activeBushTrip.legStatus === 'departed'
                ? ' · airborne'
                : activeBushTrip.status === 'in_progress'
                  ? ' · en route'
                  : ' · ready'
            }`}
            busy={busy}
            onOpen={() => selectTab('staging')}
          />
        ) : charterManifest ? (
          <SidebarFlightStrip
            kind="draft"
            label="Charter manifest"
            originIcao={charterManifest.offer.originIcao}
            destIcao={charterManifest.offer.destIcao}
            detail={`${charterManifest.offer.paxCount} passengers`}
            busy={busy}
            onOpen={() => selectTab('staging')}
          />
        ) : staging ? (
          <SidebarFlightStrip
            kind="draft"
            label="Dispatch draft"
            originIcao={staging.originIcao}
            destIcao={staging.destIcao}
            detail={
              staging.deskHold
                ? `Desk ${staging.deskHold.kind ?? 'hold'} · ${formatTonnes(deskHoldEffectiveLoadKg(staging.deskHold))}${
                    deskHoldEffectiveLoadKg(staging.deskHold) <
                    Math.floor(staging.deskHold.kg)
                      ? ` of ${formatTonnes(staging.deskHold.kg)}`
                      : ''
                  }`
                : `${staging.lines.length} lot(s) staged`
            }
            busy={busy}
            onOpen={() => selectTab('staging')}
          />
        ) : crewAirborneMission ? (
          <SidebarFlightStrip
            kind="crew"
            label="Crew airborne"
            originIcao={crewAirborneMission.originIcao}
            destIcao={crewAirborneMission.destIcao}
            detail="In flight"
            busy={busy}
            onOpen={() => selectTab('staging')}
          />
        ) : null}
        <div className="sidebar-footer">
          <span className="who">
            {(authRequired && authAccountLabel) || pilotName || 'Airframe'}
          </span>
          <span className="wallet">
            {careerStateReady ? formatMoney(wallet) : '…'}
          </span>
          <span className="meta">
            {!careerStateReady ? (
              <BusyStatus label="Loading career…" />
            ) : !careerReady ? (
              <BusyStatus label="Syncing missions…" />
            ) : pilotIcao ? (
              `Pilot at ${pilotIcao}`
            ) : (
              'Pilot location —'
            )}
            {careerStateReady && homeHubIcao ? ` · home ${homeHubIcao}` : ''}
          </span>
          <button
            type="button"
            className="action ghost"
            disabled={busy}
            onClick={() => selectTab('settings')}
          >
            Settings
          </button>
          {clientVersion ? (
            <span className="sidebar-footer-version" title="Installed app version">
              v{clientVersion}
            </span>
          ) : null}
        </div>
      </aside>

      <div className="main-column">
        {((error && shouldSurfaceApiError(error)) ||
          (toast && toast !== error) ||
          offlineFeeBanner) ? (
          <div className="app-toast-stack">
            {error && shouldSurfaceApiError(error) ? (
              <p className="banner error" role="alert">
                <span>{error}</span>
                <button
                  type="button"
                  className="banner-close"
                  onClick={() => setError(null)}
                  aria-label="Dismiss message"
                >
                  ×
                </button>
              </p>
            ) : null}
            {toast && toast !== error ? (
              <p
                className={`banner ${toastKind === 'ok' ? 'ok' : toastKind}`}
                role="status"
                aria-live="polite"
              >
                <span>{toast}</span>
                <button
                  type="button"
                  className="banner-close"
                  onClick={() => setToast(null)}
                  aria-label="Dismiss message"
                >
                  ×
                </button>
              </p>
            ) : null}
            {offlineFeeBanner ? (
              <p className="banner warn" role="status">
                <span>
                  {offlineFeeBanner.capped
                    ? `Away ~${offlineFeeBanner.daysAway} economy days · passive fees charged for ${offlineFeeBanner.daysBilled} days (${formatMoney(offlineFeeBanner.passiveDebitUsd)} hangar/storage/staff).`
                    : 'Welcome back.'}
                  {(offlineFeeBanner.lease?.termEndedSoftIds.length ?? 0) > 0
                    ? ' A lease term ended while away — return or buy out in Hangar.'
                    : ''}
                </span>
                <button
                  type="button"
                  className="banner-close"
                  onClick={() => setOfflineFeeBanner(null)}
                  aria-label="Dismiss offline fee notice"
                >
                  ×
                </button>
              </p>
            ) : null}
          </div>
        ) : null}
        <header className="topbar">
          <div className="topbar-title">
            <button
              type="button"
              className="sidebar-toggle"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
            >
              Menu
            </button>
            <h1>
              {pageTitle}
              {pageHelp ? <PageHelpButton help={pageHelp} /> : null}
            </h1>
            <p className="lede">
              {pageLede}
              {showAirport ? (
                <>
                  {' · '}
                  <span
                    className="terminal-level"
                    title={
                      airportView.hubLevel
                        ? [
                            airportView.hubLevel.xpForNext != null
                              ? `${airportView.hubLevel.progressPct}% to terminal level ${airportView.hubLevel.level + 1}`
                              : 'Max terminal level',
                            `Cap ×${airportView.hubLevel.capacityMult.toFixed(2)} · Flow ×${airportView.hubLevel.flowMult.toFixed(2)}`,
                            airportView.hubLevel.laneBonus > 0
                              ? `+${airportView.hubLevel.laneBonus} lane lots`
                              : null,
                            airportView.hubLevel.originPayMult > 1
                              ? `origin pay ×${airportView.hubLevel.originPayMult.toFixed(2)}`
                              : null,
                            airportView.hubLevel.quiet ? 'quiet terminal' : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : undefined
                    }
                  >
                    terminal level {airportView.airport.level}
                    {airportView.hubLevel ? (
                      <span className="terminal-level-bar" aria-hidden="true">
                        <span
                          style={{
                            width: `${Math.min(100, airportView.hubLevel.progressPct)}%`,
                          }}
                        />
                      </span>
                    ) : null}
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <div className="topbar-update-slot">
            <DesktopUpdateHeaderButton
              forceMinClientVersion={
                clientUpdateBlock?.minClientVersion ?? null
              }
              onOpenSettings={() => selectTab('settings')}
            />
          </div>
          <div className="topbar-metrics">
            {catchUpBanner ? (
              <EconomySyncIndicator status={catchUpBanner} />
            ) : null}
            {careerReady && (authRequired || worldFixed) && worldPresence ? (
              <div
                className="metric"
                title={
                  worldPresence.recent.length > 0
                    ? worldPresence.recent
                        .map((r) => `${r.companyDisplayName}: ${r.summary}`)
                        .join('\n')
                    : 'Pilots with a live session on this world (last seen ≤5 min)'
                }
              >
                <span className="label">Online</span>
                <strong>{worldPresence.onlineCount}</strong>
              </div>
            ) : null}
            {careerReady ? (
              authRequired || worldFixed ? (
                <div
                  className="metric"
                  title="Your personal company (home) — stays put while browsing an airline"
                >
                  <span className="label">Company</span>
                  <strong>
                    {companies.find(
                      (c) => c.id === (homeCompanyId || activeCompanyId),
                    )?.displayName ||
                      companies[0]?.displayName ||
                      homeCompanyId ||
                      activeCompanyId ||
                      '—'}
                  </strong>
                </div>
              ) : (
                <label
                  className="metric company-switcher"
                  title="Company tenant (dual-tab lab: ?company=)"
                >
                  <span className="label">Company</span>
                  <span className="company-switcher-controls">
                    <select
                      value={activeCompanyId}
                      disabled={busy}
                      aria-label="Active company"
                      onChange={(e) => {
                        const next = e.target.value;
                        void run(() => switchCompany(next));
                      }}
                    >
                      {(companies.length > 0
                        ? companies
                        : [
                            {
                              id: activeCompanyId || LOCAL_COMPANY_ID,
                              displayName:
                                activeCompanyId || LOCAL_COMPANY_ID,
                            },
                          ]
                      ).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.displayName || c.id}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="company-new-btn"
                      disabled={busy}
                      title="Create empty company on this world"
                      onClick={() => {
                        void run(() => createCompanyAndSwitch());
                      }}
                    >
                      +
                    </button>
                  </span>
                </label>
              )
            ) : null}
            {careerReady && pilotIcao ? (
              <button
                type="button"
                className="metric pilot-chip"
                disabled={busy}
                title="Travel pilot or ferry aircraft"
                aria-haspopup="dialog"
                aria-label={`Pilot at ${pilotIcao}. Open travel or ferry.`}
                onClick={() => openPilotTravel()}
              >
                <span className="label">
                  Pilot
                  <span className="pilot-chip-action">Move</span>
                </span>
                <strong>
                  {pilotIcao}
                  <span className="pilot-chip-caret" aria-hidden>
                    ›
                  </span>
                </strong>
              </button>
            ) : null}
            <div className="metric">
              <span className="label">Wallet</span>
              <strong>{careerStateReady ? formatMoney(wallet) : '…'}</strong>
            </div>
            <div className="metric world-clock" title={worldClockTitle}>
              <span className="label">{worldClockLabel}</span>
              <strong>{formatClock(continuousHours)}</strong>
            </div>
          </div>
          {devMode ? (
            <div className="topbar-actions">
              <button
                type="button"
                className="action"
                onClick={() => void onTick(96)}
                disabled={busy}
                title="Advance economy + crew wall-clock by 1 day (96 ticks)"
              >
                {formatTickAdvanceButton(96, '+1 day')}
              </button>
              <button
                type="button"
                className="action"
                onClick={() => void onTick(96 * 3)}
                disabled={busy}
                title="Advance economy + crew wall-clock by 3 days (288 ticks)"
              >
                {formatTickAdvanceButton(96 * 3, '+3 day')}
              </button>
              <button
                type="button"
                className="action"
                onClick={() => void onTick(96 * 7)}
                disabled={busy}
                title="Advance economy + crew wall-clock by 7 days (672 ticks)"
              >
                {formatTickAdvanceButton(96 * 7, '+7 day')}
              </button>
              <button
                type="button"
                className="action"
                onClick={() => void onTick(96 * 14)}
                disabled={busy}
                title="Advance economy + crew wall-clock by 14 days (1344 ticks)"
              >
                {formatTickAdvanceButton(96 * 14, '+14 day')}
              </button>
              <button
                type="button"
                className="action"
                onClick={() => void onTick(96 * 30)}
                disabled={busy}
                title="Advance economy + crew wall-clock by 30 days (2880 ticks)"
              >
                {formatTickAdvanceButton(96 * 30, '+30 day')}
              </button>
              <button
                type="button"
                className="action ghost"
                onClick={() => void onDebugCreditWallet(5_000)}
                disabled={busy}
                title="Dev Mode — add $5,000 to the wallet"
              >
                +$5K
              </button>
              <button
                type="button"
                className="action ghost"
                onClick={() => void onDebugCreditWallet(100_000)}
                disabled={busy}
                title="Dev Mode — add $100,000 to the wallet"
              >
                +$100K
              </button>
              <button
                type="button"
                className="action ghost"
                onClick={() => void onDebugClaimSantos()}
                disabled={busy}
                title="Dev Mode — force Port FBO at Port of Santos (BRSSZ) for the active company"
              >
                Claim Santos
              </button>
            </div>
          ) : null}
        </header>

        <div className="main-content">
      {!careerStateReady ? (
        <BusyBoot
          title="Opening career…"
          detail="Loading company wallet and hub — home hub comes next if you have not chosen one yet."
        />
      ) : !hubSelected ? (
        <section className="panel hub-picker" role="dialog" aria-labelledby="hub-picker-title">
          <div className="panel-head">
            <div>
              <h2 id="hub-picker-title">
                {signupPilotLocked ? 'Choose home hub' : 'Create pilot profile'}
              </h2>
              <p>
                {signupPilotLocked ? (
                  <>
                    Playing as <strong>{signupPilotResolved}</strong>. Pick your
                    home hub — you start as a contract pilot until you buy or
                    lease your first aircraft.
                  </>
                ) : (
                  <>
                    Choose a callsign and home hub. You start as a contract pilot
                    — fly Operator aircraft offers until you buy
                    or lease your first aircraft.
                  </>
                )}
              </p>
            </div>
          </div>
          <form
            className="pilot-signup"
            onSubmit={(e) => {
              e.preventDefault();
              void onSelectHub();
            }}
          >
            {signupPilotLocked ? null : (
              <label className="pilot-field">
                Pilot name
                <input
                  type="text"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  maxLength={40}
                  minLength={2}
                  placeholder="e.g. Ada Airframe"
                  disabled={busy}
                  autoComplete="nickname"
                  required
                />
              </label>
            )}
            <div className="pilot-signup-hubs">
              <label className="pilot-field">
                Country
                <select
                  value={signupCountry}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSignupCountry(next);
                    if (!signupHub) return;
                    const selected = signupCargoHubs.find(
                      (hub) => hub.icao === signupHub,
                    );
                    if (
                      next &&
                      selected &&
                      countryIdFromRegion(selected.region) !== next
                    ) {
                      setSignupHub('');
                    }
                  }}
                  disabled={busy}
                  aria-label="Filter home hubs by country"
                >
                  <option value="">All countries</option>
                  {signupCountries.map((country) => (
                    <option key={country.id} value={country.id}>
                      {country.label} ({country.id})
                    </option>
                  ))}
                </select>
              </label>
              <label className="pilot-field">
                Home hub
                <FerryHubCombobox
                  id="signup-home-hub"
                  hubs={signupHubsForCountry.map((hub) => ({
                    icao: hub.icao,
                    name: hub.name,
                    region: hub.region,
                    detail: [
                      hubTierLabel(hub.hubTier),
                      countryDisplayName(
                        countryIdFromRegion(hub.region),
                        hub.region,
                      ),
                    ]
                      .filter(Boolean)
                      .join(' · '),
                  }))}
                  value={signupHub}
                  onChange={setSignupHub}
                  disabled={busy}
                  plainText
                  maxResults={signupCountry ? 40 : 16}
                  placeholder="Type ICAO, city, or country…"
                />
              </label>
            </div>
            <button
              type="submit"
              className="accept"
              disabled={
                busy ||
                signupPilotResolved.length < 2 ||
                !signupHub
              }
            >
              Start career
            </button>
          </form>
        </section>
      ) : null}

      {hubSelected && showAirport ? (
        <section
          className="panel airport-panel"
          aria-busy={airportHydrating || undefined}
        >
          {airportView.airport.bushTripOnly ? (
            <p className="banner warn" role="status">
              Trip-only strip — no cargo terminal, Market freights, or ferry.
              Reserved for bush-trip routing (board temporarily disabled).
            </p>
          ) : airportView.airport.bush ? (
            <p className="banner warn" role="status">
              Bush soft-field — no ferry in or out. Market freights do not form
              here. Light GA bush trips are temporarily unavailable.
            </p>
          ) : null}
          <nav className="terminal-sections" aria-label="Terminal sections">
            <button
              type="button"
              className={
                terminalSection === 'airport'
                  ? 'terminal-section active'
                  : 'terminal-section'
              }
              onClick={() => setTerminalSection('airport')}
              disabled={busy}
            >
              Airport
            </button>
            <button
              type="button"
              className={
                terminalSection === 'inventory'
                  ? 'terminal-section active'
                  : 'terminal-section'
              }
              onClick={() => setTerminalSection('inventory')}
              disabled={busy}
            >
              Inventory
              {airportView.events && airportView.events.length > 0
                ? ` · ${airportView.events.length} event${airportView.events.length === 1 ? '' : 's'}`
                : ''}
            </button>
            <button
              type="button"
              className={
                terminalSection === 'contracts'
                  ? 'terminal-section active'
                  : 'terminal-section'
              }
              onClick={() => {
                setContractsLane('outbound');
                setContractsPage(1);
                setSelectedContractLotId(null);
                setTerminalSection('contracts');
              }}
              disabled={busy}
            >
              Contracts ({terminalContractCount})
            </button>
            <button
              type="button"
              className={
                terminalSection === 'movements'
                  ? 'terminal-section active'
                  : 'terminal-section'
              }
              onClick={() => setTerminalSection('movements')}
              disabled={busy}
            >
              Movements ({terminalMovementCount})
            </button>
            <button
              type="button"
              className={
                terminalSection === 'stats'
                  ? 'terminal-section active'
                  : 'terminal-section'
              }
              onClick={() => setTerminalSection('stats')}
              disabled={busy}
            >
              Stats
            </button>
            {airportIcao ? (
              <button
                type="button"
                className={
                  terminalSection === 'fbo'
                    ? 'terminal-section active'
                    : 'terminal-section'
                }
                onClick={() => setTerminalSection('fbo')}
                disabled={busy}
              >
                Base
                {playerFbos?.holds.length
                  ? ` (${playerFbos.holds.filter((h) => h.originIcao.toUpperCase() === airportIcao.toUpperCase()).length})`
                  : ''}
              </button>
            ) : null}
          </nav>

                {terminalSection === 'airport' ? (
                  <TerminalAirportPanel
                    airport={airportView.airport}
                    hubLevel={airportView.hubLevel}
                    runways={airportView.runways ?? []}
                    homeHubIcao={airportView.homeHubIcao}
                    hydrating={airportHydrating}
                    regionDisplay={regionLabel(airportView.airport.region)}
                  />
                ) : null}

                {terminalSection === 'stats' && airportIcao ? (
                  <TerminalHubStatsPanel
                    icao={airportIcao}
                    stats={hubStats}
                    loading={hubStatsLoading}
                    error={hubStatsError}
                    weightSystem={weightSystem}
                  />
                ) : null}

                {terminalSection === 'fbo' ? (
                  <>
                    <div className="panel-head">
                      <div>
                        <h2>Base</h2>
                        {(() => {
                          const headerFbo = (playerFbos?.fbos ?? []).find(
                            (f) =>
                              f.icao.toUpperCase() ===
                              (airportIcao ?? '').toUpperCase(),
                          );
                          if (!headerFbo) return null;
                          const parkPct = Math.round(
                            (1 - (headerFbo.parkingFeeMult ?? 1)) * 100,
                          );
                          const svcPct = Math.round(
                            (1 - (headerFbo.serviceCostMult ?? 1)) * 100,
                          );
                          return (
                            <p className="muted base-tier-line">
                              T{headerFbo.tier}
                              {parkPct > 0
                                ? ` · −${parkPct}% parking`
                                : ''}
                              {svcPct > 0
                                ? ` · −${svcPct}% Jet-A/MRO`
                                : ''}
                            </p>
                          );
                        })()}
                        {(playerFbos?.fbos.length ?? 0) >= 1 &&
                        (!(playerFbos?.fbos ?? []).some(
                          (f) =>
                            f.icao.toUpperCase() ===
                            (airportIcao ?? '').toUpperCase(),
                        ) ||
                          (playerFbos?.fbos.length ?? 0) > 1) ? (
                          <div
                            className="fbo-icao-switcher"
                            role="group"
                            aria-label="Owned Bases"
                          >
                            {playerFbos!.fbos.map((f) => {
                              const active =
                                f.icao.toUpperCase() ===
                                (airportIcao ?? '').toUpperCase();
                              return (
                                <button
                                  key={f.id}
                                  type="button"
                                  className={
                                    active
                                      ? 'fbo-icao-chip active'
                                      : 'fbo-icao-chip'
                                  }
                                  disabled={busy || active}
                                  onClick={() =>
                                    void openAirport(f.icao, {
                                      section: 'fbo',
                                    })
                                  }
                                >
                                  {f.icao}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                      {playerFbos?.canBuyAtIcao ||
                      (playerFbos?.canBuyAtHome &&
                        airportIcao?.toUpperCase() ===
                          homeHubIcao.toUpperCase()) ? (
                        <button
                          type="button"
                          className="action"
                          disabled={busy}
                          onClick={() => void onBuyFbo(airportIcao ?? homeHubIcao)}
                        >
                          Buy T1
                          {(playerFbos.buyAtIcaoUsd ?? playerFbos.homeBuyUsd) ===
                          0
                            ? ' · Free'
                            : (playerFbos.buyAtIcaoUsd ??
                                  playerFbos.homeBuyUsd) != null
                              ? ` · ${formatMoney(playerFbos.buyAtIcaoUsd ?? playerFbos.homeBuyUsd!)}`
                              : ''}
                        </button>
                      ) : null}
                    </div>
                    {(() => {
                      const localFbo = (playerFbos?.fbos ?? []).find(
                        (f) =>
                          f.icao.toUpperCase() ===
                          (airportIcao ?? '').toUpperCase(),
                      );
                      const localHolds = (playerFbos?.holds ?? []).filter(
                        (h) =>
                          h.originIcao.toUpperCase() ===
                          (airportIcao ?? '').toUpperCase(),
                      );
                      if (!localFbo) {
                        const hub = (airportIcao ?? '').toUpperCase();
                        const home = homeHubIcao.trim().toUpperCase();
                        const ownedElsewhere = (playerFbos?.fbos ?? [])
                          .map((f) => f.icao.trim().toUpperCase())
                          .filter((icao) => icao && icao !== hub);
                        const emptyHint =
                          ownedElsewhere.length > 0
                            ? `Your Base is at ${ownedElsewhere.join(', ')}. Open it above${
                                playerFbos?.buyAtIcaoReason
                                  ? ` — ${playerFbos.buyAtIcaoReason}`
                                  : ''
                              }.`
                            : playerFbos?.buyAtIcaoReason ||
                              (playerFbos?.canBuyAtHome && hub && hub !== home
                                ? `First base must be at home hub ${home}`
                                : null) ||
                              'No Base at this hub';
                        return <p className="empty">{emptyHint}</p>;
                      }
                      const seat =
                        (baseDispatcher?.members ?? []).find(
                          (m) => m.fboId === localFbo.id,
                        ) ?? null;
                      const hirePool =
                        baseDispatcher?.hirePoolByHub?.[localFbo.icao] ?? [];
                      return (
                        <>
                          <div className="panel-head base-tier-head">
                            <div className="base-header-main">
                              <div className="base-dispatcher-compact">
                                {seat ? (
                                  <>
                                    <CrewPortrait
                                      name={seat.displayName}
                                      imageUrl={crewPortraitUrl(
                                        seat.portraitId,
                                      )}
                                    />
                                    <div className="base-dispatcher-compact-meta">
                                      <span className="base-dispatcher-compact-name">
                                        {seat.displayName}
                                        {seat.gradeLabel ? (
                                          <span className="crew-perk-tag">
                                            {seat.gradeLabel}
                                          </span>
                                        ) : null}
                                      </span>
                                      <span
                                        className="muted"
                                        title={seat.perkHint ?? undefined}
                                      >
                                        {formatMoney(seat.salaryUsdPerDay)}/day
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      className="action ghost base-dispatcher-compact-fire"
                                      disabled={busy || dispatchHireBusy}
                                      onClick={() =>
                                        void onFireBaseDispatcher(seat.id)
                                      }
                                    >
                                      Fire ·{' '}
                                      {formatMoney(seat.fireSeveranceUsd)}
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    className="action ghost"
                                    disabled={busy || dispatchHireBusy}
                                    onClick={() => {
                                      setBaseDispatcherHireOpen((open) => !open);
                                      if (
                                        !baseDispatcherHireOpen &&
                                        hirePool.length === 0 &&
                                        !dispatchScoutLoading
                                      ) {
                                        const hub =
                                          localFbo.icao.trim().toUpperCase();
                                        setDispatchScoutLoading(true);
                                        void postBaseDispatcher({
                                          action: 'refresh',
                                          hubIcao: hub,
                                        })
                                          .then((desk) => {
                                            if (desk.dispatcher) {
                                              setBaseDispatcher(desk.dispatcher);
                                            }
                                            if (desk.policy) {
                                              setDispatchScoutPolicy(
                                                desk.policy,
                                              );
                                            }
                                          })
                                          .catch((err: unknown) => {
                                            setToastKind('fail');
                                            setToast(
                                              err instanceof Error
                                                ? err.message
                                                : String(err),
                                            );
                                          })
                                          .finally(() => {
                                            setDispatchScoutLoading(false);
                                          });
                                      }
                                    }}
                                  >
                                    {baseDispatcherHireOpen
                                      ? 'Close hire'
                                      : 'Hire Dispatcher'}
                                  </button>
                                )}
                              </div>
                            </div>
                            {localFbo.canUpgradeToTier2 ? (
                              <button
                                type="button"
                                className="action"
                                disabled={busy}
                                onClick={() => void onUpgradeFbo(localFbo.id)}
                              >
                                Upgrade T2
                                {localFbo.upgradeUsd != null
                                  ? ` · ${formatMoney(localFbo.upgradeUsd)}`
                                  : ''}
                              </button>
                            ) : null}
                          </div>

                          {!seat && baseDispatcherHireOpen ? (
                            <div className="base-dispatcher-hire-strip">
                              {dispatchScoutLoading ? (
                                <p className="empty">Loading candidates…</p>
                              ) : hirePool.length === 0 ? (
                                <div className="base-dispatcher-empty">
                                  <p className="empty">
                                    No Dispatcher candidates yet.
                                  </p>
                                  <button
                                    type="button"
                                    className="action ghost"
                                    disabled={busy || dispatchHireBusy}
                                    onClick={() => {
                                      const hub =
                                        localFbo.icao.trim().toUpperCase();
                                      setDispatchScoutLoading(true);
                                      void postBaseDispatcher({
                                        action: 'refresh',
                                        hubIcao: hub,
                                      })
                                        .then((desk) => {
                                          if (desk.dispatcher) {
                                            setBaseDispatcher(desk.dispatcher);
                                          }
                                          if (desk.policy) {
                                            setDispatchScoutPolicy(desk.policy);
                                          }
                                        })
                                        .catch((err: unknown) => {
                                          setToastKind('fail');
                                          setToast(
                                            err instanceof Error
                                              ? err.message
                                              : String(err),
                                          );
                                        })
                                        .finally(() => {
                                          setDispatchScoutLoading(false);
                                        });
                                    }}
                                  >
                                    Refresh candidates
                                  </button>
                                </div>
                              ) : (
                                <ul className="crew-person-grid base-dispatcher-hire-grid">
                                  {hirePool.map((c) => (
                                    <li
                                      key={c.id}
                                      className="crew-person-card is-hire"
                                    >
                                      <CrewPortrait
                                        name={c.displayName}
                                        imageUrl={crewPortraitUrl(c.portraitId)}
                                      />
                                      <div className="crew-person-body">
                                        <div className="crew-person-head">
                                          <strong className="crew-person-name">
                                            {c.displayName}
                                          </strong>
                                          <span className="crew-perk-tag">
                                            {c.gradeLabel}
                                          </span>
                                        </div>
                                        <p className="crew-card-meta">
                                          {formatMoney(c.salaryUsdPerDay)}/day
                                        </p>
                                        {c.perkHint ? (
                                          <p className="crew-person-perk muted">
                                            {c.perkHint}
                                          </p>
                                        ) : null}
                                        <div className="crew-card-actions">
                                          <button
                                            type="button"
                                            className="accept"
                                            disabled={
                                              busy || dispatchHireBusy
                                            }
                                            onClick={() =>
                                              void onHireBaseDispatcher(
                                                localFbo.id,
                                                c.id,
                                              )
                                            }
                                          >
                                            Hire · {formatMoney(c.hireUsd)}
                                          </button>
                                        </div>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ) : null}

                          <div className="base-dispatcher-desk ports-desk-block">
                            {(() => {
                              const mode =
                                dispatchScoutPolicy?.mode ?? 'manual';
                              return (
                                <>
                                  <nav
                                    className="contracts-lanes base-dispatch-products"
                                    aria-label="Base Dispatcher product"
                                  >
                                    <button
                                      type="button"
                                      className={
                                        baseDispatchProduct === 'freight'
                                          ? 'contracts-lane active'
                                          : 'contracts-lane'
                                      }
                                      disabled={
                                        charterActiveTour?.status === 'active'
                                      }
                                      title={
                                        charterActiveTour?.status === 'active'
                                          ? 'Drop the Charter tour first'
                                          : undefined
                                      }
                                      onClick={() =>
                                        setBaseDispatchProduct('freight')
                                      }
                                    >
                                      Freight
                                    </button>
                                    <button
                                      type="button"
                                      className={
                                        baseDispatchProduct === 'charter'
                                          ? 'contracts-lane active'
                                          : 'contracts-lane'
                                      }
                                      disabled={
                                        activeTour?.status === 'active'
                                      }
                                      title={
                                        activeTour?.status === 'active'
                                          ? 'Drop the Freight tour first'
                                          : undefined
                                      }
                                      onClick={() => {
                                        setBaseDispatchProduct('charter');
                                        setSelectedDispatchTourId(null);
                                        setSelectedCharterTourId(null);
                                      }}
                                    >
                                      Charter
                                    </button>
                                  </nav>

                                  {baseDispatchProduct === 'charter' &&
                                  charterActiveTour &&
                                  charterActiveTour.status === 'active' ? (
                                    <div className="crew-section base-active-tour">
                                      <div className="base-dispatcher-scout-head">
                                        <TourRouteLabel
                                          className="route base-active-tour-route"
                                          routeLabel={
                                            charterActiveTour.routeLabel ||
                                            charterActiveTour.legs
                                              .map(
                                                (l) =>
                                                  `${l.originIcao}→${l.destIcao}`,
                                              )
                                              .join('→')
                                          }
                                          onOpenAirport={openAirport}
                                          busy={busy}
                                        />
                                        <div className="base-dispatcher-scout-actions">
                                          <button
                                            type="button"
                                            className="action ghost"
                                            disabled={busy || dispatchTourBusy}
                                            onClick={() =>
                                              void onRefreshCharterActiveTour()
                                            }
                                          >
                                            Refresh
                                          </button>
                                          <button
                                            type="button"
                                            className="action ghost"
                                            disabled={busy || dispatchTourBusy}
                                            onClick={() =>
                                              void onDropCharterActiveTour()
                                            }
                                          >
                                            Drop
                                          </button>
                                        </div>
                                      </div>
                                      <div className="base-active-tour-legs">
                                        <table className="data-table base-active-tour-table">
                                          <thead>
                                            <tr>
                                              <th>Leg</th>
                                              <th>Route</th>
                                              <th>Dist</th>
                                              <th>Pax</th>
                                              <th>Net</th>
                                              <th>Exp</th>
                                              <th />
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {charterActiveTour.legs.map(
                                              (leg) => {
                                                const isNext =
                                                  charterActiveTour.nextLegIndex ===
                                                  leg.index;
                                                const expLabel =
                                                  leg.status === 'done' ||
                                                  leg.status === 'lost'
                                                    ? '—'
                                                    : leg.offerExpired
                                                      ? 'expired'
                                                      : leg.ticksRemaining !=
                                                          null
                                                        ? charterExpiryLabel(
                                                            leg.ticksRemaining,
                                                          )
                                                        : '—';
                                                const ferryMatch =
                                                  charterActiveTour.resumeHint?.match(
                                                    /Ferry to ([A-Z0-9]{3,4})/i,
                                                  );
                                                const canContinue =
                                                  isNext &&
                                                  leg.status === 'planned' &&
                                                  !leg.offerExpired &&
                                                  (charterActiveTour.canAcceptNextLeg ||
                                                    Boolean(ferryMatch));
                                                const continueLabel =
                                                  charterActiveTour.canAcceptNextLeg
                                                    ? `Accept L${leg.index}`
                                                    : ferryMatch
                                                      ? `Continue · Ferry to ${ferryMatch[1]!.toUpperCase()}`
                                                      : `Continue L${leg.index}`;
                                                return (
                                                  <tr
                                                    key={`${charterActiveTour.id}-${leg.index}`}
                                                    className={
                                                      [
                                                        isNext
                                                          ? 'is-tour-next'
                                                          : '',
                                                        leg.offerExpired
                                                          ? 'warn'
                                                          : '',
                                                      ]
                                                        .filter(Boolean)
                                                        .join(' ') || undefined
                                                    }
                                                  >
                                                    <td>L{leg.index}</td>
                                                    <td>
                                                      <TourRouteLabel
                                                        routeLabel={`${leg.originIcao}→${leg.destIcao}`}
                                                        onOpenAirport={
                                                          openAirport
                                                        }
                                                        busy={busy}
                                                      />
                                                    </td>
                                                    <td>
                                                      {formatBoardDistanceNm(
                                                        leg.distanceNm,
                                                      )}
                                                    </td>
                                                    <td>{leg.groupSize}</td>
                                                    <td>
                                                      {formatMoney(leg.netUsd)}
                                                    </td>
                                                    <td
                                                      title={
                                                        leg.expiresAtTick !=
                                                        null
                                                          ? `expires at tick ${leg.expiresAtTick}`
                                                          : undefined
                                                      }
                                                    >
                                                      {expLabel}
                                                    </td>
                                                    <td>
                                                      {canContinue ? (
                                                        <button
                                                          type="button"
                                                          className="accept"
                                                          disabled={
                                                            busy ||
                                                            dispatchTourBusy
                                                          }
                                                          onClick={() =>
                                                            void onAcceptCharterTourLeg(
                                                              leg.index,
                                                            )
                                                          }
                                                        >
                                                          {continueLabel}
                                                        </button>
                                                      ) : null}
                                                    </td>
                                                  </tr>
                                                );
                                              },
                                            )}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  ) : null}

                                  {baseDispatchProduct === 'freight' &&
                                  activeTour &&
                                  activeTour.status === 'active' ? (
                                    <div className="crew-section base-active-tour">
                                      <div className="base-dispatcher-scout-head">
                                        <TourRouteLabel
                                          className="route base-active-tour-route"
                                          routeLabel={
                                            activeTour.routeLabel ||
                                            activeTour.legs
                                              .map(
                                                (l) =>
                                                  `${l.originIcao}→${l.destIcao}`,
                                              )
                                              .join('→')
                                          }
                                          onOpenAirport={openAirport}
                                          busy={busy}
                                        />
                                        <div className="base-dispatcher-scout-actions">
                                          <button
                                            type="button"
                                            className="action ghost"
                                            disabled={busy || dispatchTourBusy}
                                            onClick={() =>
                                              void onRefreshActiveTour()
                                            }
                                          >
                                            Refresh
                                          </button>
                                          <button
                                            type="button"
                                            className="action ghost"
                                            disabled={busy || dispatchTourBusy}
                                            onClick={() =>
                                              void onDropActiveTour()
                                            }
                                          >
                                            Drop
                                          </button>
                                        </div>
                                      </div>
                                      {activeTour.resumeHint &&
                                      activeTour.resumeState !==
                                        'in_progress' ? (
                                        <p
                                          className={
                                            activeTour.resumeState ===
                                            'stranded'
                                              ? 'banner warn base-tour-resume-banner'
                                              : activeTour.resumeState ===
                                                  'ready'
                                                ? 'banner ok base-tour-resume-banner'
                                                : 'banner base-tour-resume-banner'
                                          }
                                          role="status"
                                        >
                                          <span>{activeTour.resumeHint}</span>
                                          {activeTour.resumeState ===
                                          'stranded' ? (
                                            <button
                                              type="button"
                                              className="linkish"
                                              disabled={
                                                busy || dispatchTourBusy
                                              }
                                              onClick={() =>
                                                void onDropActiveTour()
                                              }
                                            >
                                              Drop tour
                                            </button>
                                          ) : null}
                                        </p>
                                      ) : null}
                                      <div className="table-wrap">
                                        <table className="data base-active-tour-table">
                                          <thead>
                                            <tr>
                                              <th>Leg</th>
                                              <th>Route</th>
                                              <th>Pay</th>
                                              <th />
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {activeTour.legs.map((leg) => {
                                              const isNext =
                                                activeTour.nextLegIndex ===
                                                leg.index;
                                              const canAccept =
                                                Boolean(
                                                  activeTour.canAcceptNextLeg,
                                                ) && isNext;
                                              const canContinue =
                                                isNext &&
                                                (canAccept ||
                                                  activeTour.resumeState ===
                                                    'blocked');
                                              const ferryMatch =
                                                activeTour.acceptBlockedReason?.match(
                                                  /Ferry to ([A-Z0-9]{3,4})/i,
                                                );
                                              const continueLabel = canAccept
                                                ? `Accept L${leg.index}`
                                                : ferryMatch
                                                  ? `Continue · Ferry to ${ferryMatch[1]!.toUpperCase()}`
                                                  : `Continue L${leg.index}`;
                                              return (
                                                <tr
                                                  key={`${activeTour.id}-${leg.index}`}
                                                  className={
                                                    isNext
                                                      ? 'is-tour-next'
                                                      : undefined
                                                  }
                                                >
                                                  <td>L{leg.index}</td>
                                                  <td>
                                                    <TourRouteLabel
                                                      routeLabel={`${leg.originIcao}→${leg.destIcao}`}
                                                      onOpenAirport={openAirport}
                                                      busy={busy}
                                                    />
                                                  </td>
                                                  <td className="pay">
                                                    {formatMoney(leg.payUsd)}
                                                  </td>
                                                  <td className="actions">
                                                    {canContinue ? (
                                                      <button
                                                        type="button"
                                                        className="accept"
                                                        disabled={
                                                          busy ||
                                                          dispatchTourBusy
                                                        }
                                                        onClick={() =>
                                                          void onAcceptActiveTourLeg(
                                                            leg.index,
                                                          )
                                                        }
                                                      >
                                                        {continueLabel}
                                                      </button>
                                                    ) : isNext &&
                                                      activeTour.acceptBlockedReason ? (
                                                      <small className="muted">
                                                        {
                                                          activeTour.acceptBlockedReason
                                                        }
                                                      </small>
                                                    ) : null}
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  ) : null}

                                  {baseDispatchProduct === 'freight' ? (
                                  <div className="crew-section base-dispatcher-scout">
                                    <div className="base-dispatcher-scout-head">
                                      <h4 className="crew-section-title">
                                        Freights
                                      </h4>
                                    </div>

                                    {activeTour?.status === 'active' ? (
                                      <p className="empty muted">
                                        Finish or Drop the Freight tour above to
                                        Search again.
                                      </p>
                                    ) : (
                                      <>
                                    {mode === 'fleet' ? (
                                      <div className="base-dispatch-tour-filters">
                                        <div className="base-dispatch-tour-grid">
                                          <label>
                                            <span>Aircraft</span>
                                            <select
                                              value={dispatchTourAircraftId}
                                              onChange={(e) =>
                                                setDispatchTourAircraftId(
                                                  e.target.value,
                                                )
                                              }
                                              disabled={
                                                busy || dispatchTourBusy
                                              }
                                            >
                                              <option value="">
                                                Any parked
                                              </option>
                                              {fleet
                                                .filter(
                                                  (a) => a.status === 'parked',
                                                )
                                                .map((a) => (
                                                  <option
                                                    key={a.id}
                                                    value={a.id}
                                                  >
                                                    {a.label ??
                                                      a.registration ??
                                                      a.airframeTypeId ??
                                                      a.id}
                                                    {a.locationIcao
                                                      ? ` @ ${a.locationIcao}`
                                                      : ''}
                                                  </option>
                                                ))}
                                            </select>
                                          </label>
                                          <label>
                                            <span>Legs</span>
                                            <select
                                              value={dispatchTourLegs}
                                              onChange={(e) => {
                                                const n = Number(e.target.value);
                                                setDispatchTourLegs(
                                                  n === 4
                                                    ? 4
                                                    : n === 3
                                                      ? 3
                                                      : n === 2
                                                        ? 2
                                                        : 1,
                                                );
                                                if (n === 1) {
                                                  setDispatchTourReturnMode(
                                                    'none',
                                                  );
                                                }
                                              }}
                                              disabled={
                                                busy || dispatchTourBusy
                                              }
                                            >
                                              <option value={1}>1</option>
                                              <option value={2}>2</option>
                                              <option value={3}>3</option>
                                              <option value={4}>4</option>
                                            </select>
                                          </label>
                                          <label>
                                            <span>Origin</span>
                                            <input
                                              type="text"
                                              maxLength={4}
                                              placeholder={localFbo.icao}
                                              value={dispatchTourOrigin}
                                              onChange={(e) =>
                                                setDispatchTourOrigin(
                                                  e.target.value
                                                    .toUpperCase()
                                                    .replace(/[^A-Z]/g, '')
                                                    .slice(0, 4),
                                                )
                                              }
                                              disabled={
                                                busy || dispatchTourBusy
                                              }
                                            />
                                          </label>
                                          <label
                                            title="Minimum revenue-leg distance (each cargo/charter leg). Dist column is the tour total."
                                          >
                                            <span>Min nm/leg</span>
                                            <input
                                              type="number"
                                              min={0}
                                              step={10}
                                              placeholder="auto"
                                              value={dispatchTourMinNm}
                                              onChange={(e) =>
                                                setDispatchTourMinNm(
                                                  e.target.value,
                                                )
                                              }
                                              disabled={
                                                busy || dispatchTourBusy
                                              }
                                            />
                                          </label>
                                          <label
                                            title="Maximum revenue-leg distance (each cargo/charter leg). Dist column is the tour total — 2 legs × 3000 can show ~6000 nm."
                                          >
                                            <span>Max nm/leg</span>
                                            <input
                                              type="number"
                                              min={0}
                                              step={50}
                                              placeholder="—"
                                              value={dispatchTourMaxNm}
                                              onChange={(e) =>
                                                setDispatchTourMaxNm(
                                                  e.target.value,
                                                )
                                              }
                                              disabled={
                                                busy || dispatchTourBusy
                                              }
                                            />
                                          </label>
                                          <label
                                            title="Max reposition between legs (default 200). First hop may be up to 2× (e.g. 200 → 400 nm). Ferry column sums all hops."
                                          >
                                            <span>Max ferry/hop</span>
                                            <input
                                              type="number"
                                              min={40}
                                              max={800}
                                              step={20}
                                              value={dispatchTourMaxFerryNm}
                                              onChange={(e) =>
                                                setDispatchTourMaxFerryNm(
                                                  e.target.value,
                                                )
                                              }
                                              disabled={
                                                busy || dispatchTourBusy
                                              }
                                            />
                                          </label>
                                          {dispatchTourLegs > 1 ? (
                                            <label>
                                              <span>Return</span>
                                              <select
                                                value={dispatchTourReturnMode}
                                                onChange={(e) =>
                                                  setDispatchTourReturnMode(
                                                    e.target
                                                      .value as BaseDispatchTourReturnMode,
                                                  )
                                                }
                                                disabled={
                                                  busy || dispatchTourBusy
                                                }
                                              >
                                                <option value="none">
                                                  Any end
                                                </option>
                                                <option value="origin">
                                                  End at origin
                                                </option>
                                                <option value="base">
                                                  End at Base
                                                </option>
                                              </select>
                                            </label>
                                          ) : null}
                                          <label
                                            className="base-dispatch-leave-base"
                                            title="Sort preference only — Prefer ranks tours that start at this Base higher. Does not hide other origins."
                                          >
                                            <span>Leave Base</span>
                                            <select
                                              value={
                                                dispatchTourPreferLeaveBase
                                                  ? 'on'
                                                  : 'off'
                                              }
                                              onChange={(e) =>
                                                setDispatchTourPreferLeaveBase(
                                                  e.target.value === 'on',
                                                )
                                              }
                                              disabled={
                                                busy || dispatchTourBusy
                                              }
                                            >
                                              <option value="on">Prefer</option>
                                              <option value="off">Off</option>
                                            </select>
                                          </label>
                                          <div className="base-dispatch-tour-generate">
                                            <button
                                              type="button"
                                              className="accept"
                                              disabled={
                                                busy || dispatchTourBusy
                                              }
                                              onClick={() =>
                                                void onGenerateDispatchTours()
                                              }
                                            >
                                              {dispatchTourLoading
                                                ? 'Searching…'
                                                : 'Search'}
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    ) : null}

                                    {dispatchTours.length === 0 ? (
                                        <p className="empty">
                                          {dispatchTourLoading
                                            ? 'Searching…'
                                            : mode !== 'fleet'
                                              ? 'Hire a Dispatcher above to unlock freight Search.'
                                              : 'Search for freights'}
                                        </p>
                                      ) : (
                                        <table className="data-table base-dispatch-freight-table">
                                          <thead>
                                            <tr>
                                              <th>Route</th>
                                              <th>Legs</th>
                                              <th title="Sum of revenue-leg distances (not the Max nm/leg filter).">
                                                Dist
                                              </th>
                                              <th title="Sum of reposition hops (Max ferry/hop is per hop; first hop may be 2×).">
                                                Ferry
                                              </th>
                                              <th>Pay</th>
                                              <th>Net</th>
                                              <th>Aircraft</th>
                                              <th />
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {(() => {
                                              const originWantBase =
                                                dispatchTourOrigin
                                                  .trim()
                                                  .toUpperCase();
                                              const matchCount =
                                                dispatchTourReturnMode !==
                                                'none'
                                                  ? dispatchTours.filter(
                                                      (t) => {
                                                        const last =
                                                          t.legs[
                                                            t.legs.length - 1
                                                          ]?.destIcao
                                                            ?.trim()
                                                            .toUpperCase() ??
                                                          '';
                                                        const want =
                                                          dispatchTourReturnMode ===
                                                          'base'
                                                            ? localFbo.icao
                                                                .trim()
                                                                .toUpperCase()
                                                            : originWantBase ||
                                                              t.legs[0]?.originIcao
                                                                ?.trim()
                                                                .toUpperCase() ||
                                                              '';
                                                        return (
                                                          want.length > 0 &&
                                                          last === want
                                                        );
                                                      },
                                                    ).length
                                                  : 0;
                                              const highlightMatches =
                                                matchCount > 0 &&
                                                matchCount <
                                                  dispatchTours.length;

                                              return dispatchTours.map(
                                                (tour) => {
                                              const acf = fleet.find(
                                                (a) => a.id === tour.aircraftId,
                                              );
                                              const planeLabel =
                                                acf?.label ??
                                                acf?.registration ??
                                                tour.airframeTypeId ??
                                                tour.aircraftClassId;
                                              const selected =
                                                selectedDispatchTourId ===
                                                tour.id;
                                              const lastDest =
                                                tour.legs[
                                                  tour.legs.length - 1
                                                ]?.destIcao
                                                  ?.trim()
                                                  .toUpperCase() ?? '';
                                              const originWant =
                                                originWantBase ||
                                                tour.legs[0]?.originIcao
                                                  ?.trim()
                                                  .toUpperCase() ||
                                                '';
                                              const returnWant =
                                                dispatchTourReturnMode ===
                                                'base'
                                                  ? localFbo.icao
                                                      .trim()
                                                      .toUpperCase()
                                                  : dispatchTourReturnMode ===
                                                      'origin'
                                                    ? originWant
                                                    : '';
                                              const matchesReturn =
                                                Boolean(returnWant) &&
                                                lastDest === returnWant;
                                              const filterMatch =
                                                highlightMatches &&
                                                matchesReturn;
                                              const rowClass = [
                                                selected ? 'is-selected' : '',
                                                filterMatch
                                                  ? 'is-filter-match'
                                                  : '',
                                              ]
                                                .filter(Boolean)
                                                .join(' ');
                                              return (
                                                <tr
                                                  key={tour.id}
                                                  className={
                                                    rowClass || undefined
                                                  }
                                                  onClick={() => {
                                                    setSelectedFboHoldId(null);
                                                    setSelectedFboMissionId(
                                                      null,
                                                    );
                                                    setSelectedDispatchTourId(
                                                      (cur) =>
                                                        cur === tour.id
                                                          ? null
                                                          : tour.id,
                                                    );
                                                  }}
                                                >
                                                  <td>
                                                    <TourRouteLabel
                                                      routeLabel={tour.routeLabel}
                                                      onOpenAirport={openAirport}
                                                      busy={busy}
                                                    />
                                                    {(() => {
                                                      const ferry = describeTourFerry(
                                                        tour.legs,
                                                        tour.aircraftLocationIcao,
                                                      );
                                                      if (
                                                        !ferry &&
                                                        !(tour.totalFerryNm > 0.5)
                                                      ) {
                                                        return null;
                                                      }
                                                      return (
                                                        <span
                                                          className="base-dispatch-ferry-tag"
                                                          title={
                                                            ferry?.detail ??
                                                            undefined
                                                          }
                                                        >
                                                          {ferry?.label ??
                                                            `Ferry · ${Math.round(tour.totalFerryNm)} nm`}
                                                        </span>
                                                      );
                                                    })()}
                                                    {filterMatch ? (
                                                      <span className="base-dispatch-match-tag">
                                                        {dispatchTourReturnMode ===
                                                        'base'
                                                          ? 'Base'
                                                          : 'Origin'}
                                                      </span>
                                                    ) : null}
                                                  </td>
                                                  <td>{tour.legCount}</td>
                                                  <td>
                                                    {formatBoardDistanceNm(
                                                      tour.totalDistanceNm,
                                                    )}
                                                  </td>
                                                  <td>
                                                    {(() => {
                                                      const ferry =
                                                        describeTourFerry(
                                                          tour.legs,
                                                          tour.aircraftLocationIcao,
                                                        );
                                                      if (
                                                        !ferry &&
                                                        !(tour.totalFerryNm > 0.5)
                                                      ) {
                                                        return '—';
                                                      }
                                                      return (
                                                        <span
                                                          title={
                                                            ferry?.detail ??
                                                            undefined
                                                          }
                                                        >
                                                          {ferry?.label ??
                                                            `Ferry · ${Math.round(tour.totalFerryNm)} nm`}
                                                        </span>
                                                      );
                                                    })()}
                                                  </td>
                                                  <td className="pay">
                                                    {boardMoneyLabel(
                                                      tour.totalPayUsd,
                                                      formatMoney,
                                                    )}
                                                  </td>
                                                  <td
                                                    className={boardNetClassName(
                                                      tour.totalNetUsd,
                                                    )}
                                                  >
                                                    {boardMoneyLabel(
                                                      tour.totalNetUsd,
                                                      formatMoney,
                                                    )}
                                                  </td>
                                                  <td>
                                                    <span>{planeLabel}</span>
                                                    {tour.aircraftLocationIcao ? (
                                                      <small className="muted">
                                                        {' '}
                                                        @{' '}
                                                        {
                                                          tour.aircraftLocationIcao
                                                        }
                                                      </small>
                                                    ) : null}
                                                  </td>
                                                  <td className="actions">
                                                    <button
                                                      type="button"
                                                      className="accept"
                                                      disabled={
                                                        busy ||
                                                        dispatchTourBusy ||
                                                        Boolean(
                                                          clientUpdateBlock,
                                                        )
                                                      }
                                                      title={
                                                        clientUpdateBlock
                                                          ? formatClientUpdateRequiredLabel(
                                                              clientUpdateBlock.minClientVersion,
                                                            )
                                                          : undefined
                                                      }
                                                      onClick={(event) => {
                                                        event.stopPropagation();
                                                        void onConfirmDispatchTour(
                                                          tour,
                                                        );
                                                      }}
                                                    >
                                                      {clientUpdateBlock
                                                        ? formatClientUpdateCtaLabel()
                                                        : tour.legCount === 1
                                                          ? 'Accept'
                                                          : 'Accept L1'}
                                                    </button>
                                                  </td>
                                                </tr>
                                              );
                                                },
                                              );
                                            })()}
                                          </tbody>
                                        </table>
                                      )}
                                      </>
                                    )}
                                  </div>
                                  ) : baseDispatchProduct === 'charter' ? (
                                    <div className="crew-section base-dispatcher-scout base-dispatch-charters">
                                      <div className="base-dispatcher-scout-head">
                                        <h4 className="crew-section-title">
                                          Charters
                                        </h4>
                                      </div>

                                      {charterActiveTour?.status ===
                                      'active' ? (
                                        <p className="empty muted">
                                          Finish or Drop the Charter tour above
                                          to Search again.
                                        </p>
                                      ) : (
                                        <>
                                      {mode === 'fleet' ? (
                                        <div className="base-dispatch-tour-filters">
                                          <div className="base-dispatch-tour-grid">
                                            <label>
                                              <span>Aircraft</span>
                                              <select
                                                value={dispatchTourAircraftId}
                                                onChange={(e) =>
                                                  setDispatchTourAircraftId(
                                                    e.target.value,
                                                  )
                                                }
                                                disabled={
                                                  busy || dispatchTourBusy
                                                }
                                              >
                                                <option value="">
                                                  Any parked
                                                </option>
                                                {fleet
                                                  .filter(
                                                    (a) => a.status === 'parked',
                                                  )
                                                  .map((a) => (
                                                    <option
                                                      key={a.id}
                                                      value={a.id}
                                                    >
                                                      {a.label ??
                                                        a.registration ??
                                                        a.airframeTypeId ??
                                                        a.id}
                                                      {a.locationIcao
                                                        ? ` @ ${a.locationIcao}`
                                                        : ''}
                                                    </option>
                                                  ))}
                                              </select>
                                            </label>
                                            <label>
                                              <span>Legs</span>
                                              <select
                                                value={charterTourLegs}
                                                onChange={(e) => {
                                                  const n = Number(
                                                    e.target.value,
                                                  );
                                                  setCharterTourLegs(
                                                    n === 2 ? 2 : 1,
                                                  );
                                                  if (n === 1) {
                                                    setCharterTourReturnMode(
                                                      'none',
                                                    );
                                                  }
                                                }}
                                                disabled={
                                                  busy || dispatchTourBusy
                                                }
                                              >
                                                <option value={1}>1</option>
                                                <option value={2}>2</option>
                                              </select>
                                            </label>
                                            <label>
                                              <span>Origin</span>
                                              <input
                                                type="text"
                                                maxLength={4}
                                                placeholder="Any"
                                                title="Exact charter origin. Clear for any departure."
                                                value={baseCharterOrigin}
                                                onChange={(e) =>
                                                  setBaseCharterOrigin(
                                                    e.target.value
                                                      .toUpperCase()
                                                      .replace(/[^A-Z0-9]/g, '')
                                                      .slice(0, 4),
                                                  )
                                                }
                                                disabled={
                                                  busy || dispatchTourBusy
                                                }
                                              />
                                            </label>
                                            <label
                                              title="Minimum revenue-leg distance (each cargo/charter leg). Dist column is the tour total."
                                            >
                                              <span>Min nm/leg</span>
                                              <input
                                                type="number"
                                                min={0}
                                                step={10}
                                                placeholder="auto"
                                                value={dispatchTourMinNm}
                                                onChange={(e) =>
                                                  setDispatchTourMinNm(
                                                    e.target.value,
                                                  )
                                                }
                                                disabled={
                                                  busy || dispatchTourBusy
                                                }
                                              />
                                            </label>
                                            <label
                                              title="Maximum revenue-leg distance (each cargo/charter leg). Dist column is the tour total — 2 legs × 3000 can show ~6000 nm."
                                            >
                                              <span>Max nm/leg</span>
                                              <input
                                                type="number"
                                                min={0}
                                                step={50}
                                                placeholder="—"
                                                value={dispatchTourMaxNm}
                                                onChange={(e) =>
                                                  setDispatchTourMaxNm(
                                                    e.target.value,
                                                  )
                                                }
                                                disabled={
                                                  busy || dispatchTourBusy
                                                }
                                              />
                                            </label>
                                            <label
                                              title="Max reposition between legs (default 200). First hop may be up to 2× (e.g. 200 → 400 nm). Ferry column sums all hops."
                                            >
                                              <span>Max ferry/hop</span>
                                              <input
                                                type="number"
                                                min={40}
                                                max={800}
                                                step={20}
                                                value={dispatchTourMaxFerryNm}
                                                onChange={(e) =>
                                                  setDispatchTourMaxFerryNm(
                                                    e.target.value,
                                                  )
                                                }
                                                disabled={
                                                  busy || dispatchTourBusy
                                                }
                                              />
                                            </label>
                                            {charterTourLegs > 1 ? (
                                              <label>
                                                <span>Return</span>
                                                <select
                                                  value={charterTourReturnMode}
                                                  onChange={(e) =>
                                                    setCharterTourReturnMode(
                                                      e.target
                                                        .value as BaseCharterTourReturnMode,
                                                    )
                                                  }
                                                  disabled={
                                                    busy || dispatchTourBusy
                                                  }
                                                >
                                                  <option value="none">
                                                    Any end
                                                  </option>
                                                  <option value="origin">
                                                    End at origin
                                                  </option>
                                                  <option value="base">
                                                    End at Base
                                                  </option>
                                                </select>
                                              </label>
                                            ) : null}
                                            <label
                                              className="base-dispatch-leave-base"
                                              title="Sort preference only — Prefer ranks tours that start at this Base higher. Does not hide other origins."
                                            >
                                              <span>Leave Base</span>
                                              <select
                                                value={
                                                  dispatchTourPreferLeaveBase
                                                    ? 'on'
                                                    : 'off'
                                                }
                                                onChange={(e) =>
                                                  setDispatchTourPreferLeaveBase(
                                                    e.target.value === 'on',
                                                  )
                                                }
                                                disabled={
                                                  busy || dispatchTourBusy
                                                }
                                              >
                                                <option value="on">Prefer</option>
                                                <option value="off">Off</option>
                                              </select>
                                            </label>
                                            <div className="base-dispatch-tour-generate">
                                              <button
                                                type="button"
                                                className="accept"
                                                disabled={
                                                  busy ||
                                                  dispatchTourBusy ||
                                                  Boolean(playerDispatchMission)
                                                }
                                                onClick={() =>
                                                  void onGenerateCharterTours()
                                                }
                                              >
                                                {dispatchTourLoading
                                                  ? 'Searching…'
                                                  : 'Search'}
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      ) : null}

                                      {charterTours.length === 0 ? (
                                        <p className="empty">
                                          {dispatchTourLoading
                                            ? 'Searching…'
                                            : mode !== 'fleet'
                                              ? 'Hire a Dispatcher above to unlock charter Search.'
                                              : 'Search for charters'}
                                        </p>
                                      ) : (
                                        <table className="data-table base-dispatch-freight-table">
                                          <thead>
                                            <tr>
                                              <th>Route</th>
                                              <th>Legs</th>
                                              <th title="Sum of revenue-leg distances (not the Max nm/leg filter).">
                                                Dist
                                              </th>
                                              <th title="Sum of reposition hops (Max ferry/hop is per hop; first hop may be 2×).">
                                                Ferry
                                              </th>
                                              <th>Pax</th>
                                              <th>Pay</th>
                                              <th>Net</th>
                                              <th>Aircraft</th>
                                              <th />
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {charterTours.map((tour) => {
                                              const selected =
                                                selectedCharterTourId ===
                                                tour.id;
                                              const paxLabel =
                                                formatTourPaxByLeg(tour.legs);
                                              return (
                                                <tr
                                                  key={tour.id}
                                                  className={
                                                    selected
                                                      ? 'is-selected'
                                                      : undefined
                                                  }
                                                  onClick={() => {
                                                    setSelectedFboHoldId(null);
                                                    setSelectedFboMissionId(
                                                      null,
                                                    );
                                                    setSelectedCharterTourId(
                                                      (cur) =>
                                                        cur === tour.id
                                                          ? null
                                                          : tour.id,
                                                    );
                                                  }}
                                                >
                                                  <td>
                                                    <TourRouteLabel
                                                      routeLabel={
                                                        tour.routeLabel
                                                      }
                                                      onOpenAirport={
                                                        openAirport
                                                      }
                                                      busy={busy}
                                                    />
                                                    {(() => {
                                                      const ferry =
                                                        describeTourFerry(
                                                          tour.legs,
                                                          tour.aircraftLocationIcao,
                                                        );
                                                      if (
                                                        !ferry &&
                                                        !(
                                                          tour.totalFerryNm >
                                                          0.5
                                                        )
                                                      ) {
                                                        return null;
                                                      }
                                                      return (
                                                        <span
                                                          className="base-dispatch-ferry-tag"
                                                          title={
                                                            ferry?.detail ??
                                                            undefined
                                                          }
                                                        >
                                                          {ferry?.label ??
                                                            `Ferry · ${Math.round(tour.totalFerryNm)} nm`}
                                                        </span>
                                                      );
                                                    })()}
                                                  </td>
                                                  <td>{tour.legCount}</td>
                                                  <td>
                                                    {formatBoardDistanceNm(
                                                      tour.totalDistanceNm,
                                                    )}
                                                  </td>
                                                  <td>
                                                    {(() => {
                                                      const ferry =
                                                        describeTourFerry(
                                                          tour.legs,
                                                          tour.aircraftLocationIcao,
                                                        );
                                                      if (
                                                        !ferry &&
                                                        !(
                                                          tour.totalFerryNm >
                                                          0.5
                                                        )
                                                      ) {
                                                        return '—';
                                                      }
                                                      return (
                                                        <span
                                                          title={
                                                            ferry?.detail ??
                                                            undefined
                                                          }
                                                        >
                                                          {ferry?.label ??
                                                            `Ferry · ${Math.round(tour.totalFerryNm)} nm`}
                                                        </span>
                                                      );
                                                    })()}
                                                  </td>
                                                  <td
                                                    title={
                                                      tour.legs.length > 1
                                                        ? 'Pax per leg (each offer must fit the aircraft seats)'
                                                        : undefined
                                                    }
                                                  >
                                                    {paxLabel}
                                                  </td>
                                                  <td className="pay">
                                                    {boardMoneyLabel(
                                                      tour.totalPayUsd,
                                                      formatMoney,
                                                    )}
                                                  </td>
                                                  <td
                                                    className={boardNetClassName(
                                                      tour.totalNetUsd,
                                                    )}
                                                  >
                                                    {boardMoneyLabel(
                                                      tour.totalNetUsd,
                                                      formatMoney,
                                                    )}
                                                  </td>
                                                  <td>
                                                    <span>
                                                      {tour.aircraftLabel}
                                                    </span>
                                                    {tour.aircraftLocationIcao ? (
                                                      <small className="muted">
                                                        {' '}
                                                        @{' '}
                                                        {
                                                          tour.aircraftLocationIcao
                                                        }
                                                      </small>
                                                    ) : null}
                                                  </td>
                                                  <td className="actions">
                                                    <button
                                                      type="button"
                                                      className="accept"
                                                      disabled={
                                                        busy ||
                                                        dispatchTourBusy ||
                                                        Boolean(
                                                          clientUpdateBlock,
                                                        ) ||
                                                        Boolean(
                                                          playerDispatchMission,
                                                        )
                                                      }
                                                      title={
                                                        clientUpdateBlock
                                                          ? formatClientUpdateRequiredLabel(
                                                              clientUpdateBlock.minClientVersion,
                                                            )
                                                          : undefined
                                                      }
                                                      onClick={(event) => {
                                                        event.stopPropagation();
                                                        void onConfirmCharterTour(
                                                          tour,
                                                        );
                                                      }}
                                                    >
                                                      {clientUpdateBlock
                                                        ? formatClientUpdateCtaLabel()
                                                        : tour.legCount === 1
                                                          ? 'Accept'
                                                          : 'Accept L1'}
                                                    </button>
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      )}
                                        </>
                                      )}
                                    </div>
                                  ) : null}
                                </>
                              );
                            })()}
                          </div>
                          <>
                          <FboRouteMapCard
                            baseIcao={localFbo.icao}
                            originIcao={(() => {
                              if (selectedFboMissionId) {
                                const m = missions.find(
                                  (x) => x.id === selectedFboMissionId,
                                );
                                if (m) return m.originIcao;
                              }
                              if (selectedFboHoldId) {
                                return (
                                  localHolds.find((h) => h.id === selectedFboHoldId)
                                    ?.originIcao ?? localFbo.icao
                                );
                              }
                              return (
                                baseDispatchMapTour?.legs[0]?.originIcao ??
                                localFbo.icao
                              );
                            })()}
                            destIcao={(() => {
                              if (selectedFboMissionId) {
                                return (
                                  missions.find(
                                    (x) => x.id === selectedFboMissionId,
                                  )?.destIcao ?? null
                                );
                              }
                              if (selectedFboHoldId) {
                                return (
                                  localHolds.find((h) => h.id === selectedFboHoldId)
                                    ?.destIcao ?? null
                                );
                              }
                              const legs = baseDispatchMapTour?.legs;
                              if (!legs?.length) return null;
                              return legs[legs.length - 1]?.destIcao ?? null;
                            })()}
                            tourLegs={baseDispatchMapTour?.legs ?? null}
                            routeHeadline={
                              baseDispatchMapTour?.routeLabel ?? null
                            }
                            ferryNm={
                              baseDispatchMapTour != null
                                ? baseDispatchMapTour.totalFerryNm
                                : null
                            }
                            distanceNm={(() => {
                              if (selectedFboHoldId) {
                                return localHolds.find(
                                  (h) => h.id === selectedFboHoldId,
                                )?.distanceNm;
                              }
                              return baseDispatchMapTour?.totalDistanceNm;
                            })()}
                            idleHint={
                              baseDispatchProduct === 'charter'
                                ? 'Select a charter'
                                : 'Select a freight'
                            }
                            routeProgress={(() => {
                              if (!selectedFboMissionId) return null;
                              const m = missions.find(
                                (x) => x.id === selectedFboMissionId,
                              );
                              if (
                                !m ||
                                m.status !== 'in_flight' ||
                                !m.crewOperated ||
                                typeof m.airborneAtMs !== 'number' ||
                                typeof m.expectedRouteMs !== 'number' ||
                                m.expectedRouteMs <= 0
                              ) {
                                return null;
                              }
                              return Math.max(
                                0,
                                Math.min(
                                  1,
                                  (displayNowMs - m.airborneAtMs) /
                                    m.expectedRouteMs,
                                ),
                              );
                            })()}
                            aircraftLabel={(() => {
                              if (!selectedFboMissionId) return null;
                              const m = missions.find(
                                (x) => x.id === selectedFboMissionId,
                              );
                              if (!m) return null;
                              const acf = m.aircraftId
                                ? fleet.find((a) => a.id === m.aircraftId)
                                : undefined;
                              const crewName = m.crewMemberId
                                ? companyCrew?.members?.find(
                                    (c) => c.id === m.crewMemberId,
                                  )?.displayName
                                : undefined;
                              const bits = [
                                acf?.label ?? m.aircraftClassId,
                                crewName,
                              ].filter(Boolean);
                              return bits.length ? bits.join(' · ') : null;
                            })()}
                            onOpenAirport={openAirport}
                          />
                          {localHolds.length === 0 ? (
                            FBO_BONDED_HOLD_ENABLED ? (
                              <p className="empty">No holds</p>
                            ) : null
                          ) : (
                            <table className="data-table fbo-holds-table">
                              <thead>
                                <tr>
                                  <th>Route</th>
                                  <th>Dist</th>
                                  <th>Cargo</th>
                                  <th>Pay</th>
                                  <th>Deadline</th>
                                  <th />
                                </tr>
                              </thead>
                              <tbody>
                                {localHolds.map((hold) => (
                                  <tr
                                    key={hold.id}
                                    className={
                                      selectedFboHoldId === hold.id
                                        ? 'is-selected'
                                        : undefined
                                    }
                                    onClick={() => {
                                      setSelectedFboMissionId(null);
                                      setSelectedFboHoldId((cur) =>
                                        cur === hold.id ? null : hold.id,
                                      );
                                    }}
                                  >
                                    <td>
                                      <div className="commodity-cell">
                                        <CommodityIcon
                                          commodityId={hold.commodityId}
                                          size={40}
                                          title={hold.commodityId}
                                        />
                                        <div>
                                          <div className="route">
                                            <IcaoLink
                                              icao={hold.originIcao}
                                              onOpen={openAirport}
                                              disabled={busy}
                                            />
                                            <span className="arrow">→</span>
                                            <IcaoLink
                                              icao={hold.destIcao}
                                              onOpen={openAirport}
                                              disabled={busy}
                                            />
                                          </div>
                                          <small>{hold.commodityId}</small>
                                        </div>
                                      </div>
                                    </td>
                                    <td>
                                      {formatBoardDistanceNm(hold.distanceNm)}
                                    </td>
                                    <td>{formatTonnes(hold.cargoKg)}</td>
                                    <td className="pay">
                                      {formatMoney(hold.payUsd)}
                                    </td>
                                    <td>
                                      {formatExpiry({
                                        expiresAtTick: hold.deadlineTick,
                                        currentTick: tick,
                                        continuousHours,
                                      })}
                                    </td>
                                    <td
                                      className="actions"
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      <button
                                        type="button"
                                        className="accept"
                                        disabled={busy}
                                        onClick={() =>
                                          void onReleaseFboHold(hold.id)
                                        }
                                      >
                                        Dispatch
                                      </button>
                                      {COMPANY_CREW_ENABLED ? (
                                      <button
                                        type="button"
                                        className="action"
                                        disabled={busy}
                                        title="Assign cargo to parked airframes, then send with company crew from the Accepted list"
                                        onClick={() => onSplitFboHold(hold.id)}
                                      >
                                        Crew fly
                                      </button>
                                      ) : null}
                                      <button
                                        type="button"
                                        className="action ghost"
                                        disabled={busy}
                                        onClick={() =>
                                          void onCancelFboHold(hold.id)
                                        }
                                      >
                                        Cancel
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {(() => {
                            const origin = (airportIcao ?? '').toUpperCase();
                            const crewLegs = missions.filter((m) => {
                              if (
                                m.status === 'in_flight' &&
                                m.crewOperated === true
                              ) {
                                return (
                                  m.originIcao.toUpperCase() === origin ||
                                  m.destIcao.toUpperCase() === origin ||
                                  (m.crewReturnIcao ?? '').toUpperCase() ===
                                    origin
                                );
                              }
                              if (
                                ['accepted', 'dispatched'].includes(m.status) &&
                                !m.crewOperated
                              ) {
                                return m.originIcao.toUpperCase() === origin;
                              }
                              return false;
                            });
                            if (crewLegs.length === 0) return null;
                            const canCrew = idleCrewOptions.length > 0;
                            const waiting = crewLegs.filter(
                              (m) => m.status !== 'in_flight',
                            ).length;
                            const returning = crewLegs.filter(
                              (m) =>
                                m.status === 'in_flight' &&
                                m.crewDeadhead === true,
                            ).length;
                            const airborne =
                              crewLegs.length - waiting - returning;
                            return (
                              <>
                                <h3 className="crew-section-title">
                                  Crew legs
                                  {returning > 0
                                    ? ` · ${returning} returning`
                                    : airborne > 0
                                      ? ` · ${airborne} en route`
                                      : waiting > 0
                                        ? ` · ${waiting} ready`
                                        : ''}
                                </h3>
                                <p className="muted">
                                  Crew fly assigns payload to parked airframes;
                                  Dispatch is your OFP flight. Crew legs are
                                  round-trips (cargo out, empty return). Return
                                  rebond keeps cargo here.
                                  {!canCrew && waiting > 0
                                    ? ' Hire or wait for a free crew slot in Hangar → Crew.'
                                    : ''}
                                </p>
                                <table className="data-table fbo-holds-table">
                                  <thead>
                                    <tr>
                                      <th>Route</th>
                                      <th>Aircraft</th>
                                      <th>Cargo</th>
                                      <th>Pay</th>
                                      <th />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {crewLegs.map((m) => {
                                      const acf = m.aircraftId
                                        ? fleet.find((a) => a.id === m.aircraftId)
                                        : undefined;
                                      const airborneLeg =
                                        m.status === 'in_flight' &&
                                        m.crewOperated === true;
                                      const returningLeg =
                                        airborneLeg && m.crewDeadhead === true;
                                      const arrivesAtMs =
                                        typeof m.airborneAtMs === 'number' &&
                                        typeof m.expectedRouteMs === 'number'
                                          ? m.airborneAtMs + m.expectedRouteMs
                                          : undefined;
                                      const pct = airborneLeg
                                        ? liveProgress({
                                            departedAtMs: m.airborneAtMs,
                                            arrivesAtMs,
                                            nowMs: displayNowMs,
                                          })
                                        : 0;
                                      const etaH = airborneLeg
                                        ? liveEtaHours({
                                            arrivesAtMs,
                                            nowMs: displayNowMs,
                                          })
                                        : 0;
                                      const crewName = m.crewMemberId
                                        ? companyCrew?.members?.find(
                                            (c) => c.id === m.crewMemberId,
                                          )?.displayName
                                        : undefined;
                                      return (
                                        <tr
                                          key={m.id}
                                          className={
                                            selectedFboMissionId === m.id
                                              ? 'is-selected'
                                              : undefined
                                          }
                                          onClick={() => {
                                            setSelectedFboHoldId(null);
                                            setSelectedFboMissionId((cur) =>
                                              cur === m.id ? null : m.id,
                                            );
                                          }}
                                        >
                                          <td>
                                            <div
                                              className={
                                                returningLeg || airborneLeg
                                                  ? undefined
                                                  : 'commodity-cell'
                                              }
                                            >
                                              {!returningLeg && !airborneLeg ? (
                                                <CommodityIcon
                                                  commodityId={m.commodityId}
                                                  size={40}
                                                  title={m.commodityId}
                                                />
                                              ) : null}
                                              <div>
                                                <div className="route">
                                                  <IcaoLink
                                                    icao={m.originIcao}
                                                    onOpen={openAirport}
                                                    disabled={busy}
                                                  />
                                                  <span className="arrow">→</span>
                                                  <IcaoLink
                                                    icao={m.destIcao}
                                                    onOpen={openAirport}
                                                    disabled={busy}
                                                  />
                                                </div>
                                                <small>
                                                  {returningLeg
                                                    ? `Returning · ${crewName ?? 'Crew'}`
                                                    : airborneLeg
                                                      ? `${crewName ?? 'Crew'} en route`
                                                      : m.commodityId}
                                                </small>
                                              </div>
                                            </div>
                                          </td>
                                          <td>
                                            {acf?.label ??
                                              m.aircraftClassId ??
                                              '—'}
                                          </td>
                                          <td>
                                            {returningLeg
                                              ? 'Empty'
                                              : formatTonnes(m.cargoKg)}
                                          </td>
                                          <td className="pay">
                                            {returningLeg
                                              ? '—'
                                              : formatMoney(m.payUsd)}
                                          </td>
                                          <td
                                            className="actions"
                                            onClick={(event) =>
                                              event.stopPropagation()
                                            }
                                          >
                                            {airborneLeg ? (
                                              <div className="crew-leg-progress">
                                                <ProgressTrack
                                                  pct={pct}
                                                  label={`ETA ${formatDuration(etaH)}`}
                                                />
                                                <small>
                                                  ETA {formatDuration(etaH)}
                                                </small>
                                              </div>
                                            ) : (
                                              <>
                                                <CrewFlyControls
                                                  idleCrew={idleCrewOptions}
                                                  busy={busy || crewDispatchBusy}
                                                  value={m.crewMemberId}
                                                  onSelect={(crewMemberId) =>
                                                    void onCrewAssignMission(
                                                      m.id,
                                                      crewMemberId,
                                                    )
                                                  }
                                                  onFly={(crewMemberId) =>
                                                    void onCrewDispatchMission(
                                                      m,
                                                      crewMemberId,
                                                    )
                                                  }
                                                />
                                                <button
                                                  type="button"
                                                  className="action ghost"
                                                  disabled={busy}
                                                  title="Cancel this leg and bond cargo back at the Base"
                                                  onClick={() =>
                                                    void onReturnMissionToFbo(m)
                                                  }
                                                >
                                                  Return
                                                </button>
                                              </>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </>
                            );
                          })()}
                          </>
                        </>
                      );
                    })()}
                  </>
                ) : null}

                {terminalSection === 'movements' ? (
                  <>
                    <div className="panel-head">
                      <div>
                        <h2>Live movements</h2>
                        <p>
                          Arrivals &amp; departures at {formatClock(continuousHours)}
                          <span className="live-dot" title="Auto-refreshes every 15s">
                            {' '}
                            · live
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="movement-grid">
                      <MovementBoard
                        title="Arrivals"
                        mode="arrivals"
                        rows={airportView.arrivals ?? []}
                        onOpen={openAirport}
                        busy={busy}
                        empty="No freighters inbound right now."
                        nowMs={displayNowMs}
                      />
                      <MovementBoard
                        title="Departures / outbound"
                        mode="departures"
                        rows={airportView.departures ?? []}
                        onOpen={openAirport}
                        busy={busy}
                        empty="No freighters outbound from this terminal."
                        nowMs={displayNowMs}
                      />
                    </div>
                  </>
                ) : null}

                {terminalSection === 'inventory' ? (
                  airportView.airport.bushTripOnly ? (
                    <div className="panel-head">
                      <div>
                        <h2>Trip-only strip</h2>
                        <p className="muted">
                          No warehouse stock or demand here — Airframe keeps this
                          field for bush-trip routing (board temporarily
                          disabled).
                        </p>
                      </div>
                    </div>
                  ) : (
                  <>
                    <div className="panel-head">
                      <div>
                        <h2>Terminal inventory</h2>
                        <p>
                          {airportHydrating &&
                          airportView.commodities.length === 0 ? (
                            <span className="skel skel-line" style={{ width: '9.5rem' }} />
                          ) : (
                            <>
                              {formatTonnes(airportView.totalStockTonnes * 1000)}{' '}
                              total stock · {formatClock(continuousHours)}
                            </>
                          )}
                        </p>
                        {airportView.events && airportView.events.length > 0 ? (
                          <ul className="event-list">
                            {airportView.events.map((ev) => (
                              <li key={ev.id} className="event-badge">
                                {ev.label}
                                <small>
                                  {' '}
                                  · ends {formatClock(ev.endsAtTick)}
                                </small>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </div>
                    <div
                      className={`table-wrap terminal-inventory-table-wrap${
                        airportHydrating && airportView.commodities.length === 0
                          ? ' is-loading'
                          : ''
                      }`}
                    >
                      <table className="terminal-inventory-table">
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th>Stock</th>
                            <th>Fill</th>
                            <th>Balance</th>
                            <th>Trend</th>
                            <th>Flow</th>
                            <th>Local price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {airportView.charter ? (
                            <tr>
                              <td>
                                <strong>Passengers</strong>
                                <small>Charter pool · waiting at terminal</small>
                              </td>
                              <td>
                                {airportView.charter.waitingPax}
                                <small>
                                  of {airportView.charter.capacityPax} pax
                                </small>
                              </td>
                              <td>
                                <div className="fill-bar" aria-hidden="true">
                                  <span
                                    style={{
                                      width: `${Math.min(
                                        100,
                                        airportView.charter.waitingFillPct * 100,
                                      )}%`,
                                    }}
                                  />
                                </div>
                                <small>
                                  {(
                                    airportView.charter.waitingFillPct * 100
                                  ).toFixed(0)}
                                  %
                                </small>
                              </td>
                              <td>
                                <span
                                  className={`balance balance-${airportView.charter.waitingBalance}`}
                                >
                                  {airportView.charter.waitingBalance}
                                </span>
                              </td>
                              <td></td>
                              <td>
                                +{airportView.charter.attractPax}
                                <small>
                                  attract ·{' '}
                                  {airportView.charter.openOffersFrom} out /{' '}
                                  {airportView.charter.openOffersTo} in
                                </small>
                              </td>
                              <td></td>
                            </tr>
                          ) : null}
                          {airportView.charter ? (
                            <tr className="inventory-section-row">
                              <th scope="colgroup" colSpan={7}>
                                Commodities
                              </th>
                            </tr>
                          ) : null}
                          {airportHydrating &&
                          airportView.commodities.length === 0 ? (
                            <TableSkeleton rows={6} cols={7} />
                          ) : (
                            airportView.commodities.map((c) => (
                              <tr key={c.commodityId}>
                                <td>
                                  <div className="commodity-cell">
                                    <CommodityIcon
                                      commodityId={c.commodityId}
                                      size={48}
                                      title={c.name}
                                    />
                                    <div>
                                      <strong>{c.name}</strong>
                                      <small>
                                        {c.kind === 'fuel'
                                          ? 'Jet-A (shop)'
                                          : c.kind === 'mro'
                                            ? 'MRO shop stock'
                                            : c.perishable
                                              ? 'Perishable'
                                              : c.highValue
                                                ? 'High value'
                                                : 'Standard'}
                                      </small>
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  {formatTonnes(c.stockTonnes * 1000)}
                                  <small>
                                    of {formatTonnes(c.capacityTonnes * 1000)}
                                  </small>
                                </td>
                                <td>
                                  <div className="fill-bar" aria-hidden="true">
                                    <span
                                      style={{
                                        width: `${Math.min(
                                          100,
                                          c.fillPct * 100,
                                        )}%`,
                                      }}
                                    />
                                  </div>
                                  <small>
                                    {(c.fillPct * 100).toFixed(0)}%
                                  </small>
                                </td>
                                <td>
                                  <span
                                    className={`balance balance-${c.balance}`}
                                  >
                                    {c.balance}
                                  </span>
                                </td>
                                <td>
                                  <span
                                    className={`trend trend-${c.trend ?? 'stable'}`}
                                  >
                                    {c.trend ?? 'stable'}
                                  </span>
                                </td>
                                <td>
                                  +{formatTonnes(c.productionPerTickKg)}
                                  <small>
                                    −{formatTonnes(c.consumptionPerTickKg)}
                                  </small>
                                </td>
                                <td className="pay">
                                  $
                                  {(weightSystem === 'imperial'
                                    ? c.unitPriceUsd / KG_TO_LB
                                    : c.unitPriceUsd
                                  ).toFixed(2)}
                                  /{massUnitLabel(weightSystem)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    {!airportHydrating ||
                    (airportView.fuelInbound?.length ?? 0) > 0 ||
                    (airportView.fuelRecent?.length ?? 0) > 0 ? (
                    <FuelLogisticsBlock
                      inbound={airportView.fuelInbound ?? []}
                      recent={airportView.fuelRecent ?? []}
                      weightSystem={weightSystem}
                      onOpen={openAirport}
                      busy={busy}
                    />
                    ) : null}
                  </>
                  )
                ) : null}

                {terminalSection === 'contracts' ? (
                  <>
                    <div className="panel-head">
                      <div>
                        <h2>Contracts</h2>
                        {contractsProduct === 'freight' &&
                        boardEstimateFleet.length === 0 ? (
                          <p className="muted board-contract-pilot-hint">
                            Contract pilot — you earn a{' '}
                            {contractPilotFeePctLabel()} crew cut on freight;
                            the operator keeps the rest and pays fuel &amp; MX.
                          </p>
                        ) : boardEstimateFleet.length > 0 ? (
                        <div className="board-aircraft">
                          <label className="board-aircraft-picker">
                            Aircraft
                            <select
                              aria-label="Aircraft for Contracts net estimate"
                              value={boardAircraftId}
                              disabled={boardEstimateFleet.length === 0}
                              onChange={(e) => {
                                setBoardAircraftId(e.target.value);
                                setContractsPage(1);
                              }}
                            >
                              <option value="">
                                {boardEstimateFleet.length === 0
                                  ? 'Gross pay (no aircraft)'
                                  : 'Gross pay only'}
                              </option>
                              {boardEstimateFleet.map((acf) => (
                                <option key={acf.id} value={acf.id}>
                                  {vaAircraftIdSet.has(acf.id) ? 'Airline' : 'Yours'}
                                  {' · '}
                                  {acf.label}
                                  {acf.status === 'parked'
                                    ? ` · ${acf.locationIcao}`
                                    : ` · ${acf.status}`}
                                </option>
                              ))}
                            </select>
                          </label>
                          {boardAircraftId &&
                          vaAircraftIdSet.has(boardAircraftId) ? (
                            <p className="board-va-ops-chip" role="status">
                              Airline tail
                              {vaMemberRouteCutPct != null
                                ? ` · ${vaMemberRouteCutPct}% market hire → your home Wallet`
                                : ' · Jet-A from company · cut → your home Wallet'}
                            </p>
                          ) : null}
                          {(() => {
                            const dest =
                              airportView.airport.icao.trim().toUpperCase();
                            const ferryAcf =
                              boardAircraft?.status === 'parked'
                                ? boardAircraft
                                : boardEstimateFleet.find(
                                    (a) => a.status === 'parked',
                                  );
                            if (!ferryAcf) return null;
                            if (
                              ferryAcf.locationIcao.trim().toUpperCase() ===
                              dest
                            ) {
                              return null;
                            }
                            return (
                              <button
                                type="button"
                                className="linkish board-aircraft-ferry"
                                disabled={busy}
                                title={`Open Hangar ferry ${ferryAcf.locationIcao} → ${dest}`}
                                onClick={() =>
                                  ferryAircraftToCurrentTerminal()
                                }
                              >
                                Ferry to {dest}
                              </button>
                            );
                          })()}
                        </div>
                        ) : null}
                      </div>
                    </div>
                    <nav
                      className="contracts-lanes contracts-products"
                      aria-label="Contract product"
                    >
                      <button
                        type="button"
                        className={
                          contractsProduct === 'freight'
                            ? 'contracts-lane active'
                            : 'contracts-lane'
                        }
                        onClick={() => setContractsProduct('freight')}
                      >
                        Freight
                      </button>
                      <button
                        type="button"
                        className={
                          contractsProduct === 'charter'
                            ? 'contracts-lane active'
                            : 'contracts-lane'
                        }
                        onClick={() => setContractsProduct('charter')}
                      >
                        Charter
                      </button>
                    </nav>
                    {contractsProduct === 'charter' ? (
                      <div className="contracts-board">
                        <FboRouteMapCard
                          baseIcao={airportView.airport.icao}
                          originIcao={
                            selectedCharterOffer?.originIcao ??
                            airportView.airport.icao
                          }
                          destIcao={selectedCharterOffer?.destIcao ?? null}
                          distanceNm={selectedCharterOffer?.distanceNm}
                          originRole="dep"
                          idleHeadline={`${airportView.airport.icao} · hub`}
                          idleHint="Select a charter to draw the route."
                          showTitle={false}
                          onOpenAirport={openAirport}
                        />
                        <div className="contracts-board-list">
                        <nav
                          className="contracts-lanes"
                          aria-label="Charter direction"
                        >
                          <button
                            type="button"
                            className={
                              contractsLane === 'outbound'
                                ? 'contracts-lane active'
                                : 'contracts-lane'
                            }
                            onClick={() => {
                              setContractsLane('outbound');
                              setSelectedCharterOffer(null);
                            }}
                          >
                            Outbound
                          </button>
                          <button
                            type="button"
                            className={
                              contractsLane === 'inbound'
                                ? 'contracts-lane active'
                                : 'contracts-lane'
                            }
                            onClick={() => {
                              setContractsLane('inbound');
                              setSelectedCharterOffer(null);
                            }}
                          >
                            Inbound
                          </button>
                        </nav>
                        <CharterBoard
                          fleet={prepareOpsFleet}
                          vaAircraftIds={vaAircraftIdSet}
                          resolveAircraftCompanyId={(id) =>
                            resolveOpsCompanyId(id) || undefined
                          }
                          aircraftId={boardAircraftId}
                          onAircraftIdChange={setBoardAircraftId}
                          hideAircraftPicker
                          initialAircraftId={boardAircraftId}
                          origin={
                            contractsLane === 'outbound'
                              ? airportView.airport.icao
                              : undefined
                          }
                          dest={
                            contractsLane === 'inbound'
                              ? airportView.airport.icao
                              : undefined
                          }
                          busy={busy || Boolean(playerDispatchMission)}
                          formatMoney={formatMoney}
                          formatMass={(kg) => formatMass(kg, weightSystem)}
                          onPrepare={enterCharterManifest}
                          selectedOfferId={selectedCharterOffer?.id}
                          onSelectOffer={setSelectedCharterOffer}
                          onOpenAirport={openAirport}
                          clientUpdateRequiredMin={
                            clientUpdateBlock?.minClientVersion ?? null
                          }
                        />
                        </div>
                      </div>
                    ) : (
                    <div className="contracts-board">
                    <FboRouteMapCard
                      baseIcao={airportView.airport.icao}
                      originIcao={
                        selectedContractLot?.originIcao ??
                        airportView.airport.icao
                      }
                      destIcao={selectedContractLot?.destIcao ?? null}
                      distanceNm={selectedContractLot?.distanceNm}
                      originRole="dep"
                      idleHeadline={`${airportView.airport.icao} · hub`}
                      idleHint="Select a contract below to draw the route."
                      showTitle={false}
                      onOpenAirport={openAirport}
                    />
                    <div className="contracts-board-list">
                    <nav
                      className="contracts-lanes"
                      aria-label="Contract direction"
                    >
                      <button
                        type="button"
                        className={
                          contractsLane === 'outbound'
                            ? 'contracts-lane active'
                            : 'contracts-lane'
                        }
                        onClick={() => {
                          setContractsLane('outbound');
                          setContractsPage(1);
                          setSelectedContractLotId(null);
                        }}
                        disabled={busy}
                      >
                        Outbound ({airportView.outboundLots.length})
                      </button>
                      <button
                        type="button"
                        className={
                          contractsLane === 'inbound'
                            ? 'contracts-lane active'
                            : 'contracts-lane'
                        }
                        onClick={() => {
                          setContractsLane('inbound');
                          setContractsPage(1);
                          setSelectedContractLotId(null);
                        }}
                        disabled={busy}
                      >
                        Inbound ({airportView.inboundLots.length})
                      </button>
                      <button
                        type="button"
                        className={
                          contractsOffer === 'aircraft'
                            ? 'contracts-lane active'
                            : 'contracts-lane'
                        }
                        onClick={() => {
                          setContractsOffer('aircraft');
                          setContractsPage(1);
                          setSelectedContractLotId(null);
                        }}
                        disabled={busy}
                        title="Lots you haul with your own aircraft"
                      >
                        Aircraft
                      </button>
                      <button
                        type="button"
                        className={
                          contractsOffer === 'crew'
                            ? 'contracts-lane active'
                            : 'contracts-lane'
                        }
                        onClick={() => {
                          setContractsOffer('crew');
                          setContractsPage(1);
                          setSelectedContractLotId(null);
                        }}
                        disabled={busy}
                        title="Fly an NPC aircraft for a pilot fee"
                      >
                        Crew
                      </button>
                      {sisterFboIcaos.length > 0 &&
                      contractsLane === 'outbound' ? (
                        <button
                          type="button"
                          className={
                            contractsSisterOnly
                              ? 'contracts-lane active'
                              : 'contracts-lane'
                          }
                          onClick={() => {
                            setContractsSisterOnly((v) => !v);
                            setContractsPage(1);
                          }}
                          disabled={busy}
                          title={`Destinations: ${sisterFboIcaos.join(', ')}`}
                        >
                          → sister Base
                        </button>
                      ) : null}
                      {contractsSorts.length > 0 ||
                      contractsAccessFilter ||
                      contractsSisterOnly ||
                      contractsProfitableOnly ? (
                        <button
                          type="button"
                          className="clear-filters contracts-clear-sort"
                          onClick={() => {
                            setContractsSorts([...DEFAULT_BOARD_SORTS]);
                            setContractsAccessFilter('');
                            setContractsSisterOnly(false);
                            setContractsProfitableOnly(false);
                            setContractsPage(1);
                          }}
                          title={
                            contractsSorts.length > 1
                              ? `Reset ${contractsSorts.length} sort levels`
                              : 'Reset access filter and sort'
                          }
                        >
                          Clear sort
                        </button>
                      ) : null}
                    </nav>
                    {playerDispatchMission && contractsLane === 'outbound' ? (
                      <p
                        className="banner warn"
                        title={playerDispatchMission.id}
                      >
                        Active flight{' '}
                        {activeFlightRouteLabel(playerDispatchMission)} — finish
                        or cancel it in{' '}
                        <button
                          type="button"
                          className="linkish"
                          onClick={() => selectTab('staging')}
                          disabled={busy}
                        >
                          Dispatch
                        </button>{' '}
                        before preparing another.
                      </p>
                    ) : null}
                    <div
                      className={`table-wrap${airportHydrating ? ' is-loading' : ''}`}
                    >
                      {airportHydrating && sortedContractLots.length > 0 ? (
                        <BusyChip label="Updating contracts" />
                      ) : null}
                      <table className="contracts-table">
                        <thead>
                          <tr>
                            <th className="col-route">Route</th>
                            <th aria-sort={contractsAriaSort('distance')} className="col-compact">
                              <button
                                type="button"
                                className={`sort-header${contractsSorts.some((l) => l.key === 'distance') ? ' is-sorted' : ''}`}
                                title="Sort by distance. Click another column to add a sort level; click again to reverse or clear."
                                onClick={() => toggleContractsSort('distance')}
                              >
                                Distance{' '}
                                <span>{contractsSortIndicator('distance')}</span>
                              </button>
                            </th>
                            <th aria-sort={contractsAriaSort('cargo')} className="col-cargo">
                              <button
                                type="button"
                                className={`sort-header${contractsSorts.some((l) => l.key === 'cargo') ? ' is-sorted' : ''}`}
                                title="Sort by cargo. Click another column to add a sort level; click again to reverse or clear."
                                onClick={() => toggleContractsSort('cargo')}
                              >
                                Cargo{' '}
                                <span>{contractsSortIndicator('cargo')}</span>
                              </button>
                            </th>
                            <th aria-sort={contractsAriaSort('load')} className="col-compact">
                              <button
                                type="button"
                                className={`sort-header${contractsSorts.some((l) => l.key === 'load') ? ' is-sorted' : ''}`}
                                title="Sort by load. Click another column to add a sort level; click again to reverse or clear."
                                onClick={() => toggleContractsSort('load')}
                              >
                                Load{' '}
                                <span>{contractsSortIndicator('load')}</span>
                              </button>
                            </th>
                            <th aria-sort={contractsAriaSort('expires')} className="col-compact">
                              <button
                                type="button"
                                className={`sort-header${contractsSorts.some((l) => l.key === 'expires') ? ' is-sorted' : ''}`}
                                title="Sort by expiry. Click another column to add a sort level; click again to reverse or clear."
                                onClick={() => toggleContractsSort('expires')}
                              >
                                Expires{' '}
                                <span>{contractsSortIndicator('expires')}</span>
                              </button>
                            </th>
                            <th aria-sort={contractsAriaSort('pay')} className="col-money">
                              <button
                                type="button"
                                className={`sort-header${contractsSorts.some((l) => l.key === 'pay') ? ' is-sorted' : ''}`}
                                title={
                                  boardEstimateFleet.length === 0
                                    ? `Your ${contractPilotFeePctLabel()} crew cut — what you take home`
                                    : 'Sort by pay. Click another column to add a sort level; click again to reverse or clear.'
                                }
                                onClick={() => toggleContractsSort('pay')}
                              >
                                {boardEstimateFleet.length === 0 ? 'Your fee' : 'Pay'}{' '}
                                <span>{contractsSortIndicator('pay')}</span>
                              </button>
                            </th>
                            <th aria-sort={contractsAriaSort('net')} className="col-money">
                              <button
                                type="button"
                                className={`sort-header${contractsSorts.some((l) => l.key === 'net') ? ' is-sorted' : ''}`}
                                title={
                                  boardEstimateFleet.length === 0
                                    ? 'Net needs an aircraft estimate — crew Pay is your fee'
                                    : boardAircraft
                                      ? `Sort by estimated net (pay − Jet-A) for ${boardAircraft.label}`
                                      : 'Select an aircraft above to estimate net (pay − Jet-A)'
                                }
                                onClick={() => toggleContractsSort('net')}
                                disabled={
                                  boardEstimateFleet.length > 0 && !boardAircraft
                                }
                              >
                                Net{' '}
                                <span>{contractsSortIndicator('net')}</span>
                              </button>
                            </th>
                            {contractsLane === 'outbound' ? (
                              <th aria-sort={contractsAriaSort('access')} className="col-access">
                                <button
                                  type="button"
                                  className={`sort-header${contractsSorts.some((l) => l.key === 'access') ? ' is-sorted' : ''}`}
                                  title="Sort by Cargo Ops access. Click to unlock-first, again for locked-first, again to clear."
                                  onClick={() => toggleContractsSort('access')}
                                >
                                  Access{' '}
                                  <span>{contractsSortIndicator('access')}</span>
                                </button>
                              </th>
                            ) : null}
                          </tr>
                          <tr className="filter-row">
                            <th className="col-route" />
                            <th className="col-compact" />
                            <th className="col-cargo" />
                            <th className="col-compact" />
                            <th className="col-compact" />
                            <th className="col-money" />
                            <th className="col-money">
                              <div className="contract-net-filters">
                                
                                <label className="profitable-filter">
                                  <input
                                    type="checkbox"
                                    checked={contractsProfitableOnly}
                                    disabled={!boardAircraft}
                                    onChange={(e) => {
                                      setContractsProfitableOnly(e.target.checked);
                                      setContractsPage(1);
                                    }}
                                  />
                                  <span title="Show only lots with estimated net &gt; $0 after Jet-A">
                                    Profit &gt; 0
                                  </span>
                                </label>
                              </div>
                            </th>
                            {contractsLane === 'outbound' ? (
                              <th className="col-access">
                                <select
                                  aria-label="Filter by Cargo Ops access"
                                  value={contractsAccessFilter}
                                  onChange={(e) => {
                                    setContractsAccessFilter(
                                      e.target.value as AccessFilter,
                                    );
                                    setContractsPage(1);
                                  }}
                                >
                                  <option value="">Any</option>
                                  <option value="open">Open</option>
                                  <option value="locked">Locked</option>
                                </select>
                              </th>
                            ) : null}
                          </tr>
                        </thead>
                        <tbody>
                          {pagedContractLots.map((lot) => {
                            const cargoLocked = isCargoOpsCommodityLocked(
                              lot.commodityId,
                            );
                            const meta = lotPressureMeta(lot);
                            const idlePct = idleUptickPct(lot);
                            const lastMile =
                              lot.lastMile === true ||
                              /last-mile/i.test(lot.reason ?? '');
                            return (
                            <tr
                              key={lot.id}
                              className={[
                                cargoLocked ? 'lot-locked' : '',
                                selectedContractLotId === lot.id
                                  ? 'is-selected'
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' ') || undefined}
                              aria-selected={selectedContractLotId === lot.id}
                              onClick={() =>
                                setSelectedContractLotId((cur) =>
                                  cur === lot.id ? null : lot.id,
                                )
                              }
                            >
                              <td className="col-route">
                                <div className="route">
                                  <IcaoLink
                                    icao={lot.originIcao}
                                    onOpen={openAirport}
                                    disabled={busy}
                                  />
                                  <span className="arrow">→</span>
                                  <IcaoLink
                                    icao={lot.destIcao}
                                    onOpen={openAirport}
                                    disabled={busy}
                                  />
                                  {lot.urgency === 'urgent' ? (
                                    <span className="tag">Urgent</span>
                                  ) : null}
                                  {(lot.quantityKg ?? lot.availableKg) >= 40_000 ? (
                                    <span
                                      className="tag"
                                      title="Wide fill · XL lot (40–90 t)"
                                    >
                                      XL
                                    </span>
                                  ) : null}
                                  {lot.international ||
                                  lot.pressure?.international ? (
                                    <span
                                      className="tag"
                                      title="International lane freight"
                                    >
                                      intl
                                    </span>
                                  ) : null}
                                  {lot.bush ? (
                                    <span
                                      className="tag"
                                      title="Bush soft-field — light GA only, no ferry"
                                    >
                                      bush
                                    </span>
                                  ) : null}
                                  {lastMile ? (
                                    <span
                                      className="tag"
                                      title="Last-mile Dry — short GA hop from a hub"
                                    >
                                      last-mile
                                    </span>
                                  ) : null}
                                  {cargoLocked ? (
                                    <span
                                      className="tag"
                                      title="Unlock via Cargo Ops ladder"
                                    >
                                      locked
                                    </span>
                                  ) : null}
                                </div>
                                {meta ? (
                                  <small className="lot-meta" title={meta.title}>
                                    {meta.text}
                                  </small>
                                ) : (
                                  <small
                                    className="lot-meta lot-meta-empty"
                                    aria-hidden="true"
                                  >
                                    {'\u00a0'}
                                  </small>
                                )}
                                <div className="npc-badge-slot">
                                  <NpcTakenBadge
                                    claim={lot.npcClaim}
                                    nowMs={displayNowMs}
                                    weightSystem={weightSystem}
                                    formatMoney={formatMoney}
                                  />
                                </div>
                              </td>
                              <td className="distance col-compact">
                                {formatBoardDistanceNm(lot.distanceNm)}
                              </td>
                              <td className="col-cargo">
                                <div className="commodity-cell">
                                  <CommodityIcon
                                    commodityId={lot.commodityId}
                                    size={52}
                                    title={lot.commodityName}
                                  />
                                  <div title={lot.reason || undefined}>
                                    <strong>{lot.commodityName}</strong>
                                  </div>
                                </div>
                              </td>
                              <td className="col-compact">
                                <LotLoadCell
                                  lot={lot}
                                  weightSystem={weightSystem}
                                />
                              </td>
                              <td className="col-compact">
                                <LotExpiry
                                  lot={lot}
                                  tick={tick}
                                  continuousHours={continuousHours}
                                  nowMs={displayNowMs}
                                />
                                {lot.perishable ? (
                                  <small>Perishable</small>
                                ) : null}
                              </td>
                              <td className="pay col-money">
                                <LotPayCell lot={lot} idlePct={idlePct} />
                              </td>
                              <td
                                className={[
                                  'col-money',
                                  lot.npcClaim?.crewNeeded &&
                                  isFiniteMoney(lot.npcClaim.pilotFeeUsd)
                                    ? 'net'
                                    : boardNetClassName(lot.estimatedNetUsd, {
                                        inRange: lot.estimatedInRange,
                                      }),
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                              >
                                {lot.npcClaim?.crewNeeded &&
                                isFiniteMoney(lot.npcClaim.pilotFeeUsd) ? (
                                  <span
                                    className="muted"
                                    title="Crew Pay is your fee — operator lot value is not shown"
                                  >
                                    —
                                  </span>
                                ) : boardAircraft &&
                                  lot.estimatedInRange === false ? (
                                  <small title="Beyond selected aircraft range">
                                    OOR
                                  </small>
                                ) : boardAircraft &&
                                  isFiniteMoney(lot.estimatedNetUsd) ? (
                                  <span
                                    title={
                                      isFiniteMoney(lot.estimatedFuelCostUsd)
                                        ? isFiniteMoney(lot.estimatedLiftKg)
                                          ? `Lift ${formatTonnes(lot.estimatedLiftKg)} · Jet-A ${formatMoney(lot.estimatedFuelCostUsd)}`
                                          : `Jet-A ${formatMoney(lot.estimatedFuelCostUsd)}`
                                        : undefined
                                    }
                                  >
                                    {formatMoney(lot.estimatedNetUsd)}
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>
                              {contractsLane === 'outbound' ? (
                                <td className="col-access">
                                  <div className="contract-actions">
                                  <button
                                    type="button"
                                    className="accept"
                                    disabled={
                                      busy ||
                                      Boolean(clientUpdateBlock) ||
                                      Boolean(playerDispatchMission) ||
                                      cargoLocked ||
                                      (lot.npcClaim?.crewNeeded
                                        ? false
                                        : lot.status !== 'available' ||
                                          lot.availableKg <= 0)
                                    }
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (lot.npcClaim?.crewNeeded) {
                                        void onAcceptContractPilot(lot);
                                      } else {
                                        enterStagingFromContract(lot);
                                      }
                                    }}
                                    title={
                                      clientUpdateBlock
                                        ? formatClientUpdateRequiredLabel(
                                            clientUpdateBlock.minClientVersion,
                                          )
                                        : cargoLocked
                                        ? 'Locked — unlock this commodity in Hangar → Cargo Ops'
                                        : playerDispatchMission
                                        ? `Finish or cancel ${activeFlightRouteLabel(playerDispatchMission)} in Dispatch first`
                                        : lot.npcClaim?.crewNeeded
                                          ? lot.npcClaim.crewReposition
                                            ? 'Ferry empty aircraft home'
                                            : 'Fly as contract pilot'
                                          : lot.status !== 'available' ||
                                              lot.availableKg <= 0
                                            ? 'This contract is no longer available'
                                            : `Prepare ${lot.originIcao} → ${lot.destIcao}`
                                    }
                                  >
                                    {clientUpdateBlock
                                      ? formatClientUpdateCtaLabel()
                                      : cargoLocked
                                      ? 'Locked'
                                      : playerDispatchMission
                                        ? 'Flight busy'
                                        : lot.npcClaim?.crewNeeded
                                          ? lot.npcClaim.crewReposition
                                            ? 'Ferry'
                                            : 'Fly'
                                          : 'Prepare'}
                                  </button>
                                  {                                  (playerFbos?.fbos.some(
                                    (f) =>
                                      f.icao.toUpperCase() ===
                                      lot.originIcao.toUpperCase(),
                                  ) ??
                                    false) &&
                                  FBO_BONDED_HOLD_ENABLED &&
                                  !lot.npcClaim?.crewNeeded &&
                                  !lot.perishable &&
                                  lot.commodityId !== 'perishables' ? (
                                    <button
                                      type="button"
                                      className="action ghost"
                                      disabled={
                                        busy ||
                                        cargoLocked ||
                                        lot.status !== 'available' ||
                                        lot.availableKg <= 0
                                      }
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void onHoldAtFbo(lot);
                                      }}
                                      title="Bond a chosen quantity at Base without soft-filling destination"
                                    >
                                      Hold at Base
                                    </button>
                                  ) : null}
                                  </div>
                                </td>
                              ) : null}
                            </tr>
                            );
                          })}
                          {airportHydrating && sortedContractLots.length === 0 ? (
                            <TableSkeleton
                              rows={5}
                              cols={contractsLane === 'outbound' ? 8 : 7}
                            />
                          ) : sortedContractLots.length === 0 ? (
                            <tr>
                              <td
                                colSpan={contractsLane === 'outbound' ? 8 : 7}
                                className="empty"
                              >
                                {contractsOffer === 'crew'
                                  ? `No Crew needed ${contractsLane} offers here right now.`
                                  : contractsLane === 'outbound'
                                    ? 'No Aircraft needed outbound lots.'
                                    : 'No Aircraft needed inbound lots.'}
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                    <nav
                      className="pagination"
                      aria-label={
                        contractsLane === 'outbound'
                          ? 'Outbound contract pages'
                          : 'Inbound contract pages'
                      }
                    >
                      <p>
                        {sortedContractLots.length === 0
                          ? '0 records'
                          : `${(safeContractsPage - 1) * CONTRACTS_PAGE_SIZE + 1}–${Math.min(
                              safeContractsPage * CONTRACTS_PAGE_SIZE,
                              sortedContractLots.length,
                            )} of ${sortedContractLots.length}`}
                      </p>
                      <div>
                        <button
                          type="button"
                          disabled={safeContractsPage <= 1}
                          onClick={() =>
                            setContractsPage(Math.max(1, safeContractsPage - 1))
                          }
                        >
                          Previous
                        </button>
                        <span>
                          Page {safeContractsPage} of {contractsPageCount}
                        </span>
                        <button
                          type="button"
                          disabled={safeContractsPage >= contractsPageCount}
                          onClick={() =>
                            setContractsPage(
                              Math.min(
                                contractsPageCount,
                                safeContractsPage + 1,
                              ),
                            )
                          }
                        >
                          Next
                        </button>
                      </div>
                    </nav>
                    </div>
                    </div>
                    )}
                  </>
                ) : null}
        </section>
      ) : hubSelected && tab === 'charter' ? (
        <section className="panel freights-panel">
          <CharterBoard
            fleet={prepareOpsFleet}
            vaAircraftIds={vaAircraftIdSet}
            resolveAircraftCompanyId={(id) =>
              resolveOpsCompanyId(id) || undefined
            }
            initialAircraftId={boardAircraftId}
            busy={busy || Boolean(playerDispatchMission)}
            formatMoney={formatMoney}
            formatMass={(kg) => formatMass(kg, weightSystem)}
            onPrepare={enterCharterManifest}
            onOpenAirport={openAirport}
            clientUpdateRequiredMin={clientUpdateBlock?.minClientVersion ?? null}
          />
        </section>
      ) : hubSelected && tab === 'market' ? (
        <section className="panel freights-panel">
          <div className="settings-choice" role="tablist" aria-label="Freight boards">
            <button
              type="button"
              role="tab"
              aria-selected={freightsBoard === 'aircraft'}
              className={
                freightsBoard === 'aircraft'
                  ? 'settings-choice-btn active'
                  : 'settings-choice-btn'
              }
              onClick={() => {
                setFreightsBoard('aircraft');
                setMarketPage(1);
              }}
              disabled={busy}
            >
              Your aircraft
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={freightsBoard === 'crew'}
              className={
                freightsBoard === 'crew'
                  ? 'settings-choice-btn active'
                  : 'settings-choice-btn'
              }
              onClick={() => {
                setFreightsBoard('crew');
                setMarketPage(1);
              }}
              disabled={busy}
            >
              Operator aircraft
            </button>
            {BUSH_TRIPS_BOARD_ENABLED ? (
              <button
                type="button"
                role="tab"
                aria-selected={freightsBoard === 'bush'}
                className={
                  freightsBoard === 'bush'
                    ? 'settings-choice-btn active'
                    : 'settings-choice-btn'
                }
                onClick={() => {
                  setFreightsBoard('bush');
                  void refreshBushTrips();
                }}
                disabled={busy}
              >
                Bush trips
              </button>
            ) : null}
          </div>
          {BUSH_TRIPS_BOARD_ENABLED && freightsBoard === 'bush' ? (
            <>
              <div className="panel-head">
                <p className="panel-stats">
                  {bushTrips.filter((t) => t.playable).length} playable
                  {bushTrips.some((t) => !t.playable)
                    ? ` · ${bushTrips.filter((t) => !t.playable).length} draft`
                    : ''}
                  {activeBushTrip
                    ? ` · active ${activeBushTrip.title}`
                    : ''}
                </p>
              </div>
              {activeBushTrip ? (
                <p className="banner warn">
                  Active bush trip {activeBushTrip.title} (
                  {activeBushTrip.fromIcao}→{activeBushTrip.toIcao}) — finish or{' '}
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => selectTab('staging')}
                    disabled={busy}
                  >
                    abandon in Dispatch
                  </button>
                  .
                </p>
              ) : null}
              <div className="table-wrap">
                <table className="lots">
                  <thead>
                    <tr>
                      <th>Trip</th>
                      <th>Country</th>
                      <th>Route</th>
                      <th>Legs</th>
                      <th>NM</th>
                      <th>Cruise</th>
                      <th>Pay</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {bushTrips.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="muted">
                          No bush trips in catalog.
                        </td>
                      </tr>
                    ) : (
                      bushTrips.map((trip) => {
                        const canAccept =
                          trip.playable &&
                          !activeBushTrip &&
                          fleet.some(
                            (a) =>
                              a.status === 'parked' &&
                              a.aircraftClassId === 'light_ga' &&
                              a.locationIcao === trip.startIcao,
                          );
                        const routeLabel = trip.viaIcao
                          ? `${trip.startIcao}→${trip.viaIcao}→…`
                          : `${trip.startIcao}→…→${trip.endIcao}`;
                        return (
                          <tr key={trip.id}>
                            <td>
                              <strong>{trip.title}</strong>
                              {!trip.playable ? (
                                <span
                                  className="chip"
                                  title="Needs MSFS 2024 strip check before Accept"
                                >
                                  draft
                                </span>
                              ) : null}
                              {trip.summary ? (
                                <div className="muted">{trip.summary}</div>
                              ) : null}
                            </td>
                            <td>{trip.countryId}</td>
                            <td>
                              <code>{routeLabel}</code>
                            </td>
                            <td>{trip.legs}</td>
                            <td>{Math.round(trip.distanceNm)}</td>
                            <td
                              title={
                                trip.cruisingAltFt
                                  ? 'Suggested cruise from Activities PLN (whole tour)'
                                  : undefined
                              }
                            >
                              {trip.cruisingAltFt
                                ? `${trip.cruisingAltFt.toLocaleString('en-US')} ft`
                                : '—'}
                            </td>
                            <td>{formatMoney(trip.payUsd)}</td>
                            <td className="bush-trip-board-actions">
                              <div className="bush-trip-board-actions-inner">
                                {trip.hasPln ? (
                                  <>
                                    <button
                                      type="button"
                                      className="action ghost"
                                      disabled={busy}
                                      title="Download the Activities .PLN for MSFS tablet import"
                                      onClick={() => {
                                        void downloadBushTripPln(trip.id).catch(
                                          (err) =>
                                            setError(
                                              err instanceof Error
                                                ? err.message
                                                : String(err),
                                            ),
                                        );
                                      }}
                                    >
                                      PLN
                                    </button>
                                    <button
                                      type="button"
                                      className="action ghost"
                                      disabled={busy}
                                      title="Download Garmin/TDS GTNXi .gfp — place in ProgramData\\TDS\\GTNXi\\FPL"
                                      onClick={() => {
                                        void downloadBushTripGfp(trip.id).catch(
                                          (err) =>
                                            setError(
                                              err instanceof Error
                                                ? err.message
                                                : String(err),
                                            ),
                                        );
                                      }}
                                    >
                                      GFP
                                    </button>
                                  </>
                                ) : null}
                                <button
                                  type="button"
                                  className="accept"
                                  disabled={busy || !canAccept}
                                  title={
                                    !trip.playable
                                      ? 'Draft — confirm in MSFS before Accept'
                                      : activeBushTrip
                                        ? 'Abandon the active trip first'
                                        : canAccept
                                          ? `Accept with light GA at ${trip.startIcao}`
                                          : `Need light GA parked at ${trip.startIcao}`
                                  }
                                  onClick={() => void onAcceptBushTrip(trip)}
                                >
                                  {trip.playable ? 'Accept' : 'Draft'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : !careerStateReady ? (
            <BusyBoot
              title="Loading freights…"
              detail="Restoring economy snapshot — wallet and board load in a few seconds after offline time."
            />
          ) : (
            <>
          <div className="panel-head">
            <div className="board-aircraft">
              <label className="board-aircraft-picker">
                Aircraft
                <select
                  aria-label="Aircraft for Freights net estimate"
                  value={boardAircraftId}
                  disabled={boardEstimateFleet.length === 0}
                  onChange={(e) => {
                    setBoardAircraftId(e.target.value);
                    setMarketPage(1);
                  }}
                >
                  <option value="">
                    {boardEstimateFleet.length === 0
                      ? 'Gross pay (no aircraft)'
                      : 'Gross pay only'}
                  </option>
                  {boardEstimateFleet.map((acf) => (
                    <option key={acf.id} value={acf.id}>
                      {vaAircraftIdSet.has(acf.id) ? 'Airline' : 'Yours'}
                      {' · '}
                      {acf.label}
                      {acf.status === 'parked'
                        ? ` · ${acf.locationIcao}`
                        : ` · ${acf.status}`}
                    </option>
                  ))}
                </select>
              </label>
              {boardAircraftId && vaAircraftIdSet.has(boardAircraftId) ? (
                <p className="board-va-ops-chip" role="status">
                  Airline tail
                  {vaMemberRouteCutPct != null
                                ? ` · ${vaMemberRouteCutPct}% market hire → your home Wallet`
                    : ' · Jet-A from company · cut → your home Wallet'}
                  {memberVaIsOwner ? ' · you are owner' : ''}
                </p>
              ) : null}
              <div
                className="board-aircraft-scope"
                role="group"
                aria-label="Freight board scope"
              >
                <button
                  type="button"
                  className={`near-aircraft-btn${
                    nearMe && !originFilter.trim() ? ' is-active' : ''
                  }`}
                  aria-pressed={nearMe && !originFilter.trim()}
                  disabled={
                    busy ||
                    !(
                      boardAircraft?.locationIcao ||
                      pilotIcao ||
                      homeHubIcao
                    )
                  }
                  title={
                    nearMe && !originFilter.trim()
                      ? `Showing origins within ${BOARD_NEAR_MAX_NM} nm of ${
                          boardNearIcao || 'home'
                        }. Click again to show the world board.`
                      : `Limit origins to within ${BOARD_NEAR_MAX_NM} nm of ${
                          boardAircraft?.locationIcao ||
                          boardNearIcao ||
                          'home'
                        }. Click again to turn off.`
                  }
                  onClick={() => toggleNearBoard()}
                >
                  <span className="near-aircraft-mark" aria-hidden />
                  {boardAircraft ? 'Near aircraft' : 'Near me'}
                </button>
                
              </div>
            </div>
            <MarketSignalsLine
              regions={regionPressure}
              focusIcao={signalFocusIcao || undefined}
              focusRegion={resolveHubRegion(
                signalFocusIcao || undefined,
                networkHubs,
              )}
            />
          </div>
          {playerDispatchMission ? (
            <p className="banner warn" title={playerDispatchMission.id}>
              Active flight {activeFlightRouteLabel(playerDispatchMission)} —
              finish or cancel it in{' '}
              <button
                type="button"
                className="linkish"
                onClick={() => selectTab('staging')}
                disabled={busy}
              >
                Dispatch
              </button>{' '}
              before preparing another.
            </p>
          ) : null}
          <div
            className={`table-wrap freights-board-table${
              marketBoardLoading ? ' is-loading' : ''
            }`}
            aria-busy={marketBoardLoading}
          >
            {marketBoardLoading ? (
              <BusyChip
                className="freights-board-loading"
                label={
                  pagedLots.length === 0
                    ? 'Loading freights'
                    : 'Updating freights'
                }
              />
            ) : null}
            <table>
              <thead>
                <tr>
                  <th className="col-route">Route</th>
                  <th aria-sort={marketAriaSort('distance')} className="col-compact">
                    <button
                      type="button"
                      className={`sort-header${marketSorts.some((l) => l.key === 'distance') ? ' is-sorted' : ''}`}
                      title="Sort by distance. Click another column to add a sort level; click again to reverse or clear."
                      onClick={() => toggleMarketSort('distance')}
                    >
                      Distance <span>{sortIndicator('distance')}</span>
                    </button>
                  </th>
                  <th aria-sort={marketAriaSort('cargo')} className="col-cargo">
                    <button
                      type="button"
                      className={`sort-header${marketSorts.some((l) => l.key === 'cargo') ? ' is-sorted' : ''}`}
                      title="Sort by cargo. Click another column to add a sort level; click again to reverse or clear."
                      onClick={() => toggleMarketSort('cargo')}
                    >
                      Cargo <span>{sortIndicator('cargo')}</span>
                    </button>
                  </th>
                  <th aria-sort={marketAriaSort('load')} className="col-compact">
                    <button
                      type="button"
                      className={`sort-header${marketSorts.some((l) => l.key === 'load') ? ' is-sorted' : ''}`}
                      title="Sort by load. Click another column to add a sort level; click again to reverse or clear."
                      onClick={() => toggleMarketSort('load')}
                    >
                      Load <span>{sortIndicator('load')}</span>
                    </button>
                  </th>
                  <th aria-sort={marketAriaSort('expires')} className="col-compact">
                    <button
                      type="button"
                      className={`sort-header${marketSorts.some((l) => l.key === 'expires') ? ' is-sorted' : ''}`}
                      title="Sort by expiry. Click another column to add a sort level; click again to reverse or clear."
                      onClick={() => toggleMarketSort('expires')}
                    >
                      Expires <span>{sortIndicator('expires')}</span>
                    </button>
                  </th>
                  <th aria-sort={marketAriaSort('pay')} className="col-money">
                    <button
                      type="button"
                      className={`sort-header${marketSorts.some((l) => l.key === 'pay') ? ' is-sorted' : ''}`}
                      title="Sort by pay. Click another column to add a sort level; click again to reverse or clear."
                      onClick={() => toggleMarketSort('pay')}
                    >
                      Pay <span>{sortIndicator('pay')}</span>
                    </button>
                  </th>
                  <th aria-sort={marketAriaSort('net')} className="col-money">
                    <button
                      type="button"
                      className={`sort-header${marketSorts.some((l) => l.key === 'net') ? ' is-sorted' : ''}`}
                      title={
                        boardEstimateFleet.length === 0
                          ? 'Net needs an aircraft estimate — crew Pay is your fee'
                          : boardAircraft
                            ? `Sort by estimated net (pay − Jet-A) for ${boardAircraft.label}`
                            : 'Select an aircraft above to estimate net (pay − Jet-A)'
                      }
                      onClick={() => toggleMarketSort('net')}
                      disabled={boardEstimateFleet.length > 0 && !boardAircraft}
                    >
                      Net <span>{sortIndicator('net')}</span>
                    </button>
                  </th>
                  <th aria-sort={marketAriaSort('access')} className="col-access">
                    <button
                      type="button"
                      className={`sort-header${marketSorts.some((l) => l.key === 'access') ? ' is-sorted' : ''}`}
                      title="Sort by Cargo Ops access. Click to unlock-first, again for locked-first, again to clear."
                      onClick={() => toggleMarketSort('access')}
                    >
                      Access <span>{sortIndicator('access')}</span>
                    </button>
                  </th>
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
                          value={originFilter}
                          onChange={(e) => {
                            if (nearMe) setNearMe(false);
                            updateMarketFilter(setOriginFilter, e.target.value);
                          }}
                        />
                        <input
                          type="search"
                          className="route-filter"
                          aria-label="Filter destination by ICAO or city"
                          placeholder="Dest"
                          value={destFilter}
                          onChange={(e) =>
                            updateMarketFilter(setDestFilter, e.target.value)
                          }
                        />
                        <select
                          className="route-lane-filter"
                          aria-label="Filter by route scope"
                          value={laneFilter}
                          onChange={(e) => {
                            const next = e.target.value;
                            setLaneFilter(
                              next === 'intl' ||
                                next === 'domestic' ||
                                next === 'pilot-domestic' ||
                                next === 'pilot-intl' ||
                                next === 'bush'
                                ? next
                                : '',
                            );
                            setMarketPage(1);
                          }}
                        >
                          <option value="">Any route</option>
                          <option value="intl">Intl</option>
                          <option value="domestic">Domestic</option>
                          <option value="pilot-domestic">
                            Domestic · pilot country
                          </option>
                          <option value="pilot-intl">
                            Intl · pilot country
                          </option>
                        </select>
                      </div>
                      {nearMe && boardNearIcao && !originFilter.trim() ? (
                        <button
                          type="button"
                          className="near-me-chip"
                          title={`Origins within ${BOARD_NEAR_MAX_NM} nm of ${boardNearIcao}. Click to show the world board.`}
                          onClick={() => {
                            setNearMe(false);
                            setMarketPage(1);
                          }}
                        >
                          ≤{BOARD_NEAR_MAX_NM} nm of {boardNearIcao}
                        </button>
                      ) : null}
                      {ownedFboIcaos.length >= 2 ? (
                        <div
                          className="fbo-icao-switcher"
                          role="group"
                          aria-label="Sister Base destinations"
                        >
                          {ownedFboIcaos.map((icao) => (
                            <button
                              key={icao}
                              type="button"
                              className={
                                destFilter.trim().toUpperCase() === icao
                                  ? 'fbo-icao-chip active'
                                  : 'fbo-icao-chip'
                              }
                              disabled={busy}
                              title={`Filter dest → ${icao}`}
                              onClick={() =>
                                updateMarketFilter(
                                  setDestFilter,
                                  destFilter.trim().toUpperCase() === icao
                                    ? ''
                                    : icao,
                                )
                              }
                            >
                              →{icao}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </th>
                  <th className="col-compact">
                    <select
                      aria-label="Maximum distance"
                      value={distanceMaxNm}
                      onChange={(e) =>
                        updateMarketFilter(setDistanceMaxNm, e.target.value)
                      }
                    >
                      <option value="">Any</option>
                      <option value="250">≤ 250 nm</option>
                      <option value="500">≤ 500 nm</option>
                      <option value="1000">≤ 1,000 nm</option>
                      <option value="2000">≤ 2,000 nm</option>
                      <option value="3000">≤ 3,000 nm</option>
                    </select>
                  </th>
                  <th className="col-cargo">
                    <select
                      aria-label="Cargo commodity"
                      value={cargoFilter}
                      onChange={(e) =>
                        updateMarketFilter(setCargoFilter, e.target.value)
                      }
                    >
                      <option value="">Any</option>
                      {cargoOptions.map(({ id, name }) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </th>
                  <th className="col-compact">
                    <div className="load-filter-pair">
                      <select
                        aria-label="Minimum cargo load"
                        value={loadMinKg}
                        onChange={(e) =>
                          updateMarketFilter(setLoadMinKg, e.target.value)
                        }
                      >
                        <option value="">≥</option>
                        {loadFilterSteps.map((step) => (
                          <option key={`min-${step.kg}`} value={String(step.kg)}>
                            ≥ {step.label}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Maximum cargo load"
                        value={loadMaxKg}
                        onChange={(e) =>
                          updateMarketFilter(setLoadMaxKg, e.target.value)
                        }
                      >
                        <option value="">≤</option>
                        {loadFilterSteps.map((step) => (
                          <option key={`max-${step.kg}`} value={String(step.kg)}>
                            ≤ {step.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </th>
                  <th className="col-compact">
                    <select
                      aria-label="Expires within"
                      value={expiresWithinHours}
                      onChange={(e) =>
                        updateMarketFilter(setExpiresWithinHours, e.target.value)
                      }
                    >
                      <option value="">Any</option>
                      <option value="6">≤ 6 h</option>
                      <option value="12">≤ 12 h</option>
                      <option value="24">≤ 24 h</option>
                      <option value="48">≤ 48 h</option>
                    </select>
                  </th>
                  <th className="col-money">
                    <select
                      aria-label="Minimum pay"
                      value={minimumPayUsd}
                      onChange={(e) =>
                        updateMarketFilter(setMinimumPayUsd, e.target.value)
                      }
                    >
                      <option value="">Any</option>
                      <option value="1000">≥ $1,000</option>
                      <option value="5000">≥ $5,000</option>
                      <option value="10000">≥ $10,000</option>
                      <option value="25000">≥ $25,000</option>
                    </select>
                  </th>
                  <th className="col-money">
                    <label className="profitable-filter">
                      <input
                        type="checkbox"
                        checked={profitableOnly}
                        disabled={!boardAircraft}
                        onChange={(e) => {
                          setProfitableOnly(e.target.checked);
                          setMarketPage(1);
                        }}
                      />
                      <span title="Show only lots with estimated net &gt; $0 after Jet-A">
                        Profit &gt; 0
                      </span>
                    </label>
                  </th>
                  <th className="col-access">
                    <div className="access-filter-cell">
                      <select
                        aria-label="Filter by Cargo Ops access"
                        value={accessFilter}
                        onChange={(e) => {
                          const next = e.target.value;
                          setAccessFilter(
                            next === 'open' || next === 'locked' ? next : '',
                          );
                          setMarketPage(1);
                        }}
                      >
                        <option value="">Any</option>
                        <option value="open">Open</option>
                        <option value="locked">Locked</option>
                      </select>
                      {hasMarketFilters ||
                      marketSorts.length !== DEFAULT_BOARD_SORTS.length ||
                      marketSorts.some(
                        (level, i) =>
                          level.key !== DEFAULT_BOARD_SORTS[i]?.key ||
                          level.direction !== DEFAULT_BOARD_SORTS[i]?.direction,
                      ) ? (
                        <button
                          type="button"
                          className="clear-filters"
                          onClick={() => {
                            clearMarketFilters();
                            setMarketSorts([...DEFAULT_BOARD_SORTS]);
                          }}
                          title={
                            marketSorts.length > 1
                              ? `Clear filters and reset ${marketSorts.length} sort levels`
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
                {marketBoardLoading && pagedLots.length === 0 ? (
                  <TableSkeleton rows={8} cols={8} />
                ) : (
                  <>
                {pagedLots.map((lot) => {
                  const meta = lotPressureMeta(lot);
                  const idlePct = idleUptickPct(lot);
                  const cargoLocked = isCargoOpsCommodityLocked(lot.commodityId);
                  return (
                  <tr key={lot.id} className={cargoLocked ? 'lot-locked' : undefined}>
                    <td className="col-route">
                      <div className="route">
                        <IcaoLink
                          icao={lot.originIcao}
                          name={lot.originName}
                          onOpen={openAirport}
                          disabled={busy}
                        />
                        <span className="arrow">→</span>
                        <IcaoLink
                          icao={lot.destIcao}
                          name={lot.destName}
                          onOpen={openAirport}
                          disabled={busy}
                        />
                        {lot.urgency === 'urgent' ? <span className="tag">Urgent</span> : null}
                        {(lot.quantityKg ?? lot.availableKg) >= 40_000 ? (
                          <span className="tag" title="Wide fill · XL lot (40–90 t)">
                            XL
                          </span>
                        ) : null}
                        {lot.pressure?.international ? (
                          <span className="tag" title="International lane freight">
                            intl
                          </span>
                        ) : null}
                        {lot.bush ? (
                          <span
                            className="tag"
                            title="Bush soft-field — light GA only, no ferry"
                          >
                            bush
                          </span>
                        ) : null}
                        {lot.lastMile ? (
                          <span
                            className="tag"
                            title="Last-mile Dry — short GA hop from a hub"
                          >
                            last-mile
                          </span>
                        ) : null}
                        {cargoLocked ? (
                          <span className="tag" title="Unlock via Cargo Ops ladder">
                            locked
                          </span>
                        ) : null}
                      </div>
                      {meta ? (
                        <small className="lot-meta" title={meta.title}>
                          {meta.text}
                        </small>
                      ) : (
                        <small className="lot-meta lot-meta-empty" aria-hidden="true">
                          {'\u00a0'}
                        </small>
                      )}
                      <div className="npc-badge-slot">
                        <NpcTakenBadge
                          claim={lot.npcClaim}
                          nowMs={displayNowMs}
                          weightSystem={weightSystem}
                          formatMoney={formatMoney}
                        />
                      </div>
                    </td>
                    <td className="distance col-compact">
                      {formatBoardDistanceNm(lot.distanceNm)}
                    </td>
                    <td className="col-cargo">
                      <div className="commodity-cell">
                        <CommodityIcon
                          commodityId={lot.commodityId}
                          size={52}
                          title={lot.commodityName}
                        />
                        <div title={lot.reason || undefined}>
                          <strong>{lot.commodityName}</strong>
                        </div>
                      </div>
                    </td>
                    <td className="col-compact">
                      <LotLoadCell lot={lot} weightSystem={weightSystem} />
                    </td>
                    <td className="col-compact">
                      <LotExpiry
                        lot={lot}
                        tick={tick}
                        continuousHours={continuousHours}
                        nowMs={displayNowMs}
                      />
                      {lot.perishable ? <small>Perishable</small> : null}
                    </td>
                    <td className="pay col-money">
                      <LotPayCell lot={lot} idlePct={idlePct} />
                    </td>
                    <td
                      className={[
                        'col-money',
                        lot.npcClaim?.crewNeeded &&
                        isFiniteMoney(lot.npcClaim.pilotFeeUsd)
                          ? 'net'
                          : boardNetClassName(lot.estimatedNetUsd),
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {lot.npcClaim?.crewNeeded &&
                      isFiniteMoney(lot.npcClaim.pilotFeeUsd) ? (
                        <span
                          className="muted"
                          title="Crew Pay is your fee — operator lot value is not shown"
                        >
                          —
                        </span>
                      ) : boardAircraft &&
                        isFiniteMoney(lot.estimatedNetUsd) ? (
                        <span
                          title={
                            isFiniteMoney(lot.estimatedFuelCostUsd)
                              ? isFiniteMoney(lot.estimatedLiftKg)
                                ? `Lift ${formatTonnes(lot.estimatedLiftKg)} · Jet-A ${formatMoney(lot.estimatedFuelCostUsd)}`
                                : `Jet-A ${formatMoney(lot.estimatedFuelCostUsd)}`
                              : undefined
                          }
                        >
                          {formatMoney(lot.estimatedNetUsd)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="col-access">
                      <button
                        type="button"
                        className="accept"
                        disabled={
                          busy ||
                          Boolean(clientUpdateBlock) ||
                          Boolean(playerDispatchMission) ||
                          cargoLocked ||
                          (boardEstimateFleet.length === 0 &&
                            !lot.npcClaim?.crewNeeded)
                        }
                        onClick={() =>
                          lot.npcClaim?.crewNeeded
                            ? void onAcceptContractPilot(lot)
                            : enterStaging(lot)
                        }
                        title={
                          clientUpdateBlock
                            ? formatClientUpdateRequiredLabel(
                                clientUpdateBlock.minClientVersion,
                              )
                            : cargoLocked
                            ? 'Locked — unlock this commodity in Hangar → Cargo Ops'
                            : playerDispatchMission
                            ? `Finish or cancel ${activeFlightRouteLabel(playerDispatchMission)} in Dispatch first`
                            : boardEstimateFleet.length === 0 &&
                                !lot.npcClaim?.crewNeeded
                              ? 'Need an aircraft — join an airline with a hangar, fly Operator aircraft, or buy a starter'
                            : lot.npcClaim?.crewNeeded
                              ? lot.npcClaim.crewReposition
                                ? 'Ferry empty aircraft home'
                                : 'Fly as contract pilot'
                              : staging &&
                                  staging.originIcao === lot.originIcao &&
                                  staging.destIcao === lot.destIcao
                                ? 'Replace current staging draft'
                                : 'Open Dispatch'
                        }
                      >
                        {clientUpdateBlock
                          ? formatClientUpdateCtaLabel()
                          : cargoLocked
                          ? 'Locked'
                          : playerDispatchMission
                          ? 'Flight busy'
                          : boardEstimateFleet.length === 0 &&
                              !lot.npcClaim?.crewNeeded
                            ? 'Need aircraft'
                            : lot.npcClaim?.crewNeeded
                              ? lot.npcClaim.crewReposition
                                ? 'Ferry'
                                : 'Fly'
                              : staging &&
                                  staging.originIcao === lot.originIcao &&
                                  staging.destIcao === lot.destIcao
                                ? 'Restage'
                                : 'Prepare'}
                      </button>
                    </td>
                  </tr>
                  );
                })}
                {pagedLots.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty">
                      {marketTotalLots === 0 &&
                            !hasMarketFilters &&
                            marketSorts.length === 0
                          ? freightsBoard === 'crew'
                            ? 'No Operator aircraft offers nearby — advance time or try Your aircraft.'
                            : boardEstimateFleet.length === 0
                              ? 'No Your aircraft lots you can take yet — open Operator aircraft, join an airline with a hangar, or buy a starter airframe.'
                              : 'No freights yet — advance time (+15 min) or wait for a pulse.'
                          : freightsBoard === 'crew'
                            ? 'No Operator aircraft offers match the selected filters.'
                            : 'No Your aircraft lots match the selected filters.'}
                    </td>
                  </tr>
                ) : null}
                  </>
                )}
              </tbody>
            </table>
          </div>
          <nav className="pagination" aria-label="Freight pages">
            <p>
              {marketTotalLots === 0
                ? '0 records'
                : `${(safeMarketPage - 1) * MARKET_PAGE_SIZE + 1}–${Math.min(
                    safeMarketPage * MARKET_PAGE_SIZE,
                    marketTotalLots,
                  )} of ${marketTotalLots}`}
            </p>
            <div>
              <button
                type="button"
                disabled={marketBoardLoading || safeMarketPage <= 1}
                onClick={() => setMarketPage((page) => Math.max(1, page - 1))}
              >
                Previous
              </button>
              <span>
                Page {safeMarketPage} of {marketPageCount}
              </span>
              <button
                type="button"
                disabled={
                  marketBoardLoading || safeMarketPage >= marketPageCount
                }
                onClick={() =>
                  setMarketPage((page) => Math.min(marketPageCount, page + 1))
                }
              >
                Next
              </button>
            </div>
          </nav>
            </>
          )}
        </section>
      ) : hubSelected && showStaging ? (
        <section className="panel staging-panel">
          {!careerReady ? (
            <BusyBoot
              align="center"
              title="Loading dispatch…"
              detail="Restoring wallet, fleet, and any active flight for this profile."
            />
          ) : activeBushTrip ? (
            <>
              <div className="debrief-card">
                <div className="debrief-card-head">
                  <strong>BUSH TRIP</strong>
                  <span className="debrief-ok">
                    {activeBushTrip.status === 'in_progress' ||
                    activeBushTrip.legStatus === 'departed'
                      ? 'In progress'
                      : 'Accepted'}
                  </span>
                </div>
                <p>
                  <strong>{activeBushTrip.title}</strong> · leg{' '}
                  {activeBushTrip.legIndex + 1}/{activeBushTrip.legs} ·{' '}
                  <code>
                    {activeBushTrip.fromIcao}→{activeBushTrip.toIcao}
                  </code>
                  {typeof activeBushTrip.cruisingAltFt === 'number' &&
                  activeBushTrip.cruisingAltFt > 0
                    ? ` · cruise ${activeBushTrip.cruisingAltFt.toLocaleString('en-US')} ft`
                    : ''}
                </p>
                <p className="muted" role="status">
                  {bushWatch?.running
                    ? `Watch · ${bushWatch.phase ?? '…'} · ${
                        bushWatch.onGround === false
                          ? 'airborne'
                          : bushWatch.onGround
                            ? 'ground'
                            : '…'
                      }${
                        bushWatch.pipeConnected === false
                          ? ' · reconnecting'
                          : ''
                      }`
                    : bushWatch?.lastError
                      ? `Watch offline — ${bushWatch.lastError}`
                      : 'Starting bush Watch…'}
                </p>
                <div className="debrief-actions">
                  <button
                    type="button"
                    className="action ghost"
                    disabled={busy}
                    onClick={() => void onAbandonBushTrip()}
                  >
                    Abandon trip
                  </button>
                  {BUSH_TRIPS_BOARD_ENABLED ? (
                    <button
                      type="button"
                      className="action ghost"
                      disabled={busy}
                      onClick={() => {
                        setFreightsBoard('bush');
                        selectTab('market');
                      }}
                    >
                      Bush board
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="action ghost"
                      disabled={busy}
                      onClick={() => {
                        setFreightsBoard('aircraft');
                        selectTab('market');
                      }}
                    >
                      Freights
                    </button>
                  )}
                </div>
              </div>
              {null /* bush trips removed */}
            </>
          ) : stagingMode === 'debrief' && flightDebrief ? (
            <>
              <DispatchStepper current="debrief" />
              <section
                className="debrief-card debrief-sheet"
                aria-live="polite"
              >
                <header className="debrief-hero">
                  <p className="debrief-kicker">Flight complete</p>
                  <h2>
                    {flightDebrief.originIcao}
                    <span className="debrief-hero-arrow" aria-hidden="true">
                      →
                    </span>
                    {flightDebrief.destIcao}
                  </h2>
                  <p className="debrief-hero-meta">
                    <span
                      className={
                        flightDebrief.onTime ? 'debrief-ok' : 'debrief-late'
                      }
                    >
                      {flightDebrief.onTime
                        ? 'On time'
                        : `Late ${(flightDebrief.lateTicks / 4).toFixed(1)}h`}
                    </span>
                    {flightDebrief.flightDurationMs != null ? (
                      <>
                        {' · '}
                        {formatFlightDurationMs(flightDebrief.flightDurationMs)}{' '}
                        airborne
                      </>
                    ) : null}
                  </p>
                </header>

                <div className="debrief-layout">
                  <div className="debrief-col-touch">
                    {flightDebrief.runwayTouch ? (
                      <div className="debrief-runway-block">
                        <RunwayTouchdownDiagram
                          touch={flightDebrief.runwayTouch}
                        />
                        {formatRunwayTouchdownDebriefLine(
                          flightDebrief.runwayTouch,
                        ) ? (
                          <p
                            className={
                              flightDebrief.runwayTouch.onPavement
                                ? 'debrief-runway-line'
                                : 'debrief-runway-line debrief-runway-line-off'
                            }
                          >
                            {formatRunwayTouchdownDebriefLine(
                              flightDebrief.runwayTouch,
                            )}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="muted debrief-no-touch">
                        No runway sample this leg — landing still scored from
                        vertical speed when Watch had it.
                      </p>
                    )}
                  </div>

                  <div className="debrief-col-stats">
                    <div className="debrief-hero-money">
                      <div>
                        <span className="debrief-hero-money-label">Net</span>
                        <strong className="debrief-hero-money-net">
                          {boardMoneyLabel(flightDebrief.netUsd, formatMoney)}
                        </strong>
                      </div>
                      {flightDebrief.flightScore ? (
                        <div className="debrief-hero-score">
                          <span className="debrief-hero-money-label">Score</span>
                          <strong
                            className={
                              flightDebrief.flightScore.pct >= 90
                                ? 'debrief-ok'
                                : flightDebrief.flightScore.pct < 70
                                  ? 'debrief-late'
                                  : undefined
                            }
                          >
                            {Math.round(flightDebrief.flightScore.pct)}%
                          </strong>
                        </div>
                      ) : null}
                    </div>

                    <dl className="debrief-metrics">
                      <div>
                        <dt>Payout</dt>
                        <dd>{formatMoney(flightDebrief.payoutUsd)}</dd>
                      </div>
                      {flightDebrief.penaltyUsd > 0 ? (
                        <div>
                          <dt>Late</dt>
                          <dd>−{formatMoney(flightDebrief.penaltyUsd)}</dd>
                        </div>
                      ) : null}
                      {flightDebrief.fuelCostUsd > 0 ? (
                        <div>
                          <dt>Fuel</dt>
                          <dd>−{formatMoney(flightDebrief.fuelCostUsd)}</dd>
                        </div>
                      ) : null}
                      <div>
                        <dt>Landing</dt>
                        <dd>{formatLandingFpm(flightDebrief.landingFpm)}</dd>
                      </div>
                      {flightDebrief.weatherBonusUsd > 0 ? (
                        <div>
                          <dt>Weather</dt>
                          <dd>+{formatMoney(flightDebrief.weatherBonusUsd)}</dd>
                        </div>
                      ) : null}
                    </dl>

                    {flightDebrief.flightScore ? (
                      <div
                        className="flight-score flight-score-compact"
                        aria-label="Flight score"
                      >
                        <ul className="flight-score-cats">
                          {flightDebrief.flightScore.categories.map((cat) => (
                            <li key={cat.id}>
                              <div className="flight-score-cat-head">
                                <span>{cat.label}</span>
                                <span>
                                  {cat.earned}/{cat.max}
                                </span>
                              </div>
                              <div
                                className="flight-score-bar"
                                role="presentation"
                              >
                                <div
                                  className="flight-score-bar-fill"
                                  style={{
                                    width: `${
                                      cat.max > 0
                                        ? Math.round(
                                            (100 * cat.earned) / cat.max,
                                          )
                                        : 0
                                    }%`,
                                  }}
                                />
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {flightDebrief.cargoOpsDeltas.length > 0 ? (
                      <div className="cargo-ops-debrief" aria-label="Cargo Ops">
                        <strong>Cargo Ops</strong>
                        <p>
                          {formatCargoOpsDebriefLine(
                            flightDebrief.cargoOpsDeltas,
                          )}
                        </p>
                      </div>
                    ) : null}

                    {flightDebrief.classOpsDeltas.length > 0 ? (
                      <div className="cargo-ops-debrief" aria-label="Class Ops">
                        <strong>Class Ops</strong>
                        <p>
                          {formatClassOpsDebriefLine(
                            flightDebrief.classOpsDeltas,
                          )}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="debrief-actions">
                  <button
                    type="button"
                    className="accept"
                    disabled={busy}
                    onClick={() => {
                      setFlightDebrief(null);
                      setSettleOverlaySticky(false);
                      selectTab('market');
                    }}
                  >
                    Back to Freights
                  </button>
                  <button
                    type="button"
                    className="action ghost"
                    disabled={busy}
                    onClick={() => {
                      setFlightDebrief(null);
                      setSettleOverlaySticky(false);
                      selectTab('missions');
                    }}
                  >
                    Open Logbook
                  </button>
                  <button
                    type="button"
                    className="action ghost"
                    disabled={busy}
                    onClick={() => {
                      setFlightDebrief(null);
                      setSettleOverlaySticky(false);
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </section>
            </>
          ) : charterManifest ? (
            <>
              <DispatchStepper current="manifest" />
              <p className="dispatch-step-status" role="status">
                Charter · fixed passenger manifest
              </p>
              <CharterManifest
                draft={charterManifest}
                fleet={prepareOpsFleet}
                vaAircraftIds={vaAircraftIdSet}
                busy={busy}
                formatMoney={formatMoney}
                formatMass={(kg) => formatMass(kg, weightSystem)}
                onChange={setCharterManifest}
                onCancel={() => setCharterManifest(null)}
                onFerry={(aircraftId, legDest, finalDest) =>
                  onFerry(aircraftId, legDest, { finalDest })
                }
                onAccept={onAcceptCharter}
                resolveOpsCompanyId={(aircraftId) =>
                  resolveOpsCompanyId(aircraftId)
                }
                clientUpdateRequiredMin={
                  clientUpdateBlock?.minClientVersion ?? null
                }
                onOpenUpdates={() => selectTab('settings')}
              />
            </>
          ) : stagingMode === 'empty' ? (
            <>
              <div className="panel-head missions-head">
                <div>
                  <h2>No active flight</h2>
                  <p>
                    Dispatch is empty after settle or cancel. Your aircraft is at{' '}
                    <strong>
                      {fleet.find((a) => a.status === 'parked')?.locationIcao ?? '—'}
                    </strong>
                    . Prepare a freight from that origin on Freights.
                  </p>
                </div>
                <button
                  type="button"
                  className="accept"
                  onClick={() => selectTab('market')}
                  disabled={busy}
                >
                  Open Freights
                </button>
              </div>
              <div className="staging-empty">
                <p>
                  One operational flight at a time. History stays in the{' '}
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => selectTab('missions')}
                    disabled={busy}
                  >
                    Logbook
                  </button>
                  .
                </p>
              </div>
            </>
          ) : stagingMode === 'draft' && staging ? (
            <>
              <DispatchStepper current="manifest" />
              <p className="dispatch-step-status" role="status">
                {dispatchStatusText}
              </p>
              <div className="staging-manifest-head">
                <div className="panel-head missions-head">
                  <div className="missions-head-spacer" aria-hidden="true" />
                  <div className="missions-head-center">
                    <h2>
                      <IcaoLink
                        icao={staging.originIcao}
                        onOpen={openAirport}
                        disabled={busy}
                      />{' '}
                      →{' '}
                      <IcaoLink
                        icao={staging.destIcao}
                        onOpen={openAirport}
                        disabled={busy}
                      />
                    </h2>
                    <p>
                      {stagingAssignedLabel}
                      {stagingAssignedLabel !== aircraftClassLabel(staging.aircraft)
                        ? ` · ${aircraftClassLabel(staging.aircraft)}`
                        : null}
                      {staging.replaceManifest
                        ? ' · editing manifest'
                        : stagingExisting
                          ? ' · adding cargo'
                          : ' · new flight'}
                    </p>
                  </div>
                  <div className="missions-head-actions">
                    <button
                      type="button"
                      className={
                        staging.replaceManifest
                          ? 'action ghost info compact'
                          : 'action ghost danger compact'
                      }
                      onClick={() =>
                        void (staging.replaceManifest
                          ? onBackFromManifestEdit()
                          : onCancelStagingFlight())
                      }
                      disabled={busy}
                    >
                      {stagingBlockingMission
                        ? 'Cancel flight'
                        : staging.replaceManifest
                          ? 'Back to Dispatch'
                          : 'Discard manifest'}
                    </button>
                  </div>
                </div>
                <div className="staging-manifest-aircraft">
                  <label className="staging-aircraft staging-aircraft-centered">
                    Aircraft
                    <select
                      value={staging.aircraftId ?? ''}
                      onChange={(event) =>
                        changeStagingAircraft(event.target.value)
                      }
                      disabled={
                        busy ||
                        Boolean(staging.intoMissionId) ||
                        Boolean(staging.replaceManifest)
                      }
                      title={
                        staging.intoMissionId || staging.replaceManifest
                          ? 'Aircraft locked to the active flight'
                          : undefined
                      }
                    >
                      {prepareOpsFleetEntries
                        .filter(
                          (entry) =>
                            entry.aircraft.id === staging.aircraftId ||
                            entry.aircraft.status === 'parked' ||
                            entry.aircraft.status === 'ferry',
                        )
                        .map((entry) => {
                          const enRoute =
                            entry.aircraft.status === 'ferry' &&
                            entry.aircraft.npcFerry
                              ? `Line crew → ${entry.aircraft.npcFerry.destIcao}`
                              : entry.aircraft.status === 'ferry'
                                ? 'Line crew en route'
                                : null;
                          return (
                            <option
                              key={entry.aircraft.id}
                              value={entry.aircraft.id}
                              disabled={entry.aircraft.status !== 'parked'}
                            >
                              {enRoute
                                ? `${entry.owner === 'va' ? 'Airline' : 'Yours'} · ${entry.aircraft.label} · ${enRoute}`
                                : opsAircraftSelectLabel(
                                    entry,
                                    staging.originIcao,
                                  )}
                            </option>
                          );
                        })}
                    </select>
                  </label>
                  {stagingAssignedAircraft &&
                  !stagingAircraftAtOrigin &&
                  !staging.replaceManifest &&
                  !staging.intoMissionId ? (
                    <div className="staging-manifest-ferry">
                      <p className="muted staging-manifest-ferry-hint">
                        {stagingAssignedAircraft.label} is at{' '}
                        {stagingAssignedAircraft.locationIcao} — ferry to{' '}
                        {staging.originIcao} before Accept &amp; Dispatch.
                      </p>
                      <button
                        type="button"
                        className="accept"
                        disabled={
                          busy || stagingAssignedAircraft.status !== 'parked'
                        }
                        onClick={() => setStagingFerryOpen(true)}
                      >
                        Ferry to {staging.originIcao}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              {stagingFerryOpen &&
              stagingAssignedAircraft &&
              stagingAssignedAircraft.status === 'parked' ? (
                <FerryJourneyDialog
                  aircraft={stagingAssignedAircraft}
                  finalDestIcao={staging.originIcao}
                  formatMoney={formatMoney}
                  busy={busy}
                  companyId={resolveOpsCompanyId(stagingAssignedAircraft.id)}
                  onClose={() => setStagingFerryOpen(false)}
                  onFlyLeg={async (legDest) => {
                    await onFerry(stagingAssignedAircraft.id, legDest, {
                      finalDest: staging.originIcao,
                      companyId: resolveOpsCompanyId(
                        stagingAssignedAircraft.id,
                      ),
                    });
                  }}
                />
              ) : null}

              <DispatchFlightSummary
                ariaLabel="Manifest summary"
                formatTonnes={formatTonnes}
                capacityLabel="Payload reserved"
                totalKg={stagingTotalKg}
                capKg={aircraftCapKg(staging.aircraft)}
                capacityNote={
                  structuralMaxCargoKg !== null &&
                  aircraftCapKg(staging.aircraft) + 1 < structuralMaxCargoKg
                    ? `Structural ${formatTonnes(structuralMaxCargoKg)} · route ops is the booking cap`
                    : undefined
                }
                highlights={[
                  {
                    label: 'Contract pay',
                    value: formatMoney(stagingContractPayUsd),
                  },
                  {
                    label: 'Est. net',
                    value: boardMoneyLabel(stagingEstNetUsd, formatMoney),
                    strongClassName:
                      isFiniteMoney(stagingEstNetUsd) && stagingEstNetUsd < 0
                        ? 'staging-est-net-loss'
                        : isFiniteMoney(stagingEstNetUsd) &&
                            stagingEstNetUsd >= 0
                          ? 'staging-est-net-ok'
                          : undefined,
                  },
                  {
                    label: 'Route',
                    value: formatBoardDistanceNm(stagingDistanceNm),
                  },
                ]}
                planningDetails={
                  <>
                    <span>
                      Operational payload
                      <strong>{formatTonnes(aircraftCapKg(staging.aircraft))}</strong>
                      <em>
                        {structuralMaxCargoKg !== null
                          ? `structural ${formatTonnes(structuralMaxCargoKg)}`
                          : 'structural pending'}
                        {' · MTOW/fuel estimate'}
                      </em>
                    </span>
                    <span>
                      Manifest total
                      <strong>{formatTonnes(stagingTotalKg)}</strong>
                    </span>
                    <span>
                      Remaining
                      <strong>{formatTonnes(stagingFreeKg)}</strong>
                    </span>
                    <span>
                      Planning fuel
                      <strong>
                        {estimatedBlockFuelKg !== null
                          ? formatTonnes(estimatedBlockFuelKg)
                          : '—'}
                      </strong>
                      <em>
                        {routeFuelCapacityKg !== null
                          ? `tank max ${formatTonnes(routeFuelCapacityKg)}`
                          : airframeLabel ?? 'homologated class'}
                        {maxCargoSource ? ` · ${maxCargoSource}` : ''}
                        {mxFuelBurn
                          ? ` · MX burn +${mxFuelBurn.excessPct}% (cond ${Math.round(mxFuelBurn.conditionPct)}%)`
                          : ''}
                      </em>
                    </span>
                    <span>
                      Max range
                      <strong>
                        {aircraftMaxRangeNm(staging.aircraft).toLocaleString()} nm
                      </strong>
                      <em>
                        {isFiniteMoney(stagingDistanceNm)
                          ? `this route ${formatBoardDistanceNm(stagingDistanceNm)}`
                          : 'route distance pending'}
                      </em>
                    </span>
                    {estimatedFuelCostUsd !== null ? (
                      <span>
                        Net estimate
                        <strong>
                          {boardMoneyLabel(stagingEstNetUsd, formatMoney)}
                        </strong>
                        <em>
                          {`pay − Jet-A ${formatMoney(estimatedFuelCostUsd)}${
                            estimatedFuelUnitPriceUsd !== null
                              ? ` · $${(
                                  weightSystem === 'imperial'
                                    ? estimatedFuelUnitPriceUsd / KG_TO_LB
                                    : estimatedFuelUnitPriceUsd
                                ).toFixed(2)}/${weightSystem === 'imperial' ? 'lb' : 'kg'}`
                              : ''
                          }${
                            estimatedFuelScarcity &&
                            estimatedFuelScarcity !== 'ok'
                              ? ` · fuel ${estimatedFuelScarcity}`
                              : ''
                          }`}
                        </em>
                      </span>
                    ) : null}
                  </>
                }
              />

              {(!stagingInRange || !stagingFuelOk) ? (
                <ul className="staging-feasibility" role="status">
                  {!stagingInRange ? (
                    <li>
                      Out of range
                      {stagingDistanceNm !== undefined
                        ? ` · ${Math.round(stagingDistanceNm)} nm > ${aircraftMaxRangeNm(staging.aircraft)} nm (${aircraftClassLabel(staging.aircraft)})`
                        : ` · ${aircraftClassLabel(staging.aircraft)}`}
                    </li>
                  ) : null}
                  {!stagingFuelOk ? (
                    <li>
                      Tank short
                      {estimatedBlockFuelKg !== null &&
                      routeFuelCapacityKg !== null
                        ? ` · need ${formatMassExact(estimatedBlockFuelKg, weightSystem)} / ${formatMassExact(routeFuelCapacityKg, weightSystem)} max`
                        : ''}
                      {routeFuelDeficitKg !== null && routeFuelDeficitKg >= 1
                        ? ` (−${formatMassExact(routeFuelDeficitKg, weightSystem)})`
                        : ''}
                    </li>
                  ) : null}
                </ul>
              ) : null}

              {stagingMxFuelWarn ? (
                <p className="banner warn">
                  MX burn +{mxFuelBurn!.excessPct}% (condition{' '}
                  {Math.round(mxFuelBurn!.conditionPct)}%) — this airframe may
                  need more fuel than a healthy plan on this route
                  {typeof mxFuelBurn!.baseBlockFuelKg === 'number'
                    ? ` (healthy ~${formatMassExact(mxFuelBurn!.baseBlockFuelKg, weightSystem)}`
                    : ''}
                  {typeof mxFuelBurn!.blockFuelKg === 'number' &&
                  typeof mxFuelBurn!.baseBlockFuelKg === 'number'
                    ? ` → worn ~${formatMassExact(mxFuelBurn!.blockFuelKg, weightSystem)})`
                    : typeof mxFuelBurn!.baseBlockFuelKg === 'number'
                      ? ')'
                      : ''}
                  . Dispatch still uses SimBrief OFP for Due — repair before long
                  legs; excess wear burn is debited on settle.
                </p>
              ) : null}

              {stagingBlockingMission ? (
                <p className="banner warn">
                  Open flight <code>{stagingBlockingMission.id}</code> still holds
                  cargo on this route. Cancel it to free the lot or continue on that
                  flight from Dispatch.
                </p>
              ) : null}

              {staging.deskHold ? (
                <div className="staging-section">
                  <h3>Airline desk hold</h3>
                  <ul className="staging-lines">
                    <li className="staging-line staging-line-compact">
                      <div className="staging-line-head">
                        <div className="staging-line-title">
                          <strong>
                            {staging.deskHold.commodityId
                              ? staging.deskHold.commodityId.charAt(0).toUpperCase() +
                                staging.deskHold.commodityId.slice(1)
                              : 'Cargo'}
                          </strong>
                          <span className="tag">
                            {staging.deskHold.kind === 'bridge'
                              ? 'Bridge'
                              : staging.deskHold.kind === 'haul'
                                ? 'Wide haul'
                                : 'Demand'}
                          </span>
                        </div>
                      </div>
                      <p className="staging-line-meta">
                        {staging.originIcao}→{staging.destIcao} · hold{' '}
                        {formatTonnes(staging.deskHold.kg)} · load{' '}
                        {formatTonnes(stagingTotalKg)} · pay{' '}
                        {formatMoney(stagingContractPayUsd)}
                        {staging.deskHold.expiresAtTick != null ? (
                          <>
                            {' '}
                            ·{' '}
                            {formatExpiry({
                              expiresAtTick: staging.deskHold.expiresAtTick,
                              currentTick: tick,
                              continuousHours,
                            })}
                          </>
                        ) : null}
                        {stagingTotalKg < Math.floor(staging.deskHold.kg) ? (
                          <>
                            {' '}
                            · remainder{' '}
                            {formatTonnes(
                              Math.floor(staging.deskHold.kg) - stagingTotalKg,
                            )}{' '}
                            stays on Open desk
                          </>
                        ) : null}
                      </p>
                      {(() => {
                        const maxKg = stagingDeskHoldMaxKg;
                        const displayMax = Math.max(
                          0,
                          Math.floor(kgToDisplay(maxKg, weightSystem)),
                        );
                        const displayValue = Math.round(
                          kgToDisplay(stagingTotalKg, weightSystem),
                        );
                        const unit = massUnitLabel(weightSystem);
                        return (
                          <div className="staging-line-controls">
                            <label className="cargo-amount staging-cargo-amount">
                              Load
                              <div>
                                <input
                                  type="number"
                                  min={1}
                                  max={Math.max(1, displayMax)}
                                  step={weightSystem === 'imperial' ? 10 : 100}
                                  value={displayValue}
                                  onChange={(e) =>
                                    updateStagingDeskHoldKg(
                                      displayToKg(
                                        Number(e.target.value),
                                        weightSystem,
                                      ),
                                    )
                                  }
                                  disabled={busy || maxKg <= 0}
                                />
                                <span>{unit}</span>
                              </div>
                              <input
                                type="range"
                                min={1}
                                max={Math.max(1, displayMax)}
                                step={1}
                                value={Math.min(
                                  displayValue,
                                  Math.max(1, displayMax),
                                )}
                                onChange={(e) =>
                                  updateStagingDeskHoldKg(
                                    displayToKg(
                                      Number(e.target.value),
                                      weightSystem,
                                    ),
                                  )
                                }
                                disabled={busy || maxKg <= 0}
                              />
                            </label>
                            <div className="cargo-presets staging-cargo-presets">
                              {[0.25, 0.5, 0.75, 1].map((fraction) => (
                                <button
                                  key={fraction}
                                  type="button"
                                  className="staging-preset-chip"
                                  disabled={busy || maxKg <= 0}
                                  onClick={() =>
                                    setStagingDeskHoldFraction(fraction)
                                  }
                                >
                                  {fraction === 1
                                    ? 'Max'
                                    : `${fraction * 100}%`}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                      <p className="muted">
                        Reserved on Hauls. Cap is min(hold, aircraft ops). Ferry
                        the tail to {staging.originIcao} if needed, then Accept
                        &amp; Dispatch — leftover kg stays held. Discarding
                        Manifest keeps the full hold open.
                      </p>
                    </li>
                  </ul>
                </div>
              ) : (
                <>
              {stagingExisting && (stagingExisting.lots?.length ?? 0) > 0 ? (
                <div className="staging-section">
                  <h3>Already on this flight</h3>
                  <CargoLotCards
                    lots={stagingExisting.lots!}
                    formatTonnes={formatTonnes}
                    formatMoney={formatMoney}
                  />
                </div>
              ) : null}

              <div className="staging-section">
                <h3>
                  Staged lots ({staging.lines.length}
                  {stagingExistingLots
                    ? ` + ${stagingExistingLots} existing`
                    : ''}
                  /{MAX_STAGING_LOTS})
                </h3>
                <ul className="staging-lines">
                  {staging.lines.map((line) => {
                    const resolvedLot = stagingResolvedLot(
                      staging,
                      line.lot,
                      missions,
                      stagingRouteLots,
                      lots,
                    );
                    const maxKg = lineMaxKg(staging, line.lot);
                    const valid = line.cargoKg > 0 && line.cargoKg <= maxKg;
                    const displayMax = Math.max(
                      0,
                      Math.floor(kgToDisplay(maxKg, weightSystem)),
                    );
                    const displayValue = Math.round(
                      kgToDisplay(line.cargoKg, weightSystem),
                    );
                    const unit = massUnitLabel(weightSystem);
                    const payRate = formatLotPayRate(
                      resolvedLot.payUsd,
                      lotQuantityKg(resolvedLot),
                      weightSystem,
                    );
                    return (
                      <li key={line.lot.id} className="staging-line staging-line-compact">
                        <div className="staging-line-head">
                          <div className="staging-line-title">
                            <strong>{line.lot.commodityName}</strong>
                            {line.lot.urgency === 'urgent' ? (
                              <span className="tag">Urgent</span>
                            ) : null}
                            <StagingLotReason text={line.lot.reason} />
                          </div>
                          <button
                            type="button"
                            className="action ghost danger compact"
                            disabled={busy || staging.lines.length <= 1}
                            title={
                              staging.lines.length <= 1
                                ? 'Keep at least one lot — cancel the flight to drop the whole manifest'
                                : undefined
                            }
                            onClick={() => removeStagingLine(line.lot.id)}
                          >
                            Remove
                          </button>
                        </div>
                        <p className="staging-line-meta">
                          {formatTonnes(resolvedLot.availableKg)} avail · max{' '}
                          {formatTonnes(maxKg)} · pay{' '}
                          {formatMoney(proRataPayUsd(resolvedLot, line.cargoKg))}
                          {payRate ? (
                            <>
                              {' · '}
                              <span title="Contract pay per bulk unit (full lot)">
                                {payRate}
                              </span>
                            </>
                          ) : null}
                        </p>
                        <div className="staging-line-controls">
                          <label className="cargo-amount staging-cargo-amount">
                            Load
                            <div>
                              <input
                                type="number"
                                min={1}
                                max={Math.max(1, displayMax)}
                                step={weightSystem === 'imperial' ? 10 : 100}
                                value={displayValue}
                                onChange={(e) =>
                                  updateStagingLineKg(
                                    line.lot.id,
                                    displayToKg(Number(e.target.value), weightSystem),
                                  )
                                }
                                disabled={busy}
                              />
                              <span>{unit}</span>
                            </div>
                            <input
                              type="range"
                              min={1}
                              max={Math.max(1, displayMax)}
                              step={1}
                              value={Math.min(displayValue, Math.max(1, displayMax))}
                              onChange={(e) =>
                                updateStagingLineKg(
                                  line.lot.id,
                                  displayToKg(Number(e.target.value), weightSystem),
                                )
                              }
                              disabled={busy || displayMax <= 0}
                              aria-label={`${line.lot.commodityName} load in ${massUnitLong(weightSystem)}`}
                            />
                          </label>
                          <div className="cargo-presets staging-cargo-presets">
                            {[0.25, 0.5, 0.75, 1].map((fraction) => (
                              <button
                                key={fraction}
                                type="button"
                                className="staging-preset-chip"
                                onClick={() =>
                                  setStagingLineFraction(line.lot.id, fraction)
                                }
                                disabled={busy || maxKg <= 0}
                              >
                                {fraction === 1 ? 'Max' : `${fraction * 100}%`}
                              </button>
                            ))}
                          </div>
                        </div>
                        {!valid ? (
                          <p className="cargo-dialog-error">
                            Choose between 1 and{' '}
                            {formatMassExact(maxKg, weightSystem)}.
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="staging-section">
                <h3>Same-route lots to add</h3>
                {stagingExistingLots + staging.lines.length >= MAX_STAGING_LOTS ? (
                  <p className="empty">Manifest lot cap reached ({MAX_STAGING_LOTS}).</p>
                ) : stagingRouteLotsLoading ? (
                  <BusyBlock label="Loading route lots" />
                ) : stagingRouteLotsError ? (
                  <p className="empty">
                    Could not load route lots: {stagingRouteLotsError}
                  </p>
                ) : stagingCandidates.length === 0 ? (
                  <p className="empty">No other available lots on this route.</p>
                ) : (
                  <ul className="staging-candidates">
                    {stagingCandidates.map((lot) => {
                      const room = stagingRemainingKg(staging);
                      const maxKg = Math.min(lot.availableKg, room);
                      const cargoLocked = isCargoOpsCommodityLocked(
                        lot.commodityId,
                      );
                      const payRate = formatLotPayRate(
                        lot.payUsd,
                        lotQuantityKg(lot),
                        weightSystem,
                      );
                      return (
                        <li
                          key={lot.id}
                          className={cargoLocked ? 'lot-locked' : undefined}
                        >
                          <div className="staging-candidate-main">
                            <strong>{lot.commodityName}</strong>
                            {lot.urgency === 'urgent' ? (
                              <span className="tag">Urgent</span>
                            ) : null}
                            {cargoLocked ? (
                              <span
                                className="tag"
                                title="Unlock via Cargo Ops ladder"
                              >
                                locked
                              </span>
                            ) : null}
                            <small>
                              {formatTonnes(lot.availableKg)} ·{' '}
                              {formatMoney(lot.payUsd)}
                              {payRate ? ` · ${payRate}` : ''}
                            </small>
                          </div>
                          <div className="staging-candidate-action">
                            {cargoLocked ? (
                              <span className="staging-candidate-badge">Locked</span>
                            ) : maxKg <= 0 ? (
                              <span className="staging-candidate-badge muted">
                                No room
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="action ghost compact info"
                                disabled={busy}
                                onClick={() => addLotToStaging(lot)}
                              >
                                Add · {formatTonnes(maxKg)}
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
                </>
              )}

              <div className="staging-footer staging-footer-sticky">
                <div>
                  <p>
                    {staging.deskHold
                      ? `Desk hold · ${formatTonnes(stagingTotalKg)} · ${formatMoney(stagingContractPayUsd)}`
                      : `${staging.lines.length} staged · ${formatTonnes(stagingTotalKg)} · ${formatMoney(stagingContractPayUsd)} total`}
                  </p>
                  {!stagingValid ? (
                    <p className="cargo-dialog-error">
                      {!stagingAircraftAtOrigin
                        ? `Aircraft must be at ${staging.originIcao} — ferry first, then Accept & Dispatch.`
                        : !stagingInRange
                        ? 'Route exceeds aircraft range — pick another airframe or shorter hop.'
                        : !stagingFuelOk
                          ? 'Planning fuel exceeds tank capacity — reduce payload or pick another aircraft.'
                          : staging.deskHold
                            ? stagingTotalKg <= 0 ||
                              stagingTotalKg > stagingDeskHoldMaxKg
                              ? 'Lower the load to the aircraft ops cap (or pick a larger tail) before Accept & Dispatch.'
                              : 'Finish the desk hold before Accept & Dispatch.'
                          : staging.lines.some((line) => {
                                const maxKg = lineMaxKg(staging, line.lot);
                                return line.cargoKg <= 0 || line.cargoKg > maxKg;
                              })
                            ? 'Adjust each lot to a valid load before saving.'
                            : 'Finish the manifest before saving.'}
                    </p>
                  ) : null}
                  {clientUpdateBlock ? (
                    <p className="cargo-dialog-error">
                      {formatClientUpdateRequiredLabel(
                        clientUpdateBlock.minClientVersion,
                      )}{' '}
                      <button
                        type="button"
                        className="action ghost compact"
                        onClick={() => selectTab('settings')}
                      >
                        Settings → Updates
                      </button>
                    </p>
                  ) : null}
                </div>
                <div className="cargo-dialog-actions">
                  {staging.replaceManifest ? (
                    <button
                      type="button"
                      className="action ghost info"
                      disabled={busy}
                      onClick={() => void onBackFromManifestEdit()}
                    >
                      Back to Dispatch
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="accept"
                    disabled={busy || !stagingValid || Boolean(clientUpdateBlock)}
                    onClick={() => void onCommitStaging()}
                  >
                    {busy ? (
                      <>
                        <span
                          className="busy-spinner busy-spinner-sm"
                          aria-hidden="true"
                        />
                        {staging.replaceManifest ? 'Saving…' : 'Accepting…'}
                      </>
                    ) : clientUpdateBlock ? (
                      'Update required'
                    ) : staging.replaceManifest ? (
                      'Save & re-dispatch'
                    ) : (
                      'Accept & Dispatch'
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : activeMission ? (
            <>
              {activeTourOnDispatch ? (
                <div className="base-tour-flight-context" role="status">
                  <div className="base-tour-flight-context-body">
                    <span className="base-tour-flight-context-kicker">Tour</span>
                    <span
                      className="base-tour-flight-context-legs"
                      aria-label={`Leg ${activeTourOnDispatch.legIndex} of ${activeTourOnDispatch.legCount}`}
                    >
                      {Array.from(
                        { length: activeTourOnDispatch.legCount },
                        (_, i) => {
                          const n = i + 1;
                          const state =
                            n < activeTourOnDispatch.legIndex
                              ? 'done'
                              : n === activeTourOnDispatch.legIndex
                                ? 'current'
                                : 'todo';
                          return (
                            <span
                              key={n}
                              className={`base-tour-flight-context-leg is-${state}`}
                            >
                              L{n}
                            </span>
                          );
                        },
                      )}
                    </span>
                    <span className="base-tour-flight-context-detail">
                      {activeTourOnDispatch.nextOrigin &&
                      activeTourOnDispatch.nextDest
                        ? `Next ${activeTourOnDispatch.nextOrigin}→${activeTourOnDispatch.nextDest}`
                        : 'Last leg'}
                      {activeTourOnDispatch.nextFerryNm > 0.5
                        ? ` · ferry ${Math.round(activeTourOnDispatch.nextFerryNm)} nm`
                        : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="action ghost compact"
                    disabled={busy}
                    onClick={() => {
                      const hub =
                        activeTourOnDispatch.hubIcao.trim().toUpperCase() ||
                        homeHubIcao.trim().toUpperCase();
                      if (hub) void openAirport(hub, { section: 'fbo' });
                    }}
                  >
                    Base
                  </button>
                </div>
              ) : null}
            <DispatchActivePanel
              mission={activeMission}
              step={dispatchStep}
              loadPath={activeLoadPath}
              busy={busy || crewDispatchBusy}
              weightSystem={weightSystem}
              devMode={devMode}
              simbriefUser={simbriefUser}
              continuousHours={continuousHours}
              formatMoney={formatMoney}
              formatTonnes={formatTonnes}
              formatDeadline={formatDeadline}
              aircraftClassLabel={aircraftClassLabel}
              missionMaxCargoKg={(mission) =>
                resolveMissionStructuralMaxCargoKg(
                  mission,
                  opsFleet,
                  airframePerf,
                  structuralMaxCargoKg,
                  activeMission?.id,
                )
              }
              missionOpsCapacityHint={
                maxCargoKg !== null && Number.isFinite(maxCargoKg)
                  ? maxCargoKg
                  : null
              }
              ofpAutoStatus={ofpAutoStatus}
              missionFuelQuote={missionFuelQuote}
              missionFuelQuoteStatus={missionFuelQuoteStatus}
              missionFuelQuoteError={missionFuelQuoteError}
              loadOfpAutoStatus={loadOfpAutoStatus}
              loadOfpAutoError={loadOfpAutoError}
              loadOfpProgress={loadOfpProgress}
              skylineInjectEnabled={skylineInjectEnabled}
              simBridge={simBridge}
              watch={
                holdWatchOffForPreflight && watch
                  ? { ...watch, running: false }
                  : watch
              }
              preflightBootstrapError={preflightBootstrapError}
              mxFuelBurnAlert={activeMissionMxFuelBurn}
              onOpenAirport={openAirport}
              onSelectSettings={() => selectTab('settings')}
              onDispatch={(m) => void onDispatch(m)}
              onCancel={(m) => void onCancel(m)}
              onEditManifest={(m) => void enterEditManifest(m)}
              onAcceptOfpCargo={(m) => void onAcceptOfpCargo(m)}
              onBuyFuel={(m) => void onBuyMissionFuel(m)}
              onRetryFuelQuote={() =>
                setMissionFuelQuoteRetryToken((token) => token + 1)
              }
              onToggleSkylineInject={onToggleSkylineInject}
              onDepart={(m) => void onDepart(m)}
              onSettle={(m) => void onSettle(m)}
              onCrewDispatch={(m, crewMemberId) =>
                void onCrewDispatchMission(m, crewMemberId)
              }
              onCrewAssign={(m, crewMemberId) =>
                void onCrewAssignMission(m.id, crewMemberId)
              }
              idleCrew={idleCrewOptions}
              crewSlotsFree={
                (companyCrew?.members?.length ?? 0) > 0
                  ? companyCrew?.slotsFree ?? 0
                  : 0
              }
              onRefreshOfpBriefing={onRefreshOfpBriefing}
            />
            </>
          ) : (
            <div className="panel-head">
              <div>
                <h2>Dispatch</h2>
                {activeTour &&
                activeTour.status === 'active' &&
                activeTour.resumeState !== 'in_progress' ? (
                  <p
                    className={
                      activeTour.resumeState === 'stranded'
                        ? 'banner warn base-tour-dispatch-banner'
                        : 'banner ok base-tour-dispatch-banner'
                    }
                    role="status"
                  >
                    <span>
                      {activeTour.resumeHint ??
                        `Tour L${activeTour.nextLegIndex ?? '?'}/${activeTour.legs.length} still active`}
                    </span>
                    <span className="base-tour-resume-actions">
                      <button
                        type="button"
                        className="linkish"
                        disabled={busy}
                        onClick={() => openActiveTourResume()}
                      >
                        {staging || pendingActiveTour
                          ? 'Manifest'
                          : activeMission
                            ? 'Flight plan'
                            : 'Base'}
                      </button>
                      {activeTour.resumeState === 'stranded' ? (
                        <button
                          type="button"
                          className="linkish"
                          disabled={busy || dispatchTourBusy}
                          onClick={() => void onDropActiveTour()}
                        >
                          Drop
                        </button>
                      ) : null}
                    </span>
                  </p>
                ) : (
                  <p className="muted">
                    No personal flight in progress. Accept a freight and Dispatch
                    to start your OFP here.
                  </p>
                )}
              </div>
              <button
                type="button"
                className="action"
                disabled={busy}
                onClick={() => {
                  if (
                    activeTour &&
                    activeTour.status === 'active' &&
                    activeTour.resumeState !== 'in_progress'
                  ) {
                    openActiveTourResume();
                    return;
                  }
                  selectTab('market');
                }}
              >
                {activeTour &&
                activeTour.status === 'active' &&
                activeTour.resumeState !== 'in_progress'
                  ? staging || pendingActiveTour
                    ? 'Open Manifest'
                    : activeMission
                      ? 'Open Flight plan'
                      : 'Open Base'
                  : 'Open Freights'}
              </button>
            </div>
          )}
        </section>
      ) : hubSelected && tab === 'lab' && devMode ? (
        <PayloadLabPanel
          busy={busy}
          homeHubIcao={homeHubIcao}
          activeLabMission={
            missions.find(
              (m) =>
                m.payloadLab &&
                (m.status === 'accepted' ||
                  m.status === 'dispatched' ||
                  m.status === 'in_flight'),
            ) ?? null
          }
          onOpenDispatch={() => selectTab('staging')}
          onMissionsUpdated={(next) => setMissions(next)}
        />
      ) : hubSelected && tab === 'pulse' && devMode ? (
        <HubEconomyPulsePage
          weightSystem={weightSystem}
          refreshToken={tick}
        />
      ) : hubSelected && tab === 'settings' ? (
        <section className="panel settings-panel">
          <div className="settings-grid">
            <div className="settings-card">
              <h3>Career profile</h3>
              <p className="settings-help">
                {worldFixed ? (
                  <>
                    Attached to host world{' '}
                    <strong>{activeCareerProfile.name}</strong>. Saves are
                    managed on the host — this client only signs in to a company.
                  </>
                ) : (
                  <>
                    Playing as <strong>{activeCareerProfile.name}</strong>. Switch
                    profiles to load another wallet, fleet, and mission history.
                  </>
                )}
              </p>
              {worldFixed ? null : (
                <button
                  type="button"
                  className="action"
                  disabled={busy}
                  onClick={() => void onSwitchCareerProfile()}
                >
                  Switch profile
                </button>
              )}
              {authRequired || getAuthToken() ? (
                <button
                  type="button"
                  className="action ghost"
                  disabled={busy}
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => void onSignOutAndSwitchProfile()}
                >
                  Sign out / another account
                </button>
              ) : null}
            </div>
            {window.skylineDesktop?.setPlayMode && !playModeConfig?.envForced ? (
              <div className="settings-card">
                <h3>Play mode</h3>
                <p className="settings-help">
                  {playModeConfig?.mode === 'mp' ? (
                    <>
                      Multiplayer →{' '}
                      <strong>{playModeConfig.worldApiUrl}</strong>. Single Player
                      uses local profiles on this PC.
                    </>
                  ) : (
                    <>
                      Single Player (local saves). Join a world host for shared
                      economy and Auth.
                    </>
                  )}
                </p>
                <button
                  type="button"
                  className="action"
                  disabled={busy || playModeBusy}
                  onClick={() => {
                    setPlayModeError(null);
                    setForcePlayModeGate(true);
                  }}
                >
                  Change play mode
                </button>
              </div>
            ) : null}
            <div className="settings-card">
              <h3>SimBrief</h3>
              <p className="settings-help">
                Used for Dispatch redirect, automatic OFP confirmation, auto OFP load, and Preflight.
                Stored only in this browser.
              </p>
              <label className="simbrief-field">
                Username
                <input
                  type="text"
                  value={simbriefUser}
                  onChange={(e) => setSimbriefUser(e.target.value)}
                  placeholder="navigraph alias"
                  disabled={busy}
                  autoComplete="username"
                  spellCheck={false}
                />
              </label>
            </div>
            <div className="settings-card">
              <h3>Weight system</h3>
              <p className="settings-help">
                Changes cargo, fuel, and capacity labels across the board. Dispatch also
                sends this unit to SimBrief so the OFP matches your preference. Internal
                mission data stays in kilograms.
              </p>
              <div className="settings-choice" role="radiogroup" aria-label="Weight system">
                <button
                  type="button"
                  className={
                    weightSystem === 'metric'
                      ? 'settings-choice-btn active'
                      : 'settings-choice-btn'
                  }
                  onClick={() => setWeightSystem('metric')}
                  disabled={busy}
                >
                  Metric
                  <small>tonnes / kg · SimBrief KGS</small>
                </button>
                <button
                  type="button"
                  className={
                    weightSystem === 'imperial'
                      ? 'settings-choice-btn active'
                      : 'settings-choice-btn'
                  }
                  onClick={() => setWeightSystem('imperial')}
                  disabled={busy}
                >
                  Imperial
                  <small>klb / lb · SimBrief LBS</small>
                </button>
              </div>
              <p className="settings-sample">
                Example · Caravan structural max:{' '}
                <strong>{formatTonnes(1_704, weightSystem)}</strong>
                {' · '}
                <strong>{formatMassExact(1_704, weightSystem)}</strong>
              </p>
            </div>
            <div className="settings-card">
              <h3>Sound</h3>
              <p className="settings-help">
                Cues when Preflight is ready and when a flight settles. Voice
                uses short English cockpit-style callouts (not a live GPWS
                rip). No looping alerts.
              </p>
              <div className="settings-choice" role="radiogroup" aria-label="UI sounds">
                {(
                  [
                    ['voice', 'Voice', 'Spoken cue'],
                    ['both', 'Both', 'Voice + chime'],
                    ['chime', 'Chime', 'Tone only'],
                    ['off', 'Off', 'Mute'],
                  ] as const
                ).map(([mode, label, hint]) => (
                  <button
                    key={mode}
                    type="button"
                    className={
                      uiSoundMode === mode
                        ? 'settings-choice-btn active'
                        : 'settings-choice-btn'
                    }
                    onClick={() => {
                      saveUiSoundMode(mode);
                      setUiSoundMode(mode);
                    }}
                    disabled={busy}
                  >
                    {label}
                    <small>{hint}</small>
                  </button>
                ))}
              </div>
              {uiSoundMode !== 'off' ? (
                <p className="settings-sample">
                  <button
                    type="button"
                    className="action ghost"
                    disabled={busy}
                    onClick={() =>
                      playUiSound('preflight_ready', {
                        force: true,
                        mode: uiSoundMode,
                      })
                    }
                  >
                    Test preflight
                  </button>{' '}
                  <button
                    type="button"
                    className="action ghost"
                    disabled={busy}
                    onClick={() =>
                      playUiSound('flight_settled', {
                        force: true,
                        mode: uiSoundMode,
                      })
                    }
                  >
                    Test settle
                  </button>
                </p>
              ) : null}
            </div>
            <DesktopUpdatesCard />
            <div className="settings-card">
              <h3>Developer</h3>
              <p className="settings-help">
                Shows Rivals, Lab, Pulse, time-skip, wallet credit, reset world, and
                Dispatch Advanced cheats (depart / settle without MSFS). Unlocks
                Cargo Ops, Class Ops, and aircraft lease while on. Leave off for
                normal play.
              </p>
              <div className="settings-choice" role="radiogroup" aria-label="Dev mode">
                <button
                  type="button"
                  className={
                    !devMode ? 'settings-choice-btn active' : 'settings-choice-btn'
                  }
                  onClick={() => {
                    saveDevMode(false);
                    setDevMode(false);
                    void run(() => refresh());
                  }}
                  disabled={busy}
                >
                  Off
                  <small>Player layout</small>
                </button>
                <button
                  type="button"
                  className={
                    devMode ? 'settings-choice-btn active' : 'settings-choice-btn'
                  }
                  onClick={() => {
                    saveDevMode(true);
                    setDevMode(true);
                    void run(() => refresh());
                  }}
                  disabled={busy}
                >
                  Dev mode
                  <small>Cheats &amp; debug</small>
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : hubSelected && tab === 'map' ? (
        <section className="panel network-map-panel">
          <div className="panel-head">
            <div>
              <h2>Network</h2>
              <p>
                {networkHubsLoading && networkHubs.length === 0 ? (
                  <span className="skel skel-line" style={{ width: '16rem' }} />
                ) : (
                  `${networkHubs.length} cargo network hubs · trip-only bush strips are hidden · click a marker to open the terminal`
                )}
              </p>
            </div>
            <div className="network-map-panel-actions">
              <label className="network-hub-filter">
                Find hub
                <FerryHubCombobox
                  id="network-find-hub"
                  hubs={networkHubs.map((hub) => ({
                    icao: hub.icao,
                    name: hub.name,
                    region: hub.region,
                    detail: hub.hubTier,
                  }))}
                  value={networkMapFocusIcao}
                  onChange={(icao) => {
                    setNetworkMapFocusIcao(icao);
                    setNetworkMapFocusToken((token) => token + 1);
                  }}
                  disabled={busy || networkHubsLoading || networkHubs.length === 0}
                  plainText
                  maxResults={16}
                  placeholder="ICAO, city, or region…"
                />
              </label>
              <button
                type="button"
                className="action ghost"
                disabled={busy || networkHubsLoading}
                onClick={() => {
                  void refreshNetworkHubs().catch((err) => {
                    setToastKind('fail');
                    setToast(err instanceof Error ? err.message : String(err));
                  });
                }}
              >
                Refresh
              </button>
            </div>
          </div>
          {networkHubsLoading && networkHubs.length === 0 ? (
            <div className="hub-network-map" aria-busy="true">
              <BusyBlock label="Loading network" />
            </div>
          ) : networkHubs.length === 0 ? (
            <p className="empty">No hubs in the economy world yet.</p>
          ) : (
            <HubNetworkMap
              hubs={networkHubs}
              highlightIcao={homeHubIcao}
              focusIcao={networkMapFocusIcao || null}
              focusToken={networkMapFocusToken}
              onSelectHub={(icao) => {
                void openAirport(icao);
              }}
            />
          )}
        </section>
      ) : hubSelected && tab === 'ports' ? (
        <PortsPanel
          busy={busy}
          weightSystem={weightSystem}
          formatMoney={formatMoney}
          formatTonnes={formatTonnes}
          fleet={prepareOpsFleet}
          vaAircraftIds={vaAircraftIdSet}
          logisticsCompanyId={homeCompanyId ?? activeCompanyId}
          ownedShelfLabel="Yours"
          resolveOpsCompanyId={(aircraftId) =>
            resolveOpsCompanyId(aircraftId)
          }
          ensureOpsCompany={async (aircraftId) => {
            const companyId = resolveOpsCompanyId(aircraftId);
            if (
              memberVaCompanyIdRef.current &&
              companyId === memberVaCompanyIdRef.current
            ) {
              await switchCompanyForVa(companyId);
            }
          }}
          resolveMaxCargoKg={(acf) =>
            hangarCatalogEntry(acf)?.maxCargoKg ?? 0
          }
          economyTick={tick}
          economyLastBatchAtMs={lastBatchAtMs}
          cargoOps={cargoOps}
          onOpenCargoOps={() => {
            setHangarPane('cargo');
            goToTab('hangar');
          }}
          onWallet={commitWallet}
          onFleet={setFleet}
          onVaFleet={setVaSessionFleet}
          onVaWallet={setVaSessionWallet}
          onMissions={setMissions}
          onOpenAirport={(icao) => {
            void openAirport(icao);
          }}
          onStaged={() => {
            goToTab('staging');
          }}
          onToast={(kind, message) => {
            setToastKind(kind);
            setToast(message);
          }}
          clientUpdateRequiredMin={
            clientUpdateBlock?.minClientVersion ?? null
          }
          onOpenUpdates={() => selectTab('settings')}
        />
      ) : hubSelected && tab === 'vaDirectory' ? (
        <VaDirectoryPage
          authRequired={authRequired}
          activeCompanyId={activeCompanyId}
          onCompaniesChanged={(next) => {
            setCompanies((prev) =>
              next.map((c) => {
                const existing = prev.find((p) => p.id === c.id);
                return existing
                  ? { ...existing, displayName: c.displayName }
                  : {
                      id: c.id,
                      displayName: c.displayName,
                      homeHubIcao: '',
                      homeCountryId: '',
                      worldId: '',
                      createdAtMs: Date.now(),
                    };
              }),
            );
            // Join must NOT pin the VA session — chrome stays on home.
            // My VA opens the VA tenant when the pilot navigates there.
          }}
        />
      ) : hubSelected && tab === 'va' ? (
        <VaPage
          authRequired={authRequired}
          activeCompanyId={activeCompanyId}
          fleet={
            viewingVaTenant || vaSessionFleet.length > 0
              ? vaSessionFleet
              : fleet
          }
          walletUsd={
            // Members: never flash home Wallet into VA Ledger — wait for
            // vaSessionWallet / cashflow. Owners (home === VA) may use chrome.
            memberVaCompanyId &&
            homeCompanyId &&
            memberVaCompanyId !== homeCompanyId
              ? vaSessionWallet
              : vaSessionWallet != null
                ? vaSessionWallet
                : wallet
          }
          busy={busy}
          onWallet={(usd) => {
            // Always cache VA wallet for My VA panes.
            setVaSessionWallet(usd);
            const home = homeCompanyIdRef.current?.trim();
            const va = memberVaCompanyIdRef.current?.trim();
            // Dual-tenant: never paint VA cash onto chrome — even after
            // selectTab restored home (late cashflow / members responses).
            // Checking active≠home races; home≠va is stable for members.
            if (home && va && home !== va) return;
            commitWallet(usd, { sourceCompanyId: va || home });
          }}
          onFleet={(nextFleet) => {
            setVaSessionFleet(nextFleet);
            // Owner hangar may still be bound to chrome fleet — keep both in sync.
            const home = homeCompanyIdRef.current?.trim();
            const active =
              getStoredCompanyId()?.trim() ||
              activeCompanyIdRef.current?.trim();
            if (home && active && home !== active) return;
            setFleet(nextFleet);
          }}
          onAirframePerf={(perf) => {
            setAirframePerf((prev) => ({ ...prev, ...perf }));
          }}
          onGoCompany={() => selectTab('pilot')}
          onGoDirectory={() => selectTab('vaDirectory')}
          weightSystem={weightSystem}
          formatMoney={formatMoney}
          formatTonnes={formatTonnes}
          vaAircraftIds={vaAircraftIdSet}
          resolveOpsCompanyId={(aircraftId) =>
            resolveOpsCompanyId(aircraftId)
          }
          ensureOpsCompany={async (aircraftId) => {
            const companyId = resolveOpsCompanyId(aircraftId);
            if (
              memberVaCompanyIdRef.current &&
              companyId === memberVaCompanyIdRef.current
            ) {
              await switchCompanyForVa(companyId);
            }
          }}
          resolveMaxCargoKg={(acf) =>
            hangarCatalogEntry(acf)?.maxCargoKg ?? 0
          }
          economyTick={tick}
          economyClock={continuousHours}
          economyLastBatchAtMs={lastBatchAtMs}
          cargoOps={cargoOps}
          onOpenCargoOps={() => {
            setHangarPane('cargo');
            goToTab('hangar');
          }}
          onOpenAirport={(icao) => {
            void openAirport(icao);
          }}
          clientUpdateRequiredMin={
            clientUpdateBlock?.minClientVersion ?? null
          }
          onOpenUpdates={() => selectTab('settings')}
          onHaulStaged={() => {
            goToTab('staging');
          }}
          onPrepareHaulHold={(hold, aircraftId) => {
            enterStagingForVaHaulHold(hold, aircraftId);
          }}
          onMissions={setMissions}
          onToast={(kind, message) => {
            setToastKind(kind);
            setToast(message);
          }}
          onSwitchCompany={async (companyId) => {
            await switchCompanyForVa(companyId);
          }}
          onLeftVa={async ({ homeCompanyId, companies }) => {
            setCompanies((prev) =>
              companies.map((c) => {
                const existing = prev.find((p) => p.id === c.id);
                return existing
                  ? { ...existing, displayName: c.displayName }
                  : {
                      id: c.id,
                      displayName: c.displayName,
                      homeHubIcao: '',
                      homeCountryId: '',
                      worldId: '',
                      createdAtMs: Date.now(),
                    };
              }),
            );
            const next =
              homeCompanyId?.trim() ||
              companies.find((c) => c.id !== activeCompanyId)?.id ||
              null;
            if (next) {
              await switchCompany(next);
            }
            setVaSessionWallet(null);
            setVaSessionFleet([]);
            setVaChromeTitle(null);
            selectTab('vaDirectory');
          }}
          onUnpublished={() => {
            setVaSessionWallet(null);
            setVaSessionFleet([]);
            setVaChromeTitle(null);
            selectTab('pilot');
          }}
          ledgerRefreshEpoch={vaLedgerRefreshEpoch}
          onMemberRouteCutPct={setVaMemberRouteCutPct}
          onVaIdentity={({ displayName }) => {
            // Keep last known name while VaPage loads — avoid My VA → name flicker.
            const next = displayName?.trim() || null;
            if (next) setVaChromeTitle(next);
            else if (displayName === null) setVaChromeTitle(null);
          }}
          renderHangarCard={(acf, hangarOpts) => (
            <HangarAircraftCard
              key={acf.id}
              aircraft={acf}
              catalog={hangarCatalogEntry(acf)}
              cabinStatus={hangarCabinStatus(acf)}
              busy={busy || Boolean(hangarOpts.busy)}
              mutationsLocked={hangarOpts.mutationsLocked}
              vaReserve={hangarOpts.vaReserve}
              opsCompanyId={resolveOpsCompanyId(acf.id)}
              hubOptions={ferryDestinationHubs(hubOptions).map((hub) => ({
                icao: hub.icao,
                name: hub.name,
              }))}
              preferredFerryDest={ferrySeed?.dest}
              ferrySeedToken={ferrySeed?.token}
              pilotIcao={pilotIcao}
              ownedCount={ownedFleetCount}
              hasListed={hasListedAircraft}
              formatMoney={formatMoney}
              formatMass={formatTonnes}
              economyTick={tick}
              economyClock={continuousHours}
              formatClock={formatClock}
              weightSystem={weightSystem}
              onOpenAirport={openAirport}
              onClearMaintenance={(id) => void onClearMaintenance(id)}
              onRepair={(id) => void onRepairAircraft(id)}
              onOverhaul={(id, which) => void onOverhaulAircraft(id, which)}
              onUnlist={(id) => void onUnlistAircraft(id)}
              onBuyout={(id) => void onBuyoutLease(id)}
              onPayLeaseOverdue={(id) => void onPayLeaseOverdue(id)}
              onReturnLease={(id) => void onReturnLease(id)}
              onListForLease={(id) => void onListForLease(id)}
              onListForSale={(id) => void onListForSale(id)}
              onSell={(id) => void onSellAircraft(id)}
              onFerry={(id, dest, opts) => onFerry(id, dest, opts)}
              onEmptyFlight={(id, dest) => onEmptyFlight(id, dest)}
              onTravel={(dest) => openPilotTravel(dest)}
              missionRoute={(() => {
                if (acf.status !== 'assigned') return null;
                const m = missions.find(
                  (row) =>
                    (acf.assignedMissionId &&
                      row.id === acf.assignedMissionId) ||
                    row.aircraftId === acf.id,
                );
                if (!m || !isActiveMissionStatus(m.status)) return null;
                return {
                  originIcao: m.originIcao,
                  destIcao: m.destIcao,
                };
              })()}
            />
          )}
        />
      ) : hubSelected && tab === 'vaRanking' ? (
        <VaRankingPage authRequired={authRequired} />
      ) : hubSelected && tab === 'pilot' ? (
        <section className="panel pilot-panel">
          <div className="pilot-profile-grid">
            <div className="pilot-card">
              <h3>Identity</h3>
              <dl className="pilot-dl">
                <div>
                  <dt>Name</dt>
                  <dd>
                    {(authRequired && authAccountLabel) || pilotName || 'Pilot'}
                  </dd>
                </div>
                {authRequired ? (
                  <div>
                    <dt>Active company</dt>
                    <dd>
                      {companies.find((c) => c.id === activeCompanyId)
                        ?.displayName ||
                        activeCompanyId ||
                        '—'}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt>Home hub</dt>
                  <dd>
                    {homeHubIcao ? (
                      <IcaoLink icao={homeHubIcao} onOpen={openAirport} disabled={busy} />
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Current position</dt>
                  <dd>
                    {pilotIcao ? (
                      <IcaoLink icao={pilotIcao} onOpen={openAirport} disabled={busy} />
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                {companyDirectoryListed ? (
                  <div>
                    <dt>Directory</dt>
                    <dd>Published</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Status</dt>
                  <dd>Registered</dd>
                </div>
              </dl>
            </div>
            <div className="pilot-card">
              <h3>Company</h3>
              <dl className="pilot-dl">
                <div>
                  <dt>Wallet</dt>
                  <dd>{formatMoney(wallet)}</dd>
                </div>
                <div>
                  <dt>Active flights</dt>
                  <dd>{activeCount}</dd>
                </div>
                <div>
                  <dt>Aircraft</dt>
                  <dd>{fleet.length}</dd>
                </div>
              </dl>
              {worldFixed ? null : (
                <div className="profile-manage-block">
                  <p className="aircraft-card-section-label">Save</p>
                  <CareerProfileManage
                    name={activeCareerProfile.name}
                    canDelete
                    busy={busy}
                    onRename={(name) =>
                      void onRenameCareerProfile(activeCareerProfile.id, name)
                    }
                    onDelete={() =>
                      void onDeleteCareerProfile(activeCareerProfile.id)
                    }
                  />
                </div>
              )}
            </div>
            <CompanyVaPublishCard
              authRequired={authRequired}
              activeCompanyId={activeCompanyId}
              defaultHomeHubIcao={homeHubIcao}
              defaultDisplayName={
                companies.find((c) => c.id === activeCompanyId)?.displayName ||
                ''
              }
              onGoVa={() => selectTab('va')}
              onListingState={({ listed }) => setCompanyDirectoryListed(listed)}
              onPublished={({ companyId, displayName }) => {
                setCompanies((prev) =>
                  prev.map((c) =>
                    c.id === companyId ? { ...c, displayName } : c,
                  ),
                );
                setCompanyDirectoryListed(true);
              }}
            />
            <div className="pilot-card pilot-card-wide">
              <h3>Progression</h3>
              <dl className="pilot-dl muted">
                <div>
                  <dt>Experience</dt>
                  <dd>Coming soon</dd>
                </div>
                <div>
                  <dt>Rank (Patente)</dt>
                  <dd>Coming soon</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>
      ) : hubSelected && tab === 'aircraft' ? (
        <section className="panel">
          <div className="panel-head panel-head-end">
            <button
              type="button"
              className="action ghost"
              onClick={() => {
                void refreshAircraftMarket().catch(() => undefined);
              }}
              disabled={busy || aircraftMarketLoading}
            >
              Refresh board
            </button>
          </div>
          <div className="aircraft-market-toolbar">
            <input
              type="search"
              className="aircraft-market-search"
              placeholder="Search name, type, tail or ICAO…"
              aria-label="Search aircraft listings"
              value={aircraftMarketQuery}
              onChange={(e) => setAircraftMarketQuery(e.target.value)}
            />
            <AircraftMarketCountryCombobox
              options={aircraftCountryOptions}
              homeCountryId={aircraftHomeCountryId || 'BR'}
              value={
                aircraftBrowseCountry ||
                aircraftHomeCountryId ||
                'BR'
              }
              disabled={busy || aircraftMarketLoading}
              onChange={(countryId) => {
                const home = (aircraftHomeCountryId || 'BR').trim().toUpperCase();
                const next = countryId.trim().toUpperCase();
                if (next === 'WORLD') {
                  aircraftBrowseCountryRef.current = 'WORLD';
                  setAircraftBrowseCountry('WORLD');
                } else if (next === home) {
                  aircraftBrowseCountryRef.current = '';
                  setAircraftBrowseCountry('');
                } else {
                  aircraftBrowseCountryRef.current = next;
                  setAircraftBrowseCountry(next);
                }
                setAircraftMarketGeo('country');
                void refreshAircraftMarket().catch(() => undefined);
              }}
            />
            <div
              className="aircraft-market-toolbar-divider"
              aria-hidden="true"
            />
            <div className="aircraft-class-chips" role="group" aria-label="Scope filter">
              {(
                [
                  ['country', 'All'],
                  ['region', 'This region'],
                  ['near', 'Near me'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={aircraftMarketGeo === id ? 'active' : undefined}
                  disabled={Boolean(aircraftBrowseCountry) && id === 'region'}
                  onClick={() => setAircraftMarketGeo(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              className="aircraft-market-toolbar-divider"
              aria-hidden="true"
            />
            <div className="aircraft-class-chips" role="group" aria-label="Aircraft class filter">
              {AIRCRAFT_CLASS_FILTERS.map((chip) => (
                <button
                  key={chip.id || 'all'}
                  type="button"
                  className={aircraftMarketClass === chip.id ? 'active' : undefined}
                  onClick={() => setAircraftMarketClass(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
          <div
            className={`aircraft-market-board${
              aircraftMarketLoading || busy ? ' is-loading' : ''
            }`}
            aria-busy={aircraftMarketLoading || busy}
          >
            {aircraftMarketLoading || busy ? (
              <BusyChip
                className="aircraft-market-loading"
                label={
                  busy ? 'Confirming buy / lease…' : 'Updating airframes'
                }
              />
            ) : null}
          {aircraftListings.length === 0 && !aircraftMarketLoading ? (
            <p className="empty">No airframes listed today — advance a day or refresh.</p>
          ) : filteredAircraftListings.length === 0 && !aircraftMarketLoading ? (
            <p className="empty">No listings match this filter.</p>
          ) : (
            <>
              <p className="aircraft-card-count">
                Showing {filteredAircraftListings.length}
                {filteredAircraftListings.length !== aircraftListings.length
                  ? ` of ${aircraftListings.length}`
                  : ''}{' '}
                aircraft
              </p>
              <div className="aircraft-card-grid">
                {filteredAircraftListings.map((listing) => (
                  <MarketListingCard
                    key={listing.id}
                    listing={listing}
                    catalog={listingCatalogEntry(listing)}
                    wallet={wallet}
                    busy={busy || aircraftMarketLoading}
                    formatMoney={formatMoney}
                    formatMass={formatTonnes}
                    weightSystem={weightSystem}
                    onOpenAirport={openAirport}
                    delivery={aircraftDeliveryQuotes[listing.id] ?? null}
                    leaseUnlocked={
                      devMode || (leaseUnlock?.unlocked ?? true)
                    }
                    leaseLockReason={
                      !devMode && leaseUnlock && !leaseUnlock.unlocked
                        ? `Lease locked — ${leaseUnlock.current}/${leaseUnlock.required} clean Dry freights`
                        : undefined
                    }
                    classUnlocked={
                      devMode ||
                      classOpsUnlockProgress(
                        classOps,
                        listing.aircraftClassId,
                      ).unlocked
                    }
                    classLockReason={(() => {
                      if (devMode) return undefined;
                      const p = classOpsUnlockProgress(
                        classOps,
                        listing.aircraftClassId,
                      );
                      return p.unlocked
                        ? undefined
                        : `Class locked — ${p.summary}`;
                    })()}
                    onBuy={(id, opts) => void onBuyAircraft(id, opts)}
                    onLease={(id, opts) => void onLeaseAircraft(id, opts)}
                  />
                ))}
              </div>
            </>
          )}
          </div>
        </section>
      ) : hubSelected && tab === 'hangar' ? (
        <section className="panel hangar-panel">
          <div className="panel-head">
            <p className="panel-stats">
              {hangarPane === 'aircraft'
                ? 'Aircraft must be at the mission origin and you must be with it. Travel repositions the pilot; ferry moves the airframe.'
                : hangarPane === 'cargo'
                  ? 'Unlock freights by commodity and freighter class. Dry and Light starters are open; Medium is optional beside Jet.'
                  : hangarPane === 'crew' && COMPANY_CREW_ENABLED
                    ? 'Company crew is based at your Base. Send them on holds or accepted missions — they settle on wall-clock ETA.'
                    : 'Income, expenses, and credit for this company.'}
            </p>
            <div className="hangar-head-actions">
              <div className="hangar-pane-toggle" role="tablist" aria-label="Hangar views">
                <button
                  type="button"
                  role="tab"
                  aria-selected={hangarPane === 'aircraft'}
                  className={hangarPane === 'aircraft' ? 'tab active' : 'tab'}
                  onClick={() => setHangarPane('aircraft')}
                >
                  Aircraft
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={hangarPane === 'cashflow'}
                  className={hangarPane === 'cashflow' ? 'tab active' : 'tab'}
                  onClick={() => {
                    setHangarPane('cashflow');
                    void fetchCashflow()
                      .then((snap) => {
                        setCashflow(snap);
                        // commitWallet is chrome-sticky when active ≠ home.
                        commitWallet(snap.walletUsd);
                        if (snap.companyCredit) {
                          setCompanyCredit(snap.companyCredit);
                        }
                      })
                      .catch(() => undefined);
                  }}
                >
                  Cashflow
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={hangarPane === 'cargo'}
                  className={hangarPane === 'cargo' ? 'tab active' : 'tab'}
                  onClick={() => setHangarPane('cargo')}
                >
                  Cargo Ops
                </button>
                {COMPANY_CREW_ENABLED ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={hangarPane === 'crew'}
                  className={hangarPane === 'crew' ? 'tab active' : 'tab'}
                  onClick={() => setHangarPane('crew')}
                >
                  Crew
                  {companyCrew && companyCrew.slotsUnlocked > 0
                    ? ` (${companyCrew.slotsInUse}/${companyCrew.slotsUnlocked})`
                    : ''}
                </button>
                ) : null}
              </div>
            </div>
          </div>
          {hangarPane === 'cashflow' ? (
            <HangarCashflowPanel
              cashflow={cashflow}
              companyCredit={companyCredit}
              walletUsd={wallet}
              busy={busy}
              formatMoney={formatMoney}
              onCreditUpdated={({ walletUsd, companyCredit: next }) => {
                commitWallet(walletUsd);
                setCompanyCredit(next);
                void fetchCashflow()
                  .then((snap) => {
                    setCashflow(snap);
                    if (snap.companyCredit) setCompanyCredit(snap.companyCredit);
                  })
                  .catch(() => undefined);
                setToastKind('ok');
                setToast(
                  next.principalUsd > 0
                    ? `Credit line · drawn ${formatMoney(next.principalUsd)} / ${formatMoney(next.limitUsd)}`
                    : `Credit cleared · available ${formatMoney(next.availableUsd)}`,
                );
              }}
              onCreditError={(message) => {
                setToastKind('fail');
                setToast(message);
              }}
            />
          ) : hangarPane === 'cargo' ? (
            <>
              <CargoOpsPanel
                cargoOps={cargoOps}
                leaseUnlockHint={
                  !devMode && leaseUnlock && !leaseUnlock.unlocked
                    ? `Lease unlock: ${leaseUnlock.current}/${leaseUnlock.required} clean Dry freights (on-time).`
                    : null
                }
              />
              <ClassOpsPanel classOps={classOps} />
            </>
          ) : hangarPane === 'crew' && COMPANY_CREW_ENABLED ? (
            <CrewPanel
              companyCrew={companyCrew}
              formatMoney={formatMoney}
              formatTonnes={formatTonnes}
              busy={busy || crewDispatchBusy}
              readyMissions={missions
                .filter((m) => {
                  if (
                    ['accepted', 'dispatched'].includes(m.status) &&
                    !m.crewOperated
                  ) {
                    return true;
                  }
                  return m.status === 'in_flight' && m.crewOperated === true;
                })
                .map((mission) => ({
                  mission,
                  aircraftLabel:
                    (mission.aircraftId
                      ? fleet.find((a) => a.id === mission.aircraftId)?.label
                      : undefined) ??
                    mission.aircraftClassId ??
                    '—',
                }))}
              nowMs={displayNowMs}
              formatDuration={formatDuration}
              onOpenAirport={openAirport}
              onHire={(id) => void onCrewHire(id)}
              onFire={(id) => void onCrewFire(id)}
              onCrewDispatch={(m, crewMemberId) =>
                void onCrewDispatchMission(m, crewMemberId)
              }
              onCrewAssign={(m, crewMemberId) =>
                void onCrewAssignMission(m.id, crewMemberId)
              }
              onReturnToFbo={(m) => void onReturnMissionToFbo(m)}
            />
          ) : (
            <>
              {fleet.length > 0 ? (
                <div className="hangar-toolbar">
                  <input
                    type="search"
                    className="hangar-search"
                    placeholder="Search name, type, tail or ICAO…"
                    aria-label="Search hangar aircraft"
                    value={hangarQuery}
                    onChange={(e) => setHangarQuery(e.target.value)}
                  />
                  {hangarQuery.trim() ? (
                    <p className="hangar-search-meta" role="status">
                      {filteredHangarFleet.length} of {fleet.length}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {fleet.length === 0 ? (
                <p className="empty">
                  {!devMode && leaseUnlock && !leaseUnlock.unlocked
                    ? `No aircraft yet — lease unlocks at ${leaseUnlock.current}/${leaseUnlock.required} clean Dry freights. Finish Operator aircraft on time (score ≥70), or buy a starter class if you can afford it.`
                    : 'No aircraft yet — accept Operator aircraft offers on Freights, or buy your first airframe on the Aircraft Market.'}
                </p>
              ) : filteredHangarFleet.length === 0 ? (
                <p className="empty">
                  No aircraft match “{hangarQuery.trim()}”.
                </p>
              ) : (
                <ul className="hangar-list">
                  {filteredHangarFleet.map((acf) => (
                    <HangarAircraftCard
                      key={acf.id}
                      aircraft={acf}
                      catalog={hangarCatalogEntry(acf)}
                      cabinStatus={hangarCabinStatus(acf)}
                      busy={busy}
                      mutationsLocked={vaHangarMutationsLocked}
                      opsCompanyId={resolveOpsCompanyId(acf.id)}
                      hubOptions={ferryDestinationHubs(hubOptions).map(
                        (hub) => ({
                          icao: hub.icao,
                          name: hub.name,
                        }),
                      )}
                      preferredFerryDest={ferrySeed?.dest}
                      ferrySeedToken={ferrySeed?.token}
                      pilotIcao={pilotIcao}
                      ownedCount={ownedFleetCount}
                      hasListed={hasListedAircraft}
                      formatMoney={formatMoney}
                      formatMass={formatTonnes}
                      economyTick={tick}
                      economyClock={continuousHours}
                      formatClock={formatClock}
                      weightSystem={weightSystem}
                      onOpenAirport={openAirport}
                      onClearMaintenance={(id) => void onClearMaintenance(id)}
                      onRepair={(id) => void onRepairAircraft(id)}
                      onOverhaul={(id, which) => void onOverhaulAircraft(id, which)}
                      onUnlist={(id) => void onUnlistAircraft(id)}
                      onBuyout={(id) => void onBuyoutLease(id)}
                      onPayLeaseOverdue={(id) => void onPayLeaseOverdue(id)}
                      onReturnLease={(id) => void onReturnLease(id)}
                      onListForLease={(id) => void onListForLease(id)}
                      onListForSale={(id) => void onListForSale(id)}
                      onSell={(id) => void onSellAircraft(id)}
                      onFerry={(id, dest, opts) => onFerry(id, dest, opts)}
                      onEmptyFlight={(id, dest) => onEmptyFlight(id, dest)}
                      onTravel={(dest) => openPilotTravel(dest)}
                      missionRoute={(() => {
                        if (acf.status !== 'assigned') return null;
                        const m = missions.find(
                          (row) =>
                            (acf.assignedMissionId &&
                              row.id === acf.assignedMissionId) ||
                            row.aircraftId === acf.id,
                        );
                        if (!m || !isActiveMissionStatus(m.status)) return null;
                        return {
                          originIcao: m.originIcao,
                          destIcao: m.destIcao,
                        };
                      })()}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      ) : hubSelected && tab === 'fleet' && devMode ? (
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="panel-stats">
                Competing freighters
                <span
                  className="live-dot"
                  title="Auto-refreshes every 15s; clock ticks every second"
                >
                  {' '}
                  · live
                </span>
              </p>
              <MarketSignalsLine
                regions={regionPressure}
                focusIcao={signalFocusIcao || undefined}
                focusRegion={resolveHubRegion(
                  signalFocusIcao || undefined,
                  networkHubs,
                )}
              />
              <MarketEventsSummary
                events={marketEvents}
                expanded={marketEventsExpanded}
                onToggle={() => setMarketEventsExpanded((v) => !v)}
              />
            </div>
          </div>
          <FleetRoster
            fleet={npcFleet}
            onOpen={openAirport}
            busy={busy}
            nowMs={displayNowMs}
            weightSystem={weightSystem}
            homeCountryId={countryIdFromRegion(
              resolveHubRegion(homeHubIcao || signalFocusIcao, networkHubs) ??
                '',
            )}
          />
        </section>
      ) : !hubSelected ? null : (
        <section className="panel logbook-panel">
          <div className="panel-head">
            <p className="panel-stats">
              {missions.length} flights recorded · read-only history.
            </p>
            {activeMission ? (
              <button
                type="button"
                className="accept"
                onClick={() => selectTab('staging')}
                disabled={busy}
              >
                Open Dispatch
              </button>
            ) : null}
          </div>
          <ul className="mission-list logbook-list">
            {[...missions]
              .sort(
                (a, b) =>
                  (b.acceptedAtTick ?? 0) - (a.acceptedAtTick ?? 0) ||
                  b.id.localeCompare(a.id),
              )
              .map((m) => {
                const kind = logbookFlightKind(m);
                const distanceNm = logbookDistanceNm(m);
                const duration = logbookFlightDurationLabel(m);
                const when = logbookFlightWhenLabel(m);
                const payout = logbookPayoutUsd(m);
                const payoutIsCut = logbookPayoutIsPilotCut(m);
                const vaFlight = logbookIsVaFlight(m);
                const fleetLabel = m.aircraftId
                  ? fleet.find((a) => a.id === m.aircraftId)?.label
                  : null;
                return (
                  <li key={m.id} className="mission logbook-entry">
                    <div className="mission-main">
                      <div className="route">
                        <IcaoLink
                          icao={m.originIcao}
                          onOpen={openAirport}
                          disabled={busy}
                        />
                        <span className="arrow">→</span>
                        <IcaoLink
                          icao={m.destIcao}
                          onOpen={openAirport}
                          disabled={busy}
                        />
                        <span className={`status status-${m.status}`}>
                          {logbookStatusLabel(m.status)}
                        </span>
                        <span className="logbook-kind">{kind}</span>
                        {vaFlight ? (
                          <span className="logbook-kind logbook-va" title="Flown for a listed airline">
                            Airline
                          </span>
                        ) : null}
                        {isActiveMissionStatus(m.status) ? (
                          <button
                            type="button"
                            className="linkish"
                            onClick={() => selectTab('staging')}
                            disabled={busy}
                          >
                            Operate in Dispatch
                          </button>
                        ) : null}
                      </div>
                      <p className="logbook-summary">
                        {logbookAircraftLabel(m, { fleetLabel })}
                        {' · '}
                        {logbookCargoLabel(m, formatTonnes)}
                        {' · '}
                        {distanceNm != null
                          ? `${distanceNm.toLocaleString('en-US')} nm`
                          : 'Distance —'}
                        {' · '}
                        {duration ?? 'Time —'}
                        {' · '}
                        {when ?? 'When —'}
                        {' · '}
                        {payout != null
                          ? payoutIsCut
                            ? `${formatMoney(payout)} cut`
                            : formatMoney(payout)
                          : '—'}
                      </p>
                    </div>
                  </li>
                );
              })}
            {missions.length === 0 ? (
              <li className="empty">
                No flights logged yet — prepare a freight from Freights.
              </li>
            ) : null}
          </ul>
        </section>
      )}

        </div>
      <WatchStatusFooter
        missionStatus={activeMission?.status ?? null}
        activeMissionId={activeMission?.id ?? null}
        simBridge={simBridge}
        watch={
          holdWatchOffForPreflight && watch
            ? { ...watch, running: false }
            : watch
        }
        watchAutoStatus={watchAutoStatus}
        watchAutoPaused={watchAutoPaused}
        loadOfpAutoStatus={loadOfpAutoStatus}
        weightSystem={weightSystem}
      />
      </div>
      {showSettleBusyOverlay ? (
        <div
          className="confirm-overlay settle-busy-overlay"
          role="status"
          aria-live="assertive"
          aria-busy="true"
        >
          <div className="settle-busy-card">
            <span className="busy-spinner busy-spinner-lg" aria-hidden="true" />
            <strong>Settling flight…</strong>
            <span>Saving payout and flight log — debrief opens next.</span>
          </div>
        </div>
      ) : null}
      {pilotTravelOpen && pilotIcao ? (
        <PilotTravelDialog
          key={pilotTravelInitialDest ?? 'picker'}
          pilotIcao={pilotIcao}
          homeCompanyId={homeCompanyId ?? homeCompanyIdRef.current}
          initialDestIcao={pilotTravelInitialDest}
          hubs={ferryDestinationHubs(hubOptions).map((hub) => ({
            icao: hub.icao,
            name: hub.name,
          }))}
          fleetShortcuts={fleet
            .filter(
              (acf) =>
                acf.status === 'parked' || acf.status === 'maintenance',
            )
            .map((acf) => ({
              icao: acf.locationIcao,
              label: acf.label,
            }))}
          ferryAircraft={fleet.map((acf) => ({
            id: acf.id,
            label: acf.label,
            locationIcao: acf.locationIcao,
            status: acf.status,
            leaseOverdue: acf.leaseOverdue,
          }))}
          formatMoney={formatMoney}
          busy={busy}
          onCancel={closePilotTravel}
          onTravel={onPilotTravel}
          onPlanFerry={openTopbarFerry}
        />
      ) : null}
      {topbarFerry
        ? (() => {
            const acf = fleet.find((a) => a.id === topbarFerry.aircraftId);
            if (!acf) return null;
            return (
              <FerryJourneyDialog
                aircraft={acf}
                finalDestIcao={topbarFerry.finalDest}
                formatMoney={formatMoney}
                busy={busy}
                onClose={() => setTopbarFerry(null)}
                onFlyLeg={async (legDest) => {
                  await onFerry(acf.id, legDest, {
                    finalDest: topbarFerry.finalDest,
                  });
                }}
              />
            );
          })()
        : null}
      {splitHoldId
        ? (() => {
            const hold = playerFbos?.holds.find((h) => h.id === splitHoldId);
            if (!hold) return null;
            const origin = hold.originIcao.toUpperCase();
            const options = fleet
              .filter(
                (acf) =>
                  acf.status === 'parked' &&
                  acf.locationIcao.toUpperCase() === origin &&
                  !acf.leaseOverdue,
              )
              .map((acf) => {
                const catalog = hangarCatalogEntry(acf);
                return {
                  aircraft: acf,
                  maxCargoKg: catalog?.maxCargoKg ?? 0,
                  maxRangeNm: catalog?.maxRangeNm ?? 0,
                };
              })
              .filter((opt) => opt.maxCargoKg > 0);
            return (
              <FboSplitDialog
                hold={hold}
                options={options}
                weightSystem={weightSystem}
                formatMoney={formatMoney}
                formatTonnes={formatTonnes}
                busy={busy}
                onCancel={() => setSplitHoldId(null)}
                onConfirm={(legs) => void confirmSplitFboHold(legs)}
              />
            );
          })()
        : null}
      {confirmDialog}
    </div>
    </AirportNamesProvider>
  );
}
