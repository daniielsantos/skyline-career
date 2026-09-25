import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  fetchPorts,
  fetchWarehouses,
  fetchCargoLimit,
  formatClientUpdateRequiredLabel,
  formatClientUpdateCtaLabel,
  postDemandAccept,
  postDemandHold,
  postDemandHoldCancel,
  postDemandDispatchHold,
  postGroundStaffFire,
  postGroundStaffHire,
  postPortBuy,
  postPortAutoBuy,
  postPortStevedore,
  postPortScout,
  postPortShuttle,
  postPortConcessionClaim,
  postPortConcessionRenew,
  postPortConcessionUpgrade,
  postPortDeposit,
  postPortPickupAbandon,
  postWarehouseBuy,
  postWarehouseUpgrade,
  postWarehouseStockAbandon,
  postWarehouseBridgeHold,
  postWarehouseBridgeHoldCancel,
  postWarehouseBridgeAccept,
  postWarehouseBridgeDispatchHold,
  postWarehouseBridgeQuote,
  postWarehouseHaulHold,
  postWarehouseHaulHoldCancel,
  postWarehouseHaulAccept,
  postWarehouseHaulDispatchHold,
  postWarehouseHaulQuote,
  type CareerCargoOps,
  type DemandOrderView,
  type GroundStaffSnapshot,
  type Mission,
  type PlayerAircraft,
  type PlayerDemandHoldView,
  type PlayerWarehouseSnapshot,
  type PortListingView,
  type PortScoutBridgeSuggestion,
  type PortScoutDemandSuggestion,
  type PortScoutHaulSuggestion,
  type PortShuttleQuote,
  type InternalHaulPayQuote,
  type WarehouseHaulPayQuote,
  type PortsSnapshot,
} from './api';
import { PortsMap } from './PortsMap';
import { BusyBlock } from './Busy';
import { CommodityIcon } from './CommodityIcon';
import { CrewPortrait } from './CrewPanel';
import { crewPortraitUrl } from './crewPortraits';
import { useConfirm } from './ConfirmDialog';
import {
  buildCompanyNetworkNodes,
  findNetworkNode,
  type CompanyNetworkNode,
} from './company-network';
import { VaCompanyNetwork } from './VaCompanyNetwork';
import {
  formatPortDeskPickupLabel,
  portDeskPickupHubList,
  resolvePortDeskPickupHub,
} from './port-desk-pickup';
import {
  demandOrderReachableFromOrigins,
  previewDemandAcceptPull,
  previewDemandInternationalRoute,
  warehouseFreeCommodityKgClient,
  greatCircleDistanceNm,
  formatPortCorridorReachLabel,
  resolveUiPortCorridorLevel,
  corridorNmForLevel,
} from './demand-accept-preview';
import { pickDefaultPortId } from './ports-default-pick';
import {
  displayAmountToStoredKg,
  displayMassToStoredKg,
  displayToKg,
  KG_TO_LB,
  kgToDisplay,
  massUnitLabel,
  formatMassPreferExact,
  type WeightSystem,
} from './weight-units';

/** Mirror of shared PORT_SCOUT_MIN_KG — Scout Hold slider floor. */
const SCOUT_HOLD_MIN_KG = 200;

/** Mirror of shared groundStaffSlotsForWarehouse (client must not import shared). */
function warehouseStaffSlotsUnlocked(tier: number): number {
  if (tier >= 3) return 3;
  if (tier >= 2) return 2;
  return 1;
}
const WH_T1_CAPACITY_KG = 2_268;
const WH_T2_CAPACITY_KG = 5_443;
const WH_T3_CAPACITY_KG = 11_340;
const WH_T4_CAPACITY_KG = 45_000;
/** Mirror of shared MIN_WAREHOUSE_INBOUND_KG — avoid Mass 0.0 klb ghost rows. */
const MIN_WAREHOUSE_INBOUND_KG = 25;

function warehouseCapForTier(tier: number): number {
  if (tier >= 4) return WH_T4_CAPACITY_KG;
  if (tier === 3) return WH_T3_CAPACITY_KG;
  if (tier === 2) return WH_T2_CAPACITY_KG;
  return WH_T1_CAPACITY_KG;
}
/** Mirror of shared port→WH inbound transfer ticks. */
const INBOUND_BASE_TICKS = 4;
const INBOUND_MAX_TICKS = 8;
const LOGISTICS_MULT = 0.55;

function transferDiscountLabel(mult: number | undefined | null): string {
  const m =
    typeof mult === 'number' && Number.isFinite(mult) && mult > 0 && mult < 1
      ? mult
      : LOGISTICS_MULT;
  return `logistics −${Math.round((1 - m) * 100)}% ETA`;
}

function yardDiscountLabel(mult: number | undefined | null): string {
  const m =
    typeof mult === 'number' && Number.isFinite(mult) && mult > 0 && mult < 1
      ? mult
      : 0.85;
  return `−${Math.round((1 - m) * 100)}%`;
}

function procurementDiscountLabel(mult: number | undefined | null): string {
  const m =
    typeof mult === 'number' && Number.isFinite(mult) && mult > 0 && mult < 1
      ? mult
      : 0.97;
  return `Port −${Math.round((1 - m) * 100)}%`;
}

function demandPayBoostLabel(mult: number | undefined | null): string {
  const m =
    typeof mult === 'number' && Number.isFinite(mult) && mult > 1
      ? mult
      : 1.04;
  return `Demand +${Math.round((m - 1) * 100)}%`;
}

function whOpsCapexLabel(mult: number | undefined | null): string {
  const m =
    typeof mult === 'number' && Number.isFinite(mult) && mult > 0 && mult < 1
      ? mult
      : 0.93;
  return `Upgrade −${Math.round((1 - m) * 100)}%`;
}

function inboundTransferTicksClient(
  kg: number,
  logisticsMult: number = 1,
): number {
  const mass = Math.max(0, Math.floor(kg));
  let ticks = INBOUND_BASE_TICKS;
  if (mass > 10_000) {
    ticks += Math.min(4, Math.ceil((mass - 10_000) / 8_000));
  }
  ticks = Math.min(INBOUND_MAX_TICKS, Math.max(INBOUND_BASE_TICKS, ticks));
  const mult =
    Number.isFinite(logisticsMult) && logisticsMult > 0 ? logisticsMult : 1;
  return Math.max(2, Math.round(ticks * mult));
}

