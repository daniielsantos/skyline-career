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

/**
 * Phase B roles:
 * - all (default): API + Vite (today’s `career:ui`)
 * - host: world host only — API binds CAREER_UI_API_BIND (default 0.0.0.0)
 * - ui: Vite only — proxies /api to CAREER_UI_API_PROXY (default http://127.0.0.1:8787)
 */
const roleArg = process.argv.find((a) => a === '--host' || a === '--ui' || a === '--all');
const roleFromArg =
  roleArg === '--host' ? 'host' : roleArg === '--ui' ? 'ui' : roleArg === '--all' ? 'all' : null;
const role = (
  roleFromArg ??
  (process.env.CAREER_DEV_ROLE ?? 'all').trim().toLowerCase()
);
const isHostOnly = role === 'host' || role === 'api';
const isUiOnly = role === 'ui' || role === 'client';

const apiProxyTarget = (
  process.env.CAREER_UI_API_PROXY ??
  process.env.CAREER_REMOTE_WORLD_URL ??
  `http://127.0.0.1:${apiPort}`
)
  .trim()
  .replace(/\/+$/, '');

if (isHostOnly && !process.env.CAREER_UI_API_BIND) {
  process.env.CAREER_UI_API_BIND = '0.0.0.0';
}
// Host playtest: account→company (opt out with CAREER_AUTH=0).
if (isHostOnly && process.env.CAREER_AUTH == null) {
  process.env.CAREER_AUTH = '1';
}
// Host playtest: one open world for all clients (opt out with CAREER_WORLD_FIXED=0).
if (isHostOnly && process.env.CAREER_WORLD_FIXED == null) {
  process.env.CAREER_WORLD_FIXED = '1';
}

const { NPCS_PER_REGION } = await import('@msfs-compat/shared');

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

function apiHealthUrl() {
  if (isUiOnly) {
    try {
      const u = new URL('/api/health', apiProxyTarget);
      return u.href;
    } catch {
      return `http://127.0.0.1:${apiPort}/api/health`;
    }
  }
  return `http://127.0.0.1:${apiPort}/api/health`;
}

async function apiHealth() {
  try {
    const res = await fetch(apiHealthUrl(), {
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

async function waitForApiReady(opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const intervalMs = opts.intervalMs ?? 250;
  const shouldAbort = opts.shouldAbort ?? (() => false);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (shouldAbort()) return null;
    const h = await apiHealth();
    if (h?.ok === true) return h;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

const kids = [];

console.log(
  `[career] dev role=${isHostOnly ? 'host' : isUiOnly ? 'ui' : 'all'}` +
    (isUiOnly ? ` proxy→${apiProxyTarget}` : '') +
    (isHostOnly
      ? ` bind=${process.env.CAREER_UI_API_BIND ?? '0.0.0.0'}`
      : ''),
);

if (!isUiOnly) {
  const health = await apiHealth();
  const sourceStamp = await serverSourceStamp();
  const apiIsCurrent =
    health?.ok === true &&
    (health?.needsProfile === true ||
      (typeof health?.npcFleetTarget === 'number' && health.npcFleetTarget > 0)) &&
    health?.sourceStamp === sourceStamp;

  if (apiIsCurrent) {
    console.log(
      `Career API already running at http://127.0.0.1:${apiPort} (npcFleetTarget=${health.npcFleetTarget}, ${NPCS_PER_REGION}/region)`,
    );
  } else {
    if (health?.ok) {
      console.log(
        `Career API on :${apiPort} is stale (server sources changed since it booted) — restarting`,
      );
    } else {
      console.log(`Starting Career API on :${apiPort}…`);
    }
    killListenersOnPort(apiPort);
    // Brief pause so Windows releases the port.
    await new Promise((r) => setTimeout(r, 400));
    const apiChild = spawn(
      process.execPath,
      ['--import', 'tsx', join(root, 'server', 'api.ts')],
      {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env },
      },
    );
    kids.push(apiChild);
    let apiExit = null;
    apiChild.once('exit', (code, signal) => {
      apiExit = { code, signal };
    });
    const ready = await waitForApiReady({
      shouldAbort: () => apiExit != null,
    });
    if (!ready) {
      if (apiExit) {
        console.error(
          `Career API exited before ready (code=${apiExit.code ?? 'null'} signal=${apiExit.signal ?? 'null'})`,
        );
      } else {
        console.error(
          `Career API failed to become ready on http://127.0.0.1:${apiPort} within 60s.`,
        );
      }
      console.error(
        'Check the stack above (often SQLite migrate / profiles/career). Then re-run npm run career:ui',
      );
      for (const kid of kids) {
        try {
          kid.kill('SIGTERM');
        } catch {
          /* ignore */
        }
      }
      process.exit(1);
    }
    const readyHealth = await apiHealth();
    console.log(
      `Career API ready at http://127.0.0.1:${apiPort} (npcFleetTarget=${readyHealth?.npcFleetTarget ?? '?'}, ${NPCS_PER_REGION}/region)`,
    );
    if (isHostOnly) {
      console.log(
        `[career] host mode — open clients with: npm run career:client` +
          ` (or CAREER_UI_API_PROXY=http://<this-lan-ip>:${apiPort})`,
      );
    }
  }
} else {
  const remote = await waitForApiReady({ timeoutMs: 5_000 });
  if (!remote) {
    console.error(
      `[career] ui mode: no Career API at ${apiProxyTarget}/api/health — start host first (npm run career:host)`,
    );
    process.exit(1);
  }
  console.log(
    `Using remote Career API at ${apiProxyTarget} (npcFleetTarget=${remote.npcFleetTarget ?? '?'})`,
  );
}

if (!isHostOnly) {
  if (await hasCareerUi()) {
    console.log(`Career UI already running at http://localhost:${uiPort}`);
  } else {
    kids.push(
      spawn(
        process.execPath,
        [viteBin, '--port', String(uiPort), '--strictPort'],
        {
          cwd: root,
          stdio: 'inherit',
          env: {
            ...process.env,
            CAREER_UI_API_PROXY: apiProxyTarget,
          },
        },
      ),
    );
  }
} else {
  console.log('[career] host mode — Vite UI not started');
}

function shutdown() {
  for (const kid of kids) {
    kid.kill('SIGTERM');
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Host-only: keep the parent alive while the API child runs.
if (isHostOnly && kids.length > 0) {
  for (const kid of kids) {
    kid.on('exit', (code) => {
      process.exit(code ?? 0);
    });
  }
}
