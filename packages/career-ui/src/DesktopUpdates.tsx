import { useEffect, useState, useSyncExternalStore } from 'react';

export type DesktopUpdateEvent =
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
  checkForUpdates: () => Promise<{
    ok: boolean;
    version?: string | null;
    currentVersion?: string | null;
    updateAvailable?: boolean;
    downloaded?: boolean;
    reason?: string;
  }>;
  downloadUpdate: () => Promise<{ ok: boolean; reason?: string }>;
  quitAndInstall: () => Promise<{ ok: boolean; reason?: string }>;
  onUpdateEvent: (cb: (payload: DesktopUpdateEvent) => void) => () => void;
};

export type DesktopUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error'
  | 'uptodate';

export type DesktopUpdateState = {
  status: DesktopUpdateStatus;
  installedVersion: string;
  remoteVersion: string | null;
  progressPct: number;
  error: string | null;
  busy: boolean;
};

/** Long-interval recheck after the login/boot check (ms). */
export const DESKTOP_UPDATE_POLL_MS = 30 * 60 * 1000;

const INITIAL_STATE: DesktopUpdateState = {
  status: 'idle',
  installedVersion: '…',
  remoteVersion: null,
  progressPct: 0,
  error: null,
  busy: false,
};

let storeState: DesktopUpdateState = { ...INITIAL_STATE };
const storeListeners = new Set<() => void>();
let bridgeWired = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let checkInFlight: Promise<void> | null = null;

function getDesktop(): SkylineDesktop | null {
  const w = window as Window & { skylineDesktop?: SkylineDesktop };
  return w.skylineDesktop?.isDesktop ? w.skylineDesktop : null;
}

export function isSkylineDesktopShell(): boolean {
  return getDesktop() != null;
}

function emitStore() {
  for (const listener of storeListeners) listener();
}

function patchStore(partial: Partial<DesktopUpdateState>) {
  storeState = { ...storeState, ...partial };
  emitStore();
}

/** Semver-ish compare for desktop x.y.z (+ optional prerelease ignored). */
export function isNewerDesktopVersion(
  remote: string | null | undefined,
  local: string | null | undefined,
): boolean {
  const parse = (raw: string | null | undefined) => {
    const core = String(raw ?? '')
      .trim()
      .replace(/^v/i, '')
      .split('-')[0]!
      .split('+')[0]!;
    const parts = core.split('.').map((p) => Number.parseInt(p, 10));
    return [
      Number.isFinite(parts[0]) ? parts[0]! : 0,
      Number.isFinite(parts[1]) ? parts[1]! : 0,
      Number.isFinite(parts[2]) ? parts[2]! : 0,
    ] as const;
  };
  const a = parse(remote);
  const b = parse(local);
  for (let i = 0; i < 3; i++) {
    if (a[i]! > b[i]!) return true;
    if (a[i]! < b[i]!) return false;
  }
  return false;
}

/**
 * Differential downloads emit jumpy percent across HTTP ranges. Keep the UI
 * bar monotonic within a download session (reset when progressPct is set to 0
 * at download start).
 */
export function clampDesktopUpdateProgressPct(
  previousPct: number,
  reportedPct: number | null | undefined,
): number {
  const next = Math.max(
    0,
    Math.min(100, Number.isFinite(reportedPct) ? Number(reportedPct) : 0),
  );
  const prev = Math.max(
    0,
    Math.min(100, Number.isFinite(previousPct) ? previousPct : 0),
  );
  return Math.max(prev, next);
}

