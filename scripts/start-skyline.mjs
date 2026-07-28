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
import { spawn } from 'node:child_process';
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
    shell: opts.shell ?? false,
    env: opts.env ?? process.env,
  });

  const prefix = (stream) => (chunk) => {
    const text = String(chunk).replace(/\r?\n$/, '');
    for (const line of text.split(/\r?\n/)) {
      if (line.length) console.log(`[${label}] ${line}`);
    }
  };
  child.stdout?.on('data', prefix('out'));
  child.stderr?.on('data', prefix('err'));
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
  const sdk =
    flag(args, '--sdk') ?? process.env.MSFS_SDK ?? 'C:\\MSFS 2024 SDK';
  const catalogOnly = has(args, '--catalog-only');
  const noCatalog = has(args, '--no-catalog');
  const children = [];

  const shutdown = () => {
    for (const child of children) {
      try {
        child.kill();
      } catch {
        // ignore
      }
    }
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

  console.log('=== Skyline Career — local stack ===');
  console.log(`root: ${root}`);
  console.log(`catalog: ${noCatalog ? 'off' : `http://localhost:${port}`}`);
  console.log(`host: ${catalogOnly ? 'off' : mode} (pipe=${pipeName})`);
  console.log('Ctrl+C to stop all');
  console.log('');

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
      const project = resolve(root, 'native/SimBridgeHost/SimBridgeHost.csproj');

      if (await pathExists(bundledHost)) {
        children.push(
          spawnLogged('host', bundledHost, ['--mode', 'simconnect', '--sdk', sdk, '--pipe', pipeName]),
        );
      } else if (await pathExists(project)) {
        children.push(
          spawnLogged(
            'host',
            'dotnet',
            [
              'run',
              '--project',
              project,
              '-c',
              'Release',
              '--',
              '--mode',
              'simconnect',
              '--sdk',
              sdk,
              '--pipe',
              pipeName,
            ],
            { shell: true },
          ),
        );
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
