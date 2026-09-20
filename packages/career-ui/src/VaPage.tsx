import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  fetchVaMembers,
  fetchVaJoinRequests,
  fetchVaInvites,
  fetchCashflow,
  postVaInvite,
  postVaAcceptJoinRequest,
  postVaRejectJoinRequest,
  postVaRecruiting,
  postVaRouteCut,
  postVaLineCrew,
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
} from './api';
import { BusyStatus } from './Busy';
import { HangarCashflowPanel } from './CashflowPanel';
import { formatBoardMoney } from './board-money';
import { getAuthToken } from './career-auth-client';
import { getStoredCompanyId } from './career-company-client';
import { useConfirm } from './ConfirmDialog';

type VaPane = 'roster' | 'hangar' | 'ledger' | 'config';

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

type Props = {
  authRequired: boolean;
  activeCompanyId: string | null;
  fleet: PlayerAircraft[];
  walletUsd: number;
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
  onGoCompany?: () => void;
  onGoDirectory?: () => void;
  /** Switch active tenant to the listed VA (member dual-tenant). */
  onSwitchCompany?: (companyId: string) => void | Promise<void>;
  onLeftVa?: (opts: {
    homeCompanyId: string | null;
    companies: Array<{ id: string; displayName: string }>;
  }) => void | Promise<void>;
  onUnpublished?: () => void | Promise<void>;
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
  const [lineCrew, setLineCrew] = useState<{
    hired: boolean;
    allowance: number;
    used: number;
    remaining: number;
    hireUsd: number;
    salaryUsdPerWeek: number;
    fireSeveranceUsd: number;
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
  const hasVaShellRef = useRef(false);
  const ledgerFetchGenRef = useRef(0);
  const hangarFleetGenRef = useRef(0);

  useEffect(() => {
    // Sync from parent unless a newer local reserve/release already painted.
    setHangarFleet(props.fleet);
  }, [props.fleet]);

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
      setLineCrew(m.lineCrew ?? null);
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
      // Paint roster first — tenant switch used to block behind a full refresh (~20s).
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

  const leaveVa = useCallback(async () => {
    const ok = await confirm({
      title: 'Leave this VA?',
      body: 'You leave the roster and switch back to your own company. Your personal wallet and fleet stay with you — VA money and hangar stay with the VA.',
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
      title: 'Unlist this VA?',
      body:
        others > 0
          ? `Removes the listing from the VAs directory and drops ${others} other pilot${others === 1 ? '' : 's'} from the roster. Your company, wallet, and fleet stay.`
          : 'Removes the listing from the VAs directory. Your company, wallet, and fleet stay — you can publish again later.',
      confirmLabel: 'Unlist VA',
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
  }, [pane, listed, role, tenantSwitching, loadLedger]);

  if (!canShow) {
    return (
      <section className="panel va-panel">
        <p className="settings-help">Sign in to manage your VA.</p>
      </section>
    );
  }

  // Roster/config paint as soon as members load. Hangar/ledger wait on the
  // VA tenant pin (fetchState) — do not block the whole My VA shell on that.
  if (!loaded) {
    return (
      <section className="panel va-panel">
        <BusyStatus label="Loading VA…" />
      </section>
    );
  }

  if (!companyId || !role) {
    return (
      <section className="panel va-panel">
        <p className="settings-help">
          Select a company first, then publish it as a VA from Company.
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
        <h3>Not a VA yet</h3>
        <p className="settings-help">
          Your company exists, but it is not listed as a virtual airline.
          Publish it from Company (name + home hub) — same wallet and fleet.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {props.onGoCompany ? (
            <button type="button" className="action" onClick={props.onGoCompany}>
              Become a VA
            </button>
          ) : null}
          {props.onGoDirectory ? (
            <button
              type="button"
              className="action ghost"
              onClick={props.onGoDirectory}
            >
              Browse VAs
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="panel va-panel">
      <div className="panel-head va-my-head">
        <div>
          <h3 className="va-my-title">{displayName || 'My VA'}</h3>
          <p className="settings-sample">
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
                {orgPerks.labels.length > 0
                  ? ` (${orgPerks.labels.join(', ')})`
                  : ''}
              </>
            ) : null}
          </p>
        </div>
        <div className="hangar-pane-toggle" role="tablist" aria-label="My VA views">
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
            aria-selected={pane === 'ledger'}
            className={pane === 'ledger' ? 'tab active' : 'tab'}
            onClick={() => setPane('ledger')}
          >
            Ledger
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
                  <div className="va-roster-status">
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
            <BusyStatus label="Opening VA hangar…" />
          ) : (
            <>
          {hangarReadOnly ? (
            <p className="settings-help">
              Hangar is view-only for members — ferry for flights is still
              available. Reserve a parked tail for your session (4h). Sell,
              lease, inspection, and repair are owner-only (MX comes from the
              VA wallet).
            </p>
          ) : null}
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

      {pane === 'ledger' ? (
        <div className="va-pane-card">
          {tenantSwitching ? (
            <BusyStatus label="Opening VA ledger…" />
          ) : (
            <>
          <div className="va-ledger-hero">
            <div className="va-ledger-wallet">
              <p className="aircraft-card-section-label" style={{ margin: 0 }}>
                VA wallet
              </p>
              <p className="va-ledger-wallet-value">
                {formatBoardMoney(cashflow?.walletUsd ?? props.walletUsd)}
              </p>
              <p className="va-ledger-wallet-hint">
                Shared company cash (owner wallet).
              </p>
            </div>
            <div className="va-ledger-quality">
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
                    Org perks · <strong>{orgPerks.tierName}</strong>
                    {orgPerks.tier > 0 ? ` (T${orgPerks.tier})` : ''}
                  </p>
                  {orgPerks.labels.length > 0 ? (
                    <p className="va-org-perks-labels muted">
                      {orgPerks.labels.join(' · ')}
                    </p>
                  ) : orgPerks.nextTierHint ? (
                    <p className="va-org-perks-labels muted">
                      {orgPerks.nextTierHint}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
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
              walletUsd={props.walletUsd}
              busy={pageBusy || ledgerBusy}
              creditActionsLocked={!isOwner}
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

      {pane === 'config' ? (
        <div className="settings-card va-pane-card va-config-card">
          <header className="va-config-head">
            <h3>Config</h3>
            <p className="settings-help">
              {isOwner
                ? 'Hiring, ferry desk, invites, and listing. Name and hub live on Company.'
                : canManage
                  ? 'Invites. Recruiting, cut, and listing are owner-only.'
                  : 'Your seat on this VA. Most controls are owner-only.'}
            </p>
          </header>

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
                    · listed in VAs when on; invite still works when off
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
                  Pilot cut
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
                    of Freights / Demand / Charter route net → pilot home
                    (10–50)
                  </span>
                </div>
              </div>
            ) : (
              <p className="settings-sample va-config-readonly">
                Pilot cut <strong>{memberRouteCutPct}%</strong> of route net
              </p>
            )}
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
                    <span className="va-config-stat-label">Status</span>
                    <span className="va-config-stat-value">Hired</span>
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
                  <button
                    type="button"
                    className="action ghost"
                    disabled={pageBusy}
                    onClick={() => {
                      void (async () => {
                        const ok = await confirm({
                          title: 'Fire Line crew?',
                          body: `Severance $${lineCrew.fireSeveranceUsd.toLocaleString()}. Empty ferries then debit member home wallets.`,
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
                ) : (
                  <p className="muted va-config-readonly">
                    Owner manages hire / fire. Empty ferries under allowance do
                    not debit your home wallet.
                  </p>
                )}
              </div>
            ) : (
              <div className="va-config-line-crew">
                <p className="settings-sample va-config-readonly">
                  Not hired — empty ferries debit the flying member&apos;s home
                  wallet.
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
                    Hire Line crew ($
                    {(lineCrew?.hireUsd ?? 2500).toLocaleString()})
                  </button>
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
                One invite code per VA. Stays valid until you renew or unlist.
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
                Unlist VA
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
                Leave VA
              </button>
            )}
          </div>
        </div>
      ) : null}
      {confirmDialog}
    </section>
  );
}
