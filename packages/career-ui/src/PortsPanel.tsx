import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  fetchPorts,
  postDemandAccept,
  postPortBuy,
  postPortDeposit,
  postPortPickupAbandon,
  postWarehouseBuy,
  postWarehouseUpgrade,
  postWarehouseStockAbandon,
  type CareerCargoOps,
  type DemandOrderView,
  type Mission,
  type PlayerAircraft,
  type PlayerWarehouseSnapshot,
  type PortListingView,
  type PortsSnapshot,
} from './api';
import { PortsMap } from './PortsMap';
import { CommodityIcon } from './CommodityIcon';
import { useConfirm } from './ConfirmDialog';
import {
  displayToKg,
  KG_TO_LB,
  kgToDisplay,
  massUnitLabel,
  type WeightSystem,
} from './weight-units';

/** Mirror of shared WAREHOUSE_T1_CAPACITY_KG (client must not import shared). */
const WH_T1_CAPACITY_KG = 5_000;

function commodityLabel(
  row: { commodityId: string; commodityName?: string },
): string {
  return row.commodityName?.trim() || row.commodityId;
}

const DEMAND_PAGE_SIZE = 10;
/** 1 economy tick = 15 wall-clock minutes. */
const HOURS_PER_TICK = 0.25;
const HOURS_PER_DAY = 24;

type DemandSortKey =
  | 'dest'
  | 'commodity'
  | 'wanted'
  | 'price'
  | 'expires';

type DemandSort = { key: DemandSortKey; direction: 'asc' | 'desc' };

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

