import { useCallback, useEffect, useMemo, useState } from 'react';
import { HOURS_PER_TICK } from './economy-clock';
import {
  fetchVaFlightTrack,
  fetchVaHauls,
  postDemandDispatchHold,
  postDemandHoldCancel,
  postWarehouseBridgeDispatchHold,
  postWarehouseBridgeHoldCancel,
  postWarehouseHaulDispatchHold,
  postWarehouseHaulHoldCancel,
  postAddDeskHold,
  type Mission,
  type PlayerAircraft,
  type VaCompanyNetworkNode,
  type VaHaulHold,
  type VaFlightTrack,
  type VaHaulMission,
} from './api';
import { formatBoardMoney } from './board-money';
import { BusyBlock, BusySpinner } from './Busy';
import {
  findNetworkNode,
  hubInNetworkFocus,
  type CompanyNetworkNode,
} from './company-network';
import { VaCompanyNetwork } from './VaCompanyNetwork';
import type { CompanyNetworkLiveFlight } from './CompanyNetworkMap';
import { resolveAirportEndpoint } from './resolve-airport-endpoint';
import { VaPortPathCard } from './VaPortPathCard';
import { isOpsAircraftBoardSelectable } from './ops-fleet';
import { formatMass, type WeightSystem } from './weight-units';

