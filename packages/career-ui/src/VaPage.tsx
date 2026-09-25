import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  fetchVaMembers,
  fetchVaJoinRequests,
  fetchVaInvites,
  fetchCashflow,
  fetchMissions,
  fetchPorts,
  fetchVaFlightTrack,
  postVaInvite,
  postVaAcceptJoinRequest,
  postVaRejectJoinRequest,
  postVaRecruiting,
  postVaRouteCut,
  postVaAirlineCut,
  postVaLineCrew,
  postVaAutoHaul,
  postVaLeave,
  postVaKick,
  postVaRole,
  postVaUnpublish,
  postVaFleetReserve,
  postVaFleetRelease,
  type VaMember,
  type VaJoinRequest,
  type PlayerAircraft,
  type CareerCashflowSnapshot,
  type CompanyCreditSnapshot,
  type VaFlightQualitySnapshot,
  type VaOrgPerks,
  type Mission,
  type CareerCargoOps,
  type VaHaulHold,
  type VaFlightTrack,
} from './api';
import { BusyBlock, BusyStatus } from './Busy';
import { CompanyCreditBlock, CashflowSummaryGrid, HangarCashflowPanel } from './CashflowPanel';
import { VaMoneyMapDialog } from './VaMoneyMap';
import { VaMemberBriefCard } from './VaMemberBriefCard';
import { VaHaulsBoard } from './VaHaulsBoard';
import { VaPortPathCard } from './VaPortPathCard';
import { PortsPanel } from './PortsPanel';
import { DispatchRouteMap } from './DispatchRouteMap';
import { resolveAirportEndpoint } from './resolve-airport-endpoint';
import { formatBoardMoney } from './board-money';
import type { WeightSystem } from './weight-units';
import { getAuthToken } from './career-auth-client';
import { getStoredCompanyId } from './career-company-client';
import { VA_CUTS_TOOLTIP } from './va-cuts-copy';
import { useConfirm } from './ConfirmDialog';
import {
  logbookCompanyPayoutUsd,
  vaLogbookPilotLabel,
  filterLogbookMissions,
  type LogbookListFilter,
} from './logbook';
import { LogbookFlightCard } from './LogbookFlightCard';
import { LogbookFlightDetail } from './LogbookFlightDetail';
import { LogbookListFilterToggle } from './LogbookListFilterToggle';

/** Browser-safe OD progress (mirrors shared flightTrackProgressPct). */
function liveRouteProgressPct(opts: {
  origin: { lat: number; lon: number };
  dest: { lat: number; lon: number };
  aircraft: { lat: number; lon: number };
}): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const nm = (
    a: { lat: number; lon: number },
    b: { lat: number; lon: number },
  ) => {
    const R = 3440.065;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  };
  const total = nm(opts.origin, opts.dest);
  if (!(total > 0.05)) return 0;
  const flown = nm(opts.origin, opts.aircraft);
  return Math.max(0, Math.min(100, Math.round((flown / total) * 100)));
}

function isLiveTrackFresh(updatedAtMs: number, nowMs = Date.now()): boolean {
  return nowMs - updatedAtMs <= 90_000;
}

/** Same labels as WatchStatusFooter PHASE chip. */
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
  if (rounded >= 10_000) {
    return `FL${String(Math.round(rounded / 100)).padStart(3, '0')}`;
  }
  return `${rounded.toLocaleString()} ft`;
}

function formatLiveGsKt(gsKt: number | null | undefined): string | null {
  if (typeof gsKt !== 'number' || !Number.isFinite(gsKt)) return null;
  return `${Math.round(gsKt)} kt`;
}

type VaPane = 'roster' | 'hangar' | 'hauls' | 'ports' | 'ledger' | 'logbook' | 'config';

function formatRosterLastSeen(
  lastSeenAtMs: number | null | undefined,
  nowMs: number,
): string {
  if (lastSeenAtMs == null || !(lastSeenAtMs > 0)) return 'Never';
  const delta = Math.max(0, nowMs - lastSeenAtMs);
  if (delta < 45_000) return 'Just now';
  if (delta < 3600_000) return `${Math.max(1, Math.floor(delta / 60_000))}m ago`;
  if (delta < 86400_000) {
    return `${Math.max(1, Math.floor(delta / 3600_000))}h ago`;
  }
  if (delta < 7 * 86400_000) {
    return `${Math.max(1, Math.floor(delta / 86400_000))}d ago`;
  }
  try {
    return new Date(lastSeenAtMs).toLocaleDateString();
  } catch {
    return '—';
  }
}

/** Compact At cell: ICAO on ground, short route when airborne/assigned. */
function formatRosterAt(m: Pick<VaMember, 'pilotIcao' | 'flight'>): string {
  const flight = m.flight;
  const od =
    flight?.originIcao && flight?.destIcao
      ? `${flight.originIcao}→${flight.destIcao}`
      : '';
  if (flight?.status === 'in_flight') return od || 'Airborne';
  if (flight?.status === 'dispatched') return od || 'Dispatched';
  if (flight?.status === 'accepted') return od || 'Assigned';
  const icao = (m.pilotIcao ?? '').trim().toUpperCase();
  return icao || '—';
}

type Props = {
  authRequired: boolean;
  activeCompanyId: string | null;
  fleet: PlayerAircraft[];
  walletUsd: number | null;
  busy?: boolean;
  renderHangarCard: (
    aircraft: PlayerAircraft,
    opts: {
      mutationsLocked: boolean;
      busy?: boolean;
      vaReserve?: {
        viewerAccountId: string | null;
        isOwner: boolean;
        labelByAccountId: Record<string, string>;
        inFlight: boolean;
        onReserve: (aircraftId: string) => void | Promise<void>;
        onRelease: (aircraftId: string) => void | Promise<void>;
      };
    },
  ) => ReactNode;
  onWallet?: (walletUsd: number) => void;
  onFleet?: (fleet: PlayerAircraft[]) => void;
  /** Hangar Range/Cruise/Burn for VA fleet typeIds (catalog + learned). */
  onAirframePerf?: (
    perf: Record<
      string,
      {
        maxCargoKg: number;
        maxRangeNm: number;
        cruiseFuelFlowKgPerHour?: number;
        cruiseSpeedKt?: number;
        fuelBurnKgPerNm: number;
      }
    >,
  ) => void;
  onGoCompany?: () => void;
  onGoDirectory?: () => void;
  weightSystem: WeightSystem;
  formatMoney: (n: number) => string;
  formatTonnes: (kg: number) => string;
  vaAircraftIds?: ReadonlySet<string>;
  resolveOpsCompanyId?: (aircraftId: string) => string | undefined;
  ensureOpsCompany?: (aircraftId: string) => Promise<void>;
  resolveMaxCargoKg?: (aircraft: PlayerAircraft) => number;
  economyTick?: number;
  /** Soft continuous clock for Hauls hold TTL countdown. */
  economyClock?: number;
  /** Advances with world pulse — Ports desk / inbound soft-refresh. */
  economyLastBatchAtMs?: number;
  cargoOps?: CareerCargoOps | null;
  onOpenCargoOps?: () => void;
  onOpenAirport?: (icao: string) => void;
  clientUpdateRequiredMin?: string | null;
  onOpenUpdates?: () => void;
  /** After Accept Internal Haul — open Dispatch / staging. */
  onHaulStaged?: (mission: Mission) => void;
  /** Open Dispatch Manifest for a desk hold (ferry off-origin there). */
  onPrepareHaulHold?: (hold: VaHaulHold, aircraftId: string) => void;
  onMissions?: (missions: Mission[]) => void;
  onToast?: (kind: 'ok' | 'fail', message: string) => void;
  /** Switch active tenant to the listed VA (member dual-tenant). */
  onSwitchCompany?: (companyId: string) => void | Promise<void>;
  onLeftVa?: (opts: {
    homeCompanyId: string | null;
    companies: Array<{ id: string; displayName: string }>;
  }) => void | Promise<void>;
  onUnpublished?: () => void | Promise<void>;
  /** Keep Freights Prepare chip in sync with Config cut %. */
  onMemberRouteCutPct?: (pct: number) => void;
  /** Chrome h1 — VA public name while this page is open. */
  onVaIdentity?: (opts: { displayName: string | null }) => void;
  /**
   * Bump after VA wallet mutations outside this page (e.g. debug +$5K) so the
   * Ledger pane refetches instead of keeping a stale cashflow snapshot.
   */
  ledgerRefreshEpoch?: number;
};

