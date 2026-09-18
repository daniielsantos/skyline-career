/**
 * Airframe Career desktop shell (Electron).
 * Starts Career API (+ optional SimBridgeHost), then opens a BrowserWindow.
 * SP (local SQLite) or MP gateway via desktop-play.json / CAREER_WORLD_API_URL.
 * Auto-update via electron-updater → GitHub Releases (no code signing yet).
 *
 * Display name is Airframe; appId + userData folder stay Skyline until Fase 3 migrator.
 */
import { createRequire } from 'node:module';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
} from 'electron';
import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream, appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createConnection } from 'node:net';
import {
  DEFAULT_WORLD_API_URL,
  PUBLIC_WORLD_API_URL,
  normalizeWorldApiUrl,
  readDesktopPlayConfig,
  resolveDesktopPlayLaunch,
  writeDesktopPlayConfig,
} from './desktop-play-config.mjs';

const require = createRequire(import.meta.url);

/**
 * Packaged builds load electron-updater from resources/updater-nm (complete
 * flat tree). Never require it from app.asar — electron-builder only packs a
 * stub of that package and drops transitive deps (fs-extra, debug, …).
 */
function loadElectronUpdater() {
  if (app.isPackaged) {
    const probe = join(process.resourcesPath, 'updater-nm', 'package.json');
    const fromResources = createRequire(probe);
    return fromResources('electron-updater');
  }
  return require('electron-updater');
}

const { autoUpdater } = loadElectronUpdater();

// Display name (Task Manager / window). Keep legacy userData until Fase 3 migrator.
app.setName('Airframe Career');
app.setPath('userData', join(app.getPath('appData'), 'Skyline Career'));
if (process.platform === 'win32') {
  app.setAppUserModelId('com.skyline.career');
}
Menu.setApplicationMenu(null);

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_PORT = Number(process.env.CAREER_UI_API_PORT ?? 8788);
const API_URL = `http://127.0.0.1:${API_PORT}`;

/** @type {import('node:child_process').ChildProcess | null} */
let apiChild = null;
/** @type {import('node:child_process').ChildProcess | null} */
let hostChild = null;
/** @type {BrowserWindow | null} */
let mainWindow = null;
let shuttingDown = false;
/** @type {string} */
let desktopLogPath = '';
let updaterWired = false;

function isPackaged() {
  return app.isPackaged;
}

function resourcesRoot() {
  return isPackaged() ? process.resourcesPath : join(__dirname, '..', '..');
}

function skylineRoot() {
  if (isPackaged()) {
    return join(resourcesRoot(), 'skyline');
  }
  return join(__dirname, '..', '..');
}

function careerContentRoot() {
  return join(skylineRoot(), 'profiles', 'career');
}

function careerDataRoot() {
  return join(app.getPath('userData'), 'career');
}

function desktopPlayConfigPath() {
  return join(careerDataRoot(), 'desktop-play.json');
}

/** Active world URL for the next / current API child (empty = SP). */
function resolveLaunchPlay() {
  return resolveDesktopPlayLaunch(
    process.env,
    readDesktopPlayConfig(desktopPlayConfigPath()),
  );
}

function uiDistRoot() {
  return join(skylineRoot(), 'packages', 'career-ui', 'dist');
}

function hostDir() {
  if (isPackaged()) {
    return join(resourcesRoot(), 'host');
  }
  return join(
    skylineRoot(),
    'native',
    'SimBridgeHost',
    'bin',
    'Release',
    'net8.0-windows',
  );
}

function preloadPath() {
  return join(__dirname, 'preload.cjs');
}

function logLine(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    if (desktopLogPath) appendFileSync(desktopLogPath, line, 'utf8');
  } catch {
    /* ignore */
  }
  console.log(message);
}

function sendUpdateEvent(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('skyline:update', payload);
}