/** 15-min economy ticks → hours/minutes (exact). */
function ticksToHoursLabel(ticks: number): string {
  const totalMin = Math.max(0, Math.round(Math.max(0, ticks) * 15));
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
/** Mirror of shared PORT_YARD_HOLD_* (client must not import shared). */
const YARD_HOLD_USD_PER_KG_DAY = 0.05;
const YARD_HOLD_VALUE_MULT = 2;
const YARD_HOLD_WARN_DAYS = 2;

function yardHoldUsdPerKgDay(commodityId: string): number {
  if (commodityId === 'electronics' || commodityId === 'machinery') {
    return YARD_HOLD_USD_PER_KG_DAY * YARD_HOLD_VALUE_MULT;
  }
  return YARD_HOLD_USD_PER_KG_DAY;
}

function yardHoldUsdPerDay(kg: number, commodityId: string): number {
  const mass = Math.max(0, kg);
  if (mass <= 0) return 0;
  return Math.round(mass * yardHoldUsdPerKgDay(commodityId) * 100) / 100;
}

function commodityLabel(
  row: { commodityId: string; commodityName?: string },
): string {
  return row.commodityName?.trim() || row.commodityId;
}

const DEMAND_PAGE_SIZE = 11;
/** 1 economy tick = 15 wall-clock minutes. */
const HOURS_PER_TICK = 0.25;
const HOURS_PER_DAY = 24;
/** Economy batches per career day (matches shared TICKS_PER_DAY). */
const TICKS_PER_DAY = 96;

function leaseDaysLeftFromTicks(
  leasePaidThroughTick: number | null | undefined,
  economyTick: number | null | undefined,
): number | null {
  if (
    leasePaidThroughTick == null ||
    economyTick == null ||
    !Number.isFinite(leasePaidThroughTick) ||
    !Number.isFinite(economyTick)
  ) {
    return null;
  }
  return Math.max(
    0,
    Math.ceil((leasePaidThroughTick - economyTick) / TICKS_PER_DAY),
  );
}

type DemandSortKey =
  | 'country'
  | 'dest'
  | 'dist'
  | 'commodity'
  | 'wanted'
  | 'price'
  | 'pay'
  | 'expires';

type DemandSort = { key: DemandSortKey; direction: 'asc' | 'desc' };

function demandCountryLabel(countryId: string | null | undefined): string {
  const id = countryId?.trim().toUpperCase() ?? '';
  if (!id) return '—';
  switch (id) {
    case 'BR':
      return 'Brazil';
    case 'US':
      return 'USA';
    case 'CA':
      return 'Canada';
    case 'MX':
      return 'Mexico';
    case 'AR':
      return 'Argentina';
    case 'CL':
      return 'Chile';
    default:
      return id;
  }
}

function demandDestCountryId(order: DemandOrderView): string {
  return order.destCountryId?.trim().toUpperCase() ?? '';
}

/** Wall-clock duration from economy hours; matches Freights board style. */
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

function formatExpiresIn(
  expiresAtTick: number,
  currentTick: number | undefined,
): string {
  if (currentTick == null || !Number.isFinite(currentTick)) {
    return '—';
  }
  const remainingTicks = expiresAtTick - currentTick;
  if (remainingTicks <= 0) return 'Expired';
  return `${formatDuration(remainingTicks * HOURS_PER_TICK)} left`;
}

function demandSortValue(
  order: DemandOrderView,
  key: DemandSortKey,
  distNmById?: ReadonlyMap<string, number | null>,
): string | number {
  switch (key) {
    case 'country':
      return demandDestCountryId(order) || 'ZZ';
    case 'dest':
      return order.destIcao.toUpperCase();
    case 'dist': {
      const n = distNmById?.get(order.id);
      return n != null && Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
    }
    case 'commodity':
      return commodityLabel(order).toLowerCase();
    case 'wanted':
      return order.remainingKg;
    case 'price':
      return order.maxUnitPriceUsd;
    case 'pay':
      return order.remainingKg * order.maxUnitPriceUsd;
    case 'expires':
      return order.expiresAtTick;
  }
}

function compareDemandOrders(
  a: DemandOrderView,
  b: DemandOrderView,
  sort: DemandSort,
  distNmById?: ReadonlyMap<string, number | null>,
): number {
  const av = demandSortValue(a, sort.key, distNmById);
  const bv = demandSortValue(b, sort.key, distNmById);
  let cmp = 0;
  if (typeof av === 'number' && typeof bv === 'number') {
    cmp = av - bv;
  } else {
    cmp = String(av).localeCompare(String(bv), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  }
  if (cmp === 0) return a.id.localeCompare(b.id);
  return sort.direction === 'asc' ? cmp : -cmp;
}

export function PortsPanel(props: {
  busy?: boolean;
  weightSystem: WeightSystem;
  formatMoney: (n: number) => string;
  formatTonnes: (kg: number) => string;
  fleet: PlayerAircraft[];
  /** Ids belonging to the member VA — for picker labels. */
  vaAircraftIds?: ReadonlySet<string>;
  /**
   * Company whose Port FBO / WH / Scout to load.
   * Sidebar Ports = home (omit or home id). My VA Ports = VA company id.
   * Falls back to request header company when omitted.
   */
  logisticsCompanyId?: string | null;
  /**
   * Shelf label for owned warehouses / catalog concession chip.
   * Home Ports: "Yours". My VA Ports: "Company".
   */
  ownedShelfLabel?: string;
  /**
   * My VA membership role. Omit on home Ports (solo = full access).
   * When set, VA-listed gates apply: desk ops = owner|dispatcher; CAPEX = owner.
   */
  vaMemberRole?: 'owner' | 'dispatcher' | 'pilot' | null;
  /** Nested under My VA — drop outer panel chrome. */
  embedded?: boolean;
  /**
   * Pilot / company home for initial catalog focus.
   * Nearest seaport wins when no owned FBO/WH yet (avoids always landing on Santos).
   */
  homeFocus?: {
    lat?: number | null;
    lon?: number | null;
    countryId?: string | null;
  } | null;
  /** Dual-tenant: company for Accept/Fly when the tail is VA-owned. */
  resolveOpsCompanyId?: (aircraftId: string) => string | undefined;
  /** Pin VA tenant before Accept so Dispatch loads the right missions. */
  ensureOpsCompany?: (aircraftId: string) => Promise<void>;
  /** Aircraft cargo ceiling (kg); 0 = treat as unlimited for preview. */
  resolveMaxCargoKg?: (aircraft: PlayerAircraft) => number;
  economyTick?: number;
  /** Wall anchor of last economy pulse — refresh desk/inbound when it advances. */
  economyLastBatchAtMs?: number;
  cargoOps?: CareerCargoOps | null;
  onOpenCargoOps?: () => void;
  onWallet?: (usd: number) => void;
  onFleet?: (fleet: PlayerAircraft[]) => void;
  /** When Accept used a VA tail, update VA hangar cache instead of home. */
  onVaFleet?: (fleet: PlayerAircraft[]) => void;
  onVaWallet?: (usd: number) => void;
  onMissions?: (missions: Mission[]) => void;
  onOpenAirport?: (icao: string) => void;
  onStaged?: (mission: Mission) => void;
  onToast?: (kind: 'ok' | 'fail', message: string) => void;
  /** World kill switch — Fly now / Dispatch blocked until desktop ≥ min. */
  clientUpdateRequiredMin?: string | null;
  onOpenUpdates?: () => void;
}) {
  const ownedShelfLabel = props.ownedShelfLabel?.trim() || 'Yours';
  const vaRole = props.vaMemberRole ?? null;
  /** Solo / home Ports: full. VA: owner + dispatcher. */
  const canPortDeskOps =
    !vaRole || vaRole === 'owner' || vaRole === 'dispatcher';
  /** Solo / home Ports: full. VA: owner only. */
  const canPortCapex = !vaRole || vaRole === 'owner';
  const [snap, setSnap] = useState<PortsSnapshot | null>(null);
  const [demand, setDemand] = useState<DemandOrderView[]>([]);
  const [warehouses, setWarehouses] = useState<PlayerWarehouseSnapshot | null>(
    null,
  );
  const [groundStaff, setGroundStaff] = useState<GroundStaffSnapshot | null>(
    null,
  );
  const [portId, setPortId] = useState<string | null>(null);
  const [mapFocusToken, setMapFocusToken] = useState(0);
  const [buyListing, setBuyListing] = useState<PortListingView | null>(null);
  const [concessionOpen, setConcessionOpen] = useState(false);
  const [deskCommodity, setDeskCommodity] = useState('general');
  const [deskMaxPrice, setDeskMaxPrice] = useState('');
  const [deskMaxKgDay, setDeskMaxKgDay] = useState('');
  const [deskWalletFloor, setDeskWalletFloor] = useState('');
  const [deskWarehouseId, setDeskWarehouseId] = useState('');
  const [amountText, setAmountText] = useState('1000');
  const [acceptOrder, setAcceptOrder] = useState<DemandOrderView | null>(null);
  const [acceptOrigin, setAcceptOrigin] = useState('');
  const [acceptAircraftId, setAcceptAircraftId] = useState('');
  const [acceptMode, setAcceptMode] = useState<'hold' | 'fly'>('hold');
  const [dispatchHold, setDispatchHold] = useState<PlayerDemandHoldView | null>(
    null,
  );
  const [dispatchAircraftId, setDispatchAircraftId] = useState('');
  const [dispatchMode, setDispatchMode] = useState<'fly' | 'shuttle'>('fly');
  const [shuttleQuote, setShuttleQuote] = useState<PortShuttleQuote | null>(
    null,
  );
  const [bridgeDraft, setBridgeDraft] = useState<{
    originIcao: string;
    commodityId: string;
  } | null>(null);
  const [bridgeDest, setBridgeDest] = useState('');
  const [bridgeMode, setBridgeMode] = useState<'hold' | 'fly'>('hold');
  const [bridgeAircraftId, setBridgeAircraftId] = useState('');
  const [bridgePilotPayUsd, setBridgePilotPayUsd] = useState<number | null>(
    null,
  );
  const [bridgePayQuote, setBridgePayQuote] =
    useState<InternalHaulPayQuote | null>(null);
  const [scoutSuggestions, setScoutSuggestions] = useState<
    PortScoutBridgeSuggestion[]
  >([]);
  const [scoutDemandSuggestions, setScoutDemandSuggestions] = useState<
    PortScoutDemandSuggestion[]
  >([]);
  const [scoutHaulSuggestions, setScoutHaulSuggestions] = useState<
    PortScoutHaulSuggestion[]
  >([]);
  const [scoutEmptyHint, setScoutEmptyHint] = useState<string[] | null>(null);
  const [scoutFocusId, setScoutFocusId] = useState<string | null>(null);
  const [scoutFocusToken, setScoutFocusToken] = useState(0);
  const [scoutFilter, setScoutFilter] = useState<
    'all' | 'haul' | 'demand' | 'bridge'
  >('all');
  const [scoutBusy, setScoutBusy] = useState(false);
  const [scoutLoaded, setScoutLoaded] = useState(false);
  const [scoutHoldDraft, setScoutHoldDraft] = useState<
    | { kind: 'haul'; suggestion: PortScoutHaulSuggestion }
    | { kind: 'demand'; suggestion: PortScoutDemandSuggestion }
    | { kind: 'bridge'; suggestion: PortScoutBridgeSuggestion }
    | null
  >(null);
  const [deskOpen, setDeskOpen] = useState(false);
  const [haulDraft, setHaulDraft] = useState<{
    originIcao: string;
    commodityId: string;
  } | null>(null);
  const [haulDest, setHaulDest] = useState('');
  const [haulMode, setHaulMode] = useState<'hold' | 'fly'>('hold');
  const [haulAircraftId, setHaulAircraftId] = useState('');
  const [haulAmountText, setHaulAmountText] = useState('');
  const [haulPayQuote, setHaulPayQuote] =
    useState<WarehouseHaulPayQuote | null>(null);
  const [haulOpsMaxCargoKg, setHaulOpsMaxCargoKg] = useState<number | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  const [section, setSection] = useState<'catalog' | 'network'>('catalog');
  /** What the Network tab shows after a node / action is chosen. */
  const [networkSurface, setNetworkSurface] = useState<
    'fbo' | 'wh' | 'demand' | 'buy' | 'staff'
  >('wh');
  const [selectedNetworkId, setSelectedNetworkId] = useState<string | null>(
    null,
  );
  const [networkSearch, setNetworkSearch] = useState('');
  const [whShelf, setWhShelf] = useState<'owned' | 'staff' | 'buy'>('owned');
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
  const [selectedOwnedHubIcao, setSelectedOwnedHubIcao] = useState<string | null>(
    null,
  );
  const [selectedBuyHubIcao, setSelectedBuyHubIcao] = useState<string | null>(
    null,
  );
  const [buyHubQuery, setBuyHubQuery] = useState('');
  const staffDeskRetryKeyRef = useRef<string | null>(null);
  const [demandSort, setDemandSort] = useState<DemandSort>({
    key: 'expires',
    direction: 'asc',
  });
  const [demandPage, setDemandPage] = useState(1);
  const [demandCountryFilter, setDemandCountryFilter] = useState('');

  const unit = massUnitLabel(props.weightSystem);

  function isCargoOpsCommodityLocked(commodityId: string): boolean {
    try {
      if (localStorage.getItem('skyline.devMode') === '1') return false;
    } catch {
      /* ignore */
    }
    const row =
      props.cargoOps?.commodities?.[
        commodityId as keyof NonNullable<CareerCargoOps>['commodities']
      ];
    return Boolean(row && !row.unlocked);
  }

  async function refresh(opts?: { includeScout?: boolean }) {
    const includeScout = opts?.includeScout !== false;
    setLoadError(null);
    try {
      const logisticsId = props.logisticsCompanyId?.trim() || undefined;
      const nextPorts = await fetchPorts(
        logisticsId ? { companyId: logisticsId } : undefined,
      );
      setSnap(nextPorts);
      setDemand(nextPorts.demand?.orders ?? []);
      setWarehouses(nextPorts.warehouses ?? null);
      setGroundStaff(
        nextPorts.groundStaff ?? nextPorts.warehouses?.groundStaff ?? null,
      );
      // Functional update — soft-poll / pulse effects call a stale `refresh`
      // that closed over portId=null and kept snapping back to ports[0].
      setPortId((cur) => {
        if (cur) {
          const still = nextPorts.ports.find(
            (p) =>
              p.id === cur || p.id.toUpperCase() === cur.toUpperCase(),
          );
          if (still) return still.id;
        }
        return (
          cur ??
          pickDefaultPortId({
            ports: nextPorts.ports,
            homeLat: props.homeFocus?.lat,
            homeLon: props.homeFocus?.lon,
            homeCountryId: props.homeFocus?.countryId,
            ownedWarehouseHubs: (nextPorts.warehouses?.warehouses ?? []).map(
              (w) => w.icao,
            ),
          })
        );
      });
      if (!includeScout) return;
      try {
        await reloadScoutDesk(logisticsId);
      } catch {
        /* keep current scout desk on list fail */
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLoadError(message);
      props.onToast?.('fail', message);
    }
  }

  function applyScoutDesk(desk: {
    suggestions?: PortScoutBridgeSuggestion[];
    demandSuggestions?: PortScoutDemandSuggestion[];
    haulSuggestions?: PortScoutHaulSuggestion[];
    emptyHint?: { lines: string[] } | null;
  }) {
    // Only replace when arrays are present — confirm used to wipe the board
    // with `?? []` when a field was missing.
    if (Array.isArray(desk.suggestions)) {
      setScoutSuggestions(desk.suggestions);
    }
    if (Array.isArray(desk.demandSuggestions)) {
      setScoutDemandSuggestions(desk.demandSuggestions);
    }
    if (Array.isArray(desk.haulSuggestions)) {
      setScoutHaulSuggestions(desk.haulSuggestions);
    }
    if ('emptyHint' in desk) {
      setScoutEmptyHint(desk.emptyHint?.lines ?? null);
    }
  }

  async function reloadScoutDesk(companyId?: string) {
    const logisticsId =
      companyId?.trim() || props.logisticsCompanyId?.trim() || undefined;
    setScoutBusy(true);
    try {
      const scout = await postPortScout({
        action: 'list',
        companyId: logisticsId,
      });
      applyScoutDesk(scout);
    } finally {
      setScoutLoaded(true);
      setScoutBusy(false);
    }
  }

  async function onScoutConfirm(
    s: PortScoutBridgeSuggestion,
    kg?: number,
  ) {
    if (props.busy || loading) return;
    setLoading(true);
    const logisticsId = props.logisticsCompanyId?.trim() || undefined;
    const holdKg = Math.max(
      SCOUT_HOLD_MIN_KG,
      Math.min(s.kg, Math.floor(kg ?? s.kg)),
    );
    try {
      const result = await postPortScout({
        action: 'confirm',
        kind: 'bridge',
        originIcao: s.originIcao,
        destIcao: s.destIcao,
        commodityId: s.commodityId,
        kg: holdKg,
        companyId: logisticsId,
      });
      if (result.ports) setSnap(result.ports);
      if (result.warehouses) setWarehouses(result.warehouses);
      if (
        Array.isArray(result.suggestions) &&
        Array.isArray(result.demandSuggestions) &&
        Array.isArray(result.haulSuggestions)
      ) {
        applyScoutDesk(result);
      } else {
        await reloadScoutDesk(logisticsId).catch(() => undefined);
      }
      setScoutHoldDraft(null);
      props.onToast?.(
        'ok',
        `Scout Internal haul hold ${props.formatTonnes(result.kg ?? holdKg)} ${s.originIcao}→${s.destIcao}${
          (result.hold?.pilotPayUsd ?? 0) > 0
            ? ` · pilot ${props.formatMoney(result.hold!.pilotPayUsd!)}`
            : ' · unpaid'
        }${
          props.embedded
            ? ' — open Hauls to Prepare / Accept'
            : ' — Dispatch when ready'
        }`,
      );
    } catch (err) {
      props.onToast?.(
        'fail',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onScoutDemandConfirm(
    s: PortScoutDemandSuggestion,
    kg?: number,
  ) {
    if (props.busy || loading) return;
    setLoading(true);
    const logisticsId = props.logisticsCompanyId?.trim() || undefined;
    const holdKg = Math.max(
      SCOUT_HOLD_MIN_KG,
      Math.min(s.kg, Math.floor(kg ?? s.kg)),
    );
    try {
      const result = await postPortScout({
        action: 'confirm',
        kind: 'demand',
        orderId: s.orderId,
        originIcao: s.originIcao,
        kg: holdKg,
        companyId: logisticsId,
      });
      if (result.ports) setSnap(result.ports);
      if (result.warehouses) setWarehouses(result.warehouses);
      if (result.demand?.orders) setDemand(result.demand.orders);
      if (
        Array.isArray(result.suggestions) &&
        Array.isArray(result.demandSuggestions) &&
        Array.isArray(result.haulSuggestions)
      ) {
        applyScoutDesk(result);
      } else {
        await reloadScoutDesk(logisticsId).catch(() => undefined);
      }
      setScoutHoldDraft(null);
      const payUsd =
        s.kg > 0
          ? Math.round((s.payUsd * (result.kg ?? holdKg)) / s.kg)
          : s.payUsd;
      props.onToast?.(
        'ok',
        `Scout Demand hold ${props.formatTonnes(result.kg ?? holdKg)} ${s.originIcao}→${s.destIcao} · ${props.formatMoney(payUsd)}${
          props.embedded
            ? ' — open Hauls to Prepare / Accept'
            : ' — Dispatch when ready'
        }`,
      );
    } catch (err) {
      props.onToast?.(
        'fail',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onScoutHaulConfirm(
    s: PortScoutHaulSuggestion,
    kg?: number,
  ) {
    if (props.busy || loading) return;
    setLoading(true);
    const logisticsId = props.logisticsCompanyId?.trim() || undefined;
    const holdKg = Math.max(
      SCOUT_HOLD_MIN_KG,
      Math.min(s.kg, Math.floor(kg ?? s.kg)),
    );
    try {
      const result = await postPortScout({
        action: 'confirm',
        kind: 'haul',
        originIcao: s.originIcao,
        destIcao: s.destIcao,
        commodityId: s.commodityId,
        kg: holdKg,
        companyId: logisticsId,
      });
      if (result.ports) setSnap(result.ports);
      if (result.warehouses) setWarehouses(result.warehouses);
      if (
        Array.isArray(result.suggestions) &&
        Array.isArray(result.demandSuggestions) &&
        Array.isArray(result.haulSuggestions)
      ) {
        applyScoutDesk(result);
      } else {
        await reloadScoutDesk(logisticsId).catch(() => undefined);
      }
      setScoutHoldDraft(null);
      props.onToast?.(
        'ok',
        `Scout Haul hold ${props.formatTonnes(result.kg ?? holdKg)} ${s.originIcao}→${s.destIcao} · ${props.formatMoney(result.payUsd ?? s.payUsd)}${
          props.embedded
            ? ' — open Hauls to Prepare / Accept'
            : ' — Dispatch when ready'
        }`,
      );
    } catch (err) {
      props.onToast?.(
        'fail',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!bridgeDraft || !bridgeDest) {
      setBridgePayQuote(null);
      return;
    }
    const originWh = (warehouses?.warehouses ?? []).find(
      (w) =>
        w.icao.trim().toUpperCase() ===
        bridgeDraft.originIcao.trim().toUpperCase(),
    );
    const freeKg =
      warehouses?.stock
        ?.filter(
          (s) =>
            s.warehouseId === originWh?.id &&
            s.commodityId === bridgeDraft.commodityId,
        )
        .reduce((sum, s) => sum + (s.kg ?? 0), 0) ?? 0;
    let cancelled = false;
    void postWarehouseBridgeQuote({
      originIcao: bridgeDraft.originIcao,
      destIcao: bridgeDest,
      kg: Math.max(200, freeKg),
      commodityId: bridgeDraft.commodityId,
    })
      .then((res) => {
        if (cancelled) return;
        setBridgePayQuote(res.quote);
        setBridgePilotPayUsd((prev) =>
          prev == null ? res.quote.suggestedPayUsd : prev,
        );
      })
      .catch(() => {
        if (!cancelled) setBridgePayQuote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [bridgeDraft, bridgeDest, warehouses?.warehouses, warehouses?.stock]);

  const haulFreeKg = useMemo(() => {
    if (!haulDraft) return 0;
    const origin = haulDraft.originIcao.trim().toUpperCase();
    const wh = (warehouses?.warehouses ?? []).find(
      (w) => w.icao.trim().toUpperCase() === origin,
    );
    if (!wh) return 0;
    const stockKg = (warehouses?.stock ?? [])
      .filter(
        (s) =>
          s.warehouseId === wh.id &&
          s.commodityId === haulDraft.commodityId,
      )
      .reduce((sum, s) => sum + (s.kg ?? 0), 0);
    const reservedKg = (warehouses?.demandHolds ?? [])
      .filter(
        (h) =>
          h.warehouseId === wh.id &&
          h.commodityId === haulDraft.commodityId,
      )
      .reduce((sum, h) => sum + (h.kg ?? 0), 0);
    return warehouseFreeCommodityKgClient(stockKg, reservedKg);
  }, [haulDraft, warehouses?.warehouses, warehouses?.stock, warehouses?.demandHolds]);

  const haulKg = useMemo(() => {
    if (!haulDraft) return 0;
    const display = Math.max(0, Math.floor(Number(haulAmountText) || 0));
    return displayAmountToStoredKg(
      display,
      props.weightSystem,
      haulFreeKg,
      haulOpsMaxCargoKg != null && haulOpsMaxCargoKg > 0
        ? [haulOpsMaxCargoKg]
        : [],
    );
  }, [
    haulDraft,
    haulAmountText,
    haulFreeKg,
    haulOpsMaxCargoKg,
    props.weightSystem,
  ]);

  const haulAircraft = useMemo(
    () => props.fleet.find((a) => a.id === haulAircraftId) ?? null,
    [props.fleet, haulAircraftId],
  );

  useEffect(() => {
    if (
      !haulDraft ||
      !/^[A-Z0-9]{3,4}$/.test(haulDest.trim().toUpperCase()) ||
      haulKg <= 0
    ) {
      setHaulPayQuote(null);
      return;
    }
    let cancelled = false;
    void postWarehouseHaulQuote({
      originIcao: haulDraft.originIcao,
      destIcao: haulDest.trim().toUpperCase(),
      commodityId: haulDraft.commodityId,
      kg: haulKg,
    })
      .then((res) => {
        if (!cancelled) setHaulPayQuote(res.quote);
      })
      .catch(() => {
        if (!cancelled) setHaulPayQuote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [haulDraft, haulDest, haulKg]);

  useEffect(() => {
    if (
      haulMode !== 'fly' ||
      !haulDraft ||
      !haulAircraft ||
      !/^[A-Z0-9]{3,4}$/.test(haulDest.trim().toUpperCase())
    ) {
      setHaulOpsMaxCargoKg(null);
      return;
    }
    let cancelled = false;
    void fetchCargoLimit(
      haulAircraft.aircraftClassId,
      undefined,
      haulAircraft.airframeTypeId,
      {
        originIcao: haulDraft.originIcao.trim().toUpperCase(),
        destIcao: haulDest.trim().toUpperCase(),
        aircraftId: haulAircraft.id,
      },
    )
      .then((limit) => {
        if (!cancelled) {
          setHaulOpsMaxCargoKg(
            Math.max(0, Math.floor(limit.operationalMaxCargoKg)),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHaulOpsMaxCargoKg(
            Math.max(0, props.resolveMaxCargoKg?.(haulAircraft) ?? 0),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    haulMode,
    haulDraft,
    haulAircraft,
    haulDest,
    props.resolveMaxCargoKg,
  ]);

  // Soft-refresh desk/inbound on pulse without re-running the tenant bootstrap.
  const skipPulsePortsRefresh = useRef(true);

  useEffect(() => {
    setScoutLoaded(false);
    setScoutSuggestions([]);
    setScoutDemandSuggestions([]);
    setScoutHaulSuggestions([]);
    setScoutEmptyHint(null);
    void refresh({ includeScout: true }).catch(() => undefined);
    skipPulsePortsRefresh.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tenant / first paint
  }, [props.logisticsCompanyId]);

  // After each economy pulse (tick / lastBatchAtMs): desk today + inbound ETA.
  // Skip scout list — pulse soft-refresh should stay cheap.
  useEffect(() => {
    if (skipPulsePortsRefresh.current) {
      skipPulsePortsRefresh.current = false;
      return;
    }
    void refresh({ includeScout: false }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clock pulse only
  }, [props.economyTick, props.economyLastBatchAtMs]);

  // Soft poll while Ports is open so desk / In transit update without navigating.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void refresh({ includeScout: false }).catch(() => undefined);
    }, 20_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- interval per tenant
  }, [props.logisticsCompanyId]);

  const port =
    snap?.ports.find(
      (p) =>
        portId != null &&
        (p.id === portId || p.id.toUpperCase() === portId.toUpperCase()),
    ) ??
    (portId
      ? undefined
      : snap
        ? snap.ports.find(
            (p) =>
              p.id ===
              pickDefaultPortId({
                ports: snap.ports,
                homeLat: props.homeFocus?.lat,
                homeLon: props.homeFocus?.lon,
                homeCountryId: props.homeFocus?.countryId,
                ownedWarehouseHubs: (warehouses?.warehouses ?? []).map(
                  (w) => w.icao,
                ),
              }),
          ) ?? snap.ports[0]
        : undefined);
  const amountDisplay = Math.max(0, Math.floor(Number(amountText) || 0));
  const kg =
    buyListing != null
      ? displayAmountToStoredKg(
          amountDisplay,
          props.weightSystem,
          buyListing.availableKg,
        )
      : 0;
  const preview =
    buyListing && kg > 0
      ? Math.round(
          buyListing.unitPriceUsd *
            kg *
            (() => {
              const hub = buyListing.allocatedHubIcao.trim().toUpperCase();
              const wh = (warehouses?.warehouses ?? []).find(
                (w) => w.icao.trim().toUpperCase() === hub,
              );
              const mult = wh
                ? groundStaff?.byWarehouse[wh.id]?.procurementMult
                : undefined;
              return typeof mult === 'number' && mult > 0 ? mult : 1;
            })() *
            100,
        ) / 100
      : 0;

  const mapPorts = useMemo(
    () =>
      (snap?.ports ?? []).map((p) => {
        const deskHubs = portDeskPickupHubList(p.pickupHubs);
        const details = p.pickupHubDetails ?? [];
        return {
          id: p.id,
          name: p.name,
          lat: p.lat,
          lon: p.lon,
          pickupHubDetails: deskHubs.map((icao) => {
            const hit = details.find(
              (d) => d.icao.trim().toUpperCase() === icao,
            );
            return (
              hit ?? {
                icao,
                lat: p.lat,
                lon: p.lon,
              }
            );
          }),
        };
      }),
    [snap?.ports],
  );

  const mapWarehouses = useMemo(
    () =>
      (warehouses?.warehouses ?? []).flatMap((w) => {
        const hub = mapPorts
          .flatMap((p) => p.pickupHubDetails)
          .find((h) => h.icao.toUpperCase() === w.icao.toUpperCase());
        if (!hub) return [];
        return [
          {
            id: w.id,
            icao: w.icao,
            lat: hub.lat,
            lon: hub.lon,
            name: w.icao,
            tier: 1 as const,
          },
        ];
      }),
    [warehouses?.warehouses, mapPorts],
  );

  const acceptOriginOptions = useMemo(() => {
    if (!acceptOrder) return [];
    const dest = acceptOrder.destIcao.trim().toUpperCase();
    const deskPortId = acceptOrder.portId?.trim().toUpperCase() ?? '';
    const deskPort = deskPortId
      ? snap?.ports.find((p) => p.id.trim().toUpperCase() === deskPortId)
      : undefined;
    const deskPickups = new Set(portDeskPickupHubList(deskPort?.pickupHubs));
    const rows = (warehouses?.warehouses ?? [])
      .filter((w) => {
        const icao = w.icao.trim().toUpperCase();
        if (icao === dest) return false;
        if (deskPickups.size > 0 && !deskPickups.has(icao)) return false;
        return true;
      })
      .map((w) => {
        const lots = (warehouses?.stock ?? []).filter(
          (s) =>
            s.warehouseId === w.id &&
            s.commodityId === acceptOrder.commodityId &&
            s.kg > 0,
        );
        const stockKg = warehouseFreeCommodityKgClient(
          lots.reduce((sum, s) => sum + s.kg, 0),
          (warehouses?.demandHolds ?? [])
            .filter(
              (h) =>
                h.warehouseId === w.id &&
                h.commodityId === acceptOrder.commodityId,
            )
            .reduce((sum, h) => sum + h.kg, 0),
        );
        const costs = lots.map((s) => s.avgCostUsdPerKg);
        const minCostUsdPerKg =
          costs.length > 0 ? Math.min(...costs) : 0;
        const maxCostUsdPerKg =
          costs.length > 0 ? Math.max(...costs) : 0;
        return {
          icao: w.icao.trim().toUpperCase(),
          warehouseId: w.id,
          stockKg,
          lotCount: lots.length,
          minCostUsdPerKg,
          maxCostUsdPerKg,
          freeKg: w.freeKg,
          usedKg: w.usedKg,
          countryId: w.countryId ?? null,
          lat: w.lat ?? null,
          lon: w.lon ?? null,
        };
      });
    return rows.sort((a, b) => {
      if (a.stockKg > 0 !== b.stockKg > 0) return a.stockKg > 0 ? -1 : 1;
      return a.icao.localeCompare(b.icao);
    });
  }, [acceptOrder, warehouses, snap?.ports]);

  const acceptAircraftOptions = useMemo(() => {
    if (!acceptOrigin) return [];
    const hub = acceptOrigin.trim().toUpperCase();
    return props.fleet.filter(
      (a) =>
        a.status === 'parked' &&
        a.locationIcao.trim().toUpperCase() === hub,
    );
  }, [props.fleet, acceptOrigin]);

  const selectedOriginStockKg =
    acceptOriginOptions.find((o) => o.icao === acceptOrigin.trim().toUpperCase())
      ?.stockKg ?? 0;

  const acceptIntlPreview = useMemo(() => {
    if (!acceptOrder || !acceptOrigin) return null;
    const origin = acceptOrigin.trim().toUpperCase();
    const originRow = acceptOriginOptions.find((o) => o.icao === origin);
    return previewDemandInternationalRoute({
      originIcao: origin,
      destIcao: acceptOrder.destIcao,
      originCountryId: originRow?.countryId,
      destCountryId: acceptOrder.destCountryId,
      pickupHubs: warehouses?.pickupHubs ?? [],
    });
  }, [
    acceptOrder,
    acceptOrigin,
    acceptOriginOptions,
    warehouses?.pickupHubs,
  ]);

  const acceptDistanceNm = useMemo(() => {
    if (!acceptOrder || !acceptOrigin) return null;
    const origin = acceptOrigin.trim().toUpperCase();
    const originRow = acceptOriginOptions.find((o) => o.icao === origin);
    const oLat = originRow?.lat;
    const oLon = originRow?.lon;
    const dLat = acceptOrder.destLat;
    const dLon = acceptOrder.destLon;
    if (
      oLat == null ||
      oLon == null ||
      dLat == null ||
      dLon == null ||
      !Number.isFinite(oLat) ||
      !Number.isFinite(oLon) ||
      !Number.isFinite(dLat) ||
      !Number.isFinite(dLon)
    ) {
      return null;
    }
    return greatCircleDistanceNm(
      { lat: oLat, lon: oLon },
      { lat: dLat, lon: dLon },
    );
  }, [acceptOrder, acceptOrigin, acceptOriginOptions]);

  /** Route fuel+MTOW ops cap — matches server acceptDemandOrder / SimBrief prefill. */
  const [acceptOpsMaxCargoKg, setAcceptOpsMaxCargoKg] = useState<number | null>(
    null,
  );
  const acceptAircraft = useMemo(
    () => props.fleet.find((a) => a.id === acceptAircraftId) ?? null,
    [props.fleet, acceptAircraftId],
  );
  const acceptStructuralMaxKg = useMemo(() => {
    if (!acceptAircraft) return 0;
    return Math.max(0, props.resolveMaxCargoKg?.(acceptAircraft) ?? 0);
  }, [acceptAircraft, props.resolveMaxCargoKg]);

  useEffect(() => {
    if (!acceptOrder || !acceptOrigin || !acceptAircraft) {
      setAcceptOpsMaxCargoKg(null);
      return;
    }
    let cancelled = false;
    // Keep the last ops value while refetching — do not flash structural (that
    // made Mass / payout jump every App re-render / economy tick).
    void fetchCargoLimit(
      acceptAircraft.aircraftClassId,
      acceptDistanceNm ?? undefined,
      acceptAircraft.airframeTypeId,
      {
        originIcao: acceptOrigin.trim().toUpperCase(),
        destIcao: acceptOrder.destIcao,
        aircraftId: acceptAircraft.id,
      },
    )
      .then((limit) => {
        if (!cancelled) {
          setAcceptOpsMaxCargoKg(
            Math.max(0, Math.floor(limit.operationalMaxCargoKg)),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setAcceptOpsMaxCargoKg(acceptStructuralMaxKg);
      });
    return () => {
      cancelled = true;
    };
  }, [
    acceptOrder?.id,
    acceptOrder?.destIcao,
    acceptOrigin,
    acceptAircraft?.id,
    acceptAircraft?.aircraftClassId,
    acceptAircraft?.airframeTypeId,
    acceptDistanceNm,
    acceptStructuralMaxKg,
  ]);

  const acceptPullPreview = useMemo(() => {
    if (!acceptOrder || !acceptOrigin) return null;
    const origin = acceptOrigin.trim().toUpperCase();
    const originRow = acceptOriginOptions.find((o) => o.icao === origin);
    if (!originRow || originRow.stockKg <= 0) return null;
    const maxCargoKg =
      acceptMode === 'hold'
        ? originRow.stockKg
        : acceptAircraft
          ? Math.max(0, acceptOpsMaxCargoKg ?? acceptStructuralMaxKg)
          : 0;
    const lots = (warehouses?.stock ?? []).filter(
      (s) =>
        s.warehouseId === originRow.warehouseId &&
        s.commodityId === acceptOrder.commodityId &&
        s.kg > 0,
    );
    const deskMult = (() => {
      const m = groundStaff?.byWarehouse[originRow.warehouseId]?.demandDeskMult;
      return typeof m === 'number' && Number.isFinite(m) && m > 0 ? m : 1;
    })();
    const intlMult = acceptIntlPreview?.allowed
      ? acceptIntlPreview.unitPriceMult
      : 1;
    return previewDemandAcceptPull({
      remainingKg: acceptOrder.remainingKg,
      stockKg: originRow.stockKg,
      maxCargoKg,
      maxUnitPriceUsd: acceptOrder.maxUnitPriceUsd,
      unitPriceMult: intlMult * deskMult,
      lots,
    });
  }, [
    acceptOrder,
    acceptOrigin,
    acceptAircraft,
    acceptOriginOptions,
    acceptIntlPreview,
    acceptOpsMaxCargoKg,
    acceptStructuralMaxKg,
    warehouses?.stock,
    groundStaff,
    acceptMode,
  ]);

  function openBuyModal(listing: PortListingView) {
    if (isCargoOpsCommodityLocked(listing.commodityId)) {
      props.onToast?.(
        'fail',
        `Cargo Ops: ${commodityLabel(listing)} is locked — unlock it in Hangar → Cargo Ops`,
      );
      props.onOpenCargoOps?.();
      return;
    }
    const hubFree = freeKgAtHub(listing.allocatedHubIcao);
    const defaultKg = Math.min(
      hubFree > 0 ? hubFree : 1000,
      Math.max(1, Math.floor(listing.availableKg)),
    );
    setAmountText(
      String(Math.max(1, Math.floor(kgToDisplay(defaultKg, props.weightSystem)))),
    );
    setBuyListing(listing);
  }

  function closeBuyModal() {
    setBuyListing(null);
  }

  function selectCatalogPort(id: string) {
    setPortId(id);
    setMapFocusToken((n) => n + 1);
    setConcessionOpen(false);
    closeBuyModal();
  }

  function openAcceptModal(order: DemandOrderView) {
    if (isCargoOpsCommodityLocked(order.commodityId)) {
      props.onToast?.(
        'fail',
        `Cargo Ops: ${commodityLabel(order)} is locked — unlock it in Hangar → Cargo Ops`,
      );
      props.onOpenCargoOps?.();
      return;
    }
    setAcceptOrder(order);
    setAcceptMode('hold');
    const dest = order.destIcao.trim().toUpperCase();
    const origins = (warehouses?.warehouses ?? [])
      .filter((w) => w.icao.trim().toUpperCase() !== dest)
      .map((w) => {
        const stockKg = warehouseFreeCommodityKgClient(
          (warehouses?.stock ?? [])
            .filter(
              (s) =>
                s.warehouseId === w.id && s.commodityId === order.commodityId,
            )
            .reduce((sum, s) => sum + s.kg, 0),
          (warehouses?.demandHolds ?? [])
            .filter(
              (h) =>
                h.warehouseId === w.id && h.commodityId === order.commodityId,
            )
            .reduce((sum, h) => sum + h.kg, 0),
        );
        return { icao: w.icao.trim().toUpperCase(), stockKg };
      })
      .sort((a, b) => {
        if (a.stockKg > 0 !== b.stockKg > 0) return a.stockKg > 0 ? -1 : 1;
        return a.icao.localeCompare(b.icao);
      });
    const withStock = origins.find((o) => o.stockKg > 0);
    const origin = withStock?.icao ?? origins[0]?.icao ?? '';
    setAcceptOrigin(origin);
    const aircraft = origin
      ? props.fleet.filter(
          (a) =>
            a.status === 'parked' &&
            a.locationIcao.trim().toUpperCase() === origin,
        )
      : [];
    setAcceptAircraftId(aircraft[0]?.id ?? '');
  }

  function closeAcceptModal() {
    setAcceptOrder(null);
    setAcceptOrigin('');
    setAcceptAircraftId('');
    setAcceptMode('hold');
  }

  async function onConfirmBuy() {
    if (!buyListing || kg <= 0 || props.busy || loading) return;
    if (isCargoOpsCommodityLocked(buyListing.commodityId)) {
      props.onToast?.(
        'fail',
        `Cargo Ops: ${commodityLabel(buyListing)} is locked — unlock it in Hangar → Cargo Ops`,
      );
      props.onOpenCargoOps?.();
      return;
    }
    setLoading(true);
    try {
      const result = await postPortBuy({ listingId: buyListing.id, kg });
      props.onWallet?.(result.walletUsd);
      setSnap(result.ports);
      setWarehouses(result.warehouses ?? result.ports.warehouses ?? null);
      setGroundStaff(
        result.ports.groundStaff ??
          result.warehouses?.groundStaff ??
          groundStaff,
      );
      if (result.ports.demand?.orders) setDemand(result.ports.demand.orders);
      const inbound = result.inboundKg ?? 0;
      const yard = result.yardKg ?? 0;
      const eta =
        result.transferTicks != null && result.transferTicks > 0
          ? ticksToHoursLabel(result.transferTicks)
          : null;
      const logisticsChip =
        inbound > 0 &&
        result.inboundTransfer &&
        (result.ports.groundStaff?.byWarehouse[
          result.inboundTransfer.warehouseId
        ]?.logisticsActive ||
          groundStaff?.byWarehouse[result.inboundTransfer.warehouseId]
            ?.logisticsActive)
          ? ` · ${transferDiscountLabel(
              result.ports.groundStaff?.byWarehouse[
                result.inboundTransfer.warehouseId
              ]?.logisticsMult ??
                groundStaff?.byWarehouse[result.inboundTransfer.warehouseId]
                  ?.logisticsMult,
            )}`
          : '';
      let where = 'recorded';
      if (inbound > 0 && yard > 0) {
        where = `${props.formatTonnes(inbound)} in transit to WH${eta ? ` (~${eta})` : ''}${logisticsChip} · ${props.formatTonnes(yard)} yard`;
      } else if (inbound > 0) {
        where = `in transit to WH${eta ? ` · ETA ~${eta}` : ''}${logisticsChip}`;
      } else if (yard > 0) {
        where = `yard hold at ${result.pickup?.hubIcao ?? buyListing.allocatedHubIcao}`;
      }
      props.onToast?.('ok', `Bought ${props.formatTonnes(result.kg)} · ${where}`);
      closeBuyModal();
      if (inbound > 0 || yard > 0) openNetworkSurface('wh');
    } catch (err) {
      props.onToast?.(
        'fail',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onClaimConcession(portIdToClaim: string) {
    if (props.busy || loading) return;
    if (!canPortCapex) {
      props.onToast?.('fail', 'Only the company owner can claim a Port FBO');
      return;
    }
    setLoading(true);
    try {
      const result = await postPortConcessionClaim({ portId: portIdToClaim });
      props.onWallet?.(result.walletUsd);
      setSnap(result.ports);
      setWarehouses(result.ports.warehouses ?? warehouses);
      setGroundStaff(
        result.ports.groundStaff ??
          result.ports.warehouses?.groundStaff ??
          groundStaff,
      );
      props.onToast?.(
        'ok',
        `Claimed Port FBO · operator rates active`,
      );
      setConcessionOpen(false);
      openNetworkSurface('fbo', { portId: portIdToClaim });
    } catch (err) {
      props.onToast?.(
        'fail',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onRenewConcession(portIdToRenew: string, leaseUsd: number) {
    if (props.busy || loading) return;
    if (!canPortCapex) {
      props.onToast?.('fail', 'Only the company owner can renew a Port FBO lease');
      return;
    }
    const ok = await confirm({
      title: 'Renew Port FBO lease?',
      body: (
        <p>
          Extend the Port FBO lease by 7 economy days for{' '}
          <strong>{props.formatMoney(leaseUsd)}</strong>.
        </p>
      ),
      confirmLabel: 'Renew lease',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    setLoading(true);
    try {
      const result = await postPortConcessionRenew({ portId: portIdToRenew });
      props.onWallet?.(result.walletUsd);
      setSnap(result.ports);
      setWarehouses(result.ports.warehouses ?? warehouses);
      setGroundStaff(
        result.ports.groundStaff ??
          result.ports.warehouses?.groundStaff ??
          groundStaff,
      );
      props.onToast?.('ok', 'Port FBO lease renewed');
      setConcessionOpen(false);
    } catch (err) {
      props.onToast?.(
        'fail',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onUpgradeConcession(
    portIdToUpgrade: string,
    upgradeUsd: number,
    toLevel: number,
  ) {
    if (props.busy || loading) return;
    if (!canPortCapex) {
      props.onToast?.('fail', 'Only the company owner can upgrade a Port FBO');
      return;
    }
    const p3 = toLevel >= 3;
    const ok = await confirm({
      title: p3 ? 'Unlock P3 terminal cadence?' : 'Enlarge port yard (P2)?',
      body: p3 ? (
        <p>
          Faster daily restock (~11% of cap), +1 listing slot, and a slightly
          faster inbound for{' '}
          <strong>{props.formatMoney(upgradeUsd)}</strong>. Same buy discount as
          P1 — lease floor goes up.
        </p>
      ) : (
        <p>
          Bigger factory stock cap (same restock %, more kg per discharge) for{' '}
          <strong>{props.formatMoney(upgradeUsd)}</strong>. Lease scales with
          recent throughput — no extra buy discount.
        </p>
      ),
      confirmLabel: p3 ? 'Unlock P3' : 'Upgrade yard',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    setLoading(true);
    try {
      const result = await postPortConcessionUpgrade({ portId: portIdToUpgrade });
      props.onWallet?.(result.walletUsd);
      setSnap(result.ports);
      setWarehouses(result.ports.warehouses ?? warehouses);
      setGroundStaff(
        result.ports.groundStaff ??
          result.ports.warehouses?.groundStaff ??
          groundStaff,
      );
      props.onToast?.('ok', p3 ? 'P3 terminal unlocked' : 'P2 yard unlocked');
      setConcessionOpen(false);
    } catch (err) {
      props.onToast?.(
        'fail',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onDeskUpsert(portIdForDesk: string) {
    if (props.busy || loading) return;
    if (!canPortDeskOps) {
      props.onToast?.(
        'fail',
        'Owner or dispatcher only — manage Port FBO desk auto-buy',
      );
      return;
    }
    const priceDisplay = Number(deskMaxPrice);
    const massDisplay = Number(deskMaxKgDay);
    const walletFloorUsd =
      deskWalletFloor.trim() === '' ? 0 : Number(deskWalletFloor);
    // Inputs follow Settings weight system; economy always stores $/kg + kg.
    const maxPriceUsdPerKg =
      props.weightSystem === 'imperial'
        ? priceDisplay * KG_TO_LB
        : priceDisplay;
    const maxKgPerDay = Math.max(
      1,
      displayMassToStoredKg(massDisplay, props.weightSystem),
    );
    if (
      !Number.isFinite(priceDisplay) ||
      priceDisplay < 0.01 ||
      !Number.isFinite(massDisplay) ||
      massDisplay < 1 ||
      !Number.isFinite(maxPriceUsdPerKg) ||
      maxPriceUsdPerKg < 0.01 ||
      !Number.isFinite(maxKgPerDay) ||
      maxKgPerDay < 1
    ) {
      props.onToast?.(
        'fail',
        'Set max price and max mass/day before adding a desk order',
      );
      return;
    }
    if (!Number.isFinite(walletFloorUsd) || walletFloorUsd < 0) {
      props.onToast?.('fail', 'Wallet floor must be zero or more');
      return;
    }
    const warehouseId =
      deskWarehouseId ||
      (warehouses?.warehouses ?? []).find((w) => {
        const desk = resolvePortDeskPickupHub(port?.pickupHubs);
        return (
          desk != null &&
          w.icao.trim().toUpperCase() === desk
        );
      })?.id;
    if (!warehouseId) {
      const desk = resolvePortDeskPickupHub(port?.pickupHubs);
      props.onToast?.(
        'fail',
        desk
          ? `Need a warehouse at ${desk} (desk pickup for this port)`
          : 'Need a warehouse at the desk pickup hub for this port',
      );
      return;
    }
    setLoading(true);
    try {
      const result = await postPortAutoBuy({
        action: 'upsert',
        portId: portIdForDesk,
        commodityId: deskCommodity,
        maxPriceUsdPerKg,
        maxKgPerDay,
        warehouseId,
        walletFloorUsd,
        paused: false,
        companyId: props.logisticsCompanyId?.trim() || undefined,
      });
      props.onWallet?.(result.walletUsd);
      setSnap(result.ports);
      setWarehouses(result.ports.warehouses ?? warehouses);
      setDeskMaxPrice('');
      setDeskMaxKgDay('');
      setDeskWalletFloor('');
      setDeskOpen(true);
      props.onToast?.('ok', 'Port FBO desk order saved');
    } catch (err) {
      props.onToast?.(
        'fail',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onDeskPause(orderId: string, paused: boolean) {
    if (props.busy || loading) return;
    if (!canPortDeskOps) {
      props.onToast?.(
        'fail',
        'Owner or dispatcher only — manage Port FBO desk auto-buy',
      );
      return;
    }
    setLoading(true);
    try {
      const result = await postPortAutoBuy({
        action: 'pause',
        id: orderId,
        paused,
        companyId: props.logisticsCompanyId?.trim() || undefined,
      });
      props.onWallet?.(result.walletUsd);
      setSnap(result.ports);
      props.onToast?.('ok', paused ? 'Desk order paused' : 'Desk order resumed');
    } catch (err) {
      props.onToast?.(
        'fail',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onDeskRemove(orderId: string) {
    if (props.busy || loading) return;
    if (!canPortDeskOps) {
      props.onToast?.(
        'fail',
        'Owner or dispatcher only — manage Port FBO desk auto-buy',
      );
      return;
    }
    setLoading(true);
    try {
      const result = await postPortAutoBuy({
        action: 'remove',
        id: orderId,
        companyId: props.logisticsCompanyId?.trim() || undefined,
      });
      props.onWallet?.(result.walletUsd);
      setSnap(result.ports);
      props.onToast?.('ok', 'Desk order removed');
    } catch (err) {
      props.onToast?.(
        'fail',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onStevedoreTruck(
    pickupId: string,
    destWarehouseId: string,
    destHubIcao: string,
  ) {
    if (props.busy || loading) return;
    if (!canPortDeskOps) {
      props.onToast?.(
        'fail',
        'Owner or dispatcher only — start a Port FBO stevedore haul',
      );
      return;
    }
    try {
      const quoted = await postPortStevedore({
        action: 'quote',
        pickupId,
        destWarehouseId,
      });
      const q = quoted.quote;
      if (!q) throw new Error('No stevedore quote');
      const ok = await confirm({
        title: `Truck to ${destHubIcao}?`,
        body: (
          <p>
            Move <strong>{props.formatTonnes(q.kg)}</strong> by stevedore (
            {q.distanceNm} nm) for{' '}
            <strong>{props.formatMoney(q.feeUsd)}</strong> · ETA ~
            {q.transferTicks} ticks. Same-hub Store stays free.
          </p>
        ),
        confirmLabel: 'Dispatch truck',
        cancelLabel: 'Cancel',
      });
      if (!ok) return;
      setLoading(true);
      const result = await postPortStevedore({
        action: 'start',
        pickupId,
        destWarehouseId,
      });
      if (result.walletUsd != null) props.onWallet?.(result.walletUsd);
      if (result.ports) setSnap(result.ports);
      setWarehouses(result.warehouses ?? result.ports?.warehouses ?? warehouses);
      props.onToast?.(
        'ok',
        `Stevedore ${props.formatTonnes(q.kg)} → ${destHubIcao} · ${props.formatMoney(q.feeUsd)}`,
      );
    } catch (err) {
      props.onToast?.(
        'fail',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onDeposit(pickupId: string) {
    if (props.busy || loading) return;
    setLoading(true);
    try {
      const result = await postPortDeposit({ pickupId });
      props.onWallet?.(result.walletUsd);
      setSnap(result.ports);
      setWarehouses(result.warehouses ?? result.ports.warehouses ?? null);
      const left = result.remainingYardKg ?? 0;
      props.onToast?.(
        'ok',
        left > 0
          ? `Stored ${props.formatTonnes(result.kg)} at ${result.hubIcao} · ${props.formatTonnes(left)} still in yard`
          : `Stored ${props.formatTonnes(result.kg)} in warehouse at ${result.hubIcao}`,
      );
    } catch (err) {
      props.onToast?.(
        'fail',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onAbandonPickup(pickupId: string, label: string) {
    if (props.busy || loading) return;
    if (!canPortDeskOps) {
      props.onToast?.(
        'fail',
        'Owner or dispatcher only — abandon Port yard cargo',
      );
      return;
    }
    const ok = await confirm({
      title: 'Abandon yard hold?',
      body: (
        <>
          <p>
            Drop <strong>{label}</strong> from yard hold.
          </p>
          <p>No refund — stops the daily yard fee for this lot.</p>
        </>
      ),
      confirmLabel: 'Abandon cargo',
      cancelLabel: 'Keep in yard',
      tone: 'danger',
    });
    if (!ok) return;
    setLoading(true);
    try {
      const result = await postPortPickupAbandon({ pickupId });
      props.onWallet?.(result.walletUsd);
      setSnap(result.ports);
      setWarehouses(result.warehouses ?? result.ports.warehouses ?? null);
      props.onToast?.(
        'ok',
        `Abandoned ${props.formatTonnes(result.kg)} yard hold at ${result.hubIcao}`,
      );
    } catch (err) {
      props.onToast?.(
        'fail',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onBuyWarehouse(icao: string) {
    if (props.busy || loading) return;
    if (!canPortCapex) {
      props.onToast?.('fail', 'Only the company owner can buy a warehouse');
      return;
    }
    setLoading(true);
    try {
      const result = await postWarehouseBuy({
        icao,
        companyId: props.logisticsCompanyId?.trim() || undefined,
      });
      props.onWallet?.(result.walletUsd);
      setWarehouses(result.warehouses);
      setSnap(result.ports);
      setGroundStaff(
        result.ports.groundStaff ??
          result.warehouses?.groundStaff ??
          groundStaff,
      );
      props.onToast?.(
        'ok',
        `Warehouse at ${icao} · ${props.formatMoney(result.debitUsd)}`,
      );
      setSelectedBuyHubIcao(null);
      setWhShelf('owned');
    } catch (err) {
      props.onToast?.(
        'fail',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onHireGroundStaff(warehouseId: string, candidateId: string) {
    if (props.busy || loading) return;
    setLoading(true);
    try {
      const result = await postGroundStaffHire({ warehouseId, candidateId });
      props.onWallet?.(result.walletUsd);
      setGroundStaff(result.groundStaff);
      if (result.warehouses) setWarehouses(result.warehouses);
      if (result.ports) {
        setSnap(result.ports);
        if (result.ports.demand?.orders) setDemand(result.ports.demand.orders);
      }
      props.onToast?.(
        'ok',
        `Hired ${result.member.displayName} · ${props.formatMoney(result.debitUsd)}`,
      );
    } catch (err) {
      props.onToast?.(
        'fail',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onFireGroundStaff(
    memberId: string,
    name: string,
    severanceUsd: number,
  ) {
    if (props.busy || loading) return;
    const ok = await confirm({
      title: 'Fire ground staff?',
      body: `Let ${name} go? Perk stops immediately. Severance ${props.formatMoney(severanceUsd)} (5 days' salary).`,
      confirmLabel: 'Fire',
      cancelLabel: 'Keep',
      tone: 'warn',
    });
    if (!ok) return;
    setLoading(true);
    try {
      const result = await postGroundStaffFire({ memberId });
      props.onWallet?.(result.walletUsd);
      setGroundStaff(result.groundStaff);
      if (result.warehouses) setWarehouses(result.warehouses);
      if (result.ports) setSnap(result.ports);
      props.onToast?.(
        'ok',
        result.debitUsd > 0
          ? `Fired ${result.member.displayName} · ${props.formatMoney(result.debitUsd)} severance`
          : `Fired ${result.member.displayName}`,
      );
    } catch (err) {
      props.onToast?.(
        'fail',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onUpgradeWarehouse(warehouseId: string, icao: string) {
    if (props.busy || loading) return;
    if (!canPortCapex) {
      props.onToast?.('fail', 'Only the company owner can upgrade a warehouse');
      return;
    }
    const wh = (warehouses?.warehouses ?? []).find((w) => w.id === warehouseId);
    const nextTier = wh?.nextTier ?? (wh?.tier === 1 ? 2 : wh?.tier === 2 ? 3 : wh?.tier === 3 ? 4 : null);
    if (!nextTier) return;
    const nextCap = warehouseCapForTier(nextTier);
    const price =
      wh?.upgradeUsd != null ? props.formatMoney(wh.upgradeUsd) : 'upgrade';
    const ok = await confirm({
      title: `Upgrade ${icao} to Tier ${nextTier}?`,
      body: (
        <>
          <p>
            Capacity rises to {props.formatTonnes(nextCap)} (from{' '}
            {props.formatTonnes(wh?.capacityKg ?? WH_T1_CAPACITY_KG)}).
          </p>
          <p>Cost {price}. No refund.</p>
        </>
      ),
      confirmLabel: 'Upgrade warehouse',
      cancelLabel: 'Not now',
      tone: 'warn',
    });
    if (!ok) return;
    setLoading(true);
    try {
      const result = await postWarehouseUpgrade({ warehouseId });
      props.onWallet?.(result.walletUsd);
      setWarehouses(result.warehouses);
      setSnap(result.ports);
      props.onToast?.(
        'ok',
        `Warehouse ${icao} → T${result.warehouse.tier} · ${props.formatMoney(result.debitUsd)}`,
      );
    } catch (err) {
      props.onToast?.(
        'fail',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onAbandonWarehouseStock(
    stockId: string,
    label: string,
    hubIcao: string,
  ) {
    if (props.busy || loading) return;
    if (!canPortDeskOps) {
      props.onToast?.(
        'fail',
        'Owner or dispatcher only — abandon warehouse stock',
      );
      return;
    }
    const ok = await confirm({
      title: 'Abandon warehouse stock?',
      body: (
        <>
          <p>
            Drop <strong>{label}</strong> from {hubIcao}.
          </p>
          <p>No refund — frees warehouse capacity and stops storage fees on this lot.</p>
        </>
      ),
      confirmLabel: 'Abandon stock',
      cancelLabel: 'Keep in warehouse',
      tone: 'danger',
    });
    if (!ok) return;
    setLoading(true);
    try {
      const result = await postWarehouseStockAbandon({ stockId });
      props.onWallet?.(result.walletUsd);
      setWarehouses(result.warehouses);
      setSnap(result.ports);
      if (selectedStockId === stockId) setSelectedStockId(null);
      props.onToast?.(
        'ok',
        `Abandoned ${props.formatTonnes(result.kg)} at ${result.hubIcao}`,
      );
    } catch (err) {
      props.onToast?.(
        'fail',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onConfirmAccept() {
    if (
      !acceptOrder ||
      !acceptOrigin ||
      !acceptAircraftId ||
      props.busy ||
      loading
    ) {
      return;
    }
    if (acceptIntlPreview && !acceptIntlPreview.allowed) {
      props.onToast?.(
        'fail',
        acceptIntlPreview.blockReason ??
          'International demand route is not allowed',
      );
      return;
    }
    if (isCargoOpsCommodityLocked(acceptOrder.commodityId)) {
      props.onToast?.(
        'fail',
        `Cargo Ops: ${commodityLabel(acceptOrder)} is locked — unlock it in Hangar → Cargo Ops`,
      );
      props.onOpenCargoOps?.();
      return;
    }
    if (props.clientUpdateRequiredMin) {
      props.onToast?.(
        'fail',
        formatClientUpdateRequiredLabel(props.clientUpdateRequiredMin),
      );
      return;
    }
    setLoading(true);
    try {
      await props.ensureOpsCompany?.(acceptAircraftId);
      const result = await postDemandAccept({
        orderId: acceptOrder.id,
        originIcao: acceptOrigin,
        aircraftId: acceptAircraftId,
        companyId: props.resolveOpsCompanyId?.(acceptAircraftId),
      });
      const vaTail = props.vaAircraftIds?.has(acceptAircraftId);
      if (vaTail) {
        props.onVaFleet?.(result.fleet);
        props.onVaWallet?.(result.walletUsd);
      } else {
        props.onWallet?.(result.walletUsd);
        props.onFleet?.(result.fleet);
      }
      props.onMissions?.(result.missions.slice().reverse());
      setWarehouses(result.warehouses);
      setDemand(result.demand.orders);
      closeAcceptModal();
      props.onToast?.(
        'ok',
        `Demand ${result.mission.originIcao}→${result.mission.destIcao} · ${props.formatTonnes(result.kg)} · ${props.formatMoney(result.payUsd)} · open Dispatch`,
      );
      props.onStaged?.(result.mission);
    } catch (err) {
      props.onToast?.(
        'fail',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onConfirmHold() {
    if (!acceptOrder || !acceptOrigin || props.busy || loading) return;
    if (acceptIntlPreview && !acceptIntlPreview.allowed) {
      props.onToast?.(
        'fail',
        acceptIntlPreview.blockReason ??
          'International demand route is not allowed',
      );
      return;
    }
    if (isCargoOpsCommodityLocked(acceptOrder.commodityId)) {
      props.onToast?.(
        'fail',
        `Cargo Ops: ${commodityLabel(acceptOrder)} is locked — unlock it in Hangar → Cargo Ops`,
      );
      props.onOpenCargoOps?.();
      return;
    }
    setLoading(true);
    try {
      const result = await postDemandHold({
        orderId: acceptOrder.id,
        originIcao: acceptOrigin,
      });
      setWarehouses(result.warehouses);
      setDemand(result.demand.orders);
      closeAcceptModal();
      props.onToast?.(
        'ok',
        `Held ${props.formatTonnes(result.kg)} for ${result.hold.destIcao} at ${result.hold.originIcao}`,
      );
    } catch (err) {
      props.onToast?.(
        'fail',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onConfirmDispatchHold() {
    if (!dispatchHold || !dispatchAircraftId || props.busy || loading) return;
    if (dispatchMode === 'shuttle' && !canPortDeskOps) {
      props.onToast?.(
        'fail',
        'Owner or dispatcher only — dispatch a Port shuttle',
      );
      setDispatchMode('fly');
      return;
    }
    if (props.clientUpdateRequiredMin) {
      props.onToast?.(
        'fail',
        formatClientUpdateRequiredLabel(props.clientUpdateRequiredMin),
      );
      return;
    }
    setLoading(true);
    const paintOpsResult = (fleet: PlayerAircraft[], walletUsd: number) => {
      const vaTail = props.vaAircraftIds?.has(dispatchAircraftId);
      if (vaTail) {
        props.onVaFleet?.(fleet);
        props.onVaWallet?.(walletUsd);
      } else {
        props.onWallet?.(walletUsd);
        props.onFleet?.(fleet);
      }
    };
    const opsCompanyId = props.resolveOpsCompanyId?.(dispatchAircraftId);
    try {
      await props.ensureOpsCompany?.(dispatchAircraftId);
      if (dispatchHold.kind === 'bridge' && dispatchMode === 'shuttle') {
        const result = await postPortShuttle({
          action: 'dispatch',
          holdId: dispatchHold.id,
          aircraftId: dispatchAircraftId,
        });
        if (result.walletUsd != null && result.fleet) {
          paintOpsResult(result.fleet, result.walletUsd);
        } else {
          if (result.walletUsd != null) props.onWallet?.(result.walletUsd);
          if (result.fleet) props.onFleet?.(result.fleet);
        }
        if (result.missions) props.onMissions?.(result.missions.slice().reverse());
        if (result.warehouses) setWarehouses(result.warehouses);
        setDispatchHold(null);
        setDispatchAircraftId('');
        setDispatchMode('fly');
        setShuttleQuote(null);
        props.onToast?.(
          'ok',
          `Port shuttle ${result.mission?.originIcao}→${result.mission?.destIcao} · ${props.formatTonnes(result.kg ?? 0)} · fee ${props.formatMoney(result.feeUsd ?? 0)}`,
        );
      } else if (dispatchHold.kind === 'bridge') {
        const result = await postWarehouseBridgeDispatchHold({
          holdId: dispatchHold.id,
          aircraftId: dispatchAircraftId,
          companyId: opsCompanyId,
        });
        paintOpsResult(result.fleet, result.walletUsd);
        props.onMissions?.(result.missions.slice().reverse());
        setWarehouses(result.warehouses);
        setDispatchHold(null);
        setDispatchAircraftId('');
        setDispatchMode('fly');
        setShuttleQuote(null);
        props.onToast?.(
          'ok',
          `${
            (result.pilotPayUsd ?? result.mission.payUsd ?? 0) > 0
              ? 'Internal haul'
              : 'Bridge'
          } ${result.mission.originIcao}→${result.mission.destIcao} · ${props.formatTonnes(result.kg)}${
            (result.pilotPayUsd ?? 0) > 0
              ? ` · pilot ${props.formatMoney(result.pilotPayUsd ?? 0)}`
              : ''
          } · open Dispatch`,
        );
        props.onStaged?.(result.mission);
      } else if (dispatchHold.kind === 'haul') {
        const result = await postWarehouseHaulDispatchHold({
          holdId: dispatchHold.id,
          aircraftId: dispatchAircraftId,
          companyId: opsCompanyId,
        });
        paintOpsResult(result.fleet, result.walletUsd);
        props.onMissions?.(result.missions.slice().reverse());
        setWarehouses(result.warehouses);
        setDispatchHold(null);
        setDispatchAircraftId('');
        props.onToast?.(
          'ok',
          `Haul ${result.mission.originIcao}→${result.mission.destIcao} · ${props.formatTonnes(result.kg)} · ${props.formatMoney(result.payUsd)} · open Dispatch`,
        );
        props.onStaged?.(result.mission);
      } else {
        const result = await postDemandDispatchHold({
          holdId: dispatchHold.id,
          aircraftId: dispatchAircraftId,
          companyId: opsCompanyId,
        });
        paintOpsResult(result.fleet, result.walletUsd);
        props.onMissions?.(result.missions.slice().reverse());
        setWarehouses(result.warehouses);
        setDemand(result.demand.orders);
        setDispatchHold(null);
        setDispatchAircraftId('');
        props.onToast?.(
          'ok',
          `Demand ${result.mission.originIcao}→${result.mission.destIcao} · ${props.formatTonnes(result.kg)} · ${props.formatMoney(result.payUsd)} · open Dispatch`,
        );
        props.onStaged?.(result.mission);
      }
    } catch (err) {
      props.onToast?.(
        'fail',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onReleaseDemandHold(hold: PlayerDemandHoldView) {
    setLoading(true);
    try {
      if (hold.kind === 'bridge') {
        const result = await postWarehouseBridgeHoldCancel({ holdId: hold.id });
        setWarehouses(result.warehouses);
        props.onToast?.(
          'ok',
          `Released ${props.formatTonnes(result.kg)} bridge hold`,
        );
      } else if (hold.kind === 'haul') {
        const result = await postWarehouseHaulHoldCancel({ holdId: hold.id });
        setWarehouses(result.warehouses);
        props.onToast?.(
          'ok',
          `Released ${props.formatTonnes(result.kg)} haul hold`,
        );
      } else {
        const result = await postDemandHoldCancel({ holdId: hold.id });
        setWarehouses(result.warehouses);
        setDemand(result.demand.orders);
        props.onToast?.(
          'ok',
          `Released ${props.formatTonnes(result.kg)} back to the Demand Board`,
        );
      }
    } catch (err) {
      props.onToast?.(
        'fail',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onConfirmBridge() {
    if (!bridgeDraft || !bridgeDest || props.busy || loading) return;
    if (bridgeMode === 'fly' && !bridgeAircraftId) return;
    if (bridgeMode === 'fly' && props.clientUpdateRequiredMin) {
      props.onToast?.(
        'fail',
        formatClientUpdateRequiredLabel(props.clientUpdateRequiredMin),
      );
      return;
    }
    setLoading(true);
    try {
      const pilotPayUsd =
        bridgePilotPayUsd == null
          ? bridgePayQuote?.suggestedPayUsd
          : bridgePilotPayUsd;
      if (bridgeMode === 'hold') {
        const result = await postWarehouseBridgeHold({
          originIcao: bridgeDraft.originIcao,
          destIcao: bridgeDest,
          commodityId: bridgeDraft.commodityId,
          pilotPayUsd: pilotPayUsd ?? undefined,
        });
        setWarehouses(result.warehouses);
        setBridgeDraft(null);
        props.onToast?.(
          'ok',
          `Held ${props.formatTonnes(result.kg)} Internal haul ${result.hold.originIcao}→${result.hold.destIcao}${
            (result.pilotPayUsd ?? 0) > 0
              ? ` · pilot ${props.formatMoney(result.pilotPayUsd ?? 0)}`
              : ' · unpaid'
          }`,
        );
      } else {
        await props.ensureOpsCompany?.(bridgeAircraftId);
        const result = await postWarehouseBridgeAccept({
          originIcao: bridgeDraft.originIcao,
          destIcao: bridgeDest,
          commodityId: bridgeDraft.commodityId,
          aircraftId: bridgeAircraftId,
          pilotPayUsd: pilotPayUsd ?? undefined,
          companyId: props.resolveOpsCompanyId?.(bridgeAircraftId),
        });
        const vaTail = props.vaAircraftIds?.has(bridgeAircraftId);
        if (vaTail) {
          props.onVaFleet?.(result.fleet);
          props.onVaWallet?.(result.walletUsd);
        } else {
          props.onWallet?.(result.walletUsd);
          props.onFleet?.(result.fleet);
        }
        props.onMissions?.(result.missions.slice().reverse());
        setWarehouses(result.warehouses);
        setBridgeDraft(null);
        props.onToast?.(
          'ok',
          `Internal haul ${result.mission.originIcao}→${result.mission.destIcao} · ${props.formatTonnes(result.kg)}${
            (result.pilotPayUsd ?? 0) > 0
              ? ` · pilot ${props.formatMoney(result.pilotPayUsd ?? 0)}`
              : ''
          } · open Dispatch`,
        );
        props.onStaged?.(result.mission);
      }
    } catch (err) {
      props.onToast?.(
        'fail',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  async function onConfirmHaul() {
    if (!haulDraft || !haulDest.trim() || props.busy || loading) return;
    if (haulMode === 'fly' && !haulAircraftId) return;
    if (haulKg <= 0) {
      props.onToast?.('fail', 'Enter a haul amount greater than zero');
      return;
    }
    if (
      haulMode === 'fly' &&
      haulOpsMaxCargoKg != null &&
      haulKg > haulOpsMaxCargoKg
    ) {
      props.onToast?.(
        'fail',
        `Haul ${haulKg} kg exceeds this airframe's ${haulOpsMaxCargoKg} kg ops cap for ${haulDraft.originIcao}→${haulDest.trim().toUpperCase()}`,
      );
      return;
    }
    if (haulMode === 'fly' && props.clientUpdateRequiredMin) {
      props.onToast?.(
        'fail',
        formatClientUpdateRequiredLabel(props.clientUpdateRequiredMin),
      );
      return;
    }
    setLoading(true);
    try {
      const dest = haulDest.trim().toUpperCase();
      if (haulMode === 'hold') {
        const result = await postWarehouseHaulHold({
          originIcao: haulDraft.originIcao,
          destIcao: dest,
          commodityId: haulDraft.commodityId,
          kg: haulKg,
        });
        setWarehouses(result.warehouses);
        setHaulDraft(null);
        setHaulPayQuote(null);
        props.onToast?.(
          'ok',
          `Held ${props.formatTonnes(result.kg)} haul ${result.hold.originIcao}→${result.hold.destIcao} · ${props.formatMoney(result.payUsd)}`,
        );
      } else {
        await props.ensureOpsCompany?.(haulAircraftId);
        const result = await postWarehouseHaulAccept({
          originIcao: haulDraft.originIcao,
          destIcao: dest,
          commodityId: haulDraft.commodityId,
          aircraftId: haulAircraftId,
          kg: haulKg,
          companyId: props.resolveOpsCompanyId?.(haulAircraftId),
        });
        const vaTail = props.vaAircraftIds?.has(haulAircraftId);
        if (vaTail) {
          props.onVaFleet?.(result.fleet);
          props.onVaWallet?.(result.walletUsd);
        } else {
          props.onWallet?.(result.walletUsd);
          props.onFleet?.(result.fleet);
        }
        props.onMissions?.(result.missions.slice().reverse());
        setWarehouses(result.warehouses);
        setHaulDraft(null);
        setHaulPayQuote(null);
        props.onToast?.(
          'ok',
          `Haul ${result.mission.originIcao}→${result.mission.destIcao} · ${props.formatTonnes(result.kg)} · ${props.formatMoney(result.payUsd)} · open Dispatch`,
        );
        props.onStaged?.(result.mission);
      }
    } catch (err) {
      props.onToast?.(
        'fail',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }

  function formatUnitPrice(usdPerKg: number): string {
    const perDisplay =
      props.weightSystem === 'imperial' ? usdPerKg / KG_TO_LB : usdPerKg;
    return `$${perDisplay.toFixed(2)}/${unit}`;
  }

  function freeKgAtHub(hubIcao: string): number {
    const hub = hubIcao.trim().toUpperCase();
    const wh = (warehouses?.warehouses ?? []).find(
      (w) => w.icao.trim().toUpperCase() === hub,
    );
    return wh?.inboundFreeKg ?? wh?.freeKg ?? 0;
  }

  function canStoreAtHub(hubIcao: string, needKg?: number): boolean {
    const free = freeKgAtHub(hubIcao);
    if (needKg == null) return free > 0;
    return free >= needKg;
  }

  /** All pickup hubs for this port (yard + stevedore). */
  const portPickupHubs = useMemo(() => {
    const hubs = port?.pickupHubs ?? [];
    if (hubs.length > 0) return hubs.map((h) => h.toUpperCase());
    return warehouses?.pickupHubs ?? [
      'SBGR',
      'SBKP',
      'SBCT',
      'SBRF',
      'SBEG',
      'SBPA',
      'SBBE',
      'SAEZ',
      'SAVC',
      'SCEL',
      'SCTE',
      'KMIA',
      'KEWR',
      'KIAH',
      'KLAX',
      'KSEA',
      'CYVR',
      'CYHZ',
      'MMVR',
      'MMZO',
      'MMUN',
    ];
  }, [port?.pickupHubs, warehouses?.pickupHubs]);

  /** Warehouses eligible for this port's desk auto-buy (desk pickup hub only). */
  const deskPickupWarehouses = useMemo(() => {
    const desk = resolvePortDeskPickupHub(port?.pickupHubs);
    if (!desk) return [];
    return (warehouses?.warehouses ?? []).filter(
      (w) => w.icao.trim().toUpperCase() === desk,
    );
  }, [port?.pickupHubs, warehouses?.warehouses]);

  useEffect(() => {
    if (deskPickupWarehouses.length === 1) {
      const only = deskPickupWarehouses[0]!.id;
      if (deskWarehouseId !== only) setDeskWarehouseId(only);
      return;
    }
    if (
      deskWarehouseId &&
      !deskPickupWarehouses.some((w) => w.id === deskWarehouseId)
    ) {
      setDeskWarehouseId('');
    }
  }, [deskPickupWarehouses, deskWarehouseId]);

  const allOwnedWarehouses = useMemo(() => {
    return [...(warehouses?.warehouses ?? [])].sort((a, b) =>
      a.icao.localeCompare(b.icao),
    );
  }, [warehouses?.warehouses]);
  const ownedHubSet = useMemo(
    () =>
      new Set(
        (warehouses?.warehouses ?? []).map((w) => w.icao.trim().toUpperCase()),
      ),
    [warehouses?.warehouses],
  );

  const allBuyableHubs = useMemo(() => {
    const hubs = new Set<string>();
    for (const p of snap?.ports ?? []) {
      for (const h of p.pickupHubs ?? []) {
        const code = h.trim().toUpperCase();
        if (code) hubs.add(code);
      }
    }
    for (const h of warehouses?.pickupHubs ?? []) {
      const code = h.trim().toUpperCase();
      if (code) hubs.add(code);
    }
    return [...hubs]
      .filter((icao) => !ownedHubSet.has(icao))
      .sort((a, b) => a.localeCompare(b));
  }, [snap?.ports, warehouses?.pickupHubs, ownedHubSet]);
  const portPickups = useMemo(
    () =>
      (snap?.pickups ?? []).filter((p) =>
        portPickupHubs.includes(p.hubIcao.trim().toUpperCase()),
      ),
    [snap?.pickups, portPickupHubs],
  );
  const portForHub = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const p of snap?.ports ?? []) {
      for (const hub of p.pickupHubs ?? []) {
        const key = hub.trim().toUpperCase();
        if (!key || map.has(key)) continue;
        map.set(key, { id: p.id, name: p.name });
      }
    }
    return map;
  }, [snap?.ports]);
  const selectedPortPickupSet = useMemo(() => {
    return new Set(portDeskPickupHubList(port?.pickupHubs));
  }, [port?.pickupHubs]);

  const filteredBuyableHubs = useMemo(() => {
    const q = buyHubQuery.trim().toLowerCase();
    const matched = !q
      ? allBuyableHubs
      : allBuyableHubs.filter((icao) => {
          const name = (portForHub.get(icao)?.name ?? '').toLowerCase();
          return icao.toLowerCase().includes(q) || name.includes(q);
        });
    return [...matched].sort((a, b) => {
      const aPort = selectedPortPickupSet.has(a) ? 0 : 1;
      const bPort = selectedPortPickupSet.has(b) ? 0 : 1;
      if (aPort !== bPort) return aPort - bPort;
      return a.localeCompare(b);
    });
  }, [allBuyableHubs, buyHubQuery, portForHub, selectedPortPickupSet]);
  const allWarehouseStock = useMemo(() => {
    const whById = new Map(
      (warehouses?.warehouses ?? []).map((w) => [w.id, w]),
    );
    return (warehouses?.stock ?? [])
      .filter((s) => s.kg > 0 && whById.has(s.warehouseId))
      .slice()
      .sort((a, b) => {
        const icaoA = whById.get(a.warehouseId)?.icao ?? '';
        const icaoB = whById.get(b.warehouseId)?.icao ?? '';
        if (icaoA !== icaoB) return icaoA.localeCompare(icaoB);
        if (a.commodityId !== b.commodityId) {
          return a.commodityId.localeCompare(b.commodityId);
        }
        if (a.avgCostUsdPerKg !== b.avgCostUsdPerKg) {
          return a.avgCostUsdPerKg - b.avgCostUsdPerKg;
        }
        return a.acquiredAtTick - b.acquiredAtTick;
      });
  }, [warehouses]);
  const ownedWarehousesAtPort = useMemo(() => {
    if (!port) return allOwnedWarehouses;
    const portIdSel = port.id;
    return allOwnedWarehouses.filter((w) => {
      const icao = w.icao.trim().toUpperCase();
      if (selectedPortPickupSet.has(icao)) return true;
      return portForHub.get(icao)?.id === portIdSel;
    });
  }, [port, allOwnedWarehouses, selectedPortPickupSet, portForHub]);
  const ownedWarehousesInScope = allOwnedWarehouses;
  const ownedStockAtSelectedPort = useMemo(() => {
    const allowed = new Set(ownedWarehousesInScope.map((w) => w.id));
    return allWarehouseStock.filter((s) => allowed.has(s.warehouseId));
  }, [allWarehouseStock, ownedWarehousesInScope]);
  const heldOrderIds = useMemo(
    () =>
      new Set(
        (warehouses?.demandHolds ?? [])
          .filter(
            (h) =>
              (h.kind ?? 'demand') !== 'bridge' &&
              h.kind !== 'haul' &&
              Boolean(h.orderId),
          )
          .map((h) => h.orderId!),
      ),
    [warehouses?.demandHolds],
  );
  const holdsAtSelectedPort = useMemo(() => {
    const holds = warehouses?.demandHolds ?? [];
    const allowedIcaos = new Set(
      ownedWarehousesInScope.map((w) => w.icao.trim().toUpperCase()),
    );
    if (ownedWarehousesInScope.length === 0) return [];
    return holds.filter((h) =>
      allowedIcaos.has(h.originIcao.trim().toUpperCase()),
    );
  }, [warehouses?.demandHolds, ownedWarehousesInScope]);
  const warehouseFocusPorts = useMemo(() => {
    const focusIcao = selectedOwnedHubIcao?.trim().toUpperCase();
    if (focusIcao) {
      const linked = portForHub.get(focusIcao);
      if (linked) {
        const match = mapPorts.filter(
          (p) => p.id.toUpperCase() === linked.id.toUpperCase(),
        );
        if (match.length > 0) return match;
      }
    }
    const ids = new Set<string>();
    for (const w of warehouses?.warehouses ?? []) {
      const linked = portForHub.get(w.icao.trim().toUpperCase());
      if (linked?.id) ids.add(linked.id);
    }
    if (ids.size === 0) return mapPorts;
    return mapPorts.filter((p) => ids.has(p.id));
  }, [
    mapPorts,
    warehouses?.warehouses,
    portForHub,
    selectedOwnedHubIcao,
  ]);
  const warehouseFocusFbos = useMemo(() => {
    const allowed = new Set(
      ownedWarehousesInScope.map((w) => w.icao.trim().toUpperCase()),
    );
    return mapWarehouses.filter((f) =>
      allowed.has(f.icao.trim().toUpperCase()),
    );
  }, [mapWarehouses, ownedWarehousesInScope]);
  const warehouseBridgeLegs = useMemo(() => {
    const coords = new Map<string, { lat: number; lon: number }>();
    for (const p of mapPorts) {
      for (const h of p.pickupHubDetails ?? []) {
        const icao = h.icao.trim().toUpperCase();
        if (icao && Number.isFinite(h.lat) && Number.isFinite(h.lon)) {
          coords.set(icao, { lat: h.lat, lon: h.lon });
        }
      }
    }
    const scoped = new Set(
      ownedWarehousesInScope.map((w) => w.icao.trim().toUpperCase()),
    );
    const legs: Array<{
      originIcao: string;
      destIcao: string;
      origin: { lat: number; lon: number };
      dest: { lat: number; lon: number };
    }> = [];
    for (const h of warehouses?.demandHolds ?? []) {
      if ((h.kind ?? 'demand') !== 'bridge') continue;
      const origin = h.originIcao.trim().toUpperCase();
      const dest = h.destIcao.trim().toUpperCase();
      if (origin === dest) continue;
      if (scoped.size > 0 && !scoped.has(origin) && !scoped.has(dest)) continue;
      const o = coords.get(origin);
      const d = coords.get(dest);
      if (!o || !d) continue;
      legs.push({ originIcao: origin, destIcao: dest, origin: o, dest: d });
    }
    return legs;
  }, [mapPorts, warehouses?.demandHolds, ownedWarehousesInScope]);

  const scoutRouteFocus = useMemo(() => {
    if (!scoutFocusId) return null;
    const haul = scoutHaulSuggestions.find((s) => s.id === scoutFocusId);
    if (haul) {
      return {
        kind: 'haul' as const,
        id: haul.id,
        originIcao: haul.originIcao,
        destIcao: haul.destIcao,
        originLat: haul.originLat,
        originLon: haul.originLon,
        destLat: haul.destLat,
        destLon: haul.destLon,
      };
    }
    const bridge = scoutSuggestions.find((s) => s.id === scoutFocusId);
    if (bridge) {
      return {
        kind: 'bridge' as const,
        id: bridge.id,
        originIcao: bridge.originIcao,
        destIcao: bridge.destIcao,
        originLat: bridge.originLat,
        originLon: bridge.originLon,
        destLat: bridge.destLat,
        destLon: bridge.destLon,
      };
    }
    const demandRow = scoutDemandSuggestions.find(
      (s) => s.id === scoutFocusId,
    );
    if (demandRow) {
      return {
        kind: 'demand' as const,
        id: demandRow.id,
        originIcao: demandRow.originIcao,
        destIcao: demandRow.destIcao,
        originLat: demandRow.originLat,
        originLon: demandRow.originLon,
        destLat: demandRow.destLat,
        destLon: demandRow.destLon,
      };
    }
    return null;
  }, [
    scoutFocusId,
    scoutHaulSuggestions,
    scoutSuggestions,
    scoutDemandSuggestions,
  ]);

  const scoutRouteLegs = useMemo(() => {
    if (!scoutRouteFocus) return [];
    const coords = new Map<string, { lat: number; lon: number }>();
    for (const p of mapPorts) {
      for (const h of p.pickupHubDetails ?? []) {
        const icao = h.icao.trim().toUpperCase();
        if (icao && Number.isFinite(h.lat) && Number.isFinite(h.lon)) {
          coords.set(icao, { lat: h.lat, lon: h.lon });
        }
      }
    }
    for (const w of mapWarehouses) {
      const icao = w.icao.trim().toUpperCase();
      if (
        icao &&
        typeof w.lat === 'number' &&
        typeof w.lon === 'number' &&
        Number.isFinite(w.lat) &&
        Number.isFinite(w.lon)
      ) {
        coords.set(icao, { lat: w.lat, lon: w.lon });
      }
    }
    const origin = scoutRouteFocus.originIcao.trim().toUpperCase();
    const dest = scoutRouteFocus.destIcao.trim().toUpperCase();
    const o =
      scoutRouteFocus.originLat != null &&
      scoutRouteFocus.originLon != null &&
      Number.isFinite(scoutRouteFocus.originLat) &&
      Number.isFinite(scoutRouteFocus.originLon)
        ? {
            lat: scoutRouteFocus.originLat,
            lon: scoutRouteFocus.originLon,
          }
        : coords.get(origin);
    const d =
      scoutRouteFocus.destLat != null &&
      scoutRouteFocus.destLon != null &&
      Number.isFinite(scoutRouteFocus.destLat) &&
      Number.isFinite(scoutRouteFocus.destLon)
        ? { lat: scoutRouteFocus.destLat, lon: scoutRouteFocus.destLon }
        : coords.get(dest);
    if (!o || !d) return [];
    return [
      {
        originIcao: origin,
        destIcao: dest,
        origin: o,
        dest: d,
      },
    ];
  }, [scoutRouteFocus, mapPorts, mapWarehouses]);

  const scoutMergedRows = useMemo(() => {
    type Row =
      | {
          kind: 'haul';
          id: string;
          score: number;
          originIcao: string;
          destIcao: string;
          commodityId: string;
          kg: number;
          distanceNm: number;
          payUsd: number | null;
          destFillPct: number | null;
          raw: PortScoutHaulSuggestion;
        }
      | {
          kind: 'demand';
          id: string;
          score: number;
          originIcao: string;
          destIcao: string;
          commodityId: string;
          kg: number;
          distanceNm: number;
          payUsd: number | null;
          destFillPct: null;
          raw: PortScoutDemandSuggestion;
        }
      | {
          kind: 'bridge';
          id: string;
          score: number;
          originIcao: string;
          destIcao: string;
          commodityId: string;
          kg: number;
          distanceNm: number;
          payUsd: null;
          destFillPct: null;
          raw: PortScoutBridgeSuggestion;
        };
    const rows: Row[] = [
      ...scoutHaulSuggestions.map((s) => ({
        kind: 'haul' as const,
        id: s.id,
        score: s.score,
        originIcao: s.originIcao,
        destIcao: s.destIcao,
        commodityId: s.commodityId,
        kg: s.kg,
        distanceNm: s.distanceNm,
        payUsd: s.payUsd,
        destFillPct: s.destFillPct,
        raw: s,
      })),
      ...scoutDemandSuggestions.map((s) => ({
        kind: 'demand' as const,
        id: s.id,
        score: s.score,
        originIcao: s.originIcao,
        destIcao: s.destIcao,
        commodityId: s.commodityId,
        kg: s.kg,
        distanceNm: s.distanceNm,
        payUsd: s.payUsd,
        destFillPct: null,
        raw: s,
      })),
      ...scoutSuggestions.map((s) => ({
        kind: 'bridge' as const,
        id: s.id,
        score: s.score,
        originIcao: s.originIcao,
        destIcao: s.destIcao,
        commodityId: s.commodityId,
        kg: s.kg,
        distanceNm: s.distanceNm,
        payUsd: null,
        destFillPct: null,
        raw: s,
      })),
    ];
    rows.sort(
      (a, b) =>
        b.score - a.score ||
        a.distanceNm - b.distanceNm ||
        a.id.localeCompare(b.id),
    );
    const kindFiltered =
      scoutFilter === 'all' ? rows : rows.filter((r) => r.kind === scoutFilter);
    return kindFiltered;
  }, [
    scoutHaulSuggestions,
    scoutDemandSuggestions,
    scoutSuggestions,
    scoutFilter,
  ]);

  useEffect(() => {
    const ids = new Set(scoutMergedRows.map((r) => r.id));
    // Keep ids from all lists so focus survives filter changes.
    for (const s of scoutHaulSuggestions) ids.add(s.id);
    for (const s of scoutDemandSuggestions) ids.add(s.id);
    for (const s of scoutSuggestions) ids.add(s.id);
    // Do not auto-pick the first Scout row — route only after a click.
    if (scoutFocusId && !ids.has(scoutFocusId)) {
      setScoutFocusId(null);
    }
  }, [
    scoutFocusId,
    scoutMergedRows,
    scoutHaulSuggestions,
    scoutSuggestions,
    scoutDemandSuggestions,
  ]);

  function focusScoutRow(id: string) {
    setScoutFocusId((prev) => (prev === id ? null : id));
    setScoutFocusToken((n) => n + 1);
  }

  const dispatchAircraftOptions = useMemo(() => {
    if (!dispatchHold) return [];
    const hub = dispatchHold.originIcao.trim().toUpperCase();
    return props.fleet.filter((a) => {
      if (
        a.status !== 'parked' ||
        a.locationIcao.trim().toUpperCase() !== hub
      ) {
        return false;
      }
      if (dispatchMode === 'shuttle') {
        return (
          a.aircraftClassId === 'light_ga' ||
          a.aircraftClassId === 'light_turboprop'
        );
      }
      return true;
    });
  }, [props.fleet, dispatchHold, dispatchMode]);

  useEffect(() => {
    if (
      !dispatchHold ||
      (dispatchHold.kind ?? 'demand') !== 'bridge' ||
      dispatchMode !== 'shuttle'
    ) {
      setShuttleQuote(null);
      return;
    }
    let cancelled = false;
    void postPortShuttle({ action: 'quote', holdId: dispatchHold.id })
      .then((res) => {
        if (!cancelled) setShuttleQuote(res.quote ?? null);
      })
      .catch(() => {
        if (!cancelled) setShuttleQuote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [dispatchHold, dispatchMode]);

  useEffect(() => {
    if (!dispatchHold || dispatchAircraftOptions.length === 0) return;
    if (
      dispatchAircraftId &&
      dispatchAircraftOptions.some((a) => a.id === dispatchAircraftId)
    ) {
      return;
    }
    setDispatchAircraftId(dispatchAircraftOptions[0]?.id ?? '');
  }, [dispatchHold, dispatchMode, dispatchAircraftOptions, dispatchAircraftId]);

  const bridgeDestOptions = useMemo(() => {
    if (!bridgeDraft) return [];
    const origin = bridgeDraft.originIcao.trim().toUpperCase();
    return (warehouses?.warehouses ?? []).filter(
      (w) => w.icao.trim().toUpperCase() !== origin,
    );
  }, [bridgeDraft, warehouses?.warehouses]);
  const bridgeAircraftOptions = useMemo(() => {
    if (!bridgeDraft || bridgeMode !== 'fly') return [];
    const hub = bridgeDraft.originIcao.trim().toUpperCase();
    return props.fleet.filter(
      (a) =>
        a.status === 'parked' &&
        a.locationIcao.trim().toUpperCase() === hub,
    );
  }, [props.fleet, bridgeDraft, bridgeMode]);
  const haulAircraftOptions = useMemo(() => {
    if (!haulDraft || haulMode !== 'fly') return [];
    const hub = haulDraft.originIcao.trim().toUpperCase();
    return props.fleet.filter(
      (a) =>
        a.status === 'parked' &&
        a.locationIcao.trim().toUpperCase() === hub,
    );
  }, [props.fleet, haulDraft, haulMode]);
  const selectedStock = useMemo(() => {
    if (!selectedStockId) return null;
    return allWarehouseStock.find((s) => s.id === selectedStockId) ?? null;
  }, [allWarehouseStock, selectedStockId]);
  const highlightedHubIcao = useMemo(() => {
    if (selectedStock) {
      const wh = (warehouses?.warehouses ?? []).find(
        (w) => w.id === selectedStock.warehouseId,
      );
      return wh?.icao.trim().toUpperCase() ?? null;
    }
    return selectedOwnedHubIcao?.trim().toUpperCase() || null;
  }, [selectedStock, selectedOwnedHubIcao, warehouses?.warehouses]);
  const highlightPortId = useMemo(() => {
    if (!highlightedHubIcao) return null;
    return portForHub.get(highlightedHubIcao)?.id ?? null;
  }, [highlightedHubIcao, portForHub]);
  const focusedOwnedWarehouse = useMemo(() => {
    const code = highlightedHubIcao;
    if (code) {
      const hit = ownedWarehousesInScope.find(
        (w) => w.icao.trim().toUpperCase() === code,
      );
      if (hit) return hit;
    }
    return ownedWarehousesInScope[0] ?? null;
  }, [highlightedHubIcao, ownedWarehousesInScope]);
  const staffFocusWarehouse = useMemo(() => {
    const list = warehouses?.warehouses ?? [];
    if (list.length === 0) return null;
    if (highlightedHubIcao) {
      const hit = list.find(
        (w) => w.icao.trim().toUpperCase() === highlightedHubIcao,
      );
      if (hit) return hit;
    }
    return list[0] ?? null;
  }, [warehouses?.warehouses, highlightedHubIcao]);
  const staffFocusMeta = staffFocusWarehouse
    ? groundStaff?.byWarehouse[staffFocusWarehouse.id]
    : undefined;
  const staffSlotsUnlocked = staffFocusWarehouse
    ? (staffFocusMeta?.slotsUnlocked ??
      warehouseStaffSlotsUnlocked(staffFocusWarehouse.tier))
    : 0;
  const staffSlotsUsed = staffFocusMeta?.slotsUsed ?? 0;
  const staffSlotsFree = staffFocusWarehouse
    ? (staffFocusMeta?.slotsFree ??
      Math.max(0, staffSlotsUnlocked - staffSlotsUsed))
    : 0;
  const staffHirePool =
    staffFocusWarehouse && groundStaff
      ? (groundStaff.hirePoolByHub[
          staffFocusWarehouse.icao.trim().toUpperCase()
        ] ?? [])
      : [];
  const buyUsdByIcao = warehouses?.buyUsdByIcao ?? {};

  useEffect(() => {
    if (whShelf !== 'staff') return;
    if (!staffFocusWarehouse) return;
    if (staffSlotsFree <= 0) return;
    if (staffHirePool.length > 0) {
      staffDeskRetryKeyRef.current = null;
      return;
    }
    const key = staffFocusWarehouse.id;
    if (staffDeskRetryKeyRef.current === key) return;
    staffDeskRetryKeyRef.current = key;
    let cancelled = false;
    void fetchWarehouses()
      .then((next) => {
        if (cancelled) return;
        setWarehouses(next);
        if (next.groundStaff) setGroundStaff(next.groundStaff);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [whShelf, staffFocusWarehouse, staffSlotsFree, staffHirePool.length]);

  /** Exact-operator Port FBO — hide Network desk until this company claims one or owns WH. */
  const hasOwnedPortFbo = useMemo(
    () =>
      (snap?.ports ?? []).some((p) => p.concession?.status === 'yours'),
    [snap?.ports],
  );
  const hasNetworkAssets = hasOwnedPortFbo || allOwnedWarehouses.length > 0;

  const demandHoldsByHub = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of warehouses?.demandHolds ?? []) {
      if ((h.kind ?? 'demand') === 'bridge' || h.kind === 'haul') continue;
      const icao = h.originIcao.trim().toUpperCase();
      if (!icao) continue;
      map.set(icao, (map.get(icao) ?? 0) + 1);
    }
    return map;
  }, [warehouses?.demandHolds]);

  const companyNetworkNodes = useMemo((): CompanyNetworkNode[] => {
    if (!snap) return [];
    const cid = props.logisticsCompanyId?.trim() || '';
    const base = buildCompanyNetworkNodes(snap, cid);
    return base.map((n) => {
      if (n.kind !== 'wh') return n;
      const holds = demandHoldsByHub.get(n.primaryHubIcao) ?? 0;
      return holds > 0 ? { ...n, badge: String(holds) } : n;
    });
  }, [snap, props.logisticsCompanyId, demandHoldsByHub]);

  const filteredNetworkNodes = useMemo(() => {
    const q = networkSearch.trim().toLowerCase();
    if (!q) return companyNetworkNodes;
    return companyNetworkNodes.filter((n) => {
      const hay = `${n.title} ${n.subtitle} ${n.primaryHubIcao} ${n.hubIcaos.join(' ')} ${n.portId ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [companyNetworkNodes, networkSearch]);

  const selectedNetworkNode = useMemo(
    () => findNetworkNode(companyNetworkNodes, selectedNetworkId),
    [companyNetworkNodes, selectedNetworkId],
  );

  const scoutHighlightRoute = useMemo(() => {
    if (!scoutRouteFocus) return null;
    const o = scoutRouteFocus;
    if (
      !(
        Number.isFinite(o.originLat) &&
        Number.isFinite(o.originLon) &&
        Number.isFinite(o.destLat) &&
        Number.isFinite(o.destLon)
      )
    ) {
      return null;
    }
    return {
      originIcao: o.originIcao,
      destIcao: o.destIcao,
      originLat: o.originLat!,
      originLon: o.originLon!,
      destLat: o.destLat!,
      destLon: o.destLon!,
    };
  }, [scoutRouteFocus]);

  /** Soft Demand corridor disk on Network map when an FBO is selected (P1/P2). */
  const networkCorridorRing = useMemo(() => {
    if (networkSurface !== 'fbo') return null;
    const fbo = selectedNetworkNode;
    if (!fbo || fbo.kind !== 'fbo') return null;
    const pid = (fbo.portId ?? '').trim().toUpperCase();
    if (!pid) return null;
    const portRow =
      port?.id.trim().toUpperCase() === pid
        ? port
        : (snap?.ports ?? []).find((p) => p.id.trim().toUpperCase() === pid);
    if (!portRow) return null;
    const hubSet = new Set(
      (portRow.pickupHubs ?? []).map((h) => h.trim().toUpperCase()),
    );
    const tiers = (warehouses?.warehouses ?? [])
      .filter((w) => hubSet.has(w.icao.trim().toUpperCase()))
      .map((w) => w.tier);
    const { level } = resolveUiPortCorridorLevel({
      concessionStatus: portRow.concession?.status,
      concessionLevel: portRow.concession?.level,
      warehouseTiersAtPort: tiers,
    });
    const nm = corridorNmForLevel(level);
    if (nm == null) return null;
    const hubIcao = fbo.primaryHubIcao.trim().toUpperCase();
    const wh = companyNetworkNodes.find(
      (n) => n.kind === 'wh' && n.primaryHubIcao === hubIcao,
    );
    const lat = wh?.lat ?? fbo.lat;
    const lon = wh?.lon ?? fbo.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon, radiusNm: nm };
  }, [
    networkSurface,
    selectedNetworkNode,
    port,
    snap?.ports,
    warehouses?.warehouses,
    companyNetworkNodes,
  ]);

  /** First buyable pickup on the catalog-selected port (onboarding path). */
  const catalogBuyWarehouseHub = useMemo(() => {
    if (!port) return null;
    for (const h of port.pickupHubs ?? []) {
      const code = h.trim().toUpperCase();
      if (code && !ownedHubSet.has(code)) return code;
    }
    return null;
  }, [port, ownedHubSet]);

  /** Buyable hubs: this port's pickups first; search unlocks the world list. */
  const networkBuyableHubs = useMemo(() => {
    const q = buyHubQuery.trim().toLowerCase();
    if (!q) {
      const atPort = allBuyableHubs.filter((icao) =>
        selectedPortPickupSet.has(icao),
      );
      if (atPort.length > 0) return atPort;
    }
    return filteredBuyableHubs;
  }, [
    buyHubQuery,
    allBuyableHubs,
    selectedPortPickupSet,
    filteredBuyableHubs,
  ]);

  const didAutoNetworkRef = useRef(false);
  useEffect(() => {
    if (didAutoNetworkRef.current || !snap || !hasNetworkAssets) return;
    didAutoNetworkRef.current = true;
    setSection('network');
    if (filteredNetworkNodes.length === 1) {
      onSelectNetworkNode(filteredNetworkNodes[0]!.id);
    } else if (hasOwnedPortFbo) {
      const fbo = companyNetworkNodes.find((n) => n.kind === 'fbo');
      if (fbo) onSelectNetworkNode(fbo.id);
      else setNetworkSurface('wh');
    } else {
      setNetworkSurface('wh');
    }
  }, [
    snap,
    hasNetworkAssets,
    hasOwnedPortFbo,
    filteredNetworkNodes,
    companyNetworkNodes,
  ]);

  function openNetworkSurface(
    surface: 'fbo' | 'wh' | 'demand' | 'buy' | 'staff',
    opts?: { hubIcao?: string; networkId?: string | null; portId?: string },
  ) {
    setSection('network');
    setNetworkSurface(surface);
    if (surface === 'buy') {
      setWhShelf('buy');
      setSelectedStockId(null);
      setSelectedOwnedHubIcao(null);
      if (opts?.hubIcao) {
        setSelectedBuyHubIcao(opts.hubIcao.trim().toUpperCase());
      }
    } else if (surface === 'staff') {
      setWhShelf('staff');
      setSelectedBuyHubIcao(null);
      setSelectedStockId(null);
    } else if (surface === 'wh') {
      setWhShelf('owned');
      setSelectedBuyHubIcao(null);
    } else {
      setWhShelf('owned');
      setSelectedBuyHubIcao(null);
    }
    if (opts?.networkId !== undefined) {
      setSelectedNetworkId(opts.networkId);
    }
    if (opts?.hubIcao && surface !== 'buy') {
      const code = opts.hubIcao.trim().toUpperCase();
      setSelectedOwnedHubIcao(code);
      const linked = portForHub.get(code);
      if (linked) setPortId(linked.id);
      if (!opts.networkId) {
        const whNode = companyNetworkNodes.find(
          (n) => n.kind === 'wh' && n.primaryHubIcao === code,
        );
        if (whNode) setSelectedNetworkId(whNode.id);
      }
    } else if (opts?.hubIcao && surface === 'buy') {
      const linked = portForHub.get(opts.hubIcao.trim().toUpperCase());
      if (linked) setPortId(linked.id);
    }
    if (opts?.portId) setPortId(opts.portId);
  }

  function onSelectNetworkNode(id: string | null) {
    setSelectedNetworkId(id);
    if (!id) {
      setNetworkSurface('wh');
      return;
    }
    const node = findNetworkNode(companyNetworkNodes, id);
    if (!node) return;
    if (node.kind === 'fbo' && node.portId) {
      setPortId(node.portId);
      setNetworkSurface('fbo');
      setWhShelf('owned');
      const pickup = node.primaryHubIcao;
      if (pickup && ownedHubSet.has(pickup)) {
        setSelectedOwnedHubIcao(pickup);
      }
      return;
    }
    if (node.kind === 'wh') {
      openNetworkSurface('wh', {
        hubIcao: node.primaryHubIcao,
        networkId: node.id,
        portId: node.portId ?? undefined,
      });
    }
  }

  useEffect(() => {
    if (
      selectedStockId &&
      !ownedStockAtSelectedPort.some((s) => s.id === selectedStockId)
    ) {
      setSelectedStockId(null);
    }
  }, [ownedStockAtSelectedPort, selectedStockId]);

  useEffect(() => {
    if (whShelf !== 'owned') return;
    if (ownedWarehousesInScope.length === 0) return;
    const cur = selectedOwnedHubIcao?.trim().toUpperCase() ?? '';
    const inScope = ownedWarehousesInScope.some(
      (w) => w.icao.trim().toUpperCase() === cur,
    );
    if (!inScope) {
      setSelectedOwnedHubIcao(
        ownedWarehousesInScope[0]!.icao.trim().toUpperCase(),
      );
    }
  }, [whShelf, ownedWarehousesInScope, selectedOwnedHubIcao]);

  useEffect(() => {
    if (
      selectedBuyHubIcao &&
      !networkBuyableHubs.includes(selectedBuyHubIcao.trim().toUpperCase())
    ) {
      setSelectedBuyHubIcao(null);
    }
  }, [networkBuyableHubs, selectedBuyHubIcao]);

  function selectStockLot(stockId: string, hubIcao: string) {
    const next = selectedStockId === stockId ? null : stockId;
    setSelectedStockId(next);
    if (next) {
      const hub = hubIcao.trim().toUpperCase();
      setSelectedOwnedHubIcao(hub);
      const linkedPort = portForHub.get(hub);
      if (linkedPort) setPortId(linkedPort.id);
    }
  }

  function selectOwnedHub(icao: string) {
    const code = icao.trim().toUpperCase();
    setSelectedOwnedHubIcao(code);
    setSelectedStockId(null);
    const linkedPort = portForHub.get(code);
    if (linkedPort) setPortId(linkedPort.id);
    const whNode = companyNetworkNodes.find(
      (n) => n.kind === 'wh' && n.primaryHubIcao === code,
    );
    if (whNode) setSelectedNetworkId(whNode.id);
  }

  function openBridgeFromLot(originIcao: string, commodityId: string) {
    const origin = originIcao.trim().toUpperCase();
    setBridgeDraft({ originIcao: origin, commodityId });
    const dests = (warehouses?.warehouses ?? []).filter(
      (w) => w.icao.trim().toUpperCase() !== origin,
    );
    setBridgeDest(dests[0]?.icao.trim().toUpperCase() ?? '');
    setBridgeMode('hold');
    setBridgePilotPayUsd(null);
    setBridgePayQuote(null);
    const parked = props.fleet.filter(
      (a) =>
        a.status === 'parked' &&
        a.locationIcao.trim().toUpperCase() === origin,
    );
    setBridgeAircraftId(parked[0]?.id ?? '');
  }

  function openHaulFromLot(originIcao: string, commodityId: string) {
    const origin = originIcao.trim().toUpperCase();
    const wh = (warehouses?.warehouses ?? []).find(
      (w) => w.icao.trim().toUpperCase() === origin,
    );
    const stockKg = (warehouses?.stock ?? [])
      .filter(
        (s) =>
          s.warehouseId === wh?.id && s.commodityId === commodityId,
      )
      .reduce((sum, s) => sum + (s.kg ?? 0), 0);
    const reservedKg = (warehouses?.demandHolds ?? [])
      .filter(
        (h) =>
          h.warehouseId === wh?.id && h.commodityId === commodityId,
      )
      .reduce((sum, h) => sum + (h.kg ?? 0), 0);
    const free = warehouseFreeCommodityKgClient(stockKg, reservedKg);
    setHaulDraft({ originIcao: origin, commodityId });
    setHaulDest('');
    setHaulMode('hold');
    setHaulAmountText(
      String(Math.max(1, Math.floor(kgToDisplay(free, props.weightSystem)))),
    );
    setHaulPayQuote(null);
    setHaulOpsMaxCargoKg(null);
    const parked = props.fleet.filter(
      (a) =>
        a.status === 'parked' &&
        a.locationIcao.trim().toUpperCase() === origin,
    );
    setHaulAircraftId(parked[0]?.id ?? '');
  }

  function selectBuyHub(icao: string) {
    const code = icao.trim().toUpperCase();
    const next = selectedBuyHubIcao === code ? null : code;
    setSelectedBuyHubIcao(next);
    if (next) {
      const linkedPort = portForHub.get(next);
      if (linkedPort) setPortId(linkedPort.id);
    }
  }

  const portCorridorLevel = useMemo(() => {
    if (!port) return { level: 1 as const, source: 'wh' as const };
    const hubSet = new Set(
      (port.pickupHubs ?? []).map((h) => h.trim().toUpperCase()),
    );
    const tiers = (warehouses?.warehouses ?? [])
      .filter((w) => hubSet.has(w.icao.trim().toUpperCase()))
      .map((w) => w.tier);
    return resolveUiPortCorridorLevel({
      concessionStatus: port.concession?.status,
      concessionLevel: port.concession?.level,
      warehouseTiersAtPort: tiers,
    });
  }, [port, warehouses?.warehouses]);

  const portOperatorChip = useMemo(() => {
    const status = port?.concession?.status;
    const level = port?.concession?.level ?? 1;
    const name = port?.concession?.companyDisplayName?.trim();
    if (status === 'yours') {
      return name
        ? `Port FBO · P${level} · you`
        : `Port FBO · P${level} · you`;
    }
    if (status === 'held') {
      return name
        ? `Port FBO · P${level} · ${name}`
        : `Port FBO · P${level} · held`;
    }
    return 'Vacant';
  }, [
    port?.concession?.status,
    port?.concession?.level,
    port?.concession?.companyDisplayName,
  ]);

  const portLeaseDaysLeft = useMemo(
    () =>
      leaseDaysLeftFromTicks(
        port?.concession?.leasePaidThroughTick,
        props.economyTick,
      ),
    [port?.concession?.leasePaidThroughTick, props.economyTick],
  );

  useEffect(() => {
    setScoutFocusId(null);
  }, [port?.id]);

  const portDeskOrders = useMemo(() => {
    if (!port) return [] as DemandOrderView[];
    const pid = port.id.trim().toUpperCase();
    return demand.filter(
      (o) =>
        o.remainingKg > 0 &&
        (!o.status || o.status === 'open') &&
        (o.portId?.trim().toUpperCase() ?? '') === pid,
    );
  }, [demand, port]);

  /** Desk pickup hub → dest great-circle nm (Demand origin is always the port pickup). */
  const demandDistNmById = useMemo(() => {
    const map = new Map<string, number | null>();
    if (!port) return map;
    const deskIcao = resolvePortDeskPickupHub(port.pickupHubs);
    const detail = (port.pickupHubDetails ?? []).find(
      (h) => h.icao.trim().toUpperCase() === (deskIcao ?? ''),
    );
    const oLat = detail?.lat ?? port.lat;
    const oLon = detail?.lon ?? port.lon;
    if (
      oLat == null ||
      oLon == null ||
      !Number.isFinite(oLat) ||
      !Number.isFinite(oLon)
    ) {
      for (const o of portDeskOrders) map.set(o.id, null);
      return map;
    }
    const origin = { lat: oLat, lon: oLon };
    for (const o of portDeskOrders) {
      const dLat = o.destLat;
      const dLon = o.destLon;
      if (
        dLat == null ||
        dLon == null ||
        !Number.isFinite(dLat) ||
        !Number.isFinite(dLon)
      ) {
        map.set(o.id, null);
        continue;
      }
      map.set(
        o.id,
        Math.round(greatCircleDistanceNm(origin, { lat: dLat, lon: dLon })),
      );
    }
    return map;
  }, [port, portDeskOrders]);

  const demandDeskPickupIcao = resolvePortDeskPickupHub(port?.pickupHubs);

  const demandPortsForSwitcher = useMemo(() => {
    return snap?.ports ?? [];
  }, [snap?.ports]);

  const sortedDemand = useMemo(() => {
    const seen = new Set<string>();
    const unique: DemandOrderView[] = [];
    for (const order of portDeskOrders) {
      if (seen.has(order.id)) continue;
      seen.add(order.id);
      unique.push(order);
    }
    const country = demandCountryFilter.trim().toUpperCase();
    const filtered = country
      ? unique.filter((o) => demandDestCountryId(o) === country)
      : unique;
    return filtered.sort((a, b) =>
      compareDemandOrders(a, b, demandSort, demandDistNmById),
    );
  }, [
    portDeskOrders,
    demandSort,
    demandCountryFilter,
    demandDistNmById,
  ]);

  const demandCountryOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const o of portDeskOrders) {
      const id = demandDestCountryId(o);
      if (id) ids.add(id);
    }
    return [...ids].sort((a, b) => a.localeCompare(b));
  }, [portDeskOrders]);

  const demandPageCount = Math.max(
    1,
    Math.ceil(sortedDemand.length / DEMAND_PAGE_SIZE) || 1,
  );
  const safeDemandPage = Math.min(Math.max(1, demandPage), demandPageCount);
  const pagedDemand = useMemo(() => {
    const start = (safeDemandPage - 1) * DEMAND_PAGE_SIZE;
    return sortedDemand.slice(start, start + DEMAND_PAGE_SIZE);
  }, [sortedDemand, safeDemandPage]);
  const demandTableKey = `${safeDemandPage}:${demandSort.key}:${demandSort.direction}:${demandCountryFilter}:${port?.id ?? ''}:${portCorridorLevel.level}:${sortedDemand.length}`;

  useEffect(() => {
    if (demandPage > demandPageCount) setDemandPage(demandPageCount);
  }, [demandPage, demandPageCount]);

  useEffect(() => {
    setDemandPage(1);
  }, [demandCountryFilter, port?.id, portCorridorLevel.level]);

  useEffect(() => {
    if (
      demandCountryFilter &&
      !demandCountryOptions.includes(demandCountryFilter)
    ) {
      setDemandCountryFilter('');
    }
  }, [demandCountryFilter, demandCountryOptions]);

  function toggleDemandSort(key: DemandSortKey) {
    setDemandSort((current) => {
      if (current.key !== key) return { key, direction: 'asc' };
      return {
        key,
        direction: current.direction === 'asc' ? 'desc' : 'asc',
      };
    });
    setDemandPage(1);
  }

  function demandSortIndicator(key: DemandSortKey): string {
    if (demandSort.key !== key) return '↕';
    return demandSort.direction === 'asc' ? '↑' : '↓';
  }

  function demandAriaSort(
    key: DemandSortKey,
  ): 'ascending' | 'descending' | 'none' {
    if (demandSort.key !== key) return 'none';
    return demandSort.direction === 'asc' ? 'ascending' : 'descending';
  }

  return (
    <section
      className={
        props.embedded
          ? 'ports-panel ports-panel-embed'
          : 'panel ports-panel'
      }
    >
      {props.embedded ? null : (
      <div className="panel-head">
        <div>
          <h2>Ports & Demand</h2>
          <p>Seaport → warehouse → Demand.</p>
        </div>
        <button
          type="button"
          className="action ghost"
          disabled={props.busy || loading}
          onClick={() => void refresh().catch(() => undefined)}
        >
          Refresh
        </button>
      </div>
      )}

      {!snap ? (
        loadError ? (
          <p className="empty">Could not load ports — {loadError}</p>
        ) : (
          <BusyBlock label="Loading ports" />
        )
      ) : (
        <div className="ports-panel-body">
          <div
            className="fbo-mode-switcher"
            role="tablist"
            aria-label="Ports sections"
          >
            <button
              type="button"
              role="tab"
              aria-selected={section === 'catalog'}
              className={
                section === 'catalog' ? 'fbo-icao-chip active' : 'fbo-icao-chip'
              }
              disabled={props.busy || loading}
              onClick={() => setSection('catalog')}
            >
              Port catalog
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={section === 'network'}
              className={
                section === 'network'
                  ? 'fbo-icao-chip active'
                  : 'fbo-icao-chip'
              }
              disabled={props.busy || loading}
              title={
                hasNetworkAssets
                  ? undefined
                  : 'Opens Buy warehouse — Port FBO is optional'
              }
              onClick={() => {
                if (!hasNetworkAssets) {
                  openNetworkSurface('buy', {
                    portId: port?.id,
                    hubIcao: catalogBuyWarehouseHub ?? undefined,
                  });
                  return;
                }
                setSection('network');
                if (
                  selectedNetworkId == null &&
                  filteredNetworkNodes.length === 1
                ) {
                  onSelectNetworkNode(filteredNetworkNodes[0]!.id);
                } else if (
                  networkSurface === 'buy' ||
                  networkSurface === 'demand' ||
                  networkSurface === 'staff'
                ) {
                  /* keep surface */
                } else if (selectedNetworkNode?.kind === 'fbo') {
                  setNetworkSurface('fbo');
                } else {
                  setNetworkSurface('wh');
                  setWhShelf('owned');
                }
              }}
            >
              Network
              {companyNetworkNodes.length > 0
                ? ` (${companyNetworkNodes.length})`
                : ''}
            </button>
            {props.embedded ? (
              <button
                type="button"
                className="action ghost ports-embed-refresh"
                disabled={props.busy || loading}
                onClick={() => void refresh().catch(() => undefined)}
              >
                Refresh
              </button>
            ) : null}
          </div>

          {section === 'catalog' ? (
            <>
              {port ? (
                <h3 className="ports-selected-name ports-stage-title">
                  <span className="ports-selected-name-text">{port.name}</span>
                  <span
                    className={
                      port.concession?.status === 'yours'
                        ? 'tag ports-operator-badge ports-concession-status'
                        : port.concession?.status === 'held'
                          ? 'tag ports-concession-status'
                          : 'tag muted ports-concession-status'
                    }
                    title="Port FBO status"
                  >
                    {port.concession?.status === 'yours'
                      ? `Port FBO · P${port.concession.level ?? 1}`
                      : port.concession?.status === 'held'
                        ? 'Held'
                        : 'Vacant'}
                  </span>
                  <button
                    type="button"
                    className="action ghost ports-concession-open"
                    disabled={props.busy}
                    onClick={() => {
                      if (hasOwnedPortFbo) {
                        openNetworkSurface('fbo', {
                          portId: port.id,
                        });
                      } else setConcessionOpen(true);
                    }}
                  >
                    {port.concession?.status === 'yours'
                      ? 'Open desk'
                      : port.concession?.status === 'held'
                        ? 'Details'
                        : 'Claim'}
                  </button>
                  {catalogBuyWarehouseHub ? (
                    <button
                      type="button"
                      className="action ghost"
                      disabled={props.busy || loading}
                      title={`Buy a company warehouse at ${catalogBuyWarehouseHub} (no Port FBO required)`}
                      onClick={() =>
                        openNetworkSurface('buy', {
                          portId: port.id,
                          hubIcao: catalogBuyWarehouseHub,
                        })
                      }
                    >
                      Buy warehouse · {catalogBuyWarehouseHub}
                    </button>
                  ) : null}
                </h3>
              ) : (
                <p className="ports-stage-title is-muted">
                  Select a port on the map.
                </p>
              )}

              <div className="ports-main">
                <PortsMap
                  ports={mapPorts}
                  ownedFbos={mapWarehouses}
                  selectedPortId={portId ?? port?.id}
                  focusToken={mapFocusToken}
                  onSelectPort={selectCatalogPort}
                  onSelectHub={(icao) => props.onOpenAirport?.(icao)}
                />

                <div className="ports-listings">
                  {port ? (
                    <>
                      <p
                        className="ports-discharge-strip muted"
                        aria-label="Next factory discharge"
                      >
                        Discharge
                        {port.inbound.ticksLeft <= 0
                          ? ' · next tick'
                          : ` · ~${ticksToHoursLabel(port.inbound.ticksLeft)}`}
                        {port.inbound.totalKg > 0
                          ? ` · ~${props.formatTonnes(port.inbound.totalKg)}`
                          : ''}
                      </p>
                      {(() => {
                        const signals = (port.marketSignals ?? []).filter(
                          (s) =>
                            s.balance === 'surplus' || s.balance === 'shortage',
                        );
                        if (signals.length === 0) return null;
                        return (
                          <p
                            className="ports-hub-pressure"
                            aria-label="Pickup hub market pressure"
                          >
                            <span className="ports-hub-pressure-label">
                              Hub pressure
                            </span>
                            {signals.map((s) => {
                              const level =
                                s.balance === 'shortage' ? 'low' : 'high';
                              return (
                                <span
                                  key={`${s.commodityId}-${s.hubIcao}`}
                                  className="ports-hub-pressure-token"
                                  title={`${s.commodityName} at ${s.hubIcao}: hub warehouse ${s.fillPct}% full`}
                                >
                                  {' '}
                                  · {s.hubIcao} {s.commodityName} {level}
                                </span>
                              );
                            })}
                          </p>
                        );
                      })()}
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Commodity</th>
                            <th>Available</th>
                            <th>Port $/{unit}</th>
                            <th>Hub spot</th>
                            <th>Pickup</th>
                            <th>Expires</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {port.listings.length === 0 ? (
                            <tr>
                              <td colSpan={7}>
                                <p className="empty">
                                  No open listings — they spawn from yard stock
                                  after discharge.
                                </p>
                              </td>
                            </tr>
                          ) : (
                            port.listings.map((l) => {
                              const cargoLocked = isCargoOpsCommodityLocked(
                                l.commodityId,
                              );
                              return (
                              <tr
                                key={l.id}
                                className={cargoLocked ? 'lot-locked' : undefined}
                              >
                                <td>
                                  <div className="commodity-cell">
                                    <CommodityIcon
                                      commodityId={l.commodityId}
                                      size={52}
                                      title={commodityLabel(l)}
                                    />
                                    <div>
                                      <strong>{commodityLabel(l)}</strong>
                                      {cargoLocked ? (
                                        <span
                                          className="tag"
                                          title="Unlock via Cargo Ops ladder"
                                        >
                                          Locked
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </td>
                                <td>{props.formatTonnes(l.availableKg)}</td>
                                <td>{formatUnitPrice(l.unitPriceUsd)}</td>
                                <td>
                                  {l.hubSpotUnitPriceUsd != null
                                    ? formatUnitPrice(l.hubSpotUnitPriceUsd)
                                    : '—'}
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className="linkish"
                                    disabled={props.busy}
                                    onClick={() =>
                                      props.onOpenAirport?.(l.allocatedHubIcao)
                                    }
                                  >
                                    {l.allocatedHubIcao}
                                  </button>
                                </td>
                                <td
                                  className="muted"
                                  title={
                                    props.economyTick != null
                                      ? `Economy tick ${l.expiresAtTick}`
                                      : undefined
                                  }
                                >
                                  {formatExpiresIn(
                                    l.expiresAtTick,
                                    props.economyTick,
                                  )}
                                </td>
                                <td>
                                  {cargoLocked ? (
                                    <button
                                      type="button"
                                      className="action ghost"
                                      disabled={props.busy || loading}
                                      title="Locked — unlock this commodity in Hangar → Cargo Ops"
                                      onClick={() => props.onOpenCargoOps?.()}
                                    >
                                      Locked
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="accept"
                                      disabled={props.busy || loading}
                                      onClick={() => openBuyModal(l)}
                                    >
                                      Buy
                                    </button>
                                  )}
                                </td>
                              </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                    </>
                  ) : (
                    <p className="empty">Select a port.</p>
                  )}
                </div>
              </div>
            </>
          ) : null}

          {section === 'network' ? (
            <div className="ports-network-chrome">
              <div className="ports-network-toolbar">
                <label className="ports-network-search">
                  <span className="ports-network-search-label">Find</span>
                  <input
                    type="search"
                    value={networkSearch}
                    placeholder="ICAO or port"
                    aria-label="Search company network by ICAO or port"
                    disabled={props.busy || loading}
                    onChange={(e) => setNetworkSearch(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className={
                    networkSurface === 'demand'
                      ? 'fbo-icao-chip active'
                      : 'fbo-icao-chip'
                  }
                  disabled={props.busy || loading}
                  onClick={() => openNetworkSurface('demand')}
                >
                  Demand ({sortedDemand.length})
                </button>
                <button
                  type="button"
                  className={
                    networkSurface === 'buy'
                      ? 'fbo-icao-chip active'
                      : 'fbo-icao-chip'
                  }
                  disabled={props.busy || loading}
                  onClick={() => openNetworkSurface('buy')}
                >
                  Buy warehouse
                  {networkBuyableHubs.length > 0
                    ? ` (${networkBuyableHubs.length}${
                        buyHubQuery.trim() ? '' : '+'
                      })`
                    : ''}
                </button>
                <button
                  type="button"
                  className={
                    networkSurface === 'staff'
                      ? 'fbo-icao-chip active'
                      : 'fbo-icao-chip'
                  }
                  disabled={props.busy || loading}
                  onClick={() => openNetworkSurface('staff')}
                >
                  Ground staff
                  {(groundStaff?.members.length ?? 0) > 0
                    ? ` (${groundStaff!.members.length})`
                    : ''}
                </button>
              </div>
              {filteredNetworkNodes.length > 0 ? (
                <VaCompanyNetwork
                  className="ports-network-assets"
                  nodes={filteredNetworkNodes}
                  selectedId={
                    networkSurface === 'demand' ||
                    networkSurface === 'buy' ||
                    networkSurface === 'staff'
                      ? null
                      : selectedNetworkId
                  }
                  onSelect={onSelectNetworkNode}
                  showMap={
                    networkSurface === 'fbo' || networkSurface === 'wh'
                  }
                  hideAllChip
                  highlightRoute={
                    networkSurface === 'fbo' ? scoutHighlightRoute : null
                  }
                  corridorRing={
                    networkSurface === 'fbo' ? networkCorridorRing : null
                  }
                  weightSystem={props.weightSystem}
                  disabled={props.busy || loading}
                />
              ) : companyNetworkNodes.length === 0 ? (
                <p className="empty">
                  No Port FBO or warehouse yet — use{' '}
                  <strong>Buy warehouse</strong> above
                  {catalogBuyWarehouseHub
                    ? ` (start at ${catalogBuyWarehouseHub})`
                    : ''}
                  , or Claim on Port catalog.
                </p>
              ) : (
                <p className="empty">
                  No network match for “{networkSearch.trim()}”.
                </p>
              )}
            </div>
          ) : null}

          {section === 'network' && networkSurface === 'fbo' ? (
            <>
              {port ? (
                <h3 className="ports-selected-name ports-stage-title">
                  <span className="ports-selected-name-text">{port.name}</span>
                  <span
                    className={
                      port.concession?.status === 'yours'
                        ? 'tag ports-operator-badge ports-concession-status'
                        : port.concession?.status === 'held'
                          ? 'tag ports-concession-status'
                          : 'tag muted ports-concession-status'
                    }
                    title="Port FBO status"
                  >
                    {port.concession?.status === 'yours'
                      ? `Port FBO · P${port.concession.level ?? 1}`
                      : port.concession?.status === 'held'
                        ? 'Held'
                        : 'Vacant'}
                  </span>
                  <button
                    type="button"
                    className="action ghost ports-concession-open"
                    disabled={props.busy}
                    onClick={() => setConcessionOpen(true)}
                    title={
                      portLeaseDaysLeft != null
                        ? `Lease · ${portLeaseDaysLeft}d left`
                        : undefined
                    }
                  >
                    {port.concession?.status === 'yours'
                      ? canPortCapex
                        ? portLeaseDaysLeft != null
                          ? `Lease · ${portLeaseDaysLeft}d`
                          : 'Lease · Upgrade'
                        : portLeaseDaysLeft != null
                          ? `Lease · ${portLeaseDaysLeft}d`
                          : 'Details'
                      : port.concession?.status === 'held'
                        ? 'Details'
                        : canPortCapex
                          ? 'Claim'
                          : 'Details'}
                  </button>
                </h3>
              ) : (
                <p className="ports-stage-title is-muted">
                  Select a Port FBO on the network map.
                </p>
              )}

              {port && port.concession?.status === 'yours' ? (
                <div className="ports-main ports-fbo-main ports-network-detail">
                  <div className="ports-listings ports-fbo-panel">
                    <>
                        <div
                          className="ports-scout-desk"
                          aria-label="Port FBO scout suggestions"
                        >
                          <div className="ports-scout-head">
                            <p className="ports-scout-title">Scout</p>
                            <div
                              className="ports-scout-filters"
                              role="tablist"
                              aria-label="Scout kind"
                            >
                              {(
                                [
                                  ['all', 'All'],
                                  ['haul', 'Haul'],
                                  ['demand', 'Demand'],
                                  ['bridge', 'Bridge'],
                                ] as const
                              ).map(([id, label]) => (
                                <button
                                  key={id}
                                  type="button"
                                  role="tab"
                                  aria-selected={scoutFilter === id}
                                  className={
                                    scoutFilter === id
                                      ? 'fbo-icao-chip active'
                                      : 'fbo-icao-chip'
                                  }
                                  disabled={props.busy || loading}
                                  onClick={() => setScoutFilter(id)}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                          {scoutBusy && !scoutLoaded ? (
                            <div className="ports-scout-loading">
                              <BusyBlock label="Loading Scout…" />
                            </div>
                          ) : scoutMergedRows.length === 0 ? (
                            <div className="ports-scout-empty">
                              {(scoutFilter !== 'all'
                                ? [
                                    `No ${scoutFilter} ideas right now — try All.`,
                                  ]
                                : holdsAtSelectedPort.length > 0
                                  ? [
                                      `${holdsAtSelectedPort.length} desk hold${
                                        holdsAtSelectedPort.length === 1
                                          ? ''
                                          : 's'
                                      } reserve free stock — open Hauls to fly, or Cancel a hold to reopen Scout.`,
                                    ]
                                : scoutEmptyHint && scoutEmptyHint.length > 0
                                  ? scoutEmptyHint
                                  : [
                                      'No Scout ideas right now — check stock, Demand board, or wait for a tick.',
                                    ]
                              ).map((line) => (
                                <p
                                  key={line}
                                  className="muted ports-warehouse-hint"
                                >
                                  {line}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <div className="table-wrap ports-scout-table-wrap">
                              <table className="data-table ports-scout-table">
                                <thead>
                                  <tr>
                                    <th>Kind</th>
                                    <th>Route</th>
                                    <th>Commodity</th>
                                    <th>Mass</th>
                                    <th>Pay</th>
                                    <th>Nm</th>
                                    <th title="Destination hub warehouse fill">
                                      Fill
                                    </th>
                                    <th />
                                  </tr>
                                </thead>
                                <tbody>
                                  {scoutMergedRows.map((row) => (
                                    <tr
                                      key={`${row.kind}-${row.id}`}
                                      className={
                                        scoutFocusId === row.id
                                          ? 'ports-scout-tr is-selected'
                                          : 'ports-scout-tr'
                                      }
                                      onClick={() => focusScoutRow(row.id)}
                                    >
                                      <td className="muted">
                                        {row.kind === 'haul'
                                          ? 'Haul'
                                          : row.kind === 'demand'
                                            ? 'Demand'
                                            : 'Bridge'}
                                      </td>
                                      <td>
                                        <strong>
                                          {row.originIcao}→{row.destIcao}
                                        </strong>
                                      </td>
                                      <td>
                                        {commodityLabel({
                                          commodityId: row.commodityId,
                                        })}
                                      </td>
                                      <td>
                                        {props.formatTonnes(row.kg)}
                                      </td>
                                      <td>
                                        {row.payUsd != null
                                          ? props.formatMoney(row.payUsd)
                                          : '—'}
                                      </td>
                                      <td className="muted">
                                        {row.distanceNm > 0
                                          ? row.distanceNm
                                          : '—'}
                                      </td>
                                      <td className="muted">
                                        {row.destFillPct != null
                                          ? `${row.destFillPct}%`
                                          : '—'}
                                      </td>
                                      <td>
                                        <button
                                          type="button"
                                          className="accept"
                                          disabled={
                                            props.busy ||
                                            loading ||
                                            row.kg < SCOUT_HOLD_MIN_KG
                                          }
                                          title={
                                            row.kg < SCOUT_HOLD_MIN_KG
                                              ? `Need at least ${props.formatTonnes(SCOUT_HOLD_MIN_KG)} free`
                                              : 'Choose how much to reserve'
                                          }
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (row.kind === 'haul') {
                                              setScoutHoldDraft({
                                                kind: 'haul',
                                                suggestion: row.raw,
                                              });
                                            } else if (row.kind === 'demand') {
                                              setScoutHoldDraft({
                                                kind: 'demand',
                                                suggestion: row.raw,
                                              });
                                            } else {
                                              setScoutHoldDraft({
                                                kind: 'bridge',
                                                suggestion: row.raw,
                                              });
                                            }
                                          }}
                                        >
                                          Hold
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        {(() => {
                          const deskOrders = (snap?.autoBuyOrders ?? []).filter(
                            (o) =>
                              o.portId.toUpperCase() ===
                              port.id.toUpperCase(),
                          );
                          const open = deskOpen;
                          return (
                            <details
                              className="ports-desk-details"
                              open={open}
                              onToggle={(e) =>
                                setDeskOpen(
                                  (e.target as HTMLDetailsElement).open,
                                )
                              }
                            >
                              <summary>
                                Desk auto-buy
                                {deskOrders.length > 0
                                  ? ` · ${deskOrders.length}`
                                  : ' · limit orders'}
                              </summary>
                              <div className="ports-desk-panel">
                                <ul className="ports-desk-orders">
                                  {deskOrders.map((o) => (
                                    <li
                                      key={o.id}
                                      className="ports-desk-order"
                                    >
                                      <span className="ports-desk-order-meta">
                                        <span className="commodity-cell ports-desk-order-commodity">
                                          <CommodityIcon
                                            commodityId={o.commodityId}
                                            size={28}
                                            title={commodityLabel({
                                              commodityId: o.commodityId,
                                            })}
                                          />
                                          <strong>
                                            {commodityLabel({
                                              commodityId: o.commodityId,
                                            })}
                                          </strong>
                                        </span>
                                        {o.paused ? ' · paused' : ''} · max{' '}
                                        {formatUnitPrice(o.maxPriceUsdPerKg)} ·{' '}
                                        {Math.round(
                                          kgToDisplay(
                                            o.maxKgPerDay,
                                            props.weightSystem,
                                          ),
                                        ).toLocaleString('en-US')}{' '}
                                        {unit}/day · today{' '}
                                        {Math.round(
                                          kgToDisplay(
                                            o.boughtKgToday,
                                            props.weightSystem,
                                          ),
                                        ).toLocaleString('en-US')}{' '}
                                        {unit}
                                      </span>
                                      {canPortDeskOps ? (
                                        <span className="ports-desk-order-actions">
                                          <button
                                            type="button"
                                            className="action ghost"
                                            disabled={props.busy || loading}
                                            onClick={() =>
                                              void onDeskPause(o.id, !o.paused)
                                            }
                                          >
                                            {o.paused ? 'Resume' : 'Pause'}
                                          </button>
                                          <button
                                            type="button"
                                            className="action ghost"
                                            disabled={props.busy || loading}
                                            onClick={() =>
                                              void onDeskRemove(o.id)
                                            }
                                          >
                                            Remove
                                          </button>
                                        </span>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                                {canPortDeskOps ? (
                                <div className="ports-desk-form">
                                  <label>
                                    Commodity
                                    <select
                                      value={deskCommodity}
                                      onChange={(e) =>
                                        setDeskCommodity(e.target.value)
                                      }
                                      disabled={props.busy || loading}
                                    >
                                      <option value="general">General</option>
                                      <option value="supplies">Supplies</option>
                                      <option value="machinery">
                                        Machinery
                                      </option>
                                      <option value="electronics">
                                        Electronics
                                      </option>
                                    </select>
                                  </label>
                                  <label>
                                    Max $/{unit}
                                    <input
                                      type="number"
                                      min={0.01}
                                      step={0.01}
                                      placeholder={
                                        props.weightSystem === 'imperial'
                                          ? 'e.g. 0.90'
                                          : 'e.g. 2'
                                      }
                                      value={deskMaxPrice}
                                      onChange={(e) =>
                                        setDeskMaxPrice(e.target.value)
                                      }
                                      disabled={props.busy || loading}
                                    />
                                  </label>
                                  <label>
                                    Max {unit}/day
                                    <input
                                      type="number"
                                      min={1}
                                      step={
                                        props.weightSystem === 'imperial'
                                          ? 200
                                          : 100
                                      }
                                      placeholder={
                                        props.weightSystem === 'imperial'
                                          ? 'e.g. 11000'
                                          : 'e.g. 5000'
                                      }
                                      value={deskMaxKgDay}
                                      onChange={(e) =>
                                        setDeskMaxKgDay(e.target.value)
                                      }
                                      disabled={props.busy || loading}
                                    />
                                  </label>
                                  <label>
                                    Wallet floor $
                                    <input
                                      type="number"
                                      min={0}
                                      step={100}
                                      placeholder="0"
                                      value={deskWalletFloor}
                                      onChange={(e) =>
                                        setDeskWalletFloor(e.target.value)
                                      }
                                      disabled={props.busy || loading}
                                    />
                                  </label>
                                  <label>
                                    Warehouse
                                    <select
                                      value={deskWarehouseId}
                                      onChange={(e) =>
                                        setDeskWarehouseId(e.target.value)
                                      }
                                      disabled={
                                        props.busy ||
                                        loading ||
                                        deskPickupWarehouses.length === 0
                                      }
                                    >
                                      {deskPickupWarehouses.length !== 1 ? (
                                        <option value="">
                                          {deskPickupWarehouses.length === 0
                                            ? 'No pickup WH'
                                            : 'Pickup WH…'}
                                        </option>
                                      ) : null}
                                      {deskPickupWarehouses.map((w) => (
                                        <option key={w.id} value={w.id}>
                                          {w.icao} · T{w.tier}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <button
                                    type="button"
                                    className="action"
                                    disabled={props.busy || loading}
                                    onClick={() => void onDeskUpsert(port.id)}
                                  >
                                    Add desk order
                                  </button>
                                </div>
                                ) : (
                                  <p className="muted ports-warehouse-hint">
                                    Owner or dispatcher manages desk auto-buy.
                                    You can Scout Hold and fly.
                                  </p>
                                )}
                              </div>
                            </details>
                          );
                        })()}

                        {(port.inventory?.length ?? 0) > 0 ? (
                          <details className="ports-stock-details">
                            <summary>Port stock</summary>
                            <div
                              className="ports-inventory-bars"
                              aria-label="Port stock"
                            >
                              {port.inventory!.map((row) => {
                                const frac =
                                  row.capKg > 0
                                    ? Math.min(1, row.stockKg / row.capKg)
                                    : 0;
                                return (
                                  <div
                                    key={row.commodityId}
                                    className="ports-inventory-bar"
                                    title={`${commodityLabel(row)} ${props.formatTonnes(row.stockKg)} / ${props.formatTonnes(row.capKg)}`}
                                  >
                                    <span className="ports-inventory-bar-label">
                                      {commodityLabel(row)}
                                    </span>
                                    <div className="ports-inventory-bar-track">
                                      <div
                                        className="ports-inventory-bar-fill"
                                        style={{
                                          width: `${Math.round(frac * 100)}%`,
                                        }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        ) : null}
                      </>
                  </div>
                </div>
              ) : port ? (
                <p className="muted ports-warehouse-hint">
                  {port.concession?.status === 'held'
                    ? 'Held by another company — Catalog buy still works.'
                    : 'Vacant — Claim on Port catalog. Catalog buy works either way.'}
                </p>
              ) : null}
            </>
          ) : null}

          {section === 'network' &&
          (networkSurface === 'wh' ||
            networkSurface === 'buy' ||
            networkSurface === 'staff') ? (
            <>
              <h3 className="ports-stage-title">
                {whShelf === 'staff'
                  ? 'Ground staff'
                  : whShelf === 'buy'
                    ? 'Buy warehouse'
                    : highlightedHubIcao
                      ? `Warehouse · ${highlightedHubIcao}`
                      : 'Your warehouses'}
              </h3>
              <div
                className={
                  whShelf === 'owned'
                    ? 'ports-main ports-network-detail'
                    : 'ports-main'
                }
              >
                {whShelf !== 'owned' ? (
                <PortsMap
                  ports={mapPorts}
                  ownedFbos={mapWarehouses}
                  bridgeLegs={undefined}
                  selectedPortId={
                    whShelf === 'buy' && selectedBuyHubIcao
                      ? (portForHub.get(selectedBuyHubIcao)?.id ??
                        portId ??
                        port?.id)
                      : highlightPortId
                        ? highlightPortId
                        : (portId ?? port?.id)
                  }
                  highlightedHubIcao={
                    whShelf === 'staff'
                      ? highlightedHubIcao
                      : whShelf === 'buy'
                        ? selectedBuyHubIcao
                        : null
                  }
                  onSelectPort={(id) => {
                    setPortId(id);
                    if (whShelf === 'staff') {
                      setSelectedStockId(null);
                      const picked = (snap.ports ?? []).find(
                        (p) => p.id.toUpperCase() === id.toUpperCase(),
                      );
                      const hubs = new Set(
                        (picked?.pickupHubs ?? []).map((h) =>
                          h.trim().toUpperCase(),
                        ),
                      );
                      const hit = allOwnedWarehouses.find((w) =>
                        hubs.has(w.icao.trim().toUpperCase()),
                      );
                      if (hit) {
                        setSelectedOwnedHubIcao(
                          hit.icao.trim().toUpperCase(),
                        );
                      }
                    }
                    if (whShelf === 'buy') setSelectedBuyHubIcao(null);
                  }}
                  onSelectHub={(icao) => {
                    const code = icao.trim().toUpperCase();
                    const owned = allOwnedWarehouses.some(
                      (w) => w.icao.trim().toUpperCase() === code,
                    );
                    if (whShelf === 'staff' && owned) {
                      selectOwnedHub(code);
                      return;
                    }
                    if (whShelf === 'buy') {
                      setSelectedBuyHubIcao(code);
                      return;
                    }
                    props.onOpenAirport?.(icao);
                  }}
                />
                ) : null}

                <div className="ports-warehouse-side">
                  <div className="ports-warehouse-strip">
                    <div className="ports-wh-head">
                      <h3>
                        {whShelf === 'buy'
                          ? 'Buy at pickup'
                          : whShelf === 'staff'
                            ? 'Ground staff'
                            : 'Warehouse'}
                      </h3>
                      {whShelf === 'owned' ? null : (
                      <p className="muted ports-warehouse-hint">
                        {whShelf === 'staff'
                          ? 'Hire per warehouse · Ace→Green grades · salary by grade.'
                          : port
                            ? `Pickup hubs for ${port.name} — search to browse other ports.`
                            : 'Search a pickup ICAO, then buy.'}
                      </p>
                      )}
                    </div>

                    <div className="ports-wh-body">
                    {whShelf === 'owned' ? (
                      <>
                        {allOwnedWarehouses.length === 0 ? (
                          <p className="empty">
                            No warehouses yet — use Buy warehouse above at a
                            pickup hub.
                          </p>
                        ) : !selectedNetworkId && !focusedOwnedWarehouse ? (
                          <p className="empty">
                            Select a warehouse on the network map.
                          </p>
                        ) : (
                          <div className="ports-wh-hub-focus">
                            <div
                              className="ports-wh-hub-picker"
                              role="listbox"
                              aria-label="Your hubs"
                            >
                              {ownedWarehousesInScope.map((row) => {
                                const code = row.icao.trim().toUpperCase();
                                const active =
                                  focusedOwnedWarehouse?.id === row.id;
                                const fillPct = Math.min(
                                  100,
                                  Math.round(
                                    (row.usedKg /
                                      Math.max(1, row.capacityKg)) *
                                      100,
                                  ),
                                );
                                const demandN = demandHoldsByHub.get(code) ?? 0;
                                return (
                                  <button
                                    key={row.id}
                                    type="button"
                                    role="option"
                                    aria-selected={active}
                                    className={
                                      active
                                        ? 'ports-wh-hub-chip is-active'
                                        : 'ports-wh-hub-chip'
                                    }
                                    disabled={props.busy || loading}
                                    onClick={() =>
                                      openNetworkSurface('wh', {
                                        hubIcao: code,
                                      })
                                    }
                                  >
                                    <strong>{code}</strong>
                                    <span>{fillPct}%</span>
                                    {demandN > 0 ? (
                                      <span className="ports-wh-hub-chip-badge">
                                        {demandN}
                                      </span>
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                          <div className="ports-wh-hub-grid">
                            {(focusedOwnedWarehouse
                              ? [focusedOwnedWarehouse]
                              : []
                            ).map((wh) => {
                              const icao = wh.icao.trim().toUpperCase();
                              const linked = portForHub.get(icao);
                              const active = highlightedHubIcao === icao;
                              const shipped = wh.lifetimeShippedKg ?? 0;
                              const nextTier =
                                wh.nextTier ??
                                (wh.tier < 3 ? ((wh.tier + 1) as 2 | 3) : null);
                              const needed =
                                wh.shippedNeededForNextTierKg ??
                                wh.shippedNeededForT2Kg ??
                                (nextTier === 3 ? 12_000 : 5_000);
                              const shippedPct = Math.min(
                                100,
                                Math.round((shipped / Math.max(1, needed)) * 100),
                              );
                              const fillPct = Math.min(
                                100,
                                Math.round(
                                  (wh.usedKg / Math.max(1, wh.capacityKg)) * 100,
                                ),
                              );
                              const hubTierLabel =
                                wh.hubTier === 'major'
                                  ? 'Major hub'
                                  : wh.hubTier === 'regional'
                                    ? 'Regional hub'
                                    : wh.hubTier === 'spoke'
                                      ? 'Spoke hub'
                                      : null;
                              const hubStock = allWarehouseStock.filter(
                                (s) => s.warehouseId === wh.id,
                              );
                              const hubHolds = (
                                warehouses?.demandHolds ?? []
                              ).filter(
                                (h) =>
                                  h.originIcao.trim().toUpperCase() === icao,
                              );
                              return (
                                <div
                                  key={wh.id}
                                  className="ports-wh-hub-column"
                                >
                                <div
                                  className={
                                    active
                                      ? 'ports-warehouse-card is-selected is-clickable'
                                      : 'ports-warehouse-card is-clickable'
                                  }
                                  role="button"
                                  tabIndex={0}
                                  aria-pressed={active}
                                  onClick={() => selectOwnedHub(icao)}
                                  onKeyDown={(event) => {
                                    if (
                                      event.key === 'Enter' ||
                                      event.key === ' '
                                    ) {
                                      event.preventDefault();
                                      selectOwnedHub(icao);
                                    }
                                  }}
                                >
                                  <div className="ports-wh-owned-head">
                                    <div className="ports-wh-owned-title">
                                      <strong>
                                        <button
                                          type="button"
                                          className="linkish"
                                          disabled={props.busy}
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            props.onOpenAirport?.(icao);
                                          }}
                                        >
                                          {icao}
                                        </button>
                                      </strong>
                                      {linked ? (
                                        <span className="ports-wh-owned-port">
                                          {linked.name}
                                        </span>
                                      ) : null}
                                    </div>
                                    <span className="ports-wh-tier">
                                      T{wh.tier}
                                    </span>
                                  </div>

                                  <div className="ports-wh-meter">
                                    <div className="ports-wh-meter-row">
                                      <span>Stored</span>
                                      <span>
                                        {props.formatTonnes(wh.usedKg)} /{' '}
                                        {props.formatTonnes(wh.capacityKg)}
                                      </span>
                                    </div>
                                    <div
                                      className="ports-wh-meter-bar"
                                      title={`${fillPct}% full`}
                                    >
                                      <span style={{ width: `${fillPct}%` }} />
                                    </div>
                                  </div>

                                  {nextTier != null ? (
                                    <div className="ports-wh-meter">
                                      <div className="ports-wh-meter-row">
                                        <span>Shipped for T{nextTier}</span>
                                        <span>
                                          {props.formatTonnes(shipped)} /{' '}
                                          {props.formatTonnes(needed)}
                                        </span>
                                      </div>
                                      <div
                                        className="ports-wh-meter-bar is-ship"
                                        title={`${shippedPct}% toward T${nextTier}`}
                                      >
                                        <span
                                          style={{ width: `${shippedPct}%` }}
                                        />
                                      </div>
                                      {wh.canUpgrade &&
                                      wh.upgradeUsd != null &&
                                      canPortCapex ? (
                                        <>
                                          <button
                                            type="button"
                                            className="ports-wh-upgrade-btn"
                                            disabled={props.busy || loading}
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              void onUpgradeWarehouse(
                                                wh.id,
                                                icao,
                                              );
                                            }}
                                          >
                                            Upgrade to T{nextTier} ·{' '}
                                            {props.formatMoney(wh.upgradeUsd)}
                                          </button>
                                          {groundStaff?.byWarehouse[wh.id]
                                            ?.whOpsActive ? (
                                            <p className="ports-wh-upgrade-hint">
                                              {whOpsCapexLabel(
                                                groundStaff.byWarehouse[wh.id]
                                                  ?.whOpsCapexMult,
                                              )}{' '}
                                              (WH ops)
                                            </p>
                                          ) : null}
                                        </>
                                      ) : (
                                        <p className="ports-wh-upgrade-hint">
                                          {wh.upgradeUsd != null
                                            ? `${hubTierLabel ? `${hubTierLabel} · ` : ''}Upgrade ${props.formatMoney(wh.upgradeUsd)} after ship goal`
                                            : `Ship Demand Board cargo from this hub to unlock T${nextTier}`}
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <p className="ports-wh-upgrade-hint">
                                      {wh.tier >= 4
                                        ? 'Tier 4 Port Bonded · max capacity'
                                        : 'Tier 3 · max capacity'}
                                    </p>
                                  )}
                                </div>
                                <div className="ports-wh-sections">
                                  <section
                                    className="ports-wh-section"
                                    aria-label="In stock"
                                  >
                                    <h4 className="ports-wh-section-label">
                                      In stock
                                      {hubStock.length > 0
                                        ? ` · ${hubStock.length}`
                                        : ''}
                                    </h4>
                                    {hubStock.length === 0 ? (
                                      <p className="empty ports-wh-hub-empty">
                                        Empty — buy at the port or move stock
                                        here.
                                      </p>
                                    ) : (
                                      <ul className="ports-wh-lots is-stock">
                                        {hubStock.map((s) => {
                                          const selected =
                                            selectedStockId === s.id;
                                          const lotLabel = `${props.formatTonnes(s.kg)} ${commodityLabel(
                                            { commodityId: s.commodityId },
                                          )}`;
                                          return (
                                            <li
                                              key={s.id}
                                              className={
                                                selected
                                                  ? 'ports-wh-lot is-stock is-selected'
                                                  : 'ports-wh-lot is-stock'
                                              }
                                              tabIndex={0}
                                              aria-selected={selected}
                                              onClick={() =>
                                                selectStockLot(s.id, icao)
                                              }
                                              onKeyDown={(event) => {
                                                if (
                                                  event.key === 'Enter' ||
                                                  event.key === ' '
                                                ) {
                                                  event.preventDefault();
                                                  selectStockLot(s.id, icao);
                                                }
                                              }}
                                            >
                                              <div className="ports-wh-lot-main">
                                                <div className="commodity-cell ports-wh-stock-cell">
                                                  <CommodityIcon
                                                    commodityId={s.commodityId}
                                                    size={22}
                                                  />
                                                  <div className="ports-wh-stock-copy">
                                                    <strong>
                                                      {commodityLabel({
                                                        commodityId:
                                                          s.commodityId,
                                                      })}
                                                    </strong>
                                                    <span className="muted">
                                                      {formatMassPreferExact(
                                                        s.kg,
                                                        props.weightSystem,
                                                      )}
                                                      {' · '}
                                                      {formatUnitPrice(
                                                        s.avgCostUsdPerKg,
                                                      )}
                                                    </span>
                                                  </div>
                                                </div>
                                              </div>
                                              <div className="ports-wh-lot-actions">
                                                {allOwnedWarehouses.length >
                                                1 ? (
                                                  <button
                                                    type="button"
                                                    className="action ghost"
                                                    disabled={
                                                      props.busy || loading
                                                    }
                                                    onClick={(event) => {
                                                      event.stopPropagation();
                                                      openBridgeFromLot(
                                                        icao,
                                                        s.commodityId,
                                                      );
                                                    }}
                                                  >
                                                    Move
                                                  </button>
                                                ) : null}
                                                <button
                                                  type="button"
                                                  className="action ghost"
                                                  disabled={
                                                    props.busy || loading
                                                  }
                                                  onClick={(event) => {
                                                    event.stopPropagation();
                                                    openHaulFromLot(
                                                      icao,
                                                      s.commodityId,
                                                    );
                                                  }}
                                                  title="Dispatch WH stock to a destination terminal (Wide when kg allows)"
                                                >
                                                  Haul
                                                </button>
                                                {canPortDeskOps ? (
                                                  <button
                                                    type="button"
                                                    className="action ghost"
                                                    disabled={
                                                      props.busy || loading
                                                    }
                                                    onClick={(event) => {
                                                      event.stopPropagation();
                                                      void onAbandonWarehouseStock(
                                                        s.id,
                                                        lotLabel,
                                                        icao || 'warehouse',
                                                      );
                                                    }}
                                                  >
                                                    Abandon
                                                  </button>
                                                ) : null}
                                              </div>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    )}
                                  </section>

                                  <section
                                    className="ports-wh-section"
                                    aria-label="Holds ready to fly"
                                  >
                                    <h4 className="ports-wh-section-label">
                                      Holds
                                      {hubHolds.length > 0
                                        ? ` · ${hubHolds.length}`
                                        : ''}
                                    </h4>
                                    {hubHolds.length === 0 ? (
                                      <p className="empty ports-wh-hub-empty">
                                        No holds — Scout or Demand Board.
                                      </p>
                                    ) : (
                                      <ul className="ports-wh-lots is-holds">
                                        {hubHolds.map((h) => {
                                          const isBridge =
                                            (h.kind ?? 'demand') === 'bridge';
                                          const isHaul = h.kind === 'haul';
                                          return (
                                            <li
                                              key={h.id}
                                              className="ports-wh-lot is-hold"
                                            >
                                              <div className="ports-wh-lot-main">
                                                <div className="ports-wh-hold-main">
                                                  <div className="ports-wh-hold-line">
                                                    <span
                                                      className={
                                                        isBridge
                                                          ? 'ports-wh-hold-kind is-transfer'
                                                          : isHaul
                                                            ? 'ports-wh-hold-kind is-transfer'
                                                            : 'ports-wh-hold-kind is-demand'
                                                      }
                                                    >
                                                      {isBridge
                                                        ? 'Transfer'
                                                        : isHaul
                                                          ? 'Haul'
                                                          : 'Demand'}
                                                    </span>
                                                    <span className="ports-wh-hold-dest">
                                                      → {h.destIcao}
                                                    </span>
                                                    <span
                                                      className="ports-wh-hold-ttl muted"
                                                      title="Hold TTL — releases if not Accepted"
                                                    >
                                                      {formatExpiresIn(
                                                        h.expiresAtTick,
                                                        props.economyTick,
                                                      )}
                                                    </span>
                                                  </div>
                                                  <p className="muted ports-wh-hold-lot">
                                                    {commodityLabel({
                                                      commodityId:
                                                        h.commodityId,
                                                    })}{' '}
                                                    ·{' '}
                                                    {props.formatTonnes(h.kg)}
                                                    {(h.kind ?? 'demand') ===
                                                      'bridge' &&
                                                    (h.pilotPayUsd ?? 0) > 0
                                                      ? ` · pilot ${props.formatMoney(h.pilotPayUsd ?? 0)}`
                                                      : (h.kind ??
                                                            'demand') ===
                                                          'bridge'
                                                        ? ' · unpaid'
                                                        : ''}
                                                  </p>
                                                </div>
                                              </div>
                                              <div className="ports-wh-lot-actions">
                                                <button
                                                  type="button"
                                                  className="accept"
                                                  disabled={
                                                    props.busy || loading
                                                  }
                                                  onClick={() => {
                                                    setDispatchHold(h);
                                                    setDispatchMode('fly');
                                                    setShuttleQuote(null);
                                                    const aircraft =
                                                      props.fleet.filter(
                                                        (a) =>
                                                          a.status ===
                                                            'parked' &&
                                                          a.locationIcao
                                                            .trim()
                                                            .toUpperCase() ===
                                                            h.originIcao
                                                              .trim()
                                                              .toUpperCase(),
                                                      );
                                                    setDispatchAircraftId(
                                                      aircraft[0]?.id ?? '',
                                                    );
                                                  }}
                                                >
                                                  Dispatch
                                                </button>
                                                <button
                                                  type="button"
                                                  className="action ghost"
                                                  disabled={
                                                    props.busy || loading
                                                  }
                                                  onClick={() =>
                                                    void onReleaseDemandHold(h)
                                                  }
                                                >
                                                  Release
                                                </button>
                                              </div>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    )}
                                  </section>
                                </div>
                                </div>
                              );
                            })}
                          </div>
                          </div>
                        )}
                      </>
                    ) : whShelf === 'staff' ? (
                      allOwnedWarehouses.length === 0 ? (
                        <p className="empty">
                          Buy a warehouse before hiring ground staff.
                        </p>
                      ) : (
                        <div className="ports-ground-staff">
                          <div className="ports-ground-staff-hubs">
                            {allOwnedWarehouses.map((wh) => {
                              const icao = wh.icao.trim().toUpperCase();
                              const meta = groundStaff?.byWarehouse[wh.id];
                              const linked = portForHub.get(icao);
                              const active =
                                staffFocusWarehouse?.id === wh.id;
                              const slotsUsed = meta?.slotsUsed ?? 0;
                              const slotsUnlocked =
                                meta?.slotsUnlocked ??
                                warehouseStaffSlotsUnlocked(wh.tier);
                              return (
                                <button
                                  key={wh.id}
                                  type="button"
                                  className={
                                    active
                                      ? 'ports-ground-staff-hub is-selected'
                                      : 'ports-ground-staff-hub'
                                  }
                                  disabled={props.busy || loading}
                                  onClick={() => selectOwnedHub(icao)}
                                >
                                  <span className="ports-ground-staff-hub-icao">
                                    {icao}
                                  </span>
                                  <span className="ports-ground-staff-hub-name muted">
                                    {linked?.name ?? 'Pickup hub'}
                                  </span>
                                  <span className="ports-ground-staff-hub-meta muted">
                                    T{wh.tier} · {slotsUsed}/{slotsUnlocked}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          {staffFocusWarehouse ? (
                            <>
                              <div className="crew-section">
                                <h4 className="crew-section-title">Roster</h4>
                                <p className="muted crew-section-lede">
                                  {staffFocusWarehouse.icao.toUpperCase()} ·{' '}
                                  {staffSlotsUsed}/{staffSlotsUnlocked}
                                  {staffFocusMeta?.logisticsActive
                                    ? ` · ${transferDiscountLabel(staffFocusMeta.logisticsMult)}`
                                    : ''}
                                  {staffFocusMeta?.yardActive
                                    ? ` · Yard ${yardDiscountLabel(staffFocusMeta.yardHoldMult)}`
                                    : ''}
                                  {staffFocusMeta?.procurementActive
                                    ? ` · ${procurementDiscountLabel(staffFocusMeta.procurementMult)}`
                                    : ''}
                                  {staffFocusMeta?.demandDeskActive
                                    ? ` · ${demandPayBoostLabel(staffFocusMeta.demandDeskMult)}`
                                    : ''}
                                  {staffFocusMeta?.whOpsActive
                                    ? ` · ${whOpsCapexLabel(staffFocusMeta.whOpsCapexMult)}`
                                    : ''}
                                </p>
                                {(staffFocusMeta?.members.length ?? 0) ===
                                0 ? (
                                  <p className="empty">
                                    Empty — hire below.
                                  </p>
                                ) : (
                                  <ul className="crew-person-grid">
                                    {(staffFocusMeta?.members ?? []).map(
                                      (m) => (
                                        <li
                                          key={m.id}
                                          className="crew-person-card"
                                        >
                                          <CrewPortrait
                                            name={m.displayName}
                                            imageUrl={crewPortraitUrl(
                                              m.portraitId,
                                            )}
                                          />
                                          <div className="crew-person-body">
                                            <div className="crew-person-head">
                                              <strong className="crew-person-name">
                                                {m.displayName}
                                              </strong>
                                              <span className="crew-status idle">
                                                On duty
                                              </span>
                                            </div>
                                            <p className="crew-person-perk">
                                              {m.gradeLabel ? (
                                                <span className="crew-perk-tag">
                                                  {m.gradeLabel}
                                                </span>
                                              ) : null}
                                              <span className="crew-perk-tag">
                                                {m.perkLabel}
                                              </span>
                                              {m.perkHint ? (
                                                <span className="muted">
                                                  {' '}
                                                  {m.perkHint}
                                                </span>
                                              ) : null}
                                            </p>
                                            <p className="crew-card-meta">
                                              {props.formatMoney(
                                                m.salaryUsdPerDay,
                                              )}
                                              /day · {m.hubIcao}
                                            </p>
                                            <div className="crew-card-actions">
                                              <button
                                                type="button"
                                                className="action ghost"
                                                disabled={
                                                  props.busy || loading
                                                }
                                                onClick={() =>
                                                  void onFireGroundStaff(
                                                    m.id,
                                                    m.displayName,
                                                    m.fireSeveranceUsd ??
                                                      Math.round(
                                                        m.salaryUsdPerDay * 5,
                                                      ),
                                                  )
                                                }
                                              >
                                                Fire
                                                {m.fireSeveranceUsd != null &&
                                                m.fireSeveranceUsd > 0
                                                  ? ` · ${props.formatMoney(m.fireSeveranceUsd)}`
                                                  : ''}
                                              </button>
                                            </div>
                                          </div>
                                        </li>
                                      ),
                                    )}
                                  </ul>
                                )}
                              </div>

                              <div className="crew-section">
                                <h4 className="crew-section-title">
                                  Hire desk
                                </h4>
                                <p className="muted crew-section-lede">
                                  {staffHirePool.length} at{' '}
                                  {staffFocusWarehouse.icao.toUpperCase()} ·
                                  refresh each day
                                  {(staffSlotsFree <= 0) ? ' · slot full' : ''}
                                </p>
                                {staffSlotsFree <= 0 &&
                                staffHirePool.length === 0 ? (
                                  <p className="muted">
                                    Slot full — fire or upgrade WH.
                                  </p>
                                ) : staffHirePool.length === 0 ? (
                                  <p className="empty">
                                    No candidates today.
                                  </p>
                                ) : (
                                  <ul className="crew-person-grid">
                                    {staffHirePool.map((cand) => {
                                      const dup = (
                                        staffFocusMeta?.members ?? []
                                      ).some(
                                        (m) => m.perkId === cand.perkId,
                                      );
                                      const canHire =
                                        staffSlotsFree > 0 && !dup;
                                      return (
                                        <li
                                          key={cand.id}
                                          className="crew-person-card is-hire"
                                        >
                                          <CrewPortrait
                                            name={cand.displayName}
                                            imageUrl={crewPortraitUrl(
                                              cand.portraitId,
                                            )}
                                          />
                                          <div className="crew-person-body">
                                            <div className="crew-person-head">
                                              <strong className="crew-person-name">
                                                {cand.displayName}
                                              </strong>
                                              {cand.gradeLabel ? (
                                                <span className="crew-perk-tag">
                                                  {cand.gradeLabel}
                                                </span>
                                              ) : null}
                                              <span className="crew-perk-tag">
                                                {cand.perkLabel}
                                              </span>
                                            </div>
                                            <p className="crew-card-meta">
                                              {cand.perkHint}
                                            </p>
                                            <p className="crew-card-meta">
                                              Salary{' '}
                                              {props.formatMoney(
                                                cand.salaryUsdPerDay,
                                              )}
                                              /day
                                            </p>
                                            {canHire ? (
                                              <div className="crew-card-actions">
                                                <button
                                                  type="button"
                                                  className="accept"
                                                  disabled={
                                                    props.busy || loading
                                                  }
                                                  onClick={() =>
                                                    void onHireGroundStaff(
                                                      staffFocusWarehouse.id,
                                                      cand.id,
                                                    )
                                                  }
                                                >
                                                  Hire ·{' '}
                                                  {props.formatMoney(
                                                    cand.hireUsd ?? 0,
                                                  )}
                                                </button>
                                              </div>
                                            ) : (
                                              <p className="crew-card-meta muted">
                                                {dup
                                                  ? 'Perk already on roster'
                                                  : 'No free roster slot'}
                                              </p>
                                            )}
                                          </div>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </div>
                            </>
                          ) : null}
                        </div>
                      )
                    ) : allBuyableHubs.length === 0 ? (
                      <p className="empty">
                        Every port pickup hub already has a warehouse.
                      </p>
                    ) : (
                      <>
                        <label className="ports-wh-buy-filter">
                          <input
                            type="search"
                            value={buyHubQuery}
                            onChange={(event) =>
                              setBuyHubQuery(event.target.value)
                            }
                            placeholder="Filter ICAO or name…"
                            disabled={props.busy || loading}
                            autoComplete="off"
                            spellCheck={false}
                            aria-label="Filter available warehouses"
                          />
                        </label>
                        {port &&
                        networkBuyableHubs.some((icao) =>
                          selectedPortPickupSet.has(icao),
                        ) &&
                        !buyHubQuery.trim() ? (
                          <p className="muted ports-wh-buy-port-hint">
                            Showing pickups for {port.name}. Type to search
                            other ports ({allBuyableHubs.length} hubs).
                          </p>
                        ) : null}
                        {networkBuyableHubs.length === 0 ? (
                          <p className="empty">
                            {buyHubQuery.trim()
                              ? `No hubs match “${buyHubQuery.trim()}”.`
                              : 'No buyable pickup hubs — claim a port or wait for catalog.'}
                          </p>
                        ) : (
                      <div className="ports-wh-buy-list">
                        {networkBuyableHubs.map((icao) => {
                          const buyUsd = buyUsdByIcao[icao];
                          const linked = portForHub.get(icao);
                          const selected =
                            selectedBuyHubIcao?.toUpperCase() === icao;
                          const atSelectedPort =
                            selectedPortPickupSet.has(icao);
                          return (
                            <div
                              key={icao}
                              className={[
                                'ports-wh-buy-card',
                                selected ? 'is-selected' : '',
                                atSelectedPort ? 'is-port-pickup' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              role="button"
                              tabIndex={0}
                              aria-pressed={selected}
                              onClick={() => selectBuyHub(icao)}
                              onKeyDown={(event) => {
                                if (
                                  event.key === 'Enter' ||
                                  event.key === ' '
                                ) {
                                  event.preventDefault();
                                  selectBuyHub(icao);
                                }
                              }}
                            >
                              <div className="ports-wh-buy-head">
                                <strong>
                                  <button
                                    type="button"
                                    className="linkish"
                                    disabled={props.busy}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      props.onOpenAirport?.(icao);
                                    }}
                                  >
                                    {icao}
                                  </button>
                                </strong>
                                <span className="muted">
                                  {linked?.name ?? 'Pickup hub'}
                                </span>
                              </div>
                              {atSelectedPort && port ? (
                                <p className="ports-wh-port-chip">
                                  {port.name}
                                </p>
                              ) : null}
                              <p className="muted ports-wh-buy-meta">
                                Capacity {props.formatTonnes(WH_T1_CAPACITY_KG)}{' '}
                                · Tier 1
                              </p>
                              <div className="ports-wh-buy-actions">
                                <span className="ports-wh-buy-price">
                                  {buyUsd != null
                                    ? props.formatMoney(buyUsd)
                                    : '—'}
                                </span>
                                {canPortCapex ? (
                                <button
                                  type="button"
                                  className="ports-wh-buy-btn"
                                  disabled={props.busy || loading}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void onBuyWarehouse(icao);
                                  }}
                                >
                                  Buy
                                </button>
                                ) : (
                                  <span className="muted">Owner only</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                        )}
                      </>
                    )}
                    </div>
                  </div>
                </div>
              </div>

              {(warehouses?.inboundTransfers?.length ?? 0) > 0 ? (
                <>
                  <h4 className="ports-inbound-heading">In transit to WH</h4>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Hub</th>
                        <th>Commodity</th>
                        <th>Mass</th>
                        <th>ETA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(warehouses?.inboundTransfers ?? []).map((t) => {
                        const now = props.economyTick ?? snap?.tick ?? 0;
                        const left = Math.max(0, t.readyAtTick - now);
                        const label = commodityLabel({
                          commodityId: t.commodityId,
                        });
                        const logisticsMeta =
                          groundStaff?.byWarehouse[t.warehouseId];
                        const logistics =
                          logisticsMeta?.logisticsActive === true;
                        const etaLabel =
                          left <= 0
                            ? 'Arriving…'
                            : `~${ticksToHoursLabel(left)}`;
                        return (
                          <tr key={t.id}>
                            <td>{t.hubIcao}</td>
                            <td>
                              <span className="commodity-inline">
                                <CommodityIcon
                                  commodityId={t.commodityId}
                                  size={22}
                                  title={label}
                                />
                                {label}
                              </span>
                            </td>
                            <td>{props.formatTonnes(t.kg)}</td>
                            <td
                              title={
                                left > 0
                                  ? `${left} economy tick(s) · 15 min each`
                                  : 'Ready on the next economy settle'
                              }
                            >
                              {etaLabel}
                              {logistics ? (
                                <span className="ports-ground-staff-perk muted">
                                  {' '}
                                  ·{' '}
                                  {transferDiscountLabel(
                                    logisticsMeta?.logisticsMult,
                                  )}
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              ) : null}
              {portPickups.length === 0 ? (
                <p className="empty">
                  No yard cargo.
                </p>
              ) : (
                <>
                  <p className="muted ports-warehouse-hint">
                    Yard hold
                    {snap.yardHoldUsdPerDay != null &&
                    snap.yardHoldUsdPerDay > 0
                      ? ` · ${props.formatMoney(snap.yardHoldUsdPerDay)}/day`
                      : ''}
                    {' · '}
                    Store into WH or Abandon (no refund).
                  </p>
                  <table className="data-table ports-yard-table">
                    <thead>
                      <tr>
                        <th>Port</th>
                        <th>Hub</th>
                        <th>Commodity</th>
                        <th>Mass</th>
                        <th>Cost</th>
                        <th>Hold/day</th>
                        <th>Held</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {portPickups.map((p) => {
                        const freeKg = freeKgAtHub(p.hubIcao);
                        const storeAllOk = canStoreAtHub(p.hubIcao, p.kg);
                        const storePartialOk = freeKg > 0 && freeKg < p.kg;
                        const hasWh = (warehouses?.warehouses ?? []).some(
                          (w) =>
                            w.icao.trim().toUpperCase() ===
                            p.hubIcao.trim().toUpperCase(),
                        );
                        const whCap =
                          (warehouses?.warehouses ?? []).find(
                            (w) =>
                              w.icao.trim().toUpperCase() ===
                              p.hubIcao.trim().toUpperCase(),
                          )?.capacityKg ?? 0;
                        const foreverOversized = hasWh && p.kg > whCap;
                        const holdPerDay =
                          p.holdUsdPerDay ??
                          yardHoldUsdPerDay(p.kg, p.commodityId);
                        const heldDays = p.heldDays ?? 0;
                        const yardMeta = (warehouses?.warehouses ?? []).find(
                          (w) =>
                            w.icao.trim().toUpperCase() ===
                            p.hubIcao.trim().toUpperCase(),
                        );
                        const yardHoldMult = yardMeta
                          ? groundStaff?.byWarehouse[yardMeta.id]?.yardHoldMult
                          : undefined;
                        const yardDiscount =
                          yardMeta != null &&
                          groundStaff?.byWarehouse[yardMeta.id]?.yardActive ===
                            true;
                        const portDef = snap?.ports.find(
                          (row) =>
                            row.id.toUpperCase() === p.portId.toUpperCase(),
                        );
                        const pickupHubSet = new Set(
                          (portDef?.pickupHubs ?? []).map((h) =>
                            h.trim().toUpperCase(),
                          ),
                        );
                        const stevedoreOk =
                          canPortDeskOps &&
                          portDef?.concession?.status === 'yours';
                        const altWhAtPort = (warehouses?.warehouses ?? []).filter(
                          (w) => {
                            const hub = w.icao.trim().toUpperCase();
                            if (hub === p.hubIcao.trim().toUpperCase()) {
                              return false;
                            }
                            return pickupHubSet.has(hub);
                          },
                        );
                        const stevedoreDests = stevedoreOk
                          ? altWhAtPort.filter(
                              (w) => (w.inboundFreeKg ?? 0) > 0,
                            )
                          : [];
                        const aging =
                          heldDays >= YARD_HOLD_WARN_DAYS
                            ? 'ports-yard-aging'
                            : undefined;
                        const altHubLabel = altWhAtPort
                          .map((w) => w.icao.trim().toUpperCase())
                          .join(' / ');
                        return (
                          <tr key={p.id} className={aging}>
                            <td>{p.portId}</td>
                            <td>
                              <button
                                type="button"
                                className="linkish"
                                disabled={props.busy}
                                onClick={() => props.onOpenAirport?.(p.hubIcao)}
                              >
                                {p.hubIcao}
                              </button>
                            </td>
                            <td>
                              <div className="commodity-cell">
                                <CommodityIcon
                                  commodityId={p.commodityId}
                                  size={52}
                                  title={commodityLabel(p)}
                                />
                                <div>
                                  <strong>{commodityLabel(p)}</strong>
                                </div>
                              </div>
                            </td>
                            <td>{props.formatTonnes(p.kg)}</td>
                            <td>{formatUnitPrice(p.avgCostUsdPerKg)}</td>
                            <td
                              title={
                                yardDiscount
                                  ? `Yard hold fee per economy day (${yardDiscountLabel(yardHoldMult)} Yard boss)`
                                  : 'Yard hold fee per economy day'
                              }
                            >
                              {props.formatMoney(holdPerDay)}
                              {yardDiscount ? (
                                <span className="muted">
                                  {' '}
                                  · {yardDiscountLabel(yardHoldMult)}
                                </span>
                              ) : null}
                            </td>
                            <td>
                              {heldDays >= YARD_HOLD_WARN_DAYS ? (
                                <span
                                  className="ports-yard-held-warn"
                                  title={`Sitting ${heldDays} economy day(s) — store or abandon to stop fees`}
                                >
                                  {heldDays}d
                                </span>
                              ) : (
                                <span className="muted">
                                  {heldDays <= 0 ? 'today' : `${heldDays}d`}
                                </span>
                              )}
                            </td>
                            <td className="actions">
                              <div className="ports-pickup-actions">
                                {storeAllOk ? (
                                  <button
                                    type="button"
                                    className="accept"
                                    disabled={props.busy || loading}
                                    onClick={() => void onDeposit(p.id)}
                                  >
                                    Store in WH
                                  </button>
                                ) : storePartialOk ? (
                                  <button
                                    type="button"
                                    className="accept"
                                    disabled={props.busy || loading}
                                    onClick={() => void onDeposit(p.id)}
                                    title={`Store ${props.formatTonnes(freeKg)} now; rest stays in yard`}
                                  >
                                    Store {props.formatTonnes(freeKg)}
                                  </button>
                                ) : hasWh ? (
                                  <span className="muted">
                                    {foreverOversized
                                      ? `Larger than WH capacity (${props.formatTonnes(whCap)})`
                                      : `WH needs ${props.formatTonnes(p.kg - freeKg)} more free`}
                                  </span>
                                ) : (
                                  <span
                                    className="muted"
                                    title={
                                      altHubLabel && !stevedoreOk
                                        ? `You already have WH at ${altHubLabel}. Claim Port FBO on this port to Truck cargo there (fee + ETA).`
                                        : undefined
                                    }
                                  >
                                    {buyUsdByIcao[p.hubIcao.toUpperCase()] !=
                                    null
                                      ? `Buy warehouse · ${props.formatMoney(buyUsdByIcao[p.hubIcao.toUpperCase()]!)} at ${p.hubIcao}`
                                      : `Buy warehouse at ${p.hubIcao}`}
                                    {altHubLabel && !stevedoreOk
                                      ? ` · or Port FBO → Truck ${altHubLabel}`
                                      : null}
                                  </span>
                                )}
                                {stevedoreDests.map((w) => (
                                  <button
                                    key={w.id}
                                    type="button"
                                    className="action ghost"
                                    disabled={props.busy || loading}
                                    title="Port FBO stevedore truck (fee + ETA)"
                                    onClick={() =>
                                      void onStevedoreTruck(
                                        p.id,
                                        w.id,
                                        w.icao,
                                      )
                                    }
                                  >
                                    Truck → {w.icao}
                                  </button>
                                ))}
                                {canPortDeskOps ? (
                                <button
                                  type="button"
                                  className="action ghost"
                                  disabled={props.busy || loading}
                                  onClick={() =>
                                    void onAbandonPickup(
                                      p.id,
                                      `${props.formatTonnes(p.kg)} ${commodityLabel(p)}`,
                                    )
                                  }
                                >
                                  Abandon
                                </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}
            </>
          ) : null}

          {section === 'network' && networkSurface === 'demand' ? (
            <div className="ports-demand-board">
              <h3 className="ports-stage-title">
                {port ? `Demand · ${port.name}` : 'Demand Board'}
              </h3>
              <div className="ports-demand-filters">
                <label className="ports-demand-origin-filter">
                  <span>Port</span>
                  <select
                    value={port?.id ?? ''}
                    aria-label="Demand board port theater"
                    disabled={props.busy || loading || demandPortsForSwitcher.length === 0}
                    onChange={(e) => {
                      const id = e.target.value.trim();
                      if (id) setPortId(id);
                    }}
                  >
                    {demandPortsForSwitcher.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="ports-corridor-chip muted" aria-live="polite">
                  {port ? (
                    <>
                      {portOperatorChip}
                      {' · '}
                      {formatPortCorridorReachLabel(portCorridorLevel.level, {
                        source:
                          port.concession?.status === 'yours'
                            ? 'concession'
                            : port?.concession?.status === 'vacant' ||
                                !port.concession?.status
                              ? 'vacant'
                              : portCorridorLevel.source,
                      })}
                    </>
                  ) : (
                    'Select a port'
                  )}
                </p>
              </div>
              <div className="table-wrap ports-demand-table-wrap">
                <table className="data-table ports-demand-table">
                  <thead>
                    <tr>
                      <th
                        className="ports-demand-country-th"
                        aria-sort={demandAriaSort('country')}
                      >
                        <div className="ports-demand-country-th-inner">
                          <button
                            type="button"
                            className={`sort-header${demandSort.key === 'country' ? ' is-sorted' : ''}`}
                            title="Sort by destination country"
                            onClick={() => toggleDemandSort('country')}
                          >
                            Country{' '}
                            <span>{demandSortIndicator('country')}</span>
                          </button>
                          <label className="ports-demand-country-filter ports-demand-country-filter-in-th">
                            <select
                              value={demandCountryFilter}
                              aria-label="Filter demand by destination country"
                              disabled={props.busy || loading}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                setDemandCountryFilter(e.target.value)
                              }
                            >
                              <option value="">All</option>
                              {demandCountryOptions.map((id) => (
                                <option key={id} value={id}>
                                  {id}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </th>
                      <th aria-sort={demandAriaSort('dest')}>
                        <button
                          type="button"
                          className={`sort-header${demandSort.key === 'dest' ? ' is-sorted' : ''}`}
                          title="Sort by destination"
                          onClick={() => toggleDemandSort('dest')}
                        >
                          Dest <span>{demandSortIndicator('dest')}</span>
                        </button>
                      </th>
                      <th aria-sort={demandAriaSort('dist')}>
                        <button
                          type="button"
                          className={`sort-header${demandSort.key === 'dist' ? ' is-sorted' : ''}`}
                          title={
                            demandDeskPickupIcao
                              ? `Sort by distance from pickup ${demandDeskPickupIcao}`
                              : 'Sort by distance from port pickup hub'
                          }
                          onClick={() => toggleDemandSort('dist')}
                        >
                          Dist <span>{demandSortIndicator('dist')}</span>
                        </button>
                      </th>
                      <th aria-sort={demandAriaSort('commodity')}>
                        <button
                          type="button"
                          className={`sort-header${demandSort.key === 'commodity' ? ' is-sorted' : ''}`}
                          title="Sort by commodity"
                          onClick={() => toggleDemandSort('commodity')}
                        >
                          Commodity{' '}
                          <span>{demandSortIndicator('commodity')}</span>
                        </button>
                      </th>
                      <th aria-sort={demandAriaSort('wanted')}>
                        <button
                          type="button"
                          className={`sort-header${demandSort.key === 'wanted' ? ' is-sorted' : ''}`}
                          title="Sort by wanted mass"
                          onClick={() => toggleDemandSort('wanted')}
                        >
                          Wanted <span>{demandSortIndicator('wanted')}</span>
                        </button>
                      </th>
                      <th aria-sort={demandAriaSort('price')}>
                        <button
                          type="button"
                          className={`sort-header${demandSort.key === 'price' ? ' is-sorted' : ''}`}
                          title="Sort by max unit price"
                          onClick={() => toggleDemandSort('price')}
                        >
                          Max $/{unit}{' '}
                          <span>{demandSortIndicator('price')}</span>
                        </button>
                      </th>
                      <th aria-sort={demandAriaSort('pay')}>
                        <button
                          type="button"
                          className={`sort-header${demandSort.key === 'pay' ? ' is-sorted' : ''}`}
                          title="Sort by total pay if you fill the remaining Wanted"
                          onClick={() => toggleDemandSort('pay')}
                        >
                          Total pay <span>{demandSortIndicator('pay')}</span>
                        </button>
                      </th>
                      <th aria-sort={demandAriaSort('expires')}>
                        <button
                          type="button"
                          className={`sort-header${demandSort.key === 'expires' ? ' is-sorted' : ''}`}
                          title="Sort by expiry"
                          onClick={() => toggleDemandSort('expires')}
                        >
                          Expires <span>{demandSortIndicator('expires')}</span>
                        </button>
                      </th>
                      <th />
                    </tr>
                  </thead>
                  <tbody key={demandTableKey}>
                    {sortedDemand.length === 0 ? (
                      <tr>
                        <td colSpan={9}>
                          <p className="empty">
                            {!port
                              ? 'Select a port.'
                              : portDeskOrders.length === 0 && demand.length === 0
                                ? 'No open Demand — check after a tick.'
                                : demandCountryFilter
                                  ? 'No Demand in this country — clear the filter.'
                                  : 'No Demand on this desk yet.'}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      pagedDemand.map((o, index) => {
                        const cargoLocked = isCargoOpsCommodityLocked(
                          o.commodityId,
                        );
                        const countryId = demandDestCountryId(o);
                        const held = heldOrderIds.has(o.id);
                        return (
                        <tr
                          key={`${o.id}#${index}`}
                          className={
                            cargoLocked
                              ? 'lot-locked'
                              : held
                                ? 'lot-locked'
                                : undefined
                          }
                        >
                          <td
                            className="ports-demand-country-cell"
                            title={demandCountryLabel(countryId)}
                          >
                            {countryId || '—'}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="linkish"
                              disabled={props.busy}
                              title={o.destName?.trim() || o.destIcao}
                              onClick={() =>
                                props.onOpenAirport?.(o.destIcao)
                              }
                            >
                              {o.destIcao}
                            </button>
                          </td>
                          <td
                            className="muted"
                            title={
                              demandDeskPickupIcao
                                ? `${demandDeskPickupIcao} → ${o.destIcao}`
                                : undefined
                            }
                          >
                            {(() => {
                              const nm = demandDistNmById.get(o.id);
                              return nm != null
                                ? `${nm.toLocaleString()} nm`
                                : '—';
                            })()}
                          </td>
                          <td>
                            <div className="commodity-cell">
                              <CommodityIcon
                                commodityId={o.commodityId}
                                size={52}
                                title={commodityLabel(o)}
                              />
                              <div>
                                <strong>{commodityLabel(o)}</strong>
                                {cargoLocked ? (
                                  <span
                                    className="tag"
                                    title="Unlock via Cargo Ops ladder"
                                  >
                                    Locked
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td>{props.formatTonnes(o.remainingKg)}</td>
                          <td>{formatUnitPrice(o.maxUnitPriceUsd)}</td>
                          <td
                            title={`Remaining ${props.formatTonnes(o.remainingKg)} × ${formatUnitPrice(o.maxUnitPriceUsd)}`}
                          >
                            {props.formatMoney(
                              o.remainingKg * o.maxUnitPriceUsd,
                            )}
                          </td>
                          <td
                            className="muted"
                            title={
                              props.economyTick != null
                                ? `Economy tick ${o.expiresAtTick}`
                                : undefined
                            }
                          >
                            {formatExpiresIn(
                              o.expiresAtTick,
                              props.economyTick,
                            )}
                          </td>
                          <td>
                            {cargoLocked ? (
                              <button
                                type="button"
                                className="action ghost"
                                disabled={props.busy || loading}
                                title="Locked — unlock this commodity in Hangar → Cargo Ops"
                                onClick={() => props.onOpenCargoOps?.()}
                              >
                                Locked
                              </button>
                            ) : held ? (
                              <button
                                type="button"
                                className="action ghost"
                                disabled
                                title="Already held at your warehouse — Dispatch or Release from Warehouse"
                              >
                                Held
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="accept"
                                disabled={props.busy || loading}
                                onClick={() => openAcceptModal(o)}
                              >
                                Accept
                              </button>
                            )}
                          </td>
                        </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {sortedDemand.length > 0 ? (
                <nav className="pagination" aria-label="Demand pages">
                  <p>
                    {`${(safeDemandPage - 1) * DEMAND_PAGE_SIZE + 1}–${Math.min(
                      safeDemandPage * DEMAND_PAGE_SIZE,
                      sortedDemand.length,
                    )} of ${sortedDemand.length}`}
                  </p>
                  <div>
                    <button
                      type="button"
                      disabled={safeDemandPage <= 1 || props.busy}
                      onClick={() =>
                        setDemandPage(Math.max(1, safeDemandPage - 1))
                      }
                    >
                      Previous
                    </button>
                    <span>
                      Page {safeDemandPage} of {demandPageCount}
                    </span>
                    <button
                      type="button"
                      disabled={
                        safeDemandPage >= demandPageCount || props.busy
                      }
                      onClick={() =>
                        setDemandPage(
                          Math.min(demandPageCount, safeDemandPage + 1),
                        )
                      }
                    >
                      Next
                    </button>
                  </div>
                </nav>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {buyListing ? (
        <PortBuyDialog
          listing={buyListing}
          weightSystem={props.weightSystem}
          amountText={amountText}
          kg={kg}
          previewUsd={preview}
          hubFreeKg={freeKgAtHub(buyListing.allocatedHubIcao)}
          hubCapacityKg={
            (warehouses?.warehouses ?? []).find(
              (w) =>
                w.icao.trim().toUpperCase() ===
                buyListing.allocatedHubIcao.trim().toUpperCase(),
            )?.capacityKg ?? null
          }
          logisticsActive={Boolean(
            (() => {
              const hub = buyListing.allocatedHubIcao.trim().toUpperCase();
              const wh = (warehouses?.warehouses ?? []).find(
                (w) => w.icao.trim().toUpperCase() === hub,
              );
              return wh
                ? groundStaff?.byWarehouse[wh.id]?.logisticsActive
                : false;
            })(),
          )}
          logisticsMult={(() => {
            const hub = buyListing.allocatedHubIcao.trim().toUpperCase();
            const wh = (warehouses?.warehouses ?? []).find(
              (w) => w.icao.trim().toUpperCase() === hub,
            );
            return wh
              ? groundStaff?.byWarehouse[wh.id]?.logisticsMult
              : undefined;
          })()}
          procurementActive={Boolean(
            (() => {
              const hub = buyListing.allocatedHubIcao.trim().toUpperCase();
              const wh = (warehouses?.warehouses ?? []).find(
                (w) => w.icao.trim().toUpperCase() === hub,
              );
              return wh
                ? groundStaff?.byWarehouse[wh.id]?.procurementActive
                : false;
            })(),
          )}
          procurementMult={(() => {
            const hub = buyListing.allocatedHubIcao.trim().toUpperCase();
            const wh = (warehouses?.warehouses ?? []).find(
              (w) => w.icao.trim().toUpperCase() === hub,
            );
            return wh
              ? groundStaff?.byWarehouse[wh.id]?.procurementMult
              : undefined;
          })()}
          busy={Boolean(props.busy || loading)}
          formatMoney={props.formatMoney}
          formatTonnes={props.formatTonnes}
          formatUnitPrice={formatUnitPrice}
          onAmountChange={setAmountText}
          onCancel={closeBuyModal}
          onConfirm={() => void onConfirmBuy()}
        />
      ) : null}

      {concessionOpen && port ? (
        <div
          className="confirm-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConcessionOpen(false);
          }}
        >
          <div
            className="confirm-dialog ports-concession-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ports-concession-title"
          >
            <p className="confirm-kicker">Endgame</p>
            <h3 id="ports-concession-title">{port.name} · Port FBO</h3>
            {port.concession?.status === 'yours' ? (
              <>
                <p className="ports-concession-lease">
                  {portLeaseDaysLeft != null ? (
                    <>
                      Lease ·{' '}
                      <strong>
                        {portLeaseDaysLeft === 0
                          ? 'due now'
                          : `${portLeaseDaysLeft}d left`}
                      </strong>
                      {portLeaseDaysLeft <= 2 ? ' · renew soon' : null}
                    </>
                  ) : (
                    'Lease active'
                  )}
                </p>
                <p className="muted">
                  P{port.concession.level ?? 1}
                  {(port.concession.level ?? 1) >= 3
                    ? ' · cheaper buys, faster inbound & restock'
                    : (port.concession.level ?? 1) >= 2
                      ? ' · cheaper buys, faster inbound, larger yard'
                      : ' · cheaper buys, faster inbound'}
                </p>
                <p className="muted ports-warehouse-hint">
                  Settled through this FBO{' '}
                  {props.formatTonnes(
                    port.concession.lifetimeThroughputKg ?? 0,
                  )}
                  {port.concession.recentThroughputKg != null
                    ? ` · 7d ${props.formatTonnes(port.concession.recentThroughputKg)}`
                    : ''}
                  {' '}
                  (Demand / WH haul settle — not buys)
                </p>
                <div className="confirm-actions">
                  <button
                    type="button"
                    className="action ghost"
                    disabled={props.busy || loading}
                    onClick={() => setConcessionOpen(false)}
                  >
                    Close
                  </button>
                  {canPortCapex &&
                  port.concession.upgrade &&
                  (port.concession.level ?? 1) < 3 ? (
                    <button
                      type="button"
                      className="action ghost"
                      disabled={
                        props.busy || loading || !port.concession.upgrade.ok
                      }
                      title={
                        port.concession.upgrade.ok
                          ? (port.concession.level ?? 1) >= 2
                            ? 'P3 restock cadence'
                            : 'Enlarge factory cap'
                          : port.concession.upgrade.reasons.join(' · ')
                      }
                      onClick={() =>
                        void onUpgradeConcession(
                          port.id,
                          port.concession?.upgrade?.upgradeUsd ??
                            ((port.concession?.level ?? 1) >= 2
                              ? 280_000
                              : 220_000),
                          port.concession?.upgrade?.toLevel ??
                            ((port.concession?.level ?? 1) >= 2 ? 3 : 2),
                        )
                      }
                    >
                      {(port.concession.level ?? 1) >= 2 ? 'P3 terminal' : 'P2 yard'}
                      {port.concession.upgrade.upgradeUsd
                        ? ` · ${props.formatMoney(port.concession.upgrade.upgradeUsd)}`
                        : ''}
                    </button>
                  ) : null}
                  {canPortCapex ? (
                  <button
                    type="button"
                    className="accept"
                    disabled={props.busy || loading}
                    onClick={() =>
                      void onRenewConcession(
                        port.id,
                        port.concession?.renewLeaseUsd ??
                          port.concession?.claim?.leaseUsd ??
                          17_500,
                      )
                    }
                  >
                    Renew lease
                    {port.concession?.renewLeaseUsd != null
                      ? ` · ${props.formatMoney(port.concession.renewLeaseUsd)}`
                      : port.concession?.claim?.leaseUsd != null
                        ? ` · ${props.formatMoney(port.concession.claim.leaseUsd)}`
                        : ''}
                  </button>
                  ) : (
                    <p className="muted">Only the company owner can renew or upgrade.</p>
                  )}
                </div>
              </>
            ) : port.concession?.status === 'held' ? (
              <>
                <p className="muted">
                  Another company holds this Port FBO. You can still buy
                  listings and own a warehouse at pickup hubs.
                </p>
                <div className="confirm-actions">
                  <button
                    type="button"
                    className="action ghost"
                    onClick={() => setConcessionOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="muted">
                  Claim requires a T3 warehouse at a pickup hub,{' '}
                  {(
                    port.concession?.claim?.shippedNeededKg ?? 25_000
                  ).toLocaleString()}{' '}
                  kg shipped from that WH, and CAPEX + first lease window.
                </p>
                {port.concession?.claim && !port.concession.claim.ok ? (
                  <ul className="ports-concession-gates">
                    {port.concession.claim.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                ) : port.concession?.claim?.ok ? (
                  <p className="muted">Gates met — ready to claim.</p>
                ) : null}
                <div className="confirm-actions">
                  <button
                    type="button"
                    className="action ghost"
                    disabled={props.busy || loading}
                    onClick={() => setConcessionOpen(false)}
                  >
                    Close
                  </button>
                  {canPortCapex ? (
                  <button
                    type="button"
                    className="accept"
                    disabled={
                      props.busy || loading || !port.concession?.claim?.ok
                    }
                    title={
                      port.concession?.claim?.ok
                        ? `Claim $${(
                            (port.concession.claim.claimUsd ?? 0) +
                            (port.concession.claim.leaseUsd ?? 0)
                          ).toLocaleString()} (CAPEX + first lease)`
                        : port.concession?.claim?.reasons.join(' · ')
                    }
                    onClick={() => void onClaimConcession(port.id)}
                  >
                    Claim
                    {port.concession?.claim
                      ? ` · ${props.formatMoney(
                          port.concession.claim.claimUsd +
                            port.concession.claim.leaseUsd,
                        )}`
                      : ''}
                  </button>
                  ) : (
                    <p className="muted">Only the company owner can claim Port FBO.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {acceptOrder ? (
        <DemandAcceptDialog
          order={acceptOrder}
          originIcao={acceptOrigin}
          aircraftId={acceptAircraftId}
          originOptions={acceptOriginOptions}
          aircraftOptions={acceptAircraftOptions}
          vaAircraftIds={props.vaAircraftIds}
          selectedOriginStockKg={selectedOriginStockKg}
          pullPreview={acceptPullPreview}
          intlPreview={acceptIntlPreview}
          demandDeskMult={(() => {
            const wh = (warehouses?.warehouses ?? []).find(
              (w) =>
                w.icao.trim().toUpperCase() ===
                acceptOrigin.trim().toUpperCase(),
            );
            return wh
              ? groundStaff?.byWarehouse[wh.id]?.demandDeskMult
              : undefined;
          })()}
          distanceNm={acceptDistanceNm}
          mode={acceptMode}
          busy={Boolean(props.busy || loading)}
          formatTonnes={props.formatTonnes}
          formatUnitPrice={formatUnitPrice}
          formatMoney={props.formatMoney}
          onOriginChange={(icao) => {
            setAcceptOrigin(icao);
            const aircraft = props.fleet.filter(
              (a) =>
                a.status === 'parked' &&
                a.locationIcao.trim().toUpperCase() === icao.toUpperCase(),
            );
            setAcceptAircraftId(aircraft[0]?.id ?? '');
          }}
          onAircraftChange={setAcceptAircraftId}
          onModeChange={setAcceptMode}
          onCancel={closeAcceptModal}
          onConfirmHold={() => void onConfirmHold()}
          onConfirmFly={() => void onConfirmAccept()}
          clientUpdateRequiredMin={props.clientUpdateRequiredMin}
          onOpenUpdates={props.onOpenUpdates}
        />
      ) : null}

      {dispatchHold ? (
        <DemandDispatchHoldDialog
          hold={dispatchHold}
          aircraftId={dispatchAircraftId}
          aircraftOptions={dispatchAircraftOptions}
          mode={
            (dispatchHold.kind ?? 'demand') === 'bridge'
              ? canPortDeskOps
                ? dispatchMode
                : 'fly'
              : 'fly'
          }
          allowShuttle={canPortDeskOps}
          shuttleQuote={shuttleQuote}
          busy={Boolean(props.busy || loading)}
          formatTonnes={props.formatTonnes}
          formatMoney={props.formatMoney}
          onAircraftChange={setDispatchAircraftId}
          onModeChange={setDispatchMode}
          onCancel={() => {
            setDispatchHold(null);
            setDispatchAircraftId('');
            setDispatchMode('fly');
            setShuttleQuote(null);
          }}
          onConfirm={() => void onConfirmDispatchHold()}
          clientUpdateRequiredMin={props.clientUpdateRequiredMin}
          onOpenUpdates={props.onOpenUpdates}
        />
      ) : null}

      {bridgeDraft ? (
        <WarehouseBridgeDialog
          originIcao={bridgeDraft.originIcao}
          commodityId={bridgeDraft.commodityId}
          destIcao={bridgeDest}
          destOptions={bridgeDestOptions.map((w) => ({
            icao: w.icao.trim().toUpperCase(),
            inboundFreeKg: w.inboundFreeKg ?? w.freeKg ?? 0,
          }))}
          mode={bridgeMode}
          aircraftId={bridgeAircraftId}
          aircraftOptions={bridgeAircraftOptions}
          pilotPayUsd={bridgePilotPayUsd}
          payQuote={bridgePayQuote}
          busy={Boolean(props.busy || loading)}
          formatTonnes={props.formatTonnes}
          formatMoney={props.formatMoney}
          onDestChange={(icao) => {
            setBridgeDest(icao);
            setBridgePilotPayUsd(null);
          }}
          onModeChange={setBridgeMode}
          onAircraftChange={setBridgeAircraftId}
          onPilotPayChange={setBridgePilotPayUsd}
          onCancel={() => {
            setBridgeDraft(null);
            setBridgePilotPayUsd(null);
            setBridgePayQuote(null);
          }}
          onConfirm={() => void onConfirmBridge()}
          clientUpdateRequiredMin={props.clientUpdateRequiredMin}
          onOpenUpdates={props.onOpenUpdates}
        />
      ) : null}

      {haulDraft ? (
        <WarehouseHaulDialog
          originIcao={haulDraft.originIcao}
          commodityId={haulDraft.commodityId}
          destIcao={haulDest}
          mode={haulMode}
          aircraftId={haulAircraftId}
          aircraftOptions={haulAircraftOptions}
          weightSystem={props.weightSystem}
          amountText={haulAmountText}
          kg={haulKg}
          freeKg={haulFreeKg}
          opsMaxCargoKg={haulOpsMaxCargoKg}
          payQuote={haulPayQuote}
          busy={Boolean(props.busy || loading)}
          formatTonnes={props.formatTonnes}
          formatMoney={props.formatMoney}
          formatUnitPrice={formatUnitPrice}
          onDestChange={setHaulDest}
          onModeChange={setHaulMode}
          onAircraftChange={setHaulAircraftId}
          onAmountChange={setHaulAmountText}
          onCancel={() => {
            setHaulDraft(null);
            setHaulPayQuote(null);
            setHaulOpsMaxCargoKg(null);
          }}
          onConfirm={() => void onConfirmHaul()}
          clientUpdateRequiredMin={props.clientUpdateRequiredMin}
          onOpenUpdates={props.onOpenUpdates}
        />
      ) : null}

      {scoutHoldDraft ? (
        <ScoutHoldDialog
          kind={scoutHoldDraft.kind}
          suggestion={scoutHoldDraft.suggestion}
          weightSystem={props.weightSystem}
          busy={Boolean(props.busy || loading)}
          formatTonnes={props.formatTonnes}
          formatMoney={props.formatMoney}
          onCancel={() => setScoutHoldDraft(null)}
          onConfirm={(kg) => {
            const draft = scoutHoldDraft;
            if (draft.kind === 'haul') {
              void onScoutHaulConfirm(draft.suggestion, kg);
            } else if (draft.kind === 'demand') {
              void onScoutDemandConfirm(draft.suggestion, kg);
            } else {
              void onScoutConfirm(draft.suggestion, kg);
            }
          }}
        />
      ) : null}

      {confirmDialog}
    </section>
  );
}

function PortBuyDialog(props: {
  listing: PortListingView;
  weightSystem: WeightSystem;
  amountText: string;
  kg: number;
  previewUsd: number;
  hubFreeKg: number;
  hubCapacityKg: number | null;
  logisticsActive?: boolean;
  logisticsMult?: number;
  procurementActive?: boolean;
  procurementMult?: number;
  busy: boolean;
  formatMoney: (n: number) => string;
  formatTonnes: (kg: number) => string;
  formatUnitPrice: (usdPerKg: number) => string;
  onAmountChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const onCancelRef = useRef(props.onCancel);
  onCancelRef.current = props.onCancel;

  const unit = massUnitLabel(props.weightSystem);
  const displayMax = Math.max(
    1,
    Math.floor(kgToDisplay(props.listing.availableKg, props.weightSystem)),
  );
  const canConfirm =
    props.kg > 0 && props.kg <= props.listing.availableKg && !props.busy;
  const hasWh = props.hubCapacityKg != null && props.hubCapacityKg > 0;
  const freeForInbound =
    props.hubFreeKg >= MIN_WAREHOUSE_INBOUND_KG ? props.hubFreeKg : 0;
  const inboundKg = hasWh ? Math.min(props.kg, freeForInbound) : 0;
  const yardHoldKg = Math.max(0, props.kg - inboundKg);
  const transferTicks =
    inboundKg > 0
      ? inboundTransferTicksClient(
          inboundKg,
          props.logisticsActive
            ? (props.logisticsMult ?? LOGISTICS_MULT)
            : 1,
        )
      : 0;
  const foreverYard =
    hasWh &&
    props.hubCapacityKg != null &&
    yardHoldKg > props.hubCapacityKg;
  const yardFeePerDay = yardHoldUsdPerDay(
    yardHoldKg,
    props.listing.commodityId,
  );

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancelRef.current();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      className="confirm-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancelRef.current();
      }}
    >
      <div
        className="confirm-dialog tone-warn"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <p className="confirm-kicker">Port purchase</p>
        <h2 id={titleId} className="confirm-title">
          <span className="commodity-inline">
            <CommodityIcon
              commodityId={props.listing.commodityId}
              size={52}
              title={commodityLabel(props.listing)}
            />
            Buy {commodityLabel(props.listing)}?
          </span>
        </h2>
        <div id={bodyId} className="confirm-body">
          <p>
            Pickup at {props.listing.allocatedHubIcao} ·{' '}
            {props.formatUnitPrice(props.listing.unitPriceUsd)}
            {props.listing.hubSpotUnitPriceUsd != null
              ? ` · hub spot ${props.formatUnitPrice(props.listing.hubSpotUnitPriceUsd)}`
              : ''}
          </p>
          <label className="cargo-amount port-buy-amount">
            Amount
            <div>
              <input
                ref={inputRef}
                type="number"
                inputMode="numeric"
                min={1}
                max={displayMax}
                step={props.weightSystem === 'imperial' ? 10 : 100}
                value={props.amountText}
                disabled={props.busy}
                aria-label={`Amount (${unit})`}
                onChange={(e) => props.onAmountChange(e.target.value)}
              />
              <span>{unit}</span>
            </div>
          </label>
          <div className="cargo-presets port-buy-presets">
            {hasWh && props.hubFreeKg > 0 ? (
              <button
                type="button"
                disabled={props.busy}
                title="Fill free warehouse space only (no yard hold)"
                onClick={() =>
                  props.onAmountChange(
                    String(
                      Math.max(
                        1,
                        Math.min(
                          displayMax,
                          Math.floor(
                            kgToDisplay(props.hubFreeKg, props.weightSystem),
                          ),
                        ),
                      ),
                    )
                  )
                }
              >
                Fill WH
              </button>
            ) : null}
            <button
              type="button"
              disabled={props.busy || displayMax <= 0}
              onClick={() =>
                props.onAmountChange(
                  String(Math.max(1, Math.floor(displayMax * 0.5))),
                )
              }
            >
              50%
            </button>
            <button
              type="button"
              disabled={props.busy || displayMax <= 0}
              onClick={() => props.onAmountChange(String(displayMax))}
            >
              Max
            </button>
          </div>
          <p className="muted port-buy-debit">
            Listing max {props.formatTonnes(props.listing.availableKg)} · debit ≈{' '}
            {props.formatMoney(props.previewUsd)}
            {props.procurementActive
              ? ` · ${procurementDiscountLabel(props.procurementMult)}`
              : ''}
          </p>
          {hasWh ? (
            <div
              className={
                foreverYard
                  ? 'port-buy-split is-warn'
                  : yardHoldKg > 0
                    ? 'port-buy-split is-yard'
                    : 'port-buy-split'
              }
            >
              <p className="port-buy-split-cap muted">
                WH free {props.formatTonnes(props.hubFreeKg)} /{' '}
                {props.formatTonnes(props.hubCapacityKg!)}
              </p>
              <ul className="port-buy-split-list">
                {inboundKg > 0 ? (
                  <li>
                    <span>To warehouse</span>
                    <span>
                      {props.formatTonnes(inboundKg)} in transit (~
                      {ticksToHoursLabel(transferTicks)}
                      {props.logisticsActive
                        ? `, ${transferDiscountLabel(props.logisticsMult)}`
                        : ''}
                      )
                    </span>
                  </li>
                ) : null}
                {yardHoldKg > 0 ? (
                  <li>
                    <span>Yard surplus</span>
                    <span>
                      {props.formatTonnes(yardHoldKg)} hold (
                      {props.formatMoney(yardFeePerDay)}/day) — Store later
                    </span>
                  </li>
                ) : (
                  <li>
                    <span>Yard</span>
                    <span>None — fits free WH</span>
                  </li>
                )}
              </ul>
              {foreverYard ? (
                <p className="confirm-quote is-error">
                  Yard remainder exceeds WH capacity — Abandon excess or fly WH
                  empty over multiple trips before it all fits.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="muted">
              No warehouse at {props.listing.allocatedHubIcao} — full amount goes
              to yard hold ({props.formatMoney(yardFeePerDay)}/day) until you buy
              WH space.
            </p>
          )}
        </div>
        <div className="confirm-actions">
          <button
            type="button"
            className="action ghost"
            disabled={props.busy}
            onClick={props.onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="accept"
            disabled={!canConfirm}
            onClick={props.onConfirm}
          >
            Confirm buy
          </button>
        </div>
      </div>
    </div>
  );
}

function ScoutHoldDialog(props: {
  kind: 'haul' | 'demand' | 'bridge';
  suggestion:
    | PortScoutHaulSuggestion
    | PortScoutDemandSuggestion
    | PortScoutBridgeSuggestion;
  weightSystem: WeightSystem;
  busy: boolean;
  formatTonnes: (kg: number) => string;
  formatMoney: (n: number) => string;
  onCancel: () => void;
  onConfirm: (kg: number) => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const onCancelRef = useRef(props.onCancel);
  onCancelRef.current = props.onCancel;
  const maxKg = Math.max(0, Math.floor(props.suggestion.kg));
  const minKg = Math.min(maxKg, SCOUT_HOLD_MIN_KG);
  const [kg, setKg] = useState(() => maxKg);
  const unit = massUnitLabel(props.weightSystem);
  const displayMax = Math.max(
    1,
    Math.floor(kgToDisplay(maxKg, props.weightSystem)),
  );
  const displayMin = Math.max(
    1,
    Math.min(displayMax, Math.floor(kgToDisplay(minKg, props.weightSystem))),
  );
  const displayValue = Math.max(
    displayMin,
    Math.min(displayMax, Math.floor(kgToDisplay(kg, props.weightSystem))),
  );

  useEffect(() => {
    setKg(maxKg);
  }, [maxKg, props.suggestion.id]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancelRef.current();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function clampKg(next: number): number {
    if (maxKg < minKg) return 0;
    return Math.max(minKg, Math.min(maxKg, Math.floor(next) || minKg));
  }

  function setFraction(fraction: number) {
    const next =
      fraction >= 1
        ? maxKg
        : Math.max(minKg, Math.min(maxKg, Math.round(maxKg * fraction)));
    setKg(clampKg(next));
  }

  const kindLabel =
    props.kind === 'haul'
      ? 'Haul'
      : props.kind === 'demand'
        ? 'Demand'
        : 'Bridge';
  const payUsd =
    'payUsd' in props.suggestion &&
    typeof props.suggestion.payUsd === 'number' &&
    props.suggestion.kg > 0
      ? Math.round((props.suggestion.payUsd * kg) / props.suggestion.kg)
      : null;
  const canConfirm = !props.busy && kg >= minKg && kg <= maxKg && maxKg > 0;

  return (
    <div
      className="confirm-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancelRef.current();
      }}
    >
      <div
        className="confirm-dialog demand-accept-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <p className="confirm-kicker">Scout · {kindLabel}</p>
        <h2 id={titleId} className="confirm-title">
          Hold {props.suggestion.originIcao}→{props.suggestion.destIcao}?
        </h2>
        <div id={bodyId} className="confirm-body">
          <p>
            {commodityLabel({ commodityId: props.suggestion.commodityId })} ·
            suggestion {props.formatTonnes(maxKg)}
            {props.suggestion.distanceNm > 0
              ? ` · ${props.suggestion.distanceNm} nm`
              : ''}
          </p>
          <p className="muted">
            Reserve only what you want to fly — leftover stock stays free for
            other Scout ideas.
          </p>
          <label className="cargo-amount">
            Quantity to hold
            <div>
              <input
                type="number"
                min={displayMin}
                max={displayMax}
                step={props.weightSystem === 'imperial' ? 10 : 100}
                value={displayValue}
                disabled={props.busy || maxKg <= 0}
                aria-label={`Amount (${unit})`}
                onChange={(e) => {
                  const next = displayToKg(
                    Number(e.target.value),
                    props.weightSystem,
                  );
                  setKg(clampKg(next));
                }}
              />
              <span>{unit}</span>
            </div>
            <input
              type="range"
              min={displayMin}
              max={displayMax}
              step={props.weightSystem === 'imperial' ? 10 : 100}
              value={displayValue}
              disabled={props.busy || maxKg <= 0}
              aria-label="Hold amount slider"
              onChange={(e) => {
                const next = displayToKg(
                  Number(e.target.value),
                  props.weightSystem,
                );
                setKg(clampKg(next));
              }}
            />
          </label>
          <div className="cargo-presets">
            {[0.25, 0.5, 0.75, 1].map((fraction) => (
              <button
                key={fraction}
                type="button"
                disabled={props.busy || maxKg <= 0}
                onClick={() => setFraction(fraction)}
              >
                {fraction === 1 ? 'Max' : `${fraction * 100}%`}
              </button>
            ))}
          </div>
          {payUsd != null ? (
            <p className="demand-accept-hint">
              Est. pay {props.formatMoney(payUsd)} · {props.formatTonnes(kg)}
            </p>
          ) : (
            <p className="demand-accept-hint">{props.formatTonnes(kg)}</p>
          )}
        </div>
        <div className="confirm-actions">
          <button
            type="button"
            className="action ghost"
            disabled={props.busy}
            onClick={props.onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="action"
            disabled={!canConfirm}
            onClick={() => props.onConfirm(kg)}
          >
            Hold {props.formatTonnes(kg)}
          </button>
        </div>
      </div>
    </div>
  );
}

function DemandAcceptDialog(props: {
  order: DemandOrderView;
  originIcao: string;
  aircraftId: string;
  originOptions: Array<{
    icao: string;
    warehouseId: string;
    stockKg: number;
    lotCount: number;
    minCostUsdPerKg: number;
    maxCostUsdPerKg: number;
    freeKg: number;
    usedKg: number;
    countryId?: string | null;
    lat?: number | null;
    lon?: number | null;
  }>;
  aircraftOptions: PlayerAircraft[];
  vaAircraftIds?: ReadonlySet<string>;
  selectedOriginStockKg: number;
  pullPreview: {
    takeKg: number;
    avgCostUsdPerKg: number;
    costUsd: number;
    payUsd: number;
    marginUsd: number;
    limitedBy: 'order' | 'stock' | 'aircraft';
  } | null;
  intlPreview: {
    international: boolean;
    allowed: boolean;
    unitPriceMult: number;
    blockReason: string | null;
    originCountryId: string | null;
    destCountryId: string | null;
  } | null;
  demandDeskMult?: number;
  distanceNm: number | null;
  mode: 'hold' | 'fly';
  busy: boolean;
  formatTonnes: (kg: number) => string;
  formatUnitPrice: (usdPerKg: number) => string;
  formatMoney: (n: number) => string;
  onOriginChange: (icao: string) => void;
  onAircraftChange: (id: string) => void;
  onModeChange: (mode: 'hold' | 'fly') => void;
  onCancel: () => void;
  onConfirmHold: () => void;
  onConfirmFly: () => void;
  clientUpdateRequiredMin?: string | null;
  onOpenUpdates?: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const onCancelRef = useRef(props.onCancel);
  onCancelRef.current = props.onCancel;

  const selectedOrigin = props.originIcao.trim().toUpperCase();
  const hasUsableOrigin = props.selectedOriginStockKg > 0;
  const intlOk = !props.intlPreview || props.intlPreview.allowed;
  const canHold =
    Boolean(selectedOrigin) && hasUsableOrigin && intlOk && !props.busy;
  const updateBlocked = Boolean(props.clientUpdateRequiredMin);
  const canFly =
    canHold &&
    Boolean(props.aircraftId) &&
    props.aircraftOptions.length > 0 &&
    !updateBlocked;
  const preview = props.pullPreview;
  const intl = props.intlPreview;
  const deskMult =
    typeof props.demandDeskMult === 'number' &&
    Number.isFinite(props.demandDeskMult) &&
    props.demandDeskMult > 0
      ? props.demandDeskMult
      : 1;
  const effectiveUnit =
    props.order.maxUnitPriceUsd *
    (intl?.allowed && intl.unitPriceMult > 1 ? intl.unitPriceMult : 1) *
    deskMult;
  const limitedByLabel =
    preview?.limitedBy === 'aircraft'
      ? 'limited by aircraft cargo'
      : preview?.limitedBy === 'stock'
        ? 'limited by warehouse stock'
        : preview?.limitedBy === 'order'
          ? 'limited by order remaining'
          : null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancelRef.current();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      className="confirm-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancelRef.current();
      }}
    >
      <div
        className="confirm-dialog demand-accept-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <p className="confirm-kicker">Demand Board</p>
        <h2 id={titleId} className="confirm-title">
          Deliver to {props.order.destIcao}?
        </h2>
        <div id={bodyId} className="confirm-body">
          <p>
            {commodityLabel(props.order)} · up to{' '}
            {props.formatTonnes(props.order.remainingKg)} ·{' '}
            {props.formatUnitPrice(effectiveUnit)}
            {intl?.international && intl.allowed ? (
              <span className="demand-accept-intl-badge" title="Port-fed international">
                {' '}
                Intl ×{intl.unitPriceMult.toFixed(2)}
              </span>
            ) : null}
            {deskMult > 1 ? (
              <span className="muted" title="Demand desk perk">
                {' '}
                · {demandPayBoostLabel(deskMult)}
              </span>
            ) : null}
          </p>
          {props.distanceNm != null && Number.isFinite(props.distanceNm) ? (
            <p className="demand-accept-hint">
              Distance {selectedOrigin || 'WH'}→{props.order.destIcao}:{' '}
              <strong>
                {Number.isFinite(props.distanceNm)
                  ? `${Math.round(props.distanceNm).toLocaleString()} nm`
                  : '—'}
              </strong>
            </p>
          ) : selectedOrigin ? (
            <p className="demand-accept-hint">Distance unavailable for this route.</p>
          ) : null}
          {intl?.international && intl.allowed ? (
            <p className="demand-accept-hint demand-accept-intl-hint">
              International {intl.originCountryId}→{intl.destCountryId} from
              port warehouse — pay includes intl premium.
            </p>
          ) : null}
          {intl?.blockReason ? (
            <p className="demand-accept-hint demand-accept-intl-block" role="alert">
              {intl.blockReason}
            </p>
          ) : null}

          <div className="demand-accept-section">
            <span className="demand-accept-label">Action</span>
            <div className="demand-accept-picks" role="listbox" aria-label="Hold or fly">
              <button
                type="button"
                role="option"
                aria-selected={props.mode === 'hold'}
                className={`demand-accept-pick${props.mode === 'hold' ? ' is-active' : ''}`}
                disabled={props.busy}
                onClick={() => props.onModeChange('hold')}
              >
                <strong>Hold at WH</strong>
                <span>Pledge stock, fly later</span>
              </button>
              <button
                type="button"
                role="option"
                aria-selected={props.mode === 'fly'}
                className={`demand-accept-pick${props.mode === 'fly' ? ' is-active' : ''}`}
                disabled={props.busy}
                onClick={() => props.onModeChange('fly')}
              >
                <strong>Fly now</strong>
                <span>Needs parked aircraft</span>
              </button>
            </div>
          </div>

          <div className="demand-accept-section">
            <span className="demand-accept-label">From warehouse</span>
            {props.originOptions.length === 0 ? (
              <p className="demand-accept-hint">
                No warehouses yet — buy one at a port pickup hub first.
              </p>
            ) : (
              <div className="demand-accept-picks" role="listbox" aria-label="Warehouse origin">
                {props.originOptions.map((o) => {
                  const active = o.icao === selectedOrigin;
                  const usable = o.stockKg > 0;
                  return (
                    <button
                      key={o.warehouseId}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`demand-accept-pick${active ? ' is-active' : ''}${usable ? '' : ' is-empty'}`}
                      disabled={props.busy}
                      onClick={() => props.onOriginChange(o.icao)}
                    >
                      <strong>
                        {o.icao}
                        {o.countryId ? (
                          <span className="demand-accept-pick-country">
                            {' '}
                            {o.countryId}
                          </span>
                        ) : null}
                      </strong>
                      <span>
                        {usable
                          ? `${props.formatTonnes(o.stockKg)}${
                              o.lotCount > 1 ? ` · ${o.lotCount} lots` : ''
                            }`
                          : `No ${commodityLabel(props.order).toLowerCase()}`}
                      </span>
                      {usable ? (
                        <span>
                          {o.minCostUsdPerKg === o.maxCostUsdPerKg
                            ? props.formatUnitPrice(o.minCostUsdPerKg)
                            : `${props.formatUnitPrice(o.minCostUsdPerKg)}–${props.formatUnitPrice(o.maxCostUsdPerKg)}`}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {props.mode === 'fly' ? (
          <div className="demand-accept-section">
            <span className="demand-accept-label">
              Aircraft at {selectedOrigin || 'origin'}
            </span>
            {!selectedOrigin ? (
              <p className="demand-accept-hint">Select a warehouse first.</p>
            ) : props.aircraftOptions.length === 0 ? (
              <p className="demand-accept-hint">
                No parked aircraft at {selectedOrigin} — ferry one there.
              </p>
            ) : (
              <div className="demand-accept-picks" role="listbox" aria-label="Aircraft">
                {props.aircraftOptions.map((a) => {
                  const active = a.id === props.aircraftId;
                  const prefix = props.vaAircraftIds?.has(a.id)
                    ? 'Airline · '
                    : 'Yours · ';
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`demand-accept-pick${active ? ' is-active' : ''}`}
                      disabled={props.busy}
                      onClick={() => props.onAircraftChange(a.id)}
                    >
                      <strong>
                        {prefix}
                        {a.label ?? a.id}
                      </strong>
                      <span>{a.locationIcao}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          ) : null}

          {selectedOrigin && !hasUsableOrigin ? (
            <p className="demand-accept-hint">
              Store {commodityLabel(props.order).toLowerCase()} in{' '}
              {selectedOrigin} before staging this demand.
            </p>
          ) : null}

          {preview &&
          hasUsableOrigin &&
          (props.mode === 'hold' || props.aircraftId) ? (
            <div className="demand-accept-pull" role="status">
              <p className="demand-accept-pull-title">
                Pull from {selectedOrigin}
                {limitedByLabel ? ` · ${limitedByLabel}` : ''}
              </p>
              <dl className="demand-accept-pull-grid">
                <div>
                  <dt>Mass</dt>
                  <dd>{props.formatTonnes(preview.takeKg)}</dd>
                </div>
                <div>
                  <dt>Avg cost</dt>
                  <dd>{props.formatUnitPrice(preview.avgCostUsdPerKg)}</dd>
                </div>
                <div>
                  <dt>Stock cost</dt>
                  <dd>{props.formatMoney(preview.costUsd)}</dd>
                </div>
                <div>
                  <dt>Payout</dt>
                  <dd>{props.formatMoney(preview.payUsd)}</dd>
                </div>
                <div>
                  <dt>Margin</dt>
                  <dd
                    className={
                      typeof preview.marginUsd === 'number' &&
                      Number.isFinite(preview.marginUsd) &&
                      preview.marginUsd >= 0
                        ? 'demand-accept-margin-pos'
                        : 'demand-accept-margin-neg'
                    }
                  >
                    {Number.isFinite(preview.marginUsd)
                      ? props.formatMoney(preview.marginUsd)
                      : '—'}
                  </dd>
                </div>
              </dl>
              <p className="demand-accept-hint">
                FIFO from warehouse lots at this hub — cost is the weighted
                average of the piles that leave.
              </p>
            </div>
          ) : null}
        </div>
        <div className="confirm-actions">
          <button
            type="button"
            className="action ghost"
            disabled={props.busy}
            onClick={props.onCancel}
          >
            Cancel
          </button>
          {props.mode === 'hold' ? (
            <button
              type="button"
              className="accept"
              disabled={!canHold}
              onClick={props.onConfirmHold}
            >
              Hold at WH
            </button>
          ) : (
            <button
              type="button"
              className="accept"
              disabled={!canFly}
              title={
                updateBlocked
                  ? `Update required · v${props.clientUpdateRequiredMin}+`
                  : undefined
              }
              onClick={props.onConfirmFly}
            >
              {updateBlocked ? formatClientUpdateCtaLabel() : 'Fly now'}
            </button>
          )}
        </div>
        {updateBlocked ? (
          <p className="demand-accept-hint cargo-dialog-error">
            Update required · v{props.clientUpdateRequiredMin}+
            {props.onOpenUpdates ? (
              <>
                {' '}
                <button
                  type="button"
                  className="action ghost compact"
                  onClick={() => props.onOpenUpdates?.()}
                >
                  Settings → Updates
                </button>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function DemandDispatchHoldDialog(props: {
  hold: PlayerDemandHoldView;
  aircraftId: string;
  aircraftOptions: PlayerAircraft[];
  mode: 'fly' | 'shuttle';
  /** Owner/dispatcher only on VA — pilots fly. Default true (solo). */
  allowShuttle?: boolean;
  shuttleQuote: PortShuttleQuote | null;
  busy: boolean;
  formatTonnes: (kg: number) => string;
  formatMoney: (n: number) => string;
  onAircraftChange: (id: string) => void;
  onModeChange: (mode: 'fly' | 'shuttle') => void;
  onCancel: () => void;
  onConfirm: () => void;
  clientUpdateRequiredMin?: string | null;
  onOpenUpdates?: () => void;
}) {
  const titleId = useId();
  const isBridge = (props.hold.kind ?? 'demand') === 'bridge';
  const allowShuttle = props.allowShuttle !== false;
  const bridgePilotPay =
    props.hold.pilotPayUsd != null
      ? props.hold.pilotPayUsd
      : props.hold.unitPriceUsd > 0
        ? Math.round(props.hold.unitPriceUsd * props.hold.kg * 100) / 100
        : 0;
  const paidInternalHaul = isBridge && bridgePilotPay > 0;
  const updateBlocked = Boolean(props.clientUpdateRequiredMin);
  const canConfirm =
    Boolean(props.aircraftId) &&
    props.aircraftOptions.length > 0 &&
    !props.busy &&
    !updateBlocked;
  return (
    <div
      className="confirm-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onCancel();
      }}
    >
      <div
        className="confirm-dialog demand-accept-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <p className="confirm-kicker">
          {isBridge
            ? props.mode === 'shuttle'
              ? 'Port shuttle'
              : paidInternalHaul
                ? 'Internal haul'
                : 'Warehouse bridge'
            : props.hold.kind === 'haul'
              ? 'Warehouse haul'
              : 'Warehouse hold'}
        </p>
        <h2 id={titleId} className="confirm-title">
          {props.mode === 'shuttle' && isBridge
            ? `Shuttle ${props.hold.originIcao}→${props.hold.destIcao}?`
            : `Dispatch ${props.hold.originIcao}→${props.hold.destIcao}?`}
        </h2>
        <div className="confirm-body">
          {isBridge ? (
            <div className="demand-accept-section">
              <span className="demand-accept-label">How</span>
              <div className="demand-accept-picks" role="listbox" aria-label="Dispatch mode">
                <button
                  type="button"
                  role="option"
                  aria-selected={props.mode === 'fly'}
                  className={`demand-accept-pick${props.mode === 'fly' ? ' is-active' : ''}`}
                  disabled={props.busy}
                  onClick={() => props.onModeChange('fly')}
                >
                  <strong>You fly</strong>
                  <span>Watch / Dispatch</span>
                </button>
                {allowShuttle ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={props.mode === 'shuttle'}
                  className={`demand-accept-pick${props.mode === 'shuttle' ? ' is-active' : ''}`}
                  disabled={props.busy || paidInternalHaul}
                  onClick={() => props.onModeChange('shuttle')}
                >
                  <strong>Port shuttle</strong>
                  <span>
                    {paidInternalHaul
                      ? 'Unpaid bridge only'
                      : 'Fee + fuel · wall-clock'}
                  </span>
                </button>
                ) : null}
              </div>
            </div>
          ) : null}
          <p>
            {props.formatTonnes(props.hold.kg)} pledged at the warehouse —
            pick a parked aircraft at {props.hold.originIcao}
            {isBridge
              ? props.mode === 'shuttle'
                ? '. NPC flies Light GA / Light TP only — cargo lands in dest WH; no freight pay.'
                : paidInternalHaul
                  ? `. Internal haul · pilot pay ${props.formatMoney(bridgePilotPay)} (company) — cargo lands in dest WH.`
                  : '. Unpaid bridge — cargo lands in the dest warehouse.'
              : props.hold.kind === 'haul'
                ? '. Paid trunk freight — cargo fills the dest terminal.'
                : '.'}
          </p>
          {paidInternalHaul && props.mode === 'fly' ? (
            <p className="demand-accept-hint">
              Pilot pay {props.formatMoney(bridgePilotPay)} · company→pilot on
              settle
            </p>
          ) : null}
          {props.mode === 'shuttle' && isBridge && props.shuttleQuote ? (
            <p className="demand-accept-hint">
              Shuttle fee {props.formatMoney(props.shuttleQuote.feeUsd)} ·{' '}
              {props.shuttleQuote.distanceNm} nm · active{' '}
              {props.shuttleQuote.activeShuttles}/
              {props.shuttleQuote.maxActive}
            </p>
          ) : null}
          <div className="demand-accept-section">
            <span className="demand-accept-label">Aircraft</span>
            {props.aircraftOptions.length === 0 ? (
              <p className="demand-accept-hint">
                {props.mode === 'shuttle'
                  ? `No Light GA / Light TP parked at ${props.hold.originIcao}.`
                  : `No parked aircraft at ${props.hold.originIcao} — ferry one there.`}
              </p>
            ) : (
              <div className="demand-accept-picks" role="listbox" aria-label="Aircraft">
                {props.aircraftOptions.map((a) => {
                  const active = a.id === props.aircraftId;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`demand-accept-pick${active ? ' is-active' : ''}`}
                      disabled={props.busy}
                      onClick={() => props.onAircraftChange(a.id)}
                    >
                      <strong>{a.label ?? a.id}</strong>
                      <span>{a.locationIcao}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="confirm-actions">
          <button
            type="button"
            className="action ghost"
            disabled={props.busy}
            onClick={props.onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="accept"
            disabled={!canConfirm}
            title={
              updateBlocked
                ? `Update required · v${props.clientUpdateRequiredMin}+`
                : undefined
            }
            onClick={props.onConfirm}
          >
            {updateBlocked
              ? formatClientUpdateCtaLabel()
              : props.mode === 'shuttle' && isBridge
                ? 'Launch shuttle'
                : 'Fly now'}
          </button>
        </div>
        {updateBlocked ? (
          <p className="demand-accept-hint cargo-dialog-error">
            Update required · v{props.clientUpdateRequiredMin}+
            {props.onOpenUpdates ? (
              <>
                {' '}
                <button
                  type="button"
                  className="action ghost compact"
                  onClick={() => props.onOpenUpdates?.()}
                >
                  Settings → Updates
                </button>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function WarehouseBridgeDialog(props: {
  originIcao: string;
  commodityId: string;
  destIcao: string;
  destOptions: { icao: string; inboundFreeKg: number }[];
  mode: 'hold' | 'fly';
  aircraftId: string;
  aircraftOptions: PlayerAircraft[];
  pilotPayUsd: number | null;
  payQuote: InternalHaulPayQuote | null;
  busy: boolean;
  formatTonnes: (kg: number) => string;
  formatMoney: (n: number) => string;
  onDestChange: (icao: string) => void;
  onModeChange: (mode: 'hold' | 'fly') => void;
  onAircraftChange: (id: string) => void;
  onPilotPayChange: (n: number | null) => void;
  onCancel: () => void;
  onConfirm: () => void;
  clientUpdateRequiredMin?: string | null;
  onOpenUpdates?: () => void;
}) {
  const titleId = useId();
  const dest = props.destOptions.find((d) => d.icao === props.destIcao);
  const quote = props.payQuote;
  const payUsd = props.pilotPayUsd ?? quote?.suggestedPayUsd ?? 0;
  const updateBlocked =
    props.mode === 'fly' && Boolean(props.clientUpdateRequiredMin);
  const canConfirm =
    Boolean(props.destIcao) &&
    props.destOptions.length > 0 &&
    !props.busy &&
    !updateBlocked &&
    (props.mode === 'hold' ||
      (Boolean(props.aircraftId) && props.aircraftOptions.length > 0));
  return (
    <div
      className="confirm-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onCancel();
      }}
    >
      <div
        className="confirm-dialog demand-accept-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <p className="confirm-kicker">Internal haul</p>
        <h2 id={titleId} className="confirm-title">
          {props.originIcao}→{props.destIcao || '…'}?
        </h2>
        <div className="confirm-body">
          <p>
            WH→WH company cargo. Pilot pay is company→pilot (solo = ledger
            only). Set pay to $0 for an unpaid bridge (Port shuttle OK).
          </p>
          <div className="demand-accept-section">
            <span className="demand-accept-label">Destination warehouse</span>
            {props.destOptions.length === 0 ? (
              <p className="demand-accept-hint">
                Buy a second warehouse to reposition stock.
              </p>
            ) : (
              <div
                className="demand-accept-picks"
                role="listbox"
                aria-label="Destination warehouse"
              >
                {props.destOptions.map((w) => {
                  const active = w.icao === props.destIcao;
                  return (
                    <button
                      key={w.icao}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`demand-accept-pick${active ? ' is-active' : ''}`}
                      disabled={props.busy}
                      onClick={() => props.onDestChange(w.icao)}
                    >
                      <strong>{w.icao}</strong>
                      <span>{props.formatTonnes(w.inboundFreeKg)} free</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {dest ? (
            <p className="demand-accept-hint">
              Dest inbound free {props.formatTonnes(dest.inboundFreeKg)} ·{' '}
              {props.commodityId}
              {quote ? ` · ${quote.distanceNm} nm` : ''}
            </p>
          ) : null}
          {quote ? (
            <div className="demand-accept-section">
              <span className="demand-accept-label">
                Pilot pay ({props.formatMoney(quote.minPayUsd)}–
                {props.formatMoney(quote.maxPayUsd)})
              </span>
              <input
                type="range"
                min={quote.minPayUsd}
                max={quote.maxPayUsd}
                step={1}
                value={Math.min(
                  quote.maxPayUsd,
                  Math.max(quote.minPayUsd, payUsd || quote.minPayUsd),
                )}
                disabled={props.busy || payUsd <= 0}
                onChange={(event) =>
                  props.onPilotPayChange(Number(event.target.value))
                }
                aria-label="Internal haul pilot pay"
              />
              <p className="demand-accept-hint">
                {props.formatMoney(payUsd)}
                {payUsd <= 0
                  ? ' · unpaid bridge'
                  : ` · suggest ${props.formatMoney(quote.suggestedPayUsd)}`}
                {' · '}
                <button
                  type="button"
                  className="action ghost"
                  disabled={props.busy}
                  onClick={() => props.onPilotPayChange(0)}
                >
                  Unpaid ($0)
                </button>{' '}
                <button
                  type="button"
                  className="action ghost"
                  disabled={props.busy}
                  onClick={() =>
                    props.onPilotPayChange(quote.suggestedPayUsd)
                  }
                >
                  Suggest
                </button>
              </p>
            </div>
          ) : null}
          <div className="demand-accept-section">
            <span className="demand-accept-label">When</span>
            <div className="demand-accept-picks" role="listbox" aria-label="Hold or fly">
              <button
                type="button"
                role="option"
                aria-selected={props.mode === 'hold'}
                className={`demand-accept-pick${props.mode === 'hold' ? ' is-active' : ''}`}
                disabled={props.busy}
                onClick={() => props.onModeChange('hold')}
              >
                <strong>Hold at WH</strong>
                <span>Reserve kg — fly later</span>
              </button>
              <button
                type="button"
                role="option"
                aria-selected={props.mode === 'fly'}
                className={`demand-accept-pick${props.mode === 'fly' ? ' is-active' : ''}`}
                disabled={props.busy}
                onClick={() => props.onModeChange('fly')}
              >
                <strong>Fly now</strong>
                <span>Stage Dispatch</span>
              </button>
            </div>
          </div>
          {props.mode === 'fly' ? (
            <div className="demand-accept-section">
              <span className="demand-accept-label">Aircraft</span>
              {props.aircraftOptions.length === 0 ? (
                <p className="demand-accept-hint">
                  No parked aircraft at {props.originIcao} — ferry one there.
                </p>
              ) : (
                <div
                  className="demand-accept-picks"
                  role="listbox"
                  aria-label="Aircraft"
                >
                  {props.aircraftOptions.map((a) => {
                    const active = a.id === props.aircraftId;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={`demand-accept-pick${active ? ' is-active' : ''}`}
                        disabled={props.busy}
                        onClick={() => props.onAircraftChange(a.id)}
                      >
                        <strong>{a.label ?? a.id}</strong>
                        <span>{a.locationIcao}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>
        <div className="confirm-actions">
          <button
            type="button"
            className="action ghost"
            disabled={props.busy}
            onClick={props.onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="accept"
            disabled={!canConfirm}
            title={
              updateBlocked
                ? `Update required · v${props.clientUpdateRequiredMin}+`
                : undefined
            }
            onClick={props.onConfirm}
          >
            {updateBlocked
              ? formatClientUpdateCtaLabel()
              : props.mode === 'hold'
                ? 'Hold'
                : 'Fly now'}
          </button>
        </div>
        {updateBlocked ? (
          <p className="demand-accept-hint cargo-dialog-error">
            Update required · v{props.clientUpdateRequiredMin}+
            {props.onOpenUpdates ? (
              <>
                {' '}
                <button
                  type="button"
                  className="action ghost compact"
                  onClick={() => props.onOpenUpdates?.()}
                >
                  Settings → Updates
                </button>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function WarehouseHaulDialog(props: {
  originIcao: string;
  commodityId: string;
  destIcao: string;
  mode: 'hold' | 'fly';
  aircraftId: string;
  aircraftOptions: PlayerAircraft[];
  weightSystem: WeightSystem;
  amountText: string;
  kg: number;
  freeKg: number;
  opsMaxCargoKg: number | null;
  payQuote: WarehouseHaulPayQuote | null;
  busy: boolean;
  formatTonnes: (kg: number) => string;
  formatMoney: (n: number) => string;
  formatUnitPrice: (usdPerKg: number) => string;
  onDestChange: (icao: string) => void;
  onModeChange: (mode: 'hold' | 'fly') => void;
  onAircraftChange: (id: string) => void;
  onAmountChange: (text: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  clientUpdateRequiredMin?: string | null;
  onOpenUpdates?: () => void;
}) {
  const titleId = useId();
  const unit = massUnitLabel(props.weightSystem);
  const destOk = /^[A-Z0-9]{3,4}$/.test(props.destIcao.trim().toUpperCase());
  const displayMax = Math.max(
    1,
    Math.floor(kgToDisplay(props.freeKg, props.weightSystem)),
  );
  const opsCapDisplay =
    props.mode === 'fly' && props.opsMaxCargoKg != null && props.opsMaxCargoKg > 0
      ? Math.max(
          1,
          Math.floor(kgToDisplay(props.opsMaxCargoKg, props.weightSystem)),
        )
      : null;
  const overOps =
    props.mode === 'fly' &&
    props.opsMaxCargoKg != null &&
    props.kg > props.opsMaxCargoKg;
  const updateBlocked =
    props.mode === 'fly' && Boolean(props.clientUpdateRequiredMin);
  const canConfirm =
    destOk &&
    props.kg > 0 &&
    !overOps &&
    !props.busy &&
    !updateBlocked &&
    (props.mode === 'hold' ||
      (Boolean(props.aircraftId) && props.aircraftOptions.length > 0));
  return (
    <div
      className="confirm-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onCancel();
      }}
    >
      <div
        className="confirm-dialog demand-accept-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <p className="confirm-kicker">Warehouse haul</p>
        <h2 id={titleId} className="confirm-title">
          {props.originIcao}→{props.destIcao.trim().toUpperCase() || '…'}?
        </h2>
        <div className="confirm-body">
          <p>
            Fly stock from your warehouse to a destination terminal. Pay is
            trunk freight (Wide tonnage when the load is XL-sized) — not a
            Demand Board order.
          </p>
          <div className="demand-accept-section">
            <span className="demand-accept-label">Destination ICAO</span>
            <input
              type="text"
              className="ports-haul-dest-input"
              value={props.destIcao}
              maxLength={4}
              placeholder="e.g. SBSP"
              disabled={props.busy}
              onChange={(event) =>
                props.onDestChange(event.target.value.toUpperCase())
              }
              aria-label="Destination ICAO"
            />
          </div>
          <div className="demand-accept-section">
            <span className="demand-accept-label">Amount</span>
            <label className="cargo-amount port-buy-amount">
              Amount
              <div>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={displayMax}
                  step={props.weightSystem === 'imperial' ? 10 : 100}
                  value={props.amountText}
                  disabled={props.busy}
                  aria-label={`Amount (${unit})`}
                  onChange={(event) => props.onAmountChange(event.target.value)}
                />
                <span>{unit}</span>
              </div>
            </label>
            <div className="cargo-presets port-buy-presets">
              {opsCapDisplay != null ? (
                <button
                  type="button"
                  disabled={props.busy || props.freeKg <= 0}
                  title="Fill this airframe's route ops cap"
                  onClick={() =>
                    props.onAmountChange(
                      String(
                        Math.max(
                          1,
                          Math.min(displayMax, opsCapDisplay),
                        ),
                      ),
                    )
                  }
                >
                  Ops cap
                </button>
              ) : null}
              <button
                type="button"
                disabled={props.busy || displayMax <= 0}
                onClick={() =>
                  props.onAmountChange(
                    String(Math.max(1, Math.floor(displayMax * 0.5))),
                  )
                }
              >
                50%
              </button>
              <button
                type="button"
                disabled={props.busy || displayMax <= 0}
                onClick={() => props.onAmountChange(String(displayMax))}
              >
                Max
              </button>
            </div>
            <p className="demand-accept-hint">
              Commodity {props.commodityId} · free{' '}
              {props.formatTonnes(props.freeKg)}
              {props.mode === 'fly' && props.opsMaxCargoKg != null
                ? ` · aircraft ops ${props.formatTonnes(props.opsMaxCargoKg)}`
                : ''}
            </p>
            {overOps ? (
              <p className="demand-accept-hint confirm-quote is-error">
                Amount exceeds this airframe&apos;s ops cap for this route —
                lower kg or use Hold.
              </p>
            ) : null}
          </div>
          {destOk && props.kg > 0 ? (
            <p className="demand-accept-hint">
              {props.payQuote
                ? `Est. pay ${props.formatMoney(props.payQuote.payUsd)} · ${props.formatUnitPrice(props.payQuote.unitPriceUsd)} · ${props.payQuote.distanceNm} nm${props.payQuote.wide ? ' · Wide' : ''}`
                : 'Estimating pay…'}
            </p>
          ) : null}
          <div className="demand-accept-section">
            <span className="demand-accept-label">When</span>
            <div className="demand-accept-picks" role="listbox" aria-label="Hold or fly">
              <button
                type="button"
                role="option"
                aria-selected={props.mode === 'hold'}
                className={`demand-accept-pick${props.mode === 'hold' ? ' is-active' : ''}`}
                disabled={props.busy}
                onClick={() => props.onModeChange('hold')}
              >
                <strong>Hold at WH</strong>
                <span>Reserve kg — fly later</span>
              </button>
              <button
                type="button"
                role="option"
                aria-selected={props.mode === 'fly'}
                className={`demand-accept-pick${props.mode === 'fly' ? ' is-active' : ''}`}
                disabled={props.busy}
                onClick={() => props.onModeChange('fly')}
              >
                <strong>Fly now</strong>
                <span>Stage Dispatch</span>
              </button>
            </div>
          </div>
          {props.mode === 'fly' ? (
            <div className="demand-accept-section">
              <span className="demand-accept-label">Aircraft</span>
              {props.aircraftOptions.length === 0 ? (
                <p className="demand-accept-hint">
                  No parked aircraft at {props.originIcao} — ferry one there.
                </p>
              ) : (
                <div
                  className="demand-accept-picks"
                  role="listbox"
                  aria-label="Aircraft"
                >
                  {props.aircraftOptions.map((a) => {
                    const active = a.id === props.aircraftId;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={`demand-accept-pick${active ? ' is-active' : ''}`}
                        disabled={props.busy}
                        onClick={() => props.onAircraftChange(a.id)}
                      >
                        <strong>{a.label ?? a.id}</strong>
                        <span>{a.locationIcao}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>
        <div className="confirm-actions">
          <button
            type="button"
            className="action ghost"
            disabled={props.busy}
            onClick={props.onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="accept"
            disabled={!canConfirm}
            title={
              updateBlocked
                ? `Update required · v${props.clientUpdateRequiredMin}+`
                : undefined
            }
            onClick={props.onConfirm}
          >
            {updateBlocked
              ? formatClientUpdateCtaLabel()
              : props.mode === 'hold'
                ? 'Hold'
                : 'Fly now'}
          </button>
        </div>
        {updateBlocked ? (
          <p className="demand-accept-hint cargo-dialog-error">
            Update required · v{props.clientUpdateRequiredMin}+
            {props.onOpenUpdates ? (
              <>
                {' '}
                <button
                  type="button"
                  className="action ghost compact"
                  onClick={() => props.onOpenUpdates?.()}
                >
                  Settings → Updates
                </button>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
