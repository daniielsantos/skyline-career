import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  fetchPorts,
  fetchCargoLimit,
  postDemandAccept,
  postGroundStaffFire,
  postGroundStaffHire,
  postPortBuy,
  postPortConcessionClaim,
  postPortConcessionRenew,
  postPortConcessionUpgrade,
  postPortDeposit,
  postPortPickupAbandon,
  postWarehouseBuy,
  postWarehouseUpgrade,
  postWarehouseStockAbandon,
  type CareerCargoOps,
  type DemandOrderView,
  type GroundStaffSnapshot,
  type Mission,
  type PlayerAircraft,
  type PlayerWarehouseSnapshot,
  type PortListingView,
  type PortsSnapshot,
} from './api';
import { PortsMap } from './PortsMap';
import { BusyBlock } from './Busy';
import { CommodityIcon } from './CommodityIcon';
import { CrewPortrait } from './CrewPanel';
import { crewPortraitUrl } from './crewPortraits';
import { useConfirm } from './ConfirmDialog';
import {
  derivePortsLoopStep,
  portsLoopTargetSection,
  type PortsLoopStep,
} from './ports-loop-guidance';
import { previewDemandAcceptPull, previewDemandInternationalRoute, greatCircleDistanceNm } from './demand-accept-preview';
import {
  displayToKg,
  KG_TO_LB,
  kgToDisplay,
  massUnitLabel,
  type WeightSystem,
} from './weight-units';

/** Mirror of shared WAREHOUSE_*_CAPACITY_KG (client must not import shared). */
const WH_T1_CAPACITY_KG = 2_268;
const WH_T2_CAPACITY_KG = 4_536;
const WH_T3_CAPACITY_KG = 6_804;
/** Mirror of shared port→WH inbound transfer ticks. */
const INBOUND_BASE_TICKS = 4;
const INBOUND_MAX_TICKS = 8;
const LOGISTICS_MULT = 0.55;