async function pathExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function killPidTree(pid, { tree = false } = {}) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      // /T only for our own child processes. Tree-killing Docker's port proxy
      // (com.docker.*) tears down Docker Desktop entirely.
      const args = tree
        ? ['/PID', String(pid), '/T', '/F']
        : ['/PID', String(pid), '/F'];
      execFileSync('taskkill', args, {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch {
    /* ignore */
  }
}

/** Windows image name for a PID (e.g. node.exe, com.docker.backend.exe). */
function windowsImageName(pid) {
  try {
    const out = execFileSync(
      'tasklist',
      ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
      { encoding: 'utf8', windowsHide: true },
    );
    const line = out.trim().split(/\r?\n/)[0] ?? '';
    const m = line.match(/^"([^"]+)"/);
    return m ? m[1] : '';
  } catch {
    return '';
  }
}

/** Never taskkill these — published Docker ports bind through Docker/WSL proxies. */
function isProtectedPortHolder(imageName) {
  return /docker|vpnkit|wslrelay|wsl\.exe|com\.docker|vmcompute|vmmem|containerd|dockerd/i.test(
    imageName || '',
  );
}

/** Stale Skyline / Node API leftovers only. */
function isSafeToKillForApiPort(imageName) {
  return /^(node|electron|Skyline Career|Airframe Career)\.exe$/i.test(imageName || '');
}

/**
 * Free our own leftover API process on `port`. Never kill Docker/WSL proxies
 * (taskkill /T on those PIDs closes Docker Desktop on Windows).
 * @returns {{ freed: number, blockedBy: string | null }}
 */
function killListenersOnPort(port) {
  if (process.platform !== 'win32') {
    return { freed: 0, blockedBy: null };
  }
  let freed = 0;
  /** @type {string | null} */
  let blockedBy = null;
  try {
    const out = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes(`:${port}`) || !line.includes('LISTENING')) continue;
      // Prefer exact :port bound on loopback / any — avoid matching :87870 etc.
      if (!new RegExp(`(?:[\\[\\]:.]|\\s):${port}\\s`).test(line) &&
          !new RegExp(`:${port}\\s+`).test(line)) {
        continue;
      }
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid) && pid !== '0' && Number(pid) !== process.pid) {
        pids.add(pid);
      }
    }
    for (const pid of pids) {
      const name = windowsImageName(pid) || `(pid ${pid})`;
      if (isProtectedPortHolder(name)) {
        logLine(
          `[desktop] port ${port} held by ${name} (PID ${pid}) — not killing (Docker/WSL)`,
        );
        blockedBy = name;
        continue;
      }
      if (!isSafeToKillForApiPort(name)) {
        logLine(
          `[desktop] port ${port} held by ${name} (PID ${pid}) — not killing unknown process`,
        );
        blockedBy = name;
        continue;
      }
      logLine(`[desktop] freeing port ${port} (${name} PID ${pid})`);
      killPidTree(Number(pid));
      freed += 1;
    }
  } catch {
    /* ignore */
  }
  return { freed, blockedBy };
}

function portFree(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(true));
  });
}