function applyUpdateEvent(ev: DesktopUpdateEvent) {
  if (ev.type === 'checking') {
    if (
      storeState.status === 'available' ||
      storeState.status === 'downloading' ||
      storeState.status === 'ready'
    ) {
      return;
    }
    patchStore({ status: 'checking', error: null });
  } else if (ev.type === 'available') {
    patchStore({
      status: 'available',
      remoteVersion: ev.version,
      error: null,
      progressPct: 0,
    });
  } else if (ev.type === 'not-available') {
    if (
      storeState.status === 'available' ||
      storeState.status === 'downloading' ||
      storeState.status === 'ready'
    ) {
      return;
    }
    // Stale GitHub CDN can claim "not available" right after a release while
    // remote still equals the previous tag — only mark uptodate when remote
    // is missing or not newer than installed.
    if (
      ev.version &&
      isNewerDesktopVersion(ev.version, storeState.installedVersion)
    ) {
      patchStore({
        status: 'available',
        remoteVersion: ev.version,
        error: null,
      });
      return;
    }
    patchStore({
      status: 'uptodate',
      remoteVersion: null,
      error: null,
    });
  } else if (ev.type === 'progress') {
    patchStore({
      status: 'downloading',
      progressPct: clampDesktopUpdateProgressPct(
        storeState.progressPct,
        ev.percent,
      ),
      error: null,
    });
  } else if (ev.type === 'downloaded') {
    patchStore({
      status: 'ready',
      remoteVersion: ev.version,
      progressPct: 100,
      error: null,
      busy: false,
    });
  } else if (ev.type === 'error') {
    patchStore({ status: 'error', error: ev.message, busy: false });
  }
}