function transferDiscountLabel(mult: number | undefined | null): string {
  const m =
    typeof mult === 'number' && Number.isFinite(mult) && mult > 0 && mult < 1
      ? mult
      : LOGISTICS_MULT;
  return `Transfer −${Math.round((1 - m) * 100)}%`;
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

/** 15-min economy ticks → hours. */
function ticksToHoursLabel(ticks: number): string {
  const h = ticks * 0.25;
  if (h < 1) return `${Math.round(ticks * 15)} min`;
  return Number.isInteger(h) ? `${h} h` : `${h.toFixed(1)} h`;
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
const WORLD_PORTS_PAGE_SIZE = 5;
/** 1 economy tick = 15 wall-clock minutes. */
const HOURS_PER_TICK = 0.25;
const HOURS_PER_DAY = 24;

type DemandSortKey =
  | 'country'
  | 'dest'
  | 'commodity'
  | 'wanted'
  | 'price'
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
  return formatDuration(remainingTicks * HOURS_PER_TICK);
}

function demandSortValue(order: DemandOrderView, key: DemandSortKey): string | number {
  switch (key) {
    case 'country':
      return demandDestCountryId(order) || 'ZZ';
    case 'dest':
      return order.destIcao.toUpperCase();
    case 'commodity':
      return commodityLabel(order).toLowerCase();
    case 'wanted':
      return order.remainingKg;
    case 'price':
      return order.maxUnitPriceUsd;
    case 'expires':
      return order.expiresAtTick;
  }
}

function compareDemandOrders(
  a: DemandOrderView,
  b: DemandOrderView,
  sort: DemandSort,
): number {
  const av = demandSortValue(a, sort.key);
  const bv = demandSortValue(b, sort.key);
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

function portsLoopMessage(
  step: PortsLoopStep,
  formatTonnes: (kg: number) => string,
  formatMoney: (n: number) => string,
  yardHoldUsdPerDayTotal?: number,
): string {
  switch (step.kind) {
    case 'buy_warehouse':
      return 'Buy a warehouse at a port pickup hub before cargo can leave the yard.';
    case 'store_yard': {
      const fee =
        yardHoldUsdPerDayTotal != null && yardHoldUsdPerDayTotal > 0
          ? yardHoldUsdPerDayTotal
          : step.holdUsdPerDay;
      const feeBit =
        fee > 0 ? ` Yard holding ${formatMoney(fee)}/day.` : '';
      return `Store ${formatTonnes(step.kg)} of ${commodityLabel(step)} from yard at ${step.hubIcao} into your warehouse.${feeBit}`;
    }
    case 'fulfill_demand':
      return step.matchCount === 1
        ? '1 Demand order matches your warehouse stock — accept to stage a flight.'
        : `${step.matchCount} Demand orders match your warehouse stock — accept to stage a flight.`;
    case 'wait_demand':
      return 'Stock is ready — Demand Board posts when hub terminals run low.';
    case 'buy_port':
      return 'Buy factory cargo at a seaport to start the loop.';
  }
}

function portsLoopCtaLabel(step: PortsLoopStep): string | null {
  switch (step.kind) {
    case 'buy_warehouse':
      return 'Open warehouses';
    case 'store_yard':
      return 'Open yard';
    case 'fulfill_demand':
      return 'Open Demand Board';
    case 'wait_demand':
      return null; // filled in when board has orders
    case 'buy_port':
      return 'Open catalog';
  }
}

function portsLoopSectionHint(
  step: PortsLoopStep,
  formatMoney?: (n: number) => string,
  yardHoldUsdPerDayTotal?: number,
): string {
  switch (step.kind) {
    case 'buy_warehouse':
      return 'Next: buy warehouse space on Available, then store yard cargo here.';
    case 'store_yard': {
      const fee =
        yardHoldUsdPerDayTotal != null && yardHoldUsdPerDayTotal > 0
          ? yardHoldUsdPerDayTotal
          : step.holdUsdPerDay;
      const feeBit =
        fee > 0 && formatMoney
          ? ` Yard is charging ${formatMoney(fee)}/day until you Store.`
          : '';
      return `Next: use Store on a yard lot below to move cargo into the warehouse.${feeBit}`;
    }
    case 'fulfill_demand':
      return 'Next: accept a matching order to pull stock from your warehouse and stage a flight.';
    case 'wait_demand':
      return 'Your stock is waiting — check back when hubs post Demand orders.';
    case 'buy_port':
      return 'Next: pick a listing and buy into a warehouse (overflow goes to yard).';
  }
}

export function PortsPanel(props: {
  busy?: boolean;
  weightSystem: WeightSystem;
  formatMoney: (n: number) => string;
  formatTonnes: (kg: number) => string;
  fleet: PlayerAircraft[];
  /** Aircraft cargo ceiling (kg); 0 = treat as unlimited for preview. */
  resolveMaxCargoKg?: (aircraft: PlayerAircraft) => number;
  economyTick?: number;
  cargoOps?: CareerCargoOps | null;
  onOpenCargoOps?: () => void;
  onWallet?: (usd: number) => void;
  onFleet?: (fleet: PlayerAircraft[]) => void;
  onMissions?: (missions: Mission[]) => void;
  onOpenAirport?: (icao: string) => void;
  onStaged?: (mission: Mission) => void;
  onToast?: (kind: 'ok' | 'fail', message: string) => void;
}) {
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
  const [amountText, setAmountText] = useState('1000');
  const [acceptOrder, setAcceptOrder] = useState<DemandOrderView | null>(null);
  const [acceptOrigin, setAcceptOrigin] = useState('');
  const [acceptAircraftId, setAcceptAircraftId] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  const [section, setSection] = useState<'catalog' | 'warehouse' | 'demand'>(
    'catalog',
  );
  const [whShelf, setWhShelf] = useState<'owned' | 'staff' | 'buy'>('owned');
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
  const [selectedOwnedHubIcao, setSelectedOwnedHubIcao] = useState<string | null>(
    null,
  );
  const [selectedBuyHubIcao, setSelectedBuyHubIcao] = useState<string | null>(
    null,
  );
  const [buyHubQuery, setBuyHubQuery] = useState('');
  const [demandSort, setDemandSort] = useState<DemandSort>({
    key: 'expires',
    direction: 'asc',
  });
  const [demandPage, setDemandPage] = useState(1);
  const [demandCountryFilter, setDemandCountryFilter] = useState('');
  const [worldPortsPage, setWorldPortsPage] = useState(1);

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

  async function refresh() {
    setLoadError(null);
    try {
      const nextPorts = await fetchPorts();
      setSnap(nextPorts);
      setDemand(nextPorts.demand?.orders ?? []);
      setWarehouses(nextPorts.warehouses ?? null);
      setGroundStaff(
        nextPorts.groundStaff ?? nextPorts.warehouses?.groundStaff ?? null,
      );
      if (!portId && nextPorts.ports[0]) setPortId(nextPorts.ports[0].id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLoadError(message);
      props.onToast?.('fail', message);
    }
  }

  useEffect(() => {
    void refresh().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load + refresh when clock advances
  }, [props.economyTick]);

  const port = snap?.ports.find((p) => p.id === portId) ?? snap?.ports[0];
  const amountDisplay = Math.max(0, Math.floor(Number(amountText) || 0));
  const kg =
    buyListing != null
      ? Math.max(
          0,
          Math.min(
            buyListing.availableKg,
            Math.floor(displayToKg(amountDisplay, props.weightSystem)),
          ),
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
      (snap?.ports ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        lat: p.lat,
        lon: p.lon,
        pickupHubDetails:
          p.pickupHubDetails ??
          p.pickupHubs.map((icao) => ({
            icao,
            lat: p.lat,
            lon: p.lon,
          })),
      })),
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
    const rows = (warehouses?.warehouses ?? [])
      .filter((w) => w.icao.trim().toUpperCase() !== dest)
      .map((w) => {
        const lots = (warehouses?.stock ?? []).filter(
          (s) =>
            s.warehouseId === w.id &&
            s.commodityId === acceptOrder.commodityId &&
            s.kg > 0,
        );
        const stockKg = lots.reduce((sum, s) => sum + s.kg, 0);
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
  }, [acceptOrder, warehouses]);

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
    const maxCargoKg = acceptAircraft
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
    const defaultKg = Math.min(1000, Math.max(1, Math.floor(listing.availableKg)));
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
    const dest = order.destIcao.trim().toUpperCase();
    const origins = (warehouses?.warehouses ?? [])
      .filter((w) => w.icao.trim().toUpperCase() !== dest)
      .map((w) => {
        const stockKg = (warehouses?.stock ?? [])
          .filter(
            (s) =>
              s.warehouseId === w.id && s.commodityId === order.commodityId,
          )
          .reduce((sum, s) => sum + s.kg, 0);
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
      if (inbound > 0 || yard > 0) setSection('warehouse');
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
        `Claimed port concession · operator rates active`,
      );
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

  async function onRenewConcession(portIdToRenew: string, leaseUsd: number) {
    if (props.busy || loading) return;
    const ok = await confirm({
      title: 'Renew port lease?',
      body: (
        <p>
          Extend the concession lease by 7 economy days for{' '}
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
      props.onToast?.('ok', 'Port lease renewed');
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

  async function onUpgradeConcession(portIdToUpgrade: string, upgradeUsd: number) {
    if (props.busy || loading) return;
    const ok = await confirm({
      title: 'Enlarge port yard (P2)?',
      body: (
        <p>
          Bigger factory stock cap (same restock %, more kg per discharge) for{' '}
          <strong>{props.formatMoney(upgradeUsd)}</strong>. Lease scales with
          recent throughput — no extra buy discount.
        </p>
      ),
      confirmLabel: 'Upgrade yard',
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
      props.onToast?.('ok', 'P2 yard unlocked');
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
    setLoading(true);
    try {
      const result = await postWarehouseBuy({ icao });
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
    const wh = (warehouses?.warehouses ?? []).find((w) => w.id === warehouseId);
    const nextTier = wh?.nextTier ?? (wh?.tier === 1 ? 2 : wh?.tier === 2 ? 3 : null);
    if (!nextTier) return;
    const nextCap =
      nextTier === 3 ? WH_T3_CAPACITY_KG : WH_T2_CAPACITY_KG;
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
    setLoading(true);
    try {
      const result = await postDemandAccept({
        orderId: acceptOrder.id,
        originIcao: acceptOrigin,
        aircraftId: acceptAircraftId,
      });
      props.onWallet?.(result.walletUsd);
      props.onFleet?.(result.fleet);
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
  const filteredBuyableHubs = useMemo(() => {
    const q = buyHubQuery.trim().toLowerCase();
    if (!q) return allBuyableHubs;
    return allBuyableHubs.filter((icao) => {
      const name = (portForHub.get(icao)?.name ?? '').toLowerCase();
      return icao.toLowerCase().includes(q) || name.includes(q);
    });
  }, [allBuyableHubs, buyHubQuery, portForHub]);
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
  const staffHirePool =
    staffFocusWarehouse && groundStaff
      ? (groundStaff.hirePoolByHub[
          staffFocusWarehouse.icao.trim().toUpperCase()
        ] ?? [])
      : [];
  const buyUsdByIcao = warehouses?.buyUsdByIcao ?? {};

  const loopStep = useMemo(
    () =>
      derivePortsLoopStep({
        warehouseCount: warehouses?.warehouses?.length ?? 0,
        stock: warehouses?.stock ?? [],
        pickups: snap?.pickups ?? [],
        demand,
      }),
    [warehouses?.warehouses?.length, warehouses?.stock, snap?.pickups, demand],
  );
  const loopTargetSection = portsLoopTargetSection(loopStep);
  const loopCtaLabel = useMemo(() => {
    if (loopStep.kind === 'wait_demand') {
      return demand.length > 0 ? 'Open Demand Board' : null;
    }
    return portsLoopCtaLabel(loopStep);
  }, [loopStep, demand.length]);

  function goToLoopStep() {
    setSection(loopTargetSection);
    if (loopStep.kind === 'buy_warehouse') {
      setWhShelf('buy');
    } else if (loopStep.kind === 'store_yard') {
      setWhShelf('owned');
      setSelectedOwnedHubIcao(loopStep.hubIcao);
      setSelectedStockId(null);
    }
  }

  useEffect(() => {
    if (
      selectedStockId &&
      !allWarehouseStock.some((s) => s.id === selectedStockId)
    ) {
      setSelectedStockId(null);
    }
  }, [allWarehouseStock, selectedStockId]);

  useEffect(() => {
    if (
      selectedOwnedHubIcao &&
      !allOwnedWarehouses.some(
        (w) => w.icao.trim().toUpperCase() === selectedOwnedHubIcao.toUpperCase(),
      )
    ) {
      setSelectedOwnedHubIcao(null);
    }
  }, [allOwnedWarehouses, selectedOwnedHubIcao]);

  useEffect(() => {
    if (
      selectedBuyHubIcao &&
      !filteredBuyableHubs.includes(selectedBuyHubIcao.trim().toUpperCase())
    ) {
      setSelectedBuyHubIcao(null);
    }
  }, [filteredBuyableHubs, selectedBuyHubIcao]);

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
    const next = selectedOwnedHubIcao === code ? null : code;
    setSelectedOwnedHubIcao(next);
    setSelectedStockId(null);
    if (next) {
      const linkedPort = portForHub.get(next);
      if (linkedPort) setPortId(linkedPort.id);
    }
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

  const sortedDemand = useMemo(() => {
    const seen = new Set<string>();
    const unique: DemandOrderView[] = [];
    for (const order of demand) {
      if (seen.has(order.id)) continue;
      seen.add(order.id);
      unique.push(order);
    }
    const country = demandCountryFilter.trim().toUpperCase();
    const filtered = country
      ? unique.filter((o) => demandDestCountryId(o) === country)
      : unique;
    return filtered.sort((a, b) => compareDemandOrders(a, b, demandSort));
  }, [demand, demandSort, demandCountryFilter]);

  const demandCountryOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const o of demand) {
      const id = demandDestCountryId(o);
      if (id) ids.add(id);
    }
    return [...ids].sort((a, b) => a.localeCompare(b));
  }, [demand]);

  const demandPageCount = Math.max(
    1,
    Math.ceil(sortedDemand.length / DEMAND_PAGE_SIZE) || 1,
  );
  const safeDemandPage = Math.min(Math.max(1, demandPage), demandPageCount);
  const pagedDemand = useMemo(() => {
    const start = (safeDemandPage - 1) * DEMAND_PAGE_SIZE;
    return sortedDemand.slice(start, start + DEMAND_PAGE_SIZE);
  }, [sortedDemand, safeDemandPage]);
  const demandTableKey = `${safeDemandPage}:${demandSort.key}:${demandSort.direction}:${demandCountryFilter}:${sortedDemand.length}`;

  useEffect(() => {
    if (demandPage > demandPageCount) setDemandPage(demandPageCount);
  }, [demandPage, demandPageCount]);

  useEffect(() => {
    setDemandPage(1);
  }, [demandCountryFilter]);

  const sortedWorldPorts = useMemo(() => {
    return [...(snap?.ports ?? [])].sort((a, b) => {
      const c = a.countryId.localeCompare(b.countryId);
      if (c !== 0) return c;
      return a.name.localeCompare(b.name);
    });
  }, [snap?.ports]);
  const worldPortsPageCount = Math.max(
    1,
    Math.ceil(sortedWorldPorts.length / WORLD_PORTS_PAGE_SIZE) || 1,
  );
  const safeWorldPortsPage = Math.min(
    Math.max(1, worldPortsPage),
    worldPortsPageCount,
  );
  const pagedWorldPorts = useMemo(() => {
    const start = (safeWorldPortsPage - 1) * WORLD_PORTS_PAGE_SIZE;
    return sortedWorldPorts.slice(start, start + WORLD_PORTS_PAGE_SIZE);
  }, [sortedWorldPorts, safeWorldPortsPage]);

  useEffect(() => {
    if (worldPortsPage > worldPortsPageCount) {
      setWorldPortsPage(worldPortsPageCount);
    }
  }, [worldPortsPage, worldPortsPageCount]);

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
    <section className="panel ports-panel">
      <div className="panel-head">
        <div>
          <h2>Ports & Demand</h2>
          <p>Seaport cargo → warehouse → Demand Board flights.</p>
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
              aria-selected={section === 'warehouse'}
              className={
                section === 'warehouse'
                  ? 'fbo-icao-chip active'
                  : 'fbo-icao-chip'
              }
              disabled={props.busy || loading}
              onClick={() => setSection('warehouse')}
            >
              Warehouse
              {(snap.pickups?.length ?? 0) > 0
                ? ` (${snap.pickups.length})`
                : ''}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={section === 'demand'}
              className={
                section === 'demand' ? 'fbo-icao-chip active' : 'fbo-icao-chip'
              }
              disabled={props.busy || loading}
              onClick={() => setSection('demand')}
            >
              Demand Board ({demand.length})
            </button>
          </div>

          {section !== loopTargetSection ? (
            <div className="ports-loop-banner" role="status">
              <p className="ports-loop-banner-text">
                {portsLoopMessage(
                  loopStep,
                  props.formatTonnes,
                  props.formatMoney,
                  snap.yardHoldUsdPerDay,
                )}
              </p>
              {loopCtaLabel ? (
                <button
                  type="button"
                  className="action ghost ports-loop-banner-cta"
                  disabled={props.busy || loading}
                  onClick={() => goToLoopStep()}
                >
                  {loopCtaLabel}
                </button>
              ) : null}
            </div>
          ) : null}

          {section === 'catalog' ? (
            <>
              {loopTargetSection === 'catalog' ? (
                <p className="muted ports-loop-section-hint">
                  {portsLoopSectionHint(
                    loopStep,
                    props.formatMoney,
                    snap.yardHoldUsdPerDay,
                  )}
                </p>
              ) : null}
              {port ? (
                <h3 className="ports-selected-name ports-stage-title">
                  {port.name}
                  <button
                    type="button"
                    className={
                      port.concession?.status === 'yours'
                        ? 'tag ports-operator-badge ports-concession-chip'
                        : port.concession?.status === 'held'
                          ? 'tag ports-concession-chip'
                          : 'tag muted ports-concession-chip'
                    }
                    title="Port concession (endgame)"
                    disabled={props.busy}
                    onClick={() => setConcessionOpen(true)}
                  >
                    {port.concession?.status === 'yours'
                      ? `Operator P${port.concession.level ?? 1}`
                      : port.concession?.status === 'held'
                        ? 'Held'
                        : 'Vacant'}
                  </button>
                  <button
                    type="button"
                    className="action ghost ports-concession-open"
                    disabled={props.busy}
                    onClick={() => setConcessionOpen(true)}
                  >
                    Concession…
                  </button>
                </h3>
              ) : (
                <p className="ports-stage-title is-muted">
                  Select a port on the map or grid.
                </p>
              )}

              <div className="ports-main">
                <PortsMap
                  ports={mapPorts}
                  ownedFbos={mapWarehouses}
                  selectedPortId={port?.id ?? portId}
                  focusToken={mapFocusToken}
                  onSelectPort={selectCatalogPort}
                  onSelectHub={(icao) => props.onOpenAirport?.(icao)}
                />

                <div className="ports-listings">
                  {port ? (
                    <>
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
                          {port.inbound && port.inbound.totalKg > 0 ? (
                            <p className="muted ports-inbound-note">
                              Next discharge
                              {port.inbound.ticksLeft <= 0
                                ? ' arriving with the next economy tick'
                                : ` in ~${ticksToHoursLabel(port.inbound.ticksLeft)}`}
                              {' · '}
                              {props.formatTonnes(port.inbound.totalKg)}
                            </p>
                          ) : null}
                        </details>
                      ) : null}
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
                                  {port.inbound && port.inbound.ticksLeft > 0
                                    ? `No open listings — next discharge in ~${ticksToHoursLabel(port.inbound.ticksLeft)}.`
                                    : 'No open listings — wait for the next discharge.'}
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

              <section
                className="ports-world-catalog"
                aria-label="World port catalog"
              >
                <h4 className="ports-world-catalog-title">All ports</h4>
                <div className="table-wrap ports-world-list-wrap">
                  <table className="data-table ports-world-list">
                    <thead>
                      <tr>
                        <th>Country</th>
                        <th>Port</th>
                        <th>Pickup</th>
                        <th>Open</th>
                        <th>Concession</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedWorldPorts.length === 0 ? (
                        <tr>
                          <td colSpan={5}>
                            <p className="empty">No ports yet.</p>
                          </td>
                        </tr>
                      ) : (
                        pagedWorldPorts.map((p) => {
                          const selected =
                            (port?.id ?? portId)?.toUpperCase() ===
                            p.id.toUpperCase();
                          const conc =
                            p.concession?.status === 'yours'
                              ? 'Yours'
                              : p.concession?.status === 'held'
                                ? 'Held'
                                : 'Vacant';
                          return (
                            <tr
                              key={p.id}
                              className={
                                selected
                                  ? 'ports-world-row is-selected'
                                  : 'ports-world-row'
                              }
                              aria-selected={selected}
                              onClick={() => {
                                if (!props.busy) selectCatalogPort(p.id);
                              }}
                            >
                              <td className="ports-world-row-country">
                                {p.countryId}
                              </td>
                              <td>
                                <strong>{p.name}</strong>
                              </td>
                              <td className="muted">
                                {p.pickupHubs.join(', ') || '—'}
                              </td>
                              <td className="muted">{p.listings.length}</td>
                              <td className="muted">{conc}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                {sortedWorldPorts.length > 0 ? (
                  <nav className="pagination" aria-label="Port catalog pages">
                    <p>
                      {`${(safeWorldPortsPage - 1) * WORLD_PORTS_PAGE_SIZE + 1}–${Math.min(
                        safeWorldPortsPage * WORLD_PORTS_PAGE_SIZE,
                        sortedWorldPorts.length,
                      )} of ${sortedWorldPorts.length}`}
                    </p>
                    <div>
                      <button
                        type="button"
                        disabled={safeWorldPortsPage <= 1 || props.busy}
                        onClick={() =>
                          setWorldPortsPage(Math.max(1, safeWorldPortsPage - 1))
                        }
                      >
                        Previous
                      </button>
                      <span>
                        Page {safeWorldPortsPage} of {worldPortsPageCount}
                      </span>
                      <button
                        type="button"
                        disabled={
                          safeWorldPortsPage >= worldPortsPageCount ||
                          props.busy
                        }
                        onClick={() =>
                          setWorldPortsPage(
                            Math.min(
                              worldPortsPageCount,
                              safeWorldPortsPage + 1,
                            ),
                          )
                        }
                      >
                        Next
                      </button>
                    </div>
                  </nav>
                ) : null}
              </section>
            </>
          ) : null}

          {section === 'warehouse' ? (
            <>
              {loopTargetSection === 'warehouse' ? (
                <p className="muted ports-loop-section-hint">
                  {portsLoopSectionHint(
                    loopStep,
                    props.formatMoney,
                    snap.yardHoldUsdPerDay,
                  )}
                </p>
              ) : null}
              <h3 className="ports-stage-title">
                {whShelf === 'staff'
                  ? 'Ground staff'
                  : whShelf === 'buy'
                    ? 'Available warehouses'
                    : highlightedHubIcao
                      ? `Warehouse · ${highlightedHubIcao}`
                      : 'Your warehouses'}
              </h3>
              <div className="ports-main">
                <PortsMap
                  ports={mapPorts}
                  ownedFbos={mapWarehouses}
                  selectedPortId={
                    (whShelf === 'owned' || whShelf === 'staff') &&
                    highlightPortId
                      ? highlightPortId
                      : whShelf === 'buy' && selectedBuyHubIcao
                        ? (portForHub.get(selectedBuyHubIcao)?.id ??
                          port?.id ??
                          portId)
                        : (port?.id ?? portId)
                  }
                  highlightedHubIcao={
                    whShelf === 'owned' || whShelf === 'staff'
                      ? highlightedHubIcao
                      : whShelf === 'buy'
                        ? selectedBuyHubIcao
                        : null
                  }
                  onSelectPort={(id) => {
                    setPortId(id);
                    if (whShelf === 'owned' || whShelf === 'staff') {
                      setSelectedStockId(null);
                      setSelectedOwnedHubIcao(null);
                    }
                    if (whShelf === 'buy') setSelectedBuyHubIcao(null);
                  }}
                  onSelectHub={(icao) => props.onOpenAirport?.(icao)}
                />

                <div className="ports-warehouse-side">
                  <div className="ports-warehouse-strip">
                    <div className="ports-wh-head">
                      <h3>Warehouses</h3>
                      <p className="muted ports-warehouse-hint">
                        {whShelf === 'owned'
                          ? 'Your hubs and stock — select to highlight on the map.'
                          : whShelf === 'staff'
                            ? 'Hire per warehouse · Ace→Green grades · salary by grade.'
                            : 'Buyable hubs — select on the map, then buy.'}
                      </p>
                      <div
                        className="ports-wh-shelf"
                        role="tablist"
                        aria-label="Warehouse shelf"
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={whShelf === 'owned'}
                          className={
                            whShelf === 'owned'
                              ? 'ports-wh-shelf-tab active'
                              : 'ports-wh-shelf-tab'
                          }
                          disabled={props.busy || loading}
                          onClick={() => {
                            setWhShelf('owned');
                            setSelectedBuyHubIcao(null);
                          }}
                        >
                          Yours
                          {allOwnedWarehouses.length > 0
                            ? ` (${allOwnedWarehouses.length})`
                            : ''}
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={whShelf === 'staff'}
                          className={
                            whShelf === 'staff'
                              ? 'ports-wh-shelf-tab active'
                              : 'ports-wh-shelf-tab'
                          }
                          disabled={props.busy || loading}
                          onClick={() => {
                            setWhShelf('staff');
                            setSelectedBuyHubIcao(null);
                            setSelectedStockId(null);
                          }}
                        >
                          Ground staff
                          {(groundStaff?.members.length ?? 0) > 0
                            ? ` (${groundStaff!.members.length})`
                            : ''}
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={whShelf === 'buy'}
                          className={
                            whShelf === 'buy'
                              ? 'ports-wh-shelf-tab active'
                              : 'ports-wh-shelf-tab'
                          }
                          disabled={props.busy || loading}
                          onClick={() => {
                            setWhShelf('buy');
                            setSelectedStockId(null);
                            setSelectedOwnedHubIcao(null);
                          }}
                        >
                          Available
                          {allBuyableHubs.length > 0
                            ? ` (${allBuyableHubs.length})`
                            : ''}
                        </button>
                      </div>
                    </div>

                    <div className="ports-wh-body">
                    {whShelf === 'owned' ? (
                      <>
                        {allOwnedWarehouses.length === 0 ? (
                          <p className="empty">
                            No warehouses yet — open Available to buy one at a
                            pickup hub.
                          </p>
                        ) : (
                          <div className="ports-warehouse-row">
                            {allOwnedWarehouses.map((wh) => {
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
                              return (
                                <div
                                  key={wh.id}
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
                                      wh.upgradeUsd != null ? (
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
                                      Tier 3 · max capacity
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {allWarehouseStock.length > 0 ? (
                          <div className="table-wrap ports-warehouse-lots">
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>Port</th>
                                  <th>Hub</th>
                                  <th>Lot</th>
                                  <th>Mass</th>
                                  <th>Cost</th>
                                  <th />
                                </tr>
                              </thead>
                              <tbody>
                                {allWarehouseStock.map((s) => {
                                  const wh = warehouses!.warehouses.find(
                                    (w) => w.id === s.warehouseId,
                                  );
                                  const hubIcao =
                                    wh?.icao.trim().toUpperCase() ?? '';
                                  const linked = hubIcao
                                    ? portForHub.get(hubIcao)
                                    : undefined;
                                  const selected = selectedStockId === s.id;
                                  const lotLabel = `${props.formatTonnes(s.kg)} ${commodityLabel(
                                    { commodityId: s.commodityId },
                                  )}`;
                                  return (
                                    <tr
                                      key={s.id}
                                      className={
                                        selected ? 'is-selected' : undefined
                                      }
                                      tabIndex={0}
                                      aria-selected={selected}
                                      onClick={() =>
                                        selectStockLot(s.id, hubIcao)
                                      }
                                      onKeyDown={(event) => {
                                        if (
                                          event.key === 'Enter' ||
                                          event.key === ' '
                                        ) {
                                          event.preventDefault();
                                          selectStockLot(s.id, hubIcao);
                                        }
                                      }}
                                    >
                                      <td>{linked?.name ?? '—'}</td>
                                      <td>
                                        <button
                                          type="button"
                                          className="linkish"
                                          disabled={props.busy}
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            props.onOpenAirport?.(hubIcao);
                                          }}
                                        >
                                          {hubIcao || '?'}
                                        </button>
                                      </td>
                                      <td>
                                        <div className="commodity-cell">
                                          <CommodityIcon
                                            commodityId={s.commodityId}
                                            size={28}
                                          />
                                          <div>
                                            <strong>
                                              {commodityLabel({
                                                commodityId: s.commodityId,
                                              })}
                                            </strong>
                                          </div>
                                        </div>
                                      </td>
                                      <td>{props.formatTonnes(s.kg)}</td>
                                      <td>
                                        {formatUnitPrice(s.avgCostUsdPerKg)}
                                      </td>
                                      <td className="actions">
                                        <button
                                          type="button"
                                          className="action ghost"
                                          disabled={props.busy || loading}
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            void onAbandonWarehouseStock(
                                              s.id,
                                              lotLabel,
                                              hubIcao || 'warehouse',
                                            );
                                          }}
                                        >
                                          Abandon
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : allOwnedWarehouses.length > 0 ? (
                          <p className="empty">
                            No stock in your warehouses yet.
                          </p>
                        ) : null}
                      </>
                    ) : whShelf === 'staff' ? (
                      allOwnedWarehouses.length === 0 ? (
                        <p className="empty">
                          Buy a warehouse on Available before hiring ground
                          staff.
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
                                (wh.tier >= 2 ? 2 : 1);
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
                                  {staffFocusMeta?.slotsUsed ?? 0}/
                                  {staffFocusMeta?.slotsUnlocked ??
                                    (staffFocusWarehouse.tier >= 3
                                      ? 3
                                      : staffFocusWarehouse.tier >= 2
                                        ? 2
                                        : 1)}
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
                                  {(staffFocusMeta?.slotsFree ?? 0) <= 0
                                    ? ' · slot full'
                                    : ''}
                                </p>
                                {(staffFocusMeta?.slotsFree ?? 0) <= 0 &&
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
                                        (staffFocusMeta?.slotsFree ?? 0) >
                                          0 && !dup;
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
                        {filteredBuyableHubs.length === 0 ? (
                          <p className="empty">
                            No hubs match “{buyHubQuery.trim()}”.
                          </p>
                        ) : (
                      <div className="ports-wh-buy-list">
                        {filteredBuyableHubs.map((icao) => {
                          const buyUsd = buyUsdByIcao[icao];
                          const linked = portForHub.get(icao);
                          const selected =
                            selectedBuyHubIcao?.toUpperCase() === icao;
                          return (
                            <div
                              key={icao}
                              className={
                                selected
                                  ? 'ports-wh-buy-card is-selected'
                                  : 'ports-wh-buy-card'
                              }
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
                  <p className="muted ports-warehouse-hint">
                    Factory cargo is moving from the port apron into your
                    warehouse — not Demand-ready until it arrives.
                  </p>
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
                        const now = snap?.tick ?? 0;
                        const left = Math.max(0, t.readyAtTick - now);
                        const label = commodityLabel({
                          commodityId: t.commodityId,
                        });
                        const logisticsMeta =
                          groundStaff?.byWarehouse[t.warehouseId];
                        const logistics =
                          logisticsMeta?.logisticsActive === true;
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
                            <td>
                              {left <= 0
                                ? 'Arriving…'
                                : `~${ticksToHoursLabel(left)}`}
                              {logistics ? (
                                <span className="ports-ground-staff-perk">
                                  {' '}
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
                  No cargo waiting in the yard — buys go in transit to WH when
                  space is reserved, otherwise yard hold.
                </p>
              ) : (
                <>
                  <p className="muted ports-warehouse-hint">
                    Yard hold: charged daily until you Store in WH (higher than
                    warehouse storage).
                    {snap.yardHoldUsdPerDay != null &&
                    snap.yardHoldUsdPerDay > 0
                      ? ` Currently ${props.formatMoney(snap.yardHoldUsdPerDay)}/day across all yard lots.`
                      : ''}{' '}
                    Lots larger than WH capacity can never fully store — Abandon
                    (no refund) stops the fee.
                  </p>
                  <table className="data-table">
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
                        const aging =
                          heldDays >= YARD_HOLD_WARN_DAYS
                            ? 'ports-yard-aging'
                            : undefined;
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
                            <td className="actions ports-pickup-actions">
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
                                <span className="muted">
                                  {buyUsdByIcao[p.hubIcao.toUpperCase()] != null
                                    ? `Buy warehouse · ${props.formatMoney(buyUsdByIcao[p.hubIcao.toUpperCase()]!)} at ${p.hubIcao}`
                                    : `Buy warehouse at ${p.hubIcao}`}
                                </span>
                              )}
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

          {section === 'demand' ? (
            <div className="ports-demand-board">
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
                        <td colSpan={7}>
                          <p className="empty">
                            {demand.length === 0
                              ? 'No open demand — hubs with low stock will post orders.'
                              : 'No demand in this country — clear the filter or wait for new posts.'}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      pagedDemand.map((o, index) => {
                        const cargoLocked = isCargoOpsCommodityLocked(
                          o.commodityId,
                        );
                        const countryId = demandDestCountryId(o);
                        return (
                        <tr
                          key={`${o.id}#${index}`}
                          className={cargoLocked ? 'lot-locked' : undefined}
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
            <h3 id="ports-concession-title">{port.name} · Concession</h3>
            {port.concession?.status === 'yours' ? (
              <>
                <p className="muted">
                  P{port.concession.level ?? 1} operator: ~10% cheaper buys, ~15%
                  faster inbound, +1 listing
                  {(port.concession.level ?? 1) >= 2
                    ? ', enlarged yard cap'
                    : ''}
                  . Throughput{' '}
                  {props.formatTonnes(
                    port.concession.lifetimeThroughputKg ?? 0,
                  )}
                  {port.concession.recentThroughputKg != null
                    ? ` · 7d ${props.formatTonnes(port.concession.recentThroughputKg)}`
                    : ''}
                  {port.concession.leasePaidThroughTick != null &&
                  props.economyTick != null
                    ? ` · lease through tick ${port.concession.leasePaidThroughTick}`
                    : null}
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
                  {port.concession.upgrade &&
                  (port.concession.level ?? 1) < 2 ? (
                    <button
                      type="button"
                      className="action ghost"
                      disabled={
                        props.busy || loading || !port.concession.upgrade.ok
                      }
                      title={
                        port.concession.upgrade.ok
                          ? 'Enlarge factory cap'
                          : port.concession.upgrade.reasons.join(' · ')
                      }
                      onClick={() =>
                        void onUpgradeConcession(
                          port.id,
                          port.concession?.upgrade?.upgradeUsd ?? 220_000,
                        )
                      }
                    >
                      P2 yard
                      {port.concession.upgrade.upgradeUsd
                        ? ` · ${props.formatMoney(port.concession.upgrade.upgradeUsd)}`
                        : ''}
                    </button>
                  ) : null}
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
                </div>
              </>
            ) : port.concession?.status === 'held' ? (
              <>
                <p className="muted">
                  Another company holds this concession. You can still buy
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
          onCancel={closeAcceptModal}
          onConfirm={() => void onConfirmAccept()}
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
  const inboundKg = hasWh ? Math.min(props.kg, props.hubFreeKg) : 0;
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
          <label className="confirm-field">
            <span>Amount ({unit})</span>
            <input
              ref={inputRef}
              type="number"
              min={1}
              max={displayMax}
              step={props.weightSystem === 'imperial' ? 10 : 100}
              value={props.amountText}
              disabled={props.busy}
              onChange={(e) => props.onAmountChange(e.target.value)}
            />
          </label>
          <p className="muted">
            Max {props.formatTonnes(props.listing.availableKg)} · debit ≈{' '}
            {props.formatMoney(props.previewUsd)}
            {props.procurementActive
              ? ` · ${procurementDiscountLabel(props.procurementMult)}`
              : ''}
          </p>
          {hasWh ? (
            <p className={foreverYard ? 'confirm-quote is-error' : 'muted'}>
              WH free {props.formatTonnes(props.hubFreeKg)} /{' '}
              {props.formatTonnes(props.hubCapacityKg!)}
              {inboundKg > 0
                ? ` · ${props.formatTonnes(inboundKg)} in transit (~${ticksToHoursLabel(transferTicks)}${props.logisticsActive ? `, ${transferDiscountLabel(props.logisticsMult)}` : ''})`
                : ''}
              {yardHoldKg > 0
                ? ` · ${props.formatTonnes(yardHoldKg)} yard hold (${props.formatMoney(yardFeePerDay)}/day)`
                : ''}
              {foreverYard
                ? ` — yard remainder exceeds WH capacity; use Abandon or fly WH empty over multiple trips`
                : ''}
            </p>
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
  busy: boolean;
  formatTonnes: (kg: number) => string;
  formatUnitPrice: (usdPerKg: number) => string;
  formatMoney: (n: number) => string;
  onOriginChange: (icao: string) => void;
  onAircraftChange: (id: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const onCancelRef = useRef(props.onCancel);
  onCancelRef.current = props.onCancel;

  const selectedOrigin = props.originIcao.trim().toUpperCase();
  const hasUsableOrigin = props.selectedOriginStockKg > 0;
  const intlOk = !props.intlPreview || props.intlPreview.allowed;
  const canConfirm =
    Boolean(selectedOrigin) &&
    hasUsableOrigin &&
    Boolean(props.aircraftId) &&
    props.aircraftOptions.length > 0 &&
    intlOk &&
    !props.busy;
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
                {Math.round(props.distanceNm).toLocaleString()} nm
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

          {selectedOrigin && !hasUsableOrigin ? (
            <p className="demand-accept-hint">
              Store {commodityLabel(props.order).toLowerCase()} in{' '}
              {selectedOrigin} before staging this demand.
            </p>
          ) : null}

          {preview && hasUsableOrigin && props.aircraftId ? (
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
                      preview.marginUsd >= 0
                        ? 'demand-accept-margin-pos'
                        : 'demand-accept-margin-neg'
                    }
                  >
                    {props.formatMoney(preview.marginUsd)}
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
          <button
            type="button"
            className="accept"
            disabled={!canConfirm}
            onClick={props.onConfirm}
          >
            Stage mission
          </button>
        </div>
      </div>
    </div>
  );
}
