import { useEffect, useState } from 'react';

type UpdateEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string; releaseNotes?: string | null }
  | { type: 'not-available'; version?: string }
  | {
      type: 'progress';
      percent: number;
      transferred?: number;
      total?: number;
      bytesPerSecond?: number;
    }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string };

type SkylineDesktop = {
  isDesktop: true;
  getVersion: () => Promise<string>;
  checkForUpdates: () => Promise<{ ok: boolean; version?: string | null; reason?: string }>;
  downloadUpdate: () => Promise<{ ok: boolean; reason?: string }>;
  quitAndInstall: () => Promise<{ ok: boolean; reason?: string }>;
  onUpdateEvent: (cb: (payload: UpdateEvent) => void) => () => void;
};

function getDesktop(): SkylineDesktop | null {
  const w = window as Window & { skylineDesktop?: SkylineDesktop };
  return w.skylineDesktop?.isDesktop ? w.skylineDesktop : null;
}

export function isSkylineDesktopShell(): boolean {
  return getDesktop() != null;
}

export function DesktopUpdatesCard() {
  const desktop = getDesktop();
  const [version, setVersion] = useState<string>('…');
  const [status, setStatus] = useState<
    'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'uptodate'
  >('idle');
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    void desktop.getVersion().then(setVersion).catch(() => setVersion('?'));
    return desktop.onUpdateEvent((ev) => {
      if (ev.type === 'checking') {
        setStatus('checking');
        setError(null);
      } else if (ev.type === 'available') {
        setStatus('available');
        setRemoteVersion(ev.version);
        setError(null);
      } else if (ev.type === 'not-available') {
        setStatus('uptodate');
        setRemoteVersion(null);
      } else if (ev.type === 'progress') {
        setStatus('downloading');
        setProgressPct(Math.max(0, Math.min(100, ev.percent ?? 0)));
      } else if (ev.type === 'downloaded') {
        setStatus('ready');
        setRemoteVersion(ev.version);
        setProgressPct(100);
      } else if (ev.type === 'error') {
        setStatus('error');
        setError(ev.message);
      }
    });
  }, [desktop]);

  if (!desktop) return null;

  async function onCheck() {
    setBusy(true);
    setError(null);
    setStatus('checking');
    try {
      const result = await desktop!.checkForUpdates();
      if (!result.ok && result.reason && result.reason !== 'dev') {
        setStatus('error');
        setError(result.reason);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onDownload() {
    setBusy(true);
    setError(null);
    setStatus('downloading');
    setProgressPct(0);
    try {
      const result = await desktop!.downloadUpdate();
      if (!result.ok) {
        setStatus('error');
        setError(result.reason ?? 'Download failed');
      }
    } finally {
      setBusy(false);
    }
  }

  async function onRestart() {
    setBusy(true);
    setError(null);
    try {
      const result = await desktop!.quitAndInstall();
      if (!result.ok) {
        setBusy(false);
        if (result.reason && result.reason !== 'cancelled') {
          setStatus('error');
          setError(result.reason);
        }
      }
    } catch (err) {
      setBusy(false);
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const help =
    status === 'available' && remoteVersion
      ? `Version ${remoteVersion} is available.`
      : status === 'downloading'
        ? `Downloading update… ${progressPct.toFixed(0)}%`
        : status === 'ready' && remoteVersion
          ? `Version ${remoteVersion} downloaded. Open the installer — if Windows warns about an unknown publisher, choose More info → Run anyway, then finish setup.`
          : status === 'uptodate'
            ? 'You are on the latest release.'
            : status === 'checking'
              ? 'Checking GitHub Releases…'
              : 'Checks GitHub Releases for a newer Skyline Career build. Builds are not code-signed yet — Windows SmartScreen may warn when installing updates.';

  return (
    <div className="settings-card">
      <h3>Updates</h3>
      <p className="settings-help">{help}</p>
      <p className="settings-sample">
        Installed version: <strong>{version}</strong>
        {remoteVersion ? (
          <>
            {' · '}
            Available: <strong>{remoteVersion}</strong>
          </>
        ) : null}
      </p>
      {status === 'downloading' ? (
        <div
          className="desktop-update-progress"
          role="progressbar"
          aria-valuenow={Math.round(progressPct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${progressPct}%` }} />
        </div>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="settings-choice" style={{ marginTop: '0.75rem' }}>
        <button
          type="button"
          className="settings-choice-btn"
          disabled={busy || status === 'downloading'}
          onClick={() => void onCheck()}
        >
          Check for updates
          <small>GitHub Releases</small>
        </button>
        {status === 'available' ? (
          <button
            type="button"
            className="settings-choice-btn active"
            disabled={busy}
            onClick={() => void onDownload()}
          >
            Download
            <small>{remoteVersion ?? 'update'}</small>
          </button>
        ) : null}
        {status === 'ready' ? (
          <button
            type="button"
            className="settings-choice-btn active"
            disabled={busy}
            onClick={() => void onRestart()}
          >
            Restart to update
            <small>Open installer</small>
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Compact toast/banner when an update is available while playing. */
export function DesktopUpdateBanner(props: {
  onOpenSettings: () => void;
}) {
  const desktop = getDesktop();
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    return desktop.onUpdateEvent((ev) => {
      if (ev.type === 'available') {
        setReady(false);
        setNotice(`Update ${ev.version} available`);
      } else if (ev.type === 'downloaded') {
        setReady(true);
        setNotice(`Update ${ev.version} ready — open installer`);
      }
    });
  }, [desktop]);

  if (!desktop || !notice) return null;

  return (
    <p className="banner ok" role="status">
      <span>{notice}</span>
      <button
        type="button"
        className="action"
        onClick={() => {
          if (ready) {
            void desktop.quitAndInstall();
          } else {
            props.onOpenSettings();
          }
        }}
      >
        {ready ? 'Install' : 'Settings'}
      </button>
    </p>
  );
}
