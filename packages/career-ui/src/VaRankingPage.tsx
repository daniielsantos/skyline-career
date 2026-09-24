import { useCallback, useEffect, useState } from 'react';
import {
  fetchVaRanking,
  type VaCompanyRank,
  type VaPilotRank,
} from './api';
import { BusyBlock } from './Busy';
import { getAuthToken } from './career-auth-client';

type Props = {
  authRequired: boolean;
};

type RankPane = 'airlines' | 'pilots';

function formatNm(n: number): string {
  return `${Math.round(n).toLocaleString()} nm`;
}

function CompanyRankCard(props: { row: VaCompanyRank; place: number }) {
  const { row, place } = props;
  const quality =
    row.flightQuality?.qualityScore != null
      ? Math.round(row.flightQuality.qualityScore)
      : null;
  const perks =
    row.orgPerks && row.orgPerks.tier > 0 ? row.orgPerks.tierName : null;
  return (
    <li className="va-directory-card va-ranking-card">
      <div className="va-directory-card-main">
        <div className="va-directory-card-id">
          <div className="va-directory-card-title-row">
            <span className="va-ranking-place" aria-label={`Rank ${place}`}>
              #{place}
            </span>
            <strong className="va-directory-card-name">{row.displayName}</strong>
          </div>
        </div>
        <div className="va-directory-card-stats">
          <div>
            <span className="va-stat-label">Distance</span>
            <span className="va-stat-value">{formatNm(row.nm)}</span>
          </div>
          <div>
            <span className="va-stat-label">Flights</span>
            <span className="va-stat-value">{row.hauls.toLocaleString()}</span>
          </div>
          <div>
            <span className="va-stat-label">Quality</span>
            <span className="va-stat-value">{quality ?? '—'}</span>
          </div>
          <div>
            <span className="va-stat-label">Perks</span>
            <span className="va-stat-value">{perks ?? '—'}</span>
          </div>
        </div>
      </div>
    </li>
  );
}

function PilotRankCard(props: { row: VaPilotRank; place: number }) {
  const { row, place } = props;
  return (
    <li className="va-directory-card va-ranking-card">
      <div className="va-directory-card-main">
        <div className="va-directory-card-id">
          <div className="va-directory-card-title-row">
            <span className="va-ranking-place" aria-label={`Rank ${place}`}>
              #{place}
            </span>
            <strong className="va-directory-card-name">{row.displayName}</strong>
          </div>
        </div>
        <div className="va-directory-card-stats">
          <div>
            <span className="va-stat-label">Distance</span>
            <span className="va-stat-value">{formatNm(row.nm)}</span>
          </div>
          <div>
            <span className="va-stat-label">Flights</span>
            <span className="va-stat-value">{row.hauls.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </li>
  );
}

export function VaRankingPage(props: Props) {
  const token = getAuthToken();
  const canShow = Boolean(token) || props.authRequired;
  const [pane, setPane] = useState<RankPane>('airlines');
  const [windowDays, setWindowDays] = useState(7);
  const [companies, setCompanies] = useState<VaCompanyRank[]>([]);
  const [pilots, setPilots] = useState<VaPilotRank[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!canShow) {
      setLoaded(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetchVaRanking();
      setWindowDays(r.windowDays);
      setCompanies(r.companies);
      setPilots(r.pilots);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setLoaded(true);
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

  if (!loaded) {
    return (
      <section className="panel va-panel va-panel-loading">
        <BusyBlock label="Loading Ranking…" />
      </section>
    );
  }

  const emptyAirlines = companies.length === 0 && !error;
  const emptyPilots = pilots.length === 0 && !error;

  return (
    <section className="panel va-panel va-ranking">
      <div className="va-ranking-toolbar" role="tablist" aria-label="Ranking">
        <button
          type="button"
          role="tab"
          aria-selected={pane === 'airlines'}
          className={pane === 'airlines' ? 'tab active' : 'tab'}
          onClick={() => setPane('airlines')}
        >
          Airlines
          {companies.length > 0 ? ` (${companies.length})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pane === 'pilots'}
          className={pane === 'pilots' ? 'tab active' : 'tab'}
          onClick={() => setPane('pilots')}
        >
          Pilots
          {pilots.length > 0 ? ` (${pilots.length})` : ''}
        </button>
        <span className="muted va-ranking-window">
          Last {windowDays}d
          {busy ? ' · Updating…' : ''}
        </span>
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

      {pane === 'airlines' ? (
        <div role="tabpanel" className="va-ranking-pane">
          {emptyAirlines ? (
            <p className="muted va-ranking-empty">
              No listed-airline flights in this window yet.
            </p>
          ) : companies.length > 0 ? (
            <ul className="va-directory-list">
              {companies.map((row, i) => (
                <CompanyRankCard
                  key={row.companyId}
                  row={row}
                  place={i + 1}
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div role="tabpanel" className="va-ranking-pane">
          {emptyPilots ? (
            <p className="muted va-ranking-empty">
              No listed-airline flights in this window yet.
            </p>
          ) : pilots.length > 0 ? (
            <ul className="va-directory-list">
              {pilots.map((row, i) => (
                <PilotRankCard key={row.accountId} row={row} place={i + 1} />
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  );
}
