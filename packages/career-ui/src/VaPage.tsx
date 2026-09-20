import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  fetchVaMembers,
  fetchVaJoinRequests,
  fetchVaInvites,
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
  type VaMember,
  type VaJoinRequest,
  type PlayerAircraft,
} from './api';
import { BusyStatus } from './Busy';
import { getAuthToken } from './career-auth-client';
import { getStoredCompanyId } from './career-company-client';
import { useConfirm } from './ConfirmDialog';

type VaPane = 'roster' | 'hangar' | 'config';

type Props = {
  authRequired: boolean;
  activeCompanyId: string | null;
  fleet: PlayerAircraft[];
  busy?: boolean;
  renderHangarCard: (
    aircraft: PlayerAircraft,
    opts: { mutationsLocked: boolean },
  ) => ReactNode;
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const canShow = Boolean(token) || props.authRequired;
  const canManage = role === 'owner' || role === 'dispatcher';
  const isOwner = role === 'owner';
  const hangarReadOnly = !isOwner;
  const pageBusy = busy || Boolean(props.busy);

  const refresh = useCallback(async () => {
    if (!canShow || !companyId) {
      setLoaded(true);
      return;
    }
    setError(null);
    try {
      const m = await fetchVaMembers();
      if (
        m.switchToCompanyId &&
        m.switchToCompanyId !== companyId &&
        props.onSwitchCompany
      ) {
        await props.onSwitchCompany(m.switchToCompanyId);
        return;
      }
      setMembers(m.members);
      setRole(m.role);
      setMemberCap(m.memberCap);
      setListed(m.listed);
      setRecruiting(m.recruiting);
      setMemberRouteCutPct(m.memberRouteCutPct ?? 30);
      setCutDraft(String(m.memberRouteCutPct ?? 30));
      setLineCrew(m.lineCrew ?? null);
      setDisplayName(m.displayName);
      setHomeHubIcao(m.homeHubIcao);
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
      setRole(null);
      setListed(false);
    } finally {
      setLoaded(true);
    }
  }, [canShow, companyId, props.onSwitchCompany]);

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

  if (!canShow) {
    return (
      <section className="panel va-panel">
        <p className="settings-help">Sign in to manage your VA.</p>
      </section>
    );
  }

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
            <ul className="va-roster-list">
              {members.map((m) => (
                <li key={m.accountId} className="va-roster-row">
                  <div className="va-roster-id">
                    <span className="va-roster-name">{m.displayName}</span>
                    <span className="va-roster-login">@{m.loginName}</span>
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
                  ) : (
                    <div className="va-roster-actions va-roster-actions-spacer" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {pane === 'hangar' ? (
        <div className="va-pane-card">
          {hangarReadOnly ? (
            <p className="settings-help">
              Hangar is view-only for members — ferry for flights is still
              available. Sell, lease, inspection, and repair are owner-only
              (MX comes from the VA wallet).
            </p>
          ) : null}
          {props.fleet.length === 0 ? (
            <p className="empty">
              No aircraft yet — buy or lease on Airframes for this company.
            </p>
          ) : (
            <ul className="hangar-list">
              {props.fleet.map((acf) =>
                props.renderHangarCard(acf, {
                  mutationsLocked: hangarReadOnly,
                }),
              )}
            </ul>
          )}
        </div>
      ) : null}

      {pane === 'config' ? (
        <div className="settings-card va-pane-card va-config-card">
          <h3>Config</h3>
          <p className="settings-help">
            {isOwner
              ? 'Hiring, invites, and listing. Name and hub live on Company.'
              : canManage
                ? 'Invites and join requests. Listing and recruiting are owner-only.'
                : 'Your seat on this VA. Recruiting and listing are owner-only.'}
          </p>

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
            <p className="settings-sample">
              Recruiting is <strong>{recruiting ? 'on' : 'off'}</strong> (owner
              only).
            </p>
          )}

          {isOwner ? (
            <div className="va-config-row" style={{ alignItems: 'center' }}>
              <label className="settings-help" htmlFor="va-route-cut">
                Pilot cut on Freights / Demand / Charter
              </label>
              <input
                id="va-route-cut"
                type="number"
                min={10}
                max={50}
                step={1}
                value={cutDraft}
                disabled={pageBusy}
                style={{ width: '4.5rem' }}
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
                        err instanceof Error ? err.message : String(err),
                      );
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              />
              <span className="muted">% of route net → pilot home (10–50)</span>
            </div>
          ) : (
            <p className="settings-sample">
              Pilot cut <strong>{memberRouteCutPct}%</strong> of Freights /
              Demand / Charter route net (owner sets this).
            </p>
          )}

          <div className="va-config-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.35rem' }}>
            <p className="settings-help" style={{ margin: 0 }}>
              Line crew (empty ferry desk)
            </p>
            {lineCrew?.hired ? (
              <>
                <p className="settings-sample" style={{ margin: 0 }}>
                  Hired · allowance{' '}
                  <strong>
                    {lineCrew.remaining}/{lineCrew.allowance}
                  </strong>{' '}
                  NPC ferries left this week · ${lineCrew.salaryUsdPerWeek.toLocaleString()}/wk
                </p>
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
                            err instanceof Error ? err.message : String(err),
                          );
                        } finally {
                          setBusy(false);
                        }
                      })();
                    }}
                  >
                    Fire Line crew
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <p className="settings-sample" style={{ margin: 0 }}>
                  Not hired — empty ferries debit the flying member&apos;s home
                  wallet (VA does not pay).
                </p>
                {isOwner ? (
                  <button
                    type="button"
                    className="action ghost"
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
                            err instanceof Error ? err.message : String(err),
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
              </>
            )}
          </div>

          <div className="va-config-row">
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
            <p className="settings-sample va-config-invite">
              Invite <strong>{inviteCode}</strong>
              <span className="settings-help">
                {' '}
                · does not expire · renew replaces it
              </span>
            </p>
          ) : (
            <p className="settings-help">
              One invite code per VA. It stays valid until you renew or unlist.
            </p>
          )}

          <div className="va-config-danger">
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