export function PortsPanel(props: {
  busy?: boolean;
  weightSystem: WeightSystem;
  formatMoney: (n: number) => string;
  formatTonnes: (kg: number) => string;
  fleet: PlayerAircraft[];
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
  const [portId, setPortId] = useState<string | null>(null);
  const [buyListing, setBuyListing] = useState<PortListingView | null>(null);
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
  const [whShelf, setWhShelf] = useState<'owned' | 'buy'>('owned');
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
  const [selectedOwnedHubIcao, setSelectedOwnedHubIcao] = useState<string | null>(
    null,
  );
  const [selectedBuyHubIcao, setSelectedBuyHubIcao] = useState<string | null>(
    null,
  );
  const [demandSort, setDemandSort] = useState<DemandSort>({
    key: 'expires',
    direction: 'asc',
  });
  const [demandPage, setDemandPage] = useState(1);

  const unit = massUnitLabel(props.weightSystem);

  function isCargoOpsCommodityLocked(commodityId: string): boolean {
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
      ? Math.round(buyListing.unitPriceUsd * kg * 100) / 100
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
      if (result.ports.demand?.orders) setDemand(result.ports.demand.orders);
      const stored = result.storedKg ?? 0;
      const yard = result.yardKg ?? 0;
      let where = 'stored';
      if (stored > 0 && yard > 0) {
        where = `${props.formatTonnes(stored)} into WH · ${props.formatTonnes(yard)} yard hold`;
      } else if (stored > 0) {
        where = `into warehouse`;
      } else if (yard > 0) {
        where = `yard hold at ${result.pickup?.hubIcao ?? buyListing.allocatedHubIcao}`;
      }
      props.onToast?.('ok', `Bought ${props.formatTonnes(result.kg)} · ${where}`);
      closeBuyModal();
      if (yard > 0) setSection('warehouse');
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

  async function onUpgradeWarehouse(warehouseId: string, icao: string) {
    if (props.busy || loading) return;
    const wh = (warehouses?.warehouses ?? []).find((w) => w.id === warehouseId);
    const price =
      wh?.upgradeUsd != null ? props.formatMoney(wh.upgradeUsd) : 'upgrade';
    const ok = await confirm({
      title: `Upgrade ${icao} to Tier 2?`,
      body: (
        <>
          <p>
            Capacity rises to {props.formatTonnes(12_000)} (from{' '}
            {props.formatTonnes(wh?.capacityKg ?? 5_000)}).
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
        `Warehouse ${icao} → T2 · ${props.formatMoney(result.debitUsd)}`,
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
        `Demand ${result.mission.originIcao}→${result.mission.destIcao} · ${props.formatMoney(result.payUsd)} · open Dispatch`,
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
    return wh?.freeKg ?? 0;
  }

  function canStoreAtHub(hubIcao: string, needKg?: number): boolean {
    const free = freeKgAtHub(hubIcao);
    if (needKg == null) return free > 0;
    return free >= needKg;
  }

  const portPickupHubs = useMemo(() => {
    const hubs = port?.pickupHubs ?? [];
    if (hubs.length > 0) return hubs.map((h) => h.toUpperCase());
    return warehouses?.pickupHubs ?? ['SBGR', 'SBKP', 'SBCT'];
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
  const buyUsdByIcao = warehouses?.buyUsdByIcao ?? {};

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
      !allBuyableHubs.includes(selectedBuyHubIcao.trim().toUpperCase())
    ) {
      setSelectedBuyHubIcao(null);
    }
  }, [allBuyableHubs, selectedBuyHubIcao]);

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
    return unique.sort((a, b) => compareDemandOrders(a, b, demandSort));
  }, [demand, demandSort]);
  const demandPageCount = Math.max(
    1,
    Math.ceil(sortedDemand.length / DEMAND_PAGE_SIZE) || 1,
  );
  const safeDemandPage = Math.min(Math.max(1, demandPage), demandPageCount);
  const pagedDemand = useMemo(() => {
    const start = (safeDemandPage - 1) * DEMAND_PAGE_SIZE;
    return sortedDemand.slice(start, start + DEMAND_PAGE_SIZE);
  }, [sortedDemand, safeDemandPage]);
  const demandTableKey = `${safeDemandPage}:${demandSort.key}:${demandSort.direction}:${sortedDemand.length}`;

  useEffect(() => {
    if (demandPage > demandPageCount) setDemandPage(demandPageCount);
  }, [demandPage, demandPageCount]);

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
          <p>
            Buy factory cargo at seaports, park it in a warehouse, then fulfill
            Demand Board orders.
          </p>
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
        <p className="empty">
          {loadError
            ? `Could not load ports — ${loadError}`
            : 'Loading ports…'}
        </p>
      ) : (
        <>
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

          {section === 'catalog' ? (
            <>
              {port ? (
                <h3 className="ports-selected-name">{port.name}</h3>
              ) : (
                <p className="muted">Select a port on the map.</p>
              )}

              <div className="ports-main">
                <PortsMap
                  ports={mapPorts}
                  ownedFbos={mapWarehouses}
                  selectedPortId={port?.id ?? portId}
                  onSelectPort={(id) => {
                    setPortId(id);
                    closeBuyModal();
                  }}
                  onSelectHub={(icao) => props.onOpenAirport?.(icao)}
                />

                <div className="ports-listings">
                  {port ? (
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
                                  No open listings — refresh later.
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
                  ) : (
                    <p className="empty">Select a port.</p>
                  )}
                </div>
              </div>
            </>
          ) : null}

          {section === 'warehouse' ? (
            <>
              <div className="ports-main">
                <PortsMap
                  ports={mapPorts}
                  ownedFbos={mapWarehouses}
                  selectedPortId={
                    whShelf === 'owned' && highlightPortId
                      ? highlightPortId
                      : whShelf === 'buy' && selectedBuyHubIcao
                        ? (portForHub.get(selectedBuyHubIcao)?.id ??
                          port?.id ??
                          portId)
                        : (port?.id ?? portId)
                  }
                  highlightedHubIcao={
                    whShelf === 'owned'
                      ? highlightedHubIcao
                      : whShelf === 'buy'
                        ? selectedBuyHubIcao
                        : null
                  }
                  onSelectPort={(id) => {
                    setPortId(id);
                    if (whShelf === 'owned') {
                      setSelectedStockId(null);
                      setSelectedOwnedHubIcao(null);
                    }
                    if (whShelf === 'buy') setSelectedBuyHubIcao(null);
                  }}
                  onSelectHub={(icao) => props.onOpenAirport?.(icao)}
                />

                <div className="ports-warehouse-side">
                  <div className="ports-warehouse-strip">
                    <h3>Warehouses</h3>
                    <p className="muted ports-warehouse-hint">
                      {whShelf === 'owned'
                        ? 'All your warehouses and stock lots. Select a warehouse or lot to highlight it on the map.'
                        : 'All buyable pickup hubs worldwide. Select a hub to highlight it on the map, then buy.'}
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
                              const needed =
                                wh.shippedNeededForT2Kg ?? 10_000;
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

                                  {wh.tier < 2 ? (
                                    <div className="ports-wh-meter">
                                      <div className="ports-wh-meter-row">
                                        <span>Shipped for T2</span>
                                        <span>
                                          {props.formatTonnes(shipped)} /{' '}
                                          {props.formatTonnes(needed)}
                                        </span>
                                      </div>
                                      <div
                                        className="ports-wh-meter-bar is-ship"
                                        title={`${shippedPct}% toward T2`}
                                      >
                                        <span
                                          style={{ width: `${shippedPct}%` }}
                                        />
                                      </div>
                                      {wh.canUpgrade &&
                                      wh.upgradeUsd != null ? (
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
                                          Upgrade to T2 ·{' '}
                                          {props.formatMoney(wh.upgradeUsd)}
                                        </button>
                                      ) : (
                                        <p className="ports-wh-upgrade-hint">
                                          {wh.upgradeUsd != null
                                            ? `${hubTierLabel ? `${hubTierLabel} · ` : ''}Upgrade ${props.formatMoney(wh.upgradeUsd)} after ship goal`
                                            : 'Ship Demand Board cargo from this hub to unlock T2'}
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <p className="ports-wh-upgrade-hint">
                                      Tier 2 · max for now
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
                    ) : allBuyableHubs.length === 0 ? (
                      <p className="empty">
                        Every port pickup hub already has a warehouse.
                      </p>
                    ) : (
                      <div className="ports-wh-buy-list">
                        {allBuyableHubs.map((icao) => {
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
                  </div>
                </div>
              </div>

              <h3>
                Your pickups
                {port ? ` · ${port.name}` : ''}
              </h3>
              {portPickups.length === 0 ? (
                <p className="empty">
                  No cargo waiting at this port’s hubs — buys auto-store when a
                  warehouse has room.
                </p>
              ) : (
                <>
                  <p className="muted ports-warehouse-hint">
                    Yard hold: cargo waiting outside the warehouse (no WH or WH
                    full). Charged daily until you Store in WH — higher than
                    warehouse storage. Lots larger than WH capacity can never
                    fully store — Abandon (no refund) stops the fee.
                  </p>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Port</th>
                        <th>Hub</th>
                        <th>Commodity</th>
                        <th>Mass</th>
                        <th>Cost</th>
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
                        return (
                          <tr key={p.id}>
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
            <>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
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
                        <td colSpan={6}>
                          <p className="empty">
                            No open demand — hubs with low stock will post
                            orders.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      pagedDemand.map((o, index) => {
                        const cargoLocked = isCargoOpsCommodityLocked(
                          o.commodityId,
                        );
                        return (
                        <tr
                          key={`${o.id}#${index}`}
                          className={cargoLocked ? 'lot-locked' : undefined}
                        >
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
            </>
          ) : null}
        </>
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
          busy={Boolean(props.busy || loading)}
          formatMoney={props.formatMoney}
          formatTonnes={props.formatTonnes}
          formatUnitPrice={formatUnitPrice}
          onAmountChange={setAmountText}
          onCancel={closeBuyModal}
          onConfirm={() => void onConfirmBuy()}
        />
      ) : null}

      {acceptOrder ? (
        <DemandAcceptDialog
          order={acceptOrder}
          originIcao={acceptOrigin}
          aircraftId={acceptAircraftId}
          originOptions={acceptOriginOptions}
          aircraftOptions={acceptAircraftOptions}
          selectedOriginStockKg={selectedOriginStockKg}
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
  const storeIntoWh = hasWh ? Math.min(props.kg, props.hubFreeKg) : 0;
  const yardHoldKg = Math.max(0, props.kg - storeIntoWh);
  const foreverYard =
    hasWh &&
    props.hubCapacityKg != null &&
    yardHoldKg > props.hubCapacityKg;

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
          </p>
          {hasWh ? (
            <p className={foreverYard ? 'confirm-quote is-error' : 'muted'}>
              WH free {props.formatTonnes(props.hubFreeKg)} /{' '}
              {props.formatTonnes(props.hubCapacityKg!)}
              {storeIntoWh > 0
                ? ` · ${props.formatTonnes(storeIntoWh)} stores now`
                : ''}
              {yardHoldKg > 0
                ? ` · ${props.formatTonnes(yardHoldKg)} yard hold (daily fee)`
                : ''}
              {foreverYard
                ? ` — yard remainder exceeds WH capacity; use Abandon or fly WH empty over multiple trips`
                : ''}
            </p>
          ) : (
            <p className="muted">
              No warehouse at {props.listing.allocatedHubIcao} — full amount goes
              to yard hold (daily fee) until you buy WH space.
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
  }>;
  aircraftOptions: PlayerAircraft[];
  selectedOriginStockKg: number;
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
  const canConfirm =
    Boolean(selectedOrigin) &&
    hasUsableOrigin &&
    Boolean(props.aircraftId) &&
    props.aircraftOptions.length > 0 &&
    !props.busy;

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
            {props.formatUnitPrice(props.order.maxUnitPriceUsd)}
          </p>

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
                      <strong>{o.icao}</strong>
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
