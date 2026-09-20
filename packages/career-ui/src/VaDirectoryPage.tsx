import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchVaDirectory,
  postVaJoin,
  postVaJoinRequest,
  type VaDirectoryEntry,
} from './api';
import { getAuthToken } from './career-auth-client';
import { getStoredCompanyId } from './career-company-client';

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
  const companyId = props.activeCompanyId || getStoredCompanyId();
  const canShow = Boolean(token) || props.authRequired;
  const [directory, setDirectory] = useState<VaDirectoryEntry[]>([]);
  const [memberOfVaCompanyId, setMemberOfVaCompanyId] = useState<string | null>(
    null,
  );
  const [query, setQuery] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!canShow) return;
    setError(null);
    try {
      const d = await fetchVaDirectory({ includeClosed: true });
      setDirectory(d.directory);
      setMemberOfVaCompanyId(d.memberOfVaCompanyId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [canShow]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return directory;
    return directory.filter((row) => {
      const hay = `${row.displayName} ${row.homeHubIcao} ${row.companyId}`.toLowerCase();
      return hay.includes(q);
    });
  }, [directory, query]);

  const hiringCount = directory.filter((r) => r.recruiting).length;
  const alreadyInVa = Boolean(memberOfVaCompanyId);

  if (!canShow) {
    return (
      <section className="panel va-panel">
        <p className="settings-help">Sign in to browse virtual airlines.</p>
      </section>
    );
  }

  return (
    <section className="panel va-panel va-directory-panel">
      <div className="va-directory-toolbar">
        <p className="va-directory-meta">
          {directory.length} airline{directory.length === 1 ? '' : 's'}
          {hiringCount > 0 ? ` · ${hiringCount} hiring` : ''}
          {' · '}
          joining keeps your personal company, wallet, and fleet
        </p>
        <input
          type="search"
          className="va-directory-search"
          value={query}
          placeholder="Search name or home ICAO…"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search VAs"
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
                ? 'Leave your current VA before joining another'
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
            ? 'No VAs published yet. Owners list theirs from Company → Become a VA.'
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
                <div className="va-directory-card-main">
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
                    <div>
                      <span className="va-stat-label">Pilot cut</span>
                      <span className="va-stat-value">
                        {row.memberRouteCutPct != null
                          ? `${row.memberRouteCutPct}%`
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="va-directory-card-actions">
                  {row.myRequestStatus === 'pending' ? (
                    <span className="va-directory-pending">Request pending</span>
                  ) : null}
                  {canRequest ? (
                    <button
                      type="button"
                      className="action"
                      disabled={busy}
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
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