function commodityLabel(id: string): string {
  const raw = id.trim();
  if (!raw) return 'Cargo';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function activeCargoLabel(
  row: VaHaulMission,
  full: Mission | undefined,
): string {
  const lots = (full?.lots ?? row.lots ?? []).filter((line) => line.cargoKg > 0);
  if (lots.length <= 1) {
    return commodityLabel(lots[0]?.commodityId ?? row.commodityId);
  }
  const counts = new Map<string, number>();
  for (const line of lots) {
    const name = commodityLabel(line.commodityId);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
    .join(' · ');
}

function holdKindLabel(kind: VaHaulHold['kind']): string {
  if (kind === 'bridge') return 'Bridge';
  if (kind === 'haul') return 'Wide haul';
  return 'Demand';
}

function holdPayParts(hold: VaHaulHold): string | null {
  const kind = hold.kind ?? 'demand';
  if (kind === 'bridge') {
    const pay = hold.pilotPayUsd ?? 0;
    return pay > 0 ? `pilot ${formatBoardMoney(pay)}` : null;
  }
  const unit = hold.unitPriceUsd ?? 0;
  if (unit > 0 && hold.kg > 0) {
    return `~${formatBoardMoney(Math.round(unit * hold.kg))}`;
  }
  return null;
}

/** Rider contracts keep the warehouse they left. The desk shows where the airplane is. */
function deskActiveOrigin(
  row: VaHaulMission,
  missions: Mission[] | undefined,
): { icao: string; riding: boolean } {
  const stored = row.originIcao.trim().toUpperCase();
  const full = missions?.find((mission) => mission.id === row.id);
  const hostId = full?.throughHostId?.trim();
  if (!hostId) return { icao: stored, riding: false };
  const hostOrigin = missions
    ?.find((mission) => mission.id === hostId)
    ?.originIcao?.trim()
    .toUpperCase();
  if (!hostOrigin) return { icao: stored, riding: false };
  return { icao: hostOrigin, riding: hostOrigin !== stored };
}

function aircraftOptionLabel(
  acf: PlayerAircraft,
  originIcao: string,
): string {
  const origin = originIcao.trim().toUpperCase();
  const loc = (acf.locationIcao ?? '').trim().toUpperCase();
  const atOrigin = loc === origin;
  const where = atOrigin ? `@ ${loc}` : `ferry from ${loc || '—'}`;
  return `${acf.label || acf.id} · ${where}`;
}

const HOURS_PER_DAY = 24;

function formatHoldDuration(hours: number): string {
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

/** Desk-hold TTL countdown (economy clock). Always returns a cell for column align. */
function formatHoldExpiresIn(
  expiresAtTick: number | undefined,
  clock: number | undefined,
): { label: string; urgent: boolean } {
  if (expiresAtTick == null || !Number.isFinite(expiresAtTick)) {
    return { label: '—', urgent: false };
  }
  if (clock == null || !Number.isFinite(clock)) {
    return { label: '…', urgent: false };
  }
  const remainingTicks = expiresAtTick - clock;
  if (remainingTicks <= 0) {
    return { label: 'Expired', urgent: true };
  }
  const hoursLeft = remainingTicks * HOURS_PER_TICK;
  return {
    label: `${formatHoldDuration(hoursLeft)} left`,
    urgent: hoursLeft <= 2,
  };
}

const LIVE_PHASE_LABEL: Record<string, string> = {
  ground: 'On ground',
  taxi_out: 'Taxi out',
  takeoff: 'Takeoff',
  climb: 'Climb',
  cruise: 'Cruise',
  descent: 'Descent',
  approach: 'Approach',
  landing: 'Landing',
  taxi_in: 'Taxi in',
  taxi: 'Taxiing',
  airborne: 'Airborne',
  'ground+engines': 'On ground · engines',
};

function formatLivePhase(phase: string | null | undefined): string | null {
  const key = phase?.trim() || '';
  if (!key) return null;
  return LIVE_PHASE_LABEL[key] ?? key.replace(/_/g, ' ');
}

function formatLiveAltFt(altFt: number | null | undefined): string | null {
  if (typeof altFt !== 'number' || !Number.isFinite(altFt)) return null;
  const rounded = Math.round(altFt);
  if (rounded >= 10_000) return `FL${Math.round(rounded / 100)}`;
  return `${rounded.toLocaleString()} ft`;
}

function haulProgressPct(
  origin: { lat: number; lon: number },
  dest: { lat: number; lon: number },
  aircraft: { lat: number; lon: number },
): number | null {
  const nm = (
    a: { lat: number; lon: number },
    b: { lat: number; lon: number },
  ) => {
    const toR = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toR(b.lat - a.lat);
    const dLon = toR(b.lon - a.lon);
    const lat1 = toR(a.lat);
    const lat2 = toR(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(h)));
  };
  const total = nm(origin, dest);
  if (!(total > 0.05)) return null;
  return Math.max(0, Math.min(100, Math.round((nm(origin, aircraft) / total) * 100)));
}

function networkHubFix(
  nodes: CompanyNetworkNode[],
  icao: string,
): { lat: number; lon: number } | null {
  const code = icao.trim().toUpperCase();
  if (!code) return null;
  const node = nodes.find(
    (n) =>
      n.primaryHubIcao.trim().toUpperCase() === code ||
      n.hubIcaos.some((h) => h.trim().toUpperCase() === code),
  );
  if (
    !node ||
    !Number.isFinite(node.lat) ||
    !Number.isFinite(node.lon) ||
    (node.lat === 0 && node.lon === 0)
  ) {
    return null;
  }
  return { lat: node.lat, lon: node.lon };
}

function asNetworkNodes(
  nodes: VaCompanyNetworkNode[] | undefined,
): CompanyNetworkNode[] {
  return nodes ?? [];
}

type Props = {
  companyId: string;
  homeHubIcao: string;
  fleet: PlayerAircraft[];
  walletUsd: number;
  isOwner: boolean;
  weightSystem: WeightSystem;
  busy?: boolean;
  /** Integer economy tick (fallback for hold TTL). */
  economyTick?: number;
  /** Soft continuous clock for smoother countdown. */
  economyClock?: number;
  onWallet?: (walletUsd: number) => void;
  onFleet?: (fleet: PlayerAircraft[]) => void;
  onMissions?: (missions: Mission[]) => void;
  onStaged?: (mission: Mission) => void;
  /** Logged-in pilot hub. Off-location opens the manifest instead of failing Accept. */
  pilotIcao?: string;
  /** Off-origin or oversize hold: open Dispatch Manifest (ferry / partial load). */
  onPrepareHold?: (
    hold: VaHaulHold,
    aircraftId: string,
    sameRouteHolds?: VaHaulHold[],
  ) => void;
  /** Ops payload estimate for the selected tail (fallback if unknown). */
  resolveMaxCargoKg?: (aircraft: PlayerAircraft) => number;
  onGoPorts?: () => void;
  onToast?: (kind: 'ok' | 'fail', message: string) => void;
  /** Full contracts, so a merged stop can list every commodity. */
  missions?: Mission[];
  /** Accepted flight still waiting on SimBrief. Other desk dests can join it. */
  tripHost?: {
    id: string;
    originIcao: string;
    destIcao: string;
    stopIcaos: string[];
  } | null;
};

export function VaHaulsBoard(props: Props) {
  const [holds, setHolds] = useState<VaHaulHold[]>([]);
  const [active, setActive] = useState<VaHaulMission[]>([]);
  const [networkNodes, setNetworkNodes] = useState<CompanyNetworkNode[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyHoldId, setBusyHoldId] = useState<string | null>(null);
  const [aircraftByHold, setAircraftByHold] = useState<Record<string, string>>(
    {},
  );
  const [networkFocusId, setNetworkFocusId] = useState<string | null>(null);
  const [selectedHoldId, setSelectedHoldId] = useState<string | null>(null);
  const [selectedActiveId, setSelectedActiveId] = useState<string | null>(null);
  const [haulLive, setHaulLive] = useState<{
    missionId: string;
    origin: { icao: string; lat: number; lon: number } | null;
    dest: { icao: string; lat: number; lon: number } | null;
    track: VaFlightTrack | null;
    fresh: boolean;
  } | null>(null);
  const mass = (kg: number) => formatMass(kg, props.weightSystem);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const board = await fetchVaHauls();
      setHolds(board.openHolds ?? []);
      setActive(board.activeMissions ?? []);
      setNetworkNodes(asNetworkNodes(board.companyNetwork));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setHolds([]);
      setActive([]);
      setNetworkNodes([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    setLoaded(false);
    void refresh();
  }, [refresh, props.companyId]);

  const focusNode = findNetworkNode(networkNodes, networkFocusId);
  const hasPortFbo = networkNodes.some((n) => n.kind === 'fbo');

  useEffect(() => {
    if (
      networkFocusId &&
      !networkNodes.some((n) => n.id === networkFocusId)
    ) {
      setNetworkFocusId(null);
    }
  }, [networkFocusId, networkNodes]);

  const filteredHolds = useMemo(
    () =>
      holds.filter((h) =>
        hubInNetworkFocus(focusNode, h.originIcao),
      ),
    [holds, focusNode],
  );

  useEffect(() => {
    if (
      selectedHoldId &&
      !filteredHolds.some((h) => h.id === selectedHoldId)
    ) {
      setSelectedHoldId(null);
    }
  }, [selectedHoldId, filteredHolds]);

  const selectedHoldRoute = useMemo(() => {
    const hold = filteredHolds.find((h) => h.id === selectedHoldId);
    if (!hold) return null;
    if (
      typeof hold.originLat !== 'number' ||
      typeof hold.originLon !== 'number' ||
      typeof hold.destLat !== 'number' ||
      typeof hold.destLon !== 'number' ||
      !Number.isFinite(hold.originLat) ||
      !Number.isFinite(hold.originLon) ||
      !Number.isFinite(hold.destLat) ||
      !Number.isFinite(hold.destLon)
    ) {
      return null;
    }
    return {
      originIcao: hold.originIcao.trim().toUpperCase(),
      destIcao: hold.destIcao.trim().toUpperCase(),
      originLat: hold.originLat,
      originLon: hold.originLon,
      destLat: hold.destLat,
      destLon: hold.destLon,
    };
  }, [filteredHolds, selectedHoldId]);

  const filteredActive = useMemo(
    () =>
      active.filter((m) =>
        hubInNetworkFocus(
          focusNode,
          deskActiveOrigin(m, props.missions).icao,
        ),
      ),
    [active, focusNode, props.missions],
  );

  const selectedActive = useMemo(
    () => filteredActive.find((m) => m.id === selectedActiveId) ?? null,
    [filteredActive, selectedActiveId],
  );

  useEffect(() => {
    if (
      selectedActiveId &&
      !filteredActive.some((m) => m.id === selectedActiveId)
    ) {
      setSelectedActiveId(null);
    }
  }, [selectedActiveId, filteredActive]);

  const selectedActiveOrigin = selectedActive
    ? deskActiveOrigin(selectedActive, props.missions).icao
    : '';
  const selectedActiveDest = selectedActive
    ? selectedActive.destIcao.trim().toUpperCase()
    : '';
  const selectedActiveAccount =
    selectedActive?.pilotAccountId?.trim() ?? '';

  useEffect(() => {
    if (!selectedActive) {
      setHaulLive(null);
      return;
    }
    const missionId = selectedActive.id;
    const originIcao = selectedActiveOrigin;
    const destIcao = selectedActiveDest;
    const accountId = selectedActiveAccount;
    let cancelled = false;

    async function load() {
      let origin = networkHubFix(networkNodes, originIcao);
      let dest = networkHubFix(networkNodes, destIcao);
      let track: VaFlightTrack | null = null;
      let fresh = false;
      if (accountId) {
        try {
          const snap = await fetchVaFlightTrack({
            companyId: props.companyId,
            accountId,
          });
          if (cancelled) return;
          if (snap.track && snap.track.missionId === missionId) {
            track = snap.track;
            fresh = Boolean(snap.fresh);
          }
          if (
            snap.origin &&
            snap.origin.icao.trim().toUpperCase() === originIcao &&
            Number.isFinite(snap.origin.lat) &&
            Number.isFinite(snap.origin.lon)
          ) {
            origin = { lat: snap.origin.lat, lon: snap.origin.lon };
          }
          if (
            snap.dest &&
            snap.dest.icao.trim().toUpperCase() === destIcao &&
            Number.isFinite(snap.dest.lat) &&
            Number.isFinite(snap.dest.lon)
          ) {
            dest = { lat: snap.dest.lat, lon: snap.dest.lon };
          }
        } catch {
          /* route still draws from the hub list */
        }
      }
      if (cancelled) return;
      if (!origin || !dest) {
        const [resolvedOrigin, resolvedDest] = await Promise.all([
          origin
            ? Promise.resolve(null)
            : resolveAirportEndpoint(originIcao),
          dest ? Promise.resolve(null) : resolveAirportEndpoint(destIcao),
        ]);
        if (cancelled) return;
        if (!origin && resolvedOrigin) {
          origin = { lat: resolvedOrigin.lat, lon: resolvedOrigin.lon };
        }
        if (!dest && resolvedDest) {
          dest = { lat: resolvedDest.lat, lon: resolvedDest.lon };
        }
      }
      if (cancelled) return;
      setHaulLive({
        missionId,
        origin: origin ? { icao: originIcao, ...origin } : null,
        dest: dest ? { icao: destIcao, ...dest } : null,
        track,
        fresh,
      });
    }

    void load();
    const id = window.setInterval(() => {
      void load();
    }, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    selectedActive,
    selectedActiveOrigin,
    selectedActiveDest,
    selectedActiveAccount,
    networkNodes,
    props.companyId,
  ]);

  const liveFlight = useMemo((): CompanyNetworkLiveFlight | null => {
    if (!haulLive || haulLive.missionId !== selectedActiveId) return null;
    const origin = haulLive.origin;
    const dest = haulLive.dest;
    if (!origin || !dest) return null;
    const track = haulLive.track;
    const trail = (track?.points ?? [])
      .filter(
        (p) =>
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lon) &&
          !(p.lat === 0 && p.lon === 0),
      )
      .map((p) => ({ lat: p.lat, lon: p.lon }));
    const last = trail[trail.length - 1];
    const trackLat = track?.lat;
    const trackLon = track?.lon;
    const aircraft = last
      ? last
      : typeof trackLat === 'number' &&
          typeof trackLon === 'number' &&
          Number.isFinite(trackLat) &&
          Number.isFinite(trackLon) &&
          !(trackLat === 0 && trackLon === 0)
        ? { lat: trackLat, lon: trackLon }
        : null;
    return {
      originIcao: origin.icao,
      destIcao: dest.icao,
      originLat: origin.lat,
      originLon: origin.lon,
      destLat: dest.lat,
      destLon: dest.lon,
      trail,
      aircraft,
    };
  }, [haulLive, selectedActiveId]);

  const liveStatus = useMemo(() => {
    if (!selectedActive) return null;
    if (!liveFlight) return { stale: false, text: 'Loading route…' };
    const track = haulLive?.track ?? null;
    const aircraft = liveFlight.aircraft;
    const phase = formatLivePhase(track?.phase);
    const alt = formatLiveAltFt(track?.altFt);
    const gs =
      typeof track?.gsKt === 'number' && Number.isFinite(track.gsKt)
        ? `${Math.round(track.gsKt)} kt`
        : null;
    const pct =
      aircraft != null
        ? haulProgressPct(
            { lat: liveFlight.originLat, lon: liveFlight.originLon },
            { lat: liveFlight.destLat, lon: liveFlight.destLon },
            aircraft,
          )
        : null;
    const bits = [
      phase,
      alt,
      gs,
      pct != null ? `${pct}%` : null,
    ].filter(Boolean);
    if (!aircraft) {
      return { stale: true, text: 'No live position' };
    }
    if (!haulLive?.fresh) {
      return {
        stale: true,
        text: bits.length > 0 ? `Stale · ${bits.join(' · ')}` : 'Stale',
      };
    }
    return {
      stale: false,
      text: bits.join(' · ') || `${liveFlight.originIcao} → ${liveFlight.destIcao}`,
    };
  }, [selectedActive, liveFlight, haulLive]);

  /** All parked VA tails — Prepare/Accept like Freights (ferry off-origin in Manifest). */
  const parkedFleet = useMemo(
    () => props.fleet.filter(isOpsAircraftBoardSelectable),
    [props.fleet],
  );

  function pickDefaultAircraftId(originIcao: string): string {
    const origin = originIcao.trim().toUpperCase();
    const atOrigin = parkedFleet.find(
      (acf) =>
        (acf.locationIcao ?? '').trim().toUpperCase() === origin,
    );
    return (atOrigin ?? parkedFleet[0])?.id ?? '';
  }

  function selectedAircraftForHold(hold: VaHaulHold): PlayerAircraft | null {
    const id =
      (aircraftByHold[hold.id] || pickDefaultAircraftId(hold.originIcao)).trim();
    if (!id) return null;
    return parkedFleet.find((a) => a.id === id) ?? null;
  }

  function sameRouteSiblings(hold: VaHaulHold): VaHaulHold[] {
    const origin = hold.originIcao.trim().toUpperCase();
    const dest = hold.destIcao.trim().toUpperCase();
    const kind = hold.kind ?? 'demand';
    return holds.filter((other) => {
      if (other.id === hold.id) return false;
      if ((other.kind ?? 'demand') !== kind) return false;
      return (
        other.originIcao.trim().toUpperCase() === origin &&
        other.destIcao.trim().toUpperCase() === dest
      );
    });
  }

  /** True when the hold won't fit this airframe's ops cap — Manifest slider. */
  function holdNeedsPartialLoad(
    hold: VaHaulHold,
    acf: PlayerAircraft | null,
  ): boolean {
    if (!acf || !props.onPrepareHold) return false;
    const holdKg = Math.max(0, Math.floor(hold.kg));
    if (holdKg <= 0) return false;
    const cap = Math.max(
      0,
      Math.floor(props.resolveMaxCargoKg?.(acf) ?? 0),
    );
    // Unknown cap: still allow Accept (server enforces). Known small cap → Prepare.
    if (cap <= 0) return false;
    return holdKg > cap;
  }

  function shouldPrepareHold(
    hold: VaHaulHold,
    acf: PlayerAircraft | null,
  ): boolean {
    if (!props.onPrepareHold || !acf) return false;
    const origin = hold.originIcao.trim().toUpperCase();
    const atOrigin =
      (acf.locationIcao ?? '').trim().toUpperCase() === origin;
    const pilot = (props.pilotIcao ?? '').trim().toUpperCase();
    const pilotAway = Boolean(pilot) && pilot !== origin;
    return (
      !atOrigin ||
      pilotAway ||
      holdNeedsPartialLoad(hold, acf) ||
      sameRouteSiblings(hold).length > 0
    );
  }

  function canAddHoldToTrip(hold: VaHaulHold): boolean {
    const host = props.tripHost;
    if (!host) return false;
    if (hold.originIcao.trim().toUpperCase() !== host.originIcao.trim().toUpperCase()) {
      return false;
    }
    const dest = hold.destIcao.trim().toUpperCase();
    if (dest === host.destIcao.trim().toUpperCase()) return false;
    return !host.stopIcaos.some((icao) => icao.trim().toUpperCase() === dest);
  }

  async function addHoldToTrip(hold: VaHaulHold) {
    const host = props.tripHost;
    if (!host) return;
    setBusyHoldId(hold.id);
    setError(null);
    try {
      const result = await postAddDeskHold({
        missionId: host.id,
        holdId: hold.id,
        companyId: props.companyId,
      });
      props.onWallet?.(result.walletUsd);
      if (result.fleet) props.onFleet?.(result.fleet);
      props.onMissions?.(result.missions.slice().reverse());
      props.onToast?.(
        'ok',
        `Added ${hold.destIcao} to this flight. Open Dispatch before SimBrief.`,
      );
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      props.onToast?.('fail', message);
    } finally {
      setBusyHoldId(null);
    }
  }

  async function acceptHold(hold: VaHaulHold) {
    const origin = hold.originIcao.trim().toUpperCase();
    const acf = selectedAircraftForHold(hold);
    const aircraftId = acf?.id?.trim() ?? '';
    if (!aircraftId || !acf) {
      setError('No parked company aircraft available');
      return;
    }
    if (shouldPrepareHold(hold, acf)) {
      props.onPrepareHold?.(hold, aircraftId, sameRouteSiblings(hold));
      return;
    }
    if ((acf.locationIcao ?? '').trim().toUpperCase() !== origin) {
      setError(`Aircraft is at ${acf.locationIcao}, not ${origin} — Prepare to ferry`);
      return;
    }
    setBusyHoldId(hold.id);
    setError(null);
    const kind = hold.kind ?? 'demand';
    try {
      const result =
        kind === 'bridge'
          ? await postWarehouseBridgeDispatchHold({
              holdId: hold.id,
              aircraftId,
              companyId: props.companyId,
            })
          : kind === 'haul'
            ? await postWarehouseHaulDispatchHold({
                holdId: hold.id,
                aircraftId,
                companyId: props.companyId,
              })
            : await postDemandDispatchHold({
                holdId: hold.id,
                aircraftId,
                companyId: props.companyId,
              });
      props.onWallet?.(result.walletUsd);
      props.onFleet?.(result.fleet);
      props.onMissions?.(result.missions.slice().reverse());
      const payNote =
        kind === 'bridge' && (result as { pilotPayUsd?: number }).pilotPayUsd
          ? ` · pilot ${formatBoardMoney((result as { pilotPayUsd?: number }).pilotPayUsd ?? 0)}`
          : 'payUsd' in result && typeof result.payUsd === 'number'
            ? ` · ${formatBoardMoney(result.payUsd)}`
            : '';
      props.onToast?.(
        'ok',
        `${holdKindLabel(kind)} ${result.mission.originIcao}→${result.mission.destIcao} · ${mass(result.kg)}${payNote} · open Dispatch`,
      );
      props.onStaged?.(result.mission);
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      props.onToast?.('fail', message);
    } finally {
      setBusyHoldId(null);
    }
  }

  function prepareHold(hold: VaHaulHold) {
    const acf = selectedAircraftForHold(hold);
    const aircraftId = acf?.id?.trim() ?? '';
    if (!aircraftId) {
      setError('No parked company aircraft available');
      return;
    }
    if (!props.onPrepareHold) {
      void acceptHold(hold);
      return;
    }
    props.onPrepareHold(hold, aircraftId, sameRouteSiblings(hold));
  }

  async function cancelHold(hold: VaHaulHold) {
    setBusyHoldId(hold.id);
    setError(null);
    const kind = hold.kind ?? 'demand';
    try {
      if (kind === 'bridge') {
        const result = await postWarehouseBridgeHoldCancel({
          holdId: hold.id,
          companyId: props.companyId,
        });
        props.onToast?.(
          'ok',
          `Released ${mass(result.kg)} bridge hold`,
        );
      } else if (kind === 'haul') {
        const result = await postWarehouseHaulHoldCancel({
          holdId: hold.id,
          companyId: props.companyId,
        });
        props.onToast?.(
          'ok',
          `Released ${mass(result.kg)} wide haul hold`,
        );
      } else {
        const result = await postDemandHoldCancel({
          holdId: hold.id,
          companyId: props.companyId,
        });
        props.onToast?.(
          'ok',
          `Released ${mass(result.kg)} Demand hold`,
        );
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyHoldId(null);
    }
  }

  const pageBusy = Boolean(props.busy) || busyHoldId != null;

  return (
    <div className="va-pane-card va-hauls-pane">
      <header className="va-hauls-head">
        <div>
          <h3>Hauls</h3>
          <p className="settings-help">
            {!loaded
              ? 'Airline desk.'
              : hasPortFbo
                ? 'Parked company tail · Accept or Prepare.'
                : 'No Port FBO yet — fly Freights on an airline tail.'}
          </p>
        </div>
        {props.onGoPorts ? (
          <button
            type="button"
            className="action ghost"
            disabled={pageBusy}
            onClick={props.onGoPorts}
          >
            Open Ports desk
          </button>
        ) : null}
      </header>

      {loaded && !hasPortFbo ? (
        <VaPortPathCard
          companyId={props.companyId}
          homeHubIcao={props.homeHubIcao}
          walletUsd={props.walletUsd}
          isOwner={props.isOwner}
          busy={pageBusy}
          onGoPorts={props.onGoPorts}
        />
      ) : null}

      {loaded && networkNodes.length > 0 ? (
        <VaCompanyNetwork
          nodes={networkNodes}
          selectedId={networkFocusId}
          onSelect={setNetworkFocusId}
          highlightRoute={selectedHoldRoute}
          liveFlight={liveFlight}
          showMap={networkNodes.length > 1 || hasPortFbo}
          disabled={pageBusy}
          weightSystem={props.weightSystem}
        />
      ) : null}

      {liveStatus ? (
        <p
          className={
            liveStatus.stale
              ? 'va-hauls-live-status va-live-stale'
              : 'va-hauls-live-status'
          }
          role="status"
        >
          {selectedActiveOrigin} → {selectedActiveDest}
          {liveStatus.text ? ` · ${liveStatus.text}` : ''}
        </p>
      ) : null}

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      {!loaded ? (
        <div className="va-pane-loading">
          <BusyBlock label="Loading hauls…" />
        </div>
      ) : (
        <>
          <section className="va-hauls-section">
            <h4 className="va-config-section-title">
              Open desk work
              {filteredHolds.length > 0
                ? ` (${filteredHolds.length}${
                    focusNode && filteredHolds.length !== holds.length
                      ? ` / ${holds.length}`
                      : ''
                  })`
                : ''}
            </h4>
            {filteredHolds.length === 0 ? (
              <p className="empty">
                {hasPortFbo
                  ? focusNode
                    ? `No holds from ${focusNode.title} — try All or Scout Hold.`
                    : 'No holds — Scout Hold from Ports.'
                  : 'No desk work yet — finish Port FBO path, or fly Freights.'}
              </p>
            ) : parkedFleet.length === 0 ? (
              <p className="empty">
                No parked company aircraft — park a tail, then Prepare.
              </p>
            ) : (
              <ul className="va-hauls-list">
                {filteredHolds.map((hold) => {
                  const origin = hold.originIcao.trim().toUpperCase();
                  const dest = hold.destIcao.trim().toUpperCase();
                  const selectedId =
                    aircraftByHold[hold.id] ||
                    pickDefaultAircraftId(hold.originIcao);
                  const selected = parkedFleet.find((a) => a.id === selectedId);
                  const kind = hold.kind ?? 'demand';
                  const pay = holdPayParts(hold);
                  const busyThis = busyHoldId === hold.id;
                  const usePrepare = shouldPrepareHold(hold, selected ?? null);
                  const addToTrip = canAddHoldToTrip(hold);
                  const openFlight =
                    props.tripHost != null && !addToTrip
                      ? hold.originIcao.trim().toUpperCase() !==
                        props.tripHost.originIcao.trim().toUpperCase()
                        ? `Open flight leaves from ${props.tripHost.originIcao}. This hold leaves from ${hold.originIcao.trim().toUpperCase()}.`
                        : `This flight already stops at ${hold.destIcao.trim().toUpperCase()}.`
                      : null;
                  const needsPartial = holdNeedsPartialLoad(
                    hold,
                    selected ?? null,
                  );
                  const atOrigin =
                    (selected?.locationIcao ?? '').trim().toUpperCase() ===
                    origin;
                  const isSelected = selectedHoldId === hold.id;
                  const clock =
                    typeof props.economyClock === 'number' &&
                    Number.isFinite(props.economyClock)
                      ? props.economyClock
                      : props.economyTick;
                  const expiry = formatHoldExpiresIn(hold.expiresAtTick, clock);
                  const distNm =
                    typeof hold.distanceNm === 'number' &&
                    Number.isFinite(hold.distanceNm) &&
                    hold.distanceNm > 0
                      ? Math.round(hold.distanceNm).toLocaleString()
                      : '—';
                  const byName = hold.heldByName?.trim() || null;
                  return (
                    <li
                      key={hold.id}
                      className={
                        isSelected
                          ? 'va-hauls-row is-selected'
                          : 'va-hauls-row'
                      }
                      onClick={() =>
                        setSelectedHoldId((prev) =>
                          prev === hold.id ? null : hold.id,
                        )
                      }
                    >
                      <div className="va-hauls-row-id">
                        <strong className="va-hauls-route-od">
                          {origin}
                          <span className="va-hauls-route-arrow" aria-hidden>
                            →
                          </span>
                          {dest}
                        </strong>
                        <span
                          className={`va-hauls-kind va-hauls-kind-${kind}`}
                        >
                          {holdKindLabel(kind)}
                        </span>
                      </div>
                      <div className="va-hauls-stats" aria-label="Hold details">
                        <div>
                          <span className="va-stat-label">Cargo</span>
                          <span className="va-stat-value">
                            {commodityLabel(hold.commodityId)}
                          </span>
                        </div>
                        <div>
                          <span className="va-stat-label">Mass</span>
                          <span className="va-stat-value">{mass(hold.kg)}</span>
                        </div>
                        <div>
                          <span className="va-stat-label">Dist</span>
                          <span className="va-stat-value">
                            {distNm === '—' ? '—' : `${distNm} nm`}
                          </span>
                        </div>
                        <div>
                          <span className="va-stat-label">Pay</span>
                          <span className="va-stat-value">{pay ?? '—'}</span>
                        </div>
                        <div>
                          <span className="va-stat-label">Expires</span>
                          <span
                            className={`va-stat-value va-hauls-expiry${
                              expiry.urgent ? ' is-urgent' : ''
                            }`}
                            title={
                              kind === 'demand'
                                ? 'Hold TTL, capped by Demand order expiry'
                                : 'Hold TTL by warehouse tier'
                            }
                          >
                            {expiry.label}
                          </span>
                        </div>
                        <div>
                          <span className="va-stat-label">By</span>
                          <span
                            className="va-stat-value"
                            title={byName ? 'Posted by' : undefined}
                          >
                            {byName || '—'}
                          </span>
                        </div>
                      </div>
                      <div
                        className="va-hauls-actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label className="simbrief-field va-hauls-aircraft">
                          <span>Aircraft</span>
                          <select
                            value={selectedId}
                            disabled={pageBusy}
                            aria-label="Aircraft for haul"
                            onChange={(e) =>
                              setAircraftByHold((prev) => ({
                                ...prev,
                                [hold.id]: e.target.value,
                              }))
                            }
                          >
                            {parkedFleet.map((acf) => (
                              <option key={acf.id} value={acf.id}>
                                {aircraftOptionLabel(acf, origin)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="action"
                          disabled={
                            pageBusy ||
                            Boolean(openFlight) ||
                            (!addToTrip && !selectedId)
                          }
                          title={
                            openFlight
                              ? openFlight
                              : addToTrip
                              ? 'This flight is still open. The hold rides along and delivers at its own stop.'
                              : props.onPrepareHold
                              ? needsPartial
                                ? `Hold ${mass(hold.kg)} exceeds this airframe — open Manifest to load a slice`
                                : !atOrigin
                                  ? `Open Manifest — ferry to ${origin} before Accept`
                                  : 'Open Manifest to set the payload before this flight is accepted'
                              : 'Dispatch the full hold on this aircraft'
                          }
                          data-no-action-wait="1"
                          onClick={() => {
                            if (openFlight) return;
                            if (addToTrip) {
                              void addHoldToTrip(hold);
                              return;
                            }
                            if (props.onPrepareHold && selectedId) {
                              prepareHold(hold);
                              return;
                            }
                            void acceptHold(hold);
                          }}
                        >
                          {busyThis ? (
                            <BusySpinner
                              size="sm"
                              className="busy-spinner-on-accent"
                            />
                          ) : null}
                          {openFlight
                            ? 'Open flight'
                            : addToTrip
                              ? 'Add to flight'
                              : props.onPrepareHold
                                ? 'Prepare'
                                : 'Accept'}
                        </button>
                        <button
                          type="button"
                          className="action ghost"
                          disabled={pageBusy}
                          data-no-action-wait="1"
                          title="Release reserved cargo back to the desk"
                          onClick={() => void cancelHold(hold)}
                        >
                          {busyThis ? <BusySpinner size="sm" /> : null}
                          Cancel
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="va-hauls-section">
            <h4 className="va-config-section-title">
              Active
              {filteredActive.length > 0
                ? ` (${filteredActive.length})`
                : ''}
            </h4>
            {filteredActive.length === 0 ? (
              <p className="empty">None in progress.</p>
            ) : (
              <ul className="va-hauls-list">
                {filteredActive.map((m) => {
                  const shown = deskActiveOrigin(m, props.missions);
                  const origin = shown.icao;
                  const dest = m.destIcao.trim().toUpperCase();
                  const kind = m.kind ?? 'other';
                  const kindLabel =
                    kind === 'other' ? 'Flight' : holdKindLabel(kind);
                  const acf = m.aircraftId
                    ? props.fleet.find((a) => a.id === m.aircraftId)
                    : undefined;
                  const tail =
                    acf?.label?.trim() ||
                    acf?.registration?.trim() ||
                    null;
                  const distNm =
                    !shown.riding &&
                    typeof m.distanceNm === 'number' &&
                    Number.isFinite(m.distanceNm) &&
                    m.distanceNm > 0
                      ? Math.round(m.distanceNm).toLocaleString()
                      : null;
                  const statusLabel = m.status.replace(/_/g, ' ');
                  const pilotName = m.pilotName?.trim() || null;
                  return (
                    <li
                      key={m.id}
                      className={
                        selectedActiveId === m.id
                          ? 'va-hauls-row va-hauls-row-active is-selected'
                          : 'va-hauls-row va-hauls-row-active'
                      }
                      onClick={() =>
                        setSelectedActiveId((prev) =>
                          prev === m.id ? null : m.id,
                        )
                      }
                    >
                      <div className="va-hauls-row-id">
                        <strong className="va-hauls-route-od">
                          {origin}
                          <span className="va-hauls-route-arrow" aria-hidden>
                            →
                          </span>
                          {dest}
                        </strong>
                        <span
                          className={`va-hauls-kind va-hauls-kind-${
                            kind === 'other' ? 'demand' : kind
                          }`}
                        >
                          {kindLabel}
                        </span>
                      </div>
                      <div
                        className="va-hauls-stats"
                        aria-label="Active flight details"
                      >
                        <div>
                          <span className="va-stat-label">Cargo</span>
                          <span className="va-stat-value va-stat-cargo">
                            {activeCargoLabel(
                              m,
                              props.missions?.find((mission) => mission.id === m.id),
                            )}
                          </span>
                        </div>
                        <div>
                          <span className="va-stat-label">Mass</span>
                          <span className="va-stat-value">
                            {mass(m.cargoKg)}
                          </span>
                        </div>
                        <div>
                          <span className="va-stat-label">Dist</span>
                          <span className="va-stat-value">
                            {distNm ? `${distNm} nm` : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="va-stat-label">Pay</span>
                          <span className="va-stat-value">
                            {m.payUsd > 0
                              ? formatBoardMoney(m.payUsd)
                              : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="va-stat-label">Status</span>
                          <span className="va-stat-value va-hauls-status">
                            {statusLabel}
                          </span>
                        </div>
                        <div>
                          <span className="va-stat-label">Pilot</span>
                          <span
                            className="va-stat-value"
                            title={pilotName ?? undefined}
                          >
                            {pilotName || '—'}
                          </span>
                        </div>
                      </div>
                      <div className="va-hauls-actions va-hauls-actions-readonly">
                        <div className="va-hauls-aircraft-ro">
                          <span className="va-stat-label">Aircraft</span>
                          <span
                            className="va-stat-value"
                            title={tail ?? undefined}
                          >
                            {tail || '—'}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
