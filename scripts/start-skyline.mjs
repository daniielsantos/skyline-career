#!/usr/bin/env node
/**
 * Unified local stack: catalog-api + SimBridgeHost (simconnect or mock).
 *
 * Usage:
 *   node scripts/start-skyline.mjs
 *   node scripts/start-skyline.mjs --mode mock
 *   node scripts/start-skyline.mjs --mode simconnect --sdk "C:\\MSFS 2024 SDK"
 *   node scripts/start-skyline.mjs --catalog-only
 *   node scripts/start-skyline.mjs --no-catalog --mode mock
 */
import { spawn, execFileSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function flag(args, name) {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

function has(args, name) {
  return args.includes(name);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pathExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Kill a PID and its descendants (Windows orphans `dotnet run` → SimBridgeHost). */
function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } catch {
      // already gone
    }
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // ignore
    }
  }
}

/**
 * Reap leftover SimBridgeHost.exe from previous Ctrl+C that didn't tear down the tree.
 * Safe: only targets this project's host binary name.
 */
function killStaleSimBridgeHosts() {
  if (process.platform !== 'win32') return 0;
  try {
    const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq SimBridgeHost.exe', '/FO', 'CSV', '/NH'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    const lines = out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('INFO:'));
    if (lines.length === 0) return 0;
    execFileSync('taskkill', ['/IM', 'SimBridgeHost.exe', '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return lines.length;
  } catch {
    return 0;
  }
}

async function waitHttp(url, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitPipe(pipeName, attempts = 60) {
  const pipePath = pipeName.startsWith('\\\\.\\pipe\\') ? pipeName : `\\\\.\\pipe\\${pipeName}`;
  for (let i = 0; i < attempts; i++) {
    const ok = await new Promise((resolvePromise) => {
      const socket = createConnection(pipePath);
      const timer = setTimeout(() => {
        socket.destroy();
        resolvePromise(false);
      }, 400);
      socket.once('connect', () => {
        clearTimeout(timer);
        socket.end();
        resolvePromise(true);
      });
      socket.once('error', () => {
        clearTimeout(timer);
        resolvePromise(false);
      });
    });
    if (ok) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for pipe ${pipePath}`);
}

function spawnLogged(label, command, args, opts = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: false,
    env: opts.env ?? process.env,
  });

  const prefix = () => (chunk) => {
    const text = String(chunk).replace(/\r?\n$/, '');
    for (const line of text.split(/\r?\n/)) {
      if (line.length) console.log(`[${label}] ${line}`);
    }
  };
  child.stdout?.on('data', prefix());
  child.stderr?.on('data', prefix());
  child.on('exit', (code, signal) => {
    console.log(`[${label}] exited code=${code} signal=${signal ?? ''}`);
  });
  return child;
}

async function main() {
  const args = process.argv.slice(2);
  const port = flag(args, '--port') ?? process.env.PORT ?? '8080';
  const pipeName = flag(args, '--pipe') ?? process.env.MSFS_COMPAT_PIPE ?? 'msfs-compat-simbridge';
  const mode = flag(args, '--mode') ?? process.env.MSFS_COMPAT_HOST_MODE ?? 'simconnect';
  const sdk = flag(args, '--sdk') ?? process.env.MSFS_SDK ?? 'C:\\MSFS 2024 SDK';
  const catalogOnly = has(args, '--catalog-only');
  const noCatalog = has(args, '--no-catalog');
  const children = [];
  let shuttingDown = false;

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) {
      killProcessTree(child.pid);
    }
    // Belt-and-suspenders: reap any host that escaped the tree (dotnet run orphans).
    killStaleSimBridgeHosts();
  };

  process.on('SIGINT', () => {
    console.log('\n[skyline] shutting down...');
    shutdown();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    shutdown();
    process.exit(0);
  });
  process.on('exit', () => {
    shutdown();
  });

  console.log('=== Skyline Career — local stack ===');
  console.log(`root: ${root}`);
  console.log(`catalog: ${noCatalog ? 'off' : `http://localhost:${port}`}`);
  console.log(`host: ${catalogOnly ? 'off' : mode} (pipe=${pipeName})`);
  console.log('Ctrl+C to stop all');
  console.log('');

  if (!catalogOnly && mode === 'simconnect') {
    const n = killStaleSimBridgeHosts();
    if (n > 0) {
      console.log(`[skyline] cleared ${n} leftover SimBridgeHost process(es)`);
      await sleep(500);
    }
  }

  if (!noCatalog) {
    const catalogCli = resolve(root, 'packages/catalog-api/dist/cli.js');
    if (!(await pathExists(catalogCli))) {
      throw new Error('catalog-api not built — run: npm run build');
    }
    children.push(
      spawnLogged('catalog', process.execPath, [catalogCli], {
        env: {
          ...process.env,
          PORT: String(port),
          PROFILES_DIR: process.env.PROFILES_DIR ?? resolve(root, 'profiles/examples'),
          DATA_DIR: process.env.DATA_DIR ?? resolve(root, '.data/catalog'),
          PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}/v1`,
        },
      }),
    );
    await waitHttp(`http://127.0.0.1:${port}/health`);
    console.log(`[skyline] catalog ready → http://localhost:${port}/health`);
  }

  if (!catalogOnly) {
    if (mode === 'mock') {
      const mockHost = resolve(root, 'packages/agent/dist/mock-host.js');
      if (!(await pathExists(mockHost))) {
        throw new Error('agent mock-host not built — run: npm run build');
      }
      children.push(spawnLogged('host', process.execPath, [mockHost, '--pipe', pipeName]));
    } else if (mode === 'simconnect') {
      const bundledHost = resolve(root, 'host', 'SimBridgeHost.exe');
      const releaseHost = resolve(
        root,
        'native/SimBridgeHost/bin/Release/net8.0-windows/SimBridgeHost.exe',
      );
      const project = resolve(root, 'native/SimBridgeHost/SimBridgeHost.csproj');
      const hostArgs = ['--mode', 'simconnect', '--sdk', sdk, '--pipe', pipeName];

      // Prefer a built exe over `dotnet run` — avoids rebuild file locks and orphan trees.
      if (await pathExists(bundledHost)) {
        children.push(spawnLogged('host', bundledHost, hostArgs));
      } else if (await pathExists(releaseHost)) {
        children.push(spawnLogged('host', releaseHost, hostArgs));
      } else if (await pathExists(project)) {
        console.log('[skyline] building SimBridgeHost (first run)...');
        execFileSync('dotnet', ['build', project, '-c', 'Release', '--nologo', '-v', 'q'], {
          cwd: root,
          stdio: 'inherit',
          windowsHide: true,
        });
        if (!(await pathExists(releaseHost))) {
          throw new Error(`Build succeeded but exe missing: ${releaseHost}`);
        }
        children.push(spawnLogged('host', releaseHost, hostArgs));
      } else {
        throw new Error(
          'No SimBridgeHost found (expected host/SimBridgeHost.exe or native project). Use --mode mock.',
        );
      }
    } else {
      throw new Error(`Unknown --mode ${mode} (use mock|simconnect)`);
    }

    await waitPipe(pipeName);
    console.log(`[skyline] host ready → \\\\.\\pipe\\${pipeName}`);
  }

  console.log('');
  console.log('Next (other terminal):');
  console.log('  node packages/agent/dist/cli.js fingerprint --register');
  console.log('  node packages/agent/dist/cli.js resolve');
  console.log('  node packages/agent/dist/cli.js apply-auto --fuel-left 20 --fuel-right 20');
  console.log('');

  // Keep alive until a child dies
  await new Promise((resolvePromise) => {
    for (const child of children) {
      child.on('exit', () => resolvePromise(undefined));
    }
  });
  shutdown();
}

main().catch((err) => {
  console.error('[skyline] FAILED', err instanceof Error ? err.message : err);
  process.exit(1);
});
