import { spawn, execSync } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const vitePackage = require.resolve('vite/package.json');
const viteBin = join(dirname(vitePackage), 'bin', 'vite.js');
const apiPort = Number(process.env.CAREER_UI_API_PORT ?? 8787);
const uiPort = Number(process.env.CAREER_UI_PORT ?? 5173);

const { NPC_FLEET_SIZE } = await import('@msfs-compat/shared');

function killListenersOnPort(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano', { encoding: 'utf8' });
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes(`:${port}`) || !line.includes('LISTENING')) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
          console.log(`Stopped stale process PID ${pid} on port ${port}`);
        } catch {
          /* already gone */
        }
      }
      return;
    }
    try {
      const out = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, {
        encoding: 'utf8',
      });
      for (const pid of out.split(/\s+/).filter(Boolean)) {
        try {
          process.kill(Number(pid), 'SIGTERM');
          console.log(`Stopped stale process PID ${pid} on port ${port}`);
        } catch {
          /* already gone */
        }
      }
    } catch {
      /* nothing listening */
    }
  } catch {
    /* ignore */
  }
}

async function apiHealth() {
  try {
    const res = await fetch(`http://127.0.0.1:${apiPort}/api/health`, {
      signal: AbortSignal.timeout(800),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Must match `serverSourceStamp` in api.ts. */
async function serverSourceStamp() {
  const dir = join(root, 'server');
  const files = await readdir(dir);
  let newest = 0;
  for (const file of files) {
    if (!file.endsWith('.ts') && !file.endsWith('.mjs')) continue;
    const info = await stat(join(dir, file));
    newest = Math.max(newest, Math.floor(info.mtimeMs));
  }
  // Agent SimBrief fetch/dispatch is imported by server — must restart when it changes.
  const agentOfp = join(root, '..', 'agent', 'src', 'ofp-compliance');
  try {
    for (const file of await readdir(agentOfp)) {
      if (!file.endsWith('.ts')) continue;
      const info = await stat(join(agentOfp, file));
      newest = Math.max(newest, Math.floor(info.mtimeMs));
    }
  } catch {
    /* agent path missing */
  }
  // The API serves shared logic from its build output, so a rebuilt shared
  // package must also invalidate a running server.
  const sharedDist = join(root, '..', 'shared', 'dist');
  try {
    for (const file of await readdir(sharedDist)) {
      if (!file.endsWith('.js')) continue;
      const info = await stat(join(sharedDist, file));
      newest = Math.max(newest, Math.floor(info.mtimeMs));
    }
  } catch {
    /* shared not built yet */
  }
  // Homologation updates this catalog without touching server/*.ts.
  const playerAirframeCatalog = join(
    root,
    '..',
    'shared',
    'src',
    'data',
    'career-player-airframes.json',
  );
  try {
    const info = await stat(playerAirframeCatalog);
    newest = Math.max(newest, Math.floor(info.mtimeMs));
  } catch {
    /* catalog not built yet */
  }
  return newest;
}

async function hasCareerUi() {
  try {
    const res = await fetch(`http://localhost:${uiPort}/`, {
      signal: AbortSignal.timeout(800),
    });
    if (!res.ok) return false;
    const html = await res.text();
    return html.includes('<title>Skyline Career</title>');
  } catch {
    return false;
  }
}

const kids = [];

const health = await apiHealth();
const sourceStamp = await serverSourceStamp();
const apiIsCurrent =
  health?.ok === true &&
  health?.npcFleetTarget === NPC_FLEET_SIZE &&
  health?.sourceStamp === sourceStamp;

if (apiIsCurrent) {
  console.log(
    `Career API already running at http://127.0.0.1:${apiPort} (npcFleetTarget=${NPC_FLEET_SIZE})`,
  );
} else {
  if (health?.ok) {
    const reason =
      health.npcFleetTarget !== NPC_FLEET_SIZE
        ? `npcFleetTarget=${health.npcFleetTarget ?? 'missing'}, want ${NPC_FLEET_SIZE}`
        : `server sources changed since it booted`;
    console.log(`Career API on :${apiPort} is stale (${reason}) — restarting`);
  }
  killListenersOnPort(apiPort);
  // Brief pause so Windows releases the port.
  await new Promise((r) => setTimeout(r, 400));
  kids.push(
    spawn(process.execPath, ['--import', 'tsx', join(root, 'server', 'api.ts')], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env },
    }),
  );
}

if (await hasCareerUi()) {
  console.log(`Career UI already running at http://localhost:${uiPort}`);
} else {
  kids.push(
    spawn(process.execPath, [viteBin, '--port', String(uiPort), '--strictPort'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env },
    }),
  );
}

function shutdown() {
  for (const kid of kids) {
    kid.kill('SIGTERM');
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
