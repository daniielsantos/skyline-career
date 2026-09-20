import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  fetchVaMembers,
  fetchVaJoinRequests,
  postVaInvite,
  postVaAcceptJoinRequest,
  postVaRejectJoinRequest,
  postVaRecruiting,
  postVaLeave,
  postVaKick,
  postVaRole,
  type VaMember,
  type VaJoinRequest,
  type PlayerAircraft,
} from './api';
import { getAuthToken } from './career-auth-client';
import { getStoredCompanyId } from './career-company-client';

type VaPane = 'roster' | 'hangar' | 'config';

type Props = {
  authRequired: boolean;
  activeCompanyId: string | null;
  fleet: PlayerAircraft[];
  busy?: boolean;
  renderHangarCard: (aircraft: PlayerAircraft) => ReactNode;
  onGoCompany?: () => void;
  onGoDirectory?: () => void;
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
  const [displayName, setDisplayName] = useState('');
  const [homeHubIcao, setHomeHubIcao] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<VaJoinRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const canShow = Boolean(token) || props.authRequired;
  const canManage = role === 'owner' || role === 'dispatcher';
  const isOwner = role === 'owner';
  const pageBusy = busy || Boolean(props.busy);

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
      setMemberCap(m.memberCap);
      setListed(m.listed);
      setRecruiting(m.recruiting);
      setDisplayName(m.displayName);
      setHomeHubIcao(m.homeHubIcao);
      if (m.listed && (m.role === 'owner' || m.role === 'dispatcher')) {
        try {
          const reqs = await fetchVaJoinRequests();
          setPendingRequests(reqs.requests);
        } catch {
          setPendingRequests([]);
        }
      } else {
        setPendingRequests([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRole(null);
      setListed(false);
    } finally {
      setLoaded(true);
    }
  }, [canShow, companyId]);

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
        <p className="settings-help">Loading…</p>
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
            <>
              <h4 style={{ marginTop: 0, marginBottom: '0.35rem' }}>
                Join requests
              </h4>
              <ul className="settings-sample" style={{ paddingLeft: '1.1rem' }}>
                {pendingRequests.map((req) => (
                  <li key={req.id} style={{ marginBottom: '0.35rem' }}>
                    {req.displayName}{' '}
                    <span style={{ opacity: 0.7 }}>@{req.loginName}</span>{' '}
                    <button
                      type="button"
                      className="action ghost"
                      disabled={pageBusy}
                      style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem' }}
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
                    </button>{' '}
                    <button
                      type="button"
                      className="action ghost"
                      disabled={pageBusy}
                      style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem' }}
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
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {members.length === 0 ? (
            <p className="settings-sample">No members.</p>
          ) : (
            <ul className="settings-sample" style={{ paddingLeft: '1.1rem' }}>
              {members.map((m) => (
                <li key={m.accountId} style={{ marginBottom: '0.35rem' }}>
                  {m.displayName}{' '}
                  <span style={{ opacity: 0.7 }}>
                    @{m.loginName} · {m.role}
                  </span>
                  {isOwner && m.role !== 'owner' ? (
                    <>
                      {' '}
                      <button
                        type="button"
                        className="action ghost"
                        disabled={pageBusy}
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.1rem 0.4rem',
                        }}
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
                      </button>{' '}
                      <button
                        type="button"
                        className="action ghost"
                        disabled={pageBusy}
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.1rem 0.4rem',
                        }}
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
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {role !== 'owner' ? (
            <button
              type="button"
              className="action ghost"
              disabled={pageBusy}
              style={{ marginTop: '0.5rem' }}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  try {
                    await postVaLeave();
                    await refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err));
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Leave this VA
            </button>
          ) : null}
        </div>
      ) : null}

      {pane === 'hangar' ? (
        <div className="va-pane-card">
          {props.fleet.length === 0 ? (
            <p className="empty">
              No aircraft yet — buy or lease on Airframes for this company.
            </p>
          ) : (
            <ul className="hangar-list">
              {props.fleet.map((acf) => props.renderHangarCard(acf))}
            </ul>
          )}
        </div>
      ) : null}

      {pane === 'config' ? (
        <div className="settings-card va-pane-card">
          <h3>Config</h3>
          <p className="settings-help">
            Hiring visibility and private invites. Update the public name/hub
            from Company.
          </p>
          {isOwner ? (
            <div className="settings-choice">
              <button
                type="button"
                className={`settings-choice-btn${recruiting ? ' active' : ''}`}
                disabled={pageBusy}
                onClick={() => {
                  void (async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      const res = await postVaRecruiting(!recruiting);
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
              >
                {recruiting ? 'Stop recruiting' : 'Open recruiting'}
                <small>
                  {recruiting
                    ? 'Hide from open hiring · invite code still works'
                    : 'Show as hiring in the VAs directory'}
                </small>
              </button>
            </div>
          ) : (
            <p className="settings-sample">
              Only the owner can change recruiting. Hiring is{' '}
              <strong>{recruiting ? 'on' : 'off'}</strong>.
            </p>
          )}

          {canManage ? (
            <button
              type="button"
              className="action ghost"
              disabled={pageBusy}
              style={{ marginTop: '0.75rem' }}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    const { invite } = await postVaInvite({});
                    setInviteCode(invite.code);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err));
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Create invite code
            </button>
          ) : (
            <p className="settings-help" style={{ marginTop: '0.75rem' }}>
              Owner or dispatcher can mint invite codes.
            </p>
          )}
          {inviteCode ? (
            <p className="settings-sample">
              Invite: <strong>{inviteCode}</strong>
            </p>
          ) : null}

          {props.onGoCompany ? (
            <button
              type="button"
              className="action ghost"
              style={{ marginTop: '0.75rem' }}
              onClick={props.onGoCompany}
            >
              Edit VA listing on Company
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