export function VaPage(props: Props) {
  const token = getAuthToken();
  const companyId = props.activeCompanyId || getStoredCompanyId();
  const [pane, setPane] = useState<VaPane>('roster');
  const [members, setMembers] = useState<VaMember[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [viewerAccountId, setViewerAccountId] = useState<string | null>(null);
  const [memberCap, setMemberCap] = useState(8);
  const [listed, setListed] = useState(false);
  const [recruiting, setRecruiting] = useState(true);
  const [memberRouteCutPct, setMemberRouteCutPct] = useState(30);
  const [cutDraft, setCutDraft] = useState('30');
  const [memberAirlineCutPct, setMemberAirlineCutPct] = useState(50);
  const [airlineCutDraft, setAirlineCutDraft] = useState('50');
  const [lineCrew, setLineCrew] = useState<{
    hired: boolean;
    tier: 1 | 2 | 3;
    tierName: 'Desk' | 'Ops' | 'Network' | null;
    allowance: number;
    used: number;
    remaining: number;
    hireUsd: number;
    upgradeUsd: number | null;
    nextTierName: 'Ops' | 'Network' | null;
    salaryUsdPerWeek: number;
    fireSeveranceUsd: number;
  } | null>(null);
  const [autoHaul, setAutoHaul] = useState<{
    enabled: boolean;
    maxHaulsPerDay: number;
    payMult: number;
    walletFloorUsd: number;
    postedToday: number;
    postedDayIndex: number;
  } | null>(null);
  const [autoHaulMinMembers, setAutoHaulMinMembers] = useState(2);
  const [portFbo, setPortFbo] = useState<{
    name: string;
    level: number;
  } | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [homeHubIcao, setHomeHubIcao] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<VaJoinRequest[]>([]);
  const [cashflow, setCashflow] = useState<
    (CareerCashflowSnapshot & { walletUsd?: number }) | null
  >(null);
  const [companyCredit, setCompanyCredit] =
    useState<CompanyCreditSnapshot | null>(null);
  const [flightQuality, setFlightQuality] =
    useState<VaFlightQualitySnapshot | null>(null);
  const [orgPerks, setOrgPerks] = useState<VaOrgPerks | null>(null);
  const [ledgerBusy, setLedgerBusy] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [logbookMissions, setLogbookMissions] = useState<Mission[]>([]);
  const [logbookBusy, setLogbookBusy] = useState(false);
  const [logbookError, setLogbookError] = useState<string | null>(null);
  /** Company Logbook list → archived debrief. */
  const [logbookDetailMissionId, setLogbookDetailMissionId] = useState<
    string | null
  >(null);
  const [logbookListFilter, setLogbookListFilter] =
    useState<LogbookListFilter>('settled');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  /** Local hangar — reserve must paint even when App still binds chrome fleet. */
  const [hangarFleet, setHangarFleet] = useState<PlayerAircraft[]>(
    () => props.fleet,
  );
  /** True while My VA pins the listed company session (avoid empty-state flash). */
  const [tenantSwitching, setTenantSwitching] = useState(false);
  const [listedCompanyId, setListedCompanyId] = useState<string | null>(null);
  const [livePilot, setLivePilot] = useState<VaMember | null>(null);
  const [liveTrack, setLiveTrack] = useState<VaFlightTrack | null>(null);
  const [liveOrigin, setLiveOrigin] = useState<{
    icao: string;
    lat: number;
    lon: number;
  } | null>(null);
  const [liveDest, setLiveDest] = useState<{
    icao: string;
    lat: number;
    lon: number;
  } | null>(null);
  const [liveFresh, setLiveFresh] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [moneyMapOpen, setMoneyMapOpen] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  const onSwitchCompanyRef = useRef(props.onSwitchCompany);
  onSwitchCompanyRef.current = props.onSwitchCompany;
  const onWalletRef = useRef(props.onWallet);
  onWalletRef.current = props.onWallet;
  const onFleetRef = useRef(props.onFleet);
  onFleetRef.current = props.onFleet;
  const onAirframePerfRef = useRef(props.onAirframePerf);
  onAirframePerfRef.current = props.onAirframePerf;
  const onMemberRouteCutPctRef = useRef(props.onMemberRouteCutPct);
  onMemberRouteCutPctRef.current = props.onMemberRouteCutPct;
  const onVaIdentityRef = useRef(props.onVaIdentity);
  onVaIdentityRef.current = props.onVaIdentity;
  const hasVaShellRef = useRef(false);
  const ledgerFetchGenRef = useRef(0);
  const logbookFetchGenRef = useRef(0);
  const hangarFleetGenRef = useRef(0);
  const membersFetchGenRef = useRef(0);

  // Leaving My VA mid-fetch: drop late cashflow/members so App onWallet cannot
  // paint VA cash onto chrome after selectTab already restored home.
  useEffect(() => {
    return () => {
      ledgerFetchGenRef.current += 1;
      logbookFetchGenRef.current += 1;
      hangarFleetGenRef.current += 1;
      membersFetchGenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    // Sync from parent unless a newer local reserve/release already painted.
    setHangarFleet(props.fleet);
  }, [props.fleet]);

  useEffect(() => {
    // Wait for members fetch — do not clear chrome title to null while loading
    // (that caused My VA → airline-name flicker on every open).
    if (!loaded) return;
    const name = listed && displayName.trim() ? displayName.trim() : null;
    onVaIdentityRef.current?.({ displayName: name });
  }, [loaded, listed, displayName]);

  const canShow = Boolean(token) || props.authRequired;
  const canManage = role === 'owner' || role === 'dispatcher';
  const isOwner = role === 'owner';
  const ledgerMemberNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) {
      const id = m.accountId?.trim();
      if (!id) continue;
      map[id] = m.displayName?.trim() || m.loginName?.trim() || id;
    }
    return map;
  }, [members]);
  const hangarReadOnly = !isOwner;
  const pageBusy = busy || Boolean(props.busy);
  /** Never invent home cash — null until VA session / cashflow warms. */
  const resolvedWalletUsd =
    typeof props.walletUsd === 'number' && Number.isFinite(props.walletUsd)
      ? props.walletUsd
      : typeof cashflow?.walletUsd === 'number' &&
          Number.isFinite(cashflow.walletUsd)
        ? cashflow.walletUsd
        : null;

  const loadLedger = useCallback(async () => {
    if (!canShow || !companyId) return;
    const gen = ++ledgerFetchGenRef.current;
    setLedgerBusy(true);
    setLedgerError(null);
    try {
      const snap = await fetchCashflow({ companyId });
      // Drop stale responses from a pre-switch (home) fetch.
      if (gen !== ledgerFetchGenRef.current) return;
      setCashflow(snap);
      // Warm vaSessionWallet only (App onWallet is chrome-sticky for members).
      if (typeof snap.walletUsd === 'number' && Number.isFinite(snap.walletUsd)) {
        onWalletRef.current?.(snap.walletUsd);
      }
      // Do NOT push snap.walletUsd to chrome — VA cash stays in-page via
      // cashflow.walletUsd / props.walletUsd (vaSessionWallet).
      if (snap.companyCredit) setCompanyCredit(snap.companyCredit);
      setFlightQuality(snap.flightQuality ?? null);
      setOrgPerks(snap.orgPerks ?? null);
    } catch (err) {
      if (gen !== ledgerFetchGenRef.current) return;
      setLedgerError(err instanceof Error ? err.message : String(err));
    } finally {
      if (gen === ledgerFetchGenRef.current) setLedgerBusy(false);
    }
  }, [canShow, companyId]);

  const loadLogbook = useCallback(async () => {
    if (!canShow || !companyId) return;
    const gen = ++logbookFetchGenRef.current;
    setLogbookBusy(true);
    setLogbookError(null);
    try {
      const snap = await fetchMissions({ companyId });
      if (gen !== logbookFetchGenRef.current) return;
      setLogbookMissions(snap.missions ?? []);
    } catch (err) {
      if (gen !== logbookFetchGenRef.current) return;
      setLogbookError(err instanceof Error ? err.message : String(err));
      setLogbookMissions([]);
    } finally {
      if (gen === logbookFetchGenRef.current) setLogbookBusy(false);
    }
  }, [canShow, companyId]);

  const refresh = useCallback(async () => {
    if (!canShow || !companyId) {
      setLoaded(true);
      return;
    }
    const gen = ++membersFetchGenRef.current;
    setError(null);
    try {
      const m = await fetchVaMembers();
      if (gen !== membersFetchGenRef.current) return;
      setMembers(m.members);
      setRole(m.role);
      setViewerAccountId(m.viewerAccountId ?? null);
      setMemberCap(m.memberCap);
      setListed(m.listed);
      setListedCompanyId(m.companyId?.trim() || null);
      setRecruiting(m.recruiting);
      setMemberRouteCutPct(m.memberRouteCutPct ?? 30);
      setCutDraft(String(m.memberRouteCutPct ?? 30));
      onMemberRouteCutPctRef.current?.(m.memberRouteCutPct ?? 30);
      setMemberAirlineCutPct(m.memberAirlineCutPct ?? 50);
      setAirlineCutDraft(String(m.memberAirlineCutPct ?? 50));
      setLineCrew(m.lineCrew ?? null);
      setAutoHaul(m.autoHaul ?? null);
      setAutoHaulMinMembers(m.autoHaulMinMembers ?? 2);
      setDisplayName(m.displayName);
      setHomeHubIcao(m.homeHubIcao);
      setFlightQuality(m.flightQuality ?? null);
      setOrgPerks(m.orgPerks ?? null);
      hasVaShellRef.current = Boolean(m.role && m.listed);
      // Hangar local first — do not push fleet to App until after tenant pin,
      // or chrome home fleet gets overwritten while active is still home.
      if (Array.isArray(m.fleet)) {
        setHangarFleet(m.fleet);
      }
      // Paint roster first — do not await /api/ports (withCareerWrite) here.
      setLoaded(true);
      if (
        m.switchToCompanyId &&
        m.switchToCompanyId !== companyId &&
        onSwitchCompanyRef.current
      ) {
        // Invalidate any in-flight home cashflow before pinning the VA.
        ledgerFetchGenRef.current += 1;
        setTenantSwitching(true);
        try {
          await onSwitchCompanyRef.current(m.switchToCompanyId);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setTenantSwitching(false);
        }
      }
      if (gen !== membersFetchGenRef.current) return;
      // Fleet + wallet after pin so chrome sticky home already sees active ≠ home.
      if (Array.isArray(m.fleet)) {
        onFleetRef.current?.(m.fleet);
      }
      if (m.airframePerf) {
        onAirframePerfRef.current?.(m.airframePerf);
      }
      if (typeof m.walletUsd === 'number' && Number.isFinite(m.walletUsd)) {
        onWalletRef.current?.(m.walletUsd);
      }
      if (
        m.switchToCompanyId &&
        m.switchToCompanyId !== companyId
      ) {
        return;
      }
      if (m.listed && (m.role === 'owner' || m.role === 'dispatcher')) {
        try {
          const reqs = await fetchVaJoinRequests();
          if (gen !== membersFetchGenRef.current) return;
          setPendingRequests(reqs.requests);
        } catch {
          setPendingRequests([]);
        }
        try {
          const inv = await fetchVaInvites();
          if (gen !== membersFetchGenRef.current) return;
          setInviteCode(inv.invites[0]?.code ?? null);
        } catch {
          setInviteCode(null);
        }
      } else {
        setPendingRequests([]);
        setInviteCode(null);
      }
    } catch (err) {
      if (gen !== membersFetchGenRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
      // Soft-fail: keep the last good VA shell so a blip mid-switch does not
      // flash "Select a company first" for ~10s.
      if (!hasVaShellRef.current) {
        setRole(null);
        setListed(false);
      }
      setLoaded(true);
    }
  }, [canShow, companyId]);

  const loadPortFbo = useCallback(async () => {
    if (!canShow || !companyId) {
      setPortFbo(null);
      return;
    }
    try {
      const portsSnap = await fetchPorts({ companyId });
      const owned = portsSnap.ports.find(
        (p) =>
          p.concession?.status === 'yours' ||
          (p.concession?.companyId &&
            p.concession.companyId === companyId),
      );
      setPortFbo(
        owned
          ? {
              name: owned.name,
              level: owned.concession?.level ?? 1,
            }
          : null,
      );
    } catch {
      setPortFbo(null);
    }
  }, [canShow, companyId]);

  const leaveVa = useCallback(async () => {
    const ok = await confirm({
      title: 'Leave this airline?',
      body: 'You leave the roster and switch back to your own company. Your personal wallet and fleet stay with you — company money and hangar stay with the airline.',
      confirmLabel: 'Leave',
      tone: 'warn',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await postVaLeave();
      await props.onLeftVa?.({
        homeCompanyId: res.homeCompanyId,
        companies: res.companies,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [confirm, props]);

  const unlistVa = useCallback(async () => {
    const others = members.filter((m) => m.role !== 'owner').length;
    const ok = await confirm({
      title: 'Unlist this airline?',
      body:
        others > 0
          ? `Removes the listing from Airlines and drops ${others} other pilot${others === 1 ? '' : 's'} from the roster. Your company, wallet, and fleet stay.`
          : 'Removes the listing from Airlines. Your company, wallet, and fleet stay — you can publish again later.',
      confirmLabel: 'Unlist',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await postVaUnpublish();
      setListed(false);
      setRecruiting(false);
      setMembers((prev) => prev.filter((m) => m.role === 'owner'));
      setPendingRequests([]);
      setInviteCode(null);
      await props.onUnpublished?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [confirm, members, props]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Port FBO chip (Path / Config) — defer /api/ports so Roster paints first.
  useEffect(() => {
    if (!loaded || !listed || tenantSwitching) return;
    if (pane !== 'hauls' && pane !== 'config') return;
    void loadPortFbo();
  }, [pane, loaded, listed, tenantSwitching, loadPortFbo]);

  // Soft-poll roster presence while the pane is open (online / flight / Live).
  useEffect(() => {
    if (pane !== 'roster' || !loaded || !listed) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 15_000);
    return () => window.clearInterval(id);
  }, [pane, loaded, listed, refresh]);

  // Crew Live map — poll track while a roster Live target is open.
  useEffect(() => {
    if (pane !== 'roster' || !livePilot || !listedCompanyId) {
      setLiveTrack(null);
      setLiveOrigin(null);
      setLiveDest(null);
      setLiveFresh(false);
      setLiveError(null);
      setLiveBusy(false);
      return;
    }
    let cancelled = false;
    let resolvedOnce = false;

    async function resolveOdFallback() {
      const originIcao =
        livePilot!.live?.originIcao || livePilot!.flight?.originIcao || '';
      const destIcao =
        livePilot!.live?.destIcao || livePilot!.flight?.destIcao || '';
      if (!originIcao || !destIcao) return;
      const [origin, dest] = await Promise.all([
        resolveAirportEndpoint(originIcao),
        resolveAirportEndpoint(destIcao),
      ]);
      if (cancelled) return;
      if (origin) setLiveOrigin((prev) => prev ?? origin);
      if (dest) setLiveDest((prev) => prev ?? dest);
    }

    async function loadLive(opts?: { initial?: boolean }) {
      if (opts?.initial) setLiveBusy(true);
      try {
        const snap = await fetchVaFlightTrack({
          companyId: listedCompanyId!,
          accountId: livePilot!.accountId,
        });
        if (cancelled) return;
        setLiveTrack(snap.track);
        if (snap.origin) setLiveOrigin(snap.origin);
        if (snap.dest) setLiveDest(snap.dest);
        setLiveFresh(Boolean(snap.fresh));
        setLiveError(null);
        if (!snap.origin || !snap.dest) {
          await resolveOdFallback();
        }
      } catch (err) {
        if (cancelled) return;
        setLiveError(err instanceof Error ? err.message : String(err));
        if (!resolvedOnce) await resolveOdFallback();
      } finally {
        if (!cancelled && opts?.initial) setLiveBusy(false);
        resolvedOnce = true;
      }
    }

    void loadLive({ initial: true });
    // Match flyer POST cadence (FLIGHT_TRACK_POST_MIN_MS = 5s).
    const id = window.setInterval(() => {
      void loadLive();
    }, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pane, livePilot, listedCompanyId]);

  useEffect(() => {
    if (pane !== 'roster') setLivePilot(null);
  }, [pane]);

  // Stable trail/aircraft props — avoid new array/object identity on every
  // VaPage render (roster soft-poll) when the track snapshot did not change.
  const liveMapTrail = useMemo(() => {
    if (!liveTrack || liveTrack.points.length < 1) return null;
    return liveTrack.points.map((p) => ({ lat: p.lat, lon: p.lon }));
  }, [liveTrack]);
  const liveMapAircraft = useMemo(() => {
    const last = liveTrack?.points[liveTrack.points.length - 1];
    if (last) return { lat: last.lat, lon: last.lon };
    const trackLat = liveTrack?.lat;
    const trackLon = liveTrack?.lon;
    if (
      typeof trackLat === 'number' &&
      typeof trackLon === 'number' &&
      Number.isFinite(trackLat) &&
      Number.isFinite(trackLon) &&
      !(trackLat === 0 && trackLon === 0)
    ) {
      return { lat: trackLat, lon: trackLon };
    }
    if (livePilot?.live) {
      return { lat: livePilot.live.lat, lon: livePilot.live.lon };
    }
    return null;
  }, [liveTrack, livePilot?.live]);

  useEffect(() => {
    // Wait until the VA tenant is pinned — a home-tenant cashflow looks like
    // "No ledger yet" while wallet/credit already show the VA from props.
    if (pane === 'ledger' && listed && role && !tenantSwitching) {
      void loadLedger();
    }
  }, [pane, listed, role, tenantSwitching, loadLedger, props.ledgerRefreshEpoch]);

  useEffect(() => {
    if (pane !== 'ledger') setMoneyMapOpen(false);
  }, [pane]);

  useEffect(() => {
    if (pane === 'logbook' && listed && role && !tenantSwitching) {
      void loadLogbook();
    }
  }, [pane, listed, role, tenantSwitching, loadLogbook]);

  const logbookRows = useMemo(() => {
    return [...logbookMissions].sort(
      (a, b) =>
        (b.acceptedAtTick ?? 0) - (a.acceptedAtTick ?? 0) ||
        b.id.localeCompare(a.id),
    );
  }, [logbookMissions]);

  useEffect(() => {
    if (pane !== 'logbook') {
      setLogbookDetailMissionId(null);
      setLogbookListFilter('settled');
    }
  }, [pane]);

  const formatVaMass = useCallback(
    (kg: number) => `${Math.round(kg).toLocaleString('en-US')} kg`,
    [],
  );

  if (!canShow) {
    return (
      <section className="panel va-panel">
        <p className="settings-help">Sign in to manage Crew.</p>
      </section>
    );
  }

  // Roster/config paint as soon as members load. Hangar/ledger wait on the
  // VA tenant pin (fetchState) — do not block the whole My VA shell on that.
  if (!loaded) {
    return (
      <section className="panel va-panel va-panel-loading">
        <BusyBlock label="Loading Crew…" />
      </section>
    );
  }

  if (!companyId || !role) {
    return (
      <section className="panel va-panel">
        <p className="settings-help">
          Select a company first, then publish it from Company → Open for pilots.
        </p>
        {props.onGoCompany ? (
          <button type="button" className="action" onClick={props.onGoCompany}>
            Open Company
          </button>
        ) : null}
      </section>
    );
  }

  if (!listed) {
    return (
      <section className="panel va-panel">
        <h3>Not published yet</h3>
        <p className="settings-help">
          Your company exists, but it is not in Airlines. Publish from
          Company (public name + home hub) — still the same wallet and fleet.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {props.onGoCompany ? (
            <button type="button" className="action" onClick={props.onGoCompany}>
              Publish from Company
            </button>
          ) : null}
          {props.onGoDirectory ? (
            <button
              type="button"
              className="action ghost"
              onClick={props.onGoDirectory}
            >
              Browse Airlines
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="panel va-panel va-panel-shell">
      <div className="panel-head va-my-head">
        <div className="va-my-stats" aria-label="Company summary">
          <div>
            <span className="va-stat-label">HQ</span>
            <span className="va-stat-value">{homeHubIcao || '—'}</span>
          </div>
          <div>
            <span className="va-stat-label">Pilots</span>
            <span className="va-stat-value">
              {members.length}/{memberCap}
            </span>
          </div>
          <div>
            <span className="va-stat-label">Role</span>
            <span className="va-stat-value va-stat-role">
              {role || '—'}
            </span>
          </div>
          <div>
            <span className="va-stat-label">Org</span>
            <span className="va-stat-value">
              {orgPerks?.tierName || '—'}
            </span>
          </div>
          <div>
            <span className="va-stat-label">Hiring</span>
            <span
              className={`va-stat-value${recruiting ? ' is-open' : ' is-closed'}`}
            >
              {recruiting ? 'Open' : 'Closed'}
            </span>
          </div>
        </div>
        <VaMemberBriefCard
          visible={Boolean(role && role !== 'owner')}
        />
        <div className="hangar-pane-toggle" role="tablist" aria-label="Crew views">
          <button
            type="button"
            role="tab"
            aria-selected={pane === 'roster'}
            className={pane === 'roster' ? 'tab active' : 'tab'}
            onClick={() => setPane('roster')}
          >
            Roster
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pane === 'hangar'}
            className={pane === 'hangar' ? 'tab active' : 'tab'}
            onClick={() => setPane('hangar')}
          >
            Hangar
            {props.fleet.length > 0 ? ` (${props.fleet.length})` : ''}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pane === 'hauls'}
            className={pane === 'hauls' ? 'tab active' : 'tab'}
            onClick={() => setPane('hauls')}
          >
            Hauls
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pane === 'ports'}
            className={pane === 'ports' ? 'tab active' : 'tab'}
            onClick={() => setPane('ports')}
          >
            Ports
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pane === 'ledger'}
            className={pane === 'ledger' ? 'tab active' : 'tab'}
            onClick={() => setPane('ledger')}
          >
            Ledger
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pane === 'logbook'}
            className={pane === 'logbook' ? 'tab active' : 'tab'}
            onClick={() => setPane('logbook')}
          >
            Logbook
            {logbookMissions.length > 0 ? ` (${logbookMissions.length})` : ''}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pane === 'config'}
            className={pane === 'config' ? 'tab active' : 'tab'}
            onClick={() => setPane('config')}
          >
            Config
          </button>
        </div>
      </div>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="va-pane-body">
      {pane === 'roster' ? (
        <div className="va-roster-pane">
          {canManage && pendingRequests.length > 0 ? (
            <div className="va-roster-section">
              <p className="va-roster-section-title">Join requests</p>
              <ul className="va-roster-list">
                {pendingRequests.map((req) => (
                  <li key={req.id} className="va-roster-row va-roster-row-request">
                    <div className="va-roster-id">
                      <span className="va-roster-name">{req.displayName}</span>
                      <span className="va-roster-login">@{req.loginName}</span>
                    </div>
                    <div className="va-roster-stat">
                      <span className="va-stat-label">Status</span>
                      <span className="va-stat-value">Pending</span>
                    </div>
                    <div className="va-roster-actions">
                      <button
                        type="button"
                        className="action"
                        disabled={pageBusy}
                        onClick={() => {
                          void (async () => {
                            setBusy(true);
                            try {
                              await postVaAcceptJoinRequest(req.id);
                              await refresh();
                            } catch (err) {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : String(err),
                              );
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="action ghost"
                        disabled={pageBusy}
                        onClick={() => {
                          void (async () => {
                            setBusy(true);
                            try {
                              await postVaRejectJoinRequest(req.id);
                              await refresh();
                            } catch (err) {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : String(err),
                              );
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {members.length === 0 ? (
            <p className="empty">No members.</p>
          ) : (
            <ul
              className={`va-roster-list${isOwner ? ' is-manage' : ''}`}
            >
              {members.map((m) => {
                const at = formatRosterAt(m);
                const flightStatus = m.flight?.status ?? '';
                const flying =
                  flightStatus === 'in_flight' || Boolean(m.live);
                const hasLive =
                  Boolean(m.live) ||
                  flightStatus === 'in_flight' ||
                  flightStatus === 'dispatched' ||
                  flightStatus === 'accepted';
                const lastSeen = m.online
                  ? 'Active now'
                  : `Last seen ${formatRosterLastSeen(m.lastSeenAtMs, Date.now())}`;
                const liveOpen = livePilot?.accountId === m.accountId;
                const canManageMember = isOwner && m.role !== 'owner';
                return (
                <li key={m.accountId} className="va-roster-row">
                  <div className="va-roster-id">
                    <span className="va-roster-name">{m.displayName}</span>
                    <span className="va-roster-login">@{m.loginName}</span>
                  </div>
                  <div className="va-roster-stat">
                    <span className="va-stat-label">Status</span>
                    <span
                      className={`va-stat-value${m.online ? ' is-open' : ''}`}
                      title={lastSeen}
                    >
                      {m.online ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  <div className="va-roster-stat">
                    <span className="va-stat-label">At</span>
                    <div className="va-roster-at-row">
                      <span
                        className={`va-stat-value${flying ? ' is-flying' : ''}`}
                        title={
                          m.live
                            ? formatLivePhase(m.live.phase) || 'Live'
                            : flying
                              ? 'In flight'
                              : undefined
                        }
                      >
                        {at}
                      </span>
                      {hasLive ? (
                        <button
                          type="button"
                          className={`action ghost va-roster-live${liveOpen ? ' is-active' : ''}${m.live ? ' is-hot' : ''}`}
                          disabled={pageBusy}
                          onClick={() => {
                            setLivePilot((prev) =>
                              prev?.accountId === m.accountId ? null : m,
                            );
                          }}
                        >
                          {liveOpen ? 'Close' : 'Live'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="va-roster-stat va-roster-stat-role">
                    <span className="va-stat-label">Role</span>
                    <span
                      className={`va-roster-role va-roster-role-${m.role}`}
                    >
                      {m.role}
                    </span>
                  </div>
                  {canManageMember ? (
                    <div className="va-roster-actions">
                      <button
                        type="button"
                        className="action ghost"
                        disabled={pageBusy}
                        onClick={() => {
                          void (async () => {
                            setBusy(true);
                            try {
                              await postVaRole({
                                accountId: m.accountId,
                                role:
                                  m.role === 'dispatcher'
                                    ? 'pilot'
                                    : 'dispatcher',
                              });
                              await refresh();
                            } catch (err) {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : String(err),
                              );
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}
                      >
                        {m.role === 'dispatcher'
                          ? 'Make pilot'
                          : 'Make dispatcher'}
                      </button>
                      <button
                        type="button"
                        className="action ghost va-roster-kick"
                        disabled={pageBusy}
                        onClick={() => {
                          void (async () => {
                            setBusy(true);
                            try {
                              await postVaKick(m.accountId);
                              await refresh();
                            } catch (err) {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : String(err),
                              );
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}
                      >
                        Kick
                      </button>
                    </div>
                  ) : isOwner ? (
                    <div
                      className="va-roster-actions va-roster-actions-spacer"
                      aria-hidden
                    />
                  ) : null}
                </li>
                );
              })}
            </ul>
          )}
          {livePilot ? (
            <div className="va-live-pane">
              <div className="va-live-head">
                <div className="va-live-title">
                  <strong>{livePilot.displayName}</strong>
                  <span>
                    {liveTrack
                      ? `${liveTrack.originIcao} → ${liveTrack.destIcao}`
                      : livePilot.flight
                        ? `${livePilot.flight.originIcao} → ${livePilot.flight.destIcao}`
                        : 'Live'}
                  </span>
                </div>
                <div className="va-live-meta">
                  {liveBusy && !liveOrigin ? (
                    <span>Loading…</span>
                  ) : liveError ? (
                    <span className="va-live-stale">{liveError}</span>
                  ) : liveTrack && liveOrigin && liveDest ? (
                    <>
                      {(() => {
                        const last =
                          liveTrack.points[liveTrack.points.length - 1];
                        const phaseLabel = formatLivePhase(
                          liveTrack.phase ??
                            last?.phase ??
                            livePilot.live?.phase,
                        );
                        const alt = formatLiveAltFt(
                          liveTrack.altFt ??
                            last?.altFt ??
                            livePilot.live?.altFt,
                        );
                        const gs = formatLiveGsKt(
                          liveTrack.gsKt ??
                            last?.gsKt ??
                            livePilot.live?.gsKt,
                        );
                        const pct = (() => {
                          const lat =
                            typeof liveTrack.lat === 'number'
                              ? liveTrack.lat
                              : last?.lat;
                          const lon =
                            typeof liveTrack.lon === 'number'
                              ? liveTrack.lon
                              : last?.lon;
                          if (
                            typeof lat !== 'number' ||
                            typeof lon !== 'number' ||
                            !Number.isFinite(lat) ||
                            !Number.isFinite(lon)
                          ) {
                            return null;
                          }
                          return liveRouteProgressPct({
                            origin: liveOrigin,
                            dest: liveDest,
                            aircraft: { lat, lon },
                          });
                        })();
                        return (
                          <>
                            {phaseLabel ? (
                              <span className="va-live-phase">{phaseLabel}</span>
                            ) : null}
                            {alt ? <span>{alt}</span> : null}
                            {gs ? <span>{gs}</span> : null}
                            {pct != null ? (
                              <span>{pct}% along route</span>
                            ) : (
                              <span>Waiting for position</span>
                            )}
                          </>
                        );
                      })()}
                      <span
                        className={
                          liveFresh ||
                          isLiveTrackFresh(liveTrack.updatedAtMs)
                            ? 'va-live-fresh'
                            : 'va-live-stale'
                        }
                      >
                        {liveFresh ||
                        isLiveTrackFresh(liveTrack.updatedAtMs)
                          ? 'Live'
                          : 'Stale'}
                      </span>
                    </>
                  ) : liveOrigin && liveDest ? (
                    <span>Waiting for position…</span>
                  ) : (
                    <span>Waiting for flyer Watch / Preflight…</span>
                  )}
                </div>
              </div>
              {liveOrigin && liveDest ? (
                <div className="va-live-map">
                  <DispatchRouteMap
                    origin={liveOrigin}
                    dest={liveDest}
                    plannedOd
                    trail={liveMapTrail}
                    aircraft={liveMapAircraft}
                    aircraftLabel={(() => {
                      const last =
                        liveTrack?.points[liveTrack.points.length - 1];
                      const phase = formatLivePhase(
                        liveTrack?.phase ?? last?.phase ?? livePilot.live?.phase,
                      );
                      const alt = formatLiveAltFt(
                        liveTrack?.altFt ?? last?.altFt ?? livePilot.live?.altFt,
                      );
                      const bits = [livePilot.displayName, phase, alt].filter(
                        Boolean,
                      );
                      return bits.join(' · ') || livePilot.displayName;
                    })()}
                  />
                </div>
              ) : liveBusy ? (
                <BusyBlock label="Loading route…" />
              ) : (
                <p className="settings-help">
                  Planned route unavailable. Position appears when the pilot’s
                  Watch is running on this airline mission.
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {pane === 'hangar' ? (
        <div className="va-pane-card">
          {tenantSwitching && hangarFleet.length === 0 ? (
            <BusyStatus label="Opening company hangar…" />
          ) : (
            <>
          {hangarFleet.length === 0 ? (
            <p className="empty">
              No aircraft yet — buy or lease on Airframes for this company.
            </p>
          ) : (
            <ul className="hangar-list">
              {hangarFleet.map((acf) => {
                const labelByAccountId: Record<string, string> = {};
                for (const m of members) {
                  labelByAccountId[m.accountId] =
                    m.displayName?.trim() || m.loginName || m.accountId;
                }
                const missionInFlight = false;
                return props.renderHangarCard(acf, {
                  mutationsLocked: hangarReadOnly,
                  busy: pageBusy,
                  vaReserve: listed
                    ? {
                        viewerAccountId,
                        isOwner,
                        labelByAccountId,
                        inFlight: missionInFlight,
                        onReserve: async (aircraftId) => {
                          const gen = ++hangarFleetGenRef.current;
                          setBusy(true);
                          setError(null);
                          try {
                            const result = await postVaFleetReserve(aircraftId);
                            if (gen !== hangarFleetGenRef.current) return;
                            setHangarFleet(result.fleet);
                            onFleetRef.current?.(result.fleet);
                          } catch (err) {
                            if (gen !== hangarFleetGenRef.current) return;
                            setError(
                              err instanceof Error
                                ? err.message
                                : String(err),
                            );
                          } finally {
                            if (gen === hangarFleetGenRef.current) {
                              setBusy(false);
                            }
                          }
                        },
                        onRelease: async (aircraftId) => {
                          const gen = ++hangarFleetGenRef.current;
                          setBusy(true);
                          setError(null);
                          try {
                            const result = await postVaFleetRelease(aircraftId);
                            if (gen !== hangarFleetGenRef.current) return;
                            setHangarFleet(result.fleet);
                            onFleetRef.current?.(result.fleet);
                          } catch (err) {
                            if (gen !== hangarFleetGenRef.current) return;
                            setError(
                              err instanceof Error
                                ? err.message
                                : String(err),
                            );
                          } finally {
                            if (gen === hangarFleetGenRef.current) {
                              setBusy(false);
                            }
                          }
                        },
                      }
                    : undefined,
                });
              })}
            </ul>
          )}
            </>
          )}
        </div>
      ) : null}

      {pane === 'hauls' ? (
        <VaHaulsBoard
          companyId={companyId || ''}
          homeHubIcao={homeHubIcao}
          fleet={hangarFleet}
          walletUsd={resolvedWalletUsd ?? 0}
          isOwner={isOwner}
          weightSystem={props.weightSystem}
          busy={pageBusy}
          onWallet={props.onWallet}
          onFleet={(next) => {
            setHangarFleet(next);
            props.onFleet?.(next);
          }}
          onMissions={props.onMissions}
          onStaged={props.onHaulStaged}
          onPrepareHold={props.onPrepareHaulHold}
          resolveMaxCargoKg={props.resolveMaxCargoKg}
          economyTick={props.economyTick}
          economyClock={props.economyClock}
          onGoPorts={() => setPane('ports')}
          onToast={props.onToast}
        />
      ) : null}

      {pane === 'ports' ? (
        <div className="va-ports-pane">
          {tenantSwitching ? (
            <BusyStatus label="Opening company ports…" />
          ) : (
            <PortsPanel
              embedded
              busy={pageBusy || props.busy}
              weightSystem={props.weightSystem}
              formatMoney={props.formatMoney}
              formatTonnes={props.formatTonnes}
              fleet={hangarFleet}
              vaAircraftIds={props.vaAircraftIds}
              logisticsCompanyId={companyId}
              vaMemberRole={
                role === 'owner' ||
                role === 'dispatcher' ||
                role === 'pilot'
                  ? role
                  : null
              }
              ownedShelfLabel="Company"
              resolveOpsCompanyId={props.resolveOpsCompanyId}
              ensureOpsCompany={props.ensureOpsCompany}
              resolveMaxCargoKg={props.resolveMaxCargoKg}
              economyTick={props.economyTick}
              economyLastBatchAtMs={props.economyLastBatchAtMs}
              cargoOps={props.cargoOps}
              onOpenCargoOps={props.onOpenCargoOps}
              onWallet={props.onWallet}
              onFleet={(next) => {
                setHangarFleet(next);
                props.onFleet?.(next);
              }}
              onMissions={props.onMissions}
              onOpenAirport={props.onOpenAirport}
              onStaged={props.onHaulStaged}
              onToast={props.onToast}
              clientUpdateRequiredMin={props.clientUpdateRequiredMin}
              onOpenUpdates={props.onOpenUpdates}
            />
          )}
        </div>
      ) : null}

      {pane === 'ledger' ? (
        <div className="va-pane-card">
          {tenantSwitching || (ledgerBusy && !cashflow) ? (
            <div className="va-pane-loading">
              <BusyBlock
                label={
                  tenantSwitching
                    ? 'Opening company ledger…'
                    : 'Loading ledger…'
                }
              />
            </div>
          ) : (
            <>
          {ledgerError ? (
            <p className="error" role="alert">
              {ledgerError}
            </p>
          ) : null}
          {cashflow ? (
            <CashflowSummaryGrid
              cashflow={cashflow}
              formatMoney={formatBoardMoney}
            />
          ) : null}
          <div className="va-ledger-hero">
            <div className="va-ledger-credit">
              <CompanyCreditBlock
                credit={companyCredit}
                walletUsd={resolvedWalletUsd ?? 0}
                busy={pageBusy || ledgerBusy}
                actionsLocked={!isOwner}
                vaOwnerOpsLabels
                formatMoney={formatBoardMoney}
                onUpdated={({ walletUsd, companyCredit: next }) => {
                  props.onWallet?.(walletUsd);
                  setCompanyCredit(next);
                  void loadLedger();
                }}
                onError={(message) => {
                  setLedgerError(message);
                }}
              />
            </div>
            <div className="va-ledger-wallet">
              <div className="va-ledger-wallet-head">
                <p className="aircraft-card-section-label" style={{ margin: 0 }}>
                  Company wallet
                </p>
                <button
                  type="button"
                  className="action ghost compact va-ledger-money-help"
                  title="How money works"
                  aria-label="How money works"
                  onClick={() => setMoneyMapOpen(true)}
                >
                  ?
                </button>
              </div>
              <p className="va-ledger-wallet-value">
                {resolvedWalletUsd != null
                  ? formatBoardMoney(resolvedWalletUsd)
                  : '—'}
              </p>
              <p className="va-ledger-wallet-hint">
                Shared company cash (owner wallet).
              </p>
            </div>
            <div
              className="va-ledger-quality"
              title="Rolling 7 days · settle score + on-time"
            >
              <p className="aircraft-card-section-label" style={{ margin: 0 }}>
                Flight quality
              </p>
              <p className="va-ledger-quality-value">
                {flightQuality?.qualityScore != null
                  ? Math.round(flightQuality.qualityScore)
                  : '—'}
                {flightQuality && flightQuality.flightCount > 0 ? (
                  <span className="muted">
                    {' '}
                    · {flightQuality.flightCount} flights
                  </span>
                ) : (
                  <span className="muted"> · building</span>
                )}
              </p>
              {orgPerks ? (
                <div className="va-org-perks">
                  <p className="va-org-perks-tier">
                    <strong>{orgPerks.tierName}</strong>
                    {orgPerks.labels.length > 0
                      ? ` · ${orgPerks.labels.join(' · ')}`
                      : null}
                  </p>
                  <ol
                    className="va-org-perks-ladder"
                    aria-label="Org perk tiers"
                  >
                    {(orgPerks.ladder ?? []).map((step) => {
                      const state =
                        orgPerks.tier === step.tier
                          ? 'is-current'
                          : orgPerks.tier > step.tier
                            ? 'is-done'
                            : 'is-ahead';
                      return (
                        <li
                          key={step.tier}
                          className={state}
                          title={`≥${step.minQuality} quality · ${step.minFlights}+ flights`}
                        >
                          <span className="va-org-perks-ladder-name">
                            {step.tierName}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                  {orgPerks.nextTierHint ? (
                    <p className="va-org-perks-next muted">
                      Next · {orgPerks.nextTierHint}
                    </p>
                  ) : orgPerks.tier >= 3 ? (
                    <p className="va-org-perks-next muted">Top tier</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <HangarCashflowPanel
            cashflow={cashflow}
            companyCredit={companyCredit}
            walletUsd={resolvedWalletUsd ?? 0}
            busy={pageBusy || ledgerBusy}
            creditActionsLocked={!isOwner}
            hideCredit
            hideSummaries
            vaOwnerOpsLabels
            memberNamesByAccountId={ledgerMemberNames}
            formatMoney={formatBoardMoney}
            onCreditUpdated={({ walletUsd, companyCredit: next }) => {
              props.onWallet?.(walletUsd);
              setCompanyCredit(next);
              void loadLedger();
            }}
            onCreditError={(message) => {
              setLedgerError(message);
            }}
          />
            </>
          )}
        </div>
      ) : null}

      {pane === 'logbook' ? (
        <div className="va-pane-card">
          {tenantSwitching ? (
            <div className="va-pane-loading">
              <BusyBlock label="Opening company logbook…" />
            </div>
          ) : (
            <>
              {logbookError ? (
                <p className="error" role="alert">
                  {logbookError}
                </p>
              ) : null}
              {logbookBusy && logbookMissions.length === 0 ? (
                <div className="va-pane-loading">
                  <BusyBlock label="Loading flights…" />
                </div>
              ) : (
                (() => {
                  const detailMission = logbookDetailMissionId
                    ? logbookRows.find((m) => m.id === logbookDetailMissionId)
                    : undefined;
                  if (detailMission) {
                    const fleetLabel = detailMission.aircraftId
                      ? hangarFleet.find((a) => a.id === detailMission.aircraftId)
                          ?.label
                      : null;
                    return (
                      <LogbookFlightDetail
                        mission={detailMission}
                        formatMoney={formatBoardMoney}
                        formatMass={formatVaMass}
                        payoutMode="company"
                        fleetLabel={fleetLabel}
                        pilotLabel={vaLogbookPilotLabel(
                          detailMission,
                          ledgerMemberNames,
                        )}
                        onBack={() => setLogbookDetailMissionId(null)}
                      />
                    );
                  }
                  const settledRows = filterLogbookMissions(
                    logbookRows,
                    'settled',
                  );
                  const cancelledRows = filterLogbookMissions(
                    logbookRows,
                    'cancelled',
                  );
                  const listRows = filterLogbookMissions(
                    logbookRows,
                    logbookListFilter,
                  );
                  return (
                    <>
                      <div className="logbook-panel-head-main va-logbook-head">
                        <p className="panel-stats">
                          {logbookListFilter === 'cancelled'
                            ? `${listRows.length} cancelled · ${settledRows.length} settled total`
                            : `${listRows.length} flights · ${cancelledRows.length} cancelled hidden`}
                        </p>
                        <LogbookListFilterToggle
                          value={logbookListFilter}
                          onChange={(next) => {
                            setLogbookListFilter(next);
                            setLogbookDetailMissionId(null);
                          }}
                          settledCount={settledRows.length}
                          cancelledCount={cancelledRows.length}
                        />
                      </div>
                      <ul className="mission-list logbook-list logbook-card-list va-logbook-list">
                        {listRows.map((m) => {
                          const fleetLabel = m.aircraftId
                            ? hangarFleet.find((a) => a.id === m.aircraftId)
                                ?.label
                            : null;
                          return (
                            <LogbookFlightCard
                              key={m.id}
                              mission={m}
                              formatMoney={formatBoardMoney}
                              formatMass={formatVaMass}
                              payoutUsd={logbookCompanyPayoutUsd(m)}
                              fleetLabel={fleetLabel}
                              pilotLabel={vaLogbookPilotLabel(
                                m,
                                ledgerMemberNames,
                              )}
                              selected={logbookDetailMissionId === m.id}
                              onOpen={(mission) =>
                                setLogbookDetailMissionId(mission.id)
                              }
                            />
                          );
                        })}
                        {listRows.length === 0 ? (
                          <li className="empty">
                            {logbookListFilter === 'cancelled'
                              ? 'No cancelled airline flights.'
                              : logbookRows.length === 0
                                ? 'No airline flights yet — accept Freights, Charter, or Internal Haul on a company aircraft.'
                                : 'No settled flights — check Cancelled or fly a leg.'}
                          </li>
                        ) : null}
                      </ul>
                    </>
                  );
                })()
              )}
            </>
          )}
        </div>
      ) : null}

      {pane === 'config' ? (
        <div className="va-pane-card va-config-card">
          <section className="va-config-section va-config-checklist">
            <h4 className="va-config-section-title">Next steps</h4>
            <ul className="va-checklist">
              {isOwner ? (
                <>
                  <li className="is-done">
                    Listed in Airlines · {displayName || 'company'}
                    {homeHubIcao ? ` · ${homeHubIcao}` : ''}
                  </li>
                  <li className={inviteCode ? 'is-done' : undefined}>
                    {inviteCode
                      ? 'Invite code ready (share or renew below)'
                      : 'Create an invite code so pilots can join'}
                  </li>
                  <li
                    className={
                      members.length >= 2 ? 'is-done' : undefined
                    }
                  >
                    {members.length >= 2
                      ? `Roster ${members.length}/${memberCap}`
                      : pendingRequests.length > 0
                        ? `${pendingRequests.length} join request${pendingRequests.length === 1 ? '' : 's'} on Roster`
                        : 'Get a second pilot on the roster'}
                  </li>
                  <li
                    className={
                      lineCrew?.hired ? 'is-done' : undefined
                    }
                  >
                    {lineCrew?.hired
                      ? `Line crew · ${lineCrew.tierName ?? 'Desk'} (${lineCrew.remaining}/${lineCrew.allowance} ferry/wk)`
                      : 'Hire Line crew so empty ferry does not drain the company wallet'}
                  </li>
                  <li className={portFbo ? 'is-done' : undefined}>
                    {portFbo
                      ? `Port FBO · ${portFbo.name} · P${portFbo.level}`
                      : 'Path to Port FBO · WH T3 at hub, then claim on Ports (company CAPEX)'}
                  </li>
                  {portFbo ? (
                    <li>
                      Stock company WH (inbound deposits when it arrives) —
                      then Scout Hold or Auto-haul fills Hauls
                    </li>
                  ) : null}
                </>
              ) : (
                <>
                  <li className="is-done">
                    Joined · market hire {memberRouteCutPct}% · airline desk{' '}
                    {memberAirlineCutPct}% → your home Wallet
                  </li>
                  <li>
                    Crew Hangar · Reserve a parked tail (4h) before Prepare
                  </li>
                  <li>
                    Hauls · Accept desk work (bridges / Demand / Wide haul) when
                    the company has stock
                  </li>
                  <li>
                    Freights · pick an aircraft labeled Airline · settle pays market
                    hire cut home
                  </li>
                </>
              )}
            </ul>
          </section>

          <VaPortPathCard
            companyId={companyId || ''}
            homeHubIcao={homeHubIcao}
            walletUsd={resolvedWalletUsd ?? 0}
            isOwner={isOwner}
            busy={pageBusy}
            onGoPorts={() => setPane('ports')}
          />

          <section className="va-config-section">
            <h4 className="va-config-section-title">Hiring</h4>
            {isOwner ? (
              <label className="va-config-check">
                <input
                  type="checkbox"
                  checked={recruiting}
                  disabled={pageBusy}
                  onChange={(e) => {
                    const next = e.target.checked;
                    void (async () => {
                      setBusy(true);
                      setError(null);
                      try {
                        const res = await postVaRecruiting(next);
                        setRecruiting(res.recruiting);
                        await refresh();
                      } catch (err) {
                        setError(
                          err instanceof Error ? err.message : String(err),
                        );
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                />
                <span>
                  Open recruiting
                  <span className="muted">
                    {' '}
                    · listed in Airlines when on; invite still works when off
                  </span>
                </span>
              </label>
            ) : (
              <p className="settings-sample va-config-readonly">
                Recruiting is <strong>{recruiting ? 'on' : 'off'}</strong>
              </p>
            )}
            {isOwner ? (
              <div className="va-config-field">
                <label className="va-config-field-label" htmlFor="va-route-cut">
                  Market hire cut
                </label>
                <div className="va-config-field-row">
                  <input
                    id="va-route-cut"
                    type="number"
                    min={10}
                    max={50}
                    step={1}
                    value={cutDraft}
                    disabled={pageBusy}
                    className="va-config-cut-input"
                    onChange={(e) => setCutDraft(e.target.value)}
                    onBlur={() => {
                      void (async () => {
                        const n = Number(cutDraft);
                        if (!Number.isFinite(n) || n === memberRouteCutPct) {
                          setCutDraft(String(memberRouteCutPct));
                          return;
                        }
                        setBusy(true);
                        setError(null);
                        try {
                          const res = await postVaRouteCut(n);
                          setMemberRouteCutPct(res.memberRouteCutPct);
                          setCutDraft(String(res.memberRouteCutPct));
                          onMemberRouteCutPctRef.current?.(res.memberRouteCutPct);
                        } catch (err) {
                          setCutDraft(String(memberRouteCutPct));
                          setError(
                            err instanceof Error
                              ? err.message
                              : String(err),
                          );
                        } finally {
                          setBusy(false);
                        }
                      })();
                    }}
                  />
                  <span className="va-config-field-suffix">%</span>
                  <span className="muted va-config-field-hint">
                    Freights / Charter on an airline tail (10–50)
                  </span>
                </div>
              </div>
            ) : (
              <p
                className="settings-sample va-config-readonly"
                title={VA_CUTS_TOOLTIP}
              >
                Market hire <strong>{memberRouteCutPct}%</strong> · airline desk{' '}
                <strong>{memberAirlineCutPct}%</strong>
                <span className="muted"> → your home Wallet</span>
              </p>
            )}
            {isOwner ? (
              <div className="va-config-field">
                <label
                  className="va-config-field-label"
                  htmlFor="va-airline-cut"
                >
                  Airline desk cut
                </label>
                <div className="va-config-field-row">
                  <input
                    id="va-airline-cut"
                    type="number"
                    min={40}
                    max={60}
                    step={1}
                    value={airlineCutDraft}
                    disabled={pageBusy}
                    className="va-config-cut-input"
                    onChange={(e) => setAirlineCutDraft(e.target.value)}
                    onBlur={() => {
                      void (async () => {
                        const n = Number(airlineCutDraft);
                        if (
                          !Number.isFinite(n) ||
                          n === memberAirlineCutPct
                        ) {
                          setAirlineCutDraft(String(memberAirlineCutPct));
                          return;
                        }
                        setBusy(true);
                        setError(null);
                        try {
                          const res = await postVaAirlineCut(n);
                          setMemberAirlineCutPct(res.memberAirlineCutPct);
                          setAirlineCutDraft(String(res.memberAirlineCutPct));
                        } catch (err) {
                          setAirlineCutDraft(String(memberAirlineCutPct));
                          setError(
                            err instanceof Error
                              ? err.message
                              : String(err),
                          );
                        } finally {
                          setBusy(false);
                        }
                      })();
                    }}
                  />
                  <span className="va-config-field-suffix">%</span>
                  <span className="muted va-config-field-hint">
                    Demand / Wide haul from company WH (40–60; below solo 100%)
                  </span>
                </div>
              </div>
            ) : null}
          </section>

          <section className="va-config-section">
            <h4 className="va-config-section-title">Line crew</h4>
            <p className="va-config-section-blurb">
              Empty ferry desk — NPC repositions under weekly allowance.
            </p>
            {lineCrew == null ? (
              <p className="settings-sample va-config-readonly">
                Line crew status unavailable right now.
              </p>
            ) : lineCrew.hired ? (
              <div className="va-config-line-crew is-hired">
                <div className="va-config-line-crew-stats">
                  <div>
                    <span className="va-config-stat-label">Tier</span>
                    <span className="va-config-stat-value">
                      {lineCrew.tierName ?? 'Desk'}
                    </span>
                  </div>
                  <div>
                    <span className="va-config-stat-label">Allowance</span>
                    <span className="va-config-stat-value">
                      {lineCrew.remaining}/{lineCrew.allowance}
                      <span className="muted"> NPC / wk</span>
                    </span>
                  </div>
                  <div>
                    <span className="va-config-stat-label">Salary</span>
                    <span className="va-config-stat-value">
                      ${lineCrew.salaryUsdPerWeek.toLocaleString()}
                      <span className="muted"> / wk</span>
                    </span>
                  </div>
                </div>
                {isOwner ? (
                  <div className="va-config-actions">
                    {lineCrew.upgradeUsd != null && lineCrew.nextTierName ? (
                      <button
                        type="button"
                        className="action"
                        disabled={pageBusy}
                        onClick={() => {
                          void (async () => {
                            const nextName = lineCrew.nextTierName!;
                            const upgradeUsd = lineCrew.upgradeUsd!;
                            const ok = await confirm({
                              title: `Upgrade to ${nextName}?`,
                              body: `Pays $${upgradeUsd.toLocaleString()} from the company wallet. Weekly salary becomes higher; allowance scales up. Used hops this week stay counted.`,
                              confirmLabel: `Upgrade · $${upgradeUsd.toLocaleString()}`,
                            });
                            if (!ok) return;
                            setBusy(true);
                            setError(null);
                            try {
                              const res = await postVaLineCrew('upgrade');
                              setLineCrew(res.lineCrew);
                            } catch (err) {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : String(err),
                              );
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}
                      >
                        Upgrade to {lineCrew.nextTierName} ($
                        {lineCrew.upgradeUsd.toLocaleString()})
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="action ghost"
                      disabled={pageBusy}
                      onClick={() => {
                        void (async () => {
                          const ok = await confirm({
                            title: 'Fire Line crew?',
                            body: `Severance $${lineCrew.fireSeveranceUsd.toLocaleString()} (${lineCrew.tierName ?? 'Desk'} · 1 week). Empty ferries then debit member home wallets. Re-hire starts at Desk.`,
                            confirmLabel: 'Fire',
                            tone: 'warn',
                          });
                          if (!ok) return;
                          setBusy(true);
                          setError(null);
                          try {
                            const res = await postVaLineCrew('fire');
                            setLineCrew(res.lineCrew);
                          } catch (err) {
                            setError(
                              err instanceof Error
                                ? err.message
                                : String(err),
                            );
                          } finally {
                            setBusy(false);
                          }
                        })();
                      }}
                    >
                      Fire Line crew
                    </button>
                  </div>
                ) : (
                  <p className="muted va-config-readonly">
                    Owner manages hire / upgrade / fire. Empty ferries under
                    allowance do not debit your home wallet.
                  </p>
                )}
              </div>
            ) : (
              <div className="va-config-line-crew">
                <p className="settings-sample va-config-readonly">
                  Not hired — empty ferries debit the flying member&apos;s home
                  wallet. Hire starts at Desk.
                </p>
                {isOwner ? (
                  <button
                    type="button"
                    className="action"
                    disabled={pageBusy}
                    onClick={() => {
                      void (async () => {
                        setBusy(true);
                        setError(null);
                        try {
                          const res = await postVaLineCrew('hire');
                          setLineCrew(res.lineCrew);
                        } catch (err) {
                          setError(
                            err instanceof Error
                              ? err.message
                              : String(err),
                          );
                        } finally {
                          setBusy(false);
                        }
                      })();
                    }}
                  >
                    Hire Desk ($
                    {(lineCrew?.hireUsd ?? 2500).toLocaleString()})
                  </button>
                ) : null}
              </div>
            )}
          </section>

          <section className="va-config-section">
            <h4 className="va-config-section-title">Auto-haul desk</h4>
            <p className="va-config-section-blurb">
              Posts Internal Hauls from Scout on the day tick (max{' '}
              {autoHaul?.maxHaulsPerDay ?? 2}/day). Pilot suggest ≈ 45% of
              Market freight for the OD, then your Pay %. Needs ≥
              {autoHaulMinMembers} members + Port FBO stock. Manual Scout
              Confirm has no AI daily cap.
            </p>
            {autoHaul == null ? (
              <p className="settings-sample va-config-readonly">
                Auto-haul status unavailable right now.
              </p>
            ) : (
              <div className="va-config-line-crew">
                <div className="va-config-line-crew-stats">
                  <div>
                    <span className="va-config-stat-label">Today</span>
                    <span className="va-config-stat-value">
                      {autoHaul.postedToday}/{autoHaul.maxHaulsPerDay}
                    </span>
                  </div>
                  <div>
                    <span className="va-config-stat-label">Pay</span>
                    <span className="va-config-stat-value">
                      {Math.round(autoHaul.payMult * 100)}%
                      <span className="muted"> suggest</span>
                    </span>
                  </div>
                  <div>
                    <span className="va-config-stat-label">Floor</span>
                    <span className="va-config-stat-value">
                      {formatBoardMoney(autoHaul.walletFloorUsd)}
                    </span>
                  </div>
                </div>
                {isOwner ? (
                  <div className="va-config-actions">
                    <label className="va-config-check">
                      <input
                        type="checkbox"
                        checked={autoHaul.enabled}
                        disabled={pageBusy}
                        onChange={(e) => {
                          const next = e.target.checked;
                          void (async () => {
                            setBusy(true);
                            setError(null);
                            try {
                              const res = await postVaAutoHaul({
                                enabled: next,
                              });
                              setAutoHaul(res.autoHaul);
                            } catch (err) {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : String(err),
                              );
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}
                      />
                      <span>Enable auto-haul</span>
                    </label>
                    <label className="va-config-field">
                      <span>Max / day</span>
                      <select
                        value={autoHaul.maxHaulsPerDay}
                        disabled={pageBusy}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          void (async () => {
                            setBusy(true);
                            setError(null);
                            try {
                              const res = await postVaAutoHaul({
                                maxHaulsPerDay: n,
                              });
                              setAutoHaul(res.autoHaul);
                            } catch (err) {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : String(err),
                              );
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}
                      >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                      </select>
                    </label>
                    <label className="va-config-field">
                      <span>Pay % of suggest</span>
                      <select
                        value={Math.round(autoHaul.payMult * 100)}
                        disabled={pageBusy}
                        onChange={(e) => {
                          const pct = Number(e.target.value);
                          void (async () => {
                            setBusy(true);
                            setError(null);
                            try {
                              const res = await postVaAutoHaul({
                                payMult: pct / 100,
                              });
                              setAutoHaul(res.autoHaul);
                            } catch (err) {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : String(err),
                              );
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}
                      >
                        <option value={80}>80%</option>
                        <option value={90}>90%</option>
                        <option value={100}>100%</option>
                        <option value={110}>110%</option>
                        <option value={125}>125%</option>
                        <option value={150}>150%</option>
                      </select>
                    </label>
                  </div>
                ) : (
                  <p className="settings-sample va-config-readonly">
                    {autoHaul.enabled
                      ? 'Desk on — bridges appear on Hauls when stock allows.'
                      : 'Desk off — owner enables in Config.'}
                  </p>
                )}
                {members.length < autoHaulMinMembers ? (
                  <p className="muted va-config-field-hint">
                    Recruit at least {autoHaulMinMembers} members before the
                    desk posts (you have {members.length}).
                  </p>
                ) : null}
              </div>
            )}
          </section>

          <section className="va-config-section">
            <h4 className="va-config-section-title">Invites &amp; listing</h4>
            <div className="va-config-actions">
              {canManage ? (
                <button
                  type="button"
                  className="action ghost"
                  disabled={pageBusy}
                  onClick={() => {
                    void (async () => {
                      if (inviteCode) {
                        const ok = await confirm({
                          title: 'Renew invite code?',
                          body: 'The current code stops working. Anyone still using the old link will need the new one.',
                          confirmLabel: 'Renew',
                          tone: 'warn',
                        });
                        if (!ok) return;
                      }
                      setBusy(true);
                      setError(null);
                      try {
                        const { invite } = await postVaInvite({});
                        setInviteCode(invite.code);
                      } catch (err) {
                        setError(
                          err instanceof Error ? err.message : String(err),
                        );
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                >
                  {inviteCode ? 'Renew invite' : 'Create invite'}
                </button>
              ) : (
                <span className="muted">Owner/dispatcher only</span>
              )}
              {isOwner && props.onGoCompany ? (
                <button
                  type="button"
                  className="action ghost"
                  onClick={props.onGoCompany}
                >
                  Edit listing
                </button>
              ) : null}
            </div>
            {inviteCode ? (
              <p className="va-config-invite">
                <span className="va-config-stat-label">Invite code</span>
                <strong className="va-config-invite-code">{inviteCode}</strong>
                <span className="muted"> · does not expire · renew replaces it</span>
              </p>
            ) : (
              <p className="empty">No invite code yet.</p>
            )}
          </section>

          <div className="va-config-danger">
            <h4 className="va-config-section-title">Danger zone</h4>
            {isOwner ? (
              <button
                type="button"
                className="action ghost va-config-danger-btn"
                disabled={pageBusy}
                onClick={() => {
                  void unlistVa();
                }}
              >
                Unlist from Airlines
              </button>
            ) : (
              <button
                type="button"
                className="action ghost va-config-danger-btn"
                disabled={pageBusy}
                onClick={() => {
                  void leaveVa();
                }}
              >
                Leave airline
              </button>
            )}
          </div>
        </div>
      ) : null}
      </div>
      {confirmDialog}
      {moneyMapOpen ? (
        <VaMoneyMapDialog
          marketHireCutPct={memberRouteCutPct}
          airlineLaborCutPct={memberAirlineCutPct}
          onClose={() => setMoneyMapOpen(false)}
        />
      ) : null}
    </section>
  );
}
