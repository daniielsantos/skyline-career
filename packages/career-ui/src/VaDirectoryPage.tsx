import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchVaAirlineProfile,
  fetchVaDirectory,
  postVaJoin,
  postVaJoinRequest,
  type VaCompanyNetworkNode,
  type VaDirectoryEntry,
} from './api';
import { BusyBlock } from './Busy';
import { getAuthToken } from './career-auth-client';
import { formatVaCutsPair, VA_CUTS_TOOLTIP } from './va-cuts-copy';
import { VaAirlineProfilePanel } from './VaAirlineProfilePanel';

type Props = {
  authRequired: boolean;
  activeCompanyId: string | null;
  onCompaniesChanged?: (
    companies: Array<{ id: string; displayName: string }>,
    opts?: { switchToCompanyId?: string },
  ) => void;
};

export function VaDirectoryPage(props: Props) {
  const token = getAuthToken();
  const canShow = Boolean(token) || props.authRequired;
  const [directory, setDirectory] = useState<VaDirectoryEntry[]>([]);
  const [memberOfVaCompanyId, setMemberOfVaCompanyId] = useState<string | null>(
    null,
  );
  const [query, setQuery] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileAirline, setProfileAirline] = useState<VaDirectoryEntry | null>(
    null,
  );
  const [profileNetwork, setProfileNetwork] = useState<VaCompanyNetworkNode[]>(
    [],
  );
  const [profileBusy, setProfileBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!canShow) {
      setLoaded(true);
      return;
    }
    setError(null);
    try {
      const d = await fetchVaDirectory({ includeClosed: true });
      setDirectory(d.directory);
      setMemberOfVaCompanyId(d.memberOfVaCompanyId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoaded(true);
    }
  }, [canShow]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openProfile = useCallback(async (companyIdToOpen: string) => {
    setProfileBusy(true);
    setError(null);
    setProfileId(companyIdToOpen);
    try {
      const r = await fetchVaAirlineProfile(companyIdToOpen);
      setProfileAirline(r.airline);
      setProfileNetwork(r.network);
      setMemberOfVaCompanyId(r.memberOfVaCompanyId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProfileId(null);
      setProfileAirline(null);
      setProfileNetwork([]);
    } finally {
      setProfileBusy(false);
    }
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return directory;
    return directory.filter((row) => {
      const hay = `${row.displayName} ${row.homeHubIcao} ${row.companyId}`.toLowerCase();
      return hay.includes(q);
    });
  }, [directory, query]);

  const alreadyInVa = Boolean(memberOfVaCompanyId);

  if (!canShow) {
    return (
      <section className="panel va-panel">
        <p className="settings-help">Sign in to browse airlines.</p>
      </section>
    );
  }

  if (!loaded) {
    return (
      <section className="panel va-panel va-panel-loading">
        <BusyBlock label="Loading airlines…" />
      </section>
    );
  }

  if (profileId && profileBusy && !profileAirline) {
    return (
      <section className="panel va-panel va-panel-loading">
        <BusyBlock label="Loading airline…" />
      </section>
    );
  }

  if (profileId && profileAirline) {
    return (
      <section className="panel va-panel va-directory-panel">
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <VaAirlineProfilePanel
          airline={profileAirline}
          network={profileNetwork}
          alreadyInVa={alreadyInVa}
          busy={busy || profileBusy}
          onBack={() => {
            setProfileId(null);
            setProfileAirline(null);
            setProfileNetwork([]);
            setError(null);
          }}
          onRequestJoin={() => {
            void (async () => {
              setBusy(true);
              setError(null);
              try {
                await postVaJoinRequest(profileAirline.companyId);
                await openProfile(profileAirline.companyId);
                await refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            })();
          }}
        />
      </section>
    );
  }

  return (
    <section className="panel va-panel va-directory-panel">
      <div className="va-directory-toolbar">
        <input
          type="search"
          className="va-directory-search"
          value={query}
          placeholder="Search name or home ICAO…"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search airlines"
        />
        <div className="va-directory-invite">
          <input
            type="text"
            value={joinCode}
            placeholder="VA-XXXXXXXX"
            onChange={(e) => setJoinCode(e.target.value)}
            aria-label="Private invite code"
            disabled={alreadyInVa}
          />
          <button
            type="button"
            className="action"
            disabled={busy || alreadyInVa || !joinCode.trim()}
            title={
              alreadyInVa
                ? 'Leave your current airline before joining another'
                : undefined
            }
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
                    { switchToCompanyId: result.companyId },
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
            Join code
          </button>
        </div>
      </div>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="settings-help" style={{ marginTop: '1rem' }}>
          {directory.length === 0
            ? 'No airlines published yet. Owners list theirs from Company → Open for pilots.'
            : 'No matches.'}
        </p>
      ) : (
        <ul className="va-directory-list">
          {filtered.map((row) => {
            const isOwnerHere = row.myRole === 'owner';
            const isMemberHere =
              row.myRole === 'pilot' || row.myRole === 'dispatcher';
            const canRequest =
              !alreadyInVa &&
              !isOwnerHere &&
              !isMemberHere &&
              row.recruiting &&
              row.seatsOpen > 0 &&
              row.myRequestStatus !== 'pending' &&
              row.myRequestStatus !== 'accepted';
            return (
              <li key={row.companyId} className="va-directory-card">
                <button
                  type="button"
                  className="va-directory-card-main va-directory-card-open"
                  onClick={() => void openProfile(row.companyId)}
                >
                  <div className="va-directory-card-id">
                    <div className="va-directory-card-title-row">
                      <strong className="va-directory-card-name">
                        {row.displayName}
                      </strong>
                      {isOwnerHere ? (
                        <span className="badge va-directory-yours">Yours</span>
                      ) : isMemberHere ? (
                        <span className="badge va-directory-yours">Joined</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="va-directory-card-stats">
                    <div>
                      <span className="va-stat-label">HQ</span>
                      <span className="va-stat-value">
                        {row.homeHubIcao || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="va-stat-label">Pilots</span>
                      <span className="va-stat-value">
                        {row.memberCount}/{row.memberCap}
                      </span>
                    </div>
                    <div>
                      <span className="va-stat-label">Fleet</span>
                      <span className="va-stat-value">
                        {row.aircraftCount ?? 0}
                      </span>
                    </div>
                    <div>
                      <span className="va-stat-label">Quality</span>
                      <span className="va-stat-value">
                        {row.flightQuality?.qualityScore != null
                          ? Math.round(row.flightQuality.qualityScore)
                          : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="va-stat-label">Perks</span>
                      <span className="va-stat-value">
                        {row.orgPerks && row.orgPerks.tier > 0
                          ? row.orgPerks.tierName
                          : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="va-stat-label">Seats</span>
                      <span className="va-stat-value">{row.seatsOpen}</span>
                    </div>
                    <div>
                      <span className="va-stat-label">Hiring</span>
                      <span
                        className={`va-stat-value${row.recruiting ? ' is-open' : ' is-closed'}`}
                      >
                        {row.recruiting ? 'Open' : 'Closed'}
                      </span>
                    </div>
                    <div className="va-stat-cuts" title={VA_CUTS_TOOLTIP}>
                      <span className="va-stat-label">Cuts</span>
                      <span className="va-stat-value">
                        {formatVaCutsPair(
                          row.memberRouteCutPct,
                          row.memberAirlineCutPct,
                        )}
                      </span>
                    </div>
                  </div>
                </button>
                <div className="va-directory-card-actions">
                  {row.myRequestStatus === 'pending' ? (
                    <span className="va-directory-pending">Request pending</span>
                  ) : null}
                  {canRequest ? (
                    <button
                      type="button"
                      className="action"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
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
                  ) : (
                    <button
                      type="button"
                      className="action ghost"
                      onClick={() => void openProfile(row.companyId)}
                    >
                      View
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
