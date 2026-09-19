import { useCallback, useEffect, useState } from 'react';
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
} from './api';
import { getAuthToken } from './career-auth-client';
import { getStoredCompanyId } from './career-company-client';

type Props = {
  authRequired: boolean;
  activeCompanyId: string | null;
  onGoCompany?: () => void;
  onGoDirectory?: () => void;
};

export function VaPage(props: Props) {
  const token = getAuthToken();
  const companyId = props.activeCompanyId || getStoredCompanyId();
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
      <div className="settings-grid">
        <div className="settings-card">
          <h3>{displayName || 'My VA'}</h3>
          <p className="settings-sample">
            {homeHubIcao || '—'} · {members.length}/{memberCap} seats · recruiting{' '}
            <strong>{recruiting ? 'on' : 'off'}</strong> · role{' '}
            <strong>{role}</strong>
          </p>
          <p className="settings-help">
            Internal Hauls dispatch from Ports. Browse other airlines under VAs.
          </p>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}

          {isOwner ? (
            <div className="settings-choice" style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                className={`settings-choice-btn${recruiting ? ' active' : ''}`}
                disabled={busy}
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
                    : 'Show as hiring in the VA directory'}
                </small>
              </button>
            </div>
          ) : null}

          {canManage ? (
            <button
              type="button"
              className="action ghost"
              disabled={busy}
              style={{ marginTop: '0.5rem' }}
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
          ) : null}
          {inviteCode ? (
            <p className="settings-sample">
              Invite: <strong>{inviteCode}</strong>
            </p>
          ) : null}

          {canManage && pendingRequests.length > 0 ? (
            <>
              <h4 style={{ marginTop: '1rem', marginBottom: '0.35rem' }}>
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
                      disabled={busy}
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
                      disabled={busy}
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
        </div>

        <div className="settings-card">
          <h3>Roster</h3>
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
                        disabled={busy}
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
                        disabled={busy}
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
              disabled={busy}
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
      </div>
    </section>
  );
}
