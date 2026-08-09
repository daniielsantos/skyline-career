/**
 * Skyline Career desktop shell (Electron).
 * Starts Career API (+ optional SimBridgeHost), then opens a BrowserWindow.
 * Auto-update via electron-updater → GitHub Releases (no code signing yet).
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
import { createWriteStream, appendFileSync, mkdirSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createConnection } from 'node:net';

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

// Branding: userData / Task Manager name (not scoped npm package name).
app.setName('Skyline Career');
Menu.setApplicationMenu(null);

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_PORT = Number(process.env.CAREER_UI_API_PORT ?? 8787);
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

function killPidTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
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

function killListenersOnPort(port) {
  if (process.platform !== 'win32') return;
  try {
    const out = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes(`:${port}`) || !line.includes('LISTENING')) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid) && pid !== '0' && Number(pid) !== process.pid) {
        pids.add(pid);
      }
    }
    for (const pid of pids) {
      logLine(`[desktop] freeing port ${port} (PID ${pid})`);
      killPidTree(Number(pid));
    }
  } catch {
    /* ignore */
  }
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
        killPidTree(child.pid);
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
    sendUpdateEvent({ type: 'not-available', version: info.version });
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

function registerIpc() {
  ipcMain.handle('skyline:get-version', () => app.getVersion());

  ipcMain.handle('skyline:check-updates', async () => {
    if (!isPackaged()) {
      return { ok: false, reason: 'dev' };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      return {
        ok: true,
        version: result?.updateInfo?.version ?? null,
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
    const installerPath =
      typeof autoUpdater.installerPath === 'string'
        ? autoUpdater.installerPath
        : autoUpdater.downloadedUpdateHelper?.file ?? null;

    if (!installerPath || !(await pathExists(installerPath))) {
      return {
        ok: false,
        reason:
          'Downloaded installer not found. Use Check for updates → Download again, or install the Setup from GitHub Releases manually.',
      };
    }

    const choice = dialog.showMessageBoxSync({
      type: 'info',
      buttons: ['Open installer', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      title: 'Install Skyline update',
      message: 'Windows may warn that the publisher is unknown.',
      detail:
        'On the next Windows dialog, choose More info → Run anyway.\n\n' +
        'Finish the installer, then open Skyline Career from the Start Menu.\n\n' +
        `Installer:\n${installerPath}`,
    });
    if (choice !== 0) return { ok: false, reason: 'cancelled' };

    shuttingDown = true;
    killTree(apiChild);
    killTree(hostChild);
    apiChild = null;
    hostChild = null;

    logLine(`[desktop] opening update installer: ${installerPath}`);
    const openErr = await shell.openPath(installerPath);
    if (openErr) {
      logLine(`[desktop] shell.openPath failed: ${openErr}; spawn fallback`);
      try {
        spawn(installerPath, [], {
          detached: true,
          stdio: 'ignore',
          windowsHide: false,
        }).unref();
      } catch (err) {
        shuttingDown = false;
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, reason: openErr || message };
      }
    }

    setTimeout(() => app.quit(), 800);
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
        'Reinstall Skyline Career (pack must include skyline/node_modules).',
    );
  }

  killListenersOnPort(API_PORT);
  await sleep(400);
  if (!(await portFree(API_PORT))) {
    killListenersOnPort(API_PORT);
    await sleep(600);
  }

  const logDir = join(app.getPath('userData'), 'logs');
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, 'career-api.log');
  const logStream = createWriteStream(logPath, { flags: 'a' });
  logStream.write(`\n==== API start ${new Date().toISOString()} ====\n`);
  logStream.write(`tsx=${tsxLoader}\napi=${apiEntry}\nroot=${root}\n`);

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    SKYLINE_REPO_ROOT: root,
    SKYLINE_CAREER_CONTENT: careerContentRoot(),
    SKYLINE_CAREER_DATA: careerDataRoot(),
    SKYLINE_UI_DIST: uiDistRoot(),
    CAREER_UI_API_PORT: String(API_PORT),
  };

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
    title: 'Skyline Career',
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
    void shell.openExternal(url);
    return { action: 'deny' };
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
      'Skyline Career',
      'Skyline Career is already running (or a previous launch did not exit cleanly).\n\nClose it from Task Manager (Skyline Career / SimBridgeHost), then try again.',
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
        'Skyline Career',
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
