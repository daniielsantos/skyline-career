import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  fetchVaMembers,
  fetchVaJoinRequests,
  fetchVaInvites,
  fetchCashflow,
  fetchMissions,
  fetchPorts,
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
} from './api';
import { BusyBlock, BusyStatus } from './Busy';
import { CompanyCreditBlock, HangarCashflowPanel } from './CashflowPanel';
import { VaMoneyMap } from './VaMoneyMap';
import { VaHaulsBoard } from './VaHaulsBoard';
import { VaPortPathCard } from './VaPortPathCard';
import { PortsPanel } from './PortsPanel';
import { formatBoardMoney } from './board-money';
import type { WeightSystem } from './weight-units';
import { getAuthToken } from './career-auth-client';
import { getStoredCompanyId } from './career-company-client';
import { useConfirm } from './ConfirmDialog';
import {
  logbookAircraftLabel,
  logbookCargoLabel,
  logbookCompanyPayoutUsd,
  logbookDistanceNm,
  logbookFlightDurationLabel,
  logbookFlightKind,
  logbookFlightWhenLabel,
  logbookStatusLabel,
  vaLogbookPilotLabel,
} from './logbook';

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

function formatRosterFlight(
  flight: VaMember['flight'],
): string {
  if (!flight) return 'On the ground';
  const od =
    flight.originIcao && flight.destIcao
      ? `${flight.originIcao}→${flight.destIcao}`
      : '';
  if (flight.status === 'in_flight') {
    return od ? `In flight ${od}` : 'In flight';
  }
  if (flight.status === 'dispatched') {
    return od ? `Dispatched ${od}` : 'Dispatched';
  }
  if (flight.status === 'accepted') {
    return od ? `Assigned ${od}` : 'Assigned';
  }
  return od || flight.status;
}

