import { useCallback, useEffect, useState } from 'react';
import {
  fetchVaMembers,
  postVaPublish,
} from './api';
import { getAuthToken } from './career-auth-client';
import { getStoredCompanyId } from './career-company-client';

type Props = {
  authRequired: boolean;
  activeCompanyId: string | null;
  defaultHomeHubIcao?: string | null;
  defaultDisplayName?: string | null;
  onGoVa?: () => void;
};

/** Company panel: turn the active company into a listed VA (or update listing). */
export function CompanyVaPublishCard(props: Props) {
  const token = getAuthToken();
  const companyId = props.activeCompanyId || getStoredCompanyId();
  const canShow = Boolean(token) || props.authRequired;
  const [role, setRole] = useState<string | null>(null);
  const [listed, setListed] = useState(false);
  const [publishName, setPublishName] = useState(
    props.defaultDisplayName?.trim() ?? '',
  );
  const [publishHub, setPublishHub] = useState(
    props.defaultHomeHubIcao?.trim().toUpperCase() ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!canShow || !companyId) {
      setLoaded(true);
      return;
    }
    try {
      const m = await fetchVaMembers();
      setRole(m.role);
      setListed(m.listed);
      setPublishName((prev) => prev || m.displayName || props.defaultDisplayName || '');
      setPublishHub(
        (prev) =>
          prev || m.homeHubIcao || props.defaultHomeHubIcao?.toUpperCase() || '',
      );
    } catch {
      setRole(null);
      setListed(false);
    } finally {
      setLoaded(true);
    }
  }, [canShow, companyId, props.defaultDisplayName, props.defaultHomeHubIcao]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!canShow || !companyId) return null;
  if (!loaded) return null;
  if (role && role !== 'owner') {
    return (
      <div className="pilot-card">
        <h3>Virtual airline</h3>
        <p className="settings-help">
          Only the company owner can publish or update the VA listing. Your role:{' '}
          <strong>{role}</strong>.
        </p>
        {listed && props.onGoVa ? (
          <button type="button" className="action ghost" onClick={props.onGoVa}>
            Open My VA
          </button>
        ) : null}
      </div>
    );
  }
  if (!role) {
    return (
      <div className="pilot-card">
        <h3>Virtual airline</h3>
        <p className="settings-help">
          Sign in as owner of this company to list it as a VA.
        </p>
      </div>
    );
  }

  return (
    <div className="pilot-card">
      <h3>{listed ? 'VA listing' : 'Become a VA'}</h3>
      <p className="settings-help">
        Reuses this company — same wallet and fleet. Publishing puts you in the
        VAs directory so other pilots can request to join.
      </p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
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
          onChange={(e) => setPublishHub(e.target.value.toUpperCase())}
        />
      </label>
      <button
        type="button"
        className="action"
        disabled={busy || !publishName.trim() || !publishHub.trim()}
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
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        {listed ? 'Save listing' : 'Publish as VA'}
      </button>
      {listed && props.onGoVa ? (
        <button
          type="button"
          className="action ghost"
          style={{ marginTop: '0.5rem' }}
          onClick={props.onGoVa}
        >
          Manage roster
        </button>
      ) : null}
    </div>
  );
}
