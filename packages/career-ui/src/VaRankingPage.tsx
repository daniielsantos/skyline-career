import { useCallback, useEffect, useState } from 'react';
import {
  fetchVaRanking,
  type VaCompanyRank,
  type VaPilotRank,
} from './api';
import { getAuthToken } from './career-auth-client';

type Props = {
  authRequired: boolean;
};

export function VaRankingPage(props: Props) {
  const token = getAuthToken();
  const canShow = Boolean(token) || props.authRequired;
  const [windowDays, setWindowDays] = useState(7);
  const [companies, setCompanies] = useState<VaCompanyRank[]>([]);
  const [pilots, setPilots] = useState<VaPilotRank[]>([]);
  const [pilotsCompanyId, setPilotsCompanyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!canShow) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetchVaRanking();
      setWindowDays(r.windowDays);
      setCompanies(r.companies);
      setPilots(r.pilots);
      setPilotsCompanyId(r.pilotsCompanyId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [canShow]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!canShow) {
    return (
      <section className="panel va-panel">
        <p className="settings-help">Sign in to see rankings.</p>
      </section>
    );
  }

  return (
    <section className="panel va-panel va-ranking">
      <div className="settings-grid">
        <div className="settings-card">
          <div className="va-ranking-head">
            <h3>Airlines · {windowDays}d</h3>
            {busy ? <span className="muted va-ranking-busy">Updating…</span> : null}
          </div>
          {error ? (
            <p className="error" role="alert">
              {error}{' '}
              <button
                type="button"
                className="linkish"
                disabled={busy}
                onClick={() => void refresh()}
              >
                Retry
              </button>
            </p>
          ) : null}
          {companies.length === 0 && !error ? (
            <p className="muted va-ranking-empty">No desk flights in this window.</p>
          ) : companies.length > 0 ? (
            <ol className="va-ranking-list">
              {companies.map((row, i) => (
                <li key={row.companyId}>
                  <span className="va-ranking-place">{i + 1}</span>
                  <span className="va-ranking-name">{row.displayName}</span>
                  <span className="va-ranking-meta">
                    {row.nm.toLocaleString()} nm · {row.hauls}{' '}
                    {row.hauls === 1 ? 'haul' : 'hauls'}
                    {row.flightQuality?.qualityScore != null
                      ? ` · Q${Math.round(row.flightQuality.qualityScore)}`
                      : ''}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>

        <div className="settings-card">
          <div className="va-ranking-head">
            <h3>Pilots · this airline</h3>
          </div>
          {!pilotsCompanyId ? (
            <p className="muted va-ranking-empty">Join a listed airline first.</p>
          ) : pilots.length === 0 ? (
            <p className="muted va-ranking-empty">No crew desk flights yet.</p>
          ) : (
            <ol className="va-ranking-list">
              {pilots.map((p, i) => (
                <li key={p.accountId}>
                  <span className="va-ranking-place">{i + 1}</span>
                  <span className="va-ranking-name">{p.displayName}</span>
                  <span className="va-ranking-meta">
                    {p.nm.toLocaleString()} nm · {p.hauls}{' '}
                    {p.hauls === 1 ? 'haul' : 'hauls'}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