async function waitForApi(timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (apiChild && apiChild.exitCode != null) {
      throw new Error(
        `Career API exited early (code ${apiChild.exitCode}). See career-api.log`,
      );
    }
    try {
      const res = await fetch(`${API_URL}/api/health`, {
        signal: AbortSignal.timeout(800),
      });
      if (res.ok) {
        const body = await res.json();
        if (body?.ok === true) return body;
      }
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  throw new Error(`Career API did not become ready at ${API_URL}`);
}

function killTree(child) {
  if (!child) return;
  if ('kill' in child && typeof child.kill === 'function') {
    try {
      if (process.platform === 'win32' && child.pid) {
        killPidTree(child.pid, { tree: true });
      } else {
        child.kill();
      }
    } catch {
      /* ignore */
    }
  }
}

function wireAutoUpdater() {
  if (updaterWired) return;
  updaterWired = true;

  autoUpdater.autoDownload = false;
  // Unsigned builds: never silent-install on quit (SmartScreen blocks it).
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('checking-for-update', () => {
    sendUpdateEvent({ type: 'checking' });
  });
  autoUpdater.on('update-available', (info) => {
    logLine(`[desktop] update available: ${info.version}`);
    sendUpdateEvent({
      type: 'available',
      version: info.version,
      releaseNotes: info.releaseNotes ?? null,
    });
  });
  autoUpdater.on('update-not-available', (info) => {
    logLine(
      `[desktop] update not available (current=${app.getVersion()} remote=${info?.version ?? '?'})`,
    );
    sendUpdateEvent({ type: 'not-available', version: info?.version });
  });
  autoUpdater.on('download-progress', (progress) => {
    sendUpdateEvent({
      type: 'progress',
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    logLine(`[desktop] update downloaded: ${info.version}`);
    sendUpdateEvent({ type: 'downloaded', version: info.version });
  });
  autoUpdater.on('error', (err) => {
    logLine(`[desktop] updater error: ${err.message}`);
    sendUpdateEvent({ type: 'error', message: err.message });
  });
}

function isHttpUrl(url) {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Open http(s) in the OS browser. On Windows, resolve as soon as the detached
 * launcher starts: waiting for `cmd.exe /c start` to exit can block the renderer
 * IPC forever even though the dispatch URL was already built.
 */
async function openHttpInOsBrowser(url) {
  if (typeof url !== 'string' || !isHttpUrl(url)) {
    return { ok: false, reason: 'invalid_url' };
  }
  if (process.platform === 'win32') {
    try {
      const { spawn } = await import('node:child_process');
      await new Promise((resolve, reject) => {
        const child = spawn(
          'rundll32.exe',
          ['url.dll,FileProtocolHandler', url],
          {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
          },
        );
        child.once('error', reject);
        child.once('spawn', () => {
          child.unref();
          resolve();
        });
      });
      return { ok: true, via: 'windows_protocol_handler' };
    } catch (launchErr) {
      const launchMsg =
        launchErr instanceof Error ? launchErr.message : String(launchErr);
      logLine(`[desktop] Windows protocol handler failed: ${launchMsg}`);
      try {
        await shell.openExternal(url);
        return { ok: true, via: 'openExternal_fallback' };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logLine(`[desktop] openExternal failed: ${message}`);
        return { ok: false, reason: `${launchMsg}; ${message}` };
      }
    }
  }
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logLine(`[desktop] openExternal failed: ${message}`);
    return { ok: false, reason: message };
  }
}

function isAppUrl(url) {
  try {
    return new URL(url).origin === new URL(API_URL).origin;
  } catch {
    return false;
  }
}

async function restartCareerApiForPlayMode() {
  logLine('[desktop] restarting Career API for play mode…');
  killTree(apiChild);
  apiChild = null;
  await sleep(500);
  await startCareerApi();
  if (mainWindow && !mainWindow.isDestroyed()) {
    await mainWindow.loadURL(API_URL);
  }
}

/** Semver-ish compare for desktop x.y.z (+ optional prerelease ignored). */
function isNewerDesktopVersion(remote, local) {
  const parse = (raw) => {
    const core = String(raw ?? '')
      .trim()
      .replace(/^v/i, '')
      .split('-')[0]
      .split('+')[0];
    const parts = core.split('.').map((p) => Number.parseInt(p, 10));
    return [
      Number.isFinite(parts[0]) ? parts[0] : 0,
      Number.isFinite(parts[1]) ? parts[1] : 0,
      Number.isFinite(parts[2]) ? parts[2] : 0,
    ];
  };
  const a = parse(remote);
  const b = parse(local);
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

function resolveDownloadedInstallerPath() {
  if (typeof autoUpdater.installerPath === 'string' && autoUpdater.installerPath) {
    return autoUpdater.installerPath;
  }
  const helperFile = autoUpdater.downloadedUpdateHelper?.file;
  if (typeof helperFile === 'string' && helperFile) return helperFile;
  return null;
}

/**
 * Schedule NSIS Setup after this Electron process exits.
 * A bare `cmd ping & start` stays under Electron's Win32 Job Object — the
 * console flashes and dies with the app before Setup runs. Launch a temp VBS
 * via `wscript //B` + `cmd start` so the sleeper is outside the job (no window).
 */
function scheduleInstallerAfterQuit(installerPath) {
  const safePath = String(installerPath).replace(/"/g, '');
  const vbsPath = join(tmpdir(), `airframe-update-${Date.now()}.vbs`);
  // Sleep ~2.5s then Run Setup (1 = normal focus). Self-delete best-effort.
  const vbs = [
    'On Error Resume Next',
    'WScript.Sleep 2500',
    `CreateObject("WScript.Shell").Run """${safePath}""", 1, False`,
    `CreateObject("Scripting.FileSystemObject").DeleteFile WScript.ScriptFullName, True`,
    '',
  ].join('\r\n');
  writeFileSync(vbsPath, vbs, 'utf8');
  // `start` breaks away from Electron's job; //B = no script host UI.
  spawn(
    process.env.ComSpec || 'cmd.exe',
    [
      '/d',
      '/c',
      `start "" /b wscript.exe //B //Nologo "${vbsPath.replace(/"/g, '')}"`,
    ],
    {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    },
  ).unref();
}

function registerIpc() {
  ipcMain.handle('skyline:get-version', () => app.getVersion());

  ipcMain.handle('skyline:get-play-config', () => {
    const saved = readDesktopPlayConfig(desktopPlayConfigPath());
    const launch = resolveLaunchPlay();
    return {
      mode: launch.mode,
      savedMode: saved.mode ?? null,
      worldApiUrl:
        launch.worldApiUrl ||
        saved.worldApiUrl ||
        DEFAULT_WORLD_API_URL,
      envForced: launch.envForced,
      needsChoice: !launch.envForced && !saved.mode,
      defaultWorldApiUrl: DEFAULT_WORLD_API_URL,
      suggestedMpWorldApiUrl: PUBLIC_WORLD_API_URL,
    };
  });

  ipcMain.handle('skyline:set-play-mode', async (_event, payload) => {
    const launch = resolveLaunchPlay();
    if (launch.envForced) {
      return {
        ok: false,
        reason:
          'Play mode is fixed by CAREER_WORLD_API_URL in the process environment. Unset it to choose in the app.',
      };
    }
    const mode = payload?.mode === 'mp' ? 'mp' : payload?.mode === 'sp' ? 'sp' : null;
    if (!mode) {
      return { ok: false, reason: 'mode must be sp or mp' };
    }
    let worldApiUrl = DEFAULT_WORLD_API_URL;
    if (mode === 'mp') {
      try {
        worldApiUrl = normalizeWorldApiUrl(
          payload?.worldApiUrl || PUBLIC_WORLD_API_URL,
        );
      } catch (err) {
        return {
          ok: false,
          reason: err instanceof Error ? err.message : String(err),
        };
      }
      if (!worldApiUrl) {
        return { ok: false, reason: 'Multiplayer requires a world URL' };
      }
    }
    writeDesktopPlayConfig(desktopPlayConfigPath(), {
      mode,
      worldApiUrl: mode === 'mp' ? worldApiUrl : DEFAULT_WORLD_API_URL,
      chosenAtMs: Date.now(),
    });
    logLine(
      mode === 'mp'
        ? `[desktop] play mode=mp world=${worldApiUrl}`
        : '[desktop] play mode=sp',
    );
    try {
      await restartCareerApiForPlayMode();
      return { ok: true, mode, worldApiUrl: mode === 'mp' ? worldApiUrl : '' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logLine(`[desktop] play mode restart failed: ${message}`);
      return { ok: false, reason: message };
    }
  });

  ipcMain.handle('skyline:open-external', async (_event, url) =>
    openHttpInOsBrowser(url),
  );

  ipcMain.handle('skyline:check-updates', async () => {
    if (!isPackaged()) {
      return { ok: false, reason: 'dev' };
    }
    try {
      const current = app.getVersion();
      const result = await autoUpdater.checkForUpdates();
      const remote = result?.updateInfo?.version ?? null;
      const updateAvailable = Boolean(
        remote && isNewerDesktopVersion(remote, current),
      );
      const downloadedPath = resolveDownloadedInstallerPath();
      const downloadedReady = Boolean(
        updateAvailable && downloadedPath && (await pathExists(downloadedPath)),
      );
      logLine(
        `[desktop] check-updates current=${current} remote=${remote ?? 'null'} available=${updateAvailable} downloaded=${downloadedReady}`,
      );
      return {
        ok: true,
        version: remote,
        currentVersion: current,
        updateAvailable,
        downloaded: downloadedReady,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, reason: message };
    }
  });

  ipcMain.handle('skyline:download-update', async () => {
    if (!isPackaged()) return { ok: false, reason: 'dev' };
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, reason: message };
    }
  });

  ipcMain.handle('skyline:quit-and-install', async () => {
    if (!isPackaged()) return { ok: false, reason: 'dev' };

    // Unsigned NSIS: quitAndInstall() often dies behind SmartScreen with no UI.
    // Open the downloaded Setup so the user can click More info → Run anyway.
    const installerPath = resolveDownloadedInstallerPath();

    if (!installerPath || !(await pathExists(installerPath))) {
      return {
        ok: false,
        reason:
          'Downloaded installer not found. Use Check for updates → Download again, or install the Setup from GitHub Releases manually.',
      };
    }

    const choice = dialog.showMessageBoxSync({
      type: 'info',
      buttons: ['Update now', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      title: 'Install Airframe update',
      message: 'Windows may warn that the publisher is unknown.',
      detail:
        'Airframe will close first, then the installer opens after a short pause.\n\n' +
        'If Windows shows SmartScreen, choose More info → Run anyway.\n' +
        'Watch the installer progress — when it finishes, Airframe should reopen.\n' +
        'If it does not, open Airframe Career from the Start Menu.\n\n' +
        `Installer:\n${installerPath}`,
    });
    if (choice !== 0) return { ok: false, reason: 'cancelled' };

    shuttingDown = true;
    killTree(apiChild);
    killTree(hostChild);
    apiChild = null;
    hostChild = null;

    // Schedule Setup to start AFTER this process exits. Spawning immediately
    // raced NSIS ("Airframe Career is running — Click OK to close it").
    // Unsigned: still no /S (visible one-click + SmartScreen).
    logLine(
      `[desktop] scheduling update installer after quit: ${installerPath}`,
    );
    try {
      scheduleInstallerAfterQuit(installerPath);
    } catch (err) {
      logLine(
        `[desktop] schedule installer failed: ${err instanceof Error ? err.message : String(err)}; openPath fallback`,
      );
      const openErr = await shell.openPath(installerPath);
      if (openErr) {
        shuttingDown = false;
        return { ok: false, reason: openErr };
      }
    }

    for (const win of BrowserWindow.getAllWindows()) {
      try {
        win.destroy();
      } catch {
        /* ignore */
      }
    }
    app.quit();
    return { ok: true };
  });
}

async function startCareerApi() {
  const root = skylineRoot();
  const apiEntry = join(root, 'packages', 'career-ui', 'server', 'api.ts');
  if (!(await pathExists(apiEntry))) {
    throw new Error(`Career API entry missing: ${apiEntry}`);
  }

  // Prefer absolute tsx loader — packaged installs must ship node_modules/tsx.
  const tsxCandidates = [
    join(root, 'node_modules', 'tsx', 'dist', 'esm', 'index.mjs'),
    join(root, 'node_modules', 'tsx', 'esm.mjs'),
    join(root, 'node_modules', 'tsx', 'dist', 'loader.mjs'),
  ];
  let tsxLoader = '';
  for (const candidate of tsxCandidates) {
    if (await pathExists(candidate)) {
      tsxLoader = candidate;
      break;
    }
  }
  if (!tsxLoader) {
    throw new Error(
      `tsx runtime missing under ${join(root, 'node_modules', 'tsx')}. ` +
        'Reinstall Airframe Career (pack must include skyline/node_modules).',
    );
  }

  killListenersOnPort(API_PORT);
  await sleep(400);
  if (!(await portFree(API_PORT))) {
    killListenersOnPort(API_PORT);
    await sleep(600);
  }
  if (!(await portFree(API_PORT))) {
    const holder = killListenersOnPort(API_PORT).blockedBy ?? 'another process';
    throw new Error(
        `Port ${API_PORT} is already in use (${holder}). ` +
        `Stop the other listener or set CAREER_UI_API_PORT to a free port. ` +
        `Compose world-api uses :8787; this shell defaults to :8788. ` +
        `Skyline will not kill Docker/WSL processes.`,
    );
  }

  const logDir = join(app.getPath('userData'), 'logs');
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, 'career-api.log');
  const logStream = createWriteStream(logPath, { flags: 'a' });
  logStream.write(`\n==== API start ${new Date().toISOString()} ====\n`);
  logStream.write(`tsx=${tsxLoader}\napi=${apiEntry}\nroot=${root}\n`);

  const play = resolveLaunchPlay();
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    SKYLINE_REPO_ROOT: root,
    SKYLINE_CAREER_CONTENT: careerContentRoot(),
    SKYLINE_CAREER_DATA: careerDataRoot(),
    SKYLINE_UI_DIST: uiDistRoot(),
    CAREER_UI_API_PORT: String(API_PORT),
  };
  // Desktop shell defaults to :8788 (see API_PORT) so SP never collides with
  // compose world-api on :8787.
  if (play.worldApiUrl) {
    env.CAREER_API_MODE = process.env.CAREER_API_MODE?.trim() || 'gateway';
    env.CAREER_WORLD_API_URL = play.worldApiUrl;
    env.CAREER_AUTH = process.env.CAREER_AUTH ?? '0';
    env.CAREER_WORLD_FIXED = process.env.CAREER_WORLD_FIXED ?? '0';
    env.CAREER_HEADLESS_PULSE = '0';
  } else {
    delete env.CAREER_WORLD_API_URL;
    env.CAREER_API_MODE = 'full';
    // Before PlayModeGate choice, do not resume last SP save / catch-up —
    // that can block boot for minutes on a stale AppData profile.
    if (!play.mode) {
      env.CAREER_HEADLESS_PULSE = '0';
    }
  }

  if (play.worldApiUrl) {
    logLine(
      `[desktop] gateway → world ${play.worldApiUrl} (local API :${API_PORT}` +
        `${play.envForced ? ', env' : ', desktop-play.json'})`,
    );
  } else {
    logLine(
      `[desktop] local API :${API_PORT} SP` +
        `${play.mode ? '' : ' (play mode not chosen yet)'}`,
    );
  }

  const importSpec = pathToFileURL(tsxLoader).href;
  logLine(`[desktop] starting API via ELECTRON_RUN_AS_NODE + ${importSpec}`);
  apiChild = spawn(
    process.execPath,
    ['--import', importSpec, apiEntry],
    {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  apiChild.stdout?.pipe(logStream);
  apiChild.stderr?.pipe(logStream);
  apiChild.on('exit', (code) => {
    if (!shuttingDown) logLine(`[desktop] Career API exited (${code})`);
  });

  await waitForApi();
  logLine(`[desktop] Career API ready → ${API_URL}`);
}

async function startSimBridgeHost() {
  const dir = hostDir();
  const exe = join(dir, 'SimBridgeHost.exe');
  if (!(await pathExists(exe))) {
    logLine(`[desktop] SimBridgeHost not found at ${exe} — Watch offline`);
    return;
  }

  const logDir = join(app.getPath('userData'), 'logs');
  mkdirSync(logDir, { recursive: true });
  const hostLog = createWriteStream(join(logDir, 'simbridge-host.log'), {
    flags: 'a',
  });
  hostLog.write(`\n==== host start ${new Date().toISOString()} ====\n`);

  const args = ['--mode', 'simconnect'];
  const sdk =
    process.env.MSFS_SDK?.trim() ||
    ((await pathExists('C:\\MSFS 2024 SDK')) ? 'C:\\MSFS 2024 SDK' : '');
  if (sdk) args.push('--sdk', sdk);

  try {
    hostChild = spawn(exe, args, {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, ...(sdk ? { MSFS_SDK: sdk } : {}) },
    });
    hostChild.stdout?.pipe(hostLog);
    hostChild.stderr?.pipe(hostLog);
    hostChild.on('exit', (code) => {
      if (!shuttingDown) {
        logLine(`[desktop] SimBridgeHost exited (${code})`);
      }
    });
    logLine(`[desktop] SimBridgeHost started (${exe})`);
  } catch (err) {
    logLine(
      `[desktop] SimBridgeHost failed: ${err instanceof Error ? err.message : err}`,
    );
  }
}

async function createWindow() {
  const iconFile = join(__dirname, 'build', 'icon.ico');
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Airframe Career',
    backgroundColor: '#0f1419',
    autoHideMenuBar: true,
    icon: (await pathExists(iconFile)) ? iconFile : undefined,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Same reliable opener as IPC — do not use bare shell.openExternal on Windows.
    if (isHttpUrl(url)) void openHttpInOsBrowser(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    if (isHttpUrl(url)) void openHttpInOsBrowser(url);
  });

  await mainWindow.loadURL(API_URL);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  logLine('[desktop] shutdown');
  killTree(apiChild);
  killTree(hostChild);
  apiChild = null;
  hostChild = null;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.whenReady().then(() => {
    dialog.showErrorBox(
      'Airframe Career',
      'Airframe Career is already running (or a previous launch did not exit cleanly).\n\nClose it from Task Manager (Airframe Career / SimBridgeHost), then try again.',
    );
    app.quit();
  });
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  registerIpc();

  app.whenReady().then(async () => {
    const logDir = join(app.getPath('userData'), 'logs');
    mkdirSync(logDir, { recursive: true });
    desktopLogPath = join(logDir, 'desktop.log');
    logLine(
      `[desktop] ready packaged=${isPackaged()} version=${app.getVersion()} resources=${resourcesRoot()}`,
    );
    logLine(`[desktop] skylineRoot=${skylineRoot()}`);
    logLine(`[desktop] dataRoot=${careerDataRoot()}`);
    logLine(`[desktop] hostDir=${hostDir()}`);

    try {
      await startCareerApi();
      await startSimBridgeHost();
      await createWindow();

      if (isPackaged()) {
        wireAutoUpdater();
        // Silent boot check — UI shows banner / Settings card.
        setTimeout(() => {
          void autoUpdater.checkForUpdates().catch((err) => {
            logLine(
              `[desktop] boot update check failed: ${err instanceof Error ? err.message : err}`,
            );
          });
        }, 4_000);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logLine(`[desktop] startup failed: ${message}`);
      dialog.showErrorBox(
        'Airframe Career',
        `Failed to start.\n\n${message}\n\nSee logs under:\n${logDir}`,
      );
      shutdown();
      app.quit();
    }
  });

  app.on('window-all-closed', () => {
    shutdown();
    app.quit();
  });

  app.on('before-quit', () => {
    shutdown();
  });
}
