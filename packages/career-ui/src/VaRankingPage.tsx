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
        <p className="settings-help">
          Sign in to see airline desk rankings.
        </p>
      </section>
    );
  }

  return (
    <section className="panel va-panel">
      <div className="settings-grid">
        <div className="settings-card">
          <h3>Airlines · {windowDays} days</h3>
          <p className="settings-help">
            Airline desk labor (Demand, Wide haul, Internal Haul) — distance and
            count on listed VAs. Flight quality is settle score + on-time over
            the same window (shown when enough flights).
          </p>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            className="action ghost"
            disabled={busy}
            onClick={() => void refresh()}
          >
            Refresh
          </button>
          {companies.length === 0 ? (
            <p className="settings-sample" style={{ marginTop: '0.75rem' }}>
              No airline desk stats yet. Settle Demand, Wide haul, or Internal
              Haul on a listed VA to appear.
            </p>
          ) : (
            <ol
              className="settings-sample"
              style={{ marginTop: '0.75rem', paddingLeft: '1.1rem' }}
            >
              {companies.map((row) => (
                <li key={row.companyId} style={{ marginBottom: '0.35rem' }}>
                  <strong>{row.displayName}</strong> · {row.nm} nm · {row.hauls}{' '}
                  hauls
                  {row.payUsd > 0
                    ? ` · $${Math.round(row.payUsd).toLocaleString()}`
                    : ''}
                  {row.flightQuality?.qualityScore != null
                    ? ` · quality ${Math.round(row.flightQuality.qualityScore)}`
                    : ''}
                  {row.orgPerks && row.orgPerks.tier > 0
                    ? ` · ${row.orgPerks.tierName}`
                    : ''}
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="settings-card">
          <h3>Pilots · this airline</h3>
          <p className="settings-help">
            Same window, members of your listed VA. Freights / Charter market
            hire do not count here.
          </p>
          {!pilotsCompanyId ? (
            <p className="settings-sample">
              Join or publish a listed airline to see crew ranking.
            </p>
          ) : pilots.length === 0 ? (
            <p className="settings-sample">
              No airline desk flights for this crew in the window yet.
            </p>
          ) : (
            <ol className="settings-sample" style={{ paddingLeft: '1.1rem' }}>
              {pilots.map((p) => (
                <li key={p.accountId} style={{ marginBottom: '0.35rem' }}>
                  <strong>{p.displayName}</strong> · {p.nm} nm · {p.hauls} hauls
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
