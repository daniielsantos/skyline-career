/**
 * Skyline Career desktop shell (Electron).
 * Starts Career API (+ optional SimBridgeHost), then opens a BrowserWindow.
 */
import { app, BrowserWindow, dialog, shell } from 'electron';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWriteStream } from 'node:fs';

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

function isPackaged() {
  return app.isPackaged;
}

function resourcesRoot() {
  return isPackaged() ? process.resourcesPath : join(__dirname, '..', '..');
}

/** Read-only app payload (packages + seed profiles). */
function skylineRoot() {
  if (isPackaged()) {
    return join(resourcesRoot(), 'skyline');
  }
  // Dev: repo root
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

async function waitForApi(timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (apiChild && apiChild.exitCode != null) {
      throw new Error(
        `Career API exited early (code ${apiChild.exitCode})`,
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
  if (!child?.pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    /* ignore */
  }
}

async function startCareerApi() {
  const root = skylineRoot();
  const apiEntry = join(root, 'packages', 'career-ui', 'server', 'api.ts');
  if (!(await pathExists(apiEntry))) {
    throw new Error(`Career API entry missing: ${apiEntry}`);
  }

  const logDir = join(app.getPath('userData'), 'logs');
  await import('node:fs/promises').then((fs) =>
    fs.mkdir(logDir, { recursive: true }),
  );
  const logPath = join(logDir, 'career-api.log');
  const logStream = createWriteStream(logPath, { flags: 'a' });

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    SKYLINE_REPO_ROOT: root,
    SKYLINE_CAREER_CONTENT: careerContentRoot(),
    SKYLINE_CAREER_DATA: careerDataRoot(),
    SKYLINE_UI_DIST: uiDistRoot(),
    CAREER_UI_API_PORT: String(API_PORT),
  };

  // Use Electron's Node (Node 22+ in Electron 35) so node:sqlite works.
  apiChild = spawn(
    process.execPath,
    ['--import', 'tsx', apiEntry],
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
    if (!shuttingDown) {
      console.error(`[desktop] Career API exited (${code})`);
    }
  });

  await waitForApi();
  console.log(`[desktop] Career API ready → ${API_URL}`);
}

async function startSimBridgeHost() {
  const dir = hostDir();
  const exe = join(dir, 'SimBridgeHost.exe');
  if (!(await pathExists(exe))) {
    console.warn(`[desktop] SimBridgeHost not found at ${exe} — Watch offline`);
    return;
  }
  try {
    hostChild = spawn(exe, ['--mode', 'simconnect'], {
      cwd: dir,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env },
    });
    hostChild.on('exit', (code) => {
      if (!shuttingDown) {
        console.warn(`[desktop] SimBridgeHost exited (${code})`);
      }
    });
    console.log('[desktop] SimBridgeHost started');
  } catch (err) {
    console.warn(
      '[desktop] SimBridgeHost failed to start:',
      err instanceof Error ? err.message : err,
    );
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Skyline Career',
    backgroundColor: '#0f1419',
    webPreferences: {
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
  killTree(apiChild);
  killTree(hostChild);
  apiChild = null;
  hostChild = null;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      await startCareerApi();
      await startSimBridgeHost();
      await createWindow();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[desktop] startup failed:', message);
      dialog.showErrorBox(
        'Skyline Career',
        `Failed to start.\n\n${message}\n\nSee logs under:\n${join(app.getPath('userData'), 'logs')}`,
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
