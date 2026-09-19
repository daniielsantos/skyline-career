import { useCallback, useEffect, useState } from 'react';
import {
  fetchVaMembers,
  fetchVaDirectory,
  fetchVaJoinRequests,
  postVaInvite,
  postVaJoin,
  postVaJoinRequest,
  postVaAcceptJoinRequest,
  postVaRejectJoinRequest,
  postVaRecruiting,
  postVaLeave,
  postVaKick,
  postVaRole,
  postVaPublish,
  type VaMember,
  type VaDirectoryEntry,
  type VaJoinRequest,
} from './api';
import { getAuthToken } from './career-auth-client';
import { getStoredCompanyId } from './career-company-client';

type Props = {
  authRequired: boolean;
  activeCompanyId: string | null;
  defaultHomeHubIcao?: string | null;
  onCompaniesChanged?: (
    companies: Array<{ id: string; displayName: string }>,
  ) => void;
};

export function VaPage(props: Props) {
  const token = getAuthToken();
  const companyId = props.activeCompanyId || getStoredCompanyId();
  const [members, setMembers] = useState<VaMember[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [memberCap, setMemberCap] = useState(8);
  const [recruiting, setRecruiting] = useState(true);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [directory, setDirectory] = useState<VaDirectoryEntry[]>([]);
  const [pendingRequests, setPendingRequests] = useState<VaJoinRequest[]>([]);
  const [publishName, setPublishName] = useState('');
  const [publishHub, setPublishHub] = useState(
    props.defaultHomeHubIcao?.trim().toUpperCase() ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canShow = Boolean(token) || props.authRequired;
  const canManage = role === 'owner' || role === 'dispatcher';
  const isOwner = role === 'owner';
  const listedSelf = directory.find((row) => row.companyId === companyId);

  const refresh = useCallback(async () => {
    if (!canShow) return;
    setError(null);
    try {
      const dirP = fetchVaDirectory({ includeClosed: true });
      if (!companyId) {
        const d = await dirP;
        setDirectory(d.directory);
        setMembers([]);
        setRole(null);
        setPendingRequests([]);
        return;
      }
      const [m, d] = await Promise.all([fetchVaMembers(), dirP]);
      setMembers(m.members);
      setRole(m.role);
      setMemberCap(m.memberCap);
      setDirectory(d.directory);
      const self = d.directory.find((row) => row.companyId === companyId);
      if (self) {
        setRecruiting(self.recruiting);
        setPublishName((prev) => prev || self.displayName);
        setPublishHub((prev) => prev || self.homeHubIcao);
      }
      if (m.role === 'owner' || m.role === 'dispatcher') {
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
    }
  }, [canShow, companyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (props.defaultHomeHubIcao?.trim() && !publishHub) {
      setPublishHub(props.defaultHomeHubIcao.trim().toUpperCase());
    }
  }, [props.defaultHomeHubIcao, publishHub]);

  if (!canShow) {
    return (
      <section className="panel va-panel">
        <p className="settings-help">Sign in to browse and join VAs.</p>
      </section>
    );
  }

  return (
    <section className="panel va-panel">
      <div className="settings-grid">
        <div className="settings-card">
          <h3>VA directory</h3>
          <p className="settings-help">
            Companies open for pilots. Request to join, or use a private invite
            code. Your company wallet and fleet stay the same — VA is the roster
            on top.
          </p>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          {directory.length === 0 ? (
            <p className="settings-sample">No VAs listed yet.</p>
          ) : (
            <ul className="settings-sample" style={{ paddingLeft: '1.1rem' }}>
              {directory.map((row) => {
                const isMine = row.companyId === companyId;
                const canRequest =
                  !isMine &&
                  row.recruiting &&
                  row.seatsOpen > 0 &&
                  row.myRequestStatus !== 'pending' &&
                  row.myRequestStatus !== 'accepted';
                return (
                  <li key={row.companyId} style={{ marginBottom: '0.45rem' }}>
                    <strong>{row.displayName}</strong>{' '}
                    <span style={{ opacity: 0.7 }}>
                      {row.homeHubIcao || '—'} · {row.memberCount}/
                      {row.memberCap}
                      {row.recruiting ? '' : ' · closed'}
                      {row.myRequestStatus === 'pending'
                        ? ' · request pending'
                        : ''}
                      {isMine ? ' · yours' : ''}
                    </span>
                    {canRequest ? (
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
                              setError(null);
                              try {
                                await postVaJoinRequest(row.companyId);
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
                          Request join
                        </button>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          <h4 style={{ marginTop: '1rem', marginBottom: '0.35rem' }}>
            Private invite code
          </h4>
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <input
              type="text"
              value={joinCode}
              placeholder="VA-XXXXXXXX"
              onChange={(e) => setJoinCode(e.target.value)}
              style={{ flex: 1, minWidth: '10rem' }}
              aria-label="Join invite code"
            />
            <button
              type="button"
              className="action"
              disabled={busy || !joinCode.trim()}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    const result = await postVaJoin(joinCode);
                    setJoinCode('');
                    props.onCompaniesChanged?.(
                      result.companies.map((c) => ({
                        id: c.id,
                        displayName: c.displayName,
                      })),
                    );
                    await refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err));
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Join
            </button>
          </div>
        </div>

        <div className="settings-card">
          <h3>
            {listedSelf ? 'Update VA listing' : 'List my company as a VA'}
          </h3>
          <p className="settings-help">
            Reuses your active company — same wallet and fleet. Set a public
            name and home hub to appear in the directory.
          </p>
          {!companyId ? (
            <p className="settings-sample">Select a company first.</p>
          ) : !isOwner && role ? (
            <p className="settings-sample">
              Only the owner can publish or update this listing. Your role:{' '}
              <strong>{role}</strong>
            </p>
          ) : !role && companyId ? (
            <p className="settings-sample">
              Active company <strong>{companyId}</strong> — you need owner
              membership to list it.
            </p>
          ) : (
            <>
              <label className="simbrief-field">
                <span>VA name</span>
                <input
                  type="text"
                  value={publishName}
                  maxLength={64}
                  placeholder="e.g. Nothin Air Cargo"
                  onChange={(e) => setPublishName(e.target.value)}
                />
              </label>
              <label className="simbrief-field" style={{ marginTop: '0.5rem' }}>
                <span>Home hub ICAO</span>
                <input
                  type="text"
                  value={publishHub}
                  maxLength={4}
                  placeholder="SBGR"
                  onChange={(e) =>
                    setPublishHub(e.target.value.toUpperCase())
                  }
                />
              </label>
              <button
                type="button"
                className="action"
                disabled={
                  busy || !publishName.trim() || !publishHub.trim()
                }
                style={{ marginTop: '0.75rem' }}
                onClick={() => {
                  void (async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      await postVaPublish({
                        displayName: publishName,
                        homeHubIcao: publishHub,
                        recruiting: true,
                      });
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
                {listedSelf ? 'Save listing' : 'Publish VA'}
              </button>
            </>
          )}
        </div>

        {role && companyId ? (
          <div className="settings-card">
            <h3>My VA</h3>
            <p className="settings-sample">
              <strong>{listedSelf?.displayName || companyId}</strong>
              {' · '}
              {members.length}/{memberCap} seats · recruiting{' '}
              <strong>{recruiting ? 'on' : 'off'}</strong>
              {' · '}
              role <strong>{role}</strong>
            </p>
            <p className="settings-help">
              Internal Hauls are dispatched from Ports with a company aircraft
              at origin.
            </p>

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
                      ? 'Hide from open list · invite code still works'
                      : 'Show in VA directory'}
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
                      setError(
                        err instanceof Error ? err.message : String(err),
                      );
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
                <ul
                  className="settings-sample"
                  style={{ paddingLeft: '1.1rem' }}
                >
                  {pendingRequests.map((req) => (
                    <li key={req.id} style={{ marginBottom: '0.35rem' }}>
                      {req.displayName}{' '}
                      <span style={{ opacity: 0.7 }}>@{req.loginName}</span>{' '}
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
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.1rem 0.4rem',
                        }}
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

            {members.length > 0 ? (
              <>
                <h4 style={{ marginTop: '1rem', marginBottom: '0.35rem' }}>
                  Roster
                </h4>
                <ul
                  className="settings-sample"
                  style={{ paddingLeft: '1.1rem' }}
                >
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
              </>
            ) : null}

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
                      setError(
                        err instanceof Error ? err.message : String(err),
                      );
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
      </div>
    </section>
  );
}