export async function runUpdateCheck(opts?: { force?: boolean }): Promise<void> {
  const desktop = getDesktop();
  if (!desktop) return;
  const force = opts?.force === true;
  if (
    !force &&
    (storeState.status === 'available' ||
      storeState.status === 'downloading' ||
      storeState.status === 'ready' ||
      storeState.busy)
  ) {
    return;
  }
  if (checkInFlight) return checkInFlight;
  checkInFlight = (async () => {
    patchStore({ busy: true, error: null });
    if (
      storeState.status !== 'available' &&
      storeState.status !== 'downloading' &&
      storeState.status !== 'ready'
    ) {
      patchStore({ status: 'checking' });
    }
    try {
      const installed = await desktop.getVersion().catch(() => storeState.installedVersion);
      if (installed && installed !== '…') {
        patchStore({ installedVersion: installed });
      }
      const result = await desktop.checkForUpdates();
      if (!result.ok) {
        if (result.reason && result.reason !== 'dev') {
          patchStore({ status: 'error', error: result.reason });
        }
        return;
      }
      const remote = result.version ?? null;
      const current = result.currentVersion ?? installed;
      const newer =
        result.updateAvailable === true ||
        (remote != null && isNewerDesktopVersion(remote, current));
      if (result.downloaded && newer && remote) {
        patchStore({
          status: 'ready',
          remoteVersion: remote,
          progressPct: 100,
          error: null,
        });
      } else if (newer && remote) {
        patchStore({
          status: 'available',
          remoteVersion: remote,
          error: null,
          progressPct: 0,
        });
      } else if (
        storeState.status === 'checking' ||
        storeState.status === 'idle' ||
        force
      ) {
        patchStore({
          status: 'uptodate',
          remoteVersion: null,
          error: null,
        });
      }
    } catch (err) {
      patchStore({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      patchStore({ busy: false });
      checkInFlight = null;
    }
  })();
  return checkInFlight;
}

function ensureDesktopUpdateBridge() {
  const desktop = getDesktop();
  if (!desktop || bridgeWired) return desktop;
  bridgeWired = true;
  void desktop.getVersion().then((version) => {
    patchStore({ installedVersion: version });
  }).catch(() => {
    patchStore({ installedVersion: '?' });
  });
  desktop.onUpdateEvent(applyUpdateEvent);
  // Single check when the shell first mounts (Electron no longer boots a parallel check).
  void runUpdateCheck();
  // Quiet recheck while the app stays open — skips if an update is already offered/downloading.
  if (!pollTimer) {
    pollTimer = setInterval(() => {
      void runUpdateCheck();
    }, DESKTOP_UPDATE_POLL_MS);
  }
  return desktop;
}

function subscribeDesktopUpdateStore(listener: () => void): () => void {
  ensureDesktopUpdateBridge();
  storeListeners.add(listener);
  return () => {
    storeListeners.delete(listener);
  };
}

function getDesktopUpdateSnapshot(): DesktopUpdateState {
  ensureDesktopUpdateBridge();
  return storeState;
}

export function useDesktopUpdateState(): DesktopUpdateState {
  return useSyncExternalStore(
    subscribeDesktopUpdateStore,
    getDesktopUpdateSnapshot,
    () => INITIAL_STATE,
  );
}

export function desktopUpdateHeaderLabel(
  state: DesktopUpdateState,
  opts?: { forceMinClientVersion?: string | null },
): string | null {
  if (state.status === 'downloading') {
    return `Downloading ${state.progressPct.toFixed(0)}%`;
  }
  if (state.status === 'ready' && state.remoteVersion) {
    return `Install ${state.remoteVersion}`;
  }
  if (state.status === 'available' && state.remoteVersion) {
    return `Update ${state.remoteVersion}`;
  }
  if (state.status === 'error' && state.remoteVersion) {
    return `Update ${state.remoteVersion}`;
  }
  const force = opts?.forceMinClientVersion?.trim().replace(/^v/i, '') || '';
  if (force) return `Update ${force}`;
  return null;
}

export function DesktopUpdatesCard() {
  const desktop = getDesktop();
  const state = useDesktopUpdateState();

  if (!desktop) return null;

  async function onCheck() {
    await runUpdateCheck({ force: true });
  }

  async function onDownload() {
    patchStore({
      busy: true,
      error: null,
      status: 'downloading',
      progressPct: 0,
    });
    try {
      const result = await desktop!.downloadUpdate();
      if (!result.ok) {
        patchStore({
          status: 'error',
          error: result.reason ?? 'Download failed',
          busy: false,
        });
      }
    } catch (err) {
      patchStore({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        busy: false,
      });
    } finally {
      if (storeState.status === 'downloading') {
        patchStore({ busy: false });
      }
    }
  }

  async function onRestart() {
    patchStore({ busy: true, error: null });
    try {
      const result = await desktop!.quitAndInstall();
      if (!result.ok) {
        patchStore({ busy: false });
        if (result.reason && result.reason !== 'cancelled') {
          patchStore({ status: 'error', error: result.reason });
        }
      }
    } catch (err) {
      patchStore({
        busy: false,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const help =
    state.status === 'available' && state.remoteVersion
      ? `Version ${state.remoteVersion} is available.`
      : state.status === 'downloading'
        ? `Downloading update… ${state.progressPct.toFixed(0)}%`
        : state.status === 'ready' && state.remoteVersion
          ? `Version ${state.remoteVersion} downloaded. Install closes the app and opens the updater window — if Windows warns about an unknown publisher, choose More info → Run anyway; watch progress until Airframe reopens.`
          : state.status === 'uptodate'
            ? 'You are on the latest release.'
            : state.status === 'checking'
              ? 'Checking GitHub Releases…'
              : 'Checks GitHub Releases once when you open Career (and again every 30 minutes while the app stays open). Builds are not code-signed yet — Windows SmartScreen may warn when installing updates.';

  return (
    <div className="settings-card">
      <h3>Updates</h3>
      <p className="settings-help">{help}</p>
      <p className="settings-sample">
        Installed version: <strong>{state.installedVersion}</strong>
        {state.remoteVersion ? (
          <>
            {' · '}
            Available: <strong>{state.remoteVersion}</strong>
          </>
        ) : null}
      </p>
      {state.status === 'downloading' ? (
        <div
          className="desktop-update-progress"
          role="progressbar"
          aria-valuenow={Math.round(state.progressPct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${state.progressPct}%` }} />
        </div>
      ) : null}
      {state.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="settings-choice" style={{ marginTop: '0.75rem' }}>
        <button
          type="button"
          className="settings-choice-btn"
          disabled={state.busy || state.status === 'downloading'}
          onClick={() => void onCheck()}
        >
          Check for updates
          <small>GitHub Releases</small>
        </button>
        {state.status === 'available' || state.status === 'error' ? (
          <button
            type="button"
            className="settings-choice-btn active"
            disabled={state.busy || !state.remoteVersion}
            onClick={() => void onDownload()}
          >
            Download
            <small>{state.remoteVersion ?? 'update'}</small>
          </button>
        ) : null}
        {state.status === 'ready' ? (
          <button
            type="button"
            className="settings-choice-btn active"
            disabled={state.busy}
            onClick={() => void onRestart()}
          >
            Restart to update
            <small>Opens installer</small>
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Topbar control: check on shell entry (login), long-poll thereafter.
 * Click downloads with in-button progress, then installs — no Settings hop.
 * World kill switch (`forceMinClientVersion`) keeps this same chip visible even
 * before electron-updater reports a package.
 */
export function DesktopUpdateHeaderButton(props: {
  forceMinClientVersion?: string | null;
  onOpenSettings?: () => void;
}) {
  const desktop = getDesktop();
  const state = useDesktopUpdateState();
  const [actionError, setActionError] = useState<string | null>(null);
  const forceMin =
    props.forceMinClientVersion?.trim().replace(/^v/i, '') || null;

  useEffect(() => {
    ensureDesktopUpdateBridge();
  }, []);

  useEffect(() => {
    if (!forceMin || !desktop) return;
    void runUpdateCheck({ force: true });
  }, [forceMin, desktop]);

  if (!desktop) return null;

  const label = desktopUpdateHeaderLabel(state, {
    forceMinClientVersion: forceMin,
  });
  if (!label) return null;

  const downloading = state.status === 'downloading';
  const ready = state.status === 'ready';
  const canDownload =
    state.status === 'available' ||
    (state.status === 'error' && Boolean(state.remoteVersion));
  const title = downloading
    ? `Downloading ${state.remoteVersion ?? 'update'}… ${state.progressPct.toFixed(0)}%`
    : ready
      ? `Version ${state.remoteVersion} downloaded — click to install (SmartScreen → Run anyway, then watch the installer)`
      : canDownload
        ? `Version ${state.remoteVersion} available — click to download and install`
        : forceMin
          ? `Desktop update required · v${forceMin}+ — click to check for the installer`
          : `Version ${state.remoteVersion} available — click to download and install`;

  async function startDownload() {
    patchStore({
      busy: true,
      error: null,
      status: 'downloading',
      progressPct: 0,
    });
    try {
      const result = await desktop!.downloadUpdate();
      if (!result.ok) {
        const reason = result.reason ?? 'Download failed';
        setActionError(reason);
        patchStore({ status: 'error', error: reason, busy: false });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setActionError(message);
      patchStore({ status: 'error', error: message, busy: false });
    } finally {
      if (storeState.status === 'downloading') {
        patchStore({ busy: false });
      }
    }
  }

  async function onClick() {
    setActionError(null);
    if (ready) {
      patchStore({ busy: true });
      try {
        const result = await desktop!.quitAndInstall();
        if (!result.ok) {
          patchStore({ busy: false });
          if (result.reason && result.reason !== 'cancelled') {
            setActionError(result.reason);
            patchStore({ status: 'error', error: result.reason });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setActionError(message);
        patchStore({ busy: false, status: 'error', error: message });
      }
      return;
    }
    if (downloading || state.busy) return;
    if (canDownload) {
      await startDownload();
      return;
    }
    if (forceMin) {
      await runUpdateCheck({ force: true });
      const snap = getDesktopUpdateSnapshot();
      if (snap.status === 'available' || Boolean(snap.remoteVersion)) {
        await startDownload();
        return;
      }
      props.onOpenSettings?.();
      return;
    }
    await startDownload();
  }

  return (
    <button
      type="button"
      className={`topbar-update-btn${ready ? ' is-ready' : ''}${downloading ? ' is-downloading' : ''}`}
      title={actionError ? actionError : title}
      aria-label={actionError ? actionError : title}
      disabled={downloading || state.busy}
      onClick={() => void onClick()}
    >
      {downloading ? (
        <span
          className="topbar-update-btn-progress"
          aria-hidden="true"
          style={{ width: `${state.progressPct}%` }}
        />
      ) : null}
      <span className="topbar-update-btn-label">{label}</span>
    </button>
  );
}