function formatRosterHub(pilotIcao: string | null | undefined): string {
  const icao = (pilotIcao ?? '').trim().toUpperCase();
  return icao ? `At ${icao}` : 'Hub —';
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  /** Local hangar — reserve must paint even when App still binds chrome fleet. */
  const [hangarFleet, setHangarFleet] = useState<PlayerAircraft[]>(
    () => props.fleet,
  );
  /** True while My VA pins the listed company session (avoid empty-state flash). */
  const [tenantSwitching, setTenantSwitching] = useState(false);
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
      const snap = await fetchCashflow();
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
    setError(null);
    try {
      const m = await fetchVaMembers();
      setMembers(m.members);
      setRole(m.role);
      setViewerAccountId(m.viewerAccountId ?? null);
      setMemberCap(m.memberCap);
      setListed(m.listed);
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
          setPendingRequests(reqs.requests);
        } catch {
          setPendingRequests([]);
        }
        try {
          const inv = await fetchVaInvites();
          setInviteCode(inv.invites[0]?.code ?? null);
        } catch {
          setInviteCode(null);
        }
      } else {
        setPendingRequests([]);
        setInviteCode(null);
      }
    } catch (err) {
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

  // Soft-poll roster presence while the pane is open (online / flight).
  useEffect(() => {
    if (pane !== 'roster' || !loaded || !listed) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [pane, loaded, listed, refresh]);

  useEffect(() => {
    // Wait until the VA tenant is pinned — a home-tenant cashflow looks like
    // "No ledger yet" while wallet/credit already show the VA from props.
    if (pane === 'ledger' && listed && role && !tenantSwitching) {
      void loadLedger();
    }
  }, [pane, listed, role, tenantSwitching, loadLedger, props.ledgerRefreshEpoch]);

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
        <div>
          <p className="va-my-meta settings-sample">
            {homeHubIcao || '—'} · {members.length}/{memberCap} seats · recruiting{' '}
            <strong>{recruiting ? 'on' : 'off'}</strong> · role{' '}
            <strong>{role}</strong>
            {orgPerks ? (
              <>
                {' '}
                · org{' '}
                <strong>
                  {orgPerks.tierName}
                  {orgPerks.tier > 0 ? ` T${orgPerks.tier}` : ''}
                </strong>
                {orgPerks.nextTierHint ? (
                  <span className="muted">
                    {' '}
                    · next{' '}
                    {(orgPerks.ladder ?? []).find(
                      (step) => step.tier === orgPerks.tier + 1,
                    )?.tierName ?? 'tier'}
                  </span>
                ) : null}
              </>
            ) : null}
          </p>
        </div>
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
        <div className="settings-card va-pane-card">
          <h3>Roster</h3>
          {canManage && pendingRequests.length > 0 ? (
            <div className="va-roster-section">
              <h4 className="va-roster-section-title">Join requests</h4>
              <ul className="va-roster-list">
                {pendingRequests.map((req) => (
                  <li key={req.id} className="va-roster-row va-roster-row-request">
                    <div className="va-roster-id">
                      <span className="va-roster-name">{req.displayName}</span>
                      <span className="va-roster-login">@{req.loginName}</span>
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
            <p className="settings-sample">No members.</p>
          ) : (
            <ul
              className={`va-roster-list${isOwner ? ' is-manage' : ''}`}
            >
              {members.map((m) => (
                <li key={m.accountId} className="va-roster-row">
                  <div className="va-roster-id">
                    <span className="va-roster-name">{m.displayName}</span>
                    <span className="va-roster-login">@{m.loginName}</span>
                  </div>
                  <div className="va-roster-presence">
                    <span
                      className={`va-roster-online${m.online ? ' is-online' : ''}`}
                    >
                      {m.online ? 'Online' : 'Offline'}
                    </span>
                    <span className="va-roster-seen">
                      {m.online
                        ? 'Active now'
                        : `Last seen ${formatRosterLastSeen(m.lastSeenAtMs, Date.now())}`}
                    </span>
                  </div>
                  <div className="va-roster-place">
                    <span className="va-roster-hub">{formatRosterHub(m.pilotIcao)}</span>
                    <span
                      className={`va-roster-flight${
                        m.flight?.status === 'in_flight' ? ' is-flying' : ''
                      }`}
                    >
                      {formatRosterFlight(m.flight)}
                    </span>
                  </div>
                  <span
                    className={`va-roster-role va-roster-role-${m.role}`}
                  >
                    {m.role}
                  </span>
                  {isOwner && m.role !== 'owner' ? (
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
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {pane === 'hangar' ? (
        <div className="va-pane-card">
          {tenantSwitching && hangarFleet.length === 0 ? (
            <BusyStatus label="Opening company hangar…" />
          ) : (
            <>
          {hangarReadOnly ? (
            <p className="settings-help">
              Company hangar (shared airline fleet). Sidebar Hangar is your home
              fleet. View-only for members — ferry still works. Reserve a parked
              tail for your session (4h). Sell, lease, inspect, repair, and
              overhaul are owner-only (MX from the company wallet).
            </p>
          ) : (
            <p className="settings-help">
              Company hangar (shared airline fleet). Sidebar Hangar stays on your
              home company — chrome Wallet never switches here.
            </p>
          )}
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
          {tenantSwitching ? (
            <BusyStatus label="Opening company ledger…" />
          ) : (
            <>
          <div className="va-ledger-hero">
            <div className="va-ledger-wallet">
              <p className="aircraft-card-section-label" style={{ margin: 0 }}>
                Company wallet
              </p>
              <p className="va-ledger-wallet-value">
                {resolvedWalletUsd != null
                  ? formatBoardMoney(resolvedWalletUsd)
                  : ledgerBusy || tenantSwitching
                    ? '…'
                    : '—'}
              </p>
              <p className="va-ledger-wallet-hint">
                Shared company cash (owner wallet).
              </p>
            </div>
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
          <VaMoneyMap
            marketHireCutPct={memberRouteCutPct}
            airlineLaborCutPct={memberAirlineCutPct}
          />
          {ledgerError ? (
            <p className="error" role="alert">
              {ledgerError}
            </p>
          ) : null}
          {ledgerBusy && !cashflow ? (
            <BusyStatus label="Loading ledger…" />
          ) : (
            <HangarCashflowPanel
              cashflow={cashflow}
              companyCredit={companyCredit}
              walletUsd={resolvedWalletUsd ?? 0}
              busy={pageBusy || ledgerBusy}
              creditActionsLocked={!isOwner}
              hideCredit
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
          )}
            </>
          )}
        </div>
      ) : null}

      {pane === 'logbook' ? (
        <div className="settings-card va-pane-card">
          {tenantSwitching ? (
            <div className="va-pane-loading">
              <BusyBlock label="Opening company logbook…" />
            </div>
          ) : (
            <>
              <h3>Logbook</h3>
              <p className="settings-help">
                Flights flown on this airline — every member. Personal Logbook
                only shows your own legs.
              </p>
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
                <>
                  <p className="panel-stats">
                    {logbookRows.length} flights recorded · company history.
                  </p>
                  <ul className="mission-list logbook-list va-logbook-list">
                    {logbookRows.map((m) => {
                      const kind = logbookFlightKind(m);
                      const distanceNm = logbookDistanceNm(m);
                      const duration = logbookFlightDurationLabel(m);
                      const when = logbookFlightWhenLabel(m);
                      const payout = logbookCompanyPayoutUsd(m);
                      const pilot = vaLogbookPilotLabel(m, ledgerMemberNames);
                      const fleetLabel = m.aircraftId
                        ? hangarFleet.find((a) => a.id === m.aircraftId)?.label
                        : null;
                      return (
                        <li key={m.id} className="mission logbook-entry">
                          <div className="mission-main">
                            <div className="route">
                              <span>{m.originIcao}</span>
                              <span className="arrow">→</span>
                              <span>{m.destIcao}</span>
                              <span className={`status status-${m.status}`}>
                                {logbookStatusLabel(m.status)}
                              </span>
                              <span className="logbook-kind">{kind}</span>
                              <span
                                className="logbook-kind logbook-pilot"
                                title="Pilot who flew this leg"
                              >
                                {pilot}
                              </span>
                            </div>
                            <p className="logbook-summary">
                              {logbookAircraftLabel(m, { fleetLabel })}
                              {' · '}
                              {logbookCargoLabel(m, (kg) =>
                                `${Math.round(kg).toLocaleString('en-US')} kg`,
                              )}
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
                                ? formatBoardMoney(payout)
                                : '—'}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                    {logbookRows.length === 0 ? (
                      <li className="empty">
                        No airline flights yet — accept Freights, Charter, or Internal
                        Haul on a company aircraft.
                      </li>
                    ) : null}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      ) : null}

      {pane === 'config' ? (
        <div className="settings-card va-pane-card va-config-card">
          <header className="va-config-head">
            <h3>Config</h3>
            <p className="settings-help">
              {isOwner
                ? 'Hiring, ferry desk, invites, and listing. Name and hub live on Company.'
                : canManage
                  ? 'Invites. Recruiting, cut, and listing are owner-only.'
                  : 'Your seat on this airline. Most controls are owner-only.'}
            </p>
          </header>

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
              <p className="settings-sample va-config-readonly">
                Market hire <strong>{memberRouteCutPct}%</strong> · airline desk{' '}
                <strong>{memberAirlineCutPct}%</strong>
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
              {autoHaul?.maxHaulsPerDay ?? 2}/day). Needs ≥{autoHaulMinMembers}{' '}
              members + Port FBO stock. Manual Scout Confirm has no AI daily
              cap.
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
                <span className="settings-help">
                  Owner or dispatcher can mint invites.
                </span>
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
              <p className="settings-help">
                One invite code per airline. Stays valid until you renew or unlist.
              </p>
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
    </section>
  );
}
